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
  let banner = 0, sparks = [], flashes = [], gleam = { i: -1, t: 0, wait: 2 }, starsShown = 0, combo = 0, lastClearT = -9, fontOK = false, fontWait = 0;
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
    won = false; lost = false; rescueUsed = false; picks = 0; hint = -1; flips = null; banner = 0;
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
    { id: 'undo', label: 'Undo' },
    { id: 'shuffle', label: 'Shuffle' },
    { id: 'hint', label: 'Hint' },
  ];
  let L = { buttons: [] };
  const sprites = new Map();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const canvas = (w, h) => { const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.ceil(w)); cv.height = Math.max(1, Math.ceil(h)); return cv; };
  let scene = null, fx = {};
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W) return;
    const bh = Math.round(clamp(H * 0.075, 40, 78)), bw = Math.round(Math.min(W * 0.2, bh * 3.7)), gap = Math.round(bh * 0.45);
    const by = H - bh - H * 0.035;
    const total = BUTTONS.length * bw + (BUTTONS.length - 1) * gap;
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: (W - total) / 2 + i * (bw + gap), y: by, w: bw, h: bh }));
    // Header pills.
    const hh = Math.round(clamp(H * 0.072, 34, 78)), hy = Math.round(H * 0.02);
    L.lvl = { x: Math.round(W * 0.025), y: hy, w: Math.round(hh * 3.3), h: hh };
    L.left = { x: Math.round(W - 74 - hh * 3.2), y: hy, w: Math.round(hh * 3.2), h: hh };
    L.bar = { x: W / 2 - W * 0.12, y: hy + hh * 0.66, w: W * 0.24, h: Math.max(8, hh * 0.2) };
    // The tray: seven roomy slots in a wooden tray with a glass top.
    const ts = Math.min(H * 0.112, W * 0.085), tg = ts * 0.13, pad = ts * 0.2;
    L.ts = ts; L.tg = tg;
    L.tray = { w: SLOTS * ts + (SLOTS - 1) * tg + pad * 2, h: ts + pad * 2 };
    L.tray.x = (W - L.tray.w) / 2; L.tray.y = by - H * 0.026 - L.tray.h;
    L.slot = (k) => ({ x: L.tray.x + pad + k * (ts + tg), y: L.tray.y + pad });
    // The heap, as big as fits, on a quilted cloth.
    const top = H * 0.135, bottom = L.tray.y - H * 0.04;
    const maxX = Math.max(...P.map((t) => t.x)) + 2, maxY = Math.max(...P.map((t) => t.y)) + 2;
    const minX = Math.min(...P.map((t) => t.x)), minY = Math.min(...P.map((t) => t.y));
    const S = Math.min((W * 0.82) / ((maxX - minX) / 2), (bottom - top) / ((maxY - minY) / 2 + 0.2), ts * 1.05);
    L.S = S;
    L.ox = (W - (maxX - minX) / 2 * S) / 2 - minX * S / 2;
    L.oy = top + (bottom - top - ((maxY - minY) / 2 + 0.2) * S) / 2 - minY * S / 2;
    const zTop = Math.max(...P.map((t) => t.z));
    const cpad = S * 0.32;
    L.cloth = { x: L.ox + minX * S / 2 - cpad, y: L.oy + minY * S / 2 - zTop * S * 0.04 - cpad, w: (maxX - minX) / 2 * S + cpad * 2, h: ((maxY - minY) / 2 + 0.15) * S + zTop * S * 0.04 + cpad * 2 };
    sprites.clear();
    bakeScene(); bakeFx();
  }
  Kit.onResize(layout);
  const tileXY = (i) => ({ x: L.ox + P[i].x * L.S / 2, y: L.oy + P[i].y * L.S / 2 - P[i].z * L.S * 0.04 });

  // ---------- The cosy table, painted once per screen size ----------
  function rng(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function plant(c, x, y, s, rnd) {
    // A clay pot with a round leafy plant.
    for (let k = 0; k < 14; k++) {
      const a = -Math.PI / 2 + (rnd() - 0.5) * 2.4, len = s * (0.55 + rnd() * 0.5);
      c.save(); c.translate(x, y - s * 0.3); c.rotate(a);
      const g = c.createLinearGradient(0, 0, len, 0); g.addColorStop(0, '#2f7d32'); g.addColorStop(1, k % 2 ? '#6cc04a' : '#4ea83a');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.28, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.28, 0, 0); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(len * 0.1, 0); c.lineTo(len * 0.9, 0); c.stroke();
      c.restore();
    }
    const g = c.createLinearGradient(x - s * 0.4, 0, x + s * 0.4, 0);
    g.addColorStop(0, '#9a4a26'); g.addColorStop(0.35, '#d97a46'); g.addColorStop(1, '#7a3416');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x - s * 0.36, y - s * 0.3); c.lineTo(x + s * 0.36, y - s * 0.3); c.lineTo(x + s * 0.27, y + s * 0.32); c.lineTo(x - s * 0.27, y + s * 0.32); c.closePath(); c.fill();
    c.fillStyle = '#e08a52'; roundRect(c, x - s * 0.42, y - s * 0.38, s * 0.84, s * 0.14, s * 0.04); c.fill();
  }
  function cup(c, x, y, s) {
    c.fillStyle = 'rgba(40,15,0,0.35)'; c.beginPath(); c.ellipse(x + s * 0.08, y + s * 0.42, s * 0.7, s * 0.16, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f4ead8'; c.beginPath(); c.ellipse(x, y + s * 0.36, s * 0.62, s * 0.14, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#e9dcc4'; c.lineWidth = s * 0.09; c.beginPath(); c.arc(x + s * 0.42, y, s * 0.18, -1.3, 1.3); c.stroke();
    const g = c.createLinearGradient(x - s * 0.4, 0, x + s * 0.4, 0);
    g.addColorStop(0, '#cfd9e8'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(1, '#b7c3d6');
    c.fillStyle = g; c.beginPath(); c.moveTo(x - s * 0.4, y - s * 0.3); c.lineTo(x + s * 0.4, y - s * 0.3); c.quadraticCurveTo(x + s * 0.38, y + s * 0.34, x, y + s * 0.34); c.quadraticCurveTo(x - s * 0.38, y + s * 0.34, x - s * 0.4, y - s * 0.3); c.fill();
    c.fillStyle = '#6b3a1c'; c.beginPath(); c.ellipse(x, y - s * 0.3, s * 0.4, s * 0.09, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#12a3a0'; c.fillRect(x - s * 0.36, y - s * 0.08, s * 0.72, s * 0.07);
  }
  function bakeScene() {
    const W = Kit.W, H = Kit.H, d = DPR();
    scene = canvas(W * d, H * d);
    const c = scene.getContext('2d');
    c.scale(d, d);
    const rnd = rng(11);
    // Warm wooden planks with grain and seams.
    const planks = 7, ph = H / planks;
    for (let k = 0; k < planks; k++) {
      const y = k * ph, base = ['#8a5631', '#7d4c2b', '#93603a', '#82522f'][k % 4];
      const g = c.createLinearGradient(0, y, 0, y + ph); g.addColorStop(0, shade(base, 0.08)); g.addColorStop(1, shade(base, -0.12));
      c.fillStyle = g; c.fillRect(0, y, W, ph);
      c.lineWidth = 1;
      for (let q = 0; q < 14; q++) {
        const gy = y + rnd() * ph; c.strokeStyle = rnd() < 0.5 ? 'rgba(50,25,8,0.18)' : 'rgba(255,220,170,0.08)';
        c.beginPath(); c.moveTo(0, gy);
        for (let x = 0; x <= W; x += 40) c.lineTo(x, gy + Math.sin(x * 0.01 + q) * 2.5 + Math.sin(x * 0.043 + k) * 1.2);
        c.stroke();
      }
      for (let q = 0; q < 2; q++) { const kx = rnd() * W, ky = y + ph * (0.3 + rnd() * 0.4); c.strokeStyle = 'rgba(50,25,8,0.22)'; for (let r = 2; r < 12; r += 3) { c.beginPath(); c.ellipse(kx, ky, r * 2.2, r * 0.7, 0, 0, Math.PI * 2); c.stroke(); } }
      c.fillStyle = 'rgba(30,12,2,0.55)'; c.fillRect(0, y + ph - 2, W, 2);
      c.fillStyle = 'rgba(255,220,170,0.12)'; c.fillRect(0, y + ph, W, 1);
    }
    // Sunlight from a window up-left, pooling on the table.
    let g = c.createRadialGradient(W * 0.45, H * 0.4, 0, W * 0.45, H * 0.45, Math.max(W, H) * 0.65);
    g.addColorStop(0, 'rgba(255,214,150,0.35)'); g.addColorStop(1, 'rgba(255,214,150,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const x0 = W * (0.05 + k * 0.12);
      g = c.createLinearGradient(x0, 0, x0 + W * 0.3, H); g.addColorStop(0, 'rgba(255,230,180,0.10)'); g.addColorStop(1, 'rgba(255,230,180,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + W * 0.05, 0); c.lineTo(x0 + W * 0.42, H); c.lineTo(x0 + W * 0.3, H); c.closePath(); c.fill();
    }
    c.restore();
    // Corners: a potted plant, a teacup, and leafy sprigs at the top.
    plant(c, W * 0.07, H * 0.86, H * 0.28, rnd);
    cup(c, W * 0.93, H * 0.84, H * 0.12);
    [[0, -1], [W, 1]].forEach(([x, s]) => {
      for (let k = 0; k < 9; k++) {
        const len = H * (0.09 + rnd() * 0.07), a = s > 0 ? Math.PI * (0.55 + rnd() * 0.4) : Math.PI * (0.05 + rnd() * 0.4);
        c.save(); c.translate(x - s * rnd() * W * 0.06, rnd() * H * 0.18); c.rotate(a);
        c.fillStyle = k % 2 ? '#3f8f3a' : '#2e7a30';
        c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.5, -len * 0.3, len, 0); c.quadraticCurveTo(len * 0.5, len * 0.3, 0, 0); c.fill();
        c.restore();
      }
    });
    // Fairy-light string across the top (the bulbs twinkle live).
    c.strokeStyle = 'rgba(40,20,5,0.7)'; c.lineWidth = 2;
    c.beginPath(); for (let x = 0; x <= W; x += 10) c.lineTo(x, H * 0.012 + Math.sin(x / W * Math.PI * 3) * H * 0.012 + H * 0.01); c.stroke();
    // The quilted cloth under the heap.
    const m = L.cloth, rr = L.S * 0.3;
    c.save(); c.shadowColor = 'rgba(30,10,0,0.55)'; c.shadowBlur = 34; c.shadowOffsetY = 12;
    roundRect(c, m.x, m.y, m.w, m.h, rr); c.fillStyle = '#3d6e5a'; c.fill(); c.restore();
    c.save(); roundRect(c, m.x, m.y, m.w, m.h, rr); c.clip();
    g = c.createRadialGradient(m.x + m.w / 2, m.y + m.h * 0.3, 0, m.x + m.w / 2, m.y + m.h / 2, Math.max(m.w, m.h) * 0.75);
    g.addColorStop(0, '#5d9a7c'); g.addColorStop(1, '#2c5745');
    c.fillStyle = g; c.fillRect(m.x, m.y, m.w, m.h);
    c.strokeStyle = 'rgba(255,255,255,0.05)'; c.lineWidth = 1;
    for (let x = m.x; x < m.x + m.w; x += 4) { c.beginPath(); c.moveTo(x, m.y); c.lineTo(x, m.y + m.h); c.stroke(); }
    const q = L.S * 0.9;
    c.strokeStyle = 'rgba(20,50,35,0.35)'; c.lineWidth = 2;
    for (let k = -m.h; k < m.w; k += q) { c.beginPath(); c.moveTo(m.x + k, m.y); c.lineTo(m.x + k + m.h, m.y + m.h); c.stroke(); c.beginPath(); c.moveTo(m.x + k + m.h, m.y); c.lineTo(m.x + k, m.y + m.h); c.stroke(); }
    c.restore();
    c.setLineDash([8, 7]); c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,240,200,0.6)';
    roundRect(c, m.x + 9, m.y + 9, m.w - 18, m.h - 18, rr * 0.75); c.stroke(); c.setLineDash([]);
    c.lineWidth = 3; c.strokeStyle = 'rgba(20,45,32,0.8)'; roundRect(c, m.x, m.y, m.w, m.h, rr); c.stroke();
    // The tray: thick wood frame, brass corners, recessed slots.
    const T = L.tray, tr = T.h * 0.24;
    c.save(); c.shadowColor = 'rgba(30,10,0,0.6)'; c.shadowBlur = 30; c.shadowOffsetY = 12;
    roundRect(c, T.x, T.y, T.w, T.h, tr);
    g = c.createLinearGradient(0, T.y, 0, T.y + T.h); g.addColorStop(0, '#c58a52'); g.addColorStop(0.5, '#8f5728'); g.addColorStop(1, '#5e3414');
    c.fillStyle = g; c.fill(); c.restore();
    c.save(); roundRect(c, T.x, T.y, T.w, T.h, tr); c.clip();
    for (let k = 0; k < 18; k++) { const gy = T.y + rnd() * T.h; c.strokeStyle = 'rgba(60,25,5,0.25)'; c.lineWidth = 1; c.beginPath(); c.moveTo(T.x, gy); for (let x = T.x; x <= T.x + T.w; x += 30) c.lineTo(x, gy + Math.sin(x * 0.02 + k) * 2); c.stroke(); }
    c.restore();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,225,170,0.55)'; roundRect(c, T.x + 1.5, T.y + 1.5, T.w - 3, T.h - 3, tr); c.stroke();
    [[T.x, T.y], [T.x + T.w, T.y], [T.x, T.y + T.h], [T.x + T.w, T.y + T.h]].forEach(([x, y]) => {
      const bg = c.createRadialGradient(x - 3, y - 3, 1, x, y, T.h * 0.16); bg.addColorStop(0, '#fff2b0'); bg.addColorStop(0.5, '#d9a43a'); bg.addColorStop(1, '#8a5a12');
      c.fillStyle = bg; c.beginPath(); c.arc(x + (x === T.x ? T.h * 0.12 : -T.h * 0.12), y + (y === T.y ? T.h * 0.12 : -T.h * 0.12), T.h * 0.09, 0, Math.PI * 2); c.fill();
    });
    for (let k = 0; k < SLOTS; k++) {
      const s = L.slot(k), ts = L.ts, sr = ts * 0.18;
      roundRect(c, s.x - 2, s.y - 2, ts + 4, ts + 4, sr); c.fillStyle = 'rgba(40,16,2,0.75)'; c.fill();
      c.save(); roundRect(c, s.x - 2, s.y - 2, ts + 4, ts + 4, sr); c.clip();
      c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 12; c.shadowOffsetY = 4;
      c.lineWidth = 10; c.strokeStyle = 'rgba(0,0,0,0.8)'; roundRect(c, s.x - 7, s.y - 7, ts + 14, ts + 14, sr); c.stroke();
      c.restore();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,220,170,0.25)'; roundRect(c, s.x - 2, s.y - 2, ts + 4, ts + 4, sr); c.stroke();
    }
    // Glass pills for the header and buttons; text is drawn live on top.
    const glassy = (b, tint) => Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint });
    glassy(L.lvl, 'rgba(120,60,20,0.35)'); glassy(L.left, 'rgba(120,60,20,0.35)');
    L.buttons.forEach((b) => glassy(b, 'rgba(120,60,20,0.32)'));
    roundRect(c, L.bar.x, L.bar.y, L.bar.w, L.bar.h, L.bar.h / 2); c.fillStyle = 'rgba(30,10,0,0.55)'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.25)'; c.stroke();
    // Vignette.
    g = c.createRadialGradient(W / 2, H * 0.45, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(20,6,0,0.6)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
  }
  function bakeFx() {
    const dot = canvas(64, 64), dc = dot.getContext('2d');
    let g = dc.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,225,1)'); g.addColorStop(0.25, 'rgba(255,215,140,0.55)'); g.addColorStop(1, 'rgba(255,200,120,0)');
    dc.fillStyle = g; dc.fillRect(0, 0, 64, 64);
    const starS = canvas(64, 64), sc = starS.getContext('2d');
    sc.shadowColor = '#fff3b0'; sc.shadowBlur = 10; sc.fillStyle = '#fffbe6';
    sc.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, r = k % 2 ? 7 : 26; sc.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    sc.closePath(); sc.fill();
    const rays = canvas(512, 512), rc = rays.getContext('2d');
    rc.translate(256, 256);
    for (let k = 0; k < 14; k++) {
      rc.rotate(Math.PI * 2 / 14);
      g = rc.createLinearGradient(0, 0, 256, 0); g.addColorStop(0, 'rgba(255,230,160,0.55)'); g.addColorStop(1, 'rgba(255,230,160,0)');
      rc.fillStyle = g; rc.beginPath(); rc.moveTo(0, 0); rc.lineTo(256, -36); rc.lineTo(256, 36); rc.closePath(); rc.fill();
    }
    // A focus glow round a board tile.
    const S = L.S, G = S * 0.32, d = DPR();
    const ring = canvas((S + G * 2) * d, (S + G * 2) * d), gc = ring.getContext('2d');
    gc.scale(d, d); gc.shadowColor = '#ffd23f'; gc.shadowBlur = G * 0.8; gc.lineWidth = Math.max(4, S * 0.07); gc.strokeStyle = '#ffd23f';
    for (let k = 0; k < 2; k++) { roundRect(gc, G, G, S * 0.94, S * 0.86, S * 0.18); gc.stroke(); }
    ring.G = G;
    const bulbs = [];
    for (let x = W0(); x < Kit.W; x += Kit.W / 14) bulbs.push({ x, y: Kit.H * 0.012 + Math.sin(x / Kit.W * Math.PI * 3) * Kit.H * 0.012 + Kit.H * 0.01, p: Math.random() * 6, hue: ['#ffd27a', '#ff9a7a', '#a8e6ff', '#c8ff9a'][bulbs.length % 4] });
    fx = { dot, star: starS, rays, ring, bulbs };
  }
  const W0 = () => Kit.W / 28;

  // ---------- Tiles: chunky, with a caramel side, glossy top and a shaded, outlined picture ----------
  function shadedArt(draw, w, h, outline) {
    const d = DPR(), cw = Math.ceil(w * d), ch = Math.ceil(h * d);
    const a = canvas(cw, ch), ac = a.getContext('2d');
    ac.scale(d, d); draw(ac);
    ac.setTransform(1, 0, 0, 1, 0, 0);
    ac.globalCompositeOperation = 'source-atop';
    const g = ac.createLinearGradient(0, 0, cw, ch);
    g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.45, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
    ac.fillStyle = g; ac.fillRect(0, 0, cw, ch);
    const s = canvas(cw, ch), sc = s.getContext('2d');
    sc.drawImage(a, 0, 0); sc.globalCompositeOperation = 'source-in'; sc.fillStyle = outline; sc.fillRect(0, 0, cw, ch);
    const out = canvas(cw, ch), oc = out.getContext('2d');
    const o = Math.max(1, w * d * 0.02);
    oc.globalAlpha = 0.3; oc.drawImage(s, o * 0.5, o * 2.4); oc.globalAlpha = 1;
    for (let k = 0; k < 8; k++) oc.drawImage(s, Math.cos(k * Math.PI / 4) * o, Math.sin(k * Math.PI / 4) * o);
    oc.drawImage(a, 0, 0);
    return out;
  }
  function sprite(k, size) {
    const key = k + ':' + Math.round(size);
    let s = sprites.get(key);
    if (s) return s;
    const d = DPR(), o = Math.ceil(size * 0.08);
    s = canvas((size + o * 3) * d, (size + o * 3) * d);
    s.o = o;
    const c = s.getContext('2d');
    c.scale(d, d); c.translate(o, o);
    const th = size * 0.13, w = size * 0.94, h = size * 0.86 - th * 0.2, r = size * 0.18, x = size * 0.03;
    // Contact shadow.
    c.save(); c.shadowColor = 'rgba(40,15,0,0.55)'; c.shadowBlur = size * 0.1; c.shadowOffsetX = 5000; c.shadowOffsetY = size * 0.06;
    roundRect(c, x - 5000, th * 0.5, w, h + th, r); c.fillStyle = '#000'; c.fill(); c.restore();
    // Thick caramel side.
    roundRect(c, x, th, w, h, r);
    let g = c.createLinearGradient(0, h * 0.6, 0, h + th);
    g.addColorStop(0, '#d9a066'); g.addColorStop(1, '#8a5326');
    c.fillStyle = g; c.fill();
    c.fillStyle = 'rgba(255,230,190,0.35)'; roundRect(c, x + r * 0.5, h + th * 0.25, w - r, th * 0.18, th * 0.09); c.fill();
    // Top face with bevel and gloss.
    roundRect(c, x, 0, w, h, r);
    g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#fffdf6'); g.addColorStop(0.7, '#f6ead0'); g.addColorStop(1, '#e8d4ac');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, x, 0, w, h, r); c.clip();
    c.lineWidth = size * 0.06;
    c.strokeStyle = 'rgba(150,100,40,0.28)'; roundRect(c, x + size * 0.025, size * 0.03, w, h, r); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,1)'; roundRect(c, x - size * 0.025, -size * 0.025, w, h, r); c.stroke();
    c.restore();
    c.lineWidth = Math.max(1, size * 0.015); c.strokeStyle = 'rgba(110,65,20,0.45)'; roundRect(c, x, 0, w, h, r); c.stroke();
    // A soft coloured disc behind the picture helps tell them apart at a glance.
    const cx = x + w / 2, cy = h / 2;
    g = c.createRadialGradient(cx, cy - h * 0.1, 0, cx, cy, w * 0.42);
    g.addColorStop(0, Kit.rgba(ICONS[k].color, 0.08)); g.addColorStop(1, Kit.rgba(ICONS[k].color, 0.24));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, w * 0.4, 0, Math.PI * 2); c.fill();
    const box = w * 0.95, ir = w * 0.33;
    const art = shadedArt((ac) => { ac.translate(box / 2, box / 2); icon(ac, k, ir); }, box, box, 'rgba(70,35,10,0.9)');
    c.drawImage(art, cx - box / 2, cy - box / 2, box, box);
    // Gloss across the top.
    g = c.createLinearGradient(0, 0, 0, h * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; roundRect(c, x + w * 0.08, h * 0.04, w * 0.84, h * 0.32, r * 0.7); c.fill();
    sprites.set(key, s);
    return s;
  }
  // Tiles come in two baked sizes (heap and tray); anything between is the nearer one scaled.
  function drawTile(c, k, x, y, size, alpha = 1, sx = 1, sy = 1) {
    const base = Math.abs(size - L.S) < Math.abs(size - L.ts) ? L.S : L.ts;
    const s = sprite(k, base), d = DPR(), f = size / base;
    const w = s.width / d * f, h = s.height / d * f, o = s.o * f;
    c.globalAlpha = alpha;
    if (sx === 1 && sy === 1) c.drawImage(s, x - o, y - o, w, h);
    else {
      c.save(); c.translate(x + size / 2, y + size); c.scale(sx, sy);
      c.drawImage(s, -size / 2 - o, -size - o, w, h); c.restore();
    }
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
      setTimeout(() => { sfx.win(); Kit.confetti(160); Kit.shake(8, 0.4); }, 700);
    } else if (tray.length >= SLOTS) {
      lost = true; endT = now() + 0.7; panelSel = rescueUsed ? 1 : 0;
      setTimeout(() => { sfx.over(); Kit.shake(6, 0.3); }, 450);
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
  const motes = Array.from({ length: 14 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), p: Math.random() * 6, v: 0.004 + Math.random() * 0.01 }));
  function sparkle(x, y, n, speed = 1) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = (80 + Math.random() * 300) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 90, life: 0, max: 0.45 + Math.random() * 0.5, size: 10 + Math.random() * 22, rot: Math.random() * 3, spin: (Math.random() - 0.5) * 8 });
    }
  }
  function fontsLoaded() {
    try { for (const f of document.fonts) if (/Fredoka/.test(f.family) && f.status === 'loaded') return true; } catch (e) { return true; }
    return false;
  }
  const helpUsed = () => (3 - boosts.undo) + (2 - boosts.shuffle) + (3 - boosts.hint) + (rescueUsed ? 2 : 0);
  const starsFor = () => { const u = helpUsed(); return u === 0 ? 3 : u <= 2 ? 2 : 1; };
  function update(dt) {
    introT += dt; banner += dt;
    if (!fontOK && (fontWait += dt) > 0.3) { fontWait = 0; if (fontsLoaded() || introT > 8) fontOK = true; }
    const k = Math.min(1, dt * 14), nw = now();
    // Tray tiles glide to their slots and land with a little squash.
    if (gap && nw > gap.until) gap = null;
    tray.forEach((t, idx) => {
      const v = vis.find((q) => q.id === t.id);
      if (!v) { const s0 = L.slot(idx); vis.push({ icon: t.icon, id: t.id, x: s0.x, y: s0.y, s: L.ts, landed: true }); return; } // restored from a saved game
      const s = L.slot(Math.min(SLOTS - 1, idx + (gap && idx >= gap.at ? 3 : 0)));
      v.x = lerp(v.x, s.x, k); v.y = lerp(v.y, s.y, k); v.s = lerp(v.s, L.ts, k);
      if (!v.landed && Math.abs(v.x - s.x) + Math.abs(v.y - s.y) < 3) { v.landed = true; v.landT = nw; Kit.burst(s.x + L.ts / 2, s.y + L.ts, '#ffe2b0', 4, 0.35); }
    });
    for (const m of merging) { m.t += dt; m.x = lerp(m.x, m.tx, k); m.y = lerp(m.y, m.ty, k); m.s = lerp(m.s, L.ts, k); }
    if (merging.length && merging[0].t > 0.5) {
      const lead = merging[0];
      const cx = lead.tx + L.ts / 2, cy = lead.ty + L.ts / 2;
      flashes.push({ x: cx, y: cy, t: 0 });
      sparkle(cx, cy, 16, 0.9);
      Kit.burst(cx, cy, ICONS[lead.icon].color, 14, 1);
      combo = nw - lastClearT < 3.5 ? combo + 1 : 1; lastClearT = nw;
      Kit.float(combo >= 2 ? `Combo ×${combo}` : '+3', cx, lead.ty - L.ts * 0.3, { color: combo >= 2 ? '#ffd23f' : '#b8ff9a', size: L.ts * (combo >= 2 ? 0.5 : 0.55), big: combo >= 2 });
      sfx.clear(1, Math.min(combo, 3));
      Kit.shake(combo >= 2 ? 5 : 3, 0.2);
      merging.splice(0, 3);
    }
    for (let q = sparks.length - 1; q >= 0; q--) {
      const p = sparks[q];
      p.life += dt; if (p.life > p.max) { sparks.splice(q, 1); continue; }
      p.vx *= 0.94; p.vy = p.vy * 0.94 + 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
    }
    for (let q = flashes.length - 1; q >= 0; q--) { flashes[q].t += dt; if (flashes[q].t > 0.45) flashes.splice(q, 1); }
    if (flips) { flips.t += dt / 0.4; if (flips.t >= 1) flips = null; }
    for (let i = 0; i < P.length; i++) lit[i] = lerp(lit[i] == null ? (isFree(i, alive) ? 1 : 0) : lit[i], isFree(i, alive) ? 1 : 0, Math.min(1, dt * 8));
    if (won && nw > endT) {
      const n = starsFor(), ph = Math.min(Kit.H * 0.6, 470);
      while (starsShown < n && nw - endT > 0.55 + starsShown * 0.22) {
        sparkle(Kit.W / 2 + (starsShown - 1) * ph * 0.28, Kit.H * 0.5 + ph * 0.02, 12, 0.8);
        Kit.tone(880 * Math.pow(1.26, starsShown), { type: 'triangle', dur: 0.25, vol: 0.16 });
        starsShown++;
      }
    } else starsShown = 0;
    gleam.t += dt;
    if (gleam.t > gleam.wait) {
      const list = []; P.forEach((_, i) => { if (isFree(i, alive)) list.push(i); });
      gleam = { i: list.length ? list[Math.floor(Math.random() * list.length)] : -1, t: 0, wait: 1.6 + Math.random() * 1.6 };
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
    } else if (id === 'undo' || id === 'rescue') {
      c.beginPath(); c.arc(s * 0.05, s * 0.08, s * 0.38, Math.PI * 1.15, Math.PI * 0.55, false); c.stroke();
      head(-s * 0.3, -s * 0.12, -Math.PI * 0.62);
    } else if (id === 'retry') {
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
  function goldPill(c, b, t, text, icon) {
    c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = 20 + 8 * Math.sin(t * 5);
    roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
    const g = c.createLinearGradient(0, b.y, 0, b.y + b.h); g.addColorStop(0, '#fff09a'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#f0a400');
    c.fillStyle = g; c.fill(); c.restore();
    c.lineWidth = 2.5; c.strokeStyle = '#fff'; roundRect(c, b.x, b.y, b.w, b.h, b.h / 2); c.stroke();
    if (text) pillText(c, b, text, icon, '#3a2200');
  }
  function pillText(c, b, text, icon, col) {
    const fs = Math.round(Math.min(b.h * 0.42, b.w * 0.15));
    c.font = `700 ${fs}px ${Kit.UI}`; c.textBaseline = 'middle';
    const tw = c.measureText(text).width, is = icon ? b.h * 0.5 : 0, gp = icon ? b.h * 0.18 : 0;
    const sx = b.x + b.w / 2 - (tw + is + gp) / 2;
    if (icon) btnIcon(c, icon, sx + is / 2, b.y + b.h / 2, is, col);
    c.fillStyle = col; c.textAlign = 'left'; c.fillText(text, sx + is + gp, b.y + b.h / 2 + 1); c.textAlign = 'center';
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, nw = now(), S = L.S;
    if (!scene) layout();
    c.drawImage(scene, 0, 0, W, H);
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Fairy lights twinkle, dust floats in the sunbeams.
    c.globalCompositeOperation = 'lighter';
    for (const b of fx.bulbs) {
      const a = 0.45 + 0.35 * Math.sin(t * 2.3 + b.p), s = H * 0.07;
      c.globalAlpha = a; c.drawImage(fx.dot, b.x - s / 2, b.y + 4 - s / 2, s, s);
    }
    for (const m of motes) {
      const x = ((m.x + t * m.v) % 1) * W, y = ((m.y + t * m.v * 0.6) % 1) * H, a = 0.25 + 0.25 * Math.sin(t * 1.3 + m.p), s = 6 + m.s * 8;
      c.globalAlpha = Math.max(0, a); c.drawImage(fx.dot, x - s / 2, y - s / 2, s, s);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    for (const b of fx.bulbs) { c.fillStyle = b.hue; c.beginPath(); c.ellipse(b.x, b.y + 5, 4, 6, 0, 0, Math.PI * 2); c.fill(); }

    // Header: level, how-to and progress, tiles left.
    const shownLevel = won ? level - 1 : level, lp = L.lvl, rp = L.left;
    Kit.title(c, `Level ${shownLevel}`, lp.x + lp.w / 2, lp.y + lp.h / 2 + 1, Math.round(lp.h * 0.52), { color: '#ffe0a8' });
    const left = alive.reduce((s, a) => s + a, 0);
    drawTile(c, 2, rp.x + rp.h * 0.2, rp.y + rp.h * 0.14, rp.h * 0.72);
    c.font = `600 ${Math.round(rp.h * 0.44)}px ${Kit.UI}`; c.fillStyle = '#fff';
    c.fillText(`${left} left`, rp.x + rp.w * 0.6, rp.y + rp.h / 2 + 1);
    const early = introT < 8 && level <= 2 && picks < 3;
    c.font = `600 ${Math.round(clamp(H * 0.03, 18, 32))}px ${Kit.UI}`;
    c.lineJoin = 'round'; c.lineWidth = 4; c.strokeStyle = 'rgba(30,10,0,0.55)';
    const tip = early ? 'Three alike in the tray clear away!' : Kit.touchFirst() ? 'Tap a bright tile · three alike clear' : 'Arrows move · OK picks · Back exits';
    c.strokeText(tip, W / 2, L.bar.y - lp.h * 0.3);
    c.fillStyle = early ? '#fff2a8' : 'rgba(255,245,230,0.88)'; c.fillText(tip, W / 2, L.bar.y - lp.h * 0.3);
    const prog = 1 - left / P.length, b = L.bar;
    if (prog > 0.001) {
      const bw = Math.max(b.h, b.w * prog);
      roundRect(c, b.x, b.y, bw, b.h, b.h / 2);
      const pg = c.createLinearGradient(b.x, 0, b.x + b.w, 0); pg.addColorStop(0, '#7be06a'); pg.addColorStop(1, '#ffd23f');
      c.fillStyle = pg; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.45)'; roundRect(c, b.x + 2, b.y + 1, bw - 4, b.h * 0.38, b.h * 0.2); c.fill();
    }

    // The heap: covered tiles are dimmer; the focused one bobs and glows.
    const flipK = flips ? Math.abs(Math.cos(flips.t * Math.PI)) : 1;
    const hintOn = hint >= 0 && nw - hintT < 5;
    for (const i of order) {
      if (!alive[i]) continue;
      let { x, y } = tileXY(i);
      const isFocus = cursor === i && !won && !lost && !Kit.touchFirst();
      if (isFocus) y -= S * 0.03 * (1 + Math.sin(t * 4));
      if (i === nopeTile && nw - nopeT < 0.3) x += Math.sin((nw - nopeT) * 60) * S * 0.05;
      const ic = flips && flips.t < 0.5 ? flips.from[i] : icons[i];
      if (flips) { c.save(); c.translate(x + S / 2, 0); c.scale(flipK, 1); drawTile(c, ic, -S / 2, y, S); c.restore(); }
      else drawTile(c, ic, x, y, S);
      const dim = 1 - (lit[i] == null ? 1 : lit[i]);
      if (dim > 0.01) { roundRect(c, x + S * 0.03, y, S * 0.94, S * 0.84, S * 0.18); c.fillStyle = `rgba(40,16,0,${0.5 * dim})`; c.fill(); }
      if (gleam.i === i && gleam.t < 0.7 && dim < 0.1) {
        c.save(); roundRect(c, x + S * 0.03, y, S * 0.94, S * 0.84, S * 0.18); c.clip();
        const sx = x - S + (gleam.t / 0.7) * S * 3;
        const sg = c.createLinearGradient(sx, y, sx + S * 0.6, y + S * 0.3);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, 'rgba(255,255,255,0.6)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sg; c.fillRect(x, y, S, S); c.restore();
      }
      if (hintOn && hint === i) {
        roundRect(c, x - 2, y - 2, S * 0.94 + 4 + S * 0.03, S * 0.86 + 4, S * 0.2);
        c.lineWidth = Math.max(4, S * 0.07); c.strokeStyle = `rgba(110,220,255,${0.55 + 0.45 * Math.sin(t * 8)})`; c.stroke();
      }
      if (isFocus) {
        const g = fx.ring, d = DPR();
        c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.6 + 0.4 * Math.sin(t * 6);
        c.drawImage(g, x + S * 0.03 - g.G, y - g.G, g.width / d, g.height / d);
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
        roundRect(c, x + S * 0.03 - 5, y - 5, S * 0.94 + 10, S * 0.86 + S * 0.13 + 10, S * 0.22);
        c.lineWidth = Math.max(5, S * 0.075); c.strokeStyle = '#ffae00'; c.stroke();
        c.lineWidth = Math.max(2, S * 0.025); c.strokeStyle = '#fff8c8'; c.stroke();
      }
    }

    // Tray: tiles land with a squash; a glass sheen lies over the top.
    for (const v of vis) {
      let sx = 1, sy = 1;
      if (v.landT && nw - v.landT < 0.28) { const q = (nw - v.landT) / 0.28, w = Math.sin(q * Math.PI) * (1 - q); sx = 1 + w * 0.22; sy = 1 - w * 0.26; }
      if (!v.landed && v.born && nw - v.born < 0.12) { const q = (nw - v.born) / 0.12; sx = sy = 1 + Math.sin(q * Math.PI) * 0.15; }
      drawTile(c, v.icon, v.x, v.y, v.s, 1, sx, sy);
    }
    for (const m of merging) {
      const k2 = clamp((m.t - 0.3) / 0.2, 0, 1), sc = 1 + Math.sin(k2 * Math.PI / 2) * 0.22;
      drawTile(c, m.icon, m.x - (m.s * (sc - 1)) / 2, m.y - (m.s * (sc - 1)) / 2, m.s * sc);
      if (k2 > 0) { roundRect(c, m.x, m.y, m.s, m.s * 0.9, m.s * 0.18); c.fillStyle = `rgba(255,255,255,${k2 * 0.7})`; c.fill(); }
    }
    const T = L.tray;
    c.save(); roundRect(c, T.x + 4, T.y + 4, T.w - 8, T.h - 8, T.h * 0.2); c.clip();
    const gl = c.createLinearGradient(T.x, T.y, T.x + T.w * 0.4, T.y + T.h);
    gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.05)'); gl.addColorStop(0.36, 'rgba(255,255,255,0)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(T.x, T.y, T.w, T.h);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(T.x, T.y + 4, T.w, 3);
    c.restore();
    if (tray.length >= SLOTS - 2 && !won) {
      c.save(); c.shadowColor = '#ff3b3b'; c.shadowBlur = 24;
      c.lineWidth = 4; c.strokeStyle = `rgba(255,80,80,${0.55 + 0.45 * Math.sin(t * 8)})`;
      roundRect(c, T.x - 3, T.y - 3, T.w + 6, T.h + 6, T.h * 0.26); c.stroke(); c.restore();
    }
    c.globalCompositeOperation = 'lighter';
    for (const fl of flashes) { const q = fl.t / 0.45, s = L.ts * (1 + q * 3); c.globalAlpha = (1 - q) * 0.9; c.drawImage(fx.dot, fl.x - s / 2, fl.y - s / 2, s, s); }
    for (const p of sparks) { c.globalAlpha = 1 - p.life / p.max; c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.drawImage(fx.star, -p.size / 2, -p.size / 2, p.size, p.size); c.restore(); }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';

    // Buttons with how many are left on a little red coin.
    L.buttons.forEach((bt, k) => {
      const on = cursor === 1000 + k && !won && !lost && !Kit.touchFirst();
      const off = boosts[bt.id] <= 0 || (bt.id === 'undo' && !history.length);
      const inner = { x: bt.x, y: bt.y, w: bt.w - bt.h * 0.6, h: bt.h };
      if (on) goldPill(c, bt, t);
      pillText(c, inner, bt.label, bt.id, on ? '#3a2200' : off ? 'rgba(255,255,255,0.4)' : '#fff');
      const r = bt.h * 0.3, x = bt.x + bt.w - bt.h * 0.5, y = bt.y + bt.h / 2, n = boosts[bt.id];
      const cg = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r);
      cg.addColorStop(0, n > 0 ? '#ff9aa8' : '#9a8a80'); cg.addColorStop(1, n > 0 ? '#d81b4a' : '#5a4a40');
      c.fillStyle = cg; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke();
      c.fillStyle = '#fff'; c.font = `700 ${Math.round(r * 1.2)}px ${Kit.FONT}`; c.fillText(String(n), x, y + 1);
    });

    const m = muteBox();
    c.globalAlpha = 0.8; btnIcon(c, Kit.muted ? 'mute' : 'sound', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.55, '#fff'); c.globalAlpha = 1;

    // Level intro ribbon.
    if (banner < 2.3 && !won && !lost) {
      const k = banner < 0.4 ? ease.back(banner / 0.4) : banner > 1.9 ? 1 - ease.inOut((banner - 1.9) / 0.4) : 1;
      const bwid = Math.min(W * 0.6, H * 0.95), bht = Math.max(56, H * 0.13);
      c.save(); c.globalAlpha = clamp(k, 0, 1);
      c.translate(W / 2 + (1 - clamp(k, 0, 1)) * -W * 0.3, (L.cloth.y + L.cloth.h / 2));
      ribbon(c, 0, 0, bwid, bht, '#f07a3a', '#a8401a');
      Kit.title(c, `Level ${level}`, 0, -bht * 0.12, Math.round(bht * 0.46), { color: '#fff1c2' });
      c.font = `600 ${Math.round(bht * 0.22)}px ${Kit.UI}`; c.fillStyle = '#fff6ea'; c.fillText(`Clear all ${P.length} tiles`, 0, bht * 0.3);
      c.restore();
    }

    if ((won || lost) && nw > endT) {
      const a = clamp((nw - endT) / 0.45, 0, 1), since = nw - endT;
      c.fillStyle = `rgba(25,8,0,${0.62 * a})`; c.fillRect(0, 0, W, H);
      if (won) {
        const rs = Math.min(W, H) * 1.25;
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.45 * a;
        c.translate(W / 2, H * 0.47); c.rotate(t * 0.25); c.drawImage(fx.rays, -rs / 2, -rs / 2, rs, rs); c.restore();
      }
      c.save(); c.translate(W / 2, H / 2); const sc = ease.back(a); c.scale(sc, sc);
      const pw = Math.min(W * 0.7, H * 1.05), ph = Math.min(H * 0.6, 470);
      c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 32);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      if (won) { g.addColorStop(0, '#f0a050'); g.addColorStop(0.5, '#c86a2a'); g.addColorStop(1, '#7a3412'); } else { g.addColorStop(0, '#7a4a8a'); g.addColorStop(1, '#341642'); }
      c.fillStyle = g; c.fill(); c.restore();
      Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 32, { tint: 'rgba(255,255,255,0.04)', edge: 'rgba(246,210,122,0.9)' });
      ribbon(c, 0, -ph / 2 + ph * 0.02, pw * 0.7, ph * 0.17, won ? '#e04a3a' : '#5a6ad8', won ? '#8e1f14' : '#2a3488');
      Kit.title(c, `Level ${won ? level - 1 : level}`, 0, -ph / 2 + ph * 0.015, Math.round(ph * 0.085), { color: '#ffe9a8' });
      if (won) {
        Kit.title(c, 'Heap cleared!', 0, -ph * 0.22, Math.round(ph * 0.13), { color: '#fff1c2', glow: 'rgba(255,200,120,0.6)' });
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
        c.font = `600 ${Math.round(ph * 0.062)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,248,235,0.92)';
        c.fillText(n === 3 ? 'Perfect: no helpers used!' : n === 2 ? 'Well played!' : 'Cleared with a little help', 0, ph * 0.2);
        const bw2 = pw * 0.5, bh2 = ph * 0.15;
        goldPill(c, { x: -bw2 / 2, y: ph * 0.29, w: bw2, h: bh2 }, t, Kit.touchFirst() ? 'Tap: next level' : 'OK  ·  Next level');
        c.restore();
      } else {
        Kit.title(c, 'The tray is full', 0, -ph * 0.2, Math.round(ph * 0.12), { color: '#ffd9f0' });
        c.font = `600 ${Math.round(ph * 0.066)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillText(rescueUsed ? 'No rescue left. Try the level again!' : 'Put the last 3 tiles back, or start again?', 0, -ph * 0.04);
        c.restore();
        // The two choices sit in screen space so taps and the remote line up.
        c.save(); c.globalAlpha = a;
        panelButtons().forEach((pb, k) => {
          const label = k === 0 ? 'Rescue' : 'Try again', ic = k === 0 ? 'rescue' : 'retry';
          if (panelSel === k && !Kit.touchFirst() && !(k === 0 && rescueUsed)) goldPill(c, pb, t, label, ic);
          else {
            roundRect(c, pb.x, pb.y, pb.w, pb.h, pb.h / 2); c.fillStyle = 'rgba(255,255,255,0.14)'; c.fill();
            c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
            pillText(c, pb, label, ic, k === 0 && rescueUsed ? 'rgba(255,255,255,0.35)' : '#fff');
          }
        });
        c.restore();
      }
    }
  }

  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('tiletrio', level - 1);
})();
