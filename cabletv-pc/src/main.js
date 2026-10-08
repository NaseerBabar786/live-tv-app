// Cable TV for Windows: the Cable TV app (Android TV) on a PC. The screens are in src/ui and work
// like the TV app's: the keyboard is the remote (arrows, Enter = OK, Esc = Back, Page Up/Down and
// the number keys change channel). This file is the window around them: crash rollback and crash
// reports, the update installer, the stream headers the TV app sends, and the locked YouTube pages
// of our own channels (shown in <webview>s, like the TV app's WebView).
const { app, BrowserWindow, ipcMain, session, shell, net, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { compareVersions, crashFields, streamHeaders, LIVETV_SIGNAL } = require('./util');

const APP_ID = 'ca.bulkbazaar.cabletv.pc';
app.setAppUserModelId(APP_ID);

// The YouTube pages and the websites we open expect a normal desktop Chrome.
const CHROME_MAJOR = (process.versions.chrome || '138').split('.')[0];
const CHROME_UA =
  `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_MAJOR}.0.0.0 Safari/537.36`;
app.userAgentFallback = CHROME_UA;
// Channels start playing by themselves, like on the TV.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Several tiles play at once (2×3): keep every one of them running when the window isn't in front.
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

// ---------- Saved state (one small JSON file in the user's AppData folder) ----------

const STORE_FILE = path.join(app.getPath('userData'), 'cabletv-pc.json');
let store = {};
try { store = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8')) || {}; } catch { store = {}; }
function save() {
  try {
    fs.mkdirSync(path.dirname(STORE_FILE), { recursive: true });
    fs.writeFileSync(STORE_FILE + '.tmp', JSON.stringify(store, null, 1));
    fs.renameSync(STORE_FILE + '.tmp', STORE_FILE);
  } catch (e) {
    console.error('Could not save', e);
  }
}
// This installation's id: the account record says which one device it's on (one device per free account).
if (!store.deviceId) { store.deviceId = crypto.randomUUID(); save(); }

// ---------- Crash rollback and crash reports (owner's rule for every app) ----------
//
// A crash in the first 30 seconds after start counts as "this version doesn't start": the next start
// shows the rescue screen, which goes back to the last good version with one click. Every crash (any
// time) is kept as a report and sent on the next start to Firestore crashReports, the list on
// tv.bulkbazaar.ca/crashes (Claude reads it with tools/crash_reports.py).

const REPORTS_URL = 'https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/' +
  'crashReports?key=AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE';
const START_WINDOW_MS = 30000;
const startedAt = Date.now();
const version = app.getVersion();

function recordCrash(error, fatal) {
  const onStart = Date.now() - startedAt < START_WINDOW_MS;
  const err = error instanceof Error ? error : new Error(String(error));
  store.crash = store.crash || {};
  store.crash.report = crashFields({
    app: APP_ID, version, error: `${err.name}: ${err.message}`, stack: err.stack || '', onStart,
    device: `PC (${os.arch()}, ${Math.round(os.totalmem() / 2 ** 30)} GB)`, os: `${os.type()} ${os.release()}`,
  });
  store.crash.lastError = `${err.name}: ${err.message}`.slice(0, 300);
  if (fatal && onStart) {
    store.crash.crashes = (store.crash.version === version ? store.crash.crashes || 0 : 0) + 1;
    store.crash.version = version;
  }
  save();
}

async function sendSavedReport() {
  const body = store.crash && store.crash.report;
  if (!body) return;
  try {
    const r = await net.fetch(REPORTS_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // 4xx: the report itself is refused (the rules); drop it rather than resend it for ever.
    if (r.status < 500) { delete store.crash.report; save(); }
  } catch {}
}

process.on('uncaughtException', (e) => {
  recordCrash(e, true);
  if (Date.now() - startedAt < START_WINDOW_MS) { app.exit(1); }
});

function needsRescue() {
  return store.crash && store.crash.version === version && (store.crash.crashes || 0) > 0;
}

// ---------- Releases (owner's release rule) ----------
//
// Approved builds are in the fixed "cable-tv-pc" release ("Cable TV for PC 1.9.88"); test builds,
// which only the owner is offered, in the "test" pre-release (versions-pc.json "cable-tv-pc");
// the last good version before the approved one in "rollback".
const REPO = 'https://github.com/NaseerBabar786/live-tv-app';
const RELEASE_API = 'https://api.github.com/repos/NaseerBabar786/live-tv-app/releases/tags/cable-tv-pc';
const SETUP = {
  approved: `${REPO}/releases/download/cable-tv-pc/CableTV-PC-Setup.exe`,
  test: `${REPO}/releases/download/test/CableTV-PC-Setup.exe`,
  rollback: `${REPO}/releases/download/rollback/CableTV-PC-Setup.exe`,
};
// The PC build writes its own file in "test" (the Android build rewrites versions.json on every run).
const TEST_VERSIONS = `${REPO}/releases/download/test/versions-pc.json`;
const portable = !!process.env.PORTABLE_EXECUTABLE_DIR;

async function fetchJson(url) {
  const r = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json, */*' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** The newest approved version ("1.9.88"), from the release's title. */
async function approvedVersion() {
  const rel = await fetchJson(RELEASE_API);
  const m = /(\d+(?:\.\d+)+)/.exec(rel.name || '');
  return m ? m[1] : null;
}

/** The owner's test build version, when it is newer than this one. */
async function testVersion() {
  const v = (await fetchJson(TEST_VERSIONS))['cable-tv-pc'];
  return v && compareVersions(v, version) > 0 ? v : null;
}

/** Downloads [url] to a file in the temp folder, telling the window how far it got. */
async function download(url, name, progress) {
  const r = await net.fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`The download failed (HTTP ${r.status}).`);
  const total = Number(r.headers.get('content-length')) || 0;
  const file = path.join(app.getPath('temp'), name);
  const out = fs.createWriteStream(file);
  const reader = r.body.getReader();
  let done = 0;
  for (;;) {
    const { value, done: end } = await reader.read();
    if (end) break;
    out.write(Buffer.from(value));
    done += value.length;
    if (total && progress) progress(done / total);
  }
  await new Promise((ok, fail) => out.end((e) => (e ? fail(e) : ok())));
  if (total && fs.statSync(file).size !== total) throw new Error('The download was incomplete. Please try again.');
  return file;
}

/** Runs the downloaded installer quietly; it closes this app, installs and opens the new version. */
function runInstaller(file) {
  const child = spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.exit(0), 500);
}

// ---------- Windows ----------

let win = null;
let rescueWin = null;

function send(channel, payload) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  win = new BrowserWindow({
    width: Math.min(1600, width),
    height: Math.min(900, height),
    minWidth: 960,
    minHeight: 540,
    title: 'Cable TV',
    icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      // The window shows only our own screens (src/ui). Channel streams come from many servers that
      // send no CORS headers and some still use http; like the TV app, the window plays them all.
      webSecurity: false,
      backgroundThrottling: false,
    },
  });
  win.once('ready-to-show', () => { win.maximize(); win.show(); });
  win.loadFile(path.join(__dirname, 'ui', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason === 'clean-exit') return;
    recordCrash(new Error(`The window stopped (${details.reason}, exit code ${details.exitCode})`), true);
    if (needsRescue()) { openRescue(); if (win) win.destroy(); }
    else win.reload();
  });
  win.on('enter-full-screen', () => send('fullscreen', true));
  win.on('leave-full-screen', () => send('fullscreen', false));
  // The screens didn't come up at all: that counts as a crash on start.
  const bootTimer = setTimeout(() => {
    if (uiReady) return;
    recordCrash(new Error('The screens did not start within 25 seconds'), true);
  }, 25000);
  win.on('closed', () => { clearTimeout(bootTimer); win = null; });
}

let uiReady = false;

function openRescue() {
  rescueWin = new BrowserWindow({
    width: 720, height: 460, resizable: false, title: 'Cable TV', icon: path.join(__dirname, 'icon.png'),
    backgroundColor: '#1E1E2E', autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  rescueWin.loadFile(path.join(__dirname, 'ui', 'rescue.html'));
  rescueWin.on('closed', () => { rescueWin = null; });
}

// ---------- Stream headers ----------
//
// The TV app plays every stream with its own User-Agent ("LiveTV-Android/1.0"), or the one the
// channel list gives, and the list's Referer. The window can't set those itself, so they are put on
// here, for the stream servers only (never on our website, Firebase, YouTube or GitHub).
let channelHeaders = {}; // host -> { ua, referrer }

function installStreamHeaders() {
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const fromWindow = win && !win.isDestroyed() && details.webContentsId === win.webContents.id;
    if (!fromWindow) return callback({ requestHeaders: details.requestHeaders });
    callback({ requestHeaders: streamHeaders(details.url, details.resourceType, details.requestHeaders, channelHeaders) });
  });
}

// ---------- Locked YouTube pages (<webview>) ----------
//
// Our channels that run on YouTube play on our own locked pages (tv.bulkbazaar.ca/channel/...), as
// on the TV. The pages say "livetv://fallback" when YouTube won't play (the channel's free films
// play instead) and "livetv://done" when Bazaar TV's run of trailers is over. The remote's keys
// (Up/Down, numbers, Esc) belong to the app, not the page, so they are passed to the window.
const APP_KEYS = new Set(['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Escape', 'Backspace', 'F11', 'F', 'f',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

app.on('web-contents-created', (_e, contents) => {
  if (contents.getType() !== 'webview') return;
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const signal = (e, url) => {
    const s = LIVETV_SIGNAL(url);
    if (!s) return;
    e.preventDefault();
    send('web-signal', { id: contents.id, signal: s });
  };
  // Owner's rule (2026-10-07): no YouTube screen ever shows in our app, so neither our page nor YouTube's
  // player inside it can take the window to YouTube's own site (YouTubePlayer.kt does the same on Android).
  contents.on('will-navigate', (e, url) => {
    if (/^https?:\/\/([\w-]+\.)*(youtube\.com|youtube-nocookie\.com|youtu\.be)(\/|$|[?#])/i.test(url || e.url || '')) { e.preventDefault(); return; }
    signal(e, url);
  });
  contents.on('will-frame-navigate', (e) => signal(e, e.url));
  contents.on('render-process-gone', () => send('web-signal', { id: contents.id, signal: 'fallback' }));
  contents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !APP_KEYS.has(input.key)) return;
    e.preventDefault();
    send('web-key', { id: contents.id, key: input.key, repeat: !!input.isAutoRepeat });
  });
});

// ---------- Messages from the screens ----------

ipcMain.handle('info', () => ({
  version, deviceId: store.deviceId, platform: process.platform, portable, arch: os.arch(),
  os: `${os.type()} ${os.release()}`, lastError: store.crash && store.crash.lastError,
}));
ipcMain.on('ui-ready', () => {
  uiReady = true;
  // Started fine: older crashes are forgotten.
  setTimeout(() => {
    if (store.crash && store.crash.crashes) { store.crash.crashes = 0; save(); }
  }, Math.max(0, START_WINDOW_MS - (Date.now() - startedAt)));
});
ipcMain.on('ui-error', (_e, { message, stack }) => {
  // Errors in the screens: reported, but they don't close the app, so they don't roll it back.
  recordCrash(Object.assign(new Error(message), { name: 'ScreenError', stack: stack || message }), false);
  sendSavedReport();
});
ipcMain.on('stream-headers', (_e, map) => { channelHeaders = map || {}; });
ipcMain.on('fullscreen', (_e, on) => {
  if (!win) return;
  win.setFullScreen(on === 'toggle' ? !win.isFullScreen() : !!on);
});
ipcMain.handle('is-fullscreen', () => !!(win && win.isFullScreen()));
ipcMain.on('open-external', (_e, url) => { if (/^https?:\/\//.test(url)) shell.openExternal(url); });
ipcMain.on('quit', () => app.quit());

ipcMain.handle('check-update', async (_e, { owner }) => {
  const out = { version };
  try { out.approved = await approvedVersion(); } catch (e) { out.error = String(e.message || e); }
  if (owner) { try { out.test = await testVersion(); } catch {} }
  out.newer = out.approved && compareVersions(out.approved, version) > 0 ? out.approved : null;
  return out;
});

ipcMain.handle('install', async (event, which) => {
  if (portable) {
    shell.openExternal(`${REPO}/releases/tag/${which === 'test' ? 'test' : 'cable-tv-pc'}`);
    return { opened: true };
  }
  const url = SETUP[which] || SETUP.approved;
  const file = await download(url, `CableTV-PC-${which}-Setup.exe`, (p) => event.sender.send('install-progress', p));
  runInstaller(file);
  return { started: true };
});

// The rescue screen: back to the last good version. When this version is the approved one, the
// version approved before it (rollback); otherwise (a test build) the approved one.
ipcMain.handle('rescue-info', async () => ({ version, lastError: store.crash && store.crash.lastError }));
ipcMain.handle('rescue-go-back', async (event) => {
  let which = 'approved';
  try {
    const approved = await approvedVersion();
    if (!approved || approved === version) which = 'rollback';
  } catch {}
  if (portable) { shell.openExternal(`${REPO}/releases/tag/${which === 'rollback' ? 'rollback' : 'cable-tv-pc'}`); return { opened: true }; }
  const file = await download(SETUP[which], 'CableTV-PC-LastGood-Setup.exe', (p) => event.sender.send('install-progress', p));
  store.crash = {};
  save();
  runInstaller(file);
  return { started: true };
});
ipcMain.on('rescue-try-again', () => {
  store.crash.crashes = 0;
  save();
  app.relaunch();
  app.exit(0);
});

// ---------- Start ----------

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});

app.whenReady().then(() => {
  sendSavedReport();
  if (needsRescue()) { openRescue(); return; }
  installStreamHeaders();
  createWindow();
});

app.on('window-all-closed', () => app.quit());
