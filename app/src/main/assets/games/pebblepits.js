// Pebble Pits: the old count-and-capture game on a wooden board (Kalah rules). Each side has 6 pits with 4
// pebbles and a big store on its right. Pick one of your pits: its pebbles hop one by one into the next pits
// going round (skipping the other store). Last pebble in your store = another turn; last pebble in an empty pit
// of yours captures the pebbles opposite. When one side runs out, the other side banks the rest. Most pebbles wins.
// 2 players: person vs person or vs the TV. Remote: Left/Right choose a pit, OK sows. Touch/mouse: tap a pit. M mutes.
'use strict';

(() => {
  const { ease, shade, rgba, roundRect, clamp, lerp } = Kit;
  const ID = 'pebblepits';
  const AUTO = /auto/i.test(location.hash);
  const FAST = AUTO ? 8 : 1;
  const SEATS = [
    { name: 'Amber', color: '#ffae3b' },
    { name: 'Jade', color: '#2fd39a' },
  ];
  const SKILLS = [
    { id: 'beginner', name: 'Beginner', tip: 'A relaxed TV  ·  a star marks pits that give an extra turn' },
    { id: 'normal', name: 'Normal', tip: 'The TV grabs extra turns and captures' },
    { id: 'hard', name: 'Hard', tip: 'The TV looks several moves ahead' },
  ];
  const PEBBLE_COLORS = ['#ff5d73', '#4da3ff', '#ffd23f', '#3ddc97', '#b388ff', '#ff9f43', '#5ce1e6', '#f78fb3'];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const STORE = [6, 13];

  // ---------- Setup and records ----------
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, SKILLS.length - 1);
  const saved = Kit.store.get(ID + '.setup', null) || {};
  const seatTv = [false, true];
  if (Array.isArray(saved.tv)) for (let i = 0; i < 2; i++) seatTv[i] = !!saved.tv[i];
  let wins = Kit.store.get(ID + '.wins', 0) | 0;

  // ---------- State ----------
  let state = 'menu', stateT = 0, clock = 0, menuRow = 2, seatFocus = 0, overBtn = 0, overT = 0;
  let players = [], turn = 0, pits = [], pebbles = [], col = [0, 0], tasks = [], busy = false;
  let think = 0, tvTarget = -1, banner = null, winnerIx = -1, tie = false, newWin = false, lastPit = -1;
  let hidden = false;
  const human = (i) => players[i] && !players[i].tv;
  const humans = () => players.filter((p) => !p.tv).length;
  const pitOf = (p, c) => (p === 0 ? c : 12 - c);
  const ownPit = (p, i) => (p === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);

  // ---------- Rules ----------
  function sow(a, pit, p) {
    const b = a.slice();
    let n = b[pit], i = pit;
    b[pit] = 0;
    const skip = STORE[1 - p], path = [];
    while (n > 0) { i = (i + 1) % 14; if (i === skip) continue; b[i]++; n--; path.push(i); }
    const store = STORE[p];
    const extra = i === store;
    let cap = null;
    if (!extra && ownPit(p, i) && b[i] === 1 && b[12 - i] > 0) {
      cap = { pit: i, opp: 12 - i, n: b[12 - i] + 1 };
      b[store] += b[12 - i] + 1; b[i] = 0; b[12 - i] = 0;
    }
    let s0 = 0, s1 = 0;
    for (let k = 0; k < 6; k++) { s0 += b[k]; s1 += b[7 + k]; }
    const end = s0 === 0 || s1 === 0;
    if (end) { b[6] += s0; b[13] += s1; for (let k = 0; k < 6; k++) { b[k] = 0; b[7 + k] = 0; } }
    return { b, path, last: i, extra: extra && !end, cap, end };
  }
  const movesOf = (a, p) => [0, 1, 2, 3, 4, 5].map((c) => pitOf(p, c)).filter((i) => a[i] > 0);

  // ---------- The TV ----------
  function evaluate(a, me) {
    let side = 0;
    for (let k = 0; k < 6; k++) side += me === 0 ? a[k] - a[7 + k] : a[7 + k] - a[k];
    return (a[STORE[me]] - a[STORE[1 - me]]) + side * 0.15;
  }
  function search(a, p, me, depth, alpha, beta) {
    const moves = movesOf(a, p);
    if (!depth || !moves.length) return evaluate(a, me);
    const max = p === me;
    let v = max ? -1e9 : 1e9;
    for (const m of moves) {
      const r = sow(a, m, p);
      const s = r.end ? (r.b[STORE[me]] - r.b[STORE[1 - me]]) * 100 : search(r.b, r.extra ? p : 1 - p, me, depth - 1, alpha, beta);
      if (max) { v = Math.max(v, s); alpha = Math.max(alpha, v); } else { v = Math.min(v, s); beta = Math.min(beta, v); }
      if (alpha >= beta) break;
    }
    return v;
  }
  function tvPick(p) {
    const moves = movesOf(pits, p);
    if (!moves.length) return -1;
    if (skill === 0) return moves[Math.floor(Math.random() * moves.length)];
    let best = [], bv = -1e9;
    for (const m of moves) {
      let v;
      if (skill === 1) {
        const r = sow(pits, m, p);
        v = r.b[STORE[p]] - pits[STORE[p]] + (r.extra ? 3 : 0) + (r.cap ? r.cap.n : 0) + Math.random() * 0.8;
      } else {
        const r = sow(pits, m, p);
        v = r.end ? (r.b[STORE[p]] - r.b[STORE[1 - p]]) * 100 : search(r.b, r.extra ? p : 1 - p, p, 6, -1e9, 1e9);
        v += Math.random() * 0.01;
      }
      if (v > bv) { bv = v; best = [m]; } else if (v === bv) best.push(m);
    }
    return best[0];
  }

  // ---------- Pebbles on the board (positions in board units: 8 wide, 2 tall) ----------
  function pitXY(i) {
    if (i === 6) return { x: 7.5, y: 1 };
    if (i === 13) return { x: 0.5, y: 1 };
    if (i < 6) return { x: 1.5 + i, y: 1.5 };
    return { x: 6.5 - (i - 7), y: 0.5 };
  }
  function slotXY(pit, k, pb) {
    const c = pitXY(pit);
    if (pit === 6 || pit === 13) {
      const layer = Math.floor(k / 33), kk = k % 33;
      const cc = kk % 3, row = Math.floor(kk / 3);
      return { x: c.x + (cc - 1) * 0.15 + pb.jx * 0.5 + (row % 2 ? 0.07 : 0) - layer * 0.04, y: 1.64 - row * 0.12 + pb.jy * 0.5 - layer * 0.05 };
    }
    const layer = Math.floor(k / 14), kk = k % 14;
    const a = kk * 2.39996 + layer * 1.1, r = kk ? Math.min(0.27, 0.075 * Math.sqrt(kk) + 0.03) : 0;
    return { x: c.x + Math.cos(a) * r + pb.jx, y: c.y + Math.sin(a) * r + pb.jy - layer * 0.05 };
  }
  const settled = (pb) => !pb.mv;
  function countIn(i) { let n = 0; for (const pb of pebbles) if (pb.pit === i && settled(pb)) n++; return n; }
  function nextSlot(i) { let n = 0; for (const pb of pebbles) if (pb.pit === i) n++; return n; }
  function hop(pb, to, delay, dur, onLand) {
    const from = pebPos(pb);
    pb.slot = nextSlot(to);
    pb.pit = to;
    const tgt = slotXY(to, pb.slot, pb);
    pb.mv = { fx: from.x, fy: from.y, tx: tgt.x, ty: tgt.y, t0: clock + delay, dur, onLand, h: 0.45 + Math.random() * 0.15 };
  }
  function pebPos(pb) {
    if (!pb.mv) return { x: pb.x, y: pb.y, lift: 0 };
    const k = clamp((clock - pb.mv.t0) / pb.mv.dur, 0, 1), e = ease.inOut(k);
    return { x: lerp(pb.mv.fx, pb.mv.tx, e), y: lerp(pb.mv.fy, pb.mv.ty, e), lift: Math.sin(k * Math.PI) * pb.mv.h };
  }
  function stepPebbles() {
    for (const pb of pebbles) {
      if (!pb.mv || clock < pb.mv.t0 + pb.mv.dur) continue;
      const m = pb.mv; pb.mv = null; pb.x = m.tx; pb.y = m.ty;
      if (m.onLand) m.onLand(pb);
    }
  }

  // ---------- Flow ----------
  function after(t, fn) { tasks.push({ t: clock + t / FAST, fn }); }
  function startGame() {
    if (AUTO) { seatTv[0] = true; seatTv[1] = true; } else Kit.store.set(ID + '.setup', { tv: seatTv.slice() });
    Kit.store.set(ID + '.skill', skill);
    players = SEATS.map((s, i) => ({ ...s, tv: seatTv[i], bump: 0 }));
    pits = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
    pebbles = [];
    let n = 0;
    for (let i = 0; i < 14; i++) for (let k = 0; k < pits[i]; k++) {
      const pb = { pit: i, slot: k, color: PEBBLE_COLORS[(n++ * 5 + i) % PEBBLE_COLORS.length], jx: (Math.random() - 0.5) * 0.05, jy: (Math.random() - 0.5) * 0.05, mv: null };
      const p = slotXY(i, k, pb); pb.x = p.x; pb.y = p.y;
      pebbles.push(pb);
    }
    tasks = []; busy = false; winnerIx = -1; banner = null; lastPit = -1; col = [2, 2];
    state = 'play'; stateT = 0;
    layout(Kit.W, Kit.H);
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.12, at: 0.08 });
    beginTurn(0, false);
  }
  function toMenu() { state = 'menu'; stateT = 0; menuRow = 2; banner = null; tasks = []; }

  function beginTurn(i, again) {
    turn = i; tvTarget = -1; busy = false;
    think = (skill === 2 ? 0.6 : 0.75) * (0.8 + Math.random() * 0.5);
    if (!again) {
      banner = { t: 0, text: players[i].tv ? `${players[i].name} (TV) plays` : (humans() === 1 ? 'Your turn!' : `${players[i].name}'s turn`), color: players[i].color };
      Kit.tone(NOTES[2], { type: 'triangle', dur: 0.12, vol: 0.12 });
      Kit.tone(NOTES[4], { type: 'sine', dur: 0.14, vol: 0.08, at: 0.07 });
    }
    players[i].bump = 1;
    // Keep the cursor on a pit that can be played.
    if (!pits[pitOf(i, col[i])]) {
      const ok = [0, 1, 2, 3, 4, 5].filter((c) => pits[pitOf(i, c)] > 0);
      if (ok.length) col[i] = ok.reduce((b, c) => (Math.abs(c - col[i]) < Math.abs(b - col[i]) ? c : b), ok[0]);
    }
  }
  const bannerOn = () => banner && banner.t < 1.0 / FAST;

  function choose(pit) {
    if (state !== 'play' || busy || !ownPit(turn, pit) || !pits[pit]) { Kit.sfx.nope(); return; }
    const p = turn, r = sow(pits, pit, p);
    busy = true; lastPit = pit;
    const src = pebbles.filter((pb) => pb.pit === pit && !pb.mv).sort((a, b) => b.slot - a.slot);
    const HOP = 0.3 / FAST, GAP = 0.2 / FAST;
    Kit.sfx.pick();
    r.path.forEach((to, n) => {
      const pb = src[n]; if (!pb) return;
      hop(pb, to, n * GAP, HOP, () => {
        const q = toPx(pitXY(to).x, pitXY(to).y);
        Kit.tone(NOTES[Math.min(9, n % 10)] * (to === STORE[p] ? 1.5 : 1), { type: 'triangle', dur: 0.08, vol: 0.13 });
        Kit.noise({ dur: 0.03, vol: 0.07, freq: 2600 + n * 80, q: 2 });
        Kit.burst(q.x, q.y, 'rgba(255,235,200,0.9)', 3, 0.25);
      });
    });
    const sowEnd = (r.path.length - 1) * GAP + HOP + 0.12 / FAST;
    let t = sowEnd * FAST;
    after(t, () => {
      const q = toPx(pitXY(r.last).x, pitXY(r.last).y);
      if (r.extra) {
        Kit.float('Extra turn!', q.x, q.y - L.cell * 0.6, { color: '#ffe36b', size: L.cell * 0.28 });
        Kit.sfx.chime();
        Kit.burst(q.x, q.y, players[p].color, 16, 0.7);
      }
      if (r.cap) {
        const caught = pebbles.filter((pb) => (pb.pit === r.cap.pit || pb.pit === r.cap.opp) && !pb.mv);
        caught.forEach((pb, n) => hop(pb, STORE[p], n * 0.05 / FAST, 0.45 / FAST, null));
        Kit.float(`Capture! +${r.cap.n}`, q.x, q.y - L.cell * 0.6, { color: players[p].color, size: L.cell * 0.3 });
        Kit.tone(220, { type: 'square', dur: 0.12, vol: 0.1, slide: 2.2 });
        Kit.tone(880, { type: 'triangle', dur: 0.2, vol: 0.14, at: 0.1, slide: 0.6 });
        Kit.shake(6, 0.25);
        Kit.burst(q.x, q.y, players[p].color, 20, 0.9);
      }
    });
    if (r.cap) t += 0.75;
    if (r.end) {
      after(t + 0.1, () => {
        // The side that still has pebbles banks them.
        const rest = pebbles.filter((pb) => pb.pit !== 6 && pb.pit !== 13 && !pb.mv);
        rest.forEach((pb, n) => hop(pb, pb.pit < 6 ? 6 : 13, n * 0.06 / FAST, 0.5 / FAST, null));
        if (rest.length) Kit.float('Last pebbles go to the store', Kit.W / 2, L.oy + L.cell, { color: '#ffffff', size: L.cell * 0.22, life: 1.4 });
      });
      t += 1.4;
      after(t, () => { pits = r.b; endGame(); });
      return;
    }
    after(t + 0.15, () => {
      pits = r.b;
      if (r.extra) beginTurn(p, true); else beginTurn(1 - p, false);
    });
  }

  function endGame() {
    const a = pits[6], b = pits[13];
    tie = a === b; winnerIx = a >= b ? 0 : 1;
    state = 'over'; overT = 0; overBtn = 0; newWin = false; banner = null; busy = false;
    if (!tie && !players[winnerIx].tv) {
      wins++; newWin = true;
      Kit.store.set(ID + '.wins', wins); Kit.record(ID, wins);
      Kit.confetti(160); Kit.sfx.win();
    } else if (!tie && humans()) Kit.sfx.over();
    else Kit.sfx.chime();
  }

  // ---------- Keys and taps ----------
  const menuRows = () => ['seats', 'skill', 'play'];
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
    } else if (k === 'ok') startGame();
  }
  function overKey(k) {
    if (overT < 1.2) return;
    if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { overBtn = 1 - overBtn; Kit.sfx.move(); }
    else if (k === 'ok') { if (overBtn === 0) startGame(); else { Kit.sfx.move(); toMenu(); } }
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { menuKey(k); return; }
    if (state === 'over') { overKey(k); return; }
    if (!human(turn) || busy || (bannerOn() && banner.t < 0.4 / FAST)) return;
    if (k === 'left' || k === 'right') {
      const d = k === 'left' ? -1 : 1;
      const n = clamp(col[turn] + d, 0, 5);
      if (n === col[turn]) { Kit.tone(200, { type: 'sine', dur: 0.05, vol: 0.06 }); return; }
      col[turn] = n; Kit.sfx.move();
    } else if (k === 'ok') choose(pitOf(turn, col[turn]));
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
        else startGame();
        return;
      }
      if (state === 'over') {
        if (overT < 1.2) return;
        if (inside(e, L.btnMenu)) { Kit.sfx.move(); toMenu(); } else if (inside(e, L.btnAgain)) startGame();
        return;
      }
      if (!human(turn) || busy) return;
      for (let c = 0; c < 6; c++) {
        const i = pitOf(turn, c), q = pitXY(i), p = toPx(q.x, q.y);
        if (Math.hypot(e.x - p.x, e.y - p.y) < L.cell * 0.45) { col[turn] = c; choose(i); return; }
      }
    },
  });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // ---------- Update ----------
  function update(dt) {
    if (hidden) return;
    clock += dt; stateT += dt;
    players.forEach((p) => { p.bump = Math.max(0, p.bump - dt * 2.2); });
    stepPebbles();
    for (let i = 0; i < tasks.length; i++) {
      if (clock >= tasks[i].t) { const f = tasks.splice(i, 1)[0].fn; i--; f(); }
    }
    if (state === 'menu') { if (AUTO && stateT > 0.5) startGame(); return; }
    if (state === 'over') {
      overT += dt;
      if (overT > 1 && Math.random() < dt * 0.5 && !tie && !players[winnerIx].tv) Kit.confetti(30);
      if (AUTO && overT > 2.5) startGame();
      return;
    }
    if (banner) banner.t += dt;
    if (!human(turn) && !busy && !(banner && banner.t < 0.6 / FAST)) {
      think -= dt * FAST;
      if (think <= 0) {
        if (tvTarget < 0) {
          tvTarget = tvPick(turn);
          if (tvTarget < 0) return;
          col[turn] = turn === 0 ? tvTarget : 12 - tvTarget;
          think = 0.45;
        } else { const k = tvTarget; tvTarget = -1; choose(k); }
      }
    }
  }

  // ---------- Layout ----------
  let L = { u: 1, cell: 180, ox: 0, oy: 0, hits: [] };
  const toPx = (x, y) => ({ x: L.ox + x * L.cell, y: L.oy + y * L.cell });
  const boardPic = document.createElement('canvas');
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 1920, H / 1080);
    const wide = W / H > 1.2;
    const cell = Math.floor(Math.min((W * 0.94) / 8.7, (wide ? H * 0.56 : H * 0.42) / 2.7));
    const S = cell * 8;
    const ox = Math.round((W - S) / 2), oy = Math.round(H * 0.5 - cell + (wide ? 25 * u : 0));
    const ch = Math.max(56, 104 * u), cw = Math.min(W * 0.9, 640 * u + 120);
    const cards = [
      { x: (W - cw) / 2, y: oy + 2 * cell + cell * 0.48, w: cw, h: ch },
      { x: (W - cw) / 2, y: oy - cell * 0.48 - ch, w: cw, h: ch },
    ];
    L = { u, wide, cell, ox, oy, cards, hits: [], S };
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

  // The board: a long walnut board with carved pits, drawn once per size.
  function bakeBoard() {
    const { cell } = L, pad = cell * 0.36, dpr = DPR();
    const w = cell * 8 + pad * 2, h = cell * 2 + pad * 2, depth = cell * 0.12;
    boardPic.width = Math.ceil(w * dpr); boardPic.height = Math.ceil((h + depth) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const R = cell * 0.6;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = cell * 0.35; c.shadowOffsetY = cell * 0.12;
    roundRect(c, 0, depth, w, h, R); c.fillStyle = '#2a1407'; c.fill();
    c.restore();
    roundRect(c, 0, 0, w, h, R);
    let g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b97a45'); g.addColorStop(0.5, '#93582c'); g.addColorStop(1, '#6e3d1a');
    c.fillStyle = g; c.fill();
    // grain
    c.save(); roundRect(c, 0, 0, w, h, R); c.clip();
    for (let i = 0; i < 36; i++) {
      const y = (i / 36) * h + Math.random() * 6;
      c.strokeStyle = i % 3 ? 'rgba(60,25,5,0.16)' : 'rgba(255,220,170,0.08)'; c.lineWidth = 1 + Math.random() * 2;
      c.beginPath(); c.moveTo(0, y);
      for (let x = 0; x <= w; x += w / 30) c.lineTo(x, y + Math.sin(x * 0.01 + i * 0.7) * cell * 0.05 + Math.sin(x * 0.037 + i) * cell * 0.02);
      c.stroke();
    }
    // a couple of knots
    for (const [kx, ky] of [[w * 0.27, h * 0.48], [w * 0.71, h * 0.52]]) {
      for (let r = 4; r > 0; r--) {
        c.strokeStyle = 'rgba(60,25,5,0.18)'; c.lineWidth = 1.5;
        c.beginPath(); c.ellipse(kx, ky, cell * 0.05 * r, cell * 0.022 * r, 0, 0, Math.PI * 2); c.stroke();
      }
    }
    const sheen = c.createLinearGradient(0, 0, 0, h * 0.5);
    sheen.addColorStop(0, 'rgba(255,240,210,0.22)'); sheen.addColorStop(1, 'rgba(255,240,210,0)');
    c.fillStyle = sheen; c.fillRect(0, 0, w, h * 0.5);
    c.restore();
    c.lineWidth = cell * 0.03; c.strokeStyle = 'rgba(255,225,180,0.4)';
    roundRect(c, cell * 0.05, cell * 0.05, w - cell * 0.1, h - cell * 0.1, R * 0.9); c.stroke();
    // each side's colour strip
    c.translate(pad, pad);
    for (const [p, y] of [[0, 2 * cell + pad * 0.55], [1, -pad * 0.55]]) {
      c.strokeStyle = rgba(SEATS[p].color, 0.75); c.lineWidth = cell * 0.035; c.lineCap = 'round';
      c.beginPath(); c.moveTo(cell * 1.15, y); c.lineTo(cell * 6.85, y); c.stroke();
    }
    // carved holes
    const hole = (x, y, rx, ry) => {
      c.save();
      c.beginPath(); c.ellipse(x, y + cell * 0.02, rx * 1.04, ry * 1.04, 0, 0, Math.PI * 2);
      c.fillStyle = 'rgba(255,225,180,0.35)'; c.fill();
      c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      const hg = c.createRadialGradient(x, y - ry * 0.35, Math.min(rx, ry) * 0.1, x, y, Math.max(rx, ry));
      hg.addColorStop(0, '#5a2e12'); hg.addColorStop(0.7, '#3c1c08'); hg.addColorStop(1, '#2a1203');
      c.fillStyle = hg; c.fill();
      c.clip();
      c.fillStyle = 'rgba(0,0,0,0.35)';
      c.beginPath(); c.ellipse(x, y - ry * 0.25, rx * 1.05, ry * 0.9, 0, 0, Math.PI * 2);
      c.ellipse(x, y + ry * 0.2, rx * 1.2, ry * 1.2, 0, 0, Math.PI * 2, true); c.fill('evenodd');
      c.restore();
    };
    for (let i = 0; i < 14; i++) {
      const q = pitXY(i);
      if (i === 6 || i === 13) hole(q.x * cell, q.y * cell, cell * 0.38, cell * 0.86);
      else hole(q.x * cell, q.y * cell, cell * 0.4, cell * 0.4);
    }
    L.pad = pad;
  }

  const pebbleSprite = (color, s) => sprite('peb' + color, s, s, (c, s) => {
    const r = s / 2;
    const g = c.createRadialGradient(r * 0.7, r * 0.6, r * 0.08, r, r, r);
    g.addColorStop(0, shade(color, 0.7)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.5));
    c.fillStyle = g;
    c.beginPath(); c.ellipse(r, r, r * 0.95, r * 0.86, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.8)';
    c.beginPath(); c.ellipse(r * 0.68, r * 0.55, r * 0.26, r * 0.14, -0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    c.beginPath(); c.ellipse(r * 1.25, r * 1.35, r * 0.18, r * 0.08, -0.6, 0, Math.PI * 2); c.fill();
  });

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
  function badge(c, x, y, r, str, color, strong) {
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
    const g = c.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, shade(color, strong ? 0.3 : 0.1)); g.addColorStop(1, shade(color, strong ? -0.25 : -0.45));
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(2, r * 0.12); c.strokeStyle = strong ? '#ffffff' : 'rgba(255,255,255,0.6)'; c.stroke();
    text(c, str, x, y + r * 0.06, r * 1.1, '#ffffff', 700, 'center', Kit.FONT);
  }

  // ---------- Drawing the game ----------
  function drawPebbles(c) {
    const cell = L.cell, s = Math.round(cell * 0.23);
    const moving = [];
    for (const pb of pebbles) {
      if (pb.mv && clock >= pb.mv.t0) { moving.push(pb); continue; }
      const p = toPx(pb.x, pb.y);
      c.drawImage(pebbleSprite(pb.color, s), p.x - s / 2, p.y - s / 2, s, s);
    }
    for (const pb of moving) {
      const q = pebPos(pb), p = toPx(q.x, q.y), lift = q.lift * cell;
      c.fillStyle = 'rgba(30,10,0,0.3)';
      c.beginPath(); c.ellipse(p.x, p.y + s * 0.25, s * 0.45, s * 0.2, 0, 0, Math.PI * 2); c.fill();
      const k = 1 + q.lift * 0.5;
      c.drawImage(pebbleSprite(pb.color, s), p.x - s * k / 2, p.y - lift - s * k / 2, s * k, s * k);
    }
  }
  // Where would the last pebble from pit i land? (for the Beginner hint)
  function landsIn(i, p) {
    let n = pits[i], k = i;
    while (n > 0) { k = (k + 1) % 14; if (k === STORE[1 - p]) continue; n--; }
    return k;
  }
  function drawCounts(c, t) {
    const cell = L.cell;
    for (let i = 0; i < 14; i++) {
      const q = pitXY(i), n = countIn(i);
      if (i === 6 || i === 13) {
        const owner = i === 6 ? 0 : 1, p = toPx(q.x, i === 6 ? 2.12 : -0.12);
        badge(c, p.x, p.y, cell * 0.2, String(n), SEATS[owner].color, true);
      } else {
        const top = i > 6, p = toPx(q.x, top ? -0.12 : 2.12);
        badge(c, p.x, p.y, cell * 0.15, String(n), SEATS[top ? 1 : 0].color, false);
      }
    }
  }
  function drawCursor(c, t) {
    if (state !== 'play' || !players.length) return;
    const pl = players[turn], cell = L.cell;
    const showCur = human(turn) ? !busy : tvTarget >= 0;
    // Beginner hints: a star on pits that end in your store.
    if (skill === 0 && human(turn) && !busy) {
      for (let cc = 0; cc < 6; cc++) {
        const i = pitOf(turn, cc);
        if (!pits[i] || landsIn(i, turn) !== STORE[turn]) continue;
        const q = pitXY(i), p = toPx(q.x, q.y);
        const a = 0.5 + 0.3 * Math.sin(t * 4);
        c.strokeStyle = `rgba(255,220,90,${a})`; c.lineWidth = cell * 0.05;
        c.setLineDash([cell * 0.06, cell * 0.05]); c.lineDashOffset = -t * 20;
        c.beginPath(); c.arc(p.x, p.y, cell * 0.47, 0, Math.PI * 2); c.stroke();
        c.setLineDash([]);
        star(c, p.x + cell * 0.33, p.y + (turn === 0 ? -1 : 1) * cell * 0.33, cell * 0.12, t);
      }
    }
    if (!showCur) return;
    const i = pitOf(turn, col[turn]), q = pitXY(i), p = toPx(q.x, q.y);
    const pulse = 0.5 + 0.5 * Math.sin(t * 6), ok = pits[i] > 0;
    c.save();
    c.shadowColor = ok ? pl.color : '#ffffff'; c.shadowBlur = 16 + pulse * 16;
    c.lineWidth = cell * 0.06; c.strokeStyle = ok ? pl.color : 'rgba(255,255,255,0.5)';
    c.beginPath(); c.arc(p.x, p.y, cell * 0.46, 0, Math.PI * 2); c.stroke();
    c.shadowBlur = 0;
    c.lineWidth = cell * 0.015; c.strokeStyle = 'rgba(255,255,255,0.9)';
    c.beginPath(); c.arc(p.x, p.y, cell * 0.42, 0, Math.PI * 2); c.stroke();
    // a little pointer from the player's side
    const dir = turn === 0 ? 1 : -1, ay = p.y + dir * (cell * 0.62 + pulse * cell * 0.05);
    c.fillStyle = pl.color;
    c.beginPath(); c.moveTo(p.x, ay - dir * cell * 0.1); c.lineTo(p.x - cell * 0.1, ay + dir * cell * 0.06); c.lineTo(p.x + cell * 0.1, ay + dir * cell * 0.06); c.closePath(); c.fill();
    c.restore();
    // Beginner: show where the last pebble would land.
    if (skill === 0 && human(turn) && ok) {
      const li = landsIn(i, turn), lq = pitXY(li), lp = toPx(lq.x, lq.y);
      c.fillStyle = rgba(pl.color, 0.3 + pulse * 0.3);
      c.beginPath(); c.arc(lp.x, lp.y, cell * 0.09, 0, Math.PI * 2); c.fill();
      c.lineWidth = 3; c.strokeStyle = '#ffffff'; c.stroke();
    }
  }
  function star(c, x, y, r, t) {
    c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2) * 0.2);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath();
    c.fillStyle = '#ffd23f'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#8a5a00'; c.stroke();
    c.restore();
  }

  function drawCard(c, i, t) {
    const r = L.cards[i], p = players[i]; if (!r || !p) return;
    const on = state === 'play' && i === turn;
    const k = 1 + p.bump * 0.04;
    c.save();
    c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
    Kit.glass(c, -r.w / 2, -r.h / 2, r.w, r.h, r.h * 0.4, { tint: on ? rgba(p.color, 0.35) : 'rgba(255,255,255,0.06)', glow: on ? p.color : null, t });
    const cs = r.h * 0.6;
    c.drawImage(pebbleSprite(p.color, Math.round(cs)), -r.w / 2 + r.h * 0.25, -cs / 2, cs, cs);
    const tx = -r.w / 2 + r.h * 0.4 + cs;
    fitText(c, `${p.name}  ·  ${p.tv ? '📺 TV' : humans() === 1 ? '🙂 You' : '🙂 Person'}`, tx, 0, r.h * 0.34, r.w * 0.5, '#ffffff', 700, 'left', Kit.FONT);
    const store = state === 'menu' ? 0 : countIn(STORE[i]);
    text(c, `${store} in store`, r.w / 2 - r.h * 0.35, 0, r.h * 0.3, on ? '#ffffff' : 'rgba(255,255,255,0.85)', 700, 'right');
    c.restore();
  }
  function drawHud(c, t) {
    const u = L.u, W = Kit.W, H = Kit.H;
    players.forEach((p, i) => drawCard(c, i, t));
    let msg;
    if (state === 'over') msg = 'Game over';
    else if (busy) msg = 'Sowing…';
    else if (human(turn)) msg = (Kit.touchFirst() ? 'Tap one of your pits' : '◀ ▶ choose a pit  ·  OK sows') + (skill === 0 ? '   ★ = extra turn' : '');
    else msg = `${players[turn].name} (TV) is thinking…`;
    const c1 = L.cards[0];
    const y = Math.min(H - 30 * u - 14, c1.y + c1.h + 52 * u);
    c.globalAlpha = human(turn) && !busy && state === 'play' ? 0.85 + Math.sin(t * 5) * 0.15 : 1;
    fitText(c, msg, W / 2, y, Math.max(18, 34 * u), W * 0.9, human(turn) && !busy ? '#ffe36b' : '#ffffff', 700);
    c.globalAlpha = 1;
    if (L.wide) {
      Kit.title(c, 'Pebble Pits', 70 * u, 60 * u, 60 * u, { color: '#ffcf8a', glow: 'rgba(255,170,90,0.45)', align: 'left' });
      text(c, `${SKILLS[skill].name}  ·  👑 Wins: ${wins}`, 74 * u, 120 * u, 30 * u, 'rgba(255,235,210,0.8)', 600, 'left');
    }
  }

  function drawBanner(c) {
    if (!banner || state !== 'play') return;
    const T = 1.0 / FAST, k = banner.t;
    if (k > T) return;
    const W = Kit.W, H = Kit.H, u = L.u;
    const inK = ease.back(clamp(k / (0.28 / FAST), 0, 1)), outK = clamp((k - T * 0.72) / (T * 0.28), 0, 1);
    const w = Math.min(W * 0.9, 980 * u), h = 150 * u;
    c.save();
    c.globalAlpha = 1 - outK;
    c.translate(W / 2 + (1 - inK) * -W * 0.6 + outK * W * 0.4, L.oy + L.cell);
    c.rotate(-0.03);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.3);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(banner.color, 0.2)); g.addColorStop(1, shade(banner.color, -0.4));
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.lineWidth = 6 * u; c.strokeStyle = '#ffffff'; c.stroke();
    Kit.title(c, banner.text, 0, 4 * u, 84 * u, { color: '#ffffff' });
    c.restore();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(20,8,2,0.55)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.94, 1240 * u), ph = Math.min(H * 0.94, 860 * u);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(clamp(stateT / 0.45, 0, 1));
    c.save();
    c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    roundRect(c, px, py, pw, ph, 40 * u); c.fillStyle = 'rgba(40,20,8,0.72)'; c.fill();
    Kit.glass(c, px, py, pw, ph, 40 * u, { tint: 'rgba(110,60,25,0.6)', edge: 'rgba(255,220,180,0.45)' });
    const cx = W / 2;
    Kit.title(c, 'Pebble Pits', cx, py + 85 * u, 110 * u, { color: '#ffcf8a', glow: 'rgba(255,170,90,0.6)' });
    // pebbles bouncing beside the title
    c.font = `700 ${Math.round(110 * u)}px ${Kit.FONT}`;
    const tw = c.measureText('Pebble Pits').width;
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const ps = 40 * u, bx = cx + s * (tw / 2 + 50 * u + i * 44 * u), by = py + 95 * u - Math.abs(Math.sin(t * 3 + i * 0.8 + (s > 0 ? 1 : 0))) * 36 * u;
      c.drawImage(pebbleSprite(PEBBLE_COLORS[(i * 3 + (s > 0 ? 1 : 0)) % 8], Math.round(ps)), bx - ps / 2, by - ps / 2, ps, ps);
    }
    text(c, 'Sow pebbles round the board. End in your store to go again. Most pebbles wins!', cx, py + 165 * u, 31 * u, 'rgba(255,240,225,0.9)', 600);
    L.hits = [];
    const rows = menuRows();
    const rowY = { seats: py + 310 * u, skill: py + 500 * u, play: py + 690 * u };
    const lab = (s, y, on) => text(c, s, cx, y, 32 * u, on ? '#ffe36b' : 'rgba(255,230,205,0.85)', 700);
    {
      const on = rows[menuRow] === 'seats', y = rowY.seats;
      lab(Kit.touchFirst() ? 'Tap a side to switch Person / TV' : 'Who plays?  ◀ ▶ pick  ·  OK switches Person / TV', y - 82 * u, on);
      const w = 340 * u, h = 116 * u, gap = 30 * u, x0 = cx - (w * 2 + gap) / 2;
      for (let i = 0; i < 2; i++) {
        const x = x0 + i * (w + gap), f = on && i === seatFocus;
        const kk = f ? 1.06 + Math.sin(t * 6) * 0.015 : 1;
        c.save(); c.translate(x + w / 2, y); c.scale(kk, kk);
        Kit.glass(c, -w / 2, -h / 2, w, h, 26 * u, { tint: rgba(SEATS[i].color, f ? 0.42 : 0.2), glow: f ? '#ffffff' : null, t });
        const cs = 70 * u;
        c.drawImage(pebbleSprite(SEATS[i].color, Math.round(cs)), -w / 2 + 18 * u, -cs / 2, cs, cs);
        fitText(c, `${SEATS[i].name} · ${i === 0 ? 'near side' : 'far side'}`, -w / 2 + 104 * u, -20 * u, 32 * u, w - 120 * u, '#ffffff', 700, 'left', Kit.FONT);
        text(c, seatTv[i] ? '📺 TV' : '🙂 Person', -w / 2 + 104 * u, 22 * u, 28 * u, seatTv[i] ? '#aee3ff' : '#ffe9a8', 700, 'left');
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
      text(c, SKILLS[skill].tip, cx, y + 70 * u, 28 * u, 'rgba(255,240,225,0.82)', 600);
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
    text(c, Kit.touchFirst() ? 'Tap to choose  ·  tap Play' : '▲▼ choose a row  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - 48 * u, 27 * u, 'rgba(255,235,215,0.7)', 600);
    const bw = 260 * u, bh = 54 * u;
    roundRect(c, cx - bw / 2, py - bh / 2, bw, bh, bh / 2);
    c.fillStyle = '#4a2410'; c.fill(); c.lineWidth = 3 * u; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, `👑 Wins: ${wins}`, cx, py + 2 * u, 30 * u, '#ffd23f', 700, 'center', Kit.FONT);
    c.restore();
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((overT - 0.4) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(20,8,2,${0.55 * a})`; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.92, 900 * u), ph = Math.min(H * 0.9, 600 * u);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const wp = players[winnerIx];
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 40 * u); c.fillStyle = 'rgba(40,20,8,0.88)'; c.fill();
    Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 40 * u, { tint: tie ? 'rgba(100,70,40,0.7)' : rgba(wp.color, 0.38), edge: 'rgba(255,255,255,0.5)' });
    let y = -ph / 2 + 80 * u;
    const title = tie ? "It's a draw!" : wp.tv ? `${wp.name} (TV) wins` : (humans() === 1 ? 'You win!' : `${wp.name} wins!`);
    Kit.title(c, title, 0, y, 86 * u, { color: '#ffffff', glow: tie ? null : wp.color });
    y += 72 * u;
    text(c, newWin ? `🎉 New win!  👑 Wins: ${wins}` : `👑 Wins: ${wins}`, 0, y, 32 * u, '#ffd23f', 700);
    y += 100 * u;
    players.forEach((p, i) => {
      const x = (i ? 1 : -1) * 190 * u;
      const ps = 90 * u;
      c.drawImage(pebbleSprite(p.color, Math.round(ps)), x - ps / 2, y - ps / 2 - 10 * u, ps, ps);
      Kit.title(c, String(pits[STORE[i]]), x, y - 8 * u, 50 * u, { color: '#ffffff' });
      text(c, `${p.name}${p.tv ? ' (TV)' : ''}`, x, y + ps / 2 + 26 * u, 30 * u, '#ffffff', 700, 'center', Kit.FONT);
    });
    text(c, '–', 0, y - 8 * u, 60 * u, 'rgba(255,255,255,0.7)', 700, 'center', Kit.FONT);
    const ready = overT > 1.2;
    c.globalAlpha = ready ? 1 : 0.45;
    const bw = 280 * u, bh = 84 * u, by = ph / 2 - bh - 36 * u;
    pill(c, -bw - 20 * u, by, bw, bh, '↻  Play again', { on: true, focus: overBtn === 0, t, color: overBtn === 0 ? '#20c46a' : '#5a4030' });
    pill(c, 20 * u, by, bw, bh, '☰  Menu', { on: true, focus: overBtn === 1, t, color: overBtn === 1 ? '#3d8bff' : '#5a4030' });
    c.globalAlpha = 1;
    c.restore();
    L.btnAgain = { x: W / 2 + (-bw - 20 * u) * k, y: H / 2 + by * k, w: bw * k, h: bh * k };
    L.btnMenu = { x: W / 2 + 20 * u * k, y: H / 2 + by * k, w: bw * k, h: bh * k };
  }

  function draw(c, t) {
    Kit.background(c, t, '#3a2216', '#120804', 'rgba(255,190,120,0.10)');
    if (!pebbles.length) demoBoard();
    const pad = L.pad || 0;
    c.drawImage(boardPic, L.ox - pad, L.oy - pad, boardPic.width / DPR(), boardPic.height / DPR());
    if (state === 'play') drawCursor(c, t);
    drawPebbles(c);
    drawCounts(c, t);
    if (players.length && state !== 'menu') drawHud(c, t);
    drawBanner(c);
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c, t);
  }
  function demoBoard() {
    pits = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0];
    let n = 0;
    for (let i = 0; i < 14; i++) for (let k = 0; k < pits[i]; k++) {
      const pb = { pit: i, slot: k, color: PEBBLE_COLORS[(n++ * 5 + i) % PEBBLE_COLORS.length], jx: (Math.random() - 0.5) * 0.05, jy: (Math.random() - 0.5) * 0.05, mv: null };
      const p = slotXY(i, k, pb); pb.x = p.x; pb.y = p.y;
      pebbles.push(pb);
    }
  }

  window.__game = () => {
    const ok = players.length ? [0, 1, 2, 3, 4, 5].filter((c) => pits[pitOf(turn, c)] > 0) : [];
    return { state, turn, human: human(turn) && !busy, stores: [pits[6], pits[13]], cur: { x: col[turn] || 0, y: 0 }, goal: ok.length ? { x: ok[ok.length - 1], y: 0 } : null };
  };

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
