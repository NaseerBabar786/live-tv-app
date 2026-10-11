// Sea Battle: hide your fleet on a 10 x 10 sea (ships of 5, 4, 3, 3 and 2), then take turns firing at the
// other sea to find and sink every ship. A hit lets you fire again. Person vs TV, or person vs person with a
// pass-the-remote cover screen (each person places their ships privately; Auto-place does it for you).
// Remote: arrows aim, OK fires. Beginner: a smaller 8 x 8 sea with 4 ships and a TV that fires at random;
// Hard: the TV hunts on a checkerboard and follows up every hit.
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const ID = 'seabattle';
  const AUTO = /auto/.test(location.hash);
  const SPEED = AUTO ? 8 : 1;
  const COLORS = ['#ff5a6e', '#38b6ff'];
  const SKILLS = [
    { name: 'Beginner', tip: '8 x 8 sea  ·  4 ships  ·  the TV fires at random', n: 8, fleet: [4, 3, 3, 2] },
    { name: 'Normal', tip: '10 x 10 sea  ·  5 ships  ·  the TV follows up its hits', n: 10, fleet: [5, 4, 3, 3, 2] },
    { name: 'Hard', tip: '10 x 10 sea  ·  the TV hunts smartly', n: 10, fleet: [5, 4, 3, 3, 2] },
  ];
  const SHIP_NAMES = { 5: 'Carrier', 4: 'Battleship', 3: 'Cruiser', 2: 'Patrol boat' };
  const LETTERS = 'ABCDEFGHIJ';
  let warned = false;
  const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { if (!warned) { warned = true; console.error(e); } } };

  // ---------- Setup (remembered) ----------
  const saved = Kit.store.get(ID + '.setup', null) || {};
  const seatHuman = [true, false];
  if (Array.isArray(saved.h)) for (let i = 0; i < 2; i++) seatHuman[i] = !!saved.h[i];
  if (!seatHuman.some(Boolean)) seatHuman[0] = true;
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, 2);
  let wins = Kit.store.get(ID + '.wins', 0) | 0;
  function saveSetup() { Kit.store.set(ID + '.setup', { h: seatHuman.slice() }); Kit.store.set(ID + '.skill', skill); }

  // ---------- State ----------
  // state: 'menu', 'place', 'battle', 'over'
  let state = 'menu', stateT = 0, menuRow = 2, seatIx = 1, overT = 0, overBtn = 0;
  let N = 10, FLEET = [5, 4, 3, 3, 2], players = [], humans = 1, turn = 0, revealed = -1, winner = -1;
  let phase = 'idle', phaseT = 0, timers = [], shell = null, ripples = [], think = 0.8, tvAim = null;
  let placer = 0, pcur = { x: 0, y: 0 }, vert = false, pfocus = 'grid', pbtn = 0, msg = '', msgT = 0, nopeT = 0;
  let bannerName = '', bannerCol = '#fff', gamesDone = 0;

  const idx = (x, y) => y * N + x;
  const after = (sec, fn) => timers.push({ t: sec, fn });
  function setPhase(p) { phase = p; phaseT = 0; }
  function say(s, t = 2.4) { msg = s; msgT = t; }
  const other = (i) => 1 - i;
  const viewer = () => (humans === 0 ? 0 : humans === 1 ? players.findIndex((p) => p.human) : revealed);

  function newSide(human, i, hcount) {
    return {
      human, color: COLORS[i], name: human ? (hcount === 1 ? 'You' : 'Player ' + (i + 1)) : 'TV',
      ships: [], occ: new Int8Array(N * N).fill(-1), shots: new Uint8Array(N * N), aim: { x: N >> 1, y: N >> 1 }, fired: 0, hits: 0,
    };
  }
  function canPlace(side, len, x, y, v) {
    for (let k = 0; k < len; k++) {
      const cx = x + (v ? 0 : k), cy = y + (v ? k : 0);
      if (cx < 0 || cy < 0 || cx >= N || cy >= N) return false;
      if (side.occ[idx(cx, cy)] >= 0) return false;
    }
    return true;
  }
  function placeShip(side, len, x, y, v) {
    const ship = { len, x, y, v, hits: 0, sunk: false, sunkT: -9, cells: [] };
    const si = side.ships.length;
    for (let k = 0; k < len; k++) { const cx = x + (v ? 0 : k), cy = y + (v ? k : 0); ship.cells.push([cx, cy]); side.occ[idx(cx, cy)] = si; }
    side.ships.push(ship);
  }
  function clearShips(side) { side.ships = []; side.occ.fill(-1); }
  function autoPlace(side) {
    for (let attempt = 0; attempt < 50; attempt++) {
      clearShips(side);
      let ok = true;
      for (const len of FLEET) {
        let placed = false;
        for (let t = 0; t < 300 && !placed; t++) {
          const v = Math.random() < 0.5, x = Math.floor(Math.random() * N), y = Math.floor(Math.random() * N);
          if (canPlace(side, len, x, y, v)) { placeShip(side, len, x, y, v); placed = true; }
        }
        if (!placed) { ok = false; break; }
      }
      if (ok) return;
    }
  }
  const nextLen = (side) => FLEET[side.ships.length];

  // ---------- Sounds ----------
  const sndSplash = () => { Kit.noise({ dur: 0.5, vol: 0.28, freq: 1400, q: 0.7, sweep: 0.3 }); Kit.tone(300, { type: 'sine', dur: 0.2, vol: 0.12, slide: 0.5 }); };
  const sndBoom = () => { Kit.noise({ dur: 0.7, vol: 0.5, freq: 500, q: 0.6, type: 'lowpass', sweep: 0.3 }); Kit.tone(90, { type: 'sine', dur: 0.5, vol: 0.45, slide: 0.4 }); };
  const sndWhistle = () => Kit.tone(1500, { type: 'sine', dur: 0.5, vol: 0.06, slide: 0.45 });
  const sndPlace = () => { Kit.tone(220, { type: 'triangle', dur: 0.12, vol: 0.2, slide: 0.7 }); Kit.noise({ dur: 0.18, vol: 0.12, freq: 900, q: 1 }); };
  const sndSunk = () => { [0, 1, 2, 3].forEach((i) => Kit.tone([392, 330, 262, 196][i], { type: 'square', dur: 0.22, vol: 0.07, at: 0.15 + i * 0.12 })); };

  // ---------- Game flow ----------
  function startGame() {
    saveSetup();
    N = SKILLS[skill].n; FLEET = SKILLS[skill].fleet.slice();
    const hcount = seatHuman.filter(Boolean).length;
    humans = AUTO ? 0 : hcount;
    players = [0, 1].map((i) => newSide(!AUTO && seatHuman[i], i, hcount));
    if (!players[0].human && !players[1].human && !AUTO) players[0].human = true;
    if (humans === 1 && players[1].human) players[1].name = 'You';
    timers = []; shell = null; ripples = []; winner = -1; revealed = -1; msg = '';
    stateT = 0; state = 'place';
    layout(Kit.W, Kit.H);
    players.forEach((p) => { if (!p.human) autoPlace(p); });
    beginPlacing(players.findIndex((p) => p.human && !p.ships.length));
  }
  function toMenu() { state = 'menu'; stateT = 0; players = []; timers = []; shell = null; ripples = []; }

  function beginPlacing(i) {
    if (i < 0) { startBattle(); return; }
    placer = i; vert = false; pcur = { x: 0, y: 0 };
    pfocus = skill === 0 ? 'panel' : 'grid'; pbtn = 1;
    state = 'place';
    if (humans > 1) { revealed = -1; setPhase('cover'); } else { revealed = i; setPhase('placing'); }
  }
  function finishPlacing() {
    const next = players.findIndex((p, k) => k !== placer && p.human && p.ships.length < FLEET.length);
    revealed = -1;
    Kit.sfx.chime();
    if (next >= 0) beginPlacing(next); else startBattle();
  }
  function startBattle() {
    state = 'battle'; stateT = 0;
    beginTurn(0);
  }
  function beginTurn(i) {
    if (state !== 'battle') return;
    turn = i;
    const p = players[i];
    if (p.human && humans > 1 && revealed !== i) { revealed = -1; msg = ''; setPhase('cover'); return; }
    bannerName = p.name === 'You' ? 'Your turn - fire!' : p.human ? `${p.name}'s turn` : 'TV is aiming…';
    bannerCol = p.color;
    Kit.tone(620, { type: 'triangle', dur: 0.12, vol: 0.12, slide: 1.3 });
    setPhase('banner');
  }
  function startActing() {
    const p = players[turn];
    if (p.human) { if (humans > 1) revealed = turn; setPhase('aim'); }
    else { tvAim = null; setPhase('tv'); think = (skill === 0 ? 0.8 : 0.6) * (0.8 + Math.random() * 0.5); }
  }

  function fire(a, x, y) {
    const att = players[a], def = players[other(a)];
    const k = idx(x, y);
    if (att.shots[k]) return false;
    att.aim = { x, y };
    setPhase('shell');
    const to = cellCenter(boardOf(other(a)), x, y);
    const from = boardOf(a) === boardOf(other(a)) ? { x: Kit.W / 2, y: Kit.H + 40 } : boardMid(boardOf(a));
    shell = { from, to, t: 0, dur: 0.6, a, x, y };
    sndWhistle();
    return true;
  }
  function land() {
    const { a, x, y, to } = shell;
    shell = null;
    const att = players[a], def = players[other(a)];
    const k = idx(x, y), si = def.occ[k];
    att.fired++;
    if (si >= 0) {
      const ship = def.ships[si];
      ship.hits++; att.hits++;
      att.shots[k] = 2;
      sndBoom();
      Kit.burst(to.x, to.y, '#ffb020', 24, 1.1); Kit.burst(to.x, to.y, '#ff4d00', 16, 0.8); Kit.burst(to.x, to.y, '#5a5a66', 8, 0.5);
      Kit.shake(10, 0.35);
      ripples.push({ x: to.x, y: to.y, t: 0, col: '255,170,60' });
      if (ship.hits >= ship.len) {
        ship.sunk = true; ship.sunkT = stateT;
        ship.cells.forEach(([cx, cy]) => { att.shots[idx(cx, cy)] = 3; const p = cellCenter(boardOf(other(a)), cx, cy); Kit.burst(p.x, p.y, '#ff7a1a', 10, 0.8); });
        sndSunk();
        Kit.float(`Sunk! ${SHIP_NAMES[ship.len]}`, to.x, to.y - L.cell, { color: '#ffd23f', size: L.u * 1.0, life: 1.8, big: true });
        if (def.ships.every((s) => s.sunk)) { after(1.4, () => finishGame(a)); setPhase('wait'); return; }
      } else Kit.float('Hit!', to.x, to.y - L.cell * 0.6, { color: '#ff9f5a', size: L.u * 0.9 });
      say(att.human ? 'A hit! Fire again' : `The TV hit your ${SHIP_NAMES[ship.len]}! It fires again`, 2);
      setPhase('wait');
      after(ship.sunk ? 1.3 : 0.9, () => { if (att.human) setPhase('aim'); else { tvAim = null; setPhase('tv'); think = 0.5 + Math.random() * 0.3; } });
    } else {
      att.shots[k] = 1;
      sndSplash();
      Kit.burst(to.x, to.y, '#bfe8ff', 18, 0.7); Kit.burst(to.x, to.y, '#ffffff', 10, 0.5);
      ripples.push({ x: to.x, y: to.y, t: 0, col: '200,240,255' });
      Kit.float('Splash', to.x, to.y - L.cell * 0.6, { color: '#bfe8ff', size: L.u * 0.7 });
      setPhase('wait');
      after(1.1, () => { if (humans > 1) revealed = -1; beginTurn(other(a)); });
    }
  }

  function finishGame(w) {
    if (state !== 'battle') return;
    gamesDone++;
    winner = w; state = 'over'; overT = stateT; overBtn = 0;
    if (humans > 1) revealed = w;
    const p = players[w];
    if (p.human) {
      wins++;
      Kit.store.set(ID + '.wins', wins);
      Kit.record(ID, wins);
      Kit.confetti(170); Kit.sfx.win();
    } else if (humans > 0) Kit.sfx.over(); else Kit.sfx.chime();
  }

  // ---------- The TV's aim ----------
  function tvTarget(a) {
    const s = players[a].shots;
    const free = (x, y) => x >= 0 && y >= 0 && x < N && y < N && !s[idx(x, y)];
    const all = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (free(x, y)) all.push({ x, y });
    if (!all.length) return null;
    const pickOf = (arr) => arr[Math.floor(Math.random() * arr.length)];
    if (skill === 0) return pickOf(all);
    // Follow up hits on ships that are not sunk yet.
    const hits = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (s[idx(x, y)] === 2) hits.push({ x, y });
    if (hits.length) {
      const line = [];
      for (const h of hits) {
        for (const [dx, dy] of [[1, 0], [0, 1]]) {
          if (s[idx(h.x + dx, h.y + dy)] === 2 && h.x + dx < N && h.y + dy < N) {
            // walk both ways along this line to the first free cell
            for (const sg of [1, -1]) {
              let x = h.x, y = h.y;
              while (x >= 0 && y >= 0 && x < N && y < N && s[idx(x, y)] === 2) { x += dx * sg; y += dy * sg; }
              if (free(x, y)) line.push({ x, y });
            }
          }
        }
      }
      if (line.length) return pickOf(line);
      const near = [];
      for (const h of hits) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(h.x + dx, h.y + dy)) near.push({ x: h.x + dx, y: h.y + dy });
      if (near.length && (skill === 2 || Math.random() < 0.85)) return pickOf(near);
    }
    if (skill === 2) {
      // Checkerboard hunt, spaced for the smallest ship still afloat.
      const left = players[other(a)].ships.filter((sh) => !sh.sunk).map((sh) => sh.len);
      const gap = Math.max(2, Math.min(...left, 5));
      const even = all.filter((c) => (c.x + c.y) % gap === 0);
      if (even.length) return pickOf(even);
    }
    return pickOf(all);
  }

  // ---------- Keys and taps ----------
  function fixSeats() { if (!seatHuman.some(Boolean)) seatHuman[0] = true; }
  function toggleSeat(i) {
    seatHuman[i] = !seatHuman[i];
    if (!seatHuman.some(Boolean)) { seatHuman[i] = true; Kit.sfx.nope(); return; }
    Kit.sfx.pick(); saveSetup();
  }
  function menuKey(k) {
    if (k === 'up') { menuRow = (menuRow + 2) % 3; Kit.sfx.move(); return; }
    if (k === 'down') { menuRow = (menuRow + 1) % 3; Kit.sfx.move(); return; }
    if (k === 'ok') { if (menuRow === 0) toggleSeat(seatIx); else startGame(); return; }
    const d = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    if (!d) return;
    if (menuRow === 0) { seatIx = 1 - seatIx; Kit.sfx.move(); }
    else if (menuRow === 1) { skill = clamp(skill + d, 0, 2); Kit.sfx.move(); saveSetup(); }
  }

  // Placing: the ghost ship's anchor, kept inside the sea.
  function ghost() {
    const side = players[placer], len = nextLen(side) || 0;
    const x = clamp(pcur.x, 0, vert ? N - 1 : N - len), y = clamp(pcur.y, 0, vert ? N - len : N - 1);
    return { len, x, y, ok: len > 0 && canPlace(side, len, x, y, vert) };
  }
  const PBTNS = ['Rotate', 'Auto-place', 'Clear', 'Ready!'];
  function placeKey(k) {
    const side = players[placer];
    const all = side.ships.length >= FLEET.length;
    if (pfocus === 'panel') {
      if (k === 'up') { pbtn = (pbtn + 3) % 4; Kit.sfx.move(); }
      else if (k === 'down') { pbtn = (pbtn + 1) % 4; Kit.sfx.move(); }
      else if (k === 'left') { pfocus = 'grid'; Kit.sfx.move(); }
      else if (k === 'ok') pressBtn(pbtn);
      return;
    }
    const g = ghost();
    pcur.x = g.x; pcur.y = g.y;
    if (k === 'left') { pcur.x = Math.max(0, pcur.x - 1); Kit.sfx.move(); }
    else if (k === 'up') { pcur.y = Math.max(0, pcur.y - 1); Kit.sfx.move(); }
    else if (k === 'down') { pcur.y = Math.min(N - 1, pcur.y + 1); Kit.sfx.move(); }
    else if (k === 'right') {
      const maxX = vert || all ? N - 1 : N - g.len;
      if (pcur.x >= maxX) { pfocus = 'panel'; pbtn = all ? 3 : 0; } else pcur.x++;
      Kit.sfx.move();
    } else if (k === 'ok') {
      if (all) { pfocus = 'panel'; pbtn = 3; return; }
      if (!g.ok) { Kit.sfx.nope(); nopeT = 0.35; say('That spot is taken - move or rotate the ship', 2); return; }
      placeShip(side, g.len, g.x, g.y, vert);
      sndPlace();
      const p = cellCenter(boardOf(placer), g.x + (vert ? 0 : (g.len - 1) / 2), g.y + (vert ? (g.len - 1) / 2 : 0));
      Kit.burst(p.x, p.y, '#bfe8ff', 14, 0.6);
      if (side.ships.length >= FLEET.length) { pfocus = 'panel'; pbtn = 3; say('Fleet ready! Press OK on Ready', 3); }
    }
  }
  function pressBtn(b) {
    const side = players[placer];
    if (b === 0) { vert = !vert; Kit.sfx.pick(); if (side.ships.length < FLEET.length) pfocus = 'grid'; }
    else if (b === 1) { autoPlace(side); sndPlace(); Kit.sfx.chime(); pbtn = 3; say('Ships placed! Press OK on Ready, or Auto-place again', 3); }
    else if (b === 2) { clearShips(side); Kit.sfx.pick(); pfocus = 'grid'; pcur = { x: 0, y: 0 }; }
    else if (b === 3) {
      if (side.ships.length < FLEET.length) { Kit.sfx.nope(); say('Place every ship first (or choose Auto-place)', 2.5); return; }
      finishPlacing();
    }
  }

  function aimKey(k) {
    const p = players[turn];
    const a = p.aim;
    if (k === 'left') a.x = Math.max(0, a.x - 1);
    else if (k === 'right') a.x = Math.min(N - 1, a.x + 1);
    else if (k === 'up') a.y = Math.max(0, a.y - 1);
    else if (k === 'down') a.y = Math.min(N - 1, a.y + 1);
    else if (k === 'ok') {
      if (p.shots[idx(a.x, a.y)]) { Kit.sfx.nope(); nopeT = 0.35; say('Already fired there - pick a new square', 2); return; }
      fire(turn, a.x, a.y);
      return;
    }
    Kit.sfx.move();
  }

  function coverOk() {
    Kit.sfx.pick();
    if (state === 'place') { revealed = placer; setPhase('placing'); }
    else { revealed = turn; startActing(); }
  }

  Kit.onKeys(guard((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { menuKey(k); return; }
    if (state === 'over') {
      if (stateT - overT < 1.2) return;
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { overBtn = 1 - overBtn; Kit.sfx.move(); }
      else if (k === 'ok') { if (overBtn === 0) startGame(); else toMenu(); }
      return;
    }
    if (phase === 'cover') { if (k === 'ok') coverOk(); return; }
    if (state === 'place' && phase === 'placing') { placeKey(k); return; }
    if (state === 'battle' && phase === 'aim' && players[turn].human) aimKey(k);
  }));

  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  let hits = [];
  Kit.onPointer({
    down: guard((e) => { for (let i = hits.length - 1; i >= 0; i--) if (inside(e, hits[i])) { hits[i].fn(e); return; } }),
  });
  let hidden = false;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // ---------- Update ----------
  const update = guard((rdt) => {
    if (hidden) return;
    const dt = rdt * SPEED;
    stateT += dt; phaseT += dt;
    if (msgT > 0) msgT -= rdt;
    if (nopeT > 0) nopeT -= rdt;
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 1.4) ripples.splice(i, 1); }
    for (let i = 0; i < timers.length; i++) {
      timers[i].t -= dt;
      if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); i--; f(); }
    }
    if (AUTO && state === 'over' && stateT - overT > 3) startGame();
    if (state === 'place' && AUTO && phase === 'placing') { autoPlace(players[placer]); finishPlacing(); }
    if (state !== 'battle') return;
    if (phase === 'banner' && phaseT > 0.95) startActing();
    else if (phase === 'tv') {
      const p = players[turn];
      if (!tvAim && phaseT > think * 0.4) {
        const tg = tvTarget(turn);
        if (!tg) { finishGame(other(turn)); return; }
        tvAim = { from: { x: p.aim.x, y: p.aim.y }, to: tg, t: 0 };
      }
      if (tvAim) {
        tvAim.t += dt;
        if (tvAim.t > 0.75) { const tg = tvAim.to; tvAim = null; fire(turn, tg.x, tg.y); }
      }
    } else if (phase === 'shell' && shell) {
      shell.t += dt;
      if (shell.t >= shell.dur) land();
    }
  });

  // ---------- Layout ----------
  let L = { u: 40, S: 400, cell: 40, b: [{ x: 0, y: 0 }, { x: 0, y: 0 }] };
  const boardPic = document.createElement('canvas');
  const wavePic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 32, H / 18);
    const S = Math.min(u * 12, (W - u * 4) / 2);
    const cell = S / N;
    const by = u * 3.7;
    L = { u, S, cell, W, H, b: [{ x: W / 2 - u * 0.9 - S, y: by }, { x: W / 2 + u * 0.9, y: by }] };
    sprites.clear();
    drawBoardPic();
  }
  Kit.onResize(layout);

  // Board 0 = left (the viewer's own fleet), board 1 = right (the target).
  function boardOf(i) { const v = viewer(); return v < 0 ? (i === turn ? 0 : 1) : i === v ? 0 : 1; }
  const cellCenter = (b, x, y) => ({ x: L.b[b].x + (x + 0.5) * L.cell, y: L.b[b].y + (y + 0.5) * L.cell });
  const boardMid = (b) => ({ x: L.b[b].x + L.S / 2, y: L.b[b].y + L.S / 2 });

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
    try { draw(c, w, h); } catch (e) { if (!warned) { warned = true; console.error(e); } }
    sprites.set(k, s);
    return s;
  }

  // The sea: deep water with grid lines, drawn once per size; the waves texture scrolls over it.
  function drawBoardPic() {
    const S = L.S, dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardPic.width = Math.ceil(S * dpr); boardPic.height = Math.ceil(S * dpr);
    let c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    roundRect(c, 0, 0, S, S, L.u * 0.35); c.save(); c.clip();
    let g = c.createRadialGradient(S * 0.4, S * 0.3, S * 0.1, S / 2, S / 2, S * 0.8);
    g.addColorStop(0, '#2a9ad8'); g.addColorStop(0.6, '#136aa8'); g.addColorStop(1, '#0a3f70');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(255,255,255,${0.02 + Math.random() * 0.04})`;
      c.beginPath(); c.ellipse(Math.random() * S, Math.random() * S, 2 + Math.random() * 10, 1 + Math.random() * 2, 0, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = 'rgba(200,235,255,0.22)'; c.lineWidth = 1.5;
    for (let k = 1; k < N; k++) {
      c.beginPath(); c.moveTo(k * L.cell, 0); c.lineTo(k * L.cell, S); c.stroke();
      c.beginPath(); c.moveTo(0, k * L.cell); c.lineTo(S, k * L.cell); c.stroke();
    }
    c.restore();
    // waves
    wavePic.width = Math.ceil(S); wavePic.height = Math.ceil(S);
    c = wavePic.getContext('2d');
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(1.5, L.cell * 0.035); c.lineCap = 'round';
    const rows = N * 2;
    for (let r = 0; r < rows; r++) {
      const y0 = (r + 0.5) * (S / rows);
      for (let k = 0; k < 3; k++) {
        const x0 = ((r * 37 + k * 0.33 * S + (r % 2) * S * 0.15) % S);
        const len = L.cell * (0.5 + ((r * 7 + k * 3) % 5) * 0.12);
        c.beginPath();
        for (let s = 0; s <= 10; s++) { const x = x0 + (s / 10) * len, y = y0 + Math.sin(s / 10 * Math.PI * 2) * L.cell * 0.05; if (s) c.lineTo(x % S, y); else c.moveTo(x % S, y); }
        c.stroke();
      }
    }
  }

  // A grey warship seen from above, drawn lying along +x.
  const shipSprite = (len, cell, sunk) => sprite('ship' + len + (sunk ? 's' : ''), len * cell, cell, (c, w, h) => {
    const m = h * 0.16;
    c.beginPath();
    c.moveTo(m * 1.4, m); c.lineTo(w - h * 0.95, m);
    c.quadraticCurveTo(w - m * 0.3, m * 1.3, w - m * 0.4, h / 2);
    c.quadraticCurveTo(w - m * 0.3, h - m * 1.3, w - h * 0.95, h - m);
    c.lineTo(m * 1.4, h - m); c.quadraticCurveTo(m * 0.3, h - m, m * 0.4, h / 2); c.quadraticCurveTo(m * 0.3, m, m * 1.4, m);
    c.closePath();
    c.save(); c.shadowColor = 'rgba(0,10,30,0.55)'; c.shadowBlur = h * 0.18; c.shadowOffsetY = h * 0.08;
    let g = c.createLinearGradient(0, m, 0, h - m);
    if (sunk) { g.addColorStop(0, '#a07070'); g.addColorStop(0.5, '#6b3c3c'); g.addColorStop(1, '#3a1d1d'); }
    else { g.addColorStop(0, '#e8eef6'); g.addColorStop(0.45, '#9eacbf'); g.addColorStop(1, '#4d5b70'); }
    c.fillStyle = g; c.fill(); c.restore();
    c.lineWidth = Math.max(1, h * 0.03); c.strokeStyle = sunk ? '#2a1010' : '#2c3646'; c.stroke();
    // deck
    c.fillStyle = sunk ? 'rgba(80,40,40,0.8)' : '#b9c5d4';
    roundRect(c, m * 2, h * 0.36, w - h * 1.5, h * 0.28, h * 0.1); c.fill();
    // bridge
    const bx = w * 0.42, bw = Math.max(h * 0.55, w * 0.14);
    g = c.createLinearGradient(0, h * 0.28, 0, h * 0.72);
    g.addColorStop(0, sunk ? '#7a5050' : '#ffffff'); g.addColorStop(1, sunk ? '#3a2020' : '#7d8ba0');
    c.fillStyle = g; roundRect(c, bx - bw / 2, h * 0.28, bw, h * 0.44, h * 0.1); c.fill();
    c.strokeStyle = sunk ? '#2a1010' : '#3a4658'; c.lineWidth = Math.max(1, h * 0.025); c.stroke();
    c.fillStyle = sunk ? '#301010' : '#2a3a55'; c.fillRect(bx - bw * 0.3, h * 0.4, bw * 0.6, h * 0.08);
    // turrets with barrels toward the bow
    const turrets = len >= 4 ? [0.18, 0.7, 0.85] : len === 3 ? [0.2, 0.75] : [0.72];
    turrets.forEach((f) => {
      const tx = w * f, ty = h / 2;
      c.strokeStyle = sunk ? '#2a1010' : '#39465a'; c.lineWidth = h * 0.07;
      c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + h * 0.36, ty); c.stroke();
      const tg = c.createRadialGradient(tx - h * 0.05, ty - h * 0.05, 1, tx, ty, h * 0.16);
      tg.addColorStop(0, sunk ? '#8a6060' : '#f4f7fb'); tg.addColorStop(1, sunk ? '#3a1d1d' : '#66758b');
      c.fillStyle = tg; c.beginPath(); c.arc(tx, ty, h * 0.15, 0, Math.PI * 2); c.fill();
    });
    if (len === 5) { // carrier stripe
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.setLineDash([h * 0.15, h * 0.12]); c.lineWidth = h * 0.04;
      c.beginPath(); c.moveTo(m * 2.5, h * 0.5); c.lineTo(w * 0.32, h * 0.5); c.stroke(); c.setLineDash([]);
    }
    // shine
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(1, h * 0.04); c.lineCap = 'round';
    c.beginPath(); c.moveTo(m * 2, m * 1.5); c.lineTo(w - h * 1.1, m * 1.5); c.stroke();
  });

  function drawShip(c, b, ship, alpha, sunk, tint) {
    const { x, y, v, len } = ship;
    const cell = L.cell, img = shipSprite(len, cell, sunk);
    const p0 = { x: L.b[b].x + x * cell, y: L.b[b].y + y * cell };
    c.save(); c.globalAlpha = alpha;
    if (v) { c.translate(p0.x + cell, p0.y); c.rotate(Math.PI / 2); c.drawImage(img, 0, 0, len * cell, cell); }
    else c.drawImage(img, p0.x, p0.y, len * cell, cell);
    if (tint) {
      c.globalAlpha = alpha * 0.5; c.fillStyle = tint;
      if (v) roundRect(c, 0, 0, len * cell, cell, cell * 0.3); else roundRect(c, p0.x, p0.y, len * cell, cell, cell * 0.3);
      c.fill();
    }
    c.restore();
  }

  // ---------- Drawing helpers ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function fitText(c, str, x, y, size, color, maxW, weight = 800, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    const w = c.measureText(str).width;
    if (w > maxW && w > 0) size *= maxW / w;
    text(c, str, x, y, size, color, weight, align, font);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `700 ${Math.round(size)}px ${Kit.FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(2,14,36,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, top = '#1d4f8a', bottom = '#0a2346') {
    roundRect(c, x, y + 6, w, h, r); c.fillStyle = 'rgba(0,0,20,0.35)'; c.fill();
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }
  function button(c, label, x, y, w, h, on, t, enabled = true, colors = ['#7dffb0', '#13b86a']) {
    const k = on ? 1.06 + Math.sin(t * 5) * 0.015 : 1;
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    c.globalAlpha = enabled ? 1 : 0.45;
    roundRect(c, -w / 2, -h / 2, w, h, h / 2);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, on ? colors[0] : 'rgba(255,255,255,0.16)'); g.addColorStop(1, on ? colors[1] : 'rgba(255,255,255,0.05)');
    c.fillStyle = g; c.fill();
    c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.3)'; c.stroke();
    fitText(c, label, 0, h * 0.03, h * 0.46, on ? '#04220f' : '#ffffff', w * 0.86, 900);
    c.restore();
  }
  function drawAvatarIcon(c, human, x, y, r) {
    c.save(); c.fillStyle = 'rgba(255,255,255,0.95)'; c.strokeStyle = 'rgba(255,255,255,0.95)';
    if (human) {
      c.beginPath(); c.arc(x, y - r * 0.22, r * 0.28, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(x, y + r * 0.45, r * 0.48, r * 0.3, 0, Math.PI, 0); c.fill();
    } else {
      roundRect(c, x - r * 0.5, y - r * 0.38, r, r * 0.66, r * 0.12); c.lineWidth = r * 0.12; c.stroke();
      c.beginPath(); c.moveTo(x - r * 0.22, y + r * 0.5); c.lineTo(x + r * 0.22, y + r * 0.5); c.stroke();
      c.beginPath(); c.arc(x - r * 0.18, y - r * 0.06, r * 0.08, 0, Math.PI * 2); c.arc(x + r * 0.18, y - r * 0.06, r * 0.08, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  // A board: sea, labels, title; ships and shot markers are drawn by the caller.
  function drawSea(c, b, t, title, col, active) {
    const { x, y } = L.b[b], S = L.S, u = L.u;
    // frame
    roundRect(c, x - u * 0.2, y - u * 0.2 + 6, S + u * 0.4, S + u * 0.4, u * 0.5); c.fillStyle = 'rgba(0,0,20,0.4)'; c.fill();
    roundRect(c, x - u * 0.2, y - u * 0.2, S + u * 0.4, S + u * 0.4, u * 0.5);
    const g = c.createLinearGradient(0, y, 0, y + S);
    g.addColorStop(0, '#c9d6e6'); g.addColorStop(1, '#6b7d96');
    c.fillStyle = g; c.fill();
    if (active) {
      const p = 0.5 + Math.sin(t * 5) * 0.5;
      c.save(); c.shadowColor = col; c.shadowBlur = 20 + p * 14; c.lineWidth = 5; c.strokeStyle = col;
      roundRect(c, x - u * 0.24, y - u * 0.24, S + u * 0.48, S + u * 0.48, u * 0.52); c.stroke(); c.restore();
    }
    c.drawImage(boardPic, x, y, S, S);
    // scrolling waves
    c.save(); roundRect(c, x, y, S, S, u * 0.35); c.clip();
    c.globalAlpha = 0.22;
    const off = (t * L.cell * 0.35) % S;
    c.drawImage(wavePic, x + off - S, y, S, S); c.drawImage(wavePic, x + off, y, S, S);
    c.globalAlpha = 0.12;
    const off2 = (t * L.cell * 0.2) % S;
    c.drawImage(wavePic, x - off2, y + L.cell * 0.25, S, S); c.drawImage(wavePic, x - off2 + S, y + L.cell * 0.25, S, S);
    c.globalAlpha = 1;
    c.restore();
    // labels
    const ls = Math.min(u * 0.42, L.cell * 0.42);
    for (let k = 0; k < N; k++) {
      text(c, LETTERS[k], x + (k + 0.5) * L.cell, y - u * 0.55, ls, 'rgba(255,255,255,0.7)', 800);
      text(c, String(k + 1), x - u * 0.55, y + (k + 0.5) * L.cell, ls, 'rgba(255,255,255,0.7)', 800);
    }
    fitText(c, title, x + S / 2, y - u * 1.3, u * 0.62, col, S, 900, 'center', Kit.FONT);
  }

  function drawMarkers(c, b, shots, t) {
    const cell = L.cell;
    for (let yy = 0; yy < N; yy++) for (let xx = 0; xx < N; xx++) {
      const v = shots[idx(xx, yy)];
      if (!v) continue;
      const p = cellCenter(b, xx, yy);
      if (v === 1) {
        c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, cell * 0.3, 0, Math.PI * 2); c.stroke();
        const g = c.createRadialGradient(p.x - cell * 0.05, p.y - cell * 0.05, 1, p.x, p.y, cell * 0.17);
        g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#a9d6f0');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, cell * 0.15, 0, Math.PI * 2); c.fill();
      } else {
        const f = 0.85 + Math.sin(t * 12 + xx * 3 + yy * 7) * 0.15;
        c.fillStyle = 'rgba(255,90,20,0.35)'; c.beginPath(); c.arc(p.x, p.y, cell * 0.42 * f, 0, Math.PI * 2); c.fill();
        const g = c.createRadialGradient(p.x, p.y - cell * 0.05, 1, p.x, p.y, cell * 0.28 * f);
        g.addColorStop(0, '#fff6b0'); g.addColorStop(0.4, '#ffb020'); g.addColorStop(1, 'rgba(230,40,20,0.9)');
        c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, cell * 0.26 * f, 0, Math.PI * 2); c.fill();
        // flame tip
        c.fillStyle = 'rgba(255,200,60,0.9)';
        c.beginPath(); c.moveTo(p.x - cell * 0.12, p.y - cell * 0.05); c.quadraticCurveTo(p.x, p.y - cell * (0.45 + 0.1 * Math.sin(t * 9 + xx)), p.x + cell * 0.12, p.y - cell * 0.05); c.fill();
        if (v === 3) { c.fillStyle = 'rgba(40,40,50,0.25)'; c.beginPath(); c.arc(p.x + Math.sin(t + xx) * cell * 0.1, p.y - cell * 0.45 - ((t * 0.6 + xx * 0.3) % 1) * cell * 0.4, cell * 0.14, 0, Math.PI * 2); c.fill(); }
      }
    }
  }

  function drawCursor(c, b, x, y, t, col, bad) {
    const p = cellCenter(b, x, y), cell = L.cell, u = L.u;
    const { x: bx, y: by } = L.b[b];
    // row and column guide
    c.fillStyle = 'rgba(255,255,255,0.07)';
    c.fillRect(bx, by + y * cell, L.S, cell); c.fillRect(bx + x * cell, by, cell, L.S);
    const pulse = 0.5 + Math.sin(t * 7) * 0.5;
    let sx = 0;
    if (nopeT > 0) sx = Math.sin(nopeT * 60) * cell * 0.1;
    c.save(); c.translate(p.x + sx, p.y);
    c.shadowColor = bad ? '#ff4d4d' : col; c.shadowBlur = 12 + pulse * 12;
    c.strokeStyle = bad ? '#ff6b6b' : col; c.lineWidth = Math.max(3, cell * 0.07);
    const r = cell * (0.42 + pulse * 0.05);
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.stroke();
    c.beginPath();
    c.moveTo(-r * 1.25, 0); c.lineTo(-r * 0.45, 0); c.moveTo(r * 0.45, 0); c.lineTo(r * 1.25, 0);
    c.moveTo(0, -r * 1.25); c.lineTo(0, -r * 0.45); c.moveTo(0, r * 0.45); c.lineTo(0, r * 1.25);
    c.stroke();
    c.restore();
    text(c, `${LETTERS[x]}${y + 1}`, p.x, p.y + cell * 0.72 > by + L.S ? p.y - cell * 0.72 : p.y + cell * 0.72, u * 0.36, '#ffffff', 900);
  }

  function drawFleetStatus(c, b, side, t, label) {
    const { x, y } = L.b[b], S = L.S, u = L.u;
    const yy = y + S + u * 0.9, h = u * 0.55;
    let total = side.ships.length ? side.ships.reduce((s, sh) => s + sh.len, 0) : FLEET.reduce((s, l) => s + l, 0);
    const list = side.ships.length ? side.ships : FLEET.map((len) => ({ len, sunk: false }));
    const gap = u * 0.25, unit = Math.min(h * 1.2, (S - gap * (list.length - 1) - u * 2.4) / total);
    let xx = x + u * 2.4;
    text(c, label, x, yy, u * 0.38, 'rgba(255,255,255,0.75)', 800, 'left');
    list.forEach((sh) => {
      const w = sh.len * unit;
      c.globalAlpha = sh.sunk ? 0.45 : 1;
      c.drawImage(shipSprite(sh.len, L.cell, sh.sunk), xx, yy - h / 2, w, h);
      if (sh.sunk) { c.strokeStyle = '#ff4d4d'; c.lineWidth = 3; c.beginPath(); c.moveTo(xx, yy); c.lineTo(xx + w, yy); c.stroke(); }
      c.globalAlpha = 1;
      xx += w + gap;
    });
  }

  // ---------- Draw ----------
  const draw = guard((c, t) => {
    const W = Kit.W, H = Kit.H, u = L.u;
    hits = [];
    Kit.background(c, t, '#0b3a6e', '#031327', 'rgba(80,190,255,0.10)');
    if (state === 'menu') { drawMenu(c, t); return; }
    if (phase === 'cover') { drawCover(c, t); return; }
    const v = viewer();
    if (state === 'place') drawPlacing(c, t);
    else if (v >= 0) drawBattle(c, t, v);
    // shell in flight
    if (shell) {
      const k = clamp(shell.t / shell.dur, 0, 1);
      const x = lerp(shell.from.x, shell.to.x, k), y = lerp(shell.from.y, shell.to.y, k) - Math.sin(k * Math.PI) * u * 3.2;
      const s = u * (0.22 + Math.sin(k * Math.PI) * 0.15);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(lerp(shell.from.x, shell.to.x, k), lerp(shell.from.y, shell.to.y, k), s, s * 0.4, 0, 0, Math.PI * 2); c.fill();
      const g = c.createRadialGradient(x - s * 0.3, y - s * 0.3, 1, x, y, s);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff5a00');
      c.fillStyle = g; c.beginPath(); c.arc(x, y, s, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,200,80,0.35)'; c.beginPath(); c.arc(x, y, s * 2, 0, Math.PI * 2); c.fill();
    }
    for (const r of ripples) {
      const k = r.t / 1.4;
      c.strokeStyle = `rgba(${r.col},${0.7 * (1 - k)})`; c.lineWidth = 3;
      c.beginPath(); c.ellipse(r.x, r.y, L.cell * (0.3 + k * 1.2), L.cell * (0.3 + k * 1.2), 0, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.ellipse(r.x, r.y, L.cell * (0.1 + k * 0.7), L.cell * (0.1 + k * 0.7), 0, 0, Math.PI * 2); c.stroke();
    }
    // status line
    let s = '';
    if (msgT > 0 && msg) s = msg;
    else if (state === 'battle' && phase === 'aim') s = Kit.touchFirst() ? 'Tap a square to fire' : 'Arrows aim  ·  OK fires  ·  a hit fires again';
    else if (state === 'battle' && (phase === 'tv' || phase === 'banner') && !players[turn].human) s = 'The TV is aiming…';
    else if (state === 'place') s = pfocus === 'grid' ? 'Arrows move  ·  OK places the ship  ·  ▶ past the edge for buttons' : '▲▼ choose  ·  OK  ·  ◀ back to the sea';
    if (s) {
      c.font = `800 ${Math.round(u * 0.5)}px ${Kit.UI}`;
      const tw = Math.min(W - u * 2, c.measureText(s).width + u * 1.4);
      roundRect(c, W / 2 - tw / 2, u * 0.45, tw, u * 0.95, u * 0.47); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fill();
      fitText(c, s, W / 2, u * 0.93, u * 0.5, '#ffffff', tw - u * 0.8, 800);
    }
    if (state === 'battle' && phase === 'banner') drawBanner(c, t);
    if (state === 'over') drawOver(c, t);
  });

  function drawBattle(c, t, v) {
    const me = players[v], foe = players[other(v)], u = L.u;
    const attackingMe = state === 'battle' && turn !== v;
    // left: my fleet, with the enemy's shots
    drawSea(c, 0, t, me.name === 'You' ? 'Your fleet' : `${me.name}'s fleet`, me.color, attackingMe && phase !== 'cover');
    me.ships.forEach((sh) => drawShip(c, 0, sh, 1, sh.sunk));
    drawMarkers(c, 0, foe.shots, t);
    // right: the enemy's waters with my shots, sunk ships revealed (all at the end)
    drawSea(c, 1, t, foe.human ? `${foe.name}'s waters` : 'Enemy waters', foe.color, !attackingMe && state === 'battle');
    foe.ships.forEach((sh) => { if (sh.sunk) drawShip(c, 1, sh, 0.95, true); else if (state === 'over') drawShip(c, 1, sh, 0.75, false); });
    drawMarkers(c, 1, me.shots, t);
    // Beginner hint: dots beside hits that are not sunk yet
    if (skill === 0 && state === 'battle' && turn === v && phase === 'aim') {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (me.shots[idx(x, y)] === 2) {
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N || me.shots[idx(nx, ny)]) return;
          const p = cellCenter(1, nx, ny);
          c.fillStyle = `rgba(255,230,120,${0.35 + Math.sin(t * 5) * 0.2})`;
          c.beginPath(); c.arc(p.x, p.y, L.cell * 0.12, 0, Math.PI * 2); c.fill();
        });
      }
    }
    // cursors
    if (state === 'battle') {
      if (turn === v && (phase === 'aim' || phase === 'shell' || phase === 'wait')) {
        if (phase === 'aim') drawCursor(c, 1, me.aim.x, me.aim.y, t, '#ffe14d', !!me.shots[idx(me.aim.x, me.aim.y)]);
      } else if (turn !== v && phase === 'tv' && tvAim) {
        const k = ease.inOut(clamp(tvAim.t / 0.6, 0, 1));
        const x = lerp(tvAim.from.x, tvAim.to.x, k), y = lerp(tvAim.from.y, tvAim.to.y, k);
        const p = cellCenter(0, x, y);
        c.save(); c.strokeStyle = '#ff6b6b'; c.lineWidth = 4; c.shadowColor = '#ff4d4d'; c.shadowBlur = 16;
        c.beginPath(); c.arc(p.x, p.y, L.cell * 0.42, 0, Math.PI * 2); c.stroke();
        c.beginPath(); c.moveTo(p.x - L.cell * 0.55, p.y); c.lineTo(p.x + L.cell * 0.55, p.y); c.moveTo(p.x, p.y - L.cell * 0.55); c.lineTo(p.x, p.y + L.cell * 0.55); c.stroke();
        c.restore();
      }
    }
    // taps on the target sea
    hits.push({ x: L.b[1].x, y: L.b[1].y, w: L.S, h: L.S, fn: (e) => {
      if (state !== 'battle' || phase !== 'aim' || turn !== v || !me.human) return;
      const x = clamp(Math.floor((e.x - L.b[1].x) / L.cell), 0, N - 1), y = clamp(Math.floor((e.y - L.b[1].y) / L.cell), 0, N - 1);
      me.aim = { x, y }; aimKey('ok');
    } });
    drawFleetStatus(c, 0, me, t, 'Afloat:');
    drawFleetStatus(c, 1, foe, t, 'To sink:');
    // scores in the middle
    const mx = Kit.W / 2;
    text(c, 'VS', mx, L.b[0].y + L.S / 2, u * 0.6, 'rgba(255,255,255,0.5)', 900, 'center', Kit.FONT);
  }

  function drawPlacing(c, t) {
    const side = players[placer], u = L.u;
    if (!side || revealed !== placer) return;
    drawSea(c, 0, t, side.name === 'You' ? 'Place your fleet' : `${side.name}: place your fleet`, side.color, pfocus === 'grid');
    side.ships.forEach((sh) => drawShip(c, 0, sh, 1, false));
    const all = side.ships.length >= FLEET.length;
    if (!all) {
      const g = ghost();
      if (pfocus === 'grid' || skill > 0) {
        const pulse = 0.65 + Math.sin(t * 6) * 0.2;
        drawShip(c, 0, { x: g.x, y: g.y, v: vert, len: g.len }, pfocus === 'grid' ? pulse : 0.3, false, g.ok ? null : '#ff3040');
        if (pfocus === 'grid') {
          const { x, y } = L.b[0];
          c.save(); c.lineWidth = 4; c.strokeStyle = g.ok ? '#ffe14d' : '#ff5050'; c.shadowColor = c.strokeStyle; c.shadowBlur = 14;
          roundRect(c, x + g.x * L.cell + 2, y + g.y * L.cell + 2, (vert ? 1 : g.len) * L.cell - 4, (vert ? g.len : 1) * L.cell - 4, L.cell * 0.3); c.stroke(); c.restore();
        }
      }
    }
    hits.push({ x: L.b[0].x, y: L.b[0].y, w: L.S, h: L.S, fn: (e) => {
      pfocus = 'grid';
      pcur = { x: clamp(Math.floor((e.x - L.b[0].x) / L.cell), 0, N - 1), y: clamp(Math.floor((e.y - L.b[0].y) / L.cell), 0, N - 1) };
      placeKey('ok');
    } });
    // the panel on the right
    const px = L.b[1].x, py = L.b[1].y - u * 0.2, pw = L.S, ph = L.S + u * 0.4;
    panel(c, px, py, pw, ph, u * 0.5, pfocus === 'panel' ? '#ffd23f' : 'rgba(255,255,255,0.25)');
    outlined(c, 'Your ships', px + pw / 2, py + u * 0.8, u * 0.7, '#ffffff', '#bfe8ff');
    const listY = py + u * 1.6, rowH = Math.min(u * 0.85, (ph * 0.42) / FLEET.length);
    FLEET.forEach((len, i) => {
      const y = listY + i * rowH;
      const done = i < side.ships.length, cur = i === side.ships.length;
      const sw = len * Math.min(u * 0.75, (pw * 0.45) / 5);
      c.globalAlpha = done ? 1 : cur ? 0.9 + Math.sin(t * 5) * 0.1 : 0.45;
      c.drawImage(shipSprite(len, L.cell, false), px + u * 0.7, y + rowH * 0.12, sw, rowH * 0.76);
      c.globalAlpha = 1;
      text(c, `${SHIP_NAMES[len]} (${len})`, px + u * 0.9 + (pw * 0.45), y + rowH / 2, Math.min(u * 0.42, rowH * 0.5), cur ? '#ffe14d' : '#ffffff', 800, 'left');
      if (done) text(c, '✓', px + pw - u * 0.6, y + rowH / 2, u * 0.5, '#7dffb0', 900);
    });
    const bh = Math.min(u * 0.95, (ph * 0.45) / 4.6), bw = pw * 0.62, bx = px + (pw - bw) / 2;
    const by0 = py + ph - (bh * 1.22) * 4 - u * 0.25;
    PBTNS.forEach((name, i) => {
      const y = by0 + i * bh * 1.22;
      const on = pfocus === 'panel' && pbtn === i;
      const enabled = i !== 3 || all;
      const label = i === 0 ? (vert ? 'Rotate (now ▼)' : 'Rotate (now ▶)') : name;
      button(c, label, bx, y, bw, bh, on, t, enabled, i === 3 ? ['#ffe680', '#f08c00'] : ['#7dffb0', '#13b86a']);
      hits.push({ x: bx, y, w: bw, h: bh, fn: () => { pfocus = 'panel'; pbtn = i; pressBtn(i); } });
    });
  }

  function drawBanner(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const k = phaseT, a = k < 0.25 ? ease.out(k / 0.25) : k > 0.75 ? 1 - ease.inOut(clamp((k - 0.75) / 0.2, 0, 1)) : 1;
    const y = H * 0.5, bh = u * 2.2;
    c.save(); c.globalAlpha = a;
    const g = c.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
    g.addColorStop(0, shade(bannerCol, 0.1)); g.addColorStop(1, shade(bannerCol, -0.5));
    c.fillStyle = g; c.fillRect(0, y - bh / 2, W, bh);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, y - bh / 2, W, 3); c.fillRect(0, y + bh / 2 - 3, W, 3);
    outlined(c, bannerName, W / 2 + (1 - a) * W * 0.3 * (k < 0.5 ? -1 : 1), y, u * 1.2, '#ffffff', shade(bannerCol, 0.55));
    c.restore();
  }

  function drawCover(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const p = players[state === 'place' ? placer : turn];
    if (!p) return;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(p.color, -0.45)); g.addColorStop(1, shade(p.color, -0.85));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    c.save(); c.translate(W / 2, H * 0.3); c.rotate(Math.sin(t * 2) * 0.12);
    roundRect(c, -u * 0.9, -u * 2.2, u * 1.8, u * 4.4, u * 0.8);
    const rg = c.createLinearGradient(-u, 0, u, 0); rg.addColorStop(0, '#3a3f55'); rg.addColorStop(0.5, '#5c6380'); rg.addColorStop(1, '#2a2e40');
    c.fillStyle = rg; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.4)'; c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, -u * 0.6, u * 0.42, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 6; k++) { c.beginPath(); c.arc((k % 2 ? 0.35 : -0.35) * u, u * (0.5 + Math.floor(k / 2) * 0.5), u * 0.13, 0, Math.PI * 2); c.fill(); }
    c.restore();
    outlined(c, `Pass the remote to ${p.name}`, W / 2, H * 0.56, u * 1.15, '#ffffff', shade(p.color, 0.5));
    text(c, state === 'place' ? 'Time to hide your ships - everyone else, look away!' : 'Everyone else, look away from the screen!', W / 2, H * 0.66, u * 0.6, 'rgba(255,255,255,0.9)', 800);
    c.globalAlpha = 0.6 + Math.sin(t * 5) * 0.4;
    text(c, Kit.touchFirst() ? 'Tap when ready' : 'Press OK when ready', W / 2, H * 0.77, u * 0.7, '#ffd23f', 900);
    c.globalAlpha = 1;
    hits.push({ x: 0, y: 0, w: W, h: H, fn: () => { if (phase === 'cover') coverOk(); } });
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const pw = Math.min(W - u, u * 20), ph = Math.min(H - u * 0.6, u * 16), px = (W - pw) / 2, py = (H - ph) / 2;
    const a = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(W / 2, H / 2); c.scale(a, a); c.translate(-W / 2, -H / 2);
    panel(c, px, py, pw, ph, u * 0.7, '#ffd23f', 'rgba(22,80,140,0.96)', 'rgba(6,30,62,0.97)');
    // a little sea with a bobbing ship
    const sx = W / 2 - u * 4.5, sy = py + u * 0.7, sw = u * 9, sh = u * 2.3;
    c.save(); roundRect(c, sx, sy, sw, sh, u * 0.5); c.clip();
    const g = c.createLinearGradient(0, sy, 0, sy + sh); g.addColorStop(0, '#2a9ad8'); g.addColorStop(1, '#0a3f70');
    c.fillStyle = g; c.fillRect(sx, sy, sw, sh);
    c.globalAlpha = 0.3; const off = (t * 30) % sw;
    if (wavePic.width > 1) { c.drawImage(wavePic, sx + off - sw, sy, sw, sh * 2); c.drawImage(wavePic, sx + off, sy, sw, sh * 2); }
    c.globalAlpha = 1;
    const bob = Math.sin(t * 2) * u * 0.06;
    c.save(); c.translate(W / 2, sy + sh / 2 + bob); c.rotate(Math.sin(t * 1.6) * 0.03);
    c.drawImage(shipSprite(5, u * 1.1, false), -u * 2.75, -u * 0.55, u * 5.5, u * 1.1); c.restore();
    for (let k = 0; k < 3; k++) {
      const rr = ((t * 0.6 + k / 3) % 1);
      c.strokeStyle = `rgba(255,255,255,${0.5 * (1 - rr)})`; c.lineWidth = 2;
      c.beginPath(); c.ellipse(sx + sw * 0.85, sy + sh * 0.55, u * (0.2 + rr), u * (0.1 + rr * 0.4), 0, 0, Math.PI * 2); c.stroke();
    }
    c.restore();
    outlined(c, 'Sea Battle', W / 2, py + u * 4.1, u * 1.35, '#ffffff', '#9fe0ff');
    text(c, 'Hide your ships, then take turns firing to sink the other fleet. A hit fires again!', W / 2, py + u * 5.15, u * 0.44, 'rgba(255,255,255,0.85)', 700);
    const lx = px + u * 0.9, ox = px + u * 5.4, avail = pw - (ox - px) - u * 0.8;
    const rows = [py + u * 7.0, py + u * 9.6, py + u * 12.2];
    const label = (i, s) => text(c, s, lx, rows[i], u * 0.52, menuRow === i ? '#ffe36b' : '#ffffff', 900, 'left');
    label(0, 'Players');
    const cw = Math.min(u * 4.8, (avail - u * 0.4) / 2), chh = u * 1.6;
    for (let i = 0; i < 2; i++) {
      const x = ox + i * (cw + u * 0.4), y = rows[0] - chh / 2, on = menuRow === 0 && seatIx === i;
      const k = on ? 1.06 + Math.sin(t * 5) * 0.015 : 1;
      c.save(); c.translate(x + cw / 2, y + chh / 2); c.scale(k, k);
      roundRect(c, -cw / 2, -chh / 2, cw, chh, u * 0.35);
      const gg = c.createLinearGradient(0, -chh / 2, 0, chh / 2);
      gg.addColorStop(0, shade(COLORS[i], 0.15)); gg.addColorStop(1, shade(COLORS[i], -0.5));
      c.fillStyle = gg; c.fill();
      c.lineWidth = on ? 5 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.35)'; c.stroke();
      drawAvatarIcon(c, seatHuman[i], -cw * 0.32, 0, chh * 0.32);
      fitText(c, seatHuman[i] ? 'Person' : 'TV', cw * 0.1, -chh * 0.13, chh * 0.32, '#ffffff', cw * 0.55, 900);
      fitText(c, 'Seat ' + (i + 1), cw * 0.1, chh * 0.22, chh * 0.2, 'rgba(255,255,255,0.8)', cw * 0.55, 700);
      c.restore();
      hits.push({ x, y, w: cw, h: chh, fn: () => { menuRow = 0; seatIx = i; toggleSeat(i); } });
    }
    text(c, menuRow === 0 ? 'OK switches Person / TV' : (seatHuman[0] && seatHuman[1] ? 'Two people: pass the remote between turns' : 'One person against the TV'), ox, rows[0] + chh / 2 + u * 0.4, u * 0.38, 'rgba(255,255,255,0.75)', 700, 'left');
    label(1, 'Skill');
    const kw = Math.min(u * 3.6, (avail - u * 0.6) / 3), rh = u * 1.15;
    SKILLS.forEach((s, i) => {
      const x = ox + i * (kw + u * 0.3), y = rows[1] - rh / 2, on = skill === i, rowOn = menuRow === 1;
      const k = on && rowOn ? 1.06 + Math.sin(t * 5) * 0.015 : 1;
      c.save(); c.translate(x + kw / 2, y + rh / 2); c.scale(k, k);
      roundRect(c, -kw / 2, -rh / 2, kw, rh, rh / 2);
      const gg = c.createLinearGradient(0, -rh / 2, 0, rh / 2);
      gg.addColorStop(0, on ? '#ffe680' : 'rgba(255,255,255,0.14)'); gg.addColorStop(1, on ? '#f0a000' : 'rgba(255,255,255,0.05)');
      c.fillStyle = gg; c.fill();
      c.lineWidth = on && rowOn ? 4 : 2; c.strokeStyle = on && rowOn ? '#ffffff' : on ? '#ffd23f' : 'rgba(255,255,255,0.25)'; c.stroke();
      fitText(c, s.name, 0, rh * 0.03, rh * 0.42, on ? '#3a2200' : 'rgba(255,255,255,0.85)', kw * 0.86, 800);
      c.restore();
      hits.push({ x, y, w: kw, h: rh, fn: () => { skill = i; menuRow = 1; saveSetup(); Kit.sfx.move(); } });
    });
    text(c, SKILLS[skill].tip, ox, rows[1] + rh / 2 + u * 0.4, u * 0.38, 'rgba(255,255,255,0.75)', 700, 'left');
    const bw = u * 5.6, bh = u * 1.25, bx = W / 2 - bw / 2, by = rows[2] - bh / 2 + u * 0.3, on = menuRow === 2;
    const kb = on ? 1.08 + Math.sin(t * 6) * 0.025 : 1;
    c.save(); c.translate(W / 2, by + bh / 2); c.scale(kb, kb);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const gb = c.createLinearGradient(0, -bh / 2, 0, bh / 2); gb.addColorStop(0, '#ffe680'); gb.addColorStop(1, '#f08c00');
    c.fillStyle = gb; c.fill(); c.lineWidth = on ? 5 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(80,40,0,0.6)'; c.stroke();
    outlined(c, '▶  Set sail', 0, bh * 0.03, bh * 0.52, '#ffffff', '#fff1c2');
    c.restore();
    hits.push({ x: bx, y: by, w: bw, h: bh, fn: () => startGame() });
    text(c, Kit.touchFirst() ? 'Tap to choose' : '▲▼ choose  ·  ◀ ▶ change  ·  OK  ·  Back for games', W / 2, py + ph - u * 0.85, u * 0.4, 'rgba(255,255,255,0.75)', 700);
    text(c, `★ Wins: ${wins}`, W / 2, py + ph - u * 0.35, u * 0.42, '#ffd23f', 800);
    c.restore();
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((stateT - overT - 0.8) / 0.45, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(2,10,30,${0.55 * a})`; c.fillRect(0, 0, W, H);
    const p = players[winner];
    if (!p) return;
    c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W - u, u * 14), ph = u * 8.6;
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.7, '#ffd23f', shade(p.color, -0.3), shade(p.color, -0.75));
    const ttl = p.name === 'You' ? 'You win!' : p.human ? `${p.name} wins!` : 'The TV wins';
    outlined(c, ttl, 0, -ph / 2 + u * 1.15, u * 1.3, '#ffffff', '#ffe680');
    text(c, p.human ? 'Every enemy ship is sunk!' : 'Your fleet is sunk - try again?', 0, -ph / 2 + u * 2.25, u * 0.5, 'rgba(255,255,255,0.9)', 800);
    players.forEach((q, i) => {
      const y = -ph / 2 + u * 3.1 + i * u * 1.0;
      roundRect(c, -pw * 0.42, y, pw * 0.84, u * 0.85, u * 0.3);
      c.fillStyle = i === winner ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.08)'; c.fill();
      c.fillStyle = q.color; c.beginPath(); c.arc(-pw * 0.42 + u * 0.55, y + u * 0.42, u * 0.25, 0, Math.PI * 2); c.fill();
      text(c, q.name, -pw * 0.42 + u * 1.1, y + u * 0.42, u * 0.45, '#ffffff', 900, 'left');
      const acc = q.fired ? Math.round((q.hits / q.fired) * 100) : 0;
      text(c, `${q.fired} shots · ${q.hits} hits · ${acc}%`, pw * 0.4, y + u * 0.42, u * 0.38, 'rgba(255,255,255,0.85)', 800, 'right');
    });
    text(c, `★ Wins: ${wins}`, 0, ph / 2 - u * 2.35, u * 0.5, '#ffd23f', 800);
    const ready = stateT - overT > 1.2;
    c.globalAlpha = ready ? 1 : 0.45;
    ['Play again', 'Menu'].forEach((s, i) => {
      const bw = u * 4.4, bh = u * 1.05, x = (i ? 1 : -1) * (bw / 2 + u * 0.25) - bw / 2, y = ph / 2 - u * 1.6;
      const on = overBtn === i;
      roundRect(c, x, y, bw, bh, bh / 2);
      const g = c.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, on ? '#ffe680' : 'rgba(255,255,255,0.18)'); g.addColorStop(1, on ? '#f08c00' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.3)'; c.stroke();
      text(c, s, x + bw / 2, y + bh / 2, u * 0.48, on ? '#3a2200' : '#fff', 900);
      hits.push({ x: W / 2 + x * k, y: H / 2 + y * k, w: bw * k, h: bh * k, fn: () => { if (stateT - overT > 1.2) { if (i === 0) startGame(); else toMenu(); } } });
    });
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  window.__seabattle = { get state() { return state; }, get phase() { return phase; }, get extra() { return { games: gamesDone, turn, N, shots: players.map((p) => p.fired), sunk: players.map((p) => p.ships.filter((s) => s.sunk).length) }; } };
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (AUTO) setTimeout(() => startGame(), 300);
  if (wins > 0) Kit.record(ID, wins);
})();
