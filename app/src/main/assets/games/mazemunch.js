// Maze Munch: a modern remake of Maze Muncher. Gobble every dot in the neon maze while four ghosts
// hunt you, each in its own way; a power orb turns them blue for a while so you can munch them too.
// Fruit pops up for a bonus, every level is a little faster. Four skill choices on the start screen
// (Beginner, Normal, Hard, Professional), the last one is remembered. Remote: ◀ ▶ pick the skill, OK plays;
// in the game arrows steer (a turn waits for the next opening), OK pauses. Touch: swipe to steer, tap to pause. Keyboard: arrows/WASD.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp } = Kit;

  // ---------- The maze: # wall, . dot, o power orb, P start, G ghosts' home, - its door ----------
  const MAZE = [
    '###################',
    '#o.......#.......o#',
    '#.##.###.#.###.##.#',
    '#.................#',
    '#.##.#.#####.#.##.#',
    '#....#...#...#....#',
    '####.### # ###.####',
    '   #.#       #.#   ',
    '####.# ##-## #.####',
    '    .  #GGG#  .    ',
    '####.# ##### #.####',
    '   #.#       #.#   ',
    '####.# ##### #.####',
    '#........#........#',
    '#.##.###.#.###.##.#',
    '#o.#.....P.....#.o#',
    '##.#.#.#####.#.#.##',
    '#....#...#...#....#',
    '#.######.#.######.#',
    '#.................#',
    '###################',
  ];
  const MW = MAZE[0].length, MH = MAZE.length;
  const OPEN = 0, WALL = 1, DOOR = 2, HOUSE = 3;
  const type = new Uint8Array(MW * MH);
  const baseDots = new Uint8Array(MW * MH);
  const houseCells = [];
  let START = { x: 9, y: 15 }, DOORC = { x: 9, y: 8 };
  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const ch = MAZE[y][x], i = y * MW + x;
    type[i] = ch === '#' ? WALL : ch === '-' ? DOOR : ch === 'G' ? HOUSE : OPEN;
    baseDots[i] = ch === '.' ? 1 : ch === 'o' ? 2 : 0;
    if (ch === 'P') START = { x, y };
    if (ch === 'G') houseCells.push({ x, y });
    if (ch === '-') DOORC = { x, y };
  }
  const wrap = (x) => ((x % MW) + MW) % MW;
  // Cells the muncher can never reach (outside the maze walls) are drawn as wall.
  {
    const seen = new Uint8Array(MW * MH), todo = [START];
    seen[START.y * MW + START.x] = 1;
    while (todo.length) {
      const p = todo.pop();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = wrap(p.x + dx), ny = p.y + dy;
        if (ny < 0 || ny >= MH) continue;
        const j = ny * MW + nx;
        if (!seen[j] && type[j] === OPEN) { seen[j] = 1; todo.push({ x: nx, y: ny }); }
      }
    }
    for (let i = 0; i < MW * MH; i++) if (type[i] === OPEN && !seen[i]) { type[i] = WALL; baseDots[i] = 0; }
  }
  const HOME = houseCells[1] || { x: 9, y: 9 };
  const EXIT = { x: DOORC.x, y: DOORC.y - 1 };
  const FRUIT_AT = { x: 9, y: 11 };
  const open = (x, y) => y >= 0 && y < MH && type[y * MW + wrap(x)] === OPEN;
  const canGo = (e, d) => open(e.x + d.x, e.y + d.y);
  // Ghosts find their way home (and out again) with these distance maps through the door.
  function distMap(t) {
    const d = new Int16Array(MW * MH).fill(-1), todo = [t];
    d[t.y * MW + t.x] = 0;
    for (let k = 0; k < todo.length; k++) {
      const p = todo[k];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = wrap(p.x + dx), ny = p.y + dy;
        if (ny < 0 || ny >= MH) continue;
        const j = ny * MW + nx;
        if (d[j] < 0 && type[j] !== WALL) { d[j] = d[p.y * MW + p.x] + 1; todo.push({ x: nx, y: ny }); }
      }
    }
    return d;
  }
  const homeMap = distMap(HOME), exitMap = distMap(EXIT);

  const D = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const NONE = { x: 0, y: 0 };
  const ORDER = [D.up, D.left, D.down, D.right];
  const isZero = (d) => !d.x && !d.y;
  const opposite = (a, b) => a.x === -b.x && a.y === -b.y && !isZero(a);

  const GHOSTS = [
    { name: 'Blaze', color: '#ff4d5e', style: 'chases you down' },
    { name: 'Lulu', color: '#ff7ad9', style: 'cuts you off ahead' },
    { name: 'Jinx', color: '#34e3a4', style: 'sneaks round the side' },
    { name: 'Pip', color: '#ffa53a', style: 'shy, runs when close' },
  ];
  const CORNERS = [{ x: MW - 2, y: -2 }, { x: 1, y: -2 }, { x: MW - 2, y: MH + 1 }, { x: 1, y: MH + 1 }];
  const PHASES = [7, 20, 7, 20, 5, 20, 5]; // scatter, chase, scatter... then chase for good
  const FRUITS = [['cherry', 100], ['berry', 300], ['orange', 500], ['apple', 700], ['melon', 1000], ['grapes', 2000]];
  const fruitFor = (lv) => FRUITS[Math.min(lv - 1, FRUITS.length - 1)];
  const SCARED = '#3d5afe';

  // ---------- Skill choices ----------
  // lives; player speed (start, per level); ghost speed as a share of the player's (start, per level, top);
  // power time (start, less per level, least); ghosts leave home later (release ×); wander = chance a hunting
  // ghost takes a random turn; scatter × = how long ghosts drift to their corners.
  const DIFFS = [
    { id: 'beginner', name: 'Beginner', tip: 'Slow ghosts  ·  5 lives  ·  long power time',
      lives: 5, ps: 6.4, pStep: 0.2, gs: 0.6, gStep: 0.015, gTop: 0.72, fr: 11, frStep: 0.5, frMin: 6, release: 2, wander: 0.45, scatter: 1.6 },
    { id: 'normal', name: 'Normal', tip: 'The classic chase  ·  3 lives',
      lives: 3, ps: 7.2, pStep: 0.45, gs: 0.86, gStep: 0.025, gTop: 0.97, fr: 7, frStep: 0.8, frMin: 2, release: 1, wander: 0, scatter: 1 },
    { id: 'hard', name: 'Hard', tip: 'Faster, smarter ghosts  ·  short power time',
      lives: 3, ps: 7.6, pStep: 0.45, gs: 0.93, gStep: 0.02, gTop: 1, fr: 5, frStep: 0.7, frMin: 1.5, release: 0.6, wander: 0, scatter: 0.7 },
    { id: 'pro', name: 'Professional', tip: 'Ghosts as fast as you  ·  2 lives',
      lives: 2, ps: 8, pStep: 0.4, gs: 1, gStep: 0.01, gTop: 1.05, fr: 3.5, frStep: 0.5, frMin: 1, release: 0.35, wander: 0, scatter: 0.5 },
  ];
  let diffIx = clamp(Kit.store.get('mazemunch.skill', 0) | 0, 0, DIFFS.length - 1);
  let diff = DIFFS[diffIx];
  // Best score per skill; the old single best was played on today's Normal.
  const bests = Object.assign({ beginner: 0, normal: Kit.store.get('mazemunch.best', 0), hard: 0, pro: 0 },
    Kit.store.get('mazemunch.bests', {}) || {});
  const topBest = () => Math.max(...DIFFS.map((d) => bests[d.id] || 0));

  // ---------- State ----------
  // state: 'menu' (a demo plays itself behind the title), 'ready', 'play', 'paused', 'dying', 'clear', 'over'
  let state = 'menu', demo = true;
  let best = bests[diff.id] || 0, bestDirty = false, bestFlushT = 0, startBest = 0;
  let score = 0, shown = 0, bump = 0, lives = 3, level = 1, extraGiven = false, newBest = false, ghostsEaten = 0;
  let dots = new Uint8Array(MW * MH), dotsLeft = 0, eaten = 0, fruit = null, fruitsShown = 0;
  let player, ghosts = [], frightT = 0, frightMax = 1, phaseIx = 0, phaseT = 0, freezeT = 0, combo = 0;
  let stateT = 0, readyT = 0, deathT = 0, clearT = 0, overT = 0, wakaFlip = false, turnK = 0;

  const playerSpeed = () => Math.min(10.5, diff.ps + (level - 1) * diff.pStep);
  const ghostRatio = () => Math.min(diff.gTop, diff.gs + (level - 1) * diff.gStep);
  const frightFor = () => Math.max(diff.frMin, diff.fr - (level - 1) * diff.frStep);
  const phaseLen = (i) => PHASES[i] * (i % 2 === 0 ? diff.scatter : 1);
  function pickDiff(i) {
    diffIx = (i + DIFFS.length) % DIFFS.length; diff = DIFFS[diffIx];
    best = bests[diff.id] || 0;
    Kit.store.set('mazemunch.skill', diffIx);
  }

  function loadLevel() {
    dots = baseDots.slice();
    dotsLeft = 0;
    for (let i = 0; i < dots.length; i++) if (dots[i]) dotsLeft++;
    eaten = 0; fruit = null; fruitsShown = 0;
    resetPositions();
  }
  function resetPositions() {
    player = { x: START.x, y: START.y, dir: NONE, want: D.left, face: D.left, t: 0, chomp: 0.3 };
    const k = Math.max(0.35, 1 - (level - 1) * 0.15);
    const spots = [EXIT, houseCells[1], houseCells[0], houseCells[2]];
    const release = [0, 1.5, 4.5, 8];
    ghosts = GHOSTS.map((g, id) => ({
      id, x: spots[id].x, y: spots[id].y, t: 0, dir: id === 0 ? D.left : NONE,
      mode: id === 0 ? 'normal' : 'house', release: release[id] * k * diff.release, scared: false,
    }));
    frightT = 0; phaseIx = 0; phaseT = 0; freezeT = 0; combo = 0;
  }

  // ---------- Moving along the grid ----------
  // Each mover sits on a cell (x, y) and is t of the way to the next one along dir.
  function advance(e, dist, choose, arrive) {
    for (let guard = 0; guard < 10 && dist > 1e-6; guard++) {
      if (isZero(e.dir)) { choose(e); if (isZero(e.dir)) return; }
      const rem = 1 - e.t;
      if (dist < rem) { e.t += dist; return; }
      dist -= rem;
      e.x = wrap(e.x + e.dir.x); e.y += e.dir.y; e.t = 0;
      if (arrive && arrive(e)) return;
      choose(e);
    }
  }
  function reverse(e) {
    if (isZero(e.dir)) return;
    if (e.t > 0) { e.x = wrap(e.x + e.dir.x); e.y += e.dir.y; e.t = 1 - e.t; }
    e.dir = { x: -e.dir.x, y: -e.dir.y };
  }
  const posOf = (e) => [e.x + e.dir.x * e.t, e.y + e.dir.y * e.t];

  function playerChoose(p) {
    if (p.want && canGo(p, p.want)) p.dir = p.want;
    else if (!isZero(p.dir) && !canGo(p, p.dir)) p.dir = NONE;
    if (!isZero(p.dir) && p.dir !== p.face) { p.face = p.dir; turnK = 1; }
  }
  // The menu's demo muncher: the shortest way to the nearest dot, keeping clear of ghosts.
  function demoChoose(p) {
    const blocked = new Uint8Array(MW * MH);
    for (const g of ghosts) {
      if (g.scared || g.mode !== 'normal') continue;
      blocked[g.y * MW + g.x] = 1;
      if (open(g.x + g.dir.x, g.y + g.dir.y)) blocked[(g.y + g.dir.y) * MW + wrap(g.x + g.dir.x)] = 1;
    }
    const first = new Int8Array(MW * MH).fill(-1), todo = [p.y * MW + p.x];
    first[todo[0]] = 9;
    let found = -1;
    for (let k = 0; k < todo.length && found < 0; k++) {
      const i = todo[k], x = i % MW, y = (i / MW) | 0;
      for (let o = 0; o < 4; o++) {
        const d = ORDER[o];
        if (!open(x + d.x, y + d.y)) continue;
        const j = (y + d.y) * MW + wrap(x + d.x);
        if (first[j] !== -1 || blocked[j]) continue;
        first[j] = first[i] === 9 ? o : first[i];
        if (dots[j]) { found = j; break; }
        todo.push(j);
      }
    }
    if (found >= 0) p.want = ORDER[first[found]];
    else p.want = ORDER.find((d) => canGo(p, d) && !opposite(d, p.dir)) || ORDER.find((d) => canGo(p, d)) || NONE;
    playerChoose(p);
  }
  function setWant(d) {
    const p = player;
    p.want = d;
    if (state !== 'play') return;
    if (opposite(d, p.dir)) { reverse(p); p.face = d; return; }
    // A turn pressed just after passing an opening still counts.
    if (!isZero(p.dir) && p.t > 0 && p.t < 0.18 && d.x * p.dir.x + d.y * p.dir.y === 0 && canGo(p, d)) {
      p.t = 0; p.dir = d; p.face = d; turnK = 1;
    }
  }

  function ghostTarget(g) {
    const p = player, f = player.face;
    if (phaseIx < PHASES.length && phaseIx % 2 === 0) return CORNERS[g.id];
    if (g.id === 0) return p;
    if (g.id === 1) return { x: p.x + f.x * 4, y: p.y + f.y * 4 };
    if (g.id === 2) {
      const a = { x: p.x + f.x * 2, y: p.y + f.y * 2 }, b = ghosts[0];
      return { x: a.x * 2 - b.x, y: a.y * 2 - b.y };
    }
    return (g.x - p.x) ** 2 + (g.y - p.y) ** 2 > 64 ? p : CORNERS[3];
  }
  function downhill(map, g) {
    const here = map[g.y * MW + g.x];
    for (const d of ORDER) {
      const nx = wrap(g.x + d.x), ny = g.y + d.y;
      if (ny < 0 || ny >= MH) continue;
      const v = map[ny * MW + nx];
      if (v >= 0 && v < here) return d;
    }
    return NONE;
  }
  function ghostChoose(g) {
    if (g.mode === 'eyes') {
      if (g.x === HOME.x && g.y === HOME.y) { g.mode = 'leave'; g.scared = false; }
      else { g.dir = downhill(homeMap, g); return; }
    }
    if (g.mode === 'leave') {
      if (g.x === EXIT.x && g.y === EXIT.y) { g.mode = 'normal'; g.dir = Math.random() < 0.5 ? D.left : D.right; return; }
      g.dir = downhill(exitMap, g); return;
    }
    const opts = ORDER.filter((d) => !opposite(d, g.dir) && canGo(g, d));
    if (!opts.length) { g.dir = ORDER.find((d) => canGo(g, d)) || NONE; return; }
    if (g.scared || (diff.wander && !demo && Math.random() < diff.wander)) { g.dir = opts[(Math.random() * opts.length) | 0]; return; }
    const tg = ghostTarget(g);
    let bestD = Infinity;
    for (const d of opts) {
      const v = (g.x + d.x - tg.x) ** 2 + (g.y + d.y - tg.y) ** 2;
      if (v < bestD) { bestD = v; g.dir = d; }
    }
  }
  function ghostSpeed(g) {
    if (g.mode === 'eyes') return 16;
    let s = playerSpeed() * (g.scared ? 0.55 : ghostRatio());
    if (g.mode === 'leave') s *= 0.7;
    if (g.y === 9 && (g.x <= 3 || g.x >= MW - 4)) s *= 0.55;
    return s;
  }

  // ---------- Scoring ----------
  const cellXY = (x, y) => [L.mx + (x + 0.5) * L.cs, L.my + (y + 0.5) * L.cs];
  function addScore(n) {
    if (demo) return;
    score += n; bump = 1;
    if (!extraGiven && score >= 10000) {
      extraGiven = true; lives++;
      [0, 1, 2, 3, 4].forEach((i) => Kit.tone(880 * Math.pow(1.122, i), { type: 'sine', dur: 0.15, vol: 0.12, at: i * 0.07 }));
      Kit.float('Extra life!', L.mx + L.mw / 2, L.my + L.mh * 0.35, { color: '#ffd23f', size: L.cs * 1.2, life: 1.4, big: true });
    }
    if (score > best) {
      if (!newBest && startBest > 0) {
        newBest = true;
        Kit.float('New best!', L.mx + L.mw / 2, L.my + L.mh * 0.62, { color: '#ffd23f', size: L.cs * 1.1, life: 1.5, big: true });
      }
      best = score; bestDirty = true;
    }
  }
  function flushBest() {
    if (!bestDirty) return;
    bestDirty = false;
    bests[diff.id] = best;
    Kit.store.set('mazemunch.bests', bests);
    Kit.record('mazemunch', topBest());
  }

  function playerArrive(p) {
    const i = p.y * MW + p.x, d = dots[i];
    if (!d) return false;
    dots[i] = 0; dotsLeft--; eaten++;
    const [sx, sy] = cellXY(p.x, p.y);
    if (d === 1) {
      addScore(10);
      if (!demo) {
        wakaFlip = !wakaFlip;
        Kit.tone(wakaFlip ? 330 : 470, { type: 'triangle', dur: 0.075, vol: 0.12, slide: wakaFlip ? 1.5 : 0.65 });
      }
    } else {
      addScore(50);
      frightMax = frightFor(); frightT = frightMax; combo = 0;
      for (const g of ghosts) if (g.mode !== 'eyes') { g.scared = true; if (g.mode === 'normal') reverse(g); }
      Kit.burst(sx, sy, '#ff7ab8', 22, 1);
      if (!demo) {
        Kit.tone(180, { type: 'sawtooth', dur: 0.45, vol: 0.06, slide: 5 });
        Kit.tone(360, { type: 'triangle', dur: 0.45, vol: 0.12, slide: 3 });
        Kit.noise({ dur: 0.4, vol: 0.06, freq: 800, q: 1, sweep: 5 });
        Kit.shake(5, 0.2);
        Kit.float('Power!', sx, sy - L.cs, { color: '#ff7ab8', size: L.cs * 0.9 });
      }
    }
    if (eaten === 60 || eaten === 140) {
      const [kind, pts] = fruitFor(level);
      fruit = { kind, pts, born: stateT, life: 9.5 };
      fruitsShown++;
    }
    if (dotsLeft <= 0) {
      if (demo) { loadLevel(); return true; }
      state = 'clear'; clearT = stateT;
      sfx.win(); Kit.confetti(110);
      Kit.float('Level clear!', L.mx + L.mw / 2, L.my + L.mh * 0.4, { color: '#5ff0ff', size: L.cs * 1.5, life: 2, big: true });
      flushBest();
      return true;
    }
    return false;
  }

  function collide() {
    const [px, py] = posOf(player);
    for (const g of ghosts) {
      if (g.mode === 'house' || g.mode === 'eyes') continue;
      const [gx, gy] = posOf(g);
      let dx = Math.abs(gx - px); dx = Math.min(dx, MW - dx);
      if (dx + Math.abs(gy - py) > 0.7) continue;
      const [sx, sy] = cellXY(gx, gy);
      if (g.scared) {
        const pts = 200 << Math.min(combo, 3);
        combo++; ghostsEaten += demo ? 0 : 1;
        g.mode = 'eyes'; g.scared = false;
        Kit.burst(sx, sy, SCARED, 18, 1);
        Kit.burst(sx, sy, '#ffffff', 8, 0.7);
        if (!demo) {
          addScore(pts);
          freezeT = 0.4;
          Kit.shake(7, 0.25);
          Kit.float(`+${pts}`, sx, sy, { color: '#8fb4ff', size: L.cs * (0.9 + combo * 0.1), life: 1.1 });
          [0, 1, 2, 3].forEach((i) => Kit.tone(400 * Math.pow(1.26, i + combo), { type: 'square', dur: 0.08, vol: 0.05, at: i * 0.04 }));
          Kit.tone(1100 + combo * 200, { type: 'triangle', dur: 0.3, vol: 0.12, slide: 1.8, at: 0.12 });
        }
      } else if (!demo) {
        die(); return;
      }
    }
  }

  function die() {
    state = 'dying'; deathT = stateT; lives--;
    Kit.shake(12, 0.45);
    Kit.tone(780, { type: 'triangle', dur: 1.1, vol: 0.16, slide: 0.18 });
    Kit.tone(392, { type: 'square', dur: 0.9, vol: 0.04, slide: 0.25, at: 0.1 });
    Kit.noise({ dur: 0.5, vol: 0.12, freq: 400, q: 0.8, at: 0.95, type: 'lowpass' });
    flushBest();
  }

  function stepWorld(dt) {
    if (frightT > 0) {
      frightT -= dt;
      if (frightT <= 0) for (const g of ghosts) g.scared = false;
    } else if (phaseIx < PHASES.length) {
      phaseT += dt;
      if (phaseT > phaseLen(phaseIx)) { phaseT = 0; phaseIx++; for (const g of ghosts) if (g.mode === 'normal') reverse(g); }
    }
    const before = state;
    advance(player, playerSpeed() * dt, demo ? demoChoose : playerChoose, playerArrive);
    if (state !== before) return;
    if (!isZero(player.dir)) player.chomp += dt * playerSpeed();
    for (const g of ghosts) {
      if (g.mode === 'house') {
        g.release -= dt;
        if (g.release <= 0) { g.mode = 'leave'; g.dir = NONE; g.t = 0; }
        continue;
      }
      advance(g, ghostSpeed(g) * dt, ghostChoose, null);
    }
    collide();
    if (fruit) {
      if (stateT - fruit.born > fruit.life) fruit = null;
      else {
        const [px, py] = posOf(player);
        if (Math.abs(px - FRUIT_AT.x) + Math.abs(py - FRUIT_AT.y) < 0.6) {
          const [sx, sy] = cellXY(FRUIT_AT.x, FRUIT_AT.y);
          Kit.burst(sx, sy, '#ff4d6d', 16, 0.9); Kit.burst(sx, sy, '#7ee081', 8, 0.7);
          if (!demo) {
            addScore(fruit.pts); sfx.chime();
            Kit.float(`+${fruit.pts}`, sx, sy, { color: '#ffd23f', size: L.cs * 1.0, life: 1.2 });
          }
          fruit = null;
        }
      }
    }
  }

  function start() {
    demo = false;
    level = 1; score = 0; shown = 0; lives = diff.lives; extraGiven = false; newBest = false; ghostsEaten = 0;
    startBest = best;
    loadLevel();
    toReady();
  }
  // Back to the start screen (from Game over) so the skill can be changed; the demo plays again.
  function toMenu() {
    state = 'menu'; demo = true; stateT = 0; score = 0; shown = 0; level = 1;
    sfx.move(); loadLevel();
  }
  function toReady() {
    state = 'ready'; readyT = stateT;
    [0, 2, 4, 7].forEach((n, i) => Kit.tone([523.25, 587.33, 659.25, 698.46, 783.99, 880, 987.77, 1046.5][n], { type: 'triangle', dur: 0.18, vol: 0.13, at: i * 0.1 }));
  }

  // ---------- Input ----------
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      if (k === 'ok') { start(); return; }
      const step = k === 'left' || k === 'up' ? -1 : k === 'right' || k === 'down' ? 1 : 0;
      if (step) { pickDiff(diffIx + step); sfx.move(); }
      return;
    }
    if (state === 'over') {
      if (stateT - overT <= 1.2) return;
      if (k === 'ok') start();
      else if (D[k]) toMenu();
      return;
    }
    if (k === 'restart') { start(); return; }
    if (k === 'ok') {
      if (state === 'play') { state = 'paused'; sfx.move(); } else if (state === 'paused') { state = 'play'; sfx.pick(); }
      return;
    }
    if (D[k]) {
      if (state === 'paused') state = 'play';
      if (state === 'play' || state === 'ready' || state === 'dying' || state === 'clear') setWant(D[k]);
    }
  });
  let swipe = null;
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const hit = (L.pills || []).findIndex((r) => e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h);
        if (hit >= 0 && hit !== diffIx) { pickDiff(hit); sfx.move(); return; }
        start(); return;
      }
      if (state === 'over') { if (stateT - overT > 1.2) start(); return; }
      swipe = { x: e.x, y: e.y, moved: false };
    },
    move(e) {
      if (!swipe) return;
      const dx = e.x - swipe.x, dy = e.y - swipe.y;
      if (Math.hypot(dx, dy) < 24) return;
      if (state === 'paused') state = 'play';
      setWant(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? D.right : D.left) : (dy > 0 ? D.down : D.up));
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
    if (!player) loadLevel();
    shown += (score - shown) * Math.min(1, dt * 9);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 4);
    turnK = Math.max(0, turnK - dt * 7);
    if (state === 'menu') { stepWorld(dt); return; }
    if (state === 'ready' && stateT - readyT > 2.1) state = 'play';
    if (state === 'play') {
      if (freezeT > 0) freezeT -= dt; else stepWorld(dt);
      bestFlushT += dt;
      if (bestFlushT > 3) { bestFlushT = 0; flushBest(); }
    }
    if (state === 'dying' && stateT - deathT > 2.0) {
      if (lives > 0) { resetPositions(); toReady(); } else { state = 'over'; overT = stateT; flushBest(); sfx.over(); }
    }
    if (state === 'clear' && stateT - clearT > 2.6) {
      level++; loadLevel(); toReady();
      Kit.float(`Level ${level}`, L.mx + L.mw / 2, L.my + L.mh * 0.4, { color: '#ffd23f', size: L.cs * 1.5, life: 1.6, big: true });
    }
  }

  // ---------- Layout and cached pictures ----------
  let L = { cs: 30, mx: 0, my: 0, mw: 0, mh: 0, pad: 30, wide: true, cache: null, flash: null };
  const sprites = new Map();
  function sprite(name, size, draw) {
    const k = name + '|' + Math.round(size);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = s.height = Math.max(1, Math.ceil(size * dpr));
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    draw(c, size);
    sprites.set(k, s);
    return s;
  }

  function layout(W, H) {
    if (!W || !H) return;
    const wide = W / H > 1.15;
    const cs = wide ? Math.floor(Math.min((H * 0.94) / MH, (W * 0.56) / MW)) : Math.floor(Math.min((W * 0.96) / MW, (H * 0.8) / MH));
    const mw = cs * MW, mh = cs * MH;
    const mx = Math.round((W - mw) / 2);
    const my = wide ? Math.round((H - mh) / 2) : Math.round(H * 0.13 + (H * 0.87 - mh) / 2);
    L = { cs, mx, my, mw, mh, pad: cs, wide };
    sprites.clear();
    L.cache = mazePicture(false);
    L.flash = mazePicture(true);
  }
  Kit.onResize(layout);

  const isWall = (x, y) => x >= 0 && y >= 0 && x < MW && y < MH && type[y * MW + x] === WALL;
  function wallShape(c, ox, oy, cs, m) {
    const o = m * cs, w = cs - 2 * o, e = 0.5;
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      if (!isWall(x, y)) continue;
      const x0 = ox + x * cs, y0 = oy + y * cs;
      roundRect(c, x0 + o, y0 + o, w, w, w * 0.45); c.fill();
      // Bridges run centre to centre so the rounded corners never leave notches at the joins.
      if (isWall(x + 1, y)) c.fillRect(x0 + cs / 2, y0 + o, cs + e, w);
      if (isWall(x, y + 1)) c.fillRect(x0 + o, y0 + cs / 2, w, cs + e);
      if (isWall(x + 1, y) && isWall(x, y + 1) && isWall(x + 1, y + 1)) c.fillRect(x0 + cs / 2, y0 + cs / 2, cs + e, cs + e);
    }
  }
  // The maze is drawn once per size: a dark floor, then neon tubes with a soft glow.
  function mazePicture(white) {
    const { cs, mw, mh, pad } = L;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = mw + pad * 2, chh = mh + pad * 2;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(cw * dpr); cv.height = Math.ceil(chh * dpr);
    const c = cv.getContext('2d');
    c.scale(dpr, dpr);
    roundRect(c, pad * 0.45, pad * 0.45, cw - pad * 0.9, chh - pad * 0.9, cs * 0.8);
    const fg = c.createLinearGradient(0, 0, 0, chh);
    fg.addColorStop(0, 'rgba(10,16,52,0.9)'); fg.addColorStop(1, 'rgba(4,6,24,0.92)');
    c.fillStyle = fg; c.fill();
    c.lineWidth = 2; c.strokeStyle = white ? 'rgba(255,255,255,0.4)' : 'rgba(80,220,255,0.22)'; c.stroke();
    // Neon tube outline into its own canvas, then laid down twice: blurred for glow, then sharp.
    const tube = document.createElement('canvas');
    tube.width = cv.width; tube.height = cv.height;
    const t = tube.getContext('2d');
    t.scale(dpr, dpr);
    const g = t.createLinearGradient(0, pad, 0, pad + mh);
    if (white) { g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#dfe8ff'); } else { g.addColorStop(0, '#5ff0ff'); g.addColorStop(0.55, '#38bdf8'); g.addColorStop(1, '#6d6bff'); }
    t.fillStyle = g;
    wallShape(t, pad, pad, cs, 0.2);
    t.globalCompositeOperation = 'destination-out';
    t.fillStyle = '#000';
    wallShape(t, pad, pad, cs, 0.29);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.shadowColor = white ? 'rgba(255,255,255,0.95)' : 'rgba(56,200,255,0.95)';
    c.shadowBlur = cs * 0.55 * dpr;
    c.drawImage(tube, 0, 0);
    c.shadowBlur = cs * 0.2 * dpr;
    c.drawImage(tube, 0, 0);
    c.restore();
    // Inside the tubes: a deep glassy fill.
    const ig = c.createLinearGradient(0, pad, 0, pad + mh);
    ig.addColorStop(0, white ? '#3a4a9a' : '#14205e'); ig.addColorStop(1, white ? '#26306e' : '#0a0f36');
    c.fillStyle = ig;
    wallShape(c, pad, pad, cs, 0.29);
    c.drawImage(tube, 0, 0, cv.width, cv.height, 0, 0, cw, chh);
    return cv;
  }

  const glow = (color, size) => sprite('glow' + color, size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, Kit.rgba(color, 0.55)); g.addColorStop(0.4, Kit.rgba(color, 0.2)); g.addColorStop(1, Kit.rgba(color, 0));
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const dotSprite = (size) => sprite('dot', size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,200,140,0.6)'); g.addColorStop(1, 'rgba(255,170,90,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    const k = c.createRadialGradient(s * 0.45, s * 0.45, 0, s / 2, s / 2, s * 0.17);
    k.addColorStop(0, '#ffffff'); k.addColorStop(1, '#ffc58a');
    c.fillStyle = k; c.beginPath(); c.arc(s / 2, s / 2, s * 0.15, 0, Math.PI * 2); c.fill();
  });
  const orbSprite = (size) => sprite('orb', size, (c, s) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,110,180,0.7)'); g.addColorStop(0.5, 'rgba(255,90,170,0.22)'); g.addColorStop(1, 'rgba(255,90,170,0)');
    c.fillStyle = g; c.fillRect(0, 0, s, s);
    const k = c.createRadialGradient(s * 0.42, s * 0.4, s * 0.02, s / 2, s / 2, s * 0.22);
    k.addColorStop(0, '#ffffff'); k.addColorStop(0.45, '#ffb3d9'); k.addColorStop(1, '#e8327f');
    c.fillStyle = k; c.beginPath(); c.arc(s / 2, s / 2, s * 0.21, 0, Math.PI * 2); c.fill();
  });
  // The muncher, in 8 mouth positions, facing right.
  const munchSprite = (i, size) => sprite('m' + i, size, (c, s) => {
    const a = (i / 7) * 0.8, cx = s / 2, cy = s / 2, r = s * 0.44;
    c.beginPath(); c.moveTo(cx - r * 0.12, cy); c.arc(cx, cy, r, a, Math.PI * 2 - a); c.closePath();
    const g = c.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.05, cx, cy, r);
    g.addColorStop(0, '#fffbe0'); g.addColorStop(0.35, '#ffe14d'); g.addColorStop(0.78, '#ffb300'); g.addColorStop(1, '#e07000');
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.lineWidth = s * 0.025; c.strokeStyle = 'rgba(140,60,0,0.6)'; c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.55)';
    c.beginPath(); c.ellipse(cx - r * 0.42, cy - r * 0.48, r * 0.2, r * 0.1, -0.7, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,110,120,0.4)';
    c.beginPath(); c.ellipse(cx - r * 0.22, cy - r * 0.1, r * 0.14, r * 0.09, 0, 0, Math.PI * 2); c.fill();
    const ex = cx + r * 0.1, ey = cy - r * 0.5;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, ey, r * 0.19, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#2b1600'; c.beginPath(); c.arc(ex + r * 0.06, ey + r * 0.01, r * 0.12, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + r * 0.1, ey - r * 0.05, r * 0.045, 0, Math.PI * 2); c.fill();
  });
  function ghostPath(c, s, frame) {
    const cx = s / 2, r = s * 0.4, top = s * 0.08, bottom = s * 0.9, n = 4, w = (2 * r) / n;
    c.beginPath();
    c.arc(cx, top + r, r, Math.PI, 0);
    c.lineTo(cx + r, bottom - s * 0.05);
    for (let i = 0; i < n; i++) {
      const x0 = cx + r - i * w, x1 = x0 - w, up = (i + frame) % 2 === 0;
      c.quadraticCurveTo((x0 + x1) / 2, bottom + (up ? s * 0.06 : -s * 0.08), x1, bottom - s * 0.05);
    }
    c.closePath();
  }
  const ghostSprite = (id, frame, size) => sprite('g' + id + frame, size, (c, s) => {
    const col = GHOSTS[id].color;
    ghostPath(c, s, frame);
    const g = c.createRadialGradient(s * 0.38, s * 0.3, s * 0.03, s / 2, s * 0.5, s * 0.5);
    g.addColorStop(0, shade(col, 0.55)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.45));
    c.fillStyle = g; c.fill();
    c.lineWidth = s * 0.025; c.strokeStyle = shade(col, -0.55); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.4)';
    c.beginPath(); c.ellipse(s * 0.32, s * 0.2, s * 0.09, s * 0.05, -0.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.18)';
    for (const sx of [-1, 1]) { c.beginPath(); c.ellipse(s / 2 + sx * s * 0.26, s * 0.5, s * 0.06, s * 0.035, 0, 0, Math.PI * 2); c.fill(); }
  });
  const scaredSprite = (frame, flash, size) => sprite('s' + frame + (flash ? 'f' : ''), size, (c, s) => {
    const col = flash ? '#e8ecff' : SCARED;
    ghostPath(c, s, frame);
    const g = c.createRadialGradient(s * 0.38, s * 0.3, s * 0.03, s / 2, s * 0.5, s * 0.5);
    g.addColorStop(0, shade(col, 0.5)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.4));
    c.fillStyle = g; c.fill();
    c.lineWidth = s * 0.025; c.strokeStyle = shade(col, -0.5); c.stroke();
    const face = flash ? '#ff3b5c' : '#ffe1ec';
    c.fillStyle = face;
    for (const sx of [-1, 1]) { c.beginPath(); c.arc(s / 2 + sx * s * 0.13, s * 0.38, s * 0.055, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = face; c.lineWidth = s * 0.04; c.lineJoin = 'round'; c.lineCap = 'round';
    c.beginPath();
    for (let i = 0; i <= 6; i++) c.lineTo(s * 0.26 + i * s * 0.08, s * 0.62 + (i % 2 ? -s * 0.045 : s * 0.025));
    c.stroke();
  });
  function drawEyes(c, x, y, s, d) {
    for (const sx of [-1, 1]) {
      const ex = x + sx * s * 0.15 + d.x * s * 0.04, ey = y - s * 0.08 + d.y * s * 0.04;
      c.fillStyle = '#ffffff';
      c.beginPath(); c.ellipse(ex, ey, s * 0.105, s * 0.13, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#1b2a8a';
      c.beginPath(); c.arc(ex + d.x * s * 0.05, ey + d.y * s * 0.06, s * 0.06, 0, Math.PI * 2); c.fill();
    }
  }

  function orb(c, x, y, r, col) {
    const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.08, x, y, r);
    g.addColorStop(0, shade(col, 0.6)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, -0.4));
    c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
  }
  function leaf(c, x, y, rx, ry, rot) {
    c.fillStyle = '#4cd964'; c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); c.fill();
  }
  const fruitSprite = (kind, size) => sprite('f' + kind, size, (c, s) => {
    c.lineCap = 'round';
    if (kind === 'cherry') {
      c.strokeStyle = '#3f8f2f'; c.lineWidth = s * 0.05;
      c.beginPath(); c.moveTo(s * 0.3, s * 0.6); c.quadraticCurveTo(s * 0.36, s * 0.3, s * 0.62, s * 0.14);
      c.moveTo(s * 0.68, s * 0.64); c.quadraticCurveTo(s * 0.66, s * 0.35, s * 0.62, s * 0.14); c.stroke();
      leaf(c, s * 0.74, s * 0.16, s * 0.13, s * 0.06, -0.4);
      orb(c, s * 0.3, s * 0.68, s * 0.2, '#ff2d55'); orb(c, s * 0.68, s * 0.72, s * 0.2, '#ff2d55');
    } else if (kind === 'berry') {
      c.beginPath(); c.moveTo(s * 0.5, s * 0.94);
      c.bezierCurveTo(s * 0.08, s * 0.62, s * 0.1, s * 0.24, s * 0.5, s * 0.28);
      c.bezierCurveTo(s * 0.9, s * 0.24, s * 0.92, s * 0.62, s * 0.5, s * 0.94);
      const g = c.createRadialGradient(s * 0.4, s * 0.42, s * 0.03, s / 2, s * 0.55, s * 0.42);
      g.addColorStop(0, '#ff9aa8'); g.addColorStop(0.45, '#ff2d55'); g.addColorStop(1, '#a3122e');
      c.fillStyle = g; c.fill();
      c.fillStyle = '#ffe58a';
      for (const [x, y] of [[0.35, 0.45], [0.5, 0.42], [0.65, 0.45], [0.42, 0.58], [0.58, 0.58], [0.5, 0.72], [0.36, 0.62], [0.64, 0.62]]) {
        c.beginPath(); c.ellipse(s * x, s * y, s * 0.018, s * 0.03, 0, 0, Math.PI * 2); c.fill();
      }
      for (const a of [-0.9, -0.3, 0.3, 0.9]) leaf(c, s * 0.5 + Math.sin(a) * s * 0.12, s * 0.26, s * 0.12, s * 0.05, a);
    } else if (kind === 'grapes') {
      c.strokeStyle = '#6b4a1f'; c.lineWidth = s * 0.05;
      c.beginPath(); c.moveTo(s * 0.5, s * 0.3); c.lineTo(s * 0.55, s * 0.1); c.stroke();
      leaf(c, s * 0.66, s * 0.16, s * 0.13, s * 0.06, -0.3);
      for (const [x, y] of [[0.34, 0.38], [0.5, 0.36], [0.66, 0.38], [0.42, 0.54], [0.58, 0.54], [0.5, 0.7], [0.34, 0.66], [0.66, 0.66], [0.5, 0.86]]) orb(c, s * x, s * y, s * 0.11, '#a855f7');
    } else {
      const col = kind === 'orange' ? '#ff9a1f' : kind === 'apple' ? '#7ed957' : '#2fbf71';
      c.strokeStyle = '#6b4a1f'; c.lineWidth = s * 0.05;
      c.beginPath(); c.moveTo(s * 0.5, s * 0.24); c.lineTo(s * 0.54, s * 0.1); c.stroke();
      orb(c, s * 0.5, s * 0.56, s * 0.36, col);
      if (kind === 'melon') {
        c.save(); c.beginPath(); c.arc(s * 0.5, s * 0.56, s * 0.36, 0, Math.PI * 2); c.clip();
        c.strokeStyle = 'rgba(10,80,40,0.55)'; c.lineWidth = s * 0.04;
        for (const rx of [0.1, 0.22, 0.34]) { c.beginPath(); c.ellipse(s * 0.5, s * 0.56, s * rx, s * 0.4, 0, 0, Math.PI * 2); c.stroke(); }
        c.restore();
      }
      leaf(c, s * 0.66, s * 0.17, s * 0.13, s * 0.06, -0.4);
    }
  });

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(6,8,32,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#1d2f86'); g.addColorStop(1, '#0a1140');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
    c.save(); c.clip();
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(x, y, w, h * 0.3);
    c.restore();
  }
  function button(c, label, x, y, w, h, t, on) {
    const k = on ? 1 + Math.sin(t * 5) * 0.035 : 1;
    c.save(); c.translate(x, y); c.scale(k, k);
    roundRect(c, -w / 2, -h / 2, w, h, h / 2);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, on ? '#fff07a' : '#8a93b8'); g.addColorStop(1, on ? '#ffaa00' : '#4d5578');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(80,40,0,0.5)'; c.stroke();
    text(c, label, 0, h * 0.03, h * 0.5, '#3a1d00', 900);
    c.restore();
  }

  function screenOf(e) { const [x, y] = posOf(e); return [x, y]; }
  function drawAtWrap(gx, fn) {
    fn(gx);
    if (gx < 0.6) fn(gx + MW);
    if (gx > MW - 1.6) fn(gx - MW);
  }

  function drawPlayer(c, t) {
    const cs = L.cs, s = cs * 1.3, p = player;
    const [gx, gy] = screenOf(p);
    const dying = state === 'dying';
    const age = stateT - deathT;
    if ((dying && age > 1.35) || state === 'over') return;
    let fi = Math.round(Math.abs(Math.sin(p.chomp * Math.PI)) * 7);
    if (dying) fi = 7;
    drawAtWrap(gx, (x) => {
      const px = L.mx + (x + 0.5) * cs, py = L.my + (gy + 0.5) * cs;
      c.globalAlpha = 0.5; const gs = s * 2.2;
      c.drawImage(glow('#ffc93c', gs), px - gs / 2, py - gs / 2, gs, gs);
      c.globalAlpha = 1;
      c.save(); c.translate(px, py);
      const f = p.face;
      if (dying) {
        const k = clamp(age / 1.3, 0, 1);
        c.rotate(k * Math.PI * 4); const sc = 1 - ease.inOut(k) * 0.95; c.scale(sc, sc);
      } else {
        if (f.x < 0) c.scale(-1, 1); else if (f.y < 0) c.rotate(-Math.PI / 2); else if (f.y > 0) c.rotate(Math.PI / 2);
        c.scale(1 + turnK * 0.12, 1 - turnK * 0.12);
      }
      c.drawImage(munchSprite(fi, s), -s / 2, -s / 2, s, s);
      c.restore();
    });
  }

  function drawGhosts(c, t) {
    const cs = L.cs, s = cs * 1.3;
    let alpha = 1;
    if (state === 'dying') alpha = clamp(1 - (stateT - deathT - 0.3) / 0.3, 0, 1);
    if (state === 'over') return;
    if (state === 'clear') alpha = clamp(1 - (stateT - clearT) / 0.4, 0, 1);
    if (alpha <= 0) return;
    for (const g of ghosts) {
      const [gx, gy0] = screenOf(g);
      const bob = g.mode === 'house' ? Math.sin(t * 5 + g.id * 2) * 0.18 : 0;
      const gy = gy0 + bob;
      const look = g.mode === 'house' ? { x: 0, y: Math.sin(t * 5 + g.id * 2) > 0 ? 1 : -1 } : g.dir;
      drawAtWrap(gx, (x) => {
        const px = L.mx + (x + 0.5) * cs, py = L.my + (gy + 0.5) * cs;
        c.globalAlpha = alpha;
        if (g.mode === 'eyes') { drawEyes(c, px, py, s, g.dir); c.globalAlpha = 1; return; }
        const frame = Math.floor(t * 7 + g.id) % 2;
        const flash = g.scared && frightT < 2 && Math.floor(t * 6) % 2 === 0;
        c.globalAlpha = alpha * 0.55; const gs = s * 2.1;
        c.drawImage(glow(g.scared ? (flash ? '#ffffff' : SCARED) : GHOSTS[g.id].color, gs), px - gs / 2, py - gs / 2, gs, gs);
        c.globalAlpha = alpha;
        c.drawImage(g.scared ? scaredSprite(frame, flash, s) : ghostSprite(g.id, frame, s), px - s / 2, py - s / 2, s, s);
        if (!g.scared) drawEyes(c, px, py, s, look);
        c.globalAlpha = 1;
      });
    }
  }

  function drawDots(c, t) {
    const cs = L.cs, ds = cs * 0.62, os = cs * 1.5;
    const dimg = dotSprite(ds), oimg = orbSprite(os);
    for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
      const d = dots[y * MW + x];
      if (!d) continue;
      const px = L.mx + (x + 0.5) * cs, py = L.my + (y + 0.5) * cs;
      if (d === 1) {
        const k = ds * (1 + 0.14 * Math.sin(t * 4 - (x + y) * 0.55));
        c.drawImage(dimg, px - k / 2, py - k / 2, k, k);
      } else {
        const k = os * (1 + 0.22 * Math.sin(t * 6 + x));
        c.drawImage(oimg, px - k / 2, py - k / 2, k, k);
      }
    }
    if (fruit) {
      const age = stateT - fruit.born, left = fruit.life - age;
      if (left < 2 && Math.sin(t * 20) < 0) return;
      const [px, py] = cellXY(FRUIT_AT.x, FRUIT_AT.y);
      const s = cs * 1.3 * ease.back(clamp(age / 0.45, 0, 1));
      const gs = cs * 2.6;
      c.globalAlpha = 0.5 + Math.sin(t * 5) * 0.15;
      c.drawImage(glow('#ffd23f', gs), px - gs / 2, py - gs / 2, gs, gs);
      c.globalAlpha = 1;
      if (s > 1) c.drawImage(fruitSprite(fruit.kind, cs * 1.3), px - s / 2, py - s / 2 - Math.sin(t * 4) * cs * 0.06, s, s);
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#0e1650', '#03050f', 'rgba(56,189,248,0.08)');
    if (!L.cache || L.cs < 1) { layout(W, H); if (!L.cache) return; }
    if (!player) return;
    const cs = L.cs;
    const flashing = state === 'clear' && stateT - clearT < 1.9 && Math.floor((stateT - clearT) * 5) % 2 === 1;
    c.drawImage(flashing ? L.flash : L.cache, L.mx - L.pad, L.my - L.pad, L.mw + L.pad * 2, L.mh + L.pad * 2);
    // The ghosts' door
    c.fillStyle = '#ff7ad9';
    c.globalAlpha = 0.8 + Math.sin(t * 4) * 0.2;
    roundRect(c, L.mx + DOORC.x * cs - 2, L.my + (DOORC.y + 0.5) * cs - cs * 0.07, cs + 4, cs * 0.14, cs * 0.07); c.fill();
    c.globalAlpha = 1;
    drawDots(c, t);
    c.save();
    c.beginPath(); c.rect(L.mx, L.my, L.mw, L.mh); c.clip();
    drawGhosts(c, t);
    drawPlayer(c, t);
    c.restore();
    if (state !== 'menu') drawHud(c, t);

    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'ready') {
      const k = stateT - readyT;
      const [rx, ry] = cellXY(FRUIT_AT.x, FRUIT_AT.y);
      const sz = cs * 1.15 * ease.back(clamp(k / 0.35, 0, 1));
      if (sz > 1) outlined(c, k < 1.5 ? 'READY?' : 'GO!', rx, ry, sz, '#fff7c2', '#ffb800');
    }
    if (state === 'paused') {
      c.fillStyle = 'rgba(3,5,20,0.65)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.42, cs * 1.9, '#ffffff', '#7fe7ff');
      text(c, Kit.touchFirst() ? 'Tap or swipe to carry on' : 'OK or an arrow to carry on  ·  Back for games', W / 2, H * 0.56, cs * 0.65, 'rgba(255,255,255,0.88)', 700);
    }
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c, t);
  }

  function lifeIcons(c, x, y, n, size, align) {
    const gap = size * 1.12, total = (n - 1) * gap;
    const x0 = align === 'center' ? x - total / 2 : x;
    const img = munchSprite(4, size);
    for (let i = 0; i < Math.min(n, 6); i++) c.drawImage(img, x0 + i * gap - size / 2, y - size / 2, size, size);
  }
  function fruitIcons(c, x, y, size, align) {
    const from = Math.max(1, level - 3), n = level - from + 1, gap = size * 1.15;
    const x0 = align === 'center' ? x - ((n - 1) * gap) / 2 : x;
    for (let i = 0; i < n; i++) c.drawImage(fruitSprite(fruitFor(from + i)[0], size), x0 + i * gap - size / 2, y - size / 2, size, size);
  }

  function drawHud(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    const lbl = 'rgba(150,225,255,0.85)';
    if (L.wide) {
      const lx = L.mx / 2, rx = L.mx + L.mw + (W - L.mx - L.mw) / 2;
      const u = Math.min(cs * 1.05, L.mx / 6.5);
      text(c, 'SCORE', lx, H * 0.17, u * 0.6, lbl, 800);
      c.save(); c.translate(lx, H * 0.26); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
      outlined(c, String(Math.round(shown)), 0, 0, u * 1.5, '#fff7c2', '#ffb800');
      c.restore();
      text(c, 'LEVEL', lx, H * 0.41, u * 0.6, lbl, 800);
      outlined(c, String(level), lx, H * 0.49, u * 1.3, '#ffffff', '#5ff0ff');
      text(c, diff.name, lx, H * 0.555, u * 0.5, '#ffd23f', 800);
      text(c, 'LIVES', lx, H * 0.63, u * 0.6, lbl, 800);
      lifeIcons(c, lx, H * 0.71, lives, u * 1.0, 'center');

      text(c, '👑 BEST', rx, H * 0.17, u * 0.6, lbl, 800);
      outlined(c, String(Math.max(best, score)), rx, H * 0.26, u * 1.3, '#fff3b0', '#ffc400');
      text(c, 'BONUS', rx, H * 0.41, u * 0.6, lbl, 800);
      fruitIcons(c, rx, H * 0.49, u * 1.15, 'center');
      if (frightT > 0 && state === 'play') {
        const bw = u * 4, bh = u * 0.32, k = clamp(frightT / frightMax, 0, 1);
        text(c, 'GHOSTS SCARED', rx, H * 0.6, u * 0.5, '#8fb4ff', 800);
        c.fillStyle = 'rgba(255,255,255,0.15)'; roundRect(c, rx - bw / 2, H * 0.64, bw, bh, bh / 2); c.fill();
        c.fillStyle = frightT < 2 && Math.floor(t * 6) % 2 ? '#ffffff' : '#5b7bff';
        roundRect(c, rx - bw / 2, H * 0.64, bw * k, bh, bh / 2); c.fill();
      }
      const hs = u * 0.5;
      text(c, Kit.touchFirst() ? 'Swipe to steer' : 'Arrows  steer', rx, H * 0.76, hs, 'rgba(255,255,255,0.7)', 700);
      text(c, Kit.touchFirst() ? 'Tap to pause' : 'OK  pause', rx, H * 0.81, hs, 'rgba(255,255,255,0.7)', 700);
      text(c, Kit.touchFirst() ? '' : 'Back  games', rx, H * 0.86, hs, 'rgba(255,255,255,0.7)', 700);
    } else {
      const y = L.my * 0.42, u = Math.min(cs * 1.1, L.my * 0.4);
      c.save(); c.translate(W * 0.2, y); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
      outlined(c, String(Math.round(shown)), 0, 0, u * 1.1, '#fff7c2', '#ffb800');
      c.restore();
      text(c, `Level ${level} · ${diff.name}`, W / 2, y, u * 0.6, '#ffffff', 800);
      text(c, `👑 ${Math.max(best, score)}`, W * 0.8, y, u * 0.6, '#ffd23f', 800);
      lifeIcons(c, W / 2, L.my * 0.8, lives, u * 0.7, 'center');
    }
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    c.fillStyle = 'rgba(3,5,20,0.6)'; c.fillRect(0, 0, W, H);
    const a = ease.back(clamp(stateT / 0.5, 0, 1));
    const pw = Math.min(W * 0.94, cs * 20), ph = Math.min(H * 0.9, cs * 16.5);
    const ox = W / 2, oy = H / 2 - cs * 0.3;
    c.save(); c.translate(ox, oy); c.scale(a, a);
    panel(c, -pw / 2, -ph / 2, pw, ph, cs * 0.8, '#5ff0ff');
    // Title with a little muncher chasing along
    outlined(c, 'MAZE MUNCH', 0, -ph * 0.39, cs * 1.65, '#fff7c2', '#ffb800');
    text(c, 'Eat every dot. Dodge the ghosts.', 0, -ph * 0.29, cs * 0.6, 'rgba(255,255,255,0.88)', 700);
    GHOSTS.forEach((g, i) => {
      const cx = (i % 2 ? 0.25 : -0.25) * pw, cy = (i < 2 ? -0.175 : -0.05) * ph;
      const s = cs * 1.35, sx = cx - pw * 0.16;
      c.globalAlpha = 0.5; c.drawImage(glow(g.color, s * 2), sx - s, cy - s, s * 2, s * 2); c.globalAlpha = 1;
      c.drawImage(ghostSprite(i, Math.floor(t * 4 + i) % 2, s), sx - s / 2, cy - s / 2 + Math.sin(t * 3 + i) * cs * 0.06, s, s);
      drawEyes(c, sx, cy + Math.sin(t * 3 + i) * cs * 0.06, s, { x: Math.round(Math.sin(t * 1.3 + i)), y: 0 });
      text(c, g.name, cx - pw * 0.09, cy - cs * 0.28, cs * 0.66, g.color, 900, 'left');
      text(c, g.style, cx - pw * 0.09, cy + cs * 0.32, cs * 0.48, 'rgba(255,255,255,0.8)', 600, 'left');
    });
    const ty = ph * 0.03;
    const os = cs * 1.3;
    c.font = `700 ${Math.round(cs * 0.52)}px system-ui, sans-serif`;
    const tip = 'Power orbs turn ghosts blue: munch them!';
    const tw = c.measureText(tip).width;
    c.drawImage(orbSprite(os), -tw / 2 - os * 0.85, ty - os / 2, os, os);
    text(c, tip, cs * 0.2, ty, cs * 0.52, '#ffb3d9', 700);
    // Skill row: ◀ Beginner  Normal  Hard  Professional ▶
    const py = ph * 0.165, pgap = pw * 0.015, pwid = (pw * 0.86 - pgap * 3) / 4, pht = cs * 1.15;
    text(c, Kit.touchFirst() ? 'Tap a skill' : '◀  ▶  choose your skill', 0, py - pht * 1.05, cs * 0.5, 'rgba(150,225,255,0.9)', 800);
    L.pills = [];
    DIFFS.forEach((d, i) => {
      const x = -pw * 0.43 + i * (pwid + pgap), on = i === diffIx;
      const k = on ? 1.05 + Math.sin(t * 5) * 0.015 : 1;
      c.save(); c.translate(x + pwid / 2, py); c.scale(k, k);
      roundRect(c, -pwid / 2, -pht / 2, pwid, pht, pht / 2);
      const g = c.createLinearGradient(0, -pht / 2, 0, pht / 2);
      g.addColorStop(0, on ? '#7dffb0' : 'rgba(120,140,200,0.35)'); g.addColorStop(1, on ? '#13b86a' : 'rgba(40,55,110,0.55)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(150,225,255,0.35)'; c.stroke();
      text(c, d.name, 0, pht * 0.03, Math.min(pht * 0.42, pwid / (d.name.length * 0.62)), on ? '#04220f' : 'rgba(255,255,255,0.8)', 900);
      c.restore();
      L.pills.push({ x: ox + x, y: oy + py - pht / 2, w: pwid, h: pht });
    });
    text(c, diff.tip, 0, py + pht * 0.95, cs * 0.5, 'rgba(255,255,255,0.85)', 700);
    button(c, Kit.touchFirst() ? 'Tap to play' : 'OK  Play', 0, ph * 0.355, cs * 6.5, cs * 1.25, t, true);
    text(c, `👑 Best (${diff.name}) ${best}`, 0, ph * 0.45, cs * 0.55, '#ffd23f', 800);
    c.restore();
    if (!Kit.touchFirst()) text(c, '◀ ▶ skill  ·  Arrows steer  ·  OK pauses  ·  Back for games', W / 2, Math.min(H - cs * 0.5, oy + ph / 2 + cs * 0.7), cs * 0.5, 'rgba(255,255,255,0.75)', 700);
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, cs = L.cs;
    const a = clamp((stateT - overT) / 0.4, 0, 1);
    c.fillStyle = `rgba(3,5,20,${0.68 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.9, cs * 15), ph = Math.min(H * 0.8, cs * 11);
    panel(c, -pw / 2, -ph / 2, pw, ph, cs * 0.8, '#ffd23f');
    outlined(c, 'Game over', 0, -ph * 0.36, cs * 1.35, '#ffffff', '#7fe7ff');
    outlined(c, String(score), 0, -ph * 0.13, cs * 2.0, '#fff7c2', '#ffb800');
    text(c, newBest ? `🎉 New ${diff.name} best!` : `👑 Best (${diff.name}) ${best}`, 0, ph * 0.06, cs * 0.65, newBest ? '#ffd23f' : '#ffffff', 800);
    text(c, `Level ${level}  ·  ${ghostsEaten} ghost${ghostsEaten === 1 ? '' : 's'} munched`, 0, ph * 0.18, cs * 0.52, 'rgba(255,255,255,0.78)', 700);
    const ready = stateT - overT > 1.2;
    c.globalAlpha = ready ? 1 : 0.45;
    button(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.33, cs * 7.5, cs * 1.25, t, ready);
    if (!Kit.touchFirst()) text(c, '◀ ▶  change skill', 0, ph * 0.44, cs * 0.5, 'rgba(255,255,255,0.75)', 700);
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  loadLevel();
  Kit.canvas.focus();
  if (topBest() > 0) Kit.record('mazemunch', topBest());
})();
