// Four Drop: drop discs into the 7×6 board and be first to line up four, across, down or slanted.
// Play the TV (Easy, Normal or Hard: it looks ahead with minimax) or a friend with 2 Players.
// Remote: Left/Right choose a column, OK (or Down) drops; on the menu Left/Right pick, OK plays.
// Touch and mouse: tap a column to drop there. M or the speaker icon mutes.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const COLS = 7, ROWS = 6;
  const MODES = [
    { id: 'easy', name: 'Easy', icon: '🙂', tip: 'A relaxed TV', depth: 2, slip: 0.35 },
    { id: 'normal', name: 'Normal', icon: '🤖', tip: 'Thinks 4 moves ahead', depth: 4, slip: 0 },
    { id: 'hard', name: 'Hard', icon: '🔥', tip: 'Thinks 7 moves ahead', depth: 7, slip: 0 },
    { id: 'duo', name: '2 Players', icon: '👥', tip: 'Pass the remote', depth: 0, slip: 0 },
  ];
  const RED = '#ff3355', GOLD = '#ffc21a';
  const DISC = [null, RED, GOLD];
  const BOARD = '#2f5bff';
  const ORDER = [3, 2, 4, 1, 5, 0, 6];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];

  // ---------- Records ----------
  let winsBy = Kit.store.get('fourdrop.winsBy', { easy: 0, normal: 0, hard: 0 });
  let wins = Kit.store.get('fourdrop.wins', 0);
  let modeIx = clamp(Kit.store.get('fourdrop.mode', 1), 0, MODES.length - 1);

  // ---------- The game ----------
  // state: 'menu' (the TV plays itself behind the cards), 'play', 'won' (the four sparkle), 'over'
  let state = 'menu', demo = true, mode = MODES[modeIx];
  let board, turn, firstTurn = 1, cursor = 3, hx = 3, falling = null, winLine = [], winner = 0, moves = 0;
  let stateT = 0, endT = 0, aiT = 0, aiCol = -1, tally = [0, 0, 0], shownTally = [0, 0, 0], bumpT = [0, 0, 0];
  let newWin = false, sparkT = 0, nopeT = -9, landT = new Float32Array(COLS * ROWS).fill(-9);

  function reset(isDemo) {
    demo = isDemo;
    board = new Int8Array(COLS * ROWS);
    landT.fill(-9);
    turn = isDemo ? (Math.random() < 0.5 ? 1 : 2) : firstTurn;
    cursor = 3; hx = 3; falling = null; winLine = []; winner = 0; moves = 0; aiCol = -1; aiT = stateT;
  }
  const vsTV = () => mode.id !== 'duo';
  const tvTurn = () => demo || (vsTV() && turn === 2);
  const landing = (b, c) => { for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + c]) return r; return -1; };

  // The four (or more) in a row through cell i, or null.
  function lineThrough(b, i) {
    const who = b[i];
    if (!who) return null;
    const x0 = i % COLS, y0 = (i / COLS) | 0;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line = [i];
      for (const s of [1, -1]) {
        let x = x0 + dx * s, y = y0 + dy * s;
        while (x >= 0 && x < COLS && y >= 0 && y < ROWS && b[y * COLS + x] === who) { line.push(y * COLS + x); x += dx * s; y += dy * s; }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }

  // ---------- The TV: minimax with alpha-beta, looking further ahead on harder levels ----------
  const WINDOWS = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const ex = c + dx * 3, ey = r + dy * 3;
      if (ex < 0 || ex >= COLS || ey < 0 || ey >= ROWS) continue;
      WINDOWS.push([0, 1, 2, 3].map((k) => (r + dy * k) * COLS + c + dx * k));
    }
  }
  function evaluate(b, me) {
    let s = 0;
    for (let r = 0; r < ROWS; r++) { const v = b[r * COLS + 3]; if (v === me) s += 3; else if (v) s -= 3; }
    for (const w of WINDOWS) {
      let mine = 0, theirs = 0;
      for (let k = 0; k < 4; k++) { const v = b[w[k]]; if (v === me) mine++; else if (v) theirs++; }
      if (mine && theirs) continue;
      if (mine === 3) s += 6; else if (mine === 2) s += 2;
      else if (theirs === 3) s -= 8; else if (theirs === 2) s -= 2;
    }
    return s;
  }
  function search(b, depth, alpha, beta, who, me, left) {
    if (left === 0) return 0;
    if (depth === 0) return evaluate(b, me);
    const maxing = who === me;
    let best = maxing ? -Infinity : Infinity, any = false;
    for (const c of ORDER) {
      const r = landing(b, c);
      if (r < 0) continue;
      any = true;
      const i = r * COLS + c;
      b[i] = who;
      let v;
      if (lineThrough(b, i)) v = maxing ? 100000 + depth : -100000 - depth;
      else v = search(b, depth - 1, alpha, beta, 3 - who, me, left - 1);
      b[i] = 0;
      if (maxing) { if (v > best) best = v; if (best > alpha) alpha = best; } else { if (v < best) best = v; if (best < beta) beta = best; }
      if (alpha >= beta) break;
    }
    return any ? best : 0;
  }
  function tvColumn(b, who, level) {
    const open = ORDER.filter((c) => landing(b, c) >= 0);
    const left = b.reduce((n, v) => n + (v ? 0 : 1), 0);
    // Easy slips now and then: a random column, unless it can win right away.
    if (level.slip && Math.random() < level.slip) {
      const win = open.find((c) => { const i = landing(b, c) * COLS + c; b[i] = who; const w = !!lineThrough(b, i); b[i] = 0; return w; });
      return win != null ? win : open[Math.floor(Math.random() * open.length)];
    }
    let bestV = -Infinity, choices = [];
    for (const c of open) {
      const i = landing(b, c) * COLS + c;
      b[i] = who;
      const v = lineThrough(b, i) ? 1e6 : search(b, level.depth - 1, -Infinity, Infinity, 3 - who, who, left - 1);
      b[i] = 0;
      if (v > bestV + 0.5) { bestV = v; choices = [c]; } else if (Math.abs(v - bestV) <= 0.5) choices.push(c);
    }
    return choices[Math.floor(Math.random() * choices.length)];
  }

  // ---------- Moves ----------
  function drop(c) {
    if (falling || state !== 'play' && state !== 'menu') return false;
    const r = landing(board, c);
    if (r < 0) { if (!demo) { sfx.nope(); nopeT = stateT; } return false; }
    cursor = c;
    falling = { c, r, who: turn, y: hoverRow(), vy: 0, bounces: 0 };
    if (!demo) Kit.tone(turn === 1 ? 700 : 560, { type: 'triangle', dur: 0.08, vol: 0.12, slide: 0.6 });
    return true;
  }
  function landed() {
    const f = falling; falling = null;
    const i = f.r * COLS + f.c;
    board[i] = f.who; landT[i] = stateT; moves++;
    const line = lineThrough(board, i);
    if (line) { finish(f.who, line); return; }
    if (moves === COLS * ROWS) { finish(0, []); return; }
    turn = 3 - turn; aiT = stateT; aiCol = -1;
  }
  function finish(who, line) {
    winner = who; winLine = line.slice().sort((a, b) => a - b);
    if (demo) { state = 'menu'; endT = stateT; return; }
    state = 'won'; endT = stateT; newWin = false;
    tally[who]++; bumpT[who] = stateT;
    if (who && (!vsTV() || who === 1)) {
      Kit.shake(10, 0.35);
      sfx.win();
      setTimeout(() => Kit.confetti(140), 300);
    } else if (who) {
      Kit.shake(6, 0.3);
      setTimeout(() => sfx.over(), 250);
    } else sfx.chime();
    if (vsTV() && who === 1) {
      wins++; winsBy[mode.id] = (winsBy[mode.id] || 0) + 1; newWin = true;
      Kit.store.set('fourdrop.wins', wins); Kit.store.set('fourdrop.winsBy', winsBy);
      Kit.record('fourdrop', wins);
    }
    firstTurn = 3 - firstTurn; // take turns starting
    for (const k of winLine) { const [x, y] = holeXY(k % COLS, (k / COLS) | 0); Kit.burst(x, y, '#ffffff', 10, 0.8); Kit.burst(x, y, DISC[who], 12, 1); }
    if (who) {
      const x = Kit.W / 2, y = L.by - L.cs * 0.55;
      const words = vsTV() ? (who === 1 ? 'Four in a row!' : 'TV got four!') : (who === 1 ? 'Red got four!' : 'Gold got four!');
      Kit.float(words, x, y, { color: who === 1 ? '#ff8da1' : '#ffe27a', size: L.cs * 0.75, life: 1.5, big: true });
    }
  }

  function start() {
    Kit.store.set('fourdrop.mode', modeIx);
    if (mode !== MODES[modeIx]) { tally = [0, 0, 0]; shownTally = [0, 0, 0]; firstTurn = 1; }
    mode = MODES[modeIx];
    reset(false);
    state = 'play'; aiT = stateT + 0.3;
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    const who = turn === 1 ? (vsTV() ? 'You start' : 'Red starts') : (vsTV() ? 'The TV starts' : 'Gold starts');
    Kit.float(who, Kit.W / 2, L.by + L.bh * 0.45, { color: turn === 1 ? '#ff8da1' : '#ffe27a', size: L.cs * 0.6, life: 1.2, big: true });
  }
  function toMenu() { state = 'menu'; reset(true); }

  // ---------- Layout ----------
  let L = { cs: 60, pad: 16, bx: 0, by: 0, bw: 0, bh: 0, top: 60, wide: true };
  const front = document.createElement('canvas');
  const back = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H > 1.25;
    const top = H * (wide ? 0.1 : 0.2);
    // top bar, one row for the hovering disc, the board (6 rows + rim), its feet, a small margin
    const csH = (H - top - H * 0.03) / (ROWS + 0.56 + 1.15 + 0.3);
    const csW = (W * (wide ? 0.56 : 0.94)) / (COLS + 0.56);
    const cs = Math.floor(Math.min(csH, csW));
    const pad = Math.round(cs * 0.28);
    const bw = COLS * cs + pad * 2, bh = ROWS * cs + pad * 2;
    const spare = wide ? 0 : Math.max(0, (H - top - cs * 1.15 - bh - cs * 0.6) / 2);
    const bx = Math.round((W - bw) / 2), by = Math.round(top + cs * 1.15 + spare);
    L = { cs, pad, bx, by, bw, bh, top, wide };
    sprites.clear();
    drawBoardPics();
  }
  Kit.onResize((W, H) => layout(W, H));
  const holeXY = (c, r) => [L.bx + L.pad + (c + 0.5) * L.cs, L.by + L.pad + (r + 0.5) * L.cs];
  const hoverRow = () => (L.by - L.cs * 0.6 - L.by - L.pad) / L.cs - 0.5;

  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  function drawBoardPics() {
    const { cs, pad, bw, bh } = L;
    const dpr = dprNow(), depth = Math.round(cs * 0.16), feet = Math.round(cs * 0.3);
    // The dark inside of the board, seen through the holes.
    back.width = Math.ceil(bw * dpr); back.height = Math.ceil(bh * dpr);
    let c = back.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    roundRect(c, pad * 0.4, pad * 0.4, bw - pad * 0.8, bh - pad * 0.8, cs * 0.3);
    let g = c.createLinearGradient(0, 0, 0, bh);
    g.addColorStop(0, '#0a0f2e'); g.addColorStop(1, '#151d4d');
    c.fillStyle = g; c.fill();

    // The front: a glossy blue frame with 42 holes cut out, a rim of depth, feet and soft shading.
    front.width = Math.ceil((bw + cs) * dpr); front.height = Math.ceil((bh + depth + feet + cs) * dpr);
    c = front.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o = cs / 2;
    // feet
    for (const fx of [o + cs * 0.15, o + bw - cs * 1.35]) {
      roundRect(c, fx, o + bh - cs * 0.2, cs * 1.2, feet + depth + cs * 0.2, cs * 0.18);
      const fg = c.createLinearGradient(0, o + bh, 0, o + bh + feet + depth);
      fg.addColorStop(0, shade(BOARD, -0.45)); fg.addColorStop(1, shade(BOARD, -0.7));
      c.fillStyle = fg; c.fill();
    }
    // floor shadow
    c.fillStyle = 'rgba(0,0,0,0.35)';
    c.beginPath(); c.ellipse(o + bw / 2, o + bh + depth + feet * 0.92, bw * 0.52, feet * 0.32, 0, 0, Math.PI * 2); c.fill();
    // side depth
    roundRect(c, o, o + depth, bw, bh, cs * 0.4);
    c.fillStyle = shade(BOARD, -0.55); c.fill();
    // face
    c.save();
    roundRect(c, o, o, bw, bh, cs * 0.4);
    g = c.createLinearGradient(0, o, 0, o + bh);
    g.addColorStop(0, shade(BOARD, 0.22)); g.addColorStop(0.5, BOARD); g.addColorStop(1, shade(BOARD, -0.3));
    c.fillStyle = g; c.fill();
    c.clip();
    // gloss band
    g = c.createLinearGradient(0, o, 0, o + bh * 0.45);
    g.addColorStop(0, 'rgba(255,255,255,0.28)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(o, o); c.lineTo(o + bw, o); c.lineTo(o + bw, o + bh * 0.18); c.quadraticCurveTo(o + bw / 2, o + bh * 0.42, o, o + bh * 0.3); c.fill();
    c.restore();
    // holes
    const hr = cs * 0.39;
    c.globalCompositeOperation = 'destination-out';
    for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
      c.beginPath(); c.arc(o + pad + (k + 0.5) * cs, o + pad + (r + 0.5) * cs, hr, 0, Math.PI * 2); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    // hole rims: dark at the top, lit at the bottom, so each hole looks pressed into the face
    for (let r = 0; r < ROWS; r++) for (let k = 0; k < COLS; k++) {
      const x = o + pad + (k + 0.5) * cs, y = o + pad + (r + 0.5) * cs;
      const rg = c.createLinearGradient(0, y - hr, 0, y + hr);
      rg.addColorStop(0, 'rgba(0,8,40,0.75)'); rg.addColorStop(0.55, 'rgba(0,8,40,0.1)'); rg.addColorStop(1, 'rgba(190,215,255,0.75)');
      c.strokeStyle = rg; c.lineWidth = cs * 0.06;
      c.beginPath(); c.arc(x, y, hr + cs * 0.02, 0, Math.PI * 2); c.stroke();
      c.strokeStyle = 'rgba(0,0,30,0.35)'; c.lineWidth = cs * 0.035;
      c.beginPath(); c.arc(x, y, hr - cs * 0.005, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    }
    // outline
    roundRect(c, o + 1, o + 1, bw - 2, bh - 2, cs * 0.4);
    c.lineWidth = 2; c.strokeStyle = 'rgba(200,220,255,0.55)'; c.stroke();
  }

  // Shaded discs and soft glows are drawn once per size (gradients are slow on TV boxes).
  const sprites = new Map();
  function sprite(name, size, draw) {
    const k = name + Math.round(size);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = dprNow();
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(size * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, size);
    sprites.set(k, s);
    return s;
  }
  const discPic = (color, size) => sprite('d' + color, size, (c, s) => {
    const m = s / 2;
    let g = c.createRadialGradient(s * 0.36, s * 0.3, s * 0.04, m, m, m);
    g.addColorStop(0, shade(color, 0.6)); g.addColorStop(0.4, color); g.addColorStop(1, shade(color, -0.5));
    c.fillStyle = g; c.beginPath(); c.arc(m, m, m - 0.5, 0, Math.PI * 2); c.fill();
    // an embossed inner ring, like a real counter
    c.lineWidth = s * 0.05;
    c.strokeStyle = shade(color, -0.35);
    c.beginPath(); c.arc(m, m + s * 0.012, s * 0.31, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = shade(color, 0.35);
    c.beginPath(); c.arc(m, m - s * 0.012, s * 0.31, Math.PI * 0.9, Math.PI * 2.1); c.stroke();
    g = c.createRadialGradient(m, m, 0, m, m, s * 0.29);
    g.addColorStop(0, shade(color, 0.15)); g.addColorStop(1, color);
    c.fillStyle = g; c.beginPath(); c.arc(m, m, s * 0.285, 0, Math.PI * 2); c.fill();
    // shine
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.ellipse(s * 0.34, s * 0.25, s * 0.13, s * 0.065, -0.6, 0, Math.PI * 2); c.fill();
  });
  const glowPic = (color, size) => sprite('g' + color, size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, Kit.rgba(color, 0.75)); g.addColorStop(0.4, Kit.rgba(color, 0.3)); g.addColorStop(1, Kit.rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const twinklePic = (size) => sprite('tw', size, (c, s) => {
    const m = s / 2;
    c.fillStyle = '#ffffff';
    c.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 ? s * 0.09 : m, a = (i * Math.PI) / 4;
      c.lineTo(m + Math.cos(a) * r, m + Math.sin(a) * r);
    }
    c.closePath(); c.fill();
  });

  // ---------- Keys, taps and clicks ----------
  function choose(k) {
    if (k === 'left' && cursor > 0) { cursor--; sfx.move(); } else if (k === 'right' && cursor < COLS - 1) { cursor++; sfx.move(); }
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      const prevIx = modeIx;
      if (k === 'left' || k === 'up') modeIx = (modeIx + MODES.length - 1) % MODES.length;
      else if (k === 'right' || k === 'down') modeIx = (modeIx + 1) % MODES.length;
      else if (k === 'ok') { start(); return; }
      if (modeIx !== prevIx) sfx.move();
      return;
    }
    if (state === 'over') {
      if (stateT - endT < 2.2) return;
      if (k === 'ok') start();
      else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { sfx.move(); toMenu(); }
      return;
    }
    if (state !== 'play' || tvTurn()) return;
    if (k === 'restart') { start(); return; }
    if (k === 'left' || k === 'right') choose(k);
    else if (k === 'ok' || k === 'down') drop(cursor);
  });

  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inBox = (e, b) => b && e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h;
  const colAt = (x) => Math.floor((x - L.bx - L.pad) / L.cs);
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = (L.cards || []).findIndex((r) => inBox(e, r));
        if (i >= 0) { if (i === modeIx) start(); else { modeIx = i; sfx.move(); } }
        return;
      }
      if (state === 'over') {
        if (stateT - endT < 2.2) return;
        if (inBox(e, L.menuBtn)) toMenu(); else start();
        return;
      }
      if (state !== 'play' || tvTurn()) return;
      const c = colAt(e.x);
      if (c >= 0 && c < COLS && e.y > L.top) { cursor = c; drop(c); }
    },
    move(e) {
      if (state !== 'play' || tvTurn() || falling || e.touch) return;
      const c = colAt(e.x);
      if (c >= 0 && c < COLS && c !== cursor && e.y > L.top) cursor = c;
    },
  });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!board) { layout(Kit.W, Kit.H); reset(true); }
    hx += (cursor - hx) * Math.min(1, dt * 16);
    for (let i = 1; i <= 2; i++) {
      shownTally[i] += (tally[i] - shownTally[i]) * Math.min(1, dt * 6);
      if (Math.abs(tally[i] - shownTally[i]) < 0.02) shownTally[i] = tally[i];
    }

    if (falling) {
      const f = falling, g = demo ? 90 : 70;
      f.vy += g * dt; f.y += f.vy * dt;
      if (f.y >= f.r) {
        f.y = f.r;
        const hit = f.vy;
        if (f.bounces < 2 && hit > 4) {
          f.vy = -hit * (f.bounces ? 0.18 : 0.32); f.bounces++;
          if (!demo) {
            const v = f.bounces === 1 ? 0.4 : 0.15;
            Kit.tone(170 + f.r * 18, { type: 'sine', dur: 0.12, vol: v, slide: 0.6 });
            Kit.noise({ dur: 0.05, vol: v * 0.35, freq: 2200 + f.r * 200, q: 1.5 });
            if (f.bounces === 1) {
              const [x, y] = holeXY(f.c, f.r);
              Kit.burst(x, y + L.cs * 0.3, Kit.rgba(DISC[f.who], 0.9), 6, 0.35);
              if (f.r === ROWS - 1) Kit.shake(3, 0.12);
            }
          }
        } else landed();
      }
    }

    // The TV's turn (and the menu demo, where it plays both sides): think, slide over, drop.
    if ((state === 'play' && tvTurn()) || state === 'menu') {
      if (state === 'menu' && (winner || winLine.length || moves === COLS * ROWS) && stateT - endT > 1.8) reset(true);
      else if (!falling && !(state === 'menu' && (winLine.length || moves === COLS * ROWS))) {
        const think = demo ? 0.35 : 0.55;
        if (aiCol < 0 && stateT - aiT > think) {
          aiCol = tvColumn(board, turn, demo ? MODES[0] : mode);
          cursor = aiCol; aiT = stateT;
        } else if (aiCol >= 0 && Math.abs(hx - aiCol) < 0.05 && stateT - aiT > (demo ? 0.15 : 0.3)) {
          drop(aiCol); aiCol = -1;
        }
      }
    }

    if (state === 'won') {
      sparkT -= dt;
      if (sparkT < 0 && winLine.length) {
        sparkT = 0.12;
        const k = winLine[Math.floor(Math.random() * winLine.length)];
        const [x, y] = holeXY(k % COLS, (k / COLS) | 0);
        Kit.burst(x + (Math.random() - 0.5) * L.cs * 0.5, y + (Math.random() - 0.5) * L.cs * 0.5, Math.random() < 0.5 ? '#ffffff' : '#fff2a8', 3, 0.35);
      }
      if (stateT - endT > (winner ? 1.8 : 1.0)) { state = 'over'; endT = stateT; }
    }
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom) {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(30,10,4,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#3a4fc9'); g.addColorStop(1, '#141b5c');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }

  function drawBoard(c, t) {
    const { cs, bx, by, bw, bh } = L;
    c.drawImage(back, bx, by, bw, bh);
    const playing = state === 'play' && !tvTurn() && !falling;
    // The chosen column glows softly inside the board, with a ghost of where the disc will land.
    if (state === 'play' || state === 'menu') {
      const x = L.bx + L.pad + hx * cs;
      c.fillStyle = Kit.rgba(DISC[turn], playing ? 0.16 + Math.sin(t * 4) * 0.04 : 0.08);
      roundRect(c, x + cs * 0.06, by + L.pad * 0.5, cs * 0.88, bh - L.pad, cs * 0.4); c.fill();
      const r = landing(board, cursor);
      if (r >= 0 && playing) {
        const [gx, gy] = holeXY(cursor, r);
        c.globalAlpha = 0.28 + Math.sin(t * 5) * 0.08;
        const s = cs * 0.8;
        c.drawImage(discPic(DISC[turn], s), gx - s / 2, gy - s / 2, s, s);
        c.globalAlpha = 1;
      }
    }
    // Discs sit behind the face, so they show through the holes.
    const s = cs * 0.84;
    for (let i = 0; i < board.length; i++) {
      if (!board[i]) continue;
      const [x, y] = holeXY(i % COLS, (i / COLS) | 0);
      c.drawImage(discPic(DISC[board[i]], s), x - s / 2, y - s / 2, s, s);
    }
    if (falling) {
      const [x, y] = holeXY(falling.c, falling.y);
      c.drawImage(discPic(DISC[falling.who], s), x - s / 2, y - s / 2, s, s);
    }
    c.drawImage(front, bx - cs / 2, by - cs / 2, front.width / dprNow(), front.height / dprNow());

    // A disc just landed: a quick light ring around its hole.
    for (let i = 0; i < board.length; i++) {
      const age = stateT - landT[i];
      if (age < 0 || age > 0.35 || demo) continue;
      const [x, y] = holeXY(i % COLS, (i / COLS) | 0);
      c.globalAlpha = 1 - age / 0.35;
      c.strokeStyle = '#ffffff'; c.lineWidth = cs * 0.05;
      c.beginPath(); c.arc(x, y, cs * (0.4 + age * 0.5), 0, Math.PI * 2); c.stroke();
      c.globalAlpha = 1;
    }

    // The winning four: a light line through them, then they pulse in front of the board and twinkle.
    if (winLine.length && winner) {
      const age = stateT - endT;
      const pulse = 1 + Math.sin(age * 8) * 0.07;
      const [x1, y1] = holeXY(winLine[0] % COLS, (winLine[0] / COLS) | 0);
      const last = winLine[winLine.length - 1];
      const [x2, y2] = holeXY(last % COLS, (last / COLS) | 0);
      const grow = clamp(age / 0.35, 0, 1);
      for (const k of winLine) {
        const [x, y] = holeXY(k % COLS, (k / COLS) | 0);
        const gs = cs * 1.9 * pulse;
        c.drawImage(glowPic(DISC[winner], cs * 1.9), x - gs / 2, y - gs / 2, gs, gs);
      }
      c.lineCap = 'round';
      c.strokeStyle = Kit.rgba('#ffffff', 0.25); c.lineWidth = cs * 0.34;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(lerp(x1, x2, grow), lerp(y1, y2, grow)); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = cs * 0.08;
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(lerp(x1, x2, grow), lerp(y1, y2, grow)); c.stroke();
      winLine.forEach((k, j) => {
        const [x, y] = holeXY(k % COLS, (k / COLS) | 0);
        const p = 1 + Math.sin(age * 8 - j * 0.8) * 0.08;
        const ds = cs * 0.84 * p;
        c.drawImage(discPic(DISC[winner], cs * 0.84), x - ds / 2, y - ds / 2, ds, ds);
        const tw = cs * 0.5 * (0.5 + 0.5 * Math.sin(age * 6 + j * 1.7));
        c.save(); c.translate(x + cs * 0.22, y - cs * 0.22); c.rotate(age * 2 + j);
        c.drawImage(twinklePic(cs * 0.5), -tw / 2, -tw / 2, tw, tw);
        c.restore();
      });
    }

    // The disc waiting above the board.
    if (state === 'play' && !falling && !winLine.length && moves < COLS * ROWS) {
      const [x] = holeXY(hx, 0);
      let y = L.by - cs * 0.6 + Math.sin(t * 3.5) * cs * 0.05;
      const shakeX = stateT - nopeT < 0.3 ? Math.sin((stateT - nopeT) * 60) * cs * 0.08 : 0;
      const ds = cs * 0.84;
      if (playing) {
        const gs = cs * 1.5;
        c.globalAlpha = 0.55 + Math.sin(t * 4) * 0.15;
        c.drawImage(glowPic(DISC[turn], gs), x - gs / 2, y - gs / 2, gs, gs);
        c.globalAlpha = 1;
      }
      c.drawImage(discPic(DISC[turn], ds), x + shakeX - ds / 2, y - ds / 2, ds, ds);
      if (playing) {
        // a small bouncing arrow on the disc says "OK drops"
        const ay = y + cs * 0.05 + Math.abs(Math.sin(t * 4)) * cs * 0.05;
        c.fillStyle = 'rgba(255,255,255,0.9)';
        c.beginPath(); c.moveTo(x - cs * 0.12, ay - cs * 0.06); c.lineTo(x + cs * 0.12, ay - cs * 0.06); c.lineTo(x, ay + cs * 0.1); c.closePath(); c.fill();
      }
    }
  }

  function playerCard(c, t, who, x, y, w, h) {
    const active = state === 'play' && turn === who && !(falling && falling.who === who);
    const name = vsTV() ? (who === 1 ? 'You' : 'TV') : (who === 1 ? 'Red' : 'Gold');
    const sub = vsTV() ? (who === 1 ? 'Player' : `${mode.icon} ${mode.name}`) : `Player ${who}`;
    c.save();
    const k = active ? 1.04 + Math.sin(t * 5) * 0.01 : 1;
    c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    if (active) {
      const gs = Math.max(w, h) * 1.5;
      c.globalAlpha = 0.5;
      c.drawImage(glowPic(DISC[who], gs), -gs / 2, -gs / 2, gs, gs);
      c.globalAlpha = 1;
    }
    panel(c, -w / 2, -h / 2, w, h, h * 0.14, active ? DISC[who] : 'rgba(170,190,255,0.3)');
    const ds = h * 0.34;
    c.drawImage(discPic(DISC[who], ds), -ds / 2, -h * 0.36, ds, ds);
    text(c, name, 0, h * 0.1, h * 0.15, '#ffffff', 900);
    text(c, sub, 0, h * 0.22, h * 0.075, 'rgba(255,255,255,0.75)', 700);
    const bump = clamp(1 - (stateT - bumpT[who]) / 0.5, 0, 1);
    c.save(); c.translate(0, h * 0.36); c.scale(1 + bump * 0.35, 1 + bump * 0.35);
    outlined(c, String(Math.round(shownTally[who])), 0, 0, h * 0.15, '#fff6c2', who === 1 ? '#ff8da1' : '#ffc21a');
    c.restore();
    c.restore();
    // whose turn it is, under the card
    if (active) {
      const msg = !vsTV() ? (who === 1 ? "Red's turn!" : "Gold's turn!") : (who === 1 ? 'Your turn!' : 'Thinking' + '.'.repeat(1 + (Math.floor(t * 3) % 3)));
      text(c, msg, x + w / 2, y + h + h * 0.13, h * 0.09, who === 1 ? '#ffb3c0' : '#ffe27a', 800);
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#3d1a0e', '#0e0503', 'rgba(255,140,60,0.10)');
    if (!board) return;
    const cs = L.cs;
    drawBoard(c, t);

    if (state !== 'menu') {
      // Player cards on either side (above the board on narrow screens) with this session's score.
      if (L.wide) {
        const w = Math.min(cs * 3.4, (W - L.bw) / 2 - cs * 0.9), h = w * 1.2;
        const y = L.by + L.bh * 0.42 - h / 2;
        playerCard(c, t, 1, L.bx - cs * 0.55 - w, y, w, h);
        playerCard(c, t, 2, L.bx + L.bw + cs * 0.55, y, w, h);
      } else {
        const w = Math.min(W * 0.36, cs * 3.2), h = Math.min(L.top * 0.86, w * 1.1);
        playerCard(c, t, 1, W / 2 - w - cs * 0.3, L.top * 0.08, w, h);
        playerCard(c, t, 2, W / 2 + cs * 0.3, L.top * 0.08, w, h);
      }
      if (L.wide) {
        const ty = L.top / 2;
        outlined(c, 'FOUR DROP', W / 2, ty, Math.min(L.top * 0.42, cs * 0.6), '#ffe9d6', '#ff9b4a');
        text(c, vsTV() ? `👑 Wins vs TV: ${wins}` : '👥 2 Players', cs * 0.6, ty, Math.min(L.top * 0.3, cs * 0.42), 'rgba(255,255,255,0.85)', 800, 'left');
      }
    }

    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'play' && !Kit.touchFirst() && moves < 2 && !tvTurn()) {
      text(c, '◀ ▶ choose a column  ·  OK drops  ·  Back for games', W / 2, H - cs * 0.22, cs * 0.3, 'rgba(255,255,255,0.7)', 700);
    }
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c);
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    c.fillStyle = 'rgba(20,6,2,0.7)'; c.fillRect(0, 0, W, H);
    const wide = W > H;
    const n = MODES.length, gap = cs * 0.45;
    const cw = wide ? Math.min((W * 0.9 - gap * (n - 1)) / n, cs * 3.6) : Math.min(W * 0.84, cs * 9);
    const ch = wide ? cw * 1.1 : Math.min(H * 0.13, cw * 0.3);
    const total = wide ? cw * n + gap * (n - 1) : ch * n + gap * (n - 1);
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.54 - ch / 2 : H * 0.55 - total / 2;
    L.cards = MODES.map((m, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    // Title with two discs either side.
    const ty = wide ? H * 0.16 : H * 0.12, tsz = Math.min(H * 0.11, W * 0.1);
    outlined(c, 'FOUR DROP', W / 2, ty, tsz, '#ffe9d6', '#ff9b4a');
    c.font = `900 ${Math.round(tsz)}px system-ui, sans-serif`;
    const tw = c.measureText('FOUR DROP').width, ds = tsz * 0.8;
    const bob = Math.sin(t * 3) * tsz * 0.06;
    c.drawImage(discPic(RED, ds), W / 2 - tw / 2 - ds * 1.45, ty - ds / 2 + bob, ds, ds);
    c.drawImage(discPic(GOLD, ds), W / 2 + tw / 2 + ds * 0.45, ty - ds / 2 - bob, ds, ds);
    text(c, Kit.touchFirst() ? 'Tap a way to play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, y0 - cs * 0.65, cs * 0.36, 'rgba(255,255,255,0.88)', 700);
    MODES.forEach((m, i) => {
      const r = L.cards[i], on = i === modeIx;
      const k = on ? 1.07 + Math.sin(t * 5) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, cs * 0.35, on ? '#ffc21a' : 'rgba(170,190,255,0.3)');
      if (on) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,194,26,0.55)'; c.stroke(); }
      const best = m.id === 'duo' ? 'Red vs Gold' : `👑 ${winsBy[m.id] || 0} won`;
      if (wide) {
        text(c, m.icon, 0, -r.h * 0.24, r.h * 0.22, '#fff', 400);
        text(c, m.name, 0, r.h * 0.03, r.h * 0.14, '#ffffff', 900);
        text(c, m.tip, 0, r.h * 0.18, r.h * 0.07, 'rgba(255,255,255,0.75)', 600);
        text(c, best, 0, r.h * 0.34, r.h * 0.085, '#ffd23f', 800);
      } else {
        text(c, m.icon, -r.w * 0.38, 0, r.h * 0.4, '#fff', 400);
        text(c, m.name, -r.w * 0.24, -r.h * 0.14, r.h * 0.26, '#ffffff', 900, 'left');
        text(c, m.tip, -r.w * 0.24, r.h * 0.2, r.h * 0.15, 'rgba(255,255,255,0.75)', 600, 'left');
        text(c, best, r.w * 0.45, 0, r.h * 0.17, '#ffd23f', 800, 'right');
      }
      c.restore();
    });
    const tipY = wide ? y0 + ch + cs * 0.75 : y0 + total + cs * 0.7;
    text(c, `Line up four discs: across, up or slanted  ·  👑 ${wins} wins vs the TV`, W / 2, tipY, cs * 0.32, 'rgba(255,255,255,0.75)', 600);
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    const a = clamp((stateT - endT) / 0.4, 0, 1);
    c.fillStyle = `rgba(20,6,2,${0.55 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, cs * 7.4), ph = cs * 4.9;
    panel(c, -pw / 2, -ph / 2, pw, ph, cs * 0.45, winner ? DISC[winner] : '#ffc21a');
    let title, sub;
    if (vsTV()) {
      title = winner === 1 ? 'You win!' : winner === 2 ? 'The TV wins' : "It's a draw";
      sub = winner === 1 ? `🎉 ${mode.name} beaten in ${Math.ceil(moves / 2)} moves` : winner === 2 ? 'So close! Try again' : 'The board is full';
    } else {
      title = winner === 1 ? 'Red wins!' : winner === 2 ? 'Gold wins!' : "It's a draw";
      sub = winner ? `Four in a row in ${Math.ceil(moves / 2)} moves` : 'The board is full';
    }
    if (winner) {
      const ds = cs * 0.75;
      c.drawImage(discPic(DISC[winner], ds), -ds / 2, -ph * 0.5 - ds * 0.45, ds, ds);
    }
    outlined(c, title, 0, -ph * 0.28, cs * 0.8, '#ffffff', winner === 2 ? '#ffe27a' : '#ffb3c0');
    text(c, sub, 0, -ph * 0.09, cs * 0.34, 'rgba(255,255,255,0.88)', 800);
    const score = vsTV() ? `You ${tally[1]}  –  ${tally[2]} TV` : `Red ${tally[1]}  –  ${tally[2]} Gold`;
    outlined(c, score, 0, ph * 0.07, cs * 0.46, '#fff6c2', '#ffb703');
    if (!vsTV()) text(c, firstTurn === 1 ? 'Red starts next' : 'Gold starts next', 0, ph * 0.21, cs * 0.3, 'rgba(255,255,255,0.75)', 700);
    if (vsTV()) text(c, newWin ? `👑 Wins vs TV: ${wins}  (+1)` : `👑 Wins vs TV: ${wins}`, 0, ph * 0.21, cs * 0.3, '#ffd23f', 800);
    const ready = stateT - endT > 2.2;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.32, cs * 0.34, '#9fe6ff', 800);
    const bw = cs * 4.2, bh = cs * 0.5;
    roundRect(c, -bw / 2, ph * 0.385, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Other ways to play' : 'Arrows  other ways to play', 0, ph * 0.385 + bh / 2, cs * 0.25, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.385 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  reset(true);
  Kit.canvas.focus();
  if (wins > 0) Kit.record('fourdrop', wins);
})();
