const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only surface the renderer sees.
 *
 * Grouped by concern rather than flat, so the renderer-side adapter in
 * src/platform can mirror it and the whole runtime dependency stays in one
 * small, replaceable place.
 */
contextBridge.exposeInMainWorld('sandbox', {
  window: {
    close: () => ipcRenderer.send('window:close'),
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized')
  },

  workspace: {
    read: () => ipcRenderer.invoke('workspace:read'),
    write: data => ipcRenderer.invoke('workspace:write', data),
    export: data => ipcRenderer.invoke('workspace:export', data),
    import: () => ipcRenderer.invoke('workspace:import')
  },

  files: {
    open: () => ipcRenderer.invoke('file:open'),
    save: payload => ipcRenderer.invoke('file:save', payload),
    saveAs: payload => ipcRenderer.invoke('file:saveAs', payload)
  },

  app: {
    info: () => ipcRenderer.invoke('app:info'),
    revealWorkspace: () => ipcRenderer.invoke('app:revealWorkspace')
  }
});
