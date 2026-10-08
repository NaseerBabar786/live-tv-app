// Hex Stack: set stacks of little hexagon discs on a honeycomb board. Next to a stack with the same top
// colour, the matching discs hop over one by one; 10 or more of one colour on top burst for points, and
// the hops and bursts keep chaining. Reach the level's score goal to unlock another colour. A full board
// ends the game.
// Remote: Left/Right pick one of the three stacks in the tray, OK (or Up) lifts it, arrows move it over
// the board, OK sets it down; Down off the board's bottom puts it back. Touch and mouse: tap a stack,
// then tap a cell (or drag it there).
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const COLORS = ['#ff4d6d', '#ffd23f', '#3bceac', '#4e7cff', '#b26bff', '#ff9f1c', '#22d3ee', '#ff6bd6'];
  const ROWS = [4, 5, 6, 5, 4]; // the honeycomb: 24 cells
  const CLEAR = 10; // this many of one colour on top bursts
  const SQ = 0.72; // the board is seen at a tilt: hexagons are squashed this much
  const HOP = 0.3, HOP_GAP = 0.075; // a disc's flight, and the gap between discs
  const WORDS = ['', 'Burst!', 'Double!', 'Triple!', 'Mega chain!', 'Unstoppable!'];

  // ---------- The board's cells and who touches whom ----------
  // gx counts in hexagon widths from the middle; rows of 4/5/6 sit half a hexagon apart.
  const CELLS = [];
  ROWS.forEach((n, r) => { for (let j = 0; j < n; j++) CELLS.push({ gx: j - (n - 1) / 2, gy: r - (ROWS.length - 1) / 2 }); });
  CELLS.forEach((a, i) => {
    a.nb = [];
    CELLS.forEach((b, k) => {
      if (i === k) return;
      const dy = Math.abs(a.gy - b.gy), dx = Math.abs(a.gx - b.gx);
      if ((dy === 0 && Math.abs(dx - 1) < 0.01) || (dy === 1 && Math.abs(dx - 0.5) < 0.01)) a.nb.push(k);
    });
  });
  // Painter's order: back rows first, so tall stacks in front cover the ones behind.
  const ORDER = CELLS.map((_, i) => i).sort((a, b) => CELLS[a].gy - CELLS[b].gy || CELLS[a].gx - CELLS[b].gx);

  const colorsFor = (lv) => Math.min(COLORS.length, 2 + lv);
  const goal = (lv) => 10 * lv * (lv + 3); // score to finish level lv: 40, 100, 180, 280...
  const rand = (n) => Math.floor(Math.random() * n);
  const topOf = (s) => (s.length ? s[s.length - 1] : -1);
  const runOf = (s) => {
    if (!s.length) return 0;
    const t = s[s.length - 1];
    let n = 0;
    for (let i = s.length - 1; i >= 0 && s[i] === t; i--) n++;
    return n;
  };
  const uniform = (s) => s.length > 0 && runOf(s) === s.length;

  // ---------- State ----------
  let cells, tray, score, level, over, overT, newBest = false, best = Kit.store.get('hexstack.best', 0);
  let mode = 'tray', focus = 0, cursor = 9, stickX = 0, view = null, confirmT = -9;
  let busy = null, dirty = [], chain = 0, trayT = 0, nopeT = -9, introT = 0, shown = 0, bump = 0, levelT = -9;
  let drag = null;

  function makeStack() {
    // 2-6 discs in 1-3 colour runs; the top colour often matches something on the board.
    const nc = colorsFor(level);
    const size = [2, 2, 3, 3, 4, 4, 5, 6][rand(8)];
    const runs = Math.min(size, 1 + rand(Math.min(3, nc)), size <= 2 ? 2 : 3);
    const colors = [];
    for (let i = 0; i < runs; i++) {
      let c;
      do { c = rand(nc); } while (i > 0 && c === colors[i - 1]);
      colors.push(c);
    }
    const tops = cells.filter((s) => s.length).map(topOf);
    if (tops.length && Math.random() < 0.55) {
      const t = tops[rand(tops.length)];
      if (colors.length < 2 || colors[colors.length - 2] !== t) colors[colors.length - 1] = t;
    }
    const st = [];
    let left = size;
    colors.forEach((c, i) => {
      const rest = colors.length - i - 1;
      const n = rest === 0 ? left : 1 + rand(Math.max(1, left - rest - 1));
      for (let k = 0; k < n; k++) st.push(c);
      left -= n;
    });
    return st;
  }
  function deal() { trayT = performance.now() / 1000; return [makeStack(), makeStack(), makeStack()]; }
  function fresh() {
    cells = CELLS.map(() => []);
    score = 0; shown = 0; level = 1; over = false; newBest = false; busy = null; dirty = [];
    // A few stacks to start on, so the first moves already have something to match.
    for (let k = 0; k < 4; k++) {
      let i;
      do { i = rand(CELLS.length); } while (cells[i].length);
      let st, tries = 0;
      do { st = makeStack(); } while (tries++ < 20 && CELLS[i].nb.some((n) => topOf(cells[n]) === topOf(st)));
      cells[i] = st;
    }
    tray = deal(); mode = 'tray'; focus = 0;
    save();
  }
  function save() {
    if (over) { Kit.store.set('hexstack.game', null); return; }
    Kit.store.set('hexstack.game', { cells, tray, score, level });
  }
  const saved = Kit.store.get('hexstack.game', null);
  if (saved && saved.cells && saved.cells.length === CELLS.length) {
    cells = saved.cells; tray = saved.tray; score = saved.score; shown = score; level = saved.level; over = false;
    if (tray.every((s) => !s)) tray = deal();
    focus = Math.max(0, tray.findIndex((s) => s));
  } else fresh();

  // ---------- Layout ----------
  let L = {};
  function layout(W, H) {
    const R = Math.min(H * 0.074, W * 0.052);
    const T = R * 0.17;
    L = { R, T, cx: W / 2, cy: H * 0.47, tr: R * 0.82, trayY: H * 0.855 };
    L.slots = [0, 1, 2].map((i) => ({ x: W / 2 + (i - 1) * R * 3.1, y: L.trayY }));
    L.side = Math.min(W * 0.17, (W / 2 - R * 5.6) / 2 + R * 0.4);
    L.lx = L.side; L.rx = W - L.side;
    const bw = Math.min(W * 0.2, 240), bh = Math.max(46, Math.min(H * 0.075, 60));
    L.btn = { x: L.rx - bw / 2, y: L.trayY - bh / 2, w: bw, h: bh };
    L.font = Math.max(18, Math.round(H * 0.034));
    const pw = Math.min(L.side * 1.55, 270);
    L.pl = { x: L.lx - pw / 2, y: H * 0.12, w: pw, h: H * 0.29 };
    L.pr = { x: L.rx - pw / 2, y: H * 0.12, w: pw, h: H * 0.5 };
    sprites.clear();
    bakeScene(W, H);
  }
  const cellX = (i) => L.cx + CELLS[i].gx * Math.sqrt(3) * L.R;
  const cellY = (i) => L.cy + CELLS[i].gy * 1.5 * L.R * SQ;
  const spacing = (n, T) => Math.min(T, (T / 0.17) * 2.5 / Math.max(1, n));
  const discY = (y, i, n, T) => y - T - i * spacing(n, T);

  function hexPath(c, x, y, r, sq = SQ) {
    c.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + k * Math.PI / 3;
      const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r * sq;
      if (k) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.closePath();
  }

  // ---------- Pictures, baked once per size (cheap to draw every frame) ----------
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function canvasOf(w, h) {
    const cv = document.createElement('canvas'), d = DPR();
    cv.width = Math.max(1, Math.ceil(w * d)); cv.height = Math.max(1, Math.ceil(h * d));
    const g = cv.getContext('2d'); g.scale(d, d);
    return { cv, g };
  }
  // Each colour's disc: a glossy candy slab with a thick side, a domed lit top, rim light and a specular glint.
  const sprites = new Map();
  function disc(color, R) {
    const key = color + Math.round(R * 10);
    let s = sprites.get(key);
    if (s) return s;
    const r = R * 0.84, T = R * 0.17;
    const w = Math.sqrt(3) * r + 8, h = 2 * r * SQ + T + 8;
    const { cv, g: c } = canvasOf(w, h);
    const ox = w / 2, oy = 4 + r * SQ;
    const v = (k, dy = 0, rr = r) => { const a = -Math.PI / 2 + k * Math.PI / 3; return [ox + Math.cos(a) * rr, oy + Math.sin(a) * rr * SQ + dy]; };
    const poly = (pts) => { c.beginPath(); pts.forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]))); c.closePath(); };
    // Side: the hull of the top and the same hexagon one slab lower, shaded like a rounded edge.
    poly([v(0), v(1), v(2, T), v(3, T), v(4, T), v(5)]);
    const sg = c.createLinearGradient(ox - r, 0, ox + r, 0);
    sg.addColorStop(0, shade(color, -0.62)); sg.addColorStop(0.22, shade(color, -0.25)); sg.addColorStop(0.42, shade(color, 0.05));
    sg.addColorStop(0.62, shade(color, -0.18)); sg.addColorStop(1, shade(color, -0.6));
    c.fillStyle = sg; c.fill();
    // a light band just below the top edge (rounded edge catching the light), dark line at the bottom
    c.beginPath(); [v(1, T * 0.38), v(2, T * 0.38), v(3, T * 0.38), v(4, T * 0.38)].forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.lineWidth = Math.max(1, T * 0.22); c.strokeStyle = 'rgba(255,255,255,0.22)'; c.stroke();
    c.beginPath(); [v(1, T), v(2, T), v(3, T), v(4, T)].forEach((p, k) => (k ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.lineWidth = 1.2; c.strokeStyle = shade(color, -0.75); c.stroke();
    // Top face: domed candy, lit from the upper left.
    hexPath(c, ox, oy, r);
    const tg = c.createRadialGradient(ox - r * 0.35, oy - r * 0.45 * SQ, r * 0.05, ox, oy, r * 1.1);
    tg.addColorStop(0, shade(color, 0.55)); tg.addColorStop(0.45, shade(color, 0.12)); tg.addColorStop(1, shade(color, -0.22));
    c.fillStyle = tg; c.fill();
    c.lineWidth = Math.max(1.2, R * 0.04); c.strokeStyle = shade(color, 0.6); c.stroke();
    // Bevel: an inner hexagon, brighter on top and shadowed at the bottom.
    hexPath(c, ox, oy + r * 0.02, r * 0.74);
    const bg = c.createLinearGradient(0, oy - r * SQ, 0, oy + r * SQ);
    bg.addColorStop(0, 'rgba(0,0,0,0.10)'); bg.addColorStop(0.5, 'rgba(255,255,255,0.05)'); bg.addColorStop(1, 'rgba(255,255,255,0.22)');
    c.fillStyle = bg; c.fill();
    c.lineWidth = Math.max(1, R * 0.025); c.strokeStyle = 'rgba(255,255,255,0.28)'; c.stroke();
    // Specular glint and a pin-point sparkle
    c.save();
    c.translate(ox - r * 0.32, oy - r * 0.36 * SQ); c.rotate(-0.32); c.scale(1, 0.42);
    const sp = c.createRadialGradient(0, 0, 0, 0, 0, r * 0.42);
    sp.addColorStop(0, 'rgba(255,255,255,0.9)'); sp.addColorStop(0.5, 'rgba(255,255,255,0.35)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sp; c.beginPath(); c.arc(0, 0, r * 0.42, 0, Math.PI * 2); c.fill();
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(ox + r * 0.38, oy + r * 0.3 * SQ, R * 0.03, 0, Math.PI * 2); c.fill();
    s = { cv, w, h, ox, oy };
    sprites.set(key, s);
    return s;
  }
  // A soft contact shadow under each stack.
  function shadowSprite(R) {
    const key = 'sh' + Math.round(R * 10);
    let s = sprites.get(key);
    if (s) return s;
    const w = R * 2.6, h = R * 2;
    const { cv, g } = canvasOf(w, h);
    g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = R * 0.25; g.shadowOffsetY = R * 0.06;
    hexPath(g, w / 2, h / 2, R * 0.86); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill();
    s = { cv, w, h };
    sprites.set(key, s);
    return s;
  }
  // Soft round glow and a four-point star, for light motes, flashes and sparkles.
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
    g.fillStyle = '#ffffff';
    g.beginPath();
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4, rr = k % 2 ? 5 : 30;
      g.lineTo(32 + Math.cos(a) * rr, 32 + Math.sin(a) * rr);
    }
    g.closePath(); g.fill();
    sprites.set(key, cv);
    return cv;
  }
  function raysSprite() {
    let s = sprites.get('rays');
    if (s) return s;
    const { cv, g } = canvasOf(512, 512);
    const rg = g.createRadialGradient(256, 256, 20, 256, 256, 256);
    rg.addColorStop(0, 'rgba(255,230,150,0.55)'); rg.addColorStop(1, 'rgba(255,200,120,0)');
    g.fillStyle = rg;
    for (let k = 0; k < 14; k++) {
      const a = k * Math.PI * 2 / 14;
      g.beginPath(); g.moveTo(256, 256);
      g.arc(256, 256, 256, a - 0.11, a + 0.11); g.closePath(); g.fill();
    }
    sprites.set('rays', cv);
    return cv;
  }

  function drawDisc(c, color, x, y, R, alpha = 1, scale = 1, sx = 1) {
    const s = disc(COLORS[color], R);
    if (alpha !== 1) c.globalAlpha = alpha;
    c.drawImage(s.cv, x - s.ox * scale * sx, y - s.oy * scale, s.w * scale * sx, s.h * scale);
    if (alpha !== 1) c.globalAlpha = 1;
  }
  function drawStack(c, st, x, y, R, extra, sq = 0) {
    // sq > 0 squashes the stack for a moment (a landing); it springs back.
    const T = R * 0.17, n = st.length + (extra ? extra.length : 0);
    if (!n) return;
    const sh = shadowSprite(R);
    c.drawImage(sh.cv, x - sh.w / 2, y - sh.h / 2 + R * 0.02, sh.w, sh.h);
    const sp = spacing(n, T) * (1 - sq);
    const at = (i) => y - T - i * sp;
    for (let i = 0; i < st.length; i++) drawDisc(c, st[i], x, at(i), R, 1, 1, 1 + sq * 0.5);
    if (extra) extra.forEach((col, k) => drawDisc(c, col, x, at(st.length + k), R, 1, 1, 1 + sq * 0.5));
  }
  function label(c, st, x, y, R, sq = 0) {
    // How many of the top colour there are, on the top disc.
    if (!st.length) return;
    const T = R * 0.17;
    const ty = y - T - (st.length - 1) * spacing(st.length, T) * (1 - sq);
    const fs = Math.round(R * 0.44);
    c.font = `700 ${fs}px ${Kit.FONT}`;
    c.lineWidth = fs * 0.24; c.strokeStyle = 'rgba(30,10,40,0.6)'; c.lineJoin = 'round';
    const n = runOf(st);
    c.strokeText(n, x, ty + 1);
    c.fillStyle = '#fff'; c.fillText(n, x, ty + 1);
  }

  // ---------- The scene: a sunset sea with a floating wooden island board, baked once per size ----------
  // Scene, board and the resting glass panels all go into one picture with a margin for screen shake.
  const sceneCv = document.createElement('canvas');
  const MARGIN = 14;
  let sea = { hz: 0, glints: [], motes: [] };
  function seeded(seed) { let x = seed; return () => { x = (x * 16807) % 2147483647; return x / 2147483647; }; }
  function bakeScene(W, H) {
    const d = DPR();
    const M = MARGIN;
    sceneCv.width = Math.ceil((W + 2 * M) * d); sceneCv.height = Math.ceil((H + 2 * M) * d);
    const g = sceneCv.getContext('2d');
    g.setTransform(d, 0, 0, d, M * d, M * d);
    const rnd = seeded(7);
    const hz = H * 0.5;
    sea.hz = hz;
    // Sky
    const sky = g.createLinearGradient(0, 0, 0, hz);
    sky.addColorStop(0, '#160b3d'); sky.addColorStop(0.35, '#3d1a6e'); sky.addColorStop(0.68, '#a8357a');
    sky.addColorStop(0.88, '#ff7a59'); sky.addColorStop(1, '#ffc27a');
    g.fillStyle = sky; g.fillRect(-M, -M, W + 2 * M, hz + M + 2);
    for (let k = 0; k < 90; k++) {
      const x = rnd() * W, y = rnd() * hz * 0.55, a = 0.25 + rnd() * 0.6;
      g.fillStyle = `rgba(255,255,255,${a * (1 - y / (hz * 0.6))})`;
      g.beginPath(); g.arc(x, y, 0.6 + rnd() * 1.3, 0, Math.PI * 2); g.fill();
    }
    // Sun with a big warm glow
    const sx = W * 0.5, sr = H * 0.13;
    let rg = g.createRadialGradient(sx, hz, 0, sx, hz, H * 0.7);
    rg.addColorStop(0, 'rgba(255,214,140,0.75)'); rg.addColorStop(0.3, 'rgba(255,140,110,0.25)'); rg.addColorStop(1, 'rgba(255,120,120,0)');
    g.fillStyle = rg; g.fillRect(0, 0, W, hz);
    g.save(); g.beginPath(); g.rect(0, 0, W, hz); g.clip();
    rg = g.createLinearGradient(0, hz - sr, 0, hz + sr);
    rg.addColorStop(0, '#fff6d0'); rg.addColorStop(1, '#ff9f5a');
    g.fillStyle = rg; g.beginPath(); g.arc(sx, hz + sr * 0.15, sr, 0, Math.PI * 2); g.fill();
    // stripes through the sun
    g.fillStyle = 'rgba(255,120,110,0.55)';
    for (let k = 0; k < 4; k++) g.fillRect(sx - sr, hz - sr * 0.15 - k * sr * 0.2, sr * 2, sr * (0.03 + k * 0.012));
    g.restore();
    // Clouds: lit from below by the sun
    const cloud = (x, y, s, a) => {
      g.save(); g.globalAlpha = a;
      const cg = g.createLinearGradient(0, y - s, 0, y + s * 0.5);
      cg.addColorStop(0, '#6b2c86'); cg.addColorStop(1, '#ff9a7a');
      g.fillStyle = cg;
      [[0, 0, 1], [-0.9, 0.2, 0.7], [0.9, 0.25, 0.75], [-1.7, 0.4, 0.45], [1.7, 0.42, 0.5]].forEach(([dx, dy, r]) => {
        g.beginPath(); g.ellipse(x + dx * s, y + dy * s, s * r * 1.2, s * r * 0.75, 0, 0, Math.PI * 2); g.fill();
      });
      g.restore();
    };
    cloud(W * 0.14, hz * 0.42, H * 0.05, 0.75); cloud(W * 0.86, hz * 0.3, H * 0.06, 0.7);
    cloud(W * 0.68, hz * 0.62, H * 0.035, 0.6); cloud(W * 0.3, hz * 0.7, H * 0.03, 0.55);
    // Far islands with palms, dark against the sky
    const island = (x, w, hgt) => {
      g.fillStyle = '#2a103f';
      g.beginPath(); g.moveTo(x - w / 2, hz + 1);
      g.quadraticCurveTo(x - w * 0.2, hz - hgt, x, hz - hgt * 0.9);
      g.quadraticCurveTo(x + w * 0.25, hz - hgt * 1.05, x + w / 2, hz + 1); g.fill();
    };
    const palm = (x, y, hgt, lean) => {
      g.strokeStyle = '#2a103f'; g.lineWidth = hgt * 0.06; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.4, y - hgt * 0.6, x + lean, y - hgt); g.stroke();
      g.fillStyle = '#2a103f';
      for (let k = 0; k < 6; k++) {
        const a = -Math.PI / 2 + (k - 2.5) * 0.55;
        const ex = x + lean + Math.cos(a) * hgt * 0.5, ey = y - hgt + Math.sin(a) * hgt * 0.25 + hgt * 0.12;
        g.beginPath(); g.moveTo(x + lean, y - hgt);
        g.quadraticCurveTo((x + lean + ex) / 2, y - hgt - hgt * 0.18, ex, ey);
        g.quadraticCurveTo((x + lean + ex) / 2, y - hgt - hgt * 0.05, x + lean, y - hgt); g.fill();
      }
    };
    island(W * 0.1, W * 0.22, H * 0.05); palm(W * 0.08, hz - H * 0.04, H * 0.11, -H * 0.02); palm(W * 0.13, hz - H * 0.035, H * 0.08, H * 0.02);
    island(W * 0.92, W * 0.2, H * 0.04); palm(W * 0.93, hz - H * 0.035, H * 0.1, H * 0.025);
    // Sea
    const sg = g.createLinearGradient(0, hz, 0, H);
    sg.addColorStop(0, '#ff9a6e'); sg.addColorStop(0.12, '#c4507e'); sg.addColorStop(0.5, '#4a1f6e'); sg.addColorStop(1, '#170a35');
    g.fillStyle = sg; g.fillRect(-M, hz, W + 2 * M, H - hz + M);
    // Sun path on the water and wave lines
    for (let k = 0; k < 70; k++) {
      const q = rnd(), y = hz + 3 + q * q * (H - hz) * 0.85;
      const wdt = sr * (1.5 - q) * (0.4 + rnd() * 0.9);
      g.fillStyle = `rgba(255,224,160,${0.5 * (1 - q)})`;
      g.fillRect(sx - wdt / 2 + (rnd() - 0.5) * sr * 0.6, y, wdt, 1.5 + q * 2.5);
    }
    for (let k = 0; k < 60; k++) {
      const q = rnd(), y = hz + 8 + q * (H - hz), x = rnd() * W, wdt = 10 + q * 50;
      g.fillStyle = `rgba(255,190,220,${0.08 + 0.1 * (1 - q)})`;
      g.fillRect(x, y, wdt, 1 + q * 1.5);
    }
    // Vignette
    const vg = g.createRadialGradient(W / 2, H * 0.48, Math.min(W, H) * 0.35, W / 2, H * 0.5, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(10,0,25,0)'); vg.addColorStop(1, 'rgba(10,0,25,0.6)');
    buildBoard(g);
    staticGlass(g);
    g.fillStyle = vg; g.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    // Living layers: glints on the sun path and light motes in the air
    sea.glints = Array.from({ length: 12 }, () => ({ x: sx + (rnd() - 0.5) * sr * 2.2, y: hz + 6 + rnd() * (H - hz) * 0.5, p: rnd() * 6, s: 0.6 + rnd() }));
    sea.motes = Array.from({ length: 18 }, () => ({ x: rnd() * W, y: rnd() * H, v: 6 + rnd() * 14, p: rnd() * 6, s: 3 + rnd() * 5 }));
  }

  // The board: a floating honeycomb island of warm wood on a rock, with sunken sockets for the stacks.
  function buildBoard(c) {
    const { R } = L;
    const depth = R * 0.7, rnd = seeded(3);
    const union = (dy, rr) => { c.beginPath(); CELLS.forEach((_, i) => { const x = cellX(i), y = cellY(i) + dy; for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 + k * Math.PI / 3; const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * SQ; if (k) c.lineTo(px, py); else c.moveTo(px, py); } c.closePath(); }); };
    const top = L.cy - 2 * 1.5 * R * SQ, bot = L.cy + 2 * 1.5 * R * SQ;
    // Shadow on the sea far below
    c.save();
    c.fillStyle = 'rgba(20,0,30,0.45)';
    c.beginPath(); c.ellipse(L.cx, bot + R * 2.6, R * 5.2, R * 0.55, 0, 0, Math.PI * 2); c.fill();
    c.restore();
    // Ripples round the platform where it meets its reflection
    c.strokeStyle = 'rgba(255,200,220,0.18)'; c.lineWidth = 2;
    [1, 1.12].forEach((k) => { c.beginPath(); c.ellipse(L.cx, bot + R * 1.45, R * 5.2 * k, R * 0.45 * k, 0, 0, Math.PI * 2); c.stroke(); });
    // Wooden slab side (stacked offsets give it real thickness)
    for (let dy = depth; dy > 0; dy -= 1.5) {
      union(dy, R * 1.12);
      c.fillStyle = dy > depth * 0.8 ? '#3c1f14' : shadeHex('#7a4426', -0.35 * (dy / depth)); c.fill();
    }
    // Grass fringe at the lip
    union(depth * 0.12, R * 1.14); c.fillStyle = '#4caf50'; c.fill();
    union(depth * 0.05, R * 1.13); c.fillStyle = '#7fd36a'; c.fill();
    // Top: warm planks with grain
    union(0, R * 1.08);
    const gr = c.createLinearGradient(0, top - R, 0, bot + R);
    gr.addColorStop(0, '#e8b578'); gr.addColorStop(1, '#b4743e');
    c.fillStyle = gr; c.fill();
    c.save(); union(0, R * 1.08); c.clip();
    for (let k = 0; k < 70; k++) {
      const y = top - R + rnd() * (bot - top + 2 * R), x = L.cx + (rnd() - 0.5) * R * 12;
      c.strokeStyle = `rgba(110,55,20,${0.12 + rnd() * 0.15})`; c.lineWidth = 1 + rnd() * 1.5;
      c.beginPath(); c.moveTo(x - R * 2, y); c.bezierCurveTo(x - R, y - 3, x + R, y + 3, x + R * 2, y); c.stroke();
    }
    // warm sun light from the back
    const lg = c.createRadialGradient(L.cx, top - R * 2, R, L.cx, top, R * 7);
    lg.addColorStop(0, 'rgba(255,220,160,0.35)'); lg.addColorStop(1, 'rgba(255,220,160,0)');
    c.fillStyle = lg; c.fillRect(L.cx - R * 8, top - R * 3, R * 16, R * 10);
    c.restore();
    // Sockets: sunken hexagons with an inner shadow and a lit lower lip
    CELLS.forEach((_, i) => {
      const x = cellX(i), y = cellY(i);
      hexPath(c, x, y, R * 0.93);
      c.fillStyle = 'rgba(255,240,210,0.35)'; c.fill();
      hexPath(c, x, y - R * 0.04, R * 0.88);
      const sgr = c.createLinearGradient(0, y - R * SQ, 0, y + R * SQ);
      sgr.addColorStop(0, '#5e2f17'); sgr.addColorStop(0.45, '#7d4321'); sgr.addColorStop(1, '#9c5a2c');
      c.fillStyle = sgr; c.fill();
      hexPath(c, x, y + R * 0.02, R * 0.6);
      c.fillStyle = 'rgba(60,25,10,0.18)'; c.fill();
    });
  }
  const shadeHex = (hex, amt) => shade(hex, amt);
  Kit.onResize(layout);

  // ---------- Resolving: hops and bursts, one step at a time ----------
  function nextStep() {
    while (dirty.length) {
      const x = dirty[0], s = cells[x];
      if (!s.length) { dirty.shift(); continue; }
      const top = topOf(s);
      const match = CELLS[x].nb.filter((k) => cells[k].length && topOf(cells[k]) === top);
      if (match.length) {
        // Neighbours pour onto this stack; but a mixed stack next to one that is all one colour gives
        // its top to that one instead, which uncovers its next colour.
        let from = match[0], to = x;
        const pure = match.filter((k) => uniform(cells[k]));
        if (match.length === 1 && !uniform(s) && pure.length) { from = x; to = pure[0]; }
        startHop(from, to);
        dirty = dirty.filter((k) => k !== to && k !== from);
        dirty.unshift(to); dirty.push(from);
        return true;
      }
      if (runOf(s) >= CLEAR) { startPop(x); return true; }
      dirty.shift();
    }
    return false;
  }
  function startHop(from, to) {
    const A = cells[from], n = runOf(A), color = topOf(A);
    const fromLen = A.length, base = cells[to].length;
    const list = [];
    for (let k = 0; k < n; k++) list.push({ k, t0: k * HOP_GAP, idx: fromLen - 1 - k, landed: false });
    A.length = fromLen - n;
    busy = { type: 'hop', from, to, color, list, base, fromLen, t: 0, end: (n - 1) * HOP_GAP + HOP + 0.08 };
  }
  function startPop(x) {
    const S = cells[x], n = runOf(S), color = topOf(S), len = S.length;
    S.length = len - n;
    chain++;
    const pts = n * chain;
    score += pts; bump = 1;
    const list = [];
    for (let k = 0; k < n; k++) list.push({ t0: k * 0.04, idx: len - 1 - k, len });
    busy = { type: 'pop', cell: x, color, list, t: 0, end: n * 0.04 + 0.35 };
    const px = cellX(x), py = cellY(x) - L.R * 1.2;
    flash(px, py, COLORS[color], L.R * 2.4);
    sfx.clear(1, chain);
    Kit.shake(3 + chain * 2, 0.25);
    Kit.float(`+${pts}`, px, py, { color: COLORS[color], size: L.R * 0.75 });
    Kit.float(WORDS[Math.min(chain, WORDS.length - 1)], L.cx, L.cy - L.R * 3.4, { color: ['#ffd23f', '#3bceac', '#4ea8de', '#ff9f1c', '#ff4d6d'][Math.min(chain, 5) - 1], size: L.R * (0.8 + Math.min(chain, 4) * 0.08), life: 1.2, big: true });
    if (score > best) {
      if (!newBest && best > 0) { newBest = true; Kit.float('New best!', L.lx, L.cy + L.R * 1.6, { color: '#ffd23f', size: L.font * 1.2, life: 1.6, big: true }); }
      best = score; Kit.store.set('hexstack.best', best); Kit.record('hexstack', best);
    }
  }
  function checkLevel() {
    let up = false;
    while (score >= goal(level)) { level++; up = true; }
    if (up) {
      levelT = performance.now() / 1000;
      setTimeout(() => { sfx.win(); Kit.confetti(70); }, 150);
      flash(L.cx, L.cy - L.R, '#ffe6a8', L.R * 6);
      Kit.float(`Level ${level}!`, L.cx, L.cy - L.R * 1.2, { color: '#7fe3ff', size: L.R * 1.1, life: 1.8, big: true });
      if (colorsFor(level) > colorsFor(level - 1)) Kit.float('New colour unlocked', L.cx, L.cy + L.R * 0.2, { color: COLORS[colorsFor(level) - 1], size: L.font * 1.3, life: 1.8, big: true });
    }
  }
  function endTurn() {
    busy = null;
    checkLevel();
    if (tray.every((s) => !s)) tray = deal();
    if (!tray[focus]) focus = Math.max(0, tray.findIndex((s) => s));
    if (cells.every((s) => s.length)) {
      over = true; overT = performance.now() / 1000 + 0.6;
      Kit.record('hexstack', best);
      setTimeout(() => sfx.over(), 400);
    }
    save();
  }

  // ---------- Moves ----------
  function nearestEmpty(from) {
    if (!cells[from].length) return from;
    let bestI = -1, bd = 1e9;
    cells.forEach((s, i) => {
      if (s.length) return;
      const d = Math.hypot(CELLS[i].gx - CELLS[from].gx, (CELLS[i].gy - CELLS[from].gy) * 0.87);
      if (d < bd) { bd = d; bestI = i; }
    });
    return bestI;
  }
  function lift(slot) {
    if (busy || over) return;
    if (!tray[slot]) { nope(); return; }
    focus = slot;
    const c = nearestEmpty(cursor);
    if (c < 0) { nope(); return; }
    cursor = c; stickX = CELLS[c].gx;
    mode = 'board';
    view = { x: L.slots[slot].x, y: L.slots[slot].y - L.R * 0.6 };
    sfx.pick();
  }
  function putBack() { mode = 'tray'; sfx.move(); }
  function place() {
    if (busy || over || mode !== 'board') return;
    if (cells[cursor].length) { nope(); return; }
    cells[cursor] = tray[focus];
    tray[focus] = null;
    mode = 'tray';
    const from = view ? { ...view } : { x: cellX(cursor), y: cellY(cursor) - L.R };
    busy = { type: 'drop', cell: cursor, t: 0, end: 0.16, from };
    chain = 0;
    const left = tray.findIndex((s) => s);
    if (left >= 0) focus = left;
  }
  function nope() { nopeT = performance.now() / 1000; sfx.nope(); }

  function boardMove(k) {
    const a = CELLS[cursor];
    if (k === 'left' || k === 'right') {
      const want = a.gx + (k === 'left' ? -1 : 1);
      const b = CELLS.findIndex((c) => c.gy === a.gy && Math.abs(c.gx - want) < 0.01);
      if (b >= 0) { cursor = b; stickX = CELLS[b].gx; sfx.move(); }
      return;
    }
    const gy = a.gy + (k === 'up' ? -1 : 1);
    let bi = -1, bs = 1e9;
    CELLS.forEach((c, i) => {
      if (c.gy !== gy) return;
      // Nearest to the column we started in, so Up, Up comes back straight; ties lean to the middle.
      const s = Math.abs(c.gx - stickX) + Math.abs(c.gx) * 0.01;
      if (s < bs) { bs = s; bi = i; }
    });
    if (bi < 0) { if (k === 'down') putBack(); return; }
    cursor = bi; sfx.move();
  }
  function trayItems() {
    const out = L.slots.map((s, i) => ({ i, x: s.x, y: s.y })).filter((it) => tray[it.i]);
    out.push({ i: 3, x: L.btn.x + L.btn.w / 2, y: L.btn.y + L.btn.h / 2 });
    return out;
  }
  function trayMove(dir) {
    const all = trayItems(), cur = all.find((it) => it.i === focus) || all[0];
    let bestIt = null, sc = Infinity;
    for (const it of all) {
      if (it.i === cur.i) continue;
      const dx = it.x - cur.x, dy = it.y - cur.y;
      let main, side;
      if (dir === 'left') { if (dx >= -1) continue; main = -dx; side = Math.abs(dy); }
      else if (dir === 'right') { if (dx <= 1) continue; main = dx; side = Math.abs(dy); }
      else if (dir === 'up') { if (dy >= -1) continue; main = -dy; side = Math.abs(dx); }
      else { if (dy <= 1) continue; main = dy; side = Math.abs(dx); }
      const s = main + side * 3;
      if (s < sc) { sc = s; bestIt = it; }
    }
    if (bestIt) { focus = bestIt.i; sfx.move(); }
    else if (dir === 'up' && focus < 3) lift(focus);
  }
  function pressButton() {
    const now = performance.now() / 1000;
    if (now - confirmT < 3) { confirmT = -9; fresh(); sfx.pick(); }
    else { confirmT = now; sfx.move(); }
  }

  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (over) { if (k === 'ok' && performance.now() / 1000 > overT + 0.8) { fresh(); sfx.pick(); } return; }
    if (k === 'restart') { pressButton(); return; }
    if (k === 'undo') return;
    if (mode === 'board') {
      if (k === 'ok') place(); else boardMove(k);
      return;
    }
    if (k === 'ok') { if (focus === 3) pressButton(); else lift(focus); return; }
    trayMove(k);
  });

  // ---------- Touch and mouse ----------
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const inBox = (e, b) => e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  function cellAt(x, y) {
    let bi = -1, bd = L.R * 0.95;
    CELLS.forEach((_, i) => {
      const d = Math.hypot(x - cellX(i), (y - cellY(i)) / SQ);
      if (d < bd) { bd = d; bi = i; }
    });
    return bi;
  }
  function slotAt(x, y) {
    return L.slots.findIndex((s) => Math.abs(x - s.x) < L.R * 1.4 && y > s.y - L.R * 2 && y < s.y + L.R * 1.1);
  }
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (over) { if (performance.now() / 1000 > overT + 0.8) fresh(); return; }
      if (inBox(e, L.btn)) { focus = 3; mode = 'tray'; pressButton(); return; }
      const s = slotAt(e.x, e.y);
      if (s >= 0 && tray[s] && !busy) {
        if (mode === 'board' && focus === s) { putBack(); return; }
        lift(s);
        if (mode === 'board') drag = { slot: s, moved: false };
        return;
      }
      const ci = cellAt(e.x, e.y);
      if (ci >= 0 && mode === 'board') { cursor = ci; stickX = CELLS[ci].gx; place(); }
    },
    move(e) {
      if (mode !== 'board') return;
      const ci = cellAt(e.x, e.y);
      if (ci >= 0 && ci !== cursor) { cursor = ci; stickX = CELLS[ci].gx; if (drag) drag.moved = true; }
    },
    up(e, cancel) {
      const d = drag; drag = null;
      if (!d || cancel || mode !== 'board') return;
      const ci = cellAt(e.x, e.y);
      if (ci >= 0 && d.moved) { cursor = ci; place(); }
    },
  });

  // ---------- Animation ----------
  function update(dt) {
    introT += dt;
    stepFx(dt);
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    if (mode === 'board' && L.R) {
      // Over a full cell it floats above that stack, so both stay readable.
      const under = cells[cursor].length;
      const tx = cellX(cursor), ty = cellY(cursor) - L.R * 0.95 - (under ? under * spacing(under, L.T) + L.R * 0.4 : 0);
      if (!view) view = { x: tx, y: ty };
      const k = Math.min(1, dt * 18);
      view.x = lerp(view.x, tx, k); view.y = lerp(view.y, ty, k);
    }
    if (!busy) return;
    busy.t += dt;
    if (busy.type === 'hop') {
      for (const d of busy.list) {
        if (!d.landed && busy.t >= d.t0 + HOP) {
          d.landed = true;
          cells[busy.to].push(busy.color);
          landT[busy.to] = performance.now() / 1000;
          sparkle(cellX(busy.to), discY(cellY(busy.to), cells[busy.to].length - 1, cells[busy.to].length, L.T), COLORS[busy.color], 2, 0.5);
          Kit.tone(420 + d.k * 45, { type: 'triangle', dur: 0.07, vol: 0.13 });
        }
      }
    } else if (busy.type === 'pop') {
      for (const d of busy.list) {
        if (!d.fx && busy.t >= d.t0) {
          d.fx = true;
          const py = discY(cellY(busy.cell), d.idx, d.len, L.T);
          Kit.burst(cellX(busy.cell), py, COLORS[busy.color], 3, 0.7);
          sparkle(cellX(busy.cell), py, COLORS[busy.color], 2, 0.8);
        }
      }
    }
    if (busy.t >= busy.end) {
      if (busy.type === 'drop') {
        sfx.drop();
        landT[busy.cell] = performance.now() / 1000;
        sparkle(cellX(busy.cell), cellY(busy.cell), '#fff4d0', 5, 0.45);
        dirty = [busy.cell];
      }
      busy = null;
      if (!nextStep()) endTurn();
    }
  }

  // ---------- Effects of our own: star sparkles and light flashes, drawn additively ----------
  const sparks = [], flashes = [];
  const landT = {}; // when a stack last took a disc, for its little squash
  function sparkle(x, y, color, n = 8, speed = 1) {
    for (let k = 0; k < n && sparks.length < 140; k++) {
      const a = Math.random() * Math.PI * 2, v = (80 + Math.random() * 220) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * speed, life: 0, max: 0.45 + Math.random() * 0.45,
        size: L.R * (0.35 + Math.random() * 0.45), color, rot: Math.random() * 3 });
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
  // The glass that never changes is baked into the scene; focus adds a glowing ring on top.
  function staticGlass(g) {
    const tint = 'rgba(80,30,110,0.35)';
    Kit.glass(g, L.pl.x, L.pl.y, L.pl.w, L.pl.h, 22, { tint });
    Kit.glass(g, L.pr.x, L.pr.y, L.pr.w, L.pr.h, 22, { tint });
    L.slots.forEach((s) => Kit.glass(g, s.x - L.R * 1.35, s.y - L.R * 1.7, L.R * 2.7, L.R * 2.55, L.R * 0.42, { tint: 'rgba(60,20,90,0.30)' }));
    Kit.glass(g, L.btn.x, L.btn.y, L.btn.w, L.btn.h, L.btn.h / 2, { tint: 'rgba(255,255,255,0.08)' });
  }
  function focusRing(c, x, y, w, h, r, t) {
    const p = 0.5 + 0.5 * Math.sin(t * 5);
    c.save();
    roundRect(c, x, y, w, h, r); c.fillStyle = `rgba(255,210,63,${0.12 + 0.08 * p})`; c.fill();
    c.shadowColor = '#ffd23f'; c.shadowBlur = 16 + 12 * p;
    c.lineWidth = 3 + p; c.strokeStyle = '#ffe680';
    roundRect(c, x - 2, y - 2, w + 4, h + 4, r + 2); c.stroke();
    c.restore();
  }
  function pill(c, b, label, on, t, icon, baked) {
    if (!baked) Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: on ? 'rgba(255,210,63,0.30)' : 'rgba(255,255,255,0.08)' });
    if (on) focusRing(c, b.x, b.y, b.w, b.h, b.h / 2, t);
    const fs = Math.round(Math.min(b.h * 0.4, b.w * 0.12));
    c.font = `600 ${fs}px ${Kit.UI}`;
    const tw = c.measureText(label).width, iw = icon ? fs * 1.3 : 0;
    const x0 = b.x + b.w / 2 - (tw + iw) / 2;
    if (icon) icon(c, x0 + fs * 0.45, b.y + b.h / 2, fs * 1.1, '#fff');
    c.fillStyle = '#fff'; c.textAlign = 'left';
    c.fillText(label, x0 + iw, b.y + b.h / 2 + 1);
    c.textAlign = 'center';
  }
  function bar(c, x, y, w, h, p) {
    roundRect(c, x, y, w, h, h / 2); c.fillStyle = 'rgba(10,0,30,0.55)'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.18)'; c.stroke();
    if (p <= 0) return;
    const fw = Math.max(h, (w - 4) * p);
    roundRect(c, x + 2, y + 2, fw, h - 4, (h - 4) / 2);
    const g = c.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#ff7a59'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#7cf0a0');
    c.fillStyle = g; c.fill();
    roundRect(c, x + 4, y + 3, fw - 4, (h - 4) * 0.38, h * 0.2); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
  }

  // ---------- Drawing ----------
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000;
    const { R, font } = L;
    c.drawImage(sceneCv, -MARGIN, -MARGIN, W + 2 * MARGIN, H + 2 * MARGIN);
    // Living sea: twinkling glints, and warm motes drifting up
    c.globalCompositeOperation = 'lighter';
    for (const g of sea.glints) {
      const a = Math.pow(Math.max(0, Math.sin(t * 1.6 * g.s + g.p)), 6);
      if (a < 0.02) continue;
      const s = R * 0.35 * g.s;
      c.globalAlpha = a; c.drawImage(starSprite('#ffe6a8'), g.x - s, g.y - s, s * 2, s * 2);
    }
    for (const m of sea.motes) {
      const y = ((m.y - t * m.v) % H + H) % H, x = m.x + Math.sin(t * 0.5 + m.p) * 20;
      c.globalAlpha = 0.35 + 0.3 * Math.sin(t * 2 + m.p);
      c.drawImage(glowSprite('#ffc27a'), x - m.s * 2, y - m.s * 2, m.s * 4, m.s * 4);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Score panel (left)
    const pw = L.pl.w, py = L.pl.y, ph = L.pl.h;
    c.font = `600 ${Math.round(font * 0.85)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fillText('SCORE', L.lx, py + ph * 0.17);
    c.save(); c.translate(L.lx, py + ph * 0.47); const sb = 1 + bump * 0.2; c.scale(sb, sb);
    Kit.title(c, String(Math.round(shown)), 0, 0, Math.round(font * 2.5), { color: '#ffd23f', glow: bump > 0.2 ? '#ffb703' : null });
    c.restore();
    c.font = `600 ${Math.round(font * 0.95)}px ${Kit.FONT}`;
    const bt = String(best), bw2 = c.measureText(bt).width;
    iconCrown(c, L.lx - bw2 / 2 - font * 0.5, py + ph * 0.79, font * 1.1);
    c.fillStyle = '#ffe9a8'; c.fillText(bt, L.lx + font * 0.45, py + ph * 0.8);
    c.font = `500 ${Math.round(font * 0.8)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,240,230,0.8)';
    ['Same colours hop together.', `${CLEAR} on top burst!`].forEach((s, i) => c.fillText(s, L.lx, py + ph + font * (1.5 + i * 1.2)));

    // Level panel (right)
    Kit.title(c, `Level ${level}`, L.rx, py + H * 0.06, Math.round(font * 1.45), { color: '#9fe8ff' });
    const g0 = level > 1 ? goal(level - 1) : 0, g1 = goal(level);
    const bwid = pw * 0.8, bh2 = Math.max(16, font * 0.75);
    bar(c, L.rx - bwid / 2, py + H * 0.12, bwid, bh2, clamp((shown - g0) / (g1 - g0), 0, 1));
    c.font = `600 ${Math.round(font * 0.82)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText(`Goal  ${Math.round(shown)} / ${g1}`, L.rx, py + H * 0.12 + bh2 + font * 0.8);
    c.fillStyle = 'rgba(255,255,255,0.6)'; c.font = `500 ${Math.round(font * 0.78)}px ${Kit.UI}`;
    c.fillText('Colours', L.rx, py + H * 0.29);
    const nc = colorsFor(level), per = nc > 4 ? Math.ceil(nc / 2) : nc, sw = Math.min(R * 0.5, bwid / per / 1.8);
    for (let i = 0; i < nc; i++) {
      const row = Math.floor(i / per), col = i % per, inRow = Math.min(per, nc - row * per);
      drawDisc(c, i, L.rx + (col - (inRow - 1) / 2) * sw * 1.85, py + H * 0.36 + row * sw * 1.6, sw * 1.15);
    }

    // New game pill
    const asking = now - confirmT < 3;
    pill(c, L.btn, asking ? 'OK again = sure' : 'New game', mode === 'tray' && focus === 3 && !over && !Kit.touchFirst(), t, asking ? null : iconRestart, true);

    // Board
    const held = mode === 'board' && !over ? tray[focus] : null;
    if (held && !busy) {
      const ok = !cells[cursor].length;
      const pulse = 0.5 + 0.5 * Math.sin(t * 7);
      if (ok) {
        const top = topOf(held);
        CELLS[cursor].nb.forEach((k) => {
          if (topOf(cells[k]) !== top) return;
          hexPath(c, cellX(k), cellY(k), R * 0.98);
          c.lineWidth = 3 + pulse * 2; c.strokeStyle = Kit.rgba(COLORS[top], 0.55 + 0.4 * pulse); c.stroke();
        });
      }
      c.save();
      hexPath(c, cellX(cursor), cellY(cursor), R * 0.97);
      c.fillStyle = ok ? 'rgba(255,240,170,0.28)' : 'rgba(255,60,90,0.25)'; c.fill();
      c.shadowColor = ok ? '#ffd23f' : '#ff4d6d'; c.shadowBlur = 16 + pulse * 12;
      c.lineWidth = 4 + pulse * 2; c.strokeStyle = ok ? '#ffe680' : '#ff6b85'; c.stroke();
      c.restore();
    }
    for (const i of ORDER) {
      const x = cellX(i), y = cellY(i);
      const st = cells[i];
      if (busy && busy.type === 'drop' && busy.cell === i) {
        const k = Math.min(1, busy.t / busy.end), kk = k * k;
        drawStack(c, st, lerp(busy.from.x, x, kk), lerp(busy.from.y, y, kk), R, null, -0.15 * kk);
        continue;
      }
      let extra = null;
      if (busy && busy.type === 'hop' && busy.from === i) extra = busy.list.filter((d) => busy.t < d.t0).map(() => busy.color);
      if (!st.length && !(extra && extra.length)) continue;
      const age = now - (landT[i] || -9);
      const sq = age < 0.5 ? Math.sin(age * 22) * Math.exp(-age * 9) * 0.22 : 0;
      drawStack(c, st, x, y, R, extra, sq);
      if (!(busy && (busy.from === i || busy.to === i || busy.cell === i))) label(c, st, x, y, R, sq);
    }
    if (busy && busy.type === 'hop') {
      const fx = cellX(busy.from), fy = cellY(busy.from), tx = cellX(busy.to), ty = cellY(busy.to);
      const total = busy.base + busy.list.length;
      for (const d of busy.list) {
        if (busy.t < d.t0 || d.landed) continue;
        const q = clamp((busy.t - d.t0) / HOP, 0, 1), e = ease.inOut(q);
        const sy = discY(fy, d.idx, busy.fromLen, L.T), ey = discY(ty, busy.base + d.k, total, L.T);
        const x = lerp(fx, tx, e), y = lerp(sy, ey, e) - Math.sin(q * Math.PI) * R * 1.4;
        // stretch while rising and falling, round at the top of the arc
        const st = 1 + Math.abs(Math.cos(q * Math.PI)) * 0.12;
        drawDisc(c, busy.color, x, y, R, 1, 1 + Math.sin(q * Math.PI) * 0.12, 1 / st);
      }
    }
    if (busy && busy.type === 'pop') {
      const x = cellX(busy.cell), y = cellY(busy.cell);
      for (const d of busy.list) {
        const q = (busy.t - d.t0) / 0.3;
        const by = discY(y, d.idx, d.len, L.T);
        if (q < 0) { drawDisc(c, busy.color, x, by, R); continue; }
        if (q > 1) continue;
        drawDisc(c, busy.color, x, by - q * R * 1.3, R, 1 - q, 1 + q * 0.6);
      }
    }

    // Tray
    const since = now - trayT;
    L.slots.forEach((s, i) => {
      const st = tray[i];
      const focused = !over && focus === i && !Kit.touchFirst();
      if (focused && mode === 'tray') focusRing(c, s.x - R * 1.35, s.y - R * 1.7, R * 2.7, R * 2.55, R * 0.42, t);
      else if (focused) { roundRect(c, s.x - R * 1.35, s.y - R * 1.7, R * 2.7, R * 2.55, R * 0.42); c.lineWidth = 2; c.strokeStyle = 'rgba(255,210,63,0.4)'; c.stroke(); }
      if (!st || (mode === 'board' && focus === i)) return;
      const enter = clamp((since - i * 0.08) / 0.45, 0, 1);
      const off = (1 - ease.back(enter)) * R * 3;
      const bob = focused && mode === 'tray' ? Math.sin(t * 5) * 3 : 0;
      const shakeX = focused && now - nopeT < 0.3 ? Math.sin((now - nopeT) * 60) * R * 0.1 : 0;
      c.globalAlpha = enter;
      drawStack(c, st, s.x + shakeX, s.y + R * 0.35 + off + bob, L.tr);
      label(c, st, s.x + shakeX, s.y + R * 0.35 + off + bob, L.tr);
      c.globalAlpha = 1;
    });

    // The held stack floats over the board with its shadow below.
    if (held && view) {
      const shakeX = now - nopeT < 0.3 ? Math.sin((now - nopeT) * 60) * R * 0.12 : 0;
      const bob = Math.sin(t * 4) * R * 0.06;
      if (!cells[cursor].length) {
        c.globalAlpha = 0.45;
        const sh = shadowSprite(R);
        c.drawImage(sh.cv, cellX(cursor) - sh.w * 0.4, cellY(cursor) - sh.h * 0.4, sh.w * 0.8, sh.h * 0.8);
        c.globalAlpha = 1;
      }
      drawStack(c, held, view.x + shakeX, view.y + bob, R);
      label(c, held, view.x + shakeX, view.y + bob, R);
    }

    drawFx(c);

    // Speaker (tap or M)
    const m = muteBox();
    iconSpeaker(c, m.x + m.w / 2, m.y + m.h / 2, m.h * 0.6, Kit.muted);

    // One-line how to play
    const tip = Kit.touchFirst() ? 'Tap a stack, then tap a cell' : mode === 'board'
      ? 'Arrows move it  ·  OK sets it down  ·  ▼ off the board puts it back'
      : focus === 3 ? 'OK twice starts a new game  ·  Back exits' : '◀ ▶ pick a stack  ·  OK lifts it  ·  Back exits';
    c.font = `500 ${Math.round(font * 0.8)}px ${Kit.UI}`;
    const tw = c.measureText(tip).width + font * 1.6;
    roundRect(c, W / 2 - tw / 2, H * 0.968 - font * 0.72, tw, font * 1.44, font * 0.72);
    c.fillStyle = 'rgba(15,5,35,0.45)'; c.fill();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.fillText(tip, W / 2, H * 0.968 + 1);

    // Level banner: slides in at the start and on every level up
    const bannerAge = Math.min(introT, now - levelT);
    if (bannerAge < 2.4 && !over) {
      const k = bannerAge < 0.5 ? ease.back(bannerAge / 0.5) : bannerAge > 2 ? 1 - ease.inOut((bannerAge - 2) / 0.4) : 1;
      const by = lerp(-H * 0.08, H * 0.075, k);
      c.globalAlpha = clamp(k, 0, 1);
      ribbon(c, W / 2, by, Math.min(W * 0.36, R * 6.5), Math.max(44, H * 0.085), `Level ${level}`, '#ff5c8a');
      c.globalAlpha = 1;
    }

    if (over && now > overT) {
      const a = clamp((now - overT) / 0.45, 0, 1);
      c.fillStyle = `rgba(12,2,28,${0.62 * a})`; c.fillRect(0, 0, W, H);
      c.save();
      c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const rs = Math.min(W, H) * 0.9;
      c.save(); c.rotate(t * 0.25); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.7 * a;
      c.drawImage(raysSprite(), -rs / 2, -rs / 2, rs, rs); c.restore();
      const pw2 = Math.min(W * 0.8, R * 9.5), ph2 = R * 6;
      roundRect(c, -pw2 / 2, -ph2 / 2, pw2, ph2, 30);
      const pg = c.createLinearGradient(0, -ph2 / 2, 0, ph2 / 2);
      pg.addColorStop(0, '#5b2a9c'); pg.addColorStop(1, '#2a0f55');
      c.fillStyle = pg; c.fill();
      Kit.glass(c, -pw2 / 2, -ph2 / 2, pw2, ph2, 30, { tint: 'rgba(90,30,140,0.4)', edge: 'rgba(255,220,150,0.7)' });
      ribbon(c, 0, -ph2 / 2 + R * 0.1, pw2 * 0.78, R * 1.05, 'Board full!', '#ff5c8a');
      c.font = `600 ${Math.round(R * 0.36)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,255,255,0.75)';
      c.fillText('YOUR SCORE', 0, -ph2 * 0.17);
      Kit.title(c, String(score), 0, ph2 * 0.02, Math.round(R * 1.2), { color: '#ffd23f', glow: '#ff9f1c' });
      c.font = `600 ${Math.round(R * 0.42)}px ${Kit.FONT}`;
      const line = newBest ? 'New best score!' : `Best ${best}  ·  Level ${level}`;
      const lw2 = c.measureText(line).width;
      iconCrown(c, -lw2 / 2 - R * 0.35, ph2 * 0.2, R * 0.5);
      c.fillStyle = newBest ? '#ffe680' : 'rgba(255,255,255,0.9)'; c.fillText(line, R * 0.15, ph2 * 0.2 + 1);
      const b = { x: -R * 2.2, y: ph2 * 0.3, w: R * 4.4, h: R * 0.85 };
      pill(c, b, Kit.touchFirst() ? 'Tap to play again' : 'OK  Play again', true, t, iconRestart);
      c.restore();
    }
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (best > 0) Kit.record('hexstack', best);
})();
