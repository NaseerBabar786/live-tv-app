// Tic-Tac-Toe Glow: the modern remake of Tic-Tac-Toe. Line up three on a glowing glass board before
// the other side does. Play the TV (Easy, Normal, or Hard = perfect play) or a friend on 2 Players;
// a match is first to 3 round wins, and who goes first swaps every round.
// Remote: arrows pick a square, OK places your mark. Touch/mouse: tap a square. Keys: arrows + Enter.
'use strict';

(() => {
  const { sfx, ease, shade, rgba, roundRect, clamp, lerp } = Kit;
  const MODES = [
    { id: 'easy', name: 'Easy', icon: '🙂', tip: 'A relaxed TV', tv: true },
    { id: 'normal', name: 'Normal', icon: '😎', tip: 'Sharp, but slips', tv: true },
    { id: 'hard', name: 'Hard', icon: '🤖', tip: 'Never makes a mistake', tv: true },
    { id: 'duo', name: '2 Players', icon: '👥', tip: 'Pass the remote', tv: false },
  ];
  const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  const COL = { 1: '#ff6a3d', 2: '#3ce8d4' }; // X coral, O turquoise
  const GRID = '#ffd7c2';
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98];
  const TO_WIN = 3;

  // ---------- Records ----------
  let winsBy = Kit.store.get('tictacglow.winsBy', { easy: 0, normal: 0, hard: 0 });
  const totalWins = () => (winsBy.easy || 0) + (winsBy.normal || 0) + (winsBy.hard || 0);
  let modeIx = clamp(Kit.store.get('tictacglow.mode', 1), 0, MODES.length - 1);

  // ---------- State ----------
  // state: 'menu' (two TVs play a demo behind the cards), 'play', 'result' (round or match over)
  let state = 'menu', demo = true, mode = MODES[modeIx];
  let board = Array(9).fill(0), marks = [], fading = [], turn = 1, starter = 1;
  let cursor = 4, curX = 1, curY = 1, winLine = null, winner = 0, endT = 0, tvAt = -1, nopeT = -9;
  let tally = { 1: 0, 2: 0, d: 0 }, round = 1, bumpX = 0, bumpO = 0, bumpD = 0, matchWinner = 0, boardT = 0;
  let stateT = 0, gotWin = false;
  const sparkles = [];

  const lineOf = (b) => {
    for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return l;
    return null;
  };
  const full = (b) => b.every((v) => v !== 0);
  const free = (b) => b.reduce((a, v, i) => (v ? a : (a.push(i), a)), []);

  // ---------- The TV: negamax over the whole tree (tiny for 3×3) ----------
  function nega(b, toMove, depth) {
    if (lineOf(b)) return -(10 - depth); // the player who just moved has won
    if (full(b)) return 0;
    let best = -99;
    for (let i = 0; i < 9; i++) {
      if (b[i]) continue;
      b[i] = toMove;
      const v = -nega(b, 3 - toMove, depth + 1);
      b[i] = 0;
      if (v > best) best = v;
    }
    return best;
  }
  function bestMoves(b, who) {
    let best = -99, out = [];
    for (const i of free(b)) {
      b[i] = who;
      const v = -nega(b, 3 - who, 1);
      b[i] = 0;
      if (v > best) { best = v; out = [i]; } else if (v === best) out.push(i);
    }
    return out;
  }
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function winningMove(b, who) {
    for (const i of free(b)) { b[i] = who; const w = lineOf(b); b[i] = 0; if (w) return i; }
    return -1;
  }
  function aiMove(who, level) {
    const open = free(board);
    if (level === 'easy') {
      const w = winningMove(board, who);
      if (w >= 0 && Math.random() < 0.6) return w;
      const blk = winningMove(board, 3 - who);
      if (blk >= 0 && Math.random() < 0.4) return blk;
      return pick(open);
    }
    if (level === 'normal') {
      // Like the old game: one move in four is a guess (but it never misses a win on the spot).
      const w = winningMove(board, who);
      if (w >= 0) return w;
      if (Math.random() < 0.25) return pick(open);
    }
    if (open.length === 9) return pick([0, 2, 4, 6, 8, 4]);
    return pick(bestMoves(board, who));
  }

  // ---------- Flow ----------
  function clearBoard() {
    const now = stateT;
    fading = marks.map((m) => ({ ...m, gone: now }));
    board = Array(9).fill(0); marks = []; winLine = null; winner = 0; tvAt = -1;
  }
  function startMatch() {
    mode = MODES[modeIx]; demo = false;
    Kit.store.set('tictacglow.mode', modeIx);
    tally = { 1: 0, 2: 0, d: 0 }; round = 1; starter = 1; matchWinner = 0; gotWin = false;
    clearBoard(); fading = [];
    turn = starter; cursor = 4; state = 'play'; boardT = stateT;
    Kit.tone(523, { type: 'triangle', dur: 0.12, vol: 0.16 });
    Kit.tone(784, { type: 'triangle', dur: 0.16, vol: 0.14, at: 0.08 });
    scheduleTV();
  }
  function nextRound() {
    round++; starter = 3 - starter;
    clearBoard();
    turn = starter; state = 'play';
    Kit.noise({ dur: 0.25, vol: 0.06, freq: 2500, q: 0.6, sweep: 0.3 });
    scheduleTV();
  }
  function toMenu() {
    state = 'menu'; demo = true; mode = MODES[modeIx];
    clearBoard(); turn = 1; starter = 1; tvAt = stateT + 0.8;
  }
  function tvPlays() { return demo || (mode.tv && turn === 2); }
  function scheduleTV() {
    if (tvPlays()) tvAt = stateT + (demo ? 0.75 : 0.6 + Math.random() * 0.35);
    else tvAt = -1;
  }

  function place(i) {
    const who = turn;
    board[i] = who;
    marks.push({ i, who, t: stateT });
    const [x, y] = cellXY(i);
    addSparkles(x, y, COL[who], 7, L.cell * 0.5);
    if (!demo) {
      if (who === 1) {
        Kit.tone(392, { type: 'triangle', dur: 0.14, vol: 0.2, slide: 1.6 });
        Kit.noise({ dur: 0.18, vol: 0.07, freq: 3200, q: 0.8, sweep: 0.5 });
      } else {
        Kit.tone(660, { type: 'sine', dur: 0.22, vol: 0.18, slide: 0.75 });
        Kit.tone(990, { type: 'sine', dur: 0.12, vol: 0.05, at: 0.03 });
      }
    }
    const line = lineOf(board);
    if (line) { endRound(who, line); return; }
    if (full(board)) { endRound(0, null); return; }
    turn = 3 - who;
    scheduleTV();
  }

  function endRound(who, line) {
    winner = who; winLine = line; endT = stateT; tvAt = -1;
    if (demo) { state = 'menu'; tvAt = stateT + 2.2; return; }
    state = 'result';
    if (who) tally[who]++; else tally.d++;
    if (who === 1) bumpX = 1; else if (who === 2) bumpO = 1; else bumpD = 1;
    if (who === 1 && mode.tv) {
      winsBy[mode.id] = (winsBy[mode.id] || 0) + 1; gotWin = true;
      Kit.store.set('tictacglow.winsBy', winsBy);
      Kit.record('tictacglow', totalWins());
    }
    if (tally[1] >= TO_WIN || tally[2] >= TO_WIN) matchWinner = tally[1] >= TO_WIN ? 1 : 2;
    const youLost = mode.tv && who === 2;
    setTimeout(() => {
      if (who) {
        for (let k = 0; k < 5; k++) Kit.tone(NOTES[k + 2], { type: 'triangle', dur: 0.14, vol: 0.12, at: k * 0.06 });
        Kit.noise({ dur: 0.4, vol: 0.06, freq: 5000, q: 0.6, sweep: 0.5, type: 'highpass' });
      } else {
        Kit.tone(440, { type: 'sine', dur: 0.25, vol: 0.12 }); Kit.tone(440, { type: 'sine', dur: 0.3, vol: 0.12, at: 0.18 });
      }
    }, 380);
    setTimeout(() => {
      if (state !== 'result') return;
      if (youLost) { sfx.over(); Kit.shake(8, 0.3); } else if (who) sfx.win();
      if (matchWinner && !(mode.tv && matchWinner === 2)) { Kit.confetti(140); setTimeout(() => sfx.chime(), 300); }
    }, 950);
  }

  // ---------- Layout ----------
  let L = { B: 300, cx: 0, cy: 0, cell: 90, gx: 0, gy: 0, wide: true, cards: [], unit: 20 };
  const boardPic = document.createElement('canvas');
  const gridPic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H > 1.1;
    const B = Math.round(wide ? Math.min(H * 0.68, W * 0.46) : Math.min(W * 0.88, H * 0.5));
    const cx = W / 2, cy = wide ? H * 0.53 : H * 0.6;
    const G = B * 0.88, cell = G / 3;
    const unit = wide ? H / 24 : Math.min(W / 16, H / 30);
    L = { B, cx, cy, cell, G, gx: cx - G / 2, gy: cy - G / 2, wide, unit, cards: [], W, H };
    // Side cards (the two players)
    if (wide) {
      const side = (W - B) / 2;
      const cw = Math.min(side * 0.72, B * 0.56), ch = B * 0.66;
      const off = B / 2 + side / 2;
      L.pcard = { 1: { x: cx - off - cw / 2, y: cy - ch / 2, w: cw, h: ch }, 2: { x: cx + off - cw / 2, y: cy - ch / 2, w: cw, h: ch } };
    } else {
      const cw = W * 0.42, ch = H * 0.15, y = H * 0.17;
      L.pcard = { 1: { x: W / 2 - cw - W * 0.03, y, w: cw, h: ch }, 2: { x: W / 2 + W * 0.03, y, w: cw, h: ch } };
    }
    sprites.clear();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    // The glass board, drawn once per size.
    const pad = B * 0.08;
    boardPic.width = gridPic.width = Math.ceil((B + pad * 2) * dpr);
    boardPic.height = gridPic.height = Math.ceil((B + pad * 2) * dpr);
    let c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.save();
    c.shadowColor = 'rgba(255,120,90,0.45)'; c.shadowBlur = pad * 0.9;
    roundRect(c, pad, pad, B, B, B * 0.08);
    c.fillStyle = 'rgba(20,10,40,0.9)'; c.fill();
    c.restore();
    roundRect(c, pad, pad, B, B, B * 0.08);
    let g = c.createLinearGradient(0, pad, 0, pad + B);
    g.addColorStop(0, 'rgba(120,80,180,0.42)'); g.addColorStop(0.5, 'rgba(50,25,90,0.55)'); g.addColorStop(1, 'rgba(25,12,50,0.75)');
    c.fillStyle = g; c.fill();
    g = c.createLinearGradient(pad, pad, pad + B, pad + B);
    g.addColorStop(0, 'rgba(255,200,170,0.7)'); g.addColorStop(0.5, 'rgba(200,150,255,0.25)'); g.addColorStop(1, 'rgba(120,255,230,0.55)');
    c.lineWidth = 3; c.strokeStyle = g; c.stroke();
    // Glass sheen: a soft diagonal band on the top half.
    c.save();
    roundRect(c, pad, pad, B, B, B * 0.08); c.clip();
    c.beginPath(); c.moveTo(pad, pad); c.lineTo(pad + B * 0.75, pad); c.lineTo(pad, pad + B * 0.55); c.closePath();
    g = c.createLinearGradient(pad, pad, pad + B * 0.4, pad + B * 0.4);
    g.addColorStop(0, 'rgba(255,255,255,0.13)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fill();
    // Cell wells
    for (let i = 0; i < 9; i++) {
      const x = pad + (B - G) / 2 + (i % 3) * cell, y = pad + (B - G) / 2 + Math.floor(i / 3) * cell;
      roundRect(c, x + cell * 0.1, y + cell * 0.1, cell * 0.8, cell * 0.8, cell * 0.18);
      c.fillStyle = 'rgba(10,4,24,0.28)'; c.fill();
    }
    c.restore();
    // The glowing grid lines (their glow pulses, so they are their own picture).
    c = gridPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o = pad + (B - G) / 2, ins = cell * 0.08;
    c.lineCap = 'round';
    const lines = () => {
      c.beginPath();
      for (const k of [1, 2]) {
        c.moveTo(o + k * cell, o + ins); c.lineTo(o + k * cell, o + G - ins);
        c.moveTo(o + ins, o + k * cell); c.lineTo(o + G - ins, o + k * cell);
      }
    };
    c.shadowColor = '#ff8a6a'; c.shadowBlur = cell * 0.22;
    c.strokeStyle = rgba(GRID, 0.55); c.lineWidth = cell * 0.07; lines(); c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = '#fff1e8'; c.lineWidth = cell * 0.028; lines(); c.stroke();
    L.pad = pad;
  }
  Kit.onResize((W, H) => layout(W, H));

  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const k = name + Math.round(w) + 'x' + Math.round(h);
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

  // A mark drawn as glowing neon strokes; p (0..1) is how much of the stroke is drawn so far.
  function strokeMark(c, who, x, y, r, p) {
    const col = COL[who];
    const pathX = (q) => {
      c.beginPath();
      const a = clamp(q * 2, 0, 1), b = clamp(q * 2 - 1, 0, 1);
      c.moveTo(x - r, y - r); c.lineTo(x - r + 2 * r * a, y - r + 2 * r * a);
      if (b > 0) { c.moveTo(x + r, y - r); c.lineTo(x + r - 2 * r * b, y - r + 2 * r * b); }
    };
    const pathO = (q) => {
      c.beginPath();
      c.arc(x, y, r * 1.02, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.001, q));
    };
    const path = who === 1 ? pathX : pathO;
    c.lineCap = 'round'; c.lineJoin = 'round';
    const passes = [[0.95, rgba(col, 0.1)], [0.6, rgba(col, 0.22)], [0.36, col], [0.13, shade(col, 0.7)]];
    for (const [wd, st] of passes) { c.lineWidth = r * wd; c.strokeStyle = st; path(p); c.stroke(); }
  }
  const markSprite = (who, s) => sprite('m' + who, s, s, (c) => strokeMark(c, who, s / 2, s / 2, s * 0.26, 1));
  const cursorSprite = (who, s) => sprite('cur' + who, s, s, (c) => {
    const col = COL[who], m = s * 0.08;
    c.shadowColor = col; c.shadowBlur = s * 0.08;
    roundRect(c, m, m, s - m * 2, s - m * 2, s * 0.2);
    c.lineWidth = s * 0.035; c.strokeStyle = col; c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = rgba(col, 0.12); c.fill();
    c.lineWidth = s * 0.012; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
  });
  const sparkSprite = (col, s) => sprite('sp' + col, s, s, (c) => {
    const h = s / 2;
    const g = c.createRadialGradient(h, h, 0, h, h, h);
    g.addColorStop(0, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(h, h * 0.15); c.quadraticCurveTo(h, h, h * 1.85, h); c.quadraticCurveTo(h, h, h, h * 1.85);
    c.quadraticCurveTo(h, h, h * 0.15, h); c.quadraticCurveTo(h, h, h, h * 0.15);
    c.fill();
  });
  function panelPic(w, h, border) {
    return sprite('pn' + border, w, h, (c) => {
      roundRect(c, 2, 2, w - 4, h - 4, Math.min(w, h) * 0.12);
      const g = c.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#3a2466'); g.addColorStop(1, '#140a2c');
      c.fillStyle = g; c.fill();
      c.lineWidth = 3; c.strokeStyle = border; c.stroke();
      c.save(); c.clip();
      const s = c.createLinearGradient(0, 0, 0, h * 0.5);
      s.addColorStop(0, 'rgba(255,255,255,0.12)'); s.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = s; c.fillRect(0, 0, w, h * 0.5);
      c.restore();
    });
  }

  function addSparkles(x, y, col, n, spread) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = spread * (0.6 + Math.random() * 1.6);
      sparkles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 0.5 + Math.random() * 0.6, size: L.cell * (0.18 + Math.random() * 0.22), col, spin: Math.random() * 6 });
    }
  }

  const cellXY = (i) => [L.gx + ((i % 3) + 0.5) * L.cell, L.gy + (Math.floor(i / 3) + 0.5) * L.cell];
  const cellAt = (x, y) => {
    const cx = Math.floor((x - L.gx) / L.cell), cy = Math.floor((y - L.gy) / L.cell);
    return cx >= 0 && cy >= 0 && cx < 3 && cy < 3 ? cy * 3 + cx : -1;
  };

  // ---------- Input ----------
  const humanTurn = () => state === 'play' && !tvPlays();
  function tryPlace() {
    if (!humanTurn()) return;
    if (board[cursor]) { sfx.nope(); nopeT = stateT; return; }
    place(cursor);
  }
  function moveCursor(k) {
    let x = cursor % 3, y = Math.floor(cursor / 3);
    if (k === 'left') x--; else if (k === 'right') x++; else if (k === 'up') y--; else if (k === 'down') y++;
    if (x < 0 || y < 0 || x > 2 || y > 2) { Kit.tone(180, { type: 'triangle', dur: 0.05, vol: 0.06 }); return; }
    cursor = y * 3 + x; sfx.move();
  }
  const panelReady = () => stateT - endT > 1.1;
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      const prev = modeIx;
      if (k === 'left' || (k === 'up' && L.wide)) modeIx = (modeIx + MODES.length - 1) % MODES.length;
      else if (k === 'right' || (k === 'down' && L.wide)) modeIx = (modeIx + 1) % MODES.length;
      else if (k === 'up') modeIx = (modeIx + 2) % 4;
      else if (k === 'down') modeIx = (modeIx + 2) % 4;
      else if (k === 'ok') { startMatch(); return; }
      if (modeIx !== prev) sfx.move();
      return;
    }
    if (k === 'restart') { startMatch(); return; }
    if (state === 'play') {
      if (k === 'ok') tryPlace(); else if (k !== 'undo') moveCursor(k);
      return;
    }
    if (state === 'result') {
      if (!panelReady()) return;
      if (k === 'ok') { if (matchWinner) startMatch(); else nextRound(); } else if (k !== 'undo') { sfx.move(); toMenu(); }
    }
  });

  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inside = (e, r) => r && e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h;
  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = L.cards.findIndex((r) => inside(e, r));
        if (i >= 0) { if (i === modeIx) startMatch(); else { modeIx = i; sfx.move(); } }
        return;
      }
      if (state === 'play') {
        const i = cellAt(e.x, e.y);
        if (i >= 0 && humanTurn()) { cursor = i; tryPlace(); }
        return;
      }
      if (panelReady()) {
        if (inside(e, L.menuBtn)) { sfx.move(); toMenu(); } else if (matchWinner) startMatch(); else nextRound();
      }
    },
    move(e) {
      if (state !== 'play' || e.touch) return;
      const i = cellAt(e.x, e.y);
      if (i >= 0 && i !== cursor) cursor = i;
    },
  });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!L.W) layout(Kit.W, Kit.H);
    if (tvAt > 0 && stateT >= tvAt) {
      if (state === 'menu' && (winLine || full(board) || lineOf(board))) {
        clearBoard(); starter = 3 - starter; turn = starter; tvAt = stateT + 0.7;
      } else if ((state === 'menu' || state === 'play') && tvPlays() && !lineOf(board) && !full(board)) {
        tvAt = -1;
        const lvl = demo ? 'normal' : mode.id;
        const i = aiMove(turn, lvl);
        if (!demo) cursor = i;
        place(i);
      } else tvAt = -1;
    }
    const tx = cursor % 3, ty = Math.floor(cursor / 3);
    curX += (tx - curX) * Math.min(1, dt * 18); curY += (ty - curY) * Math.min(1, dt * 18);
    bumpX = Math.max(0, bumpX - dt * 2.5); bumpO = Math.max(0, bumpO - dt * 2.5); bumpD = Math.max(0, bumpD - dt * 2.5);
    for (let k = fading.length - 1; k >= 0; k--) if (stateT - fading[k].gone > 0.4) fading.splice(k, 1);
    for (let k = sparkles.length - 1; k >= 0; k--) {
      const p = sparkles[k];
      p.life += dt;
      if (p.life > p.max) { sparkles.splice(k, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - dt * 2.5; p.vy *= 1 - dt * 2.5; p.vy += 40 * dt;
    }
    // The winning line's head leaves a trail of sparkles while it sweeps.
    if (winLine) {
      const k = (stateT - endT - 0.3) / 0.45;
      if (k > 0 && k < 1.05) {
        const [ax, ay] = cellXY(winLine[0]), [bx, by] = cellXY(winLine[2]);
        const ex = 0.38, kk = clamp(k, 0, 1);
        const sx = ax - (bx - ax) * ex / 2, sy = ay - (by - ay) * ex / 2;
        const hx = lerp(sx, bx + (bx - ax) * ex / 2, kk), hy = lerp(sy, by + (by - ay) * ex / 2, kk);
        if (sparkles.length < 140) addSparkles(hx, hy, COL[winner], demo ? 1 : 3, L.cell * 0.9);
      }
      if (!demo && state !== 'menu' && Math.random() < dt * 6 && sparkles.length < 140) {
        const i = winLine[Math.floor(Math.random() * 3)], [x, y] = cellXY(i);
        addSparkles(x + (Math.random() - 0.5) * L.cell * 0.6, y + (Math.random() - 0.5) * L.cell * 0.6, '#ffffff', 1, L.cell * 0.15);
      }
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
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(18,6,34,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  const nameOf = (who) => (mode.tv ? (who === 1 ? 'YOU' : 'TV') : (who === 1 ? 'PLAYER 1' : 'PLAYER 2'));

  function drawBoard(c, t) {
    const { B, cx, cy, cell, pad } = L;
    const pop = state === 'play' && round === 1 ? ease.back(clamp((stateT - boardT) / 0.45, 0, 1)) : 1;
    c.save();
    c.translate(cx, cy); c.scale(pop, pop); c.translate(-cx, -cy);
    c.drawImage(boardPic, cx - B / 2 - pad, cy - B / 2 - pad, B + pad * 2, B + pad * 2);
    c.globalAlpha = 0.75 + Math.sin(t * 2.2) * 0.25;
    c.drawImage(gridPic, cx - B / 2 - pad, cy - B / 2 - pad, B + pad * 2, B + pad * 2);
    c.globalAlpha = 1;

    // Cursor and a ghost of the mark you would place.
    if (state === 'play' && !demo) {
      const x = L.gx + curX * cell, y = L.gy + curY * cell;
      const shakeX = stateT - nopeT < 0.3 ? Math.sin((stateT - nopeT) * 60) * cell * 0.05 * (1 - (stateT - nopeT) / 0.3) : 0;
      const human = humanTurn();
      c.globalAlpha = human ? 0.8 + Math.sin(t * 6) * 0.2 : 0.3;
      const s = cell * (1 + Math.sin(t * 6) * 0.015);
      c.drawImage(cursorSprite(turn, cell), x + shakeX + (cell - s) / 2, y + (cell - s) / 2, s, s);
      if (human && !board[cursor]) {
        c.globalAlpha = 0.22 + Math.sin(t * 4) * 0.06;
        c.drawImage(markSprite(turn, cell), x + shakeX, y, cell, cell);
      }
      c.globalAlpha = 1;
    }

    // Marks leaving the board between rounds.
    for (const m of fading) {
      const k = clamp((stateT - m.gone) / 0.4, 0, 1);
      const [x, y] = cellXY(m.i), s = cell * (1 - ease.inOut(k) * 0.7);
      c.globalAlpha = 1 - k;
      c.drawImage(markSprite(m.who, cell), x - s / 2, y - s / 2, s, s);
    }
    c.globalAlpha = 1;
    // Marks: drawn stroke by stroke, then a cached picture.
    for (const m of marks) {
      const age = stateT - m.t, dur = m.who === 1 ? 0.3 : 0.34;
      const [x, y] = cellXY(m.i);
      const onLine = winLine && winLine.includes(m.i);
      let s = 1, alpha = 1;
      if (winLine && stateT - endT > 0.3) {
        if (onLine) s = 1 + Math.max(0, Math.sin((stateT - endT - 0.3) * 5)) * 0.1;
        else alpha = Math.max(0.3, 1 - (stateT - endT - 0.3) * 2);
      } else if (!winLine && winner === 0 && full(board) && stateT - endT > 0.3) {
        alpha = 0.55 + Math.sin(t * 4) * 0.15;
      }
      c.globalAlpha = alpha;
      if (age < dur) {
        const p = ease.out(clamp(age / dur, 0, 1));
        strokeMark(c, m.who, x, y, cell * 0.26 * (0.9 + 0.1 * p), p);
      } else {
        const land = clamp((age - dur) / 0.25, 0, 1);
        const sz = cell * s * (1 + Math.sin(land * Math.PI) * 0.08);
        c.drawImage(markSprite(m.who, cell), x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    c.globalAlpha = 1;

    // The winning line sweeps across.
    if (winLine) {
      const k = clamp((stateT - endT - 0.3) / 0.45, 0, 1);
      if (k > 0) {
        const [ax, ay] = cellXY(winLine[0]), [bx, by] = cellXY(winLine[2]);
        const ex = 0.38;
        const sx = ax - (bx - ax) * ex / 2, sy = ay - (by - ay) * ex / 2;
        const tx = bx + (bx - ax) * ex / 2, ty = by + (by - ay) * ex / 2;
        const hx = lerp(sx, tx, ease.out(k)), hy = lerp(sy, ty, ease.out(k));
        const col = COL[winner], pulse = 1 + Math.sin(t * 8) * 0.12;
        c.lineCap = 'round';
        for (const [wd, st] of [[0.32 * pulse, rgba(col, 0.16)], [0.18, rgba(col, 0.4)], [0.09, col], [0.035, '#ffffff']]) {
          c.lineWidth = cell * wd; c.strokeStyle = st;
          c.beginPath(); c.moveTo(sx, sy); c.lineTo(hx, hy); c.stroke();
        }
        const hs = cell * 0.7 * (k < 1 ? 1 : 0.6 + Math.sin(t * 6) * 0.15);
        c.drawImage(sparkSprite(col, cell), hx - hs / 2, hy - hs / 2, hs, hs);
      }
    }
    c.restore();
  }

  function drawSparkles(c) {
    for (const p of sparkles) {
      const k = p.life / p.max;
      const s = p.size * (k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8 * 0.7);
      c.globalAlpha = 1 - k * k;
      c.drawImage(sparkSprite(p.col, L.cell), p.x - s / 2, p.y - s / 2, s, s);
    }
    c.globalAlpha = 1;
  }

  function drawPlayerCard(c, who, t) {
    const r = L.pcard[who], u = L.unit;
    const active = state === 'play' && turn === who && !demo;
    const won = state === 'result' && winner === who;
    const bump = who === 1 ? bumpX : bumpO;
    const k = (active ? 1.04 + Math.sin(t * 4) * 0.01 : 1) + bump * 0.06;
    c.save();
    c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
    c.globalAlpha = active || won || state !== 'play' ? 1 : 0.62;
    c.drawImage(panelPic(r.w, r.h, active || won ? COL[who] : 'rgba(255,200,180,0.25)'), -r.w / 2, -r.h / 2, r.w, r.h);
    if (active || won) {
      roundRect(c, -r.w / 2 - 3, -r.h / 2 - 3, r.w + 6, r.h + 6, Math.min(r.w, r.h) * 0.13);
      c.lineWidth = 4 + Math.sin(t * 6) * 2; c.strokeStyle = rgba(COL[who], 0.45); c.stroke();
    }
    const thinking = active && mode.tv && who === 2;
    if (L.wide) {
      const ms = r.h * 0.34;
      c.drawImage(markSprite(who, ms), -ms / 2, -r.h * 0.43, ms, ms);
      text(c, nameOf(who), 0, -r.h * 0.03, Math.min(r.h * 0.085, r.w * 0.13), '#ffffff', 900);
      c.save(); c.scale(1 + bump * 0.4, 1 + bump * 0.4);
      outlined(c, String(tally[who]), 0, r.h * 0.17 / (1 + bump * 0.4), r.h * 0.2, '#ffffff', COL[who]);
      c.restore();
      // Match pips: first to 3.
      for (let p = 0; p < TO_WIN; p++) {
        const px = (p - 1) * r.w * 0.2, py = r.h * 0.34, pr = r.h * 0.03;
        c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2);
        c.fillStyle = p < tally[who] ? COL[who] : 'rgba(255,255,255,0.14)'; c.fill();
        if (p < tally[who]) { c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke(); }
      }
      if (thinking) {
        for (let d = 0; d < 3; d++) {
          const dy = Math.max(0, Math.sin(t * 8 - d * 0.7)) * r.h * 0.025;
          c.beginPath(); c.arc((d - 1) * r.h * 0.05, r.h * 0.07 - dy, r.h * 0.014, 0, Math.PI * 2);
          c.fillStyle = 'rgba(255,255,255,0.8)'; c.fill();
        }
      }
    } else {
      const ms = r.h * 0.6;
      c.drawImage(markSprite(who, ms), -r.w * 0.47, -ms / 2, ms, ms);
      text(c, nameOf(who), -r.w * 0.06, -r.h * 0.18, r.h * 0.17, '#ffffff', 900, 'left');
      outlined(c, String(tally[who]), r.w * 0.3, r.h * 0.15, r.h * 0.34, '#ffffff', COL[who]);
      for (let p = 0; p < TO_WIN; p++) {
        c.beginPath(); c.arc(-r.w * 0.02 + p * r.h * 0.13, r.h * 0.2, r.h * 0.045, 0, Math.PI * 2);
        c.fillStyle = p < tally[who] ? COL[who] : 'rgba(255,255,255,0.14)'; c.fill();
      }
    }
    c.restore();
    c.globalAlpha = 1;
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, u = L.unit;
    Kit.background(c, t, '#2c1846', '#07040f', 'rgba(255,110,80,0.09)');
    if (!L.W) return;
    // Round over: the board shrinks up out of the way so the result panel sits under it.
    const rk = resultK(), bs = 1 - 0.28 * rk, shift = rk * boardShift(0.72);
    c.save();
    c.translate(L.cx, L.cy - shift); c.scale(bs, bs); c.translate(-L.cx, -L.cy);
    drawBoard(c, t);
    drawSparkles(c);
    c.restore();
    L.boardBottom = L.cy - shift + (L.B / 2) * bs;

    if (state !== 'menu') {
      drawPlayerCard(c, 1, t); drawPlayerCard(c, 2, t);
      // Top line: round, level, draws.
      const ty = L.wide ? (L.cy - L.B / 2 - L.pad) / 2 + u * 0.1 : H * 0.07;
      const lvl = mode.tv ? `${mode.icon} ${mode.name}` : '👥 2 Players';
      c.save();
      c.globalAlpha = 1 - rk;
      text(c, `Round ${round}`, W / 2, ty - u * 0.55, u * 1.15, '#ffffff', 900);
      c.translate(W / 2, ty + u * 0.65); c.scale(1 + bumpD * 0.25, 1 + bumpD * 0.25);
      text(c, `${lvl}   ·   Draws ${tally.d}   ·   First to ${TO_WIN}`, 0, 0, u * 0.68, 'rgba(255,230,220,0.78)', 700);
      c.restore();
      // Status pill under the board.
      if (state === 'play') {
        let msg, col;
        if (mode.tv) { msg = turn === 1 ? 'Your turn' : 'TV is thinking…'; col = COL[turn]; } else { msg = `${nameOf(turn)}  ·  ${turn === 1 ? 'X' : 'O'} to play`; col = COL[turn]; }
        const py = L.cy + L.B / 2 + L.pad + (H - (L.cy + L.B / 2 + L.pad)) / 2 - u * 0.15;
        c.font = `800 ${Math.round(u * 0.85)}px system-ui, sans-serif`;
        const pw = c.measureText(msg).width + u * 2.4, ph = u * 1.5;
        roundRect(c, W / 2 - pw / 2, py - ph / 2, pw, ph, ph / 2);
        c.fillStyle = rgba(col, 0.18); c.fill();
        c.lineWidth = 2; c.strokeStyle = rgba(col, 0.75); c.stroke();
        c.beginPath(); c.arc(W / 2 - pw / 2 + ph * 0.5, py, ph * 0.16 * (1 + Math.sin(t * 6) * 0.25), 0, Math.PI * 2);
        c.fillStyle = col; c.fill();
        text(c, msg, W / 2 + ph * 0.18, py, u * 0.85, '#ffffff', 800);
      }
    }


    if (state === 'menu') drawMenu(c, t);
    if (state === 'result') drawResult(c);
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.unit, wide = L.wide;
    c.fillStyle = 'rgba(10,4,22,0.74)'; c.fillRect(0, 0, W, H);
    const titleY = wide ? H * 0.15 : H * 0.12, ts = wide ? H * 0.1 : W * 0.1;
    c.save(); c.translate(W / 2, titleY); c.scale(1 + Math.sin(t * 2) * 0.012, 1 + Math.sin(t * 2) * 0.012);
    outlined(c, 'TIC-TAC-TOE', 0, 0, ts, '#ffffff', '#ffb59a');
    c.restore();
    // "GLOW" with a coral-to-turquoise gradient
    c.font = `900 ${Math.round(ts * 0.62)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const gw = c.measureText('G L O W').width;
    c.lineJoin = 'round'; c.lineWidth = ts * 0.09; c.strokeStyle = 'rgba(18,6,34,0.92)';
    c.strokeText('G L O W', W / 2, titleY + ts * 0.82);
    const gg = c.createLinearGradient(W / 2 - gw / 2, 0, W / 2 + gw / 2, 0);
    const sh = (Math.sin(t * 1.5) + 1) / 2;
    gg.addColorStop(0, COL[1]); gg.addColorStop(clamp(sh, 0.05, 0.95), '#fff3c4'); gg.addColorStop(1, COL[2]);
    c.fillStyle = gg; c.fillText('G L O W', W / 2, titleY + ts * 0.82);

    let cw, ch, pos;
    const gap = u * 0.8;
    if (wide) {
      cw = Math.min(W * 0.19, H * 0.34); ch = cw * 0.86;
      const total = cw * 4 + gap * 3, x0 = (W - total) / 2, y0 = H * 0.56 - ch / 2;
      pos = (i) => ({ x: x0 + i * (cw + gap), y: y0 });
    } else {
      cw = Math.min(W * 0.42, H * 0.25); ch = cw * 0.8;
      const x0 = W / 2 - cw - gap / 2, y0 = H * 0.53 - ch - gap / 2;
      pos = (i) => ({ x: x0 + (i % 2) * (cw + gap), y: y0 + Math.floor(i / 2) * (ch + gap) });
    }
    L.cards = MODES.map((m, i) => ({ ...pos(i), w: cw, h: ch }));
    const hintY = L.cards[0].y - u * 1.1;
    text(c, Kit.touchFirst() ? 'Tap how you want to play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, hintY, u * 0.8, 'rgba(255,255,255,0.85)', 700);
    MODES.forEach((m, i) => {
      const r = L.cards[i], on = i === modeIx;
      const k = on ? 1.07 + Math.sin(t * 5) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      c.drawImage(panelPic(r.w, r.h, on ? '#ffd27a' : 'rgba(255,200,180,0.28)'), -r.w / 2, -r.h / 2, r.w, r.h);
      if (on) {
        roundRect(c, -r.w / 2 - 3, -r.h / 2 - 3, r.w + 6, r.h + 6, Math.min(r.w, r.h) * 0.13);
        c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,210,122,0.5)'; c.stroke();
      }
      text(c, m.icon, 0, -r.h * 0.24, r.h * 0.24, '#fff', 400);
      text(c, m.name, 0, r.h * 0.03, r.h * 0.15, '#ffffff', 900);
      text(c, m.tip, 0, r.h * 0.2, r.h * 0.085, 'rgba(255,235,225,0.75)', 600);
      text(c, m.tv ? `👑 ${winsBy[m.id] || 0} wins` : 'X vs O on one TV', 0, r.h * 0.36, r.h * 0.095, m.tv ? '#ffd27a' : 'rgba(160,255,240,0.85)', 800);
      c.restore();
    });
    const last = L.cards[L.cards.length - 1];
    const tipY = last.y + last.h + u * 1.4;
    text(c, `First to ${TO_WIN} rounds wins the match  ·  who starts swaps each round`, W / 2, tipY, u * 0.68, 'rgba(255,255,255,0.68)', 600);
    if (totalWins() > 0) text(c, `👑 ${totalWins()} wins against the TV`, W / 2, tipY + u * 1.1, u * 0.72, '#ffd27a', 800);
  }

  const resultK = () => (state === 'result' ? ease.inOut(clamp((stateT - endT - 0.9) / 0.45, 0, 1)) : 0);
  const boardShift = (s) => L.cy - (L.B / 2 + L.pad * 0.6) * s - (L.wide ? L.H * 0.04 : L.pcard[1].y + L.pcard[1].h + L.unit * 0.6);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function drawResult(c) {
    const W = Kit.W, H = Kit.H, u = L.unit;
    const a = clamp((stateT - endT - 1.1) / 0.35, 0, 1);
    if (a <= 0) return;
    const top = L.cy - boardShift(0.72) + (L.B / 2) * 0.72 + u * 0.6, bottom = H - u * 0.5;
    const pw = Math.min(W * 0.92, L.B * (L.wide ? 1.16 : 1.05)), ph = Math.min(bottom - top, u * 11);
    const pcx = W / 2, pcy = top + ph / 2;
    c.save();
    c.translate(pcx, pcy); const k = ease.back(a); c.scale(k, k);
    const col = winner ? COL[winner] : '#ffd27a';
    c.drawImage(panelPic(pw, ph, col), -pw / 2, -ph / 2, pw, ph);
    const who = (n) => (mode.tv ? (n === 1 ? 'You' : 'TV') : `Player ${n}`);
    const rows = [];
    if (matchWinner) {
      rows.push(['title', mode.tv ? (matchWinner === 1 ? '🏆 Match won!' : 'The TV takes the match') : `🏆 ${who(matchWinner)} wins the match!`]);
      rows.push(['big', `${tally[1]} – ${tally[2]}`]);
      let line = tally.d ? plural(tally.d, 'draw') : 'No draws';
      if (mode.tv && matchWinner === 1) line += `   ·   👑 ${plural(totalWins(), 'win')} vs the TV`;
      rows.push(['sub', line]);
    } else {
      rows.push(['title', !winner ? "It's a draw" : mode.tv ? (winner === 1 ? 'You win the round!' : 'The TV wins this one') : `${who(winner)} wins the round!`]);
      rows.push(['sub', `${who(1)} ${tally[1]}   ·   Draws ${tally.d}   ·   ${who(2)} ${tally[2]}`]);
      if (winner === 1 && mode.tv) rows.push(['gold', `👑 ${plural(totalWins(), 'win')} vs the TV`]);
    }
    rows.push(['buttons']);
    const weight = { title: 1.7, big: 2.1, sub: 0.95, gold: 0.95, buttons: 1.9 };
    const sum = rows.reduce((t, r) => t + weight[r[0]], 0);
    const room = ph - u * 0.9;
    let y = -ph / 2 + u * 0.45;
    for (const [kind, str] of rows) {
      const h = (weight[kind] / sum) * room, my = y + h / 2;
      if (kind === 'title') outlined(c, str, 0, my, Math.min(u * 1.5, (pw * 1.5) / Math.max(12, str.length)), '#ffffff', shade(col, 0.25));
      else if (kind === 'big') outlined(c, str, 0, my, Math.min(u * 2.2, h * 0.9), '#fff6d8', col);
      else if (kind === 'sub') text(c, str, 0, my, u * 0.72, 'rgba(255,235,225,0.88)', 700);
      else if (kind === 'gold') text(c, str, 0, my, u * 0.72, '#ffd27a', 800);
      else {
        const bh = Math.min(u * 1.45, h * 0.8), b1 = Math.min(pw * 0.44, u * 9), gap = u * 0.6;
        const x1 = -gap / 2 - b1, x2 = gap / 2;
        roundRect(c, x1, my - bh / 2, b1, bh, bh / 2);
        c.fillStyle = rgba(col, 0.85); c.fill();
        c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke();
        const touch = Kit.touchFirst();
        text(c, touch ? (matchWinner ? 'New match' : 'Next round') : (matchWinner ? 'OK  New match' : 'OK  Next round'), x1 + b1 / 2, my, u * 0.72, '#1a0b2e', 900);
        roundRect(c, x2, my - bh / 2, b1, bh, bh / 2);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
        c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.3)'; c.stroke();
        text(c, touch ? 'Change mode' : '◀ ▶  Change mode', x2 + b1 / 2, my, u * 0.66, 'rgba(255,255,255,0.88)', 800);
        L.menuBtn = { x: pcx + x2 * k, y: pcy + (my - bh / 2) * k, w: b1 * k, h: bh * k };
      }
      y += h;
    }
    c.restore();
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  toMenu();
  Kit.canvas.focus();
  if (totalWins() > 0) Kit.record('tictacglow', totalWins());
})();
