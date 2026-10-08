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
  let landSound = 0, bump = 0, drag = null, twinkleT = 0, popped = [];
  const twinkles = [];

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
  const BUTTONS = [{ id: 'hint', label: 'Hint' }, { id: 'restart', label: 'Restart' }];
  function layout(W, H) {
    const wide = W / H > 1.15;
    let B, bx, by;
    if (wide) {
      B = Math.min(H * 0.8, W * 0.48); bx = (W - B) / 2; by = H * 0.125;
      const f = (B / N) * 0.34, pw = Math.min(bx - f - W * 0.045, B * 0.55);
      L = { wide, left: { x: bx - f - W * 0.02 - pw, w: pw }, right: { x: bx + B + f + W * 0.02, w: pw } };
    } else {
      B = Math.min(W * 0.94, H * 0.56); bx = (W - B) / 2; by = H * 0.24;
      L = { wide };
    }
    Object.assign(L, { B, bx, by, cs: B / N, frame: (B / N) * 0.34 });
    const bh = Math.max(44, Math.min(H * 0.08, 64));
    if (wide) {
      const r = L.right;
      L.buttons = BUTTONS.map((b, i) => ({ ...b, x: r.x, y: by + B - (2 - i) * (bh + 14) + 14, w: r.w, h: bh }));
    } else {
      const bw = Math.min(W * 0.4, 220);
      L.buttons = BUTTONS.map((b, i) => ({ ...b, x: W / 2 - bw - 8 + i * (bw + 16), y: by + B + 20, w: bw, h: bh }));
    }
    L.font = Math.max(18, Math.min(H * 0.034, 34));
    sprites.clear(); starIcons.clear(); boardArt = null; scene = null;
  }
  Kit.onResize(layout);
  const cellX = (c) => L.bx + c * L.cs, cellY = (r) => L.by + r * L.cs;

  // ---------- Art: faceted gems, glows and sparkles, each baked once per size (TV boxes then only copy pictures) ----------
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  function bake(w, h, fn, scale) {
    const d = scale || dprNow(), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * d)); cv.height = Math.max(1, Math.ceil(h * d));
    const c = cv.getContext('2d'); c.scale(d, d); fn(c);
    cv.w = w; cv.h = h;
    return cv;
  }
  function pathOf(c, pts) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); }
  // The outline of each cut, as points round the centre.
  function outline(shape, R) {
    const P = [];
    const poly = (n, r, a0) => { for (let i = 0; i < n; i++) { const a = a0 + i * 2 * Math.PI / n; P.push([Math.cos(a) * r, Math.sin(a) * r]); } };
    if (shape === 'heart') {
      const cub = (a, b, c2, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c2 + t * t * t * d; };
      const segs = [[[0, -0.48], [0.8, -1.12], [1.38, 0.02], [0, 0.94]], [[0, 0.94], [-1.38, 0.02], [-0.8, -1.12], [0, -0.48]]];
      for (const s of segs) for (let i = 0; i < 9; i++) { const t = i / 9; P.push([cub(s[0][0], s[1][0], s[2][0], s[3][0], t) * R, cub(s[0][1], s[1][1], s[2][1], s[3][1], t) * R]); }
    } else if (shape === 'hex') poly(6, R * 1.02, -Math.PI / 2);
    else if (shape === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? R * 0.55 : R * 1.1; P.push([Math.cos(a) * r, Math.sin(a) * r + R * 0.07]); } }
    else if (shape === 'square') [[-0.5, -0.84], [0.5, -0.84], [0.84, -0.5], [0.84, 0.5], [0.5, 0.84], [-0.5, 0.84], [-0.84, 0.5], [-0.84, -0.5]].forEach(([x, y]) => P.push([x * R, y * R]));
    else if (shape === 'diamond') [[0, -1.08], [0.45, -0.54], [0.88, 0], [0.45, 0.54], [0, 1.08], [-0.45, 0.54], [-0.88, 0], [-0.45, -0.54]].forEach(([x, y]) => P.push([x * R, y * R]));
    else if (shape === 'tri') [[-0.16, -0.78], [0.16, -0.78], [1.0, 0.62], [0.84, 0.86], [-0.84, 0.86], [-1.0, 0.62]].forEach(([x, y]) => P.push([x * R, y * R + R * 0.04]));
    else poly(12, R * 0.98, -Math.PI / 2);
    return P;
  }
  const LIGHT = [-0.45, -0.89];
  function drawCut(c, shape, R, colorOf, opts = {}) {
    const P = outline(shape, R), n = P.length;
    const cy = shape === 'heart' ? R * 0.08 : shape === 'tri' ? R * 0.22 : shape === 'star' ? R * 0.07 : 0;
    const k = shape === 'star' ? 0.42 : shape === 'heart' ? 0.5 : 0.56;
    const Q = P.map(([x, y]) => [x * k, (y - cy) * k + cy - R * 0.05]);
    // Contact shadow
    const sh = c.createRadialGradient(0, R * 0.95, 0, 0, R * 0.95, R * 0.95);
    sh.addColorStop(0, 'rgba(0,0,0,0.5)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    c.save(); c.scale(1, 0.28); c.fillStyle = sh; c.beginPath(); c.arc(0, R * 0.95 / 0.28, R * 0.95, 0, Math.PI * 2); c.fill(); c.restore();
    c.save(); c.translate(0, R * 0.05); pathOf(c, P); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill(); c.restore();
    // Crown facets: lit by where they face, alternating a touch for sparkle.
    for (let i = 0; i < n; i++) {
      const a = P[i], b = P[(i + 1) % n], qa = Q[i], qb = Q[(i + 1) % n];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 - cy, ml = Math.hypot(mx, my) || 1;
      const lit = (mx / ml) * LIGHT[0] + (my / ml) * LIGHT[1];
      const col = colorOf(i);
      const v = lit * 0.42 + (i % 2 ? 0.08 : -0.06);
      const g = c.createLinearGradient(mx, my + cy, (qa[0] + qb[0]) / 2, (qa[1] + qb[1]) / 2);
      g.addColorStop(0, shade(col, clamp(v - 0.22, -0.9, 0.9))); g.addColorStop(1, shade(col, clamp(v + 0.12, -0.9, 0.9)));
      c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(qb[0], qb[1]); c.lineTo(qa[0], qa[1]); c.closePath();
      c.fillStyle = g; c.fill();
      c.lineWidth = Math.max(0.6, R * 0.025); c.strokeStyle = lit > 0.2 ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.12)'; c.stroke();
    }
    // The table (flat top), with an inner glow and a glare.
    const top = Math.min(...Q.map((q) => q[1])), bot = Math.max(...Q.map((q) => q[1]));
    const base = opts.table || colorOf(0);
    const tg = c.createLinearGradient(0, top, 0, bot);
    tg.addColorStop(0, shade(base, 0.55)); tg.addColorStop(0.55, shade(base, 0.12)); tg.addColorStop(1, shade(base, -0.12));
    pathOf(c, Q); c.fillStyle = tg; c.fill();
    c.save(); pathOf(c, Q); c.clip();
    c.globalCompositeOperation = 'lighter';
    const ig = c.createRadialGradient(0, cy, 0, 0, cy, R * 0.6);
    ig.addColorStop(0, opts.glow || rgba(base, 0.55)); ig.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = ig; c.fillRect(-R, -R, R * 2, R * 2);
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(255,255,255,0.32)';
    c.beginPath(); c.moveTo(-R, top - R * 0.1); c.lineTo(R * 0.15, top - R * 0.1); c.lineTo(-R * 0.4, bot); c.lineTo(-R, bot); c.closePath(); c.fill();
    c.restore();
    pathOf(c, Q); c.lineWidth = Math.max(0.6, R * 0.03); c.strokeStyle = 'rgba(255,255,255,0.55)'; c.stroke();
    // Outer edge: dark girdle, bright rim where the light hits.
    pathOf(c, P); c.lineWidth = Math.max(1, R * 0.06); c.lineJoin = 'round'; c.strokeStyle = shade(colorOf(0), -0.62); c.stroke();
    const rg = c.createLinearGradient(-R, -R, R * 0.3, R * 0.3);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.5, 'rgba(255,255,255,0)');
    pathOf(c, P); c.lineWidth = Math.max(0.8, R * 0.035); c.strokeStyle = rg; c.stroke();
    return { P, Q, top, cy };
  }
  function glint(c, x, y, s, a = 1) {
    // A four-point sparkle with a soft glow.
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a;
    const g = c.createRadialGradient(x, y, 0, x, y, s * 1.3);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(x - s * 1.3, y - s * 1.3, s * 2.6, s * 2.6);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s * 0.8, y); c.quadraticCurveTo(x, y, x, y + s);
    c.quadraticCurveTo(x, y, x - s * 0.8, y); c.quadraticCurveTo(x, y, x, y - s); c.fill();
    c.restore();
  }
  const sprites = new Map();
  function sprite(t, s, size) {
    const key = t + '|' + s + '|' + Math.round(size);
    let sp = sprites.get(key);
    if (sp) return sp;
    sp = bake(size, size, (c) => {
      c.translate(size / 2, size / 2);
      const R = size * 0.4;
      if (s === 'rainbow') {
        const halo = c.createRadialGradient(0, 0, R * 0.5, 0, 0, size * 0.5);
        halo.addColorStop(0, 'rgba(255,240,255,0.35)'); halo.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = halo; c.fillRect(-size / 2, -size / 2, size, size);
        const cut = drawCut(c, 'round', R, (i) => GEMS[(i >> 1) % 6].color, { table: '#c9b6ff', glow: 'rgba(255,200,255,0.35)' });
        glint(c, -R * 0.3, cut.top + R * 0.1, R * 0.32); glint(c, R * 0.42, R * 0.38, R * 0.18);
        return;
      }
      const G = GEMS[t], col = G.color;
      if (s === 'bomb') {
        const halo = c.createRadialGradient(0, 0, R * 0.55, 0, 0, size * 0.5);
        halo.addColorStop(0, 'rgba(255,220,120,0.85)'); halo.addColorStop(1, 'rgba(255,190,60,0)');
        c.fillStyle = halo; c.fillRect(-size / 2, -size / 2, size, size);
      }
      const cut = drawCut(c, G.shape, R, () => col);
      if (s === 'h' || s === 'v') {
        // Line blaster: a bright streak of light through the gem, gold arrows at both ends.
        c.save(); pathOf(c, cut.P); c.clip(); if (s === 'v') c.rotate(Math.PI / 2);
        c.globalCompositeOperation = 'lighter';
        for (const [off, w, a] of [[0, 0.34, 0.95], [-0.5, 0.12, 0.6], [0.5, 0.12, 0.6]]) {
          const g = c.createLinearGradient(0, (off - w) * R, 0, (off + w) * R);
          g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, `rgba(255,255,255,${a})`); g.addColorStop(1, 'rgba(255,255,255,0)');
          c.fillStyle = g; c.fillRect(-R * 1.3, (off - w) * R, R * 2.6, w * 2 * R);
        }
        c.restore();
        c.save(); if (s === 'v') c.rotate(Math.PI / 2);
        for (const d of [-1, 1]) {
          c.beginPath(); c.moveTo(d * size * 0.49, 0); c.lineTo(d * size * 0.39, -size * 0.09); c.lineTo(d * size * 0.39, size * 0.09); c.closePath();
          const ag = c.createLinearGradient(0, -size * 0.09, 0, size * 0.09); ag.addColorStop(0, '#fff6c2'); ag.addColorStop(1, '#e0a020');
          c.fillStyle = ag; c.fill(); c.lineWidth = Math.max(1, size * 0.015); c.strokeStyle = '#6b3d00'; c.stroke();
        }
        c.restore();
      }
      if (s === 'bomb') {
        // A burning star core.
        c.save(); c.translate(0, cut.cy * 0.6);
        c.globalCompositeOperation = 'lighter';
        const cg = c.createRadialGradient(0, 0, 0, 0, 0, R * 0.5);
        cg.addColorStop(0, 'rgba(255,255,230,1)'); cg.addColorStop(0.4, 'rgba(255,220,120,0.7)'); cg.addColorStop(1, 'rgba(255,160,40,0)');
        c.fillStyle = cg; c.fillRect(-R * 0.5, -R * 0.5, R, R);
        c.globalCompositeOperation = 'source-over';
        c.fillStyle = '#fff';
        c.beginPath();
        for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? R * 0.12 : R * 0.34; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
        c.closePath(); c.fill();
        c.restore();
      }
      glint(c, -R * 0.28, cut.top + R * 0.08, R * 0.24);
      glint(c, R * 0.36, R * 0.42, R * 0.1, 0.8);
    });
    sprites.set(key, sp);
    return sp;
  }
  function drawGem(c, g, x, y, size, scale = 1, alpha = 1, rot = 0, sx = 1, sy = 1) {
    const sp = sprite(g.t, g.s, size);
    c.globalAlpha = alpha;
    const w = size * scale * sx, h = size * scale * sy;
    if (rot) {
      c.save(); c.translate(x + size / 2, y + size / 2); c.rotate(rot);
      c.drawImage(sp, -w / 2, -h / 2, w, h);
      c.restore();
    } else c.drawImage(sp, x + (size - w) / 2, y + (size - h) / 2 + (size * scale - h) / 2, w, h); // squash keeps the base down
    c.globalAlpha = 1;
  }
  // Soft glow dots and star sparkles, one picture per colour.
  const glows = new Map();
  function glowSprite(color) {
    let g = glows.get(color);
    if (g) return g;
    g = bake(64, 64, (c) => {
      const rg = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, color); rg.addColorStop(0.35, rgba(color, 0.5)); rg.addColorStop(1, rgba(color, 0));
      c.fillStyle = rg; c.fillRect(0, 0, 64, 64);
    }, 1);
    glows.set(color, g);
    return g;
  }
  const stars4 = new Map();
  function starSprite(color) {
    let g = stars4.get(color);
    if (g) return g;
    g = bake(48, 48, (c) => {
      const rg = c.createRadialGradient(24, 24, 0, 24, 24, 24);
      rg.addColorStop(0, rgba(color, 0.9)); rg.addColorStop(1, rgba(color, 0));
      c.fillStyle = rg; c.fillRect(0, 0, 48, 48);
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(24, 2); c.quadraticCurveTo(24, 24, 44, 24); c.quadraticCurveTo(24, 24, 24, 46);
      c.quadraticCurveTo(24, 24, 4, 24); c.quadraticCurveTo(24, 24, 24, 2); c.fill();
    }, 1);
    stars4.set(color, g);
    return g;
  }
  // Sparkle particles of our own (star shaped, added light).
  const sparks = [];
  function spark(x, y, color, n, speed = 1) {
    for (let i = 0; i < n && sparks.length < 160; i++) {
      const a = Math.random() * Math.PI * 2, v = (80 + Math.random() * 260) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0, max: 0.45 + Math.random() * 0.4, size: 10 + Math.random() * 16, color, rot: Math.random() * 3 });
    }
  }
  function stepSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt;
      if (p.life > p.max) { sparks.splice(i, 1); continue; }
      p.vy += 500 * dt; p.vx *= 1 - dt * 2; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4;
    }
  }
  function drawSparks(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of sparks) {
      const k = p.life / p.max, s = p.size * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.drawImage(starSprite(p.color), -s, -s, s * 2, s * 2);
      c.restore();
    }
    c.restore();
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
        const col = d.g.t >= 0 ? GEMS[d.g.t].color : '#ffffff', x = L.bx + (d.c + 0.5) * L.cs, y = L.by + (d.r + 0.5) * L.cs;
        spark(x, y, col, dying.length > 30 ? 1 : 3, 0.8);
        Kit.burst(x, y, col, dying.length > 30 ? 1 : 3, 0.7);
      }
      if (clock - d.t0 > 0.3) dying.splice(i, 1);
    }
    for (let i = fxs.length - 1; i >= 0; i--) if (clock - fxs[i].t0 > 0.5) fxs.splice(i, 1);
    stepSparks(dt);
    // Now and then a gem catches the light.
    twinkleT -= dt;
    if (twinkleT <= 0) { twinkleT = 0.18 + Math.random() * 0.2; twinkles.push({ r: Math.floor(Math.random() * N), c: Math.floor(Math.random() * N), t0: clock }); if (twinkles.length > 6) twinkles.shift(); }

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
        spark(x, y, g.t >= 0 ? GEMS[g.t].color : '#ffffff', 8, 1);
        Kit.float('+250', x, y, { color: '#ffd23f', size: L.cs * 0.42 });
        snd.coin(movesLeft);
      } else if (bonusT > 1.4 && movesLeft <= 0) {
        result = 'win'; resultT = clock; starsWon = starsFor(score); phase = 'done'; popped = [];
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
  function text(c, s, x, y, size, color, weight = 600, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(s, x, y);
  }
  function panel(c, x, y, w, h, t, focus) {
    roundRect(c, x, y, w, h, Math.min(26, h * 0.22)); c.fillStyle = 'rgba(34,6,40,0.8)'; c.fill();
    Kit.glass(c, x, y, w, h, Math.min(26, h * 0.22), { tint: 'rgba(110,30,120,0.22)', edge: 'rgba(255,214,140,0.5)', focus, t });
  }

  // The royal treasure hall behind the board: painted once per screen size.
  let scene = null, boardArt = null, rays = null;
  const motes = Array.from({ length: 36 }, () => ({ x: Math.random(), y: Math.random(), s: 0.4 + Math.random(), v: 0.01 + Math.random() * 0.025, p: Math.random() * 6 }));
  const GOLD = (c, x0, y0, x1, y1) => {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    [['#fff4c0', 0], ['#f0c050', 0.18], ['#9a5e10', 0.36], ['#ffe08a', 0.52], ['#a8681a', 0.72], ['#f8d070', 0.86], ['#7a4808', 1]].forEach(([col, k]) => g.addColorStop(k, col));
    return g;
  };
  function chrome(c) {
    const { by, B } = L;
    if (L.wide) {
      const h1 = B * 0.36, gy = by + h1 + B * 0.03;
      panel(c, L.left.x, by, L.left.w, h1); panel(c, L.left.x, gy, L.left.w, B - h1 - B * 0.03);
      panel(c, L.right.x, by, L.right.w, h1);
      panel(c, L.right.x, gy, L.right.w, B - h1 - B * 0.03 - (L.buttons.length * (L.buttons[0].h + 14)));
    } else panel(c, Kit.W * 0.04, L.by - L.cs * 3.3, Kit.W * 0.92, L.cs * 2.6);
    L.buttons.forEach((b) => { roundRect(c, b.x, b.y, b.w, b.h, b.h / 2); c.fillStyle = 'rgba(34,6,40,0.75)'; c.fill(); Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: 'rgba(110,30,120,0.25)', edge: 'rgba(255,214,140,0.5)' }); });
  }
  function bakeScene(W, H) {
    const floorY = H * 0.8;
    scene = bake(W, H, (c) => {
      let g = c.createLinearGradient(0, 0, 0, floorY);
      g.addColorStop(0, '#3d0d33'); g.addColorStop(0.6, '#2a0926'); g.addColorStop(1, '#1d0619');
      c.fillStyle = g; c.fillRect(0, 0, W, floorY);
      // Damask wall pattern
      c.fillStyle = 'rgba(255,190,120,0.035)';
      for (let y = 20; y < floorY; y += 70) for (let x = (y / 70) % 2 ? 35 : 0; x < W; x += 70) {
        c.beginPath(); c.moveTo(x, y - 14); c.quadraticCurveTo(x + 12, y, x, y + 14); c.quadraticCurveTo(x - 12, y, x, y - 14); c.fill();
      }
      const n = 6, step = W / n;
      // Tall arched windows full of warm light
      for (let i = 0; i < n; i++) {
        const ax = (i + 0.5) * step, aw = step * 0.42, top = H * 0.1, bot = floorY - H * 0.06;
        const glow = c.createRadialGradient(ax, top + (bot - top) * 0.35, 0, ax, top + (bot - top) * 0.35, aw * 1.6);
        glow.addColorStop(0, 'rgba(255,170,90,0.28)'); glow.addColorStop(1, 'rgba(255,120,60,0)');
        c.fillStyle = glow; c.fillRect(ax - aw * 1.6, top - aw, aw * 3.2, bot - top + aw * 2);
        c.beginPath(); c.moveTo(ax - aw / 2, bot); c.lineTo(ax - aw / 2, top + aw / 2); c.arc(ax, top + aw / 2, aw / 2, Math.PI, 0); c.lineTo(ax + aw / 2, bot); c.closePath();
        const wg = c.createLinearGradient(0, top, 0, bot);
        wg.addColorStop(0, '#ffe3a8'); wg.addColorStop(0.5, '#f0a050'); wg.addColorStop(1, '#8a3a28');
        c.fillStyle = wg; c.fill();
        c.lineWidth = Math.max(3, aw * 0.07); c.strokeStyle = GOLD(c, ax - aw, top, ax + aw, bot); c.stroke();
        c.save(); c.clip();
        c.strokeStyle = 'rgba(80,25,20,0.55)'; c.lineWidth = Math.max(2, aw * 0.035);
        for (let k = 1; k < 3; k++) { c.beginPath(); c.moveTo(ax - aw / 2 + (aw * k) / 3, top); c.lineTo(ax - aw / 2 + (aw * k) / 3, bot); c.stroke(); }
        for (let y = top + aw * 0.9; y < bot; y += aw * 0.55) { c.beginPath(); c.moveTo(ax - aw, y); c.lineTo(ax + aw, y); c.stroke(); }
        c.restore();
      }
      // Marble columns with gold capitals
      for (let i = 0; i <= n; i++) {
        const x = i * step, cw = Math.max(26, W * 0.045), top = H * 0.06, bot = floorY;
        const cg = c.createLinearGradient(x - cw / 2, 0, x + cw / 2, 0);
        cg.addColorStop(0, '#3a1a20'); cg.addColorStop(0.25, '#c9a98a'); cg.addColorStop(0.5, '#f6e6cf'); cg.addColorStop(0.75, '#a88466'); cg.addColorStop(1, '#2a1014');
        c.fillStyle = cg; c.fillRect(x - cw / 2, top, cw, bot - top);
        c.strokeStyle = 'rgba(70,30,20,0.25)'; c.lineWidth = 1.5;
        for (let k = 1; k < 4; k++) { const fx = x - cw / 2 + (cw * k) / 4; c.beginPath(); c.moveTo(fx, top + 20); c.lineTo(fx, bot - 20); c.stroke(); }
        c.fillStyle = GOLD(c, x - cw, top, x + cw, top + cw * 0.8);
        roundRect(c, x - cw * 0.8, top - 4, cw * 1.6, cw * 0.55, 6); c.fill();
        roundRect(c, x - cw * 0.75, bot - cw * 0.5, cw * 1.5, cw * 0.5, 4); c.fill();
      }
      // Crimson drapes with gold trim along the top
      for (let i = 0; i < n * 2; i++) {
        const x0 = (i * W) / (n * 2), x1 = ((i + 1) * W) / (n * 2), sag = H * 0.07;
        c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, 0); c.quadraticCurveTo((x0 + x1) / 2, sag * 2, x0, 0); c.closePath();
        const dg = c.createLinearGradient(0, 0, 0, sag);
        dg.addColorStop(0, '#5a0a1a'); dg.addColorStop(1, '#b0182e');
        c.fillStyle = dg; c.fill();
        c.beginPath(); c.moveTo(x1, 0); c.quadraticCurveTo((x0 + x1) / 2, sag * 2, x0, 0);
        c.lineWidth = 4; c.strokeStyle = '#e8b448'; c.stroke();
        c.fillStyle = '#e8b448'; c.beginPath(); c.arc(x1, 6, 6, 0, Math.PI * 2); c.fill();
      }
      // Floor: polished marble in perspective, a royal carpet down the middle
      g = c.createLinearGradient(0, floorY, 0, H);
      g.addColorStop(0, '#2a1218'); g.addColorStop(1, '#0d0508');
      c.fillStyle = g; c.fillRect(0, floorY, W, H - floorY);
      c.strokeStyle = 'rgba(255,200,140,0.10)'; c.lineWidth = 1.5;
      const vx = W / 2, vy = floorY - H * 0.5;
      for (let i = -12; i <= 12; i++) { const bxp = W / 2 + i * W * 0.09; c.beginPath(); c.moveTo(vx + (bxp - vx) * ((floorY - vy) / (H - vy)), floorY); c.lineTo(bxp, H); c.stroke(); }
      for (let k = 0; k < 7; k++) { const y = floorY + (H - floorY) * Math.pow(k / 7, 1.6); c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
      c.beginPath(); c.moveTo(W * 0.42, floorY); c.lineTo(W * 0.58, floorY); c.lineTo(W * 0.72, H); c.lineTo(W * 0.28, H); c.closePath();
      const cpg = c.createLinearGradient(0, floorY, 0, H); cpg.addColorStop(0, '#6a0c1c'); cpg.addColorStop(1, '#a5142c');
      c.fillStyle = cpg; c.fill(); c.lineWidth = 4; c.strokeStyle = '#d9a43c'; c.stroke();
      // Heaps of treasure in the corners
      const heap = (hx, hy, hw) => {
        for (let k = 0; k < 60; k++) {
          const a = Math.random(), x = hx + (Math.random() - 0.5) * hw * (1 - a * 0.7), y = hy - a * hw * 0.35;
          const r = hw * 0.035;
          c.beginPath(); c.ellipse(x, y, r, r * 0.55, 0, 0, Math.PI * 2);
          const coin = c.createLinearGradient(0, y - r, 0, y + r); coin.addColorStop(0, '#fff2b0'); coin.addColorStop(0.5, '#e8b030'); coin.addColorStop(1, '#8a5a10');
          c.fillStyle = coin; c.fill(); c.lineWidth = 1; c.strokeStyle = '#6b4008'; c.stroke();
        }
        for (let k = 0; k < 4; k++) { const sz = hw * 0.16; c.drawImage(sprite(k % 6, null, sz), hx + (k - 1.5) * hw * 0.18 - sz / 2, hy - hw * 0.28 - (k % 2) * hw * 0.06 - sz / 2, sz, sz); }
      };
      heap(W * 0.06, H * 0.99, W * 0.16); heap(W * 0.94, H * 0.99, W * 0.16);
      // Slanted light shafts from the windows
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.7;
      for (let i = 0; i < 6; i++) {
        const x = ((i + 0.5) * W) / 6, w = W / 15;
        const sg = c.createLinearGradient(x, 0, x + H * 0.4, H);
        sg.addColorStop(0, 'rgba(255,220,150,0.22)'); sg.addColorStop(1, 'rgba(255,200,120,0)');
        c.fillStyle = sg;
        c.beginPath(); c.moveTo(x - w, H * 0.1); c.lineTo(x + w, H * 0.1); c.lineTo(x + w * 3 + H * 0.3, H); c.lineTo(x - w + H * 0.3, H); c.closePath(); c.fill();
      }
      c.restore();
      // Vignette
      const vg = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(5,0,8,0.75)');
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
      // The glass panels and resting buttons never move: baked here too (their shadows are costly per frame).
      chrome(c);
    }, 1);
  }
  // The board: an ornate gold frame round a velvet tray, with sunken cells.
  function bakeBoard() {
    const { B, cs } = L, f = L.frame, pad = cs * 0.7, w = B + 2 * f + 2 * pad;
    boardArt = bake(w, w, (c) => {
      c.translate(pad + f, pad + f);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = cs * 0.7; c.shadowOffsetY = cs * 0.22;
      roundRect(c, -f, -f, B + 2 * f, B + 2 * f, f * 1.1); c.fillStyle = '#3a2008'; c.fill(); c.restore();
      roundRect(c, -f, -f, B + 2 * f, B + 2 * f, f * 1.1); c.fillStyle = GOLD(c, -f, -f, B + f, B + f); c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)'; roundRect(c, -f + 2, -f + 2, B + 2 * f - 4, B + 2 * f - 4, f); c.stroke();
      c.lineWidth = Math.max(2, f * 0.12); c.strokeStyle = '#5a3000'; roundRect(c, -f * 0.55, -f * 0.55, B + f * 1.1, B + f * 1.1, f * 0.7); c.stroke();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,240,190,0.8)'; roundRect(c, -f * 0.55 + 2, -f * 0.55 + 2, B + f * 1.1, B + f * 1.1, f * 0.7); c.stroke();
      // Rivets
      const rivet = (x, y, r) => { const g = c.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#e0a838'); g.addColorStop(1, '#6a3c06'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); };
      for (let i = 1; i < N; i++) { const p = i * cs; rivet(p, -f * 0.78, f * 0.11); rivet(p, B + f * 0.78, f * 0.11); rivet(-f * 0.78, p, f * 0.11); rivet(B + f * 0.78, p, f * 0.11); }
      // Corner medallions set with rubies
      for (const [x, y] of [[0, 0], [B, 0], [0, B], [B, B]]) {
        const ox = x ? f * 0.25 : -f * 0.25, oy = y ? f * 0.25 : -f * 0.25;
        c.beginPath(); c.arc(x + ox, y + oy, f * 0.95, 0, Math.PI * 2); c.fillStyle = GOLD(c, x - f, y - f, x + f, y + f); c.fill();
        c.lineWidth = 2; c.strokeStyle = '#5a3000'; c.stroke();
        const rg = c.createRadialGradient(x + ox - f * 0.15, y + oy - f * 0.18, 0, x + ox, y + oy, f * 0.55);
        rg.addColorStop(0, '#ffb0c0'); rg.addColorStop(0.4, '#e01840'); rg.addColorStop(1, '#5a0010');
        c.beginPath(); c.arc(x + ox, y + oy, f * 0.52, 0, Math.PI * 2); c.fillStyle = rg; c.fill();
        c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x + ox - f * 0.17, y + oy - f * 0.17, f * 0.12, 0, Math.PI * 2); c.fill();
      }
      // Velvet tray
      const e = cs * 0.08;
      roundRect(c, -e, -e, B + 2 * e, B + 2 * e, cs * 0.22);
      const vg = c.createRadialGradient(B / 2, B * 0.4, 0, B / 2, B / 2, B * 0.75);
      vg.addColorStop(0, '#36145e'); vg.addColorStop(1, '#14061f');
      c.fillStyle = vg; c.fill();
      // Sunken cells, lit from above
      for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
        const x = col * cs + cs * 0.05, y = r * cs + cs * 0.05, s = cs * 0.9;
        roundRect(c, x, y, s, s, cs * 0.16);
        const cg = c.createLinearGradient(0, y, 0, y + s);
        const lt = (r + col) % 2 ? 0.05 : 0.10;
        cg.addColorStop(0, `rgba(0,0,0,${0.25})`); cg.addColorStop(0.25, `rgba(255,255,255,${lt})`); cg.addColorStop(1, `rgba(255,255,255,${lt + 0.04})`);
        c.fillStyle = cg; c.fill();
        c.lineWidth = 1; c.strokeStyle = 'rgba(255,220,255,0.10)'; c.stroke();
      }
      // Inner shadow cast by the frame
      c.save();
      roundRect(c, -e, -e, B + 2 * e, B + 2 * e, cs * 0.22); c.clip();
      c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = cs * 0.35;
      c.beginPath(); c.rect(-f * 3, -f * 3, B + f * 6, B + f * 6);
      const rr = cs * 0.22, x0 = -e, y0 = -e, x1 = B + e, y1 = B + e;
      c.moveTo(x0 + rr, y0); c.arcTo(x1, y0, x1, y1, rr); c.arcTo(x1, y1, x0, y1, rr); c.arcTo(x0, y1, x0, y0, rr); c.arcTo(x0, y0, x1, y0, rr); c.closePath();
      c.fillStyle = '#000'; c.fill('evenodd');
      c.restore();
    });
    boardArt.off = pad + f;
  }
  // Win-panel light rays, and the big stars.
  function bakeRays() {
    rays = bake(512, 512, (c) => {
      c.translate(256, 256);
      for (let i = 0; i < 18; i++) {
        c.rotate(Math.PI / 9);
        const g = c.createLinearGradient(0, 0, 0, -256); g.addColorStop(0, 'rgba(255,230,150,0.5)'); g.addColorStop(1, 'rgba(255,230,150,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(-40, -256); c.lineTo(40, -256); c.closePath(); c.fill();
      }
    }, 1);
  }
  function starPath(c, x, y, R) {
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? R * 0.48 : R; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath();
  }
  const starIcons = new Map();
  function starIcon(size, on) {
    const key = Math.round(size) + (on ? 'y' : 'n');
    let s = starIcons.get(key);
    if (s) return s;
    s = bake(size, size, (c) => {
      const R = size * 0.46, cx = size / 2, cy = size * 0.52;
      c.lineJoin = 'round';
      starPath(c, cx, cy + size * 0.03, R); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      starPath(c, cx, cy, R);
      if (on) { const g = c.createLinearGradient(0, cy - R, 0, cy + R); g.addColorStop(0, '#fff7b0'); g.addColorStop(0.45, '#ffcc22'); g.addColorStop(1, '#d07800'); c.fillStyle = g; }
      else c.fillStyle = 'rgba(40,20,60,0.7)';
      c.fill(); c.lineWidth = Math.max(1.5, size * 0.05); c.strokeStyle = on ? '#8a4a00' : 'rgba(255,255,255,0.35)'; c.stroke();
      if (on) { starPath(c, cx, cy - R * 0.08, R * 0.5); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill(); }
    });
    starIcons.set(key, s);
    return s;
  }
  function drawIcon(c, id, x, y, s, color) {
    c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(2, s * 0.13); c.lineCap = 'round'; c.lineJoin = 'round';
    if (id === 'hint') {
      c.beginPath(); c.arc(x, y - s * 0.12, s * 0.32, Math.PI * 0.8, Math.PI * 2.2); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.15, y + s * 0.3); c.lineTo(x + s * 0.15, y + s * 0.3); c.moveTo(x - s * 0.12, y + s * 0.45); c.lineTo(x + s * 0.12, y + s * 0.45); c.stroke();
      c.beginPath(); c.moveTo(x - s * 0.17, y + s * 0.15); c.lineTo(x - s * 0.17, y + s * 0.05); c.moveTo(x + s * 0.17, y + s * 0.15); c.lineTo(x + s * 0.17, y + s * 0.05); c.stroke();
    } else if (id === 'restart') {
      c.beginPath(); c.arc(x, y, s * 0.36, -Math.PI * 0.3, Math.PI * 1.45); c.stroke();
      const a = -Math.PI * 0.3, ax = x + Math.cos(a) * s * 0.36, ay = y + Math.sin(a) * s * 0.36;
      c.beginPath(); c.moveTo(ax + s * 0.2, ay - s * 0.02); c.lineTo(ax - s * 0.02, ay - s * 0.24); c.lineTo(ax - s * 0.06, ay + s * 0.08); c.closePath(); c.fill();
    } else if (id === 'sound' || id === 'mute') {
      c.beginPath(); c.moveTo(x - s * 0.42, y - s * 0.14); c.lineTo(x - s * 0.22, y - s * 0.14); c.lineTo(x, y - s * 0.36); c.lineTo(x, y + s * 0.36); c.lineTo(x - s * 0.22, y + s * 0.14); c.lineTo(x - s * 0.42, y + s * 0.14); c.closePath(); c.fill();
      if (id === 'sound') { c.lineWidth = s * 0.09; c.beginPath(); c.arc(x + s * 0.05, y, s * 0.2, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(x + s * 0.05, y, s * 0.36, -0.9, 0.9); c.stroke(); }
      else { c.lineWidth = s * 0.09; c.beginPath(); c.moveTo(x + s * 0.12, y - s * 0.16); c.lineTo(x + s * 0.42, y + s * 0.16); c.moveTo(x + s * 0.42, y - s * 0.16); c.lineTo(x + s * 0.12, y + s * 0.16); c.stroke(); }
    } else if (id === 'check') {
      const g = c.createLinearGradient(0, y - s / 2, 0, y + s / 2); g.addColorStop(0, '#9dffa8'); g.addColorStop(1, '#1fae4a');
      c.beginPath(); c.arc(x, y, s * 0.5, 0, Math.PI * 2); c.fillStyle = g; c.fill(); c.lineWidth = Math.max(2, s * 0.06); c.strokeStyle = '#0b5a22'; c.stroke();
      c.strokeStyle = '#fff'; c.lineWidth = s * 0.13; c.beginPath(); c.moveTo(x - s * 0.22, y + s * 0.02); c.lineTo(x - s * 0.05, y + s * 0.19); c.lineTo(x + s * 0.25, y - s * 0.17); c.stroke();
    }
    c.restore();
  }
  function goldPill(c, x, y, w, h, t) {
    // A focused button: polished gold with a pulsing glow.
    c.save();
    c.shadowColor = '#ffd23f'; c.shadowBlur = 16 + 8 * Math.sin(t * 5);
    roundRect(c, x, y, w, h, h / 2);
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#fff3a8'); g.addColorStop(0.5, '#ffc93a'); g.addColorStop(1, '#e08a10');
    c.fillStyle = g; c.fill(); c.restore();
    c.lineWidth = 2.5; c.strokeStyle = '#fff8d8'; roundRect(c, x, y, w, h, h / 2); c.stroke();
    roundRect(c, x + h * 0.25, y + h * 0.1, w - h * 0.5, h * 0.32, h * 0.16); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
  }
  function keycap(c, label, x, y, h) {
    c.font = `700 ${Math.round(h * 0.5)}px ${Kit.UI}`;
    const w = Math.max(h, c.measureText(label).width + h * 0.5);
    roundRect(c, x, y - h / 2, w, h, h * 0.25);
    const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, '#fff6dc'); g.addColorStop(1, '#d6b98a');
    c.fillStyle = g; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#7a5520'; c.stroke();
    text(c, label, x + w / 2, y + 1, h * 0.5, '#4a2a08', 700);
    return w;
  }
  function ribbon(c, cx, cy, w, h, col) {
    // A banner with folded tails, edged in gold.
    const tail = h * 0.9;
    for (const d of [-1, 1]) {
      const x0 = cx + d * (w / 2 - h * 0.3);
      c.beginPath(); c.moveTo(x0, cy - h * 0.25); c.lineTo(x0 + d * tail, cy - h * 0.25); c.lineTo(x0 + d * tail * 0.7, cy + h * 0.2); c.lineTo(x0 + d * tail, cy + h * 0.65); c.lineTo(x0, cy + h * 0.65); c.closePath();
      c.fillStyle = shade(col, -0.4); c.fill(); c.lineWidth = 2; c.strokeStyle = '#e8b448'; c.stroke();
    }
    c.beginPath(); c.moveTo(cx - w / 2, cy - h / 2); c.quadraticCurveTo(cx, cy - h * 0.75, cx + w / 2, cy - h / 2); c.lineTo(cx + w / 2, cy + h / 2); c.quadraticCurveTo(cx, cy + h * 0.25, cx - w / 2, cy + h / 2); c.closePath();
    const g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); g.addColorStop(0, shade(col, 0.25)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.3));
    c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd77a'; c.stroke();
  }
  function goalIcon(c, goal, x, y, size) {
    const gl = glowSprite(goal.kind === 'gem' ? GEMS[goal.t].color : '#ffd23f');
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.45; c.drawImage(gl, x - size * 0.8, y - size * 0.8, size * 1.6, size * 1.6); c.restore();
    if (goal.kind === 'gem') c.drawImage(sprite(goal.t, null, size), x - size / 2, y - size / 2, size, size);
    else c.drawImage(starIcon(size * 0.9, true), x - size * 0.45, y - size * 0.45, size * 0.9, size * 0.9);
  }
  function goalLine(goal, i) {
    const left = Math.max(0, goal.need - prog[i]);
    return goal.kind === 'score' ? `${Math.min(prog[i], goal.need)} / ${goal.need}` : `${left}`;
  }
  function drawPanels(c, t) {
    const F = L.font, { by, B } = L;
    if (L.wide) {
      const lp = L.left, rp = L.right, cx = lp.x + lp.w / 2;
      // Level and moves
      const h1 = B * 0.36;
      Kit.title(c, `Level ${shownLevel()}`, cx, by + h1 * 0.17, F * 1.2, { color: '#ffd77a' });
      const mr = Math.min(h1 * 0.3, lp.w * 0.25), my = by + h1 * 0.6;
      c.beginPath(); c.arc(cx, my, mr, 0, Math.PI * 2); c.fillStyle = GOLD(c, cx - mr, my - mr, cx + mr, my + mr); c.fill();
      const ig = c.createRadialGradient(cx, my - mr * 0.3, 0, cx, my, mr * 0.85);
      ig.addColorStop(0, '#5a2a8a'); ig.addColorStop(1, '#1a0830');
      c.beginPath(); c.arc(cx, my, mr * 0.82, 0, Math.PI * 2); c.fillStyle = ig; c.fill();
      const low = movesLeft <= 5 && !result && phase !== 'bonus';
      const mp = low ? 1 + Math.sin(t * 8) * 0.06 : 1;
      c.save(); c.translate(cx, my); c.scale(mp, mp);
      Kit.title(c, `${movesLeft}`, 0, mr * 0.04, mr * 0.95, { color: low ? '#ff7088' : '#ffffff' });
      c.restore();
      text(c, 'MOVES', cx, by + h1 * 0.92, F * 0.68, 'rgba(255,230,200,0.8)', 700);
      // Goals
      const gy = by + h1 + B * 0.03, gh = B - h1 - B * 0.03;
      text(c, 'GOAL', cx, gy + F * 1.1, F * 0.75, 'rgba(255,230,200,0.8)', 700);
      const rowH = Math.min((gh - F * 2.2) / S.goals.length, F * 5), icon = Math.min(rowH * 0.7, lp.w * 0.32);
      const top = gy + F * 1.9 + (gh - F * 2.2 - rowH * S.goals.length) / 2;
      S.goals.forEach((goal, i) => {
        const y = top + (i + 0.5) * rowH, done = prog[i] >= goal.need, sc = goal.kind === 'score';
        goalIcon(c, goal, lp.x + lp.w * (sc ? 0.5 : 0.3), y - (sc ? F * 0.6 : 0), icon * (sc ? 0.8 : 1));
        if (done) drawIcon(c, 'check', lp.x + lp.w * (sc ? 0.5 : 0.68), y + (sc ? icon * 0.45 : 0), F * 1.5);
        else if (sc) text(c, goalLine(goal, i), cx, y + icon * 0.45, F * 0.95, '#fff', 600, 'center', Kit.FONT);
        else {
          Kit.title(c, goalLine(goal, i), lp.x + lp.w * 0.68, y - F * 0.25, F * 1.6, { color: '#ffffff' });
          text(c, 'to go', lp.x + lp.w * 0.68, y + F * 0.85, F * 0.7, 'rgba(255,230,200,0.7)', 600);
        }
      });
      // Score with its star meter
      const rx = rp.x, rcx = rx + rp.w / 2;
      text(c, 'SCORE', rcx, by + h1 * 0.15, F * 0.75, 'rgba(255,230,200,0.8)', 700);
      c.save(); c.translate(rcx, by + h1 * 0.42); const s = 1 + bump * 0.12; c.scale(s, s);
      Kit.title(c, `${Math.round(shown)}`, 0, 0, F * 1.75, { color: '#ffcf4a' });
      c.restore();
      drawStarBar(c, rx + rp.w * 0.1, by + h1 * 0.76, rp.w * 0.8, Math.max(14, F * 0.5));
      // How to play, with keycaps
      const th = B - h1 - B * 0.03 - (L.buttons.length * (L.buttons[0].h + 14));
      const kh = F * 1.05, lines = held ? [['←↑↓→', 'swap'], ['OK', 'put down']] : [['←↑↓→', 'move'], ['OK', 'pick a gem'], ['BACK', 'menu']];
      const ly0 = gy + th / 2 - ((lines.length - 1) * F * 1.5) / 2;
      lines.forEach(([k, s2], i) => {
        const y = ly0 + i * F * 1.5;
        const kw = keycap(c, k, rx + rp.w * 0.1, y, kh);
        text(c, s2, rx + rp.w * 0.1 + kw + F * 0.45, y, F * 0.78, 'rgba(255,240,225,0.9)', 600, 'left');
      });
    } else {
      Kit.title(c, `${Math.round(shown)}`, Kit.W * 0.78, L.by - L.cs * 2.55, F * 1.3, { color: '#ffcf4a' });
      Kit.title(c, `Level ${shownLevel()}`, Kit.W * 0.25, L.by - L.cs * 2.55, F * 1.1, { color: '#ffd77a' });
      text(c, `Moves ${movesLeft}`, Kit.W * 0.5, L.by - L.cs * 2.55, F, '#fff', 700, 'center', Kit.FONT);
      const n = S.goals.length;
      S.goals.forEach((goal, i) => {
        const x = Kit.W / 2 + (i - (n - 1) / 2) * L.cs * 2.6;
        goalIcon(c, goal, x - L.cs * 0.5, L.by - L.cs * 1.4, L.cs * 0.75);
        if (prog[i] >= goal.need) drawIcon(c, 'check', x + L.cs * 0.2, L.by - L.cs * 1.4, F * 1.2);
        else text(c, goalLine(goal, i), x, L.by - L.cs * 1.4, F, '#fff', 700, 'left', Kit.FONT);
      });
    }
  }
  function drawStarBar(c, x, y, w, h) {
    const max = S.stars[2], k = clamp(shown / max, 0, 1);
    roundRect(c, x, y - h / 2, w, h, h / 2); c.fillStyle = 'rgba(10,0,20,0.6)'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,220,160,0.35)'; c.stroke();
    if (k > 0) {
      const fw = Math.max(h, w * k);
      roundRect(c, x, y - h / 2, fw, h, h / 2);
      const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, '#ff5fb8'); g.addColorStop(0.6, '#ffb347'); g.addColorStop(1, '#ffe45c');
      c.fillStyle = g; c.fill();
      roundRect(c, x + 2, y - h / 2 + 2, fw - 4, h * 0.38, h * 0.2); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
    }
    [Math.max(S.stars[0], max * 0.12), S.stars[1], S.stars[2]].forEach((v, i) => {
      const sx = x + w * clamp(v / max, 0, 1) - (i === 2 ? h * 0.4 : 0), on = shown >= v && (i > 0 || goalsMet());
      const s = h * 2.2;
      c.drawImage(starIcon(s, on), sx - s / 2, y - s / 2, s, s);
    });
  }
  function drawBoard(c, t) {
    const { bx, by, B, cs } = L;
    if (!boardArt) bakeBoard();
    c.drawImage(boardArt, bx - boardArt.off, by - boardArt.off, boardArt.w, boardArt.h);
    c.save();
    c.beginPath(); c.rect(bx - cs * 0.1, by, B + cs * 0.2, B + cs * 0.1); c.clip();
    const heldGem = held ? grid[held.r][held.c] : null;
    const swapK = phase === 'swap' ? Math.sin(Math.min(1, phaseT / SWAP) * Math.PI) : 0;
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const g = grid[r][col];
      if (!g || g === heldGem) continue;
      let x = bx + g.fx * cs, y = by + g.fy * cs, sc = 1 + 0.018 * Math.sin(clock * 2.2 + r * 0.7 + col * 0.45), sxk = 1, syk = 1;
      if (y < by - cs) continue;
      if (clock - g.land < 0.22) { const q = (clock - g.land) / 0.22, s2 = Math.sin(q * Math.PI); sxk = 1 + s2 * 0.12; syk = 1 - s2 * 0.14; }
      else if (g.vy > 4) { sxk = 0.94; syk = 1.07; }
      if (swapK && (g.fx !== col || g.fy !== r)) sc *= 1 + swapK * 0.12;
      if (g.born > clock - 0.35 && g.s) { const q = clamp((clock - g.born) / 0.35, 0, 1); sc = q <= 0 ? 0 : ease.back(q); }
      if (hint && phase === 'idle' && (idleT % 2.2) < 1.2) {
        const [a, b] = hint;
        const isA = a.r === r && a.c === col, isB = b.r === r && b.c === col;
        if (isA || isB) { const o = isA ? b : a, w = Math.sin(clock * 18) * cs * 0.07; x += (o.c - col) * w; y += (o.r - r) * w; sc = 1.06; }
      }
      if (nopeAt && nopeAt.r === r && nopeAt.c === col && clock - nopeT < 0.3) x += Math.sin((clock - nopeT) * 60) * cs * 0.08;
      if (g.s === 'bomb') {
        sc *= 1 + Math.sin(clock * 6) * 0.04;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + 0.25 * Math.sin(clock * 6);
        c.drawImage(glowSprite('#ffc850'), x - cs * 0.25, y - cs * 0.25, cs * 1.5, cs * 1.5); c.restore();
      }
      drawGem(c, g, x, y, cs, sc, 1, g.s === 'rainbow' ? clock * 1.2 : 0, sxk, syk);
    }
    // Idle twinkles
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const tw of twinkles) {
      const q = (clock - tw.t0) / 0.6; if (q < 0 || q > 1) continue;
      const s = cs * 0.34 * Math.sin(q * Math.PI);
      c.drawImage(starSprite('#ffffff'), bx + (tw.c + 0.32) * cs - s, by + (tw.r + 0.3) * cs - s, s * 2, s * 2);
    }
    c.restore();
    // Gems being cleared: a flash of light, then they shrink away.
    for (const d of dying) {
      const age = clock - d.t0, x = bx + d.c * cs, y = by + d.r * cs;
      if (age < 0) { drawGem(c, d.g, x, y, cs); continue; }
      const q = clamp(age / 0.3, 0, 1);
      const sc = q < 0.3 ? 1 + q * 0.6 : 1.18 * (1 - ease.inOut((q - 0.3) / 0.7));
      drawGem(c, d.g, x, y, cs, Math.max(0.01, sc), 1 - q * 0.3);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 - q;
      const gs = cs * (1 + q * 0.8);
      c.drawImage(glowSprite(d.g.t >= 0 ? GEMS[d.g.t].color : '#ffffff'), x + cs / 2 - gs, y + cs / 2 - gs, gs * 2, gs * 2);
      c.drawImage(glowSprite('#ffffff'), x + cs / 2 - gs * 0.5, y + cs / 2 - gs * 0.5, gs, gs);
      c.restore();
    }
    c.restore();
    // Blasts, in added light
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const f of fxs) {
      const q = clamp((clock - f.t0) / 0.45, 0, 1), a = 1 - q;
      if (f.kind === 'beam') {
        const th = cs * (1.1 - q * 0.7), col = f.color || '#ffffff';
        for (const [w2, al, cc] of [[1.6, 0.5, col], [0.7, 0.9, '#ffffff']]) {
          c.globalAlpha = a * al;
          const half = (th * w2) / 2;
          const g = f.dir === 'h' ? c.createLinearGradient(0, by + (f.i + 0.5) * cs - half, 0, by + (f.i + 0.5) * cs + half) : c.createLinearGradient(bx + (f.i + 0.5) * cs - half, 0, bx + (f.i + 0.5) * cs + half, 0);
          g.addColorStop(0, rgba(cc, 0)); g.addColorStop(0.5, cc); g.addColorStop(1, rgba(cc, 0));
          c.fillStyle = g;
          if (f.dir === 'h') c.fillRect(bx - cs * 0.3, by + (f.i + 0.5) * cs - half, B + cs * 0.6, half * 2);
          else c.fillRect(bx + (f.i + 0.5) * cs - half, by - cs * 0.3, half * 2, B + cs * 0.6);
        }
      } else if (f.kind === 'ring') {
        const x = bx + (f.c + 0.5) * cs, y = by + (f.r + 0.5) * cs, rr = cs * f.rad * ease.out(q);
        c.globalAlpha = a; c.drawImage(glowSprite(f.color || '#ffd27a'), x - rr * 1.6, y - rr * 1.6, rr * 3.2, rr * 3.2);
        c.strokeStyle = '#fff2c0'; c.lineWidth = cs * 0.22 * a + 2;
        c.beginPath(); c.arc(x, y, rr, 0, Math.PI * 2); c.stroke();
      } else if (f.kind === 'zap') {
        const x0 = bx + (f.c0 + 0.5) * cs, y0 = by + (f.r0 + 0.5) * cs, x1 = bx + (f.c + 0.5) * cs, y1 = by + (f.r + 0.5) * cs;
        for (const [lw, col, al] of [[cs * 0.14, '#b48cff', 0.5], [3, '#ffffff', 1]]) {
          c.globalAlpha = a * al; c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
          c.beginPath(); c.moveTo(x0, y0);
          for (let i = 1; i < 5; i++) c.lineTo(lerp(x0, x1, i / 5) + Math.sin(i * 7 + f.t0 * 40) * cs * 0.12, lerp(y0, y1, i / 5) + Math.cos(i * 5 + f.t0 * 40) * cs * 0.12);
          c.lineTo(x1, y1); c.stroke();
        }
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
    // The remote's cursor (a glowing gold ring), and the gem in hand (lifted, pulsing, arrows to its neighbours).
    if ((!result && focus === 'board' && !Kit.touchFirst()) || held) {
      const p = held || cursor, x = bx + p.c * cs, y = by + p.r * cs;
      const pulse = Math.sin(t * 7), col = held ? '#ffffff' : '#ffd23f';
      c.save();
      c.globalCompositeOperation = 'lighter';
      c.globalAlpha = 0.35 + 0.15 * pulse; c.lineWidth = cs * 0.16; c.strokeStyle = col;
      roundRect(c, x - 1, y - 1, cs + 2, cs + 2, cs * 0.22); c.stroke();
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      c.shadowColor = col; c.shadowBlur = 16;
      c.lineWidth = 4 + pulse * 1.2; c.strokeStyle = held ? '#ffffff' : '#ffe27a';
      roundRect(c, x - 2, y - 2, cs + 4, cs + 4, cs * 0.22); c.stroke();
      c.shadowBlur = 0;
      // corner brackets
      c.lineWidth = 3; c.strokeStyle = '#fff'; const k = cs * 0.22, o = 5 + pulse * 2;
      [[x - o, y - o, 1, 1], [x + cs + o, y - o, -1, 1], [x - o, y + cs + o, 1, -1], [x + cs + o, y + cs + o, -1, -1]].forEach(([qx, qy, dx, dy]) => {
        c.beginPath(); c.moveTo(qx, qy + dy * k); c.lineTo(qx, qy); c.lineTo(qx + dx * k, qy); c.stroke();
      });
      c.restore();
      if (held && heldGem) {
        const lift = cs * 0.1, sc = 1.16 + pulse * 0.05;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 + 0.2 * pulse;
        c.drawImage(glowSprite(heldGem.t >= 0 ? GEMS[heldGem.t].color : '#ffffff'), x - cs * 0.45, y - cs * 0.5, cs * 1.9, cs * 1.9);
        c.restore();
        drawGem(c, heldGem, x, y - lift, cs, sc, 1, heldGem.s === 'rainbow' ? clock * 1.2 : 0);
        c.fillStyle = '#fff';
        [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(([dx, dy]) => {
          const rr = p.r + dy, cc = p.c + dx;
          if (rr < 0 || cc < 0 || rr >= N || cc >= N) return;
          const ax = x + cs / 2 + dx * cs * 0.64, ay = y + cs / 2 + dy * cs * 0.64, s = cs * 0.12 + pulse * 1.5;
          c.beginPath();
          c.moveTo(ax + dx * s, ay + dy * s);
          c.lineTo(ax - dx * s * 0.4 + dy * s, ay - dy * s * 0.4 + dx * s);
          c.lineTo(ax - dx * s * 0.4 - dy * s, ay - dy * s * 0.4 - dx * s);
          c.closePath(); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#6b3d00'; c.stroke();
        });
      }
    }
  }
  function drawButtons(c, t) {
    L.buttons.forEach((b, i) => {
      const on = focus === 'btn' && btn === i && !result && !Kit.touchFirst();
      if (on) goldPill(c, b.x, b.y, b.w, b.h, t);

      const s = b.h * 0.5, col = on ? '#3a1c00' : '#fff';
      c.font = `600 ${Math.round(b.h * 0.4)}px ${Kit.UI}`;
      const tw = c.measureText(b.label).width, x0 = b.x + b.w / 2 - (tw + s * 1.2) / 2;
      drawIcon(c, b.id, x0 + s / 2, b.y + b.h / 2, s, on ? '#3a1c00' : '#ffe9a8');
      text(c, b.label, x0 + s * 1.2, b.y + b.h / 2 + 1, b.h * 0.4, col, 600, 'left');
    });
  }
  function drawPanel(c, W, H) {
    const a = clamp((clock - resultT - 0.3) / 0.4, 0, 1);
    if (a <= 0) return;
    const win = result === 'win';
    c.fillStyle = `rgba(14,3,26,${0.6 * a})`; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.84, 600), ph = Math.min(H * 0.62, 400);
    if (win) {
      if (!rays) bakeRays();
      c.save(); c.translate(W / 2, H / 2 - ph * 0.08); c.rotate(clock * 0.25); c.globalAlpha = a * 0.8; c.globalCompositeOperation = 'lighter';
      const rs = Math.max(pw, ph) * 1.5; c.drawImage(rays, -rs / 2, -rs / 2, rs, rs); c.restore();
    }
    c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 32);
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    if (win) { g.addColorStop(0, '#7d2aa0'); g.addColorStop(1, '#2c0b45'); } else { g.addColorStop(0, '#3d3a8a'); g.addColorStop(1, '#16123d'); }
    c.fillStyle = g; c.fill(); c.restore();
    c.lineWidth = 6; c.strokeStyle = GOLD(c, -pw / 2, -ph / 2, pw / 2, ph / 2); roundRect(c, -pw / 2, -ph / 2, pw, ph, 32); c.stroke();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,240,200,0.5)'; roundRect(c, -pw / 2 + 10, -ph / 2 + 10, pw - 20, ph - 20, 24); c.stroke();
    ribbon(c, 0, -ph / 2 + 4, pw * 0.82, ph * 0.17, win ? '#d9223e' : '#4a62c8');
    Kit.title(c, win ? `Level ${level - 1} complete!` : 'Out of moves!', 0, -ph / 2 + 2, ph * 0.085, { color: '#fff3c0' });
    if (win) {
      for (let i = 0; i < 3; i++) {
        const sa = clamp((clock - resultT - 0.7 - i * 0.28) / 0.35, 0, 1), on = i < starsWon;
        const sx = (i - 1) * ph * 0.3, sy = -ph * 0.1 - (i === 1 ? ph * 0.05 : 0), size = ph * (i === 1 ? 0.3 : 0.25);
        if (on && sa > 0) {
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = sa * 0.8;
          c.drawImage(glowSprite('#ffd23f'), sx - size, sy - size, size * 2, size * 2); c.restore();
          if (!popped[i]) { popped[i] = true; spark(W / 2 + sx, H / 2 + sy, '#ffd23f', 14, 1); Kit.tone(880 + i * 220, { type: 'triangle', dur: 0.2, vol: 0.12 }); }
        }
        const ss = on ? ease.back(sa) : 1;
        c.save(); c.translate(sx, sy); c.rotate(on ? (1 - sa) * 0.8 : 0); c.scale(ss, ss);
        c.drawImage(starIcon(size, on && sa > 0), -size / 2, -size / 2, size, size);
        c.restore();
      }
      Kit.title(c, `${score}`, 0, ph * 0.15, ph * 0.12, { color: '#ffcf4a' });
    } else {
      const n = S.goals.length;
      S.goals.forEach((goal, i) => {
        const x = (i - (n - 1) / 2) * ph * 0.55;
        goalIcon(c, goal, x - ph * 0.08, -ph * 0.08, ph * 0.18);
        text(c, goalLine(goal, i), x + ph * 0.04, -ph * 0.1, ph * 0.09, '#fff', 700, 'left', Kit.FONT);
        if (goal.kind === 'gem') text(c, 'still to go', x + ph * 0.04, -ph * 0.02, ph * 0.045, 'rgba(255,240,220,0.7)', 600, 'left');
      });
      text(c, `Score ${score}`, 0, ph * 0.12, ph * 0.075, 'rgba(255,240,220,0.85)', 600);
    }
    const bw = pw * 0.56, bh = ph * 0.15, by2 = ph * 0.3;
    goldPill(c, -bw / 2, by2 - bh / 2, bw, bh, clock);
    text(c, Kit.touchFirst() ? (win ? 'Tap: next level' : 'Tap: try again') : (win ? 'OK  ·  Next level' : 'OK  ·  Try again'), 0, by2 + 1, bh * 0.45, '#3a1c00', 700);
    c.restore();
  }
  function goalSentence() {
    return S.goals.map((g, i) => (g.kind === 'score' ? `Reach ${g.need} points` : `${i ? '' : 'Clear '}${g.need} ${GEMS[g.t].name}`)).join(' and ');
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    if (!scene || scene.w !== W || scene.h !== H) bakeScene(W, H);
    c.drawImage(scene, 0, 0, W, H);
    // Drifting gold dust
    c.save(); c.globalCompositeOperation = 'lighter';
    const dust = glowSprite('#ffd27a');
    for (const m of motes) {
      const x = ((m.x + Math.sin(t * 0.3 + m.p) * 0.02) % 1) * W, y = (((m.y - t * m.v) % 1) + 1) % 1 * H, s = 3 + m.s * 7;
      c.globalAlpha = 0.35 + 0.35 * Math.sin(t * 1.5 + m.p);
      c.drawImage(dust, x - s, y - s, s * 2, s * 2);
    }
    c.restore();
    drawBoard(c, t);
    drawPanels(c, t);
    drawButtons(c, t);
    drawSparks(c);
    // One-line help on top
    const line = result ? '' : held ? 'Arrow = swap with that gem  ·  OK = put it down' : 'Arrows move  ·  OK picks a gem  ·  Arrow swaps  ·  Back exits';
    if (line && L.wide) {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 8;
      text(c, line, W / 2, (L.by - L.frame) * 0.45, Math.max(18, Math.min(H * 0.03, 30)), 'rgba(255,240,220,0.9)', 600);
      c.restore();
    }
    const m = muteBox();
    c.globalAlpha = 0.8; drawIcon(c, Kit.muted ? 'mute' : 'sound', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.6, '#ffe9c0'); c.globalAlpha = 1;
    // Level intro banner: a ribbon that swings in, then away.
    if (introT < 2.8 && !result) {
      const inK = ease.back(clamp(introT / 0.45, 0, 1)), outK = clamp((introT - 2.3) / 0.5, 0, 1);
      c.save(); c.globalAlpha = 1 - outK;
      const cx = W / 2 + (1 - inK) * -W * 0.6 + outK * W * 0.4, y = L.by + L.B / 2;
      const bw = Math.min(W * 0.9, L.B * 1.2), bh = L.cs * 1.15;
      ribbon(c, cx, y - bh * 0.35, bw * 0.8, bh, '#d9223e');
      Kit.title(c, `Level ${level}`, cx, y - bh * 0.4, bh * 0.55, { color: '#fff3c0' });
      c.font = `600 100px ${Kit.UI}`;
      const gs = goalSentence(), fit = Math.min(bh * 0.38, (bw * 0.86) / c.measureText(gs).width * 100);
      Kit.glass(c, cx - bw * 0.45, y + bh * 0.45, bw * 0.9, bh * 0.75, bh * 0.3, { tint: 'rgba(40,8,60,0.75)', edge: 'rgba(255,214,140,0.6)' });
      text(c, gs, cx, y + bh * 0.83, fit, '#fff', 600);
      c.restore();
    }
    if (result) drawPanel(c, W, H);
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (level > 1) Kit.record('gemswap', level - 1);
})();
