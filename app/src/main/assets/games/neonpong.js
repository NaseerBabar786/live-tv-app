// Neon Pong: the modern remake of Paddle Ball. You (cyan, left) play the TV (magenta, right): hit the
// ball past the TV's paddle. Every hit of a rally makes the ball faster; first to 7 points wins.
// The start menu picks how good the TV is: Easy, Normal or Hard.
// Remote: hold Up/Down to move your paddle, OK starts, serves and pauses. Touch: drag. Keys: arrows/WS, Enter.
'use strict';

(() => {
  const { sfx, ease, roundRect, clamp, lerp } = Kit;
  // The field in its own units; it is scaled to fit the screen.
  const FW = 160, FH = 90, PH = 19, PT = 3.2, PX = 7, CX = FW - 7, BR = 1.9;
  const WIN = 7, START_SPEED = 84, SPEED_UP = 7, MAX_SPEED = 215, YOU_SPEED = 140;
  const CYAN = '#22e6ff', MAG = '#ff2bd6';
  const BALL_COLORS = ['#c9fbff', '#fff36b', '#ffa63d', '#ff5a5a'];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const LEVELS = [
    { id: 'easy', name: 'Easy', icon: '🙂', tip: 'A sleepy TV', speed: 50, err: 7, predict: false, think: 0.3 },
    { id: 'normal', name: 'Normal', icon: '😎', tip: 'A fair fight', speed: 64, err: 4.5, predict: false, think: 0.16 },
    { id: 'hard', name: 'Hard', icon: '🤖', tip: 'The TV reads ahead', speed: 78, err: 3, predict: true, think: 0.1 },
  ];
  const autoplay = /autoplay/.test(location.hash); // for testing: the TV plays your paddle too

  // ---------- Records ----------
  let wins = Kit.store.get('neonpong.wins', { easy: 0, normal: 0, hard: 0 });
  if (!wins || typeof wins !== 'object') wins = { easy: 0, normal: 0, hard: 0 };
  let levelIx = clamp(Kit.store.get('neonpong.level', 1) | 0, 0, LEVELS.length - 1);
  let bestRally = Kit.store.get('neonpong.rally', 0) | 0;
  const totalWins = () => LEVELS.reduce((n, l) => n + (wins[l.id] | 0), 0);

  // ---------- State ----------
  // state: 'serve', 'play', 'paused', 'goal', 'over'; on the menu two TVs play a demo behind the level cards.
  let menu = true, state = 'serve', stateT = 0, demo = true, level = LEVELS[levelIx];
  let you = 0, tv = 0, bumpYou = 0, bumpTv = 0, rally = 0, longest = 0, serveDir = 1, serveT = 0, goalT = 0, overT = 0;
  let won = false, newRally = false;
  let py = FH / 2, pv = 0, cy = FH / 2, cv = 0, sqP = 0, sqC = 0, touchY = null;
  const ball = { x: FW / 2, y: FH / 2, vx: 0, vy: 0, speed: START_SPEED, live: false };
  const aiL = { target: FH / 2, t: 0, off: 0 }, aiR = { target: FH / 2, t: 0, off: 0 };
  let trail = [], rings = [], flashes = [], sideFlash = { side: 0, t: -9 }, wallTick = 0;

  function resetMatch(isDemo) {
    demo = isDemo;
    you = 0; tv = 0; rally = 0; longest = 0; newRally = false; won = false;
    py = cy = FH / 2; pv = cv = 0; touchY = null;
    serveDir = Math.random() < 0.5 ? -1 : 1;
    toServe();
  }
  function toServe() {
    state = 'serve'; serveT = stateT;
    ball.x = FW / 2; ball.y = FH / 2; ball.vx = ball.vy = 0; ball.live = false; ball.speed = START_SPEED;
    trail = []; rally = 0;
  }
  function launch() {
    state = 'play';
    ball.live = true; ball.speed = START_SPEED;
    ball.vy = (Math.random() - 0.5) * START_SPEED * 0.7;
    ball.vx = serveDir * Math.sqrt(START_SPEED * START_SPEED - ball.vy * ball.vy);
    aiL.off = (Math.random() - 0.5) * 2 * level.err; aiR.off = (Math.random() - 0.5) * 2 * level.err;
    if (!demo) {
      Kit.noise({ dur: 0.25, vol: 0.1, freq: 800, q: 0.8, sweep: 4 });
      Kit.tone(440, { type: 'triangle', dur: 0.12, vol: 0.12, slide: 1.6 });
    }
    rings.push({ x: ball.x, y: ball.y, t: stateT, color: '#ffffff', size: 10 });
  }
  function start() {
    level = LEVELS[levelIx]; menu = false;
    Kit.store.set('neonpong.level', levelIx);
    resetMatch(false);
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.12, at: 0.08 });
  }
  function toMenu() { menu = true; level = LEVELS[levelIx]; resetMatch(true); }

  // ---------- The TV's paddle (and the demo's left paddle) ----------
  function predictY(x) {
    if (!ball.vx) return ball.y;
    const t = (x - ball.x) / ball.vx;
    if (t < 0) return ball.y;
    const lo = BR, span = FH - 2 * BR, period = span * 2;
    let y = ((ball.y + ball.vy * t - lo) % period + period) % period;
    if (y > span) y = period - y;
    return y + lo;
  }
  function aiStep(ai, y, side, lvl, dt, extra) {
    ai.t -= dt;
    if (ai.t <= 0) {
      ai.t = lvl.think;
      const coming = ball.live && (side < 0 ? ball.vx < 0 : ball.vx > 0);
      const x = side < 0 ? PX : CX;
      if (coming) ai.target = (lvl.predict ? predictY(x) : ball.y) + ai.off;
      else ai.target = lerp(FH / 2, ball.y, 0.3);
    }
    const max = lvl.speed + extra;
    const v = clamp((ai.target - y) * 7, -max, max);
    return { y: clamp(y + v * dt, PH / 2, FH - PH / 2), v };
  }

  // ---------- Ball ----------
  function bounce(paddleY, dir, paddleV, color) {
    ball.speed = Math.min(MAX_SPEED, ball.speed + SPEED_UP);
    const hit = clamp((ball.y - paddleY) / (PH / 2), -1, 1);
    let vy = ball.speed * hit * 0.75 + paddleV * 0.18;
    vy = clamp(vy, -ball.speed * 0.8, ball.speed * 0.8);
    ball.vy = vy;
    ball.vx = dir * Math.sqrt(ball.speed * ball.speed - vy * vy);
    rally++;
    if (dir > 0) { sqP = 1; aiR.off = (Math.random() - 0.5) * 2 * level.err; aiR.t = 0; } else { sqC = 1; aiL.off = (Math.random() - 0.5) * 2 * level.err; aiL.t = 0; }
    const sx = X(ball.x), sy = Y(ball.y);
    rings.push({ x: ball.x, y: ball.y, t: stateT, color, size: 6 });
    flashes.push({ x: ball.x - dir * BR, y: ball.y, t: stateT, color });
    Kit.burst(sx, sy, color, demo ? 6 : 10, 0.55);
    if (demo) return;
    const f = NOTES[Math.min(NOTES.length - 1, Math.floor(rally / 2))];
    Kit.tone(dir > 0 ? f : f * 0.75, { type: 'square', dur: 0.08, vol: 0.09, slide: 1.25 });
    Kit.tone(f * 2, { type: 'sine', dur: 0.1, vol: 0.06, at: 0.02 });
    if (rally >= 5 && rally % 5 === 0) {
      Kit.float(`Rally ×${rally}!`, Kit.W / 2, L.ay + L.ah * 0.22, { color: '#fff36b', size: L.s * 7, life: 1.2, big: true });
      Kit.noise({ dur: 0.3, vol: 0.07, freq: 600, q: 0.8, sweep: 5 });
    }
    if (rally > longest) longest = rally;
    if (rally > bestRally) { bestRally = rally; newRally = true; Kit.store.set('neonpong.rally', bestRally); }
  }
  function stepBall(dt) {
    const n = Math.max(1, Math.ceil((ball.speed * dt) / 1.2));
    const h = dt / n;
    for (let i = 0; i < n; i++) {
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      if (ball.y < BR || ball.y > FH - BR) {
        const top = ball.y < BR;
        ball.y = top ? BR : FH - BR;
        ball.vy = top ? Math.abs(ball.vy) : -Math.abs(ball.vy);
        flashes.push({ x: ball.x, y: top ? 0 : FH, t: stateT, color: ball.x < FW / 2 ? CYAN : MAG });
        if (!demo && stateT - wallTick > 0.05) { wallTick = stateT; Kit.tone(320 + ball.speed, { type: 'triangle', dur: 0.05, vol: 0.08 }); }
      }
      if (ball.vx < 0 && ball.x - BR <= PX + PT / 2 && ball.x + BR >= PX - PT / 2 && Math.abs(ball.y - py) <= PH / 2 + BR) {
        ball.x = PX + PT / 2 + BR; bounce(py, 1, pv, CYAN);
      } else if (ball.vx > 0 && ball.x + BR >= CX - PT / 2 && ball.x - BR <= CX + PT / 2 && Math.abs(ball.y - cy) <= PH / 2 + BR) {
        ball.x = CX - PT / 2 - BR; bounce(cy, -1, cv, MAG);
      }
      if (ball.x < -4) { goal(false); return; }
      if (ball.x > FW + 4) { goal(true); return; }
    }
  }

  function goal(youScored) {
    ball.live = false;
    const ex = youScored ? FW : 0, ey = clamp(ball.y, 0, FH);
    const color = youScored ? CYAN : MAG;
    const sx = X(ex), sy = Y(ey);
    Kit.burst(sx, sy, color, demo ? 24 : 46, 1.4);
    Kit.burst(sx, sy, '#ffffff', demo ? 8 : 16, 1.1);
    rings.push({ x: ex, y: ey, t: stateT, color, size: 30 });
    rings.push({ x: ex, y: ey, t: stateT + 0.12, color: '#ffffff', size: 20 });
    sideFlash = { side: youScored ? 1 : -1, t: stateT, color };
    trail = [];
    serveDir = youScored ? -1 : 1;
    if (youScored) { you++; bumpYou = 1; } else { tv++; bumpTv = 1; }
    if (demo) {
      if (you >= WIN || tv >= WIN) { you = 0; tv = 0; }
      state = 'goal'; goalT = stateT;
      return;
    }
    Kit.shake(youScored ? 14 : 18, 0.45);
    Kit.noise({ dur: 0.5, vol: 0.32, freq: 220, q: 0.7, type: 'lowpass', sweep: 0.4 });
    if (youScored) {
      Kit.tone(523, { type: 'triangle', dur: 0.15, vol: 0.18 });
      Kit.tone(784, { type: 'triangle', dur: 0.2, vol: 0.18, at: 0.08 });
      Kit.tone(1046, { type: 'triangle', dur: 0.3, vol: 0.16, at: 0.16 });
      Kit.float('GOAL!', X(FW * 0.75), Y(FH * 0.5), { color: CYAN, size: L.s * 11, life: 1.1, big: true });
    } else {
      Kit.tone(220, { type: 'sawtooth', dur: 0.35, vol: 0.1, slide: 0.5 });
      Kit.float('TV scores', X(FW * 0.25), Y(FH * 0.5), { color: MAG, size: L.s * 8, life: 1.1, big: true });
    }
    if (you === WIN - 1 && tv < WIN) {
      Kit.float('Match point!', Kit.W / 2, Y(FH * 0.78), { color: '#fff36b', size: L.s * 6, life: 1.3 });
    }
    state = 'goal'; goalT = stateT;
    if (you >= WIN || tv >= WIN) {
      won = you >= WIN;
      if (won) {
        wins[level.id] = (wins[level.id] | 0) + 1;
        Kit.store.set('neonpong.wins', wins);
        Kit.record('neonpong', totalWins());
      }
    }
  }

  // ---------- Layout ----------
  let L = { s: 6, ax: 0, ay: 0, aw: 0, ah: 0, top: 80 };
  const X = (u) => L.ax + u * L.s, Y = (v) => L.ay + v * L.s;
  const arenaPic = document.createElement('canvas');
  const dprOf = () => Math.min(window.devicePixelRatio || 1, 2);
  function layout(W, H) {
    if (!W || !H) return;
    const top = H * (W > H ? 0.17 : 0.14);
    const s = Math.min((W * 0.94) / FW, (H - top - H * 0.05) / FH);
    const aw = FW * s, ah = FH * s;
    const ax = Math.round((W - aw) / 2), ay = Math.round(top + (H - top - ah) / 2 - H * 0.005);
    L = { s, ax, ay, aw, ah, top };
    sprites.clear();
    drawArena();
  }
  Kit.onResize(layout);

  function drawArena() {
    const { s, aw, ah } = L, pad = 24, dpr = dprOf();
    arenaPic.width = Math.ceil((aw + pad * 2) * dpr); arenaPic.height = Math.ceil((ah + pad * 2) * dpr);
    const c = arenaPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, pad * dpr, pad * dpr);
    const r = s * 4;
    roundRect(c, 0, 0, aw, ah, r);
    const g = c.createLinearGradient(0, 0, 0, ah);
    g.addColorStop(0, 'rgba(18,10,48,0.92)'); g.addColorStop(1, 'rgba(6,4,22,0.95)');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, 0, 0, aw, ah, r); c.clip();
    // Each side glows in its player's colour.
    let sg = c.createLinearGradient(0, 0, aw / 2, 0);
    sg.addColorStop(0, 'rgba(34,230,255,0.16)'); sg.addColorStop(1, 'rgba(34,230,255,0)');
    c.fillStyle = sg; c.fillRect(0, 0, aw / 2, ah);
    sg = c.createLinearGradient(aw, 0, aw / 2, 0);
    sg.addColorStop(0, 'rgba(255,43,214,0.16)'); sg.addColorStop(1, 'rgba(255,43,214,0)');
    c.fillStyle = sg; c.fillRect(aw / 2, 0, aw / 2, ah);
    // A faint grid floor.
    c.strokeStyle = 'rgba(150,120,255,0.08)'; c.lineWidth = 1;
    const step = 10 * s;
    c.beginPath();
    for (let x = aw / 2 % step; x < aw; x += step) { c.moveTo(x, 0); c.lineTo(x, ah); }
    for (let y = (ah / 2) % step; y < ah; y += step) { c.moveTo(0, y); c.lineTo(aw, y); }
    c.stroke();
    // Centre line and circle.
    c.shadowColor = 'rgba(200,170,255,0.9)'; c.shadowBlur = 10;
    c.strokeStyle = 'rgba(220,200,255,0.45)'; c.lineWidth = Math.max(2, s * 0.5);
    c.setLineDash([s * 3, s * 2.4]);
    c.beginPath(); c.moveTo(aw / 2, s * 2); c.lineTo(aw / 2, ah - s * 2); c.stroke();
    c.setLineDash([]);
    c.lineWidth = Math.max(2, s * 0.4); c.strokeStyle = 'rgba(220,200,255,0.3)';
    c.beginPath(); c.arc(aw / 2, ah / 2, s * 12, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(220,200,255,0.5)';
    c.beginPath(); c.arc(aw / 2, ah / 2, s * 1.1, 0, Math.PI * 2); c.fill();
    c.restore();
    // Neon rim: cyan on your half, magenta on the TV's.
    for (const [col, x0] of [[CYAN, -pad], [MAG, aw / 2]]) {
      c.save();
      c.beginPath(); c.rect(x0, -pad, aw / 2 + pad, ah + pad * 2); c.clip();
      roundRect(c, 0, 0, aw, ah, r);
      c.shadowColor = col; c.shadowBlur = 18;
      c.strokeStyle = col; c.lineWidth = Math.max(3, s * 0.7); c.stroke();
      c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,0.65)'; c.lineWidth = Math.max(1, s * 0.2); c.stroke();
      c.restore();
    }
  }

  // ---------- Sprites, drawn once per size (glows and gradients are slow on TV boxes) ----------
  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const k = name + Math.round(w) + 'x' + Math.round(h);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = dprOf();
    s = document.createElement('canvas');
    s.width = Math.ceil(w * dpr); s.height = Math.ceil(h * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, w, h);
    sprites.set(k, s);
    return s;
  }
  const glow = (color, size) => sprite('g' + color, size, size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color); g.addColorStop(0.25, Kit.rgba(color, 0.55)); g.addColorStop(1, Kit.rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const ballCore = (size) => sprite('ball', size, size, (c, s) => {
    const g = c.createRadialGradient(s * 0.38, s * 0.34, s * 0.05, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#f4f0ff'); g.addColorStop(1, '#b8a8ff');
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 0.5, 0, Math.PI * 2); c.fill();
  });
  // A paddle with its glow; the pad around it is where the glow spills.
  function paddleSprite(color) {
    const w = PT * L.s, h = PH * L.s, pad = Math.round(L.s * 4);
    return { pad, img: sprite('p' + color, w + pad * 2, h + pad * 2, (c) => {
      c.shadowColor = color; c.shadowBlur = pad * 0.9;
      roundRect(c, pad, pad, w, h, w / 2);
      c.fillStyle = color; c.fill();
      c.shadowBlur = 0;
      const g = c.createLinearGradient(pad, 0, pad + w, 0);
      g.addColorStop(0, Kit.shade(color, -0.35)); g.addColorStop(0.45, Kit.shade(color, 0.35)); g.addColorStop(1, Kit.shade(color, -0.2));
      c.fillStyle = g; roundRect(c, pad, pad, w, h, w / 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.85)';
      roundRect(c, pad + w * 0.3, pad + w * 0.5, w * 0.28, h - w, w * 0.14); c.fill();
    }) };
  }

  // ---------- Keys, held arrows, touch ----------
  // TV remotes repeat keydown while held and do not always send keyup: a held key that stops
  // repeating counts as let go.
  const held = { up: { down: false, last: 0, n: 0 }, down: { down: false, last: 0, n: 0 } };
  const HK = { ArrowUp: 'up', Up: 'up', w: 'up', W: 'up', ArrowDown: 'down', Down: 'down', s: 'down', S: 'down' };
  window.addEventListener('keydown', (e) => {
    const k = HK[e.key] || ({ 38: 'up', 40: 'down' })[e.keyCode];
    if (!k) return;
    const h = held[k];
    h.down = true; h.n = e.repeat ? Math.max(2, h.n + 1) : h.n + 1; h.last = performance.now();
    touchY = null;
  });
  window.addEventListener('keyup', (e) => {
    const k = HK[e.key] || ({ 38: 'up', 40: 'down' })[e.keyCode];
    if (k) { held[k].down = false; held[k].n = 0; }
  });
  window.addEventListener('blur', () => { for (const k in held) { held[k].down = false; held[k].n = 0; } });
  function heldDir() {
    const now = performance.now();
    let d = 0;
    for (const k of ['up', 'down']) {
      const h = held[k];
      if (h.down && now - h.last > (h.n >= 2 ? 360 : 750)) { h.down = false; h.n = 0; }
      if (h.down) d += k === 'up' ? -1 : 1;
    }
    return d;
  }

  const canOk = () => stateT - overT > 1.2;
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (menu) {
      const prev = levelIx;
      if (k === 'left' || k === 'up') levelIx = (levelIx + LEVELS.length - 1) % LEVELS.length;
      else if (k === 'right' || k === 'down') levelIx = (levelIx + 1) % LEVELS.length;
      else if (k === 'ok') { start(); return; }
      if (prev !== levelIx) { sfx.move(); level = LEVELS[levelIx]; }
      return;
    }
    if (state === 'over') {
      if (!canOk()) return;
      if (k === 'ok') start();
      else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { sfx.move(); toMenu(); }
      return;
    }
    if (k === 'restart') { start(); return; }
    if (k !== 'ok') { if (state === 'paused' && (k === 'left' || k === 'right')) resume(); return; }
    if (state === 'serve') launch();
    else if (state === 'play') { state = 'paused'; sfx.move(); }
    else if (state === 'paused') resume();
  });
  let pausedFrom = 'play';
  function resume() { state = pausedFrom; if (state === 'serve') serveT = stateT; sfx.pick(); }

  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inBox = (e, b) => b && e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  let dragging = false;
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (menu) {
        const i = (L.cards || []).findIndex((r) => inBox(e, r));
        if (i >= 0) { if (i === levelIx) start(); else { levelIx = i; level = LEVELS[i]; sfx.move(); } }
        return;
      }
      if (state === 'over') { if (canOk()) { if (inBox(e, L.menuBtn)) toMenu(); else start(); } return; }
      if (state === 'paused') { resume(); return; }
      if (state === 'serve') launch();
      dragging = true; touchY = (e.y - L.ay) / L.s;
    },
    move(e) { if (dragging) touchY = (e.y - L.ay) / L.s; },
    up() { dragging = false; },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !menu && (state === 'play' || state === 'serve' || state === 'goal')) { pausedFrom = state === 'goal' ? 'goal' : state; state = 'paused'; }
  });
  // Pausing with OK always comes back to play.
  const setPausedFrom = () => { if (state === 'play') pausedFrom = 'play'; };

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!L.aw) layout(Kit.W, Kit.H);
    bumpYou = Math.max(0, bumpYou - dt * 2.5); bumpTv = Math.max(0, bumpTv - dt * 2.5);
    sqP = Math.max(0, sqP - dt * 5); sqC = Math.max(0, sqC - dt * 5);
    setPausedFrom();
    if (state === 'paused' || state === 'over') return;

    const lvlDemo = LEVELS[1];
    const extra = demo ? 0 : tv * 2.5;
    // Your paddle: the arrows (with a little acceleration so a tap is a nudge), a finger, or the demo TV.
    if (demo || autoplay) {
      const r = aiStep(aiL, py, -1, demo ? lvlDemo : LEVELS[2], dt, autoplay ? 30 : 0); py = r.y; pv = r.v;
    } else if (touchY != null) {
      const v = clamp((touchY - py) * 14, -YOU_SPEED * 1.4, YOU_SPEED * 1.4);
      pv = v; py = clamp(py + v * dt, PH / 2, FH - PH / 2);
    } else {
      const want = heldDir() * YOU_SPEED;
      pv = lerp(pv, want, Math.min(1, dt * (want ? 16 : 22)));
      if (Math.abs(pv) < 1 && !want) pv = 0;
      py += pv * dt;
      if (py < PH / 2 || py > FH - PH / 2) { py = clamp(py, PH / 2, FH - PH / 2); pv = 0; }
    }
    const r = aiStep(aiR, cy, 1, demo ? lvlDemo : level, dt, extra); cy = r.y; cv = r.v;

    if (state === 'serve' && stateT - serveT > (demo ? 0.8 : 1.6)) launch();
    if (state === 'goal' && stateT - goalT > (demo ? 0.8 : 1.1)) {
      if (!demo && (you >= WIN || tv >= WIN)) {
        state = 'over'; overT = stateT;
        if (won) { sfx.win(); Kit.confetti(140); } else sfx.over();
      } else toServe();
    }
    if (state === 'play') {
      stepBall(dt);
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 14) trail.shift();
    }
    const now = stateT;
    rings = rings.filter((g) => now - g.t < 0.6);
    flashes = flashes.filter((f) => now - f.t < 0.4);
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  // Neon text: two soft coloured strokes for the glow, then a bright fill.
  function neon(c, str, x, y, size, color, align = 'center') {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle'; c.lineJoin = 'round';
    c.globalAlpha = 0.14; c.strokeStyle = color; c.lineWidth = size * 0.26; c.strokeText(str, x, y);
    c.globalAlpha = 0.45; c.lineWidth = size * 0.14; c.strokeText(str, x, y);
    c.globalAlpha = 1;
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, Kit.shade(color, 0.55)); g.addColorStop(1, color);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#2a1760'); g.addColorStop(1, '#0d0828');
    c.fillStyle = g; c.fill();
    c.globalAlpha = 0.35; c.lineWidth = 10; c.strokeStyle = border; c.stroke();
    c.globalAlpha = 1; c.lineWidth = 3; c.stroke();
  }

  function drawPaddle(c, x, y, color, sq, side) {
    const p = paddleSprite(color);
    const w = PT * L.s + p.pad * 2, h = PH * L.s + p.pad * 2;
    const sx = 1 + sq * 0.7, sy = 1 - sq * 0.18;
    c.save();
    c.translate(X(x) - side * sq * L.s * 0.8, Y(y));
    c.scale(sx, sy);
    c.drawImage(p.img, -w / 2, -h / 2, w, h);
    c.restore();
  }

  function drawBall(c) {
    const k = clamp((ball.speed - START_SPEED) / (MAX_SPEED - START_SPEED), 0, 1);
    const col = BALL_COLORS[Math.min(BALL_COLORS.length - 1, Math.floor(k * BALL_COLORS.length))];
    const bs = BR * 2 * L.s;
    c.globalCompositeOperation = 'lighter';
    const gs = Math.round(bs * 3.2);
    const gimg = glow(col, gs);
    for (let i = 0; i < trail.length - 1; i++) {
      const a = (i + 1) / trail.length;
      const s = gs * (0.35 + a * 0.55);
      c.globalAlpha = a * 0.45;
      c.drawImage(gimg, X(trail[i].x) - s / 2, Y(trail[i].y) - s / 2, s, s);
    }
    c.globalAlpha = 1;
    if (ball.live || state === 'serve') {
      const pulse = state === 'serve' ? 1 + Math.sin(stateT * 10) * 0.15 : 1;
      const s = gs * pulse * 1.1;
      c.drawImage(gimg, X(ball.x) - s / 2, Y(ball.y) - s / 2, s, s);
      c.globalCompositeOperation = 'source-over';
      const b = bs * pulse;
      c.drawImage(ballCore(bs), X(ball.x) - b / 2, Y(ball.y) - b / 2, b, b);
    }
    c.globalCompositeOperation = 'source-over';
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#160b3a', '#05030f', 'rgba(255,43,214,0.08)');
    if (!L.aw) return;
    const s = L.s;
    c.drawImage(arenaPic, L.ax - 24, L.ay - 24, L.aw + 48, L.ah + 48);
    // Goal flash on the side that was scored on.
    const fk = 1 - (stateT - sideFlash.t) / 0.7;
    if (fk > 0 && sideFlash.side) {
      c.globalAlpha = fk * 0.28; c.fillStyle = sideFlash.color;
      const x0 = sideFlash.side > 0 ? L.ax + L.aw / 2 : L.ax;
      c.fillRect(x0, L.ay, L.aw / 2, L.ah);
      c.globalAlpha = 1;
    }
    // Wall and paddle impacts.
    c.globalCompositeOperation = 'lighter';
    for (const f of flashes) {
      const k = 1 - (stateT - f.t) / 0.4;
      const gs = s * 14 * (1.2 - k * 0.4);
      c.globalAlpha = k;
      c.drawImage(glow(f.color, Math.round(s * 14)), X(f.x) - gs / 2, Y(f.y) - gs / 2, gs, gs);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    for (const g of rings) {
      const k = clamp((stateT - g.t) / 0.6, 0, 1);
      if (stateT < g.t) continue;
      c.globalAlpha = 1 - k;
      c.strokeStyle = g.color; c.lineWidth = Math.max(1.5, s * 0.8 * (1 - k));
      c.beginPath(); c.arc(X(g.x), Y(g.y), s * g.size * ease.out(k) + 1, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;

    drawPaddle(c, PX, py, CYAN, sqP, -1);
    drawPaddle(c, CX, cy, MAG, sqC, 1);
    drawBall(c);

    drawHud(c, t);
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (menu) drawMenu(c, t);
    if (state === 'serve' && !demo) {
      const k = stateT - serveT;
      const first = you === 0 && tv === 0;
      if (first) neon(c, k < 0.9 ? 'Get ready' : 'Go!', W / 2, Y(FH * 0.3), s * 8 * ease.back(clamp((k % 0.9) / 0.3, 0, 1)), '#fff36b');
      text(c, Kit.touchFirst() ? 'Drag to move  ·  tap to serve' : 'Hold ▲ ▼ to move  ·  OK serves  ·  Back for games', W / 2, Y(FH * 0.72), s * 3.6, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'paused') {
      c.fillStyle = 'rgba(5,3,20,0.6)'; c.fillRect(0, 0, W, H);
      neon(c, 'Paused', W / 2, H * 0.44, s * 12, CYAN);
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'OK to carry on  ·  Back for games', W / 2, H * 0.58, s * 4, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'over') drawOver(c);
  }

  function drawHud(c, t) {
    const W = Kit.W, top = L.top, hy = top * 0.5, s = L.s;
    if (menu) return;
    const nsz = top * 0.62;
    const gap = Math.max(nsz * 1.0, s * 14);
    c.save(); c.translate(W / 2 - gap, hy); c.scale(1 + bumpYou * 0.35, 1 + bumpYou * 0.35);
    neon(c, String(you), 0, 0, nsz, CYAN); c.restore();
    c.save(); c.translate(W / 2 + gap, hy); c.scale(1 + bumpTv * 0.35, 1 + bumpTv * 0.35);
    neon(c, String(tv), 0, 0, nsz, MAG); c.restore();
    // Middle: the rally count while one is going, else "first to 7".
    if (rally >= 2 && (state === 'play' || state === 'paused')) {
      text(c, 'RALLY', W / 2, hy - nsz * 0.2, nsz * 0.2, 'rgba(255,255,255,0.6)', 800);
      text(c, String(rally), W / 2, hy + nsz * 0.14, nsz * 0.4, '#fff36b', 900);
    } else {
      text(c, 'FIRST', W / 2, hy - nsz * 0.16, nsz * 0.18, 'rgba(255,255,255,0.55)', 800);
      text(c, 'TO 7', W / 2, hy + nsz * 0.12, nsz * 0.22, 'rgba(255,255,255,0.75)', 900);
    }
    // Names and pips.
    const lx = L.ax + s * 2, rx = L.ax + L.aw - s * 2;
    const lsz = Math.max(18, top * 0.2);
    text(c, '🎮 YOU', lx, hy - lsz * 0.55, lsz, CYAN, 900, 'left');
    text(c, `TV · ${level.name} 📺`, rx, hy - lsz * 0.55, lsz, MAG, 900, 'right');
    const pr = lsz * 0.2, pg = lsz * 0.6;
    for (let i = 0; i < WIN; i++) {
      for (const [n, col, x0, dir] of [[you, CYAN, lx + pr, 1], [tv, MAG, rx - pr, -1]]) {
        const x = x0 + dir * i * pg, y = hy + lsz * 0.6;
        c.beginPath(); c.arc(x, y, pr, 0, Math.PI * 2);
        if (i < n) { c.fillStyle = col; c.fill(); } else { c.lineWidth = 2; c.strokeStyle = Kit.rgba(col, 0.45); c.stroke(); }
      }
    }
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, s = L.s;
    c.fillStyle = 'rgba(5,3,20,0.62)'; c.fillRect(0, 0, W, H);
    const wide = W > H;
    const titleY = L.top * 0.5;
    const tsz = Math.min(L.top * 0.62, W * 0.1);
    c.save(); c.translate(W / 2, titleY);
    neon(c, 'NEON', -tsz * 0.12, 0, tsz, CYAN, 'right');
    neon(c, 'PONG', tsz * 0.12, 0, tsz, MAG, 'left');
    c.restore();
    const cw = wide ? Math.min(W * 0.24, s * 44) : Math.min(W * 0.8, s * 60), ch = wide ? cw * 0.72 : Math.min(H * 0.15, cw * 0.32);
    const gap = s * 4;
    const total = wide ? cw * 3 + gap * 2 : ch * 3 + gap * 2;
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.52 - ch / 2 : H * 0.53 - total / 2;
    L.cards = LEVELS.map((m, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    text(c, Kit.touchFirst() ? 'Tap how good the TV is' : '◀ ▶ how good is the TV  ·  OK play  ·  Back for games', W / 2, y0 - s * 6, s * 3.6, 'rgba(255,255,255,0.88)', 700);
    LEVELS.forEach((m, i) => {
      const r = L.cards[i], on = i === levelIx;
      const k = on ? 1.06 + Math.sin(t * 5) * 0.012 : 1;
      const border = [CYAN, '#b98bff', MAG][i];
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, s * 3, on ? border : 'rgba(180,160,255,0.25)');
      if (on) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = Kit.rgba(border, 0.6); c.stroke(); }
      const won = wins[m.id] | 0;
      if (wide) {
        text(c, m.icon, 0, -r.h * 0.24, r.h * 0.26, '#fff', 400);
        text(c, m.name, 0, r.h * 0.04, r.h * 0.16, '#ffffff', 900);
        text(c, m.tip, 0, r.h * 0.2, r.h * 0.085, 'rgba(255,255,255,0.75)', 600);
        text(c, `🏆 ${won} ${won === 1 ? 'win' : 'wins'}`, 0, r.h * 0.36, r.h * 0.1, '#fff36b', 800);
      } else {
        text(c, m.icon, -r.w * 0.36, 0, r.h * 0.42, '#fff', 400);
        text(c, m.name, -r.w * 0.2, -r.h * 0.14, r.h * 0.26, '#ffffff', 900, 'left');
        text(c, m.tip, -r.w * 0.2, r.h * 0.2, r.h * 0.16, 'rgba(255,255,255,0.75)', 600, 'left');
        text(c, `🏆 ${won}`, r.w * 0.44, 0, r.h * 0.2, '#fff36b', 800, 'right');
      }
      c.restore();
    });
    const tipY = wide ? y0 + ch + s * 7 : y0 + total + s * 6;
    const tips = ['Hold ▲ ▼ to move', 'the ball speeds up every hit', 'hit with the paddle\'s edge to angle it', 'first to 7 wins'];
    if (wide) text(c, tips.join('  ·  '), W / 2, tipY, s * 3, 'rgba(255,255,255,0.7)', 600);
    else tips.forEach((tx, i) => text(c, tx, W / 2, tipY + i * s * 4, s * 3, 'rgba(255,255,255,0.7)', 600));
    const tw = totalWins();
    if (tw > 0) text(c, `🏆 ${tw} ${tw === 1 ? 'win' : 'wins'} in all  ·  longest rally ${bestRally}`, W / 2, tipY + (wide ? s * 5 : s * 17), s * 3, '#fff36b', 700);
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, s = L.s;
    const a = clamp((stateT - overT) / 0.4, 0, 1);
    c.fillStyle = `rgba(5,3,20,${0.7 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, s * 80), ph = Math.min(H * 0.86, s * 72);
    const col = won ? CYAN : MAG;
    panel(c, -pw / 2, -ph / 2, pw, ph, s * 4, col);
    neon(c, won ? 'You win!' : 'The TV wins', 0, -ph * 0.36, ph * 0.12, won ? '#fff36b' : MAG);
    const nsz = ph * 0.2;
    neon(c, String(you), -nsz * 0.75, -ph * 0.12, nsz, CYAN);
    text(c, '–', 0, -ph * 0.12, nsz * 0.6, 'rgba(255,255,255,0.7)', 800);
    neon(c, String(tv), nsz * 0.75, -ph * 0.12, nsz, MAG);
    const tw = totalWins();
    text(c, won ? `🏆 Wins: ${tw}   (${level.name}: ${wins[level.id] | 0})` : `TV level: ${level.name}   ·   🏆 Wins: ${tw}`, 0, ph * 0.07, ph * 0.055, '#ffffff', 800);
    text(c, newRally ? `🎉 New longest rally: ${longest}` : `Longest rally ${longest}   ·   best ${bestRally}`, 0, ph * 0.17, ph * 0.045, newRally ? '#fff36b' : 'rgba(255,255,255,0.75)', 700);
    const ready = canOk();
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.29, ph * 0.06, '#9ff4ff', 900);
    const bw = Math.min(pw * 0.6, s * 44), bh = ph * 0.1;
    roundRect(c, -bw / 2, ph * 0.355, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Change TV level' : 'Arrows  change TV level', 0, ph * 0.355 + bh / 2, ph * 0.042, 'rgba(255,255,255,0.88)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.355 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  toMenu();
  Kit.canvas.focus();
  if (totalWins() > 0) Kit.record('neonpong', totalWins());
})();
