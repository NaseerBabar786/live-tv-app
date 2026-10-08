// Jade Mahjong: a calm mahjong solitaire. Tiles lie in layered heaps; take away matching pairs of
// free tiles (nothing on top, and the left or the right side open) until the heap is gone.
// Every deal is built backwards from an empty table, so it can always be cleared.
// Remote: arrows jump between the FREE tiles only (the nearest one that way), OK picks a tile, OK on
// its twin takes the pair away. Hint, Shuffle, Undo and Restart sit under the tiles.
// Touch and mouse: tap a tile, then tap its twin.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;

  // ---------- Tile faces: numbers 1-9 in three suits, plus simple pictures ----------
  const SUITS = [
    { color: '#d1263a', pip: 'coin' },  // red coins
    { color: '#16874a', pip: 'stick' }, // green sticks
    { color: '#2050c8', pip: 'gem' },   // blue gems
  ];
  const PICS = ['apple', 'cherry', 'grapes', 'lemon', 'flower', 'tulip', 'star', 'moon', 'sun', 'heart'];
  const FACES = [];
  SUITS.forEach((s, si) => { for (let n = 1; n <= 9; n++) FACES.push({ kind: 'num', suit: si, n }); });
  PICS.forEach((p) => FACES.push({ kind: 'pic', name: p }));

  // ---------- Layouts (in half-tile units: a tile covers 2×2 cells on its layer) ----------
  function rect(P, z, x0, y0, cols, rows) {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) P.push({ x: x0 + c * 2, y: y0 + r * 2, z });
  }
  // Rows of tiles centred on a common middle; lens are tile counts per row.
  function rows(P, z, x0, y0, lens) {
    const max = Math.max(...lens);
    lens.forEach((n, r) => { for (let c = 0; c < n; c++) P.push({ x: x0 + (max - n) + c * 2, y: y0 + r * 2, z }); });
  }
  // A picture made of '#' (one tile per character) on layer z.
  function pattern(P, z, x0, y0, lines) {
    lines.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === '#') P.push({ x: x0 + c * 2, y: y0 + r * 2, z }); }));
  }
  const DESIGNS = [
    { name: 'Diamond', make(s) {
      const P = [], w = s * 2;
      rows(P, 0, 0, 0, [3 + w, 5 + w, 7 + w, 5 + w, 3 + w]);
      rows(P, 1, 2, 2, [3 + w, 5 + w, 3 + w]);
      rows(P, 2, 4 + 1, 4, [2 + w]);
      return P;
    } },
    { name: 'Stone Bridge', make(s) {
      const P = [], span = 2 + s, right = 4 + span * 2;
      [0, right].forEach((x) => { rect(P, 0, x, 0, 2, 5); rect(P, 1, x + 1, 1, 1, 4); rect(P, 2, x + 1, 3, 1, 2); });
      rect(P, 0, 4, 2, span, 3);
      rect(P, 1, 4, 4, span, 1);
      if (s >= 1) rect(P, 2, 5, 4, span - 1, 1);
      return P;
    } },
    { name: 'Pyramid', make(s) {
      // Each layer steps in by a whole tile at the sides and half a tile top and bottom.
      const P = [], cols = 7 + s * 2, rws = 4 + (s >= 2 ? 1 : 0);
      for (let k = 0; cols - 2 * k > 0 && rws - k > 0; k++) rect(P, k, k * 2, k, cols - 2 * k, rws - k);
      return P;
    } },
    { name: 'Butterfly', make(s) {
      const P = [], o = '#'.repeat(s);
      pattern(P, 0, 0, 0, [`${o}###..###${o}`, `${o}########${o}`, `.${o}######${o}.`, `${o}########${o}`, `${o}###..###${o}`]);
      pattern(P, 1, 1 + s * 2, 1, ['##...##', '##...##', '##...##', '##...##']);
      rect(P, 1, 7 + s * 2, 1, 1, 4);
      rect(P, 2, 7 + s * 2, 3, 1, 2);
      if (s >= 1) pattern(P, 2, 2 + s * 2, 3, ['#....#']);
      return P;
    } },
    { name: 'Castle', make(s) {
      const P = [], cols = 7 + s * 2;
      rect(P, 0, 0, 0, cols, 5);
      for (let c = 0; c < cols - 1; c++) for (let r = 0; r < 4; r++) if (c === 0 || r === 0 || c === cols - 2 || r === 3) P.push({ x: 1 + c * 2, y: 1 + r * 2, z: 1 });
      [[0, 0], [cols - 1, 0], [0, 4], [cols - 1, 4]].forEach(([c, r]) => P.push({ x: c * 2, y: r * 2, z: 2 }));
      rect(P, 1, cols - 1, 3, 1, 2);
      return P;
    } },
    { name: 'Lantern', make(s) {
      const P = [], w = s * 2;
      rows(P, 0, 2, 0, [4 + w, 6 + w, 8 + w, 8 + w, 6 + w, 4 + w]);
      P.push({ x: 0, y: 5, z: 0 }, { x: 2 + (8 + w) * 2, y: 5, z: 0 });
      rows(P, 1, 4, 2, [4 + w, 6 + w, 6 + w, 4 + w]);
      rows(P, 2, 6, 4, [4 + w, 4 + w]);
      P.push({ x: 9 + w, y: 5, z: 3 });
      return P;
    } },
  ];
  function layoutFor(lv) {
    const d = DESIGNS[(lv - 1) % DESIGNS.length], s = Math.min(3, Math.floor((lv - 1) / DESIGNS.length));
    let P = d.make(s);
    // No two tiles in the same spot, and an even count (the last, topmost-added tile goes).
    const seen = new Set();
    P = P.filter((p) => { const k = p.x + ',' + p.y + ',' + p.z; if (seen.has(k)) return false; seen.add(k); return true; });
    if (P.length % 2) P.pop();
    return { name: d.name, P };
  }

  // ---------- Geometry: which tiles hold which down ----------
  let P = [], above = [], leftOf = [], rightOf = [], order = [];
  function build(lv) {
    const lay = layoutFor(lv);
    P = lay.P; layoutName = lay.name;
    above = P.map(() => []); leftOf = P.map(() => []); rightOf = P.map(() => []);
    P.forEach((a, i) => P.forEach((b, j) => {
      if (i === j) return;
      const dx = b.x - a.x, dy = b.y - a.y;
      if (b.z > a.z && Math.abs(dx) < 2 && Math.abs(dy) < 2) above[i].push(j);
      if (b.z === a.z && Math.abs(dy) < 2) { if (dx === -2) leftOf[i].push(j); if (dx === 2) rightOf[i].push(j); }
    }));
    // Painting order: lower layers first, then from the top-left so each tile hides its neighbour's edge.
    order = P.map((_, i) => i).sort((i, j) => P[i].z - P[j].z || (P[i].x + P[i].y) - (P[j].x + P[j].y) || P[i].x - P[j].x);
  }
  const isFree = (i, alive) => alive[i] && above[i].every((j) => !alive[j]) && (leftOf[i].every((j) => !alive[j]) || rightOf[i].every((j) => !alive[j]));

  // Builds faces for the tiles still in play by taking random free pairs away, one after another, and
  // giving each pair the same face. Playing those pairs in that order clears the table, so it is solvable.
  function solvableFaces(alive, pairFaces) {
    for (let tries = 0; tries < 200; tries++) {
      const left = alive.slice(), pairs = [];
      let count = left.filter(Boolean).length, ok = true;
      while (count > 0) {
        const free = [];
        for (let i = 0; i < P.length; i++) if (isFree(i, left)) free.push(i);
        if (free.length < 2) { ok = false; break; }
        // Lean towards high tiles first so no lonely stack is left at the end.
        free.sort((a, b) => P[b].z - P[a].z + (Math.random() - 0.5) * 2.2);
        const a = free[0], b = free[1 + Math.floor(Math.random() * Math.min(free.length - 1, 4))];
        left[a] = 0; left[b] = 0; count -= 2; pairs.push([a, b]);
      }
      if (!ok) continue;
      const faces = P.map(() => -1);
      const fs = pairFaces.slice().sort(() => Math.random() - 0.5);
      pairs.forEach(([a, b], k) => { faces[a] = faces[b] = fs[k]; });
      return faces;
    }
    return null;
  }
  // Looks for a way to clear the table from here (depth-first, with a node budget so a slow box
  // never stalls). Returns the first pair of a full solution, or null if none was found in time.
  function solveFrom(alive0, faces, budget) {
    const seen = new Set();
    let nodes = 0;
    function go(al, left) {
      if (left === 0) return [];
      if (++nodes > budget) return null;
      const key = al.join('');
      if (seen.has(key)) return null;
      seen.add(key);
      const byFace = new Map();
      for (let i = 0; i < P.length; i++) if (isFree(i, al)) { const f = faces[i]; if (!byFace.has(f)) byFace.set(f, []); byFace.get(f).push(i); }
      const moves = [];
      byFace.forEach((fs) => {
        // All of a face's tiles free at once: taking any two is as good as any other, so try one way.
        if (fs.length === 4 || fs.length === 2) moves.push([fs[0], fs[1], fs.length === 4 ? 2 : 0]);
        else for (let a = 0; a < fs.length; a++) for (let b = a + 1; b < fs.length; b++) moves.push([fs[a], fs[b], 0]);
      });
      // Tiles that sit on or beside many others first: they open the table up.
      const weight = (i) => P[i].z * 3 + leftOf[i].length + rightOf[i].length;
      moves.sort((m, n) => (n[2] + weight(n[0]) + weight(n[1])) - (m[2] + weight(m[0]) + weight(m[1])));
      for (const [a, b] of moves) {
        al[a] = 0; al[b] = 0;
        const r = go(al, left - 2);
        al[a] = 1; al[b] = 1;
        if (r) return [[a, b]].concat(r);
        if (nodes > budget) return null;
      }
      return null;
    }
    const al = alive0.map((v) => (v ? 1 : 0));
    const sol = go(al, al.reduce((s, v) => s + v, 0));
    return sol && sol.length ? sol[0] : null;
  }
  function deal() {
    const alive = P.map(() => 1), pairs = P.length / 2;
    // Each face comes up twice (four tiles) where the table allows, like the real game.
    const kinds = Math.min(FACES.length, Math.max(4, Math.ceil(pairs / 2)));
    const pool = FACES.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, kinds);
    const pairFaces = [];
    for (let k = 0; k < pairs; k++) pairFaces.push(pool[k % kinds]);
    return solvableFaces(alive, pairFaces);
  }

  // ---------- State ----------
  let level = Kit.store.get('jademahjong.level', 1);
  let layoutName = '';
  let start, faces, alive, history, won, wonT, sel = -1, cursor = 0, hint = null, introT = 0;
  let flyers = [], flip = null, nopeT = 0, nopeTile = -1, lastMatchT = -9, streak = 0, stuck = false;
  let free = [];

  function refreshFree() {
    free = P.map((_, i) => isFree(i, alive));
    stuck = false;
    if (!won && alive.some(Boolean) && !anyPair()) stuck = true;
  }
  function anyPair() {
    const seen = new Map();
    for (let i = 0; i < P.length; i++) {
      if (!free[i]) continue;
      if (seen.has(faces[i])) return [seen.get(faces[i]), i];
      seen.set(faces[i], i);
    }
    return null;
  }
  function save() { Kit.store.set('jademahjong.game', { level, start, faces, alive }); }
  function begin(again) {
    if (!again) start = deal();
    faces = start.slice(); alive = P.map(() => 1);
    history = []; won = false; sel = -1; hint = null; flyers = []; flip = null; streak = 0;
    refreshFree(); cursor = firstFree(); save();
  }
  function firstFree() {
    // The free tile nearest the top-left middle: a friendly place to start.
    let best = -1, d = Infinity;
    const cx = Math.min(...P.map((p) => p.x)), cy = (Math.min(...P.map((p) => p.y)) + Math.max(...P.map((p) => p.y))) / 2;
    P.forEach((p, i) => { if (!free[i]) return; const k = Math.abs(p.x - cx) + Math.abs(p.y - cy) * 1.5 - p.z * 3; if (k < d) { d = k; best = i; } });
    return best < 0 ? 1000 : best;
  }

  build(level);
  const saved = Kit.store.get('jademahjong.game', null);
  if (saved && saved.level === level && saved.faces && saved.faces.length === P.length) {
    start = saved.start; faces = saved.faces; alive = saved.alive; history = []; won = false;
    refreshFree(); cursor = firstFree();
    if (!alive.some(Boolean)) begin(false);
  } else begin(false);

  // ---------- Layout on screen ----------
  const BUTTONS = [
    { id: 'hint', label: '💡 Hint' },
    { id: 'shuffle', label: '🔀 Shuffle' },
    { id: 'undo', label: '↶ Undo' },
    { id: 'restart', label: '⟳ Restart' },
  ];
  let L = { buttons: [] };
  const sprites = new Map();
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W) return;
    const bh = Math.round(clamp(H * 0.078, 42, 80)), bw = Math.round(Math.min(W * 0.2, bh * 3.6)), gap = Math.round(bh * 0.35);
    const by = H - bh - H * 0.068;
    const total = BUTTONS.length * bw + (BUTTONS.length - 1) * gap;
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: (W - total) / 2 + i * (bw + gap), y: by, w: bw, h: bh }));
    // Tiles as big as the space allows.
    const top = H * 0.115, bottom = by - H * 0.022;
    const maxX = Math.max(...P.map((p) => p.x)) + 2, maxY = Math.max(...P.map((p) => p.y)) + 2, maxZ = Math.max(...P.map((p) => p.z));
    const R = 1.22; // tile height / width
    const depth = 0.11; // layer lift as a share of tile width
    const tw = Math.min((W * 0.92) / (maxX / 2 + depth * (maxZ + 1)), (bottom - top) / (maxY / 2 * R + depth * (maxZ + 1)), 132);
    L.tw = tw; L.th = tw * R; L.e = tw * depth;
    const bwid = maxX / 2 * tw + L.e * (maxZ + 1), bhei = maxY / 2 * L.th + L.e * (maxZ + 1);
    L.ox = (W - bwid) / 2 + L.e * maxZ;
    L.oy = top + (bottom - top - bhei) / 2 + L.e * maxZ;
    sprites.clear();
  }
  Kit.onResize(layout);
  const tileXY = (i) => ({ x: L.ox + P[i].x * L.tw / 2 - P[i].z * L.e, y: L.oy + P[i].y * L.th / 2 - P[i].z * L.e });
  const centre = (i) => { const p = tileXY(i); return { x: p.x + L.tw / 2, y: p.y + L.th / 2 }; };

  // ---------- Drawing a tile face (cached per face and size) ----------
  function pip(c, kind, color, x, y, r) {
    c.fillStyle = color;
    if (kind === 'coin') {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(x, y, r * 0.4, 0, Math.PI * 2); c.fill();
    } else if (kind === 'stick') {
      roundRect(c, x - r * 0.5, y - r * 1.15, r, r * 2.3, r * 0.45); c.fill();
    } else {
      c.beginPath(); c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 0.85, y); c.lineTo(x, y + r * 1.15); c.lineTo(x - r * 0.85, y); c.closePath(); c.fill();
    }
  }
  function star(c, x, y, r, inner) {
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * inner : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  function leaf(c, x, y, len, ang) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
    c.fillStyle = '#2e9e45'; c.fill(); c.restore();
  }
  // Pictures are drawn round (0, 0), about s across.
  function picture(c, name, s) {
    const r = s / 2;
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (name === 'apple') {
      c.fillStyle = '#e0242e';
      c.beginPath(); c.moveTo(0, -r * 0.55);
      c.bezierCurveTo(r * 0.6, -r * 0.95, r * 1.15, -r * 0.3, r * 0.8, r * 0.45);
      c.bezierCurveTo(r * 0.55, r * 1.0, r * 0.15, r * 0.95, 0, r * 0.8);
      c.bezierCurveTo(-r * 0.15, r * 0.95, -r * 0.55, r * 1.0, -r * 0.8, r * 0.45);
      c.bezierCurveTo(-r * 1.15, -r * 0.3, -r * 0.6, -r * 0.95, 0, -r * 0.55);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(-r * 0.4, -r * 0.2, r * 0.13, r * 0.25, 0.4, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#6b3d1e'; c.lineWidth = r * 0.12; c.beginPath(); c.moveTo(0, -r * 0.5); c.lineTo(r * 0.08, -r * 0.92); c.stroke();
      leaf(c, r * 0.08, -r * 0.8, r * 0.55, -0.5);
    } else if (name === 'cherry') {
      c.strokeStyle = '#3f7d2c'; c.lineWidth = r * 0.1;
      c.beginPath(); c.moveTo(-r * 0.45, r * 0.25); c.quadraticCurveTo(-r * 0.2, -r * 0.5, r * 0.15, -r * 0.85); c.stroke();
      c.beginPath(); c.moveTo(r * 0.45, r * 0.4); c.quadraticCurveTo(r * 0.35, -r * 0.4, r * 0.15, -r * 0.85); c.stroke();
      leaf(c, r * 0.15, -r * 0.85, r * 0.6, -0.2);
      [[-r * 0.45, r * 0.45], [r * 0.45, r * 0.6]].forEach(([x, y]) => {
        c.fillStyle = '#b5122b'; c.beginPath(); c.arc(x, y, r * 0.38, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(x - r * 0.13, y - r * 0.13, r * 0.1, 0, Math.PI * 2); c.fill();
      });
    } else if (name === 'grapes') {
      const grid = [[-0.5, -0.3], [0, -0.3], [0.5, -0.3], [-0.25, 0.12], [0.25, 0.12], [0, 0.54]];
      leaf(c, 0, -r * 0.62, r * 0.6, -0.6);
      c.strokeStyle = '#6b3d1e'; c.lineWidth = r * 0.1; c.beginPath(); c.moveTo(0, -r * 0.55); c.lineTo(-r * 0.05, -r * 0.95); c.stroke();
      grid.forEach(([x, y]) => {
        c.fillStyle = '#7a2fb8'; c.beginPath(); c.arc(x * r, y * r, r * 0.27, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.4)'; c.beginPath(); c.arc(x * r - r * 0.08, y * r - r * 0.08, r * 0.07, 0, Math.PI * 2); c.fill();
      });
    } else if (name === 'lemon') {
      c.fillStyle = '#f2c40c';
      c.beginPath(); c.ellipse(0, 0, r * 0.82, r * 0.58, -0.35, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(r * 0.8, -r * 0.3, r * 0.14, r * 0.1, -0.35, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(-r * 0.8, r * 0.3, r * 0.14, r * 0.1, -0.35, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.ellipse(-r * 0.25, -r * 0.2, r * 0.3, r * 0.1, -0.35, 0, Math.PI * 2); c.fill();
      leaf(c, r * 0.3, -r * 0.45, r * 0.5, -1.2);
    } else if (name === 'flower') {
      c.fillStyle = '#ec5fa4';
      for (let k = 0; k < 5; k++) { const a = k * Math.PI * 2 / 5 - Math.PI / 2; c.beginPath(); c.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.38, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, 0, r * 0.3, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e09a00'; c.beginPath(); c.arc(0, 0, r * 0.13, 0, Math.PI * 2); c.fill();
    } else if (name === 'tulip') {
      c.strokeStyle = '#2e9e45'; c.lineWidth = r * 0.13; c.beginPath(); c.moveTo(0, -r * 0.1); c.lineTo(0, r * 0.95); c.stroke();
      leaf(c, 0, r * 0.75, r * 0.6, -0.9); leaf(c, 0, r * 0.75, r * 0.6, Math.PI + 0.9);
      c.fillStyle = '#f2621f';
      c.beginPath(); c.moveTo(-r * 0.55, -r * 0.75); c.lineTo(-r * 0.27, -r * 0.45); c.lineTo(0, -r * 0.85); c.lineTo(r * 0.27, -r * 0.45); c.lineTo(r * 0.55, -r * 0.75);
      c.quadraticCurveTo(r * 0.65, r * 0.1, 0, r * 0.12); c.quadraticCurveTo(-r * 0.65, r * 0.1, -r * 0.55, -r * 0.75); c.fill();
    } else if (name === 'star') {
      star(c, 0, r * 0.05, r * 0.98, 0.45); c.fillStyle = '#f5b301'; c.fill();
      c.lineWidth = r * 0.07; c.strokeStyle = '#c27c00'; c.stroke();
      star(c, -r * 0.05, -r * 0.02, r * 0.45, 0.45); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    } else if (name === 'moon') {
      const r1 = r * 0.9, r2 = r * 0.78, d = r * 0.5;
      const x = (d * d + r1 * r1 - r2 * r2) / (2 * d), y = Math.sqrt(Math.max(0, r1 * r1 - x * x));
      const a = Math.atan2(y, x), b = Math.atan2(y, x - d);
      c.save(); c.rotate(-0.5);
      c.beginPath(); c.arc(0, 0, r1, a, Math.PI * 2 - a, false); c.arc(d, 0, r2, -b, b, true); c.closePath();
      c.fillStyle = '#3b6fd8'; c.fill();
      c.restore();
      star(c, r * 0.42, -r * 0.35, r * 0.2, 0.45); c.fillStyle = '#f5b301'; c.fill();
    } else if (name === 'sun') {
      c.fillStyle = '#ff8a00';
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        c.beginPath(); c.moveTo(Math.cos(a - 0.22) * r * 0.55, Math.sin(a - 0.22) * r * 0.55); c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        c.lineTo(Math.cos(a + 0.22) * r * 0.55, Math.sin(a + 0.22) * r * 0.55); c.closePath(); c.fill();
      }
      c.fillStyle = '#ffc21a'; c.beginPath(); c.arc(0, 0, r * 0.52, 0, Math.PI * 2); c.fill();
    } else if (name === 'heart') {
      c.fillStyle = '#e8336d';
      c.beginPath(); c.moveTo(0, r * 0.85);
      c.bezierCurveTo(-r * 1.2, 0, -r * 0.75, -r * 0.95, 0, -r * 0.4);
      c.bezierCurveTo(r * 0.75, -r * 0.95, r * 1.2, 0, 0, r * 0.85);
      c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(-r * 0.42, -r * 0.28, r * 0.14, r * 0.22, 0.6, 0, Math.PI * 2); c.fill();
    }
  }
  const PIP_ROWS = [null, [1], [2], [3], [2, 2], [3, 2], [3, 3], [4, 3], [4, 4], [5, 4]];
  function faceArt(c, f, tw, th) {
    const F = FACES[f];
    if (F.kind === 'num') {
      const S = SUITS[F.suit];
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `900 ${Math.round(th * 0.5)}px system-ui, "Arial Black", sans-serif`;
      c.lineJoin = 'round'; c.lineWidth = th * 0.03; c.strokeStyle = shade(S.color, -0.4);
      c.fillStyle = S.color;
      c.fillText(String(F.n), tw / 2, th * 0.38);
      c.strokeText(String(F.n), tw / 2, th * 0.38);
      const lines = PIP_ROWS[F.n], pr = Math.min(tw * 0.075, th * 0.055);
      const gapX = tw * 0.15;
      lines.forEach((n, row) => {
        const y = th * (lines.length === 1 ? 0.8 : 0.73 + row * 0.13);
        for (let k = 0; k < n; k++) pip(c, S.pip, S.color, tw / 2 + (k - (n - 1) / 2) * gapX, y, pr);
      });
    } else {
      c.save(); c.translate(tw / 2, th * 0.5); picture(c, F.name, Math.min(tw * 0.78, th * 0.62)); c.restore();
    }
  }
  // A whole tile: its jade side (bottom-right, e thick) and the ivory face with the art.
  function sprite(f) {
    const key = f + ':' + Math.round(L.tw);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2), tw = L.tw, th = L.th, e = L.e, r = tw * 0.13;
    s = document.createElement('canvas');
    s.width = Math.ceil((tw + e + 2) * dpr); s.height = Math.ceil((th + e + 2) * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    roundRect(c, e, e, tw, th, r); c.fillStyle = '#0d5e45'; c.fill();
    roundRect(c, e * 0.5, e * 0.5, tw, th, r); c.fillStyle = '#1f8d68'; c.fill();
    roundRect(c, e * 0.18, e * 0.18, tw, th, r); c.fillStyle = '#e9e1c8'; c.fill();
    roundRect(c, 0, 0, tw, th, r);
    const g = c.createLinearGradient(0, 0, tw, th);
    g.addColorStop(0, '#fffdf4'); g.addColorStop(1, '#efe6cc');
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(1, tw * 0.02); c.strokeStyle = 'rgba(90,70,30,0.35)'; c.stroke();
    if (f >= 0) faceArt(c, f, tw, th);
    sprites.set(key, s);
    return s;
  }

  // ---------- Moves ----------
  const now = () => performance.now() / 1000;
  function nope(i) { nopeT = now(); nopeTile = i; sfx.nope(); }
  function pickTile(i) {
    if (won || flip) return;
    if (!alive[i]) return;
    if (!free[i]) { nope(i); Kit.float('That tile is held down', Kit.W / 2, L.oy - L.th * 0.1, { color: '#ffd9a0', size: 26 }); return; }
    hint = null;
    if (sel < 0) { sel = i; sfx.pick(); return; }
    if (sel === i) { sel = -1; sfx.move(); return; }
    if (faces[sel] !== faces[i]) { sel = i; sfx.pick(); return; }
    // A pair: both fly together and burst.
    const a = sel, b = i;
    history.push({ faces: faces.slice(), alive: alive.slice() });
    alive[a] = 0; alive[b] = 0; sel = -1;
    const pa = tileXY(a), pb = tileXY(b);
    const mid = { x: (pa.x + pb.x) / 2, y: Math.min(pa.y, pb.y) - L.th * 0.35 };
    flyers.push({ f: faces[a], from: pa, to: { x: mid.x - L.tw * 0.52, y: mid.y }, t: 0 }, { f: faces[b], from: pb, to: { x: mid.x + L.tw * 0.52, y: mid.y }, t: 0, lead: true, mid });
    Kit.tone(784, { type: 'triangle', dur: 0.12, vol: 0.16 }); Kit.tone(1046, { type: 'triangle', dur: 0.18, vol: 0.14, at: 0.07 });
    streak = now() - lastMatchT < 4 ? streak + 1 : 1; lastMatchT = now();
    refreshFree();
    if (!alive.some(Boolean)) {
      won = true; wonT = now() + 0.5;
      level++; Kit.store.set('jademahjong.level', level); Kit.record('jademahjong', level - 1);
      Kit.store.set('jademahjong.game', null);
      setTimeout(() => { sfx.win(); Kit.confetti(150); }, 450);
    } else save();
    fixCursor(centre(cursor < 1000 ? cursor : a));
    if (stuck) setTimeout(() => { if (stuck && !won) { cursor = 1001; Kit.sfx.nope(); } }, 600);
  }
  function fixCursor(near) {
    if (cursor >= 1000 || (alive[cursor] && free[cursor])) return;
    let best = 1000, d = Infinity;
    P.forEach((_, i) => { if (!free[i]) return; const p = centre(i), k = Math.hypot(p.x - near.x, p.y - near.y); if (k < d) { d = k; best = i; } });
    cursor = best;
  }
  function press(id) {
    if (won || flip) return;
    if (id === 'hint') {
      const pair = solveFrom(alive, faces, 6000) || anyPair();
      if (!pair) { nope(-1); Kit.float('No pairs left: try Shuffle', Kit.W / 2, L.buttons[0].y - 30, { color: '#ffd9a0', size: 28 }); return; }
      hint = { pair, t: now() }; sel = -1; cursor = pair[0];
      Kit.tone(1318, { type: 'sine', dur: 0.25, vol: 0.12 }); Kit.tone(1760, { type: 'sine', dur: 0.3, vol: 0.08, at: 0.08 });
    } else if (id === 'shuffle') {
      const pf = [];
      const counts = new Map();
      P.forEach((_, i) => { if (alive[i]) counts.set(faces[i], (counts.get(faces[i]) || 0) + 1); });
      counts.forEach((n, f) => { for (let k = 0; k < n / 2; k++) pf.push(f); });
      let nf = solvableFaces(alive, pf);
      if (!nf) {
        // These tiles can't all come off whatever their faces (say, two left in one stack): step back
        // to the last table that can still be cleared, then shuffle that.
        for (let k = history.length - 1; k >= 0 && !nf; k--) {
          const h = history[k], hp = [], cnt = new Map();
          P.forEach((_, i) => { if (h.alive[i]) cnt.set(h.faces[i], (cnt.get(h.faces[i]) || 0) + 1); });
          cnt.forEach((n, f) => { for (let q = 0; q < n / 2; q++) hp.push(f); });
          const tryF = solvableFaces(h.alive, hp);
          if (tryF) { nf = tryF; history.length = k; alive = h.alive.slice(); faces = h.faces.slice(); }
        }
        if (!nf) { nope(-1); Kit.float('These tiles are stuck: press Restart', Kit.W / 2, L.buttons[0].y - 30, { color: '#ffd9a0', size: 28 }); return; }
        Kit.float('Stepped back a little and shuffled', Kit.W / 2, L.buttons[0].y - 30, { color: '#9ff0c8', size: 28 });
      }
      history.push({ faces: faces.slice(), alive: alive.slice() });
      flip = { from: faces.slice(), t: 0 };
      faces = nf.map((f, i) => (alive[i] ? f : faces[i]));
      sel = -1; hint = null; refreshFree(); save();
      Kit.noise({ dur: 0.45, vol: 0.12, freq: 1800, q: 0.6, sweep: 2 });
      for (let k = 0; k < 6; k++) Kit.tone(500 + k * 90, { type: 'triangle', dur: 0.05, vol: 0.06, at: k * 0.06 });
    } else if (id === 'undo') {
      if (!history.length) { nope(-1); return; }
      const h = history.pop();
      faces = h.faces; alive = h.alive; sel = -1; hint = null; flyers = [];
      refreshFree(); save(); sfx.move();
      fixCursor(cursor < 1000 ? centre(cursor) : { x: Kit.W / 2, y: Kit.H / 2 });
    } else if (id === 'restart') {
      begin(true); sfx.pick();
    }
  }
  function next() { build(level); layout(); begin(false); sfx.pick(); }

  // ---------- Remote: arrows jump between free tiles and the buttons ----------
  function items() {
    const out = [];
    P.forEach((_, i) => { if (free[i]) { const p = centre(i); out.push({ i, x: p.x, y: p.y }); } });
    L.buttons.forEach((b, k) => out.push({ i: 1000 + k, x: b.x + b.w / 2, y: b.y + b.h / 2 }));
    return out;
  }
  function moveCursor(dir) {
    const all = items();
    const cur = all.find((it) => it.i === cursor) || all[0];
    let best = null, score = Infinity;
    for (const it of all) {
      if (it.i === cur.i) continue;
      const dx = it.x - cur.x, dy = it.y - cur.y;
      let main, side;
      if (dir === 'left') { if (dx >= -4) continue; main = -dx; side = Math.abs(dy); }
      else if (dir === 'right') { if (dx <= 4) continue; main = dx; side = Math.abs(dy); }
      else if (dir === 'up') { if (dy >= -4) continue; main = -dy; side = Math.abs(dx); }
      else { if (dy <= 4) continue; main = dy; side = Math.abs(dx); }
      // Buttons only count straight below the tiles, so sideways moves stay among the tiles.
      if ((dir === 'left' || dir === 'right') && (it.i >= 1000) !== (cur.i >= 1000)) continue;
      const s = main + side * 2.2;
      if (s < score) { score = s; best = it; }
    }
    if (best) { cursor = best.i; sfx.move(); }
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && now() - wonT > 0.9) next(); return; }
    if (k === 'undo') { press('undo'); return; }
    if (k === 'restart') { press('restart'); return; }
    if (k === 'ok') { if (cursor >= 1000) press(BUTTONS[cursor - 1000].id); else pickTile(cursor); return; }
    moveCursor(k);
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  function tileAt(x, y) {
    for (let k = order.length - 1; k >= 0; k--) {
      const i = order[k];
      if (!alive[i]) continue;
      const p = tileXY(i);
      if (x >= p.x && x <= p.x + L.tw && y >= p.y && y <= p.y + L.th) return i;
    }
    return -1;
  }
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (won) { if (now() - wonT > 0.9) next(); return; }
      const bi = L.buttons.findIndex((b) => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (bi >= 0) { cursor = 1000 + bi; press(L.buttons[bi].id); return; }
      const i = tileAt(e.x, e.y);
      if (i >= 0) { if (free[i]) cursor = i; pickTile(i); }
    },
  });

  // ---------- Update and draw ----------
  function update(dt) {
    introT += dt;
    for (let k = flyers.length - 1; k >= 0; k--) {
      const f = flyers[k];
      f.t += dt / 0.42;
      if (f.t >= 1) {
        if (f.lead) {
          const m = f.mid;
          Kit.burst(m.x, m.y + L.th / 2, '#3ddc97', 16, 0.9); Kit.burst(m.x, m.y + L.th / 2, '#ffd23f', 10, 0.8);
          sfx.clear(1, Math.min(streak, 3));
          const words = ['', '', 'Nice!', 'Great!', 'Wonderful!', 'Superb!'];
          if (streak >= 2 && !won) Kit.float(words[Math.min(streak, 5)], m.x, m.y, { color: '#9ff0c8', size: Math.max(30, L.tw * 0.45), big: true, life: 1.2 });
        }
        flyers.splice(k, 1);
      }
    }
    if (flip) { flip.t += dt / 0.5; if (flip.t >= 1) flip = null; }
  }
  function drawButton(c, b, on, off) {
    roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
    const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.17)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
    c.fillStyle = g; c.fill();
    c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
    c.font = `800 ${Math.round(Math.min(b.h * 0.4, b.w * 0.14))}px system-ui, sans-serif`;
    c.fillStyle = on ? '#2b1600' : off ? 'rgba(255,255,255,0.4)' : '#fff';
    c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, nw = now();
    Kit.background(c, t, '#0f4a3a', '#03140f', 'rgba(80,230,170,0.08)');
    const { tw, th } = L;
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Header: level on the left, tiles left on the right, the layout's name in the middle.
    const hy = H * 0.065, hs = Math.round(clamp(H * 0.055, 26, 56));
    c.lineJoin = 'round';
    c.font = `900 ${hs}px system-ui, sans-serif`;
    c.textAlign = 'left'; c.lineWidth = 6; c.strokeStyle = 'rgba(0,20,14,0.8)';
    const shownLevel = won ? level - 1 : level;
    c.strokeText(`Level ${shownLevel}`, W * 0.04, hy);
    const lg = c.createLinearGradient(0, hy - hs / 2, 0, hy + hs / 2);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#8ff5c8');
    c.fillStyle = lg; c.fillText(`Level ${shownLevel}`, W * 0.04, hy);
    const left = alive.reduce((s, a) => s + a, 0);
    c.textAlign = 'right'; c.font = `800 ${Math.round(hs * 0.62)}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText(`${left} tiles left`, W - 76, hy);
    // The middle shows a first tip on early levels, then the layout's name.
    c.textAlign = 'center';
    const tipA = introT < 7 && level <= 2 && history.length === 0 && !won ? Math.min(1, (7 - introT) * 2) : 0;
    c.font = `700 ${Math.round(hs * 0.55)}px system-ui, sans-serif`;
    if (tipA > 0) {
      c.globalAlpha = tipA; c.fillStyle = '#fff59d';
      c.fillText(Kit.touchFirst() ? 'Tap two of the same bright tiles' : 'Match two of the same bright tiles', W / 2, hy);
    }
    c.globalAlpha = 1 - tipA; c.fillStyle = 'rgba(200,255,230,0.6)';
    c.fillText(layoutName, W / 2, hy);
    c.globalAlpha = 1;

    // Tiles
    const flipK = flip ? Math.abs(Math.cos(flip.t * Math.PI)) : 1;
    const hintOn = hint && nw - hint.t < 4;
    for (const i of order) {
      if (!alive[i]) continue;
      let { x, y } = tileXY(i);
      const isSel = sel === i, isFocus = cursor === i && !won && !Kit.touchFirst();
      if (isSel) y -= th * 0.08;
      if (i === nopeTile && nw - nopeT < 0.3) x += Math.sin((nw - nopeT) * 60) * tw * 0.06;
      const f = flip && flip.t < 0.5 ? flip.from[i] : faces[i];
      const s = sprite(f);
      if (flip) {
        const cx = x + tw / 2;
        c.drawImage(s, cx - (tw / 2) * flipK, y, (s.width / Math.min(window.devicePixelRatio || 1, 2)) * flipK, s.height / Math.min(window.devicePixelRatio || 1, 2));
      } else c.drawImage(s, x, y, tw + L.e + 2, th + L.e + 2);
      if (!free[i]) {
        roundRect(c, x, y, tw, th, tw * 0.13);
        c.fillStyle = 'rgba(10,30,24,0.34)'; c.fill();
      }
      if (isSel) {
        roundRect(c, x, y, tw, th, tw * 0.13);
        c.fillStyle = 'rgba(60,220,150,0.28)'; c.fill();
        c.lineWidth = Math.max(3, tw * 0.06); c.strokeStyle = '#2fe39a'; c.stroke();
      }
      if (hintOn && (hint.pair[0] === i || hint.pair[1] === i)) {
        roundRect(c, x - 2, y - 2, tw + 4, th + 4, tw * 0.15);
        c.lineWidth = Math.max(3, tw * 0.07); c.strokeStyle = `rgba(110,220,255,${0.55 + 0.45 * Math.sin(t * 8)})`; c.stroke();
      }
      if (isFocus) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        roundRect(c, x - 4, y - 4, tw + 8, th + 8, tw * 0.17);
        c.lineWidth = Math.max(5, tw * 0.09); c.strokeStyle = `rgba(255,214,10,${0.35 + pulse * 0.25})`; c.stroke();
        c.lineWidth = Math.max(3, tw * 0.045); c.strokeStyle = '#ffe14d'; c.stroke();
      }
    }

    // Pairs flying together
    for (const f of flyers) {
      const k = ease.inOut(Math.min(1, f.t));
      const x = lerp(f.from.x, f.to.x, k), y = lerp(f.from.y, f.to.y, k) - Math.sin(k * Math.PI) * th * 0.3;
      const sc = 1 + Math.sin(k * Math.PI) * 0.18;
      c.globalAlpha = f.t > 0.8 ? (1 - f.t) / 0.2 : 1;
      c.drawImage(sprite(f.f), x + tw / 2 - (tw / 2) * sc, y + th / 2 - (th / 2) * sc, (tw + L.e + 2) * sc, (th + L.e + 2) * sc);
      c.globalAlpha = 1;
    }

    // Buttons
    L.buttons.forEach((b, k) => {
      const on = cursor === 1000 + k && !won && !Kit.touchFirst();
      const off = (b.id === 'undo' && !history.length);
      if (b.id === 'shuffle' && stuck) {
        roundRect(c, b.x - 6, b.y - 6, b.w + 12, b.h + 12, b.h / 2 + 6);
        c.fillStyle = `rgba(110,220,255,${0.25 + 0.2 * Math.sin(t * 6)})`; c.fill();
      }
      drawButton(c, b, on, off);
    });

    // One-line help, and a nudge when no pair is left.
    const fs = Math.round(clamp(H * 0.032, 18, 34));
    c.font = `700 ${fs}px system-ui, sans-serif`;
    if (stuck && !won) {
      c.fillStyle = '#ffd9a0';
      c.fillText('No matching free pair left. Press Shuffle (or Undo)', W / 2, H - H * 0.034);
    } else {
      c.fillStyle = 'rgba(255,255,255,0.62)';
      c.fillText(Kit.touchFirst() ? 'Tap two matching free tiles to take them away' : 'Arrows move · OK picks a tile · pick its twin to clear · Back exits', W / 2, H - H * 0.034);
    }

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if (won && nw > wonT) {
      const a = clamp((nw - wonT) / 0.4, 0, 1);
      c.fillStyle = `rgba(2,16,12,${0.62 * a})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw = Math.min(W * 0.84, H * 0.95), ph = Math.min(H * 0.52, 420);
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 30);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      g.addColorStop(0, '#1fae7e'); g.addColorStop(1, '#0b5a43');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(ph * 0.15)}px system-ui, sans-serif`;
      c.fillText('Table cleared!', 0, -ph * 0.25);
      // Three little tiles, gently bobbing.
      const st = ph * 0.2 / (L.th + L.e);
      [FACES.length - 4, FACES.length - 1, FACES.length - 6].forEach((f, q) => {
        const sp = sprite(f), w = (L.tw + L.e + 2) * st, h = (L.th + L.e + 2) * st;
        c.drawImage(sp, (q - 1) * w * 1.25 - w / 2, -ph * 0.04 - h / 2 + Math.sin(t * 3 + q) * 4, w, h);
      });
      c.font = `700 ${Math.round(ph * 0.085)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.9)';
      c.fillText(`Level ${level - 1} done`, 0, ph * 0.15);
      c.fillStyle = '#fff59d';
      c.fillText(Kit.touchFirst() ? 'Tap for the next level' : 'Press OK for the next level', 0, ph * 0.32);
      c.restore();
    }
  }

  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('jademahjong', level - 1);
})();
