// Word Rescue: guess the hidden word one letter at a time (the category is your hint). Every wrong
// letter pops one of the seven balloons keeping your little friend above the water; solve the word
// before the last one pops. Words solved in a row make your streak. Remote: arrows move on the letter
// keyboard, OK guesses. Keyboard: arrows + Enter, or just type a letter. Touch and mouse: tap a letter.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;

  // ---------- Words (the same list as the old Word Guess) ----------
  const LIST = {
    Fruit: 'MANGO BANANA POMEGRANATE WATERMELON APRICOT GUAVA',
    City: 'KARACHI LAHORE ISLAMABAD TORONTO LONDON DELHI MUMBAI PESHAWAR DUBAI MAKKAH MADINAH',
    Country: 'PAKISTAN CANADA INDIA BANGLADESH MALAYSIA TURKEY EGYPT AUSTRALIA JAPAN',
    Food: 'BIRYANI SAMOSA PAKORA KEBAB NIHARI HALWA PARATHA CHUTNEY LASSI JALEBI',
    Animal: 'ELEPHANT GIRAFFE TIGER CAMEL PEACOCK DOLPHIN KANGAROO PENGUIN',
    Sport: 'CRICKET HOCKEY FOOTBALL BADMINTON SQUASH TENNIS KABADDI',
    'At home': 'TELEVISION KETTLE PILLOW CARPET WINDOW REMOTE',
    Nature: 'MOUNTAIN RIVER RAINBOW DESERT VOLCANO THUNDER',
  };
  const ICON = { Fruit: '🍎', City: '🏙️', Country: '🌍', Food: '🍛', Animal: '🐾', Sport: '🏏', 'At home': '🏠', Nature: '⛰️' };
  const WORDS = [];
  for (const topic in LIST) for (const word of LIST[topic].split(' ')) WORDS.push({ topic, word });

  const MAX = 7;
  // The on-screen keyboard: A–Z in three rows of nine; the last key turns the sound on and off.
  const KEYS = ['ABCDEFGHI', 'JKLMNOPQR', 'STUVWXYZ#'].map((r) => r.split(''));
  const BALLOON = ['#ff5d73', '#ffb347', '#ffe156', '#5ce1a6', '#4cc9f0', '#9b8cff', '#ff7ad9'];
  // Where each balloon sits in the bunch (back row of four, front row of three), and the order they pop.
  const SLOTS = [[-1.3, -0.15], [-0.45, -0.5], [0.45, -0.5], [1.3, -0.15], [-0.88, 0.5], [0, 0.32], [0.88, 0.5]];
  const POP = [0, 3, 4, 6, 1, 2, 5];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const CLOUDS = [{ x: 0.08, y: 0.22, s: 1, v: 0.006 }, { x: 0.5, y: 0.14, s: 0.7, v: 0.004 }, { x: 0.78, y: 0.32, s: 1.2, v: 0.008 }, { x: 0.3, y: 0.45, s: 0.6, v: 0.005 }];
  const GLINTS = Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random(), w: 0.3 + Math.random() * 0.7, p: Math.random() * 6 }));

  // ---------- State ----------
  let best = Kit.store.get('wordrescue.best', 0) | 0;
  // state: 'menu', 'play', 'won' (word solved, party), 'sinking' (last balloon popped), 'over'
  let state = 'menu', now = 0, stateAt = 0;
  let streak = 0, shown = 0, bump = 0, newBest = false, bestBefore = best;
  let cur = { topic: 'Fruit', word: '' }, guessed = new Set(), wrong = 0, tiles = [], balloons = [];
  let cr = 0, cc = 4, curX = -1, curY = -1, blinkT = 2;
  let basketY = -1, basketVy = 0, splashed = false, winFx = false, lostReveal = false;
  const used = new Set();
  let keyHit = {}, keyBad = {};

  function inflate(delay) {
    balloons = BALLOON.map((color, i) => ({ color, born: now + delay + i * 0.07, popAt: -1 }));
    BALLOON.forEach((_, i) => Kit.tone(320 + i * 45, { type: 'sine', dur: 0.12, vol: 0.05, slide: 1.6, at: delay + i * 0.07 }));
  }
  function newRound() {
    let pool = WORDS.filter((w) => !used.has(w.word));
    if (!pool.length) { used.clear(); pool = WORDS; }
    cur = pool[Math.floor(Math.random() * pool.length)];
    used.add(cur.word);
    guessed = new Set(); wrong = 0; splashed = false; winFx = false; lostReveal = false; basketVy = 0;
    keyHit = {}; keyBad = {};
    tiles = cur.word.split('').map((ch, i) => ({ ch, born: now + 0.05 * i, revealAt: -1, fx: false, lost: false }));
    inflate(0.15);
    layout(Kit.W, Kit.H);
  }
  function start() {
    streak = 0; shown = 0; newBest = false; bestBefore = best;
    state = 'play'; stateAt = now;
    newRound();
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
  }
  function next() { state = 'play'; stateAt = now; newRound(); sfx.pick(); }

  function guess(ch) {
    if (state !== 'play') return;
    if (ch === '#') { Kit.toggleMute(); sfx.move(); keyHit[ch] = now; return; }
    if (guessed.has(ch)) { sfx.nope(); keyBad[ch] = now; return; }
    guessed.add(ch); keyHit[ch] = now;
    if (cur.word.includes(ch)) {
      let k = 0;
      tiles.forEach((t) => { if (t.ch === ch) t.revealAt = now + 0.1 * k++; });
      Kit.tone(NOTES[2], { type: 'triangle', dur: 0.08, vol: 0.12 });
      if (tiles.every((t) => t.revealAt >= 0)) {
        state = 'won'; stateAt = now + 0.1 * k + 0.3;
        streak++;
        if (streak > best) {
          best = streak; Kit.store.set('wordrescue.best', best); Kit.record('wordrescue', best);
          newBest = bestBefore > 0;
        }
      }
    } else {
      wrong++;
      const i = POP[wrong - 1], b = balloons[i];
      b.popAt = now;
      const p = balloonPos(i);
      Kit.burst(p.x, p.y, b.color, 22, 1.1);
      Kit.burst(p.x, p.y, '#ffffff', 6, 0.7);
      Kit.float('POP!', p.x, p.y, { color: b.color, size: L.br * 0.9, life: 0.8 });
      Kit.noise({ dur: 0.09, vol: 0.4, freq: 2600, q: 0.6, type: 'highpass' });
      Kit.tone(520, { type: 'triangle', dur: 0.16, vol: 0.14, slide: 0.35 });
      Kit.shake(6, 0.25);
      keyBad[ch] = now;
      if (wrong >= MAX) { state = 'sinking'; stateAt = now; basketVy = -L.sc * 0.25; }
      else if (MAX - wrong === 1) Kit.float('Last balloon!', L.sx, L.waterY - L.sc * 0.62, { color: '#ff7a7a', size: L.sc * 0.06, life: 1.4, big: true });
    }
  }

  // ---------- Layout ----------
  let L = { sc: 720, sx: 0, waterY: 0, br: 30, bw: 100, keys: [] };
  const skyPic = document.createElement('canvas');
  const waterPic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H > 1.15;
    const topH = wide ? H * 0.11 : Math.min(H * 0.08, W * 0.13);
    let sc, sx, waterY, rx, rw, chipY, tileY, kbTop, kbMax;
    if (wide) {
      sc = Math.min(H, W * 0.6); sx = W * 0.225; waterY = H * 0.8;
      rx = W * 0.43; rw = W * 0.545; chipY = topH + H * 0.065; tileY = H * 0.34; kbTop = H * 0.48; kbMax = H * 0.88;
    } else {
      sc = Math.min(H * 0.5, W); sx = W / 2; waterY = topH + sc * 0.6;
      const av = H - waterY;
      rx = W * 0.03; rw = W * 0.94; chipY = waterY + av * 0.1; tileY = waterY + av * 0.27; kbTop = waterY + av * 0.42; kbMax = H - av * 0.07;
    }
    const n = Math.max(1, cur.word.length || 8);
    const ts = Math.min(sc * 0.105, rw / (n + (n - 1) * 0.12));
    const ks = Math.min(rw / (9 + 8 * 0.15 + 0.6), (kbMax - kbTop) / (3 + 2 * 0.15 + 0.6), sc * 0.11);
    const kg = ks * 0.15, kp = ks * 0.3;
    const kw = 9 * ks + 8 * kg + 2 * kp, kh = 3 * ks + 2 * kg + 2 * kp;
    const kx = rx + (rw - kw) / 2, ky = kbTop;
    const keys = KEYS.map((row, r) => row.map((ch, c) => ({ x: kx + kp + c * (ks + kg), y: ky + kp + r * (ks + kg), w: ks, h: ks })));
    L = { wide, W, H, topH, sc, sx, waterY, rx, rw, chipY, tileY, ts, tg: ts * 0.12, ks, kb: { x: kx, y: ky, w: kw, h: kh }, keys,
      br: sc * 0.05, bw: sc * 0.17, rimFull: waterY - sc * 0.25, rimLow: waterY - sc * 0.11, str: sc * 0.17 };
    if (basketY < 0) basketY = L.rimFull;
    sprites.clear();
    // The sky and the water only change with the size: draw them once (small, then stretched).
    const qw = Math.max(1, Math.round(W / 4)), qh = Math.max(1, Math.round(waterY / 4));
    skyPic.width = qw; skyPic.height = qh;
    let c = skyPic.getContext('2d');
    let g = c.createLinearGradient(0, 0, 0, qh);
    g.addColorStop(0, '#0d2b5a'); g.addColorStop(0.45, '#2c6fb0'); g.addColorStop(0.8, '#f2a48c'); g.addColorStop(1, '#ffd6a0');
    c.fillStyle = g; c.fillRect(0, 0, qw, qh);
    const sunX = (wide ? W * 0.37 : W * 0.78) / 4, r = Math.max(qw, qh) * 0.45;
    g = c.createRadialGradient(sunX, qh, 0, sunX, qh, r);
    g.addColorStop(0, 'rgba(255,214,140,0.85)'); g.addColorStop(0.4, 'rgba(255,170,120,0.25)'); g.addColorStop(1, 'rgba(255,170,120,0)');
    c.fillStyle = g; c.fillRect(0, 0, qw, qh);
    L.sunX = sunX * 4;
    const wh = Math.max(1, Math.round((H - waterY) / 4));
    waterPic.width = qw; waterPic.height = wh;
    c = waterPic.getContext('2d');
    g = c.createLinearGradient(0, 0, 0, wh);
    g.addColorStop(0, '#41b8c8'); g.addColorStop(0.35, '#13809f'); g.addColorStop(1, '#073a5c');
    c.fillStyle = g; c.fillRect(0, 0, qw, wh);
    g = c.createRadialGradient(sunX, 0, 0, sunX, 0, qw * 0.25);
    g.addColorStop(0, 'rgba(255,220,160,0.55)'); g.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = g; c.fillRect(0, 0, qw, wh);
  }
  Kit.onResize((W, H) => layout(W, H));

  function balloonPos(i) {
    const u = L.br * 1.55, cx = basketX(), cy = basketY - L.str;
    return { x: cx + SLOTS[i][0] * u + Math.sin(now * 1.3 + i * 1.7) * L.br * 0.12, y: cy + SLOTS[i][1] * u + Math.sin(now * 1.9 + i) * L.br * 0.1 };
  }
  const basketX = () => L.sx + Math.sin(now * 0.8) * L.sc * 0.012;

  // ---------- Sprites: shaded shapes drawn once per size (gradients are slow on TV boxes) ----------
  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const k = name + '|' + Math.round(w) + 'x' + Math.round(h);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = Math.ceil(w * dpr); s.height = Math.ceil(h * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, w, h);
    sprites.set(k, s);
    return s;
  }
  const balloonSprite = (color, r) => sprite('bal' + color, r * 2, r * 2.6, (c) => {
    const x = r, y = r * 1.05;
    c.fillStyle = shade(color, -0.3);
    c.beginPath(); c.moveTo(x, y + r * 1.0); c.lineTo(x - r * 0.14, y + r * 1.2); c.lineTo(x + r * 0.14, y + r * 1.2); c.closePath(); c.fill();
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.05, x, y, r * 1.05);
    g.addColorStop(0, shade(color, 0.6)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.4));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x, y, r * 0.88, r * 1.02, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath(); c.ellipse(x - r * 0.38, y - r * 0.45, r * 0.13, r * 0.26, 0.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.arc(x - r * 0.2, y - r * 0.72, r * 0.07, 0, Math.PI * 2); c.fill();
  });
  const basketSprite = (w) => sprite('basket', w, w * 0.66, (c) => {
    const h = w * 0.62;
    c.beginPath();
    c.moveTo(w * 0.02, h * 0.1); c.lineTo(w * 0.98, h * 0.1);
    c.lineTo(w * 0.88, h * 0.86); c.quadraticCurveTo(w * 0.86, h, w * 0.72, h);
    c.lineTo(w * 0.28, h); c.quadraticCurveTo(w * 0.14, h, w * 0.12, h * 0.86); c.closePath();
    let g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#8a5427'); g.addColorStop(0.35, '#d99a55'); g.addColorStop(1, '#7a4620');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    c.strokeStyle = 'rgba(70,35,10,0.45)'; c.lineWidth = w * 0.018;
    for (let i = 1; i < 5; i++) { c.beginPath(); c.moveTo(0, h * (0.1 + i * 0.18)); c.lineTo(w, h * (0.1 + i * 0.18)); c.stroke(); }
    c.strokeStyle = 'rgba(255,220,170,0.25)'; c.lineWidth = w * 0.012;
    for (let i = 0; i < 9; i++) { const x = w * (0.08 + i * 0.105); c.beginPath(); c.moveTo(x, h * 0.1); c.lineTo(x + (0.5 - i / 8) * w * 0.08, h); c.stroke(); }
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(0, h * 0.75, w, h);
    c.restore();
    roundRect(c, 0, 0, w, h * 0.2, h * 0.1);
    g = c.createLinearGradient(0, 0, 0, h * 0.2);
    g.addColorStop(0, '#e8b07a'); g.addColorStop(1, '#8f5426');
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(60,30,10,0.5)'; c.lineWidth = w * 0.012; c.stroke();
  });
  const headSprite = (r) => sprite('head', r * 2.6, r * 2.6, (c) => {
    const x = r * 1.3, y = r * 1.4;
    for (const s of [-1, 1]) {
      c.fillStyle = '#f0884a';
      c.beginPath(); c.moveTo(x + s * r * 0.95, y - r * 0.2); c.lineTo(x + s * r * 0.85, y - r * 1.3); c.lineTo(x + s * r * 0.2, y - r * 0.85); c.closePath(); c.fill();
      c.fillStyle = '#ffc7a6';
      c.beginPath(); c.moveTo(x + s * r * 0.78, y - r * 0.4); c.lineTo(x + s * r * 0.78, y - r * 1.05); c.lineTo(x + s * r * 0.38, y - r * 0.8); c.closePath(); c.fill();
    }
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.05);
    g.addColorStop(0, '#ffd9a6'); g.addColorStop(0.55, '#ffa463'); g.addColorStop(1, '#e06d34');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff1df';
    c.beginPath(); c.ellipse(x, y + r * 0.42, r * 0.48, r * 0.32, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,110,140,0.45)';
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(x + s * r * 0.58, y + r * 0.22, r * 0.16, r * 0.1, 0, 0, Math.PI * 2); c.fill(); }
    c.fillStyle = '#ff8fa3';
    c.beginPath(); c.ellipse(x, y + r * 0.24, r * 0.1, r * 0.07, 0, 0, Math.PI * 2); c.fill();
  });
  const cloudSprite = (w) => sprite('cloud', w, w * 0.5, (c) => {
    const g = c.createLinearGradient(0, 0, 0, w * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,214,200,0.75)');
    c.fillStyle = g;
    c.beginPath();
    c.arc(w * 0.3, w * 0.3, w * 0.16, 0, Math.PI * 2); c.arc(w * 0.5, w * 0.22, w * 0.2, 0, Math.PI * 2);
    c.arc(w * 0.72, w * 0.3, w * 0.15, 0, Math.PI * 2); c.fill();
    roundRect(c, w * 0.12, w * 0.28, w * 0.76, w * 0.18, w * 0.09); c.fill();
  });
  const sunSprite = (s) => sprite('sun', s, s, (c) => {
    const g = c.createRadialGradient(s / 2, s * 0.4, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.6, '#ffd27a'); g.addColorStop(1, '#ff9d5c');
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, s / 2, 0, Math.PI * 2); c.fill();
  });
  const TILE = { back: ['#4fd1c5', '#178a9a'], front: ['#fffdf5', '#ffe2b0'], lost: ['#ff9a8b', '#e0505a'] };
  const tileSprite = (kind, s) => sprite('tile' + kind, s, s * 1.12, (c) => {
    const [a, b] = TILE[kind], r = s * 0.2;
    roundRect(c, 0, s * 0.1, s, s, r); c.fillStyle = shade(b, -0.35); c.fill();
    roundRect(c, 0, 0, s, s, r);
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    roundRect(c, s * 0.1, s * 0.07, s * 0.8, s * 0.22, s * 0.11); c.fill();
    if (kind === 'back') {
      c.fillStyle = 'rgba(255,255,255,0.5)';
      roundRect(c, s * 0.3, s * 0.72, s * 0.4, s * 0.08, s * 0.04); c.fill();
    }
  });
  const KEY = { idle: ['#3a6ea8', '#1d3f6e'], good: ['#6ff0a8', '#1fae63'], bad: ['#3b4558', '#283142'], sound: ['#7c6cff', '#4b3bc4'] };
  const keySprite = (kind, s) => sprite('key' + kind, s, s * 1.1, (c) => {
    const [a, b] = KEY[kind], r = s * 0.24;
    roundRect(c, 0, s * 0.08, s, s, r); c.fillStyle = shade(b, -0.4); c.fill();
    roundRect(c, 0, 0, s, s, r);
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, a); g.addColorStop(1, b);
    c.fillStyle = g; c.fill();
    if (kind !== 'bad') { c.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(c, s * 0.1, s * 0.06, s * 0.8, s * 0.26, s * 0.12); c.fill(); }
  });
  // The cursor's glowing frame: the glow is baked in once, never blurred per frame.
  const ringSprite = (s) => sprite('ring', s * 1.5, s * 1.5, (c, w) => {
    const o = (w - s * 1.16) / 2;
    c.shadowColor = '#ffd166'; c.shadowBlur = s * 0.25;
    c.strokeStyle = '#ffe08a'; c.lineWidth = s * 0.09;
    roundRect(c, o, o, s * 1.16, s * 1.16, s * 0.3); c.stroke();
    c.shadowBlur = 0; c.strokeStyle = '#fff6d6'; c.lineWidth = s * 0.03; c.stroke();
  });

  // ---------- Keys, typing and taps ----------
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { if (k === 'ok') start(); return; }
    if (state === 'won') { if (k === 'ok' && now - stateAt > 0.8) next(); return; }
    if (state === 'over') { if (k === 'ok' && now - stateAt > 0.6) start(); return; }
    if (state !== 'play') return;
    if (k === 'ok') { guess(KEYS[cr][cc]); return; }
    if (k === 'left') cc = (cc + 8) % 9;
    else if (k === 'right') cc = (cc + 1) % 9;
    else if (k === 'up') cr = (cr + 2) % 3;
    else if (k === 'down') cr = (cr + 1) % 3;
    else return;
    sfx.move();
  });
  // Typed letters: caught before the shared key handler, which would read W/A/S/D as arrows and M as mute.
  window.addEventListener('keydown', (e) => {
    if (state === 'menu' || state === 'over' || e.ctrlKey || e.metaKey || e.altKey || !/^[a-zA-Z]$/.test(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.repeat || state !== 'play') return;
    const ch = e.key.toUpperCase();
    KEYS.forEach((row, r) => { const c = row.indexOf(ch); if (c >= 0) { cr = r; cc = c; } });
    guess(ch);
  }, true);

  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inside = (e, r) => r && e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h;
  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') { start(); return; }
      if (state === 'won') { if (now - stateAt > 0.8) next(); return; }
      if (state === 'over') { if (now - stateAt > 0.6) start(); return; }
      if (state !== 'play') return;
      L.keys.forEach((row, r) => row.forEach((rect, c) => { if (inside(e, rect)) { cr = r; cc = c; guess(KEYS[r][c]); } }));
    },
  });

  // ---------- Update ----------
  function update(dt) {
    now += dt;
    if (L.W !== Kit.W || L.H !== Kit.H) layout(Kit.W, Kit.H);
    shown += (streak - shown) * Math.min(1, dt * 8);
    if (Math.abs(streak - shown) < 0.02) shown = streak;
    bump = Math.max(0, bump - dt * 2.5);
    blinkT -= dt; if (blinkT < -0.14) blinkT = 2 + Math.random() * 3;

    // The basket hangs lower with every balloon gone; with none left it drops into the water and floats.
    if (state === 'sinking' || state === 'over') {
      const floatY = L.waterY - L.bw * 0.22;
      if (!splashed) {
        basketVy += L.sc * 2.4 * dt;
        basketY += basketVy * dt;
        if (basketY >= floatY) {
          splashed = true; basketY = floatY; basketVy = 0;
          const x = basketX();
          Kit.burst(x, L.waterY, '#c9f6ff', 30, 1.3);
          Kit.burst(x, L.waterY, '#4cc9f0', 22, 1);
          Kit.noise({ dur: 0.5, vol: 0.35, freq: 1400, q: 0.5, sweep: 0.2, type: 'lowpass' });
          Kit.tone(200, { type: 'sine', dur: 0.3, vol: 0.2, slide: 0.5 });
          Kit.shake(10, 0.4);
        }
      } else basketY += (floatY - basketY) * Math.min(1, dt * 5);
    } else {
      const target = state === 'won' && now > stateAt ? L.rimFull - L.sc * 0.04 : (state === 'menu' ? L.rimFull : lerp(L.rimFull, L.rimLow, wrong / (MAX - 1)));
      basketY += (target - basketY) * Math.min(1, dt * 3);
    }

    // Revealed letters sparkle as they finish flipping, each a note higher.
    let n = tiles.filter((t) => t.fx).length;
    tiles.forEach((t, i) => {
      if (t.revealAt >= 0 && !t.fx && now >= t.revealAt + 0.17) {
        t.fx = true;
        if (t.lost) return;
        const x = tileX(i), y = L.tileY;
        Kit.burst(x, y, '#ffd166', 10, 0.7);
        Kit.tone(NOTES[Math.min(NOTES.length - 1, n)], { type: 'triangle', dur: 0.16, vol: 0.16 });
        Kit.tone(NOTES[Math.min(NOTES.length - 1, n)] * 2, { type: 'sine', dur: 0.1, vol: 0.04 });
        n++;
      }
    });

    if (state === 'won' && !winFx && now >= stateAt) {
      winFx = true; bump = 1;
      Kit.confetti(140);
      sfx.win();
      Kit.float('Rescued!', L.sx, L.waterY - L.sc * 0.66, { color: '#ffd166', size: L.sc * 0.09, life: 1.6, big: true });
      if (newBest) Kit.float('New best streak!', L.sx, L.waterY - L.sc * 0.54, { color: '#9ff0c8', size: L.sc * 0.05, life: 1.8, big: true });
    }
    if (state === 'sinking' && !lostReveal && now - stateAt > 0.9) {
      lostReveal = true;
      let k = 0;
      tiles.forEach((t) => { if (t.revealAt < 0) { t.lost = true; t.revealAt = now + 0.07 * k++; } });
      sfx.over();
    }
    if (state === 'sinking' && now - stateAt > 1.9) { state = 'over'; stateAt = now; }

    const kr = L.keys[cr] && L.keys[cr][cc];
    if (kr) {
      if (curX < 0) { curX = kr.x; curY = kr.y; }
      curX += (kr.x - curX) * Math.min(1, dt * 18); curY += (kr.y - curY) * Math.min(1, dt * 18);
    }
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center', maxW) {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color;
    if (maxW) c.fillText(str, x, y, maxW); else c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, maxW) {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(8,20,48,0.92)';
    if (maxW) c.strokeText(str, x, y, maxW); else c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g;
    if (maxW) c.fillText(str, x, y, maxW); else c.fillText(str, x, y);
  }
  function glass(c, x, y, w, h, r, alpha = 0.6, border = 'rgba(160,220,255,0.35)') {
    roundRect(c, x, y, w, h, r);
    c.fillStyle = `rgba(8,24,52,${alpha})`; c.fill();
    c.lineWidth = 2; c.strokeStyle = border; c.stroke();
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#22609e'); g.addColorStop(1, '#0b2a52');
    c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = border; c.stroke();
  }
  function button(c, label, x, y, w, h, t) {
    const k = 1 + Math.sin(t * 5) * 0.04;
    c.save(); c.translate(x, y); c.scale(k, k);
    roundRect(c, -w / 2, -h / 2 + h * 0.1, w, h, h / 2); c.fillStyle = '#b86b00'; c.fill();
    roundRect(c, -w / 2, -h / 2, w, h, h / 2);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#ffe58a'); g.addColorStop(1, '#ffb21e');
    c.fillStyle = g; c.fill();
    text(c, label, 0, 0, h * 0.5, '#3a2200', 900, 'center', w * 0.9);
    c.restore();
  }
  const tileX = (i) => {
    const n = tiles.length, total = n * L.ts + (n - 1) * L.tg;
    return L.rx + (L.rw - total) / 2 + i * (L.ts + L.tg) + L.ts / 2;
  };

  function wave(c, y, amp, len, speed, color) {
    const W = Kit.W, step = W / 32;
    c.beginPath(); c.moveTo(0, Kit.H + 10);
    for (let x = 0; x <= W + step; x += step) c.lineTo(x, y + Math.sin(x / len + now * speed) * amp + Math.sin(x / (len * 0.43) - now * speed * 1.3) * amp * 0.4);
    c.lineTo(W + step, Kit.H + 10); c.closePath();
    c.fillStyle = color; c.fill();
  }

  function drawScene(c, t) {
    const W = Kit.W, H = Kit.H, sc = L.sc;
    c.imageSmoothingEnabled = true;
    c.drawImage(skyPic, 0, 0, W, L.waterY + 4);
    const ss = sc * 0.17;
    c.drawImage(sunSprite(ss), L.sunX - ss / 2, L.waterY - ss * 0.62, ss, ss);
    for (const cl of CLOUDS) {
      const w = sc * 0.28 * cl.s, span = W + w * 2;
      const x = ((cl.x * span + t * cl.v * W) % span) - w;
      c.globalAlpha = 0.85; c.drawImage(cloudSprite(sc * 0.28), x, cl.y * L.waterY, w, w * 0.5);
    }
    c.globalAlpha = 1;
    c.drawImage(waterPic, 0, L.waterY, W, H - L.waterY + 2);
    wave(c, L.waterY, sc * 0.006, sc * 0.09, 0.9, 'rgba(120,220,235,0.55)');
    // Sun glints dancing on the water.
    c.fillStyle = '#fff3cf';
    for (const g of GLINTS) {
      const a = Math.sin(t * 1.6 + g.p);
      if (a <= 0) continue;
      const y = L.waterY + sc * 0.03 + g.y * (H - L.waterY) * 0.5, spread = 0.12 + (y - L.waterY) / (H - L.waterY + 1) * 0.5;
      const x = L.sunX + (g.x - 0.5) * W * spread;
      c.globalAlpha = a * 0.7;
      c.fillRect(x, y, sc * 0.04 * g.w, Math.max(1.5, sc * 0.004));
    }
    c.globalAlpha = 1;

    // Balloons and their strings.
    const bx = basketX(), rim = basketY + Math.sin(t * 1.6) * sc * 0.005;
    const alive = balloons.filter((b) => b.popAt < 0);
    if (alive.length && !splashed) {
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = Math.max(1, sc * 0.0025);
      c.beginPath();
      balloons.forEach((b, i) => {
        if (b.popAt >= 0 || now < b.born) return;
        const p = balloonPos(i), ax = bx + SLOTS[i][0] * L.bw * 0.16;
        const s = ease.back(clamp((now - b.born) / 0.35, 0, 1));
        c.moveTo(p.x, p.y + L.br * 1.05 * s);
        c.quadraticCurveTo((p.x + ax) / 2 + L.br * 0.15, (p.y + rim) / 2, ax, rim + L.bw * 0.02);
      });
      c.stroke();
      balloons.forEach((b, i) => {
        if (b.popAt >= 0 || now < b.born) return;
        const p = balloonPos(i), r = L.br;
        const s = ease.back(clamp((now - b.born) / 0.35, 0, 1));
        // The last balloon trembles.
        const jit = alive.length === 1 && state === 'play' ? Math.sin(t * 40) * r * 0.04 : 0;
        c.drawImage(balloonSprite(b.color, r), p.x - r * s + jit, p.y - r * 1.05 * s, r * 2 * s, r * 2.6 * s);
      });
    }

    // Our friend, in the basket.
    const bw = L.bw, hr = bw * 0.3;
    c.save();
    c.translate(bx, rim);
    if (splashed) c.rotate(Math.sin(t * 2) * 0.06);
    drawPal(c, hr, t);
    c.drawImage(basketSprite(bw), -bw / 2, -bw * 0.03, bw, bw * 0.66);
    // Paws on the rim (and a waving arm when rescued).
    c.fillStyle = '#ffa463';
    const cheering = state === 'won' && now > stateAt;
    c.beginPath(); c.arc(-hr * 0.62, 0, hr * 0.2, 0, Math.PI * 2); c.fill();
    if (!cheering) { c.beginPath(); c.arc(hr * 0.62, 0, hr * 0.2, 0, Math.PI * 2); c.fill(); }
    else {
      const a = -1.2 + Math.sin(t * 12) * 0.45, sxp = hr * 0.75, syp = -hr * 0.15;
      const ex = sxp + Math.cos(a) * hr * 1.1, ey = syp + Math.sin(a) * hr * 1.1;
      c.strokeStyle = '#f58d4c'; c.lineWidth = hr * 0.32; c.lineCap = 'round';
      c.beginPath(); c.moveTo(sxp, syp); c.lineTo(ex, ey); c.stroke();
      c.beginPath(); c.arc(ex, ey, hr * 0.22, 0, Math.PI * 2); c.fill();
    }
    c.restore();
    // The front wave goes over a floating basket.
    wave(c, L.waterY + sc * 0.035, sc * 0.008, sc * 0.12, -1.1, 'rgba(19,128,159,0.82)');
    wave(c, L.waterY + sc * 0.075, sc * 0.006, sc * 0.07, 1.4, 'rgba(7,70,105,0.6)');
  }

  function drawPal(c, r, t) {
    const hy = -r * 0.72 + (state === 'won' && now > stateAt ? -Math.abs(Math.sin(t * 6)) * r * 0.15 : 0);
    const hs = r * 2.6;
    c.drawImage(headSprite(r), -hs / 2, hy - r * 1.4, hs, hs);
    const aliveN = MAX - wrong;
    const mood = state === 'won' && now > stateAt ? 'joy' : (state === 'sinking' || state === 'over') ? (splashed ? 'wet' : 'shock') : (state === 'play' && aliveN <= 2 ? 'worried' : 'happy');
    const ey = hy - r * 0.05, ex = r * 0.36, look = state === 'play' ? r * 0.04 : 0;
    c.strokeStyle = '#2b1a12'; c.fillStyle = '#2b1a12'; c.lineCap = 'round'; c.lineWidth = r * 0.09;
    for (const s of [-1, 1]) {
      const x = s * ex;
      if (mood === 'joy') { c.beginPath(); c.arc(x, ey + r * 0.06, r * 0.12, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); }
      else if (mood === 'wet') { c.beginPath(); c.moveTo(x - s * r * 0.1, ey - r * 0.1); c.lineTo(x + s * r * 0.08, ey); c.lineTo(x - s * r * 0.1, ey + r * 0.1); c.stroke(); }
      else if (blinkT < 0) { c.beginPath(); c.moveTo(x - r * 0.11, ey); c.lineTo(x + r * 0.11, ey); c.stroke(); }
      else {
        const big = mood === 'shock' ? 1.25 : 1;
        c.beginPath(); c.ellipse(x + look, ey, r * 0.11 * big, r * 0.14 * big, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(x + look + r * 0.04, ey - r * 0.05, r * 0.045, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#2b1a12';
      }
      if (mood === 'worried') { c.lineWidth = r * 0.07; c.beginPath(); c.moveTo(x + s * r * 0.14, ey - r * 0.2); c.lineTo(x - s * r * 0.1, ey - r * 0.3); c.stroke(); c.lineWidth = r * 0.09; }
    }
    const my = hy + r * 0.42;
    c.lineWidth = r * 0.07;
    if (mood === 'joy') {
      c.fillStyle = '#7a2e2e';
      c.beginPath(); c.arc(0, my - r * 0.04, r * 0.2, 0, Math.PI); c.closePath(); c.fill();
      c.fillStyle = '#ff7a8a';
      c.beginPath(); c.arc(0, my + r * 0.08, r * 0.09, Math.PI, 0); c.fill();
    } else if (mood === 'worried' || mood === 'shock') {
      c.fillStyle = '#7a2e2e';
      c.beginPath(); c.ellipse(0, my + r * 0.02, r * 0.07, r * (mood === 'shock' ? 0.12 : 0.08), 0, 0, Math.PI * 2); c.fill();
    } else if (mood === 'wet') {
      c.beginPath(); c.moveTo(-r * 0.18, my); c.quadraticCurveTo(-r * 0.09, my - r * 0.08, 0, my); c.quadraticCurveTo(r * 0.09, my + r * 0.08, r * 0.18, my); c.stroke();
    } else {
      c.beginPath(); c.arc(-r * 0.08, my - r * 0.02, r * 0.08, 0.1, Math.PI - 0.1); c.arc(r * 0.08, my - r * 0.02, r * 0.08, 0.1, Math.PI - 0.1); c.stroke();
    }
  }

  function drawWord(c, t) {
    const ts = L.ts;
    // Hint chips: the category, and how many balloons are left.
    const cs = Math.min(L.sc * 0.045, L.rw * 0.05);
    const hint = `${ICON[cur.topic] || ''}  ${cur.topic}`, left = MAX - wrong;
    c.font = `900 ${Math.round(cs * 0.72)}px system-ui, sans-serif`;
    const lw = c.measureText('HINT').width + cs * 0.6;
    c.font = `800 ${Math.round(cs)}px system-ui, sans-serif`;
    const w1 = lw + c.measureText(hint).width + cs * 1.6, w2 = c.measureText(`🎈 ${left} left`).width + cs * 1.6;
    const gap = cs * 0.6, x0 = L.rx + (L.rw - w1 - w2 - gap) / 2, ch = cs * 1.8;
    glass(c, x0, L.chipY - ch / 2, w1, ch, ch / 2, 0.9);
    text(c, 'HINT', x0 + cs * 0.8, L.chipY, cs * 0.72, '#ffd166', 900, 'left');
    text(c, hint, x0 + cs * 0.8 + lw, L.chipY, cs, '#ffffff', 800, 'left');
    const danger = left <= 2 && state === 'play';
    glass(c, x0 + w1 + gap, L.chipY - ch / 2, w2, ch, ch / 2, 0.9, danger ? `rgba(255,110,110,${0.6 + Math.sin(t * 8) * 0.35})` : 'rgba(160,220,255,0.35)');
    text(c, `🎈 ${left} left`, x0 + w1 + gap + w2 / 2, L.chipY, cs, danger ? '#ffb0b0' : '#ffffff', 800);

    tiles.forEach((tl, i) => {
      const b = clamp((now - tl.born) / 0.35, 0, 1);
      if (b <= 0) return;
      const s = ease.back(b);
      const p = tl.revealAt >= 0 ? clamp((now - tl.revealAt) / 0.34, 0, 1) : 0;
      const front = p >= 0.5;
      let y = L.tileY - Math.sin(p * Math.PI) * ts * 0.25;
      if (state === 'won' && now > stateAt) {
        const q = clamp((now - stateAt - i * 0.06) / 0.45, 0, 1);
        y -= Math.sin(q * Math.PI) * ts * 0.35;
      }
      c.save();
      c.translate(tileX(i), y);
      c.scale(s * Math.max(0.03, Math.abs(Math.cos(p * Math.PI))), s);
      c.drawImage(tileSprite(front ? (tl.lost ? 'lost' : 'front') : 'back', ts), -ts / 2, -ts / 2, ts, ts * 1.12);
      if (front) text(c, tl.ch, 0, ts * 0.02, ts * 0.62, tl.lost ? '#ffffff' : '#16325c', 900);
      c.restore();
    });
  }

  function drawKeyboard(c, t) {
    const kb = L.kb, ks = L.ks;
    glass(c, kb.x, kb.y, kb.w, kb.h, ks * 0.4, 0.62);
    L.keys.forEach((row, r) => row.forEach((rect, col) => {
      const ch = KEYS[r][col];
      const kind = ch === '#' ? 'sound' : guessed.has(ch) ? (cur.word.includes(ch) ? 'good' : 'bad') : 'idle';
      const on = r === cr && col === cc && state === 'play';
      let s = on ? 1.1 : 1, dx = 0;
      if (keyHit[ch] != null) s *= 1 - 0.18 * Math.sin(clamp((now - keyHit[ch]) / 0.22, 0, 1) * Math.PI);
      if (keyBad[ch] != null && now - keyBad[ch] < 0.4) dx = Math.sin((now - keyBad[ch]) * 55) * ks * 0.08 * (1 - (now - keyBad[ch]) / 0.4);
      c.save();
      c.translate(rect.x + ks / 2 + dx, rect.y + ks / 2); c.scale(s, s);
      c.drawImage(keySprite(kind, ks), -ks / 2, -ks / 2, ks, ks * 1.1);
      const label = ch === '#' ? (Kit.muted ? '🔇' : '🔊') : ch;
      const col2 = kind === 'good' ? '#073d22' : kind === 'bad' ? 'rgba(255,255,255,0.3)' : '#ffffff';
      text(c, label, 0, -ks * 0.02, ch === '#' ? ks * 0.42 : ks * 0.52, col2, 900);
      if (kind === 'bad') {
        c.strokeStyle = 'rgba(255,120,120,0.55)'; c.lineWidth = ks * 0.05; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-ks * 0.22, ks * 0.22); c.lineTo(ks * 0.22, -ks * 0.22); c.stroke();
      }
      c.restore();
    }));
    if (state === 'play' && curX >= 0) {
      const rs = ks * 1.5, k = 1.1 + Math.sin(t * 6) * 0.03;
      c.drawImage(ringSprite(ks), curX + ks / 2 - (rs * k) / 2, curY + ks / 2 - (rs * k) / 2, rs * k, rs * k);
    }
  }

  function drawTop(c, t) {
    const W = Kit.W, th = L.topH, sz = th * 0.42;
    if (L.wide || state === 'menu') outlined(c, 'WORD RESCUE', L.wide ? L.sx : W * 0.3, th * 0.52, sz, '#ffffff', '#7fe3ff');
    const mb = muteBox();
    // Streak and best, right of centre and clear of the sound icon.
    if (state !== 'menu') {
      const label = `🔥 ${Math.round(shown)}`, k = 1 + bump * 0.25;
      c.font = `900 ${Math.round(sz * 0.42)}px system-ui, sans-serif`;
      const lw = c.measureText('STREAK').width;
      c.font = `900 ${Math.round(sz)}px system-ui, sans-serif`;
      const w = c.measureText(label).width + lw + sz * 1.5, h = sz * 1.5, x = mb.x - sz * 7.2 - w;
      glass(c, x, th * 0.52 - h / 2, w, h, h / 2, 0.55);
      text(c, 'STREAK', x + sz * 0.5, th * 0.52, sz * 0.42, '#ffd166', 900, 'left');
      c.save(); c.translate(x + w - sz * 0.5, th * 0.52); c.scale(k, k);
      text(c, label, 0, 0, sz, '#ffffff', 900, 'right');
      c.restore();
    }
    const bl = `👑 Best ${best}`;
    c.font = `800 ${Math.round(sz * 0.8)}px system-ui, sans-serif`;
    const bwid = c.measureText(bl).width + sz * 1.2, h = sz * 1.5, bx = mb.x - sz * 0.6 - bwid;
    glass(c, bx, th * 0.52 - h / 2, bwid, h, h / 2, 0.55);
    text(c, bl, bx + bwid / 2, th * 0.52, sz * 0.8, '#ffe08a', 800);
    c.globalAlpha = 0.8; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    if (!L.keys.length) return;
    drawScene(c, t);
    drawTop(c, t);
    if (state === 'menu') { drawMenu(c, t); return; }
    drawWord(c, t);
    drawKeyboard(c, t);
    const kb = L.kb;
    if (state === 'play') {
      const hy = Math.min(H - L.ks * 0.45, kb.y + kb.h + (H - kb.y - kb.h) / 2);
      const tip = Kit.touchFirst() ? 'Tap a letter' : 'Arrows pick a letter  ·  OK guesses  ·  or type it';
      c.lineJoin = 'round';
      c.font = `700 ${Math.round(L.ks * 0.34)}px system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = L.ks * 0.08; c.strokeStyle = 'rgba(5,30,55,0.8)'; c.strokeText(tip, kb.x + kb.w / 2, hy, kb.w);
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.fillText(tip, kb.x + kb.w / 2, hy, kb.w);
    }
    if (state === 'won' && now - stateAt > 0.5) drawResult(c, t, true);
    if (state === 'over') drawResult(c, t, false);
  }

  function drawMenu(c, t) {
    const pw = L.wide ? L.rw * 0.94 : L.rw, x = L.rx + (L.rw - pw) / 2;
    const y = L.wide ? L.topH + L.H * 0.04 : L.waterY + L.sc * 0.06;
    const ph = L.wide ? L.H * 0.8 - y + L.H * 0.06 : Math.min(L.H - y - L.H * 0.04, pw * 1.0);
    const a = ease.back(clamp(now / 0.5, 0, 1));
    c.save();
    c.translate(x + pw / 2, y + ph / 2); c.scale(a, a); c.translate(-pw / 2, -ph / 2);
    panel(c, 0, 0, pw, ph, L.sc * 0.04, 'rgba(127,227,255,0.6)');
    const u = Math.min(ph, pw * 0.85);
    outlined(c, 'WORD RESCUE', pw / 2, ph * 0.14, u * 0.12, '#ffffff', '#7fe3ff', pw * 0.9);
    text(c, 'Pop no more balloons than you must!', pw / 2, ph * 0.26, u * 0.048, 'rgba(255,255,255,0.85)', 700, 'center', pw * 0.9);
    const tips = ['🔤  Guess the hidden word, letter by letter', '🎈  Every wrong letter pops a balloon', '🌊  Pop all seven and it’s a big splash', '🔥  Solve words in a row for a streak'];
    tips.forEach((s, i) => text(c, s, pw * 0.1, ph * (0.39 + i * 0.09), u * 0.046, '#ffffff', 700, 'left', pw * 0.82));
    text(c, `👑 Best streak ${best}`, pw / 2, ph * 0.76, u * 0.055, '#ffe08a', 900);
    button(c, Kit.touchFirst() ? 'Tap to start' : 'OK  Start', pw / 2, ph * 0.89, Math.min(pw * 0.5, u * 0.5), u * 0.1, t);
    c.restore();
  }

  function drawResult(c, t, won) {
    const kb = L.kb, pad = L.ks * 0.15;
    const x = kb.x - pad, y = kb.y - pad, w = kb.w + pad * 2, h = kb.h + pad * 2;
    const a = ease.back(clamp((now - stateAt - (won ? 0.5 : 0)) / 0.4, 0, 1));
    c.save();
    c.translate(x + w / 2, y + h / 2); c.scale(a, a); c.translate(-w / 2, -h / 2);
    panel(c, 0, 0, w, h, L.ks * 0.4, won ? '#ffd166' : '#ff8a8a');
    const u = Math.min(h, w * 0.5);
    if (won) {
      outlined(c, 'Rescued! 🎉', w / 2, h * 0.2, u * 0.2, '#fff6c2', '#ffb703', w * 0.9);
      text(c, `🔥 Streak ${streak}`, w / 2, h * 0.45, u * 0.15, '#ffffff', 900);
      text(c, newBest ? '🎉 New best streak!' : `👑 Best ${best}`, w / 2, h * 0.63, u * 0.09, newBest ? '#9ff0c8' : '#ffe08a', 800);
      if (now - stateAt > 0.8) button(c, Kit.touchFirst() ? 'Tap for the next word' : 'OK  Next word', w / 2, h * 0.83, w * 0.46, u * 0.15, t);
    } else {
      outlined(c, 'Splash! 💦', w / 2, h * 0.19, u * 0.2, '#ffffff', '#8fd8ff', w * 0.9);
      text(c, `The word was ${cur.word}`, w / 2, h * 0.41, u * 0.1, '#ffffff', 800, 'center', w * 0.9);
      text(c, `🔥 Streak ${streak}   ·   ${newBest ? '🎉 New best!' : `👑 Best ${best}`}`, w / 2, h * 0.6, u * 0.09, '#ffe08a', 800, 'center', w * 0.9);
      if (now - stateAt > 0.6) button(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  Play again', w / 2, h * 0.82, w * 0.46, u * 0.15, t);
    }
    c.restore();
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  inflate(0.2);
  Kit.canvas.focus();
  if (best > 0) Kit.record('wordrescue', best);
})();
