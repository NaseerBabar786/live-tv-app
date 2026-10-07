// Block Burst: drop the three pieces on an 8×8 board; a full row or column bursts. Clear several at
// once, or keep clearing move after move, for big combos. No more room for any piece: game over.
// Remote: arrows pick a piece, OK (or the arrow toward the board) takes it to the board, arrows move it,
// OK drops it; moving off the board's edge goes back to the pieces. Touch and mouse: drag a piece.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const N = 8;
  const COLORS = ['#ff4d6d', '#ff9f1c', '#ffd23f', '#3bceac', '#22d3ee', '#4e7cff', '#b26bff', '#ff6bd6'];
  const WORDS = ['', 'Good!', 'Great!', 'Excellent!', 'Amazing!', 'Unbelievable!'];

  // Every piece, as [row, col] cells, with how often it comes up.
  const SHAPES = [];
  function add(rows, weight) {
    const cells = [];
    rows.forEach((line, r) => [...line].forEach((ch, c) => { if (ch === '#') cells.push([r, c]); }));
    SHAPES.push({ cells, w: Math.max(...cells.map((p) => p[1])) + 1, h: Math.max(...cells.map((p) => p[0])) + 1, weight, size: cells.length });
  }
  add(['#'], 2);
  add(['##'], 3); add(['#', '#'], 3);
  add(['###'], 3); add(['#', '#', '#'], 3);
  add(['####'], 2); add(['#', '#', '#', '#'], 2);
  add(['#####'], 1.2); add(['#', '#', '#', '#', '#'], 1.2);
  add(['##', '##'], 3);
  add(['###', '###', '###'], 1);
  add(['##', '##', '##'], 1); add(['###', '###'], 1);
  add(['#.', '##'], 2); add(['.#', '##'], 2); add(['##', '#.'], 2); add(['##', '.#'], 2);
  add(['#..', '###'], 1.4); add(['..#', '###'], 1.4); add(['###', '#..'], 1.4); add(['###', '..#'], 1.4);
  add(['#.', '#.', '##'], 1.4); add(['.#', '.#', '##'], 1.4); add(['##', '#.', '#.'], 1.4); add(['##', '.#', '.#'], 1.4);
  add(['###', '.#.'], 1.4); add(['.#.', '###'], 1.4); add(['#.', '##', '#.'], 1.4); add(['.#', '##', '.#'], 1.4);
  add(['##.', '.##'], 1.2); add(['.##', '##.'], 1.2); add(['#.', '##', '.#'], 1.2); add(['.#', '##', '#.'], 1.2);
  add(['#..', '#..', '###'], 0.8); add(['###', '..#', '..#'], 0.8);

  // ---------- State ----------
  const saved = Kit.store.get('blockburst.game', null);
  let grid, tray, score, combo, misses, over, overT, best = Kit.store.get('blockburst.best', 0);
  let mode = 'tray', sel = 0, pos = { r: 2, c: 2 }, view = { r: 2, c: 2 };
  let shown = 0, bump = 0, newBest = false, introT = 0;
  const pop = []; // [r][c] time a block landed, for its little bounce
  let clearing = []; // blocks bursting: { r, c, color, t }
  let trayT = 0; // when the current three pieces arrived
  let nopeT = 0, drag = null;

  function fresh() {
    grid = Array.from({ length: N }, () => Array(N).fill(-1));
    score = 0; combo = 0; misses = 0; over = false; overT = 0; newBest = false;
    tray = deal();
    mode = 'tray'; sel = 0; clearing = [];
    save();
  }
  function restore(s) {
    grid = s.grid; tray = s.tray.map((p) => p && { ...p, shape: SHAPES[p.k] }); score = s.score; combo = s.combo; misses = s.misses;
    over = false; overT = 0; sel = Math.max(0, tray.findIndex((p) => p && !p.used));
  }
  function save() {
    if (over) { Kit.store.set('blockburst.game', null); return; }
    Kit.store.set('blockburst.game', { grid, score, combo, misses, tray: tray.map((p) => ({ k: SHAPES.indexOf(p.shape), color: p.color, used: p.used })) });
  }
  for (let r = 0; r < N; r++) pop.push(Array(N).fill(-9));

  const fits = (shape, r, c) => shape.cells.every(([dr, dc]) => {
    const rr = r + dr, cc = c + dc;
    return rr >= 0 && cc >= 0 && rr < N && cc < N && grid[rr][cc] < 0;
  });
  const fitsAnywhere = (shape) => {
    for (let r = 0; r <= N - shape.h; r++) for (let c = 0; c <= N - shape.w; c++) if (fits(shape, r, c)) return true;
    return false;
  };
  function pickShape(fill) {
    // A fuller board makes the small pieces likelier, so a game ends by skill, not a bad deal.
    const weights = SHAPES.map((s) => s.weight * (fill > 0.45 ? Math.pow(0.78, Math.max(0, s.size - 3)) : 1));
    let x = Math.random() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < SHAPES.length; i++) { x -= weights[i]; if (x <= 0) return SHAPES[i]; }
    return SHAPES[0];
  }
  function deal() {
    const fill = grid.flat().filter((v) => v >= 0).length / (N * N);
    let set = null;
    for (let tries = 0; tries < 40; tries++) {
      set = [0, 1, 2].map(() => pickShape(fill));
      if (set.some(fitsAnywhere)) break;
    }
    const colors = [...COLORS].sort(() => Math.random() - 0.5);
    trayT = performance.now() / 1000;
    return set.map((shape, i) => ({ shape, color: colors[i], used: false }));
  }

  if (saved && saved.grid) restore(saved); else fresh();

  // ---------- Layout ----------
  let L = {};
  function layout(W, H) {
    const wide = W / H > 1.1;
    if (wide) {
      const B = Math.min(H * 0.84, W * 0.52);
      const bx = (W - B) / 2 - W * 0.02, by = (H - B) / 2 + H * 0.03;
      const tx = bx + B + W * 0.04, tw = W - tx - W * 0.03;
      const slotH = B / 3;
      L = { wide, B, bx, by, cs: B / N, slots: [0, 1, 2].map((i) => ({ x: tx, y: by + i * slotH, w: tw, h: slotH })),
        score: { x: bx / 2 - W * 0.01, y: by + B * 0.1 } };
    } else {
      const B = Math.min(W * 0.94, H * 0.56);
      const bx = (W - B) / 2, by = H * 0.17;
      const slotW = (W - 16) / 3, slotH = Math.min(H - (by + B) - 30, slotW);
      L = { wide, B, bx, by, cs: B / N, slots: [0, 1, 2].map((i) => ({ x: 8 + i * slotW, y: by + B + 14, w: slotW, h: slotH })),
        score: { x: W / 2, y: H * 0.075 } };
    }
    sprites.clear();
  }
  Kit.onResize(layout);

  // Each colour's block, drawn once per size (gradients are slow on TV boxes; pictures are quick).
  const sprites = new Map();
  function sprite(color, size) {
    const key = color + Math.round(size);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(size * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    const r = size * 0.18, p = size * 0.04;
    roundRect(c, p, p, size - 2 * p, size - 2 * p, r);
    const g = c.createLinearGradient(0, 0, 0, size);
    g.addColorStop(0, shade(color, 0.35)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.35));
    c.fillStyle = g; c.fill();
    // Bevel: light top-left edge, dark bottom-right edge.
    c.lineWidth = size * 0.06;
    c.strokeStyle = shade(color, -0.45); c.stroke();
    roundRect(c, p + size * 0.1, p + size * 0.09, size - 2 * p - size * 0.2, size * 0.32, r * 0.6);
    const hg = c.createLinearGradient(0, p, 0, size * 0.45);
    hg.addColorStop(0, 'rgba(255,255,255,0.75)'); hg.addColorStop(1, 'rgba(255,255,255,0.05)');
    c.fillStyle = hg; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.arc(size * 0.27, size * 0.27, size * 0.05, 0, Math.PI * 2); c.fill();
    sprites.set(key, s);
    return s;
  }
  function block(c, color, x, y, size, scale = 1, alpha = 1) {
    const s = sprite(color, size);
    c.globalAlpha = alpha;
    const d = size * scale;
    c.drawImage(s, x + (size - d) / 2, y + (size - d) / 2, d, d);
    c.globalAlpha = 1;
  }

  // ---------- Moves ----------
  function lines(shape, r, c) {
    // The rows and columns this piece would fill.
    const filled = (rr, cc) => grid[rr][cc] >= 0 || shape.cells.some(([dr, dc]) => r + dr === rr && c + dc === cc);
    const rows = [], cols = [];
    for (let i = 0; i < N; i++) {
      if ([...Array(N).keys()].every((j) => filled(i, j))) rows.push(i);
      if ([...Array(N).keys()].every((j) => filled(j, i))) cols.push(i);
    }
    return { rows, cols };
  }
  function place(slot, r, c) {
    const p = tray[slot];
    if (!p || p.used || !fits(p.shape, r, c)) { nope(); return false; }
    const now = performance.now() / 1000;
    const { rows, cols } = lines(p.shape, r, c);
    for (const [dr, dc] of p.shape.cells) { grid[r + dr][c + dc] = COLORS.indexOf(p.color); pop[r + dr][c + dc] = now; }
    p.used = true;
    let gained = p.shape.size;
    sfx.drop();
    const n = rows.length + cols.length;
    const cx = L.bx + (c + p.shape.w / 2) * L.cs, cy = L.by + (r + p.shape.h / 2) * L.cs;
    if (n > 0) {
      combo++; misses = 0;
      const gone = new Set();
      rows.forEach((rr) => { for (let j = 0; j < N; j++) gone.add(rr * N + j); });
      cols.forEach((cc) => { for (let j = 0; j < N; j++) gone.add(j * N + cc); });
      for (const k of gone) {
        const rr = Math.floor(k / N), cc = k % N;
        const dist = Math.hypot(rr - (r + p.shape.h / 2), cc - (c + p.shape.w / 2));
        clearing.push({ r: rr, c: cc, color: p.color, t: now + dist * 0.03 });
        grid[rr][cc] = -1;
      }
      const lineScore = 10 * n * n;
      const pts = lineScore * Math.max(1, combo);
      gained += pts;
      sfx.clear(n, combo);
      Kit.shake(n >= 2 ? 6 + n * 3 : 3, 0.25 + n * 0.06);
      Kit.float(WORDS[Math.min(n, 5)], L.bx + L.B / 2, L.by + L.B * 0.42, { color: ['#ffd23f', '#3bceac', '#4ea8de', '#ff9f1c', '#ff4d6d'][Math.min(n, 5) - 1], size: L.B * (0.1 + Math.min(n, 4) * 0.012), life: 1.3, big: true });
      if (combo >= 2) Kit.float(`Combo ×${combo}`, L.bx + L.B / 2, L.by + L.B * 0.56, { color: '#ff6bd6', size: L.B * 0.07, life: 1.3, big: true });
      if (grid.every((row) => row.every((v) => v < 0))) {
        gained += 300;
        setTimeout(() => { Kit.float('Board clear! +300', L.bx + L.B / 2, L.by + L.B * 0.7, { color: '#22d3ee', size: L.B * 0.075, life: 1.6, big: true }); sfx.win(); Kit.confetti(80); }, 350);
      }
    } else if (++misses >= 3) combo = 0;
    Kit.float(`+${gained}`, cx, cy, { color: '#ffffff', size: L.cs * 0.6 });
    score += gained; bump = 1;
    if (score > best) {
      if (!newBest && best > 0) { newBest = true; Kit.float('New best!', L.score.x, L.score.y + L.cs * 1.6, { color: '#ffd23f', size: L.cs * 0.55, life: 1.6, big: true }); }
      best = score; Kit.store.set('blockburst.best', best); Kit.record('blockburst', best);
    }
    if (tray.every((q) => q.used)) tray = deal();
    sel = Math.max(0, tray.findIndex((q) => !q.used));
    mode = 'tray';
    if (!tray.some((q) => !q.used && fitsAnywhere(q.shape))) {
      over = true; overT = now + 0.6; Kit.record('blockburst', best);
      setTimeout(() => sfx.over(), 500);
    }
    save();
    return true;
  }
  function nope() { nopeT = performance.now() / 1000; sfx.nope(); }

  function nextSlot(from, dir) {
    for (let k = 1; k <= 3; k++) { const i = (from + dir * k + 9) % 3; if (!tray[i].used) return i; }
    return from;
  }
  function toBoard() {
    const p = tray[sel];
    if (!p || p.used) return;
    mode = 'board';
    pos = { r: clamp(pos.r, 0, N - p.shape.h), c: clamp(pos.c, 0, N - p.shape.w) };
    // Start somewhere it fits, near where the last one went.
    if (!fits(p.shape, pos.r, pos.c)) {
      let bestD = 1e9;
      for (let r = 0; r <= N - p.shape.h; r++) for (let c = 0; c <= N - p.shape.w; c++) {
        const d = Math.abs(r - pos.r) + Math.abs(c - pos.c);
        if (fits(p.shape, r, c) && d < bestD) { bestD = d; pos = { r, c }; }
      }
    }
    view = { ...pos };
    sfx.pick();
  }

  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (over) { if (k === 'ok' && performance.now() / 1000 > overT + 0.8) { fresh(); sfx.pick(); } return; }
    if (k === 'restart') { fresh(); return; }
    if (mode === 'tray') {
      const back = L.wide ? 'up' : 'left', fwd = L.wide ? 'down' : 'right', board = L.wide ? 'left' : 'up';
      if (k === back) { sel = nextSlot(sel, -1); sfx.move(); }
      else if (k === fwd) { sel = nextSlot(sel, 1); sfx.move(); }
      else if (k === 'ok' || k === board) toBoard();
    } else {
      const p = tray[sel].shape;
      const leave = L.wide ? 'right' : 'down';
      const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[k];
      if (d) {
        const r = pos.r + d[0], c = pos.c + d[1];
        if (r < 0 || c < 0 || r > N - p.h || c > N - p.w) { if (k === leave) { mode = 'tray'; sfx.move(); } return; }
        pos = { r, c }; sfx.move();
      } else if (k === 'ok') place(sel, pos.r, pos.c);
    }
  });

  // ---------- Touch and mouse: drag a piece from the tray ----------
  function slotAt(x, y) { return L.slots.findIndex((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h); }
  function dropSpot(d) {
    const p = tray[d.slot].shape;
    const lift = d.touch ? L.cs * 1.8 : 0;
    const r = Math.round((d.y - lift - L.by) / L.cs - p.h / 2), c = Math.round((d.x - L.bx) / L.cs - p.w / 2);
    return { r, c, ok: fits(p, r, c) };
  }
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (over) { if (performance.now() / 1000 > overT + 0.8) fresh(); return; }
      const i = slotAt(e.x, e.y);
      if (i >= 0 && !tray[i].used) { drag = { slot: i, x: e.x, y: e.y, touch: e.touch }; sel = i; mode = 'tray'; sfx.pick(); }
    },
    move(e) { if (drag) { drag.x = e.x; drag.y = e.y; } },
    up(e, cancel) {
      if (!drag) return;
      const d = drag; drag = null;
      if (cancel) return;
      const s = dropSpot(d);
      if (s.ok) { pos = { r: s.r, c: s.c }; place(d.slot, s.r, s.c); }
      else if (slotAt(d.x, d.y) < 0) nope();
    },
  });

  // ---------- Drawing ----------
  function drawPiece(c, piece, x, y, cs, alpha = 1, scale = 1) {
    for (const [dr, dc] of piece.shape.cells) block(c, piece.color, x + dc * cs, y + dr * cs, cs, scale, alpha);
  }
  function update(dt) {
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    view.r = lerp(view.r, pos.r, Math.min(1, dt * 22)); view.c = lerp(view.c, pos.c, Math.min(1, dt * 22));
    introT += dt;
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000;
    Kit.background(c, t, '#2a1366', '#0d0726', 'rgba(140,90,255,0.10)');
    const { bx, by, B, cs } = L;

    // Score
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const sx = L.score.x, sy = L.score.y;
    c.font = `800 ${Math.round(cs * 0.36)}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.65)';
    c.fillText('👑 ' + best, sx, sy - cs * (L.wide ? 0.85 : 0.75));
    c.save();
    c.translate(sx, sy + cs * 0.25);
    c.scale(1 + bump * 0.18, 1 + bump * 0.18);
    c.font = `900 ${Math.round(cs * (L.wide ? 0.95 : 0.85))}px system-ui, sans-serif`;
    c.lineWidth = cs * 0.12; c.strokeStyle = 'rgba(30,10,70,0.9)'; c.lineJoin = 'round';
    c.strokeText(Math.round(shown), 0, 0);
    const sg = c.createLinearGradient(0, -cs * 0.4, 0, cs * 0.4);
    sg.addColorStop(0, '#fff6c2'); sg.addColorStop(1, '#ffb703');
    c.fillStyle = sg; c.fillText(Math.round(shown), 0, 0);
    c.restore();
    if (combo >= 2 && !over) {
      c.font = `800 ${Math.round(cs * 0.34)}px system-ui, sans-serif`;
      c.fillStyle = '#ff8de3';
      c.fillText(`🔥 Combo ×${combo}`, sx, sy + cs * (L.wide ? 1.15 : 1.0));
    }
    if (L.wide) {
      c.font = `600 ${Math.round(cs * 0.24)}px system-ui, sans-serif`;
      c.fillStyle = 'rgba(255,255,255,0.45)';
      const tips = Kit.touchFirst() ? ['Drag a piece onto the board', 'Fill a row or column', 'to burst it!']
        : mode === 'tray' ? ['▲ ▼  pick a piece', 'OK  take it to the board', 'Back  games menu'] : ['Arrows  move it', 'OK  drop it', '▶ off the edge  other pieces'];
      tips.forEach((tx, i) => c.fillText(tx, sx, by + B * 0.72 + i * cs * 0.42));
    }

    // Board
    c.save();
    roundRect(c, bx - cs * 0.22, by - cs * 0.22, B + cs * 0.44, B + cs * 0.44, cs * 0.35);
    c.fillStyle = 'rgba(10,4,30,0.72)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(180,140,255,0.35)'; c.stroke();
    c.restore();
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      roundRect(c, bx + col * cs + cs * 0.05, by + r * cs + cs * 0.05, cs * 0.9, cs * 0.9, cs * 0.16);
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fill();
    }

    // What the held piece would do: a shadow where it lands, and the lines it fills light up in its colour.
    let ghost = null;
    if (!over && drag) {
      const s = dropSpot(drag);
      if (s.ok) ghost = { piece: tray[drag.slot], r: s.r, c: s.c, ok: true };
    } else if (!over && mode === 'board') ghost = { piece: tray[sel], r: pos.r, c: pos.c, ok: fits(tray[sel].shape, pos.r, pos.c) };
    let glow = null;
    if (ghost && ghost.ok) {
      const { rows, cols } = lines(ghost.piece.shape, ghost.r, ghost.c);
      if (rows.length || cols.length) glow = { rows: new Set(rows), cols: new Set(cols), color: ghost.piece.color };
    }

    const gray = over ? clamp((now - (overT - 0.6)) / 1.2, 0, 1) : 0;
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const v = grid[r][col];
      if (v < 0) continue;
      const age = now - pop[r][col];
      const s = age < 0.3 ? 1 + Math.sin(age / 0.3 * Math.PI) * 0.14 : 1;
      let color = COLORS[v];
      if (glow && (glow.rows.has(r) || glow.cols.has(col))) color = glow.color;
      // Game over: the blocks go grey in a sweep from the top.
      if (gray > 0 && r / N < gray * 1.3) color = '#5b5670';
      block(c, color, bx + col * cs, by + r * cs, cs, s);
      if (glow && (glow.rows.has(r) || glow.cols.has(col))) {
        c.globalAlpha = 0.25 + 0.2 * Math.sin(t * 10);
        c.fillStyle = '#fff';
        roundRect(c, bx + col * cs + cs * 0.06, by + r * cs + cs * 0.06, cs * 0.88, cs * 0.88, cs * 0.16); c.fill();
        c.globalAlpha = 1;
      }
    }
    if (ghost) {
      const vr = drag ? ghost.r : view.r, vc = drag ? ghost.c : view.c;
      const shakeX = !drag && now - nopeT < 0.3 ? Math.sin((now - nopeT) * 60) * cs * 0.12 : 0;
      drawPiece(c, ghost.piece, bx + vc * cs + shakeX, by + vr * cs, cs, ghost.ok ? (drag ? 0.4 : 0.92) : 0.55);
      if (!drag) {
        // The remote's cursor: a pulsing outline round the piece.
        const p = ghost.piece.shape;
        c.lineWidth = 3 + Math.sin(t * 8) * 1.2;
        c.strokeStyle = ghost.ok ? 'rgba(255,255,255,0.9)' : 'rgba(255,80,100,0.95)';
        roundRect(c, bx + vc * cs - 3 + shakeX, by + vr * cs - 3, p.w * cs + 6, p.h * cs + 6, cs * 0.2); c.stroke();
      }
    }

    // Bursting blocks: a white flash, then they spin away in sparks.
    for (let i = clearing.length - 1; i >= 0; i--) {
      const k = clearing[i], age = now - k.t;
      if (age > 0.45) { clearing.splice(i, 1); continue; }
      const x = bx + k.c * cs, y = by + k.r * cs;
      if (age < 0) { block(c, k.color, x, y, cs); continue; }
      if (!k.sparked) { k.sparked = true; Kit.burst(x + cs / 2, y + cs / 2, k.color, 6, 0.8); }
      const q = age / 0.45;
      c.save();
      c.translate(x + cs / 2, y + cs / 2); c.rotate(q * 1.2);
      block(c, k.color, -cs / 2, -cs / 2, cs, 1 - ease.inOut(q) * 0.9, 1 - q * 0.6);
      c.globalAlpha = Math.max(0, 0.9 - q * 2);
      c.fillStyle = '#fff'; c.fillRect(-cs / 2, -cs / 2, cs, cs);
      c.restore();
    }

    // Tray
    const sinceDeal = now - trayT;
    for (let i = 0; i < 3; i++) {
      const s = L.slots[i], p = tray[i];
      const focused = !over && i === sel && (mode === 'tray' || mode === 'board');
      if (focused && !Kit.touchFirst()) {
        roundRect(c, s.x + 6, s.y + 6, s.w - 12, s.h - 12, 18);
        c.fillStyle = mode === 'tray' ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)'; c.fill();
        c.lineWidth = mode === 'tray' ? 3 + Math.sin(t * 6) : 2;
        c.strokeStyle = mode === 'tray' ? '#ffd23f' : 'rgba(255,210,63,0.4)'; c.stroke();
      }
      if (!p || p.used || (drag && drag.slot === i)) continue;
      const tcs = Math.min(cs * 0.62, (s.w - 30) / p.shape.w, (s.h - 30) / p.shape.h);
      const enter = clamp((sinceDeal - i * 0.08) / 0.45, 0, 1);
      const off = (1 - ease.back(enter)) * (L.wide ? s.w : s.h);
      const fitsSomewhere = fitsAnywhere(p.shape);
      const bob = focused && mode === 'tray' ? Math.sin(t * 5) * 3 : 0;
      const px = s.x + (s.w - p.shape.w * tcs) / 2 + (L.wide ? off : 0);
      const py = s.y + (s.h - p.shape.h * tcs) / 2 + (L.wide ? 0 : off) + bob;
      const piece = fitsSomewhere ? p : { shape: p.shape, color: '#6b6680' };
      drawPiece(c, piece, px, py, tcs, enter * (focused && mode === 'board' ? 0.3 : 1), focused && mode === 'tray' ? 1.04 : 1);
    }
    if (drag) {
      const p = tray[drag.slot];
      const lift = drag.touch ? cs * 1.8 : 0;
      drawPiece(c, p, drag.x - p.shape.w * cs / 2, drag.y - lift - p.shape.h * cs / 2, cs, 1, 1.05);
    }

    // Speaker (tap or M)
    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if (introT < 5 && score === 0 && !over) {
      const a = Math.min(1, introT * 2, (5 - introT) * 2);
      c.globalAlpha = a;
      c.font = `700 ${Math.round(cs * 0.3)}px system-ui, sans-serif`;
      c.fillStyle = '#fff';
      c.fillText('Fill a row or a column to burst it!', bx + B / 2, by - cs * 0.62);
      c.globalAlpha = 1;
    }

    if (over && now > overT) {
      const a = clamp((now - overT) / 0.4, 0, 1);
      c.fillStyle = `rgba(8,3,24,${0.7 * a})`; c.fillRect(0, 0, W, H);
      c.save();
      c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw = Math.min(W * 0.8, cs * 7.5), ph = cs * 4.6;
      roundRect(c, -pw / 2, -ph / 2, pw, ph, cs * 0.5);
      const pg = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      pg.addColorStop(0, '#5a2bd6'); pg.addColorStop(1, '#2a1170');
      c.fillStyle = pg; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(cs * 0.62)}px system-ui, sans-serif`;
      c.fillText('Out of space!', 0, -ph * 0.3);
      c.font = `900 ${Math.round(cs * 0.95)}px system-ui, sans-serif`; c.fillStyle = '#ffd23f';
      c.fillText(score, 0, -ph * 0.04);
      c.font = `700 ${Math.round(cs * 0.34)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.17);
      c.fillStyle = '#9ff0ff';
      c.fillText(Kit.touchFirst() ? 'Tap to play again' : 'Press OK to play again', 0, ph * 0.34);
      c.restore();
    }
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (best > 0) Kit.record('blockburst', best);
})();
