const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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
 */

const WORKSPACE = 'workspace.json';
const CURRENT_VERSION = 1;

const paths = () => {
  const directory = app.getPath('userData');
  const file = path.join(directory, WORKSPACE);
  return { directory, file, backup: `${file}.bak`, temp: `${file}.tmp` };
};

const parse = contents => {
  const data = JSON.parse(contents);
  if (!data || typeof data !== 'object') throw new Error('not an object');
  if (!Array.isArray(data.tabs) || !data.tabs.length) {
    throw new Error('no tabs');
  }
  return data;
};

/** @returns {object|null} the stored workspace, or null when there is none. */
const read = () => {
  const { file, backup } = paths();
  for (const candidate of [file, backup]) {
    try {
      if (!fs.existsSync(candidate)) continue;
      return parse(fs.readFileSync(candidate, 'utf8'));
    } catch {
      // Try the backup next. A corrupt file is not worth reporting as an
      // error: the caller falls back to a fresh workspace either way.
    }
  }
  return null;
};

const write = data => {
  const { directory, file, backup, temp } = paths();
  fs.mkdirSync(directory, { recursive: true });

  const payload = JSON.stringify({ ...data, version: CURRENT_VERSION }, null, 2);
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

module.exports = { read, write, paths, CURRENT_VERSION };
