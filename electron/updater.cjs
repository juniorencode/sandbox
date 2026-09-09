/**
 * Update checks.
 *
 * There was no update mechanism at all: electron-updater was not installed and
 * the NSIS installer is one-click, so shipping a fix meant asking users to
 * download and reinstall by hand.
 *
 * Everything here is defensive. An unpackaged build has no update feed, a
 * repository with no releases yet returns a 404, and neither should ever
 * surface as an error dialog on launch.
 */

let autoUpdater = null;

const load = () => {
  if (autoUpdater) return autoUpdater;
  try {
    ({ autoUpdater } = require('electron-updater'));
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
  } catch {
    autoUpdater = null;
  }
  return autoUpdater;
};

const register = (getWindow, { app }) => {
  const updater = load();
  if (!updater) return null;

  // Update events can arrive while the app is closing, when the window object
  // still exists but its contents are destroyed.
  const notify = (channel, payload) => {
    const window = getWindow();
    if (!window || window.isDestroyed()) return;
    window.webContents.send(channel, payload);
  };

  updater.on('update-available', info =>
    notify('update:available', { version: info?.version })
  );
  updater.on('update-not-available', () => notify('update:none', {}));
  updater.on('download-progress', progress =>
    notify('update:progress', { percent: Math.round(progress?.percent ?? 0) })
  );
  updater.on('update-downloaded', info =>
    notify('update:ready', { version: info?.version })
  );
  updater.on('error', error =>
    notify('update:error', { message: String(error?.message || error) })
  );

  return {
    /**
     * @param {boolean} silent when true, a missing feed is not reported; used
     *   for the check on launch, where there is nothing the user asked for.
     */
    check: async ({ silent = false } = {}) => {
      if (!app.isPackaged) {
        return { ok: false, reason: 'Updates are only checked in a packaged build' };
      }
      try {
        const result = await updater.checkForUpdates();
        return { ok: true, version: result?.updateInfo?.version ?? null };
      } catch (error) {
        if (!silent) notify('update:error', { message: String(error?.message || error) });
        return { ok: false, reason: String(error?.message || error) };
      }
    },

    download: async () => {
      try {
        await updater.downloadUpdate();
        return { ok: true };
      } catch (error) {
        return { ok: false, reason: String(error?.message || error) };
      }
    },

    install: () => updater.quitAndInstall()
  };
};

module.exports = { register };
