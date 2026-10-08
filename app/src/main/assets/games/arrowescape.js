// Arrow Escape: a board packed with arrows, some short and straight, some long and bent like snakes.
// Send an arrow off and it slides along its own body and out of the board the way its head points,
// but only if nothing stands in its way; a blocked arrow bumps and bounces back and costs a heart.
// Clear the board to win. Every board is built backwards (each arrow placed with a clear way out
// past the arrows already there), so a removal order always exists.
// Remote: arrows move the cursor over the pieces, OK sends the focused arrow. Hint and Restart sit
// under the board. Touch and mouse: tap an arrow.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const COLORS = ['#ff4d6d', '#ffb703', '#3bceac', '#4ea8de', '#b388ff', '#ff7eb6', '#ff8c42', '#7ee081', '#22d3ee'];
  // Directions: 0 up, 1 right, 2 down, 3 left.
  const DR = [-1, 0, 1, 0], DC = [0, 1, 0, -1];
  const LIVES = 3;

  // ---------- Levels: bigger, denser boards with longer, bendier arrows ----------
  function params(lv) {
    const R = Math.min(10, 4 + Math.ceil(lv / 2));
    const C = Math.min(16, R + 1 + Math.floor(lv / 3));
    const maxLen = lv <= 1 ? 2 : lv <= 2 ? 3 : Math.min(9, 3 + Math.floor(lv / 2));
    return { R, C, maxLen, bend: lv >= 3 ? Math.min(0.45, 0.2 + lv * 0.02) : 0, fill: Math.min(0.97, 0.8 + lv * 0.015) };
  }
  const rnd = (n) => Math.floor(Math.random() * n);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /**
   * Builds a board in reverse: every new arrow needs a clear run from its head to the edge past the
   * arrows already placed. Removing them newest-first then always works, so the board is solvable.
   */
  function generate(lv) {
    const P = params(lv), { R, C } = P;
    const occ = new Int16Array(R * C).fill(-1);
    const arrows = [];
    const inside = (r, c) => r >= 0 && c >= 0 && r < R && c < C;
    let filled = 0, fails = 0;
    while (filled < P.fill * R * C && fails < R * C * 4) {
      const empties = [];
      for (let i = 0; i < R * C; i++) if (occ[i] < 0) empties.push(i);
      if (!empties.length) break;
      const h = empties[rnd(empties.length)], hr = Math.floor(h / C), hc = h % C;
      let placed = false;
      for (const d of shuffle([0, 1, 2, 3])) {
        // The head's way out must be clear.
        const ray = new Set();
        let r = hr + DR[d], c = hc + DC[d], clear = true;
        while (inside(r, c)) { if (occ[r * C + c] >= 0) { clear = false; break; } ray.add(r * C + c); r += DR[d]; c += DC[d]; }
        if (!clear) continue;
        // Grow the body backwards from the head, never onto its own way out.
        const target = 2 + rnd(P.maxLen - 1);
        const cells = [h], used = new Set([h]);
        let cr = hr, cc = hc, dir = d;
        while (cells.length < target) {
          let opts = [dir];
          if (cells.length >= 2 && P.bend && Math.random() < P.bend) opts = shuffle([(dir + 1) % 4, (dir + 3) % 4]).concat(dir);
          else if (cells.length >= 2 && P.bend) opts = [dir].concat(shuffle([(dir + 1) % 4, (dir + 3) % 4]));
          let moved = false;
          for (const o of opts) {
            const nr = cr - DR[o], nc = cc - DC[o], k = nr * C + nc;
            if (!inside(nr, nc) || occ[k] >= 0 || used.has(k) || ray.has(k)) continue;
            cells.push(k); used.add(k); cr = nr; cc = nc; dir = o; moved = true; break;
          }
          if (!moved) break;
        }
        // Single-cell arrows only now and then, mostly to fill the last gaps.
        if (cells.length < 2 && Math.random() < (empties.length > R * C * 0.3 ? 0.9 : 0.4)) continue;
        cells.reverse(); // tail first, head last
        // A colour unlike the neighbours'.
        const near = new Set();
        for (const k of cells) for (let q = 0; q < 4; q++) {
          const nr = Math.floor(k / C) + DR[q], nc = (k % C) + DC[q];
          if (inside(nr, nc) && occ[nr * C + nc] >= 0) near.add(arrows[occ[nr * C + nc]].color);
        }
        const choices = COLORS.map((_, i) => i).filter((i) => !near.has(i));
        const color = choices.length ? choices[rnd(choices.length)] : rnd(COLORS.length);
        const id = arrows.length;
        arrows.push({ cells: cells.map((k) => [Math.floor(k / C), k % C]), dir: d, color });
        for (const k of cells) occ[k] = id;
        filled += cells.length;
        placed = true;
        break;
      }
      if (!placed) fails++;
    }
    return { R, C, arrows };
  }

  // ---------- State ----------
  let level = Kit.store.get('arrowescape.level', 1);
  let board, gone, lives, mistakes, hints, occ, won, wonT, failed, failT;
  let cursor = { kind: 'cell', r: 0, c: 0 };
  let anims = [], hintId = -1, hintT = 0, flash = {}, introT = 0, heartPop = 0;
  let dirty = true;

  function rebuildOcc() {
    occ = new Int16Array(board.R * board.C).fill(-1);
    board.arrows.forEach((a, id) => { if (!gone[id]) for (const [r, c] of a.cells) occ[r * board.C + c] = id; });
  }
  function save() { Kit.store.set('arrowescape.game', { level, board, gone, lives, mistakes, hints }); }
  function begin(again) {
    if (!again) board = generate(level);
    gone = board.arrows.map(() => false);
    lives = LIVES; mistakes = 0; hints = 0; won = false; failed = false; anims = []; hintId = -1; flash = {};
    rebuildOcc(); dirty = true;
    if (!again || cursor.kind !== 'btn') {
      const a = board.arrows[board.arrows.length - 1];
      cursor = { kind: 'cell', r: a.cells[a.cells.length - 1][0], c: a.cells[a.cells.length - 1][1] };
      snapCursor();
    }
    layout();
    save();
  }

  // ---------- Layout ----------
  let L = { buttons: [] };
  const BUTTONS = [{ id: 'hint', label: '💡  Hint' }, { id: 'restart', label: '⟳  Restart' }];
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W || !board) return;
    const top = H * 0.18, bottom = H * 0.805;
    const cs = Math.floor(Math.min((bottom - top) / (board.R + 0.6), (W * 0.9) / (board.C + 0.6), 96));
    const bw = board.C * cs, bh = board.R * cs;
    L.cs = cs; L.bx = Math.round((W - bw) / 2); L.by = Math.round(top + (bottom - top - bh) / 2); L.bw = bw; L.bh = bh;
    const btw = Math.min(W * 0.3, 240), bth = Math.max(44, Math.min(H * 0.075, 60)), gap = Math.min(24, W * 0.025);
    const total = BUTTONS.length * btw + (BUTTONS.length - 1) * gap;
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: (W - total) / 2 + i * (btw + gap), y: H * 0.835, w: btw, h: bth }));
    dirty = true;
  }
  Kit.onResize(layout);
  const px = (r, c) => ({ x: L.bx + (c + 0.5) * L.cs, y: L.by + (r + 0.5) * L.cs });

  // ---------- Moves ----------
  /** How far the arrow's head can travel before it hits something (Infinity: it gets out). */
  function blockOf(id) {
    const a = board.arrows[id], [hr, hc] = a.cells[a.cells.length - 1];
    let r = hr + DR[a.dir], c = hc + DC[a.dir], d = 0;
    while (r >= 0 && c >= 0 && r < board.R && c < board.C) {
      const o = occ[r * board.C + c];
      if (o >= 0 && o !== id) return { d, by: o, r, c };
      d++; r += DR[a.dir]; c += DC[a.dir];
    }
    return { d: Infinity, rayLen: d };
  }
  /** The arrow's whole route in cells: its body, then straight on well past the edge of the screen. */
  function routeOf(id) {
    const a = board.arrows[id], pts = a.cells.map(([r, c]) => [r, c]);
    let [r, c] = pts[pts.length - 1];
    const extra = Math.ceil(Math.max(Kit.W, Kit.H) / L.cs) + a.cells.length + 3;
    for (let i = 0; i < extra; i++) { r += DR[a.dir]; c += DC[a.dir]; pts.push([r, c]); }
    return pts;
  }
  const busy = (id) => anims.some((m) => m.id === id);
  const arrowAt = (r, c) => (r >= 0 && c >= 0 && r < board.R && c < board.C ? occ[r * board.C + c] : -1);

  function fire(id) {
    if (id < 0 || gone[id] || busy(id) || won || failed || lives <= 0) return;
    const a = board.arrows[id], b = blockOf(id);
    if (id === hintId) hintId = -1;
    if (b.d === Infinity) {
      // Free: it whooshes away along its body and off the board.
      gone[id] = true;
      for (const [r, c] of a.cells) occ[r * board.C + c] = -1;
      const route = routeOf(id), dist = route.length - 1;
      anims.push({ id, kind: 'fly', t: 0, s: 0, dur: 0.42 + Math.min(0.35, (b.rayLen + a.cells.length) * 0.025), route, dist, len: a.cells.length });
      whoosh(a.cells.length);
      const h = px(...a.cells[a.cells.length - 1]);
      Kit.burst(h.x, h.y, COLORS[a.color], 6, 0.5);
      snapCursor();
      if (gone.every(Boolean)) { won = true; wonT = performance.now() / 1000 + 0.6; Kit.record('arrowescape', level); }
      save();
    } else {
      // Blocked: it runs up to the arrow in the way, bumps it and slides back. One heart gone.
      lives--; mistakes++;
      anims.push({ id, kind: 'bump', t: 0, dur: 0.32 + b.d * 0.05, route: routeOf(id), peak: b.d + 0.24, by: b.by, at: b, len: a.cells.length });
      if (lives <= 0) { failed = true; failT = performance.now() / 1000 + 0.9; }
      save();
    }
    dirty = true;
  }
  function whoosh(len) {
    Kit.noise({ dur: 0.38, vol: 0.2, freq: 500, q: 0.9, sweep: 6 });
    Kit.noise({ dur: 0.22, vol: 0.08, freq: 3000, q: 0.6, sweep: 2.5, type: 'highpass' });
    Kit.tone(300 + Math.min(len, 8) * 30, { type: 'triangle', dur: 0.24, vol: 0.12, slide: 2.6 });
  }
  function thud() {
    Kit.tone(130, { type: 'sine', dur: 0.2, vol: 0.45, slide: 0.55 });
    Kit.noise({ dur: 0.08, vol: 0.15, freq: 900, q: 1.2 });
    Kit.tone(220, { type: 'square', dur: 0.12, vol: 0.05, at: 0.05, slide: 0.7 });
  }
  function hint() {
    if (won || failed) return;
    let best = -1, bd = Infinity;
    const cp = cursorPoint();
    board.arrows.forEach((a, id) => {
      if (gone[id] || busy(id) || blockOf(id).d !== Infinity) return;
      const h = px(...a.cells[a.cells.length - 1]);
      const d = Math.hypot(h.x - cp.x, h.y - cp.y);
      if (d < bd) { bd = d; best = id; }
    });
    if (best < 0) { sfx.nope(); return; }
    hintId = best; hintT = performance.now() / 1000; hints++;
    const a = board.arrows[best], [r, c] = a.cells[a.cells.length - 1];
    cursor = { kind: 'cell', r, c };
    sfx.chime(); save(); dirty = true;
  }
  function restart() { begin(true); sfx.pick(); }
  function next() { level++; Kit.store.set('arrowescape.level', level); begin(false); sfx.pick(); }
  function press(id) { if (id === 'hint') hint(); else if (id === 'restart') restart(); }

  // ---------- Cursor: moves between arrow cells and the buttons, nearest in the pressed direction ----------
  function cursorPoint() {
    if (cursor.kind === 'btn') { const b = L.buttons[cursor.i]; return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; }
    return px(cursor.r, cursor.c);
  }
  function focusedId() { return cursor.kind === 'cell' ? arrowAt(cursor.r, cursor.c) : -1; }
  function snapCursor() {
    // After an arrow leaves, hop to the nearest arrow still on the board.
    if (cursor.kind !== 'cell' || arrowAt(cursor.r, cursor.c) >= 0) return;
    let best = null, bd = Infinity;
    for (let r = 0; r < board.R; r++) for (let c = 0; c < board.C; c++) {
      if (arrowAt(r, c) < 0) continue;
      const d = Math.hypot(r - cursor.r, c - cursor.c);
      if (d < bd) { bd = d; best = { r, c }; }
    }
    if (best) cursor = { kind: 'cell', r: best.r, c: best.c };
  }
  function moveCursor(dir) {
    const cur = cursorPoint(), self = focusedId();
    const items = [];
    for (let r = 0; r < board.R; r++) for (let c = 0; c < board.C; c++) {
      const id = arrowAt(r, c);
      if (id >= 0 && id !== self) items.push({ kind: 'cell', r, c, ...px(r, c) });
    }
    L.buttons.forEach((b, i) => items.push({ kind: 'btn', i, x: b.x + b.w / 2, y: b.y + b.h / 2 }));
    let best = null, score = Infinity;
    for (const it of items) {
      if (it.kind === 'btn' && cursor.kind === 'btn' && it.i === cursor.i) continue;
      const dx = it.x - cur.x, dy = it.y - cur.y;
      let main, side;
      if (dir === 'left') { if (dx >= -1) continue; main = -dx; side = Math.abs(dy); }
      else if (dir === 'right') { if (dx <= 1) continue; main = dx; side = Math.abs(dy); }
      else if (dir === 'up') { if (dy >= -1) continue; main = -dy; side = Math.abs(dx); }
      else { if (dy <= 1) continue; main = dy; side = Math.abs(dx); }
      const s = main + side * 2.5;
      if (s < score) { score = s; best = it; }
    }
    if (best) { cursor = best.kind === 'btn' ? { kind: 'btn', i: best.i } : { kind: 'cell', r: best.r, c: best.c }; sfx.move(); }
  }

  const ready = (t0) => performance.now() / 1000 > t0 + 0.5;
  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && !repeat && ready(wonT) && !anims.length) next(); return; }
    if (failed) { if (k === 'ok' && !repeat && ready(failT)) restart(); return; }
    if (k === 'restart') { restart(); return; }
    if (k === 'undo') { hint(); return; }
    if (k === 'ok') {
      if (repeat) return;
      if (cursor.kind === 'btn') press(L.buttons[cursor.i].id); else fire(focusedId());
      return;
    }
    moveCursor(k);
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (won) { if (ready(wonT) && !anims.length) next(); return; }
      if (failed) { if (ready(failT)) restart(); return; }
      const bi = L.buttons.findIndex((b) => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (bi >= 0) { cursor = { kind: 'btn', i: bi }; press(L.buttons[bi].id); return; }
      const c = Math.floor((e.x - L.bx) / L.cs), r = Math.floor((e.y - L.by) / L.cs);
      const id = arrowAt(r, c);
      if (id >= 0) { cursor = { kind: 'cell', r, c }; fire(id); }
    },
  });

  // ---------- Drawing ----------
  // A point [s] cells along a route (fractions slide between cells; below 0 reaches back past the tail).
  function along(route, s) {
    const i = clamp(Math.floor(s), 0, route.length - 2), f = s - i;
    const a = route[i], b = route[i + 1];
    return { x: L.bx + (lerp(a[1], b[1], f) + 0.5) * L.cs, y: L.by + (lerp(a[0], b[0], f) + 0.5) * L.cs };
  }
  // A resting arrow's route: its cells plus one step ahead, so even a one-cell arrow knows its heading.
  function restRoute(a) {
    const [r, c] = a.cells[a.cells.length - 1];
    return a.cells.concat([[r + DR[a.dir], c + DC[a.dir]]]);
  }
  // The arrow's outline as points, tail to head, when its tail is [s] cells along the route.
  const pts = [];
  function shapePoints(route, s, len) {
    pts.length = 0;
    const s0 = s - 0.3, s1 = s + len - 1;
    pts.push(along(route, s0));
    for (let i = Math.ceil(s0 + 1e-6); i < s1; i++) pts.push(along(route, i));
    pts.push(along(route, s1));
    const i = clamp(Math.floor(s1), 0, route.length - 2);
    const dr = route[i + 1][0] - route[i][0], dc = route[i + 1][1] - route[i][1];
    return { dx: dc, dy: dr };
  }
  function strokePts(c, n) {
    c.beginPath();
    c.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n; i++) c.lineTo(pts[i].x, pts[i].y);
  }
  function headPath(c, h, d, cs, grow = 0) {
    const tip = cs * 0.36 + grow, back = cs * 0.1 + grow * 0.6, half = cs * 0.25 + grow;
    const nx = -d.dy, ny = d.dx;
    c.beginPath();
    c.moveTo(h.x + d.dx * tip, h.y + d.dy * tip);
    c.lineTo(h.x - d.dx * back + nx * half, h.y - d.dy * back + ny * half);
    c.lineTo(h.x - d.dx * back * 0.2, h.y - d.dy * back * 0.2);
    c.lineTo(h.x - d.dx * back - nx * half, h.y - d.dy * back - ny * half);
    c.closePath();
  }
  /** One arrow: a glossy rounded tube with a pointed head. [glow] draws a coloured halo behind it. */
  function drawArrow(c, route, s, len, color, { glow = null, glowA = 0, alpha = 1, tint = null } = {}) {
    const cs = L.cs, d = shapePoints(route, s, len), n = pts.length, h = pts[n - 1];
    const w = Math.max(5, cs * 0.24);
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.globalAlpha = alpha;
    if (glow) {
      c.strokeStyle = rgba(glow, glowA); c.fillStyle = rgba(glow, glowA);
      c.lineWidth = w + cs * 0.3; strokePts(c, n); c.stroke();
      headPath(c, h, d, cs, cs * 0.12); c.fill();
      c.lineWidth = cs * 0.12; c.stroke();
    }
    // Drop shadow
    c.save(); c.translate(0, cs * 0.06);
    c.strokeStyle = 'rgba(0,0,0,0.32)'; c.fillStyle = 'rgba(0,0,0,0.32)';
    c.lineWidth = w + cs * 0.08; strokePts(c, n); c.stroke();
    headPath(c, h, d, cs, cs * 0.03); c.fill();
    c.restore();
    const col = tint || color;
    // Rim, body, shine
    c.strokeStyle = shade(col, -0.5); c.fillStyle = shade(col, -0.5);
    c.lineWidth = w + cs * 0.07; strokePts(c, n); c.stroke();
    headPath(c, h, d, cs, cs * 0.035); c.fill(); c.lineWidth = cs * 0.05; c.stroke();
    c.strokeStyle = col; c.fillStyle = col;
    c.lineWidth = w; strokePts(c, n); c.stroke();
    headPath(c, h, d, cs); c.fill();
    c.strokeStyle = shade(col, 0.5);
    c.lineWidth = Math.max(1.5, w * 0.32); strokePts(c, n - 1); c.lineTo(h.x - d.dx * cs * 0.05, h.y - d.dy * cs * 0.05); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.arc(h.x + d.dx * cs * 0.06 - d.dy * cs * 0.06, h.y + d.dy * cs * 0.06 + d.dx * cs * 0.06, cs * 0.045, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 1;
  }

  // The resting arrows are drawn once into a picture and reused until something changes.
  const layer = document.createElement('canvas');
  function paintLayer() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(Kit.W * dpr)), h = Math.max(1, Math.round(Kit.H * dpr));
    if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
    const c = layer.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { bx, by, bw, bh, cs } = L;
    // Board tray with soft dots on every cell.
    roundRect(c, bx - cs * 0.3, by - cs * 0.3, bw + cs * 0.6, bh + cs * 0.6, cs * 0.4);
    c.fillStyle = 'rgba(6,14,36,0.62)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(140,200,255,0.25)'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.12)';
    for (let r = 0; r < board.R; r++) for (let col = 0; col < board.C; col++) {
      c.beginPath(); c.arc(bx + (col + 0.5) * cs, by + (r + 0.5) * cs, Math.max(1.5, cs * 0.05), 0, Math.PI * 2); c.fill();
    }
    board.arrows.forEach((a, id) => {
      if (gone[id] || busy(id) || id === hintId) return;
      drawArrow(c, restRoute(a), 0, a.cells.length, COLORS[a.color]);
    });
    dirty = false;
  }

  function update(dt) {
    introT += dt;
    heartPop = Math.max(0, heartPop - dt * 2.5);
    for (let i = anims.length - 1; i >= 0; i--) {
      const m = anims[i];
      m.t += dt;
      if (m.kind === 'bump' && !m.hit && m.t >= m.dur * 0.38) {
        m.hit = true; thud(); Kit.shake(6, 0.2); heartPop = 1;
        flash[m.by] = performance.now() / 1000;
        const p = px(m.at.r, m.at.c), a = board.arrows[m.id];
        Kit.burst(p.x, p.y, '#ffffff', 8, 0.5);
        Kit.float(lives > 0 ? '−1 ♥' : 'Out of hearts', p.x, p.y - L.cs * 0.6, { color: '#ff6b81', size: Math.max(26, L.cs * 0.55) });
        if (lives <= 0) setTimeout(() => sfx.over(), 400);
        void a;
      }
      if (m.kind === 'fly' && Math.random() < 0.6) {
        const p = along(m.route, m.s + m.len - 1);
        if (p.x > -20 && p.y > -20 && p.x < Kit.W + 20 && p.y < Kit.H + 20) Kit.burst(p.x, p.y, COLORS[board.arrows[m.id].color], 1, 0.3);
      }
      if (m.t >= m.dur) {
        anims.splice(i, 1); dirty = true;
        if (won && !anims.length) { sfx.win(); Kit.confetti(140); wonT = performance.now() / 1000; }
      }
    }
    for (const k in flash) if (performance.now() / 1000 - flash[k] > 0.6) { delete flash[k]; dirty = true; }
    if (hintId >= 0 && performance.now() / 1000 - hintT > 4) { hintId = -1; dirty = true; }
  }

  function drawHeart(c, x, y, s, full, pop) {
    c.save(); c.translate(x, y); c.scale(s * (1 + pop * 0.3), s * (1 + pop * 0.3));
    c.beginPath();
    c.moveTo(0, 0.35);
    c.bezierCurveTo(-0.55, -0.05, -0.5, -0.55, -0.25, -0.55);
    c.bezierCurveTo(-0.1, -0.55, 0, -0.45, 0, -0.32);
    c.bezierCurveTo(0, -0.45, 0.1, -0.55, 0.25, -0.55);
    c.bezierCurveTo(0.5, -0.55, 0.55, -0.05, 0, 0.35);
    c.closePath();
    if (full) {
      const g = c.createLinearGradient(0, -0.55, 0, 0.35);
      g.addColorStop(0, '#ff8fa3'); g.addColorStop(0.5, '#ff3b5c'); g.addColorStop(1, '#b3122f');
      c.fillStyle = g; c.fill();
      c.lineWidth = 0.06; c.strokeStyle = '#7a0b1f'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.7)';
      c.beginPath(); c.ellipse(-0.24, -0.33, 0.1, 0.06, -0.6, 0, Math.PI * 2); c.fill();
    } else {
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill();
      c.lineWidth = 0.06; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
    }
    c.restore();
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000, cs = L.cs;
    Kit.background(c, t, '#1b2a6b', '#070b24', 'rgba(90,150,255,0.09)');
    if (dirty) paintLayer();
    c.drawImage(layer, 0, 0, W, H);

    // Title, hearts and how many arrows are left
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${Math.round(Math.min(H * 0.07, 48))}px system-ui, sans-serif`;
    c.lineJoin = 'round'; c.lineWidth = 6; c.strokeStyle = 'rgba(5,10,40,0.8)';
    c.strokeText(`Level ${level}`, W / 2, H * 0.07);
    const lg = c.createLinearGradient(0, H * 0.035, 0, H * 0.105);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#9cc7ff');
    c.fillStyle = lg; c.fillText(`Level ${level}`, W / 2, H * 0.07);
    const hs = Math.min(H * 0.05, 36), hy = H * 0.137;
    const left = gone.filter((g) => !g).length;
    c.font = `700 ${Math.round(Math.min(H * 0.034, 26))}px system-ui, sans-serif`;
    const label = `${left} arrow${left === 1 ? '' : 's'} left`;
    const lw = c.measureText(label).width, rowW = LIVES * hs * 1.15 + hs * 0.8 + lw;
    let x = W / 2 - rowW / 2 + hs * 0.5;
    for (let i = 0; i < LIVES; i++) { drawHeart(c, x, hy + hs * 0.05, hs, i < lives, i === lives ? heartPop : 0); x += hs * 1.15; }
    c.textAlign = 'left'; c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText(label, x + hs * 0.3, hy);
    c.textAlign = 'center';

    // Arrows that are moving, hinted or flashing, on top of the resting picture
    const focus = !won && !failed && !Kit.touchFirst() ? focusedId() : -1;
    for (const k in flash) {
      const a = board.arrows[k];
      if (!a || gone[k] || busy(+k)) continue;
      const f = 1 - (now - flash[k]) / 0.6;
      const sx = Math.sin((now - flash[k]) * 50) * cs * 0.06 * f;
      c.save(); c.translate(sx, 0);
      drawArrow(c, restRoute(a), 0, a.cells.length, COLORS[a.color], { glow: '#ff3045', glowA: 0.6 * f, tint: f > 0.5 ? '#ff4060' : null });
      c.restore();
    }
    if (hintId >= 0 && !gone[hintId] && !busy(hintId)) {
      const a = board.arrows[hintId], nudge = Math.max(0, Math.sin((now - hintT) * 7)) * 0.16;
      drawArrow(c, restRoute(a), nudge, a.cells.length, COLORS[a.color], { glow: '#ffe45c', glowA: 0.45 + 0.25 * Math.sin(t * 8) });
    }
    if (focus >= 0 && !busy(focus)) {
      const a = board.arrows[focus];
      const route = focus === hintId ? null : restRoute(a);
      if (route) drawArrow(c, route, 0, a.cells.length, COLORS[a.color], { glow: '#fff3a0', glowA: 0.7 + 0.25 * Math.sin(t * 7) });
      const p = px(cursor.r, cursor.c);
      c.lineWidth = 3; c.strokeStyle = `rgba(255,236,120,${0.75 + 0.25 * Math.sin(t * 7)})`;
      roundRect(c, p.x - cs * 0.47, p.y - cs * 0.47, cs * 0.94, cs * 0.94, cs * 0.2); c.stroke();
    }
    for (const m of anims) {
      const a = board.arrows[m.id], col = COLORS[a.color];
      if (m.kind === 'fly') {
        const k = clamp(m.t / m.dur, 0, 1);
        m.s = m.dist * (0.18 * k + 0.82 * k * k);
        // Motion trail: fading ghosts behind the tail.
        for (let g = 3; g >= 1; g--) {
          const back = Math.min(m.s, g * 0.9 * Math.min(1, k * 4));
          if (back > 0.05) drawTrail(c, m.route, m.s - back, back + 0.3, col, 0.16 * (4 - g) / 3);
        }
        drawArrow(c, m.route, m.s, m.len, col, { alpha: k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1 });
      } else {
        const k = clamp(m.t / m.dur, 0, 1);
        const s = k < 0.38 ? m.peak * ease.out(k / 0.38) : m.peak * (1 - ease.back((k - 0.38) / 0.62) * 1);
        drawArrow(c, m.route, Math.max(-0.08, s), m.len, col, { glow: k > 0.38 ? '#ff3045' : null, glowA: 0.5 * (1 - k) });
      }
    }

    // Buttons
    L.buttons.forEach((b, i) => {
      const on = cursor.kind === 'btn' && cursor.i === i && !won && !failed && !Kit.touchFirst();
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
      c.font = `800 ${Math.round(Math.min(b.h * 0.42, b.w * 0.13))}px system-ui, sans-serif`;
      c.fillStyle = on ? '#2b1600' : '#fff';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    });

    // How to play, always on screen (the very first seconds of the first levels explain the rule)
    const fs = Math.round(Math.max(18, Math.min(H * 0.032, 26)));
    const intro = introT < 7 && level <= 2 && !mistakes && gone.every((g) => !g);
    c.font = `${intro ? 700 : 600} ${fs}px system-ui, sans-serif`;
    c.fillStyle = intro ? `rgba(255,245,157,${0.6 + 0.4 * Math.sin(t * 4)})` : 'rgba(255,255,255,0.55)';
    const tip = intro ? 'Each arrow flies the way its head points, if nothing is in its way!'
      : Kit.touchFirst() ? 'Tap an arrow to send it off · a blocked arrow costs a heart'
        : 'Arrows pick an arrow · OK sends it off · Blocked costs a heart · Back exits';
    c.fillText(tip, W / 2, H * 0.955, W * 0.94);

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if (won && !anims.length && now > wonT + 0.3) panel(c, clamp((now - wonT - 0.3) / 0.4, 0, 1), true);
    else if (failed && now > failT) panel(c, clamp((now - failT) / 0.4, 0, 1), false);
  }
  function drawTrail(c, route, s, len, color, a) {
    const d = shapePoints(route, s + 0.3, len); void d;
    c.globalAlpha = a; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = color; c.lineWidth = L.cs * 0.42;
    strokePts(c, pts.length); c.stroke();
    c.globalAlpha = 1;
  }
  function panel(c, a, win) {
    const W = Kit.W, H = Kit.H;
    c.fillStyle = `rgba(3,6,24,${0.62 * a})`; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.84, 540), ph = Math.min(H * 0.52, 310);
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 28);
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    if (win) { g.addColorStop(0, '#3d6bff'); g.addColorStop(1, '#1a2a8a'); } else { g.addColorStop(0, '#c2304f'); g.addColorStop(1, '#5a0f2a'); }
    c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd60a'; c.stroke();
    c.fillStyle = '#fff'; c.font = `900 ${Math.round(ph * 0.15)}px system-ui, sans-serif`;
    c.fillText(win ? 'Board cleared!' : 'Out of hearts!', 0, -ph * 0.27);
    if (win) {
      const stars = Math.max(1, 3 - mistakes);
      c.font = `${Math.round(ph * 0.17)}px system-ui, sans-serif`;
      c.fillText('⭐'.repeat(stars) + '☆'.repeat(3 - stars), 0, -ph * 0.05);
      c.font = `700 ${Math.round(ph * 0.08)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(mistakes ? `${mistakes} bump${mistakes > 1 ? 's' : ''}` : 'No bumps. Perfect!', 0, ph * 0.13);
    } else {
      c.font = `700 ${Math.round(ph * 0.085)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.88)';
      c.fillText('Look for an arrow with a clear way out.', 0, ph * 0.02, pw * 0.9);
    }
    c.font = `700 ${Math.round(ph * 0.085)}px system-ui, sans-serif`;
    c.fillStyle = '#fff59d';
    c.fillText(Kit.touchFirst() ? (win ? 'Tap for the next level' : 'Tap to try again') : (win ? 'Press OK for the next level' : 'Press OK to try again'), 0, ph * 0.32);
    c.restore();
  }

  // ---------- Start: carry on with the saved board, or deal a new one ----------
  const saved = Kit.store.get('arrowescape.game', null);
  if (saved && saved.level === level && saved.board && saved.gone && saved.lives > 0 && saved.gone.some((g) => !g)) {
    board = saved.board; gone = saved.gone; lives = saved.lives; mistakes = saved.mistakes || 0; hints = saved.hints || 0;
    won = false; failed = false; rebuildOcc();
  } else if (saved && saved.level === level && saved.board && saved.lives <= 0) {
    board = saved.board; begin(true); // ran out of hearts last time: the same board again
  } else begin(false);
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  snapCursor();
  Kit.canvas.focus();
  if (level > 1) Kit.record('arrowescape', level - 1);
})();
