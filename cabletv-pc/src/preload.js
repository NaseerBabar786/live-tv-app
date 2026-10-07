// The few things the screens may ask of the window (see main.js).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pc', {
  info: () => ipcRenderer.invoke('info'),
  ready: () => ipcRenderer.send('ui-ready'),
  error: (message, stack) => ipcRenderer.send('ui-error', { message: String(message), stack: String(stack || '') }),
  setStreamHeaders: (map) => ipcRenderer.send('stream-headers', map),
  fullscreen: (on) => ipcRenderer.send('fullscreen', on),
  isFullscreen: () => ipcRenderer.invoke('is-fullscreen'),
  openExternal: (url) => ipcRenderer.send('open-external', url),
  quit: () => ipcRenderer.send('quit'),
  checkUpdate: (owner) => ipcRenderer.invoke('check-update', { owner: !!owner }),
  install: (which) => ipcRenderer.invoke('install', which),
  rescueInfo: () => ipcRenderer.invoke('rescue-info'),
  rescueGoBack: () => ipcRenderer.invoke('rescue-go-back'),
  rescueTryAgain: () => ipcRenderer.send('rescue-try-again'),
  on: (channel, fn) => {
    if (!['web-signal', 'web-key', 'fullscreen', 'install-progress'].includes(channel)) return;
    ipcRenderer.on(channel, (_e, payload) => fn(payload));
  },
});
