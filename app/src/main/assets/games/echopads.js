// Echo Pads: four glowing pads light up in a sequence, each with its own note. Repeat it! Every round
// adds one more step and plays a little faster; one wrong pad ends the game. Score = longest sequence.
// Remote: OK starts, arrows press the matching pad (Up, Right, Down, Left). Touch / mouse: tap the pads,
// tap the centre dial to start. M or the speaker icon mutes.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  // 0 Up, 1 Right, 2 Down, 3 Left (clockwise, like the old Color Echo).
  const PADS = [
    { name: 'up', color: '#ff4d7a', note: 392.0 },     // G4
    { name: 'right', color: '#ffc531', note: 523.25 }, // C5
    { name: 'down', color: '#2be3a4', note: 659.25 },  // E5
    { name: 'left', color: '#3d9bff', note: 783.99 },  // G5
  ];
  const ACCENT = '#5ee7ff';
  const WORDS = { 3: 'Nice!', 5: 'Great!', 8: 'Awesome!', 10: 'Amazing!', 13: 'Incredible!', 16: 'Legendary!', 20: 'Superhuman!' };

  // ---------- State ----------
  // state: 'menu', 'show' (watch the sequence), 'input' (your turn), 'good' (round done), 'fail', 'over', 'paused'
  let state = 'menu', stateT = 0, pausedFrom = null;
  let order = [], step = 0, typed = 0, score = 0, shown = 0, bump = 0, dialPop = 0;
  let best = Kit.store.get('echopads.best', 0), newBest = false, bestAtStart = 0;
  let showClock = 0, litFor = 0.4, gapFor = 0.15;
  let wrongPad = -1, rightPad = -1, failT = 0, redFlash = 0;
  const glow = [0, 0, 0, 0];      // 0..1 how lit each pad is
  const hold = [0, 0, 0, 0];      // seconds a pad stays fully lit
  const press = [0, 0, 0, 0];     // press-in animation
  const ripples = [];             // { t, color }
  let demoT = 0, demoPad = 0, nopeT = -9;

  const speed = (n) => ({ lit: Math.max(0.17, 0.46 - n * 0.019), gap: Math.max(0.06, 0.17 - n * 0.007) });

  function note(i, dur) {
    const f = PADS[i].note;
    Kit.tone(f, { type: 'triangle', dur: dur + 0.12, vol: 0.24, attack: 0.012 });
    Kit.tone(f * 2, { type: 'sine', dur: dur * 0.7 + 0.05, vol: 0.06, attack: 0.01 });
    Kit.tone(f / 2, { type: 'sine', dur: dur * 0.5 + 0.05, vol: 0.08, attack: 0.01 });
  }
  function buzz() {
    Kit.tone(98, { type: 'sawtooth', dur: 0.55, vol: 0.16, attack: 0.01 });
    Kit.tone(103, { type: 'square', dur: 0.55, vol: 0.09, attack: 0.01 });
    Kit.noise({ dur: 0.35, vol: 0.14, freq: 260, q: 0.8 });
  }
  function light(i, dur) { glow[i] = 1; hold[i] = dur; press[i] = 1; }

  function start() {
    order = [Math.floor(Math.random() * 4)];
    score = 0; shown = 0; newBest = false; bestAtStart = best; wrongPad = -1; rightPad = -1;
    setState('show'); beginShow(0.9);
    sfx.pick();
  }
  function setState(s) { state = s; stateT = 0; }
  function beginShow(delay) {
    step = 0; typed = 0; showClock = -delay;
    const s = speed(order.length); litFor = s.lit; gapFor = s.gap;
    if (state !== 'show') setState('show');
  }
  function pressPad(i) {
    if (state === 'menu') { light(i, 0.22); note(i, 0.22); burst(i, 6); return; }
    if (state === 'show') { nopeT = stateT; return; }
    if (state !== 'input') return;
    light(i, 0.2);
    if (i !== order[typed]) { fail(i); return; }
    note(i, 0.22);
    burst(i, 8);
    typed++;
    if (typed === order.length) roundDone();
  }
  function roundDone() {
    score = order.length; bump = 1; dialPop = 1;
    ripples.push({ t: 0, color: PADS[order[order.length - 1]].color }, { t: -0.12, color: ACCENT }, { t: -0.24, color: '#ffffff' });
    [0, 1, 2].forEach((k) => Kit.tone([1046.5, 1318.51, 1567.98][k], { type: 'sine', dur: 0.22, vol: 0.09, at: 0.12 + k * 0.06 }));
    Kit.noise({ dur: 0.3, vol: 0.05, freq: 6000, q: 0.5, sweep: 0.5, type: 'highpass', at: 0.1 });
    const word = WORDS[score];
    if (word) Kit.float(word, L.cx, L.cy - L.ro * 0.62, { color: '#ffd23f', size: L.ro * 0.2, life: 1.3, big: true });
    if (score === 6 || score === 11 || score === 16) setTimeout(() => Kit.float('Faster!', L.cx, L.cy + L.ro * 0.62, { color: ACCENT, size: L.ro * 0.14, life: 1.1, big: true }), 250);
    if (score > best) {
      if (!newBest && bestAtStart > 0) { newBest = true; Kit.float('New best!', L.hudR.x, L.hudR.y + L.u * 2.4, { color: '#ffd23f', size: L.u * 0.75, life: 1.6, big: true }); Kit.confetti(60); }
      best = score; Kit.store.set('echopads.best', best); Kit.record('echopads', best);
    }
    order.push(Math.floor(Math.random() * 4));
    setState('good');
  }
  function fail(i) {
    wrongPad = i; rightPad = order[typed]; failT = 0; redFlash = 1;
    glow[i] = 0; hold[i] = 0;
    buzz(); Kit.shake(14, 0.45);
    const p = padCenter(i); Kit.burst(p.x, p.y, '#ff3b4e', 22, 1.1);
    setState('fail');
  }
  function burst(i, n) { const p = padCenter(i); Kit.burst(p.x, p.y, PADS[i].color, n, 0.7); }

  // ---------- Layout and cached pictures ----------
  let L = { cx: 0, cy: 0, ro: 100, ri: 40, u: 10 };
  const sprites = { pads: [], lit: [], blooms: [], base: null, dial: null };
  function layout(W, H) {
    const wide = W / H > 1.15;
    const ro = wide ? Math.min(H * 0.39, W * 0.29) : Math.min(W * 0.44, H * 0.3);
    const cy = wide ? H * 0.54 : H * 0.5;
    const u = wide ? Math.min(H, W * 0.56) / 22 : Math.min(W, H * 0.56) / 18;
    const side = (W / 2 - ro * 1.08) / 2;
    L = { wide, W, H, cx: W / 2, cy, ro, ri: ro * 0.42, gap: ro * 0.055, u,
      hudL: wide ? { x: side, y: cy - ro * 0.45 } : { x: W * 0.22, y: H * 0.08 },
      hudR: wide ? { x: W - side, y: cy - ro * 0.45 } : { x: W * 0.78, y: H * 0.08 },
      status: wide ? { x: W / 2, y: (cy - ro * 1.08) / 2 + 4 } : { x: W / 2, y: cy + ro * 1.22 } };
    buildSprites();
  }
  Kit.onResize(layout);

  function padGeom(i) {
    // An annular quarter with straight, even gaps between neighbours.
    const { ro, ri, gap } = L;
    const mid = -Math.PI / 2 + i * Math.PI / 2;
    const a0 = mid - Math.PI / 4, a1 = mid + Math.PI / 4;
    const dO = Math.asin(gap / 2 / ro), dI = Math.asin(gap / 2 / ri);
    return { ro, ri, o0: a0 + dO, o1: a1 - dO, i0: a0 + dI, i1: a1 - dI };
  }
  function padPath(c, i) {
    // Traced by hand so only the four real corners get rounded.
    const { ro, ri, o0, o1, i0, i1 } = padGeom(i);
    const cr = ro * 0.06, ci = ro * 0.035;
    const P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
    const os = P(ro, o0), oe = P(ro, o1), ie = P(ri, i1), is = P(ri, i0);
    c.beginPath();
    c.moveTo((os[0] + is[0]) / 2, (os[1] + is[1]) / 2);
    c.arcTo(os[0], os[1], os[0] - Math.sin(o0) * ro, os[1] + Math.cos(o0) * ro, cr);
    const eO = (cr * 1.2) / ro, n = 24;
    for (let k = 0; k <= n; k++) { const p = P(ro, lerp(o0 + eO, o1 - eO, k / n)); c.lineTo(p[0], p[1]); }
    c.arcTo(oe[0], oe[1], ie[0], ie[1], cr);
    c.arcTo(ie[0], ie[1], ie[0] + Math.sin(i1) * ri, ie[1] - Math.cos(i1) * ri, ci);
    const eI = (ci * 1.2) / ri;
    for (let k = 0; k <= n; k++) { const p = P(ri, lerp(i1 - eI, i0 + eI, k / n)); c.lineTo(p[0], p[1]); }
    c.arcTo(is[0], is[1], os[0], os[1], ci);
    c.closePath();
  }
  function padBox(i) {
    const { ro, ri, o0, o1, i0, i1 } = padGeom(i);
    const xs = [], ys = [];
    for (let k = 0; k <= 16; k++) {
      const a = lerp(o0, o1, k / 16), b = lerp(i0, i1, k / 16);
      xs.push(Math.cos(a) * ro, Math.cos(b) * ri); ys.push(Math.sin(a) * ro, Math.sin(b) * ri);
    }
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  function padCenter(i) {
    const mid = -Math.PI / 2 + i * Math.PI / 2, r = (L.ro + L.ri) / 2;
    return { x: L.cx + Math.cos(mid) * r, y: L.cy + Math.sin(mid) * r };
  }
  function makeCanvas(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w * dpr)); s.height = Math.max(1, Math.ceil(h * dpr));
    const c = s.getContext('2d'); c.scale(dpr, dpr);
    return { s, c };
  }
  function padSprite(i, lit) {
    const col = PADS[i].color, { ro, ri } = L, bb = padBox(i);
    const m = ro * 0.16;
    const x0 = bb.x0 - m, y0 = bb.y0 - m, w = bb.x1 - bb.x0 + 2 * m, h = bb.y1 - bb.y0 + 2 * m;
    const { s, c } = makeCanvas(w, h);
    c.translate(-x0, -y0);
    // Body: dark-to-bright from the dial outwards; lit pads glow hot.
    const g = c.createRadialGradient(0, 0, ri, 0, 0, ro);
    if (lit) { g.addColorStop(0, shade(col, 0.7)); g.addColorStop(0.55, shade(col, 0.25)); g.addColorStop(1, col); }
    else { g.addColorStop(0, shade(col, -0.62)); g.addColorStop(0.7, shade(col, -0.42)); g.addColorStop(1, shade(col, -0.3)); }
    c.save();
    if (lit) { c.shadowColor = col; c.shadowBlur = m * 0.9; }
    else { c.shadowColor = 'rgba(0,0,0,0.7)'; c.shadowBlur = m * 0.35; c.shadowOffsetY = m * 0.18; }
    padPath(c, i); c.fillStyle = g; c.fill();
    c.restore();
    if (lit) { c.save(); c.shadowColor = '#ffffff'; c.shadowBlur = m * 0.4; padPath(c, i); c.fillStyle = 'rgba(255,255,255,0.08)'; c.fill(); c.restore(); }
    // Gloss: a soft sheen across the top of every pad, plus a bright rim on the outer edge.
    c.save();
    padPath(c, i); c.clip();
    const sh = c.createLinearGradient(0, -ro, 0, ro * 0.2);
    sh.addColorStop(0, `rgba(255,255,255,${lit ? 0.45 : 0.22})`); sh.addColorStop(0.45, `rgba(255,255,255,${lit ? 0.12 : 0.05})`); sh.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sh; c.fillRect(-ro, -ro, ro * 2, ro * 2);
    // Inner groove lines (like a speaker grille) for a tactile look.
    c.strokeStyle = lit ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.25)'; c.lineWidth = Math.max(1, ro * 0.008);
    const mid = -Math.PI / 2 + i * Math.PI / 2;
    for (let k = 1; k <= 3; k++) {
      const r = ri + (ro - ri) * (0.22 + k * 0.17);
      c.beginPath(); c.arc(0, 0, r, mid - 0.42, mid + 0.42); c.stroke();
    }
    c.restore();
    padPath(c, i);
    c.lineWidth = Math.max(1.5, ro * 0.012);
    c.strokeStyle = lit ? 'rgba(255,255,255,0.85)' : shade(col, -0.05);
    c.globalAlpha = lit ? 1 : 0.55; c.stroke(); c.globalAlpha = 1;
    return { s, x: x0, y: y0, w, h };
  }
  function bloomSprite(col) {
    const { s, c } = makeCanvas(128, 128);
    const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, Kit.rgba(col, 0.75)); g.addColorStop(0.35, Kit.rgba(col, 0.3)); g.addColorStop(1, Kit.rgba(col, 0));
    c.fillStyle = g; c.fillRect(0, 0, 128, 128);
    return s;
  }
  function buildSprites() {
    const { ro, ri } = L;
    sprites.pads = PADS.map((_, i) => padSprite(i, false));
    sprites.lit = PADS.map((_, i) => padSprite(i, true));
    sprites.blooms = PADS.map((p) => bloomSprite(p.color));
    sprites.red = bloomSprite('#ff2d45');
    // The console the pads sit in: a dark glossy disc with a cool rim.
    const R = ro * 1.09, m = ro * 0.12;
    let { s, c } = makeCanvas(2 * (R + m), 2 * (R + m));
    c.translate(R + m, R + m);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.75)'; c.shadowBlur = m; c.shadowOffsetY = m * 0.35;
    c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2);
    const bg = c.createLinearGradient(0, -R, 0, R); bg.addColorStop(0, '#1b2a55'); bg.addColorStop(1, '#070d22');
    c.fillStyle = bg; c.fill(); c.restore();
    c.beginPath(); c.arc(0, 0, R - ro * 0.012, 0, Math.PI * 2);
    const rim = c.createLinearGradient(0, -R, 0, R); rim.addColorStop(0, 'rgba(160,220,255,0.7)'); rim.addColorStop(0.5, 'rgba(90,140,220,0.15)'); rim.addColorStop(1, 'rgba(94,231,255,0.45)');
    c.lineWidth = ro * 0.022; c.strokeStyle = rim; c.stroke();
    c.beginPath(); c.arc(0, 0, ro * 1.015, 0, Math.PI * 2); c.fillStyle = '#040817'; c.fill();
    sprites.base = { s, size: 2 * (R + m) };
    // The centre dial.
    const D = ri - L.gap * 0.9, dm = ro * 0.08;
    ({ s, c } = makeCanvas(2 * (D + dm), 2 * (D + dm)));
    c.translate(D + dm, D + dm);
    c.save(); c.shadowColor = 'rgba(0,0,0,0.8)'; c.shadowBlur = dm; c.shadowOffsetY = dm * 0.3;
    c.beginPath(); c.arc(0, 0, D, 0, Math.PI * 2);
    const rg = c.createLinearGradient(0, -D, 0, D); rg.addColorStop(0, '#d9ecff'); rg.addColorStop(0.5, '#5c7bb0'); rg.addColorStop(1, '#1b2c55');
    c.fillStyle = rg; c.fill(); c.restore();
    c.beginPath(); c.arc(0, 0, D * 0.9, 0, Math.PI * 2);
    const fg = c.createRadialGradient(0, -D * 0.35, D * 0.1, 0, 0, D * 0.95); fg.addColorStop(0, '#22346b'); fg.addColorStop(1, '#060b1f');
    c.fillStyle = fg; c.fill();
    c.save(); c.beginPath(); c.arc(0, 0, D * 0.9, 0, Math.PI * 2); c.clip();
    c.beginPath(); c.ellipse(0, -D * 0.52, D * 0.7, D * 0.36, 0, 0, Math.PI * 2);
    const gl = c.createLinearGradient(0, -D * 0.9, 0, -D * 0.15); gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fill(); c.restore();
    sprites.dial = { s, size: 2 * (D + dm), D };
  }

  // ---------- Input ----------
  const DIR = { up: 0, right: 1, down: 2, left: 3 };
  Kit.onKeys((k, repeat) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'paused') { if (k === 'ok' || DIR[k] != null) resume(); return; }
    if (k === 'ok') {
      if (repeat) return;
      if (state === 'menu') start();
      else if (state === 'over' && stateT > 0.9) start();
      return;
    }
    if (k === 'restart' && state !== 'menu') { start(); return; }
    if (DIR[k] != null && !repeat) pressPad(DIR[k]);
  });
  const muteBox = () => ({ x: Kit.W - 60, y: 8, w: 50, h: 50 });
  Kit.onPointer({
    down(e) {
      const m = muteBox();
      if (e.x >= m.x && e.y >= m.y && e.x <= m.x + m.w && e.y <= m.y + m.h) { Kit.toggleMute(); return; }
      if (state === 'paused') { resume(); return; }
      if (state === 'over') { if (stateT > 0.9) start(); return; }
      const dx = e.x - L.cx, dy = e.y - L.cy, d = Math.hypot(dx, dy);
      if (d < L.ri) { if (state === 'menu') start(); return; }
      if (d > L.ro * 1.1) return;
      const i = Math.abs(dy) > Math.abs(dx) ? (dy < 0 ? 0 : 2) : (dx > 0 ? 1 : 3);
      pressPad(i);
    },
  });
  function resume() {
    // The sequence plays again from the start, so nobody loses track.
    const was = pausedFrom; pausedFrom = null;
    if (was === 'show') { setState('show'); beginShow(0.7); } else setState(was || 'input');
    sfx.pick();
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'show' || state === 'input' || state === 'good')) {
      pausedFrom = state === 'good' ? 'show' : state;
      if (state === 'good') { /* the next round is already queued */ }
      setState('paused');
      glow.fill(0); hold.fill(0);
    }
  });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    shown += (score - shown) * Math.min(1, dt * 8);
    if (Math.abs(score - shown) < 0.05) shown = score;
    bump = Math.max(0, bump - dt * 3); dialPop = Math.max(0, dialPop - dt * 2.5);
    redFlash = Math.max(0, redFlash - dt * 1.6);
    for (let i = 0; i < 4; i++) {
      if (hold[i] > 0) hold[i] -= dt; else glow[i] = Math.max(0, glow[i] - dt * 6);
      press[i] = Math.max(0, press[i] - dt * 5);
    }
    for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].t += dt; if (ripples[i].t > 0.9) ripples.splice(i, 1); }

    if (state === 'menu') {
      // A slow, silent shimmer round the wheel.
      demoT += dt;
      if (demoT > 0.55) { demoT = 0; demoPad = (demoPad + 1) % 4; glow[demoPad] = Math.max(glow[demoPad], 0.55); hold[demoPad] = 0.15; }
    } else if (state === 'show') {
      showClock += dt;
      const per = litFor + gapFor;
      if (showClock >= 0) {
        const k = Math.floor(showClock / per);
        if (k >= order.length) { setState('input'); typed = 0; }
        else if (k >= step) { step = k + 1; light(order[k], litFor); note(order[k], litFor); }
      }
    } else if (state === 'good') {
      if (stateT > 0.85) beginShow(0.15);
    } else if (state === 'fail') {
      failT += dt;
      // The pad that was right blinks so you can see the mistake.
      const blink = Math.floor(failT / 0.22);
      if (blink < 6 && blink % 2 === 0 && hold[rightPad] <= 0) { glow[rightPad] = 1; hold[rightPad] = 0.16; }
      if (failT > 1.6) { setState('over'); sfx.over(); if (best > 0) Kit.record('echopads', best); }
    }
  }

  // ---------- Drawing ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom) {
    c.font = `900 ${Math.round(size)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(3,8,26,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#22408f'); g.addColorStop(1, '#0a1640');
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }

  function drawWheel(c, t) {
    const { cx, cy, ro } = L;
    const b = sprites.base;
    c.drawImage(b.s, cx - b.size / 2, cy - b.size / 2, b.size, b.size);
    for (let i = 0; i < 4; i++) {
      const p = padCenter(i);
      const sc = 1 - press[i] * 0.035;
      c.save();
      c.translate(p.x, p.y); c.scale(sc, sc); c.translate(-p.x, -p.y);
      const ps = sprites.pads[i], ls = sprites.lit[i];
      c.drawImage(ps.s, cx + ps.x, cy + ps.y, ps.w, ps.h);
      const gl = (state === 'over' || state === 'fail') && i !== rightPad ? glow[i] * 0.4 : glow[i];
      if (gl > 0.01) { c.globalAlpha = Math.min(1, gl); c.drawImage(ls.s, cx + ls.x, cy + ls.y, ls.w, ls.h); }
      c.restore();
    }
    // Bloom light thrown onto the room by lit pads.
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) {
      if (glow[i] < 0.02) continue;
      const p = padCenter(i), r = ro * 1.05;
      c.globalAlpha = glow[i] * 0.55;
      c.drawImage(sprites.blooms[i], p.x - r, p.y - r, r * 2, r * 2);
    }
    if (state === 'fail' || (state === 'over' && stateT < 0.6)) {
      const p = padCenter(wrongPad), r = ro * 0.95;
      c.globalAlpha = 0.4 + 0.4 * Math.abs(Math.sin(t * 14)) * (state === 'fail' ? 1 : 1 - stateT / 0.6);
      c.drawImage(sprites.red, p.x - r, p.y - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';

    // Ripples after a round is done.
    for (const rp of ripples) {
      if (rp.t < 0) continue;
      const q = rp.t / 0.9;
      c.globalAlpha = (1 - q) * 0.8;
      c.strokeStyle = rp.color; c.lineWidth = ro * 0.035 * (1 - q) + 1;
      c.beginPath(); c.arc(cx, cy, L.ri * 0.9 + ease.out(q) * ro * 0.95, 0, Math.PI * 2); c.stroke();
    }
    c.globalAlpha = 1;

    // The dial: round number with a progress ring for your turn.
    const d = sprites.dial, D = d.D;
    const k = 1 + ease.out(dialPop) * 0.08 * Math.sin(dialPop * Math.PI);
    c.save(); c.translate(cx, cy); c.scale(k, k);
    c.drawImage(d.s, -d.size / 2, -d.size / 2, d.size, d.size);
    const rr = D * 0.8;
    c.lineWidth = D * 0.07; c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.arc(0, 0, rr, 0, Math.PI * 2); c.stroke();
    let frac = 0, ringCol = ACCENT;
    if (state === 'input') frac = typed / order.length;
    else if (state === 'show') frac = Math.min(step, order.length) / order.length, ringCol = '#ffffff';
    else if (state === 'good') frac = 1, ringCol = '#7dffb8';
    else if (state === 'fail' || state === 'over') frac = 1, ringCol = '#ff4d6d';
    if (frac > 0) {
      c.strokeStyle = ringCol; c.globalAlpha = state === 'show' ? 0.5 : 1;
      c.beginPath(); c.arc(0, 0, rr, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac); c.stroke();
      c.globalAlpha = 1;
    }
    c.lineCap = 'butt';
    if (state === 'menu') {
      const pulse = 1 + Math.sin(t * 4) * 0.05;
      c.scale(pulse, pulse);
      c.fillStyle = ACCENT;
      c.beginPath(); c.moveTo(-D * 0.18, -D * 0.32); c.lineTo(D * 0.32, 0); c.lineTo(-D * 0.18, D * 0.32); c.closePath(); c.fill();
      text(c, Kit.touchFirst() ? 'TAP' : 'OK', 0, D * 0.52, D * 0.17, 'rgba(255,255,255,0.8)', 800);
    } else {
      const n = state === 'over' || state === 'fail' ? score : order.length;
      text(c, state === 'over' || state === 'fail' ? 'SCORE' : 'ROUND', 0, -D * 0.4, D * 0.15, 'rgba(180,220,255,0.75)', 800);
      c.save(); c.scale(1 + bump * 0.15, 1 + bump * 0.15);
      outlined(c, String(n), 0, D * 0.08, D * 0.68, '#ffffff', state === 'fail' || state === 'over' ? '#ff8095' : ACCENT);
      c.restore();
    }
    c.restore();
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    Kit.background(c, t, '#0c1a4a', '#02040e', 'rgba(70,170,255,0.09)');
    drawWheel(c, t);

    // Status above the wheel.
    const st = L.status;
    if (state === 'menu') {
      outlined(c, 'ECHO PADS', st.x, st.y, Math.min(u * 2.1, (L.cy - L.ro * 1.1) * 0.8), '#e8fbff', ACCENT);
    } else if (state === 'show' || state === 'good' || state === 'input' || state === 'fail') {
      let msg = '', col = '#ffffff';
      if (state === 'show') { msg = stateT - nopeT < 0.8 ? 'Watch first…' : 'Watch…'; col = 'rgba(220,240,255,0.95)'; }
      else if (state === 'good') { msg = 'Nice!'; col = '#7dffb8'; }
      else if (state === 'input') { msg = `Your turn  ${typed + 1} / ${order.length}`; col = ACCENT; }
      else { msg = 'Wrong pad!'; col = '#ff6b80'; }
      const k = ease.back(clamp(stateT / 0.3, 0, 1));
      c.save(); c.translate(st.x, st.y); c.scale(k, k);
      text(c, msg, 0, 0, u * 1.15, col, 900);
      c.restore();
    }

    // Score (left) and best (right).
    if (L.wide) {
      const sl = L.hudL, sr = L.hudR;
      text(c, 'SCORE', sl.x, sl.y - u * 1.6, u * 0.8, 'rgba(180,220,255,0.7)', 800);
      c.save(); c.translate(sl.x, sl.y); c.scale(1 + bump * 0.2, 1 + bump * 0.2);
      outlined(c, String(Math.round(shown)), 0, 0, u * 2.6, '#fff6c2', '#ffb703');
      c.restore();
      text(c, 'BEST', sr.x, sr.y - u * 1.6, u * 0.8, 'rgba(180,220,255,0.7)', 800);
      outlined(c, `👑 ${best}`, sr.x, sr.y, u * 1.7, '#fff6c2', '#ffb703');
      const tips = Kit.touchFirst() ? ['Tap the pads', 'in the same order']
        : state === 'menu' ? ['OK  start', 'Arrows  try the pads', 'Back  games menu'] : ['▲ ▶ ▼ ◀  press the pads', 'in the same order', 'Back  games menu'];
      tips.forEach((tx, i) => text(c, tx, sr.x, L.cy + L.ro * 0.35 + i * u * 1.1, u * 0.72, 'rgba(255,255,255,0.6)', 700));
      const how = ['Watch the pads light up', 'then repeat them.', 'One more every round!'];
      if (state === 'menu') how.forEach((tx, i) => text(c, tx, sl.x, L.cy + L.ro * 0.35 + i * u * 1.1, u * 0.72, 'rgba(255,255,255,0.6)', 700));
      else {
        const s = speed(order.length);
        const lvl = Math.round((0.46 - s.lit) / (0.46 - 0.17) * 100);
        text(c, `Speed ${lvl}%`, sl.x, L.cy + L.ro * 0.35, u * 0.72, 'rgba(255,255,255,0.6)', 700);
        const bw = u * 6, bx = sl.x - bw / 2, by = L.cy + L.ro * 0.35 + u * 0.8;
        c.fillStyle = 'rgba(255,255,255,0.12)'; roundRect(c, bx, by, bw, u * 0.35, u * 0.17); c.fill();
        c.fillStyle = ACCENT; roundRect(c, bx, by, Math.max(u * 0.35, bw * lvl / 100), u * 0.35, u * 0.17); c.fill();
      }
    } else {
      text(c, 'SCORE', L.hudL.x, L.hudL.y - u * 0.9, u * 0.6, 'rgba(180,220,255,0.7)', 800);
      outlined(c, String(Math.round(shown)), L.hudL.x, L.hudL.y + u * 0.3, u * 1.6, '#fff6c2', '#ffb703');
      text(c, 'BEST', L.hudR.x, L.hudR.y - u * 0.9, u * 0.6, 'rgba(180,220,255,0.7)', 800);
      outlined(c, `👑 ${best}`, L.hudR.x, L.hudR.y + u * 0.3, u * 1.2, '#fff6c2', '#ffb703');
    }

    // Mistake: the whole screen flashes red.
    if (redFlash > 0) { c.fillStyle = `rgba(255,30,60,${redFlash * 0.35})`; c.fillRect(-30, -30, W + 60, H + 60); }

    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (state === 'paused') {
      c.fillStyle = 'rgba(2,5,18,0.7)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.44, u * 2.6, '#ffffff', ACCENT);
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'OK to carry on (the pads play again)', W / 2, H * 0.57, u * 0.95, 'rgba(255,255,255,0.85)', 700);
    }
    if (state === 'over') drawOver(c);
  }

  function drawOver(c) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp(stateT / 0.4, 0, 1);
    c.fillStyle = `rgba(2,5,18,${0.68 * a})`; c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.86, u * 17), ph = u * 11.5;
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 1.0, '#ffd23f');
    outlined(c, 'Wrong pad!', 0, -ph * 0.34, u * 1.7, '#ffffff', '#ff8aa0');
    outlined(c, String(score), 0, -ph * 0.08, u * 2.9, '#fff6c2', '#ffb703');
    text(c, score === 1 ? 'step remembered' : 'steps remembered', 0, ph * 0.08, u * 0.75, 'rgba(255,255,255,0.75)', 700);
    text(c, newBest ? '🎉 New best score!' : `👑 Best ${best}`, 0, ph * 0.2, u * 0.9, '#ffffff', 800);
    const ready = stateT > 0.9;
    c.globalAlpha = ready ? 1 : 0.4;
    const bw = u * 9, bh = u * 1.6;
    roundRect(c, -bw / 2, ph * 0.3, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, ph * 0.3, 0, ph * 0.3 + bh); g.addColorStop(0, '#7af0ff'); g.addColorStop(1, '#1a9fd0');
    c.fillStyle = g; c.fill();
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, ph * 0.3 + bh / 2, u * 0.85, '#04203a', 900);
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (best > 0) Kit.record('echopads', best);
})();
