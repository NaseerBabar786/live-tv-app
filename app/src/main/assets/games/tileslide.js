// Tile Slide: the classic sliding puzzle, remade. Put the tiles back in order on a 3×3, 4×4 or 5×5 board,
// with numbers or a picture painted right here in the browser; solved, the tiles melt into the full picture.
// Remote: arrows slide a tile into the gap, OK opens the pause menu (peek, new shuffle, change size). Start
// menu: up/down picks a row, left/right a choice, OK plays. Touch: tap a tile or swipe. M mutes.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;
  const SIZES = [3, 4, 5];
  const STYLES = [{ id: 'numbers', name: 'Numbers', icon: '🔢' }, { id: 'picture', name: 'Picture', icon: '🖼️' }];
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];
  const ROWCOL = ['#ff5e7a', '#ff9447', '#ffcc3d', '#2fd6a3', '#45b8ff'];
  const GOLD = '#ffd23f', CORAL = '#ff8a5c';
  // The arrow moves the tile on the far side of the gap into it.
  const OFF = { left: [1, 0], right: [-1, 0], up: [0, 1], down: [0, -1] };
  const dprNow = () => Math.min(window.devicePixelRatio || 1, 2);
  const canvasOf = (w, h) => { const s = document.createElement('canvas'); s.width = Math.max(1, Math.ceil(w)); s.height = Math.max(1, Math.ceil(h)); return s; };
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // ---------- Pictures, painted once per puzzle and size ----------
  function stars(c, S, r, n, maxY, size) {
    for (let i = 0; i < n; i++) {
      c.fillStyle = `rgba(255,255,255,${0.3 + r() * 0.7})`;
      c.beginPath(); c.arc(r() * S, r() * S * maxY, (0.4 + r() * 1.2) * size, 0, Math.PI * 2); c.fill();
    }
  }
  function ridge(c, S, r, base, amp, color) {
    const f1 = 1 + r() * 2, f2 = 3 + r() * 4, p1 = r() * 6, p2 = r() * 6;
    c.beginPath(); c.moveTo(0, S);
    for (let i = 0; i <= 80; i++) {
      const x = (i / 80) * S, u = i / 80;
      const y = base * S - amp * S * (0.55 + 0.35 * Math.sin(u * f1 * Math.PI * 2 + p1) + 0.15 * Math.sin(u * f2 * Math.PI * 2 + p2));
      c.lineTo(x, y);
    }
    c.lineTo(S, S); c.closePath(); c.fillStyle = color; c.fill();
  }
  function drawSunset(c, S, r) {
    const hz = S * 0.64;
    let g = c.createLinearGradient(0, 0, 0, hz);
    g.addColorStop(0, '#24104f'); g.addColorStop(0.35, '#7b2b83'); g.addColorStop(0.62, '#ff5e78'); g.addColorStop(0.84, '#ff9f5a'); g.addColorStop(1, '#ffd98a');
    c.fillStyle = g; c.fillRect(0, 0, S, hz + 2);
    stars(c, S, r, 50, 0.28, S / 500);
    const sx = S * (0.36 + r() * 0.28), sy = S * 0.5, sr = S * 0.15;
    g = c.createRadialGradient(sx, sy, 0, sx, sy, S * 0.5);
    g.addColorStop(0, 'rgba(255,220,150,0.6)'); g.addColorStop(1, 'rgba(255,200,140,0)');
    c.fillStyle = g; c.fillRect(0, 0, S, hz);
    g = c.createLinearGradient(0, sy - sr, 0, sy + sr);
    g.addColorStop(0, '#fff6c0'); g.addColorStop(0.6, '#ffb45c'); g.addColorStop(1, '#ff6f6f');
    c.fillStyle = g; c.beginPath(); c.arc(sx, sy, sr, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#ff8a6c';
    for (let i = 0; i < 5; i++) c.fillRect(sx - sr, sy + sr * (0.12 + i * 0.19), sr * 2, sr * 0.035 * (i + 1.2));
    // Soft clouds
    for (let i = 0; i < 6; i++) {
      c.fillStyle = `rgba(255,${170 + (r() * 50) | 0},${190 + (r() * 40) | 0},${0.25 + r() * 0.25})`;
      c.beginPath(); c.ellipse(r() * S, S * (0.12 + r() * 0.3), S * (0.08 + r() * 0.14), S * (0.012 + r() * 0.015), 0, 0, Math.PI * 2); c.fill();
    }
    ridge(c, S, r, 0.6, 0.16, '#9a3f80');
    ridge(c, S, r, 0.625, 0.1, '#62215f');
    ridge(c, S, r, 0.65, 0.05, '#3a1242');
    g = c.createLinearGradient(0, hz, 0, S);
    g.addColorStop(0, '#ff8a6a'); g.addColorStop(0.35, '#a23a6e'); g.addColorStop(1, '#2a0c34');
    c.fillStyle = g; c.fillRect(0, S * 0.645, S, S);
    for (let i = 0; i < 16; i++) {
      const w = sr * (1.7 - i * 0.09) * (0.75 + r() * 0.3);
      c.fillStyle = `rgba(255,226,150,${Math.max(0.08, 0.8 - i * 0.045)})`;
      c.fillRect(sx - w / 2 + (r() - 0.5) * sr * 0.2, S * 0.66 + i * S * 0.021, w, S * 0.007);
    }
    c.strokeStyle = 'rgba(255,200,200,0.18)'; c.lineWidth = S * 0.003;
    for (let i = 0; i < 26; i++) { const x = r() * S, y = S * (0.68 + r() * 0.3), w = S * (0.03 + r() * 0.07); c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke(); }
    // Island with a palm tree, on the side away from the sun
    const left = sx > S / 2, px = left ? S * 0.17 : S * 0.83, dir = left ? 1 : -1;
    c.fillStyle = '#1b0820';
    c.beginPath(); c.ellipse(px, S * 0.95, S * 0.24, S * 0.07, 0, Math.PI, 0); c.fill();
    c.fillRect(px - S * 0.24, S * 0.95, S * 0.48, S * 0.05);
    const tx = px + dir * S * 0.09, ty = S * 0.5;
    c.strokeStyle = '#1b0820'; c.lineCap = 'round'; c.lineWidth = S * 0.022;
    c.beginPath(); c.moveTo(px, S * 0.93); c.quadraticCurveTo(px + dir * S * 0.01, S * 0.66, tx, ty); c.stroke();
    c.lineWidth = S * 0.016;
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.95 + (r() - 0.5) * 0.2, len = S * (0.13 + r() * 0.05);
      const ex = tx + Math.cos(a) * len, ey = ty + Math.sin(a) * len * 0.6 + len * 0.35;
      c.beginPath(); c.moveTo(tx, ty); c.quadraticCurveTo(tx + Math.cos(a) * len * 0.6, ty + Math.sin(a) * len * 0.6 - len * 0.12, ex, ey); c.stroke();
    }
    c.fillStyle = '#1b0820';
    for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(tx + (i - 1) * S * 0.012, ty + S * 0.018, S * 0.011, 0, Math.PI * 2); c.fill(); }
    c.strokeStyle = 'rgba(40,10,40,0.75)'; c.lineWidth = S * 0.005;
    for (let i = 0; i < 4; i++) {
      const bx = S * (0.3 + r() * 0.5), by = S * (0.18 + r() * 0.2), w = S * (0.018 + r() * 0.012);
      c.beginPath(); c.moveTo(bx - w, by - w * 0.5); c.quadraticCurveTo(bx - w * 0.4, by - w * 0.7, bx, by); c.quadraticCurveTo(bx + w * 0.4, by - w * 0.7, bx + w, by - w * 0.5); c.stroke();
    }
  }
  function drawAurora(c, S, r) {
    let g = c.createLinearGradient(0, 0, 0, S * 0.75);
    g.addColorStop(0, '#040824'); g.addColorStop(0.55, '#0c2550'); g.addColorStop(1, '#16577a');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    stars(c, S, r, 160, 0.7, S / 600);
    c.globalCompositeOperation = 'lighter';
    [['61,255,176', 0.28], ['58,209,255', 0.38], ['255,107,214', 0.2]].forEach(([col, base]) => {
      const amp = S * (0.05 + r() * 0.06), f = 1 + r() * 1.5, p = r() * 6;
      const yAt = (x) => S * base + Math.sin((x / S) * f * Math.PI * 2 + p) * amp;
      for (let x = 0; x < S; x += Math.max(2, S / 260)) {
        const y = yAt(x), len = S * (0.12 + 0.06 * Math.sin(x / S * 17 + p));
        c.fillStyle = `rgba(${col},0.06)`; c.fillRect(x, y - len, Math.max(2, S / 260), len);
        c.fillStyle = `rgba(${col},0.12)`; c.fillRect(x, y - len * 0.35, Math.max(2, S / 260), len * 0.35);
      }
      for (const [lw, a] of [[0.06, 0.08], [0.03, 0.14], [0.01, 0.35]]) {
        c.strokeStyle = `rgba(${col},${a})`; c.lineWidth = S * lw;
        c.beginPath(); for (let x = 0; x <= S; x += S / 60) c.lineTo(x, yAt(x)); c.stroke();
      }
    });
    c.globalCompositeOperation = 'source-over';
    const mx = S * (0.15 + r() * 0.7), my = S * 0.12;
    g = c.createRadialGradient(mx, my, 0, mx, my, S * 0.14);
    g.addColorStop(0, 'rgba(255,250,220,0.5)'); g.addColorStop(1, 'rgba(255,250,220,0)');
    c.fillStyle = g; c.fillRect(mx - S * 0.14, my - S * 0.14, S * 0.28, S * 0.28);
    c.fillStyle = '#fdf5d6'; c.beginPath(); c.arc(mx, my, S * 0.04, 0, Math.PI * 2); c.fill();
    // Snowy peaks
    const peaks = 5;
    for (let i = 0; i < peaks; i++) {
      const cx = (i + 0.2 + r() * 0.6) * S / (peaks - 1) - S * 0.12, h = S * (0.16 + r() * 0.14), w = S * (0.22 + r() * 0.1), base = S * 0.74;
      c.fillStyle = i % 2 ? '#22406a' : '#1a3358';
      c.beginPath(); c.moveTo(cx - w, base); c.lineTo(cx, base - h); c.lineTo(cx + w, base); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,0.18)';
      c.beginPath(); c.moveTo(cx, base - h); c.lineTo(cx + w, base); c.lineTo(cx + w * 0.2, base); c.closePath(); c.fill();
      c.fillStyle = '#eaf6ff';
      const k = 0.28;
      c.beginPath(); c.moveTo(cx - w * k, base - h * (1 - k)); c.lineTo(cx, base - h); c.lineTo(cx + w * k, base - h * (1 - k));
      c.lineTo(cx + w * k * 0.4, base - h * (1 - k) + S * 0.015); c.lineTo(cx, base - h * (1 - k) - S * 0.004); c.lineTo(cx - w * k * 0.5, base - h * (1 - k) + S * 0.018); c.closePath(); c.fill();
    }
    g = c.createLinearGradient(0, S * 0.74, 0, S);
    g.addColorStop(0, '#1d5a78'); g.addColorStop(1, '#061226');
    c.fillStyle = g; c.fillRect(0, S * 0.74, S, S * 0.26);
    c.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 30; i++) { c.fillStyle = `rgba(80,255,200,${0.03 + r() * 0.06})`; c.fillRect(r() * S, S * (0.77 + r() * 0.2), S * (0.05 + r() * 0.15), S * 0.004); }
    c.globalCompositeOperation = 'source-over';
    // Pines along the shore
    c.fillStyle = '#050d1c';
    for (let x = -S * 0.02; x < S * 1.02; x += S * (0.03 + r() * 0.04)) {
      const h = S * (0.06 + r() * 0.09), w = h * 0.36, base = S * 0.78 + r() * S * 0.02;
      for (let k = 0; k < 3; k++) {
        const y = base - h * (k * 0.3), ww = w * (1 - k * 0.25);
        c.beginPath(); c.moveTo(x - ww, y); c.lineTo(x, y - h * 0.55); c.lineTo(x + ww, y); c.closePath(); c.fill();
      }
      c.fillRect(x - w * 0.1, base, w * 0.2, S * 0.02);
    }
  }
  function drawShapes(c, S, r) {
    const pal = ['#ff5d5d', '#ffb347', '#2ec4b6', '#3d5a80', '#ffd166', '#ef476f', '#7b61ff', '#06d6a0', '#fff1dc'];
    const pick = () => pal[(r() * pal.length) | 0];
    const m = 6, cs = S / m;
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
      const x0 = x * cs, y0 = y * cs, a = pick();
      let b = pick(); if (b === a) b = pal[(pal.indexOf(a) + 3) % pal.length];
      c.fillStyle = a; c.fillRect(x0, y0, cs + 1, cs + 1);
      c.fillStyle = b;
      const k = (r() * 6) | 0, q = (r() * 4) | 0;
      c.beginPath();
      if (k === 0) { const cx = x0 + (q & 1) * cs, cy = y0 + (q >> 1) * cs; c.moveTo(cx, cy); c.arc(cx, cy, cs, 0, Math.PI * 2); c.save(); c.clip(); c.fillRect(x0, y0, cs, cs); c.restore(); c.beginPath(); }
      else if (k === 1) { c.arc(x0 + cs / 2, y0 + cs / 2, cs * 0.38, 0, Math.PI * 2); c.fill(); c.fillStyle = pick(); c.beginPath(); c.arc(x0 + cs / 2, y0 + cs / 2, cs * 0.17, 0, Math.PI * 2); }
      else if (k === 2) { const ang = q * Math.PI / 2; c.arc(x0 + cs / 2 + Math.cos(ang) * cs / 2, y0 + cs / 2 + Math.sin(ang) * cs / 2, cs / 2, ang + Math.PI / 2, ang + Math.PI * 1.5); }
      else if (k === 3) { const pts = [[x0, y0], [x0 + cs, y0], [x0 + cs, y0 + cs], [x0, y0 + cs]]; for (let i = 0; i < 3; i++) c.lineTo(...pts[(q + i) % 4]); }
      else if (k === 4) { for (let i = 0; i < 3; i++) c.rect(x0 + cs * (0.12 + i * 0.29), y0 + cs * 0.12, cs * 0.16, cs * 0.76); }
      else { for (let i = 0; i < 4; i++) { c.moveTo(x0 + cs * (0.3 + (i & 1) * 0.4) + cs * 0.12, y0 + cs * (0.3 + (i >> 1) * 0.4)); c.arc(x0 + cs * (0.3 + (i & 1) * 0.4), y0 + cs * (0.3 + (i >> 1) * 0.4), cs * 0.12, 0, Math.PI * 2); } }
      c.fill();
    }
    // A couple of big strokes tie it together.
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(255,248,235,0.9)'; c.lineWidth = cs * 0.16;
    c.beginPath(); c.arc(S * (0.3 + r() * 0.4), S * (0.3 + r() * 0.4), S * 0.3, r() * 3, r() * 3 + 3.6); c.stroke();
    c.strokeStyle = 'rgba(20,20,40,0.85)'; c.lineWidth = cs * 0.08;
    c.beginPath(); c.moveTo(S * 0.05, S * (0.2 + r() * 0.6)); c.bezierCurveTo(S * 0.35, S * r(), S * 0.65, S * r(), S * 0.95, S * (0.2 + r() * 0.6)); c.stroke();
  }
  function drawCosmos(c, S, r) {
    let g = c.createRadialGradient(S * 0.5, S * 0.45, 0, S * 0.5, S * 0.5, S * 0.75);
    g.addColorStop(0, '#3d1c72'); g.addColorStop(1, '#07031a');
    c.fillStyle = g; c.fillRect(0, 0, S, S);
    c.globalCompositeOperation = 'lighter';
    for (const col of ['255,90,180', '80,140,255', '120,255,220']) {
      const x = r() * S, y = r() * S, rr = S * (0.25 + r() * 0.2);
      g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, `rgba(${col},0.32)`); g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    c.globalCompositeOperation = 'source-over';
    stars(c, S, r, 170, 1, S / 600);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = S * 0.002;
    for (let i = 0; i < 6; i++) { const x = r() * S, y = r() * S, l = S * 0.012; c.beginPath(); c.moveTo(x - l, y); c.lineTo(x + l, y); c.moveTo(x, y - l); c.lineTo(x, y + l); c.stroke(); }
    const px = S * 0.52, py = S * 0.55, pr = S * 0.24, tilt = -0.35;
    const ring = (front) => {
      c.save(); c.translate(px, py); c.rotate(tilt);
      [[1.75, 0.035, '#ffd9a8'], [1.55, 0.02, '#ff9fb8'], [1.4, 0.012, '#c7a8ff']].forEach(([k, w, col]) => {
        c.strokeStyle = col; c.lineWidth = S * w; c.globalAlpha = 0.85;
        c.beginPath(); c.ellipse(0, 0, pr * k, pr * k * 0.26, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); c.stroke();
      });
      c.restore();
    };
    ring(false);
    c.save(); c.beginPath(); c.arc(px, py, pr, 0, Math.PI * 2); c.clip();
    g = c.createLinearGradient(px - pr, py - pr, px + pr, py + pr);
    g.addColorStop(0, '#ffcf7a'); g.addColorStop(0.5, '#ff6f91'); g.addColorStop(1, '#5b2a9a');
    c.fillStyle = g; c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    c.translate(px, py); c.rotate(tilt);
    for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '120,30,90'},${0.08 + r() * 0.12})`; c.fillRect(-pr, -pr + i * pr * 0.23 + r() * pr * 0.05, pr * 2, pr * (0.05 + r() * 0.08)); }
    c.setTransform(1, 0, 0, 1, 0, 0);
    g = c.createRadialGradient(px - pr * 0.35, py - pr * 0.4, pr * 0.1, px, py, pr * 1.05);
    g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(10,0,30,0.55)');
    c.fillStyle = g; c.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    c.restore();
    ring(true);
    for (const [mx, my, mr, col] of [[0.16, 0.22, 0.05, '#7fd8ff'], [0.85, 0.2, 0.03, '#ffe08a'], [0.18, 0.86, 0.035, '#b7ffd6']]) {
      g = c.createRadialGradient(S * (mx - mr * 0.4), S * (my - mr * 0.4), 0, S * mx, S * my, S * mr);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, col); g.addColorStop(1, shade(col, -0.6));
      c.fillStyle = g; c.beginPath(); c.arc(S * mx, S * my, S * mr, 0, Math.PI * 2); c.fill();
    }
    g = c.createLinearGradient(S * 0.62, S * 0.08, S * 0.95, S * 0.32);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.9)');
    c.strokeStyle = g; c.lineWidth = S * 0.006; c.lineCap = 'round';
    c.beginPath(); c.moveTo(S * 0.62, S * 0.08); c.lineTo(S * 0.93, S * 0.3); c.stroke();
  }
  const PICS = [
    { name: 'Sunset Bay', icon: '🌅', draw: drawSunset },
    { name: 'Northern Lights', icon: '🌌', draw: drawAurora },
    { name: 'Shape Party', icon: '🎨', draw: drawShapes },
    { name: 'Ringed Planet', icon: '🪐', draw: drawCosmos },
  ];

  // ---------- Saved progress ----------
  let sizeIx = clamp(Kit.store.get('tileslide.size', 1) | 0, 0, 2);
  let styleIx = clamp(Kit.store.get('tileslide.style', 1) | 0, 0, 1);
  let wins = Kit.store.get('tileslide.wins', 0) | 0;
  const bests = Object.assign({ 3: 0, 4: 0, 5: 0 }, Kit.store.get('tileslide.best', {}));
  let picTurn = Kit.store.get('tileslide.pic', 0) | 0;

  // ---------- Boards ----------
  // tiles[cell] = tile number (1..n*n-1) or 0 for the gap. Each tile glides from (fx,fy) to (tx,ty) in cells.
  function newBoard(n, style, shuffled, seed) {
    const pic = PICS[((picTurn % PICS.length) + PICS.length) % PICS.length];
    picTurn++;
    const b = { n, style, pic, seed: seed != null ? seed : (Math.random() * 2147483647) | 0, tiles: [], anim: [], gap: n * n - 1, cache: null };
    for (let i = 0; i < n * n; i++) b.tiles.push((i + 1) % (n * n));
    for (let v = 1; v < n * n; v++) { const i = v - 1; b.anim[v] = { fx: i % n, fy: (i / n) | 0, tx: i % n, ty: (i / n) | 0, t: 1, dur: 0.13 }; }
    if (shuffled) {
      scramble(b);
      b.tiles.forEach((v, i) => { if (v) { const a = b.anim[v]; a.tx = i % n; a.ty = (i / n) | 0; } });
    }
    return b;
  }
  const neighbours = (b, g) => {
    const n = b.n, out = [];
    if (g % n > 0) out.push(g - 1);
    if (g % n < n - 1) out.push(g + 1);
    if (g >= n) out.push(g - n);
    if (g < n * n - n) out.push(g + n);
    return out;
  };
  function disorder(b) {
    let d = 0;
    b.tiles.forEach((v, i) => { if (v) d += Math.abs(((v - 1) % b.n) - (i % b.n)) + Math.abs((((v - 1) / b.n) | 0) - ((i / b.n) | 0)); });
    return d;
  }
  // Real slides from the solved board: every shuffle can be solved.
  function scramble(b) {
    const need = b.n * b.n * b.n * 8;
    let last = -1, steps = 0;
    while (steps < need || disorder(b) < b.n * b.n * 0.9 || solved(b)) {
      const opts = neighbours(b, b.gap).filter((o) => o !== last);
      const k = opts[(Math.random() * opts.length) | 0];
      b.tiles[b.gap] = b.tiles[k]; b.tiles[k] = 0; last = b.gap; b.gap = k;
      if (++steps > need * 6 && !solved(b)) break;
    }
  }
  const solved = (b) => b.tiles.every((v, i) => i === b.n * b.n - 1 || v === i + 1);
  const atHome = (b, v) => b.tiles[v - 1] === v;
  const inPlace = (b) => b.tiles.reduce((s, v, i) => s + (v && v === i + 1 ? 1 : 0), 0);
  function animPos(a) { const k = ease.out(clamp(a.t, 0, 1)); return { x: lerp(a.fx, a.tx, k), y: lerp(a.fy, a.ty, k) }; }
  function moveCell(b, from) {
    const n = b.n, v = b.tiles[from], to = b.gap;
    b.tiles[to] = v; b.tiles[from] = 0; b.gap = from;
    const a = b.anim[v], p = animPos(a);
    a.fx = p.x; a.fy = p.y; a.tx = to % n; a.ty = (to / n) | 0; a.t = 0; a.dur = 0.13;
    b.last = v;
    return v;
  }
  function slideDir(b, dir) {
    const n = b.n, x = (b.gap % n) + OFF[dir][0], y = ((b.gap / n) | 0) + OFF[dir][1];
    if (x < 0 || y < 0 || x >= n || y >= n) return 0;
    return moveCell(b, y * n + x);
  }

  // ---------- Geometry and cached sprites (gradients are slow on TV boxes) ----------
  function geom(x, y, B, n) {
    const pad = B * 0.035, inner = B - pad * 2, cell = inner / n, gp = Math.max(3, cell * 0.07), ts = cell - gp;
    return { x, y, B, n, pad, inner, cell, gp, ts, r: ts * 0.13, depth: Math.max(3, ts * 0.055), ix: x + pad, iy: y + pad };
  }
  const tileXY = (G, cx, cy) => [G.ix + cx * G.cell + G.gp / 2, G.iy + cy * G.cell + G.gp / 2 - G.depth / 2];
  function ensureCache(b, G) {
    const dpr = dprNow(), key = `${Math.round(G.B)}|${b.n}|${dpr}`;
    if (b.cache && b.cache.key === key) return b.cache;
    const C = { key };
    const P = Math.min(1600, Math.round(G.inner * dpr));
    C.pic = canvasOf(P, P);
    b.pic.draw(C.pic.getContext('2d'), P, rng(b.seed));
    C.f = P / G.inner;
    // Board frame and slots
    const m = G.B * 0.05;
    C.m = m;
    C.back = canvasOf((G.B + m * 2) * dpr, (G.B + m * 2) * dpr);
    let c = C.back.getContext('2d');
    c.scale(dpr, dpr); c.translate(m, m);
    c.save();
    c.shadowColor = 'rgba(255,110,90,0.45)'; c.shadowBlur = m * 0.9;
    roundRect(c, 0, 0, G.B, G.B, G.B * 0.045);
    let g = c.createLinearGradient(0, 0, 0, G.B);
    g.addColorStop(0, '#4a1736'); g.addColorStop(1, '#1d0715');
    c.fillStyle = g; c.fill();
    c.restore();
    c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,175,140,0.45)'; c.stroke();
    roundRect(c, G.pad * 0.45, G.pad * 0.45, G.B - G.pad * 0.9, G.B - G.pad * 0.9, G.B * 0.03);
    c.fillStyle = 'rgba(8,0,6,0.45)'; c.fill();
    for (let y = 0; y < b.n; y++) for (let x = 0; x < b.n; x++) {
      roundRect(c, G.pad + x * G.cell + G.gp / 2, G.pad + y * G.cell + G.gp / 2, G.ts, G.ts, G.r);
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fill();
      c.lineWidth = 1; c.strokeStyle = 'rgba(255,200,180,0.07)'; c.stroke();
    }
    // Glow behind tiles in their right place
    const gm = G.ts * 0.2;
    C.gm = gm;
    C.glow = canvasOf((G.ts + gm * 2) * dpr, (G.ts + G.depth + gm * 2) * dpr);
    c = C.glow.getContext('2d'); c.scale(dpr, dpr);
    c.shadowColor = 'rgba(255,214,102,1)'; c.shadowBlur = gm * 0.9;
    c.strokeStyle = 'rgba(255,226,140,0.95)'; c.lineWidth = Math.max(2, G.ts * 0.035);
    roundRect(c, gm, gm, G.ts, G.ts + G.depth, G.r); c.stroke(); c.stroke();
    // Frame glow when solved
    C.win = canvasOf((G.B + m * 2) * dpr, (G.B + m * 2) * dpr);
    c = C.win.getContext('2d'); c.scale(dpr, dpr);
    c.shadowColor = 'rgba(255,214,102,1)'; c.shadowBlur = m * 0.9;
    c.strokeStyle = '#ffe28a'; c.lineWidth = 4;
    roundRect(c, m + G.pad * 0.6, m + G.pad * 0.6, G.B - G.pad * 1.2, G.B - G.pad * 1.2, G.B * 0.03); c.stroke(); c.stroke();
    C.tiles = [];
    for (let i = 0; i < b.n * b.n; i++) C.tiles.push(tileSprite(b, G, C, i, dpr));
    b.cache = C;
    return C;
  }
  function tileSprite(b, G, C, i, dpr) {
    const n = b.n, ts = G.ts, d = G.depth, r = G.r, hx = i % n, hy = (i / n) | 0, pic = b.style === 'picture';
    const s = canvasOf(ts * dpr, (ts + d) * dpr), c = s.getContext('2d');
    c.scale(dpr, dpr);
    const base = ROWCOL[n === 1 ? 0 : Math.round((hy * 4) / (n - 1))];
    roundRect(c, 0, d, ts, ts, r);
    c.fillStyle = pic ? 'rgba(18,3,12,0.95)' : shade(base, -0.5); c.fill();
    c.save();
    roundRect(c, 0, 0, ts, ts, r); c.clip();
    if (pic) {
      c.drawImage(C.pic, (hx * G.cell + G.gp / 2) * C.f, (hy * G.cell + G.gp / 2) * C.f, ts * C.f, ts * C.f, 0, 0, ts, ts);
    } else {
      let g = c.createLinearGradient(0, 0, 0, ts);
      g.addColorStop(0, shade(base, 0.35)); g.addColorStop(0.5, base); g.addColorStop(1, shade(base, -0.18));
      c.fillStyle = g; c.fillRect(0, 0, ts, ts);
      g = c.createRadialGradient(ts * 0.3, ts * 0.25, 0, ts * 0.3, ts * 0.25, ts * 0.7);
      g.addColorStop(0, 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.fillRect(0, 0, ts, ts);
    }
    const g = c.createLinearGradient(0, 0, 0, ts);
    g.addColorStop(0, `rgba(255,255,255,${pic ? 0.26 : 0.3})`); g.addColorStop(0.4, 'rgba(255,255,255,0.05)');
    g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.2)');
    c.fillStyle = g; c.fillRect(0, 0, ts, ts);
    c.restore();
    roundRect(c, 0.75, 0.75, ts - 1.5, ts - 1.5, r);
    const rim = c.createLinearGradient(0, 0, 0, ts);
    rim.addColorStop(0, 'rgba(255,255,255,0.6)'); rim.addColorStop(1, 'rgba(255,255,255,0.04)');
    c.strokeStyle = rim; c.lineWidth = 1.5; c.stroke();
    const last = i === n * n - 1;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    if (!pic) {
      const fs = ts * (last ? 0.5 : n === 5 && i >= 9 ? 0.42 : 0.48);
      c.font = `900 ${Math.round(fs)}px system-ui, sans-serif`;
      c.save();
      c.shadowColor = 'rgba(60,10,30,0.45)'; c.shadowOffsetY = ts * 0.03; c.shadowBlur = ts * 0.04;
      c.lineWidth = ts * 0.06; c.strokeStyle = 'rgba(70,15,35,0.45)';
      c.strokeText(last ? '★' : String(i + 1), ts / 2, ts * 0.53);
      c.restore();
      c.fillStyle = '#ffffff'; c.fillText(last ? '★' : String(i + 1), ts / 2, ts * 0.53);
    } else if (!last) {
      const fs = Math.max(11, ts * 0.19);
      c.font = `800 ${Math.round(fs)}px system-ui, sans-serif`;
      const label = String(i + 1), w = c.measureText(label).width + fs * 0.75, h = fs * 1.3;
      roundRect(c, ts * 0.06, ts * 0.06, w, h, h / 2);
      c.fillStyle = 'rgba(20,4,14,0.42)'; c.fill();
      c.fillStyle = 'rgba(255,255,255,0.78)'; c.fillText(label, ts * 0.06 + w / 2, ts * 0.06 + h * 0.54);
    }
    return s;
  }
  // A soft white band that sweeps across the solved picture.
  const shine = canvasOf(256, 4);
  (() => {
    const c = shine.getContext('2d'), g = c.createLinearGradient(0, 0, 256, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, 256, 4);
  })();

  const PAR = { 3: 45, 4: 160, 5: 380 };
  const starsFor = (n, m) => (m <= PAR[n] ? 3 : m <= PAR[n] * 2 ? 2 : 1);
  function starPic(on) {
    const S = 96, s = canvasOf(S, S), c = s.getContext('2d');
    c.translate(S / 2, S / 2 + 3);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const r = (i % 2 ? 0.21 : 0.46) * S, a = -Math.PI / 2 + (i * Math.PI) / 5; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    c.closePath();
    c.lineJoin = 'round';
    if (on) {
      const g = c.createLinearGradient(0, -S / 2, 0, S / 2);
      g.addColorStop(0, '#fff6c2'); g.addColorStop(0.5, '#ffd23f'); g.addColorStop(1, '#ff9a1f');
      c.fillStyle = g; c.fill(); c.lineWidth = 4; c.strokeStyle = '#8a3a10'; c.stroke();
      c.fillStyle = 'rgba(255,255,255,0.45)'; c.beginPath(); c.ellipse(-S * 0.08, -S * 0.12, S * 0.07, S * 0.04, -0.5, 0, Math.PI * 2); c.fill();
    } else { c.fillStyle = 'rgba(10,0,8,0.45)'; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,200,170,0.3)'; c.stroke(); }
    return s;
  }
  const starOn = starPic(true), starOff = starPic(false);

  // ---------- Game state ----------
  // state: 'menu' (a preview board shuffles itself), 'play', 'pause', 'won'
  let state = 'menu', stateT = 0;
  let board = null, demo = null, demoT = 0, demoLast = -1;
  let moves = 0, shownMoves = 0, bump = 0, elapsed = 0, started = false, introT = 0;
  let winT = 0, newBest = false, prevBest = 0, winFx = 0, peekT = 0, nudge = { t: 9, x: 0, y: 0 };
  let menuRow = 2, pauseIx = 0;
  const N = () => SIZES[sizeIx];
  const PEEK = 1.8, INTRO = 1.45;

  function remakeDemo() {
    demo = newBoard(N(), STYLES[styleIx].id, true);
    picTurn--; // the preview shows the picture the next game will use
    demoT = 0; demoLast = -1;
  }
  function startGame() {
    Kit.store.set('tileslide.size', sizeIx); Kit.store.set('tileslide.style', styleIx);
    const n = N();
    board = newBoard(n, STYLES[styleIx].id, true, demo ? demo.seed : null);
    Kit.store.set('tileslide.pic', picTurn % PICS.length);
    // Show the goal for a moment, then the tiles scatter to the shuffle.
    board.tiles.forEach((v, i) => {
      if (!v) return;
      const a = board.anim[v];
      a.fx = (v - 1) % n; a.fy = ((v - 1) / n) | 0; a.tx = i % n; a.ty = (i / n) | 0;
      a.dur = 0.5; a.t = -(0.6 + Math.random() * 0.35) / a.dur;
    });
    moves = 0; shownMoves = 0; bump = 0; elapsed = 0; started = false; introT = INTRO; peekT = 0;
    winT = 0; winFx = 0; newBest = false;
    state = 'play'; stateT = 0;
    Kit.tone(660, { type: 'triangle', dur: 0.1, vol: 0.18 });
    for (let i = 0; i < 6; i++) Kit.noise({ dur: 0.08, vol: 0.05, freq: 1500 + i * 300, q: 1, at: 0.6 + i * 0.07 });
  }
  function toMenu() { state = 'menu'; stateT = 0; menuRow = 2; remakeDemo(); }

  function slideSound(v) {
    Kit.noise({ dur: 0.07, vol: 0.07, freq: 1700, q: 0.9, sweep: 0.5 });
    Kit.tone(200 + (v % 5) * 18, { type: 'triangle', dur: 0.07, vol: 0.12, slide: 0.7 });
  }
  function afterMove(vs) {
    started = true;
    moves += vs.length; bump = 1;
    slideSound(vs[0]);
    const G = L.game, here = inPlace(board);
    for (const v of vs) {
      if (!atHome(board, v)) continue;
      const [x, y] = tileXY(G, (v - 1) % board.n, ((v - 1) / board.n) | 0);
      Kit.burst(x + G.ts / 2, y + G.ts / 2, GOLD, 6, 0.45);
      const f = NOTES[Math.min(NOTES.length - 1, Math.floor((here / (board.n * board.n - 1)) * 7))];
      Kit.tone(f, { type: 'sine', dur: 0.18, vol: 0.12, at: 0.04 });
      Kit.tone(f * 2, { type: 'sine', dur: 0.1, vol: 0.04, at: 0.06 });
    }
    if (solved(board)) win();
  }
  function bonk(dir) {
    nudge = { t: 0, x: -OFF[dir][0], y: -OFF[dir][1] };
    Kit.tone(130, { type: 'square', dur: 0.08, vol: 0.06 });
  }
  function win() {
    state = 'won'; winT = 0; winFx = 0;
    const n = board.n;
    prevBest = bests[n];
    newBest = !prevBest || moves < prevBest;
    if (newBest) { bests[n] = moves; Kit.store.set('tileslide.best', bests); }
    wins++; Kit.store.set('tileslide.wins', wins); Kit.record('tileslide', wins);
  }
  function openPause() { state = 'pause'; pauseIx = 0; stateT = 0; sfx.move(); }
  const PAUSE = ['Resume', 'Peek at the goal', 'New shuffle', 'Change size / style'];
  function pauseChoose(i) {
    if (i === 0) { state = 'play'; sfx.pick(); } else if (i === 1) { state = 'play'; peekT = PEEK; sfx.pick(); } else if (i === 2) startGame(); else { sfx.move(); toMenu(); }
  }

  // ---------- Keys ----------
  Kit.onKeys((k, rep) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      if (k === 'ok') { if (!rep) startGame(); return; }
      if (k === 'up' || k === 'down') { const r = clamp(menuRow + (k === 'up' ? -1 : 1), 0, 2); if (r !== menuRow) { menuRow = r; sfx.move(); } return; }
      if (k === 'left' || k === 'right') {
        const d = k === 'left' ? -1 : 1;
        if (menuRow === 0) { const s = clamp(sizeIx + d, 0, 2); if (s !== sizeIx) { sizeIx = s; sfx.move(); remakeDemo(); } else sfx.nope(); }
        else if (menuRow === 1) { const s = clamp(styleIx + d, 0, 1); if (s !== styleIx) { styleIx = s; sfx.move(); remakeDemo(); } else sfx.nope(); }
      }
      return;
    }
    if (state === 'pause') {
      if (k === 'up' || k === 'down') { pauseIx = (pauseIx + (k === 'up' ? PAUSE.length - 1 : 1)) % PAUSE.length; sfx.move(); }
      else if (k === 'ok' && !rep) pauseChoose(pauseIx);
      return;
    }
    if (state === 'won') {
      if (winT < 1.9) return;
      if (k === 'ok' && !rep) startGame();
      else if (OFF[k] && !rep) { sfx.move(); toMenu(); }
      return;
    }
    if (k === 'restart') { startGame(); return; }
    if (k === 'ok') { if (!rep) openPause(); return; }
    if (OFF[k]) {
      if (introT > 0) return;
      peekT = Math.min(peekT, 0.15);
      const v = slideDir(board, k);
      if (v) afterMove([v]); else bonk(k);
    }
  });

  // ---------- Touch and mouse ----------
  let press = null;
  const inside = (p, r) => r && p.x >= r.x && p.y >= r.y && p.x <= r.x + r.w && p.y <= r.y + r.h;
  const muteBox = () => ({ x: Kit.W - 62, y: 8, w: 52, h: 52 });
  function tapBoard(p) {
    const G = L.game, n = board.n;
    const cx = Math.floor((p.x - G.ix) / G.cell), cy = Math.floor((p.y - G.iy) / G.cell);
    if (cx < 0 || cy < 0 || cx >= n || cy >= n) return false;
    const c = cy * n + cx, gx = board.gap % n, gy = (board.gap / n) | 0;
    if (c === board.gap) return true;
    if (cx !== gx && cy !== gy) { nudge = { t: 0, x: 0, y: 0 }; Kit.tone(130, { type: 'square', dur: 0.08, vol: 0.06 }); return true; }
    // A tap slides every tile between it and the gap.
    const step = cx === gx ? (cy > gy ? n : -n) : (cx > gx ? 1 : -1), vs = [];
    while (board.gap !== c) vs.push(moveCell(board, board.gap + step));
    afterMove(vs);
    return true;
  }
  Kit.onPointer({
    down(p) {
      if (inside(p, muteBox())) { Kit.toggleMute(); return; }
      press = { x: p.x, y: p.y };
    },
    up(p, cancel) {
      const s = press; press = null;
      if (!s || cancel) return;
      const dx = p.x - s.x, dy = p.y - s.y, swiped = Math.hypot(dx, dy) > 34;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
      if (state === 'menu') {
        const h = L.hits.find((r) => inside(s, r));
        if (!h) return;
        if (h.row === 0) { if (sizeIx !== h.i) { sizeIx = h.i; remakeDemo(); } menuRow = 0; sfx.move(); }
        else if (h.row === 1) { if (styleIx !== h.i) { styleIx = h.i; remakeDemo(); } menuRow = 1; sfx.move(); }
        else startGame();
        return;
      }
      if (state === 'pause') {
        const h = L.hits.find((r) => inside(s, r));
        if (h) pauseChoose(h.i); else pauseChoose(0);
        return;
      }
      if (state === 'won') {
        if (winT < 1.9) return;
        const h = L.hits.find((r) => inside(s, r));
        if (h && h.i === 1) { sfx.move(); toMenu(); } else startGame();
        return;
      }
      if (introT > 0) return;
      if (swiped) {
        peekT = Math.min(peekT, 0.15);
        const v = slideDir(board, dir);
        if (v) afterMove([v]); else bonk(dir);
        return;
      }
      if (!tapBoard(s) && inside(s, L.side)) openPause();
    },
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') { state = 'pause'; pauseIx = 0; } });

  // ---------- Layout ----------
  let L = { hits: [] };
  function layout() {
    const W = Kit.W, H = Kit.H, wide = W / H > 1.15, u = wide ? Math.min(H, W * 0.5625) / 30 : Math.min(W / 26, H / 30);
    L = { W, H, u, wide, hits: [] };
    if (wide) {
      const B = Math.min(H * 0.86, W * 0.56), sw = Math.min(B * 0.7, W - B - W * 0.12), gx = u * 1.6;
      const x0 = (W - (B + gx + sw)) / 2, y0 = (H - B) / 2;
      L.boardRect = { x: x0, y: y0, B };
      L.side = { x: x0 + B + gx, y: y0, w: sw, h: B };
      const P = Math.min(H * 0.62, W * 0.38);
      L.prev = { x: W * 0.72 - P / 2, y: H * 0.47 - P / 2, B: P };
    } else {
      const B = Math.min(W * 0.92, H * 0.6), sh = Math.min(H * 0.26, u * 9);
      L.side = { x: (W - B) / 2, y: Math.max(66, (H - sh - u - B) / 2), w: B, h: sh };
      L.boardRect = { x: (W - B) / 2, y: L.side.y + sh + u, B };
      const P = Math.min(W * 0.62, H * 0.3);
      L.prev = { x: (W - P) / 2, y: H * 0.62, B: P };
    }
  }
  Kit.onResize(layout);

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    if (!L.W || L.W !== Kit.W || L.H !== Kit.H) layout();
    if (!demo) remakeDemo();
    const n = board ? board.n : 0;
    if (board) {
      for (let v = 1; v < n * n; v++) { const a = board.anim[v]; if (a.t < 1) a.t = Math.min(1, a.t + dt / a.dur); }
      L.game = geom(L.boardRect.x, L.boardRect.y, L.boardRect.B, n);
    }
    shownMoves += (moves - shownMoves) * Math.min(1, dt * 12);
    if (Math.abs(moves - shownMoves) < 0.4) shownMoves = moves;
    bump = Math.max(0, bump - dt * 4);
    nudge.t += dt;
    if (state === 'play') {
      if (introT > 0) { introT -= dt; }
      if (started && !document.hidden) elapsed += dt;
      if (peekT > 0) peekT = Math.max(0, peekT - dt);
    }
    if (state === 'won') {
      winT += dt;
      if (winFx === 0) { winFx = 1; Kit.tone(880, { type: 'triangle', dur: 0.14, vol: 0.18, slide: 1.5 }); }
      if (winFx === 1 && winT > 0.45) { winFx = 2; Kit.noise({ dur: 0.5, vol: 0.09, freq: 600, q: 0.6, sweep: 5 }); }
      if (winFx === 2 && winT > 0.95) {
        winFx = 3; sfx.win(); Kit.confetti(140); Kit.shake(5, 0.25);
        const G = L.game;
        Kit.burst(G.x + G.B / 2, G.y + G.B / 2, GOLD, 30, 1.4);
        Kit.float('Solved!', G.x + G.B / 2, G.y + G.B * 0.5, { color: GOLD, size: G.B * 0.14, life: 1.5, big: true });
      }
      if (winFx === 3 && winT > 1.7) { winFx = 4; if (newBest && prevBest) sfx.chime(); }
      if (winFx >= 4 && winFx < 4 + starsFor(board.n, moves) && winT > 1.95 + (winFx - 4) * 0.18) { Kit.tone(NOTES[4 + (winFx - 4) * 2], { type: 'triangle', dur: 0.2, vol: 0.14 }); winFx++; }
    }
    if (state === 'menu' && demo) {
      for (let v = 1; v < demo.n * demo.n; v++) { const a = demo.anim[v]; if (a.t < 1) a.t = Math.min(1, a.t + dt / a.dur); }
      demoT += dt;
      if (demoT > 0.75) {
        demoT = 0;
        const opts = neighbours(demo, demo.gap).filter((o) => o !== demoLast);
        demoLast = demo.gap;
        moveCell(demo, opts[(Math.random() * opts.length) | 0]);
        demo.anim[demo.last].dur = 0.28;
      }
    }
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
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(30,6,20,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, top = '#5a1f42', bottom = '#260a1c') {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = border; c.stroke();
  }
  const fmtTime = (s) => { s = Math.floor(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

  function drawBoard(c, b, G, t, opts = {}) {
    const C = ensureCache(b, G), n = b.n, ts = G.ts, d = G.depth;
    let ox = 0, oy = 0;
    if (opts.nudge && nudge.t < 0.25) {
      const k = Math.sin(nudge.t * 50) * (1 - nudge.t / 0.25) * G.cell * 0.04;
      ox = nudge.x ? k * nudge.x : k; oy = nudge.y ? k * nudge.y : 0;
    }
    c.drawImage(C.back, G.x - C.m, G.y - C.m, G.B + C.m * 2, G.B + C.m * 2);
    c.save(); c.translate(ox, oy);
    const merge = opts.merge || 0;
    if (!merge) {
      // The gap breathes softly.
      const gx = b.gap % n, gy = (b.gap / n) | 0;
      roundRect(c, G.ix + gx * G.cell + G.gp / 2 + 2, G.iy + gy * G.cell + G.gp / 2 + 2, ts - 4, ts - 4, G.r);
      c.lineWidth = 2; c.strokeStyle = `rgba(255,170,140,${0.18 + Math.sin(t * 3) * 0.1})`; c.stroke();
    }
    const pos = [];
    let moving = 0;
    for (let v = 1; v < n * n; v++) {
      const a = b.anim[v], p = animPos(a);
      pos[v] = p;
      if (a.t < 1 && a.t > 0) moving = v;
    }
    if (opts.glow && !merge) {
      for (let v = 1; v < n * n; v++) {
        if (!atHome(b, v) || b.anim[v].t < 1) continue;
        const [x, y] = tileXY(G, pos[v].x, pos[v].y);
        c.globalAlpha = 0.75 + 0.25 * Math.sin(t * 2.6 + v * 0.7);
        c.drawImage(C.glow, x - C.gm, y - C.gm, ts + C.gm * 2, ts + d + C.gm * 2);
      }
      c.globalAlpha = 1;
    }
    const grow = merge ? lerp(1, G.cell / ts, merge) : 1;
    const drawTile = (v, p, alpha) => {
      const a = b.anim[v];
      const lift = a.t > 0 && a.t < 1 ? Math.sin(Math.PI * a.t) * d * (a.dur > 0.3 ? 2.2 : 0.7) : 0;
      const [x, y] = tileXY(G, p.x, p.y);
      if (grow !== 1) {
        const cx = x + ts / 2, cy = y + (ts + d) / 2, w = ts * grow, h = (ts + d) * grow;
        c.drawImage(C.tiles[v - 1], cx - w / 2, cy - h / 2, w, h);
      } else c.drawImage(C.tiles[v - 1], x, y - lift, ts, ts + d);
    };
    if (merge > 0) { c.save(); roundRect(c, G.ix, G.iy, G.inner, G.inner, G.r); c.clip(); }
    if (merge < 1) {
      for (let v = 1; v < n * n; v++) if (v !== moving) drawTile(v, pos[v]);
      if (moving) drawTile(moving, pos[moving]);
    }
    // Solved: the last piece pops into the gap.
    if (opts.lastPiece != null) {
      const k = opts.lastPiece;
      const [x, y] = tileXY(G, n - 1, n - 1);
      const s = ease.back(k) * grow, w = ts * s, h = (ts + d) * s;
      if (s > 0.01 && merge < 1) c.drawImage(C.tiles[n * n - 1], x + ts / 2 - w / 2, y + (ts + d) / 2 - h / 2, w, h);
    }
    if (merge > 0) {
      c.globalAlpha = merge;
      c.drawImage(C.pic, G.ix, G.iy, G.inner, G.inner);
      c.globalAlpha = 1;
      if (opts.shine != null && opts.shine > 0 && opts.shine < 1) {
        c.translate(G.ix + G.inner / 2, G.iy + G.inner / 2); c.rotate(-0.6);
        const sx = lerp(-G.inner * 1.1, G.inner * 1.1, opts.shine);
        c.drawImage(shine, sx - G.inner * 0.25, -G.inner, G.inner * 0.5, G.inner * 2);
      }
      c.restore();
      c.globalAlpha = merge;
      c.drawImage(C.win, G.x - C.m, G.y - C.m, G.B + C.m * 2, G.B + C.m * 2);
      c.globalAlpha = 1;
    }
    if (opts.peek > 0) {
      c.globalAlpha = opts.peek * 0.92;
      roundRect(c, G.ix - 2, G.iy - 2, G.inner + 4, G.inner + 4, G.r);
      c.fillStyle = 'rgba(20,4,14,0.85)'; c.fill();
      for (let i = 0; i < n * n; i++) {
        const [x, y] = tileXY(G, i % n, (i / n) | 0);
        c.drawImage(C.tiles[i], x, y, ts, ts + d);
      }
      c.globalAlpha = 1;
    }
    c.restore();
  }

  // The goal in miniature: each tile at home, drawn small.
  function drawThumb(c, b, G, x, y, s) {
    const C = ensureCache(b, G);
    roundRect(c, x - 4, y - 4, s + 8, s + 8, s * 0.06);
    c.fillStyle = 'rgba(10,0,8,0.5)'; c.fill();
    c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,190,160,0.3)'; c.stroke();
    if (b.style === 'picture') { c.drawImage(C.pic, x, y, s, s); return; }
    const k = s / G.inner;
    for (let i = 0; i < b.n * b.n - 1; i++) {
      const tx = x + ((i % b.n) * G.cell + G.gp / 2) * k, ty = y + (((i / b.n) | 0) * G.cell + G.gp / 2) * k;
      c.drawImage(C.tiles[i], tx, ty, G.ts * k, (G.ts + G.depth) * k);
    }
  }

  function draw(c, t) {
    const W = Kit.W, H = Kit.H;
    Kit.background(c, t, '#4b1631', '#14050d', 'rgba(255,140,100,0.09)');
    if (!L.W) return;
    if (state === 'menu') drawMenu(c, t);
    else drawGame(c, t);
    const mb = muteBox();
    c.globalAlpha = 0.7; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;
  }

  function drawGame(c, t) {
    const G = L.game, u = L.u;
    if (!board || !G) return;
    const opts = { glow: true, nudge: true, peek: 0 };
    if (peekT > 0) opts.peek = Math.min(1, peekT * 4, (PEEK - peekT) * 8);
    if (state === 'won') {
      opts.lastPiece = clamp(winT / 0.35, 0, 1);
      opts.merge = ease.inOut(clamp((winT - 0.45) / 0.5, 0, 1));
      opts.shine = clamp((winT - 1.0) / 0.8, 0, 1);
    }
    drawBoard(c, board, G, t, opts);
    if (state === 'play' && introT > 0) {
      const k = clamp((INTRO - introT) / 0.25, 0, 1) * clamp(introT / 0.3, 0, 1);
      if (k > 0) {
        c.globalAlpha = k;
        outlined(c, 'Shuffle!', G.x + G.B / 2, G.y + G.B / 2, G.B * 0.11 * ease.back(clamp((INTRO - introT) / 0.3, 0, 1)), '#ffffff', '#ffb36b');
        c.globalAlpha = 1;
      }
    }
    if (state === 'won' && winT > 1.6) drawWin(c, t);
    else drawHud(c, t);
    if (state === 'pause') drawPause(c, t);
  }

  function drawHud(c, t) {
    const S = L.side, u = L.u, n = board.n, wide = L.wide;
    panel(c, S.x, S.y, S.w, S.h, u * 1.1, 'rgba(255,175,140,0.35)');
    const cx = S.x + S.w / 2;
    const style = STYLES.find((s) => s.id === board.style);
    if (wide) {
      let y = S.y + u * 1.7;
      outlined(c, 'TILE SLIDE', cx, y, u * 1.75, '#fff3e6', '#ff9a6b');
      y += u * 1.55;
      text(c, `${n}×${n}  ·  ${style.icon} ${style.name}`, cx, y, u * 0.85, 'rgba(255,230,220,0.8)', 700);
      // Moves and time
      y += u * 1.2;
      const bw = (S.w - u * 2.4) / 2, bh = u * 3.3;
      [['MOVES', null], ['TIME', fmtTime(elapsed)]].forEach(([label, val], i) => {
        const x = S.x + u * 0.8 + i * (bw + u * 0.8);
        roundRect(c, x, y, bw, bh, u * 0.6); c.fillStyle = 'rgba(10,0,8,0.38)'; c.fill();
        text(c, label, x + bw / 2, y + u * 0.75, u * 0.7, 'rgba(255,200,180,0.75)', 800);
        if (val == null) {
          c.save(); c.translate(x + bw / 2, y + bh * 0.63); const s = 1 + bump * 0.18; c.scale(s, s);
          outlined(c, String(Math.round(shownMoves)), 0, 0, u * 1.55, '#fff6c2', '#ffb703');
          c.restore();
        } else outlined(c, val, x + bw / 2, y + bh * 0.63, u * 1.4, '#ffffff', '#ffc9b0');
      });
      y += bh + u * 1.1;
      text(c, bests[n] ? `👑 Best ${n}×${n}: ${bests[n]} moves` : `👑 Best ${n}×${n}: not solved yet`, cx, y, u * 0.82, GOLD, 800);
      y += u * 1.15;
      text(c, `🏆 Wins: ${wins}`, cx, y, u * 0.82, 'rgba(255,255,255,0.85)', 800);
      // In place
      y += u * 1.2;
      const total = n * n - 1, here = inPlace(board), pw = S.w - u * 2.4, px = S.x + u * 1.2;
      roundRect(c, px, y, pw, u * 0.5, u * 0.25); c.fillStyle = 'rgba(10,0,8,0.45)'; c.fill();
      if (here > 0) {
        roundRect(c, px, y, pw * (here / total), u * 0.5, u * 0.25);
        const g = c.createLinearGradient(px, 0, px + pw, 0); g.addColorStop(0, '#ff7a5c'); g.addColorStop(1, GOLD);
        c.fillStyle = g; c.fill();
      }
      text(c, `${here} of ${total} in place`, cx, y + u * 1.1, u * 0.7, 'rgba(255,230,220,0.75)', 700);
      // Goal
      y += u * 2.0;
      const hintsH = u * 2.9, ts = Math.max(u * 3, Math.min(S.w * 0.55, S.y + S.h - hintsH - y - u * 1.6));
      drawThumb(c, board, L.game, cx - ts / 2, y, ts);
      if (board.style === 'picture' || state === 'won') text(c, `${board.pic.icon} ${board.pic.name}`, cx, y + ts + u * 0.75, u * 0.65, 'rgba(255,230,220,0.7)', 700);
      const hy = S.y + S.h - u * 1.15;
      const hints = Kit.touchFirst() ? ['Tap a tile or swipe', 'Tap here to pause'] : ['Arrows slide a tile into the gap', 'OK  pause · peek · new shuffle'];
      text(c, hints[0], cx, hy - u * 0.95, u * 0.72, 'rgba(255,255,255,0.8)', 700);
      text(c, hints[1], cx, hy, u * 0.72, 'rgba(255,255,255,0.6)', 700);
    } else {
      const y = S.y + S.h * 0.22;
      outlined(c, 'TILE SLIDE', cx, y, u * 1.4, '#fff3e6', '#ff9a6b');
      const cols = [['MOVES', String(Math.round(shownMoves))], ['TIME', fmtTime(elapsed)], [`BEST ${n}×${n}`, bests[n] ? String(bests[n]) : '—'], ['WINS', String(wins)]];
      cols.forEach(([label, val], i) => {
        const x = S.x + (S.w / 4) * (i + 0.5);
        text(c, label, x, S.y + S.h * 0.5, u * 0.7, 'rgba(255,200,180,0.75)', 800);
        outlined(c, val, x, S.y + S.h * 0.72, u * 1.25, '#fff6c2', '#ffb703');
      });
      text(c, 'Tap a tile or swipe · tap here to pause', cx, S.y + S.h * 0.92, u * 0.6, 'rgba(255,255,255,0.65)', 700);
    }
  }

  function drawWin(c, t) {
    const S = L.side, u = L.u, n = board.n, wide = L.wide;
    const a = clamp((winT - 1.6) / 0.45, 0, 1), k = ease.back(a);
    let R = S;
    if (!wide) R = { x: S.x, y: L.H * 0.5 - S.h * 0.9, w: S.w, h: S.h * 1.8 };
    c.save();
    c.translate(R.x + R.w / 2, R.y + R.h / 2); c.scale(k, k); c.globalAlpha = a;
    const w = R.w, h = R.h, top = -h / 2;
    panel(c, -w / 2, top, w, h, u * 1.1, GOLD, '#6a2448', '#2a0b1f');
    const sc = wide ? 1 : 0.8;
    let y = top + u * 2.1 * sc;
    outlined(c, 'Solved!', 0, y, u * 2.4 * sc, '#fff6c2', '#ffb703');
    y += u * 1.8 * sc;
    text(c, `${board.pic.icon} ${board.pic.name}${board.style === 'numbers' ? ' · bonus picture!' : ''}`, 0, y, u * 0.85 * sc, 'rgba(255,230,220,0.85)', 700);
    y += u * 1.4 * sc;
    const bw = (w - u * 2.4) / 2, bh = u * 3.4 * sc;
    [['MOVES', String(moves)], ['TIME', fmtTime(elapsed)]].forEach(([label, val], i) => {
      const x = -w / 2 + u * 0.8 + i * (bw + u * 0.8);
      roundRect(c, x, y, bw, bh, u * 0.6); c.fillStyle = 'rgba(10,0,8,0.38)'; c.fill();
      text(c, label, x + bw / 2, y + bh * 0.24, u * 0.7 * sc, 'rgba(255,200,180,0.75)', 800);
      outlined(c, val, x + bw / 2, y + bh * 0.63, u * 1.6 * sc, '#ffffff', '#ffc9b0');
    });
    y += bh + u * 1.3 * sc;
    if (newBest && prevBest) {
      const p = 1 + Math.sin(t * 6) * 0.04;
      c.save(); c.translate(0, y); c.scale(p, p);
      text(c, `🎉 New best for ${n}×${n}!`, 0, 0, u * 1.0 * sc, GOLD, 900);
      c.restore();
    } else if (newBest) text(c, `👑 First ${n}×${n} solved!`, 0, y, u * 1.0 * sc, GOLD, 900);
    else text(c, `👑 Best ${n}×${n}: ${bests[n]} moves`, 0, y, u * 0.9 * sc, GOLD, 800);
    y += u * 1.25 * sc;
    text(c, `🏆 Wins: ${wins}`, 0, y, u * 0.9 * sc, 'rgba(255,255,255,0.9)', 800);
    // Stars: fewer moves, more stars.
    const got = starsFor(n, moves), ss = u * 2.3 * sc, btnTop = h / 2 - u * 1.0 - u * 2.4 * sc * 2 - u * 0.6;
    y = (y + u * 0.5 * sc + btnTop) / 2;
    for (let i = 0; i < 3; i++) {
      const p = clamp((winT - 1.9 - i * 0.18) / 0.35, 0, 1);
      const x = (i - 1) * ss * 1.15, s = (i < got ? ease.back(p) : 1) * ss * (i === 1 ? 1.15 : 1);
      c.drawImage(i < got ? starOn : starOff, x - s / 2, y - s / 2 - (i === 1 ? ss * 0.12 : 0), s, s);
    }
    const ready = winT > 1.9;
    c.globalAlpha = a * (ready ? 1 : 0.4);
    const btnW = w - u * 2.4, btnH = u * 2.4 * sc;
    let by = h / 2 - u * 1.0 - btnH * 2 - u * 0.6;
    roundRect(c, -btnW / 2, by, btnW, btnH, btnH / 2);
    const g = c.createLinearGradient(0, by, 0, by + btnH); g.addColorStop(0, '#ffe07a'); g.addColorStop(1, '#ff9a3c');
    c.fillStyle = g; c.fill();
    if (ready) { c.lineWidth = 3 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke(); }
    text(c, Kit.touchFirst() ? 'Play again' : 'OK  play again', 0, by + btnH / 2, u * 1.0 * sc, '#4a1222', 900);
    const b1 = { x: R.x + R.w / 2 - btnW / 2 * k, y: R.y + R.h / 2 + by * k, w: btnW * k, h: btnH * k, i: 0 };
    by += btnH + u * 0.6;
    roundRect(c, -btnW / 2, by, btnW, btnH, btnH / 2); c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Change size / style' : 'Arrows  change size / style', 0, by + btnH / 2, u * 0.8 * sc, 'rgba(255,255,255,0.88)', 800);
    L.hits = [b1, { x: b1.x, y: R.y + R.h / 2 + by * k, w: b1.w, h: b1.h, i: 1 }];
    c.restore();
  }

  function drawPause(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(14,2,10,0.7)'; c.fillRect(0, 0, W, H);
    const k = ease.back(clamp(stateT / 0.3, 0, 1));
    const w = Math.min(W * 0.9, u * 18), rowH = u * 2.5, h = u * 5.2 + PAUSE.length * (rowH + u * 0.5) + u * 1.6;
    c.save(); c.translate(W / 2, H / 2); c.scale(k, k);
    panel(c, -w / 2, -h / 2, w, h, u * 1.1, 'rgba(255,175,140,0.5)');
    outlined(c, 'Paused', 0, -h / 2 + u * 2.1, u * 2, '#ffffff', '#ffb38f');
    L.hits = [];
    PAUSE.forEach((label, i) => {
      const y = -h / 2 + u * 4.2 + i * (rowH + u * 0.5), bw = w - u * 3, on = i === pauseIx;
      roundRect(c, -bw / 2, y, bw, rowH, rowH / 2);
      if (on) {
        const g = c.createLinearGradient(0, y, 0, y + rowH); g.addColorStop(0, '#ffe07a'); g.addColorStop(1, '#ff9a3c');
        c.fillStyle = g; c.fill();
        c.lineWidth = 3 + Math.sin(t * 6) * 1.2; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      } else { c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill(); }
      text(c, label, 0, y + rowH / 2, u * 0.95, on ? '#4a1222' : 'rgba(255,255,255,0.9)', 900);
      L.hits.push({ x: W / 2 - (bw / 2) * k, y: H / 2 + y * k, w: bw * k, h: rowH * k, i });
    });
    text(c, Kit.touchFirst() ? 'Tap a choice' : '▲ ▼ choose  ·  OK select  ·  Back for games', 0, h / 2 - u * 1.1, u * 0.72, 'rgba(255,255,255,0.7)', 700);
    c.restore();
  }

  function chip(c, r, on, focused, t) {
    const k = on && focused ? 1.05 + Math.sin(t * 5) * 0.012 : 1;
    c.save();
    c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
    if (on) panel(c, -r.w / 2, -r.h / 2, r.w, r.h, L.u * 0.8, focused ? GOLD : 'rgba(255,200,170,0.7)', '#ff8a5c', '#b8325a');
    else panel(c, -r.w / 2, -r.h / 2, r.w, r.h, L.u * 0.8, 'rgba(255,175,140,0.25)', '#4a1838', '#2a0c20');
    if (on && focused) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,210,63,0.5)'; c.stroke(); }
    c.restore();
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u, wide = L.wide;
    const colX = wide ? W * 0.06 : W * 0.06, colW = wide ? W * 0.42 : W * 0.88, cx = colX + colW / 2;
    const yy = (f) => (wide ? H * f : H * f * 0.58);
    L.hits = [];
    // Title
    const bob = Math.sin(t * 2) * u * 0.12;
    outlined(c, '🧩 TILE SLIDE', cx, yy(0.14) + bob, u * (wide ? 2.7 : 2.2), '#fff3e6', '#ff8a5c');
    text(c, 'Slide the tiles back into place', cx, yy(0.22), u * 0.95, 'rgba(255,230,220,0.8)', 700);
    // Size row
    const rows = [
      { label: 'Board size', y: yy(0.31), items: SIZES.map((s) => ({ big: `${s}×${s}`, small: bests[s] ? `👑 ${bests[s]} moves` : 'not solved yet' })), sel: sizeIx },
      { label: 'Style', y: yy(0.53), items: STYLES.map((s) => ({ big: `${s.icon} ${s.name}`, small: s.id === 'picture' ? 'a painted picture' : 'classic 1, 2, 3…' })), sel: styleIx },
    ];
    rows.forEach((row, ri) => {
      const focused = menuRow === ri;
      text(c, (focused ? '▸ ' : '') + row.label, colX + u * 0.3, row.y, u * 0.95, focused ? GOLD : 'rgba(255,220,210,0.7)', 800, 'left');
      const n = row.items.length, gap = u * 0.8, cw = (colW - gap * (n - 1)) / n, ch = u * 3.6, y0 = row.y + u * 0.9;
      row.items.forEach((it, i) => {
        const r = { x: colX + i * (cw + gap), y: y0, w: cw, h: ch, row: ri, i };
        L.hits.push(r);
        const on = i === row.sel;
        chip(c, r, on, focused, t);
        text(c, it.big, r.x + cw / 2, r.y + ch * 0.38, u * (ri === 0 ? 1.45 : 1.15), on ? '#ffffff' : 'rgba(255,255,255,0.75)', 900);
        text(c, it.small, r.x + cw / 2, r.y + ch * 0.74, u * 0.68, on ? 'rgba(255,245,235,0.95)' : 'rgba(255,220,210,0.55)', 700);
      });
    });
    // Play button
    const pf = menuRow === 2, pw = colW * 0.62, ph = u * 3, px = cx - pw / 2, py = yy(0.73);
    const k = pf ? 1.04 + Math.sin(t * 5) * 0.02 : 1;
    c.save(); c.translate(cx, py + ph / 2); c.scale(k, k);
    roundRect(c, -pw / 2, -ph / 2 + u * 0.25, pw, ph, ph / 2); c.fillStyle = 'rgba(80,15,20,0.6)'; c.fill();
    roundRect(c, -pw / 2, -ph / 2, pw, ph, ph / 2);
    const g = c.createLinearGradient(0, -ph / 2, 0, ph / 2);
    if (pf) { g.addColorStop(0, '#ffe07a'); g.addColorStop(1, '#ff9a3c'); } else { g.addColorStop(0, '#ff9a7a'); g.addColorStop(1, '#d9466a'); }
    c.fillStyle = g; c.fill();
    if (pf) { c.lineWidth = 4 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.stroke(); }
    text(c, '▶  Play', 0, 0, u * 1.35, pf ? '#4a1222' : '#ffffff', 900);
    c.restore();
    L.hits.push({ x: px, y: py, w: pw, h: ph, row: 2, i: 0 });
    text(c, Kit.touchFirst() ? 'Tap to choose' : '▲ ▼ row  ·  ◀ ▶ change  ·  OK play  ·  Back for games', cx, yy(0.88), u * 0.78, 'rgba(255,255,255,0.75)', 700);
    text(c, `🏆 Wins: ${wins}`, cx, yy(0.94), u * 0.85, GOLD, 800);
    // Live preview
    if (demo) {
      const P = L.prev, G = geom(P.x, P.y, P.B, demo.n);
      const fl = Math.sin(t * 1.3) * u * 0.2;
      c.save(); c.translate(0, fl);
      drawBoard(c, demo, G, t, { glow: true });
      c.restore();
      const cap = demo.style === 'picture' ? `${demo.pic.icon} ${demo.pic.name}` : `${demo.n}×${demo.n} numbers`;
      text(c, cap, P.x + P.B / 2, P.y + P.B + u * 1.5, u * 0.85, 'rgba(255,230,220,0.8)', 700);
    }
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout();
  Kit.canvas.focus();
  if (wins > 0) Kit.record('tileslide', wins);
})();
