// Sudoku Zen: the calm, modern Sudoku. Fill the grid so every row, column and 3×3 box holds 1 to 9.
// Easy, Medium or Hard; a wrong number counts as a mistake and three lose the puzzle; 3 hints a game.
// Remote: arrows move, OK opens the number ring (◀ ▶ choose 1-9, clear or hint, OK puts it, ▲ ▼ close).
// Number keys 1-9 fill, 0 clears. Touch: tap a square, tap it again for the ring. The game is saved.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const DIFFS = [
    { id: 'easy', name: 'Easy', icon: '🌱', clues: 40, tip: 'A gentle start' },
    { id: 'medium', name: 'Medium', icon: '🌊', clues: 32, tip: 'Think it through' },
    { id: 'hard', name: 'Hard', icon: '🔥', clues: 27, tip: 'For the masters' },
  ];
  const MAX_MISTAKES = 3, HINTS = 3;
  // A soft pentatonic scale: every digit has its own calm note.
  const PENTA = [392, 440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66];
  const C = {
    given: '#25344d', entered: '#2f6fe0', wrong: '#e5484d', hint: '#c77700', reveal: '#a3adbd',
    coral: '#ff8a65', peach: '#ffd9c2', gold: '#ffc94d', mint: '#5fe3c0',
  };
  const fmt = (s) => { s = Math.max(0, Math.floor(s)); const m = Math.floor(s / 60); return (m < 10 ? '0' : '') + m + ':' + String(s % 60).padStart(2, '0'); };

  // ---------- Sudoku logic: units, a fast solver that counts answers, and the puzzle maker ----------
  const RC = (i) => [(i / 9) | 0, i % 9];
  const BOX = (i) => (((i / 9) | 0) / 3 | 0) * 3 + ((i % 9) / 3 | 0);
  const UNITS = [];
  for (let r = 0; r < 9; r++) UNITS.push(Array.from({ length: 9 }, (_, c) => r * 9 + c));
  for (let c = 0; c < 9; c++) UNITS.push(Array.from({ length: 9 }, (_, r) => r * 9 + c));
  for (let b = 0; b < 9; b++) UNITS.push(Array.from({ length: 9 }, (_, k) => ((b / 3 | 0) * 3 + (k / 3 | 0)) * 9 + (b % 3) * 3 + (k % 3)));
  const UNITS_OF = Array.from({ length: 81 }, (_, i) => [RC(i)[0], 9 + RC(i)[1], 18 + BOX(i)]);
  const PEERS = Array.from({ length: 81 }, (_, i) => {
    const s = new Set();
    UNITS_OF[i].forEach((u) => UNITS[u].forEach((j) => { if (j !== i) s.add(j); }));
    return [...s];
  });
  const BITS = new Uint8Array(1024);
  for (let m = 1; m < 1024; m++) BITS[m] = BITS[m >> 1] + (m & 1);
  const shuffled = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /** How many answers the puzzle has, stopping at limit (it always tries the square with fewest choices). */
  function countAnswers(src, limit) {
    const g = src.slice(), rows = new Int32Array(9), cols = new Int32Array(9), boxes = new Int32Array(9);
    for (let i = 0; i < 81; i++) {
      const v = g[i]; if (!v) continue;
      const [r, c] = RC(i), b = BOX(i), bit = 1 << v;
      if ((rows[r] | cols[c] | boxes[b]) & bit) return 0;
      rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
    }
    function rec() {
      let best = -1, bestMask = 0, bestN = 10;
      for (let i = 0; i < 81; i++) {
        if (g[i]) continue;
        const r = (i / 9) | 0, c = i % 9, b = BOX(i);
        const m = ~(rows[r] | cols[c] | boxes[b]) & 0x3fe;
        const n = BITS[m];
        if (!n) return 0;
        if (n < bestN) { best = i; bestMask = m; bestN = n; if (n === 1) break; }
      }
      if (best < 0) return 1;
      const r = (best / 9) | 0, c = best % 9, b = BOX(best);
      let total = 0;
      for (let v = 1; v <= 9; v++) {
        const bit = 1 << v;
        if (!(bestMask & bit)) continue;
        g[best] = v; rows[r] |= bit; cols[c] |= bit; boxes[b] |= bit;
        total += rec();
        g[best] = 0; rows[r] &= ~bit; cols[c] &= ~bit; boxes[b] &= ~bit;
        if (total >= limit) return total;
      }
      return total;
    }
    return rec();
  }
  function canPut(g, i, v) {
    for (const j of PEERS[i]) if (g[j] === v) return false;
    return true;
  }
  function fillSolution(g, i) {
    if (i === 81) return true;
    for (const v of shuffled([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (canPut(g, i, v)) { g[i] = v; if (fillSolution(g, i + 1)) return true; g[i] = 0; }
    }
    return false;
  }
  /** Like the old game: a full random grid, then numbers taken away one at a time while it keeps one answer. */
  function makePuzzle(clues) {
    const sol = Array(81).fill(0);
    fillSolution(sol, 0);
    const g = sol.slice();
    let left = 81;
    for (const i of shuffled([...Array(81).keys()])) {
      if (left <= clues) break;
      const keep = g[i];
      g[i] = 0;
      if (countAnswers(g, 2) !== 1) g[i] = keep; else left--;
    }
    return { sol, grid: g };
  }

  // ---------- Records and the saved game ----------
  let wins = Kit.store.get('sudokuzen.wins', 0);
  let bestTimes = Kit.store.get('sudokuzen.best', { easy: 0, medium: 0, hard: 0 });
  let diffIx = clamp(Kit.store.get('sudokuzen.diff', 0), 0, 2);
  let saved = Kit.store.get('sudokuzen.save', null);

  // ---------- State ----------
  // state: 'menu' (a demo board fills itself behind the cards), 'play', 'won', 'lost'
  let state = 'menu', clock = 0, stateT = 0, endT = 0, hidden = false;
  let sol = [], grid = [], given = [], hinted = [], mistakes = 0, hints = HINTS, time = 0, cursor = 40;
  let picker = null, lastPick = 0, menuIx = 0, newBest = false, saveAcc = 0, demoAcc = 0, demoFull = -1;
  let curX = 4, curY = 4, introT = 0, mistakeT = -9, hintT = -9;
  const popT = new Float32Array(81).fill(-9), shakeT = new Float32Array(81).fill(-9);
  let ripples = [];
  const cellAmt = new Float32Array(81);

  const menuItems = () => (saved ? ['continue', 0, 1, 2] : [0, 1, 2]);
  const locked = (i) => given[i] || hinted[i] || (grid[i] !== 0 && grid[i] === sol[i]);
  const isWrong = (i) => grid[i] !== 0 && grid[i] !== sol[i];
  const doneCount = (d) => { let n = 0; for (let i = 0; i < 81; i++) if (grid[i] === d && sol[i] === d) n++; return n; };

  function load(p, d) {
    sol = p.sol.slice(); grid = p.grid.slice(); given = grid.map((v) => v !== 0); hinted = Array(81).fill(false);
    diffIx = d; mistakes = 0; hints = HINTS; time = 0; ripples = []; picker = null;
    cursor = Math.max(0, given.indexOf(false));
    curX = cursor % 9; curY = (cursor / 9) | 0;
    popT.fill(-9); shakeT.fill(-9);
    introT = clock;
  }
  function newGame(d) {
    load(makePuzzle(DIFFS[d].clues), d);
    Kit.store.set('sudokuzen.diff', d);
    state = 'play'; stateT = 0; newBest = false;
    save();
    Kit.tone(660, { type: 'sine', dur: 0.2, vol: 0.16 });
    Kit.tone(990, { type: 'sine', dur: 0.3, vol: 0.1, at: 0.08 });
  }
  function resume() {
    const s = saved;
    const nums = (str) => [...str].map(Number);
    load({ sol: nums(s.s), grid: nums(s.v).map((k, i) => (k ? nums(s.s)[i] : 0)) }, s.d);
    grid = nums(s.g); hinted = nums(s.h).map(Boolean);
    mistakes = s.m; hints = s.n; time = s.t; cursor = clamp(s.c, 0, 80);
    curX = cursor % 9; curY = (cursor / 9) | 0;
    state = 'play'; stateT = 0; newBest = false;
    sfx.pick();
  }
  function save() {
    if (state !== 'play') { saved = null; Kit.store.set('sudokuzen.save', null); return; }
    saved = {
      d: diffIx, s: sol.join(''), g: grid.join(''), v: given.map((b) => (b ? 1 : 0)).join(''),
      h: hinted.map((b) => (b ? 1 : 0)).join(''), m: mistakes, n: hints, t: Math.floor(time), c: cursor,
    };
    Kit.store.set('sudokuzen.save', saved);
    saveAcc = 0;
  }
  function toMenu() {
    state = 'menu'; picker = null;
    const items = menuItems();
    menuIx = Math.max(0, items.indexOf(saved ? 'continue' : diffIx));
    demo();
  }
  function demo() {
    load(makePuzzle(36), diffIx);
    demoFull = -1;
  }

  // ---------- Playing ----------
  const cellCenter = (i) => [L.gx + ((i % 9) + 0.5) * L.cs, L.gy + (((i / 9) | 0) + 0.5) * L.cs];
  function ripple(cells, from, k = 1) { ripples.push({ cells, from, t0: clock, k }); }
  function afterCorrect(i) {
    const [x, y] = cellCenter(i);
    const v = sol[i];
    Kit.tone(PENTA[v - 1], { type: 'sine', dur: 0.4, vol: 0.2 });
    Kit.tone(PENTA[v - 1] * 2, { type: 'triangle', dur: 0.18, vol: 0.05 });
    Kit.burst(x, y, C.mint, 8, 0.45);
    let done = 0;
    for (const u of UNITS_OF[i]) {
      if (UNITS[u].every((j) => grid[j] === sol[j])) { ripple(UNITS[u], i); done++; }
    }
    if (done) {
      const words = ['', 'Nice!', 'Great!', 'Perfect!'];
      Kit.float(words[done], x, y - L.cs * 0.6, { color: C.gold, size: L.cs * 0.6 });
      sfx.chime();
    }
    if (doneCount(v) === 9) {
      for (let j = 0; j < 81; j++) if (grid[j] === v) popT[j] = clock + Math.random() * 0.15;
      Kit.tone(PENTA[v - 1] * 1.5, { type: 'sine', dur: 0.6, vol: 0.1, at: 0.15 });
    }
    if (grid.every((g, j) => g === sol[j])) win(i);
  }
  function place(d) {
    const i = cursor;
    if (locked(i)) { nope(i); return; }
    if (grid[i] === d) return;
    grid[i] = d; popT[i] = clock; lastPick = d - 1;
    if (d === sol[i]) afterCorrect(i);
    else {
      mistakes++; shakeT[i] = clock; mistakeT = clock;
      Kit.shake(7, 0.3); sfx.nope();
      Kit.tone(98, { type: 'sine', dur: 0.35, vol: 0.25, slide: 0.7 });
      const [x, y] = cellCenter(i);
      Kit.float(mistakes >= MAX_MISTAKES ? 'Oh no!' : `Mistake ${mistakes}/${MAX_MISTAKES}`, x, y - L.cs * 0.7, { color: '#ff7b7f', size: L.cs * 0.45 });
      if (mistakes >= MAX_MISTAKES) lose();
    }
    save();
  }
  function clearCell() {
    const i = cursor;
    if (grid[i] === 0) return;
    if (locked(i)) { nope(i); return; }
    grid[i] = 0; popT[i] = clock;
    Kit.tone(330, { type: 'sine', dur: 0.12, vol: 0.12, slide: 0.6 });
    save();
  }
  function nope(i) {
    shakeT[i] = clock; sfx.nope();
  }
  function useHint() {
    if (hints <= 0) {
      const [x, y] = cellCenter(cursor);
      Kit.float('No hints left', x, y - L.cs * 0.6, { color: '#ffffff', size: L.cs * 0.42 });
      sfx.nope(); return;
    }
    let i = cursor;
    if (locked(i)) {
      // The cursor's square is already right: help with the open square nearest to it.
      let best = -1, bd = 99;
      const [r0, c0] = RC(cursor);
      for (let j = 0; j < 81; j++) {
        if (locked(j)) continue;
        const [r, c] = RC(j), d = Math.abs(r - r0) + Math.abs(c - c0) + Math.random() * 0.5;
        if (d < bd) { bd = d; best = j; }
      }
      if (best < 0) return;
      i = best; cursor = i;
    }
    hints--; hintT = clock;
    grid[i] = sol[i]; hinted[i] = true; popT[i] = clock;
    const [x, y] = cellCenter(i);
    Kit.burst(x, y, C.gold, 22, 0.8);
    Kit.float('💡', x, y - L.cs * 0.6, { color: C.gold, size: L.cs * 0.6 });
    afterCorrect(i);
    save();
  }
  function win(from) {
    state = 'won'; endT = clock; picker = null;
    const all = [...Array(81).keys()];
    ripple(all, from, 1.6);
    wins++; Kit.store.set('sudokuzen.wins', wins); Kit.record('sudokuzen', wins);
    const id = DIFFS[diffIx].id, t = Math.floor(time);
    if (!bestTimes[id] || t < bestTimes[id]) { newBest = true; bestTimes[id] = t; Kit.store.set('sudokuzen.best', bestTimes); }
    save();
    setTimeout(() => { sfx.win(); Kit.confetti(140); }, 500);
  }
  function lose() {
    state = 'lost'; endT = clock; picker = null;
    save();
    setTimeout(() => sfx.over(), 350);
    // Show the answer, square by square.
    for (let j = 0; j < 81; j++) if (!grid[j] || isWrong(j)) popT[j] = clock + 0.8 + (RC(j)[0] + RC(j)[1]) * 0.03;
  }
  function openPicker() {
    if (locked(cursor)) { nope(cursor); return; }
    picker = { sel: grid[cursor] ? grid[cursor] - 1 : lastPick, t0: clock };
    sfx.pick();
  }
  const PICK_N = 11; // 1-9, clear, hint
  function pickerApply(sel) {
    picker = null;
    if (sel < 9) place(sel + 1);
    else if (sel === 9) clearCell();
    else useHint();
  }
  function moveCursor(k) {
    let [r, c] = RC(cursor);
    if (k === 'up') r = (r + 8) % 9; else if (k === 'down') r = (r + 1) % 9;
    else if (k === 'left') c = (c + 8) % 9; else c = (c + 1) % 9;
    cursor = r * 9 + c;
    Kit.tone(880, { type: 'sine', dur: 0.04, vol: 0.05 });
  }

  // ---------- Layout ----------
  let L = { bx: 0, by: 0, bs: 0, gx: 0, gy: 0, cs: 40, px: 0, py: 0, pw: 0, ph: 0, wide: true };
  const boardBase = document.createElement('canvas'), boardLines = document.createElement('canvas');
  const sprites = new Map();
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H > 1.15;
    let bs, bx, by, px, py, pw, ph;
    if (wide) {
      bs = Math.min(H * 0.88, W * 0.56);
      pw = Math.min(W * 0.3, bs * 0.62); const gap = bs * 0.06;
      bx = Math.round((W - (bs + gap + pw)) / 2); by = Math.round((H - bs) / 2);
      px = bx + bs + gap; py = by; ph = bs;
    } else {
      bs = Math.min(W * 0.94, H * 0.62);
      bx = Math.round((W - bs) / 2); by = Math.round(H * 0.1);
      px = bx; pw = bs; py = by + bs + H * 0.025; ph = Math.min(H * 0.2, H - py - H * 0.03);
    }
    const pad = bs * 0.03;
    const cs = (bs - pad * 2) / 9;
    L = { bx, by, bs, gx: bx + pad, gy: by + pad, cs, px, py, pw, ph, wide };
    sprites.clear();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const m = bs * 0.06; // room for the soft shadow
    for (const cv of [boardBase, boardLines]) { cv.width = Math.ceil((bs + m * 2) * dpr); cv.height = Math.ceil((bs + m * 2) * dpr); }
    // The card: a soft shadow, a warm paper gradient and faintly tinted boxes.
    let c = boardBase.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, m * dpr, m * dpr);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.45)'; c.shadowBlur = bs * 0.05; c.shadowOffsetY = bs * 0.02;
    roundRect(c, 0, 0, bs, bs, bs * 0.045);
    const g = c.createLinearGradient(0, 0, bs, bs);
    g.addColorStop(0, '#fffaf2'); g.addColorStop(1, '#eee6da');
    c.fillStyle = g; c.fill();
    c.restore();
    for (let b = 0; b < 9; b++) {
      if (b % 2) continue;
      c.fillStyle = 'rgba(120,150,200,0.07)';
      c.fillRect(pad + (b % 3) * cs * 3, pad + (b / 3 | 0) * cs * 3, cs * 3, cs * 3);
    }
    // The lines on their own sprite, drawn over the highlights.
    c = boardLines.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, m * dpr, m * dpr);
    c.lineCap = 'round';
    for (let k = 1; k < 9; k++) {
      const thick = k % 3 === 0;
      c.strokeStyle = thick ? '#7d8aa3' : 'rgba(125,138,163,0.35)';
      c.lineWidth = thick ? Math.max(2, cs * 0.05) : Math.max(1, cs * 0.018);
      c.beginPath(); c.moveTo(pad + k * cs, pad + cs * 0.1); c.lineTo(pad + k * cs, pad + cs * 8.9); c.stroke();
      c.beginPath(); c.moveTo(pad + cs * 0.1, pad + k * cs); c.lineTo(pad + cs * 8.9, pad + k * cs); c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
    roundRect(c, 1, 1, bs - 2, bs - 2, bs * 0.045); c.stroke();
    L.m = m;
  }
  Kit.onResize(layout);
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
  const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
  const digitSprite = (d, color, size, weight = 700) => sprite('d' + d + color + weight, size, size, (c, s) => {
    c.font = `${weight} ${Math.round(s * 0.66)}px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(String(d), s / 2, s * 0.54);
  });
  const bubble = (on, size) => sprite('bub' + on, size, size, (c, s) => {
    const r = s / 2 - 2;
    const g = c.createRadialGradient(s * 0.38, s * 0.3, s * 0.05, s / 2, s / 2, r);
    if (on) { g.addColorStop(0, '#ffd2bf'); g.addColorStop(0.55, C.coral); g.addColorStop(1, '#d9573a'); }
    else { g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#eef2f8'); g.addColorStop(1, '#c4cedd'); }
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.ellipse(s * 0.5, s * 0.28, s * 0.22, s * 0.1, 0, 0, Math.PI * 2); c.fill();
  });
  const panelPic = (w, h) => sprite('panel', w, h, (c) => {
    roundRect(c, 1, 1, w - 2, h - 2, Math.min(w, h) * 0.08);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(70,110,170,0.42)'); g.addColorStop(1, 'rgba(25,45,85,0.42)');
    c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(170,205,255,0.28)'; c.stroke();
  });
  const cardPic = (on, w, h) => sprite('card' + on, w, h, (c) => {
    roundRect(c, 3, 3, w - 6, h - 6, Math.min(w, h) * 0.12);
    const g = c.createLinearGradient(0, 0, 0, h);
    if (on) { g.addColorStop(0, '#fff6ee'); g.addColorStop(1, '#ffd9c2'); }
    else { g.addColorStop(0, 'rgba(70,110,170,0.9)'); g.addColorStop(1, 'rgba(24,45,85,0.9)'); }
    c.fillStyle = g; c.fill();
    c.lineWidth = on ? 5 : 2; c.strokeStyle = on ? C.coral : 'rgba(170,205,255,0.35)'; c.stroke();
  });

  // ---------- Keys, digits, taps ----------
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      const items = menuItems(), prev = menuIx;
      if (k === 'left' || k === 'up') menuIx = (menuIx + items.length - 1) % items.length;
      else if (k === 'right' || k === 'down') menuIx = (menuIx + 1) % items.length;
      else if (k === 'ok') { choose(items[menuIx]); return; }
      if (menuIx !== prev) sfx.move();
      return;
    }
    if (state === 'won' || state === 'lost') {
      if (clock - endT < 1.8) return;
      if (k === 'ok') newGame(diffIx);
      else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { sfx.move(); toMenu(); }
      return;
    }
    if (picker) {
      if (k === 'left') { picker.sel = (picker.sel + PICK_N - 1) % PICK_N; sfx.move(); }
      else if (k === 'right') { picker.sel = (picker.sel + 1) % PICK_N; sfx.move(); }
      else if (k === 'up' || k === 'down') { picker = null; Kit.tone(500, { type: 'sine', dur: 0.08, vol: 0.08, slide: 0.7 }); }
      else if (k === 'ok') pickerApply(picker.sel);
      return;
    }
    if (k === 'ok') openPicker();
    else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') moveCursor(k);
  });
  function choose(item) {
    if (item === 'continue') resume();
    else newGame(item);
  }
  window.addEventListener('keydown', (e) => {
    let d = -1;
    if (/^[0-9]$/.test(e.key)) d = +e.key;
    else if (e.keyCode >= 48 && e.keyCode <= 57) d = e.keyCode - 48;
    else if (e.keyCode >= 96 && e.keyCode <= 105) d = e.keyCode - 96;
    if (d < 0) return;
    e.preventDefault();
    if (state === 'menu') {
      const items = menuItems(), ix = items.indexOf(d - 1);
      if (d >= 1 && d <= 3 && ix >= 0) { menuIx = ix; choose(items[ix]); }
      return;
    }
    if (state !== 'play') return;
    picker = null;
    if (d === 0) clearCell(); else place(d);
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inBox = (e, b) => b && e.x >= b.x && e.y >= b.y && e.x <= b.x + b.w && e.y <= b.y + b.h;
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = (L.cards || []).findIndex((r) => inBox(e, r));
        if (i >= 0) { if (i === menuIx) choose(menuItems()[i]); else { menuIx = i; sfx.move(); } }
        return;
      }
      if (state === 'won' || state === 'lost') {
        if (clock - endT < 1.8) return;
        if (inBox(e, L.menuBtn)) toMenu(); else newGame(diffIx);
        return;
      }
      if (picker) {
        const hit = (L.ring || []).findIndex((b) => Math.hypot(e.x - b.x, e.y - b.y) < b.r * 1.15);
        if (hit >= 0) pickerApply(hit); else picker = null;
        return;
      }
      const c = Math.floor((e.x - L.gx) / L.cs), r = Math.floor((e.y - L.gy) / L.cs);
      if (c >= 0 && r >= 0 && c < 9 && r < 9) {
        const i = r * 9 + c;
        if (i === cursor) openPicker(); else { cursor = i; Kit.tone(880, { type: 'sine', dur: 0.04, vol: 0.05 }); }
      }
    },
  });
  document.addEventListener('visibilitychange', () => {
    hidden = document.hidden;
    if (hidden && state === 'play') save();
  });

  // ---------- Update ----------
  function update(dt) {
    clock += dt; stateT += dt;
    if (state === 'play' && !hidden) {
      time += dt; saveAcc += dt;
      if (saveAcc > 4) save();
    }
    const k = Math.min(1, dt * 16);
    curX = lerp(curX, cursor % 9, k); curY = lerp(curY, (cursor / 9) | 0, k);
    if (state === 'menu') {
      // The demo board quietly solves itself, a square at a time.
      demoAcc += dt;
      if (demoFull < 0 && demoAcc > 0.45) {
        demoAcc = 0;
        const open = [];
        for (let i = 0; i < 81; i++) if (!grid[i]) open.push(i);
        if (open.length) {
          const i = open[(Math.random() * open.length) | 0];
          grid[i] = sol[i]; popT[i] = clock;
          for (const u of UNITS_OF[i]) if (UNITS[u].every((j) => grid[j])) ripple(UNITS[u], i);
          if (open.length === 1) { ripple([...Array(81).keys()], i, 1.6); demoFull = clock; }
        }
      }
      if (demoFull >= 0 && clock - demoFull > 3.5) demo();
    }
    // Ripples: each square glows as the wave passes it.
    cellAmt.fill(0);
    for (let n = ripples.length - 1; n >= 0; n--) {
      const rp = ripples[n], age = clock - rp.t0;
      if (age > 2.5) { ripples.splice(n, 1); continue; }
      const [r0, c0] = RC(rp.from);
      for (const j of rp.cells) {
        const [r, c] = RC(j);
        const ph = age - Math.hypot(r - r0, c - c0) * 0.055;
        if (ph > 0 && ph < 0.5) cellAmt[j] = Math.max(cellAmt[j], Math.sin((ph / 0.5) * Math.PI) * rp.k);
      }
    }
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom) {
    c.font = `900 ${Math.round(size)}px ${FONT}`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(8,18,40,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }

  function drawBoard(c) {
    const { gx, gy, cs, bx, by, bs, m } = L;
    c.drawImage(boardBase, bx - m, by - m, bs + m * 2, bs + m * 2);
    const playing = state === 'play';
    const [cr, cc] = RC(cursor), cb = BOX(cursor), cv = grid[cursor];
    // Highlights: the cursor's row, column and box, the same number, and clashing numbers.
    for (let i = 0; i < 81; i++) {
      const [r, col] = RC(i), x = gx + col * cs, y = gy + r * cs;
      let fill = null;
      if (playing) {
        if (cv && grid[i] === cv && i !== cursor) fill = isWrong(cursor) ? 'rgba(229,72,77,0.22)' : 'rgba(47,111,224,0.24)';
        else if (r === cr || col === cc || BOX(i) === cb) fill = 'rgba(80,140,230,0.11)';
      }
      if (isWrong(i)) fill = 'rgba(229,72,77,0.16)';
      if (fill) { c.fillStyle = fill; c.fillRect(x, y, cs, cs); }
      const sh = clock - shakeT[i];
      if (sh < 0.5) { c.fillStyle = `rgba(229,72,77,${0.4 * (1 - sh / 0.5)})`; c.fillRect(x, y, cs, cs); }
      const a = cellAmt[i];
      if (a > 0.02) { c.fillStyle = `rgba(95,227,192,${Math.min(0.55, a * 0.45)})`; c.fillRect(x, y, cs, cs); }
    }
    // The cursor glides between squares.
    if (playing) {
      const x = gx + curX * cs, y = gy + curY * cs, pulse = Math.sin(clock * 4) * 0.5 + 0.5;
      roundRect(c, x + 2, y + 2, cs - 4, cs - 4, cs * 0.16);
      c.fillStyle = 'rgba(255,190,150,0.55)'; c.fill();
    }
    c.drawImage(boardLines, bx - m, by - m, bs + m * 2, bs + m * 2);
    if (playing) {
      const x = gx + curX * cs, y = gy + curY * cs, pulse = Math.sin(clock * 4) * 0.5 + 0.5;
      roundRect(c, x + 2, y + 2, cs - 4, cs - 4, cs * 0.16);
      c.lineWidth = Math.max(3, cs * 0.06) + pulse * 1.5; c.strokeStyle = C.coral; c.stroke();
    }
    // Numbers.
    const ds = Math.round(cs);
    for (let i = 0; i < 81; i++) {
      let v = grid[i], color;
      const pAge = clock - popT[i];
      if (state === 'lost' && (!v || isWrong(i)) && pAge >= 0) { v = sol[i]; color = C.reveal; }
      if (!v) continue;
      if (!color) color = given[i] ? C.given : hinted[i] ? C.hint : isWrong(i) ? C.wrong : C.entered;
      const [r, col] = RC(i);
      let s = 1;
      if (given[i] && state !== 'menu') {
        const t = (clock - introT - (r + col) * 0.025) / 0.35;
        if (t < 1) s = t <= 0 ? 0 : ease.back(t);
      }
      if (pAge >= 0 && pAge < 0.35) s *= 0.4 + 0.6 * ease.back(pAge / 0.35);
      else if (pAge < 0) continue;
      s *= 1 + cellAmt[i] * 0.22;
      if (s <= 0.02) continue;
      let ox = 0;
      const sh = clock - shakeT[i];
      if (sh < 0.45) ox = Math.sin(sh * 55) * cs * 0.09 * (1 - sh / 0.45);
      const x = gx + (col + 0.5) * cs + ox, y = gy + (r + 0.5) * cs;
      const img = digitSprite(v, color, ds, given[i] ? 800 : 600);
      const w = cs * s;
      c.drawImage(img, x - w / 2, y - w / 2, w, w);
    }
  }

  function drawPanel(c) {
    const { px, py, pw, ph, cs } = L;
    c.drawImage(panelPic(pw, ph), px, py, pw, ph);
    const d = DIFFS[diffIx], cx = px + pw / 2;
    if (!L.wide) {
      // Phones held upright: one row of facts.
      const y = py + ph * 0.32, s = Math.min(ph * 0.22, pw * 0.055);
      text(c, `${d.icon} ${d.name}`, px + pw * 0.04, y, s, '#fff', 800, 'left');
      text(c, '⏱ ' + fmt(time), px + pw * 0.96, y, s * 1.2, '#fff', 800, 'right');
      text(c, `❤ ${MAX_MISTAKES - mistakes}   💡 ${hints}   👑 ${wins}`, cx, py + ph * 0.7, s, 'rgba(255,255,255,0.9)', 800);
      return;
    }
    const u = ph / 100;
    outlined(c, 'SUDOKU ZEN', cx, py + u * 7.5, Math.min(u * 6.2, pw * 0.11), '#ffffff', C.peach);
    // Difficulty pill
    const pillW = pw * 0.5, pillH = u * 6.4;
    roundRect(c, cx - pillW / 2, py + u * 13, pillW, pillH, pillH / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, `${d.icon} ${d.name}`, cx, py + u * 13 + pillH / 2, u * 3.8, '#ffffff', 800);
    // Timer
    text(c, fmt(time), cx, py + u * 29, u * 11, '#ffffff', 800);
    const bt = bestTimes[d.id];
    text(c, bt ? `👑 best ${fmt(bt)}` : 'no best time yet', cx, py + u * 37.5, u * 3.3, 'rgba(255,255,255,0.6)', 700);
    // Mistakes and hints
    const rowY = py + u * 47, lx = px + pw * 0.1;
    text(c, 'Mistakes', lx, rowY, u * 3.4, 'rgba(255,255,255,0.75)', 700, 'left');
    const mk = clamp((clock - mistakeT) / 0.5, 0, 1);
    for (let k = 0; k < MAX_MISTAKES; k++) {
      const x = px + pw * 0.9 - (MAX_MISTAKES - 1 - k) * u * 5.4, used = k < mistakes;
      const s = used && k === mistakes - 1 && mk < 1 ? 1 + Math.sin(mk * Math.PI) * 0.5 : 1;
      c.beginPath(); c.arc(x, rowY, u * 1.9 * s, 0, Math.PI * 2);
      c.fillStyle = used ? C.wrong : 'rgba(255,255,255,0.18)'; c.fill();
      if (used) text(c, '✕', x, rowY + u * 0.1, u * 2.4 * s, '#fff', 900);
    }
    const hy = py + u * 55.5;
    text(c, 'Hints', lx, hy, u * 3.4, 'rgba(255,255,255,0.75)', 700, 'left');
    const hk = clamp((clock - hintT) / 0.5, 0, 1);
    for (let k = 0; k < HINTS; k++) {
      const x = px + pw * 0.9 - (HINTS - 1 - k) * u * 5.4, on = k < hints;
      c.globalAlpha = on ? 1 : 0.25;
      const s = k === hints && hk < 1 ? 1 + Math.sin(hk * Math.PI) * 0.5 : 1;
      text(c, '💡', x, hy, u * 3.6 * s, '#fff', 400);
    }
    c.globalAlpha = 1;
    // Numbers left: a 3×3 pad; a finished number gets a tick.
    const ps = Math.min(pw * 0.66, u * 27), pcs = ps / 3, p0x = cx - ps / 2, p0y = py + u * 62;
    for (let d2 = 1; d2 <= 9; d2++) {
      const x = p0x + ((d2 - 1) % 3) * pcs, y = p0y + ((d2 - 1) / 3 | 0) * pcs;
      const n = doneCount(d2), full = n === 9;
      const on = state === 'play' && (picker ? picker.sel === d2 - 1 : grid[cursor] === d2);
      roundRect(c, x + 3, y + 3, pcs - 6, pcs - 6, pcs * 0.2);
      c.fillStyle = on ? C.coral : full ? 'rgba(95,227,192,0.25)' : 'rgba(255,255,255,0.1)'; c.fill();
      text(c, String(d2), x + pcs / 2, y + pcs * 0.42, pcs * 0.46, full ? C.mint : '#ffffff', 800);
      text(c, full ? '✓' : String(9 - n), x + pcs / 2, y + pcs * 0.79, pcs * 0.25, full ? C.mint : 'rgba(255,255,255,0.6)', 800);
    }
    text(c, `👑 Wins: ${wins}`, cx, py + u * 94, u * 3.6, C.gold, 800);
  }

  function drawPicker(c) {
    if (!picker) return;
    const { cs } = L;
    const W = Kit.W, H = Kit.H;
    const k = ease.back(clamp((clock - picker.t0) / 0.28, 0, 1));
    const R = cs * 1.75, br = cs * 0.44, edge = R + br + 10;
    const [x0, y0] = cellCenter(cursor);
    const cx = clamp(x0, edge, W - edge), cy = clamp(y0, edge, H - edge);
    // A soft dark halo behind the ring.
    c.fillStyle = `rgba(8,18,40,${0.55 * Math.min(1, k)})`;
    c.beginPath(); c.arc(cx, cy, (R + br + 8) * k, 0, Math.PI * 2); c.fill();
    if (cx !== x0 || cy !== y0) {
      c.strokeStyle = 'rgba(255,138,101,0.6)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(cx, cy); c.lineTo(x0, y0); c.stroke();
    }
    L.ring = [];
    for (let n = 0; n < PICK_N; n++) {
      const a = -Math.PI / 2 + (n / PICK_N) * Math.PI * 2 - (1 - k) * 0.8;
      const x = cx + Math.cos(a) * R * k, y = cy + Math.sin(a) * R * k;
      const on = n === picker.sel;
      const s = br * 2 * (on ? 1.22 + Math.sin(clock * 6) * 0.04 : 1) * k;
      L.ring.push({ x, y, r: br });
      if (s < 1) continue;
      const full = n < 9 && doneCount(n + 1) === 9;
      c.globalAlpha = full && !on ? 0.45 : 1;
      c.drawImage(bubble(on, Math.round(br * 2)), x - s / 2, y - s / 2, s, s);
      const label = n < 9 ? String(n + 1) : n === 9 ? '⌫' : '💡';
      const col = on ? '#ffffff' : n < 9 ? C.given : '#5a6680';
      text(c, label, x, y + s * 0.03, s * (n < 9 ? 0.5 : 0.4), col, 800);
      if (n === 10) text(c, String(hints), x + s * 0.3, y + s * 0.3, s * 0.26, hints ? C.coral : '#999', 900);
      c.globalAlpha = 1;
    }
    // The middle says what OK will do.
    const sel = picker.sel;
    const mid = sel < 9 ? String(sel + 1) : sel === 9 ? 'Clear' : 'Hint';
    text(c, mid, cx, cy - cs * 0.08, sel < 9 ? cs * 0.75 * k : cs * 0.36 * k, '#ffffff', 900);
    text(c, 'OK', cx, cy + cs * 0.46, cs * 0.22 * k, 'rgba(255,255,255,0.6)', 800);
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#16406a', '#081426', 'rgba(255,170,140,0.07)');
    if (!grid.length) return;
    if (state === 'menu') {
      // No side panel on the menu: the demo board sits in the middle.
      c.save(); c.translate(Math.round((W - L.bs) / 2 - L.bx), 0); drawBoard(c); c.restore();
    } else drawBoard(c);
    if (state !== 'menu') drawPanel(c);
    if (state === 'play') {
      drawPicker(c);
      if (!picker && L.wide) {
        const hint = Kit.touchFirst() ? 'Tap a square, tap again to pick a number' : 'Arrows move  ·  OK pick a number  ·  1-9 fill  ·  0 clear  ·  Back for games';
        text(c, hint, L.bx + L.bs / 2, L.by + L.bs + (H - L.by - L.bs) / 2, Math.max(12, (H - L.by - L.bs) * 0.42), 'rgba(255,255,255,0.6)', 700);
      } else if (picker && L.wide) {
        text(c, '◀ ▶ choose  ·  OK put it  ·  ▲ ▼ close', L.bx + L.bs / 2, L.by + L.bs + (H - L.by - L.bs) / 2, Math.max(12, (H - L.by - L.bs) * 0.42), 'rgba(255,255,255,0.75)', 700);
      }
    }
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
    if (state === 'menu') drawMenu(c, t);
    if (state === 'won' || state === 'lost') drawOver(c);
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, wide = W > H;
    c.fillStyle = 'rgba(6,14,30,0.76)'; c.fillRect(0, 0, W, H);
    const items = menuItems(), n = items.length;
    const unit = Math.min(W / 16, H / 9);
    const gap = unit * 0.45;
    const cw = wide ? Math.min((W * 0.88 - gap * (n - 1)) / n, unit * 3.6) : Math.min(W * 0.84, unit * 7);
    const ch = wide ? cw * 1.05 : Math.min(H * 0.13, cw * 0.32);
    const total = wide ? cw * n + gap * (n - 1) : ch * n + gap * (n - 1);
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.53 - ch / 2 : H * 0.55 - total / 2;
    L.cards = items.map((_, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    const ty = wide ? y0 * 0.42 : y0 * 0.35;
    const bob = Math.sin(t * 1.6) * unit * 0.05;
    outlined(c, '🔢 SUDOKU ZEN', W / 2, ty + bob, unit * (wide ? 0.95 : 0.8), '#ffffff', C.peach);
    text(c, `👑 Wins: ${wins}`, W / 2, ty + unit * 0.85, unit * 0.36, C.gold, 800);
    text(c, Kit.touchFirst() ? 'Tap a card to play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, y0 - unit * 0.45, unit * 0.3, 'rgba(255,255,255,0.85)', 700);
    items.forEach((it, i) => {
      const r = L.cards[i], on = i === menuIx;
      const k = on ? 1.06 + Math.sin(t * 4) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      c.drawImage(cardPic(on, Math.round(r.w), Math.round(r.h)), -r.w / 2, -r.h / 2, r.w, r.h);
      const ink = on ? C.given : '#ffffff', soft = on ? 'rgba(37,52,77,0.7)' : 'rgba(255,255,255,0.75)';
      let icon, name, tip, foot, footCol = on ? '#c4501f' : C.gold;
      if (it === 'continue') {
        const s = saved, filled = [...s.g].filter((ch, j) => ch !== '0' && ch === s.s[j]).length;
        icon = '▶️'; name = 'Continue';
        tip = `${DIFFS[s.d].icon} ${DIFFS[s.d].name}  ·  ${fmt(s.t)}`;
        foot = `${Math.round((filled / 81) * 100)}% done`;
      } else {
        const d = DIFFS[it];
        icon = d.icon; name = d.name; tip = d.tip;
        foot = bestTimes[d.id] ? `👑 ${fmt(bestTimes[d.id])}` : 'New';
      }
      if (wide) {
        text(c, icon, 0, -r.h * 0.25, r.h * 0.2, '#fff', 400);
        text(c, name, 0, r.h * 0.0, r.h * 0.14, ink, 900);
        text(c, tip, 0, r.h * 0.16, r.h * 0.075, soft, 700);
        text(c, foot, 0, r.h * 0.33, r.h * 0.085, footCol, 800);
      } else {
        text(c, icon, -r.w * 0.36, 0, r.h * 0.4, '#fff', 400);
        text(c, name, -r.w * 0.22, -r.h * 0.16, r.h * 0.26, ink, 900, 'left');
        text(c, tip, -r.w * 0.22, r.h * 0.2, r.h * 0.15, soft, 700, 'left');
        text(c, foot, r.w * 0.44, 0, r.h * 0.18, footCol, 800, 'right');
      }
      c.restore();
    });
    const tipY = wide ? y0 + ch + unit * 0.75 : y0 + total + unit * 0.6;
    const tips = ['Every row, column and box holds 1 to 9', '3 mistakes and it is over', '💡 3 hints a game'];
    if (wide) text(c, tips.join('   ·   '), W / 2, tipY, unit * 0.28, 'rgba(255,255,255,0.7)', 600);
    else tips.forEach((tx, i) => text(c, tx, W / 2, tipY + i * unit * 0.45, unit * 0.28, 'rgba(255,255,255,0.7)', 600));
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, unit = Math.min(W / 16, H / 9);
    const delay = state === 'won' ? 1.3 : 1.6;
    const a = clamp((clock - endT - delay) / 0.45, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(6,14,30,${0.6 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, unit * 7.2), ph = unit * 5.4;
    roundRect(c, -pw / 2, -ph / 2, pw, ph, unit * 0.4);
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    g.addColorStop(0, '#2d5d93'); g.addColorStop(1, '#12284a');
    c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = state === 'won' ? C.gold : '#ff9a9d'; c.stroke();
    const d = DIFFS[diffIx];
    if (state === 'won') {
      outlined(c, 'Solved!', 0, -ph * 0.36, unit * 0.8, '#ffffff', C.peach);
      // The time counts up.
      const tk = clamp((clock - endT - delay - 0.3) / 1.0, 0, 1);
      outlined(c, '⏱ ' + fmt(time * ease.out(tk)), 0, -ph * 0.14, unit * 0.85, '#fff6c2', '#ffb703');
      text(c, newBest ? `🎉 New best time on ${d.name}!` : `👑 Best ${fmt(bestTimes[d.id])} on ${d.name}`, 0, ph * 0.04, unit * 0.3, '#ffffff', 800);
      text(c, `👑 Wins: ${wins}   ·   ✕ ${mistakes} mistakes   ·   💡 ${HINTS - hints} hints`, 0, ph * 0.15, unit * 0.24, 'rgba(255,255,255,0.75)', 700);
    } else {
      outlined(c, 'Out of tries', 0, -ph * 0.34, unit * 0.75, '#ffffff', '#ffb3b5');
      text(c, '3 mistakes. The answer is on the board.', 0, -ph * 0.14, unit * 0.3, '#ffffff', 700);
      const right = grid.filter((v, j) => v && v === sol[j] && !given[j]).length, open = given.filter((g) => !g).length;
      text(c, `You got ${right} of ${open} squares right`, 0, ph * 0.0, unit * 0.27, 'rgba(255,255,255,0.85)', 700);
      text(c, `${d.icon} ${d.name}  ·  ⏱ ${fmt(time)}  ·  👑 Wins: ${wins}`, 0, ph * 0.12, unit * 0.24, 'rgba(255,255,255,0.7)', 700);
    }
    const ready = clock - endT > 1.8;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap for a new puzzle' : 'OK  new puzzle', 0, ph * 0.28, unit * 0.34, '#9fe8ff', 800);
    const bw = unit * 3.6, bh = unit * 0.5;
    roundRect(c, -bw / 2, ph * 0.36, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Change difficulty' : 'Arrows  change difficulty', 0, ph * 0.36 + bh / 2, unit * 0.22, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.36 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  toMenu();
  Kit.canvas.focus();
  if (wins > 0) Kit.record('sudokuzen', wins);
})();
