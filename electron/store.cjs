const fs = require('fs');
const path = require('path');

/**
 * File-backed workspace storage.
 *
 * The workspace lived only in localStorage, which made it the single copy of
 * everything the user had ever written while also being the most fragile place
 * to keep it: the NSIS installer sets deleteAppDataOnUninstall, a quota error
 * threw from a React effect and took the renderer down, and there was no
 * export, no save, and no backup of any kind.
 *
 * Writes go through a temp file and a rename so an interrupted write cannot
 * leave a half-written workspace behind, and the previous version is kept as
 * a sibling `.bak` that is used automatically if the main file is unreadable.
 *
 * The directory is a parameter rather than a call to `app.getPath`, so the
 * store carries no dependency on a running Electron app and can be exercised
 * directly.
 */

const WORKSPACE = 'workspace.json';
const CURRENT_VERSION = 1;

const parse = contents => {
  const data = JSON.parse(contents);
  if (!data || typeof data !== 'object') throw new Error('not an object');
  if (!Array.isArray(data.tabs) || !data.tabs.length) {
    throw new Error('no tabs');
  }
  return data;
};

const createStore = directory => {
  const file = path.join(directory, WORKSPACE);
  const backup = `${file}.bak`;
  const temp = `${file}.tmp`;

  /** @returns {object|null} the stored workspace, or null when there is none. */
  const read = () => {
    for (const candidate of [file, backup]) {
      try {
        if (!fs.existsSync(candidate)) continue;
        return parse(fs.readFileSync(candidate, 'utf8'));
      } catch {
        // Fall through to the backup. A corrupt file is not worth reporting:
        // the caller starts from a fresh workspace either way.
      }
    }
    return null;
  };

  const write = data => {
    fs.mkdirSync(directory, { recursive: true });

    const payload = JSON.stringify(
      { ...data, version: CURRENT_VERSION },
      null,
      2
    );
    fs.writeFileSync(temp, payload, 'utf8');

    // Keep the last good copy before the new one takes its place.
    try {
      if (fs.existsSync(file)) fs.copyFileSync(file, backup);
    } catch {
      // A missing backup is survivable; losing the write is not.
    }

    fs.renameSync(temp, file);
    return { path: file };
  };

  return { read, write, paths: () => ({ directory, file, backup, temp }) };
};

/**
 * The app's own store, bound to Electron's userData directory.
 *
 * Electron is required lazily so importing this module outside a running app
 * does not pull it in: outside Electron, `require('electron')` resolves to the
 * path of the executable rather than the API.
 */
let appStore = null;
const instance = () => {
  if (!appStore) {
    const { app } = require('electron');
    appStore = createStore(app.getPath('userData'));
  }
  return appStore;
};

module.exports = {
  createStore,
  CURRENT_VERSION,
  read: () => instance().read(),
  write: data => instance().write(data),
  paths: () => instance().paths()
};
