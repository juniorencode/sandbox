const { Menu, app, shell } = require('electron');

/**
 * The application menu.
 *
 * The app defined no Menu and no accelerators, which on a frameless window
 * meant clipboard and undo behaviour in anything other than the editor was
 * left entirely to Electron's default menu rather than to a decision. Copying
 * text out of the output pane in particular was not something the app had
 * arranged for.
 *
 * Menu entries that map to app behaviour send a command id to the renderer, so
 * they run through the same registry as the palette and the keyboard rather
 * than being a second implementation.
 */

const send = (getWindow, id) => () => {
  const window = getWindow();
  if (!window || window.isDestroyed()) return;
  window.webContents.send('menu:command', id);
};

const build = getWindow => {
  const command = id => send(getWindow, id);
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+N', click: command('tab.new') },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: command('tab.close')
        },
        { type: 'separator' },
        {
          label: 'Open File…',
          accelerator: 'CmdOrCtrl+O',
          click: command('file.open')
        },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: command('file.save') },
        {
          label: 'Save As…',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: command('file.saveAs')
        },
        { type: 'separator' },
        {
          label: 'Copy Shareable Snippet',
          accelerator: 'CmdOrCtrl+Shift+C',
          click: command('share.copy')
        },
        {
          label: 'Open Shared Snippet',
          accelerator: 'CmdOrCtrl+Shift+V',
          click: command('share.paste')
        },
        { label: 'Copy as Markdown', click: command('share.markdown') },
        { type: 'separator' },
        { label: 'Export Workspace…', click: command('workspace.export') },
        { label: 'Import Workspace…', click: command('workspace.import') },
        { label: 'Show Workspace Folder', click: command('workspace.reveal') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      // Roles rather than hand-rolled handlers, so the platform's own
      // clipboard behaviour applies everywhere in the window.
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        {
          label: 'Format Document',
          accelerator: 'Alt+Shift+F',
          click: command('editor.format')
        }
      ]
    },
    {
      label: 'Run',
      submenu: [
        {
          label: 'Run',
          accelerator: 'CmdOrCtrl+Return',
          click: command('run.now')
        },
        {
          label: 'Stop',
          accelerator: 'CmdOrCtrl+.',
          click: command('run.stop')
        },
        {
          label: 'Clear Output',
          accelerator: 'CmdOrCtrl+K',
          click: command('output.clear')
        },
        { type: 'separator' },
        { label: 'Toggle Auto-run', click: command('run.toggleAuto') }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Command Palette…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: command('palette.open')
        },
        {
          label: 'Settings…',
          accelerator: 'CmdOrCtrl+,',
          click: command('settings.open')
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Repository',
          click: () => shell.openExternal('https://github.com/juniorencode/sandbox')
        },
        { label: 'Check for Updates', click: command('app.checkUpdates') },
        { label: `Version ${app.getVersion()}`, enabled: false }
      ]
    }
  ];

  return Menu.buildFromTemplate(template);
};

/**
 * The window is frameless, so the menu bar is hidden. It is still installed
 * because that is what gives the whole window working accelerators and
 * clipboard roles; on Windows and Linux it can be revealed with Alt.
 */
const install = getWindow => {
  const menu = build(getWindow);
  Menu.setApplicationMenu(menu);
  return menu;
};

module.exports = { install, build };
