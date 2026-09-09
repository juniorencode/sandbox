import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { workspace as store } from '../platform';

/**
 * The workspace: tabs, which one is active, and the settings that persist.
 *
 * State used to live in three separate localStorage keys read inline in
 * useState, with no guards, and every tab operation was spread across the
 * components that happened to need it. Pulling it together here fixes several
 * defects that came from that split:
 *
 *   - Closing a tab always jumped to the first one rather than a neighbour,
 *     and the last tab could not be closed at all.
 *   - Tabs could not be renamed even though `name` was already stored, and
 *     could not be reordered.
 *   - An activeTab pointing at a tab that no longer existed left the editor
 *     apparently read-only: the value fell back to '' and the controlled
 *     component reverted every keystroke.
 */

const PERSIST_DEBOUNCE_MS = 400;

export const DEFAULT_SETTINGS = {
  editorSeparator: 60,
  layout: 'horizontal',
  autoRun: true,
  // Previously hardcoded in App; once code makes requests, being able to
  // lengthen or disable this matters.
  runDebounceMs: 200,
  timeoutMs: 5000,
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
  // Serialisation budget, surfaced because a deep object is exactly when the
  // default stops being enough.
  maxDepth: 5,
  maxItems: 100,
  // Whether a package that is not cached yet may be downloaded. Cached
  // packages always load, so turning this off does not break existing code.
  allowModuleDownloads: true
};

const LANGUAGES = ['javascript', 'jsx', 'typescript', 'tsx'];

/** Guessed from the extension when a real file is opened. */
export const languageForName = name => {
  if (/\.tsx$/i.test(name)) return 'tsx';
  if (/\.ts$/i.test(name)) return 'typescript';
  if (/\.jsx$/i.test(name)) return 'jsx';
  return 'javascript';
};

const freshTab = (id, name) => ({
  id,
  name: name ?? `Tab ${id}`,
  code: '',
  path: null,
  language: 'javascript'
});

const nextId = tabs => {
  const used = new Set(tabs.map(tab => tab.id));
  let candidate = 1;
  while (used.has(candidate)) candidate += 1;
  return candidate;
};

/** Accepts anything and returns a workspace that the app can actually render. */
const normalize = raw => {
  const tabs = Array.isArray(raw?.tabs)
    ? raw.tabs
        .filter(tab => tab && typeof tab === 'object')
        .map((tab, index) => ({
          id: Number.isInteger(tab.id) ? tab.id : index + 1,
          name: typeof tab.name === 'string' ? tab.name : `Tab ${index + 1}`,
          code: typeof tab.code === 'string' ? tab.code : '',
          path: typeof tab.path === 'string' ? tab.path : null,
          language: LANGUAGES.includes(tab.language)
            ? tab.language
            : 'javascript'
        }))
    : [];

  const safeTabs = tabs.length ? tabs : [freshTab(1)];
  const activeExists = safeTabs.some(tab => tab.id === raw?.activeTab);

  return {
    tabs: safeTabs,
    activeTab: activeExists ? raw.activeTab : safeTabs[0].id,
    settings: { ...DEFAULT_SETTINGS, ...(raw?.settings || {}) },
    history: Array.isArray(raw?.history) ? raw.history : []
  };
};

export const useWorkspace = () => {
  const [state, setState] = useState(() => normalize(null));
  const [loaded, setLoaded] = useState(false);
  const [persistError, setPersistError] = useState(null);

  const persistTimer = useRef(null);
  const migrated = useRef(false);

  // Loading is async now that the workspace is a file, so the first render
  // shows the default and is replaced once the real one arrives.
  useEffect(() => {
    let cancelled = false;
    store
      .read()
      .then(raw => {
        if (cancelled) return;
        if (raw) {
          setState(normalize(raw));
          migrated.current = raw.migratedFrom === 'localStorage';
        }
      })
      .catch(error => {
        // Whatever went wrong, the app has to reach a renderable state. An
        // unresolved load left it on the placeholder forever, which is the
        // same blank window a corrupt workspace used to cause.
        if (!cancelled) setPersistError(String(error?.message || error));
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!loaded) return undefined;
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(async () => {
      persistTimer.current = null;
      const result = await store.write(state);
      setPersistError(result?.ok === false ? result.error : null);
      // The 1.x keys are only dropped once their contents are safely stored.
      if (result?.ok && migrated.current) {
        store.clearLegacy();
        migrated.current = false;
      }
    }, PERSIST_DEBOUNCE_MS);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [state, loaded]);

  const activeTab = useMemo(
    () => state.tabs.find(tab => tab.id === state.activeTab) ?? state.tabs[0],
    [state.tabs, state.activeTab]
  );

  const setActive = useCallback(id => {
    setState(previous =>
      previous.tabs.some(tab => tab.id === id)
        ? { ...previous, activeTab: id }
        : previous
    );
  }, []);

  const updateCode = useCallback((id, code) => {
    setState(previous => ({
      ...previous,
      tabs: previous.tabs.map(tab => (tab.id === id ? { ...tab, code } : tab))
    }));
  }, []);

  const addTab = useCallback((tab = {}) => {
    let created;
    setState(previous => {
      const id = nextId(previous.tabs);
      created = { ...freshTab(id), ...tab, id };
      return {
        ...previous,
        tabs: [...previous.tabs, created],
        activeTab: id
      };
    });
    return created;
  }, []);

  /**
   * Closing selects the neighbour instead of always jumping to the first tab,
   * and closing the only tab replaces it with an empty one rather than being
   * silently refused.
   */
  const closeTab = useCallback(id => {
    setState(previous => {
      const index = previous.tabs.findIndex(tab => tab.id === id);
      if (index === -1) return previous;

      if (previous.tabs.length === 1) {
        const replacement = freshTab(1);
        return { ...previous, tabs: [replacement], activeTab: replacement.id };
      }

      const tabs = previous.tabs.filter(tab => tab.id !== id);
      const neighbour = tabs[Math.min(index, tabs.length - 1)];
      return {
        ...previous,
        tabs,
        activeTab: previous.activeTab === id ? neighbour.id : previous.activeTab
      };
    });
  }, []);

  const renameTab = useCallback((id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setState(previous => ({
      ...previous,
      tabs: previous.tabs.map(tab =>
        tab.id === id ? { ...tab, name: trimmed } : tab
      )
    }));
  }, []);

  const moveTab = useCallback((id, toIndex) => {
    setState(previous => {
      const from = previous.tabs.findIndex(tab => tab.id === id);
      if (from === -1) return previous;
      const target = Math.max(0, Math.min(toIndex, previous.tabs.length - 1));
      if (from === target) return previous;
      const tabs = [...previous.tabs];
      const [moved] = tabs.splice(from, 1);
      tabs.splice(target, 0, moved);
      return { ...previous, tabs };
    });
  }, []);

  const setTabPath = useCallback((id, { path, name }) => {
    setState(previous => ({
      ...previous,
      tabs: previous.tabs.map(tab =>
        tab.id === id
          ? { ...tab, path: path ?? tab.path, name: name ?? tab.name }
          : tab
      )
    }));
  }, []);

  const setTabLanguage = useCallback((id, language) => {
    if (!LANGUAGES.includes(language)) return;
    setState(previous => ({
      ...previous,
      tabs: previous.tabs.map(tab =>
        tab.id === id ? { ...tab, language } : tab
      )
    }));
  }, []);

  const updateSettings = useCallback(patch => {
    setState(previous => ({
      ...previous,
      settings: { ...previous.settings, ...patch }
    }));
  }, []);

  const setHistory = useCallback(update => {
    setState(previous => ({
      ...previous,
      history: typeof update === 'function' ? update(previous.history) : update
    }));
  }, []);

  const replaceWorkspace = useCallback(raw => {
    setState(normalize(raw));
  }, []);

  return {
    loaded,
    tabs: state.tabs,
    activeTabId: state.activeTab,
    activeTab,
    settings: state.settings,
    history: state.history,
    setHistory,
    persistError,
    snapshot: state,
    setActive,
    updateCode,
    addTab,
    closeTab,
    renameTab,
    moveTab,
    setTabPath,
    setTabLanguage,
    updateSettings,
    replaceWorkspace
  };
};
