// Block Drop: the falling-blocks classic, remade. Pieces fall into a 10×20 well; fill a row to clear it.
// Clear 2, 3 or 4 rows at once for a Double, Triple or Tetra; every 10 lines the level goes up and they fall faster.
// Remote: ◀ ▶ move, ▲ rotates, ▼ soft drop (hold it), OK hard drop. Keyboard: arrows/WASD and Enter/space.
// Touch: drag sideways to move, tap to rotate, drag down to soft drop, flick down to hard drop.
'use strict';

(() => {
  const { sfx, ease, shade, rgba, roundRect, clamp, lerp, tone, noise } = Kit;
  const COLS = 10, ROWS = 20;
  // I, O, T, S, Z, J, L: the same seven pieces as the old game, in their turning boxes.
  const SHAPES = [
    [4, [[0, 1], [1, 1], [2, 1], [3, 1]]],
    [2, [[0, 0], [1, 0], [0, 1], [1, 1]]],
    [3, [[1, 0], [0, 1], [1, 1], [2, 1]]],
    [3, [[1, 0], [2, 0], [0, 1], [1, 1]]],
    [3, [[0, 0], [1, 0], [1, 1], [2, 1]]],
    [3, [[0, 0], [0, 1], [1, 1], [2, 1]]],
    [3, [[2, 0], [0, 1], [1, 1], [2, 1]]],
  ];
  const COLORS = ['#22e0ff', '#ffd23f', '#b46bff', '#3ee08f', '#ff4d6d', '#4e7cff', '#ff9f1c'];
  const ACCENTS = ['#22e0ff', '#4e7cff', '#b46bff', '#ff6bd6', '#ff9f1c', '#ffd23f', '#3ee08f'];
  const GRAY = '#4a5578';
  const WORDS = ['', '', 'Double!', 'Triple!', 'TETRA!'];
  const WORD_COLORS = ['', '#ffffff', '#3ee08f', '#22e0ff', '#ffd23f'];
  const LINE_PTS = [0, 100, 300, 500, 800];
  const CLEAR_T = 0.34, LOCK_T = 0.5, MAX_RESETS = 15, DAS = 0.16, ARR = 0.05;
  const gravity = (lv) => Math.max(0.06, 0.8 * Math.pow(0.82, lv - 1));

  // ---------- State ----------
  let best = Kit.store.get('blockdrop.best', 0), startBest = best, recorded = best;
  // state: 'menu', 'play', 'paused', 'over'
  let state = 'menu', T = 0, overT = 0, startT = 0;
  let board = new Array(COLS * ROWS).fill(0), bag = [], queue = [], cur = null;
  let score = 0, shown = 0, bump = 0, lines = 0, level = 1, combo = 0, newBest = false, shownProg = 0;
  let fallAcc = 0, lockT = 0, lockResets = 0, softHeld = false, softT = 0;
  let clearing = null, rowShift = new Array(ROWS).fill(0), rowAnimT = -9, levelT = -9;
  let trails = [], flashes = [], view = { x: 0, y: 0 }, rotK = 0, nudge = 0, nudgeT = -9;

  const fits = (cells, x, y) => cells.every(([cx, cy]) => {
    const X = x + cx, Y = y + cy;
    return X >= 0 && X < COLS && Y < ROWS && (Y < 0 || board[Y * COLS + X] === 0);
  });
  function fromBag() {
    if (!bag.length) {
      bag = [0, 1, 2, 3, 4, 5, 6];
      for (let i = bag.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]]; }
    }
    return bag.pop();
  }

  function fresh() {
    board = new Array(COLS * ROWS).fill(0); bag = []; queue = [fromBag(), fromBag(), fromBag()];
    score = 0; shown = 0; bump = 0; lines = 0; level = 1; combo = 0; newBest = false; shownProg = 0;
    startBest = best; clearing = null; rowShift.fill(0); trails = []; flashes = [];
    state = 'play'; startT = T;
    buildFrame();
    spawn();
    sfx.pick();
    Kit.float('Go!', L.bx + L.bw / 2, L.by + L.bh * 0.4, { color: ACCENTS[0], size: L.cs * 2, life: 1, big: true });
  }

  function spawn() {
    const k = queue.shift();
    queue.push(fromBag());
    const [size, cells] = SHAPES[k];
    cur = { k, size, cells: cells.map((p) => p.slice()), x: Math.floor((COLS - size) / 2), y: k === 0 ? -1 : 0 };
    view = { x: cur.x, y: cur.y - 1.2 };
    fallAcc = 0; lockT = 0; lockResets = 0; rotK = 0;
    if (!fits(cur.cells, cur.x, cur.y)) gameOver();
  }

  function grounded() { return !fits(cur.cells, cur.x, cur.y + 1); }
  function touched() {
    // Moving or turning on the ground buys a little more time, up to a limit.
    if (grounded() && lockResets < MAX_RESETS) { lockT = 0; lockResets++; }
  }
  function move(dx) {
    if (!cur || clearing) return false;
    if (fits(cur.cells, cur.x + dx, cur.y)) { cur.x += dx; touched(); tone(620, { type: 'triangle', dur: 0.045, vol: 0.07 }); return true; }
    nudge = dx; nudgeT = T;
    return false;
  }
  function rotate() {
    if (!cur || clearing) return;
    if (cur.k === 1) { rotK = 1; tone(880, { type: 'triangle', dur: 0.06, vol: 0.08, slide: 1.3 }); return; }
    const n = cur.size;
    const turned = cur.cells.map(([x, y]) => [n - 1 - y, x]);
    // Nudges the piece off a wall or the stack when turning it there.
    for (const [dx, dy] of [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]]) {
      if (fits(turned, cur.x + dx, cur.y + dy)) {
        cur.cells = turned; cur.x += dx; cur.y += dy;
        rotK = 1; touched();
        tone(760, { type: 'triangle', dur: 0.07, vol: 0.1, slide: 1.35 });
        return;
      }
    }
    sfx.nope();
  }
  function softStep() {
    if (!cur || clearing) return false;
    if (fits(cur.cells, cur.x, cur.y + 1)) { cur.y++; addScore(1); fallAcc = 0; return true; }
    return false;
  }
  function hardDrop() {
    if (!cur || clearing) return;
    const y0 = cur.y;
    let d = 0;
    while (fits(cur.cells, cur.x, cur.y + 1)) { cur.y++; d++; }
    addScore(2 * d);
    const color = COLORS[cur.k];
    if (d > 0) {
      // A streak above each column the piece fell down.
      const tops = {};
      for (const [cx, cy] of cur.cells) if (tops[cx] === undefined || cy < tops[cx]) tops[cx] = cy;
      for (const cx in tops) trails.push({ x: cur.x + +cx, y0: Math.max(-1, y0 + tops[cx] - 1), y1: cur.y + tops[cx], color, t: T });
    }
    view.y = cur.y;
    Kit.shake(3 + Math.min(d, 18) * 0.25, 0.18);
    noise({ dur: 0.1, vol: 0.1, freq: 700, q: 0.8, sweep: 3 });
    sfx.drop();
    const bottoms = {};
    for (const [cx, cy] of cur.cells) if (bottoms[cx] === undefined || cy > bottoms[cx]) bottoms[cx] = cy;
    for (const cx in bottoms) {
      const px = L.bx + (cur.x + +cx + 0.5) * L.cs, py = L.by + (cur.y + bottoms[cx] + 1) * L.cs;
      Kit.burst(px, py, '#cfe9ff', 3, 0.45);
    }
    lock(true);
  }

  function addScore(n) {
    score += n;
    if (score > best) {
      best = score;
      if (!newBest && startBest > 0) {
        newBest = true;
        Kit.float('New best!', L.score.x + L.score.w / 2, L.score.y + L.score.h + L.cs * 0.8, { color: '#ffd23f', size: L.cs * 0.9, life: 1.6, big: true });
        sfx.chime();
      }
    }
  }
  function saveBest() {
    if (best > recorded) { recorded = best; Kit.store.set('blockdrop.best', best); Kit.record('blockdrop', best); }
  }

  function lock(hard) {
    let out = false;
    for (const [cx, cy] of cur.cells) {
      const X = cur.x + cx, Y = cur.y + cy;
      if (Y < 0) { out = true; continue; }
      board[Y * COLS + X] = cur.k + 1;
      flashes.push({ x: X, y: Y, t: T });
    }
    if (!hard) { tone(210, { type: 'sine', dur: 0.09, vol: 0.28, slide: 0.6 }); noise({ dur: 0.04, vol: 0.06, freq: 2600, q: 0.8 }); }
    const k = cur.k;
    cur = null;
    if (out) { gameOver(); return; }
    const rows = [];
    for (let y = 0; y < ROWS; y++) {
      let full = true;
      for (let x = 0; x < COLS; x++) if (!board[y * COLS + x]) { full = false; break; }
      if (full) rows.push(y);
    }
    if (rows.length) {
      const n = rows.length;
      combo++;
      let pts = LINE_PTS[n] * level;
      if (combo >= 2) pts += 50 * (combo - 1) * level;
      addScore(pts); bump = 1;
      clearing = { rows: new Set(rows), t: T, color: COLORS[k] };
      const midY = L.by + ((rows[0] + rows[n - 1] + 1) / 2) * L.cs;
      for (const y of rows) for (let x = 0; x < COLS; x++) {
        Kit.burst(L.bx + (x + 0.5) * L.cs, L.by + (y + 0.5) * L.cs, COLORS[board[y * COLS + x] - 1], n >= 4 ? 5 : 3, 0.9);
      }
      sfx.clear(n, combo - 1);
      if (n >= 4) {
        tone(110, { type: 'sine', dur: 0.5, vol: 0.4, slide: 0.5 });
        setTimeout(() => sfx.win(), 120);
        Kit.confetti(70);
      }
      Kit.shake(n >= 4 ? 16 : 2 + n * 3, 0.2 + n * 0.07);
      if (n >= 2) {
        Kit.float(WORDS[n], L.bx + L.bw / 2, L.by + L.bh * 0.36, { color: WORD_COLORS[n], size: L.cs * (n >= 4 ? 2.1 : 1.5), life: 1.4, big: true });
      }
      Kit.float(`+${pts}`, L.bx + L.bw / 2, midY, { color: '#ffffff', size: L.cs * 0.95 });
      if (combo >= 2) Kit.float(`Combo ×${combo}`, L.bx + L.bw / 2, L.by + L.bh * 0.36 + L.cs * (n >= 2 ? 1.6 : 0), { color: '#ff6bd6', size: L.cs * 0.9, life: 1.3, big: true });
    } else {
      combo = 0;
      spawn();
    }
    saveBest();
  }

  function finishClear() {
    const rows = clearing.rows;
    const keep = [];
    for (let y = 0; y < ROWS; y++) if (!rows.has(y)) keep.push(y);
    const nb = new Array(COLS * ROWS).fill(0);
    rowShift.fill(0);
    const off = ROWS - keep.length;
    keep.forEach((y, i) => {
      const ny = i + off;
      for (let x = 0; x < COLS; x++) nb[ny * COLS + x] = board[y * COLS + x];
      rowShift[ny] = ny - y;
    });
    board = nb; rowAnimT = T;
    const n = rows.size;
    clearing = null;
    const oldLevel = level;
    lines += n;
    level = 1 + Math.floor(lines / 10);
    if (board.every((v) => v === 0)) {
      const bonus = 2000 * level;
      addScore(bonus);
      Kit.float('ALL CLEAR!', L.bx + L.bw / 2, L.by + L.bh * 0.55, { color: '#22e0ff', size: L.cs * 1.4, life: 1.8, big: true });
      Kit.float(`+${bonus}`, L.bx + L.bw / 2, L.by + L.bh * 0.55 + L.cs * 1.7, { color: '#ffffff', size: L.cs });
      Kit.confetti(80); sfx.win();
    }
    if (level > oldLevel) {
      levelT = T;
      buildFrame();
      Kit.float(`Level ${level}!`, L.bx + L.bw / 2, L.by + L.bh * 0.8, { color: ACCENTS[(level - 1) % ACCENTS.length], size: L.cs * 1.2, life: 1.6, big: true });
      setTimeout(() => sfx.chime(), 200);
    }
    saveBest();
    spawn();
  }

  function gameOver() {
    state = 'over'; overT = T; cur = null; clearing = null;
    releaseAll();
    saveBest();
    Kit.shake(10, 0.4);
    setTimeout(() => sfx.over(), 250);
  }

  // ---------- Layout and the parts drawn once ----------
  let L = { cs: 30, bx: 0, by: 0, bw: 300, bh: 600, score: {}, level: {}, next: {}, hints: null, wide: true };
  const frame = document.createElement('canvas');
  const sprites = new Map();
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H > 1.1;
    if (wide) {
      const cs = Math.floor(Math.min((H * 0.88) / ROWS, (W * 0.42) / COLS));
      const bw = cs * COLS, bh = cs * ROWS;
      const bx = Math.round((W - bw) / 2), by = Math.round((H - bh) / 2 + H * 0.01);
      const pw = Math.round(Math.min(cs * 7.4, bx - cs * 1.3 - W * 0.03));
      const lx = bx - cs * 1.1 - pw, rx = bx + bw + cs * 1.1;
      L = { wide, cs, bx, by, bw, bh,
        score: { x: lx, y: by, w: pw, h: cs * 4.6 },
        level: { x: lx, y: by + cs * 5.2, w: pw, h: cs * 4.6 },
        hints: { x: lx, y: by + cs * 10.8, w: pw },
        next: { x: rx, y: by, w: pw, h: cs * 11.2 },
        combo: { x: rx + pw / 2, y: by + cs * 12.4 } };
    } else {
      const top = H * 0.13;
      const cs = Math.floor(Math.min((W * 0.64) / COLS, (H - top - H * 0.04) / ROWS));
      const bw = cs * COLS, bh = cs * ROWS;
      const gap = Math.max(10, W * 0.03);
      const bx = Math.round(gap + cs * 0.3), by = Math.round(top + (H - top - bh) / 2);
      const rx = bx + bw + gap, pw = W - rx - gap;
      L = { wide, cs, bx, by, bw, bh,
        score: { x: gap, y: H * 0.02, w: W - gap * 2 - 64, h: top - H * 0.035 },
        next: { x: rx, y: by, w: pw, h: cs * 9.5 },
        level: { x: rx, y: by + cs * 10, w: pw, h: cs * 4.6 },
        hints: null,
        combo: { x: rx + pw / 2, y: by + cs * 15.6 } };
    }
    sprites.clear();
    buildFrame();
  }
  Kit.onResize(layout);

  // The well and the side cards: drawn once per size and level (gradients and glow are slow on TV boxes).
  function buildFrame() {
    const W = Kit.W, H = Kit.H, d = dprNow();
    if (!W || !H) return;
    frame.width = Math.ceil(W * d); frame.height = Math.ceil(H * d);
    const c = frame.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    const { cs, bx, by, bw, bh } = L;
    const accent = ACCENTS[(level - 1) % ACCENTS.length];
    const pad = cs * 0.3;
    // Glow round the well.
    c.save();
    c.shadowColor = rgba(accent, 0.55); c.shadowBlur = cs * 1.1;
    roundRect(c, bx - pad, by - pad, bw + pad * 2, bh + pad * 2, cs * 0.45);
    c.fillStyle = '#050b1f'; c.fill();
    c.restore();
    roundRect(c, bx - pad, by - pad, bw + pad * 2, bh + pad * 2, cs * 0.45);
    const wg = c.createLinearGradient(0, by, 0, by + bh);
    wg.addColorStop(0, '#0c1838'); wg.addColorStop(1, '#060c22');
    c.fillStyle = wg; c.fill();
    c.lineWidth = Math.max(2, cs * 0.09);
    const bg = c.createLinearGradient(bx, by, bx + bw, by + bh);
    bg.addColorStop(0, shade(accent, 0.35)); bg.addColorStop(0.5, accent); bg.addColorStop(1, shade(accent, -0.3));
    c.strokeStyle = bg; c.stroke();
    // Faint columns and a grid of dots.
    for (let x = 0; x < COLS; x++) {
      c.fillStyle = x % 2 ? 'rgba(255,255,255,0.018)' : 'rgba(120,170,255,0.035)';
      c.fillRect(bx + x * cs, by, cs, bh);
    }
    c.fillStyle = 'rgba(160,200,255,0.12)';
    for (let y = 1; y < ROWS; y++) for (let x = 1; x < COLS; x++) c.fillRect(bx + x * cs - 1, by + y * cs - 1, 2, 2);
    const vg = c.createRadialGradient(bx + bw / 2, by + bh * 0.4, 0, bx + bw / 2, by + bh * 0.4, bh * 0.75);
    vg.addColorStop(0, rgba(accent, 0.07)); vg.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.fillStyle = vg; c.fillRect(bx, by, bw, bh);
    // Cards
    for (const r of [L.score, L.level, L.next]) card(c, r.x, r.y, r.w, r.h, cs * 0.45, accent);
  }
  function card(c, x, y, w, h, r, accent) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(30,58,128,0.92)'); g.addColorStop(1, 'rgba(12,24,64,0.92)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(150,200,255,0.22)'; c.stroke();
    // A thin accent strip on top.
    c.save(); roundRect(c, x, y, w, h, r); c.clip();
    c.fillStyle = rgba(accent, 0.8); c.fillRect(x, y, w, Math.max(3, r * 0.22));
    const sh = c.createLinearGradient(0, y, 0, y + h * 0.4);
    sh.addColorStop(0, 'rgba(255,255,255,0.08)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.fillRect(x, y, w, h * 0.4);
    c.restore();
  }

  function canvasOf(w, h) {
    const s = document.createElement('canvas'), d = dprNow();
    s.width = Math.max(1, Math.ceil(w * d)); s.height = Math.max(1, Math.ceil(h * d));
    const c = s.getContext('2d'); c.scale(d, d);
    return [s, c];
  }
  function cached(key, w, h, paint) {
    let s = sprites.get(key);
    if (!s) { let c; [s, c] = canvasOf(w, h); paint(c); sprites.set(key, s); }
    return s;
  }
  // A cut jewel: bevelled facets round a glossy face.
  function jewel(color, size) {
    size = Math.max(4, Math.round(size));
    return cached('j' + color + size, size, size, (c) => {
      const p = size * 0.045, w = size - 2 * p, r = size * 0.17;
      roundRect(c, p, p, w, w, r);
      const g = c.createLinearGradient(0, p, 0, p + w);
      g.addColorStop(0, shade(color, 0.3)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.38));
      c.fillStyle = g; c.fill();
      c.save(); roundRect(c, p, p, w, w, r); c.clip();
      const a0 = p, a1 = p + w, i0 = size * 0.21, i1 = size - size * 0.21;
      const quad = (pts, fill) => {
        c.beginPath(); c.moveTo(pts[0], pts[1]);
        for (let k = 2; k < pts.length; k += 2) c.lineTo(pts[k], pts[k + 1]);
        c.closePath(); c.fillStyle = fill; c.fill();
      };
      quad([a0, a0, a1, a0, i1, i0, i0, i0], 'rgba(255,255,255,0.42)');
      quad([a0, a0, i0, i0, i0, i1, a0, a1], 'rgba(255,255,255,0.16)');
      quad([a1, a0, a1, a1, i1, i1, i1, i0], 'rgba(0,0,0,0.18)');
      quad([a0, a1, i0, i1, i1, i1, a1, a1], 'rgba(0,0,0,0.34)');
      const fg = c.createLinearGradient(i0, i0, i1, i1);
      fg.addColorStop(0, shade(color, 0.45)); fg.addColorStop(0.5, shade(color, 0.08)); fg.addColorStop(1, shade(color, -0.15));
      roundRect(c, i0, i0, i1 - i0, i1 - i0, size * 0.05); c.fillStyle = fg; c.fill();
      c.globalAlpha = 0.3; c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(i0, i0); c.lineTo(i0 + (i1 - i0) * 0.6, i0); c.lineTo(i0, i0 + (i1 - i0) * 0.6); c.closePath(); c.fill();
      c.globalAlpha = 1;
      c.restore();
      c.fillStyle = 'rgba(255,255,255,0.95)';
      c.beginPath(); c.arc(i0 + size * 0.09, i0 + size * 0.09, size * 0.045, 0, Math.PI * 2); c.fill();
      roundRect(c, p, p, w, w, r); c.lineWidth = Math.max(1, size * 0.04); c.strokeStyle = shade(color, -0.55); c.stroke();
    });
  }
  function ghostSprite(color, size) {
    size = Math.max(4, Math.round(size));
    return cached('g' + color + size, size, size, (c) => {
      const p = size * 0.1;
      roundRect(c, p, p, size - 2 * p, size - 2 * p, size * 0.16);
      c.fillStyle = rgba(color, 0.13); c.fill();
      c.lineWidth = Math.max(1.5, size * 0.07); c.strokeStyle = rgba(color, 0.8); c.stroke();
      c.fillStyle = rgba(color, 0.35);
      roundRect(c, size * 0.36, size * 0.36, size * 0.28, size * 0.28, size * 0.06); c.fill();
    });
  }
  function glowSprite(color, size) {
    size = Math.max(4, Math.round(size));
    return cached('o' + color + size, size * 2, size * 2, (c) => {
      const g = c.createRadialGradient(size, size, 0, size, size, size);
      g.addColorStop(0, rgba(color, 0.5)); g.addColorStop(0.5, rgba(color, 0.18)); g.addColorStop(1, rgba(color, 0));
      c.fillStyle = g; c.fillRect(0, 0, size * 2, size * 2);
    });
  }
  function trailSprite(color) {
    return cached('t' + color, 16, 128, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.7, rgba(color, 0.35)); g.addColorStop(1, 'rgba(255,255,255,0.75)');
      c.fillStyle = g; c.fillRect(0, 0, 16, 128);
    });
  }

  // ---------- Keys: held arrows repeat while held (the remote also repeats; handled the same) ----------
  const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Left: 'left', Right: 'right', Up: 'up', Down: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
  const ARROW_CODES = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };
  const held = { left: null, right: null, down: null, up: null };
  function releaseAll() { held.left = held.right = held.down = held.up = null; softHeld = false; }
  window.addEventListener('keydown', (e) => {
    const k = ARROWS[e.key] || ARROW_CODES[e.keyCode];
    if (!k) return;
    const now = performance.now() / 1000;
    if (held[k]) { held[k].seen = now; return; }
    held[k] = { t: now, seen: now, next: now + DAS };
    if (state === 'paused') { resume(); return; }
    if (state !== 'play') return;
    if (k === 'left' || k === 'right') {
      // The newest side wins.
      held[k === 'left' ? 'right' : 'left'] = null;
      move(k === 'left' ? -1 : 1);
    } else if (k === 'up') rotate();
    else if (k === 'down') { if (softStep()) tone(380, { type: 'sine', dur: 0.04, vol: 0.05 }); softT = T; }
  });
  window.addEventListener('keyup', (e) => {
    const k = ARROWS[e.key] || ARROW_CODES[e.keyCode];
    if (k) held[k] = null;
  });
  window.addEventListener('blur', releaseAll);
  function stepHeld() {
    const now = performance.now() / 1000;
    for (const k of ['left', 'right', 'down', 'up']) {
      // A key whose release went missing lets go once its repeats stop.
      if (held[k] && now - held[k].seen > 0.7) held[k] = null;
    }
    softHeld = !!held.down && state === 'play';
    if (state !== 'play') return;
    for (const k of ['left', 'right']) {
      const h = held[k];
      if (!h) continue;
      let guard = 0;
      while (now >= h.next && guard++ < 4) { h.next += ARR; if (!move(k === 'left' ? -1 : 1)) { h.next = now + ARR; break; } }
    }
  }

  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { if (k === 'ok' && !repeat) fresh(); return; }
    if (state === 'over') { if (k === 'ok' && !repeat && T - overT > 1.4) fresh(); return; }
    if (state === 'paused') { if (k === 'ok') resume(); return; }
    if (k === 'restart') { fresh(); return; }
    if (k === 'ok' && !repeat) hardDrop();
  });
  function pause() { if (state === 'play') { state = 'paused'; releaseAll(); } }
  function resume() { if (state === 'paused') { state = 'play'; sfx.pick(); } }
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ---------- Touch and mouse ----------
  const muteBox = () => ({ x: Kit.W - 62, y: 8, w: 54, h: 54 });
  let drag = null;
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (state === 'menu') { fresh(); return; }
      if (state === 'over') { if (T - overT > 1.4) fresh(); return; }
      if (state === 'paused') { resume(); return; }
      drag = { x: e.x, y: e.y, ax: e.x, ay: e.y, t: performance.now(), moved: false };
    },
    move(e) {
      if (!drag || state !== 'play') return;
      const step = L.cs * 0.9;
      while (e.x - drag.ax > step) { drag.ax += step; move(1); drag.moved = true; }
      while (drag.ax - e.x > step) { drag.ax -= step; move(-1); drag.moved = true; }
      while (e.y - drag.ay > step) { drag.ay += step; softStep(); drag.moved = true; }
    },
    up(e, cancel) {
      const d = drag; drag = null;
      if (!d || cancel || state !== 'play') return;
      const dt = performance.now() - d.t, dy = e.y - d.y, dx = e.x - d.x;
      if (dy > L.cs * 2.5 && dy / Math.max(1, dt) > 0.9 && Math.abs(dy) > Math.abs(dx)) hardDrop();
      else if (!d.moved && Math.hypot(dx, dy) < L.cs * 0.6) rotate();
    },
  });

  // ---------- Update ----------
  const deco = Array.from({ length: 9 }, () => ({ k: 0, x: 0, y: 0, v: 0, r: 0, vr: 0, s: 0 }));
  function resetDeco(p, anywhere) {
    p.k = Math.floor(Math.random() * 7); p.x = Math.random(); p.y = anywhere ? Math.random() * 1.2 - 0.1 : -0.15;
    p.v = 0.025 + Math.random() * 0.04; p.r = Math.random() * 6; p.vr = (Math.random() - 0.5) * 0.6; p.s = 0.55 + Math.random() * 0.6;
  }
  deco.forEach((p) => resetDeco(p, true));

  function update(dt) {
    T += dt;
    for (const p of deco) { p.y += p.v * dt; p.r += p.vr * dt; if (p.y > 1.15) resetDeco(p, false); }
    shown += (score - shown) * Math.min(1, dt * 9);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    rotK = Math.max(0, rotK - dt / 0.11);
    shownProg = lerp(shownProg, (lines % 10) / 10, Math.min(1, dt * 6));
    stepHeld();
    if (state === 'play') {
      if (clearing) {
        if (T - clearing.t >= CLEAR_T) finishClear();
      } else if (cur) {
        if (grounded()) {
          lockT += dt * (softHeld ? 2 : 1);
          fallAcc = 0;
          if (lockT >= LOCK_T) lock(false);
        } else {
          const g = softHeld ? Math.min(0.035, gravity(level)) : gravity(level);
          fallAcc += dt;
          let guard = 0;
          while (cur && fallAcc >= g && guard++ < 6) {
            fallAcc -= g;
            if (fits(cur.cells, cur.x, cur.y + 1)) { cur.y++; if (softHeld) addScore(1); } else break;
          }
        }
      }
    }
    if (cur) {
      view.x = lerp(view.x, cur.x, Math.min(1, dt * 28));
      view.y = lerp(view.y, cur.y, Math.min(1, dt * 22));
      if (Math.abs(view.x - cur.x) < 0.01) view.x = cur.x;
      if (Math.abs(view.y - cur.y) < 0.01) view.y = cur.y;
    }
    for (let i = trails.length - 1; i >= 0; i--) if (T - trails[i].t > 0.35) trails.splice(i, 1);
    for (let i = flashes.length - 1; i >= 0; i--) if (T - flashes[i].t > 0.25) flashes.splice(i, 1);
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(3,8,30,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function pieceBounds(cells) {
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const [x, y] of cells) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function drawMini(c, k, cx, cy, size, alpha = 1) {
    const cells = SHAPES[k][1], b = pieceBounds(cells);
    const s = jewel(COLORS[k], size);
    c.globalAlpha = alpha;
    for (const [x, y] of cells) c.drawImage(s, cx + (x - b.x0 - b.w / 2) * size, cy + (y - b.y0 - b.h / 2) * size, size, size);
    c.globalAlpha = 1;
  }
  const rowOffset = (y) => {
    const q = clamp((T - rowAnimT) / 0.2, 0, 1);
    return q >= 1 ? 0 : rowShift[y] * L.cs * (1 - ease.out(q));
  };

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, { cs, bx, by, bw, bh } = L;
    Kit.background(c, t, '#0b1d4a', '#03081a', 'rgba(60,170,255,0.10)');
    // Slow jewels drifting down behind everything.
    const da = state === 'menu' ? 0.28 : 0.1;
    for (const p of deco) {
      const size = cs * p.s, cells = SHAPES[p.k][1], b = pieceBounds(cells), s = jewel(COLORS[p.k], size);
      c.save(); c.globalAlpha = da;
      c.translate(p.x * W, p.y * H); c.rotate(p.r);
      for (const [x, y] of cells) c.drawImage(s, (x - b.x0 - b.w / 2) * size, (y - b.y0 - b.h / 2) * size, size, size);
      c.restore();
    }
    c.globalAlpha = 1;
    c.drawImage(frame, 0, 0, W, H);

    // The stack. On game over it turns grey in a sweep from the bottom.
    const gray = state === 'over' ? clamp((T - overT) / 0.9, 0, 1) : 0;
    const csr = Math.round(cs);
    for (let y = 0; y < ROWS; y++) {
      if (clearing && clearing.rows.has(y)) continue;
      const oy = rowOffset(y);
      const grey = gray > 0 && (ROWS - y) / ROWS <= gray;
      for (let x = 0; x < COLS; x++) {
        const v = board[y * COLS + x];
        if (!v) continue;
        c.drawImage(jewel(grey ? GRAY : COLORS[v - 1], csr), bx + x * cs, by + y * cs - oy, cs, cs);
      }
    }
    // Rows clearing: a white flash, the jewels shrink from the middle out, and a beam of light.
    if (clearing) {
      const q = clamp((T - clearing.t) / CLEAR_T, 0, 1);
      for (const y of clearing.rows) {
        for (let x = 0; x < COLS; x++) {
          const v = board[y * COLS + x];
          if (!v) continue;
          const delay = Math.abs(x - 4.5) / 4.5 * 0.35;
          const lq = clamp((q - delay) / 0.65, 0, 1);
          const k = 1 - ease.inOut(lq);
          if (k <= 0.02) continue;
          const d = cs * k;
          c.drawImage(jewel(COLORS[v - 1], csr), bx + x * cs + (cs - d) / 2, by + y * cs + (cs - d) / 2, d, d);
        }
        const beam = cs * (0.4 + q * 0.9);
        c.globalAlpha = Math.max(0, 0.85 * (1 - q));
        c.fillStyle = '#ffffff';
        c.fillRect(bx, by + (y + 0.5) * cs - beam / 2, bw, beam);
        c.globalAlpha = 1;
      }
    }

    // The piece: where it will land, its streaks, and the piece itself with a soft glow.
    c.save();
    c.beginPath(); c.rect(bx, by, bw, bh); c.clip();
    for (const tr of trails) {
      const a = 1 - (T - tr.t) / 0.35;
      const y0 = by + tr.y0 * cs, y1 = by + tr.y1 * cs;
      if (y1 - y0 < 2) continue;
      c.globalAlpha = Math.max(0, a);
      const w = cs * (0.5 + 0.4 * a);
      c.drawImage(trailSprite(tr.color), bx + (tr.x + 0.5) * cs - w / 2, y0, w, y1 - y0);
    }
    c.globalAlpha = 1;
    if (cur && state !== 'over') {
      const color = COLORS[cur.k];
      let gy = cur.y;
      while (fits(cur.cells, cur.x, gy + 1)) gy++;
      if (gy > cur.y) {
        const gs = ghostSprite(color, csr);
        c.globalAlpha = 0.75 + 0.25 * Math.sin(t * 5);
        for (const [x, y] of cur.cells) c.drawImage(gs, bx + (cur.x + x) * cs, by + (gy + y) * cs, cs, cs);
        c.globalAlpha = 1;
      }
      const nudgeX = T - nudgeT < 0.15 ? nudge * Math.sin((T - nudgeT) / 0.15 * Math.PI) * cs * 0.12 : 0;
      const ox = bx + view.x * cs + nudgeX, oy = by + view.y * cs;
      const ang = -rotK * rotK * Math.PI / 2;
      const pc = (cur.size * cs) / 2;
      c.save();
      c.translate(ox + pc, oy + pc); c.rotate(ang); c.translate(-pc, -pc);
      if (softHeld && T - softT > 0.08) {
        // Soft drop: short streaks above the falling piece.
        const ts = trailSprite(color);
        const tops = {};
        for (const [x, y] of cur.cells) if (tops[x] === undefined || y < tops[x]) tops[x] = y;
        c.globalAlpha = 0.6;
        for (const x in tops) c.drawImage(ts, (+x + 0.2) * cs, (tops[x] - 2.2) * cs, cs * 0.6, cs * 2.2);
        c.globalAlpha = 1;
      }
      c.globalCompositeOperation = 'lighter';
      const gl = glowSprite(color, csr);
      const pulse = 0.5 + 0.15 * Math.sin(t * 6);
      c.globalAlpha = pulse;
      for (const [x, y] of cur.cells) c.drawImage(gl, (x - 0.5) * cs, (y - 0.5) * cs, cs * 2, cs * 2);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      const js = jewel(color, csr);
      // A piece about to lock blinks brighter.
      const locking = grounded() ? lockT / LOCK_T : 0;
      for (const [x, y] of cur.cells) c.drawImage(js, x * cs, y * cs, cs, cs);
      if (locking > 0.3) {
        c.globalAlpha = (locking - 0.3) * 0.45 * (0.6 + 0.4 * Math.sin(t * 30));
        c.fillStyle = '#fff';
        for (const [x, y] of cur.cells) { roundRect(c, x * cs + cs * 0.06, y * cs + cs * 0.06, cs * 0.88, cs * 0.88, cs * 0.16); c.fill(); }
        c.globalAlpha = 1;
      }
      c.restore();
    }
    // Just landed: a quick white flash on its jewels.
    for (const f of flashes) {
      const a = 1 - (T - f.t) / 0.25;
      c.globalAlpha = Math.max(0, a * 0.75);
      c.fillStyle = '#fff';
      roundRect(c, bx + f.x * cs + cs * 0.05, by + f.y * cs + cs * 0.05, cs * 0.9, cs * 0.9, cs * 0.16); c.fill();
    }
    c.globalAlpha = 1;
    c.restore();

    // Danger: the stack is near the top.
    let high = false;
    for (let i = 0; i < COLS * 4; i++) if (board[i]) { high = true; break; }
    if (high && state === 'play') {
      const pad = cs * 0.3;
      c.globalAlpha = 0.45 + 0.35 * Math.sin(t * 8);
      c.lineWidth = Math.max(3, cs * 0.12); c.strokeStyle = '#ff4d6d';
      roundRect(c, bx - pad, by - pad, bw + pad * 2, bh + pad * 2, cs * 0.45); c.stroke();
      c.globalAlpha = 1;
    }

    drawSide(c, t);

    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (state === 'paused') {
      c.fillStyle = 'rgba(3,8,26,0.65)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.42, cs * 2, '#ffffff', '#9fdcff');
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'OK or an arrow to carry on  ·  Back for games', W / 2, H * 0.56, cs * 0.75, 'rgba(255,255,255,0.88)', 700);
    }
    if (state === 'over') drawOver(c, t);
  }

  function drawSide(c, t) {
    const cs = L.cs, accent = ACCENTS[(level - 1) % ACCENTS.length];
    const S = L.score, V = L.level, N = L.next;
    const labelSize = cs * 0.58, labelColor = 'rgba(200,225,255,0.7)';
    // Score
    if (L.wide) {
      text(c, 'SCORE', S.x + S.w / 2, S.y + cs * 0.95, labelSize, labelColor, 800);
      c.save();
      c.translate(S.x + S.w / 2, S.y + cs * 2.35); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
      const n = String(Math.round(shown));
      outlined(c, n, 0, 0, Math.min(cs * 1.45, (S.w * 0.9) / Math.max(4, n.length) * 1.75), '#fff6c2', '#ffb703');
      c.restore();
      text(c, `👑 ${best}`, S.x + S.w / 2, S.y + cs * 3.75, cs * 0.66, newBest ? '#ffd23f' : 'rgba(255,255,255,0.85)', 800);
    } else {
      text(c, 'SCORE', S.x + cs * 0.6, S.y + S.h * 0.3, labelSize, labelColor, 800, 'left');
      c.save();
      c.translate(S.x + cs * 0.6, S.y + S.h * 0.66);
      outlined(c, String(Math.round(shown)), 0, 0, S.h * 0.42, '#fff6c2', '#ffb703', 'left');
      c.restore();
      text(c, `👑 ${best}`, S.x + S.w - cs * 0.6, S.y + S.h * 0.5, S.h * 0.26, 'rgba(255,255,255,0.85)', 800, 'right');
    }
    // Level and lines
    text(c, 'LEVEL', V.x + V.w / 2, V.y + cs * 0.95, labelSize, labelColor, 800);
    const lp = clamp((T - levelT) / 0.5, 0, 1), ls = lp < 1 ? 1 + Math.sin(lp * Math.PI) * 0.35 : 1;
    c.save(); c.translate(V.x + V.w / 2, V.y + cs * 2.2); c.scale(ls, ls);
    outlined(c, String(level), 0, 0, cs * 1.35, '#ffffff', accent);
    c.restore();
    const pw = V.w - cs * 1.2, px = V.x + cs * 0.6, py = V.y + cs * 3.2, ph = cs * 0.32;
    roundRect(c, px, py, pw, ph, ph / 2); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    if (shownProg > 0.01) { roundRect(c, px, py, Math.max(ph, pw * shownProg), ph, ph / 2); c.fillStyle = accent; c.fill(); }
    text(c, `${lines} lines`, V.x + V.w / 2, V.y + cs * 4.0, cs * 0.55, 'rgba(255,255,255,0.8)', 700);

    // Next three
    text(c, 'NEXT', N.x + N.w / 2, N.y + cs * 0.95, labelSize, labelColor, 800);
    if (queue.length) {
      const big = Math.min(cs * 0.95, N.w / 5);
      const sizes = [big, big * 0.72, big * 0.72];
      const ys = L.wide ? [N.y + cs * 3.3, N.y + cs * 6.7, N.y + cs * 9.3] : [N.y + cs * 3.1, N.y + cs * 5.8, N.y + cs * 8.0];
      queue.forEach((k, i) => {
        drawMini(c, k, N.x + N.w / 2, ys[i], sizes[i], i === 0 ? 1 : 0.85);
      });
      c.fillStyle = 'rgba(150,200,255,0.15)';
      c.fillRect(N.x + cs * 0.8, N.y + (L.wide ? cs * 5.1 : cs * 4.55), N.w - cs * 1.6, 2);
    }
    if (combo >= 2 && state === 'play') {
      text(c, `🔥 Combo ×${combo}`, L.combo.x, L.combo.y, cs * 0.75, '#ff8de3', 900);
    }
    // Controls, as little key caps.
    if (L.hints && state !== 'menu') {
      const tips = Kit.touchFirst() ? [['drag', 'Move'], ['tap', 'Rotate'], ['flick ▼', 'Drop']]
        : [['◀ ▶', 'Move'], ['▲', 'Rotate'], ['▼', 'Soft drop'], ['OK', 'Hard drop']];
      const H0 = L.hints;
      tips.forEach(([key, what], i) => {
        const y = H0.y + i * cs * 1.05, kw = cs * 2.1, kh = cs * 0.8;
        roundRect(c, H0.x + cs * 0.3, y, kw, kh, kh * 0.3);
        c.fillStyle = 'rgba(150,200,255,0.16)'; c.fill();
        c.lineWidth = 1.5; c.strokeStyle = 'rgba(150,200,255,0.35)'; c.stroke();
        text(c, key, H0.x + cs * 0.3 + kw / 2, y + kh / 2 + 1, cs * 0.46, '#ffffff', 800);
        text(c, what, H0.x + cs * 0.3 + kw + cs * 0.4, y + kh / 2, cs * 0.58, 'rgba(255,255,255,0.8)', 700, 'left');
      });
    }
  }

  function panelBox(c, w, h, r, border) {
    roundRect(c, -w / 2, -h / 2, w, h, r);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#1d3f8f'); g.addColorStop(1, '#0a1840');
    c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = border; c.stroke();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    c.fillStyle = 'rgba(3,8,26,0.55)'; c.fillRect(0, 0, W, H);
    const a = clamp(T / 0.5, 0, 1), k = ease.back(a);
    const pw = Math.min(W * 0.9, cs * 19), ph = Math.min(H * 0.8, cs * 15);
    c.save();
    c.translate(W / 2, H / 2); c.scale(k, k);
    panelBox(c, pw, ph, cs * 0.8, '#22e0ff');
    // A row of jewels bobbing above the title.
    const n = 7, js = Math.min(cs * 1.1, pw / 10);
    for (let i = 0; i < n; i++) {
      const y = -ph * 0.36 + Math.sin(t * 3 + i * 0.7) * js * 0.15;
      c.drawImage(jewel(COLORS[i], Math.round(js)), (i - n / 2) * js * 1.15 + js * 0.075, y - js / 2, js, js);
    }
    const ts = Math.min(cs * 2.3, pw / 6.2);
    outlined(c, 'BLOCK DROP', 0, -ph * 0.17, ts, '#e8fbff', '#22a8ff');
    text(c, best > 0 ? `👑 Best ${best}` : 'Stack the jewels, clear the lines', 0, -ph * 0.02, cs * 0.8, best > 0 ? '#ffd23f' : 'rgba(255,255,255,0.85)', 800);
    const pulse = 1 + Math.sin(t * 5) * 0.04;
    const bw = Math.min(pw * 0.6, cs * 9), bh = cs * 1.6;
    c.save(); c.translate(0, ph * 0.15); c.scale(pulse, pulse);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const bg = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bg.addColorStop(0, '#ffe066'); bg.addColorStop(1, '#ff9f1c');
    c.fillStyle = bg; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#fff3c4'; c.stroke();
    text(c, Kit.touchFirst() ? 'Tap to play' : 'OK  Play', 0, 2, cs * 0.85, '#3a1c00', 900);
    c.restore();
    const tips = Kit.touchFirst() ? 'Drag to move  ·  tap to rotate  ·  flick down to drop'
      : '◀ ▶ move  ·  ▲ rotate  ·  ▼ soft drop  ·  OK hard drop';
    text(c, tips, 0, ph * 0.33, Math.min(cs * 0.66, pw / 30), 'rgba(255,255,255,0.85)', 700);
    text(c, 'Clear 4 rows at once for a TETRA!', 0, ph * 0.42, Math.min(cs * 0.58, pw / 30), 'rgba(160,220,255,0.75)', 600);
    c.restore();
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    const a = clamp((T - overT - 0.9) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(3,8,26,${0.7 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.9, cs * 15), ph = Math.min(H * 0.85, cs * 13);
    panelBox(c, pw, ph, cs * 0.8, '#ffd23f');
    outlined(c, 'Topped out!', 0, -ph * 0.34, Math.min(cs * 1.5, pw / 7), '#ffffff', '#9fdcff');
    outlined(c, String(score), 0, -ph * 0.1, Math.min(cs * 2.2, pw / 6), '#fff6c2', '#ffb703');
    text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.08, cs * 0.75, newBest ? '#ffd23f' : '#ffffff', 800);
    text(c, `Level ${level}  ·  ${lines} lines`, 0, ph * 0.2, cs * 0.65, 'rgba(255,255,255,0.78)', 700);
    const ready = T - overT > 1.4;
    c.globalAlpha = ready ? 1 : 0.4;
    const bw = Math.min(pw * 0.7, cs * 10), bh = cs * 1.4;
    const pulse = ready ? 1 + Math.sin(t * 5) * 0.04 : 1;
    c.save(); c.translate(0, ph * 0.36); c.scale(pulse, pulse);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const bg = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bg.addColorStop(0, '#ffe066'); bg.addColorStop(1, '#ff9f1c');
    c.fillStyle = bg; c.fill();
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  Play again', 0, 2, cs * 0.75, '#3a1c00', 900);
    c.restore();
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  queue = [fromBag(), fromBag(), fromBag()];
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (best > 0) Kit.record('blockdrop', best);
})();
