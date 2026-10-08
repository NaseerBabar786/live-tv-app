// Merge Drop: drop little round space critters into the jar. Two of the same that touch merge into
// the next size, from a pebble all the way up to a sun. Keep the jar from overflowing: a piece that
// stays above the red line for two seconds ends the game.
// Remote: left / right move the dropper (hold to glide), OK or down drops. Up reaches the New game
// button. Touch and mouse: move to aim, tap or release to drop.
'use strict';

(() => {
  const { sfx, ease, shade, rgba, roundRect, clamp, lerp } = Kit;

  // ---------- The ladder: 11 sizes, our own characters ----------
  const PIECES = [
    { name: 'Pebble', r: 17, color: '#9aa3b8', pat: 'speck' },
    { name: 'Marble', r: 23, color: '#4fc3f7', pat: 'swirl' },
    { name: 'Gumball', r: 30, color: '#ff6b9d', pat: 'shine' },
    { name: 'Snowball', r: 38, color: '#e6f3ff', pat: 'snow' },
    { name: 'Ember', r: 46, color: '#ff7a45', pat: 'crater' },
    { name: 'Moon', r: 55, color: '#f3e3a3', pat: 'crater' },
    { name: 'Frost', r: 64, color: '#7fdcff', pat: 'bands' },
    { name: 'Ocean', r: 74, color: '#3f7bff', pat: 'land' },
    { name: 'Giant', r: 85, color: '#f0a35e', pat: 'bands' },
    { name: 'Ringo', r: 97, color: '#b98cff', pat: 'ring' },
    { name: 'Sun', r: 110, color: '#ffc928', pat: 'sun' },
  ];
  const POINTS = [1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 66];
  const MAXDROP = 4; // the dropper hands out the five smallest

  // ---------- World (fixed units; the screen scales it) ----------
  const JW = 440, JH = 560, LINE = 70, TOPSPACE = 124, RAIL = -106; // the dropper's rail sits above the jar
  const G = 1500, STEP = 1 / 120, ITER = 8, VMAX = 1300, MU_S = 0.35, MU_K = 0.2;

  let bodies = [], score = 0, shown = 0, best = Kit.store.get('mergedrop.best', 0), newBest = false;
  let cur = 0, next = 0, dropX = JW / 2, dropVel = 0, readyT = 0, over = false, overT = 0, dangerT = 0;
  let acc = 0, clock = 0, nextId = 1, bump = 0, saveT = 0, biggest = 0, introT = 0, mouseAim = false;
  let focus = 'drop', confirmT = -9, pops = [];

  function randPiece() {
    const w = [5, 4, 3.4, 2.4, 1.6];
    let x = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i <= MAXDROP; i++) { x -= w[i]; if (x <= 0) return i; }
    return 0;
  }
  function makeBody(lv, x, y) {
    return { id: nextId++, lv, x, y, px: x, py: y, vx: 0, vy: 0, r: PIECES[lv].r, a: Math.random() * 0.6 - 0.3, w: 0, grow: 1, born: clock, merged: false, blink: Math.random() * 4 };
  }
  function fresh() {
    bodies = []; score = 0; shown = 0; newBest = false; over = false; overT = 0; dangerT = 0; biggest = 0;
    cur = randPiece(); next = randPiece(); dropX = JW / 2; readyT = clock;
    save();
  }
  function save() {
    if (over) { Kit.store.set('mergedrop.game', null); return; }
    Kit.store.set('mergedrop.game', { score, cur, next, biggest, dropX,
      bodies: bodies.map((b) => [b.lv, Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10]) });
  }
  const saved = Kit.store.get('mergedrop.game', null);
  if (saved && saved.bodies) {
    score = saved.score; shown = score; cur = saved.cur; next = saved.next; biggest = saved.biggest || 0; dropX = saved.dropX || JW / 2;
    bodies = saved.bodies.map(([lv, x, y]) => makeBody(lv, x, y));
  } else fresh();

  // ---------- Physics: fixed time step, position-based contacts, a few solver passes ----------
  const contacts = [];
  function step(h) {
    for (const b of bodies) {
      if (b.grow < 1) { b.grow = Math.min(1, b.grow + h / 0.16); b.r = PIECES[b.lv].r * (0.55 + 0.45 * ease.out(b.grow)); }
      b.vy += G * h;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
      b.px = b.x; b.py = b.y;
      b.x += b.vx * h; b.y += b.vy * h;
      b.touch = false; b.floor = false;
    }
    const n = bodies.length;
    for (let it = 0; it < ITER; it++) {
      for (let i = 0; i < n; i++) {
        const A = bodies[i];
        for (let j = i + 1; j < n; j++) {
          const B = bodies[j];
          const dx = B.x - A.x, dy = B.y - A.y, rr = A.r + B.r;
          if (dx > rr || dx < -rr || dy > rr || dy < -rr) continue;
          const d2 = dx * dx + dy * dy;
          if (d2 >= rr * rr) continue;
          const d = Math.sqrt(d2) || 0.001, o = rr - d, nx = d2 > 1e-9 ? dx / d : 0, ny = d2 > 1e-9 ? dy / d : 1;
          // Heavier pieces move less.
          const ma = A.r * A.r, mb = B.r * B.r, wa = mb / (ma + mb), wb = ma / (ma + mb);
          A.x -= nx * o * wa; A.y -= ny * o * wa;
          B.x += nx * o * wb; B.y += ny * o * wb;
          A.touch = B.touch = true;
          if (it === 0) contacts.push(A, B, nx, ny, o);
        }
      }
      for (const b of bodies) {
        if (b.x < b.r) { b.x = b.r; b.touch = true; }
        if (b.x > JW - b.r) { b.x = JW - b.r; b.touch = true; }
        if (b.y > JH - b.r) { if (it === 0) b.depth = b.y - (JH - b.r); b.y = JH - b.r; b.touch = b.floor = true; }
      }
    }
    // Friction: at each contact, cancel the sideways slip of this step (all of it when small: resting
    // pieces stay put instead of creeping, part of it when sliding).
    for (let k = 0; k < contacts.length; k += 5) {
      const A = contacts[k], B = contacts[k + 1], nx = contacts[k + 2], ny = contacts[k + 3], o = contacts[k + 4];
      const rx = (B.x - B.px) - (A.x - A.px), ry = (B.y - B.py) - (A.y - A.py);
      const rn = rx * nx + ry * ny, tx = rx - rn * nx, ty = ry - rn * ny, lt = Math.hypot(tx, ty);
      if (lt < 1e-9) continue;
      const f = lt < MU_S * o ? 1 : Math.min(1, (MU_K * o) / lt);
      const ma = A.r * A.r, mb = B.r * B.r, wa = mb / (ma + mb), wb = ma / (ma + mb);
      A.x += tx * f * wa; A.y += ty * f * wa;
      B.x -= tx * f * wb; B.y -= ty * f * wb;
    }
    contacts.length = 0;
    for (const b of bodies) {
      if (!b.floor) continue;
      const dx = b.x - b.px, o = b.depth || 0;
      b.x -= Math.abs(dx) < MU_S * o ? dx : Math.sign(dx) * Math.min(Math.abs(dx), MU_K * o);
      b.depth = 0;
    }
    // New velocities from how far each piece really moved, then friction and rest.
    for (const b of bodies) {
      b.vx = (b.x - b.px) / h; b.vy = (b.y - b.py) / h;
      if (b.floor) b.vx *= 1 - Math.min(1, 6 * h);
      if (b.touch) {
        b.vx *= 1 - Math.min(1, 1.5 * h); b.vy *= 1 - Math.min(1, 0.5 * h);
        b.w = lerp(b.w, b.vx / b.r, 0.15);
        // Nearly still: settle fully, so a resting pile never shivers.
        if (b.vx * b.vx + b.vy * b.vy < 4) { b.vx = 0; b.vy = 0; }
      } else b.w *= 0.995;
      b.a += b.w * h;
    }
    merges();
  }
  function merges() {
    const n = bodies.length;
    let made = null;
    for (let i = 0; i < n; i++) {
      const A = bodies[i];
      if (A.merged) continue;
      for (let j = i + 1; j < n; j++) {
        const B = bodies[j];
        if (B.merged || B.lv !== A.lv) continue;
        const dx = B.x - A.x, dy = B.y - A.y, rr = A.r + B.r + 1.5;
        if (dx * dx + dy * dy > rr * rr) continue;
        A.merged = B.merged = true;
        (made || (made = [])).push([A, B]);
        break;
      }
    }
    if (!made) return;
    for (const [A, B] of made) {
      const lv = A.lv;
      const x = (A.x + B.x) / 2, y = (A.y + B.y) / 2;
      bodies = bodies.filter((b) => b !== A && b !== B);
      const pts = POINTS[Math.min(lv + 1, 10)] * 2;
      if (lv === PIECES.length - 1) {
        // Two suns: they burst into light, a big bonus and room to breathe.
        score += 500;
        popFx(x, y, PIECES[lv].color, PIECES[lv].r * 1.8, true);
        Kit.float('Supernova! +500', sx(x), sy(y), { color: '#ffd23f', size: S * 60, life: 1.8, big: true });
        sfx.win(); Kit.confetti(80); Kit.shake(14, 0.5);
      } else {
        const nb = makeBody(lv + 1, x, y);
        nb.vx = (A.vx + B.vx) / 2; nb.vy = Math.min(0, (A.vy + B.vy) / 2) - 60;
        nb.grow = 0; nb.r = PIECES[lv + 1].r * 0.55; nb.pop = clock;
        bodies.push(nb);
        score += pts;
        popFx(x, y, PIECES[lv].color, PIECES[lv + 1].r, lv + 1 >= 7);
        Kit.float(`+${pts}`, sx(x), sy(y) - PIECES[lv + 1].r * S, { color: '#fff6c2', size: Math.max(26, S * 34) });
        popSound(lv + 1);
        if (lv + 1 > biggest) {
          biggest = lv + 1;
          if (biggest >= 5) {
            Kit.float(`New: ${PIECES[biggest].name}!`, sx(JW / 2), sy(JH * 0.3), { color: PIECES[biggest].color, size: S * 52, life: 1.6, big: true });
            sfx.chime();
          }
        }
        if (lv + 1 >= 8) Kit.shake(6 + lv, 0.3);
      }
      bump = 1;
      if (score > best) {
        if (!newBest && best > 0) { newBest = true; Kit.float('New best!', L.left.cx, L.left.y + L.left.h * 0.62, { color: '#ffd23f', size: Math.max(26, S * 40), life: 1.6, big: true }); }
        best = score; Kit.store.set('mergedrop.best', best); Kit.record('mergedrop', best);
      }
    }
  }
  function popFx(x, y, color, r, big) {
    pops.push({ x, y, r, t0: clock, color });
    Kit.burst(sx(x), sy(y), color, big ? 22 : 10, big ? 1.2 : 0.7);
  }
  function popSound(lv) {
    const f = 900 - lv * 60;
    Kit.tone(f, { type: 'sine', dur: 0.12, vol: 0.22, slide: 1.8 });
    Kit.tone(f * 1.5, { type: 'triangle', dur: 0.18, vol: 0.08, at: 0.04 });
    Kit.noise({ dur: 0.08, vol: 0.1, freq: 2400 - lv * 120, q: 1.2 });
    if (lv >= 6) Kit.tone(110 + lv * 6, { type: 'sine', dur: 0.35, vol: 0.25, slide: 0.6 });
  }

  // ---------- Dropping ----------
  const ready = () => !over && clock - readyT > 0.45;
  function drop() {
    if (!ready()) return;
    const r = PIECES[cur].r;
    const b = makeBody(cur, clamp(dropX, r, JW - r), RAIL + 16 + r);
    b.vy = 120;
    bodies.push(b);
    cur = next; next = randPiece(); readyT = clock;
    Kit.tone(520, { type: 'triangle', dur: 0.08, vol: 0.12, slide: 0.7 });
    save();
  }

  // ---------- Layout ----------
  let L = {}, S = 1;
  const sx = (x) => L.jx + x * S, sy = (y) => L.jy + y * S;
  function layout(W, H) {
    const wide = W / H > 1.1;
    const worldH = JH + TOPSPACE;
    S = Math.min((H * (wide ? 0.83 : 0.66)) / worldH, (W * (wide ? 0.42 : 0.9)) / JW);
    const jw = JW * S, jh = JH * S;
    L = { wide, jx: (W - jw) / 2, jy: wide ? H * 0.055 + TOPSPACE * S : H * 0.24 + TOPSPACE * S, jw, jh };
    if (wide) {
      const pw = Math.min(L.jx - W * 0.06, 300);
      L.left = { x: L.jx - W * 0.03 - pw, y: L.jy - TOPSPACE * S * 0.4, w: pw, h: H * 0.3 };
      L.right = { x: L.jx + jw + W * 0.03, y: L.left.y, w: pw, h: H * 0.24 };
    } else {
      const pw = W * 0.44;
      L.left = { x: W * 0.04, y: H * 0.02, w: pw, h: H * 0.13 };
      L.right = { x: W * 0.52, y: H * 0.02, w: pw, h: H * 0.13 };
    }
    L.left.cx = L.left.x + L.left.w / 2;
    const bh = Math.max(44, Math.min(H * 0.075, 58));
    L.btn = wide ? { x: L.left.x, y: L.jy + jh - bh, w: L.left.w, h: bh } : { x: W / 2 - 110, y: L.jy + jh + 16, w: 220, h: bh };
    L.font = Math.max(18, Math.min(H * 0.032, 32));
    sprites.clear();
  }
  Kit.onResize(layout);

  // ---------- Drawing the characters (each drawn once per size, then copied) ----------
  const sprites = new Map();
  function face(c, R, lv, sleepy) {
    const ink = lv === 3 || lv === 5 || lv === 10 ? '#4a2a10' : '#1d1030';
    const ey = -R * 0.08, ex = R * 0.32, er = R * 0.13;
    for (const s of [-1, 1]) {
      if (sleepy) {
        c.strokeStyle = ink; c.lineWidth = Math.max(1.5, R * 0.07); c.lineCap = 'round';
        c.beginPath(); c.arc(s * ex, ey, er, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      } else {
        c.fillStyle = ink; c.beginPath(); c.ellipse(s * ex, ey, er * 0.85, er * 1.1, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff'; c.beginPath(); c.arc(s * ex - er * 0.3, ey - er * 0.4, er * 0.38, 0, Math.PI * 2); c.fill();
      }
      c.fillStyle = 'rgba(255,90,120,0.45)';
      c.beginPath(); c.ellipse(s * R * 0.52, R * 0.18, R * 0.14, R * 0.08, 0, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = ink; c.lineWidth = Math.max(1.5, R * 0.07); c.lineCap = 'round';
    c.beginPath(); c.arc(0, R * 0.12, R * 0.16, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
  }
  function pattern(c, p, R, lv) {
    const col = p.color;
    const dots = (list, color) => { c.fillStyle = color; list.forEach(([x, y, r]) => { c.beginPath(); c.arc(x * R, y * R, r * R, 0, Math.PI * 2); c.fill(); }); };
    if (p.pat === 'speck') dots([[-0.5, -0.45, 0.1], [0.55, -0.3, 0.07], [0.4, 0.6, 0.09], [-0.6, 0.45, 0.06]], shade(col, -0.3));
    else if (p.pat === 'swirl') {
      c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = R * 0.16;
      c.beginPath(); c.arc(-R * 0.2, R * 0.1, R * 0.75, -0.2, 1.6); c.stroke();
      c.strokeStyle = rgba('#1a6fd1', 0.4); c.beginPath(); c.arc(R * 0.3, -R * 0.2, R * 0.8, 2.6, 4.2); c.stroke();
    } else if (p.pat === 'shine') dots([[-0.55, 0.5, 0.08], [0.6, 0.45, 0.06], [0.1, 0.72, 0.07]], 'rgba(255,255,255,0.5)');
    else if (p.pat === 'snow') dots([[-0.6, -0.4, 0.08], [0.5, -0.55, 0.06], [0.65, 0.35, 0.07], [-0.4, 0.62, 0.06], [0.1, -0.75, 0.05]], '#b9dcff');
    else if (p.pat === 'crater') dots([[-0.55, -0.45, 0.16], [0.5, -0.5, 0.1], [0.55, 0.5, 0.14], [-0.45, 0.6, 0.09], [0.05, 0.75, 0.06]], shade(col, -0.18));
    else if (p.pat === 'bands') {
      c.fillStyle = shade(col, lv === 8 ? -0.18 : 0.25);
      [-0.62, -0.3, 0.55].forEach((y, i) => c.fillRect(-R, y * R, R * 2, R * (i === 1 ? 0.1 : 0.14)));
      if (lv === 8) { c.fillStyle = shade(col, -0.35); c.beginPath(); c.ellipse(R * 0.45, R * 0.72, R * 0.2, R * 0.1, 0, 0, Math.PI * 2); c.fill(); }
    } else if (p.pat === 'land') {
      c.fillStyle = '#3ccf7a';
      c.beginPath(); c.ellipse(-R * 0.55, -R * 0.5, R * 0.35, R * 0.22, 0.4, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(R * 0.6, R * 0.55, R * 0.3, R * 0.2, -0.3, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(-R * 0.35, R * 0.7, R * 0.2, R * 0.12, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(R * 0.3, -R * 0.78, R * 0.3, R * 0.08, 0, 0, Math.PI * 2); c.fill();
    } else if (p.pat === 'ring') {
      c.strokeStyle = 'rgba(255,240,200,0.75)'; c.lineWidth = R * 0.12;
      c.beginPath(); c.ellipse(0, R * 0.42, R * 1.1, R * 0.2, -0.12, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = rgba('#5b2bb0', 0.45); c.lineWidth = R * 0.05;
      c.beginPath(); c.ellipse(0, R * 0.42, R * 1.1, R * 0.28, -0.12, 0, Math.PI * 2); c.stroke();
    } else if (p.pat === 'sun') {
      const g = c.createRadialGradient(0, 0, R * 0.2, 0, 0, R);
      g.addColorStop(0, 'rgba(255,255,220,0.6)'); g.addColorStop(1, 'rgba(255,140,0,0.25)');
      c.fillStyle = g; c.fillRect(-R, -R, R * 2, R * 2);
    }
  }
  function sprite(lv, pr, sleepy) {
    const key = lv + '|' + Math.round(pr) + (sleepy ? 's' : '');
    let sp = sprites.get(key);
    if (sp) return sp;
    const p = PIECES[lv], dpr = Math.min(window.devicePixelRatio || 1, 2);
    const pad = p.pat === 'sun' ? 1.28 : 1.04, size = Math.ceil(pr * 2 * pad);
    sp = document.createElement('canvas');
    sp.width = sp.height = Math.ceil(size * dpr);
    const c = sp.getContext('2d');
    c.scale(dpr, dpr); c.translate(size / 2, size / 2);
    const R = pr;
    if (p.pat === 'sun') {
      // Soft rays round the sun.
      c.fillStyle = 'rgba(255,200,40,0.55)';
      for (let i = 0; i < 12; i++) {
        c.save(); c.rotate(i * Math.PI / 6);
        c.beginPath(); c.moveTo(-R * 0.16, -R * 0.9); c.lineTo(0, -R * 1.26); c.lineTo(R * 0.16, -R * 0.9); c.closePath(); c.fill();
        c.restore();
      }
    }
    const g = c.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, shade(p.color, 0.45)); g.addColorStop(0.55, p.color); g.addColorStop(1, shade(p.color, -0.3));
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
    pattern(c, p, R, lv);
    // Rim shade and a glossy shine
    const rim = c.createRadialGradient(0, 0, R * 0.7, 0, 0, R);
    rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(1, 'rgba(20,0,40,0.28)');
    c.fillStyle = rim; c.fillRect(-R, -R, R * 2, R * 2);
    c.restore();
    face(c, R, lv, sleepy);
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.ellipse(-R * 0.4, -R * 0.55, R * 0.28, R * 0.14, -0.6, 0, Math.PI * 2); c.fill();
    c.lineWidth = Math.max(1.5, R * 0.05); c.strokeStyle = shade(p.color, -0.45);
    c.beginPath(); c.arc(0, 0, R - c.lineWidth / 2, 0, Math.PI * 2); c.stroke();
    sp.drawSize = size;
    sprites.set(key, sp);
    return sp;
  }
  function drawPiece(c, lv, x, y, pr, rot = 0, scale = 1, sleepy = false, alpha = 1) {
    const sp = sprite(lv, pr, sleepy), d = sp.drawSize * scale;
    c.globalAlpha = alpha;
    if (rot) { c.save(); c.translate(x, y); c.rotate(rot); c.drawImage(sp, -d / 2, -d / 2, d, d); c.restore(); }
    else c.drawImage(sp, x - d / 2, y - d / 2, d, d);
    c.globalAlpha = 1;
  }

  // ---------- Keys: own key tracking for smooth gliding while an arrow is held ----------
  const down = { left: false, right: false };
  const SIDE = { ArrowLeft: 'left', Left: 'left', a: 'left', A: 'left', ArrowRight: 'right', Right: 'right', d: 'right', D: 'right' };
  window.addEventListener('keydown', (e) => { const k = SIDE[e.key] || (e.keyCode === 37 ? 'left' : e.keyCode === 39 ? 'right' : null); if (k) down[k] = true; });
  window.addEventListener('keyup', (e) => { const k = SIDE[e.key] || (e.keyCode === 37 ? 'left' : e.keyCode === 39 ? 'right' : null); if (k) down[k] = false; });
  window.addEventListener('blur', () => { down.left = down.right = false; });

  function restartPress() {
    if (clock - confirmT < 2.5) { fresh(); focus = 'drop'; confirmT = -9; sfx.pick(); }
    else { confirmT = clock; sfx.move(); }
  }
  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (over) { if (k === 'ok' && clock - overT > 1.4) { fresh(); sfx.pick(); } return; }
    if (k === 'restart') { restartPress(); return; }
    mouseAim = false;
    if (focus === 'btn') {
      if (k === 'ok') restartPress();
      else if (k === 'down' || k === 'right' || (L.wide && k === 'right')) { focus = 'drop'; sfx.move(); }
      return;
    }
    if (k === 'up') { focus = 'btn'; sfx.move(); return; }
    if ((k === 'ok' || k === 'down') && !repeat) drop();
    if ((k === 'left' || k === 'right') && !repeat) {
      // A quick tap nudges; holding glides (see update).
      dropX += (k === 'left' ? -1 : 1) * 10;
    }
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  const inBox = (e, b) => e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  let pointerDown = false;
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (over) { if (clock - overT > 1.4) fresh(); return; }
      if (inBox(e, L.btn)) { focus = 'btn'; restartPress(); return; }
      focus = 'drop'; mouseAim = true; pointerDown = true;
      dropX = (e.x - L.jx) / S;
      if (!e.touch) drop();
    },
    move(e) { if (!over && (pointerDown || !e.touch)) { mouseAim = true; dropX = (e.x - L.jx) / S; } },
    up(e, cancel) { if (pointerDown && e.touch && !cancel) drop(); pointerDown = false; },
  });

  // ---------- Update ----------
  function update(dt) {
    clock += dt; introT += dt;
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    // The dropper glides while an arrow is held, speeding up a little.
    const dir = (down.right ? 1 : 0) - (down.left ? 1 : 0);
    if (dir && !over && focus === 'drop') { dropVel = clamp(dropVel + dir * 2200 * dt, -460, 460); if (Math.sign(dropVel) !== dir) dropVel = dir * 120; }
    else dropVel = 0;
    dropX += dropVel * dt;
    const r = PIECES[cur].r;
    dropX = clamp(dropX, r, JW - r);
    if (!over) {
      acc = Math.min(acc + dt, 0.1);
      while (acc >= STEP) { step(STEP); acc -= STEP; }
      // Danger: a settled piece poking above the red line, for two seconds, ends it.
      let above = false;
      for (const b of bodies) if (clock - b.born > 1.2 && b.y - b.r < LINE && Math.abs(b.vy) < 120) above = true;
      dangerT = above ? dangerT + dt : Math.max(0, dangerT - dt * 2);
      if (dangerT >= 2) {
        over = true; overT = clock; Kit.store.set('mergedrop.game', null); Kit.record('mergedrop', best);
        setTimeout(() => sfx.over(), 200); Kit.shake(8, 0.4);
      }
      saveT += dt;
      if (saveT > 2) { saveT = 0; save(); }
    }
    for (let i = pops.length - 1; i >= 0; i--) if (clock - pops[i].t0 > 0.45) pops.splice(i, 1);
  }

  // ---------- Drawing ----------
  function text(c, s, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.fillStyle = color; c.fillText(s, x, y);
  }
  function card(c, b) {
    roundRect(c, b.x, b.y, b.w, b.h, 22);
    c.fillStyle = 'rgba(8,14,40,0.6)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(150,190,255,0.28)'; c.stroke();
  }
  function drawJar(c, t) {
    const { jx, jy, jw, jh } = L, lip = 10 * S;
    // Glass back
    roundRect(c, jx - lip, jy - 30 * S, jw + lip * 2, jh + 30 * S + lip, 26 * S);
    const g = c.createLinearGradient(jx, 0, jx + jw, 0);
    g.addColorStop(0, 'rgba(160,210,255,0.16)'); g.addColorStop(0.5, 'rgba(160,210,255,0.06)'); g.addColorStop(1, 'rgba(160,210,255,0.14)');
    c.fillStyle = g; c.fill();
    // The red line
    const ly = sy(LINE), warn = dangerT > 0;
    c.save();
    c.setLineDash([14 * S, 10 * S]); c.lineWidth = Math.max(2, 4 * S);
    c.strokeStyle = warn ? `rgba(255,60,80,${0.6 + 0.4 * Math.sin(t * 18)})` : 'rgba(255,80,100,0.55)';
    c.beginPath(); c.moveTo(jx, ly); c.lineTo(jx + jw, ly); c.stroke();
    c.restore();
  }
  function drawJarFront(c) {
    const { jx, jy, jw, jh } = L, lip = 10 * S;
    roundRect(c, jx - lip, jy - 30 * S, jw + lip * 2, jh + 30 * S + lip, 26 * S);
    c.lineWidth = Math.max(3, 6 * S); c.strokeStyle = 'rgba(210,235,255,0.75)'; c.stroke();
    // Glass shine
    c.fillStyle = 'rgba(255,255,255,0.10)';
    roundRect(c, jx + 8 * S, jy + 10 * S, 16 * S, jh * 0.7, 8 * S); c.fill();
    // Rim
    roundRect(c, jx - lip * 2, jy - 36 * S, jw + lip * 4, 14 * S, 7 * S);
    c.fillStyle = 'rgba(220,240,255,0.85)'; c.fill();
  }
  function drawDropper(c, t) {
    const r = PIECES[cur].r, x = sx(dropX), topY = sy(RAIL);
    const py = sy(RAIL + 16 + r);
    // Aim line to the floor
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.28)'; c.lineWidth = Math.max(2, 3 * S); c.setLineDash([6 * S, 10 * S]);
    c.beginPath(); c.moveTo(x, py + r * S); c.lineTo(x, L.jy + L.jh); c.stroke();
    c.restore();
    // The claw: a little cloud on a rail
    c.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(c, L.jx - 10 * S, topY - 3 * S, L.jw + 20 * S, 6 * S, 3 * S); c.fill();
    const focusOn = focus === 'drop' && !Kit.touchFirst();
    c.fillStyle = focusOn ? '#ffd23f' : '#cfe3ff';
    c.save(); c.translate(x, topY);
    if (focusOn) { c.shadowColor = '#ffd23f'; c.shadowBlur = 16; }
    c.beginPath(); c.arc(-14 * S, 0, 12 * S, 0, Math.PI * 2); c.arc(0, -4 * S, 15 * S, 0, Math.PI * 2); c.arc(14 * S, 0, 12 * S, 0, Math.PI * 2); c.fill();
    c.restore();
    const k = clamp((clock - readyT) / 0.45, 0, 1);
    if (!over && k > 0) {
      const sc = ease.back(k);
      drawPiece(c, cur, x, py + Math.sin(t * 3) * 2 * S, r * S, Math.sin(t * 2) * 0.08, sc);
      if (focusOn && k >= 1) {
        c.save(); c.lineWidth = 3 + Math.sin(t * 7); c.strokeStyle = 'rgba(255,210,63,0.9)'; c.shadowColor = '#ffd23f'; c.shadowBlur = 12;
        c.beginPath(); c.arc(x, py, r * S + 6, 0, Math.PI * 2); c.stroke(); c.restore();
      }
    }
  }
  function drawPanels(c, t) {
    const F = L.font, lp = L.left, rp = L.right;
    c.textBaseline = 'middle';
    card(c, lp);
    text(c, 'Score', lp.cx, lp.y + lp.h * 0.15, F * 0.85, 'rgba(255,255,255,0.65)', 700);
    c.save(); c.translate(lp.cx, lp.y + lp.h * 0.42); const s = 1 + bump * 0.12; c.scale(s, s);
    c.font = `900 ${Math.round(F * 2.1)}px system-ui, sans-serif`; c.textAlign = 'center';
    c.lineJoin = 'round'; c.lineWidth = F * 0.22; c.strokeStyle = 'rgba(5,10,40,0.9)'; c.strokeText(Math.round(shown), 0, 0);
    const sg = c.createLinearGradient(0, -F, 0, F); sg.addColorStop(0, '#fff6c2'); sg.addColorStop(1, '#ffb703');
    c.fillStyle = sg; c.fillText(Math.round(shown), 0, 0);
    c.restore();
    text(c, `👑 Best ${best}`, lp.cx, lp.y + lp.h * 0.78, F * 0.9, 'rgba(255,255,255,0.8)', 800);

    card(c, rp);
    const rcx = rp.x + rp.w / 2;
    text(c, 'Next', rcx, rp.y + rp.h * 0.16, F * 0.85, 'rgba(255,255,255,0.65)', 700);
    const nr = Math.min(PIECES[next].r * S, rp.h * 0.3);
    drawPiece(c, next, rcx, rp.y + rp.h * 0.58, nr, 0, 1);

    if (L.wide) {
      // The ladder: every size in a ring, the biggest reached so far lit up.
      const room = L.jy + L.jh - rp.y - rp.h, rad = Math.min(rp.w * 0.36, room * 0.34), cy = rp.y + rp.h + room / 2 + F * 0.5;
      text(c, 'Grow them all', rcx, cy - rad - F * 1.5, F * 0.8, 'rgba(255,255,255,0.6)', 700);
      for (let i = 0; i < PIECES.length; i++) {
        const a = -Math.PI / 2 + (i / PIECES.length) * Math.PI * 2;
        const x = rcx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
        const pr = rad * (0.12 + i * 0.012);
        drawPiece(c, i, x, y, pr, 0, 1, i > biggest, i > Math.max(biggest, MAXDROP) ? 0.35 : 1);
      }
      drawPiece(c, Math.max(biggest, 0), rcx, cy, rad * 0.4, Math.sin(t) * 0.1, 1 + Math.sin(t * 3) * 0.03);
      text(c, PIECES[biggest].name, rcx, cy + rad * 0.62, F * 0.7, '#fff', 800);
      // How to play
      const tips = Kit.touchFirst() ? ['Move to aim', 'Release to drop'] : ['◀ ▶  move (hold to glide)', 'OK or ▼  drop', 'Back  games menu'];
      tips.forEach((s2, i) => text(c, s2, lp.cx, lp.y + lp.h + F * 1.6 + i * F * 1.35, F * 0.78, 'rgba(255,255,255,0.7)', 700));
    }
    // New game button
    const b = L.btn, on = focus === 'btn' && !over;
    roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
    const bg = c.createLinearGradient(0, b.y, 0, b.y + b.h);
    bg.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); bg.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
    c.fillStyle = bg; c.fill(); c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
    const sure = clock - confirmT < 2.5;
    text(c, sure ? 'OK again to restart' : '⟳ New game', b.x + b.w / 2, b.y + b.h / 2 + 1, Math.min(b.h * 0.4, b.w * (sure ? 0.075 : 0.11)), on ? '#2b1600' : '#fff', 800);
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#16306e', '#060b24', 'rgba(110,160,255,0.09)');
    drawJar(c, t);
    if (!over) drawDropper(c, t);
    // Pieces
    for (const b of bodies) {
      let sc = 1;
      if (b.pop != null && clock - b.pop < 0.35) sc = 1 + Math.sin(((clock - b.pop) / 0.35) * Math.PI) * 0.12;
      const sleepy = Math.abs(b.vx) + Math.abs(b.vy) < 20 && ((clock + b.blink) % 4) < 0.15;
      const danger = dangerT > 0 && b.y - b.r < LINE && clock - b.born > 1.2;
      drawPiece(c, b.lv, sx(b.x), sy(b.y), PIECES[b.lv].r * S, b.a, sc * (b.r / PIECES[b.lv].r), sleepy || over);
      if (danger) {
        c.save(); c.globalAlpha = 0.35 + 0.3 * Math.sin(t * 18); c.fillStyle = '#ff3050';
        c.beginPath(); c.arc(sx(b.x), sy(b.y), b.r * S, 0, Math.PI * 2); c.fill(); c.restore();
      }
    }
    // Merge pops: a bright ring
    for (const p of pops) {
      const q = (clock - p.t0) / 0.45;
      c.globalAlpha = 1 - q; c.strokeStyle = '#fff'; c.lineWidth = (1 - q) * 10 * S + 1;
      c.beginPath(); c.arc(sx(p.x), sy(p.y), p.r * S * (0.8 + q * 0.6), 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }
    drawJarFront(c);
    if (dangerT > 0 && !over) {
      text(c, `⚠ ${Math.max(0, 2 - dangerT).toFixed(1)}`, L.jx + L.jw / 2, sy(LINE) - 22 * S, Math.max(22, L.font), '#ff6b81', 900);
    }
    drawPanels(c, t);
    c.textBaseline = 'middle';
    if (L.wide) text(c, 'Arrows move · OK drops · Match two to merge · Back exits', W / 2, H - Math.max(16, H * 0.028), Math.max(18, Math.min(H * 0.03, 28)), 'rgba(255,255,255,0.6)', 700);
    const m = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    if (introT < 5 && score === 0 && bodies.length < 2 && !over) {
      c.globalAlpha = Math.min(1, introT * 2, (5 - introT) * 2);
      text(c, 'Two of a kind merge into a bigger one!', L.jx + L.jw / 2, L.jy + L.jh * 0.45, Math.max(20, L.font * 0.9), '#fff', 800);
      c.globalAlpha = 1;
    }
    if (over && clock - overT > 0.8) {
      const a = clamp((clock - overT - 0.8) / 0.4, 0, 1);
      c.fillStyle = `rgba(3,6,24,${0.65 * a})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw = Math.min(W * 0.84, 540), ph = Math.min(H * 0.56, 340);
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 30);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2); g.addColorStop(0, '#2f5bd6'); g.addColorStop(1, '#152a70');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      text(c, 'The jar is full!', 0, -ph * 0.3, ph * 0.12, '#fff', 900);
      text(c, score, 0, -ph * 0.06, ph * 0.2, '#ffd23f', 900);
      text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.13, ph * 0.08, 'rgba(255,255,255,0.88)', 800);
      text(c, `Biggest: ${PIECES[biggest].name}`, 0, ph * 0.25, ph * 0.07, 'rgba(255,255,255,0.7)', 700);
      text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK = play again', 0, ph * 0.38, ph * 0.08, '#9ff0ff', 800);
      c.restore();
    }
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (best > 0) Kit.record('mergedrop', best);
})();
