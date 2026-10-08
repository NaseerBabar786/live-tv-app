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
    if (!again) { P = makePuzzle(sizeFor(level)); time = 0; hints = 0; bannerT = performance.now() / 1000 + 0.15; }
    marks = Array(P.N * P.N).fill(0);
    pop = new Float32Array(P.N * P.N).fill(-9);
    history = []; won = false; newBest = false; conflicts = new Set();
    if (!again || cursor.kind !== 'btn') { cursor = { kind: 'cell', r: Math.floor(P.N / 2), c: Math.floor(P.N / 2) }; lastCell = { r: cursor.r, c: cursor.c }; }
    layout(); save();
  }

  // ---------- Layout: the board on the left, the level, timer and buttons on the right ----------
  let L = { buttons: [] };
  const BUTTONS = [{ id: 'undo', text: 'Undo' }, { id: 'hint', text: 'Hint' }, { id: 'restart', text: 'Restart' }];
  function layout() {
    const W = Kit.W, H = Kit.H;
    if (!W || !P) return;
    const pw = Math.min(W * 0.28, 340), gap = Math.min(W * 0.045, 64);
    const B = Math.floor(Math.min(H * 0.76, W * 0.92 - pw - gap) / P.N) * P.N;
    const total = B + gap + pw, x0 = (W - total) / 2;
    L.B = B; L.cs = B / P.N; L.bx = Math.round(x0); L.by = Math.round((H * 0.955 - B) / 2);
    L.px = L.bx + B + gap; L.pw = pw;
    const bh = Math.max(46, Math.min(H * 0.08, 64)), bgap = Math.max(12, H * 0.022);
    const by0 = L.by + B - (BUTTONS.length * bh + (BUTTONS.length - 1) * bgap);
    L.buttons = BUTTONS.map((b, i) => ({ ...b, x: L.px, y: by0 + i * (bh + bgap), w: pw, h: bh }));
    scene = null; boardPic = null; crownSprites.clear();
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
    winFlashT = wonT + 0.15; starsShown = 0;
    setTimeout(() => { sfx.win(); Kit.confetti(150); Kit.shake(6, 0.25); sparkle(L.bx + L.B / 2, L.by + L.B / 2, 36, 1.5); ring(L.bx + L.B / 2, L.by + L.B / 2, '#ffe9a8', P.N * 0.5); }, 200);
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
      const p = cellCenter(r, c); sparkle(p.x, p.y, 10, 0.5); ring(p.x, p.y, '#ffd23f', 0.8);
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
  // Look: a royal hall hung with crimson velvet; the puzzle is a stained-glass window of jewel-tone
  // tiles in lead, set in a carved gold frame; crowns are polished gold with pearls and cut gems.
  // Heavy things (hall, window, crowns, marks) are painted once per size and reused as pictures.
  const cellCenter = (r, c) => ({ x: L.bx + (c + 0.5) * L.cs, y: L.by + (r + 0.5) * L.cs });
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  function makeCanvas(w, h) {
    const cv = document.createElement('canvas'), d = dprNow();
    cv.width = Math.max(1, Math.ceil(w * d)); cv.height = Math.max(1, Math.ceil(h * d));
    const c = cv.getContext('2d'); c.scale(d, d);
    return [cv, c];
  }
  function seeded(s) { return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  // Each region's jewel tone, matched to the hue-ordered pastel the puzzle was saved with.
  const JEWELS = ['#d93a5a', '#e8782a', '#e6b32a', '#7cbf2e', '#1fae7a', '#3a7be0', '#6a5ae0', '#b04fd0', '#97a6bf'];
  const jewelOf = (hex) => { const i = PASTELS.indexOf(hex); return JEWELS[i >= 0 ? i : (parseInt(hex.slice(1), 16) % JEWELS.length)]; };
  function goldGrad(c, x0, y0, x1, y1) {
    const g = c.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(0.18, '#f5c94a'); g.addColorStop(0.42, '#a8670c'); g.addColorStop(0.6, '#ffe28a');
    g.addColorStop(0.8, '#c88a1a'); g.addColorStop(1, '#6e3c00');
    return g;
  }

  // ---------- The hall: velvet drapes, damask, a gold valance and light from high windows ----------
  let scene = null;
  function paintScene() {
    const W = Kit.W, H = Kit.H, R = seeded(77);
    const [cv, c] = makeCanvas(W, H);
    // Velvet wall with soft vertical folds
    let g = c.createLinearGradient(0, 0, W, 0);
    const folds = Math.max(10, Math.round(W / 110));
    for (let i = 0; i <= folds * 4; i++) {
      const k = i / (folds * 4), v = Math.sin(k * folds * Math.PI * 2);
      g.addColorStop(k, v > 0 ? `rgb(${110 + v * 40 | 0},${18 + v * 8 | 0},${40 + v * 10 | 0})` : `rgb(${110 + v * 55 | 0},${18 + v * 10 | 0},${40 + v * 18 | 0})`);
    }
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(20,0,10,0.55)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(15,0,8,0.65)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Damask: a faint gold flower repeated across the velvet
    const step = Math.max(70, H * 0.12);
    c.fillStyle = 'rgba(255,200,120,0.055)';
    for (let y = 0, row = 0; y < H + step; y += step, row++) for (let x = (row % 2) * step / 2; x < W + step; x += step) {
      c.save(); c.translate(x, y); const s = step * 0.22;
      for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.ellipse(0, -s * 0.9, s * 0.32, s * 0.75, 0, 0, Math.PI * 2); c.fill(); }
      c.beginPath(); c.arc(0, 0, s * 0.28, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    // Light shafts from high windows
    c.save(); c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      const x = W * (0.12 + i * 0.26 + R() * 0.05), w = W * (0.06 + R() * 0.05);
      g = c.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(255,210,150,0.13)'); g.addColorStop(1, 'rgba(255,210,150,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + w, 0); c.lineTo(x + w + W * 0.16, H); c.lineTo(x + W * 0.1, H); c.closePath(); c.fill();
    }
    c.restore();
    // Drapes at the sides with gold tie-backs
    [[0, 1], [W, -1]].forEach(([x0, s]) => {
      const dw = W * 0.075;
      c.save();
      g = c.createLinearGradient(x0, 0, x0 + s * dw, 0);
      g.addColorStop(0, '#3d0614'); g.addColorStop(0.35, '#8c1530'); g.addColorStop(0.6, '#5a0a1f'); g.addColorStop(0.85, '#9a1c38'); g.addColorStop(1, '#4a0818');
      c.fillStyle = g;
      c.beginPath(); c.moveTo(x0, 0); c.lineTo(x0 + s * dw * 1.3, 0);
      c.bezierCurveTo(x0 + s * dw * 1.1, H * 0.35, x0 + s * dw * 0.45, H * 0.5, x0 + s * dw * 0.55, H * 0.58);
      c.bezierCurveTo(x0 + s * dw * 0.8, H * 0.7, x0 + s * dw * 1.2, H * 0.9, x0 + s * dw * 1.25, H);
      c.lineTo(x0, H); c.closePath();
      c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = 30; c.shadowOffsetX = s * 8; c.fill();
      c.restore();
      c.save(); c.translate(x0 + s * dw * 0.55, H * 0.58);
      c.fillStyle = goldGrad(c, -12, -12, 12, 12);
      roundRect(c, -dw * 0.4, -H * 0.012, dw * 0.8, H * 0.024, H * 0.012); c.fill();
      c.beginPath(); c.arc(0, 0, H * 0.02, 0, Math.PI * 2); c.fill();
      c.restore();
    });
    // Valance across the top with scallops and a fringe
    const vh = H * 0.05;
    g = c.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0, '#4a0818'); g.addColorStop(1, '#8c1530');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(W, 0); c.lineTo(W, vh);
    const sc = W / Math.max(6, Math.round(W / 160));
    for (let x = W; x > 0; x -= sc) c.quadraticCurveTo(x - sc / 2, vh * 1.7, x - sc, vh);
    c.closePath(); c.fill();
    c.strokeStyle = goldGrad(c, 0, vh * 0.8, 0, vh * 1.5); c.lineWidth = Math.max(2, H * 0.005);
    c.beginPath(); c.moveTo(W, vh);
    for (let x = W; x > 0; x -= sc) c.quadraticCurveTo(x - sc / 2, vh * 1.7, x - sc, vh);
    c.stroke();
    // Vignette
    const rg = c.createRadialGradient(W * 0.45, H * 0.5, Math.min(W, H) * 0.25, W * 0.5, H * 0.5, Math.max(W, H) * 0.75);
    rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(10,0,5,0.7)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    scene = cv;
  }

  // Floating gold dust in the light
  const motes = Array.from({ length: 30 }, () => ({ x: Math.random(), y: Math.random(), v: 0.004 + Math.random() * 0.01, s: 3 + Math.random() * 7, p: Math.random() * 6 }));
  let dust = null;
  function dustSprite() {
    if (dust) return dust;
    dust = document.createElement('canvas'); dust.width = dust.height = 64;
    const c = dust.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,250,220,1)'); g.addColorStop(0.2, 'rgba(255,210,110,0.8)'); g.addColorStop(0.55, 'rgba(255,170,60,0.18)'); g.addColorStop(1, 'rgba(255,170,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return dust;
  }

  // ---------- The window: stained-glass tiles in lead, in a carved gold frame ----------
  let boardPic = null;
  function paintBoard() {
    const N = P.N, cs = L.cs, B = L.B, fw = Math.round(Math.max(14, cs * 0.34)), m = 50;
    const [cv, c] = makeCanvas(B + (fw + m) * 2, B + (fw + m) * 2);
    c.translate(m + fw, m + fw);
    const R = seeded(N * 31 + P.reg.length);
    // Frame with a deep drop shadow
    c.save(); c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = 36; c.shadowOffsetY = 14;
    roundRect(c, -fw, -fw, B + fw * 2, B + fw * 2, fw * 0.7); c.fillStyle = goldGrad(c, -fw, -fw, B + fw, B + fw); c.fill();
    c.restore();
    // Carved mouldings: bands of light and dark gold
    [[0.2, 'rgba(255,250,220,0.75)', 2], [0.45, 'rgba(90,45,0,0.65)', Math.max(2, fw * 0.12)], [0.62, 'rgba(255,236,170,0.6)', 1.5], [0.85, 'rgba(70,35,0,0.8)', 2]].forEach(([k, col, lw]) => {
      const o = fw * k;
      c.lineWidth = lw; c.strokeStyle = col;
      roundRect(c, -fw + o, -fw + o, B + (fw - o) * 2, B + (fw - o) * 2, Math.max(2, fw * 0.7 - o)); c.stroke();
    });
    // Beads along the frame
    c.fillStyle = 'rgba(255,240,190,0.55)';
    const beads = Math.round(B / (fw * 0.6));
    for (let i = 0; i <= beads; i++) {
      const p = -fw * 0.32 + (B + fw * 0.64) * i / beads, q = -fw * 0.32, q2 = B + fw * 0.32;
      [[p, q], [p, q2], [q, p], [q2, p]].forEach(([x, y]) => { c.beginPath(); c.arc(x, y, fw * 0.07, 0, Math.PI * 2); c.fill(); });
    }
    // Corner bosses with a ruby
    [[-fw / 2, -fw / 2], [B + fw / 2, -fw / 2], [-fw / 2, B + fw / 2], [B + fw / 2, B + fw / 2]].forEach(([x, y]) => {
      c.beginPath(); c.arc(x, y, fw * 0.62, 0, Math.PI * 2); c.fillStyle = goldGrad(c, x - fw, y - fw, x + fw, y + fw); c.fill();
      c.lineWidth = 1.5; c.strokeStyle = '#5a2e00'; c.stroke();
      gem(c, x, y, fw * 0.32, '#e0284a');
    });
    // Tiles
    c.save(); roundRect(c, 0, 0, B, B, 4); c.clip();
    c.fillStyle = '#140a14'; c.fillRect(0, 0, B, B);
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const hex = jewelOf(P.colors[P.reg[r * N + col]]), x = col * cs, y = r * cs;
      const g = c.createLinearGradient(x, y, x + cs, y + cs);
      g.addColorStop(0, shade(hex, 0.38)); g.addColorStop(0.45, hex); g.addColorStop(1, shade(hex, -0.35));
      c.fillStyle = g; c.fillRect(x, y, cs, cs);
      // Glass texture: mottled light and a few streaks
      for (let i = 0; i < 3; i++) {
        const gx = x + R() * cs, gy = y + R() * cs, gr = cs * (0.2 + R() * 0.35);
        const rg = c.createRadialGradient(gx, gy, 0, gx, gy, gr);
        const lite = R() < 0.5;
        rg.addColorStop(0, lite ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = rg; c.fillRect(x, y, cs, cs);
      }
      c.strokeStyle = 'rgba(255,255,255,0.1)'; c.lineWidth = 1;
      c.beginPath(); const sy = y + cs * (0.2 + R() * 0.5); c.moveTo(x + cs * 0.1, sy); c.quadraticCurveTo(x + cs * 0.5, sy - cs * 0.15, x + cs * 0.9, sy + cs * 0.05); c.stroke();
      // Bevel: bright top-left, dark bottom-right, a glint
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x, y, cs, cs * 0.05); c.fillRect(x, y, cs * 0.05, cs);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, y + cs * 0.95, cs, cs * 0.05); c.fillRect(x + cs * 0.95, y, cs * 0.05, cs);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.beginPath(); c.ellipse(x + cs * 0.24, y + cs * 0.2, cs * 0.11, cs * 0.04, -0.6, 0, Math.PI * 2); c.fill();
    }
    // Lead: thin inside a region, thick came where colours meet
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(25,14,22,0.75)'; c.lineWidth = Math.max(1.5, cs * 0.03);
    c.beginPath();
    for (let i = 1; i < N; i++) { c.moveTo(i * cs, 0); c.lineTo(i * cs, B); c.moveTo(0, i * cs); c.lineTo(B, i * cs); }
    c.stroke();
    const edges = new Path2D();
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const g = P.reg[r * N + col];
      if (col < N - 1 && P.reg[r * N + col + 1] !== g) { edges.moveTo((col + 1) * cs, r * cs); edges.lineTo((col + 1) * cs, (r + 1) * cs); }
      if (r < N - 1 && P.reg[(r + 1) * N + col] !== g) { edges.moveTo(col * cs, (r + 1) * cs); edges.lineTo((col + 1) * cs, (r + 1) * cs); }
    }
    c.strokeStyle = '#120a10'; c.lineWidth = Math.max(4, cs * 0.1); c.stroke(edges);
    c.strokeStyle = 'rgba(190,170,200,0.4)'; c.lineWidth = Math.max(1, cs * 0.022);
    c.save(); c.translate(-cs * 0.012, -cs * 0.012); c.stroke(edges); c.restore();
    // Inner shadow under the frame lip
    c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = cs * 0.3; c.lineWidth = cs * 0.2; c.strokeStyle = '#000';
    c.strokeRect(-cs * 0.1, -cs * 0.1, B + cs * 0.2, B + cs * 0.2);
    c.restore();
    c.lineWidth = 2; c.strokeStyle = '#3a1e00'; c.strokeRect(0, 0, B, B);
    boardPic = { cv, x: L.bx - fw - m, y: L.by - fw - m, w: B + (fw + m) * 2, h: B + (fw + m) * 2 };
  }
  // A cut gem: dark and light facets round a bright table.
  function gem(c, x, y, r, col) {
    c.save(); c.translate(x, y);
    c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); } c.closePath();
    c.fillStyle = shade(col, -0.35); c.fill(); c.lineWidth = r * 0.14; c.strokeStyle = 'rgba(40,10,10,0.8)'; c.stroke();
    for (let i = 0; i < 8; i++) {
      const a0 = i * Math.PI / 4 + Math.PI / 8, a1 = a0 + Math.PI / 4;
      c.beginPath(); c.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); c.lineTo(Math.cos(a1) * r, Math.sin(a1) * r); c.lineTo(Math.cos(a1) * r * 0.5, Math.sin(a1) * r * 0.5); c.lineTo(Math.cos(a0) * r * 0.5, Math.sin(a0) * r * 0.5); c.closePath();
      c.fillStyle = i < 3 || i === 7 ? shade(col, 0.3) : shade(col, -0.15); c.fill();
    }
    c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5); } c.closePath();
    c.fillStyle = shade(col, 0.15); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.arc(-r * 0.25, -r * 0.3, r * 0.16, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  // ---------- Sprites: the crown, the ✕ mark, stars ----------
  const crownSprites = new Map();
  function crownPic(size) {
    if (crownSprites.has(size)) return crownSprites.get(size);
    const [pic, c] = makeCanvas(size, size);
    c.scale(size, size);
    c.lineJoin = 'round';
    // Contact shadow
    const sg = c.createRadialGradient(0.5, 0.86, 0, 0.5, 0.86, 0.4);
    sg.addColorStop(0, 'rgba(0,0,0,0.5)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = sg; c.beginPath(); c.ellipse(0.5, 0.86, 0.42, 0.09, 0, 0, Math.PI * 2); c.fill();
    // Velvet cap showing between the points
    c.beginPath(); c.moveTo(0.2, 0.68); c.quadraticCurveTo(0.5, 0.18, 0.8, 0.68); c.closePath();
    const vg = c.createLinearGradient(0, 0.3, 0, 0.7); vg.addColorStop(0, '#d0324e'); vg.addColorStop(1, '#5e0a1e');
    c.fillStyle = vg; c.fill();
    const body = () => {
      c.beginPath();
      c.moveTo(0.15, 0.74); c.lineTo(0.09, 0.3); c.lineTo(0.31, 0.5); c.lineTo(0.5, 0.17);
      c.lineTo(0.69, 0.5); c.lineTo(0.91, 0.3); c.lineTo(0.85, 0.74); c.closePath();
    };
    body(); c.fillStyle = '#5a3000'; c.lineWidth = 0.07; c.strokeStyle = '#4a2600'; c.stroke();
    body(); c.fillStyle = goldGrad(c, 0.1, 0.15, 0.85, 0.8); c.fill();
    // Polished reflections
    c.save(); body(); c.clip();
    let g = c.createLinearGradient(0, 0.2, 0, 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(120,60,0,0.25)');
    c.fillStyle = g; c.fillRect(0, 0, 1, 1);
    c.fillStyle = 'rgba(255,255,240,0.55)';
    c.beginPath(); c.moveTo(0.11, 0.33); c.lineTo(0.3, 0.52); c.lineTo(0.5, 0.2); c.lineTo(0.54, 0.27); c.lineTo(0.3, 0.6); c.lineTo(0.14, 0.48); c.closePath(); c.fill();
    c.restore();
    body(); c.lineWidth = 0.025; c.strokeStyle = 'rgba(90,45,0,0.9)'; c.stroke();
    // Jewelled band
    roundRect(c, 0.12, 0.64, 0.76, 0.18, 0.05);
    c.fillStyle = goldGrad(c, 0, 0.64, 0, 0.82); c.fill(); c.lineWidth = 0.025; c.strokeStyle = '#4a2600'; c.stroke();
    c.fillStyle = 'rgba(255,250,220,0.6)'; c.fillRect(0.15, 0.665, 0.7, 0.018);
    gem(c, 0.5, 0.73, 0.065, '#2f6bff');
    gem(c, 0.29, 0.73, 0.05, '#e0284a');
    gem(c, 0.71, 0.73, 0.05, '#18b45a');
    // Pearls on the tips
    [[0.09, 0.27, 0.058], [0.5, 0.14, 0.066], [0.91, 0.27, 0.058]].forEach(([x, y, r]) => {
      const pg = c.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
      pg.addColorStop(0, '#ffffff'); pg.addColorStop(0.5, '#f1e9ff'); pg.addColorStop(1, '#a99bc0');
      c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fillStyle = pg; c.fill();
      c.lineWidth = 0.015; c.strokeStyle = 'rgba(70,50,90,0.8)'; c.stroke();
    });
    crownSprites.set(size, pic);
    return pic;
  }
  function crossPic(size) {
    const key = 'x' + size;
    if (crownSprites.has(key)) return crownSprites.get(key);
    const [pic, c] = makeCanvas(size, size);
    const d = size * 0.22, m = size / 2;
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(20,8,20,0.75)'; c.lineWidth = size * 0.15;
    c.beginPath(); c.moveTo(m - d, m - d); c.lineTo(m + d, m + d); c.moveTo(m + d, m - d); c.lineTo(m - d, m + d); c.stroke();
    c.strokeStyle = 'rgba(255,248,235,0.92)'; c.lineWidth = size * 0.075;
    c.beginPath(); c.moveTo(m - d, m - d); c.lineTo(m + d, m + d); c.moveTo(m + d, m - d); c.lineTo(m - d, m + d); c.stroke();
    crownSprites.set(key, pic);
    return pic;
  }
  function starPath(c, r, inner = 0.48, n = 5) {
    c.beginPath();
    for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r * inner : r; c[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
    c.closePath();
  }
  function starPic(size, full) {
    const key = 's' + size + full;
    if (crownSprites.has(key)) return crownSprites.get(key);
    const [pic, c] = makeCanvas(size, size);
    c.translate(size / 2, size / 2);
    const r = size * 0.42;
    c.lineJoin = 'round';
    if (full) {
      starPath(c, r); c.fillStyle = goldGrad(c, -r, -r, r, r); c.fill();
      c.lineWidth = size * 0.04; c.strokeStyle = '#6e3c00'; c.stroke();
      starPath(c, r * 0.55); c.fillStyle = 'rgba(255,248,210,0.45)'; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.beginPath(); c.ellipse(-r * 0.2, -r * 0.35, r * 0.16, r * 0.08, -0.5, 0, Math.PI * 2); c.fill();
    } else {
      starPath(c, r); c.fillStyle = 'rgba(40,10,30,0.9)'; c.fill();
      c.lineWidth = size * 0.035; c.strokeStyle = 'rgba(230,180,120,0.45)'; c.stroke();
    }
    crownSprites.set(key, pic);
    return pic;
  }

  // ---------- Effects: gold sparkles and light rings ----------
  const sparks = [], rings = [];
  function sparkle(x, y, n, speed = 1, col = 'gold') {
    for (let i = 0; i < n && sparks.length < 160; i++) {
      const a = Math.random() * Math.PI * 2, v = (50 + Math.random() * 220) * speed;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 50 * speed, life: 0, max: 0.45 + Math.random() * 0.5, size: (0.6 + Math.random()) * Math.max(6, L.cs * 0.13), rot: Math.random() * 3, col });
    }
  }
  function ring(x, y, color, size = 1) { rings.push({ x, y, color, t: 0, size }); }
  function stepFx(dt) {
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.life += dt;
      if (p.life > p.max) { sparks.splice(i, 1); continue; }
      p.vx *= 1 - dt * 2; p.vy = p.vy * (1 - dt * 2) + 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 4;
    }
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].t += dt; if (rings[i].t > 0.55) rings.splice(i, 1); }
  }
  function drawFx(c) {
    c.save(); c.globalCompositeOperation = 'lighter';
    for (const r of rings) {
      const k = r.t / 0.55, rad = L.cs * r.size * (0.3 + ease.out(k) * 0.9);
      c.globalAlpha = 1 - k; c.strokeStyle = r.color; c.lineWidth = Math.max(2, L.cs * 0.1 * (1 - k));
      c.beginPath(); c.arc(r.x, r.y, rad, 0, Math.PI * 2); c.stroke();
    }
    const ds = dustSprite();
    for (const p of sparks) {
      const k = p.life / p.max, s = p.size * (1 - k * 0.6);
      c.globalAlpha = 1 - k;
      c.drawImage(ds, p.x - s * 1.6, p.y - s * 1.6, s * 3.2, s * 3.2);
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.col === 'red' ? '#ff8090' : '#fffbe0';
      starPath(c, s * 0.7, 0.22, 4); c.fill(); c.restore();
    }
    c.restore();
  }

  // ---------- Icons drawn in canvas ----------
  function icon(c, id, x, y, s, col) {
    c.save(); c.translate(x, y); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = s * 0.12; c.lineCap = 'round'; c.lineJoin = 'round';
    if (id === 'undo') {
      c.beginPath(); c.arc(s * 0.05, s * 0.05, s * 0.3, Math.PI * 1.05, Math.PI * 0.45, false); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.42, -s * 0.12); c.lineTo(-s * 0.2, s * 0.12); c.lineTo(-s * 0.06, -s * 0.18); c.closePath(); c.fill();
    } else if (id === 'hint') {
      c.beginPath(); c.arc(0, -s * 0.12, s * 0.28, Math.PI * 0.8, Math.PI * 2.2); c.lineTo(s * 0.12, s * 0.24); c.lineTo(-s * 0.12, s * 0.24); c.closePath(); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.12, s * 0.37); c.lineTo(s * 0.12, s * 0.37); c.stroke();
      for (let i = 0; i < 5; i++) { const a = -Math.PI / 2 + (i - 2) * 0.62; c.beginPath(); c.moveTo(Math.cos(a) * s * 0.42, -s * 0.12 + Math.sin(a) * s * 0.42); c.lineTo(Math.cos(a) * s * 0.54, -s * 0.12 + Math.sin(a) * s * 0.54); c.stroke(); }
    } else if (id === 'restart') {
      c.beginPath(); c.arc(0, 0, s * 0.32, -Math.PI * 0.35, Math.PI * 1.45); c.stroke();
      const a = -Math.PI * 0.35, ex = Math.cos(a) * s * 0.32, ey = Math.sin(a) * s * 0.32;
      c.beginPath(); c.moveTo(ex + s * 0.2, ey - s * 0.02); c.lineTo(ex - s * 0.06, ey - s * 0.2); c.lineTo(ex - s * 0.02, ey + s * 0.14); c.closePath(); c.fill();
    } else if (id === 'clock') {
      c.beginPath(); c.arc(0, s * 0.04, s * 0.36, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(0, s * 0.04); c.lineTo(0, -s * 0.18); c.moveTo(0, s * 0.04); c.lineTo(s * 0.16, s * 0.12); c.stroke();
      c.beginPath(); c.moveTo(-s * 0.1, -s * 0.44); c.lineTo(s * 0.1, -s * 0.44); c.stroke();
    } else if (id === 'speaker' || id === 'muted') {
      c.lineWidth = s * 0.08;
      c.beginPath(); c.moveTo(-s * 0.4, -s * 0.13); c.lineTo(-s * 0.2, -s * 0.13); c.lineTo(0, -s * 0.33); c.lineTo(0, s * 0.33); c.lineTo(-s * 0.2, s * 0.13); c.lineTo(-s * 0.4, s * 0.13); c.closePath(); c.fill();
      if (id === 'speaker') { c.beginPath(); c.arc(s * 0.02, 0, s * 0.2, -0.8, 0.8); c.stroke(); c.beginPath(); c.arc(s * 0.02, 0, s * 0.36, -0.8, 0.8); c.stroke(); }
      else { c.beginPath(); c.moveTo(s * 0.12, -s * 0.14); c.lineTo(s * 0.4, s * 0.14); c.moveTo(s * 0.4, -s * 0.14); c.lineTo(s * 0.12, s * 0.14); c.stroke(); }
    }
    c.restore();
  }

  function fmt(sec) { sec = Math.floor(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; }

  let bannerT = -9, starsShown = 0, winFlashT = -9;
  function update(dt) {
    introT += dt;
    stepFx(dt);
    for (const m of motes) { m.y -= m.v * dt; m.x += Math.sin(m.p + m.y * 6) * 0.0006; if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); } }
    if (!won) {
      time += dt;
      const s = Math.floor(time);
      if (s !== shownSec) { shownSec = s; if (s % 5 === 0) save(); }
    }
  }

  function drawButton(c, b, on, off, t) {
    Kit.glass(c, b.x, b.y, b.w, b.h, b.h / 2, { tint: on ? 'rgba(255,190,60,0.5)' : 'rgba(120,30,70,0.35)', edge: on ? 'rgba(255,240,190,0.95)' : 'rgba(255,210,140,0.45)', focus: on, glow: on ? '#ffd23f' : null, t });
    const fs = Math.round(Math.min(b.h * 0.42, b.w * 0.12));
    c.font = `700 ${fs}px ${Kit.UI}`;
    const tw = c.measureText(b.text).width, iw = fs * 1.2, x0 = b.x + (b.w - tw - iw - fs * 0.45) / 2;
    const col = on ? '#fffaf0' : off ? 'rgba(255,240,220,0.4)' : '#fff1dc';
    icon(c, b.id, x0 + iw / 2, b.y + b.h / 2, fs * 1.25, on ? '#fff6c8' : off ? 'rgba(255,220,150,0.4)' : '#ffd36a');
    c.textAlign = 'left'; c.fillStyle = col; c.fillText(b.text, x0 + iw + fs * 0.45, b.y + b.h / 2 + 1); c.textAlign = 'center';
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000;
    if (!scene) paintScene();
    if (!boardPic) paintBoard();
    c.drawImage(scene, 0, 0, W, H);
    const { bx, by, B, cs } = L, N = P.N;
    c.textAlign = 'center'; c.textBaseline = 'middle';

    // ----- Side panel: a velvet card with gold trim -----
    const cx0 = L.px - 20, cy0 = by - 6, cw = L.pw + 40, ch = B + 12;
    Kit.glass(c, cx0, cy0, cw, ch, 26, { tint: 'rgba(90,10,40,0.45)', edge: 'rgba(255,215,140,0.55)' });
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,215,140,0.25)'; roundRect(c, cx0 + 8, cy0 + 8, cw - 16, ch - 16, 20); c.stroke();

    c.drawImage(boardPic.cv, boardPic.x, boardPic.y, boardPic.w, boardPic.h);
    // Every few seconds a band of light slides across the glass.
    const sw = (t % 6.5) / 1.3;
    if (sw < 1) {
      c.save(); c.beginPath(); c.rect(bx, by, B, B); c.clip();
      const sx = bx - B * 0.5 + B * 2 * sw;
      const g = c.createLinearGradient(sx - cs, 0, sx + cs, 0);
      g.addColorStop(0, 'rgba(255,240,200,0)'); g.addColorStop(0.5, 'rgba(255,240,200,0.16)'); g.addColorStop(1, 'rgba(255,240,200,0)');
      c.globalCompositeOperation = 'lighter'; c.fillStyle = g;
      c.translate(sx, by + B / 2); c.transform(1, 0, -0.45, 1, 0, 0); c.translate(-sx, -(by + B / 2));
      c.fillRect(sx - cs, by - cs, cs * 2, B + cs * 2);
      c.restore();
    }

    // ----- Marks -----
    const size = Math.round(cs * 0.84), pic = crownPic(size), xs = Math.round(cs * 0.8), xpic = crossPic(xs);
    for (let r = 0; r < N; r++) for (let col = 0; col < N; col++) {
      const k = r * N + col, v = marks[k];
      if (!v) continue;
      const x = bx + col * cs, y = by + r * cs, age = now - pop[k];
      const s = age < 0 ? 1 : age < 0.3 ? 1 + Math.sin(age / 0.3 * Math.PI) * 0.2 : 1;
      if (v === 1) {
        const d = xs * s;
        c.drawImage(xpic, x + (cs - d) / 2, y + (cs - d) / 2, d, d);
      } else {
        let jx = 0;
        if (conflicts.has(k)) {
          const a = 0.35 + 0.25 * Math.sin(t * 9);
          c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = a;
          c.drawImage(redGlow(), x - cs * 0.2, y - cs * 0.2, cs * 1.4, cs * 1.4); c.restore();
          roundRect(c, x + cs * 0.06, y + cs * 0.06, cs * 0.88, cs * 0.88, cs * 0.14);
          c.fillStyle = 'rgba(200,10,40,0.38)'; c.fill();
          c.save(); c.shadowColor = '#ff2040'; c.shadowBlur = 14;
          c.lineWidth = Math.max(4, cs * 0.07); c.strokeStyle = `rgba(255,70,90,${0.8 + 0.2 * Math.sin(t * 9)})`; c.stroke(); c.restore();
          jx = age < 0.4 ? Math.sin(age * 60) * cs * 0.04 : 0;
        }
        const hop = won && age > 0 && age < 0.5 ? Math.sin(age / 0.5 * Math.PI) * cs * 0.28 : 0;
        // squash on landing, stretch on the hop
        const sy = won && age > 0 && age < 0.5 ? 1 + Math.sin(age / 0.5 * Math.PI) * 0.08 : age >= 0 && age < 0.12 ? 0.88 + age : 1;
        const d = size * s;
        c.drawImage(pic, x + (cs - d / sy) / 2 + jx, y + cs * 0.94 - d * sy - hop, d / sy, d * sy);
      }
    }
    // A hint's cell glows for a moment.
    if (hintCell >= 0 && now - hintT < 1.6) {
      const r = Math.floor(hintCell / N), col = hintCell % N;
      c.save(); c.globalAlpha = 1 - (now - hintT) / 1.6;
      c.shadowColor = '#fff2a0'; c.shadowBlur = 16; c.lineWidth = Math.max(4, cs * 0.08); c.strokeStyle = '#fff2a0';
      roundRect(c, bx + col * cs + 3, by + r * cs + 3, cs - 6, cs - 6, cs * 0.14); c.stroke(); c.restore();
    }
    // The remote's cursor: a glowing gold frame with jewels at the corners
    if (cursor.kind === 'cell' && !won && !Kit.touchFirst()) {
      const x = bx + cursor.c * cs, y = by + cursor.r * cs, p = 0.5 + 0.5 * Math.sin(t * 6), e = cs * 0.03 * p;
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.25 + 0.2 * p;
      c.drawImage(dustSprite(), x - cs * 0.35, y - cs * 0.35, cs * 1.7, cs * 1.7); c.restore();
      c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = 18 + 8 * p;
      c.lineWidth = Math.max(4, cs * 0.075); c.strokeStyle = goldGrad(c, x, y, x + cs, y + cs);
      roundRect(c, x - e + 2, y - e + 2, cs + e * 2 - 4, cs + e * 2 - 4, cs * 0.16); c.stroke(); c.restore();
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,230,0.9)';
      roundRect(c, x - e + 2, y - e + 2, cs + e * 2 - 4, cs + e * 2 - 4, cs * 0.16); c.stroke();
      [[x - e + 3, y - e + 3], [x + cs + e - 3, y - e + 3], [x - e + 3, y + cs + e - 3], [x + cs + e - 3, y + cs + e - 3]].forEach(([gx, gy]) => {
        c.save(); c.translate(gx, gy); c.rotate(Math.PI / 4); const g = Math.max(4, cs * 0.07);
        c.fillStyle = '#fff6c8'; c.fillRect(-g / 2, -g / 2, g, g); c.restore();
      });
    }
    // Solved: a flash of light through the window
    if (now - winFlashT < 0.7) {
      c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.45 * (1 - (now - winFlashT) / 0.7);
      c.fillStyle = '#ffe9a8'; c.fillRect(bx, by, B, B); c.restore();
    }

    // ----- Panel contents -----
    const px0 = L.px + L.pw / 2;
    const fs = Math.round(Math.max(20, Math.min(H * 0.036, 28)));
    const ty = by + fs * 1.6;
    Kit.title(c, `Level ${level}`, px0, ty, Math.round(Math.min(H * 0.072, 52, L.pw * 0.2)), { color: '#ffd23f', glow: 'rgba(255,190,60,0.8)' });
    c.font = `600 ${fs}px ${Kit.UI}`; c.fillStyle = 'rgba(255,236,210,0.85)';
    const cpic = crownPic(Math.round(fs * 1.2));
    const sub = `${N} × ${N}  ·  ${N} crowns`, sw2 = c.measureText(sub).width;
    c.fillText(sub, px0 + fs * 0.7, ty + fs * 1.75);
    c.drawImage(cpic, px0 - sw2 / 2 - fs * 0.75, ty + fs * 1.75 - fs * 0.7, fs * 1.2, fs * 1.2);
    // Timer in a little glass pill
    const tw = Math.min(L.pw * 0.78, fs * 7), th = fs * 2, tyy = ty + fs * 3.2;
    Kit.glass(c, px0 - tw / 2, tyy, tw, th, th / 2, { tint: 'rgba(30,5,20,0.45)', edge: 'rgba(255,215,140,0.5)' });
    c.font = `600 ${Math.round(fs * 1.35)}px ${Kit.FONT}`; c.fillStyle = '#fff4dc';
    const tt = fmt(time), ttw = c.measureText(tt).width;
    icon(c, 'clock', px0 - ttw / 2 - fs * 0.45, tyy + th / 2, fs * 1.15, '#ffd36a');
    c.fillText(tt, px0 + fs * 0.45, tyy + th / 2 + 2);
    const best = bestTimes[N];
    c.font = `500 ${Math.round(fs * 0.82)}px ${Kit.UI}`; c.fillStyle = 'rgba(255,230,200,0.7)';
    c.fillText(best ? `Best ${N}×${N}: ${fmt(best)}  ·  Hints ${hints}` : `Hints used: ${hints}`, px0, tyy + th + fs * 0.95, L.pw * 1.05);
    // The rules, when there is room between the timer and the buttons
    const rulesTop = tyy + th + fs * 1.5, rulesRoom = L.buttons[0].y - rulesTop;
    const rules = ['1 per row and column', '1 in every colour', 'No touching, not even corners'];
    let rf = Math.round(fs * 0.88);
    c.font = `500 ${rf}px ${Kit.UI}`;
    const widest = Math.max(...rules.map((l) => c.measureText(l).width));
    if (widest + rf * 1.7 > L.pw * 1.05) rf = Math.floor(rf * (L.pw * 1.05) / (widest + rf * 1.7));
    const rl = rf * 1.5;
    if (rulesRoom > rl * 3.1 && rf >= 14) {
      const ry = rulesTop + (rulesRoom - rl * 3) / 2 + rl / 2;
      c.font = `500 ${rf}px ${Kit.UI}`;
      const ic = crownPic(Math.round(rf * 1.3));
      const blockW = Math.max(...rules.map((l) => c.measureText(l).width)) + rf * 1.7;
      const lx = px0 - blockW / 2;
      c.textAlign = 'left'; c.fillStyle = 'rgba(255,236,210,0.8)';
      rules.forEach((line, i) => {
        c.drawImage(ic, lx, ry + i * rl - rf * 0.72, rf * 1.3, rf * 1.3);
        c.fillText(line, lx + rf * 1.7, ry + i * rl);
      });
      c.textAlign = 'center';
    }
    L.buttons.forEach((b, i) => drawButton(c, b, cursor.kind === 'btn' && cursor.i === i && !won && !Kit.touchFirst(), b.id === 'undo' && !history.length, t));

    // Gold dust drifting through the light
    c.save(); c.globalCompositeOperation = 'lighter';
    const ds = dustSprite();
    for (const m of motes) { c.globalAlpha = 0.3 + 0.3 * Math.sin(t * 1.5 + m.p); c.drawImage(ds, m.x * W - m.s, m.y * H - m.s, m.s * 2, m.s * 2); }
    c.restore();
    drawFx(c);

    // ----- How to play, sound -----
    const hf = Math.round(Math.max(20, Math.min(H * 0.031, 26)));
    const intro = introT < 8 && level <= 2 && !history.length;
    c.font = `${intro ? 700 : 500} ${hf}px ${Kit.UI}`;
    c.fillStyle = intro ? `rgba(255,226,140,${0.7 + 0.3 * Math.sin(t * 4)})` : 'rgba(255,232,215,0.78)';
    const tip = intro ? 'One crown in every row, column and colour · crowns never touch, not even corners'
      : Kit.touchFirst() ? 'Tap a cell: ✕ → crown → empty · one crown per row, column and colour'
        : 'Arrows move · OK: ✕ → crown → empty · One per row, column, colour · No touching · Back exits';
    c.fillText(tip, W / 2, H * 0.958, W * 0.95);
    const m = muteBox();
    icon(c, Kit.muted ? 'muted' : 'speaker', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.62, 'rgba(255,236,210,0.85)');

    drawBanner(c, now);
    if (won && now - wonT > 1.0) panel(c, now);
  }
  let redG = null;
  function redGlow() {
    if (redG) return redG;
    redG = document.createElement('canvas'); redG.width = redG.height = 64;
    const c = redG.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,80,90,0.9)'); g.addColorStop(0.5, 'rgba(255,30,60,0.4)'); g.addColorStop(1, 'rgba(255,30,60,0)');
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    return redG;
  }

  // Ribbon banner shape with folded tails
  function ribbon(c, cx, cy, w, h, c1, c2) {
    const tail = h * 0.7;
    c.fillStyle = shade(c2, -0.35);
    [-1, 1].forEach((s) => {
      c.beginPath();
      c.moveTo(cx + s * (w / 2 - tail * 0.6), cy - h * 0.3); c.lineTo(cx + s * (w / 2 + tail), cy - h * 0.3);
      c.lineTo(cx + s * (w / 2 + tail * 0.55), cy + h * 0.2); c.lineTo(cx + s * (w / 2 + tail), cy + h * 0.7);
      c.lineTo(cx + s * (w / 2 - tail * 0.6), cy + h * 0.7); c.closePath(); c.fill();
    });
    const g = c.createLinearGradient(0, cy - h / 2, 0, cy + h / 2);
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    c.beginPath();
    c.moveTo(cx - w / 2, cy - h / 2); c.quadraticCurveTo(cx, cy - h * 0.75, cx + w / 2, cy - h / 2);
    c.lineTo(cx + w / 2, cy + h / 2); c.quadraticCurveTo(cx, cy + h * 0.25, cx - w / 2, cy + h / 2); c.closePath();
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = goldGrad(c, 0, cy - h / 2, 0, cy + h / 2); c.stroke();
  }
  function drawBanner(c, now) {
    const k = (now - bannerT) / 1.9;
    if (k < 0 || k > 1) return;
    const W = Kit.W, H = Kit.H;
    const a = Math.min(1, k / 0.15, (1 - k) / 0.2), sc = 0.7 + 0.3 * ease.back(clamp(k / 0.25, 0, 1));
    c.save(); c.globalAlpha = a; c.translate(L.bx + L.B / 2, H * 0.46); c.scale(sc, sc);
    const w = Math.min(W * 0.5, L.B * 0.95), h = H * 0.13;
    c.fillStyle = 'rgba(20,0,10,0.45)'; c.fillRect(-W, -h, W * 2, h * 2);
    ribbon(c, 0, 0, w, h, '#b0204a', '#5c0a26');
    Kit.title(c, `LEVEL ${level}`, 0, -h * 0.06, Math.round(h * 0.5), { color: '#ffd23f', glow: 'rgba(255,190,60,0.8)' });
    c.font = `600 ${Math.round(h * 0.22)}px ${Kit.UI}`; c.fillStyle = '#fff1dc';
    c.fillText(`${P.N} × ${P.N}  ·  place ${P.N} crowns`, 0, h * 0.85);
    c.restore();
  }
  // Win panel: rays, a velvet card, a ribbon, stars popping in, the time
  let rays = null;
  function raysPic(size) {
    if (rays && rays.width === Math.ceil(size)) return rays;
    rays = document.createElement('canvas'); rays.width = rays.height = Math.ceil(size);
    const c = rays.getContext('2d'), r = size / 2;
    c.translate(r, r);
    for (let i = 0; i < 16; i++) {
      c.rotate(Math.PI / 8);
      const g = c.createLinearGradient(0, 0, r, 0);
      g.addColorStop(0, 'rgba(255,220,140,0.5)'); g.addColorStop(1, 'rgba(255,220,140,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.lineTo(r, -r * 0.09); c.lineTo(r, r * 0.09); c.closePath(); c.fill();
    }
    return rays;
  }
  function panel(c, now) {
    const W = Kit.W, H = Kit.H, t0 = wonT + 1.0, a = clamp((now - t0) / 0.4, 0, 1);
    c.fillStyle = `rgba(15,0,8,${0.62 * a})`; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.84, 580), ph = Math.min(H * 0.62, 400);
    c.save(); c.translate(W / 2, H / 2);
    const rs = Math.max(pw, ph) * 1.7;
    c.save(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 0.45 * a; c.rotate(now * 0.25);
    c.drawImage(raysPic(rs), -rs / 2, -rs / 2, rs, rs); c.restore();
    const k = ease.back(a); c.scale(k, k);
    Kit.glass(c, -pw / 2, -ph / 2, pw, ph, 30, { tint: 'rgba(120,15,50,0.55)', edge: 'rgba(255,215,140,0.85)' });
    roundRect(c, -pw / 2 + 7, -ph / 2 + 7, pw - 14, ph - 14, 25); c.fillStyle = 'rgba(30,2,14,0.6)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,215,140,0.35)'; c.stroke();
    const rbW = pw * 0.78, rbH = ph * 0.18, rbY = -ph / 2 + rbH * 0.15;
    ribbon(c, 0, rbY, rbW, rbH, '#c02a55', '#6a0c2c');
    Kit.title(c, 'SOLVED!', 0, rbY - rbH * 0.05, Math.round(rbH * 0.55), { color: '#ffd23f' });
    const stars = hints === 0 ? 3 : hints === 1 ? 2 : 1, ss = ph * 0.22;
    for (let i = 0; i < 3; i++) {
      const st = t0 + 0.35 + i * 0.22, kk = clamp((now - st) / 0.5, 0, 1), full = i < stars;
      if (full && kk > 0 && starsShown <= i) {
        starsShown = i + 1; Kit.tone(880 + i * 220, { type: 'triangle', dur: 0.2, vol: 0.12 });
        sparkle(W / 2 + (i - 1) * ss * 1.1 * k, H / 2 + (-ph * 0.1) * k, 12, 0.8);
      }
      const sz = (i === 1 ? ss * 1.18 : ss) * (full ? ease.elastic(kk) : ease.out(kk));
      if (sz > 1) c.drawImage(starPic(Math.round(ss * 1.18), full), (i - 1) * ss * 1.1 - sz / 2, -ph * 0.1 + (i === 1 ? -ss * 0.12 : 0) - sz / 2, sz, sz);
    }
    c.font = `600 ${Math.round(ph * 0.075)}px ${Kit.FONT}`; c.fillStyle = '#fff4dc';
    const line = `${fmt(time)}${hints ? `  ·  ${hints} hint${hints > 1 ? 's' : ''}` : '  ·  no hints'}`, lw = c.measureText(line).width;
    icon(c, 'clock', -lw / 2 - ph * 0.045, ph * 0.08, ph * 0.065, '#ffd36a');
    c.fillText(line, ph * 0.03, ph * 0.08);
    c.font = `500 ${Math.round(ph * 0.058)}px ${Kit.UI}`; c.fillStyle = newBest ? '#ffe27a' : 'rgba(255,230,210,0.85)';
    c.fillText(newBest ? `New best ${P.N}×${P.N} time!` : `Best ${P.N}×${P.N}: ${fmt(bestTimes[P.N] || time)}`, 0, ph * 0.18);
    const pillW = pw * 0.62, pillH = ph * 0.14, pillY = ph * 0.33, pulse = 0.5 + 0.5 * Math.sin(now * 5);
    Kit.glass(c, -pillW / 2, pillY - pillH / 2, pillW, pillH, pillH / 2, { tint: `rgba(255,190,60,${0.35 + 0.15 * pulse})`, edge: 'rgba(255,240,180,0.9)' });
    const msg = Kit.touchFirst() ? 'Tap for the next puzzle' : 'Next puzzle';
    c.font = `700 ${Math.round(pillH * 0.42)}px ${Kit.UI}`;
    const mw = c.measureText(msg).width, kw = Kit.touchFirst() ? 0 : pillH * 0.95, gx = -(mw + kw + (kw ? pillH * 0.25 : 0)) / 2;
    if (kw) {
      roundRect(c, gx, pillY - pillH * 0.32, kw, pillH * 0.64, pillH * 0.18); c.fillStyle = '#fff6d0'; c.fill();
      c.fillStyle = '#5a3200'; c.font = `800 ${Math.round(pillH * 0.34)}px ${Kit.UI}`; c.fillText('OK', gx + kw / 2, pillY + 1);
      c.font = `700 ${Math.round(pillH * 0.42)}px ${Kit.UI}`;
    }
    c.textAlign = 'left'; c.fillStyle = '#fffbe8'; c.fillText(msg, gx + kw + (kw ? pillH * 0.25 : 0), pillY + 1); c.textAlign = 'center';
    c.restore();
  }

  // ---------- Start: carry on with the saved puzzle, or make a new one ----------
  const saved = Kit.store.get('crownlogic.game', null);
  if (saved && saved.level === level && saved.P && saved.marks && saved.marks.length === saved.P.N * saved.P.N) {
    P = saved.P; marks = saved.marks; time = saved.time || 0; hints = saved.hints || 0;
    pop = new Float32Array(P.N * P.N).fill(-9); history = []; won = false;
    cursor = { kind: 'cell', r: Math.floor(P.N / 2), c: Math.floor(P.N / 2) }; lastCell = { r: cursor.r, c: cursor.c };
    findConflicts();
  } else begin(false);
  if (bannerT < 0) bannerT = performance.now() / 1000 + 0.3;
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (level > 1) Kit.record('crownlogic', level - 1);
})();
