const path = require('path');
const { app, BrowserWindow, screen } = require('electron');
const ipc = require('./electron/ipc.cjs');
const menu = require('./electron/menu.cjs');
const security = require('./electron/security.cjs');
const updater = require('./electron/updater.cjs');
const { createWindowState } = require('./electron/windowState.cjs');

let mainWindow = null;
let windowState = null;
let updates = null;

const getWindow = () => mainWindow;

/**
 * A second launch focuses the window that is already open instead of starting
 * another copy, which would have two processes writing the same workspace file.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

const createWindow = () => {
  const bounds = windowState.initial(screen.getAllDisplays());

  mainWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    // Created hidden and shown on ready-to-show, which removes the white flash
    // a frameless window paints before the renderer has anything to draw.
    show: false,
    backgroundColor: '#212830',
    minWidth: 640,
    minHeight: 400,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      // The preload only needs `electron`, which a sandboxed preload can still
      // require, so the renderer process itself can be sandboxed.
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  security.guardNavigation(mainWindow.webContents);

  mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    if (bounds.maximized) mainWindow.maximize();
    mainWindow.show();
    // Checked quietly: a repository with no releases yet answers with a 404,
    // which is not something to greet the user with.
    updates?.check({ silent: true });
  });

  const remember = () => windowState.save(mainWindow);
  mainWindow.on('resize', remember);
  mainWindow.on('move', remember);
  mainWindow.on('maximize', remember);
  mainWindow.on('unmaximize', remember);

  mainWindow.on('close', remember);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  windowState = createWindowState(app.getPath('userData'), {
    defaultWidth: 1400,
    defaultHeight: 900
  });

  security.apply(require('electron').session.defaultSession);
  updates = updater.register(getWindow, { app });

  // Registered once for the lifetime of the process, against a getter rather
  // than a captured window: doing this inside createWindow meant recreating
  // the window registered every listener a second time.
  ipc.register(getWindow, { updates });
  menu.install(getWindow);

  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
