// Crown Logic: an N×N board split into N coloured regions. Place exactly one crown in every row,
// every column and every colour, and no two crowns may touch, not even corner to corner.
// Every puzzle has exactly one answer: a valid crown layout is placed first, regions grow out from
// the crowns, and a backtracking solver reshapes them until no other layout fits.
// Remote: arrows move over the board, OK cycles a cell empty → ✕ → crown → empty; right from the
// board's edge reaches Undo, Hint and Restart. Touch and mouse: tap a cell or a button.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  // Soft pastels, all light enough for the dark crown outline and ✕ marks to stand out on a TV.
  // In hue order round the colour wheel, so far-apart indexes look clearly different.
  const PASTELS = ['#ff9fae', '#ffc48a', '#fff08a', '#c8f08f', '#8fe3cf', '#9ccfff', '#b5b0ff', '#eaa8f0', '#d3d9e2'];
  const NB4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const rnd = (n) => Math.floor(Math.random() * n);
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const sizeFor = (lv) => (lv <= 2 ? 5 : lv <= 5 ? 6 : lv <= 9 ? 7 : lv <= 14 ? 8 : 9);

  // ---------- Puzzle making ----------
  // A random crown layout: one per row and column, none touching (rows next to each other differ by 2+ columns).
  function crownLayout(N) {
    const p = [], used = Array(N).fill(false);
    (function go(r) {
      if (r === N) return true;
      for (const c of shuffle([...Array(N).keys()])) {
        if (used[c] || (r && Math.abs(p[r - 1] - c) < 2)) continue;
        used[c] = true; p[r] = c;
        if (go(r + 1)) return true;
        used[c] = false;
      }
      return false;
    })(0);
    return p;
  }
  /** Counts solutions (stopping at [cap]); also hands back one that differs from [sol]. */
  function solve(N, reg, cap, sol) {
    let n = 0, other = null;
    const col = Array(N).fill(false), rg = Array(N).fill(false), p = [];
    (function go(r) {
      if (n >= cap) return;
      if (r === N) { n++; if (sol && !other && p.some((c, i) => c !== sol[i])) other = p.slice(); return; }
      for (let c = 0; c < N; c++) {
        const g = reg[r * N + c];
        if (col[c] || rg[g] || (r && Math.abs(p[r - 1] - c) < 2)) continue;
        col[c] = rg[g] = true; p[r] = c;
        go(r + 1);
        col[c] = rg[g] = false;
      }
    })(0);
    return { n, other };
  }
  // Regions grow from the crowns, each at its own random pace, so sizes and shapes vary.
  function growRegions(N, sol) {
    const reg = Array(N * N).fill(-1), w = [];
    for (let i = 0; i < N; i++) { reg[i * N + sol[i]] = i; w.push(0.3 + Math.random() * 1.7); }
    let left = N * N - N;
    while (left > 0) {
      let x = Math.random() * w.reduce((a, b) => a + b, 0), g = 0;
      while (g < N - 1 && (x -= w[g]) > 0) g++;
      if (!w[g]) { if (w.every((v) => !v)) break; continue; }
      const fr = [];
      for (let k = 0; k < N * N; k++) {
        if (reg[k] !== g) continue;
        const r = Math.floor(k / N), c = k % N;
        for (const [dr, dc] of NB4) {
          const rr = r + dr, cc = c + dc;
          if (rr >= 0 && cc >= 0 && rr < N && cc < N && reg[rr * N + cc] < 0) fr.push(rr * N + cc);
        }
      }
      if (!fr.length) { w[g] = 0; continue; }
      reg[fr[rnd(fr.length)]] = g; left--;
    }
    return reg;
  }
  function connectedWithout(N, reg, g, skip) {
    let start = -1, total = 0;
    for (let k = 0; k < N * N; k++) if (reg[k] === g && k !== skip) { total++; if (start < 0) start = k; }
    if (!total) return false;
    const seen = new Set([start]), st = [start];
    while (st.length) {
      const k = st.pop(), r = Math.floor(k / N), c = k % N;
      for (const [dr, dc] of NB4) {
        const rr = r + dr, cc = c + dc, q = rr * N + cc;
        if (rr >= 0 && cc >= 0 && rr < N && cc < N && q !== skip && reg[q] === g && !seen.has(q)) { seen.add(q); st.push(q); }
      }
    }
    return seen.size === total;
  }
  // Colours for the regions: of many shuffles, the one whose touching regions sit furthest apart in hue.
  function paint(N, reg) {
    const touch = [];
    for (let k = 0; k < N * N; k++) {
      const r = Math.floor(k / N), c = k % N;
      if (c < N - 1 && reg[k + 1] !== reg[k]) touch.push([reg[k], reg[k + 1]]);
      if (r < N - 1 && reg[k + N] !== reg[k]) touch.push([reg[k], reg[k + N]]);
    }
    const M = PASTELS.length;
    let best = null, bestScore = -1;
    for (let i = 0; i < 300; i++) {
      const pick = shuffle([...Array(M).keys()]).slice(0, N);
      let worst = M, sum = 0;
      for (const [a, b] of touch) {
        const d = Math.abs(pick[a] - pick[b]), dist = Math.min(d, M - d);
        worst = Math.min(worst, dist); sum += dist;
      }
      const score = worst * 1000 + sum;
      if (score > bestScore) { bestScore = score; best = pick; }
    }
    return best.map((i) => PASTELS[i]);
  }
  /**
   * While another layout also fits, hand one of that layout's crown cells to a neighbouring region:
   * that layout then has two crowns in one colour and none in another, so it stops fitting. Ours always
   * still fits (its crown cells never move). Repeat until the solver finds just the one answer.
   */
  function makePuzzle(N) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const sol = crownLayout(N), reg = growRegions(N, sol);
      if (reg.some((g) => g < 0)) continue;
      for (let step = 0; step < 400; step++) {
        const { n, other } = solve(N, reg, 2, sol);
        if (n === 1) return { N, reg, sol, colors: paint(N, reg) };
        let moved = false;
        for (const r of shuffle([...Array(N).keys()])) {
          if (other[r] === sol[r]) continue;
          const k = r * N + other[r], g = reg[k], opts = [];
          for (const [dr, dc] of NB4) {
            const rr = r + dr, cc = other[r] + dc;
            if (rr >= 0 && cc >= 0 && rr < N && cc < N && reg[rr * N + cc] !== g) opts.push(reg[rr * N + cc]);
          }
          if (!opts.length || !connectedWithout(N, reg, g, k)) continue;
          reg[k] = opts[rnd(opts.length)]; moved = true; break;
        }
        if (!moved) break;
      }
    }
    // Practically never reached; a plain diagonal-free layout with one-row regions is still a fair puzzle.
    const sol = crownLayout(N), reg = [];
    for (let k = 0; k < N * N; k++) reg.push(Math.floor(k / N));
    return { N, reg, sol, colors: PASTELS.slice(0, N) };
  }

  // ---------- State ----------
  let level = Kit.store.get('crownlogic.level', 1);
  const bestTimes = Kit.store.get('crownlogic.best', {});
  let P, marks, time, hints, history, won, wonT, newBest;
  let cursor = { kind: 'cell', r: 0, c: 0 }, lastCell = { r: 0, c: 0 };
  let pop, conflicts = new Set(), shownSec = -1, introT = 0, nopeT = 0;

  function save() { Kit.store.set('crownlogic.game', { level, P, marks, time, hints }); }
  function begin(again) {
    if (!again) { P = makePuzzle(sizeFor(level)); time = 0; hints = 0; }
    marks = Array(P.N * P.N).fill(0);
    pop = new Float32Array(P.N * P.N).fill(-9);
    history = []; won = false; newBest = false; conflicts = new Set();
    if (!again || cursor.kind !== 'btn') { cursor = { kind: 'cell', r: Math.floor(P.N / 2), c: Math.floor(P.N / 2) }; lastCell = { r: cursor.r, c: cursor.c }; }
    layout(); save();
  }

  // ---------- Layout: the board on the left, the level, timer and buttons on the right ----------
  let L = { buttons: [] };
  const BUTTONS = [{ id: 'undo', label: '↶  Undo' }, { id: 'hint', label: '💡  Hint' }, { id: 'restart', label: '⟳  Restart' }];
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W || !P) return;
    const pw = Math.min(W * 0.28, 340), gap = Math.min(W * 0.045, 64);
    const B = Math.floor(Math.min(H * 0.8, W * 0.94 - pw - gap) / P.N) * P.N;
    const total = B + gap + pw, x0 = (W - total) / 2;
    L.B = B; L.cs = B / P.N; L.bx = Math.round(x0); L.by = Math.round((H * 0.93 - B) / 2);
    L.px = L.bx + B + gap; L.pw = pw;
    const bh = Math.max(46, Math.min(H * 0.08, 64)), bgap = Math.max(12, H * 0.022);
    const by0 = L.by + B - (BUTTONS.length * bh + (BUTTONS.length - 1) * bgap);
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: L.px, y: by0 + i * (bh + bgap), w: pw, h: bh }));
    paintBoard();
    crownSprites.clear();
  }
  Kit.onResize(layout);

  // ---------- Rules ----------
  function findConflicts() {
    const N = P.N, bad = new Set(), crowns = [];
    for (let k = 0; k < N * N; k++) if (marks[k] === 2) crowns.push(k);
    for (let i = 0; i < crowns.length; i++) for (let j = i + 1; j < crowns.length; j++) {
      const a = crowns[i], b = crowns[j];
      const ar = Math.floor(a / N), ac = a % N, br = Math.floor(b / N), bc = b % N;
      if (ar === br || ac === bc || P.reg[a] === P.reg[b] || (Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1)) { bad.add(a); bad.add(b); }
    }
    conflicts = bad;
    return crowns.length;
  }
  function check() {
    const n = findConflicts();
    if (n === P.N && !conflicts.size) win();
  }
  function win() {
    won = true; wonT = performance.now() / 1000;
    const key = P.N + '';
    const t = Math.floor(time);
    const prev = bestTimes[key];
    if (!prev || t < prev) { newBest = !!prev; bestTimes[key] = t; Kit.store.set('crownlogic.best', bestTimes); }
    Kit.record('crownlogic', level);
    // The crowns hop one after another, then the confetti.
    const N = P.N;
    for (let r = 0; r < N; r++) pop[r * N + P.sol[r]] = wonT + 0.08 * r;
    setTimeout(() => { sfx.win(); Kit.confetti(150); }, 200);
    Kit.store.set('crownlogic.level', level + 1);
    Kit.store.set('crownlogic.game', null);
  }

  // ---------- Moves ----------
  function setMark(k, v, rec) {
    if (rec) rec.push([k, marks[k]]);
    marks[k] = v; pop[k] = performance.now() / 1000;
  }
  function cycle(r, c) {
    if (won) return;
    const k = r * P.N + c, v = (marks[k] + 1) % 3;
    const rec = [];
    setMark(k, v, rec); history.push(rec);
    if (v === 1) Kit.tone(420, { type: 'triangle', dur: 0.06, vol: 0.12 });
    else if (v === 2) {
      Kit.tone(784, { type: 'triangle', dur: 0.14, vol: 0.16 }); Kit.tone(1175, { type: 'sine', dur: 0.22, vol: 0.08, at: 0.05 });
      const p = cellCenter(r, c); Kit.burst(p.x, p.y, '#ffd23f', 8, 0.45);
    } else sfx.move();
    const before = conflicts.size;
    check();
    if (v === 2 && conflicts.has(k) && conflicts.size > before) sfx.nope();
    save();
  }
  function undo() {
    if (won) return;
    const rec = history.pop();
    if (!rec) { sfx.nope(); nopeT = performance.now() / 1000; return; }
    for (let i = rec.length - 1; i >= 0; i--) { marks[rec[i][0]] = rec[i][1]; pop[rec[i][0]] = performance.now() / 1000; }
    sfx.move(); findConflicts(); save();
  }
  /**
   * A hint: first fixes a wrong crown (it becomes ✕), then a ✕ on a crown's cell; next it crosses out
   * every cell the crowns already rule out; failing all that, it places one right crown.
   */
  function hint() {
    if (won) return;
    const N = P.N, isSol = (k) => P.sol[Math.floor(k / N)] === k % N;
    const rec = [];
    let msg = '';
    const wrong = marks.findIndex((v, k) => v === 2 && !isSol(k));
    const lost = marks.findIndex((v, k) => v === 1 && isSol(k));
    if (wrong >= 0) { setMark(wrong, 1, rec); msg = 'No crown fits there'; focusCell(wrong); }
    else if (lost >= 0) { setMark(lost, 2, rec); msg = 'A crown goes here!'; focusCell(lost); }
    else {
      for (let k = 0; k < N * N; k++) {
        if (marks[k] !== 2) continue;
        const r = Math.floor(k / N), c = k % N;
        for (let q = 0; q < N * N; q++) {
          if (q === k || marks[q] !== 0) continue;
          const qr = Math.floor(q / N), qc = q % N;
          if (qr === r || qc === c || P.reg[q] === P.reg[k] || (Math.abs(qr - r) <= 1 && Math.abs(qc - c) <= 1)) setMark(q, 1, rec);
        }
      }
      if (rec.length) msg = 'Crossed out what the crowns rule out';
      else {
        // The region with the fewest open cells gets its crown.
        let best = -1, bestOpen = Infinity;
        for (let r = 0; r < N; r++) {
          const k = r * N + P.sol[r];
          if (marks[k] === 2) continue;
          const g = P.reg[k];
          let open = 0;
          for (let q = 0; q < N * N; q++) if (P.reg[q] === g && marks[q] === 0) open++;
          if (open < bestOpen) { bestOpen = open; best = k; }
        }
        if (best >= 0) { setMark(best, 2, rec); msg = 'A crown goes here!'; focusCell(best); }
      }
    }
    if (!rec.length) { sfx.nope(); return; }
    history.push(rec); hints++;
    sfx.chime();
    Kit.float(msg, L.bx + L.B / 2, L.by + L.B / 2, { color: '#fff59d', size: Math.max(26, Math.min(L.cs * 0.5, 40)), life: 1.6 });
    check(); save();
  }
  function focusCell(k) { /* keep the remote's cursor where the player is; just remember for drawing */ hintCell = k; hintT = performance.now() / 1000; }
  let hintCell = -1, hintT = 0;
  function restart() { begin(true); sfx.pick(); }
  function next() { level++; Kit.store.set('crownlogic.level', level); begin(false); sfx.pick(); }
  function press(id) { if (id === 'undo') undo(); else if (id === 'hint') hint(); else restart(); }

  // ---------- Keys ----------
  function moveCursor(k) {
    const N = P.N;
    if (cursor.kind === 'cell') {
      const d = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[k];
      const r = cursor.r + d[0], c = cursor.c + d[1];
      if (r >= 0 && c >= 0 && r < N && c < N) { cursor = { kind: 'cell', r, c }; lastCell = { r, c }; sfx.move(); return; }
      if (k === 'right') {
        // Off the board's right edge: the button nearest in height.
        const y = cellCenter(cursor.r, cursor.c).y;
        let best = 0, bd = Infinity;
        L.buttons.forEach((b, i) => { const dd = Math.abs(b.y + b.h / 2 - y); if (dd < bd) { bd = dd; best = i; } });
        cursor = { kind: 'btn', i: best }; sfx.move();
      }
      return;
    }
    if (k === 'up' && cursor.i > 0) { cursor = { kind: 'btn', i: cursor.i - 1 }; sfx.move(); }
    else if (k === 'down' && cursor.i < L.buttons.length - 1) { cursor = { kind: 'btn', i: cursor.i + 1 }; sfx.move(); }
    else if (k === 'left') { cursor = { kind: 'cell', r: lastCell.r, c: N - 1 }; lastCell = { r: cursor.r, c: N - 1 }; sfx.move(); }
  }
  const ready = () => performance.now() / 1000 > wonT + 1.2;
  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && !repeat && ready()) next(); return; }
    if (k === 'undo') { undo(); return; }
    if (k === 'restart') { restart(); return; }
    if (k === 'ok') {
      if (repeat) return;
      if (cursor.kind === 'btn') press(L.buttons[cursor.i].id); else cycle(cursor.r, cursor.c);
      return;
    }
    moveCursor(k);
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (won) { if (ready()) next(); return; }
      const bi = L.buttons.findIndex((b) => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (bi >= 0) { cursor = { kind: 'btn', i: bi }; press(L.buttons[bi].id); return; }
      const c = Math.floor((e.x - L.bx) / L.cs), r = Math.floor((e.y - L.by) / L.cs);
      if (r >= 0 && c >= 0 && r < P.N && c < P.N) { cursor = { kind: 'cell', r, c }; lastCell = { r, c }; cycle(r, c); }
    },
  });

  // ---------- Drawing ----------
  const cellCenter = (r, c) => ({ x: L.bx + (c + 0.5) * L.cs, y: L.by + (r + 0.5) * L.cs });
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);

  // The coloured regions and their borders change only with a new puzzle or size: drawn once.
  const boardPic = document.createElement('canvas');
  function paintBoard() {
    const dpr = dprNow(), N = P.N, cs = L.cs, B = L.B, pad = Math.round(cs * 0.14);
    boardPic.width = Math.ceil((B + pad * 2) * dpr); boardPic.height = Math.ceil((B + pad * 2) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.translate(pad, pad);
    L.pad = pad;
    // Frame with a soft shadow
    roundRect(c, -pad * 0.7, -pad * 0.7, B + pad * 1.4, B + pad * 1.4, pad * 1.2);
    c.fillStyle = '#251538'; c.fill();
    c.save(); roundRect(c, 0, 0, B, B, pad * 0.6); c.clip();
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const hex = P.colors[P.reg[r * N + col]];
      const g = c.createLinearGradient(0, r * cs, 0, (r + 1) * cs);
      g.addColorStop(0, shade(hex, 0.12)); g.addColorStop(1, shade(hex, -0.06));
      c.fillStyle = g; c.fillRect(col * cs, r * cs, cs + 0.5, cs + 0.5);
    }
    // Thin lines between cells
    c.strokeStyle = 'rgba(40,20,60,0.22)'; c.lineWidth = Math.max(1, cs * 0.02);
    c.beginPath();
    for (let i = 1; i < N; i++) { c.moveTo(i * cs, 0); c.lineTo(i * cs, B); c.moveTo(0, i * cs); c.lineTo(B, i * cs); }
    c.stroke();
    // Thick borders where the colour changes
    c.strokeStyle = '#2a1840'; c.lineWidth = Math.max(3, cs * 0.075); c.lineCap = 'round';
    c.beginPath();
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const g = P.reg[r * N + col];
      if (col < N - 1 && P.reg[r * N + col + 1] !== g) { c.moveTo((col + 1) * cs, r * cs); c.lineTo((col + 1) * cs, (r + 1) * cs); }
      if (r < N - 1 && P.reg[(r + 1) * N + col] !== g) { c.moveTo(col * cs, (r + 1) * cs); c.lineTo((col + 1) * cs, (r + 1) * cs); }
    }
    c.stroke();
    c.restore();
    roundRect(c, 0, 0, B, B, pad * 0.6);
    c.lineWidth = Math.max(3, cs * 0.075); c.strokeStyle = '#2a1840'; c.stroke();
  }

  // The crown: gold, glossy, with three tipped points and a jewelled band. Drawn once per size.
  const crownSprites = new Map();
  function crownPic(size) {
    if (crownSprites.has(size)) return crownSprites.get(size);
    const dpr = dprNow(), pic = document.createElement('canvas');
    pic.width = pic.height = Math.ceil(size * dpr);
    const c = pic.getContext('2d');
    c.scale(dpr * size, dpr * size);
    c.lineJoin = 'round';
    // Shadow
    c.fillStyle = 'rgba(40,20,0,0.28)';
    c.beginPath(); c.ellipse(0.5, 0.88, 0.36, 0.06, 0, 0, Math.PI * 2); c.fill();
    const body = () => {
      c.beginPath();
      c.moveTo(0.16, 0.74); c.lineTo(0.1, 0.3); c.lineTo(0.32, 0.5); c.lineTo(0.5, 0.2);
      c.lineTo(0.68, 0.5); c.lineTo(0.9, 0.3); c.lineTo(0.84, 0.74); c.closePath();
    };
    body();
    const g = c.createLinearGradient(0, 0.2, 0, 0.8);
    g.addColorStop(0, '#fff6c4'); g.addColorStop(0.35, '#ffd23f'); g.addColorStop(0.75, '#f0a500'); g.addColorStop(1, '#b77400');
    c.fillStyle = g; c.fill();
    c.lineWidth = 0.045; c.strokeStyle = '#6e3f00'; c.stroke();
    // Gloss
    c.save(); body(); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.45)';
    c.beginPath(); c.moveTo(0.1, 0.3); c.lineTo(0.32, 0.5); c.lineTo(0.5, 0.2); c.lineTo(0.56, 0.3); c.lineTo(0.3, 0.6); c.lineTo(0.14, 0.5); c.closePath(); c.fill();
    c.restore();
    // Band
    roundRect(c, 0.13, 0.66, 0.74, 0.16, 0.05);
    const bg = c.createLinearGradient(0, 0.66, 0, 0.82);
    bg.addColorStop(0, '#ffe58a'); bg.addColorStop(1, '#c98400');
    c.fillStyle = bg; c.fill(); c.lineWidth = 0.04; c.strokeStyle = '#6e3f00'; c.stroke();
    // Jewels
    [[0.3, '#ff3b5c'], [0.5, '#3f8cff'], [0.7, '#1fbf6a']].forEach(([x, col]) => {
      c.beginPath(); c.arc(x, 0.74, 0.045, 0, Math.PI * 2);
      c.fillStyle = col; c.fill(); c.lineWidth = 0.02; c.strokeStyle = 'rgba(60,20,0,0.7)'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x - 0.014, 0.727, 0.014, 0, Math.PI * 2); c.fill();
    });
    // Balls on the tips
    [[0.1, 0.27], [0.5, 0.17], [0.9, 0.27]].forEach(([x, y]) => {
      const rg = c.createRadialGradient(x - 0.02, y - 0.02, 0.005, x, y, 0.06);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.4, '#ffe066'); rg.addColorStop(1, '#c98400');
      c.beginPath(); c.arc(x, y, 0.055, 0, Math.PI * 2);
      c.fillStyle = rg; c.fill(); c.lineWidth = 0.03; c.strokeStyle = '#6e3f00'; c.stroke();
    });
    crownSprites.set(size, pic);
    return pic;
  }

  function fmt(sec) { sec = Math.floor(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

  function update(dt) {
    introT += dt;
    if (!won) {
      time += dt;
      const s = Math.floor(time);
      if (s !== shownSec) { shownSec = s; if (s % 5 === 0) save(); }
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000;
    Kit.background(c, t, '#3b1c5e', '#110722', 'rgba(255,190,120,0.07)');
    const { bx, by, B, cs, pad } = L, N = P.N;
    c.drawImage(boardPic, bx - pad, by - pad, B + pad * 2, B + pad * 2);
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // Marks
    const size = Math.round(cs * 0.8), pic = crownPic(size);
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const k = r * N + col, v = marks[k];
      if (!v) continue;
      const x = bx + col * cs, y = by + r * cs, age = now - pop[k];
      const s = age < 0 ? 1 : age < 0.3 ? 1 + Math.sin(age / 0.3 * Math.PI) * 0.18 : 1;
      if (v === 1) {
        const d = cs * 0.16 * s, cx = x + cs / 2, cy = y + cs / 2;
        c.strokeStyle = 'rgba(50,30,70,0.6)'; c.lineWidth = Math.max(2.5, cs * 0.07); c.lineCap = 'round';
        c.beginPath(); c.moveTo(cx - d, cy - d); c.lineTo(cx + d, cy + d); c.moveTo(cx + d, cy - d); c.lineTo(cx - d, cy + d); c.stroke();
      } else {
        if (conflicts.has(k)) {
          const a = 0.45 + 0.25 * Math.sin(t * 9);
          roundRect(c, x + cs * 0.06, y + cs * 0.06, cs * 0.88, cs * 0.88, cs * 0.16);
          c.fillStyle = `rgba(255,40,70,${a})`; c.fill();
          c.lineWidth = Math.max(3, cs * 0.06); c.strokeStyle = '#ff2448'; c.stroke();
        }
        const hop = won && age > 0 && age < 0.45 ? Math.sin(age / 0.45 * Math.PI) * cs * 0.22 : 0;
        const d = size * s;
        c.drawImage(pic, x + (cs - d) / 2, y + (cs - d) / 2 - cs * 0.02 - hop, d, d);
      }
    }
    // A hint's cell glows for a moment.
    if (hintCell >= 0 && now - hintT < 1.6) {
      const r = Math.floor(hintCell / N), col = hintCell % N;
      c.globalAlpha = 1 - (now - hintT) / 1.6;
      c.lineWidth = Math.max(4, cs * 0.08); c.strokeStyle = '#fff59d';
      roundRect(c, bx + col * cs + 2, by + r * cs + 2, cs - 4, cs - 4, cs * 0.16); c.stroke();
      c.globalAlpha = 1;
    }
    // The remote's cursor
    if (cursor.kind === 'cell' && !won && !Kit.touchFirst()) {
      const x = bx + cursor.c * cs, y = by + cursor.r * cs, p = 0.5 + 0.5 * Math.sin(t * 7);
      c.lineWidth = Math.max(6, cs * 0.12); c.strokeStyle = `rgba(255,255,255,${0.35 + 0.25 * p})`;
      roundRect(c, x + 1, y + 1, cs - 2, cs - 2, cs * 0.18); c.stroke();
      c.lineWidth = Math.max(3, cs * 0.06); c.strokeStyle = '#ffb703';
      roundRect(c, x + 1, y + 1, cs - 2, cs - 2, cs * 0.18); c.stroke();
    }

    // Side panel: level, size, timer, buttons
    const px0 = L.px + L.pw / 2, ph = L.buttons[0].y - by;
    c.font = `900 ${Math.round(Math.min(H * 0.075, 52, L.pw * 0.2))}px system-ui, sans-serif`;
    c.lineJoin = 'round'; c.lineWidth = 6; c.strokeStyle = 'rgba(30,10,50,0.85)';
    const ty = by + ph * 0.12;
    c.strokeText(`Level ${level}`, px0, ty);
    const lg = c.createLinearGradient(0, ty - 25, 0, ty + 25);
    lg.addColorStop(0, '#fff6c4'); lg.addColorStop(1, '#ffc23d');
    c.fillStyle = lg; c.fillText(`Level ${level}`, px0, ty);
    const fs = Math.round(Math.max(20, Math.min(H * 0.036, 28)));
    c.font = `700 ${fs}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fillText(`${N} × ${N}  ·  ${N} crowns`, px0, ty + fs * 1.7);
    c.font = `800 ${Math.round(fs * 1.7)}px system-ui, sans-serif`; c.fillStyle = '#fff';
    c.fillText(`⏱ ${fmt(time)}`, px0, ty + fs * 4);
    const best = bestTimes[N];
    c.font = `600 ${Math.round(fs * 0.85)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.55)';
    c.fillText(best ? `Best ${N}×${N}: ${fmt(best)}  ·  Hints ${hints}` : `Hints used: ${hints}`, px0, ty + fs * 5.9, L.pw * 1.1);
    // The rules, when there is room between the timer and the buttons
    const rulesTop = ty + fs * 7.2, rulesRoom = L.buttons[0].y - rulesTop;
    const rules = ['1 per row and column', '1 in every colour', 'No touching, not even corners'];
    let rf = Math.round(fs * 0.88);
    c.font = `600 ${rf}px system-ui, sans-serif`;
    const widest = Math.max(...rules.map((l) => c.measureText(l).width));
    if (widest + rf * 1.7 > L.pw * 1.05) rf = Math.floor(rf * (L.pw * 1.05) / (widest + rf * 1.7));
    const rl = rf * 1.5;
    if (rulesRoom > rl * 3.4 && rf >= 14) {
      const ry = rulesTop + (rulesRoom - rl * 3) / 2 + rl / 2;
      c.font = `600 ${rf}px system-ui, sans-serif`;
      const icon = crownPic(Math.round(rf * 1.3));
      const blockW = Math.max(...rules.map((l) => c.measureText(l).width)) + rf * 1.7;
      const lx = px0 - blockW / 2;
      c.textAlign = 'left'; c.fillStyle = 'rgba(255,240,200,0.75)';
      rules.forEach((line, i) => {
        c.drawImage(icon, lx, ry + i * rl - rf * 0.72, rf * 1.3, rf * 1.3);
        c.fillText(line, lx + rf * 1.7, ry + i * rl);
      });
      c.textAlign = 'center';
    }

    L.buttons.forEach((b, i) => {
      const on = cursor.kind === 'btn' && cursor.i === i && !won && !Kit.touchFirst();
      const off = b.id === 'undo' && !history.length;
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 3 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
      c.font = `800 ${Math.round(Math.min(b.h * 0.42, b.w * 0.12))}px system-ui, sans-serif`;
      c.fillStyle = on ? '#2b1600' : off ? 'rgba(255,255,255,0.4)' : '#fff';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    });

    // How to play
    const hf = Math.round(Math.max(18, Math.min(H * 0.032, 26)));
    c.font = `600 ${hf}px system-ui, sans-serif`;
    const intro = introT < 8 && level <= 2 && !history.length;
    c.fillStyle = intro ? `rgba(255,245,157,${0.65 + 0.35 * Math.sin(t * 4)})` : 'rgba(255,255,255,0.55)';
    const tip = intro ? 'One crown in every row, column and colour · crowns never touch, not even corners'
      : Kit.touchFirst() ? 'Tap a cell: ✕ → crown → empty · one crown per row, column and colour'
        : 'Arrows move · OK: ✕ → crown → empty · One per row, column, colour · No touching · Back exits';
    c.fillText(tip, W / 2, H * 0.955, W * 0.95);

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if (won && now - wonT > 1.0) {
      const a = clamp((now - wonT - 1.0) / 0.4, 0, 1);
      c.fillStyle = `rgba(14,4,28,${0.6 * a})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw = Math.min(W * 0.84, 540), ph2 = Math.min(H * 0.52, 310);
      roundRect(c, -pw / 2, -ph2 / 2, pw, ph2, 28);
      const g = c.createLinearGradient(0, -ph2 / 2, 0, ph2 / 2);
      g.addColorStop(0, '#8a3fd1'); g.addColorStop(1, '#3d1470');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd23f'; c.stroke();
      c.drawImage(pic, -ph2 * 0.13, -ph2 * 0.5, ph2 * 0.26, ph2 * 0.26);
      c.fillStyle = '#fff'; c.font = `900 ${Math.round(ph2 * 0.15)}px system-ui, sans-serif`;
      c.fillText('Solved!', 0, -ph2 * 0.13);
      c.font = `800 ${Math.round(ph2 * 0.1)}px system-ui, sans-serif`; c.fillStyle = '#fff';
      c.fillText(`⏱ ${fmt(time)}${hints ? `  ·  ${hints} hint${hints > 1 ? 's' : ''}` : ''}`, 0, ph2 * 0.04);
      c.font = `700 ${Math.round(ph2 * 0.08)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(newBest ? `New best ${N}×${N} time!` : `Best ${N}×${N}: ${fmt(bestTimes[N] || time)}`, 0, ph2 * 0.18);
      c.fillStyle = '#fff59d';
      c.fillText(Kit.touchFirst() ? 'Tap for the next puzzle' : 'Press OK for the next puzzle', 0, ph2 * 0.35);
      c.restore();
    }
  }

  // ---------- Start: carry on with the saved puzzle, or make a new one ----------
  const saved = Kit.store.get('crownlogic.game', null);
  if (saved && saved.level === level && saved.P && saved.marks && saved.marks.length === saved.P.N * saved.P.N) {
    P = saved.P; marks = saved.marks; time = saved.time || 0; hints = saved.hints || 0;
    pop = new Float32Array(P.N * P.N).fill(-9); history = []; won = false;
    cursor = { kind: 'cell', r: Math.floor(P.N / 2), c: Math.floor(P.N / 2) }; lastCell = { r: cursor.r, c: cursor.c };
    findConflicts();
  } else begin(false);
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('crownlogic', level - 1);
})();
