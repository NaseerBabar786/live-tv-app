// Highway Rush: race down an endless sunset highway in three lanes. Dodge the traffic, grab coins and
// skim past cars for "Close call!" bonuses; the road keeps getting faster. Fill the boost meter, then
// boost to smash straight through traffic. One crash ends the run. Remote: Left/Right change lane,
// OK (or Up) boosts when the meter is full, Down pauses. Touch: tap left/right half, tap BOOST.
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp } = Kit;
  const LANES = [-2 / 3, 0, 2 / 3];
  const ROAD = 1;              // half width of the road, world units (a lane is 2/3 wide)
  const ZP = 3;                // how far in front of the camera the player's car sits
  const ZNEAR = 1.3, ZFAR = 165, SEG = 3;
  const TRAFFIC_V = 12;        // traffic drives the same way, slower than you
  const SPAWN = 158;
  const BOOST_T = 3.4;
  const CAR_W = 0.5, TRUCK_W = 0.54, PLAYER_W = 0.58;
  const CAR_COLORS = ['#ffd23f', '#ff5964', '#f4f1ff', '#4ea8de', '#9b5de5', '#ff9f1c', '#3bd18f', '#ff7eb6'];
  const PLAYER = '#19d3ff';
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

  const AUTO = location.hash === '#auto'; // self-test: the car drives itself
  let best = Kit.store.get('highwayrush.best', 0) | 0;

  // ---------- Run state ----------
  // state: 'menu' (a demo car drives itself), 'ready' (3-2-1), 'play', 'paused', 'crash', 'over'
  let state = 'menu', stateT = 0, readyT = 0, crashT = 0;
  let pos = 0, trafficPos = 0, speed = 0, base = 38, runT = 0;
  let cars = [], coins = [], rows = [], puffs = [];
  let lastRowZ = 0, safeLane = 1, lane = 1, px = 0, camX = 0, tilt = 0, spin = 0, spinV = 0;
  let score = 0, shown = 0, bump = 0, coinsGot = 0, nears = 0, smashes = 0, meter = 0, boostT = 0;
  let chain = 0, lastNear = -9, newBest = false, bgX = 0, curve = 0, puffT = 0, hintT = 0;
  const tpos = () => pos - trafficPos; // the player in the traffic's frame

  function resetRun(demo) {
    pos = 0; trafficPos = 0; speed = demo ? 46 : 0; base = demo ? 46 : 38; runT = 0;
    cars = []; coins = []; rows = []; puffs = [];
    lane = 1; px = 0; camX = 0; tilt = 0; spin = 0; spinV = 0; safeLane = 1;
    score = 0; shown = 0; coinsGot = 0; nears = 0; smashes = 0; meter = 0; boostT = 0;
    chain = 0; lastNear = -9; newBest = false;
    lastRowZ = tpos() + (demo ? 40 : 70);
    if (demo) fillRows();
  }

  // ---------- Traffic: rows of cars that always leave one lane open ----------
  function fillRows() {
    while (lastRowZ < tpos() + SPAWN) {
      const rel = Math.max(20, base - TRAFFIC_V);
      const t = Math.max(0.5, 1.05 - runT * 0.005) + Math.random() * 0.55;
      const gap = Math.max(9, rel * t);
      lastRowZ += gap;
      spawnRow(lastRowZ, gap);
    }
  }
  function spawnRow(z, gap) {
    // The open lane moves at most one lane from row to row, so it can always be reached.
    if (Math.random() < 0.55) safeLane = clamp(safeLane + (Math.random() < 0.5 ? -1 : 1), 0, 2);
    const others = [0, 1, 2].filter((l) => l !== safeLane).sort(() => Math.random() - 0.5);
    const two = Math.random() < Math.min(0.6, 0.12 + runT * 0.006);
    for (let i = 0; i < (two ? 2 : 1); i++) {
      const truck = Math.random() < 0.2;
      cars.push({ lane: others[i], z: z + (Math.random() - 0.5) * 0.6, truck, pic: truck ? (Math.random() * 3) | 0 : (Math.random() * CAR_COLORS.length) | 0,
        len: truck ? 1.5 : 1.0, passed: false, knock: null });
    }
    rows.push({ z, safe: safeLane });
    // A trail of coins leading into the open lane.
    if (Math.random() < 0.55) {
      const n = Math.min(6, Math.floor((gap - 4) / 2.6));
      for (let i = 0; i < n; i++) coins.push({ lane: safeLane, z: z - i * 2.6, got: false });
    }
  }

  // ---------- Layout and cached pictures ----------
  let W = 0, H = 0, S = 1, F = 1, HY = 0, CAMH = 1, u = 40;
  const pics = {};
  function makePic(w, h, draw) {
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w); cv.height = Math.ceil(h);
    draw(cv.getContext('2d'), w, h);
    return cv;
  }
  function layout(w, h) {
    if (!w || !h) return;
    W = w; H = h;
    S = Math.min(W, H * 16 / 9);
    HY = H * 0.42;
    F = S * 0.375 * ZP;
    CAMH = (H * 0.87 - HY) / (S * 0.375);
    u = Math.min(H / 18, W / 26);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pics.sky = makePic(W * dpr, (HY + 2) * dpr, (c) => { c.scale(dpr, dpr); drawSky(c); });
    pics.far = makePic(W * 1.5 * dpr, H * 0.2 * dpr, (c) => { c.scale(dpr, dpr); drawHills(c, W * 1.5, H * 0.2, 3, '#5a2a6e', 0.55, 'rgba(255,170,150,0.25)'); });
    pics.near = makePic(W * 1.5 * dpr, H * 0.13 * dpr, (c) => { c.scale(dpr, dpr); drawHills(c, W * 1.5, H * 0.13, 5, '#2b1442', 0.7, 'rgba(255,120,140,0.45)'); });
  }
  Kit.onResize(layout);

  function drawSky(c) {
    const g = c.createLinearGradient(0, 0, 0, HY);
    g.addColorStop(0, '#120a33'); g.addColorStop(0.32, '#3b1868'); g.addColorStop(0.62, '#a3306f');
    g.addColorStop(0.86, '#ff6a5c'); g.addColorStop(1, '#ffb36e');
    c.fillStyle = g; c.fillRect(0, 0, W, HY + 2);
    // Stars in the dark top.
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * W, y = Math.random() * HY * 0.45;
      c.globalAlpha = 0.25 + Math.random() * 0.6 * (1 - y / (HY * 0.45));
      c.fillStyle = '#fff'; c.fillRect(x, y, Math.random() < 0.15 ? 2.5 : 1.5, Math.random() < 0.15 ? 2.5 : 1.5);
    }
    c.globalAlpha = 1;
    // A big striped sunset sun with a soft glow.
    const sx = W / 2, sy = HY - H * 0.035, r = H * 0.16;
    const glow = c.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 2.2);
    glow.addColorStop(0, 'rgba(255,180,110,0.55)'); glow.addColorStop(1, 'rgba(255,120,120,0)');
    c.fillStyle = glow; c.fillRect(sx - r * 2.2, sy - r * 2.2, r * 4.4, r * 4.4);
    const sun = makePic(r * 2 + 4, r * 2 + 4, (s) => {
      const sg = s.createLinearGradient(0, 0, 0, r * 2);
      sg.addColorStop(0, '#fff6b8'); sg.addColorStop(0.45, '#ffc04d'); sg.addColorStop(1, '#ff3d7f');
      s.fillStyle = sg; s.beginPath(); s.arc(r + 2, r + 2, r, 0, Math.PI * 2); s.fill();
      s.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 7; i++) {
        const y = r * (1.05 + i * 0.14), th = r * (0.02 + i * 0.016);
        s.fillRect(0, y, r * 2 + 4, th);
      }
    });
    c.drawImage(sun, sx - r - 2, sy - r - 2);
  }
  // Rolling hills that tile side to side (whole-number waves over the width).
  function drawHills(c, w, h, seed, color, height, rim) {
    const ks = [2 + seed % 2, 5, 9 + seed, 17], amps = [0.45, 0.25, 0.16, 0.07], ph = [seed, seed * 2.1, seed * 0.7, seed * 1.3];
    c.beginPath(); c.moveTo(0, h);
    const pts = [];
    for (let x = 0; x <= w; x += 4) {
      let v = 0;
      for (let i = 0; i < 4; i++) v += Math.sin((x / w) * Math.PI * 2 * ks[i] + ph[i]) * amps[i];
      const y = h - h * height * (0.55 + v * 0.5);
      pts.push([x, y]); c.lineTo(x, y);
    }
    c.lineTo(w, h); c.closePath();
    c.fillStyle = color; c.fill();
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.lineWidth = 2; c.strokeStyle = rim; c.stroke();
  }

  // Cars seen from behind: glossy body, glass, glowing tail lights. Drawn once, scaled when used.
  function carPic(color, kind) {
    const w = kind === 'player' ? 520 : 360, h = kind === 'truck' ? w * 1.0 : w * 0.66;
    return makePic(w, h, (c) => {
      // Shadow on the road
      c.fillStyle = 'rgba(0,0,0,0.5)';
      c.beginPath(); c.ellipse(w / 2, h * 0.93, w * 0.5, h * (kind === 'truck' ? 0.04 : 0.06), 0, 0, Math.PI * 2); c.fill();
      if (kind === 'player') {
        const ug = c.createRadialGradient(0, 0, 0, 0, 0, 1);
        ug.addColorStop(0, 'rgba(40,230,255,0.75)'); ug.addColorStop(1, 'rgba(40,230,255,0)');
        c.save(); c.translate(w / 2, h * 0.92); c.scale(w * 0.56, h * 0.11); c.fillStyle = ug;
        c.beginPath(); c.arc(0, 0, 1, 0, Math.PI * 2); c.fill(); c.restore();
      }
      if (kind === 'truck') { drawTruck(c, w, h, color); return; }
      const sporty = kind === 'player';
      const tyreY = sporty ? 0.7 : 0.68;
      c.fillStyle = '#0d0d14';
      roundRect(c, w * 0.07, h * tyreY, w * 0.18, h * (0.93 - tyreY), w * 0.03); c.fill();
      roundRect(c, w * 0.75, h * tyreY, w * 0.18, h * (0.93 - tyreY), w * 0.03); c.fill();
      // Cabin
      const top = sporty ? 0.16 : 0.08, cw = sporty ? 0.24 : 0.22;
      c.beginPath();
      c.moveTo(w * 0.08, h * 0.47); c.lineTo(w * cw, h * top + h * 0.04);
      c.quadraticCurveTo(w * (cw + 0.02), h * top, w * (cw + 0.08), h * top);
      c.lineTo(w * (0.92 - cw), h * top);
      c.quadraticCurveTo(w * (0.98 - cw), h * top, w * (1 - cw), h * top + h * 0.04);
      c.lineTo(w * 0.92, h * 0.47); c.closePath();
      let g = c.createLinearGradient(0, h * top, 0, h * 0.47);
      g.addColorStop(0, shade(color, 0.3)); g.addColorStop(1, shade(color, -0.35));
      c.fillStyle = g; c.fill();
      // Rear window with a sky reflection
      c.save();
      c.beginPath();
      c.moveTo(w * 0.17, h * 0.43); c.lineTo(w * (cw + 0.06), h * (top + 0.06));
      c.lineTo(w * (0.94 - cw), h * (top + 0.06)); c.lineTo(w * 0.83, h * 0.43); c.closePath();
      g = c.createLinearGradient(0, h * top, 0, h * 0.43);
      g.addColorStop(0, '#5a4a8a'); g.addColorStop(0.5, '#1f1b3a'); g.addColorStop(1, '#0a0a18');
      c.fillStyle = g; c.fill(); c.clip();
      c.fillStyle = 'rgba(255,190,170,0.22)';
      c.beginPath(); c.moveTo(w * 0.3, h * 0.45); c.lineTo(w * 0.52, h * top); c.lineTo(w * 0.62, h * top); c.lineTo(w * 0.4, h * 0.45); c.fill();
      c.restore();
      // Lower body
      roundRect(c, w * 0.03, h * 0.41, w * 0.94, h * (sporty ? 0.4 : 0.42), h * 0.11);
      g = c.createLinearGradient(0, h * 0.41, 0, h * 0.84);
      g.addColorStop(0, shade(color, 0.45)); g.addColorStop(0.35, color); g.addColorStop(1, shade(color, -0.55));
      c.fillStyle = g; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.4)';
      roundRect(c, w * 0.1, h * 0.425, w * 0.8, h * 0.018, h * 0.01); c.fill();
      if (sporty) {
        // Racing stripes and a rear wing
        c.fillStyle = 'rgba(255,60,170,0.9)';
        c.fillRect(w * 0.42, h * 0.41, w * 0.05, h * 0.4); c.fillRect(w * 0.53, h * 0.41, w * 0.05, h * 0.4);
        c.fillStyle = '#14122a';
        c.fillRect(w * 0.18, h * 0.3, w * 0.025, h * 0.12); c.fillRect(w * 0.795, h * 0.3, w * 0.025, h * 0.12);
        roundRect(c, w * 0.02, h * 0.26, w * 0.96, h * 0.06, h * 0.03); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(w * 0.05, h * 0.265, w * 0.9, h * 0.012);
      }
      // Bumper, plate, exhausts
      c.fillStyle = '#1a1826';
      roundRect(c, w * 0.05, h * 0.72, w * 0.9, h * 0.1, h * 0.05); c.fill();
      c.fillStyle = '#f0eef8'; roundRect(c, w * 0.41, h * 0.6, w * 0.18, h * 0.08, h * 0.015); c.fill();
      c.fillStyle = '#4a4660'; c.fillRect(w * 0.44, h * 0.63, w * 0.12, h * 0.02);
      if (sporty) {
        c.fillStyle = '#b9b6c8';
        for (const x of [0.3, 0.7]) { c.beginPath(); c.arc(w * x, h * 0.78, h * 0.035, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#222'; for (const x of [0.3, 0.7]) { c.beginPath(); c.arc(w * x, h * 0.78, h * 0.02, 0, Math.PI * 2); c.fill(); }
      }
      // Tail lights with a glow (fine here: drawn only once)
      c.shadowColor = '#ff2a55'; c.shadowBlur = w * 0.05;
      c.fillStyle = sporty ? '#ff2a7a' : '#ff2a45';
      if (sporty) { roundRect(c, w * 0.06, h * 0.5, w * 0.88, h * 0.055, h * 0.025); c.fill(); }
      else {
        roundRect(c, w * 0.06, h * 0.48, w * 0.24, h * 0.09, h * 0.03); c.fill();
        roundRect(c, w * 0.7, h * 0.48, w * 0.24, h * 0.09, h * 0.03); c.fill();
      }
      c.shadowBlur = 0;
      c.fillStyle = 'rgba(255,220,230,0.85)';
      if (sporty) c.fillRect(w * 0.08, h * 0.515, w * 0.84, h * 0.012);
      else { c.fillRect(w * 0.09, h * 0.505, w * 0.18, h * 0.015); c.fillRect(w * 0.73, h * 0.505, w * 0.18, h * 0.015); }
    });
  }
  function drawTruck(c, w, h, color) {
    c.fillStyle = '#0d0d14';
    roundRect(c, w * 0.1, h * 0.8, w * 0.2, h * 0.13, w * 0.03); c.fill();
    roundRect(c, w * 0.7, h * 0.8, w * 0.2, h * 0.13, w * 0.03); c.fill();
    roundRect(c, w * 0.03, h * 0.03, w * 0.94, h * 0.78, w * 0.04);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, shade(color, -0.3)); g.addColorStop(0.3, shade(color, 0.15)); g.addColorStop(1, shade(color, -0.4));
    c.fillStyle = g; c.fill();
    c.lineWidth = w * 0.012; c.strokeStyle = shade(color, -0.55); c.stroke();
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(w * 0.495, h * 0.06, w * 0.01, h * 0.7);
    for (let i = 0; i < 4; i++) c.fillRect(w * 0.06, h * (0.18 + i * 0.15), w * 0.88, h * 0.012);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(w * 0.06, h * 0.05, w * 0.88, h * 0.015);
    c.fillStyle = '#1a1826'; c.fillRect(w * 0.02, h * 0.79, w * 0.96, h * 0.05);
    c.shadowColor = '#ff2a55'; c.shadowBlur = w * 0.04; c.fillStyle = '#ff2a45';
    roundRect(c, w * 0.05, h * 0.7, w * 0.12, h * 0.06, h * 0.02); c.fill();
    roundRect(c, w * 0.83, h * 0.7, w * 0.12, h * 0.06, h * 0.02); c.fill();
    c.shadowBlur = 0;
    c.fillStyle = '#ffb347'; c.fillRect(w * 0.1, h * 0.04, w * 0.05, h * 0.02); c.fillRect(w * 0.85, h * 0.04, w * 0.05, h * 0.02);
  }
  function coinPic() {
    return makePic(128, 128, (c) => {
      const g = c.createRadialGradient(46, 40, 6, 64, 64, 62);
      g.addColorStop(0, '#fff7c2'); g.addColorStop(0.45, '#ffd23f'); g.addColorStop(1, '#c47a00');
      c.fillStyle = g; c.beginPath(); c.arc(64, 64, 60, 0, Math.PI * 2); c.fill();
      c.lineWidth = 6; c.strokeStyle = '#a35d00'; c.stroke();
      c.beginPath(); c.arc(64, 64, 44, 0, Math.PI * 2); c.strokeStyle = 'rgba(160,90,0,0.6)'; c.lineWidth = 4; c.stroke();
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 14 : 32, a = -Math.PI / 2 + (i * Math.PI) / 5;
        c.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
      }
      c.closePath(); c.fillStyle = '#fff3b0'; c.fill(); c.strokeStyle = '#c47a00'; c.lineWidth = 3; c.stroke();
    });
  }
  function palmPic() {
    return makePic(320, 460, (c, w, h) => {
      // Trunk: a gentle curve of rings, dark against the sunset.
      for (let i = 0; i < 22; i++) {
        const k = i / 21, x = w * 0.5 + Math.sin(k * 1.6) * w * 0.14, y = h - k * h * 0.78;
        c.fillStyle = i % 2 ? '#3b2246' : '#472a52';
        c.beginPath(); c.ellipse(x, y, w * (0.06 - k * 0.025), h * 0.024, 0, 0, Math.PI * 2); c.fill();
      }
      const tx = w * 0.5 + Math.sin(1.6) * w * 0.14, ty = h * 0.22;
      const leaves = [[-2.8, 1], [-2.2, 1.1], [-1.6, 0.8], [-0.9, 0.85], [-0.3, 1.1], [0.3, 1], [-1.25, 0.6]];
      for (const [a, len] of leaves) {
        const L = w * 0.46 * len;
        const ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.55 + L * 0.35;
        const mx = tx + Math.cos(a) * L * 0.5, my = ty + Math.sin(a) * L * 0.6 - L * 0.08;
        c.beginPath(); c.moveTo(tx, ty);
        c.quadraticCurveTo(mx - Math.sin(a) * L * 0.12, my - L * 0.12, ex, ey);
        c.quadraticCurveTo(mx + Math.sin(a) * L * 0.1, my + L * 0.05, tx, ty);
        c.fillStyle = '#1d3b45'; c.fill();
        c.lineWidth = 2; c.strokeStyle = 'rgba(255,150,120,0.45)'; c.stroke();
      }
      c.fillStyle = '#5a3420';
      for (const [dx, dy] of [[-8, 6], [6, 8], [0, 14]]) { c.beginPath(); c.arc(tx + dx, ty + dy, 8, 0, Math.PI * 2); c.fill(); }
    });
  }
  function lampPic(flip) {
    return makePic(260, 420, (c, w, h) => {
      if (flip) { c.translate(w, 0); c.scale(-1, 1); }
      const x0 = w * 0.1;
      // Warm glow under the head, then the pole and arm.
      const hx = w * 0.82, hy = h * 0.09;
      const g = c.createRadialGradient(hx, hy + 10, 0, hx, hy + 10, w * 0.2);
      g.addColorStop(0, 'rgba(255,220,160,0.85)'); g.addColorStop(1, 'rgba(255,170,110,0)');
      c.fillStyle = g; c.fillRect(hx - w * 0.2, hy - w * 0.2 + 10, w * 0.4, w * 0.4);
      c.fillStyle = '#2a2238';
      c.fillRect(x0 - 6, h * 0.08, 12, h * 0.92);
      c.fillRect(x0 - 12, h * 0.95, 24, h * 0.05);
      c.lineWidth = 9; c.strokeStyle = '#2a2238'; c.lineCap = 'round';
      c.beginPath(); c.moveTo(x0, h * 0.12); c.quadraticCurveTo(x0, h * 0.06, x0 + 40, h * 0.06); c.lineTo(hx, h * 0.06); c.stroke();
      c.fillStyle = '#3a3150'; roundRect(c, hx - 26, h * 0.05, 52, 14, 6); c.fill();
      c.fillStyle = '#fff1c8'; roundRect(c, hx - 20, h * 0.05 + 10, 40, 6, 3); c.fill();
    });
  }
  function puffPic() {
    return makePic(64, 64, (c) => {
      const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, 'rgba(90,80,110,0.7)'); g.addColorStop(1, 'rgba(90,80,110,0)');
      c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    });
  }
  function flamePic() {
    return makePic(64, 128, (c) => {
      const g = c.createLinearGradient(0, 0, 0, 128);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#7ff3ff'); g.addColorStop(0.6, '#ff4fd8'); g.addColorStop(1, 'rgba(255,60,200,0)');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(14, 0); c.quadraticCurveTo(0, 60, 32, 128); c.quadraticCurveTo(64, 60, 50, 0); c.closePath(); c.fill();
    });
  }
  const groundPic = makePic(4, 128, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#4a2440'); g.addColorStop(0.25, '#2c1636'); g.addColorStop(1, '#170c24');
    c.fillStyle = g; c.fillRect(0, 0, 4, 128);
  });
  const fogPic = makePic(4, 64, (c) => {
    const g = c.createLinearGradient(0, 0, 0, 64);
    g.addColorStop(0, 'rgba(255,160,120,0.85)'); g.addColorStop(1, 'rgba(255,140,120,0)');
    c.fillStyle = g; c.fillRect(0, 0, 4, 64);
  });
  const TRUCKS = ['#e8e6f0', '#4ea8de', '#ff9f1c'];
  const carPics = CAR_COLORS.map((col) => carPic(col, 'car'));
  const truckPics = TRUCKS.map((col) => carPic(col, 'truck'));
  const playerPic = carPic(PLAYER, 'player');
  const coinImg = coinPic(), palmImg = palmPic(), lampL = lampPic(false), lampR = lampPic(true);
  const puffImg = puffPic(), flameImg = flamePic();

  // ---------- Projection ----------
  // A point on the road at side x and distance zr in front of the camera.
  function curveAt(zr) { const d = Math.max(0, zr - ZP); return curve * d * d * 0.0022; }
  function scaleAt(zr) { return F / zr; }
  function sxAt(x, zr) { return W / 2 + (x - camX + curveAt(zr)) * F / zr; }
  function syAt(zr) { return HY + CAMH * F / zr; }

  // ---------- Controls ----------
  function steer(d) {
    if (state !== 'play' && state !== 'ready') return;
    const nl = clamp(lane + (d === 'left' ? -1 : 1), 0, 2);
    if (nl === lane) { Kit.tone(160, { type: 'square', dur: 0.06, vol: 0.05 }); tilt += d === 'left' ? -0.05 : 0.05; return; }
    lane = nl;
    Kit.noise({ dur: 0.16, vol: 0.07, freq: 700, q: 0.8, sweep: 2.5 });
  }
  function tryBoost() {
    if (state !== 'play') return;
    if (boostT > 0) return;
    if (meter < 1) { Kit.tone(220, { type: 'triangle', dur: 0.08, vol: 0.08 }); return; }
    boostT = BOOST_T; meter = 0;
    Kit.shake(7, 0.35);
    Kit.noise({ dur: 0.7, vol: 0.2, freq: 300, q: 0.7, sweep: 8 });
    Kit.tone(180, { type: 'sawtooth', dur: 0.6, vol: 0.08, slide: 3 });
    Kit.float('BOOST!', W / 2, H * 0.5, { color: '#7ff3ff', size: u * 1.6, life: 1.1, big: true });
  }
  function start() {
    resetRun(false);
    state = 'ready'; readyT = stateT; hintT = 0;
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.15 });
  }
  function pause() { if (state === 'play' || state === 'ready') { state = 'paused'; Kit.tone(440, { type: 'triangle', dur: 0.08, vol: 0.1 }); } }
  function resume() { state = 'play'; Kit.tone(660, { type: 'triangle', dur: 0.08, vol: 0.1 }); }

  // Held arrows: TV remotes repeat keydowns while held, so one lane per press, then a steady repeat.
  const held = { left: false, right: false }, nextRep = { left: 0, right: 0 };
  const DIR_KEYS = { ArrowLeft: 'left', Left: 'left', a: 'left', A: 'left', ArrowRight: 'right', Right: 'right', d: 'right', D: 'right' };
  window.addEventListener('keydown', (e) => {
    const d = DIR_KEYS[e.key] || (e.keyCode === 37 ? 'left' : e.keyCode === 39 ? 'right' : null);
    if (!d) return;
    const now = performance.now();
    if (!held[d]) { held[d] = true; nextRep[d] = now + 320; steer(d); }
    else if (now >= nextRep[d]) { nextRep[d] = now + 180; steer(d); }
  });
  window.addEventListener('keyup', (e) => {
    const d = DIR_KEYS[e.key] || (e.keyCode === 37 ? 'left' : e.keyCode === 39 ? 'right' : null);
    if (d) held[d] = false;
  });
  window.addEventListener('blur', () => { held.left = held.right = false; });

  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { if (k === 'ok') start(); return; }
    if (state === 'over') { if (k === 'ok' && stateT - crashT > 2.2) start(); return; }
    if (state === 'paused') { if (k !== 'left' && k !== 'right') resume(); return; }
    if (state === 'crash') return;
    if (k === 'restart') { start(); return; }
    if (k === 'ok' || k === 'up') tryBoost();
    else if (k === 'down') pause();
  });

  const muteBox = () => ({ x: W - 58, y: 8, w: 48, h: 48 });
  const inBox = (e, b) => b && e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  let L = {};
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') { start(); return; }
      if (state === 'over') { if (stateT - crashT > 2.2) start(); return; }
      if (state === 'paused') { resume(); return; }
      if (state === 'crash') return;
      if (inBox(e, L.boostBtn)) { tryBoost(); return; }
      steer(e.x < W / 2 ? 'left' : 'right');
    },
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!W) layout(Kit.W, Kit.H);
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    if (state === 'paused' || state === 'over') { stepPuffs(dt); return; }

    const demo = state === 'menu';
    if (state === 'ready') {
      const k = stateT - readyT;
      const n = Math.floor(k / 0.75);
      if (n !== Math.floor((k - dt) / 0.75) && n <= 3) Kit.tone(n < 3 ? 520 : 1040, { type: 'triangle', dur: n < 3 ? 0.14 : 0.3, vol: 0.18 });
      speed = lerp(speed, base * 0.6, Math.min(1, dt * 1.2));
      if (k > 2.25) { state = 'play'; lastRowZ = Math.max(lastRowZ, tpos() + 60); }
    } else if (state === 'play') {
      runT += dt; hintT += dt;
      base = Math.min(90, 38 + runT * 0.5);
      const target = boostT > 0 ? base * 1.6 : base;
      speed += (target - speed) * Math.min(1, dt * (boostT > 0 ? 3 : 1.4));
      if (boostT > 0) { boostT -= dt; if (boostT <= 0) Kit.tone(300, { type: 'sine', dur: 0.3, vol: 0.08, slide: 0.5 }); }
      else meter = Math.min(1, meter + dt * 0.02);
      if (meter >= 1 && !L.fullPinged) { L.fullPinged = true; [0, 2, 4].forEach((n, i) => Kit.tone(NOTES[n + 3], { type: 'sine', dur: 0.2, vol: 0.1, at: i * 0.06 })); }
      if (meter < 1) L.fullPinged = false;
    } else if (state === 'crash') {
      speed *= Math.exp(-dt * 2.2);
      spin += spinV * dt; spinV *= Math.exp(-dt * 2);
      puffT -= dt;
      if (puffT <= 0) { puffT = 0.06; puffs.push({ x: sxAt(px, ZP) + (Math.random() - 0.5) * u, y: syAt(ZP) - u * 1.5, r: u * 0.6, t: 0, vx: (Math.random() - 0.5) * 40 }); }
      if (stateT - crashT > 1.5) state = 'over';
    }
    if (demo || (AUTO && state === 'play')) {
      // The menu car (and the #auto self-test) follows the open lane on its own.
      const next = rows.find((r) => r.z > tpos() + ZP - 2.2);
      if (next) lane = next.safe;
      if (demo) speed = lerp(speed, 46, Math.min(1, dt));
      else if (meter >= 1) tryBoost();
    }

    // Move in small steps so fast cars never jump through each other.
    const steps = Math.max(1, Math.ceil((speed * dt) / 0.5));
    const sdt = dt / steps;
    for (let i = 0; i < steps; i++) {
      pos += speed * sdt;
      trafficPos += TRAFFIC_V * sdt;
      if (state === 'play' || demo) { score += demo ? 0 : speed * sdt * 0.5; collide(demo); }
      if (state !== 'play' && !demo) continue;
      if (state === 'crash') break;
    }
    if (state === 'play' || demo) fillRows();
    for (const c of cars) if (c.knock) { c.knock.t += dt; c.knock.x += c.knock.vx * dt; c.knock.rot += c.knock.vr * dt; c.z += 10 * dt; }
    const tp = tpos();
    cars = cars.filter((c) => c.z - tp > ZNEAR + 0.6 && (!c.knock || c.knock.t < 1.4));
    coins = coins.filter((c) => !c.got && c.z - tp > ZNEAR + 0.6);
    rows = rows.filter((r) => r.z > tp - 5);

    // Smooth lane slide, a little lean, and the camera follows a touch behind.
    if (state !== 'crash') {
      const want = LANES[lane];
      const v = (want - px) * (1 - Math.exp(-dt * 13));
      px += v;
      tilt = lerp(tilt, clamp(v / Math.max(dt, 0.001) * 0.025, -0.16, 0.16), Math.min(1, dt * 14));
    }
    camX = lerp(camX, px * 0.55, Math.min(1, dt * 6));
    curve = Math.sin(pos * 0.0042) * Math.sin(pos * 0.0013 + 1.2) * 1.1;
    bgX += curve * speed * dt * 1.6;
    stepPuffs(dt);
  }
  function stepPuffs(dt) {
    for (let i = puffs.length - 1; i >= 0; i--) {
      const p = puffs[i]; p.t += dt; p.y -= 50 * dt; p.x += p.vx * dt; p.r += u * 1.2 * dt;
      if (p.t > 1.2) puffs.splice(i, 1);
    }
  }

  function collide(demo) {
    const pz = tpos() + ZP;
    for (const c of cars) {
      if (c.knock) continue;
      const dz = c.z - pz, dx = Math.abs(LANES[c.lane] - px);
      if (!demo && Math.abs(dz) < c.len && dx < 0.42) {
        if (boostT > 0) smash(c); else { crash(c); return; }
        continue;
      }
      if (!c.passed && dz < -c.len - 0.2) {
        c.passed = true;
        if (!demo && dx < 0.95 && boostT <= 0) nearMiss(c);
      }
    }
    for (const c of coins) {
      if (c.got) continue;
      if (Math.abs(c.z - pz) < 0.9 && Math.abs(LANES[c.lane] - px) < 0.4) {
        c.got = true;
        const x = sxAt(LANES[c.lane], ZP), y = syAt(ZP) - u * 2.6;
        Kit.burst(x, y, '#ffd23f', demo ? 6 : 10, 0.6);
        if (demo) continue;
        coinsGot++; score += 50; bump = 1; meter = Math.min(1, meter + (boostT > 0 ? 0 : 0.035));
        const f = NOTES[Math.min(NOTES.length - 1, 4 + (coinsGot % 4))];
        Kit.tone(f, { type: 'square', dur: 0.06, vol: 0.06 }); Kit.tone(f * 1.5, { type: 'sine', dur: 0.16, vol: 0.12, at: 0.05 });
        Kit.float('+50', x, y - u * 0.4, { color: '#ffd23f', size: u * 0.8, life: 0.8 });
      }
    }
  }
  function nearMiss(c) {
    chain = runT - lastNear < 2.5 ? chain + 1 : 1;
    lastNear = runT; nears++;
    const pts = 100 * Math.min(chain, 5);
    score += pts; bump = 1; meter = Math.min(1, meter + 0.12);
    const x = sxAt(px, ZP), y = syAt(ZP) - u * 4.2;
    Kit.float(chain > 1 ? `Close call ×${Math.min(chain, 5)}!` : 'Close call!', x, y, { color: '#ff8de3', size: u * 0.95, life: 1 });
    Kit.float(`+${pts}`, x, y + u * 0.95, { color: '#ffffff', size: u * 0.7, life: 0.9 });
    Kit.noise({ dur: 0.25, vol: 0.12, freq: 1800, q: 0.6, sweep: 0.3 });
    Kit.tone(NOTES[Math.min(8, 3 + chain)], { type: 'triangle', dur: 0.14, vol: 0.12, at: 0.05 });
  }
  function smash(c) {
    const side = LANES[c.lane] >= px ? 1 : -1;
    c.knock = { t: 0, x: 0, vx: side * (2.5 + Math.random() * 1.5), rot: 0, vr: side * (6 + Math.random() * 4) };
    smashes++; score += 150; bump = 1;
    const x = sxAt(LANES[c.lane], ZP + 0.5), y = syAt(ZP) - u * 2;
    Kit.burst(x, y, '#ffb347', 18, 1.1); Kit.burst(x, y, '#7ff3ff', 10, 0.9);
    Kit.shake(10, 0.3);
    Kit.float('SMASH! +150', x, y - u * 1.6, { color: '#7ff3ff', size: u * 0.9, life: 0.9 });
    Kit.noise({ dur: 0.3, vol: 0.28, freq: 900, q: 0.6, sweep: 0.3 });
    Kit.tone(120, { type: 'square', dur: 0.15, vol: 0.12, slide: 0.5 });
  }
  function crash(c) {
    state = 'crash'; crashT = stateT; boostT = 0;
    spinV = (LANES[c.lane] >= px ? -1 : 1) * 9;
    c.knock = { t: 0, x: 0, vx: (LANES[c.lane] >= px ? 1 : -1) * 0.8, rot: 0, vr: (LANES[c.lane] >= px ? 1 : -1) * 2 };
    const x = sxAt(px, ZP), y = syAt(ZP) - u * 2.6;
    Kit.burst(x, y, '#ffb347', 34, 1.5); Kit.burst(x, y, '#fff3b0', 18, 1.2); Kit.burst(x, y, '#ff4f6d', 12, 1);
    Kit.shake(22, 0.6);
    Kit.noise({ dur: 0.6, vol: 0.4, freq: 400, q: 0.5, sweep: 0.2, type: 'lowpass' });
    Kit.noise({ dur: 0.25, vol: 0.2, freq: 4000, q: 0.8 });
    Kit.tone(90, { type: 'sawtooth', dur: 0.5, vol: 0.14, slide: 0.4 });
    setTimeout(() => Kit.sfx.over(), 800);
    const final = Math.round(score);
    score = final;
    if (final > best) { newBest = best > 0 || final > 0; best = final; Kit.store.set('highwayrush.best', best); Kit.record('highwayrush', best); }
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center', italic = false) {
    c.font = `${italic ? 'italic ' : ''}900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(26,10,40,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function glass(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    c.fillStyle = 'rgba(22,10,42,0.72)'; c.fill();
    if (border) { c.lineWidth = 2.5; c.strokeStyle = border; c.stroke(); }
  }
  function trap(c, x1, y1, w1, x2, y2, w2, color) {
    c.fillStyle = color;
    c.beginPath(); c.moveTo(x1 - w1, y1); c.lineTo(x2 - w2, y2); c.lineTo(x2 + w2, y2); c.lineTo(x1 + w1, y1); c.closePath(); c.fill();
  }

  function drawRoad(c) {
    c.drawImage(groundPic, 0, HY, W, H - HY);
    const i0 = Math.floor((pos + ZNEAR) / SEG), i1 = Math.floor((pos + ZFAR) / SEG);
    // Ground stripes first (all of them), so none can draw over the road's edge.
    c.fillStyle = 'rgba(255,170,200,0.045)';
    for (let i = i1; i >= i0; i--) {
      if (i % 2) continue;
      const z1 = Math.max(ZNEAR, i * SEG - pos), z2 = (i + 1) * SEG - pos;
      const y1 = HY + CAMH * F / z1, y2 = HY + CAMH * F / z2;
      if (y2 < H) c.fillRect(0, y2, W, y1 - y2);
    }
    for (let i = i1; i >= i0; i--) {
      const z1 = Math.max(ZNEAR, i * SEG - pos), z2 = (i + 1) * SEG - pos;
      if (z2 <= z1) continue;
      const s1 = F / z1, s2 = F / z2;
      const y1 = HY + CAMH * s1, y2 = HY + CAMH * s2 - 0.6;
      if (y2 > H) continue;
      const x1 = sxAt(0, z1), x2 = sxAt(0, z2);
      trap(c, x1, y1, ROAD * 1.13 * s1, x2, y2, ROAD * 1.13 * s2, i % 2 ? '#ff4f6d' : '#ffe9f0');
      trap(c, x1, y1, ROAD * s1, x2, y2, ROAD * s2, i % 2 ? '#3a3352' : '#363049');
      if (i % 3 === 0) {
        for (const lx of [-1 / 3, 1 / 3]) {
          trap(c, sxAt(lx, z1), y1, 0.022 * s1, sxAt(lx, z2), y2, 0.022 * s2, '#ffe2b8');
        }
      }
      for (const lx of [-0.93, 0.93]) trap(c, sxAt(lx, z1), y1, 0.014 * s1, sxAt(lx, z2), y2, 0.014 * s2, 'rgba(255,240,230,0.75)');
    }
    // Haze where the road meets the sky.
    c.drawImage(fogPic, 0, HY - 1, W, H * 0.09);
  }

  function drawObjects(c, t) {
    const list = [];
    const tp = tpos();
    // Scenery along the road side: palms, and street lamps leaning over the road.
    const k0 = Math.ceil((pos + ZNEAR + 0.5) / 7), k1 = Math.floor((pos + ZFAR - 4) / 7);
    for (let k = k1; k >= k0; k--) {
      const h = Math.sin(k * 127.1) * 43758.5453, r = h - Math.floor(h);
      const side = k % 2 ? 1 : -1;
      if (k % 4 === 1 || k % 4 === 2) list.push({ zr: k * 7 - pos, kind: side < 0 ? 'lampL' : 'lampR', x: side * 1.32 });
      else list.push({ zr: k * 7 - pos, kind: 'palm', x: side * (1.75 + r * 1.3) });
      if (r > 0.55) list.push({ zr: k * 7 - pos + 3, kind: 'palm', x: -side * (2.1 + r * 1.4) });
    }
    for (const car of cars) list.push({ zr: car.z - tp, kind: 'car', ref: car });
    for (const co of coins) list.push({ zr: co.z - tp, kind: 'coin', ref: co });
    list.push({ zr: ZP, kind: 'player' });
    list.sort((a, b) => b.zr - a.zr);
    for (const o of list) {
      const zr = o.zr;
      if (zr < ZNEAR || zr > ZFAR) continue;
      const s = F / zr, gy = HY + CAMH * s;
      const fade = clamp((ZFAR - zr) / 30, 0, 1);
      c.globalAlpha = fade;
      if (o.kind === 'player') { c.globalAlpha = 1; drawPlayer(c, t); continue; }
      if (o.kind === 'palm' || o.kind === 'lampL' || o.kind === 'lampR') {
        const img = o.kind === 'palm' ? palmImg : o.kind === 'lampL' ? lampL : lampR;
        const ww = (o.kind === 'palm' ? 1.5 : 1.0) * s, hh = ww * img.height / img.width;
        const ax = o.kind === 'palm' ? 0.5 : o.kind === 'lampL' ? 0.1 : 0.9;
        const x = sxAt(o.x, zr);
        if (x + ww < 0 || x - ww > W || zr < 4.5) continue;
        c.globalAlpha = fade * clamp((zr - 4.5) / 4, 0, 1); // fade out as it passes, so it never covers the score
        c.drawImage(img, x - ww * ax, gy - hh, ww, hh);
      } else if (o.kind === 'car') {
        const car = o.ref, img = car.truck ? truckPics[car.pic] : carPics[car.pic];
        const ww = (car.truck ? TRUCK_W : CAR_W) * s, hh = ww * img.height / img.width;
        let x = sxAt(LANES[car.lane], zr);
        if (car.knock) {
          const k = car.knock;
          x += k.x * s;
          c.save(); c.translate(x, gy - hh * 0.4 - Math.sin(Math.min(1, k.t * 1.5) * Math.PI) * hh * 0.5); c.rotate(k.rot * 0.15);
          c.globalAlpha = fade * clamp(1.4 - k.t, 0, 1);
          c.drawImage(img, -ww / 2, -hh * 0.53, ww, hh);
          c.restore();
        } else c.drawImage(img, x - ww / 2, gy - hh * 0.93, ww, hh);
      } else if (o.kind === 'coin') {
        const ww = 0.3 * s, x = sxAt(LANES[o.ref.lane], zr);
        const sp = Math.abs(Math.cos(t * 4 + o.ref.z * 0.6));
        const y = gy - ww * 1.0 - Math.sin(t * 5 + o.ref.z) * ww * 0.08;
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(x - ww * 0.3, gy - ww * 0.06, ww * 0.6, ww * 0.1);
        c.drawImage(coinImg, x - (ww * Math.max(0.12, sp)) / 2, y - ww / 2, ww * Math.max(0.12, sp), ww);
      }
    }
    c.globalAlpha = 1;
  }

  function drawPlayer(c, t) {
    const s = F / ZP, gy = HY + CAMH * s;
    const ww = PLAYER_W * s, hh = ww * playerPic.height / playerPic.width;
    const x = sxAt(px, ZP);
    const bob = state === 'play' || state === 'menu' ? Math.sin(t * 23) * u * 0.02 : 0;
    c.save();
    c.translate(x, gy + bob);
    c.rotate(state === 'crash' || state === 'over' ? spin * 0.08 : tilt);
    if (boostT > 0 || (state === 'play' && speed > base * 1.15)) {
      // Exhaust flames while boosting
      const fl = 0.8 + Math.random() * 0.4, fw = ww * 0.09, fh = hh * 0.55 * fl;
      for (const fx of [-0.2, 0.2]) c.drawImage(flameImg, fx * ww - fw / 2, -hh * 0.2, fw, fh);
    }
    c.drawImage(playerPic, -ww / 2, -hh * 0.93, ww, hh);
    c.restore();
  }

  function drawSpeedLines(c, t) {
    if (boostT <= 0) return;
    const a = Math.min(1, boostT * 2, (BOOST_T - boostT) * 4);
    const vx = sxAt(0, ZFAR), vy = HY;
    c.strokeStyle = `rgba(200,250,255,${0.45 * a})`; c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 26; i++) {
      const ang = Math.random() * Math.PI * 2, r0 = (0.25 + Math.random() * 0.4) * W, len = (0.08 + Math.random() * 0.12) * W;
      c.moveTo(vx + Math.cos(ang) * r0, vy + Math.sin(ang) * r0 * 0.7);
      c.lineTo(vx + Math.cos(ang) * (r0 + len), vy + Math.sin(ang) * (r0 + len) * 0.7);
    }
    c.stroke();
  }

  function draw(c, t) {
    if (!W) return;
    // Sky, then two layers of hills that slide as the road bends.
    c.drawImage(pics.sky, 0, 0, W, HY + 2);
    for (const [img, k, hgt] of [[pics.far, 0.35, H * 0.2], [pics.near, 0.7, H * 0.13]]) {
      const tw = W * 1.5;
      let ox = -(((bgX * k) % tw) + tw) % tw;
      for (; ox < W; ox += tw) c.drawImage(img, ox, HY - hgt + 1, tw, hgt);
    }
    drawRoad(c);
    drawObjects(c, t);
    for (const p of puffs) {
      c.globalAlpha = Math.max(0, 1 - p.t / 1.2);
      c.drawImage(puffImg, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
    }
    c.globalAlpha = 1;
    drawSpeedLines(c, t);

    if (state !== 'menu') drawHud(c, t);
    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (state === 'ready') {
      const k = stateT - readyT, n = Math.floor(k / 0.75);
      const word = n < 3 ? String(3 - n) : 'GO!';
      const p = ease.back(clamp((k % 0.75) / 0.3, 0, 1));
      outlined(c, word, W / 2, H * 0.3, u * 3.2 * p, '#ffffff', n < 3 ? '#ffb347' : '#7ff3ff', 'center', true);
      glass(c, W / 2 - u * 9, H * 0.42, u * 18, u * 1.3, u * 0.65);
      text(c, Kit.touchFirst() ? 'Tap left / right to change lane' : '◀ ▶ change lane   ·   OK boost when full   ·   ▼ pause', W / 2, H * 0.42 + u * 0.65, u * 0.55, '#ffffff', 700);
    }
    if (state === 'paused') {
      c.fillStyle = 'rgba(14,6,30,0.62)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.4, u * 2.2, '#ffffff', '#ffb347', 'center', true);
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'OK to carry on   ·   Back for games', W / 2, H * 0.55, u * 0.7, 'rgba(255,255,255,0.9)', 700);
    }
    if (state === 'over') drawOver(c, t);
  }

  function drawHud(c, t) {
    const pad = u * 0.5;
    // Score (counts up) with coins underneath
    c.save();
    c.translate(pad + u * 0.2, pad + u * 0.85); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
    outlined(c, String(Math.round(shown)), 0, 0, u * 1.5, '#fff6c2', '#ffb703', 'left', true);
    c.restore();
    text(c, `🪙 ${coinsGot}    ⚡ ${nears}`, pad + u * 0.25, pad + u * 2.1, u * 0.6, 'rgba(255,255,255,0.92)', 800, 'left');
    // Speedometer
    const kmh = Math.round(speed * 3.2);
    outlined(c, String(kmh), W / 2, pad + u * 0.8, u * 1.35, '#ffffff', boostT > 0 ? '#7ff3ff' : '#ffc6a8', 'center', true);
    text(c, 'km/h', W / 2, pad + u * 1.85, u * 0.45, 'rgba(255,230,220,0.85)', 800);
    // Best
    const beat = Math.round(score) > best && best > 0;
    text(c, `👑 ${Math.max(best, state === 'over' || state === 'crash' ? 0 : Math.round(score))}`, W - 70, pad + u * 0.55, u * 0.65, beat ? '#ffd23f' : 'rgba(255,255,255,0.9)', 800, 'right');
    if (beat && !newBest && state === 'play') {
      newBest = true;
      Kit.float('New best!', W - u * 4, pad + u * 2.2, { color: '#ffd23f', size: u * 0.8, life: 1.6, big: true });
      Kit.tone(NOTES[5], { type: 'sine', dur: 0.2, vol: 0.12 }); Kit.tone(NOTES[7], { type: 'sine', dur: 0.3, vol: 0.12, at: 0.08 });
    }
    // Boost meter, bottom right
    const bw = u * 6.4, bh = u * 1.15, bx = W - bw - u * 0.7, by = H - bh - u * 0.6;
    L.boostBtn = { x: bx - 10, y: by - u - 10, w: bw + 20, h: bh + u + 20 };
    const full = meter >= 1 && boostT <= 0, k = boostT > 0 ? boostT / BOOST_T : meter;
    glass(c, bx, by, bw, bh, bh / 2, full ? '#7ff3ff' : 'rgba(255,255,255,0.25)');
    if (k > 0.01) {
      const g = c.createLinearGradient(bx, 0, bx + bw, 0);
      g.addColorStop(0, '#ff4fd8'); g.addColorStop(1, '#7ff3ff');
      c.fillStyle = g;
      roundRect(c, bx + 4, by + 4, Math.max(bh - 8, (bw - 8) * k), bh - 8, (bh - 8) / 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.3)';
      roundRect(c, bx + 8, by + 6, Math.max(0, (bw - 16) * k), (bh - 8) * 0.28, 4); c.fill();
    }
    const label = boostT > 0 ? 'BOOSTING!' : full ? (Kit.touchFirst() ? 'TAP  BOOST!' : 'OK  BOOST!') : 'BOOST';
    const pulse = full ? 1 + Math.sin(t * 8) * 0.06 : 1;
    c.save(); c.translate(bx + bw / 2, by + bh / 2); c.scale(pulse, pulse);
    c.font = `italic 900 ${Math.round(u * 0.6)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = u * 0.12; c.lineJoin = 'round'; c.strokeStyle = 'rgba(26,10,40,0.85)'; c.strokeText(label, 0, 1);
    c.fillStyle = '#ffffff'; c.fillText(label, 0, 1);
    c.restore();
    text(c, '⚡', bx - u * 0.6, by + bh / 2, u * 0.85, '#fff', 400);
    // A short reminder of the controls at the start of a run
    if (state === 'play' && hintT < 5) {
      c.globalAlpha = clamp(5 - hintT, 0, 1);
      text(c, Kit.touchFirst() ? 'Tap left / right to change lane' : '◀ ▶ change lane   ·   OK boost', u * 0.7, H - u * 1.15, u * 0.55, 'rgba(255,255,255,0.9)', 700, 'left');
      c.globalAlpha = 1;
    }
  }

  function drawMenu(c, t) {
    c.fillStyle = 'rgba(14,6,30,0.35)'; c.fillRect(0, 0, W, H);
    const ts = Math.min(u * 2.6, W / 9);
    const k = ease.back(clamp(stateT / 0.6, 0, 1));
    c.save(); c.translate(W / 2, H * 0.15); c.scale(k, k); c.rotate(-0.03);
    outlined(c, 'HIGHWAY RUSH', 0, 0, ts, '#fff3b0', '#ff4f8b', 'center', true);
    c.restore();
    text(c, 'Dodge the traffic  ·  grab coins  ·  skim cars for bonus', W / 2, H * 0.15 + ts * 0.85, u * 0.6, 'rgba(255,255,255,0.92)', 700);
    // The start card
    const cw = Math.min(W * 0.9, u * 14), ch = u * 4.6, cx = W / 2 - cw / 2, cy = H * 0.4;
    glass(c, cx, cy, cw, ch, u * 0.8, 'rgba(255,179,71,0.65)');
    const pulse = 1 + Math.sin(t * 5) * 0.04;
    const bw = u * 8, bh = u * 1.5;
    c.save(); c.translate(W / 2, cy + u * 1.35); c.scale(pulse, pulse);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, '#ffcf5c'); g.addColorStop(1, '#ff4f8b');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.6)'; c.stroke();
    text(c, Kit.touchFirst() ? 'Tap to race' : 'OK  to race', 0, 2, u * 0.8, '#2a0e2e', 900);
    c.restore();
    text(c, best > 0 ? `👑 Best ${best}` : '👑 No record yet', W / 2, cy + u * 2.85, u * 0.7, '#ffd23f', 800);
    text(c, Kit.touchFirst() ? 'Tap left / right to change lane' : '◀ ▶ change lane  ·  OK boost when full  ·  Back for games', W / 2, cy + u * 3.8, u * 0.5, 'rgba(255,255,255,0.8)', 700);
  }

  function drawOver(c, t) {
    const a = clamp((stateT - crashT - 1.5) / 0.4, 0, 1);
    c.fillStyle = `rgba(14,6,30,${0.6 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.9, u * 14), ph = u * 10.4;
    roundRect(c, -pw / 2, -ph / 2, pw, ph, u * 0.8);
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    g.addColorStop(0, '#5a2373'); g.addColorStop(1, '#22103d');
    c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffb347'; c.stroke();
    outlined(c, 'CRASHED!', 0, -ph * 0.37, u * 1.5, '#ffffff', '#ff8a5c', 'center', true);
    outlined(c, String(Math.round(shown)), 0, -ph * 0.17, u * 2.1, '#fff6c2', '#ffb703');
    text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.0, u * 0.7, newBest ? '#ffd23f' : '#ffffff', 800);
    const km = ((pos * 3.2) / 3600).toFixed(2); // matches the km/h shown
    text(c, `🛣️ ${km} km    🪙 ${coinsGot}    ⚡ ${nears} close calls${smashes ? `    💥 ${smashes}` : ''}`, 0, ph * 0.13, u * 0.52, 'rgba(255,255,255,0.85)', 700);
    const ready = stateT - crashT > 2.2;
    c.globalAlpha = ready ? 1 : 0.4;
    const bw = u * 7.5, bh = u * 1.35;
    const p = ready ? 1 + Math.sin(t * 5) * 0.04 : 1;
    c.save(); c.translate(0, ph * 0.3); c.scale(p, p);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const bg = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    bg.addColorStop(0, '#ffcf5c'); bg.addColorStop(1, '#ff4f8b');
    c.fillStyle = bg; c.fill();
    text(c, Kit.touchFirst() ? 'Tap  play again' : 'OK  play again', 0, 2, u * 0.72, '#2a0e2e', 900);
    c.restore();
    text(c, 'Back for games', 0, ph * 0.43, u * 0.45, 'rgba(255,255,255,0.6)', 700);
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  resetRun(true);
  Kit.canvas.focus();
  if (best > 0) Kit.record('highwayrush', best);
})();
