// Carrom: flick the striker from your baseline and pocket all nine coins (white, black and the red
// queen) in as few shots as you can. If the striker falls in a pocket it is a foul and a coin comes back.
// Remote: Left/Right slide the striker, Up/Down aim, OK starts the power meter and OK again shoots.
// Touch/mouse: drag the striker along its line, or pull back from it like a slingshot and let go.
'use strict';

(() => {
  const { sfx, ease, roundRect, clamp, lerp } = Kit;
  const ID = 'carrompro';
  const B = 100; // the playing surface is 100 x 100 world units
  const COIN_R = 2.3, STRIKER_R = 3.1, COIN_M = 1, STRIKER_M = 1.6;
  const POCKET = 4.3, POCKET_R = 3.9, CAPTURE = 3.5;
  const BASE_Y = 85, BASE_MIN = 22, BASE_MAX = 78;
  const AIM_MIN = -Math.PI + 0.12, AIM_MAX = -0.12;
  const DECEL = 34, DAMP = 0.7, MIN_SPEED = 22, MAX_SPEED = 270;
  const E_COIN = 0.93, E_WALL = 0.72;
  const POCKETS = [[POCKET, POCKET], [B - POCKET, POCKET], [POCKET, B - POCKET], [B - POCKET, B - POCKET]];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const KIND = {
    0: { base: '#f3e4c4', ring: '#c4a678', notch: '#b08a55', name: 'white', burst: '#fff3d6' },
    1: { base: '#2c2420', ring: '#5d4f45', notch: '#80705f', name: 'black', burst: '#8a7a6c' },
    2: { base: '#e3263b', ring: '#ff9aa4', notch: '#99101f', name: 'queen', burst: '#ff4d6d' },
    9: { base: '#13a99a', ring: '#e9fffb', notch: '#0a6b61', name: 'striker', burst: '#5ef2e0' },
  };
  const ACCENT = '#ffb347', CYAN = '#5ef2ff';

  // ---------- Records ----------
  let best = Kit.store.get(ID + '.best', 0); // fewest shots to clear the board; 0 = not cleared yet

  // ---------- State ----------
  // state: 'menu' (a demo plays itself), 'play', 'won'. phase: 'aim' or 'moving' (pieces rolling).
  let state = 'menu', phase = 'aim', demo = true;
  let coins = [], striker, sinking = [], tray = [];
  let shots = 0, shownShots = 0, bump = 0, potThisShot = 0, strikerIn = false, stillT = 0;
  let aim = -Math.PI / 2, power = 0, charging = false, chargeT = 0, pulling = false;
  let stateT = 0, wonT = 0, newBest = false, paused = false, demoWait = 1.2, demoShots = 0;
  let glide = null, blockedT = -9;

  function body(x, y, kind) {
    const s = kind === 9;
    return { x, y, vx: 0, vy: 0, r: s ? STRIKER_R : COIN_R, m: s ? STRIKER_M : COIN_M, kind, rot: Math.random() * 6, on: true, born: -9 };
  }
  function reset(isDemo) {
    demo = isDemo;
    coins = [body(B / 2, B / 2, 2)];
    const ringR = COIN_R / Math.sin(Math.PI / 8) + 0.08;
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4 + Math.PI / 8;
      coins.push(body(B / 2 + Math.cos(a) * ringR, B / 2 + Math.sin(a) * ringR, i % 2));
    }
    striker = body(B / 2, BASE_Y, 9);
    sinking = []; tray = []; glide = null;
    shots = 0; shownShots = 0; bump = 0; potThisShot = 0; strikerIn = false;
    phase = 'aim'; power = 0; charging = false; pulling = false; demoShots = 0; demoWait = 1.2;
    aim = aimAtNearest();
  }
  const live = () => coins.filter((c) => c.on);
  const overlapsCoin = (x) => coins.some((c) => c.on && Math.hypot(c.x - x, c.y - BASE_Y) < COIN_R + STRIKER_R + 0.1);

  function aimAtNearest() {
    let bestC = null, bd = 1e9;
    for (const c of coins) {
      if (!c.on || c.y > striker.y - 1) continue;
      const d = Math.hypot(c.x - striker.x, c.y - striker.y);
      if (d < bd) { bd = d; bestC = c; }
    }
    if (!bestC) return -Math.PI / 2;
    return clamp(Math.atan2(bestC.y - striker.y, bestC.x - striker.x), AIM_MIN, AIM_MAX);
  }

  function start() {
    reset(false);
    state = 'play'; stateT = 0;
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.12, at: 0.08 });
    Kit.float('Pocket all 9 coins!', sx(B / 2), sy(B * 0.3), { color: ACCENT, size: L.fu * 1.5, life: 1.8, big: true });
  }

  // ---------- Shooting ----------
  function shoot(p) {
    if (phase !== 'aim' || glide) return;
    if (overlapsCoin(striker.x)) {
      blockedT = stateT;
      if (!demo) { sfx.nope(); Kit.float('Move the striker off the coin', sx(B / 2), sy(BASE_Y - 12), { color: '#ff8a8a', size: L.fu * 0.9 }); }
      charging = false; return;
    }
    const speed = MIN_SPEED + p * (MAX_SPEED - MIN_SPEED);
    striker.vx = Math.cos(aim) * speed; striker.vy = Math.sin(aim) * speed;
    phase = 'moving'; charging = false; pulling = false; stillT = 0;
    potThisShot = 0; strikerIn = false;
    if (!demo) {
      shots++; bump = 1;
      Kit.noise({ dur: 0.07, vol: 0.12 + p * 0.25, freq: 2600, q: 0.8 });
      Kit.tone(260 + p * 120, { type: 'triangle', dur: 0.07, vol: 0.2, slide: 0.6 });
    }
  }

  // ---------- Physics ----------
  let lastClick = 0;
  function click(rel, wall) {
    if (demo) return;
    const now = performance.now();
    if (now - lastClick < 28) return;
    lastClick = now;
    const v = clamp(rel / 170, 0.03, 0.4);
    if (wall) {
      Kit.noise({ dur: 0.09, vol: v * 0.7, freq: 380, q: 0.8, type: 'lowpass' });
      Kit.tone(110, { type: 'sine', dur: 0.09, vol: v * 0.6, slide: 0.7 });
    } else {
      Kit.tone(2000 + Math.random() * 700, { type: 'triangle', dur: 0.035, vol: v * 0.55 });
      Kit.noise({ dur: 0.04, vol: v * 0.45, freq: 4200, q: 1.4 });
    }
  }

  function physics(h) {
    const bodies = striker.on ? [striker, ...live()] : live();
    for (const b of bodies) {
      const v = Math.hypot(b.vx, b.vy);
      if (v > 0) {
        let nv = (v - DECEL * h) * (1 - DAMP * h);
        if (nv < 0.4) nv = 0;
        const f = nv / v;
        b.vx *= f; b.vy *= f;
        b.x += b.vx * h; b.y += b.vy * h;
        b.rot += (nv * h) / b.r * 0.6;
      }
      if (!b.on) continue;
      // Into a pocket?
      let gone = false;
      for (const [px, py] of POCKETS) {
        if (Math.hypot(b.x - px, b.y - py) < CAPTURE) { sink(b, px, py); gone = true; break; }
      }
      if (gone) continue;
      // Cushions.
      const r = b.r;
      if (b.x < r) { b.x = r; if (b.vx < 0) { click(-b.vx, true); b.vx = -b.vx * E_WALL; b.vy *= 0.97; } }
      if (b.x > B - r) { b.x = B - r; if (b.vx > 0) { click(b.vx, true); b.vx = -b.vx * E_WALL; b.vy *= 0.97; } }
      if (b.y < r) { b.y = r; if (b.vy < 0) { click(-b.vy, true); b.vy = -b.vy * E_WALL; b.vx *= 0.97; } }
      if (b.y > B - r) { b.y = B - r; if (b.vy > 0) { click(b.vy, true); b.vy = -b.vy * E_WALL; b.vx *= 0.97; } }
    }
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a.on) continue;
      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (!b.on) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
        if (Math.abs(dx) > rr || Math.abs(dy) > rr) continue;
        const d = Math.hypot(dx, dy);
        if (d >= rr || d <= 1e-6) continue;
        const nx = dx / d, ny = dy / d;
        const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
        const ia = 1 / a.m, ib = 1 / b.m;
        if (rel > 0) {
          const jm = (1 + E_COIN) * rel / (ia + ib);
          a.vx -= jm * ia * nx; a.vy -= jm * ia * ny;
          b.vx += jm * ib * nx; b.vy += jm * ib * ny;
          click(rel, false);
        }
        const push = (rr - d) / (ia + ib);
        a.x -= nx * push * ia; a.y -= ny * push * ia;
        b.x += nx * push * ib; b.y += ny * push * ib;
      }
    }
  }

  function sink(b, px, py) {
    b.on = false;
    const sp = Math.hypot(b.vx, b.vy);
    sinking.push({ b, px, py, ox: b.x - px, oy: b.y - py, t: 0, spin: (b.vx * (b.y - py) - b.vy * (b.x - px)) > 0 ? -1 : 1, sp });
    b.vx = 0; b.vy = 0;
    const X = sx(px), Y = sy(py);
    if (b === striker) {
      strikerIn = true;
      if (!demo) {
        sfx.nope(); Kit.shake(8, 0.3);
        Kit.float('Foul!', X, Y - L.fu, { color: '#ff6b6b', size: L.fu * 1.3, life: 1.3 });
      }
      return;
    }
    potThisShot++;
    tray.push({ kind: b.kind, t: stateT });
    Kit.burst(X, Y, KIND[b.kind].burst, 16, 0.7);
    Kit.burst(X, Y, ACCENT, 6, 0.5);
    if (demo) return;
    // A soft "plop" into the pocket, then a bright ding that climbs with each coin of the shot.
    Kit.noise({ dur: 0.16, vol: 0.28, freq: 320, q: 0.7, type: 'lowpass' });
    Kit.tone(420, { type: 'sine', dur: 0.22, vol: 0.28, slide: 0.45 });
    const n = NOTES[Math.min(NOTES.length - 1, 2 + potThisShot * 2)];
    Kit.tone(n, { type: 'triangle', dur: 0.3, vol: 0.16, at: 0.12 });
    Kit.tone(n * 2, { type: 'sine', dur: 0.2, vol: 0.06, at: 0.12 });
    if (b.kind === 2) {
      sfx.chime();
      Kit.float('Queen!', X + (px < B / 2 ? 1 : -1) * L.fu * 2.4, Y + (py < B / 2 ? 1 : -1) * L.fu * 1.6, { color: '#ff6b81', size: L.fu * 1.4, life: 1.3 });
    } else {
      Kit.float('+1', X + (px < B / 2 ? 1 : -1) * L.fu * 1.6, Y + (py < B / 2 ? 1 : -1) * L.fu * 1.2, { color: '#fff3d6', size: L.fu * 1.2 });
    }
    if (potThisShot >= 2) {
      const word = ['', '', 'Double!', 'Triple!', 'Super shot!'][Math.min(4, potThisShot)];
      Kit.float(word, sx(B / 2), sy(B * 0.38), { color: ACCENT, size: L.fu * 1.7, life: 1.3, big: true });
      Kit.shake(5, 0.25);
    }
  }

  function freeSpot(x0, y0) {
    for (let ring = 0; ring < 30; ring++) {
      const steps = ring === 0 ? 1 : ring * 8;
      for (let i = 0; i < steps; i++) {
        const a = (i / steps) * Math.PI * 2, x = x0 + Math.cos(a) * ring * 1.2, y = y0 + Math.sin(a) * ring * 1.2;
        if (coins.every((c) => !c.on || Math.hypot(c.x - x, c.y - y) > COIN_R * 2 + 0.1)) return [x, y];
      }
    }
    return [x0, y0];
  }

  function settle() {
    phase = 'aim';
    sinking = [];
    if (strikerIn) {
      // Foul: the last coin pocketed goes back to the middle.
      const back = [...coins].reverse().find((c) => !c.on && tray.length && c.kind === tray[tray.length - 1].kind);
      if (back) {
        tray.pop();
        const [x, y] = freeSpot(B / 2, B / 2);
        back.x = x; back.y = y; back.vx = 0; back.vy = 0; back.on = true; back.born = stateT;
        if (!demo) {
          Kit.float('A coin goes back', sx(x), sy(y) - L.fu * 1.6, { color: '#ffb0a0', size: L.fu * 0.9, life: 1.3 });
          Kit.tone(300, { type: 'triangle', dur: 0.18, vol: 0.16, slide: 1.6 });
        }
      }
    } else if (!demo && potThisShot === 0 && shots > 0) {
      Kit.tone(220, { type: 'sine', dur: 0.12, vol: 0.06 });
    }
    if (!live().length && !demo) { win(); return; }
    // The striker slides back to the baseline, near where it was.
    const from = { x: striker.on ? striker.x : striker.x, y: striker.y, a: striker.on ? 1 : 0 };
    let x = clamp(striker.x, BASE_MIN, BASE_MAX);
    if (!striker.on) x = clamp(lastBaseX, BASE_MIN, BASE_MAX);
    if (overlapsCoin(x)) {
      for (let d = 0.5; d < 60; d += 0.5) {
        if (x - d >= BASE_MIN && !overlapsCoin(x - d)) { x -= d; break; }
        if (x + d <= BASE_MAX && !overlapsCoin(x + d)) { x += d; break; }
      }
    }
    striker.on = true; striker.vx = 0; striker.vy = 0;
    glide = { fx: from.x, fy: from.y, fa: from.a, t: 0 };
    striker.x = x; striker.y = BASE_Y;
    aim = aimAtNearest();
    if (demo) demoWait = 1.1;
  }
  let lastBaseX = B / 2;

  function win() {
    state = 'won'; wonT = stateT;
    newBest = best === 0 || shots < best;
    if (newBest) { best = shots; Kit.store.set(ID + '.best', best); Kit.record(ID, best); }
    setTimeout(() => sfx.win(), 250);
    Kit.confetti(140);
  }

  // The menu's demo: a few shots at random coins, then a fresh board.
  function demoShot() {
    const left = live().filter((c) => c.y < BASE_Y - 6);
    if (!left.length || demoShots >= 6) { reset(true); return; }
    let x = 50;
    for (let i = 0; i < 20; i++) { x = BASE_MIN + Math.random() * (BASE_MAX - BASE_MIN); if (!overlapsCoin(x)) break; }
    striker.x = x; striker.y = BASE_Y; lastBaseX = x;
    const t = left[Math.floor(Math.random() * left.length)];
    aim = clamp(Math.atan2(t.y - BASE_Y, t.x - x) + (Math.random() - 0.5) * 0.08, AIM_MIN, AIM_MAX);
    demoShots++;
    shoot(demoShots === 1 ? 0.95 : 0.45 + Math.random() * 0.5);
  }

  // ---------- Held arrows (remotes repeat keydowns; keyup is not always sent) ----------
  const ARROWS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Left: 'left', Right: 'right', Up: 'up', Down: 'down',
    a: 'left', d: 'right', w: 'up', s: 'down', A: 'left', D: 'right', W: 'up', S: 'down' };
  const ACODES = { 37: 'left', 39: 'right', 38: 'up', 40: 'down' };
  const held = { left: null, right: null, up: null, down: null };
  let keyupSeen = false, moveTick = 0;
  const nowS = () => performance.now() / 1000;
  const canAim = () => state === 'play' && phase === 'aim' && !paused;
  window.addEventListener('keydown', (e) => {
    const d = ARROWS[e.key] || ACODES[e.keyCode];
    if (!d) return;
    const t = nowS();
    if (!held[d]) {
      held[d] = { since: t, last: t };
      if (!e.repeat) nudge(d);
    } else held[d].last = t;
  });
  window.addEventListener('keyup', (e) => {
    const d = ARROWS[e.key] || ACODES[e.keyCode];
    if (!d) return;
    keyupSeen = true; held[d] = null;
  });
  window.addEventListener('blur', () => { for (const k in held) held[k] = null; });

  function nudge(d) {
    if (!canAim()) return;
    if (d === 'left' || d === 'right') moveStriker(d === 'left' ? -0.7 : 0.7, true);
    else turnAim(d === 'up' ? -0.025 : 0.025, true);
  }
  function moveStriker(dx, tick) {
    const nx = clamp(striker.x + dx, BASE_MIN, BASE_MAX);
    if (nx === striker.x) return;
    striker.x = nx; lastBaseX = nx;
    if (tick) Kit.tone(900, { type: 'triangle', dur: 0.03, vol: 0.05 });
  }
  function turnAim(da, tick) {
    const na = clamp(aim + da, AIM_MIN, AIM_MAX);
    if (na === aim) return;
    aim = na;
    if (tick) Kit.tone(1300, { type: 'sine', dur: 0.025, vol: 0.04 });
  }
  function heldInput(dt) {
    const t = nowS();
    for (const d in held) {
      const h = held[d];
      if (!h) continue;
      if ((!keyupSeen && t - h.last > 0.6) || t - h.last > 5) { held[d] = null; continue; }
      if (!canAim()) continue;
      const age = t - h.since;
      if (age < 0.2) continue;
      const ramp = clamp((age - 0.2) / 0.9, 0, 1);
      if (d === 'left' || d === 'right') moveStriker((d === 'left' ? -1 : 1) * dt * lerp(14, 48, ramp), false);
      else turnAim((d === 'up' ? -1 : 1) * dt * lerp(0.35, 1.5, ramp), false);
      moveTick -= dt;
      if (moveTick <= 0) { moveTick = 0.09; Kit.tone(d === 'left' || d === 'right' ? 900 : 1300, { type: 'triangle', dur: 0.025, vol: 0.035 }); }
    }
  }

  // ---------- Keys for OK, mute, restart ----------
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { if (k === 'ok') start(); return; }
    if (state === 'won') { if (k === 'ok' && stateT - wonT > 1.2) start(); return; }
    if (paused) { paused = false; return; }
    if (k === 'restart') { start(); return; }
    if (k !== 'ok' || phase !== 'aim' || glide) return;
    if (!charging) {
      if (overlapsCoin(striker.x)) { shoot(0); return; }
      charging = true; chargeT = 0; power = 0;
      Kit.tone(440, { type: 'triangle', dur: 0.08, vol: 0.14, slide: 1.5 });
    } else shoot(power);
  });

  // ---------- Touch and mouse ----------
  let drag = null;
  const muteBox = () => (L.wide && L.Bp ? { x: L.Bp.x + L.Bp.w - 54, y: L.Bp.y + 6, w: 48, h: 48 } : { x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const toWorld = (x, y) => ({ x: (x - L.px) / L.k, y: (y - L.py) / L.k });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (state === 'menu') { start(); return; }
      if (state === 'won') { if (stateT - wonT > 1.2) start(); return; }
      paused = false;
      if (phase !== 'aim' || glide) return;
      const w = toWorld(e.x, e.y);
      charging = false;
      if (Math.hypot(w.x - striker.x, w.y - striker.y) < STRIKER_R * 2.4) drag = { mode: 'pull' };
      else if (Math.abs(w.y - BASE_Y) < 7) { drag = { mode: 'slide' }; moveStriker(w.x - striker.x, false); }
      else { drag = { mode: 'aim' }; aimAt(w); }
    },
    move(e) {
      if (!drag || phase !== 'aim') return;
      const w = toWorld(e.x, e.y);
      if (drag.mode === 'slide') moveStriker(w.x - striker.x, false);
      else if (drag.mode === 'aim') aimAt(w);
      else {
        const vx = striker.x - w.x, vy = striker.y - w.y, len = Math.hypot(vx, vy);
        if (len > 2) { aim = clamp(Math.atan2(vy, vx), AIM_MIN, AIM_MAX); power = clamp((len - 2) / 28, 0, 1); pulling = true; }
        else { pulling = false; power = 0; }
      }
    },
    up(e, cancel) {
      if (drag && drag.mode === 'pull' && pulling && !cancel && power > 0.03) shoot(power);
      pulling = false; drag = null;
      if (phase === 'aim') power = 0;
    },
  });
  function aimAt(w) { if (w.y < striker.y) aim = clamp(Math.atan2(w.y - striker.y, w.x - striker.x), AIM_MIN, AIM_MAX); }
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') paused = true; });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!striker) reset(true);
    shownShots += (shots - shownShots) * Math.min(1, dt * 10);
    if (Math.abs(shots - shownShots) < 0.05) shownShots = shots;
    bump = Math.max(0, bump - dt * 3);
    heldInput(dt);
    if (paused) return;
    if (glide) { glide.t += dt / 0.35; if (glide.t >= 1) glide = null; }
    if (charging) {
      chargeT += dt;
      const p = (chargeT % 1.6) / 0.8;
      power = p < 1 ? p : 2 - p;
    }
    for (const s of sinking) s.t += dt;
    if (phase === 'moving') {
      let maxV = 0;
      const all = striker.on ? [striker, ...coins] : coins;
      for (const b of all) if (b.on) maxV = Math.max(maxV, Math.abs(b.vx) + Math.abs(b.vy));
      const n = clamp(Math.ceil((maxV * dt) / 0.6), 1, 40);
      for (let i = 0; i < n; i++) physics(dt / n);
      const moving = all.some((b) => b.on && (b.vx || b.vy));
      const sinkingNow = sinking.some((s) => s.t < 0.6);
      if (!moving && !sinkingNow) { stillT += dt; if (stillT > 0.15) settle(); } else stillT = 0;
    } else if (state === 'menu' && !glide) {
      demoWait -= dt;
      if (demoWait <= 0) { demoWait = 99; demoShot(); }
    }
  }

  // ---------- Layout ----------
  let L = { S: 300, ox: 0, oy: 0, k: 3, px: 0, py: 0, fu: 24, wide: true };
  const boardPic = document.createElement('canvas');
  const sx = (x) => L.px + x * L.k, sy = (y) => L.py + y * L.k;
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H >= 1.25;
    let S, ox, oy, A, Bp, fu;
    if (wide) {
      S = Math.floor(Math.min(H * 0.92, W * 0.56));
      ox = Math.round((W - S) / 2); oy = Math.round((H - S) / 2);
      const m = Math.max(16, W * 0.02);
      A = { x: m, y: oy, w: ox - m * 2, h: S };
      Bp = { x: ox + S + m, y: oy, w: ox - m * 2, h: S };
      fu = Math.min(A.w / 9, H / 25);
    } else {
      S = Math.floor(Math.min(W * 0.96, H * 0.6));
      ox = Math.round((W - S) / 2); oy = Math.round(H * 0.19 + (H * 0.62 - S) / 2);
      A = { x: W * 0.04, y: H * 0.02, w: W * 0.92, h: oy - H * 0.03 };
      Bp = { x: W * 0.04, y: oy + S + H * 0.01, w: W * 0.92, h: H - oy - S - H * 0.03 };
      fu = Math.min(W / 20, A.h / 4.2);
    }
    const frame = S * 0.065, k = (S - frame * 2) / B;
    L = { S, ox, oy, k, px: ox + frame, py: oy + frame, fu, wide, A, Bp, frame };
    sprites.clear();
    drawBoard();
  }
  Kit.onResize(layout);

  // Board, coins and meters are drawn once per size (gradients are slow on TV boxes).
  const sprites = new Map();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function sprite(name, w, h, draw) {
    const key = name + Math.round(w) + 'x' + Math.round(h);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = DPR();
    s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w * dpr)); s.height = Math.max(1, Math.ceil(h * dpr));
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, w, h);
    sprites.set(key, s);
    return s;
  }

  function seeded(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function drawBoard() {
    const { S, frame, k } = L, pad = Math.ceil(S * 0.05), dpr = DPR();
    boardPic.width = Math.ceil((S + pad * 2) * dpr); boardPic.height = boardPic.width;
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.translate(pad, pad);
    const rnd = seeded(7);
    // Soft drop shadow (blur is fine here: it is drawn once).
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.65)'; c.shadowBlur = S * 0.04; c.shadowOffsetY = S * 0.015;
    roundRect(c, 0, 0, S, S, S * 0.035); c.fillStyle = '#3b1c0b'; c.fill();
    c.restore();
    // Walnut frame with grain.
    roundRect(c, 0, 0, S, S, S * 0.035);
    let g = c.createLinearGradient(0, 0, S, S);
    g.addColorStop(0, '#7a3c18'); g.addColorStop(0.5, '#5a2a10'); g.addColorStop(1, '#3d1b08');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, 0, 0, S, S, S * 0.035); c.clip();
    c.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      c.strokeStyle = rnd() < 0.5 ? 'rgba(0,0,0,0.13)' : 'rgba(255,190,130,0.07)';
      const y = rnd() * S, x0 = rnd() * S;
      c.beginPath(); c.moveTo(x0 - S * 0.3, y);
      c.bezierCurveTo(x0, y + (rnd() - 0.5) * 8, x0 + S * 0.2, y + (rnd() - 0.5) * 8, x0 + S * 0.5, y + (rnd() - 0.5) * 4);
      c.stroke();
    }
    c.restore();
    // Bevel: light top-left edge, dark inner lip.
    c.lineWidth = Math.max(1.5, S * 0.004);
    roundRect(c, 1, 1, S - 2, S - 2, S * 0.035); c.strokeStyle = 'rgba(255,200,150,0.35)'; c.stroke();
    const f = frame;
    roundRect(c, f - S * 0.012, f - S * 0.012, S - 2 * f + S * 0.024, S - 2 * f + S * 0.024, S * 0.012);
    c.fillStyle = '#26100a'; c.fill();
    // Maple playing surface.
    const P = S - 2 * f;
    c.save();
    c.beginPath(); c.rect(f, f, P, P); c.clip();
    g = c.createLinearGradient(f, f, f + P, f + P);
    g.addColorStop(0, '#f6dfae'); g.addColorStop(0.5, '#ecd096'); g.addColorStop(1, '#ddb879');
    c.fillStyle = g; c.fillRect(f, f, P, P);
    for (let i = 0; i < 140; i++) {
      c.strokeStyle = `rgba(150,95,40,${0.03 + rnd() * 0.06})`;
      c.lineWidth = 0.6 + rnd() * 1.4;
      const y = f + rnd() * P;
      c.beginPath(); c.moveTo(f, y);
      c.bezierCurveTo(f + P * 0.3, y + (rnd() - 0.5) * 10, f + P * 0.7, y + (rnd() - 0.5) * 10, f + P, y + (rnd() - 0.5) * 6);
      c.stroke();
    }
    // Printed lines.
    const X = (v) => f + v * k;
    const ink = '#4a220e', red = '#c8102e', lw = Math.max(1.2, k * 0.32);
    c.lineWidth = lw; c.strokeStyle = ink;
    c.save();
    for (let side = 0; side < 4; side++) {
      c.save();
      c.translate(X(50), X(50)); c.rotate(side * Math.PI / 2); c.translate(-X(50), -X(50));
      // Baseline: two lines joined by red circles.
      c.beginPath(); c.moveTo(X(BASE_MIN), X(BASE_Y - STRIKER_R)); c.lineTo(X(BASE_MAX), X(BASE_Y - STRIKER_R));
      c.moveTo(X(BASE_MIN), X(BASE_Y + STRIKER_R)); c.lineTo(X(BASE_MAX), X(BASE_Y + STRIKER_R)); c.stroke();
      for (const bx of [BASE_MIN, BASE_MAX]) {
        c.beginPath(); c.arc(X(bx), X(BASE_Y), STRIKER_R * k, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.arc(X(bx), X(BASE_Y), STRIKER_R * k * 0.68, 0, Math.PI * 2); c.fillStyle = red; c.fill();
      }
      // Corner arrow toward the middle, with its curl.
      c.beginPath(); c.moveTo(X(10.5), X(B - 10.5)); c.lineTo(X(30), X(B - 30)); c.stroke();
      c.beginPath(); c.arc(X(30), X(B - 30), 3.2 * k, Math.PI * 0.75 - 1.25, Math.PI * 0.75 + 1.25); c.stroke();
      c.beginPath(); c.moveTo(X(13.5), X(B - 10.2)); c.lineTo(X(10.5), X(B - 10.5)); c.lineTo(X(10.8), X(B - 13.5)); c.stroke();
      c.restore();
    }
    c.restore();
    // Middle: two circles, a red heart and a star rosette.
    c.beginPath(); c.arc(X(50), X(50), 13 * k, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.arc(X(50), X(50), 12 * k, 0, Math.PI * 2); c.lineWidth = lw * 0.6; c.stroke();
    c.save(); c.translate(X(50), X(50));
    c.beginPath();
    for (let i = 0; i < 16; i++) {
      const r = (i % 2 ? 4.2 : 11) * k, a = (i * Math.PI) / 8 - Math.PI / 2;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fillStyle = 'rgba(200,16,46,0.12)'; c.fill(); c.lineWidth = lw * 0.7; c.stroke();
    c.beginPath(); c.arc(0, 0, 2.8 * k, 0, Math.PI * 2); c.fillStyle = red; c.fill(); c.lineWidth = lw; c.stroke();
    c.restore();
    // Pockets: deep holes with a dark lip.
    for (const [px, py] of POCKETS) {
      const x = X(px), y = X(py), r = POCKET_R * k;
      const pg = c.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
      pg.addColorStop(0, '#000'); pg.addColorStop(0.75, '#120804'); pg.addColorStop(1, '#3a1d0c');
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = pg; c.fill();
      c.lineWidth = Math.max(1.5, k * 0.45); c.strokeStyle = '#2a1206'; c.stroke();
      c.beginPath(); c.arc(x, y, r + k * 0.45, Math.PI * 0.1, Math.PI * 0.9); c.strokeStyle = 'rgba(255,240,210,0.35)'; c.lineWidth = Math.max(1, k * 0.25); c.stroke();
    }
    // Vignette and a soft sheen.
    g = c.createRadialGradient(f + P * 0.42, f + P * 0.38, P * 0.1, f + P / 2, f + P / 2, P * 0.75);
    g.addColorStop(0, 'rgba(255,250,230,0.18)'); g.addColorStop(0.6, 'rgba(255,240,200,0)'); g.addColorStop(1, 'rgba(70,30,5,0.32)');
    c.fillStyle = g; c.fillRect(f, f, P, P);
    // Inner shadow from the frame's lip.
    c.lineWidth = k * 1.2; c.strokeStyle = 'rgba(40,15,0,0.25)'; c.strokeRect(f, f, P, P);
    c.restore();
    L.pad = pad;
  }

  // A coin's printed face (it turns as the coin moves) and a fixed glossy light on top.
  const faceSprite = (kind, d) => sprite('face' + kind, d, d, (c, s) => {
    const K = KIND[kind], R = s / 2;
    c.translate(R, R);
    c.beginPath(); c.arc(0, 0, R - 0.5, 0, Math.PI * 2); c.fillStyle = K.base; c.fill();
    if (kind === 9) {
      c.beginPath(); c.arc(0, 0, R * 0.86, 0, Math.PI * 2); c.lineWidth = R * 0.16; c.strokeStyle = K.ring; c.stroke();
      c.beginPath();
      for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.2 : 0.5) * R, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = R * 0.05; c.strokeStyle = '#a36a00'; c.stroke();
      c.beginPath(); c.arc(0, 0, R * 0.64, 0, Math.PI * 2); c.lineWidth = R * 0.04; c.strokeStyle = 'rgba(255,255,255,0.5)'; c.stroke();
    } else {
      c.lineWidth = R * 0.08; c.strokeStyle = K.ring;
      c.beginPath(); c.arc(0, 0, R * 0.74, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.arc(0, 0, R * 0.42, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = K.notch; c.lineWidth = R * 0.07;
      for (let i = 0; i < 12; i++) {
        const a = i * Math.PI / 6;
        c.beginPath(); c.moveTo(Math.cos(a) * R * 0.8, Math.sin(a) * R * 0.8); c.lineTo(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93); c.stroke();
      }
      if (kind === 2) { c.beginPath(); c.arc(0, 0, R * 0.22, 0, Math.PI * 2); c.fillStyle = '#ffd23f'; c.fill(); }
      else { c.beginPath(); c.arc(R * 0.18, 0, R * 0.08, 0, Math.PI * 2); c.fillStyle = K.notch; c.fill(); }
    }
  });
  const glossSprite = (d) => sprite('gloss', d, d, (c, s) => {
    const R = s / 2;
    c.translate(R, R);
    c.beginPath(); c.arc(0, 0, R - 0.5, 0, Math.PI * 2); c.clip();
    const g = c.createRadialGradient(-R * 0.35, -R * 0.4, 0, 0, 0, R * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,0.6)'); g.addColorStop(0.25, 'rgba(255,255,255,0.18)');
    g.addColorStop(0.55, 'rgba(255,255,255,0)'); g.addColorStop(0.85, 'rgba(0,0,0,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0.5)');
    c.fillStyle = g; c.fillRect(-R, -R, s, s);
    c.beginPath(); c.ellipse(-R * 0.32, -R * 0.42, R * 0.32, R * 0.16, -0.6, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.fill();
    c.beginPath(); c.arc(0, 0, R - 0.8, 0, Math.PI * 2); c.lineWidth = Math.max(1, R * 0.06); c.strokeStyle = 'rgba(0,0,0,0.35)'; c.stroke();
  });
  const shadowSprite = (d) => sprite('shadow', d * 1.5, d * 1.5, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(40,15,0,0.55)'); g.addColorStop(0.55, 'rgba(40,15,0,0.3)'); g.addColorStop(1, 'rgba(40,15,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const meterSprite = (w, h, vertical) => sprite('meter' + vertical, w, h, (c) => {
    const g = vertical ? c.createLinearGradient(0, h, 0, 0) : c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#3bdc84'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(0.8, '#ff9f1c'); g.addColorStop(1, '#ff3b5c');
    roundRect(c, 0, 0, w, h, Math.min(w, h) / 2); c.fillStyle = g; c.fill();
    const s = c.createLinearGradient(0, 0, vertical ? w : 0, vertical ? 0 : h);
    s.addColorStop(0, 'rgba(255,255,255,0.35)'); s.addColorStop(0.5, 'rgba(255,255,255,0)'); s.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = s; c.fill();
  });

  function drawPiece(c, b, x, y, scale = 1, alpha = 1) {
    const d = b.r * 2 * L.k, D = d * scale;
    if (D < 1) return;
    c.globalAlpha = alpha;
    c.save(); c.translate(x, y); c.rotate(b.rot);
    c.drawImage(faceSprite(b.kind, d), -D / 2, -D / 2, D, D);
    c.restore();
    c.drawImage(glossSprite(d), x - D / 2, y - D / 2, D, D);
    c.globalAlpha = 1;
  }
  function drawShadow(c, b, x, y, scale = 1, alpha = 1) {
    const d = b.r * 2 * L.k, D = d * 1.5 * scale;
    c.globalAlpha = alpha;
    c.drawImage(shadowSprite(d), x - D / 2 + d * 0.1, y - D / 2 + d * 0.16, D, D);
    c.globalAlpha = 1;
  }

  // ---------- Aim guide: where the striker goes, and where a coin it hits would go ----------
  function rayCircle(ox, oy, dx, dy, cx, cy, R) {
    const fx = ox - cx, fy = oy - cy;
    const b = fx * dx + fy * dy, cc = fx * fx + fy * fy - R * R;
    const disc = b * b - cc;
    if (disc < 0) return -1;
    const t = -b - Math.sqrt(disc);
    return t > 0.01 ? t : -1;
  }
  function trace(ox, oy, dx, dy, r) {
    let tWall = 1e9, nWall = null;
    if (dx < 0) { const t = (r - ox) / dx; if (t < tWall) { tWall = t; nWall = 'x'; } }
    if (dx > 0) { const t = (B - r - ox) / dx; if (t < tWall) { tWall = t; nWall = 'x'; } }
    if (dy < 0) { const t = (r - oy) / dy; if (t < tWall) { tWall = t; nWall = 'y'; } }
    if (dy > 0) { const t = (B - r - oy) / dy; if (t < tWall) { tWall = t; nWall = 'y'; } }
    let tHit = 1e9, hit = null;
    for (const cn of coins) {
      if (!cn.on) continue;
      const t = rayCircle(ox, oy, dx, dy, cn.x, cn.y, r + cn.r);
      if (t > 0 && t < tHit) { tHit = t; hit = cn; }
    }
    if (hit && tHit < tWall) return { t: tHit, hit };
    return { t: Math.max(0, tWall), wall: nWall };
  }
  function dotted(c, pts, color, width, alpha, t) {
    c.save();
    c.globalAlpha = alpha; c.strokeStyle = color; c.lineWidth = width; c.lineCap = 'round';
    c.setLineDash([0.01, width * 2.6]); c.lineDashOffset = -t * width * 8;
    c.beginPath(); c.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
    c.stroke(); c.restore();
  }
  function drawAim(c, t) {
    const k = L.k, dx = Math.cos(aim), dy = Math.sin(aim);
    const blocked = overlapsCoin(striker.x);
    const first = trace(striker.x, striker.y, dx, dy, STRIKER_R);
    let ex = striker.x + dx * first.t, ey = striker.y + dy * first.t;
    const pts = [sx(striker.x + dx * STRIKER_R * 1.3), sy(striker.y + dy * STRIKER_R * 1.3), sx(ex), sy(ey)];
    dotted(c, pts, blocked ? '#ff6b6b' : '#ffffff', Math.max(3, k * 0.75), 0.95, t);
    if (first.hit) {
      const h = first.hit, nx = (h.x - ex) / (h.r + STRIKER_R), ny = (h.y - ey) / (h.r + STRIKER_R);
      // Ghost striker at the touch point.
      c.save(); c.globalAlpha = 0.55; c.strokeStyle = '#ffffff'; c.lineWidth = Math.max(2, k * 0.35);
      c.setLineDash([k * 0.9, k * 0.6]);
      c.beginPath(); c.arc(sx(ex), sy(ey), STRIKER_R * k, 0, Math.PI * 2); c.stroke(); c.restore();
      // The coin's path, with an arrow, and where the striker glances off.
      const len = 9 + 16 * (charging || pulling ? power : 0.6);
      const cx2 = h.x + nx * len, cy2 = h.y + ny * len;
      dotted(c, [sx(h.x + nx * h.r * 1.3), sy(h.y + ny * h.r * 1.3), sx(cx2), sy(cy2)], CYAN, Math.max(3, k * 0.7), 0.95, t);
      const ah = k * 1.6, a = Math.atan2(ny, nx);
      c.fillStyle = CYAN;
      c.beginPath(); c.moveTo(sx(cx2) + Math.cos(a) * ah, sy(cy2) + Math.sin(a) * ah);
      c.lineTo(sx(cx2) + Math.cos(a + 2.5) * ah, sy(cy2) + Math.sin(a + 2.5) * ah);
      c.lineTo(sx(cx2) + Math.cos(a - 2.5) * ah, sy(cy2) + Math.sin(a - 2.5) * ah); c.fill();
      const dot = dx * nx + dy * ny, tx = dx - dot * nx, ty = dy - dot * ny, tl = Math.hypot(tx, ty);
      if (tl > 0.05) dotted(c, [sx(ex), sy(ey), sx(ex + (tx / tl) * len * 0.6), sy(ey + (ty / tl) * len * 0.6)], '#ffffff', Math.max(2, k * 0.45), 0.35, t);
      c.save(); c.globalAlpha = 0.5 + Math.sin(t * 8) * 0.25; c.strokeStyle = CYAN; c.lineWidth = Math.max(2, k * 0.4);
      c.beginPath(); c.arc(sx(h.x), sy(h.y), (h.r + 0.7) * k, 0, Math.PI * 2); c.stroke(); c.restore();
    } else if (first.wall) {
      // One bounce off the cushion, fading.
      const rdx = first.wall === 'x' ? -dx : dx, rdy = first.wall === 'y' ? -dy : dy;
      const second = trace(ex, ey, rdx, rdy, STRIKER_R);
      const l2 = Math.min(second.t, 30);
      dotted(c, [sx(ex), sy(ey), sx(ex + rdx * l2), sy(ey + rdy * l2)], '#ffffff', Math.max(2.5, k * 0.6), 0.45, t);
      c.save(); c.globalAlpha = 0.4; c.strokeStyle = '#fff'; c.lineWidth = Math.max(2, k * 0.3); c.setLineDash([k * 0.9, k * 0.6]);
      c.beginPath(); c.arc(sx(ex), sy(ey), STRIKER_R * k, 0, Math.PI * 2); c.stroke(); c.restore();
    }
  }

  // ---------- Text helpers ----------
  const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(30,10,0,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(92,46,20,0.92)'); g.addColorStop(1, 'rgba(38,16,6,0.94)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }
  function fitText(c, str, maxW, size, weight = 800) {
    c.font = `${weight} ${Math.round(size)}px ${FONT}`;
    const w = c.measureText(str).width;
    return w > maxW ? size * maxW / w : size;
  }

  // ---------- Drawing ----------
  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#3a1c0c', '#0e0603', 'rgba(255,150,60,0.10)');
    if (!striker || !L.pad) return;
    const k = L.k;
    c.drawImage(boardPic, L.ox - L.pad, L.oy - L.pad, L.S + L.pad * 2, L.S + L.pad * 2);

    // Sinking pieces spiral into the hole and fade.
    for (const s of sinking) {
      const e = clamp(s.t / 0.55, 0, 1), ee = ease.inOut(e);
      const ang = s.spin * ee * 4.5, d = 1 - ee;
      const x = s.px + (s.ox * Math.cos(ang) - s.oy * Math.sin(ang)) * d, y = s.py + (s.ox * Math.sin(ang) + s.oy * Math.cos(ang)) * d;
      s.b.rot += 0.2;
      if (e < 1) drawPiece(c, s.b, sx(x), sy(y), 1 - e * 0.55, 1 - e * e);
    }
    // Shadows, then pieces.
    const showStriker = striker.on && (state !== 'won');
    let stx = sx(striker.x), sty = sy(striker.y), sa = 1;
    if (glide) {
      const g = ease.out(clamp(glide.t, 0, 1));
      stx = lerp(sx(glide.fx), stx, g); sty = lerp(sy(glide.fy), sty, g); sa = lerp(glide.fa, 1, g);
    }
    for (const b of coins) if (b.on) drawShadow(c, b, sx(b.x), sy(b.y), popScale(b));
    if (showStriker) drawShadow(c, striker, stx, sty, 1, sa);
    if (state === 'play' && phase === 'aim' && !glide) drawAim(c, t);
    for (const b of coins) if (b.on) drawPiece(c, b, sx(b.x), sy(b.y), popScale(b));
    if (showStriker) {
      if (phase === 'aim' && state === 'play' && !glide) {
        const blocked = overlapsCoin(striker.x);
        c.save();
        c.globalAlpha = 0.45 + Math.sin(t * 5) * 0.2;
        c.strokeStyle = blocked ? '#ff4d4d' : '#5ef2e0'; c.lineWidth = Math.max(2, k * 0.45);
        c.beginPath(); c.arc(stx, sty, (STRIKER_R + 1 + Math.sin(t * 5) * 0.25) * k, 0, Math.PI * 2); c.stroke();
        c.restore();
        if (charging || pulling) {
          c.save(); c.lineCap = 'round';
          c.lineWidth = k * 0.9; c.strokeStyle = 'rgba(0,0,0,0.35)';
          c.beginPath(); c.arc(stx, sty, (STRIKER_R + 2.2) * k, 0, Math.PI * 2); c.stroke();
          c.strokeStyle = powerColor(power);
          c.beginPath(); c.arc(stx, sty, (STRIKER_R + 2.2) * k, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.01, power)); c.stroke();
          c.restore();
        }
      }
      drawPiece(c, striker, stx, sty, 1, sa);
    }
    if (state === 'play' && stateT - blockedT < 1.2 && Math.sin(t * 20) > 0) {
      c.strokeStyle = '#ff4d4d'; c.lineWidth = 3;
      c.beginPath(); c.arc(stx, sty, (STRIKER_R + 0.4) * k, 0, Math.PI * 2); c.stroke();
    }

    if (L.wide) drawSides(c, t); else drawStrips(c, t);

    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (paused) {
      c.fillStyle = 'rgba(14,6,2,0.6)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.44, L.fu * 2.4, '#ffffff', ACCENT);
      text(c, 'Press any key to carry on', W / 2, H * 0.56, L.fu, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'won') drawWon(c, t);
  }
  function popScale(b) {
    const a = stateT - b.born;
    return a < 0.5 ? Math.max(0.01, ease.back(clamp(a / 0.5, 0, 1))) : 1;
  }
  function powerColor(p) { return p < 0.45 ? '#3bdc84' : p < 0.75 ? '#ffd23f' : p < 0.9 ? '#ff9f1c' : '#ff3b5c'; }

  function drawTray(c, x, y, w, size, t) {
    // Nine slots: pocketed coins drop in with a bounce.
    const cols = 5, gap = size * 0.25, rows = 2;
    const tw = cols * size + (cols - 1) * gap;
    const x0 = x + (w - tw) / 2;
    for (let i = 0; i < 9; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      const cx = x0 + col * (size + gap) + size / 2 + (row ? (size + gap) / 2 : 0), cy = y + row * (size + gap) + size / 2;
      c.beginPath(); c.arc(cx, cy, size / 2, 0, Math.PI * 2); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,200,140,0.18)'; c.stroke();
      const it = tray[i];
      if (it) {
        const a = clamp((stateT - it.t) / 0.45, 0, 1), s = size * 0.92 * ease.back(a);
        if (s > 1) {
          const d = Math.max(4, Math.round(size));
          c.drawImage(faceSprite(it.kind, d), cx - s / 2, cy - s / 2, s, s);
          c.drawImage(glossSprite(d), cx - s / 2, cy - s / 2, s, s);
        }
      }
    }
    return rows * size + gap;
  }

  function drawSides(c, t) {
    const { A, Bp, fu } = L;
    // Left: title, shots, best, pocketed coins.
    panel(c, A.x, A.y, A.w, A.h, fu * 0.8, 'rgba(255,179,71,0.35)');
    const cx = A.x + A.w / 2;
    let y = A.y + fu * 1.6;
    outlined(c, 'CARROM', cx, y, fitText(c, 'CARROM', A.w * 0.8, fu * 1.9, 900), '#fff3d6', ACCENT);
    y += fu * 2.0;
    text(c, state === 'menu' ? 'BEST' : 'SHOTS', cx, y, fu * 0.75, 'rgba(255,220,180,0.7)', 800);
    y += fu * 1.9;
    c.save(); c.translate(cx, y); const s = 1 + bump * 0.25; c.scale(s, s);
    if (state === 'menu') outlined(c, best ? String(best) : '?', 0, 0, fu * 3, '#fff6c2', '#ffb703');
    else outlined(c, String(Math.round(shownShots)), 0, 0, fu * 3, '#ffffff', '#ffd9a0');
    c.restore();
    y += fu * 2.0;
    if (state === 'menu') text(c, best ? 'shots to clear the board' : 'clear the board to set one', cx, y, fitText(c, 'clear the board to set one', A.w * 0.88, fu * 0.72, 700), 'rgba(255,255,255,0.75)', 700);
    else text(c, best ? `👑 Best ${best} shots` : '👑 No best yet', cx, y, fitText(c, '👑 Best 99 shots', A.w * 0.86, fu * 0.85), '#ffd23f', 800);
    y += fu * 1.3;
    c.fillStyle = 'rgba(255,200,140,0.18)'; c.fillRect(A.x + A.w * 0.12, y, A.w * 0.76, 2);
    y += fu * 1.1;
    text(c, `POCKETED  ${tray.length}/9`, cx, y, fu * 0.75, 'rgba(255,220,180,0.75)', 800);
    y += fu * 0.9;
    const size = Math.min(fu * 1.5, (A.w * 0.86) / 6.2);
    drawTray(c, A.x, y, A.w, size, t);
    // Right: power meter and controls.
    panel(c, Bp.x, Bp.y, Bp.w, Bp.h, fu * 0.8, 'rgba(255,179,71,0.35)');
    const rx = Bp.x + Bp.w / 2;
    text(c, 'POWER', rx, Bp.y + fu * 1.3, fu * 0.8, 'rgba(255,220,180,0.75)', 800);
    const mw = fu * 1.3, mh = Bp.h * 0.42, mx = rx - mw / 2, my = Bp.y + fu * 2.2;
    roundRect(c, mx - 4, my - 4, mw + 8, mh + 8, mw / 2 + 4); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
    const p = phase === 'aim' && (charging || pulling) ? power : 0;
    if (p > 0.005) {
      const fh = mh * p;
      c.save(); c.beginPath(); c.rect(mx, my + mh - fh, mw, fh); c.clip();
      c.drawImage(meterSprite(mw, mh, true), mx, my, mw, mh);
      c.restore();
      c.fillStyle = '#fff'; c.fillRect(mx - 8, my + mh - fh - 2, mw + 16, 4);
    }
    for (let i = 1; i < 4; i++) { c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(mx + mw * 0.15, my + mh * i / 4, mw * 0.7, 2); }
    text(c, `${Math.round(p * 100)}%`, rx, my + mh + fu * 1.1, fu * 1.1, p > 0 ? powerColor(p) : 'rgba(255,255,255,0.45)', 900);
    let hy = my + mh + fu * 2.6;
    const lines = state === 'menu'
      ? [['OK', 'play'], ['◀ ▶', 'move striker'], ['▲ ▼', 'aim'], ['OK', 'power, OK shoot']]
      : charging ? [['OK', 'shoot now!'], ['◀ ▶ ▲ ▼', 'still adjust']]
        : phase === 'moving' ? [['', 'rolling…']] : [['◀ ▶', 'move striker'], ['▲ ▼', 'aim'], ['OK', 'power meter'], ['Back', 'games']];
    const hs = fitText(c, 'OK  power, OK shoot', Bp.w * 0.86, fu * 0.78, 700);
    for (const [key, what] of lines) {
      if (hy > Bp.y + Bp.h - fu * 0.6) break;
      c.font = `900 ${Math.round(hs)}px ${FONT}`;
      const kw = key ? c.measureText(key).width + hs * 0.8 : 0;
      c.font = `700 ${Math.round(hs)}px ${FONT}`;
      const ww = c.measureText(what).width, total = kw + (key ? hs * 0.4 : 0) + ww;
      let x = rx - total / 2;
      if (key) {
        roundRect(c, x, hy - hs * 0.75, kw, hs * 1.5, hs * 0.35); c.fillStyle = 'rgba(255,179,71,0.22)'; c.fill();
        text(c, key, x + kw / 2, hy, hs, '#ffd9a0', 900);
        x += kw + hs * 0.4;
      }
      text(c, what, x, hy, hs, 'rgba(255,255,255,0.85)', 700, 'left');
      hy += hs * 1.9;
    }
  }

  function drawStrips(c, t) {
    const { A, Bp, fu } = L;
    panel(c, A.x, A.y, A.w, A.h, fu * 0.6, 'rgba(255,179,71,0.35)');
    const cy = A.y + A.h / 2;
    outlined(c, 'CARROM', A.x + fu * 0.6, cy - A.h * 0.18, fu * 1.3, '#fff3d6', ACCENT, 'left');
    text(c, best ? `👑 Best ${best} shots` : '👑 No best yet', A.x + fu * 0.6, cy + A.h * 0.22, fu * 0.7, '#ffd23f', 800, 'left');
    c.save(); c.translate(A.x + A.w - fu * 2, cy); const s = 1 + bump * 0.25; c.scale(s, s);
    outlined(c, String(Math.round(shownShots)), 0, -fu * 0.2, fu * 2, '#ffffff', '#ffd9a0');
    c.restore();
    text(c, 'SHOTS', A.x + A.w - fu * 2, cy + A.h * 0.32, fu * 0.55, 'rgba(255,220,180,0.7)', 800);
    panel(c, Bp.x, Bp.y, Bp.w, Bp.h, fu * 0.6, 'rgba(255,179,71,0.35)');
    const mw = Bp.w * 0.8, mh = Math.max(10, fu * 0.6), mx = Bp.x + Bp.w * 0.1, my = Bp.y + fu * 0.6;
    roundRect(c, mx, my, mw, mh, mh / 2); c.fillStyle = 'rgba(0,0,0,0.45)'; c.fill();
    const p = phase === 'aim' && (charging || pulling) ? power : 0;
    if (p > 0.005) { c.save(); c.beginPath(); c.rect(mx, my, mw * p, mh); c.clip(); c.drawImage(meterSprite(mw, mh, false), mx, my, mw, mh); c.restore(); }
    const size = Math.min(fu * 1.1, Bp.h * 0.25);
    drawTray(c, Bp.x, my + mh + fu * 0.5, Bp.w, size, t);
  }

  function drawMenu(c, t) {
    const { fu } = L;
    const cx = sx(B / 2), cy = sy(B * 0.9);
    const pulse = 1 + Math.sin(t * 4) * 0.04;
    const w = Math.min(L.S * 0.6, fu * 11), h = fu * 2.2;
    c.save(); c.translate(cx, cy); c.scale(pulse, pulse);
    roundRect(c, -w / 2, -h / 2, w, h, h / 2);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#ffcf7a'); g.addColorStop(1, '#e8840f');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = '#fff0cf'; c.stroke();
    text(c, Kit.touchFirst() ? 'Tap to play' : 'OK  to play', 0, 2, fitText(c, 'OK  to play', w * 0.8, fu * 1.15, 900), '#3a1a06', 900);
    c.restore();
    const tag = 'Pocket all 9 coins in as few shots as you can';
    const ts = fitText(c, tag, L.S * 0.9, fu * 0.85, 800);
    c.save();
    c.font = `800 ${Math.round(ts)}px ${FONT}`;
    const tw = c.measureText(tag).width + ts * 1.6;
    roundRect(c, cx - tw / 2, sy(B * 0.1) - ts, tw, ts * 2, ts);
    c.fillStyle = 'rgba(30,12,4,0.72)'; c.fill();
    c.restore();
    text(c, tag, cx, sy(B * 0.1), ts, '#fff3d6', 800);
  }

  function drawWon(c, t) {
    const W = Kit.W, H = Kit.H, { fu } = L;
    const a = clamp((stateT - wonT - 0.5) / 0.45, 0, 1);
    c.fillStyle = `rgba(14,6,2,${0.65 * a})`; c.fillRect(0, 0, W, H);
    if (a <= 0) return;
    c.save();
    c.translate(W / 2, H / 2); const s = ease.back(a); c.scale(s, s);
    const pw = Math.min(W * 0.86, fu * 17), ph = fu * 12.5;
    panel(c, -pw / 2, -ph / 2, pw, ph, fu, ACCENT);
    outlined(c, 'Board cleared!', 0, -ph * 0.36, fitText(c, 'Board cleared!', pw * 0.85, fu * 2.1, 900), '#ffffff', '#ffd9a0');
    outlined(c, String(shots), 0, -ph * 0.1, fu * 3.6, '#fff6c2', '#ffb703');
    text(c, shots === 1 ? 'shot' : 'shots', 0, ph * 0.07, fu * 0.95, 'rgba(255,230,200,0.85)', 800);
    text(c, newBest ? '🎉 New best!' : `👑 Best ${best} shots`, 0, ph * 0.2, fu * 1.05, '#ffd23f', 900);
    const ready = stateT - wonT > 1.2;
    c.globalAlpha = ready ? 1 : 0.4;
    const bw = fu * 9, bh = fu * 1.8;
    roundRect(c, -bw / 2, ph * 0.31, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, ph * 0.31, 0, ph * 0.31 + bh);
    g.addColorStop(0, '#ffcf7a'); g.addColorStop(1, '#e8840f');
    c.fillStyle = g; c.fill();
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.31 + bh / 2 + 1, fitText(c, 'OK  play again', bw * 0.85, fu * 0.95, 900), '#3a1a06', 900);
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  if (location.hash === '#autotest') {
    // Test hook (only with #autotest in the address): pocket all but one coin to reach the win quickly.
    window.__carrom = { clearAllBut(n) { live().slice(n).forEach((c) => { c.on = false; tray.push({ kind: c.kind, t: stateT }); }); } };
  }
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  reset(true);
  layout(Kit.W, Kit.H);
  Kit.canvas.focus();
  if (best > 0) Kit.record(ID, best);
})();
