// Strike Lanes: ten-pin bowling down a glowing 3D lane. Ten frames with real scoring (strike and
// spare bonuses, up to three balls in the tenth). One to four players take turns, each seat a person
// or the TV. Remote: ◀ ▶ move along the foul line, ▲ ▼ choose spin, OK locks the swinging aim arrow,
// OK again locks the power meter and the ball rolls (with hook). Beginner adds gutter bumpers.
// Menu: ▲ ▼ choose a row, ◀ ▶ change, OK plays. Touch: tap = OK. M mutes.
// Test hooks: #auto / #autoN (N TV players, 4x speed), #fast (4x speed).
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const ID = 'strikelanes';
  const HASH = (location.hash || '').toLowerCase();
  const AUTO = HASH.indexOf('auto') >= 0;
  const SPEED = AUTO || HASH.indexOf('fast') >= 0 ? 4 : 1;
  const AUTO_N = clamp(parseInt((HASH.match(/auto(\d)/) || [])[1], 10) || 3, 1, 4);
  const TAU = Math.PI * 2, DEG = Math.PI / 180;

  const SEAT_C = ['#ff4d6d', '#3d8bff', '#2ed573', '#ffc312'];
  const SKILLS = [
    { name: 'Beginner', tip: 'Gutter bumpers · slow meters · guide shows the ball\'s path', bumpers: true,
      aimMax: 2.4, aimPeriod: 3.4, powPeriod: 2.8, guide: 'path', aiAng: 1.1, aiPow: 0.18 },
    { name: 'Normal', tip: 'No bumpers · short aim arrow · faster meters', bumpers: false,
      aimMax: 3, aimPeriod: 2.3, powPeriod: 1.9, guide: 6, aiAng: 0.45, aiPow: 0.1 },
    { name: 'Hard', tip: 'Quick meters · tiny arrow · the TV bowls like a pro', bumpers: false,
      aimMax: 3.5, aimPeriod: 1.6, powPeriod: 1.3, guide: 3, aiAng: 0.2, aiPow: 0.05 },
  ];

  // ---------- Lane geometry (metres): x across (right +), z down the lane, foul line z = 0 ----------
  const HALF = 0.533, BALL_R = 0.108, PIN_R = 0.06, HEAD_Z = 18.29, PIT_Z = 19.2, GUTTER = 0.24;
  const CAM_H = 1.25, LANE_GAP = 1.75;
  const PIN0 = [
    [0, 0], [-0.1524, 1], [0.1524, 1], [-0.3048, 2], [0, 2], [0.3048, 2], [-0.4572, 3], [-0.1524, 3], [0.1524, 3], [0.4572, 3],
  ].map(([x, r]) => ({ x, z: HEAD_Z + r * 0.2635 }));

  // ---------- Setup and records ----------
  const setup = Kit.store.get(ID + '.setup', { people: 1, tv: 1 }) || {};
  let people = clamp((setup.people | 0) || 1, 1, 4), tvs = clamp(setup.tv | 0, 0, 3);
  function fixTv() { tvs = clamp(tvs, 0, 4 - people); }
  fixTv();
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, SKILLS.length - 1);
  let best = Kit.store.get(ID + '.best', 0) | 0;

  // ---------- State ----------
  let state = 'menu', menuRow = 0, overBtn = 0, stateT = 0, clock = 0;
  let players = [], cur = 0, frameIx = 0, phase = 'banner', phaseT = 0, bannerT = 9, sk = SKILLS[skill];
  let pins = [], ball = null, startX = 0, spin = 0, aimDeg = 0, aimT = 0, powT = 0, power = 0;
  let cam = { x: 0, z: -4.2 }, standingAtStart = 0, rollT = 0, settleT = 0, resultMsg = null, ai = null;
  let winners = [], newBest = false, menuDemoT = 0, lastHits = 0, hits = [];

  const human = (i) => players[i] && players[i].human;

  function newGame() {
    sk = SKILLS[skill];
    const humans = AUTO ? 0 : people, n = AUTO ? AUTO_N : people + tvs;
    players = [];
    let tvN = 0;
    for (let i = 0; i < n; i++) {
      const isH = i < humans;
      if (!isH) tvN++;
      players.push({ c: SEAT_C[i], human: isH, name: isH ? (humans === 1 ? 'You' : `Player ${i + 1}`) : (n - humans === 1 ? 'TV' : `TV ${tvN}`),
        frames: [], startX: 0, spin: 0 });
    }
    cur = 0; frameIx = 0; newBest = false;
    startTurn();
  }

  // ---------- Scoring ----------
  function cumScores(frames) {
    const rolls = [].concat(...frames);
    const out = [];
    let total = 0, idx = 0;
    for (let f = 0; f < 10; f++) {
      const fr = frames[f];
      if (!fr || !fr.length) { out.push(null); continue; }
      if (f < 9) {
        if (fr[0] === 10) {
          if (rolls[idx + 1] == null || rolls[idx + 2] == null) { out.push(null); idx += 1; continue; }
          total += 10 + rolls[idx + 1] + rolls[idx + 2]; idx += 1;
        } else if (fr.length < 2) { out.push(null); idx += 1; continue; }
        else if (fr[0] + fr[1] === 10) {
          if (rolls[idx + 2] == null) { out.push(null); idx += 2; continue; }
          total += 10 + rolls[idx + 2]; idx += 2;
        } else { total += fr[0] + fr[1]; idx += 2; }
      } else {
        const done = fr.length === 3 || (fr.length === 2 && fr[0] + fr[1] < 10);
        if (!done) { out.push(null); continue; }
        total += fr.reduce((s, v) => s + v, 0);
      }
      out.push(total);
    }
    return out;
  }
  function totalOf(p) { const c = cumScores(p.frames); let t = 0; c.forEach((v) => { if (v != null) t = v; }); return t; }
  // What to write in the little boxes of a frame
  function marks(fr, f) {
    if (!fr || !fr.length) return [];
    const m = [];
    if (f < 9) {
      if (fr[0] === 10) return ['', 'X'];
      m.push(fr[0] === 0 ? '-' : String(fr[0]));
      if (fr.length > 1) m.push(fr[0] + fr[1] === 10 ? '/' : fr[1] === 0 ? '-' : String(fr[1]));
      return m;
    }
    let left = 10;
    fr.forEach((v) => {
      if (left === 10) { if (v === 10) m.push('X'); else { m.push(v ? String(v) : '-'); left = 10 - v; } }
      else { m.push(v === left ? '/' : v ? String(v) : '-'); left = 10; }
    });
    return m;
  }
  // Is this player's frame finished, and should the pins be reset for the next ball?
  function frameState(fr, f) {
    if (f < 9) return { done: fr[0] === 10 || fr.length === 2, reset: false };
    if (fr.length === 1) return { done: false, reset: fr[0] === 10 };
    if (fr.length === 2) {
      if (fr[0] === 10) return { done: false, reset: fr[1] === 10 };
      if (fr[0] + fr[1] === 10) return { done: false, reset: true };
      return { done: true };
    }
    return { done: true };
  }

  // ---------- Turn flow ----------
  function rackPins() { pins = PIN0.map((p, i) => ({ n: i + 1, x: p.x, z: p.z, vx: 0, vz: 0, down: false, tilt: 0, fdx: 0, fdz: 1, gone: false, drop: 0 })); }
  function startTurn() {
    const p = players[cur];
    p.frames[frameIx] = [];
    rackPins();
    startX = p.startX; spin = p.spin;
    phase = 'banner'; phaseT = 0; bannerT = 0; ai = null;
    resetBall();
    Kit.tone(620, { type: 'triangle', dur: 0.12, vol: 0.14, slide: 1.3 });
    Kit.tone(930, { type: 'sine', dur: 0.12, vol: 0.06, at: 0.06 });
  }
  function resetBall() {
    ball = { x: startX, z: -0.4, vx: 0, vz: 0, roll: 0, gutter: 0, gone: false, hitPins: false };
    cam.z = -4.2; cam.x = 0;
  }
  function toPosition() {
    phase = 'position'; phaseT = 0;
    if (!human(cur)) planAI();
  }
  function lockPosition() { phase = 'aim'; phaseT = 0; aimT = 0; players[cur].startX = startX; players[cur].spin = spin; Kit.tone(560, { type: 'triangle', dur: 0.06, vol: 0.12 }); }
  const aimNow = () => sk.aimMax * Math.sin((aimT / sk.aimPeriod) * TAU);
  function lockAim() { aimDeg = aimNow(); phase = 'power'; phaseT = 0; powT = 0; Kit.tone(700, { type: 'triangle', dur: 0.06, vol: 0.12 }); }
  const powNow = () => { const m = (powT / sk.powPeriod) % 1; return m < 0.5 ? m * 2 : 2 - m * 2; };
  function release(pw) {
    power = clamp(pw, 0, 1);
    const v = 6.3 + power * 3.6;
    ball.vz = v * Math.cos(aimDeg * DEG); ball.vx = v * Math.sin(aimDeg * DEG); ball.spin = spin;
    standingAtStart = pins.filter((q) => !q.down && !q.gone).length;
    phase = 'roll'; phaseT = 0; rollT = 0; settleT = 0;
    Kit.noise({ dur: 0.12, vol: 0.2, freq: 400, q: 0.8 });
    Kit.tone(90, { type: 'sine', dur: 0.25, vol: 0.3, slide: 0.8 });
  }

  // ---------- Physics ----------
  function hookAcc(z, s) { return s * 0.2 * clamp((z - 5) / 7, 0, 1); }
  function stepBallOnly(b, dt, bumpers) {
    if (b.gutter) { b.z += b.vz * dt; return; }
    b.vx += hookAcc(b.z, b.spin || 0) * dt;
    b.vz *= 1 - 0.015 * dt;
    b.x += b.vx * dt; b.z += b.vz * dt;
    if (b.z > -0.2 && b.z < HEAD_Z - 0.4) {
      if (bumpers) {
        if (b.x > HALF - BALL_R) { b.x = HALF - BALL_R; b.vx = -Math.abs(b.vx) * 0.55 - 0.02; b.bumped = true; }
        if (b.x < -HALF + BALL_R) { b.x = -HALF + BALL_R; b.vx = Math.abs(b.vx) * 0.55 + 0.02; b.bumped = true; }
      } else if (Math.abs(b.x) > HALF) {
        b.gutter = Math.sign(b.x); b.x = b.gutter * (HALF + GUTTER / 2); b.vx = 0;
      }
    } else if (Math.abs(b.x) > HALF + 0.05 && !b.gutter) {
      b.gutter = Math.sign(b.x); b.x = b.gutter * (HALF + GUTTER / 2); b.vx = 0;
    }
  }
  // Where does a ball end up across the lane at the head pin (no pins)? Used by the TV and the Beginner guide.
  function pathOf(x0, ang, pw, s, out) {
    const v = 6.3 + pw * 3.6;
    const b = { x: x0, z: -0.4, vx: v * Math.sin(ang * DEG), vz: v * Math.cos(ang * DEG), spin: s, gutter: 0 };
    const dt = 1 / 60;
    let lastZ = -1;
    for (let i = 0; i < 600 && b.z < HEAD_Z - 0.15; i++) {
      stepBallOnly(b, dt, sk.bumpers);
      if (out && b.z - lastZ > 0.9) { out.push([b.x, b.z, b.gutter]); lastZ = b.z; }
    }
    return b;
  }
  function stepPhysics(dt) {
    const n = 6, sd = dt / n;
    for (let s = 0; s < n; s++) {
      if (!ball.gone) {
        stepBallOnly(ball, sd, sk.bumpers && !ball.hitPins);
        ball.roll += (ball.vz * sd) / BALL_R;
        if (ball.bumped) { ball.bumped = false; Kit.tone(240, { type: 'triangle', dur: 0.08, vol: 0.15 }); }
        if (ball.z > PIT_Z + 0.4) { ball.gone = true; Kit.noise({ dur: 0.2, vol: 0.12, freq: 300, q: 0.6 }); }
        if (!ball.gutter) for (const p of pins) {
          if (p.gone) continue;
          const dx = p.x - ball.x, dz = p.z - ball.z, d = Math.hypot(dx, dz), rr = BALL_R + PIN_R + (p.down ? 0.05 * p.tilt : 0);
          if (d < rr && d > 1e-6) {
            const nx = dx / d, nz = dz / d;
            const vn = (ball.vx - p.vx) * nx + (ball.vz - p.vz) * nz;
            if (vn > 0) {
              const mb = 7, mp = 1.5, e = 0.75;
              const j = (1 + e) * vn / (1 / mb + 1 / mp);
              ball.vx -= (j / mb) * nx; ball.vz -= (j / mb) * nz;
              p.vx += (j / mp) * nx; p.vz += (j / mp) * nz;
              knock(p, vn);
              ball.hitPins = true;
            }
            const push = rr - d;
            p.x += nx * push; p.z += nz * push;
          }
        }
      }
      // Pins: slide, tip over, knock each other
      for (const p of pins) {
        if (p.gone) continue;
        const sp = Math.hypot(p.vx, p.vz);
        if (sp > 0) {
          const dec = (p.down ? 3.2 : 4.5) * sd;
          const ns = Math.max(0, sp - dec);
          p.vx *= ns / sp; p.vz *= ns / sp;
        }
        p.x += p.vx * sd; p.z += p.vz * sd;
        if (p.down) p.tilt = Math.min(1, p.tilt + sd / 0.32);
        if (p.z > PIT_Z + 0.1) { p.gone = true; p.down = true; }
        if (Math.abs(p.x) > HALF + 0.05) { p.down = true; p.gone = true; }
        if (p.z < HEAD_Z - 1.2) { p.z = HEAD_Z - 1.2; p.vz = Math.abs(p.vz) * 0.3; }
      }
      for (let i = 0; i < pins.length; i++) for (let j = i + 1; j < pins.length; j++) {
        const a = pins[i], b = pins[j];
        if (a.gone || b.gone) continue;
        const ra = PIN_R + (a.down ? 0.06 + 0.07 * a.tilt : 0), rb = PIN_R + (b.down ? 0.06 + 0.07 * b.tilt : 0);
        const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), rr = ra + rb;
        if (d < rr && d > 1e-6) {
          const nx = dx / d, nz = dz / d;
          const vn = (a.vx - b.vx) * nx + (a.vz - b.vz) * nz;
          if (vn > 0) {
            const jj = (1 + 0.62) * vn / 2;
            a.vx -= jj * nx; a.vz -= jj * nz; b.vx += jj * nx; b.vz += jj * nz;
            knock(a, vn * 0.8); knock(b, vn);
          }
          const push = (rr - d) / 2;
          a.x -= nx * push; a.z -= nz * push; b.x += nx * push; b.z += nz * push;
        }
      }
    }
  }
  function knock(p, v) {
    if (v > 0.35 && !p.down) {
      p.down = true;
      const sp = Math.hypot(p.vx, p.vz) || 1;
      p.fdx = p.vx / sp; p.fdz = p.vz / sp;
      lastHits++;
    }
    if (v > 0.3) {
      Kit.noise({ dur: 0.05, vol: clamp(v / 18, 0.04, 0.22), freq: 1800 + Math.random() * 1500, q: 2.5 });
      if (v > 2) Kit.tone(700 + Math.random() * 300, { type: 'triangle', dur: 0.05, vol: 0.06 });
    }
  }

  function finishRoll() {
    const p = players[cur], fr = p.frames[frameIx];
    const standing = pins.filter((q) => !q.down && !q.gone).length;
    const knocked = standingAtStart - standing;
    fr.push(knocked);
    const st = frameState(fr, frameIx);
    const freshRack = standingAtStart === 10;
    let word, color = '#ffffff', big = false;
    if (knocked === 10 && freshRack) { word = 'STRIKE!'; color = '#ffd23f'; big = true; Kit.confetti(120); Kit.shake(10, 0.35); Kit.sfx.win(); }
    else if (standing === 0) { word = 'SPARE!'; color = '#7dffb0'; big = true; Kit.confetti(60); Kit.sfx.chime(); }
    else if (ball.gutter && knocked === 0) { word = 'Gutter ball'; color = '#ffb3c0'; Kit.sfx.nope(); }
    else if (knocked === 0) { word = 'Missed!'; color = '#ffb3c0'; }
    else { word = `${knocked} pin${knocked === 1 ? '' : 's'}`; Kit.tone(660, { type: 'triangle', dur: 0.12, vol: 0.12 }); }
    resultMsg = { text: word, color, t: 0, big };
    phase = 'result'; phaseT = 0;
    phaseNext = st;
  }
  let phaseNext = null;
  function afterResult() {
    const st = phaseNext;
    if (!st.done) {
      if (st.reset) rackPins(); else pins.forEach((q) => { if (q.down) q.gone = true; q.vx = q.vz = 0; });
      resetBall();
      phase = 'position'; phaseT = 0; resultMsg = null;
      if (!human(cur)) planAI();
      return;
    }
    resultMsg = null;
    cur++;
    if (cur >= players.length) { cur = 0; frameIx++; }
    if (frameIx >= 10) { finish(); return; }
    startTurn();
  }
  function finish() {
    state = 'over'; stateT = 0; overBtn = 0;
    const tops = players.map(totalOf), top = Math.max(...tops);
    winners = players.map((p, i) => i).filter((i) => tops[i] === top);
    const humanBest = Math.max(-1, ...players.filter((p) => p.human).map(totalOf));
    Kit.confetti(170); Kit.shake(6, 0.3);
    if (winners.some((i) => players[i].human) || AUTO) Kit.sfx.win(); else Kit.sfx.over();
    if (!AUTO && humanBest > best) {
      best = humanBest; newBest = true;
      Kit.store.set(ID + '.best', best); Kit.record(ID, best);
    }
  }

  // ---------- TV players ----------
  function planAI() {
    const standing = pins.filter((q) => !q.down && !q.gone);
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const s = skill === 0 ? Math.round(g() * 2) : [-2, -1, 1, 2][Math.floor(Math.random() * 4)];
    let target;
    if (standing.length === 10) target = s < 0 ? 0.07 : s > 0 ? -0.07 : (Math.random() < 0.5 ? 0.07 : -0.07);
    else {
      // aim at the front pin of the biggest group, leaning to the group's middle
      const front = standing.reduce((a, b) => (b.z < a.z ? b : a), standing[0]);
      const mid = standing.reduce((t, q) => t + q.x, 0) / Math.max(1, standing.length);
      target = front ? lerp(front.x, mid, 0.4) : 0;
    }
    const x0 = clamp(Math.round((Math.random() - 0.5) * 6) * 0.04, -0.3, 0.3);
    const pw = clamp(0.72 + g() * 0.1, 0.35, 1);
    let bestA = 0, bestErr = 1e9;
    for (let a = -6; a <= 6; a += 0.05) {
      const b = pathOf(x0, a, pw, s);
      const err = b.gutter ? 50 + Math.abs(a) : Math.abs(b.x - target);
      if (err < bestErr) { bestErr = err; bestA = a; }
    }
    const ang = clamp(bestA + g() * sk.aiAng, -sk.aimMax, sk.aimMax);
    ai = { x0, spin: s, ang, pow: clamp(pw + g() * sk.aiPow, 0.05, 1), t: 0 };
  }
  function stepAI(dt) {
    if (!ai) return;
    ai.t += dt;
    if (phase === 'position') {
      if (Math.abs(startX - ai.x0) > 0.001) { startX += clamp(ai.x0 - startX, -dt * 0.6, dt * 0.6); ball.x = startX; }
      else if (spin !== ai.spin && phaseT > 0.5) { spin += Math.sign(ai.spin - spin); phaseT = 0.3; }
      else if (phaseT > 0.9 && spin === ai.spin) lockPosition();
    } else if (phase === 'aim') {
      // stop the arrow when it swings past the chosen line
      if (aimT > 0.5 && Math.abs(aimNow() - ai.ang) < sk.aimMax * 0.05) { lockAim(); aimDeg = ai.ang; }
      else if (aimT > sk.aimPeriod * 3) { lockAim(); aimDeg = ai.ang; }
    } else if (phase === 'power') {
      const m = (powT / sk.powPeriod) % 1;
      if (m < 0.5 && powNow() >= ai.pow) release(ai.pow);
      else if (powT > sk.powPeriod * 3) release(ai.pow);
    }
  }

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
    state = 'play'; stateT = 0;
    newGame();
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
  }
  function toMenu() { state = 'menu'; stateT = 0; menuRow = 0; rackPins(); resetBall(); }

  function playKey(k, rep) {
    if (!human(cur)) return;
    if (phase === 'banner') { if (k === 'ok' && phaseT > 0.35) phaseT = 99; return; }
    if (phase === 'position') {
      if (k === 'left' || k === 'right') {
        const nx = clamp(startX + (k === 'left' ? -0.04 : 0.04), -HALF + BALL_R, HALF - BALL_R);
        if (nx === startX) { if (!rep) Kit.sfx.nope(); return; }
        startX = nx; ball.x = startX; Kit.tone(820, { type: 'triangle', dur: 0.025, vol: 0.05 });
      } else if (k === 'up' || k === 'down') {
        if (rep) return;
        const ns = clamp(spin + (k === 'up' ? 1 : -1), -3, 3);
        if (ns === spin) { Kit.sfx.nope(); return; }
        spin = ns; Kit.sfx.move();
      } else if (k === 'ok' && !rep) lockPosition();
      return;
    }
    if (phase === 'aim' && k === 'ok' && !rep && aimT > 0.15) { lockAim(); return; }
    if (phase === 'power' && k === 'ok' && !rep && powT > 0.1) { release(powNow()); return; }
    if (phase === 'result' && k === 'ok' && !rep && phaseT > 0.6) phaseT = 99;
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
      if (phase === 'position' && human(cur)) {
        // tap left/right thirds to move, middle to go on
        if (e.x < Kit.W * 0.33) playKey('left', false); else if (e.x > Kit.W * 0.67) playKey('right', false); else playKey('ok', false);
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
      if (AUTO && stateT > 1) start();
      // A little demo ball rolls behind the menu now and then
      menuDemoT += dt;
      if (ball && !ball.gone && ball.vz > 0) { stepPhysics(dt); cam.z = lerp(cam.z, clamp(ball.z - 3.5, -4.2, 11.3), Math.min(1, dt * 3)); }
      else if (menuDemoT > 3.5) {
        menuDemoT = 0; rackPins(); ball = { x: 0.05, z: -0.4, vx: 0.01, vz: 8, spin: -1, roll: 0, gutter: 0, gone: false }; cam.z = -4.2;
      }
      if (ball && ball.gone) { stepPhysics(dt); }
      return;
    }
    if (state === 'over') {
      if (stateT > 1 && Math.random() < dt * 0.6) Kit.confetti(30);
      if (AUTO && stateT > 3) start();
      return;
    }
    phaseT += dt; bannerT += dt;
    if (resultMsg) resultMsg.t += dt;
    pins.forEach((q) => { q.drop = Math.min(1, q.drop + dt * 3); });
    if (!human(cur)) stepAI(dt);
    if (phase === 'banner') { if (phaseT > (human(cur) ? 1.8 : 1.2)) toPosition(); }
    else if (phase === 'aim') aimT += dt;
    else if (phase === 'power') powT += dt;
    else if (phase === 'roll') {
      rollT += dt;
      stepPhysics(dt);
      const target = clamp(ball.z - 3.6, -4.2, 11.3);
      cam.z = lerp(cam.z, ball.gone ? 11.3 : target, Math.min(1, dt * 4));
      cam.x = lerp(cam.x, ball.gone ? 0 : ball.x * 0.4, Math.min(1, dt * 2));
      const calm = pins.every((q) => q.gone || (Math.hypot(q.vx, q.vz) < 0.05 && (!q.down || q.tilt >= 1)));
      if (ball.gone || ball.z > PIT_Z) settleT += dt;
      if ((settleT > 0.9 && calm) || settleT > 3.5 || rollT > 9) finishRoll();
    } else if (phase === 'result') {
      stepPhysics(dt);
      if (phaseT > (resultMsg && resultMsg.big ? 2.2 : 1.6)) afterResult();
    }
    if (phase !== 'roll' && phase !== 'result') { cam.z = lerp(cam.z, -4.2, Math.min(1, dt * 3)); cam.x = lerp(cam.x, 0, Math.min(1, dt * 3)); }
  }

  // ---------- Layout and baked pictures ----------
  let L = { u: 60, top: 200, f: 1500, cx: 960, hy: 300 };
  const backdrop = document.createElement('canvas');
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function scoreH() {
    const n = Math.max(1, state === 'menu' ? 2 : players.length);
    return L.u * (0.55 + n * (n > 2 ? 0.95 : 1.15)) + L.u * 0.3;
  }
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 32, H / 18);
    L.u = u; L.cx = W / 2;
    sprites.clear();
    relayoutLane();
    bakeBackdrop();
  }
  function relayoutLane() {
    const W = Kit.W, H = Kit.H, u = L.u;
    L.top = state === 'play' || state === 'over' ? scoreH() : 0;
    L.hy = L.top + (H - L.top) * 0.1;
    L.f = ((H - L.hy) * 3.05) / CAM_H;
    // keep the lane from getting wider than the screen
    L.f = Math.min(L.f, (W * 0.62 * 3.05) / (2 * HALF));
  }
  Kit.onResize(layout);
  function proj(x, y, z) {
    const d = z - cam.z;
    if (d < 0.08) return null;
    const s = L.f / d;
    return { x: L.cx + (x - cam.x) * s, y: L.hy + (CAM_H - y) * s, s };
  }

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
  function bakeBackdrop() {
    const W = Kit.W, H = Kit.H;
    if (!W || !H) return;
    const d = DPR();
    backdrop.width = Math.ceil(W * d); backdrop.height = Math.ceil(H * d);
    const c = backdrop.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0c0620'); g.addColorStop(0.45, '#22104a'); g.addColorStop(1, '#0a0418');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Ceiling light strips converging to the far wall
    for (let i = -6; i <= 6; i++) {
      const x0 = W / 2 + i * W * 0.16, x1 = W / 2 + i * W * 0.03;
      const lg = c.createLinearGradient(0, 0, 0, H * 0.4);
      lg.addColorStop(0, 'rgba(160,120,255,0.18)'); lg.addColorStop(1, 'rgba(160,120,255,0)');
      c.strokeStyle = lg; c.lineWidth = 6; c.beginPath(); c.moveTo(x0, 0); c.lineTo(x1, H * 0.4); c.stroke();
    }
    // Neon glow blobs
    [['#ff3fa4', 0.18, 0.3], ['#3fd0ff', 0.82, 0.28], ['#b65cff', 0.5, 0.22]].forEach(([col, x, y]) => {
      const rg = c.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * 0.3);
      rg.addColorStop(0, rgba(col, 0.25)); rg.addColorStop(1, rgba(col, 0));
      c.fillStyle = rg; c.fillRect(0, 0, W, H);
    });
  }
  // The pin: white, waisted, two red neck stripes; drawn once per size.
  const PIN_H = 0.38;
  const pinSprite = (h) => sprite('pin', h * 0.42, h, (c, w) => {
    const cx = w / 2;
    const shape = () => {
      c.beginPath();
      c.moveTo(cx - w * 0.16, h);
      c.bezierCurveTo(cx - w * 0.5, h * 0.72, cx - w * 0.5, h * 0.5, cx - w * 0.14, h * 0.32);
      c.bezierCurveTo(cx - w * 0.08, h * 0.24, cx - w * 0.22, h * 0.1, cx - w * 0.17, h * 0.06);
      c.bezierCurveTo(cx - w * 0.12, -h * 0.01, cx + w * 0.12, -h * 0.01, cx + w * 0.17, h * 0.06);
      c.bezierCurveTo(cx + w * 0.22, h * 0.1, cx + w * 0.08, h * 0.24, cx + w * 0.14, h * 0.32);
      c.bezierCurveTo(cx + w * 0.5, h * 0.5, cx + w * 0.5, h * 0.72, cx + w * 0.16, h);
      c.closePath();
    };
    shape();
    const g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, '#b8b4c8'); g.addColorStop(0.35, '#ffffff'); g.addColorStop(0.7, '#eeeaf6'); g.addColorStop(1, '#8e89a6');
    c.fillStyle = g; c.fill();
    c.save(); shape(); c.clip();
    c.fillStyle = '#e8213a'; c.fillRect(0, h * 0.2, w, h * 0.04); c.fillRect(0, h * 0.27, w, h * 0.04);
    c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(cx - w * 0.12, h * 0.55, w * 0.06, h * 0.14, 0, 0, TAU); c.fill();
    c.restore();
    shape(); c.lineWidth = Math.max(1, w * 0.03); c.strokeStyle = 'rgba(60,50,90,0.6)'; c.stroke();
  });
  const ballSprite = (col, s) => sprite('ball' + col, s, s, (c) => {
    const r = s / 2;
    const g = c.createRadialGradient(r * 0.65, r * 0.55, r * 0.05, r, r, r);
    g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.4, col); g.addColorStop(1, shade(col, -0.65));
    c.fillStyle = g; c.beginPath(); c.arc(r, r, r * 0.98, 0, TAU); c.fill();
    // marbled swirl
    c.save(); c.beginPath(); c.arc(r, r, r * 0.98, 0, TAU); c.clip();
    c.strokeStyle = rgba('#ffffff', 0.18); c.lineWidth = r * 0.12;
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(r * (0.6 + i * 0.3), r * (1.3 - i * 0.2), r * (0.5 + i * 0.2), -1 + i, 1.2 + i); c.stroke(); }
    c.restore();
    c.fillStyle = 'rgba(255,255,255,0.75)'; c.beginPath(); c.ellipse(r * 0.62, r * 0.5, r * 0.25, r * 0.15, -0.6, 0, TAU); c.fill();
  });

  // ---------- Drawing helpers ----------
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
    c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(16,6,40,0.92)'; c.strokeText(s, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(s, x, y);
  }
  function panel(c, x, y, w, h, r, border, top, bottom) {
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = 20; c.shadowOffsetY = 8;
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.restore();
    roundRect(c, x, y, w, h, r);
    c.lineWidth = Math.max(2, L.u * 0.05); c.strokeStyle = border; c.stroke();
  }
  function quad(c, x0, x1, z0, z1, y, fill) {
    const zn = Math.max(z0, cam.z + 0.25);
    if (zn >= z1) return;
    const a = proj(x0, y, zn), b = proj(x1, y, zn), cc = proj(x1, y, z1), d = proj(x0, y, z1);
    if (!a || !d) return;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(cc.x, cc.y); c.lineTo(d.x, d.y); c.closePath();
    c.fillStyle = typeof fill === 'function' ? fill(a, d) : fill; c.fill();
  }
  function line3(c, x0, z0, x1, z1, y, col, w) {
    const zn0 = Math.max(z0, cam.z + 0.25), zn1 = Math.max(z1, cam.z + 0.25);
    if (zn0 >= zn1 && z0 !== z1) return;
    const a = proj(x0, y, zn0), b = proj(x1, y, zn1);
    if (!a || !b) return;
    c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
  }

  // ---------- The lane ----------
  function drawLane(c, t) {
    const W = Kit.W, H = Kit.H;
    c.save();
    c.beginPath(); c.rect(0, L.top, W, H - L.top); c.clip();
    c.drawImage(backdrop, 0, 0, W, H);
    const zFar = PIT_Z + 0.9;
    // Floor everywhere (dark carpet), then lanes
    quad(c, -12, 12, -6, zFar, 0, '#1a0c33');
    for (let k = -3; k <= 3; k++) {
      const ox = k * LANE_GAP, main = k === 0;
      // gutters
      quad(c, ox - HALF - GUTTER, ox - HALF, -1, PIT_Z, -0.02, main ? '#2b2f45' : '#20182f');
      quad(c, ox + HALF, ox + HALF + GUTTER, -1, PIT_Z, -0.02, main ? '#2b2f45' : '#20182f');
      // capping / dividers
      quad(c, ox + HALF + GUTTER, ox + LANE_GAP - HALF - GUTTER, -1, PIT_Z + 0.3, 0.02, main || k === -1 ? '#3b2a6b' : '#2c1f52');
      // lane bed
      quad(c, ox - HALF, ox + HALF, -0.05, PIT_Z, 0, (a, d) => {
        const g = c.createLinearGradient(0, a.y, 0, d.y);
        if (main) { g.addColorStop(0, '#f2c58a'); g.addColorStop(0.6, '#d9a066'); g.addColorStop(1, '#b97d45'); }
        else { g.addColorStop(0, '#5e4252'); g.addColorStop(1, '#3a2638'); }
        return g;
      });
      // approach
      quad(c, ox - HALF - GUTTER, ox + HALF + GUTTER, -6, -0.05, 0, main ? '#e8c9a0' : '#4a3646');
      // pit
      quad(c, ox - HALF - GUTTER, ox + HALF + GUTTER, PIT_Z, zFar, -0.05, '#07040f');
    }
    // Main lane details: boards, dots, arrows, foul line, oily shine
    c.lineCap = 'butt';
    for (let i = -19; i <= 19; i += 2) line3(c, i * 0.0266, -0.05, i * 0.0266, PIT_Z, 0, 'rgba(120,70,30,0.18)', 1);
    line3(c, -HALF, 0, HALF, 0, 0, '#c4102d', Math.max(2, L.f * 0.018 / Math.max(0.3, 0 - cam.z)));
    [-15, -10, -5, 0, 5, 10, 15].forEach((b, i) => {
      const x = b * 0.0266, z = 4.6 + Math.abs(b) * 0.04;
      const p = proj(x, 0, z), q = proj(x - 0.025, 0, z - 0.25), r = proj(x + 0.025, 0, z - 0.25);
      if (p && q && r) { c.fillStyle = '#7a2a1c'; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.lineTo(r.x, r.y); c.closePath(); c.fill(); }
      const dp = proj(x, 0, 2.1);
      if (dp) { c.fillStyle = '#7a2a1c'; c.beginPath(); c.ellipse(dp.x, dp.y, 0.012 * dp.s, 0.006 * dp.s, 0, 0, TAU); c.fill(); }
    });
    // light reflection down the lane
    const pr = proj(0, 0, HEAD_Z);
    if (pr) {
      const rg = c.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, Math.max(40, pr.s * 3));
      rg.addColorStop(0, 'rgba(255,255,255,0.35)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      quad(c, -HALF, HALF, -0.05, PIT_Z, 0.001, rg);
    }
    // Beginner bumpers: padded rails over the gutters
    if (sk.bumpers && (state !== 'menu')) {
      [-1, 1].forEach((s) => {
        quad(c, s > 0 ? HALF : -HALF - 0.08, s > 0 ? HALF + 0.08 : -HALF, 0, HEAD_Z - 0.4, 0.07, s > 0 ? '#3fd0ff' : '#ff3fa4');
        line3(c, s * (HALF + 0.005), 0, s * (HALF + 0.005), HEAD_Z - 0.4, 0.075, 'rgba(255,255,255,0.7)', 2);
      });
    }
    // Masking unit above the pins
    const m0 = proj(-7, 1.35, PIT_Z + 0.9), m1 = proj(7, 0.45, PIT_Z + 0.9);
    if (m0 && m1) {
      const g = c.createLinearGradient(0, m0.y, 0, m1.y);
      g.addColorStop(0, '#2a0f5c'); g.addColorStop(1, '#4a1d8a');
      c.fillStyle = g; c.fillRect(m0.x, m0.y, m1.x - m0.x, m1.y - m0.y);
      for (let k = -3; k <= 3; k++) {
        const a = proj(k * LANE_GAP - 0.7, 1.15, PIT_Z + 0.9), b = proj(k * LANE_GAP + 0.7, 0.62, PIT_Z + 0.9);
        if (!a || !b) continue;
        const ww = b.x - a.x, hh = b.y - a.y;
        c.save();
        c.shadowColor = k === 0 ? '#ff3fa4' : '#3fd0ff'; c.shadowBlur = k === 0 ? 24 : 10;
        roundRect(c, a.x, a.y, ww, hh, hh * 0.3);
        c.strokeStyle = k === 0 ? '#ff7ac8' : 'rgba(63,208,255,0.6)'; c.lineWidth = Math.max(2, hh * 0.06); c.stroke();
        c.restore();
        if (k === 0) {
          c.save(); c.beginPath(); c.rect(a.x, a.y, ww, hh); c.clip();
          c.font = `700 ${Math.round(hh)}px ${Kit.FONT}`;
          const sz = Math.min(hh * 0.42, hh * ww * 0.85 / Math.max(1, c.measureText('★ STRIKE LANES ★').width));
          c.font = `700 ${Math.round(sz)}px ${Kit.FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillStyle = '#ffe36b'; c.shadowColor = '#ffb703'; c.shadowBlur = sz * 0.5;
          c.fillText('★ STRIKE LANES ★', a.x + ww / 2, a.y + hh / 2);
          c.restore();
        } else {
          c.fillStyle = 'rgba(63,208,255,0.25)'; c.font = `700 ${Math.round(hh * 0.4)}px ${Kit.FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
          c.fillText(String(5 + k), a.x + ww / 2, a.y + hh / 2);
        }
      }
    }
    // Aim guide
    if (state === 'play' && (phase === 'position' || phase === 'aim' || phase === 'power')) drawGuide(c, t);
    // Pins and ball, far to near
    const things = pins.filter((q) => !q.gone || q.tilt < 1.5).map((q) => ({ z: q.z, q }));
    if (ball && !ball.gone) things.push({ z: ball.z, b: true });
    things.sort((a, b) => b.z - a.z);
    things.forEach((o) => (o.b ? drawBall(c, t) : drawPin(c, o.q)));
    c.restore();
  }

  function drawPin(c, q) {
    if (q.gone && q.z > PIT_Z + 0.3) return;
    const p = proj(q.x, 0, q.z);
    if (!p) return;
    const h = PIN_H * p.s * (0.35 + 0.65 * ease.out(q.drop));
    const w = h * 0.42;
    c.globalAlpha = q.gone ? 0.6 : 1;
    c.fillStyle = 'rgba(20,5,30,0.35)'; c.beginPath(); c.ellipse(p.x, p.y, w * 0.45, w * 0.14, 0, 0, TAU); c.fill();
    c.save(); c.translate(p.x, p.y);
    const tl = q.down ? ease.inOut(Math.min(1, q.tilt)) : 0;
    if (tl > 0) {
      c.rotate(tl * 1.45 * (q.fdx >= 0 ? 1 : -1) * clamp(Math.abs(q.fdx) + 0.35, 0, 1));
      c.scale(1, 1 - tl * 0.55 * Math.abs(q.fdz));
    }
    c.drawImage(pinSprite(Math.max(8, Math.round(PIN_H * L.f / 7))), -w / 2, -h, w, h);
    c.restore();
    c.globalAlpha = 1;
  }
  function drawBall(c, t) {
    const p = proj(ball.x, BALL_R, ball.z);
    if (!p) return;
    const r = BALL_R * p.s, pl = players[cur];
    const col = state === 'play' && pl ? pl.c : '#b65cff';
    const fl = proj(ball.x, 0, ball.z);
    c.fillStyle = 'rgba(20,5,30,0.4)'; c.beginPath(); c.ellipse(fl.x, fl.y, r * 0.95, r * 0.28, 0, 0, TAU); c.fill();
    c.drawImage(ballSprite(col, Math.max(8, Math.round(BALL_R * L.f / 2.4))), p.x - r, p.y - r, r * 2, r * 2);
    // finger holes rolling over the top
    const a = ball.roll;
    const cy = Math.cos(a);
    if (cy > 0.1) {
      c.fillStyle = 'rgba(10,0,20,0.75)';
      [[-0.22, 0], [0.22, 0], [0, 0.32]].forEach(([hx, hz]) => {
        const yy = -Math.sin(a) * r * 0.45 + hz * r * cy * 0.5 - r * 0.15;
        c.beginPath(); c.ellipse(p.x + hx * r, p.y + yy, r * 0.09, r * 0.09 * cy, 0, 0, TAU); c.fill();
      });
    }
  }
  function drawGuide(c, t) {
    const p = players[cur];
    const ang = phase === 'aim' ? aimNow() : phase === 'power' ? aimDeg : 0;
    if (phase === 'position') {
      // start spot marker and spin arrow
      const a = proj(startX, 0.002, -0.4);
      if (a) { c.strokeStyle = rgba(p.c, 0.9); c.lineWidth = 4; c.beginPath(); c.ellipse(a.x, a.y, BALL_R * a.s * 1.6, BALL_R * a.s * 0.5, 0, 0, TAU); c.stroke(); }
    }
    if (sk.guide === 'path' && human(cur)) {
      const pts = [];
      pathOf(startX, ang, phase === 'power' ? powNow() : 0.6, spin, pts);
      pts.forEach(([x, z, g], i) => {
        const q = proj(x, 0.004, z);
        if (!q) return;
        c.globalAlpha = 0.85 - i / pts.length * 0.4;
        c.fillStyle = g ? '#ff7a8a' : '#ffffff';
        c.beginPath(); c.ellipse(q.x, q.y, Math.max(2.5, 0.03 * q.s), Math.max(1.5, 0.012 * q.s), 0, 0, TAU); c.fill();
      });
      c.globalAlpha = 1;
    }
    if (phase === 'position') return;
    // The swinging arrow on the lane
    const len = sk.guide === 'path' ? 4 : sk.guide;
    const dx = Math.sin(ang * DEG), dz = Math.cos(ang * DEG);
    const x0 = startX, z0 = 0.3;
    const a = proj(x0 - dz * 0.05, 0.003, z0), b = proj(x0 + dx * len - dz * 0.02, 0.003, z0 + dz * len);
    const a2 = proj(x0 + dz * 0.05, 0.003, z0), b2 = proj(x0 + dx * len + dz * 0.02, 0.003, z0 + dz * len);
    const tip = proj(x0 + dx * (len + 0.9), 0.003, z0 + dz * (len + 0.9));
    const h1 = proj(x0 + dx * len - dz * 0.14, 0.003, z0 + dz * len), h2 = proj(x0 + dx * len + dz * 0.14, 0.003, z0 + dz * len);
    if (a && b && a2 && b2 && tip && h1 && h2) {
      c.save();
      c.shadowColor = p.c; c.shadowBlur = 18;
      c.fillStyle = phase === 'power' ? '#ffffff' : rgba(p.c, 0.95);
      c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(h1.x, h1.y); c.lineTo(tip.x, tip.y); c.lineTo(h2.x, h2.y); c.lineTo(b2.x, b2.y); c.lineTo(a2.x, a2.y); c.closePath(); c.fill();
      c.lineWidth = 2; c.strokeStyle = '#ffffff'; c.stroke();
      c.restore();
    }
  }

  // ---------- HUD ----------
  function drawScores(c, t) {
    const W = Kit.W, u = L.u, n = players.length, rowH = u * (n > 2 ? 0.95 : 1.15);
    const top = u * 0.2, h = L.top - u * 0.15;
    c.fillStyle = 'rgba(8,3,22,0.9)'; c.fillRect(0, 0, W, h + u * 0.1);
    c.fillStyle = 'rgba(182,92,255,0.5)'; c.fillRect(0, h + u * 0.1 - 2, W, 2);
    const x0 = u * 0.4, nameW = u * 4.6, totW = u * 2.4, fw = (W - x0 * 2 - nameW - totW) / 10;
    // header
    for (let f = 0; f < 10; f++) text(c, String(f + 1), x0 + nameW + fw * (f + 0.5), top + u * 0.2, u * 0.34, f === frameIx && state === 'play' ? '#ffe36b' : 'rgba(255,255,255,0.6)', 800);
    text(c, 'Total', x0 + nameW + fw * 10 + totW / 2, top + u * 0.2, u * 0.34, 'rgba(255,255,255,0.6)', 800);
    players.forEach((p, i) => {
      const y = top + u * 0.45 + i * rowH, on = i === cur && state === 'play';
      const rh = rowH - u * 0.1;
      roundRect(c, x0, y, W - x0 * 2, rh, rh * 0.25);
      c.fillStyle = on ? rgba(p.c, 0.28) : 'rgba(255,255,255,0.05)'; c.fill();
      if (on) { c.lineWidth = 3; c.strokeStyle = p.c; c.stroke(); }
      const bs = rh * 0.62;
      c.drawImage(ballSprite(p.c, Math.round(bs)), x0 + u * 0.2, y + rh / 2 - bs / 2, bs, bs);
      const nm = p.name + (p.human ? '' : ' 📺');
      text(c, nm, x0 + u * 0.35 + bs, y + rh / 2, fitSize(c, nm, rh * 0.42, nameW - bs - u * 0.5, 800), '#ffffff', 800, 'left');
      const cum = cumScores(p.frames);
      for (let f = 0; f < 10; f++) {
        const fx = x0 + nameW + fw * f;
        roundRect(c, fx + 2, y + 3, fw - 4, rh - 6, 6);
        c.fillStyle = on && f === frameIx ? 'rgba(255,227,107,0.18)' : 'rgba(255,255,255,0.07)'; c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = 1; c.stroke();
        const mk = marks(p.frames[f], f), boxes = f === 9 ? 3 : 2, bw = Math.min(fw * 0.26, rh * 0.42);
        for (let k = 0; k < boxes; k++) {
          const bx = fx + fw - 4 - (boxes - k) * bw, m = f < 9 ? mk[k] : mk[k];
          c.strokeStyle = 'rgba(255,255,255,0.2)'; c.strokeRect(bx, y + 3, bw, rh * 0.45);
          if (m) text(c, m, bx + bw / 2, y + 3 + rh * 0.23, rh * 0.32, m === 'X' ? '#ffd23f' : m === '/' ? '#7dffb0' : '#ffffff', 800, 'center', Kit.FONT);
        }
        if (cum[f] != null) text(c, String(cum[f]), fx + fw * 0.4, y + rh * 0.68, rh * 0.38, '#ffffff', 800, 'center', Kit.FONT);
      }
      text(c, String(totalOf(p)), x0 + nameW + fw * 10 + totW / 2, y + rh / 2, rh * 0.55, on ? '#ffffff' : 'rgba(255,255,255,0.85)', 800, 'center', Kit.FONT);
    });
  }
  function drawPinMap(c, t) {
    const u = L.u, W = Kit.W;
    const s = u * 0.42, cx = W - u * 2.2, cy = L.top + u * 1.9;
    roundRect(c, cx - u * 1.7, cy - u * 1.45, u * 3.4, u * 2.6, u * 0.35);
    c.fillStyle = 'rgba(10,4,26,0.7)'; c.fill(); c.strokeStyle = 'rgba(182,92,255,0.5)'; c.lineWidth = 2; c.stroke();
    PIN0.forEach((p0, i) => {
      const q = pins[i];
      const row = Math.round((p0.z - HEAD_Z) / 0.2635);
      const x = cx + (p0.x / 0.1524) * s * 0.75, y = cy + u * 0.75 - row * s * 1.25;
      const up = q && !q.down && !q.gone;
      c.beginPath(); c.arc(x, y, s * 0.42, 0, TAU);
      c.fillStyle = up ? '#ffffff' : 'rgba(255,255,255,0.12)'; c.fill();
      if (up) { c.strokeStyle = '#e8213a'; c.lineWidth = 2; c.stroke(); }
    });
    const fr = players[cur] && players[cur].frames[frameIx];
    text(c, `Frame ${frameIx + 1} · Ball ${clamp((fr ? fr.length : 0) + (phase === 'result' ? 0 : 1), 1, 3)}`, cx, cy - u * 1.1, u * 0.32, 'rgba(255,255,255,0.8)', 800);
  }
  function drawControls(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u, p = players[cur];
    // Spin dial (left) and power meter (right)
    const sx = u * 2.4, sy = H - u * 2.2;
    roundRect(c, sx - u * 1.9, sy - u * 1.35, u * 3.8, u * 2.3, u * 0.4);
    c.fillStyle = 'rgba(10,4,26,0.75)'; c.fill(); c.strokeStyle = phase === 'position' && human(cur) ? '#ffe36b' : 'rgba(182,92,255,0.5)'; c.lineWidth = 2; c.stroke();
    text(c, 'SPIN', sx, sy - u * 0.95, u * 0.32, 'rgba(255,255,255,0.75)', 800);
    for (let s = -3; s <= 3; s++) {
      const x = sx + s * u * 0.48, on = s === spin;
      c.beginPath(); c.arc(x, sy - u * 0.25, on ? u * 0.2 : u * 0.11, 0, TAU);
      c.fillStyle = on ? p.c : 'rgba(255,255,255,0.25)'; c.fill();
      if (on) { c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke(); }
    }
    text(c, spin === 0 ? 'Straight' : `${spin < 0 ? '◀ Hook left' : 'Hook right ▶'} ${Math.abs(spin)}`, sx, sy + u * 0.35, u * 0.36, '#ffffff', 800);
    // Power
    const mx = W - u * 1.6, mh = u * 5, mw = u * 0.8, my = H - u * 0.9 - mh;
    const v = phase === 'power' ? powNow() : phase === 'roll' || phase === 'result' ? power : 0;
    roundRect(c, mx - mw / 2 - 5, my - 5, mw + 10, mh + 10, mw / 2 + 5); c.fillStyle = 'rgba(10,4,26,0.8)'; c.fill();
    roundRect(c, mx - mw / 2, my, mw, mh, mw / 2); c.save(); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(mx - mw / 2, my, mw, mh);
    const g = c.createLinearGradient(0, my + mh, 0, my);
    g.addColorStop(0, '#2ed573'); g.addColorStop(0.55, '#ffd23f'); g.addColorStop(1, '#ff3b5c');
    c.fillStyle = g; c.fillRect(mx - mw / 2, my + mh * (1 - v), mw, mh * v);
    c.restore();
    c.strokeStyle = phase === 'power' ? '#ffffff' : 'rgba(255,255,255,0.4)'; c.lineWidth = 3; roundRect(c, mx - mw / 2, my, mw, mh, mw / 2); c.stroke();
    text(c, 'POWER', mx, my - u * 0.35, u * 0.3, 'rgba(255,255,255,0.75)', 800);
    text(c, `${Math.round(v * 100)}%`, mx, my + mh + u * 0.4, u * 0.38, '#ffffff', 800, 'center', Kit.FONT);
    // Hint pill
    let msg = '';
    if (human(cur)) {
      if (phase === 'position') msg = Kit.touchFirst() ? 'Tap left/right to move · tap middle to aim' : '◀ ▶ move  ·  ▲ ▼ spin  ·  OK aim';
      else if (phase === 'aim') msg = Kit.touchFirst() ? 'Tap to lock the aim' : 'OK  lock the swinging arrow';
      else if (phase === 'power') msg = Kit.touchFirst() ? 'Tap to bowl!' : 'OK  set the power and bowl!';
    } else if (phase === 'position' || phase === 'aim' || phase === 'power') msg = `${p.name} is getting ready…`;
    if (msg) {
      c.font = `800 ${Math.round(u * 0.48)}px ${Kit.UI}`;
      const w = c.measureText(msg).width + u * 1.2, hh = u * 0.9, x = W / 2 - w / 2, y = L.top + u * 0.3;
      c.globalAlpha = phase === 'power' ? 0.85 + Math.sin(t * 8) * 0.15 : 0.95;
      roundRect(c, x, y, w, hh, hh / 2); c.fillStyle = 'rgba(10,4,26,0.85)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 2; c.stroke();
      text(c, msg, W / 2, y + hh / 2, u * 0.48, phase === 'power' ? '#ffe36b' : '#ffffff', 800);
      c.globalAlpha = 1;
    }
  }
  function drawBanner(c, t) {
    const W = Kit.W, u = L.u;
    if (phase === 'banner' || bannerT < 1.4) {
      const p = players[cur], k = bannerT;
      const inK = ease.back(clamp(k / 0.3, 0, 1)), outK = phase === 'banner' ? 0 : clamp((k - 1.1) / 0.3, 0, 1);
      const w = Math.min(W * 0.7, u * 15), hh = u * 2.1;
      c.save();
      c.globalAlpha = 1 - outK;
      c.translate(W / 2 + (1 - inK) * -W * 0.6, L.top + (Kit.H - L.top) * 0.42);
      roundRect(c, -w / 2, -hh / 2, w, hh, hh * 0.35);
      const g = c.createLinearGradient(0, -hh / 2, 0, hh / 2);
      g.addColorStop(0, shade(p.c, 0.25)); g.addColorStop(1, shade(p.c, -0.35));
      c.fillStyle = g; c.fill(); c.lineWidth = u * 0.08; c.strokeStyle = '#ffffff'; c.stroke();
      const bs = hh * 0.62;
      c.drawImage(ballSprite(p.c, Math.round(bs)), -w / 2 + hh * 0.3, -bs / 2, bs, bs);
      const label = p.human ? (p.name === 'You' ? 'Your turn!' : `${p.name}'s turn!`) : `${p.name} is bowling`;
      outlined(c, label, hh * 0.3, -hh * 0.12, fitSize(c, label, hh * 0.46, w - hh * 1.6, 700, Kit.FONT), '#ffffff', '#fff1b8');
      text(c, `Frame ${frameIx + 1} of 10${p.human && phase === 'banner' ? '  ·  press OK' : ''}`, hh * 0.3, hh * 0.3, hh * 0.2, 'rgba(255,255,255,0.9)', 800);
      c.restore();
    }
    if (resultMsg) {
      const k = resultMsg.t, s = resultMsg.big ? ease.elastic(clamp(k / 0.7, 0, 1)) : ease.back(clamp(k / 0.3, 0, 1));
      c.save(); c.translate(W / 2, L.top + (Kit.H - L.top) * 0.36); c.scale(s, s);
      const size = resultMsg.big ? u * 2.2 : u * 1.2;
      if (resultMsg.big) { c.shadowColor = resultMsg.color; c.shadowBlur = u; }
      outlined(c, resultMsg.text, 0, 0, size, '#ffffff', resultMsg.color);
      c.restore();
    }
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(6,2,18,0.6)'; c.fillRect(0, 0, W, H);
    const n = players.length, rowH = u * 1.1;
    const pw = Math.min(W * 0.8, u * 16), ph = u * 6.4 + n * rowH;
    const px = (W - pw) / 2, py = Math.max(L.top * 0.3, (H - ph) / 2);
    const k = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(W / 2, py + ph / 2); c.scale(k, k); c.translate(-W / 2, -(py + ph / 2));
    panel(c, px, py, pw, ph, u * 0.6, '#ffd23f', '#3a1b7a', '#120632');
    const wn = winners.map((i) => players[i]);
    const title = n === 1 ? `You scored ${totalOf(players[0])}!` : wn.length > 1 ? 'It\'s a tie!' : wn[0].human ? (wn[0].name === 'You' ? 'You win!' : `${wn[0].name} wins!`) : `${wn[0].name} wins`;
    outlined(c, n === 1 && !players[0].human ? `${players[0].name} scored ${totalOf(players[0])}` : title, W / 2, py + u * 1.2, u * 1.25, '#ffffff', '#ffd6f0');
    let y = py + u * 2.3;
    const order = players.map((p, i) => i).sort((a, b) => totalOf(players[b]) - totalOf(players[a]));
    order.forEach((i, r) => {
      const p = players[i];
      roundRect(c, px + u * 0.8, y, pw - u * 1.6, rowH - u * 0.15, u * 0.3);
      c.fillStyle = winners.includes(i) ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.07)'; c.fill();
      const bs = rowH * 0.6;
      text(c, ['🥇', '🥈', '🥉', '4th'][r], px + u * 1.5, y + rowH * 0.43, u * 0.55, '#ffffff', 800);
      c.drawImage(ballSprite(p.c, Math.round(bs)), px + u * 2.3, y + rowH * 0.43 - bs / 2, bs, bs);
      text(c, p.name, px + u * 2.5 + bs, y + rowH * 0.43, u * 0.55, '#ffffff', 800, 'left');
      text(c, String(totalOf(p)), px + pw - u * 1.4, y + rowH * 0.43, u * 0.7, '#ffffff', 800, 'right', Kit.FONT);
      y += rowH;
    });
    y += u * 0.5;
    text(c, newBest ? `🎳 New best score: ${best}!` : `🎳 Best: ${best}`, W / 2, y, u * 0.55, '#ffd23f', 800);
    y += u * 1.0;
    const bw = u * 5, bh = u * 1.05, gap = u * 0.6;
    hits = [];
    [['▶  Play again', 'again'], ['Menu', 'menu']].forEach(([lab, act], i) => {
      const bx = W / 2 + (i === 0 ? -bw - gap / 2 : gap / 2), on = overBtn === i;
      const s = on ? 1.06 + Math.sin(t * 6) * 0.02 : 1;
      c.save(); c.translate(bx + bw / 2, y + bh / 2); c.scale(s, s);
      c.globalAlpha = stateT > 1.2 ? 1 : 0.5;
      roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
      const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
      if (on) { g.addColorStop(0, '#ff9ad5'); g.addColorStop(1, '#c2187a'); } else { g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0.08)'); }
      c.fillStyle = g; c.fill(); c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.4)'; c.stroke();
      text(c, lab, 0, 0, bh * 0.45, '#ffffff', 800);
      c.restore();
      hits.push({ x: bx, y, w: bw, h: bh, act });
    });
    text(c, '◀ ▶ choose · OK', W / 2, y + bh + u * 0.55, u * 0.38, 'rgba(255,255,255,0.6)', 700);
    c.restore();
  }

  function pill(c, x, y, w, h, label, on, focus, dim, t) {
    const k = on && focus ? 1.07 + Math.sin(t * 6) * 0.02 : on ? 1.03 : 1;
    c.save();
    c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    c.globalAlpha = dim ? 0.3 : 1;
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.4);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    if (on) { g.addColorStop(0, '#ff9ad5'); g.addColorStop(1, '#c2187a'); } else { g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0.06)'); }
    c.fillStyle = g; c.fill();
    c.lineWidth = focus && on ? 4 : 2; c.strokeStyle = focus && on ? '#ffffff' : 'rgba(255,255,255,0.3)'; c.stroke();
    if (focus && on) { c.shadowColor = '#ffffff'; c.shadowBlur = 16; c.stroke(); c.shadowBlur = 0; }
    text(c, label, 0, h * 0.03, fitSize(c, label, h * 0.48, w * 0.86, 800), '#ffffff', 800);
    c.restore();
  }
  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(8,3,22,0.5)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.94, u * 21), ph = Math.min(H * 0.96, u * 13);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    panel(c, px, py, pw, ph, u * 0.7, '#ff7ac8', 'rgba(58,27,122,0.95)', 'rgba(18,6,50,0.97)');
    hits = [];
    const cx = W / 2;
    c.save(); c.shadowColor = '#ff3fa4'; c.shadowBlur = u * 0.6;
    outlined(c, 'STRIKE LANES', cx, py + u * 1.35, u * 1.5, '#ffffff', '#ffb3e0');
    c.restore();
    const ps = u * 1.1;
    for (let i = 0; i < 3; i++) c.drawImage(pinSprite(Math.round(ps)), cx + u * 6.3 + i * u * 0.45 - ps * 0.21, py + u * 0.85 + (i === 1 ? -u * 0.15 : 0), ps * 0.42, ps);
    c.drawImage(ballSprite('#3fd0ff', Math.round(u * 0.9)), cx - u * 7.4, py + u * 0.95 + Math.abs(Math.sin(t * 3)) * -u * 0.2, u * 0.9, u * 0.9);
    text(c, 'Ten frames of bowling · move, aim, set the power and knock them all down', cx, py + u * 2.55, u * 0.42, 'rgba(255,255,255,0.85)', 700);
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
    text(c, SKILLS[skill].tip, cx, rowY(2) + u * 0.95, u * 0.4, 'rgba(255,200,240,0.9)', 700);
    const n = people + tvs, sy = rowY(3) + u * 0.35, stepX = u * 2.6;
    let tvN = 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * stepX, bob = Math.sin(t * 4 + i) * u * 0.08;
      const isH = i < people; if (!isH) tvN++;
      c.drawImage(ballSprite(SEAT_C[i], Math.round(u * 0.8)), x - u * 0.4, sy - u * 0.5 + bob, u * 0.8, u * 0.8);
      text(c, isH ? (people === 1 ? 'You' : `Player ${i + 1}`) : (tvs === 1 ? 'TV' : `TV ${tvN}`), x, sy + u * 0.6, u * 0.36, 'rgba(255,255,255,0.9)', 800);
    }
    const bw = u * 5, bh = u * 1.2, by2 = rowY(3) + u * 1.8;
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
    hits.push({ x: cx - bw / 2, y: by2, w: bw, h: bh, act: 'play' });
    text(c, Kit.touchFirst() ? 'Tap to choose · tap Play' : '▲ ▼ choose  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - u * 0.6, u * 0.38, 'rgba(255,255,255,0.7)', 700);
    const wb = u * 3.6, wh = u * 0.7;
    roundRect(c, cx - wb / 2, py - wh / 2, wb, wh, wh / 2);
    c.fillStyle = '#2a0f5c'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, `🎳 Best: ${best}`, cx, py, u * 0.4, '#ffd23f', 800);
    c.restore();
  }

  let lastTop = -1;
  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    const want = state === 'menu' ? 0 : scoreH();
    if (Math.abs(want - lastTop) > 0.5) { lastTop = want; relayoutLane(); }
    c.fillStyle = '#0a0418'; c.fillRect(0, 0, W, H);
    drawLane(c, t);
    if (state === 'play') {
      drawScores(c, t);
      drawPinMap(c, t);
      drawControls(c, t);
      drawBanner(c, t);
    }
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') { drawScores(c, t); drawOver(c, t); }
  }

  if (HASH.indexOf('simtest') >= 0) {
    window.__slTest = (x0, ang, pw, s) => {
      rackPins(); startX = x0; resetBall(); spin = s; aimDeg = ang; release(pw);
      for (let i = 0; i < 600; i++) stepPhysics(1 / 60);
      return { knocked: pins.filter((q) => q.down || q.gone).length, atHead: pathOf(x0, ang, pw, s).x };
    };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  rackPins(); resetBall();
  Kit.run((dt) => { try { update(dt); } catch (e) { console.error(e); } }, (c, t) => { try { draw(c, t); } catch (e) { console.error(e); } });
  layout(Kit.W, Kit.H);
  Kit.canvas.focus();
  if (best > 0) Kit.record(ID, best);
})();
