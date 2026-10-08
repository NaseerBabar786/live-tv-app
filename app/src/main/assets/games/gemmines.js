// Mine Field: open every crystal tile that hides no mine. A number tells how many mines touch that
// tile; the first tile you open is always safe. Three sizes: Easy, Medium and Hard. Remote: arrows
// move, OK opens, hold OK to plant or lift a flag; OK on a number whose flags are all placed opens
// the tiles around it. Touch and mouse: tap opens, press and hold flags. M or the speaker icon mutes.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp } = Kit;
  const LEVELS = [
    { id: 'easy', name: 'Easy', icon: '🌱', cols: 10, rows: 7, mines: 10 },
    { id: 'medium', name: 'Medium', icon: '💎', cols: 15, rows: 9, mines: 24 },
    { id: 'hard', name: 'Hard', icon: '🔥', cols: 20, rows: 11, mines: 44 },
  ];
  const NUM_COLORS = ['', '#4fc3ff', '#62e889', '#ff6b7a', '#c49bff', '#ffb84d', '#3ee8d6', '#ff8ad8', '#eef2ff'];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const TILE_A = '#3cc4e6', TILE_B = '#34b2d8', GOLD = '#ffd23f';
  const HOLD = 0.45; // seconds OK must be held to plant a flag

  // ---------- Records ----------
  let wins = Kit.store.get('gemmines.wins', 0);
  let bestTimes = Kit.store.get('gemmines.best', { easy: 0, medium: 0, hard: 0 });
  let levelIx = clamp(Kit.store.get('gemmines.level', 0), 0, LEVELS.length - 1);

  // ---------- The game ----------
  // state: 'menu', 'play', 'boom' (mines going off), 'won' (celebration), 'over' (result panel)
  let state = 'menu', level = LEVELS[levelIx];
  let COLS = 10, ROWS = 7, MINES = 10, N = 70;
  let mine, open, flag, adj, openAt, popped, flagAt, boomAt, boomDone;
  let placed = false, cursor = 0, curX = 0, curY = 0, stateT = 0, elapsed = 0, endT = 0, won = false;
  let hitCell = -1, newBestTime = false, opened = 0, press = null, lastTick = 0, tickN = 0, flagsUsed = 0;

  function reset(lv) {
    level = lv;
    const tall = Kit.H > Kit.W * 1.1;
    COLS = tall ? lv.rows : lv.cols; ROWS = tall ? lv.cols : lv.rows; MINES = lv.mines; N = COLS * ROWS;
    mine = new Uint8Array(N); open = new Uint8Array(N); flag = new Uint8Array(N); adj = new Uint8Array(N);
    openAt = new Float64Array(N); popped = new Uint8Array(N); flagAt = new Float64Array(N);
    boomAt = new Float64Array(N); boomDone = new Uint8Array(N);
    placed = false; elapsed = 0; won = false; hitCell = -1; newBestTime = false; opened = 0; press = null; flagsUsed = 0;
    cursor = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);
    curX = cursor % COLS; curY = Math.floor(cursor / COLS);
    layout(Kit.W, Kit.H);
  }

  function around(i) {
    const x = i % COLS, y = (i / COLS) | 0, out = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if ((dx || dy) && nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS) out.push(ny * COLS + nx);
    }
    return out;
  }

  // The first tile opened and its neighbours never hold a mine.
  function placeMines(start) {
    const keep = new Set([start, ...around(start)]);
    const spots = [];
    for (let i = 0; i < N; i++) if (!keep.has(i)) spots.push(i);
    for (let i = spots.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [spots[i], spots[j]] = [spots[j], spots[i]]; }
    spots.slice(0, MINES).forEach((i) => { mine[i] = 1; });
    for (let i = 0; i < N; i++) adj[i] = around(i).reduce((n, k) => n + mine[k], 0);
    placed = true;
  }

  // Opens a tile; a tile with no mines around it opens the whole empty area, rippling out from it.
  function reveal(start) {
    if (open[start] || flag[start]) return;
    if (!placed) placeMines(start);
    if (mine[start]) { explode(start); return; }
    const dist = new Map([[start, 0]]);
    const todo = [start];
    const list = [];
    while (todo.length) {
      const i = todo.shift();
      if (open[i] || mine[i] || flag[i]) continue;
      open[i] = 1; opened++; list.push(i);
      if (adj[i] === 0) {
        for (const k of around(i)) if (!open[k] && !dist.has(k)) { dist.set(k, dist.get(i) + 1); todo.push(k); }
      }
    }
    const maxD = Math.max(1, ...list.map((i) => dist.get(i)));
    const step = Math.min(0.035, 0.7 / maxD);
    for (const i of list) { openAt[i] = stateT + dist.get(i) * step; popped[i] = 0; }
    if (list.length > 1) Kit.noise({ dur: 0.25 + maxD * step, vol: 0.05, freq: 3000, q: 0.6, sweep: 0.5 });
    Kit.tone(420, { type: 'triangle', dur: 0.08, vol: 0.2, slide: 1.6 });
    tickN = 0;
    if (opened === N - MINES) win(maxD * step);
  }

  // OK on an open number whose flags are all down opens the rest of its neighbours.
  function chord(i) {
    const nb = around(i);
    const flags = nb.reduce((n, k) => n + flag[k], 0);
    const closed = nb.filter((k) => !open[k] && !flag[k]);
    if (!adj[i] || flags !== adj[i] || !closed.length) { sfx.nope(); bumpCursor(); return; }
    const boom = closed.find((k) => mine[k]);
    if (boom !== undefined) { explode(boom); return; }
    closed.forEach((k) => { if (state === 'play') reveal(k); });
  }

  function toggleFlag(i) {
    if (open[i] || state !== 'play') return;
    const [x, y] = center(i);
    if (flag[i]) {
      flag[i] = 0; flagsUsed--;
      Kit.tone(700, { type: 'triangle', dur: 0.08, vol: 0.14, slide: 0.6 });
      Kit.burst(x, y, '#ff5a6e', 5, 0.5);
    } else {
      flag[i] = 1; flagAt[i] = stateT; flagsUsed++;
      Kit.tone(980, { type: 'triangle', dur: 0.06, vol: 0.12 });
      Kit.tone(180, { type: 'sine', dur: 0.16, vol: 0.35, slide: 0.5, at: 0.18 });
      Kit.noise({ dur: 0.06, vol: 0.1, freq: 2500, q: 0.7, at: 0.18 });
    }
  }

  function dig(i) {
    if (state !== 'play') return;
    if (flag[i]) { toggleFlag(i); return; } // OK on a flag lifts it: handy on a remote
    if (open[i]) { chord(i); return; }
    reveal(i);
  }

  function explode(i) {
    hitCell = i; state = 'boom'; endT = stateT; press = null;
    open[i] = 1; openAt[i] = stateT; popped[i] = 1;
    // The mine you hit goes off at once; the others follow one by one, nearest first.
    const [hx, hy] = [i % COLS, (i / COLS) | 0];
    const rest = [];
    for (let k = 0; k < N; k++) if (mine[k] && k !== i && !flag[k]) rest.push(k);
    rest.sort((a, b) => Math.hypot(a % COLS - hx, ((a / COLS) | 0) - hy) - Math.hypot(b % COLS - hx, ((b / COLS) | 0) - hy));
    const gap = Math.min(0.13, 2.2 / Math.max(1, rest.length));
    boomAt[i] = stateT; boomDone.fill(0);
    rest.forEach((k, n) => { boomAt[k] = stateT + 0.55 + n * gap; });
    endT = stateT + 0.55 + rest.length * gap + 0.9;
    blast(i, true);
    Kit.record('gemmines', wins);
  }
  function blast(i, big) {
    boomDone[i] = 1; open[i] = 1; openAt[i] = Math.min(openAt[i] || stateT, stateT); popped[i] = 1;
    const [x, y] = center(i);
    const cs = L.cs;
    Kit.burst(x, y, '#ffb347', big ? 30 : 9, big ? 1.4 : 0.7);
    Kit.burst(x, y, '#ff4d4d', big ? 18 : 5, big ? 1.1 : 0.6);
    Kit.burst(x, y, '#3a3f55', big ? 12 : 4, 0.8);
    flashes.push({ x, y, t: stateT, r: cs * (big ? 2.6 : 1.4) });
    if (big) {
      Kit.shake(18, 0.5);
      Kit.noise({ dur: 0.6, vol: 0.4, freq: 220, q: 0.7, type: 'lowpass', sweep: 0.4 });
      Kit.tone(120, { type: 'sawtooth', dur: 0.5, vol: 0.14, slide: 0.4 });
    } else {
      Kit.shake(5, 0.15);
      Kit.noise({ dur: 0.22, vol: 0.16, freq: 300 + Math.random() * 200, q: 0.8, type: 'lowpass', sweep: 0.5 });
    }
  }
  const flashes = [];

  function win(delay) {
    state = 'won'; won = true; press = null;
    endT = stateT + delay + 2.2;
    const t = Math.round(elapsed);
    wins++;
    Kit.store.set('gemmines.wins', wins);
    Kit.record('gemmines', wins);
    if (!bestTimes[level.id] || t < bestTimes[level.id]) {
      newBestTime = bestTimes[level.id] > 0;
      bestTimes[level.id] = Math.max(1, t);
      Kit.store.set('gemmines.best', bestTimes);
    }
    for (let i = 0; i < N; i++) if (mine[i] && !flag[i]) { flag[i] = 1; flagsUsed++; flagAt[i] = stateT + delay + 0.2 + Math.random() * 0.5; }
    setTimeout(() => {
      if (state !== 'won') return;
      sfx.win(); Kit.confetti(150);
      Kit.float('Cleared!', Kit.W / 2, L.by + L.bh * 0.42, { color: GOLD, size: L.cs * 1.6, life: 1.6, big: true });
    }, delay * 1000 + 250);
  }

  function start() {
    Kit.store.set('gemmines.level', levelIx);
    reset(LEVELS[levelIx]);
    state = 'play';
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
  }
  function toMenu() { state = 'menu'; reset(LEVELS[levelIx]); }

  // ---------- Layout ----------
  let L = { cs: 40, bx: 0, by: 0, bw: 0, bh: 0, top: 60, bottom: 40 };
  const boardPic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H || !mine) return;
    const top = H * 0.11, bottom = H * 0.075;
    const cs = Math.floor(Math.min((W * 0.95) / (COLS + 0.6), (H - top - bottom) / (ROWS + 0.6)));
    const bw = cs * COLS, bh = cs * ROWS;
    const bx = Math.round((W - bw) / 2), by = Math.round(top + (H - top - bottom - bh) / 2);
    L = { cs, bx, by, bw, bh, top, bottom };
    sprites.clear();
    const dpr = Math.min(window.devicePixelRatio || 1, 2), pad = cs * 0.3;
    boardPic.width = Math.ceil((bw + pad * 2) * dpr); boardPic.height = Math.ceil((bh + pad * 2) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    roundRect(c, 2, 2, bw + pad * 2 - 4, bh + pad * 2 - 4, cs * 0.45);
    const g = c.createLinearGradient(0, 0, 0, bh + pad * 2);
    g.addColorStop(0, 'rgba(14,44,66,0.95)'); g.addColorStop(1, 'rgba(5,18,30,0.95)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(120,220,255,0.35)'; c.stroke();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      c.fillStyle = (x + y) % 2 ? '#0e2536' : '#10293c';
      c.fillRect(pad + x * cs, pad + y * cs, cs, cs);
    }
  }
  Kit.onResize((W, H) => {
    if (!mine) return;
    // Turning the screen only reshapes the board before the first tile is opened.
    const tall = H > W * 1.1;
    if (!placed && (tall ? level.rows : level.cols) !== COLS) reset(level); else layout(W, H);
  });
  const center = (i) => [L.bx + ((i % COLS) + 0.5) * L.cs, L.by + (((i / COLS) | 0) + 0.5) * L.cs];

  // ---------- Sprites: drawn once per size (gradients are slow on TV boxes) ----------
  const sprites = new Map();
  function sprite(name, size, draw) {
    const k = name + Math.round(size);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(size * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, size);
    sprites.set(k, s);
    return s;
  }
  const tileSprite = (color, size) => sprite('t' + color, size, (c, s) => {
    const r = s * 0.2, m = s * 0.05;
    roundRect(c, m, m + s * 0.06, s - m * 2, s - m * 2 - s * 0.04, r);
    c.fillStyle = shade(color, -0.55); c.fill();
    roundRect(c, m, m, s - m * 2, s - m * 2 - s * 0.07, r);
    const g = c.createLinearGradient(0, m, 0, s - m);
    g.addColorStop(0, shade(color, 0.45)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.2));
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // Crystal facets: a lighter table in the middle and a soft diagonal glint.
    const f = s * 0.22;
    roundRect(c, f, f * 0.85, s - f * 2, s - f * 2 - s * 0.05, s * 0.1);
    const g2 = c.createLinearGradient(f, f, s - f, s - f);
    g2.addColorStop(0, shade(color, 0.55)); g2.addColorStop(1, shade(color, 0.05));
    c.fillStyle = g2; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = s * 0.025; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = s * 0.02;
    c.beginPath();
    c.moveTo(m, m); c.lineTo(f, f * 0.85); c.moveTo(s - m, m); c.lineTo(s - f, f * 0.85);
    c.moveTo(m, s - m * 2 - s * 0.07); c.lineTo(f, s - f - s * 0.05); c.moveTo(s - m, s - m * 2 - s * 0.07); c.lineTo(s - f, s - f - s * 0.05);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath(); c.moveTo(s * 0.1, s * 0.62); c.lineTo(s * 0.62, s * 0.1); c.lineTo(s * 0.78, s * 0.1); c.lineTo(s * 0.1, s * 0.78); c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(s * 0.27, s * 0.22, s * 0.04, 0, Math.PI * 2); c.fill();
  });
  const holeSprite = (alt, size) => sprite('h' + alt, size, (c, s) => {
    const m = s * 0.04;
    roundRect(c, m, m, s - m * 2, s - m * 2, s * 0.16);
    c.fillStyle = alt ? '#132f45' : '#16354d'; c.fill();
    c.save(); c.clip();
    const g = c.createLinearGradient(0, m, 0, s * 0.4);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s * 0.4);
    c.restore();
    c.strokeStyle = 'rgba(140,220,255,0.08)'; c.lineWidth = 1; c.stroke();
  });
  const numSprite = (n, size) => sprite('n' + n, size, (c, s) => {
    c.font = `900 ${Math.round(s * 0.62)}px "Arial Rounded MT Bold", system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = s * 0.1; c.strokeStyle = 'rgba(2,10,20,0.8)';
    c.strokeText(String(n), s / 2, s * 0.54);
    const g = c.createLinearGradient(0, s * 0.2, 0, s * 0.85);
    g.addColorStop(0, shade(NUM_COLORS[n], 0.45)); g.addColorStop(0.5, NUM_COLORS[n]); g.addColorStop(1, shade(NUM_COLORS[n], -0.2));
    c.fillStyle = g; c.fillText(String(n), s / 2, s * 0.54);
  });
  const mineSprite = (size) => sprite('mine', size, (c, s) => {
    c.translate(s / 2, s / 2);
    c.strokeStyle = '#1a1d2e'; c.lineWidth = s * 0.08; c.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      c.beginPath(); c.moveTo(Math.cos(a) * s * 0.18, Math.sin(a) * s * 0.18); c.lineTo(Math.cos(a) * s * 0.4, Math.sin(a) * s * 0.4); c.stroke();
    }
    const g = c.createRadialGradient(-s * 0.08, -s * 0.1, s * 0.02, 0, 0, s * 0.28);
    g.addColorStop(0, '#8a90b0'); g.addColorStop(0.5, '#3a3f5c'); g.addColorStop(1, '#121426');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, s * 0.27, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff4d5e'; c.beginPath(); c.arc(0, 0, s * 0.07, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.arc(-s * 0.1, -s * 0.11, s * 0.05, 0, Math.PI * 2); c.fill();
  });
  const flagSprite = (size) => sprite('flag', size, (c, s) => {
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(s * 0.46, s * 0.8, s * 0.2, s * 0.06, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#eef3ff'; c.lineWidth = s * 0.06; c.lineCap = 'round';
    c.beginPath(); c.moveTo(s * 0.38, s * 0.18); c.lineTo(s * 0.38, s * 0.8); c.stroke();
    c.beginPath();
    c.moveTo(s * 0.41, s * 0.16); c.quadraticCurveTo(s * 0.6, s * 0.22, s * 0.78, s * 0.33); c.lineTo(s * 0.41, s * 0.53); c.closePath();
    const g = c.createLinearGradient(0, s * 0.16, 0, s * 0.53);
    g.addColorStop(0, '#ff8a98'); g.addColorStop(0.5, '#ff3d58'); g.addColorStop(1, '#b8102e');
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.lineWidth = s * 0.03; c.strokeStyle = '#7a0a1e'; c.stroke();
    c.fillStyle = GOLD; c.beginPath(); c.arc(s * 0.38, s * 0.16, s * 0.05, 0, Math.PI * 2); c.fill();
  });
  const glowSprite = (color, size) => sprite('g' + color, size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });

  // ---------- Keys: a short OK opens, a held OK flags ----------
  function moveCursor(k) {
    let x = cursor % COLS, y = (cursor / COLS) | 0;
    if (k === 'left') x--; else if (k === 'right') x++; else if (k === 'up') y--; else if (k === 'down') y++;
    x = clamp(x, 0, COLS - 1); y = clamp(y, 0, ROWS - 1);
    const n = y * COLS + x;
    if (n !== cursor) { cursor = n; sfx.move(); } else bumpCursor();
  }
  let cursorBump = 0;
  const bumpCursor = () => { cursorBump = 1; };
  function shortPress() { dig(cursor); }

  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      if (repeat) return;
      const prev = levelIx;
      if (k === 'left' || k === 'up') levelIx = (levelIx + LEVELS.length - 1) % LEVELS.length;
      else if (k === 'right' || k === 'down') levelIx = (levelIx + 1) % LEVELS.length;
      else if (k === 'ok') { start(); return; }
      if (levelIx !== prev) { sfx.move(); reset(LEVELS[levelIx]); }
      return;
    }
    if (state === 'over') {
      if (repeat || stateT - endT < 0.9) return;
      if (k === 'ok') start();
      else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { sfx.move(); toMenu(); }
      return;
    }
    if (state !== 'play') return;
    if (k === 'restart') { start(); return; }
    if (k === 'ok') {
      if (repeat) return;
      // A second OK keydown without a keyup in between: the keyup got lost, so count the first as a tap.
      if (press && !press.done) shortPress();
      press = { t: stateT, cell: cursor, done: false };
      return;
    }
    if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { press = null; moveCursor(k); }
  });
  const OK_KEYS = { Enter: 1, ' ': 1, NumpadEnter: 1, Select: 1 };
  window.addEventListener('keyup', (e) => {
    if (!(OK_KEYS[e.key] || e.keyCode === 13 || e.keyCode === 23 || e.keyCode === 32)) return;
    e.preventDefault();
    if (press && !press.done && !press.pointer && state === 'play') { press = null; shortPress(); }
    press = press && press.pointer ? press : null;
  });

  // ---------- Touch and mouse ----------
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inBox = (e, b) => b && e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  function cellAt(x, y) {
    const cx = Math.floor((x - L.bx) / L.cs), cy = Math.floor((y - L.by) / L.cs);
    return cx >= 0 && cy >= 0 && cx < COLS && cy < ROWS ? cy * COLS + cx : -1;
  }
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = (L.cards || []).findIndex((r) => inBox(e, r));
        if (i >= 0) { if (i === levelIx) start(); else { levelIx = i; sfx.move(); reset(LEVELS[i]); } }
        return;
      }
      if (state === 'over') {
        if (stateT - endT < 0.9) return;
        if (inBox(e, L.menuBtn)) toMenu(); else start();
        return;
      }
      if (state !== 'play') return;
      const i = cellAt(e.x, e.y);
      if (i < 0) return;
      cursor = i;
      press = { t: stateT, cell: i, done: false, pointer: true, x: e.x, y: e.y };
    },
    move(e) {
      if (press && press.pointer && Math.hypot(e.x - press.x, e.y - press.y) > L.cs * 0.6) press = null;
    },
    up(e, cancel) {
      if (press && press.pointer && !press.done && !cancel && state === 'play') { press = null; shortPress(); }
      if (press && press.pointer) press = null;
    },
  });
  Kit.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  document.addEventListener('visibilitychange', () => { if (document.hidden) press = null; });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!mine) reset(level);
    if (state === 'play' && placed && !document.hidden) elapsed += dt;
    if (press && !press.done && state === 'play' && stateT - press.t >= HOLD) {
      press.done = true;
      if (press.cell === cursor) {
        if (open[cursor]) { sfx.nope(); bumpCursor(); } else toggleFlag(cursor);
      }
    }
    cursorBump = Math.max(0, cursorBump - dt * 4);
    const tx = cursor % COLS, ty = (cursor / COLS) | 0;
    const k = Math.min(1, dt * 20);
    curX += (tx - curX) * k; curY += (ty - curY) * k;
    // Tiles pop as the ripple reaches them, with a few crystal chips and a rising tick.
    if (state !== 'menu') {
      let pops = 0;
      for (let i = 0; i < N; i++) {
        if (open[i] && !popped[i] && stateT >= openAt[i]) {
          popped[i] = 1; pops++;
          if (!mine[i]) {
            const [x, y] = center(i);
            Kit.burst(x, y, (i % COLS + ((i / COLS) | 0)) % 2 ? TILE_B : '#9be8ff', 2, 0.45);
          }
        }
      }
      if (pops && stateT - lastTick > 0.045) {
        lastTick = stateT;
        Kit.tone(NOTES[Math.min(NOTES.length - 1, tickN++)] * 0.75, { type: 'sine', dur: 0.07, vol: 0.06 });
      }
    }
    if (state === 'boom') {
      for (let i = 0; i < N; i++) if (mine[i] && !boomDone[i] && !flag[i] && boomAt[i] && stateT >= boomAt[i]) blast(i, false);
      if (stateT >= endT) { state = 'over'; endT = stateT; sfx.over(); }
    }
    if (state === 'won' && stateT >= endT) { state = 'over'; endT = stateT; }
    for (let i = flashes.length - 1; i >= 0; i--) if (stateT - flashes[i].t > 0.4) flashes.splice(i, 1);
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom) {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(2,12,24,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#1d5f86'); g.addColorStop(1, '#0a2a42');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }
  const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  // Drop with two small bounces, for flags landing on a tile.
  function bounce(t) {
    if (t >= 1) return 1;
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) { t -= 1.5 / d; return n * t * t + 0.75; }
    if (t < 2.5 / d) { t -= 2.25 / d; return n * t * t + 0.9375; }
    t -= 2.625 / d; return n * t * t + 0.984375;
  }

  function drawBoard(c, t) {
    const cs = L.cs, pad = cs * 0.3;
    c.drawImage(boardPic, L.bx - pad, L.by - pad, L.bw + pad * 2, L.bh + pad * 2);
    const showMines = state === 'boom' || (state === 'over' && !won);
    for (let i = 0; i < N; i++) {
      const gx = i % COLS, gy = (i / COLS) | 0;
      const x = L.bx + gx * cs, y = L.by + gy * cs, alt = (gx + gy) % 2;
      const isOpen = open[i] && stateT >= openAt[i];
      if (isOpen) {
        if (i === hitCell) {
          roundRect(c, x + cs * 0.04, y + cs * 0.04, cs * 0.92, cs * 0.92, cs * 0.16);
          c.fillStyle = '#c4243c'; c.fill();
        } else c.drawImage(holeSprite(alt, cs), x, y, cs, cs);
        const age = stateT - openAt[i];
        if (mine[i]) {
          if (boomDone[i]) c.drawImage(mineSprite(cs), x, y, cs, cs);
        } else if (adj[i]) {
          const s = cs * ease.back(clamp(age / 0.28, 0, 1));
          if (s > 1) c.drawImage(numSprite(adj[i], cs), x + (cs - s) / 2, y + (cs - s) / 2, s, s);
        }
        // The tile itself flies off: shrinks and fades over the opened hole.
        if (age < 0.2 && !mine[i]) {
          const k = age / 0.2, s = cs * (1 - k * 0.6);
          c.globalAlpha = 1 - k;
          c.drawImage(tileSprite(alt ? TILE_B : TILE_A, cs), x + (cs - s) / 2, y + (cs - s) / 2 - k * cs * 0.3, s, s);
          c.globalAlpha = 1;
        }
        continue;
      }
      // Closed tile; in the menu a soft shimmer runs across the board.
      let lift = 0;
      if (state === 'menu') lift = Math.max(0, Math.sin(t * 2.2 - gx * 0.45 - gy * 0.3)) ** 8 * cs * 0.06;
      c.drawImage(tileSprite(alt ? TILE_B : TILE_A, cs), x, y - lift, cs, cs);
      if (showMines && mine[i] && !flag[i] && boomDone[i]) c.drawImage(mineSprite(cs), x, y, cs, cs);
      if (flag[i]) {
        const ft = stateT - flagAt[i];
        if (ft >= 0) {
          const k = bounce(clamp(ft / 0.45, 0, 1));
          const sq = ft < 0.6 ? 1 + Math.sin(clamp(ft / 0.45, 0, 1) * Math.PI * 3) * 0.06 * (1 - ft / 0.6) : 1;
          const fy = y - (1 - k) * cs * 1.4;
          c.drawImage(flagSprite(cs), x + (cs - cs * sq) / 2, fy + cs * (1 - 1 / sq) * 0.5, cs * sq, cs / sq);
          if (showMines && !mine[i]) {
            c.strokeStyle = '#ff3d58'; c.lineWidth = cs * 0.09; c.lineCap = 'round';
            c.beginPath(); c.moveTo(x + cs * 0.22, y + cs * 0.22); c.lineTo(x + cs * 0.78, y + cs * 0.78);
            c.moveTo(x + cs * 0.78, y + cs * 0.22); c.lineTo(x + cs * 0.22, y + cs * 0.78); c.stroke();
          }
        }
      }
    }
    // Explosion flashes
    for (const f of flashes) {
      const k = (stateT - f.t) / 0.4, s = f.r * (0.6 + k * 0.8);
      c.globalAlpha = Math.max(0, 1 - k);
      c.drawImage(glowSprite('rgba(255,200,90,1)', 128), f.x - s, f.y - s, s * 2, s * 2);
      c.globalAlpha = 1;
    }
    // Cursor: a glowing gold frame that glides between tiles, with a ring that fills while OK is held.
    if (state === 'play') {
      const x = L.bx + curX * cs, y = L.by + curY * cs;
      const g = cs * (0.02 + Math.sin(t * 6) * 0.02 + cursorBump * 0.08);
      c.globalAlpha = 0.35;
      c.lineWidth = cs * 0.2; c.strokeStyle = GOLD;
      roundRect(c, x - g, y - g, cs + g * 2, cs + g * 2, cs * 0.24); c.stroke();
      c.globalAlpha = 1;
      c.lineWidth = cs * 0.07; c.strokeStyle = '#fff3b0';
      roundRect(c, x - g, y - g, cs + g * 2, cs + g * 2, cs * 0.24); c.stroke();
      if (press && !press.done && press.cell === cursor && !open[cursor]) {
        const k = clamp((stateT - press.t - 0.08) / (HOLD - 0.08), 0, 1);
        if (k > 0) {
          const [cx, cy] = center(cursor);
          c.fillStyle = 'rgba(4,16,28,0.55)';
          c.beginPath(); c.arc(cx, cy, cs * 0.36, 0, Math.PI * 2); c.fill();
          c.strokeStyle = '#ff5a6e'; c.lineWidth = cs * 0.09; c.lineCap = 'round';
          c.beginPath(); c.arc(cx, cy, cs * 0.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
          c.drawImage(flagSprite(cs * 0.6), cx - cs * 0.3, cy - cs * 0.32, cs * 0.6, cs * 0.6);
        }
      }
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#0c3048', '#030c16', 'rgba(70,200,255,0.08)');
    if (!mine) return;
    const cs = L.cs;
    drawBoard(c, t);

    const ty = L.top / 2, hs = Math.min(L.top * 0.42, H * 0.05);
    if (state !== 'menu') {
      const left = MINES - flagsUsed;
      text(c, `💣 ${left}`, L.bx, ty, hs, '#ffffff', 900, 'left');
      text(c, `⏱ ${clock(elapsed)}`, L.bx + hs * 3.6, ty, hs, '#9be8ff', 900, 'left');
      text(c, `${level.icon} ${level.name}`, W / 2, ty, hs * 0.85, 'rgba(255,255,255,0.75)', 700);
      text(c, `🏆 ${wins}`, Math.min(L.bx + L.bw, W - 70), ty, hs * 0.9, GOLD, 900, 'right');
      const hint = Kit.touchFirst() ? 'Tap opens  ·  press and hold plants a 🚩 flag' : 'OK opens  ·  hold OK for a 🚩 flag  ·  OK on a number opens around it';
      text(c, hint, W / 2, H - L.bottom / 2, Math.min(L.bottom * 0.42, cs * 0.5), 'rgba(255,255,255,0.8)', 700);
    }
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c);
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H;
    c.fillStyle = 'rgba(2,10,20,0.6)'; c.fillRect(0, 0, W, H);
    const wide = W > H, u = Math.min(W, H * 1.6) / 30;
    const cw = wide ? Math.min(W * 0.25, u * 8) : Math.min(W * 0.84, u * 16), ch = wide ? cw * 0.82 : Math.min(H * 0.16, cw * 0.34);
    const gap = u * 0.9;
    const total = wide ? cw * 3 + gap * 2 : ch * 3 + gap * 2;
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.54 - ch / 2 : H * 0.55 - total / 2;
    L.cards = LEVELS.map((m, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    // Title with a mine and a flag either side.
    const tsz = u * 2.1, tyy = y0 - u * (wide ? 4.4 : 3.6);
    outlined(c, 'MINE FIELD', W / 2, tyy, tsz, '#e6fbff', '#3cc4e6');
    c.font = `900 ${Math.round(tsz)}px system-ui, sans-serif`;
    const tw = c.measureText('MINE FIELD').width;
    const bob = Math.sin(t * 3) * u * 0.15;
    c.drawImage(mineSprite(tsz * 1.3), W / 2 - tw / 2 - tsz * 1.45, tyy - tsz * 0.65 + bob, tsz * 1.3, tsz * 1.3);
    c.drawImage(flagSprite(tsz * 1.3), W / 2 + tw / 2 + tsz * 0.15, tyy - tsz * 0.7 - bob, tsz * 1.3, tsz * 1.3);
    text(c, Kit.touchFirst() ? 'Tap a size to play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, y0 - u * 1.4, u * 0.85, 'rgba(255,255,255,0.85)', 700);
    LEVELS.forEach((m, i) => {
      const r = L.cards[i], on = i === levelIx;
      const k = on ? 1.06 + Math.sin(t * 5) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, u * 0.7, on ? GOLD : 'rgba(150,220,255,0.3)');
      if (on) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,210,63,0.55)'; c.stroke(); }
      const best = bestTimes[m.id] ? `⏱ best ${clock(bestTimes[m.id])}` : 'not cleared yet';
      if (wide) {
        text(c, m.icon, 0, -r.h * 0.26, r.h * 0.22, '#fff', 400);
        text(c, m.name, 0, -r.h * 0.02, r.h * 0.15, '#ffffff', 900);
        text(c, `${m.cols} × ${m.rows}  ·  ${m.mines} mines`, 0, r.h * 0.16, r.h * 0.085, 'rgba(255,255,255,0.78)', 700);
        text(c, best, 0, r.h * 0.32, r.h * 0.085, bestTimes[m.id] ? GOLD : 'rgba(255,255,255,0.5)', 800);
      } else {
        text(c, m.icon, -r.w * 0.38, 0, r.h * 0.38, '#fff', 400);
        text(c, m.name, -r.w * 0.24, -r.h * 0.16, r.h * 0.24, '#ffffff', 900, 'left');
        text(c, `${m.cols} × ${m.rows}  ·  ${m.mines} mines`, -r.w * 0.24, r.h * 0.18, r.h * 0.14, 'rgba(255,255,255,0.78)', 700, 'left');
        text(c, best, r.w * 0.45, r.h * 0.3, r.h * 0.12, bestTimes[m.id] ? GOLD : 'rgba(255,255,255,0.5)', 800, 'right');
      }
      c.restore();
    });
    const tipY = wide ? y0 + ch + u * 1.9 : y0 + total + u * 1.4;
    const tips = Kit.touchFirst()
      ? ['Tap opens a tile', 'Press and hold plants a 🚩', `🏆 Wins: ${wins}`]
      : ['OK opens a tile', 'Hold OK plants a 🚩', `🏆 Wins: ${wins}`];
    if (wide) text(c, tips.join('   ·   '), W / 2, tipY, u * 0.8, 'rgba(255,255,255,0.78)', 700);
    else tips.forEach((tx, i) => text(c, tx, W / 2, tipY + i * u * 1.1, u * 0.8, 'rgba(255,255,255,0.78)', 700));
    text(c, 'Your first tile is always safe', W / 2, tipY + (wide ? u * 1.2 : u * 3.4), u * 0.7, 'rgba(155,232,255,0.7)', 600);
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, u = Math.min(W, H * 1.6) / 30;
    const a = clamp((stateT - endT) / 0.4, 0, 1);
    c.fillStyle = `rgba(2,10,20,${0.6 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.88, u * 15), ph = u * 10.5;
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.9, won ? GOLD : '#ff5a6e');
    if (won) {
      outlined(c, 'Field cleared!', 0, -ph * 0.36, u * 1.5, '#ffffff', '#9be8ff');
      outlined(c, clock(elapsed), 0, -ph * 0.13, u * 2.1, '#fff6c2', '#ffb703');
      text(c, newBestTime ? '🎉 New best time!' : `⏱ Best ${clock(bestTimes[level.id])}`, 0, ph * 0.06, u * 0.8, '#ffffff', 800);
    } else {
      outlined(c, 'Boom!', 0, -ph * 0.36, u * 1.7, '#ffffff', '#ff8a98');
      const safe = N - MINES, pct = Math.floor((opened / safe) * 100);
      outlined(c, `${pct}%`, 0, -ph * 0.13, u * 2.1, '#e6fbff', '#3cc4e6');
      text(c, `of the field cleared  ·  ⏱ ${clock(elapsed)}`, 0, ph * 0.06, u * 0.75, '#ffffff', 700);
    }
    text(c, `${level.icon} ${level.name}   ·   🏆 Wins: ${wins}`, 0, ph * 0.17, u * 0.65, 'rgba(255,255,255,0.75)', 700);
    const ready = stateT - endT > 0.9;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.29, u * 0.85, '#9be8ff', 900);
    const bw = u * 8.4, bh = u * 1.2;
    roundRect(c, -bw / 2, ph * 0.36, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Choose another size' : 'Arrows  choose another size', 0, ph * 0.36 + bh / 2, u * 0.6, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.36 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  reset(level);
  Kit.canvas.focus();
  if (wins > 0) Kit.record('gemmines', wins);
})();
