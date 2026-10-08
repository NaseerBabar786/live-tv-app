// Bubble Bazaar: a long wooden lane holds a picture made of glossy marbles. Shoot marbles up the lane;
// three or more of one colour touching pop, and anything no longer joined to the back board rolls off.
// Free every gold star before the marbles run out. Popped marbles fill the three baskets, and a full
// basket gives a booster (Rainbow, Bomb, Paint, Rocket).
// Remote: Left/Right aim, OK shoots, Up swaps the next marble, Down picks a booster, Back pauses.
// Mouse and touch: point to aim, click or tap to shoot, tap the shooter to swap.
'use strict';

(() => {
  const { sfx, ease, shade, rgba, roundRect, clamp, lerp } = Kit;
  const ID = 'bubblebazaar';
  const COLS = 13, RH = Math.sqrt(3) / 2, LANE_W = 13, GAP = 7.2, F = 15, SPEED = 30;
  const RAINBOW = -1, STONE = -2, BOMB = -3, ROCKET = -4;
  const PALETTE = ['#ff2d55', '#ffbe0b', '#2d6bff', '#00c46a', '#ff5fbf', '#8b5cff', '#ff7a1a', '#00cfe0'];
  const BOOSTERS = [
    { id: 'rainbow', name: 'Rainbow', tip: 'Matches any colour' },
    { id: 'bomb', name: 'Bomb', tip: 'Blasts everything around it' },
    { id: 'paint', name: 'Paint', tip: 'Turns your marble the colour you aim at' },
    { id: 'rocket', name: 'Rocket', tip: 'Flies straight through up to 16 marbles' },
  ];
  const BASKET_CAP = 30;

  // ---------- Saved progress ----------
  const S = {
    level: Kit.store.get(ID + '.level', 1),
    streak: Kit.store.get(ID + '.streak', 0),
    best: Kit.store.get(ID + '.best', 0),
    boost: Kit.store.get(ID + '.boost', [3, 3, 3, 3]),
    save() {
      Kit.store.set(ID + '.level', this.level); Kit.store.set(ID + '.streak', this.streak);
      Kit.store.set(ID + '.best', this.best); Kit.store.set(ID + '.boost', this.boost);
    },
  };

  // ---------- Seeded randomness so each level is the same picture every time ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- Pictures: x -1..1 across the lane, y up (far end positive) ----------
  // Slots: 0/1 background bands, 2-4 the picture's own parts.
  const inC = (x, y, cx, cy, r) => (x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r;
  const starR = (x, y, rin, rout) => {
    const th = Math.atan2(x, y), p = (((th / (Math.PI * 2 / 5)) % 1) + 1) % 1;
    const t = Math.abs(p - 0.5) * 2;
    return Math.hypot(x, y) <= rin + (rout - rin) * t * t;
  };
  const PICS = [
    { name: 'Heart', f(x, y) {
      const h = (a, b) => { a *= 1.25; b = b * 1.25 - 0.25; return Math.pow(a * a + b * b - 1, 3) - a * a * b * b * b <= 0; };
      if (h(x, y)) return h(x * 1.22, y * 1.22 + 0.06) ? (inC(x, y, -0.32, 0.38, 0.13) ? 4 : 2) : 3;
      return -1; } },
    { name: 'Star', f(x, y) {
      if (starR(x, y, 0.38, 0.95)) return starR(x, y, 0.26, 0.66) ? 2 : 3;
      return inC(x, y, 0, 0, 1.05) && Math.hypot(x, y) > 0.98 ? 4 : -1; } },
    { name: 'Flower', f(x, y) {
      const cy = 0.3, r = Math.hypot(x, y - cy), th = Math.atan2(x, y - cy);
      if (r < 0.2) return 3;
      if (r < 0.2 + 0.42 * Math.pow(Math.abs(Math.cos(th * 2.5)), 0.6)) return 2;
      if (Math.abs(x) < 0.07 && y < 0.1 && y > -1.05) return 4;
      if (inC(x, y, 0.22, -0.55, 0.16) || inC(x, y, -0.22, -0.8, 0.15)) return 4;
      return -1; } },
    { name: 'Moon and star', f(x, y) {
      if (inC(x, y, -0.15, 0, 0.75) && !inC(x, y, 0.15, 0.12, 0.62)) return 2;
      if (starR(x - 0.42, y - 0.05, 0.1, 0.3)) return 3;
      if (inC(x, y, 0.62, 0.72, 0.07) || inC(x, y, -0.7, 0.85, 0.07) || inC(x, y, 0.75, -0.7, 0.07)) return 4;
      return -1; } },
    { name: 'Sun', f(x, y) {
      const r = Math.hypot(x, y), th = Math.atan2(x, y);
      if (r < 0.52) {
        if (inC(x, y, -0.2, 0.15, 0.08) || inC(x, y, 0.2, 0.15, 0.08)) return 3;
        if (r > 0.22 && r < 0.33 && y < -0.05) return 3;
        return 2;
      }
      if (r < 0.95 && Math.cos(th * 8) > 0.55) return 4;
      return -1; } },
    { name: 'Fish', f(x, y) {
      const bx = x + 0.1;
      if ((bx * bx) / 0.45 + (y * y) / 0.16 <= 1) {
        if (inC(x, y, -0.45, 0.08, 0.07)) return 0;
        return Math.cos(bx * 12) > 0.6 ? 3 : 2;
      }
      if (x > 0.45 && x < 0.95 && Math.abs(y) < (x - 0.45) * 1.1) return 4;
      if (inC(x, y, -0.3, 0.75, 0.08) || inC(x, y, -0.15, 0.95, 0.06)) return 4;
      return -1; } },
    { name: 'Ice cream', f(x, y) {
      if (inC(x, y, 0, 0.45, 0.5) || (y > 0.05 && y < 0.25 && Math.abs(x) < 0.5 && Math.cos(x * 14) > -0.2)) return inC(x, y, -0.18, 0.62, 0.1) ? 4 : 2;
      if (y <= 0.1 && y > -1.05 && Math.abs(x) < (y + 1.05) * 0.42) return (Math.floor((x + y) * 5) + Math.floor((x - y) * 5)) % 2 ? 3 : 4;
      return -1; } },
    { name: 'TV', f(x, y) {
      if (Math.abs(x) < 0.85 && y > -0.55 && y < 0.45) {
        if (Math.abs(x + 0.12) < 0.58 && y > -0.42 && y < 0.32) return 2;
        if (x > 0.58 && inC(x, y, 0.7, 0.15, 0.07)) return 3;
        return 4;
      }
      if (y >= 0.45 && y < 1.0 && (Math.abs(x - (y - 0.45) * 0.6) < 0.06 || Math.abs(x + (y - 0.45) * 0.6) < 0.06)) return 3;
      if (y <= -0.55 && y > -0.75 && Math.abs(x) < 0.5 && Math.abs(x) > 0.28) return 4;
      return -1; } },
    { name: 'Watermelon', f(x, y) {
      const r = Math.hypot(x, y + 0.35);
      if (y + 0.35 >= 0 && r < 0.95) {
        if (r > 0.82) return 4;
        if (r > 0.74) return 0;
        const th = Math.atan2(x, y + 0.35);
        return (r > 0.3 && r < 0.6 && Math.abs(Math.sin(th * 5)) < 0.18) ? 3 : 2;
      }
      return -1; } },
    { name: 'House', f(x, y) {
      if (y > 0.15 && y < 0.95 && Math.abs(x) < (0.95 - y) * 1.15) return 3;
      if (Math.abs(x) < 0.62 && y <= 0.15 && y > -0.9) {
        if (Math.abs(x) < 0.14 && y < -0.35) return 4;
        if (Math.abs(Math.abs(x) - 0.36) < 0.12 && y > -0.25 && y < 0.02) return 4;
        return 2;
      }
      if (inC(x, y, 0.75, 0.8, 0.13)) return 4;
      return -1; } },
  ];

  // ---------- Grid ----------
  let grid = [], rows = 0, levelColors = [], gemsTotal = 0, gemsGot = 0, shots = 0, score = 0, picName = '';
  let startShots = 1, queue = [], extraUsed = false, combo = 0, popAnim = [];
  const rowLen = (r) => (r % 2 ? COLS - 1 : COLS);
  const cellX = (r, c) => 0.5 + c + (r % 2 ? 0.5 : 0);
  const cellY = (r) => 0.5 + r * RH;
  const get = (r, c) => (r >= 0 && r < grid.length && c >= 0 && c < rowLen(r) ? grid[r][c] : undefined);
  function neighbors(r, c) {
    const o = r % 2 ? 0 : -1;
    return [[r, c - 1], [r, c + 1], [r - 1, c + o], [r - 1, c + o + 1], [r + 1, c + o], [r + 1, c + o + 1]]
      .filter(([a, b]) => a >= 0 && a < grid.length && b >= 0 && b < rowLen(a));
  }
  function frontRow() {
    for (let r = grid.length - 1; r >= 0; r--) if (grid[r].some(Boolean)) return r;
    return -1;
  }
  function colorsLeft() {
    const n = new Map();
    for (const row of grid) for (const b of row) if (b && b.k >= 0) n.set(b.k, (n.get(b.k) || 0) + 1);
    return n;
  }

  function buildLevel(L) {
    const R = rng(L * 7919 + 13);
    rows = Math.min(13 + L, 24);
    const n = clamp(4 + Math.floor((L - 1) / 3), 4, 7);
    const pal = [...PALETTE.keys()];
    for (let i = pal.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [pal[i], pal[j]] = [pal[j], pal[i]]; }
    levelColors = pal.slice(0, n);
    const slot = [0, 1, 2, 3, 4].map((s) => levelColors[s % n]);
    const pic = PICS[(L - 1) % PICS.length];
    picName = pic.name;
    const aspect = (rows * RH) / LANE_W;
    const bandH = 2 + Math.floor(R() * 2);
    grid = [];
    for (let r = 0; r < rows + 40; r++) grid.push(new Array(rowLen(r)).fill(null));
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < rowLen(r); c++) {
        const x = (cellX(r, c) / LANE_W - 0.5) * 2.1, y = (0.5 - cellY(r) / (rows * RH)) * 2 * aspect;
        let s = pic.f(x, y);
        if (s < 0) s = Math.floor(r / bandH) % 2;
        let k = slot[s];
        if (R() < 0.06) k = levelColors[Math.floor(R() * n)];
        grid[r][c] = { k, gem: false };
      }
    }
    // Stones from level 3: grey marbles that never match; free them by dropping or a bomb.
    const stones = L >= 3 ? Math.min(L - 1, 10) : 0;
    for (let i = 0; i < stones; i++) {
      const r = Math.floor(rows * 0.3 + R() * rows * 0.7), c = Math.floor(R() * rowLen(r));
      grid[r][c].k = STONE;
    }
    gemsTotal = Math.min(3 + L, 12); gemsGot = 0;
    let placed = 0, tries = 0;
    while (placed < gemsTotal && tries++ < 500) {
      const from = Math.max(0.05, 0.3 - L * 0.02);
      const r = Math.floor(rows * from + R() * rows * (1 - from)), c = Math.floor(R() * rowLen(r));
      const b = grid[r][c];
      if (b.k >= 0 && !b.gem) { b.gem = true; placed++; }
    }
    gemsTotal = placed;
    shots = Math.round((rows * COLS) / 10) + 6 - Math.min(6, Math.floor(L / 3));
    startShots = shots; score = 0; combo = 0; extraUsed = false;
    queue = [pickColor(), pickColor()];
    flying = null; flyers.length = 0; popAnim = []; rollers.length = 0;
    baskets.forEach((b) => { b.n = 0; b.glow = 0; });
    cam.y = cellY(frontRow()) + GAP; cam.show = 0;
    aimA = 0; aimCache = null; armed = -1;
  }

  // Next marble: a colour still on the board, leaning toward the ones near the front.
  function pickColor() {
    const fr = frontRow();
    const w = new Map();
    for (let r = 0; r <= fr; r++) for (const b of grid[r]) if (b && b.k >= 0) w.set(b.k, (w.get(b.k) || 0) + (r >= fr - 3 ? 4 : 1));
    if (!w.size) return levelColors[0];
    let t = 0; for (const v of w.values()) t += v;
    let x = Math.random() * t;
    for (const [k, v] of w) { x -= v; if (x <= 0) return k; }
    return [...w.keys()][0];
  }
  function refreshQueue() {
    const left = colorsLeft();
    for (let i = 0; i < queue.length; i++) if (queue[i] >= 0 && !left.has(queue[i])) queue[i] = pickColor();
  }

  // ---------- Camera: the lane rolls closer as the picture is cleared ----------
  const cam = { y: 20, show: 0 };
  let cx = 0, baseY = 0, hz = 0, U = 1, topY = 0, landscape = true, shooter = { x: 0, y: 0, r: 40 };
  let layout = {};
  function sAt(z) { return F / (F + Math.max(-F * 0.7, z)); }
  function project(x, y) {
    const s = sAt(cam.y - y);
    return { x: cx + (x - LANE_W / 2) * U * s, y: hz + (baseY - hz) * s, s };
  }
  function unproject(sx, sy) {
    const s = clamp((sy - hz) / (baseY - hz), 0.05, 3);
    const z = F / s - F;
    return { x: (sx - cx) / (U * s) + LANE_W / 2, y: cam.y - z };
  }
  function updateCamera() {
    const W = Kit.W, H = Kit.H;
    const sFar = sAt(cam.y);
    hz = (topY - baseY * sFar) / (1 - sFar);
  }
  Kit.onResize((W, H) => {
    landscape = W > H * 1.05;
    baseY = H * (landscape ? 0.84 : 0.79);
    topY = H * (landscape ? 0.08 : 0.12);
    cx = W / 2;
    const laneFront = landscape ? Math.min(W * 0.44, H * 0.66) : W * 0.9;
    U = laneFront / (LANE_W * sAt(GAP));
    shooter = { x: cx, y: baseY, r: Math.min(laneFront * 0.075, H * 0.055) };
    const u = Math.min(W, H);
    layout.bs = landscape ? Math.min(H * 0.105, W * 0.065) : Math.min(W * 0.17, H * 0.085);
    layout.basketW = landscape ? Math.min(laneFront * 0.15, H * 0.12) : Math.min(W * 0.105, 70);
    layout.u = u;
  });

  // ---------- Marble sprites (drawn once, then stamped) ----------
  // Each sprite is a glossy candy-glass marble with its own soft contact shadow baked in below it.
  const SPR = 128, SR = 50, SM = 60; // sprite size, marble radius in it, marble centre
  const sprites = new Map();
  function sprite(k) {
    if (sprites.has(k)) return sprites.get(k);
    const cv = document.createElement('canvas'); cv.width = cv.height = SPR;
    const c = cv.getContext('2d'), r = SR, m = SPR / 2, my = SM;
    // Contact shadow on the lane
    const sh = c.createRadialGradient(m + 4, my + r * 0.9, 2, m + 4, my + r * 0.9, r * 1.05);
    sh.addColorStop(0, 'rgba(40,18,6,0.55)'); sh.addColorStop(0.6, 'rgba(40,18,6,0.18)'); sh.addColorStop(1, 'rgba(40,18,6,0)');
    c.save(); c.translate(m + 4, my + r * 0.9); c.scale(1, 0.32); c.translate(-(m + 4), -(my + r * 0.9));
    c.fillStyle = sh; c.beginPath(); c.arc(m + 4, my + r * 0.9, r * 1.05, 0, Math.PI * 2); c.fill();
    c.restore();

    c.save(); c.beginPath(); c.arc(m, my, r, 0, Math.PI * 2); c.clip();
    let base = '#8d8a92';
    if (k === RAINBOW) {
      const cols = ['#ff3b5c', '#ff8a1f', '#ffd21f', '#22c55e', '#2d7bff', '#8b5cff'];
      const cg = c.createLinearGradient(m - r, my - r, m + r, my + r);
      cols.forEach((col, i) => cg.addColorStop(i / (cols.length - 1), col));
      c.fillStyle = cg; c.fillRect(0, 0, SPR, SPR);
      base = '#ffffff';
    } else if (k === BOMB) {
      const g = c.createRadialGradient(m - r * 0.3, my - r * 0.4, 2, m, my, r);
      g.addColorStop(0, '#5a5470'); g.addColorStop(1, '#14111f');
      c.fillStyle = g; c.fillRect(0, 0, SPR, SPR);
    } else if (k === ROCKET) {
      const g = c.createRadialGradient(m - r * 0.3, my - r * 0.4, 2, m, my, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#9aa6bd');
      c.fillStyle = g; c.fillRect(0, 0, SPR, SPR);
    } else {
      base = k === STONE ? '#8b8794' : PALETTE[k];
      const g = c.createRadialGradient(m - r * 0.38, my - r * 0.42, r * 0.05, m, my, r * 1.02);
      g.addColorStop(0, shade(base, 0.6));
      g.addColorStop(0.22, shade(base, 0.18));
      g.addColorStop(0.62, base);
      g.addColorStop(0.9, shade(base, -0.42));
      g.addColorStop(1, shade(base, -0.6));
      c.fillStyle = g; c.fillRect(0, 0, SPR, SPR);
      if (k !== STONE) {
        // Light passing through the glass glows on the far side
        const sss = c.createRadialGradient(m + r * 0.22, my + r * 0.42, 0, m + r * 0.22, my + r * 0.42, r * 0.7);
        sss.addColorStop(0, shade(base, 0.4)); sss.addColorStop(1, rgba(base, 0));
        c.globalAlpha = 0.55; c.fillStyle = sss; c.fillRect(0, 0, SPR, SPR); c.globalAlpha = 1;
      } else {
        c.strokeStyle = 'rgba(30,26,40,0.5)'; c.lineWidth = 3; c.lineCap = 'round';
        c.beginPath(); c.moveTo(m - 22, my - 28); c.lineTo(m - 6, my - 6); c.lineTo(m - 18, my + 16); c.moveTo(m - 6, my - 6); c.lineTo(m + 20, my + 4); c.stroke();
      }
    }
    // Rim light along the lower edge
    c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.22)';
    c.beginPath(); c.arc(m, my, r - 2.5, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
    c.restore();
    // Edge, for separation between marbles of one colour
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(0,0,0,0.22)'; c.beginPath(); c.arc(m, my, r - 0.5, 0, Math.PI * 2); c.stroke();
    // Specular highlights: a soft window reflection and a sharp hot spot
    const hl = c.createLinearGradient(0, my - r * 0.85, 0, my - r * 0.15);
    hl.addColorStop(0, 'rgba(255,255,255,0.85)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hl;
    c.beginPath(); c.ellipse(m - r * 0.12, my - r * 0.5, r * 0.6, r * 0.34, -0.25, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.ellipse(m - r * 0.38, my - r * 0.5, r * 0.13, r * 0.08, -0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(m + r * 0.42, my + r * 0.5, r * 0.12, r * 0.07, -0.6, 0, Math.PI * 2); c.fill();
    if (k === BOMB) {
      // Fuse and spark
      c.strokeStyle = '#c9a36b'; c.lineWidth = 5; c.lineCap = 'round';
      c.beginPath(); c.moveTo(m + r * 0.35, my - r * 0.75); c.quadraticCurveTo(m + r * 0.7, my - r * 1.15, m + r * 0.95, my - r * 0.95); c.stroke();
      const sp = c.createRadialGradient(m + r * 0.95, my - r * 0.95, 0, m + r * 0.95, my - r * 0.95, 14);
      sp.addColorStop(0, '#fff7c2'); sp.addColorStop(0.4, '#ffb21f'); sp.addColorStop(1, 'rgba(255,120,0,0)');
      c.fillStyle = sp; c.beginPath(); c.arc(m + r * 0.95, my - r * 0.95, 14, 0, Math.PI * 2); c.fill();
    }
    if (k === ROCKET) {
      c.fillStyle = '#ff3d5a'; c.beginPath(); c.moveTo(m, my - r * 0.72); c.quadraticCurveTo(m + r * 0.42, my - r * 0.2, m + r * 0.3, my + r * 0.25); c.lineTo(m - r * 0.3, my + r * 0.25); c.quadraticCurveTo(m - r * 0.42, my - r * 0.2, m, my - r * 0.72); c.fill();
      c.fillStyle = '#2d6bff'; c.beginPath(); c.arc(m, my - r * 0.18, r * 0.13, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffb21f'; c.beginPath(); c.moveTo(m - r * 0.2, my + r * 0.3); c.lineTo(m + r * 0.2, my + r * 0.3); c.lineTo(m, my + r * 0.75); c.closePath(); c.fill();
    }
    sprites.set(k, cv);
    return cv;
  }
  const gemSprite = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = SPR;
    const c = cv.getContext('2d'), m = SPR / 2;
    const glow = c.createRadialGradient(m, m, 0, m, m, m);
    glow.addColorStop(0, 'rgba(255,230,120,0.55)'); glow.addColorStop(1, 'rgba(255,230,120,0)');
    c.fillStyle = glow; c.fillRect(0, 0, SPR, SPR);
    starPath(c, m, m + 2, SPR * 0.36, SPR * 0.17);
    const g = c.createLinearGradient(0, m - 40, 0, m + 40);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.45, '#ffcf33'); g.addColorStop(1, '#e08a00');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(140,70,0,0.8)'; c.stroke();
    c.save(); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, 0, SPR, m - 4);
    c.restore();
    return cv;
  })();
  function starPath(c, x, y, R, r) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
  }
  function drawMarble(c, k, x, y, rad, gem, alpha = 1) {
    if (alpha < 1) c.globalAlpha = alpha;
    const sc = rad / SR;
    c.drawImage(sprite(k), x - (SPR / 2) * sc, y - SM * sc, SPR * sc, SPR * sc);
    if (gem) c.drawImage(gemSprite, x - rad * 0.95, y - rad * 0.95, rad * 1.9, rad * 1.9);
    if (alpha < 1) c.globalAlpha = 1;
  }

  // ---------- Shooting ----------
  let aimA = 0, flying = null, aimCache = null, armed = -1;
  const MAXA = (75 * Math.PI) / 180;

  // Follows a marble's path; returns the path points and where it would stop.
  function trace(a, rocket) {
    let x = LANE_W / 2, y = cam.y, vx = Math.sin(a), vy = -Math.cos(a);
    const pts = [{ x, y }];
    const step = 0.1;
    for (let i = 0; i < 2500; i++) {
      x += vx * step; y += vy * step;
      if (x < 0.5) { x = 1 - x; vx = -vx; pts.push({ x: 0.5, y }); }
      if (x > LANE_W - 0.5) { x = 2 * (LANE_W - 0.5) - x; vx = -vx; pts.push({ x: LANE_W - 0.5, y }); }
      if (y <= 0.5) { pts.push({ x, y: 0.5 }); return { pts, hit: null, x, y: 0.5 }; }
      if (!rocket) {
        const hit = touching(x, y);
        if (hit) { pts.push({ x, y }); return { pts, hit, x, y }; }
      }
    }
    return { pts, hit: null, x, y };
  }
  function touching(x, y) {
    const r0 = Math.max(0, Math.floor((y - 0.5) / RH) - 1), r1 = Math.min(grid.length - 1, r0 + 3);
    let best = null, bd = 0.86;
    for (let r = r0; r <= r1; r++) {
      const row = grid[r];
      for (let c = 0; c < row.length; c++) {
        if (!row[c]) continue;
        const d = Math.hypot(cellX(r, c) - x, cellY(r) - y);
        if (d < bd) { bd = d; best = [r, c]; }
      }
    }
    return best;
  }
  function snap(x, y) {
    let best = null, bd = 9;
    const r0 = Math.max(0, Math.floor((y - 0.5) / RH) - 2), r1 = Math.min(grid.length - 1, r0 + 5);
    for (let r = r0; r <= r1; r++) {
      for (let c = 0; c < rowLen(r); c++) {
        if (grid[r][c]) continue;
        if (r > 0 && !neighbors(r, c).some(([a, b]) => grid[a][b])) continue;
        const d = Math.hypot(cellX(r, c) - x, cellY(r) - y);
        if (d < bd) { bd = d; best = [r, c]; }
      }
    }
    return best;
  }
  function aimInfo() {
    const key = aimA.toFixed(4) + '|' + boardVer + '|' + (armed === 3);
    if (aimCache && aimCache.key === key) return aimCache;
    const t = trace(aimA, armed === 3);
    const land = armed === 3 ? null : snap(t.x, t.y);
    aimCache = { key, ...t, land };
    return aimCache;
  }
  let boardVer = 0;

  function currentKind() {
    if (armed === 0) return RAINBOW;
    if (armed === 1) return BOMB;
    if (armed === 3) return ROCKET;
    return queue[0];
  }
  function fire() {
    if (flying || state !== 'play' || shots <= 0 || ending) return;
    const k = currentKind();
    if (armed >= 0) { S.boost[armed]--; S.save(); armed = -1; }
    else { queue.shift(); queue.push(pickColor()); shots--; }
    flying = { k, x: LANE_W / 2, y: cam.y, vx: Math.sin(aimA) * SPEED, vy: -Math.cos(aimA) * SPEED, eaten: 0, trail: [] };
    sfx.pick();
    tone('shoot');
  }
  function tone(kind) {
    // Small extra sounds made from Kit's sound effects.
    if (kind === 'shoot') sfx.move();
  }
  function swap() {
    if (flying || armed >= 0) return;
    queue.push(queue.shift());
    swapAnim = 1;
    sfx.move();
  }
  let swapAnim = 0;

  function arm(i) {
    if (flying || state !== 'play') return;
    if (armed === i) { armed = -1; sfx.move(); return; }
    if (S.boost[i] <= 0) { sfx.nope(); Kit.float('No ' + BOOSTERS[i].name + ' left', cx, baseY - shooter.r * 3, { size: 26, color: '#ffd23f' }); return; }
    if (i === 2) {
      // Paint: the next marble takes the colour of the marble the aim line touches.
      const t = aimInfo();
      if (!t.hit) { sfx.nope(); Kit.float('Aim at a marble first', cx, baseY - shooter.r * 3, { size: 26 }); return; }
      const b = grid[t.hit[0]][t.hit[1]];
      if (b.k < 0) { sfx.nope(); Kit.float('Aim at a coloured marble', cx, baseY - shooter.r * 3, { size: 26 }); return; }
      queue[0] = b.k; S.boost[2]--; S.save();
      const p = project(LANE_W / 2, cam.y);
      Kit.burst(p.x, p.y, PALETTE[b.k], 18);
      sfx.chime();
      return;
    }
    armed = i; sfx.pick();
  }

  // ---------- Resolving a landed marble ----------
  const flyers = [];   // marbles flying to the baskets (screen space)
  const rollers = [];  // marbles rolling off the lane toward you (world space)
  function remove(r, c, how, delay = 0) {
    const b = grid[r][c];
    if (!b) return;
    grid[r][c] = null;
    if (how === 'pop') {
      popAnim.push({ x: cellX(r, c), y: cellY(r), k: b.k, gem: b.gem, t: -delay });
      score += 10;
    } else {
      rollers.push({ x: cellX(r, c), y: cellY(r), vy: 2 + Math.random() * 2, vx: (Math.random() - 0.5) * 1.2, k: b.k, gem: b.gem, t: -delay });
      score += 20;
    }
    if (b.gem) gemsGot++;
  }
  function flood(r, c, match) {
    const seen = new Set([r + ',' + c]), out = [[r, c]];
    for (let i = 0; i < out.length; i++) {
      for (const [a, b] of neighbors(out[i][0], out[i][1])) {
        const key = a + ',' + b;
        if (seen.has(key)) continue;
        seen.add(key);
        const m = grid[a][b];
        if (m && match(m)) out.push([a, b]);
      }
    }
    return out;
  }
  function dropFloating() {
    const seen = new Set(), stack = [];
    grid[0].forEach((b, c) => { if (b) { seen.add('0,' + c); stack.push([0, c]); } });
    while (stack.length) {
      const [r, c] = stack.pop();
      for (const [a, b] of neighbors(r, c)) {
        const key = a + ',' + b;
        if (!seen.has(key) && grid[a][b]) { seen.add(key); stack.push([a, b]); }
      }
    }
    let n = 0;
    for (let r = 0; r < grid.length; r++) for (let c = 0; c < grid[r].length; c++) {
      if (grid[r][c] && !seen.has(r + ',' + c)) { remove(r, c, 'drop', n * 0.012); n++; }
    }
    return n;
  }
  function land(r, c, k) {
    let popped = 0;
    const p = project(cellX(r, c), cellY(r));
    if (k === BOMB) {
      grid[r][c] = { k: STONE, gem: false };
      const cx0 = cellX(r, c), cy0 = cellY(r);
      for (let a = Math.max(0, r - 3); a <= Math.min(grid.length - 1, r + 3); a++) {
        for (let b = 0; b < grid[a].length; b++) {
          if (grid[a][b] && Math.hypot(cellX(a, b) - cx0, cellY(a) - cy0) <= 2.15) { remove(a, b, 'pop', Math.hypot(cellX(a, b) - cx0, cellY(a) - cy0) * 0.04); popped++; }
        }
      }
      Kit.shake(16, 0.4); sfx.drop(); Kit.burst(p.x, p.y, '#ffb21f', 40, 1.6);
      popped--; // the bomb itself
    } else if (k === RAINBOW) {
      grid[r][c] = { k: RAINBOW, gem: false };
      const cols = new Set();
      for (const [a, b] of neighbors(r, c)) if (grid[a][b] && grid[a][b].k >= 0) cols.add(grid[a][b].k);
      let any = false;
      for (const col of cols) {
        const starts = neighbors(r, c).filter(([a, b]) => grid[a][b] && grid[a][b].k === col);
        const group = new Map();
        for (const [a, b] of starts) for (const cell of flood(a, b, (m) => m.k === col)) group.set(cell.join(','), cell);
        if (group.size >= 2) { any = true; let i = 0; for (const [a, b] of group.values()) { remove(a, b, 'pop', (i++) * 0.02); popped++; } }
      }
      if (any) remove(r, c, 'pop');
      else grid[r][c] = { k: cols.size ? [...cols][0] : queue[0], gem: false };
    } else {
      grid[r][c] = { k, gem: false };
      const group = flood(r, c, (m) => m.k === k);
      if (group.length >= 3) {
        group.sort((a, b) => Math.hypot(cellX(a[0], a[1]) - cellX(r, c), cellY(a[0]) - cellY(r)) - Math.hypot(cellX(b[0], b[1]) - cellX(r, c), cellY(b[0]) - cellY(r)));
        group.forEach(([a, b], i) => remove(a, b, 'pop', i * 0.025));
        popped = group.length;
      }
    }
    const dropped = popped > 0 || k === BOMB ? dropFloating() : 0;
    boardVer++;
    if (popped > 0) {
      combo++;
      sfx.clear(Math.min(4, Math.floor((popped + dropped) / 6)), combo - 1);
      if (popped + dropped >= 12) {
        const words = ['Great!', 'Super!', 'Amazing!', 'Fantastic!', 'Shabash!'];
        Kit.float(words[Math.min(words.length - 1, Math.floor((popped + dropped) / 18))], Kit.W / 2, Kit.H * 0.38, { size: 56, big: true, life: 1.2, color: '#ffd23f' });
      }
      if (dropped > 0) Kit.float('+' + dropped * 20, p.x, p.y - 30, { size: 30, color: '#7fffd4' });
    } else {
      combo = 0;
      sfx.drop();
    }
    refreshQueue();
    afterShot();
  }
  let ending = false;
  function afterShot() {
    const empty = frontRow() < 0;
    if (gemsGot >= gemsTotal || empty) {
      ending = true;
      setTimeout(() => winLevel(), 1100);
    } else if (shots <= 0) {
      ending = true;
      setTimeout(() => loseLevel(), 1200);
    }
  }

  // ---------- Baskets: popped marbles fill them; a full basket gives a booster ----------
  const baskets = [{ n: 0, glow: 0 }, { n: 0, glow: 0 }, { n: 0, glow: 0 }];
  let fillIdx = 0, rewardIdx = Kit.store.get(ID + '.reward', 0);
  function basketPos(i) {
    const w = layout.basketW, gap = w * 0.12;
    const x0 = Math.min(shooter.x + shooter.r * (landscape ? 2.6 : 2.3), Kit.W - 3 * w - 2 * gap - 6);
    return { x: x0 + i * (w + gap) + w / 2, y: baseY + shooter.r * 0.5, w };
  }
  function toBasket(sx, sy, k, gem) {
    const i = fillIdx;
    const bp = basketPos(i);
    flyers.push({ x0: sx, y0: sy, x1: bp.x + (Math.random() - 0.5) * bp.w * 0.4, y1: bp.y, k, t: 0, dur: 0.55 + Math.random() * 0.25, basket: i });
    if (gem) gemFly.push({ x0: sx, y0: sy, t: 0 });
  }
  const gemFly = [];
  function basketGot(i) {
    const b = baskets[i];
    b.n++;
    if (b.n >= BASKET_CAP) {
      b.n = 0; b.glow = 1;
      const r = rewardIdx % 4; rewardIdx++;
      Kit.store.set(ID + '.reward', rewardIdx);
      S.boost[r]++; S.save();
      const bp = basketPos(i);
      Kit.float('+1 ' + BOOSTERS[r].name, bp.x, bp.y - bp.w, { size: 30, color: '#7fffd4', life: 1.4 });
      Kit.burst(bp.x, bp.y - bp.w * 0.3, '#ffd23f', 24);
      sfx.chime();
      fillIdx = (fillIdx + 1) % 3;
    }
  }

  // ---------- Screens ----------
  let state = 'splash', splashT = 0, menuFocus = 0, panelT = 0, pauseFocus = 0, barFocus = -1, homeT = 0;
  let lastWin = null;
  function startLevel() {
    buildLevel(S.level);
    state = 'play'; ending = false; barFocus = -1;
    Kit.float('Level ' + S.level, Kit.W / 2, Kit.H * 0.4, { size: 64, big: true, life: 1.4, color: '#ffd23f' });
    Kit.float('Free ' + gemsTotal + ' stars', Kit.W / 2, Kit.H * 0.4 + 64, { size: 34, big: true, life: 1.4 });
  }
  function winLevel() {
    if (state !== 'play') return;
    const bonus = shots * 50;
    score += bonus;
    S.streak++;
    S.best = Math.max(S.best, score);
    lastWin = { level: S.level, score, bonus, streak: S.streak, left: shots };
    Kit.record(ID, S.level);
    S.level++;
    S.save();
    state = 'win'; panelT = 0; menuFocus = 0;
    sfx.win(); Kit.confetti(160);
  }
  function loseLevel() {
    if (state !== 'play') return;
    state = 'lose'; panelT = 0; menuFocus = extraUsed ? 1 : 0;
    sfx.over();
  }
  function moreShots() {
    extraUsed = true; shots += 5; startShots = Math.max(startShots, shots); ending = false; state = 'play';
    Kit.float('+5 marbles', Kit.W / 2, Kit.H * 0.45, { size: 48, big: true, color: '#7fffd4' });
  }
  function goHome() {
    state = 'home'; homeT = 0;
  }

  // ---------- Input ----------
  // Back opens the pause card while playing instead of leaving the game.
  window.addEventListener('keydown', (e) => {
    const isBack = e.key === 'Escape' || e.key === 'Backspace' || e.key === 'BrowserBack' || e.key === 'GoBack' || e.keyCode === 27 || e.keyCode === 8;
    if (isBack && (state === 'play' || state === 'pause' || state === 'win' || state === 'lose')) {
      e.preventDefault(); e.stopImmediatePropagation();
      if (state === 'play') { if (barFocus >= 0) barFocus = -1; else { state = 'pause'; pauseFocus = 0; } }
      else if (state === 'pause') state = 'play';
      else goHome();
      return;
    }
    if (state === 'play' && /^[1-4]$/.test(e.key)) { e.preventDefault(); arm(+e.key - 1); }
  }, true);

  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'splash') { splashT = 9; return; }
    if (state === 'home') {
      if (k === 'ok') startLevel();
      return;
    }
    if (state === 'pause') {
      if (k === 'up' || k === 'left') pauseFocus = (pauseFocus + 2) % 3;
      if (k === 'down' || k === 'right') pauseFocus = (pauseFocus + 1) % 3;
      if (k === 'ok') { if (pauseFocus === 0) state = 'play'; else if (pauseFocus === 1) { S.streak = 0; S.save(); startLevel(); } else goHome(); }
      sfx.move();
      return;
    }
    if (state === 'win') {
      if (panelT < 0.6) return;
      if (k === 'left' || k === 'right') { menuFocus = 1 - menuFocus; sfx.move(); }
      if (k === 'ok') { if (menuFocus === 0) startLevel(); else goHome(); }
      return;
    }
    if (state === 'lose') {
      if (panelT < 0.6) return;
      const n = 3;
      if (k === 'left') { menuFocus = (menuFocus + n - 1) % n; if (extraUsed && menuFocus === 0) menuFocus = n - 1; sfx.move(); }
      if (k === 'right') { menuFocus = (menuFocus + 1) % n; if (extraUsed && menuFocus === 0) menuFocus = 1; sfx.move(); }
      if (k === 'ok') {
        if (menuFocus === 0 && !extraUsed) moreShots();
        else if (menuFocus === 1) { S.streak = 0; S.save(); startLevel(); }
        else { S.streak = 0; S.save(); goHome(); }
      }
      return;
    }
    if (state !== 'play') return;
    if (barFocus >= 0) {
      if (k === 'left') barFocus = (barFocus + 3) % 4;
      if (k === 'right') barFocus = (barFocus + 1) % 4;
      if (k === 'up' || k === 'down') barFocus = -1;
      if (k === 'ok') { const i = barFocus; barFocus = -1; arm(i); }
      sfx.move();
      return;
    }
    const step = (repeat ? 2.4 : 1.2) * Math.PI / 180;
    if (k === 'left') aimA = clamp(aimA - step, -MAXA, MAXA);
    if (k === 'right') aimA = clamp(aimA + step, -MAXA, MAXA);
    if (k === 'up') swap();
    if (k === 'down') { barFocus = Math.max(0, armed); sfx.move(); }
    if (k === 'ok') fire();
  });

  let hover = null;
  function hit(p, r) { return Math.hypot(p.x - r.x, p.y - r.y) <= r.r; }
  function boosterRects() {
    const bs = layout.bs, out = [];
    if (landscape) {
      const x = Kit.W - bs * 0.95, y0 = Kit.H * 0.24;
      for (let i = 0; i < 4; i++) out.push({ x, y: y0 + i * bs * 1.35, r: bs * 0.5 });
    } else {
      const y = Kit.H - bs * 0.62, w = Kit.W / 5;
      for (let i = 0; i < 4; i++) out.push({ x: w * (i + 0.75), y, r: bs * 0.5 });
    }
    return out;
  }
  let panelButtons = [];
  Kit.onPointer({
    down(p) {
      if (state === 'splash') { splashT = 9; return; }
      if (state === 'home') { if (homeButton && p.x > homeButton.x && p.x < homeButton.x + homeButton.w && p.y > homeButton.y && p.y < homeButton.y + homeButton.h) startLevel(); return; }
      if (state === 'win' || state === 'lose' || state === 'pause') {
        for (const b of panelButtons) if (p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h) { b.go(); return; }
        return;
      }
      if (state !== 'play') return;
      if (pauseBtn && hit(p, pauseBtn)) { state = 'pause'; pauseFocus = 0; return; }
      const br = boosterRects();
      for (let i = 0; i < 4; i++) if (hit(p, br[i])) { arm(i); return; }
      if (Math.hypot(p.x - shooter.x, p.y - shooter.y) < shooter.r * 1.5) { swap(); return; }
      aimAt(p);
      if (!p.touch) fire();
      else touchAiming = true;
    },
    move(p) { hover = p; if (state === 'play' && (!p.touch || touchAiming)) aimAt(p); },
    up(p, cancel) { if (touchAiming && !cancel && state === 'play') { aimAt(p); fire(); } touchAiming = false; },
  });
  let touchAiming = false, pauseBtn = null, homeButton = null;
  function aimAt(p) {
    if (p.y > baseY - shooter.r * 0.5) return;
    const w = unproject(p.x, p.y);
    aimA = clamp(Math.atan2(w.x - LANE_W / 2, cam.y - w.y), -MAXA, MAXA);
  }

  // ---------- Update ----------
  function update(dt, time) {
    if (state === 'splash') { splashT += dt; if (splashT > 2.2) goHome(); return; }
    homeT += dt; panelT += dt;
    if (swapAnim > 0) swapAnim = Math.max(0, swapAnim - dt * 4);
    baskets.forEach((b) => { b.glow = Math.max(0, b.glow - dt * 1.5); });
    if (state !== 'play' && state !== 'win' && state !== 'lose' && state !== 'pause') return;
    if (state === 'pause') return;

    // Camera follows the front of the picture.
    const fr = frontRow();
    const target = (fr < 0 ? 0 : cellY(fr)) + GAP;
    cam.y = lerp(cam.y, target, 1 - Math.exp(-dt * 3));
    if (Math.abs(cam.y - target) > 0.002) aimCache = null;
    updateCamera();

    if (flying) {
      const f = flying;
      let left = Math.hypot(f.vx, f.vy) * dt;
      const sp = Math.hypot(f.vx, f.vy);
      while (left > 0 && flying) {
        const st = Math.min(0.1, left); left -= st;
        f.x += (f.vx / sp) * st; f.y += (f.vy / sp) * st;
        if (f.x < 0.5) { f.x = 1 - f.x; f.vx = -f.vx; sfx.move(); }
        if (f.x > LANE_W - 0.5) { f.x = 2 * (LANE_W - 0.5) - f.x; f.vx = -f.vx; sfx.move(); }
        if (f.k === ROCKET) {
          const r0 = Math.max(0, Math.floor((f.y - 0.5) / RH) - 1);
          for (let r = r0; r <= Math.min(grid.length - 1, r0 + 3); r++) for (let c = 0; c < grid[r].length; c++) {
            if (grid[r][c] && Math.hypot(cellX(r, c) - f.x, cellY(r) - f.y) < 0.95) { remove(r, c, 'pop'); f.eaten++; }
          }
          if (f.y <= 0.5 || f.eaten >= 16) {
            const p = project(f.x, f.y); Kit.burst(p.x, p.y, '#ff6a3d', 30, 1.3); Kit.shake(10, 0.3);
            flying = null; dropFloating(); boardVer++; refreshQueue(); sfx.clear(3, 1); afterShot();
          }
          continue;
        }
        if (f.y <= 0.5 || touching(f.x, f.y)) {
          const cell = snap(f.x, f.y);
          flying = null;
          if (cell) land(cell[0], cell[1], f.k);
          else afterShot();
        }
      }
      if (flying) { f.trail.push({ x: f.x, y: f.y }); if (f.trail.length > 8) f.trail.shift(); }
    }

    for (let i = popAnim.length - 1; i >= 0; i--) {
      const a = popAnim[i];
      const was = a.t; a.t += dt;
      if (was < 0 && a.t >= 0) { const p = project(a.x, a.y); Kit.burst(p.x, p.y, a.k >= 0 ? PALETTE[a.k] : '#bbbbbb', 6, 0.6 * p.s + 0.3); }
      if (a.t > 0.16) { const p = project(a.x, a.y); toBasket(p.x, p.y, a.k, a.gem); popAnim.splice(i, 1); if (a.gem) sfx.chime(); }
    }
    for (let i = rollers.length - 1; i >= 0; i--) {
      const r = rollers[i];
      r.t += dt;
      if (r.t < 0) continue;
      r.vy += 14 * dt; r.y += r.vy * dt; r.x = clamp(r.x + r.vx * dt, 0.5, LANE_W - 0.5);
      if (r.y > cam.y - 2.2) { const p = project(r.x, r.y); toBasket(p.x, p.y, r.k, r.gem); rollers.splice(i, 1); }
    }
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t >= f.dur) { flyers.splice(i, 1); basketGot(f.basket); if (Math.random() < 0.3) sfx.move(); }
    }
    for (let i = gemFly.length - 1; i >= 0; i--) { gemFly[i].t += dt; if (gemFly[i].t > 0.9) { gemFly.splice(i, 1); } }
  }

  // ---------- Drawing ----------
  const FONT = '"Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';
  const UI = { ink: '#0b0d24', glass: 'rgba(255,255,255,0.10)', edge: 'rgba(255,255,255,0.28)', hot: '#ff4f9a', warm: '#ffb21f', mint: '#38f2b0', text: '#f4f1ff', soft: 'rgba(236,232,255,0.72)' };
  function text(c, s, x, y, size, color = UI.text, align = 'center', weight = 800) {
    c.font = `${weight} ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle';
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = size * 0.25; c.shadowOffsetY = size * 0.06;
    c.fillStyle = color; c.fillText(s, x, y);
    c.shadowColor = 'transparent'; c.shadowBlur = 0; c.shadowOffsetY = 0;
  }
  // Frosted glass card: translucent fill, light top edge, thin bright border.
  function glass(c, x, y, w, h, r, tint = 'rgba(255,255,255,0.10)', border = UI.edge) {
    c.save();
    c.shadowColor = 'rgba(5,4,25,0.45)'; c.shadowBlur = 24; c.shadowOffsetY = 8;
    roundRect(c, x, y, w, h, r); c.fillStyle = 'rgba(16,14,48,0.55)'; c.fill();
    c.restore();
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(0.5, tint); g.addColorStop(1, 'rgba(255,255,255,0.03)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = border; c.stroke();
  }
  function gradPill(c, x, y, w, h, c1, c2, glowA = 0) {
    if (glowA > 0) { c.save(); c.shadowColor = rgba(c2, glowA); c.shadowBlur = h * 0.6; roundRect(c, x, y, w, h, h / 2); c.fillStyle = c2; c.fill(); c.restore(); }
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    roundRect(c, x, y, w, h, h / 2); c.fillStyle = g; c.fill();
    const s = c.createLinearGradient(0, y, 0, y + h * 0.55);
    s.addColorStop(0, 'rgba(255,255,255,0.45)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(c, x + 3, y + 2, w - 6, h * 0.5, h / 2); c.fillStyle = s; c.fill();
  }

  // Night-market sky: deep gradient, slow colour glows and soft out-of-focus lights.
  const bokeh = Array.from({ length: 26 }, (_, i) => ({ x: Math.random(), y: Math.random() * 0.7, r: 6 + Math.random() * 26, s: 0.004 + Math.random() * 0.01, ph: Math.random() * 6,
    col: ['#ff4f9a', '#ffb21f', '#38f2b0', '#6aa8ff', '#b388ff'][i % 5] }));
  function drawSky(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#0a0b2e', '#3b1458', 'rgba(255,79,154,0.22)');
    const g = c.createLinearGradient(0, H * 0.55, 0, H);
    g.addColorStop(0, 'rgba(255,140,80,0)'); g.addColorStop(1, 'rgba(255,140,80,0.25)');
    c.fillStyle = g; c.fillRect(0, H * 0.55, W, H * 0.45);
    for (const b of bokeh) {
      const x = ((b.x + t * b.s) % 1.1 - 0.05) * W, y = b.y * H + Math.sin(t * 0.5 + b.ph) * 8;
      const a = 0.18 + 0.12 * Math.sin(t * 1.3 + b.ph);
      const rg = c.createRadialGradient(x, y, 0, x, y, b.r);
      rg.addColorStop(0, rgba(b.col, a)); rg.addColorStop(0.7, rgba(b.col, a * 0.6)); rg.addColorStop(1, rgba(b.col, 0));
      c.fillStyle = rg; c.beginPath(); c.arc(x, y, b.r, 0, Math.PI * 2); c.fill();
    }
  }

  // Polished maple: a plank texture drawn once, then laid along the lane row by row in perspective.
  const woodTex = (() => {
    const w = 512, h = 1024, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    const planks = 6, pw = w / planks;
    for (let i = 0; i < planks; i++) {
      const tone = [0, -0.06, 0.04, -0.03, 0.06, -0.08][i];
      const g = c.createLinearGradient(i * pw, 0, (i + 1) * pw, 0);
      g.addColorStop(0, shade('#d9a066', tone - 0.04)); g.addColorStop(0.5, shade('#e3ad73', tone)); g.addColorStop(1, shade('#d39a5f', tone - 0.06));
      c.fillStyle = g; c.fillRect(i * pw, 0, pw, h);
      // Grain: wavy lines along the plank
      for (let j = 0; j < 14; j++) {
        const x0 = i * pw + 4 + Math.random() * (pw - 8), amp = 2 + Math.random() * 5, fr = 0.004 + Math.random() * 0.01, ph = Math.random() * 6;
        c.strokeStyle = `rgba(${120 + Math.random() * 30},${62 + Math.random() * 20},${24},${0.08 + Math.random() * 0.12})`;
        c.lineWidth = 0.6 + Math.random() * 1.6;
        c.beginPath();
        for (let y = 0; y <= h; y += 8) { const x = x0 + Math.sin(y * fr + ph) * amp; y ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke();
      }
      // A knot now and then
      if (Math.random() < 0.7) {
        const kx = i * pw + pw * (0.3 + Math.random() * 0.4), ky = Math.random() * h;
        for (let q = 0; q < 4; q++) { c.strokeStyle = `rgba(110,55,20,${0.25 - q * 0.05})`; c.lineWidth = 1.2; c.beginPath(); c.ellipse(kx, ky, 4 + q * 3, 10 + q * 6, 0, 0, Math.PI * 2); c.stroke(); }
      }
      c.fillStyle = 'rgba(90,45,15,0.45)'; c.fillRect(i * pw, 0, 2, h);
      c.fillStyle = 'rgba(255,230,190,0.25)'; c.fillRect(i * pw + 2, 0, 1.5, h);
    }
    return cv;
  })();
  const laneCache = document.createElement('canvas');
  let laneKey = '';
  function renderLane(c) {
    const W = Kit.W, H = Kit.H, near = cam.y + 8;
    const q = (x, y) => project(x, y);
    const rail = 0.8;
    // Rails: dark walnut with a lit top edge
    const a = q(-rail, -0.7), b = q(LANE_W + rail, -0.7), d = q(-rail, near), e = q(LANE_W + rail, near);
    const a2 = q(0, -0.7), b2 = q(LANE_W, -0.7), d2 = q(0, near), e2 = q(LANE_W, near);
    const rg = c.createLinearGradient(0, a.y, 0, H);
    rg.addColorStop(0, '#3a1d10'); rg.addColorStop(1, '#6b3519');
    c.fillStyle = rg;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(e.x, e.y); c.lineTo(d.x, d.y); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,200,150,0.55)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(d.x, d.y); c.moveTo(b.x, b.y); c.lineTo(e.x, e.y); c.stroke();
    // Floor, textured strip by strip
    const top = Math.max(0, a2.y), bottom = H;
    const step = 2;
    for (let sy = top; sy < bottom; sy += step) {
      const s = (sy - hz) / (baseY - hz);
      if (s <= 0) continue;
      const wy = cam.y - (F / s - F);
      if (wy < -0.7) continue;
      const s2 = (sy + step - hz) / (baseY - hz), wy2 = cam.y - (F / s2 - F);
      const xl = cx - (LANE_W / 2) * U * s, xr = cx + (LANE_W / 2) * U * s;
      let v = ((wy * 46) % woodTex.height + woodTex.height) % woodTex.height;
      const vh = Math.max(1, Math.min(woodTex.height - v, (wy2 - wy) * 46));
      c.drawImage(woodTex, 0, v, woodTex.width, vh, xl, sy, xr - xl, step + 0.6);
    }
    // Lighting: darker far away, warm pool of light near the shooter, shade along the rails
    const lg = c.createLinearGradient(0, a2.y, 0, H);
    lg.addColorStop(0, 'rgba(20,8,30,0.55)'); lg.addColorStop(0.45, 'rgba(20,8,30,0.12)'); lg.addColorStop(1, 'rgba(20,8,30,0.05)');
    c.fillStyle = lg;
    c.beginPath(); c.moveTo(a2.x, a2.y); c.lineTo(b2.x, b2.y); c.lineTo(e2.x, e2.y); c.lineTo(d2.x, d2.y); c.closePath(); c.fill();
    const pool = c.createRadialGradient(cx, baseY, 0, cx, baseY, (e2.x - d2.x) * 0.45);
    pool.addColorStop(0, 'rgba(255,220,170,0.28)'); pool.addColorStop(1, 'rgba(255,220,170,0)');
    c.fillStyle = pool; c.fillRect(0, a2.y, W, H - a2.y);
    for (const side of [0, 1]) {
      const x0 = side ? LANE_W : 0, x1 = side ? LANE_W - 0.45 : 0.45;
      const p0 = q(x0, -0.7), p1 = q(x1, -0.7), p2 = q(x1, near), p3 = q(x0, near);
      const sg = c.createLinearGradient(p3.x, 0, p2.x, 0);
      sg.addColorStop(0, 'rgba(40,15,5,0.4)'); sg.addColorStop(1, 'rgba(40,15,5,0)');
      c.fillStyle = sg; c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p3.x, p3.y); c.closePath(); c.fill();
    }
    // Back board with our name, lit from the front
    const k0 = q(-rail, -0.7), k1 = q(LANE_W + rail, -0.7), hgt = U * k0.s * 1.3;
    const bg = c.createLinearGradient(0, k0.y - hgt, 0, k0.y);
    bg.addColorStop(0, '#24123a'); bg.addColorStop(1, '#43205e');
    roundRect(c, k0.x, k0.y - hgt, k1.x - k0.x, hgt, Math.min(10, hgt * 0.3)); c.fillStyle = bg; c.fill();
    c.strokeStyle = 'rgba(255,79,154,0.8)'; c.lineWidth = 2; c.stroke();
    c.save(); c.shadowColor = UI.hot; c.shadowBlur = 14;
    c.font = `800 ${Math.max(10, hgt * 0.55)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#ffd6ea'; c.fillText('BUBBLE BAZAAR', (k0.x + k1.x) / 2, k0.y - hgt * 0.47);
    c.restore();
  }
  function drawLane(c) {
    const W = Kit.W, H = Kit.H, pr = Kit.canvas.width / Math.max(1, W);
    const key = [W, H, cam.y.toFixed(3)].join('|');
    if (key !== laneKey) {
      laneKey = key;
      laneCache.width = Math.round(W * pr); laneCache.height = Math.round(H * pr);
      const lc = laneCache.getContext('2d');
      lc.setTransform(pr, 0, 0, pr, 0, 0);
      lc.clearRect(0, 0, W, H);
      renderLane(lc);
    }
    c.drawImage(laneCache, 0, 0, W, H);
  }

  function drawBoard(c, t) {
    const last = Math.min(grid.length - 1, frontRow() + 1);
    for (let r = 0; r <= last; r++) {
      const row = grid[r];
      const yy = cellY(r);
      for (let cc = 0; cc < row.length; cc++) {
        const b = row[cc];
        if (!b) continue;
        const p = project(cellX(r, cc), yy);
        const rad = 0.53 * U * p.s;
        if (b.gem) {
          const tw = 1 + 0.08 * Math.sin(t * 4 + r + cc);
          drawMarble(c, b.k, p.x, p.y, rad, false);
          c.drawImage(gemSprite, p.x - rad * 0.95 * tw, p.y - rad * 0.95 * tw, rad * 1.9 * tw, rad * 1.9 * tw);
        } else drawMarble(c, b.k, p.x, p.y, rad, false);
      }
    }
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const a of popAnim) {
      if (a.t < 0) continue;
      const p = project(a.x, a.y), k = clamp(a.t / 0.16, 0, 1), rad = 0.53 * U * p.s;
      c.strokeStyle = rgba(a.k >= 0 ? PALETTE[a.k] : '#ffffff', 0.8 * (1 - k)); c.lineWidth = rad * 0.3 * (1 - k) + 1;
      c.beginPath(); c.arc(p.x, p.y, rad * (1 + k * 1.2), 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    for (const a of popAnim) {
      const p = project(a.x, a.y), k = clamp(a.t / 0.16, 0, 1);
      drawMarble(c, a.k, p.x, p.y, 0.53 * U * p.s * (1 + k * 0.3), a.gem, 1 - k * 0.7);
    }
    for (const r of rollers) {
      const p = project(r.x, r.y);
      drawMarble(c, r.k, p.x, p.y, 0.53 * U * p.s, r.gem);
    }
  }

  function drawAim(c, t) {
    if (flying || ending) return;
    const info = aimInfo();
    const pts = info.pts;
    const spacing = 0.62, offset = (t * 1.8) % spacing;
    let dist = 0, next = offset + 1.3;
    const col = armed === 3 ? '#ff6a3d' : armed === 1 ? '#ffb21f' : armed === 0 ? '#ffffff' : PALETTE[queue[0]];
    c.save(); c.globalCompositeOperation = 'lighter';
    let n = 0;
    for (let i = 1; i < pts.length; i++) {
      const ax = pts[i - 1].x, ay = pts[i - 1].y, bx = pts[i].x, by = pts[i].y;
      const seg = Math.hypot(bx - ax, by - ay);
      while (next <= dist + seg) {
        const k = (next - dist) / seg;
        const p = project(ax + (bx - ax) * k, ay + (by - ay) * k);
        const rr = Math.max(1.5, 0.11 * U * p.s);
        const fade = Math.max(0.25, 1 - n * 0.025);
        const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 2.6);
        g.addColorStop(0, rgba('#ffffff', 0.95 * fade)); g.addColorStop(0.35, rgba(col, 0.75 * fade)); g.addColorStop(1, rgba(col, 0));
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, rr * 2.6, 0, Math.PI * 2); c.fill();
        next += spacing; n++;
      }
      dist += seg;
    }
    c.restore();
    if (info.land) {
      const [r, cc] = info.land, p = project(cellX(r, cc), cellY(r));
      const rad = 0.5 * U * p.s, pulse = 1 + 0.06 * Math.sin(t * 6);
      c.save(); c.shadowColor = col; c.shadowBlur = 12;
      c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2.5;
      c.beginPath(); c.arc(p.x, p.y, rad * pulse, 0, Math.PI * 2); c.stroke();
      c.restore();
    }
  }

  function drawShooter(c, t) {
    const { x, y, r } = shooter;
    // Glass launch pad with a ring that shows the marbles left
    c.save(); c.shadowColor = 'rgba(10,5,30,0.6)'; c.shadowBlur = 20; c.shadowOffsetY = 8;
    const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, r * 0.1, x, y, r * 1.15);
    g.addColorStop(0, '#3b2d7a'); g.addColorStop(1, '#120c34');
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.1, 0, Math.PI * 2); c.fill();
    c.restore();
    c.lineWidth = r * 0.14; c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.arc(x, y, r * 1.1, 0, Math.PI * 2); c.stroke();
    const frac = clamp(shots / Math.max(1, startShots), 0, 1);
    const rg = c.createLinearGradient(x - r, y - r, x + r, y + r);
    rg.addColorStop(0, shots <= 5 ? '#ff3b5c' : UI.hot); rg.addColorStop(1, shots <= 5 ? '#ff8a1f' : UI.warm);
    c.save(); c.shadowColor = shots <= 5 ? '#ff3b5c' : UI.hot; c.shadowBlur = 12;
    c.strokeStyle = rg; c.lineCap = 'round';
    c.beginPath(); c.arc(x, y, r * 1.1, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
    c.restore(); c.lineCap = 'butt';
    text(c, String(shots), x, y + r * 0.1, r * 0.82, shots <= 5 ? '#ff8fa3' : '#ffffff');
    text(c, 'LEFT', x, y + r * 0.62, r * 0.24, UI.soft, 'center', 700);
    // Current marble on top with a halo; next marble in its own chip
    const k = currentKind();
    const cr = r * 0.66, bob = Math.sin(t * 3) * r * 0.04;
    if (!flying) {
      const ax = x + Math.sin(aimA) * r * 1.25, ay = y - r * 1.25 + bob;
      const halo = c.createRadialGradient(ax, ay, cr * 0.5, ax, ay, cr * 1.9);
      halo.addColorStop(0, rgba(k >= 0 ? PALETTE[k] : '#ffffff', 0.55)); halo.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = halo; c.beginPath(); c.arc(ax, ay, cr * 1.9, 0, Math.PI * 2); c.fill();
      drawMarble(c, k, ax, ay, cr, false);
    }
    const nx = x + r * (landscape ? 1.55 : 1.3), ny = y + r * 0.45, nr = r * 0.48;
    c.save(); c.translate(nx, ny); c.rotate(swapAnim * Math.PI); c.translate(-nx, -ny);
    glass(c, nx - nr * 1.15, ny - nr * 1.15, nr * 2.3, nr * 2.3, nr * 1.15);
    drawMarble(c, queue[1], nx, ny, nr * 0.75, false);
    c.restore();
    text(c, 'NEXT', nx, ny + nr * 1.5, r * 0.22, UI.soft, 'center', 700);
    if (armed >= 0) {
      const lw = r * 2.6;
      gradPill(c, x - lw / 2, y - r * 2.85, lw, r * 0.55, UI.hot, UI.warm, 0.6);
      text(c, BOOSTERS[armed].name.toUpperCase(), x, y - r * 2.58, r * 0.32, '#fff');
    }
  }

  function drawFlying(c) {
    if (!flying) return;
    const f = flying;
    c.save(); c.globalCompositeOperation = 'lighter';
    f.trail.forEach((tp, i) => {
      const p = project(tp.x, tp.y), rr = 0.45 * U * p.s * (0.4 + i / f.trail.length * 0.6);
      const col = f.k >= 0 ? PALETTE[f.k] : '#ffffff';
      const g = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
      g.addColorStop(0, rgba(col, 0.35 * (i / f.trail.length))); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, rr, 0, Math.PI * 2); c.fill();
    });
    c.restore();
    const p = project(f.x, f.y);
    drawMarble(c, f.k, p.x, p.y, 0.53 * U * p.s, false);
  }

  // Glass jars: popped marbles pile up inside; a full jar gives a booster.
  function drawBaskets(c, t) {
    baskets.forEach((b, i) => {
      const bp = basketPos(i), w = bp.w, h = w * 0.95;
      const x = bp.x - w / 2, y = bp.y - h * 0.55;
      if (b.glow > 0) {
        const gg = c.createRadialGradient(bp.x, bp.y, 0, bp.x, bp.y, w);
        gg.addColorStop(0, `rgba(56,242,176,${b.glow * 0.7})`); gg.addColorStop(1, 'rgba(56,242,176,0)');
        c.fillStyle = gg; c.beginPath(); c.arc(bp.x, bp.y, w, 0, Math.PI * 2); c.fill();
      }
      // back of the jar
      roundRect(c, x, y, w, h, w * 0.22); c.fillStyle = 'rgba(180,220,255,0.10)'; c.fill();
      const fill = b.n / BASKET_CAP;
      c.save(); roundRect(c, x + 3, y + 3, w - 6, h - 6, w * 0.2); c.clip();
      const cnt = Math.round(fill * 14);
      for (let j = 0; j < cnt; j++) {
        const row = Math.floor(j / 4), col = j % 4;
        const jx = x + w * (0.2 + col * 0.2 + (row % 2) * 0.1), jy = y + h - w * 0.13 - row * w * 0.17;
        drawMarble(c, levelColors[(j * 3) % levelColors.length], jx, jy, w * 0.11, false);
      }
      c.restore();
      // front glass: rim, shine and lid
      roundRect(c, x, y, w, h, w * 0.22); c.lineWidth = 2; c.strokeStyle = 'rgba(220,240,255,0.55)'; c.stroke();
      const sg = c.createLinearGradient(x, 0, x + w, 0);
      sg.addColorStop(0, 'rgba(255,255,255,0.28)'); sg.addColorStop(0.25, 'rgba(255,255,255,0.05)'); sg.addColorStop(1, 'rgba(255,255,255,0)');
      roundRect(c, x + 4, y + 6, w * 0.3, h - 12, w * 0.12); c.fillStyle = sg; c.fill();
      gradPill(c, x - w * 0.05, y - w * 0.13, w * 1.1, w * 0.18, '#ff7ab8', '#ff4f9a');
      // fill meter
      roundRect(c, x + w * 0.1, y + h + 7, w * 0.8, 6, 3); c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill();
      if (fill > 0) { c.save(); c.shadowColor = UI.mint; c.shadowBlur = 8; roundRect(c, x + w * 0.1, y + h + 7, Math.max(6, w * 0.8 * fill), 6, 3); c.fillStyle = UI.mint; c.fill(); c.restore(); }
    });
    for (const f of flyers) {
      const k = ease.inOut(clamp(f.t / f.dur, 0, 1));
      const x = lerp(f.x0, f.x1, k), y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * Kit.H * 0.12;
      drawMarble(c, f.k, x, y, layout.basketW * 0.11, false);
    }
  }

  // Mithu the parrot holds up the goal.
  function drawMascot(c, t) {
    const s = layout.basketW * 0.9;
    const x = Math.max(s * 0.2, shooter.x - shooter.r * (landscape ? 2.6 : 1.9) - s * 1.2), y = baseY + s * 0.15;
    const bob = Math.sin(t * 2.4) * s * 0.03;
    const bw = s * 2.3, bh = s * 0.82, bx = Math.max(bw / 2 + 8, x - bw * 0.15), by = y - s * 1.55 + bob;
    glass(c, bx - bw / 2, by - bh / 2, bw, bh, bh / 2);
    c.drawImage(gemSprite, bx - bw * 0.46, by - bh * 0.55, bh * 1.1, bh * 1.1);
    text(c, `${gemsGot}/${gemsTotal}`, bx + bw * 0.12, by + 2, bh * 0.52, gemsGot >= gemsTotal ? UI.mint : '#ffffff');
    // Parrot, shaded
    const px = x + s * 0.35, py = y + bob;
    const body = c.createRadialGradient(px - s * 0.15, py - s * 0.2, s * 0.05, px, py, s * 0.6);
    body.addColorStop(0, '#7af59a'); body.addColorStop(1, '#14943a');
    c.fillStyle = body; c.beginPath(); c.ellipse(px, py, s * 0.42, s * 0.55, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#0f7a30'; c.beginPath(); c.ellipse(px + s * 0.25, py + s * 0.1, s * 0.2, s * 0.42, -0.3, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(200,255,210,0.55)'; c.beginPath(); c.ellipse(px - s * 0.05, py + s * 0.18, s * 0.22, s * 0.3, 0, 0, Math.PI * 2); c.fill();
    const head = c.createRadialGradient(px - s * 0.15, py - s * 0.62, s * 0.03, px - s * 0.05, py - s * 0.48, s * 0.34);
    head.addColorStop(0, '#8cffaa'); head.addColorStop(1, '#1aa043');
    c.fillStyle = head; c.beginPath(); c.arc(px - s * 0.05, py - s * 0.48, s * 0.32, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#ff4f7a'; c.lineWidth = s * 0.05; c.beginPath(); c.arc(px - s * 0.05, py - s * 0.42, s * 0.3, 0.3, 2.6); c.stroke();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(px - s * 0.14, py - s * 0.56, s * 0.1, 0, Math.PI * 2); c.fill();
    const blink = (t % 4) < 0.12 ? 0.2 : 1;
    c.fillStyle = '#1a1030'; c.beginPath(); c.ellipse(px - s * 0.16, py - s * 0.55, s * 0.055, s * 0.055 * blink, 0, 0, Math.PI * 2); c.fill();
    const beak = c.createLinearGradient(px - s * 0.5, py - s * 0.5, px - s * 0.25, py - s * 0.3);
    beak.addColorStop(0, '#ff6a3d'); beak.addColorStop(1, '#d81e3c');
    c.fillStyle = beak; c.beginPath(); c.moveTo(px - s * 0.3, py - s * 0.52); c.quadraticCurveTo(px - s * 0.58, py - s * 0.45, px - s * 0.36, py - s * 0.3); c.lineTo(px - s * 0.24, py - s * 0.4); c.closePath(); c.fill();
    c.fillStyle = '#ffb21f'; c.fillRect(px - s * 0.12, py + s * 0.5, s * 0.06, s * 0.14); c.fillRect(px + s * 0.06, py + s * 0.5, s * 0.06, s * 0.14);
    for (const gf of gemFly) {
      const k = ease.inOut(clamp(gf.t / 0.9, 0, 1));
      const gx = lerp(gf.x0, bx - bw * 0.46 + bh * 0.55, k), gy = lerp(gf.y0, by, k) - Math.sin(k * Math.PI) * 60;
      const sz = lerp(44, bh * 1.1, k);
      c.drawImage(gemSprite, gx - sz / 2, gy - sz / 2, sz, sz);
    }
  }

  function boosterIcon(c, i, x, y, r) {
    const k = [RAINBOW, BOMB, null, ROCKET][i];
    if (k !== null) { drawMarble(c, k, x, y, r, false); return; }
    // Paint: a brush dipped in the next marble's colour
    const col = PALETTE[queue[0]] || '#ff63b0';
    const g = c.createRadialGradient(x - r * 0.4, y, 0, x - r * 0.2, y + r * 0.2, r * 0.7);
    g.addColorStop(0, shade(col, 0.4)); g.addColorStop(1, col);
    c.fillStyle = g; c.beginPath(); c.ellipse(x - r * 0.2, y + r * 0.25, r * 0.62, r * 0.48, -0.3, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#f4dcb0'; c.lineWidth = r * 0.24; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x + r * 0.75, y - r * 0.75); c.lineTo(x + r * 0.15, y - r * 0.1); c.stroke(); c.lineCap = 'butt';
    c.fillStyle = col; c.beginPath(); c.arc(x + r * 0.08, y - r * 0.02, r * 0.18, 0, Math.PI * 2); c.fill();
  }
  function drawBoosters(c, t) {
    const br = boosterRects();
    if (!landscape) {
      const h = layout.bs * 1.3;
      const g = c.createLinearGradient(0, Kit.H - h, 0, Kit.H);
      g.addColorStop(0, 'rgba(10,8,40,0)'); g.addColorStop(0.35, 'rgba(10,8,40,0.75)'); g.addColorStop(1, 'rgba(10,8,40,0.9)');
      c.fillStyle = g; c.fillRect(0, Kit.H - h, Kit.W, h);
    }
    br.forEach((b, i) => {
      const on = armed === i, foc = barFocus === i;
      const sz = b.r * 2 * (foc ? 1.06 + Math.sin(t * 8) * 0.02 : 1);
      const x = b.x - sz / 2, y = b.y - sz / 2;
      if (on || foc) {
        c.save(); c.shadowColor = on ? UI.warm : UI.hot; c.shadowBlur = 22;
        roundRect(c, x - 3, y - 3, sz + 6, sz + 6, sz * 0.3);
        const gg = c.createLinearGradient(x, y, x + sz, y + sz); gg.addColorStop(0, UI.hot); gg.addColorStop(1, UI.warm);
        c.fillStyle = gg; c.fill(); c.restore();
      }
      glass(c, x, y, sz, sz, sz * 0.28);
      boosterIcon(c, i, b.x, b.y - sz * 0.02, sz * 0.27);
      const n = S.boost[i], pw = sz * 0.42, ph = sz * 0.28;
      if (n > 0) gradPill(c, x + sz - pw * 0.8, y - ph * 0.35, pw, ph, '#3ff2b5', '#14b87e');
      else { roundRect(c, x + sz - pw * 0.8, y - ph * 0.35, pw, ph, ph / 2); c.fillStyle = 'rgba(120,110,150,0.9)'; c.fill(); }
      text(c, String(n), x + sz - pw * 0.3, y - ph * 0.35 + ph / 2 + 1, ph * 0.7, '#ffffff');
      if (landscape) {
        text(c, BOOSTERS[i].name, b.x - sz * 0.72, b.y - sz * 0.1, sz * 0.2, foc || on ? '#ffd166' : UI.text, 'right');
        text(c, 'key ' + (i + 1), b.x - sz * 0.72, b.y + sz * 0.15, sz * 0.14, UI.soft, 'right', 600);
      }
    });
    if (barFocus >= 0) {
      const b = br[barFocus];
      const tip = BOOSTERS[barFocus].tip + '  ·  OK to use';
      if (landscape) text(c, tip, b.x - layout.bs * 0.6, b.y + layout.bs * 0.62, layout.bs * 0.17, '#ffffff', 'right', 700);
      else text(c, tip, Kit.W / 2, Kit.H - layout.bs * 1.5, layout.bs * 0.2, '#ffffff', 'center', 700);
    }
  }

  function drawHud(c, t) {
    const W = Kit.W, u = layout.u;
    const fs = clamp(u * 0.036, 15, 32);
    if (landscape) {
      const x = W * 0.03, y = Kit.H * 0.06, w = Math.min(W * 0.2, 300), h = fs * 6.2;
      glass(c, x, y, w, h, 22);
      text(c, 'LEVEL', x + 22, y + fs * 0.95, fs * 0.55, UI.soft, 'left', 700);
      text(c, String(S.level), x + 22, y + fs * 2.0, fs * 1.6, '#ffffff', 'left');
      text(c, picName, x + 22 + fs * 1.1 * String(S.level).length + 16, y + fs * 2.1, fs * 0.75, '#ffd166', 'left', 700);
      c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(x + 22, y + fs * 3.2, w - 44, 1);
      text(c, 'SCORE', x + 22, y + fs * 3.9, fs * 0.5, UI.soft, 'left', 700);
      text(c, score.toLocaleString(), x + 22, y + fs * 4.85, fs * 1.0, '#ffffff', 'left');
      text(c, 'STREAK', x + w - 22, y + fs * 3.9, fs * 0.5, UI.soft, 'right', 700);
      text(c, '🏆 ' + S.streak, x + w - 22, y + fs * 4.85, fs * 1.0, '#ffd166', 'right');
      const hy = Kit.H * 0.6, hs = fs * 0.58;
      const keys = [['◀ ▶', 'Aim'], ['OK', 'Shoot'], ['▲', 'Swap marble'], ['▼', 'Boosters'], [window.CableGames ? 'Back' : 'Esc', window.CableGames ? 'Exit game' : 'Pause']];
      keys.forEach(([k, l], i) => {
        const yy = hy + i * hs * 2.1, kw = c.measureText ? hs * 3.2 : 50;
        glass(c, x, yy - hs * 0.85, kw, hs * 1.7, hs * 0.5);
        text(c, k, x + kw / 2, yy + 1, hs * 0.8, '#ffffff', 'center', 700);
        text(c, l, x + kw + 12, yy + 1, hs, UI.soft, 'left', 700);
      });
      pauseBtn = null;
    } else {
      glass(c, 12, 10, 120, 42, 21);
      text(c, 'Level ' + S.level, 28, 32, fs * 1.0, '#ffffff', 'left');
      glass(c, W / 2 - 50, 10, 100, 42, 21);
      text(c, score.toLocaleString(), W / 2, 32, fs * 0.95, '#ffd166');
      pauseBtn = { x: W - 34, y: 31, r: 22 };
      glass(c, pauseBtn.x - 21, pauseBtn.y - 21, 42, 42, 21);
      c.fillStyle = '#fff'; c.fillRect(pauseBtn.x - 7, pauseBtn.y - 8, 5, 16); c.fillRect(pauseBtn.x + 2, pauseBtn.y - 8, 5, 16);
    }
  }

  // ---------- Logo (ours): extruded 3D lettering with a glossy face ----------
  function drawLogo(c, x, y, size, t) {
    c.save(); c.translate(x, y);
    c.rotate(-0.035 + Math.sin(t * 1.6) * 0.012);
    [[-1.7, -0.55, 4, 0.22], [-1.38, -0.92, 0, 0.16], [1.5, -0.78, 1, 0.2], [1.75, -0.32, 7, 0.14], [1.6, 0.78, 5, 0.22], [-1.72, 0.72, 3, 0.18]].forEach(([mx, my, k, r], i) => {
      drawMarble(c, k, mx * size, my * size + Math.sin(t * 2.2 + i) * size * 0.05, size * r, false);
    });
    const word = (s, yy, c1, c2, sz) => {
      c.font = `800 ${sz}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      const depth = Math.max(4, sz * 0.09);
      for (let d = depth; d > 0; d -= 1) { c.fillStyle = shade(c2, -0.55 + (depth - d) * 0.02); c.fillText(s, 0, yy + d); }
      c.save(); c.shadowColor = rgba(c2, 0.7); c.shadowBlur = sz * 0.35;
      const g = c.createLinearGradient(0, yy - sz / 2, 0, yy + sz / 2);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      c.fillStyle = g; c.fillText(s, 0, yy);
      c.restore();
      c.save();
      c.beginPath(); c.rect(-sz * 4, yy - sz, sz * 8, sz * 0.92); c.clip();
      c.fillStyle = 'rgba(255,255,255,0.28)'; c.fillText(s, 0, yy);
      c.restore();
    };
    word('Bubble', -size * 0.4, '#ffd1e6', '#ff3d8f', size * 0.8);
    word('Bazaar', size * 0.42, '#fff0b8', '#ff8a1f', size * 0.8);
    c.restore();
  }

  function drawSplash(c, t) {
    drawSky(c, t);
    const W = Kit.W, H = Kit.H, sz = Math.min(W * 0.2, H * 0.22);
    drawLogo(c, W / 2, H * 0.4, sz, t);
    const bw = Math.min(W * 0.5, 420), bh = 10, k = clamp(splashT / 2, 0, 1);
    roundRect(c, W / 2 - bw / 2, H * 0.72, bw, bh, bh / 2); c.fillStyle = 'rgba(255,255,255,0.14)'; c.fill();
    c.save(); c.shadowColor = UI.hot; c.shadowBlur = 14;
    gradPill(c, W / 2 - bw / 2, H * 0.72, Math.max(bh, bw * ease.out(k)), bh, UI.hot, UI.warm);
    c.restore();
    text(c, 'CABLE TV GAMES', W / 2, H * 0.72 + 44, 18, UI.soft, 'center', 700);
  }

  const homeMarbles = Array.from({ length: 14 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.02 + Math.random() * 0.05, k: i % 8, s: 0.01 + Math.random() * 0.03, ph: Math.random() * 6 }));
  function drawHome(c, t) {
    drawSky(c, t);
    const W = Kit.W, H = Kit.H, m = Math.min(W, H);
    for (const hm of homeMarbles) {
      const y = ((hm.y - t * hm.s) % 1.2 + 1.2) % 1.2 - 0.1;
      c.globalAlpha = 0.5 + hm.r * 6;
      drawMarble(c, hm.k, hm.x * W + Math.sin(t * 0.7 + hm.ph) * 20, y * H, hm.r * m, false);
      c.globalAlpha = 1;
    }
    const sz = Math.min(W * 0.16, H * 0.18);
    drawLogo(c, W / 2, H * 0.26, sz, t);
    const cw = Math.min(W * 0.86, 520), bh = Math.min(H * 0.1, 88), chipH0 = Math.min(H * 0.07, 54), ch = bh + chipH0 + bh * 0.9, cxx = W / 2 - cw / 2, cyy = H * 0.5;
    glass(c, cxx, cyy, cw, ch, 32);
    const bw = cw * 0.78, pulse = 1 + Math.sin(t * 4) * 0.02;
    const bx = W / 2 - (bw * pulse) / 2, by = cyy + bh * 0.3;
    homeButton = { x: bx, y: by, w: bw * pulse, h: bh * pulse };
    gradPill(c, bx, by, bw * pulse, bh * pulse, UI.hot, UI.warm, 0.7);
    text(c, '▶  Level ' + S.level, W / 2, by + (bh * pulse) / 2 + 2, bh * 0.45, '#ffffff');
    const chipY = by + bh + bh * 0.3, chipH = chipH0, chipW = (bw - 16) / 3;
    [['🏆', S.streak, 'Win streak'], ['★', S.best.toLocaleString(), 'Best score'], ['✦', S.boost.reduce((a, b) => a + b, 0), 'Boosters']].forEach(([ic, v, l], i) => {
      const x = W / 2 - bw / 2 + i * (chipW + 8);
      roundRect(c, x, chipY, chipW, chipH, 14); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill();
      text(c, ic + ' ' + v, x + chipW / 2, chipY + chipH * 0.38, chipH * 0.36, '#ffffff');
      text(c, l, x + chipW / 2, chipY + chipH * 0.76, chipH * 0.22, UI.soft, 'center', 700);
    });
    const fs = clamp(m * 0.024, 13, 22);
    text(c, window.CableGames ? 'Press OK to play' : 'Press Enter (OK) or click Level to play', W / 2, Math.min(H * 0.94, cyy + ch + fs * 2.4), fs, `rgba(255,255,255,${0.55 + 0.4 * Math.sin(t * 3)})`, 'center', 700);
  }

  function button(c, label, x, y, w, h, focused, color, go) {
    panelButtons.push({ x, y, w, h, go });
    if (focused) { c.save(); c.shadowColor = color; c.shadowBlur = 24; roundRect(c, x - 3, y - 3, w + 6, h + 6, (h + 6) / 2); c.strokeStyle = '#ffffff'; c.lineWidth = 3; c.stroke(); c.restore(); }
    gradPill(c, x, y, w, h, shade(color, 0.25), color, focused ? 0.6 : 0);
    text(c, label, x + w / 2, y + h / 2 + 2, h * 0.38, '#fff');
  }
  function panel(c, t, h) {
    const W = Kit.W, H = Kit.H;
    c.fillStyle = 'rgba(6,5,24,0.62)'; c.fillRect(0, 0, W, H);
    const k = ease.back(clamp(panelT / 0.4, 0, 1));
    const pw = Math.min(W * 0.9, 560), ph = h;
    const x = W / 2 - pw / 2, y = H / 2 - ph / 2;
    c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    glass(c, x, y, pw, ph, 32, 'rgba(120,90,255,0.10)', 'rgba(255,255,255,0.32)');
    return { x, y, pw, ph, done: () => c.restore() };
  }
  function trophy(c, x, y, s, t) {
    c.save(); c.translate(x, y);
    c.save(); c.globalCompositeOperation = 'lighter'; c.rotate(t * 0.4);
    for (let i = 0; i < 12; i++) {
      c.rotate(Math.PI / 6);
      const g = c.createLinearGradient(0, 0, 0, -s * 1.7);
      g.addColorStop(0, 'rgba(255,210,90,0.35)'); g.addColorStop(1, 'rgba(255,210,90,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(-s * 0.12, 0); c.lineTo(0, -s * 1.7); c.lineTo(s * 0.12, 0); c.fill();
    }
    c.restore();
    c.rotate(Math.sin(t * 2) * 0.04);
    const g = c.createLinearGradient(-s, 0, s, 0);
    g.addColorStop(0, '#d98a0a'); g.addColorStop(0.4, '#fff1a8'); g.addColorStop(0.6, '#ffd23f'); g.addColorStop(1, '#b86b00');
    c.lineWidth = s * 0.12; c.strokeStyle = '#f0b42a';
    c.beginPath(); c.arc(-s * 0.62, -s * 0.35, s * 0.3, Math.PI * 0.5, Math.PI * 1.5); c.stroke();
    c.beginPath(); c.arc(s * 0.62, -s * 0.35, s * 0.3, -Math.PI * 0.5, Math.PI * 0.5); c.stroke();
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-s * 0.65, -s * 0.75); c.lineTo(s * 0.65, -s * 0.75); c.quadraticCurveTo(s * 0.6, s * 0.15, 0, s * 0.3); c.quadraticCurveTo(-s * 0.6, s * 0.15, -s * 0.65, -s * 0.75); c.fill();
    c.fillRect(-s * 0.1, s * 0.25, s * 0.2, s * 0.3);
    roundRect(c, -s * 0.45, s * 0.52, s * 0.9, s * 0.22, s * 0.06); c.fill();
    c.restore();
  }

  function drawWin(c, t) {
    panelButtons = [];
    const p = panel(c, t, 470);
    const cxp = Kit.W / 2;
    trophy(c, cxp, p.y + 95, 70, t);
    text(c, String(lastWin.streak), cxp, p.y + 80, 34, '#7a3e00');
    text(c, 'Level ' + lastWin.level + ' complete', cxp, p.y + 200, 40, '#ffffff');
    text(c, `${lastWin.streak} win streak! Keep it going!`, cxp, p.y + 246, 24, '#ffd166', 'center', 700);
    text(c, `Score ${lastWin.score.toLocaleString()}  ·  +${lastWin.bonus} for ${lastWin.left} marbles left`, cxp, p.y + 286, 19, UI.soft, 'center', 700);
    const bw = 200, bh = 62, by = p.y + p.ph - 100;
    button(c, 'Next level', cxp - bw - 12, by, bw, bh, menuFocus === 0, '#14b87e', () => startLevel());
    button(c, 'Home', cxp + 12, by, bw, bh, menuFocus === 1, '#7a5cff', () => goHome());
    p.done();
  }
  function drawLose(c, t) {
    panelButtons = [];
    const p = panel(c, t, 400);
    const cxp = Kit.W / 2;
    text(c, 'Out of marbles', cxp, p.y + 70, 42, '#ffffff');
    text(c, `Stars freed: ${gemsGot} of ${gemsTotal}`, cxp, p.y + 126, 26, '#ffd166', 'center', 700);
    if (S.streak > 0) text(c, `Retrying ends your ${S.streak} win streak`, cxp, p.y + 168, 20, '#ff9fb4', 'center', 700);
    const bw = Math.min(160, (p.pw - 60) / 3), bh = 62, by = p.y + p.ph - 110, gap = 12;
    const x0 = cxp - (bw * 3 + gap * 2) / 2;
    button(c, extraUsed ? 'Used' : '+5 marbles', x0, by, bw, bh, menuFocus === 0, extraUsed ? '#6d6380' : '#14b87e', () => { if (!extraUsed) moreShots(); });
    button(c, 'Retry', x0 + bw + gap, by, bw, bh, menuFocus === 1, '#2d6bff', () => { S.streak = 0; S.save(); startLevel(); });
    button(c, 'Home', x0 + (bw + gap) * 2, by, bw, bh, menuFocus === 2, '#7a5cff', () => { S.streak = 0; S.save(); goHome(); });
    p.done();
  }
  function drawPause(c, t) {
    panelButtons = [];
    const p = panel(c, t, 420);
    const cxp = Kit.W / 2;
    text(c, 'Paused', cxp, p.y + 60, 42, '#ffffff');
    const bw = 280, bh = 60;
    [['Resume', '#14b87e', () => { state = 'play'; }], ['Restart level', '#2d6bff', () => { S.streak = 0; S.save(); startLevel(); }], ['Home', '#7a5cff', () => goHome()]]
      .forEach(([l, col, go], i) => button(c, l, cxp - bw / 2, p.y + 120 + i * 88, bw, bh, pauseFocus === i, col, go));
    p.done();
  }

  function draw(c, t) {
    if (state === 'splash') { drawSplash(c, t); return; }
    if (state === 'home') { drawHome(c, t); return; }
    drawSky(c, t);
    drawLane(c);
    drawAim(c, t);
    drawBoard(c, t);
    drawFlying(c);
    drawShooter(c, t);
    drawBaskets(c, t);
    drawMascot(c, t);
    drawBoosters(c, t);
    drawHud(c, t);
    if (state === 'win') drawWin(c, t);
    if (state === 'lose') drawLose(c, t);
    if (state === 'pause') drawPause(c, t);
  }

  // Test hook: lets a script set up a board and check the rules without a person playing.
  function bestAim() {
    let best = 0, bs = -1;
    for (let a = -1.25; a <= 1.25; a += 0.025) {
      const t = trace(a, false), land = snap(t.x, t.y);
      if (!land) continue;
      grid[land[0]][land[1]] = { k: queue[0], gem: false };
      const g = flood(land[0], land[1], (m) => m.k === queue[0]).length;
      grid[land[0]][land[1]] = null;
      const sc = (g >= 3 ? g * 10 : g) + Math.random();
      if (sc > bs) { bs = sc; best = a; }
    }
    return best;
  }
  window.__bb = { bestAim, setLevel: (l) => { S.level = l; }, get state() { return state; }, start: startLevel, grid: () => grid, fire, setAim: (a) => { aimA = a; }, info: () => ({ shots, gemsGot, gemsTotal, score, state, flying: !!flying }), S };

  buildLevel(S.level);
  updateCamera();
  Kit.run(update, draw);
})();
