// Flip Disc: the classic flipping-disc game on an 8×8 board. Place a disc so it traps a straight line of the
// other colour between it and one of yours: every trapped disc flips over to your colour. No move? You pass.
// Most discs when nobody can move wins. Person vs person, or vs the TV (Beginner random, Normal greedy,
// Hard looks three moves ahead and loves corners). Soft dots show legal moves (always on Beginner).
// Remote: arrows move the glowing square, OK places a disc. Touch/mouse: tap a square. M mutes.
'use strict';

(() => {
  const { ease, shade, rgba, roundRect, clamp, lerp } = Kit;
  const ID = 'flipdisc';
  const AUTO = /auto/i.test(location.hash);
  const FAST = AUTO ? 12 : 1;
  const N = 8;
  const SEATS = [
    { name: 'Dark', color: '#9b8cff' },
    { name: 'Light', color: '#ffc94d' },
  ];
  const SKILLS = [
    { id: 'beginner', name: 'Beginner', tip: 'The TV picks any move  ·  move dots and flip previews' },
    { id: 'normal', name: 'Normal', tip: 'The TV grabs the biggest flip it can see' },
    { id: 'hard', name: 'Hard', tip: 'The TV thinks 3 moves ahead and hunts corners' },
  ];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const DIRS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const WEIGHT = [
    120, -25, 20, 5, 5, 20, -25, 120,
    -25, -45, -5, -5, -5, -5, -45, -25,
    20, -5, 15, 3, 3, 15, -5, 20,
    5, -5, 3, 3, 3, 3, -5, 5,
    5, -5, 3, 3, 3, 3, -5, 5,
    20, -5, 15, 3, 3, 15, -5, 20,
    -25, -45, -5, -5, -5, -5, -45, -25,
    120, -25, 20, 5, 5, 20, -25, 120,
  ];

  // ---------- Setup and records ----------
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, SKILLS.length - 1);
  const saved = Kit.store.get(ID + '.setup', null) || {};
  const seatTv = [false, true];
  if (Array.isArray(saved.tv)) for (let i = 0; i < 2; i++) seatTv[i] = !!saved.tv[i];
  let hintsOn = Kit.store.get(ID + '.hints', true) !== false;
  let wins = Kit.store.get(ID + '.wins', 0) | 0;

  // ---------- State ----------
  let state = 'menu', stateT = 0, clock = 0, menuRow = 3, seatFocus = 0, overBtn = 0, overT = 0;
  let players = [], turn = 0, board = new Uint8Array(64), anim = [], legal = [], cur = 19, view = { x: 3, y: 2 };
  let later = null, think = 0, tvTarget = -1, banner = null, winnerIx = -1, tie = false, newWin = false, lastMove = -1;
  let hidden = false;
  const human = (i) => players[i] && !players[i].tv;
  const humans = () => players.filter((p) => !p.tv).length;
  const showDots = () => skill === 0 || hintsOn;

  // ---------- Rules ----------
  function flipsFor(b, i, p) {
    if (b[i]) return [];
    const x0 = i % N, y0 = (i / N) | 0, o = 3 - p, out = [];
    for (const [dx, dy] of DIRS) {
      let x = x0 + dx, y = y0 + dy;
      const run = [];
      while (x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === o) { run.push(y * N + x); x += dx; y += dy; }
      if (run.length && x >= 0 && y >= 0 && x < N && y < N && b[y * N + x] === p) out.push(...run);
    }
    return out;
  }
  function movesFor(b, p) {
    const m = [];
    for (let i = 0; i < 64; i++) if (!b[i] && flipsFor(b, i, p).length) m.push(i);
    return m;
  }
  function countOf(b, p) { let n = 0; for (let i = 0; i < 64; i++) if (b[i] === p) n++; return n; }
  function play(b, i, p) {
    const f = flipsFor(b, i, p);
    const nb = b.slice(); nb[i] = p; f.forEach((k) => { nb[k] = p; });
    return nb;
  }

  // ---------- The TV ----------
  function evaluate(b, p) {
    const o = 3 - p;
    let s = 0;
    for (let i = 0; i < 64; i++) {
      if (!b[i]) continue;
      let w = WEIGHT[i];
      // Once a corner is taken, the squares next to it are no longer dangerous.
      if (w < 0) {
        const x = i % N, y = (i / N) | 0;
        const cx = x < 4 ? 0 : 7, cy = y < 4 ? 0 : 7;
        if (b[cy * N + cx]) w = 8;
      }
      s += b[i] === p ? w : -w;
    }
    const mp = movesFor(b, p).length, mo = movesFor(b, o).length;
    s += (mp - mo) * 6;
    return s;
  }
  function search(b, p, me, depth, alpha, beta) {
    const moves = movesFor(b, p);
    if (!depth) return evaluate(b, me);
    if (!moves.length) {
      if (!movesFor(b, 3 - p).length) {
        const d = countOf(b, me) - countOf(b, 3 - me);
        return d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0;
      }
      return search(b, 3 - p, me, depth - 1, alpha, beta);
    }
    if (p === me) {
      let v = -1e9;
      for (const m of moves) {
        v = Math.max(v, search(play(b, m, p), 3 - p, me, depth - 1, alpha, beta));
        alpha = Math.max(alpha, v); if (alpha >= beta) break;
      }
      return v;
    }
    let v = 1e9;
    for (const m of moves) {
      v = Math.min(v, search(play(b, m, p), 3 - p, me, depth - 1, alpha, beta));
      beta = Math.min(beta, v); if (alpha >= beta) break;
    }
    return v;
  }
  function tvPick(p) {
    const moves = movesFor(board, p);
    if (!moves.length) return -1;
    if (skill === 0) return moves[Math.floor(Math.random() * moves.length)];
    if (skill === 1) {
      let best = [], bv = -1;
      for (const m of moves) { const v = flipsFor(board, m, p).length; if (v > bv) { bv = v; best = [m]; } else if (v === bv) best.push(m); }
      return best[Math.floor(Math.random() * best.length)];
    }
    let best = [], bv = -1e9;
    for (const m of moves) {
      const v = search(play(board, m, p), 3 - p, p, 2, -1e9, 1e9) + Math.random() * 0.5;
      if (v > bv) { bv = v; best = [m]; }
    }
    return best[0];
  }

  // ---------- Flow ----------
  function wait(t, fn) { later = { t: t / FAST, fn }; }
  function startGame() {
    if (AUTO) { seatTv[0] = true; seatTv[1] = true; } else Kit.store.set(ID + '.setup', { tv: seatTv.slice() });
    Kit.store.set(ID + '.skill', skill);
    players = SEATS.map((s, i) => ({ ...s, disc: i + 1, tv: seatTv[i], score: 2, bump: 0 }));
    board = new Uint8Array(64);
    board[27] = 2; board[36] = 2; board[28] = 1; board[35] = 1;
    anim = []; lastMove = -1; winnerIx = -1; banner = null; later = null;
    for (const i of [27, 28, 35, 36]) anim[i] = { kind: 'drop', t0: clock + (i % 3) * 0.08 / FAST, from: 0, to: board[i] };
    cur = 19; view = { x: 3, y: 2 };
    state = 'play'; stateT = 0;
    layout(Kit.W, Kit.H);
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.12, at: 0.08 });
    beginTurn(0);
  }
  function toMenu() { state = 'menu'; stateT = 0; menuRow = 3; banner = null; later = null; }

  function beginTurn(i) {
    turn = i; tvTarget = -1;
    legal = movesFor(board, players[i].disc);
    think = (skill === 2 ? 0.55 : 0.7) * (0.8 + Math.random() * 0.5);
    banner = { t: 0, text: players[i].tv ? `${players[i].name} (TV) plays` : (humans() === 1 ? 'Your turn!' : `${players[i].name}'s turn`), color: players[i].color };
    Kit.tone(NOTES[2], { type: 'triangle', dur: 0.12, vol: 0.12 });
    Kit.tone(NOTES[4], { type: 'sine', dur: 0.14, vol: 0.08, at: 0.07 });
    players[i].bump = 1;
    if (human(i) && legal.length && !legal.includes(cur)) {
      // Start the cursor on the nearest legal square.
      const cx = cur % N, cy = (cur / N) | 0;
      let best = legal[0], bd = 99;
      for (const m of legal) { const d = Math.abs(m % N - cx) + Math.abs(((m / N) | 0) - cy); if (d < bd) { bd = d; best = m; } }
      cur = best;
    }
  }
  const bannerOn = () => banner && banner.t < 1.0 / FAST;

  function place(i) {
    const p = players[turn];
    if (state !== 'play' || board[i] || !legal.includes(i)) { Kit.sfx.nope(); return; }
    const f = flipsFor(board, i, p.disc);
    board[i] = p.disc; lastMove = i;
    anim[i] = { kind: 'drop', t0: clock, from: 0, to: p.disc };
    const x0 = i % N, y0 = (i / N) | 0;
    f.forEach((k) => {
      const d = Math.max(Math.abs(k % N - x0), Math.abs(((k / N) | 0) - y0));
      anim[k] = { kind: 'flip', t0: clock + (0.12 + d * 0.07) / FAST, from: board[k], to: p.disc };
      board[k] = p.disc;
      setTimeout(() => {
        if (state === 'play' || state === 'over') Kit.tone(NOTES[Math.min(9, 2 + d)], { type: 'triangle', dur: 0.07, vol: 0.09, slide: 1.4 });
      }, ((0.12 + d * 0.07) / FAST) * 1000 + 100);
    });
    legal = [];
    const q = cellPx(i);
    Kit.tone(170, { type: 'sine', dur: 0.14, vol: 0.4, slide: 0.6 });
    Kit.noise({ dur: 0.05, vol: 0.12, freq: 1800, q: 1 });
    Kit.burst(q.x, q.y, p.color, 10, 0.5);
    if (f.length >= 5) { Kit.float(`${f.length} flips!`, q.x, q.y - L.cell * 0.5, { color: p.color, size: L.cell * 0.4 }); Kit.shake(4, 0.2); }
    if ([0, 7, 56, 63].includes(i)) { Kit.float('Corner!', q.x, q.y - L.cell * 0.9, { color: '#ffe36b', size: L.cell * 0.42 }); Kit.sfx.chime(); }
    players.forEach((pl) => { pl.score = countOf(board, pl.disc); });
    const settle = 0.25 + 0.12 + 0.07 * 7 + 0.1;
    wait(Math.min(1.0, settle), afterMove);
  }

  function afterMove() {
    const next = 1 - turn;
    if (movesFor(board, players[next].disc).length) { beginTurn(next); return; }
    if (movesFor(board, players[turn].disc).length) {
      const pn = players[next];
      banner = { t: 0, text: `${pn.name}${pn.tv ? ' (TV)' : ''} has no move: pass`, color: '#6b7390' };
      Kit.sfx.nope();
      wait(1.2, () => beginTurn(turn));
      return;
    }
    wait(0.4, endGame);
  }

  function endGame() {
    players.forEach((pl) => { pl.score = countOf(board, pl.disc); });
    const a = players[0].score, b = players[1].score;
    tie = a === b; winnerIx = a >= b ? 0 : 1;
    state = 'over'; overT = 0; overBtn = 0; newWin = false; banner = null;
    if (!tie && !players[winnerIx].tv) {
      wins++; newWin = true;
      Kit.store.set(ID + '.wins', wins); Kit.record(ID, wins);
      Kit.confetti(160); Kit.sfx.win();
    } else if (!tie && humans()) Kit.sfx.over();
    else Kit.sfx.chime();
  }

  // ---------- Keys and taps ----------
  const menuRows = () => ['seats', 'skill', 'hints', 'play'];
  function menuKey(k) {
    const rows = menuRows(), row = rows[menuRow];
    if (k === 'up') { menuRow = (menuRow + rows.length - 1) % rows.length; Kit.sfx.move(); return; }
    if (k === 'down') { menuRow = (menuRow + 1) % rows.length; Kit.sfx.move(); return; }
    const d = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    if (row === 'seats') {
      if (d) { const n = clamp(seatFocus + d, 0, 1); if (n === seatFocus) { Kit.sfx.nope(); return; } seatFocus = n; Kit.sfx.move(); }
      else if (k === 'ok') { seatTv[seatFocus] = !seatTv[seatFocus]; Kit.sfx.pick(); }
    } else if (row === 'skill') {
      if (d) { const n = clamp(skill + d, 0, SKILLS.length - 1); if (n === skill) { Kit.sfx.nope(); return; } skill = n; Kit.store.set(ID + '.skill', skill); Kit.sfx.move(); }
      else if (k === 'ok') startGame();
    } else if (row === 'hints') {
      if (skill === 0) { if (d) Kit.sfx.nope(); else if (k === 'ok') startGame(); return; }
      if (d) { hintsOn = d < 0; Kit.store.set(ID + '.hints', hintsOn); Kit.sfx.move(); }
      else if (k === 'ok') startGame();
    } else if (k === 'ok') startGame();
  }
  function overKey(k) {
    if (overT < 1.2) return;
    if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { overBtn = 1 - overBtn; Kit.sfx.move(); }
    else if (k === 'ok') { if (overBtn === 0) startGame(); else { Kit.sfx.move(); toMenu(); } }
  }
  function moveCur(dx, dy) {
    const x = clamp(cur % N + dx, 0, N - 1), y = clamp(((cur / N) | 0) + dy, 0, N - 1);
    const n = y * N + x;
    if (n === cur) { Kit.tone(200, { type: 'sine', dur: 0.05, vol: 0.06 }); return; }
    cur = n; Kit.sfx.move();
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { menuKey(k); return; }
    if (state === 'over') { overKey(k); return; }
    if (!human(turn) || later || (bannerOn() && banner.t < 0.4 / FAST)) return;
    if (k === 'left') moveCur(-1, 0);
    else if (k === 'right') moveCur(1, 0);
    else if (k === 'up') moveCur(0, -1);
    else if (k === 'down') moveCur(0, 1);
    else if (k === 'ok') place(cur);
  });
  const muteBox = () => ({ x: Kit.W - 64, y: 10, w: 52, h: 52 });
  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const h = (L.hits || []).find((r) => inside(e, r));
        if (!h) return;
        menuRow = menuRows().indexOf(h.row);
        if (h.row === 'seats') { seatFocus = h.v; seatTv[h.v] = !seatTv[h.v]; Kit.sfx.pick(); }
        else if (h.row === 'skill') { skill = h.v; Kit.store.set(ID + '.skill', skill); Kit.sfx.move(); }
        else if (h.row === 'hints') { if (skill) { hintsOn = h.v === 0; Kit.store.set(ID + '.hints', hintsOn); Kit.sfx.move(); } }
        else startGame();
        return;
      }
      if (state === 'over') {
        if (overT < 1.2) return;
        if (inside(e, L.btnMenu)) { Kit.sfx.move(); toMenu(); } else if (inside(e, L.btnAgain)) startGame();
        return;
      }
      if (!human(turn) || later) return;
      const x = Math.floor((e.x - L.ox) / L.cell), y = Math.floor((e.y - L.oy) / L.cell);
      if (x < 0 || y < 0 || x >= N || y >= N) return;
      cur = y * N + x; place(cur);
    },
  });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // ---------- Update ----------
  function update(dt) {
    if (hidden) return;
    clock += dt; stateT += dt;
    players.forEach((p) => { p.bump = Math.max(0, p.bump - dt * 2.2); });
    const f = Math.min(1, dt * 16);
    view.x += (cur % N - view.x) * f; view.y += (((cur / N) | 0) - view.y) * f;
    if (state === 'menu') { if (AUTO && stateT > 0.5) startGame(); return; }
    if (state === 'over') {
      overT += dt;
      if (overT > 1 && Math.random() < dt * 0.5 && !tie && !players[winnerIx].tv) Kit.confetti(30);
      if (AUTO && overT > 2.5) startGame();
      return;
    }
    if (banner) banner.t += dt;
    if (later) { later.t -= dt; if (later.t <= 0) { const fn = later.fn; later = null; fn(); } return; }
    if (!human(turn) && !(banner && banner.t < 0.6 / FAST)) {
      think -= dt * FAST;
      if (think <= 0) {
        if (tvTarget < 0) {
          tvTarget = tvPick(players[turn].disc);
          if (tvTarget < 0) { afterMove(); return; }
          cur = tvTarget; think = 0.35;
        } else { const k = tvTarget; tvTarget = -1; place(k); }
      }
    }
  }

  // ---------- Layout ----------
  let L = { u: 1, cell: 100, ox: 0, oy: 0, cards: [], hits: [] };
  const cellPx = (i) => ({ x: L.ox + (i % N + 0.5) * L.cell, y: L.oy + (((i / N) | 0) + 0.5) * L.cell });
  const boardPic = document.createElement('canvas');
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 1920, H / 1080);
    const wide = W / H > 1.2;
    let cell, ox, oy, cards = [], side = null;
    if (wide) {
      const sw = 480 * u;
      const areaW = W - sw - 120 * u, areaH = H - 110 * u;
      cell = Math.floor(Math.min(areaW, areaH) / (N + 0.9));
      const S = cell * N;
      ox = Math.round(60 * u + (areaW - S) / 2); oy = Math.round((H - S) / 2);
      side = { x: W - sw - 50 * u, y: 70 * u, w: sw, h: H - 140 * u };
      const ch = 130 * u, gap = 24 * u, y0 = side.y + 190 * u;
      for (let i = 0; i < 2; i++) cards.push({ x: side.x, y: y0 + i * (ch + gap), w: sw, h: ch });
    } else {
      const top = 80 * u + 60, ch = Math.min(130 * u + 30, H * 0.11);
      const cw = (W - 40 * u * 2 - 20 * u) / 2;
      cell = Math.floor(Math.min(W * 0.92, H - top - ch - 140) / (N + 0.5));
      const S = cell * N;
      ox = Math.round((W - S) / 2); oy = Math.round(top + ch + 40);
      for (let i = 0; i < 2; i++) cards.push({ x: 40 * u + i * (cw + 20 * u), y: top, w: cw, h: ch });
    }
    L = { u, wide, cell, ox, oy, cards, side, hits: [], S: cell * N };
    sprites.clear();
    bakeBoard();
  }
  Kit.onResize((W, H) => layout(W, H));

  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const key = name + '|' + Math.round(w) + 'x' + Math.round(h);
    let s = sprites.get(key);
    if (s) return s;
    const dpr = DPR();
    s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w * dpr)); s.height = Math.max(1, Math.ceil(h * dpr));
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    try { draw(c, w, h); } catch (e) { /* keep going */ }
    sprites.set(key, s);
    return s;
  }

  // The table: a walnut frame around soft green felt, with grooves between the squares.
  function bakeBoard() {
    const { cell } = L, S = cell * N, pad = cell * 0.42, dpr = DPR();
    const w = S + pad * 2;
    boardPic.width = Math.ceil(w * dpr); boardPic.height = Math.ceil((w + cell * 0.15) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = cell * 0.5; c.shadowOffsetY = cell * 0.15;
    roundRect(c, 0, 0, w, w, cell * 0.3);
    c.fillStyle = '#3a1f10'; c.fill();
    c.restore();
    roundRect(c, 0, 0, w, w, cell * 0.3);
    let g = c.createLinearGradient(0, 0, w, w);
    g.addColorStop(0, '#8a5530'); g.addColorStop(0.5, '#6b3b1d'); g.addColorStop(1, '#4a2612');
    c.fillStyle = g; c.fill();
    // wood grain
    c.save(); roundRect(c, 0, 0, w, w, cell * 0.3); c.clip();
    c.strokeStyle = 'rgba(30,12,4,0.18)'; c.lineWidth = 1.5;
    for (let i = 0; i < 40; i++) {
      const y = (i / 40) * w;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += w / 20) c.lineTo(x, y + Math.sin(x * 0.02 + i) * cell * 0.06);
      c.stroke();
    }
    c.restore();
    c.lineWidth = cell * 0.03; c.strokeStyle = 'rgba(255,220,170,0.35)';
    roundRect(c, cell * 0.04, cell * 0.04, w - cell * 0.08, w - cell * 0.08, cell * 0.27); c.stroke();
    // felt
    c.save();
    roundRect(c, pad - cell * 0.06, pad - cell * 0.06, S + cell * 0.12, S + cell * 0.12, cell * 0.12);
    c.fillStyle = '#20140a'; c.fill();
    roundRect(c, pad, pad, S, S, cell * 0.08); c.clip();
    g = c.createRadialGradient(pad + S * 0.4, pad + S * 0.35, 0, pad + S / 2, pad + S / 2, S * 0.75);
    g.addColorStop(0, '#2fae6c'); g.addColorStop(1, '#136b3f');
    c.fillStyle = g; c.fillRect(pad, pad, S, S);
    // felt speckle
    for (let i = 0; i < 1400; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      c.fillRect(pad + Math.random() * S, pad + Math.random() * S, 2, 2);
    }
    // grooves
    for (let i = 1; i < N; i++) {
      c.fillStyle = 'rgba(0,30,15,0.5)';
      c.fillRect(pad + i * cell - 1.5, pad, 3, S); c.fillRect(pad, pad + i * cell - 1.5, S, 3);
      c.fillStyle = 'rgba(255,255,255,0.08)';
      c.fillRect(pad + i * cell + 1.5, pad, 1, S); c.fillRect(pad, pad + i * cell + 1.5, S, 1);
    }
    // star points
    c.fillStyle = 'rgba(0,30,15,0.6)';
    for (const [x, y] of [[2, 2], [6, 2], [2, 6], [6, 6]]) { c.beginPath(); c.arc(pad + x * cell, pad + y * cell, cell * 0.06, 0, Math.PI * 2); c.fill(); }
    c.restore();
    L.pad = pad;
  }

  // A disc face, seen from above: glossy and slightly domed.
  const faceSprite = (p, s) => sprite('face' + p, s, s, (c, s) => {
    const r = s / 2;
    const dark = p === 1;
    let g = c.createRadialGradient(r * 0.75, r * 0.6, r * 0.05, r, r, r);
    if (dark) { g.addColorStop(0, '#5d5880'); g.addColorStop(0.45, '#26233d'); g.addColorStop(1, '#0b0a14'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#f1ece0'); g.addColorStop(1, '#b9b09c'); }
    c.fillStyle = g; c.beginPath(); c.arc(r, r, r * 0.97, 0, Math.PI * 2); c.fill();
    c.lineWidth = s * 0.03; c.strokeStyle = dark ? 'rgba(155,140,255,0.55)' : 'rgba(255,201,77,0.7)';
    c.beginPath(); c.arc(r, r, r * 0.72, 0, Math.PI * 2); c.stroke();
    c.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.8)';
    c.beginPath(); c.ellipse(r * 0.68, r * 0.52, r * 0.36, r * 0.18, -0.6, 0, Math.PI * 2); c.fill();
  });
  const glowSprite = (color, s) => sprite('glow' + color, s, s, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, rgba(color, 0.55)); g.addColorStop(1, rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });

  // One disc, possibly mid-flip: it turns around its vertical axis and lifts off the felt.
  function drawDisc(c, i, t) {
    const v = board[i]; if (!v) return;
    const q = cellPx(i), cell = L.cell, R = cell * 0.4;
    const a = anim[i];
    let face = v, sx = 1, lift = 0, scale = 1, edge = 0;
    if (a) {
      const k = (clock - a.t0) * FAST;
      if (a.kind === 'flip') {
        const p = clamp(k / 0.42, 0, 1);
        if (p >= 1) anim[i] = null;
        const ang = ease.inOut(p) * Math.PI;
        sx = Math.cos(ang); face = sx >= 0 ? a.from : a.to; sx = Math.abs(sx);
        lift = Math.sin(ang) * cell * 0.28; edge = Math.sin(ang);
      } else {
        const p = clamp(k / 0.3, 0, 1);
        if (p >= 1) anim[i] = null;
        if (k < 0) return;
        scale = 1 + (1 - ease.out(p)) * 0.5; lift = (1 - ease.out(p)) * cell * 0.4;
        c.globalAlpha = clamp(p * 3, 0, 1);
      }
    }
    // shadow on the felt
    c.fillStyle = 'rgba(0,20,10,0.38)';
    c.beginPath(); c.ellipse(q.x + cell * 0.04 + lift * 0.15, q.y + cell * 0.07 + lift * 0.25, R * scale * Math.max(0.35, sx), R * scale * 0.95, 0, 0, Math.PI * 2); c.fill();
    const y = q.y - lift;
    // the disc's edge, seen while it turns (and its thickness at rest)
    const th = R * 0.16;
    const rimW = R * scale * Math.max(0.04, sx) + th * edge;
    c.fillStyle = face === 1 ? '#05040a' : '#8c8473';
    c.beginPath(); c.ellipse(q.x, y + th * 0.6 * (1 - edge), Math.max(1, rimW), R * scale, 0, 0, Math.PI * 2); c.fill();
    const fw = Math.max(0.5, R * scale * sx) * 2, fh = R * scale * 2;
    c.drawImage(faceSprite(face, Math.round(R * 2)), q.x - fw / 2 - th * 0.5 * edge, y - fh / 2, fw, fh);
    c.globalAlpha = 1;
  }

  // ---------- Drawing helpers ----------
  function text(c, str, x, y, size, color, weight = 700, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function fitText(c, str, x, y, size, maxW, color, weight = 700, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    const w = c.measureText(str).width;
    text(c, str, x, y, w > maxW ? size * maxW / w : size, color, weight, align, font);
  }
  function pill(c, x, y, w, h, label, { on = false, focus = false, t = 0, color = '#6c7bff', dim = false } = {}) {
    const k = on && focus ? 1.06 + Math.sin(t * 6) * 0.015 : 1;
    c.save();
    c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    if (dim) c.globalAlpha = 0.45;
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.42);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    if (on) { g.addColorStop(0, shade(color, 0.35)); g.addColorStop(1, shade(color, -0.25)); }
    else { g.addColorStop(0, 'rgba(255,255,255,0.14)'); g.addColorStop(1, 'rgba(255,255,255,0.04)'); }
    c.fillStyle = g; c.fill();
    c.lineWidth = on && focus ? 4 : 2; c.strokeStyle = on && focus ? '#ffffff' : on ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.22)';
    if (on && focus) { c.shadowColor = '#ffffff'; c.shadowBlur = 16; }
    c.stroke();
    c.shadowBlur = 0;
    if (on) { c.fillStyle = 'rgba(255,255,255,0.25)'; roundRect(c, -w / 2 + h * 0.2, -h / 2 + h * 0.1, w - h * 0.4, h * 0.22, h * 0.11); c.fill(); }
    fitText(c, label, 0, h * 0.03, h * 0.42, w * 0.86, on ? '#ffffff' : 'rgba(255,255,255,0.82)', 700, 'center', Kit.FONT);
    c.restore();
  }

  // ---------- Drawing the game ----------
  function drawMarks(c, t) {
    if (state !== 'play' || later) return;
    const pl = players[turn];
    if (!pl) return;
    const cell = L.cell;
    if (showDots() && (human(turn) || skill === 0)) {
      const pulse = 0.75 + Math.sin(t * 3) * 0.12;
      for (const m of legal) {
        const q = cellPx(m);
        c.fillStyle = rgba(pl.color, 0.18 * pulse + 0.1);
        c.beginPath(); c.arc(q.x, q.y, cell * 0.16 * pulse, 0, Math.PI * 2); c.fill();
        c.fillStyle = rgba(pl.color, 0.55);
        c.beginPath(); c.arc(q.x, q.y, cell * 0.07, 0, Math.PI * 2); c.fill();
      }
    }
    // Beginner: show which discs would flip from the cursor square.
    if (skill === 0 && human(turn) && legal.includes(cur)) {
      const f = flipsFor(board, cur, pl.disc);
      c.lineWidth = cell * 0.05;
      c.strokeStyle = rgba(pl.color, 0.6 + Math.sin(t * 6) * 0.3);
      for (const k of f) { const q = cellPx(k); c.beginPath(); c.arc(q.x, q.y, cell * 0.44, 0, Math.PI * 2); c.stroke(); }
    }
  }
  function drawCursor(c, t) {
    if (state !== 'play') return;
    const pl = players[turn]; if (!pl) return;
    const cell = L.cell, x = L.ox + view.x * cell, y = L.oy + view.y * cell;
    const ok = legal.includes(cur) && !later;
    const pulse = 0.5 + 0.5 * Math.sin(t * 6);
    c.save();
    c.shadowColor = ok ? pl.color : '#ffffff'; c.shadowBlur = 14 + pulse * 14;
    c.lineWidth = cell * 0.07; c.strokeStyle = ok ? pl.color : 'rgba(255,255,255,0.55)';
    roundRect(c, x + cell * 0.05, y + cell * 0.05, cell * 0.9, cell * 0.9, cell * 0.16); c.stroke();
    c.shadowBlur = 0;
    c.lineWidth = cell * 0.02; c.strokeStyle = 'rgba(255,255,255,0.9)';
    roundRect(c, x + cell * 0.1, y + cell * 0.1, cell * 0.8, cell * 0.8, cell * 0.12); c.stroke();
    // a ghost disc where it would go
    if (ok && human(turn) && !board[cur]) {
      c.globalAlpha = 0.45 + pulse * 0.2;
      const s = cell * 0.8;
      c.drawImage(faceSprite(pl.disc, Math.round(s)), x + cell / 2 - s / 2, y + cell / 2 - s / 2, s, s);
      c.globalAlpha = 1;
    }
    c.restore();
  }

  function drawCard(c, i, t) {
    const r = L.cards[i], p = players[i]; if (!r || !p) return;
    const on = state === 'play' && i === turn;
    const k = 1 + p.bump * 0.04;
    c.save();
    c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
    Kit.glass(c, -r.w / 2, -r.h / 2, r.w, r.h, r.h * 0.28, { tint: on ? rgba(p.color, 0.32) : 'rgba(255,255,255,0.06)', glow: on ? p.color : null, t });
    const cs = r.h * 0.66;
    c.drawImage(faceSprite(p.disc, Math.round(cs)), -r.w / 2 + r.h * 0.16, -cs / 2, cs, cs);
    const tx = -r.w / 2 + r.h * 0.3 + cs;
    fitText(c, p.name, tx, -r.h * 0.14, r.h * 0.3, r.w * 0.42, '#ffffff', 700, 'left', Kit.FONT);
    text(c, p.tv ? `📺 TV  ·  ${SKILLS[skill].name}` : (humans() === 1 ? '🙂 You' : '🙂 Person'), tx, r.h * 0.22, r.h * 0.19, 'rgba(255,255,255,0.75)', 600, 'left');
    text(c, String(p.score), r.w / 2 - r.h * 0.28, r.h * 0.03, r.h * 0.5, '#ffffff', 700, 'right', Kit.FONT);
    c.restore();
  }
  function drawSide(c, t) {
    const u = L.u;
    if (L.wide && L.side) {
      const sd = L.side;
      Kit.title(c, 'Flip Disc', sd.x + sd.w / 2, sd.y + 40 * u, 72 * u, { color: '#ffd98a', glow: 'rgba(255,200,90,0.45)' });
      text(c, `${SKILLS[skill].name}  ·  move dots ${showDots() ? 'on' : 'off'}`, sd.x + sd.w / 2, sd.y + 110 * u, 30 * u, 'rgba(240,235,220,0.8)', 600);
    }
    players.forEach((p, i) => drawCard(c, i, t));
    const last = L.cards[1]; if (!last) return;
    const y = L.wide ? last.y + last.h + 70 * u : L.oy + L.S + 50;
    const cx = L.wide ? L.side.x + L.side.w / 2 : Kit.W / 2;
    let msg;
    if (state === 'over') msg = 'Game over';
    else if (human(turn)) msg = Kit.touchFirst() ? 'Tap a dot to place a disc' : 'Arrows move  ·  OK places';
    else msg = `${players[turn].name} (TV) is thinking…`;
    c.globalAlpha = human(turn) && state === 'play' ? 0.85 + Math.sin(t * 5) * 0.15 : 1;
    text(c, msg, cx, y, Math.max(18, 34 * u), human(turn) ? '#ffe36b' : '#ffffff', 700);
    c.globalAlpha = 1;
    if (L.wide) {
      const empty = 64 - players[0].score - players[1].score;
      text(c, `${empty} empty square${empty === 1 ? '' : 's'}`, cx, y + 56 * u, 30 * u, 'rgba(240,235,220,0.75)', 600);
      text(c, `👑 Wins: ${wins}`, cx, y + 110 * u, 32 * u, '#ffd23f', 700, 'center', Kit.FONT);
      // a score bar: how much of the board each side holds
      const bw = L.side.w * 0.9, bx = cx - bw / 2, by = y + 160 * u, bh = 26 * u;
      const tot = Math.max(1, players[0].score + players[1].score), a = bw * players[0].score / tot;
      roundRect(c, bx, by, bw, bh, bh / 2); c.fillStyle = '#f1ece0'; c.fill();
      c.save(); roundRect(c, bx, by, bw, bh, bh / 2); c.clip();
      c.fillStyle = '#26233d'; c.fillRect(bx, by, a, bh); c.restore();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.5)'; roundRect(c, bx, by, bw, bh, bh / 2); c.stroke();
    }
  }

  function drawBanner(c) {
    if (!banner || state !== 'play') return;
    const T = (banner.text.includes('pass') ? 1.3 : 1.0) / FAST, k = banner.t;
    if (k > T) return;
    const W = Kit.W, H = Kit.H, u = L.u;
    const inK = ease.back(clamp(k / (0.28 / FAST), 0, 1)), outK = clamp((k - T * 0.72) / (T * 0.28), 0, 1);
    const w = Math.min(W * 0.9, 1040 * u), h = 150 * u;
    c.save();
    c.globalAlpha = 1 - outK;
    c.translate(W / 2 + (1 - inK) * -W * 0.6 + outK * W * 0.4, H / 2);
    c.rotate(-0.03);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.3);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(banner.color, 0.2)); g.addColorStop(1, shade(banner.color, -0.45));
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.lineWidth = 6 * u; c.strokeStyle = '#ffffff'; c.stroke();
    c.font = `700 ${Math.round(80 * u)}px ${Kit.FONT}`;
    const tw = c.measureText(banner.text).width, size = tw > w * 0.88 ? 80 * u * (w * 0.88) / tw : 80 * u;
    Kit.title(c, banner.text, 0, 4 * u, size, { color: '#ffffff' });
    c.restore();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(10,8,4,0.55)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.94, 1240 * u), ph = Math.min(H * 0.96, 980 * u);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(clamp(stateT / 0.45, 0, 1));
    c.save();
    c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    roundRect(c, px, py, pw, ph, 40 * u); c.fillStyle = 'rgba(10,26,18,0.72)'; c.fill();
    Kit.glass(c, px, py, pw, ph, 40 * u, { tint: 'rgba(30,70,50,0.6)', edge: 'rgba(200,255,220,0.4)' });
    const cx = W / 2;
    // title with a spinning disc either side
    Kit.title(c, 'Flip Disc', cx, py + 85 * u, 110 * u, { color: '#ffd98a', glow: 'rgba(255,200,90,0.5)' });
    c.font = `700 ${Math.round(110 * u)}px ${Kit.FONT}`;
    const tw = c.measureText('Flip Disc').width, ds = 84 * u;
    for (const s of [-1, 1]) {
      const sx = Math.cos(t * 2.2 + (s > 0 ? Math.PI / 2 : 0)), face = sx >= 0 ? 1 : 2;
      const w = Math.max(2, ds * Math.abs(sx));
      c.drawImage(faceSprite(face, Math.round(ds)), cx + s * (tw / 2 + 80 * u) - w / 2, py + 85 * u - ds / 2, w, ds);
    }
    text(c, 'Trap a line of the other colour to flip it to yours. Most discs wins!', cx, py + 165 * u, 32 * u, 'rgba(240,250,240,0.88)', 600);
    L.hits = [];
    const rows = menuRows();
    const rowY = { seats: py + 305 * u, skill: py + 475 * u, hints: py + 690 * u, play: py + 840 * u };
    const lab = (s, y, on) => text(c, s, cx, y, 32 * u, on ? '#ffe36b' : 'rgba(215,240,225,0.85)', 700);
    {
      const on = rows[menuRow] === 'seats', y = rowY.seats;
      lab(Kit.touchFirst() ? 'Tap a side to switch Person / TV' : 'Who plays?  ◀ ▶ pick  ·  OK switches Person / TV', y - 82 * u, on);
      const w = 340 * u, h = 116 * u, gap = 30 * u, x0 = cx - (w * 2 + gap) / 2;
      for (let i = 0; i < 2; i++) {
        const x = x0 + i * (w + gap), f = on && i === seatFocus;
        const kk = f ? 1.06 + Math.sin(t * 6) * 0.015 : 1;
        c.save(); c.translate(x + w / 2, y); c.scale(kk, kk);
        Kit.glass(c, -w / 2, -h / 2, w, h, 26 * u, { tint: rgba(SEATS[i].color, f ? 0.4 : 0.18), glow: f ? '#ffffff' : null, t });
        const cs = 74 * u;
        c.drawImage(faceSprite(i + 1, Math.round(cs)), -w / 2 + 16 * u, -cs / 2, cs, cs);
        fitText(c, `${SEATS[i].name}${i === 0 ? ' · goes first' : ''}`, -w / 2 + 106 * u, -20 * u, 32 * u, w - 124 * u, '#ffffff', 700, 'left', Kit.FONT);
        text(c, seatTv[i] ? '📺 TV' : '🙂 Person', -w / 2 + 106 * u, 22 * u, 28 * u, seatTv[i] ? '#aee3ff' : '#ffe9a8', 700, 'left');
        c.restore();
        L.hits.push({ x, y: y - h / 2, w, h, row: 'seats', v: i });
      }
    }
    {
      const on = rows[menuRow] === 'skill', y = rowY.skill;
      lab('Skill', y - 62 * u, on);
      const w = 250 * u, h = 80 * u, gap = 24 * u, x0 = cx - (w * 3 + gap * 2) / 2;
      SKILLS.forEach((s, i) => {
        const x = x0 + i * (w + gap);
        pill(c, x, y - h / 2, w, h, s.name, { on: skill === i, focus: on, t, color: ['#20c46a', '#3d8bff', '#ff4d6d'][i] });
        L.hits.push({ x, y: y - h / 2, w, h, row: 'skill', v: i });
      });
      text(c, SKILLS[skill].tip, cx, y + 70 * u, 28 * u, 'rgba(240,250,240,0.8)', 600);
    }
    {
      const on = rows[menuRow] === 'hints', y = rowY.hints;
      lab(skill === 0 ? 'Move dots  (always on for Beginner)' : 'Show legal moves as dots?', y - 60 * u, on);
      const w = 200 * u, h = 76 * u, gap = 24 * u, x0 = cx - (w * 2 + gap) / 2;
      ['On', 'Off'].forEach((s, i) => {
        const x = x0 + i * (w + gap);
        const sel = skill === 0 ? i === 0 : (i === 0) === hintsOn;
        pill(c, x, y - h / 2, w, h, s, { on: sel, focus: on, t, color: '#c08a3e', dim: skill === 0 && i === 1 });
        L.hits.push({ x, y: y - h / 2, w, h, row: 'hints', v: i });
      });
    }
    {
      const on = rows[menuRow] === 'play', y = rowY.play;
      const w = 360 * u, h = 96 * u;
      const kk = on ? 1.07 + Math.sin(t * 6) * 0.02 : 1;
      c.save(); c.translate(cx, y); c.scale(kk, kk);
      roundRect(c, -w / 2, -h / 2, w, h, h / 2);
      const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
      g.addColorStop(0, '#7dffb0'); g.addColorStop(1, '#14a85a');
      c.fillStyle = g;
      if (on) { c.shadowColor = '#7dffb0'; c.shadowBlur = 30; }
      c.fill(); c.shadowBlur = 0;
      c.lineWidth = on ? 5 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(0,60,30,0.6)'; c.stroke();
      Kit.title(c, '▶  Play', 0, 2 * u, 52 * u, { color: '#ffffff' });
      c.restore();
      L.hits.push({ x: cx - w / 2, y: y - h / 2, w, h, row: 'play' });
    }
    text(c, Kit.touchFirst() ? 'Tap to choose  ·  tap Play' : '▲▼ choose a row  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - 48 * u, 27 * u, 'rgba(225,240,230,0.7)', 600);
    const bw = 260 * u, bh = 54 * u;
    roundRect(c, cx - bw / 2, py - bh / 2, bw, bh, bh / 2);
    c.fillStyle = '#1d3a2a'; c.fill(); c.lineWidth = 3 * u; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, `👑 Wins: ${wins}`, cx, py + 2 * u, 30 * u, '#ffd23f', 700, 'center', Kit.FONT);
    c.restore();
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((overT - 0.5) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(8,8,4,${0.55 * a})`; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.92, 900 * u), ph = Math.min(H * 0.9, 600 * u);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const wp = players[winnerIx];
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 40 * u); c.fillStyle = 'rgba(10,26,18,0.88)'; c.fill();
    Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 40 * u, { tint: tie ? 'rgba(60,80,70,0.7)' : rgba(wp.color, 0.35), edge: 'rgba(255,255,255,0.5)' });
    let y = -ph / 2 + 80 * u;
    const title = tie ? "It's a draw!" : wp.tv ? `${wp.name} (TV) wins` : (humans() === 1 ? 'You win!' : `${wp.name} wins!`);
    Kit.title(c, title, 0, y, 86 * u, { color: '#ffffff', glow: tie ? null : wp.color });
    y += 72 * u;
    text(c, newWin ? `🎉 New win!  👑 Wins: ${wins}` : `👑 Wins: ${wins}`, 0, y, 32 * u, '#ffd23f', 700);
    y += 90 * u;
    const ds = 110 * u;
    players.forEach((p, i) => {
      const x = (i ? 1 : -1) * 190 * u;
      c.drawImage(faceSprite(p.disc, Math.round(ds)), x - ds / 2, y - ds / 2, ds, ds);
      text(c, String(p.score), x, y + 4 * u, 50 * u, i ? '#3a2c10' : '#ffffff', 700, 'center', Kit.FONT);
      text(c, `${p.name}${p.tv ? ' (TV)' : ''}`, x, y + ds / 2 + 30 * u, 30 * u, '#ffffff', 700, 'center', Kit.FONT);
    });
    text(c, '–', 0, y, 60 * u, 'rgba(255,255,255,0.7)', 700, 'center', Kit.FONT);
    const ready = overT > 1.2;
    c.globalAlpha = ready ? 1 : 0.45;
    const bw = 280 * u, bh = 84 * u, by = ph / 2 - bh - 36 * u;
    pill(c, -bw - 20 * u, by, bw, bh, '↻  Play again', { on: true, focus: overBtn === 0, t, color: overBtn === 0 ? '#20c46a' : '#3a4a40' });
    pill(c, 20 * u, by, bw, bh, '☰  Menu', { on: true, focus: overBtn === 1, t, color: overBtn === 1 ? '#3d8bff' : '#3a4a40' });
    c.globalAlpha = 1;
    c.restore();
    L.btnAgain = { x: W / 2 + (-bw - 20 * u) * k, y: H / 2 + by * k, w: bw * k, h: bh * k };
    L.btnMenu = { x: W / 2 + 20 * u * k, y: H / 2 + by * k, w: bw * k, h: bh * k };
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#24361f', '#0a1209', 'rgba(255,220,140,0.10)');
    if (!players.length && state === 'menu') demoBoard();
    const pad = L.pad || 0;
    c.drawImage(boardPic, L.ox - pad, L.oy - pad, boardPic.width / DPR(), boardPic.height / DPR());
    drawMarks(c, t);
    for (let i = 0; i < 64; i++) drawDisc(c, i, t);
    if (lastMove >= 0 && state === 'play') {
      const q = cellPx(lastMove);
      c.fillStyle = 'rgba(255,80,80,0.85)';
      c.beginPath(); c.arc(q.x, q.y, L.cell * 0.05, 0, Math.PI * 2); c.fill();
    }
    if (state === 'play' && human(turn)) drawCursor(c, t);
    else if (state === 'play' && tvTarget >= 0) drawCursor(c, t);
    if (players.length && state !== 'menu') drawSide(c, t);
    drawBanner(c);
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c, t);
  }
  let demoDone = false;
  function demoBoard() {
    if (demoDone) return;
    demoDone = true;
    board = new Uint8Array(64);
    board[27] = 2; board[36] = 2; board[28] = 1; board[35] = 1;
    let p = 1;
    for (let n = 0; n < 18; n++) {
      const m = movesFor(board, p);
      if (!m.length) break;
      board = play(board, m[Math.floor(Math.random() * m.length)], p);
      p = 3 - p;
    }
  }

  window.__game = () => ({ state, turn, human: human(turn), scores: players.map((p) => p.score), cur: { x: cur % N, y: (cur / N) | 0 }, goal: legal.length ? { x: legal[0] % N, y: (legal[0] / N) | 0 } : null, vstep: 1, hstep: 1 });

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run((dt, t) => {
    try { update(dt, t); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } }
  }, (c, t) => {
    try { draw(c, t); } catch (e) { try { console.error(e); } catch (e2) { /* ignore */ } }
  });
  layout(Kit.W, Kit.H);
  Kit.canvas.focus();
  if (wins > 0) Kit.record(ID, wins);
})();
