// Bridge between the Multi Chat window and the main process. The window gets only these calls.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('mc', {
  state: () => ipcRenderer.invoke('state'),
  save: patch => ipcRenderer.invoke('save', patch),
  pickPhoto: () => ipcRenderer.invoke('pick-photo'),
  forgetAccount: id => ipcRenderer.invoke('forget-account', id),
  notify: (accountId, title, body) => ipcRenderer.send('notify', { accountId, title, body }),
  unread: (total, badge) => ipcRenderer.send('unread', { total, badge }),
  unlock: pin => ipcRenderer.invoke('unlock', pin),
  lockNow: () => ipcRenderer.invoke('lock-now'),
  setPin: (current, pin) => ipcRenderer.invoke('set-pin', { current, pin }),
  openExternal: url => ipcRenderer.send('open-external', url),
  on: (channel, fn) => {
    if (['locked', 'select-account', 'shortcut', 'update'].includes(channel)) {
      ipcRenderer.on(channel, (_e, payload) => fn(payload));
    }
  },
});
