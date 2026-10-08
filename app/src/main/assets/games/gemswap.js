// Gem Swap: swap two neighbouring gems to line up three or more of a kind. Four in a line makes a
// line blaster, an L or T makes a bomb, five makes a rainbow gem. Each level has goals and a few moves.
// Remote: arrows move the cursor, OK picks a gem up, then an arrow swaps it with that neighbour.
// The Hint and Restart buttons sit right of the board (arrow right from the last column).
// Touch and mouse: tap a gem then a neighbour, or drag a gem toward a neighbour.
'use strict';

(() => {
  const { sfx, ease, shade, rgba, roundRect, clamp, lerp } = Kit;
  const N = 8;
  // Every gem differs in colour AND shape, so colour-blind players can play too.
  const GEMS = [
    { name: 'red hearts', color: '#ff3b5c', shape: 'heart' },
    { name: 'orange hexes', color: '#ff8c1a', shape: 'hex' },
    { name: 'yellow stars', color: '#ffd23f', shape: 'star' },
    { name: 'green squares', color: '#2fd27a', shape: 'square' },
    { name: 'blue diamonds', color: '#3d8bff', shape: 'diamond' },
    { name: 'purple triangles', color: '#b45cff', shape: 'tri' },
  ];
  const RAINBOW = -1;
  const WORDS = ['', '', 'Nice!', 'Great!', 'Brilliant!', 'Fantastic!', 'Dazzling!'];
  const SWAP = 0.17;

  // ---------- Levels: goals and moves come from the level number, the same every time ----------
  function rng(seed) {
    return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function spec(n) {
    const rnd = rng(n * 7919 + 13);
    rnd(); rnd();
    const types = n <= 2 ? 5 : 6;
    const g = Math.min(n - 1, 24); // difficulty grows for 25 levels, then stays put
    const kind = (n - 1) % 3;
    const goals = [];
    let moves;
    if (kind === 0) {
      const t = n === 1 ? 0 : Math.floor(rnd() * types);
      goals.push({ kind: 'gem', t, need: 20 + Math.round(g * 0.6) });
      moves = 22 + Math.floor(g / 3) - (n === 1 ? 2 : 0);
    } else if (kind === 1) {
      moves = 20 + Math.floor(g / 4);
      goals.push({ kind: 'score', need: Math.round(moves * (150 + g * 2.5) / 100) * 100 });
    } else {
      const a = Math.floor(rnd() * types); let b = Math.floor(rnd() * (types - 1)); if (b >= a) b++;
      goals.push({ kind: 'gem', t: a, need: 12 + Math.round(g * 0.7) }, { kind: 'gem', t: b, need: 12 + Math.round(g * 0.7) });
      moves = 22 + Math.floor(g / 3);
    }
    // Stars: one for finishing, two and three for a high score (left-over moves pay a bonus).
    const base = moves * 210;
    const s1 = goals[0].kind === 'score' ? goals[0].need : 0;
    return { types, goals, moves, stars: [s1, Math.max(s1 * 1.25, base * 1.0), Math.max(s1 * 1.6, base * 1.45)] };
  }

  // ---------- State ----------
  let level = Kit.store.get('gemswap.level', 1);
  let S, grid, score, shown, movesLeft, prog, chain, phase = 'idle', phaseT = 0, sw = null, lastSwap = null, clearDur = 0;
  let dying = [], fxs = [], held = null, cursor = { r: 3, c: 3 }, focus = 'board', btn = 0, idleT = 0, hint = null;
  let result = null, resultT = 0, starsWon = 0, introT = 0, clock = 0, nextId = 1, bonusT = 0, nopeT = -9, nopeAt = null;
  let landSound = 0, bump = 0, drag = null;

  const makeGem = (t, s, r, c) => ({ id: nextId++, t, s: s || null, fx: c, fy: r, vy: 0, land: -9, born: clock, fired: false });
  const at = (k) => grid[Math.floor(k / N)][k % N];
  const typeAt = (r, c) => { const g = grid[r][c]; return g && g.t >= 0 ? g.t : -1; };
  const randType = () => Math.floor(Math.random() * S.types);

  function fillBoard() {
    for (let tries = 0; tries < 200; tries++) {
      grid = Array.from({ length: N }, () => Array(N).fill(null));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        let t;
        do t = randType();
        while ((c >= 2 && typeAt(r, c - 1) === t && typeAt(r, c - 2) === t) || (r >= 2 && typeAt(r - 1, c) === t && typeAt(r - 2, c) === t));
        grid[r][c] = makeGem(t, null, r, c);
      }
      if (findMove()) break;
    }
    // Gems start above the board and rain in.
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) grid[r][c].fy = r - N - 1 - (N - r) * 0.15 - c * 0.12;
  }

  function begin(again) {
    S = spec(level);
    score = 0; shown = 0; movesLeft = S.moves; prog = S.goals.map(() => 0); chain = 0;
    dying = []; fxs = []; held = null; hint = null; result = null; idleT = 0; introT = again ? 2.5 : 0;
    fillBoard();
    phase = 'fall'; phaseT = 0;
    save();
  }
  function save() {
    if (result) { Kit.store.set('gemswap.game', null); return; }
    Kit.store.set('gemswap.game', { level, score, movesLeft, prog, cursor,
      cells: grid.map((row) => row.map((g) => (g ? [g.t, g.s] : [0, null]))) });
  }
  function restore(s) {
    S = spec(level);
    score = s.score; shown = score; movesLeft = s.movesLeft; prog = s.prog; chain = 0;
    if (s.cursor) cursor = { r: clamp(s.cursor.r, 0, N - 1), c: clamp(s.cursor.c, 0, N - 1) };
    grid = s.cells.map((row, r) => row.map(([t, sp], c) => makeGem(t, sp, r, c)));
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) grid[r][c].fy = r - N - 1 - (N - r) * 0.15 - c * 0.12;
    phase = 'fall'; phaseT = 0;
  }
  const saved = Kit.store.get('gemswap.game', null);
  if (saved && saved.level === level && saved.cells) restore(saved); else begin(false);

  // ---------- Finding matches ----------
  // Runs of 3+ in a row or column; runs that share a gem join into one group (that is how L and T shapes show up).
  function findGroups() {
    const runs = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N;) {
      const t = typeAt(r, c); let e = c + 1;
      if (t >= 0) while (e < N && typeAt(r, e) === t) e++;
      if (t >= 0 && e - c >= 3) { const cells = []; for (let k = c; k < e; k++) cells.push(r * N + k); runs.push({ dir: 'h', cells, t }); }
      c = e;
    }
    for (let c = 0; c < N; c++) for (let r = 0; r < N;) {
      const t = typeAt(r, c); let e = r + 1;
      if (t >= 0) while (e < N && typeAt(e, c) === t) e++;
      if (t >= 0 && e - r >= 3) { const cells = []; for (let k = r; k < e; k++) cells.push(k * N + c); runs.push({ dir: 'v', cells, t }); }
      r = e;
    }
    const groups = [], owner = new Map();
    for (const run of runs) {
      let g = null;
      for (const k of run.cells) {
        const o = owner.get(k);
        if (!o || o === g) continue;
        if (!g) { g = o; continue; }
        o.runs.forEach((x) => g.runs.push(x));
        o.keys.forEach((x) => { g.keys.add(x); owner.set(x, g); });
        groups.splice(groups.indexOf(o), 1);
      }
      if (!g) { g = { keys: new Set(), runs: [], t: run.t }; groups.push(g); }
      g.runs.push(run);
      run.cells.forEach((k) => { g.keys.add(k); owner.set(k, g); });
    }
    return groups;
  }
  function swapCells(a, b) { const t = grid[a.r][a.c]; grid[a.r][a.c] = grid[b.r][b.c]; grid[b.r][b.c] = t; }
  function moveWorks(a, b) {
    const x = grid[a.r][a.c], y = grid[b.r][b.c];
    if (!x || !y) return false;
    if (x.s === 'rainbow' || y.s === 'rainbow' || (x.s && y.s)) return true;
    swapCells(a, b); const ok = findGroups().length > 0; swapCells(a, b);
    return ok;
  }
  function allMoves() {
    const out = [];
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      if (c + 1 < N && moveWorks({ r, c }, { r, c: c + 1 })) out.push([{ r, c }, { r, c: c + 1 }]);
      if (r + 1 < N && moveWorks({ r, c }, { r: r + 1, c })) out.push([{ r, c }, { r: r + 1, c }]);
    }
    return out;
  }
  function findMove() { const m = allMoves(); return m.length ? m[Math.floor(Math.random() * m.length)] : null; }

  // ---------- Layout ----------
  let L = {};
  const BUTTONS = [{ id: 'hint', label: '💡 Hint' }, { id: 'restart', label: '⟳ Restart' }];
  function layout(W, H) {
    const wide = W / H > 1.15;
    let B, bx, by;
    if (wide) {
      B = Math.min(H * 0.84, W * 0.5); bx = (W - B) / 2; by = H * 0.1;
      const pw = Math.min(bx - W * 0.05, B * 0.55);
      L = { wide, left: { x: bx - W * 0.025 - pw, w: pw }, right: { x: bx + B + W * 0.025, w: pw } };
    } else {
      B = Math.min(W * 0.94, H * 0.56); bx = (W - B) / 2; by = H * 0.24;
      L = { wide };
    }
    Object.assign(L, { B, bx, by, cs: B / N });
    const bh = Math.max(44, Math.min(H * 0.08, 64));
    if (wide) {
      const r = L.right;
      L.buttons = BUTTONS.map((b, i) => ({ ...b, x: r.x, y: by + B - (2 - i) * (bh + 14) + 14, w: r.w, h: bh }));
    } else {
      const bw = Math.min(W * 0.4, 220);
      L.buttons = BUTTONS.map((b, i) => ({ ...b, x: W / 2 - bw - 8 + i * (bw + 16), y: by + B + 20, w: bw, h: bh }));
    }
    L.font = Math.max(18, Math.min(H * 0.034, 34));
    sprites.clear();
  }
  Kit.onResize(layout);
  const cellX = (c) => L.bx + c * L.cs, cellY = (r) => L.by + r * L.cs;

  // ---------- Drawing gems (each kind drawn once per size, then copied: quick on TV boxes) ----------
  function polyRound(c, pts, r) {
    const n = pts.length, mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    const m0 = mid(pts[n - 1], pts[0]);
    c.beginPath(); c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], m = mid(p, pts[(i + 1) % n]); c.arcTo(p[0], p[1], m[0], m[1], r); }
    c.closePath();
  }
  function gemPath(c, shape, R) {
    if (shape === 'heart') {
      c.beginPath();
      c.moveTo(0, R * 0.92);
      c.bezierCurveTo(-R * 1.35, R * 0.02, -R * 0.8, -R * 1.12, 0, -R * 0.5);
      c.bezierCurveTo(R * 0.8, -R * 1.12, R * 1.35, R * 0.02, 0, R * 0.92);
      c.closePath();
    } else if (shape === 'hex') {
      const p = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 6 + i * Math.PI / 3; p.push([Math.cos(a) * R, Math.sin(a) * R]); }
      polyRound(c, p, R * 0.2);
    } else if (shape === 'star') {
      const p = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.52 : R * 1.08; p.push([Math.cos(a) * rr, Math.sin(a) * rr + R * 0.08]); }
      polyRound(c, p, R * 0.1);
    } else if (shape === 'square') roundRect(c, -R * 0.8, -R * 0.8, R * 1.6, R * 1.6, R * 0.3);
    else if (shape === 'diamond') polyRound(c, [[0, -R * 1.05], [R * 0.86, 0], [0, R * 1.05], [-R * 0.86, 0]], R * 0.16);
    else if (shape === 'tri') polyRound(c, [[0, -R * 0.98], [R * 1.02, R * 0.8], [-R * 1.02, R * 0.8]], R * 0.22);
    else { c.beginPath(); c.arc(0, 0, R * 0.92, 0, Math.PI * 2); }
  }
  function sparkle(c, x, y, s) {
    c.beginPath();
    c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s);
    c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill();
  }
  const sprites = new Map();
  function sprite(t, s, size) {
    const key = t + '|' + s + '|' + Math.round(size);
    let sp = sprites.get(key);
    if (sp) return sp;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    sp = document.createElement('canvas');
    sp.width = sp.height = Math.ceil(size * dpr);
    const c = sp.getContext('2d');
    c.scale(dpr, dpr); c.translate(size / 2, size / 2);
    const R = size * 0.38;
    if (s === 'rainbow') {
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.arc(0, size * 0.04, R * 1.02, 0, Math.PI * 2); c.fill();
      for (let i = 0; i < 6; i++) {
        c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R, i * Math.PI / 3, (i + 1) * Math.PI / 3); c.closePath();
        c.fillStyle = GEMS[i].color; c.fill();
      }
      const g = c.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(40,0,60,0.35)');
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
      c.lineWidth = size * 0.035; c.strokeStyle = '#fff'; c.stroke();
      c.fillStyle = '#fff';
      sparkle(c, -R * 0.38, -R * 0.4, R * 0.28); sparkle(c, R * 0.42, R * 0.3, R * 0.16);
      sprites.set(key, sp);
      return sp;
    }
    const G = GEMS[t], col = G.color;
    c.save(); c.translate(0, size * 0.045); gemPath(c, G.shape, R); c.fillStyle = 'rgba(0,0,0,0.32)'; c.fill(); c.restore();
    if (s === 'bomb') {
      // A bomb glows: a bright halo around the gem.
      const hg = c.createRadialGradient(0, 0, R * 0.6, 0, 0, size * 0.5);
      hg.addColorStop(0, 'rgba(255,255,255,0.75)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = hg; c.fillRect(-size / 2, -size / 2, size, size);
    }
    gemPath(c, G.shape, R);
    const g = c.createLinearGradient(-R, -R, R, R);
    g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.45));
    c.fillStyle = g; c.fill();
    c.lineWidth = size * 0.035; c.lineJoin = 'round'; c.strokeStyle = shade(col, -0.55); c.stroke();
    c.save();
    gemPath(c, G.shape, R); c.clip();
    // An inner facet, a soft top shine.
    c.save(); c.scale(0.56, 0.56); gemPath(c, G.shape, R);
    const fg = c.createLinearGradient(0, -R, 0, R);
    fg.addColorStop(0, 'rgba(255,255,255,0.55)'); fg.addColorStop(1, 'rgba(255,255,255,0.05)');
    c.fillStyle = fg; c.fill(); c.restore();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(-R * 0.25, -R * 0.55, R * 0.55, R * 0.22, -0.5, 0, Math.PI * 2); c.fill();
    if (s === 'h' || s === 'v') {
      // Line blaster: bright stripes along the line it clears.
      c.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i = -1; i <= 1; i++) {
        if (s === 'h') c.fillRect(-R * 1.2, i * R * 0.42 - R * 0.07, R * 2.4, R * 0.14);
        else c.fillRect(i * R * 0.42 - R * 0.07, -R * 1.2, R * 0.14, R * 2.4);
      }
    }
    c.restore();
    if (s === 'h' || s === 'v') {
      // Arrow tips show which way it blasts.
      c.save(); if (s === 'v') c.rotate(Math.PI / 2);
      c.fillStyle = '#fff'; c.strokeStyle = shade(col, -0.6); c.lineWidth = size * 0.025;
      for (const d of [-1, 1]) {
        c.beginPath(); c.moveTo(d * size * 0.48, 0); c.lineTo(d * size * 0.38, -size * 0.08); c.lineTo(d * size * 0.38, size * 0.08); c.closePath();
        c.fill(); c.stroke();
      }
      c.restore();
    }
    if (s === 'bomb') {
      c.fillStyle = '#fff'; c.strokeStyle = shade(col, -0.6); c.lineWidth = size * 0.02;
      const p = []; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? R * 0.18 : R * 0.42; p.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
      polyRound(c, p, 1); c.fill(); c.stroke();
    }
    c.fillStyle = '#fff';
    sparkle(c, -R * 0.42, -R * 0.38, R * 0.18);
    sprites.set(key, sp);
    return sp;
  }
  function drawGem(c, g, x, y, size, scale = 1, alpha = 1, rot = 0) {
    const sp = sprite(g.t, g.s, size);
    c.globalAlpha = alpha;
    if (rot) {
      c.save(); c.translate(x + size / 2, y + size / 2); c.rotate(rot);
      c.drawImage(sp, -size * scale / 2, -size * scale / 2, size * scale, size * scale);
      c.restore();
    } else c.drawImage(sp, x + size * (1 - scale) / 2, y + size * (1 - scale) / 2, size * scale, size * scale);
    c.globalAlpha = 1;
  }

  // ---------- Sounds of our own ----------
  const snd = {
    swap: () => { Kit.tone(420, { type: 'triangle', dur: 0.1, vol: 0.12, slide: 1.6 }); Kit.noise({ dur: 0.08, vol: 0.05, freq: 3000, q: 0.8 }); },
    land: () => Kit.tone(240 + Math.random() * 60, { type: 'sine', dur: 0.05, vol: 0.06, slide: 0.7 }),
    line: () => { Kit.noise({ dur: 0.35, vol: 0.16, freq: 1800, q: 0.6, sweep: 3 }); Kit.tone(900, { type: 'sawtooth', dur: 0.25, vol: 0.05, slide: 0.4 }); },
    bomb: () => { Kit.noise({ dur: 0.45, vol: 0.3, freq: 400, q: 0.7, sweep: 0.3, type: 'lowpass' }); Kit.tone(90, { type: 'sine', dur: 0.4, vol: 0.4, slide: 0.5 }); },
    rainbow: () => { [0, 4, 7, 12, 16].forEach((n, i) => Kit.tone(523 * Math.pow(2, n / 12), { type: 'sine', dur: 0.3, vol: 0.12, at: i * 0.05 })); Kit.noise({ dur: 0.5, vol: 0.08, freq: 7000, q: 0.5, type: 'highpass' }); },
    made: () => { Kit.tone(880, { type: 'triangle', dur: 0.18, vol: 0.12 }); Kit.tone(1320, { type: 'triangle', dur: 0.25, vol: 0.1, at: 0.08 }); },
    coin: (i) => Kit.tone(1046 + (i % 6) * 110, { type: 'square', dur: 0.06, vol: 0.05 }),
  };

  // ---------- Playing a move ----------
  function nope(cell) { nopeT = clock; nopeAt = cell; sfx.nope(); }
  function trySwap(a, b) {
    if (phase !== 'idle' || result) return;
    if (b.r < 0 || b.c < 0 || b.r >= N || b.c >= N) { nope(a); return; }
    held = null; hint = null; idleT = 0;
    swapCells(a, b);
    sw = { from: a, to: b }; lastSwap = { a, b };
    phase = 'swap'; phaseT = 0; sw.back = false;
    snd.swap();
  }
  function afterSwap() {
    const { from: a, to: b } = sw;
    const ga = grid[b.r][b.c], gb = grid[a.r][a.c]; // ga came from a, gb from b
    ga.fx = b.c; ga.fy = b.r; gb.fx = a.c; gb.fy = a.r;
    if (sw.back) { phase = 'idle'; cursor = { ...a }; return; }
    cursor = { ...b };
    const keys = [];
    const all = (fn) => { for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fn(grid[r][c], r, c)) keys.push(r * N + c); };
    if (ga.s === 'rainbow' || gb.s === 'rainbow') {
      const rb = ga.s === 'rainbow' ? ga : gb, other = rb === ga ? gb : ga;
      const rp = rb === ga ? b : a;
      rb.fired = true;
      if (other.s === 'rainbow') { other.fired = true; all(() => true); Kit.shake(16, 0.6); }
      else {
        all((g) => g && g.t === other.t);
        if (other.s) {
          // Every gem of that colour turns into that special, and they all go off.
          keys.forEach((k) => { const g = at(k); if (g !== other) { g.s = other.s === 'bomb' ? 'bomb' : (Math.random() < 0.5 ? 'h' : 'v'); g.fired = false; } });
        }
        keys.push(rp.r * N + rp.c);
      }
      keys.forEach((k) => fxs.push({ kind: 'zap', r0: rp.r, c0: rp.c, r: Math.floor(k / N), c: k % N, t0: clock }));
      snd.rainbow();
      use(); startClear([], keys, rp);
      return;
    }
    if (ga.s && gb.s) {
      ga.fired = true; gb.fired = true;
      const lineCount = (ga.s === 'bomb' ? 0 : 1) + (gb.s === 'bomb' ? 0 : 1);
      const R0 = b.r, C0 = b.c;
      const reach = lineCount === 2 ? 0 : lineCount === 1 ? 1 : 2;
      if (lineCount === 0) {
        all((g, r, c) => Math.abs(r - R0) <= 2 && Math.abs(c - C0) <= 2);
        fxs.push({ kind: 'ring', r: R0, c: C0, t0: clock, rad: 3 }); snd.bomb(); Kit.shake(14, 0.5);
      } else {
        all((g, r, c) => Math.abs(r - R0) <= reach || Math.abs(c - C0) <= reach);
        for (let d = -reach; d <= reach; d++) { fxs.push({ kind: 'beam', dir: 'h', i: R0 + d, t0: clock }, { kind: 'beam', dir: 'v', i: C0 + d, t0: clock }); }
        snd.line(); if (lineCount === 1) snd.bomb(); Kit.shake(10, 0.4);
      }
      use(); startClear([], keys, b);
      return;
    }
    const groups = findGroups();
    if (groups.length) { use(); startClear(groups, [], null); return; }
    // No match: the gems slide back.
    swapCells(a, b);
    sw = { from: b, to: a, back: true }; phaseT = 0;
    nope(null);
  }
  function use() { movesLeft--; chain = 1; }

  // What a special gem clears when it goes off.
  function blast(g, r, c, out) {
    if (g.s === 'h' || g.s === 'v') {
      for (let i = 0; i < N; i++) out.push(g.s === 'h' ? r * N + i : i * N + c);
      fxs.push({ kind: 'beam', dir: g.s, i: g.s === 'h' ? r : c, t0: clock, color: GEMS[g.t].color });
      snd.line(); Kit.shake(5, 0.25);
    } else if (g.s === 'bomb') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < N && cc < N) out.push(rr * N + cc);
      }
      fxs.push({ kind: 'ring', r, c, t0: clock, rad: 1.6, color: GEMS[g.t].color });
      snd.bomb(); Kit.shake(8, 0.3);
    } else if (g.s === 'rainbow') {
      // Set off by another blast: it takes the most common colour with it.
      const count = Array(GEMS.length).fill(0);
      grid.forEach((row) => row.forEach((x) => { if (x && x.t >= 0) count[x.t]++; }));
      const t = count.indexOf(Math.max(...count));
      for (let rr = 0; rr < N; rr++) for (let cc = 0; cc < N; cc++) {
        const x = grid[rr][cc];
        if (x && x.t === t) { out.push(rr * N + cc); fxs.push({ kind: 'zap', r0: r, c0: c, r: rr, c: cc, t0: clock }); }
      }
      snd.rainbow();
    }
  }

  function startClear(groups, extra, origin) {
    const keys = new Set(extra);
    const spawns = [];
    const swapKeys = lastSwap ? [lastSwap.b.r * N + lastSwap.b.c, lastSwap.a.r * N + lastSwap.a.c] : [];
    let bonus = 0;
    for (const g of groups) {
      g.keys.forEach((k) => keys.add(k));
      const maxLen = Math.max(...g.runs.map((r) => r.cells.length));
      const hasH = g.runs.some((r) => r.dir === 'h'), hasV = g.runs.some((r) => r.dir === 'v');
      let s = null;
      if (maxLen >= 5) s = 'rainbow'; else if (hasH && hasV) s = 'bomb'; else if (maxLen === 4) s = g.runs[0].dir;
      if (!s) continue;
      let key = swapKeys.find((k) => g.keys.has(k));
      if (key === undefined) {
        if (s === 'bomb') {
          const hs = new Set(); g.runs.filter((r) => r.dir === 'h').forEach((r) => r.cells.forEach((k) => hs.add(k)));
          key = g.runs.filter((r) => r.dir === 'v').flatMap((r) => r.cells).find((k) => hs.has(k));
        }
        if (key === undefined) { const run = g.runs.reduce((a, b) => (b.cells.length > a.cells.length ? b : a)); key = run.cells[Math.floor(run.cells.length / 2)]; }
      }
      spawns.push({ key, t: s === 'rainbow' ? RAINBOW : g.t, s });
      bonus += s === 'rainbow' ? 200 : s === 'bomb' ? 120 : 60;
    }
    lastSwap = null;
    // Specials caught in the clear go off too, and can set off others.
    const queue = [...keys];
    const delay = new Map();
    while (queue.length) {
      const k = queue.pop(), g = at(k);
      if (!g || g.fired || !g.s) continue;
      g.fired = true;
      const out = [];
      blast(g, Math.floor(k / N), k % N, out);
      const d0 = delay.get(k) || 0;
      for (const o of out) {
        if (!keys.has(o)) {
          keys.add(o); queue.push(o);
          delay.set(o, d0 + 0.03 * (Math.abs(Math.floor(o / N) - Math.floor(k / N)) + Math.abs((o % N) - (k % N))));
        }
      }
    }
    let cleared = 0, sx = 0, sy = 0, maxDelay = 0;
    for (const k of keys) {
      const g = at(k); if (!g) continue;
      const r = Math.floor(k / N), c = k % N, d = delay.get(k) || 0;
      dying.push({ g, r, c, t0: clock + d });
      maxDelay = Math.max(maxDelay, d);
      if (g.t >= 0) S.goals.forEach((goal, i) => { if (goal.kind === 'gem' && goal.t === g.t) prog[i]++; });
      grid[r][c] = null;
      cleared++; sx += c; sy += r;
    }
    for (const sp of spawns) {
      const r = Math.floor(sp.key / N), c = sp.key % N;
      const g = makeGem(sp.t, sp.s, r, c);
      g.born = clock + 0.12;
      grid[r][c] = g;
    }
    if (spawns.length) setTimeout(snd.made, 140);
    const pts = cleared * 20 * chain + bonus;
    score += pts; bump = 1;
    S.goals.forEach((goal, i) => { if (goal.kind === 'score') prog[i] = score; });
    if (cleared) {
      const x = L.bx + (sx / cleared + 0.5) * L.cs, y = L.by + (sy / cleared + 0.5) * L.cs;
      Kit.float(`+${pts}`, x, y, { color: '#fff6c2', size: L.cs * 0.48 });
      sfx.clear(Math.min(4, Math.floor(cleared / 3)), chain - 1);
    }
    if (chain >= 2) {
      Kit.float(WORDS[Math.min(chain, WORDS.length - 1)], L.bx + L.B / 2, L.by + L.B * 0.42,
        { color: ['#3bceac', '#4ea8de', '#ffd23f', '#ff9f1c', '#ff6bd6'][Math.min(chain, 6) - 2], size: L.B * 0.11, life: 1.2, big: true });
    }
    clearDur = 0.24 + maxDelay;
    phase = 'clear'; phaseT = 0;
  }

  function gravity() {
    for (let c = 0; c < N; c++) {
      let w = N - 1;
      for (let r = N - 1; r >= 0; r--) {
        const g = grid[r][c];
        if (!g) continue;
        if (r !== w) { grid[w][c] = g; grid[r][c] = null; }
        w--;
      }
      const missing = w + 1;
      for (let r = w; r >= 0; r--) {
        const g = makeGem(randType(), null, r, c);
        g.fy = r - missing - 0.3;
        grid[r][c] = g;
      }
    }
  }
  function afterFall() {
    const groups = findGroups();
    if (groups.length) { chain++; startClear(groups, [], null); return; }
    endTurn();
  }
  function goalsMet() { return S.goals.every((g, i) => prog[i] >= g.need); }
  function endTurn() {
    phase = 'idle'; phaseT = 0; chain = 0; idleT = 0;
    if (goalsMet()) {
      phase = 'bonus'; bonusT = 0;
      Kit.float('Goal complete!', L.bx + L.B / 2, L.by + L.B * 0.45, { color: '#9ff0a0', size: L.B * 0.1, life: 1.4, big: true });
      sfx.chime();
      level++; Kit.store.set('gemswap.level', level); Kit.store.set('gemswap.game', null);
      Kit.record('gemswap', level - 1);
      return;
    }
    if (movesLeft <= 0) {
      result = 'fail'; resultT = clock; setTimeout(() => sfx.over(), 300);
      save(); return;
    }
    if (!findMove()) shuffle();
    save();
  }
  function shuffle() {
    const gems = []; grid.forEach((row) => row.forEach((g) => gems.push(g)));
    for (let tries = 0; tries < 300; tries++) {
      for (let i = gems.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [gems[i], gems[j]] = [gems[j], gems[i]]; }
      for (let k = 0; k < N * N; k++) grid[Math.floor(k / N)][k % N] = gems[k];
      if (!findGroups().length && findMove()) break;
      if (tries === 299) gems.forEach((g) => { g.t = randType(); g.s = null; });
    }
    gems.forEach((g) => { g.ox = g.fx; g.oy = g.fy; });
    phase = 'shuffle'; phaseT = 0;
    Kit.float('No moves left - shuffle!', L.bx + L.B / 2, L.by + L.B * 0.5, { color: '#7fe3ff', size: L.B * 0.07, life: 1.4, big: true });
    Kit.noise({ dur: 0.5, vol: 0.12, freq: 1500, q: 0.6, sweep: 2 });
  }
  const shownLevel = () => (phase === 'bonus' || result === 'win' ? level - 1 : level);
  function starsFor(sc) { return sc >= S.stars[2] ? 3 : sc >= S.stars[1] ? 2 : 1; }

  // ---------- Buttons and keys ----------
  function press(id) {
    if (id === 'hint') {
      if (phase !== 'idle' || result) return;
      hint = findMove(); idleT = 0; sfx.pick();
    } else if (id === 'restart') {
      if (result || phase === 'bonus') return;
      begin(true); sfx.pick(); save();
    }
  }
  function continueOn() {
    if (clock - resultT < 0.9) return;
    begin(false);
    sfx.pick(); save();
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (result) { if (k === 'ok') continueOn(); return; }
    if (k === 'restart') { press('restart'); return; }
    if (k === 'undo') return;
    idleT = 0;
    if (focus === 'btn') {
      if (k === 'ok') press(BUTTONS[btn].id);
      else if (k === (L.wide ? 'up' : 'left') && btn > 0) { btn--; sfx.move(); }
      else if (k === (L.wide ? 'down' : 'right') && btn < BUTTONS.length - 1) { btn++; sfx.move(); }
      else if (k === (L.wide ? 'left' : 'up')) { focus = 'board'; if (L.wide) cursor.c = N - 1; else cursor.r = N - 1; sfx.move(); }
      return;
    }
    const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[k];
    if (held) {
      if (k === 'ok') { held = null; sfx.move(); return; }
      if (d) trySwap(held, { r: held.r + d[0], c: held.c + d[1] });
      return;
    }
    if (k === 'ok') {
      if (phase !== 'idle') return;
      held = { ...cursor }; sfx.pick();
      return;
    }
    if (d) {
      const r = cursor.r + d[0], c = cursor.c + d[1];
      if (L.wide ? c >= N : r >= N) { focus = 'btn'; btn = L.wide ? (cursor.r < N / 2 ? 0 : 1) : (cursor.c < N / 2 ? 0 : 1); sfx.move(); return; }
      if (r < 0 || c < 0 || r >= N || c >= N) return;
      cursor = { r, c }; sfx.move();
    }
  });

  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const cellAt = (x, y) => {
    const c = Math.floor((x - L.bx) / L.cs), r = Math.floor((y - L.by) / L.cs);
    return r >= 0 && c >= 0 && r < N && c < N ? { r, c } : null;
  };
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (result) { continueOn(); return; }
      const bi = L.buttons.findIndex((b) => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (bi >= 0) { focus = 'btn'; btn = bi; press(BUTTONS[bi].id); return; }
      const cell = cellAt(e.x, e.y);
      if (!cell) return;
      focus = 'board'; idleT = 0; hint = null;
      if (held && Math.abs(held.r - cell.r) + Math.abs(held.c - cell.c) === 1) { trySwap(held, cell); return; }
      if (held && held.r === cell.r && held.c === cell.c) { held = null; return; }
      cursor = cell; held = { ...cell }; sfx.pick();
      drag = { ...cell, x: e.x, y: e.y };
    },
    move(e) {
      if (!drag || !held) return;
      const dx = e.x - drag.x, dy = e.y - drag.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < L.cs * 0.45) return;
      const to = Math.abs(dx) > Math.abs(dy) ? { r: drag.r, c: drag.c + Math.sign(dx) } : { r: drag.r + Math.sign(dy), c: drag.c };
      drag = null; trySwap(held, to);
    },
    up() { drag = null; },
  });

  // ---------- Update ----------
  function update(dt) {
    clock += dt; phaseT += dt; introT += dt;
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    for (let i = dying.length - 1; i >= 0; i--) {
      const d = dying[i];
      if (!d.sparked && clock >= d.t0) {
        d.sparked = true;
        if (d.g.t >= 0) Kit.burst(L.bx + (d.c + 0.5) * L.cs, L.by + (d.r + 0.5) * L.cs, GEMS[d.g.t].color, dying.length > 30 ? 2 : 4, 0.7);
      }
      if (clock - d.t0 > 0.3) dying.splice(i, 1);
    }
    for (let i = fxs.length - 1; i >= 0; i--) if (clock - fxs[i].t0 > 0.5) fxs.splice(i, 1);

    if (phase === 'swap') {
      const k = ease.inOut(Math.min(1, phaseT / SWAP));
      const { from: a, to: b } = sw;
      const ga = grid[b.r][b.c], gb = grid[a.r][a.c];
      ga.fx = lerp(a.c, b.c, k); ga.fy = lerp(a.r, b.r, k);
      gb.fx = lerp(b.c, a.c, k); gb.fy = lerp(b.r, a.r, k);
      if (phaseT >= SWAP) afterSwap();
    } else if (phase === 'clear') {
      if (phaseT >= clearDur) { gravity(); phase = 'fall'; phaseT = 0; }
    } else if (phase === 'fall') {
      let moving = false, landed = false;
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const g = grid[r][c];
        if (!g || g.fy >= r) continue;
        g.vy = Math.min(g.vy + 70 * dt, 20);
        g.fy += g.vy * dt;
        if (g.fy >= r) { g.fy = r; g.vy = 0; g.land = clock; landed = true; } else moving = true;
      }
      if (landed && clock - landSound > 0.07) { landSound = clock; snd.land(); }
      if (!moving) afterFall();
    } else if (phase === 'shuffle') {
      const k = ease.inOut(Math.min(1, phaseT / 0.6));
      for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const g = grid[r][c];
        g.fx = lerp(g.ox, c, k); g.fy = lerp(g.oy, r, k) - Math.sin(k * Math.PI) * 0.6;
      }
      if (phaseT >= 0.6) { phase = 'idle'; phaseT = 0; }
    } else if (phase === 'bonus') {
      // Left-over moves pay out, one by one, then the level is done.
      bonusT += dt;
      if (bonusT > 0.9 && movesLeft > 0) {
        bonusT = 0.75;
        movesLeft--; score += 250; bump = 1;
        const r = Math.floor(Math.random() * N), c = Math.floor(Math.random() * N), g = grid[r][c];
        const x = L.bx + (c + 0.5) * L.cs, y = L.by + (r + 0.5) * L.cs;
        Kit.burst(x, y, g.t >= 0 ? GEMS[g.t].color : '#fff', 8, 0.8);
        Kit.float('+250', x, y, { color: '#ffd23f', size: L.cs * 0.42 });
        snd.coin(movesLeft);
      } else if (bonusT > 1.4 && movesLeft <= 0) {
        result = 'win'; resultT = clock; starsWon = starsFor(score); phase = 'done';
        const best = Kit.store.get('gemswap.stars', {});
        best[level - 1] = Math.max(best[level - 1] || 0, starsWon); Kit.store.set('gemswap.stars', best);
        sfx.win(); Kit.confetti(140);
      }
    } else if (phase === 'idle' && !result) {
      idleT += dt;
      if (idleT > 6 && !hint && !held) { hint = findMove(); idleT = 0; }
    }
  }

  // ---------- Drawing ----------
  function text(c, s, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.fillStyle = color; c.fillText(s, x, y);
  }
  function card(c, x, y, w, h) {
    roundRect(c, x, y, w, h, Math.min(22, h * 0.2));
    c.fillStyle = 'rgba(20,6,40,0.62)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,170,240,0.28)'; c.stroke();
  }
  function goalIcon(c, goal, x, y, size) {
    if (goal.kind === 'gem') c.drawImage(sprite(goal.t, null, size), x - size / 2, y - size / 2, size, size);
    else text(c, '★', x, y + size * 0.04, size * 0.8, '#ffd23f', 900);
  }
  function goalLine(goal, i) {
    const left = Math.max(0, goal.need - prog[i]);
    return goal.kind === 'score' ? (left ? `${Math.min(prog[i], goal.need)} / ${goal.need}` : '✔') : (left ? `${left}` : '✔');
  }
  function drawPanels(c, t) {
    const F = L.font, { bx, by, B } = L;
    c.textBaseline = 'middle';
    if (L.wide) {
      const lp = L.left, rp = L.right, cx = lp.x + lp.w / 2;
      // Level and moves
      card(c, lp.x, by, lp.w, B * 0.34);
      text(c, `Level ${shownLevel()}`, cx, by + B * 0.07, F * 1.25, '#ffd6f5', 900);
      text(c, 'Moves', cx, by + B * 0.15, F * 0.85, 'rgba(255,255,255,0.65)', 700);
      const low = movesLeft <= 5 && !result && phase !== 'bonus';
      const mp = low ? 1 + Math.sin(t * 8) * 0.06 : 1;
      c.save(); c.translate(cx, by + B * 0.245); c.scale(mp, mp);
      c.lineJoin = 'round'; c.lineWidth = F * 0.25; c.strokeStyle = 'rgba(30,5,50,0.9)';
      c.font = `900 ${Math.round(F * 2.6)}px system-ui, sans-serif`; c.textAlign = 'center';
      c.strokeText(movesLeft, 0, 0);
      c.fillStyle = low ? '#ff6b81' : '#fff'; c.fillText(movesLeft, 0, 0);
      c.restore();
      // Goals
      const gy = by + B * 0.37, gh = B * 0.63;
      card(c, lp.x, gy, lp.w, gh);
      text(c, 'Goal', cx, gy + B * 0.055, F * 0.95, 'rgba(255,255,255,0.75)', 800);
      const rowH = Math.min((gh - B * 0.12) / S.goals.length, F * 5), icon = Math.min(rowH * 0.75, lp.w * 0.34);
      const top = gy + B * 0.1 + (gh - B * 0.1 - rowH * S.goals.length) / 2;
      S.goals.forEach((goal, i) => {
        const y = top + (i + 0.5) * rowH, done = prog[i] >= goal.need, score = goal.kind === 'score';
        goalIcon(c, goal, lp.x + lp.w * (score ? 0.5 : 0.3), y - (score ? F * 0.6 : 0), icon * (score ? 0.8 : 1));
        if (score) text(c, goalLine(goal, i), cx, y + icon * 0.4, F * (done ? 1.5 : 0.95), done ? '#9ff0a0' : '#fff', 900);
        else {
          text(c, goalLine(goal, i), lp.x + lp.w * 0.56, y - (done ? 0 : F * 0.3), F * 1.6, done ? '#9ff0a0' : '#fff', 900, 'left');
          if (!done) text(c, 'to go', lp.x + lp.w * 0.56, y + F * 0.75, F * 0.75, 'rgba(255,255,255,0.6)', 700, 'left');
        }
      });
      // Score with its star bar
      const rx = rp.x, rcx = rx + rp.w / 2;
      card(c, rx, by, rp.w, B * 0.34);
      text(c, 'Score', rcx, by + B * 0.06, F * 0.85, 'rgba(255,255,255,0.65)', 700);
      c.save(); c.translate(rcx, by + B * 0.15); const s = 1 + bump * 0.12; c.scale(s, s);
      c.font = `900 ${Math.round(F * 1.7)}px system-ui, sans-serif`; c.textAlign = 'center';
      const sg = c.createLinearGradient(0, -F, 0, F); sg.addColorStop(0, '#fff6c2'); sg.addColorStop(1, '#ffb703');
      c.fillStyle = sg; c.fillText(Math.round(shown), 0, 0);
      c.restore();
      drawStarBar(c, rx + rp.w * 0.1, by + B * 0.255, rp.w * 0.8, Math.max(12, F * 0.45));
      // How to play
      const tips = held ? ['Arrow: swap that way', 'OK: put it down'] : ['Arrows: move', 'OK: pick a gem up', 'Back: games menu'];
      card(c, rx, by + B * 0.37, rp.w, B * 0.63 - (L.buttons.length * (L.buttons[0].h + 14)) - 4);
      tips.forEach((s2, i) => text(c, s2, rcx, by + B * 0.45 + i * F * 1.35, F * 0.78, 'rgba(255,255,255,0.75)', 700));
    } else {
      text(c, `Level ${shownLevel()}   ·   Moves ${movesLeft}`, Kit.W / 2, by - L.cs * 1.7, F * 1.1, '#fff', 900);
      const n = S.goals.length;
      S.goals.forEach((goal, i) => {
        const x = Kit.W / 2 + (i - (n - 1) / 2) * L.cs * 2.6;
        goalIcon(c, goal, x - L.cs * 0.5, by - L.cs * 0.75, L.cs * 0.8);
        text(c, goalLine(goal, i), x, by - L.cs * 0.75, F, '#fff', 900, 'left');
      });
      text(c, `${Math.round(shown)}`, Kit.W / 2, by - L.cs * 2.6, F * 1.4, '#ffd23f', 900);
    }
  }
  function drawStarBar(c, x, y, w, h) {
    const max = S.stars[2], k = clamp(shown / max, 0, 1);
    roundRect(c, x, y - h / 2, w, h, h / 2); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fill();
    if (k > 0) {
      roundRect(c, x, y - h / 2, Math.max(h, w * k), h, h / 2);
      const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#ff6bd6'); g.addColorStop(1, '#ffd23f');
      c.fillStyle = g; c.fill();
    }
    [Math.max(S.stars[0], max * 0.12), S.stars[1], S.stars[2]].forEach((v, i) => {
      const sx = x + w * clamp(v / max, 0, 1) - (i === 2 ? h * 0.3 : 0);
      const on = shown >= v && (i > 0 || goalsMet());
      text(c, '★', sx, y + 1, h * 2, on ? '#ffd23f' : 'rgba(255,255,255,0.35)', 900);
    });
  }
  function drawBoard(c, t) {
    const { bx, by, B, cs } = L;
    roundRect(c, bx - cs * 0.18, by - cs * 0.18, B + cs * 0.36, B + cs * 0.36, cs * 0.3);
    c.fillStyle = 'rgba(25,6,45,0.72)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,170,240,0.35)'; c.stroke();
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      c.fillStyle = (r + col) % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.10)';
      roundRect(c, bx + col * cs + 2, by + r * cs + 2, cs - 4, cs - 4, cs * 0.14); c.fill();
    }
    c.save();
    c.beginPath(); c.rect(bx - cs * 0.18, by, B + cs * 0.36, B + cs * 0.2); c.clip();
    // Settled and falling gems
    const heldGem = held ? grid[held.r][held.c] : null;
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const g = grid[r][col];
      if (!g || g === heldGem) continue;
      let x = bx + g.fx * cs, y = by + g.fy * cs, sc = 1;
      if (y < by - cs) continue;
      if (clock - g.land < 0.18) { const q = (clock - g.land) / 0.18; sc = 1 - Math.sin(q * Math.PI) * 0.08; y += Math.sin(q * Math.PI) * cs * 0.04; }
      if (g.born > clock - 0.35 && g.s) { const q = clamp((clock - g.born) / 0.35, 0, 1); sc = q <= 0 ? 0 : ease.back(q); }
      if (hint && phase === 'idle' && (idleT % 2.2) < 1.2) {
        const [a, b] = hint;
        const isA = a.r === r && a.c === col, isB = b.r === r && b.c === col;
        if (isA || isB) {
          const o = isA ? b : a, w = Math.sin(clock * 18) * cs * 0.07;
          x += (o.c - col) * w; y += (o.r - r) * w; sc = 1.05;
        }
      }
      if (nopeAt && nopeAt.r === r && nopeAt.c === col && clock - nopeT < 0.3) x += Math.sin((clock - nopeT) * 60) * cs * 0.08;
      if (g.s === 'bomb') sc *= 1 + Math.sin(clock * 6) * 0.04;
      drawGem(c, g, x, y, cs, sc, 1, g.s === 'rainbow' ? clock * 1.5 : 0);
    }
    // Gems being cleared: they swell, flash and vanish.
    for (const d of dying) {
      const age = clock - d.t0, x = bx + d.c * cs, y = by + d.r * cs;
      if (age < 0) { drawGem(c, d.g, x, y, cs); continue; }
      const q = clamp(age / 0.3, 0, 1);
      const sc = q < 0.3 ? 1 + q * 0.6 : (1.18) * (1 - ease.inOut((q - 0.3) / 0.7));
      drawGem(c, d.g, x, y, cs, Math.max(0.01, sc), 1 - q * 0.3);
      if (q < 0.5) {
        c.globalAlpha = 0.6 * (1 - q * 2); c.fillStyle = '#fff';
        c.beginPath(); c.arc(x + cs / 2, y + cs / 2, cs * 0.45 * sc, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
      }
    }
    c.restore();
    // The hint: a soft glow round the two gems to swap.
    if (hint && phase === 'idle' && !result) {
      c.save();
      c.globalAlpha = 0.45 + 0.35 * Math.sin(clock * 6);
      c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.shadowColor = '#fff'; c.shadowBlur = 14;
      const [a, b] = hint, x0 = Math.min(a.c, b.c), y0 = Math.min(a.r, b.r);
      roundRect(c, bx + x0 * cs + 3, by + y0 * cs + 3, (Math.abs(a.c - b.c) + 1) * cs - 6, (Math.abs(a.r - b.r) + 1) * cs - 6, cs * 0.22); c.stroke();
      c.restore();
    }
    // Blasts
    for (const f of fxs) {
      const q = clamp((clock - f.t0) / 0.45, 0, 1), a = 1 - q;
      if (f.kind === 'beam') {
        const th = cs * (0.9 - q * 0.6);
        c.globalAlpha = a * 0.85; c.fillStyle = '#fff';
        if (f.dir === 'h') { c.fillRect(bx - cs * 0.15, by + (f.i + 0.5) * cs - th / 2, B + cs * 0.3, th); }
        else { c.fillRect(bx + (f.i + 0.5) * cs - th / 2, by - cs * 0.15, th, B + cs * 0.3); }
        if (f.color) {
          c.globalAlpha = a * 0.6; c.fillStyle = f.color;
          if (f.dir === 'h') c.fillRect(bx - cs * 0.15, by + (f.i + 0.5) * cs - th, B + cs * 0.3, th * 2);
          else c.fillRect(bx + (f.i + 0.5) * cs - th, by - cs * 0.15, th * 2, B + cs * 0.3);
        }
      } else if (f.kind === 'ring') {
        c.globalAlpha = a; c.strokeStyle = '#fff'; c.lineWidth = cs * 0.25 * a + 2;
        c.beginPath(); c.arc(bx + (f.c + 0.5) * cs, by + (f.r + 0.5) * cs, cs * f.rad * ease.out(q), 0, Math.PI * 2); c.stroke();
        if (f.color) { c.globalAlpha = a * 0.35; c.fillStyle = f.color; c.fill(); }
      } else if (f.kind === 'zap') {
        const x0 = bx + (f.c0 + 0.5) * cs, y0 = by + (f.r0 + 0.5) * cs, x1 = bx + (f.c + 0.5) * cs, y1 = by + (f.r + 0.5) * cs;
        c.globalAlpha = a; c.strokeStyle = '#e8f7ff'; c.lineWidth = 3;
        c.beginPath(); c.moveTo(x0, y0);
        for (let i = 1; i < 5; i++) c.lineTo(lerp(x0, x1, i / 5) + Math.sin(i * 7 + clock * 40) * cs * 0.12, lerp(y0, y1, i / 5) + Math.cos(i * 5 + clock * 40) * cs * 0.12);
        c.lineTo(x1, y1); c.stroke();
      }
    }
    c.globalAlpha = 1;
    // The remote's cursor, and the gem in hand (lifted, pulsing, with arrows to its neighbours).
    if (!result && focus === 'board' && !Kit.touchFirst() || held) {
      const p = held || cursor, x = bx + p.c * cs, y = by + p.r * cs;
      const pulse = Math.sin(t * 7);
      c.save();
      c.shadowColor = held ? '#fff' : '#ffd23f'; c.shadowBlur = 18;
      c.lineWidth = 4 + pulse * 1.2; c.strokeStyle = held ? '#ffffff' : '#ffd23f';
      roundRect(c, x - 2, y - 2, cs + 4, cs + 4, cs * 0.2); c.stroke();
      c.restore();
      if (held && heldGem) {
        const lift = cs * 0.08, sc = 1.14 + pulse * 0.05;
        c.globalAlpha = 0.35; c.fillStyle = '#000';
        c.beginPath(); c.ellipse(x + cs / 2, y + cs * 0.88, cs * 0.3, cs * 0.08, 0, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
        drawGem(c, heldGem, x, y - lift, cs, sc, 1, heldGem.s === 'rainbow' ? clock * 1.5 : 0);
        c.fillStyle = 'rgba(255,255,255,0.9)';
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
          const rr = p.r + dy, cc = p.c + dx;
          if (rr < 0 || cc < 0 || rr >= N || cc >= N) return;
          const ax = x + cs / 2 + dx * cs * 0.62, ay = y + cs / 2 + dy * cs * 0.62, s = cs * 0.1 + pulse * 1.5;
          c.beginPath();
          c.moveTo(ax + dx * s, ay + dy * s);
          c.lineTo(ax - dx * s * 0.4 + dy * s, ay - dy * s * 0.4 + dx * s);
          c.lineTo(ax - dx * s * 0.4 - dy * s, ay - dy * s * 0.4 - dx * s);
          c.closePath(); c.fill();
        });
      }
    }
  }
  function drawButtons(c, t) {
    L.buttons.forEach((b, i) => {
      const on = focus === 'btn' && btn === i && !result && !Kit.touchFirst();
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
      text(c, b.label, b.x + b.w / 2, b.y + b.h / 2 + 1, Math.min(b.h * 0.42, b.w * 0.14), on ? '#2b1600' : '#fff', 800);
    });
  }
  function drawPanel(c, W, H) {
    const a = clamp((clock - resultT - 0.3) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(14,3,26,${0.65 * a})`; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.84, 560), ph = Math.min(H * 0.6, 360);
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 30);
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    if (result === 'win') { g.addColorStop(0, '#c13fd6'); g.addColorStop(1, '#5a1580'); } else { g.addColorStop(0, '#4b3a8a'); g.addColorStop(1, '#22164a'); }
    c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
    c.textBaseline = 'middle';
    if (result === 'win') {
      text(c, `Level ${level - 1} complete!`, 0, -ph * 0.32, ph * 0.12, '#fff', 900);
      for (let i = 0; i < 3; i++) {
        const sa = clamp((clock - resultT - 0.6 - i * 0.25) / 0.35, 0, 1), on = i < starsWon;
        c.save(); c.translate((i - 1) * ph * 0.25, -ph * 0.08 - (i === 1 ? ph * 0.04 : 0));
        const ss = on ? ease.back(sa) : 1; c.scale(ss, ss);
        text(c, '★', 0, 0, ph * 0.26, on ? '#ffd23f' : 'rgba(255,255,255,0.22)', 900);
        c.restore();
      }
      text(c, `Score ${score}`, 0, ph * 0.13, ph * 0.09, 'rgba(255,255,255,0.9)', 800);
      text(c, Kit.touchFirst() ? 'Tap for the next level' : 'OK = next level', 0, ph * 0.32, ph * 0.085, '#fff59d', 800);
    } else {
      text(c, 'Out of moves!', 0, -ph * 0.3, ph * 0.13, '#fff', 900);
      const n = S.goals.length;
      S.goals.forEach((goal, i) => {
        const x = (i - (n - 1) / 2) * ph * 0.55;
        goalIcon(c, goal, x - ph * 0.1, -ph * 0.04, ph * 0.16);
        text(c, goalLine(goal, i), x, -ph * 0.04, ph * 0.08, '#fff', 900, 'left');
      });
      text(c, `Score ${score}`, 0, ph * 0.15, ph * 0.08, 'rgba(255,255,255,0.85)', 800);
      text(c, Kit.touchFirst() ? 'Tap to try again' : 'OK = try again', 0, ph * 0.33, ph * 0.085, '#fff59d', 800);
    }
    c.restore();
  }
  function goalSentence() {
    return S.goals.map((g, i) => (g.kind === 'score' ? `Reach ${g.need} points` : `${i ? '' : 'Clear '}${g.need} ${GEMS[g.t].name}`)).join(' and ');
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#4a1460', '#120420', 'rgba(255,110,220,0.09)');
    c.textBaseline = 'middle';
    drawBoard(c, t);
    drawPanels(c, t);
    drawButtons(c, t);
    // One-line help on top
    const line = result ? '' : held ? 'Arrow = swap with that gem  ·  OK = put it down' : 'Arrows move  ·  OK picks a gem  ·  Arrow swaps  ·  Back exits';
    if (line && L.wide) text(c, line, W / 2, L.by * 0.45, Math.max(18, Math.min(H * 0.032, 30)), 'rgba(255,255,255,0.7)', 700);
    const m = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    // Level intro banner
    if (introT < 2.6 && !result) {
      const a = Math.min(1, introT * 3, (2.6 - introT) * 3);
      c.globalAlpha = a;
      const bw = Math.min(W * 0.9, L.B * 1.15), bh = L.cs * 1.6, y = L.by + L.B / 2;
      roundRect(c, W / 2 - bw / 2, y - bh / 2, bw, bh, 22);
      c.fillStyle = 'rgba(30,6,50,0.88)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke();
      text(c, `Level ${level}`, W / 2, y - bh * 0.2, bh * 0.3, '#ffd23f', 900);
      c.font = `800 100px system-ui, sans-serif`;
      const fit = Math.min(bh * 0.22, (bw * 0.92) / c.measureText(goalSentence()).width * 100);
      text(c, goalSentence(), W / 2, y + bh * 0.2, fit, '#fff', 800);
      c.globalAlpha = 1;
    }
    if (result) drawPanel(c, W, H);
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (level > 1) Kit.record('gemswap', level - 1);
})();
