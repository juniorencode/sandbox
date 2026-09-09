const path = require('path');
const { app, BrowserWindow } = require('electron');
const ipc = require('./electron/ipc.cjs');

let mainWindow = null;

const getWindow = () => mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    frame: false,
    // `show: false` plus the ready-to-show handler below avoid the white flash
    // a frameless window paints before the renderer has anything to draw.
    show: false,
    backgroundColor: '#212830',
    minWidth: 640,
    minHeight: 400,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.maximize();
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
};

app.whenReady().then(() => {
  // Registered once for the lifetime of the process, against a getter rather
  // than a captured window: doing this inside createWindow meant recreating
  // the window registered every listener a second time.
  ipc.register(getWindow);
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) createWindow();
});
