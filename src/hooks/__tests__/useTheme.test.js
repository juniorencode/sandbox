/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTheme } from '../useTheme.hook.js';

/** jsdom has no matchMedia, so the OS preference is supplied here. */
const mockSystem = appearance => {
  const listeners = new Set();
  const media = {
    matches: appearance === 'light',
    addEventListener: (_type, handler) => listeners.add(handler),
    removeEventListener: (_type, handler) => listeners.delete(handler)
  };
  vi.stubGlobal('matchMedia', () => media);
  return {
    change: next => {
      media.matches = next === 'light';
      listeners.forEach(handler => handler({ matches: media.matches }));
    },
    listenerCount: () => listeners.size
  };
};

describe('useTheme', () => {
  beforeEach(() => delete document.documentElement.dataset.theme);
  afterEach(() => vi.unstubAllGlobals());

  it('follows the operating system when the preference is system', () => {
    mockSystem('light');
    const { result } = renderHook(() => useTheme('system'));
    expect(result.current).toBe('light');
  });

  it('leaves the root attribute off for system', () => {
    // Absence is what lets the media query in index.css decide, so a later OS
    // change needs no work from the app.
    mockSystem('dark');
    renderHook(() => useTheme('system'));
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('stamps an explicit choice on the root element', () => {
    mockSystem('dark');
    renderHook(() => useTheme('light'));
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('lets an explicit choice win over the operating system', () => {
    // Both directions matter: dark-on-light OS and light-on-dark OS.
    mockSystem('light');
    expect(renderHook(() => useTheme('dark')).result.current).toBe('dark');
    mockSystem('dark');
    expect(renderHook(() => useTheme('light')).result.current).toBe('light');
  });

  it('reacts to the operating system changing under system', () => {
    const system = mockSystem('dark');
    const { result, rerender } = renderHook(() => useTheme('system'));
    expect(result.current).toBe('dark');
    system.change('light');
    rerender();
    expect(result.current).toBe('light');
  });

  it('clears the attribute when going back to system', () => {
    mockSystem('dark');
    const { rerender } = renderHook(({ preference }) => useTheme(preference), {
      initialProps: { preference: 'light' }
    });
    expect(document.documentElement.dataset.theme).toBe('light');
    rerender({ preference: 'system' });
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it('stops listening when unmounted', () => {
    const system = mockSystem('dark');
    const { unmount } = renderHook(() => useTheme('system'));
    expect(system.listenerCount()).toBe(1);
    unmount();
    expect(system.listenerCount()).toBe(0);
  });

  it('defaults to dark where matchMedia is unavailable', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(renderHook(() => useTheme('system')).result.current).toBe('dark');
  });
});
