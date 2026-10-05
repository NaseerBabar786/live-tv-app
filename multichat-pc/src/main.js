// Multi Chat for Windows: several WhatsApp Web accounts, each in its own separate
// browser session ("partition"), so each one signs in with its own QR code and keeps its
// own cookies and storage. The pages are the official web.whatsapp.com, unmodified.
// Nothing here reads chats or sends messages; the app only shows the pages, turns their
// notifications into labelled Windows notifications and reads the unread count from the
// page title.
const {
  app, BrowserWindow, ipcMain, Notification, Tray, Menu, nativeImage, dialog, shell, powerMonitor, net,
} = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { inQuietHours, compareVersions, versionFromTitle } = require('./util');

const WA_ORIGIN = 'https://web.whatsapp.com';
const RELEASE_API = 'https://api.github.com/repos/NaseerBabar786/live-tv-app/releases/tags/multichat-pc';
const RELEASE_PAGE = 'https://github.com/NaseerBabar786/live-tv-app/releases/tag/multichat-pc';
const SETUP_URL = 'https://github.com/NaseerBabar786/live-tv-app/releases/download/multichat-pc/MultiChat-Setup.exe';

// WhatsApp Web only opens in a normal desktop browser, so every page gets a plain
// Chrome user agent (Electron's own one names Electron and gets the "update Chrome" page).
const CHROME_MAJOR = (process.versions.chrome || '138').split('.')[0];
const USER_AGENT =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;
app.userAgentFallback = USER_AGENT;
app.setAppUserModelId('ca.bulkbazaar.multichat');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------- Saved settings (one JSON file in the user's AppData folder) ----------

const STORE_FILE = path.join(app.getPath('userData'), 'multichat.json');
const DEFAULTS = {
  accounts: [],
  templates: [
    { id: 't1', title: 'Thanks', text: 'Thank you for your message. I will get back to you shortly.' },
    { id: 't2', title: 'Address', text: 'Our address is ' },
    { id: 't3', title: 'Busy', text: 'Sorry, I am busy right now. I will call you back soon.' },
  ],
  settings: {
    view: 'one', // 'one' = one account at a time, 'all' = side by side
    active: null,
    closeToTray: true,
    startWithWindows: false,
    hidePreview: false, // notifications show only the account name
    autoLockMin: 0, // 0 = never
    pin: null, // { salt, hash } when a PIN lock is set
  },
};

let store = load();

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return {
      accounts: Array.isArray(data.accounts) ? data.accounts : [],
      templates: Array.isArray(data.templates) ? data.templates : DEFAULTS.templates,
      settings: { ...DEFAULTS.settings, ...(data.settings || {}) },
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }
}

function save() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    const tmp = STORE_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(store, null, 1));
    fs.renameSync(tmp, STORE_FILE);
  } catch (e) {
    console.error('Could not save settings', e);
  }
}

/** What the window may see: everything except the PIN hash. */
function publicState() {
  const { pin, ...settings } = store.settings;
  return {
    accounts: store.accounts,
    templates: store.templates,
    settings: { ...settings, hasPin: !!pin },
    locked,
    version: app.getVersion(),
    userAgent: USER_AGENT,
  };
}

// ---------- PIN lock ----------

let locked = !!store.settings.pin;
let wrongTries = 0;
let blockedUntil = 0;

function hashPin(pin, salt) {
  return crypto.scryptSync(String(pin), salt, 32).toString('hex');
}

function checkPin(pin) {
  const p = store.settings.pin;
  if (!p) return true;
  const a = Buffer.from(hashPin(pin, p.salt), 'hex');
  const b = Buffer.from(p.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function setLocked(value) {
  if (value && !store.settings.pin) return;
  locked = value;
  send('locked', locked);
  updateTrayMenu();
}

// ---------- Window, tray and badge ----------

let win = null;
let tray = null;
let quitting = false;
let unreadTotal = 0;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function showWindow() {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    title: 'Multi Chat',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#111b21',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      spellcheck: true,
    },
  });
  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, 'index.html'));

  win.on('close', e => {
    if (!quitting && store.settings.closeToTray) {
      e.preventDefault();
      win.hide();
    }
  });
  win.on('closed', () => { win = null; });
  win.on('focus', () => win.flashFrame(false));
}

function createTray() {
  tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'icon.png')).resize({ width: 16, height: 16 }));
  tray.setToolTip('Multi Chat');
  tray.on('click', showWindow);
  updateTrayMenu();
}

function updateTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open Multi Chat', click: showWindow },
    { label: 'Lock now', enabled: !!store.settings.pin && !locked, click: () => setLocked(true) },
    { type: 'separator' },
    { label: 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

// Shortcuts work even with the menu bar hidden and while a WhatsApp page has focus.
function createMenu() {
  const accountItems = [];
  for (let i = 1; i <= 9; i++) {
    accountItems.push({ label: `Account ${i}`, accelerator: `CmdOrCtrl+${i}`, click: () => send('shortcut', { account: i - 1 }) });
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'Multi Chat',
      submenu: [
        { label: 'Quick replies', accelerator: 'CmdOrCtrl+Shift+Q', click: () => send('shortcut', { action: 'templates' }) },
        { label: 'Side by side', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('shortcut', { action: 'view' }) },
        { label: 'Lock', accelerator: 'CmdOrCtrl+L', click: () => setLocked(true) },
        { label: 'Reload account', accelerator: 'CmdOrCtrl+R', click: () => send('shortcut', { action: 'reload' }) },
        { type: 'separator' },
        { label: 'Quit', accelerator: 'CmdOrCtrl+Q', click: () => { quitting = true; app.quit(); } },
      ],
    },
    { label: 'Accounts', submenu: accountItems },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' }, { role: 'zoomOut' }, { role: 'resetZoom' },
        { role: 'togglefullscreen' },
        { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I', click: () => win && win.webContents.openDevTools({ mode: 'detach' }) },
      ],
    },
  ]));
}

// ---------- Security for the WhatsApp pages ----------

app.on('session-created', ses => {
  ses.setUserAgent(USER_AGENT);
  // Notifications (shown by us), microphone for voice notes, camera, clipboard and full screen.
  const allowed = new Set(['notifications', 'media', 'clipboard-read', 'clipboard-sanitized-write', 'fullscreen', 'mediaKeySystem']);
  ses.setPermissionRequestHandler((wc, permission, callback) => callback(allowed.has(permission)));
  ses.setPermissionCheckHandler((wc, permission) => allowed.has(permission));
});

app.on('web-contents-created', (_e, contents) => {
  // Every <webview> gets our small notification preload and safe settings, whatever the page asks.
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!String(params.src || '').startsWith(WA_ORIGIN) || !String(params.partition || '').startsWith('persist:acc-')) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preloadURL;
    webPreferences.preload = path.join(__dirname, 'wa-preload.js');
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.spellcheck = true;
  });

  if (contents.getType() === 'webview') {
    // Links in chats open in the normal browser; the box itself stays on WhatsApp Web.
    contents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    contents.on('will-navigate', (event, url) => {
      if (!url.startsWith(WA_ORIGIN)) {
        event.preventDefault();
        if (/^https?:/i.test(url)) shell.openExternal(url);
      }
    });
  }
});

// ---------- Messages from the window ----------

ipcMain.handle('state', () => publicState());

ipcMain.handle('save', (_e, patch) => {
  if (patch && Array.isArray(patch.accounts)) store.accounts = patch.accounts.map(cleanAccount);
  if (patch && Array.isArray(patch.templates)) {
    store.templates = patch.templates
      .map(t => ({ id: String(t.id), title: String(t.title || '').slice(0, 60), text: String(t.text || '').slice(0, 4000) }))
      .filter(t => t.text);
  }
  if (patch && patch.settings) {
    const s = patch.settings;
    if (s.view === 'one' || s.view === 'all') store.settings.view = s.view;
    if ('active' in s) store.settings.active = s.active;
    if ('closeToTray' in s) store.settings.closeToTray = !!s.closeToTray;
    if ('hidePreview' in s) store.settings.hidePreview = !!s.hidePreview;
    if ('autoLockMin' in s) store.settings.autoLockMin = Math.max(0, Math.min(240, +s.autoLockMin || 0));
    if ('startWithWindows' in s) {
      store.settings.startWithWindows = !!s.startWithWindows;
      if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: store.settings.startWithWindows, args: ['--hidden'] });
    }
  }
  save();
  updateTrayMenu();
  return publicState();
});

function cleanAccount(a) {
  const q = a.quiet || {};
  return {
    id: String(a.id).replace(/[^a-z0-9]/gi, '').slice(0, 24),
    name: String(a.name || 'Account').slice(0, 40),
    color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : '#25a18e',
    photo: typeof a.photo === 'string' && a.photo.startsWith('data:image/') ? a.photo : null,
    muted: !!a.muted,
    quiet: { on: !!q.on, from: String(q.from || '22:00'), to: String(q.to || '07:00') },
  };
}

ipcMain.handle('pick-photo', async () => {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose a photo for this account',
    properties: ['openFile'],
    filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif'] }],
  });
  if (r.canceled || !r.filePaths[0]) return null;
  const img = nativeImage.createFromPath(r.filePaths[0]);
  if (img.isEmpty()) return null;
  const { width, height } = img.getSize();
  const side = Math.min(width, height);
  const square = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
  return square.resize({ width: 128, height: 128, quality: 'best' }).toDataURL();
});

/** Removes a deleted account's sign-in, cookies and storage from this PC. */
ipcMain.handle('forget-account', async (_e, id) => {
  const { session } = require('electron');
  const ses = session.fromPartition(`persist:acc-${String(id).replace(/[^a-z0-9]/gi, '')}`);
  await ses.clearStorageData();
  await ses.clearCache();
  return true;
});

const notifications = new Set(); // keeps shown notifications alive so their click works

ipcMain.on('notify', (_e, { accountId, title, body }) => {
  const acc = store.accounts.find(a => a.id === accountId);
  if (!acc || acc.muted || inQuietHours(acc.quiet, new Date())) return;
  if (!Notification.isSupported()) return;
  const privateMode = locked || store.settings.hidePreview;
  const n = new Notification({
    title: privateMode ? acc.name : `${acc.name} · ${String(title).slice(0, 80)}`,
    body: privateMode ? 'New message' : String(body).slice(0, 300),
    icon: acc.photo ? nativeImage.createFromDataURL(acc.photo) : path.join(__dirname, 'icon.png'),
    silent: false,
  });
  n.on('click', () => {
    showWindow();
    send('select-account', accountId);
    notifications.delete(n);
  });
  n.on('close', () => notifications.delete(n));
  notifications.add(n);
  n.show();
  if (win && !win.isFocused()) win.flashFrame(true);
});

ipcMain.on('unread', (_e, { total, badge }) => {
  unreadTotal = Math.max(0, total | 0);
  if (win) {
    win.setTitle(unreadTotal ? `Multi Chat (${unreadTotal})` : 'Multi Chat');
    if (process.platform === 'win32') {
      win.setOverlayIcon(unreadTotal && badge ? nativeImage.createFromDataURL(badge) : null, unreadTotal ? `${unreadTotal} unread` : '');
    }
  }
  if (process.platform !== 'win32') app.setBadgeCount(unreadTotal);
  if (tray) tray.setToolTip(unreadTotal ? `Multi Chat: ${unreadTotal} unread` : 'Multi Chat');
});

ipcMain.handle('unlock', (_e, pin) => {
  const now = Date.now();
  if (now < blockedUntil) return { ok: false, wait: Math.ceil((blockedUntil - now) / 1000) };
  if (checkPin(pin)) {
    wrongTries = 0;
    setLocked(false);
    return { ok: true };
  }
  wrongTries++;
  if (wrongTries >= 5) {
    blockedUntil = now + 30_000;
    wrongTries = 0;
    return { ok: false, wait: 30 };
  }
  return { ok: false };
});

ipcMain.handle('lock-now', () => { setLocked(true); return locked; });

ipcMain.handle('set-pin', (_e, { current, pin }) => {
  if (store.settings.pin && !checkPin(current)) return { ok: false, error: 'The current PIN is wrong.' };
  if (pin == null || pin === '') {
    store.settings.pin = null;
    locked = false;
  } else {
    if (!/^\d{4,8}$/.test(String(pin))) return { ok: false, error: 'Use 4 to 8 digits.' };
    const salt = crypto.randomBytes(16).toString('hex');
    store.settings.pin = { salt, hash: hashPin(pin, salt) };
  }
  save();
  updateTrayMenu();
  return { ok: true, state: publicState() };
});

ipcMain.on('open-external', (_e, url) => {
  if (/^https:\/\//i.test(String(url))) shell.openExternal(url);
});

// ---------- Auto lock and update check ----------

function startAutoLock() {
  powerMonitor.on('lock-screen', () => setLocked(true));
  powerMonitor.on('suspend', () => setLocked(true));
  setInterval(() => {
    const min = store.settings.autoLockMin;
    if (!locked && min > 0 && store.settings.pin && powerMonitor.getSystemIdleTime() >= min * 60) setLocked(true);
  }, 15_000);
}

async function checkForUpdate() {
  try {
    const res = await net.fetch(RELEASE_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MultiChat-PC' } });
    if (!res.ok) return;
    const release = await res.json();
    const latest = versionFromTitle(release.name);
    if (latest && compareVersions(latest, app.getVersion()) > 0) {
      send('update', { version: latest, url: SETUP_URL, page: RELEASE_PAGE });
    }
  } catch {
    // Offline: try again next start.
  }
}

// ---------- Start ----------

app.on('second-instance', showWindow);

app.whenReady().then(() => {
  createMenu();
  createWindow();
  createTray();
  startAutoLock();
  if (process.argv.includes('--hidden') && store.settings.closeToTray) win.hide();
  win.webContents.once('did-finish-load', () => setTimeout(checkForUpdate, 5000));
});

app.on('before-quit', () => { quitting = true; });
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
