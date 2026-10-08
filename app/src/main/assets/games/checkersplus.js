// Checkers: the classic game on a polished walnut board. Red (you) plays from the bottom and moves first;
// a capture must be taken when there is one, and a jump keeps going while it can. Reach the far row to be
// crowned a king. Play the TV (Easy, Normal, Hard) or a friend on the same remote.
// Remote: arrows move the cursor, OK picks a piece, OK on a glowing dot moves it. Touch: tap a piece, then a dot.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const MODES = [
    { id: 'easy', name: 'Easy', tip: 'A gentle game', depth: 2, tv: true, icon: '🙂' },
    { id: 'normal', name: 'Normal', tip: 'A fair fight', depth: 4, tv: true, icon: '😎' },
    { id: 'hard', name: 'Hard', tip: 'Thinks far ahead', depth: 6, tv: true, icon: '🧠' },
    { id: 'two', name: '2 Players', tip: 'Share the remote', depth: 0, tv: false, icon: '👥' },
  ];
  const RED = { base: '#e0343f', light: '#ff8a80', dark: '#6e0b16', rim: '#ffb3ad' };
  const BLACK = { base: '#2a2d38', light: '#7d8496', dark: '#07080b', rim: '#aeb6c8' };
  const GOLD = '#ffcf4a';

  // ---------- Rules (the same as the app's old Checkers) ----------
  // 1 red, 2 red king, -1 black, -2 black king. Red sits at the bottom and moves up.
  const D_UP = [[-1, -1], [-1, 1]], D_DOWN = [[1, -1], [1, 1]], D_ALL = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const dirs = (p) => (p === 1 ? D_UP : p === -1 ? D_DOWN : D_ALL);
  function jumpsFrom(b, at, who, path, taken, out) {
    const piece = b[path[0]];
    let more = false;
    for (const [dr, dc] of dirs(piece)) {
      const mr = (at >> 3) + dr, mc = (at & 7) + dc, lr = mr + dr, lc = mc + dc;
      if (lr < 0 || lr > 7 || lc < 0 || lc > 7) continue;
      const mid = mr * 8 + mc, land = lr * 8 + lc;
      if (b[mid] * who < 0 && !taken.includes(mid) && (b[land] === 0 || land === path[0])) {
        more = true;
        // A man that reaches the far row is crowned, and that ends the move.
        const crowned = Math.abs(piece) === 1 && (lr === 0 || lr === 7);
        if (crowned) out.push({ path: [...path, land], taken: [...taken, mid] });
        else jumpsFrom(b, land, who, [...path, land], [...taken, mid], out);
      }
    }
    if (!more && taken.length) out.push({ path, taken });
  }
  function moves(b, who) {
    const jumps = [];
    for (let i = 0; i < 64; i++) if (b[i] * who > 0) jumpsFrom(b, i, who, [i], [], jumps);
    if (jumps.length) return jumps;
    const out = [];
    for (let i = 0; i < 64; i++) {
      if (b[i] * who <= 0) continue;
      for (const [dr, dc] of dirs(b[i])) {
        const r = (i >> 3) + dr, c = (i & 7) + dc;
        if (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === 0) out.push({ path: [i, r * 8 + c], taken: [] });
      }
    }
    return out;
  }
  function apply(b, m) {
    const from = m.path[0], to = m.path[m.path.length - 1];
    let piece = b[from];
    b[from] = 0;
    for (const k of m.taken) b[k] = 0;
    const row = to >> 3;
    if (piece === 1 && row === 0) piece = 2;
    if (piece === -1 && row === 7) piece = -2;
    b[to] = piece;
  }
  function evalBoard(b) {
    let v = 0;
    for (let i = 0; i < 64; i++) {
      const p = b[i];
      if (!p) continue;
      const row = i >> 3;
      v += p === 1 ? 100 + (7 - row) * 3 : p === 2 ? 170 : p === -1 ? -100 - row * 3 : -170;
    }
    return v;
  }
  function search(b, who, d, alpha, beta) {
    const ms = moves(b, who);
    if (!ms.length) return -10000 - d;
    if (d <= 0) return who * evalBoard(b);
    for (const m of ms) {
      const nb = b.slice();
      apply(nb, m);
      const v = -search(nb, -who, d - 1, -beta, -alpha);
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return alpha;
  }
  function tvMove(depth) {
    let best = null, bestV = -Infinity;
    for (const m of moves(board, -1)) {
      const b = board.slice();
      apply(b, m);
      // Only a move that could still beat the best so far (with the small random nudge) needs an exact score.
      const cut = bestV === -Infinity ? 100000 : -(bestV - 3);
      const v = -search(b, 1, depth - 1, -100000, cut) + Math.floor(Math.random() * 3);
      if (v > bestV) { bestV = v; best = m; }
    }
    return best;
  }

  // ---------- State ----------
  let modeIx = clamp(Kit.store.get('checkersplus.mode', 1), 0, MODES.length - 1);
  let wins = Kit.store.get('checkersplus.wins', 0);
  const winsBy = Kit.store.get('checkersplus.winsBy', { easy: 0, normal: 0, hard: 0 });
  let state = 'menu', stateT = 0, menuT = 0;
  let board, side, cursor, selected, targets, partial, lastMove, curMoves, mode;
  let live = null; // the piece on the move: { origin, piece, at, popped, queue, seg, final }
  let pops = []; // captured pieces popping away
  let crown = null; // { sq, t }
  let thinkAt = 0, result = null, overT = 0, nopeT = -9, nopeSq = -1;
  const view = { r: 5, c: 0 };

  function newGame() {
    board = new Array(64).fill(0);
    for (let i = 0; i < 64; i++) {
      const r = i >> 3, c = i & 7;
      if ((r + c) % 2 === 1) { if (r < 3) board[i] = -1; if (r > 4) board[i] = 1; }
    }
    side = 1; cursor = 5 * 8 + 0; selected = -1; targets = []; partial = []; lastMove = [];
    live = null; pops = []; crown = null; result = null;
    curMoves = moves(board, side);
  }
  newGame();

  function start() {
    mode = MODES[modeIx];
    Kit.store.set('checkersplus.mode', modeIx);
    newGame();
    state = 'play'; stateT = 0;
    view.r = cursor >> 3; view.c = cursor & 7;
    sfx.pick();
  }
  function toMenu() { state = 'menu'; menuT = 0; newGame(); }
  const tvTurn = () => state === 'play' && mode.tv && side === -1;
  const sideName = (s) => (s === 1 ? 'Red' : 'Black');

  // ---------- Sounds of wood ----------
  const tok = () => { Kit.noise({ dur: 0.07, vol: 0.22, freq: 900, q: 1.4 }); Kit.tone(210, { type: 'sine', dur: 0.1, vol: 0.3, slide: 0.7 }); };
  const capSound = () => { Kit.tone(620, { type: 'triangle', dur: 0.14, vol: 0.2, slide: 1.9 }); Kit.noise({ dur: 0.12, vol: 0.14, freq: 3000, q: 0.8, sweep: 0.4 }); };
  const crownSound = () => { [0, 1, 2, 3].forEach((i) => Kit.tone([784, 988, 1175, 1568][i], { type: 'triangle', dur: 0.4, vol: 0.13, at: i * 0.07 })); };

  // ---------- Moves ----------
  function press() {
    if (state !== 'play' || tvTurn() || busy()) return;
    if (!partial.length) {
      if (board[cursor] * side > 0 && curMoves.some((m) => m.path[0] === cursor)) {
        if (selected === cursor) { selected = -1; targets = []; sfx.move(); return; }
        selected = cursor;
        targets = [...new Set(curMoves.filter((m) => m.path[0] === cursor).map((m) => m.path[1]))];
        sfx.pick();
      } else if (selected >= 0 && targets.includes(cursor)) step();
      else if (board[cursor] * side > 0) {
        nope(cursor, curMoves.some((m) => m.taken.length) ? 'You must jump!' : 'Can\'t move');
        selected = -1; targets = [];
      } else if (selected >= 0) { selected = -1; targets = []; sfx.move(); }
      else nope(-1);
    } else if (targets.includes(cursor)) step();
    else nope(-1, 'Keep jumping!');
  }
  function nope(sq, msg) {
    sfx.nope(); nopeT = stateT; nopeSq = sq;
    if (msg) {
      const p = sq >= 0 ? sqPos(sq) : sqPos(cursor);
      Kit.float(msg, p.x, p.y - L.cs * 0.6, { color: '#ffb347', size: L.cs * 0.42, life: 1.1 });
    }
  }
  // Moves the chosen piece one hop to the cursor; the turn ends when the jump can't go on.
  function step() {
    if (!partial.length) {
      partial.push(selected);
      live = { origin: selected, piece: board[selected], at: selected, popped: new Set(), queue: [], seg: null, final: null };
    }
    partial.push(cursor);
    live.queue.push(cursor);
    const fits = curMoves.filter((m) => m.path.length >= partial.length && partial.every((s, i) => m.path[i] === s));
    const done = fits.find((m) => m.path.length === partial.length);
    if (done) { live.final = done; selected = -1; targets = []; }
    else { selected = cursor; targets = [...new Set(fits.map((m) => m.path[partial.length]))]; }
  }
  const busy = () => !!(live && (live.seg || live.queue.length || live.final)) || !!crown;

  function finishMove(m) {
    const before = board[m.path[0]];
    apply(board, m);
    const to = m.path[m.path.length - 1];
    lastMove = m.path; live = null; partial = []; selected = -1; targets = [];
    if (Math.abs(before) === 1 && Math.abs(board[to]) === 2) {
      crown = { sq: to, t: 0 };
      crownSound();
      const p = sqPos(to);
      Kit.burst(p.x, p.y, GOLD, 18, 0.9);
      Kit.float('King!', p.x, p.y - L.cs * 0.7, { color: GOLD, size: L.cs * 0.6, life: 1.3 });
    }
    endTurn();
  }
  function endTurn() {
    side = -side;
    curMoves = moves(board, side);
    if (!curMoves.length) {
      const winner = -side;
      const humanWon = !mode.tv || winner === 1;
      result = { winner, humanWon, title: !mode.tv ? sideName(winner) + ' wins!' : winner === 1 ? 'You win!' : 'The TV wins' };
      state = 'over'; overT = stateT + 1.2;
      if (mode.tv && humanWon) {
        wins++; winsBy[mode.id] = (winsBy[mode.id] || 0) + 1;
        Kit.store.set('checkersplus.wins', wins); Kit.store.set('checkersplus.winsBy', winsBy);
        Kit.record('checkersplus', wins);
      }
      setTimeout(() => { if (humanWon) { sfx.win(); Kit.confetti(140); } else sfx.over(); }, 500);
      return;
    }
    if (tvTurn()) thinkAt = stateT + 0.75;
  }

  // ---------- Layout ----------
  let L = { cs: 40 };
  function layout(W, H) {
    const wide = W / H > 1.15;
    if (wide) {
      const B = Math.min(H * 0.84, W * 0.55), gap = B * 0.07, pw = Math.min(W * 0.3, B * 0.66);
      const bx = (W - (B + gap + pw)) / 2, by = (H - B) / 2 + H * 0.01;
      L = { wide, B, bx, by, cs: B / 8, px: bx + B + gap, py: by, pw, ph: B };
    } else {
      const B = Math.min(W * 0.9, H * 0.58);
      const bx = (W - B) / 2, by = H * 0.08;
      L = { wide, B, bx, by, cs: B / 8, px: bx, py: by + B + B * 0.08, pw: B, ph: H - (by + B + B * 0.08) - 12 };
    }
    boardPic = null; sprites.clear();
  }
  Kit.onResize(layout);
  const sqPos = (sq) => ({ x: L.bx + ((sq & 7) + 0.5) * L.cs, y: L.by + ((sq >> 3) + 0.5) * L.cs });

  // ---------- Pictures, drawn once (gradients are slow on TV boxes) ----------
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  let boardPic = null;
  function makeBoard() {
    const { B, cs } = L, fm = cs * 0.38, S = B + fm * 2, dpr = DPR();
    const cv = document.createElement('canvas');
    cv.width = cv.height = Math.ceil(S * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    // Frame: dark polished walnut with a brass inlay.
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = fm * 0.8; c.shadowOffsetY = fm * 0.25;
    roundRect(c, fm * 0.12, fm * 0.12, S - fm * 0.24, S - fm * 0.24, fm * 0.6);
    const fg = c.createLinearGradient(0, 0, S, S);
    fg.addColorStop(0, '#5a321b'); fg.addColorStop(0.5, '#3a1f10'); fg.addColorStop(1, '#22120a');
    c.fillStyle = fg; c.fill();
    c.restore();
    roundRect(c, fm * 0.12, fm * 0.12, S - fm * 0.24, S - fm * 0.24, fm * 0.6);
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,220,170,0.25)'; c.stroke();
    c.lineWidth = fm * 0.09; c.strokeStyle = '#c99a45';
    roundRect(c, fm * 0.62, fm * 0.62, S - fm * 1.24, S - fm * 1.24, fm * 0.2); c.stroke();
    // Squares: maple and walnut with a little grain.
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      const dark = (r + col) % 2 === 1, x = fm + col * cs, y = fm + r * cs;
      const base = dark ? '#7a4526' : '#eccb98';
      c.fillStyle = shade(base, (rnd() - 0.5) * 0.08); c.fillRect(x, y, cs + 0.5, cs + 0.5);
      c.save();
      c.beginPath(); c.rect(x, y, cs, cs); c.clip();
      c.strokeStyle = dark ? 'rgba(40,15,5,0.22)' : 'rgba(150,95,45,0.18)';
      for (let k = 0; k < 7; k++) {
        c.lineWidth = 0.6 + rnd() * 1.4;
        const off = rnd() * cs, amp = 1 + rnd() * 3, ph = rnd() * 6;
        c.beginPath();
        for (let s = 0; s <= 10; s++) {
          const u = s / 10 * cs, v = off + Math.sin(s * 0.7 + ph) * amp;
          if (dark) { s ? c.lineTo(x + u, y + v) : c.moveTo(x + u, y + v); } else { s ? c.lineTo(x + v, y + u) : c.moveTo(x + v, y + u); }
        }
        c.stroke();
      }
      c.restore();
    }
    // Soft light from the top left, a little shade bottom right, and a gloss.
    const lg = c.createRadialGradient(fm + B * 0.25, fm + B * 0.2, 0, fm + B * 0.25, fm + B * 0.2, B * 1.05);
    lg.addColorStop(0, 'rgba(255,240,210,0.22)'); lg.addColorStop(0.55, 'rgba(255,240,210,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = lg; c.fillRect(fm, fm, B, B);
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 3; c.strokeRect(fm, fm, B, B);
    boardPic = { cv, fm, S };
  }

  const sprites = new Map();
  function sprite(key, size, draw) {
    const k = key + Math.round(size);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = DPR();
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(size * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, size);
    sprites.set(k, s);
    return s;
  }
  // A glossy, chunky puck seen from just above: its side, the domed top, a ring groove and a shine.
  const pieceSprite = (col, size) => sprite('p' + col.base, size, (c, s) => {
    const R = s * 0.4, th = s * 0.075, cx = s / 2, cy = s / 2 - th / 2;
    c.beginPath(); c.arc(cx, cy + th, R, 0, Math.PI * 2);
    const sg = c.createLinearGradient(cx - R, 0, cx + R, 0);
    sg.addColorStop(0, shade(col.dark, 0.1)); sg.addColorStop(0.4, shade(col.base, -0.35)); sg.addColorStop(1, col.dark);
    c.fillStyle = sg; c.fill();
    c.lineWidth = s * 0.02; c.strokeStyle = col.dark; c.stroke();
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2);
    const tg = c.createRadialGradient(cx - R * 0.35, cy - R * 0.45, R * 0.1, cx, cy, R * 1.05);
    tg.addColorStop(0, col.light); tg.addColorStop(0.45, col.base); tg.addColorStop(1, shade(col.base, -0.4));
    c.fillStyle = tg; c.fill();
    c.lineWidth = s * 0.018; c.strokeStyle = rgba(col.rim, 0.75); c.stroke();
    // Grooves
    for (const [rr, a] of [[0.74, 0.5], [0.48, 0.35]]) {
      c.beginPath(); c.arc(cx, cy + s * 0.008, R * rr, 0, Math.PI * 2);
      c.lineWidth = s * 0.03; c.strokeStyle = `rgba(0,0,0,${a})`; c.stroke();
      c.beginPath(); c.arc(cx, cy - s * 0.008, R * rr, Math.PI * 1.05, Math.PI * 1.95);
      c.lineWidth = s * 0.016; c.strokeStyle = rgba(col.rim, 0.5); c.stroke();
    }
    // Shine
    c.save();
    c.beginPath(); c.ellipse(cx - R * 0.28, cy - R * 0.42, R * 0.5, R * 0.26, -0.5, 0, Math.PI * 2);
    const hg = c.createLinearGradient(0, cy - R * 0.7, 0, cy - R * 0.15);
    hg.addColorStop(0, 'rgba(255,255,255,0.7)'); hg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = hg; c.fill();
    c.restore();
  });
  const shadowSprite = (size) => sprite('shadow', size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.65, 'rgba(0,0,0,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const crownSprite = (size) => sprite('crown', size, (c, s) => {
    const w = s * 0.62, h = s * 0.42, x = (s - w) / 2, y = (s - h) / 2 + s * 0.04;
    c.beginPath();
    c.moveTo(x, y + h);
    c.lineTo(x - w * 0.04, y + h * 0.18);
    c.lineTo(x + w * 0.27, y + h * 0.55);
    c.lineTo(x + w * 0.5, y);
    c.lineTo(x + w * 0.73, y + h * 0.55);
    c.lineTo(x + w * 1.04, y + h * 0.18);
    c.lineTo(x + w, y + h);
    c.closePath();
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#fff3b0'); g.addColorStop(0.45, GOLD); g.addColorStop(1, '#b8780e');
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.lineWidth = s * 0.03; c.strokeStyle = '#6b3d05'; c.stroke();
    c.fillStyle = '#b8780e'; c.fillRect(x + w * 0.04, y + h * 0.78, w * 0.92, h * 0.1);
    for (const [px, py] of [[x - w * 0.04, y + h * 0.18], [x + w * 0.5, y], [x + w * 1.04, y + h * 0.18]]) {
      c.beginPath(); c.arc(px, py, s * 0.045, 0, Math.PI * 2); c.fillStyle = '#fff6c8'; c.fill(); c.stroke();
    }
    [['#ff4d6d', 0.28], ['#4ea8de', 0.5], ['#3bceac', 0.72]].forEach(([col, f]) => {
      c.beginPath(); c.arc(x + w * f, y + h * 0.68, s * 0.035, 0, Math.PI * 2); c.fillStyle = col; c.fill();
    });
  });
  const dotSprite = (size) => sprite('dot', size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.22, 'rgba(160,255,240,1)'); g.addColorStop(0.42, 'rgba(60,230,210,0.55)'); g.addColorStop(1, 'rgba(60,230,210,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const glowSprite = (size) => sprite('glow', size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, s * 0.25, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,200,80,0.75)'); g.addColorStop(1, 'rgba(255,170,40,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });

  // Draws a piece centred at (x, y): lift raises it off the board (its shadow stays down).
  function drawPiece(c, p, x, y, { scale = 1, lift = 0, alpha = 1, crownY = null } = {}) {
    const cs = L.cs, col = p > 0 ? RED : BLACK;
    c.globalAlpha = alpha * (1 - Math.min(0.5, lift / cs));
    const sh = shadowSprite(cs), ss = cs * (1 + lift / cs * 0.4) * scale;
    c.drawImage(sh, x - ss / 2 + lift * 0.25, y - ss / 2 + cs * 0.08, ss, ss);
    c.globalAlpha = alpha;
    const ps = cs * scale * (1 + lift / cs * 0.25);
    c.drawImage(pieceSprite(col, cs), x - ps / 2, y - ps / 2 - lift, ps, ps);
    if (Math.abs(p) === 2 || crownY !== null) {
      const k = ps * 0.92;
      c.drawImage(crownSprite(cs), x - k / 2, y - k / 2 - lift - ps * 0.05 + (crownY || 0), k, k);
    }
    c.globalAlpha = 1;
  }

  // ---------- Keys, taps ----------
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      if (k === 'left' || k === 'up') { modeIx = (modeIx + MODES.length - 1) % MODES.length; sfx.move(); }
      else if (k === 'right' || k === 'down') { modeIx = (modeIx + 1) % MODES.length; sfx.move(); }
      else if (k === 'ok') start();
      return;
    }
    if (state === 'over') {
      if (stateT < overT + 0.5) return;
      if (k === 'ok') start(); else if (k !== 'restart') { sfx.move(); toMenu(); }
      return;
    }
    if (k === 'restart') { start(); return; }
    const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[k];
    if (d) {
      const r = clamp((cursor >> 3) + d[0], 0, 7), c = clamp((cursor & 7) + d[1], 0, 7);
      if (r * 8 + c !== cursor) { cursor = r * 8 + c; sfx.move(); }
    } else if (k === 'ok') press();
  });

  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inBox = (e, b) => b && e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = (L.cards || []).findIndex((r) => inBox(e, r));
        if (i >= 0) { if (i === modeIx) start(); else { modeIx = i; sfx.move(); } }
        return;
      }
      if (state === 'over') {
        if (stateT < overT + 0.5) return;
        if (inBox(e, L.menuBtn)) toMenu(); else start();
        return;
      }
      const c = Math.floor((e.x - L.bx) / L.cs), r = Math.floor((e.y - L.by) / L.cs);
      if (r < 0 || c < 0 || r > 7 || c > 7) return;
      cursor = r * 8 + c;
      press();
    },
  });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt; menuT += dt;
    view.r = lerp(view.r, cursor >> 3, Math.min(1, dt * 20)); view.c = lerp(view.c, cursor & 7, Math.min(1, dt * 20));
    for (let i = pops.length - 1; i >= 0; i--) if ((pops[i].t += dt) > 0.5) pops.splice(i, 1);
    if (crown && (crown.t += dt) > 0.75) crown = null;
    if (state !== 'play') return;
    if (live) {
      if (!live.seg && live.queue.length) {
        const a = live.at, b = live.queue.shift(), jump = Math.abs((a >> 3) - (b >> 3)) === 2;
        live.seg = { a, b, jump, mid: jump ? (a + b) / 2 : -1, t: 0, dur: jump ? 0.36 : 0.24 };
        if (jump) Kit.tone(380, { type: 'sine', dur: 0.14, vol: 0.12, slide: 1.6 });
      }
      const s = live.seg;
      if (s) {
        s.t += dt;
        if (s.jump && s.t >= s.dur * 0.5 && !live.popped.has(s.mid)) {
          live.popped.add(s.mid);
          pops.push({ sq: s.mid, piece: board[s.mid], t: 0 });
          const p = sqPos(s.mid);
          Kit.burst(p.x, p.y, board[s.mid] > 0 ? RED.base : BLACK.light, 16, 0.8);
          Kit.burst(p.x, p.y, '#ffffff', 5, 0.6);
          capSound(); Kit.shake(5, 0.2);
        }
        if (s.t >= s.dur) {
          live.at = s.b; live.seg = null; tok();
          const p = sqPos(s.b);
          Kit.burst(p.x, p.y + L.cs * 0.25, 'rgba(255,230,190,0.8)', 4, 0.3);
        }
      }
      if (live && !live.seg && !live.queue.length && live.final) finishMove(live.final);
    } else if (tvTurn() && !crown && stateT >= thinkAt) {
      const m = tvMove(mode.depth);
      live = { origin: m.path[0], piece: board[m.path[0]], at: m.path[0], popped: new Set(), queue: m.path.slice(1), seg: null, final: m };
      selected = -1; targets = [];
    }
  }

  // ---------- Drawing helpers ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom) {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(30,12,4,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, lw = 3) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(64,40,24,0.94)'); g.addColorStop(1, 'rgba(26,16,10,0.94)');
    c.fillStyle = g; c.fill();
    c.lineWidth = lw; c.strokeStyle = border; c.stroke();
  }
  const count = (s) => board.reduce((n, v) => n + (v * s > 0 ? 1 : 0), 0);

  // ---------- Draw ----------
  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#14263a', '#060b12', 'rgba(255,170,80,0.07)');
    if (!boardPic) makeBoard();
    const { bx, by, B, cs } = L;
    c.drawImage(boardPic.cv, bx - boardPic.fm, by - boardPic.fm, boardPic.S, boardPic.S);

    // Last move: a warm glow on its squares.
    if (lastMove.length && !live) {
      lastMove.forEach((sq, i) => {
        c.fillStyle = i === lastMove.length - 1 ? 'rgba(255,196,80,0.38)' : 'rgba(255,196,80,0.22)';
        c.fillRect(bx + (sq & 7) * cs, by + (sq >> 3) * cs, cs, cs);
      });
    }
    const myTurn = state === 'play' && !tvTurn() && !busy();
    // Pieces that must jump pulse with a glow.
    const forced = myTurn && !partial.length && curMoves.length && curMoves[0].taken.length ? new Set(curMoves.map((m) => m.path[0])) : null;
    if (forced && selected < 0) {
      const g = glowSprite(cs * 1.5), k = cs * (1.35 + Math.sin(t * 6) * 0.1);
      for (const sq of forced) { const p = sqPos(sq); c.globalAlpha = 0.8; c.drawImage(g, p.x - k / 2, p.y - k / 2, k, k); }
      c.globalAlpha = 1;
    }

    // Pieces, top row first so lower ones sit in front.
    const hidden = new Set(live ? [live.origin, ...live.popped] : []);
    for (let sq = 0; sq < 64; sq++) {
      const v = board[sq];
      if (!v || hidden.has(sq)) continue;
      const p = sqPos(sq);
      let lift = 0, scale = 1, dx = 0, crownY = null;
      if (sq === selected && !live) { lift = cs * (0.14 + Math.sin(t * 5) * 0.04); scale = 1.06; }
      if (sq === nopeSq && stateT - nopeT < 0.35) dx = Math.sin((stateT - nopeT) * 55) * cs * 0.08;
      if (crown && crown.sq === sq) {
        const q = clamp(crown.t / 0.5, 0, 1);
        crownY = -(1 - ease.back(q)) * cs * 1.2;
        if (q === 0) crownY = -cs * 1.2;
      }
      if (state === 'menu') lift = Math.max(0, Math.sin(t * 2 - sq * 0.35)) * cs * 0.05;
      drawPiece(c, v, p.x + dx, p.y, { lift, scale, crownY });
    }
    for (const q of pops) {
      const p = sqPos(q.sq), k = q.t / 0.5;
      const sc = k < 0.25 ? 1 + ease.out(k / 0.25) * 0.25 : 1.25 * (1 - ease.inOut((k - 0.25) / 0.75));
      drawPiece(c, q.piece, p.x, p.y, { scale: Math.max(0.01, sc), alpha: 1 - k * 0.6 });
    }

    // Glowing dots where the chosen piece can go.
    if (myTurn && targets.length) {
      const k = cs * (0.62 + Math.sin(t * 6) * 0.06), d = dotSprite(cs);
      for (const sq of targets) { const p = sqPos(sq); c.drawImage(d, p.x - k / 2, p.y - k / 2, k, k); }
    }

    // The piece on the move: it glides, or hops high over a capture.
    if (live) {
      let x, y, lift = 0;
      const s = live.seg;
      if (s) {
        const q = ease.inOut(clamp(s.t / s.dur, 0, 1)), a = sqPos(s.a), b = sqPos(s.b);
        x = lerp(a.x, b.x, q); y = lerp(a.y, b.y, q);
        lift = Math.sin(Math.PI * clamp(s.t / s.dur, 0, 1)) * cs * (s.jump ? 0.55 : 0.12);
      } else { const p = sqPos(live.at); x = p.x; y = p.y; if (!live.final && myTurnPartial()) lift = cs * (0.14 + Math.sin(t * 5) * 0.04); }
      drawPiece(c, live.piece, x, y, { lift, scale: lift ? 1.04 : 1 });
      if (!s && !live.final && targets.length && state === 'play') {
        const k = cs * (0.62 + Math.sin(t * 6) * 0.06), d = dotSprite(cs);
        for (const sq of targets) { const p = sqPos(sq); c.drawImage(d, p.x - k / 2, p.y - k / 2, k, k); }
      }
    }

    // The remote's cursor.
    if (state === 'play' && !tvTurn()) {
      const x = bx + view.c * cs, y = by + view.r * cs, pad = cs * 0.04;
      c.lineWidth = Math.max(3, cs * 0.06) + Math.sin(t * 7) * 1.2;
      c.strokeStyle = 'rgba(0,0,0,0.45)';
      roundRect(c, x + pad + 2, y + pad + 2, cs - pad * 2, cs - pad * 2, cs * 0.16); c.stroke();
      c.strokeStyle = selected >= 0 || partial.length ? '#7dfff0' : '#ffe27a';
      roundRect(c, x + pad, y + pad, cs - pad * 2, cs - pad * 2, cs * 0.16); c.stroke();
    }

    drawSide(c, t);

    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c);
  }
  function myTurnPartial() { return state === 'play' && !tvTurn() && partial.length > 0; }

  function playerCard(c, x, y, w, h, s, t) {
    const active = state === 'play' && side === s;
    const name = mode && mode.tv ? (s === 1 ? 'You' : 'TV') : sideName(s);
    panel(c, x, y, w, h, h * 0.22, active ? GOLD : 'rgba(255,210,150,0.25)', active ? 3 + Math.sin(t * 5) * 1.2 : 2);
    drawPieceIcon(c, s, x + h * 0.52, y + h * 0.5, h * 0.7);
    const left = count(s);
    text(c, name, x + h * 1.02, y + h * 0.34, h * 0.3, '#fff', 900, 'left');
    c.font = `900 ${Math.round(h * 0.3)}px system-ui, sans-serif`;
    const nw = c.measureText(name).width;
    text(c, `· ${left}`, x + h * 1.02 + nw + h * 0.12, y + h * 0.34, h * 0.24, 'rgba(255,235,210,0.7)', 800, 'left');
    // Twelve little chips: the pieces still in play, and faded ones for those lost.
    const n = 12, room = w - h * 1.02 - h * 0.18, step = Math.min(h * 0.19, room / n), chip = step * 0.95;
    const spr = pieceSprite(s > 0 ? RED : BLACK, L.cs);
    for (let i = 0; i < n; i++) {
      c.globalAlpha = i < left ? 1 : 0.16;
      c.drawImage(spr, x + h * 1.02 + i * step, y + h * 0.7 - chip / 2, chip, chip);
    }
    c.globalAlpha = 1;
  }
  function drawPieceIcon(c, s, x, y, k) {
    c.drawImage(pieceSprite(s > 0 ? RED : BLACK, L.cs), x - k / 2, y - k / 2, k, k);
  }

  function drawSide(c, t) {
    if (state === 'menu') return;
    const { px, py, pw, ph, cs, wide } = L;
    if (!wide) {
      // Narrow screens: one status line under the board.
      text(c, statusLine(), px + pw / 2, py + cs * 0.4, cs * 0.45, '#fff', 800);
      return;
    }
    const ch = Math.min(ph * 0.2, pw * 0.36);
    playerCard(c, px, py, pw, ch, -1, t);
    playerCard(c, px, py + ph - ch, pw, ch, 1, t);
    const midY = py + ph / 2;
    // Status
    const st = statusLine();
    const sz = Math.min(pw * 0.11, cs * 0.5);
    outlined(c, st, px + pw / 2, midY - ch * 0.62, sz, '#fff6dc', side === 1 ? '#ff9a8a' : '#c8d0e8');
    if (state === 'play' && tvTurn()) {
      for (let i = 0; i < 3; i++) {
        const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i * 0.8));
        c.globalAlpha = a; c.fillStyle = '#fff';
        c.beginPath(); c.arc(px + pw / 2 + (i - 1) * sz * 0.5, midY - ch * 0.62 + sz * 0.85, sz * 0.12, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    } else if (state === 'play' && curMoves.length && curMoves[0].taken.length) {
      const bw = pw * 0.7, bh = sz * 0.95;
      roundRect(c, px + (pw - bw) / 2, midY - ch * 0.62 + sz * 0.55, bw, bh, bh / 2);
      c.fillStyle = `rgba(255,140,40,${0.75 + Math.sin(t * 6) * 0.15})`; c.fill();
      text(c, partial.length ? 'Keep jumping!' : 'You must jump!', px + pw / 2, midY - ch * 0.62 + sz * 0.55 + bh / 2, sz * 0.55, '#2a1204', 900);
    }
    // Wins and how to play.
    if (mode.tv) {
      const cy = midY + ch * 0.12, k = sz * 1.2;
      c.font = `900 ${Math.round(sz * 0.75)}px system-ui, sans-serif`;
      const ww = c.measureText(`Wins: ${wins}`).width, x0 = px + pw / 2 - (ww + k * 1.1) / 2;
      c.drawImage(crownSprite(L.cs), x0 - k * 0.1, cy - k / 2 - sz * 0.05, k, k);
      text(c, `Wins: ${wins}`, x0 + k * 1.1, cy, sz * 0.75, GOLD, 900, 'left');
      text(c, `vs TV · ${mode.name}`, px + pw / 2, cy + sz * 0.72, sz * 0.42, 'rgba(255,235,210,0.7)', 800);
    } else text(c, '2 Players', px + pw / 2, midY + ch * 0.2, sz * 0.62, 'rgba(255,235,210,0.8)', 800);
    const tips = Kit.touchFirst() ? ['Tap a piece', 'then tap a glowing dot'] : ['Arrows  move', 'OK  pick · OK on a dot  move', 'Back  games menu'];
    tips.forEach((tx, i) => text(c, tx, px + pw / 2, midY + ch * 0.85 + i * sz * 0.7, sz * 0.5, 'rgba(255,235,210,0.6)', 700));
  }
  function statusLine() {
    if (state === 'over' && result) return result.title;
    if (tvTurn()) return 'TV is thinking';
    if (mode.tv) return 'Your move';
    return `${sideName(side)}'s move`;
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    c.fillStyle = 'rgba(6,10,16,0.62)'; c.fillRect(0, 0, W, H);
    const wide = W > H;
    const u = Math.min(W / 16, H / 9);
    const cw = wide ? Math.min(W * 0.2, u * 3.3) : Math.min(W * 0.8, u * 9), ch = wide ? cw * 0.88 : Math.min(H * 0.13, cw * 0.3);
    const gap = u * 0.45;
    const total = wide ? cw * 4 + gap * 3 : ch * 4 + gap * 3;
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.585 - ch / 2 : H * 0.56 - total / 2;
    L.cards = MODES.map((m, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    const enter = ease.back(clamp(menuT / 0.5, 0, 1));
    // Title with a crown.
    const ty = H * (wide ? 0.21 : 0.12), tsz = Math.min(u * 1.3, W * 0.12);
    const ck = tsz * 1.0;
    c.drawImage(crownSprite(cs), W / 2 - ck / 2, ty - tsz * 0.98 - ck / 2 + Math.sin(t * 2) * 4, ck, ck);
    c.save(); c.translate(W / 2, ty); c.scale(enter, enter);
    outlined(c, 'CHECKERS', 0, 0, tsz, '#fff4d6', '#ffb347');
    c.restore();
    text(c, Kit.touchFirst() ? 'Tap how you want to play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, ty + tsz * 0.88, u * 0.36, 'rgba(255,240,220,0.85)', 700);
    MODES.forEach((m, i) => {
      const r = L.cards[i], on = i === modeIx;
      const k = (on ? 1.07 + Math.sin(t * 5) * 0.012 : 1) * ease.back(clamp((menuT - i * 0.06) / 0.45, 0, 1));
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(Math.max(0.01, k), Math.max(0.01, k));
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, u * 0.3, on ? GOLD : 'rgba(255,210,150,0.3)', on ? 4 + Math.sin(t * 6) * 1.5 : 2);
      if (wide) {
        // Two pieces facing off, or a TV face.
        const pk = r.h * 0.32;
        if (m.tv) {
          drawPieceIcon(c, 1, -pk * 0.45, -r.h * 0.22, pk);
          text(c, m.icon, pk * 0.5, -r.h * 0.22, pk * 0.62, '#fff', 400);
        } else { drawPieceIcon(c, 1, -pk * 0.45, -r.h * 0.22, pk); drawPieceIcon(c, -1, pk * 0.45, -r.h * 0.22, pk); }
        text(c, m.name, 0, r.h * 0.08, r.h * 0.15, '#ffffff', 900);
        text(c, m.tip, 0, r.h * 0.22, r.h * 0.085, 'rgba(255,235,210,0.75)', 600);
        if (m.tv) text(c, `🏆 ${winsBy[m.id] || 0} won`, 0, r.h * 0.37, r.h * 0.09, GOLD, 800);
        else text(c, 'Red vs Black', 0, r.h * 0.37, r.h * 0.09, 'rgba(255,235,210,0.6)', 800);
      } else {
        text(c, m.icon, -r.w * 0.38, 0, r.h * 0.4, '#fff', 400);
        text(c, m.name, -r.w * 0.24, -r.h * 0.15, r.h * 0.28, '#ffffff', 900, 'left');
        text(c, m.tip, -r.w * 0.24, r.h * 0.2, r.h * 0.17, 'rgba(255,235,210,0.75)', 600, 'left');
        if (m.tv) text(c, `🏆 ${winsBy[m.id] || 0}`, r.w * 0.44, 0, r.h * 0.22, GOLD, 800, 'right');
      }
      c.restore();
    });
    const by = wide ? y0 + ch + u * 0.75 : y0 + total + u * 0.6;
    text(c, `👑 Wins against the TV: ${wins}`, W / 2, by, u * 0.36, GOLD, 800);
    text(c, 'Jumps are a must  ·  reach the far side to be crowned', W / 2, by + u * 0.55, u * 0.3, 'rgba(255,240,220,0.6)', 600);
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, u = Math.min(W / 16, H / 9);
    if (stateT < overT) return;
    const a = clamp((stateT - overT) / 0.4, 0, 1);
    c.fillStyle = `rgba(6,10,16,${0.62 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, u * 8), ph = u * 5;
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.45, GOLD, 4);
    const won = result.humanWon;
    const ck = u * 1.4;
    if (won) c.drawImage(crownSprite(L.cs), -ck / 2, -ph / 2 - ck * 0.38, ck, ck);
    else drawPieceIcon(c, -1, 0, -ph / 2 + u * 0.05, u * 0.9);
    outlined(c, result.title, 0, -ph * 0.2, u * 0.9, '#fff6dc', won ? '#ffcf4a' : '#c8d0e8');
    const sub = !mode.tv ? `${count(result.winner)} pieces left on the board` : won ? `${mode.name} beaten! 🎉` : 'So close — try again!';
    text(c, sub, 0, ph * 0.0, u * 0.36, 'rgba(255,240,220,0.9)', 700);
    if (mode.tv) text(c, `👑 Wins: ${wins}`, 0, ph * 0.14, u * 0.42, GOLD, 900);
    else text(c, '2 Players · Red vs Black', 0, ph * 0.14, u * 0.34, 'rgba(255,240,220,0.65)', 800);
    const ready = stateT > overT + 0.5;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.28, u * 0.4, '#9ff7ec', 800);
    const bw = u * 4.4, bh = u * 0.6;
    roundRect(c, -bw / 2, ph * 0.34, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Other ways to play' : 'Arrows  other ways to play', 0, ph * 0.34 + bh / 2, u * 0.3, 'rgba(255,240,220,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.34 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (wins > 0) Kit.record('checkersplus', wins);
  // Testing hook (harmless in the app).
  window.__checkers = { get board() { return board; }, get state() { return state; }, get side() { return side; }, moves, get cursor() { return cursor; } };
})();
