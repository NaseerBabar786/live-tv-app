// 2048 Merge: slide every tile on the 4×4 board at once; two equal tiles that meet join into one worth
// double. Join several in one slide for a combo. Make a 2048 tile to win, then keep going for more.
// No free square and no pair to join: game over. Remote: arrows slide, OK opens the menu (Undo / New
// game). Keyboard: arrows or WASD, U undo, R new game, M mute. Touch: swipe; tap the chips.
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, tone, noise } = Kit;
  const N = 4;
  const SLIDE = 0.11; // seconds a tile takes to slide
  const FONT = '"Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';
  const COLORS = {
    2: '#5ec8ff', 4: '#3f8cff', 8: '#7b61ff', 16: '#b84dff', 32: '#ff4fb8', 64: '#ff4d6d',
    128: '#ff7a3d', 256: '#ffab1f', 512: '#c9dc2a', 1024: '#2fd88f', 2048: '#ffcf1f',
    4096: '#1fd6d6', 8192: '#ff5ef0', 16384: '#8c7bff', 32768: '#ff9b5e',
  };
  const colorOf = (v) => COLORS[v] || '#f2f2ff';
  const WORDS = ['', '', 'Double!', 'Triple!', 'Quad!!'];
  const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0];

  // ---------- State ----------
  // state: 'play', 'menu' (the OK menu), 'win' (made 2048), 'over' (no moves left)
  let T = 0;
  let tiles = [];       // live tiles: { id, v, r, c, fr, fc, t0, appear, kind, fx }
  let ghosts = [];      // tiles sliding into a merge, gone once they arrive
  let cells;            // [r*N+c] -> tile or null
  let score = 0, shown = 0, bump = 0, best = Kit.store.get('merge2048.best', 0);
  let keepGoing = false, moves = 0, undoSnap = null, newBest = false;
  let state = 'play', stateT = 0, sel = 0, menuItems = [];
  let nudge = { dx: 0, dy: 0, t: -9 }, introT = 0, firstGame = false;
  let nextId = 1;

  function tile(v, r, c, appear, kind) {
    return { id: nextId++, v, r, c, fr: r, fc: c, t0: T, appear, kind, fx: kind !== 'merge' };
  }
  function emptyCells() { const out = []; for (let i = 0; i < N * N; i++) if (!cells[i]) out.push(i); return out; }
  function spawn(at) {
    const free = emptyCells();
    if (!free.length) return;
    const i = free[Math.floor(Math.random() * free.length)];
    const t = tile(Math.random() < 0.1 ? 4 : 2, Math.floor(i / N), i % N, at, 'spawn');
    cells[i] = t; tiles.push(t);
  }
  function values() { return cells.map((t) => (t ? t.v : 0)); }
  function load(vals, cascade) {
    cells = Array(N * N).fill(null); tiles = []; ghosts = [];
    vals.forEach((v, i) => {
      if (!v) return;
      const t = tile(v, Math.floor(i / N), i % N, T + (cascade ? 0.05 + i * 0.025 : 0), 'spawn');
      cells[i] = t; tiles.push(t);
    });
  }
  function save() {
    if (state === 'over') { Kit.store.set('merge2048.game', null); return; }
    Kit.store.set('merge2048.game', { cells: values(), score, keepGoing, moves, undo: undoSnap });
  }
  function newGame() {
    cells = Array(N * N).fill(null); tiles = []; ghosts = [];
    score = 0; shown = 0; keepGoing = false; moves = 0; undoSnap = null; newBest = false;
    state = 'play'; stateT = T;
    spawn(T + 0.05); spawn(T + 0.15);
    save();
  }

  // ---------- Layout ----------
  let L = {};
  function layout(W, H) {
    const wide = W / H > 1.1;
    let B, bx, by;
    if (wide) {
      B = Math.min(H * 0.8, W * 0.46);
      bx = (W - B) / 2; by = (H - B) / 2 + H * 0.035;
    } else {
      B = Math.min(W * 0.92, H * 0.56);
      bx = (W - B) / 2; by = H * 0.24;
    }
    const pad = B * 0.032, gap = B * 0.028;
    const ts = (B - pad * 2 - gap * (N - 1)) / N;
    L = { wide, B, bx, by, pad, gap, ts, u: wide ? Math.min(B / 15, W / 34) : Math.min(W / 17, H / 30) };
    sprites.clear(); boardPic = null;
  }
  Kit.onResize(layout);
  const cellX = (c) => L.bx + L.pad + c * (L.ts + L.gap);
  const cellY = (r) => L.by + L.pad + r * (L.ts + L.gap);

  // ---------- Sprites: each tile drawn once per size (gradients are slow on TV boxes) ----------
  const sprites = new Map();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function numFont(v, s) {
    const d = String(v).length;
    return `900 ${Math.round(s * (d <= 2 ? 0.5 : d === 3 ? 0.4 : d === 4 ? 0.32 : 0.26))}px ${FONT}`;
  }
  // Margin round the tile so the glow and the lip fit in the picture.
  const MARGIN = 0.34;
  function tileSprite(v, size) {
    const key = 't' + v + '|' + Math.round(size);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = DPR(), m = size * MARGIN, full = size + m * 2;
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(full * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr); c.translate(m, m);
    const col = colorOf(v), r = size * 0.2, lip = size * 0.07;
    // Big tiles shine: a soft halo baked in here (never per frame).
    if (v >= 128) {
      c.save();
      c.shadowColor = col; c.shadowBlur = size * (v >= 2048 ? 0.22 : 0.15);
      roundRect(c, 0, 0, size, size, r); c.fillStyle = col; c.fill();
      c.restore();
    }
    // Lip: the darker underside that makes it chunky.
    roundRect(c, 0, lip, size, size - lip, r);
    c.fillStyle = shade(col, -0.45); c.fill();
    // Face.
    roundRect(c, 0, 0, size, size - lip, r);
    const g = c.createLinearGradient(0, 0, 0, size - lip);
    g.addColorStop(0, shade(col, 0.35)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.18));
    c.fillStyle = g; c.fill();
    c.lineWidth = size * 0.025; c.strokeStyle = shade(col, 0.5); c.stroke();
    // Gloss on the top half and a sparkle.
    roundRect(c, size * 0.08, size * 0.06, size * 0.84, size * 0.36, r * 0.7);
    const hg = c.createLinearGradient(0, size * 0.06, 0, size * 0.42);
    hg.addColorStop(0, 'rgba(255,255,255,0.6)'); hg.addColorStop(1, 'rgba(255,255,255,0.02)');
    c.fillStyle = hg; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.ellipse(size * 0.2, size * 0.17, size * 0.06, size * 0.035, -0.5, 0, Math.PI * 2); c.fill();
    // The number: a dark drop, an outline and a bright fill.
    c.font = numFont(v, size); c.textAlign = 'center'; c.textBaseline = 'middle';
    const cy = (size - lip) / 2 + size * 0.02;
    const dark = shade(col, -0.62);
    c.lineJoin = 'round'; c.lineWidth = size * 0.07; c.strokeStyle = dark;
    c.fillStyle = dark; c.fillText(v, size / 2, cy + size * 0.035);
    c.strokeText(v, size / 2, cy);
    const tg = c.createLinearGradient(0, cy - size * 0.2, 0, cy + size * 0.2);
    tg.addColorStop(0, '#ffffff'); tg.addColorStop(1, v === 2048 ? '#fff1b0' : shade(col, 0.7));
    c.fillStyle = tg; c.fillText(v, size / 2, cy);
    sprites.set(key, s);
    return s;
  }
  function glowSprite(v, size) {
    const key = 'g' + v + '|' + Math.round(size);
    let s = sprites.get(key);
    if (s) return s;
    const full = size * 2;
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(full);
    const c = s.getContext('2d');
    const g = c.createRadialGradient(full / 2, full / 2, size * 0.3, full / 2, full / 2, full / 2);
    g.addColorStop(0, Kit.rgba(colorOf(v), 0.55)); g.addColorStop(1, Kit.rgba(colorOf(v), 0));
    c.fillStyle = g; c.fillRect(0, 0, full, full);
    sprites.set(key, s);
    return s;
  }
  function drawTile(c, v, cx, cy, size, scale = 1, alpha = 1) {
    const s = tileSprite(v, size);
    const d = size * (1 + MARGIN * 2) * scale;
    c.globalAlpha = alpha;
    c.drawImage(s, cx - d / 2, cy - d / 2, d, d);
    c.globalAlpha = 1;
  }
  let boardPic = null;
  function board() {
    if (boardPic) return boardPic;
    const dpr = DPR(), { B, ts } = L, m = B * 0.06;
    boardPic = document.createElement('canvas');
    boardPic.width = boardPic.height = Math.ceil((B + m * 2) * dpr);
    const c = boardPic.getContext('2d');
    c.scale(dpr, dpr); c.translate(m, m);
    const r = B * 0.06;
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = m * 0.8; c.shadowOffsetY = m * 0.25;
    roundRect(c, 0, 0, B, B, r); c.fillStyle = '#0a1838'; c.fill(); c.restore();
    roundRect(c, 0, 0, B, B, r);
    const g = c.createLinearGradient(0, 0, 0, B);
    g.addColorStop(0, '#1a3466'); g.addColorStop(1, '#0b1a3d');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(120,200,255,0.45)'; c.stroke();
    roundRect(c, 4, 4, B - 8, B - 8, r - 3);
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.08)'; c.stroke();
    for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
      const x = L.pad + cc * (ts + L.gap), y = L.pad + rr * (ts + L.gap);
      roundRect(c, x, y, ts, ts, ts * 0.2);
      const wg = c.createLinearGradient(0, y, 0, y + ts);
      wg.addColorStop(0, 'rgba(0,8,30,0.55)'); wg.addColorStop(1, 'rgba(40,80,150,0.25)');
      c.fillStyle = wg; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(140,200,255,0.12)'; c.stroke();
    }
    boardPic.m = m;
    return boardPic;
  }

  // ---------- Sounds ----------
  function noteFor(v) {
    const i = Math.max(0, Math.log2(v) - 1);
    return PENTA[i % 5] * Math.pow(2, Math.floor(i / 5));
  }
  const snd = {
    slide: () => { noise({ dur: 0.1, vol: 0.05, freq: 700, q: 0.9, sweep: 2.6 }); },
    merge: (v, at) => {
      const f = noteFor(v);
      tone(f, { type: 'triangle', dur: 0.22, vol: 0.2, at });
      tone(f * 2, { type: 'sine', dur: 0.14, vol: 0.07, at });
      tone(f * 0.5, { type: 'sine', dur: 0.12, vol: 0.12, at, slide: 1.6 });
      noise({ dur: 0.05, vol: 0.06, freq: 3500, q: 0.8, at });
    },
    spawn: (at) => tone(1400, { type: 'sine', dur: 0.05, vol: 0.035, at }),
    combo: (n, at) => { for (let i = 0; i < n + 1; i++) tone(PENTA[(i + 2) % 5] * 4, { type: 'sine', dur: 0.18, vol: 0.07, at: at + 0.06 + i * 0.05 }); },
    undo: () => { tone(700, { type: 'triangle', dur: 0.16, vol: 0.12, slide: 0.5 }); noise({ dur: 0.12, vol: 0.04, freq: 1500, sweep: 0.4 }); },
  };

  // ---------- Moves ----------
  const VEC = { left: [0, -1], right: [0, 1], up: [-1, 0], down: [1, 0] };
  function lineOf(dir, k) {
    // The cells of row/column k, starting at the edge the tiles slide toward.
    const out = [];
    for (let j = 0; j < N; j++) {
      if (dir === 'left') out.push(k * N + j);
      else if (dir === 'right') out.push(k * N + (N - 1 - j));
      else if (dir === 'up') out.push(j * N + k);
      else out.push((N - 1 - j) * N + k);
    }
    return out;
  }
  function settle() {
    // Finish any slide still running, so a quick second press acts on the real board.
    for (const t of tiles) { t.fr = t.r; t.fc = t.c; }
    ghosts = [];
  }
  function canMove() {
    for (let i = 0; i < N * N; i++) {
      if (!cells[i]) return true;
      if (i % N < N - 1 && cells[i + 1] && cells[i + 1].v === cells[i].v) return true;
      if (i < N * (N - 1) && cells[i + N] && cells[i + N].v === cells[i].v) return true;
    }
    return false;
  }
  function move(dir) {
    settle();
    const snap = { cells: values(), score, keepGoing, moves };
    const next = Array(N * N).fill(null);
    const merges = [];
    let moved = false, gained = 0;
    for (let k = 0; k < N; k++) {
      const line = lineOf(dir, k);
      const out = [];
      for (const idx of line) {
        const t = cells[idx];
        if (!t) continue;
        const last = out[out.length - 1];
        if (last && !last.other && last.tile.v === t.v) last.other = t; else out.push({ tile: t });
      }
      out.forEach((o, j) => {
        const dest = line[j], r = Math.floor(dest / N), c = dest % N;
        const t = o.tile;
        if (t.r !== r || t.c !== c || o.other) moved = true;
        if (o.other) {
          for (const g of [t, o.other]) { g.fr = g.r; g.fc = g.c; g.r = r; g.c = c; g.t0 = T; ghosts.push(g); }
          const m = tile(t.v * 2, r, c, T + SLIDE, 'merge');
          next[dest] = m; merges.push(m); gained += m.v;
        } else {
          t.fr = t.r; t.fc = t.c; t.r = r; t.c = c; t.t0 = T;
          next[dest] = t;
        }
      });
    }
    if (!moved) {
      // Nothing can slide that way: the board nudges and bounces back.
      nudge = { dx: VEC[dir][1], dy: VEC[dir][0], t: T };
      Kit.sfx.nope();
      return;
    }
    const gone = new Set(ghosts.map((g) => g.id));
    tiles = tiles.filter((t) => !gone.has(t.id)).concat(merges);
    cells = next;
    undoSnap = snap;
    moves++;
    snd.slide();
    spawn(T + SLIDE + 0.06);
    snd.spawn(SLIDE + 0.06);

    if (merges.length) {
      const top = Math.max(...merges.map((m) => m.v));
      snd.merge(top, SLIDE * 0.8);
      if (merges.length >= 2) {
        snd.combo(merges.length, SLIDE);
        const word = WORDS[Math.min(merges.length, 4)] || 'Quad!!';
        float(word, L.bx + L.B / 2, L.by + L.B * 0.46, { color: ['#5ec8ff', '#ff4fb8', '#ffab1f'][Math.min(merges.length, 4) - 2], size: L.B * 0.11, life: 1.1, big: true, delay: SLIDE });
        float(`Combo ×${merges.length}`, L.bx + L.B / 2, L.by + L.B * 0.58, { color: '#ffd23f', size: L.B * 0.06, life: 1.1, big: true, delay: SLIDE });
      }
      if (top >= 128) Kit.shake(top >= 1024 ? 9 : top >= 512 ? 6 : 3, 0.25);
      score += gained; bump = 1;
      if (score > best) {
        if (!newBest && best > 0) {
          newBest = true;
          setTimeout(() => float('New best!', L.bestX, L.bestY, { color: '#ffd23f', size: L.u * 0.9, life: 1.6, big: true }), 200);
        }
        best = score; Kit.store.set('merge2048.best', best); Kit.record('merge2048', best);
      }
      if (!keepGoing && merges.some((m) => m.v === 2048)) {
        state = 'win'; stateT = T + SLIDE + 1.5; sel = 0;
        setTimeout(() => { Kit.sfx.win(); Kit.confetti(170); Kit.shake(12, 0.4); float('2048!', L.bx + L.B / 2, L.by + L.B * 0.45, { color: '#ffcf1f', size: L.B * 0.2, life: 1.6, big: true }); }, SLIDE * 1000 + 80);
        save();
        return;
      }
    }
    if (!canMove()) {
      state = 'over'; stateT = T + SLIDE + 0.7; sel = 0;
      Kit.record('merge2048', best);
      setTimeout(() => Kit.sfx.over(), 650);
    }
    save();
  }
  function undo() {
    if (!undoSnap) { Kit.sfx.nope(); return; }
    const s = undoSnap;
    undoSnap = null;
    load(s.cells, false);
    for (const t of tiles) t.appear = T - 1;
    score = s.score; shown = Math.min(shown, score); keepGoing = s.keepGoing; moves = s.moves;
    state = 'play'; stateT = T;
    snd.undo();
    float('Undo', L.bx + L.B / 2, L.by + L.B * 0.5, { color: '#9fe3ff', size: L.B * 0.08, life: 0.8 });
    save();
  }

  // ---------- Menus: the OK menu, the 2048 panel and game over ----------
  function itemsFor(st) {
    if (st === 'menu') return [
      { label: 'Keep playing', icon: '▶', act: () => { state = 'play'; } },
      { label: 'Undo move', icon: '↶', act: undo, off: !undoSnap },
      { label: 'New game', icon: '✦', act: () => { newGame(); Kit.sfx.pick(); } },
    ];
    if (st === 'win') return [
      { label: 'Keep going', icon: '▶', act: () => { keepGoing = true; state = canMove() ? 'play' : 'over'; stateT = T; save(); Kit.sfx.pick(); } },
      { label: 'New game', icon: '✦', act: () => { newGame(); Kit.sfx.pick(); } },
    ];
    if (st === 'over') return [
      { label: 'Play again', icon: '✦', act: () => { newGame(); Kit.sfx.pick(); } },
      { label: 'Undo last move', icon: '↶', act: undo, off: !undoSnap },
    ];
    return [];
  }
  const panelReady = () => T > stateT + (state === 'menu' ? 0 : 0.45);
  function openMenu() { state = 'menu'; stateT = T; sel = 0; Kit.sfx.move(); }
  function step(d) {
    const items = itemsFor(state);
    for (let k = 1; k <= items.length; k++) {
      const i = (sel + d * k + items.length * 4) % items.length;
      if (!items[i].off) { if (i !== sel) Kit.sfx.move(); sel = i; return; }
    }
  }

  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    introT = Math.max(introT, 99);
    if (state === 'play') {
      if (VEC[k]) { if (!repeat) move(k); return; }
      if (k === 'ok') { if (!repeat) openMenu(); return; }
      if (k === 'undo') { undo(); return; }
      if (k === 'restart') { newGame(); Kit.sfx.pick(); }
      return;
    }
    if (!panelReady() || repeat) return;
    if (k === 'up' || k === 'left') step(-1);
    else if (k === 'down' || k === 'right') step(1);
    else if (k === 'ok') { const it = itemsFor(state)[sel]; if (it && !it.off) it.act(); }
    else if (k === 'undo' && state !== 'win') undo();
    else if (k === 'restart') { newGame(); Kit.sfx.pick(); }
  });

  // ---------- Touch and mouse ----------
  let swipe = null;
  const muteBox = () => ({ x: Kit.W - 62, y: 8, w: 52, h: 52 });
  const inside = (e, b) => b && e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state !== 'play') {
        if (!panelReady()) return;
        const i = (L.buttons || []).findIndex((b) => inside(e, b));
        const items = itemsFor(state);
        if (i >= 0 && items[i] && !items[i].off) { sel = i; items[i].act(); }
        else if (state === 'menu' && !inside(e, L.panel)) state = 'play';
        return;
      }
      if (inside(e, L.undoChip)) { undo(); return; }
      if (inside(e, L.menuChip)) { openMenu(); return; }
      swipe = { x: e.x, y: e.y, done: false };
    },
    move(e) {
      if (!swipe || swipe.done) return;
      const dx = e.x - swipe.x, dy = e.y - swipe.y;
      if (Math.hypot(dx, dy) < 30) return;
      swipe.done = true;
      introT = Math.max(introT, 99);
      move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
    },
    up() { swipe = null; },
  });

  // Floating words drawn by the game itself (under the menus, unlike Kit.float which is on top of all).
  const floats = [];
  function float(text, x, y, { color = '#fff', size = 34, life = 1.1, big = false, delay = 0 } = {}) {
    floats.push({ text, x, y, color, size, life: -delay, max: life, big });
  }
  function drawFloats(c) {
    for (const f of floats) {
      if (f.life < 0) continue;
      const k = f.life / f.max;
      const pop = f.big ? ease.elastic(Math.min(1, f.life / 0.5)) : ease.back(Math.min(1, f.life / 0.25));
      c.save();
      c.globalAlpha = Math.max(0, k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3);
      c.translate(f.x, f.y - (f.big ? 0 : k * L.ts * 0.5));
      c.scale(pop, pop);
      outlined(c, f.text, 0, 0, f.size, '#ffffff', f.color);
      c.restore();
    }
  }

  // ---------- Update ----------
  function update(dt) {
    T += dt; introT += dt;
    for (let i = floats.length - 1; i >= 0; i--) if ((floats[i].life += dt) > floats[i].max) floats.splice(i, 1);
    shown += (score - shown) * Math.min(1, dt * 9);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3.5);
    if (ghosts.length && T > ghosts[0].t0 + SLIDE) ghosts = ghosts.filter((g) => T <= g.t0 + SLIDE);
    for (const t of tiles) {
      if (t.fx || T < t.appear) continue;
      t.fx = true;
      const cx = cellX(t.c) + L.ts / 2, cy = cellY(t.r) + L.ts / 2;
      const col = colorOf(t.v);
      Kit.burst(cx, cy, col, t.v >= 256 ? 16 : 9, t.v >= 256 ? 1.1 : 0.75);
      Kit.burst(cx, cy, '#ffffff', 4, 0.6);
      float(`+${t.v}`, cx, cy - L.ts * 0.2, { color: col, size: L.ts * 0.3, life: 0.9 });
    }
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(4,10,34,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function card(c, x, y, w, h, r, border, top = '#1f4a8c', bottom = '#0d2253') {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = border; c.stroke();
  }
  const biggest = () => tiles.reduce((m, t) => Math.max(m, t.v), 0);

  function drawTiles(c) {
    const { ts } = L;
    const k = T - nudge.t;
    const nx = k < 0.22 ? Math.sin(k / 0.22 * Math.PI) * ts * 0.08 * nudge.dx : 0;
    const ny = k < 0.22 ? Math.sin(k / 0.22 * Math.PI) * ts * 0.08 * nudge.dy : 0;
    const pos = (t) => {
      const p = ease.out(clamp((T - t.t0) / SLIDE, 0, 1));
      return { x: lerp(cellX(t.fc), cellX(t.c), p) + ts / 2 + nx, y: lerp(cellY(t.fr), cellY(t.r), p) + ts / 2 + ny };
    };
    // Glow behind the big ones, pulsing.
    for (const t of tiles) {
      if (t.v < 256 || T < t.appear) continue;
      const p = pos(t);
      c.globalAlpha = 0.35 + Math.sin(T * 3 + t.id) * 0.15;
      const g = glowSprite(t.v, ts);
      c.drawImage(g, p.x - ts, p.y - ts, ts * 2, ts * 2);
    }
    c.globalAlpha = 1;
    for (const g of ghosts) { const p = pos(g); drawTile(c, g.v, p.x, p.y, ts); }
    // Sliding tiles first, then the ones popping in on top.
    for (const pass of [0, 1]) {
      for (const t of tiles) {
        if (T < t.appear) continue;
        const age = T - t.appear;
        const popping = age < 0.25 && t.kind !== 'still';
        if ((pass === 1) !== popping) continue;
        const p = pos(t);
        let s = 1;
        if (t.kind === 'merge' && age < 0.22) s = 1 + Math.sin(age / 0.22 * Math.PI) * 0.22;
        else if (t.kind === 'spawn' && age < 0.22) s = Math.max(0.01, ease.back(age / 0.22));
        drawTile(c, t.v, p.x, p.y, ts, s);
        if (t.kind === 'merge' && age < 0.18) {
          c.globalAlpha = 0.6 * (1 - age / 0.18);
          c.fillStyle = '#ffffff';
          roundRect(c, p.x - ts * s / 2, p.y - ts * s / 2, ts * s, ts * s * 0.93, ts * 0.2); c.fill();
          c.globalAlpha = 1;
        }
      }
    }
  }

  function drawScore(c, x, y, w, h) {
    const u = L.u;
    card(c, x, y, w, h, u * 0.5, 'rgba(120,200,255,0.4)');
    text(c, 'SCORE', x + w / 2, y + h * 0.25, u * 0.55, 'rgba(180,220,255,0.85)', 800);
    c.save();
    c.translate(x + w / 2, y + h * 0.63); c.scale(1 + bump * 0.18, 1 + bump * 0.18);
    outlined(c, String(Math.round(shown)), 0, 0, Math.min(u * 1.35, w / Math.max(3, String(Math.round(shown)).length) * 1.4), '#ffffff', '#9fe3ff');
    c.restore();
    L.scoreX = x + w / 2; L.scoreY = y + h * 0.6;
  }
  function drawBest(c, x, y, w, h) {
    const u = L.u;
    card(c, x, y, w, h, u * 0.5, 'rgba(255,210,63,0.45)', '#4a3a12', '#231a06');
    text(c, '👑 BEST', x + w / 2, y + h * 0.25, u * 0.55, '#ffd76a', 800);
    L.bestX = x + w / 2; L.bestY = L.wide ? y + h + L.u * 0.9 : y + h * 0.5;
    outlined(c, String(best), x + w / 2, y + h * 0.63, Math.min(u * 1.2, w / Math.max(3, String(best).length) * 1.4), '#fff6c2', '#ffb703');
  }
  function chip(c, x, y, w, h, keyLabel, label, on, t) {
    const u = L.u;
    roundRect(c, x, y, w, h, h / 2);
    c.fillStyle = on ? 'rgba(90,170,255,0.22)' : 'rgba(255,255,255,0.06)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = on ? 'rgba(140,210,255,0.7)' : 'rgba(255,255,255,0.15)'; c.stroke();
    const kw = h * 0.95;
    if (keyLabel) {
      roundRect(c, x + h * 0.12, y + h * 0.12, kw, h * 0.76, h * 0.3);
      c.fillStyle = on ? '#e9f6ff' : 'rgba(255,255,255,0.3)'; c.fill();
      text(c, keyLabel, x + h * 0.12 + kw / 2, y + h / 2 + 1, h * 0.36, '#0b1a3d', 900);
    }
    text(c, label, x + (keyLabel ? h * 0.3 + kw : h * 0.5), y + h / 2 + 1, Math.min(u * 0.6, h * 0.42), on ? '#ffffff' : 'rgba(255,255,255,0.4)', 800, 'left');
  }
  function logo(c, x, y, size, align) {
    // A little 2048 tile with the word MERGE beside or under it.
    const s = size;
    const bob = Math.sin(T * 2) * s * 0.03;
    if (align === 'stack') {
      drawTile(c, 2048, x, y + bob, s, 1);
      outlined(c, 'MERGE', x, y + s * 0.82, s * 0.36, '#ffffff', '#5ec8ff');
    } else {
      drawTile(c, 2048, x + s / 2, y + bob, s, 1);
      outlined(c, 'MERGE', x + s * 1.15, y, s * 0.42, '#ffffff', '#5ec8ff', 'left');
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, { bx, by, B, u } = L;
    Kit.background(c, t, '#123a73', '#050b22', 'rgba(80,170,255,0.10)');
    if (!cells) return;
    const bp = board();
    c.drawImage(bp, bx - bp.m, by - bp.m, B + bp.m * 2, B + bp.m * 2);
    drawTiles(c);

    const big = biggest();
    if (L.wide) {
      // Left: logo, score, best.
      const colW = Math.min(bx * 0.72, u * 7.2), lx = bx / 2 - colW / 2;
      logo(c, bx / 2, by + u * 1.6, u * 2.6, 'stack');
      drawScore(c, lx, by + u * 4.8, colW, u * 2.6);
      drawBest(c, lx, by + u * 7.8, colW, u * 2.6);
      // Right: biggest tile, controls.
      const rx0 = bx + B, rcx = rx0 + (W - rx0) / 2, rw = Math.min((W - rx0) * 0.78, u * 7.6);
      text(c, 'BIGGEST TILE', rcx, by + u * 0.55, u * 0.5, 'rgba(180,220,255,0.75)', 800);
      if (big) drawTile(c, big, rcx, by + u * 2.15, u * 2.1);
      text(c, `${moves} moves`, rcx, by + u * 3.85, u * 0.5, 'rgba(255,255,255,0.55)', 700);
      const ch = u * 1.25, cx0 = rcx - rw / 2;
      const touch = Kit.touchFirst();
      L.undoChip = { x: cx0, y: by + u * 4.8, w: rw, h: ch };
      L.menuChip = { x: cx0, y: by + u * 6.3, w: rw, h: ch };
      chip(c, cx0, L.undoChip.y, rw, ch, touch ? '' : 'U', '↶ Undo', !!undoSnap && state === 'play', t);
      chip(c, cx0, L.menuChip.y, rw, ch, touch ? '' : 'OK', '☰ Menu', state === 'play', t);
      const tips = touch ? ['Swipe to slide', 'Join equal numbers'] : ['◀ ▲ ▼ ▶  slide', 'Join equal numbers'];
      tips.forEach((s, i) => text(c, s, rcx, by + u * 8.3 + i * u * 0.8, u * 0.5, 'rgba(255,255,255,0.6)', 700));
    } else {
      const top = by - u * 0.5;
      logo(c, bx, u * 2.2, u * 2.2, 'row');
      const cw = (B - u * 0.6) / 2, chh = u * 2.3, cy0 = top - chh - u * 0.4;
      drawScore(c, bx, cy0, cw, chh);
      drawBest(c, bx + cw + u * 0.6, cy0, cw, chh);
      const ch = u * 1.6, w2 = (B - u * 0.6) / 2, y2 = by + B + u * 0.9;
      L.undoChip = { x: bx, y: y2, w: w2, h: ch };
      L.menuChip = { x: bx + w2 + u * 0.6, y: y2, w: w2, h: ch };
      chip(c, bx, y2, w2, ch, '', '↶ Undo', !!undoSnap && state === 'play', t);
      chip(c, L.menuChip.x, y2, w2, ch, '', '☰ Menu', state === 'play', t);
      text(c, 'Swipe to slide · join equal numbers', W / 2, y2 + ch + u * 1.0, u * 0.6, 'rgba(255,255,255,0.6)', 700);
    }

    // Speaker (tap or M)
    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    // First game: how to play, over the top of the board.
    if (firstGame && introT < 7 && state === 'play') {
      const a = Math.min(1, introT * 2, (7 - introT) * 2);
      c.globalAlpha = a;
      const msg = Kit.touchFirst() ? 'Swipe to slide · join equal numbers · make 2048!' : 'Arrows slide every tile · join equal numbers · make 2048!';
      const hy = L.wide ? (by - bp.m * 0.2) / 2 + u * 0.05 : by - u * 0.25;
      const fs = Math.min(u * 0.62, (L.wide ? (H - B) / 2 * 0.42 : u * 0.6));
      c.font = `800 ${Math.round(fs)}px ${FONT}`;
      const tw = c.measureText(msg).width + fs * 1.6;
      roundRect(c, W / 2 - tw / 2, hy - fs * 0.8, tw, fs * 1.6, fs * 0.8);
      c.fillStyle = 'rgba(8,20,50,0.85)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(140,210,255,0.5)'; c.stroke();
      text(c, msg, W / 2, hy + 1, fs, '#ffffff', 800);
      c.globalAlpha = 1;
    }

    drawFloats(c);
    if (state !== 'play') drawPanel(c, t);
  }

  function drawPanel(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((T - stateT) / 0.3, 0, 1);
    if (a <= 0) { L.buttons = []; return; }
    c.fillStyle = `rgba(3,8,26,${(state === 'menu' ? 0.55 : 0.68) * a})`; c.fillRect(0, 0, W, H);
    const items = itemsFor(state);
    const pw = Math.min(W * 0.9, u * 13), bh = u * 1.5, bgap = u * 0.45;
    const head = state === 'menu' ? u * 2.6 : u * 6.4;
    const ph = head + items.length * (bh + bgap) + u * 0.9;
    const k = ease.back(a);
    c.save();
    c.translate(W / 2, H / 2); c.scale(k, k);
    const border = state === 'win' ? '#ffcf1f' : state === 'over' ? '#ff6b8a' : 'rgba(140,210,255,0.8)';
    card(c, -pw / 2, -ph / 2, pw, ph, u * 0.8, border, state === 'win' ? '#2d5fb3' : '#1f4a8c', '#0b1d4a');
    c.lineWidth = 4; c.strokeStyle = border; c.stroke();
    const y0 = -ph / 2;
    if (state === 'menu') {
      outlined(c, 'Menu', 0, y0 + u * 1.35, u * 1.2, '#ffffff', '#9fe3ff');
    } else if (state === 'win') {
      outlined(c, 'You made 2048!', 0, y0 + u * 1.45, u * 1.25, '#fff6c2', '#ffb703');
      drawTile(c, 2048, -u * 3.4, y0 + u * 3.6, u * 1.9 * (1 + Math.sin(T * 4) * 0.04));
      text(c, 'SCORE', u * 1.3, y0 + u * 2.95, u * 0.5, 'rgba(180,220,255,0.85)', 800);
      outlined(c, String(score), u * 1.3, y0 + u * 3.95, u * 1.3, '#ffffff', '#9fe3ff');
      text(c, 'Keep going for 4096 and beyond!', 0, y0 + u * 5.65, u * 0.58, 'rgba(255,255,255,0.85)', 700);
    } else {
      outlined(c, 'No more moves', 0, y0 + u * 1.3, u * 1.2, '#ffffff', '#ff9fb4');
      text(c, 'SCORE', 0, y0 + u * 2.6, u * 0.5, 'rgba(180,220,255,0.85)', 800);
      outlined(c, String(score), 0, y0 + u * 3.7, u * 1.6, '#fff6c2', '#ffb703');
      const big = biggest();
      text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, y0 + u * 5.0, u * 0.62, newBest ? '#ffd76a' : '#ffffff', 800);
      text(c, `Biggest tile ${big}  ·  ${moves} moves`, 0, y0 + u * 5.8, u * 0.5, 'rgba(255,255,255,0.7)', 700);
    }
    // Buttons
    const ready = panelReady();
    L.buttons = [];
    items.forEach((it, i) => {
      const bw = pw * 0.72, by = y0 + head + i * (bh + bgap);
      const on = i === sel && !it.off;
      const s = on ? 1.04 + Math.sin(T * 6) * 0.012 : 1;
      c.save();
      c.translate(0, by + bh / 2); c.scale(s, s);
      roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
      if (on) {
        const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
        g.addColorStop(0, '#ffe27a'); g.addColorStop(1, '#ffb703');
        c.fillStyle = g;
      } else c.fillStyle = it.off ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.12)';
      c.globalAlpha = ready ? 1 : 0.5;
      c.fill();
      if (on) { c.lineWidth = 3; c.strokeStyle = '#fff6c2'; c.stroke(); }
      text(c, `${it.icon}  ${it.label}`, 0, 1, bh * 0.44, on ? '#3a2400' : it.off ? 'rgba(255,255,255,0.3)' : '#ffffff', 900);
      c.restore();
      L.buttons.push({ x: W / 2 - (bw / 2) * k, y: H / 2 + (by) * k, w: bw * k, h: bh * k });
    });
    c.globalAlpha = 1;
    c.restore();
    L.panel = { x: W / 2 - pw / 2 * k, y: H / 2 - ph / 2 * k, w: pw * k, h: ph * k };
    if (ready && !Kit.touchFirst()) text(c, '▲ ▼ choose  ·  OK select', W / 2, H / 2 + ph / 2 * k + u * 0.9, u * 0.55, 'rgba(255,255,255,0.7)', 700);
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  const saved = Kit.store.get('merge2048.game', null);
  if (saved && Array.isArray(saved.cells) && saved.cells.length === N * N && saved.cells.some((v) => v > 0)) {
    load(saved.cells, true);
    score = shown = saved.score || 0; keepGoing = !!saved.keepGoing; moves = saved.moves || 0; undoSnap = saved.undo || null;
    if (!canMove()) { state = 'over'; stateT = T + 0.4; }
  } else {
    firstGame = !(best > 0);
    newGame();
  }
  Kit.canvas.focus();
  if (best > 0) Kit.record('merge2048', best);
})();
