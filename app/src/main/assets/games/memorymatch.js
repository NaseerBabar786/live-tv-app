// Memory Match: flip two cards at a time to find the matching pictures. Clear the board in few moves
// for up to three stars; matching pairs one after another builds a combo bonus. Five levels grow from
// 4×3 to 6×5. Remote: arrows move, OK flips a card (in the menu arrows pick a level, OK plays).
// Touch and mouse: tap a card. M mutes, R restarts the level.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, rgba } = Kit;
  const LEVELS = [[4, 3], [4, 4], [5, 4], [6, 4], [6, 5]];
  const FACES = [
    { e: '🐶', c: '#ffb84d' }, { e: '🐱', c: '#ff7eb6' }, { e: '🦊', c: '#ff8a3d' }, { e: '🐼', c: '#8fd3ff' },
    { e: '🐸', c: '#7ee081' }, { e: '🦁', c: '#ffd23f' }, { e: '🐙', c: '#c792ff' }, { e: '🦄', c: '#ff9ad5' },
    { e: '🍓', c: '#ff5c7a' }, { e: '🍉', c: '#5fe0a0' }, { e: '🍕', c: '#ffc46b' }, { e: '🚀', c: '#6fb8ff' },
    { e: '🌈', c: '#7fe6ff' }, { e: '⚽', c: '#b6f36b' }, { e: '🎸', c: '#ff7a6b' },
  ];
  const RATIO = 0.78; // card width / height
  const FLIP = 0.3; // seconds for a card to turn over
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const GOLD = '#ffd23f';

  // ---------- Records: highest level done, and the best stars on each level ----------
  let best = clamp(Kit.store.get('memorymatch.level', 0) | 0, 0, LEVELS.length);
  let stars = Kit.store.get('memorymatch.stars', null);
  if (!Array.isArray(stars) || stars.length !== LEVELS.length) stars = LEVELS.map(() => 0);
  stars = stars.map((s) => clamp(s | 0, 0, 3));
  let pick = Math.min(best, LEVELS.length - 1);

  // ---------- State ----------
  // state: 'menu' (choose a level), 'play', 'clear' (level done panel)
  let state = 'menu', stateT = 0, level = 0, COLS = 4, ROWS = 3;
  let cards = [], cursor = 0, first = -1, second = -1, waitT = 0;
  let moves = 0, score = 0, shown = 0, bump = 0, combo = 0, bestCombo = 0, comboT = -9;
  let dealT = 0, dealEnd = 0, clearT = 0, earned = 0, newBest = false, doneAt = -1;
  const later = []; // [{ t, fn }]: effects that wait for a card to finish turning
  const L = {};

  function pairsOf(lv) { return (LEVELS[lv][0] * LEVELS[lv][1]) / 2; }
  function starsFor(m, n) { return m <= Math.round(n * 1.6) ? 3 : m <= Math.round(n * 2.3) ? 2 : 1; }

  function startLevel(lv) {
    level = lv; [COLS, ROWS] = LEVELS[lv];
    const n = pairsOf(lv);
    const pool = FACES.map((_, i) => i).sort(() => Math.random() - 0.5).slice(0, n);
    const deck = pool.concat(pool);
    for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
    cards = deck.map((face, i) => ({ face, f: 0, up: false, matched: false, matchT: -1, shakeT: -1, hover: 0, delay: i * 0.035 }));
    cursor = 0; first = -1; second = -1; waitT = 0;
    moves = 0; score = 0; shown = 0; bump = 0; combo = 0; bestCombo = 0; comboT = -9; doneAt = -1; newBest = false;
    later.length = 0;
    state = 'play'; stateT = 0; dealT = 0; dealEnd = cards.length * 0.035 + 0.5;
    layout(Kit.W, Kit.H);
    Kit.float(`Level ${lv + 1}`, Kit.W / 2, L.by + L.bh * 0.42, { color: GOLD, size: L.cw * 0.55, life: 1.3, big: true });
    dealSound(cards.length);
  }

  function toMenu() { state = 'menu'; stateT = 0; pick = Math.min(best, LEVELS.length - 1); later.length = 0; }

  // ---------- Playing ----------
  function hide() {
    if (first >= 0) cards[first].up = false;
    if (second >= 0) cards[second].up = false;
    first = -1; second = -1; waitT = 0;
    flipSound(0.7);
  }

  function flip(i) {
    if (state !== 'play' || dealT < dealEnd || doneAt >= 0) return;
    const cd = cards[i];
    if (second >= 0) hide();
    if (cd.up || cd.matched) { Kit.tone(220, { type: 'triangle', dur: 0.06, vol: 0.06 }); return; }
    cd.up = true;
    flipSound(1);
    if (first < 0) { first = i; return; }
    second = i; moves++;
    const a = first, b = second;
    if (cards[a].face === cd.face) {
      cards[a].matched = cards[b].matched = true;
      first = -1; second = -1;
      combo++; bestCombo = Math.max(bestCombo, combo);
      const pts = 100 + (combo - 1) * 50;
      const c = combo;
      later.push({ t: stateT + FLIP, fn: () => matched(a, b, pts, c) });
      if (cards.every((q) => q.matched)) doneAt = stateT + FLIP + 0.9;
    } else {
      combo = 0;
      waitT = FLIP + 0.8;
      later.push({ t: stateT + FLIP, fn: () => {
        cards[a].shakeT = stateT; cards[b].shakeT = stateT;
        sfx.nope(); Kit.shake(4, 0.2);
      } });
    }
  }

  function matched(a, b, pts, c) {
    const t = stateT;
    cards[a].matchT = t; cards[b].matchT = t;
    score += pts; bump = 1; comboT = t;
    const col = FACES[cards[a].face].c;
    for (const i of [a, b]) {
      const [x, y] = cardXY(i);
      Kit.burst(x, y, col, 14, 0.9);
      Kit.burst(x, y, GOLD, 8, 0.7);
    }
    const [x, y] = cardXY(b);
    Kit.float(`+${pts}`, x, y - L.ch * 0.2, { color: GOLD, size: L.cw * 0.36 });
    matchSound(c);
    if (c >= 2) {
      const words = ['', '', 'Combo ×2', 'Combo ×3!', 'Combo ×4!!', 'On fire ×5!'];
      Kit.float(words[Math.min(c, 5)] || `Combo ×${c}!`, Kit.W / 2, L.by + L.bh * 0.45, { color: '#7fe6ff', size: L.cw * 0.45, life: 1.1, big: true });
    }
  }

  function finishLevel() {
    state = 'clear'; clearT = stateT;
    earned = starsFor(moves, cards.length / 2);
    stars[level] = Math.max(stars[level], earned);
    Kit.store.set('memorymatch.stars', stars);
    if (level + 1 > best) {
      best = level + 1; newBest = true;
      Kit.store.set('memorymatch.level', best);
      Kit.record('memorymatch', best);
    }
    sfx.win();
    if (earned === 3 || level === LEVELS.length - 1) Kit.confetti(level === LEVELS.length - 1 ? 180 : 110);
    // The stars land one by one.
    for (let i = 0; i < earned; i++) later.push({ t: stateT + 0.55 + i * 0.28, fn: () => {
      Kit.tone(NOTES[4 + i * 2], { type: 'triangle', dur: 0.3, vol: 0.18 });
      Kit.tone(NOTES[4 + i * 2] * 2, { type: 'sine', dur: 0.2, vol: 0.06 });
    } });
  }

  function moveCursor(dir) {
    const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[dir];
    const cx = cursor % COLS, cy = Math.floor(cursor / COLS);
    let bi = -1, bs = 1e9;
    // Skip cards already matched: the nearest open card that way, preferring the same row or column.
    cards.forEach((cd, i) => {
      if (cd.matched || i === cursor) return;
      const x = i % COLS, y = Math.floor(i / COLS);
      const along = (x - cx) * d[0] + (y - cy) * d[1];
      if (along <= 0) return;
      const side = Math.abs(d[0] ? y - cy : x - cx);
      const s = along + side * 1.6;
      if (s < bs) { bs = s; bi = i; }
    });
    if (bi >= 0) { cursor = bi; sfx.move(); }
  }

  // ---------- Sounds ----------
  function flipSound(v) {
    Kit.noise({ dur: 0.09, vol: 0.1 * v, freq: 3200, q: 0.8, sweep: 0.5 });
    Kit.tone(420 + Math.random() * 60, { type: 'triangle', dur: 0.07, vol: 0.09 * v, slide: 1.6 });
  }
  function matchSound(c) {
    const base = Math.min(c - 1, 4);
    [0, 2, 4].forEach((n, i) => Kit.tone(NOTES[Math.min(NOTES.length - 1, n + base)], { type: 'triangle', dur: 0.28, vol: 0.16, at: i * 0.06 }));
    Kit.tone(NOTES[Math.min(NOTES.length - 1, 5 + base)] * 2, { type: 'sine', dur: 0.4, vol: 0.05, at: 0.15 });
    Kit.noise({ dur: 0.3, vol: 0.05, freq: 7000, q: 0.5, sweep: 0.5, type: 'highpass' });
  }
  function dealSound(n) {
    for (let i = 0; i < Math.min(n, 14); i++) Kit.noise({ dur: 0.05, vol: 0.05, freq: 2600 + i * 80, q: 1, at: i * 0.05 });
  }

  // ---------- Layout ----------
  function layout(W, H) {
    L.top = Math.max(64, H * 0.13);
    const gapK = 0.14;
    const aw = W * 0.92, ah = H - L.top - H * 0.05;
    let cw = Math.min(aw / (COLS + (COLS - 1) * gapK), ah / (ROWS / RATIO + (ROWS - 1) * gapK));
    cw = Math.min(cw, H * 0.2);
    L.cw = cw; L.ch = cw / RATIO; L.gap = cw * gapK;
    L.bw = COLS * cw + (COLS - 1) * L.gap; L.bh = ROWS * L.ch + (ROWS - 1) * L.gap;
    L.bx = (W - L.bw) / 2; L.by = L.top + (ah - L.bh) / 2;
    L.u = Math.min(W, H * 1.6) / 30; // a text unit for menus and panels
    sprites.clear();
  }
  function cardXY(i) {
    const x = i % COLS, y = Math.floor(i / COLS);
    return [L.bx + x * (L.cw + L.gap) + L.cw / 2, L.by + y * (L.ch + L.gap) + L.ch / 2];
  }
  Kit.onResize((W, H) => layout(W, H));

  // ---------- Sprites: card backs, faces and shadows are drawn once per size ----------
  const sprites = new Map();
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
  // A card is a rounded slab: a darker edge below, then the top face.
  function slab(c, w, h, edge, top, bottom) {
    const r = w * 0.14, d = h * 0.045;
    roundRect(c, 1, 1 + d, w - 2, h - 2 - d, r); c.fillStyle = edge; c.fill();
    roundRect(c, 1, 1, w - 2, h - 2 - d, r);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    return { r, d };
  }
  function gloss(c, w, h, r, d) {
    c.save();
    roundRect(c, 1, 1, w - 2, h - 2 - d, r); c.clip();
    const g = c.createLinearGradient(0, 0, 0, h * 0.5);
    g.addColorStop(0, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.beginPath(); c.ellipse(w * 0.5, -h * 0.05, w * 0.75, h * 0.33, 0, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  const backSprite = (w, h) => sprite('back', w, h, (c) => {
    const { r, d } = slab(c, w, h, '#a3264a', '#ff8a5b', '#ef4d6a');
    const ih = h - 2 - d;
    c.save();
    roundRect(c, w * 0.08, w * 0.08, w * 0.84, ih - w * 0.16, r * 0.6); c.clip();
    // Diamond lattice
    c.strokeStyle = 'rgba(255,255,255,0.14)'; c.lineWidth = Math.max(1, w * 0.025);
    const step = w * 0.2;
    c.beginPath();
    for (let k = -h; k < w + h; k += step) { c.moveTo(k, 0); c.lineTo(k + h, h); c.moveTo(k, h); c.lineTo(k + h, 0); }
    c.stroke();
    c.restore();
    roundRect(c, w * 0.08, w * 0.08, w * 0.84, ih - w * 0.16, r * 0.6);
    c.lineWidth = Math.max(1.5, w * 0.03); c.strokeStyle = 'rgba(255,240,220,0.75)'; c.stroke();
    // Emblem: a soft disc with a big question mark.
    const cx = w / 2, cy = ih / 2, rr = w * 0.26;
    const g = c.createRadialGradient(cx - rr * 0.3, cy - rr * 0.4, rr * 0.1, cx, cy, rr);
    g.addColorStop(0, '#fff3c4'); g.addColorStop(0.6, GOLD); g.addColorStop(1, '#e89a00');
    c.fillStyle = 'rgba(120,20,50,0.35)'; c.beginPath(); c.arc(cx, cy + rr * 0.1, rr, 0, Math.PI * 2); c.fill();
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, rr, 0, Math.PI * 2); c.fill();
    c.font = `900 ${Math.round(rr * 1.35)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#c2410c'; c.fillText('?', cx, cy + rr * 0.08);
    gloss(c, w, h, r, d);
  });
  const faceSprite = (fi, w, h) => sprite('face' + fi, w, h, (c) => {
    const f = FACES[fi];
    const { r, d } = slab(c, w, h, '#c9a98a', '#fffdf7', '#ffe9d4');
    const ih = h - 2 - d, m = w * 0.08;
    roundRect(c, m, m, w - m * 2, ih - m * 2, r * 0.7);
    const g = c.createRadialGradient(w / 2, ih * 0.42, w * 0.05, w / 2, ih / 2, w * 0.7);
    g.addColorStop(0, shade(f.c, 0.6)); g.addColorStop(0.55, f.c); g.addColorStop(1, shade(f.c, -0.3));
    c.fillStyle = g; c.fill();
    // Sunburst rays behind the picture
    c.save(); c.clip();
    c.translate(w / 2, ih / 2); c.fillStyle = 'rgba(255,255,255,0.16)';
    for (let k = 0; k < 12; k++) {
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, h, (k * Math.PI) / 6, (k * Math.PI) / 6 + Math.PI / 14); c.closePath(); c.fill();
    }
    c.restore();
    const es = Math.round(w * 0.58);
    c.font = `${es}px "Noto Color Emoji", "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillText(f.e, w / 2 + w * 0.02, ih / 2 + w * 0.05);
    c.fillStyle = '#000'; c.fillText(f.e, w / 2, ih / 2 + w * 0.02);
    gloss(c, w, h, r, d);
  });
  const shadowSprite = (w, h) => sprite('shadow', w, h, (c) => {
    // Blurred once here; never in the frame loop.
    const p = w * 0.18;
    c.shadowColor = 'rgba(0,0,0,0.55)'; c.shadowBlur = p * 0.8; c.shadowOffsetY = p * 0.25;
    c.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(c, p, p, w - p * 2, h - p * 2, (w - p * 2) * 0.14); c.fill();
  });
  const starSprite = (s, on) => sprite(on ? 'star1' : 'star0', s, s, (c) => {
    c.translate(s / 2, s / 2);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 0.21 : 0.47) * s, a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    const g = c.createLinearGradient(0, -s / 2, 0, s / 2);
    if (on) { g.addColorStop(0, '#fff6c2'); g.addColorStop(0.5, GOLD); g.addColorStop(1, '#e08a00'); } else { g.addColorStop(0, '#47697a'); g.addColorStop(1, '#22394a'); }
    c.fillStyle = g; c.fill();
    c.lineJoin = 'round'; c.lineWidth = s * 0.05; c.strokeStyle = on ? '#a35d00' : '#152634'; c.stroke();
  });

  // ---------- Keys and taps ----------
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  const unlocked = () => Math.min(best, LEVELS.length - 1);

  function continueAfterClear() {
    if (level < LEVELS.length - 1) startLevel(level + 1); else startLevel(0);
  }

  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      const p = pick;
      if (k === 'left' || k === 'up') pick = Math.max(0, pick - 1);
      else if (k === 'right' || k === 'down') pick = Math.min(unlocked(), pick + 1);
      else if (k === 'ok') { sfx.pick(); startLevel(pick); return; }
      if (p !== pick) sfx.move();
      else if (k === 'right' || k === 'down') sfx.nope();
      return;
    }
    if (state === 'clear') {
      if (stateT - clearT < 1.0) return;
      if (k === 'ok') { sfx.pick(); continueAfterClear(); } else if (k !== 'undo' && k !== 'restart') { sfx.move(); toMenu(); }
      return;
    }
    if (k === 'restart') { startLevel(level); return; }
    if (k === 'ok') flip(cursor);
    else if (k === 'left' || k === 'right' || k === 'up' || k === 'down') moveCursor(k);
  });

  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = (L.tiles || []).findIndex((r) => inside(e, r));
        if (i < 0) return;
        if (i > unlocked()) { sfx.nope(); return; }
        if (i === pick) { sfx.pick(); startLevel(i); } else { pick = i; sfx.move(); }
        return;
      }
      if (state === 'clear') {
        if (stateT - clearT < 1.0) return;
        if (inside(e, L.menuBtn)) toMenu(); else continueAfterClear();
        return;
      }
      for (let i = 0; i < cards.length; i++) {
        const [x, y] = cardXY(i);
        if (Math.abs(e.x - x) <= L.cw / 2 + L.gap / 2 && Math.abs(e.y - y) <= L.ch / 2 + L.gap / 2) { cursor = i; flip(i); return; }
      }
    },
  });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (state === 'play') dealT += dt;
    for (let i = later.length - 1; i >= 0; i--) if (stateT >= later[i].t) { const f = later[i].fn; later.splice(i, 1); f(); }
    for (let i = 0; i < cards.length; i++) {
      const cd = cards[i];
      const tgt = cd.up || cd.matched ? 1 : 0;
      if (cd.f < tgt) cd.f = Math.min(tgt, cd.f + dt / FLIP); else if (cd.f > tgt) cd.f = Math.max(tgt, cd.f - dt / FLIP);
      const hv = state === 'play' && i === cursor ? 1 : 0;
      cd.hover += (hv - cd.hover) * Math.min(1, dt * 14);
    }
    if (second >= 0 && waitT > 0) { waitT -= dt; if (waitT <= 0) hide(); }
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    if (state === 'play' && doneAt >= 0 && stateT >= doneAt) finishLevel();
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(3,14,26,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#16607a'); g.addColorStop(1, '#0a2a3d');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }

  // One card at (x, y), turned f (0 back .. 1 face), with lift, pop and fade.
  function drawCard(c, x, y, w, h, face, f, opts) {
    const e = ease.inOut(clamp(f, 0, 1));
    const ang = e * Math.PI;
    const sx = Math.max(0.03, Math.abs(Math.cos(ang)));
    const lift = Math.sin(ang) * 0.09 + (opts.hover || 0) * 0.07;
    const sc = (1 + lift) * (opts.scale || 1);
    const alpha = opts.alpha == null ? 1 : opts.alpha;
    // Shadow grows as the card lifts.
    const sw = w * 1.36, sh = h * 1.3;
    c.globalAlpha = alpha * (0.75 - lift * 1.5);
    c.drawImage(shadowSprite(sw, sh), x - (sw * sx * sc) / 2, y - sh / 2 + h * (0.04 + lift * 0.5), sw * sx * sc, sh);
    c.globalAlpha = alpha;
    c.save();
    c.translate(x + (opts.dx || 0), y - h * lift * 0.35);
    c.scale(sx * sc, sc);
    const img = e > 0.5 ? faceSprite(face, w, h) : backSprite(w, h);
    c.drawImage(img, -w / 2, -h / 2, w, h);
    if (opts.red) {
      roundRect(c, -w / 2 + 1, -h / 2 + 1, w - 2, h * 0.955 - 2, w * 0.14);
      c.fillStyle = `rgba(255,40,70,${0.35 * opts.red})`; c.fill();
    }
    if (opts.flash) {
      roundRect(c, -w / 2 + 1, -h / 2 + 1, w - 2, h * 0.955 - 2, w * 0.14);
      c.fillStyle = `rgba(255,255,255,${0.6 * opts.flash})`; c.fill();
    }
    if (opts.ring) {
      roundRect(c, -w / 2 - 6, -h / 2 - 6, w + 12, h * 0.955 + 12, w * 0.18);
      c.lineWidth = 10; c.strokeStyle = rgba(GOLD, 0.25 * opts.ring); c.stroke();
      c.lineWidth = 4; c.strokeStyle = rgba(GOLD, opts.ring); c.stroke();
    }
    c.restore();
    c.globalAlpha = 1;
  }

  function drawBoard(c, t) {
    const { cw, ch } = L;
    // A soft tray behind the cards
    const p = L.gap * 1.4;
    roundRect(c, L.bx - p, L.by - p, L.bw + p * 2, L.bh + p * 2, cw * 0.22);
    c.fillStyle = 'rgba(4,22,36,0.55)'; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(127,230,255,0.18)'; c.stroke();
    // Cursor card last so its glow sits on top.
    const order = cards.map((_, i) => i).filter((i) => i !== cursor);
    if (cards.length) order.push(cursor);
    for (const i of order) {
      const cd = cards[i];
      let [x, y] = cardXY(i);
      const dp = clamp((dealT - cd.delay) / 0.45, 0, 1);
      if (dp <= 0) continue;
      y += (1 - ease.out(dp)) * Kit.H * 0.6;
      const o = { hover: cd.hover, scale: ease.back(dp) * (0.6 + 0.4 * dp), alpha: Math.min(1, dp * 2) };
      if (cd.matchT >= 0) {
        const m = stateT - cd.matchT;
        o.scale *= 1 + 0.2 * Math.sin(clamp(m / 0.35, 0, 1) * Math.PI);
        o.flash = clamp(1 - m / 0.3, 0, 1);
        o.alpha *= 1 - 0.62 * clamp((m - 0.7) / 0.5, 0, 1);
        o.hover = cd.hover * 0.4;
      }
      if (cd.shakeT >= 0) {
        const s = stateT - cd.shakeT;
        if (s < 0.5) { o.dx = Math.sin(s * 48) * cw * 0.09 * (1 - s / 0.5); o.red = 1 - s / 0.5; }
      }
      if (i === cursor && state === 'play') o.ring = 0.7 + Math.sin(t * 6) * 0.3;
      drawCard(c, x, y, cw, ch, cd.face, cd.f, o);
      // Sparkle ring after a match
      if (cd.matchT >= 0) {
        const m = stateT - cd.matchT;
        if (m > 0 && m < 0.5) {
          c.globalAlpha = 1 - m / 0.5;
          c.strokeStyle = GOLD; c.lineWidth = 4 * (1 - m / 0.5) + 1;
          c.beginPath(); c.arc(x, y, cw * (0.5 + m * 1.6), 0, Math.PI * 2); c.stroke();
          c.globalAlpha = 1;
        }
      }
    }
  }

  function drawHud(c, t) {
    const W = Kit.W, ty = L.top / 2, hs = L.top * 0.44;
    const left = Math.max(20, W * 0.04);
    outlined(c, `Level ${level + 1}`, left, ty - hs * 0.15, hs * 0.85, '#ffffff', '#7fe6ff', 'left');
    text(c, `${COLS}×${ROWS}  ·  ${cards.filter((q) => q.matched).length / 2} of ${cards.length / 2} pairs`, left, ty + hs * 0.64, hs * 0.42, 'rgba(255,255,255,0.75)', 700, 'left');
    c.save();
    c.translate(W / 2, ty - hs * 0.08); c.scale(1 + bump * 0.2, 1 + bump * 0.2);
    outlined(c, String(Math.round(shown)), 0, 0, hs * 1.05, '#fff6c2', '#ffb703');
    c.restore();
    const cl = 1 - (stateT - comboT) / 2.5;
    if (combo >= 2 && cl > 0) {
      c.globalAlpha = Math.min(1, cl * 3);
      text(c, `combo ×${combo}`, W / 2, ty + hs * 0.72, hs * 0.42, '#7fe6ff', 900);
      c.globalAlpha = 1;
    }
    // Right: moves and the stars these moves would earn now.
    const right = W - 76;
    const n = cards.length / 2, st = starsFor(Math.max(moves, 0), n);
    const ss = hs * 0.62;
    for (let i = 0; i < 3; i++) c.drawImage(starSprite(ss, i < st), right - (3 - i) * ss * 1.02, ty - hs * 0.15 - ss / 2, ss, ss);
    text(c, `Moves ${moves}   👑 ${best}/5`, right, ty + hs * 0.64, hs * 0.42, 'rgba(255,255,255,0.8)', 700, 'right');
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#0d4256', '#050f1c', 'rgba(90,220,255,0.09)');
    if (!L.cw) layout(W, H);
    if (state === 'menu') drawMenu(c, t);
    else {
      drawBoard(c, t);
      drawHud(c, t);
      if (state === 'play' && dealT < dealEnd + 1.2 && dealT > 0.6) {
        const a = clamp(Math.min((dealT - 0.6) / 0.3, (dealEnd + 1.2 - dealT) / 0.4), 0, 1);
        c.globalAlpha = a;
        const msg = Kit.touchFirst() ? 'Tap two cards to find a pair' : 'Arrows move  ·  OK flips  ·  find the pairs';
        const hy = L.by + L.bh * 0.62, hw = Math.min(W * 0.94, L.u * 17);
        roundRect(c, W / 2 - hw / 2, hy - L.u * 0.7, hw, L.u * 1.4, L.u * 0.7);
        c.fillStyle = 'rgba(3,14,26,0.82)'; c.fill();
        text(c, msg, W / 2, hy, L.u * 0.6, '#ffffff', 700);
        c.globalAlpha = 1;
      }
      if (state === 'clear') drawClear(c, t);
    }
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const wide = W > H * 1.1;
    outlined(c, 'MEMORY MATCH', W / 2, H * 0.1, Math.min(u * 2.2, W * 0.09), '#fff6e0', '#ff8a5b');
    // A row of cards turning over, one after another.
    const hero = [0, 5, 8, 11, 7];
    const hh = Math.min(H * 0.21, W * 0.17), hw = hh * RATIO, hg = hw * 0.22;
    const hx0 = W / 2 - (hero.length * hw + (hero.length - 1) * hg) / 2 + hw / 2;
    hero.forEach((fi, i) => {
      const uu = ((t - i * 0.22) % 4 + 4) % 4;
      const f = uu < 0.4 ? uu / 0.4 : uu < 2.2 ? 1 : uu < 2.6 ? 1 - (uu - 2.2) / 0.4 : 0;
      drawCard(c, hx0 + i * (hw + hg), H * 0.31 + Math.sin(t * 2 + i) * hh * 0.03, hw, hh, fi, f, {});
    });
    // Level tiles
    const n = LEVELS.length;
    let tw, th, gap, x0, y0;
    if (wide) {
      gap = u * 0.6; tw = Math.min((W * 0.9 - gap * (n - 1)) / n, u * 5); th = tw * 1.05;
      x0 = W / 2 - (n * tw + (n - 1) * gap) / 2; y0 = H * 0.66 - th / 2;
      L.tiles = LEVELS.map((_, i) => ({ x: x0 + i * (tw + gap), y: y0, w: tw, h: th }));
    } else {
      gap = u * 0.35; tw = Math.min(W * 0.84, u * 16); th = Math.min((H * 0.5 - gap * (n - 1)) / n, u * 2.6);
      x0 = (W - tw) / 2; y0 = H * 0.47;
      L.tiles = LEVELS.map((_, i) => ({ x: x0, y: y0 + i * (th + gap), w: tw, h: th }));
    }
    text(c, Kit.touchFirst() ? 'Tap a level to play' : '◀ ▶ choose a level  ·  OK play  ·  Back for games', W / 2, (wide ? y0 - u * 0.9 : y0 - u * 0.8), u * 0.62, 'rgba(255,255,255,0.85)', 700);
    LEVELS.forEach(([cc, rr], i) => {
      const r = L.tiles[i], on = i === pick, locked = i > unlocked();
      const k = on ? 1.07 + Math.sin(t * 5) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      c.globalAlpha = locked ? 0.5 : 1;
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, Math.min(r.w, r.h) * 0.16, on ? GOLD : 'rgba(127,230,255,0.3)');
      if (on) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,210,63,0.5)'; c.stroke(); }
      const ss = wide ? r.w * 0.2 : r.h * 0.4;
      if (wide) {
        text(c, `Level ${i + 1}`, 0, -r.h * 0.33, r.h * 0.13, '#ffffff', 900);
        miniGrid(c, 0, -r.h * 0.04, cc, rr, r.w * 0.5, r.h * 0.3);
        text(c, `${cc}×${rr}`, 0, r.h * 0.2, r.h * 0.09, 'rgba(255,255,255,0.75)', 700);
        if (locked) text(c, '🔒', 0, r.h * 0.36, r.h * 0.12, '#fff', 400);
        else for (let s = 0; s < 3; s++) c.drawImage(starSprite(ss, s < stars[i]), (s - 1.5) * ss * 1.05, r.h * 0.36 - ss / 2, ss, ss);
      } else {
        text(c, `Level ${i + 1}`, -r.w * 0.44, -r.h * 0.14, r.h * 0.3, '#ffffff', 900, 'left');
        text(c, `${cc}×${rr} · ${cc * rr / 2} pairs`, -r.w * 0.44, r.h * 0.22, r.h * 0.2, 'rgba(255,255,255,0.75)', 700, 'left');
        if (locked) text(c, '🔒', r.w * 0.36, 0, r.h * 0.36, '#fff', 400);
        else for (let s = 0; s < 3; s++) c.drawImage(starSprite(ss, s < stars[i]), r.w * 0.44 - (3 - s) * ss * 1.05, -ss / 2, ss, ss);
      }
      c.restore();
    });
    c.globalAlpha = 1;
    const tipY = wide ? y0 + th + u * 1.1 : y0 + n * (th + gap) + u * 0.5;
    text(c, best > 0 ? `👑 ${best} of 5 levels done  ·  fewer moves = more stars` : 'Fewer moves = more stars  ·  match in a row for a combo', W / 2, Math.min(tipY, H - u * 0.6), u * 0.55, 'rgba(255,255,255,0.72)', 600);
  }
  function miniGrid(c, x, y, cc, rr, w, h) {
    const g = 0.25;
    const s = Math.min(w / (cc + (cc - 1) * g), h / ((rr / RATIO) + (rr - 1) * g));
    const sw = s, sh = s / RATIO, gp = s * g;
    const tw = cc * sw + (cc - 1) * gp, thh = rr * sh + (rr - 1) * gp;
    c.fillStyle = '#ff7a62';
    for (let j = 0; j < rr; j++) for (let i = 0; i < cc; i++) {
      roundRect(c, x - tw / 2 + i * (sw + gp), y - thh / 2 + j * (sh + gp), sw, sh, sw * 0.2); c.fill();
    }
  }

  function drawClear(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((stateT - clearT) / 0.4, 0, 1);
    c.fillStyle = `rgba(3,12,22,${0.7 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.9, u * 15), ph = Math.min(H * 0.86, u * 11);
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.8, GOLD);
    const last = level === LEVELS.length - 1;
    outlined(c, last ? 'All levels done!' : `Level ${level + 1} clear!`, 0, -ph * 0.37, u * 1.25, '#ffffff', '#7fe6ff');
    const ss = u * 2.3;
    for (let i = 0; i < 3; i++) {
      const at = 0.55 + i * 0.28, p = clamp((stateT - clearT - at) / 0.35, 0, 1);
      const on = i < earned && p > 0;
      const sc = on ? ease.back(p) * (1 + Math.sin(t * 3 + i) * 0.03) : 1;
      const sx = (i - 1) * ss * 1.1, sy = -ph * 0.12 + (i === 1 ? -ss * 0.18 : 0);
      c.drawImage(starSprite(ss, false), sx - ss / 2, sy - ss / 2, ss, ss);
      if (on) c.drawImage(starSprite(ss, true), sx - (ss * sc) / 2, sy - (ss * sc) / 2, ss * sc, ss * sc);
    }
    outlined(c, String(score), 0, ph * 0.1, u * 1.2, '#fff6c2', '#ffb703');
    text(c, `${moves} moves  ·  best combo ×${Math.max(1, bestCombo)}${newBest ? '  ·  🎉 new record' : ''}`, 0, ph * 0.22, u * 0.55, 'rgba(255,255,255,0.85)', 700);
    const ready = stateT - clearT > 1.0;
    c.globalAlpha = ready ? 1 : 0.4;
    const okMsg = last ? 'play again' : 'next level';
    text(c, Kit.touchFirst() ? `Tap for ${okMsg}` : `OK  ${okMsg}`, 0, ph * 0.32, u * 0.68, '#9ff0ff', 800);
    const bw = u * 6.5, bh = u * 0.95;
    roundRect(c, -bw / 2, ph * 0.38, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Choose a level' : 'Arrows  choose a level', 0, ph * 0.38 + bh / 2, u * 0.45, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + ph * 0.38 * k, w: bw * k, h: bh * k };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  Kit.canvas.focus();
  if (best > 0) Kit.record('memorymatch', best);
})();
