// Brick Blast: the modern Brick Breaker. Bounce the ball off your paddle and smash every neon brick;
// armoured bricks take 2 or 3 hits and crack. Catch falling power-ups (wide paddle, multi-ball, slow
// ball). Endless levels with new layouts, 3 lives. Remote: hold Left/Right to move the paddle, OK
// launches the ball. Keyboard: arrows or A/D, Enter/space. Touch/mouse: drag or move, tap to launch.
'use strict';

(() => {
  const { ease, shade, rgba, roundRect, clamp, lerp } = Kit;

  // ---------- The field, in its own units (scaled to the screen) ----------
  const FW = 1200, FH = 720;
  const COLS = 12, MARGIN = 36, GAP = 6, BTOP = 92, BH = 34;
  const BW = (FW - MARGIN * 2 - GAP * (COLS - 1)) / COLS;
  const PY = FH - 58, PH = 22, PW = 176, PW_WIDE = 272;
  const BR = 11;
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const ROWC = ['#ff3d7f', '#ff7a3d', '#ffc93d', '#3dff8f', '#3de6ff', '#4d84ff', '#a45bff', '#ff4dd8', '#ff3d7f'];
  const POWERS = {
    wide: { color: '#3dff8f', label: 'Wide paddle', time: 12 },
    multi: { color: '#ffc93d', label: 'Multi-ball', time: 0 },
    slow: { color: '#3de6ff', label: 'Slow ball', time: 10 },
  };
  const POWER_IDS = Object.keys(POWERS);

  // Brick layouts: '.' empty, 1-3 hits. Later rounds of the cycle make bricks tougher.
  const LAYOUTS = [
    { name: 'Warm up', rows: ['............', '222222222222', '111111111111', '111111111111', '111111111111', '111111111111'] },
    { name: 'Pyramid', rows: ['.....22.....', '....2112....', '...211112...', '..21111112..', '.2111111112.', '211111111112'] },
    { name: 'Checkers', rows: ['2.2.2.2.2.2.', '.1.1.1.1.1.1', '2.2.2.2.2.2.', '.1.1.1.1.1.1', '2.2.2.2.2.2.', '.1.1.1.1.1.1'] },
    { name: 'Invader', rows: ['..1......1..', '...1....1...', '..22222222..', '.222.22.222.', '222222222222', '2.22222222.2', '2.2......2.2', '...33..33...'] },
    { name: 'Diamond', rows: ['.....33.....', '....2112....', '...211112...', '..21133112..', '...211112...', '....2112....', '.....22.....'] },
    { name: 'Pillars', rows: ['3.11.22.11.3', '2.11.22.11.2', '2.11.22.11.2', '2.11.22.11.2', '1.11.33.11.1'] },
    { name: 'Heart', rows: ['..33....33..', '.3113..3113.', '311113311113', '311111111113', '.3111111113.', '..31111113..', '...311113...', '....3113....'] },
    { name: 'Vault', rows: ['333333333333', '3..........3', '3.22222222.3', '3.21111112.3', '3.22222222.3', '3..........3', '33333..33333'] },
  ];

  // ---------- Records ----------
  let best = Kit.store.get('brickblast.best', 0);

  // ---------- State ----------
  // state: 'menu' (a demo plays itself behind the title), 'play', 'lost' (a ball just fell), 'clear', 'paused', 'over'
  let state = 'menu', demo = true, pausedFrom = 'play';
  let bricks = [], balls = [], caps = [], rings = [];
  let paddle = { x: FW / 2, vx: 0, w: PW, wideT: 0 };
  let slowT = 0, lives = 3, level = 1, score = 0, shown = 0, bump = 0, chain = 0, newBest = false;
  let startBest = 0, stateT = 0, markT = 0, broken = 0, layoutName = '', demoLaunchT = 0, hintT = 0;

  function buildLevel(n) {
    const lay = LAYOUTS[(n - 1) % LAYOUTS.length];
    const extra = Math.floor((n - 1) / LAYOUTS.length);
    layoutName = lay.name;
    bricks = [];
    lay.rows.forEach((row, r) => [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const hp = Math.min(3, Number(ch) + (extra > 0 && (r + c + extra) % 3 === 0 ? extra : 0));
      bricks.push({ r, c, x: MARGIN + c * (BW + GAP), y: BTOP + r * (BH + GAP), hp, max: hp, color: ROWC[r % ROWC.length],
        flash: 0, born: stateT + 0.15 + r * 0.06 + Math.abs(c - 5.5) * 0.035, v: (r * 7 + c * 3) % 3 });
    }));
    caps = [];
  }
  function newBall() {
    balls = [{ x: paddle.x, y: PY - PH / 2 - BR, dx: 0, dy: -1, s: 0, stuck: true, trail: [] }];
    chain = 0; hintT = stateT;
  }
  function speedFor() { return Math.min(860, 540 + 32 * (level - 1)); }

  function reset(isDemo) {
    demo = isDemo;
    level = isDemo ? 1 + Math.floor(Math.random() * LAYOUTS.length) : 1;
    lives = 3; score = 0; shown = 0; bump = 0; broken = 0; newBest = false; slowT = 0; startBest = best;
    paddle = { x: FW / 2, vx: 0, w: PW, wideT: 0 };
    buildLevel(level);
    newBall();
    demoLaunchT = stateT;
  }
  function start() {
    reset(false);
    state = 'play';
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.14, at: 0.07 });
  }
  function toMenu() { state = 'menu'; reset(true); }

  // ---------- Sounds (only short effects) ----------
  const quiet = () => demo;
  function sndBrick(destroyed) {
    if (quiet()) return;
    const f = NOTES[Math.min(NOTES.length - 1, chain)];
    if (destroyed) {
      Kit.tone(f, { type: 'triangle', dur: 0.14, vol: 0.2, slide: 1.3 });
      Kit.tone(f * 2, { type: 'sine', dur: 0.08, vol: 0.06, at: 0.03 });
      Kit.noise({ dur: 0.12, vol: 0.12, freq: 3500, q: 0.8, sweep: 0.5 });
    } else {
      Kit.tone(1400, { type: 'square', dur: 0.05, vol: 0.05 });
      Kit.tone(2100, { type: 'sine', dur: 0.12, vol: 0.07 });
    }
  }
  function sndPaddle() { if (!quiet()) { Kit.tone(220, { type: 'sine', dur: 0.12, vol: 0.32, slide: 1.6 }); Kit.noise({ dur: 0.04, vol: 0.06, freq: 1800 }); } }
  function sndWall() { if (!quiet()) Kit.tone(420, { type: 'triangle', dur: 0.04, vol: 0.07 }); }

  // ---------- Physics ----------
  function launch() {
    let any = false;
    for (const b of balls) {
      if (!b.stuck) continue;
      const a = aimAngle();
      b.dx = Math.sin(a); b.dy = -Math.cos(a); b.stuck = false; b.s = speedFor() * (slowT > 0 ? 0.66 : 1);
      any = true;
    }
    if (any && !quiet()) { Kit.noise({ dur: 0.18, vol: 0.1, freq: 900, q: 1, sweep: 4 }); Kit.tone(520, { type: 'triangle', dur: 0.1, vol: 0.14, slide: 1.8 }); }
    return any;
  }
  const aimAngle = () => Math.sin(stateT * 2.1) * 0.55;

  function brickAt(x, y) {
    for (let i = 0; i < bricks.length; i++) {
      const k = bricks[i];
      const nx = clamp(x, k.x, k.x + BW), ny = clamp(y, k.y, k.y + BH);
      const dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < BR * BR) return i;
    }
    return -1;
  }
  function keepSteep(b) {
    if (Math.abs(b.dy) < 0.3) { b.dy = (b.dy < 0 ? -1 : 1) * 0.3; b.dx = Math.sign(b.dx || 1) * Math.sqrt(1 - 0.09); }
  }

  function hitBrick(i) {
    const k = bricks[i];
    k.hp--; k.flash = 1;
    const cx = k.x + BW / 2, cy = k.y + BH / 2;
    if (k.hp > 0) {
      score += 5;
      sndBrick(false);
      burstAt(cx, cy, '#dfe8ff', 5, 0.5);
    } else {
      bricks.splice(i, 1);
      chain++; broken++;
      const mult = 1 + Math.min(4, Math.floor((chain - 1) / 4));
      const pts = 10 * k.max * mult;
      score += pts;
      sndBrick(true);
      burstAt(cx, cy, k.color, demo ? 10 : 16, 0.9);
      burstAt(cx, cy, '#ffffff', 4, 0.6);
      rings.push({ x: cx, y: cy, life: 0, max: 0.35, color: k.color });
      if (!demo) {
        floatAt(`+${pts}`, cx, cy, { color: mult > 1 ? '#ff8de3' : '#ffffff', size: 30 + mult * 3 });
        if (chain >= 5 && (chain - 1) % 4 === 0) floatAt(`Combo ×${mult}!`, FW / 2, FH * 0.55, { color: '#ff8de3', size: 54, life: 1.1, big: true });
        Kit.shake(3 + k.max, 0.12);
      }
      if (Math.random() < 0.13 && caps.length < 2) caps.push({ x: cx, y: cy, type: POWER_IDS[Math.floor(Math.random() * POWER_IDS.length)], t: 0 });
      if (!bricks.length) levelClear();
    }
    bump = 1;
    checkBest();
  }
  function checkBest() {
    if (demo || score <= best) return;
    if (!newBest && startBest > 0) {
      newBest = true;
      Kit.float('New best!', L.hud.scoreX + L.hud.size * 2.2, L.top * 0.5 + L.hud.size * 1.1, { color: '#ffd23f', size: L.hud.size * 0.75, life: 1.6, big: true });
    }
    best = score; Kit.store.set('brickblast.best', best); Kit.record('brickblast', best);
  }

  function stepBall(b, d) {
    // X then Y, so a brick hit flips the right direction.
    b.x += b.dx * d;
    if (b.x < BR) { b.x = BR; b.dx = Math.abs(b.dx); sndWall(); }
    else if (b.x > FW - BR) { b.x = FW - BR; b.dx = -Math.abs(b.dx); sndWall(); }
    let i = brickAt(b.x, b.y);
    if (i >= 0) { b.x -= b.dx * d; b.dx = -b.dx; hitBrick(i); keepSteep(b); }
    b.y += b.dy * d;
    if (b.y < BR) { b.y = BR; b.dy = Math.abs(b.dy); sndWall(); }
    i = brickAt(b.x, b.y);
    if (i >= 0) { b.y -= b.dy * d; b.dy = -b.dy; hitBrick(i); keepSteep(b); }
    // Paddle: where it lands decides the angle; a moving paddle adds a little spin.
    const top = PY - PH / 2;
    if (b.dy > 0 && b.y + BR >= top && b.y - b.dy * d + BR <= top + 6 && Math.abs(b.x - paddle.x) <= paddle.w / 2 + BR * 0.8) {
      const rel = clamp((b.x - paddle.x) / (paddle.w / 2), -1, 1);
      const a = rel * 1.08 + clamp(paddle.vx / 4000, -0.18, 0.18);
      b.dx = Math.sin(a); b.dy = -Math.cos(a);
      keepSteep(b);
      b.y = top - BR;
      chain = 0;
      paddleBump = 1;
      sndPaddle();
      burstAt(b.x, top, '#7ff3ff', 4, 0.4);
    }
  }

  function levelClear() {
    for (const b of balls) burstAt(b.x, b.y, '#7ff3ff', 12, 0.8);
    balls = []; caps = [];
    if (demo) { level++; buildLevel(level); newBall(); demoLaunchT = stateT + 0.6; return; }
    state = 'clear'; markT = stateT;
    const bonus = 100 * level;
    score += bonus; checkBest();
    Kit.sfx.win();
    Kit.confetti(90);
    Kit.float(`Level ${level} clear!`, Kit.W / 2, Kit.H * 0.42, { color: '#3de6ff', size: L.hud.size * 1.2, life: 1.8, big: true });
    Kit.float(`+${bonus} bonus`, Kit.W / 2, Kit.H * 0.56, { color: '#ffd23f', size: L.hud.size * 0.8, life: 1.8 });
  }
  function nextLevel() {
    level++;
    buildLevel(level);
    newBall();
    state = 'play';
    Kit.float(`Level ${level}`, Kit.W / 2, Kit.H * 0.62, { color: '#ffffff', size: L.hud.size * 1.1, life: 1.4, big: true });
  }

  function ballLost() {
    if (demo) { newBall(); demoLaunchT = stateT; return; }
    lives--;
    paddle.wideT = 0; slowT = 0; caps = [];
    Kit.shake(16, 0.45);
    Kit.noise({ dur: 0.35, vol: 0.3, freq: 160, q: 0.8, type: 'lowpass' });
    Kit.tone(300, { type: 'sawtooth', dur: 0.45, vol: 0.1, slide: 0.35 });
    state = lives > 0 ? 'lost' : 'over';
    markT = stateT;
    if (state === 'over') { setTimeout(() => Kit.sfx.over(), 500); if (best > 0) Kit.record('brickblast', best); }
  }

  function catchPower(cap) {
    const p = POWERS[cap.type];
    if (cap.type === 'wide') paddle.wideT = p.time;
    if (cap.type === 'slow') slowT = p.time;
    if (cap.type === 'multi') {
      if (balls.every((b) => b.stuck)) launch();
      const src = balls.filter((b) => !b.stuck).slice(0, 2);
      for (const b of src) {
        for (const turn of [-0.45, 0.45]) {
          if (balls.length >= 8) break;
          const a = Math.atan2(b.dx, -b.dy) + turn;
          balls.push({ x: b.x, y: b.y, dx: Math.sin(a), dy: -Math.abs(Math.cos(a)), s: b.s, stuck: false, trail: [] });
        }
      }
    }
    if (!demo) {
      score += 50; checkBest();
      Kit.sfx.chime();
      floatAt(p.label + '!', cap.x, PY - 70, { color: p.color, size: 40, life: 1.2 });
    }
    burstAt(cap.x, PY, p.color, 14, 0.8);
    rings.push({ x: cap.x, y: PY, life: 0, max: 0.4, color: p.color });
  }

  // ---------- Controls ----------
  // Held arrows: our own listeners. Some TV remotes send key-down/key-up pairs while held,
  // so a quick repeat keeps the key "held" for a moment after each key-up.
  const held = { left: false, right: false }, prevUp = { left: 0, right: 0 }, grace = { left: 0, right: 0 };
  let lastDir = 'right';
  const DIRKEY = { ArrowLeft: 'left', Left: 'left', a: 'left', A: 'left', ArrowRight: 'right', Right: 'right', d: 'right', D: 'right' };
  const dirOf = (e) => DIRKEY[e.key] || (e.keyCode === 37 ? 'left' : e.keyCode === 39 ? 'right' : null);
  window.addEventListener('keydown', (e) => { const d = dirOf(e); if (d) { held[d] = true; lastDir = d; pointerX = null; } });
  window.addEventListener('keyup', (e) => {
    const d = dirOf(e); if (!d) return;
    const now = performance.now();
    held[d] = false;
    grace[d] = now - prevUp[d] < 260 ? now + 110 : 0;
    prevUp[d] = now;
  });
  window.addEventListener('blur', () => { held.left = held.right = false; grace.left = grace.right = 0; });
  function heldDir() {
    const now = performance.now();
    const on = (d) => held[d] || now < grace[d];
    const other = lastDir === 'left' ? 'right' : 'left';
    const d = on(lastDir) ? lastDir : on(other) ? other : null;
    return d === 'left' ? -1 : d === 'right' ? 1 : 0;
  }

  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { if (k === 'ok') start(); return; }
    if (state === 'over') { if (k === 'ok' && stateT - markT > 1.6) start(); return; }
    if (state === 'paused') { if (k === 'ok' || k === 'left' || k === 'right' || k === 'up' || k === 'down') { state = pausedFrom; Kit.sfx.pick(); } return; }
    if (k === 'restart') { start(); return; }
    if ((k === 'ok' || k === 'up') && state === 'play') launch();
  });

  let pointerX = null, press = null;
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const toField = (x) => (x - L.fx) / L.S;
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (state === 'menu') { start(); return; }
      if (state === 'over') { if (stateT - markT > 1.6) start(); return; }
      if (state === 'paused') { state = pausedFrom; return; }
      press = { x: e.x, y: e.y, moved: false };
      pointerX = toField(e.x);
    },
    move(e) {
      if (press) { if (Math.abs(e.x - press.x) > 12) press.moved = true; pointerX = toField(e.x); }
      else if (!e.touch && (state === 'play' || state === 'lost')) pointerX = toField(e.x);
    },
    up() {
      if (press && state === 'play' && balls.some((b) => b.stuck)) launch();
      press = null;
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'play' || state === 'lost' || state === 'clear')) { pausedFrom = state; state = 'paused'; }
  });

  // ---------- Update ----------
  let paddleBump = 0;
  function movePaddle(dt) {
    const want = paddle.wideT > 0 ? PW_WIDE : PW;
    paddle.w += (want - paddle.w) * Math.min(1, dt * 10);
    let target = null;
    if (demo) {
      // The demo paddle follows the lowest falling ball, hitting it off-centre now and then.
      let tb = null;
      for (const b of balls) if (!b.stuck && b.dy > 0 && (!tb || b.y > tb.y)) tb = b;
      if (!tb) tb = balls.find((b) => !b.stuck);
      target = tb ? tb.x + Math.sin(stateT * 0.7) * paddle.w * 0.3 : FW / 2 + Math.sin(stateT) * 200;
      const v = clamp((target - paddle.x) * 8, -900, 900);
      paddle.vx = v;
    } else if (pointerX !== null) {
      const nx = paddle.x + (clamp(pointerX, 0, FW) - paddle.x) * Math.min(1, dt * 18);
      paddle.vx = (nx - paddle.x) / Math.max(dt, 0.001);
      paddle.x = nx;
    } else {
      const dir = heldDir();
      paddle.vx += (dir * 1150 - paddle.vx) * Math.min(1, dt * (dir ? 14 : 22));
    }
    if (demo || pointerX === null) paddle.x += paddle.vx * dt;
    const lim = paddle.w / 2;
    if (paddle.x < lim) { paddle.x = lim; if (paddle.vx < 0) paddle.vx = 0; }
    if (paddle.x > FW - lim) { paddle.x = FW - lim; if (paddle.vx > 0) paddle.vx = 0; }
  }

  function update(dt) {
    stateT += dt;
    shown += (score - shown) * Math.min(1, dt * 10);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    paddleBump = Math.max(0, paddleBump - dt * 5);
    for (const k of bricks) k.flash = Math.max(0, k.flash - dt * 5);
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].life += dt; if (rings[i].life > rings[i].max) rings.splice(i, 1); }
    if (state === 'paused' || state === 'over') return;

    movePaddle(dt);
    if (state === 'clear') { if (stateT - markT > 2.4) nextLevel(); return; }
    if (state === 'lost') { if (stateT - markT > 1.1) { newBall(); state = 'play'; } return; }

    paddle.wideT = Math.max(0, paddle.wideT - dt);
    slowT = Math.max(0, slowT - dt);
    if (demo && balls.some((b) => b.stuck) && stateT - demoLaunchT > 0.9) launch();

    const target = speedFor() * (slowT > 0 ? 0.66 : 1);
    const set = balls;
    for (let n = set.length - 1; n >= 0 && balls === set; n--) {
      const b = set[n];
      if (b.stuck) { b.x = paddle.x; b.y = PY - PH / 2 - BR; b.trail.length = 0; continue; }
      b.s += (target - b.s) * Math.min(1, dt * 3);
      const dist = b.s * dt, steps = Math.max(1, Math.ceil(dist / 6));
      for (let s = 0; s < steps && balls === set && (state === 'play' || state === 'menu'); s++) stepBall(b, dist / steps);
      if (balls !== set) break;
      b.trail.push(b.x, b.y);
      if (b.trail.length > 16) b.trail.splice(0, 2);
      if (b.y > FH + BR * 3) balls.splice(n, 1);
    }
    if (!balls.length && (state === 'play' || state === 'menu')) { ballLost(); return; }

    for (let i = caps.length - 1; i >= 0; i--) {
      const p = caps[i];
      p.t += dt; p.y += 230 * dt;
      if (p.y + 15 >= PY - PH / 2 && p.y - 15 <= PY + PH / 2 && Math.abs(p.x - paddle.x) <= paddle.w / 2 + 30) { caps.splice(i, 1); catchPower(p); continue; }
      if (p.y > FH + 30) caps.splice(i, 1);
    }
  }

  // Effects use screen coordinates.
  const sx = (x) => L.fx + x * L.S, sy = (y) => L.fy + y * L.S;
  function burstAt(x, y, color, n, sp) { Kit.burst(sx(x), sy(y), color, n, sp * Math.max(0.7, L.S)); }
  function floatAt(t, x, y, o) { Kit.float(t, sx(x), sy(y), { ...o, size: o.size * L.S }); }

  // ---------- Layout and cached pictures ----------
  let L = { S: 1, fx: 0, fy: 0, fw: FW, fh: FH, top: 70, hud: { size: 40, scoreX: 0 } };
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  const fieldPic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const top = H * (W > H ? 0.11 : 0.09);
    const S = Math.min((W * 0.95) / FW, (H - top - H * 0.025) / FH);
    const fw = FW * S, fh = FH * S;
    const fx = Math.round((W - fw) / 2), fy = Math.round(top + (H - top - H * 0.025 - fh) / 2);
    const size = Math.min(top * 0.52, 46 * Math.max(0.6, S));
    L = { S, fx, fy, fw, fh, top, hud: { size, scoreX: fx + 6 } };
    sprites.clear();
    // The field's glass, grid and neon border change only with the size: draw them once.
    const dpr = dprNow(), pad = 24;
    fieldPic.width = Math.ceil((fw + pad * 2) * dpr); fieldPic.height = Math.ceil((fh + pad * 2) * dpr);
    const c = fieldPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    roundRect(c, pad, pad, fw, fh, 18 * S);
    const g = c.createLinearGradient(0, pad, 0, pad + fh);
    g.addColorStop(0, 'rgba(14,22,66,0.92)'); g.addColorStop(1, 'rgba(5,8,28,0.95)');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    c.strokeStyle = 'rgba(110,170,255,0.06)'; c.lineWidth = 1;
    for (let x = 60; x < FW; x += 60) { c.beginPath(); c.moveTo(pad + x * S, pad); c.lineTo(pad + x * S, pad + fh); c.stroke(); }
    for (let y = 60; y < FH; y += 60) { c.beginPath(); c.moveTo(pad, pad + y * S); c.lineTo(pad + fw, pad + y * S); c.stroke(); }
    const rg = c.createRadialGradient(pad + fw / 2, pad + fh, 0, pad + fw / 2, pad + fh, fw * 0.6);
    rg.addColorStop(0, 'rgba(61,230,255,0.10)'); rg.addColorStop(1, 'rgba(61,230,255,0)');
    c.fillStyle = rg; c.fillRect(pad, pad, fw, fh);
    c.restore();
    roundRect(c, pad, pad, fw, fh, 18 * S);
    c.shadowColor = 'rgba(61,200,255,0.8)'; c.shadowBlur = 18 * dpr;
    const bg = c.createLinearGradient(pad, 0, pad + fw, 0);
    bg.addColorStop(0, '#3de6ff'); bg.addColorStop(0.5, '#6a7dff'); bg.addColorStop(1, '#ff4dd8');
    c.strokeStyle = bg; c.lineWidth = 3; c.stroke();
    c.shadowBlur = 0;
    // The open bottom edge, where balls are lost.
    c.fillStyle = 'rgba(255,61,127,0.18)';
    c.fillRect(pad + 4, pad + fh - 5 * S, fw - 8, 4 * S);
  }
  Kit.onResize(layout);

  // Gradients are slow on TV boxes: bricks, balls, the paddle and capsules are drawn once per size.
  const sprites = new Map();
  function sprite(key, w, h, draw) {
    let s = sprites.get(key);
    if (s) return s;
    const k = L.S * dprNow();
    s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w * k)); s.height = Math.max(1, Math.ceil(h * k));
    const c = s.getContext('2d');
    c.scale(k, k);
    draw(c, w, h, k);
    sprites.set(key, s);
    return s;
  }
  const BPAD = 12;
  const brickSprite = (color, max) => sprite(`b${color}${max}`, BW + BPAD * 2, BH + BPAD * 2, (c, w, h, k) => {
    const x = BPAD, y = BPAD;
    c.shadowColor = rgba(color, 0.75); c.shadowBlur = 12 * k;
    roundRect(c, x, y, BW, BH, 8);
    const g = c.createLinearGradient(0, y, 0, y + BH);
    if (max === 1) { g.addColorStop(0, shade(color, 0.35)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.35)); }
    else { g.addColorStop(0, shade(color, 0.15)); g.addColorStop(0.5, shade(color, -0.2)); g.addColorStop(1, shade(color, -0.55)); }
    c.fillStyle = g; c.fill();
    c.shadowBlur = 0;
    // Gloss on the top half
    roundRect(c, x + 4, y + 3, BW - 8, BH * 0.42, 6);
    const gl = c.createLinearGradient(0, y + 3, 0, y + 3 + BH * 0.42);
    gl.addColorStop(0, 'rgba(255,255,255,0.6)'); gl.addColorStop(1, 'rgba(255,255,255,0.05)');
    c.fillStyle = gl; c.fill();
    roundRect(c, x, y, BW, BH, 8);
    if (max === 1) { c.lineWidth = 1.5; c.strokeStyle = shade(color, 0.55); c.stroke(); }
    else {
      // Armour: a metal rim and rivets, one pair per extra hit.
      const mg = c.createLinearGradient(0, y, 0, y + BH);
      mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.5, '#a9b8d6'); mg.addColorStop(1, '#5d6b8c');
      c.lineWidth = max === 3 ? 4.5 : 3; c.strokeStyle = mg; c.stroke();
      const spots = max === 3 ? [[10, 9], [BW - 10, 9], [10, BH - 9], [BW - 10, BH - 9]] : [[10, BH / 2], [BW - 10, BH / 2]];
      for (const [px, py] of spots) {
        const rg = c.createRadialGradient(x + px - 1, y + py - 1, 0, x + px, y + py, 4);
        rg.addColorStop(0, '#ffffff'); rg.addColorStop(1, '#6d7ca0');
        c.fillStyle = rg; c.beginPath(); c.arc(x + px, y + py, 3.6, 0, Math.PI * 2); c.fill();
      }
    }
  });
  const crackSprite = (v, d) => sprite(`c${v}${d}`, BW, BH, (c) => {
    let seed = v * 97 + 13;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
    const ox = BW * (0.3 + v * 0.2), oy = BH * 0.45;
    const lines = d === 1 ? 3 : 6;
    for (const [col, wdt, off] of [['rgba(10,6,30,0.75)', 2.4, 0], ['rgba(255,255,255,0.45)', 1, 1]]) {
      c.strokeStyle = col; c.lineWidth = wdt; c.lineJoin = 'round';
      seed = v * 97 + 13;
      for (let i = 0; i < lines; i++) {
        const a = (i / lines) * Math.PI * 2 + rnd() * 0.8;
        let px = ox, py = oy;
        c.beginPath(); c.moveTo(px + off, py + off);
        const segs = 3 + Math.floor(rnd() * 2), len = (d === 1 ? 14 : 22) + rnd() * 16;
        for (let s = 0; s < segs; s++) {
          const aa = a + (rnd() - 0.5) * 0.9;
          px += Math.cos(aa) * len / segs * 1.4; py += Math.sin(aa) * len / segs * 0.8;
          c.lineTo(px + off, py + off);
        }
        c.stroke();
      }
    }
  });
  const ballSprite = (color) => sprite(`ball${color}`, BR * 6, BR * 6, (c, w) => {
    const m = w / 2;
    const halo = c.createRadialGradient(m, m, BR * 0.6, m, m, m);
    halo.addColorStop(0, rgba(color, 0.55)); halo.addColorStop(1, rgba(color, 0));
    c.fillStyle = halo; c.fillRect(0, 0, w, w);
    const g = c.createRadialGradient(m - BR * 0.35, m - BR * 0.4, BR * 0.1, m, m, BR);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, shade(color, 0.6)); g.addColorStop(1, color);
    c.fillStyle = g; c.beginPath(); c.arc(m, m, BR, 0, Math.PI * 2); c.fill();
  });
  const dotSprite = (color) => sprite(`dot${color}`, BR * 2, BR * 2, (c) => {
    const g = c.createRadialGradient(BR, BR, 0, BR, BR, BR);
    g.addColorStop(0, rgba(color, 0.9)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, BR * 2, BR * 2);
  });
  const PPAD = 18;
  const paddleSprite = (w) => sprite(`p${w}`, w + PPAD * 2, PH + PPAD * 2, (c, sw, sh, k) => {
    const x = PPAD, y = PPAD;
    c.shadowColor = 'rgba(61,230,255,0.9)'; c.shadowBlur = 16 * k;
    roundRect(c, x, y, w, PH, PH / 2);
    const g = c.createLinearGradient(0, y, 0, y + PH);
    g.addColorStop(0, '#e9fdff'); g.addColorStop(0.35, '#3de6ff'); g.addColorStop(1, '#155d9e');
    c.fillStyle = g; c.fill();
    c.shadowBlur = 0;
    // Pink end caps
    for (const ex of [x, x + w - 30]) {
      c.save(); roundRect(c, x, y, w, PH, PH / 2); c.clip();
      const eg = c.createLinearGradient(0, y, 0, y + PH);
      eg.addColorStop(0, '#ffd1f1'); eg.addColorStop(0.4, '#ff4dd8'); eg.addColorStop(1, '#8a1673');
      c.fillStyle = eg; c.fillRect(ex, y, 30, PH);
      c.restore();
    }
    roundRect(c, x + 10, y + 3, w - 20, PH * 0.32, PH * 0.16);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.5;
    roundRect(c, x, y, w, PH, PH / 2); c.stroke();
  });
  const CW = 74, CH = 32;
  const capSprite = (type) => sprite(`cap${type}`, CW + 24, CH + 24, (c, w, h, k) => {
    const color = POWERS[type].color, x = 12, y = 12;
    c.shadowColor = color; c.shadowBlur = 14 * k;
    roundRect(c, x, y, CW, CH, CH / 2);
    const g = c.createLinearGradient(0, y, 0, y + CH);
    g.addColorStop(0, shade(color, 0.5)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.45));
    c.fillStyle = g; c.fill();
    c.shadowBlur = 0;
    roundRect(c, x + 8, y + 3, CW - 16, CH * 0.3, 5); c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.8)'; roundRect(c, x, y, CW, CH, CH / 2); c.stroke();
    // Icon
    const cx = x + CW / 2, cy = y + CH / 2;
    c.fillStyle = '#10163a'; c.strokeStyle = '#10163a'; c.lineWidth = 3.5; c.lineCap = 'round'; c.lineJoin = 'round';
    if (type === 'wide') {
      c.beginPath(); c.moveTo(cx - 20, cy); c.lineTo(cx + 20, cy);
      c.moveTo(cx - 13, cy - 7); c.lineTo(cx - 20, cy); c.lineTo(cx - 13, cy + 7);
      c.moveTo(cx + 13, cy - 7); c.lineTo(cx + 20, cy); c.lineTo(cx + 13, cy + 7); c.stroke();
    } else if (type === 'multi') {
      for (const dx of [-14, 0, 14]) { c.beginPath(); c.arc(cx + dx, cy + (dx ? 2 : -3), 5.5, 0, Math.PI * 2); c.fill(); }
    } else {
      // An hourglass: slow
      c.beginPath(); c.moveTo(cx - 9, cy - 10); c.lineTo(cx + 9, cy - 10); c.lineTo(cx - 9, cy + 10); c.lineTo(cx + 9, cy + 10); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(cx - 5, cy + 8); c.lineTo(cx + 5, cy + 8); c.lineTo(cx, cy + 3); c.closePath(); c.fill();
    }
  });

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(6,8,30,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#24307a'); g.addColorStop(1, '#0b1238');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }

  function drawField(c, t) {
    // Bricks
    for (const k of bricks) {
      const age = stateT - k.born;
      if (age < 0) continue;
      const a = clamp(age / 0.4, 0, 1), s = ease.back(a);
      const img = brickSprite(k.color, k.max);
      const cx = k.x + BW / 2, cy = k.y + BH / 2 - (1 - ease.out(a)) * 40;
      const w = (BW + BPAD * 2) * s, h = (BH + BPAD * 2) * s;
      c.globalAlpha = Math.min(1, a * 2);
      c.drawImage(img, cx - w / 2, cy - h / 2, w, h);
      if (k.hp < k.max) c.drawImage(crackSprite(k.v, k.max - k.hp), cx - BW / 2, cy - BH / 2, BW, BH);
      if (k.flash > 0) {
        c.globalAlpha = k.flash * 0.75; c.fillStyle = '#ffffff';
        roundRect(c, cx - BW / 2, cy - BH / 2, BW, BH, 8); c.fill();
      }
    }
    c.globalAlpha = 1;
    // Rings where bricks burst
    for (const r of rings) {
      const k = r.life / r.max;
      c.globalAlpha = 1 - k; c.strokeStyle = r.color; c.lineWidth = 5 * (1 - k) + 1;
      c.beginPath(); c.arc(r.x, r.y, 14 + ease.out(k) * 60, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;
    // Falling power-ups
    for (const p of caps) {
      const img = capSprite(p.type), s = 1 + Math.sin(p.t * 8) * 0.06;
      const w = (CW + 24) * s, h = (CH + 24) * s;
      c.drawImage(img, p.x - w / 2, p.y - h / 2, w, h);
    }
    // Paddle
    const pw = paddle.w, want = paddle.wideT > 0 ? PW_WIDE : PW;
    const squash = paddleBump * 0.12;
    const img = paddleSprite(want);
    const dw = (pw + PPAD * 2) * (1 + squash * 0.3), dh = (PH + PPAD * 2) * (1 - squash);
    const wideEnding = paddle.wideT > 0 && paddle.wideT < 2.5 && Math.sin(t * 20) < 0;
    c.globalAlpha = state === 'lost' ? 0.5 + Math.sin(t * 18) * 0.3 : wideEnding ? 0.7 : 1;
    c.drawImage(img, paddle.x - dw / 2, PY - dh / 2 + squash * 6, dw, dh);
    c.globalAlpha = 1;
    // Balls with a short trail
    const bc = slowT > 0 ? '#9fd8ff' : '#3de6ff';
    for (const b of balls) {
      const tr = b.trail, n = tr.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const k = (i + 1) / n;
        const s = BR * 2 * (0.4 + 0.6 * k);
        c.globalAlpha = 0.45 * k;
        c.drawImage(dotSprite(bc), tr[i * 2] - s / 2, tr[i * 2 + 1] - s / 2, s, s);
      }
      c.globalAlpha = 1;
      c.drawImage(ballSprite(bc), b.x - BR * 3, b.y - BR * 3, BR * 6, BR * 6);
      if (b.stuck && state === 'play') {
        // Aim dots: where OK will send the ball.
        const a = aimAngle();
        for (let i = 1; i <= 6; i++) {
          c.globalAlpha = 0.85 - i * 0.12;
          const d = 18 + i * 26 + ((t * 60) % 26);
          c.fillStyle = '#ffffff';
          c.beginPath(); c.arc(b.x + Math.sin(a) * d, b.y - Math.cos(a) * d, 4.5 - i * 0.4, 0, Math.PI * 2); c.fill();
        }
        c.globalAlpha = 1;
      }
    }
    // Active power-ups along the top of the field, with time left.
    if (!demo) {
      let px = 22;
      for (const [id, left] of [['wide', paddle.wideT], ['slow', slowT]]) {
        if (left <= 0) continue;
        const p = POWERS[id];
        c.drawImage(capSprite(id), px - 12, 22 - 12, (CW + 24) * 0.8, (CH + 24) * 0.8);
        const bw = 90, by = 34;
        c.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(c, px + CW * 0.8 + 4, by, bw, 8, 4); c.fill();
        c.fillStyle = p.color; roundRect(c, px + CW * 0.8 + 4, by, bw * (left / p.time), 8, 4); c.fill();
        px += CW * 0.8 + bw + 30;
      }
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#121a52', '#03040f', 'rgba(80,140,255,0.09)');
    if (!bricks) return;
    c.drawImage(fieldPic, L.fx - 24, L.fy - 24, L.fw + 48, L.fh + 48);
    c.save();
    c.translate(L.fx, L.fy); c.scale(L.S, L.S);
    drawField(c, t);
    c.restore();

    // Top bar: score, level, lives and best.
    const ty = L.top / 2, hs = L.hud.size;
    if (state !== 'menu') {
      c.save();
      c.translate(L.fx + 4, ty); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
      outlined(c, String(Math.round(shown)), 0, 0, hs, '#ffffff', '#3de6ff', 'left');
      c.restore();
      text(c, `Level ${level}`, W / 2, ty - hs * 0.16, hs * 0.55, '#ffffff', 900);
      text(c, layoutName, W / 2, ty + hs * 0.36, hs * 0.34, 'rgba(190,210,255,0.75)', 700);
      const right = Math.min(L.fx + L.fw, W - 70);
      c.font = `800 ${Math.round(hs * 0.48)}px system-ui, sans-serif`;
      const bestStr = `👑 ${Math.max(best, score)}`;
      const bwid = c.measureText(bestStr).width;
      text(c, bestStr, right, ty, hs * 0.48, '#ffd23f', 800, 'right');
      const ls = hs * 0.62;
      for (let i = 0; i < 3; i++) {
        const x = right - bwid - hs * 0.6 - (2 - i) * ls * 0.95 - ls / 2;
        c.globalAlpha = i < lives ? 1 : 0.18;
        c.drawImage(ballSprite('#ff4dd8'), x - ls, ty - ls, ls * 2, ls * 2);
      }
      c.globalAlpha = 1;
    }

    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (state === 'play' && balls.some((b) => b.stuck)) {
      const a = clamp((stateT - hintT - 0.3) / 0.3, 0, 1);
      const msg = Kit.touchFirst() ? 'Tap to launch  ·  drag to move' : 'OK launch  ·  hold ◀ ▶ to move';
      c.font = `800 ${Math.round(hs * 0.5)}px system-ui, sans-serif`;
      const mw = c.measureText(msg).width + hs * 1.2, mh = hs * 0.95, my = L.fy + L.fh * 0.64;
      c.globalAlpha = a * 0.8;
      roundRect(c, W / 2 - mw / 2, my - mh / 2, mw, mh, mh / 2); c.fillStyle = 'rgba(8,12,40,0.85)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(61,230,255,0.5)'; c.stroke();
      c.globalAlpha = a * (0.8 + Math.sin(t * 4) * 0.2);
      text(c, msg, W / 2, my, hs * 0.5, '#ffffff', 800);
      c.globalAlpha = 1;
    }
    if (state === 'lost') {
      const k = clamp((stateT - markT) / 0.3, 0, 1);
      c.save(); c.translate(W / 2, L.fy + L.fh * 0.7); c.scale(ease.back(k), ease.back(k));
      outlined(c, lives === 1 ? 'Last ball!' : `${lives} balls left`, 0, 0, hs * 1.1, '#ffffff', '#ff4dd8');
      c.restore();
    }
    if (state === 'paused') {
      c.fillStyle = 'rgba(3,5,20,0.65)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.42, hs * 1.6, '#ffffff', '#3de6ff');
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'OK to carry on  ·  Back for games', W / 2, H * 0.56, hs * 0.55, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'over') drawOver(c);
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = Math.min(W / 1280, H / 720) * 40;
    c.fillStyle = 'rgba(3,5,20,0.55)'; c.fillRect(0, 0, W, H);
    // Title: bobbing letters
    const title = 'BRICK BLAST', ts = u * 2.4;
    c.font = `900 ${Math.round(ts)}px system-ui, sans-serif`;
    const widths = [...title].map((ch) => c.measureText(ch).width);
    let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
    const cols = ['#ff3d7f', '#ff7a3d', '#ffc93d', '#3dff8f', '#3de6ff', '#3de6ff', '#4d84ff', '#a45bff', '#ff4dd8', '#ff3d7f', '#ff7a3d'];
    [...title].forEach((ch, i) => {
      const y = H * 0.27 + Math.sin(t * 3 + i * 0.5) * u * 0.18;
      if (ch !== ' ') outlined(c, ch, x + widths[i] / 2, y, ts, '#ffffff', cols[i]);
      x += widths[i];
    });
    text(c, 'Smash every neon brick', W / 2, H * 0.27 + ts * 0.75, u * 0.7, 'rgba(210,225,255,0.85)', 700);
    // Card
    const pw = Math.min(W * 0.86, u * 17), ph = u * 6.0, px = W / 2 - pw / 2, py = H * 0.47;
    const k = 1 + Math.sin(t * 4) * 0.008;
    c.save(); c.translate(W / 2, py + ph / 2); c.scale(k, k);
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.7, '#3de6ff');
    c.restore();
    text(c, `👑 Best ${best}`, W / 2, py + u * 1.0, u * 0.8, '#ffd23f', 900);
    const bw = u * 7.2, bh = u * 1.5, by = py + u * 1.9;
    roundRect(c, W / 2 - bw / 2, by, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, by, 0, by + bh);
    g.addColorStop(0, '#ff8de8'); g.addColorStop(1, '#c21f9e');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,220,250,0.8)'; c.stroke();
    text(c, Kit.touchFirst() ? 'Tap to play' : 'OK  Play', W / 2, by + bh / 2, u * 0.75, '#ffffff', 900);
    // Power-up legend
    const ly = py + u * 4.35, items = POWER_IDS;
    const iw = pw / items.length;
    items.forEach((id, i) => {
      const cx = px + iw * (i + 0.5), s = u * 2.2 / (CW + 24) * (CW + 24);
      const img = capSprite(id), cw = s, ch = s * (CH + 24) / (CW + 24);
      c.drawImage(img, cx - cw / 2, ly - ch / 2, cw, ch);
      text(c, POWERS[id].label, cx, ly + u * 0.85, u * 0.5, 'rgba(255,255,255,0.85)', 700);
    });
    text(c, Kit.touchFirst() ? 'Drag to move  ·  tap to launch' : 'Hold ◀ ▶ to move  ·  OK launches  ·  Back for games',
      W / 2, py + ph + u * 0.9, u * 0.58, 'rgba(255,255,255,0.8)', 700);
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, u = Math.min(W / 1280, H / 720) * 40;
    const a = clamp((stateT - markT - 0.8) / 0.4, 0, 1);
    c.fillStyle = `rgba(3,5,20,${0.7 * a})`; c.fillRect(0, 0, W, H);
    if (a <= 0) return;
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, u * 13), ph = u * 9;
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.7, '#ff4dd8');
    outlined(c, 'Game over', 0, -ph * 0.36, u * 1.3, '#ffffff', '#ff8de8');
    outlined(c, String(score), 0, -ph * 0.13, u * 1.9, '#ffffff', '#3de6ff');
    text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.06, u * 0.65, '#ffd23f', 800);
    text(c, `Level ${level}  ·  ${broken} bricks smashed`, 0, ph * 0.19, u * 0.52, 'rgba(255,255,255,0.75)', 700);
    const ready = stateT - markT > 1.6;
    c.globalAlpha = ready ? 1 : 0.4;
    const bw = u * 7, bh = u * 1.3, by = ph * 0.29;
    roundRect(c, -bw / 2, by, bw, bh, bh / 2);
    c.fillStyle = 'rgba(61,230,255,0.22)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = '#3de6ff'; c.stroke();
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, by + bh / 2, u * 0.65, '#ffffff', 900);
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  reset(true);
  Kit.canvas.focus();
  if (best > 0) Kit.record('brickblast', best);
})();
