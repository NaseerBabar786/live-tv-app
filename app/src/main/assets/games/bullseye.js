// Bullseye Darts: a lit dartboard in a wooden cabinet. Count-down (301; 101 on Beginner) with the bust
// rule (double-out on Hard), or Around the Clock (hit 1 to 20, then the bull). Three darts a turn,
// one to four players taking turns, each seat a person or the TV.
// Remote: OK stops the sideways-swinging line, OK stops the up-and-down line, the dart flies in
// (with a little hand wobble, more on Hard). Menu: ▲ ▼ choose a row, ◀ ▶ change, OK plays. M mutes.
// Test hooks: #auto / #autoN (N TV players, 4x speed), #fast (4x speed).
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const ID = 'bullseye';
  const HASH = (location.hash || '').toLowerCase();
  const AUTO = HASH.indexOf('auto') >= 0;
  const SPEED = AUTO || HASH.indexOf('fast') >= 0 ? 4 : 1;
  const AUTO_N = clamp(parseInt((HASH.match(/auto(\d)/) || [])[1], 10) || 3, 1, 4);
  const TAU = Math.PI * 2;

  const SEAT_C = ['#ff4d6d', '#3d8bff', '#2ed573', '#ffc312'];
  const SKILLS = [
    { name: 'Beginner', tip: '101 to zero · slow swing · steady hand · target hints', start: 101, doubleOut: false,
      period: 3.6, wobble: 3, aiErr: 40, hint: true },
    { name: 'Normal', tip: '301 to zero · no double needed to finish', start: 301, doubleOut: false,
      period: 2.4, wobble: 7, aiErr: 22, hint: true },
    { name: 'Hard', tip: '301 · finish on a double · faster swing · shaky hand', start: 301, doubleOut: true,
      period: 1.7, wobble: 12, aiErr: 12, hint: false },
  ];
  const MODES = ['Count-down', 'Around the Clock'];
  const MAX_ROUNDS = 20;

  // ---------- The board (millimetres) ----------
  const ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
  const R_BULL = 6.35, R_OUTER = 15.9, R_T0 = 99, R_T1 = 107, R_D0 = 162, R_D1 = 170, R_EDGE = 226, SWING = 195;
  function scoreAt(x, y) {
    const r = Math.hypot(x, y);
    if (r <= R_BULL) return { v: 50, mult: 2, n: 25, label: 'BULL', ring: 'bull' };
    if (r <= R_OUTER) return { v: 25, mult: 1, n: 25, label: '25', ring: 'outer' };
    if (r > R_D1) return { v: 0, mult: 0, n: 0, label: 'Miss', ring: 'miss' };
    let a = Math.atan2(x, -y) * 180 / Math.PI; if (a < 0) a += 360;
    const n = ORDER[Math.floor(((a + 9) % 360) / 18)];
    if (r >= R_T0 && r <= R_T1) return { v: n * 3, mult: 3, n, label: 'T' + n, ring: 'treble' };
    if (r >= R_D0) return { v: n * 2, mult: 2, n, label: 'D' + n, ring: 'double' };
    return { v: n, mult: 1, n, label: String(n), ring: 'single' };
  }
  function spotOf(n, ring) {
    if (n === 25 || n === 50) return { x: 0, y: 0 };
    const i = ORDER.indexOf(n), a = i * 18 * Math.PI / 180;
    const r = ring === 'T' ? 103 : ring === 'D' ? 166 : ring === 'I' ? 58 : 135;
    return { x: Math.sin(a) * r, y: -Math.cos(a) * r };
  }

  // ---------- Setup and records ----------
  const setup = Kit.store.get(ID + '.setup', { people: 1, tv: 1 }) || {};
  let people = clamp((setup.people | 0) || 1, 1, 4), tvs = clamp(setup.tv | 0, 0, 3);
  function fixTv() { tvs = clamp(tvs, 0, 4 - people); }
  fixTv();
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, SKILLS.length - 1);
  let mode = clamp(Kit.store.get(ID + '.mode', 0) | 0, 0, 1);
  let wins = Kit.store.get(ID + '.wins', 0) | 0;

  // ---------- State ----------
  let state = 'menu', menuRow = 0, overBtn = 0, stateT = 0, clock = 0, hits = [];
  let players = [], cur = 0, round = 1, phase = 'banner', phaseT = 0, bannerT = 9, sk = SKILLS[skill], gm = 0;
  let swingT = 0, swingPh = 0, aimX = 0, aimY = 0, darts = [], turnStartRem = 0, turnMsg = null, ai = null, winners = [];
  let flight = null, boardPulse = 0;

  const human = (i) => players[i] && players[i].human;

  function newGame() {
    sk = SKILLS[skill]; gm = mode;
    const humans = AUTO ? 0 : people, n = AUTO ? AUTO_N : people + tvs;
    players = [];
    let tvN = 0;
    for (let i = 0; i < n; i++) {
      const isH = i < humans;
      if (!isH) tvN++;
      players.push({ c: SEAT_C[i], human: isH, name: isH ? (humans === 1 ? 'You' : `Player ${i + 1}`) : (n - humans === 1 ? 'TV' : `TV ${tvN}`),
        rem: sk.start, next: 1, shown: sk.start, bump: 0, hist: [] });
    }
    cur = 0; round = 1;
    startTurn();
  }
  function startTurn() {
    const p = players[cur];
    darts = []; turnMsg = null; turnStartRem = p.rem;
    phase = 'banner'; phaseT = 0; bannerT = 0; ai = null;
    Kit.tone(620, { type: 'triangle', dur: 0.12, vol: 0.14, slide: 1.3 });
    Kit.tone(930, { type: 'sine', dur: 0.12, vol: 0.06, at: 0.06 });
  }
  function startAim() {
    phase = 'aimX'; phaseT = 0; swingT = 0; swingPh = Math.random() * TAU;
    if (!human(cur)) planAI();
  }
  const swingVal = () => SWING * Math.sin((swingT / sk.period) * TAU + swingPh);
  const wob = (t, k) => sk.wobble * 0.5 * (Math.sin(t * 7.3 + k) + Math.sin(t * 4.1 + k * 2.3) * 0.6);
  function lockX() { aimX = swingVal(); phase = 'aimY'; phaseT = 0; swingT = 0; swingPh = Math.random() * TAU; Kit.tone(700, { type: 'triangle', dur: 0.05, vol: 0.12 }); }
  function lockY() {
    aimY = swingVal();
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5 * 1.6;
    const tx = aimX + g() * sk.wobble, ty = aimY + g() * sk.wobble;
    flight = { x: tx, y: ty, t: 0 };
    phase = 'fly'; phaseT = 0;
    Kit.noise({ dur: 0.25, vol: 0.08, freq: 2500, q: 0.6, sweep: 0.5, type: 'highpass' });
  }
  // What a dart's score means for the player
  function land() {
    const p = players[cur], f = flight, s = scoreAt(f.x, f.y);
    darts.push({ x: f.x, y: f.y, s, t: 0 });
    boardPulse = 1;
    Kit.noise({ dur: 0.05, vol: 0.3, freq: 700, q: 1.2 });
    Kit.tone(150, { type: 'sine', dur: 0.1, vol: 0.3, slide: 0.6 });
    const sp = toS(f.x, f.y);
    let msg = s.label === 'Miss' ? 'Miss!' : s.ring === 'bull' ? 'BULLSEYE!' : s.mult === 3 ? `Treble ${s.n}!` : s.mult === 2 ? `Double ${s.n}!` : s.label;
    let col = s.v === 0 ? '#ffb3c0' : s.mult >= 2 || s.ring === 'outer' ? '#ffd23f' : '#ffffff';
    if (s.ring === 'bull' || s.mult === 3) { Kit.burst(sp.x, sp.y, '#ffd23f', 18, 0.7); Kit.sfx.chime(); }
    phase = 'landed'; phaseT = 0;
    if (gm === 0) {
      const nr = p.rem - s.v;
      const bust = nr < 0 || (sk.doubleOut && (nr === 1 || (nr === 0 && s.mult !== 2)));
      if (bust) {
        p.rem = turnStartRem; turnMsg = { text: 'BUST!', color: '#ff6b81', bust: true };
        Kit.float(msg, sp.x, sp.y - L.R * 0.08, { color: col, size: L.u * 0.7, life: 1 });
        Kit.sfx.nope(); Kit.shake(6, 0.25);
        phase = 'turnEnd'; phaseT = 0;
        return;
      }
      p.rem = nr; p.bump = 1;
      Kit.float(s.v ? `${msg}  −${s.v}` : msg, sp.x, sp.y - L.R * 0.08, { color: col, size: L.u * 0.7, life: 1.1 });
      if (nr === 0) { win(); return; }
    } else {
      const hit = (p.next <= 20 && s.n === p.next && s.v > 0) || (p.next === 21 && (s.ring === 'bull' || s.ring === 'outer'));
      if (hit) {
        p.next++; p.bump = 1;
        msg = p.next > 21 ? 'BULLSEYE!' : `Hit ${s.n === 25 ? 'the bull' : s.n}!`;
        col = '#7dffb0';
        Kit.tone(880, { type: 'triangle', dur: 0.12, vol: 0.14 });
        if (p.next > 21) { Kit.float(msg, sp.x, sp.y - L.R * 0.08, { color: col, size: L.u * 0.8, life: 1.1 }); win(); return; }
      } else msg = s.v ? `${s.label} · need ${p.next > 20 ? 'Bull' : p.next}` : 'Miss!';
      Kit.float(msg, sp.x, sp.y - L.R * 0.08, { color: hit ? col : '#ffb3c0', size: L.u * 0.62, life: 1.1 });
    }
  }
  function afterLanded() {
    if (darts.length >= 3) {
      const p = players[cur];
      if (gm === 0) { const sc = turnStartRem - p.rem; turnMsg = { text: sc ? `Scored ${sc}` : 'No score', color: sc >= 100 ? '#ffd23f' : '#ffffff' }; if (sc >= 100) { Kit.float(sc === 180 ? 'ONE HUNDRED AND EIGHTY!' : 'Ton!', Kit.W / 2, Kit.H * 0.2, { color: '#ffd23f', size: L.u * 1.1, life: 1.6, big: true }); Kit.sfx.win(); } }
      else turnMsg = { text: `Next target: ${p.next > 20 ? 'Bull' : p.next}`, color: '#ffffff' };
      phase = 'turnEnd'; phaseT = 0;
      return;
    }
    startAim();
  }
  function nextTurn() {
    players[cur].hist.push(darts.map((d) => d.s.label));
    cur++;
    if (cur >= players.length) {
      cur = 0; round++;
      if (round > MAX_ROUNDS) { endByRounds(); return; }
    }
    startTurn();
  }
  function win() {
    winners = [cur];
    over();
  }
  function endByRounds() {
    const key = (p) => (gm === 0 ? -p.rem : p.next);
    const top = Math.max(...players.map(key));
    winners = players.map((p, i) => i).filter((i) => key(players[i]) === top);
    over(true);
  }
  let byRounds = false;
  function over(rounds) {
    byRounds = !!rounds;
    state = 'over'; stateT = 0; overBtn = 0;
    Kit.confetti(170); Kit.shake(6, 0.3);
    const humanWon = winners.some((i) => players[i].human);
    if (humanWon || AUTO) Kit.sfx.win(); else Kit.sfx.over();
    const solo = players.length === 1;
    if (!AUTO && humanWon && (!solo || !rounds)) { wins++; Kit.store.set(ID + '.wins', wins); Kit.record(ID, wins); }
  }

  // ---------- Hints and the TV's plan ----------
  function planRaw(p) {
    // Where a sensible player aims now: {n, ring ('T','D','S','B'), text}
    if (gm === 1) {
      if (p.next > 20) return { n: 25, ring: 'B', text: 'Bull' };
      return { n: p.next, ring: 'S', text: String(p.next) };
    }
    const rem = p.rem;
    if (sk.doubleOut) {
      if (rem === 50) return { n: 25, ring: 'B', text: 'Bull' };
      if (rem <= 40 && rem % 2 === 0) return { n: rem / 2, ring: 'D', text: 'D' + rem / 2 };
      if (rem <= 41 && rem % 2 === 1) return { n: 1, ring: 'S', text: '1' };
      if (rem - 40 <= 20 && rem > 40) return { n: rem - 40, ring: 'S', text: String(rem - 40) };
      if (rem <= 100 && (rem - 40) % 3 === 0 && (rem - 40) / 3 <= 20) return { n: (rem - 40) / 3, ring: 'T', text: 'T' + (rem - 40) / 3 };
      return { n: 20, ring: 'T', text: 'T20' };
    }
    if (rem === 50) return { n: 25, ring: 'B', text: 'Bull' };
    if (rem === 25) return { n: 25, ring: 'B', text: '25' };
    if (rem <= 20) return { n: rem, ring: 'S', text: String(rem) };
    if (rem <= 40 && rem % 2 === 0) return { n: rem / 2, ring: 'D', text: 'D' + rem / 2 };
    if (rem <= 60 && rem % 3 === 0) return { n: rem / 3, ring: 'T', text: 'T' + rem / 3 };
    if (rem <= 40) return { n: rem - 20 > 0 && rem - 20 <= 20 ? rem - 20 : 20, ring: 'S', text: String(rem - 20 > 0 ? rem - 20 : 20) };
    if (rem < 60) return { n: 20, ring: 'S', text: '20' };
    return { n: 20, ring: 'T', text: 'T20' };
  }
  function plan(p) {
    const pl = planRaw(p);
    // Beginners go for the big single area rather than the thin treble bed
    if (skill === 0 && pl.ring === 'T' && pl.n === 20) return { n: 20, ring: 'S', text: '20' };
    return pl;
  }
  function planAI() {
    const p = players[cur], pl = plan(p);
    // Weaker TV players go for the big single area instead of trebles
    let ring = pl.ring;
    if (skill === 0 && ring === 'T') ring = 'S';
    const spot = ring === 'B' ? { x: 0, y: 0 } : spotOf(pl.n, ring);
    const g = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    ai = { x: clamp(spot.x + g() * sk.aiErr, -SWING + 2, SWING - 2), y: clamp(spot.y + g() * sk.aiErr, -SWING + 2, SWING - 2) };
  }
  function stepAI() {
    if (!ai || phaseT < 0.6) return;
    const target = phase === 'aimX' ? ai.x : ai.y;
    if (Math.abs(swingVal() - target) < 4 || swingT > sk.period * 4) {
      if (phase === 'aimX') { lockX(); aimX = ai.x; } else { lockY(); }
    }
  }

  // ---------- Input ----------
  function menuRows() { return ['people', 'tv', 'skill', 'mode', 'play']; }
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
      else if (r === 'mode') { const b = mode; mode = clamp(mode + d, 0, 1); if (b === mode) { Kit.sfx.nope(); return; } Kit.store.set(ID + '.mode', mode); }
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
  function toMenu() { state = 'menu'; stateT = 0; menuRow = 0; darts = []; }
  function playKey(k, rep) {
    if (rep) return;
    if (!human(cur)) return;
    if (phase === 'banner') { if (k === 'ok' && phaseT > 0.35) phaseT = 99; return; }
    if (k !== 'ok') return;
    if (phase === 'aimX' && swingT > 0.15) lockX();
    else if (phase === 'aimY' && swingT > 0.15) lockY();
    else if (phase === 'turnEnd' && phaseT > 0.6) phaseT = 99;
  }
  Kit.onKeys((k, rep) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { if (!rep) menuKey(k); return; }
    if (state === 'over') {
      if (stateT < 1.8 || rep) return;
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
        else if (hit.act === 'mode') { mode = hit.v; Kit.store.set(ID + '.mode', mode); Kit.sfx.move(); }
        return;
      }
      if (state === 'over') {
        if (stateT < 1.8) return;
        if (hit && hit.act === 'menu') toMenu(); else start();
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
    boardPulse = Math.max(0, boardPulse - dt * 4);
    players.forEach((p) => { p.bump = Math.max(0, p.bump - dt * 2.5); const tgt = gm === 0 ? p.rem : p.next; p.shown += (tgt - p.shown) * Math.min(1, dt * 8); if (Math.abs(tgt - p.shown) < 0.05) p.shown = tgt; });
    darts.forEach((d) => { d.t += dt; });
    if (state === 'menu') { if (AUTO && stateT > 1) start(); return; }
    if (state === 'over') {
      if (stateT > 1 && Math.random() < dt * 0.6) Kit.confetti(30);
      if (AUTO && stateT > 3) start();
      return;
    }
    phaseT += dt; bannerT += dt;
    if (phase === 'banner') { if (phaseT > (human(cur) ? 1.7 : 1.1)) startAim(); }
    else if (phase === 'aimX' || phase === 'aimY') { swingT += dt; if (!human(cur)) stepAI(); }
    else if (phase === 'fly') { flight.t = phaseT / 0.32; if (flight.t >= 1) land(); }
    else if (phase === 'landed') { if (phaseT > (human(cur) ? 0.9 : 0.75)) afterLanded(); }
    else if (phase === 'turnEnd') { if (phaseT > (turnMsg && turnMsg.bust ? 1.8 : 1.5)) nextTurn(); }
  }

  // ---------- Layout and the baked board ----------
  let L = { u: 60, cx: 960, cy: 560, R: 380, k: 1.7 };
  const scene = document.createElement('canvas');
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  const toS = (x, y) => ({ x: L.cx + x * L.k, y: L.cy + y * L.k });
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 32, H / 18);
    const wide = W / H > 1.3;
    const R = wide ? Math.min(H * 0.38, W * 0.24) : Math.min(W * 0.4, H * 0.28);
    L = { u, cx: W / 2, cy: wide ? H * 0.49 : H * 0.4, R, k: R / R_EDGE, wide };
    sprites.clear();
    bakeScene();
  }
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
  function bakeScene() {
    const W = Kit.W, H = Kit.H;
    if (!W || !H) return;
    const d = DPR();
    scene.width = Math.ceil(W * d); scene.height = Math.ceil(H * d);
    const c = scene.getContext('2d');
    c.setTransform(d, 0, 0, d, 0, 0);
    // Wood-panelled wall with a warm spotlight
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#3a2014'); g.addColorStop(1, '#1a0d07');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += L.u * 2.2) {
      c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, 0, 3, H);
      c.fillStyle = 'rgba(255,200,150,0.05)'; c.fillRect(x + 3, 0, 2, H);
      for (let i = 0; i < 6; i++) { c.strokeStyle = 'rgba(0,0,0,0.07)'; c.lineWidth = 2; c.beginPath(); const yy = ((x * 7 + i * 173) % H); c.moveTo(x + 8, yy); c.bezierCurveTo(x + L.u * 0.8, yy + 30, x + L.u * 1.4, yy - 30, x + L.u * 2.1, yy + 10); c.stroke(); }
    }
    const sg = c.createRadialGradient(L.cx, L.cy - L.R * 0.2, L.R * 0.3, L.cx, L.cy, L.R * 2.4);
    sg.addColorStop(0, 'rgba(255,220,160,0.35)'); sg.addColorStop(1, 'rgba(0,0,0,0.55)');
    c.fillStyle = sg; c.fillRect(0, 0, W, H);
    // Cabinet surround
    const cr = L.R * 1.12;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = L.R * 0.15; c.shadowOffsetY = L.R * 0.04;
    c.beginPath(); c.arc(L.cx, L.cy, cr, 0, TAU);
    const cg = c.createRadialGradient(L.cx - cr * 0.3, L.cy - cr * 0.4, cr * 0.2, L.cx, L.cy, cr);
    cg.addColorStop(0, '#7a3e1c'); cg.addColorStop(1, '#3b1a09');
    c.fillStyle = cg; c.fill();
    c.restore();
    c.lineWidth = L.R * 0.02; c.strokeStyle = '#c98a4a'; c.beginPath(); c.arc(L.cx, L.cy, cr - L.R * 0.02, 0, TAU); c.stroke();
    // Board
    c.save(); c.translate(L.cx, L.cy);
    drawBoard(c, L.k);
    c.restore();
  }
  function drawBoard(c, k) {
    // Black number ring
    c.beginPath(); c.arc(0, 0, R_EDGE * k, 0, TAU);
    const ng = c.createRadialGradient(0, 0, R_D1 * k, 0, 0, R_EDGE * k);
    ng.addColorStop(0, '#151515'); ng.addColorStop(1, '#050505');
    c.fillStyle = ng; c.fill();
    const seg = (r0, r1, i, col) => {
      const a0 = (i * 18 - 9 - 90) * Math.PI / 180, a1 = (i * 18 + 9 - 90) * Math.PI / 180;
      c.beginPath(); c.arc(0, 0, r1 * k, a0, a1); c.arc(0, 0, r0 * k, a1, a0, true); c.closePath();
      c.fillStyle = col; c.fill();
    };
    for (let i = 0; i < 20; i++) {
      const dark = i % 2 === 0;
      seg(R_OUTER, R_T0, i, dark ? '#1b1b1b' : '#f2e6c9');
      seg(R_T1, R_D0, i, dark ? '#1b1b1b' : '#f2e6c9');
      seg(R_T0, R_T1, i, dark ? '#d9202f' : '#14904a');
      seg(R_D0, R_D1, i, dark ? '#d9202f' : '#14904a');
    }
    c.beginPath(); c.arc(0, 0, R_OUTER * k, 0, TAU); c.fillStyle = '#14904a'; c.fill();
    c.beginPath(); c.arc(0, 0, R_BULL * k, 0, TAU); c.fillStyle = '#d9202f'; c.fill();
    // Sisal texture
    c.save(); c.beginPath(); c.arc(0, 0, R_D1 * k, 0, TAU); c.clip();
    for (let i = 0; i < 1400; i++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * R_D1 * k;
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.1)';
      c.fillRect(Math.cos(a) * r, Math.sin(a) * r, 2, 2);
    }
    c.restore();
    // Wires
    c.strokeStyle = 'rgba(220,220,230,0.85)'; c.lineWidth = Math.max(1, k * 1.1);
    [R_BULL, R_OUTER, R_T0, R_T1, R_D0, R_D1].forEach((r) => { c.beginPath(); c.arc(0, 0, r * k, 0, TAU); c.stroke(); });
    for (let i = 0; i < 20; i++) {
      const a = (i * 18 - 9 - 90) * Math.PI / 180;
      c.beginPath(); c.moveTo(Math.cos(a) * R_OUTER * k, Math.sin(a) * R_OUTER * k); c.lineTo(Math.cos(a) * R_D1 * k, Math.sin(a) * R_D1 * k); c.stroke();
    }
    // Numbers
    c.fillStyle = '#ffffff'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `700 ${Math.round(28 * k)}px ${Kit.FONT}`;
    ORDER.forEach((n, i) => {
      const a = (i * 18 - 90) * Math.PI / 180, r = (R_D1 + R_EDGE) / 2 * k;
      c.fillText(String(n), Math.cos(a) * r, Math.sin(a) * r + k);
    });
    // Gloss
    const gl = c.createRadialGradient(-R_EDGE * k * 0.35, -R_EDGE * k * 0.45, 0, 0, 0, R_EDGE * k);
    gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.5, 'rgba(255,255,255,0.03)'); gl.addColorStop(1, 'rgba(0,0,0,0.25)');
    c.beginPath(); c.arc(0, 0, R_EDGE * k, 0, TAU); c.fillStyle = gl; c.fill();
    c.lineWidth = k * 4; c.strokeStyle = '#8c8c96'; c.stroke();
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
    c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(30,10,4,0.92)'; c.strokeText(s, x, y);
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
  const dartIcon = (col, s) => sprite('dicon' + col, s, s, (c) => {
    c.save(); c.translate(s * 0.15, s * 0.85); c.rotate(-Math.PI / 4);
    c.fillStyle = '#c9ccd6'; c.fillRect(0, -s * 0.02, s * 0.2, s * 0.04);
    const g = c.createLinearGradient(0, -s * 0.06, 0, s * 0.06);
    g.addColorStop(0, '#f2f2f6'); g.addColorStop(1, '#6b6f80');
    c.fillStyle = g; roundRect(c, s * 0.18, -s * 0.06, s * 0.36, s * 0.12, s * 0.05); c.fill();
    c.fillStyle = '#333'; c.fillRect(s * 0.54, -s * 0.025, s * 0.2, s * 0.05);
    c.fillStyle = col; c.beginPath(); c.moveTo(s * 0.7, 0); c.lineTo(s * 0.98, -s * 0.16); c.lineTo(s * 0.92, 0); c.lineTo(s * 0.98, s * 0.16); c.closePath(); c.fill();
    c.restore();
  });

  // A dart stuck in the board, seen from the front: barrel and flights point back at us, a little low-right.
  function drawStuck(c, x, y, col, scale, a = 1) {
    const s = L.R * 0.2 * scale;
    c.save(); c.globalAlpha = a;
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.beginPath(); c.ellipse(x + s * 0.18, y + s * 0.12, s * 0.12, s * 0.06, 0.6, 0, TAU); c.fill();
    c.strokeStyle = '#d7dae4'; c.lineWidth = Math.max(2, s * 0.05); c.lineCap = 'round';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + s * 0.12, y + s * 0.16); c.stroke();
    c.strokeStyle = '#7d8294'; c.lineWidth = Math.max(3, s * 0.12);
    c.beginPath(); c.moveTo(x + s * 0.12, y + s * 0.16); c.lineTo(x + s * 0.3, y + s * 0.4); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = Math.max(1, s * 0.03);
    c.beginPath(); c.moveTo(x + s * 0.13, y + s * 0.15); c.lineTo(x + s * 0.28, y + s * 0.36); c.stroke();
    // flights: an X of two coloured fins
    const fx = x + s * 0.42, fy = y + s * 0.56;
    c.fillStyle = col; c.strokeStyle = shade(col, -0.4); c.lineWidth = 1.5;
    [[-1, 1], [1, -1]].forEach(([a1, b1]) => {
      c.beginPath(); c.moveTo(x + s * 0.3, y + s * 0.4); c.lineTo(fx + a1 * s * 0.2, fy + b1 * s * 0.05 - s * 0.05); c.lineTo(fx + a1 * s * 0.1, fy + s * 0.18); c.closePath(); c.fill(); c.stroke();
    });
    c.beginPath(); c.moveTo(x + s * 0.3, y + s * 0.4); c.lineTo(fx + s * 0.02, fy + s * 0.25); c.lineTo(fx - s * 0.08, fy + s * 0.05); c.closePath();
    c.fillStyle = shade(col, 0.3); c.fill(); c.stroke();
    c.restore();
  }

  function segPath(c, n, ring) {
    const k = L.k, i = ORDER.indexOf(n);
    let r0 = R_OUTER, r1 = R_D1;
    if (ring === 'T') { r0 = R_T0; r1 = R_T1; } else if (ring === 'D') { r0 = R_D0; r1 = R_D1; }
    c.beginPath();
    if (n === 25 || ring === 'B') { c.arc(L.cx, L.cy, R_OUTER * k, 0, TAU); return; }
    const a0 = (i * 18 - 9 - 90) * Math.PI / 180, a1 = (i * 18 + 9 - 90) * Math.PI / 180;
    c.arc(L.cx, L.cy, r1 * k, a0, a1); c.arc(L.cx, L.cy, r0 * k, a1, a0, true); c.closePath();
  }

  function drawPlay(c, t) {
    const p = players[cur], k = L.k;
    // Target highlight
    const showHint = (sk.hint || gm === 1 && skill < 2) && (phase === 'aimX' || phase === 'aimY' || phase === 'banner') && human(cur);
    if (showHint) {
      const pl = plan(p);
      c.save();
      segPath(c, pl.n, pl.ring === 'S' && gm === 1 ? 'all' : pl.ring);
      c.fillStyle = `rgba(255,230,90,${0.25 + Math.sin(t * 5) * 0.12})`; c.fill();
      c.lineWidth = 3; c.strokeStyle = '#ffe36b'; c.stroke();
      c.restore();
    }
    // Stuck darts
    darts.forEach((d) => {
      const s = toS(d.x, d.y);
      if (Math.hypot(d.x, d.y) > R_EDGE + 30) return;
      const shake = d.t < 0.25 ? Math.sin(d.t * 60) * (0.25 - d.t) * 0.5 : 0;
      drawStuck(c, s.x + shake * L.u, s.y, p.c, 1);
    });
    // Aim lines
    if (phase === 'aimX' || phase === 'aimY') {
      const R = L.R * 1.05;
      const vx = phase === 'aimX' ? swingVal() : aimX;
      const wx = wob(t, 1), wy = wob(t, 2);
      const sx = L.cx + (vx + wx) * k;
      c.save();
      c.shadowColor = p.c; c.shadowBlur = 16;
      c.strokeStyle = phase === 'aimX' ? '#ffffff' : rgba(p.c, 0.9); c.lineWidth = phase === 'aimX' ? 4 : 3;
      c.setLineDash(phase === 'aimX' ? [] : [12, 8]);
      c.beginPath(); c.moveTo(sx, L.cy - R); c.lineTo(sx, L.cy + R); c.stroke();
      if (phase === 'aimY') {
        const sy = L.cy + (swingVal() + wy) * k;
        c.setLineDash([]); c.strokeStyle = '#ffffff'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(L.cx - R, sy); c.lineTo(L.cx + R, sy); c.stroke();
        // reticle where the lines cross
        c.shadowBlur = 10;
        c.strokeStyle = p.c; c.lineWidth = 4;
        c.beginPath(); c.arc(sx, sy, L.u * 0.45, 0, TAU); c.stroke();
        c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(sx, sy, L.u * 0.45 + 4, 0, TAU); c.stroke();
        if (skill === 0 && human(cur)) {
          const s = scoreAt(vx + wx, swingVal() + wy);
          c.shadowBlur = 0;
          text(c, s.label, sx + L.u * 0.95, sy - L.u * 0.6, L.u * 0.5, '#ffe36b', 800, 'left', Kit.FONT);
        }
      } else {
        // arrows on the edge show the swing
        c.fillStyle = '#ffffff';
        [L.cy - R, L.cy + R].forEach((yy, i) => { c.beginPath(); c.moveTo(sx, yy + (i ? 8 : -8)); c.lineTo(sx - 12, yy + (i ? 26 : -26)); c.lineTo(sx + 12, yy + (i ? 26 : -26)); c.fill(); });
      }
      c.restore();
    }
    // Flying dart
    if (phase === 'fly' && flight) {
      const e = ease.out(clamp(flight.t, 0, 1)), end = toS(flight.x, flight.y);
      const x = lerp(Kit.W * 0.6, end.x, e), y = lerp(Kit.H * 1.1, end.y, e) - Math.sin(e * Math.PI) * L.R * 0.25;
      drawStuck(c, x, y, p.c, 1 + (1 - e) * 2.2);
    }
  }

  function drawPanels(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u, n = players.length;
    // Players (left)
    const pw = Math.min(u * 7.4, L.cx - L.R * 1.12 - u * 0.8), px = u * 0.5;
    const ch = Math.min(u * 2.3, (H - u * 3) / n - u * 0.3);
    let y = u * 0.6;
    text(c, gm === 0 ? `${sk.start}${sk.doubleOut ? ' · double out' : ''}` : 'Around the Clock', px + pw / 2, y + u * 0.2, u * 0.5, '#ffd9a8', 800);
    text(c, `Round ${Math.min(round, MAX_ROUNDS)} of ${MAX_ROUNDS}`, px + pw / 2, y + u * 0.8, u * 0.36, 'rgba(255,255,255,0.7)', 700);
    y += u * 1.4;
    players.forEach((p, i) => {
      const on = i === cur && state === 'play';
      const s = on ? 1 + p.bump * 0.04 : 1;
      c.save(); c.translate(px + pw / 2, y + ch / 2); c.scale(s, s);
      panel(c, -pw / 2, -ch / 2, pw, ch, u * 0.35, on ? '#ffffff' : 'rgba(255,220,180,0.25)', on ? shade(p.c, -0.05) : 'rgba(60,30,18,0.92)', on ? shade(p.c, -0.5) : 'rgba(30,14,8,0.92)');
      const ds = ch * 0.5;
      c.drawImage(dartIcon(p.c, Math.round(ds)), -pw / 2 + u * 0.15, -ch * 0.42, ds, ds);
      const nm = p.name + (p.human ? '' : ' 📺');
      text(c, nm, -pw / 2 + u * 0.25 + ds, -ch * 0.2, fitSize(c, nm, ch * 0.26, pw * 0.5, 800), '#ffffff', 800, 'left');
      if (gm === 0) {
        text(c, String(Math.round(p.shown)), pw / 2 - u * 0.3, ch * 0.05, ch * 0.55, '#ffffff', 800, 'right', Kit.FONT);
        const last = p.hist.length ? p.hist[p.hist.length - 1].join(' · ') : '';
        if (last) text(c, `Last: ${last}`, -pw / 2 + u * 0.3, ch * 0.28, ch * 0.18, 'rgba(255,255,255,0.7)', 700, 'left');
      } else {
        const nx = Math.min(21, p.next);
        text(c, p.next > 21 ? '✔' : nx === 21 ? 'Bull' : String(nx), pw / 2 - u * 0.3, -ch * 0.08, ch * 0.42, '#ffffff', 800, 'right', Kit.FONT);
        const bw = pw - u * 0.6, bx = -pw / 2 + u * 0.3, by = ch * 0.24;
        c.fillStyle = 'rgba(0,0,0,0.3)'; roundRect(c, bx, by, bw, ch * 0.1, ch * 0.05); c.fill();
        c.fillStyle = on ? '#ffffff' : p.c; roundRect(c, bx, by, Math.max(ch * 0.1, bw * (p.next - 1) / 21), ch * 0.1, ch * 0.05); c.fill();
      }
      c.restore();
      y += ch + u * 0.3;
    });
    // Turn panel (right)
    if (state !== 'play') return;
    const p = players[cur];
    const tw = pw, tx = W - tw - u * 0.5, ty = u * 0.6, th = u * 6.8;
    panel(c, tx, ty, tw, th, u * 0.4, rgba(p.c, 0.8), 'rgba(60,30,18,0.92)', 'rgba(30,14,8,0.92)');
    text(c, p.human ? (p.name === 'You' ? 'Your darts' : `${p.name}'s darts`) : `${p.name}'s darts`, tx + tw / 2, ty + u * 0.6, fitSize(c, 'x', u * 0.5, tw), '#ffffff', 800);
    for (let i = 0; i < 3; i++) {
      const d = darts[i], yy = ty + u * 1.5 + i * u * 1.05;
      roundRect(c, tx + u * 0.3, yy - u * 0.42, tw - u * 0.6, u * 0.84, u * 0.25);
      c.fillStyle = d ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.25)'; c.fill();
      c.globalAlpha = d || i >= darts.length ? 1 : 0.4;
      c.drawImage(dartIcon(p.c, Math.round(u * 0.7)), tx + u * 0.4, yy - u * 0.35, u * 0.7, u * 0.7);
      c.globalAlpha = 1;
      if (d) text(c, d.s.label + (gm === 0 && d.s.v ? `  (${d.s.v})` : ''), tx + u * 1.3, yy, u * 0.46, d.s.v ? '#ffffff' : '#ffb3c0', 800, 'left', Kit.FONT);
      else if (i === darts.length && (phase === 'aimX' || phase === 'aimY' || phase === 'fly')) text(c, 'throwing…', tx + u * 1.3, yy, u * 0.38, 'rgba(255,255,255,0.6)', 700, 'left');
    }
    let yy = ty + u * 4.7;
    if (turnMsg) {
      outlined(c, turnMsg.text, tx + tw / 2, yy, fitSize(c, turnMsg.text, u * 0.75, tw * 0.9, 700, Kit.FONT), '#ffffff', turnMsg.color);
    } else {
      const pl = plan(p);
      if (gm === 0) text(c, `Need ${p.rem}`, tx + tw / 2, yy - u * 0.1, u * 0.55, '#ffd9a8', 800);
      else text(c, `Target: ${p.next > 20 ? 'Bull' : p.next}`, tx + tw / 2, yy - u * 0.1, u * 0.55, '#ffd9a8', 800);
      if (sk.hint || gm === 1) text(c, `Try: ${pl.text}`, tx + tw / 2, yy + u * 0.7, u * 0.42, '#ffe36b', 700);
    }
    // Hint pill
    let msg = '';
    if (human(cur)) {
      if (phase === 'aimX') msg = Kit.touchFirst() ? 'Tap to stop the side-to-side line' : 'OK  stop the side-to-side line';
      else if (phase === 'aimY') msg = Kit.touchFirst() ? 'Tap to stop the up-and-down line and throw' : 'OK  stop the up-and-down line and throw!';
    } else if (phase === 'aimX' || phase === 'aimY') msg = `${p.name} is taking aim…`;
    if (msg) {
      c.font = `800 ${Math.round(u * 0.48)}px ${Kit.UI}`;
      const w = c.measureText(msg).width + u * 1.2, hh = u * 0.9, x = W / 2 - w / 2, y2 = H - hh - u * 0.2;
      c.globalAlpha = 0.95;
      roundRect(c, x, y2, w, hh, hh / 2); c.fillStyle = 'rgba(30,14,8,0.88)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.lineWidth = 2; c.stroke();
      text(c, msg, W / 2, y2 + hh / 2, u * 0.48, '#ffffff', 800);
      c.globalAlpha = 1;
    }
  }
  function drawBanner(c, t) {
    if (state !== 'play' || !(phase === 'banner' || bannerT < 1.4)) return;
    const W = Kit.W, u = L.u, p = players[cur], k = bannerT;
    const inK = ease.back(clamp(k / 0.3, 0, 1)), outK = phase === 'banner' ? 0 : clamp((k - 1.1) / 0.3, 0, 1);
    const w = Math.min(W * 0.7, u * 15), hh = u * 2.1;
    c.save();
    c.globalAlpha = 1 - outK;
    c.translate(W / 2 + (1 - inK) * -W * 0.6, Kit.H * 0.5);
    roundRect(c, -w / 2, -hh / 2, w, hh, hh * 0.35);
    const g = c.createLinearGradient(0, -hh / 2, 0, hh / 2);
    g.addColorStop(0, shade(p.c, 0.25)); g.addColorStop(1, shade(p.c, -0.35));
    c.fillStyle = g; c.fill(); c.lineWidth = u * 0.08; c.strokeStyle = '#ffffff'; c.stroke();
    const ds = hh * 0.7;
    c.drawImage(dartIcon(p.c, Math.round(ds)), -w / 2 + hh * 0.2, -ds / 2, ds, ds);
    const label = p.human ? (p.name === 'You' ? 'Your turn!' : `${p.name}'s turn!`) : `${p.name} is throwing`;
    outlined(c, label, hh * 0.3, -hh * 0.12, fitSize(c, label, hh * 0.46, w - hh * 1.6, 700, Kit.FONT), '#ffffff', '#fff1b8');
    const sub = gm === 0 ? `${p.rem} to go` : `Aim for ${p.next > 20 ? 'the bull' : p.next}`;
    text(c, sub + (p.human && phase === 'banner' ? '  ·  press OK' : ''), hh * 0.3, hh * 0.3, hh * 0.2, 'rgba(255,255,255,0.9)', 800);
    c.restore();
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    // Let the last dart's score show first
    const a = clamp((stateT - 0.9) / 0.4, 0, 1);
    c.fillStyle = `rgba(10,4,2,${0.6 * a})`; c.fillRect(0, 0, W, H);
    if (a <= 0) return;
    const n = players.length, rowH = u * 1.1;
    const pw = Math.min(W * 0.8, u * 16), ph = u * 6.4 + n * rowH;
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(a);
    c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    panel(c, px, py, pw, ph, u * 0.6, '#ffd23f', '#6a3418', '#2a1208');
    const wn = winners.map((i) => players[i]);
    let title = wn.length > 1 ? 'It\'s a tie!' : wn[0].human ? (wn[0].name === 'You' ? 'You win!' : `${wn[0].name} wins!`) : `${wn[0].name} wins`;
    if (n === 1) title = byRounds ? 'Out of rounds!' : players[0].human ? 'Game shot!' : `${players[0].name} checked out!`;
    outlined(c, title, W / 2, py + u * 1.2, u * 1.25, '#ffffff', '#ffd9a8');
    let y = py + u * 2.3;
    const key = (p) => (gm === 0 ? -p.rem : p.next);
    const order = players.map((p, i) => i).sort((a, b) => key(players[b]) - key(players[a]));
    order.forEach((i, r) => {
      const p = players[i];
      roundRect(c, px + u * 0.8, y, pw - u * 1.6, rowH - u * 0.15, u * 0.3);
      c.fillStyle = winners.includes(i) ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.07)'; c.fill();
      const ds = rowH * 0.7;
      text(c, ['🥇', '🥈', '🥉', '4th'][r], px + u * 1.5, y + rowH * 0.43, u * 0.55, '#ffffff', 800);
      c.drawImage(dartIcon(p.c, Math.round(ds)), px + u * 2.2, y + rowH * 0.43 - ds / 2, ds, ds);
      text(c, p.name, px + u * 2.4 + ds, y + rowH * 0.43, u * 0.55, '#ffffff', 800, 'left');
      const v = gm === 0 ? (p.rem === 0 ? 'Out!' : `${p.rem} left`) : (p.next > 21 ? 'Done!' : `reached ${p.next > 20 ? 'Bull' : p.next}`);
      text(c, v, px + pw - u * 1.4, y + rowH * 0.43, u * 0.55, '#ffffff', 800, 'right', Kit.FONT);
      y += rowH;
    });
    y += u * 0.5;
    text(c, `🎯 Wins: ${wins}`, W / 2, y, u * 0.55, '#ffd23f', 800);
    y += u * 1.0;
    const bw = u * 5, bh = u * 1.05, gap = u * 0.6;
    hits = [];
    [['▶  Play again', 'again'], ['Menu', 'menu']].forEach(([lab, act], i) => {
      const bx = W / 2 + (i === 0 ? -bw - gap / 2 : gap / 2), on = overBtn === i;
      const s = on ? 1.06 + Math.sin(t * 6) * 0.02 : 1;
      c.save(); c.translate(bx + bw / 2, y + bh / 2); c.scale(s, s);
      c.globalAlpha = stateT > 1.8 ? 1 : 0.5;
      roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
      const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
      if (on) { g.addColorStop(0, '#ff8a5c'); g.addColorStop(1, '#c2361a'); } else { g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0.08)'); }
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
    if (on) { g.addColorStop(0, '#ff8a5c'); g.addColorStop(1, '#c2361a'); } else { g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0.06)'); }
    c.fillStyle = g; c.fill();
    c.lineWidth = focus && on ? 4 : 2; c.strokeStyle = focus && on ? '#ffffff' : 'rgba(255,255,255,0.3)'; c.stroke();
    if (focus && on) { c.shadowColor = '#ffffff'; c.shadowBlur = 16; c.stroke(); c.shadowBlur = 0; }
    text(c, label, 0, h * 0.03, fitSize(c, label, h * 0.48, w * 0.86, 800), '#ffffff', 800);
    c.restore();
  }
  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(10,4,2,0.55)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.94, u * 21), ph = Math.min(H * 0.97, u * 14.4);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    panel(c, px, py, pw, ph, u * 0.7, '#ffd23f', 'rgba(106,52,24,0.96)', 'rgba(36,16,8,0.97)');
    hits = [];
    const cx = W / 2;
    outlined(c, 'BULLSEYE DARTS', cx, py + u * 1.3, u * 1.4, '#ffffff', '#ffd9a8');
    // little board + dart
    const bx = cx - u * 7.9, by = py + u * 1.25, br = u * 0.6;
    [['#1b1b1b', 1], ['#d9202f', 0.75], ['#f2e6c9', 0.55], ['#14904a', 0.3], ['#d9202f', 0.13]].forEach(([col, r]) => { c.fillStyle = col; c.beginPath(); c.arc(bx, by, br * r, 0, TAU); c.fill(); });
    drawStuck(c, bx + 2, by - 2, '#3fd0ff', 0.45 * (u / L.R) * 4);
    text(c, 'Stop the swinging lines to aim · three darts a turn · first to zero wins', cx, py + u * 2.45, u * 0.42, 'rgba(255,255,255,0.85)', 700);
    const rows = menuRows();
    const labelX = px + u * 0.9, pillsR = px + pw - u * 0.9;
    const rowY = (i) => py + u * 3.7 + i * u * 1.45;
    const rowDefs = [
      { id: 'people', label: '🙂 People', items: ['1', '2', '3', '4'], sel: people - 1, ok: () => true },
      { id: 'tv', label: '📺 TV players', items: ['0', '1', '2', '3'], sel: tvs, ok: (i) => i <= 4 - people },
      { id: 'skill', label: '🎯 Skill', items: SKILLS.map((s) => s.name), sel: skill, ok: () => true },
      { id: 'mode', label: '🕑 Game', items: [skill === 0 ? '101' : '301', 'Around the Clock'], sel: mode, ok: () => true },
    ];
    rowDefs.forEach((r, i) => {
      const y = rowY(i), focus = rows[menuRow] === r.id;
      if (focus) { roundRect(c, px + u * 0.4, y - u * 0.65, pw - u * 0.8, u * 1.3, u * 0.4); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(); }
      text(c, r.label, labelX, y, u * 0.55, focus ? '#ffe36b' : '#ffffff', 800, 'left');
      const widths = r.id === 'skill' ? r.items.map(() => u * 3.3) : r.id === 'mode' ? [u * 3.3, u * 6.85] : r.items.map(() => u * 1.5);
      const gap = u * 0.25, ph2 = u * 0.92;
      const total = widths.reduce((s, v) => s + v, 0) + (r.items.length - 1) * gap;
      let x = pillsR - total;
      r.items.forEach((lab, j) => {
        pill(c, x, y - ph2 / 2, widths[j], ph2, lab, j === r.sel, focus, !r.ok(j), t);
        hits.push({ x, y: y - ph2 / 2, w: widths[j], h: ph2, act: r.id, v: r.id === 'people' ? j + 1 : j });
        x += widths[j] + gap;
      });
    });
    const tip = mode === 1 ? 'Hit 1, 2, 3 … 20 in order, then the bull' : SKILLS[skill].tip;
    text(c, tip, cx, rowY(3) + u * 0.9, u * 0.4, 'rgba(255,220,180,0.9)', 700);
    const n = people + tvs, sy = rowY(4) + u * 0.25, stepX = u * 2.6;
    let tvN = 0;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * stepX, bob = Math.sin(t * 4 + i) * u * 0.08;
      const isH = i < people; if (!isH) tvN++;
      c.drawImage(dartIcon(SEAT_C[i], Math.round(u * 0.9)), x - u * 0.45, sy - u * 0.6 + bob, u * 0.9, u * 0.9);
      text(c, isH ? (people === 1 ? 'You' : `Player ${i + 1}`) : (tvs === 1 ? 'TV' : `TV ${tvN}`), x, sy + u * 0.55, u * 0.36, 'rgba(255,255,255,0.9)', 800);
    }
    const bw = u * 5, bh = u * 1.15, by2 = rowY(4) + u * 1.45;
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
    text(c, Kit.touchFirst() ? 'Tap to choose · tap Play' : '▲ ▼ choose  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - u * 0.55, u * 0.38, 'rgba(255,255,255,0.7)', 700);
    const wb = u * 3.6, wh = u * 0.7;
    roundRect(c, cx - wb / 2, py - wh / 2, wb, wh, wh / 2);
    c.fillStyle = '#3b1a09'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, `🎯 Wins: ${wins}`, cx, py, u * 0.4, '#ffd23f', 800);
    c.restore();
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    if (scene.width) c.drawImage(scene, 0, 0, W, H); else { c.fillStyle = '#1a0d07'; c.fillRect(0, 0, W, H); }
    if (boardPulse > 0) { c.fillStyle = `rgba(255,240,200,${boardPulse * 0.08})`; c.beginPath(); c.arc(L.cx, L.cy, L.R, 0, TAU); c.fill(); }
    if (state === 'play' || state === 'over') { drawPlay(c, t); drawPanels(c, t); drawBanner(c, t); }
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c, t);
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run((dt) => { try { update(dt); } catch (e) { console.error(e); } }, (c, t) => { try { draw(c, t); } catch (e) { console.error(e); } });
  layout(Kit.W, Kit.H);
  Kit.canvas.focus();
  if (wins > 0) Kit.record(ID, wins);
})();
