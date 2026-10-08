// Snake Rush: steer the snake to the apples; each one makes it longer and, every few, faster. Eat
// quickly one after another for a combo; a golden star now and then is worth a lot, until it fades.
// Three ways to play: Classic (the walls stop you), No walls (go out one side, come in the other)
// and Maze (rocks in the way). Remote: arrows steer, OK pauses. Touch: swipe. Keyboard: arrows or WASD.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const MODES = [
    { id: 'classic', name: 'Classic', icon: '🧱', tip: 'The walls stop you' },
    { id: 'wrap', name: 'No walls', icon: '🌀', tip: 'Go through the edges' },
    { id: 'maze', name: 'Maze', icon: '🪨', tip: 'Rocks in the way' },
  ];
  const DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51];
  const SKIN = ['#3ddc84', '#34c977', '#2bb56b', '#34c977'];
  const BAND = '#ffd23f';

  // ---------- Records ----------
  let bests = Kit.store.get('snakerush.best', { classic: 0, wrap: 0, maze: 0 });
  let modeIx = clamp(Kit.store.get('snakerush.mode', 0), 0, MODES.length - 1);
  const topBest = () => Math.max(0, ...Object.values(bests));

  // ---------- The game ----------
  // state: 'menu' (a demo snake plays itself behind the mode cards), 'ready', 'play', 'paused', 'dying', 'over'
  let state = 'menu', demo = true, mode = MODES[modeIx].id;
  let COLS = 24, ROWS = 14;
  let body, prev, dir, queue, grow, rocks, apple, star, score, shown, bump, apples, mult, lastEat, stepT, acc;
  let angle = 0, stateT = 0, starEvery = 6, newBest = false, deathT = 0, readyT = 0, blinkT = 3, tongueT = 1.5;
  const key = (x, y) => y * COLS + x;

  function reset(m, isDemo) {
    mode = m; demo = isDemo;
    const wide = Kit.W / Math.max(1, Kit.H) > 1.1;
    COLS = wide ? 24 : 15; ROWS = wide ? 14 : 22;
    const my = Math.floor(ROWS / 2);
    body = [0, 1, 2, 3].map((i) => ({ x: 5 - i, y: my }));
    prev = body.map((p) => ({ ...p }));
    dir = DIRS.right; queue = []; grow = 0; angle = 0;
    rocks = new Set(mode === 'maze' ? mazeRocks() : []);
    score = 0; shown = 0; bump = 0; apples = 0; mult = 1; lastEat = -99; acc = 0; newBest = false;
    stepT = speedFor(0); star = null; apple = null;
    placeApple();
    layout(Kit.W, Kit.H);
  }
  function speedFor(n) { return Math.max(0.062, 0.135 - Math.floor(n / 5) * 0.008); }
  function mazeRocks() {
    const out = [], add = (x, y) => out.push(key(x, y));
    const a = Math.floor(COLS * 0.25), b = Math.ceil(COLS * 0.75) - 1, r1 = Math.floor(ROWS / 4), r2 = ROWS - 1 - r1;
    for (let x = a; x <= b; x++) { add(x, r1); add(x, r2); }
    // Corners: little L's two cells in from each corner.
    for (const [cx, cy, sx, sy] of [[1, 1, 1, 1], [COLS - 2, 1, -1, 1], [1, ROWS - 2, 1, -1], [COLS - 2, ROWS - 2, -1, -1]]) {
      add(cx, cy); add(cx + sx, cy); add(cx + 2 * sx, cy); add(cx, cy + sy); add(cx, cy + 2 * sy);
    }
    // Short posts on the far side, clear of where the snake starts.
    const my = Math.floor(ROWS / 2);
    for (let y = my - 1; y <= my + 1; y++) add(COLS - 4, y);
    return out;
  }
  const onSnake = (x, y, skipTail) => {
    const n = body.length - (skipTail ? 1 : 0);
    for (let i = 0; i < n; i++) if (body[i].x === x && body[i].y === y) return true;
    return false;
  };
  function freeCell(minDist) {
    const h = body[0];
    for (let tries = 0; tries < 400; tries++) {
      const x = Math.floor(Math.random() * COLS), y = Math.floor(Math.random() * ROWS);
      if (rocks.has(key(x, y)) || onSnake(x, y)) continue;
      if (apple && apple.x === x && apple.y === y) continue;
      if (star && star.x === x && star.y === y) continue;
      if (tries < 300 && Math.abs(x - h.x) + Math.abs(y - h.y) < minDist) continue;
      return { x, y };
    }
    return null;
  }
  function placeApple() {
    const c = freeCell(4);
    apple = c && { ...c, born: stateT };
  }

  function turn(name) {
    const d = DIRS[name];
    const last = queue.length ? queue[queue.length - 1] : dir;
    if (d === last || (d.x === -last.x && d.y === -last.y) || queue.length >= 2) return false;
    queue.push(d);
    return true;
  }

  function step() {
    prev = body.map((p) => ({ ...p }));
    if (queue.length) dir = queue.shift();
    let nx = body[0].x + dir.x, ny = body[0].y + dir.y;
    if (mode === 'wrap') { nx = (nx + COLS) % COLS; ny = (ny + ROWS) % ROWS; }
    const eatsApple = apple && apple.x === nx && apple.y === ny;
    const eatsStar = star && star.x === nx && star.y === ny;
    const growing = grow > 0 || eatsApple || eatsStar;
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || rocks.has(key(nx, ny)) || onSnake(nx, ny, !growing)) { die(); return; }
    body.unshift({ x: nx, y: ny });
    if (grow > 0) grow--; else if (!eatsApple && !eatsStar) body.pop();
    if (!demo && Math.random() < 0.5) Kit.tone(1250, { type: 'sine', dur: 0.02, vol: 0.012 });
    if (eatsApple) eat(nx, ny, false);
    if (eatsStar) eat(nx, ny, true);
  }

  function eat(x, y, isStar) {
    const px = L.bx + (x + 0.5) * L.cs, py = L.by + (y + 0.5) * L.cs;
    mult = stateT - lastEat < 4.5 ? Math.min(5, mult + 1) : 1;
    lastEat = stateT;
    if (isStar) {
      const pts = 50 * mult;
      score += pts; grow += 2; star = null;
      Kit.burst(px, py, '#ffd23f', 26, 1.2);
      if (!demo) {
        sfx.chime();
        Kit.float(`+${pts}`, px, py, { color: '#ffd23f', size: L.cs * 1.1, life: 1.2 });
        Kit.float('Golden star!', L.bx + L.bw / 2, L.by + L.bh * 0.4, { color: '#ffd23f', size: L.cs * 1.3, life: 1.3, big: true });
      }
    } else {
      const pts = 10 * mult;
      score += pts; apples++;
      Kit.burst(px, py, '#ff4d6d', 14, 0.8);
      Kit.burst(px, py, '#7ee081', 5, 0.6);
      if (!demo) {
        const f = NOTES[Math.min(NOTES.length - 1, mult - 1 + (apples % 3))];
        Kit.tone(f, { type: 'triangle', dur: 0.12, vol: 0.22, slide: 1.4 });
        Kit.tone(f * 1.5, { type: 'sine', dur: 0.1, vol: 0.08, at: 0.05 });
        Kit.noise({ dur: 0.06, vol: 0.1, freq: 3000, q: 1.2 });
        Kit.float(`+${pts}`, px, py, { color: mult > 1 ? '#ff8de3' : '#ffffff', size: L.cs * (0.8 + mult * 0.08) });
        if (mult >= 2) Kit.float(`Combo ×${mult}`, px, py - L.cs * 1.1, { color: '#ff8de3', size: L.cs * 0.7, life: 1 });
      }
      placeApple();
      if (apples % 5 === 0) {
        const t = speedFor(apples);
        if (t < stepT) {
          stepT = t;
          if (!demo) {
            Kit.noise({ dur: 0.35, vol: 0.08, freq: 500, q: 0.8, sweep: 6 });
            Kit.float('Faster!', L.bx + L.bw / 2, L.by + L.bh * 0.3, { color: '#22d3ee', size: L.cs * 1.2, life: 1.1, big: true });
          }
        }
      }
      if (apples % starEvery === 0 && !star) {
        const c = freeCell(6);
        if (c) { star = { ...c, born: stateT, life: 8 }; if (!demo) [0, 1, 2].forEach((i) => Kit.tone(NOTES[4 + i] * 2, { dur: 0.12, vol: 0.06, at: i * 0.06 })); }
      }
    }
    bump = 1;
    if (!demo && score > bests[mode]) {
      if (!newBest && bests[mode] > 0) {
        newBest = true;
        Kit.float('New best!', L.score.x, L.score.y + L.cs * 1.4, { color: '#ffd23f', size: L.cs * 0.8, life: 1.6, big: true });
      }
      bests[mode] = score; Kit.store.set('snakerush.best', bests); Kit.record('snakerush', topBest());
    }
  }

  function die() {
    prev = body.map((p) => ({ ...p }));
    acc = 0;
    if (demo) { reset(mode, true); return; }
    state = 'dying'; deathT = stateT;
    Kit.shake(14, 0.45);
    Kit.noise({ dur: 0.3, vol: 0.3, freq: 180, q: 0.8, type: 'lowpass' });
    Kit.tone(110, { type: 'sawtooth', dur: 0.35, vol: 0.12, slide: 0.5 });
    setTimeout(() => sfx.over(), 450);
    Kit.record('snakerush', topBest());
  }

  // The menu's demo snake: the shortest safe way to the apple, or failing that any safe square.
  function demoThink() {
    const h = body[0];
    const blocked = new Set(rocks);
    body.forEach((p, i) => { if (i < body.length - 1) blocked.add(key(p.x, p.y)); });
    const target = star || apple;
    if (!target) return;
    const wrapIt = (x, y) => (mode === 'wrap' ? [(x + COLS) % COLS, (y + ROWS) % ROWS] : [x, y]);
    const firstStep = new Map([[key(h.x, h.y), null]]);
    const todo = [[h.x, h.y]];
    const names = Object.keys(DIRS);
    while (todo.length) {
      const [x, y] = todo.shift();
      if (x === target.x && y === target.y) break;
      for (const n of names) {
        const [nx, ny] = wrapIt(x + DIRS[n].x, y + DIRS[n].y);
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        const k = key(nx, ny);
        if (blocked.has(k) || firstStep.has(k)) continue;
        firstStep.set(k, firstStep.get(key(x, y)) || n);
        todo.push([nx, ny]);
      }
    }
    let go = firstStep.get(key(target.x, target.y));
    if (!go) {
      go = names.find((n) => {
        const [nx, ny] = wrapIt(h.x + DIRS[n].x, h.y + DIRS[n].y);
        return nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !blocked.has(key(nx, ny)) && !(DIRS[n].x === -dir.x && DIRS[n].y === -dir.y);
      });
    }
    if (go) { queue = []; turn(go); }
  }

  function start() {
    Kit.store.set('snakerush.mode', modeIx);
    reset(MODES[modeIx].id, false);
    state = 'ready'; readyT = stateT;
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
  }
  function toMenu() {
    state = 'menu';
    reset(MODES[modeIx].id, true);
  }

  // ---------- Layout ----------
  let L = { cs: 30, bx: 0, by: 0, bw: 0, bh: 0, score: { x: 0, y: 0 } };
  const boardPic = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const top = H * (W > H ? 0.12 : 0.1);
    const cs = Math.floor(Math.min((W * 0.96) / (COLS + 1), (H - top - H * 0.03) / (ROWS + 1)));
    const bw = cs * COLS, bh = cs * ROWS;
    const bx = Math.round((W - bw) / 2), by = Math.round(top + (H - top - bh) / 2);
    L = { cs, bx, by, bw, bh, top, score: { x: bx + cs * 2.2, y: top / 2 } };
    sprites.clear();
    // The board's checker pattern changes only with the size: draw it once.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    boardPic.width = Math.ceil((bw + cs) * dpr); boardPic.height = Math.ceil((bh + cs) * dpr);
    const c = boardPic.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    const o = cs / 2;
    roundRect(c, 2, 2, bw + cs - 4, bh + cs - 4, cs * 0.6);
    c.fillStyle = 'rgba(4,20,16,0.85)'; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(120,255,190,0.35)'; c.stroke();
    c.save();
    roundRect(c, o, o, bw, bh, cs * 0.35); c.clip();
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      c.fillStyle = (x + y) % 2 ? '#123d30' : '#164a3a';
      c.fillRect(o + x * cs, o + y * cs, cs, cs);
    }
    const g = c.createRadialGradient(o + bw / 2, o + bh / 2, 0, o + bw / 2, o + bh / 2, Math.max(bw, bh) * 0.7);
    g.addColorStop(0, 'rgba(120,255,200,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = g; c.fillRect(o, o, bw, bh);
    c.restore();
  }
  Kit.onResize((W, H) => { if (body) layout(W, H); });

  // Shaded balls, apples, stars and rocks are drawn once per size and colour (gradients are slow on TV boxes).
  const sprites = new Map();
  function sprite(name, size, draw) {
    const k = name + Math.round(size);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = s.height = Math.ceil(size * dpr);
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, size);
    sprites.set(k, s);
    return s;
  }
  const ball = (color, size) => sprite('b' + color, size, (c, s) => {
    const g = c.createRadialGradient(s * 0.36, s * 0.32, s * 0.05, s / 2, s / 2, s / 2);
    g.addColorStop(0, shade(color, 0.55)); g.addColorStop(0.45, color); g.addColorStop(1, shade(color, -0.45));
    c.fillStyle = g; c.beginPath(); c.arc(s / 2, s / 2, s / 2 - 1, 0, Math.PI * 2); c.fill();
  });
  const appleSprite = (size) => sprite('apple', size, (c, s) => {
    const g = c.createRadialGradient(s * 0.38, s * 0.4, s * 0.04, s / 2, s * 0.56, s * 0.44);
    g.addColorStop(0, '#ffb3c0'); g.addColorStop(0.35, '#ff3b5c'); g.addColorStop(1, '#a3122e');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(s / 2, s * 0.3);
    c.bezierCurveTo(s * 0.85, s * 0.12, s * 1.02, s * 0.6, s * 0.72, s * 0.9);
    c.bezierCurveTo(s * 0.6, s * 0.98, s * 0.4, s * 0.98, s * 0.28, s * 0.9);
    c.bezierCurveTo(-0.02 * s, s * 0.6, s * 0.15, s * 0.12, s / 2, s * 0.3);
    c.fill();
    c.strokeStyle = '#5b3a1a'; c.lineWidth = s * 0.06; c.lineCap = 'round';
    c.beginPath(); c.moveTo(s / 2, s * 0.32); c.quadraticCurveTo(s * 0.48, s * 0.16, s * 0.56, s * 0.06); c.stroke();
    c.fillStyle = '#4cd964';
    c.beginPath(); c.ellipse(s * 0.68, s * 0.15, s * 0.14, s * 0.065, -0.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.beginPath(); c.ellipse(s * 0.34, s * 0.45, s * 0.06, s * 0.1, 0.4, 0, Math.PI * 2); c.fill();
  });
  const starSprite = (size) => sprite('star', size, (c, s) => {
    c.translate(s / 2, s / 2);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 0.2 : 0.47) * s, a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    const g = c.createLinearGradient(0, -s / 2, 0, s / 2);
    g.addColorStop(0, '#fff6c2'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#e08a00');
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.lineWidth = s * 0.05; c.strokeStyle = '#a35d00'; c.stroke();
  });
  const rockSprite = (size) => sprite('rock', size, (c, s) => {
    roundRect(c, s * 0.06, s * 0.06, s * 0.88, s * 0.88, s * 0.22);
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, '#8fa3a0'); g.addColorStop(0.5, '#5d726f'); g.addColorStop(1, '#33423f');
    c.fillStyle = g; c.fill();
    c.lineWidth = s * 0.05; c.strokeStyle = '#1e2a28'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.25)';
    roundRect(c, s * 0.18, s * 0.14, s * 0.5, s * 0.16, s * 0.08); c.fill();
    c.strokeStyle = 'rgba(20,30,28,0.5)'; c.lineWidth = s * 0.04;
    c.beginPath(); c.moveTo(s * 0.55, s * 0.5); c.lineTo(s * 0.7, s * 0.66); c.lineTo(s * 0.62, s * 0.8); c.stroke();
  });

  // ---------- Keys, swipes and taps ----------
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      const prevIx = modeIx;
      if (k === 'left' || k === 'up') modeIx = (modeIx + MODES.length - 1) % MODES.length;
      else if (k === 'right' || k === 'down') modeIx = (modeIx + 1) % MODES.length;
      else if (k === 'ok') { start(); return; }
      if (modeIx !== prevIx) { sfx.move(); reset(MODES[modeIx].id, true); }
      return;
    }
    if (state === 'over') {
      if (stateT - deathT < 1.6) return;
      if (k === 'ok') start();
      else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { sfx.move(); toMenu(); }
      return;
    }
    if (state === 'dying') return;
    if (k === 'restart') { start(); return; }
    if (k === 'ok') {
      if (state === 'paused') { state = 'play'; sfx.pick(); } else if (state === 'play') { state = 'paused'; sfx.move(); }
      return;
    }
    if (DIRS[k]) {
      if (state === 'paused') state = 'play';
      if (turn(k) && state === 'ready') state = 'play';
    }
  });

  let swipe = null;
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const cardAt = (x, y) => (L.cards || []).findIndex((r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h);
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = cardAt(e.x, e.y);
        if (i >= 0) { if (i === modeIx) start(); else { modeIx = i; sfx.move(); reset(MODES[i].id, true); } }
        return;
      }
      if (state === 'over') {
        if (stateT - deathT < 1.6) return;
        const b = L.menuBtn;
        if (b && e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h) toMenu(); else start();
        return;
      }
      swipe = { x: e.x, y: e.y, moved: false };
    },
    move(e) {
      if (!swipe) return;
      const dx = e.x - swipe.x, dy = e.y - swipe.y;
      if (Math.hypot(dx, dy) < 26) return;
      const name = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (state === 'paused') state = 'play';
      if (turn(name) && state === 'ready') state = 'play';
      swipe = { x: e.x, y: e.y, moved: true };
    },
    up() {
      if (swipe && !swipe.moved && (state === 'play' || state === 'paused')) state = state === 'play' ? 'paused' : 'play';
      swipe = null;
    },
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') state = 'paused'; });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!body) { reset(mode, true); }
    shown += (score - shown) * Math.min(1, dt * 10);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    blinkT -= dt; if (blinkT < -0.15) blinkT = 2 + Math.random() * 3;
    tongueT -= dt; if (tongueT < -0.35) tongueT = 1.5 + Math.random() * 2.5;
    if (star && stateT - star.born > star.life) { star = null; }
    if (state === 'ready' && stateT - readyT > 2.2) state = 'play';
    if (state === 'dying' && stateT - deathT > 1.1) state = 'over';
    if (state === 'play' || state === 'menu') {
      acc += dt;
      let guard = 0;
      while (acc >= stepT && guard++ < 3 && (state === 'play' || state === 'menu')) {
        if (state === 'menu') demoThink();
        acc -= stepT;
        step();
      }
    }
    const want = Math.atan2(dir.y, dir.x);
    let d = want - angle;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    angle += d * Math.min(1, dt * 18);
  }

  // ---------- Drawing ----------
  function cellXY(x, y) { return [L.bx + (x + 0.5) * L.cs, L.by + (y + 0.5) * L.cs]; }
  function drawSnake(c, t) {
    const cs = L.cs;
    const p = state === 'play' || state === 'menu' ? clamp(acc / stepT, 0, 1) : (state === 'ready' ? 0 : 1);
    const pts = body.map((b, i) => {
      const a = prev[i] || b;
      if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) > 1) return cellXY(b.x, b.y);
      return cellXY(lerp(a.x, b.x, p), lerp(a.y, b.y, p));
    });
    const dying = state === 'dying' || state === 'over';
    const deadAge = stateT - deathT;
    // Tail to head: shaded balls along the body, with one between each pair so it reads as one smooth body.
    const size = cs * 0.9;
    for (let i = pts.length - 1; i >= 1; i--) {
      const [x, y] = pts[i], [hx, hy] = pts[i - 1];
      const taper = 1 - Math.min(0.35, (i / Math.max(8, pts.length)) * 0.35);
      let color = i % 6 === 3 ? BAND : SKIN[i % SKIN.length];
      if (dying && deadAge * 30 > i) color = '#6e7a76';
      const s = size * taper;
      const img = ball(color, s);
      c.drawImage(img, x - s / 2, y - s / 2, s, s);
      if (Math.abs(x - hx) + Math.abs(y - hy) <= cs * 1.5) {
        const mimg = ball(color, s);
        c.drawImage(mimg, (x + hx) / 2 - s / 2, (y + hy) / 2 - s / 2, s, s);
      }
    }
    // Head
    const [hx, hy] = pts[0];
    const hs = cs * 1.08;
    c.save();
    c.translate(hx, hy);
    if (dying) c.translate(Math.sin(deadAge * 50) * cs * 0.06 * Math.max(0, 1 - deadAge * 2), 0);
    c.rotate(angle);
    // Tongue: a quick forked flick.
    if (!dying && tongueT < 0 && tongueT > -0.35) {
      const k = Math.sin((-tongueT / 0.35) * Math.PI);
      c.strokeStyle = '#ff3b5c'; c.lineWidth = cs * 0.07; c.lineCap = 'round';
      const L1 = hs * 0.45 + k * cs * 0.45;
      c.beginPath(); c.moveTo(hs * 0.4, 0); c.lineTo(L1, 0);
      c.lineTo(L1 + cs * 0.14, -cs * 0.09); c.moveTo(L1, 0); c.lineTo(L1 + cs * 0.14, cs * 0.09); c.stroke();
    }
    c.drawImage(ball(dying ? '#7d8a86' : '#45e892', hs), -hs / 2, -hs / 2, hs, hs);
    // Eyes look toward the food.
    const tgt = star || apple;
    let lx = 0, ly = 0;
    if (tgt && !dying) {
      const [fx, fy] = cellXY(tgt.x, tgt.y);
      const la = Math.atan2(fy - hy, fx - hx) - angle;
      lx = Math.cos(la) * cs * 0.06; ly = Math.sin(la) * cs * 0.06;
    }
    for (const sy of [-1, 1]) {
      const ex = hs * 0.14, ey = sy * hs * 0.24, er = hs * 0.17;
      c.fillStyle = '#fff';
      c.beginPath();
      if (blinkT < 0 && !dying) c.ellipse(ex, ey, er, er * 0.18, 0, 0, Math.PI * 2); else c.arc(ex, ey, er, 0, Math.PI * 2);
      c.fill();
      if (dying) {
        c.strokeStyle = '#222'; c.lineWidth = cs * 0.05;
        c.beginPath(); c.moveTo(ex - er * 0.5, ey - er * 0.5); c.lineTo(ex + er * 0.5, ey + er * 0.5);
        c.moveTo(ex + er * 0.5, ey - er * 0.5); c.lineTo(ex - er * 0.5, ey + er * 0.5); c.stroke();
      } else if (blinkT >= 0) {
        c.fillStyle = '#10221c';
        c.beginPath(); c.arc(ex + lx + er * 0.15, ey + ly, er * 0.55, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#fff';
        c.beginPath(); c.arc(ex + lx + er * 0.3, ey + ly - er * 0.2, er * 0.18, 0, Math.PI * 2); c.fill();
      }
    }
    // Cheeks
    c.fillStyle = 'rgba(255,120,150,0.35)';
    for (const sy of [-1, 1]) { c.beginPath(); c.arc(hs * 0.3, sy * hs * 0.36, hs * 0.08, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }

  function drawFood(c, t) {
    const cs = L.cs;
    if (apple) {
      const [x, y] = cellXY(apple.x, apple.y);
      const born = clamp((stateT - apple.born) / 0.4, 0, 1);
      const s = cs * 1.05 * ease.back(born) * (1 + Math.sin(t * 5) * 0.05);
      c.globalAlpha = 0.35;
      const g = c.createRadialGradient(x, y, 0, x, y, cs * 0.9);
      g.addColorStop(0, '#ff4d6d'); g.addColorStop(1, 'rgba(255,77,109,0)');
      c.fillStyle = g; c.fillRect(x - cs, y - cs, cs * 2, cs * 2);
      c.globalAlpha = 1;
      if (s > 1) c.drawImage(appleSprite(cs * 1.05), x - s / 2, y - s / 2 - Math.sin(t * 4) * cs * 0.04, s, s);
    }
    if (star) {
      const [x, y] = cellXY(star.x, star.y);
      const age = stateT - star.born, left = 1 - age / star.life;
      const born = clamp(age / 0.4, 0, 1);
      // Fading out: it blinks for its last two seconds.
      if (left < 0.25 && Math.sin(t * 22) < 0) return;
      const s = cs * 1.15 * ease.back(born) * (1 + Math.sin(t * 7) * 0.08);
      c.globalAlpha = 0.45;
      const g = c.createRadialGradient(x, y, 0, x, y, cs * 1.2);
      g.addColorStop(0, '#ffd23f'); g.addColorStop(1, 'rgba(255,210,63,0)');
      c.fillStyle = g; c.fillRect(x - cs * 1.2, y - cs * 1.2, cs * 2.4, cs * 2.4);
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(255,230,120,0.9)'; c.lineWidth = cs * 0.08; c.lineCap = 'round';
      c.beginPath(); c.arc(x, y, cs * 0.72, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * left); c.stroke();
      c.save(); c.translate(x, y); c.rotate(Math.sin(t * 2) * 0.3);
      if (s > 1) c.drawImage(starSprite(cs * 1.15), -s / 2, -s / 2, s, s);
      c.restore();
    }
  }

  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom) {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(4,24,18,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#1f7a5c'); g.addColorStop(1, '#0c3a2d');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    Kit.background(c, t, '#0f3b2e', '#04130f', 'rgba(80,255,170,0.08)');
    if (!body) return;
    c.drawImage(boardPic, L.bx - cs / 2, L.by - cs / 2, L.bw + cs, L.bh + cs);
    for (const k of rocks) {
      const x = k % COLS, y = Math.floor(k / COLS);
      c.drawImage(rockSprite(cs), L.bx + x * cs, L.by + y * cs, cs, cs);
    }
    drawFood(c, t);
    drawSnake(c, t);
    if (mode === 'wrap') {
      // Dashed edges say "you can go through".
      c.save(); c.setLineDash([cs * 0.3, cs * 0.3]); c.lineDashOffset = -t * cs;
      c.strokeStyle = 'rgba(120,220,255,0.55)'; c.lineWidth = 2;
      c.strokeRect(L.bx, L.by, L.bw, L.bh); c.restore();
    }

    // Top bar: score with combo, mode, apples and best.
    const ty = L.top / 2, hsz = Math.min(L.top * 0.5, cs * 1.2);
    if (state !== 'menu') {
      c.save();
      c.translate(L.bx + hsz * 1.2, ty); c.scale(1 + bump * 0.2, 1 + bump * 0.2);
      outlined(c, String(Math.round(shown)), 0, 0, hsz, '#fff6c2', '#ffb703');
      c.restore();
      const comboLeft = 1 - (stateT - lastEat) / 4.5;
      if (mult >= 2 && comboLeft > 0 && state !== 'over' && state !== 'dying') {
        const x0 = L.bx + hsz * 2.5;
        text(c, `×${mult}`, x0, ty - hsz * 0.12, hsz * 0.6, '#ff8de3', 900, 'left');
        c.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(c, x0, ty + hsz * 0.26, hsz * 1.4, hsz * 0.12, hsz * 0.06); c.fill();
        c.fillStyle = '#ff8de3'; roundRect(c, x0, ty + hsz * 0.26, hsz * 1.4 * comboLeft, hsz * 0.12, hsz * 0.06); c.fill();
      }
      const m = MODES.find((q) => q.id === mode);
      text(c, `${m.icon} ${m.name}`, W / 2, ty, hsz * 0.48, 'rgba(255,255,255,0.75)', 700);
      text(c, `🍎 ${apples}    👑 ${Math.max(bests[mode], score)}`, L.bx + L.bw - 60, ty, hsz * 0.45, 'rgba(255,255,255,0.85)', 800, 'right');
    }

    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'menu') drawMenu(c, t);
    if (state === 'ready') {
      const k = stateT - readyT;
      c.fillStyle = 'rgba(2,14,10,0.35)'; c.fillRect(L.bx, L.by, L.bw, L.bh);
      outlined(c, k < 1.2 ? 'Get ready' : 'Go!', W / 2, L.by + L.bh * 0.32, cs * 1.6 * ease.back(clamp((k % 1.2) / 0.3, 0, 1)), '#ffffff', '#3ddc84');
      text(c, Kit.touchFirst() ? 'Swipe to steer' : 'Arrows steer  ·  OK pauses  ·  Back for games', W / 2, L.by + L.bh * 0.68, cs * 0.6, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'paused') {
      c.fillStyle = 'rgba(2,14,10,0.6)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.42, cs * 1.8, '#ffffff', '#9ff0c8');
      text(c, Kit.touchFirst() ? 'Tap or swipe to carry on' : 'OK or an arrow to carry on  ·  Back for games', W / 2, H * 0.56, cs * 0.65, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'over') drawOver(c);
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    c.fillStyle = 'rgba(2,14,10,0.55)'; c.fillRect(0, 0, W, H);
    const wide = W > H;
    const cw = wide ? Math.min(W * 0.24, cs * 7.5) : Math.min(W * 0.8, cs * 11), ch = wide ? cw * 0.72 : Math.min(H * 0.17, cw * 0.36);
    const gap = cs * 0.8;
    const total = wide ? cw * 3 + gap * 2 : ch * 3 + gap * 2;
    const x0 = wide ? (W - total) / 2 : (W - cw) / 2, y0 = wide ? H * 0.5 - ch / 2 : H * 0.53 - total / 2;
    L.cards = MODES.map((m, i) => ({ x: wide ? x0 + i * (cw + gap) : x0, y: wide ? y0 : y0 + i * (ch + gap), w: cw, h: ch }));
    outlined(c, 'SNAKE RUSH', W / 2, L.top / 2, Math.min(L.top * 0.5, cs * 1.2) * 0.95, '#d9ffe9', '#3ddc84');
    text(c, Kit.touchFirst() ? 'Tap a way to play' : '◀ ▶ choose  ·  OK play  ·  Back for games', W / 2, (wide ? y0 : y0) - cs * 1.2, cs * 0.62, 'rgba(255,255,255,0.85)', 700);
    MODES.forEach((m, i) => {
      const r = L.cards[i], on = i === modeIx;
      const k = on ? 1.06 + Math.sin(t * 5) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, cs * 0.5, on ? '#ffd23f' : 'rgba(150,255,200,0.3)');
      if (on) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,210,63,0.55)'; c.stroke(); }
      if (wide) {
        text(c, m.icon, 0, -r.h * 0.24, r.h * 0.26, '#fff', 400);
        text(c, m.name, 0, r.h * 0.04, r.h * 0.15, '#ffffff', 900);
        text(c, m.tip, 0, r.h * 0.2, r.h * 0.085, 'rgba(255,255,255,0.75)', 600);
        text(c, `👑 ${bests[m.id]}`, 0, r.h * 0.36, r.h * 0.1, '#ffd23f', 800);
      } else {
        text(c, m.icon, -r.w * 0.36, 0, r.h * 0.42, '#fff', 400);
        text(c, m.name, -r.w * 0.2, -r.h * 0.14, r.h * 0.26, '#ffffff', 900, 'left');
        text(c, m.tip, -r.w * 0.2, r.h * 0.2, r.h * 0.16, 'rgba(255,255,255,0.75)', 600, 'left');
        text(c, `👑 ${bests[m.id]}`, r.w * 0.44, 0, r.h * 0.2, '#ffd23f', 800, 'right');
      }
      c.restore();
    });
    const tipY = wide ? y0 + ch + cs * 1.6 : y0 + total + cs * 1.2;
    const tips = ['🍎 makes you longer and faster', '⭐ is worth 50 before it fades', 'eat fast for a combo'];
    if (wide) text(c, tips.join('  ·  '), W / 2, tipY, cs * 0.5, 'rgba(255,255,255,0.7)', 600);
    else tips.forEach((tx, i) => text(c, tx, W / 2, tipY + i * cs * 0.75, cs * 0.5, 'rgba(255,255,255,0.7)', 600));
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    const a = clamp((stateT - deathT - 1.1) / 0.4, 0, 1);
    c.fillStyle = `rgba(2,14,10,${0.7 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, cs * 13), ph = cs * 8.6;
    panel(c, -pw / 2, -ph / 2, pw, ph, cs * 0.7, '#ffd23f');
    outlined(c, 'Ouch!', 0, -ph * 0.34, cs * 1.25, '#ffffff', '#9ff0c8');
    outlined(c, String(score), 0, -ph * 0.1, cs * 1.8, '#fff6c2', '#ffb703');
    text(c, newBest ? '🎉 New best score!' : `👑 Best ${bests[mode]}`, 0, ph * 0.08, cs * 0.6, '#ffffff', 800);
    text(c, `🍎 ${apples} apples  ·  ${body.length} long`, 0, ph * 0.2, cs * 0.5, 'rgba(255,255,255,0.75)', 700);
    const ready = stateT - deathT > 1.6;
    c.globalAlpha = ready ? 1 : 0.4;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.3, cs * 0.6, '#9ff0ff', 800);
    const bw = cs * 6, bh = cs * 0.9;
    roundRect(c, -bw / 2, ph * 0.36, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Other ways to play' : 'Arrows  other ways to play', 0, ph * 0.36 + bh / 2, cs * 0.42, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.36 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  reset(mode, true);
  Kit.canvas.focus();
  if (topBest() > 0) Kit.record('snakerush', topBest());
})();
