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
  // Neon gas colours for the light-tubes.
  const COLORS = ['#ff3d7f', '#ffb627', '#2dffb0', '#3db8ff', '#b26bff', '#ff5cf0', '#ff7a2e', '#9bff4d', '#2ef2ff'];
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
    if (!again) { board = generate(level); bannerT = performance.now() / 1000 + 0.15; }
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
  const BUTTONS = [{ id: 'hint', text: 'Hint' }, { id: 'restart', text: 'Restart' }];
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W || !board) return;
    const top = H * 0.18, bottom = H * 0.805;
    const cs = Math.floor(Math.min((bottom - top) / (board.R + 0.6), (W * 0.9) / (board.C + 0.6), 96));
    const bw = board.C * cs, bh = board.R * cs;
    L.cs = cs; L.bx = Math.round((W - bw) / 2); L.by = Math.round(top + (bottom - top - bh) / 2); L.bw = bw; L.bh = bh;
    const btw = Math.min(W * 0.3, 240), bth = Math.max(44, Math.min(H * 0.075, 60)), gap = Math.min(24, W * 0.025);
    const total = BUTTONS.length * btw + (BUTTONS.length - 1) * gap;
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: (W - total) / 2 + i * (btw + gap), y: H * 0.838, w: btw, h: bth }));
    dirty = true; scene = null; boardPic = null;
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
      sparkle(h.x, h.y, COLORS[a.color], 8, 0.6); ring(h.x, h.y, COLORS[a.color], 0.7);
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
  // Look: a neon city at night over a glowing sci-fi grid. The arrows are glass light-tubes full of
  // coloured gas with a white-hot core, chrome tail caps and polished metal arrowheads.
  // Everything heavy (scene, board, resting arrows, sprites) is painted once and reused as a picture.
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  function makeCanvas(w, h) {
    const cv = document.createElement('canvas'), d = dprNow();
    cv.width = Math.max(1, Math.ceil(w * d)); cv.height = Math.max(1, Math.ceil(h * d));
    const c = cv.getContext('2d'); c.scale(d, d);
    return [cv, c];
  }
  function seeded(s) { return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

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
    const tip = cs * 0.38 + grow, back = cs * 0.12 + grow * 0.6, half = cs * 0.27 + grow;
    const nx = -d.dy, ny = d.dx;
    c.beginPath();
    c.moveTo(h.x + d.dx * tip, h.y + d.dy * tip);
    c.lineTo(h.x - d.dx * back + nx * half, h.y - d.dy * back + ny * half);
    c.lineTo(h.x - d.dx * back * 0.15, h.y - d.dy * back * 0.15);
    c.lineTo(h.x - d.dx * back - nx * half, h.y - d.dy * back - ny * half);
    c.closePath();
  }
  /** One arrow: a neon glass tube with a chrome cap and a metal head. [glow] adds a pulsing halo. */
  function drawArrow(c, route, s, len, color, { glow = null, glowA = 0, alpha = 1, tint = null, lift = 0 } = {}) {
    const cs = L.cs, d = shapePoints(route, s, len), n = pts.length, h = pts[n - 1];
    const w = Math.max(5, cs * 0.2), col = tint || color;
    const nx = -d.dy, ny = d.dx, half = cs * 0.27;
    c.save();
    c.globalAlpha = alpha; c.lineCap = 'round'; c.lineJoin = 'round';
    // Contact shadow on the board (further away when lifted)
    c.save(); c.translate(cs * 0.03 + lift * 0.3, cs * 0.08 + lift);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.fillStyle = 'rgba(0,0,0,0.55)';
    c.lineWidth = w * 1.5; strokePts(c, n); c.stroke();
    headPath(c, h, d, cs, cs * 0.02); c.fill();
    c.restore();
    if (lift) c.translate(0, -lift);
    // Neon bloom, added light
    c.globalCompositeOperation = 'lighter';
    if (glow) {
      c.strokeStyle = rgba(glow, glowA); c.fillStyle = rgba(glow, glowA);
      c.lineWidth = w * 3.2; strokePts(c, n); c.stroke();
      headPath(c, h, d, cs, cs * 0.14); c.fill();
    }
    c.strokeStyle = rgba(col, 0.06); c.lineWidth = w * 4.2; strokePts(c, n); c.stroke();
    c.strokeStyle = rgba(col, 0.09); c.lineWidth = w * 3; strokePts(c, n); c.stroke();
    c.strokeStyle = rgba(col, 0.16); c.lineWidth = w * 2; strokePts(c, n); c.stroke();
    c.globalCompositeOperation = 'source-over';
    // Glass tube: dark rim, glowing gas, bright core, a line of reflected light
    c.strokeStyle = shade(col, -0.62); c.lineWidth = w * 1.3; strokePts(c, n); c.stroke();
    c.strokeStyle = col; c.lineWidth = w; strokePts(c, n); c.stroke();
    c.strokeStyle = shade(col, 0.5); c.lineWidth = w * 0.55; strokePts(c, n); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.92)'; c.lineWidth = Math.max(1.2, w * 0.2); strokePts(c, n); c.stroke();
    c.save(); c.translate(-w * 0.24, -w * 0.24);
    c.strokeStyle = 'rgba(255,255,255,0.32)'; c.lineWidth = Math.max(1, w * 0.13); strokePts(c, n); c.stroke();
    c.restore();
    // Chrome tail cap
    const t0 = pts[0], cr = w * (len > 1 ? 0.78 : 0.5);
    const mg = c.createLinearGradient(t0.x - cr, t0.y - cr, t0.x + cr, t0.y + cr);
    mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.45, '#9aa3b8'); mg.addColorStop(0.6, '#4a5168'); mg.addColorStop(1, '#d4dae8');
    c.beginPath(); c.arc(t0.x, t0.y, cr, 0, Math.PI * 2); c.fillStyle = mg; c.fill();
    c.lineWidth = 1.2; c.strokeStyle = '#151826'; c.stroke();
    c.beginPath(); c.arc(t0.x, t0.y, cr * 0.42, 0, Math.PI * 2); c.fillStyle = shade(col, 0.3); c.fill();
    // Polished metal head with a glowing inlay
    headPath(c, h, d, cs, cs * 0.035); c.fillStyle = '#0d101c'; c.fill();
    const hg = c.createLinearGradient(h.x + nx * half, h.y + ny * half, h.x - nx * half, h.y - ny * half);
    hg.addColorStop(0, '#f8fbff'); hg.addColorStop(0.38, '#b9c2d6'); hg.addColorStop(0.55, '#565e78'); hg.addColorStop(1, '#e3e8f3');
    headPath(c, h, d, cs); c.fillStyle = hg; c.fill();
    headPath(c, { x: h.x + d.dx * cs * 0.02, y: h.y + d.dy * cs * 0.02 }, d, cs, -cs * 0.12); c.fillStyle = col; c.fill();
    c.globalCompositeOperation = 'lighter';
    headPath(c, { x: h.x + d.dx * cs * 0.02, y: h.y + d.dy * cs * 0.02 }, d, cs, -cs * 0.15); c.fillStyle = rgba(col, 0.55); c.fill();
    c.globalCompositeOperation = 'source-over';
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(h.x + d.dx * cs * 0.12 + nx * cs * 0.06, h.y + d.dy * cs * 0.12 + ny * cs * 0.06, Math.max(1.2, cs * 0.03), 0, Math.PI * 2); c.fill();
    c.restore();
  }
  function drawTrail(c, route, s, len, color, a) {
    shapePoints(route, s + 0.3, len);
    c.save();
    c.globalCompositeOperation = 'lighter'; c.globalAlpha = a; c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = color; c.lineWidth = L.cs * 0.5; strokePts(c, pts.length); c.stroke();
    c.strokeStyle = '#ffffff'; c.lineWidth = L.cs * 0.12; strokePts(c, pts.length); c.stroke();
    c.restore();
  }

  // ---------- The scene: a neon city skyline over a glowing grid floor (painted once per size) ----------
  let scene = null;
  function paintScene() {
    const W = Kit.W, H = Kit.H, R = seeded(2026);
    const [cv, c] = makeCanvas(W, H);
    const hz = H * 0.64, sx = W * 0.5;
    let g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#02030c'); g.addColorStop(0.45, '#0b0a2c'); g.addColorStop(0.8, '#260c48'); g.addColorStop(1, '#55145e');
    c.fillStyle = g; c.fillRect(0, 0, W, hz + 1);
    for (let i = 0; i < 220; i++) {
      const s = R() * 1.6 + 0.4;
      c.fillStyle = `rgba(${200 + R() * 55 | 0},${200 + R() * 55 | 0},255,${0.15 + R() * 0.6})`;
      c.fillRect(R() * W, R() * hz * 0.75, s, s);
    }
    // Horizon glow and a striped sunset disc
    let rg = c.createRadialGradient(sx, hz, 0, sx, hz, W * 0.65);
    rg.addColorStop(0, 'rgba(255,70,180,0.5)'); rg.addColorStop(0.35, 'rgba(150,40,170,0.22)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    const sr = Math.min(W, H) * 0.36;
    const [sun, sc] = makeCanvas(sr * 2, sr);
    g = sc.createLinearGradient(0, 0, 0, sr);
    g.addColorStop(0, '#ffe08a'); g.addColorStop(0.5, '#ff6f91'); g.addColorStop(1, '#c42fc0');
    sc.beginPath(); sc.arc(sr, sr, sr, Math.PI, 0); sc.closePath(); sc.fillStyle = g; sc.fill();
    sc.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 7; i++) { const y = sr * (0.45 + i * 0.085), hgt = 2 + i * 1.6; sc.fillRect(0, y, sr * 2, hgt); }
    c.save(); c.shadowColor = '#ff4fb0'; c.shadowBlur = 60; c.drawImage(sun, sx - sr, hz - sr, sr * 2, sr); c.restore();
    // Skyline, back to front, with lit windows, antenna lights and neon signs
    const layers = [
      { col: '#1d1145', lo: 0.12, hi: 0.3, lit: 0.12, a: 0.55 },
      { col: '#120c30', lo: 0.08, hi: 0.24, lit: 0.22, a: 0.75 },
      { col: '#080718', lo: 0.05, hi: 0.17, lit: 0.3, a: 0.95 },
    ];
    const WIN = ['#7ef9ff', '#ffd27a', '#ff7ad9', '#b6a4ff'];
    layers.forEach((Ly, li) => {
      let x = -20 + R() * 30;
      while (x < W + 20) {
        const bw = W * (0.022 + R() * 0.05), bh = H * (Ly.lo + R() * (Ly.hi - Ly.lo)), top = hz - bh;
        g = c.createLinearGradient(0, top, 0, hz);
        g.addColorStop(0, shade(Ly.col, 0.12)); g.addColorStop(1, Ly.col);
        c.fillStyle = g;
        c.beginPath();
        if (R() < 0.3) { c.moveTo(x, hz); c.lineTo(x, top + bw * 0.3); c.lineTo(x + bw / 2, top); c.lineTo(x + bw, top + bw * 0.3); c.lineTo(x + bw, hz); }
        else c.rect(x, top, bw, bh);
        c.fill();
        // Rim light from the sunset
        c.fillStyle = `rgba(255,120,220,${0.12 + li * 0.05})`; c.fillRect(x + bw - 1.5, top + 2, 1.5, bh - 2);
        const ws = Math.max(2, Math.round(H * 0.0045)), gap = ws * 2.2;
        for (let wy = top + gap; wy < hz - gap; wy += gap) for (let wx = x + gap * 0.6; wx < x + bw - gap * 0.6; wx += gap) {
          if (R() > Ly.lit) continue;
          c.fillStyle = rgba(WIN[(R() * WIN.length) | 0], (0.35 + R() * 0.55) * Ly.a);
          c.fillRect(wx, wy, ws, ws * 1.2);
        }
        if (R() < 0.35) {
          c.fillStyle = '#2a2350'; c.fillRect(x + bw / 2 - 1, top - bh * 0.18, 2, bh * 0.18);
          c.save(); c.shadowColor = '#ff3355'; c.shadowBlur = 10; c.fillStyle = '#ff5570';
          c.beginPath(); c.arc(x + bw / 2, top - bh * 0.18, 2.4, 0, Math.PI * 2); c.fill(); c.restore();
        }
        if (li === 2 && R() < 0.22) {
          const ncol = ['#2ef2ff', '#ff4fd8', '#ffd84a', '#7dff8a'][(R() * 4) | 0];
          c.save(); c.shadowColor = ncol; c.shadowBlur = 16; c.fillStyle = ncol;
          if (R() < 0.5) roundRect(c, x + bw * 0.3, top + bh * 0.15, Math.max(4, bw * 0.16), bh * 0.45, 3);
          else roundRect(c, x + bw * 0.12, top + bh * 0.2, bw * 0.76, Math.max(4, H * 0.012), 3);
          c.fill(); c.restore();
        }
        x += bw + R() * W * 0.006;
      }
    });
    // Haze over the horizon
    g = c.createLinearGradient(0, hz - H * 0.12, 0, hz + H * 0.03);
    g.addColorStop(0, 'rgba(255,90,200,0)'); g.addColorStop(1, 'rgba(255,90,200,0.28)');
    c.fillStyle = g; c.fillRect(0, hz - H * 0.12, W, H * 0.15);
    // Floor with a perspective grid
    g = c.createLinearGradient(0, hz, 0, H);
    g.addColorStop(0, '#1a0634'); g.addColorStop(1, '#030112');
    c.fillStyle = g; c.fillRect(0, hz, W, H - hz);
    c.save();
    c.globalCompositeOperation = 'lighter';
    c.shadowColor = '#2ef2ff'; c.shadowBlur = 8;
    const fade = c.createLinearGradient(0, hz, 0, H);
    fade.addColorStop(0, 'rgba(90,230,255,0.05)'); fade.addColorStop(1, 'rgba(90,230,255,0.55)');
    c.strokeStyle = fade; c.lineWidth = 1.5;
    c.beginPath();
    for (let i = -24; i <= 24; i++) { c.moveTo(sx + i * W * 0.012, hz); c.lineTo(sx + i * W * 0.11, H); }
    for (let k = 1; k <= 16; k++) { const y = hz + (H - hz) * Math.pow(k / 16, 2.1); c.moveTo(0, y); c.lineTo(W, y); }
    c.stroke();
    c.shadowColor = '#ff4fd8'; c.shadowBlur = 14; c.strokeStyle = 'rgba(255,110,220,0.9)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, hz); c.lineTo(W, hz); c.stroke();
    c.restore();
    // Vignette
    rg = c.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.3, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(0,0,8,0.72)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    scene = cv;
    L.hz = hz;
  }

  // Soft round glow sprites, one per colour, for motes, sparks and light dots.
  const glows = new Map();
  function glowSprite(col) {
    let s = glows.get(col);
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64;
    const c = s.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.18, rgba(col, 0.9)); g.addColorStop(0.5, rgba(col, 0.25)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    glows.set(col, s);
    return s;
  }
  const motes = Array.from({ length: 34 }, (_, i) => ({ x: Math.random(), y: Math.random(), v: 0.006 + Math.random() * 0.016, s: 4 + Math.random() * 10, p: Math.random() * 6, col: ['#2ef2ff', '#ff4fd8', '#b26bff', '#ffd84a'][i % 4] }));
  const cars = Array.from({ length: 4 }, (_, i) => ({ x: Math.random(), y: 0.2 + Math.random() * 0.25, v: (0.025 + Math.random() * 0.04) * (i % 2 ? -1 : 1), col: i % 2 ? '#ff4fd8' : '#7ef9ff' }));

  // ---------- The board: a thick gunmetal frame with neon trim and a deep glass well ----------
  let boardPic = null;
  function paintBoard() {
    const { bx, by, bw, bh, cs } = L, pad = Math.round(cs * 0.48), m = 48;
    const [cv, c] = makeCanvas(bw + (pad + m) * 2, bh + (pad + m) * 2);
    c.translate(m + pad, m + pad);
    const fr = pad * 0.9;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 34; c.shadowOffsetY = 14;
    roundRect(c, -pad, -pad, bw + pad * 2, bh + pad * 2, fr);
    let g = c.createLinearGradient(0, -pad, 0, bh + pad);
    g.addColorStop(0, '#46507a'); g.addColorStop(0.12, '#1d2240'); g.addColorStop(0.85, '#0c0e20'); g.addColorStop(1, '#2a3156');
    c.fillStyle = g; c.fill();
    c.restore();
    // Brushed metal streaks
    c.save(); roundRect(c, -pad, -pad, bw + pad * 2, bh + pad * 2, fr); c.clip();
    const R = seeded(7);
    for (let i = 0; i < 80; i++) { c.fillStyle = `rgba(255,255,255,${R() * 0.035})`; c.fillRect(-pad, -pad + R() * (bh + pad * 2), bw + pad * 2, 1); }
    c.restore();
    // Bevel: lit top edge, dark lower edge
    g = c.createLinearGradient(0, -pad, 0, bh + pad);
    g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(0.5, 'rgba(255,255,255,0.06)'); g.addColorStop(1, 'rgba(255,255,255,0.18)');
    c.lineWidth = 2; c.strokeStyle = g; roundRect(c, -pad + 1, -pad + 1, bw + pad * 2 - 2, bh + pad * 2 - 2, fr - 1); c.stroke();
    // Neon trim round the well
    const wi = cs * 0.14, wr = cs * 0.28;
    c.save(); c.shadowColor = '#2ef2ff'; c.shadowBlur = 16;
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(120,245,255,0.9)';
    roundRect(c, -wi - 5, -wi - 5, bw + wi * 2 + 10, bh + wi * 2 + 10, wr + 5); c.stroke();
    c.restore();
    // The well, sunk in with an inner shadow
    roundRect(c, -wi, -wi, bw + wi * 2, bh + wi * 2, wr);
    g = c.createLinearGradient(0, -wi, 0, bh + wi);
    g.addColorStop(0, '#060a1c'); g.addColorStop(1, '#0b1233');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, -wi, -wi, bw + wi * 2, bh + wi * 2, wr); c.clip();
    c.shadowColor = 'rgba(0,0,0,0.95)'; c.shadowBlur = cs * 0.5; c.shadowOffsetY = cs * 0.08;
    c.lineWidth = cs * 0.4; c.strokeStyle = '#000';
    roundRect(c, -wi - cs * 0.2, -wi - cs * 0.2, bw + wi * 2 + cs * 0.4, bh + wi * 2 + cs * 0.4, wr + cs * 0.2); c.stroke();
    c.restore();
    // Fine grid and a socket in every cell
    c.strokeStyle = 'rgba(90,210,255,0.07)'; c.lineWidth = 1;
    c.beginPath();
    for (let i = 1; i < board.C; i++) { c.moveTo(i * cs, 0); c.lineTo(i * cs, bh); }
    for (let i = 1; i < board.R; i++) { c.moveTo(0, i * cs); c.lineTo(bw, i * cs); }
    c.stroke();
    for (let r = 0; r < board.R; r++) for (let col = 0; col < board.C; col++) {
      const x = (col + 0.5) * cs, y = (r + 0.5) * cs;
      c.beginPath(); c.arc(x, y, Math.max(2, cs * 0.07), 0, Math.PI * 2); c.fillStyle = 'rgba(0,0,0,0.5)'; c.fill();
      c.beginPath(); c.arc(x, y + 0.5, Math.max(1.2, cs * 0.045), 0, Math.PI * 2); c.fillStyle = 'rgba(110,220,255,0.22)'; c.fill();
    }
    // Glass reflection over the top of the well
    c.save(); roundRect(c, -wi, -wi, bw + wi * 2, bh + wi * 2, wr); c.clip();
    g = c.createLinearGradient(0, -wi, 0, bh * 0.5);
    g.addColorStop(0, 'rgba(160,220,255,0.08)'); g.addColorStop(1, 'rgba(160,220,255,0)');
    c.fillStyle = g; c.fillRect(-wi, -wi, bw + wi * 2, bh * 0.5);
    c.restore();
    // Neon corner brackets on the frame
    c.save(); c.shadowColor = '#ff4fd8'; c.shadowBlur = 12; c.strokeStyle = '#ff8ae6'; c.lineWidth = 3; c.lineCap = 'round';
    const k = Math.max(14, cs * 0.5), o = -pad * 0.55;
    [[o, o, 1, 1], [bw - o, o, -1, 1], [o, bh - o, 1, -1], [bw - o, bh - o, -1, -1]].forEach(([x, y, sx2, sy2]) => {
      c.beginPath(); c.moveTo(x, y + sy2 * k); c.lineTo(x, y); c.lineTo(x + sx2 * k, y); c.stroke();
    });
    c.restore();
    boardPic = { cv, x: bx - pad - m, y: by - pad - m, w: bw + (pad + m) * 2, h: bh + (pad + m) * 2, wi, wr };
  }

  // The resting arrows are drawn once into a picture and reused until something changes.
  const layer = document.createElement('canvas');
  function paintLayer() {
    const dpr = dprNow();
    const w = Math.max(1, Math.round(Kit.W * dpr)), h = Math.max(1, Math.round(Kit.H * dpr));
    if (layer.width !== w || layer.height !== h) { layer.width = w; layer.height = h; }
    const c = layer.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, w, h);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    board.arrows.forEach((a, id) => {
      if (gone[id] || busy(id) || id === hintId) return;
      drawArrow(c, restRoute(a), 0, a.cells.length, COLORS[a.color]);
    });
    dirty = false;
  }

  // ---------- Sprites: hearts and stars ----------
  const sprites = new Map();
  function heartPath(c) {
    c.beginPath();
    c.moveTo(0, 0.36);
    c.bezierCurveTo(-0.58, -0.04, -0.52, -0.58, -0.25, -0.58);
    c.bezierCurveTo(-0.1, -0.58, 0, -0.47, 0, -0.33);
    c.bezierCurveTo(0, -0.47, 0.1, -0.58, 0.25, -0.58);
    c.bezierCurveTo(0.52, -0.58, 0.58, -0.04, 0, 0.36);
    c.closePath();
  }
  function heartSprite(size, full) {
    const key = 'h' + size + full;
    if (sprites.has(key)) return sprites.get(key);
    const [cv, c] = makeCanvas(size, size);
    c.translate(size / 2, size / 2 + size * 0.06); c.scale(size * 0.92, size * 0.92);
    if (full) {
      c.save(); c.shadowColor = 'rgba(255,40,90,0.9)'; c.shadowBlur = size * 0.25;
      heartPath(c);
      const g = c.createRadialGradient(-0.15, -0.3, 0.05, 0, 0, 0.7);
      g.addColorStop(0, '#ffb3c4'); g.addColorStop(0.35, '#ff3b6b'); g.addColorStop(1, '#8a0b2e');
      c.fillStyle = g; c.fill(); c.restore();
      heartPath(c); c.lineWidth = 0.05; c.strokeStyle = '#5c0820'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      c.beginPath(); c.ellipse(-0.24, -0.33, 0.12, 0.07, -0.6, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(0.25, -0.3, 0.035, 0, Math.PI * 2); c.fill();
    } else {
      heartPath(c); c.fillStyle = 'rgba(20,24,50,0.85)'; c.fill();
      c.lineWidth = 0.05; c.strokeStyle = 'rgba(150,170,220,0.45)'; c.stroke();
    }
    sprites.set(key, cv);
    return cv;
  }
  function starPath(c, r, inner = 0.48, pts5 = 5) {
    c.beginPath();
    for (let i = 0; i < pts5 * 2; i++) {
      const a = -Math.PI / 2 + i * Math.PI / pts5, rr = i % 2 ? r * inner : r;
      if (i) c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    c.closePath();
  }
  function starSprite(size, full) {
    const key = 's' + size + full;
    if (sprites.has(key)) return sprites.get(key);
    const [cv, c] = makeCanvas(size, size);
    c.translate(size / 2, size / 2);
    const r = size * 0.42;
    c.lineJoin = 'round';
    if (full) {
      c.save(); c.shadowColor = 'rgba(255,200,60,0.9)'; c.shadowBlur = size * 0.12;
      starPath(c, r); const g = c.createLinearGradient(0, -r, 0, r);
      g.addColorStop(0, '#fff6c2'); g.addColorStop(0.45, '#ffc83a'); g.addColorStop(1, '#d9790a');
      c.fillStyle = g; c.fill(); c.restore();
      c.lineWidth = size * 0.04; c.strokeStyle = '#7a3c00'; starPath(c, r); c.stroke();
      starPath(c, r * 0.55); c.fillStyle = 'rgba(255,250,210,0.55)'; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(-r * 0.2, -r * 0.35, r * 0.16, r * 0.09, -0.5, 0, Math.PI * 2); c.fill();
    } else {
      starPath(c, r); c.fillStyle = 'rgba(20,24,60,0.9)'; c.fill();
      c.lineWidth = size * 0.035; c.strokeStyle = 'rgba(140,160,230,0.5)'; c.stroke();
    }
    sprites.set(key, cv);
    return cv;
  }

  // ---------- Effects: glowing sparks and light rings ----------
  const sparks = [], rings = [];
  function sparkle(x, y, color, n, speed = 1) {
    for (let i = 0; i < n && sparks.length < 160; i++) {
      const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 240) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60 * speed, life: 0, max: 0.4 + Math.random() * 0.5, size: (0.6 + Math.random()) * Math.max(6, L.cs * 0.16), color, rot: Math.random() * 3 });
    }
  }
  function ring(x, y, color, size = 1) { rings.push({ x, y, color, t: 0, size }); }
  function stepFx(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt;
      if (p.life > p.max) { sparks.splice(i, 1); continue; }
      p.vx *= 1 - dt * 2; p.vy = p.vy * (1 - dt * 2) + 260 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4;
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.55) rings.splice(i, 1); }
  }
  function drawFx(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const k = r.t / 0.55, rad = L.cs * r.size * (0.3 + ease.out(k) * 1.1);
      c.globalAlpha = 1 - k; c.strokeStyle = r.color; c.lineWidth = Math.max(2, L.cs * 0.12 * (1 - k));
      c.beginPath(); c.arc(r.x, r.y, rad, 0, Math.PI * 2); c.stroke();
    }
    for (const p of sparks) {
      const k = p.life / p.max, s = p.size * (1 - k * 0.6);
      c.globalAlpha = 1 - k;
      c.drawImage(glowSprite(p.color), p.x - s * 1.6, p.y - s * 1.6, s * 3.2, s * 3.2);
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = '#ffffff';
      starPath(c, s * 0.7, 0.22, 4); c.fill(); c.restore();
    }
    c.restore();
  }

  // ---------- Small canvas icons for the buttons ----------
  function iconBulb(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.11; c.lineCap = 'round';
    c.beginPath(); c.arc(0, -s * 0.12, s * 0.3, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(s * 0.12, s * 0.25); c.lineTo(-s * 0.12, s * 0.25); c.closePath(); c.stroke();
    c.beginPath(); c.moveTo(-s * 0.12, s * 0.38); c.lineTo(s * 0.12, s * 0.38); c.stroke();
    for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; c.beginPath(); c.moveTo(Math.cos(a) * s * 0.44, -s * 0.12 + Math.sin(a) * s * 0.44); c.lineTo(Math.cos(a) * s * 0.56, -s * 0.12 + Math.sin(a) * s * 0.56); c.stroke(); }
    c.restore();
  }
  function iconRestart(c, x, y, s, col) {
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.12; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, s * 0.34, -Math.PI * 0.35, Math.PI * 1.45); c.stroke();
    const a = -Math.PI * 0.35, ex = Math.cos(a) * s * 0.34, ey = Math.sin(a) * s * 0.34;
    c.beginPath(); c.moveTo(ex + s * 0.2, ey - s * 0.02); c.lineTo(ex - s * 0.06, ey - s * 0.2); c.lineTo(ex - s * 0.02, ey + s * 0.14); c.closePath(); c.fill();
    c.restore();
  }
  function iconSpeaker(c, x, y, s, on) {
    c.save(); c.translate(x, y); c.fillStyle = 'rgba(220,240,255,0.85)'; c.strokeStyle = 'rgba(220,240,255,0.85)'; c.lineWidth = s * 0.08; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-s * 0.4, -s * 0.13); c.lineTo(-s * 0.2, -s * 0.13); c.lineTo(0, -s * 0.33); c.lineTo(0, s * 0.33); c.lineTo(-s * 0.2, s * 0.13); c.lineTo(-s * 0.4, s * 0.13); c.closePath(); c.fill();
    if (on) { c.beginPath(); c.arc(s * 0.02, 0, s * 0.2, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(s * 0.02, 0, s * 0.36, -0.8, 0.8); c.stroke(); }
    else { c.beginPath(); c.moveTo(s * 0.12, -s * 0.14); c.lineTo(s * 0.4, s * 0.14); c.moveTo(s * 0.4, -s * 0.14); c.lineTo(s * 0.12, s * 0.14); c.stroke(); }
    c.restore();
  }

  // ---------- Per frame ----------
  let clearFlashT = -9, bannerT = -9, panelSparked = 0;
  function update(dt) {
    introT += dt;
    heartPop = Math.max(0, heartPop - dt * 2.5);
    stepFx(dt);
    for (const m of motes) { m.y -= m.v * dt; if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); } }
    for (const k of cars) { k.x += k.v * dt; if (k.x > 1.1) k.x = -0.1; if (k.x < -0.1) k.x = 1.1; }
    for (let i = anims.length - 1; i >= 0; i--) {
      const m = anims[i];
      m.t += dt;
      if (m.kind === 'bump' && !m.hit && m.t >= m.dur * 0.38) {
        m.hit = true; thud(); Kit.shake(7, 0.22); heartPop = 1;
        flash[m.by] = performance.now() / 1000;
        const p = px(m.at.r, m.at.c);
        sparkle(p.x, p.y, '#ff4060', 10, 0.6); ring(p.x, p.y, '#ff4060', 0.8);
        Kit.float(lives > 0 ? '−1 ♥' : 'Out of hearts', p.x, p.y - L.cs * 0.6, { color: '#ff6b81', size: Math.max(28, L.cs * 0.55) });
        if (lives <= 0) setTimeout(() => sfx.over(), 400);
      }
      if (m.kind === 'fly' && m.s > 0 && Math.random() < 0.7) {
        const p = along(m.route, m.s + m.len - 1);
        if (p.x > -20 && p.y > -20 && p.x < Kit.W + 20 && p.y < Kit.H + 20) sparkle(p.x, p.y, COLORS[board.arrows[m.id].color], 1, 0.35);
      }
      if (m.t >= m.dur) {
        anims.splice(i, 1); dirty = true;
        if (won && !anims.length) {
          sfx.win(); Kit.confetti(140); Kit.shake(8, 0.3);
          wonT = performance.now() / 1000; clearFlashT = wonT; panelSparked = 0;
          const cx = L.bx + L.bw / 2, cy = L.by + L.bh / 2;
          ring(cx, cy, '#7ef9ff', Math.max(L.bw, L.bh) / L.cs * 0.5); sparkle(cx, cy, '#ffd84a', 30, 1.4); sparkle(cx, cy, '#2ef2ff', 20, 1.2);
        }
      }
    }
    for (const k in flash) if (performance.now() / 1000 - flash[k] > 0.6) { delete flash[k]; dirty = true; }
    if (hintId >= 0 && performance.now() / 1000 - hintT > 4) { hintId = -1; dirty = true; }
  }

  function drawButton(c, b, on, t) {
    Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: on ? 'rgba(255,190,60,0.42)' : 'rgba(80,140,255,0.14)', edge: on ? 'rgba(255,240,180,0.9)' : 'rgba(160,220,255,0.35)', focus: on, t });
    const fs = Math.round(Math.min(b.h * 0.42, b.w * 0.13));
    c.font = `700 ${fs}px ${Kit.UI}`;
    const tw = c.measureText(b.text).width, iw = fs * 1.3, x0 = b.x + (b.w - tw - iw - fs * 0.4) / 2;
    const col = on ? '#fffbe8' : '#e6f4ff';
    if (b.id === 'hint') iconBulb(c, x0 + iw / 2, b.y + b.h / 2, fs * 1.25, on ? '#fff3a0' : '#ffd84a');
    else iconRestart(c, x0 + iw / 2, b.y + b.h / 2, fs * 1.25, on ? '#fff3a0' : '#7ef9ff');
    c.textAlign = 'left'; c.fillStyle = col;
    c.fillText(b.text, x0 + iw + fs * 0.4, b.y + b.h / 2 + 1);
    c.textAlign = 'center';
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000, cs = L.cs;
    if (!scene) paintScene();
    if (!boardPic) paintBoard();
    c.drawImage(scene, 0, 0, W, H);
    // Living city: drifting light motes and flying cars
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const m of motes) {
      const a = 0.25 + 0.25 * Math.sin(t * 1.3 + m.p), s = m.s;
      c.globalAlpha = a; c.drawImage(glowSprite(m.col), m.x * W - s, m.y * H - s, s * 2, s * 2);
    }
    for (const k of cars) {
      const x = k.x * W, y = k.y * H, dir = Math.sign(k.v);
      c.globalAlpha = 0.5; c.strokeStyle = k.col; c.lineWidth = 2;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x - dir * W * 0.035, y); c.stroke();
      c.globalAlpha = 0.9; c.drawImage(glowSprite(k.col), x - 7, y - 7, 14, 14);
    }
    c.restore();

    c.drawImage(boardPic.cv, boardPic.x, boardPic.y, boardPic.w, boardPic.h);
    // Every few seconds a band of light sweeps across the glass well.
    const sweep = (t % 7) / 1.4;
    if (sweep < 1) {
      c.save();
      roundRect(c, L.bx - boardPic.wi, L.by - boardPic.wi, L.bw + boardPic.wi * 2, L.bh + boardPic.wi * 2, boardPic.wr); c.clip();
      const sx = L.bx - L.bh + (L.bw + L.bh * 2) * sweep;
      const g = c.createLinearGradient(sx - cs, 0, sx + cs, 0);
      g.addColorStop(0, 'rgba(120,230,255,0)'); g.addColorStop(0.5, 'rgba(120,230,255,0.07)'); g.addColorStop(1, 'rgba(120,230,255,0)');
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g;
      c.translate(sx, L.by + L.bh / 2); c.transform(1, 0, -0.5, 1, 0, 0); c.translate(-sx, -(L.by + L.bh / 2));
      c.fillRect(sx - cs, L.by - cs, cs * 2, L.bh + cs * 2);
      c.restore();
    }
    if (dirty) paintLayer();
    c.drawImage(layer, 0, 0, W, H);

    // ----- HUD: title, then a glass bar with hearts and progress -----
    c.textAlign = 'center'; c.textBaseline = 'middle';
    Kit.title(c, `Level ${level}`, W / 2, H * 0.058, Math.round(Math.min(H * 0.064, 46)), { color: '#8ff7ff', glow: '#26d9ff' });
    const left = gone.filter((g) => !g).length, total = gone.length;
    const hudW = Math.min(W * 0.5, 560), hudH = Math.round(Math.min(H * 0.058, 46)), hudX = (W - hudW) / 2, hudY = H * 0.101;
    Kit.glass(c, hudX, hudY, hudW, hudH, hudH / 2, { tint: 'rgba(60,110,255,0.14)', edge: 'rgba(140,220,255,0.4)' });
    const hs = Math.round(hudH * 0.78);
    for (let i = 0; i < LIVES; i++) {
      const p = i === lives ? heartPop : 0, s = hs * (1 + p * 0.4);
      c.drawImage(heartSprite(hs, i < lives), hudX + hudH * 0.35 + i * hs * 1.05 - (s - hs) / 2, hudY + (hudH - s) / 2, s, s);
    }
    const fs = Math.round(Math.max(20, Math.min(H * 0.03, 24)));
    c.font = `600 ${fs}px ${Kit.UI}`;
    const label = `${left} left`, lw = c.measureText(label).width;
    const barX = hudX + hudH * 0.35 + LIVES * hs * 1.05 + hudH * 0.25, barW = hudW - (barX - hudX) - lw - hudH * 0.75, barH = hudH * 0.3, barY = hudY + (hudH - barH) / 2;
    roundRect(c, barX, barY, barW, barH, barH / 2); c.fillStyle = 'rgba(0,0,20,0.55)'; c.fill();
    const prog = total ? (total - left) / total : 0;
    if (prog > 0) {
      const g = c.createLinearGradient(barX, 0, barX + barW, 0);
      g.addColorStop(0, '#2ef2ff'); g.addColorStop(1, '#ff4fd8');
      roundRect(c, barX, barY, Math.max(barH, barW * prog), barH, barH / 2); c.fillStyle = g; c.fill();
      roundRect(c, barX + 2, barY + 1.5, Math.max(barH, barW * prog) - 4, barH * 0.35, barH * 0.2); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
    }
    c.textAlign = 'right'; c.fillStyle = '#dff6ff';
    c.fillText(label, hudX + hudW - hudH * 0.4, hudY + hudH / 2 + 1);
    c.textAlign = 'center';

    // ----- Arrows that are moving, hinted, focused or flashing, over the resting picture -----
    const focus = !won && !failed && !Kit.touchFirst() ? focusedId() : -1;
    for (const k in flash) {
      const a = board.arrows[k];
      if (!a || gone[k] || busy(+k)) continue;
      const f = 1 - (now - flash[k]) / 0.6;
      const sx = Math.sin((now - flash[k]) * 50) * cs * 0.06 * f;
      c.save(); c.translate(sx, 0);
      drawArrow(c, restRoute(a), 0, a.cells.length, COLORS[a.color], { glow: '#ff3045', glowA: 0.5 * f, tint: f > 0.5 ? '#ff4060' : null });
      c.restore();
    }
    if (hintId >= 0 && !gone[hintId] && !busy(hintId)) {
      const a = board.arrows[hintId], nudge = Math.max(0, Math.sin((now - hintT) * 7)) * 0.16;
      drawArrow(c, restRoute(a), nudge, a.cells.length, COLORS[a.color], { glow: '#ffe45c', glowA: 0.3 + 0.15 * Math.sin(t * 8), lift: cs * 0.05 });
    }
    if (focus >= 0 && !busy(focus)) {
      const a = board.arrows[focus], p = px(cursor.r, cursor.c), pulse = 0.5 + 0.5 * Math.sin(t * 6);
      // A pool of light under the focused arrow, then the arrow itself lifted off the board.
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + 0.2 * pulse;
      c.drawImage(glowSprite('#ffd84a'), p.x - cs * 1.1, p.y - cs * 1.1, cs * 2.2, cs * 2.2); c.restore();
      if (focus !== hintId) drawArrow(c, restRoute(a), 0, a.cells.length, COLORS[a.color], { glow: '#ffe680', glowA: 0.1 + 0.1 * pulse, lift: cs * 0.06 });
      // Targeting brackets round the cursor cell
      const e = cs * (0.5 + 0.06 * pulse), k = cs * 0.22;
      c.save(); c.shadowColor = '#ffd84a'; c.shadowBlur = 14; c.strokeStyle = '#ffe680'; c.lineWidth = Math.max(3, cs * 0.07); c.lineCap = 'round';
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx2, sy2]) => {
        const x = p.x + sx2 * e, y = p.y + sy2 * e;
        c.beginPath(); c.moveTo(x, y - sy2 * k); c.lineTo(x, y); c.lineTo(x - sx2 * k, y); c.stroke();
      });
      c.restore();
    }
    for (const m of anims) {
      const a = board.arrows[m.id], col = COLORS[a.color];
      if (m.kind === 'fly') {
        const k = clamp(m.t / m.dur, 0, 1);
        m.s = m.dist * (0.18 * k + 0.82 * k * k);
        for (let g = 3; g >= 1; g--) {
          const back = Math.min(m.s, g * 1.0 * Math.min(1, k * 4));
          if (back > 0.05) drawTrail(c, m.route, m.s - back, back + 0.3, col, 0.12 * (4 - g) / 3);
        }
        drawArrow(c, m.route, m.s, m.len, col, { alpha: k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1, glow: col, glowA: 0.18 });
      } else {
        const k = clamp(m.t / m.dur, 0, 1);
        const s = k < 0.38 ? m.peak * ease.out(k / 0.38) : m.peak * (1 - ease.back((k - 0.38) / 0.62));
        drawArrow(c, m.route, Math.max(-0.08, s), m.len, col, { glow: k > 0.38 ? '#ff3045' : null, glowA: 0.4 * (1 - k) });
      }
    }
    // Board cleared: a flash of light over the well
    if (now - clearFlashT < 0.6) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * (1 - (now - clearFlashT) / 0.6);
      roundRect(c, L.bx - boardPic.wi, L.by - boardPic.wi, L.bw + boardPic.wi * 2, L.bh + boardPic.wi * 2, boardPic.wr);
      c.fillStyle = '#7ef9ff'; c.fill(); c.restore();
    }
    drawFx(c);

    // ----- Buttons, help line, sound -----
    L.buttons.forEach((b, i) => drawButton(c, b, cursor.kind === 'btn' && cursor.i === i && !won && !failed && !Kit.touchFirst(), t));
    const hf = Math.round(Math.max(20, Math.min(H * 0.031, 26)));
    const intro = introT < 7 && level <= 2 && !mistakes && gone.every((g) => !g);
    c.font = `${intro ? 700 : 500} ${hf}px ${Kit.UI}`;
    c.fillStyle = intro ? `rgba(255,236,140,${0.65 + 0.35 * Math.sin(t * 4)})` : 'rgba(210,230,255,0.7)';
    const tip = intro ? 'Each arrow flies the way its head points, if nothing is in its way!'
      : Kit.touchFirst() ? 'Tap an arrow to send it off · a blocked arrow costs a heart'
        : 'Arrows pick an arrow · OK sends it off · Blocked costs a heart · Back exits';
    c.fillText(tip, W / 2, H * 0.957, W * 0.94);
    const mb = muteBox();
    iconSpeaker(c, mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.62, !Kit.muted);

    drawBanner(c, now);
    if (won && !anims.length && now > wonT + 0.3) panel(c, now, true);
    else if (failed && now > failT) panel(c, now, false);
  }

  // A level-start banner that sweeps across the board.
  function drawBanner(c, now) {
    const k = (now - bannerT) / 1.9;
    if (k < 0 || k > 1) return;
    const W = Kit.W, H = Kit.H;
    const x = -(1 - ease.out(clamp(k / 0.22, 0, 1))) * W + ease.inOut(clamp((k - 0.78) / 0.22, 0, 1)) * W;
    const y = H * 0.46, bh = H * 0.17;
    c.save(); c.translate(x, 0);
    const g = c.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, 'rgba(12,6,40,0)'); g.addColorStop(0.2, 'rgba(12,6,40,0.88)'); g.addColorStop(0.8, 'rgba(12,6,40,0.88)'); g.addColorStop(1, 'rgba(12,6,40,0)');
    c.fillStyle = g; c.fillRect(0, y - bh / 2, W, bh);
    c.globalCompositeOperation = 'lighter';
    const lg = c.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(46,242,255,0)'); lg.addColorStop(0.5, 'rgba(46,242,255,0.9)'); lg.addColorStop(1, 'rgba(46,242,255,0)');
    c.fillStyle = lg; c.fillRect(0, y - bh / 2, W, 2);
    const lg2 = c.createLinearGradient(0, 0, W, 0);
    lg2.addColorStop(0, 'rgba(255,79,216,0)'); lg2.addColorStop(0.5, 'rgba(255,79,216,0.9)'); lg2.addColorStop(1, 'rgba(255,79,216,0)');
    c.fillStyle = lg2; c.fillRect(0, y + bh / 2 - 2, W, 2);
    c.globalCompositeOperation = 'source-over';
    Kit.title(c, `LEVEL ${level}`, W / 2, y - bh * 0.1, Math.round(bh * 0.44), { color: '#8ff7ff', glow: '#26d9ff' });
    c.font = `600 ${Math.round(bh * 0.17)}px ${Kit.UI}`; c.fillStyle = 'rgba(230,240,255,0.9)';
    c.fillText(`${board.C} × ${board.R} grid  ·  ${board.arrows.length} arrows  ·  ${LIVES} hearts`, W / 2, y + bh * 0.28);
    c.restore();
  }

  // Win / lose panel: glass card, ribbon, stars popping in, light rays.
  let rays = null;
  function raysPic(size) {
    if (rays && rays.width === Math.ceil(size)) return rays;
    rays = document.createElement('canvas'); rays.width = rays.height = Math.ceil(size);
    const c = rays.getContext('2d'), r = size / 2;
    c.translate(r, r);
    for (let i = 0; i < 16; i++) {
      c.rotate(Math.PI / 8);
      const g = c.createLinearGradient(0, 0, r, 0);
      g.addColorStop(0, 'rgba(140,240,255,0.5)'); g.addColorStop(1, 'rgba(140,240,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(r, -r * 0.09); c.lineTo(r, r * 0.09); c.closePath(); c.fill();
    }
    return rays;
  }
  function ribbon(c, cx, cy, w, h, c1, c2) {
    const tail = h * 0.7;
    c.fillStyle = shade(c2, -0.35);
    [-1, 1].forEach((s) => {
      c.beginPath();
      c.moveTo(cx + s * (w / 2 - tail * 0.6), cy - h * 0.3); c.lineTo(cx + s * (w / 2 + tail), cy - h * 0.3);
      c.lineTo(cx + s * (w / 2 + tail * 0.55), cy + h * 0.2); c.lineTo(cx + s * (w / 2 + tail), cy + h * 0.7);
      c.lineTo(cx + s * (w / 2 - tail * 0.6), cy + h * 0.7); c.closePath(); c.fill();
    });
    const g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    c.beginPath();
    c.moveTo(cx - w / 2, cy - h / 2); c.quadraticCurveTo(cx, cy - h * 0.75, cx + w / 2, cy - h / 2);
    c.lineTo(cx + w / 2, cy + h / 2); c.quadraticCurveTo(cx, cy + h * 0.25, cx - w / 2, cy + h / 2); c.closePath();
    c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.5)'; c.stroke();
  }
  function panel(c, now, win) {
    const W = Kit.W, H = Kit.H, t0 = win ? wonT + 0.3 : failT, a = clamp((now - t0) / 0.4, 0, 1);
    c.fillStyle = `rgba(2,3,16,${0.66 * a})`; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.84, 580), ph = Math.min(H * 0.6, 380);
    c.save(); c.translate(W / 2, H / 2);
    if (win) {
      const rs = Math.max(pw, ph) * 1.7, rp = raysPic(rs);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * a; c.rotate(now * 0.25);
      c.drawImage(rp, -rs / 2, -rs / 2, rs, rs); c.restore();
    }
    const k = ease.back(a); c.scale(k, k);
    Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 30, { tint: win ? 'rgba(50,90,255,0.32)' : 'rgba(255,50,100,0.26)', edge: win ? 'rgba(140,240,255,0.8)' : 'rgba(255,160,190,0.8)' });
    roundRect(c, -pw / 2 + 6, -ph / 2 + 6, pw - 12, ph - 12, 26); c.fillStyle = 'rgba(8,8,30,0.55)'; c.fill();
    const rbW = pw * 0.78, rbH = ph * 0.2, rbY = -ph / 2 + rbH * 0.15;
    ribbon(c, 0, rbY, rbW, rbH, win ? '#3fe0ff' : '#ff5c8a', win ? '#2a5bff' : '#a3123f');
    Kit.title(c, win ? 'BOARD CLEARED!' : 'OUT OF HEARTS', 0, rbY - rbH * 0.05, Math.round(rbH * 0.5), { color: '#ffffff' });
    if (win) {
      const stars = Math.max(1, 3 - mistakes), ss = ph * 0.26;
      for (let i = 0; i < 3; i++) {
        const st = t0 + 0.35 + i * 0.22, kk = clamp((now - st) / 0.5, 0, 1);
        const full = i < stars, sc = full ? ease.elastic(kk) : ease.out(kk);
        if (full && kk > 0 && panelSparked <= i) {
          panelSparked = i + 1; Kit.tone(880 + i * 220, { type: 'triangle', dur: 0.2, vol: 0.12 });
          const sx = W / 2 + (i - 1) * ss * 1.05 * k, sy = H / 2 + (-ph * 0.06 + (i === 1 ? -ss * 0.12 : 0)) * k;
          sparkle(sx, sy, '#ffd84a', 12, 0.8);
        }
        const sz = (i === 1 ? ss * 1.15 : ss) * sc;
        if (sz > 1) c.drawImage(starSprite(Math.round(ss * 1.15), full), (i - 1) * ss * 1.05 - sz / 2, -ph * 0.06 + (i === 1 ? -ss * 0.12 : 0) - sz / 2, sz, sz);
      }
      c.font = `600 ${Math.round(ph * 0.07)}px ${Kit.UI}`; c.fillStyle = 'rgba(230,240,255,0.9)';
      c.fillText(mistakes ? `${mistakes} bump${mistakes > 1 ? 's' : ''}  ·  ${hints} hint${hints === 1 ? '' : 's'}` : 'No bumps. Perfect run!', 0, ph * 0.13);
    } else {
      const hsz = ph * 0.3;
      c.save(); c.rotate(-0.15); c.drawImage(heartSprite(Math.round(hsz), false), -hsz / 2, -ph * 0.07 - hsz / 2, hsz, hsz); c.restore();
      c.font = `600 ${Math.round(ph * 0.07)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,230,236,0.92)';
      c.fillText('Look for an arrow with a clear way out.', 0, ph * 0.13, pw * 0.88);
    }
    // "OK" prompt pill
    const pillW = pw * 0.62, pillH = ph * 0.15, pillY = ph * 0.32, pulse = 0.5 + 0.5 * Math.sin(now * 5);
    Kit.glass(c, -pillW / 2, pillY - pillH / 2, pillW, pillH, pillH / 2, { tint: `rgba(255,190,60,${0.35 + 0.15 * pulse})`, edge: 'rgba(255,240,180,0.9)' });
    const msg = Kit.touchFirst() ? (win ? 'Tap for the next level' : 'Tap to try again') : (win ? 'Next level' : 'Try again');
    c.font = `700 ${Math.round(pillH * 0.42)}px ${Kit.UI}`;
    const mw = c.measureText(msg).width, kw = Kit.touchFirst() ? 0 : pillH * 0.95, gx = -(mw + kw + (kw ? pillH * 0.25 : 0)) / 2;
    if (kw) {
      roundRect(c, gx, pillY - pillH * 0.32, kw, pillH * 0.64, pillH * 0.18); c.fillStyle = '#fff6d0'; c.fill();
      c.fillStyle = '#5a3200'; c.font = `800 ${Math.round(pillH * 0.34)}px ${Kit.UI}`; c.fillText('OK', gx + kw / 2, pillY + 1);
      c.font = `700 ${Math.round(pillH * 0.42)}px ${Kit.UI}`;
    }
    c.textAlign = 'left'; c.fillStyle = '#fffbe8'; c.fillText(msg, gx + kw + (kw ? pillH * 0.25 : 0), pillY + 1); c.textAlign = 'center';
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
  if (bannerT < 0) bannerT = performance.now() / 1000 + 0.3;
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  snapCursor();
  Kit.canvas.focus();
  if (level > 1) Kit.record('arrowescape', level - 1);
})();
