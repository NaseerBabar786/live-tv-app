// Snakes & Ladders: race your pawn from Start to square 100 on a cartoon board. Roll the dice, hop
// along, climb the ladders and slide down the snakes; a six rolls again and you must land on 100
// exactly. One to four people play; the other seats are played by the TV.
// Remote: OK rolls (menu: arrows choose, OK plays). Touch: tap to roll. M mutes.
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;

  // Same board as the old game: ladders go up, snakes come down.
  const JUMPS = {
    2: 38, 7: 14, 8: 31, 15: 26, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 78: 98, 87: 94,
    16: 6, 46: 25, 49: 11, 62: 19, 64: 60, 74: 53, 89: 68, 92: 88, 95: 75, 99: 80,
  };
  const SEATS = [
    { name: 'Red', c: '#ff4757' },
    { name: 'Blue', c: '#3d8bff' },
    { name: 'Green', c: '#2ed573' },
    { name: 'Yellow', c: '#ffc312' },
  ];
  const SNAKE_SKINS = [
    { body: '#7bd84f', dark: '#3c8f22', mark: '#f6ff7a', spots: false },
    { body: '#b36bff', dark: '#6a2fc0', mark: '#ffd1f4', spots: true },
    { body: '#ff8a3d', dark: '#b84a10', mark: '#fff0a8', spots: false },
    { body: '#ff5fa8', dark: '#b3205f', mark: '#ffe3f0', spots: true },
    { body: '#22c7c0', dark: '#0f7a76', mark: '#d6fffb', spots: false },
    { body: '#ff5252', dark: '#a8141c', mark: '#ffe08a', spots: true },
  ];
  const CELL_COLORS = ['#ffe08a', '#ffb4c8', '#9fe3ff', '#b8f2a0', '#d9bcff'];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];

  /** Square n (1-100) as a cell: 1 at the bottom left, rows zig-zagging up (col, row from top). */
  function cellOf(n) {
    const r = Math.floor((n - 1) / 10), c = (n - 1) % 10;
    return { col: r % 2 === 0 ? c : 9 - c, row: 9 - r };
  }
  // Positions are kept in board cells (0..10 across, 0..10 down) so a resize changes nothing.
  function homeUV(n) {
    if (n <= 0) return { x: -0.85, y: 9.5 };
    const c = cellOf(n);
    return { x: c.col + 0.5, y: c.row + 0.5 };
  }

  // ---------- Snakes and ladders as shapes ----------
  const ladders = [], snakes = [];
  Object.keys(JUMPS).forEach((k) => {
    const from = +k, to = JUMPS[from];
    if (to > from) ladders.push({ from, to, a: homeUV(from), b: homeUV(to) });
  });
  Object.keys(JUMPS).map(Number).filter((k) => JUMPS[k] < k).sort((a, b) => a - b).forEach((from, i) => {
    const to = JUMPS[from];
    const a = homeUV(from), b = homeUV(to);
    snakes.push({ from, to, a, b, skin: SNAKE_SKINS[i % SNAKE_SKINS.length], spine: makeSpine(a, b, i), tongue: Math.random() * 4 });
  });
  // A curvy body: an S-shaped cubic bezier from head to tail, with a little extra wiggle on long snakes.
  function makeSpine(a, b, k) {
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy);
    const nx = -dy / len, ny = dx / len, sg = k % 2 ? 1 : -1;
    const A = Math.min(1.1, 0.45 + len * 0.12) * sg;
    const p1 = { x: a.x + dx * 0.3 + nx * A, y: a.y + dy * 0.3 + ny * A };
    const p2 = { x: a.x + dx * 0.7 - nx * A, y: a.y + dy * 0.7 - ny * A };
    const waves = len > 3.5 ? Math.round(len / 1.6) : 0;
    const pts = [];
    const N = 70;
    for (let i = 0; i <= N; i++) {
      const t = i / N, u = 1 - t;
      let x = u * u * u * a.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * b.x;
      let y = u * u * u * a.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * b.y;
      if (waves) {
        const w = Math.sin(t * Math.PI * waves) * 0.28 * Math.sin(t * Math.PI);
        x += nx * w; y += ny * w;
      }
      pts.push({ x: clamp(x, 0.25, 9.75), y: clamp(y, 0.25, 9.75) });
    }
    let total = 0;
    pts.forEach((p, i) => { if (i) total += Math.hypot(p.x - pts[i - 1].x, p.y - pts[i - 1].y); p.d = total; });
    pts.len = total;
    return pts;
  }
  function alongPath(pts, k) {
    const d = k * pts.len;
    let i = 1;
    while (i < pts.length - 1 && pts[i].d < d) i++;
    const p = pts[i - 1], q = pts[i], s = q.d - p.d || 1;
    const f = clamp((d - p.d) / s, 0, 1);
    return { x: lerp(p.x, q.x, f), y: lerp(p.y, q.y, f) };
  }

  // ---------- Setup and records ----------
  const setup = Kit.store.get('laddersnakes.setup', { people: 1, tv: 1 });
  let people = clamp(setup.people | 0, 1, 4), tvs = clamp(setup.tv | 0, 0, 3);
  function fixTv() { tvs = clamp(tvs, Math.max(0, 2 - people), 4 - people); }
  fixTv();
  let wins = Kit.store.get('laddersnakes.wins', 0), shownWins = wins, winBump = 0;

  // ---------- The game ----------
  // state: 'menu' (a TV-only demo plays behind the menu), 'play', 'win'
  let state = 'menu', demo = true, menuRow = 0;
  let players = [], turn = 0, phase = 'await', phaseT = 0, delay = 0, dice = 6, stepsLeft = 0, anim = null;
  let bannerT = 9, winner = -1, winT = 0, clock = 0, needMsg = '', hint = '';
  let diceRoll = null, diceBounceT = 9;

  function newGame(isDemo) {
    demo = isDemo;
    const n = isDemo ? 4 : people + tvs;
    players = [];
    for (let i = 0; i < n; i++) {
      const s = SEATS[i];
      const human = !isDemo && i < people;
      players.push({
        ...s, human, pos: 0, vx: 0, vy: 0, bump: 0,
        tag: human ? (people === 1 ? 'You' : `Player ${i + 1}`) : 'TV',
      });
    }
    players.forEach((p, i) => { const r = restUV(i); p.vx = r.x; p.vy = r.y; });
    turn = 0; dice = 1 + Math.floor(Math.random() * 6); anim = null; winner = -1;
    startTurn(false);
  }
  const who = (i) => (players[i].human ? (people === 1 ? 'You' : players[i].name) : `${players[i].name} (TV)`);

  function snd(f) { if (!demo) f(); }

  function startTurn(again) {
    phase = 'await'; phaseT = 0; needMsg = '';
    bannerT = 0;
    const p = players[turn];
    snd(() => {
      Kit.tone(again ? 880 : 620, { type: 'triangle', dur: 0.12, vol: 0.14, slide: 1.3 });
      Kit.tone(again ? 1320 : 930, { type: 'sine', dur: 0.12, vol: 0.06, at: 0.06 });
    });
    p.bump = 1;
  }

  function roll() {
    if (phase !== 'await') return;
    dice = 1 + Math.floor(Math.random() * 6);
    phase = 'roll'; phaseT = 0;
    diceRoll = { sx: (2 + Math.floor(Math.random() * 2)) * Math.PI * 2 * (Math.random() < 0.5 ? -1 : 1), sy: (1 + Math.floor(Math.random() * 2)) * Math.PI * 2, sz: (Math.random() - 0.5) * 2 };
    snd(() => {
      Kit.noise({ dur: 0.08, vol: 0.18, freq: 2400, q: 1.5 });
      [0.18, 0.38, 0.55, 0.68].forEach((at, i) => {
        Kit.noise({ dur: 0.05, vol: 0.16 - i * 0.03, freq: 1800 + Math.random() * 900, q: 2, at });
        Kit.tone(320 + Math.random() * 120, { type: 'triangle', dur: 0.04, vol: 0.08 - i * 0.015, at });
      });
    });
  }
  const ROLL_T = 0.85;

  function landDice() {
    const p = players[turn];
    diceBounceT = 0;
    const d = L.dice;
    if (d && !demo) Kit.float(String(dice), d.x, d.y - d.s * 1.05, { color: dice === 6 ? '#ffd23f' : '#ffffff', size: L.cs * 0.75, life: 0.9 });
    snd(() => Kit.tone(dice === 6 ? 1046 : 700, { type: 'triangle', dur: 0.14, vol: 0.18, slide: 1.2 }));
    if (p.pos + dice > 100) {
      needMsg = `${who(turn)} need${p.human && people === 1 ? '' : 's'} exactly ${100 - p.pos}`;
      const u = toXY(homeUV(p.pos));
      if (!demo) Kit.float(`Need ${100 - p.pos}!`, u.x, u.y - L.cs * 0.8, { color: '#ff9fb0', size: L.cs * 0.6, life: 1.3 });
      snd(() => Kit.sfx.nope());
      phase = 'after'; phaseT = 0; delay = 1.1;
      return;
    }
    stepsLeft = dice;
    startHop();
  }

  function startHop() {
    const p = players[turn];
    const from = { x: p.vx, y: p.vy };
    p.pos++;
    const to = restUV(turn);
    p.pos--;
    anim = { kind: 'hop', t: 0, dur: demo ? 0.2 : 0.24, from, to };
    phase = 'hop'; phaseT = 0;
  }

  function arrive() {
    const p = players[turn];
    const to = JUMPS[p.pos];
    if (to) {
      const from = { x: p.vx, y: p.vy };
      if (to > p.pos) {
        const lad = ladders.find((l) => l.from === p.pos);
        const len = Math.hypot(lad.b.x - lad.a.x, lad.b.y - lad.a.y);
        anim = { kind: 'ladder', t: 0, dur: 0.45 + len * 0.16, from, a: lad.a, b: lad.b, to, rung: 0, rungs: Math.max(3, Math.round(len * 2.2)) };
        const u = toXY(homeUV(p.pos));
        if (!demo) Kit.float('Ladder!', u.x, u.y - L.cs * 0.7, { color: '#ffd23f', size: L.cs * 0.62, life: 1.1 });
        snd(() => Kit.tone(523, { type: 'triangle', dur: 0.1, vol: 0.14 }));
      } else {
        const sn = snakes.find((s) => s.from === p.pos);
        anim = { kind: 'snake', t: 0, dur: 0.6 + sn.spine.len * 0.14, from, spine: sn.spine, to, snake: sn };
        const u = toXY(homeUV(p.pos));
        if (!demo) {
          Kit.float('Sssnake!', u.x, u.y - L.cs * 0.7, { color: '#b8ff6a', size: L.cs * 0.62, life: 1.1 });
          Kit.shake(6, 0.25);
        }
        snd(() => {
          Kit.noise({ dur: anim.dur * 0.8, vol: 0.07, freq: 5200, q: 3, type: 'bandpass', sweep: 0.6 });
          Kit.tone(980, { type: 'sine', dur: anim.dur * 0.9, vol: 0.14, slide: 0.22, attack: 0.03 });
        });
        sn.tongue = 0;
      }
      phase = 'jump'; phaseT = 0;
      return;
    }
    anim = null;
    phase = 'after'; phaseT = 0; delay = demo ? 0.25 : 0.4;
  }

  function endMove() {
    const p = players[turn];
    anim = null;
    if (p.pos === 100) { win(turn); return; }
    if (dice === 6) {
      const u = toXY(homeUV(p.pos));
      if (!demo) Kit.float('Six! Roll again', u.x, u.y - L.cs * 0.75, { color: '#ffd23f', size: L.cs * 0.55, life: 1.2 });
      startTurn(true);
    } else {
      turn = (turn + 1) % players.length;
      startTurn(false);
    }
  }

  function win(i) {
    winner = i;
    const p = players[i];
    const u = toXY(homeUV(100));
    Kit.burst(u.x, u.y, p.c, 30, 1.1);
    Kit.burst(u.x, u.y, '#ffd23f', 20, 0.9);
    if (demo) { phase = 'demoEnd'; phaseT = 0; return; }
    state = 'win'; winT = 0;
    Kit.confetti(160);
    Kit.shake(8, 0.3);
    Kit.sfx.win();
    if (p.human) {
      wins++; winBump = 1;
      Kit.store.set('laddersnakes.wins', wins);
      Kit.record('laddersnakes', wins);
    }
  }

  // Where each pawn rests: pawns sharing a square stand side by side.
  const OFFS = [
    [[0, 0]],
    [[-0.19, 0.02], [0.19, -0.02]],
    [[-0.2, 0.1], [0.2, 0.1], [0, -0.14]],
    [[-0.2, 0.13], [0.2, 0.13], [-0.2, -0.13], [0.2, -0.13]],
  ];
  function restUV(i) {
    const pos = players[i].pos;
    const group = [];
    players.forEach((p, j) => { if (p.pos === pos) group.push(j); });
    const off = OFFS[group.length - 1][group.indexOf(i)];
    const base = homeUV(pos), spread = pos === 0 ? 1.15 : 1;
    return { x: base.x + off[0] * spread, y: base.y + off[1] * spread, crowd: group.length };
  }

  function stepGame(dt) {
    phaseT += dt;
    bannerT += dt;
    const p = players[turn];
    if (phase === 'await') {
      if (!p.human && phaseT > (demo ? 0.45 : 0.95)) roll();
    } else if (phase === 'roll') {
      if (phaseT >= ROLL_T) landDice();
    } else if (phase === 'hop') {
      anim.t += dt;
      if (anim.t >= anim.dur) {
        p.pos++; stepsLeft--;
        p.vx = anim.to.x; p.vy = anim.to.y;
        const n = dice - stepsLeft;
        snd(() => {
          Kit.tone(NOTES[Math.min(NOTES.length - 1, n)] * 0.75, { type: 'triangle', dur: 0.08, vol: 0.16 });
          Kit.noise({ dur: 0.04, vol: 0.06, freq: 900, q: 1 });
        });
        if (!demo) { const u = toXY(anim.to); Kit.burst(u.x, u.y + L.cs * 0.25, 'rgba(255,255,255,0.8)', 3, 0.25); }
        p.bump = 0.6;
        if (stepsLeft > 0) startHop(); else arrive();
      }
    } else if (phase === 'jump') {
      anim.t += dt;
      if (anim.kind === 'ladder') {
        const r = Math.floor(clamp(anim.t / anim.dur, 0, 1) * anim.rungs);
        if (r > anim.rung) {
          anim.rung = r;
          snd(() => Kit.tone(NOTES[Math.min(NOTES.length - 1, r)], { type: 'triangle', dur: 0.08, vol: 0.12 }));
        }
      }
      if (anim.t >= anim.dur) {
        const kind = anim.kind;
        p.pos = anim.to;
        const r = restUV(turn);
        anim = { kind: 'settle', t: 0, dur: 0.18, from: { x: p.vx, y: p.vy }, to: r };
        phase = 'after'; phaseT = 0; delay = 0.45;
        const u = toXY(homeUV(p.pos));
        if (kind === 'ladder') {
          if (!demo) Kit.burst(u.x, u.y, '#ffd23f', 16, 0.7);
          snd(() => Kit.sfx.chime());
        } else {
          if (!demo) Kit.burst(u.x, u.y, '#9fe36a', 12, 0.6);
          snd(() => Kit.tone(160, { type: 'sine', dur: 0.2, vol: 0.3, slide: 0.6 }));
          p.bump = 1;
        }
      }
    } else if (phase === 'after') {
      if (anim && anim.kind === 'settle') { anim.t += dt; if (anim.t >= anim.dur) anim = null; }
      if (phaseT >= delay) endMove();
    } else if (phase === 'demoEnd') {
      if (phaseT > 2.5) newGame(true);
    }
    // Pawn positions: the mover follows its animation, the rest glide to where they stand.
    players.forEach((q, i) => {
      q.bump = Math.max(0, q.bump - dt * 2.5);
      if (i === turn && anim) {
        const k = clamp(anim.t / anim.dur, 0, 1);
        let x, y;
        if (anim.kind === 'hop' || anim.kind === 'settle') {
          x = lerp(anim.from.x, anim.to.x, k); y = lerp(anim.from.y, anim.to.y, k);
        } else if (anim.kind === 'ladder') {
          const e = ease.inOut(k);
          const a = lerp(anim.from.x, anim.a.x, Math.min(1, k * 6)), b = lerp(anim.from.y, anim.a.y, Math.min(1, k * 6));
          x = lerp(a, anim.b.x, e); y = lerp(b, anim.b.y, e);
        } else {
          const pt = alongPath(anim.spine, ease.inOut(k));
          x = pt.x; y = pt.y;
        }
        q.vx = x; q.vy = y;
      } else {
        const r = restUV(i);
        const f = Math.min(1, dt * 10);
        q.vx += (r.x - q.vx) * f; q.vy += (r.y - q.vy) * f;
      }
    });
  }

  function start() {
    Kit.store.set('laddersnakes.setup', { people, tv: tvs });
    state = 'play';
    newGame(false);
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
  }
  function toMenu() { state = 'menu'; menuRow = 0; newGame(true); }

  // ---------- Layout ----------
  let L = { cs: 50, bx: 0, by: 0, S: 500, wide: true, side: { x: 0, y: 0, w: 0, h: 0 }, hits: [] };
  const toXY = (uv) => ({ x: L.bx + uv.x * L.cs, y: L.by + uv.y * L.cs });
  const boardPic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H > 1.15;
    let cs, bx, by, side;
    if (wide) {
      cs = Math.floor(Math.min((W * 0.96) / 17.6, (H * 0.95) / 10.7));
      const total = cs * 17.6;
      const x0 = (W - total) / 2;
      bx = Math.round(x0 + cs * 1.5); by = Math.round((H - cs * 10) / 2);
      side = { x: bx + cs * 10 + cs * 0.9, y: by - cs * 0.3, w: cs * 5.2, h: cs * 10.6 };
    } else {
      cs = Math.floor(Math.min((W * 0.94) / 11.6, (H * 0.6) / 10.7));
      bx = Math.round((W - cs * 10) / 2 + cs * 0.7); by = Math.round(H * 0.05 + cs * 0.4);
      side = { x: W * 0.04, y: by + cs * 10.7, w: W * 0.92, h: H - (by + cs * 10.7) - H * 0.02 };
    }
    L = { cs, bx, by, S: cs * 10, wide, side, hits: [] };
    sprites.clear();
    drawBoard();
  }
  Kit.onResize(layout);

  // Shaded things are drawn once per size and colour (gradients are slow on TV boxes).
  const sprites = new Map();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function sprite(name, w, h, draw) {
    const k = `${name}|${Math.round(w)}|${Math.round(h)}`;
    let s = sprites.get(k);
    if (s) return s;
    const dpr = DPR();
    s = document.createElement('canvas');
    s.width = Math.ceil(w * dpr); s.height = Math.ceil(h * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, w, h);
    sprites.set(k, s);
    return s;
  }

  // ---------- The board picture (cells, ladders, snakes), drawn once per size ----------
  function drawBoard() {
    const { cs } = L, S = cs * 10, dpr = DPR();
    const pad = cs * 1.5;
    boardPic.width = Math.ceil((S + pad + cs * 0.5) * dpr); boardPic.height = Math.ceil((S + cs * 0.9) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, pad * dpr, cs * 0.4 * dpr);
    // Frame with a soft drop shadow.
    const fp = cs * 0.28;
    c.save();
    c.shadowColor = 'rgba(0,10,40,0.55)'; c.shadowBlur = cs * 0.5; c.shadowOffsetY = cs * 0.15;
    roundRect(c, -fp, -fp, S + fp * 2, S + fp * 2, cs * 0.45);
    const fg = c.createLinearGradient(0, -fp, 0, S + fp);
    fg.addColorStop(0, '#ffd27a'); fg.addColorStop(1, '#e88a2c');
    c.fillStyle = fg; c.fill();
    c.restore();
    c.lineWidth = cs * 0.05; c.strokeStyle = '#a8561a';
    roundRect(c, -fp, -fp, S + fp * 2, S + fp * 2, cs * 0.45); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = cs * 0.04;
    roundRect(c, -fp + cs * 0.07, -fp + cs * 0.07, S + fp * 2 - cs * 0.14, S + fp * 2 - cs * 0.14, cs * 0.38); c.stroke();
    // Cells
    c.save();
    roundRect(c, 0, 0, S, S, cs * 0.22); c.clip();
    for (let n = 1; n <= 100; n++) {
      const { col, row } = cellOf(n);
      const x = col * cs, y = row * cs;
      const base = CELL_COLORS[(col + row * 2) % CELL_COLORS.length];
      const g = c.createLinearGradient(0, y, 0, y + cs);
      const light = (col + row) % 2 === 0;
      g.addColorStop(0, shade(base, light ? 0.35 : 0.15)); g.addColorStop(1, shade(base, light ? 0 : -0.08));
      c.fillStyle = g; c.fillRect(x, y, cs, cs);
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(x, y, cs, cs * 0.05);
      c.fillStyle = 'rgba(80,40,0,0.12)'; c.fillRect(x, y + cs * 0.95, cs, cs * 0.05); c.fillRect(x + cs * 0.96, y, cs * 0.04, cs);
      if (n === 100) {
        const gg = c.createRadialGradient(x + cs / 2, y + cs / 2, 0, x + cs / 2, y + cs / 2, cs * 0.7);
        gg.addColorStop(0, '#fff6c2'); gg.addColorStop(1, '#ffb703');
        c.fillStyle = gg; c.fillRect(x, y, cs, cs);
        c.font = `${Math.round(cs * 0.5)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText('👑', x + cs / 2, y + cs * 0.58);
      }
      c.font = `900 ${Math.round(cs * 0.27)}px system-ui, sans-serif`;
      c.textAlign = 'left'; c.textBaseline = 'top';
      c.fillStyle = n === 100 ? '#8a4b00' : 'rgba(60,30,80,0.55)';
      c.fillText(String(n), x + cs * 0.08, y + cs * 0.07);
    }
    c.restore();
    // Start pad, left of square 1.
    {
      const s = homeUV(0);
      const x = s.x * cs, y = s.y * cs, r = cs * 0.62;
      c.save();
      c.shadowColor = 'rgba(0,10,40,0.5)'; c.shadowBlur = cs * 0.3; c.shadowOffsetY = cs * 0.08;
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
      const g = c.createRadialGradient(x - r * 0.3, y - r * 0.4, 0, x, y, r);
      g.addColorStop(0, '#9dffcb'); g.addColorStop(1, '#16a35c');
      c.fillStyle = g; c.fill();
      c.restore();
      c.lineWidth = cs * 0.05; c.strokeStyle = '#0d6b3b'; c.stroke();
      c.font = `900 ${Math.round(cs * 0.22)}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#ffffff'; c.fillText('START', x, y - r - cs * 0.18);
    }
    ladders.forEach((l) => drawLadder(c, l));
    snakes.forEach((s) => drawSnake(c, s));
  }

  function drawLadder(c, l) {
    const cs = L.cs;
    const ax = l.a.x * cs, ay = l.a.y * cs, bx = l.b.x * cs, by = l.b.y * cs;
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
    const half = cs * 0.2, ext = cs * 0.18;
    const x0 = ax - ux * ext, y0 = ay - uy * ext, x1 = bx + ux * ext, y1 = by + uy * ext;
    c.save();
    c.lineCap = 'round';
    // Shadow
    c.save();
    c.translate(cs * 0.08, cs * 0.12);
    c.strokeStyle = 'rgba(40,20,60,0.28)'; c.lineWidth = cs * 0.14;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(x0 + nx * half * s, y0 + ny * half * s); c.lineTo(x1 + nx * half * s, y1 + ny * half * s); c.stroke(); }
    c.restore();
    // Rungs
    const rungs = Math.max(2, Math.round(len / (cs * 0.42)));
    for (let i = 0; i <= rungs; i++) {
      const t = (i + 0.5) / (rungs + 1);
      const x = lerp(x0, x1, t), y = lerp(y0, y1, t);
      c.strokeStyle = '#7a3f12'; c.lineWidth = cs * 0.11;
      c.beginPath(); c.moveTo(x - nx * half, y - ny * half); c.lineTo(x + nx * half, y + ny * half); c.stroke();
      c.strokeStyle = '#d9934a'; c.lineWidth = cs * 0.06;
      c.beginPath(); c.moveTo(x - nx * half, y - ny * half); c.lineTo(x + nx * half, y + ny * half); c.stroke();
    }
    // Rails: dark outline, wood, then a light streak.
    for (const s of [-1, 1]) {
      const sx0 = x0 + nx * half * s, sy0 = y0 + ny * half * s, sx1 = x1 + nx * half * s, sy1 = y1 + ny * half * s;
      c.strokeStyle = '#6b3510'; c.lineWidth = cs * 0.15;
      c.beginPath(); c.moveTo(sx0, sy0); c.lineTo(sx1, sy1); c.stroke();
      c.strokeStyle = '#c47a35'; c.lineWidth = cs * 0.09;
      c.beginPath(); c.moveTo(sx0, sy0); c.lineTo(sx1, sy1); c.stroke();
      c.strokeStyle = 'rgba(255,220,160,0.75)'; c.lineWidth = cs * 0.025;
      c.beginPath(); c.moveTo(sx0 - nx * cs * 0.02, sy0 - ny * cs * 0.02); c.lineTo(sx1 - nx * cs * 0.02, sy1 - ny * cs * 0.02); c.stroke();
    }
    c.restore();
  }

  function snakeEdges(s, cs) {
    const pts = s.spine, n = pts.length;
    const left = [], right = [];
    for (let i = 0; i < n; i++) {
      const p = pts[Math.max(0, i - 1)], q = pts[Math.min(n - 1, i + 1)];
      let tx = q.x - p.x, ty = q.y - p.y; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const t = i / (n - 1);
      const w = cs * (0.2 * (1 - t * 0.85) + 0.025) * (t < 0.08 ? 0.85 + t * 1.9 : 1);
      left.push({ x: pts[i].x * cs - ty * w, y: pts[i].y * cs + tx * w });
      right.push({ x: pts[i].x * cs + ty * w, y: pts[i].y * cs - tx * w });
    }
    return { left, right };
  }
  function drawSnake(c, s) {
    const cs = L.cs, sk = s.skin, pts = s.spine;
    const { left, right } = snakeEdges(s, cs);
    const outline = () => {
      c.beginPath();
      c.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) c.lineTo(left[i].x, left[i].y);
      for (let i = right.length - 1; i >= 0; i--) c.lineTo(right[i].x, right[i].y);
      c.closePath();
    };
    // Shadow
    c.save(); c.translate(cs * 0.1, cs * 0.14); outline(); c.fillStyle = 'rgba(40,20,60,0.28)'; c.fill(); c.restore();
    // Body
    outline();
    c.fillStyle = sk.body; c.fill();
    c.save();
    outline(); c.clip();
    // Pattern: bands across, or spots along the back.
    if (!sk.spots) {
      c.fillStyle = sk.mark;
      for (let i = 4; i < left.length - 3; i += 6) {
        c.beginPath();
        c.moveTo(left[i].x, left[i].y); c.lineTo(left[i + 2].x, left[i + 2].y);
        c.lineTo(right[i + 2].x, right[i + 2].y); c.lineTo(right[i].x, right[i].y); c.closePath(); c.fill();
      }
    } else {
      c.fillStyle = sk.mark;
      for (let i = 5; i < pts.length - 4; i += 5) {
        const t = i / (pts.length - 1);
        c.beginPath(); c.arc(pts[i].x * cs, pts[i].y * cs, cs * (0.075 * (1 - t * 0.7)), 0, Math.PI * 2); c.fill();
      }
    }
    // Rounded shading: dark along one side, a light streak along the other.
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = rgba(sk.dark, 0.55); c.lineWidth = cs * 0.09;
    c.beginPath(); right.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = cs * 0.035;
    c.beginPath();
    left.forEach((p, i) => { const q = pts[i]; const x = lerp(p.x, q.x * cs, 0.45), y = lerp(p.y, q.y * cs, 0.45); i ? c.lineTo(x, y) : c.moveTo(x, y); });
    c.stroke();
    c.restore();
    outline(); c.lineWidth = cs * 0.035; c.strokeStyle = sk.dark; c.stroke();
    // Head: round, with a snout pointing away from the body, big eyes and a smile.
    const h = pts[0], nb = pts[4];
    const hx = h.x * cs, hy = h.y * cs;
    let dx = h.x - nb.x, dy = h.y - nb.y; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const r = cs * 0.27;
    c.save();
    c.beginPath(); c.ellipse(hx + dx * r * 0.25, hy + dy * r * 0.25, r * 1.12, r * 0.95, Math.atan2(dy, dx), 0, Math.PI * 2);
    const hg = c.createRadialGradient(hx - r * 0.35, hy - r * 0.45, r * 0.1, hx, hy, r * 1.2);
    hg.addColorStop(0, shade(sk.body, 0.35)); hg.addColorStop(1, sk.body);
    c.fillStyle = hg; c.fill();
    c.lineWidth = cs * 0.035; c.strokeStyle = sk.dark; c.stroke();
    // Eyes stay upright whatever way the head points.
    for (const sx of [-1, 1]) {
      const ex = hx + sx * r * 0.42 + dx * r * 0.15, ey = hy - r * 0.3;
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex, ey, r * 0.34, 0, Math.PI * 2); c.fill();
      c.lineWidth = cs * 0.02; c.strokeStyle = sk.dark; c.stroke();
      c.fillStyle = '#1b1035'; c.beginPath(); c.arc(ex + r * 0.06 + dx * r * 0.06, ey + r * 0.06, r * 0.18, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(ex + r * 0.12, ey - r * 0.04, r * 0.07, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(255,110,150,0.55)';
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(hx + sx * r * 0.62, hy + r * 0.2, r * 0.17, r * 0.1, 0, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = '#3a1230'; c.lineWidth = cs * 0.03; c.lineCap = 'round';
    c.beginPath(); c.arc(hx + dx * r * 0.1, hy + r * 0.12, r * 0.3, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
    c.restore();
    s.mouth = { x: h.x + dx * 0.3, y: h.y + dy * 0.3, dx, dy };
  }

  // A glossy pawn: a round base, a bell body and a ball head with a cute face.
  const pawnSprite = (color, s) => sprite('pawn' + color, s, s, (c) => {
    c.save();
    c.beginPath();
    c.moveTo(s * 0.2, s * 0.86);
    c.bezierCurveTo(s * 0.2, s * 0.7, s * 0.36, s * 0.62, s * 0.39, s * 0.44);
    c.lineTo(s * 0.61, s * 0.44);
    c.bezierCurveTo(s * 0.64, s * 0.62, s * 0.8, s * 0.7, s * 0.8, s * 0.86);
    c.closePath();
    const g = c.createLinearGradient(s * 0.2, 0, s * 0.8, 0);
    g.addColorStop(0, shade(color, -0.35)); g.addColorStop(0.35, shade(color, 0.3)); g.addColorStop(1, shade(color, -0.45));
    c.fillStyle = g; c.fill();
    c.lineWidth = s * 0.035; c.strokeStyle = shade(color, -0.6); c.stroke();
    // Base
    c.beginPath(); c.ellipse(s / 2, s * 0.86, s * 0.31, s * 0.09, 0, 0, Math.PI * 2);
    const bg = c.createLinearGradient(0, s * 0.78, 0, s * 0.95);
    bg.addColorStop(0, shade(color, 0.15)); bg.addColorStop(1, shade(color, -0.5));
    c.fillStyle = bg; c.fill(); c.stroke();
    // Head
    c.beginPath(); c.arc(s / 2, s * 0.3, s * 0.21, 0, Math.PI * 2);
    const hg = c.createRadialGradient(s * 0.42, s * 0.22, s * 0.02, s / 2, s * 0.3, s * 0.22);
    hg.addColorStop(0, shade(color, 0.6)); hg.addColorStop(0.5, color); hg.addColorStop(1, shade(color, -0.4));
    c.fillStyle = hg; c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.beginPath(); c.ellipse(s * 0.43, s * 0.2, s * 0.065, s * 0.04, -0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.35)';
    c.beginPath(); c.ellipse(s * 0.37, s * 0.66, s * 0.03, s * 0.12, 0.25, 0, Math.PI * 2); c.fill();
    // Face
    for (const sx of [-1, 1]) {
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(s / 2 + sx * s * 0.075, s * 0.31, s * 0.05, s * 0.06, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1b1035'; c.beginPath(); c.arc(s / 2 + sx * s * 0.075 + s * 0.008, s * 0.32, s * 0.03, 0, Math.PI * 2); c.fill();
    }
    c.strokeStyle = '#2a1030'; c.lineWidth = s * 0.022; c.lineCap = 'round';
    c.beginPath(); c.arc(s / 2, s * 0.37, s * 0.05, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
    c.restore();
  });
  const ringSprite = (color, s) => sprite('ring' + color, s, s, (c) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.18, s / 2, s / 2, s / 2);
    g.addColorStop(0, rgba(color, 0)); g.addColorStop(0.6, rgba(color, 0.65)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });

  // ---------- 3D dice: six cached faces, each drawn as a parallelogram of a rotating cube ----------
  const PIPS = {
    1: [[0.5, 0.5]], 2: [[0.28, 0.28], [0.72, 0.72]], 3: [[0.27, 0.27], [0.5, 0.5], [0.73, 0.73]],
    4: [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
    5: [[0.27, 0.27], [0.73, 0.27], [0.5, 0.5], [0.27, 0.73], [0.73, 0.73]],
    6: [[0.28, 0.25], [0.72, 0.25], [0.28, 0.5], [0.72, 0.5], [0.28, 0.75], [0.72, 0.75]],
  };
  const faceSprite = (v, s) => sprite('die' + v, s, s, (c) => {
    c.fillStyle = '#e3d9f0'; c.fillRect(0, 0, s, s);
    roundRect(c, s * 0.04, s * 0.04, s * 0.92, s * 0.92, s * 0.2);
    const g = c.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#f1e9fb');
    c.fillStyle = g; c.fill();
    for (const [x, y] of PIPS[v]) {
      const r = s * (v === 1 ? 0.13 : 0.085);
      const pg = c.createRadialGradient(x * s - r * 0.3, y * s - r * 0.3, 0, x * s, y * s, r);
      const col = v === 1 ? '#ff3b5c' : '#2a1d5c';
      pg.addColorStop(0, shade(col, -0.4)); pg.addColorStop(1, col);
      c.fillStyle = pg; c.beginPath(); c.arc(x * s, y * s, r, 0, Math.PI * 2); c.fill();
    }
  });
  const FACES = [
    { v: 1, n: [0, 0, 1], u: [1, 0, 0], w: [0, -1, 0] },
    { v: 6, n: [0, 0, -1], u: [-1, 0, 0], w: [0, -1, 0] },
    { v: 3, n: [1, 0, 0], u: [0, 0, -1], w: [0, -1, 0] },
    { v: 4, n: [-1, 0, 0], u: [0, 0, 1], w: [0, -1, 0] },
    { v: 2, n: [0, 1, 0], u: [1, 0, 0], w: [0, 0, 1] },
    { v: 5, n: [0, -1, 0], u: [1, 0, 0], w: [0, 0, -1] },
  ];
  const mul = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  const app = (M, v) => M.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const rx = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[1, 0, 0], [0, c, -s], [0, s, c]]; };
  const ry = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, 0, s], [0, 1, 0], [-s, 0, c]]; };
  const rz = (a) => { const c = Math.cos(a), s = Math.sin(a); return [[c, -s, 0], [s, c, 0], [0, 0, 1]]; };
  // Turns the cube so face v looks at the viewer.
  const FACE_ROT = { 1: rz(0), 6: rx(Math.PI), 3: ry(-Math.PI / 2), 4: ry(Math.PI / 2), 2: rx(Math.PI / 2), 5: rx(-Math.PI / 2) };
  const LIGHT = (() => { const v = [-0.45, 0.65, 0.62], l = Math.hypot(...v); return v.map((x) => x / l); })();

  function drawDie(c, cx, cy, s, t) {
    let M;
    let lift = 0;
    const tilt = mul(rx(0.38), ry(-0.42));
    if (phase === 'roll' && diceRoll) {
      const k = clamp(phaseT / ROLL_T, 0, 1), e = ease.out(k);
      const spin = mul(mul(rx(diceRoll.sx * (1 - e)), ry(diceRoll.sy * (1 - e))), rz(diceRoll.sz * (1 - e)));
      M = mul(mul(tilt, spin), FACE_ROT[dice]);
      lift = Math.abs(Math.sin(k * Math.PI * 2.5)) * (1 - k) * s * 0.9;
    } else {
      const wob = phase === 'await' && players[turn] && players[turn].human ? Math.sin(t * 3) * 0.06 : 0;
      M = mul(mul(tilt, rz(wob)), FACE_ROT[dice]);
      if (phase === 'await' && players[turn] && players[turn].human) lift = Math.abs(Math.sin(t * 3)) * s * 0.08;
    }
    const sq = diceBounceT < 0.3 ? 1 + Math.sin((diceBounceT / 0.3) * Math.PI) * 0.12 : 1;
    // Shadow on the tray
    c.fillStyle = `rgba(10,10,40,${0.3 - Math.min(0.2, lift / s * 0.2)})`;
    c.beginPath(); c.ellipse(cx, cy + s * 0.78, s * (0.75 - Math.min(0.3, lift / s * 0.3)), s * 0.16, 0, 0, Math.PI * 2); c.fill();
    const oy = cy - lift;
    const vis = FACES.map((f) => ({ f, n: app(M, f.n) })).filter((o) => o.n[2] > 0.01);
    for (const { f, n } of vis) {
      const u = app(M, f.u), w = app(M, f.w);
      const o = [n[0] * 0.5 - u[0] * 0.5 - w[0] * 0.5, n[1] * 0.5 - u[1] * 0.5 - w[1] * 0.5];
      c.save();
      c.translate(cx, oy); c.scale(sq, 2 - sq);
      c.transform(u[0], -u[1], w[0], -w[1], o[0] * s, -o[1] * s);
      c.drawImage(faceSprite(f.v, Math.round(s)), 0, 0, s, s);
      const lit = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
      const a = clamp(0.62 - lit * 0.7, 0, 0.55);
      if (a > 0.01) { c.fillStyle = `rgba(30,10,70,${a})`; c.fillRect(0, 0, s, s); }
      c.restore();
    }
  }

  // ---------- Input ----------
  function menuChange(k) {
    if (k === 'up') menuRow = (menuRow + 2) % 3;
    else if (k === 'down') menuRow = (menuRow + 1) % 3;
    else if (menuRow === 0) { people = clamp(people + (k === 'left' ? -1 : 1), 1, 4); fixTv(); }
    else if (menuRow === 1) { const before = tvs; tvs += k === 'left' ? -1 : 1; fixTv(); if (tvs === before) { Kit.sfx.nope(); return; } }
    else return;
    Kit.sfx.move();
  }
  function tryRoll() {
    if (state === 'play' && phase === 'await' && players[turn].human) roll();
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      if (k === 'ok') start(); else menuChange(k);
      return;
    }
    if (state === 'win') {
      if (winT < 1.4) return;
      if (k === 'ok' || k === 'restart') start();
      else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { Kit.sfx.move(); toMenu(); }
      return;
    }
    if (k === 'ok') tryRoll();
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inside = (e, r) => e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const h = L.hits.find((r) => inside(e, r));
        if (!h) return;
        if (h.act === 'play') { start(); return; }
        if (h.act === 'people') { people = h.v; fixTv(); menuRow = 0; Kit.sfx.move(); }
        if (h.act === 'tv') { if (h.v >= Math.max(0, 2 - people) && h.v <= 4 - people) { tvs = h.v; menuRow = 1; Kit.sfx.move(); } else Kit.sfx.nope(); }
        return;
      }
      if (state === 'win') {
        if (winT < 1.4) return;
        const b = L.menuBtn;
        if (b && inside(e, b)) { Kit.sfx.move(); toMenu(); } else start();
        return;
      }
      tryRoll();
    },
  });
  document.addEventListener('visibilitychange', () => { /* turn based: the loop simply waits while hidden */ });

  // ---------- Update ----------
  function update(dt) {
    if (document.hidden) return;
    clock += dt;
    if (!players.length) newGame(true);
    diceBounceT += dt;
    winBump = Math.max(0, winBump - dt * 2);
    shownWins += (wins - shownWins) * Math.min(1, dt * 6);
    if (Math.abs(wins - shownWins) < 0.02) shownWins = wins;
    snakes.forEach((s) => { s.tongue += dt; if (s.tongue > 3 + (s.from % 4)) s.tongue = 0; });
    if (state === 'menu' || state === 'play') stepGame(dt);
    if (state === 'win') {
      winT += dt;
      players.forEach((q) => { const r = restUV(players.indexOf(q)); q.vx += (r.x - q.vx) * Math.min(1, dt * 10); q.vy += (r.y - q.vy) * Math.min(1, dt * 10); });
      if (winT > 1 && Math.random() < dt * 0.8) Kit.confetti(40);
    }
  }

  // ---------- Drawing ----------
  const FONT = '"Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif';
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(14,20,64,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, top = '#2f5fd0', bottom = '#16307a') {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(2, L.cs * 0.05); c.strokeStyle = border; c.stroke();
  }

  function drawPawns(c, t) {
    const cs = L.cs;
    const order = players.map((p, i) => i).sort((a, b) => players[a].vy - players[b].vy);
    for (const i of order) {
      const p = players[i];
      const { x, y } = toXY({ x: p.vx, y: p.vy });
      const r = restUV(i);
      const crowd = r.crowd > 1 && !(i === turn && anim);
      const base = cs * (crowd ? 0.78 : 0.98);
      let lift = 0, sx = 1, sy = 1;
      if (i === turn && anim && anim.kind === 'hop') {
        const k = clamp(anim.t / anim.dur, 0, 1);
        lift = Math.sin(k * Math.PI) * cs * 0.55;
        const s = k < 0.15 ? (0.15 - k) / 0.15 : 0;
        sx = 1 + s * 0.12; sy = 1 - s * 0.14;
      } else if (i === turn && anim && anim.kind === 'ladder') {
        lift = Math.abs(Math.sin(anim.t * 18)) * cs * 0.08 + cs * 0.12;
      } else if (i === turn && anim && anim.kind === 'snake') {
        lift = cs * 0.05;
      }
      if (p.bump > 0) { const b = Math.sin(p.bump * Math.PI) * 0.1; sx += b; sy -= b; }
      if (state === 'win' && i === winner) lift = Math.abs(Math.sin(clock * 5)) * cs * 0.5;
      const isTurn = i === turn && state !== 'win';
      // Ground shadow and the glow ring under whoever's turn it is.
      if (isTurn) {
        const rs = cs * (1.25 + Math.sin(t * 5) * 0.08);
        c.drawImage(ringSprite(p.c, Math.round(cs * 1.3)), x - rs / 2, y + cs * 0.22 - rs * 0.3, rs, rs * 0.6);
      }
      c.fillStyle = 'rgba(30,10,50,0.28)';
      c.beginPath(); c.ellipse(x, y + base * 0.3, base * (0.3 - Math.min(0.12, lift / cs * 0.15)), base * 0.09, 0, 0, Math.PI * 2); c.fill();
      const w = base * sx, h = base * sy;
      c.drawImage(pawnSprite(p.c, Math.round(cs)), x - w / 2, y + base * 0.38 - h * 0.92 - lift, w, h);
    }
  }

  function drawTongues(c, t) {
    const cs = L.cs;
    for (const s of snakes) {
      if (!s.mouth || s.tongue > 0.45) continue;
      const k = Math.sin((s.tongue / 0.45) * Math.PI);
      const m = toXY(s.mouth);
      const len = cs * (0.12 + k * 0.28);
      const ex = m.x + s.mouth.dx * len, ey = m.y + s.mouth.dy * len;
      const nx = -s.mouth.dy, ny = s.mouth.dx;
      c.strokeStyle = '#ff3b6b'; c.lineWidth = cs * 0.05; c.lineCap = 'round';
      c.beginPath(); c.moveTo(m.x, m.y); c.lineTo(ex, ey);
      c.lineTo(ex + s.mouth.dx * cs * 0.08 + nx * cs * 0.06, ey + s.mouth.dy * cs * 0.08 + ny * cs * 0.06);
      c.moveTo(ex, ey);
      c.lineTo(ex + s.mouth.dx * cs * 0.08 - nx * cs * 0.06, ey + s.mouth.dy * cs * 0.08 - ny * cs * 0.06);
      c.stroke();
    }
  }

  function drawBanner(c) {
    if (demo || state !== 'play' || bannerT > 1.25) return;
    const cs = L.cs, p = players[turn];
    const k = bannerT;
    const inK = ease.back(clamp(k / 0.3, 0, 1)), outK = clamp((k - 0.95) / 0.3, 0, 1);
    const cx = L.bx + L.S / 2, cy = L.by + L.S / 2;
    const w = L.S * 0.78, h = cs * 1.2;
    c.save();
    c.globalAlpha = 1 - outK;
    c.translate(cx + (1 - inK) * -L.S * 0.6 + outK * L.S * 0.4, cy);
    c.rotate(-0.04);
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.3);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(p.c, 0.25)); g.addColorStop(1, shade(p.c, -0.3));
    c.fillStyle = g; c.fill();
    c.lineWidth = cs * 0.07; c.strokeStyle = '#ffffff'; c.stroke();
    c.drawImage(pawnSprite(p.c, Math.round(cs)), -w / 2 + cs * 0.2, -cs * 0.62, cs * 1.1, cs * 1.1);
    const label = p.human ? (people === 1 ? 'Your turn!' : `${p.name}'s turn!`) : `${p.name} (TV) plays`;
    outlined(c, label, cs * 0.45, 0, cs * 0.62, '#ffffff', '#fff1b8');
    c.restore();
  }

  function drawSide(c, t) {
    const cs = L.cs, sd = L.side;
    const wide = L.wide;
    let y = sd.y;
    if (wide) {
      outlined(c, 'Snakes & Ladders', sd.x, y + cs * 0.4, cs * 0.6, '#ffffff', '#9fd8ff', 'left');
      y += cs * 1.05;
    }
    // Player cards
    const n = players.length;
    const cols = wide ? 1 : 2;
    const cw = wide ? sd.w : sd.w * 0.62 / 2 - cs * 0.1, ch = cs * (wide ? 0.95 : 0.8);
    players.forEach((p, i) => {
      const x = wide ? sd.x : sd.x + (i % cols) * (cw + cs * 0.15), yy = wide ? y + i * (ch + cs * 0.14) : sd.y + Math.floor(i / cols) * (ch + cs * 0.12);
      const on = i === turn && state !== 'menu';
      c.save();
      const k = on ? 1 + p.bump * 0.05 : 1;
      c.translate(x + cw / 2, yy + ch / 2); c.scale(k, k);
      panel(c, -cw / 2, -ch / 2, cw, ch, ch * 0.3, on ? '#ffffff' : 'rgba(170,210,255,0.3)', on ? shade(p.c, -0.05) : '#27458f', on ? shade(p.c, -0.45) : '#172c64');
      c.drawImage(pawnSprite(p.c, Math.round(cs)), -cw / 2 + ch * 0.05, -ch * 0.52, ch * 0.98, ch * 0.98);
      text(c, p.name, -cw / 2 + ch * 1.05, -ch * 0.14, ch * 0.36, '#ffffff', 900, 'left');
      text(c, p.tag === 'TV' ? '📺 TV' : p.tag, -cw / 2 + ch * 1.05, ch * 0.22, ch * 0.24, 'rgba(255,255,255,0.8)', 700, 'left');
      text(c, p.pos ? String(p.pos) : '–', cw / 2 - ch * 0.25, 0, ch * 0.48, '#ffffff', 900, 'right');
      // Progress to 100
      const bw = cw - ch * 1.05 - ch * 1.25;
      if (wide && bw > ch) {
        const bx = -cw / 2 + ch * 1.05 + ch * 1.7, by = ch * 0.17;
        c.fillStyle = 'rgba(0,0,0,0.25)'; roundRect(c, bx, by, bw - ch * 0.6, ch * 0.1, ch * 0.05); c.fill();
        c.fillStyle = on ? '#ffffff' : p.c; roundRect(c, bx, by, Math.max(ch * 0.1, (bw - ch * 0.6) * p.pos / 100), ch * 0.1, ch * 0.05); c.fill();
      }
      c.restore();
    });
    // Dice tray
    let tx, ty, tw, th;
    if (wide) { tx = sd.x; ty = y + n * (ch + cs * 0.14) + cs * 0.2; tw = sd.w; th = cs * 3.4; }
    else { tx = sd.x + sd.w * 0.64; ty = sd.y; tw = sd.w * 0.36; th = Math.min(sd.h, cs * 3.2); }
    panel(c, tx, ty, tw, th, cs * 0.4, 'rgba(170,210,255,0.35)', '#1f3c86', '#0f2257');
    const ds = cs * 1.25;
    L.dice = { x: tx + tw / 2, y: ty + th * 0.42, s: ds };
    drawDie(c, tx + tw / 2, ty + th * 0.4, ds, t);
    // What is happening
    const p = players[turn];
    let msg;
    if (state === 'menu') msg = 'Who is playing?';
    else if (state === 'win') msg = `${who(winner)} won!`;
    else if (phase === 'await') msg = p.human ? (Kit.touchFirst() ? 'Tap to roll' : 'Press OK to roll') : 'TV is rolling…';
    else if (phase === 'roll') msg = 'Rolling…';
    else if (needMsg) msg = needMsg;
    else msg = `${who(turn)} rolled ${dice}`;
    const pulse = phase === 'await' && p.human && state === 'play' ? 0.85 + Math.sin(t * 5) * 0.15 : 1;
    c.globalAlpha = pulse;
    const fs = Math.min(cs * 0.42, (tw * 0.92) / Math.max(8, msg.length) * 1.9);
    text(c, msg, tx + tw / 2, ty + th - cs * 0.45, fs, phase === 'await' && p.human ? '#ffe36b' : '#ffffff', 800);
    c.globalAlpha = 1;
    // Wins with a crown
    if (wide) {
      const wy = ty + th + cs * 0.55;
      c.save();
      c.translate(sd.x + sd.w / 2, wy); const k = 1 + winBump * 0.25; c.scale(k, k);
      outlined(c, `👑 Wins: ${Math.round(shownWins)}`, 0, 0, cs * 0.5, '#fff6c2', '#ffb703');
      c.restore();
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    Kit.background(c, t, '#1f63c9', '#081b4a', 'rgba(120,200,255,0.12)');
    if (!players.length) return;
    c.drawImage(boardPic, L.bx - cs * 1.5, L.by - cs * 0.4, boardPic.width / DPR(), boardPic.height / DPR());
    drawTongues(c, t);
    drawPawns(c, t);
    drawSide(c, t);
    drawBanner(c);
    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    if (state === 'menu') drawMenu(c, t);
    if (state === 'win') drawWin(c, t);
  }

  function pill(c, x, y, w, h, label, on, focus, dim, t) {
    const k = on && focus ? 1.08 + Math.sin(t * 6) * 0.02 : on ? 1.04 : 1;
    c.save();
    c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    c.globalAlpha = dim ? 0.35 : 1;
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.35);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    if (on) { g.addColorStop(0, '#ffe36b'); g.addColorStop(1, '#ff9f1c'); } else { g.addColorStop(0, '#3a66c9'); g.addColorStop(1, '#1d3a8a'); }
    c.fillStyle = g; c.fill();
    c.lineWidth = focus && on ? L.cs * 0.08 : L.cs * 0.035; c.strokeStyle = focus && on ? '#ffffff' : 'rgba(255,255,255,0.3)'; c.stroke();
    text(c, label, 0, h * 0.03, h * 0.5, on ? '#4a2300' : '#ffffff', 900);
    c.restore();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    c.fillStyle = 'rgba(6,16,50,0.55)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.92, cs * 12.5), ph = Math.min(H * 0.94, cs * 9.6);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(clamp(clock / 0.5, 0, 1));
    c.save();
    c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    panel(c, px, py, pw, ph, cs * 0.6, '#ffd23f', '#2f5fd0', '#132a6e');
    L.hits = [];
    const cx = W / 2;
    outlined(c, 'Snakes & Ladders', cx, py + cs * 1.0, cs * 1.0, '#ffffff', '#9fd8ff');
    text(c, 'Climb the ladders, dodge the snakes, first to 100 wins!', cx, py + cs * 1.75, cs * 0.36, 'rgba(255,255,255,0.8)', 700);
    const rowY = [py + cs * 2.85, py + cs * 4.35];
    const labelX = px + cs * 0.7;
    const pillW = cs * 1.55, pillH = cs * 0.95, gap = cs * 0.25;
    const pillsX = px + pw - cs * 0.7 - (pillW * 4 + gap * 3);
    // People
    text(c, '🙂 People', labelX, rowY[0], cs * 0.5, menuRow === 0 ? '#ffe36b' : '#ffffff', 900, 'left');
    for (let v = 1; v <= 4; v++) {
      const x = pillsX + (v - 1) * (pillW + gap), y = rowY[0] - pillH / 2;
      pill(c, x, y, pillW, pillH, String(v), people === v, menuRow === 0, false, t);
      L.hits.push({ x, y, w: pillW, h: pillH, act: 'people', v });
    }
    // TV players
    text(c, '📺 TV players', labelX, rowY[1], cs * 0.5, menuRow === 1 ? '#ffe36b' : '#ffffff', 900, 'left');
    for (let v = 0; v <= 3; v++) {
      const x = pillsX + v * (pillW + gap), y = rowY[1] - pillH / 2;
      const ok = v >= Math.max(0, 2 - people) && v <= 4 - people;
      pill(c, x, y, pillW, pillH, String(v), tvs === v, menuRow === 1, !ok, t);
      L.hits.push({ x, y, w: pillW, h: pillH, act: 'tv', v });
    }
    // Who sits where
    const n = people + tvs, sy = py + cs * 5.75, step = cs * 1.9;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * step;
      const bob = Math.sin(t * 4 + i) * cs * 0.06;
      c.drawImage(pawnSprite(SEATS[i].c, Math.round(cs)), x - cs * 0.5, sy - cs * 0.65 + bob, cs, cs);
      text(c, i < people ? (people === 1 ? 'You' : SEATS[i].name) : `${SEATS[i].name} TV`, x, sy + cs * 0.55, cs * 0.3, 'rgba(255,255,255,0.85)', 800);
    }
    // Play button
    const bw = cs * 4, bh = cs * 1.1, bx = cx - bw / 2, by = py + cs * 7.05;
    const on = menuRow === 2;
    const kb = on ? 1.08 + Math.sin(t * 6) * 0.025 : 1;
    c.save();
    c.translate(cx, by + bh / 2); c.scale(kb, kb);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, '#7dffb0'); g.addColorStop(1, '#16b35c');
    c.fillStyle = g; c.fill();
    c.lineWidth = on ? cs * 0.09 : cs * 0.04; c.strokeStyle = on ? '#ffffff' : 'rgba(0,60,30,0.6)'; c.stroke();
    outlined(c, '▶  Play', 0, bh * 0.02, bh * 0.55, '#ffffff', '#e6ffef');
    c.restore();
    L.hits.push({ x: bx, y: by, w: bw, h: bh, act: 'play' });
    text(c, Kit.touchFirst() ? 'Tap to choose  ·  tap Play' : '▲▼ choose  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - cs * 0.55, cs * 0.34, 'rgba(255,255,255,0.75)', 700);
    // Wins badge on the panel's top edge
    const wb = cs * 3.2, wh = cs * 0.62;
    roundRect(c, cx - wb / 2, py - wh / 2, wb, wh, wh / 2);
    c.fillStyle = '#132a6e'; c.fill(); c.lineWidth = cs * 0.05; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, `👑 Wins: ${wins}`, cx, py + wh * 0.03, cs * 0.36, '#ffd23f', 900);
    c.restore();
  }

  function drawWin(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    const a = clamp((winT - 0.6) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(6,16,50,${0.6 * a})`; c.fillRect(0, 0, W, H);
    const p = players[winner];
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, cs * 10), ph = cs * 7.4;
    panel(c, -pw / 2, -ph / 2, pw, ph, cs * 0.7, '#ffd23f', shade(p.c, 0.05), shade(p.c, -0.55));
    const bob = Math.abs(Math.sin(clock * 4)) * cs * 0.25;
    c.drawImage(ringSprite('#ffd23f', Math.round(cs * 2.4)), -cs * 1.2, -ph * 0.3 - cs * 0.7, cs * 2.4, cs * 1.4);
    c.drawImage(pawnSprite(p.c, Math.round(cs)), -cs * 0.8, -ph * 0.5 + cs * 0.15 - bob, cs * 1.6, cs * 1.6);
    const title = p.human ? (people === 1 ? 'You win!' : `${p.name} wins!`) : `${p.name} (TV) wins`;
    outlined(c, title, 0, -ph * 0.06, cs * 1.05, '#ffffff', '#fff1b8');
    text(c, p.human ? '🎉 Straight to square 100!' : 'So close! Try again?', 0, ph * 0.08, cs * 0.45, 'rgba(255,255,255,0.9)', 800);
    c.save(); c.translate(0, ph * 0.2); const kw = 1 + winBump * 0.3; c.scale(kw, kw);
    outlined(c, `👑 Wins: ${Math.round(shownWins)}`, 0, 0, cs * 0.55, '#fff6c2', '#ffb703');
    c.restore();
    const ready = winT > 1.4;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.32, cs * 0.5, '#bfe9ff', 900);
    const bw = cs * 5, bh = cs * 0.7;
    roundRect(c, -bw / 2, ph * 0.38, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.14)'; c.fill();
    text(c, Kit.touchFirst() ? 'Change players' : 'Arrows  change players', 0, ph * 0.38 + bh / 2, cs * 0.34, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.38 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  newGame(true);
  Kit.canvas.focus();
  if (wins > 0) Kit.record('laddersnakes', wins);
})();
