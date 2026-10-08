// Ludo Star: the modern Ludo. Roll a 6 to bring a pin out, race it round the board and up your home
// lane; landing on a rival (not on a star) sends it home. A 6, a capture or a pin home rolls again.
// 1 to 4 people, the TV plays the other colours; 1st, 2nd and 3rd get medals.
// Remote: OK rolls the dice, Left/Right pick a pin (only ones that can move glow), OK moves it. Touch: tap.
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp } = Kit;
  const COLORS = ['#ff3b55', '#20c46a', '#ffbe1a', '#2f86ff'];
  const NAMES = ['Red', 'Green', 'Yellow', 'Blue'];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  const HOP = 0.15, THINK = 0.6, LIMIT = 20;
  const OPTIONS = [1, 2, 3, 4];

  // The 52 track squares on a 15 × 15 board, from Red's start, clockwise.
  const TRACK = [];
  for (let x = 1; x <= 5; x++) TRACK.push([x, 6]);
  for (let y = 5; y >= 0; y--) TRACK.push([6, y]);
  TRACK.push([7, 0], [8, 0]);
  for (let y = 1; y <= 5; y++) TRACK.push([8, y]);
  for (let x = 9; x <= 14; x++) TRACK.push([x, 6]);
  TRACK.push([14, 7], [14, 8]);
  for (let x = 13; x >= 9; x--) TRACK.push([x, 8]);
  for (let y = 9; y <= 14; y++) TRACK.push([8, y]);
  TRACK.push([7, 14], [6, 14]);
  for (let y = 13; y >= 9; y--) TRACK.push([6, y]);
  for (let x = 5; x >= 0; x--) TRACK.push([x, 8]);
  TRACK.push([0, 7], [0, 6]);

  // A point turned a quarter clockwise k times (each colour's corner is Red's corner turned).
  function turnPoint(x, y, k) {
    for (let i = 0; i < k; i++) { const nx = 15 - y; y = x; x = nx; }
    return [x, y];
  }
  const square = (c, p) => (p + 13 * c) % 52;
  // Centre of pin i of colour c at progress p, in board squares (0 to 15).
  function place(c, i, p) {
    if (p === -1) return turnPoint([2, 4, 2, 4][i], [2, 2, 4, 4][i], c);
    if (p <= 50) { const t = TRACK[square(c, p)]; return [t[0] + 0.5, t[1] + 0.5]; }
    if (p < 56) return turnPoint(p - 50 + 0.5, 7.5, c);
    return turnPoint(6.75 + 0.55 * (i % 2), 7.2 + 0.6 * Math.floor(i / 2), c);
  }

  // ---------- Records ----------
  let wins = Kit.store.get('ludostar.wins', 0);
  let menuIx = clamp(Kit.store.get('ludostar.humans', 1) - 1, 0, 3);

  // ---------- State ----------
  // state: 'menu', 'play', 'over'. phase within play: 'roll', 'rolling', 'pick', 'moving', 'wait'.
  let state = 'menu', stateT = 0, overT = 0;
  let humans = 1, pos, turn = 0, dice = 6, phase = 'wait', phaseT = 0, think = THINK;
  let movable = [], sel = -1, ranks = [], mover = null, flyers = [], later = null;
  let rollT = 0, rollFace = 6, rollAng = 0, landT = -9, sixes = 0, lastCaught = false;
  const medalT = [-9, -9, -9, -9];
  const isHuman = (c) => c < humans;
  const label = (c) => (!isHuman(c) ? 'TV' : humans === 1 ? 'You' : 'Player ' + (c + 1));

  function freshBoard() { pos = [0, 1, 2, 3].map(() => [-1, -1, -1, -1]); }
  freshBoard();

  function startGame() {
    humans = menuIx + 1;
    Kit.store.set('ludostar.humans', humans);
    freshBoard();
    ranks = []; flyers = []; mover = null; later = null; movable = []; sel = -1;
    medalT.fill(-9);
    state = 'play'; stateT = 0;
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.12, at: 0.08 });
    beginTurn(0);
  }
  function toMenu() { state = 'menu'; freshBoard(); ranks = []; flyers = []; mover = null; later = null; movable = []; }

  function setPhase(p) { phase = p; phaseT = 0; }
  function wait(t, fn) { setPhase('wait'); later = { t, fn }; }

  function beginTurn(c) {
    turn = c; movable = []; sel = -1;
    setPhase('roll');
    think = THINK * (0.7 + Math.random() * 0.6);
    if (isHuman(c)) Kit.tone(NOTES[4], { type: 'sine', dur: 0.18, vol: 0.1 });
  }

  function canMove(c, i, d) {
    const p = pos[c][i];
    if (p === -1) return d === 6;
    if (p === 56) return false;
    return p + d <= 56;
  }
  // What would be taken if colour c moved pin i by d.
  function captures(c, i, d) {
    const p = pos[c][i];
    const np = p === -1 ? 0 : p + d;
    if (np > 50) return [];
    const sq = square(c, np);
    if (SAFE.has(sq)) return [];
    const out = [];
    for (let o = 0; o < 4; o++) if (o !== c) for (let j = 0; j < 4; j++) {
      const op = pos[o][j];
      if (op >= 0 && op <= 50 && square(o, op) === sq) out.push([o, j]);
    }
    return out;
  }

  function roll() {
    if (phase !== 'roll') return;
    dice = 1 + Math.floor(Math.random() * 6);
    setPhase('rolling'); rollT = 0;
    // The dice rattling in a cup: a few clicks and a rush.
    for (let i = 0; i < 6; i++) Kit.noise({ dur: 0.04, vol: 0.14, freq: 2400 + Math.random() * 2000, q: 3, at: i * 0.09 + Math.random() * 0.03 });
    Kit.tone(200, { type: 'triangle', dur: 0.08, vol: 0.12, at: 0.62 });
  }

  function afterRoll() {
    landT = stateT;
    Kit.noise({ dur: 0.05, vol: 0.2, freq: 1600, q: 1.5 });
    Kit.tone(130, { type: 'sine', dur: 0.12, vol: 0.3, slide: 0.6 });
    const dp = dicePos();
    if (dice === 6) {
      Kit.burst(dp.x, dp.y, '#ffd23f', 12, 0.6);
      [0, 1, 2].forEach((i) => Kit.tone(NOTES[5 + i], { type: 'triangle', dur: 0.14, vol: 0.12, at: i * 0.05 }));
    }
    movable = [0, 1, 2, 3].filter((i) => canMove(turn, i, dice));
    if (!movable.length) {
      Kit.float('No move', dp.x, dp.y - L.cs * 1.6, { color: '#c9d6ff', size: L.cs * 0.75 });
      setTimeout(() => state === 'play' && Kit.sfx.nope(), 120);
      wait(0.8, nextTurn);
      return;
    }
    // Pick the best-looking pin first, for the TV and as the remote's starting choice.
    sel = tvPick();
    const allSame = movable.every((i) => pos[turn][i] === -1) || movable.length === 1;
    if (allSame) { wait(isHuman(turn) ? 0.35 : 0.45, () => moveToken(sel)); return; }
    setPhase('pick');
  }

  // The TV takes a pin if it can, then gets a pin home, then out of the yard, then the furthest.
  function tvPick() {
    let best = movable[0], bv = -1;
    for (const i of movable) {
      const p = pos[turn][i];
      const np = p === -1 ? 0 : p + dice;
      let v = np;
      if (captures(turn, i, dice).length) v += 200;
      if (np === 56) v += 120;
      if (p === -1) v += 90;
      if (np <= 50 && SAFE.has(square(turn, np))) v += 30;
      v = v * 10 + Math.random() * 10;
      if (v > bv) { bv = v; best = i; }
    }
    return best;
  }

  function moveToken(i) {
    if (!movable.includes(i)) return;
    const c = turn, p = pos[c][i];
    const np = p === -1 ? 0 : p + dice;
    const path = [];
    if (p === -1) path.push(place(c, i, 0));
    else for (let k = p + 1; k <= np; k++) path.push(place(c, i, k));
    mover = { c, i, from: place(c, i, p), path, idx: 0, t: 0, np };
    movable = []; sel = -1;
    setPhase('moving');
    Kit.sfx.pick();
  }

  function finishMove() {
    const { c, i, np } = mover;
    const caught = captures(c, i, dice);
    pos[c][i] = np;
    const [bx, by] = place(c, i, np);
    const x = L.bx + bx * L.cs, y = L.by + by * L.cs;
    mover = null;
    for (const [o, j] of caught) {
      const from = place(o, j, pos[o][j]);
      pos[o][j] = -1;
      flyers.push({ c: o, i: j, from, to: place(o, j, -1), t: 0 });
      Kit.burst(x, y, COLORS[o], 22, 1.1);
    }
    if (caught.length) {
      Kit.burst(x, y, '#ffffff', 10, 0.8);
      Kit.shake(12, 0.4);
      Kit.noise({ dur: 0.25, vol: 0.3, freq: 300, q: 0.8, type: 'lowpass' });
      Kit.tone(220, { type: 'square', dur: 0.12, vol: 0.12, slide: 2.2 });
      Kit.tone(880, { type: 'triangle', dur: 0.18, vol: 0.14, at: 0.1, slide: 0.5 });
      Kit.float(caught.length > 1 ? 'Double knock!' : 'Knocked out!', x, y - L.cs, { color: COLORS[c], size: L.cs * 0.9 });
    }
    if (np === 56) {
      Kit.burst(x, y, COLORS[c], 18, 0.9);
      Kit.burst(x, y, '#ffd23f', 10, 0.7);
      Kit.sfx.chime();
      Kit.float('Home!', x, y - L.cs, { color: '#ffd23f', size: L.cs * 0.9 });
    }
    if (np === 0) Kit.burst(x, y, COLORS[c], 10, 0.6);
    if (pos[c].every((p) => p === 56)) {
      ranks.push(c);
      medalT[c] = stateT;
      const cr = L.cards[c];
      Kit.float(['1st!', '2nd!', '3rd!', '4th'][ranks.length - 1], cr.x + cr.w / 2, cr.y + cr.h / 2, { color: ['#ffd23f', '#e8eefc', '#ff9f5a', '#ffffff'][ranks.length - 1], size: L.cs * 1.3, life: 1.6, big: true });
      if (isHuman(c)) { Kit.confetti(ranks.length === 1 ? 140 : 70); Kit.sfx.win(); }
      else Kit.sfx.chime();
      const left = [0, 1, 2, 3].filter((k) => !ranks.includes(k));
      if (left.length <= 1 || !left.some(isHuman)) { wait(1.2, endGame); return; }
      wait(0.9, nextTurn);
      return;
    }
    if (dice === 6 || caught.length || np === 56) {
      wait(0.55, () => {
        const cr = L.cards[c];
        Kit.float('Roll again!', cr.x + cr.w / 2, cr.y - L.cs * 0.1, { color: '#9ff0ff', size: L.cs * 0.7 });
        beginTurn(c);
      });
    } else wait(0.3, nextTurn);
  }

  function nextTurn() {
    let c = turn;
    for (let k = 0; k < 4; k++) { c = (c + 1) % 4; if (!ranks.includes(c)) break; }
    beginTurn(c);
  }

  function progress(c) { return pos[c].reduce((s, p) => s + p + 1, 0); }
  function endGame() {
    const left = [0, 1, 2, 3].filter((k) => !ranks.includes(k)).sort((a, b) => progress(b) - progress(a));
    ranks.push(...left);
    state = 'over'; overT = stateT; movable = [];
    if (isHuman(ranks[0])) {
      wins++;
      Kit.store.set('ludostar.wins', wins);
      Kit.record('ludostar', wins);
      Kit.confetti(160);
      Kit.sfx.win();
    } else if (!ranks.slice(0, 3).some(isHuman)) Kit.sfx.over();
    else Kit.sfx.chime();
  }

  // ---------- Keys and taps ----------
  function stepSel(d) {
    if (phase !== 'pick' || !movable.length) return;
    // In screen order (left to right, then top to bottom) so the arrows feel natural.
    const order = movable.slice().sort((a, b) => {
      const pa = tokenXY(turn, a), pb = tokenXY(turn, b);
      return Math.abs(pa.x - pb.x) > 2 ? pa.x - pb.x : pa.y - pb.y;
    });
    const k = order.indexOf(sel);
    sel = order[(k + d + order.length) % order.length];
    Kit.sfx.move();
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      if (k === 'left' || k === 'up') { menuIx = (menuIx + 3) % 4; Kit.sfx.move(); }
      else if (k === 'right' || k === 'down') { menuIx = (menuIx + 1) % 4; Kit.sfx.move(); }
      else if (k === 'ok') startGame();
      return;
    }
    if (state === 'over') {
      if (stateT - overT < 1.4) return;
      if (k === 'ok') startGame();
      else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { Kit.sfx.move(); toMenu(); }
      return;
    }
    if (!isHuman(turn)) return;
    if (phase === 'roll' && k === 'ok') roll();
    else if (phase === 'pick') {
      if (k === 'left' || k === 'up') stepSel(-1);
      else if (k === 'right' || k === 'down') stepSel(1);
      else if (k === 'ok') moveToken(sel);
    }
  });

  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = (L.opts || []).findIndex((r) => inside(e, r));
        if (i >= 0) { if (i === menuIx) startGame(); else { menuIx = i; Kit.sfx.move(); } }
        return;
      }
      if (state === 'over') {
        if (stateT - overT < 1.4) return;
        if (inside(e, L.menuBtn)) toMenu(); else startGame();
        return;
      }
      if (!isHuman(turn)) return;
      if (phase === 'roll') { if (inside(e, L.cards[turn]) || inside(e, L.board)) roll(); return; }
      if (phase === 'pick') {
        let hit = -1, bd = L.cs * 0.8;
        for (const i of movable) {
          const p = tokenXY(turn, i);
          const d = Math.hypot(e.x - p.x, e.y - (p.y - L.cs * 0.25));
          if (d < bd) { bd = d; hit = i; }
        }
        if (hit >= 0) moveToken(hit);
      }
    },
  });
  let hidden = false;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // ---------- Update ----------
  function update(dt) {
    if (hidden) return;
    stateT += dt;
    if (state !== 'play') return;
    phaseT += dt;
    for (let k = flyers.length - 1; k >= 0; k--) {
      flyers[k].t += dt;
      if (flyers[k].t > 0.75) {
        const f = flyers.splice(k, 1)[0];
        const [x, y] = f.to;
        Kit.burst(L.bx + x * L.cs, L.by + y * L.cs, COLORS[f.c], 8, 0.5);
        Kit.tone(300, { type: 'sine', dur: 0.1, vol: 0.12, slide: 0.6 });
      }
    }
    if (phase === 'wait' && later && phaseT >= later.t) { const f = later.fn; later = null; f(); return; }
    if (phase === 'roll') {
      if (!isHuman(turn) ? phaseT > think : phaseT > LIMIT) roll();
    } else if (phase === 'rolling') {
      rollT += dt;
      rollAng += dt * 16 * (1 - rollT / 0.75);
      if (Math.floor(rollT / 0.07) !== Math.floor((rollT - dt) / 0.07)) rollFace = 1 + Math.floor(Math.random() * 6);
      if (rollT >= 0.75) { rollFace = dice; rollAng = 0; afterRoll(); }
    } else if (phase === 'pick') {
      if (!isHuman(turn) ? phaseT > think * 0.8 : phaseT > LIMIT) moveToken(sel);
    } else if (phase === 'moving' && mover) {
      mover.t += dt;
      if (mover.t >= HOP) {
        mover.t -= HOP;
        mover.idx++;
        const n = mover.idx;
        Kit.tone(NOTES[Math.min(NOTES.length - 1, n - 1)] * 0.75, { type: 'triangle', dur: 0.07, vol: 0.13, slide: 1.3 });
        if (n >= mover.path.length) { mover.t = 0; finishMove(); }
      }
    }
  }

  // ---------- Layout ----------
  let L = { cs: 40, bx: 0, by: 0, S: 600, cards: [], wide: true };
  const boardPic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W > H * 1.15;
    const gap = Math.max(8, Math.min(W, H) * 0.015);
    let cs, bx, by, cards, cw, ch;
    if (wide) {
      cs = Math.floor(Math.min(H * 0.94, W * 0.56) / 15);
      const S = cs * 15;
      bx = Math.round((W - S) / 2); by = Math.round((H - S) / 2);
      cw = Math.min(bx - gap * 2.2, cs * 7.6); ch = cs * 4.4;
      const lx = bx - gap * 1.4 - cw, rx = bx + S + gap * 1.4;
      const ty = by + cs * 1.4, byy = by + S - cs * 1.0 - ch;
      cards = [{ x: lx, y: ty }, { x: rx, y: ty }, { x: rx, y: byy }, { x: lx, y: byy }];
    } else {
      const top = 64;
      cw = (W - gap * 3) / 2;
      ch = Math.min(H * 0.13, cw * 0.55);
      cs = Math.floor(Math.min(W - gap * 2, H - top - ch * 2 - gap * 4 - H * 0.06) / 15);
      const S = cs * 15;
      bx = Math.round((W - S) / 2); by = Math.round(top + ch + gap * 2);
      const by2 = by + S + gap * 2;
      cards = [{ x: gap, y: top }, { x: gap * 2 + cw, y: top }, { x: gap * 2 + cw, y: by2 }, { x: gap, y: by2 }];
    }
    cards = cards.map((r) => ({ ...r, w: cw, h: ch }));
    L = { cs, bx, by, S: cs * 15, cards, wide, gap, board: { x: bx, y: by, w: cs * 15, h: cs * 15 } };
    sprites.clear();
    drawBoard();
  }
  Kit.onResize(layout);

  // ---------- Sprites: drawn once per size (gradients are slow on TV boxes) ----------
  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const k = name + '|' + Math.round(w) + 'x' + Math.round(h);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = Math.ceil(w * dpr); s.height = Math.ceil(h * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, w, h);
    sprites.set(k, s);
    return s;
  }

  function starPath(c, x, y, r1, r2) {
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? r2 : r1, a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  }

  // A glossy pin: a round head on a flared base, like the pieces in today's Ludo apps.
  const pinSprite = (color, w) => sprite('pin' + color, w, w * 1.3, (c, w, h) => {
    const cx = w / 2;
    // Base disc
    c.fillStyle = shade(color, -0.55);
    c.beginPath(); c.ellipse(cx, h - w * 0.13, w * 0.4, w * 0.12, 0, 0, Math.PI * 2); c.fill();
    let g = c.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, shade(color, -0.35)); g.addColorStop(0.35, shade(color, 0.25)); g.addColorStop(1, shade(color, -0.5));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(cx, h - w * 0.17, w * 0.4, w * 0.12, 0, 0, Math.PI * 2); c.fill();
    // Body: flares from the head down to the base
    c.beginPath();
    c.moveTo(cx - w * 0.36, h - w * 0.18);
    c.quadraticCurveTo(cx - w * 0.12, h - w * 0.4, cx - w * 0.15, w * 0.58);
    c.lineTo(cx + w * 0.15, w * 0.58);
    c.quadraticCurveTo(cx + w * 0.12, h - w * 0.4, cx + w * 0.36, h - w * 0.18);
    c.ellipse(cx, h - w * 0.18, w * 0.36, w * 0.09, 0, 0, Math.PI);
    c.closePath();
    c.fill();
    c.lineWidth = Math.max(1, w * 0.03); c.strokeStyle = shade(color, -0.6); c.stroke();
    // Head
    const hy = w * 0.36, hr = w * 0.31;
    g = c.createRadialGradient(cx - hr * 0.35, hy - hr * 0.4, hr * 0.1, cx, hy, hr);
    g.addColorStop(0, shade(color, 0.6)); g.addColorStop(0.5, color); g.addColorStop(1, shade(color, -0.45));
    c.fillStyle = g;
    c.beginPath(); c.arc(cx, hy, hr, 0, Math.PI * 2); c.fill();
    c.stroke();
    // White ring and shine
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = w * 0.045;
    c.beginPath(); c.arc(cx, hy, hr * 0.55, 0, Math.PI * 2); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.beginPath(); c.ellipse(cx - hr * 0.35, hy - hr * 0.45, hr * 0.28, hr * 0.15, -0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(cx - w * 0.06, h - w * 0.42, w * 0.035, w * 0.12, 0.15, 0, Math.PI * 2); c.fill();
  });

  // A white dice with depth (a darker side below it) and rounded pips.
  const PIPS = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const diceSprite = (face, s) => sprite('dice' + face, s, s * 1.12, (c, s) => {
    const r = s * 0.2, d = s * 0.1;
    roundRect(c, s * 0.02, d + s * 0.02, s * 0.96, s * 0.96, r);
    c.fillStyle = '#9aa6c4'; c.fill();
    roundRect(c, s * 0.02, s * 0.02, s * 0.96, s * 0.96, r);
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#eef1f8'); g.addColorStop(1, '#cdd4e6');
    c.fillStyle = g; c.fill();
    c.lineWidth = s * 0.02; c.strokeStyle = 'rgba(80,90,130,0.35)'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    roundRect(c, s * 0.14, s * 0.08, s * 0.5, s * 0.1, s * 0.05); c.fill();
    const pr = s * 0.085, off = s * 0.25;
    for (const [px, py] of PIPS[face]) {
      const x = s / 2 + px * off, y = s / 2 + py * off;
      const pg = c.createRadialGradient(x - pr * 0.3, y - pr * 0.3, pr * 0.1, x, y, pr);
      pg.addColorStop(0, face === 1 ? '#ff6b7f' : '#4a5578'); pg.addColorStop(1, face === 1 ? '#c4102c' : '#141a33');
      c.fillStyle = pg;
      c.beginPath(); c.arc(x, y, face === 1 ? pr * 1.45 : pr, 0, Math.PI * 2); c.fill();
    }
  });

  // Gold, silver and bronze medals with the place on them.
  const MEDAL = ['#ffcf3a', '#d5ddea', '#e08a4a'];
  const medalSprite = (rank, s) => sprite('medal' + rank, s, s * 1.25, (c, s) => {
    const cx = s / 2, cy = s * 0.72, r = s * 0.42;
    c.fillStyle = ['#e23d5b', '#3d7bff', '#2bb673'][rank];
    c.beginPath(); c.moveTo(cx - r * 0.75, 0); c.lineTo(cx - r * 0.1, cy - r * 0.6); c.lineTo(cx - r * 0.55, cy - r * 0.4); c.lineTo(cx - r * 1.05, 0); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(cx + r * 0.75, 0); c.lineTo(cx + r * 0.1, cy - r * 0.6); c.lineTo(cx + r * 0.55, cy - r * 0.4); c.lineTo(cx + r * 1.05, 0); c.closePath(); c.fill();
    const col = MEDAL[rank];
    const g = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, -0.45));
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = s * 0.04; c.strokeStyle = shade(col, -0.5); c.stroke();
    c.beginPath(); c.arc(cx, cy, r * 0.72, 0, Math.PI * 2); c.strokeStyle = shade(col, -0.25); c.lineWidth = s * 0.03; c.stroke();
    c.font = `900 ${Math.round(r * 1.0)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = shade(col, -0.6); c.fillText(String(rank + 1), cx, cy + r * 0.06);
  });

  // The board: drawn once per size.
  function drawBoard() {
    const { cs, S } = L;
    const pad = cs * 0.35, depth = cs * 0.22;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardPic.width = Math.ceil((S + pad * 2) * dpr); boardPic.height = Math.ceil((S + pad * 2 + depth) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Frame with depth
    roundRect(c, 0, depth, S + pad * 2, S + pad * 2, cs * 0.7);
    c.fillStyle = '#0a1a4a'; c.fill();
    roundRect(c, 0, 0, S + pad * 2, S + pad * 2, cs * 0.7);
    let g = c.createLinearGradient(0, 0, 0, S + pad * 2);
    g.addColorStop(0, '#ffe58a'); g.addColorStop(0.5, '#f5b82e'); g.addColorStop(1, '#c97c12');
    c.fillStyle = g; c.fill();
    c.translate(pad, pad);
    roundRect(c, -cs * 0.08, -cs * 0.08, S + cs * 0.16, S + cs * 0.16, cs * 0.45);
    c.fillStyle = '#7a4a0c'; c.fill();
    roundRect(c, 0, 0, S, S, cs * 0.4);
    c.fillStyle = '#f4f1ea'; c.fill();
    c.save(); roundRect(c, 0, 0, S, S, cs * 0.4); c.clip();

    // Track cells
    const cell = (x, y, fill, stroke) => {
      roundRect(c, x * cs + 1.5, y * cs + 1.5, cs - 3, cs - 3, cs * 0.18);
      c.fillStyle = fill; c.fill();
      if (stroke) { c.lineWidth = 1.2; c.strokeStyle = stroke; c.stroke(); }
    };
    c.fillStyle = '#dcd6c8'; c.fillRect(6 * cs, 0, 3 * cs, S); c.fillRect(0, 6 * cs, S, 3 * cs);
    TRACK.forEach(([x, y]) => cell(x, y, '#ffffff', '#cfc8b8'));
    for (let k = 0; k < 4; k++) {
      const col = COLORS[k];
      // Home lane
      for (let p = 51; p <= 55; p++) {
        const [px, py] = turnPoint(p - 50 + 0.5, 7.5, k);
        const x = Math.floor(px), y = Math.floor(py);
        roundRect(c, x * cs + 1.5, y * cs + 1.5, cs - 3, cs - 3, cs * 0.18);
        const lg = c.createLinearGradient(x * cs, y * cs, x * cs, (y + 1) * cs);
        lg.addColorStop(0, shade(col, 0.25)); lg.addColorStop(1, shade(col, -0.12));
        c.fillStyle = lg; c.fill();
      }
      // Start square, with an arrow
      const [sx, sy] = TRACK[13 * k];
      roundRect(c, sx * cs + 1.5, sy * cs + 1.5, cs - 3, cs - 3, cs * 0.18);
      const sg = c.createLinearGradient(sx * cs, sy * cs, sx * cs, (sy + 1) * cs);
      sg.addColorStop(0, shade(col, 0.25)); sg.addColorStop(1, shade(col, -0.12));
      c.fillStyle = sg; c.fill();
      starPath(c, (sx + 0.5) * cs, (sy + 0.5) * cs, cs * 0.34, cs * 0.15);
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.fill();
      // Star square
      const [tx, ty] = TRACK[13 * k + 8];
      starPath(c, (tx + 0.5) * cs, (ty + 0.5) * cs, cs * 0.36, cs * 0.16);
      const tg = c.createLinearGradient(0, ty * cs, 0, (ty + 1) * cs);
      tg.addColorStop(0, '#ffe680'); tg.addColorStop(1, '#f0a000');
      c.fillStyle = tg; c.fill();
      c.lineWidth = 1.5; c.strokeStyle = '#b06a00'; c.stroke();
    }

    // Yards
    for (let k = 0; k < 4; k++) {
      const col = COLORS[k];
      const [ax, ay] = turnPoint(0, 0, k), [bx2, by2] = turnPoint(6, 6, k);
      const x = Math.min(ax, bx2) * cs, y = Math.min(ay, by2) * cs, s = 6 * cs;
      roundRect(c, x + 2, y + 2, s - 4, s - 4, cs * 0.5);
      g = c.createLinearGradient(x, y, x + s, y + s);
      g.addColorStop(0, shade(col, 0.3)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.3));
      c.fillStyle = g; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.18)';
      roundRect(c, x + cs * 0.3, y + cs * 0.2, s - cs * 0.6, cs * 0.5, cs * 0.25); c.fill();
      roundRect(c, x + cs * 0.85, y + cs * 0.85, s - cs * 1.7, s - cs * 1.7, cs * 0.5);
      c.fillStyle = shade(col, -0.35); c.fill();
      roundRect(c, x + cs * 0.9, y + cs * 0.82, s - cs * 1.8, s - cs * 1.8, cs * 0.46);
      c.fillStyle = '#fdfbf6'; c.fill();
      for (let i = 0; i < 4; i++) {
        const [px, py] = turnPoint([2, 4, 2, 4][i], [2, 2, 4, 4][i], k);
        const sg = c.createRadialGradient(px * cs, py * cs - cs * 0.1, cs * 0.05, px * cs, py * cs, cs * 0.62);
        sg.addColorStop(0, shade(col, -0.35)); sg.addColorStop(0.8, shade(col, 0.05)); sg.addColorStop(1, shade(col, 0.35));
        c.fillStyle = sg;
        c.beginPath(); c.arc(px * cs, py * cs, cs * 0.6, 0, Math.PI * 2); c.fill();
      }
    }

    // Centre: four home triangles
    const C = 7.5 * cs;
    const tri = [[[6, 6], [6, 9]], [[6, 6], [9, 6]], [[9, 6], [9, 9]], [[6, 9], [9, 9]]];
    for (let k = 0; k < 4; k++) {
      const [[x1, y1], [x2, y2]] = tri[k];
      c.beginPath(); c.moveTo(x1 * cs, y1 * cs); c.lineTo(x2 * cs, y2 * cs); c.lineTo(C, C); c.closePath();
      g = c.createLinearGradient((x1 + x2) / 2 * cs, (y1 + y2) / 2 * cs, C, C);
      g.addColorStop(0, shade(COLORS[k], 0.2)); g.addColorStop(1, shade(COLORS[k], -0.3));
      c.fillStyle = g; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke();
    }
    starPath(c, C, C, cs * 0.55, cs * 0.24);
    g = c.createLinearGradient(0, C - cs * 0.5, 0, C + cs * 0.5);
    g.addColorStop(0, '#fff6c2'); g.addColorStop(1, '#f0a000');
    c.fillStyle = g; c.fill(); c.lineWidth = 2; c.strokeStyle = '#a35d00'; c.stroke();

    // Soft vignette for depth
    g = c.createRadialGradient(S / 2, S * 0.4, S * 0.2, S / 2, S / 2, S * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(60,40,0,0.14)');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.restore();
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(6,12,40,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, top = '#24408f', bottom = '#101f52') {
    roundRect(c, x, y + 5, w, h, r);
    c.fillStyle = 'rgba(0,0,20,0.35)'; c.fill();
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }

  // Where a pin is drawn right now (its base point), following hops and knock-backs.
  function tokenXY(c, i) {
    const cs = L.cs;
    let bx, by, lift = 0;
    if (mover && mover.c === c && mover.i === i && state === 'play') {
      const a = mover.idx === 0 ? mover.from : mover.path[mover.idx - 1];
      const b = mover.path[Math.min(mover.idx, mover.path.length - 1)];
      const k = clamp(mover.t / HOP, 0, 1), e = ease.inOut(k);
      bx = lerp(a[0], b[0], e); by = lerp(a[1], b[1], e);
      lift = Math.sin(k * Math.PI) * cs * 0.55;
    } else {
      const f = flyers.find((q) => q.c === c && q.i === i);
      if (f) {
        const k = clamp(f.t / 0.75, 0, 1), e = ease.out(k);
        bx = lerp(f.from[0], f.to[0], e); by = lerp(f.from[1], f.to[1], e);
        lift = Math.sin(k * Math.PI) * cs * 2.2 + Math.abs(Math.sin(k * Math.PI * 3)) * (1 - k) * cs * 0.4;
      } else [bx, by] = place(c, i, pos[c][i]);
    }
    return { x: L.bx + bx * cs, y: L.by + by * cs + cs * 0.3, lift };
  }

  function drawTokens(c, t) {
    const cs = L.cs;
    const list = [];
    const groups = new Map();
    for (let k = 0; k < 4; k++) for (let i = 0; i < 4; i++) {
      const p = tokenXY(k, i);
      const still = !(mover && mover.c === k && mover.i === i) && !flyers.some((f) => f.c === k && f.i === i);
      const pp = pos[k][i];
      let key = null;
      if (still && pp >= 0 && pp <= 50) key = 't' + square(k, pp);
      else if (still && pp > 50 && pp < 56) key = 'l' + k + pp;
      const item = { k, i, ...p, key, scale: pp === 56 && still ? 0.62 : 1 };
      if (key) { if (!groups.has(key)) groups.set(key, []); groups.get(key).push(item); }
      list.push(item);
    }
    for (const g of groups.values()) {
      if (g.length < 2) continue;
      g.forEach((it, n) => {
        const a = (n / g.length) * Math.PI * 2 - Math.PI / 4;
        it.x += Math.cos(a) * cs * 0.2; it.y += Math.sin(a) * cs * 0.16; it.scale = 0.78;
      });
    }
    list.sort((a, b) => (a.lift ? 1 : 0) - (b.lift ? 1 : 0) || a.y - b.y);
    const w = cs * 0.92;
    const pick = state === 'play' && phase === 'pick';
    for (const it of list) {
      const mov = pick && it.k === turn && movable.includes(it.i);
      const isSel = mov && it.i === sel && isHuman(turn);
      let s = w * it.scale;
      let bob = 0;
      if (mov) {
        // Glowing ring under the pins that can move.
        const pulse = 0.5 + Math.sin(t * 6) * 0.5;
        const rx = cs * (0.44 + pulse * 0.08), ry = cs * (0.21 + pulse * 0.04), ey = it.y - cs * 0.08;
        c.fillStyle = `rgba(255,190,0,${0.3 + pulse * 0.25})`;
        c.beginPath(); c.ellipse(it.x, ey, rx, ry, 0, 0, Math.PI * 2); c.fill();
        c.lineWidth = isSel ? 8 : 5; c.strokeStyle = 'rgba(120,60,0,0.6)'; c.stroke();
        c.lineWidth = isSel ? 4 : 2.5; c.strokeStyle = isSel ? '#ffffff' : '#ffc21a'; c.stroke();
        bob = Math.abs(Math.sin(t * 5 + it.i)) * cs * (isSel ? 0.22 : 0.1);
        if (isSel) s *= 1.15;
      }
      // Shadow
      const sh = 1 - Math.min(0.6, it.lift / (cs * 3));
      c.fillStyle = `rgba(30,20,0,${0.28 * sh})`;
      c.beginPath(); c.ellipse(it.x, it.y - cs * 0.04, s * 0.36 * sh, s * 0.12 * sh, 0, 0, Math.PI * 2); c.fill();
      const img = pinSprite(COLORS[it.k], w);
      const h = s * 1.3;
      c.drawImage(img, it.x - s / 2, it.y - h + s * 0.08 - it.lift - bob, s, h);
      if (isSel) {
        // A bouncing arrow above the chosen pin.
        const ay = it.y - h - cs * 0.05 - bob - Math.abs(Math.sin(t * 5)) * cs * 0.15;
        c.fillStyle = '#ffd23f'; c.strokeStyle = 'rgba(40,20,0,0.85)'; c.lineWidth = 3; c.lineJoin = 'round';
        c.beginPath(); c.moveTo(it.x - cs * 0.28, ay - cs * 0.3); c.lineTo(it.x + cs * 0.28, ay - cs * 0.3); c.lineTo(it.x, ay + cs * 0.05); c.closePath();
        c.stroke(); c.fill();
      }
    }
  }

  function yardRect(k) {
    const [ax, ay] = turnPoint(0, 0, k), [bx2, by2] = turnPoint(6, 6, k);
    return { x: L.bx + Math.min(ax, bx2) * L.cs, y: L.by + Math.min(ay, by2) * L.cs, s: 6 * L.cs };
  }

  // Where the active player's dice sits: on the board side of their card.
  // Where things sit inside a player's card (card-local), stacked on TV, side by side on a phone.
  function cardGeo(k) {
    const r = L.cards[k], h = r.h, w = r.w, left = k === 0 || k === 3;
    const pad = Math.min(h * 0.1, w * 0.06);
    const out = (x) => (left ? x : w - x);
    if (w / h < 2) {
      const av = h * 0.24, ns = Math.min(h * 0.15, L.cs * 0.6);
      const ds = Math.min(h * 0.42, L.cs * 1.7);
      return { av, ax: out(pad + av), ay: h * 0.66, tx: out(pad * 1.2), ny: h * 0.17, ns, dy: h * 0.31,
        cx: out(w - pad * 1.2), cy: h * 0.17, calign: left ? 'right' : 'left', dx: out(w - pad - ds * 0.65), ddy: h * 0.62, ds };
    }
    const av = h * 0.34, ns = h * 0.22, ds = h * 0.55;
    return { av, ax: out(pad + av), ay: h * 0.5, tx: out(pad * 2 + av * 2), ny: h * 0.3, ns, dy: h * 0.75,
      cx: out(pad * 2 + av * 2), cy: h * 0.53, calign: left ? 'left' : 'right', dx: out(w - pad - ds * 0.6), ddy: h * 0.48, ds };
  }
  function diceRect(k) {
    const r = L.cards[k], g = cardGeo(k);
    return { x: r.x + g.dx, y: r.y + g.ddy, s: g.ds };
  }
  function dicePos() { const d = diceRect(turn); return { x: d.x, y: d.y }; }

  function drawCard(c, k, t) {
    const r = L.cards[k], cs = L.cs;
    const active = state === 'play' && k === turn && !ranks.includes(k);
    const col = COLORS[k];
    const rank = ranks.indexOf(k);
    c.save();
    const sc = active ? 1.03 + Math.sin(t * 4) * 0.008 : 1;
    c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(sc, sc); c.translate(-r.w / 2, -r.h / 2);
    panel(c, 0, 0, r.w, r.h, cs * 0.45, active ? col : 'rgba(150,180,255,0.25)', active ? shade(col, -0.35) : '#1c3170', active ? shade(col, -0.7) : '#0d1a45');
    if (active) {
      c.lineWidth = 6 + Math.sin(t * 6) * 2; c.strokeStyle = Kit.rgba(col, 0.35);
      roundRect(c, -4, -4, r.w + 8, r.h + 8, cs * 0.55); c.stroke();
    }
    // Name on top, avatar (with the turn timer ring) on the outer side, dice on the board side.
    const left = k === 0 || k === 3;
    const g = cardGeo(k);
    const { av, ax, ay } = g;
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.arc(ax, ay, av, 0, Math.PI * 2); c.fill();
    c.lineWidth = av * 0.12; c.strokeStyle = Kit.rgba(col, 0.45);
    c.beginPath(); c.arc(ax, ay, av * 0.94, 0, Math.PI * 2); c.stroke();
    if (active && (phase === 'roll' || phase === 'pick')) {
      const limit = isHuman(k) ? LIMIT : phase === 'roll' ? think : think * 0.8;
      const left2 = clamp(1 - phaseT / limit, 0, 1);
      c.lineWidth = av * 0.16; c.lineCap = 'round';
      c.strokeStyle = left2 < 0.25 && isHuman(k) ? '#ff5d5d' : '#ffe14d';
      c.beginPath(); c.arc(ax, ay, av * 0.94, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left2); c.stroke();
      c.lineCap = 'butt';
    }
    const pw = av * 1.15;
    c.drawImage(pinSprite(col, cs * 0.92), ax - pw / 2, ay - pw * 0.72, pw, pw * 1.3);
    const align = left ? 'left' : 'right';
    text(c, label(k), g.tx, g.ny, g.ns, '#ffffff', 900, align);
    text(c, NAMES[k].toUpperCase(), g.cx, g.cy, g.ns * 0.62, shade(col, 0.45), 900, g.calign);
    const home = pos[k].filter((p) => p === 56).length;
    const dr = g.ns * 0.2;
    for (let n = 0; n < 4; n++) {
      const dx = left ? g.tx + dr + n * dr * 2.8 : g.tx - dr - n * dr * 2.8;
      c.beginPath(); c.arc(dx, g.dy, dr, 0, Math.PI * 2);
      c.fillStyle = n < home ? '#ffd23f' : 'rgba(255,255,255,0.18)'; c.fill();
    }
    c.restore();
    // Medal for the finished
    if (rank >= 0 && rank < 3) {
      const m = clamp((stateT - medalT[k]) / 0.6, 0, 1);
      const ms = cs * 1.7 * (medalT[k] < 0 ? 1 : ease.back(m));
      const d = diceRect(k);
      if (ms > 1) c.drawImage(medalSprite(rank, cs * 1.7), d.x - ms / 2, d.y - ms * 0.62, ms, ms * 1.25);
    }
    // Dice
    if (active) drawDice(c, k, t);
  }

  function drawDice(c, k, t) {
    const d = diceRect(k);
    let s = d.s, x = d.x, y = d.y, ang = 0, face = dice, sx = 1, sy = 1;
    const waiting = phase === 'roll';
    if (phase === 'rolling') {
      const q = clamp(rollT / 0.75, 0, 1);
      face = rollFace; ang = rollAng;
      y -= Math.abs(Math.sin(q * Math.PI * 2.5)) * (1 - q) * s * 0.7;
      sx = 1 + Math.sin(q * 30) * 0.08 * (1 - q); sy = 2 - sx;
    } else {
      const land = stateT - landT;
      if (land < 0.35) { const e = ease.elastic(clamp(land / 0.35, 0, 1)); sx = 0.8 + 0.2 * e; sy = 1.2 - 0.2 * e; }
      if (waiting) { s *= 1 + Math.sin(t * 5) * 0.04; ang = Math.sin(t * 3) * 0.08; }
    }
    // A pulsing halo says "roll me", then a shadow under the dice
    if (waiting && isHuman(k)) {
      const p = 0.5 + Math.sin(t * 6) * 0.5;
      c.fillStyle = `rgba(255,225,90,${0.12 + p * 0.18})`;
      c.beginPath(); c.arc(d.x, d.y + d.s * 0.05, d.s * (0.68 + p * 0.08), 0, Math.PI * 2); c.fill();
      c.lineWidth = 3; c.strokeStyle = `rgba(255,235,140,${0.4 + p * 0.5})`; c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.beginPath(); c.ellipse(d.x, d.y + d.s * 0.55, d.s * 0.48, d.s * 0.13, 0, 0, Math.PI * 2); c.fill();
    c.save();
    c.translate(x, y); c.rotate(ang); c.scale(sx, sy);
    c.globalAlpha = waiting && !isHuman(k) ? 0.85 : 1;
    c.drawImage(diceSprite(waiting ? 6 : face, d.s), -s / 2, -s / 2, s, s * 1.12);
    c.restore();
    c.globalAlpha = 1;
  }

  function statusLine() {
    const n = label(turn), who = isHuman(turn) ? (humans === 1 ? 'Your' : n + "'s") : NAMES[turn] + "'s";
    if (!isHuman(turn)) return [`${NAMES[turn]} (TV)`, phase === 'roll' || phase === 'rolling' ? 'is rolling…' : 'is moving…'];
    if (phase === 'roll') return [`${who} turn`, Kit.touchFirst() ? 'Tap to roll' : 'Press OK to roll'];
    if (phase === 'pick') return [`You rolled ${dice}`, Kit.touchFirst() ? 'Tap a glowing pin' : '◀ ▶ pick a pin · OK move'];
    if (phase === 'rolling') return [`${who} turn`, 'Rolling…'];
    return [`${who} turn`, ''];
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    Kit.background(c, t, '#14317a', '#060d2a', 'rgba(90,160,255,0.10)');
    const pad = cs * 0.35;
    c.drawImage(boardPic, L.bx - pad, L.by - pad, L.S + pad * 2, L.S + pad * 2 + cs * 0.22);
    // The active yard glows.
    if (state === 'play' && !ranks.includes(turn)) {
      const y = yardRect(turn);
      const p = 0.5 + Math.sin(t * 5) * 0.5;
      const col = COLORS[turn];
      c.fillStyle = `rgba(255,255,255,${0.06 + p * 0.1})`;
      roundRect(c, y.x + 2, y.y + 2, y.s - 4, y.s - 4, cs * 0.5); c.fill();
      for (let n = 3; n >= 0; n--) {
        c.lineWidth = n === 0 ? 4 : 5;
        c.strokeStyle = n === 0 ? `rgba(255,255,255,${0.75 + p * 0.25})` : Kit.rgba(n === 1 ? '#ffffff' : col, (0.55 - n * 0.12) * (0.5 + p * 0.5));
        const o = n * 4 + p * 3 * (n > 0 ? 1 : 0);
        roundRect(c, y.x + 2 - o, y.y + 2 - o, y.s - 4 + o * 2, y.s - 4 + o * 2, cs * 0.5 + o); c.stroke();
      }
    }
    drawTokens(c, t);
    for (let k = 0; k < 4; k++) drawCard(c, k, t);

    // Logo, wins and what to do, in the gaps beside the board.
    if (L.wide) {
      const lx = L.cards[0].x + L.cards[0].w / 2, rx = L.cards[1].x + L.cards[1].w / 2;
      const midY = (L.cards[0].y + L.cards[0].h + L.cards[3].y) / 2;
      const room = L.cards[3].y - (L.cards[0].y + L.cards[0].h);
      const ts = Math.min(cs * 1.05, L.cards[0].w * 0.17, room * 0.4);
      outlined(c, 'LUDO STAR', lx, midY - ts * 0.4, ts, '#fff6c2', '#ffb703');
      text(c, `★ Wins: ${wins}`, lx, midY + ts * 0.65, ts * 0.5, 'rgba(255,255,255,0.85)', 800);
      text(c, 'Back for games', L.cards[3].x + L.cards[3].w / 2, Math.min(H - cs * 0.35, L.cards[3].y + L.cards[3].h + cs * 0.55), cs * 0.36, 'rgba(255,255,255,0.45)', 700);
      if (state === 'play') {
        const [a, b] = statusLine();
        const col = COLORS[turn];
        text(c, a, rx, midY - ts * 0.4, Math.min(ts * 0.68, L.cards[1].w * 0.11), shade(col, 0.35), 900);
        text(c, b, rx, midY + ts * 0.45, Math.min(ts * 0.48, L.cards[1].w * 0.075), '#ffffff', 800);
      }
    } else if (state === 'play') {
      const [a, b] = statusLine();
      text(c, `${a} · ${b}`, W / 2, H - cs * 0.8, cs * 0.55, '#ffffff', 800);
    }

    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c, t);
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    c.fillStyle = 'rgba(4,10,36,0.72)'; c.fillRect(0, 0, W, H);
    const u = W > H ? Math.min(W / 22, H / 12) : W / 15;
    const k = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(W / 2, H * 0.16); c.scale(k, k);
    outlined(c, 'LUDO STAR', 0, 0, u * 1.5, '#fff6c2', '#ffb703');
    starPath(c, -u * 5.6, -u * 0.05, u * 0.55, u * 0.24); c.fillStyle = '#ffd23f'; c.fill();
    starPath(c, u * 5.6, -u * 0.05, u * 0.55, u * 0.24); c.fill();
    c.restore();
    text(c, 'Who is playing?', W / 2, H * 0.29, u * 0.6, '#ffffff', 800);
    const wide = W > H;
    const cw = wide ? Math.min(u * 4.6, (W * 0.9) / 4.3) : Math.min(W * 0.8, u * 9), ch = wide ? cw * 0.86 : Math.min(H * 0.11, u * 2.3);
    const gap = u * 0.45;
    const total = wide ? cw * 4 + gap * 3 : ch * 4 + gap * 3;
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.36 : H * 0.36;
    L.opts = OPTIONS.map((n, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    OPTIONS.forEach((n, i) => {
      const r = L.opts[i], on = i === menuIx;
      const sc = on ? 1.07 + Math.sin(t * 5) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(sc, sc);
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, u * 0.4, on ? '#ffd23f' : 'rgba(150,180,255,0.3)', on ? '#2f55c4' : '#1c3170', on ? '#14286a' : '#0d1a45');
      if (on) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,210,63,0.5)'; roundRect(c, -r.w / 2 - 4, -r.h / 2 - 4, r.w + 8, r.h + 8, u * 0.45); c.stroke(); }
      const pw = wide ? r.w * 0.19 : r.h * 0.42;
      const py = wide ? -r.h * 0.1 : 0;
      for (let p = 0; p < 4; p++) {
        const px = wide ? -r.w * 0.33 + p * r.w * 0.22 : r.w * 0.08 + p * pw * 1.05;
        c.globalAlpha = p < n ? 1 : 0.55;
        c.drawImage(pinSprite(COLORS[p], cs * 0.92), px - pw / 2, py - pw * 0.8, pw, pw * 1.3);
        c.globalAlpha = 1;
        text(c, p < n ? (n === 1 ? 'YOU' : 'P' + (p + 1)) : 'TV', px, py + pw * 0.75, pw * 0.34, p < n ? '#ffffff' : 'rgba(200,215,255,0.65)', 900);
      }
      const main = n === 1 ? '1 person' : `${n} people`, sub = n === 4 ? 'No TV players' : `+ ${4 - n} TV`;
      if (wide) {
        text(c, main, 0, r.h * 0.25, r.h * 0.14, '#ffffff', 900);
        text(c, sub, 0, r.h * 0.39, r.h * 0.1, 'rgba(255,255,255,0.7)', 700);
      } else {
        text(c, main, -r.w * 0.44, -r.h * 0.13, r.h * 0.26, '#ffffff', 900, 'left');
        text(c, sub, -r.w * 0.44, r.h * 0.2, r.h * 0.18, 'rgba(255,255,255,0.7)', 700, 'left');
      }
      c.restore();
    });
    const by = wide ? y0 + ch + u * 0.9 : y0 + total + u * 0.8;
    text(c, Kit.touchFirst() ? 'Tap to choose and play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, by, u * 0.48, 'rgba(255,255,255,0.85)', 700);
    text(c, `★ Wins: ${wins}`, W / 2, by + u * 0.85, u * 0.5, '#ffd23f', 800);
    text(c, 'Roll a 6 to come out · stars are safe · 6, knock-out or home = roll again', W / 2, by + u * 1.65, u * 0.38, 'rgba(255,255,255,0.6)', 600);
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    const a = clamp((stateT - overT) / 0.45, 0, 1);
    c.fillStyle = `rgba(4,10,36,${0.72 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.9, cs * 13), ph = Math.min(H * 0.9, cs * 13);
    panel(c, -pw / 2, -ph / 2, pw, ph, cs * 0.7, '#ffd23f', '#2a4bb0', '#0f1e57');
    const w0 = ranks[0];
    const title = isHuman(w0) ? (humans === 1 ? 'You win!' : `${label(w0)} wins!`) : `${NAMES[w0]} wins`;
    outlined(c, title, 0, -ph * 0.39, cs * 1.25, '#ffffff', isHuman(w0) ? '#ffd23f' : shade(COLORS[w0], 0.3));
    const rh = ph * 0.105;
    ranks.forEach((p, n) => {
      const y = -ph * 0.27 + n * rh * 1.08;
      roundRect(c, -pw * 0.4, y, pw * 0.8, rh, rh * 0.3);
      c.fillStyle = n === 0 ? 'rgba(255,210,63,0.18)' : 'rgba(255,255,255,0.08)'; c.fill();
      const ms = rh * 0.85;
      if (n < 3) c.drawImage(medalSprite(n, ms), -pw * 0.36, y + rh / 2 - ms * 0.62, ms, ms * 1.25);
      else text(c, '4th', -pw * 0.36 + ms / 2, y + rh / 2, rh * 0.36, 'rgba(255,255,255,0.6)', 800);
      const pw2 = rh * 0.62;
      c.drawImage(pinSprite(COLORS[p], cs * 0.92), -pw * 0.22, y + rh / 2 - pw2 * 0.75, pw2, pw2 * 1.3);
      text(c, label(p), -pw * 0.22 + pw2 * 1.4, y + rh / 2, rh * 0.42, '#ffffff', 900, 'left');
      text(c, NAMES[p], pw * 0.36, y + rh / 2, rh * 0.32, shade(COLORS[p], 0.4), 800, 'right');
    });
    text(c, `★ Wins: ${wins}`, 0, ph * 0.23, cs * 0.55, '#ffd23f', 800);
    const ready = stateT - overT > 1.4;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.31, cs * 0.6, '#9ff0ff', 800);
    const bw = cs * 6.4, bh = cs * 0.85;
    roundRect(c, -bw / 2, ph * 0.37, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Change players' : 'Arrows  change players', 0, ph * 0.37 + bh / 2, cs * 0.42, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.37 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (wins > 0) Kit.record('ludostar', wins);
})();
