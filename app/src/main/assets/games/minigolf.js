// Mini Golf: nine colourful holes seen from above, with raised rails, bouncy bumpers, slopes, sand,
// water, a windmill and a sliding gate. One to four players take turns (each seat a person or the TV);
// every player plays the whole hole, the scorecard keeps the strokes, the lowest total wins.
// Remote: ◀ ▶ aim (▲ ▼ fine aim), OK starts the swinging power meter, OK again putts.
// Menu: ▲ ▼ choose a row, ◀ ▶ change, OK plays. Touch: tap = OK. M mutes.
// Test hooks: #auto (every seat is a TV player, 4x speed), #fast (4x speed).
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const ID = 'minigolf';
  const HASH = (location.hash || '').toLowerCase();
  const AUTO = HASH.indexOf('auto') >= 0;
  const SPEED = AUTO || HASH.indexOf('fast') >= 0 ? 4 : 1;
  const AUTO_N = clamp(parseInt((HASH.match(/auto(\d)/) || [])[1], 10) || 3, 1, 4);
  const TAU = Math.PI * 2;

  const SEAT_C = ['#ff4d6d', '#3d8bff', '#2ed573', '#ffc312'];
  const SKILLS = [
    { name: 'Beginner', tip: 'Long guide line · slow power meter · big cup pull · max 6 shots',
      meter: 2.7, maxStrokes: 6, pullR: 1.7, pullK: 10, guide: 0, aiAng: 0.17, aiPow: 0.3 },
    { name: 'Normal', tip: 'Short aim line · faster meter · max 8 shots',
      meter: 1.75, maxStrokes: 8, pullR: 1.15, pullK: 7, guide: 5, aiAng: 0.06, aiPow: 0.12 },
    { name: 'Hard', tip: 'Tiny aim line · quick meter · the cup barely helps',
      meter: 1.2, maxStrokes: 8, pullR: 0.8, pullK: 4.5, guide: 2.6, aiAng: 0.02, aiPow: 0.045 },
  ];

  // ---------- Holes (field 32 x 18 units) ----------
  const R = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  const HOLES = [
    { name: 'First Putt', par: 2, poly: R(3, 5, 26, 8), tee: [6, 9], cup: [25.5, 9], theme: '#2ec46b' },
    { name: 'Dogleg', par: 3, poly: [[2, 10], [20, 10], [20, 2], [29, 2], [29, 16], [2, 16]], tee: [5, 13], cup: [24.5, 5.5],
      bumpers: [[24.5, 13, 0.85]], theme: '#29b8a0' },
    { name: 'Bumper Alley', par: 3, poly: R(2, 3, 28, 12), tee: [4.5, 9], cup: [27.5, 9],
      bumpers: [[10, 6.4, 0.9], [10, 11.6, 0.9], [15.2, 9, 1], [20.2, 5.6, 0.9], [20.2, 12.4, 0.9], [24, 9, 0.7]], theme: '#36c25a' },
    { name: 'Hill Climb', par: 3, poly: [[2, 6], [9, 4], [30, 4], [30, 14], [9, 14], [2, 12]], tee: [4.5, 9], cup: [26, 9],
      slopes: [[11, 4, 8, 10, -3.4, 0], [22, 4, 8, 4.6, 0, 2.4], [22, 9.4, 8, 4.6, 0, -2.4]], theme: '#4cbd3c' },
    { name: 'Lily Pond', par: 3, poly: R(2, 2, 28, 14), tee: [4.5, 9], cup: [27, 9],
      water: [[16, 4.9, 6.5, 3], [16, 13.1, 6.5, 3]], sand: [[24.5, 4.6, 2.4, 1.4]], theme: '#2fc27a' },
    { name: 'Windmill', par: 3, poly: [[2, 11], [20, 11], [20, 1.5], [29, 1.5], [29, 17], [2, 17]], tee: [5, 14], cup: [24.5, 3.9],
      mill: { x: 24.5, y: 8, w: 9, d: 2, gap: 1.8, period: 4.6 }, theme: '#3cb95a' },
    { name: 'Sliding Gate', par: 3, poly: R(2, 3, 28, 12), walls: [[16, 3, 16, 7], [16, 11, 16, 15]], tee: [5, 9], cup: [26, 10.6],
      gate: { x: 16, y0: 7, y1: 11, len: 2.2, period: 3.4 }, sand: [[24, 6, 2.6, 1.5]], theme: '#2db884' },
    { name: 'Zig Zag', par: 4, poly: R(2, 2, 28, 14), walls: [[11, 2, 11, 11.5], [21, 6.5, 21, 16]], tee: [6, 5], cup: [26, 12.5],
      bumpers: [[16, 9, 0.8]], sand: [[16, 14.2, 2.4, 1.2]], slopes: [[22, 2, 8, 4.5, 0, 1.8]], theme: '#43c05e' },
    { name: 'Grand Finale', par: 4, poly: R(2, 2, 28, 14), tee: [5, 13.6], cup: [25, 4.8],
      mill: { x: 24, y: 9, w: 12, d: 2, gap: 1.8, period: 3.9 }, water: [[11, 9, 3.4, 2.4]],
      bumpers: [[7, 5.5, 0.8], [15, 4.2, 0.7]], slopes: [[2, 11.6, 14, 4.4, 1.3, 0]], theme: '#2fbd6c' },
  ];
  const PAR_TOTAL = HOLES.reduce((s, h) => s + h.par, 0);

  const BR = 0.28, CUP_R = 0.5, SINK_V = 9, MAXV = 26, RAIL = 0.3;

  // Build each hole's collision data once.
  HOLES.forEach((h) => {
    h.segs = [];
    const P = h.poly;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      h.segs.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1], th: RAIL });
    }
    (h.walls || []).forEach((w) => h.segs.push({ x1: w[0], y1: w[1], x2: w[2], y2: w[3], th: RAIL, inner: true }));
    h.blocks = [];
    if (h.mill) {
      const m = h.mill, x0 = m.x - m.w / 2, x1 = m.x + m.w / 2, y0 = m.y - m.d / 2, y1 = m.y + m.d / 2;
      h.blocks.push([x0, y0, m.x - m.gap / 2 - x0, m.d], [m.x + m.gap / 2, y0, x1 - (m.x + m.gap / 2), m.d]);
    }
    h.blocks.forEach((r) => {
      const [x, y, w, hh] = r;
      [[x, y, x + w, y], [x + w, y, x + w, y + hh], [x + w, y + hh, x, y + hh], [x, y + hh, x, y]]
        .forEach((s) => h.segs.push({ x1: s[0], y1: s[1], x2: s[2], y2: s[3], th: 0.04, block: true }));
    });
    h.bumpers = h.bumpers || []; h.slopes = h.slopes || []; h.water = h.water || []; h.sand = h.sand || [];
  });

  function inPoly(P, x, y) {
    let c = false;
    for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
      const xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  const inEll = (e, x, y) => { const dx = (x - e[0]) / e[2], dy = (y - e[1]) / e[3]; return dx * dx + dy * dy < 1; };
  const inBlock = (h, x, y, pad) => h.blocks.some((r) => x > r[0] - pad && x < r[0] + r[2] + pad && y > r[1] - pad && y < r[1] + r[3] + pad);

  // Moving parts, as a function of the game clock.
  function millAngle(m, t) { return (t / m.period) * TAU; }
  function millBlocked(m, t) {
    const a = millAngle(m, t) - Math.PI / 2;
    let d = ((a % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
    if (d > Math.PI / 4) d -= Math.PI / 2;
    return Math.abs(d) < 0.42;
  }
  function gateY(g, t) {
    const mid = (g.y0 + g.y1) / 2, amp = (g.y1 - g.y0 - g.len) / 2;
    return mid + amp * Math.sin((t / g.period) * TAU);
  }
  function gateVY(g, t) {
    const amp = (g.y1 - g.y0 - g.len) / 2;
    return amp * Math.cos((t / g.period) * TAU) * (TAU / g.period);
  }
  function movingSegs(h, t) {
    const out = [];
    if (h.mill && millBlocked(h.mill, t)) {
      const m = h.mill, y = m.y + m.d / 2;
      out.push({ x1: m.x - m.gap / 2, y1: y, x2: m.x + m.gap / 2, y2: y, th: 0.12, vx: 0, vy: 0 });
    }
    if (h.gate) {
      const g = h.gate, yc = gateY(g, t), vy = gateVY(g, t);
      out.push({ x1: g.x, y1: yc - g.len / 2, x2: g.x, y2: yc + g.len / 2, th: 0.32, vx: 0, vy });
    }
    return out;
  }

  // ---------- Physics (also used by the TV players to plan shots) ----------
  // One step of the ball. Returns null, 'water', 'sunk', or a hit kind for sounds.
  function stepBall(b, h, sk, dt, t, ev) {
    let fr = 4.2, lin = 0.35;
    for (const s of h.sand) if (inEll(s, b.x, b.y)) { fr = 15; lin = 1.6; break; }
    let ax = 0, ay = 0;
    for (const s of h.slopes) if (b.x > s[0] && b.x < s[0] + s[2] && b.y > s[1] && b.y < s[1] + s[3]) { ax += s[4]; ay += s[5]; }
    const cx = h.cup[0] - b.x, cy = h.cup[1] - b.y, cd = Math.hypot(cx, cy);
    if (cd < sk.pullR && cd > 0.001) {
      const sp0 = Math.hypot(b.vx, b.vy);
      const f = sk.pullK * (1 - cd / sk.pullR) * (sp0 < 6 ? 1 : 0.4);
      ax += (cx / cd) * f; ay += (cy / cd) * f;
    }
    b.vx += ax * dt; b.vy += ay * dt;
    let sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - (fr + lin * sp) * dt);
      b.vx *= ns / sp; b.vy *= ns / sp; sp = ns;
    }
    const px = b.x, py = b.y;
    b.x += b.vx * dt; b.y += b.vy * dt;
    // Rails and blocks
    for (const s of h.segs) collideSeg(b, s, ev);
    for (const s of movingSegs(h, t)) collideSeg(b, s, ev);
    for (const u of h.bumpers) {
      const dx = b.x - u[0], dy = b.y - u[1], d = Math.hypot(dx, dy), rr = u[2] + BR;
      if (d < rr && d > 1e-6) {
        const nx = dx / d, ny = dy / d;
        b.x = u[0] + nx * rr; b.y = u[1] + ny * rr;
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 2.1 * vn * nx; b.vy -= 2.1 * vn * ny;
          const s2 = Math.hypot(b.vx, b.vy);
          if (s2 < 3) { b.vx += nx * 2; b.vy += ny * 2; }
          if (ev) ev.push({ k: 'bump', v: -vn, i: h.bumpers.indexOf(u) });
        }
      }
    }
    // Escaped through a rail (should not happen): step back.
    if (!inPoly(h.poly, b.x, b.y) || inBlock(h, b.x, b.y, -0.02)) { b.x = px; b.y = py; b.vx *= -0.5; b.vy *= -0.5; }
    for (const w of h.water) if (inEll(w, b.x, b.y)) return 'water';
    sp = Math.hypot(b.vx, b.vy);
    const dx = b.x - h.cup[0], dy = b.y - h.cup[1], d = Math.hypot(dx, dy);
    if (d < CUP_R * 0.82 && sp < SINK_V) return 'sunk';
    if (d < CUP_R * 0.9 && sp >= SINK_V && !b.lipped) {
      // Too fast: it hops the cup, turned a little.
      b.lipped = true;
      const side = (b.vx * dy - b.vy * dx) >= 0 ? 1 : -1, a = 0.35 * side, c = Math.cos(a), s = Math.sin(a);
      const vx = b.vx * c - b.vy * s, vy = b.vx * s + b.vy * c;
      b.vx = vx * 0.8; b.vy = vy * 0.8;
      if (ev) ev.push({ k: 'lip' });
    }
    if (d > CUP_R * 1.2) b.lipped = false;
    return null;
  }
  function collideSeg(b, s, ev) {
    const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy || 1;
    const tt = clamp(((b.x - s.x1) * dx + (b.y - s.y1) * dy) / L2, 0, 1);
    const px = s.x1 + dx * tt, py = s.y1 + dy * tt;
    const ex = b.x - px, ey = b.y - py, d2 = ex * ex + ey * ey, rr = BR + s.th;
    if (d2 >= rr * rr || d2 < 1e-10) return;
    const d = Math.sqrt(d2), nx = ex / d, ny = ey / d;
    b.x = px + nx * rr; b.y = py + ny * rr;
    const svx = s.vx || 0, svy = s.vy || 0;
    const vn = (b.vx - svx) * nx + (b.vy - svy) * ny;
    if (vn < 0) {
      b.vx -= 1.78 * vn * nx; b.vy -= 1.78 * vn * ny;
      if (ev && -vn > 0.6) ev.push({ k: 'wall', v: -vn });
    }
  }
  // Runs one step of dt in small substeps so the ball never skips through a rail.
  function advance(b, h, sk, dt, t, ev) {
    const sp = Math.hypot(b.vx, b.vy);
    const n = clamp(Math.ceil((sp * dt) / 0.09), 1, 40), sd = dt / n;
    for (let i = 0; i < n; i++) {
      const r = stepBall(b, h, sk, sd, t + sd * i, ev);
      if (r) return r;
    }
    return null;
  }
  // Plays a whole shot without drawing: where does it end?
  function simulate(h, sk, x, y, ang, pow, t0, path) {
    const v = MAXV * (0.08 + 0.92 * pow);
    const b = { x, y, vx: Math.cos(ang) * v, vy: Math.sin(ang) * v };
    const dt = 1 / 40;
    let t = 0, lastPx = x, lastPy = y;
    if (path) path.push([x, y]);
    while (t < 9) {
      const r = advance(b, h, sk, dt, t0 + t, null);
      t += dt;
      if (path && Math.hypot(b.x - lastPx, b.y - lastPy) > 0.55) { path.push([b.x, b.y]); lastPx = b.x; lastPy = b.y; }
      if (r === 'water') return { water: true, x: b.x, y: b.y, t };
      if (r === 'sunk') { if (path) path.push([h.cup[0], h.cup[1]]); return { sunk: true, x: h.cup[0], y: h.cup[1], t }; }
      if (b.vx === 0 && b.vy === 0) break;
      if (path && path.length > 60) break;
    }
    return { x: b.x, y: b.y, t };
  }

  // Walking distance to the cup on a 0.5 grid (so TV players find their way round walls).
  function buildDist(h) {
    const S = 0.5, GW = 64, GH = 36, dist = new Float32Array(GW * GH).fill(1e9), ok = new Uint8Array(GW * GH);
    for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
      const x = (i + 0.5) * S, y = (j + 0.5) * S;
      let good = inPoly(h.poly, x, y) && !inBlock(h, x, y, BR) && !h.water.some((w) => inEll(w, x, y));
      if (good) for (const s of h.segs) {
        const dx = s.x2 - s.x1, dy = s.y2 - s.y1, L2 = dx * dx + dy * dy || 1;
        const tt = clamp(((x - s.x1) * dx + (y - s.y1) * dy) / L2, 0, 1);
        if (Math.hypot(x - s.x1 - dx * tt, y - s.y1 - dy * tt) < s.th + 0.12) { good = false; break; }
      }
      ok[j * GW + i] = good ? 1 : 0;
    }
    const ci = clamp(Math.floor(h.cup[0] / S), 0, GW - 1), cj = clamp(Math.floor(h.cup[1] / S), 0, GH - 1);
    const q = [cj * GW + ci]; dist[q[0]] = 0; ok[q[0]] = 1;
    // Small Dijkstra-ish relaxation (grid BFS with diagonal costs, repeated until stable).
    for (let head = 0; head < q.length; head++) {
      const k = q[head], i = k % GW, j = (k / GW) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
        const nk = nj * GW + ni;
        if (!ok[nk]) continue;
        if (di && dj && (!ok[j * GW + ni] || !ok[nj * GW + i])) continue;
        const nd = dist[k] + (di && dj ? 0.707 : 0.5);
        if (nd < dist[nk] - 1e-4) { dist[nk] = nd; q.push(nk); }
      }
    }
    h.dist = (x, y) => {
      const i = clamp(Math.floor(x / S), 0, GW - 1), j = clamp(Math.floor(y / S), 0, GH - 1);
      const d = dist[j * GW + i];
      return d > 1e8 ? 60 : d + Math.hypot(x - (i + 0.5) * S, y - (j + 0.5) * S);
    };
  }

  // ---------- Setup and records ----------
  const setup = Kit.store.get(ID + '.setup', { people: 1, tv: 1 }) || {};
  let people = clamp((setup.people | 0) || 1, 1, 4), tvs = clamp(setup.tv | 0, 0, 3);
  function fixTv() { tvs = clamp(tvs, 0, 4 - people); }
  fixTv();
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, SKILLS.length - 1);
  let wins = Kit.store.get(ID + '.wins', 0) | 0;

  // ---------- State ----------
  let state = 'menu', menuRow = 0, overBtn = 0, stateT = 0, clock = 0, gclock = 0;
  let players = [], holeIx = 0, cur = 0, phase = 'intro', phaseT = 0, sk = SKILLS[skill];
  let ball = null, aim = 0, meterT = 0, power = 0, lastShot = null, sinkAnim = 0, bannerT = 9, cardT = 0;
  let ai = null, guidePath = [], guideT = 0, flash = [], winners = [], bumpGlow = [];
  let holeMsg = null;

  const human = (i) => players[i] && players[i].human;
  const nameOf = (i) => players[i].name;

  function newGame() {
    sk = SKILLS[skill];
    const humans = AUTO ? 0 : people, n = AUTO ? AUTO_N : people + tvs;
    players = [];
    let tvN = 0;
    for (let i = 0; i < n; i++) {
      const isH = i < humans;
      if (!isH) tvN++;
      players.push({ c: SEAT_C[i], human: isH, name: isH ? (humans === 1 ? 'You' : `Player ${i + 1}`) : (n - humans === 1 ? 'TV' : `TV ${tvN}`),
        strokes: HOLES.map(() => null) });
    }
    holeIx = 0;
    startHole();
  }
  function totalOf(p) { return p.strokes.reduce((s, v) => s + (v || 0), 0); }
  function parSoFar(p) { return p.strokes.reduce((s, v, i) => s + (v == null ? 0 : HOLES[i].par), 0); }

  function startHole() {
    const h = HOLES[holeIx];
    if (!h.dist) buildDist(h);
    layoutHole();
    cur = 0;
    phase = 'intro'; phaseT = 0;
    bumpGlow = h.bumpers.map(() => 0);
    Kit.sfx.chime();
  }
  function startTurn() {
    const h = HOLES[holeIx];
    const p = players[cur];
    p.strokes[holeIx] = 0;
    ball = { x: h.tee[0], y: h.tee[1], vx: 0, vy: 0, z: 0 };
    aim = Math.atan2(h.cup[1] - ball.y, h.cup[0] - ball.x);
    phase = 'banner'; phaseT = 0; bannerT = 0; ai = null;
    Kit.tone(620, { type: 'triangle', dur: 0.12, vol: 0.14, slide: 1.3 });
    Kit.tone(930, { type: 'sine', dur: 0.12, vol: 0.06, at: 0.06 });
  }
  function toAim() {
    phase = 'aim'; phaseT = 0;
    if (!human(cur)) planAI();
  }
  function startMeter() { phase = 'meter'; phaseT = 0; meterT = 0; Kit.tone(500, { type: 'triangle', dur: 0.06, vol: 0.12 }); }
  const meterVal = () => { const m = (meterT / sk.meter) % 1; return m < 0.5 ? m * 2 : 2 - m * 2; };

  function shoot(pw) {
    const p = players[cur];
    power = clamp(pw, 0.02, 1);
    const v = MAXV * (0.08 + 0.92 * power);
    lastShot = { x: ball.x, y: ball.y };
    ball.vx = Math.cos(aim) * v; ball.vy = Math.sin(aim) * v; ball.lipped = false;
    p.strokes[holeIx]++;
    phase = 'roll'; phaseT = 0;
    Kit.noise({ dur: 0.05, vol: 0.25, freq: 3200, q: 1.2 });
    Kit.tone(280 + power * 200, { type: 'triangle', dur: 0.08, vol: 0.22, slide: 0.7 });
  }

  function endBall(result) {
    const p = players[cur], h = HOLES[holeIx];
    const S = toS(ball.x, ball.y);
    if (result === 'sunk') {
      phase = 'sinking'; phaseT = 0; sinkAnim = 0;
      const n = p.strokes[holeIx], diff = n - h.par;
      const word = n === 1 ? 'HOLE IN ONE!' : diff <= -2 ? 'Eagle!' : diff === -1 ? 'Birdie!' : diff === 0 ? 'Par' : diff === 1 ? 'Bogey' : `${n} shots`;
      holeMsg = { text: word, color: diff < 0 ? '#ffd23f' : diff === 0 ? '#7dffb0' : '#ffffff' };
      Kit.tone(1046, { type: 'sine', dur: 0.12, vol: 0.18, at: 0.12 });
      [0.02, 0.07, 0.12].forEach((at) => Kit.noise({ dur: 0.04, vol: 0.18, freq: 2200 + Math.random() * 800, q: 3, at }));
      if (diff <= 0) Kit.sfx.chime();
      if (n === 1) { Kit.confetti(140); Kit.shake(8, 0.3); Kit.sfx.win(); }
      Kit.burst(S.x, S.y, p.c, 24, 0.9); Kit.burst(S.x, S.y, '#ffffff', 14, 0.6);
      Kit.float(word, S.x, S.y - L.k * 1.6, { color: holeMsg.color, size: L.u * (n === 1 ? 1.1 : 0.8), life: 1.6, big: n === 1 });
      return;
    }
    if (result === 'water') {
      p.strokes[holeIx]++;
      Kit.noise({ dur: 0.5, vol: 0.3, freq: 900, q: 0.8, sweep: 0.3 });
      Kit.tone(300, { type: 'sine', dur: 0.3, vol: 0.15, slide: 0.4 });
      Kit.burst(S.x, S.y, '#7fd6ff', 22, 0.7);
      Kit.float('Splash! +1', S.x, S.y - L.k, { color: '#7fd6ff', size: L.u * 0.7, life: 1.3 });
      ball.x = lastShot.x; ball.y = lastShot.y; ball.vx = ball.vy = 0;
    }
    if (p.strokes[holeIx] >= sk.maxStrokes) {
      p.strokes[holeIx] = sk.maxStrokes;
      Kit.float(`Max ${sk.maxStrokes} shots`, S.x, S.y - L.k * 1.4, { color: '#ffb3c0', size: L.u * 0.62, life: 1.4 });
      Kit.sfx.nope();
      phase = 'done'; phaseT = 0;
      return;
    }
    phase = 'next'; phaseT = 0;
  }
  function nextPlayer() {
    cur++;
    if (cur >= players.length) { phase = 'card'; phaseT = 0; cardT = 0; return; }
    startTurn();
  }
  function nextHole() {
    if (holeIx + 1 >= HOLES.length) { finish(); return; }
    holeIx++;
    startHole();
  }
  function finish() {
    state = 'over'; stateT = 0; overBtn = 0;
    const best = Math.min(...players.map(totalOf));
    winners = players.map((p, i) => i).filter((i) => totalOf(players[i]) === best);
    const humanWon = winners.some((i) => players[i].human);
    const solo = players.length === 1;
    const counts = humanWon && (!solo || best <= PAR_TOTAL);
    Kit.confetti(170); Kit.shake(6, 0.3);
    if (humanWon || AUTO) Kit.sfx.win(); else Kit.sfx.over();
    if (counts && !AUTO) {
      wins++; Kit.store.set(ID + '.wins', wins); Kit.record(ID, wins);
    }
  }

  // ---------- TV players: try many shots in their head, then play the best one (with some wobble) ----------
  function planAI() {
    const h = HOLES[holeIx];
    const direct = Math.atan2(h.cup[1] - ball.y, h.cup[0] - ball.x);
    const cands = [];
    for (let i = 0; i < 96; i++) cands.push(i * TAU / 96);
    for (let i = -6; i <= 6; i++) cands.push(direct + i * 0.012);
    const pows = [0.08, 0.14, 0.2, 0.27, 0.34, 0.42, 0.5, 0.6, 0.7, 0.82, 0.95];
    const list = [];
    cands.forEach((a) => pows.forEach((p) => list.push([a, p])));
    ai = { list, i: 0, best: null, bestScore: 1e9, start: gclock, fireAt: gclock + 1.3, done: false, target: 0, tpow: 0 };
  }
  function aiScore(r, t) {
    const h = HOLES[holeIx];
    if (r.sunk) return -100 + r.t * 0.1;
    if (r.water) return 200;
    return h.dist(r.x, r.y) + (t || 0);
  }
  function stepAI(dt) {
    if (!ai || ai.done) return;
    const h = HOLES[holeIx];
    const n = Math.min(ai.list.length - ai.i, 34);
    for (let k = 0; k < n; k++) {
      const [a, p] = ai.list[ai.i++];
      const t0 = ai.fireAt + 0.1 + p * sk.meter / 2;
      const r = simulate(h, sk, ball.x, ball.y, a, p, t0);
      const s = aiScore(r);
      if (s < ai.bestScore) { ai.bestScore = s; ai.best = [a, p]; }
    }
    if (ai.i >= ai.list.length) {
      ai.done = true;
      const [a, p] = ai.best || [Math.atan2(h.cup[1] - ball.y, h.cup[0] - ball.x), 0.4];
      const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
      ai.target = a + g() * sk.aiAng;
      ai.tpow = clamp(p * (1 + g() * sk.aiPow), 0.03, 1);
    }
  }

  // ---------- Layout and the baked course picture ----------
  let L = { u: 60, k: 50, ox: 0, oy: 0, hud: 90 };
  const toS = (x, y) => ({ x: L.ox + x * L.k, y: L.oy + y * L.k });
  const course = document.createElement('canvas');
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 32, H / 18);
    const hud = u * 1.75;
    const aw = W - u * 0.6, ah = H - hud - u * 0.45;
    const k = Math.min(aw / 32, ah / 18);
    L = { u, hud, k, ox: (W - 32 * k) / 2, oy: hud + u * 0.15 + (ah - 18 * k) / 2 };
    sprites.clear();
    bakeCourse();
  }
  function layoutHole() { bakeCourse(); }
  Kit.onResize(layout);

  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const key = `${name}|${Math.round(w)}|${Math.round(h)}`;
    let s = sprites.get(key);
    if (s) return s;
    const d = DPR();
    s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w * d)); s.height = Math.max(1, Math.ceil(h * d));
    const c = s.getContext('2d'); c.scale(d, d); draw(c, w, h);
    sprites.set(key, s);
    return s;
  }
  // Seeded random so the scenery stays put.
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function bakeCourse() {
    const W = Kit.W, H = Kit.H;
    if (!W || !H) return;
    const d = DPR();
    course.width = Math.ceil(W * d); course.height = Math.ceil(H * d);
    const c = course.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    const h = HOLES[holeIx] || HOLES[0], k = L.k;
    // Sky-to-park backdrop
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0f4d3a'); g.addColorStop(1, '#06281f');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Lush grass with soft mowing stripes
    const r = rng(holeIx * 977 + 13);
    c.save();
    for (let i = 0; i < 26; i++) {
      c.fillStyle = i % 2 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.04)';
      c.fillRect(i * W / 26, 0, W / 26, H);
    }
    // Flower specks
    for (let i = 0; i < 260; i++) {
      const x = r() * W, y = L.hud + r() * (H - L.hud);
      c.fillStyle = ['rgba(255,214,90,0.5)', 'rgba(255,140,190,0.45)', 'rgba(255,255,255,0.35)', 'rgba(150,255,170,0.25)'][i % 4];
      c.beginPath(); c.arc(x, y, 1.5 + r() * 2.5, 0, TAU); c.fill();
    }
    c.restore();
    // Trees and bushes around the edge (behind the course)
    const trees = [];
    for (let i = 0; i < 34; i++) {
      const x = r() * W, y = L.hud + r() * (H - L.hud);
      const fx = (x - L.ox) / k, fy = (y - L.oy) / k;
      // keep them off the course
      let near = false;
      for (let a = 0; a < 8 && !near; a++) { const ax = fx + Math.cos(a) * 1.6, ay = fy + Math.sin(a) * 1.6; if (inPoly(h.poly, ax, ay)) near = true; }
      if (inPoly(h.poly, fx, fy) || near) continue;
      trees.push({ x, y, s: k * (0.8 + r() * 0.9), hue: r() });
    }
    trees.sort((a, b) => a.y - b.y).forEach((t) => drawTree(c, t.x, t.y, t.s, t.hue));
    // Course: drop shadow, then the green
    c.save();
    c.translate(L.ox, L.oy);
    const path = () => { c.beginPath(); h.poly.forEach((p, i) => (i ? c.lineTo(p[0] * k, p[1] * k) : c.moveTo(p[0] * k, p[1] * k))); c.closePath(); };
    c.save(); c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = k * 0.8; c.shadowOffsetY = k * 0.35; path(); c.fillStyle = '#1b7a3e'; c.fill(); c.restore();
    c.save();
    path(); c.clip();
    const gg = c.createLinearGradient(0, 0, 0, 18 * k);
    gg.addColorStop(0, shade(h.theme, 0.12)); gg.addColorStop(1, shade(h.theme, -0.18));
    c.fillStyle = gg; c.fillRect(0, 0, 32 * k, 18 * k);
    // Mowing stripes, diagonal
    c.save(); c.rotate(-0.5);
    for (let i = -20; i < 50; i++) { c.fillStyle = i % 2 ? 'rgba(255,255,255,0.07)' : 'rgba(0,40,0,0.05)'; c.fillRect(i * k * 1.4, -20 * k, k * 1.4, 60 * k); }
    c.restore();
    // Felt speckle
    for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,50,0,0.07)'; c.fillRect(r() * 32 * k, r() * 18 * k, 2, 2); }
    // Slopes: light at the top of the hill, chevrons pointing downhill
    h.slopes.forEach((s) => {
      const [x, y, w, hh, ax, ay] = s;
      const al = Math.hypot(ax, ay) || 1, ux = ax / al, uy = ay / al;
      const cx = (x + w / 2) * k, cy = (y + hh / 2) * k, ext = Math.max(w, hh) * k / 2;
      const lg = c.createLinearGradient(cx - ux * ext, cy - uy * ext, cx + ux * ext, cy + uy * ext);
      lg.addColorStop(0, 'rgba(255,255,220,0.2)'); lg.addColorStop(1, 'rgba(0,30,10,0.25)');
      c.fillStyle = lg; c.fillRect(x * k, y * k, w * k, hh * k);
      c.save(); c.beginPath(); c.rect(x * k, y * k, w * k, hh * k); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = k * 0.12; c.lineCap = 'round'; c.lineJoin = 'round';
      const step = 1.6;
      for (let gx = x + 0.8; gx < x + w; gx += step) for (let gy = y + 0.8; gy < y + hh; gy += step) {
        const px = gx * k, py = gy * k, s2 = k * 0.35;
        c.beginPath();
        c.moveTo(px - ux * s2 - uy * s2, py - uy * s2 + ux * s2);
        c.lineTo(px, py);
        c.lineTo(px - ux * s2 + uy * s2, py - uy * s2 - ux * s2);
        c.stroke();
      }
      c.restore();
    });
    // Sand
    h.sand.forEach((s) => {
      c.save();
      c.beginPath(); c.ellipse(s[0] * k, s[1] * k, s[2] * k + k * 0.12, s[3] * k + k * 0.12, 0, 0, TAU); c.fillStyle = 'rgba(80,60,20,0.35)'; c.fill();
      c.beginPath(); c.ellipse(s[0] * k, s[1] * k, s[2] * k, s[3] * k, 0, 0, TAU);
      const sg = c.createRadialGradient(s[0] * k - s[2] * k * 0.3, s[1] * k - s[3] * k * 0.4, 0, s[0] * k, s[1] * k, s[2] * k);
      sg.addColorStop(0, '#fff1c4'); sg.addColorStop(1, '#e2bd72');
      c.fillStyle = sg; c.fill(); c.clip();
      for (let i = 0; i < 120; i++) { c.fillStyle = r() < 0.5 ? 'rgba(150,110,40,0.3)' : 'rgba(255,255,255,0.4)'; c.fillRect((s[0] - s[2] + r() * s[2] * 2) * k, (s[1] - s[3] + r() * s[3] * 2) * k, 2, 2); }
      c.restore();
    });
    // Water (ripples are drawn live)
    h.water.forEach((w) => {
      c.beginPath(); c.ellipse(w[0] * k, w[1] * k, w[2] * k + k * 0.25, w[3] * k + k * 0.25, 0, 0, TAU); c.fillStyle = 'rgba(160,140,90,0.85)'; c.fill();
      c.beginPath(); c.ellipse(w[0] * k, w[1] * k, w[2] * k, w[3] * k, 0, 0, TAU);
      const wg = c.createRadialGradient(w[0] * k, w[1] * k - w[3] * k * 0.3, 0, w[0] * k, w[1] * k, w[2] * k);
      wg.addColorStop(0, '#5fd3ff'); wg.addColorStop(0.7, '#1d8fd6'); wg.addColorStop(1, '#0b5aa0');
      c.fillStyle = wg; c.fill();
      // lily pads
      for (let i = 0; i < 4; i++) {
        const a = r() * TAU, rr = 0.55 + r() * 0.3;
        const lx = (w[0] + Math.cos(a) * w[2] * rr) * k, ly = (w[1] + Math.sin(a) * w[3] * rr) * k, ls = k * (0.35 + r() * 0.2);
        c.beginPath(); c.moveTo(lx, ly); c.arc(lx, ly, ls, 0.3 + a, TAU - 0.3 + a); c.closePath();
        c.fillStyle = '#3fae4a'; c.fill(); c.strokeStyle = '#2a7f33'; c.lineWidth = 1.5; c.stroke();
        if (i === 0) { c.fillStyle = '#ff8fc8'; c.beginPath(); c.arc(lx, ly, ls * 0.35, 0, TAU); c.fill(); }
      }
    });
    // Inner shadow along the rails
    c.save(); path(); c.lineWidth = k * 0.9; c.strokeStyle = 'rgba(0,40,10,0.22)'; c.stroke(); c.restore();
    c.restore();
    // Tee mat
    const tx = h.tee[0] * k, ty = h.tee[1] * k;
    c.save(); c.translate(tx, ty);
    roundRect(c, -k * 0.75, -k * 0.75, k * 1.5, k * 1.5, k * 0.3);
    c.fillStyle = '#145c2c'; c.fill();
    roundRect(c, -k * 0.62, -k * 0.62, k * 1.24, k * 1.24, k * 0.24);
    c.fillStyle = '#0e4a22'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(0, 0, k * 0.12, 0, TAU); c.fill();
    c.restore();
    // Cup with a sunken lip
    const cx = h.cup[0] * k, cy = h.cup[1] * k, cr = CUP_R * k;
    c.beginPath(); c.arc(cx, cy, cr * 1.35, 0, TAU); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fill();
    c.beginPath(); c.arc(cx, cy, cr, 0, TAU);
    const cg = c.createRadialGradient(cx, cy + cr * 0.35, cr * 0.1, cx, cy, cr);
    cg.addColorStop(0, '#000'); cg.addColorStop(0.75, '#101a12'); cg.addColorStop(1, '#3a4a3c');
    c.fillStyle = cg; c.fill();
    c.lineWidth = k * 0.07; c.strokeStyle = '#e8f2ea'; c.stroke();
    // Bumpers' bases (the glossy caps are live)
    h.bumpers.forEach((b) => {
      c.beginPath(); c.ellipse(b[0] * k + k * 0.18, b[1] * k + k * 0.22, b[2] * k * 1.05, b[2] * k * 0.95, 0, 0, TAU);
      c.fillStyle = 'rgba(0,30,10,0.35)'; c.fill();
    });
    // Rails: shadow, extruded side, then the lit top
    const rails = h.segs.filter((s) => !s.block);
    const strokeRails = (dx, dy, w, col) => {
      c.lineWidth = w; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      h.poly.forEach((p, i) => (i ? c.lineTo(p[0] * k + dx, p[1] * k + dy) : c.moveTo(p[0] * k + dx, p[1] * k + dy)));
      c.closePath(); c.stroke();
      rails.filter((s) => s.inner).forEach((s) => { c.beginPath(); c.moveTo(s.x1 * k + dx, s.y1 * k + dy); c.lineTo(s.x2 * k + dx, s.y2 * k + dy); c.stroke(); });
    };
    const rw = RAIL * 2 * k, rh = k * 0.42;
    strokeRails(k * 0.25, k * 0.3, rw + k * 0.15, 'rgba(0,25,10,0.45)');
    for (let i = 0; i <= 6; i++) strokeRails(0, -rh * i / 6 + rh * 0.3, rw, i < 6 ? '#8a4b23' : '#8a4b23');
    strokeRails(0, -rh * 0.7, rw, '#c9773a');
    strokeRails(0, -rh * 0.7, rw * 0.72, '#e8994f');
    strokeRails(-k * 0.04, -rh * 0.7 - k * 0.07, rw * 0.22, 'rgba(255,230,190,0.6)');
    // Windmill building (blades are live)
    if (h.mill) drawMillHouse(c, h.mill, k);
    if (h.gate) {
      const g = h.gate;
      [g.y0, g.y1].forEach((y) => {
        c.beginPath(); c.arc(g.x * k, y * k - k * 0.3, k * 0.42, 0, TAU);
        const pg = c.createRadialGradient(g.x * k - k * 0.12, y * k - k * 0.42, 0, g.x * k, y * k - k * 0.3, k * 0.42);
        pg.addColorStop(0, '#fff3c0'); pg.addColorStop(1, '#d9862c');
        c.fillStyle = pg; c.fill(); c.strokeStyle = '#7a4416'; c.lineWidth = 2; c.stroke();
      });
    }
    c.restore();
  }
  function drawTree(c, x, y, s, hue) {
    c.save();
    c.fillStyle = 'rgba(0,20,10,0.4)';
    c.beginPath(); c.ellipse(x + s * 0.25, y + s * 0.3, s * 0.85, s * 0.5, 0, 0, TAU); c.fill();
    const col = hue < 0.33 ? '#2f9e4a' : hue < 0.66 ? '#3fb56a' : '#58a83a';
    for (let i = 0; i < 3; i++) {
      const ox = [-0.3, 0.3, 0][i] * s, oy = [0.05, 0.05, -0.3][i] * s, r = s * [0.5, 0.48, 0.55][i];
      const g = c.createRadialGradient(x + ox - r * 0.35, y + oy - r * 0.4, r * 0.1, x + ox, y + oy, r);
      g.addColorStop(0, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.35));
      c.fillStyle = g; c.beginPath(); c.arc(x + ox, y + oy, r, 0, TAU); c.fill();
    }
    if (hue > 0.8) { c.fillStyle = '#ff6f91'; for (let i = 0; i < 5; i++) { c.beginPath(); c.arc(x + Math.cos(i * 2.4) * s * 0.4, y - s * 0.1 + Math.sin(i * 2.4) * s * 0.3, s * 0.07, 0, TAU); c.fill(); } }
    c.restore();
  }
  function drawMillHouse(c, m, k) {
    const x0 = (m.x - m.w / 2) * k, x1 = (m.x + m.w / 2) * k, y0 = (m.y - m.d / 2) * k, y1 = (m.y + m.d / 2) * k;
    const hh = k * 1.4, g0 = (m.x - m.gap / 2) * k, g1 = (m.x + m.gap / 2) * k;
    c.save();
    c.fillStyle = 'rgba(0,25,10,0.45)'; c.fillRect(x0 + k * 0.3, y0 + k * 0.3, x1 - x0, y1 - y0);
    // front wall (south face), with the tunnel arch
    c.beginPath();
    c.moveTo(x0, y1); c.lineTo(g0, y1); c.lineTo(g0, y1 - hh * 0.45);
    c.arc((g0 + g1) / 2, y1 - hh * 0.45, (g1 - g0) / 2, Math.PI, 0);
    c.lineTo(g1, y1); c.lineTo(x1, y1); c.lineTo(x1, y1 - hh); c.lineTo(x0, y1 - hh); c.closePath();
    const fg = c.createLinearGradient(0, y1 - hh, 0, y1);
    fg.addColorStop(0, '#ffe2b8'); fg.addColorStop(1, '#e09a5a');
    c.fillStyle = fg; c.fill(); c.strokeStyle = '#8a4b23'; c.lineWidth = 2; c.stroke();
    // bricks
    c.strokeStyle = 'rgba(138,75,35,0.25)'; c.lineWidth = 1;
    for (let yy = y1 - hh + k * 0.28; yy < y1; yy += k * 0.28) { c.beginPath(); c.moveTo(x0, yy); c.lineTo(x1, yy); c.stroke(); }
    // roof (top face) going back
    c.beginPath(); c.moveTo(x0, y1 - hh); c.lineTo(x1, y1 - hh); c.lineTo(x1 - k * 0.3, y0 - hh); c.lineTo(x0 + k * 0.3, y0 - hh); c.closePath();
    const rg = c.createLinearGradient(0, y0 - hh, 0, y1 - hh);
    rg.addColorStop(0, '#ff6b6b'); rg.addColorStop(1, '#c0392b');
    c.fillStyle = rg; c.fill(); c.strokeStyle = '#7a1f1f'; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.25)';
    for (let xx = x0 + k * 0.5; xx < x1; xx += k * 0.5) { c.beginPath(); c.moveTo(xx, y1 - hh); c.lineTo(xx + (m.x * k - xx) * 0.03, y0 - hh); c.stroke(); }
    // tunnel shadow
    c.fillStyle = 'rgba(20,10,5,0.75)';
    c.beginPath(); c.moveTo(g0 + 2, y1); c.lineTo(g0 + 2, y1 - hh * 0.45); c.arc((g0 + g1) / 2, y1 - hh * 0.45, (g1 - g0) / 2 - 2, Math.PI, 0); c.lineTo(g1 - 2, y1); c.closePath(); c.fill();
    // windows
    [x0 + (g0 - x0) * 0.5, g1 + (x1 - g1) * 0.5].forEach((wx) => {
      roundRect(c, wx - k * 0.35, y1 - hh * 0.75, k * 0.7, k * 0.5, k * 0.12);
      c.fillStyle = '#7fd6ff'; c.fill(); c.strokeStyle = '#8a4b23'; c.lineWidth = 2; c.stroke();
    });
    c.restore();
  }

  // Glossy balls, cached per colour and size
  const ballSprite = (col, s) => sprite('ball' + col, s, s, (c) => {
    const r = s / 2;
    const g = c.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, shade(col, 0.35)); g.addColorStop(1, shade(col, -0.45));
    c.fillStyle = g; c.beginPath(); c.arc(r, r, r * 0.96, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let i = 0; i < 9; i++) { const a = i * 0.7, rr = r * (0.3 + (i % 3) * 0.2); c.beginPath(); c.arc(r + Math.cos(a) * rr, r + Math.sin(a) * rr, r * 0.07, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(r * 0.68, r * 0.55, r * 0.26, r * 0.17, -0.6, 0, TAU); c.fill();
  });
  const bumperSprite = (s, hot) => sprite('bump' + (hot ? 1 : 0), s, s, (c) => {
    const r = s / 2;
    const g = c.createRadialGradient(r * 0.7, r * 0.55, r * 0.05, r, r, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, hot ? '#ffe36b' : '#ff7ab8'); g.addColorStop(1, hot ? '#ff8a00' : '#b0216a');
    c.fillStyle = g; c.beginPath(); c.arc(r, r, r * 0.97, 0, TAU); c.fill();
    c.lineWidth = r * 0.14; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.arc(r, r, r * 0.66, 0, TAU); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(r * 0.65, r * 0.5, r * 0.28, r * 0.16, -0.6, 0, TAU); c.fill();
  });

  // ---------- Input ----------
  function menuRows() { return ['people', 'tv', 'skill', 'play']; }
  function menuKey(k) {
    const rows = menuRows();
    if (k === 'up') menuRow = (menuRow + rows.length - 1) % rows.length;
    else if (k === 'down') menuRow = (menuRow + 1) % rows.length;
    else if (k === 'ok') { start(); return; }
    else if (k === 'left' || k === 'right') {
      const d = k === 'left' ? -1 : 1, r = rows[menuRow];
      if (r === 'people') { const b = people; people = clamp(people + d, 1, 4); fixTv(); if (b === people) { Kit.sfx.nope(); return; } }
      else if (r === 'tv') { const b = tvs; tvs = clamp(tvs + d, 0, 4 - people); if (b === tvs) { Kit.sfx.nope(); return; } }
      else if (r === 'skill') { const b = skill; skill = clamp(skill + d, 0, SKILLS.length - 1); if (b === skill) { Kit.sfx.nope(); return; } Kit.store.set(ID + '.skill', skill); }
      else return;
    } else return;
    Kit.sfx.move();
  }
  function start() {
    if (!AUTO) Kit.store.set(ID + '.setup', { people, tv: tvs });
    state = 'play'; stateT = 0; gclock = 0;
    newGame();
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
  }
  function toMenu() { state = 'menu'; stateT = 0; menuRow = 0; holeIx = 0; bakeCourse(); }

  function playKey(k, rep) {
    if (phase === 'intro') { if (k === 'ok' && phaseT > 0.4) { phaseT = 99; } return; }
    if (phase === 'card') { if (k === 'ok' && phaseT > 0.6) phaseT = 99; return; }
    if (!human(cur)) return;
    if (phase === 'banner') { if (k === 'ok' && phaseT > 0.35) phaseT = 99; return; }
    if (phase === 'aim') {
      const step = rep ? 0.045 : 0.03;
      if (k === 'left') aim -= step;
      else if (k === 'right') aim += step;
      else if (k === 'up') aim -= 0.006;
      else if (k === 'down') aim += 0.006;
      else if (k === 'ok') { startMeter(); return; }
      if (!rep && k !== 'ok') Kit.tone(820, { type: 'triangle', dur: 0.025, vol: 0.05 });
      return;
    }
    if (phase === 'meter' && k === 'ok' && meterT > 0.08) shoot(meterVal());
  }
  Kit.onKeys((k, rep) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { if (!rep) menuKey(k); return; }
    if (state === 'over') {
      if (stateT < 1.2 || rep) return;
      if (k === 'left' || k === 'right') { overBtn = 1 - overBtn; Kit.sfx.move(); }
      else if (k === 'ok') { if (overBtn === 0) start(); else { Kit.sfx.move(); toMenu(); } }
      return;
    }
    playKey(k, rep);
  });
  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  let hits = [];
  Kit.onPointer({
    down(e) {
      const hit = hits.find((r) => inside(e, r));
      if (state === 'menu') {
        if (!hit) return;
        if (hit.act === 'play') start();
        else if (hit.act === 'people') { people = hit.v; fixTv(); Kit.sfx.move(); }
        else if (hit.act === 'tv') { if (hit.v <= 4 - people) { tvs = hit.v; Kit.sfx.move(); } else Kit.sfx.nope(); }
        else if (hit.act === 'skill') { skill = hit.v; Kit.store.set(ID + '.skill', skill); Kit.sfx.move(); }
        return;
      }
      if (state === 'over') {
        if (stateT < 1.2) return;
        if (hit && hit.act === 'menu') toMenu(); else start();
        return;
      }
      if (phase === 'aim' && human(cur)) {
        // Tap the course to aim there, tap the ball to start the meter.
        const b = toS(ball.x, ball.y);
        if (Math.hypot(e.x - b.x, e.y - b.y) < L.k * 1.2) startMeter();
        else aim = Math.atan2(e.y - b.y, e.x - b.x);
        return;
      }
      playKey('ok', false);
    },
  });

  // ---------- Update ----------
  function update(dt) {
    if (document.hidden) return;
    for (let i = 0; i < SPEED; i++) step(dt);
  }
  function step(dt) {
    clock += dt; stateT += dt;
    if (state === 'menu') {
      gclock += dt;
      if (AUTO && stateT > 1) start();
      return;
    }
    if (state === 'over') {
      if (stateT > 1 && Math.random() < dt * 0.6) Kit.confetti(30);
      if (AUTO && stateT > 3) start();
      return;
    }
    gclock += dt; phaseT += dt; bannerT += dt;
    bumpGlow = bumpGlow.map((v) => Math.max(0, v - dt * 3));
    const h = HOLES[holeIx];
    if (phase === 'intro') { if (phaseT > 2.2) startTurn(); return; }
    if (phase === 'banner') { if (phaseT > (human(cur) ? 1.6 : 1.1)) toAim(); return; }
    if (phase === 'aim') {
      if (!human(cur)) {
        stepAI(dt);
        if (ai && ai.done) {
          // turn smoothly towards the chosen line
          let d = ai.target - aim; d = Math.atan2(Math.sin(d), Math.cos(d));
          aim += d * Math.min(1, dt * 6);
          if (gclock >= ai.fireAt && Math.abs(d) < 0.01) { aim = ai.target; startMeter(); }
        }
      }
      updateGuide(dt);
      return;
    }
    if (phase === 'meter') {
      meterT += dt;
      const v = meterVal();
      if (!human(cur) && ai && meterT < sk.meter / 2 + 0.02 && v >= ai.tpow) shoot(ai.tpow);
      else if (!human(cur) && meterT > sk.meter * 3) shoot(v);
      updateGuide(dt);
      return;
    }
    if (phase === 'roll') {
      const ev = [];
      const r = advance(ball, h, sk, dt, gclock, ev);
      ev.forEach((e) => {
        if (e.k === 'wall') { Kit.tone(180 + Math.min(e.v, 20) * 8, { type: 'triangle', dur: 0.06, vol: clamp(e.v / 30, 0.04, 0.22) }); Kit.noise({ dur: 0.03, vol: clamp(e.v / 40, 0.03, 0.15), freq: 900, q: 1 }); }
        else if (e.k === 'bump') { bumpGlow[e.i] = 1; Kit.tone(520, { type: 'sine', dur: 0.18, vol: 0.2, slide: 1.8 }); const u = h.bumpers[e.i], s = toS(u[0], u[1]); Kit.burst(s.x, s.y, '#ff9fd0', 8, 0.4); }
        else if (e.k === 'lip') { Kit.tone(900, { type: 'triangle', dur: 0.05, vol: 0.12 }); Kit.float('Too fast!', toS(ball.x, ball.y).x, toS(ball.x, ball.y).y - L.k, { color: '#ffe36b', size: L.u * 0.5, life: 0.9 }); }
      });
      if (r) { endBall(r); return; }
      if ((ball.vx === 0 && ball.vy === 0) || phaseT > 14) { ball.vx = ball.vy = 0; endBall(null); }
      return;
    }
    if (phase === 'sinking') { sinkAnim = Math.min(1, phaseT / 0.35); if (phaseT > 1.5) nextPlayer(); return; }
    if (phase === 'next') { if (phaseT > 0.35) { phase = 'aim'; phaseT = 0; if (!human(cur)) planAI(); } return; }
    if (phase === 'done') { if (phaseT > 1.4) nextPlayer(); return; }
    if (phase === 'card') { if (phaseT > (players.some((p) => p.human) ? 4.5 : 3)) nextHole(); }
  }
  // Beginner: show where the ball will roll at the meter's power (or a medium putt while aiming).
  function updateGuide(dt) {
    guideT -= dt;
    if (sk.guide || !human(cur)) { guidePath = []; return; }
    if (guideT > 0) return;
    guideT = 0.05;
    const p = phase === 'meter' ? Math.max(0.05, meterVal()) : 0.45;
    guidePath = [];
    const h = HOLES[holeIx];
    const res = simulate(h, sk, ball.x, ball.y, aim, p, gclock + (phase === 'meter' ? 0 : 0.6), guidePath);
    guidePath.res = res;
  }

  // ---------- Drawing ----------
  function text(c, s, x, y, size, color, weight = 700, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(s, x, y);
  }
  function fitSize(c, s, size, maxW, weight = 700, font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    const w = c.measureText(s).width;
    return w > maxW ? size * maxW / w : size;
  }
  function outlined(c, s, x, y, size, top, bottom, align = 'center') {
    c.font = `700 ${Math.round(size)}px ${Kit.FONT}`;
    c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(8,24,18,0.92)'; c.strokeText(s, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(s, x, y);
  }
  function panel(c, x, y, w, h, r, border, top, bottom) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)'; c.shadowBlur = 20; c.shadowOffsetY = 8;
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.restore();
    roundRect(c, x, y, w, h, r);
    c.lineWidth = Math.max(2, L.u * 0.05); c.strokeStyle = border; c.stroke();
  }

  function drawLive(c, t) {
    const h = HOLES[holeIx], k = L.k;
    c.save(); c.translate(L.ox, L.oy);
    // Water glints
    h.water.forEach((w, wi) => {
      c.save(); c.beginPath(); c.ellipse(w[0] * k, w[1] * k, w[2] * k, w[3] * k, 0, 0, TAU); c.clip();
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
      for (let i = 0; i < 5; i++) {
        const ph = (t * 0.35 + i / 5 + wi * 0.3) % 1;
        c.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
        c.beginPath(); c.ellipse(w[0] * k + Math.cos(i * 2.1) * w[2] * k * 0.5, w[1] * k + Math.sin(i * 1.7) * w[3] * k * 0.5, ph * k * 1.2, ph * k * 0.5, 0, 0, TAU); c.stroke();
      }
      c.restore();
    });
    // Bumpers
    h.bumpers.forEach((b, i) => {
      const g = bumpGlow[i] || 0, s = b[2] * 2 * k * (1 + g * 0.15);
      c.drawImage(bumperSprite(Math.round(b[2] * 2 * k), g > 0.3), b[0] * k - s / 2, b[1] * k - s / 2 - k * 0.15, s, s);
    });
    // Sliding gate
    if (h.gate) {
      const g = h.gate, yc = gateY(g, gclock), x = g.x * k, y0 = (yc - g.len / 2) * k, y1 = (yc + g.len / 2) * k, w = 0.32 * 2 * k, hh = k * 0.5;
      c.fillStyle = 'rgba(0,25,10,0.4)'; roundRect(c, x - w / 2 + k * 0.2, y0 + k * 0.25, w, y1 - y0, w / 2); c.fill();
      roundRect(c, x - w / 2, y0 - hh, w, y1 - y0 + hh, w / 2); c.fillStyle = '#5a2a8a'; c.fill();
      roundRect(c, x - w / 2, y0 - hh, w, y1 - y0, w / 2);
      const gg = c.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
      gg.addColorStop(0, '#c58bff'); gg.addColorStop(1, '#7d3fd1');
      c.fillStyle = gg; c.fill();
      c.save(); c.clip();
      c.fillStyle = 'rgba(255,230,90,0.85)';
      for (let yy = y0 - hh; yy < y1; yy += k * 0.5) { c.beginPath(); c.moveTo(x - w, yy); c.lineTo(x + w, yy + k * 0.35); c.lineTo(x + w, yy + k * 0.55); c.lineTo(x - w, yy + k * 0.2); c.fill(); }
      c.restore();
    }
    // Ball (below the windmill blades)
    if (ball && state === 'play' && phase !== 'intro' && phase !== 'card') drawBall(c, t);
    // Windmill blades
    if (h.mill) {
      const m = h.mill, cx = m.x * k, cy = (m.y + m.d / 2) * k - k * 1.4 * 1.05, a = millAngle(m, gclock), len = k * 2.4;
      c.save(); c.translate(cx, cy);
      for (let i = 0; i < 4; i++) {
        c.save(); c.rotate(a + i * Math.PI / 2);
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(k * 0.1, -k * 0.05, len, k * 0.5);
        c.fillStyle = '#7a4416'; c.fillRect(0, -k * 0.07, len, k * 0.14);
        roundRect(c, len * 0.3, -k * 0.34, len * 0.7, k * 0.62, k * 0.1);
        c.fillStyle = i % 2 ? '#ffffff' : '#ffd23f'; c.fill(); c.strokeStyle = '#7a4416'; c.lineWidth = 2; c.stroke();
        c.strokeStyle = 'rgba(122,68,22,0.5)'; c.lineWidth = 1;
        for (let j = 1; j < 4; j++) { c.beginPath(); c.moveTo(len * 0.3 + len * 0.7 * j / 4, -k * 0.34); c.lineTo(len * 0.3 + len * 0.7 * j / 4, k * 0.28); c.stroke(); }
        c.restore();
      }
      const hg = c.createRadialGradient(-k * 0.08, -k * 0.08, 0, 0, 0, k * 0.3);
      hg.addColorStop(0, '#fff3c0'); hg.addColorStop(1, '#b8691f');
      c.fillStyle = hg; c.beginPath(); c.arc(0, 0, k * 0.3, 0, TAU); c.fill();
      c.restore();
    }
    // Flag (in the playing colour), leans away while a ball is close
    const p = players[cur];
    const col = p && state === 'play' ? p.c : '#ff4d6d';
    let lean = 0;
    if (ball && state === 'play') { const d = Math.hypot(ball.x - h.cup[0], ball.y - h.cup[1]); lean = clamp(1 - d / 3, 0, 1); }
    if (!(phase === 'sinking' && state === 'play')) {
      const fx = h.cup[0] * k + lean * k * 0.6, fy = h.cup[1] * k, ph = k * 2.6;
      c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = k * 0.1; c.beginPath(); c.moveTo(h.cup[0] * k, fy); c.lineTo(h.cup[0] * k + ph * 0.55, fy + ph * 0.25); c.stroke();
      c.strokeStyle = '#f2f2f2'; c.lineWidth = k * 0.09; c.lineCap = 'round';
      c.beginPath(); c.moveTo(h.cup[0] * k, fy); c.lineTo(fx, fy - ph); c.stroke();
      c.beginPath(); c.moveTo(fx, fy - ph);
      for (let i = 0; i <= 8; i++) { const u = i / 8; c.lineTo(fx + u * k * 1.5, fy - ph + k * 0.05 + Math.sin(t * 6 - u * 4) * k * 0.12 * u); }
      for (let i = 8; i >= 0; i--) { const u = i / 8; c.lineTo(fx + u * k * 1.5 * (1 - u * 0.4) + 0, fy - ph + k * 0.9 - u * k * 0.42 + Math.sin(t * 6 - u * 4) * k * 0.12 * u); }
      c.closePath();
      c.fillStyle = col; c.fill(); c.strokeStyle = shade(col, -0.4); c.lineWidth = 2; c.stroke();
      text(c, String(holeIx + 1), fx + k * 0.55, fy - ph + k * 0.42, k * 0.5, '#ffffff', 800, 'center', Kit.FONT);
    }
    c.restore();
  }

  function drawBall(c, t) {
    const k = L.k, p = players[cur];
    const x = ball.x * k, y = ball.y * k;
    const showAim = (phase === 'aim' || phase === 'meter' || phase === 'banner') && phase !== 'roll';
    if (showAim && phase !== 'banner') drawAim(c, t, x, y);
    let s = BR * 2.6 * k, a = 1;
    if (phase === 'sinking') { const h = HOLES[holeIx]; const e = ease.out(sinkAnim); s *= 1 - e * 0.45; a = 1 - e * 0.85; }
    let dx = x, dy = y;
    if (phase === 'sinking') { const h = HOLES[holeIx]; dx = lerp(x, h.cup[0] * k, sinkAnim); dy = lerp(y, h.cup[1] * k, sinkAnim); }
    c.globalAlpha = a;
    c.fillStyle = 'rgba(0,25,10,0.4)'; c.beginPath(); c.ellipse(dx + k * 0.08, dy + k * 0.12, s * 0.5, s * 0.36, 0, 0, TAU); c.fill();
    if (showAim && human(cur)) {
      const pulse = 1 + Math.sin(t * 6) * 0.15;
      c.strokeStyle = rgba(p.c, 0.8); c.lineWidth = 3; c.beginPath(); c.arc(dx, dy, s * 0.95 * pulse, 0, TAU); c.stroke();
    }
    c.drawImage(ballSprite(p.c, Math.round(s)), dx - s / 2, dy - s / 2, s, s);
    c.globalAlpha = 1;
  }

  function drawAim(c, t, x, y) {
    const k = L.k, p = players[cur];
    const ux = Math.cos(aim), uy = Math.sin(aim);
    c.save();
    if (!sk.guide && human(cur) && guidePath.length > 1) {
      // Long guide: dotted path with bounces
      const n = guidePath.length;
      for (let i = 1; i < n; i++) {
        const [gx, gy] = guidePath[i];
        const f = 1 - i / (n + 2);
        c.globalAlpha = 0.25 + f * 0.7;
        c.fillStyle = i === n - 1 ? (guidePath.res && guidePath.res.sunk ? '#ffd23f' : guidePath.res && guidePath.res.water ? '#7fd6ff' : '#ffffff') : '#ffffff';
        c.beginPath(); c.arc(gx * k, gy * k, k * (i === n - 1 ? 0.2 : 0.11), 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
      if (guidePath.res && guidePath.res.sunk) text(c, 'In!', guidePath[n - 1][0] * k, guidePath[n - 1][1] * k - k * 0.7, k * 0.55, '#ffd23f', 800);
    } else {
      const len = (sk.guide || 5) * k;
      const off = (t * 2) % 1;
      for (let d = 0.7 + off * 0.5; d * k < len; d += 0.5) {
        c.globalAlpha = 1 - (d * k) / len;
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(x + ux * d * k, y + uy * d * k, k * 0.11, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
    // Arrow head next to the ball
    c.translate(x, y); c.rotate(aim);
    c.fillStyle = p.c; c.strokeStyle = '#ffffff'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(k * 0.55, -k * 0.28); c.lineTo(k * 1.05, 0); c.lineTo(k * 0.55, k * 0.28); c.closePath(); c.fill(); c.stroke();
    c.restore();
  }

  function drawMeter(c, t) {
    if (state !== 'play' || !(phase === 'meter' || (phase === 'aim' && human(cur)))) return;
    const k = L.k, b = toS(ball.x, ball.y);
    const mh = k * 4.4, mw = k * 0.75;
    // Behind the ball, away from the aim line
    const bx = b.x - Math.cos(aim) * k * 2.2, by = b.y - Math.sin(aim) * k * 2.2;
    const mx = clamp(bx - mw / 2, 12, Kit.W - mw - 12);
    const my = clamp(by - mh / 2, L.hud + 8, Kit.H - mh - k * 1.1);
    const v = phase === 'meter' ? meterVal() : 0;
    c.save();
    c.globalAlpha = phase === 'meter' ? 1 : 0.55;
    roundRect(c, mx - 4, my - 4, mw + 8, mh + 8, mw / 2 + 4); c.fillStyle = 'rgba(10,20,30,0.75)'; c.fill();
    roundRect(c, mx, my, mw, mh, mw / 2); c.save(); c.clip();
    const g = c.createLinearGradient(0, my + mh, 0, my);
    g.addColorStop(0, '#2ed573'); g.addColorStop(0.55, '#ffd23f'); g.addColorStop(1, '#ff3b5c');
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(mx, my, mw, mh);
    c.fillStyle = g; c.fillRect(mx, my + mh * (1 - v), mw, mh * v);
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(mx + mw * 0.15, my, mw * 0.18, mh);
    c.restore();
    c.strokeStyle = '#ffffff'; c.lineWidth = 3; roundRect(c, mx, my, mw, mh, mw / 2); c.stroke();
    if (phase === 'meter') {
      const ny = my + mh * (1 - v);
      c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(mx - 10, ny - 9); c.lineTo(mx - 1, ny); c.lineTo(mx - 10, ny + 9); c.fill();
    }
    text(c, phase === 'meter' ? `${Math.round(v * 100)}%` : 'OK', mx + mw / 2, my + mh + k * 0.55, k * 0.5, '#ffffff', 800, 'center', Kit.FONT);
    c.restore();
  }

  function drawHud(c, t) {
    const W = Kit.W, u = L.u, hh = L.hud, h = HOLES[holeIx];
    const g = c.createLinearGradient(0, 0, 0, hh);
    g.addColorStop(0, 'rgba(4,30,22,0.92)'); g.addColorStop(1, 'rgba(4,30,22,0.7)');
    c.fillStyle = g; c.fillRect(0, 0, W, hh);
    c.fillStyle = 'rgba(255,255,255,0.15)'; c.fillRect(0, hh - 2, W, 2);
    // Hole info
    outlined(c, `Hole ${holeIx + 1}`, u * 0.5, hh * 0.36, u * 0.7, '#ffffff', '#b7ffd0', 'left');
    text(c, `${h.name} · Par ${h.par}`, u * 0.5, hh * 0.75, u * 0.42, 'rgba(255,255,255,0.85)', 700, 'left');
    // Player chips
    const n = players.length, cw = Math.min(u * 6.2, (W - u * 8.5) / Math.max(1, n) - u * 0.25), ch = hh * 0.78;
    const x0 = W - u * 0.4 - n * (cw + u * 0.25) + u * 0.25;
    players.forEach((p, i) => {
      const x = x0 + i * (cw + u * 0.25), y = (hh - ch) / 2, on = i === cur && state === 'play';
      panel(c, x, y, cw, ch, ch * 0.3, on ? '#ffffff' : 'rgba(255,255,255,0.2)', on ? shade(p.c, -0.1) : 'rgba(20,60,45,0.9)', on ? shade(p.c, -0.5) : 'rgba(10,35,28,0.9)');
      const bs = ch * 0.5;
      c.drawImage(ballSprite(p.c, Math.round(bs)), x + ch * 0.18, y + ch / 2 - bs / 2, bs, bs);
      const nm = p.name + (p.human ? '' : ' 📺');
      text(c, nm, x + ch * 0.8, y + ch * 0.32, fitSize(c, nm, ch * 0.32, cw * 0.5, 800), '#ffffff', 800, 'left');
      const tot = totalOf(p), vs = tot - parSoFar(p);
      text(c, `Total ${tot}  (${vs > 0 ? '+' : ''}${vs === 0 ? 'E' : vs})`, x + ch * 0.8, y + ch * 0.7, ch * 0.24, 'rgba(255,255,255,0.8)', 700, 'left');
      const sNow = p.strokes[holeIx];
      text(c, sNow == null ? '–' : String(sNow), x + cw - ch * 0.35, y + ch / 2, ch * 0.5, on ? '#ffffff' : 'rgba(255,255,255,0.7)', 800, 'center', Kit.FONT);
    });
  }

  function drawBanner(c, t) {
    if (state !== 'play') return;
    const W = Kit.W, H = Kit.H, u = L.u;
    if (phase === 'intro') {
      const h = HOLES[holeIx], k = phaseT;
      const a = clamp(k / 0.3, 0, 1) * (1 - clamp((k - 1.9) / 0.3, 0, 1));
      c.save(); c.globalAlpha = a;
      c.fillStyle = 'rgba(2,20,14,0.5)'; c.fillRect(0, 0, W, H);
      c.translate(W / 2, H / 2); const s = ease.back(clamp(k / 0.4, 0, 1)); c.scale(s, s);
      panel(c, -u * 8, -u * 2.6, u * 16, u * 5.2, u * 0.7, '#ffd23f', '#1f8a55', '#0b4a2e');
      outlined(c, `Hole ${holeIx + 1} of ${HOLES.length}`, 0, -u * 1.3, u * 1.2, '#ffffff', '#c9ffd9');
      outlined(c, h.name, 0, u * 0.2, u * 0.95, '#fff6c2', '#ffb703');
      text(c, `Par ${h.par}${h.mill ? ' · watch the windmill!' : h.gate ? ' · time the gate!' : h.water.length ? ' · mind the water!' : ''}`, 0, u * 1.5, u * 0.55, 'rgba(255,255,255,0.9)', 700);
      c.restore();
      return;
    }
    if (phase === 'banner' || bannerT < 1.4) {
      const p = players[cur], k = bannerT;
      const inK = ease.back(clamp(k / 0.3, 0, 1)), outK = phase === 'banner' ? 0 : clamp((k - 1.1) / 0.3, 0, 1);
      const w = Math.min(W * 0.7, u * 15), hh = u * 1.9;
      c.save();
      c.globalAlpha = 1 - outK;
      c.translate(W / 2 + (1 - inK) * -W * 0.6, L.hud + u * 1.7);
      roundRect(c, -w / 2, -hh / 2, w, hh, hh * 0.35);
      const g = c.createLinearGradient(0, -hh / 2, 0, hh / 2);
      g.addColorStop(0, shade(p.c, 0.25)); g.addColorStop(1, shade(p.c, -0.35));
      c.fillStyle = g; c.fill(); c.lineWidth = u * 0.08; c.strokeStyle = '#ffffff'; c.stroke();
      const bs = hh * 0.62;
      c.drawImage(ballSprite(p.c, Math.round(bs)), -w / 2 + hh * 0.3, -bs / 2, bs, bs);
      const label = p.human ? (p.name === 'You' ? 'Your turn!' : `${p.name}'s turn!`) : `${p.name} is playing`;
      outlined(c, label, hh * 0.3, -hh * 0.08, fitSize(c, label, hh * 0.5, w - hh * 1.6, 700, Kit.FONT), '#ffffff', '#fff1b8');
      if (p.human && phase === 'banner') text(c, 'Press OK', hh * 0.3, hh * 0.32, hh * 0.2, 'rgba(255,255,255,0.85)', 700);
      c.restore();
    }
  }

  function drawHelp(c, t) {
    if (state !== 'play') return;
    const W = Kit.W, H = Kit.H, u = L.u;
    let msg = '';
    if (human(cur)) {
      if (phase === 'aim') msg = Kit.touchFirst() ? 'Tap to aim · tap the ball to start the meter' : '◀ ▶ aim  ·  ▲ ▼ fine aim  ·  OK power meter';
      else if (phase === 'meter') msg = Kit.touchFirst() ? 'Tap to putt!' : 'OK to putt!';
    } else if (phase === 'aim' || phase === 'meter') msg = `${players[cur].name} is lining up a shot…`;
    if (!msg) return;
    c.font = `800 ${Math.round(u * 0.46)}px ${Kit.UI}`;
    const w = c.measureText(msg).width + u * 1.2, hh = u * 0.85;
    const x = W / 2 - w / 2, y = H - hh - u * 0.25;
    c.globalAlpha = phase === 'meter' ? 0.85 + Math.sin(t * 8) * 0.15 : 0.92;
    roundRect(c, x, y, w, hh, hh / 2); c.fillStyle = 'rgba(4,30,22,0.82)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 2; c.stroke();
    text(c, msg, W / 2, y + hh / 2, u * 0.46, phase === 'meter' ? '#ffe36b' : '#ffffff', 800);
    c.globalAlpha = 1;
  }

  function drawCard(c, t, final) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const n = players.length;
    const cols = HOLES.length + 2;
    const pw = Math.min(W * 0.94, u * 27), rowH = u * 1.05;
    const ph = rowH * (n + 2) + u * (final ? 6.2 : 3.3);
    const px = (W - pw) / 2, py = (H - ph) / 2 + (final ? u * 0.3 : 0);
    panel(c, px, py, pw, ph, u * 0.6, '#ffd23f', '#1f7a4d', '#0a3a26');
    let y = py + u * 1.0;
    if (final) {
      const wn = winners.map((i) => players[i]);
      const solo = n === 1;
      const title = solo ? (totalOf(players[0]) <= PAR_TOTAL ? 'Under par - great round!' : 'Round complete!') :
        wn.length > 1 ? 'It\'s a tie!' : wn[0].human ? (wn[0].name === 'You' ? 'You win!' : `${wn[0].name} wins!`) : `${wn[0].name} wins`;
      outlined(c, title, W / 2, y + u * 0.2, u * 1.25, '#ffffff', '#fff1b8');
      y += u * 1.5;
      text(c, solo ? `Total ${totalOf(players[0])} on a par ${PAR_TOTAL} course` : `Lowest total: ${totalOf(players[winners[0]])} shots`, W / 2, y, u * 0.5, 'rgba(255,255,255,0.9)', 700);
      y += u * 0.9;
    } else {
      outlined(c, `Scorecard · after hole ${holeIx + 1}`, W / 2, y, u * 0.85, '#ffffff', '#c9ffd9');
      y += u * 1.1;
    }
    const nameW = pw * 0.2, cellW = (pw - nameW - u * 0.8) / cols;
    const x0 = px + u * 0.4;
    // Header
    text(c, 'Hole', x0 + u * 0.2, y + rowH / 2, u * 0.42, 'rgba(255,255,255,0.7)', 800, 'left');
    HOLES.forEach((hh, i) => text(c, String(i + 1), x0 + nameW + cellW * (i + 0.5), y + rowH * 0.33, u * 0.42, i === holeIx && !final ? '#ffe36b' : '#ffffff', 800));
    HOLES.forEach((hh, i) => text(c, `par ${hh.par}`, x0 + nameW + cellW * (i + 0.5), y + rowH * 0.75, u * 0.27, 'rgba(255,255,255,0.6)', 700));
    text(c, 'Total', x0 + nameW + cellW * (HOLES.length + 1), y + rowH / 2, u * 0.42, '#ffffff', 800);
    y += rowH;
    players.forEach((p, i) => {
      const win = final && winners.includes(i);
      roundRect(c, x0, y + 3, pw - u * 0.8, rowH - 6, rowH * 0.25);
      c.fillStyle = win ? 'rgba(255,210,63,0.25)' : i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.11)'; c.fill();
      const bs = rowH * 0.5;
      c.drawImage(ballSprite(p.c, Math.round(bs)), x0 + u * 0.2, y + rowH / 2 - bs / 2, bs, bs);
      const nm = (win ? '🏆 ' : '') + p.name;
      text(c, nm, x0 + u * 0.3 + bs, y + rowH / 2, fitSize(c, nm, u * 0.48, nameW - bs - u * 0.4, 800), '#ffffff', 800, 'left');
      HOLES.forEach((hh, j) => {
        const v = p.strokes[j];
        const cx = x0 + nameW + cellW * (j + 0.5), cy = y + rowH / 2;
        if (v != null && v < hh.par) { c.strokeStyle = '#ffd23f'; c.lineWidth = 2.5; c.beginPath(); c.arc(cx, cy, rowH * 0.32, 0, TAU); c.stroke(); }
        text(c, v == null ? '·' : String(v), cx, cy, u * 0.5, v == null ? 'rgba(255,255,255,0.35)' : v < hh.par ? '#ffe36b' : v === hh.par ? '#b7ffd0' : '#ffffff', 800, 'center', Kit.FONT);
      });
      text(c, String(totalOf(p)), x0 + nameW + cellW * (HOLES.length + 1), y + rowH / 2, u * 0.6, '#ffffff', 800, 'center', Kit.FONT);
      y += rowH;
    });
    if (final) {
      y += u * 0.5;
      text(c, `🏆 Wins: ${wins}`, W / 2, y, u * 0.55, '#ffd23f', 800);
      y += u * 1.1;
      const bw = u * 5, bh = u * 1.05, gap = u * 0.6;
      hits = [];
      [['▶  Play again', 'again'], ['Menu', 'menu']].forEach(([lab, act], i) => {
        const bx = W / 2 + (i === 0 ? -bw - gap / 2 : gap / 2), on = overBtn === i;
        const s = on ? 1.06 + Math.sin(t * 6) * 0.02 : 1;
        c.save(); c.translate(bx + bw / 2, y + bh / 2); c.scale(s, s);
        c.globalAlpha = stateT > 1.2 ? 1 : 0.5;
        roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
        const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
        if (on) { g.addColorStop(0, '#7dffb0'); g.addColorStop(1, '#16b35c'); } else { g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0.08)'); }
        c.fillStyle = g; c.fill(); c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.4)'; c.stroke();
        text(c, lab, 0, 0, bh * 0.45, on ? '#053a1c' : '#ffffff', 800);
        c.restore();
        hits.push({ x: bx, y, w: bw, h: bh, act });
      });
      text(c, '◀ ▶ choose · OK', W / 2, y + bh + u * 0.5, u * 0.38, 'rgba(255,255,255,0.6)', 700);
    } else {
      text(c, human(0) || players.some((p) => p.human) ? 'OK  next hole' : 'Next hole…', W / 2, py + ph - u * 0.75, u * 0.45, 'rgba(255,255,255,0.75)', 700);
    }
  }

  function pill(c, x, y, w, h, label, on, focus, dim, t) {
    const k = on && focus ? 1.07 + Math.sin(t * 6) * 0.02 : on ? 1.03 : 1;
    c.save();
    c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    c.globalAlpha = dim ? 0.3 : 1;
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.4);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    if (on) { g.addColorStop(0, '#7dffb0'); g.addColorStop(1, '#13a85a'); } else { g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0.06)'); }
    c.fillStyle = g; c.fill();
    c.lineWidth = focus && on ? 4 : 2; c.strokeStyle = focus && on ? '#ffffff' : 'rgba(255,255,255,0.3)'; c.stroke();
    if (focus && on) { c.shadowColor = '#ffffff'; c.shadowBlur = 16; c.stroke(); c.shadowBlur = 0; }
    text(c, label, 0, h * 0.03, fitSize(c, label, h * 0.48, w * 0.86, 800), on ? '#043018' : '#ffffff', 800);
    c.restore();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(2,22,16,0.55)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.94, u * 21), ph = Math.min(H * 0.96, u * 13);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    panel(c, px, py, pw, ph, u * 0.7, '#ffd23f', 'rgba(26,110,70,0.96)', 'rgba(8,48,32,0.97)');
    hits = [];
    const cx = W / 2;
    // Title with a ball dropping into a cup
    outlined(c, 'MINI GOLF', cx, py + u * 1.35, u * 1.6, '#ffffff', '#b7ffd0');
    const bx = cx + u * 5.6, by = py + u * 1.25;
    c.fillStyle = '#05140c'; c.beginPath(); c.ellipse(bx, by + u * 0.45, u * 0.55, u * 0.2, 0, 0, TAU); c.fill();
    const bounce = Math.abs(Math.sin(t * 2.4)) * u * 0.6;
    c.drawImage(ballSprite('#ffffff', Math.round(u * 0.6)), bx - u * 0.3, by - u * 0.1 - bounce, u * 0.6, u * 0.6);
    text(c, 'Nine fun holes · aim, time the power meter, sink it in the fewest shots', cx, py + u * 2.55, u * 0.44, 'rgba(255,255,255,0.85)', 700);
    const rows = menuRows();
    const labelX = px + u * 0.9, pillsR = px + pw - u * 0.9;
    const rowY = (i) => py + u * 3.9 + i * u * 1.55;
    const rowDefs = [
      { id: 'people', label: '🙂 People', items: ['1', '2', '3', '4'], sel: people - 1, ok: () => true },
      { id: 'tv', label: '📺 TV players', items: ['0', '1', '2', '3'], sel: tvs, ok: (i) => i <= 4 - people },
      { id: 'skill', label: '🎯 Skill', items: SKILLS.map((s) => s.name), sel: skill, ok: () => true },
    ];
    rowDefs.forEach((r, i) => {
      const y = rowY(i), focus = rows[menuRow] === r.id;
      if (focus) { roundRect(c, px + u * 0.4, y - u * 0.68, pw - u * 0.8, u * 1.36, u * 0.4); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(); }
      text(c, r.label, labelX, y, u * 0.55, focus ? '#ffe36b' : '#ffffff', 800, 'left');
      const wide = r.id === 'skill';
      const pwid = wide ? u * 3.3 : u * 1.5, gap = u * 0.25, ph2 = u * 0.95;
      const total = r.items.length * pwid + (r.items.length - 1) * gap;
      r.items.forEach((lab, j) => {
        const x = pillsR - total + j * (pwid + gap);
        pill(c, x, y - ph2 / 2, pwid, ph2, lab, j === r.sel, focus, !r.ok(j), t);
        hits.push({ x, y: y - ph2 / 2, w: pwid, h: ph2, act: r.id, v: r.id === 'people' ? j + 1 : j });
      });
    });
    text(c, SKILLS[skill].tip, cx, rowY(2) + u * 0.95, u * 0.4, 'rgba(200,255,220,0.85)', 700);
    // Who plays
    const n = people + tvs, sy = rowY(3) + u * 0.35, stepX = u * 2.6;
    let tvN = 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * stepX, bob = Math.sin(t * 4 + i) * u * 0.08;
      const isH = i < people; if (!isH) tvN++;
      c.drawImage(ballSprite(SEAT_C[i], Math.round(u * 0.8)), x - u * 0.4, sy - u * 0.5 + bob, u * 0.8, u * 0.8);
      text(c, isH ? (people === 1 ? 'You' : `Player ${i + 1}`) : (tvs === 1 ? 'TV' : `TV ${tvN}`), x, sy + u * 0.6, u * 0.36, 'rgba(255,255,255,0.9)', 800);
    }
    // Play button
    const bw = u * 5, bh = u * 1.2, bx2 = cx - bw / 2, by2 = rowY(3) + u * 1.8;
    const on = rows[menuRow] === 'play';
    const kb = on ? 1.08 + Math.sin(t * 6) * 0.025 : 1;
    c.save(); c.translate(cx, by2 + bh / 2); c.scale(kb, kb);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, '#fff07a'); g.addColorStop(1, '#ffaa00');
    c.fillStyle = g; c.fill();
    c.lineWidth = on ? 5 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(80,40,0,0.5)'; c.stroke();
    text(c, '▶  Play', 0, bh * 0.03, bh * 0.5, '#3a1d00', 800, 'center', Kit.FONT);
    c.restore();
    hits.push({ x: bx2, y: by2, w: bw, h: bh, act: 'play' });
    text(c, Kit.touchFirst() ? 'Tap to choose · tap Play' : '▲ ▼ choose  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - u * 0.6, u * 0.38, 'rgba(255,255,255,0.7)', 700);
    // Wins badge
    const wb = u * 3.6, wh = u * 0.7;
    roundRect(c, cx - wb / 2, py - wh / 2, wb, wh, wh / 2);
    c.fillStyle = '#0b4a2e'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, `🏆 Wins: ${wins}`, cx, py, u * 0.4, '#ffd23f', 800);
    c.restore();
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    if (course.width) c.drawImage(course, 0, 0, W, H); else { c.fillStyle = '#0a3a26'; c.fillRect(0, 0, W, H); }
    drawLive(c, t);
    if (state === 'play') {
      drawMeter(c, t);
      drawHud(c, t);
      drawHelp(c, t);
      drawBanner(c, t);
      if (phase === 'card') drawCard(c, t, false);
    }
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') { drawHud(c, t); c.fillStyle = 'rgba(2,20,14,0.55)'; c.fillRect(0, 0, W, H); drawCard(c, t, true); }
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run((dt) => { try { update(dt); } catch (e) { console.error(e); } }, (c, t) => { try { draw(c, t); } catch (e) { console.error(e); } });
  layout(Kit.W, Kit.H);
  Kit.canvas.focus();
  if (wins > 0) Kit.record(ID, wins);
})();
