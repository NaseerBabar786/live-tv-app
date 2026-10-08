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
  let undos = 0, focus = 0, won = false, lost = false, endT = 0, panelSel = 0, introT = 0, nopeT = -9, confirmT = -9;

  function save() { Kit.store.set('busrush.game', { level, lv, moves, undos }); }
  function rebuild() {
    // The rules state comes from the level and the list of moves (that is how Undo works).
    S = startState(lv);
    board(lv, S);
    moves.forEach((i) => drive(lv, S, i));
    won = S.qi >= lv.queue.length; lost = stuck(lv, S);
    endT = performance.now() / 1000;
    panelFx.length = 0;
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
  if (saved && saved.level === level && saved.lv && saved.lv.vs) { lv = saved.lv; moves = saved.moves || []; undos = saved.undos || 0; }
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
    L.buttons = [{ id: 'undo', x: bx, y: oy + lh * 0.25, w: bw, h: bh },
      { id: 'restart', x: bx, y: oy + lh * 0.25 + bh * 1.4, w: bw, h: bh }];
    L.lx = (L.ringL - c * 0.6) / 2;
    const pw = Math.min((L.ringL - c * 0.9) * 0.92, 270);
    L.panel = { x: L.lx - pw / 2, y: oy + lh * 0.25 - L.font * 1.6, w: pw, h: L.font * 5.6 };
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

  // ---------- Pictures: the toy town once, and each vehicle and passenger once per size ----------
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function canvasOf(w, h) {
    const cv = document.createElement('canvas'), d = DPR();
    cv.width = Math.max(1, Math.ceil(w * d)); cv.height = Math.max(1, Math.ceil(h * d));
    const g = cv.getContext('2d'); g.scale(d, d);
    return { cv, g };
  }
  function seeded(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }
  const scene = document.createElement('canvas');
  const MARGIN = 14; // the picture reaches past the screen edge so a screen shake never shows a gap
  function speckle(g, x, y, w, h, n, colors, rnd, size = 2) {
    for (let k = 0; k < n; k++) {
      g.fillStyle = colors[Math.floor(rnd() * colors.length)];
      g.fillRect(x + rnd() * w, y + rnd() * h, size * (0.5 + rnd()), size * (0.5 + rnd()));
    }
  }
  function tree(g, x, y, s, rnd) {
    // Shadow falls down-right, then trunk and a round lit canopy.
    g.fillStyle = 'rgba(10,40,15,0.35)';
    g.beginPath(); g.ellipse(x + s * 0.35, y + s * 0.45, s * 0.75, s * 0.42, 0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#7a4a26'; roundRect(g, x - s * 0.09, y, s * 0.18, s * 0.4, s * 0.06); g.fill();
    [[0, -0.15, 0.55], [-0.38, 0.05, 0.4], [0.38, 0.05, 0.42], [0, 0.18, 0.42]].forEach(([dx, dy, r]) => {
      const cx = x + dx * s, cy = y + dy * s - s * 0.2;
      const rg = g.createRadialGradient(cx - r * s * 0.35, cy - r * s * 0.4, r * s * 0.1, cx, cy, r * s);
      rg.addColorStop(0, '#9be86a'); rg.addColorStop(0.6, '#3fae4a'); rg.addColorStop(1, '#23753a');
      g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, r * s, 0, Math.PI * 2); g.fill();
    });
    for (let k = 0; k < 5; k++) { g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.arc(x + (rnd() - 0.7) * s * 0.5, y - s * 0.35 + (rnd() - 0.5) * s * 0.3, s * 0.05, 0, Math.PI * 2); g.fill(); }
  }
  function house(g, x, y, w, h, wall, roof, rnd) {
    // A little 3/4-view house: roof on top, front wall below, shadow on the grass.
    const rh = h * 0.45;
    g.fillStyle = 'rgba(10,40,15,0.32)';
    g.beginPath(); g.moveTo(x + w, y + rh * 0.3); g.lineTo(x + w + h * 0.35, y + rh * 0.5); g.lineTo(x + w + h * 0.35, y + h + h * 0.2); g.lineTo(x + w * 0.1, y + h + h * 0.2); g.lineTo(x, y + h); g.closePath(); g.fill();
    // wall
    let gr = g.createLinearGradient(x, 0, x + w, 0);
    gr.addColorStop(0, shade(wall, 0.1)); gr.addColorStop(1, shade(wall, -0.15));
    g.fillStyle = gr; g.fillRect(x, y + rh, w, h - rh);
    // windows and a door
    const wn = Math.max(1, Math.floor(w / (h * 0.32)));
    for (let k = 0; k < wn; k++) {
      const wx = x + (k + 0.5) * (w / wn) - h * 0.09, wy = y + rh + (h - rh) * 0.2;
      if (k === Math.floor(wn / 2) && wn > 1) {
        g.fillStyle = shade(roof, -0.2); roundRect(g, wx, wy + (h - rh) * 0.1, h * 0.18, (h - rh) * 0.7, h * 0.05); g.fill();
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(wx + h * 0.14, wy + (h - rh) * 0.45, h * 0.015, 0, Math.PI * 2); g.fill();
        continue;
      }
      const wg = g.createLinearGradient(wx, wy, wx + h * 0.18, wy + h * 0.18);
      wg.addColorStop(0, '#d8f3ff'); wg.addColorStop(0.5, '#7cc4f0'); wg.addColorStop(1, '#3d7fb8');
      g.fillStyle = '#fff'; g.fillRect(wx - 2, wy - 2, h * 0.18 + 4, h * 0.18 + 4);
      g.fillStyle = wg; g.fillRect(wx, wy, h * 0.18, h * 0.18);
    }
    // roof
    g.beginPath(); g.moveTo(x - w * 0.06, y + rh); g.lineTo(x + w * 0.12, y); g.lineTo(x + w * 0.88, y); g.lineTo(x + w * 1.06, y + rh); g.closePath();
    gr = g.createLinearGradient(0, y, 0, y + rh);
    gr.addColorStop(0, shade(roof, 0.25)); gr.addColorStop(1, shade(roof, -0.2));
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 1;
    for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x - w * 0.06 + k * 0.045 * w, y + rh - k * rh / 4); g.lineTo(x + w * 1.06 - k * 0.045 * w, y + rh - k * rh / 4); g.stroke(); }
    g.fillStyle = shade(roof, 0.4); g.fillRect(x + w * 0.12, y - 2, w * 0.76, 4);
    g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x - w * 0.06, y + rh, w * 1.12, 3);
  }
  function buildScene() {
    const { W, H, c, ox, oy, lw, lh } = L;
    const M = MARGIN, d = DPR(), rnd = seeded(11);
    scene.width = Math.ceil((W + 2 * M) * d); scene.height = Math.ceil((H + 2 * M) * d);
    const g = scene.getContext('2d');
    g.setTransform(d, 0, 0, d, M * d, M * d);
    const road = c * 1.05;
    const sx0 = L.stops[0] - L.stopW / 2 - c * 0.3, sx1 = L.stops[STOPS - 1] + L.stopW / 2 + c * 0.3;
    const laneL = Math.min(sx0, L.ringL - road / 2), laneR = Math.max(sx1, L.ringR + road / 2);
    // Grass with blades of light and shade
    let gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#4fb95a'); gr.addColorStop(1, '#2f8f45');
    g.fillStyle = gr; g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    speckle(g, -M, -M, W + 2 * M, H + 2 * M, Math.round(W * H / 260), ['rgba(255,255,200,0.10)', 'rgba(0,60,20,0.14)', 'rgba(140,230,120,0.18)'], rnd, 2.5);
    // Roads: curb first, then asphalt with grit
    const roadShape = (grow) => {
      g.beginPath();
      roundRect(g, L.ringL - (road / 2 + grow), L.laneY - (road / 2 + grow), L.ringR - L.ringL + road + grow * 2, L.ringB - L.laneY + road + grow * 2, c * 0.7 + road / 2);
      g.rect(laneL - grow, L.laneY - road / 2 - grow, laneR - laneL + grow * 2, road + grow * 2);
      g.rect(sx0 - grow, L.stopY - road / 2 - grow, sx1 - sx0 + grow * 2, road + grow * 2);
    };
    roadShape(c * 0.09); g.fillStyle = '#d9dfe6'; g.fill('nonzero');
    roadShape(0); g.fillStyle = '#3a4048'; g.fill('nonzero');
    // inner grass island between ring and car park stays grass
    roundRect(g, L.ringL + road / 2 + c * 0.09, L.laneY + road / 2 + c * 0.09, L.ringR - L.ringL - road - c * 0.18, L.ringB - L.laneY - road - c * 0.18, c * 0.5);
    g.fillStyle = '#d9dfe6'; g.fill();
    roundRect(g, L.ringL + road / 2 + c * 0.16, L.laneY + road / 2 + c * 0.16, L.ringR - L.ringL - road - c * 0.32, L.ringB - L.laneY - road - c * 0.32, c * 0.45);
    g.fillStyle = '#46a852'; g.fill();
    g.save(); roadShape(0); g.clip();
    speckle(g, laneL - c, L.stopY - road, laneR - laneL + 2 * c, L.ringB - L.stopY + road * 2, Math.round(W * H / 180), ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.18)', 'rgba(255,255,255,0.03)'], rnd, 2);
    g.restore();
    // Sidewalk: paving tiles
    const swY = L.queueY - c * 0.62, swH = c * 1.2;
    roundRect(g, sx0 - c * 0.2, swY + c * 0.08, sx1 - sx0 + c * 0.4, swH, c * 0.3); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fill();
    roundRect(g, sx0 - c * 0.2, swY, sx1 - sx0 + c * 0.4, swH, c * 0.3); g.fillStyle = '#c9c2b8'; g.fill();
    g.save(); roundRect(g, sx0 - c * 0.2, swY, sx1 - sx0 + c * 0.4, swH, c * 0.3); g.clip();
    const tile = c * 0.4;
    for (let ty = swY, row = 0; ty < swY + swH; ty += tile, row++) {
      for (let tx = sx0 - c * 0.2 - (row % 2) * tile / 2; tx < sx1 + c * 0.2; tx += tile) {
        g.fillStyle = rnd() < 0.5 ? '#d8d1c6' : '#cfc7bb';
        roundRect(g, tx + 1.5, ty + 1.5, tile - 3, tile - 3, 3); g.fill();
      }
    }
    g.restore();
    g.fillStyle = '#eef1f4'; g.fillRect(sx0 - c * 0.2, L.stopY - road / 2 - c * 0.08, sx1 - sx0 + c * 0.4, c * 0.1);
    // Lane line between the stops and the through lane
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = Math.max(2, c * 0.05); g.setLineDash([c * 0.35, c * 0.3]);
    g.beginPath(); g.moveTo(laneL, (L.laneY + L.stopY) / 2); g.lineTo(laneR, (L.laneY + L.stopY) / 2); g.stroke();
    g.setLineDash([c * 0.3, c * 0.3]); g.strokeStyle = 'rgba(255,214,90,0.45)'; g.lineWidth = Math.max(2, c * 0.04);
    roundRect(g, L.ringL, L.laneY, L.ringR - L.ringL, L.ringB - L.laneY, c * 0.7); g.stroke();
    g.setLineDash([]);
    // Stop bays: painted boxes with a number
    L.stops.forEach((x, i) => {
      g.strokeStyle = 'rgba(255,214,70,0.9)'; g.lineWidth = Math.max(2.5, c * 0.06);
      roundRect(g, x - L.stopW / 2 + c * 0.1, L.stopY - road * 0.42, L.stopW - c * 0.2, road * 0.84, c * 0.12); g.stroke();
      g.fillStyle = 'rgba(255,214,70,0.12)'; g.fill();
      g.fillStyle = 'rgba(255,214,70,0.75)';
      g.font = `700 ${Math.round(c * 0.32)}px ${Kit.FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(i + 1), x + L.stopW / 2 - c * 0.38, L.stopY + road * 0.2);
    });
    // The car park: a raised curb, darker asphalt and painted stalls
    roundRect(g, ox - c * 0.16, oy - c * 0.16 + c * 0.1, lw + c * 0.32, lh + c * 0.32, c * 0.28); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fill();
    roundRect(g, ox - c * 0.16, oy - c * 0.16, lw + c * 0.32, lh + c * 0.32, c * 0.28); g.fillStyle = '#e4e8ec'; g.fill();
    roundRect(g, ox - c * 0.06, oy - c * 0.06, lw + c * 0.12, lh + c * 0.12, c * 0.2);
    gr = g.createLinearGradient(0, oy, 0, oy + lh);
    gr.addColorStop(0, '#454c56'); gr.addColorStop(1, '#383e47');
    g.fillStyle = gr; g.fill();
    g.save(); roundRect(g, ox - c * 0.06, oy - c * 0.06, lw + c * 0.12, lh + c * 0.12, c * 0.2); g.clip();
    speckle(g, ox, oy, lw, lh, Math.round(lw * lh / 120), ['rgba(255,255,255,0.06)', 'rgba(0,0,0,0.2)'], rnd, 2);
    // inner shadow along the top and left
    gr = g.createLinearGradient(0, oy - c * 0.06, 0, oy + c * 0.3);
    gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(ox - c * 0.1, oy - c * 0.1, lw + c * 0.2, c * 0.4);
    g.restore();
    g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = Math.max(1.5, c * 0.035);
    for (let r = 1; r < lv.rows; r++) for (let k = 0; k < lv.cols; k++) { g.beginPath(); g.moveTo(ox + k * c + c * 0.18, oy + r * c); g.lineTo(ox + (k + 1) * c - c * 0.18, oy + r * c); g.stroke(); }
    for (let k = 1; k < lv.cols; k++) for (let r = 0; r < lv.rows; r++) { g.beginPath(); g.moveTo(ox + k * c, oy + r * c + c * 0.18); g.lineTo(ox + k * c, oy + (r + 1) * c - c * 0.18); g.stroke(); }
    // Town around it: houses in the lower corners, trees along the edges, flowers
    const leftW = L.ringL - road / 2 - c * 0.3, rightX = L.ringR + road / 2 + c * 0.3;
    const roofs = ['#e2574c', '#4e7cff', '#f29f3d', '#8a5cd8'], walls = ['#fff3dc', '#ffe1c2', '#e9f4ff', '#fde8ef'];
    const hh = Math.min(c * 1.7, H * 0.17), hy = H - hh - H * 0.07;
    if (leftW > c * 1.8) {
      house(g, leftW * 0.08, hy, Math.min(leftW * 0.42, hh * 1.3), hh, walls[0], roofs[0], rnd);
      house(g, leftW * 0.55, hy + hh * 0.18, Math.min(leftW * 0.38, hh * 1.1), hh * 0.82, walls[1], roofs[1], rnd);
      house(g, W - leftW * 0.5, hy, Math.min(leftW * 0.42, hh * 1.3), hh, walls[2], roofs[2], rnd);
      house(g, W - leftW * 0.95 + (rightX - (W - leftW)) * 0, hy + hh * 0.18, Math.min(leftW * 0.38, hh * 1.1), hh * 0.82, walls[3], roofs[3], rnd);
    }
    const topY = L.laneY + road / 2 + c * 0.75;
    const treeAt = [[L.ringL - road / 2 - c * 0.55, topY], [L.ringR + road / 2 + c * 0.55, topY], [c * 0.55, topY + c * 0.15], [W - c * 0.55, topY + c * 0.15],
      [L.ringL - road * 0.8, L.ringB + c * 0.3], [L.ringR + road * 0.8, L.ringB + c * 0.3]];
    treeAt.forEach(([x, y]) => { if (x > c * 0.4 && x < W - c * 0.4 && y < H - c * 0.6) tree(g, x, y, c * 0.75, rnd); });
    for (let k = 0; k < 40; k++) {
      const x = rnd() < 0.5 ? rnd() * leftW : W - rnd() * leftW, y = H * 0.38 + rnd() * H * 0.35;
      g.fillStyle = ['#ffd23f', '#ff6b9a', '#ffffff', '#b98cff'][k % 4];
      g.beginPath(); g.arc(x, y, c * 0.04, 0, Math.PI * 2); g.fill();
    }
    // Glass for the side panel and buttons (focus is drawn live)
    Kit.glass(g, L.panel.x, L.panel.y, L.panel.w, L.panel.h, 22, { tint: 'rgba(20,60,40,0.45)' });
    L.buttons.forEach((b) => Kit.glass(g, b.x, b.y, b.w, b.h, b.h / 2, { tint: 'rgba(20,60,40,0.45)' }));
    // Vignette
    const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.4, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,20,10,0)'); vg.addColorStop(1, 'rgba(0,20,10,0.45)');
    g.fillStyle = vg; g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
  }

  const sprites = new Map();
  // A toy vehicle facing right: glossy body, raised roof with a shine, glass with reflections, lights.
  function vehicleSprite(color, len) {
    const key = color + len;
    let s = sprites.get(key);
    if (s) return s;
    const c = L.c;
    const VL = len * c - c * 0.16, VW = c * 0.76, pad = c * 0.16;
    const { cv, g } = canvasOf(VL + pad * 2, VW + pad * 2);
    g.translate(VL / 2 + pad, VW / 2 + pad);
    const x0 = -VL / 2, y0 = -VW / 2, bus = len === 3;
    // Wheels
    g.fillStyle = '#1a1c22';
    const wx = bus ? [x0 + VL * 0.15, x0 + VL * 0.82] : [x0 + VL * 0.22, x0 + VL * 0.76];
    wx.forEach((x) => { roundRect(g, x - c * 0.14, y0 - c * 0.06, c * 0.28, VW + c * 0.12, c * 0.07); g.fill(); });
    // Body with a bevel
    const br = bus ? VW * 0.24 : VW * 0.4;
    roundRect(g, x0, y0, VL, VW, br);
    let gr = g.createLinearGradient(0, y0, 0, y0 + VW);
    gr.addColorStop(0, shade(color, 0.35)); gr.addColorStop(0.45, color); gr.addColorStop(1, shade(color, -0.35));
    g.fillStyle = gr; g.fill();
    g.lineWidth = Math.max(1.5, c * 0.035); g.strokeStyle = shade(color, -0.55); g.stroke();
    roundRect(g, x0 + c * 0.05, y0 + c * 0.05, VL - c * 0.1, VW - c * 0.1, br * 0.8);
    g.lineWidth = Math.max(1, c * 0.025); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.stroke();
    const glass = (x, y, w, h, r) => {
      roundRect(g, x, y, w, h, r);
      const wg = g.createLinearGradient(x, y, x + w, y + h);
      wg.addColorStop(0, '#bfe9ff'); wg.addColorStop(0.45, '#4f8fc9'); wg.addColorStop(1, '#1d3c66');
      g.fillStyle = wg; g.fill();
      g.save(); roundRect(g, x, y, w, h, r); g.clip();
      g.fillStyle = 'rgba(255,255,255,0.45)';
      g.beginPath(); g.moveTo(x + w * 0.15, y); g.lineTo(x + w * 0.45, y); g.lineTo(x + w * 0.2, y + h); g.lineTo(x - w * 0.1, y + h); g.closePath(); g.fill();
      g.restore();
    };
    if (bus) {
      glass(VL / 2 - c * 0.36, y0 + VW * 0.1, c * 0.24, VW * 0.8, c * 0.07);
      glass(x0 + c * 0.08, y0 + VW * 0.2, c * 0.1, VW * 0.6, c * 0.04);
      // side windows along both edges
      const n = 5, wl = (VL - c * 0.8) / n;
      for (let k = 0; k < n; k++) {
        glass(x0 + c * 0.3 + k * wl, y0 + VW * 0.06, wl - c * 0.06, VW * 0.14, c * 0.03);
        glass(x0 + c * 0.3 + k * wl, y0 + VW * 0.8, wl - c * 0.06, VW * 0.14, c * 0.03);
      }
      // roof
      roundRect(g, x0 + c * 0.26, y0 + VW * 0.24, VL - c * 0.66, VW * 0.52, c * 0.1);
      gr = g.createLinearGradient(0, y0 + VW * 0.24, 0, y0 + VW * 0.76);
      gr.addColorStop(0, shade(color, 0.5)); gr.addColorStop(1, shade(color, 0.05));
      g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.75)'; roundRect(g, x0 + c * 0.36, y0 + VW * 0.3, VL - c * 0.9, VW * 0.08, VW * 0.04); g.fill();
      g.fillStyle = shade(color, -0.25); roundRect(g, -c * 0.18, -VW * 0.14, c * 0.36, VW * 0.28, c * 0.05); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.4)'; g.fillRect(-c * 0.14, -VW * 0.1, c * 0.28, VW * 0.05);
    } else {
      glass(VL / 2 - c * 0.46, y0 + VW * 0.12, c * 0.22, VW * 0.76, c * 0.08);
      glass(x0 + c * 0.14, y0 + VW * 0.18, c * 0.14, VW * 0.64, c * 0.06);
      roundRect(g, x0 + c * 0.32, y0 + VW * 0.14, VL - c * 0.8, VW * 0.72, c * 0.16);
      gr = g.createLinearGradient(0, y0 + VW * 0.14, 0, y0 + VW * 0.86);
      gr.addColorStop(0, shade(color, 0.55)); gr.addColorStop(1, shade(color, 0.0));
      g.fillStyle = gr; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)'; roundRect(g, x0 + c * 0.4, y0 + VW * 0.22, VL - c * 0.98, VW * 0.12, VW * 0.06); g.fill();
    }
    // Lights
    [y0 + VW * 0.18, y0 + VW * 0.82].forEach((y) => {
      const lg = g.createRadialGradient(VL / 2 - c * 0.04, y, 0, VL / 2 - c * 0.04, y, c * 0.12);
      lg.addColorStop(0, '#fffbe0'); lg.addColorStop(0.5, 'rgba(255,240,160,0.7)'); lg.addColorStop(1, 'rgba(255,240,160,0)');
      g.fillStyle = lg; g.beginPath(); g.arc(VL / 2 - c * 0.04, y, c * 0.12, 0, Math.PI * 2); g.fill();
    });
    g.fillStyle = '#ff3b3b';
    [y0 + VW * 0.16, y0 + VW * 0.84].forEach((y) => { roundRect(g, x0 + 1, y - c * 0.05, c * 0.07, c * 0.1, c * 0.02); g.fill(); });
    // Mirrors
    g.fillStyle = shade(color, -0.3);
    [y0 - c * 0.06, y0 + VW - c * 0.02].forEach((y) => { roundRect(g, VL / 2 - c * (bus ? 0.38 : 0.5), y, c * 0.1, c * 0.08, c * 0.03); g.fill(); });
    // Its soft shadow, as a separate picture
    const sh = canvasOf(VL + pad * 2, VW + pad * 2);
    sh.g.translate(VL / 2 + pad, VW / 2 + pad);
    sh.g.shadowColor = 'rgba(0,0,0,0.55)'; sh.g.shadowBlur = c * 0.14;
    roundRect(sh.g, x0 + 2, y0 + 2, VL - 4, VW - 4, br); sh.g.fillStyle = 'rgba(0,0,0,0.4)'; sh.g.fill();
    s = { cv, shadow: sh.cv, w: VL + pad * 2, h: VW + pad * 2, VL, VW };
    sprites.set(key, s);
    return s;
  }
  // A cute little passenger: shirt and cap in their colour, round face, shadow.
  function personSprite(color) {
    const key = 'p' + color;
    let s = sprites.get(key);
    if (s) return s;
    const u = L.c * 0.26, w = u * 2.4, h = u * 3.2;
    const { cv, g } = canvasOf(w, h);
    const cx = w / 2, by = h - u * 0.35;
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(cx, by, u * 0.85, u * 0.28, 0, 0, Math.PI * 2); g.fill();
    // body
    g.beginPath(); g.ellipse(cx, by - u * 0.75, u * 0.85, u * 0.8, 0, 0, Math.PI * 2);
    let gr = g.createRadialGradient(cx - u * 0.35, by - u * 1.15, u * 0.1, cx, by - u * 0.75, u);
    gr.addColorStop(0, shade(color, 0.5)); gr.addColorStop(0.6, color); gr.addColorStop(1, shade(color, -0.35));
    g.fillStyle = gr; g.fill();
    g.lineWidth = Math.max(1, u * 0.08); g.strokeStyle = shade(color, -0.5); g.stroke();
    // head
    const hy = by - u * 1.85;
    g.beginPath(); g.arc(cx, hy, u * 0.68, 0, Math.PI * 2);
    gr = g.createRadialGradient(cx - u * 0.25, hy - u * 0.3, u * 0.1, cx, hy, u * 0.7);
    gr.addColorStop(0, '#ffe9d6'); gr.addColorStop(1, '#f2b48c');
    g.fillStyle = gr; g.fill();
    g.strokeStyle = '#b97a55'; g.lineWidth = Math.max(1, u * 0.06); g.stroke();
    // cap
    g.beginPath(); g.arc(cx, hy - u * 0.05, u * 0.7, Math.PI * 1.02, Math.PI * 1.98); g.closePath();
    gr = g.createLinearGradient(0, hy - u * 0.75, 0, hy);
    gr.addColorStop(0, shade(color, 0.45)); gr.addColorStop(1, shade(color, -0.1));
    g.fillStyle = gr; g.fill();
    g.fillStyle = shade(color, -0.25); roundRect(g, cx - u * 0.1, hy - u * 0.12, u * 0.85, u * 0.16, u * 0.08); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.6)'; g.beginPath(); g.ellipse(cx - u * 0.25, hy - u * 0.5, u * 0.18, u * 0.08, -0.4, 0, Math.PI * 2); g.fill();
    // face
    g.fillStyle = '#2a2233';
    [-1, 1].forEach((k) => { g.beginPath(); g.ellipse(cx + k * u * 0.24, hy + u * 0.18, u * 0.08, u * 0.11, 0, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = '#fff';
    [-1, 1].forEach((k) => { g.beginPath(); g.arc(cx + k * u * 0.24 + u * 0.03, hy + u * 0.14, u * 0.03, 0, Math.PI * 2); g.fill(); });
    g.fillStyle = 'rgba(255,120,120,0.45)';
    [-1, 1].forEach((k) => { g.beginPath(); g.ellipse(cx + k * u * 0.42, hy + u * 0.36, u * 0.12, u * 0.07, 0, 0, Math.PI * 2); g.fill(); });
    g.strokeStyle = '#2a2233'; g.lineWidth = Math.max(1, u * 0.07); g.lineCap = 'round';
    g.beginPath(); g.arc(cx, hy + u * 0.33, u * 0.14, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    s = { cv, w, h, foot: by };
    sprites.set(key, s);
    return s;
  }
  function glowSprite(color) {
    const key = 'gl' + color;
    let s = sprites.get(key);
    if (s) return s;
    const { cv, g } = canvasOf(64, 64);
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, Kit.rgba(color, 0.9)); rg.addColorStop(0.35, Kit.rgba(color, 0.35)); rg.addColorStop(1, Kit.rgba(color, 0));
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    sprites.set(key, cv);
    return cv;
  }
  function starSprite(color) {
    const key = 'st' + color;
    let s = sprites.get(key);
    if (s) return s;
    const { cv, g } = canvasOf(64, 64);
    const rg = g.createRadialGradient(32, 32, 0, 32, 32, 20);
    rg.addColorStop(0, Kit.rgba(color, 0.7)); rg.addColorStop(1, Kit.rgba(color, 0));
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#ffffff'; g.beginPath();
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4, rr = k % 2 ? 5 : 30; g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr); }
    g.closePath(); g.fill();
    sprites.set(key, cv);
    return cv;
  }
  function raysSprite() {
    let s = sprites.get('rays');
    if (s) return s;
    const { cv, g } = canvasOf(512, 512);
    const rg = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    rg.addColorStop(0, 'rgba(255,240,170,0.55)'); rg.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = rg;
    for (let k = 0; k < 14; k++) { const a = k * Math.PI * 2 / 14; g.beginPath(); g.moveTo(256, 256); g.arc(256, 256, 256, a - 0.11, a + 0.11); g.closePath(); g.fill(); }
    sprites.set('rays', cv);
    return cv;
  }
  function drawVehicle(c, i, x, y, a, extra = {}) {
    const v = lv.vs[i], s = vehicleSprite(COLORS[v.color], v.len);
    const cell = L.c;
    // shadow falls down-right whatever way the vehicle faces
    c.save();
    c.translate(x + cell * 0.07, y + cell * 0.11); c.rotate(a);
    if (extra.scale) c.scale(extra.scale, extra.scale);
    c.drawImage(s.shadow, -s.w / 2, -s.h / 2, s.w, s.h);
    c.restore();
    c.save();
    c.translate(x, y); c.rotate(a);
    if (extra.scale) c.scale(extra.scale, extra.scale);
    c.drawImage(s.cv, -s.w / 2, -s.h / 2, s.w, s.h);
    if (extra.arrow) {
      // A chevron on the roof says which way it will drive.
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = Math.max(3, cell * 0.08); c.lineCap = 'round'; c.lineJoin = 'round';
      c.shadowColor = 'rgba(0,0,0,0.35)'; c.shadowBlur = 0; c.shadowOffsetY = 1.5;
      const ax = v.len === 3 ? cell * 0.12 : -cell * 0.04;
      c.beginPath(); c.moveTo(ax - cell * 0.1, -cell * 0.15); c.lineTo(ax + cell * 0.07, 0); c.lineTo(ax - cell * 0.1, cell * 0.15); c.stroke();
      c.shadowOffsetY = 0;
    }
    if (extra.seats) {
      // Seats on the roof fill with little heads as passengers get on.
      const cap = CAP[v.len], cols = cap / 2, sp = cell * 0.27;
      for (let k = 0; k < cap; k++) {
        const col = Math.floor(k / 2), row = k % 2;
        const sx = (col - (cols - 1) / 2) * sp - cell * 0.03, sy = (row - 0.5) * sp;
        c.beginPath(); c.arc(sx, sy, cell * 0.1, 0, Math.PI * 2);
        if (k < extra.seats.filled) {
          c.fillStyle = COLORS[v.color]; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#fff'; c.stroke();
          c.fillStyle = '#ffe2c8'; c.beginPath(); c.arc(sx, sy, cell * 0.055, 0, Math.PI * 2); c.fill();
        } else { c.fillStyle = 'rgba(0,0,0,0.28)'; c.fill(); }
      }
    }
    c.restore();
  }

  // ---------- Effects of our own: star sparkles and light flashes, drawn additively ----------
  const sparks = [], flashes = [];
  function sparkle(x, y, color, n = 8, speed = 1) {
    for (let k = 0; k < n && sparks.length < 140; k++) {
      const a = Math.random() * Math.PI * 2, v = (80 + Math.random() * 220) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * speed, life: 0, max: 0.45 + Math.random() * 0.45,
        size: L.c * (0.3 + Math.random() * 0.35), color, rot: Math.random() * 3 });
    }
  }
  function flash(x, y, color, size) { flashes.push({ x, y, color, size, t: 0 }); }
  function stepFx(dt) {
    for (let k = sparks.length - 1; k >= 0; k--) {
      const p = sparks[k];
      p.life += dt;
      if (p.life > p.max) { sparks.splice(k, 1); continue; }
      p.vy += 420 * dt; p.vx *= 1 - dt * 1.5;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4;
    }
    for (let k = flashes.length - 1; k >= 0; k--) { flashes[k].t += dt; if (flashes[k].t > 0.45) flashes.splice(k, 1); }
  }
  function drawFx(c) {
    c.globalCompositeOperation = 'lighter';
    for (const f of flashes) {
      const q = f.t / 0.45, s = f.size * (0.6 + q * 1.2);
      c.globalAlpha = (1 - q) * 0.9;
      c.drawImage(glowSprite(f.color), f.x - s, f.y - s, s * 2, s * 2);
    }
    for (const p of sparks) {
      const q = p.life / p.max, s = p.size * (1 - q * 0.6);
      c.globalAlpha = 1 - q;
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.drawImage(starSprite(p.color), -s, -s, s * 2, s * 2);
      c.restore();
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
  }

  // ---------- Small drawn icons and UI pieces ----------
  function iconRestart(c, x, y, s, color) {
    c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = s * 0.16; c.lineCap = 'round';
    c.beginPath(); c.arc(x, y, s * 0.42, -Math.PI * 0.35, Math.PI * 1.35); c.stroke();
    const a = -Math.PI * 0.35, ex = x + Math.cos(a) * s * 0.42, ey = y + Math.sin(a) * s * 0.42;
    c.beginPath(); c.moveTo(ex + s * 0.2, ey - s * 0.12); c.lineTo(ex - s * 0.12, ey - s * 0.24); c.lineTo(ex - s * 0.02, ey + s * 0.12); c.closePath(); c.fill();
    c.restore();
  }
  function iconStar(c, x, y, s, on) {
    c.save(); c.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, r = k % 2 ? s * 0.42 : s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    c.closePath();
    const g = c.createLinearGradient(0, y - s, 0, y + s);
    if (on) { g.addColorStop(0, '#fff6b0'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#f08a1c'); } else { g.addColorStop(0, '#6b7a72'); g.addColorStop(1, '#3d4a44'); }
    c.fillStyle = g; c.fill(); c.lineWidth = s * 0.1; c.lineJoin = 'round'; c.strokeStyle = on ? '#9a4f0a' : '#26302b'; c.stroke();
    if (on) { c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(x - s * 0.2, y - s * 0.3, s * 0.18, s * 0.09, -0.5, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
  function iconCrown(c, x, y, s) {
    c.save();
    c.beginPath();
    c.moveTo(x - s * 0.5, y + s * 0.3); c.lineTo(x - s * 0.55, y - s * 0.25); c.lineTo(x - s * 0.22, y + s * 0.02);
    c.lineTo(x, y - s * 0.38); c.lineTo(x + s * 0.22, y + s * 0.02); c.lineTo(x + s * 0.55, y - s * 0.25); c.lineTo(x + s * 0.5, y + s * 0.3); c.closePath();
    const g = c.createLinearGradient(0, y - s * 0.4, 0, y + s * 0.3);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.5, '#ffc93c'); g.addColorStop(1, '#d9861c');
    c.fillStyle = g; c.fill(); c.lineWidth = s * 0.06; c.strokeStyle = '#7a4210'; c.stroke();
    c.fillStyle = '#ff4d6d'; c.beginPath(); c.arc(x, y + s * 0.1, s * 0.08, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function iconSpeaker(c, x, y, s, muted) {
    c.save(); c.fillStyle = 'rgba(255,255,255,0.85)'; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = s * 0.08; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - s * 0.4, y - s * 0.14); c.lineTo(x - s * 0.2, y - s * 0.14); c.lineTo(x + s * 0.05, y - s * 0.36);
    c.lineTo(x + s * 0.05, y + s * 0.36); c.lineTo(x - s * 0.2, y + s * 0.14); c.lineTo(x - s * 0.4, y + s * 0.14); c.closePath(); c.fill();
    if (muted) { c.beginPath(); c.moveTo(x + s * 0.18, y - s * 0.15); c.lineTo(x + s * 0.45, y + s * 0.15); c.moveTo(x + s * 0.45, y - s * 0.15); c.lineTo(x + s * 0.18, y + s * 0.15); c.stroke(); }
    else { [0.22, 0.38].forEach((r) => { c.beginPath(); c.arc(x + s * 0.05, y, s * r, -0.8, 0.8); c.stroke(); }); }
    c.restore();
  }
  function ribbon(c, x, y, w, h, text, color) {
    // A banner with folded tails, its colour lit from above.
    const tail = h * 0.55;
    c.save();
    c.fillStyle = shade(color, -0.45);
    [-1, 1].forEach((k) => {
      c.beginPath();
      c.moveTo(x + k * (w / 2 - tail * 0.2), y - h * 0.2); c.lineTo(x + k * (w / 2 + tail), y - h * 0.2);
      c.lineTo(x + k * (w / 2 + tail * 0.55), y + h * 0.25); c.lineTo(x + k * (w / 2 + tail), y + h * 0.7);
      c.lineTo(x + k * (w / 2 - tail * 0.2), y + h * 0.7); c.closePath(); c.fill();
    });
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 14; c.shadowOffsetY = 5;
    roundRect(c, x - w / 2, y - h / 2, w, h, h * 0.22);
    const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
    g.addColorStop(0, shade(color, 0.35)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.25));
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(c, x - w / 2 + 6, y - h / 2 + 4, w - 12, h * 0.3, h * 0.15); c.fill();
    c.restore();
    Kit.title(c, text, x, y + 2, Math.round(h * 0.55), { color: '#ffffff' });
  }
  function focusRing(c, x, y, w, h, r, t) {
    const p = 0.5 + 0.5 * Math.sin(t * 5);
    c.save();
    roundRect(c, x, y, w, h, r); c.fillStyle = `rgba(255,210,63,${0.14 + 0.08 * p})`; c.fill();
    c.shadowColor = '#ffd23f'; c.shadowBlur = 16 + 12 * p;
    c.lineWidth = 3 + p; c.strokeStyle = '#ffe680';
    roundRect(c, x - 2, y - 2, w + 4, h + 4, r + 2); c.stroke();
    c.restore();
  }
  function iconUndo(c, x, y, s, color) {
    // A hook arrow pointing back.
    c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = s * 0.15; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath(); c.moveTo(x - s * 0.18, y - s * 0.16); c.lineTo(x + s * 0.12, y - s * 0.16);
    c.arc(x + s * 0.12, y + s * 0.08, s * 0.24, -Math.PI / 2, Math.PI / 2); c.lineTo(x - s * 0.2, y + s * 0.32); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.45, y - s * 0.16); c.lineTo(x - s * 0.15, y - s * 0.38); c.lineTo(x - s * 0.15, y + s * 0.06); c.closePath(); c.fill();
    c.restore();
  }
  function pill(c, b, label, on, t, icon, baked, dim) {
    if (!baked) Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: on ? 'rgba(255,210,63,0.30)' : 'rgba(20,60,40,0.55)' });
    if (on) focusRing(c, b.x, b.y, b.w, b.h, b.h / 2, t);
    if (dim) c.globalAlpha = 0.45;
    const fs = Math.round(Math.min(b.h * 0.4, b.w * 0.12));
    c.font = `600 ${fs}px ${Kit.UI}`;
    const tw = c.measureText(label).width, iw = icon ? fs * 1.3 : 0;
    const x0 = b.x + b.w / 2 - (tw + iw) / 2;
    if (icon) icon(c, x0 + fs * 0.45, b.y + b.h / 2, fs * 1.1, '#fff');
    c.fillStyle = '#fff'; c.textAlign = 'left';
    c.fillText(label, x0 + iw, b.y + b.h / 2 + 1);
    c.textAlign = 'center';
    c.globalAlpha = 1;
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
    if (Math.abs(sx - from.x) > c * 2.4) p.path.push({ x: sx - sgn * c * 2.3, y: L.laneY });
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
  // Keep a gap on the road: a vehicle waits behind one going the same way just ahead of it.
  // (A short time limit stops two from waiting on each other for ever.)
  function yieldTo(i, p, dt) {
    const fx = Math.cos(p.a), fy = Math.sin(p.a), mine = lv.vs[i].len * L.c / 2;
    let blocked = false;
    for (let k = 0; k < vis.length && !blocked; k++) {
      const q = vis[k];
      if (k === i || (q.state !== 'drive' && q.state !== 'leave')) continue;
      if (q.state === 'drive' && q.stop < 0 && q.seg >= q.path.length - 1) continue; // parked in line for a stop
      if (Math.cos(q.a - p.a) < 0.4) continue;
      const dx = q.x - p.x, dy = q.y - p.y, fwd = dx * fx + dy * fy, lat = Math.abs(dy * fx - dx * fy);
      if (fwd > 0 && lat < L.c * 0.6 && fwd < mine + lv.vs[k].len * L.c / 2 + L.c * 0.3) blocked = true;
    }
    if (!blocked) { p.waitT = 0; return false; }
    p.waitT = (p.waitT || 0) + dt;
    if (p.waitT > 0.9) return false;
    p.speed = Math.min(p.speed, L.c * 2);
    return true;
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
    moves.pop(); undos++; rebuild(); save(); sfx.move();
    if (typeof focus !== 'number' || !S.inLot[focus]) pickFocus();
  }
  function restart() { if (moves.length) undos++; moves = []; rebuild(); save(); pickFocus(); sfx.pick(); }
  function nope() { nopeT = performance.now() / 1000; sfx.nope(); }
  function pickFocus() {
    const occ = occupancy(lv, S.inLot);
    const free = lv.vs.map((_, i) => i).filter((i) => S.inLot[i] && wayOut(lv, occ, i).clear);
    const any = lv.vs.map((_, i) => i).filter((i) => S.inLot[i]);
    focus = free.length ? free[0] : any.length ? any[0] : 'undo';
  }
  function next() {
    level = Kit.store.get('busrush.level', level + 1);
    lv = generate(level); moves = []; undos = 0; introT = 0;
    layout(Kit.W, Kit.H);
    rebuild(); pickFocus(); save(); sfx.pick();
  }

  function update(dt) {
    if (!vis) return;
    introT += dt;
    stepFx(dt);
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
        if (!yieldTo(i, p, dt) && follow(p, dt) && p.stop >= 0) {
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
          p.path = [{ x: p.x, y: p.y }, { x: p.x + h * L.c * 2.6, y: L.laneY }, { x: h > 0 ? L.W + L.c * 3 : -L.c * 3, y: L.laneY }];
          Kit.noise({ dur: 0.5, vol: 0.06, freq: 300, q: 1, sweep: 2.5 });
        }
      } else if (p.state === 'leave') {
        if (!yieldTo(i, p, dt) && follow(p, dt)) p.state = 'gone';
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
        sparkle(p.x, p.y, COLORS[lv.vs[w.v].color], 2, 0.4);
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
        Kit.burst(p.x, p.y, COLORS[lv.vs[e.v].color], 8, 0.6);
        sparkle(p.x, p.y, '#fff3b0', 8, 0.8); flash(p.x, p.y, COLORS[lv.vs[e.v].color], L.c * 2.2);
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
    if (!vis) return;
    c.drawImage(scene, -MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);
    const cell = L.c, font = L.font;
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Exit preview for the vehicle in focus: a glowing dotted track, red when blocked.
    const showFocus = !won && !lost && !Kit.touchFirst();
    if (showFocus && typeof focus === 'number' && S.inLot[focus] && vis[focus].state === 'lot') {
      const v = lv.vs[focus], occ = occupancy(lv, S.inLot), w = wayOut(lv, occ, focus);
      const [dr, dc] = DIRS[v.dir], h = cellCenter(v.r, v.c);
      const len = (w.clear ? w.free + 0.9 : w.free + 0.5) * cell;
      c.save();
      c.setLineDash([cell * 0.12, cell * 0.16]); c.lineDashOffset = -t * cell * 1.2;
      c.lineWidth = cell * 0.11; c.lineCap = 'round';
      c.shadowColor = w.clear ? '#7dffb0' : '#ff5a6e'; c.shadowBlur = 10;
      c.strokeStyle = w.clear ? 'rgba(170,255,200,0.95)' : 'rgba(255,100,120,0.95)';
      c.beginPath(); c.moveTo(h.x + dc * cell * 0.45, h.y + dr * cell * 0.45); c.lineTo(h.x + dc * len, h.y + dr * len); c.stroke();
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
        let sc = 1;
        if (p.state === 'full') sc = 1 + Math.sin(Math.min(1, p.t / 0.3) * Math.PI) * 0.1;
        else if (focused) sc = 1.05 + Math.sin(t * 5) * 0.015;
        if (focused) {
          const v = lv.vs[i], s = vehicleSprite(COLORS[v.color], v.len), pulse = 0.5 + 0.5 * Math.sin(t * 6);
          c.save(); c.translate(x, y); c.rotate(p.a);
          roundRect(c, -s.VL / 2 - 6, -s.VW / 2 - 6, s.VL + 12, s.VW + 12, s.VW * 0.45);
          c.fillStyle = `rgba(255,230,120,${0.18 + 0.12 * pulse})`; c.fill();
          c.shadowColor = '#ffd23f'; c.shadowBlur = 16 + pulse * 14;
          c.lineWidth = 4 + pulse; c.strokeStyle = '#ffe680'; c.stroke();
          c.restore();
        }
        drawVehicle(c, i, x, y, p.a, { arrow: p.state === 'lot' || p.state === 'bump', seats: p.state === 'lot' || p.state === 'bump' ? null : { filled: p.filled }, scale: sc });
      });
    }

    // The queue on the sidewalk; front on the left. The one at the front bounces, ready to go.
    const right = L.stops[STOPS - 1] + L.stopW / 2;
    let hidden = 0;
    const feet = L.queueY + cell * 0.36;
    for (let k = vq; k < lv.queue.length; k++) {
      const x = queueX(k);
      if (x > right - cell * 0.9) { hidden = lv.queue.length - k; break; }
      const s = personSprite(COLORS[lv.queue[k]]);
      const hop = k === vq ? Math.abs(Math.sin(t * 6)) : Math.max(0, Math.sin(t * 3 + k * 0.9)) * 0.25;
      const squash = 1 - hop * 0.06;
      c.drawImage(s.cv, x - s.w / 2 / squash, feet - s.foot * squash - hop * cell * 0.12, s.w / squash, s.h * squash);
    }
    if (hidden > 0) {
      const bx = right - cell * 0.45;
      roundRect(c, bx - cell * 0.48, L.queueY - cell * 0.3, cell * 0.96, cell * 0.6, cell * 0.3);
      c.fillStyle = 'rgba(30,40,50,0.75)'; c.fill();
      c.font = `700 ${Math.round(Math.max(font * 0.8, cell * 0.32))}px ${Kit.FONT}`; c.fillStyle = '#fff';
      c.fillText(`+${hidden}`, bx, L.queueY + 1);
    }
    // Walking passengers hop from the queue onto their vehicle.
    for (const w of walkers) {
      const q = clamp((now - w.t0) / 0.3, 0, 1), e = ease.inOut(q);
      const p = vis[w.v], s = personSprite(COLORS[w.color]);
      const x = lerp(w.from.x, p.x, e), y = lerp(feet, p.y + cell * 0.2, e) - Math.sin(q * Math.PI) * cell * 0.6;
      const k = 1 - q * 0.5;
      c.drawImage(s.cv, x - s.w * k / 2, y - s.foot * k, s.w * k, s.h * k);
    }

    // Side panel: level, people waiting, stop meter
    const P = L.panel;
    Kit.title(c, `Level ${level}`, L.lx, P.y + font * 1.1, Math.round(font * 1.45), { color: '#a6ffcb' });
    const leftN = lv.queue.length - vq;
    const ps = personSprite(COLORS[0]);
    c.drawImage(ps.cv, L.lx - font * 2.6, P.y + font * 2.05, font * 0.9, font * 0.9 * ps.h / ps.w);
    c.font = `600 ${Math.round(font)}px ${Kit.UI}`; c.fillStyle = '#fff'; c.textAlign = 'left';
    c.fillText(`${leftN} waiting`, L.lx - font * 1.4, P.y + font * 2.65);
    c.textAlign = 'center';
    const used = stopRes.filter((s) => s >= 0).length;
    c.font = `500 ${Math.round(font * 0.78)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText('Stops', L.lx, P.y + font * 3.85);
    const pip = Math.min(font * 0.9, P.w / 7);
    for (let k = 0; k < STOPS; k++) {
      const x = L.lx + (k - 2) * pip * 1.25, y = P.y + font * 4.75;
      roundRect(c, x - pip / 2, y - pip * 0.35, pip, pip * 0.7, pip * 0.2);
      c.fillStyle = k < used ? (used >= STOPS - 1 ? '#ff6b85' : '#ffd23f') : 'rgba(0,0,0,0.35)'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
    }

    // Buttons
    L.buttons.forEach((b) => {
      const on = showFocus && focus === b.id;
      const label = b.id === 'restart' && now - confirmT < 3 ? 'OK again = sure' : b.id === 'undo' ? 'Undo' : 'Restart';
      pill(c, b, label, on, t, b.id === 'undo' ? iconUndo : iconRestart, true, b.id === 'undo' && !moves.length);
    });

    drawFx(c);

    const m = muteBox();
    iconSpeaker(c, m.x + m.w / 2, m.y + m.h / 2, m.h * 0.6, Kit.muted);

    // How to play
    const tip = Kit.touchFirst() ? 'Tap a vehicle to drive it out  ·  same colours get on' : 'Arrows pick a vehicle  ·  OK drives it out  ·  Back exits';
    c.font = `500 ${Math.round(font * 0.8)}px ${Kit.UI}`;
    const tw = c.measureText(tip).width + font * 1.6;
    roundRect(c, W / 2 - tw / 2, H * 0.968 - font * 0.72, tw, font * 1.44, font * 0.72);
    c.fillStyle = 'rgba(10,30,20,0.6)'; c.fill();
    c.fillStyle = '#fff'; c.fillText(tip, W / 2, H * 0.968 + 1);
    if (introT < 7 && level <= 2 && !moves.length) {
      c.globalAlpha = Math.min(1, introT * 2, (7 - introT) * 2);
      c.font = `600 ${Math.round(font * 0.85)}px ${Kit.UI}`;
      c.fillStyle = '#fff59d';
      ['Send a vehicle the', 'colour of the first', 'passenger in line!'].forEach((s, k) => c.fillText(s, L.lx, P.y + P.h + font * (1.2 + k * 1.15)));
      c.globalAlpha = 1;
    }
    // Level banner
    if (introT < 2.4 && !won && !lost) {
      const k = introT < 0.5 ? ease.back(introT / 0.5) : introT > 2 ? 1 - ease.inOut((introT - 2) / 0.4) : 1;
      c.globalAlpha = clamp(k, 0, 1);
      ribbon(c, W / 2, lerp(-H * 0.1, L.laneY, k), Math.min(W * 0.34, cell * 5.5), Math.max(44, H * 0.085), `Level ${level}`, '#2fbf71');
      c.globalAlpha = 1;
    }

    // Win / stuck panels
    if ((won || lost) && endT2) {
      const a = clamp((now - endT2 - 0.3) / 0.4, 0, 1);
      if (a <= 0) return;
      c.fillStyle = `rgba(2,16,8,${0.6 * a})`; c.fillRect(0, 0, W, H);
      const pw = Math.min(W * 0.84, 560), ph = Math.min(H * 0.52, 310);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      if (won) {
        const rs = Math.min(W, H) * 0.95;
        c.save(); c.rotate(t * 0.25); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.7 * a;
        c.drawImage(raysSprite(), -rs / 2, -rs / 2, rs, rs); c.restore();
      }
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 28);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      g.addColorStop(0, won ? '#1f8f5a' : '#8a2e45'); g.addColorStop(1, won ? '#0b4a2e' : '#4a1022');
      c.fillStyle = g; c.fill();
      Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 28, { tint: 'rgba(255,255,255,0.05)', edge: 'rgba(255,230,150,0.7)' });
      ribbon(c, 0, -ph / 2 + 4, pw * 0.8, Math.max(46, ph * 0.2), won ? 'Everybody aboard!' : 'Stops are full!', won ? '#2fbf71' : '#e2475f');
      if (won) {
        const stars = undos === 0 ? 3 : undos <= 2 ? 2 : 1;
        const since = now - endT2 - 0.5;
        for (let i = 0; i < 3; i++) {
          const q = clamp((since - i * 0.25) / 0.35, 0, 1);
          const s = ph * 0.13 * (i === 1 ? 1.25 : 1) * ease.back(q);
          if (s > 0) iconStar(c, (i - 1) * ph * 0.34, -ph * 0.05 - (i === 1 ? ph * 0.05 : 0), s, i < stars);
          if (q > 0 && q < 0.15 && i < stars && !panelFx[i]) { panelFx[i] = true; sfx.chime(); }
        }
        c.font = `500 ${Math.round(ph * 0.07)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,255,255,0.8)';
        c.fillText(undos ? `${undos} undo${undos > 1 ? 's' : ''}` : 'No undos. Perfect!', 0, ph * 0.15);
        pill(c, { x: -pw * 0.3, y: ph * 0.25, w: pw * 0.6, h: Math.max(46, ph * 0.17) }, Kit.touchFirst() ? 'Tap for next level' : 'OK  Next level', true, t, null);
      } else {
        c.font = `500 ${Math.round(ph * 0.07)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,255,255,0.9)';
        c.fillText('Nobody in the queue fits the', 0, -ph * 0.1);
        c.fillText('waiting vehicles.', 0, -ph * 0.1 + ph * 0.09);
        panelButtons().forEach((b, i) => {
          const bb = { x: b.x - W / 2, y: b.y - H / 2, w: b.w, h: b.h };
          pill(c, bb, i ? 'Restart' : 'Undo', panelSel === i && !Kit.touchFirst(), t, i ? iconRestart : iconUndo);
        });
      }
      c.restore();
    }
  }
  const panelFx = [];

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
