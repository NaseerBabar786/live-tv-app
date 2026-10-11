// Tambola (housie): the TV calls numbers 1 to 90 one by one; everyone marks them on a 3 x 9 ticket
// (15 numbers, 5 in each row). Prizes: Early Five, Top / Middle / Bottom line and Full House; a claim is
// checked against the called numbers. 1 to 4 players on one TV, any seat can be the TV.
// Remote: arrows move over your numbers (◀ ▶ past the edge jumps to the next ticket), OK marks,
// ▲ from the top row reaches the Claim button. With Auto mark, OK calls the next number sooner.
'use strict';

(() => {
  const CFG = {
    id: 'tambola', title: 'Tambola', defN: 2, minP: 1, maxP: 4,
    how: 'Mark the numbers the TV calls. Claim Early Five, a line, or a Full House!',
    bg: ['#3a1257', '#12051f', 'rgba(255,120,220,0.10)'],
    menuTop: '#5a2384', menuBottom: '#24083d', titleColor: '#ffd36b',
    skillTips: ['Slow calls, marks itself, sparkles', 'You mark, hints sparkle', 'Fast calls, no hints'],
    extraRows: [{
      key: 'mark', label: 'Marking', values: ['hand', 'auto'], names: ['By hand', 'Auto mark'],
      tip: (v, sk) => (sk === 0 ? 'Beginner: always auto' : v === 'auto' ? 'Marks and claims for you' : 'You mark and claim'),
    }],
    optDefaults: { mark: 'hand' },
    recordText: () => `👑 Wins: ${wins}`,
    bannerY: 700, mutePos: [1862, 392],
  };
  // ---------- Family frame: a 1920 x 1080 stage, seats (Person / TV), skill, start menu, turn banner,
  // pass-the-remote cover and the results screen. Every game below plugs into it through GAME. ----------
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const VW = 1920, VH = 1080;
  const V = { s: 1, ox: 0, oy: 0 };
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const AUTO = /auto/.test(location.hash || '');
  const SPEED = AUTO ? 4 : 1;
  const AUTO_N = parseInt(((location.hash || '').match(/auto(\d)/) || [])[1], 10) || 0;
  const SEAT_COLORS = ['#ff4d6d', '#3d8bff', '#2ed573', '#ffb627'];
  const SKILLS = ['Beginner', 'Normal', 'Hard'];
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

  function fit(W, H) {
    V.s = Math.max(0.05, Math.min(W / VW, H / VH) || 1);
    V.ox = (W - VW * V.s) / 2; V.oy = (H - VH * V.s) / 2;
  }
  const SX = (x) => V.ox + x * V.s, SY = (y) => V.oy + y * V.s;
  const toV = (e) => ({ x: (e.x - V.ox) / V.s, y: (e.y - V.oy) / V.s });
  function fxBurst(x, y, col, n = 14, sp = 1) { try { Kit.burst(SX(x), SY(y), col, n, sp * V.s * 1.4); } catch (e) { /* fx only */ } }
  function fxText(str, x, y, o = {}) { try { Kit.float(str, SX(x), SY(y), Object.assign({}, o, { size: (o.size || 48) * V.s })); } catch (e) { /* fx only */ } }
  // A canvas drawn once per size, in stage units.
  function bake(w, h, fn) {
    const cv = document.createElement('canvas');
    const k = V.s * DPR();
    cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
    const c = cv.getContext('2d');
    c.scale(k, k);
    try { fn(c); } catch (e) { /* keep what was drawn */ }
    return cv;
  }

  // ---------- Text and panels ----------
  function text(c, str, x, y, size, color, weight = 700, align = 'center', maxW = 0, font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    if (maxW > 0) {
      const w = c.measureText(str).width;
      if (w > maxW) c.font = `${weight} ${Math.max(8, Math.floor(size * maxW / w))}px ${font}`;
    }
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center', maxW = 0) {
    c.save();
    c.font = `800 ${Math.round(size)}px ${Kit.FONT}`;
    if (maxW > 0) { const w = c.measureText(str).width; if (w > maxW) { size = size * maxW / w; c.font = `800 ${Math.round(size)}px ${Kit.FONT}`; } }
    c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(12,6,30,0.85)'; c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
    c.restore();
  }
  function panel(c, x, y, w, h, r, top = '#2b2f6e', bottom = '#151838', border = 'rgba(255,255,255,0.22)', bw = 2) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 26; c.shadowOffsetY = 10;
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    // top sheen
    roundRect(c, x + 3, y + 3, w - 6, Math.min(h * 0.45, 60), r * 0.8);
    const s = c.createLinearGradient(0, y, 0, y + Math.min(h * 0.45, 60));
    s.addColorStop(0, 'rgba(255,255,255,0.13)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = s; c.fill();
    if (bw > 0) { c.lineWidth = bw; c.strokeStyle = border; roundRect(c, x, y, w, h, r); c.stroke(); }
    c.restore();
  }
  // A focus ring that breathes, for whatever the remote is on.
  function focusRing(c, x, y, w, h, r, t, col = '#ffe066') {
    c.save();
    const p = 0.6 + 0.4 * Math.sin(t * 6);
    c.shadowColor = col; c.shadowBlur = 16 + 14 * p;
    c.lineWidth = 5; c.strokeStyle = col;
    roundRect(c, x - 5, y - 5, w + 10, h + 10, r + 5); c.stroke();
    c.restore();
  }
  // A glossy pill / button. kind: 'go' green, 'gold', 'blue', 'red', 'off'.
  const BTN = {
    go: ['#8dffbf', '#17b862', '#06321a'], gold: ['#ffe680', '#ff9f1c', '#3d1f00'], blue: ['#7fb8ff', '#2a5fd6', '#ffffff'],
    red: ['#ff9aa8', '#e5304d', '#ffffff'], off: ['rgba(140,150,220,0.32)', 'rgba(40,46,110,0.6)', 'rgba(255,255,255,0.85)'],
  };
  function button(c, x, y, w, h, label, kind, focus, t, size = 0) {
    const col = BTN[kind] || BTN.blue;
    const k = focus ? 1.05 + Math.sin(t * 6) * 0.018 : 1;
    c.save();
    c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 14; c.shadowOffsetY = 6;
    roundRect(c, -w / 2, -h / 2, w, h, h / 2);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, col[0]); g.addColorStop(1, col[1]);
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    roundRect(c, -w / 2 + 6, -h / 2 + 4, w - 12, h * 0.42, h * 0.3);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fill();
    c.lineWidth = focus ? 5 : 2; c.strokeStyle = focus ? '#ffffff' : 'rgba(255,255,255,0.35)';
    roundRect(c, -w / 2, -h / 2, w, h, h / 2); c.stroke();
    if (focus) { c.shadowColor = '#ffe066'; c.shadowBlur = 24; c.stroke(); c.shadowColor = 'transparent'; }
    text(c, label, 0, h * 0.04, size || h * 0.46, col[2], 800, 'center', w * 0.88, Kit.FONT);
    c.restore();
  }
  // A glossy round token in a seat colour.
  function token(c, x, y, r, col) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = r * 0.5; c.shadowOffsetY = r * 0.18;
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, shade(col, 0.55)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.45));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.ellipse(x - r * 0.3, y - r * 0.45, r * 0.38, r * 0.2, -0.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ---------- Seats, skill and options (remembered) ----------
  const saved = Kit.store.get(CFG.id + '.setup', null) || {};
  let seatCount = clamp((saved.n | 0) || CFG.defN, CFG.minP, CFG.maxP);
  let seatTV = Array.isArray(saved.tv) && saved.tv.length === 4 ? saved.tv.map(Boolean) : [false, true, true, true];
  let skill = clamp(Kit.store.get(CFG.id + '.skill', 0) | 0, 0, 2); // first time: Beginner
  const opts = Object.assign({}, CFG.optDefaults || {}, Kit.store.get(CFG.id + '.opts', {}) || {});
  let wins = Kit.store.get(CFG.id + '.wins', 0) | 0;
  function saveSetup() {
    Kit.store.set(CFG.id + '.setup', { n: seatCount, tv: seatTV });
    Kit.store.set(CFG.id + '.skill', skill);
    Kit.store.set(CFG.id + '.opts', opts);
  }
  function addWin() { wins++; Kit.store.set(CFG.id + '.wins', wins); Kit.record(CFG.id, wins); }

  let players = [];
  const humansCount = () => players.filter((p) => p.human).length;
  function buildPlayers() {
    const n = AUTO ? clamp(AUTO_N || Math.max(2, seatCount), CFG.minP, CFG.maxP) : seatCount;
    const isTV = (i) => AUTO || seatTV[i];
    let persons = 0;
    for (let i = 0; i < n; i++) if (!isTV(i)) persons++;
    players = [];
    for (let i = 0; i < n; i++) {
      const human = !isTV(i);
      players.push({ seat: i, human, color: SEAT_COLORS[i], name: human ? (persons === 1 ? 'You' : 'Player ' + (i + 1)) : 'TV ' + (i + 1) });
    }
  }
  const turnLine = (p) => (p.human ? (p.name === 'You' ? 'Your turn!' : `${p.name}'s turn`) : `${p.name} is playing`);

  // ---------- State ----------
  let state = 'menu', clock = 0;
  let menuRow = 0, seatFocus = 0;
  let banner = null, cover = null, result = null;
  let hits = [];
  const inside = (p, r) => p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;

  function showBanner(p, sub = '') {
    banner = { p, text: turnLine(p), sub, t: 0 };
    if (p.human) { Kit.tone(620, { type: 'triangle', dur: 0.12, vol: 0.14, slide: 1.3 }); Kit.tone(930, { type: 'sine', dur: 0.14, vol: 0.07, at: 0.07 }); }
    else Kit.tone(440, { type: 'triangle', dur: 0.1, vol: 0.08, slide: 1.2 });
  }
  const bannerBusy = () => !!banner && banner.t < 0.55 / SPEED;
  // Before a person's private tiles show: everyone else looks away.
  function needsCover(p) { return !AUTO && p && p.human && humansCount() > 1; }
  function showCover(p, then) { cover = { p, then, t: 0 }; Kit.sfx.chime(); }

  function startGame() {
    saveSetup();
    buildPlayers();
    banner = null; cover = null; result = null;
    state = 'play';
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.12, at: 0.08 });
    try { GAME.start(); } catch (e) { report(e); }
  }
  function toMenu() { state = 'menu'; result = null; cover = null; banner = null; menuRow = menuRows().length - 1; }
  // ranking: [{ p, score, note }], best first. winners: players who won.
  function showResults(ranking, headline, sub) {
    state = 'over';
    result = { ranking, headline, sub, t: 0, sel: 0 };
    Kit.sfx.win(); Kit.confetti(160);
    if (AUTO) setTimeout(() => { if (state === 'over') { autoGames++; startGame(); } }, 2500);
  }
  let autoGames = 0;
  let errShown = 0;
  function report(e) { if (errShown++ < 5) try { console.warn('[' + CFG.id + ']', e && e.message); } catch (x) { /* nothing */ } }

  // ---------- Menu ----------
  function menuRows() {
    const r = ['count', 'seats', 'skill'];
    (CFG.extraRows || []).forEach((x) => r.push(x.key));
    r.push('play');
    return r;
  }
  function menuKey(k) {
    const rows = menuRows(), row = rows[menuRow];
    if (k === 'up') { menuRow = (menuRow + rows.length - 1) % rows.length; Kit.sfx.move(); return; }
    if (k === 'down') { menuRow = (menuRow + 1) % rows.length; Kit.sfx.move(); return; }
    if (k === 'ok') {
      if (row === 'seats') { toggleSeat(seatFocus); return; }
      startGame(); return;
    }
    if (k !== 'left' && k !== 'right') return;
    const d = k === 'left' ? -1 : 1;
    if (row === 'count') { const n = clamp(seatCount + d, CFG.minP, CFG.maxP); if (n === seatCount) { Kit.sfx.nope(); return; } seatCount = n; seatFocus = Math.min(seatFocus, n - 1); }
    else if (row === 'seats') { const f = clamp(seatFocus + d, 0, seatCount - 1); if (f === seatFocus) { Kit.sfx.nope(); return; } seatFocus = f; }
    else if (row === 'skill') { const s = clamp(skill + d, 0, 2); if (s === skill) { Kit.sfx.nope(); return; } skill = s; }
    else if (row === 'play') { return; }
    else {
      const ex = CFG.extraRows.find((x) => x.key === row);
      const ix = ex.values.indexOf(opts[row]);
      const ni = clamp(ix + d, 0, ex.values.length - 1);
      if (ni === ix) { Kit.sfx.nope(); return; }
      opts[row] = ex.values[ni];
    }
    Kit.sfx.move();
  }
  function toggleSeat(i) {
    if (i === 0 && CFG.minP === 1 && seatCount === 1) { seatTV[0] = false; Kit.sfx.nope(); return; }
    seatTV[i] = !seatTV[i];
    Kit.sfx.pick();
  }
  const SKILL_TIP = CFG.skillTips || ['Easy TV players and helpful hints', 'A fair game', 'Sharp TV players, no hints'];

  function drawMenu(c, t) {
    c.fillStyle = 'rgba(8,6,28,0.55)'; c.fillRect(0, 0, VW, VH);
    const rows = menuRows();
    const pw = 1180, rowH = 118;
    const ph = 300 + rows.length * rowH + 40;
    const px = (VW - pw) / 2, py = Math.max(20, (VH - ph) / 2);
    const k = ease.back(clamp(clock / 0.45, 0, 1));
    c.save();
    c.translate(VW / 2, VH / 2); c.scale(k, k); c.translate(-VW / 2, -VH / 2);
    panel(c, px, py, pw, ph, 44, CFG.menuTop || '#2c3a8f', CFG.menuBottom || '#141a4a', 'rgba(255,214,90,0.8)', 3);
    hits = [];
    const cx = VW / 2;
    outlined(c, CFG.title, cx, py + 92, 96, '#ffffff', CFG.titleColor || '#ffd76a');
    text(c, CFG.how, cx, py + 172, 32, 'rgba(255,255,255,0.88)', 600, 'center', pw - 80);
    const labelX = px + 70, ctlX = px + 360, ctlW = pw - 360 - 70;
    let y = py + 260;
    rows.forEach((row, ri) => {
      const on = menuRow === ri;
      const yc = y + rowH / 2;
      if (on && row !== 'play') {
        roundRect(c, px + 30, y + 6, pw - 60, rowH - 12, 26);
        c.fillStyle = 'rgba(255,224,102,0.10)'; c.fill();
      }
      if (row === 'count') {
        text(c, 'Players', labelX, yc, 40, on ? '#ffe066' : '#ffffff', 800, 'left');
        const n = CFG.maxP - CFG.minP + 1, gw = 18, w = Math.min(150, (ctlW - gw * (n - 1)) / n);
        for (let v = CFG.minP; v <= CFG.maxP; v++) {
          const x = ctlX + (v - CFG.minP) * (w + gw);
          button(c, x, yc - 38, w, 76, String(v), v === seatCount ? 'gold' : 'off', on && v === seatCount, t);
          hits.push({ x, y: yc - 38, w, h: 76, act: () => { seatCount = v; seatFocus = Math.min(seatFocus, v - 1); menuRow = ri; Kit.sfx.move(); } });
        }
      } else if (row === 'seats') {
        text(c, 'Seats', labelX, yc - 14, 40, on ? '#ffe066' : '#ffffff', 800, 'left');
        text(c, on ? 'OK: Person / TV' : '', labelX, yc + 26, 24, 'rgba(255,255,255,0.7)', 600, 'left');
        const gw = 18, w = (ctlW - gw * 3) / 4, h = 92;
        for (let i = 0; i < 4; i++) {
          const x = ctlX + i * (w + gw), yy = yc - h / 2;
          const used = i < seatCount;
          c.globalAlpha = used ? 1 : 0.25;
          const tv = seatTV[i] && !(CFG.minP === 1 && seatCount === 1 && i === 0);
          panel(c, x, yy, w, h, 22, used ? shade(SEAT_COLORS[i], -0.35) : '#2a2f5a', used ? shade(SEAT_COLORS[i], -0.7) : '#161a38', 'rgba(255,255,255,0.3)', 2);
          token(c, x + 40, yc, 22, SEAT_COLORS[i]);
          text(c, tv ? '📺 TV' : '🙂 Person', x + 72, yc - 13, 28, '#ffffff', 800, 'left', w - 80);
          text(c, 'Seat ' + (i + 1), x + 72, yc + 22, 22, 'rgba(255,255,255,0.75)', 600, 'left');
          c.globalAlpha = 1;
          if (used && on && seatFocus === i) focusRing(c, x, yy, w, h, 22, t);
          if (used) hits.push({ x, y: yy, w, h, act: () => { menuRow = ri; seatFocus = i; toggleSeat(i); } });
        }
      } else if (row === 'skill') {
        text(c, 'Skill', labelX, yc - 14, 40, on ? '#ffe066' : '#ffffff', 800, 'left');
        text(c, SKILL_TIP[skill], labelX, yc + 26, 22, 'rgba(255,255,255,0.7)', 600, 'left', 270);
        const gw = 18, w = (ctlW - gw * 2) / 3;
        SKILLS.forEach((s, i) => {
          const x = ctlX + i * (w + gw);
          button(c, x, yc - 38, w, 76, s, i === skill ? 'go' : 'off', on && i === skill, t);
          hits.push({ x, y: yc - 38, w, h: 76, act: () => { skill = i; menuRow = ri; Kit.sfx.move(); } });
        });
      } else if (row === 'play') {
        const bw = 420, bh = 92;
        button(c, cx - bw / 2, yc - bh / 2 + 6, bw, bh, '▶  Play', 'go', on, t, 50);
        hits.push({ x: cx - bw / 2, y: yc - bh / 2, w: bw, h: bh, act: startGame });
      } else {
        const ex = CFG.extraRows.find((x) => x.key === row);
        text(c, ex.label, labelX, yc - (ex.tip ? 14 : 0), 40, on ? '#ffe066' : '#ffffff', 800, 'left');
        if (ex.tip) text(c, ex.tip(opts[row], skill), labelX, yc + 26, 22, 'rgba(255,255,255,0.7)', 600, 'left', 270);
        const n = ex.values.length, gw = 18, w = (ctlW - gw * (n - 1)) / n;
        ex.values.forEach((v, i) => {
          const x = ctlX + i * (w + gw);
          button(c, x, yc - 38, w, 76, ex.names[i], v === opts[row] ? 'blue' : 'off', on && v === opts[row], t);
          hits.push({ x, y: yc - 38, w, h: 76, act: () => { opts[row] = v; menuRow = ri; Kit.sfx.move(); } });
        });
      }
      y += rowH;
    });
    text(c, Kit.touchFirst() ? 'Tap to choose  ·  tap Play' : '▲▼ choose  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - 42, 28, 'rgba(255,255,255,0.7)', 600);
    // record badge on the top edge
    const rec = CFG.recordText();
    c.font = `800 34px ${Kit.UI}`;
    const bw = c.measureText(rec).width + 70, bh = 58;
    roundRect(c, cx - bw / 2, py - bh / 2, bw, bh, bh / 2);
    c.fillStyle = '#1a1f55'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, rec, cx, py + 2, 34, '#ffd23f', 800);
    c.restore();
  }

  // ---------- Banner, cover, results ----------
  function drawBanner(c) {
    if (!banner) return;
    const k = banner.t * SPEED;
    if (k > 1.5) return;
    const p = banner.p;
    const inK = ease.back(clamp(k / 0.3, 0, 1)), outK = clamp((k - 1.15) / 0.35, 0, 1);
    const w = 900, h = banner.sub ? 170 : 140;
    c.save();
    c.globalAlpha = 1 - outK;
    c.translate(VW / 2 + (1 - inK) * -900 + outK * 700, CFG.bannerY || VH / 2);
    c.rotate(-0.025);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
    roundRect(c, -w / 2, -h / 2, w, h, 40);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(p.color, 0.25)); g.addColorStop(1, shade(p.color, -0.35));
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.lineWidth = 6; c.strokeStyle = '#ffffff'; c.stroke();
    token(c, -w / 2 + 90, banner.sub ? -14 : 0, 44, p.color);
    outlined(c, banner.text, 40, banner.sub ? -22 : 4, 72, '#ffffff', '#fff2c4', 'center', w - 220);
    if (banner.sub) text(c, banner.sub, 40, 48, 32, 'rgba(255,255,255,0.92)', 700, 'center', w - 220);
    c.restore();
  }
  function drawCover(c, t) {
    if (!cover) return;
    const p = cover.p, a = clamp(cover.t / 0.25, 0, 1);
    c.save();
    c.globalAlpha = a;
    const g = c.createLinearGradient(0, 0, 0, VH);
    g.addColorStop(0, shade(p.color, -0.45)); g.addColorStop(1, shade(p.color, -0.85));
    c.fillStyle = g; c.fillRect(0, 0, VW, VH);
    // soft stripes
    c.globalAlpha = a * 0.08; c.fillStyle = '#ffffff';
    for (let i = -4; i < 20; i++) { c.beginPath(); c.moveTo(i * 140 + (t * 30) % 140, 0); c.lineTo(i * 140 + 70 + (t * 30) % 140, 0); c.lineTo(i * 140 - 330 + (t * 30) % 140, VH); c.lineTo(i * 140 - 400 + (t * 30) % 140, VH); c.fill(); }
    c.globalAlpha = a;
    const bob = Math.sin(t * 3) * 8;
    token(c, VW / 2, 330 + bob, 80, p.color);
    text(c, '🙈', VW / 2, 330 + bob, 72, '#fff', 400, 'center', 0, 'system-ui');
    outlined(c, `Pass the remote to ${p.name}`, VW / 2, 520, 92, '#ffffff', '#ffe9a8', 'center', 1700);
    text(c, 'Everyone else, please look away', VW / 2, 620, 46, 'rgba(255,255,255,0.9)', 700);
    const pulse = 0.75 + 0.25 * Math.sin(t * 5);
    c.globalAlpha = a * (cover.t > 0.4 ? pulse : 0.4);
    button(c, VW / 2 - 260, 720, 520, 100, Kit.touchFirst() ? 'Tap when ready' : 'Press OK when ready', 'gold', true, t, 42);
    c.restore();
  }
  function overKey(k) {
    if (!result || result.t < 1.2) return;
    if (k === 'left' || k === 'right') { result.sel = 1 - result.sel; Kit.sfx.move(); return; }
    if (k === 'ok') { if (result.sel === 0) startGame(); else toMenu(); }
  }
  function drawResults(c, t) {
    if (!result) return;
    const a = clamp(result.t / 0.5, 0, 1);
    c.fillStyle = `rgba(8,6,28,${0.68 * a})`; c.fillRect(0, 0, VW, VH);
    const n = result.ranking.length;
    const pw = 1000, ph = 380 + n * 96 + 110;
    const px = (VW - pw) / 2, py = (VH - ph) / 2;
    c.save();
    const k = ease.back(a);
    c.translate(VW / 2, VH / 2); c.scale(k, k); c.translate(-VW / 2, -VH / 2);
    const top = result.ranking[0] ? result.ranking[0].p : players[0];
    panel(c, px, py, pw, ph, 46, shade(top.color, -0.25), shade(top.color, -0.75), '#ffd23f', 4);
    const bob = Math.abs(Math.sin(t * 3.5)) * 14;
    text(c, '🏆', VW / 2, py + 90 - bob, 100, '#fff', 400, 'center', 0, 'system-ui');
    outlined(c, result.headline, VW / 2, py + 205, 84, '#ffffff', '#ffe08a', 'center', pw - 80);
    if (result.sub) text(c, result.sub, VW / 2, py + 275, 36, 'rgba(255,255,255,0.9)', 700, 'center', pw - 80);
    const medals = ['🥇', '🥈', '🥉', '4'];
    result.ranking.forEach((r, i) => {
      const y = py + 330 + i * 96;
      roundRect(c, px + 70, y, pw - 140, 80, 26);
      c.fillStyle = i === 0 ? 'rgba(255,214,90,0.22)' : 'rgba(255,255,255,0.08)'; c.fill();
      text(c, medals[i] || '', px + 120, y + 42, i < 3 ? 46 : 34, '#fff', 800, 'center', 0, 'system-ui');
      token(c, px + 190, y + 40, 24, r.p.color);
      text(c, r.p.name + (r.p.human ? '' : ' 📺'), px + 230, y + 40, 40, '#ffffff', 800, 'left', 380);
      text(c, String(r.score), px + pw - 110, y + 40, 46, '#ffe066', 800, 'right', 0, Kit.FONT);
      if (r.note) text(c, r.note, px + pw - 260, y + 40, 26, 'rgba(255,255,255,0.75)', 600, 'right', 260);
    });
    const ready = result.t > 1.2;
    c.globalAlpha = ready ? 1 : 0.4;
    const by = py + ph - 120, bw = 330;
    button(c, VW / 2 - bw - 20, by, bw, 86, 'Play again', 'go', ready && result.sel === 0, t);
    button(c, VW / 2 + 20, by, bw, 86, 'Menu', 'blue', ready && result.sel === 1, t);
    hits = [{ x: VW / 2 - bw - 20, y: by, w: bw, h: 86, act: () => ready && startGame() }, { x: VW / 2 + 20, y: by, w: bw, h: 86, act: () => ready && toMenu() }];
    c.restore();
  }

  // ---------- Loop, keys and taps ----------
  Kit.onResize((W, H) => { fit(W, H); try { GAME.resize(); } catch (e) { report(e); } });
  Kit.onKeys((k, rep) => {
    try {
      if (k === 'mute') { Kit.toggleMute(); return; }
      if (k === 'restart' || k === 'undo') return;
      if (state === 'menu') { menuKey(k); return; }
      if (state === 'over') { overKey(k); return; }
      if (cover) {
        if (k === 'ok' && cover.t > 0.4) { const f = cover.then; cover = null; Kit.sfx.pick(); f && f(); }
        return;
      }
      GAME.key(k, rep);
    } catch (e) { report(e); }
  });
  Kit.onPointer({
    down(e) {
      try {
        const p = toV(e);
        const mp = CFG.mutePos || [VW - 48, 42];
        const mb = { x: mp[0] - 32, y: mp[1] - 32, w: 64, h: 64 };
        if (inside(p, mb)) { Kit.toggleMute(); return; }
        if (state === 'menu' || state === 'over') { const h = hits.find((r) => inside(p, r)); if (h) h.act(); return; }
        if (cover) { if (cover.t > 0.4) { const f = cover.then; cover = null; f && f(); } return; }
        GAME.pointer && GAME.pointer(p);
      } catch (x) { report(x); }
    },
  });
  function frameUpdate(dt) {
    try {
      clock += dt;
      if (banner) { banner.t += dt; if (banner.t * SPEED > 1.5) banner = null; }
      if (cover) cover.t += dt;
      if (result) result.t += dt;
      if (state === 'over' && result && result.t > 1 && Math.random() < dt * 0.7) Kit.confetti(30);
      GAME.update(dt * SPEED, dt);
    } catch (e) { report(e); }
  }
  function frameDraw(c, t) {
    try {
      Kit.background(c, t, CFG.bg[0], CFG.bg[1], CFG.bg[2]);
      c.save();
      c.translate(V.ox, V.oy); c.scale(V.s, V.s);
      GAME.draw(c, t);
      if (state === 'play') drawBanner(c);
      if (state === 'menu') drawMenu(c, t);
      if (state === 'over') drawResults(c, t);
      drawCover(c, t);
      c.globalAlpha = 0.7;
      const mp = CFG.mutePos || [VW - 48, 42];
      text(c, Kit.muted ? '🔇' : '🔊', mp[0], mp[1], 34, '#fff', 400, 'center', 0, 'system-ui');
      c.globalAlpha = 1;
      c.restore();
    } catch (e) { report(e); try { c.restore(); } catch (x) { /* nothing */ } }
  }
  function boot() {
    fit(Kit.W || window.innerWidth, Kit.H || window.innerHeight);
    window.addEventListener('load', () => Kit.canvas.focus());
    Kit.run(frameUpdate, frameDraw);
    fit(Kit.W, Kit.H);
    try { GAME.resize(); } catch (e) { report(e); }
    Kit.canvas.focus();
    menuRow = menuRows().length - 1;
    try { CFG.onBoot && CFG.onBoot(); } catch (e) { report(e); }
    if (AUTO) setTimeout(startGame, 400);
  }

  // ---------- Tickets: 3 rows x 9 columns, 5 numbers a row, column k holds k0..k9 (1-9 and 80-90 at the ends) ----------
  function makeTicket() {
    for (let tries = 0; tries < 400; tries++) {
      const counts = new Array(9).fill(1);
      let extra = 6;
      while (extra > 0) { const c = rnd(9); if (counts[c] < 3) { counts[c]++; extra--; } }
      const has = [[], [], []];
      const left = [5, 5, 5];
      const order = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]).sort((a, b) => counts[b] - counts[a]);
      let ok = true;
      for (const c of order) {
        const rows = shuffle([0, 1, 2]).sort((a, b) => left[b] - left[a]).slice(0, counts[c]);
        if (rows.some((r) => left[r] <= 0)) { ok = false; break; }
        rows.forEach((r) => { has[r][c] = true; left[r]--; });
      }
      if (!ok || left.some((x) => x !== 0)) continue;
      const grid = [new Array(9).fill(0), new Array(9).fill(0), new Array(9).fill(0)];
      for (let c = 0; c < 9; c++) {
        const lo = c === 0 ? 1 : c * 10, hi = c === 8 ? 90 : c * 10 + 9;
        const pool = [];
        for (let v = lo; v <= hi; v++) pool.push(v);
        const pick = shuffle(pool).slice(0, counts[c]).sort((a, b) => a - b);
        let k = 0;
        for (let r = 0; r < 3; r++) if (has[r][c]) grid[r][c] = pick[k++];
      }
      return grid;
    }
    // never reached in practice: a fixed valid layout
    return [[1, 0, 21, 0, 41, 0, 61, 0, 81], [0, 12, 0, 32, 0, 52, 0, 72, 0], [3, 0, 23, 0, 43, 0, 63, 0, 83]];
  }

  // ---------- Prizes ----------
  const PRIZES = [
    { id: 'early', name: 'Early Five', pts: 10 }, { id: 'top', name: 'Top Line', pts: 15 },
    { id: 'mid', name: 'Middle Line', pts: 15 }, { id: 'bot', name: 'Bottom Line', pts: 15 },
    { id: 'full', name: 'Full House', pts: 40 },
  ];
  function qualifies(tk, id) {
    const m = tk.marked;
    const row = (r) => tk.grid[r].every((v) => !v || m.has(v));
    if (id === 'early') return m.size >= 5;
    if (id === 'top') return row(0);
    if (id === 'mid') return row(1);
    if (id === 'bot') return row(2);
    return row(0) && row(1) && row(2);
  }

  // ---------- Timing by skill ----------
  const CALL_GAP = [6.2, 4.6, 3.4];
  const TV_MARK = [[1.6, 4.2], [0.7, 1.6], [0.12, 0.3]];
  const autoMark = (p) => !p.human || skill === 0 || opts.mark === 'auto' || AUTO;

  // ---------- State ----------
  let tickets = [], called = [], pool = [], prizes = [], calledSet = new Set();
  let nextT = 0, ball = null, ended = false, endT = 0, later = [], toast = null, readyT = 0;
  let cur = { t: 0, r: 0, c: 0, claim: false };
  let drumSpin = 0, drumBoost = 0;
  const drumBalls = Array.from({ length: 22 }, (_, i) => ({ a: Math.random() * 6.28, r: Math.random(), s: 0.5 + Math.random(), n: 1 + rnd(90), k: i }));

  let tid = 0;
  function start() {
    paper = new Map();
    tickets = players.map((p) => ({ id: ++tid, p, grid: makeTicket(), marked: new Set(), pts: 0, won: [], claimLock: -1, pop: new Map() }));
    called = []; calledSet = new Set(); pool = shuffle(Array.from({ length: 90 }, (_, i) => i + 1));
    prizes = PRIZES.map((x) => Object.assign({ winner: null }, x));
    ball = null; ended = false; endT = 0; later = []; toast = null;
    readyT = 3; nextT = 3.2;
    const h = tickets.findIndex((t) => t.p.human);
    cur = { t: Math.max(0, h), r: 0, c: 0, claim: false };
    if (h >= 0) snapCol(0);
    layout();
  }
  function after(t, fn) { later.push({ t, fn }); }

  function callNext() {
    if (ended || !pool.length) return;
    const n = pool.pop();
    called.push(n); calledSet.add(n);
    ball = { n, t: 0 };
    drumBoost = 1.4;
    nextT = CALL_GAP[skill];
    Kit.noise({ dur: 0.45, vol: 0.08, freq: 900, q: 1.2, sweep: 2 });
    Kit.tone(420, { type: 'triangle', dur: 0.16, vol: 0.16, at: 0.42, slide: 1.6 });
    Kit.tone(880, { type: 'sine', dur: 0.22, vol: 0.1, at: 0.5 });
    say(n);
    tickets.forEach((tk) => {
      if (!tk.grid.some((row) => row.includes(n))) return;
      if (!autoMark(tk.p)) return;
      const [a, b] = TV_MARK[skill];
      const d = tk.p.human ? 0.9 : 0.8 + a + Math.random() * (b - a);
      after(d, () => { markNum(tk, n, true); });
    });
  }
  // The caller's voice, where the TV box has one.
  function say(n) {
    try {
      if (Kit.muted || AUTO || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      const s = String(n);
      const u = new SpeechSynthesisUtterance(n < 10 ? `Number ${s}` : `${s.split('').join(' ')}, ${s}`);
      u.rate = 0.95; u.pitch = 1.05; u.volume = 0.9;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(u);
    } catch (e) { /* no voice: the ball says it */ }
  }

  function markNum(tk, n, auto) {
    if (tk.marked.has(n) || ended) return;
    tk.marked.add(n);
    tk.pop.set(n, 0);
    const g = cellCenter(tickets.indexOf(tk), n);
    if (g) {
      fxBurst(g.x, g.y, auto && tk.p.human ? '#ffe066' : tk.p.color, auto ? 10 : 14, 0.6);
    }
    Kit.tone(200, { type: 'sine', dur: 0.1, vol: 0.22, slide: 0.6 });
    Kit.noise({ dur: 0.05, vol: 0.1, freq: 900, q: 1 });
    if (autoMark(tk.p)) {
      const d = tk.p.human ? 0.15 : 0.35;
      after(d, () => claim(tk, true));
    }
  }
  // Checks a claim: every open prize this ticket has really completed is won.
  function claim(tk, auto) {
    if (ended) return;
    const got = prizes.filter((z) => !z.winner && qualifies(tk, z.id));
    if (!got.length) {
      if (!auto) {
        Kit.sfx.nope();
        const g = claimRect(tickets.indexOf(tk));
        fxText('Not yet!', g.x + g.w / 2, g.y - 10, { size: 46, color: '#ffb3c1' });
        tk.claimLock = called.length;
      }
      return;
    }
    got.forEach((z) => { z.winner = tk; tk.pts += z.pts; tk.won.push(z.name); });
    const names = got.map((z) => z.name).join(' + ');
    const pts = got.reduce((s, z) => s + z.pts, 0);
    toast = { text: names + '!', sub: `${tk.p.name}  +${pts}`, color: tk.p.color, t: 0 };
    Kit.sfx.win();
    const g = ticketGeo(tickets.indexOf(tk));
    fxBurst(g.x + g.w / 2, g.y + g.h / 2, tk.p.color, 30, 1.2);
    fxBurst(g.x + g.w / 2, g.y + g.h / 2, '#ffd23f', 20, 1);
    Kit.shake(8, 0.3);
    if (got.some((z) => z.id === 'full')) { ended = true; endT = 0; Kit.confetti(120); }
  }
  function endGame() {
    const ranking = tickets.map((tk) => ({ p: tk.p, score: tk.pts, note: tk.won.join(', '), full: tk.won.includes('Full House') }))
      .sort((a, b) => b.score - a.score || (b.full ? 1 : 0) - (a.full ? 1 : 0));
    const top = ranking[0];
    if (top && top.p.human && top.score > 0) addWin();
    const head = !top || top.score === 0 ? 'No winner this time' : top.p.name === 'You' ? 'You win!' : `${top.p.name} wins!`;
    showResults(ranking, head, `${called.length} numbers called  ·  points from prizes`);
  }

  // ---------- Layout ----------
  const TOP = 18, BAND = 350, TK_Y = 412, TK_H = 1068 - 412;
  const CALLER = { x: 28, y: TOP, w: 690, h: BAND };
  const PRIZEP = { x: 736, y: TOP, w: 640, h: BAND };
  const BOARD = { x: 1394, y: TOP, w: 498, h: BAND };
  const DRUM = { x: 190, y: 170, r: 122 };
  const BIG = { x: 500, y: 158, r: 108 };
  let geo = [];
  function layout() {
    const n = Math.max(1, tickets.length || seatCount);
    const cols = n === 1 ? 1 : 2, rows = n <= 2 ? 1 : 2;
    const aw = (1864 - (cols - 1) * 24) / cols, ah = (TK_H - (rows - 1) * 18) / rows;
    const head = n <= 2 ? 66 : 54;
    const cell = Math.floor(Math.min((aw - 36) / 9, (ah - head - 26) / 3, 168));
    geo = [];
    for (let i = 0; i < n; i++) {
      const w = cell * 9 + 36, h = head + cell * 3 + 22;
      const cx = 28 + (i % cols) * (aw + 24) + aw / 2;
      const lone = n === 3 && i === 2;
      const cy = TK_Y + Math.floor(i / cols) * (ah + 18) + ah / 2;
      const ccx = lone ? 960 : cx;
      geo.push({ x: ccx - w / 2, y: cy - h / 2, w, h, cell, head, gx: ccx - w / 2 + 18, gy: cy - h / 2 + head + 4 });
    }
  }
  const ticketGeo = (i) => geo[i] || geo[0] || { x: 0, y: 0, w: 100, h: 100, cell: 10, head: 10, gx: 0, gy: 0 };
  function cellCenter(i, n) {
    const tk = tickets[i], g = ticketGeo(i);
    if (!tk) return null;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) if (tk.grid[r][c] === n) return { x: g.gx + c * g.cell + g.cell / 2, y: g.gy + r * g.cell + g.cell / 2 };
    return null;
  }
  function claimRect(i) {
    const g = ticketGeo(i);
    const w = g.head > 60 ? 210 : 170, h = g.head - 16;
    return { x: g.x + g.w - w - 14, y: g.y + 8, w, h };
  }
  const handMode = (tk) => tk.p.human && !autoMark(tk.p);

  let paper = null, bandPic = null;
  function resize() {
    layout();
    bandPic = bake(VW, VH, (c) => {
      panel(c, CALLER.x, CALLER.y, CALLER.w, CALLER.h, 30, '#4b1f74', '#220a3a', 'rgba(255,200,255,0.35)', 2);
      panel(c, PRIZEP.x, PRIZEP.y, PRIZEP.w, PRIZEP.h, 30, '#4b1f74', '#220a3a', 'rgba(255,200,255,0.35)', 2);
      panel(c, BOARD.x, BOARD.y, BOARD.w, BOARD.h, 30, '#4b1f74', '#220a3a', 'rgba(255,200,255,0.35)', 2);
      // drum stand
      c.save();
      const sx = DRUM.x, sy = DRUM.y + DRUM.r;
      const sg = c.createLinearGradient(sx - 70, 0, sx + 70, 0);
      sg.addColorStop(0, '#8a5a12'); sg.addColorStop(0.5, '#ffd56b'); sg.addColorStop(1, '#8a5a12');
      c.fillStyle = sg;
      c.beginPath(); c.moveTo(sx - 30, sy - 8); c.lineTo(sx + 30, sy - 8); c.lineTo(sx + 78, sy + 40); c.lineTo(sx - 78, sy + 40); c.closePath(); c.fill();
      roundRect(c, sx - 92, sy + 34, 184, 18, 9); c.fill();
      c.restore();
      outlined(c, 'Prizes', PRIZEP.x + 30, PRIZEP.y + 40, 40, '#ffffff', '#ffd36b', 'left');
      text(c, 'pts', PRIZEP.x + PRIZEP.w - 34, PRIZEP.y + 42, 22, 'rgba(255,255,255,0.55)', 700, 'right');
      // board grid
      for (let n = 1; n <= 90; n++) {
        const b = boardCell(n);
        roundRect(c, b.x, b.y, b.w, b.h, 8);
        c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill();
        text(c, String(n), b.x + b.w / 2, b.y + b.h / 2 + 1, 19, 'rgba(255,255,255,0.35)', 700, 'center', 0, Kit.FONT);
      }
    });
    paper = new Map();
  }
  function boardCell(n) {
    const c = (n - 1) % 10, r = Math.floor((n - 1) / 10);
    const cw = (BOARD.w - 36) / 10, ch = (BOARD.h - 36) / 9;
    return { x: BOARD.x + 18 + c * cw + 2, y: BOARD.y + 18 + r * ch + 2, w: cw - 4, h: ch - 4 };
  }
  // The ticket paper, baked per seat and size.
  function ticketPaper(i) {
    const g = ticketGeo(i), tk = tickets[i];
    const key = (tk ? tk.id : 'x') + ':' + g.w;
    if (paper && paper.has(key)) return paper.get(key);
    const col = tk ? tk.p.color : '#888888';
    const pic = bake(g.w + 40, g.h + 40, (c) => {
      c.translate(20, 20);
      c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 22; c.shadowOffsetY = 8;
      roundRect(c, 0, 0, g.w, g.h, 22);
      const pg = c.createLinearGradient(0, 0, 0, g.h);
      pg.addColorStop(0, '#fffdf6'); pg.addColorStop(1, '#f2e9d6');
      c.fillStyle = pg; c.fill();
      c.shadowColor = 'transparent';
      // header band in the seat colour
      c.save(); roundRect(c, 0, 0, g.w, g.h, 22); c.clip();
      const hg = c.createLinearGradient(0, 0, 0, g.head);
      hg.addColorStop(0, shade(col, 0.15)); hg.addColorStop(1, shade(col, -0.25));
      c.fillStyle = hg; c.fillRect(0, 0, g.w, g.head);
      c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(0, 0, g.w, g.head * 0.45);
      c.restore();
      // cells
      if (tk) for (let r = 0; r < 3; r++) for (let cc = 0; cc < 9; cc++) {
        const x = g.gx - g.x + cc * g.cell, y = g.gy - g.y + r * g.cell;
        roundRect(c, x + 3, y + 3, g.cell - 6, g.cell - 6, g.cell * 0.16);
        if (tk.grid[r][cc]) {
          c.fillStyle = '#ffffff'; c.fill();
          c.lineWidth = 2; c.strokeStyle = rgba(col, 0.35); c.stroke();
        } else {
          c.fillStyle = rgba(col, 0.13); c.fill();
          // a small star pattern in empty cells
          c.fillStyle = rgba(col, 0.22);
          c.beginPath(); c.arc(x + g.cell / 2, y + g.cell / 2, g.cell * 0.07, 0, Math.PI * 2); c.fill();
        }
      }
      // perforated edge
      c.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 14; x < g.w - 10; x += 16) { c.beginPath(); c.arc(x, g.h - 8, 2.2, 0, Math.PI * 2); c.fill(); }
    });
    paper.set(key, pic);
    return pic;
  }

  // ---------- Remote: a cursor over the numbers of the people's tickets ----------
  const humanTickets = () => tickets.map((t, i) => (handMode(t) ? i : -1)).filter((i) => i >= 0);
  const numCols = (i, r) => { const out = []; for (let c = 0; c < 9; c++) if (tickets[i].grid[r][c]) out.push(c); return out; };
  function snapCol(dir) {
    const cols = numCols(cur.t, cur.r);
    if (cols.includes(cur.c)) return;
    let best = cols[0], bd = 99;
    cols.forEach((c) => { const d = Math.abs(c - cur.c) + (dir && Math.sign(c - cur.c) !== dir ? 0.5 : 0); if (d < bd) { bd = d; best = c; } });
    cur.c = best;
  }
  function key(k) {
    if (state !== 'play' || ended) return;
    const hs = humanTickets();
    if (!hs.length) {
      // everyone is marked automatically: OK calls the next number sooner
      if (k === 'ok' && readyT <= 0 && nextT > 1.2 && (!ball || ball.t > 1)) { nextT = 0.01; Kit.sfx.pick(); }
      return;
    }
    if (!hs.includes(cur.t)) { cur.t = hs[0]; cur.r = 0; cur.claim = false; snapCol(0); }
    const tk = tickets[cur.t];
    if (cur.claim) {
      if (k === 'down') { cur.claim = false; cur.r = 0; snapCol(0); Kit.sfx.move(); }
      else if (k === 'left' || k === 'right') switchTicket(k === 'left' ? -1 : 1, true);
      else if (k === 'ok') {
        if (tk.claimLock === called.length) { Kit.sfx.nope(); const g = claimRect(cur.t); fxText('Wait for the next number', g.x + g.w / 2, g.y - 10, { size: 34, color: '#ffb3c1' }); return; }
        claim(tk, false);
      }
      return;
    }
    if (k === 'left' || k === 'right') {
      const d = k === 'left' ? -1 : 1;
      const cols = numCols(cur.t, cur.r);
      const ix = cols.indexOf(cur.c) + d;
      if (ix >= 0 && ix < cols.length) { cur.c = cols[ix]; Kit.sfx.move(); }
      else switchTicket(d, false);
      return;
    }
    if (k === 'up') {
      if (cur.r > 0) { cur.r--; snapCol(0); Kit.sfx.move(); }
      else { cur.claim = true; Kit.sfx.move(); }
      return;
    }
    if (k === 'down') { if (cur.r < 2) { cur.r++; snapCol(0); Kit.sfx.move(); } else Kit.sfx.nope(); return; }
    if (k === 'ok') {
      const n = tk.grid[cur.r][cur.c];
      if (!n) return;
      if (tk.marked.has(n)) { Kit.tone(300, { type: 'triangle', dur: 0.05, vol: 0.06 }); return; }
      if (!calledSet.has(n)) {
        Kit.sfx.nope();
        const g = cellCenter(cur.t, n);
        fxText('Not called yet', g.x, g.y - 40, { size: 36, color: '#ffb3c1' });
        return;
      }
      markNum(tk, n, false);
    }
  }
  function switchTicket(d, toClaim) {
    const hs = humanTickets();
    if (hs.length < 2) { Kit.sfx.nope(); return; }
    const ix = (hs.indexOf(cur.t) + d + hs.length) % hs.length;
    cur.t = hs[ix];
    if (!toClaim) { const cols = numCols(cur.t, cur.r); cur.c = d > 0 ? cols[0] : cols[cols.length - 1]; }
    Kit.sfx.pick();
  }
  function pointer(pt) {
    if (state !== 'play' || ended) return;
    if (!humanTickets().length) { key('ok'); return; }
    tickets.forEach((tk, i) => {
      if (!handMode(tk)) return;
      const g = ticketGeo(i);
      if (inside(pt, claimRect(i))) { cur = { t: i, r: 0, c: cur.c, claim: true }; key('ok'); return; }
      const c = Math.floor((pt.x - g.gx) / g.cell), r = Math.floor((pt.y - g.gy) / g.cell);
      if (c >= 0 && c < 9 && r >= 0 && r < 3 && tk.grid[r][c]) { cur = { t: i, r, c, claim: false }; key('ok'); }
    });
  }

  // ---------- Update ----------
  function update(dt) {
    drumSpin += dt * (0.6 + drumBoost * 3);
    drumBoost = Math.max(0, drumBoost - dt);
    if (state !== 'play') return;
    if (ball) ball.t += dt;
    if (toast) { toast.t += dt; if (toast.t > 2.4) toast = null; }
    tickets.forEach((tk) => tk.pop.forEach((v, k) => { if (v < 1) tk.pop.set(k, v + dt * 2.5); }));
    for (let i = later.length - 1; i >= 0; i--) {
      later[i].t -= dt;
      if (later[i].t <= 0) { const f = later[i].fn; later.splice(i, 1); f(); }
    }
    if (ended) { endT += dt; if (endT > 2.6) { ended = false; state = 'over'; endGame(); } return; }
    if (readyT > 0) readyT -= dt;
    nextT -= dt;
    if (nextT <= 0) {
      if (pool.length) callNext();
      else if (!later.length) { ended = true; endT = 0; }
    }
  }

  // ---------- Drawing ----------
  const BALL_COLORS = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#2ed573', '#1fc8db', '#3d8bff', '#9b6bff', '#ff5fc8', '#ff7a45'];
  const ballCol = (n) => BALL_COLORS[Math.min(8, Math.floor(n / 10))];
  const ballPics = new Map();
  function ballPic(col, r) {
    const key = col + r;
    if (ballPics.has(key)) return ballPics.get(key);
    const pic = bake(r * 2 + 8, r * 2 + 8, (c) => {
      const x = r + 4, y = r + 4;
      const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
      g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.5));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.arc(x, y, r * 0.58, 0, Math.PI * 2); c.fill();
      c.lineWidth = r * 0.05; c.strokeStyle = rgba(col.startsWith('#') ? col : '#888888', 0.6); c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.55, r * 0.3, r * 0.15, -0.6, 0, Math.PI * 2); c.fill();
    });
    ballPics.set(key, pic);
    return pic;
  }
  function drawBall(c, x, y, r, n, alpha = 1) {
    c.save(); c.globalAlpha *= alpha;
    c.drawImage(ballPic(ballCol(n), Math.round(r)), x - r - 4, y - r - 4, r * 2 + 8, r * 2 + 8);
    text(c, String(n), x, y + r * 0.05, r * (n > 9 ? 0.62 : 0.72), '#1d1338', 800, 'center', 0, Kit.FONT);
    c.restore();
  }
  function drawCaller(c, t) {
    // the drum: a glass globe with balls tumbling inside
    const { x, y, r } = DRUM;
    c.save();
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    const gg = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
    gg.addColorStop(0, 'rgba(255,255,255,0.18)'); gg.addColorStop(1, 'rgba(120,80,200,0.25)');
    c.fillStyle = gg; c.fill();
    c.clip();
    drumBalls.forEach((b) => {
      const a = b.a + drumSpin * b.s;
      const rr = r * (0.25 + 0.55 * b.r);
      const bx = x + Math.cos(a) * rr, by = y + Math.sin(a) * rr * 0.9 + (1 - drumBoost / 1.4) * 0 + r * 0.15;
      c.drawImage(ballPic(BALL_COLORS[b.k % 9], 20), bx - 24, Math.min(by, y + r - 22) - 24, 48, 48);
    });
    c.restore();
    c.save();
    c.lineWidth = 6; c.strokeStyle = '#ffd56b';
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.stroke();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,213,107,0.5)';
    c.beginPath(); c.ellipse(x, y, r, r * 0.3, drumSpin * 0.4, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - r * 0.4, y - r * 0.55, r * 0.3, r * 0.13, -0.6, 0, Math.PI * 2); c.fill();
    c.restore();
    // the big ball: pops out of the drum, flies and lands
    c.beginPath(); c.arc(BIG.x, BIG.y, BIG.r + 16, 0, Math.PI * 2);
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill();
    if (state === 'play' && !ended && readyT <= 0 && pool.length) {
      // countdown ring to the next call
      const k = clamp(nextT / CALL_GAP[skill], 0, 1);
      c.lineWidth = 9; c.strokeStyle = 'rgba(255,255,255,0.15)';
      c.beginPath(); c.arc(BIG.x, BIG.y, BIG.r + 11, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = '#ffd56b'; c.lineCap = 'round';
      c.beginPath(); c.arc(BIG.x, BIG.y, BIG.r + 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - k)); c.stroke();
      c.lineCap = 'butt';
    }
    if (ball) {
      const k = clamp(ball.t / 0.7, 0, 1), e = ease.out(k);
      const bx = lerp(x, BIG.x, e), by = lerp(y - r * 0.6, BIG.y, e) - Math.sin(k * Math.PI) * 90;
      const br = lerp(26, BIG.r, ease.back(k));
      drawBall(c, bx, by, br, ball.n);
      if (k >= 1 && ball.t < 1.2) {
        c.save(); c.globalAlpha = 1 - (ball.t - 0.7) / 0.5;
        c.lineWidth = 6; c.strokeStyle = '#ffffff';
        c.beginPath(); c.arc(BIG.x, BIG.y, BIG.r + (ball.t - 0.7) * 120, 0, Math.PI * 2); c.stroke();
        c.restore();
      }
    } else {
      text(c, state === 'play' && readyT > 0 ? String(Math.ceil(readyT)) : '?', BIG.x, BIG.y + 4, 96, 'rgba(255,255,255,0.7)', 800, 'center', 0, Kit.FONT);
    }
    const sub = state !== 'play' ? 'Numbers 1 to 90' : readyT > 0 ? 'Get ready…' : ended ? 'Full House!' : `Call ${called.length} of 90`;
    text(c, sub, BIG.x, BIG.y + BIG.r + 36, 30, '#ffe7a3', 800, 'center');
    // recent calls
    const recent = called.slice(Math.max(0, called.length - 7), Math.max(0, called.length - 1)).reverse();
    text(c, 'Before:', CALLER.x + 30, CALLER.y + CALLER.h - 30, 24, 'rgba(255,255,255,0.6)', 700, 'left');
    recent.forEach((n, i) => drawBall(c, CALLER.x + 150 + i * 60, CALLER.y + CALLER.h - 30, 25, n, 1 - i * 0.1));
  }
  function drawPrizes(c, t) {
    prizes.length || (prizes = PRIZES.map((x) => Object.assign({ winner: null }, x)));
    prizes.forEach((z, i) => {
      const y = PRIZEP.y + 74 + i * 54;
      roundRect(c, PRIZEP.x + 18, y, PRIZEP.w - 36, 48, 16);
      c.fillStyle = z.winner ? rgba(z.winner.p.color, 0.35) : 'rgba(255,255,255,0.07)'; c.fill();
      text(c, (z.winner ? '✔ ' : '') + z.name, PRIZEP.x + 36, y + 25, 28, z.winner ? '#ffffff' : '#ffe7a3', 800, 'left', 250);
      if (z.winner) {
        token(c, PRIZEP.x + 330, y + 24, 14, z.winner.p.color);
        text(c, z.winner.p.name, PRIZEP.x + 352, y + 25, 25, '#ffffff', 700, 'left', 170);
      } else text(c, 'open', PRIZEP.x + 330, y + 25, 22, 'rgba(255,255,255,0.4)', 600, 'left');
      text(c, String(z.pts), PRIZEP.x + PRIZEP.w - 36, y + 25, 30, '#ffd36b', 800, 'right', 0, Kit.FONT);
    });
  }
  function drawBoard(c, t) {
    const last = called[called.length - 1];
    called.forEach((n) => {
      const b = boardCell(n);
      roundRect(c, b.x, b.y, b.w, b.h, 8);
      c.fillStyle = ballCol(n); c.fill();
      text(c, String(n), b.x + b.w / 2, b.y + b.h / 2 + 1, 20, '#1d1338', 800, 'center', 0, Kit.FONT);
      if (n === last) { c.lineWidth = 3 + Math.sin(t * 6) * 1.5; c.strokeStyle = '#ffffff'; roundRect(c, b.x - 2, b.y - 2, b.w + 4, b.h + 4, 9); c.stroke(); }
    });
  }
  function drawTicket(c, i, t) {
    const tk = tickets[i], g = ticketGeo(i);
    c.drawImage(ticketPaper(i), g.x - 20, g.y - 20, g.w + 40, g.h + 40);
    const p = tk.p;
    const hs = g.head;
    token(c, g.x + hs * 0.55, g.y + hs / 2, hs * 0.3, p.color);
    text(c, p.name + (p.human ? '' : ' 📺'), g.x + hs * 1.0, g.y + hs / 2 + 1, hs * 0.5, '#ffffff', 800, 'left', g.w * 0.4);
    if (tk.pts) text(c, `${tk.pts} pts`, g.x + g.w * 0.5, g.y + hs / 2 + 1, hs * 0.42, '#fff3c4', 800, 'left', 140, Kit.FONT);
    const hand = handMode(tk);
    if (hand) {
      const r = claimRect(i);
      const can = prizes.some((z) => !z.winner && qualifies(tk, z.id));
      const glow = can && skill < 2;
      const f = cur.t === i && cur.claim;
      button(c, r.x, r.y, r.w, r.h, glow ? 'Claim!' : 'Claim', glow ? 'gold' : f ? 'blue' : 'off', f, t, r.h * 0.5);
      if (glow && !f) { c.save(); c.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6); focusRing(c, r.x, r.y, r.w, r.h, r.h / 2, t, '#ffd23f'); c.restore(); }
    } else {
      const left = tk.grid.reduce((s, row) => s + row.filter((v) => v && !tk.marked.has(v)).length, 0);
      text(c, left ? `${left} to go` : 'All done!', g.x + g.w - 22, g.y + hs / 2 + 1, hs * 0.4, 'rgba(255,255,255,0.9)', 700, 'right');
    }
    const cs = g.cell;
    for (let r = 0; r < 3; r++) for (let cc = 0; cc < 9; cc++) {
      const n = tk.grid[r][cc];
      if (!n) continue;
      const x = g.gx + cc * cs + cs / 2, y = g.gy + r * cs + cs / 2;
      const marked = tk.marked.has(n);
      // hint sparkle: called but not marked (Beginner/Normal), on people's tickets
      if (!marked && calledSet.has(n) && p.human && skill < 2) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6 + n);
        c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = 14 + pulse * 12;
        roundRect(c, x - cs / 2 + 4, y - cs / 2 + 4, cs - 8, cs - 8, cs * 0.16);
        c.fillStyle = `rgba(255,214,90,${0.25 + pulse * 0.25})`; c.fill(); c.restore();
        sparkle(c, x + cs * 0.28, y - cs * 0.28, cs * 0.12 * (0.6 + pulse * 0.6), t + n);
      }
      text(c, String(n), x, y + cs * 0.03, cs * 0.46, '#2a1d4f', 800, 'center', 0, Kit.FONT);
      if (marked) {
        const k = Math.min(1, tk.pop.get(n) || 1);
        const s = k < 1 ? 1.5 - 0.5 * ease.out(k) : 1;
        c.save();
        c.globalAlpha = 0.82 * Math.min(1, k * 3);
        c.translate(x, y); c.scale(s, s);
        const dg = c.createRadialGradient(-cs * 0.1, -cs * 0.12, cs * 0.04, 0, 0, cs * 0.4);
        dg.addColorStop(0, shade(p.color, 0.35)); dg.addColorStop(1, shade(p.color, -0.15));
        c.fillStyle = dg;
        c.beginPath(); c.arc(0, 0, cs * 0.38, 0, Math.PI * 2); c.fill();
        c.restore();
        text(c, String(n), x, y + cs * 0.03, cs * 0.46, '#ffffff', 800, 'center', 0, Kit.FONT);
        if (k < 1 && autoMark(p) && p.human) sparkle(c, x + cs * 0.3, y - cs * 0.3, cs * 0.16 * (1 - k), t);
      }
      if (hand && cur.t === i && !cur.claim && cur.r === r && cur.c === cc) {
        focusRing(c, x - cs / 2 + 4, y - cs / 2 + 4, cs - 8, cs - 8, cs * 0.16, t, '#ff7a1a');
      }
    }
  }
  function sparkle(c, x, y, s, t) {
    c.save(); c.translate(x, y); c.rotate(t * 2);
    c.fillStyle = '#fffbe0';
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, rr = i % 2 ? s * 0.35 : s; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath(); c.fill(); c.restore();
  }
  function drawToast(c) {
    if (!toast) return;
    const k = toast.t, a = clamp(k / 0.25, 0, 1) * (1 - clamp((k - 2) / 0.4, 0, 1));
    c.save();
    c.globalAlpha = a;
    c.translate(VW / 2, 730); const s = ease.back(clamp(k / 0.35, 0, 1)); c.scale(s, s);
    const w = 860, h = 170;
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 40;
    roundRect(c, -w / 2, -h / 2, w, h, 40);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(toast.color, 0.2)); g.addColorStop(1, shade(toast.color, -0.4));
    c.fillStyle = g; c.fill(); c.shadowColor = 'transparent';
    c.lineWidth = 6; c.strokeStyle = '#ffd23f'; c.stroke();
    outlined(c, toast.text, 0, -22, 70, '#ffffff', '#ffe9a8', 'center', w - 60);
    text(c, toast.sub, 0, 48, 36, '#ffffff', 800, 'center', w - 60);
    c.restore();
  }
  function draw(c, t) {
    c.drawImage(bandPic, 0, 0, VW, VH);
    drawCaller(c, t);
    drawPrizes(c, t);
    drawBoard(c, t);
    if (state === 'menu' || !tickets.length) {
      // a sample ticket behind the menu
      if (!demo) demo = { id: 'demo', p: { color: '#ff4d6d', name: 'Your ticket', human: true }, grid: makeTicket(), marked: new Set(), pts: 0, won: [], pop: new Map() };
      tickets = [demo]; layout();
      drawTicket(c, 0, t);
      tickets = [];
      return;
    }
    tickets.forEach((tk, i) => drawTicket(c, i, t));
    // help line
    let help = '';
    const hs = humanTickets();
    if (state === 'play') {
      if (!hs.length) help = Kit.touchFirst() ? 'Tap to call the next number sooner' : 'Auto marking is on  ·  OK calls the next number sooner';
      else help = hs.length > 1 ? 'Arrows move  ·  OK marks  ·  ◀ ▶ past the edge: next ticket  ·  ▲ Claim' : 'Arrows move  ·  OK marks a called number  ·  ▲ from the top row: Claim';
    }
    text(c, help, VW / 2, TK_Y - 22, 26, 'rgba(255,255,255,0.75)', 700, 'center');
    drawToast(c);
  }
  let demo = null;

  const GAME = { start, update, draw, key, pointer, resize };
  boot();
})();
