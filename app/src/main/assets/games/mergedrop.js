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
      b.vy += G * h; b.pv = b.vy;
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
      if (b.pv - b.vy > 300 && clock - (b.imp || -9) > 0.3) { b.imp = clock; b.impA = Math.min(1, (b.pv - b.vy) / 900); }
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
        if (!newBest && best > 0) { newBest = true; Kit.float('New best!', L.left.cx, L.left.y + L.left.h + L.font * 0.9, { color: '#ffd23f', size: Math.max(26, S * 40), life: 1.6, big: true }); }
        best = score; Kit.store.set('mergedrop.best', best); Kit.record('mergedrop', best);
      }
    }
  }
  function popFx(x, y, color, r, big) {
    pops.push({ x, y, r, t0: clock, color });
    Kit.burst(sx(x), sy(y), color, big ? 12 : 5, big ? 1.2 : 0.7);
    spark(sx(x), sy(y), color, big ? 18 : 8, big ? 1.3 : 0.8);
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
    sprites.clear(); scene = null; jarBack = null; ufo = null;
  }
  Kit.onResize(layout);

  // ---------- Drawing the characters (each drawn once per size, then copied) ----------
  const sprites = new Map();
  function face(c, R, lv, sleepy) {
    const ink = lv === 3 || lv === 5 || lv === 10 ? '#4a2a10' : '#1d1030';
    const ey = -R * 0.06, ex = R * 0.33, er = R * 0.15;
    for (const s of [-1, 1]) {
      if (sleepy) {
        c.strokeStyle = ink; c.lineWidth = Math.max(1.5, R * 0.07); c.lineCap = 'round';
        c.beginPath(); c.arc(s * ex, ey, er, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      } else {
        // Big glossy eyes: dark iris, a coloured glint at the bottom, two white highlights.
        c.fillStyle = ink; c.beginPath(); c.ellipse(s * ex, ey, er * 0.88, er * 1.12, 0, 0, Math.PI * 2); c.fill();
        const ig = c.createLinearGradient(0, ey, 0, ey + er * 1.1);
        ig.addColorStop(0, 'rgba(120,160,255,0)'); ig.addColorStop(1, 'rgba(150,190,255,0.75)');
        c.fillStyle = ig; c.beginPath(); c.ellipse(s * ex, ey, er * 0.88, er * 1.12, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(s * ex - er * 0.3, ey - er * 0.42, er * 0.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(s * ex + er * 0.32, ey + er * 0.42, er * 0.16, 0, Math.PI * 2); c.fill();
      }
      const ch = c.createRadialGradient(s * R * 0.55, R * 0.2, 0, s * R * 0.55, R * 0.2, R * 0.18);
      ch.addColorStop(0, 'rgba(255,90,130,0.6)'); ch.addColorStop(1, 'rgba(255,90,130,0)');
      c.fillStyle = ch; c.fillRect(s * R * 0.55 - R * 0.2, R * 0.02, R * 0.4, R * 0.36);
    }
    c.strokeStyle = ink; c.lineWidth = Math.max(1.5, R * 0.07); c.lineCap = 'round';
    c.beginPath(); c.arc(0, R * 0.13, R * 0.15, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
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
    const pad = p.pat === 'sun' ? 1.32 : 1.1, size = Math.ceil(pr * 2 * pad);
    sp = document.createElement('canvas');
    sp.width = sp.height = Math.ceil(size * dpr);
    const c = sp.getContext('2d');
    c.scale(dpr, dpr); c.translate(size / 2, size / 2);
    const R = pr, col = p.color;
    if (p.pat === 'sun') {
      // Corona and soft rays
      const cg = c.createRadialGradient(0, 0, R * 0.8, 0, 0, R * 1.32);
      cg.addColorStop(0, 'rgba(255,210,60,0.75)'); cg.addColorStop(1, 'rgba(255,140,0,0)');
      c.fillStyle = cg; c.beginPath(); c.arc(0, 0, R * 1.32, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,220,90,0.7)';
      for (let i = 0; i < 12; i++) {
        c.save(); c.rotate(i * Math.PI / 6);
        c.beginPath(); c.moveTo(-R * 0.16, -R * 0.92); c.quadraticCurveTo(0, -R * 1.34, R * 0.16, -R * 0.92); c.closePath(); c.fill();
        c.restore();
      }
    } else {
      // Soft shadow under the ball
      const sg = c.createRadialGradient(0, R * 0.12, R * 0.85, 0, R * 0.12, R * 1.1);
      sg.addColorStop(0, 'rgba(0,0,20,0.45)'); sg.addColorStop(1, 'rgba(0,0,20,0)');
      c.fillStyle = sg; c.beginPath(); c.arc(0, R * 0.12, R * 1.1, 0, Math.PI * 2); c.fill();
    }
    // Body: lit from the top left, darker toward the bottom right
    const g = c.createRadialGradient(-R * 0.38, -R * 0.42, R * 0.05, -R * 0.1, -R * 0.1, R * 1.25);
    g.addColorStop(0, shade(col, 0.55)); g.addColorStop(0.45, col); g.addColorStop(0.85, shade(col, -0.35)); g.addColorStop(1, shade(col, -0.55));
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fillStyle = g; c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.clip();
    pattern(c, p, R, lv);
    // Bounce light from below-right (a tinted rim), and shade in the lower half
    const rim = c.createRadialGradient(R * 0.55, R * 0.7, R * 0.55, R * 0.2, R * 0.25, R * 1.2);
    rim.addColorStop(0, 'rgba(0,0,0,0)'); rim.addColorStop(0.75, rgba('#000020', 0.18)); rim.addColorStop(1, rgba('#000020', 0.42));
    c.fillStyle = rim; c.fillRect(-R, -R, R * 2, R * 2);
    c.globalCompositeOperation = 'lighter';
    const bounce = c.createRadialGradient(R * 0.5, R * 0.75, 0, R * 0.5, R * 0.75, R * 0.7);
    bounce.addColorStop(0, rgba(col, 0)); bounce.addColorStop(0.6, rgba(col, 0.28)); bounce.addColorStop(1, rgba(col, 0));
    c.fillStyle = bounce; c.fillRect(-R, -R, R * 2, R * 2);
    c.globalCompositeOperation = 'source-over';
    c.restore();
    face(c, R, lv, sleepy);
    // Gloss: a big soft highlight and a sharp little one
    const hg = c.createLinearGradient(0, -R * 0.95, 0, -R * 0.2);
    hg.addColorStop(0, 'rgba(255,255,255,0.75)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hg; c.beginPath(); c.ellipse(-R * 0.22, -R * 0.55, R * 0.58, R * 0.34, -0.35, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.95)';
    c.beginPath(); c.ellipse(-R * 0.5, -R * 0.52, R * 0.12, R * 0.07, -0.7, 0, Math.PI * 2); c.fill();
    // Thin dark outline and a bright rim on the lit side
    c.lineWidth = Math.max(1.2, R * 0.04); c.strokeStyle = shade(col, -0.6);
    c.beginPath(); c.arc(0, 0, R - c.lineWidth / 2, 0, Math.PI * 2); c.stroke();
    c.lineWidth = Math.max(1, R * 0.035); c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.beginPath(); c.arc(0, 0, R * 0.93, Math.PI * 1.05, Math.PI * 1.55); c.stroke();
    sp.drawSize = size;
    sprites.set(key, sp);
    return sp;
  }
  function drawPiece(c, lv, x, y, pr, rot = 0, scale = 1, sleepy = false, alpha = 1, sxk = 1, syk = 1) {
    const sp = sprite(lv, pr, sleepy), d = sp.drawSize * scale;
    c.globalAlpha = alpha;
    if (rot || sxk !== 1) { c.save(); c.translate(x, y); if (sxk !== 1) c.scale(sxk, syk); c.rotate(rot); c.drawImage(sp, -d / 2, -d / 2, d, d); c.restore(); }
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
    stepSparks(dt);
  }

  // ---------- Drawing ----------
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  function bake(w, h, fn, scale) {
    const d = scale || dprNow(), cv = document.createElement('canvas');
    cv.width = Math.max(1, Math.ceil(w * d)); cv.height = Math.max(1, Math.ceil(h * d));
    const c = cv.getContext('2d'); c.scale(d, d); fn(c);
    cv.w = w; cv.h = h;
    return cv;
  }
  function text(c, s, x, y, size, color, weight = 600, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(s, x, y);
  }
  const glows = new Map();
  function glowSprite(color) {
    let g = glows.get(color);
    if (g) return g;
    g = bake(64, 64, (c) => {
      const rg = c.createRadialGradient(32, 32, 0, 32, 32, 32);
      rg.addColorStop(0, color); rg.addColorStop(0.35, rgba(color, 0.5)); rg.addColorStop(1, rgba(color, 0));
      c.fillStyle = rg; c.fillRect(0, 0, 64, 64);
    }, 1);
    glows.set(color, g);
    return g;
  }
  const stars4 = new Map();
  function starSprite(color) {
    let g = stars4.get(color);
    if (g) return g;
    g = bake(48, 48, (c) => {
      const rg = c.createRadialGradient(24, 24, 0, 24, 24, 24);
      rg.addColorStop(0, rgba(color, 0.9)); rg.addColorStop(1, rgba(color, 0));
      c.fillStyle = rg; c.fillRect(0, 0, 48, 48);
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(24, 2); c.quadraticCurveTo(24, 24, 44, 24); c.quadraticCurveTo(24, 24, 24, 46);
      c.quadraticCurveTo(24, 24, 4, 24); c.quadraticCurveTo(24, 24, 24, 2); c.fill();
    }, 1);
    stars4.set(color, g);
    return g;
  }
  const sparks = [];
  function spark(x, y, color, n, speed = 1) {
    for (let i = 0; i < n && sparks.length < 140; i++) {
      const a = Math.random() * Math.PI * 2, v = (80 + Math.random() * 260) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 80, life: 0, max: 0.45 + Math.random() * 0.45, size: 10 + Math.random() * 18, color, rot: Math.random() * 3 });
    }
  }
  function stepSparks(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt;
      if (p.life > p.max) { sparks.splice(i, 1); continue; }
      p.vy += 400 * dt; p.vx *= 1 - dt * 2; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4;
    }
  }
  function drawSparks(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of sparks) {
      const k = p.life / p.max, s = p.size * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8);
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
      c.drawImage(starSprite(p.color), -s, -s, s * 2, s * 2);
      c.restore();
    }
    c.restore();
  }

  // Deep space behind the jar: painted once per screen size.
  let scene = null, jarBack = null, jarFront = null, ufo = null;
  const twinkles = Array.from({ length: 34 }, () => ({ x: Math.random(), y: Math.random(), s: 0.5 + Math.random(), p: Math.random() * 6, f: 1 + Math.random() * 2 }));
  let shoot = null;
  function panelBox(c, b) {
    roundRect(c, b.x, b.y, b.w, b.h, 24); c.fillStyle = 'rgba(8,12,40,0.62)'; c.fill();
    Kit.glass(c, b.x, b.y, b.w, b.h, 24, { tint: 'rgba(80,120,255,0.12)', edge: 'rgba(170,210,255,0.5)' });
  }
  function bakeScene(W, H) {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    scene = bake(W, H, (c) => {
      const g = c.createLinearGradient(0, 0, W * 0.3, H);
      g.addColorStop(0, '#070a24'); g.addColorStop(0.5, '#0c0a2e'); g.addColorStop(1, '#03040f');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      // Nebula clouds: many soft coloured puffs
      c.globalCompositeOperation = 'lighter';
      const puffs = [['#6a2bd6', 0.18], ['#d6338f', 0.12], ['#1fb5d6', 0.12], ['#3a4cff', 0.14]];
      for (let i = 0; i < 70; i++) {
        const [col, a] = puffs[i % 4];
        const t = rnd(), x = W * (0.1 + t * 0.9) + Math.sin(t * 9) * W * 0.12, y = H * (0.85 - t * 0.7) + Math.cos(t * 7 + i) * H * 0.12;
        const r = Math.min(W, H) * (0.08 + rnd() * 0.22);
        const rg = c.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, rgba(col, a)); rg.addColorStop(1, rgba(col, 0));
        c.fillStyle = rg; c.fillRect(x - r, y - r, r * 2, r * 2);
      }
      // Stars
      for (let i = 0; i < 420; i++) {
        const x = rnd() * W, y = rnd() * H, s = rnd() < 0.92 ? 0.6 + rnd() * 0.9 : 1.6 + rnd() * 1.4;
        c.fillStyle = `rgba(${200 + Math.floor(rnd() * 55)},${210 + Math.floor(rnd() * 45)},255,${0.4 + rnd() * 0.6})`;
        c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill();
        if (s > 2) { const sg = c.createRadialGradient(x, y, 0, x, y, s * 5); sg.addColorStop(0, 'rgba(180,200,255,0.35)'); sg.addColorStop(1, 'rgba(180,200,255,0)'); c.fillStyle = sg; c.fillRect(x - s * 5, y - s * 5, s * 10, s * 10); }
      }
      c.globalCompositeOperation = 'source-over';
      // A big ringed planet in the corner, half in shadow
      const px = W * 0.9, py = H * 0.86, pr = Math.min(W, H) * 0.3;
      const atm = c.createRadialGradient(px, py, pr * 0.9, px, py, pr * 1.25);
      atm.addColorStop(0, 'rgba(120,160,255,0.35)'); atm.addColorStop(1, 'rgba(120,160,255,0)');
      c.fillStyle = atm; c.beginPath(); c.arc(px, py, pr * 1.25, 0, Math.PI * 2); c.fill();
      const pg = c.createRadialGradient(px - pr * 0.5, py - pr * 0.5, pr * 0.1, px, py, pr);
      pg.addColorStop(0, '#7f8cff'); pg.addColorStop(0.5, '#3a3a9a'); pg.addColorStop(1, '#0c0c30');
      c.fillStyle = pg; c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.fill();
      c.save(); c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.clip();
      c.strokeStyle = 'rgba(200,210,255,0.12)'; c.lineWidth = pr * 0.06;
      for (let k = -3; k <= 3; k++) { c.beginPath(); c.ellipse(px, py + k * pr * 0.25, pr * 1.2, pr * 0.1, -0.3, 0, Math.PI * 2); c.stroke(); }
      c.restore();
      c.strokeStyle = 'rgba(220,200,255,0.35)'; c.lineWidth = pr * 0.05;
      c.beginPath(); c.ellipse(px, py, pr * 1.6, pr * 0.35, -0.3, Math.PI * 0.95, Math.PI * 2.05); c.stroke();
      // A small moon top left
      const mx = W * 0.07, my = H * 0.8, mr = Math.min(W, H) * 0.05;
      const mg = c.createRadialGradient(mx - mr * 0.4, my - mr * 0.4, 0, mx, my, mr);
      mg.addColorStop(0, '#ffe9c8'); mg.addColorStop(1, '#8a5a6a');
      c.fillStyle = mg; c.beginPath(); c.arc(mx, my, mr, 0, Math.PI * 2); c.fill();
      // Vignette
      const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,8,0.7)');
      c.fillStyle = vg; c.fillRect(0, 0, W, H);
      // Panels that never move are part of the picture
      panelBox(c, L.left); panelBox(c, L.right);
    }, 1);
  }
  // The jar: a thick glass back (behind the pieces) and front (over them).
  function bakeJar() {
    const { jw, jh } = L, t = 14 * S, pad = 30 * S, top = 34 * S;
    const W2 = jw + 2 * (t + pad), H2 = jh + top + t + 2 * pad;
    const shape = (c, inset) => roundRect(c, pad + inset, pad + inset, jw + 2 * t - inset * 2, jh + top + t - inset * 2, 30 * S);
    jarBack = bake(W2, H2, (c) => {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 30 * S; c.shadowOffsetY = 12 * S;
      shape(c, 0); c.fillStyle = 'rgba(20,40,90,0.35)'; c.fill(); c.restore();
      shape(c, t * 0.7);
      const g = c.createLinearGradient(pad, 0, pad + jw + 2 * t, 0);
      g.addColorStop(0, 'rgba(120,190,255,0.20)'); g.addColorStop(0.3, 'rgba(90,140,255,0.06)'); g.addColorStop(0.7, 'rgba(90,140,255,0.05)'); g.addColorStop(1, 'rgba(140,200,255,0.18)');
      c.fillStyle = g; c.fill();
      // The far wall's reflections
      c.fillStyle = 'rgba(200,230,255,0.06)';
      roundRect(c, pad + jw * 0.62, pad + top + jh * 0.1, jw * 0.08, jh * 0.75, 10 * S); c.fill();
      // Glow on the floor
      const fg = c.createRadialGradient(pad + t + jw / 2, pad + top + jh, 0, pad + t + jw / 2, pad + top + jh, jw * 0.6);
      fg.addColorStop(0, 'rgba(140,180,255,0.18)'); fg.addColorStop(1, 'rgba(140,180,255,0)');
      c.fillStyle = fg; c.fillRect(pad, pad + top, jw + 2 * t, jh);
    });
    jarFront = bake(W2, H2, (c) => {
      // Thick walls: bright outer edge, clear middle, refracted inner line
      c.save(); shape(c, 0); shape(c, t); c.restore();
      const ox = pad, oy = pad, ow = jw + 2 * t, oh = jh + top + t;
      c.beginPath();
      const rr = 30 * S, ir = Math.max(4, rr - t);
      const rrect = (x, y, w, h, r) => { c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
      rrect(ox, oy, ow, oh, rr); rrect(ox + t, oy + t * 0.6, ow - 2 * t, oh - t * 1.6, ir);
      const wg = c.createLinearGradient(ox, 0, ox + ow, 0);
      wg.addColorStop(0, 'rgba(220,240,255,0.65)'); wg.addColorStop(0.025, 'rgba(160,210,255,0.25)'); wg.addColorStop(0.04, 'rgba(255,255,255,0.55)');
      wg.addColorStop(0.06, 'rgba(150,200,255,0.15)'); wg.addColorStop(0.94, 'rgba(150,200,255,0.15)'); wg.addColorStop(0.96, 'rgba(255,255,255,0.45)');
      wg.addColorStop(0.975, 'rgba(160,210,255,0.25)'); wg.addColorStop(1, 'rgba(220,240,255,0.6)');
      c.fillStyle = wg; c.fill('evenodd');
      // Thick base with a caustic glint
      const bg = c.createLinearGradient(0, oy + oh - t * 1.2, 0, oy + oh);
      bg.addColorStop(0, 'rgba(200,230,255,0.15)'); bg.addColorStop(0.5, 'rgba(230,245,255,0.55)'); bg.addColorStop(1, 'rgba(160,200,255,0.3)');
      c.fillStyle = bg; roundRect(c, ox + t * 0.8, oy + oh - t * 1.1, ow - t * 1.6, t * 1.0, t * 0.5); c.fill();
      // Outline
      c.lineWidth = 2; c.strokeStyle = 'rgba(220,240,255,0.85)'; shape(c, 1); c.stroke();
      // Long specular streaks
      const s1 = c.createLinearGradient(0, oy + top, 0, oy + oh * 0.85);
      s1.addColorStop(0, 'rgba(255,255,255,0)'); s1.addColorStop(0.2, 'rgba(255,255,255,0.45)'); s1.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = s1; roundRect(c, ox + t * 1.4, oy + top + jh * 0.05, t * 0.9, jh * 0.7, t * 0.45); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)'; roundRect(c, ox + t * 2.6, oy + top + jh * 0.12, t * 0.35, jh * 0.4, t * 0.2); c.fill();
      const s2 = c.createLinearGradient(0, oy + top, 0, oy + oh);
      s2.addColorStop(0, 'rgba(255,255,255,0)'); s2.addColorStop(0.6, 'rgba(255,255,255,0.3)'); s2.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = s2; roundRect(c, ox + ow - t * 2.2, oy + top + jh * 0.3, t * 0.5, jh * 0.6, t * 0.25); c.fill();
      // Rim: a rounded glass lip
      const lg = c.createLinearGradient(0, oy - 4 * S, 0, oy + t * 1.4);
      lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(0.5, 'rgba(180,220,255,0.6)'); lg.addColorStop(1, 'rgba(140,190,255,0.25)');
      c.fillStyle = lg; roundRect(c, ox - t * 0.6, oy - 4 * S, ow + t * 1.2, t * 1.4, t * 0.7); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.9)'; roundRect(c, ox - t * 0.6, oy - 4 * S, ow + t * 1.2, t * 1.4, t * 0.7); c.stroke();
    });
    jarBack.ox = jarFront.ox = L.jx - t - pad; jarBack.oy = jarFront.oy = L.jy - top - pad;
  }
  function bakeUfo() {
    const w = 120 * S, h = 60 * S;
    ufo = bake(w, h, (c) => {
      const cx = w / 2;
      // Glass dome
      const dg = c.createRadialGradient(cx - 8 * S, h * 0.25, 2, cx, h * 0.4, 30 * S);
      dg.addColorStop(0, 'rgba(255,255,255,0.95)'); dg.addColorStop(0.4, 'rgba(150,230,255,0.7)'); dg.addColorStop(1, 'rgba(60,120,200,0.6)');
      c.fillStyle = dg; c.beginPath(); c.ellipse(cx, h * 0.48, 26 * S, 22 * S, 0, Math.PI, 0); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      // Metal saucer
      const sg = c.createLinearGradient(0, h * 0.4, 0, h * 0.8);
      sg.addColorStop(0, '#f2f6ff'); sg.addColorStop(0.45, '#9aa8c8'); sg.addColorStop(1, '#4a5578');
      c.fillStyle = sg; c.beginPath(); c.ellipse(cx, h * 0.6, 56 * S, 14 * S, 0, 0, Math.PI * 2); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = '#2a3150'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(cx - 10 * S, h * 0.54, 30 * S, 4 * S, 0, 0, Math.PI * 2); c.fill();
      ['#ff5d8f', '#ffd23f', '#5dffb0', '#5dc8ff', '#ff5d8f'].forEach((col, i) => {
        const x = cx + (i - 2) * 20 * S, y = h * 0.66;
        const lg = c.createRadialGradient(x, y, 0, x, y, 6 * S); lg.addColorStop(0, '#fff'); lg.addColorStop(0.4, col); lg.addColorStop(1, rgba(col, 0));
        c.fillStyle = lg; c.fillRect(x - 6 * S, y - 6 * S, 12 * S, 12 * S);
      });
    });
  }
  function goldPill(c, x, y, w, h, t) {
    c.save();
    c.shadowColor = '#ffd23f'; c.shadowBlur = 16 + 8 * Math.sin(t * 5);
    roundRect(c, x, y, w, h, h / 2);
    const g = c.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#fff3a8'); g.addColorStop(0.5, '#ffc93a'); g.addColorStop(1, '#e08a10');
    c.fillStyle = g; c.fill(); c.restore();
    c.lineWidth = 2.5; c.strokeStyle = '#fff8d8'; roundRect(c, x, y, w, h, h / 2); c.stroke();
    roundRect(c, x + h * 0.25, y + h * 0.1, w - h * 0.5, h * 0.32, h * 0.16); c.fillStyle = 'rgba(255,255,255,0.45)'; c.fill();
  }
  function drawIcon(c, id, x, y, s, color) {
    c.save(); c.strokeStyle = color; c.fillStyle = color; c.lineWidth = Math.max(2, s * 0.13); c.lineCap = 'round'; c.lineJoin = 'round';
    if (id === 'restart') {
      c.beginPath(); c.arc(x, y, s * 0.36, -Math.PI * 0.3, Math.PI * 1.45); c.stroke();
      const a = -Math.PI * 0.3, ax = x + Math.cos(a) * s * 0.36, ay = y + Math.sin(a) * s * 0.36;
      c.beginPath(); c.moveTo(ax + s * 0.2, ay - s * 0.02); c.lineTo(ax - s * 0.02, ay - s * 0.24); c.lineTo(ax - s * 0.06, ay + s * 0.08); c.closePath(); c.fill();
    } else if (id === 'sound' || id === 'mute') {
      c.beginPath(); c.moveTo(x - s * 0.42, y - s * 0.14); c.lineTo(x - s * 0.22, y - s * 0.14); c.lineTo(x, y - s * 0.36); c.lineTo(x, y + s * 0.36); c.lineTo(x - s * 0.22, y + s * 0.14); c.lineTo(x - s * 0.42, y + s * 0.14); c.closePath(); c.fill();
      c.lineWidth = s * 0.09;
      if (id === 'sound') { c.beginPath(); c.arc(x + s * 0.05, y, s * 0.2, -0.9, 0.9); c.stroke(); c.beginPath(); c.arc(x + s * 0.05, y, s * 0.36, -0.9, 0.9); c.stroke(); }
      else { c.beginPath(); c.moveTo(x + s * 0.12, y - s * 0.16); c.lineTo(x + s * 0.42, y + s * 0.16); c.moveTo(x + s * 0.42, y - s * 0.16); c.lineTo(x + s * 0.12, y + s * 0.16); c.stroke(); }
    } else if (id === 'crown') {
      c.beginPath(); c.moveTo(x - s * 0.45, y + s * 0.3); c.lineTo(x - s * 0.5, y - s * 0.25); c.lineTo(x - s * 0.2, y); c.lineTo(x, y - s * 0.4); c.lineTo(x + s * 0.2, y); c.lineTo(x + s * 0.5, y - s * 0.25); c.lineTo(x + s * 0.45, y + s * 0.3); c.closePath();
      const g = c.createLinearGradient(0, y - s * 0.4, 0, y + s * 0.3); g.addColorStop(0, '#fff3a8'); g.addColorStop(1, '#e0900f');
      c.fillStyle = g; c.fill(); c.lineWidth = Math.max(1, s * 0.06); c.strokeStyle = '#7a4a00'; c.stroke();
    }
    c.restore();
  }
  function keycap(c, label, x, y, h) {
    c.font = `700 ${Math.round(h * 0.5)}px ${Kit.UI}`;
    const w = Math.max(h, c.measureText(label).width + h * 0.5);
    roundRect(c, x, y - h / 2, w, h, h * 0.25);
    const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2); g.addColorStop(0, '#f2f7ff'); g.addColorStop(1, '#9fb4dc');
    c.fillStyle = g; c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#3a4a78'; c.stroke();
    text(c, label, x + w / 2, y + 1, h * 0.5, '#1a2450', 700);
    return w;
  }
  function drawJar(c, t) {
    if (!jarBack) bakeJar();
    c.drawImage(jarBack, jarBack.ox, jarBack.oy, jarBack.w, jarBack.h);
    // The red line: a glowing laser that flares when a piece is in danger
    const ly = sy(LINE), warn = dangerT > 0;
    const a = warn ? 0.65 + 0.35 * Math.sin(t * 18) : 0.45;
    c.save(); c.globalCompositeOperation = 'lighter';
    const lg = c.createLinearGradient(0, ly - 10 * S, 0, ly + 10 * S);
    lg.addColorStop(0, 'rgba(255,40,80,0)'); lg.addColorStop(0.5, `rgba(255,60,90,${a * 0.6})`); lg.addColorStop(1, 'rgba(255,40,80,0)');
    c.fillStyle = lg; c.fillRect(L.jx, ly - 10 * S, L.jw, 20 * S);
    c.setLineDash([16 * S, 10 * S]); c.lineWidth = Math.max(2, 3 * S); c.strokeStyle = `rgba(255,120,140,${a + 0.2})`;
    c.beginPath(); c.moveTo(L.jx, ly); c.lineTo(L.jx + L.jw, ly); c.stroke();
    c.restore();
  }
  function drawJarFront(c) { c.drawImage(jarFront, jarFront.ox, jarFront.oy, jarFront.w, jarFront.h); }
  function drawDropper(c, t) {
    if (!ufo) bakeUfo();
    const r = PIECES[cur].r, x = sx(dropX), topY = sy(RAIL);
    const py = sy(RAIL + 16 + r), hover = Math.sin(t * 3) * 3 * S;
    // The rail and the UFO that carries the next piece
    c.fillStyle = 'rgba(160,200,255,0.18)';
    roundRect(c, L.jx - 10 * S, topY - 2 * S, L.jw + 20 * S, 4 * S, 2 * S); c.fill();
    const k = clamp((clock - readyT) / 0.45, 0, 1), focusOn = focus === 'drop' && !Kit.touchFirst();
    // Aim beam to the floor
    c.save(); c.globalCompositeOperation = 'lighter';
    const bg = c.createLinearGradient(0, py, 0, L.jy + L.jh);
    bg.addColorStop(0, 'rgba(140,220,255,0.35)'); bg.addColorStop(1, 'rgba(140,220,255,0.02)');
    c.fillStyle = bg; c.fillRect(x - 2 * S, py, 4 * S, L.jy + L.jh - py);
    // Tractor beam holding the piece
    if (k > 0 && !over) {
      const tb = c.createLinearGradient(0, topY, 0, py + r * S);
      tb.addColorStop(0, 'rgba(150,240,255,0.45)'); tb.addColorStop(1, 'rgba(150,240,255,0.05)');
      c.fillStyle = tb; c.beginPath(); c.moveTo(x - 16 * S, topY + 8 * S); c.lineTo(x + 16 * S, topY + 8 * S); c.lineTo(x + r * S * 1.1, py + r * S); c.lineTo(x - r * S * 1.1, py + r * S); c.closePath(); c.fill();
    }
    c.restore();
    if (focusOn) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 + 0.2 * Math.sin(t * 6); c.drawImage(glowSprite('#ffd23f'), x - 70 * S, topY - 40 * S + hover, 140 * S, 80 * S); c.restore(); }
    c.drawImage(ufo, x - ufo.w / 2, topY - ufo.h * 0.62 + hover, ufo.w, ufo.h);
    if (!over && k > 0) {
      const sc = ease.back(k);
      drawPiece(c, cur, x, py + hover, r * S, Math.sin(t * 2) * 0.08, sc);
      if (focusOn && k >= 1) {
        c.save(); c.lineWidth = 3 + Math.sin(t * 7); c.strokeStyle = 'rgba(255,215,80,0.95)'; c.shadowColor = '#ffd23f'; c.shadowBlur = 14;
        c.beginPath(); c.arc(x, py + hover, r * S + 7, 0, Math.PI * 2); c.stroke(); c.restore();
      }
    }
  }
  function drawPanels(c, t) {
    const F = L.font, lp = L.left, rp = L.right;
    text(c, 'SCORE', lp.cx, lp.y + lp.h * 0.16, F * 0.75, 'rgba(210,225,255,0.8)', 700);
    c.save(); c.translate(lp.cx, lp.y + lp.h * 0.45); const s = 1 + bump * 0.12; c.scale(s, s);
    Kit.title(c, `${Math.round(shown)}`, 0, 0, F * 2.1, { color: '#ffcf4a' });
    c.restore();
    c.font = `600 ${Math.round(F * 0.9)}px ${Kit.UI}`;
    const bt = `Best ${best}`, bw = c.measureText(bt).width + F * 1.2;
    drawIcon(c, 'crown', lp.cx - bw / 2 + F * 0.4, lp.y + lp.h * 0.78, F * 0.9);
    text(c, bt, lp.cx - bw / 2 + F * 1.1, lp.y + lp.h * 0.78, F * 0.9, 'rgba(235,240,255,0.9)', 600, 'left');

    const rcx = rp.x + rp.w / 2;
    text(c, 'NEXT', rcx, rp.y + rp.h * 0.16, F * 0.75, 'rgba(210,225,255,0.8)', 700);
    const nr = Math.min(PIECES[next].r * S, rp.h * 0.28), ny = rp.y + rp.h * 0.6;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5; c.drawImage(glowSprite(PIECES[next].color), rcx - nr * 2.2, ny - nr * 2.2, nr * 4.4, nr * 4.4); c.restore();
    drawPiece(c, next, rcx, ny + Math.sin(t * 2) * 2, nr, 0, 1);

    if (L.wide) {
      // The ladder: every size in a ring, the biggest reached so far lit up.
      const room = L.jy + L.jh - rp.y - rp.h, rad = Math.min(rp.w * 0.36, room * 0.34), cy = rp.y + rp.h + room / 2 + F * 0.5;
      text(c, 'GROW THEM ALL', rcx, cy - rad - F * 1.5, F * 0.7, 'rgba(210,225,255,0.7)', 700);
      c.save(); c.strokeStyle = 'rgba(160,200,255,0.18)'; c.lineWidth = 2; c.beginPath(); c.arc(rcx, cy, rad, 0, Math.PI * 2); c.stroke(); c.restore();
      for (let i = 0; i < PIECES.length; i++) {
        const a = -Math.PI / 2 + (i / PIECES.length) * Math.PI * 2;
        const x = rcx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad, pr = rad * (0.12 + i * 0.012);
        if (i <= biggest) { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35; c.drawImage(glowSprite(PIECES[i].color), x - pr * 2, y - pr * 2, pr * 4, pr * 4); c.restore(); }
        drawPiece(c, i, x, y, pr, 0, 1, i > biggest, i > Math.max(biggest, MAXDROP) ? 0.35 : 1);
      }
      drawPiece(c, Math.max(biggest, 0), rcx, cy, rad * 0.4, Math.sin(t) * 0.1, 1 + Math.sin(t * 3) * 0.03);
      text(c, PIECES[biggest].name, rcx, cy + rad * 0.62, F * 0.72, '#fff', 700, 'center', Kit.FONT);
      // How to play, with keycaps
      const kh = F * 1.05, lines = Kit.touchFirst() ? [] : [['◀ ▶', 'move (hold)'], ['OK ▼', 'drop'], ['BACK', 'menu']];
      lines.forEach(([k, s2], i) => {
        const y = lp.y + lp.h + F * 1.7 + i * F * 1.5;
        const kw = keycap(c, k, lp.x + lp.w * 0.12, y, kh);
        text(c, s2, lp.x + lp.w * 0.12 + kw + F * 0.45, y, F * 0.78, 'rgba(225,235,255,0.85)', 600, 'left');
      });
    }
    // New game button
    const b = L.btn, on = focus === 'btn' && !over, sure = clock - confirmT < 2.5;
    if (on) goldPill(c, b.x, b.y, b.w, b.h, t);
    else { roundRect(c, b.x, b.y, b.w, b.h, b.h / 2); c.fillStyle = 'rgba(8,12,40,0.6)'; c.fill(); Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: 'rgba(80,120,255,0.12)', edge: 'rgba(170,210,255,0.5)' }); }
    const label = sure ? 'OK again to restart' : 'New game', fs = Math.min(b.h * 0.4, b.w * (sure ? 0.075 : 0.11));
    c.font = `600 ${Math.round(fs)}px ${Kit.UI}`;
    const tw = c.measureText(label).width, ic = sure ? 0 : b.h * 0.5, x0 = b.x + b.w / 2 - (tw + ic * 1.2) / 2;
    if (!sure) drawIcon(c, 'restart', x0 + ic / 2, b.y + b.h / 2, ic, on ? '#3a1c00' : '#cfe0ff');
    text(c, label, x0 + ic * 1.2, b.y + b.h / 2 + 1, fs, on ? '#3a1c00' : '#fff', 600, 'left');
  }
  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    if (!scene || scene.w !== W || scene.h !== H) bakeScene(W, H);
    c.drawImage(scene, 0, 0, W, H);
    // Twinkling stars and the odd shooting star
    c.save(); c.globalCompositeOperation = 'lighter';
    const tw = starSprite('#bcd4ff');
    for (const s of twinkles) {
      const a = 0.5 + 0.5 * Math.sin(t * s.f + s.p), z = (2 + s.s * 5) * a;
      c.drawImage(tw, s.x * W - z, s.y * H - z, z * 2, z * 2);
    }
    if (!shoot && Math.random() < 0.004) shoot = { x: Math.random() * W * 0.7, y: Math.random() * H * 0.4, t0: t };
    if (shoot) {
      const q = (t - shoot.t0) / 0.8;
      if (q > 1) shoot = null;
      else {
        const x = shoot.x + q * W * 0.3, y = shoot.y + q * H * 0.15;
        const sg = c.createLinearGradient(x - 120, y - 60, x, y); sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(1, `rgba(220,235,255,${0.8 * (1 - q)})`);
        c.strokeStyle = sg; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 120, y - 60); c.lineTo(x, y); c.stroke();
      }
    }
    c.restore();
    drawJar(c, t);
    if (!over) drawDropper(c, t);
    // Pieces: breathing gently, squashing when they land
    for (const b of bodies) {
      let sc = 1 + 0.012 * Math.sin(clock * 2.4 + b.id), sxk = 1, syk = 1;
      if (b.pop != null && clock - b.pop < 0.35) sc *= 1 + Math.sin(((clock - b.pop) / 0.35) * Math.PI) * 0.14;
      if (b.imp != null && clock - b.imp < 0.25) { const q = Math.sin(((clock - b.imp) / 0.25) * Math.PI) * b.impA; sxk = 1 + q * 0.14; syk = 1 - q * 0.14; }
      const sleepy = Math.abs(b.vx) + Math.abs(b.vy) < 20 && ((clock + b.blink) % 4) < 0.15;
      const danger = dangerT > 0 && b.y - b.r < LINE && clock - b.born > 1.2;
      const k = sc * (b.r / PIECES[b.lv].r), px = sx(b.x), py = sy(b.y) + (1 - syk) * b.r * S;
      if (PIECES[b.lv].pat === 'sun') { c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.4 + 0.15 * Math.sin(clock * 3); c.drawImage(glowSprite('#ffb020'), px - b.r * S * 2.2, py - b.r * S * 2.2, b.r * S * 4.4, b.r * S * 4.4); c.restore(); }
      drawPiece(c, b.lv, px, py, PIECES[b.lv].r * S, b.a, k, sleepy || over, 1, sxk, syk);
      if (danger) {
        c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.35 + 0.3 * Math.sin(t * 18);
        c.drawImage(glowSprite('#ff3050'), px - b.r * S * 1.5, py - b.r * S * 1.5, b.r * S * 3, b.r * S * 3); c.restore();
      }
    }
    // Merge pops: a flash of light and a bright ring
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const p of pops) {
      const q = (clock - p.t0) / 0.45, x = sx(p.x), y = sy(p.y), r = p.r * S;
      c.globalAlpha = 1 - q;
      c.drawImage(glowSprite(p.color), x - r * 2.2, y - r * 2.2, r * 4.4, r * 4.4);
      c.drawImage(glowSprite('#ffffff'), x - r * (1 - q), y - r * (1 - q), r * 2 * (1 - q) + 1, r * 2 * (1 - q) + 1);
      c.strokeStyle = '#fff'; c.lineWidth = (1 - q) * 10 * S + 1;
      c.beginPath(); c.arc(x, y, r * (0.8 + q * 0.6), 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    drawJarFront(c);
    if (dangerT > 0 && !over) Kit.title(c, `${Math.max(0, 2 - dangerT).toFixed(1)}`, L.jx + L.jw / 2, sy(LINE) - 24 * S, Math.max(26, L.font * 1.2), { color: '#ff6b81', glow: '#ff3050' });
    drawPanels(c, t);
    drawSparks(c);
    if (L.wide) {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = 8;
      text(c, 'Arrows move  ·  OK drops  ·  Two alike merge  ·  Back exits', W / 2, H - Math.max(16, H * 0.028), Math.max(18, Math.min(H * 0.028, 28)), 'rgba(225,235,255,0.85)', 600);
      c.restore();
    }
    const m = muteBox();
    c.globalAlpha = 0.8; drawIcon(c, Kit.muted ? 'mute' : 'sound', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.6, '#dfe8ff'); c.globalAlpha = 1;
    if (introT < 5 && score === 0 && bodies.length < 2 && !over) {
      c.globalAlpha = Math.min(1, introT * 2, (5 - introT) * 2);
      Kit.title(c, 'Two alike merge into a bigger one!', L.jx + L.jw / 2, L.jy + L.jh * 0.45, Math.max(20, L.font * 0.95), { color: '#bfe3ff' });
      c.globalAlpha = 1;
    }
    if (over && clock - overT > 0.8) {
      const a = clamp((clock - overT - 0.8) / 0.4, 0, 1);
      c.fillStyle = `rgba(3,6,24,${0.65 * a})`; c.fillRect(0, 0, W, H);
      const pw = Math.min(W * 0.84, 560), ph = Math.min(H * 0.6, 380);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.5 * a; c.drawImage(glowSprite('#5d7cff'), -pw, -ph, pw * 2, ph * 2); c.restore();
      c.save(); c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 40; c.shadowOffsetY = 14;
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 32);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2); g.addColorStop(0, '#2d4ad0'); g.addColorStop(1, '#10184a');
      c.fillStyle = g; c.fill(); c.restore();
      c.lineWidth = 3; c.strokeStyle = 'rgba(190,220,255,0.9)'; roundRect(c, -pw / 2, -ph / 2, pw, ph, 32); c.stroke();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(190,220,255,0.35)'; roundRect(c, -pw / 2 + 10, -ph / 2 + 10, pw - 20, ph - 20, 24); c.stroke();
      Kit.title(c, 'The jar is full!', 0, -ph * 0.33, ph * 0.11, { color: '#bfe3ff' });
      Kit.title(c, `${score}`, 0, -ph * 0.1, ph * 0.2, { color: '#ffcf4a', glow: 'rgba(255,200,60,0.6)' });
      text(c, newBest ? 'New best score!' : `Best ${best}`, 0, ph * 0.08, ph * 0.075, newBest ? '#ffe680' : 'rgba(230,240,255,0.9)', 700);
      const bs = ph * 0.13;
      drawPiece(c, biggest, -ph * 0.3, ph * 0.2, bs * 0.5, 0, 1);
      text(c, `Biggest: ${PIECES[biggest].name}`, -ph * 0.2, ph * 0.2, ph * 0.065, 'rgba(230,240,255,0.8)', 600, 'left');
      const bw = pw * 0.56, bh = ph * 0.14, by2 = ph * 0.36;
      goldPill(c, -bw / 2, by2 - bh / 2, bw, bh, clock);
      text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  ·  Play again', 0, by2 + 1, bh * 0.45, '#3a1c00', 700);
      c.restore();
    }
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (best > 0) Kit.record('mergedrop', best);
})();
