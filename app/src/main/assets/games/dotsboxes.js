// Dots & Boxes: take turns drawing a line between two neighbouring dots. Draw the fourth side of a box
// and it is yours (your initial goes in it) and you draw again. Most boxes when the grid is full wins.
// 2 to 4 players on one TV; any seat can be played by the TV. Skill sets the grid: Beginner 4×4, Normal 5×5, Hard 6×6.
// Remote: arrows move the glowing cursor from line to line, OK draws it. Touch/mouse: tap a line. M mutes.
'use strict';

(() => {
  const { ease, shade, rgba, roundRect, clamp, lerp } = Kit;
  const ID = 'dotsboxes';
  const AUTO = /auto/i.test(location.hash);
  const FAST = AUTO ? 12 : 1;
  const COLORS = ['#ff4d6d', '#3d9bff', '#2ed47a', '#ffa41c'];
  const NAMES = ['Red', 'Blue', 'Green', 'Orange'];
  const SKILLS = [
    { id: 'beginner', name: 'Beginner', size: 4, tip: '4 × 4 boxes  ·  a relaxed TV  ·  free boxes glow' },
    { id: 'normal', name: 'Normal', size: 5, tip: '5 × 5 boxes  ·  the TV grabs every free box' },
    { id: 'hard', name: 'Hard', size: 6, tip: '6 × 6 boxes  ·  a careful TV that hates giving boxes away' },
  ];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

  // ---------- Setup and records ----------
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, SKILLS.length - 1);
  const saved = Kit.store.get(ID + '.setup', null) || {};
  let count = clamp((saved.n | 0) || 2, 2, 4);
  const seatTv = [false, true, true, true];
  if (Array.isArray(saved.tv)) for (let i = 0; i < 4; i++) seatTv[i] = !!saved.tv[i];
  let wins = Kit.store.get(ID + '.wins', 0) | 0;

  // ---------- State ----------
  // state: 'menu', 'play', 'over'
  let state = 'menu', stateT = 0, clock = 0, menuRow = 3, seatFocus = 0, overBtn = 0, overT = 0;
  let players = [], turn = 0, B = 4, edges = [], boxes = [], filled = 0;
  let curX = 1, curY = 0, prefX = 1, prefDx = 1, view = null;
  let busy = 0, later = null, think = 0, tvTarget = -1, banner = null, winnerIx = -1, newWin = false, tie = false;
  let hidden = false;

  const human = (i) => players[i] && !players[i].tv;
  const humans = () => players.filter((p) => !p.tv).length;

  // ---------- The grid ----------
  // Edge ids: horizontals first ((B+1) rows × B), then verticals (B rows × (B+1)).
  function build(size) {
    B = size; edges = []; boxes = [];
    for (let r = 0; r <= B; r++) for (let c = 0; c < B; c++) edges.push({ h: true, r, c, owner: -1, t: 0, boxes: [] });
    for (let r = 0; r < B; r++) for (let c = 0; c <= B; c++) edges.push({ h: false, r, c, owner: -1, t: 0, boxes: [] });
    const H0 = (B + 1) * B;
    const hId = (r, c) => r * B + c, vId = (r, c) => H0 + r * (B + 1) + c;
    for (let r = 0; r < B; r++) for (let c = 0; c < B; c++) {
      const e = [hId(r, c), hId(r + 1, c), vId(r, c), vId(r, c + 1)];
      const i = boxes.length;
      boxes.push({ r, c, e, owner: -1, t: 0 });
      e.forEach((k) => edges[k].boxes.push(i));
    }
    filled = 0;
  }
  const edgeXY = (e) => (e.h ? { X: 2 * e.c + 1, Y: 2 * e.r } : { X: 2 * e.c, Y: 2 * e.r + 1 });
  function edgeAt(X, Y) {
    if (Y % 2 === 0) return (Y / 2) * B + (X - 1) / 2;
    return (B + 1) * B + ((Y - 1) / 2) * (B + 1) + X / 2;
  }
  const mid = (e) => (e.h ? { x: e.c + 0.5, y: e.r } : { x: e.c, y: e.r + 0.5 });

  // ---------- Plain-array helpers for the TV's thinking ----------
  function drawnArr() { return edges.map((e) => (e.owner >= 0 ? 1 : 0)); }
  function sides(d, b) { const e = boxes[b].e; return d[e[0]] + d[e[1]] + d[e[2]] + d[e[3]]; }
  function completes(d, k) { return edges[k].boxes.some((b) => sides(d, b) === 3); }
  function gives(d, k) { return edges[k].boxes.some((b) => sides(d, b) === 2); }
  // How many boxes the next player could grab in a row after the board d.
  function grabAll(d) {
    let n = 0, found = true;
    while (found) {
      found = false;
      for (let b = 0; b < boxes.length; b++) {
        if (sides(d, b) === 3) {
          const k = boxes[b].e.find((x) => !d[x]);
          d[k] = 1;
          edges[k].boxes.forEach((bb) => { if (sides(d, bb) === 4) n++; });
          found = true;
        }
      }
    }
    return n;
  }
  const pickOf = (a) => a[Math.floor(Math.random() * a.length)];
  function tvPick() {
    const d = drawnArr();
    const free = [], comp = [], safe = [];
    edges.forEach((e, k) => {
      if (d[k]) return;
      free.push(k);
      if (completes(d, k)) comp.push(k);
      else if (!gives(d, k)) safe.push(k);
    });
    if (!free.length) return -1;
    if (skill === 0) {
      if (comp.length && Math.random() < 0.4) return pickOf(comp);
      if (safe.length && Math.random() < 0.35) return pickOf(safe);
      return pickOf(free);
    }
    if (skill === 1) {
      if (comp.length && Math.random() < 0.93) return pickOf(comp);
      if (safe.length) return pickOf(safe);
      return pickOf(free);
    }
    if (comp.length) return pickOf(comp);
    if (safe.length) return pickOf(safe);
    // Forced to open something: give away as few boxes as possible.
    let best = [], bv = 1e9;
    for (const k of free) {
      const dd = d.slice(); dd[k] = 1;
      const v = grabAll(dd);
      if (v < bv) { bv = v; best = [k]; } else if (v === bv) best.push(k);
    }
    return pickOf(best);
  }

  // ---------- Flow ----------
  function wait(t, fn) { later = { t: t / FAST, fn }; }

  function startGame() {
    if (AUTO) for (let i = 0; i < 4; i++) seatTv[i] = true;
    else Kit.store.set(ID + '.setup', { n: count, tv: seatTv.slice() });
    Kit.store.set(ID + '.skill', skill);
    players = [];
    for (let i = 0; i < count; i++) players.push({ name: NAMES[i], init: NAMES[i][0], color: COLORS[i], tv: seatTv[i], score: 0, bump: 0 });
    build(SKILLS[skill].size);
    curY = B; curX = B; fixCursor();
    const m = mid(edges[edgeAt(curX, curY)]);
    view = { x: m.x, y: m.y, h: edges[edgeAt(curX, curY)].h };
    state = 'play'; stateT = 0; later = null; winnerIx = -1; banner = null;
    layout(Kit.W, Kit.H);
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    Kit.tone(990, { type: 'triangle', dur: 0.12, vol: 0.12, at: 0.08 });
    beginTurn(0, false);
  }
  function toMenu() { state = 'menu'; stateT = 0; menuRow = 3; banner = null; later = null; }

  function beginTurn(i, again) {
    turn = i; tvTarget = -1;
    think = (skill === 0 ? 0.75 : 0.6) * (0.8 + Math.random() * 0.5);
    if (!again) {
      banner = { t: 0, text: players[i].tv ? `${players[i].name} (TV) plays` : (humans() === 1 ? 'Your turn!' : `${players[i].name}'s turn`), color: players[i].color };
      Kit.tone(NOTES[2], { type: 'triangle', dur: 0.12, vol: 0.12 });
      Kit.tone(NOTES[4], { type: 'sine', dur: 0.14, vol: 0.08, at: 0.07 });
    }
    players[i].bump = 1;
  }
  const bannerOn = () => banner && banner.t < 1.05 / FAST;

  function drawEdge(k) {
    const e = edges[k];
    if (!e || e.owner >= 0 || state !== 'play') { Kit.sfx.nope(); return; }
    e.owner = turn; e.t = clock;
    const m = mid(e), p = toPx(m.x, m.y), pl = players[turn];
    Kit.tone(420 + Math.random() * 60, { type: 'triangle', dur: 0.09, vol: 0.18, slide: 1.6 });
    Kit.noise({ dur: 0.06, vol: 0.08, freq: 3000, q: 0.8 });
    Kit.burst(p.x, p.y, pl.color, 8, 0.45);
    let got = 0;
    e.boxes.forEach((b) => {
      const bx = boxes[b];
      if (bx.owner < 0 && bx.e.every((x) => edges[x].owner >= 0)) {
        bx.owner = turn; bx.t = clock; got++; filled++;
        const q = toPx(bx.c + 0.5, bx.r + 0.5);
        Kit.burst(q.x, q.y, pl.color, 22, 0.9);
        Kit.burst(q.x, q.y, '#ffffff', 8, 0.6);
      }
    });
    busy = 0.22;
    if (got) {
      pl.score += got; pl.bump = 1;
      Kit.float(got > 1 ? '+2!' : '+1', p.x, p.y - L.cell * 0.2, { color: pl.color, size: L.cell * 0.42 });
      [0, 1, 2].forEach((j) => Kit.tone(NOTES[Math.min(9, 3 + j + got)], { type: 'triangle', dur: 0.18, vol: 0.14, at: 0.05 + j * 0.06 }));
      if (got > 1) Kit.shake(5, 0.2);
      if (filled >= boxes.length) { wait(0.9, endGame); busy = 99; return; }
      wait(0.35, () => {
        const card = L.cards[turn];
        if (card) Kit.float('Again!', card.x + card.w / 2, card.y + card.h * 0.5, { color: '#ffe36b', size: L.u * 40 });
        beginTurn(turn, true);
      });
      busy = 99;
    } else {
      wait(0.25, () => beginTurn((turn + 1) % players.length, false));
      busy = 99;
    }
  }

  function endGame() {
    const top = Math.max(...players.map((p) => p.score));
    const best = players.map((p, i) => i).filter((i) => players[i].score === top);
    tie = best.length > 1; winnerIx = best[0];
    state = 'over'; overT = 0; overBtn = 0; newWin = false; banner = null;
    if (!tie && !players[winnerIx].tv) {
      wins++; newWin = true;
      Kit.store.set(ID + '.wins', wins);
      Kit.record(ID, wins);
      Kit.confetti(160); Kit.sfx.win();
    } else if (tie) Kit.sfx.chime();
    else if (humans()) Kit.sfx.over();
    else Kit.sfx.chime();
  }

  // ---------- The remote's cursor ----------
  function fixCursor() {
    curY = clamp(curY, 0, 2 * B);
    if (curY % 2 === 0) { if (curX % 2 === 0) curX += curX + 1 <= 2 * B - 1 ? 1 : -1; curX = clamp(curX, 1, 2 * B - 1); }
    else { if (curX % 2 === 1) curX += 1; curX = clamp(curX, 0, 2 * B); }
  }
  function moveCursor(dx, dy) {
    if (dx) {
      const lo = curY % 2 === 0 ? 1 : 0, hi = curY % 2 === 0 ? 2 * B - 1 : 2 * B;
      const nx = clamp(curX + 2 * dx, lo, hi);
      if (nx === curX) { Kit.tone(200, { type: 'sine', dur: 0.05, vol: 0.06 }); return; }
      curX = nx; prefX = curX; prefDx = dx;
    } else {
      const ny = clamp(curY + dy, 0, 2 * B);
      if (ny === curY) { Kit.tone(200, { type: 'sine', dur: 0.05, vol: 0.06 }); return; }
      curY = ny;
      const needOdd = curY % 2 === 0;
      if ((curX % 2 === 1) !== needOdd) {
        const a = curX - 1, b = curX + 1;
        const da = Math.abs(a - prefX), db = Math.abs(b - prefX);
        curX = da < db ? a : db < da ? b : (prefDx > 0 ? b : a);
      }
      fixCursor();
    }
    Kit.sfx.move();
  }

  // ---------- Keys and taps ----------
  const menuRows = () => ['count', 'seats', 'skill', 'play'];
  function menuKey(k) {
    const rows = menuRows(), row = rows[menuRow];
    if (k === 'up') { menuRow = (menuRow + rows.length - 1) % rows.length; Kit.sfx.move(); return; }
    if (k === 'down') { menuRow = (menuRow + 1) % rows.length; Kit.sfx.move(); return; }
    const d = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    if (row === 'count') {
      if (d) { const n = clamp(count + d, 2, 4); if (n === count) { Kit.sfx.nope(); return; } count = n; seatFocus = Math.min(seatFocus, count - 1); Kit.sfx.move(); }
      else if (k === 'ok') startGame();
    } else if (row === 'seats') {
      if (d) { const n = clamp(seatFocus + d, 0, count - 1); if (n === seatFocus) { Kit.sfx.nope(); return; } seatFocus = n; Kit.sfx.move(); }
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
    if (k === 'restart') return;
    if (!human(turn) || busy > 0 || later || bannerOn() && banner.t < 0.45) return;
    if (k === 'left') moveCursor(-1, 0);
    else if (k === 'right') moveCursor(1, 0);
    else if (k === 'up') moveCursor(0, -1);
    else if (k === 'down') moveCursor(0, 1);
    else if (k === 'ok') drawEdge(edgeAt(curX, curY));
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
        if (h.row === 'count') { count = h.v; seatFocus = Math.min(seatFocus, count - 1); Kit.sfx.move(); }
        else if (h.row === 'seats') { seatFocus = h.v; seatTv[h.v] = !seatTv[h.v]; Kit.sfx.pick(); }
        else if (h.row === 'skill') { skill = h.v; Kit.store.set(ID + '.skill', skill); Kit.sfx.move(); }
        else startGame();
        return;
      }
      if (state === 'over') {
        if (overT < 1.2) return;
        if (inside(e, L.btnMenu)) { Kit.sfx.move(); toMenu(); } else if (inside(e, L.btnAgain)) startGame();
        return;
      }
      if (!human(turn) || busy > 0 || later) return;
      // The nearest line to the tap.
      let best = -1, bd = 0.42;
      edges.forEach((ed, k) => {
        const m = mid(ed), p = toPx(m.x, m.y);
        const dist = Math.hypot(e.x - p.x, e.y - p.y) / L.cell;
        if (dist < bd) { bd = dist; best = k; }
      });
      if (best >= 0) {
        const xy = edgeXY(edges[best]); curX = xy.X; curY = xy.Y; prefX = curX;
        drawEdge(best);
      }
    },
  });
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // ---------- Update ----------
  function update(dt) {
    if (hidden) return;
    clock += dt; stateT += dt;
    players.forEach((p) => { p.bump = Math.max(0, p.bump - dt * 2.2); });
    if (state === 'menu') {
      if (AUTO && stateT > 0.5) startGame();
      return;
    }
    if (state === 'over') {
      overT += dt;
      if (overT > 1 && Math.random() < dt * 0.5 && !tie && !players[winnerIx].tv) Kit.confetti(30);
      if (AUTO && overT > 2.5) startGame();
      return;
    }
    if (banner) banner.t += dt;
    if (busy > 0 && busy < 50) busy -= dt * FAST;
    if (later) { later.t -= dt; if (later.t <= 0) { const f = later.fn; later = null; busy = 0; f(); } }
    // Cursor glide
    if (view && edges.length) {
      const e = edges[edgeAt(curX, curY)];
      if (e) {
        const m = mid(e), f = Math.min(1, dt * 16);
        view.x += (m.x - view.x) * f; view.y += (m.y - view.y) * f; view.h = e.h;
      }
    }
    // The TV: wait, glide the cursor to its line, then draw.
    if (state === 'play' && !human(turn) && !later && busy <= 0 && !(banner && banner.t < 0.7 / FAST)) {
      think -= dt * FAST;
      if (think <= 0) {
        if (tvTarget < 0) {
          tvTarget = tvPick();
          if (tvTarget < 0) return;
          const xy = edgeXY(edges[tvTarget]); curX = xy.X; curY = xy.Y;
          think = 0.35;
        } else {
          const k = tvTarget; tvTarget = -1;
          drawEdge(k);
        }
      }
    }
  }

  // ---------- Layout ----------
  let L = { u: 1, cell: 80, ox: 0, oy: 0, cards: [], hits: [] };
  const toPx = (x, y) => ({ x: L.ox + x * L.cell, y: L.oy + y * L.cell });
  const boardPic = document.createElement('canvas');
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 1920, H / 1080);
    const wide = W / H > 1.2;
    let cell, ox, oy, cards = [], side;
    const n = Math.max(2, players.length || count);
    if (wide) {
      const sw = 480 * u;
      const areaW = W - sw - 120 * u, areaH = H - 120 * u;
      cell = Math.floor(Math.min(areaW, areaH) / (B + 0.9));
      const S = cell * B;
      ox = Math.round(60 * u + (areaW - S) / 2 + cell * 0.2); oy = Math.round((H - S) / 2);
      side = { x: W - sw - 50 * u, y: 70 * u, w: sw, h: H - 140 * u };
      const ch = 120 * u, gap = 22 * u, y0 = side.y + 190 * u;
      for (let i = 0; i < n; i++) cards.push({ x: side.x, y: y0 + i * (ch + gap), w: sw, h: ch });
    } else {
      const top = 80 * u + 60;
      const cw = (W - 40 * u * 2 - 20 * u * (n - 1)) / n, ch = Math.min(120 * u + 30, H * 0.11);
      cell = Math.floor(Math.min(W * 0.9, H - top - ch - 120) / (B + 0.6));
      const S = cell * B;
      ox = Math.round((W - S) / 2); oy = Math.round(top + ch + 40 + (H - top - ch - 80 - S) / 2);
      for (let i = 0; i < n; i++) cards.push({ x: 40 * u + i * (cw + 20 * u), y: top, w: cw, h: ch });
      side = null;
    }
    L = { u, wide, cell, ox, oy, cards, side, hits: [], S: cell * B };
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

  // The board: a glowing night-time notebook with graph-paper lines and faint guides between the dots.
  function bakeBoard() {
    const { cell } = L, S = cell * B, pad = cell * 0.55, dpr = DPR();
    boardPic.width = Math.ceil((S + pad * 2) * dpr); boardPic.height = Math.ceil((S + pad * 2) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const w = S + pad * 2, r = cell * 0.35;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = cell * 0.4; c.shadowOffsetY = cell * 0.12;
    roundRect(c, cell * 0.08, cell * 0.08, w - cell * 0.16, w - cell * 0.16, r);
    const g = c.createLinearGradient(0, 0, 0, w);
    g.addColorStop(0, '#1d2350'); g.addColorStop(1, '#0d1030');
    c.fillStyle = g; c.fill();
    c.restore();
    c.save();
    roundRect(c, cell * 0.08, cell * 0.08, w - cell * 0.16, w - cell * 0.16, r); c.clip();
    // graph paper
    const step = cell / 4;
    c.strokeStyle = 'rgba(120,160,255,0.07)'; c.lineWidth = 1;
    for (let x = pad % step; x < w; x += step) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, w); c.stroke(); }
    for (let y = pad % step; y < w; y += step) { c.beginPath(); c.moveTo(0, y); c.lineTo(w, y); c.stroke(); }
    const rg = c.createRadialGradient(w * 0.3, w * 0.2, 0, w * 0.3, w * 0.2, w * 0.9);
    rg.addColorStop(0, 'rgba(140,120,255,0.18)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = rg; c.fillRect(0, 0, w, w);
    c.restore();
    // neon rim
    c.lineWidth = cell * 0.05; c.strokeStyle = 'rgba(150,170,255,0.55)';
    roundRect(c, cell * 0.08, cell * 0.08, w - cell * 0.16, w - cell * 0.16, r); c.stroke();
    c.lineWidth = cell * 0.02; c.strokeStyle = 'rgba(255,255,255,0.25)';
    roundRect(c, cell * 0.16, cell * 0.16, w - cell * 0.32, w - cell * 0.32, r * 0.8); c.stroke();
    // dotted guides
    c.translate(pad, pad);
    c.strokeStyle = 'rgba(170,190,255,0.16)'; c.lineWidth = Math.max(1.5, cell * 0.025);
    c.setLineDash([cell * 0.04, cell * 0.08]); c.lineCap = 'round';
    for (let r2 = 0; r2 <= B; r2++) { c.beginPath(); c.moveTo(0, r2 * cell); c.lineTo(S, r2 * cell); c.stroke(); }
    for (let c2 = 0; c2 <= B; c2++) { c.beginPath(); c.moveTo(c2 * cell, 0); c.lineTo(c2 * cell, S); c.stroke(); }
    c.setLineDash([]);
    L.pad = pad;
  }

  // A glossy dot: a pearl with a soft glow.
  const dotSprite = (s) => sprite('dot', s, s, (c, s) => {
    const r = s / 2;
    let g = c.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, 'rgba(200,210,255,0.5)'); g.addColorStop(1, 'rgba(200,210,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    const rr = s * 0.19;
    g = c.createRadialGradient(r - rr * 0.35, r - rr * 0.4, rr * 0.1, r, r, rr);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#d9defa'); g.addColorStop(1, '#8a93c8');
    c.fillStyle = g; c.beginPath(); c.arc(r, r, rr, 0, Math.PI * 2); c.fill();
  });
  // A filled box: a glossy coloured tile with the owner's initial.
  const boxSprite = (color, init, s) => sprite('box' + color + init, s, s, (c, s) => {
    const m = s * 0.08, r = s * 0.14;
    roundRect(c, m, m, s - m * 2, s - m * 2, r);
    const g = c.createLinearGradient(0, m, 0, s - m);
    g.addColorStop(0, shade(color, 0.25)); g.addColorStop(1, shade(color, -0.35));
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, m, m, s - m * 2, s - m * 2, r); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.22)';
    c.beginPath(); c.ellipse(s * 0.35, m, s * 0.6, s * 0.28, -0.2, 0, Math.PI * 2); c.fill();
    c.restore();
    c.lineWidth = s * 0.03; c.strokeStyle = shade(color, 0.5); roundRect(c, m, m, s - m * 2, s - m * 2, r); c.stroke();
    c.font = `700 ${Math.round(s * 0.5)}px ${Kit.FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillText(init, s / 2 + s * 0.02, s / 2 + s * 0.05);
    c.fillStyle = '#ffffff'; c.fillText(init, s / 2, s / 2 + s * 0.02);
  });
  const chipSprite = (color, s) => sprite('chip' + color, s, s, (c, s) => {
    const r = s / 2;
    const g = c.createRadialGradient(r * 0.7, r * 0.6, r * 0.1, r, r, r);
    g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.45));
    c.fillStyle = g; c.beginPath(); c.arc(r, r, r * 0.94, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.ellipse(r * 0.7, r * 0.5, r * 0.32, r * 0.17, -0.5, 0, Math.PI * 2); c.fill();
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

  // ---------- Drawing the game ----------
  function drawEdges(c, t) {
    const cell = L.cell, lw = cell * 0.11;
    c.lineCap = 'round';
    for (const e of edges) {
      if (e.owner < 0) continue;
      const col = players[e.owner] ? players[e.owner].color : '#ffffff';
      const k = ease.out(clamp((clock - e.t) / 0.2, 0, 1));
      const m = mid(e), p = toPx(m.x, m.y);
      const half = cell * 0.5 * k;
      const dx = e.h ? half : 0, dy = e.h ? 0 : half;
      c.strokeStyle = rgba(col, 0.25); c.lineWidth = lw * 2.4;
      c.beginPath(); c.moveTo(p.x - dx, p.y - dy); c.lineTo(p.x + dx, p.y + dy); c.stroke();
      c.strokeStyle = col; c.lineWidth = lw;
      c.beginPath(); c.moveTo(p.x - dx, p.y - dy); c.lineTo(p.x + dx, p.y + dy); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = lw * 0.3;
      c.beginPath(); c.moveTo(p.x - dx * 0.9 + (e.h ? 0 : -lw * 0.18), p.y - dy * 0.9 + (e.h ? -lw * 0.18 : 0));
      c.lineTo(p.x + dx * 0.9 + (e.h ? 0 : -lw * 0.18), p.y + dy * 0.9 + (e.h ? -lw * 0.18 : 0)); c.stroke();
    }
  }
  function drawBoxes(c) {
    const cell = L.cell;
    for (const b of boxes) {
      if (b.owner < 0) continue;
      const p = players[b.owner]; if (!p) continue;
      const k = ease.back(clamp((clock - b.t) / 0.35, 0, 1));
      const s = cell * 0.92 * k, q = toPx(b.c + 0.5, b.r + 0.5);
      if (s > 1) c.drawImage(boxSprite(p.color, p.init, Math.round(cell * 0.92)), q.x - s / 2, q.y - s / 2, s, s);
    }
  }
  function drawHints(c, t) {
    // Beginner: lines that finish a box glow gold for people.
    if (skill !== 0 || !human(turn) || later || busy > 0) return;
    const d = drawnArr();
    const a = 0.35 + 0.25 * Math.sin(t * 5);
    c.lineCap = 'round';
    edges.forEach((e, k) => {
      if (d[k] || !completes(d, k)) return;
      const m = mid(e), p = toPx(m.x, m.y), h = L.cell * 0.42;
      c.strokeStyle = `rgba(255,214,90,${a})`; c.lineWidth = L.cell * 0.12;
      c.beginPath(); c.moveTo(p.x - (e.h ? h : 0), p.y - (e.h ? 0 : h)); c.lineTo(p.x + (e.h ? h : 0), p.y + (e.h ? 0 : h)); c.stroke();
    });
  }
  function drawCursor(c, t) {
    if (!view || state !== 'play') return;
    const e = edges[edgeAt(curX, curY)]; if (!e) return;
    const p = toPx(view.x, view.y), pl = players[turn];
    const taken = e.owner >= 0;
    const h = L.cell * 0.44, pulse = 0.5 + 0.5 * Math.sin(t * 6);
    const col = taken ? '#9aa3c8' : pl.color;
    c.save();
    c.lineCap = 'round';
    c.shadowColor = col; c.shadowBlur = 18 + pulse * 14;
    c.strokeStyle = rgba(col.startsWith('#') ? col : '#ffffff', taken ? 0.35 : 0.55 + pulse * 0.3); c.lineWidth = L.cell * 0.17;
    c.beginPath(); c.moveTo(p.x - (view.h ? h : 0), p.y - (view.h ? 0 : h)); c.lineTo(p.x + (view.h ? h : 0), p.y + (view.h ? 0 : h)); c.stroke();
    c.shadowBlur = 0;
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = L.cell * 0.035;
    c.setLineDash([L.cell * 0.06, L.cell * 0.06]); c.lineDashOffset = -t * 30;
    c.beginPath(); c.moveTo(p.x - (view.h ? h : 0), p.y - (view.h ? 0 : h)); c.lineTo(p.x + (view.h ? h : 0), p.y + (view.h ? 0 : h)); c.stroke();
    c.restore();
  }
  function drawDots(c) {
    const s = L.cell * 0.55, img = dotSprite(Math.round(s));
    for (let r = 0; r <= B; r++) for (let q = 0; q <= B; q++) {
      const p = toPx(q, r);
      c.drawImage(img, p.x - s / 2, p.y - s / 2, s, s);
    }
  }

  function drawCard(c, i, t) {
    const r = L.cards[i], p = players[i]; if (!r || !p) return;
    const on = state === 'play' && i === turn;
    const k = 1 + p.bump * 0.04;
    c.save();
    c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
    Kit.glass(c, -r.w / 2, -r.h / 2, r.w, r.h, r.h * 0.28, { tint: on ? rgba(p.color, 0.35) : 'rgba(255,255,255,0.06)', glow: on ? p.color : null, t });
    const cs = r.h * 0.62;
    c.drawImage(chipSprite(p.color, Math.round(cs)), -r.w / 2 + r.h * 0.18, -cs / 2, cs, cs);
    text(c, p.init, -r.w / 2 + r.h * 0.18 + cs / 2, r.h * 0.02, cs * 0.5, '#ffffff', 700, 'center', Kit.FONT);
    const tx = -r.w / 2 + r.h * 0.3 + cs;
    fitText(c, p.name, tx, -r.h * 0.14, r.h * 0.3, r.w * 0.45, '#ffffff', 700, 'left', Kit.FONT);
    text(c, p.tv ? '📺 TV player' : (humans() === 1 ? '🙂 You' : '🙂 Person'), tx, r.h * 0.22, r.h * 0.2, 'rgba(255,255,255,0.75)', 600, 'left');
    text(c, String(p.score), r.w / 2 - r.h * 0.3, r.h * 0.03, r.h * 0.5, on ? '#ffffff' : 'rgba(255,255,255,0.9)', 700, 'right', Kit.FONT);
    c.restore();
  }

  function drawSide(c, t) {
    const u = L.u;
    if (L.wide && L.side) {
      const sd = L.side;
      Kit.title(c, 'Dots & Boxes', sd.x + sd.w / 2, sd.y + 40 * u, 64 * u, { color: '#9fd0ff', glow: 'rgba(120,170,255,0.6)' });
      text(c, `${SKILLS[skill].name}  ·  ${B} × ${B} boxes`, sd.x + sd.w / 2, sd.y + 110 * u, 30 * u, 'rgba(220,230,255,0.8)', 600);
    }
    players.forEach((p, i) => drawCard(c, i, t));
    // status
    const last = L.cards[players.length - 1];
    if (!last) return;
    const y = L.wide ? last.y + last.h + 70 * u : L.oy + L.S + 70;
    const left = boxes.length - filled;
    let msg;
    if (state === 'over') msg = 'Game over';
    else if (human(turn)) msg = Kit.touchFirst() ? 'Tap a line to draw it' : 'Arrows move  ·  OK draws';
    else msg = `${players[turn].name} (TV) is thinking…`;
    const cx = L.wide ? L.side.x + L.side.w / 2 : Kit.W / 2;
    const pulse = human(turn) && state === 'play' ? 0.85 + Math.sin(t * 5) * 0.15 : 1;
    c.globalAlpha = pulse;
    text(c, msg, cx, y, Math.max(18, 34 * u), human(turn) ? '#ffe36b' : '#ffffff', 700);
    c.globalAlpha = 1;
    if (L.wide) {
      text(c, `${left} box${left === 1 ? '' : 'es'} left`, cx, y + 56 * u, 30 * u, 'rgba(220,230,255,0.75)', 600);
      text(c, `👑 Wins: ${wins}`, cx, y + 110 * u, 32 * u, '#ffd23f', 700, 'center', Kit.FONT);
    }
  }

  function drawBanner(c) {
    if (!banner || state !== 'play') return;
    const T = 1.05 / FAST, k = banner.t;
    if (k > T) return;
    const W = Kit.W, H = Kit.H, u = L.u;
    const inK = ease.back(clamp(k / (0.28 / FAST), 0, 1)), outK = clamp((k - T * 0.72) / (T * 0.28), 0, 1);
    const w = Math.min(W * 0.8, 980 * u), h = 150 * u;
    c.save();
    c.globalAlpha = 1 - outK;
    c.translate(W / 2 + (1 - inK) * -W * 0.6 + outK * W * 0.4, H / 2);
    c.rotate(-0.03);
    c.shadowColor = 'rgba(0,0,0,0.5)'; c.shadowBlur = 30; c.shadowOffsetY = 10;
    roundRect(c, -w / 2, -h / 2, w, h, h * 0.3);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, shade(banner.color, 0.25)); g.addColorStop(1, shade(banner.color, -0.35));
    c.fillStyle = g; c.fill();
    c.shadowColor = 'transparent';
    c.lineWidth = 6 * u; c.strokeStyle = '#ffffff'; c.stroke();
    Kit.title(c, banner.text, 0, 4 * u, 84 * u, { color: '#ffffff' });
    c.restore();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(8,8,30,0.55)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.94, 1240 * u), ph = Math.min(H * 0.96, 980 * u);
    const px = (W - pw) / 2, py = (H - ph) / 2;
    const k = ease.back(clamp(stateT / 0.45, 0, 1));
    c.save();
    c.translate(W / 2, H / 2); c.scale(k, k); c.translate(-W / 2, -H / 2);
    roundRect(c, px, py, pw, ph, 40 * u); c.fillStyle = 'rgba(14,14,44,0.72)'; c.fill();
    Kit.glass(c, px, py, pw, ph, 40 * u, { tint: 'rgba(40,50,130,0.55)', edge: 'rgba(160,180,255,0.45)' });
    const cx = W / 2;
    Kit.title(c, 'Dots & Boxes', cx, py + 85 * u, 104 * u, { color: '#9fd0ff', glow: 'rgba(120,170,255,0.7)' });
    text(c, 'Draw lines between dots. Close a box to win it and go again!', cx, py + 165 * u, 34 * u, 'rgba(230,236,255,0.88)', 600);
    L.hits = [];
    const rows = menuRows();
    const rowY = { count: py + 280 * u, seats: py + 440 * u, skill: py + 640 * u, play: py + 810 * u };
    const lab = (s, y, on) => text(c, s, cx, y, 32 * u, on ? '#ffe36b' : 'rgba(200,215,255,0.85)', 700);
    // How many players
    {
      const on = rows[menuRow] === 'count', y = rowY.count;
      lab('How many players?', y - 58 * u, on);
      const w = 150 * u, h = 76 * u, gap = 24 * u, x0 = cx - (w * 3 + gap * 2) / 2;
      for (let v = 2; v <= 4; v++) {
        const x = x0 + (v - 2) * (w + gap);
        pill(c, x, y - h / 2, w, h, String(v), { on: count === v, focus: on, t, color: '#6c7bff' });
        L.hits.push({ x, y: y - h / 2, w, h, row: 'count', v });
      }
    }
    // Seats
    {
      const on = rows[menuRow] === 'seats', y = rowY.seats;
      lab(Kit.touchFirst() ? 'Tap a player to switch Person / TV' : 'Who plays?  ◀ ▶ pick  ·  OK switches Person / TV', y - 78 * u, on);
      const w = 250 * u, h = 112 * u, gap = 22 * u, x0 = cx - (w * count + gap * (count - 1)) / 2;
      for (let i = 0; i < count; i++) {
        const x = x0 + i * (w + gap), f = on && i === seatFocus;
        const kk = f ? 1.06 + Math.sin(t * 6) * 0.015 : 1;
        c.save(); c.translate(x + w / 2, y); c.scale(kk, kk);
        Kit.glass(c, -w / 2, -h / 2, w, h, 26 * u, { tint: rgba(COLORS[i], f ? 0.45 : 0.22), glow: f ? '#ffffff' : null, t });
        const cs = 66 * u;
        c.drawImage(chipSprite(COLORS[i], Math.round(cs)), -w / 2 + 16 * u, -cs / 2, cs, cs);
        text(c, NAMES[i][0], -w / 2 + 16 * u + cs / 2, 2 * u, cs * 0.5, '#fff', 700, 'center', Kit.FONT);
        text(c, NAMES[i], -w / 2 + 96 * u, -20 * u, 34 * u, '#ffffff', 700, 'left', Kit.FONT);
        text(c, seatTv[i] ? '📺 TV' : '🙂 Person', -w / 2 + 96 * u, 22 * u, 28 * u, seatTv[i] ? '#aee3ff' : '#ffe9a8', 700, 'left');
        c.restore();
        L.hits.push({ x, y: y - h / 2, w, h, row: 'seats', v: i });
      }
    }
    // Skill
    {
      const on = rows[menuRow] === 'skill', y = rowY.skill;
      lab('Skill', y - 62 * u, on);
      const w = 250 * u, h = 80 * u, gap = 24 * u, x0 = cx - (w * 3 + gap * 2) / 2;
      SKILLS.forEach((s, i) => {
        const x = x0 + i * (w + gap);
        pill(c, x, y - h / 2, w, h, s.name, { on: skill === i, focus: on, t, color: ['#20c46a', '#3d8bff', '#ff4d6d'][i] });
        L.hits.push({ x, y: y - h / 2, w, h, row: 'skill', v: i });
      });
      text(c, SKILLS[skill].tip, cx, y + 70 * u, 28 * u, 'rgba(230,236,255,0.8)', 600);
    }
    // Play
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
    text(c, Kit.touchFirst() ? 'Tap to choose  ·  tap Play' : '▲▼ choose a row  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, py + ph - 48 * u, 27 * u, 'rgba(220,230,255,0.7)', 600);
    // wins badge
    const bw = 260 * u, bh = 54 * u;
    roundRect(c, cx - bw / 2, py - bh / 2, bw, bh, bh / 2);
    c.fillStyle = '#1b1f5a'; c.fill(); c.lineWidth = 3 * u; c.strokeStyle = '#ffd23f'; c.stroke();
    text(c, `👑 Wins: ${wins}`, cx, py + 2 * u, 30 * u, '#ffd23f', 700, 'center', Kit.FONT);
    c.restore();
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((overT - 0.3) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(8,8,30,${0.6 * a})`; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.92, 900 * u), ph = Math.min(H * 0.9, (420 + players.length * 74) * u);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const wp = players[winnerIx];
    roundRect(c, -pw / 2, -ph / 2, pw, ph, 40 * u); c.fillStyle = 'rgba(14,14,44,0.88)'; c.fill();
    Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 40 * u, { tint: tie ? 'rgba(60,70,150,0.6)' : rgba(wp.color, 0.4), edge: 'rgba(255,255,255,0.5)' });
    let y = -ph / 2 + 80 * u;
    const title = tie ? "It's a tie!" : wp.tv ? `${wp.name} (TV) wins` : (humans() === 1 ? 'You win!' : `${wp.name} wins!`);
    Kit.title(c, title, 0, y, 86 * u, { color: tie ? '#ffe36b' : '#ffffff', glow: tie ? null : wp.color });
    y += 72 * u;
    text(c, newWin ? `🎉 New win!  👑 Wins: ${wins}` : `👑 Wins: ${wins}`, 0, y, 32 * u, '#ffd23f', 700);
    y += 60 * u;
    const order = players.map((p, i) => i).sort((i, j) => players[j].score - players[i].score);
    order.forEach((i, n) => {
      const p = players[i], rw = pw - 140 * u, rh = 62 * u;
      roundRect(c, -rw / 2, y, rw, rh, rh / 2);
      c.fillStyle = rgba(p.color, 0.3); c.fill();
      c.drawImage(chipSprite(p.color, Math.round(46 * u)), -rw / 2 + 12 * u, y + 8 * u, 46 * u, 46 * u);
      text(c, `${n + 1}.  ${p.name}${p.tv ? ' (TV)' : ''}`, -rw / 2 + 76 * u, y + rh / 2, 32 * u, '#ffffff', 700, 'left', Kit.FONT);
      text(c, `${p.score} box${p.score === 1 ? '' : 'es'}`, rw / 2 - 24 * u, y + rh / 2, 30 * u, '#ffffff', 600, 'right');
      y += rh + 12 * u;
    });
    const ready = overT > 1.2;
    c.globalAlpha = ready ? 1 : 0.45;
    const bw = 280 * u, bh = 84 * u, by = ph / 2 - bh - 36 * u;
    pill(c, -bw - 20 * u, by, bw, bh, '↻  Play again', { on: true, focus: overBtn === 0, t, color: overBtn === 0 ? '#20c46a' : '#3a4580' });
    pill(c, 20 * u, by, bw, bh, '☰  Menu', { on: true, focus: overBtn === 1, t, color: overBtn === 1 ? '#3d8bff' : '#3a4580' });
    c.globalAlpha = 1;
    c.restore();
    L.btnAgain = { x: W / 2 + (-bw - 20 * u) * k, y: H / 2 + by * k, w: bw * k, h: bh * k };
    L.btnMenu = { x: W / 2 + 20 * u * k, y: H / 2 + by * k, w: bw * k, h: bh * k };
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#1a1446', '#06071c', 'rgba(120,110,255,0.13)');
    if (state === 'menu' && !players.length) {
      // a decorative board behind the menu
      if (!edges.length) { build(SKILLS[skill].size); layout(W, H); demoFill(); }
    }
    if (edges.length) {
      const pad = L.pad || 0;
      c.drawImage(boardPic, L.ox - pad, L.oy - pad, boardPic.width / DPR(), boardPic.height / DPR());
      drawBoxes(c);
      if (state === 'play') drawHints(c, t);
      drawEdges(c, t);
      drawCursor(c, t);
      drawDots(c);
    }
    if (players.length && state !== 'menu') drawSide(c, t);
    drawBanner(c);
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c, t);
  }
  // A half-played board to look at behind the menu.
  function demoFill() {
    const demo = [{ color: COLORS[0], init: 'R', name: 'Red' }, { color: COLORS[1], init: 'B', name: 'Blue' }];
    players = [];
    let who = 0;
    for (let n = 0; n < edges.length * 0.55; n++) {
      const free = edges.map((e, k) => k).filter((k) => edges[k].owner < 0);
      if (!free.length) break;
      const k = free[Math.floor(Math.random() * free.length)];
      edges[k].owner = who; edges[k].t = -9;
      edges[k].boxes.forEach((b) => { if (boxes[b].owner < 0 && boxes[b].e.every((x) => edges[x].owner >= 0)) { boxes[b].owner = who; boxes[b].t = -9; } });
      who = 1 - who;
    }
    players = demo.map((d) => ({ ...d, tv: true, score: 0, bump: 0 }));
  }

  // A small read-only peek for automated tests.
  window.__game = () => {
    let goal = null, bv = 1e9;
    edges.forEach((e, k) => { const v = (k * 37 + filled * 11) % edges.length; if (e.owner < 0 && v < bv) { bv = v; const xy = edgeXY(e); goal = { x: xy.X, y: xy.Y }; } });
    return { state, turn, human: human(turn), filled, total: boxes.length, scores: players.map((p) => p.score), cur: { x: curX, y: curY }, goal, vstep: 1, hstep: 2 };
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
