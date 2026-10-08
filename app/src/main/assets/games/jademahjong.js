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
  let helps = 0, banner = 0, flyers = [], flip = null, nopeT = 0, nopeTile = -1, lastMatchT = -9, streak = 0, stuck = false;
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
    history = []; won = false; sel = -1; hint = null; flyers = []; flip = null; streak = 0; helps = 0; banner = 0;
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
    { id: 'hint', label: 'Hint' },
    { id: 'shuffle', label: 'Shuffle' },
    { id: 'undo', label: 'Undo' },
    { id: 'restart', label: 'Restart' },
  ];
  let L = { buttons: [] };
  const sprites = new Map();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const canvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h)); return cv; };
  let scene = null, glows = {}, fx = {};
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W) return;
    const bh = Math.round(clamp(H * 0.08, 42, 84)), bw = Math.round(Math.min(W * 0.19, bh * 3.3)), gap = Math.round(bh * 0.38);
    const by = H - bh - H * 0.07;
    const total = BUTTONS.length * bw + (BUTTONS.length - 1) * gap;
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: (W - total) / 2 + i * (bw + gap), y: by, w: bw, h: bh }));
    // Header pills: level on the left, tiles left on the right, progress in the middle.
    const hh = Math.round(clamp(H * 0.075, 36, 80)), hy = Math.round(H * 0.022);
    L.lvl = { x: Math.round(W * 0.025), y: hy, w: Math.round(hh * 3.4), h: hh };
    L.left = { x: Math.round(W - 74 - hh * 3.1), y: hy, w: Math.round(hh * 3.1), h: hh };
    L.bar = { x: W / 2 - W * 0.13, y: hy + hh * 0.62, w: W * 0.26, h: Math.max(8, hh * 0.2) };
    // Tiles as big as the space allows, on a lacquered mat.
    const top = H * 0.135, bottom = by - H * 0.035;
    const maxX = Math.max(...P.map((p) => p.x)) + 2, maxY = Math.max(...P.map((p) => p.y)) + 2, maxZ = Math.max(...P.map((p) => p.z));
    const R = 1.22; // tile height / width
    const depth = 0.15; // layer lift as a share of tile width
    const tw = Math.min((W * 0.84) / (maxX / 2 + depth * (maxZ + 1) + 0.6), (bottom - top) / (maxY / 2 * R + depth * (maxZ + 1) + 0.55), 132);
    L.tw = tw; L.th = tw * R; L.e = tw * depth;
    const bwid = maxX / 2 * tw + L.e * (maxZ + 1), bhei = maxY / 2 * L.th + L.e * (maxZ + 1);
    L.ox = (W - bwid) / 2 + L.e * maxZ;
    L.oy = top + (bottom - top - bhei) / 2 + L.e * maxZ;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    P.forEach((_, i) => { const p = tileXY(i); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x + tw + L.e); y1 = Math.max(y1, p.y + L.th + L.e); });
    const pad = tw * 0.32;
    L.mat = { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
    sprites.clear();
    bakeScene(); bakeFx();
  }
  Kit.onResize(layout);
  const tileXY = (i) => ({ x: L.ox + P[i].x * L.tw / 2 - P[i].z * L.e, y: L.oy + P[i].y * L.th / 2 - P[i].z * L.e });
  const centre = (i) => { const p = tileXY(i); return { x: p.x + L.tw / 2, y: p.y + L.th / 2 }; };

  // ---------- The zen garden, painted once per screen size ----------
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function bambooStalk(c, x, H, w, lean, dark, rnd) {
    // Segments from the ground up, each with a lit side and a joint ring, plus a few leaf sprays.
    let y = H + 10, k = 0;
    while (y > -40) {
      const segH = H * (0.11 + rnd() * 0.05), xx = x + lean * (H - y) / H;
      const g = c.createLinearGradient(xx - w / 2, 0, xx + w / 2, 0);
      g.addColorStop(0, shade(dark, -0.35)); g.addColorStop(0.3, shade(dark, 0.28)); g.addColorStop(0.55, dark); g.addColorStop(1, shade(dark, -0.45));
      c.fillStyle = g;
      roundRect(c, xx - w / 2, y - segH, w, segH - w * 0.12, w * 0.25); c.fill();
      c.fillStyle = shade(dark, 0.35);
      roundRect(c, xx - w * 0.58, y - w * 0.22, w * 1.16, w * 0.24, w * 0.12); c.fill();
      if (k > 1 && rnd() < 0.55) {
        const side = rnd() < 0.5 ? -1 : 1, n = 3 + Math.floor(rnd() * 3);
        c.strokeStyle = shade(dark, -0.2); c.lineWidth = Math.max(1, w * 0.12);
        const bx = xx + side * w * 0.4, byy = y - segH * 0.1;
        c.beginPath(); c.moveTo(xx, byy); c.lineTo(bx + side * w * 1.5, byy - w * 1.2); c.stroke();
        for (let q = 0; q < n; q++) {
          const a = side > 0 ? -0.4 + q * 0.35 + rnd() * 0.2 : Math.PI + 0.4 - q * 0.35 - rnd() * 0.2;
          const len = w * (3 + rnd() * 2.2);
          c.save(); c.translate(bx + side * w * 1.5, byy - w * 1.2); c.rotate(a + 0.5 * side);
          const lg = c.createLinearGradient(0, 0, len, 0);
          lg.addColorStop(0, shade(dark, 0.15)); lg.addColorStop(1, shade(dark, -0.25));
          c.fillStyle = lg;
          c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.45, -len * 0.16, len, 0); c.quadraticCurveTo(len * 0.45, len * 0.16, 0, 0); c.fill();
          c.restore();
        }
      }
      y -= segH; k++;
    }
  }
  function lantern(c, x, y, s) {
    // A paper lantern on a string, with a warm glow round it.
    c.strokeStyle = 'rgba(30,20,10,0.8)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, -5); c.lineTo(x, y - s * 0.62); c.stroke();
    const glow = c.createRadialGradient(x, y, 0, x, y, s * 2.6);
    glow.addColorStop(0, 'rgba(255,170,80,0.42)'); glow.addColorStop(0.4, 'rgba(255,120,40,0.14)'); glow.addColorStop(1, 'rgba(255,120,40,0)');
    c.fillStyle = glow; c.fillRect(x - s * 2.6, y - s * 2.6, s * 5.2, s * 5.2);
    const g = c.createRadialGradient(x - s * 0.15, y - s * 0.1, s * 0.05, x, y, s * 0.6);
    g.addColorStop(0, '#fff1b8'); g.addColorStop(0.35, '#ff9a3c'); g.addColorStop(1, '#b8321c');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(x, y, s * 0.46, s * 0.58, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(120,30,10,0.45)'; c.lineWidth = Math.max(1, s * 0.03);
    for (let k = -2; k <= 2; k++) { c.beginPath(); c.ellipse(x, y, Math.abs(k) * s * 0.11 + 0.5, s * 0.58, 0, 0, Math.PI * 2); c.stroke(); }
    const cap = c.createLinearGradient(0, y - s * 0.7, 0, y - s * 0.5);
    cap.addColorStop(0, '#f6d27a'); cap.addColorStop(1, '#8a5a1c');
    c.fillStyle = cap; roundRect(c, x - s * 0.24, y - s * 0.68, s * 0.48, s * 0.14, s * 0.05); c.fill();
    c.fillStyle = cap; roundRect(c, x - s * 0.24, y + s * 0.54, s * 0.48, s * 0.14, s * 0.05); c.fill();
    c.strokeStyle = '#c0392b'; c.lineWidth = Math.max(1, s * 0.04);
    c.beginPath(); c.moveTo(x, y + s * 0.68); c.lineTo(x, y + s * 0.95); c.stroke();
  }
  function bakeScene() {
    const W = Kit.W, H = Kit.H, d = DPR();
    scene = canvas(W * d, H * d);
    const c = scene.getContext('2d');
    c.scale(d, d);
    const rnd = rng(7);
    // Evening sky over the garden, with a pale moon.
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a3530'); g.addColorStop(0.5, '#1a5a4b'); g.addColorStop(1, '#071d18');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const mx = W * 0.8, my = H * 0.21;
    g = c.createRadialGradient(mx, my, 0, mx, my, H * 0.6);
    g.addColorStop(0, 'rgba(255,244,210,0.28)'); g.addColorStop(1, 'rgba(255,244,210,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createRadialGradient(mx - H * 0.015, my - H * 0.015, 0, mx, my, H * 0.06);
    g.addColorStop(0, '#fffbe8'); g.addColorStop(1, '#e8dfb8');
    c.globalAlpha = 0.85; c.fillStyle = g; c.beginPath(); c.arc(mx, my, H * 0.055, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    // Misty hills, far to near.
    ['#2f7563', '#225e4d', '#17483b'].forEach((col, k) => {
      const base = H * (0.42 + k * 0.11), amp = H * (0.12 - k * 0.025);
      c.beginPath(); c.moveTo(0, H);
      for (let x = 0; x <= W + 8; x += 8) {
        const y = base - (Math.sin(x / W * Math.PI * (1.6 + k * 0.7) + k * 1.7) * 0.5 + 0.5) * amp - Math.sin(x * 0.011 + k * 2) * H * 0.012;
        c.lineTo(x, y);
      }
      c.lineTo(W, H); c.closePath(); c.fillStyle = col; c.fill();
      const mg = c.createLinearGradient(0, base - amp * 0.4, 0, base + H * 0.12);
      mg.addColorStop(0, 'rgba(220,255,240,0)'); mg.addColorStop(0.5, 'rgba(220,255,240,0.13)'); mg.addColorStop(1, 'rgba(220,255,240,0)');
      c.fillStyle = mg; c.fillRect(0, base - amp * 0.4, W, H * 0.25);
    });
    // Raked sand at the front.
    g = c.createLinearGradient(0, H * 0.78, 0, H);
    g.addColorStop(0, '#2a4a3c'); g.addColorStop(1, '#13271f');
    c.fillStyle = g; c.fillRect(0, H * 0.8, W, H * 0.2);
    c.strokeStyle = 'rgba(200,240,220,0.06)'; c.lineWidth = 2;
    for (let k = 0; k < 9; k++) { c.beginPath(); c.ellipse(W / 2, H * 1.25, W * (0.4 + k * 0.06), H * (0.42 + k * 0.03), 0, Math.PI, Math.PI * 2); c.stroke(); }
    // Bamboo groves at both sides: far ones soft and dark, near ones lit.
    const bw = Math.max(8, W * 0.016);
    [[0.03, '#123f33', 0.8], [0.1, '#123f33', 0.6], [0.9, '#123f33', 0.8], [0.975, '#123f33', 0.6]].forEach(([fx0, col, sc]) => bambooStalk(c, W * fx0, H, bw * sc, (rnd() - 0.5) * W * 0.03, col, rnd));
    [[0.012, '#3f8f4e'], [0.06, '#4d9c55'], [0.94, '#4d9c55'], [0.99, '#3f8f4e']].forEach(([fx0, col]) => bambooStalk(c, W * fx0, H, bw * (1 + rnd() * 0.3), (rnd() - 0.5) * W * 0.03, col, rnd));
    lantern(c, W * 0.135, H * 0.3, H * 0.075);
    lantern(c, W * 0.865, H * 0.34, H * 0.068);
    // The lacquered mat the tiles sit on: wood frame, gold line, jade felt with an inner shadow.
    const m = L.mat, fr = L.tw * 0.16;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = 40; c.shadowOffsetY = 16;
    roundRect(c, m.x, m.y, m.w, m.h, fr * 1.6);
    g = c.createLinearGradient(0, m.y, 0, m.y + m.h);
    g.addColorStop(0, '#5a2e18'); g.addColorStop(0.5, '#3a1c0e'); g.addColorStop(1, '#251007');
    c.fillStyle = g; c.fill();
    c.restore();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,200,140,0.35)'; roundRect(c, m.x + 1, m.y + 1, m.w - 2, m.h - 2, fr * 1.6); c.stroke();
    const ix = m.x + fr, iy = m.y + fr, iw = m.w - fr * 2, ih = m.h - fr * 2;
    roundRect(c, ix - 3, iy - 3, iw + 6, ih + 6, fr * 0.9);
    g = c.createLinearGradient(0, iy, 0, iy + ih); g.addColorStop(0, '#f3d27a'); g.addColorStop(1, '#9a6a22');
    c.fillStyle = g; c.fill();
    roundRect(c, ix, iy, iw, ih, fr * 0.8);
    g = c.createRadialGradient(ix + iw / 2, iy + ih * 0.35, 0, ix + iw / 2, iy + ih / 2, Math.max(iw, ih) * 0.7);
    g.addColorStop(0, '#2a8068'); g.addColorStop(1, '#0d3a2e');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, ix, iy, iw, ih, fr * 0.8); c.clip();
    c.strokeStyle = 'rgba(180,255,220,0.05)'; c.lineWidth = 1;
    for (let k = -ih; k < iw; k += 14) { c.beginPath(); c.moveTo(ix + k, iy); c.lineTo(ix + k + ih, iy + ih); c.stroke(); }
    c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = 22;
    c.lineWidth = 20; c.strokeStyle = 'rgba(0,0,0,0.6)'; roundRect(c, ix - 10, iy - 10, iw + 20, ih + 20, fr); c.stroke();
    c.restore();
    // Glass pills for the header and the buttons (their text is drawn live on top).
    const glassy = (b, tint) => Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint });
    glassy(L.lvl, 'rgba(20,110,80,0.30)');
    glassy(L.left, 'rgba(20,110,80,0.30)');
    L.buttons.forEach((b) => glassy(b, 'rgba(30,120,90,0.28)'));
    roundRect(c, L.bar.x, L.bar.y, L.bar.w, L.bar.h, L.bar.h / 2); c.fillStyle = 'rgba(0,20,14,0.55)'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.stroke();
    // Vignette.
    g = c.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,8,6,0.6)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  // Glows, sparkles, light rays and mist: small pictures made once, drawn many times.
  function glowRing(color) {
    const tw = L.tw, th = L.th, G = tw * 0.32, d = DPR();
    const cv = canvas((tw + G * 2) * d, (th + G * 2) * d), c = cv.getContext('2d');
    c.scale(d, d);
    c.shadowColor = color; c.shadowBlur = G * 0.8;
    c.lineWidth = Math.max(4, tw * 0.07); c.strokeStyle = color;
    for (let k = 0; k < 2; k++) { roundRect(c, G, G, tw, th, tw * 0.14); c.stroke(); }
    cv.G = G;
    return cv;
  }
  function bakeFx() {
    glows = { gold: glowRing('#ffd23f'), jade: glowRing('#3dffb0'), cyan: glowRing('#6ee0ff') };
    const dot = canvas(64, 64), dc = dot.getContext('2d');
    let g = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.25, 'rgba(255,220,140,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    dc.fillStyle = g; dc.fillRect(0, 0, 64, 64);
    const starS = canvas(64, 64), sc = starS.getContext('2d');
    sc.shadowColor = '#fff3b0'; sc.shadowBlur = 10; sc.fillStyle = '#fffbe6';
    sc.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? 7 : 26; sc.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    sc.closePath(); sc.fill();
    const mist = canvas(512, 128), mc = mist.getContext('2d');
    g = mc.createRadialGradient(256, 64, 0, 256, 64, 256);
    g.addColorStop(0, 'rgba(220,255,240,0.5)'); g.addColorStop(1, 'rgba(220,255,240,0)');
    mc.setTransform(1, 0, 0, 0.25, 0, 48); mc.fillStyle = g; mc.fillRect(0, 0, 512, 512);
    const rays = canvas(512, 512), rc = rays.getContext('2d');
    rc.translate(256, 256);
    for (let k = 0; k < 14; k++) {
      rc.rotate(Math.PI * 2 / 14);
      g = rc.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(255,240,170,0.55)'); g.addColorStop(1, 'rgba(255,240,170,0)');
      rc.fillStyle = g; rc.beginPath(); rc.moveTo(0, 0); rc.lineTo(256, -36); rc.lineTo(256, 36); rc.closePath(); rc.fill();
    }
    fx = { dot, star: starS, mist, rays };
  }

  // ---------- Drawing a tile face (cached per face and size) ----------
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
  // A picture made rounder: lit from the top left, shaded bottom right, with a dark outline.
  function shadedArt(draw, w, h, outline) {
    const d = DPR(), cw = Math.ceil(w * d), ch = Math.ceil(h * d);
    const a = canvas(cw, ch), ac = a.getContext('2d');
    ac.scale(d, d); draw(ac);
    ac.setTransform(1, 0, 0, 1, 0, 0);
    ac.globalCompositeOperation = 'source-atop';
    const g = ac.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
    ac.fillStyle = g; ac.fillRect(0, 0, cw, ch);
    const s = canvas(cw, ch), sc = s.getContext('2d');
    sc.drawImage(a, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = outline; sc.fillRect(0, 0, cw, ch);
    const out = canvas(cw, ch), oc = out.getContext('2d');
    const o = Math.max(1, w * d * 0.018);
    oc.globalAlpha = 0.35; oc.drawImage(s, o * 0.6, o * 2.2); oc.globalAlpha = 1; // soft drop under the art
    for (let k = 0; k < 8; k++) oc.drawImage(s, Math.cos(k * Math.PI / 4) * o, Math.sin(k * Math.PI / 4) * o);
    oc.drawImage(a, 0, 0);
    return out;
  }
  function faceArt(c, f, tw, th) {
    const F = FACES[f];
    if (F.kind === 'num') {
      const S = SUITS[F.suit], fs = Math.round(th * 0.5), x = tw / 2, y = th * 0.39;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `700 ${fs}px ${Kit.FONT}`;
      // Painted and pressed in: a dark lip below, a light lip above, then the gradient ink.
      c.fillStyle = 'rgba(255,255,255,0.95)'; c.fillText(String(F.n), x - fs * 0.02, y - fs * 0.03);
      c.fillStyle = shade(S.color, -0.55); c.fillText(String(F.n), x + fs * 0.025, y + fs * 0.045);
      const g = c.createLinearGradient(0, y - fs / 2, 0, y + fs / 2);
      g.addColorStop(0, shade(S.color, 0.25)); g.addColorStop(0.55, S.color); g.addColorStop(1, shade(S.color, -0.3));
      c.fillStyle = g; c.fillText(String(F.n), x, y);
      const lines = PIP_ROWS[F.n], pr = Math.min(tw * 0.075, th * 0.055);
      const gapX = tw * 0.15;
      lines.forEach((n, row) => {
        const py = th * (lines.length === 1 ? 0.8 : 0.74 + row * 0.125);
        for (let k = 0; k < n; k++) pip(c, S.pip, S.color, x + (k - (n - 1) / 2) * gapX, py, pr);
      });
    } else {
      const s = Math.min(tw * 0.8, th * 0.64), box = s * 1.3;
      const art = shadedArt((ac) => { ac.translate(box / 2, box / 2); picture(ac, F.name, s); }, box, box, 'rgba(60,35,10,0.85)');
      c.drawImage(art, tw / 2 - box / 2, th * 0.5 - box / 2, box, box);
    }
  }
  function pip(c, kind, color, x, y, r) {
    const g = c.createRadialGradient(x - r * 0.4, y - r * 0.5, r * 0.1, x, y, r * 1.3);
    g.addColorStop(0, shade(color, 0.45)); g.addColorStop(1, shade(color, -0.25));
    c.fillStyle = g;
    if (kind === 'coin') {
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(x, y, r * 0.38, 0, Math.PI * 2); c.fill();
    } else if (kind === 'stick') {
      roundRect(c, x - r * 0.5, y - r * 1.15, r, r * 2.3, r * 0.45); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x - r * 0.45, y - r * 0.12, r * 0.9, r * 0.16);
    } else {
      c.beginPath(); c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 0.85, y); c.lineTo(x, y + r * 1.15); c.lineTo(x - r * 0.85, y); c.closePath(); c.fill();
    }
  }
  // A whole tile, made once per face and size: soft shadow, jade back with veins, ivory body,
  // bevelled face, and the art. sprite.o is where the face's top-left corner sits in the picture.
  function sprite(f, dim) {
    const key = f + ':' + Math.round(L.tw) + (dim ? 'd' : '');
    let s = sprites.get(key);
    if (s) return s;
    if (dim) {
      // The held-down look, baked: the same tile with its face in shade.
      const b = sprite(f), d = DPR();
      s = canvas(b.width, b.height); s.o = b.o;
      const c = s.getContext('2d');
      c.drawImage(b, 0, 0); c.scale(d, d);
      roundRect(c, b.o, b.o, L.tw, L.th, L.tw * 0.14); c.fillStyle = 'rgba(6,28,22,0.36)'; c.fill();
      sprites.set(key, s);
      return s;
    }
    const d = DPR(), tw = L.tw, th = L.th, e = L.e, r = tw * 0.14, o = Math.ceil(tw * 0.06);
    s = canvas((tw + e + o * 3) * d, (th + e + o * 3) * d);
    s.o = o;
    const c = s.getContext('2d');
    c.scale(d, d); c.translate(o, o);
    // Soft contact shadow.
    c.save();
    c.shadowColor = 'rgba(0,10,6,0.55)'; c.shadowBlur = e * 1.6; c.shadowOffsetX = e * 0.7 + 4000; c.shadowOffsetY = e * 1.0;
    roundRect(c, -4000, 0, tw + e * 0.6, th + e * 0.6, r); c.fillStyle = '#000'; c.fill();
    c.restore();
    // Jade back with marble veins.
    roundRect(c, e, e, tw, th, r);
    let g = c.createLinearGradient(e, e, e + tw, e + th);
    g.addColorStop(0, '#1a9a72'); g.addColorStop(1, '#06452f');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, e, e, tw, th, r); c.clip();
    const rnd = rng(f * 31 + 5);
    c.strokeStyle = 'rgba(190,255,225,0.28)'; c.lineWidth = Math.max(1, tw * 0.012);
    for (let k = 0; k < 4; k++) {
      c.beginPath(); c.moveTo(e + rnd() * tw, e + th);
      c.bezierCurveTo(e + rnd() * tw, e + th * 0.6, e + rnd() * tw * 1.2, e + th * 0.3, e + tw + 2, e + rnd() * th);
      c.stroke();
    }
    c.restore();
    // Ivory body (the thickness you see between face and jade).
    roundRect(c, e * 0.42, e * 0.42, tw, th, r);
    g = c.createLinearGradient(0, 0, tw, th);
    g.addColorStop(0, '#e9dcb8'); g.addColorStop(1, '#b9a679');
    c.fillStyle = g; c.fill();
    // Face.
    roundRect(c, 0, 0, tw, th, r);
    g = c.createLinearGradient(0, 0, tw * 0.6, th);
    g.addColorStop(0, '#fffef8'); g.addColorStop(0.6, '#f7efdb'); g.addColorStop(1, '#ebdfc0');
    c.fillStyle = g; c.fill();
    // Bevel: light along the top and left, shade along the bottom and right.
    c.save(); roundRect(c, 0, 0, tw, th, r); c.clip();
    c.lineWidth = tw * 0.06;
    c.strokeStyle = 'rgba(120,95,50,0.28)'; roundRect(c, tw * 0.03, tw * 0.03, tw, th, r); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.95)'; roundRect(c, -tw * 0.03, -tw * 0.03, tw, th, r); c.stroke();
    const sh = c.createRadialGradient(tw * 0.28, th * 0.15, 0, tw * 0.28, th * 0.15, tw * 0.9);
    sh.addColorStop(0, 'rgba(255,255,255,0.55)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.fillRect(0, 0, tw, th);
    c.restore();
    c.lineWidth = Math.max(1, tw * 0.014); c.strokeStyle = 'rgba(90,65,25,0.45)'; roundRect(c, 0, 0, tw, th, r); c.stroke();
    // A fine engraved frame round the art.
    c.lineWidth = Math.max(1, tw * 0.012); c.strokeStyle = 'rgba(160,125,60,0.25)';
    roundRect(c, tw * 0.09, tw * 0.09, tw * 0.82, th - tw * 0.18, r * 0.6); c.stroke();
    if (f >= 0) faceArt(c, f, tw, th);
    sprites.set(key, s);
    return s;
  }
  // Draws tile f with its face's top-left at (x, y), scaled about its middle.
  function drawTile(c, f, x, y, sx = 1, sy = 1, rot = 0, dim = false) {
    const s = sprite(f, dim), d = DPR(), w = s.width / d, h = s.height / d;
    if (sx === 1 && sy === 1 && !rot) { c.drawImage(s, x - s.o, y - s.o, w, h); return; }
    c.save(); c.translate(x + L.tw / 2, y + L.th / 2); c.rotate(rot); c.scale(sx, sy);
    c.drawImage(s, -L.tw / 2 - s.o, -L.th / 2 - s.o, w, h);
    c.restore();
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
      setTimeout(() => { sfx.win(); Kit.confetti(160); Kit.shake(8, 0.4); }, 450);
      const n = helps === 0 ? 3 : helps <= 2 ? 2 : 1;
      for (let k = 0; k < n; k++) setTimeout(() => Kit.tone(880 * Math.pow(1.26, k), { type: 'triangle', dur: 0.25, vol: 0.16 }), 1250 + k * 220);
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
      hint = { pair, t: now() }; sel = -1; cursor = pair[0]; helps++;
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
      sel = -1; hint = null; helps++; refreshFree(); save();
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
  let starsShown = 0, sparks = [], flashes = [], shine = { i: -1, t: 0, wait: 2 }, fontOK = false, fontWait = 0;
  const motes = Array.from({ length: 16 }, () => ({ x: Math.random(), y: 0.25 + Math.random() * 0.7, s: 0.5 + Math.random(), p: Math.random() * 6, v: 0.006 + Math.random() * 0.012 }));
  function sparkle(x, y, n, speed = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (80 + Math.random() * 300) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0, max: 0.45 + Math.random() * 0.5, size: 10 + Math.random() * 22, rot: Math.random() * 3, spin: (Math.random() - 0.5) * 8 });
    }
  }
  function fontsLoaded() {
    try { for (const f of document.fonts) if (/Fredoka/.test(f.family) && f.status === 'loaded') return true; } catch (e) { return true; }
    return false;
  }
  function update(dt) {
    introT += dt; banner += dt;
    // The rounded display font arrives a moment after start: redraw the tiles with it once it's in.
    if (!fontOK && (fontWait += dt) > 0.3) { fontWait = 0; if (fontsLoaded() || introT > 8) { fontOK = true; sprites.clear(); } }
    for (let k = flyers.length - 1; k >= 0; k--) {
      const f = flyers[k];
      f.t += dt / 0.42;
      if (f.t >= 1) {
        if (f.lead) {
          const m = f.mid, cx = m.x, cy = m.y + L.th / 2;
          flashes.push({ x: cx, y: cy, t: 0 });
          sparkle(cx, cy, 14, 0.9);
          Kit.burst(cx, cy, '#3ddc97', 10, 0.8);
          sfx.clear(1, Math.min(streak, 3));
          Kit.shake(2.5, 0.15);
          const words = ['', '', 'Nice!', 'Great!', 'Wonderful!', 'Superb!'];
          if (streak >= 2 && !won) Kit.float(words[Math.min(streak, 5)], cx, m.y, { color: '#9ff0c8', size: Math.max(34, L.tw * 0.5), big: true, life: 1.2 });
        }
        flyers.splice(k, 1);
      }
    }
    for (let k = sparks.length - 1; k >= 0; k--) {
      const p = sparks[k];
      p.life += dt; if (p.life > p.max) { sparks.splice(k, 1); continue; }
      p.vx *= 0.94; p.vy = p.vy * 0.94 + 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
    }
    for (let k = flashes.length - 1; k >= 0; k--) { flashes[k].t += dt; if (flashes[k].t > 0.45) flashes.splice(k, 1); }
    if (flip) { flip.t += dt / 0.5; if (flip.t >= 1) flip = null; }
    // Win panel: each star bursts with sparkles as it lands.
    if (won && now() > wonT) {
      const since = now() - wonT, n = helps === 0 ? 3 : helps <= 2 ? 2 : 1, ph = Math.min(Kit.H * 0.6, 470);
      while (starsShown < n && since > 0.55 + starsShown * 0.22) {
        sparkle(Kit.W / 2 + (starsShown - 1) * ph * 0.28, Kit.H * 0.5 + ph * 0.02, 12, 0.8); starsShown++;
      }
    } else starsShown = 0;
    // Every few seconds a gleam runs across one free tile.
    shine.t += dt;
    if (shine.t > shine.wait) {
      const list = []; P.forEach((_, i) => { if (free[i]) list.push(i); });
      shine = { i: list.length ? list[Math.floor(Math.random() * list.length)] : -1, t: 0, wait: 1.6 + Math.random() * 1.6 };
    }
  }
  // Little pictures for the buttons, drawn with lines (crisper than emoji on a TV).
  function btnIcon(c, id, x, y, s, col) {
    c.save(); c.translate(x, y);
    c.strokeStyle = col; c.fillStyle = col; c.lineWidth = Math.max(2, s * 0.13); c.lineCap = 'round'; c.lineJoin = 'round';
    const head = (hx, hy, a) => { c.beginPath(); c.moveTo(hx + Math.cos(a + 2.5) * s * 0.28, hy + Math.sin(a + 2.5) * s * 0.28); c.lineTo(hx, hy); c.lineTo(hx + Math.cos(a - 2.5) * s * 0.28, hy + Math.sin(a - 2.5) * s * 0.28); c.stroke(); };
    if (id === 'hint') {
      c.beginPath(); c.arc(0, -s * 0.12, s * 0.32, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(s * 0.14, s * 0.3); c.lineTo(-s * 0.14, s * 0.3); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.12, s * 0.45); c.lineTo(s * 0.12, s * 0.45); c.stroke();
      for (let k = -1; k <= 1; k++) { const a = -Math.PI / 2 + k * 0.8; c.beginPath(); c.moveTo(Math.cos(a) * s * 0.5, -s * 0.12 + Math.sin(a) * s * 0.5); c.lineTo(Math.cos(a) * s * 0.62, -s * 0.12 + Math.sin(a) * s * 0.62); c.stroke(); }
    } else if (id === 'shuffle') {
      c.beginPath(); c.moveTo(-s * 0.5, s * 0.3); c.bezierCurveTo(-s * 0.1, s * 0.3, s * 0.05, -s * 0.3, s * 0.45, -s * 0.3); c.stroke(); head(s * 0.5, -s * 0.3, 0);
      c.beginPath(); c.moveTo(-s * 0.5, -s * 0.3); c.bezierCurveTo(-s * 0.1, -s * 0.3, s * 0.05, s * 0.3, s * 0.45, s * 0.3); c.stroke(); head(s * 0.5, s * 0.3, 0);
    } else if (id === 'undo') {
      c.beginPath(); c.arc(s * 0.05, s * 0.08, s * 0.38, Math.PI * 1.15, Math.PI * 0.55, false); c.stroke();
      head(-s * 0.3, -s * 0.12, -Math.PI * 0.62);
    } else if (id === 'restart') {
      c.beginPath(); c.arc(0, 0, s * 0.4, -Math.PI * 0.35, Math.PI * 1.45); c.stroke();
      head(s * 0.23, -s * 0.33, -0.2);
    } else if (id === 'sound' || id === 'mute') {
      c.beginPath(); c.moveTo(-s * 0.45, -s * 0.15); c.lineTo(-s * 0.2, -s * 0.15); c.lineTo(s * 0.08, -s * 0.4); c.lineTo(s * 0.08, s * 0.4); c.lineTo(-s * 0.2, s * 0.15); c.lineTo(-s * 0.45, s * 0.15); c.closePath(); c.fill();
      if (id === 'sound') { c.beginPath(); c.arc(s * 0.1, 0, s * 0.3, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(s * 0.1, 0, s * 0.5, -0.8, 0.8); c.stroke(); }
      else { c.beginPath(); c.moveTo(s * 0.25, -s * 0.2); c.lineTo(s * 0.6, s * 0.2); c.moveTo(s * 0.6, -s * 0.2); c.lineTo(s * 0.25, s * 0.2); c.stroke(); }
    }
    c.restore();
  }
  function ribbon(c, cx, cy, w, h, top, bottom) {
    const tail = h * 0.7;
    c.fillStyle = shade(bottom, -0.35);
    [-1, 1].forEach((s) => {
      const x = cx + s * (w / 2 - tail * 0.3);
      c.beginPath(); c.moveTo(x, cy - h * 0.3); c.lineTo(x + s * tail, cy - h * 0.3); c.lineTo(x + s * tail * 0.7, cy + h * 0.1); c.lineTo(x + s * tail, cy + h * 0.5); c.lineTo(x, cy + h * 0.5); c.closePath(); c.fill();
    });
    const g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; roundRect(c, cx - w / 2, cy - h / 2, w, h, h * 0.18); c.fill();
    c.lineWidth = Math.max(2, h * 0.06); c.strokeStyle = '#f6d27a'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(c, cx - w / 2 + 4, cy - h / 2 + 3, w - 8, h * 0.32, h * 0.12); c.fill();
  }
  function starShape(c, x, y, r) {
    c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * 0.48 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath();
  }
  function starsFor() { return helps === 0 ? 3 : helps <= 2 ? 2 : 1; }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, nw = now();
    const { tw, th } = L;
    if (!scene) layout();
    c.drawImage(scene, 0, 0, W, H);

    // Living layers: drifting mist, lantern glow, fireflies.
    c.globalAlpha = 0.22;
    c.drawImage(fx.mist, ((t * 14) % (W + 600)) - 600, H * 0.46, 620, 150);
    c.drawImage(fx.mist, W - ((t * 9 + 300) % (W + 600)), H * 0.6, 720, 170);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'lighter';
    const lg = 0.32 + 0.1 * Math.sin(t * 2.1);
    c.globalAlpha = lg; c.drawImage(fx.dot, W * 0.135 - H * 0.12, H * 0.3 - H * 0.12, H * 0.24, H * 0.24);
    c.globalAlpha = lg * 0.9; c.drawImage(fx.dot, W * 0.865 - H * 0.11, H * 0.34 - H * 0.11, H * 0.22, H * 0.22);
    for (const m of motes) {
      const x = ((m.x + t * m.v) % 1) * W, y = m.y * H + Math.sin(t * 0.7 + m.p) * H * 0.03, a = 0.35 + 0.35 * Math.sin(t * 1.6 + m.p);
      const s = 10 + m.s * 10;
      c.globalAlpha = Math.max(0, a); c.drawImage(fx.dot, x - s / 2, y - s / 2, s, s);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // Header: level, layout name with a progress bar, tiles left.
    const shownLevel = won ? level - 1 : level;
    const lp = L.lvl;
    Kit.title(c, `Level ${shownLevel}`, lp.x + lp.w / 2, lp.y + lp.h / 2 + 1, Math.round(lp.h * 0.52), { color: '#bff5dc' });
    const left = alive.reduce((s, a) => s + a, 0);
    const rp = L.left, mini = rp.h * 0.62;
    c.save(); c.translate(rp.x + rp.h * 0.55, rp.y + rp.h / 2); c.scale(mini / th * 0.9, mini / th * 0.9);
    drawTile(c, FACES.length - 4, -tw / 2, -th / 2); c.restore();
    c.font = `600 ${Math.round(rp.h * 0.44)}px ${Kit.UI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.fillText(`${left} left`, rp.x + rp.w * 0.58, rp.y + rp.h / 2 + 1);
    c.font = `600 ${Math.round(lp.h * 0.36)}px ${Kit.UI}`; c.fillStyle = 'rgba(220,255,240,0.85)';
    c.fillText(layoutName, W / 2, L.bar.y - lp.h * 0.3);
    const prog = 1 - left / P.length, b = L.bar;
    if (prog > 0.001) {
      const bw = Math.max(b.h, b.w * prog);
      roundRect(c, b.x, b.y, bw, b.h, b.h / 2);
      const pg = c.createLinearGradient(b.x, 0, b.x + b.w, 0); pg.addColorStop(0, '#2fe39a'); pg.addColorStop(1, '#ffd23f');
      c.fillStyle = pg; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.4)'; roundRect(c, b.x + 2, b.y + 1, bw - 4, b.h * 0.38, b.h * 0.2); c.fill();
    }

    // Tiles
    const flipK = flip ? Math.abs(Math.cos(flip.t * Math.PI)) : 1;
    const hintOn = hint && nw - hint.t < 4;
    for (const i of order) {
      if (!alive[i]) continue;
      let { x, y } = tileXY(i);
      const isSel = sel === i, isFocus = cursor === i && !won && !Kit.touchFirst();
      if (isSel) y -= th * 0.09;
      else if (isFocus) y -= th * 0.025 * (1 + Math.sin(t * 4)) * 0.5;
      if (i === nopeTile && nw - nopeT < 0.3) x += Math.sin((nw - nopeT) * 60) * tw * 0.06;
      const f = flip && flip.t < 0.5 ? flip.from[i] : faces[i];
      drawTile(c, f, x, y, flip ? flipK : 1, 1, 0, !free[i]);
      if (shine.i === i && free[i] && shine.t < 0.7) {
        c.save(); roundRect(c, x, y, tw, th, tw * 0.14); c.clip();
        const sx = x - tw + (shine.t / 0.7) * tw * 3;
        const sg = c.createLinearGradient(sx, y, sx + tw * 0.6, y + th * 0.3);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.55)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sg; c.fillRect(x, y, tw, th); c.restore();
      }
      const ring = (g, a) => { c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; const d = DPR(); c.drawImage(g, x - g.G, y - g.G, g.width / d, g.height / d); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; };
      if (isSel) {
        roundRect(c, x, y, tw, th, tw * 0.14); c.fillStyle = 'rgba(60,230,160,0.2)'; c.fill();
        ring(glows.jade, 0.8);
      }
      if (hintOn && (hint.pair[0] === i || hint.pair[1] === i)) ring(glows.cyan, 0.55 + 0.45 * Math.sin(t * 8));
      if (isFocus) {
        ring(glows.gold, 0.6 + 0.4 * Math.sin(t * 6));
        roundRect(c, x - 5, y - 5, tw + 10, th + 10, tw * 0.18);
        c.lineWidth = Math.max(5, tw * 0.075); c.strokeStyle = '#ffae00'; c.stroke();
        c.lineWidth = Math.max(2, tw * 0.025); c.strokeStyle = '#fff8c8'; c.stroke();
      }
    }

    // Pairs flying together, stretching as they go.
    for (const f of flyers) {
      const k = ease.inOut(Math.min(1, f.t)), sw = Math.sin(k * Math.PI);
      const x = lerp(f.from.x, f.to.x, k), y = lerp(f.from.y, f.to.y, k) - sw * th * 0.35;
      c.globalAlpha = f.t > 0.85 ? (1 - f.t) / 0.15 : 1;
      drawTile(c, f.f, x, y, 1 + sw * 0.22, 1 + sw * 0.1 - (f.t > 0.85 ? 0.15 : 0), (f.lead ? -1 : 1) * sw * 0.18);
      c.globalAlpha = 1;
    }
    c.globalCompositeOperation = 'lighter';
    for (const fl of flashes) {
      const k = fl.t / 0.45, s = tw * (1 + k * 3);
      c.globalAlpha = (1 - k) * 0.9; c.drawImage(fx.dot, fl.x - s / 2, fl.y - s / 2, s, s);
    }
    for (const p of sparks) {
      const a = 1 - p.life / p.max;
      c.globalAlpha = a; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(fx.star, -p.size / 2, -p.size / 2, p.size, p.size); c.restore();
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // Buttons (their glass is in the scene; the focused one turns gold and glows).
    L.buttons.forEach((bt, k) => {
      const on = cursor === 1000 + k && !won && !Kit.touchFirst();
      const off = bt.id === 'undo' && !history.length;
      if (on) {
        c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = 22 + 8 * Math.sin(t * 5);
        roundRect(c, bt.x, bt.y, bt.w, bt.h, bt.h / 2);
        const gg = c.createLinearGradient(0, bt.y, 0, bt.y + bt.h); gg.addColorStop(0, '#fff09a'); gg.addColorStop(0.5, '#ffd23f'); gg.addColorStop(1, '#f0a400');
        c.fillStyle = gg; c.fill(); c.restore();
        c.lineWidth = 2.5; c.strokeStyle = '#fff'; roundRect(c, bt.x, bt.y, bt.w, bt.h, bt.h / 2); c.stroke();
      }
      if (bt.id === 'shuffle' && stuck && !on) {
        c.save(); c.shadowColor = '#6ee0ff'; c.shadowBlur = 20; c.lineWidth = 3; c.strokeStyle = `rgba(110,224,255,${0.6 + 0.4 * Math.sin(t * 6)})`;
        roundRect(c, bt.x - 3, bt.y - 3, bt.w + 6, bt.h + 6, bt.h / 2 + 3); c.stroke(); c.restore();
      }
      const col = on ? '#3a2200' : off ? 'rgba(255,255,255,0.4)' : '#ffffff';
      const fs = Math.round(Math.min(bt.h * 0.4, bt.w * 0.15));
      c.font = `700 ${fs}px ${Kit.UI}`;
      const tw2 = c.measureText(bt.label).width, iconS = bt.h * 0.5, gapI = bt.h * 0.18;
      const sx = bt.x + bt.w / 2 - (tw2 + iconS + gapI) / 2;
      btnIcon(c, bt.id, sx + iconS / 2, bt.y + bt.h / 2, iconS, col);
      c.fillStyle = col; c.textAlign = 'left'; c.fillText(bt.label, sx + iconS + gapI, bt.y + bt.h / 2 + 1); c.textAlign = 'center';
    });

    // One-line help (or a nudge when no pair is left).
    const fs = Math.round(clamp(H * 0.032, 18, 34));
    c.font = `600 ${fs}px ${Kit.UI}`; c.lineJoin = 'round';
    const help = stuck && !won ? 'No matching free pair left. Press Shuffle (or Undo)'
      : Kit.touchFirst() ? 'Tap two matching bright tiles to clear them' : 'Arrows move · OK picks a tile · pick its twin to clear · Back exits';
    c.lineWidth = 4; c.strokeStyle = 'rgba(0,15,10,0.6)'; c.strokeText(help, W / 2, H - H * 0.034);
    c.fillStyle = stuck && !won ? '#ffe2a8' : 'rgba(235,255,245,0.82)'; c.fillText(help, W / 2, H - H * 0.034);

    const m = muteBox();
    c.globalAlpha = 0.75; btnIcon(c, Kit.muted ? 'mute' : 'sound', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.55, '#fff'); c.globalAlpha = 1;

    // Level intro: a ribbon sweeps in with the level and the layout's name.
    if (banner < 2.3 && !won) {
      const k = banner < 0.4 ? ease.back(banner / 0.4) : banner > 1.9 ? 1 - ease.inOut((banner - 1.9) / 0.4) : 1;
      const bwid = Math.min(W * 0.62, H * 1.0), bht = Math.max(56, H * 0.13);
      c.save(); c.globalAlpha = clamp(k, 0, 1);
      c.translate(W / 2 + (1 - clamp(k, 0, 1)) * -W * 0.3, H * 0.47);
      ribbon(c, 0, 0, bwid, bht, '#2fae84', '#0d5a42');
      Kit.title(c, `Level ${level}`, 0, -bht * 0.12, Math.round(bht * 0.46), { color: '#ffe9a8' });
      c.font = `600 ${Math.round(bht * 0.22)}px ${Kit.UI}`; c.fillStyle = '#e8fff4'; c.fillText(layoutName, 0, bht * 0.3);
      c.restore();
    }

    if (won && nw > wonT) {
      const a = clamp((nw - wonT) / 0.45, 0, 1), since = nw - wonT;
      c.fillStyle = `rgba(2,16,12,${0.62 * a})`; c.fillRect(0, 0, W, H);
      const rs = Math.min(W, H) * 1.25;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.45 * a;
      c.translate(W / 2, H * 0.47); c.rotate(t * 0.25); c.drawImage(fx.rays, -rs / 2, -rs / 2, rs, rs); c.restore();
      c.save(); c.translate(W / 2, H * 0.5); const sc = ease.back(a); c.scale(sc, sc);
      const pw = Math.min(W * 0.7, H * 1.05), ph = Math.min(H * 0.6, 470);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 32);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2); g.addColorStop(0, '#1f8a69'); g.addColorStop(1, '#0a3b2e');
      c.fillStyle = g; c.fill(); c.restore();
      Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 32, { tint: 'rgba(255,255,255,0.04)', edge: 'rgba(246,210,122,0.9)' });
      ribbon(c, 0, -ph / 2 + ph * 0.02, pw * 0.7, ph * 0.17, '#e04a3a', '#8e1f14');
      Kit.title(c, `Level ${level - 1}`, 0, -ph / 2 + ph * 0.015, Math.round(ph * 0.085), { color: '#ffe9a8' });
      Kit.title(c, 'Table cleared!', 0, -ph * 0.22, Math.round(ph * 0.13), { color: '#d8ffe9', glow: 'rgba(120,255,200,0.6)' });
      const n = starsFor();
      for (let k = 0; k < 3; k++) {
        const st = clamp((since - 0.35 - k * 0.22) / 0.45, 0, 1);
        if (st <= 0) continue;
        const r = ph * (k === 1 ? 0.12 : 0.095) * ease.elastic(st), x = (k - 1) * ph * 0.28, y = ph * 0.02 - (k === 1 ? ph * 0.04 : 0);
        starShape(c, x, y, r);
        if (k < n) {
          c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = 24;
          const sg = c.createLinearGradient(0, y - r, 0, y + r); sg.addColorStop(0, '#fff6b0'); sg.addColorStop(0.5, '#ffc61a'); sg.addColorStop(1, '#e08a00');
          c.fillStyle = sg; c.fill(); c.restore();
          c.lineWidth = 3; c.strokeStyle = '#9a5a00'; c.stroke();
        } else { c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.stroke(); }
      }
      c.font = `600 ${Math.round(ph * 0.062)}px ${Kit.UI}`; c.fillStyle = 'rgba(235,255,245,0.9)';
      c.fillText(n === 3 ? 'Perfect: no help needed!' : n === 2 ? 'Well played!' : 'Cleared with a little help', 0, ph * 0.2);
      const bw2 = pw * 0.5, bh2 = ph * 0.15, by2 = ph * 0.29;
      c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = 18 + 8 * Math.sin(t * 5);
      roundRect(c, -bw2 / 2, by2, bw2, bh2, bh2 / 2);
      const bg2 = c.createLinearGradient(0, by2, 0, by2 + bh2); bg2.addColorStop(0, '#fff09a'); bg2.addColorStop(1, '#f0a400');
      c.fillStyle = bg2; c.fill(); c.restore();
      c.font = `700 ${Math.round(bh2 * 0.45)}px ${Kit.UI}`; c.fillStyle = '#3a2200';
      c.fillText(Kit.touchFirst() ? 'Tap: next level' : 'OK  ·  Next level', 0, by2 + bh2 / 2 + 1);
      c.restore();
    }
  }

  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('jademahjong', level - 1);
})();
