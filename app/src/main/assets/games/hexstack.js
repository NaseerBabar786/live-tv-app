// Hex Stack: set stacks of little hexagon discs on a honeycomb board. Next to a stack with the same top
// colour, the matching discs hop over one by one; 10 or more of one colour on top burst for points, and
// the hops and bursts keep chaining. Reach the level's score goal to unlock another colour. A full board
// ends the game.
// Remote: Left/Right pick one of the three stacks in the tray, OK (or Up) lifts it, arrows move it over
// the board, OK sets it down; Down off the board's bottom puts it back. Touch and mouse: tap a stack,
// then tap a cell (or drag it there).
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const COLORS = ['#ff4d6d', '#ffd23f', '#3bceac', '#4e7cff', '#b26bff', '#ff9f1c', '#22d3ee', '#ff6bd6'];
  const ROWS = [4, 5, 6, 5, 4]; // the honeycomb: 24 cells
  const CLEAR = 10; // this many of one colour on top bursts
  const SQ = 0.72; // the board is seen at a tilt: hexagons are squashed this much
  const HOP = 0.3, HOP_GAP = 0.075; // a disc's flight, and the gap between discs
  const WORDS = ['', 'Burst!', 'Double!', 'Triple!', 'Mega chain!', 'Unstoppable!'];

  // ---------- The board's cells and who touches whom ----------
  // gx counts in hexagon widths from the middle; rows of 4/5/6 sit half a hexagon apart.
  const CELLS = [];
  ROWS.forEach((n, r) => { for (let j = 0; j < n; j++) CELLS.push({ gx: j - (n - 1) / 2, gy: r - (ROWS.length - 1) / 2 }); });
  CELLS.forEach((a, i) => {
    a.nb = [];
    CELLS.forEach((b, k) => {
      if (i === k) return;
      const dy = Math.abs(a.gy - b.gy), dx = Math.abs(a.gx - b.gx);
      if ((dy === 0 && Math.abs(dx - 1) < 0.01) || (dy === 1 && Math.abs(dx - 0.5) < 0.01)) a.nb.push(k);
    });
  });
  // Painter's order: back rows first, so tall stacks in front cover the ones behind.
  const ORDER = CELLS.map((_, i) => i).sort((a, b) => CELLS[a].gy - CELLS[b].gy || CELLS[a].gx - CELLS[b].gx);

  const colorsFor = (lv) => Math.min(COLORS.length, 2 + lv);
  const goal = (lv) => 10 * lv * (lv + 3); // score to finish level lv: 40, 100, 180, 280...
  const rand = (n) => Math.floor(Math.random() * n);
  const topOf = (s) => (s.length ? s[s.length - 1] : -1);
  const runOf = (s) => {
    if (!s.length) return 0;
    const t = s[s.length - 1];
    let n = 0;
    for (let i = s.length - 1; i >= 0 && s[i] === t; i--) n++;
    return n;
  };
  const uniform = (s) => s.length > 0 && runOf(s) === s.length;

  // ---------- State ----------
  let cells, tray, score, level, over, overT, newBest = false, best = Kit.store.get('hexstack.best', 0);
  let mode = 'tray', focus = 0, cursor = 9, stickX = 0, view = null, confirmT = -9;
  let busy = null, dirty = [], chain = 0, trayT = 0, nopeT = -9, introT = 0, shown = 0, bump = 0, levelT = -9;
  let drag = null;

  function makeStack() {
    // 2-6 discs in 1-3 colour runs; the top colour often matches something on the board.
    const nc = colorsFor(level);
    const size = [2, 2, 3, 3, 4, 4, 5, 6][rand(8)];
    const runs = Math.min(size, 1 + rand(Math.min(3, nc)), size <= 2 ? 2 : 3);
    const colors = [];
    for (let i = 0; i < runs; i++) {
      let c;
      do { c = rand(nc); } while (i > 0 && c === colors[i - 1]);
      colors.push(c);
    }
    const tops = cells.filter((s) => s.length).map(topOf);
    if (tops.length && Math.random() < 0.55) {
      const t = tops[rand(tops.length)];
      if (colors.length < 2 || colors[colors.length - 2] !== t) colors[colors.length - 1] = t;
    }
    const st = [];
    let left = size;
    colors.forEach((c, i) => {
      const rest = colors.length - i - 1;
      const n = rest === 0 ? left : 1 + rand(Math.max(1, left - rest - 1));
      for (let k = 0; k < n; k++) st.push(c);
      left -= n;
    });
    return st;
  }
  function deal() { trayT = performance.now() / 1000; return [makeStack(), makeStack(), makeStack()]; }
  function fresh() {
    cells = CELLS.map(() => []);
    score = 0; shown = 0; level = 1; over = false; newBest = false; busy = null; dirty = [];
    // A few stacks to start on, so the first moves already have something to match.
    for (let k = 0; k < 4; k++) {
      let i;
      do { i = rand(CELLS.length); } while (cells[i].length);
      let st, tries = 0;
      do { st = makeStack(); } while (tries++ < 20 && CELLS[i].nb.some((n) => topOf(cells[n]) === topOf(st)));
      cells[i] = st;
    }
    tray = deal(); mode = 'tray'; focus = 0;
    save();
  }
  function save() {
    if (over) { Kit.store.set('hexstack.game', null); return; }
    Kit.store.set('hexstack.game', { cells, tray, score, level });
  }
  const saved = Kit.store.get('hexstack.game', null);
  if (saved && saved.cells && saved.cells.length === CELLS.length) {
    cells = saved.cells; tray = saved.tray; score = saved.score; shown = score; level = saved.level; over = false;
    if (tray.every((s) => !s)) tray = deal();
    focus = Math.max(0, tray.findIndex((s) => s));
  } else fresh();

  // ---------- Layout ----------
  let L = {};
  function layout(W, H) {
    const R = Math.min(H * 0.074, W * 0.052);
    const T = R * 0.17;
    L = { R, T, cx: W / 2, cy: H * 0.47, tr: R * 0.82, trayY: H * 0.855 };
    L.slots = [0, 1, 2].map((i) => ({ x: W / 2 + (i - 1) * R * 3.1, y: L.trayY }));
    L.side = Math.min(W * 0.17, (W / 2 - R * 5.6) / 2 + R * 0.4);
    L.lx = L.side; L.rx = W - L.side;
    const bw = Math.min(W * 0.2, 240), bh = Math.max(46, Math.min(H * 0.075, 60));
    L.btn = { x: L.rx - bw / 2, y: L.trayY - bh / 2, w: bw, h: bh };
    L.font = Math.max(18, Math.round(H * 0.034));
    sprites.clear();
    buildBoard();
  }
  const cellX = (i) => L.cx + CELLS[i].gx * Math.sqrt(3) * L.R;
  const cellY = (i) => L.cy + CELLS[i].gy * 1.5 * L.R * SQ;
  const spacing = (n, T) => Math.min(T, (T / 0.17) * 2.5 / Math.max(1, n));
  const discY = (y, i, n, T) => y - T - i * spacing(n, T);

  function hexPath(c, x, y, r, sq = SQ) {
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * sq;
      if (k) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }

  // Each colour's disc, drawn once per size: a hexagon slab with a lit top and a darker side.
  const sprites = new Map();
  function disc(color, R) {
    const key = color + Math.round(R * 10);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = R * 0.84, T = R * 0.17;
    const w = Math.sqrt(3) * r + 6, h = 2 * r * SQ + T + 6;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    const ox = w / 2, oy = 3 + r * SQ;
    const v = (k, dy = 0) => { const a = -Math.PI / 2 + k * Math.PI / 3; return [ox + Math.cos(a) * r, oy + Math.sin(a) * r * SQ + dy]; };
    // Side: the hull of the top hexagon and the same hexagon one slab lower.
    c.beginPath();
    [v(0), v(1), v(2, T), v(3, T), v(4, T), v(5)].forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
    const sg = c.createLinearGradient(ox - r, 0, ox + r, 0);
    sg.addColorStop(0, shade(color, -0.45)); sg.addColorStop(0.5, shade(color, -0.2)); sg.addColorStop(1, shade(color, -0.5));
    c.fillStyle = sg; c.fill();
    c.lineWidth = 1; c.strokeStyle = shade(color, -0.6); c.stroke();
    // Top face
    hexPath(c, ox, oy, r);
    const g = c.createLinearGradient(0, oy - r * SQ, 0, oy + r * SQ);
    g.addColorStop(0, shade(color, 0.38)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.12));
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(1, R * 0.04); c.strokeStyle = shade(color, 0.5); c.stroke();
    // Sheen
    hexPath(c, ox - r * 0.12, oy - r * 0.2 * SQ, r * 0.5);
    c.fillStyle = 'rgba(255,255,255,0.22)'; c.fill();
    s = { cv, w, h, ox, oy };
    sprites.set(key, s);
    return s;
  }
  function drawDisc(c, color, x, y, R, alpha = 1, scale = 1) {
    const s = disc(COLORS[color], R);
    if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(s.cv, x - s.ox * scale, y - s.oy * scale, s.w * scale, s.h * scale);
    if (alpha !== 1) c.globalAlpha = 1;
  }
  function drawStack(c, st, x, y, R, extra) {
    const T = R * 0.17, n = st.length + (extra ? extra.length : 0);
    for (let i = 0; i < st.length; i++) drawDisc(c, st[i], x, discY(y, i, n, T), R);
    if (extra) extra.forEach((col, k) => drawDisc(c, col, x, discY(y, st.length + k, n, T), R));
  }
  function label(c, st, x, y, R) {
    // How many of the top colour there are, on the top disc.
    if (!st.length) return;
    const ty = discY(y, st.length - 1, st.length, R * 0.17);
    const fs = Math.round(R * 0.42);
    c.font = `900 ${fs}px system-ui, sans-serif`;
    c.lineWidth = fs * 0.22; c.strokeStyle = 'rgba(20,10,40,0.75)'; c.lineJoin = 'round';
    const n = runOf(st);
    c.strokeText(n, x, ty + 1);
    c.fillStyle = '#fff'; c.fillText(n, x, ty + 1);
  }

  // The empty board is drawn once into a picture.
  const boardCv = document.createElement('canvas');
  function buildBoard() {
    const W = Kit.W, H = Kit.H;
    if (!W) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardCv.width = Math.ceil(W * dpr); boardCv.height = Math.ceil(H * dpr);
    const c = boardCv.getContext('2d');
    c.scale(dpr, dpr);
    const { R } = L;
    // A soft tray under the honeycomb
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = R * 0.6; c.shadowOffsetY = R * 0.2;
    CELLS.forEach((_, i) => { hexPath(c, cellX(i), cellY(i) + R * 0.12, R * 1.08); c.fillStyle = '#1b0f45'; c.fill(); });
    c.restore();
    CELLS.forEach((_, i) => {
      const x = cellX(i), y = cellY(i);
      hexPath(c, x, y + R * 0.1, R * 0.93); c.fillStyle = 'rgba(10,4,30,0.9)'; c.fill();
      hexPath(c, x, y, R * 0.93);
      const g = c.createLinearGradient(0, y - R * SQ, 0, y + R * SQ);
      g.addColorStop(0, 'rgba(120,90,220,0.38)'); g.addColorStop(1, 'rgba(60,40,140,0.32)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(190,160,255,0.35)'; c.stroke();
      hexPath(c, x, y + R * 0.04, R * 0.6); c.fillStyle = 'rgba(0,0,0,0.12)'; c.fill();
    });
  }
  Kit.onResize(layout);

  // ---------- Resolving: hops and bursts, one step at a time ----------
  function nextStep() {
    while (dirty.length) {
      const x = dirty[0], s = cells[x];
      if (!s.length) { dirty.shift(); continue; }
      const top = topOf(s);
      const match = CELLS[x].nb.filter((k) => cells[k].length && topOf(cells[k]) === top);
      if (match.length) {
        // Neighbours pour onto this stack; but a mixed stack next to one that is all one colour gives
        // its top to that one instead, which uncovers its next colour.
        let from = match[0], to = x;
        const pure = match.filter((k) => uniform(cells[k]));
        if (match.length === 1 && !uniform(s) && pure.length) { from = x; to = pure[0]; }
        startHop(from, to);
        dirty = dirty.filter((k) => k !== to && k !== from);
        dirty.unshift(to); dirty.push(from);
        return true;
      }
      if (runOf(s) >= CLEAR) { startPop(x); return true; }
      dirty.shift();
    }
    return false;
  }
  function startHop(from, to) {
    const A = cells[from], n = runOf(A), color = topOf(A);
    const fromLen = A.length, base = cells[to].length;
    const list = [];
    for (let k = 0; k < n; k++) list.push({ k, t0: k * HOP_GAP, idx: fromLen - 1 - k, landed: false });
    A.length = fromLen - n;
    busy = { type: 'hop', from, to, color, list, base, fromLen, t: 0, end: (n - 1) * HOP_GAP + HOP + 0.08 };
  }
  function startPop(x) {
    const S = cells[x], n = runOf(S), color = topOf(S), len = S.length;
    S.length = len - n;
    chain++;
    const pts = n * chain;
    score += pts; bump = 1;
    const list = [];
    for (let k = 0; k < n; k++) list.push({ t0: k * 0.04, idx: len - 1 - k, len });
    busy = { type: 'pop', cell: x, color, list, t: 0, end: n * 0.04 + 0.35 };
    const px = cellX(x), py = cellY(x) - L.R * 1.2;
    sfx.clear(1, chain);
    Kit.shake(3 + chain * 2, 0.25);
    Kit.float(`+${pts}`, px, py, { color: COLORS[color], size: L.R * 0.75 });
    Kit.float(WORDS[Math.min(chain, WORDS.length - 1)], L.cx, L.cy - L.R * 3.4, { color: ['#ffd23f', '#3bceac', '#4ea8de', '#ff9f1c', '#ff4d6d'][Math.min(chain, 5) - 1], size: L.R * (0.8 + Math.min(chain, 4) * 0.08), life: 1.2, big: true });
    if (score > best) {
      if (!newBest && best > 0) { newBest = true; Kit.float('New best!', L.lx, L.cy + L.R * 1.6, { color: '#ffd23f', size: L.font * 1.2, life: 1.6, big: true }); }
      best = score; Kit.store.set('hexstack.best', best); Kit.record('hexstack', best);
    }
  }
  function checkLevel() {
    let up = false;
    while (score >= goal(level)) { level++; up = true; }
    if (up) {
      levelT = performance.now() / 1000;
      setTimeout(() => { sfx.win(); Kit.confetti(70); }, 150);
      Kit.float(`Level ${level}!`, L.cx, L.cy - L.R * 1.2, { color: '#7fe3ff', size: L.R * 1.1, life: 1.8, big: true });
      if (colorsFor(level) > colorsFor(level - 1)) Kit.float('New colour unlocked', L.cx, L.cy + L.R * 0.2, { color: COLORS[colorsFor(level) - 1], size: L.font * 1.3, life: 1.8, big: true });
    }
  }
  function endTurn() {
    busy = null;
    checkLevel();
    if (tray.every((s) => !s)) tray = deal();
    if (!tray[focus]) focus = Math.max(0, tray.findIndex((s) => s));
    if (cells.every((s) => s.length)) {
      over = true; overT = performance.now() / 1000 + 0.6;
      Kit.record('hexstack', best);
      setTimeout(() => sfx.over(), 400);
    }
    save();
  }

  // ---------- Moves ----------
  function nearestEmpty(from) {
    if (!cells[from].length) return from;
    let bestI = -1, bd = 1e9;
    cells.forEach((s, i) => {
      if (s.length) return;
      const d = Math.hypot(CELLS[i].gx - CELLS[from].gx, (CELLS[i].gy - CELLS[from].gy) * 0.87);
      if (d < bd) { bd = d; bestI = i; }
    });
    return bestI;
  }
  function lift(slot) {
    if (busy || over) return;
    if (!tray[slot]) { nope(); return; }
    focus = slot;
    const c = nearestEmpty(cursor);
    if (c < 0) { nope(); return; }
    cursor = c; stickX = CELLS[c].gx;
    mode = 'board';
    view = { x: L.slots[slot].x, y: L.slots[slot].y - L.R * 0.6 };
    sfx.pick();
  }
  function putBack() { mode = 'tray'; sfx.move(); }
  function place() {
    if (busy || over || mode !== 'board') return;
    if (cells[cursor].length) { nope(); return; }
    cells[cursor] = tray[focus];
    tray[focus] = null;
    mode = 'tray';
    const from = view ? { ...view } : { x: cellX(cursor), y: cellY(cursor) - L.R };
    busy = { type: 'drop', cell: cursor, t: 0, end: 0.16, from };
    chain = 0;
    const left = tray.findIndex((s) => s);
    if (left >= 0) focus = left;
  }
  function nope() { nopeT = performance.now() / 1000; sfx.nope(); }

  function boardMove(k) {
    const a = CELLS[cursor];
    if (k === 'left' || k === 'right') {
      const want = a.gx + (k === 'left' ? -1 : 1);
      const b = CELLS.findIndex((c) => c.gy === a.gy && Math.abs(c.gx - want) < 0.01);
      if (b >= 0) { cursor = b; stickX = CELLS[b].gx; sfx.move(); }
      return;
    }
    const gy = a.gy + (k === 'up' ? -1 : 1);
    let bi = -1, bs = 1e9;
    CELLS.forEach((c, i) => {
      if (c.gy !== gy) return;
      // Nearest to the column we started in, so Up, Up comes back straight; ties lean to the middle.
      const s = Math.abs(c.gx - stickX) + Math.abs(c.gx) * 0.01;
      if (s < bs) { bs = s; bi = i; }
    });
    if (bi < 0) { if (k === 'down') putBack(); return; }
    cursor = bi; sfx.move();
  }
  function trayItems() {
    const out = L.slots.map((s, i) => ({ i, x: s.x, y: s.y })).filter((it) => tray[it.i]);
    out.push({ i: 3, x: L.btn.x + L.btn.w / 2, y: L.btn.y + L.btn.h / 2 });
    return out;
  }
  function trayMove(dir) {
    const all = trayItems(), cur = all.find((it) => it.i === focus) || all[0];
    let bestIt = null, sc = Infinity;
    for (const it of all) {
      if (it.i === cur.i) continue;
      const dx = it.x - cur.x, dy = it.y - cur.y;
      let main, side;
      if (dir === 'left') { if (dx >= -1) continue; main = -dx; side = Math.abs(dy); }
      else if (dir === 'right') { if (dx <= 1) continue; main = dx; side = Math.abs(dy); }
      else if (dir === 'up') { if (dy >= -1) continue; main = -dy; side = Math.abs(dx); }
      else { if (dy <= 1) continue; main = dy; side = Math.abs(dx); }
      const s = main + side * 3;
      if (s < sc) { sc = s; bestIt = it; }
    }
    if (bestIt) { focus = bestIt.i; sfx.move(); }
    else if (dir === 'up' && focus < 3) lift(focus);
  }
  function pressButton() {
    const now = performance.now() / 1000;
    if (now - confirmT < 3) { confirmT = -9; fresh(); sfx.pick(); }
    else { confirmT = now; sfx.move(); }
  }

  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (over) { if (k === 'ok' && performance.now() / 1000 > overT + 0.8) { fresh(); sfx.pick(); } return; }
    if (k === 'restart') { pressButton(); return; }
    if (k === 'undo') return;
    if (mode === 'board') {
      if (k === 'ok') place(); else boardMove(k);
      return;
    }
    if (k === 'ok') { if (focus === 3) pressButton(); else lift(focus); return; }
    trayMove(k);
  });

  // ---------- Touch and mouse ----------
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const inBox = (e, b) => e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  function cellAt(x, y) {
    let bi = -1, bd = L.R * 0.95;
    CELLS.forEach((_, i) => {
      const d = Math.hypot(x - cellX(i), (y - cellY(i)) / SQ);
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  }
  function slotAt(x, y) {
    return L.slots.findIndex((s) => Math.abs(x - s.x) < L.R * 1.4 && y > s.y - L.R * 2 && y < s.y + L.R * 1.1);
  }
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (over) { if (performance.now() / 1000 > overT + 0.8) fresh(); return; }
      if (inBox(e, L.btn)) { focus = 3; mode = 'tray'; pressButton(); return; }
      const s = slotAt(e.x, e.y);
      if (s >= 0 && tray[s] && !busy) {
        if (mode === 'board' && focus === s) { putBack(); return; }
        lift(s);
        if (mode === 'board') drag = { slot: s, moved: false };
        return;
      }
      const ci = cellAt(e.x, e.y);
      if (ci >= 0 && mode === 'board') { cursor = ci; stickX = CELLS[ci].gx; place(); }
    },
    move(e) {
      if (mode !== 'board') return;
      const ci = cellAt(e.x, e.y);
      if (ci >= 0 && ci !== cursor) { cursor = ci; stickX = CELLS[ci].gx; if (drag) drag.moved = true; }
    },
    up(e, cancel) {
      const d = drag; drag = null;
      if (!d || cancel || mode !== 'board') return;
      const ci = cellAt(e.x, e.y);
      if (ci >= 0 && d.moved) { cursor = ci; place(); }
    },
  });

  // ---------- Animation ----------
  function update(dt) {
    introT += dt;
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    if (mode === 'board' && L.R) {
      // Over a full cell it floats above that stack, so both stay readable.
      const under = cells[cursor].length;
      const tx = cellX(cursor), ty = cellY(cursor) - L.R * 0.95 - (under ? under * spacing(under, L.T) + L.R * 0.4 : 0);
      if (!view) view = { x: tx, y: ty };
      const k = Math.min(1, dt * 18);
      view.x = lerp(view.x, tx, k); view.y = lerp(view.y, ty, k);
    }
    if (!busy) return;
    busy.t += dt;
    if (busy.type === 'hop') {
      for (const d of busy.list) {
        if (!d.landed && busy.t >= d.t0 + HOP) {
          d.landed = true;
          cells[busy.to].push(busy.color);
          Kit.tone(420 + d.k * 45, { type: 'triangle', dur: 0.07, vol: 0.13 });
        }
      }
    } else if (busy.type === 'pop') {
      for (const d of busy.list) {
        if (!d.fx && busy.t >= d.t0) {
          d.fx = true;
          Kit.burst(cellX(busy.cell), discY(cellY(busy.cell), d.idx, d.len, L.T), COLORS[busy.color], 4, 0.7);
        }
      }
    }
    if (busy.t >= busy.end) {
      if (busy.type === 'drop') {
        sfx.drop();
        Kit.burst(cellX(busy.cell), cellY(busy.cell), 'rgba(255,255,255,0.8)', 5, 0.4);
        dirty = [busy.cell];
      }
      busy = null;
      if (!nextStep()) endTurn();
    }
  }

  // ---------- Drawing ----------
  function panelText(c, text, x, y, size, color, weight = 800) {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.fillStyle = color; c.fillText(text, x, y);
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000;
    Kit.background(c, t, '#2b1470', '#0b0624', 'rgba(150,100,255,0.10)');
    const { R, T, font } = L;
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Score (left)
    panelText(c, 'SCORE', L.lx, H * 0.2, font * 0.9, 'rgba(255,255,255,0.6)');
    c.save();
    c.translate(L.lx, H * 0.29); c.scale(1 + bump * 0.18, 1 + bump * 0.18);
    c.font = `900 ${Math.round(font * 2.6)}px system-ui, sans-serif`;
    c.lineWidth = font * 0.3; c.strokeStyle = 'rgba(30,10,70,0.9)'; c.lineJoin = 'round';
    c.strokeText(Math.round(shown), 0, 0);
    const sg = c.createLinearGradient(0, -font, 0, font);
    sg.addColorStop(0, '#fff6c2'); sg.addColorStop(1, '#ffb703');
    c.fillStyle = sg; c.fillText(Math.round(shown), 0, 0);
    c.restore();
    panelText(c, '👑 ' + best, L.lx, H * 0.38, font, 'rgba(255,255,255,0.75)');
    c.font = `600 ${Math.round(font * 0.8)}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.5)';
    ['Same colours', 'hop together.', `${CLEAR} on top burst!`].forEach((s, i) => c.fillText(s, L.lx, H * 0.52 + i * font * 1.15));

    // Level and goal (right)
    const lv = `Level ${level}`;
    c.font = `900 ${Math.round(font * 1.5)}px system-ui, sans-serif`;
    c.lineWidth = 6; c.strokeStyle = 'rgba(20,8,50,0.8)'; c.lineJoin = 'round';
    c.strokeText(lv, L.rx, H * 0.2);
    const lg = c.createLinearGradient(0, H * 0.17, 0, H * 0.23);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#a8c8ff');
    c.fillStyle = lg; c.fillText(lv, L.rx, H * 0.2);
    const g0 = level > 1 ? goal(level - 1) : 0, g1 = goal(level);
    const pw = Math.min(L.side * 1.5, 220), ph = Math.max(14, font * 0.6);
    const p = clamp((shown - g0) / (g1 - g0), 0, 1);
    roundRect(c, L.rx - pw / 2, H * 0.27, pw, ph, ph / 2); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    if (p > 0) {
      roundRect(c, L.rx - pw / 2, H * 0.27, Math.max(ph, pw * p), ph, ph / 2);
      const pg = c.createLinearGradient(L.rx - pw / 2, 0, L.rx + pw / 2, 0);
      pg.addColorStop(0, '#3bceac'); pg.addColorStop(1, '#7fe3ff');
      c.fillStyle = pg; c.fill();
    }
    panelText(c, `Goal ${Math.round(shown)} / ${g1}`, L.rx, H * 0.27 + ph + font * 0.8, font * 0.85, 'rgba(255,255,255,0.75)', 700);
    panelText(c, 'Colours', L.rx, H * 0.43, font * 0.8, 'rgba(255,255,255,0.55)', 700);
    const nc = colorsFor(level), sw = Math.min(R * 0.42, (L.side * 1.6) / Math.max(nc, 4) / 1.9);
    for (let i = 0; i < nc; i++) {
      const per = Math.ceil(nc / 2) > 4 ? 4 : Math.ceil(nc / (nc > 4 ? 2 : 1));
      const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, nc - row * per);
      drawDisc(c, i, L.rx + (col - (inRow - 1) / 2) * sw * 1.9, H * 0.5 + row * sw * 1.6, sw * 1.1);
    }

    // New game button
    const b = L.btn, on = mode === 'tray' && focus === 3 && !over && !Kit.touchFirst();
    const asking = now - confirmT < 3;
    roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
    const bg = c.createLinearGradient(0, b.y, 0, b.y + b.h);
    bg.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); bg.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
    c.fillStyle = bg; c.fill();
    c.lineWidth = 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
    c.font = `800 ${Math.round(Math.min(b.h * 0.4, b.w * 0.12))}px system-ui, sans-serif`;
    c.fillStyle = on ? '#2b1600' : '#fff';
    c.fillText(asking ? 'OK again = sure' : '⟳  New game', b.x + b.w / 2, b.y + b.h / 2 + 1);

    // Board
    c.drawImage(boardCv, 0, 0, W, H);
    const held = mode === 'board' && !over ? tray[focus] : null;
    // What the held stack would join: its neighbours with the same top colour glow.
    if (held && !busy) {
      const ok = !cells[cursor].length;
      if (ok) {
        const top = topOf(held);
        CELLS[cursor].nb.forEach((k) => {
          if (topOf(cells[k]) !== top) return;
          hexPath(c, cellX(k), cellY(k), R * 0.98);
          c.lineWidth = 3; c.strokeStyle = Kit.rgba(COLORS[top], 0.5 + 0.4 * Math.sin(t * 8)); c.stroke();
        });
      }
      hexPath(c, cellX(cursor), cellY(cursor), R * 0.95);
      c.fillStyle = ok ? 'rgba(255,255,255,0.16)' : 'rgba(255,60,90,0.2)'; c.fill();
      c.lineWidth = 4 + Math.sin(t * 8) * 1.2;
      c.strokeStyle = ok ? '#ffd23f' : '#ff5470'; c.stroke();
    }
    for (const i of ORDER) {
      const x = cellX(i), y = cellY(i);
      const st = cells[i];
      let extra = null;
      if (busy && busy.type === 'drop' && busy.cell === i) {
        const k = Math.min(1, busy.t / busy.end), kk = k * k;
        drawStack(c, st, lerp(busy.from.x, x, kk), lerp(busy.from.y, y, kk), R);
        continue;
      }
      if (busy && busy.type === 'hop' && busy.from === i) {
        extra = busy.list.filter((d) => busy.t < d.t0).map(() => busy.color);
      }
      if (!st.length && !(extra && extra.length)) continue;
      drawStack(c, st, x, y, R, extra);
      if (!(busy && (busy.from === i || busy.to === i || busy.cell === i))) label(c, st, x, y, R);
    }
    // Flying and bursting discs
    if (busy && busy.type === 'hop') {
      const fx = cellX(busy.from), fy = cellY(busy.from), tx = cellX(busy.to), ty = cellY(busy.to);
      const total = busy.base + busy.list.length;
      for (const d of busy.list) {
        if (busy.t < d.t0 || d.landed) continue;
        const q = clamp((busy.t - d.t0) / HOP, 0, 1), e = ease.inOut(q);
        const sy = discY(fy, d.idx, busy.fromLen, T), ey = discY(ty, busy.base + d.k, total, T);
        const x = lerp(fx, tx, e), y = lerp(sy, ey, e) - Math.sin(q * Math.PI) * R * 1.3;
        drawDisc(c, busy.color, x, y, R, 1, 1 + Math.sin(q * Math.PI) * 0.12);
      }
    }
    if (busy && busy.type === 'pop') {
      const x = cellX(busy.cell), y = cellY(busy.cell);
      for (const d of busy.list) {
        const q = (busy.t - d.t0) / 0.3;
        const by = discY(y, d.idx, d.len, T);
        if (q < 0) { drawDisc(c, busy.color, x, by, R); continue; }
        if (q > 1) continue;
        drawDisc(c, busy.color, x, by - q * R * 1.2, R, 1 - q, 1 + q * 0.5);
      }
    }

    // Tray
    const since = now - trayT;
    L.slots.forEach((s, i) => {
      const st = tray[i];
      const focused = !over && focus === i && !Kit.touchFirst();
      roundRect(c, s.x - R * 1.35, s.y - R * 1.7, R * 2.7, R * 2.55, R * 0.4);
      c.fillStyle = 'rgba(10,4,30,0.45)'; c.fill();
      if (focused) {
        c.lineWidth = mode === 'tray' ? 3 + Math.sin(t * 6) : 2;
        c.strokeStyle = mode === 'tray' ? '#ffd23f' : 'rgba(255,210,63,0.35)'; c.stroke();
      } else { c.lineWidth = 1.5; c.strokeStyle = 'rgba(190,160,255,0.2)'; c.stroke(); }
      if (!st || (mode === 'board' && focus === i)) return;
      const enter = clamp((since - i * 0.08) / 0.45, 0, 1);
      const off = (1 - ease.back(enter)) * R * 3;
      const bob = focused && mode === 'tray' ? Math.sin(t * 5) * 3 : 0;
      const shakeX = focused && now - nopeT < 0.3 ? Math.sin((now - nopeT) * 60) * R * 0.1 : 0;
      c.globalAlpha = enter;
      drawStack(c, st, s.x + shakeX, s.y + R * 0.35 + off + bob, L.tr);
      label(c, st, s.x + shakeX, s.y + R * 0.35 + off + bob, L.tr);
      c.globalAlpha = 1;
    });

    // The held stack floats over the board with its shadow below.
    if (held && view) {
      const shakeX = now - nopeT < 0.3 ? Math.sin((now - nopeT) * 60) * R * 0.12 : 0;
      const bob = Math.sin(t * 4) * R * 0.05;
      if (!cells[cursor].length) {
        c.globalAlpha = 0.35;
        hexPath(c, cellX(cursor), cellY(cursor) + R * 0.05, R * 0.75); c.fillStyle = '#000'; c.fill();
        c.globalAlpha = 1;
      }
      drawStack(c, held, view.x + shakeX, view.y + bob, R);
      label(c, held, view.x + shakeX, view.y + bob, R);
    }

    // Speaker (tap or M)
    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    // One-line how to play
    const tip = Kit.touchFirst() ? 'Tap a stack, then tap a cell' : mode === 'board'
      ? 'Arrows move it · OK sets it down · ▼ off the board puts it back'
      : focus === 3 ? 'OK twice starts a new game · Back exits' : '◀ ▶ pick a stack · OK lifts it · Back exits';
    c.font = `600 ${Math.round(font * 0.82)}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText(tip, W / 2, H * 0.968);

    if (over && now > overT) {
      const a = clamp((now - overT) / 0.4, 0, 1);
      c.fillStyle = `rgba(8,3,24,${0.7 * a})`; c.fillRect(0, 0, W, H);
      c.save();
      c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw2 = Math.min(W * 0.8, R * 9), ph2 = R * 5.4;
      roundRect(c, -pw2 / 2, -ph2 / 2, pw2, ph2, R * 0.5);
      const pg = c.createLinearGradient(0, -ph2 / 2, 0, ph2 / 2);
      pg.addColorStop(0, '#5a2bd6'); pg.addColorStop(1, '#2a1170');
      c.fillStyle = pg; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(R * 0.7)}px system-ui, sans-serif`;
      c.fillText('Board full!', 0, -ph2 * 0.3);
      c.font = `900 ${Math.round(R * 1.1)}px system-ui, sans-serif`; c.fillStyle = '#ffd23f';
      c.fillText(score, 0, -ph2 * 0.06);
      c.font = `700 ${Math.round(R * 0.4)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(newBest ? '🎉 New best score!' : `👑 Best ${best}  ·  Level ${level}`, 0, ph2 * 0.15);
      c.fillStyle = '#9ff0ff';
      c.fillText(Kit.touchFirst() ? 'Tap to play again' : 'Press OK to play again', 0, ph2 * 0.33);
      c.restore();
    }
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (best > 0) Kit.record('hexstack', best);
})();
