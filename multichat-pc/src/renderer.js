// The Multi Chat window: the account bar on the left, one WhatsApp Web box per account,
// quick replies, settings and the PIN lock screen.
'use strict';

const COLORS = ['#25a18e', '#1e88e5', '#8e24aa', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#00acc1', '#d81b60', '#6d4c41'];
const $ = sel => document.querySelector(sel);

let state = null; // { accounts, templates, settings, locked, version, userAgent }
const panes = new Map(); // account id -> { pane, webview, unread, button }

// ---------- Saving ----------

function saveAccounts() { return window.mc.save({ accounts: state.accounts }); }
function saveTemplates() { return window.mc.save({ templates: state.templates }); }
function saveSettings(patch) {
  Object.assign(state.settings, patch);
  return window.mc.save({ settings: patch });
}

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ---------- Account bar ----------

function avatarHtml(el, acc) {
  el.style.setProperty('--c', acc.color);
  if (acc.photo) {
    el.style.backgroundImage = `url("${acc.photo}")`;
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = MCUtil.initials(acc.name);
  }
}

function renderBar() {
  const box = $('#accounts');
  box.textContent = '';
  state.accounts.forEach((acc, i) => {
    const b = document.createElement('button');
    b.className = 'acc';
    b.setAttribute('role', 'tab');
    b.style.setProperty('--c', acc.color);
    b.title = `${acc.name}${i < 9 ? ` (Ctrl+${i + 1})` : ''}\nRight-click to edit`;
    const av = document.createElement('div');
    av.className = 'avatar';
    avatarHtml(av, acc);
    const badge = document.createElement('span');
    badge.className = 'badge';
    b.append(av, badge);
    if (acc.muted || MCUtil.inQuietHours(acc.quiet, new Date())) {
      const moon = document.createElement('span');
      moon.className = 'moon';
      moon.textContent = '🔕';
      b.append(moon);
    }
    b.addEventListener('click', () => select(acc.id));
    b.addEventListener('contextmenu', e => { e.preventDefault(); editAccount(acc.id); });
    b.addEventListener('dblclick', () => editAccount(acc.id));
    box.append(b);
    const p = panes.get(acc.id);
    if (p) p.button = b;
  });
  updateBadges();
  markActive();
}

function updateBadges() {
  let total = 0;
  for (const acc of state.accounts) {
    const p = panes.get(acc.id);
    if (!p) continue;
    total += p.unread;
    if (p.button) {
      const badge = p.button.querySelector('.badge');
      badge.hidden = !p.unread;
      badge.textContent = p.unread > 99 ? '99+' : String(p.unread);
    }
    const count = p.pane.querySelector('.count');
    count.textContent = p.unread ? `${p.unread} unread` : '';
  }
  window.mc.unread(total, total ? badgeImage(total) : null);
}

/** Small round count for the Windows taskbar icon. */
function badgeImage(n) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.fillStyle = '#e53935';
  g.beginPath();
  g.arc(16, 16, 15, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `bold ${n > 99 ? 12 : n > 9 ? 16 : 20}px Segoe UI, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(n > 99 ? '99+' : String(n), 16, 17);
  return c.toDataURL('image/png');
}

// ---------- WhatsApp boxes ----------

function createPane(acc) {
  const pane = document.createElement('section');
  pane.className = 'pane off';
  pane.style.setProperty('--c', acc.color);
  const header = document.createElement('header');
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = acc.name;
  const count = document.createElement('span');
  count.className = 'count';
  header.append(name, count);
  header.addEventListener('click', () => select(acc.id));

  const wv = document.createElement('webview');
  wv.setAttribute('partition', `persist:acc-${acc.id}`);
  wv.setAttribute('useragent', state.userAgent);
  wv.setAttribute('webpreferences', 'contextIsolation=yes, spellcheck=yes');
  wv.setAttribute('src', 'https://web.whatsapp.com/');

  const entry = { pane, webview: wv, unread: 0, button: null, failed: false };
  wv.addEventListener('page-title-updated', e => {
    const n = MCUtil.unreadFromTitle(e.title);
    if (n !== entry.unread) {
      entry.unread = n;
      updateBadges();
    }
  });
  wv.addEventListener('ipc-message', e => {
    if (e.channel === 'notify' && e.args[0]) window.mc.notify(acc.id, e.args[0].title, e.args[0].body);
  });
  wv.addEventListener('focus', () => { if (state.settings.active !== acc.id) select(acc.id, false); });
  wv.addEventListener('did-fail-load', e => {
    // -3 is a cancelled load (WhatsApp moving between its own pages), not an error.
    if (!e.isMainFrame || e.errorCode === -3) return;
    entry.failed = true;
    showOffline(entry);
  });
  wv.addEventListener('did-start-loading', () => { entry.failed = false; });
  wv.addEventListener('did-finish-load', () => {
    const off = pane.querySelector('.offline');
    if (off && !entry.failed) off.remove();
  });

  pane.append(header, wv);
  $('#panes').append(pane);
  panes.set(acc.id, entry);
  return entry;
}

function showOffline(entry) {
  if (entry.pane.querySelector('.offline')) return;
  const box = document.createElement('div');
  box.className = 'offline';
  box.innerHTML = '<b>WhatsApp Web did not load.</b><span class="hint">Check the internet connection.</span>';
  const retry = document.createElement('button');
  retry.className = 'primary';
  retry.textContent = 'Try again';
  retry.addEventListener('click', () => { box.remove(); entry.webview.reload(); });
  box.append(retry);
  entry.pane.append(box);
}

function syncPanes() {
  const ids = new Set(state.accounts.map(a => a.id));
  for (const [id, p] of panes) {
    if (!ids.has(id)) {
      p.pane.remove();
      panes.delete(id);
    }
  }
  for (const acc of state.accounts) {
    const p = panes.get(acc.id) || createPane(acc);
    p.pane.style.setProperty('--c', acc.color);
    p.pane.querySelector('.name').textContent = acc.name;
    $('#panes').append(p.pane); // keeps the boxes in bar order for side by side
  }
  $('#welcome').hidden = state.accounts.length > 0;
  layout();
}

function layout() {
  const all = state.settings.view === 'all' && state.accounts.length > 1;
  const box = $('#panes');
  box.classList.toggle('all', all);
  const n = state.accounts.length;
  const cols = n <= 3 ? n : Math.ceil(n / 2);
  box.style.gridTemplateColumns = all ? `repeat(${cols}, minmax(0, 1fr))` : '';
  $('#btnView').setAttribute('aria-pressed', String(all));
  markActive();
}

function markActive() {
  const active = state.settings.active;
  for (const [id, p] of panes) {
    p.pane.classList.toggle('off', id !== active);
    p.pane.classList.toggle('on', id === active);
    if (p.button) p.button.classList.toggle('on', id === active);
  }
}

function select(id, focus = true) {
  if (!panes.has(id)) return;
  if (state.settings.active !== id) saveSettings({ active: id });
  markActive();
  if (focus) panes.get(id).webview.focus();
}

function activeWebview() {
  const p = panes.get(state.settings.active);
  return p ? p.webview : null;
}

// ---------- Account dialog ----------

let editingId = null;
let draft = null;

function addAccount() {
  const used = new Set(state.accounts.map(a => a.color));
  const color = COLORS.find(c => !used.has(c)) || COLORS[state.accounts.length % COLORS.length];
  const acc = {
    id: newId(),
    name: `Account ${state.accounts.length + 1}`,
    color,
    photo: null,
    muted: false,
    quiet: { on: false, from: '22:00', to: '07:00' },
  };
  state.accounts.push(acc);
  saveAccounts();
  syncPanes();
  renderBar();
  select(acc.id, false);
  editAccount(acc.id, true);
}

function editAccount(id, isNew = false) {
  const acc = state.accounts.find(a => a.id === id);
  if (!acc) return;
  editingId = id;
  draft = JSON.parse(JSON.stringify(acc));
  $('#accTitle').textContent = isNew ? 'New account' : 'Edit account';
  $('#accName').value = draft.name;
  $('#accMuted').checked = draft.muted;
  $('#accQuiet').checked = draft.quiet.on;
  $('#accFrom').value = draft.quiet.from;
  $('#accTo').value = draft.quiet.to;
  renderDraft();
  $('#accDialog').showModal();
  $('#accName').select();
}

function renderDraft() {
  avatarHtml($('#accAvatar'), { ...draft, name: $('#accName').value || draft.name });
  $('#accPhotoRemove').hidden = !draft.photo;
  const box = $('#accColors');
  box.textContent = '';
  for (const c of COLORS) {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'swatch';
    s.style.setProperty('--c', c);
    s.setAttribute('aria-label', c);
    s.setAttribute('aria-pressed', String(c === draft.color));
    s.addEventListener('click', () => { draft.color = c; renderDraft(); });
    box.append(s);
  }
}

$('#accName').addEventListener('input', renderDraft);
$('#accPhoto').addEventListener('click', async () => {
  const photo = await window.mc.pickPhoto();
  if (photo) { draft.photo = photo; renderDraft(); }
});
$('#accPhotoRemove').addEventListener('click', () => { draft.photo = null; renderDraft(); });
$('#accOk').addEventListener('click', e => {
  const name = $('#accName').value.trim();
  if (!name) return;
  e.preventDefault();
  draft.name = name;
  draft.muted = $('#accMuted').checked;
  draft.quiet = { on: $('#accQuiet').checked, from: $('#accFrom').value || '22:00', to: $('#accTo').value || '07:00' };
  const i = state.accounts.findIndex(a => a.id === editingId);
  if (i >= 0) state.accounts[i] = draft;
  saveAccounts();
  syncPanes();
  renderBar();
  $('#accDialog').close();
});
function move(delta) {
  const i = state.accounts.findIndex(a => a.id === editingId);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= state.accounts.length) return;
  [state.accounts[i], state.accounts[j]] = [state.accounts[j], state.accounts[i]];
  saveAccounts();
  syncPanes();
  renderBar();
}
$('#accUp').addEventListener('click', () => move(-1));
$('#accDown').addEventListener('click', () => move(1));
$('#accReload').addEventListener('click', () => {
  const p = panes.get(editingId);
  if (p) p.webview.reloadIgnoringCache();
  $('#accDialog').close();
});
$('#accDelete').addEventListener('click', async () => {
  const acc = state.accounts.find(a => a.id === editingId);
  if (!acc) return;
  const ok = await confirmBox(`Remove “${acc.name}” from Multi Chat? It signs this account out on this PC. ` +
    'Your chats stay on your phone. Also remove it from WhatsApp > Linked devices on your phone.');
  if (!ok) return;
  $('#accDialog').close();
  const id = acc.id;
  state.accounts = state.accounts.filter(a => a.id !== id);
  if (state.settings.active === id) saveSettings({ active: state.accounts[0] ? state.accounts[0].id : null });
  await saveAccounts();
  syncPanes();
  renderBar();
  window.mc.forgetAccount(id);
});

function confirmBox(text) {
  return new Promise(resolve => {
    const d = $('#confirmDialog');
    $('#confirmText').textContent = text;
    d.returnValue = '';
    d.addEventListener('close', () => resolve(d.returnValue === 'ok'), { once: true });
    d.showModal();
  });
}

// ---------- Quick replies ----------

let editingTpl = null;

function toggleDrawer(open = $('#drawer').hidden) {
  $('#drawer').hidden = !open;
  $('#btnTemplates').setAttribute('aria-pressed', String(open));
  if (open) {
    renderTemplates();
    $('#tplSearch').focus();
  }
}

function renderTemplates() {
  const q = $('#tplSearch').value.trim().toLowerCase();
  const box = $('#tplList');
  box.textContent = '';
  const list = state.templates.filter(t => !q || (t.title + ' ' + t.text).toLowerCase().includes(q));
  if (!list.length) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.textContent = q ? 'No replies match.' : 'No quick replies yet. Add one below.';
    box.append(p);
  }
  for (const t of list) {
    const item = document.createElement('div');
    item.className = 'tpl';
    item.title = 'Click to type this into the open chat';
    const b = document.createElement('b');
    b.textContent = t.title || t.text.slice(0, 30);
    const p = document.createElement('p');
    p.textContent = t.text;
    const acts = document.createElement('div');
    acts.className = 'acts';
    const copy = document.createElement('button');
    copy.textContent = 'Copy';
    copy.addEventListener('click', e => { e.stopPropagation(); navigator.clipboard.writeText(t.text); });
    const edit = document.createElement('button');
    edit.textContent = 'Edit';
    edit.addEventListener('click', e => { e.stopPropagation(); startEditTemplate(t); });
    const del = document.createElement('button');
    del.textContent = '✕';
    del.title = 'Delete';
    del.addEventListener('click', e => {
      e.stopPropagation();
      state.templates = state.templates.filter(x => x.id !== t.id);
      saveTemplates();
      renderTemplates();
    });
    acts.append(copy, edit, del);
    item.append(b, p, acts);
    item.addEventListener('click', () => insertTemplate(t.text));
    box.append(item);
  }
}

/** Types the reply into the chat box of the open account. The person presses Send. */
function insertTemplate(text) {
  const wv = activeWebview();
  if (!wv) return;
  wv.focus();
  wv.insertText(text);
}

function startEditTemplate(t) {
  editingTpl = t ? t.id : null;
  $('#tplTitle').value = t ? t.title : '';
  $('#tplText').value = t ? t.text : '';
  $('#tplSave').textContent = t ? 'Save reply' : 'Add reply';
  $('#tplCancel').hidden = !t;
  if (t) $('#tplText').focus();
}

$('#tplForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#tplTitle').value.trim();
  const text = $('#tplText').value.trim();
  if (!text) return;
  if (editingTpl) {
    const t = state.templates.find(x => x.id === editingTpl);
    if (t) Object.assign(t, { title, text });
  } else {
    state.templates.push({ id: newId(), title, text });
  }
  saveTemplates();
  startEditTemplate(null);
  renderTemplates();
});
$('#tplCancel').addEventListener('click', () => startEditTemplate(null));
$('#tplSearch').addEventListener('input', renderTemplates);
$('#drawerClose').addEventListener('click', () => toggleDrawer(false));

// ---------- Settings ----------

function openSettings() {
  const s = state.settings;
  $('#setAutoLock').value = String(s.autoLockMin || 0);
  $('#setHidePreview').checked = s.hidePreview;
  $('#setTray').checked = s.closeToTray;
  $('#setStartup').checked = s.startWithWindows;
  $('#about').textContent = `Multi Chat ${state.version} for Windows. Each account is the official WhatsApp Web in its own ` +
    'separate box. Multi Chat is not made by or connected with WhatsApp or Meta.';
  renderPin();
  $('#setDialog').showModal();
}

function renderPin() {
  const has = state.settings.hasPin;
  $('#pinStatus').textContent = has
    ? 'A PIN is set. Multi Chat asks for it when it starts and when it locks.'
    : 'Set a PIN to lock Multi Chat so others using this PC cannot read your chats.';
  $('#pinCurrent').hidden = !has;
  $('#pinRemove').hidden = !has;
  $('#pinSet').textContent = has ? 'Change PIN' : 'Set PIN';
  $('#pinCurrent').value = '';
  $('#pinNew').value = '';
  $('#setAutoLock').disabled = !has;
}

async function applyPin(pin) {
  const r = await window.mc.setPin($('#pinCurrent').value, pin);
  if (!r.ok) {
    $('#pinMsg').textContent = r.error;
    return;
  }
  $('#pinMsg').textContent = '';
  state.settings.hasPin = r.state.settings.hasPin;
  renderPin();
  $('#pinStatus').textContent = pin ? 'PIN saved. Use the lock button or Ctrl+L to lock.' : 'PIN removed.';
}

$('#pinSet').addEventListener('click', () => applyPin($('#pinNew').value.trim()));
$('#pinRemove').addEventListener('click', () => applyPin(''));
$('#setAutoLock').addEventListener('change', e => saveSettings({ autoLockMin: +e.target.value }));
$('#setHidePreview').addEventListener('change', e => saveSettings({ hidePreview: e.target.checked }));
$('#setTray').addEventListener('change', e => saveSettings({ closeToTray: e.target.checked }));
$('#setStartup').addEventListener('change', e => saveSettings({ startWithWindows: e.target.checked }));

// ---------- Lock ----------

function showLock(locked) {
  state.locked = locked;
  document.body.classList.toggle('locked', locked);
  $('#lock').hidden = !locked;
  if (locked) {
    for (const d of document.querySelectorAll('dialog[open]')) d.close();
    $('#lockPin').value = '';
    $('#lockError').textContent = '';
    setTimeout(() => $('#lockPin').focus(), 50);
  }
}

$('#lockForm').addEventListener('submit', async e => {
  e.preventDefault();
  const r = await window.mc.unlock($('#lockPin').value);
  $('#lockPin').value = '';
  if (r.ok) return;
  $('#lockError').textContent = r.wait ? `Too many tries. Wait ${r.wait} seconds.` : 'Wrong PIN. Try again.';
});

$('#btnLock').addEventListener('click', async () => {
  if (!state.settings.hasPin) {
    openSettings();
    $('#pinStatus').textContent = 'Set a PIN first, then the lock button locks Multi Chat.';
    $('#pinNew').focus();
    return;
  }
  window.mc.lockNow();
});

// ---------- Buttons, shortcuts and events ----------

$('#add').addEventListener('click', addAccount);
$('#welcomeAdd').addEventListener('click', addAccount);
$('#btnTemplates').addEventListener('click', () => toggleDrawer());
$('#btnSettings').addEventListener('click', openSettings);
$('#btnView').addEventListener('click', toggleView);

function toggleView() {
  saveSettings({ view: state.settings.view === 'all' ? 'one' : 'all' });
  layout();
}

window.mc.on('locked', showLock);
window.mc.on('select-account', id => select(id));
window.mc.on('shortcut', s => {
  if (state.locked) return;
  if (typeof s.account === 'number' && state.accounts[s.account]) select(state.accounts[s.account].id);
  if (s.action === 'templates') toggleDrawer();
  if (s.action === 'view') toggleView();
  if (s.action === 'reload' && activeWebview()) activeWebview().reload();
});
window.mc.on('update', u => {
  $('#updateText').textContent = `Multi Chat ${u.version} is available. Download it and run the installer to update.`;
  $('#update').hidden = false;
  $('#updateGet').onclick = () => { window.mc.openExternal(u.url); $('#update').hidden = true; };
  $('#updateLater').onclick = () => { $('#update').hidden = true; };
});

// Quiet-hour moons on the bar follow the clock.
setInterval(() => { if (state) renderBar(); }, 60_000);

(async function start() {
  state = await window.mc.state();
  if (!state.accounts.some(a => a.id === state.settings.active)) {
    state.settings.active = state.accounts[0] ? state.accounts[0].id : null;
  }
  syncPanes();
  renderBar();
  showLock(state.locked);
})();
