const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    frame: false,
    // `show: false` + the `ready-to-show` handler below avoid the white flash
    // that a frameless window paints before the renderer has anything to draw.
    show: false,
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

// Registered once for the lifetime of the process. Calling this from inside
// createWindow duplicated every handler whenever the window was recreated, so
// a single click on close fired the IPC twice.
const setupIPC = () => {
  ipcMain.on('close-window', () => mainWindow?.close());
  ipcMain.on('minimize-window', () => mainWindow?.minimize());
  ipcMain.on('maximize-window', () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  });
};

app.whenReady().then(() => {
  setupIPC();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
