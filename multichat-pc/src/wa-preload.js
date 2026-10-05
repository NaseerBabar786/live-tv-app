// Runs in each WhatsApp Web box before the page. Its only job: when the page shows a browser
// notification, pass the title and text to Multi Chat, which shows it as a Windows
// notification labelled with the account's name. It does not read chats or touch the page.
const { contextBridge, ipcRenderer, webFrame } = require('electron');

contextBridge.exposeInMainWorld('__multichat', {
  notify: (title, body) => ipcRenderer.sendToHost('notify', { title: String(title || ''), body: String(body || '') }),
});

function shim() {
  const bridge = window.__multichat;
  if (!bridge || window.__multichatShim) return;
  window.__multichatShim = true;

  class MultiChatNotification extends EventTarget {
    constructor(title, options) {
      super();
      const o = options || {};
      this.title = String(title || '');
      this.body = String(o.body || '');
      this.tag = o.tag || '';
      this.icon = o.icon || '';
      this.data = o.data;
      this.onclick = null;
      this.onclose = null;
      this.onshow = null;
      this.onerror = null;
      bridge.notify(this.title, this.body);
    }
    close() {}
    static get permission() { return 'granted'; }
    static requestPermission(cb) {
      if (typeof cb === 'function') cb('granted');
      return Promise.resolve('granted');
    }
  }
  window.Notification = MultiChatNotification;

  if (window.ServiceWorkerRegistration && ServiceWorkerRegistration.prototype) {
    ServiceWorkerRegistration.prototype.showNotification = function (title, options) {
      bridge.notify(title, (options && options.body) || '');
      return Promise.resolve();
    };
  }
}

if (contextBridge.executeInMainWorld) {
  contextBridge.executeInMainWorld({ func: shim });
} else {
  webFrame.executeJavaScript(`(${shim.toString()})()`);
}
