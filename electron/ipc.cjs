const fs = require('fs');
const path = require('path');
const { app, dialog, ipcMain, shell } = require('electron');
const store = require('./store.cjs');

/**
 * Every channel the renderer can reach.
 *
 * Registered once, against a getter for the window rather than a captured
 * reference: setupIPC used to run inside createWindow, so recreating the
 * window registered each listener a second time and one click on close fired
 * the channel twice.
 *
 * Handlers return `{ ok, ... }` instead of throwing across the bridge, so a
 * failed dialog or an unreadable file surfaces in the UI rather than as an
 * unhandled rejection in the renderer.
 */

const JS_FILTERS = [
  { name: 'JavaScript', extensions: ['js', 'mjs', 'cjs', 'jsx'] },
  { name: 'TypeScript', extensions: ['ts', 'tsx'] },
  { name: 'All files', extensions: ['*'] }
];

const WORKSPACE_FILTERS = [
  { name: 'Sandbox workspace', extensions: ['json'] },
  { name: 'All files', extensions: ['*'] }
];

const failed = error => ({ ok: false, error: String(error?.message || error) });

const register = (
  getWindow,
  { updates, moduleServer, setAllowModuleDownloads } = {}
) => {
  const withWindow = action => (...args) => {
    const win = getWindow();
    if (!win) return { ok: false, error: 'no window' };
    return action(win, ...args);
  };

  // --- window controls -----------------------------------------------------

  ipcMain.on('window:close', withWindow(win => win.close()));
  ipcMain.on('window:minimize', withWindow(win => win.minimize()));
  ipcMain.on(
    'window:maximize',
    withWindow(win => (win.isMaximized() ? win.unmaximize() : win.maximize()))
  );
  ipcMain.handle(
    'window:isMaximized',
    withWindow(win => win.isMaximized())
  );

  // --- workspace -----------------------------------------------------------

  ipcMain.handle('workspace:read', () => {
    try {
      return { ok: true, data: store.read() };
    } catch (error) {
      return failed(error);
    }
  });

  ipcMain.handle('workspace:write', (_event, data) => {
    try {
      return { ok: true, ...store.write(data) };
    } catch (error) {
      return failed(error);
    }
  });

  ipcMain.handle(
    'workspace:export',
    withWindow(async (win, data) => {
      try {
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
          title: 'Export workspace',
          defaultPath: `sandbox-workspace-${new Date()
            .toISOString()
            .slice(0, 10)}.json`,
          filters: WORKSPACE_FILTERS
        });
        if (canceled || !filePath) return { ok: false, canceled: true };
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        return { ok: true, path: filePath };
      } catch (error) {
        return failed(error);
      }
    })
  );

  ipcMain.handle(
    'workspace:import',
    withWindow(async win => {
      try {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
          title: 'Import workspace',
          properties: ['openFile'],
          filters: WORKSPACE_FILTERS
        });
        if (canceled || !filePaths?.length) return { ok: false, canceled: true };
        const data = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
        if (!Array.isArray(data?.tabs) || !data.tabs.length) {
          return { ok: false, error: 'That file does not contain any tabs' };
        }
        return { ok: true, data, path: filePaths[0] };
      } catch (error) {
        return failed(error);
      }
    })
  );

  // --- individual files ----------------------------------------------------

  ipcMain.handle(
    'file:open',
    withWindow(async win => {
      try {
        const { canceled, filePaths } = await dialog.showOpenDialog(win, {
          title: 'Open file',
          properties: ['openFile', 'multiSelections'],
          filters: JS_FILTERS
        });
        if (canceled || !filePaths?.length) return { ok: false, canceled: true };
        const files = filePaths.map(filePath => ({
          path: filePath,
          name: path.basename(filePath),
          code: fs.readFileSync(filePath, 'utf8')
        }));
        return { ok: true, files };
      } catch (error) {
        return failed(error);
      }
    })
  );

  ipcMain.handle('file:save', (_event, { path: filePath, code }) => {
    try {
      if (!filePath) return { ok: false, error: 'no path' };
      fs.writeFileSync(filePath, code, 'utf8');
      return { ok: true, path: filePath };
    } catch (error) {
      return failed(error);
    }
  });

  ipcMain.handle(
    'file:saveAs',
    withWindow(async (win, { name, code }) => {
      try {
        const { canceled, filePath } = await dialog.showSaveDialog(win, {
          title: 'Save as',
          defaultPath: name?.endsWith('.js') ? name : `${name || 'snippet'}.js`,
          filters: JS_FILTERS
        });
        if (canceled || !filePath) return { ok: false, canceled: true };
        fs.writeFileSync(filePath, code, 'utf8');
        return { ok: true, path: filePath, name: path.basename(filePath) };
      } catch (error) {
        return failed(error);
      }
    })
  );

  // --- app -----------------------------------------------------------------

  ipcMain.handle('app:info', () => ({
    ok: true,
    version: app.getVersion(),
    platform: process.platform,
    electron: process.versions.electron,
    node: process.versions.node,
    chrome: process.versions.chrome,
    userData: app.getPath('userData')
  }));

  // --- bundled assets -------------------------------------------------------

  /**
   * esbuild's wasm binary, read from disk.
   *
   * The renderer is loaded from file://, where fetching a sibling file is
   * blocked, so the bytes are handed over the bridge instead. Copied into the
   * build under a stable name by scripts/copy-wasm.cjs.
   */
  ipcMain.handle('assets:esbuildWasm', () => {
    for (const candidate of [
      path.join(__dirname, '..', 'build', 'esbuild.wasm'),
      path.join(__dirname, '..', 'public', 'esbuild.wasm'),
      path.join(__dirname, '..', 'node_modules', 'esbuild-wasm', 'esbuild.wasm')
    ]) {
      try {
        if (fs.existsSync(candidate)) {
          // Sent as a plain Uint8Array: a Buffer would arrive as a plain
          // object through structured clone.
          return { ok: true, wasm: new Uint8Array(fs.readFileSync(candidate)) };
        }
      } catch {
        // Try the next location.
      }
    }
    return { ok: false, error: 'esbuild.wasm was not found in this build' };
  });

  // --- module cache ---------------------------------------------------------

  ipcMain.handle('modules:stats', () =>
    moduleServer ? moduleServer.stats() : { ok: false, error: 'no cache' }
  );

  ipcMain.handle('modules:clear', () =>
    moduleServer ? moduleServer.clear() : { ok: false, error: 'no cache' }
  );

  ipcMain.on('modules:setAllowed', (_event, allowed) =>
    setAllowModuleDownloads?.(Boolean(allowed))
  );

  ipcMain.handle('update:check', async () => {
    if (!updates) return { ok: false, reason: 'no updater' };
    return updates.check({ silent: false });
  });

  ipcMain.handle('update:download', async () => {
    if (!updates) return { ok: false, reason: 'no updater' };
    return updates.download();
  });

  ipcMain.on('update:install', () => updates?.install());

  ipcMain.handle('app:revealWorkspace', async () => {
    try {
      const { file, directory } = store.paths();
      // showItemInFolder needs the file to exist; fall back to the directory.
      if (fs.existsSync(file)) shell.showItemInFolder(file);
      else await shell.openPath(directory);
      return { ok: true };
    } catch (error) {
      return failed(error);
    }
  });
};

module.exports = { register };
