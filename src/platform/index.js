/**
 * The renderer's only dependency on the desktop runtime.
 *
 * Everything the app can do outside the page goes through here, with a browser
 * fallback for each capability so `npm run dev` stays usable. Two reasons this
 * is worth the indirection:
 *
 *   - Window controls used to be called straight from a component as
 *     `window.api.closeWindow()`, unguarded, so every one of those buttons
 *     threw in the browser, where there is no preload bridge.
 *   - It keeps the runtime surface small and named. Swapping Electron for
 *     something else means rewriting this file rather than auditing the app.
 */

const bridge = globalThis.sandbox;

/** True when running inside the desktop shell rather than a browser tab. */
export const isDesktop = Boolean(bridge);

/**
 * Calls across the bridge without letting a failure escape as a rejection.
 *
 * `ipcRenderer.invoke` rejects when a channel has no handler, and an
 * uncaught rejection during startup left the app on its loading placeholder
 * forever, which is the same unrecoverable blank window that a corrupt
 * workspace used to produce. Every call site here gets a value back.
 */
const attempt = async (call, fallback = null) => {
  try {
    return await call();
  } catch (error) {
    return { ok: false, error: String(error?.message || error), fallback };
  }
};

const LEGACY_TABS = 'data';
const LEGACY_ACTIVE = 'activeTab';
const BROWSER_WORKSPACE = 'sandbox:workspace';

const readLocal = key => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Corrupt storage used to crash the initial render: the parse ran inline
    // in useState with no guard, and the packaged app has no devtools or menu
    // to clear it from.
    return null;
  }
};

const writeLocal = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return { ok: true };
  } catch (error) {
    // Quota exceeded. Reporting it beats throwing from an effect, which took
    // the whole renderer down with a blank window.
    return { ok: false, error: String(error?.message || error) };
  }
};

/**
 * Workspaces written to localStorage by 1.x.
 *
 * Returned only when the real store has nothing, so a user upgrading does not
 * lose the tabs they already had.
 */
const legacyWorkspace = () => {
  const tabs = readLocal(LEGACY_TABS);
  if (!Array.isArray(tabs) || !tabs.length) return null;
  const activeTab = Number.parseInt(localStorage.getItem(LEGACY_ACTIVE), 10);
  return {
    tabs,
    activeTab: Number.isInteger(activeTab) ? activeTab : tabs[0]?.id,
    migratedFrom: 'localStorage'
  };
};

export const windowControls = {
  close: () => bridge?.window.close(),
  minimize: () => bridge?.window.minimize(),
  maximize: () => bridge?.window.maximize(),
  isMaximized: async () => {
    const result = await attempt(() => bridge?.window.isMaximized());
    return result === true;
  }
};

export const workspace = {
  read: async () => {
    if (bridge) {
      const result = await attempt(() => bridge.workspace.read());
      if (result?.ok && result.data) return result.data;
      // A failed read must not lose an older localStorage workspace.
      return legacyWorkspace();
    }
    return readLocal(BROWSER_WORKSPACE) ?? legacyWorkspace();
  },

  write: async data => {
    if (bridge) return attempt(() => bridge.workspace.write(data));
    return writeLocal(BROWSER_WORKSPACE, data);
  },

  /** Drops the 1.x keys once their contents have been written to the store. */
  clearLegacy: () => {
    try {
      localStorage.removeItem(LEGACY_TABS);
      localStorage.removeItem(LEGACY_ACTIVE);
    } catch {
      /* nothing to do */
    }
  },

  export: async data => {
    if (bridge) return attempt(() => bridge.workspace.export(data));
    return downloadJson('sandbox-workspace.json', data);
  },

  import: async () => {
    if (bridge) return attempt(() => bridge.workspace.import());
    const file = await pickFile('.json,application/json');
    if (!file) return { ok: false, canceled: true };
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data?.tabs) || !data.tabs.length) {
        return { ok: false, error: 'That file does not contain any tabs' };
      }
      return { ok: true, data, path: file.name };
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  }
};

export const files = {
  open: async () => {
    if (bridge) return attempt(() => bridge.files.open());
    const file = await pickFile('.js,.mjs,.cjs,.jsx,.ts,.tsx');
    if (!file) return { ok: false, canceled: true };
    return {
      ok: true,
      // A browser cannot hand back a writable path, so these open detached.
      files: [{ path: null, name: file.name, code: await file.text() }]
    };
  },

  save: async payload => {
    if (bridge) return attempt(() => bridge.files.save(payload));
    return downloadText(payload.name || 'snippet.js', payload.code);
  },

  saveAs: async payload => {
    if (bridge) return attempt(() => bridge.files.saveAs(payload));
    return downloadText(payload.name || 'snippet.js', payload.code);
  }
};

export const appInfo = async () => {
  if (bridge) return attempt(() => bridge.app.info());
  return { ok: true, version: 'dev', platform: 'browser' };
};

/**
 * Native menu entries, routed to the renderer's command registry.
 *
 * Returns an unsubscribe function, and a no-op one in the browser, so callers
 * do not have to know whether the bridge exists.
 */
export const onMenuCommand = callback =>
  bridge?.app.onCommand(callback) ?? (() => {});

export const modules = {
  stats: () => attempt(() => bridge?.modules.stats(), { ok: false }),
  clear: () => attempt(() => bridge?.modules.clear(), { ok: false }),
  setAllowed: allowed => bridge?.modules.setAllowed(allowed)
};

export const updates = {
  check: () => attempt(() => bridge?.updates.check(), { ok: false }),
  download: () => attempt(() => bridge?.updates.download(), { ok: false }),
  install: () => bridge?.updates.install(),
  onEvent: callback => bridge?.updates.onEvent(callback) ?? (() => {})
};

export const revealWorkspace = () =>
  attempt(() => bridge?.app.revealWorkspace());

// --- browser-only helpers --------------------------------------------------

const pickFile = accept =>
  new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // A cancelled picker fires no event in every browser, so nothing here can
    // reliably resolve on dismissal; the promise is simply left pending.
    input.click();
  });

const downloadText = (name, text) => {
  try {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    anchor.click();
    URL.revokeObjectURL(url);
    return { ok: true, path: name };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
};

const downloadJson = (name, data) =>
  downloadText(name, JSON.stringify(data, null, 2));
