/**
 * @vitest-environment jsdom
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspace } from '../useWorkspace.hook.js';

// No preload bridge exists in jsdom, so the platform adapter falls back to
// localStorage. That is the same path `npm run dev` takes.
const BROWSER_KEY = 'sandbox:workspace';

const seed = workspace =>
  localStorage.setItem(BROWSER_KEY, JSON.stringify(workspace));

const mount = async () => {
  const view = renderHook(() => useWorkspace());
  await waitFor(() => expect(view.result.current.loaded).toBe(true));
  return view;
};

const tab = (id, extra = {}) => ({
  id,
  name: `Tab ${id}`,
  code: '',
  path: null,
  ...extra
});

describe('useWorkspace', () => {
  beforeEach(() => localStorage.clear());

  it('starts with a single empty tab when nothing is stored', async () => {
    const { result } = await mount();
    expect(result.current.tabs).toHaveLength(1);
    expect(result.current.activeTabId).toBe(result.current.tabs[0].id);
  });

  it('recovers from a stored workspace that is not usable', async () => {
    // Corrupt storage used to crash the initial render: the parse ran inline
    // in useState with no guard.
    localStorage.setItem(BROWSER_KEY, '{ this is not json');
    const { result } = await mount();
    expect(result.current.tabs).toHaveLength(1);
  });

  it('repairs an activeTab that points at a tab that is gone', async () => {
    // This left the editor apparently read-only: the value fell back to '' and
    // the controlled component reverted every keystroke.
    seed({ tabs: [tab(3), tab(4)], activeTab: 99 });
    const { result } = await mount();
    expect(result.current.activeTabId).toBe(3);
    expect(result.current.activeTab.id).toBe(3);
  });

  it('fills in missing fields rather than rendering a broken tab', async () => {
    seed({ tabs: [{ code: 'x' }, { id: 7, name: 'kept' }], activeTab: 7 });
    const { result } = await mount();
    expect(result.current.tabs[0]).toMatchObject({ id: 1, name: 'Tab 1' });
    expect(result.current.tabs[1]).toMatchObject({ id: 7, name: 'kept', code: '' });
  });

  describe('closeTab', () => {
    it('selects the neighbour, not the first tab', async () => {
      seed({ tabs: [tab(1), tab(2), tab(3)], activeTab: 2 });
      const { result } = await mount();
      act(() => result.current.closeTab(2));
      expect(result.current.tabs.map(t => t.id)).toEqual([1, 3]);
      expect(result.current.activeTabId).toBe(3);
    });

    it('falls back to the last tab when closing the last one', async () => {
      seed({ tabs: [tab(1), tab(2)], activeTab: 2 });
      const { result } = await mount();
      act(() => result.current.closeTab(2));
      expect(result.current.activeTabId).toBe(1);
    });

    it('keeps the selection when closing a different tab', async () => {
      seed({ tabs: [tab(1), tab(2), tab(3)], activeTab: 3 });
      const { result } = await mount();
      act(() => result.current.closeTab(1));
      expect(result.current.activeTabId).toBe(3);
    });

    it('replaces the only tab with an empty one instead of refusing', async () => {
      seed({ tabs: [tab(1, { code: 'old' })], activeTab: 1 });
      const { result } = await mount();
      act(() => result.current.closeTab(1));
      expect(result.current.tabs).toHaveLength(1);
      expect(result.current.tabs[0].code).toBe('');
    });
  });

  describe('addTab', () => {
    it('reuses the lowest free id and activates the new tab', async () => {
      seed({ tabs: [tab(1), tab(3)], activeTab: 1 });
      const { result } = await mount();
      act(() => result.current.addTab());
      expect(result.current.tabs.map(t => t.id)).toEqual([1, 3, 2]);
      expect(result.current.activeTabId).toBe(2);
    });

    it('accepts an initial name and code, as opening a file needs', async () => {
      const { result } = await mount();
      act(() => result.current.addTab({ name: 'sums.js', code: '1+1' }));
      expect(result.current.activeTab).toMatchObject({
        name: 'sums.js',
        code: '1+1'
      });
    });
  });

  describe('renameTab', () => {
    it('renames and trims', async () => {
      const { result } = await mount();
      act(() => result.current.renameTab(1, '  scratch  '));
      expect(result.current.tabs[0].name).toBe('scratch');
    });

    it('ignores an empty name rather than leaving a nameless tab', async () => {
      const { result } = await mount();
      act(() => result.current.renameTab(1, '   '));
      expect(result.current.tabs[0].name).toBe('Tab 1');
    });
  });

  describe('moveTab', () => {
    it('reorders', async () => {
      seed({ tabs: [tab(1), tab(2), tab(3)], activeTab: 1 });
      const { result } = await mount();
      act(() => result.current.moveTab(1, 2));
      expect(result.current.tabs.map(t => t.id)).toEqual([2, 3, 1]);
    });

    it('clamps an out-of-range target', async () => {
      seed({ tabs: [tab(1), tab(2)], activeTab: 1 });
      const { result } = await mount();
      act(() => result.current.moveTab(1, 99));
      expect(result.current.tabs.map(t => t.id)).toEqual([2, 1]);
    });

    it('does nothing for an unknown tab', async () => {
      seed({ tabs: [tab(1), tab(2)], activeTab: 1 });
      const { result } = await mount();
      act(() => result.current.moveTab(42, 0));
      expect(result.current.tabs.map(t => t.id)).toEqual([1, 2]);
    });
  });

  it('persists the workspace after the debounce', async () => {
    const { result } = await mount();
    act(() => result.current.updateCode(1, 'console.log(1)'));
    await waitFor(
      () => {
        const stored = JSON.parse(localStorage.getItem(BROWSER_KEY));
        expect(stored.tabs[0].code).toBe('console.log(1)');
      },
      { timeout: 2000 }
    );
  });

  it('migrates a 1.x workspace and only then drops the old keys', async () => {
    // 1.x stored tabs and the active id under two separate keys.
    localStorage.setItem(
      'data',
      JSON.stringify([tab(1, { code: 'legacy' }), tab(2)])
    );
    localStorage.setItem('activeTab', '2');

    const { result } = await mount();
    expect(result.current.tabs[0].code).toBe('legacy');
    expect(result.current.activeTabId).toBe(2);

    await waitFor(
      () => {
        expect(localStorage.getItem(BROWSER_KEY)).toBeTruthy();
        expect(localStorage.getItem('data')).toBeNull();
        expect(localStorage.getItem('activeTab')).toBeNull();
      },
      { timeout: 2000 }
    );
  });

  it('merges stored settings over the defaults', async () => {
    seed({ tabs: [tab(1)], activeTab: 1, settings: { autoRun: false } });
    const { result } = await mount();
    expect(result.current.settings.autoRun).toBe(false);
    expect(result.current.settings.editorSeparator).toBe(60);

    act(() => result.current.updateSettings({ editorSeparator: 40 }));
    expect(result.current.settings.editorSeparator).toBe(40);
  });
});
