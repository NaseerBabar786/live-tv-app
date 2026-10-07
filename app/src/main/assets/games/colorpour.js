// Color Pour: pour the coloured liquids between glass tubes until every tube holds one colour.
// You may pour onto the same colour or into an empty tube, as much as fits. Each level adds colours.
// Remote: arrows pick a tube, OK lifts it, arrows and OK again pour it. Undo, Restart and an extra
// tube sit under the tubes. Touch and mouse: tap a tube, then tap where to pour.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const CAP = 4;
  const COLORS = ['#ff3b5c', '#ffd60a', '#3f6bff', '#1fbf6a', '#ff8c1a', '#a45bff', '#13c4c4', '#ff5cc8',
    '#9be15d', '#8a5a3c', '#38b6ff', '#e9e9f2'];

  // ---------- Levels ----------
  let level = Kit.store.get('colorpour.level', 1);
  let tubes, start, history, moves, extraUsed, won, wonT, done;
  let cursor = 0, sel = -1, anim = null, nopeT = 0, nopeTube = -1, introT = 0;
  const lift = []; // how far each tube is lifted, eased

  const colorsFor = (lv) => Math.min(COLORS.length, 3 + Math.floor(lv / 2));
  const full = (t) => t.length === CAP && t.every((x) => x === t[0]);
  const solved = (ts) => ts.every((t) => t.length === 0 || full(t));
  function canPour(ts, a, b) {
    if (a === b) return false;
    const A = ts[a], B = ts[b];
    if (!A.length || B.length >= CAP) return false;
    return !B.length || B[B.length - 1] === A[A.length - 1];
  }
  function pourCount(ts, a, b) {
    const A = ts[a], B = ts[b], top = A[A.length - 1];
    let run = 0;
    for (let i = A.length - 1; i >= 0 && A[i] === top; i--) run++;
    return Math.min(run, CAP - B.length);
  }
  // Checks a deal can be solved, so no level is a dead end from the start.
  function solvable(ts0) {
    const seen = new Set();
    const stack = [ts0.map((t) => t.slice())];
    let nodes = 0;
    while (stack.length && nodes < 40000) {
      const ts = stack.pop(); nodes++;
      if (solved(ts)) return true;
      const key = ts.map((t) => t.join(',')).sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      for (let a = 0; a < ts.length; a++) {
        if (!ts[a].length || full(ts[a])) continue;
        const uniform = ts[a].every((x) => x === ts[a][0]);
        let emptyTried = false;
        for (let b = 0; b < ts.length; b++) {
          if (!canPour(ts, a, b)) continue;
          if (!ts[b].length) { if (uniform || emptyTried) continue; emptyTried = true; }
          const n = pourCount(ts, a, b);
          const next = ts.map((t) => t.slice());
          for (let i = 0; i < n; i++) next[b].push(next[a].pop());
          stack.push(next);
        }
      }
    }
    return nodes >= 40000; // too big to check fully: almost always fine with two spare tubes and Undo
  }
  function deal(lv) {
    const n = colorsFor(lv);
    let ts = null;
    for (let tries = 0; tries < 40; tries++) {
      const balls = [];
      for (let c = 0; c < n; c++) for (let k = 0; k < CAP; k++) balls.push(c);
      for (let i = balls.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [balls[i], balls[j]] = [balls[j], balls[i]]; }
      ts = [];
      for (let c = 0; c < n; c++) ts.push(balls.slice(c * CAP, c * CAP + CAP));
      ts.push([], []);
      if (ts.some(full)) continue;
      if (solvable(ts)) break;
    }
    return ts;
  }
  function begin(again) {
    if (!again) start = deal(level);
    tubes = start.map((t) => t.slice());
    history = []; moves = 0; extraUsed = false; won = false; done = false; sel = -1; anim = null;
    cursor = 0; lift.length = 0;
    layoutTubes();
    Kit.store.set('colorpour.game', { level, start, tubes, moves });
  }
  const savedGame = Kit.store.get('colorpour.game', null);
  if (savedGame && savedGame.level === level && savedGame.tubes) {
    start = savedGame.start; tubes = savedGame.tubes; history = []; moves = savedGame.moves || 0;
    extraUsed = tubes.length > start.length; won = false; done = false;
  } else { start = deal(level); tubes = start.map((t) => t.slice()); history = []; moves = 0; extraUsed = false; won = false; done = false; }

  // ---------- Layout ----------
  let L = { tubes: [], buttons: [] };
  const BUTTONS = [
    { id: 'undo', label: '↶  Undo', short: '↶ Undo' },
    { id: 'restart', label: '⟳  Restart', short: '⟳ Again' },
    { id: 'extra', label: '＋  Extra tube', short: '＋ Tube' },
  ];
  function layoutTubes() {
    const W = Kit.W, H = Kit.H;
    if (!W) return;
    const T = tubes.length;
    const rows = T > 7 || (W / H < 0.8 && T > 5) ? 2 : 1;
    const perRow = Math.ceil(T / rows);
    const top = H * 0.2, bottom = H * 0.8;
    const rowH = (bottom - top) / rows;
    const tw = Math.min((W * 0.92) / perRow * (W < H ? 0.66 : 0.52), rowH * 0.24, 92);
    const th = Math.min(tw * 4.1, rowH * 0.8);
    const gap = Math.min((W * 0.9 - perRow * tw) / Math.max(1, perRow), tw * 1.4);
    L.tubes = tubes.map((_, i) => {
      const row = Math.floor(i / perRow), inRow = Math.min(perRow, T - row * perRow), k = i - row * perRow;
      const rowW = inRow * tw + (inRow - 1) * gap;
      return { x: (W - rowW) / 2 + k * (tw + gap) + tw / 2, y: top + row * rowH + (rowH - th) / 2 + th * 0.06 };
    });
    L.tw = tw; L.th = th; L.u = (th - tw * 0.32) / CAP;
    const bw = Math.min(W * 0.29, 230), bh = Math.max(44, Math.min(H * 0.075, 58)), bgap = Math.min(18, W * 0.02);
    const totalW = BUTTONS.length * bw + (BUTTONS.length - 1) * bgap;
    L.narrow = bw < 170;
    L.buttons = BUTTONS.map((b, i) => ({ ...b, label: L.narrow ? b.short : b.label, x: (W - totalW) / 2 + i * (bw + bgap), y: H - bh - H * 0.04, w: bw, h: bh }));
  }
  Kit.onResize(layoutTubes);

  // ---------- Moves ----------
  function snapshot() { return tubes.map((t) => t.slice()); }
  function select(i) {
    if (anim || won) return;
    if (sel < 0) {
      if (!tubes[i].length || full(tubes[i])) { nope(i); return; }
      sel = i; sfx.pick(); return;
    }
    if (sel === i) { sel = -1; sfx.move(); return; }
    if (!canPour(tubes, sel, i)) {
      // A different tube that can be lifted is taken up instead, like the phone games do.
      if (tubes[i].length && !full(tubes[i])) { sel = i; sfx.pick(); } else nope(i);
      return;
    }
    const n = pourCount(tubes, sel, i);
    const color = tubes[sel][tubes[sel].length - 1];
    anim = { from: sel, to: i, n, color, t: 0, before: tubes[i].length, src: tubes[sel].length, dur: 0.16 + n * 0.12 };
    history.push(snapshot());
    sel = -1;
  }
  function finishPour() {
    const { from, to, n } = anim;
    for (let k = 0; k < n; k++) tubes[to].push(tubes[from].pop());
    moves++;
    const p = L.tubes[to];
    if (full(tubes[to])) {
      sfx.chime();
      Kit.burst(p.x, p.y, COLORS[tubes[to][0]], 26, 1);
      Kit.float('✔', p.x, p.y - L.tw * 0.6, { color: '#9ff0a0', size: L.tw * 0.7 });
    }
    if (solved(tubes)) {
      won = true; wonT = performance.now() / 1000;
      setTimeout(() => { sfx.win(); Kit.confetti(160); }, 250);
      Kit.record('colorpour', level);
    }
    Kit.store.set('colorpour.game', { level, start, tubes, moves });
  }
  function nope(i) { nopeT = performance.now() / 1000; nopeTube = i; sfx.nope(); }
  function press(id) {
    if (anim) return;
    if (id === 'undo') {
      if (!history.length) { nope(-1); return; }
      tubes = history.pop(); moves = Math.max(0, moves - 1); sel = -1;
      if (tubes.length !== L.tubes.length) layoutTubes();
      sfx.move();
    } else if (id === 'restart') { begin(true); sfx.pick(); }
    else if (id === 'extra') {
      if (extraUsed) { nope(-1); Kit.float('One extra tube a level', Kit.W / 2, Kit.H * 0.14, { color: '#ffd60a', size: 26 }); return; }
      extraUsed = true; history.push(snapshot()); tubes.push([]); layoutTubes(); sfx.chime();
    }
    Kit.store.set('colorpour.game', { level, start, tubes, moves });
  }
  function next() {
    level++; Kit.store.set('colorpour.level', level);
    begin(false); sfx.pick();
  }

  // ---------- Keys: arrows move between tubes and the buttons below ----------
  function items() {
    return [...L.tubes.map((p, i) => ({ i, x: p.x, y: p.y + L.th / 2 })), ...L.buttons.map((b, k) => ({ i: tubes.length + k, x: b.x + b.w / 2, y: b.y + b.h / 2 }))];
  }
  function moveCursor(dir) {
    const all = items(), cur = all.find((it) => it.i === cursor) || all[0];
    let best = null, score = Infinity;
    for (const it of all) {
      if (it.i === cursor) continue;
      const dx = it.x - cur.x, dy = it.y - cur.y;
      let main, side;
      if (dir === 'left') { if (dx >= -1) continue; main = -dx; side = Math.abs(dy); }
      else if (dir === 'right') { if (dx <= 1) continue; main = dx; side = Math.abs(dy); }
      else if (dir === 'up') { if (dy >= -1) continue; main = -dy; side = Math.abs(dx); }
      else { if (dy <= 1) continue; main = dy; side = Math.abs(dx); }
      const s = main + side * 3;
      if (s < score) { score = s; best = it; }
    }
    if (best) { cursor = best.i; sfx.move(); }
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (won) { if (k === 'ok' && performance.now() / 1000 - wonT > 0.9) next(); return; }
    if (k === 'undo') { press('undo'); return; }
    if (k === 'restart') { press('restart'); return; }
    if (k === 'ok') {
      if (cursor < tubes.length) select(cursor); else press(BUTTONS[cursor - tubes.length].id);
      return;
    }
    moveCursor(k);
  });
  const muteBox = () => ({ x: Kit.W - 58, y: 10, w: 48, h: 48 });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (won) { if (performance.now() / 1000 - wonT > 0.9) next(); return; }
      const bi = L.buttons.findIndex((b) => e.x >= b.x && e.x <= b.x + b.w && e.y >= b.y && e.y <= b.y + b.h);
      if (bi >= 0) { cursor = tubes.length + bi; press(L.buttons[bi].id); return; }
      const ti = L.tubes.findIndex((p) => Math.abs(e.x - p.x) < L.tw * 0.5 + 14 && e.y > p.y - L.th * 0.2 && e.y < p.y + L.th + 14);
      if (ti >= 0) { cursor = ti; select(ti); }
    },
  });

  // ---------- Drawing ----------
  function tubePath(c, tw, th) {
    const r = tw / 2;
    c.beginPath();
    c.moveTo(-r, 0);
    c.lineTo(-r, th - r);
    c.arc(0, th - r, r, Math.PI, 0, true);
    c.lineTo(r, 0);
  }
  /**
   * One tube. Its local frame has the mouth's centre at (0, 0) and the bottom at (0, th).
   * [pivot] is the local point placed at world [at], turned by [angle]. [layers] are colour amounts
   * from the bottom (amounts can be fractions while pouring); the liquid always lies level.
   */
  function drawTube(c, { at, pivot = { x: 0, y: 0 }, angle = 0, layers, glow = 0, cap = false, toMouth = 0 }) {
    const { tw, th, u } = L;
    const base = c.getTransform();
    c.save();
    c.translate(at.x, at.y); c.rotate(angle); c.translate(-pivot.x, -pivot.y);
    const local = c.getTransform();
    // Glass back
    tubePath(c, tw, th); c.closePath();
    c.fillStyle = 'rgba(255,255,255,0.07)'; c.fill();
    // Liquid, clipped to the inside of the glass, in level bands across the world.
    const total = layers.reduce((s, l) => s + l.amount, 0);
    if (total > 0.001) {
      c.save();
      const inset = tw * 0.09;
      c.beginPath();
      c.moveTo(-tw / 2 + inset, 0);
      c.lineTo(-tw / 2 + inset, th - tw / 2);
      c.arc(0, th - tw / 2, tw / 2 - inset, Math.PI, 0, true);
      c.lineTo(tw / 2 - inset, 0);
      c.closePath();
      c.clip();
      const toWorld = (x, y) => { const m = local; return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; };
      const bottomC = toWorld(0, th - tw / 2);
      const dpr = base.a || 1;
      const lowest = bottomC.y + (tw / 2 - inset) * dpr;
      const upright = toWorld(0, th - inset - total * u).y;
      const mouth = toWorld(pivot.x, 0).y;
      const surface = Math.min(lowest - 1, lerp(upright, mouth, toMouth));
      c.setTransform(1, 0, 0, 1, 0, 0);
      const cx = bottomC.x, span = th * 2 * dpr;
      let acc = 0;
      for (const l of layers) {
        if (l.amount <= 0) continue;
        const y0 = lowest - (lowest - surface) * (acc / total);
        const y1 = lowest - (lowest - surface) * ((acc + l.amount) / total);
        const col = COLORS[l.color];
        const g = c.createLinearGradient(cx - tw * dpr, 0, cx + tw * dpr, 0);
        g.addColorStop(0, shade(col, -0.25)); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.35));
        c.fillStyle = g;
        c.fillRect(cx - span, y1 - 0.5, span * 2, y0 - y1 + 1);
        acc += l.amount;
      }
      // The surface shines.
      c.fillStyle = 'rgba(255,255,255,0.35)';
      c.fillRect(cx - span, surface, span * 2, Math.max(2, 3 * dpr));
      c.restore();
    }
    // Glass edge and shine
    c.setTransform(local);
    tubePath(c, tw, th);
    c.lineWidth = Math.max(2, tw * 0.06);
    c.strokeStyle = glow ? `rgba(255,236,120,${0.6 + glow * 0.4})` : 'rgba(225,240,255,0.75)';
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(c, -tw * 0.32, th * 0.08, tw * 0.12, th * 0.62, tw * 0.06); c.fill();
    // Lip
    roundRect(c, -tw * 0.62, -tw * 0.08, tw * 1.24, tw * 0.16, tw * 0.08);
    c.fillStyle = 'rgba(225,240,255,0.85)'; c.fill();
    if (cap) {
      roundRect(c, -tw * 0.42, -tw * 0.42, tw * 0.84, tw * 0.36, tw * 0.1);
      const g = c.createLinearGradient(0, -tw * 0.42, 0, -tw * 0.06);
      g.addColorStop(0, '#d9a066'); g.addColorStop(1, '#8a5a2e');
      c.fillStyle = g; c.fill();
    }
    c.restore();
    c.setTransform(base);
  }
  const layersOf = (t) => {
    const out = [];
    for (const x of t) { const last = out[out.length - 1]; if (last && last.color === x) last.amount++; else out.push({ color: x, amount: 1 }); }
    return out;
  };

  function update(dt) {
    introT += dt;
    tubes.forEach((_, i) => { lift[i] = lerp(lift[i] || 0, sel === i ? 1 : 0, Math.min(1, dt * 16)); });
    if (anim) {
      anim.t += dt;
      const total = 0.3 + anim.dur + 0.28;
      if (!anim.sounded && anim.t > 0.3) { anim.sounded = true; sfx.pour(anim.dur); }
      if (anim.t >= 0.3 + anim.dur && !anim.committed) { anim.committed = true; finishPour(); }
      if (anim.t >= total) anim = null;
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, now = performance.now() / 1000;
    Kit.background(c, t, '#0b3a5c', '#04111f', 'rgba(60,200,255,0.08)');
    const { tw, th, u } = L;

    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.font = `900 ${Math.round(Math.min(H * 0.07, 46))}px system-ui, sans-serif`;
    c.lineJoin = 'round'; c.lineWidth = 6; c.strokeStyle = 'rgba(0,20,40,0.8)';
    c.strokeText(`Level ${level}`, W / 2, H * 0.075);
    const lg = c.createLinearGradient(0, H * 0.04, 0, H * 0.11);
    lg.addColorStop(0, '#ffffff'); lg.addColorStop(1, '#7fe3ff');
    c.fillStyle = lg; c.fillText(`Level ${level}`, W / 2, H * 0.075);
    c.font = `700 ${Math.round(Math.min(H * 0.033, 20))}px system-ui, sans-serif`;
    c.fillStyle = 'rgba(255,255,255,0.6)';
    c.fillText(`Moves ${moves}`, W / 2, H * 0.135);

    // Tubes at rest (the one pouring is drawn last, on top).
    const rest = (i) => ({ x: L.tubes[i].x, y: L.tubes[i].y - lift[i] * th * 0.14 });
    tubes.forEach((tube, i) => {
      if (anim && i === anim.from) return;
      let layers = layersOf(tube);
      if (anim && i === anim.to) {
        const p = clamp((anim.t - 0.3) / anim.dur, 0, 1);
        layers = layersOf(tube);
        if (!anim.committed) layers.push({ color: anim.color, amount: anim.n * p });
      }
      const shakeX = i === nopeTube && now - nopeT < 0.3 ? Math.sin((now - nopeT) * 60) * tw * 0.1 : 0;
      const pos = rest(i);
      drawTube(c, { at: { x: pos.x + shakeX, y: pos.y }, layers, glow: sel === i ? 1 : 0, cap: full(tube) && !(anim && anim.to === i && !anim.committed) });
      // The remote's cursor: a glowing arrow under the tube.
      if (cursor === i && !won && !Kit.touchFirst()) {
        const y = L.tubes[i].y + th + tw * 0.35 + Math.sin(t * 6) * 4;
        c.fillStyle = '#ffd60a';
        c.beginPath(); c.moveTo(pos.x, y); c.lineTo(pos.x - tw * 0.28, y + tw * 0.3); c.lineTo(pos.x + tw * 0.28, y + tw * 0.3); c.closePath(); c.fill();
      }
    });

    if (anim) {
      const i = anim.from, s = L.tubes[anim.to].x >= L.tubes[i].x ? 1 : -1;
      const fill = anim.src / CAP;
      const tilt = s * (lerp(1.45, 1.0, fill));
      const move = anim.t < 0.3 ? ease.inOut(anim.t / 0.3) : anim.t < 0.3 + anim.dur ? 1 : 1 - ease.inOut((anim.t - 0.3 - anim.dur) / 0.28);
      const p = clamp((anim.t - 0.3) / anim.dur, 0, 1);
      const restPivot = { x: L.tubes[i].x + s * tw / 2, y: L.tubes[i].y - th * 0.14 };
      const target = L.tubes[anim.to];
      const pourAt = { x: target.x - s * tw * 0.12, y: target.y - th * 0.3 };
      const at = { x: lerp(restPivot.x, pourAt.x, move), y: lerp(restPivot.y, pourAt.y, move) };
      const src = tubes[i].slice();
      let layers = layersOf(src);
      if (!anim.committed) { const top = layers[layers.length - 1]; top.amount -= anim.n * p; }
      // Liquid stream from the lip down into the target.
      if (anim.t > 0.3 && anim.t < 0.3 + anim.dur) {
        const into = target.y + th - (anim.before + anim.n * p) * u - tw * 0.1;
        const sw = tw * 0.16 * (p < 0.15 ? p / 0.15 : p > 0.85 ? (1 - p) / 0.15 : 1);
        c.fillStyle = COLORS[anim.color];
        c.fillRect(at.x - sw / 2 + Math.sin(t * 40) * 0.8, at.y, sw, Math.max(0, into - at.y));
        c.fillStyle = 'rgba(255,255,255,0.35)';
        c.fillRect(at.x - sw / 2 + sw * 0.15, at.y, sw * 0.2, Math.max(0, into - at.y));
        if (Math.random() < 0.5) Kit.burst(at.x, into, COLORS[anim.color], 1, 0.25);
      }
      drawTube(c, { at, pivot: { x: s * tw / 2, y: 0 }, angle: tilt * move, layers, toMouth: move });
    }

    // Buttons
    L.buttons.forEach((b, k) => {
      const on = cursor === tubes.length + k && !won && !Kit.touchFirst();
      const off = (b.id === 'undo' && !history.length) || (b.id === 'extra' && extraUsed);
      roundRect(c, b.x, b.y, b.w, b.h, b.h / 2);
      const g = c.createLinearGradient(0, b.y, 0, b.y + b.h);
      g.addColorStop(0, on ? '#ffe45c' : 'rgba(255,255,255,0.16)'); g.addColorStop(1, on ? '#ffb703' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.25)'; c.stroke();
      c.font = `800 ${Math.round(Math.min(b.h * 0.38, b.w * 0.13))}px system-ui, sans-serif`;
      c.fillStyle = on ? '#2b1600' : off ? 'rgba(255,255,255,0.35)' : '#fff';
      c.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    });

    const m = muteBox();
    c.font = `${Math.round(m.h * 0.55)}px system-ui, sans-serif`;
    c.globalAlpha = 0.7; c.fillStyle = '#fff';
    c.fillText(Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2);
    c.globalAlpha = 1;

    if (introT < 6 && level <= 2 && moves === 0) {
      c.globalAlpha = Math.min(1, introT * 2, (6 - introT) * 2);
      c.font = `700 ${Math.round(Math.min(H * 0.035, 22))}px system-ui, sans-serif`;
      c.fillStyle = '#fff';
      const tip = Kit.touchFirst() ? ['Tap a tube, then tap where to pour.', 'One colour in each tube!']
        : ['Arrows pick a tube, OK lifts it, OK again pours it.', 'One colour in each tube!'];
      if (c.measureText(tip.join(' ')).width < W * 0.92) c.fillText(tip.join(' '), W / 2, H * 0.175);
      else tip.forEach((line, i) => c.fillText(line, W / 2, H * 0.175 + i * Math.min(H * 0.04, 26)));
      c.globalAlpha = 1;
    }

    if (won && now - wonT > 0.6) {
      const a = clamp((now - wonT - 0.6) / 0.4, 0, 1);
      c.fillStyle = `rgba(2,12,24,${0.6 * a})`; c.fillRect(0, 0, W, H);
      c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
      const pw = Math.min(W * 0.84, 520), ph = Math.min(H * 0.5, 300);
      roundRect(c, -pw / 2, -ph / 2, pw, ph, 28);
      const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
      g.addColorStop(0, '#13a4d8'); g.addColorStop(1, '#0a4f8a');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#ffd60a'; c.stroke();
      c.font = `900 ${Math.round(ph * 0.15)}px system-ui, sans-serif`; c.fillStyle = '#fff';
      c.fillText('Level complete!', 0, -ph * 0.26);
      c.font = `${Math.round(ph * 0.17)}px system-ui, sans-serif`;
      const stars = moves <= colorsFor(level) * 2 + 1 ? 3 : moves <= colorsFor(level) * 3 + 2 ? 2 : 1;
      c.fillText('⭐'.repeat(stars) + '☆'.repeat(3 - stars), 0, -ph * 0.04);
      c.font = `700 ${Math.round(ph * 0.08)}px system-ui, sans-serif`; c.fillStyle = 'rgba(255,255,255,0.85)';
      c.fillText(`${moves} moves`, 0, ph * 0.14);
      c.fillStyle = '#fff59d';
      c.fillText(Kit.touchFirst() ? 'Tap for the next level' : 'Press OK for the next level', 0, ph * 0.32);
      c.restore();
    }
  }

  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layoutTubes();
  Kit.canvas.focus();
  if (level > 1) Kit.record('colorpour', level - 1);
})();
