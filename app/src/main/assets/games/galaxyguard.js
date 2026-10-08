// Galaxy Guard: the modern remake of Space Defender. Alien squads sway in formation and swoop down at
// you; shoot them all to clear the wave. Shields soak up shots, every 5th wave a Mothership attacks,
// and a 2× capsule now and then gives a double shot. 3 lives. Remote: ◀ ▶ move (hold), OK fires
// (hold to keep firing), ▲ pauses. Touch: drag to move, hold to fire. Keyboard: arrows/AD + Enter/space.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const FW = 160, FH = 100;                 // the field, in world units
  const SHIP_Y = 91, SHIELD_Y = 72;
  const AW = 9, AH = 7, GX = 13, GY = 9;    // alien size and formation spacing
  const SPEED = 88, SHOT_SPEED = 175;
  const TYPES = ['#9b7bff', '#ff4fd8', '#ff9a3c', '#7dff6a'];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  const rnd = (a, b) => a + Math.random() * (b - a);

  // ---------- Record ----------
  let best = Kit.store.get('galaxyguard.best', 0) | 0;

  // ---------- State ----------
  // state: 'menu' (a demo ship plays itself), 'intro' (wave banner), 'play', 'clear', 'paused', 'dying', 'over'
  let state = 'menu', stateT = 0, gameT = 0, pausedFrom = 'play';
  let score = 0, shown = 0, bump = 0, lives = 3, wave = 1, kills = 0, newBest = false, overReason = '';
  const ship = { x: 80, vx: 0, tilt: 0, cool: 0, dead: 0, inv: 0 };
  let aliens = [], cols = 8, rows = 4, total = 1, fx = 0, fy = 12, swayPh = 0;
  let shots = [], bombs = [], drops = [], rings = [], bunkers = [];
  let boss = null, doubleT = 0, diveT = 3, fireAcc = 0, waveT = 0, clearT = 0, deathT = 0, warp = 0, sinceDrop = 0;
  let demoTarget = 80, demoRetarget = 0, livesFlash = 0;
  const demo = () => state === 'menu';

  function newGame(isDemo) {
    score = 0; shown = 0; lives = 3; kills = 0; newBest = false; overReason = ''; doubleT = 0; sinceDrop = 0;
    Object.assign(ship, { x: 80, vx: 0, tilt: 0, cool: 0.3, dead: 0, inv: 0 });
    drops = []; rings = [];
    startWave(1);
    if (!isDemo) { state = 'intro'; waveT = stateT; }
  }

  function startWave(n) {
    wave = n; waveT = stateT;
    const bossWave = n % 5 === 0;
    cols = bossWave ? 8 : Math.min(10, 8 + Math.floor((n - 1) / 3));
    rows = bossWave ? 2 : (n >= 4 ? 5 : 4);
    fx = (FW - (cols - 1) * GX - AW) / 2; fy = bossWave ? 32 : 12; swayPh = 0;
    aliens = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      aliens.push({ r, c, type: bossWave ? (r + 1) % 4 : r % 4, alive: true, mode: 'enter', k: -(r * 0.12 + c * 0.05),
        side: c < cols / 2 ? -1 : 1, x: 80, y: -15, rot: 0, ex: 0, pts: (rows - r) * 10, t: 0 });
    }
    aliens.forEach((a) => { a.ex = 80 + a.side * (70 + a.r * 6); });
    total = aliens.length;
    boss = bossWave ? { x: 80, y: -26, t: 0, hp: 0, max: 0, flash: 0, atk: 2.4, pattern: 0, burst: 0, burstT: 0, dying: 0, boomT: 0 } : null;
    if (boss) { boss.max = boss.hp = 30 + 15 * (n / 5); }
    shots = []; bombs = []; drops = [];
    diveT = 3.5; fireAcc = 0;
    if (n === 1 || (n - 1) % 5 === 0) buildShields();
    if (!demo()) {
      if (boss) [0, 1, 2].forEach((i) => { Kit.tone(520, { type: 'sawtooth', dur: 0.22, vol: 0.06, at: i * 0.42, slide: 1.5 }); Kit.tone(780, { type: 'sawtooth', dur: 0.2, vol: 0.05, at: i * 0.42 + 0.21, slide: 0.66 }); });
      else Kit.noise({ dur: 0.9, vol: 0.06, freq: 400, q: 0.7, sweep: 6 });
    }
  }

  // ---------- Shields: crystal bunkers that chip away cell by cell ----------
  const SC = 14, SR = 7, CELL = 1.15;
  function buildShields() {
    bunkers = [0, 1, 2, 3].map((i) => {
      const cx = FW * (i + 0.5) / 4;
      const cells = new Uint8Array(SC * SR).fill(1);
      const cut = (x, y) => { cells[y * SC + x] = 0; };
      [[0, 0], [1, 0], [0, 1], [SC - 1, 0], [SC - 2, 0], [SC - 1, 1]].forEach(([x, y]) => cut(x, y));
      for (let y = SR - 2; y < SR; y++) for (let x = 5; x <= 8; x++) cut(x, y);
      cut(4, SR - 1); cut(9, SR - 1);
      return { x0: cx - (SC * CELL) / 2, y0: SHIELD_Y, cells, pic: document.createElement('canvas'), dirty: true };
    });
  }
  // Checks the path of a shot from ya to yb; chips the shield and says so if it hit one.
  function hitShield(x, ya, yb, radius) {
    const lo = Math.min(ya, yb), hi = Math.max(ya, yb);
    if (hi < SHIELD_Y || lo > SHIELD_Y + SR * CELL) return false;
    for (const b of bunkers) {
      if (x < b.x0 || x >= b.x0 + SC * CELL) continue;
      const cx = Math.floor((x - b.x0) / CELL);
      const steps = Math.max(1, Math.ceil((hi - lo) / (CELL * 0.6)));
      for (let i = 0; i <= steps; i++) {
        const y = ya + (yb - ya) * (i / steps);
        const cy = Math.floor((y - b.y0) / CELL);
        if (cy < 0 || cy >= SR || !b.cells[cy * SC + cx]) continue;
        chip(b, cx, cy, radius);
        return true;
      }
    }
    return false;
  }
  function chip(b, cx, cy, radius) {
    const r = Math.ceil(radius);
    for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++) {
      if (x < 0 || y < 0 || x >= SC || y >= SR) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d === 0 || (d <= radius && Math.random() < 0.75 - d * 0.15)) b.cells[y * SC + x] = 0;
    }
    b.dirty = true;
    const px = X(b.x0 + (cx + 0.5) * CELL), py = Y(b.y0 + (cy + 0.5) * CELL);
    Kit.burst(px, py, '#5ff6d8', 5, 0.45);
    if (!demo()) Kit.noise({ dur: 0.07, vol: 0.06, freq: 4200, q: 1.5 });
  }
  // A diver flying through a shield breaks a hole as big as itself.
  function crashShield(x, y) {
    if (y < SHIELD_Y - AH / 2 || y > SHIELD_Y + SR * CELL + AH / 2) return;
    for (const b of bunkers) {
      if (x < b.x0 - AW / 2 || x > b.x0 + SC * CELL + AW / 2) continue;
      let any = false;
      for (let cy = 0; cy < SR; cy++) for (let cx = 0; cx < SC; cx++) {
        const wx = b.x0 + (cx + 0.5) * CELL, wy = b.y0 + (cy + 0.5) * CELL;
        if (b.cells[cy * SC + cx] && Math.abs(wx - x) < AW * 0.45 && Math.abs(wy - y) < AH * 0.45) { b.cells[cy * SC + cx] = 0; any = true; }
      }
      if (any) b.dirty = true;
    }
  }

  // ---------- Held keys (TV remotes repeat keydown while held; keyup ends it) ----------
  const held = { left: false, right: false, ok: false };
  let lastDir = 0;
  function holdKey(e) {
    const k = e.key, n = e.keyCode;
    if (k === 'ArrowLeft' || k === 'Left' || k === 'a' || k === 'A' || n === 37) return 'left';
    if (k === 'ArrowRight' || k === 'Right' || k === 'd' || k === 'D' || n === 39) return 'right';
    if (k === 'Enter' || k === ' ' || k === 'NumpadEnter' || k === 'Select' || n === 13 || n === 23 || n === 32) return 'ok';
    return null;
  }
  window.addEventListener('keydown', (e) => {
    const k = holdKey(e); if (!k) return;
    held[k] = true;
    if (k === 'left' && !e.repeat) lastDir = -1;
    if (k === 'right' && !e.repeat) lastDir = 1;
  });
  window.addEventListener('keyup', (e) => { const k = holdKey(e); if (k) held[k] = false; });
  window.addEventListener('blur', () => { held.left = held.right = held.ok = false; });

  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (repeat) return;
    if (state === 'menu') { if (k === 'ok') start(); return; }
    if (state === 'over') {
      if (stateT - deathT < 2) return;
      if (k === 'ok') start();
      else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { sfx.move(); toMenu(); }
      return;
    }
    if (k === 'restart' && state !== 'dying') { start(); return; }
    if (state === 'paused') { if (k === 'ok' || k === 'up') resume(); return; }
    if (k === 'up' && (state === 'play' || state === 'intro' || state === 'clear')) pause();
  });
  function pause() { pausedFrom = state; state = 'paused'; sfx.move(); }
  function resume() { state = pausedFrom; held.ok = false; sfx.pick(); }
  function start() {
    newGame(false);
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.14, vol: 0.14, at: 0.08 });
  }
  function toMenu() { state = 'menu'; newGame(true); }

  // Touch and mouse: drag to move, hold to fire, tap the speaker to mute.
  const ptr = { on: false, x: 80 };
  const muteBox = () => ({ x: Kit.W - 62 * L.U, y: 10 * L.U, w: 52 * L.U, h: 52 * L.U });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (state === 'menu') { start(); return; }
      if (state === 'over') {
        if (stateT - deathT < 2) return;
        const b = L.menuBtn;
        if (b && e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h) toMenu(); else start();
        return;
      }
      if (state === 'paused') { resume(); return; }
      ptr.on = true; ptr.x = (e.x - L.ox) / L.s;
    },
    move(e) { if (ptr.on) ptr.x = (e.x - L.ox) / L.s; },
    up() { ptr.on = false; },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'play' || state === 'intro' || state === 'clear')) pause();
  });

  // ---------- Scoring and hits ----------
  function addScore(p) {
    score += p; bump = 1;
    if (score > best) {
      if (!newBest && best > 0) {
        newBest = true;
        Kit.float('New best!', Kit.W / 2, L.top + 60 * L.U, { color: '#ffd23f', size: 40 * L.U, life: 1.6, big: true });
      }
      best = score; Kit.store.set('galaxyguard.best', best); Kit.record('galaxyguard', best);
    }
  }

  function explode(x, y, color, big) {
    const px = X(x), py = Y(y);
    Kit.burst(px, py, color, big ? 34 : 14, big ? 1.4 : 0.8);
    Kit.burst(px, py, '#ffffff', big ? 10 : 4, big ? 1.1 : 0.6);
    rings.push({ x, y, t: 0, max: big ? 0.6 : 0.35, r: big ? 20 : 8, color, flash: true });
    if (demo()) return;
    if (big) {
      Kit.noise({ dur: 0.6, vol: 0.32, freq: 260, q: 0.7, type: 'lowpass', sweep: 0.3 });
      Kit.tone(140, { type: 'sawtooth', dur: 0.45, vol: 0.1, slide: 0.35 });
    } else {
      Kit.noise({ dur: 0.18, vol: 0.16, freq: 1600, q: 0.8, sweep: 0.3 });
    }
  }

  function killAlien(a) {
    a.alive = false; kills++;
    const diving = a.mode === 'dive' || a.mode === 'return';
    explode(a.x, a.y, TYPES[a.type], false);
    if (demo()) return;
    const pts = a.pts * (diving ? 2 : 1);
    addScore(pts);
    Kit.tone(NOTES[Math.min(7, 7 - a.r)] , { type: 'triangle', dur: 0.12, vol: 0.14, slide: 1.3 });
    Kit.float(`+${pts}`, X(a.x), Y(a.y), { color: diving ? '#ffd23f' : '#ffffff', size: (diving ? 34 : 28) * L.U });
    if (diving) Kit.float('Swooper ×2', X(a.x), Y(a.y) - 34 * L.U, { color: '#ff8de3', size: 22 * L.U, life: 1 });
    Kit.shake(3, 0.12);
    sinceDrop++;
    if (!drops.length && doubleT < 3 && (Math.random() < 0.06 || sinceDrop >= 28)) {
      drops.push({ x: a.x, y: a.y, t: 0 }); sinceDrop = 0;
    }
  }

  function hitShip() {
    lives--; livesFlash = 1;
    explode(ship.x, SHIP_Y, '#4cc9ff', true);
    Kit.burst(X(ship.x), Y(SHIP_Y), '#ff7a45', 16, 1);
    Kit.shake(16, 0.5);
    bombs = [];
    if (lives <= 0) { die('Game over'); return; }
    ship.dead = 1.4;
    Kit.float(lives === 1 ? 'Last ship!' : 'Ship lost', Kit.W / 2, Y(58), { color: '#ff6b8b', size: 44 * L.U, life: 1.3, big: true });
  }
  function die(reason) {
    overReason = reason; ship.dead = 1e9; lives = Math.max(0, lives);
    state = 'dying'; deathT = stateT;
    setTimeout(() => sfx.over(), 600);
    if (best > 0) Kit.record('galaxyguard', best);
  }

  function fire() {
    if (doubleT > 0) {
      shots.push({ x: ship.x - 2.7, y: SHIP_Y - 3 }, { x: ship.x + 2.7, y: SHIP_Y - 3 });
    } else shots.push({ x: ship.x, y: SHIP_Y - 5 });
    rings.push({ x: ship.x, y: SHIP_Y - 5.5, t: 0, max: 0.09, r: 3.5, color: '#8ff3ff', flash: true, only: true });
    if (!demo()) {
      Kit.tone(doubleT > 0 ? 1500 : 1250, { type: 'square', dur: 0.07, vol: 0.035, slide: 0.45 });
      Kit.tone(620, { type: 'triangle', dur: 0.06, vol: 0.06, slide: 0.5 });
    }
  }
  function enemyShot(x, y, vx, vy, big) {
    bombs.push({ x, y, vx, vy, big });
    if (!demo()) Kit.tone(big ? 300 : 420, { type: 'sawtooth', dur: 0.1, vol: 0.025, slide: 0.6 });
  }

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    shown += (score - shown) * Math.min(1, dt * 9);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    livesFlash = Math.max(0, livesFlash - dt * 1.2);
    const wantWarp = state === 'clear' ? 1 : (state === 'intro' && stateT - waveT < 0.8 ? 0.6 : 0);
    warp += (wantWarp - warp) * Math.min(1, dt * 3);
    stepStars(dt);
    if (state === 'paused' || state === 'over') return;
    sim(dt);
    if (state === 'intro' && stateT - waveT > 2.3) state = 'play';
    if (state === 'clear' && stateT - clearT > 1.9) { startWave(wave + 1); state = 'intro'; }
    if (state === 'dying' && stateT - deathT > 1.6) state = 'over';
  }

  function sim(dt) {
    gameT += dt;
    const playing = state === 'play';
    const alive = ship.dead <= 0;

    // The ship
    if (ship.dead > 0 && ship.dead < 1e8) {
      ship.dead -= dt;
      if (ship.dead <= 0) { ship.x = 80; ship.vx = 0; ship.inv = 2.4; if (!demo()) Kit.tone(880, { type: 'triangle', dur: 0.25, vol: 0.12, slide: 1.5 }); }
    }
    ship.inv = Math.max(0, ship.inv - dt);
    doubleT = Math.max(0, doubleT - dt);
    let want = 0;
    if (demo()) {
      demoRetarget -= dt;
      const form = aliens.filter((a) => a.alive && a.mode === 'form');
      if (demoRetarget <= 0 && form.length) { const a = form[Math.floor(Math.random() * form.length)]; demoTarget = clamp(a.x + rnd(-2, 2), 6, FW - 6); demoRetarget = rnd(1.1, 2.2); }
      want = clamp((demoTarget - ship.x) * 5, -SPEED * 0.8, SPEED * 0.8);
    } else if (ptr.on) {
      want = clamp((ptr.x - ship.x) * 9, -SPEED * 1.2, SPEED * 1.2);
    } else {
      const d = held.left && held.right ? lastDir : (held.right ? 1 : 0) - (held.left ? 1 : 0);
      want = d * SPEED;
    }
    if (!alive) want = 0;
    ship.vx += (want - ship.vx) * Math.min(1, dt * 12);
    ship.x = clamp(ship.x + ship.vx * dt, 6, FW - 6);
    if ((ship.x <= 6 && ship.vx < 0) || (ship.x >= FW - 6 && ship.vx > 0)) ship.vx = 0;
    ship.tilt = ship.vx / SPEED * 0.28;
    ship.cool -= dt;
    const canShoot = alive && (playing || state === 'intro' || state === 'clear' || demo());
    const trigger = demo() ? Math.abs(demoTarget - ship.x) < 4 : (held.ok || ptr.on);
    if (canShoot && trigger && ship.cool <= 0) { fire(); ship.cool = demo() ? 0.34 : (doubleT > 0 ? 0.17 : 0.2); }

    // The formation sways side to side and creeps down; fewer aliens left, faster it goes.
    let minC = 99, maxC = -1, left = 0;
    for (const a of aliens) if (a.alive) { left++; minC = Math.min(minC, a.c); maxC = Math.max(maxC, a.c); }
    const killed = 1 - left / Math.max(1, total);
    if (left) {
      swayPh += dt * (0.55 + 0.04 * Math.min(wave, 12) + 1.1 * killed);
      const lo = 3 - minC * GX, hi = FW - 3 - AW - maxC * GX;
      const target = lo < hi ? lerp(lo, hi, (Math.sin(swayPh) + 1) / 2) : (lo + hi) / 2;
      fx += (target - fx) * Math.min(1, dt * 2);
      if (playing && alive) fy += dt * (0.16 + 0.025 * Math.min(wave, 15) + 0.4 * killed);
    }
    const frontY = [];
    for (const a of aliens) {
      if (!a.alive) continue;
      const sx = fx + a.c * GX + AW / 2;
      const sy = fy + a.r * GY + AH / 2 + Math.sin(gameT * 2.4 + a.c * 0.55 + a.r * 0.3) * 0.7;
      const px = a.x, py = a.y;
      if (a.mode === 'enter') {
        a.k += dt / 1.1;
        const e = ease.out(clamp(a.k, 0, 1));
        a.x = lerp(a.ex, sx, e) - Math.sin(e * Math.PI) * a.side * 22;
        a.y = a.k < 0 ? -15 : lerp(-15, sy, e);
        if (a.k >= 1) a.mode = 'form';
      } else if (a.mode === 'form') {
        a.x = sx; a.y = sy;
      } else if (a.mode === 'dive') {
        a.t += dt;
        if (a.t < 0.6) {
          a.x += a.dir * 16 * dt; a.y = a.y0 - Math.sin(a.t / 0.6 * Math.PI) * 7; a.bx = a.x;
        } else {
          a.bx += ((alive ? ship.x : 80) - a.bx) * Math.min(1, dt * 0.8);
          a.x = a.bx + Math.sin((a.t - 0.6) * 2.6) * 18 * a.dir;
          a.y += dt * Math.min(62, 38 + wave * 2.2);
          if (!demo() && alive && (playing) && a.shots < 2 && a.t > 0.95 + a.shots * 0.6 && a.y < 66) {
            const dx = ship.x - a.x, dy = SHIP_Y - a.y, d = Math.hypot(dx, dy) || 1, v = 55 + wave * 2;
            enemyShot(a.x, a.y + 3, dx / d * v, dy / d * v, false); a.shots++;
          }
        }
        crashShield(a.x, a.y);
        if (a.y > FH + 8) { a.mode = 'return'; a.k = 0; a.rx = clamp(a.x, 10, FW - 10); }
      } else if (a.mode === 'return') {
        a.k += dt / 1.5;
        const e = ease.inOut(clamp(a.k, 0, 1));
        a.x = lerp(a.rx, sx, e); a.y = lerp(-14, sy, e);
        if (a.k >= 1) a.mode = 'form';
      }
      // Divers turn to face where they fly.
      let wantRot = 0;
      if (a.mode === 'dive' && dt > 0) {
        const vx = (a.x - px) / dt, vy = (a.y - py) / dt;
        if (Math.hypot(vx, vy) > 5) wantRot = Math.atan2(-vx, vy);
      }
      let dr = wantRot - a.rot;
      while (dr > Math.PI) dr -= Math.PI * 2;
      while (dr < -Math.PI) dr += Math.PI * 2;
      a.rot += dr * Math.min(1, dt * 8);
      if (a.mode === 'form' || a.mode === 'enter') {
        if (frontY[a.c] === undefined || a.r > frontY[a.c].r) frontY[a.c] = a;
        if (playing && a.y + AH / 2 >= SHIELD_Y - 0.5) { landed(); return; }
      }
      // A swooper that rams the ship takes it down with it.
      if (!demo() && alive && ship.inv <= 0 && (a.mode === 'dive') && Math.abs(a.x - ship.x) < (AW + 8) / 2 && Math.abs(a.y - SHIP_Y) < (AH + 7) / 2) {
        killAlien(a); hitShip(); if (state === 'dying') return;
      }
    }

    // Swoopers: now and then one leaves the formation and dives at the ship.
    if ((playing || demo()) && alive) {
      diveT -= dt;
      const diving = aliens.filter((a) => a.alive && (a.mode === 'dive' || a.mode === 'return')).length;
      const maxDivers = demo() ? 2 : Math.min(4, 1 + Math.floor(wave / 2));
      if (diveT <= 0) {
        diveT = rnd(2.4, 4.4) * Math.max(0.45, 1 - wave * 0.07);
        const form = aliens.filter((a) => a.alive && a.mode === 'form');
        if (form.length && diving < maxDivers) {
          const a = form[Math.floor(Math.random() * form.length)];
          Object.assign(a, { mode: 'dive', t: 0, y0: a.y, bx: a.x, dir: a.x < ship.x ? 1 : -1, shots: 0 });
          if (!demo()) Kit.tone(900, { type: 'sine', dur: 0.4, vol: 0.06, slide: 0.4 });
        }
      }
    }

    // Formation fire: a front-row alien drops a shot.
    if (playing && alive) {
      const rate = Math.min(3.2, 0.7 + 0.22 * wave) * (boss ? 0.5 : 1);
      fireAcc += dt * rate;
      while (fireAcc >= 1) {
        fireAcc -= 1;
        const front = frontY.filter(Boolean);
        if (front.length) { const a = front[Math.floor(Math.random() * front.length)]; enemyShot(a.x, a.y + AH / 2, 0, Math.min(72, 40 + 3 * wave), false); }
      }
    }

    if (boss) updateBoss(dt, playing && alive);

    // Player shots
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i], y0 = s.y;
      s.y -= SHOT_SPEED * dt;
      let hit = s.y < -4;
      if (!hit && hitShield(s.x, y0, s.y - 2, 1)) hit = true;
      if (!hit && boss && !boss.dying) {
        const dx = (s.x - boss.x) / 21, dy = (s.y - boss.y) / 9;
        if (dx * dx + dy * dy < 1) { hit = true; hurtBoss(s.x, s.y); }
      }
      if (!hit) {
        for (const a of aliens) {
          if (!a.alive || (a.mode === 'enter' && a.k < 0)) continue;
          if (Math.abs(s.x - a.x) < AW / 2 + 0.6 && s.y - 2 < a.y + AH / 2 && y0 + 2 > a.y - AH / 2) { killAlien(a); hit = true; break; }
        }
      }
      if (hit) shots.splice(i, 1);
    }

    // Enemy shots
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i], y0 = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      let gone = b.y > FH + 4 || b.x < -4 || b.x > FW + 4;
      if (!gone && hitShield(b.x, y0, b.y + 1, b.big ? 1.8 : 1.3)) gone = true;
      if (!gone && !demo() && alive && ship.inv <= 0 && state !== 'clear' &&
          Math.abs(b.x - ship.x) < 4.3 && b.y > SHIP_Y - 4.5 && b.y < SHIP_Y + 4) {
        hitShip(); break;          // a hit clears every enemy shot
      }
      if (gone) bombs.splice(i, 1);
    }

    // Power-up capsules fall; catch one for a double shot.
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.t += dt; d.y += 20 * dt;
      if (alive && !demo() && Math.abs(d.x - ship.x) < 7.5 && Math.abs(d.y - SHIP_Y) < 7) {
        drops.splice(i, 1);
        doubleT = 12;
        Kit.burst(X(d.x), Y(d.y), '#ffd23f', 22, 1);
        rings.push({ x: d.x, y: d.y, t: 0, max: 0.5, r: 14, color: '#ffd23f' });
        [0, 1, 2, 3].forEach((n) => Kit.tone(NOTES[2 + n * 2] || 1568, { type: 'triangle', dur: 0.18, vol: 0.14, at: n * 0.06 }));
        Kit.float('Double shot!', X(d.x), Y(d.y) - 30 * L.U, { color: '#ffd23f', size: 36 * L.U, life: 1.3 });
        addScore(50);
      } else if (d.y > FH + 6) drops.splice(i, 1);
    }

    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > rings[i].max) rings.splice(i, 1); }

    // Wave over?
    if ((playing || demo()) && !left && !boss) {
      if (demo()) { startWave(1); return; }
      state = 'clear'; clearT = stateT;
      const bonus = 25 * wave;
      addScore(bonus);
      Kit.float('Wave clear!', Kit.W / 2, Y(42), { color: '#7ae0ff', size: 64 * L.U, life: 1.6, big: true });
      Kit.float(`+${bonus} bonus`, Kit.W / 2, Y(42) + 64 * L.U, { color: '#ffd23f', size: 32 * L.U, life: 1.6 });
      sfx.win();
      shots = []; bombs = [];
    }
  }

  function landed() {
    explode(ship.x, SHIP_Y, '#4cc9ff', true);
    Kit.shake(20, 0.6);
    Kit.float('They landed!', Kit.W / 2, Y(50), { color: '#ff6b8b', size: 56 * L.U, life: 1.6, big: true });
    lives = 0;
    die('They landed!');
  }

  function updateBoss(dt, canAttack) {
    const b = boss;
    b.t += dt; b.flash = Math.max(0, b.flash - dt);
    b.y += (20 - b.y) * Math.min(1, dt * 1.4);
    b.x = 80 + Math.sin(b.t * 0.7) * 46 + Math.sin(b.t * 1.9) * 7;
    if (b.dying > 0) {
      b.dying -= dt; b.boomT -= dt;
      if (b.boomT <= 0) {
        b.boomT = 0.11;
        explode(b.x + rnd(-17, 17), b.y + rnd(-6, 6), Math.random() < 0.5 ? '#ff3d6e' : '#ffb02e', false);
        Kit.shake(6, 0.15);
      }
      if (b.dying <= 0) {
        explode(b.x, b.y, '#ff3d6e', true);
        explode(b.x, b.y, '#ffd23f', true);
        rings.push({ x: b.x, y: b.y, t: 0, max: 0.9, r: 45, color: '#ffffff' });
        Kit.shake(26, 0.8);
        Kit.confetti(90);
        const pts = 250 * Math.max(1, wave / 5);
        if (!demo()) {
          addScore(pts);
          Kit.float('Mothership down!', Kit.W / 2, Y(40), { color: '#ffd23f', size: 60 * L.U, life: 1.8, big: true });
          Kit.float(`+${pts}`, X(b.x), Y(b.y) + 40 * L.U, { color: '#ffffff', size: 40 * L.U, life: 1.5 });
        }
        drops.push({ x: b.x, y: b.y, t: 0 }); sinceDrop = 0;
        boss = null;
      }
      return;
    }
    if (!canAttack || b.y < 15) return;
    const rage = b.hp / b.max < 0.5;
    b.atk -= dt;
    if (b.atk <= 0) {
      b.atk = rage ? 1.15 : 1.7;
      if (b.pattern++ % 2 === 0) {
        const n = rage ? 9 : 7, v = 40 + Math.min(wave, 20) * 1.5;
        for (let i = 0; i < n; i++) {
          const ang = (i / (n - 1) - 0.5) * 1.3;
          enemyShot(b.x, b.y + 6, Math.sin(ang) * v, Math.cos(ang) * v, true);
        }
      } else { b.burst = rage ? 5 : 3; b.burstT = 0; }
    }
    if (b.burst > 0) {
      b.burstT -= dt;
      if (b.burstT <= 0) {
        b.burstT = 0.14;
        const cx = b.x + (b.burst % 2 ? -9 : 9), cy = b.y + 7;
        const dx = ship.x - cx, dy = SHIP_Y - cy, d = Math.hypot(dx, dy) || 1, v = 62;
        enemyShot(cx, cy, dx / d * v, dy / d * v, true);
        b.burst--;
      }
    }
  }
  function hurtBoss(x, y) {
    const b = boss;
    b.hp--; b.flash = 0.07;
    Kit.burst(X(x), Y(y), '#ffb02e', 4, 0.5);
    if (!demo()) { Kit.tone(180, { type: 'square', dur: 0.05, vol: 0.05 }); addScore(5); }
    if (b.hp <= 0) {
      b.dying = 1.3; b.boomT = 0;
      bombs = [];
      if (!demo()) { Kit.noise({ dur: 1.4, vol: 0.2, freq: 300, q: 0.5, type: 'lowpass' }); }
    }
  }

  // ---------- Stars: three layers that drift down (and streak at warp speed) ----------
  const LAYERS = [{ n: 80, v: 0.012, size: 1.2, a: 0.45 }, { n: 50, v: 0.03, size: 1.9, a: 0.7 }, { n: 26, v: 0.07, size: 2.8, a: 0.95 }];
  const stars = LAYERS.map((ly) => Array.from({ length: ly.n }, () => ({ x: Math.random(), y: Math.random(), tw: Math.random() * 6 })));
  function stepStars(dt) {
    LAYERS.forEach((ly, i) => {
      const v = ly.v * (1 + warp * 16) * dt;
      for (const s of stars[i]) { s.y += v; if (s.y > 1) { s.y -= 1; s.x = Math.random(); } }
    });
  }

  // ---------- Layout ----------
  let L = { s: 6, top: 72, ox: 0, oy: 0, U: 1 };
  const X = (x) => L.ox + x * L.s, Y = (y) => L.oy + y * L.s;
  function layout(W, H) {
    if (!W || !H) return;
    const top = H * 0.1;
    const s = Math.min((W * 0.96) / FW, (H - top - H * 0.015) / FH);
    L = { s, top, ox: (W - FW * s) / 2, oy: top + Math.max(0, (H - top - FH * s) / 2 - H * 0.005), U: Math.min(H / 720, W / 1000) };
    sprites.clear();
    bunkers.forEach((b) => { b.dirty = true; });
  }
  Kit.onResize(layout);

  // ---------- Sprites: shaded art is drawn once per size (gradients are slow on TV boxes) ----------
  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const k = name + '|' + Math.round(w) + 'x' + Math.round(h);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w * dpr)); s.height = Math.max(1, Math.ceil(h * dpr));
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, w, h);
    sprites.set(k, s);
    return s;
  }
  const glow = (color, size) => sprite('glow' + color, size, size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    const n = parseInt(color.slice(1), 16), rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    g.addColorStop(0, `rgba(${rgb},0.9)`); g.addColorStop(0.3, `rgba(${rgb},0.4)`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  function gloss(c, color, cx, cy, r) {
    const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.1);
    g.addColorStop(0, shade(color, 0.6)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.5));
    return g;
  }
  function eyes(c, w, h, pts, r) {
    for (const [ex, ey] of pts) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex * w, ey * h, r * w, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#16102e'; c.beginPath(); c.arc(ex * w, (ey + 0.03) * h, r * w * 0.58, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc((ex + 0.02) * w, (ey - 0.01) * h, r * w * 0.22, 0, Math.PI * 2); c.fill();
    }
  }
  // Four kinds of alien, each with two animation frames.
  const alienSprite = (type, frame) => {
    const w = AW * 1.3 * L.s, h = AH * 1.45 * L.s;
    return sprite('al' + type + frame, w, h, (c) => {
      const col = TYPES[type];
      c.lineJoin = 'round'; c.lineCap = 'round';
      const outline = () => { c.lineWidth = w * 0.03; c.strokeStyle = 'rgba(10,6,30,0.55)'; c.stroke(); };
      if (type === 0) {
        // Jelly: a glossy dome with wavy tentacles.
        c.beginPath();
        c.ellipse(w * 0.5, h * 0.46, w * 0.34, h * 0.36, 0, Math.PI, 0);
        c.lineTo(w * 0.84, h * 0.62);
        const n = 4;
        for (let i = 0; i < n; i++) {
          const x1 = w * (0.84 - (i + 0.5) * 0.68 / n), x2 = w * (0.84 - (i + 1) * 0.68 / n);
          c.quadraticCurveTo(x1 + (frame ? 4 : -4) * w * 0.01, h * 0.92, x2, h * 0.62);
        }
        c.closePath();
        c.fillStyle = gloss(c, col, w * 0.5, h * 0.45, w * 0.36); c.fill(); outline();
        eyes(c, w, h, [[0.38, 0.42], [0.62, 0.42]], 0.085);
      } else if (type === 1) {
        // Crab: claws up, claws down.
        c.strokeStyle = shade(col, -0.2); c.lineWidth = w * 0.07;
        const cy = frame ? 0.2 : 0.7;
        c.beginPath(); c.moveTo(w * 0.26, h * 0.5); c.lineTo(w * 0.08, h * cy); c.moveTo(w * 0.74, h * 0.5); c.lineTo(w * 0.92, h * cy); c.stroke();
        c.fillStyle = col;
        c.beginPath(); c.arc(w * 0.08, h * cy, w * 0.07, 0, Math.PI * 2); c.arc(w * 0.92, h * cy, w * 0.07, 0, Math.PI * 2); c.fill();
        c.lineWidth = w * 0.04;
        c.beginPath(); c.moveTo(w * 0.4, h * 0.25); c.lineTo(w * 0.32, h * 0.06); c.moveTo(w * 0.6, h * 0.25); c.lineTo(w * 0.68, h * 0.06); c.stroke();
        c.beginPath(); c.arc(w * 0.32, h * 0.06, w * 0.04, 0, Math.PI * 2); c.arc(w * 0.68, h * 0.06, w * 0.04, 0, Math.PI * 2); c.fill();
        for (let i = 0; i < 3; i++) {
          const lx = w * (0.36 + i * 0.14);
          c.beginPath(); c.moveTo(lx, h * 0.7); c.lineTo(lx + (frame ? -1 : 1) * w * 0.05, h * 0.92); c.stroke();
        }
        roundRect(c, w * 0.22, h * 0.24, w * 0.56, h * 0.5, w * 0.17);
        c.fillStyle = gloss(c, col, w * 0.5, h * 0.48, w * 0.3); c.fill(); outline();
        eyes(c, w, h, [[0.4, 0.46], [0.6, 0.46]], 0.075);
      } else if (type === 2) {
        // Bug: flapping glassy wings round a round body.
        const wh = frame ? 0.3 : 0.14;
        c.fillStyle = 'rgba(255,230,200,0.55)';
        c.beginPath(); c.ellipse(w * 0.22, h * 0.42, w * 0.2, h * wh, -0.4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(w * 0.78, h * 0.42, w * 0.2, h * wh, 0.4, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = w * 0.02;
        c.beginPath(); c.ellipse(w * 0.22, h * 0.42, w * 0.2, h * wh, -0.4, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.ellipse(w * 0.78, h * 0.42, w * 0.2, h * wh, 0.4, 0, Math.PI * 2); c.stroke();
        c.strokeStyle = shade(col, -0.3); c.lineWidth = w * 0.045;
        c.beginPath(); c.moveTo(w * 0.42, h * 0.84); c.lineTo(w * 0.38, h * 0.97); c.moveTo(w * 0.58, h * 0.84); c.lineTo(w * 0.62, h * 0.97); c.stroke();
        c.beginPath(); c.arc(w * 0.5, h * 0.56, w * 0.25, 0, Math.PI * 2);
        c.fillStyle = gloss(c, col, w * 0.5, h * 0.56, w * 0.25); c.fill(); outline();
        c.fillStyle = 'rgba(80,20,0,0.25)';
        c.fillRect(w * 0.3, h * 0.68, w * 0.4, h * 0.05);
        eyes(c, w, h, [[0.41, 0.5], [0.59, 0.5]], 0.075);
      } else {
        // Saucer: one big eye under a glass dome, lights that blink.
        c.beginPath(); c.ellipse(w * 0.5, h * 0.62, w * 0.46, h * 0.17, 0, 0, Math.PI * 2);
        c.fillStyle = gloss(c, shade(col, -0.25), w * 0.5, h * 0.6, w * 0.4); c.fill(); outline();
        for (let i = 0; i < 4; i++) {
          c.fillStyle = (i + frame) % 2 ? '#fff6a8' : 'rgba(255,255,255,0.25)';
          c.beginPath(); c.arc(w * (0.2 + i * 0.2), h * 0.66, w * 0.035, 0, Math.PI * 2); c.fill();
        }
        c.beginPath(); c.ellipse(w * 0.5, h * 0.47, w * 0.25, h * 0.27, 0, Math.PI, 0); c.closePath();
        c.fillStyle = gloss(c, col, w * 0.5, h * 0.4, w * 0.25); c.fill(); outline();
        eyes(c, w, h, [[0.5, 0.36]], 0.11);
      }
      // A gloss highlight on top.
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.ellipse(w * 0.4, h * 0.22, w * 0.08, h * 0.04, -0.4, 0, Math.PI * 2); c.fill();
    });
  };
  const shipSprite = (w, h) => sprite('ship', w, h, (c) => {
    const P = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x * w, y * h) : c.moveTo(x * w, y * h))); c.closePath(); };
    const body = [[0.5, 0.02], [0.6, 0.3], [0.64, 0.58], [0.97, 0.8], [0.95, 0.92], [0.64, 0.86], [0.6, 0.97], [0.4, 0.97], [0.36, 0.86], [0.05, 0.92], [0.03, 0.8], [0.36, 0.58], [0.4, 0.3]];
    P(body);
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#2b4a86'); g.addColorStop(0.42, '#eef7ff'); g.addColorStop(0.58, '#c6dcff'); g.addColorStop(1, '#22396a');
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.lineWidth = w * 0.025; c.strokeStyle = '#0d1838'; c.stroke();
    // Cyan wing stripes and orange tips.
    c.fillStyle = '#2fd8ff';
    P([[0.36, 0.64], [0.12, 0.81], [0.2, 0.83], [0.37, 0.72]]); c.fill();
    P([[0.64, 0.64], [0.88, 0.81], [0.8, 0.83], [0.63, 0.72]]); c.fill();
    c.fillStyle = '#ff7a45';
    P([[0.03, 0.8], [0.09, 0.77], [0.1, 0.9], [0.05, 0.92]]); c.fill();
    P([[0.97, 0.8], [0.91, 0.77], [0.9, 0.9], [0.95, 0.92]]); c.fill();
    // Cockpit
    c.beginPath(); c.ellipse(w * 0.5, h * 0.42, w * 0.075, h * 0.15, 0, 0, Math.PI * 2);
    const cg = c.createLinearGradient(0, h * 0.27, 0, h * 0.57);
    cg.addColorStop(0, '#9ff4ff'); cg.addColorStop(0.5, '#1a7fc4'); cg.addColorStop(1, '#0a2350');
    c.fillStyle = cg; c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath(); c.ellipse(w * 0.48, h * 0.36, w * 0.022, h * 0.05, 0, 0, Math.PI * 2); c.fill();
    // Nose cannon tip
    c.fillStyle = '#2fd8ff'; c.beginPath(); c.arc(w * 0.5, h * 0.06, w * 0.025, 0, Math.PI * 2); c.fill();
  });
  const flameSprite = (w, h) => sprite('flame', w, h, (c) => {
    c.beginPath();
    c.moveTo(w * 0.1, 0);
    c.bezierCurveTo(w * 0.1, h * 0.45, w * 0.42, h * 0.8, w * 0.5, h);
    c.bezierCurveTo(w * 0.58, h * 0.8, w * 0.9, h * 0.45, w * 0.9, 0);
    c.closePath();
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.25, '#9ff6ff'); g.addColorStop(0.6, 'rgba(60,170,255,0.7)'); g.addColorStop(1, 'rgba(90,80,255,0)');
    c.fillStyle = g; c.fill();
  });
  const shotSprite = (w, h) => sprite('shot', w, h, (c) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, h / 2);
    g.addColorStop(0, 'rgba(120,230,255,0.55)'); g.addColorStop(1, 'rgba(76,201,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    roundRect(c, w * 0.36, h * 0.18, w * 0.28, h * 0.64, w * 0.14);
    const cg = c.createLinearGradient(0, h * 0.18, 0, h * 0.82);
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(1, '#4cc9ff');
    c.fillStyle = cg; c.fill();
  });
  const bombSprite = (big, s) => sprite('bomb' + (big ? 1 : 0), s, s, (c) => {
    const col = big ? '#ffb02e' : '#ff3d6e';
    const n = parseInt(col.slice(1), 16), rgb = `${n >> 16},${(n >> 8) & 255},${n & 255}`;
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, `rgba(${rgb},0.75)`); g.addColorStop(0.45, `rgba(${rgb},0.3)`); g.addColorStop(1, `rgba(${rgb},0)`);
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    const cg = c.createRadialGradient(s * 0.45, s * 0.42, 0, s / 2, s / 2, s * 0.2);
    cg.addColorStop(0, '#ffffff'); cg.addColorStop(0.6, shade(col, 0.4)); cg.addColorStop(1, col);
    c.fillStyle = cg; c.beginPath(); c.arc(s / 2, s / 2, s * 0.2, 0, Math.PI * 2); c.fill();
  });
  const dropSprite = (s) => sprite('drop', s, s, (c) => {
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
    c.fillStyle = gloss(c, '#ffc21f', s / 2, s / 2, s * 0.44); c.fill();
    c.lineWidth = s * 0.06; c.strokeStyle = '#fff3b0'; c.stroke();
    c.font = `900 ${Math.round(s * 0.42)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#4a2600'; c.fillText('2×', s / 2, s * 0.53);
  });
  const bossSprite = (w, h, white) => sprite('boss' + (white ? 'w' : ''), w, h, (c) => {
    // Side pods and cannons
    c.fillStyle = '#3a1d6e';
    roundRect(c, w * 0.25, h * 0.62, w * 0.08, h * 0.3, w * 0.02); c.fill();
    roundRect(c, w * 0.67, h * 0.62, w * 0.08, h * 0.3, w * 0.02); c.fill();
    for (const px of [0.09, 0.91]) {
      c.beginPath(); c.arc(w * px, h * 0.58, w * 0.075, 0, Math.PI * 2);
      c.fillStyle = gloss(c, '#ff9a3c', w * px, h * 0.58, w * 0.075); c.fill();
    }
    // Hull
    c.beginPath(); c.ellipse(w * 0.5, h * 0.58, w * 0.44, h * 0.24, 0, 0, Math.PI * 2);
    const g = c.createLinearGradient(0, h * 0.34, 0, h * 0.82);
    g.addColorStop(0, '#ff7aa2'); g.addColorStop(0.35, '#d81b60'); g.addColorStop(1, '#4a0a2a');
    c.fillStyle = g; c.fill();
    c.lineWidth = w * 0.008; c.strokeStyle = '#2a0418'; c.stroke();
    // Panel lines
    c.strokeStyle = 'rgba(40,0,20,0.45)'; c.lineWidth = w * 0.006;
    for (let i = 1; i < 6; i++) { const x = w * (0.06 + i * 0.147); c.beginPath(); c.moveTo(x, h * 0.4); c.lineTo(x, h * 0.78); c.stroke(); }
    // Upper deck
    c.beginPath(); c.ellipse(w * 0.5, h * 0.42, w * 0.26, h * 0.2, 0, 0, Math.PI * 2);
    const dg = c.createLinearGradient(0, h * 0.22, 0, h * 0.62);
    dg.addColorStop(0, '#8d6bff'); dg.addColorStop(1, '#2a1660');
    c.fillStyle = dg; c.fill(); c.lineWidth = w * 0.008; c.strokeStyle = '#140a33'; c.stroke();
    // Glass dome with a glowing core
    c.beginPath(); c.ellipse(w * 0.5, h * 0.3, w * 0.12, h * 0.22, 0, Math.PI, 0); c.closePath();
    const gg = c.createRadialGradient(w * 0.47, h * 0.18, 0, w * 0.5, h * 0.28, w * 0.13);
    gg.addColorStop(0, '#e9ffff'); gg.addColorStop(0.5, '#4cc9ff'); gg.addColorStop(1, '#16407a');
    c.fillStyle = gg; c.fill(); c.stroke();
    c.fillStyle = '#ff3d6e'; c.beginPath(); c.arc(w * 0.5, h * 0.24, w * 0.035, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(w * 0.508, h * 0.22, w * 0.012, 0, Math.PI * 2); c.fill();
    // Gloss
    c.fillStyle = 'rgba(255,255,255,0.28)';
    c.beginPath(); c.ellipse(w * 0.33, h * 0.48, w * 0.12, h * 0.05, -0.1, 0, Math.PI * 2); c.fill();
    if (white) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(0, 0, w, h); }
  });
  const planetSprite = (s) => sprite('planet', s * 1.8, s, (c, w, h) => {
    const cx = w / 2, cy = h / 2, r = h * 0.36;
    const ring = (back) => {
      c.save(); c.translate(cx, cy); c.rotate(-0.25);
      c.beginPath(); c.ellipse(0, 0, r * 2.1, r * 0.5, 0, back ? Math.PI : 0, back ? Math.PI * 2 : Math.PI);
      c.lineWidth = r * 0.14; c.strokeStyle = 'rgba(255,170,220,0.35)'; c.stroke();
      c.lineWidth = r * 0.05; c.strokeStyle = 'rgba(255,220,240,0.45)'; c.stroke();
      c.restore();
    };
    ring(true);
    c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2);
    const g = c.createRadialGradient(cx - r * 0.45, cy - r * 0.45, r * 0.05, cx, cy, r);
    g.addColorStop(0, '#c58bff'); g.addColorStop(0.5, '#5b2fb0'); g.addColorStop(1, '#170a3a');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    c.fillStyle = 'rgba(255,140,200,0.12)';
    for (let i = 0; i < 5; i++) c.fillRect(cx - r, cy - r * 0.7 + i * r * 0.32, r * 2, r * 0.12);
    c.restore();
    ring(false);
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
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(6,6,30,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(36,52,140,0.94)'); g.addColorStop(1, 'rgba(10,14,52,0.96)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }

  function drawStars(c, layer) {
    const W = Kit.W, H = Kit.H, U = L.U;
    const ly = LAYERS[layer];
    const off = ((ship.x - 80) / 80) * W * 0.012 * (layer + 1);
    const streak = warp * ly.v * H * 1.2;
    c.fillStyle = layer === 2 ? '#ffffff' : (layer === 1 ? '#cfe0ff' : '#9fb0ff');
    c.globalAlpha = ly.a;
    const sz = ly.size * U;
    for (const s of stars[layer]) {
      const px = ((s.x * W - off) % W + W) % W;
      c.fillRect(px, s.y * H - streak, sz, sz + streak);
    }
    c.globalAlpha = 1;
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, s = L.s, U = L.U;
    Kit.background(c, t, '#0d1240', '#02030d', 'rgba(110,90,255,0.10)');
    drawStars(c, 0);
    // A far ringed planet and a little moon drift a touch with the ship (parallax).
    const ps = Math.min(W, H) * 0.5, par = ((ship.x - 80) / 80) * W * 0.006;
    c.drawImage(planetSprite(ps), W * 0.83 - ps * 0.9 - par, H * 0.7 - ps / 2 + Math.sin(t * 0.08) * 8 * U, ps * 1.8, ps);
    const ms = Math.min(W, H) * 0.09;
    c.globalAlpha = 0.85; c.drawImage(glow('#7ae0ff', ms * 2.2), W * 0.12 - ms * 1.1 - par * 0.5, H * 0.26 - ms * 1.1, ms * 2.2, ms * 2.2); c.globalAlpha = 1;
    c.drawImage(alienSafeMoon(ms), W * 0.12 - ms / 2 - par * 0.5, H * 0.26 - ms / 2, ms, ms);
    drawStars(c, 1);
    drawStars(c, 2);
    if (!aliens.length) return;

    // Faint rails show the edges of the field.
    c.fillStyle = 'rgba(120,160,255,0.10)';
    c.fillRect(L.ox - 2, L.top, 2, H - L.top); c.fillRect(L.ox + FW * s, L.top, 2, H - L.top);

    // Shields
    for (const b of bunkers) {
      const w = SC * CELL * s, h = SR * CELL * s;
      if (b.dirty) drawBunker(b, w, h);
      c.drawImage(b.pic, X(b.x0), Y(b.y0), w, h);
    }

    // Boss
    if (boss) {
      const bw = 44 * s, bh = 20 * s;
      const shake = boss.dying > 0 ? (Math.random() - 0.5) * 6 * U : 0;
      const bx = X(boss.x) - bw / 2 + shake, by = Y(boss.y) - bh * 0.55;
      c.globalAlpha = 0.5 + Math.sin(t * 6) * 0.2;
      const gl = bw * 0.9; c.drawImage(glow('#ff3d6e', gl), X(boss.x) - gl / 2, Y(boss.y) - gl / 2, gl, gl);
      c.globalAlpha = 1;
      c.drawImage(bossSprite(bw, bh, boss.flash > 0 || (boss.dying > 0 && Math.sin(t * 40) > 0)), bx, by, bw, bh);
      // Blinking underside lights
      for (let i = 0; i < 5; i++) {
        const on = Math.sin(t * 6 - i) > 0;
        const lx = X(boss.x) + (i - 2) * 6 * s + shake, ly = Y(boss.y) + 3.2 * s;
        const gs = (on ? 3.4 : 2) * s;
        c.drawImage(glow(on ? '#ffd23f' : '#ff3d6e', gs), lx - gs / 2, ly - gs / 2, gs, gs);
      }
    }

    // Aliens
    for (const a of aliens) {
      if (!a.alive || (a.mode === 'enter' && a.k < 0)) continue;
      const diving = a.mode === 'dive';
      const frame = diving ? Math.floor(gameT * 9) % 2 : (Math.floor(gameT * 2.6) + (a.r % 2)) % 2;
      const img = alienSprite(a.type, frame);
      const w = AW * 1.3 * s, h = AH * 1.45 * s;
      if (Math.abs(a.rot) > 0.02) {
        c.save(); c.translate(X(a.x), Y(a.y)); c.rotate(a.rot);
        c.drawImage(img, -w / 2, -h / 2, w, h); c.restore();
      } else c.drawImage(img, X(a.x) - w / 2, Y(a.y) - h / 2, w, h);
    }

    // Power-up capsules
    for (const d of drops) {
      const ds = 7 * s * (1 + Math.sin(d.t * 6) * 0.06), gs = ds * 2.4;
      c.globalAlpha = 0.6 + Math.sin(d.t * 8) * 0.25;
      c.drawImage(glow('#ffd23f', gs), X(d.x) - gs / 2, Y(d.y) - gs / 2, gs, gs);
      c.globalAlpha = 1;
      c.save(); c.translate(X(d.x), Y(d.y)); c.rotate(Math.sin(d.t * 3) * 0.25);
      c.drawImage(dropSprite(7 * s), -ds / 2, -ds / 2, ds, ds); c.restore();
    }

    // Shots
    const sw = 3 * s, sh = 8 * s, simg = shotSprite(sw, sh);
    for (const sh0 of shots) c.drawImage(simg, X(sh0.x) - sw / 2, Y(sh0.y) - sh / 2, sw, sh);
    const bs = 5 * s, bbs = 6.5 * s;
    for (const b of bombs) {
      const z = b.big ? bbs : bs;
      c.drawImage(bombSprite(b.big, z), X(b.x) - z / 2, Y(b.y) - z / 2, z, z);
    }

    // The ship
    if (ship.dead <= 0 && state !== 'over') {
      const w = 11 * s, h = 11 * s, x = X(ship.x), y = Y(SHIP_Y);
      const blink = ship.inv > 0 && Math.sin(t * 28) > 0;
      c.save(); c.translate(x, y); c.rotate(ship.tilt);
      const fl = 1 + Math.sin(t * 50) * 0.12 + Math.random() * 0.1;
      const fw = w * 0.22, fh = h * 0.55 * fl;
      c.globalAlpha = blink ? 0.35 : 1;
      c.drawImage(flameSprite(fw, h * 0.55), -w * 0.06 - fw / 2, h * 0.42, fw, fh);
      c.drawImage(flameSprite(fw, h * 0.55), w * 0.06 - fw / 2, h * 0.42, fw, fh);
      c.drawImage(shipSprite(w, h), -w / 2, -h / 2, w, h);
      c.globalAlpha = 1;
      c.restore();
      if (ship.inv > 0) {
        c.strokeStyle = `rgba(120,230,255,${0.25 + 0.2 * Math.sin(t * 10)})`; c.lineWidth = 3 * U;
        c.beginPath(); c.arc(x, y, w * 0.7, 0, Math.PI * 2); c.stroke();
      }
      if (doubleT > 0) {
        c.globalAlpha = doubleT < 3 && Math.sin(t * 16) < 0 ? 0.2 : 0.55;
        const gs = w * 0.6;
        c.drawImage(glow('#ffd23f', gs), x - w * 0.42 - gs / 2, y - gs / 2 + h * 0.15, gs, gs);
        c.drawImage(glow('#ffd23f', gs), x + w * 0.42 - gs / 2, y - gs / 2 + h * 0.15, gs, gs);
        c.globalAlpha = 1;
      }
    }

    // Rings and flashes
    for (const r of rings) {
      const k = r.t / r.max;
      if (r.flash) {
        const fs = r.r * s * (r.only ? 1.4 : 1.2) * (0.6 + k * 0.6);
        c.globalAlpha = 1 - k;
        c.drawImage(glow(r.color, fs * 2), X(r.x) - fs, Y(r.y) - fs, fs * 2, fs * 2);
      }
      if (!r.only) {
        c.globalAlpha = Math.max(0, 1 - k);
        c.strokeStyle = r.color; c.lineWidth = (1 - k) * 5 * U + 1;
        c.beginPath(); c.arc(X(r.x), Y(r.y), r.r * s * ease.out(k), 0, Math.PI * 2); c.stroke();
      }
      c.globalAlpha = 1;
    }

    drawHud(c, t);
    if (state === 'menu') drawMenu(c, t);
    if (state === 'intro') drawBanner(c);
    if (state === 'paused') {
      c.fillStyle = 'rgba(3,5,20,0.65)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.42, 90 * U, '#ffffff', '#7ae0ff');
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'OK or ▲ to carry on  ·  Back for games', W / 2, H * 0.56, 30 * U, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'over') drawOver(c);
    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
  }
  const alienSafeMoon = (s) => sprite('moon', s, s, (c) => {
    c.beginPath(); c.arc(s / 2, s / 2, s * 0.48, 0, Math.PI * 2);
    c.fillStyle = gloss(c, '#5fb8d8', s / 2, s / 2, s * 0.48); c.fill();
    c.fillStyle = 'rgba(10,30,60,0.25)';
    [[0.35, 0.4, 0.09], [0.62, 0.62, 0.12], [0.6, 0.3, 0.06]].forEach(([x, y, r]) => { c.beginPath(); c.arc(x * s, y * s, r * s, 0, Math.PI * 2); c.fill(); });
  });

  function drawBunker(b, w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    b.pic.width = Math.max(1, Math.ceil(w * dpr)); b.pic.height = Math.max(1, Math.ceil(h * dpr));
    const c = b.pic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const cs = w / SC;
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8ffff0'); g.addColorStop(0.4, '#2fd8c0'); g.addColorStop(1, '#0d6f78');
    c.fillStyle = g;
    for (let y = 0; y < SR; y++) for (let x = 0; x < SC; x++) {
      if (b.cells[y * SC + x]) c.fillRect(x * cs + 0.5, y * cs + 0.5, cs - 1, cs - 1);
    }
    c.fillStyle = 'rgba(255,255,255,0.55)';
    for (let y = 0; y < SR; y++) for (let x = 0; x < SC; x++) {
      if (b.cells[y * SC + x] && (y === 0 || !b.cells[(y - 1) * SC + x])) c.fillRect(x * cs + 0.5, y * cs + 0.5, cs - 1, Math.max(1, cs * 0.25));
    }
    b.dirty = false;
  }

  function drawHud(c, t) {
    if (state === 'menu') return;
    const W = Kit.W, U = L.U, ty = L.top / 2, hs = Math.min(L.top * 0.52, 48 * U);
    const lx = Math.max(24 * U, L.ox * 0.5);
    c.save();
    c.translate(lx, ty); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
    outlined(c, String(Math.round(shown)), 0, 0, hs, '#fff6c2', '#ffb703', 'left');
    c.restore();
    outlined(c, `WAVE ${wave}`, W / 2, ty, hs * 0.72, '#ffffff', '#7ae0ff');
    // Right: lives as little ships, then the best score.
    const right = W - 76 * U;
    c.font = `800 ${Math.round(hs * 0.55)}px system-ui, sans-serif`;
    const bestStr = `👑 ${Math.max(best, score)}`;
    const bw = c.measureText(bestStr).width;
    text(c, bestStr, right, ty, hs * 0.55, '#ffd23f', 800, 'right');
    const iw = hs * 0.75, gap = iw * 0.25;
    for (let i = 0; i < 3; i++) {
      const x = right - bw - 24 * U - (i + 1) * iw - i * gap;
      const on = i < lives;
      const pulse = !on && i === lives && livesFlash > 0 ? 1 + livesFlash * 0.5 : 1;
      c.globalAlpha = on ? 1 : 0.2;
      c.drawImage(shipSprite(iw, iw), x - (pulse - 1) * iw / 2, ty - iw / 2 - (pulse - 1) * iw / 2, iw * pulse, iw * pulse);
    }
    c.globalAlpha = 1;
    // Double shot timer
    if (doubleT > 0) {
      const px = lx, py = L.top + 4 * U, pw = 190 * U, ph = 30 * U;
      c.globalAlpha = doubleT < 3 && Math.sin(t * 16) < 0 ? 0.5 : 1;
      roundRect(c, px, py, pw, ph, ph / 2); c.fillStyle = 'rgba(40,30,0,0.6)'; c.fill();
      roundRect(c, px, py, pw * (doubleT / 12), ph, ph / 2); c.fillStyle = 'rgba(255,194,31,0.85)'; c.fill();
      outlined(c, '2× DOUBLE SHOT', px + pw / 2, py + ph / 2 + 1, 17 * U, '#ffffff', '#ffe9a8');
      c.globalAlpha = 1;
    }
    // Boss health
    if (boss && boss.y > 0) {
      const bw2 = Math.min(W * 0.4, 520 * U), bh = 14 * U, bx = W / 2 - bw2 / 2, by = L.top + 2 * U;
      roundRect(c, bx - 3, by - 3, bw2 + 6, bh + 6, (bh + 6) / 2); c.fillStyle = 'rgba(10,4,20,0.75)'; c.fill();
      roundRect(c, bx, by, Math.max(bh, bw2 * Math.max(0, boss.hp) / boss.max), bh, bh / 2);
      c.fillStyle = boss.hp / boss.max < 0.5 ? '#ff3d6e' : '#ff7aa2'; c.fill();
      text(c, 'MOTHERSHIP', W / 2, by + bh + 16 * U, 18 * U, 'rgba(255,200,220,0.9)', 800);
    }
  }

  function drawBanner(c) {
    const W = Kit.W, U = L.U, k = stateT - waveT;
    const a = k < 1.8 ? 1 : Math.max(0, 1 - (k - 1.8) / 0.5);
    const sc = ease.back(clamp(k / 0.4, 0, 1));
    const y = Y(58);
    c.save(); c.globalAlpha = a;
    c.translate(W / 2, y); c.scale(sc, sc);
    outlined(c, `WAVE ${wave}`, 0, 0, 92 * U, '#ffffff', boss ? '#ff7aa2' : '#7ae0ff');
    if (boss) outlined(c, '⚠ MOTHERSHIP INCOMING ⚠', 0, 70 * U, 36 * U, '#ffe08a', '#ff7a45');
    else text(c, wave === 1 ? (Kit.touchFirst() ? 'Drag to move · hold to fire' : '◀ ▶ move  ·  hold OK to fire') : 'Get ready!', 0, 66 * U, 32 * U, 'rgba(255,255,255,0.9)', 800);
    c.restore();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, U = L.U;
    c.fillStyle = 'rgba(3,5,22,0.55)'; c.fillRect(0, 0, W, H);
    const ty = H * 0.27;
    // A soft dark halo keeps the title clear of the demo aliens behind it.
    const hw = Math.min(W, 1100 * U);
    c.globalAlpha = 0.85; c.drawImage(glow('#02030d', 256), W / 2 - hw / 2, ty - hw * 0.22, hw, hw * 0.44); c.globalAlpha = 1;
    const k = ease.back(clamp(stateT / 0.6, 0, 1));
    c.save(); c.translate(W / 2, ty); c.scale(k, k);
    outlined(c, 'GALAXY GUARD', 0, Math.sin(t * 1.6) * 4 * U, Math.min(110 * U, W * 0.11), '#ffffff', '#4cc9ff');
    c.restore();
    text(c, 'Defend the galaxy from the alien swarm!', W / 2, ty + 72 * U, 30 * U, 'rgba(220,235,255,0.9)', 700);
    // Card
    const pw = Math.min(W * 0.92, 820 * U), ph = 262 * U, px = W / 2 - pw / 2, py = H * 0.46;
    panel(c, px, py, pw, ph, 28 * U, 'rgba(120,200,255,0.55)');
    const bw = 300 * U, bh = 68 * U, pulse = 1 + Math.sin(t * 4) * 0.03;
    c.save(); c.translate(W / 2, py + 58 * U); c.scale(pulse, pulse);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, '#7ae8ff'); g.addColorStop(1, '#1e88e5');
    c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = '#d6f6ff'; c.stroke();
    text(c, Kit.touchFirst() ? '▶  Tap to play' : '▶  OK  Play', 0, 2 * U, 36 * U, '#06203f', 900);
    c.restore();
    text(c, Kit.touchFirst() ? 'Drag to move  ·  hold to fire' : '◀ ▶ move  ·  hold OK to fire  ·  ▲ pause', W / 2, py + 128 * U, 28 * U, '#ffffff', 700);
    text(c, `👑 Best ${best}`, W / 2, py + 176 * U, 30 * U, '#ffd23f', 800);
    text(c, 'Swoopers score ×2  ·  catch 2× for a double shot  ·  boss every 5 waves', W / 2, py + 226 * U, 21 * U, 'rgba(200,215,255,0.75)', 600);
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, U = L.U;
    const a = clamp((stateT - deathT - 1.6) / 0.4, 0, 1);
    c.fillStyle = `rgba(3,5,20,${0.72 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, 640 * U), ph = 430 * U;
    panel(c, -pw / 2, -ph / 2, pw, ph, 32 * U, '#ffd23f');
    outlined(c, overReason || 'Game over', 0, -ph * 0.36, 58 * U, '#ffffff', '#ff7aa2');
    outlined(c, String(score), 0, -ph * 0.13, 92 * U, '#fff6c2', '#ffb703');
    text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.06, 32 * U, '#ffffff', 800);
    text(c, `🌊 Wave ${wave}  ·  👾 ${kills} aliens`, 0, ph * 0.18, 26 * U, 'rgba(255,255,255,0.78)', 700);
    const ready = stateT - deathT > 2;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.3, 32 * U, '#9ff0ff', 800);
    const bw = 300 * U, bh = 46 * U;
    roundRect(c, -bw / 2, ph * 0.37, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Menu' : 'Arrows  menu', 0, ph * 0.37 + bh / 2, 22 * U, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.37 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  newGame(true);
  Kit.canvas.focus();
  if (best > 0) Kit.record('galaxyguard', best);
})();
