// Tile Trio: a heap of picture tiles. Pick an uncovered tile and it slides into the 7-slot tray at the
// bottom; three of the same picture in the tray clear away. Clear the whole heap to win the level.
// If the tray fills up with no three alike, the level is lost (one rescue, or try again).
// Every heap is dealt by playing it through first, so it can always be cleared.
// Remote: arrows jump between uncovered tiles (the nearest one that way), OK picks it. Down from the
// bottom row reaches Undo, Shuffle and Hint. Touch and mouse: tap a tile.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const SLOTS = 7;

  // ---------- Pictures ----------
  const ICONS = [
    { name: 'leaf', color: '#2fa84f' }, { name: 'apple', color: '#e0242e' }, { name: 'star', color: '#f5b301' },
    { name: 'fish', color: '#2f8fe0' }, { name: 'bell', color: '#8a9bbd' }, { name: 'cup', color: '#12a3a0' },
    { name: 'heart', color: '#d81b5a' }, { name: 'flower', color: '#ec5fa4' }, { name: 'cherry', color: '#a3112e' },
    { name: 'moon', color: '#3b5bd8' }, { name: 'mushroom', color: '#b5562a' }, { name: 'carrot', color: '#f27a1a' },
    { name: 'drop', color: '#19b8e6' }, { name: 'grapes', color: '#7a2fb8' },
  ];
  function starPath(c, x, y, r, inner) {
    c.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * inner : r;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  function leafShape(c, x, y, len, ang, color) {
    c.save(); c.translate(x, y); c.rotate(ang);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
    c.fillStyle = color || '#2e9e45'; c.fill(); c.restore();
  }
  function shine(c, x, y, rx, ry, rot) {
    c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(x, y, rx, ry, rot || 0, 0, Math.PI * 2); c.fill();
  }
  // Each picture is drawn round (0, 0), about 2r across, in bold simple shapes.
  function icon(c, k, r) {
    const { name, color } = ICONS[k];
    c.lineCap = 'round'; c.lineJoin = 'round';
    if (name === 'leaf') {
      c.save(); c.rotate(-0.7);
      c.beginPath(); c.moveTo(-r * 0.95, 0); c.quadraticCurveTo(0, -r * 0.95, r * 0.95, 0); c.quadraticCurveTo(0, r * 0.95, -r * 0.95, 0);
      c.fillStyle = color; c.fill();
      c.strokeStyle = shade(color, 0.45); c.lineWidth = r * 0.08;
      c.beginPath(); c.moveTo(-r * 1.1, 0); c.lineTo(r * 0.7, 0); c.stroke();
      for (let q = -1; q <= 1; q += 2) for (let s = 0; s < 3; s++) { c.beginPath(); c.moveTo(-r * 0.45 + s * r * 0.4, 0); c.lineTo(-r * 0.2 + s * r * 0.4, q * r * 0.32); c.stroke(); }
      c.restore();
    } else if (name === 'apple') {
      c.fillStyle = color;
      c.beginPath(); c.moveTo(0, -r * 0.55);
      c.bezierCurveTo(r * 0.6, -r * 0.95, r * 1.15, -r * 0.3, r * 0.8, r * 0.45);
      c.bezierCurveTo(r * 0.55, r * 1.0, r * 0.15, r * 0.95, 0, r * 0.8);
      c.bezierCurveTo(-r * 0.15, r * 0.95, -r * 0.55, r * 1.0, -r * 0.8, r * 0.45);
      c.bezierCurveTo(-r * 1.15, -r * 0.3, -r * 0.6, -r * 0.95, 0, -r * 0.55);
      c.fill();
      shine(c, -r * 0.42, -r * 0.18, r * 0.13, r * 0.26, 0.4);
      c.strokeStyle = '#6b3d1e'; c.lineWidth = r * 0.12; c.beginPath(); c.moveTo(0, -r * 0.5); c.lineTo(r * 0.08, -r * 0.92); c.stroke();
      leafShape(c, r * 0.08, -r * 0.8, r * 0.55, -0.5);
    } else if (name === 'star') {
      starPath(c, 0, r * 0.06, r, 0.47); c.fillStyle = color; c.fill();
      c.lineWidth = r * 0.08; c.strokeStyle = shade(color, -0.25); c.stroke();
      starPath(c, -r * 0.05, -r * 0.02, r * 0.45, 0.47); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fill();
    } else if (name === 'fish') {
      c.fillStyle = color;
      c.beginPath(); c.moveTo(r * 0.45, 0); c.lineTo(r * 1.0, -r * 0.5); c.lineTo(r * 1.0, r * 0.5); c.closePath(); c.fill();
      c.beginPath(); c.ellipse(-r * 0.12, 0, r * 0.72, r * 0.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = shade(color, 0.35);
      c.beginPath(); c.moveTo(-r * 0.2, -r * 0.45); c.quadraticCurveTo(r * 0.1, -r * 0.85, r * 0.3, -r * 0.4); c.closePath(); c.fill();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(-r * 0.48, -r * 0.1, r * 0.16, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#10223a'; c.beginPath(); c.arc(-r * 0.5, -r * 0.1, r * 0.08, 0, Math.PI * 2); c.fill();
      shine(c, -r * 0.05, r * 0.18, r * 0.3, r * 0.08, 0);
    } else if (name === 'bell') {
      c.fillStyle = '#e0a020'; c.beginPath(); c.arc(0, r * 0.72, r * 0.2, 0, Math.PI * 2); c.fill();
      c.fillStyle = color;
      c.beginPath(); c.moveTo(-r * 0.85, r * 0.6);
      c.quadraticCurveTo(-r * 0.6, r * 0.45, -r * 0.6, 0);
      c.bezierCurveTo(-r * 0.6, -r * 0.95, r * 0.6, -r * 0.95, r * 0.6, 0);
      c.quadraticCurveTo(r * 0.6, r * 0.45, r * 0.85, r * 0.6); c.closePath(); c.fill();
      c.fillStyle = shade(color, -0.3); roundRect(c, -r * 0.88, r * 0.52, r * 1.76, r * 0.16, r * 0.08); c.fill();
      c.strokeStyle = color; c.lineWidth = r * 0.12; c.beginPath(); c.arc(0, -r * 0.78, r * 0.14, 0, Math.PI * 2); c.stroke();
      shine(c, -r * 0.3, -r * 0.2, r * 0.1, r * 0.3, 0.2);
    } else if (name === 'cup') {
      c.strokeStyle = color; c.lineWidth = r * 0.16; c.beginPath(); c.arc(r * 0.55, r * 0.15, r * 0.3, -Math.PI / 2, Math.PI / 2); c.stroke();
      c.fillStyle = color; roundRect(c, -r * 0.75, -r * 0.3, r * 1.3, r * 1.0, r * 0.22); c.fill();
      c.fillStyle = shade(color, 0.5); roundRect(c, -r * 0.75, -r * 0.3, r * 1.3, r * 0.18, r * 0.09); c.fill();
      c.strokeStyle = 'rgba(120,130,150,0.8)'; c.lineWidth = r * 0.09;
      for (let q = 0; q < 2; q++) { const x = -r * 0.35 + q * r * 0.45; c.beginPath(); c.moveTo(x, -r * 0.45); c.bezierCurveTo(x - r * 0.2, -r * 0.6, x + r * 0.2, -r * 0.75, x, -r * 0.95); c.stroke(); }
    } else if (name === 'heart') {
      c.fillStyle = color;
      c.beginPath(); c.moveTo(0, r * 0.85);
      c.bezierCurveTo(-r * 1.25, 0, -r * 0.75, -r * 0.98, 0, -r * 0.42);
      c.bezierCurveTo(r * 0.75, -r * 0.98, r * 1.25, 0, 0, r * 0.85);
      c.fill();
      shine(c, -r * 0.42, -r * 0.28, r * 0.14, r * 0.22, 0.6);
    } else if (name === 'flower') {
      c.fillStyle = color;
      for (let q = 0; q < 5; q++) { const a = q * Math.PI * 2 / 5 - Math.PI / 2; c.beginPath(); c.arc(Math.cos(a) * r * 0.52, Math.sin(a) * r * 0.52, r * 0.4, 0, Math.PI * 2); c.fill(); }
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, 0, r * 0.32, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#e09a00'; c.beginPath(); c.arc(0, 0, r * 0.14, 0, Math.PI * 2); c.fill();
    } else if (name === 'cherry') {
      c.strokeStyle = '#3f7d2c'; c.lineWidth = r * 0.1;
      c.beginPath(); c.moveTo(-r * 0.45, r * 0.25); c.quadraticCurveTo(-r * 0.2, -r * 0.5, r * 0.15, -r * 0.85); c.stroke();
      c.beginPath(); c.moveTo(r * 0.45, r * 0.4); c.quadraticCurveTo(r * 0.35, -r * 0.4, r * 0.15, -r * 0.85); c.stroke();
      leafShape(c, r * 0.15, -r * 0.85, r * 0.6, -0.2);
      [[-r * 0.45, r * 0.45], [r * 0.45, r * 0.6]].forEach(([x, y]) => {
        c.fillStyle = color; c.beginPath(); c.arc(x, y, r * 0.38, 0, Math.PI * 2); c.fill();
        shine(c, x - r * 0.13, y - r * 0.13, r * 0.1, r * 0.1);
      });
    } else if (name === 'moon') {
      const r1 = r * 0.92, r2 = r * 0.8, d = r * 0.5;
      const x = (d * d + r1 * r1 - r2 * r2) / (2 * d), y = Math.sqrt(Math.max(0, r1 * r1 - x * x));
      const a = Math.atan2(y, x), b = Math.atan2(y, x - d);
      c.save(); c.rotate(-0.5);
      c.beginPath(); c.arc(0, 0, r1, a, Math.PI * 2 - a, false); c.arc(d, 0, r2, -b, b, true); c.closePath();
      c.fillStyle = color; c.fill();
      c.restore();
      starPath(c, r * 0.45, -r * 0.35, r * 0.22, 0.45); c.fillStyle = '#f5b301'; c.fill();
    } else if (name === 'mushroom') {
      c.fillStyle = '#f3e3c3'; roundRect(c, -r * 0.3, -r * 0.05, r * 0.6, r * 0.95, r * 0.22); c.fill();
      c.fillStyle = color;
      c.beginPath(); c.moveTo(-r * 0.98, r * 0.12); c.bezierCurveTo(-r * 0.95, -r * 1.05, r * 0.95, -r * 1.05, r * 0.98, r * 0.12); c.closePath(); c.fill();
      c.fillStyle = '#fff';
      [[-0.45, -0.25, 0.15], [0.2, -0.5, 0.13], [0.55, -0.12, 0.12], [-0.08, -0.08, 0.1]].forEach(([x, y, s]) => { c.beginPath(); c.arc(x * r, y * r, s * r, 0, Math.PI * 2); c.fill(); });
    } else if (name === 'carrot') {
      leafShape(c, r * 0.35, -r * 0.45, r * 0.6, -1.9, '#3f9e2c'); leafShape(c, r * 0.35, -r * 0.45, r * 0.6, -1.2, '#2e8a23'); leafShape(c, r * 0.35, -r * 0.45, r * 0.55, -0.5, '#3f9e2c');
      c.fillStyle = color;
      c.beginPath(); c.moveTo(-r * 0.8, r * 0.85); c.lineTo(r * 0.05, -r * 0.6); c.quadraticCurveTo(r * 0.5, -r * 0.65, r * 0.55, -r * 0.2); c.closePath(); c.fill();
      c.strokeStyle = shade(color, -0.3); c.lineWidth = r * 0.07;
      [[-0.1, 0.05], [-0.3, 0.38], [0.08, -0.25]].forEach(([x, y]) => { c.beginPath(); c.moveTo(x * r, y * r); c.lineTo(x * r + r * 0.22, y * r + r * 0.1); c.stroke(); });
    } else if (name === 'drop') {
      c.fillStyle = color;
      c.beginPath(); c.moveTo(0, -r * 0.98);
      c.bezierCurveTo(r * 0.3, -r * 0.45, r * 0.75, -r * 0.05, r * 0.75, r * 0.3);
      c.arc(0, r * 0.3, r * 0.75, 0, Math.PI, false);
      c.bezierCurveTo(-r * 0.75, -r * 0.05, -r * 0.3, -r * 0.45, 0, -r * 0.98);
      c.fill();
      shine(c, -r * 0.3, r * 0.25, r * 0.12, r * 0.25, 0.3);
    } else if (name === 'grapes') {
      leafShape(c, 0, -r * 0.62, r * 0.6, -0.6);
      c.strokeStyle = '#6b3d1e'; c.lineWidth = r * 0.1; c.beginPath(); c.moveTo(0, -r * 0.55); c.lineTo(-r * 0.05, -r * 0.95); c.stroke();
      [[-0.5, -0.3], [0, -0.3], [0.5, -0.3], [-0.25, 0.12], [0.25, 0.12], [0, 0.54]].forEach(([x, y]) => {
        c.fillStyle = color; c.beginPath(); c.arc(x * r, y * r, r * 0.28, 0, Math.PI * 2); c.fill();
        shine(c, x * r - r * 0.08, y * r - r * 0.08, r * 0.07, r * 0.07);
      });
    }
  }

  // ---------- Heaps (half-tile units: a tile covers 2×2 cells) ----------
  const covers = (a, b) => b.z > a.z && Math.abs(b.x - a.x) < 2 && Math.abs(b.y - a.y) < 2; // b lies on a
  function heap(lv) {
    const N = 3 * clamp(6 + 2 * (lv - 1), 6, 42);
    const layers = Math.min(6, 2 + Math.floor((lv - 1) / 3));
    const R = lv < 3 ? 4 : 5;
    // The narrowest grid (odd width, so there is a middle column) that holds the tiles with room
    // to leave some gaps: a fuller, tidier heap.
    const room = (C) => {
      let n = 0;
      for (let z = 0; z < layers; z++) { const o = z % 2, sh = Math.floor(z / 2); n += Math.max(0, C - o - 2 * sh) * Math.max(0, R - o - 2 * sh); }
      return n;
    };
    let C = 5;
    while (C < 11 && room(C) * 0.8 < N) C += 2;
    let best = null;
    let p = 0.85;
    for (let tries = 0; tries < 300; tries++) {
      const P = [];
      for (let z = 0; z < layers; z++) {
        const o = z % 2, sh = Math.floor(z / 2);
        const cols = C - o - 2 * sh, rows = R - o - 2 * sh;
        if (cols < 1 || rows < 1) break;
        const half = Math.ceil(cols / 2);
        for (let r = 0; r < rows; r++) {
          // Mirror image left to right, so the heap looks tidy.
          const keep = [];
          for (let c = 0; c < half; c++) keep.push(z === 0 ? Math.random() < Math.min(1, p + 0.15) : Math.random() < p);
          for (let c = 0; c < cols; c++) {
            if (!keep[Math.min(c, cols - 1 - c)]) continue;
            const t = { x: o + 2 * sh + c * 2, y: o + 2 * sh + r * 2, z };
            if (z > 0 && !P.some((b) => covers(b, t))) continue; // nothing floats
            P.push(t);
          }
        }
      }
      if (!best || Math.abs(P.length - N) < Math.abs(best.length - N)) best = P;
      if (P.length >= N && P.length <= N + 4) break;
      p = clamp(p + (P.length < N ? 0.02 : -0.02), 0.25, 1);
    }
    // Trim to a multiple of three, taking from the top (the middle first, to keep it even).
    let P = best;
    const want = Math.max(3, P.length - (P.length % 3) - (P.length > N + 2 ? 3 * Math.floor((P.length - N) / 3) : 0));
    while (P.length > want) {
      const top = Math.max(...P.map((t) => t.z));
      const cands = P.filter((t) => t.z === top && !P.some((b) => covers(t, b)));
      const mid = (Math.min(...P.map((t) => t.x)) + Math.max(...P.map((t) => t.x))) / 2;
      cands.sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid));
      P.splice(P.indexOf(cands[0]), 1);
    }
    return P;
  }

  // ---------- State ----------
  let level = Kit.store.get('tiletrio.level', 1);
  let P = [], above = [], below = [], order = [], icons = [], alive = [], tray = [], history = [];
  let won = false, lost = false, endT = 0, rescueUsed = false, panelSel = 0;
  let boosts = { undo: 3, shuffle: 2, hint: 3 };
  let cursor = 0, hint = -1, hintT = 0, nopeT = 0, nopeTile = -1, introT = 0, picks = 0;
  let vis = [];      // tray tiles as drawn: { icon, id, x, y, s }
  let merging = [];  // three alike flying together: { icon, x, y, s, tx, ty, t }
  let flips = null;  // shuffle animation
  let gap = null;    // where a set of three is popping in the tray
  let uid = 1;
  const lit = [];    // eased brightness of each tile (covered tiles are dim)

  const isFree = (i, al) => al[i] && above[i].every((j) => !al[j]);
  function setHeap(pos) {
    P = pos;
    above = P.map((a) => P.map((b, j) => (covers(a, b) ? j : -1)).filter((j) => j >= 0));
    below = P.map((b) => P.map((a, j) => (covers(a, b) ? j : -1)).filter((j) => j >= 0));
    order = P.map((_, i) => i).sort((i, j) => P[i].z - P[j].z || P[i].y - P[j].y || P[i].x - P[j].x);
  }
  const kindsFor = (lv) => Math.min(ICONS.length, 3 + Math.floor((lv - 1) * 0.7));
  const capFor = (lv) => (lv <= 2 ? 2 : lv <= 6 ? 4 : 5);

  // Gives the tiles still on the heap pictures by playing the heap through: take any uncovered tile,
  // either finish a set of three already waiting in the tray or start a new one (while the tray has
  // room). Playing in that order clears everything, so the deal can always be won.
  // open: [{ icon, need }] sets already in the tray; fresh: icons for the new sets, one per set.
  function assign(al, open, fresh, cap) {
    const left = al.slice(), out = icons.slice();
    open = open.map((o) => ({ ...o }));
    fresh = fresh.slice().sort(() => Math.random() - 0.5);
    let occ = open.reduce((s, o) => s + (3 - o.need), 0);
    for (;;) {
      const free = [];
      for (let i = 0; i < P.length; i++) if (isFree(i, left)) free.push(i);
      if (!free.length) break;
      const i = free[Math.floor(Math.random() * free.length)];
      const canStart = fresh.length && occ + 1 <= cap;
      if (open.length && (!canStart || Math.random() < 0.55)) {
        const g = open[Math.floor(Math.random() * open.length)];
        out[i] = g.icon; g.need--; occ++;
        if (g.need === 0) { open.splice(open.indexOf(g), 1); occ -= 3; }
      } else {
        const ic = fresh.pop();
        out[i] = ic; open.push({ icon: ic, need: 2 }); occ++;
      }
      left[i] = 0;
    }
    return out;
  }
  function deal() {
    setHeap(heap(level));
    icons = P.map(() => 0);
    const sets = P.length / 3, K = kindsFor(level);
    const kinds = ICONS.map((_, k) => k).sort(() => Math.random() - 0.5).slice(0, K);
    const fresh = [];
    for (let s = 0; s < sets; s++) fresh.push(kinds[s % K]);
    icons = assign(P.map(() => 1), [], fresh, capFor(level));
  }
  function begin(again) {
    if (!again) deal();
    alive = P.map(() => 1); tray = []; history = []; vis = []; merging = [];
    won = false; lost = false; rescueUsed = false; picks = 0; hint = -1; flips = null;
    boosts = { undo: 3, shuffle: 2, hint: 3 };
    lit.length = 0;
    cursor = firstFree();
    save();
  }
  function save() {
    Kit.store.set('tiletrio.game', { level, P, icons, alive, tray: tray.map((t) => ({ icon: t.icon, tile: t.tile })), boosts, rescueUsed, picks });
  }
  function firstFree() {
    let best = 1000, d = Infinity;
    const cx = (Math.min(...P.map((t) => t.x)) + Math.max(...P.map((t) => t.x))) / 2;
    P.forEach((t, i) => { if (!isFree(i, alive)) return; const k = Math.abs(t.x - cx) + t.y * 0.8 - t.z * 2; if (k < d) { d = k; best = i; } });
    return best;
  }
  const saved = Kit.store.get('tiletrio.game', null);
  if (saved && saved.level === level && saved.P && saved.alive && saved.alive.some(Boolean)) {
    setHeap(saved.P); icons = saved.icons; alive = saved.alive;
    tray = (saved.tray || []).map((t) => ({ ...t, id: uid++ }));
    boosts = saved.boosts || boosts; rescueUsed = !!saved.rescueUsed; picks = saved.picks || 0;
    if (tray.length >= SLOTS) { tray = []; alive = P.map(() => 1); }
    cursor = firstFree();
  } else begin(false);

  // ---------- Layout ----------
  const BUTTONS = [
    { id: 'undo', label: '↶ Undo' },
    { id: 'shuffle', label: '🔀 Shuffle' },
    { id: 'hint', label: '💡 Hint' },
  ];
  let L = { buttons: [] };
  const sprites = new Map();
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W) return;
    const bh = Math.round(clamp(H * 0.075, 40, 78)), bw = Math.round(Math.min(W * 0.21, bh * 3.9)), gap = Math.round(bh * 0.4);
    const by = H - bh - H * 0.035;
    const total = BUTTONS.length * bw + (BUTTONS.length - 1) * gap;
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: (W - total) / 2 + i * (bw + gap), y: by, w: bw, h: bh }));
    // The tray: seven roomy slots on a wooden shelf.
    const ts = Math.min(H * 0.118, W * 0.09), tg = ts * 0.12, pad = ts * 0.13;
    L.ts = ts; L.tg = tg;
    L.tray = { w: SLOTS * ts + (SLOTS - 1) * tg + pad * 2, h: ts + pad * 2 };
    L.tray.x = (W - L.tray.w) / 2; L.tray.y = by - H * 0.022 - L.tray.h;
    L.slot = (k) => ({ x: L.tray.x + pad + k * (ts + tg), y: L.tray.y + pad });
    // The heap, as big as fits.
    const top = H * 0.115, bottom = L.tray.y - H * 0.025;
    const maxX = Math.max(...P.map((t) => t.x)) + 2, maxY = Math.max(...P.map((t) => t.y)) + 2;
    const minX = Math.min(...P.map((t) => t.x)), minY = Math.min(...P.map((t) => t.y));
    const S = Math.min((W * 0.9) / ((maxX - minX) / 2), (bottom - top) / ((maxY - minY) / 2 + 0.12), ts * 1.05);
    L.S = S;
    L.ox = (W - (maxX - minX) / 2 * S) / 2 - minX * S / 2;
    L.oy = top + (bottom - top - ((maxY - minY) / 2 + 0.12) * S) / 2 - minY * S / 2;
    sprites.clear();
  }
  Kit.onResize(layout);
  const tileXY = (i) => ({ x: L.ox + P[i].x * L.S / 2, y: L.oy + P[i].y * L.S / 2 - P[i].z * L.S * 0.04 });

  // A tile with its picture, drawn once per picture and size.
  function sprite(k, size) {
    const key = k + ':' + Math.round(size);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const d = size * 0.08; // thickness
    s = document.createElement('canvas');
    s.width = Math.ceil((size + 2) * dpr); s.height = Math.ceil((size + 2) * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    const m = size * 0.03, w = size - m * 2, h = size - m * 2 - d, r = size * 0.16;
    roundRect(c, m, m + d, w, h, r); c.fillStyle = '#b98a4e'; c.fill();
    roundRect(c, m, m, w, h, r);
    const g = c.createLinearGradient(0, m, 0, m + h);
    g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#f1e4c6');
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(1, size * 0.02); c.strokeStyle = 'rgba(120,80,30,0.35)'; c.stroke();
    // A soft coloured ring behind the picture helps tell them apart at a glance.
    c.fillStyle = Kit.rgba(ICONS[k].color, 0.13);
    c.beginPath(); c.arc(m + w / 2, m + h / 2, w * 0.41, 0, Math.PI * 2); c.fill();
    c.save(); c.translate(m + w / 2, m + h / 2); icon(c, k, w * 0.34); c.restore();
    sprites.set(key, s);
    return s;
  }
  function drawTile(c, k, x, y, size, alpha = 1) {
    const s = sprite(k, size);
    c.globalAlpha = alpha;
    c.drawImage(s, x, y, size + 2, size + 2);
    c.globalAlpha = 1;
  }

  // ---------- Moves ----------
  const now = () => performance.now() / 1000;
  function nope(i) { nopeT = now(); nopeTile = i; sfx.nope(); }
  function snapshot() { return { alive: alive.slice(), tray: tray.map((t) => ({ ...t })), icons: icons.slice() }; }
  function trayInsert(item) {
    // Same pictures sit together, like the real thing: a new tile goes after its twins.
    let at = tray.length;
    for (let k = tray.length - 1; k >= 0; k--) if (tray[k].icon === item.icon) { at = k + 1; break; }
    tray.splice(at, 0, item);
    return at;
  }
  function pick(i) {
    if (won || lost || flips) return;
    if (!alive[i]) return;
    if (!isFree(i, alive)) { nope(i); return; }
    history.push(snapshot());
    if (history.length > 40) history.shift();
    alive[i] = 0; picks++; hint = -1;
    const p = tileXY(i), item = { icon: icons[i], tile: i, id: uid++ };
    trayInsert(item);
    vis.push({ icon: item.icon, id: item.id, x: p.x, y: p.y, s: L.S, born: now() });
    sfx.pick(); Kit.tone(380 + tray.length * 60, { type: 'sine', dur: 0.08, vol: 0.1, at: 0.05 });
    const same = tray.filter((t) => t.icon === item.icon);
    if (same.length === 3) {
      // Three alike: they gather on the middle one's slot and pop; the tiles after them wait a moment
      // in their places, then slide along to close the gap.
      const at = tray.indexOf(same[0]);
      const ids = new Set(same.map((t) => t.id));
      tray = tray.filter((t) => !ids.has(t.id));
      const mid = L.slot(at + 1);
      vis.filter((v) => ids.has(v.id)).forEach((v) => merging.push({ ...v, t: 0, tx: mid.x, ty: mid.y }));
      vis = vis.filter((v) => !ids.has(v.id));
      gap = { at, until: now() + 0.5 };
    }
    if (!alive.some(Boolean) && tray.length === 0) {
      won = true; endT = now() + 0.9;
      level++; Kit.store.set('tiletrio.level', level); Kit.record('tiletrio', level - 1);
      Kit.store.set('tiletrio.game', null);
      setTimeout(() => { sfx.win(); Kit.confetti(150); }, 700);
    } else if (tray.length >= SLOTS) {
      lost = true; endT = now() + 0.7; panelSel = rescueUsed ? 1 : 0;
      setTimeout(() => sfx.over(), 450);
      save();
    } else save();
    fixCursor(p);
  }
  function fixCursor(near) {
    if (cursor >= 1000 || isFree(cursor, alive)) return;
    let best = 1000, d = Infinity;
    P.forEach((_, i) => {
      if (!isFree(i, alive)) return;
      const q = tileXY(i), k = Math.hypot(q.x - near.x, q.y - near.y);
      if (k < d) { d = k; best = i; }
    });
    cursor = best;
  }
  function restore(h) {
    alive = h.alive.slice(); icons = h.icons.slice();
    tray = h.tray.map((t) => ({ ...t }));
    // Tray tiles keep their place on screen; returning tiles go back to the heap.
    const keep = new Set(tray.map((t) => t.id));
    vis = vis.filter((v) => keep.has(v.id));
    tray.forEach((t) => { if (!vis.some((v) => v.id === t.id)) { const p = tileXY(t.tile); vis.push({ icon: t.icon, id: t.id, x: p.x, y: p.y, s: L.S }); } });
    merging = []; gap = null;
    hint = -1;
    fixCursor(cursor < 1000 ? tileXY(cursor) : { x: Kit.W / 2, y: Kit.H / 2 });
  }
  function press(id) {
    if (won || lost || flips) return;
    if (boosts[id] <= 0) { nope(-1); Kit.float(`No ${id === 'undo' ? 'undos' : id === 'shuffle' ? 'shuffles' : 'hints'} left this level`, Kit.W / 2, L.tray.y - 30, { color: '#ffd9a0', size: 28 }); return; }
    if (id === 'undo') {
      if (!history.length) { nope(-1); return; }
      restore(history.pop()); boosts.undo--; sfx.move();
      Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.12, slide: 0.7 });
    } else if (id === 'shuffle') {
      if (!alive.some(Boolean)) { nope(-1); return; }
      history.push(snapshot());
      reshuffle(); boosts.shuffle--;
    } else if (id === 'hint') {
      const i = bestMove();
      if (i < 0) { nope(-1); return; }
      hint = i; hintT = now(); cursor = i; boosts.hint--;
      Kit.tone(1318, { type: 'sine', dur: 0.25, vol: 0.12 }); Kit.tone(1760, { type: 'sine', dur: 0.3, vol: 0.08, at: 0.08 });
    }
    save();
  }
  // New pictures for the heap, the same ones in a new order, again dealt so it can be cleared.
  function reshuffle() {
    const trayCount = new Map(), heapCount = new Map();
    tray.forEach((t) => trayCount.set(t.icon, (trayCount.get(t.icon) || 0) + 1));
    P.forEach((_, i) => { if (alive[i]) heapCount.set(icons[i], (heapCount.get(icons[i]) || 0) + 1); });
    const open = [], fresh = [];
    trayCount.forEach((n, ic) => open.push({ icon: ic, need: 3 - n }));
    heapCount.forEach((n, ic) => {
      const forOpen = trayCount.has(ic) ? 3 - trayCount.get(ic) : 0;
      for (let s = 0; s < (n - forOpen) / 3; s++) fresh.push(ic);
    });
    flips = { from: icons.slice(), t: 0 };
    icons = assign(alive, open, fresh, SLOTS - 1);
    Kit.noise({ dur: 0.45, vol: 0.12, freq: 1800, q: 0.6, sweep: 2 });
    for (let k = 0; k < 6; k++) Kit.tone(500 + k * 90, { type: 'triangle', dur: 0.05, vol: 0.06, at: k * 0.06 });
  }
  // The hint looks ahead (depth first, with a small budget) for a pick that still clears the heap.
  function scoreMove(i, al, counts) {
    const ic = icons[i], inTray = counts.get(ic) || 0;
    let s = inTray === 2 ? 100 : inTray === 1 ? 40 : 0;
    let freeSame = 0;
    for (let j = 0; j < P.length; j++) if (j !== i && icons[j] === ic && isFree(j, al)) freeSame++;
    if (inTray + 1 + freeSame >= 3) s += 30;
    s += P[i].z * 2 + below[i].filter((j) => al[j]).length * 3;
    return s;
  }
  function bestMove() {
    let nodes = 0;
    const seen = new Set();
    function go(al, counts, size, left) {
      if (left === 0) return -2;
      if (++nodes > 3000) return -1;
      const key = al.join('') + '|' + [...counts.entries()].filter((e) => e[1]).sort().join(';');
      if (seen.has(key)) return -1;
      seen.add(key);
      const moves = [];
      for (let i = 0; i < P.length; i++) if (isFree(i, al)) moves.push([i, scoreMove(i, al, counts)]);
      moves.sort((a, b) => b[1] - a[1]);
      for (const [i] of moves) {
        const ic = icons[i], n = (counts.get(ic) || 0) + 1;
        const nsize = n === 3 ? size - 2 : size + 1;
        if (nsize >= SLOTS) continue;
        al[i] = 0; counts.set(ic, n === 3 ? 0 : n);
        const r = go(al, counts, nsize, left - 1);
        al[i] = 1; counts.set(ic, n - 1);
        if (r !== -1) return i;
        if (nodes > 3000) return -1;
      }
      return -1;
    }
    const counts = new Map();
    tray.forEach((t) => counts.set(t.icon, (counts.get(t.icon) || 0) + 1));
    const al = alive.slice();
    const found = go(al, counts, tray.length, al.reduce((s, v) => s + v, 0));
    if (found >= 0) return found;
    // No sure way found in time: the most promising pick right now.
    let best = -1, bs = -Infinity;
    for (let i = 0; i < P.length; i++) if (isFree(i, alive)) { const s = scoreMove(i, alive, counts); if (s > bs) { bs = s; best = i; } }
    return best;
  }
  function rescue() {
    // One rescue a level: the last three picks go back to the heap.
    rescueUsed = true; lost = false;
    let h = null;
    for (let k = 0; k < 3 && history.length; k++) h = history.pop();
    if (h) restore(h);
    sfx.chime(); save();
  }
  function retry() { begin(true); sfx.pick(); }
  function next() { begin(false); layout(); sfx.pick(); }

  // ---------- Remote ----------
  function items() {
    const out = [];
    P.forEach((_, i) => { if (isFree(i, alive)) { const p = tileXY(i); out.push({ i, x: p.x + L.S / 2, y: p.y + L.S / 2 }); } });
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
      if ((dir === 'left' || dir === 'right') && (it.i >= 1000) !== (cur.i >= 1000)) continue;
      // Down to the buttons only from the bottom of the heap; up from a button lands near it.
      if (dir === 'down' && it.i >= 1000 && cur.i < 1000) side *= 0.2;
      const s = main + side * 2.2;
      if (s < score) { score = s; best = it; }
    }
    if (best) { cursor = best.i; sfx.move(); }
  }
  const panelButtons = () => {
    const W = Kit.W, H = Kit.H, bw = Math.min(W * 0.3, 300), bh = Math.round(clamp(H * 0.08, 44, 84));
    return [{ id: 'rescue', x: W / 2 - bw - 12, y: H / 2 + H * 0.08, w: bw, h: bh }, { id: 'retry', x: W / 2 + 12, y: H / 2 + H * 0.08, w: bw, h: bh }];
  };
  function panelPress(k) {
    if (k === 0 && !rescueUsed) rescue(); else if (k === 1) retry(); else nope(-1);
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && now() > endT + 0.4) next(); return; }
    if (lost) {
      if (now() < endT + 0.3) return;
      if (k === 'left' && !rescueUsed) { panelSel = 0; sfx.move(); } else if (k === 'right') { panelSel = 1; sfx.move(); } else if (k === 'ok') panelPress(panelSel);
      return;
    }
    if (k === 'undo') { press('undo'); return; }
    if (k === 'restart') { retry(); return; }
    if (k === 'ok') { if (cursor >= 1000) press(BUTTONS[cursor - 1000].id); else pick(cursor); return; }
    moveCursor(k);
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const inBox = (e, b) => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (won) { if (now() > endT + 0.4) next(); return; }
      if (lost) { if (now() < endT + 0.3) return; const pb = panelButtons(); const k = pb.findIndex((b) => inBox(e, b)); if (k >= 0) { panelSel = k; panelPress(k); } return; }
      const bi = L.buttons.findIndex((b) => inBox(e, b));
      if (bi >= 0) { cursor = 1000 + bi; press(L.buttons[bi].id); return; }
      for (let q = order.length - 1; q >= 0; q--) {
        const i = order[q];
        if (!alive[i]) continue;
        const p = tileXY(i);
        if (e.x >= p.x && e.x <= p.x + L.S && e.y >= p.y && e.y <= p.y + L.S) { if (isFree(i, alive)) cursor = i; pick(i); return; }
      }
    },
  });

  // ---------- Update and draw ----------
  function update(dt) {
    introT += dt;
    const k = Math.min(1, dt * 14);
    // Tray tiles glide to their slots.
    if (gap && now() > gap.until) gap = null;
    tray.forEach((t, idx) => {
      const v = vis.find((q) => q.id === t.id);
      if (!v) { const s0 = L.slot(idx); vis.push({ icon: t.icon, id: t.id, x: s0.x, y: s0.y, s: L.ts }); return; } // restored from a saved game
      const s = L.slot(Math.min(SLOTS - 1, idx + (gap && idx >= gap.at ? 3 : 0)));
      v.x = lerp(v.x, s.x, k); v.y = lerp(v.y, s.y, k); v.s = lerp(v.s, L.ts, k);
    });
    for (const m of merging) {
      m.t += dt;
      m.x = lerp(m.x, m.tx, k); m.y = lerp(m.y, m.ty, k); m.s = lerp(m.s, L.ts, k);
    }
    if (merging.length && merging[0].t > 0.5) {
      const lead = merging[0];
      const cx = lead.tx + L.ts / 2, cy = lead.ty + L.ts / 2;
      Kit.burst(cx, cy, ICONS[lead.icon].color, 18, 1);
      Kit.burst(cx, cy, '#ffd23f', 8, 0.8);
      Kit.float('✔', cx, lead.ty - L.ts * 0.25, { color: '#9ff0a0', size: L.ts * 0.6 });
      sfx.clear(1, 1);
      merging.splice(0, 3);
    }
    if (flips) { flips.t += dt / 0.4; if (flips.t >= 1) flips = null; }
    for (let i = 0; i < P.length; i++) lit[i] = lerp(lit[i] == null ? (isFree(i, alive) ? 1 : 0) : lit[i], isFree(i, alive) ? 1 : 0, Math.min(1, dt * 8));
  }
  function drawButton(c, b, label, on, off, badge) {
    roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
    const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
    g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.17)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
    c.fillStyle = g; c.fill();
    c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
    c.font = `800 ${Math.round(Math.min(b.h * 0.42, b.w * 0.14))}px system-ui, sans-serif`;
    c.fillStyle = on ? '#2b1600' : off ? 'rgba(255,255,255,0.4)' : '#fff';
    c.fillText(label, b.x + b.w / 2 - (badge != null ? b.h * 0.25 : 0), b.y + b.h / 2 + 1);
    if (badge != null) {
      const r = b.h * 0.3, x = b.x + b.w - b.h * 0.5, y = b.y + b.h / 2;
      c.fillStyle = badge > 0 ? '#ff5c7a' : 'rgba(255,255,255,0.25)';
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(r * 1.25)}px system-ui, sans-serif`;
      c.fillText(String(badge), x, y + 1);
    }
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, nw = now(), S = L.S;
    Kit.background(c, t, '#5a2e1a', '#1a0c06', 'rgba(255,180,90,0.08)');
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Header: level, a one-line how-to, tiles left.
    const hy = H * 0.06, hs = Math.round(clamp(H * 0.055, 26, 56));
    c.lineJoin = 'round';
    const shownLevel = won ? level - 1 : level;
    c.font = `900 ${hs}px system-ui, sans-serif`; c.textAlign = 'left';
    c.lineWidth = 6; c.strokeStyle = 'rgba(30,10,0,0.8)'; c.strokeText(`Level ${shownLevel}`, W * 0.04, hy);
    const lg = c.createLinearGradient(0, hy - hs / 2, 0, hy + hs / 2);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#ffd08a');
    c.fillStyle = lg; c.fillText(`Level ${shownLevel}`, W * 0.04, hy);
    c.textAlign = 'right'; c.font = `800 ${Math.round(hs * 0.62)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText(`${alive.reduce((s, a) => s + a, 0)} tiles`, W - 76, hy);
    c.textAlign = 'center';
    c.font = `700 ${Math.round(clamp(H * 0.032, 18, 34))}px system-ui, sans-serif`;
    const early = introT < 8 && level <= 2 && picks < 3;
    c.fillStyle = early ? '#fff59d' : 'rgba(255,255,255,0.62)';
    c.fillText(early ? 'Three alike in the tray clear away!' : Kit.touchFirst() ? 'Tap a bright tile · three alike clear' : 'Arrows move · OK picks · Back exits', W / 2, hy);

    // The heap: covered tiles are darker; the focused one glows.
    const flipK = flips ? Math.abs(Math.cos(flips.t * Math.PI)) : 1;
    const hintOn = hint >= 0 && nw - hintT < 5;
    for (const i of order) {
      if (!alive[i]) continue;
      let { x, y } = tileXY(i);
      if (i === nopeTile && nw - nopeT < 0.3) x += Math.sin((nw - nopeT) * 60) * S * 0.05;
      // A soft shadow onto whatever is below.
      if (P[i].z > 0) { c.fillStyle = 'rgba(30,12,0,0.28)'; roundRect(c, x + S * 0.05, y + S * 0.08, S * 0.96, S * 0.96, S * 0.16); c.fill(); }
      const ic = flips && flips.t < 0.5 ? flips.from[i] : icons[i];
      if (flips) { const sp = sprite(ic, S); c.drawImage(sp, x + S / 2 - (S / 2) * flipK, y, (S + 2) * flipK, S + 2); }
      else drawTile(c, ic, x, y, S);
      const dim = 1 - (lit[i] == null ? 1 : lit[i]);
      if (dim > 0.01) { roundRect(c, x + S * 0.03, y + S * 0.03, S * 0.94, S * 0.94, S * 0.16); c.fillStyle = `rgba(25,10,0,${0.5 * dim})`; c.fill(); }
      if (hintOn && hint === i) {
        roundRect(c, x - 3, y - 3, S + 6, S + 6, S * 0.2);
        c.lineWidth = Math.max(4, S * 0.07); c.strokeStyle = `rgba(110,220,255,${0.55 + 0.45 * Math.sin(t * 8)})`; c.stroke();
      }
      if (cursor === i && !won && !lost && !Kit.touchFirst()) {
        const pulse = 0.5 + 0.5 * Math.sin(t * 6);
        roundRect(c, x - 4, y - 4, S + 8 - S * 0.06, S + 8 - S * 0.06, S * 0.2);
        c.lineWidth = Math.max(6, S * 0.1); c.strokeStyle = `rgba(255,214,10,${0.3 + pulse * 0.25})`; c.stroke();
        c.lineWidth = Math.max(3, S * 0.05); c.strokeStyle = '#ffe14d'; c.stroke();
      }
    }

    // Tray shelf
    const T = L.tray;
    roundRect(c, T.x, T.y, T.w, T.h, T.h * 0.22);
    const tg = c.createLinearGradient(0, T.y, 0, T.y + T.h);
    tg.addColorStop(0, '#8a5530'); tg.addColorStop(1, '#5a3218');
    c.fillStyle = tg; c.fill();
    c.lineWidth = 3; c.strokeStyle = tray.length >= SLOTS - 1 && !won ? `rgba(255,90,90,${0.6 + 0.4 * Math.sin(t * 8)})` : 'rgba(255,220,170,0.45)'; c.stroke();
    for (let k = 0; k < SLOTS; k++) {
      const s = L.slot(k);
      roundRect(c, s.x, s.y, L.ts, L.ts, L.ts * 0.16);
      c.fillStyle = 'rgba(30,12,2,0.45)'; c.fill();
    }
    // Tiles in the tray (and those still flying there), then the sets of three merging.
    for (const v of vis) drawTile(c, v.icon, v.x, v.y, v.s);
    for (const m of merging) {
      const k2 = clamp((m.t - 0.3) / 0.2, 0, 1);
      const sc = 1 + Math.sin(k2 * Math.PI / 2) * 0.22;
      drawTile(c, m.icon, m.x - (m.s * (sc - 1)) / 2, m.y - (m.s * (sc - 1)) / 2, m.s * sc);
      if (k2 > 0) { roundRect(c, m.x, m.y, m.s, m.s * 0.92, m.s * 0.16); c.fillStyle = `rgba(255,255,255,${k2 * 0.6})`; c.fill(); }
    }

    // Buttons with how many are left
    L.buttons.forEach((b, k) => {
      const on = cursor === 1000 + k && !won && !lost && !Kit.touchFirst();
      const off = boosts[b.id] <= 0 || (b.id === 'undo' && !history.length);
      drawButton(c, b, b.label, on, off, boosts[b.id]);
    });

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if ((won || lost) && nw > endT) {
      const a = clamp((nw - endT) / 0.4, 0, 1);
      c.fillStyle = `rgba(20,8,2,${0.62 * a})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); const sc = ease.back(a); c.scale(sc, sc);
      const pw = Math.min(W * 0.84, H * 1.05), ph = Math.min(H * 0.56, 440);
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 30);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      if (won) { g.addColorStop(0, '#e08a2e'); g.addColorStop(1, '#8a4210'); } else { g.addColorStop(0, '#7a4a8a'); g.addColorStop(1, '#3a1a4a'); }
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(ph * 0.14)}px system-ui, sans-serif`;
      c.fillText(won ? 'Heap cleared!' : 'The tray is full', 0, -ph * 0.3);
      if (won) {
        const ts = ph * 0.2;
        [2, 7, 6].forEach((ic, q) => drawTile(c, ic, (q - 1) * ts * 1.2 - ts / 2, -ph * 0.06 - ts / 2 + Math.sin(t * 3 + q) * 4, ts));
        c.font = `700 ${Math.round(ph * 0.08)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.92)';
        c.fillText(`Level ${level - 1} done`, 0, ph * 0.15);
        c.fillStyle = '#fff59d';
        c.fillText(Kit.touchFirst() ? 'Tap for the next level' : 'Press OK for the next level', 0, ph * 0.32);
      } else {
        c.font = `700 ${Math.round(ph * 0.075)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillText(rescueUsed ? 'No rescue left. Try the level again!' : 'Put the last 3 tiles back, or start again?', 0, -ph * 0.1);
        c.restore();
        // The two choices sit in screen space so taps and the remote line up.
        c.save(); c.globalAlpha = a;
        panelButtons().forEach((b, k) => {
          const label = k === 0 ? '↶ Rescue' : '⟳ Try again';
          drawButton(c, b, label, panelSel === k && !Kit.touchFirst(), k === 0 && rescueUsed);
        });
        c.restore();
        c.save();
      }
      c.restore();
    }
  }

  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('tiletrio', level - 1);
})();
