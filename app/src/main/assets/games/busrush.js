// Bus Rush: a car park packed with buses and cars, and a queue of passengers at the pick-up lane on top.
// Pick a vehicle and it drives out the way it faces (if something is in the way it bumps it and rolls
// back), round the ring road and into one of five stops. Passengers at the front of the queue get on a
// vehicle of their own colour; a full one drives away. All five stops taken with nobody able to board:
// stuck. Get everybody on board to win. Levels are built backwards from an empty car park, and the queue
// is checked with a play-through so every level can be won.
// Remote: arrows move between vehicles (and the Undo / Restart buttons), OK drives the one in focus.
// Touch and mouse: tap a vehicle.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const COLORS = ['#ff4d6d', '#ffc93c', '#2ec4a0', '#4e7cff', '#b26bff', '#ff8a3d'];
  const STOPS = 5;
  const CAP = { 2: 4, 3: 6 }; // seats: a car (2 cells) and a bus (3 cells)
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const DIR_LIST = ['up', 'down', 'left', 'right'];
  const ANG = { right: 0, down: Math.PI / 2, left: Math.PI, up: -Math.PI / 2 };
  const rand = (n) => Math.floor(Math.random() * n);
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rand(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- Rules (shared by the game and the level checker) ----------
  // A vehicle is its head cell (r, c), its facing and its length; the body trails behind the head.
  const cellsOf = (v) => { const [dr, dc] = DIRS[v.dir]; const out = []; for (let i = 0; i < v.len; i++) out.push([v.r - dr * i, v.c - dc * i]); return out; };
  function occupancy(lv, inLot) {
    const occ = Array.from({ length: lv.rows }, () => Array(lv.cols).fill(-1));
    lv.vs.forEach((v, i) => { if (inLot[i]) cellsOf(v).forEach(([r, c]) => { occ[r][c] = i; }); });
    return occ;
  }
  // How far a vehicle can roll forward, and what stops it (-1: the way out is clear).
  function wayOut(lv, occ, i) {
    const v = lv.vs[i], [dr, dc] = DIRS[v.dir];
    let r = v.r + dr, c = v.c + dc, free = 0;
    while (r >= 0 && c >= 0 && r < lv.rows && c < lv.cols) {
      if (occ[r][c] >= 0 && occ[r][c] !== i) return { clear: false, free, blocker: occ[r][c] };
      free++; r += dr; c += dc;
    }
    return { clear: true, free, blocker: -1 };
  }
  function startState(lv) {
    return { inLot: lv.vs.map(() => true), stops: Array(STOPS).fill(-1), left: lv.vs.map((v) => CAP[v.len]), order: [], qi: 0 };
  }
  // Drive vehicle i to the first free stop, then let the queue board. Returns what happened, for the show.
  function drive(lv, S, i, events) {
    const slot = S.stops.indexOf(-1);
    S.inLot[i] = false; S.stops[slot] = i; S.order.push(i);
    if (events) events.push({ type: 'drive', v: i, stop: slot });
    board(lv, S, events);
    return slot;
  }
  function board(lv, S, events) {
    while (S.qi < lv.queue.length) {
      const col = lv.queue[S.qi];
      const v = S.order.find((k) => S.left[k] > 0 && S.stops.indexOf(k) >= 0 && lv.vs[k].color === col);
      if (v === undefined) break;
      S.left[v]--;
      if (events) events.push({ type: 'board', p: S.qi, v });
      S.qi++;
      if (S.left[v] === 0) {
        S.stops[S.stops.indexOf(v)] = -1;
        if (events) events.push({ type: 'leave', v });
      }
    }
  }
  const stuck = (lv, S) => S.qi < lv.queue.length && S.stops.every((s) => s >= 0);

  // A plain player: always takes a free vehicle whose colour is needed soonest. Levels it can't win are thrown away.
  function playable(lv) {
    const S = startState(lv);
    board(lv, S);
    for (let guard = 0; guard < 400; guard++) {
      if (S.qi >= lv.queue.length) return true;
      if (stuck(lv, S)) return false;
      const occ = occupancy(lv, S.inLot);
      let best = -1, bestK = Infinity;
      lv.vs.forEach((v, i) => {
        if (!S.inLot[i] || !wayOut(lv, occ, i).clear) return;
        let covered = 0;
        S.stops.forEach((k) => { if (k >= 0 && lv.vs[k].color === v.color) covered += S.left[k]; });
        let seen = 0, k = Infinity;
        for (let j = S.qi; j < lv.queue.length; j++) if (lv.queue[j] === v.color && ++seen > covered) { k = j; break; }
        if (k < bestK) { bestK = k; best = i; }
      });
      if (best < 0) return false;
      drive(lv, S, best);
    }
    return false;
  }

  // ---------- Levels: built backwards ----------
  function params(n) {
    return {
      cols: Math.min(8, 6 + Math.floor(n / 3)),
      rows: Math.min(6, 5 + Math.floor(n / 4)),
      colors: Math.min(COLORS.length, 2 + Math.floor(n / 2)),
      count: Math.min(16, 5 + n),
      bus: Math.min(0.45, 0.18 + n * 0.03),
      window: n < 2 ? 1 : n < 5 ? 2 : 3,
    };
  }
  function split(cap) {
    const ways = cap === 4 ? [[4], [2, 2], [1, 3], [3, 1], [2, 2]] : [[3, 3], [2, 2, 2], [2, 4], [4, 2], [3, 3]];
    return ways[rand(ways.length)].slice();
  }
  function generate(n) {
    const P = params(n);
    let lv = null;
    for (let attempt = 0; attempt < 300; attempt++) {
      // Each new vehicle needs a clear way out past the ones already parked: they leave after it,
      // so the reverse of the parking order always empties the car park.
      const occ = Array.from({ length: P.rows }, () => Array(P.cols).fill(-1));
      const vs = [];
      for (let tries = 0; vs.length < P.count && tries < 4000; tries++) {
        const v = { len: Math.random() < P.bus ? 3 : 2, dir: DIR_LIST[rand(4)], r: rand(P.rows), c: rand(P.cols) };
        const cs = cellsOf(v);
        if (cs.some(([r, c]) => r < 0 || c < 0 || r >= P.rows || c >= P.cols || occ[r][c] >= 0)) continue;
        const [dr, dc] = DIRS[v.dir];
        let ok = true;
        for (let r = v.r + dr, c = v.c + dc; ok && r >= 0 && c >= 0 && r < P.rows && c < P.cols; r += dr, c += dc) if (occ[r][c] >= 0) ok = false;
        if (!ok) continue;
        vs.push(v);
        cs.forEach(([r, c]) => { occ[r][c] = vs.length - 1; });
      }
      if (vs.length < P.count) continue;
      const cols = shuffle(vs.map((_, i) => (i < P.colors ? i : rand(P.colors))));
      vs.forEach((v, i) => { v.color = cols[i]; });
      // The queue: passengers in small groups for the next few vehicles out, mixed a little.
      const outOrder = vs.map((_, i) => vs.length - 1 - i);
      const chunks = vs.map((v) => split(CAP[v.len]));
      const queue = [], active = [];
      let next = 0;
      for (;;) {
        while (active.length < P.window && next < outOrder.length) active.push(outOrder[next++]);
        if (!active.length) break;
        const pick = active[Math.random() < 0.5 ? 0 : rand(active.length)];
        const k = chunks[pick].shift();
        for (let j = 0; j < k; j++) queue.push(vs[pick].color);
        if (!chunks[pick].length) active.splice(active.indexOf(pick), 1);
      }
      lv = { rows: P.rows, cols: P.cols, vs, queue };
      // Too easy if the very first passenger's colour is free to go; and it must be winnable.
      const S = startState(lv), o = occupancy(lv, S.inLot);
      const freeNow = vs.filter((v, i) => wayOut(lv, o, i).clear).length;
      if (attempt < 200 && freeNow > Math.max(3, vs.length * 0.5)) continue;
      if (playable(lv)) return lv;
    }
    return generate(Math.max(1, n - 1)); // practically never reached
  }

  // ---------- State ----------
  let level = Kit.store.get('busrush.level', 1);
  let lv, S, moves, vis, stopRes, waitlist, pending, leaves, walkers, vq, qShow;
  let focus = 0, won = false, lost = false, endT = 0, panelSel = 0, introT = 0, nopeT = -9, confirmT = -9;

  function save() { Kit.store.set('busrush.game', { level, lv, moves }); }
  function rebuild() {
    // The rules state comes from the level and the list of moves (that is how Undo works).
    S = startState(lv);
    board(lv, S);
    moves.forEach((i) => drive(lv, S, i));
    won = S.qi >= lv.queue.length; lost = stuck(lv, S);
    endT = performance.now() / 1000;
    snapVisuals();
  }
  function begin(again) {
    if (!again) lv = generate(level);
    moves = [];
    rebuild();
    pickFocus();
    save();
  }
  const saved = Kit.store.get('busrush.game', null);
  if (saved && saved.level === level && saved.lv && saved.lv.vs) { lv = saved.lv; moves = saved.moves || []; }
  else { lv = generate(level); moves = []; }

  // ---------- Layout ----------
  let L = {};
  function layout(W, H) {
    if (!W) return;
    const c = Math.min((H * 0.9) / (lv.rows + 4.7), (W * 0.84) / 16.6);
    const m = c * 0.8; // road centre from the car park's edge
    const lw = lv.cols * c, lh = lv.rows * c;
    const laneY = H * 0.035 + c * 2.95;
    const ox = (W - lw) / 2, oy = laneY + m;
    const stopW = c * 3.25;
    L = { c, m, ox, oy, lw, lh, laneY, stopY: laneY - c * 1.05, queueY: laneY - c * 2.2, stopW, W, H };
    L.stops = Array.from({ length: STOPS }, (_, i) => W / 2 + (i - (STOPS - 1) / 2) * stopW);
    L.ringL = ox - m; L.ringR = ox + lw + m; L.ringB = oy + lh + m;
    L.font = Math.max(18, Math.round(H * 0.034));
    const bw = Math.min((W - L.ringR) * 0.62, 230), bh = Math.max(46, Math.min(H * 0.075, 60));
    const bx = (L.ringR + c * 0.6 + W) / 2 - bw / 2;
    L.buttons = [{ id: 'undo', label: '↶  Undo', x: bx, y: oy + lh * 0.25, w: bw, h: bh },
      { id: 'restart', label: '⟳  Restart', x: bx, y: oy + lh * 0.25 + bh * 1.4, w: bw, h: bh }];
    L.lx = (L.ringL - c * 0.6) / 2;
    sprites.clear();
    buildScene();
    snapVisuals();
  }
  const cellCenter = (r, c) => ({ x: L.ox + (c + 0.5) * L.c, y: L.oy + (r + 0.5) * L.c });
  function homeOf(i) {
    const v = lv.vs[i], cs = cellsOf(v);
    const a = cellCenter(cs[0][0], cs[0][1]), b = cellCenter(cs[cs.length - 1][0], cs[cs.length - 1][1]);
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, a: ANG[v.dir] };
  }
  const stopPos = (s) => ({ x: L.stops[s], y: L.stopY });

  // ---------- Pictures: the roads once, and each vehicle and passenger once per size ----------
  const scene = document.createElement('canvas');
  function buildScene() {
    const { W, H, c, ox, oy, lw, lh, m } = L;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    scene.width = Math.ceil(W * dpr); scene.height = Math.ceil(H * dpr);
    const g = scene.getContext('2d');
    g.scale(dpr, dpr);
    const road = c * 1.05;
    const sx0 = L.stops[0] - L.stopW / 2 - c * 0.3, sx1 = L.stops[STOPS - 1] + L.stopW / 2 + c * 0.3;
    // Sidewalk for the queue
    roundRect(g, sx0 - c * 0.2, L.queueY - c * 0.62, sx1 - sx0 + c * 0.4, c * 1.2, c * 0.3);
    g.fillStyle = '#5d6b78'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    for (let x = sx0; x < sx1; x += c * 0.6) { g.beginPath(); g.moveTo(x, L.queueY - c * 0.6); g.lineTo(x, L.queueY + c * 0.56); g.stroke(); }
    // Asphalt: the ring road and the two top lanes (stops above, through lane below)
    g.fillStyle = '#2b3138';
    g.strokeStyle = '#2b3138'; g.lineJoin = 'round'; g.lineWidth = road;
    roundRect(g, L.ringL, L.laneY, L.ringR - L.ringL, L.ringB - L.laneY, c * 0.7); g.stroke();
    g.fillRect(Math.min(sx0, L.ringL - road / 2), L.laneY - road / 2, Math.max(sx1, L.ringR + road / 2) - Math.min(sx0, L.ringL - road / 2), road);
    g.fillRect(sx0, L.stopY - road / 2, sx1 - sx0, road);
    // Curb between sidewalk and stops
    g.fillStyle = '#c9d2db'; g.fillRect(sx0 - c * 0.2, L.stopY - road / 2 - c * 0.06, sx1 - sx0 + c * 0.4, c * 0.08);
    // Lane dashes
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(2, c * 0.05); g.setLineDash([c * 0.35, c * 0.35]);
    g.beginPath(); g.moveTo(Math.min(sx0, L.ringL), (L.laneY + L.stopY) / 2 + c * 0.0); g.lineTo(Math.max(sx1, L.ringR), (L.laneY + L.stopY) / 2); g.stroke();
    g.setLineDash([]);
    // Stop bays: yellow boxes with a number
    L.stops.forEach((x, i) => {
      g.strokeStyle = '#ffd23f'; g.lineWidth = Math.max(2, c * 0.05);
      roundRect(g, x - L.stopW / 2 + c * 0.1, L.stopY - road * 0.42, L.stopW - c * 0.2, road * 0.84, c * 0.12); g.stroke();
      g.fillStyle = 'rgba(255,210,63,0.6)';
      g.font = `800 ${Math.round(c * 0.3)}px system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), x, L.stopY + road * 0.28);
    });
    // The car park
    roundRect(g, ox - c * 0.12, oy - c * 0.12, lw + c * 0.24, lh + c * 0.24, c * 0.25);
    g.fillStyle = '#353c45'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.09)'; g.lineWidth = 1.5;
    for (let r = 1; r < lv.rows; r++) { g.beginPath(); g.moveTo(ox + c * 0.1, oy + r * c); g.lineTo(ox + lw - c * 0.1, oy + r * c); g.stroke(); }
    for (let k = 1; k < lv.cols; k++) { g.beginPath(); g.moveTo(ox + k * c, oy + c * 0.1); g.lineTo(ox + k * c, oy + lh - c * 0.1); g.stroke(); }
    // Ring centre line
    g.setLineDash([c * 0.3, c * 0.3]); g.strokeStyle = 'rgba(255,214,90,0.25)'; g.lineWidth = Math.max(2, c * 0.04);
    roundRect(g, L.ringL, L.laneY, L.ringR - L.ringL, L.ringB - L.laneY, c * 0.7); g.stroke();
    g.setLineDash([]);
    // A few bushes in the corners for charm
    [[L.ringL - c * 1.3, L.ringB + c * 0.1], [L.ringR + c * 1.3, L.ringB + c * 0.1], [L.ringL - c * 1.5, L.ringB - c * 1.2], [L.ringR + c * 1.5, L.ringB - c * 1.2]].forEach(([x, y], k) => {
      if (x < c * 0.5 || x > W - c * 0.5 || y > H * 0.93) return;
      [[0, 0, 0.42], [0.3, 0.12, 0.3], [-0.28, 0.15, 0.3]].forEach(([dx, dy, r]) => {
        g.beginPath(); g.arc(x + dx * c, y + dy * c, r * c, 0, Math.PI * 2);
        g.fillStyle = k % 2 ? '#2f9e5b' : '#278a4f'; g.fill();
      });
      g.beginPath(); g.arc(x - c * 0.1, y - c * 0.12, c * 0.12, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    });
  }

  const sprites = new Map();
  function vehicleSprite(color, len) {
    const key = color + len;
    let s = sprites.get(key);
    if (s) return s;
    const c = L.c, dpr = Math.min(window.devicePixelRatio || 1, 2);
    const VL = len * c - c * 0.16, VW = c * 0.74, pad = c * 0.15;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((VL + pad * 2) * dpr); cv.height = Math.ceil((VW + pad * 2) * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr); g.translate(VL / 2 + pad, VW / 2 + pad);
    const x0 = -VL / 2, y0 = -VW / 2, bus = len === 3;
    // Shadow and wheels
    roundRect(g, x0 + 2, y0 + 4, VL, VW, VW * 0.3); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fill();
    g.fillStyle = '#15171c';
    const wx = bus ? [x0 + VL * 0.16, x0 + VL * 0.8] : [x0 + VL * 0.2, x0 + VL * 0.74];
    wx.forEach((x) => { roundRect(g, x - c * 0.13, y0 - c * 0.05, c * 0.26, VW + c * 0.1, c * 0.06); g.fill(); });
    // Body
    roundRect(g, x0, y0, VL, VW, bus ? VW * 0.22 : VW * 0.36);
    const bg = g.createLinearGradient(0, y0, 0, y0 + VW);
    bg.addColorStop(0, shade(color, 0.3)); bg.addColorStop(0.5, color); bg.addColorStop(1, shade(color, -0.3));
    g.fillStyle = bg; g.fill();
    g.lineWidth = Math.max(1.5, c * 0.035); g.strokeStyle = shade(color, -0.5); g.stroke();
    // Windscreen at the front (right), rear window at the back
    g.fillStyle = '#1e2a3a';
    if (bus) {
      roundRect(g, VL / 2 - c * 0.34, y0 + VW * 0.12, c * 0.2, VW * 0.76, c * 0.06); g.fill();
      roundRect(g, x0 + c * 0.1, y0 + VW * 0.2, c * 0.1, VW * 0.6, c * 0.04); g.fill();
      // Roof with a light stripe and vents
      roundRect(g, x0 + c * 0.3, y0 + VW * 0.16, VL - c * 0.72, VW * 0.68, c * 0.1);
      g.fillStyle = shade(color, 0.18); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      roundRect(g, x0 + c * 0.38, y0 + VW * 0.44, VL - c * 0.88, VW * 0.12, VW * 0.06); g.fill();
    } else {
      g.beginPath();
      g.moveTo(VL / 2 - c * 0.42, y0 + VW * 0.14); g.lineTo(VL / 2 - c * 0.22, y0 + VW * 0.2);
      g.lineTo(VL / 2 - c * 0.22, y0 + VW * 0.8); g.lineTo(VL / 2 - c * 0.42, y0 + VW * 0.86); g.closePath(); g.fill();
      roundRect(g, x0 + c * 0.14, y0 + VW * 0.2, c * 0.14, VW * 0.6, c * 0.05); g.fill();
      roundRect(g, x0 + c * 0.32, y0 + VW * 0.14, VL - c * 0.78, VW * 0.72, c * 0.14);
      g.fillStyle = shade(color, 0.15); g.fill();
    }
    // Shine on the glass
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(VL / 2 - (bus ? c * 0.3 : c * 0.36), y0 + VW * 0.22, c * 0.04, VW * 0.25);
    // Lights
    g.fillStyle = '#fff6c2';
    [y0 + VW * 0.17, y0 + VW * 0.83].forEach((y) => { g.beginPath(); g.ellipse(VL / 2 - c * 0.05, y, c * 0.05, c * 0.07, 0, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#ff2a2a';
    [y0 + VW * 0.15, y0 + VW * 0.85].forEach((y) => { g.fillRect(x0 + 1, y - c * 0.05, c * 0.06, c * 0.1); });
    // Mirrors
    g.fillStyle = shade(color, -0.35);
    [y0 - c * 0.05, y0 + VW - c * 0.02].forEach((y) => { roundRect(g, VL / 2 - c * (bus ? 0.36 : 0.46), y, c * 0.1, c * 0.07, c * 0.03); g.fill(); });
    s = { cv, w: VL + pad * 2, h: VW + pad * 2, VL, VW };
    sprites.set(key, s);
    return s;
  }
  function personSprite(color) {
    const key = 'p' + color;
    let s = sprites.get(key);
    if (s) return s;
    const r = L.c * 0.24, dpr = Math.min(window.devicePixelRatio || 1, 2), size = r * 2 + 6;
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(size * dpr);
    const g = cv.getContext('2d');
    g.scale(dpr, dpr); g.translate(size / 2, size / 2);
    g.beginPath(); g.ellipse(0, r * 0.85, r * 0.8, r * 0.25, 0, 0, Math.PI * 2); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2);
    const bg = g.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    bg.addColorStop(0, shade(color, 0.45)); bg.addColorStop(1, shade(color, -0.2));
    g.fillStyle = bg; g.fill();
    g.lineWidth = Math.max(1, r * 0.1); g.strokeStyle = shade(color, -0.5); g.stroke();
    // A happy little face
    g.fillStyle = '#fff';
    [-1, 1].forEach((k) => { g.beginPath(); g.arc(k * r * 0.33, -r * 0.12, r * 0.24, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#1b1b2a';
    [-1, 1].forEach((k) => { g.beginPath(); g.arc(k * r * 0.33 + r * 0.04, -r * 0.08, r * 0.12, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#1b1b2a'; g.lineWidth = Math.max(1, r * 0.1); g.lineCap = 'round';
    g.beginPath(); g.arc(0, r * 0.22, r * 0.22, 0.2 * Math.PI, 0.8 * Math.PI); g.stroke();
    s = { cv, size };
    sprites.set(key, s);
    return s;
  }
  function drawVehicle(c, i, x, y, a, extra = {}) {
    const v = lv.vs[i], s = vehicleSprite(COLORS[v.color], v.len);
    c.save();
    c.translate(x, y); c.rotate(a);
    if (extra.scale) c.scale(extra.scale, extra.scale);
    c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
    const cell = L.c;
    if (extra.arrow) {
      // A chevron on the roof says which way it will drive.
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(2.5, cell * 0.07); c.lineCap = 'round'; c.lineJoin = 'round';
      const ax = v.len === 3 ? cell * 0.1 : -cell * 0.05;
      c.beginPath(); c.moveTo(ax - cell * 0.1, -cell * 0.16); c.lineTo(ax + cell * 0.08, 0); c.lineTo(ax - cell * 0.1, cell * 0.16); c.stroke();
    }
    if (extra.seats) {
      // Seats on the roof fill up as passengers get on.
      const cap = CAP[v.len], cols = cap / 2, sp = cell * 0.27;
      for (let k = 0; k < cap; k++) {
        const col = Math.floor(k / 2), row = k % 2;
        const sx = (col - (cols - 1) / 2) * sp - cell * 0.05, sy = (row - 0.5) * sp;
        c.beginPath(); c.arc(sx, sy, cell * 0.095, 0, Math.PI * 2);
        if (k < extra.seats.filled) { c.fillStyle = '#fff'; c.fill(); c.fillStyle = COLORS[v.color]; c.beginPath(); c.arc(sx, sy, cell * 0.055, 0, Math.PI * 2); c.fill(); }
        else { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill(); }
      }
    }
    c.restore();
  }

  // ---------- The show: vehicles driving, passengers walking ----------
  // vis[i]: where vehicle i is drawn and what it is doing (lot, bump, drive, stop, leave, gone).
  function snapVisuals() {
    if (!L.c || !S) return;
    vis = lv.vs.map((v, i) => {
      if (S.inLot[i]) { const h = homeOf(i); return { state: 'lot', x: h.x, y: h.y, a: h.a, filled: 0, incoming: 0 }; }
      const s = S.stops.indexOf(i);
      if (s >= 0) { const p = stopPos(s); return { state: 'stop', x: p.x, y: p.y, a: 0, stop: s, filled: CAP[v.len] - S.left[i], incoming: 0 }; }
      return { state: 'gone', x: -999, y: -999, a: 0, filled: 0, incoming: 0 };
    });
    // On screen a stop is held from the moment a vehicle is sent to it until it pulls away.
    stopRes = Array(STOPS).fill(-1); waitlist = [];
    vis.forEach((p, i) => { if (p.state === 'stop') stopRes[p.stop] = i; });
    pending = []; leaves = []; walkers = []; vq = S.qi; qShow = vq;
  }
  function exitPath(i) {
    // Out of the car park and round the ring road to the lane under the stops.
    const h = homeOf(i), v = lv.vs[i], pts = [{ x: h.x, y: h.y }];
    let x = h.x, y = h.y;
    if (v.dir === 'up') { y = L.laneY; pts.push({ x, y }); }
    else if (v.dir === 'left' || v.dir === 'right') {
      x = v.dir === 'left' ? L.ringL : L.ringR; pts.push({ x, y });
      y = L.laneY; pts.push({ x, y });
    } else {
      y = L.ringB; pts.push({ x, y });
      x = Math.abs(h.x - L.ringL) < Math.abs(h.x - L.ringR) ? L.ringL : L.ringR; pts.push({ x, y });
      y = L.laneY; pts.push({ x, y });
    }
    return pts;
  }
  function sendToStop(i, slot) {
    // Along the lane, then a lane change into the stop; it parks facing the way it came.
    const p = vis[i], from = p.path[p.path.length - 1], sx = L.stops[slot], c = L.c;
    const sgn = sx >= from.x ? 1 : -1;
    if (Math.abs(sx - from.x) > c * 1.6) p.path.push({ x: sx - sgn * c * 1.5, y: L.laneY });
    p.path.push({ x: sx, y: L.stopY });
    p.face = sgn > 0 ? 0 : Math.PI; p.stop = slot; stopRes[slot] = i;
  }
  function assignStops() {
    // Stops go out in the order vehicles were sent, so nobody can jump the line and jam it.
    while (waitlist.length) {
      const slot = stopRes.indexOf(-1);
      if (slot < 0) return;
      sendToStop(waitlist.shift(), slot);
    }
  }
  function follow(p, dt) {
    // Speeds up, follows the corners, turns its nose smoothly toward where it is going.
    p.speed = Math.min(L.c * 15, p.speed + L.c * 45 * dt);
    let move = p.speed * dt;
    while (move > 0 && p.seg < p.path.length - 1) {
      const a = p.path[p.seg], b = p.path[p.seg + 1];
      const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy);
      if (d <= move) { p.x = b.x; p.y = b.y; p.seg++; move -= d; continue; }
      p.x += dx / d * move; p.y += dy / d * move; move = 0;
      const want = Math.atan2(b.y - a.y, b.x - a.x);
      let da = want - p.a;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      p.a += da * Math.min(1, dt * 14);
    }
    return p.seg >= p.path.length - 1;
  }
  const busyShow = () => pending.length || leaves.length || walkers.length || vis.some((p) => p.state === 'drive' || p.state === 'bump' || p.state === 'leave' || p.state === 'full');

  function go(i) {
    if (won || lost) return;
    const p = vis[i];
    if (!S.inLot[i] || !p || p.state !== 'lot') return;
    const occ = occupancy(lv, S.inLot);
    const w = wayOut(lv, occ, i);
    if (!w.clear) {
      // Bump the one in the way and roll back.
      p.state = 'bump'; p.t = 0; p.reach = w.free * L.c + L.c * 0.12; p.blocker = w.blocker; p.hit = false;
      Kit.tone(240, { type: 'sawtooth', dur: 0.12, vol: 0.05, slide: 1.6 });
      return;
    }
    const events = [];
    moves.push(i);
    drive(lv, S, i, events);
    Object.assign(p, { state: 'drive', path: exitPath(i), seg: 0, speed: L.c * 2, face: 0, stop: -1 });
    waitlist.push(i);
    assignStops();
    Kit.noise({ dur: 0.45, vol: 0.08, freq: 260, q: 1.2, sweep: 3 });
    Kit.tone(110, { type: 'sawtooth', dur: 0.35, vol: 0.05, slide: 2.2 });
    events.forEach((e) => { if (e.type === 'board') pending.push(e); else if (e.type === 'leave') leaves.push(e); });
    won = S.qi >= lv.queue.length; lost = stuck(lv, S);
    if (won) { Kit.record('busrush', level); Kit.store.set('busrush.level', level + 1); }
    save();
    // Focus jumps to the nearest vehicle still parked.
    const h = homeOf(i);
    let best = -1, bd = Infinity;
    lv.vs.forEach((_, k) => { if (!S.inLot[k]) return; const q = homeOf(k), d = Math.hypot(q.x - h.x, q.y - h.y); if (d < bd) { bd = d; best = k; } });
    focus = best >= 0 ? best : 'undo';
  }
  function undo() {
    if (!moves.length) { nope(); return; }
    moves.pop(); rebuild(); save(); sfx.move();
    if (typeof focus !== 'number' || !S.inLot[focus]) pickFocus();
  }
  function restart() { moves = []; rebuild(); save(); pickFocus(); sfx.pick(); }
  function nope() { nopeT = performance.now() / 1000; sfx.nope(); }
  function pickFocus() {
    const occ = occupancy(lv, S.inLot);
    const free = lv.vs.map((_, i) => i).filter((i) => S.inLot[i] && wayOut(lv, occ, i).clear);
    const any = lv.vs.map((_, i) => i).filter((i) => S.inLot[i]);
    focus = free.length ? free[0] : any.length ? any[0] : 'undo';
  }
  function next() {
    level = Kit.store.get('busrush.level', level + 1);
    lv = generate(level); moves = [];
    layout(Kit.W, Kit.H);
    rebuild(); pickFocus(); save(); sfx.pick();
  }

  function update(dt) {
    if (!vis) return;
    introT += dt;
    const now = performance.now() / 1000;
    qShow = lerp(qShow, vq, Math.min(1, dt * 12));
    vis.forEach((p, i) => {
      if (p.state === 'bump') {
        p.t += dt;
        const h = homeOf(i), out = p.t < 0.16 ? ease.out(p.t / 0.16) : Math.max(0, 1 - ease.inOut((p.t - 0.16) / 0.3));
        const [dr, dc] = DIRS[lv.vs[i].dir];
        p.x = h.x + dc * p.reach * out; p.y = h.y + dr * p.reach * out;
        if (!p.hit && p.t >= 0.16) {
          p.hit = true;
          sfx.nope();
          Kit.tone(420, { type: 'square', dur: 0.08, vol: 0.06, at: 0.05 }); Kit.tone(420, { type: 'square', dur: 0.08, vol: 0.06, at: 0.17 });
          const b = vis[p.blocker]; if (b) b.shakeT = now;
          Kit.float('Blocked!', p.x, p.y - L.c * 0.6, { color: '#ff8a8a', size: L.font * 1.05, life: 0.8 });
        }
        if (p.t > 0.5) { p.state = 'lot'; p.x = h.x; p.y = h.y; }
      } else if (p.state === 'drive') {
        if (Math.random() < 0.25) Kit.burst(p.x - Math.cos(p.a) * L.c, p.y - Math.sin(p.a) * L.c, 'rgba(200,210,220,0.6)', 1, 0.12);
        if (follow(p, dt) && p.stop >= 0) {
          p.state = 'stop';
          Kit.tone(330, { type: 'triangle', dur: 0.08, vol: 0.1 }); Kit.tone(495, { type: 'triangle', dur: 0.1, vol: 0.1, at: 0.08 });
        }
      } else if (p.state === 'stop') {
        let da = p.face - p.a;
        while (da > Math.PI) da -= Math.PI * 2;
        while (da < -Math.PI) da += Math.PI * 2;
        p.a += da * Math.min(1, dt * 10);
      } else if (p.state === 'full') {
        p.t += dt;
        if (p.t > 0.35) {
          const h = Math.cos(p.a) >= 0 ? 1 : -1;
          p.state = 'leave'; stopRes[p.stop] = -1; p.seg = 0; p.speed = L.c * 3;
          assignStops();
          p.path = [{ x: p.x, y: p.y }, { x: p.x + h * L.c * 1.6, y: L.laneY }, { x: h > 0 ? L.W + L.c * 3 : -L.c * 3, y: L.laneY }];
          Kit.noise({ dur: 0.5, vol: 0.06, freq: 300, q: 1, sweep: 2.5 });
        }
      } else if (p.state === 'leave') {
        if (follow(p, dt)) p.state = 'gone';
      }
    });
    // Passengers step out of the queue in order, once their vehicle has pulled in.
    if (pending.length) {
      const e = pending[0], p = vis[e.v];
      const lastStart = walkers.length ? walkers[walkers.length - 1].t0 : -9;
      if (p.state === 'stop' && now - lastStart > 0.075) {
        pending.shift();
        const from = { x: queueX(e.p), y: L.queueY };
        walkers.push({ color: lv.queue[e.p], v: e.v, from, t0: now });
        p.incoming++; vq = e.p + 1;
      }
    }
    for (let k = walkers.length - 1; k >= 0; k--) {
      const w = walkers[k];
      if (now - w.t0 >= 0.3) {
        walkers.splice(k, 1);
        const p = vis[w.v];
        p.incoming--; p.filled++;
        Kit.tone(620 + p.filled * 50, { type: 'triangle', dur: 0.06, vol: 0.1 });
      }
    }
    for (let k = leaves.length - 1; k >= 0; k--) {
      const e = leaves[k], p = vis[e.v];
      if (p.state === 'stop' && p.incoming === 0 && !pending.some((q) => q.v === e.v)) {
        leaves.splice(k, 1);
        p.state = 'full'; p.t = 0;
        sfx.chime();
        Kit.float('Full!', p.x, p.y - L.c * 0.7, { color: COLORS[lv.vs[e.v].color], size: L.font * 1.1, life: 0.9 });
        Kit.burst(p.x, p.y, COLORS[lv.vs[e.v].color], 10, 0.6);
      }
    }
    if ((won || lost) && !endT) endT = now;
    if ((won || lost) && !busyShow() && !endT2) {
      endT2 = now;
      if (won) { sfx.win(); Kit.confetti(150); } else { sfx.over(); panelSel = 0; }
    }
    if (!(won || lost)) endT2 = 0;
  }
  let endT2 = 0;
  const queueX = (idx) => L.stops[0] - L.stopW / 2 + L.c * 0.4 + (idx - qShow) * L.c * 0.56;

  // ---------- Keys, touch and mouse ----------
  function items() {
    const out = [];
    lv.vs.forEach((_, i) => { if (S.inLot[i] && vis[i].state !== 'gone') { const h = homeOf(i); out.push({ id: i, x: h.x, y: h.y }); } });
    L.buttons.forEach((b) => out.push({ id: b.id, x: b.x + b.w / 2, y: b.y + b.h / 2 }));
    return out;
  }
  function moveFocus(dir) {
    const all = items(), cur = all.find((it) => it.id === focus) || all[0];
    if (!cur) return;
    let best = null, score = Infinity;
    for (const it of all) {
      if (it.id === cur.id) continue;
      const dx = it.x - cur.x, dy = it.y - cur.y;
      let main, side;
      if (dir === 'left') { if (dx >= -2) continue; main = -dx; side = Math.abs(dy); }
      else if (dir === 'right') { if (dx <= 2) continue; main = dx; side = Math.abs(dy); }
      else if (dir === 'up') { if (dy >= -2) continue; main = -dy; side = Math.abs(dx); }
      else { if (dy <= 2) continue; main = dy; side = Math.abs(dx); }
      if (side > main * 2.2) continue; // stay roughly in the pressed direction
      const s = main + side * 2;
      if (s < score) { score = s; best = it; }
    }
    if (best) { focus = best.id; sfx.move(); }
  }
  function press(id) {
    if (id === 'undo') undo();
    else if (id === 'restart') {
      const now = performance.now() / 1000;
      if (!moves.length || now - confirmT < 3) { confirmT = -9; restart(); } else { confirmT = now; sfx.move(); }
    } else go(id);
  }
  const panelReady = () => endT2 && performance.now() / 1000 - endT2 > 0.8;
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && panelReady()) next(); return; }
    if (lost && endT2) {
      if (!panelReady()) return;
      if (k === 'left' || k === 'right') { panelSel = 1 - panelSel; sfx.move(); }
      else if (k === 'ok') { if (panelSel === 0) undo(); else restart(); }
      else if (k === 'undo') undo();
      return;
    }
    if (lost) return;
    if (k === 'undo') { undo(); return; }
    if (k === 'restart') { press('restart'); return; }
    if (k === 'ok') { press(focus); return; }
    moveFocus(k);
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const inBox = (e, b) => e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  function panelButtons() {
    const pw = Math.min(L.W * 0.84, 560), ph = Math.min(L.H * 0.5, 300);
    const bw = pw * 0.36, bh = Math.max(46, ph * 0.17);
    return [0, 1].map((k) => ({ x: L.W / 2 + (k ? pw * 0.04 : -pw * 0.04 - bw), y: L.H / 2 + ph * 0.18, w: bw, h: bh }));
  }
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (won) { if (panelReady()) next(); return; }
      if (lost) {
        if (!endT2 || !panelReady()) return;
        const k = panelButtons().findIndex((b) => inBox(e, b));
        if (k === 0) undo(); else if (k === 1) restart();
        return;
      }
      const b = L.buttons.find((bt) => inBox(e, bt));
      if (b) { focus = b.id; press(b.id); return; }
      // Which parked vehicle is under the finger?
      const c = Math.floor((e.x - L.ox) / L.c), r = Math.floor((e.y - L.oy) / L.c);
      if (r < 0 || c < 0 || r >= lv.rows || c >= lv.cols) return;
      const occ = occupancy(lv, S.inLot);
      if (occ[r][c] >= 0) { focus = occ[r][c]; go(occ[r][c]); }
    },
  });

  // ---------- Drawing ----------
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000;
    Kit.background(c, t, '#1d5a3a', '#0a2416', 'rgba(140,255,180,0.07)');
    if (!vis) return;
    c.drawImage(scene, 0, 0, W, H);
    const cell = L.c;
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Exit preview for the vehicle in focus: a dotted track out of the car park, red when blocked.
    const showFocus = !won && !lost && !Kit.touchFirst();
    if (showFocus && typeof focus === 'number' && S.inLot[focus] && vis[focus].state === 'lot') {
      const v = lv.vs[focus], occ = occupancy(lv, S.inLot), w = wayOut(lv, occ, focus);
      const [dr, dc] = DIRS[v.dir], h = cellCenter(v.r, v.c);
      const len = (w.clear ? w.free + 0.9 : w.free + 0.5) * cell;
      c.save();
      c.setLineDash([cell * 0.12, cell * 0.16]); c.lineDashOffset = -t * cell * 1.2;
      c.lineWidth = cell * 0.09; c.lineCap = 'round';
      c.strokeStyle = w.clear ? 'rgba(160,255,190,0.85)' : 'rgba(255,90,110,0.9)';
      c.beginPath(); c.moveTo(h.x + dc * cell * 0.45, h.y + dr * cell * 0.45); c.lineTo(h.x + dc * (cell * 0.45 + len - cell * 0.45), h.y + dr * (cell * 0.45 + len - cell * 0.45)); c.stroke();
      c.restore();
    }

    // Vehicles: parked ones first, then those at the stops, then those on the move.
    const layers = [['lot', 'bump'], ['stop', 'full'], ['drive', 'leave']];
    for (const states of layers) {
      vis.forEach((p, i) => {
        if (!states.includes(p.state)) return;
        let x = p.x, y = p.y;
        if (p.shakeT && now - p.shakeT < 0.35) x += Math.sin((now - p.shakeT) * 70) * cell * 0.06 * (1 - (now - p.shakeT) / 0.35);
        const focused = showFocus && focus === i && p.state === 'lot';
        if (focused) {
          const v = lv.vs[i], s = vehicleSprite(COLORS[v.color], v.len);
          c.save(); c.translate(x, y); c.rotate(p.a);
          roundRect(c, -s.VL / 2 - 5, -s.VW / 2 - 5, s.VL + 10, s.VW + 10, s.VW * 0.4);
          c.shadowColor = '#ffd23f'; c.shadowBlur = 18 + Math.sin(t * 6) * 6;
          c.lineWidth = 4; c.strokeStyle = '#ffe680'; c.stroke();
          c.restore();
        }
        const pop = p.state === 'full' ? 1 + Math.sin(Math.min(1, p.t / 0.3) * Math.PI) * 0.08 : focused ? 1.04 : 1;
        drawVehicle(c, i, x, y, p.a, { arrow: p.state === 'lot' || p.state === 'bump', seats: p.state === 'lot' || p.state === 'bump' ? null : { filled: p.filled }, scale: pop });
      });
    }

    // The queue on the sidewalk; front on the left.
    const left = L.stops[0] - L.stopW / 2, right = L.stops[STOPS - 1] + L.stopW / 2;
    let shown = 0, hidden = 0;
    for (let k = vq; k < lv.queue.length; k++) {
      const x = queueX(k);
      if (x > right - cell * 0.9) { hidden = lv.queue.length - k; break; }
      const s = personSprite(COLORS[lv.queue[k]]);
      const bob = Math.abs(Math.sin(t * 5 + k * 0.7)) * cell * (k === vq ? 0.08 : 0.03);
      c.drawImage(s.cv, x - s.size / 2, L.queueY - s.size / 2 - bob, s.size, s.size);
      shown++;
    }
    if (hidden > 0) {
      const bx = right - cell * 0.45;
      roundRect(c, bx - cell * 0.45, L.queueY - cell * 0.28, cell * 0.9, cell * 0.56, cell * 0.28);
      c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
      c.font = `800 ${Math.round(Math.max(L.font * 0.8, cell * 0.3))}px system-ui, sans-serif`; c.fillStyle = '#fff';
      c.fillText(`+${hidden}`, bx, L.queueY + 1);
    }
    // Walking passengers hop from the queue onto their vehicle.
    for (const w of walkers) {
      const q = clamp((now - w.t0) / 0.3, 0, 1), e = ease.inOut(q);
      const p = vis[w.v], s = personSprite(COLORS[w.color]);
      const x = lerp(w.from.x, p.x, e), y = lerp(w.from.y, p.y, e) - Math.sin(q * Math.PI) * cell * 0.5;
      const k = 1 - q * 0.45;
      c.drawImage(s.cv, x - s.size * k / 2, y - s.size * k / 2, s.size * k, s.size * k);
    }

    // Left panel: level and passengers
    c.font = `900 ${Math.round(L.font * 1.45)}px system-ui, sans-serif`;
    c.lineWidth = 6; c.strokeStyle = 'rgba(0,30,15,0.8)'; c.lineJoin = 'round';
    const ly = L.oy + L.lh * 0.25;
    c.strokeText(`Level ${level}`, L.lx, ly);
    const lg = c.createLinearGradient(0, ly - L.font, 0, ly + L.font);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#a6ffcb');
    c.fillStyle = lg; c.fillText(`Level ${level}`, L.lx, ly);
    const leftN = lv.queue.length - vq;
    c.font = `800 ${Math.round(L.font)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText(`${leftN} waiting`, L.lx, ly + L.font * 1.7);
    const used = stopRes.filter((s) => s >= 0).length;
    c.fillStyle = used >= STOPS - 1 ? '#ff9aa8' : 'rgba(255,255,255,0.6)';
    c.font = `700 ${Math.round(L.font * 0.85)}px system-ui, sans-serif`;
    c.fillText(`Stops ${used} / ${STOPS}`, L.lx, ly + L.font * 3);

    // Buttons
    L.buttons.forEach((b) => {
      const on = showFocus && focus === b.id;
      const off = b.id === 'undo' && !moves.length;
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
      c.font = `800 ${Math.round(Math.min(b.h * 0.4, b.w * 0.13))}px system-ui, sans-serif`;
      c.fillStyle = on ? '#2b1600' : off ? 'rgba(255,255,255,0.35)' : '#fff';
      const label = b.id === 'restart' && now - confirmT < 3 ? 'OK again = sure' : b.label;
      c.fillText(label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    });

    // Speaker
    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    // How to play
    c.font = `600 ${Math.round(L.font * 0.82)}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(Kit.touchFirst() ? 'Tap a vehicle to drive it out · same colours get on' : 'Arrows pick a vehicle · OK drives it out · Back exits', W / 2, H * 0.968);
    if (introT < 7 && level <= 2 && !moves.length) {
      c.globalAlpha = Math.min(1, introT * 2, (7 - introT) * 2);
      c.font = `700 ${Math.round(L.font * 0.85)}px system-ui, sans-serif`;
      c.fillStyle = '#fff59d';
      ['Send a vehicle the', 'colour of the first', 'passenger in line!'].forEach((s, k) => c.fillText(s, L.lx, L.oy + L.lh * 0.25 + L.font * (4.6 + k * 1.15)));
      c.globalAlpha = 1;
    }

    // Win / stuck panels
    if ((won || lost) && endT2) {
      const a = clamp((now - endT2 - 0.3) / 0.4, 0, 1);
      if (a <= 0) return;
      c.fillStyle = `rgba(2,16,8,${0.6 * a})`; c.fillRect(0, 0, W, H);
      const pw = Math.min(W * 0.84, 560), ph = Math.min(H * 0.5, 300);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k); c.translate(-W / 2, -H / 2);
      roundRect(c, W / 2 - pw / 2, H / 2 - ph / 2, pw, ph, 28);
      const g = c.createLinearGradient(0, H / 2 - ph / 2, 0, H / 2 + ph / 2);
      g.addColorStop(0, won ? '#21b36b' : '#c4455b'); g.addColorStop(1, won ? '#0d5e38' : '#6a1a2c');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(ph * 0.15)}px system-ui, sans-serif`;
      c.fillText(won ? 'Everybody aboard!' : 'All stops are full!', W / 2, H / 2 - ph * 0.27);
      if (won) {
        c.font = `${Math.round(ph * 0.16)}px system-ui, sans-serif`;
        c.fillText('🚌 🎉 🚗', W / 2, H / 2 - ph * 0.04);
        c.font = `700 ${Math.round(ph * 0.085)}px system-ui, sans-serif`; c.fillStyle = '#fff59d';
        c.fillText(Kit.touchFirst() ? 'Tap for the next level' : 'Press OK for the next level', W / 2, H / 2 + ph * 0.25);
      } else {
        c.font = `700 ${Math.round(ph * 0.075)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillText('Nobody in the queue fits the waiting vehicles.', W / 2, H / 2 - ph * 0.07);
        panelButtons().forEach((b, i) => {
          const on = panelSel === i && !Kit.touchFirst();
          roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
          c.fillStyle = on ? '#ffd23f' : 'rgba(255,255,255,0.18)'; c.fill();
          c.lineWidth = 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.3)'; c.stroke();
          c.font = `800 ${Math.round(b.h * 0.4)}px system-ui, sans-serif`; c.fillStyle = on ? '#2b1600' : '#fff';
          c.fillText(i ? '⟳ Restart' : '↶ Undo', b.x + b.w / 2, b.y + b.h / 2 + 1);
        });
      }
      c.restore();
    }
  }

  // ---------- Start ----------
  Kit.onResize(layout);
  window.addEventListener('load', () => Kit.canvas.focus());
  S = startState(lv);
  Kit.run(update, draw);
  rebuild();
  pickFocus();
  save();
  Kit.canvas.focus();
  if (level > 1) Kit.record('busrush', level - 1);
})();
