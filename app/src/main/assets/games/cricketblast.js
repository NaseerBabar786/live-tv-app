// Cricket Blast: a floodlit T20 chase seen from behind the batter. The bowler runs in, the ball pitches
// and comes on; swing as the marker crosses the timing meter: green for a SIX, yellow for runs, too early
// or late and straight balls can knock your stumps over. Reach the target before the overs or wickets run out.
// Remote: OK swings, ◀ ▶ aim the shot (left / straight / right) before it. Menu: ◀ ▶ pick a format, OK play.
'use strict';

(() => {
  const { ease, roundRect, clamp, lerp } = Kit;
  const FORMATS = [
    { id: 'quick', name: 'Quick', icon: '⚡', overs: 2, wkts: 2 },
    { id: 'classic', name: 'Classic', icon: '🏏', overs: 3, wkts: 3 },
    { id: 'long', name: 'Long', icon: '🏆', overs: 5, wkts: 5 },
  ];
  // The camera sits behind the batter's stumps (z = 0); the bowler's stumps are at z = 20 (metres).
  const CAMZ = -7, CAMH = 3.2, CZ = 10, ROPE = 64, BAT_X = -0.55, BAT_Z = 1.0;
  const MID = 0.85, ZONE = 0.11, PERFECT = 0.04, RUN = 1.2;
  const TEAM = '#ff8a1f', TEAM_D = '#c4570a', OPP = '#14b8c4', OPP_D = '#0a6c78', GOLD = '#ffd23f', NAVY = '#0b1440';
  const FIELDERS = [[-10, 11], [9, 10], [-14, 24], [16, 30], [-30, 46], [33, 48], [-38, 58], [40, 58], [-5, 70]]
    .map(([x, z]) => ({ x, z, joy: 0 }));

  // ---------- Records ----------
  let best = Kit.store.get('cricketblast.best', 0) | 0;
  let level = Math.max(1, Kit.store.get('cricketblast.level', 1) | 0);
  let fmtIx = clamp(Kit.store.get('cricketblast.format', 1) | 0, 0, FORMATS.length - 1);

  // ---------- Layout and projection ----------
  // camY tilts the view up to follow a big hit; the cached stadium has EXTRA sky above the screen for it.
  let W = 0, H = 0, F = 1, HOR = 0, CX = 0, U = 10, camY = 0, EXTRA = 0;
  const proj = (x, y, z) => { const s = F / Math.max(0.4, z - CAMZ); return { x: CX + x * s, y: HOR + camY + (CAMH - y) * s, s }; };

  // ---------- The match ----------
  // state: 'menu' (the computer bats behind the format cards), 'play', 'over'
  // stage, one ball: 'wait' → 'runup' → 'deliver' → ('flight') → 'after'
  let state = 'menu', demo = true, fmt = FORMATS[fmtIx];
  let runs = 0, shown = 0, bump = 0, wkts = 0, balls = 0, target = 0, thisOver = [], newBest = false;
  let won = false, endMsg = '', overT = 0, matchLevel = level;
  let stage = 'wait', stageT = 0, waitFor = 1, afterFor = 1, paused = false, freeze = 0, aim = 0, clock = 0, stepAcc = 0;
  let b = null, fl = null, stumps = null, zing = 0, swingT = -1, backlift = 0, hint = 0;
  const bowler = { x: 0.5, z: 34, ph: 0, arm: -1 };
  let runFrom = 34;
  const trail = [], flashes = [];
  const quiet = (fn) => { if (!demo) fn(); };

  function newMatch(isDemo) {
    demo = isDemo; fmt = FORMATS[fmtIx]; matchLevel = level;
    runs = 0; shown = 0; wkts = 0; balls = 0; thisOver = []; newBest = false; won = false;
    const rate = Math.min(2.9, 1.25 + (level - 1) * 0.14);
    target = Math.round(fmt.overs * 6 * rate) + Math.floor(Math.random() * 4);
    stage = 'wait'; stageT = 0; waitFor = isDemo ? 0.6 : 2.2; b = null; fl = null; stumps = null; aim = 0;
    swingT = -1; hint = isDemo ? 0 : 1; trail.length = 0;
    bowler.z = 34; bowler.x = 0.5;
    if (!isDemo) {
      Kit.float(`Chase ${target}`, W / 2, H * 0.4, { color: GOLD, size: U * 3.4, life: 1.9, big: true });
      Kit.float(`${fmt.overs} overs · ${fmt.wkts} wickets`, W / 2, H * 0.52, { color: '#9be8ff', size: U * 1.3, life: 1.9, big: true });
    }
  }

  // The ball's path, p = 0 at the bowler's hand to 0.95 at the batter's stumps.
  const zAt = (p) => 19 - 20 * p;
  const xAt = (p) => lerp(0.42, b.xl, p / 0.95);
  function yAt(p) {
    if (p < b.pb) { const s = p / b.pb; return 2.25 * (1 - 0.6 * s - 0.4 * s * s); }
    const s = (p - b.pb) / (0.95 - b.pb);
    return Math.max(0.05, s * (1.5 - 0.85 * s));
  }
  function newDelivery() {
    const straight = Math.random() < 0.55;
    const side = straight ? 0 : (Math.random() < 0.5 ? -1 : 1);
    const lv = demo ? 2 : level;
    const T = Math.max(0.78, clamp(1.42 - (lv - 1) * 0.055, 0.86, 1.42) * (0.88 + Math.random() * 0.24) - balls * 0.004);
    b = {
      p: 0, T, side, straight, xl: straight ? (Math.random() - 0.5) * 0.16 : side * (0.3 + Math.random() * 0.26),
      pb: 0.58 + Math.random() * 0.13, willBowl: straight && Math.random() < 0.5,
      swung: false, hit: false, bounced: false, done: false, hidden: false,
      auto: demo ? MID + (Math.random() - 0.5) * 0.15 : -1,
    };
  }
  // Aiming at the ball's line makes the sweet spot bigger; the wrong way makes it smaller.
  function aimMult() {
    if (!b) return 1;
    if (aim === b.side) return 1.2;
    if (aim !== 0) return 0.85;
    return 1;
  }

  function startRunup() {
    if (thisOver.length >= 6) thisOver = [];
    if (!demo) aim = 0;
    newDelivery();
    runFrom = bowler.z; bowler.x = 0.5;
    stage = 'runup'; stageT = 0; stepAcc = 0;
  }

  function swing() {
    if (stage !== 'deliver' || !b || b.swung || b.done) return;
    b.swung = true; b.swingP = b.p; swingT = 0; hint = 0;
    quiet(snd.whoosh);
    const p = b.p, mult = aimMult();
    const off = (p - MID) / mult, a = Math.abs(off);
    if (p < MID - ZONE - 0.12) {
      if (Math.random() < 1 / 3) { label('EDGED!', '#ff6b6b'); hitBall(0, 'edge'); }
      else label('TOO EARLY', '#ff8f8f');
      return;
    }
    let r = 0;
    if (a < PERFECT) r = 6; else if (a < 0.065) r = 4; else if (a < 0.09) r = 2; else if (a < ZONE) r = 1;
    if (!r) { label(off < 0 ? 'EARLY' : 'LATE', '#ff8f8f'); return; }
    label(r === 6 ? 'PERFECT!' : r === 4 ? 'GREAT' : r === 2 ? 'GOOD' : 'OK', r === 6 ? '#5dffb1' : r === 4 ? GOLD : '#ffe9a6');
    hitBall(r, r >= 4 && Math.random() < 1 / 14 ? 'caught' : null);
  }
  function label(text, color) {
    if (demo) return;
    Kit.float(text, W / 2, H - U * 4.6, { color, size: U * 1.25, life: 0.9 });
  }

  // Where a shot along angle a (0 = straight down the ground) from (x0, z0) reaches the rope.
  function ropeDist(x0, z0, a) {
    const dz = z0 - CZ, B = x0 * Math.sin(a) + dz * Math.cos(a), C = x0 * x0 + dz * dz - ROPE * ROPE;
    return -B + Math.sqrt(Math.max(0, B * B - C));
  }
  function aimAngle() {
    if (aim < 0) return -(0.42 + Math.random() * 0.62);
    if (aim > 0) return 0.42 + Math.random() * 0.62;
    return (Math.random() - 0.5) * 0.62;
  }

  function hitBall(r, out) {
    b.hit = true; b.done = true; b.hidden = true;
    const x0 = xAt(b.p), y0 = yAt(b.p), z0 = zAt(b.p);
    let a = aimAngle();
    fl = { x0, y0, z0, t: 0, runs: r, out, tx: 0, tz: 0, ty: 0, peak: 0, dur: 1, roll: false, fielder: null };
    if (out) {
      const deep = out === 'caught';
      let pick = null, bestD = 9;
      for (const f of FIELDERS) {
        const fa = Math.atan2(f.x - x0, f.z - z0), dist = Math.hypot(f.x - x0, f.z - z0);
        if (deep !== dist > 35) continue;
        const d = Math.abs(fa - a);
        if (d < bestD) { bestD = d; pick = f; }
      }
      pick = pick || FIELDERS[4];
      Object.assign(fl, { tx: pick.x, tz: pick.z - 0.4, ty: 1.7, peak: deep ? 24 : 10, dur: deep ? 1.7 : 1.15, fielder: pick });
    } else {
      const t = ropeDist(x0, z0, a);
      const d = t * (r === 6 ? 1.2 : r === 4 ? 1 : r === 2 ? 0.5 : 0.3);
      Object.assign(fl, {
        tx: x0 + Math.sin(a) * d, tz: z0 + Math.cos(a) * d, ty: r === 6 ? 6 : 0.1,
        peak: r === 6 ? 18 : r === 2 ? 5 : 2, dur: r === 6 ? 1.8 : r === 4 ? 1.25 : 1, roll: r === 4 || r === 1,
      });
    }
    freeze = r >= 4 ? 0.1 : 0.05;
    Kit.shake(r === 6 ? 10 : r === 4 ? 7 : 4, 0.3);
    const bp = proj(x0, y0, z0);
    Kit.burst(bp.x, bp.y, '#fff3c4', r >= 4 ? 18 : 8, r >= 4 ? 1.1 : 0.6);
    quiet(() => snd.crack(r / 6));
    if (!out) {
      runs += r; bump = 1;
      if (!demo) {
        if (r === 6) {
          Kit.float('SIX!', W / 2, H * 0.56, { color: GOLD, size: U * 6, life: 1.6, big: true });
          snd.roar(true);
        } else if (r === 4) {
          Kit.float('FOUR!', W / 2, H * 0.56, { color: '#4fd8ff', size: U * 5, life: 1.4, big: true });
          snd.roar(false);
        }
        checkBest();
      }
    }
    stage = 'flight'; stageT = 0;
  }

  function landed() {
    const P = proj(fl.tx, fl.ty, fl.tz);
    if (fl.out) {
      wkts++; fl.fielder.joy = 2;
      Kit.burst(P.x, P.y, OPP, 14, 0.7);
      if (!demo) {
        Kit.float('CAUGHT!', W / 2, H * 0.4, { color: '#ff5d5d', size: U * 5, life: 1.6, big: true });
        Kit.shake(10, 0.4); snd.groan();
      }
      resolve('W'); afterFor = 1.6;
    } else if (fl.runs === 6) {
      Kit.burst(P.x, P.y, GOLD, 30, 1.2);
      for (let i = 0; i < 40; i++) flashes.push({ i: (Math.random() * crowdPts.length) | 0, t: Math.random() * 0.8 });
      resolve('6'); afterFor = 1.4;
    } else if (fl.runs === 4) {
      Kit.burst(P.x, P.y, '#4fd8ff', 18, 0.9);
      resolve('4'); afterFor = 1.2;
    } else {
      if (!demo) {
        Kit.float(fl.runs === 1 ? '1 RUN' : '2 RUNS', W / 2, H * 0.42, { color: '#ffffff', size: U * 2.6, life: 1.1, big: true });
        snd.runs(fl.runs);
      }
      resolve(String(fl.runs)); afterFor = 1;
    }
    fl = null;
    stage = 'after'; stageT = 0;
  }

  function bowled() {
    b.done = true; b.hidden = true; wkts++; zing = 1.6;
    const base = [-0.115, 0, 0.115];
    stumps = base.map((x, i) => ({ x, y: 0.36, z: 0, vx: (x * 14) + (Math.random() - 0.5) * 2, vy: 3 + Math.random() * 3, vz: -4 - Math.random() * 5,
      rot: 0, vr: (Math.random() - 0.5) * 14, len: 0.71, w: 0.06, i }));
    stumps.push({ x: -0.06, y: 0.72, z: 0, vx: -2.5, vy: 6, vz: -6, rot: 0, vr: 20, len: 0.11, w: 0.03, bail: true });
    stumps.push({ x: 0.06, y: 0.72, z: 0, vx: 2.5, vy: 6.5, vz: -5, rot: 0, vr: -22, len: 0.11, w: 0.03, bail: true });
    const P = proj(0, 0.5, 0);
    Kit.burst(P.x, P.y, '#ff5d5d', 20, 1);
    Kit.shake(16, 0.5);
    if (!demo) {
      Kit.float('BOWLED!', W / 2, H * 0.4, { color: '#ff5d5d', size: U * 5, life: 1.7, big: true });
      snd.stumps(); snd.groan();
    }
    resolve('W'); afterFor = 1.8;
    stage = 'after'; stageT = 0;
  }

  function dot() {
    b.done = true; b.hidden = true;
    if (!demo) Kit.float(b.swung ? 'BEATEN!' : 'DOT BALL', W / 2, H * 0.42, { color: '#c9d6ff', size: U * 2.2, life: 1, big: true });
    resolve('•'); afterFor = 0.9;
    stage = 'after'; stageT = 0;
  }

  function resolve(token) {
    thisOver.push(token); balls++;
  }

  function endBall() {
    if (demo) {
      if (runs > 60 || wkts >= 5) { runs = 0; wkts = 0; balls = 0; thisOver = []; }
    } else if (runs >= target) return finish(true, `Won with ${fmt.overs * 6 - balls} balls to spare`);
    else if (wkts >= fmt.wkts) return finish(false, `All out! ${target - runs} short`);
    else if (balls >= fmt.overs * 6) return finish(false, runs === target - 1 ? 'Lost by 1 run!' : `Out of overs, ${target - runs} short`);
    if (!demo && balls % 6 === 0) Kit.float(`End of over ${balls / 6}`, W / 2, H * 0.3, { color: '#9be8ff', size: U * 1.4, life: 1.3, big: true });
    stage = 'wait'; stageT = 0; waitFor = 0.7;
  }

  function finish(win, msg) {
    state = 'over'; overT = 0; won = win; endMsg = msg;
    if (win) {
      level++; Kit.store.set('cricketblast.level', level);
      Kit.confetti(170); Kit.sfx.win(); snd.roar(true);
    } else { setTimeout(() => Kit.sfx.over(), 300); }
    checkBest();
  }
  function checkBest() {
    if (demo || runs <= best) return;
    if (!newBest && best > 0) Kit.float('New best!', U * 7, U * 7.4, { color: GOLD, size: U * 1.1, life: 1.5, big: true });
    newBest = true; best = runs;
    Kit.store.set('cricketblast.best', best); Kit.record('cricketblast', best);
  }

  // ---------- Sounds (no music) ----------
  const snd = {
    crack(power) {
      Kit.noise({ dur: 0.07, vol: 0.4 + power * 0.25, freq: 2600, q: 1.2 });
      Kit.tone(1150, { type: 'triangle', dur: 0.07, vol: 0.22, slide: 0.5 });
      Kit.tone(190, { type: 'sine', dur: 0.14, vol: 0.3 + power * 0.15, slide: 0.55 });
    },
    whoosh() { Kit.noise({ dur: 0.22, vol: 0.1, freq: 450, q: 0.9, sweep: 5 }); },
    release() { Kit.noise({ dur: 0.18, vol: 0.05, freq: 900, q: 1, sweep: 2 }); },
    bounce() { Kit.tone(140, { dur: 0.09, vol: 0.2, slide: 0.55 }); Kit.noise({ dur: 0.05, vol: 0.08, freq: 500, q: 1 }); },
    step() { Kit.noise({ dur: 0.04, vol: 0.03, freq: 320, q: 1.5 }); },
    roar(big) {
      Kit.noise({ dur: big ? 2.6 : 1.8, vol: big ? 0.2 : 0.14, freq: 850, q: 0.35, sweep: 1.4 });
      Kit.noise({ dur: big ? 2.2 : 1.4, vol: 0.07, freq: 2400, q: 0.5, sweep: 0.7, at: 0.12 });
      if (big) [0, 2, 4, 7].forEach((n, i) => Kit.tone([523, 587, 659, 784, 880, 988, 1047, 1175][n], { type: 'triangle', dur: 0.3, vol: 0.12, at: 0.08 + i * 0.09 }));
    },
    runs(n) { for (let i = 0; i < n; i++) Kit.tone(880 + i * 220, { type: 'triangle', dur: 0.12, vol: 0.14, at: i * 0.12 }); },
    groan() { Kit.noise({ dur: 1.3, vol: 0.13, freq: 520, q: 0.6, sweep: 0.45, type: 'lowpass' }); Kit.tone(220, { type: 'sawtooth', dur: 0.5, vol: 0.05, slide: 0.6 }); },
    stumps() {
      Kit.noise({ dur: 0.14, vol: 0.4, freq: 1800, q: 2 });
      [0, 0.05, 0.1].forEach((at, i) => Kit.tone(430 - i * 60, { type: 'square', dur: 0.06, vol: 0.09, at }));
      [0, 1, 2, 3].forEach((i) => Kit.tone(1400, { type: 'square', dur: 0.06, vol: 0.05, at: 0.1 + i * 0.12 }));
    },
  };

  // ---------- Input ----------
  function setAim(d) {
    if (state !== 'play' || paused) return;
    const n = clamp(aim + d, -1, 1);
    if (n !== aim) { aim = n; Kit.sfx.move(); }
  }
  function start() {
    Kit.store.set('cricketblast.format', fmtIx);
    state = 'play'; paused = false;
    newMatch(false);
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
  }
  function toMenu() { state = 'menu'; newMatch(true); }

  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      const prev = fmtIx;
      if (k === 'left' || k === 'up') fmtIx = (fmtIx + FORMATS.length - 1) % FORMATS.length;
      else if (k === 'right' || k === 'down') fmtIx = (fmtIx + 1) % FORMATS.length;
      else if (k === 'ok' && !repeat) start();
      if (fmtIx !== prev) Kit.sfx.move();
      return;
    }
    if (state === 'over') {
      if (overT < 1.4 || repeat) return;
      if (k === 'ok') start();
      else { Kit.sfx.move(); toMenu(); }
      return;
    }
    if (paused) { paused = false; Kit.sfx.pick(); return; }
    if (k === 'restart') { start(); return; }
    if (k === 'ok') { if (!repeat) swing(); return; }
    if (k === 'left') setAim(-1);
    else if (k === 'right') setAim(1);
    else if (k === 'up' || k === 'down') { if (aim) { aim = 0; Kit.sfx.move(); } }
  });

  const muteBox = () => ({ x: W - 58, y: 8, w: 48, h: 48 });
  const inBox = (e, r) => r && e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h;
  let cards = [], menuBtn = null;
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = cards.findIndex((r) => inBox(e, r));
        if (i >= 0) { if (i === fmtIx) start(); else { fmtIx = i; Kit.sfx.move(); } }
        return;
      }
      if (state === 'over') {
        if (overT < 1.4) return;
        if (inBox(e, menuBtn)) toMenu(); else start();
        return;
      }
      if (paused) { paused = false; return; }
      // Tap the left or right third to aim that way as you swing.
      if (stage === 'deliver' && b && !b.swung) aim = e.x < W / 3 ? -1 : e.x > (W * 2) / 3 ? 1 : 0;
      swing();
    },
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') paused = true; });

  // ---------- Update ----------
  function update(dt) {
    clock += dt;
    if (!W) return;
    shown += (runs - shown) * Math.min(1, dt * 8);
    if (Math.abs(runs - shown) < 0.5) shown = runs;
    bump = Math.max(0, bump - dt * 3);
    zing = Math.max(0, zing - dt);
    if (state === 'over') overT += dt;
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].t -= dt; if (flashes[i].t < -0.12) flashes.splice(i, 1); }
    if (Math.random() < dt * (state === 'over' && won ? 30 : 5)) flashes.push({ i: (Math.random() * crowdPts.length) | 0, t: 0 });
    if (paused) return;
    if (freeze > 0) { freeze -= dt; return; }
    if (swingT >= 0) { swingT += dt; if (swingT > 1.1) swingT = -1; }
    FIELDERS.forEach((f) => { f.joy = Math.max(0, f.joy - dt); });
    if (stumps) {
      for (const s of stumps) {
        if (s.z < CAMZ + 1.6) continue;
        s.vy -= 14 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt; s.rot += s.vr * dt;
        if (s.y < 0.03) { s.y = 0.03; s.vy *= -0.35; s.vx *= 0.6; s.vz *= 0.6; s.vr *= 0.6; }
      }
    }
    if (state === 'over') return;
    stageT += dt;
    // The bowler walks back to his mark between balls.
    if (stage !== 'runup' && stage !== 'deliver') {
      if (bowler.z < 34) { bowler.z = Math.min(34, bowler.z + dt * 9); bowler.ph += dt * 7; }
      bowler.x = lerp(bowler.x, 0.5, dt * 2);
    }
    const lift = (stage === 'runup' && stageT > RUN - 0.5) || (stage === 'deliver' && b && !b.swung) ? 1 : 0;
    backlift += (lift - backlift) * Math.min(1, dt * 9);
    if (stage === 'wait') {
      if (stageT > waitFor) { stumps = null; startRunup(); }
    } else if (stage === 'runup') {
      const k = clamp(stageT / RUN, 0, 1);
      bowler.z = lerp(runFrom, 20.7, k * (2 - k) * 0.4 + k * 0.6);
      bowler.ph += dt * 15;
      stepAcc += dt;
      if (stepAcc > 0.17 && k < 0.95) { stepAcc = 0; quiet(snd.step); }
      if (k >= 1) { stage = 'deliver'; stageT = 0; quiet(snd.release); }
    } else if (stage === 'deliver') {
      b.p += dt / b.T;
      bowler.z = Math.max(17, bowler.z - dt * 5); bowler.x = lerp(bowler.x, 1.6, dt * 1.5); bowler.ph += dt * 8;
      if (!b.bounced && b.p >= b.pb) {
        b.bounced = true;
        const P = proj(xAt(b.pb), 0, zAt(b.pb));
        Kit.burst(P.x, P.y, '#d8b77a', 6, 0.35);
        quiet(snd.bounce);
      }
      if (b.auto > 0 && !b.swung && b.p >= b.auto) swing();
      if (!b.done && b.p >= 0.95 && b.willBowl) bowled();
      else if (!b.done && b.p >= 1.08) dot();
    } else if (stage === 'flight') {
      fl.t += dt;
      if (fl.t >= fl.dur) landed();
    } else if (stage === 'after') {
      if (stageT > afterFor) endBall();
    }
    // The camera tilts up to follow a big hit, then settles back.
    let want = 0;
    if (stage === 'flight' && fl && !fl.roll) {
      const w = flightPos(), sy = proj(w.x, w.y, w.z).y - camY;
      want = clamp(H * 0.2 - sy, 0, EXTRA);
    }
    camY += (want - camY) * Math.min(1, dt * (want > camY ? 5 : 2.5));
    // A short glowing trail behind the ball.
    const bp = ballScreen();
    if (bp) { trail.push(bp); if (trail.length > 7) trail.shift(); } else trail.length = 0;
  }

  function flightPos() {
    const k = clamp(fl.t / fl.dur, 0, 1);
    const g = fl.roll ? 1 - Math.pow(1 - k, 1.7) : k;
    const x = lerp(fl.x0, fl.tx, g), z = lerp(fl.z0, fl.tz, g);
    let y;
    if (fl.roll) y = lerp(fl.y0, 0.07, Math.min(1, k * 3)) + Math.abs(Math.sin(k * Math.PI * 2.5)) * fl.peak * (1 - k);
    else y = lerp(fl.y0, fl.ty, k) + 4 * fl.peak * k * (1 - k);
    return { x, y, z };
  }
  function ballWorld() {
    if (stage === 'flight' && fl) return flightPos();
    if (b && stage === 'deliver' && !b.hidden) return { x: xAt(b.p), y: yAt(b.p), z: zAt(b.p) };
    return null;
  }
  function ballScreen() {
    const w = ballWorld();
    if (!w) return null;
    const P = proj(w.x, w.y, w.z);
    return { x: P.x, y: P.y, r: Math.max(stage === 'flight' ? 4.5 : 3, 0.075 * P.s), z: w.z };
  }

  // ---------- Cached art ----------
  const scene = document.createElement('canvas');
  let crowdPts = [];
  const sprites = new Map();
  function sprite(name, size, draw) {
    const k = name + Math.round(size);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = s.height = Math.max(2, Math.ceil(size * dpr));
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, size);
    sprites.set(k, s);
    return s;
  }
  const glowSprite = (color) => sprite('glow' + color, 64, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const ballSprite = (size) => sprite('ball', size, (c, s) => {
    const g = c.createRadialGradient(s * 0.36, s * 0.32, s * 0.04, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#eef1f8'); g.addColorStop(1, '#9aa3bd');
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 0.5, 0, Math.PI * 2); c.fill();
    if (s > 7) { c.strokeStyle = 'rgba(80,90,130,0.45)'; c.lineWidth = Math.max(1, s * 0.06); c.beginPath(); c.arc(s * 0.2, s / 2, s * 0.42, -0.9, 0.9); c.stroke(); }
  });

  function layout(w, h) {
    W = w; H = h;
    if (!W || !H) return;
    F = Math.min(H * 1.225, W * 0.75); EXTRA = Math.round(H * 0.45);
    HOR = H * 0.3; CX = W / 2; U = Math.min(H / 30, W / 44);
    sprites.clear();
    buildScene();
  }
  Kit.onResize(layout);

  function polyRing(c, r, y, a0, a1, steps, back) {
    for (let i = 0; i <= steps; i++) {
      const t = back ? a1 + (a0 - a1) * (i / steps) : a0 + (a1 - a0) * (i / steps);
      const P = proj(r * Math.sin(t), y, CZ + r * Math.cos(t));
      c.lineTo(P.x, P.y);
    }
  }
  const A = 1.7; // the part of the ground in front of the camera

  function buildScene() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const keep = camY;
    camY = EXTRA;
    scene.width = Math.ceil(W * dpr); scene.height = Math.ceil((H + EXTRA) * dpr);
    const c = scene.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Night sky with a few stars.
    let g = c.createLinearGradient(0, 0, 0, EXTRA + HOR + H * 0.08);
    g.addColorStop(0, '#010212'); g.addColorStop(0.6, '#0a1442'); g.addColorStop(1, '#1d2f78');
    c.fillStyle = g; c.fillRect(0, 0, W, H + EXTRA);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(255,255,255,${0.2 + Math.random() * 0.6})`;
      const s = Math.random() < 0.85 ? 1 : 2;
      c.fillRect(Math.random() * W, Math.random() * (EXTRA + HOR * 0.7), s, s);
    }
    // The grass, with mowing stripes.
    const fy = proj(0, 0, 100).y - 4;
    g = c.createLinearGradient(0, fy, 0, H + EXTRA);
    g.addColorStop(0, '#0c4a2c'); g.addColorStop(0.4, '#147a3e'); g.addColorStop(1, '#1d9a4a');
    c.fillStyle = g; c.fillRect(0, fy, W, H + EXTRA - fy);
    for (let z = -6, i = 0; z < 110; z += 6, i++) {
      if (i % 2) continue;
      const a = proj(0, 0, z).y, bb = proj(0, 0, z + 6).y;
      c.fillStyle = 'rgba(255,255,255,0.05)'; c.fillRect(0, bb, W, a - bb);
    }
    // Floodlight pools on the grass.
    c.globalCompositeOperation = 'lighter';
    const fc = proj(0, 0, 22);
    g = c.createRadialGradient(fc.x, fc.y, 0, fc.x, fc.y, W * 0.55);
    g.addColorStop(0, 'rgba(160,255,190,0.16)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, fy, W, H + EXTRA - fy);
    c.globalCompositeOperation = 'source-over';
    // The stands: a bowl of people rising behind the boundary.
    const R1 = 70, R2 = 100, H1 = 1.6, H2 = 20;
    c.beginPath();
    polyRing(c, R1, 0, -A, A, 120, false);
    polyRing(c, R2, H2, -A, A, 120, true);
    c.closePath();
    const top = proj(0, H2, CZ + R2).y;
    g = c.createLinearGradient(0, top, 0, proj(0, 0, CZ + R1).y);
    g.addColorStop(0, '#141c4a'); g.addColorStop(1, '#0a0f2c');
    c.fillStyle = g; c.fill();
    crowdPts = [];
    const shirts = ['#ff8a1f', '#ffd23f', '#ff5d8f', '#4fd8ff', '#ffffff', '#3ddc84', '#b388ff', '#ff4d4d', '#14b8c4'];
    let drawn = 0;
    for (let tries = 0; tries < 26000 && drawn < 7000; tries++) {
      const t = (Math.random() * 2 - 1) * A, u = Math.random();
      const r = lerp(R1 + 1, R2, u), y = lerp(H1 + 0.4, H2, u);
      const P = proj(r * Math.sin(t), y, CZ + r * Math.cos(t));
      if (P.x < -20 || P.x > W + 20 || P.y < -20 || P.y > H + EXTRA) continue;
      const s = Math.max(1.2, 0.5 * P.s);
      c.globalAlpha = 0.45 + 0.4 * (1 - u * 0.6);
      c.fillStyle = shirts[(Math.random() * shirts.length) | 0];
      c.fillRect(P.x - s / 2, P.y - s * 0.4, s, s * 0.8);
      if (s > 3) { c.fillStyle = Math.random() < 0.5 ? '#f1c79b' : '#8a5a3c'; c.beginPath(); c.arc(P.x, P.y - s * 0.6, s * 0.28, 0, Math.PI * 2); c.fill(); }
      if (drawn % 18 === 0) crowdPts.push({ x: P.x, y: P.y - s * 0.4 - EXTRA, s });
      drawn++;
    }
    c.globalAlpha = 1;
    // Tier railings and the roof's edge of lights.
    c.lineWidth = Math.max(1, H * 0.002);
    for (const u of [0.33, 0.66]) {
      c.strokeStyle = 'rgba(150,170,255,0.25)';
      c.beginPath(); polyRing(c, lerp(R1, R2, u), lerp(H1, H2, u), -A, A, 80, false); c.stroke();
    }
    c.strokeStyle = 'rgba(190,210,255,0.7)'; c.lineWidth = Math.max(2, H * 0.004);
    c.beginPath(); polyRing(c, R2, H2, -A, A, 120, false); c.stroke();
    // The wall below the stands.
    c.beginPath(); polyRing(c, R1, 0, -A, A, 120, false); polyRing(c, R1, H1, -A, A, 120, true); c.closePath();
    c.fillStyle = '#0a1238'; c.fill();
    // Floodlight towers, their beams and glow.
    const lamps = [-0.72, -0.3, 0.3, 0.72].map((t) => ({ t, top: proj(106 * Math.sin(t), 27, CZ + 106 * Math.cos(t)), base: proj(106 * Math.sin(t), H2, CZ + 106 * Math.cos(t)) }));
    for (const L of lamps) {
      c.strokeStyle = '#2a3363'; c.lineWidth = Math.max(2, 0.8 * L.top.s);
      c.beginPath(); c.moveTo(L.base.x, L.base.y); c.lineTo(L.top.x, L.top.y); c.stroke();
    }
    c.globalCompositeOperation = 'lighter';
    for (const L of lamps) {
      const tgt = [proj(-25, 0, 18), proj(25, 0, 40)];
      c.fillStyle = 'rgba(255,245,215,0.035)';
      c.beginPath(); c.moveTo(L.top.x, L.top.y); c.lineTo(tgt[0].x, tgt[0].y); c.lineTo(tgt[1].x, tgt[1].y); c.closePath(); c.fill();
      const gr = H * 0.28;
      g = c.createRadialGradient(L.top.x, L.top.y, 0, L.top.x, L.top.y, gr);
      g.addColorStop(0, 'rgba(255,246,214,0.55)'); g.addColorStop(0.25, 'rgba(255,230,170,0.18)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g; c.fillRect(L.top.x - gr, L.top.y - gr, gr * 2, gr * 2);
    }
    c.globalCompositeOperation = 'source-over';
    for (const L of lamps) {
      const lw = 8 * L.top.s, lh = 4 * L.top.s;
      c.fillStyle = '#fffbe8';
      roundRect(c, L.top.x - lw / 2, L.top.y - lh, lw, lh, lh * 0.2); c.fill();
      c.fillStyle = 'rgba(255,200,120,0.6)';
      for (let i = 1; i < 4; i++) c.fillRect(L.top.x - lw / 2 + (lw * i) / 4, L.top.y - lh, 1, lh);
    }
    // LED boards along the boundary, and the rope.
    const boards = ['#ff8a1f', '#1f8fff', '#ffd23f', '#ff3d7f', '#14b8c4'];
    const steps = 60;
    for (let i = 0; i < steps; i++) {
      const t0 = -A + (2 * A * i) / steps, t1 = -A + (2 * A * (i + 1)) / steps;
      const r = 67;
      const p0 = proj(r * Math.sin(t0), 0, CZ + r * Math.cos(t0)), p1 = proj(r * Math.sin(t1), 0, CZ + r * Math.cos(t1));
      const q0 = proj(r * Math.sin(t0), 1, CZ + r * Math.cos(t0)), q1 = proj(r * Math.sin(t1), 1, CZ + r * Math.cos(t1));
      c.fillStyle = boards[Math.floor(i / 3) % boards.length];
      c.beginPath(); c.moveTo(p0.x, p0.y); c.lineTo(p1.x, p1.y); c.lineTo(q1.x, q1.y); c.lineTo(q0.x, q0.y); c.closePath(); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.moveTo(q0.x, q0.y); c.lineTo(q1.x, q1.y); c.lineTo(q1.x, q1.y + (p1.y - q1.y) * 0.25); c.lineTo(q0.x, q0.y + (p0.y - q0.y) * 0.25); c.closePath(); c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = Math.max(1.5, H * 0.003);
    c.beginPath(); polyRing(c, ROPE, 0.05, -A, A, 140, false); c.stroke();
    // The square and the pitch.
    const quad = (x0, x1, z0, z1) => {
      const a = proj(x0, 0, z0), bb = proj(x1, 0, z0), cc = proj(x1, 0, z1), d = proj(x0, 0, z1);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(bb.x, bb.y); c.lineTo(cc.x, cc.y); c.lineTo(d.x, d.y); c.closePath();
    };
    quad(-7, 7, -3, 23); c.fillStyle = 'rgba(200,255,200,0.05)'; c.fill();
    quad(-1.52, 1.52, -3, 23);
    g = c.createLinearGradient(0, proj(0, 0, 23).y, 0, H + EXTRA);
    g.addColorStop(0, '#b99a62'); g.addColorStop(1, '#d9bd84');
    c.fillStyle = g; c.fill();
    quad(-0.5, 0.5, -3, 23); c.fillStyle = 'rgba(255,240,200,0.10)'; c.fill();
    c.fillStyle = 'rgba(120,90,50,0.13)';
    for (const [x, z, r] of [[0.35, 1.8, 0.4], [-0.3, 2.4, 0.3], [0.25, 18.6, 0.5], [-0.5, 3.8, 0.25], [0.1, 5.5, 0.35]]) {
      const P = proj(x, 0, z);
      c.beginPath(); c.ellipse(P.x, P.y, r * P.s, r * P.s * 0.25, 0, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(255,255,255,0.92)';
    const line = (x0, z0, x1, z1) => {
      const a = proj(x0, 0, z0), bb = proj(x1, 0, z1);
      c.lineWidth = Math.max(1, 0.06 * (a.s + bb.s) / 2);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(bb.x, bb.y); c.stroke();
    };
    for (const z of [0, 20]) line(-1.32, z, 1.32, z);
    for (const z of [1.22, 18.78]) line(-1.83, z, 1.83, z);
    for (const sx of [-1, 1]) { line(sx * 1.32, -1, sx * 1.32, 2.44); line(sx * 1.32, 17.56, sx * 1.32, 21); }
    // Vignette.
    g = c.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, Math.max(W, H) * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,20,0.55)');
    c.fillStyle = g; c.fillRect(0, EXTRA, W, H);
    camY = keep;
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, topC, bottomC, align = 'center') {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(3,6,28,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, topC); g.addColorStop(1, bottomC);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, alpha = 0.82) {
    roundRect(c, x, y, w, h, r);
    c.fillStyle = `rgba(8,14,48,${alpha})`; c.fill();
    c.lineWidth = 2; c.strokeStyle = border; c.stroke();
  }

  // A simple player: m = pixels per metre at his feet (x, y).
  function figure(c, x, y, m, shirt, shirtD, opts = {}) {
    const ph = opts.ph || 0, run = opts.run || 0;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(x, y, 0.4 * m, 0.09 * m, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = opts.trousers || '#eef1f8'; c.lineCap = 'round'; c.lineWidth = Math.max(1.5, 0.15 * m);
    for (const sd of [-1, 1]) {
      const lift = run * Math.max(0, Math.sin(ph + (sd > 0 ? 0 : Math.PI))) * 0.32;
      c.beginPath(); c.moveTo(x + sd * 0.1 * m, y - 0.92 * m); c.lineTo(x + sd * 0.13 * m, y - (0.05 + lift) * m); c.stroke();
    }
    c.fillStyle = shirt;
    roundRect(c, x - 0.23 * m, y - 1.52 * m, 0.46 * m, 0.62 * m, 0.1 * m); c.fill();
    c.fillStyle = shirtD; c.fillRect(x + 0.1 * m, y - 1.46 * m, 0.12 * m, 0.52 * m);
    // Arms: pumping when running, a windmill when bowling, up in the air when celebrating.
    c.strokeStyle = shirt; c.lineWidth = Math.max(1.5, 0.11 * m);
    const sh = y - 1.45 * m;
    for (const sd of [-1, 1]) {
      let ax, ay;
      if (opts.joy) { ax = sd * 0.35; ay = -0.55; }
      else if (sd > 0 && opts.arm >= 0) { const t = Math.PI / 2 - opts.arm * Math.PI * 2; ax = Math.cos(t) * 0.62; ay = Math.sin(t) * 0.62; }
      else { const sw = run * Math.sin(ph + (sd > 0 ? Math.PI : 0)); ax = sd * (0.08 + Math.abs(sw) * 0.06); ay = 0.52 - sw * 0.14; }
      c.beginPath(); c.moveTo(x + sd * 0.22 * m, sh); c.lineTo(x + (sd * 0.22 + ax) * m, sh + ay * m); c.stroke();
    }
    c.fillStyle = '#e0a878';
    c.beginPath(); c.arc(x, y - 1.66 * m, 0.13 * m, 0, Math.PI * 2); c.fill();
    c.fillStyle = opts.hat || shirtD;
    c.beginPath(); c.arc(x, y - 1.69 * m, 0.135 * m, Math.PI, 0); c.fill();
  }

  function drawStumpsAt(c, z, lit) {
    for (const x of [-0.115, 0, 0.115]) {
      const a = proj(x, 0, z), t = proj(x, 0.71, z);
      const w = Math.max(1.5, 0.04 * a.s);
      c.fillStyle = lit ? '#ff6b4a' : '#f3e7c6';
      c.fillRect(a.x - w / 2, t.y, w, a.y - t.y);
      if (w > 3) { c.fillStyle = lit ? '#b8321a' : '#c7b48a'; c.fillRect(a.x + w * 0.1, t.y, w * 0.4, a.y - t.y); }
    }
    const l = proj(-0.13, 0.72, z), r = proj(0.13, 0.72, z);
    c.fillStyle = lit ? '#ffd23f' : '#ff9d3a';
    c.fillRect(l.x, l.y - Math.max(1.5, 0.03 * l.s), r.x - l.x, Math.max(1.5, 0.03 * l.s));
  }

  function batPose() {
    const idle = { hx: 0.16, hy: 1.02, ang: 1.25 + Math.sin(clock * 3) * 0.05 };
    const up = { hx: 0.27, hy: 1.36, ang: -1.0 };
    const mix = (p, q, k) => ({ hx: lerp(p.hx, q.hx, k), hy: lerp(p.hy, q.hy, k), ang: lerp(p.ang, q.ang, k) });
    if (swingT < 0) return mix(idle, up, backlift);
    const e = ease.out(Math.min(1, swingT / 0.22));
    const ang = lerp(-1.0, 3.95, e);
    const u = 1 - e;
    const sw = { hx: u * u * 0.27 + 2 * u * e * 0.12 + e * e * -0.3, hy: u * u * 1.36 + 2 * u * e * 0.82 + e * e * 1.42, ang };
    if (swingT > 0.65) {
      const k = ease.inOut(Math.min(1, (swingT - 0.65) / 0.4));
      const back = { hx: idle.hx, hy: idle.hy, ang: idle.ang + Math.PI * 2 };
      return mix(sw, back, k);
    }
    return sw;
  }

  function drawBatter(c) {
    const P = proj(BAT_X, 0, BAT_Z), m = P.s, x = P.x, y = P.y;
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(x + 0.08 * m, y, 0.5 * m, 0.1 * m, 0, 0, Math.PI * 2); c.fill();
    // Legs: pads and shoes.
    for (const sd of [-1, 1]) {
      const lx = x + sd * 0.16 * m;
      c.fillStyle = '#1c2340';
      c.beginPath(); c.ellipse(lx, y - 0.03 * m, 0.11 * m, 0.05 * m, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#f5f7fc';
      roundRect(c, lx - 0.1 * m, y - 0.84 * m, 0.2 * m, 0.8 * m, 0.07 * m); c.fill();
      c.fillStyle = '#c8d1e6';
      for (let i = 0; i < 4; i++) c.fillRect(lx - 0.08 * m, y - (0.18 + i * 0.17) * m, 0.16 * m, 0.025 * m);
      c.fillStyle = '#dfe5f2'; c.fillRect(lx + 0.04 * m, y - 0.82 * m, 0.05 * m, 0.76 * m);
    }
    c.fillStyle = '#e9edf6';
    roundRect(c, x - 0.24 * m, y - 1.05 * m, 0.48 * m, 0.26 * m, 0.06 * m); c.fill();
    // Shirt with name and number on the back.
    c.fillStyle = TEAM;
    roundRect(c, x - 0.27 * m, y - 1.56 * m, 0.54 * m, 0.6 * m, 0.11 * m); c.fill();
    c.fillStyle = TEAM_D;
    roundRect(c, x + 0.12 * m, y - 1.52 * m, 0.14 * m, 0.54 * m, 0.08 * m); c.fill();
    c.fillStyle = NAVY; c.fillRect(x - 0.27 * m, y - 1.03 * m, 0.54 * m, 0.05 * m);
    c.fillStyle = NAVY;
    c.font = `900 ${Math.round(0.28 * m)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('7', x, y - 1.2 * m);
    c.font = `800 ${Math.round(0.075 * m)}px system-ui, sans-serif`;
    c.fillText('BLAST', x, y - 1.43 * m);
    // Bat, arms and gloves.
    const pose = batPose();
    const hx = x + pose.hx * m, hy = y - pose.hy * m;
    const drawBat = () => {
      c.save(); c.translate(hx, hy); c.rotate(pose.ang);
      c.fillStyle = '#262b45'; c.fillRect(-0.05 * m, -0.022 * m, 0.34 * m, 0.044 * m);
      c.fillStyle = '#ecd49c'; roundRect(c, 0.28 * m, -0.058 * m, 0.84 * m, 0.116 * m, 0.04 * m); c.fill();
      c.fillStyle = '#c4a160'; c.fillRect(0.3 * m, 0.03 * m, 0.8 * m, 0.028 * m);
      c.fillStyle = TEAM; c.fillRect(0.42 * m, -0.058 * m, 0.16 * m, 0.116 * m);
      c.fillStyle = NAVY; c.fillRect(0.47 * m, -0.058 * m, 0.03 * m, 0.116 * m);
      c.restore();
    };
    const behind = swingT >= 0 && swingT < 0.65 && Math.sin(pose.ang) < -0.2 && Math.cos(pose.ang) < 0;
    if (behind) drawBat();
    c.strokeStyle = TEAM; c.lineCap = 'round'; c.lineWidth = 0.12 * m;
    for (const sd of [-1, 1]) {
      const sx = x + sd * 0.22 * m, sy = y - 1.46 * m;
      const ex = lerp(sx, hx, 0.5) + sd * 0.05 * m, ey = lerp(sy, hy, 0.5) + 0.04 * m;
      c.beginPath(); c.moveTo(sx, sy); c.lineTo(ex, ey); c.stroke();
      c.strokeStyle = '#d99c6b'; c.lineWidth = 0.09 * m;
      c.beginPath(); c.moveTo(ex, ey); c.lineTo(hx, hy); c.stroke();
      c.strokeStyle = TEAM; c.lineWidth = 0.12 * m;
    }
    if (!behind) drawBat();
    c.fillStyle = '#ffffff';
    c.beginPath(); c.arc(hx, hy, 0.075 * m, 0, Math.PI * 2); c.fill();
    c.fillStyle = TEAM; c.beginPath(); c.arc(hx, hy, 0.03 * m, 0, Math.PI * 2); c.fill();
    // Helmet from behind.
    c.fillStyle = '#e0a878'; c.fillRect(x - 0.06 * m, y - 1.62 * m, 0.12 * m, 0.08 * m);
    c.fillStyle = NAVY;
    c.beginPath(); c.arc(x, y - 1.72 * m, 0.155 * m, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#26357a';
    c.beginPath(); c.arc(x - 0.04 * m, y - 1.76 * m, 0.1 * m, Math.PI, Math.PI * 1.8); c.fill();
    c.fillStyle = TEAM; c.fillRect(x - 0.02 * m, y - 1.875 * m, 0.04 * m, 0.3 * m);
    c.fillStyle = '#1a2558'; c.fillRect(x - 0.12 * m, y - 1.62 * m, 0.24 * m, 0.05 * m);
  }

  function drawBall(c) {
    const bp = trail.length ? trail[trail.length - 1] : null;
    if (!bp) return;
    const w = ballWorld();
    if (w) {
      const S = proj(w.x, 0, w.z);
      c.fillStyle = 'rgba(0,0,0,0.35)';
      const r = Math.max(2, 0.07 * S.s);
      c.beginPath(); c.ellipse(S.x, S.y, r, r * 0.4, 0, 0, Math.PI * 2); c.fill();
    }
    const glow = glowSprite('rgba(255,236,190,0.9)');
    for (let i = 0; i < trail.length - 1; i++) {
      const t = trail[i], a = (i + 1) / trail.length;
      c.globalAlpha = a * 0.35;
      const s = t.r * 3.2 * a;
      c.drawImage(glow, t.x - s, t.y - s, s * 2, s * 2);
    }
    c.globalAlpha = 0.7;
    const gs = bp.r * (stage === 'flight' ? 5 : 4);
    c.drawImage(glow, bp.x - gs, bp.y - gs, gs * 2, gs * 2);
    c.globalAlpha = 1;
    const d = Math.max(4, Math.round(bp.r * 2));
    c.drawImage(ballSprite(d), bp.x - d / 2, bp.y - d / 2, d, d);
  }

  function drawFlyingStumps(c) {
    for (const s of stumps) {
      if (s.z < CAMZ + 1.6) continue;
      const P = proj(s.x, s.y, s.z);
      const len = s.len * P.s, w = Math.max(2, s.w * P.s);
      c.save(); c.translate(P.x, P.y); c.rotate(s.rot);
      c.fillStyle = s.bail ? GOLD : (zing > 0 && Math.sin(clock * 30) > 0 ? '#ff6b4a' : '#f3e7c6');
      c.fillRect(-w / 2, -len / 2, w, len);
      c.restore();
    }
  }

  function draw(c, t) {
    if (!W) return;
    c.drawImage(scene, 0, camY - EXTRA, W, H + EXTRA);
    // Camera flashes in the crowd.
    c.fillStyle = '#ffffff';
    for (const f of flashes) {
      if (f.t > 0) continue;
      const p = crowdPts[f.i];
      if (!p) continue;
      c.globalAlpha = 1 + f.t * 8;
      const s = Math.max(2, p.s * 0.7);
      c.fillRect(p.x - s / 2, p.y + camY - s / 2, s, s);
    }
    c.globalAlpha = 1;
    // Fielders, far to near.
    for (let i = FIELDERS.length - 1; i >= 0; i--) {
      const f = FIELDERS[i], P = proj(f.x, 0, f.z);
      figure(c, P.x, P.y, P.s, OPP, OPP_D, { joy: f.joy > 0, ph: t * 2 + i, run: 0, arm: -1 });
    }
    // Where the ball will pitch: a ring on the pitch, as in the big console games.
    if (b && (stage === 'runup' || stage === 'deliver') && b.p < b.pb + 0.05) {
      const P = proj(xAt(b.pb), 0, zAt(b.pb));
      const a = stage === 'runup' ? clamp(stageT / 0.4, 0, 1) : 1 - clamp((b.p - b.pb) / 0.05, 0, 1);
      const pulse = 1 + Math.sin(t * 9) * 0.1;
      c.globalAlpha = 0.85 * a;
      c.strokeStyle = b.side === 0 ? '#ffd23f' : '#4fd8ff'; c.lineWidth = Math.max(2, 0.06 * P.s);
      c.beginPath(); c.ellipse(P.x, P.y, 0.32 * P.s * pulse, 0.32 * P.s * 0.3 * pulse, 0, 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 0.35 * a; c.fillStyle = c.strokeStyle;
      c.beginPath(); c.ellipse(P.x, P.y, 0.18 * P.s, 0.18 * P.s * 0.3, 0, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 1;
    }
    // Far stumps, umpire and bowler, sorted by distance.
    const ump = { z: 22, draw: () => { const P = proj(-1.2, 0, 22); figure(c, P.x, P.y, P.s, '#f4f6fb', '#c9d0e0', { trousers: '#1b1f2e', hat: '#f4f6fb', arm: -1 }); } };
    const stk = { z: 20, draw: () => drawStumpsAt(c, 20, false) };
    const bwl = { z: bowler.z, draw: () => {
      const P = proj(bowler.x, 0, bowler.z);
      const running = stage === 'runup' ? 1 : (bowler.z < 34 && stage !== 'deliver' ? 0.5 : stage === 'deliver' ? 0.6 : 0);
      let arm = -1;
      if (stage === 'runup' && stageT > RUN - 0.3) arm = (stageT - (RUN - 0.3)) / 0.36;
      else if (stage === 'deliver' && stageT < 0.06) arm = (0.3 + stageT) / 0.36;
      figure(c, P.x, P.y, P.s, OPP, OPP_D, { run: running, ph: bowler.ph, arm: arm > 1 ? -1 : arm });
    } };
    [ump, stk, bwl].sort((p, q) => q.z - p.z).forEach((o) => o.draw());
    const bw = ballWorld();
    const ballFar = !bw || bw.z > BAT_Z + 0.1 || stage === 'flight';
    if (ballFar) drawBall(c);
    drawBatter(c);
    if (!ballFar) drawBall(c);
    if (stumps) drawFlyingStumps(c); else drawStumpsAt(c, 0, false);

    if (state !== 'menu') drawHud(c, t);
    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c);
    if (paused) {
      c.fillStyle = 'rgba(2,5,25,0.65)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.42, U * 3.2, '#ffffff', '#ffc27a');
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'Any key to carry on  ·  Back for games', W / 2, H * 0.55, U * 1.1, 'rgba(255,255,255,0.85)', 700);
    }
  }

  function drawHud(c, t) {
    // Scoreboard: runs / wickets, overs and target.
    const x0 = U * 0.8, y0 = U * 0.7, pw = U * 13.5, ph = U * 5.2;
    panel(c, x0, y0, pw, ph, U * 0.8, 'rgba(255,170,80,0.55)');
    c.fillStyle = TEAM; roundRect(c, x0, y0, U * 0.45, ph, U * 0.22); c.fill();
    text(c, `MATCH ${matchLevel}  ·  ${fmt.name.toUpperCase()}`, x0 + U * 1.2, y0 + U * 0.95, U * 0.75, '#ffc27a', 800, 'left');
    c.save();
    const sx = x0 + U * 1.2, sy = y0 + U * 2.65;
    c.translate(sx, sy); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
    outlined(c, `${Math.round(shown)}/${wkts}`, 0, 0, U * 2.4, '#ffffff', '#ffd9a8', 'left');
    c.restore();
    text(c, 'OVERS', x0 + pw - U * 0.9, y0 + U * 1.95, U * 0.6, 'rgba(255,255,255,0.6)', 800, 'right');
    text(c, `${Math.floor(balls / 6)}.${balls % 6} / ${fmt.overs}`, x0 + pw - U * 0.9, y0 + U * 2.85, U * 1.05, '#ffffff', 800, 'right');
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(x0 + U * 0.45, y0 + ph - U * 1.25, pw - U * 0.45, 1);
    text(c, `TARGET ${target}`, x0 + U * 1.2, y0 + ph - U * 0.62, U * 0.8, GOLD, 900, 'left');
    text(c, `Wickets left ${Math.max(0, fmt.wkts - wkts)}`, x0 + pw - U * 0.9, y0 + ph - U * 0.62, U * 0.7, 'rgba(255,255,255,0.75)', 700, 'right');

    // Chase line and this over's balls.
    const need = Math.max(0, target - runs), left = Math.max(0, fmt.overs * 6 - balls);
    const cw = U * 14, cx = W / 2 - cw / 2, cy = U * 0.7;
    panel(c, cx, cy, cw, U * 2.1, U * 1.05, 'rgba(120,200,255,0.45)');
    text(c, need > 0 ? `NEED ${need} FROM ${left} BALL${left === 1 ? '' : 'S'}` : 'TARGET REACHED!', W / 2, cy + U * 1.07, U * 0.95, need > 0 ? '#ffffff' : '#5dffb1', 900);
    const r = U * 0.62, gap = U * 0.35, rowW = 6 * r * 2 + 5 * gap;
    for (let i = 0; i < 6; i++) {
      const bx = W / 2 - rowW / 2 + r + i * (2 * r + gap), by = cy + U * 3.05;
      const tok = thisOver[i];
      c.beginPath(); c.arc(bx, by, r, 0, Math.PI * 2);
      c.fillStyle = !tok ? 'rgba(8,14,48,0.55)' : tok === 'W' ? '#ff4d4d' : tok === '6' ? GOLD : tok === '4' ? '#1fb6ff' : tok === '•' ? '#3a4470' : '#3ddc84';
      c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.35)'; c.stroke();
      if (tok) text(c, tok, bx, by + 1, r * (tok === '•' ? 1.4 : 1.1), tok === '6' ? '#3a2600' : '#ffffff', 900);
    }

    // Best, top right.
    text(c, `👑 Best ${Math.max(best, 0)}`, W - U * 3.2, U * 1.5, U * 0.95, GOLD, 800, 'right');

    // Timing meter and aim.
    drawMeter(c, t);
  }

  function drawMeter(c, t) {
    const mw = Math.min(W * 0.42, U * 22), mh = U * 0.85, mx = W / 2 - mw / 2, my = H - U * 2.3;
    const P0 = 0.55, P1 = 1.0;
    const X = (p) => mx + clamp((p - P0) / (P1 - P0), 0, 1) * mw;
    roundRect(c, mx - 5, my - 5, mw + 10, mh + 10, (mh + 10) / 2);
    c.fillStyle = 'rgba(5,9,34,0.82)'; c.fill(); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.3)'; c.stroke();
    c.save();
    roundRect(c, mx, my, mw, mh, mh / 2); c.clip();
    c.fillStyle = '#1b2350'; c.fillRect(mx, my, mw, mh);
    const k = aimMult();
    const band = (half, color) => { const a = X(MID - half * k), bb = X(MID + half * k); c.fillStyle = color; c.fillRect(a, my, bb - a, mh); };
    band(ZONE, '#ffc533'); band(0.065, '#ffe27a'); band(PERFECT, '#3dffa0');
    c.fillStyle = 'rgba(255,255,255,0.25)'; c.fillRect(mx, my, mw, mh * 0.35);
    c.restore();
    text(c, '6', X(MID), my - U * 0.55, U * 0.7, '#5dffb1', 900);
    // The ball's marker.
    if (b && (stage === 'deliver' || (b.swung && stage !== 'wait'))) {
      const p = b.swung && b.swingP != null ? b.swingP : b.p;
      const px = X(p);
      c.fillStyle = 'rgba(0,0,0,0.6)'; roundRect(c, px - 5, my - 9, 10, mh + 18, 5); c.fill();
      c.fillStyle = '#ffffff'; roundRect(c, px - 3, my - 7, 6, mh + 14, 3); c.fill();
    }
    // Aim chips either side.
    const chip = (dir, cx) => {
      const on = aim === dir;
      c.beginPath(); c.arc(cx, my + mh / 2, U * 0.95, 0, Math.PI * 2);
      c.fillStyle = on ? TEAM : 'rgba(8,14,48,0.75)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = on ? '#ffe0b8' : 'rgba(255,255,255,0.3)'; c.stroke();
      text(c, dir < 0 ? '◀' : '▶', cx, my + mh / 2 + 1, U * 0.9, '#ffffff', 900);
    };
    chip(-1, mx - U * 2); chip(1, mx + mw + U * 2);
    const aimTxt = aim < 0 ? 'AIM LEFT' : aim > 0 ? 'AIM RIGHT' : 'AIM STRAIGHT';
    const read = b && aim === b.side && (stage === 'runup' || stage === 'deliver');
    text(c, aimTxt + (read ? '  ✓' : ''), W / 2, my + mh + U * 0.95, U * 0.7, read ? '#5dffb1' : 'rgba(255,255,255,0.75)', 800);
    if (hint > 0 && state === 'play' && balls === 0) {
      const a = 0.75 + Math.sin(t * 4) * 0.25;
      c.globalAlpha = a;
      const msg = Kit.touchFirst() ? 'Tap to swing  ·  tap a side to aim' : 'OK to swing in the green  ·  ◀ ▶ aim at the ring';
      const w = U * 22;
      panel(c, W / 2 - w / 2, my - U * 3.6, w, U * 1.7, U * 0.85, 'rgba(255,210,63,0.6)');
      text(c, msg, W / 2, my - U * 2.75, U * 0.82, '#ffffff', 800);
      c.globalAlpha = 1;
    }
  }

  function drawMenu(c, t) {
    c.fillStyle = 'rgba(2,5,25,0.5)'; c.fillRect(0, 0, W, H);
    const s = Math.min(U * 4, W * 0.09);
    c.save(); c.translate(W / 2, H * 0.17); c.rotate(Math.sin(t * 1.5) * 0.015);
    outlined(c, 'CRICKET BLAST', 0, 0, s, '#fff4dc', '#ff9a2e');
    c.restore();
    text(c, `Match ${level}  ·  chase the target under the lights`, W / 2, H * 0.17 + s * 0.85, U * 1, 'rgba(255,255,255,0.88)', 700);
    const wide = W > H;
    const cw = wide ? Math.min(W * 0.24, U * 12) : Math.min(W * 0.8, U * 16), ch = wide ? cw * 0.7 : Math.min(H * 0.15, cw * 0.34);
    const gap = U * 1.2, total = wide ? cw * 3 + gap * 2 : ch * 3 + gap * 2;
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.52 - ch / 2 : H * 0.55 - total / 2;
    cards = FORMATS.map((f, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    FORMATS.forEach((f, i) => {
      const r = cards[i], on = i === fmtIx;
      const k = on ? 1.06 + Math.sin(t * 5) * 0.012 : 1;
      c.save(); c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      roundRect(c, -r.w / 2, -r.h / 2, r.w, r.h, U * 0.9);
      c.fillStyle = on ? 'rgba(40,24,70,0.92)' : 'rgba(10,16,52,0.85)'; c.fill();
      c.lineWidth = on ? 4 + Math.sin(t * 6) * 1.2 : 2; c.strokeStyle = on ? TEAM : 'rgba(140,170,255,0.35)'; c.stroke();
      if (wide) {
        text(c, f.icon, 0, -r.h * 0.24, r.h * 0.24, '#fff', 400);
        text(c, f.name, 0, r.h * 0.03, r.h * 0.16, '#ffffff', 900);
        text(c, `${f.overs} overs · ${f.wkts} wickets`, 0, r.h * 0.21, r.h * 0.085, 'rgba(255,255,255,0.78)', 700);
        text(c, on ? 'OK to play' : ' ', 0, r.h * 0.37, r.h * 0.08, '#ffc27a', 800);
      } else {
        text(c, f.icon, -r.w * 0.36, 0, r.h * 0.4, '#fff', 400);
        text(c, f.name, -r.w * 0.2, -r.h * 0.14, r.h * 0.26, '#ffffff', 900, 'left');
        text(c, `${f.overs} overs · ${f.wkts} wickets`, -r.w * 0.2, r.h * 0.2, r.h * 0.15, 'rgba(255,255,255,0.75)', 600, 'left');
      }
      c.restore();
    });
    const by = wide ? y0 + ch + U * 2.2 : y0 + total + U * 1.4;
    text(c, Kit.touchFirst() ? 'Tap a format to play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, by, U * 1, 'rgba(255,255,255,0.9)', 800);
    text(c, 'Swing in the green for a SIX  ·  aim at the pitching ring for a bigger sweet spot', W / 2, by + U * 1.5, U * 0.78, 'rgba(255,255,255,0.7)', 600);
    text(c, `👑 Best ${best}`, W / 2, by + U * 3, U * 1, GOLD, 800);
  }

  function drawOver(c) {
    const a = clamp((overT - 0.5) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(2,5,25,${0.65 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, U * 24), ph = U * 15.5;
    roundRect(c, -pw / 2, -ph / 2, pw, ph, U * 1.2);
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    g.addColorStop(0, '#1d2a6e'); g.addColorStop(1, '#0a1035');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = won ? GOLD : '#ff8f6b'; c.stroke();
    outlined(c, won ? 'YOU WON!' : 'MATCH LOST', 0, -ph * 0.36, U * 2.6, '#ffffff', won ? GOLD : '#ff9f8a');
    text(c, endMsg, 0, -ph * 0.22, U * 0.95, 'rgba(255,255,255,0.85)', 700);
    outlined(c, `${runs}/${wkts}`, 0, -ph * 0.04, U * 3.4, '#fff4dc', '#ffb35c');
    text(c, `${Math.floor(balls / 6)}.${balls % 6} overs  ·  target ${target}`, 0, ph * 0.1, U * 0.9, 'rgba(255,255,255,0.75)', 700);
    text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.2, U * 1, GOLD, 800);
    const ready = overT > 1.4;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? (won ? 'Tap for the next match' : 'Tap to play again') : (won ? `OK  next match (${level})` : 'OK  play again'), 0, ph * 0.31, U * 1.05, '#9be8ff', 800);
    const bw = U * 11, bh = U * 1.5;
    roundRect(c, -bw / 2, ph * 0.37, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Other formats' : 'Arrows  other formats', 0, ph * 0.37 + bh / 2, U * 0.75, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.37 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  newMatch(true);
  Kit.canvas.focus();
  if (best > 0) Kit.record('cricketblast', best);
})();
