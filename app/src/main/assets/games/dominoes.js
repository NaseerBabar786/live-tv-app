// Dominoes: the double-six draw game. Match a tile to either open end of the line; if nothing fits,
// draw from the boneyard (pass when it is empty). Empty your hand to win the round and score the pips
// left in everyone else's hands; a blocked round goes to the lightest hand. First to 100 (Beginner: 50) wins.
// 2 to 4 players, any seat can be the TV; hands stay hidden with a pass-the-remote screen between people.
// Remote: ◀ ▶ choose a tile, ▲ ▼ choose the end, OK plays; Draw / Pass sits at the end of your tiles.
'use strict';

(() => {
  const CFG = {
    id: 'dominoes', title: 'Dominoes', defN: 2, minP: 2, maxP: 4,
    how: 'Match the dots on either end of the line. Empty your hand first to score!',
    bg: ['#10294a', '#050c1a', 'rgba(120,190,255,0.08)'],
    menuTop: '#1d4f7a', menuBottom: '#0a2038', titleColor: '#ffe08a',
    skillTips: ['Playable tiles glow, first to 50', 'No hints, first to 100', 'Crafty TV, first to 100'],
    recordText: () => `👑 Wins: ${wins}`,
    bannerY: 454, mutePos: [1862, 836],
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

  // ---------- Tiles ----------
  const PIP_COL = ['#000000', '#2b6cff', '#16a34a', '#e11d48', '#9333ea', '#ea580c', '#0e7490'];
  const PIPS = {
    0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
    4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
  };
  const pips = (t) => t.a + t.b;
  const isDouble = (t) => t.a === t.b;
  const fits = (t, v) => t.a === v || t.b === v;
  const tileSprites = new Map();
  // A tile picture: first value on the left / top half. Drawn once per size (gradients are slow on TV boxes).
  function tilePic(first, second, w, h, back) {
    const key = (back ? 'B' + back : first + '-' + second) + ':' + Math.round(w) + 'x' + Math.round(h);
    let pic = tileSprites.get(key);
    if (pic) return pic;
    const pad = 14;
    pic = bake(w + pad * 2, h + pad * 2, (c) => {
      c.translate(pad, pad);
      const r = Math.min(w, h) * 0.17;
      c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 10; c.shadowOffsetY = 5;
      roundRect(c, 0, 0, w, h, r);
      c.fillStyle = back ? shade(back, -0.55) : '#cfc6b2'; c.fill();
      c.shadowColor = 'transparent';
      // top face, a little smaller: gives the tile its thickness
      const g = c.createLinearGradient(0, 0, w * 0.3, h);
      if (back) { g.addColorStop(0, shade(back, 0.05)); g.addColorStop(1, shade(back, -0.4)); }
      else { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#ece4d2'); }
      roundRect(c, 1.5, 1.5, w - 3, h - 5, r * 0.9);
      c.fillStyle = g; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      roundRect(c, 4, 3, w - 8, (h - 5) * 0.28, r * 0.7); c.fill();
      if (back) {
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = Math.max(1.5, w * 0.03);
        roundRect(c, w * 0.16, h * 0.12, w * 0.68, h * 0.72, r * 0.6); c.stroke();
        c.fillStyle = 'rgba(255,255,255,0.4)';
        c.beginPath(); c.arc(w / 2, (h - 4) / 2, Math.min(w, h) * 0.12, 0, Math.PI * 2); c.fill();
        return;
      }
      const vert = h > w;
      const s = vert ? w : h; // half size
      // divider and brass pin
      c.strokeStyle = 'rgba(60,50,40,0.45)'; c.lineWidth = Math.max(1.5, s * 0.035);
      c.beginPath();
      if (vert) { c.moveTo(s * 0.14, (h - 4) / 2); c.lineTo(w - s * 0.14, (h - 4) / 2); }
      else { c.moveTo(w / 2, s * 0.14); c.lineTo(w / 2, h - 4 - s * 0.14); }
      c.stroke();
      const pg = c.createRadialGradient(w / 2 - 1, (h - 4) / 2 - 1, 0, w / 2, (h - 4) / 2, s * 0.07);
      pg.addColorStop(0, '#fff4c2'); pg.addColorStop(1, '#a8761c');
      c.fillStyle = pg; c.beginPath(); c.arc(w / 2, (h - 4) / 2, s * 0.065, 0, Math.PI * 2); c.fill();
      const half = (v, cx, cy) => {
        for (const [a, b] of PIPS[v]) {
          const x = cx + a * s * 0.24, y = cy + b * s * 0.24, pr = s * 0.098;
          c.fillStyle = shade(PIP_COL[v], -0.35);
          c.beginPath(); c.arc(x, y + pr * 0.15, pr, 0, Math.PI * 2); c.fill();
          c.fillStyle = PIP_COL[v];
          c.beginPath(); c.arc(x, y, pr * 0.85, 0, Math.PI * 2); c.fill();
          c.fillStyle = 'rgba(255,255,255,0.45)';
          c.beginPath(); c.arc(x - pr * 0.3, y - pr * 0.3, pr * 0.28, 0, Math.PI * 2); c.fill();
        }
      };
      if (vert) { half(first, w / 2, (h - 4) / 4); half(second, w / 2, (h - 4) * 3 / 4); }
      else { half(first, w / 4, (h - 4) / 2); half(second, w * 3 / 4, (h - 4) / 2); }
    });
    tileSprites.set(key, pic);
    return pic;
  }
  function drawTile(c, x, y, w, h, first, second, back, alpha = 1) {
    const pic = tilePic(first, second, w, h, back);
    c.globalAlpha = alpha;
    c.drawImage(pic, x - 14, y - 14, w + 28, h + 28);
    c.globalAlpha = 1;
  }

  // ---------- The line on the table: grows both ways and turns at the edges ----------
  const TABLE = { x: 26, y: 104, w: 1868, h: 698 };
  const CX = 960, CY = TABLE.y + TABLE.h / 2;
  const L = 108, S = 54, XMIN = TABLE.x + 50, XMAX = TABLE.x + TABLE.w - 50;
  let first = null, leftSide = [], rightSide = [];
  function firstRect() {
    if (!first) return null;
    return isDouble(first)
      ? { x: CX - S / 2, y: CY - L / 2, w: S, h: L, f: first.a, s: first.b }
      : { x: CX - L / 2, y: CY - S / 2, w: L, h: S, f: first.a, s: first.b };
  }
  // Rectangles for one side's tiles (each tile {a: matching value, b: open value}).
  function sideRects(tiles, dir) {
    const out = [];
    const fr = firstRect();
    if (!fr) return out;
    let P = { x: dir > 0 ? fr.x + fr.w : fr.x, y: CY };
    let mode = 'h', hd = dir;
    const vd = dir;
    let T = null;
    for (const t of tiles) {
      const dbl = isDouble(t);
      if (mode === 'h') {
        const len = dbl ? S : L;
        const beyond = hd > 0 ? P.x + len > XMAX : P.x - len < XMIN;
        if (!beyond) {
          if (dbl) out.push({ x: hd > 0 ? P.x : P.x - S, y: P.y - L / 2, w: S, h: L, f: t.a, s: t.b });
          else out.push({ x: hd > 0 ? P.x : P.x - L, y: P.y - S / 2, w: L, h: S, f: hd > 0 ? t.a : t.b, s: hd > 0 ? t.b : t.a });
          P = { x: P.x + hd * len, y: P.y };
        } else {
          const r = { x: hd > 0 ? P.x : P.x - S, y: vd > 0 ? P.y - S / 2 : P.y + S / 2 - L, w: S, h: L, f: vd > 0 ? t.a : t.b, s: vd > 0 ? t.b : t.a };
          out.push(r);
          T = { outer: hd > 0 ? r.x + S : r.x, yEnd: vd > 0 ? r.y + L : r.y };
          mode = 'turn';
        }
      } else {
        // the tile after a corner runs back the other way, one row further out
        const nh = -hd;
        const y = vd > 0 ? T.yEnd : T.yEnd - S;
        const x = hd > 0 ? T.outer - L : T.outer;
        out.push({ x, y, w: L, h: S, f: nh > 0 ? t.a : t.b, s: nh > 0 ? t.b : t.a });
        hd = nh;
        P = { x: hd > 0 ? x + L : x, y: y + S / 2 };
        mode = 'h';
      }
    }
    return out;
  }
  const endValue = (side) => {
    const list = side === 0 ? leftSide : rightSide;
    if (list.length) return list[list.length - 1].b;
    return side === 0 ? first.a : first.b;
  };
  // Where a tile would go: [rect] for side 0 (left) / 1 (right).
  function previewRect(tile, side) {
    if (!first) return isDouble(tile) ? { x: CX - S / 2, y: CY - L / 2, w: S, h: L, f: tile.a, s: tile.b } : { x: CX - L / 2, y: CY - S / 2, w: L, h: S, f: tile.a, s: tile.b };
    const v = endValue(side);
    const o = { a: v, b: tile.a === v ? tile.b : tile.a };
    const list = (side === 0 ? leftSide : rightSide).concat([o]);
    const rs = sideRects(list, side === 0 ? -1 : 1);
    return rs[rs.length - 1];
  }

  // ---------- State ----------
  let hands = [], bone = [], scores = [], cur = 0, roundNo = 1, leader = 0, passes = 0;
  let phase = 'idle', phaseT = 0, sel = 0, endSel = 1, flights = [], tvT = 0, roundInfo = null;
  let lacks = [];
  let lastPlayed = null;
  const target = () => (skill === 0 ? 50 : 100);
  const P = () => players[cur];

  function start() {
    scores = players.map(() => 0);
    roundNo = 1;
    startRound(-1);
  }
  function startRound(winner) {
    const all = [];
    for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) all.push({ a, b, id: a * 10 + b });
    shuffle(all);
    const n = players.length, each = n === 2 ? 7 : 5;
    hands = players.map((_, i) => all.slice(i * each, (i + 1) * each));
    bone = all.slice(n * each);
    hands.forEach(sortHand);
    lacks = players.map(() => new Set());
    first = null; leftSide = []; rightSide = []; flights = []; passes = 0; roundInfo = null; lastPlayed = null;
    if (winner >= 0) leader = winner;
    else {
      // the highest double leads (or the heaviest tile)
      let bi = 0, bv = -1;
      hands.forEach((h, i) => h.forEach((t) => { const v = (isDouble(t) ? 100 : 0) + pips(t); if (v > bv) { bv = v; bi = i; } }));
      leader = bi;
    }
    beginTurn(leader);
  }
  function sortHand(h) { h.sort((x, y) => x.a - y.a || x.b - y.b); }
  const playable = (i) => hands[i].filter((t) => !first || fits(t, endValue(0)) || fits(t, endValue(1)));
  function beginTurn(i) {
    cur = i; phase = 'turn'; phaseT = 0;
    tvT = 1.0;
    const p = P();
    const go = () => {
      showBanner(p, roundNo > 1 || first ? `Round ${roundNo}  ·  first to ${target()}` : `Round ${roundNo}  ·  first to ${target()}  ·  you lead`);
      sel = 0; endSel = 1;
      if (p.human) {
        const pl = playable(cur);
        if (pl.length) sel = hands[cur].indexOf(pl[0]);
        else sel = hands[cur].length; // the Draw button
        fixEnd();
      }
    };
    if (needsCover(p)) { phase = 'cover'; showCover(p, () => { phase = 'turn'; go(); }); }
    else go();
  }
  function fixEnd() {
    const t = hands[cur][sel];
    if (!t || !first) return;
    const ok0 = fits(t, endValue(0)), ok1 = fits(t, endValue(1));
    if (ok0 && !ok1) endSel = 0;
    else if (ok1 && !ok0) endSel = 1;
  }
  function handPos(i, k) {
    // where tile k of player i's hand sits now (for flights)
    if (showsHand(i)) { const g = handGeo(i); return { x: g.x0 + k * g.step + g.w / 2, y: g.y + g.h / 2 }; }
    const ch = chipRect(i);
    return { x: ch.x + ch.w * 0.7, y: ch.y + ch.h / 2 };
  }
  function play(tIx, side) {
    const p = P(), hand = hands[cur], t = hand[tIx];
    if (!t || phase !== 'turn') return false;
    let rect;
    if (!first) {
      rect = previewRect(t, 1);
      first = { a: t.a, b: t.b };
    } else {
      const v = endValue(side);
      if (!fits(t, v)) return false;
      rect = previewRect(t, side);
      const o = { a: v, b: t.a === v ? t.b : t.a };
      (side === 0 ? leftSide : rightSide).push(o);
    }
    const from = handPos(cur, tIx);
    hand.splice(tIx, 1);
    flights.push({ rect, fx: from.x, fy: from.y, t: 0 });
    lastPlayed = rect;
    passes = 0;
    phase = 'anim'; phaseT = 0;
    Kit.sfx.pick();
    return true;
  }
  function landed(f) {
    const r = f.rect;
    Kit.noise({ dur: 0.05, vol: 0.22, freq: 2600, q: 2 });
    Kit.tone(320, { type: 'triangle', dur: 0.07, vol: 0.14 });
    fxBurst(r.x + r.w / 2, r.y + r.h / 2, P().color, 10, 0.5);
    if (r.f === r.s) { fxText('Double!', r.x + r.w / 2, r.y - 20, { size: 40, color: '#ffe08a' }); }
  }
  function afterPlay() {
    if (!hands[cur].length) { endRound(cur, 'domino'); return; }
    nextTurn();
  }
  function nextTurn() { beginTurn((cur + 1) % players.length); }
  function draw1() {
    if (phase !== 'turn') return;
    if (playable(cur).length) { Kit.sfx.nope(); return; }
    if (first) { lacks[cur].add(endValue(0)); lacks[cur].add(endValue(1)); }
    if (!bone.length) {
      // pass
      passes++;
      fxText(`${P().name} passes`, CX, CY - 160, { size: 52, color: '#cfe3ff' });
      Kit.sfx.nope();
      if (passes >= players.length) { endRound(-1, 'blocked'); return; }
      phase = 'anim'; phaseT = 0; flights.push({ pass: true, t: 0 });
      return;
    }
    const t = bone.pop();
    hands[cur].push(t);
    sortHand(hands[cur]);
    const k = hands[cur].indexOf(t);
    flights.push({ draw: true, who: cur, k, t: 0, tile: t });
    Kit.tone(500, { type: 'triangle', dur: 0.07, vol: 0.12, slide: 1.4 });
    if (P().human) {
      const pl = playable(cur);
      sel = pl.length ? hands[cur].indexOf(pl[0]) : hands[cur].length;
      fixEnd();
      if (pl.length && fits(t, first ? endValue(0) : -1) + fits(t, first ? endValue(1) : -1)) fxText('It fits!', handPos(cur, k).x, HAND.y - 60, { size: 40, color: '#7dffb0' });
    }
  }
  function endRound(winner, how) {
    phase = 'round'; phaseT = 0;
    const totals = hands.map((h) => h.reduce((s, t) => s + pips(t), 0));
    if (how === 'blocked') {
      const low = Math.min(...totals);
      const lows = totals.map((v, i) => (v === low ? i : -1)).filter((i) => i >= 0);
      winner = lows.length === 1 ? lows[0] : -1;
    }
    let pts = 0;
    if (winner >= 0) { pts = totals.reduce((s, v, i) => (i === winner ? s : s + v), 0); scores[winner] += pts; }
    roundInfo = { winner, how, pts, totals, t: 0 };
    if (winner >= 0) {
      Kit.sfx.win();
      Kit.confetti(60);
    } else Kit.sfx.over();
    if (AUTO) setTimeout(() => { if (state === 'play' && phase === 'round') continueRound(); }, 2200);
  }
  function continueRound() {
    if (!roundInfo || phase !== 'round') return;
    const top = Math.max(...scores);
    if (top >= target()) { endGame(); return; }
    const w = roundInfo.winner;
    roundNo++;
    startRound(w >= 0 ? w : (leader + 1) % players.length);
  }
  function endGame() {
    phase = 'idle';
    const ranking = players.map((p, i) => ({ p, score: scores[i] })).sort((a, b) => b.score - a.score);
    const top = ranking[0];
    if (top.p.human) addWin();
    showResults(ranking, top.p.name === 'You' ? 'You win!' : `${top.p.name} wins!`, `First to ${target()} points  ·  ${roundNo} rounds`);
  }

  // ---------- TV ----------
  function tvMove() {
    const pl = playable(cur);
    if (!pl.length) { draw1(); return; }
    const hand = hands[cur];
    if (!first) {
      // lead the heaviest double, else the heaviest tile
      let best = pl[0];
      pl.forEach((t) => { if ((isDouble(t) ? 50 : 0) + pips(t) > (isDouble(best) ? 50 : 0) + pips(best)) best = t; });
      if (skill === 0) best = pl[0];
      play(hand.indexOf(best), 1);
      return;
    }
    const opts = [];
    pl.forEach((t) => [0, 1].forEach((side) => { if (fits(t, endValue(side))) opts.push({ t, side }); }));
    let pick = opts[0];
    if (skill === 1) {
      opts.forEach((o) => { if (pips(o.t) + (isDouble(o.t) ? 2 : 0) > pips(pick.t) + (isDouble(pick.t) ? 2 : 0)) pick = o; });
      if (Math.random() < 0.2) pick = opts[rnd(opts.length)];
    } else if (skill === 2) {
      let bv = -1e9;
      opts.forEach((o) => {
        const v = endValue(o.side), nv = o.t.a === v ? o.t.b : o.t.a;
        const other = endValue(1 - o.side);
        const rest = hand.filter((x) => x !== o.t);
        let score = pips(o.t) + (isDouble(o.t) ? 7 : 0);
        score += rest.filter((x) => fits(x, nv) || fits(x, other)).length * 3;
        players.forEach((_, j) => { if (j !== cur && lacks[j].has(nv)) score += 6; if (j !== cur && lacks[j].has(other)) score += 2; });
        if (score > bv) { bv = score; pick = o; }
      });
    }
    play(hand.indexOf(pick.t), pick.side);
  }

  // ---------- Update ----------
  function update(dt) {
    if (state !== 'play') return;
    phaseT += dt;
    if (roundInfo) roundInfo.t += dt;
    for (let i = flights.length - 1; i >= 0; i--) {
      const f = flights[i];
      f.t += dt;
      if (f.t >= (f.pass ? 0.7 : f.draw ? 0.4 : 0.45)) { flights.splice(i, 1); if (f.rect) landed(f); }
    }
    if (phase === 'anim' && !flights.length) { phase = 'turn'; afterPlay2(); }
    if (phase === 'turn' && !P().human && !cover && !bannerBusy()) {
      tvT -= dt;
      if (tvT <= 0) { tvT = skill === 0 ? 0.75 : 0.55; tvMove(); }
    }
  }
  // After a flight: a played tile ends the turn; a drawn tile lets the same player go on.
  function afterPlay2() {
    const justPlayed = lastPlayed;
    if (justPlayed) { lastPlayed = null; afterPlay(); return; }
    if (passes > 0 && !playable(cur).length && !bone.length) { nextTurn(); return; }
    phase = 'turn';
  }

  // ---------- Keys and taps ----------
  function key(k) {
    if (state !== 'play') return;
    if (phase === 'round') { if (k === 'ok' && roundInfo && roundInfo.t > 1.2) continueRound(); return; }
    if (phase !== 'turn' || !P().human || bannerBusy()) return;
    const hand = hands[cur];
    const pl = playable(cur);
    const stuck = !pl.length;
    const max = stuck ? hand.length : hand.length - 1;
    if (k === 'left' || k === 'right') {
      sel = clamp(sel + (k === 'left' ? -1 : 1), 0, max);
      fixEnd();
      Kit.sfx.move();
      return;
    }
    if (k === 'up' || k === 'down') {
      const t = hand[sel];
      if (!t || !first) return;
      const want = k === 'up' ? 0 : 1;
      if (fits(t, endValue(want))) { endSel = want; Kit.sfx.move(); } else Kit.sfx.nope();
      return;
    }
    if (k === 'ok') {
      if (sel >= hand.length) { draw1(); return; }
      const t = hand[sel];
      if (first && !fits(t, endValue(0)) && !fits(t, endValue(1))) {
        Kit.sfx.nope();
        if (stuck) { sel = hand.length; return; }
        const g = handPos(cur, sel);
        fxText("Doesn't fit", g.x, HAND.y - 60, { size: 44, color: '#ffb3c1' });
        return;
      }
      if (first && !fits(t, endValue(endSel))) endSel = 1 - endSel;
      play(sel, endSel);
      sel = Math.min(sel, Math.max(0, hand.length - 1));
    }
  }
  function pointer(pt) {
    if (state !== 'play') return;
    if (phase === 'round') { key('ok'); return; }
    if (phase !== 'turn' || !P().human) return;
    const hand = hands[cur];
    if (inside(pt, drawBtn())) { sel = hand.length; key('ok'); return; }
    // tap a ghost end
    const t = hand[sel];
    if (t && first) for (const side of [0, 1]) {
      if (!fits(t, endValue(side))) continue;
      const r = previewRect(t, side);
      if (inside(pt, { x: r.x - 10, y: r.y - 10, w: r.w + 20, h: r.h + 20 })) { endSel = side; key('ok'); return; }
    }
    const g = handGeo(cur);
    for (let k = 0; k < hand.length; k++) {
      const x = g.x0 + k * g.step;
      if (inside(pt, { x, y: g.y - 30, w: g.w, h: g.h + 30 })) {
        if (sel === k) key('ok'); else { sel = k; fixEnd(); Kit.sfx.move(); }
        return;
      }
    }
  }

  // ---------- Layout ----------
  const HAND = { x: 26, y: 818, w: 1868, h: 250 };
  const BONE = { x: 50, y: 850, w: 250, h: 196 };
  function handGeo(i) {
    const n = Math.max(1, hands[i] ? hands[i].length : 7);
    const w = 76, h = 152;
    const area = { x0: 340, x1: 1560 };
    const step = Math.min(w + 18, (area.x1 - area.x0 - w) / Math.max(1, n - 1));
    const total = step * (n - 1) + w;
    return { x0: (area.x0 + area.x1) / 2 - total / 2, y: HAND.y + 76, w, h, step };
  }
  const drawBtn = () => ({ x: 1590, y: 900, w: 250, h: 96 });
  function chipRect(i) {
    const n = players.length || 2, gap = 16, w = Math.min(560, (1868 - gap * (n - 1)) / n);
    const total = w * n + gap * (n - 1);
    return { x: 960 - total / 2 + i * (w + gap), y: 14, w, h: 80 };
  }
  // Whose tiles show face up at the bottom: the only person, or the person whose turn it is.
  function showsHand(i) {
    if (!players[i] || !players[i].human) return false;
    if (humansCount() === 1) return true;
    return i === cur && phase !== 'cover' && !cover;
  }
  function viewer() {
    if (humansCount() === 1) return players.findIndex((p) => p.human);
    if (players[cur] && players[cur].human && !cover && phase !== 'cover') return cur;
    return -1;
  }

  let tablePic = null;
  function resize() {
    tileSprites.clear();
    tablePic = bake(VW, VH, (c) => {
      // wooden table edge
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40; c.shadowOffsetY = 16;
      roundRect(c, TABLE.x, TABLE.y, TABLE.w, TABLE.h, 60);
      const wg = c.createLinearGradient(0, TABLE.y, 0, TABLE.y + TABLE.h);
      wg.addColorStop(0, '#8b5a33'); wg.addColorStop(1, '#4a2a14');
      c.fillStyle = wg; c.fill();
      c.restore();
      const fx = TABLE.x + 22, fy = TABLE.y + 22, fw = TABLE.w - 44, fh = TABLE.h - 44;
      roundRect(c, fx, fy, fw, fh, 44);
      const fg = c.createRadialGradient(CX, CY, 60, CX, CY, fw * 0.6);
      fg.addColorStop(0, '#1b7a80'); fg.addColorStop(0.7, '#0f5359'); fg.addColorStop(1, '#083338');
      c.fillStyle = fg; c.fill();
      c.save(); roundRect(c, fx, fy, fw, fh, 44); c.clip();
      for (let i = 0; i < 3000; i++) {
        c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.05)';
        c.fillRect(fx + Math.random() * fw, fy + Math.random() * fh, 2, 2);
      }
      // a soft emblem in the middle of the felt
      c.globalAlpha = 0.07; c.strokeStyle = '#ffffff'; c.lineWidth = 6;
      c.beginPath(); c.arc(CX, CY, 230, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(CX, CY, 200, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
      c.restore();
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,220,170,0.3)'; roundRect(c, TABLE.x + 2, TABLE.y + 2, TABLE.w - 4, TABLE.h - 4, 58); c.stroke();
      // hand tray
      panel(c, HAND.x, HAND.y, HAND.w, HAND.h, 34, '#1d3f66', '#0b1f38', 'rgba(150,200,255,0.3)', 2);
      roundRect(c, BONE.x, BONE.y, BONE.w, BONE.h, 26);
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fill();
    });
  }

  // ---------- Drawing ----------
  function drawLine(c, t) {
    if (!first) {
      if (state === 'play') text(c, 'The table is empty: any tile can start', CX, CY, 38, 'rgba(255,255,255,0.45)', 700);
      return;
    }
    const flying = new Set(flights.filter((f) => f.rect).map((f) => f.rect));
    const all = [firstRect()].concat(sideRects(leftSide, -1), sideRects(rightSide, 1));
    // the newest tile of each side is the matching rect object only during its flight, so compare by place
    all.forEach((r) => {
      for (const f of flying) if (Math.abs(f.x - r.x) < 0.5 && Math.abs(f.y - r.y) < 0.5) return;
      drawTile(c, r.x, r.y, r.w, r.h, r.f, r.s);
    });
    // open end markers
    if (state === 'play' && phase !== 'round') {
      [0, 1].forEach((side) => {
        const v = endValue(side);
        const probe = previewRect({ a: v, b: v === 0 ? 1 : 0 }, side);
        const x = probe.x + probe.w / 2, y = probe.y + probe.h / 2;
        c.save(); c.globalAlpha = 0.6 + 0.2 * Math.sin(t * 3 + side);
        c.beginPath(); c.arc(x, y, 22, 0, Math.PI * 2);
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
        c.lineWidth = 3; c.strokeStyle = PIP_COL[v] === '#000000' ? '#ffffff' : shade(PIP_COL[v], 0.4); c.stroke();
        c.restore();
        text(c, String(v), x, y + 1, 26, '#ffffff', 800, 'center', 0, Kit.FONT);
      });
    }
  }
  function drawFlights(c) {
    flights.forEach((f) => {
      if (f.rect) {
        const k = ease.inOut(clamp(f.t / 0.45, 0, 1));
        const r = f.rect;
        const x = lerp(f.fx - r.w / 2, r.x, k), y = lerp(f.fy - r.h / 2, r.y, k) - Math.sin(k * Math.PI) * 60;
        const s = 1 + Math.sin(k * Math.PI) * 0.25;
        c.save(); c.translate(x + r.w / 2, y + r.h / 2); c.scale(s, s);
        drawTile(c, -r.w / 2, -r.h / 2, r.w, r.h, r.f, r.s);
        c.restore();
      } else if (f.draw) {
        const k = ease.out(clamp(f.t / 0.4, 0, 1));
        const to = handPos(f.who, f.k);
        const x = lerp(BONE.x + BONE.w / 2, to.x, k), y = lerp(BONE.y + BONE.h / 2, to.y, k);
        drawTile(c, x - 30, y - 60, 60, 120, 0, 0, '#2a5fd6');
      }
    });
  }
  function drawChips(c, t) {
    players.forEach((p, i) => {
      const r = chipRect(i), on = i === cur && state === 'play' && phase !== 'round';
      panel(c, r.x, r.y, r.w, r.h, 26, on ? shade(p.color, -0.1) : '#1d3558', on ? shade(p.color, -0.55) : '#0e1d33', on ? '#ffffff' : 'rgba(255,255,255,0.22)', on ? 4 : 2);
      token(c, r.x + 40, r.y + r.h / 2, 22, p.color);
      text(c, p.name + (p.human ? '' : ' 📺'), r.x + 74, r.y + 28, 30, '#ffffff', 800, 'left', r.w * 0.5);
      // face-down tiles count
      const n = hands[i] ? hands[i].length : 0;
      const mw = 13, mh = 24, mx = r.x + 76;
      for (let k = 0; k < Math.min(n, 12); k++) drawTile(c, mx + k * (mw + 3), r.y + 46, mw, mh, 0, 0, p.color);
      if (n > 12) text(c, `+${n - 12}`, mx + 12 * 16 + 6, r.y + 58, 20, '#ffffff', 700, 'left');
      text(c, String(scores[i] || 0), r.x + r.w - 24, r.y + r.h / 2 + 2, 44, '#ffe066', 800, 'right', 0, Kit.FONT);
      text(c, 'pts', r.x + r.w - 24, r.y + r.h - 12, 16, 'rgba(255,255,255,0.6)', 700, 'right');
    });
  }
  function drawHand(c, t) {
    // boneyard
    const nb = bone.length;
    for (let k = 0; k < Math.min(nb, 8); k++) drawTile(c, BONE.x + 30 + (k % 4) * 46, BONE.y + 26 + Math.floor(k / 4) * 58 - (k % 2) * 4, 40, 80, 0, 0, '#2a5fd6');
    text(c, `Boneyard: ${nb}`, BONE.x + BONE.w / 2, BONE.y + BONE.h - 18, 26, '#cfe3ff', 800);
    if (state !== 'play') return;
    const v = viewer();
    const p = P();
    let line = '';
    if (phase === 'round') line = '';
    else if (v < 0) line = p.human ? '' : `${p.name} is thinking…`;
    else if (v !== cur) line = `${p.name} is thinking…  ·  your tiles:`;
    else if (!playable(cur).length) line = bone.length ? 'Nothing fits: draw a tile' : 'Nothing fits and the boneyard is empty: pass';
    else if (!first) line = Kit.touchFirst() ? 'You start: tap a tile' : 'You start: ◀ ▶ choose a tile, OK plays';
    else line = Kit.touchFirst() ? 'Tap a tile, tap again to play' : '◀ ▶ choose a tile  ·  ▲ ▼ choose the end  ·  OK plays';
    text(c, line, 960, HAND.y + 36, 30, '#e8f1ff', 700, 'center', 1200);
    if (v < 0) {
      // nobody's tiles to show: the current TV's hand face down
      const g = handGeo(cur);
      hands[cur].forEach((tile, k) => drawTile(c, g.x0 + k * g.step, g.y + 10, g.w * 0.86, g.h * 0.86, 0, 0, p.color));
      return;
    }
    const g = handGeo(v);
    const hand = hands[v];
    const myTurn = v === cur && phase === 'turn' && !bannerBusy();
    const drawingK = new Set(flights.filter((f) => f.draw && f.who === v).map((f) => f.k));
    hand.forEach((tile, k) => {
      if (drawingK.has(k)) return;
      const x = g.x0 + k * g.step;
      const can = !first || fits(tile, endValue(0)) || fits(tile, endValue(1));
      const isSel = myTurn && sel === k;
      const y = g.y - (isSel ? 26 : 0);
      if (skill === 0 && can && v === cur && phase === 'turn') {
        c.save(); const pulse = 0.5 + 0.5 * Math.sin(t * 5 + k);
        c.shadowColor = '#7dffb0'; c.shadowBlur = 18 + pulse * 14;
        roundRect(c, x - 4, y - 4, g.w + 8, g.h + 4, 16);
        c.fillStyle = `rgba(125,255,176,${0.3 + pulse * 0.2})`; c.fill(); c.restore();
      }
      drawTile(c, x, y, g.w, g.h, tile.a, tile.b, null, skill === 0 && !can && v === cur ? 0.55 : 1);
      if (isSel) focusRing(c, x, y, g.w, g.h - 4, 14, t);
    });
    // Draw / Pass
    if (v === cur && phase === 'turn' && !playable(cur).length) {
      const b = drawBtn();
      button(c, b.x, b.y, b.w, b.h, bone.length ? `Draw (${bone.length})` : 'Pass', 'gold', myTurn && sel >= hand.length, t, 40);
    }
    // ghost of the chosen tile at the chosen end
    const tile = hand[sel];
    if (myTurn && tile && first) {
      [0, 1].forEach((side) => {
        if (!fits(tile, endValue(side))) return;
        const r = previewRect(tile, side), chosen = side === endSel || !fits(tile, endValue(endSel));
        c.save();
        c.globalAlpha = chosen ? 0.55 + 0.25 * Math.sin(t * 6) : 0.25;
        drawTile(c, r.x, r.y, r.w, r.h, r.f, r.s);
        c.restore();
        if (chosen) focusRing(c, r.x, r.y, r.w, r.h - 3, 10, t, '#7dffb0');
      });
    }
  }
  function drawRound(c, t) {
    if (phase !== 'round' || !roundInfo) return;
    const a = clamp(roundInfo.t / 0.4, 0, 1);
    c.fillStyle = `rgba(4,10,24,${0.6 * a})`; c.fillRect(0, 0, VW, VH);
    const n = players.length;
    const pw = 1500, ph = 300 + n * 110;
    const px = (VW - pw) / 2, py = (VH - ph) / 2;
    c.save();
    c.translate(VW / 2, VH / 2); const s = ease.back(a); c.scale(s, s); c.translate(-VW / 2, -VH / 2);
    const w = roundInfo.winner;
    const col = w >= 0 ? players[w].color : '#5a6b8a';
    panel(c, px, py, pw, ph, 40, shade(col, -0.35), shade(col, -0.8), '#ffd23f', 4);
    const head = w < 0 ? 'Blocked! Nobody scores' : roundInfo.how === 'domino' ? `${players[w].name === 'You' ? 'You' : players[w].name} went out!` : `Blocked! ${players[w].name} has the lightest hand`;
    outlined(c, head, VW / 2, py + 70, 62, '#ffffff', '#ffe08a', 'center', pw - 80);
    if (w >= 0) text(c, `+${roundInfo.pts} points (the dots left in the other hands)`, VW / 2, py + 135, 32, '#ffffff', 700, 'center', pw - 80);
    players.forEach((p, i) => {
      const y = py + 190 + i * 110;
      roundRect(c, px + 40, y, pw - 80, 96, 24);
      c.fillStyle = i === w ? 'rgba(255,214,90,0.2)' : 'rgba(255,255,255,0.07)'; c.fill();
      token(c, px + 90, y + 48, 24, p.color);
      text(c, p.name, px + 130, y + 48, 34, '#ffffff', 800, 'left', 230);
      const h = hands[i];
      const tw = 34, th = 68, step = Math.min(tw + 8, 700 / Math.max(1, h.length));
      h.forEach((tile, k) => drawTile(c, px + 390 + k * step, y + 14, tw, th, tile.a, tile.b));
      if (!h.length) text(c, 'no tiles left!', px + 390, y + 48, 30, '#7dffb0', 800, 'left');
      text(c, `${roundInfo.totals[i]} dots`, px + pw - 330, y + 48, 28, 'rgba(255,255,255,0.75)', 700, 'right');
      text(c, String(scores[i]), px + pw - 80, y + 50, 50, '#ffe066', 800, 'right', 0, Kit.FONT);
    });
    const ready = roundInfo.t > 1.2;
    c.globalAlpha = ready ? 0.75 + 0.25 * Math.sin(t * 5) : 0.35;
    const done = Math.max(...scores) >= target();
    text(c, Kit.touchFirst() ? (done ? 'Tap for the results' : 'Tap for the next round') : done ? 'OK: see who won' : 'OK: next round', VW / 2, py + ph - 42, 36, '#bfe9ff', 800);
    c.restore();
  }
  function draw(c, t) {
    c.drawImage(tablePic, 0, 0, VW, VH);
    if (state === 'menu') {
      // a few tiles for show behind the menu
      const demo = [[6, 6], [6, 3], [3, 1], [1, 5], [5, 5], [5, 2]];
      demo.forEach(([a, b], i) => {
        const d = a === b;
        const x = 520 + i * 150 + (d ? 23 : 0), y = CY - (d ? 46 : 23);
        drawTile(c, x, y, d ? 46 : 92, d ? 92 : 46, a, b);
      });
      return;
    }
    drawChips(c, t);
    drawLine(c, t);
    drawHand(c, t);
    drawFlights(c);
    if (state === 'play') text(c, `Round ${roundNo}  ·  first to ${target()}`, TABLE.x + 60, TABLE.y + 48, 28, 'rgba(255,255,255,0.55)', 700, 'left');
    drawRound(c, t);
  }

  const GAME = { start, update, draw, key, pointer, resize };
  boot();
})();
