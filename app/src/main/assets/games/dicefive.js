// Dice Five: the classic five-dice category game. Each turn roll up to three times, keep (hold) the dice you
// like between rolls, then write the dice into one of 13 boxes on your scorecard. Upper boxes 63+ earn a
// 35 bonus. 1 to 4 players, any seat can be the TV. Highest total after 13 rounds wins.
// Remote: ◀ ▶ pick a die or the Roll button, OK holds a die / rolls, ▼ goes to the scorecard,
// ▲ ▼ choose a box, OK scores it. Touch: tap dice, Roll and boxes (tap a box twice to score).
'use strict';

(() => {
  const CFG = {
    id: 'dicefive', title: 'Dice Five', defN: 2, minP: 1, maxP: 4,
    how: 'Roll 3 times, hold the dice you like, fill one box each turn. Most points wins!',
    bg: ['#0e3b2e', '#04140f', 'rgba(90,255,180,0.08)'],
    menuTop: '#1f6b4f', menuBottom: '#0b2a20', titleColor: '#ffe27a',
    skillTips: ['Best box glows, dice tips, easy TV', 'No hints, smart TV', 'Sharpest TV players'],
    recordText: () => `👑 Best: ${best}`,
    bannerY: 470, mutePos: [1100, 56],
  };
  let best = Kit.store.get('dicefive.best', 0) | 0;
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
  function addWin() { wins++; Kit.store.set(CFG.id + '.wins', wins); if (CFG.id !== 'dicefive') Kit.record(CFG.id, wins); }

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

  // ---------- Rules ----------
  const CATS = [
    { name: 'Ones', hint: '' }, { name: 'Twos', hint: '' }, { name: 'Threes', hint: '' },
    { name: 'Fours', hint: '' }, { name: 'Fives', hint: '' }, { name: 'Sixes', hint: '' },
    { name: 'Three of a kind', short: '3 of a kind', hint: 'sum' }, { name: 'Four of a kind', short: '4 of a kind', hint: 'sum' },
    { name: 'Full house', hint: '25' }, { name: 'Small straight', short: 'Small straight', hint: '30' },
    { name: 'Large straight', short: 'Large straight', hint: '40' }, { name: 'Five of a kind', short: 'Five of a kind', hint: '50' },
    { name: 'Chance', hint: 'sum' },
  ];
  // What a box is usually worth: scoring well above it is good, wasting a box is costly.
  const EXPECT = [2.1, 5.2, 8.4, 11.6, 14.6, 17.6, 15, 7, 14, 17, 11, 7, 22];
  function scoresAll(d) {
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    let sum = 0;
    for (const v of d) { cnt[v]++; sum += v; }
    let mx = 0, has3 = false, has2 = false;
    for (let f = 1; f <= 6; f++) { if (cnt[f] > mx) mx = cnt[f]; if (cnt[f] === 3) has3 = true; if (cnt[f] === 2) has2 = true; }
    const run = (a, b) => { for (let f = a; f <= b; f++) if (!cnt[f]) return false; return true; };
    const small = run(1, 4) || run(2, 5) || run(3, 6), large = run(1, 5) || run(2, 6);
    return [cnt[1], cnt[2] * 2, cnt[3] * 3, cnt[4] * 4, cnt[5] * 5, cnt[6] * 6,
      mx >= 3 ? sum : 0, mx >= 4 ? sum : 0, has3 && has2 ? 25 : 0, small ? 30 : 0, large ? 40 : 0, mx === 5 ? 50 : 0, sum];
  }
  const upperSum = (p) => p.card.slice(0, 6).reduce((s, v) => s + (v || 0), 0);
  const bonusOf = (p) => (upperSum(p) >= 63 ? 35 : 0);
  const totalOf = (p) => p.card.reduce((s, v) => s + (v || 0), 0) + bonusOf(p);
  const openCats = (p) => p.card.map((v, i) => (v == null ? i : -1)).filter((i) => i >= 0);

  // ---------- TV brains ----------
  function catValues(p, sc) {
    const up = upperSum(p);
    return sc.map((s, i) => {
      if (p.card[i] != null) return -1e9;
      let v = s - EXPECT[i];
      if (i < 6) { if (s >= 3 * (i + 1)) v += 3; if (up < 63 && up + s >= 63) v += 20; }
      return v;
    });
  }
  function bestCat(p, d) {
    const v = catValues(p, scoresAll(d));
    let b = -1, bv = -1e9;
    v.forEach((x, i) => { if (x > bv) { bv = x; b = i; } });
    return b;
  }
  const evalDice = (p, d) => Math.max(...catValues(p, scoresAll(d)));
  function planHolds(p, d, left, samples, noise) {
    let bestMask = 31, bv = evalDice(p, d);
    const nd = [0, 0, 0, 0, 0];
    for (let m = 0; m < 31; m++) {
      let tot = 0;
      for (let s = 0; s < samples; s++) {
        for (let i = 0; i < 5; i++) nd[i] = (m >> i) & 1 ? d[i] : 1 + rnd(6);
        tot += evalDice(p, nd);
      }
      const v = tot / samples + (left >= 2 ? 2.5 : 0) + noise * (Math.random() - 0.5);
      if (v > bv) { bv = v; bestMask = m; }
    }
    return bestMask;
  }
  function beginnerHolds(d) {
    const cnt = [0, 0, 0, 0, 0, 0, 0];
    d.forEach((v) => cnt[v]++);
    let f = 0;
    for (let v = 1; v <= 6; v++) if (cnt[v] >= 2 && cnt[v] >= cnt[f]) f = v;
    let m = 0;
    d.forEach((v, i) => { if (v === f) m |= 1 << i; });
    return m;
  }

  // ---------- 3D dice ----------
  const mul = (a, b) => {
    const r = new Array(9);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    return r;
  };
  const ap = (m, v) => [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
  function rot(ax, a) {
    const [x, y, z] = ax, c = Math.cos(a), s = Math.sin(a), t = 1 - c;
    return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c];
  }
  const HALF = Math.PI / 2;
  const BASE = { 1: rot([1, 0, 0], 0), 6: rot([1, 0, 0], Math.PI), 2: rot([1, 0, 0], HALF), 5: rot([1, 0, 0], -HALF), 3: rot([0, 1, 0], -HALF), 4: rot([0, 1, 0], HALF) };
  const VIEW = mul(rot([1, 0, 0], 0.5), rot([0, 1, 0], -0.28));
  const finalR = (v, spin) => mul(VIEW, mul(rot([0, 0, 1], spin), BASE[v]));
  const FACES = [
    { v: 1, n: [0, 0, 1], u: [1, 0, 0], w: [0, 1, 0] }, { v: 6, n: [0, 0, -1], u: [-1, 0, 0], w: [0, 1, 0] },
    { v: 2, n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, -1] }, { v: 5, n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, 1] },
    { v: 3, n: [1, 0, 0], u: [0, 0, -1], w: [0, 1, 0] }, { v: 4, n: [-1, 0, 0], u: [0, 0, 1], w: [0, 1, 0] },
  ];
  const PIPS = {
    1: [[0, 0]], 2: [[-0.5, -0.5], [0.5, 0.5]], 3: [[-0.5, -0.5], [0, 0], [0.5, 0.5]],
    4: [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]], 5: [[-0.5, -0.5], [0.5, -0.5], [0, 0], [-0.5, 0.5], [0.5, 0.5]],
    6: [[-0.5, -0.55], [0.5, -0.55], [-0.5, 0], [0.5, 0], [-0.5, 0.55], [0.5, 0.55]],
  };
  const LIGHT = (() => { const l = [-0.45, -0.65, 0.9], m = Math.hypot(...l); return l.map((x) => x / m); })();
  function roundPoly(c, pts, r) {
    // Corners cut along each edge (never more than 40% of it) and bent with a curve: no overshoot on thin faces.
    const n = pts.length;
    const cut = (a, b, d) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; const k = Math.min(d, l * 0.4) / l; return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]; };
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const p = pts[i], prev = pts[(i + n - 1) % n], next = pts[(i + 1) % n];
      const a = cut(p, prev, r), b = cut(p, next, r);
      if (i === 0) c.moveTo(a[0], a[1]); else c.lineTo(a[0], a[1]);
      c.quadraticCurveTo(p[0], p[1], b[0], b[1]);
    }
    c.closePath();
  }
  function drawDie(c, x, y, h, R, lift, alpha) {
    c.save();
    c.globalAlpha = alpha;
    // shadow on the felt, softer and smaller while the die is in the air
    const sk = 1 / (1 + lift / 160);
    const sg = c.createRadialGradient(x + h * 0.25, y + h * 0.75, 1, x + h * 0.25, y + h * 0.75, h * 1.5 * sk);
    sg.addColorStop(0, `rgba(0,20,10,${0.55 * sk})`); sg.addColorStop(1, 'rgba(0,20,10,0)');
    c.fillStyle = sg; c.beginPath(); c.ellipse(x + h * 0.25, y + h * 0.75, h * 1.5 * sk, h * 0.75 * sk, 0, 0, Math.PI * 2); c.fill();
    y -= lift;
    const D = 7;
    const P = (p) => { const k = D / (D - p[2]); return [x + p[0] * h * k, y + p[1] * h * k]; };
    const vis = [];
    for (const f of FACES) {
      const n = ap(R, f.n);
      if (n[2] > 0.015) vis.push({ f, n, u: ap(R, f.u), w: ap(R, f.w) });
    }
    const corner = (q, a, b) => P([q.n[0] + a * q.u[0] + b * q.w[0], q.n[1] + a * q.u[1] + b * q.w[1], q.n[2] + a * q.u[2] + b * q.w[2]]);
    // bevel: the whole body in the edge colour, with round joins
    c.fillStyle = '#b9b1a0'; c.strokeStyle = '#b9b1a0'; c.lineJoin = 'round'; c.lineWidth = h * 0.2;
    for (const q of vis) {
      const pts = [corner(q, 1, 1), corner(q, -1, 1), corner(q, -1, -1), corner(q, 1, -1)];
      c.beginPath(); pts.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); c.fill(); c.stroke();
    }
    for (const q of vis) {
      const lum = Math.max(0, q.n[0] * LIGHT[0] + q.n[1] * LIGHT[1] + q.n[2] * LIGHT[2]);
      const k = 0.62 + 0.38 * lum;
      const s = 0.9;
      const pts = [corner(q, s, s), corner(q, -s, s), corner(q, -s, -s), corner(q, s, -s)];
      roundPoly(c, pts, h * 0.3);
      const base = [255, 251, 242];
      c.fillStyle = `rgb(${Math.round(base[0] * k)},${Math.round(base[1] * k)},${Math.round(base[2] * k * 0.98)})`;
      c.fill();
      if (q.n[2] > 0.8) {
        // a soft sheen on the face looking at us
        const cc = corner(q, -0.35, -0.45);
        const g = c.createRadialGradient(cc[0], cc[1], 0, cc[0], cc[1], h * 1.2);
        g.addColorStop(0, 'rgba(255,255,255,0.65)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fill();
      }
      // pips
      const pips = PIPS[q.f.v];
      const pr = q.f.v === 1 ? 0.27 : 0.19;
      c.fillStyle = q.f.v === 1 ? '#d7263d' : '#1d2547';
      for (const [a, b] of pips) {
        c.beginPath();
        for (let j = 0; j <= 12; j++) {
          const an = (j / 12) * Math.PI * 2;
          const p = corner(q, a + Math.cos(an) * pr, b + Math.sin(an) * pr);
          j ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]);
        }
        c.closePath(); c.fill();
      }
    }
    c.restore();
  }
  // A flat little die face for the scorecard labels.
  function miniDie(c, x, y, s, v) {
    roundRect(c, x - s / 2, y - s / 2, s, s, s * 0.22);
    const g = c.createLinearGradient(0, y - s / 2, 0, y + s / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#d9d2c2');
    c.fillStyle = g; c.fill();
    c.fillStyle = v === 1 ? '#d7263d' : '#1d2547';
    for (const [a, b] of PIPS[v]) { c.beginPath(); c.arc(x + a * s * 0.36, y + b * s * 0.36, s * (v === 1 ? 0.12 : 0.085), 0, Math.PI * 2); c.fill(); }
  }

  // ---------- Layout (stage units) ----------
  const TRAY = { x: 46, y: 108, w: 1074, h: 726 };
  const CARD = { x: 1150, y: 22, w: 730, h: 1036 };
  const ROLLBTN = { x: 800, y: 862, w: 320, h: 108 };
  const DIE_H = 56;
  const slot = (i, held) => ({ x: 583 + (i - 2) * 188, y: held ? 676 : 432 });
  const ROWS = [0, 1, 2, 3, 4, 5, 'bonus', 6, 7, 8, 9, 10, 11, 12, 'total'];
  const CARD_HEAD = 96;
  const rowH = (CARD.h - CARD_HEAD - 18) / ROWS.length;
  const rowY = (r) => CARD.y + CARD_HEAD + ROWS.indexOf(r) * rowH;
  const LABEL_W = 318;
  const colW = () => (CARD.w - LABEL_W - 16) / Math.max(1, players.length || seatCount);
  const colX = (pi) => CARD.x + LABEL_W + pi * colW();

  let trayPic = null, cardPic = null;
  function resize() {
    trayPic = bake(VW, VH, (c) => {
      // wooden frame
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40; c.shadowOffsetY = 18;
      roundRect(c, TRAY.x, TRAY.y, TRAY.w, TRAY.h, 56);
      const wg = c.createLinearGradient(0, TRAY.y, 0, TRAY.y + TRAY.h);
      wg.addColorStop(0, '#a8683a'); wg.addColorStop(0.5, '#7a4322'); wg.addColorStop(1, '#4e2812');
      c.fillStyle = wg; c.fill();
      c.restore();
      c.save();
      roundRect(c, TRAY.x, TRAY.y, TRAY.w, TRAY.h, 56); c.clip();
      c.globalAlpha = 0.16; c.strokeStyle = '#2b1206'; c.lineWidth = 2;
      for (let i = 0; i < 26; i++) {
        const yy = TRAY.y + 8 + i * 28;
        c.beginPath(); c.moveTo(TRAY.x, yy);
        for (let x = TRAY.x; x <= TRAY.x + TRAY.w; x += 40) c.lineTo(x, yy + Math.sin(x * 0.012 + i) * 5);
        c.stroke();
      }
      c.restore();
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,220,170,0.35)'; roundRect(c, TRAY.x + 2, TRAY.y + 2, TRAY.w - 4, TRAY.h - 4, 54); c.stroke();
      // felt
      const fx = TRAY.x + 30, fy = TRAY.y + 30, fw = TRAY.w - 60, fh = TRAY.h - 60;
      roundRect(c, fx, fy, fw, fh, 34);
      const fg = c.createRadialGradient(fx + fw / 2, fy + fh * 0.4, 40, fx + fw / 2, fy + fh / 2, fw * 0.7);
      fg.addColorStop(0, '#2fae6f'); fg.addColorStop(0.6, '#1b7f4f'); fg.addColorStop(1, '#0c4a2d');
      c.fillStyle = fg; c.fill();
      c.save(); roundRect(c, fx, fy, fw, fh, 34); c.clip();
      for (let i = 0; i < 2600; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
        c.fillRect(fx + Math.random() * fw, fy + Math.random() * fh, 2, 2);
      }
      // inner shadow of the rim
      c.lineWidth = 30; c.strokeStyle = 'rgba(0,0,0,0.28)'; c.filter = 'blur(8px)';
      roundRect(c, fx - 6, fy - 6, fw + 12, fh + 12, 40); c.stroke();
      c.filter = 'none';
      c.restore();
      // the keep rail
      const ry = slot(0, true).y;
      roundRect(c, fx + 40, ry - 92, fw - 80, 170, 30);
      c.fillStyle = 'rgba(0,30,15,0.28)'; c.fill();
      c.setLineDash([14, 10]); c.lineWidth = 3; c.strokeStyle = 'rgba(255,240,190,0.35)';
      roundRect(c, fx + 40, ry - 92, fw - 80, 170, 30); c.stroke(); c.setLineDash([]);
      text(c, 'KEPT DICE', fx + 70, ry - 70, 22, 'rgba(255,240,190,0.55)', 800, 'left');
    });
    cardPic = bake(VW, VH, (c) => {
      panel(c, CARD.x, CARD.y, CARD.w, CARD.h, 34, '#fffaf0', '#efe6d2', 'rgba(255,255,255,0.8)', 3);
      // rows
      ROWS.forEach((r, i) => {
        const y = CARD.y + CARD_HEAD + i * rowH;
        if (i % 2 === 0) { c.fillStyle = 'rgba(30,60,40,0.05)'; c.fillRect(CARD.x + 8, y, CARD.w - 16, rowH); }
        if (r === 'bonus' || r === 'total') { c.fillStyle = 'rgba(255,190,40,0.16)'; c.fillRect(CARD.x + 8, y, CARD.w - 16, rowH); }
        c.fillStyle = 'rgba(40,40,60,0.12)'; c.fillRect(CARD.x + 12, y + rowH - 1, CARD.w - 24, 1.5);
        const yc = y + rowH / 2;
        if (typeof r === 'number' && r < 6) {
          miniDie(c, CARD.x + 44, yc, 36, r + 1);
          text(c, CATS[r].name, CARD.x + 78, yc, 30, '#1d2547', 700, 'left');
        } else if (typeof r === 'number') {
          text(c, CATS[r].short || CATS[r].name, CARD.x + 26, yc, 29, '#1d2547', 700, 'left', 220);
          text(c, CATS[r].hint, CARD.x + LABEL_W - 14, yc, 21, 'rgba(29,37,71,0.5)', 700, 'right');
        } else if (r === 'bonus') {
          text(c, 'Bonus', CARD.x + 26, yc, 29, '#8a5200', 800, 'left');
          text(c, '63+ → 35', CARD.x + LABEL_W - 14, yc, 21, 'rgba(138,82,0,0.7)', 700, 'right');
        } else {
          text(c, 'Total', CARD.x + 26, yc, 34, '#8a5200', 800, 'left', 0, Kit.FONT);
        }
      });
      c.fillStyle = 'rgba(29,37,71,0.25)';
      c.fillRect(CARD.x + LABEL_W - 2, CARD.y + 16, 2, CARD.h - 32);
      text(c, 'Score card', CARD.x + 30, CARD.y + 50, 34, '#1d2547', 800, 'left', 0, Kit.FONT);
    });
  }

  // ---------- State ----------
  const dice = [0, 1, 2, 3, 4].map((i) => {
    const v = 1 + rnd(6), s = slot(i, false), spin = (Math.random() - 0.5) * 0.6;
    return { v, held: false, spin, R: finalR(v, spin), x: s.x, y: s.y, anim: null, lift: 0 };
  });
  let cur = 0, round = 1, rollsLeft = 3, rolled = false, phase = 'idle', phaseT = 0;
  let focus = { area: 'dice', i: 5 }, cardSel = 0, zeroAsk = -1;
  let tvT = 0, tvMask = -1, tvCat = -1, suggest = -1, tipMask = -1, msg = '';
  const curP = () => players[cur];
  const values = () => dice.map((d) => d.v);

  function start() {
    players.forEach((p) => { p.card = new Array(13).fill(null); p.shown = 0; });
    round = 1;
    beginTurn(0);
  }
  function beginTurn(i) {
    cur = i; rollsLeft = 3; rolled = false; suggest = -1; tipMask = -1; zeroAsk = -1; tvMask = -1; tvCat = -1;
    dice.forEach((d) => { d.held = false; });
    focus = { area: 'dice', i: 5 };
    phase = 'turn'; phaseT = 0;
    tvT = 1.2;
    msg = '';
    showBanner(curP(), players.length > 1 ? `Round ${round} of 13` : `Round ${round} of 13  ·  aim high!`);
  }
  function doRoll() {
    if (rollsLeft <= 0 || phase !== 'turn') return false;
    if (dice.every((d) => d.held)) { Kit.sfx.nope(); fxText('Let go of a die to roll', 583, 300, { size: 44, color: '#ffe066' }); return false; }
    rollsLeft--; rolled = true; zeroAsk = -1; tvMask = -1; suggest = -1; tipMask = -1;
    let k = 0;
    dice.forEach((d) => {
      if (d.held) return;
      d.v = 1 + rnd(6);
      d.spin = (Math.random() - 0.5) * 0.6;
      const ax = [Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5];
      const m = Math.hypot(...ax) || 1;
      d.anim = {
        t: -k * 0.06, dur: 0.95 + Math.random() * 0.25,
        ax: ax.map((x) => x / m), ang: (Math.random() < 0.5 ? -1 : 1) * (Math.PI * (5 + Math.random() * 3)),
        fx: 980 + Math.random() * 80, fy: 760 + Math.random() * 40, Rf: finalR(d.v, d.spin), hits: 0,
      };
      k++;
    });
    phase = 'rolling'; phaseT = 0;
    for (let i = 0; i < 7; i++) Kit.noise({ dur: 0.04, vol: 0.12, freq: 2200 + Math.random() * 2200, q: 3, at: i * 0.06 + Math.random() * 0.03 });
    return true;
  }
  function afterRoll() {
    phase = 'turn'; phaseT = 0;
    const p = curP(), d = values();
    suggest = bestCat(p, d);
    const sc = scoresAll(d);
    if (sc[11] === 50) { fxText('Five of a kind!', 583, 330, { size: 80, color: '#ffd23f', big: true, life: 1.6 }); Kit.sfx.win(); dice.forEach((q) => fxBurst(q.x, q.y, '#ffd23f', 12, 0.8)); Kit.shake(10, 0.3); }
    else if (sc[10] === 40) { fxText('Large straight!', 583, 330, { size: 64, color: '#7dffb0' }); Kit.sfx.chime(); }
    if (p.human) {
      if (skill === 0 && rollsLeft > 0) tipMask = planHolds(p, d, rollsLeft, 40, 0);
      if (rollsLeft === 0) { focus = { area: 'card' }; cardSel = skill === 0 ? suggest : openCats(p)[0]; }
    } else tvT = 0.7;
  }
  function scoreCat(cat) {
    const p = curP();
    if (p.card[cat] != null || !rolled || phase !== 'turn') return;
    const hadBonus = bonusOf(p);
    const s = scoresAll(values())[cat];
    p.card[cat] = s;
    const y = rowY(cat) + rowH / 2, x = colX(cur) + colW() / 2;
    if (s > 0) {
      fxBurst(x, y, p.color, 16, 0.8);
      fxText('+' + s, x, y - 20, { size: 54, color: s >= 30 ? '#ffd23f' : '#ffffff' });
      Kit.sfx.clear(Math.min(4, Math.round(s / 12)), 0);
    } else { fxText('0', x, y - 20, { size: 50, color: '#c8d0ff' }); Kit.sfx.drop(); }
    if (!hadBonus && bonusOf(p)) {
      setTimeout(() => { fxText('Bonus +35!', x - 120, rowY('bonus'), { size: 66, color: '#ffd23f', big: true, life: 1.6 }); Kit.sfx.chime(); }, 350);
    }
    focus = { area: 'dice', i: 5 };
    phase = 'after'; phaseT = 0;
  }
  function nextTurn() {
    let n = cur + 1;
    if (n >= players.length) { n = 0; round++; }
    if (round > 13) { endGame(); return; }
    beginTurn(n);
  }
  function endGame() {
    phase = 'idle';
    const ranking = players.map((p) => ({ p, score: totalOf(p), note: bonusOf(p) ? 'bonus +35' : '' })).sort((a, b) => b.score - a.score);
    let newBest = false;
    players.forEach((p) => { if (p.human && totalOf(p) > best) { best = totalOf(p); newBest = true; } });
    if (newBest) { Kit.store.set('dicefive.best', best); Kit.record('dicefive', best); }
    const top = ranking[0];
    const tie = ranking.length > 1 && ranking[1].score === top.score;
    let head;
    if (players.length === 1) head = `${top.score} points!`;
    else if (tie) head = "It's a tie!";
    else head = top.p.name === 'You' ? 'You win!' : `${top.p.name} wins!`;
    showResults(ranking, head, newBest ? `New best score: ${best}!` : `Best score: ${best}`);
  }

  // ---------- TV turns ----------
  function tvStep() {
    const p = curP();
    if (!rolled) { doRoll(); return; }
    const d = values();
    if (tvCat >= 0) { scoreCat(tvCat); return; }
    if (tvMask < 0) {
      if (rollsLeft === 0) tvMask = 31;
      else if (skill === 0) tvMask = Math.random() < 0.3 && rollsLeft < 2 ? 31 : beginnerHolds(d);
      else tvMask = planHolds(p, d, rollsLeft, skill === 2 ? 160 : 30, skill === 2 ? 0 : 5);
    }
    if (tvMask !== 31) {
      for (let i = 0; i < 5; i++) {
        const want = !!((tvMask >> i) & 1);
        if (dice[i].held !== want) { toggleHold(i); tvT = 0.32; return; }
      }
      if (dice.some((q) => !q.held)) { doRoll(); return; }
    }
    // pick a box
    if (skill === 0) {
      const open = openCats(p), sc = scoresAll(d);
      const some = open.filter((i) => sc[i] > 0);
      if (Math.random() < 0.65 || !some.length) tvCat = open.reduce((b, i) => (sc[i] > sc[b] ? i : b), open[0]);
      else tvCat = some[rnd(some.length)];
    } else tvCat = bestCat(p, d);
    focus = { area: 'card' }; cardSel = tvCat;
    tvT = 0.85;
  }
  function toggleHold(i) {
    const d = dice[i];
    d.held = !d.held;
    zeroAsk = -1;
    if (d.held) Kit.tone(760, { type: 'triangle', dur: 0.08, vol: 0.14, slide: 1.3 });
    else Kit.tone(520, { type: 'triangle', dur: 0.08, vol: 0.1, slide: 0.8 });
  }

  // ---------- Update ----------
  function update(dt) {
    if (state === 'menu') { idleDice(dt); return; }
    if (state !== 'play') return;
    phaseT += dt;
    let rolling = false;
    dice.forEach((d, i) => {
      const s = slot(i, d.held);
      if (d.anim) {
        const a = d.anim;
        a.t += dt;
        if (a.t < 0) { rolling = true; d.lift = -999; return; }
        const k = clamp(a.t / a.dur, 0, 1), e = ease.out(k);
        d.x = lerp(a.fx, s.x, e); d.y = lerp(a.fy, s.y, e);
        d.lift = Math.abs(Math.sin(k * Math.PI * 2.5)) * Math.pow(1 - k, 1.6) * 190;
        d.R = mul(rot(a.ax, a.ang * (1 - e)), a.Rf);
        const hit = Math.floor(k * 2.5 + 0.0001);
        if (hit > a.hits && k < 1) { a.hits = hit; Kit.noise({ dur: 0.04, vol: 0.12 * (1 - k), freq: 1800, q: 2 }); }
        if (k >= 1) { d.anim = null; d.lift = 0; d.R = a.Rf; Kit.tone(170 + i * 12, { type: 'sine', dur: 0.06, vol: 0.12 }); }
        else rolling = true;
      } else {
        d.x += (s.x - d.x) * Math.min(1, dt * 12);
        d.y += (s.y - d.y) * Math.min(1, dt * 12);
        d.lift = 0;
      }
    });
    players.forEach((p) => { const t = totalOf(p); p.shown += (t - p.shown) * Math.min(1, dt * 6); if (Math.abs(t - p.shown) < 0.3) p.shown = t; });
    if (phase === 'rolling' && !rolling) afterRoll();
    else if (phase === 'after' && phaseT > 1.0) nextTurn();
    else if (phase === 'turn' && !curP().human && !cover) {
      tvT -= dt;
      if (tvT <= 0 && !bannerBusy()) { tvT = 0.55; tvStep(); }
    }
  }
  // On the menu the dice lie on the felt and turn now and then.
  let idleT = 0;
  function idleDice(dt) {
    idleT += dt;
    dice.forEach((d, i) => {
      const s = slot(i, false);
      d.x = s.x; d.y = s.y + Math.sin(idleT * 1.4 + i) * 4; d.lift = 0; d.anim = null; d.held = false;
      d.R = mul(rot([0, 0, 1], Math.sin(idleT * 0.7 + i * 1.3) * 0.25), finalR(d.v, d.spin));
    });
  }

  // ---------- Keys and taps ----------
  function key(k) {
    if (state !== 'play' || phase !== 'turn' || !curP().human || bannerBusy()) return;
    const p = curP();
    if (focus.area === 'dice') {
      if (k === 'left' || k === 'right') { focus.i = (focus.i + (k === 'left' ? 5 : 1)) % 6; Kit.sfx.move(); return; }
      if (k === 'down') {
        if (!rolled) { Kit.sfx.nope(); return; }
        focus = { area: 'card' };
        const open = openCats(p);
        cardSel = skill === 0 && suggest >= 0 ? suggest : open[0];
        Kit.sfx.move(); return;
      }
      if (k === 'ok') {
        if (focus.i === 5) {
          if (rollsLeft > 0) doRoll();
          else { Kit.sfx.nope(); focus = { area: 'card' }; cardSel = skill === 0 ? suggest : openCats(p)[0]; }
          return;
        }
        if (!rolled || rollsLeft === 0) { Kit.sfx.nope(); return; }
        toggleHold(focus.i);
      }
      return;
    }
    // scorecard
    const open = openCats(p);
    let ix = open.indexOf(cardSel);
    if (ix < 0) { ix = 0; cardSel = open[0]; }
    if (k === 'down') { if (ix < open.length - 1) { cardSel = open[ix + 1]; zeroAsk = -1; Kit.sfx.move(); } else Kit.sfx.nope(); return; }
    if (k === 'up') {
      if (ix > 0) { cardSel = open[ix - 1]; zeroAsk = -1; Kit.sfx.move(); }
      else if (rollsLeft > 0) { focus = { area: 'dice', i: 5 }; Kit.sfx.move(); }
      else Kit.sfx.nope();
      return;
    }
    if (k === 'left') { if (rollsLeft > 0) { focus = { area: 'dice', i: 5 }; Kit.sfx.move(); } else Kit.sfx.nope(); return; }
    if (k === 'ok') {
      const s = scoresAll(values())[cardSel];
      if (s === 0 && zeroAsk !== cardSel) {
        zeroAsk = cardSel; Kit.sfx.nope();
        return;
      }
      scoreCat(cardSel);
    }
  }
  function pointer(pt) {
    if (state !== 'play' || phase !== 'turn' || !curP().human) return;
    const p = curP();
    if (inside(pt, ROLLBTN)) { focus = { area: 'dice', i: 5 }; key('ok'); return; }
    for (let i = 0; i < 5; i++) {
      const d = dice[i];
      if (Math.hypot(pt.x - d.x, pt.y - d.y) < 85) { focus = { area: 'dice', i }; key('ok'); return; }
    }
    if (rolled && pt.x > colX(cur) && pt.x < colX(cur) + colW()) {
      const cat = ROWS.find((r) => typeof r === 'number' && pt.y >= rowY(r) && pt.y < rowY(r) + rowH);
      if (cat != null && p.card[cat] == null) {
        if (focus.area === 'card' && cardSel === cat) key('ok');
        else { focus = { area: 'card' }; cardSel = cat; zeroAsk = -1; Kit.sfx.move(); }
      }
    }
  }

  // ---------- Drawing ----------
  function drawCard(c, t) {
    c.drawImage(cardPic, 0, 0, VW, VH);
    const n = players.length;
    if (!n) return;
    const cw = colW();
    const p = curP();
    const playing = state === 'play';
    const sc = rolled && playing ? scoresAll(values()) : null;
    players.forEach((q, pi) => {
      const x = colX(pi), on = pi === cur && playing;
      if (on) {
        roundRect(c, x + 3, CARD.y + 10, cw - 6, CARD.h - 20, 18);
        c.fillStyle = rgba(q.color, 0.14); c.fill();
        c.lineWidth = 3; c.strokeStyle = rgba(q.color, 0.7); c.stroke();
      }
      token(c, x + cw / 2, CARD.y + 34, 18, q.color);
      text(c, q.name, x + cw / 2, CARD.y + 74, n > 3 ? 22 : 25, '#1d2547', 800, 'center', cw - 10);
      ROWS.forEach((r) => {
        const yc = rowY(r) + rowH / 2;
        if (typeof r === 'number') {
          const v = q.card[r];
          if (v != null) text(c, String(v), x + cw / 2, yc + 2, 34, v ? '#1d2547' : 'rgba(29,37,71,0.35)', 800, 'center', cw - 8, Kit.FONT);
          else if (on && sc) {
            const sel = focus.area === 'card' && cardSel === r && p.human;
            if (skill === 0 && r === suggest && p.human) {
              const pulse = 0.5 + 0.5 * Math.sin(t * 5);
              c.save(); c.shadowColor = '#22d67a'; c.shadowBlur = 18 + pulse * 14;
              roundRect(c, x + 8, rowY(r) + 5, cw - 16, rowH - 10, 14);
              c.fillStyle = `rgba(34,214,122,${0.25 + pulse * 0.2})`; c.fill(); c.restore();
            }
            text(c, String(sc[r]), x + cw / 2, yc + 2, 32, sc[r] ? 'rgba(13,140,72,0.95)' : 'rgba(29,37,71,0.28)', 700, 'center', cw - 8, Kit.FONT);
            if (sel || (!p.human && focus.area === 'card' && cardSel === r)) {
              focusRing(c, x + 6, rowY(r) + 4, cw - 12, rowH - 8, 12, t, p.human ? '#ff9f1c' : q.color);
            }
          }
        } else if (r === 'bonus') {
          const b = bonusOf(q), u = upperSum(q);
          if (b) text(c, '35', x + cw / 2, yc + 2, 34, '#c77800', 800, 'center', 0, Kit.FONT);
          else text(c, `${u}/63`, x + cw / 2, yc + 2, 22, 'rgba(138,82,0,0.6)', 700, 'center', cw - 8);
        } else {
          text(c, String(Math.round(q.shown)), x + cw / 2, yc + 2, 40, '#a35a00', 800, 'center', cw - 6, Kit.FONT);
        }
      });
    });
    // row band for the focused box
    if (playing && focus.area === 'card' && phase === 'turn') {
      const y = rowY(cardSel);
      c.fillStyle = 'rgba(255,159,28,0.12)';
      roundRect(c, CARD.x + 10, y + 2, LABEL_W - 14, rowH - 4, 12); c.fill();
      if (zeroAsk === cardSel && p.human) {
        const bx = CARD.x - 520, by = y - 16;
        panel(c, bx, by, 500, rowH + 32, 22, '#5a1d2f', '#2a0d18', '#ff9aa8', 3);
        text(c, '0 points here?  OK again to confirm', bx + 250, by + (rowH + 32) / 2, 28, '#ffffff', 800, 'center', 470);
      }
    }
  }
  function drawLeft(c, t) {
    c.drawImage(trayPic, 0, 0, VW, VH);
    outlined(c, 'Dice Five', 70, 58, 62, '#ffffff', '#ffe27a', 'left');
    if (players.length && state !== 'menu') text(c, `Round ${Math.min(round, 13)} / 13`, 400, 60, 36, 'rgba(255,255,255,0.85)', 800, 'left');
    const playing = state === 'play' && players.length;
    const p = playing ? curP() : null;
    // status line on the felt
    let line = '';
    if (playing) {
      if (phase === 'rolling') line = 'Rolling…';
      else if (phase === 'after') line = '';
      else if (!p.human) line = `${p.name} is thinking…`;
      else if (!rolled) line = Kit.touchFirst() ? 'Tap Roll to throw the dice' : 'Press OK to roll the dice';
      else if (rollsLeft === 0) line = 'Pick a box on your score card';
      else if (skill === 0 && tipMask >= 0) line = tipMask === 31 ? 'Tip: these dice are good, score them (▼)' : tipMask === 0 ? 'Tip: roll them all again' : 'Tip: hold the glowing dice, then roll';
      else line = 'OK holds a die  ·  ▼ score card';
    }
    if (line) text(c, line, TRAY.x + TRAY.w / 2, TRAY.y + 76, 34, '#fff7d6', 700, 'center', TRAY.w - 120);
    // dice: held ones first (behind), rolling ones on top
    const order = [0, 1, 2, 3, 4].sort((a, b) => (dice[a].lift || 0) - (dice[b].lift || 0));
    for (const i of order) {
      const d = dice[i];
      if (d.lift === -999) continue;
      const alpha = playing && !rolled && phase === 'turn' ? 0.45 : 1;
      if (playing && skill === 0 && p.human && tipMask >= 0 && tipMask !== 31 && (tipMask >> i) & 1 && !d.held && phase === 'turn') {
        c.save(); const pulse = 0.5 + 0.5 * Math.sin(t * 5);
        c.shadowColor = '#7dffb0'; c.shadowBlur = 30 + pulse * 20;
        c.fillStyle = `rgba(125,255,176,${0.18 + pulse * 0.15})`;
        c.beginPath(); c.arc(d.x, d.y, 82, 0, Math.PI * 2); c.fill(); c.restore();
      }
      drawDie(c, d.x, d.y, DIE_H, d.R, d.lift, alpha);
      if (d.held && rolled) {
        roundRect(c, d.x - 48, d.y + 74, 96, 32, 16);
        c.fillStyle = '#ffcf3f'; c.fill();
        text(c, 'HELD', d.x, d.y + 91, 21, '#4a2a00', 900);
      }
      if (playing && p.human && phase === 'turn' && focus.area === 'dice' && focus.i === i && !bannerBusy()) {
        focusRing(c, d.x - 80, d.y - 84, 160, 160, 34, t);
      }
    }
    // Roll button with the rolls left
    if (players.length) {
      const can = playing && phase === 'turn' && rollsLeft > 0;
      const f = playing && p.human && phase === 'turn' && focus.area === 'dice' && focus.i === 5 && !bannerBusy();
      button(c, ROLLBTN.x, ROLLBTN.y, ROLLBTN.w, ROLLBTN.h, rollsLeft === 0 && rolled ? 'Score it' : '🎲 Roll', can || rollsLeft === 0 ? 'gold' : 'off', f, t, 46);
      for (let i = 0; i < 3; i++) {
        const on = i < rollsLeft;
        c.beginPath(); c.arc(ROLLBTN.x + ROLLBTN.w / 2 + (i - 1) * 40, ROLLBTN.y + ROLLBTN.h + 34, 13, 0, Math.PI * 2);
        c.fillStyle = on ? '#ffe066' : 'rgba(255,255,255,0.18)'; c.fill();
        if (on) { c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke(); }
      }
      text(c, 'rolls left', ROLLBTN.x + ROLLBTN.w / 2 + 92, ROLLBTN.y + ROLLBTN.h + 35, 22, 'rgba(255,255,255,0.7)', 700, 'left');
    }
    // players strip
    const n = players.length;
    players.forEach((q, i) => {
      const cols = n > 2 ? 2 : 1, w = cols === 2 ? 352 : 720, h = n > 2 ? 84 : 92;
      const x = 50 + (i % cols) * (w + 16), y = 858 + Math.floor(i / cols) * (h + 14);
      const on = playing && i === cur;
      panel(c, x, y, w, h, 26, on ? shade(q.color, -0.15) : '#1d3b33', on ? shade(q.color, -0.55) : '#0f221d', on ? '#ffffff' : 'rgba(255,255,255,0.2)', on ? 4 : 2);
      token(c, x + 44, y + h / 2, 24, q.color);
      text(c, q.name + (q.human ? '' : ' 📺'), x + 82, y + h / 2, 34, '#ffffff', 800, 'left', w - 200);
      text(c, String(Math.round(q.shown || 0)), x + w - 28, y + h / 2 + 2, 44, '#ffe066', 800, 'right', 0, Kit.FONT);
    });
  }
  function draw(c, t) {
    drawLeft(c, t);
    drawCard(c, t);
  }

  const GAME = { start, update, draw, key, pointer, resize };
  boot();
})();
