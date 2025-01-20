const path = require('path');
const { app, BrowserWindow, ipcMain } = require('electron');

let mainWindow;

const createWindow = () => {
  mainWindow = new BrowserWindow({
    frame: false,
    maximized: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs')
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));

  mainWindow.maximize();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  setupIPC();
};

const setupIPC = () => {
  ipcMain.on('close-window', () => mainWindow.close());
  ipcMain.on('minimize-window', () => mainWindow.minimize());
  ipcMain.on('maximize-window', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.restore();
    } else {
      mainWindow.maximize();
    }
  });
  ipcMain.on('enable-drag', () => mainWindow.setResizable(true));
};

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
