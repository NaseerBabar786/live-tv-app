// Chess: the full game (castling, en passant, promotion with a piece picker, check, mate, stalemate)
// on a walnut-and-maple board, against the TV (Easy, Medium, Hard) or two people taking turns.
// Remote: arrows move the cursor, OK picks a piece, OK on a lit square moves it there; Back saves the
// game and leaves. Touch/mouse: tap a piece, then tap where it goes. M mutes.
'use strict';

(() => {
  const { sfx, ease, roundRect, clamp, lerp } = Kit;
  const ID = 'chessroyale';
  const VALUE = [0, 100, 320, 330, 500, 900, 0];
  const LET = ['', '', 'N', 'B', 'R', 'Q', 'K'];
  const FILES = 'abcdefgh';
  const GOLD = '#f2c14e';
  const LEVELS = [
    { name: 'Easy', tip: 'A relaxed TV', icon: 1, depth: 1, minDepth: 1, noise: 60, budget: 400 },
    { name: 'Medium', tip: 'Thinks ahead', icon: 2, depth: 2, minDepth: 2, noise: 6, budget: 800 },
    { name: 'Hard', tip: 'Plays to win', icon: 5, depth: 5, minDepth: 3, noise: 6, budget: 1250 },
  ];
  const now = () => performance.now() / 1000;

  // ================= The rules =================
  // Square = row * 8 + column, row 0 at the top (Black's side). Positive is White:
  // 1 pawn, 2 knight, 3 bishop, 4 rook, 5 queen, 6 king. A move is from | to << 6 | promotion << 12.
  const KNT = [], KGT = [], RAYS = [];
  const DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1], [-1, 0], [1, 0], [0, -1], [0, 1]];
  for (let sq = 0; sq < 64; sq++) {
    const r = sq >> 3, c = sq & 7, inb = (rr, cc) => rr >= 0 && rr < 8 && cc >= 0 && cc < 8;
    KNT[sq] = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]].filter(([a, b]) => inb(r + a, c + b)).map(([a, b]) => (r + a) * 8 + c + b);
    KGT[sq] = DIRS.filter(([a, b]) => inb(r + a, c + b)).map(([a, b]) => (r + a) * 8 + c + b);
    RAYS[sq] = DIRS.map(([a, b]) => { const out = []; let rr = r + a, cc = c + b; while (inb(rr, cc)) { out.push(rr * 8 + cc); rr += a; cc += b; } return out; });
  }
  // Castling rights: 1 white short, 2 white long, 4 black short, 8 black long; moving from or to these squares loses some.
  const CRM = new Array(64).fill(15);
  CRM[63] = 15 & ~1; CRM[56] = 15 & ~2; CRM[7] = 15 & ~4; CRM[0] = 15 & ~8; CRM[60] = 15 & ~3; CRM[4] = 15 & ~12;

  function newPos() {
    const b = new Int8Array(64), back = [4, 2, 3, 5, 6, 3, 2, 4];
    for (let c = 0; c < 8; c++) { b[c] = -back[c]; b[8 + c] = -1; b[48 + c] = 1; b[56 + c] = back[c]; }
    return { b, side: 1, castle: 15, ep: -1, half: 0, ks: [60, 4], st: [] };
  }
  const clonePos = (p) => ({ b: p.b.slice(), side: p.side, castle: p.castle, ep: p.ep, half: p.half, ks: p.ks.slice(), st: [] });

  function attacked(p, sq, by) {
    const b = p.b, r = sq >> 3, c = sq & 7, pr = r + by;
    if (pr >= 0 && pr < 8) {
      if (c > 0 && b[pr * 8 + c - 1] === by) return true;
      if (c < 7 && b[pr * 8 + c + 1] === by) return true;
    }
    const n = 2 * by, k = 6 * by, q = 5 * by, bi = 3 * by, ro = 4 * by;
    for (const t of KNT[sq]) if (b[t] === n) return true;
    for (const t of KGT[sq]) if (b[t] === k) return true;
    const R = RAYS[sq];
    for (let d = 0; d < 8; d++) {
      const ray = R[d], slider = d < 4 ? bi : ro;
      for (let i = 0; i < ray.length; i++) {
        const x = b[ray[i]];
        if (x === 0) continue;
        if (x === q || x === slider) return true;
        break;
      }
    }
    return false;
  }
  const inCheck = (p, who) => attacked(p, p.ks[who > 0 ? 0 : 1], -who);

  // mode 0: every move (promotions to all four); 1: the TV's search (promote to queen or knight); 2: captures and queenings only.
  function gen(p, out, mode) {
    const b = p.b, s = p.side, caps = mode === 2;
    const promos = mode === 0 ? [5, 4, 3, 2] : mode === 1 ? [5, 2] : [5];
    for (let i = 0; i < 64; i++) {
      const x = b[i];
      if (x * s <= 0) continue;
      const kind = x * s, r = i >> 3, c = i & 7;
      if (kind === 1) {
        const f = r - s;
        if (f < 0 || f > 7) continue;
        const promo = f === 0 || f === 7, fwd = f * 8 + c;
        if (b[fwd] === 0) {
          if (promo) { for (const k of promos) out.push(i | fwd << 6 | k << 12); }
          else if (!caps) {
            out.push(i | fwd << 6);
            if (r === (s === 1 ? 6 : 1) && b[fwd - 8 * s] === 0) out.push(i | (fwd - 8 * s) << 6);
          }
        }
        for (let dc = -1; dc <= 1; dc += 2) {
          const cc = c + dc;
          if (cc < 0 || cc > 7) continue;
          const t = f * 8 + cc;
          if (b[t] * s < 0 || t === p.ep) {
            if (promo) { for (const k of promos) out.push(i | t << 6 | k << 12); } else out.push(i | t << 6);
          }
        }
      } else if (kind === 2 || kind === 6) {
        for (const t of (kind === 2 ? KNT : KGT)[i]) {
          const y = b[t];
          if (y * s > 0 || (caps && y === 0)) continue;
          out.push(i | t << 6);
        }
        if (kind === 6 && !caps) {
          const h = s === 1 ? 56 : 0, sb = s === 1 ? 1 : 4;
          if (i === h + 4 && (p.castle & (sb * 3)) && !attacked(p, i, -s)) {
            if ((p.castle & sb) && b[h + 5] === 0 && b[h + 6] === 0 && b[h + 7] === 4 * s && !attacked(p, h + 5, -s)) out.push(i | (h + 6) << 6);
            if ((p.castle & (sb * 2)) && b[h + 3] === 0 && b[h + 2] === 0 && b[h + 1] === 0 && b[h] === 4 * s && !attacked(p, h + 3, -s)) out.push(i | (h + 2) << 6);
          }
        }
      } else {
        const d0 = kind === 4 ? 4 : 0, d1 = kind === 3 ? 4 : 8, R = RAYS[i];
        for (let d = d0; d < d1; d++) {
          const ray = R[d];
          for (let k = 0; k < ray.length; k++) {
            const t = ray[k], y = b[t];
            if (y === 0) { if (!caps) out.push(i | t << 6); continue; }
            if (y * s < 0) out.push(i | t << 6);
            break;
          }
        }
      }
    }
    return out;
  }

  function make(p, m) {
    const b = p.b, from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 7, s = p.side, x = b[from], kind = x * s;
    let capSq = to, cap = b[to];
    // En passant takes the pawn beside, not on, the square moved to.
    if (kind === 1 && to === p.ep) { capSq = (from & 56) | (to & 7); cap = b[capSq]; b[capSq] = 0; }
    p.st.push(cap, capSq, p.castle, p.ep, p.half);
    b[to] = pr ? pr * s : x; b[from] = 0;
    if (kind === 6) {
      p.ks[s > 0 ? 0 : 1] = to;
      if (to - from === 2) { b[to - 1] = b[to + 1]; b[to + 1] = 0; } else if (from - to === 2) { b[to + 1] = b[to - 2]; b[to - 2] = 0; }
    }
    p.castle &= CRM[from] & CRM[to];
    p.ep = kind === 1 && (to - from === 16 || from - to === 16) ? (from + to) >> 1 : -1;
    p.half = kind === 1 || cap ? 0 : p.half + 1;
    p.side = -s;
  }
  function unmake(p, m) {
    const b = p.b, from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 7, s = -p.side, st = p.st;
    p.side = s;
    p.half = st.pop(); p.ep = st.pop(); p.castle = st.pop();
    const capSq = st.pop(), cap = st.pop();
    const x = pr ? s : b[to];
    b[from] = x; b[to] = 0; b[capSq] = cap;
    if (x === 6 * s) {
      p.ks[s > 0 ? 0 : 1] = from;
      if (to - from === 2) { b[to + 1] = b[to - 1]; b[to - 1] = 0; } else if (from - to === 2) { b[to - 2] = b[to + 1]; b[to + 1] = 0; }
    }
  }
  function legal(p, mode = 0) {
    const s = p.side;
    return gen(p, [], mode).filter((m) => { make(p, m); const ok = !inCheck(p, s); unmake(p, m); return ok; });
  }
  function insufficient(p) {
    let n = 0, minor = true;
    for (let i = 0; i < 64; i++) { const k = Math.abs(p.b[i]); if (k && k !== 6) { n++; if (k !== 2 && k !== 3) minor = false; } }
    return n === 0 || (n === 1 && minor);
  }

  // ================= The TV's thinking =================
  function evaluate(p) {
    const b = p.b;
    let v = 0, npm = 0, wb = 0, bb = 0;
    for (let i = 0; i < 64; i++) {
      const x = b[i];
      if (x === 0) continue;
      const kind = x < 0 ? -x : x;
      if (kind === 6) continue;
      if (kind > 1) npm += VALUE[kind];
      if (kind === 3) { if (x > 0) wb++; else bb++; }
      const r = i >> 3, c = i & 7;
      let s = VALUE[kind];
      // Knights, bishops and pawns like the middle; pawns like to advance.
      if (kind <= 3) s += (6 - (Math.abs(2 * r - 7) + Math.abs(2 * c - 7)) / 2) * 4;
      if (kind === 1) s += (x > 0 ? 6 - r : r - 1) * 6;
      v += x > 0 ? s : -s;
    }
    if (wb >= 2) v += 25;
    if (bb >= 2) v -= 25;
    // Kings: tucked away early on, in the middle once the board empties.
    const end = npm < 2600;
    for (let w = 0; w < 2; w++) {
      const k = p.ks[w], r = k >> 3, c = k & 7;
      let s;
      if (end) s = (6 - (Math.abs(2 * r - 7) + Math.abs(2 * c - 7)) / 2) * 6;
      else s = r === (w === 0 ? 7 : 0) ? (c <= 2 || c >= 6 ? 22 : 0) : -25;
      v += w === 0 ? s : -s;
    }
    return v;
  }
  const MATE = 100000, INF = 1e9, ABORT = { abort: true };
  let nodes = 0, deadline = 0;
  function order(p, moves) {
    const b = p.b, sc = new Array(moves.length);
    for (let i = 0; i < moves.length; i++) {
      const m = moves[i], to = (m >> 6) & 63, cap = Math.abs(b[to]), pr = (m >> 12) & 7;
      sc[i] = (cap ? VALUE[cap] * 10 - VALUE[Math.abs(b[m & 63])] + 1000 : 0) + (pr === 5 ? 8000 : 0);
    }
    const idx = moves.map((_, i) => i).sort((a, c) => sc[c] - sc[a]);
    return idx.map((i) => moves[i]);
  }
  function tick() { if ((++nodes & 1023) === 0 && performance.now() > deadline) throw ABORT; }
  function search(p, d, alpha, beta, ply) {
    tick();
    if (d <= 0) return quiet(p, alpha, beta, 4);
    const s = p.side, moves = order(p, gen(p, [], 1));
    let any = false;
    for (const m of moves) {
      make(p, m);
      if (inCheck(p, s)) { unmake(p, m); continue; }
      any = true;
      const v = -search(p, d - 1, -beta, -alpha, ply + 1);
      unmake(p, m);
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    if (!any) return inCheck(p, s) ? -MATE + ply : 0;
    return alpha;
  }
  // Follows captures a few deep so the TV doesn't leave a piece hanging.
  function quiet(p, alpha, beta, left) {
    tick();
    const stand = p.side * evaluate(p);
    if (left === 0 || stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    const s = p.side, moves = order(p, gen(p, [], 2));
    for (const m of moves) {
      make(p, m);
      if (inCheck(p, s)) { unmake(p, m); continue; }
      const v = -quiet(p, -beta, -alpha, left - 1);
      unmake(p, m);
      if (v > alpha) alpha = v;
      if (alpha >= beta) break;
    }
    return alpha;
  }
  // Thinks a deeper and deeper look ahead, a few root moves per small slice of time, so the
  // animation never stalls; stops at the level's depth or time budget and plays the best so far.
  let think = null;
  function startThink() {
    const lv = LEVELS[G.mode], game = G;
    const p = clonePos(G.pos);
    let roots = order(p, legal(p, 1));
    const t0 = performance.now();
    deadline = t0 + lv.budget;
    const job = { cancel: false, t0: now() };
    think = job;
    let depth = 1, idx = 0, best = roots[0], bestThis = null, bestNoisy = -INF;
    const finish = (m) => {
      const wait = Math.max(0, 0.55 - (now() - job.t0)) * 1000;
      setTimeout(() => {
        if (job.cancel || G !== game || state !== 'play') return;
        think = null;
        play(m);
      }, wait);
    };
    if (roots.length === 1) { finish(roots[0]); return; }
    const slice = () => {
      if (job.cancel) return;
      const s0 = performance.now();
      try {
        while (performance.now() - s0 < 12) {
          if (idx >= roots.length) {
            best = bestThis;
            if (depth >= lv.depth || Math.abs(bestNoisy) > MATE / 2 || (depth >= lv.minDepth && performance.now() - t0 > lv.budget * 0.3)) { finish(best); return; }
            depth++; idx = 0; bestThis = null; bestNoisy = -INF;
            roots = [best, ...roots.filter((m) => m !== best)];
            continue;
          }
          const m = roots[idx];
          const noise = Math.floor(Math.random() * lv.noise);
          const a = bestNoisy === -INF ? -INF : bestNoisy - lv.noise - 1;
          make(p, m);
          const v = -search(p, depth - 1, -INF, -a, 1) + noise;
          unmake(p, m);
          if (v > bestNoisy) { bestNoisy = v; bestThis = m; }
          idx++;
        }
      } catch (e) {
        if (e !== ABORT) throw e;
        finish(bestThis || best);
        return;
      }
      setTimeout(slice, 4);
    };
    setTimeout(slice, 30);
  }

  // ================= Records =================
  let wins = Kit.store.get(ID + '.wins', 0);
  let levelWins = Kit.store.get(ID + '.levelWins', [0, 0, 0]);
  let lastMode = clamp(Kit.store.get(ID + '.mode', 0), 0, 3);

  // ================= The game in play =================
  // state: 'menu', 'play', 'promo' (choosing a piece), 'over'
  let state = 'menu', G = null, menuIx = 0, cursor = 52, sel = -1, targets = [], promo = null;
  let anims = [], pops = [], tvPending = false, overT = 0, nopeT = -9, winBump = 0, selT = 0;
  const vsTv = () => G && G.mode < 3;
  const tvTurn = () => vsTv() && G.pos.side === -1;

  function newGame(mode) {
    return { mode, pos: newPos(), moves: [], sans: [], caps: [[], []], reps: {}, last: null, check: false, result: null };
  }
  const posKey = (p) => p.b.join(',') + p.side + ',' + p.castle + ',' + p.ep;
  function sqName(sq) { return FILES[sq & 7] + (8 - (sq >> 3)); }
  function sanOf(p, m, list) {
    const from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 7, x = p.b[from], kind = Math.abs(x);
    if (kind === 6 && Math.abs(to - from) === 2) return (to & 7) === 6 ? 'O-O' : 'O-O-O';
    const cap = p.b[to] !== 0 || (kind === 1 && to === p.ep);
    let s = '';
    if (kind === 1) { if (cap) s += FILES[from & 7]; } else {
      s += LET[kind];
      const others = list.filter((o) => (o & 63) !== from && ((o >> 6) & 63) === to && p.b[o & 63] === x);
      if (others.length) {
        const sameFile = others.some((o) => (o & 7) === (from & 7)), sameRank = others.some((o) => ((o & 63) >> 3) === (from >> 3));
        s += !sameFile ? FILES[from & 7] : !sameRank ? String(8 - (from >> 3)) : sqName(from);
      }
    }
    if (cap) s += 'x';
    s += sqName(to);
    if (pr) s += '=' + LET[pr];
    return s;
  }

  function applyMove(m, live) {
    const p = G.pos, list = legal(p);
    const from = m & 63, to = (m >> 6) & 63, pr = (m >> 12) & 7, s = p.side, mover = p.b[from];
    let capSq = to, cap = p.b[to];
    if (Math.abs(mover) === 1 && to === p.ep) { capSq = (from & 56) | (to & 7); cap = p.b[capSq]; }
    const castle = Math.abs(mover) === 6 && Math.abs(to - from) === 2;
    let txt = sanOf(p, m, list);
    make(p, m); p.st.length = 0;
    if (cap) G.caps[s > 0 ? 0 : 1].push(Math.abs(cap));
    const next = legal(p), chk = inCheck(p, p.side);
    if (chk) txt += next.length ? '+' : '#';
    G.moves.push(m); G.sans.push(txt); G.last = { from, to }; G.check = chk;
    const key = posKey(p);
    G.reps[key] = (G.reps[key] || 0) + 1;
    let res = null;
    if (!next.length) res = chk ? { kind: 'mate', winner: -p.side } : { kind: 'stalemate' };
    else if (insufficient(p)) res = { kind: 'material' };
    else if (G.reps[key] >= 3) res = { kind: 'repetition' };
    else if (p.half >= 100) res = { kind: 'fifty' };
    if (live) {
      const t = now(), dist = Math.hypot((to & 7) - (from & 7), (to >> 3) - (from >> 3));
      const dur = clamp(0.2 + dist * 0.035, 0.22, 0.42);
      const sound = res && res.kind === 'mate' ? 'mate' : chk ? 'check' : pr ? 'promo' : cap ? 'capture' : castle ? 'castle' : 'move';
      anims.push({ from, to, piece: mover, t0: t, dur, sound, promo: pr, landed: false });
      if (castle) {
        const rf = to > from ? to + 1 : to - 2, rt = to > from ? to - 1 : to + 1;
        anims.push({ from: rf, to: rt, piece: 4 * s, t0: t + 0.08, dur, sound: null, landed: false });
      }
      if (cap) pops.push({ sq: capSq, piece: cap, land: t + dur });
    }
    if (res) endGame(res, live); else save();
  }
  function save() { if (G && !G.result) Kit.store.set(ID + '.game', { mode: G.mode, moves: G.moves }); }

  function play(m) {
    sel = -1; targets = [];
    applyMove(m, true);
    if (!G.result && tvTurn()) tvPending = true;
  }

  function endGame(res, live) {
    G.result = res; state = 'over';
    overT = now() + (live ? 1.2 : 0.2);
    Kit.store.set(ID + '.game', null);
    const humanWon = res.kind === 'mate' && (!vsTv() || res.winner === 1);
    if (vsTv() && res.kind === 'mate' && res.winner === 1) {
      wins++; levelWins[G.mode]++; winBump = 1;
      Kit.store.set(ID + '.wins', wins); Kit.store.set(ID + '.levelWins', levelWins);
      Kit.record(ID, wins);
    }
    if (!live) return;
    setTimeout(() => {
      if (humanWon) { sfx.win(); Kit.confetti(140); } else if (res.kind === 'mate') sfx.over(); else sfx.chime();
    }, 700);
  }

  function start(mode) {
    cancelThink();
    G = newGame(mode); lastMode = mode; Kit.store.set(ID + '.mode', mode);
    cursor = 52; sel = -1; targets = []; anims = []; pops = []; promo = null;
    state = 'play'; save(); sfx.pick();
  }
  function resume() {
    const s = Kit.store.get(ID + '.game', null);
    if (!s) return false;
    cancelThink();
    G = newGame(s.mode);
    for (const m of s.moves) {
      if (!legal(G.pos).includes(m)) break;
      applyMove(m, false);
      if (G.result) break;
    }
    if (G.result) return false;
    cursor = 52; sel = -1; targets = []; anims = []; pops = []; promo = null;
    state = 'play'; sfx.pick();
    if (tvTurn()) tvPending = true;
    return true;
  }
  function cancelThink() { if (think) think.cancel = true; think = null; tvPending = false; }
  function toMenu() {
    cancelThink(); state = 'menu'; promo = null; sel = -1; targets = [];
    const saved = Kit.store.get(ID + '.game', null);
    menuIx = saved ? 0 : lastMode + 1;
    if (!saved && !G) G = newGame(lastMode);
  }
  function menuItems() {
    const saved = Kit.store.get(ID + '.game', null);
    const items = [];
    items.push(saved ? { id: 'continue', name: 'Continue', tip: `${saved.mode < 3 ? 'vs TV · ' + LEVELS[saved.mode].name : '2 players'} · move ${Math.floor(saved.moves.length / 2) + 1}` } : null);
    LEVELS.forEach((l, i) => items.push({ id: i, name: l.name, tip: l.tip, icon: l.icon }));
    items.push({ id: 3, name: '2 Players', tip: 'Take turns' });
    return items;
  }
  function pickMenu(i) {
    const it = menuItems()[i];
    if (!it) return;
    if (it.id === 'continue') { if (!resume()) toMenu(); } else start(it.id);
  }

  // ---------- Remote ----------
  const busy = () => anims.some((a) => !a.landed);
  function ok() {
    if (tvTurn() || busy() || think) { nope(); return; }
    if (sel >= 0 && targets.includes(cursor)) {
      const ms = legal(G.pos).filter((m) => (m & 63) === sel && ((m >> 6) & 63) === cursor);
      if (ms.length > 1) { promo = { moves: ms.sort((a, b) => (b >> 12) - (a >> 12)), ix: 0, t: now() }; state = 'promo'; sfx.pick(); return; }
      play(ms[0]);
      return;
    }
    const p = G.pos;
    if (cursor === sel) { sel = -1; targets = []; sfx.move(); return; }
    if (p.b[cursor] * p.side > 0) {
      const ts = legal(p).filter((m) => (m & 63) === cursor).map((m) => (m >> 6) & 63);
      if (ts.length) { sel = cursor; targets = [...new Set(ts)]; selT = now(); sfx.pick(); return; }
    }
    sel = -1; targets = []; nope();
  }
  function nope() { nopeT = now(); sfx.nope(); }
  const MOVES = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') {
      const items = menuItems(), first = items[0] ? 0 : 1;
      if (k === 'left' || k === 'up') { menuIx = Math.max(first, menuIx - 1); sfx.move(); }
      else if (k === 'right' || k === 'down') { menuIx = Math.min(items.length - 1, menuIx + 1); sfx.move(); }
      else if (k === 'ok') pickMenu(menuIx);
      return;
    }
    if (state === 'over') {
      if (now() < overT + 0.5) return;
      if (k === 'ok') start(G.mode);
      else if (MOVES[k]) { sfx.move(); toMenu(); }
      return;
    }
    if (state === 'promo') {
      if (k === 'left') { promo.ix = (promo.ix + 3) % 4; sfx.move(); }
      else if (k === 'right') { promo.ix = (promo.ix + 1) % 4; sfx.move(); }
      else if (k === 'up' || k === 'down') { state = 'play'; promo = null; sfx.move(); }
      else if (k === 'ok') { const m = promo.moves[promo.ix]; state = 'play'; promo = null; play(m); }
      return;
    }
    if (k === 'restart') { toMenu(); return; }
    if (MOVES[k]) {
      const [dr, dc] = MOVES[k];
      const r = clamp((cursor >> 3) + dr, 0, 7), c = clamp((cursor & 7) + dc, 0, 7);
      if (r * 8 + c !== cursor) { cursor = r * 8 + c; sfx.move(); }
      return;
    }
    if (k === 'ok') ok();
  });

  // ---------- Touch and mouse ----------
  const muteBox = () => ({ x: Kit.W - 58, y: 8, w: 48, h: 48 });
  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  Kit.onPointer({
    down(e) {
      if (inside(e, muteBox())) { Kit.toggleMute(); return; }
      if (state === 'menu') {
        const i = (L.cards || []).findIndex((r) => r && inside(e, r));
        if (i >= 0) { if (i === menuIx) pickMenu(i); else { menuIx = i; sfx.move(); } }
        return;
      }
      if (state === 'over') {
        if (now() < overT + 0.5) return;
        if (inside(e, L.menuBtn)) toMenu(); else start(G.mode);
        return;
      }
      if (state === 'promo') {
        const i = (L.promoBoxes || []).findIndex((r) => inside(e, r));
        if (i >= 0) { const m = promo.moves[i]; state = 'play'; promo = null; play(m); } else { state = 'play'; promo = null; }
        return;
      }
      if (inside(e, L.menuLink)) { toMenu(); return; }
      const c = Math.floor((e.x - L.ix) / L.cs), r = Math.floor((e.y - L.iy) / L.cs);
      if (c < 0 || r < 0 || c > 7 || r > 7) return;
      cursor = r * 8 + c;
      ok();
    },
  });

  // ================= Layout and pictures =================
  let L = {};
  function layout(W, H) {
    const wide = W / H > 1.15;
    let bw;
    if (wide) bw = Math.min(H * 0.9, W * 0.52);
    else bw = Math.min(W * 0.96, H * 0.58);
    const bx = (W - bw) / 2, by = wide ? (H - bw) / 2 : (H - bw) / 2 + H * 0.02;
    const fr = bw * 0.045, cs = (bw - 2 * fr) / 8;
    L = { wide, bw, bx, by, fr, cs, ix: bx + fr, iy: by + fr, u: wide ? cs : Math.min(cs, H * 0.07) };
    if (wide) {
      const pw = bx - W * 0.05;
      L.left = { x: W * 0.025, y: by, w: pw, h: bw };
      // Starts below the speaker icon in the top right corner.
      const ry = Math.max(by, 64);
      L.right = { x: bx + bw + W * 0.025, y: ry, w: pw, h: by + bw - ry };
    } else {
      const ch = Math.min((H - bw) / 2 - 20, cs * 1.5);
      L.top = { x: bx, y: by - ch - 10, w: bw, h: ch };
      L.bottom = { x: bx, y: by + bw + 10, w: bw, h: ch };
    }
    boardPic = null;
    pieceCache.clear(); glowCache.clear();
  }
  Kit.onResize(layout);
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);

  // The board: maple and walnut squares with wood grain, in a walnut frame with a gold inlay. Drawn once.
  let boardPic = null;
  function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function buildBoard() {
    const { bw, fr, cs } = L, dpr = DPR();
    const pic = document.createElement('canvas');
    pic.width = pic.height = Math.ceil(bw * dpr);
    const c = pic.getContext('2d');
    c.scale(dpr, dpr);
    const rand = rng(7);
    // Frame
    roundRect(c, 0, 0, bw, bw, fr * 0.7);
    let g = c.createLinearGradient(0, 0, bw, bw);
    g.addColorStop(0, '#6b4127'); g.addColorStop(0.5, '#4a2b18'); g.addColorStop(1, '#2c180c');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    c.lineWidth = 1;
    for (let i = 0; i < 90; i++) {
      const y = rand() * bw;
      c.strokeStyle = `rgba(${rand() < 0.5 ? '20,8,2' : '140,90,50'},${0.12 + rand() * 0.15})`;
      c.beginPath(); c.moveTo(0, y);
      c.bezierCurveTo(bw * 0.3, y + (rand() - 0.5) * 14, bw * 0.7, y + (rand() - 0.5) * 14, bw, y + (rand() - 0.5) * 8);
      c.stroke();
    }
    c.restore();
    // Bevel on the frame
    roundRect(c, 1.5, 1.5, bw - 3, bw - 3, fr * 0.7);
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,220,170,0.25)'; c.stroke();
    // Gold inlay
    roundRect(c, fr * 0.42, fr * 0.42, bw - fr * 0.84, bw - fr * 0.84, fr * 0.25);
    c.lineWidth = Math.max(1.5, fr * 0.07); c.strokeStyle = 'rgba(242,193,78,0.85)'; c.stroke();
    // Squares
    for (let r = 0; r < 8; r++) for (let col = 0; col < 8; col++) {
      const x = fr + col * cs, y = fr + r * cs, light = (r + col) % 2 === 0;
      const base = light ? ['#f1dcb4', '#e3c38f'] : ['#a2683f', '#7e4c2a'];
      const sg = c.createLinearGradient(x, y, x + cs, y + cs);
      sg.addColorStop(0, base[0]); sg.addColorStop(1, base[1]);
      c.fillStyle = sg; c.fillRect(x, y, cs + 0.5, cs + 0.5);
      c.save();
      c.beginPath(); c.rect(x, y, cs, cs); c.clip();
      const across = (r + col) % 2 === 0;
      for (let i = 0; i < 9; i++) {
        const o = rand() * cs, w = 0.6 + rand() * 1.6;
        c.lineWidth = w;
        c.strokeStyle = light ? `rgba(150,100,50,${0.08 + rand() * 0.12})` : `rgba(40,18,6,${0.12 + rand() * 0.18})`;
        c.beginPath();
        if (across) {
          c.moveTo(x, y + o);
          c.bezierCurveTo(x + cs * 0.33, y + o + (rand() - 0.5) * cs * 0.18, x + cs * 0.66, y + o + (rand() - 0.5) * cs * 0.18, x + cs, y + o + (rand() - 0.5) * cs * 0.1);
        } else {
          c.moveTo(x + o, y);
          c.bezierCurveTo(x + o + (rand() - 0.5) * cs * 0.18, y + cs * 0.33, x + o + (rand() - 0.5) * cs * 0.18, y + cs * 0.66, x + o + (rand() - 0.5) * cs * 0.1, y + cs);
        }
        c.stroke();
      }
      c.restore();
    }
    // Inner shadow round the squares, and lacquer gloss
    c.lineWidth = 3; c.strokeStyle = 'rgba(20,8,2,0.6)'; c.strokeRect(fr - 1.5, fr - 1.5, cs * 8 + 3, cs * 8 + 3);
    g = c.createLinearGradient(fr, fr, fr + cs * 8, fr + cs * 8);
    g.addColorStop(0, 'rgba(255,255,255,0.16)'); g.addColorStop(0.35, 'rgba(255,255,255,0.03)'); g.addColorStop(0.6, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
    c.fillStyle = g; c.fillRect(fr, fr, cs * 8, cs * 8);
    // Letters and numbers on the frame
    c.font = `800 ${Math.round(fr * 0.5)}px system-ui, sans-serif`;
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = 'rgba(250,215,150,0.95)';
    for (let i = 0; i < 8; i++) {
      c.fillText(FILES[i], fr + (i + 0.5) * cs, bw - fr * 0.5 + 1);
      c.fillText(String(8 - i), fr * 0.5, fr + (i + 0.5) * cs);
    }
    return pic;
  }

  // ---------- Pieces: vector silhouettes with a turned-wood shine, drawn once per size ----------
  const circ = (x, y, r) => (c) => { c.arc(x, y, r, 0, Math.PI * 2); };
  const rr = (x, y, w, h, r) => (c) => roundRect(c, x, y, w, h, r);
  const body = (tw, top, bw) => (c) => {
    c.moveTo(0.5 - tw, top);
    c.quadraticCurveTo(0.5 - tw + 0.005, (top + 0.75) / 2 + 0.06, 0.5 - bw, 0.755);
    c.lineTo(0.5 + bw, 0.755);
    c.quadraticCurveTo(0.5 + tw - 0.005, (top + 0.75) / 2 + 0.06, 0.5 + tw, top);
    c.closePath();
  };
  const poly = (pts) => (c) => { c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); };
  const BASE = [rr(0.25, 0.72, 0.5, 0.09, 0.03), rr(0.19, 0.79, 0.62, 0.11, 0.045)];
  const SHAPES = {
    1: [body(0.075, 0.44, 0.17), rr(0.355, 0.41, 0.29, 0.06, 0.03), circ(0.5, 0.29, 0.125), ...BASE],
    2: [(c) => {
      c.moveTo(0.29, 0.755);
      c.bezierCurveTo(0.27, 0.62, 0.4, 0.56, 0.43, 0.48);
      c.lineTo(0.31, 0.53);
      c.quadraticCurveTo(0.2, 0.55, 0.17, 0.46);
      c.lineTo(0.19, 0.41);
      c.quadraticCurveTo(0.28, 0.25, 0.4, 0.19);
      c.lineTo(0.43, 0.08);
      c.lineTo(0.52, 0.16);
      c.quadraticCurveTo(0.78, 0.22, 0.75, 0.52);
      c.lineTo(0.72, 0.755);
      c.closePath();
    }, ...BASE],
    3: [body(0.075, 0.5, 0.18), rr(0.35, 0.46, 0.3, 0.06, 0.03), (c) => {
      c.moveTo(0.5, 0.13);
      c.bezierCurveTo(0.7, 0.26, 0.67, 0.42, 0.6, 0.465);
      c.lineTo(0.4, 0.465);
      c.bezierCurveTo(0.33, 0.42, 0.3, 0.26, 0.5, 0.13);
      c.closePath();
    }, circ(0.5, 0.11, 0.05), ...BASE],
    4: [poly([0.35, 0.4, 0.31, 0.755, 0.69, 0.755, 0.65, 0.4]), rr(0.29, 0.35, 0.42, 0.07, 0.02),
      poly([0.27, 0.37, 0.27, 0.13, 0.365, 0.13, 0.365, 0.2, 0.45, 0.2, 0.45, 0.13, 0.55, 0.13, 0.55, 0.2, 0.635, 0.2, 0.635, 0.13, 0.73, 0.13, 0.73, 0.37]), ...BASE],
    5: [body(0.11, 0.5, 0.2), rr(0.31, 0.44, 0.38, 0.065, 0.03),
      poly([0.31, 0.45, 0.19, 0.18, 0.34, 0.32, 0.36, 0.12, 0.45, 0.3, 0.5, 0.08, 0.55, 0.3, 0.64, 0.12, 0.66, 0.32, 0.81, 0.18, 0.69, 0.45]),
      circ(0.19, 0.17, 0.042), circ(0.36, 0.11, 0.042), circ(0.5, 0.07, 0.045), circ(0.64, 0.11, 0.042), circ(0.81, 0.17, 0.042), ...BASE],
    6: [body(0.11, 0.5, 0.2), rr(0.31, 0.44, 0.38, 0.065, 0.03), (c) => {
      c.moveTo(0.31, 0.45);
      c.bezierCurveTo(0.16, 0.3, 0.36, 0.17, 0.5, 0.28);
      c.bezierCurveTo(0.64, 0.17, 0.84, 0.3, 0.69, 0.45);
      c.closePath();
    }, rr(0.46, 0.04, 0.08, 0.22, 0.015), rr(0.39, 0.09, 0.22, 0.07, 0.015), ...BASE],
  };
  const pieceCache = new Map();
  function pieceSprite(kind, white, size) {
    const key = kind * 2 + (white ? 1 : 0) + ':' + Math.round(size);
    let s = pieceCache.get(key);
    if (s) return s;
    const px = Math.max(8, Math.ceil(size * DPR()));
    s = document.createElement('canvas');
    s.width = s.height = px;
    const c = s.getContext('2d');
    c.scale(px, px);
    c.lineJoin = 'round'; c.lineCap = 'round';
    const shapes = SHAPES[kind];
    const ink = white ? '#3e2a17' : '#04060b';
    c.strokeStyle = ink; c.lineWidth = 0.055;
    for (const f of shapes) { c.beginPath(); f(c); c.stroke(); }
    const g = c.createLinearGradient(0.2, 0, 0.8, 0);
    if (white) { g.addColorStop(0, '#fffaf0'); g.addColorStop(0.42, '#f3e6c9'); g.addColorStop(0.82, '#c6ab82'); g.addColorStop(1, '#9c8159'); }
    else { g.addColorStop(0, '#7a88a8'); g.addColorStop(0.32, '#3b4560'); g.addColorStop(0.72, '#1a1f2e'); g.addColorStop(1, '#090b12'); }
    c.fillStyle = g;
    for (const f of shapes) { c.beginPath(); f(c); c.fill(); }
    // Edge lines between the parts (collars, crown, base rings), then light from above and a shine.
    c.globalCompositeOperation = 'source-atop';
    c.lineWidth = 0.022; c.strokeStyle = white ? 'rgba(120,85,45,0.55)' : 'rgba(150,175,225,0.45)';
    for (const f of shapes) { c.beginPath(); f(c); c.stroke(); }
    const v = c.createLinearGradient(0, 0.05, 0, 0.92);
    v.addColorStop(0, 'rgba(255,255,255,0.32)'); v.addColorStop(0.45, 'rgba(255,255,255,0)'); v.addColorStop(1, 'rgba(0,0,0,0.28)');
    c.fillStyle = v; c.fillRect(0, 0, 1, 1);
    c.fillStyle = white ? 'rgba(255,255,255,0.55)' : 'rgba(200,220,255,0.35)';
    c.beginPath(); c.ellipse(0.38, 0.45, 0.022, 0.32, 0.05, 0, Math.PI * 2); c.fill();
    c.fillStyle = ink;
    if (kind === 2) {
      c.beginPath(); c.arc(0.4, 0.29, 0.03, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.arc(0.22, 0.45, 0.018, 0, Math.PI * 2); c.fill();
      c.lineWidth = 0.025; c.strokeStyle = white ? 'rgba(90,60,30,0.6)' : 'rgba(150,175,225,0.5)';
      c.beginPath(); c.moveTo(0.53, 0.2); c.quadraticCurveTo(0.7, 0.3, 0.66, 0.6); c.stroke();
    }
    if (kind === 3) { c.lineWidth = 0.035; c.strokeStyle = ink; c.beginPath(); c.moveTo(0.57, 0.22); c.lineTo(0.47, 0.34); c.stroke(); }
    c.globalCompositeOperation = 'source-over';
    pieceCache.set(key, s);
    return s;
  }
  // Soft glows and shadows, drawn once per size.
  const glowCache = new Map();
  function glow(name, size, draw) {
    const key = name + Math.round(size);
    let s = glowCache.get(key);
    if (s) return s;
    const px = Math.max(4, Math.ceil(size * DPR()));
    s = document.createElement('canvas'); s.width = s.height = px;
    const c = s.getContext('2d'); c.scale(px, px);
    draw(c);
    glowCache.set(key, s);
    return s;
  }
  const radial = (stops) => (c) => {
    const g = c.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5);
    stops.forEach(([o, col]) => g.addColorStop(o, col));
    c.fillStyle = g; c.fillRect(0, 0, 1, 1);
  };
  const shadowPic = (size) => glow('shadow', size, radial([[0, 'rgba(0,0,0,0.55)'], [0.6, 'rgba(0,0,0,0.2)'], [1, 'rgba(0,0,0,0)']]));
  const checkPic = (size) => glow('check', size, radial([[0, 'rgba(255,60,60,0.95)'], [0.45, 'rgba(255,40,40,0.55)'], [1, 'rgba(255,0,0,0)']]));
  const goldPic = (size) => glow('gold', size, radial([[0, 'rgba(255,215,110,0.85)'], [0.5, 'rgba(255,190,60,0.35)'], [1, 'rgba(255,170,0,0)']]));

  function drawPiece(c, piece, x, y, size, lift = 0, scale = 1, alpha = 1) {
    // x, y: the square's top-left. lift raises the piece above its shadow.
    const sh = shadowPic(size);
    c.globalAlpha = alpha * (1 - lift * 0.4);
    const sw = size * (0.72 + lift * 0.3);
    c.drawImage(sh, x + (size - sw) / 2, y + size * 0.8 - sw * 0.16, sw, sw * 0.32);
    c.globalAlpha = alpha;
    const spr = pieceSprite(Math.abs(piece), piece > 0, size);
    const d = size * scale;
    c.drawImage(spr, x + (size - d) / 2, y + (size - d) - lift * size * 0.22, d, d);
    c.globalAlpha = 1;
  }

  // ================= Text and panels =================
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  function text(c, s, x, y, size, color, weight = 700, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color;
    c.fillText(s, x, y);
  }
  function outlined(c, s, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.15; c.strokeStyle = 'rgba(4,10,24,0.92)';
    c.strokeText(s, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(s, x, y);
  }
  function panel(c, x, y, w, h, r, border, a = 1) {
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, `rgba(30,52,94,${0.92 * a})`); g.addColorStop(1, `rgba(10,20,44,${0.92 * a})`);
    c.fillStyle = g; c.fill();
    c.lineWidth = 2.5; c.strokeStyle = border; c.stroke();
  }

  // ================= Frame loop =================
  function update(dt) {
    const t = now();
    for (const a of anims) {
      if (a.landed || t < a.t0 + a.dur) continue;
      a.landed = true;
      const x = L.ix + ((a.to & 7) + 0.5) * L.cs, y = L.iy + ((a.to >> 3) + 0.5) * L.cs;
      const s = a.sound;
      if (s) {
        Kit.noise({ dur: 0.06, vol: 0.28, freq: 1100, q: 1.4 });
        Kit.tone(190, { type: 'triangle', dur: 0.09, vol: 0.25, slide: 0.6 });
      }
      if (s === 'capture' || s === 'mate' || (s === 'check' && pops.some((p) => p.land <= t + 0.01))) {
        Kit.tone(720, { type: 'square', dur: 0.08, vol: 0.06, slide: 0.5 });
        Kit.noise({ dur: 0.18, vol: 0.14, freq: 3200, q: 0.6, sweep: 0.4 });
        Kit.shake(5, 0.2);
      }
      if (s === 'castle') Kit.noise({ dur: 0.06, vol: 0.22, freq: 900, q: 1.4, at: 0.09 });
      if (s === 'promo') { sfx.chime(); Kit.burst(x, y, GOLD, 22, 0.9); Kit.float('Promoted!', x, y - L.cs * 0.5, { color: GOLD, size: L.cs * 0.42 }); }
      if (s === 'check') {
        Kit.tone(988, { type: 'square', dur: 0.09, vol: 0.07, at: 0.05 }); Kit.tone(1318, { type: 'square', dur: 0.14, vol: 0.07, at: 0.14 });
        const k = G.pos.ks[G.pos.side > 0 ? 0 : 1];
        Kit.float('Check!', L.ix + ((k & 7) + 0.5) * L.cs, L.iy + (k >> 3) * L.cs, { color: '#ff6b6b', size: L.cs * 0.48 });
      }
      if (s === 'mate') { Kit.shake(12, 0.4); Kit.tone(110, { type: 'sawtooth', dur: 0.35, vol: 0.12, slide: 0.5 }); }
    }
    for (const p of pops) {
      if (!p.burst && t >= p.land) {
        p.burst = true;
        const x = L.ix + ((p.sq & 7) + 0.5) * L.cs, y = L.iy + ((p.sq >> 3) + 0.5) * L.cs;
        Kit.burst(x, y, p.piece > 0 ? '#f3e6c9' : '#3b4560', 16, 0.8);
        Kit.burst(x, y, GOLD, 8, 0.6);
      }
    }
    anims = anims.filter((a) => !a.landed || t < a.t0 + a.dur + 0.05);
    pops = pops.filter((p) => t < p.land + 0.4);
    if (tvPending && state === 'play' && !busy()) { tvPending = false; startThink(); }
    winBump = Math.max(0, winBump - dt * 1.5);
  }

  function sqXY(sq) { return [L.ix + (sq & 7) * L.cs, L.iy + (sq >> 3) * L.cs]; }

  function drawBoard(c, t) {
    const { bx, by, bw, cs } = L;
    if (!boardPic) boardPic = buildBoard();
    // Soft shadow under the board
    c.fillStyle = 'rgba(0,0,0,0.28)'; roundRect(c, bx - 4, by + 10, bw + 8, bw + 6, L.fr); c.fill();
    c.fillStyle = 'rgba(0,0,0,0.22)'; roundRect(c, bx - 10, by + 18, bw + 20, bw + 8, L.fr * 1.4); c.fill();
    c.drawImage(boardPic, bx, by, bw, bw);
    if (!G) return;
    const T = now(), p = G.pos;
    // Last move
    if (G.last) {
      for (const sq of [G.last.from, G.last.to]) {
        const [x, y] = sqXY(sq);
        c.fillStyle = 'rgba(255,206,70,0.38)'; c.fillRect(x, y, cs, cs);
      }
    }
    // Selected square
    if (sel >= 0 && state !== 'over') {
      const [x, y] = sqXY(sel);
      c.fillStyle = 'rgba(80,220,200,0.45)'; c.fillRect(x, y, cs, cs);
    }
    // Check: the king glows red
    if (G.check && !busy()) {
      const k = p.ks[p.side > 0 ? 0 : 1], [x, y] = sqXY(k);
      const pulse = 0.7 + 0.3 * Math.sin(t * 6);
      c.globalAlpha = pulse;
      const g = checkPic(cs * 1.4);
      c.drawImage(g, x - cs * 0.2, y - cs * 0.2, cs * 1.4, cs * 1.4);
      c.globalAlpha = 1;
    }
    // Pieces, top row first
    const moving = new Set(anims.filter((a) => !a.landed).map((a) => a.to));
    for (let sq = 0; sq < 64; sq++) {
      const x = p.b[sq];
      if (!x || moving.has(sq)) continue;
      if (pops.some((q) => q.sq === sq && T < q.land)) continue;
      const [px, py] = sqXY(sq);
      let lift = 0;
      if (sq === sel && state !== 'over') lift = 0.35 + 0.25 * Math.sin((T - selT) * 6);
      let shakeX = 0;
      if (sq === cursor && T - nopeT < 0.3) shakeX = Math.sin((T - nopeT) * 60) * cs * 0.06;
      drawPiece(c, x, px + shakeX, py, cs, lift);
    }
    // Captured pieces: wait, then pop
    for (const q of pops) {
      const [px, py] = sqXY(q.sq);
      if (T < q.land) { drawPiece(c, q.piece, px, py, cs); continue; }
      const k = clamp((T - q.land) / 0.35, 0, 1);
      drawPiece(c, q.piece, px, py, cs, 0, 1 + ease.out(k) * 0.5, 1 - k);
    }
    // Legal targets: dots on empty squares, rings round captures
    if (sel >= 0 && (state === 'play' || state === 'promo')) {
      for (const sq of targets) {
        const [x, y] = sqXY(sq), cx = x + cs / 2, cy = y + cs / 2;
        const capture = p.b[sq] !== 0 || (Math.abs(p.b[sel]) === 1 && (sq & 7) !== (sel & 7));
        const hot = sq === cursor;
        if (capture) {
          c.lineWidth = cs * 0.08; c.strokeStyle = hot ? 'rgba(255,214,90,0.95)' : 'rgba(20,60,80,0.55)';
          c.beginPath(); c.arc(cx, cy, cs * 0.44, 0, Math.PI * 2); c.stroke();
        } else {
          c.fillStyle = hot ? 'rgba(255,214,90,0.95)' : 'rgba(20,50,70,0.42)';
          c.beginPath(); c.arc(cx, cy, cs * (hot ? 0.2 : 0.15), 0, Math.PI * 2); c.fill();
        }
      }
    }
    // Pieces in flight glide with a little hop
    for (const a of anims) {
      if (a.landed) continue;
      const k = clamp((T - a.t0) / a.dur, 0, 1), e = ease.inOut(k);
      const [fx, fy] = sqXY(a.from), [tx, ty] = sqXY(a.to);
      const hop = Math.sin(k * Math.PI);
      drawPiece(c, a.piece, lerp(fx, tx, e), lerp(fy, ty, e), cs, hop * 0.9, 1 + hop * 0.08);
    }
    // The remote's cursor
    if (!Kit.touchFirst() && (state === 'play' || state === 'promo')) {
      const [x, y] = sqXY(cursor);
      const yours = !tvTurn();
      const pulse = 0.5 + 0.5 * Math.sin(t * 6);
      c.lineWidth = cs * (0.06 + pulse * 0.02);
      c.strokeStyle = yours ? `rgba(255,214,90,${0.75 + pulse * 0.25})` : 'rgba(255,255,255,0.35)';
      roundRect(c, x + cs * 0.05, y + cs * 0.05, cs * 0.9, cs * 0.9, cs * 0.14); c.stroke();
      if (yours) {
        c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,0.7)';
        roundRect(c, x + cs * 0.12, y + cs * 0.12, cs * 0.76, cs * 0.76, cs * 0.1); c.stroke();
      }
    }
  }

  function material(list) { return list.reduce((a, k) => a + [0, 1, 3, 3, 5, 9, 0][k], 0); }
  function playerCard(c, x, y, w, h, white, t) {
    const u = L.u;
    const active = state !== 'menu' && state !== 'over' && G && G.pos.side === (white ? 1 : -1);
    const name = vsTv() ? (white ? 'You' : `TV · ${LEVELS[G.mode].name}`) : white ? 'White' : 'Black';
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    panel(c, x, y, w, h, u * 0.3, active ? `rgba(242,193,78,${0.6 + pulse * 0.4})` : 'rgba(140,170,230,0.25)');
    if (active) {
      c.lineWidth = 5; c.strokeStyle = `rgba(242,193,78,${0.15 + pulse * 0.15})`;
      roundRect(c, x - 4, y - 4, w + 8, h + 8, u * 0.36); c.stroke();
    }
    const av = Math.min(h * 0.62, u * 1.05);
    const ax = x + u * 0.22, ay = y + h * 0.1;
    c.fillStyle = white ? 'rgba(255,240,210,0.12)' : 'rgba(10,14,26,0.6)';
    c.beginPath(); c.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2); c.fill();
    c.lineWidth = 2; c.strokeStyle = active ? GOLD : 'rgba(255,255,255,0.2)'; c.stroke();
    c.drawImage(pieceSprite(6, white, av * 0.86), ax + av * 0.07, ay + av * 0.05, av * 0.86, av * 0.86);
    const tx = ax + av + u * 0.2;
    let ns = u * 0.34;
    c.font = `800 ${Math.round(ns)}px ${FONT}`;
    const room = x + w - tx - u * 0.15, nw = c.measureText(name).width;
    if (nw > room) ns *= room / nw;
    text(c, name, tx, ay + av * 0.3, ns, '#ffffff', 800, 'left');
    let sub = '';
    if (active && vsTv() && !white) sub = 'thinking' + '.'.repeat(1 + Math.floor(t * 3) % 3);
    else if (active) sub = white && vsTv() ? 'your move' : 'to move';
    if (sub) text(c, sub, tx, ay + av * 0.74, u * 0.26, active ? GOLD : 'rgba(255,255,255,0.6)', 700, 'left');
    // Pieces this side has taken, small, with the material lead
    const caps = G ? G.caps[white ? 0 : 1].slice().sort((a, b) => VALUE[b] - VALUE[a]) : [];
    const cy = ay + av + (h - (ay - y) - av) / 2 - u * 0.04;
    const ps = Math.min(u * 0.48, (h - av) * 0.95);
    let px = x + u * 0.2;
    const step = Math.min(ps * 0.5, (w - u * 1.4) / Math.max(1, caps.length));
    for (let i = 0; i < caps.length; i++) {
      if (i > 0 && caps[i] !== caps[i - 1]) px += ps * 0.22;
      c.drawImage(pieceSprite(caps[i], !white, ps), px, cy - ps / 2, ps, ps);
      px += step;
    }
    if (G) {
      const lead = material(G.caps[white ? 0 : 1]) - material(G.caps[white ? 1 : 0]);
      if (lead > 0) text(c, `+${lead}`, Math.min(px + ps * 0.7, x + w - u * 0.2), cy, u * 0.3, '#9ff0d0', 800, px + ps * 0.7 > x + w - u * 0.2 ? 'right' : 'left');
    }
  }

  function drawSide(c, t) {
    const u = L.u;
    if (L.wide) {
      const { left, right } = L;
      const ch = Math.min(left.h * 0.3, u * 2.1);
      playerCard(c, left.x, left.y, left.w, ch, false, t);
      playerCard(c, left.x, left.y + left.h - ch, left.w, ch, true, t);
      // Status in the middle
      const my = left.y + left.h / 2;
      if (G && state !== 'over') {
        let main, col = '#ffffff';
        if (G.check) { main = 'Check!'; col = '#ff6b6b'; } else if (tvTurn()) main = 'TV is thinking'; else if (vsTv()) main = 'Your move'; else main = G.pos.side > 0 ? 'White to move' : 'Black to move';
        if (G.check) outlined(c, main, left.x + left.w / 2, my - u * 0.25, u * 0.6, '#ffd0d0', '#ff4d4d');
        else text(c, main, left.x + left.w / 2, my - u * 0.25, u * 0.42, col, 900);
        text(c, `Move ${Math.floor(G.moves.length / 2) + 1}`, left.x + left.w / 2, my + u * 0.3, u * 0.28, 'rgba(255,255,255,0.55)', 700);
      }
      // Move list on the right
      panel(c, right.x, right.y, right.w, right.h, u * 0.3, 'rgba(140,170,230,0.25)', 0.75);
      text(c, 'Moves', right.x + u * 0.3, right.y + u * 0.42, u * 0.34, GOLD, 900, 'left');
      const hintsH = u * 1.5;
      const rowH = u * 0.42, top = right.y + u * 0.85, maxRows = Math.max(1, Math.floor((right.h - u * 0.95 - hintsH) / rowH));
      const sans = G ? G.sans : [];
      const rows = Math.ceil(sans.length / 2), first = Math.max(0, rows - maxRows);
      const cw = (right.w - u * 0.5) / 2.4;
      for (let r = first; r < rows; r++) {
        const y = top + (r - first + 0.5) * rowH;
        if (r % 2 === 0) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(right.x + u * 0.12, y - rowH / 2, right.w - u * 0.24, rowH); }
        text(c, `${r + 1}.`, right.x + u * 0.62, y, u * 0.27, 'rgba(255,255,255,0.45)', 700, 'right');
        for (let k = 0; k < 2; k++) {
          const i = r * 2 + k;
          if (i >= sans.length) break;
          const x = right.x + u * 0.78 + k * cw;
          const latest = i === sans.length - 1;
          if (latest) { c.fillStyle = 'rgba(242,193,78,0.22)'; roundRect(c, x - u * 0.1, y - rowH * 0.42, cw - u * 0.1, rowH * 0.84, rowH * 0.3); c.fill(); }
          text(c, sans[i], x, y, u * 0.29, latest ? '#ffe7a8' : '#e8eefc', latest ? 800 : 600, 'left');
        }
      }
      if (!sans.length) text(c, vsTv() ? 'You play White' : 'White moves first', right.x + right.w / 2, top + rowH * 1.2, u * 0.27, 'rgba(255,255,255,0.45)', 600);
      const hy = right.y + right.h - hintsH;
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(right.x + u * 0.2, hy, right.w - u * 0.4, 1.5);
      const tips = Kit.touchFirst() ? ['Tap a piece,', 'then tap where it goes', 'Tap here for the menu'] : ['Arrows  move the cursor', 'OK  pick up / put down', 'Back  save and leave'];
      tips.forEach((s, i) => text(c, s, right.x + right.w / 2, hy + u * 0.3 + i * u * 0.4, u * 0.25, 'rgba(255,255,255,0.6)', 600));
      L.menuLink = Kit.touchFirst() ? { x: right.x, y: hy, w: right.w, h: hintsH } : null;
    } else {
      playerCard(c, L.top.x, L.top.y, L.top.w, L.top.h, false, t);
      playerCard(c, L.bottom.x, L.bottom.y, L.bottom.w, L.bottom.h, true, t);
      L.menuLink = null;
    }
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(4,10,24,0.8)'; c.fillRect(0, 0, W, H);
    const items = menuItems(), n = items.length;
    const wide = L.wide;
    const titleY = H * (wide ? 0.17 : 0.12), ts = Math.min(W * 0.1, H * 0.13);
    const kw = ts * 1.3;
    const bob = Math.sin(t * 2) * ts * 0.04;
    c.font = `900 ${Math.round(ts)}px ${FONT}`;
    const tw = c.measureText('CHESS').width;
    c.drawImage(goldPic(kw * 1.6), W / 2 - tw / 2 - kw * 1.25, titleY - kw * 0.8, kw * 1.6, kw * 1.6);
    c.drawImage(goldPic(kw * 1.6), W / 2 + tw / 2 - kw * 0.35, titleY - kw * 0.8, kw * 1.6, kw * 1.6);
    c.drawImage(pieceSprite(6, true, kw), W / 2 - tw / 2 - kw * 1.05, titleY - kw * 0.6 + bob, kw, kw);
    c.drawImage(pieceSprite(5, false, kw), W / 2 + tw / 2 + kw * 0.05, titleY - kw * 0.6 - bob, kw, kw);
    outlined(c, 'CHESS', W / 2, titleY, ts, '#fff3cf', '#e0a630');
    c.save(); c.translate(W / 2, titleY + ts * 0.78); const wb = 1 + winBump * 0.3; c.scale(wb, wb);
    text(c, `🏆  Wins vs TV: ${wins}`, 0, 0, ts * 0.3, GOLD, 800);
    c.restore();
    let cw, ch, gap, xs, ys;
    const shown = items.map((it, i) => (it ? i : -1)).filter((i) => i >= 0);
    if (wide) {
      gap = W * 0.018; cw = Math.min(W * 0.17, (W * 0.92 - gap * (shown.length - 1)) / shown.length); ch = Math.min(cw * 1.25, H * 0.42);
      const total = shown.length * cw + (shown.length - 1) * gap;
      xs = (k) => (W - total) / 2 + k * (cw + gap); ys = () => H * 0.55 - ch / 2;
    } else {
      gap = H * 0.015; cw = Math.min(W * 0.86, 520); ch = Math.min(H * 0.11, cw * 0.3);
      const total = shown.length * ch + (shown.length - 1) * gap;
      xs = () => (W - cw) / 2; ys = (k) => H * 0.58 - total / 2 + k * (ch + gap);
    }
    L.cards = new Array(n).fill(null);
    shown.forEach((i, k) => {
      const it = items[i], r = { x: xs(k), y: ys(k), w: cw, h: ch };
      L.cards[i] = r;
      const on = i === menuIx;
      const s = on ? 1.06 + Math.sin(t * 5) * 0.012 : 1;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(s, s);
      const accent = it.id === 'continue' ? '#4fd1c5' : it.id === 3 ? '#b8c7ff' : ['#7ee08a', '#ffb547', '#ff6b6b'][it.id];
      panel(c, -r.w / 2, -r.h / 2, r.w, r.h, Math.min(r.w, r.h) * 0.12, on ? GOLD : 'rgba(140,170,230,0.3)');
      if (on) { c.lineWidth = 5 + Math.sin(t * 6) * 1.5; c.strokeStyle = 'rgba(242,193,78,0.5)'; c.stroke(); }
      c.fillStyle = accent; roundRect(c, -r.w / 2 + 10, -r.h / 2 + 10, r.w - 20, 5, 3); c.fill();
      const drawIcon = (cx, cy, sz) => {
        c.drawImage(goldPic(sz * 1.3), cx - sz * 0.65, cy - sz * 0.6, sz * 1.3, sz * 1.3);
        if (it.id === 'continue') {
          c.fillStyle = '#4fd1c5'; c.beginPath(); c.moveTo(cx - sz * 0.22, cy - sz * 0.3); c.lineTo(cx + sz * 0.32, cy); c.lineTo(cx - sz * 0.22, cy + sz * 0.3); c.closePath(); c.fill();
          c.lineWidth = 4; c.strokeStyle = '#0b2b3a'; c.stroke();
        } else if (it.id === 3) {
          c.drawImage(pieceSprite(6, true, sz), cx - sz * 0.8, cy - sz * 0.55, sz, sz);
          c.drawImage(pieceSprite(6, false, sz), cx - sz * 0.2, cy - sz * 0.55, sz, sz);
        } else c.drawImage(pieceSprite(it.icon, true, sz), cx - sz / 2, cy - sz * 0.55, sz, sz);
      };
      if (wide) {
        drawIcon(0, -r.h * 0.17, r.h * 0.38);
        text(c, it.name, 0, r.h * 0.12, r.h * 0.12, '#ffffff', 900);
        text(c, it.tip, 0, r.h * 0.25, Math.min(r.h * 0.068, r.w * 0.075), 'rgba(255,255,255,0.72)', 600);
        if (typeof it.id === 'number' && it.id < 3) text(c, `🏆 ${levelWins[it.id]}`, 0, r.h * 0.38, r.h * 0.075, GOLD, 800);
      } else {
        drawIcon(-r.w * 0.36, 0, r.h * 0.7);
        text(c, it.name, -r.w * 0.2, -r.h * 0.15, r.h * 0.26, '#ffffff', 900, 'left');
        text(c, it.tip, -r.w * 0.2, r.h * 0.2, r.h * 0.17, 'rgba(255,255,255,0.72)', 600, 'left');
        if (typeof it.id === 'number' && it.id < 3) text(c, `🏆 ${levelWins[it.id]}`, r.w * 0.44, 0, r.h * 0.2, GOLD, 800, 'right');
      }
      c.restore();
    });
    const last = L.cards[shown[shown.length - 1]];
    const hy = wide ? last.y + last.h + H * 0.07 : last.y + last.h + H * 0.04;
    text(c, Kit.touchFirst() ? 'Tap a card to play' : '◀ ▶  choose   ·   OK  play   ·   Back  games menu', W / 2, Math.min(hy, H - 24), Math.max(16, u * 0.3), 'rgba(255,255,255,0.8)', 700);
  }

  function drawPromo(c, t) {
    const u = L.cs, { ix, iy, cs } = L;
    const side = G.pos.side;
    c.fillStyle = 'rgba(4,10,24,0.55)'; c.fillRect(ix, iy, cs * 8, cs * 8);
    const a = ease.back(clamp((now() - promo.t) / 0.3, 0, 1));
    const pw = cs * 6.2, ph = cs * 2.6, px = ix + cs * 4 - pw / 2, py = iy + cs * 4 - ph / 2;
    c.save(); c.translate(ix + cs * 4, iy + cs * 4); c.scale(a, a); c.translate(-(ix + cs * 4), -(iy + cs * 4));
    panel(c, px, py, pw, ph, u * 0.3, GOLD);
    text(c, 'Promote your pawn to', ix + cs * 4, py + ph * 0.18, u * 0.32, '#ffffff', 800);
    L.promoBoxes = [];
    promo.moves.forEach((m, i) => {
      const kind = (m >> 12) & 7;
      const bx = px + cs * 0.3 + i * cs * 1.45, by = py + ph * 0.34, bs = cs * 1.25;
      const on = i === promo.ix;
      roundRect(c, bx, by, bs, bs, cs * 0.18);
      c.fillStyle = on ? 'rgba(242,193,78,0.25)' : 'rgba(255,255,255,0.06)'; c.fill();
      c.lineWidth = on ? 3 + Math.sin(t * 6) : 1.5; c.strokeStyle = on ? GOLD : 'rgba(255,255,255,0.2)'; c.stroke();
      const s = on ? 1.08 + Math.sin(t * 5) * 0.03 : 1;
      drawPiece(c, kind * side, bx + bs * 0.1, by + bs * 0.04, bs * 0.8, on ? 0.3 : 0, s);
      L.promoBoxes.push({ x: bx, y: by, w: bs, h: bs });
    });
    c.restore();
  }

  function resultText() {
    const r = G.result;
    if (r.kind === 'mate') {
      if (!vsTv()) return [r.winner > 0 ? 'White wins!' : 'Black wins!', 'Checkmate', true];
      return r.winner > 0 ? ['You win!', 'Checkmate', true] : ['The TV wins', 'Checkmate', false];
    }
    const why = { stalemate: 'Stalemate', material: 'Not enough pieces left to mate', repetition: 'Same position three times', fifty: '50 moves without a capture or pawn move' }[r.kind];
    return ['Draw', why, null];
  }
  function drawOver(c) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((now() - overT) / 0.4, 0, 1);
    if (a <= 0) return;
    c.fillStyle = `rgba(4,10,24,${0.55 * a})`; c.fillRect(0, 0, W, H);
    const [title, sub, good] = resultText();
    c.save();
    c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W * 0.9, u * 8.6), ph = u * (vsTv() ? 5.4 : 4.6);
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.5, GOLD);
    const kw = u * 1.3;
    const winner = G.result.kind === 'mate' ? G.result.winner > 0 : null;
    c.drawImage(goldPic(kw * 1.8), -kw * 0.9, -ph / 2 - kw * 0.85, kw * 1.8, kw * 1.8);
    if (winner === null) {
      c.drawImage(pieceSprite(6, true, kw), -kw * 0.85, -ph / 2 - kw * 0.55, kw, kw);
      c.drawImage(pieceSprite(6, false, kw), -kw * 0.15, -ph / 2 - kw * 0.55, kw, kw);
    } else c.drawImage(pieceSprite(6, winner, kw), -kw / 2, -ph / 2 - kw * 0.55, kw, kw);
    let y = -ph / 2 + u * 1.25;
    outlined(c, title, 0, y, u * 0.95, good === false ? '#ffd6d6' : '#fff3cf', good === false ? '#ff6b6b' : '#e0a630');
    y += u * 0.85;
    text(c, sub, 0, y, u * 0.36, 'rgba(255,255,255,0.85)', 700);
    if (vsTv()) {
      y += u * 0.75;
      c.save(); c.translate(0, y); const s = 1 + winBump * 0.35; c.scale(s, s);
      text(c, `🏆  Wins vs TV: ${wins}`, 0, 0, u * 0.4, GOLD, 800);
      c.restore();
    }
    const ready = now() > overT + 0.5;
    c.globalAlpha = ready ? 1 : 0.4;
    y += u * 0.8;
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, y, u * 0.38, '#9ff0ff', 800);
    const bw = u * 5.2, bh = u * 0.62;
    y += u * 0.45;
    roundRect(c, -bw / 2, y, bw, bh, bh / 2);
    c.fillStyle = 'rgba(255,255,255,0.1)'; c.fill();
    text(c, Kit.touchFirst() ? 'Other ways to play' : 'Arrows  other ways to play', 0, y + bh / 2, u * 0.28, 'rgba(255,255,255,0.85)', 700);
    c.globalAlpha = 1;
    c.restore();
    L.menuBtn = { x: W / 2 - (bw / 2) * k, y: H / 2 + y * k, w: bw * k, h: bh * k };
  }

  function draw(c, t) {
    Kit.background(c, t, '#13305a', '#050b18', 'rgba(255,190,90,0.07)');
    drawBoard(c, t);
    if (state !== 'menu') drawSide(c, t);
    if (state === 'promo' && promo) drawPromo(c, t);
    if (state === 'menu') drawMenu(c, t);
    if (state === 'over') drawOver(c);
    const m = muteBox();
    c.globalAlpha = 0.7;
    text(c, Kit.muted ? '🔇' : '🔊', m.x + m.w / 2, m.y + m.h / 2, m.h * 0.55, '#fff', 400);
    c.globalAlpha = 1;
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  toMenu();
  Kit.canvas.focus();
  if (wins > 0) Kit.record(ID, wins);
})();
