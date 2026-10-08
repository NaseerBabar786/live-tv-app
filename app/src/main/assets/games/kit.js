// Shared by the modern games (Block Burst, Color Pour): a sharp full-screen canvas, the remote's
// keys / touch / mouse, short sound effects made in the browser, particles, easing, and the bridge
// that keeps each game's record in the app (Android: window.CableGames, PC: the parent window).
'use strict';

const Kit = (() => {
  // ---------- Canvas ----------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1;
  const resizeHooks = [];
  function resize() {
    // Big TVs report 2-3x pixels; 2x is plenty sharp and keeps older TV boxes smooth.
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    resizeHooks.forEach((f) => f(W, H));
  }
  window.addEventListener('resize', resize);

  // ---------- Easing and helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ease = {
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    back: (t) => { const c = 1.70158, c3 = c + 1; return 1 + c3 * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
    elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
  };
  function shade(hex, amt) {
    // amt -1..1: darker..lighter
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r); g = Math.round((t - g) * p + g); b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }
  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  function roundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---------- Sound effects (short tones and noise; no music) ----------
  let ac = null, master = null, muted = false;
  try { muted = localStorage.getItem('games.muted') === '1'; } catch (e) { /* no storage */ }
  function audio() {
    if (muted) return null;
    if (!ac) {
      try {
        ac = new (window.AudioContext || window.webkitAudioContext)();
        master = ac.createGain(); master.gain.value = 0.5; master.connect(ac.destination);
      } catch (e) { return null; }
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, { type = 'sine', dur = 0.15, vol = 0.3, at = 0, slide = 0, attack = 0.005 } = {}) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + at;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  let noiseBuf = null;
  function noise({ dur = 0.2, vol = 0.2, at = 0, freq = 1200, q = 1, sweep = 0, type = 'bandpass' } = {}) {
    const a = audio(); if (!a) return;
    if (!noiseBuf) {
      noiseBuf = a.createBuffer(1, a.sampleRate, a.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = a.currentTime + at;
    const s = a.createBufferSource(); s.buffer = noiseBuf; s.loop = true;
    const f = a.createBiquadFilter(); f.type = type; f.Q.value = q; f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, t + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.05);
  }
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const sfx = {
    move: () => tone(660, { type: 'triangle', dur: 0.05, vol: 0.08 }),
    pick: () => { tone(520, { type: 'triangle', dur: 0.09, vol: 0.18, slide: 1.5 }); },
    drop: () => { tone(150, { type: 'sine', dur: 0.16, vol: 0.45, slide: 0.5 }); noise({ dur: 0.06, vol: 0.12, freq: 2500, q: 0.7 }); },
    nope: () => { tone(140, { type: 'square', dur: 0.12, vol: 0.08 }); tone(110, { type: 'square', dur: 0.14, vol: 0.08, at: 0.08 }); },
    clear: (n, combo) => {
      // A rising sparkle; more lines and a longer combo climb higher.
      const steps = 3 + Math.min(n, 4) + Math.min(combo, 3);
      for (let i = 0; i < steps; i++) {
        const f = NOTES[Math.min(NOTES.length - 1, i + Math.min(combo, 2))];
        tone(f, { type: 'triangle', dur: 0.22, vol: 0.16, at: i * 0.045 });
        tone(f * 2, { type: 'sine', dur: 0.12, vol: 0.05, at: i * 0.045 });
      }
      noise({ dur: 0.35, vol: 0.08, freq: 6000, q: 0.5, sweep: 0.4, type: 'highpass' });
    },
    pour: (dur) => {
      // Liquid: a few bubbly gulps under a soft rush.
      noise({ dur, vol: 0.09, freq: 700, q: 2, sweep: 2.2 });
      const gulps = Math.max(2, Math.round(dur / 0.11));
      for (let i = 0; i < gulps; i++) {
        tone(240 + Math.random() * 160 + i * 25, { type: 'sine', dur: 0.08, vol: 0.12, at: i * (dur / gulps), slide: 1.8 });
      }
    },
    chime: () => { [0, 1, 2].forEach((i) => tone(NOTES[4 + i * 2] || 1568, { type: 'sine', dur: 0.5, vol: 0.14, at: i * 0.07 })); },
    win: () => {
      [0, 2, 4, 5, 7].forEach((n, i) => tone(NOTES[n] || 1760, { type: 'triangle', dur: 0.35, vol: 0.18, at: i * 0.09 }));
      tone(NOTES[5] * 2, { type: 'sine', dur: 0.9, vol: 0.1, at: 0.45 });
    },
    over: () => { [4, 3, 1, 0].forEach((n, i) => tone(NOTES[n] / 2, { type: 'triangle', dur: 0.3, vol: 0.16, at: i * 0.14 })); },
  };
  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('games.muted', muted ? '1' : '0'); } catch (e) { /* no storage */ }
    return muted;
  }

  // ---------- Particles and floating text ----------
  const parts = [];
  const texts = [];
  function burst(x, y, color, n = 14, speed = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (60 + Math.random() * 260) * speed;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 120 * speed, life: 0, max: 0.6 + Math.random() * 0.5,
        size: 3 + Math.random() * 6, color, spin: Math.random() * 6, rot: Math.random() * 6, square: Math.random() < 0.6 });
    }
  }
  function confetti(n = 120) {
    const colors = ['#ff4d6d', '#ffd23f', '#3bceac', '#4ea8de', '#b388ff', '#ff9f1c'];
    for (let i = 0; i < n; i++) {
      parts.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.3, vx: (Math.random() - 0.5) * 120, vy: 80 + Math.random() * 220,
        life: 0, max: 2.4 + Math.random() * 1.2, size: 5 + Math.random() * 7, color: colors[i % colors.length],
        spin: (Math.random() - 0.5) * 10, rot: Math.random() * 6, square: true, flutter: true });
    }
  }
  function float(text, x, y, { color = '#fff', size = 34, life = 1.1, big = false } = {}) {
    texts.push({ text, x, y, color, size, life: 0, max: life, big });
  }
  function stepFx(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life > p.max) { parts.splice(i, 1); continue; }
      if (p.flutter) { p.vx += Math.sin(p.life * 5 + p.rot) * 40 * dt; p.vy = Math.min(p.vy + 60 * dt, 260); }
      else p.vy += 900 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.spin * dt;
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      texts[i].life += dt;
      if (texts[i].life > texts[i].max) texts.splice(i, 1);
    }
  }
  function drawFx(c) {
    for (const p of parts) {
      const a = 1 - p.life / p.max;
      c.globalAlpha = Math.max(0, a);
      c.fillStyle = p.color;
      if (p.square) {
        c.save(); c.translate(p.x, p.y); c.rotate(p.rot);
        c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * (p.flutter ? 0.55 : 1));
        c.restore();
      } else { c.beginPath(); c.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2); c.fill(); }
    }
    c.globalAlpha = 1;
    for (const t of texts) {
      const k = t.life / t.max;
      const pop = t.big ? ease.elastic(Math.min(1, t.life / 0.5)) : ease.back(Math.min(1, t.life / 0.25));
      const a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      c.save();
      c.globalAlpha = Math.max(0, a);
      c.translate(t.x, t.y - (t.big ? 0 : k * 60));
      c.scale(pop, pop);
      c.font = `900 ${t.size}px "Baloo 2", "Arial Rounded MT Bold", system-ui, sans-serif`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineJoin = 'round';
      c.lineWidth = t.size * 0.18; c.strokeStyle = 'rgba(20,10,40,0.85)';
      c.strokeText(t.text, 0, 0);
      const g = c.createLinearGradient(0, -t.size / 2, 0, t.size / 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, t.color); g.addColorStop(1, shade(t.color.startsWith('#') ? t.color : '#ffffff', -0.25));
      c.fillStyle = g;
      c.fillText(t.text, 0, 0);
      c.restore();
    }
  }

  // ---------- Background: a deep gradient with slow, soft light circles ----------
  const orbs = Array.from({ length: 9 }, (_, i) => ({ x: Math.random(), y: Math.random(), r: 0.12 + Math.random() * 0.22, s: 0.02 + Math.random() * 0.03, p: i }));
  // Drawn small a few times a second and stretched: soft light needs no detail, and older TV boxes stay smooth.
  const bg = document.createElement('canvas');
  let bgT = -1;
  function background(c, t, top, bottom, glow) {
    const w = Math.max(1, Math.round(W / 4)), h = Math.max(1, Math.round(H / 4));
    if (bg.width !== w || bg.height !== h || t - bgT > 0.12 || t < bgT) {
      bgT = t;
      bg.width = w; bg.height = h;
      const b = bg.getContext('2d');
      const g = b.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, top); g.addColorStop(1, bottom);
      b.fillStyle = g; b.fillRect(0, 0, w, h);
      for (const o of orbs) {
        const x = (o.x + Math.sin(t * o.s + o.p) * 0.08) * w, y = (o.y + Math.cos(t * o.s * 1.3 + o.p) * 0.08) * h;
        const r = o.r * Math.max(w, h);
        const rg = b.createRadialGradient(x, y, 0, x, y, r);
        rg.addColorStop(0, glow); rg.addColorStop(1, 'rgba(0,0,0,0)');
        b.fillStyle = rg; b.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
    c.imageSmoothingEnabled = true;
    c.drawImage(bg, -20, -20, W + 40, H + 40);
  }

  // ---------- Keys, touch and mouse ----------
  const KEYS = {
    ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
    Up: 'up', Down: 'down', Left: 'left', Right: 'right',
    w: 'up', s: 'down', a: 'left', d: 'right', W: 'up', S: 'down', A: 'left', D: 'right',
    Enter: 'ok', ' ': 'ok', NumpadEnter: 'ok', Select: 'ok',
    Escape: 'back', Backspace: 'back', BrowserBack: 'back', GoBack: 'back',
    u: 'undo', U: 'undo', z: 'undo', Z: 'undo', r: 'restart', R: 'restart', m: 'mute', M: 'mute',
  };
  const CODES = { 38: 'up', 40: 'down', 37: 'left', 39: 'right', 13: 'ok', 23: 'ok', 32: 'ok', 27: 'back', 8: 'back' };
  function onKeys(handler) {
    window.addEventListener('keydown', (e) => {
      const k = KEYS[e.key] || CODES[e.keyCode];
      if (!k) return;
      e.preventDefault();
      audio();
      if (k === 'back') { exit(); return; }
      handler(k, e.repeat);
    });
  }
  function onPointer({ down, move, up }) {
    const pos = (e) => ({ x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' || e.pointerType === 'pen' });
    canvas.addEventListener('pointerdown', (e) => { audio(); canvas.setPointerCapture?.(e.pointerId); down && down(pos(e)); e.preventDefault(); });
    canvas.addEventListener('pointermove', (e) => { move && move(pos(e)); });
    canvas.addEventListener('pointerup', (e) => { up && up(pos(e)); });
    canvas.addEventListener('pointercancel', (e) => { up && up(pos(e), true); });
  }

  // ---------- Records and leaving: the app keeps the record on its Games menu ----------
  function record(id, value) {
    try { window.CableGames && window.CableGames.record(id, value); } catch (e) { /* not in the app */ }
    try { if (window.parent !== window) window.parent.postMessage({ cableGame: 'record', id, value }, '*'); } catch (e) { /* no parent */ }
  }
  function exit() {
    try { if (window.CableGames) { window.CableGames.exit(); return; } } catch (e) { /* not in the app */ }
    try { if (window.parent !== window) { window.parent.postMessage({ cableGame: 'exit' }, '*'); return; } } catch (e) { /* no parent */ }
    history.length > 1 && history.back();
  }
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* no storage */ } },
  };
  const touchFirst = () => matchMedia('(pointer: coarse)').matches;

  // ---------- The loop ----------
  let shakeT = 0, shakeAmp = 0;
  function shake(amp = 10, t = 0.35) { shakeAmp = Math.max(shakeAmp, amp); shakeT = Math.max(shakeT, t); }
  function run(update, draw) {
    resize();
    let last = performance.now(), time = 0;
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now; time += dt;
      update(dt, time);
      stepFx(dt);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      let sx = 0, sy = 0;
      if (shakeT > 0) {
        shakeT -= dt;
        const a = shakeAmp * Math.max(0, shakeT) * 3;
        sx = (Math.random() - 0.5) * a; sy = (Math.random() - 0.5) * a;
        if (shakeT <= 0) shakeAmp = 0;
      }
      ctx.translate(sx, sy);
      draw(ctx, time);
      drawFx(ctx);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  return {
    canvas, ctx, get W() { return W; }, get H() { return H; }, onResize: (f) => resizeHooks.push(f),
    clamp, lerp, ease, shade, rgba, roundRect, sfx, tone, noise, toggleMute, get muted() { return muted; },
    burst, confetti, float, background, onKeys, onPointer, record, exit, store, touchFirst, shake, run,
  };
})();
