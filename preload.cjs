const { contextBridge, ipcRenderer } = require('electron');

/**
 * The only surface the renderer sees.
 *
 * Grouped by concern rather than flat, so the renderer-side adapter in
 * src/platform can mirror it and the whole runtime dependency stays in one
 * small, replaceable place. Nothing here forwards the raw IpcRendererEvent to
 * the page: listeners receive only the payload, so a callback cannot reach
 * `event.sender` and from there the rest of the process.
 */

const subscribe = (channel, callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

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
    revealWorkspace: () => ipcRenderer.invoke('app:revealWorkspace'),
    // Menu entries run through the renderer's command registry rather than
    // being a second implementation of the same actions.
    onCommand: callback => subscribe('menu:command', callback)
  },

  node: {
    start: () => ipcRenderer.invoke('node:start'),
    send: message => ipcRenderer.send('node:send', message),
    kill: () => ipcRenderer.invoke('node:kill'),
    paths: () => ipcRenderer.invoke('node:paths'),
    revealDir: () => ipcRenderer.invoke('node:revealDir'),
    onMessage: callback => subscribe('node:message', callback)
  },

  assets: {
    esbuildWasm: () => ipcRenderer.invoke('assets:esbuildWasm')
  },

  modules: {
    stats: () => ipcRenderer.invoke('modules:stats'),
    clear: () => ipcRenderer.invoke('modules:clear'),
    setAllowed: allowed => ipcRenderer.send('modules:setAllowed', allowed)
  },

  updates: {
    check: () => ipcRenderer.invoke('update:check'),
    download: () => ipcRenderer.invoke('update:download'),
    install: () => ipcRenderer.send('update:install'),
    onEvent: callback => {
      const channels = [
        'update:available',
        'update:none',
        'update:progress',
        'update:ready',
        'update:error'
      ];
      const off = channels.map(channel =>
        subscribe(channel, payload =>
          callback({ type: channel.replace('update:', ''), ...payload })
        )
      );
      return () => off.forEach(dispose => dispose());
    }
  }
});
