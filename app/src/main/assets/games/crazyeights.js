// Crazy Eights: the family shedding game with a normal 52-card deck. Match the top card's suit or rank;
// an 8 is wild and picks the next suit; a 2 makes the next player draw two (and miss their go); a Jack
// skips the next player; an Ace reverses the order. First to empty their hand wins.
// 2 to 4 seats, each a Person or the TV. With several people, a cover screen hides each hand until the
// remote is passed. Remote: Left/Right choose a card, OK plays, Up/Down jumps to the Draw pile.
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const ID = 'crazyeights';
  const AUTO = /auto/.test(location.hash);
  const SPEED = AUTO ? 4 : 1;
  const COLORS = ['#ff4d6d', '#3d8bff', '#2ed573', '#ffb020'];
  const SUIT_NAMES = ['Hearts', 'Diamonds', 'Clubs', 'Spades'];
  const RED = '#d6193a', BLACK = '#161c30';
  const suitCol = (s) => (s < 2 ? RED : BLACK);
  const RANK = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const SKILLS = [
    { name: 'Beginner', tip: 'Playable cards glow  ·  TV players go easy' },
    { name: 'Normal', tip: 'No glow  ·  TV players think ahead' },
    { name: 'Hard', tip: 'Sharp TV players that save their 8s' },
  ];
  let warned = false;
  const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { if (!warned) { warned = true; console.error(e); } } };

  // ---------- Setup (remembered) ----------
  const saved = Kit.store.get(ID + '.setup', null) || {};
  let nPlayers = clamp((saved.n | 0) || 2, 2, 4);
  const seatHuman = [true, false, false, false];
  if (Array.isArray(saved.h)) for (let i = 0; i < 4; i++) seatHuman[i] = !!saved.h[i];
  if (!seatHuman.slice(0, nPlayers).some(Boolean)) seatHuman[0] = true;
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, 2);
  let wins = Kit.store.get(ID + '.wins', 0) | 0;
  function saveSetup() { Kit.store.set(ID + '.setup', { n: nPlayers, h: seatHuman.slice() }); Kit.store.set(ID + '.skill', skill); }

  // ---------- State ----------
  let state = 'menu', stateT = 0, menuRow = 3, seatIx = 0, overT = 0, overBtn = 0;
  let players = [], deck = [], pile = [], curSuit = 0, dir = 1, turn = 0, humans = 1;
  let phase = 'idle', phaseT = 0, revealed = -1, drewCard = null, think = 0.8, acted = false, passes = 0;
  let focus = 0, onDraw = false, suitIx = 0, flyers = [], timers = [], winner = -1, standings = [];
  let msg = '', msgT = 0, bannerT = 9, bannerName = '', bannerCol = '#fff', nopeT = 0, suitPulse = 9;
  const cardView = new Map();

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function makeDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 1; r <= 13; r++) d.push({ r, s, id: s * 13 + r - 1, tilt: (Math.random() - 0.5) * 0.3 });
    return shuffle(d);
  }
  const top = () => pile[pile.length - 1];
  const canPlay = (c) => !!c && (c.r === 8 || c.s === curSuit || (!!top() && c.r === top().r));
  const step = (i, k = 1) => (((i + dir * k) % players.length) + players.length) % players.length;
  const sortHand = (h) => h.sort((a, b) => (a.s - b.s) || (a.r - b.r));
  const after = (sec, fn) => timers.push({ t: sec, fn });
  function setPhase(p) { phase = p; phaseT = 0; }
  function say(s, t = 2.4) { msg = s; msgT = t; }
  const viewer = () => (humans === 1 ? players.findIndex((p) => p.human) : revealed);
  const suitCounts = (hand) => { const n = [0, 0, 0, 0]; hand.forEach((c) => { if (c.r !== 8) n[c.s]++; }); return n; };
  function bestSuit(hand) {
    const n = suitCounts(hand);
    let b = curSuit, bv = -1;
    for (let s = 0; s < 4; s++) { const v = n[s] + Math.random() * 0.5; if (v > bv) { bv = v; b = s; } }
    return b;
  }
  const cardWord = (c) => `${RANK[c.r]}${['♥', '♦', '♣', '♠'][c.s]}`;

  // ---------- Sounds ----------
  const sndSwish = () => { Kit.noise({ dur: 0.14, vol: 0.12, freq: 3200, q: 0.7, sweep: 0.45, type: 'highpass' }); };
  const sndSlap = () => { Kit.noise({ dur: 0.07, vol: 0.22, freq: 900, q: 0.8, type: 'lowpass' }); Kit.tone(170, { type: 'sine', dur: 0.08, vol: 0.18, slide: 0.6 }); };
  const sndDeal = () => Kit.noise({ dur: 0.05, vol: 0.08, freq: 4200, q: 1.2 });
  const sndTurn = () => { Kit.tone(620, { type: 'triangle', dur: 0.12, vol: 0.12, slide: 1.3 }); Kit.tone(930, { type: 'sine', dur: 0.12, vol: 0.06, at: 0.07 }); };
  const sndMagic = () => { [0, 1, 2, 3, 4].forEach((i) => Kit.tone([523, 659, 784, 1047, 1319][i], { type: 'triangle', dur: 0.2, vol: 0.1, at: i * 0.05 })); };

  // ---------- Game flow ----------
  function startGame() {
    saveSetup();
    const hcount = seatHuman.slice(0, nPlayers).filter(Boolean).length;
    humans = AUTO ? 0 : hcount;
    players = [];
    let tvN = 0;
    for (let i = 0; i < nPlayers; i++) {
      const human = !AUTO && seatHuman[i];
      players.push({ human, color: COLORS[i], hand: [], bump: 0, name: human ? (hcount === 1 ? 'You' : 'Player ' + (i + 1)) : 'TV ' + (++tvN) });
    }
    deck = makeDeck(); pile = []; dir = 1; flyers = []; timers = []; cardView.clear();
    revealed = -1; winner = -1; passes = 0; drewCard = null; msg = ''; onDraw = false; focus = 0;
    state = 'play'; stateT = 0; setPhase('deal');
    const per = nPlayers === 2 ? 7 : 5;
    let k = 0;
    for (let r = 0; r < per; r++) for (let i = 0; i < nPlayers; i++) { after(0.3 + k * 0.075, () => giveCard(i)); k++; }
    after(0.3 + k * 0.075 + 0.55, flipStarter);
  }
  function toMenu() { state = 'menu'; stateT = 0; players = []; flyers = []; timers = []; pile = []; deck = makeDeck(); }

  function takeCard() {
    if (!deck.length && pile.length > 1) {
      const t = pile.pop();
      deck = shuffle(pile); pile = [t];
      say('Pile shuffled into a new draw pile', 1.8);
      Kit.noise({ dur: 0.4, vol: 0.1, freq: 2500, q: 0.6 });
    }
    return deck.pop() || null;
  }

  // One card from the draw pile to player i (face up only for the person holding the remote).
  function giveCard(i, done) {
    const c = takeCard();
    if (!c) { if (done) done(null); return null; }
    const p = players[i], mine = viewer() === i;
    const to = mine ? trayLanding() : plaqueDest(i);
    sndDeal();
    fly(c, drawPos(), to, 0.38, false, mine, () => {
      p.hand.push(c);
      if (p.human || viewer() === i) sortHand(p.hand);
      cardView.set(c.id, { x: to.x, lift: 0 });
      p.bump = 1;
      if (done) done(c);
    });
    return c;
  }
  function drawCards(i, n, done) {
    let left = n, last = null;
    const next = () => {
      if (left-- <= 0) { if (done) done(last); return; }
      giveCard(i, (cc) => {
        if (!cc) { if (done) done(last); return; }
        last = cc; after(0.08, next);
      });
    };
    next();
  }

  function flipStarter() {
    let c = takeCard(), tries = 0;
    while (c && [1, 2, 8, 11].includes(c.r) && tries++ < 20) { deck.unshift(c); c = takeCard(); }
    if (!c) { beginTurn(0); return; }
    sndSwish();
    fly(c, drawPos(), pileDest(c), 0.45, false, true, () => {
      pile.push(c); curSuit = c.s; sndSlap(); suitPulse = 0;
      after(0.35, () => beginTurn(0));
    });
  }

  function beginTurn(i) {
    if (state !== 'play') return;
    turn = i; drewCard = null; acted = false; onDraw = false;
    const p = players[i];
    if (p.human && humans > 1 && revealed !== i) { revealed = -1; msg = ''; setPhase('cover'); return; }
    bannerT = 0; bannerName = p.name === 'You' ? 'Your turn!' : `${p.name}'s turn`; bannerCol = p.color;
    sndTurn();
    setPhase('banner');
  }
  function startActing() {
    const p = players[turn];
    if (p.human) {
      if (humans > 1) revealed = turn;
      setPhase('human');
      const firstOk = p.hand.findIndex(canPlay);
      focus = firstOk >= 0 ? firstOk : clamp(focus, 0, Math.max(0, p.hand.length - 1));
      if (firstOk < 0) {
        onDraw = true;
        say(skill === 0 ? 'No card matches - press OK to draw one' : 'Nothing to play? Draw a card', 3);
      } else say(skill === 0 ? `Match ${SUIT_NAMES[curSuit]} or a ${RANK[top() ? top().r : 1]} - or play an 8` : '', 3);
    } else {
      setPhase('tv');
      think = (skill === 0 ? 1.1 : 0.85) * (0.75 + Math.random() * 0.5);
    }
  }

  function playCard(i, c) {
    const p = players[i];
    const k = p.hand.indexOf(c);
    if (k < 0) return;
    const mine = viewer() === i;
    const from = mine ? trayPos(k, p.hand.length) : plaqueDest(i);
    p.hand.splice(k, 1);
    if (mine) focus = clamp(focus, 0, Math.max(0, p.hand.length - 1));
    acted = true; onDraw = false; drewCard = null;
    setPhase('anim');
    sndSwish();
    fly(c, from, pileDest(c), 0.42, mine, true, () => {
      pile.push(c); sndSlap();
      const d = discardPos();
      Kit.burst(d.x, d.y, c.r === 8 ? '#ffd23f' : rgba(p.color, 0.9), c.r === 8 ? 26 : 10, c.r === 8 ? 1 : 0.6);
      if (!p.hand.length) { after(0.3, () => finishGame(i)); return; }
      if (p.hand.length === 1) { const r = plaqueRect(i); Kit.float('Last card!', r.x + r.w / 2, r.y + r.h + L.u * 0.5, { color: '#ffd23f', size: L.u * 0.7 }); Kit.tone(1046, { type: 'triangle', dur: 0.2, vol: 0.12 }); }
      if (c.r === 8) {
        sndMagic();
        if (p.human) { setPhase('suit'); suitIx = bestSuit(p.hand); return; }
        const s = skill === 0 && Math.random() < 0.5 ? Math.floor(Math.random() * 4) : bestSuit(p.hand);
        chooseSuit(s);
        return;
      }
      curSuit = c.s;
      effects(c);
    });
  }

  function chooseSuit(s) {
    curSuit = s; suitPulse = 0;
    const d = discardPos();
    Kit.float(`${SUIT_NAMES[s]}!`, d.x, d.y - L.ch * 0.7, { color: s < 2 ? '#ff6b81' : '#c9d6ff', size: L.u * 0.9 });
    effects(top());
  }

  function effects(c) {
    const n = players.length;
    let next = step(turn, 1);
    const at = (j, s, col) => { const r = plaqueRect(j); Kit.float(s, r.x + r.w / 2, r.y + r.h * 0.5, { color: col, size: L.u * 0.8, life: 1.4 }); };
    if (c.r === 2) {
      const victim = next;
      at(victim, '+2 cards!', '#ff9f5a');
      Kit.tone(330, { type: 'square', dur: 0.1, vol: 0.08 }); Kit.tone(220, { type: 'square', dur: 0.14, vol: 0.08, at: 0.1 });
      say(`${players[victim].name === 'You' ? 'You draw' : players[victim].name + ' draws'} two and misses a go`, 2.4);
      setPhase('anim');
      after(0.35, () => drawCards(victim, 2, () => after(0.35, () => endTurnTo(step(victim, 1)))));
      return;
    }
    if (c.r === 11) {
      at(next, 'Skipped!', '#9ff0ff');
      say(`${players[next].name === 'You' ? 'You are' : players[next].name + ' is'} skipped`, 2);
      Kit.tone(880, { type: 'triangle', dur: 0.1, vol: 0.12, slide: 0.5 });
      next = step(next, 1);
    } else if (c.r === 1) {
      dir = -dir;
      const d = discardPos();
      Kit.float('Reverse!', d.x, d.y + L.ch * 0.75, { color: '#b388ff', size: L.u * 0.8 });
      Kit.tone(500, { type: 'triangle', dur: 0.18, vol: 0.12, slide: 1.6 }); Kit.tone(800, { type: 'triangle', dur: 0.18, vol: 0.1, at: 0.12, slide: 0.6 });
      next = n === 2 ? turn : step(turn, 1);
      if (n === 2) say('Reverse with two players: go again!', 2);
    }
    endTurnTo(next);
  }

  function endTurnTo(next) {
    if (state !== 'play') return;
    passes = acted ? 0 : passes + 1;
    if (passes >= players.length * 2) { finishGame(-1); return; }
    if (humans > 1 && next !== turn) revealed = -1;
    setPhase('anim');
    after(0.4, () => beginTurn(next));
  }

  function humanDraw() {
    const p = players[turn];
    if (drewCard) { // second press = pass
      Kit.sfx.move(); say('');
      endTurnTo(step(turn, 1));
      return;
    }
    if (!deck.length && pile.length <= 1) { say('No cards left to draw - turn passes', 2); endTurnTo(step(turn, 1)); return; }
    setPhase('anim');
    giveCard(turn, (c) => {
      if (!c) { endTurnTo(step(turn, 1)); return; }
      acted = true;
      if (canPlay(c)) {
        drewCard = c;
        focus = Math.max(0, p.hand.indexOf(c));
        onDraw = false;
        setPhase('human');
        say(`You drew ${cardWord(c)} - play it, or Up for Pass`, 3);
      } else {
        say(humans > 1 ? 'No match - turn passes' : `You drew ${cardWord(c)} - no match, turn passes`, 2);
        Kit.tone(220, { type: 'triangle', dur: 0.12, vol: 0.1 });
        after(0.7, () => endTurnTo(step(turn, 1)));
      }
    });
  }

  function tryPlay() {
    const p = players[turn];
    const c = p.hand[focus];
    if (!c) return;
    if (drewCard && c !== drewCard) { nope('You can only play the card you drew'); return; }
    if (!canPlay(c)) { nope(`That card doesn't match ${SUIT_NAMES[curSuit]} or ${RANK[top().r]}`); return; }
    say('');
    playCard(turn, c);
  }
  function nope(s) { Kit.sfx.nope(); nopeT = 0.4; say(s, 2.2); }

  // The TV picks a card (null = draw).
  function tvChoose(p) {
    const opts = p.hand.filter(canPlay);
    if (!opts.length) return null;
    if (skill === 0) {
      if (deck.length && Math.random() < 0.25) return null;
      return opts[Math.floor(Math.random() * opts.length)];
    }
    const counts = suitCounts(p.hand);
    const nextP = players[step(turn, 1)];
    let best = null, bv = -1e9;
    for (const c of opts) {
      let v = Math.random() * 3;
      if (c.r === 8) v -= skill === 2 ? 60 : 25;
      else v += counts[c.s] * 4;
      if ([2, 11, 1].includes(c.r)) v += skill === 2 ? (nextP.hand.length <= 3 ? 30 : 6) : 3;
      if (v > bv) { bv = v; best = c; }
    }
    return best;
  }
  function tvAct() {
    const p = players[turn];
    const c = tvChoose(p);
    if (c) { playCard(turn, c); return; }
    if (!deck.length && pile.length <= 1) { endTurnTo(step(turn, 1)); return; }
    setPhase('anim');
    giveCard(turn, (got) => {
      if (!got) { endTurnTo(step(turn, 1)); return; }
      acted = true;
      if (canPlay(got) && (skill > 0 || Math.random() < 0.6)) after(0.45, () => playCard(turn, got));
      else after(0.4, () => endTurnTo(step(turn, 1)));
    });
  }

  let gamesDone = 0;
  function finishGame(w) {
    if (state !== 'play') return;
    gamesDone++;
    const order = players.map((p, i) => i).sort((a, b) => players[a].hand.length - players[b].hand.length);
    winner = w >= 0 ? w : order[0];
    standings = [winner, ...order.filter((i) => i !== winner)];
    state = 'over'; overT = stateT; overBtn = 0; revealed = -1;
    const p = players[winner];
    if (p.human) {
      wins++;
      Kit.store.set(ID + '.wins', wins);
      Kit.record(ID, wins);
      Kit.confetti(170); Kit.sfx.win();
    } else if (humans > 0) Kit.sfx.over(); else Kit.sfx.chime();
  }

  // ---------- Flying cards ----------
  function fly(card, from, to, dur, faceFrom, faceTo, done) {
    flyers.push({ card, from, to, t: 0, dur: dur, faceFrom, faceTo, done, spin: (Math.random() - 0.5) * 0.8 });
  }

  // ---------- Keys and taps ----------
  function menuMove(k) {
    if (k === 'up') { menuRow = (menuRow + 3) % 4; Kit.sfx.move(); return; }
    if (k === 'down') { menuRow = (menuRow + 1) % 4; Kit.sfx.move(); return; }
    const d = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    if (k === 'ok') {
      if (menuRow === 1) toggleSeat(seatIx); else startGame();
      return;
    }
    if (!d) return;
    if (menuRow === 0) { nPlayers = clamp(nPlayers + d, 2, 4); fixSeats(); seatIx = Math.min(seatIx, nPlayers - 1); Kit.sfx.move(); saveSetup(); }
    else if (menuRow === 1) { seatIx = (seatIx + d + nPlayers) % nPlayers; Kit.sfx.move(); }
    else if (menuRow === 2) { skill = clamp(skill + d, 0, 2); Kit.sfx.move(); saveSetup(); }
  }
  function fixSeats() { if (!seatHuman.slice(0, nPlayers).some(Boolean)) seatHuman[0] = true; }
  function toggleSeat(i) {
    seatHuman[i] = !seatHuman[i];
    if (!seatHuman.slice(0, nPlayers).some(Boolean)) { seatHuman[i] = true; Kit.sfx.nope(); return; }
    Kit.sfx.pick(); saveSetup();
  }

  Kit.onKeys(guard((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { menuMove(k); return; }
    if (state === 'over') {
      if (stateT - overT < 1.2) return;
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { overBtn = 1 - overBtn; Kit.sfx.move(); }
      else if (k === 'ok') { if (overBtn === 0) startGame(); else toMenu(); }
      return;
    }
    if (phase === 'cover') { if (k === 'ok') { Kit.sfx.pick(); revealed = turn; startActing(); } return; }
    if (phase === 'suit') {
      if (k === 'left' || k === 'up') { suitIx = (suitIx + 3) % 4; Kit.sfx.move(); }
      else if (k === 'right' || k === 'down') { suitIx = (suitIx + 1) % 4; Kit.sfx.move(); }
      else if (k === 'ok') { setPhase('anim'); chooseSuit(suitIx); }
      return;
    }
    if (phase !== 'human' || !players[turn] || !players[turn].human) return;
    const n = players[turn].hand.length;
    if (k === 'up' || k === 'down') { onDraw = !onDraw; Kit.sfx.move(); return; }
    if (k === 'left' || k === 'right') {
      if (onDraw) { onDraw = false; Kit.sfx.move(); return; }
      if (n) { focus = (focus + (k === 'left' ? -1 : 1) + n) % n; Kit.sfx.move(); }
      return;
    }
    if (k === 'ok') { if (onDraw) humanDraw(); else tryPlay(); }
  }));

  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  let hits = [];
  Kit.onPointer({
    down: guard((e) => {
      for (let i = hits.length - 1; i >= 0; i--) if (inside(e, hits[i])) { hits[i].fn(); return; }
    }),
  });
  let hidden = false;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // ---------- Update ----------
  const update = guard((rdt) => {
    if (hidden) return;
    const dt = rdt * SPEED;
    stateT += dt; phaseT += dt; bannerT += dt; suitPulse += dt;
    if (msgT > 0) msgT -= rdt;
    if (nopeT > 0) nopeT -= rdt;
    players.forEach((p) => { p.bump = Math.max(0, p.bump - dt * 3); });
    for (let i = flyers.length - 1; i >= 0; i--) {
      const f = flyers[i];
      f.t += dt;
      if (f.t >= f.dur) { flyers.splice(i, 1); if (f.done) f.done(); }
    }
    for (let i = 0; i < timers.length; i++) {
      timers[i].t -= dt;
      if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); i--; f(); }
    }
    if (AUTO && state === 'over' && stateT - overT > 3) startGame();
    if (state !== 'play') return;
    if (phase === 'banner' && phaseT > 0.9) startActing();
    else if (phase === 'tv' && phaseT > think) tvAct();
    else if (AUTO && phase === 'suit') chooseSuit(bestSuit(players[turn].hand));
    // Hand cards slide smoothly to their places and lift when chosen.
    const v = viewer();
    if (v >= 0 && players[v]) {
      const h = players[v].hand;
      h.forEach((c, i) => {
        const tp = trayPos(i, h.length);
        let cv = cardView.get(c.id);
        if (!cv) { cv = { x: tp.x, lift: 0 }; cardView.set(c.id, cv); }
        cv.x = lerp(cv.x, tp.x, Math.min(1, rdt * 12));
        const on = phase === 'human' && v === turn && i === focus && !onDraw;
        cv.lift = lerp(cv.lift, on ? 1 : 0, Math.min(1, rdt * 14));
      });
    }
  });

  // ---------- Layout ----------
  let L = { u: 40, cw: 100, ch: 140, cx: 0, py: 0, pg: 0, hy: 0 };
  const table = document.createElement('canvas');
  function layout(W, H) {
    if (!W || !H) return;
    const u = Math.min(W / 32, H / 18);
    const cw = u * 2.8, ch = cw * 1.4;
    L = { u, cw, ch, cx: W / 2, py: u * 7.6, pg: u * 1.9, hy: H - ch / 2 - u * 1.05, W, H };
    sprites.clear();
    drawTable(W, H);
  }
  Kit.onResize(layout);

  const drawPos = () => ({ x: L.cx - L.pg, y: L.py, rot: 0, sc: 1 });
  const discardPos = () => ({ x: L.cx + L.pg, y: L.py, rot: 0, sc: 1 });
  const pileDest = (c) => ({ x: L.cx + L.pg, y: L.py, rot: c.tilt, sc: 1 });
  function plaqueRect(i) {
    const n = Math.max(1, players.length), u = L.u, gap = u * 0.45;
    const pw = Math.min(u * 7.2, (Kit.W - u * 1.5) / n - gap);
    const total = n * pw + (n - 1) * gap;
    return { x: (Kit.W - total) / 2 + i * (pw + gap), y: u * 0.35, w: pw, h: u * 2.75 };
  }
  function plaqueDest(i) { const r = plaqueRect(i); return { x: r.x + r.w * 0.8, y: r.y + r.h * 0.52, rot: 0, sc: 0.36 }; }
  function trayPos(i, n) {
    const maxW = Kit.W - L.u * 3;
    const sp = n > 1 ? Math.min(L.cw * 0.84, (maxW - L.cw) / (n - 1)) : 0;
    const mid = (n - 1) / 2, d = i - mid;
    return { x: L.cx + d * sp, y: L.hy + (mid > 0 ? (d / mid) * (d / mid) : 0) * L.u * 0.35, rot: d * Math.min(0.045, 0.5 / Math.max(1, n)), sc: 1 };
  }
  const trayLanding = () => ({ x: L.cx + L.u * 4, y: L.hy, rot: 0.1, sc: 1 });

  // ---------- Sprites ----------
  const sprites = new Map();
  function sprite(name, w, h, draw) {
    const k = name + '|' + Math.round(w) + 'x' + Math.round(h);
    let s = sprites.get(k);
    if (s) return s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    s = document.createElement('canvas');
    s.width = Math.max(1, Math.ceil(w * dpr)); s.height = Math.max(1, Math.ceil(h * dpr));
    const c = s.getContext('2d');
    c.scale(dpr, dpr);
    try { draw(c, w, h); } catch (e) { if (!warned) { warned = true; console.error(e); } }
    sprites.set(k, s);
    return s;
  }

  function suitShape(c, s, x, y, r) {
    // Fills the suit in the current fillStyle.
    if (s === 0) {
      c.beginPath();
      c.moveTo(x, y + r * 0.95);
      c.bezierCurveTo(x - r * 1.3, y + r * 0.05, x - r * 1.0, y - r * 1.1, x, y - r * 0.42);
      c.bezierCurveTo(x + r * 1.0, y - r * 1.1, x + r * 1.3, y + r * 0.05, x, y + r * 0.95);
      c.fill();
    } else if (s === 1) {
      c.beginPath();
      c.moveTo(x, y - r);
      c.quadraticCurveTo(x + r * 0.32, y - r * 0.32, x + r * 0.78, y);
      c.quadraticCurveTo(x + r * 0.32, y + r * 0.32, x, y + r);
      c.quadraticCurveTo(x - r * 0.32, y + r * 0.32, x - r * 0.78, y);
      c.quadraticCurveTo(x - r * 0.32, y - r * 0.32, x, y - r);
      c.fill();
    } else if (s === 2) {
      const cr = r * 0.42;
      [[0, -0.45], [-0.5, 0.12], [0.5, 0.12]].forEach(([dx, dy]) => { c.beginPath(); c.arc(x + dx * r, y + dy * r, cr, 0, Math.PI * 2); c.fill(); });
      c.beginPath(); c.arc(x, y, r * 0.2, 0, Math.PI * 2); c.fill();
      c.beginPath();
      c.moveTo(x - r * 0.1, y); c.quadraticCurveTo(x - r * 0.06, y + r * 0.7, x - r * 0.42, y + r);
      c.lineTo(x + r * 0.42, y + r); c.quadraticCurveTo(x + r * 0.06, y + r * 0.7, x + r * 0.1, y); c.closePath(); c.fill();
    } else {
      c.beginPath();
      c.moveTo(x, y - r);
      c.bezierCurveTo(x + r * 0.3, y - r * 0.55, x + r * 1.15, y - r * 0.15, x + r * 0.95, y + r * 0.35);
      c.bezierCurveTo(x + r * 0.8, y + r * 0.75, x + r * 0.3, y + r * 0.72, x + r * 0.08, y + r * 0.42);
      c.quadraticCurveTo(x + r * 0.15, y + r * 0.82, x + r * 0.42, y + r);
      c.lineTo(x - r * 0.42, y + r);
      c.quadraticCurveTo(x - r * 0.15, y + r * 0.82, x - r * 0.08, y + r * 0.42);
      c.bezierCurveTo(x - r * 0.3, y + r * 0.72, x - r * 0.8, y + r * 0.75, x - r * 0.95, y + r * 0.35);
      c.bezierCurveTo(x - r * 1.15, y - r * 0.15, x - r * 0.3, y - r * 0.55, x, y - r);
      c.fill();
    }
  }
  function suitFill(c, s, x, y, r) {
    const col = s < 2 ? RED : BLACK;
    const g = c.createLinearGradient(x - r, y - r, x + r, y + r);
    g.addColorStop(0, shade(col, s < 2 ? 0.25 : 0.35)); g.addColorStop(0.6, col); g.addColorStop(1, shade(col, -0.3));
    c.fillStyle = g;
    suitShape(c, s, x, y, r);
  }

  const PIPS = {
    2: [[0, -1], [0, 1]], 3: [[0, -1], [0, 0], [0, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
    5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]], 6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    7: [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [-1, 1], [1, 1]],
    8: [[-1, -1], [1, -1], [0, -0.5], [-1, 0], [1, 0], [0, 0.5], [-1, 1], [1, 1]],
    9: [[-1, -1], [1, -1], [-1, -1 / 3], [1, -1 / 3], [0, 0], [-1, 1 / 3], [1, 1 / 3], [-1, 1], [1, 1]],
    10: [[-1, -1], [1, -1], [0, -2 / 3], [-1, -1 / 3], [1, -1 / 3], [-1, 1 / 3], [1, 1 / 3], [0, 2 / 3], [-1, 1], [1, 1]],
  };

  const faceSprite = (card, w, h) => sprite('f' + card.id, w, h, (c, w, h) => {
    const r = w * 0.1, col = suitCol(card.s);
    roundRect(c, 1, 1, w - 2, h - 2, r);
    let g = c.createLinearGradient(0, 0, w * 0.5, h);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#f6f2ea'); g.addColorStop(1, '#e4ddd0');
    c.fillStyle = g; c.fill();
    if (card.r === 8) { // wild: a rainbow rim
      const rg = c.createLinearGradient(0, 0, w, h);
      ['#ff4d6d', '#ffb020', '#2ed573', '#3d8bff', '#b388ff'].forEach((cc, i) => rg.addColorStop(i / 4, cc));
      c.lineWidth = w * 0.035; c.strokeStyle = rg; roundRect(c, w * 0.03, w * 0.03, w - w * 0.06, h - w * 0.06, r * 0.8); c.stroke();
    }
    c.lineWidth = Math.max(1, w * 0.012); c.strokeStyle = 'rgba(70,55,40,0.4)'; roundRect(c, 1, 1, w - 2, h - 2, r); c.stroke();
    // Corner indices (top left, and turned round at bottom right)
    const corner = () => {
      const fs = w * 0.23;
      c.font = `700 ${Math.round(fs)}px ${Kit.FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const label = RANK[card.r];
      const tw = c.measureText(label).width;
      c.save(); c.translate(w * 0.135, h * 0.095);
      if (tw > w * 0.21) c.scale(w * 0.21 / tw, 1);
      c.fillStyle = col; c.fillText(label, 0, 0);
      c.restore();
      suitFill(c, card.s, w * 0.135, h * 0.19, w * 0.068);
    };
    corner();
    c.save(); c.translate(w, h); c.rotate(Math.PI); corner(); c.restore();
    // Centre
    if (card.r >= 2 && card.r <= 10) {
      const pr = w * 0.085;
      PIPS[card.r].forEach(([px, py]) => {
        const x = w / 2 + px * w * 0.175, y = h / 2 + py * h * 0.29;
        c.save(); c.translate(x, y); if (py > 0.01) c.rotate(Math.PI);
        suitFill(c, card.s, 0, 0, pr);
        c.restore();
      });
    } else if (card.r === 1) {
      c.save(); c.shadowColor = 'rgba(0,0,0,0.25)'; c.shadowBlur = w * 0.05; c.shadowOffsetY = w * 0.02;
      suitFill(c, card.s, w / 2, h / 2, w * 0.24); c.restore();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.beginPath(); c.ellipse(w / 2 - w * 0.07, h / 2 - w * 0.09, w * 0.06, w * 0.03, -0.6, 0, Math.PI * 2); c.fill();
    } else {
      // Face cards: an original framed emblem (crown, tiara or feathered cap) with the letter.
      const fx = w * 0.25, fy = h * 0.16, fw = w * 0.5, fh = h * 0.68;
      roundRect(c, fx, fy, fw, fh, w * 0.05);
      g = c.createLinearGradient(0, fy, 0, fy + fh);
      if (card.s < 2) { g.addColorStop(0, '#ffe7c2'); g.addColorStop(1, '#ffb59a'); } else { g.addColorStop(0, '#dfe6ff'); g.addColorStop(1, '#9fb1f0'); }
      c.fillStyle = g; c.fill();
      c.lineWidth = w * 0.02; c.strokeStyle = shade(col, 0.1); c.stroke();
      c.lineWidth = w * 0.008; c.strokeStyle = '#c99a2e'; roundRect(c, fx + w * 0.025, fy + w * 0.025, fw - w * 0.05, fh - w * 0.05, w * 0.035); c.stroke();
      const cx = w / 2, cy = fy + fh * 0.3, s = fw * 0.36;
      const gold = c.createLinearGradient(0, cy - s, 0, cy + s * 0.6);
      gold.addColorStop(0, '#fff3a8'); gold.addColorStop(0.5, '#ffc93a'); gold.addColorStop(1, '#c47f06');
      c.fillStyle = gold; c.strokeStyle = '#8a5200'; c.lineWidth = w * 0.01;
      c.beginPath();
      if (card.r === 13) { // crown with five points
        c.moveTo(cx - s, cy + s * 0.5);
        for (let i = 0; i <= 4; i++) { const x = cx - s + i * s * 0.5; c.lineTo(x, cy - s * (i % 2 ? 0.25 : 0.75)); if (i < 4) c.lineTo(x + s * 0.25, cy + s * 0.05); }
        c.lineTo(cx + s, cy + s * 0.5); c.closePath();
      } else if (card.r === 12) { // tiara: a gentle arch with three gems
        c.moveTo(cx - s, cy + s * 0.5);
        c.quadraticCurveTo(cx - s * 0.9, cy - s * 0.2, cx - s * 0.45, cy - s * 0.1);
        c.quadraticCurveTo(cx - s * 0.2, cy - s * 0.9, cx, cy - s * 0.85);
        c.quadraticCurveTo(cx + s * 0.2, cy - s * 0.9, cx + s * 0.45, cy - s * 0.1);
        c.quadraticCurveTo(cx + s * 0.9, cy - s * 0.2, cx + s, cy + s * 0.5);
        c.closePath();
      } else { // jack: a cap with a feather
        c.moveTo(cx - s, cy + s * 0.5);
        c.quadraticCurveTo(cx - s, cy - s * 0.5, cx, cy - s * 0.5);
        c.quadraticCurveTo(cx + s, cy - s * 0.5, cx + s, cy + s * 0.5);
        c.closePath();
      }
      c.fill(); c.stroke();
      if (card.r === 11) {
        c.fillStyle = card.s < 2 ? '#2ed573' : '#ff4d6d';
        c.beginPath(); c.ellipse(cx + s * 0.55, cy - s * 0.75, s * 0.18, s * 0.6, 0.6, 0, Math.PI * 2); c.fill();
      }
      const gems = card.r === 13 ? [-0.5, 0, 0.5] : card.r === 12 ? [-0.45, 0, 0.45] : [0];
      gems.forEach((gx, i) => {
        c.fillStyle = i === 1 || gems.length === 1 ? col : '#3d8bff';
        c.beginPath(); c.arc(cx + gx * s, cy + s * 0.2, s * 0.12, 0, Math.PI * 2); c.fill();
      });
      c.font = `700 ${Math.round(fw * 0.62)}px ${Kit.FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = col; c.fillText(RANK[card.r], cx, fy + fh * 0.66);
      suitFill(c, card.s, cx, fy + fh * 0.88, fw * 0.1);
    }
    // Action badge (top right): +2, skip, reverse, wild
    const bx = w * 0.84, by = h * 0.085, br = w * 0.1;
    const badge = (fill, txt, tc) => {
      c.fillStyle = fill; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
      c.lineWidth = w * 0.012; c.strokeStyle = 'rgba(255,255,255,0.9)'; c.stroke();
      c.font = `700 ${Math.round(br * 1.05)}px ${Kit.FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = tc; c.fillText(txt, bx, by + br * 0.05);
    };
    if (card.r === 2) badge('#ff8a3d', '+2', '#fff');
    else if (card.r === 11) {
      badge('#2bb3c0', '', '#fff');
      c.strokeStyle = '#fff'; c.lineWidth = br * 0.22;
      c.beginPath(); c.arc(bx, by, br * 0.5, 0, Math.PI * 2); c.stroke();
      c.beginPath(); c.moveTo(bx - br * 0.35, by + br * 0.35); c.lineTo(bx + br * 0.35, by - br * 0.35); c.stroke();
    } else if (card.r === 1) {
      badge('#8b5cf6', '', '#fff');
      c.strokeStyle = '#fff'; c.lineWidth = br * 0.2; c.lineCap = 'round';
      c.beginPath(); c.arc(bx, by, br * 0.5, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
      c.beginPath(); c.arc(bx, by, br * 0.5, Math.PI * 0.1, Math.PI * 0.9); c.stroke();
      c.lineCap = 'butt';
      c.fillStyle = '#fff';
      c.beginPath(); c.moveTo(bx + br * 0.55, by - br * 0.55); c.lineTo(bx + br * 0.65, by - br * 0.05); c.lineTo(bx + br * 0.2, by - br * 0.2); c.fill();
      c.beginPath(); c.moveTo(bx - br * 0.55, by + br * 0.55); c.lineTo(bx - br * 0.65, by + br * 0.05); c.lineTo(bx - br * 0.2, by + br * 0.2); c.fill();
    } else if (card.r === 8) {
      const rg = c.createLinearGradient(bx - br, by - br, bx + br, by + br);
      ['#ff4d6d', '#ffb020', '#2ed573', '#3d8bff'].forEach((cc, i) => rg.addColorStop(i / 3, cc));
      badge(rg, '★', '#fff');
    }
    // Gloss
    g = c.createLinearGradient(0, 0, w, h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(0.35, 'rgba(255,255,255,0)');
    roundRect(c, 2, 2, w - 4, h - 4, r); c.fillStyle = g; c.fill();
  });

  const backSprite = (w, h) => sprite('back', w, h, (c, w, h) => {
    const r = w * 0.1;
    roundRect(c, 1, 1, w - 2, h - 2, r); c.fillStyle = '#fbf8f2'; c.fill();
    const ix = w * 0.07, iw = w - ix * 2, ih = h - ix * 2;
    roundRect(c, ix, ix, iw, ih, r * 0.7);
    let g = c.createLinearGradient(0, ix, w, h);
    g.addColorStop(0, '#5b3fd6'); g.addColorStop(0.5, '#3a22a8'); g.addColorStop(1, '#1d0f66');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, ix, ix, iw, ih, r * 0.7); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.13)'; c.lineWidth = Math.max(1, w * 0.012);
    const sp = w * 0.13;
    for (let k = -h; k < w + h; k += sp) {
      c.beginPath(); c.moveTo(k, 0); c.lineTo(k + h, h); c.stroke();
      c.beginPath(); c.moveTo(k + h, 0); c.lineTo(k, h); c.stroke();
    }
    c.restore();
    const cx = w / 2, cy = h / 2, er = w * 0.24;
    g = c.createRadialGradient(cx - er * 0.3, cy - er * 0.3, er * 0.1, cx, cy, er);
    g.addColorStop(0, '#fff3a8'); g.addColorStop(0.6, '#ffc93a'); g.addColorStop(1, '#b8760a');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, er, 0, Math.PI * 2); c.fill();
    c.lineWidth = w * 0.02; c.strokeStyle = '#fff6d0'; c.stroke();
    c.font = `700 ${Math.round(er * 1.3)}px ${Kit.FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#5b2a00'; c.fillText('8', cx, cy + er * 0.06);
    c.lineWidth = Math.max(1, w * 0.012); c.strokeStyle = 'rgba(70,55,40,0.4)'; roundRect(c, 1, 1, w - 2, h - 2, r); c.stroke();
    g = c.createLinearGradient(0, 0, w, h * 0.6);
    g.addColorStop(0, 'rgba(255,255,255,0.4)'); g.addColorStop(0.35, 'rgba(255,255,255,0)');
    roundRect(c, 2, 2, w - 4, h - 4, r); c.fillStyle = g; c.fill();
  });

  // The felt table, drawn once per size.
  function drawTable(W, H) {
    table.width = Math.max(1, Math.round(W)); table.height = Math.max(1, Math.round(H));
    const c = table.getContext('2d');
    let g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2a1708'); g.addColorStop(1, '#120802');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    const u = L.u, m = u * 0.25;
    // wooden rim
    roundRect(c, m, m, W - m * 2, H - m * 2, u * 2.2);
    g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#b06b2c'); g.addColorStop(0.5, '#7a4317'); g.addColorStop(1, '#4e2a0c');
    c.fillStyle = g; c.fill();
    c.lineWidth = 2; c.strokeStyle = 'rgba(255,220,170,0.35)'; c.stroke();
    // felt
    const f = u * 0.55;
    roundRect(c, m + f, m + f, W - (m + f) * 2, H - (m + f) * 2, u * 1.8);
    g = c.createRadialGradient(W / 2, H * 0.45, u * 2, W / 2, H * 0.5, Math.max(W, H) * 0.65);
    g.addColorStop(0, '#2fa36c'); g.addColorStop(0.55, '#16774a'); g.addColorStop(1, '#0a4128');
    c.fillStyle = g; c.fill();
    c.save(); c.clip();
    // felt fibres
    for (let i = 0; i < (W * H) / 900; i++) {
      c.fillStyle = Math.random() < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
      c.fillRect(Math.random() * W, Math.random() * H, 1.5, 1.5);
    }
    // inner shadow along the rim
    c.lineWidth = u * 0.6; c.strokeStyle = 'rgba(0,0,0,0.25)';
    roundRect(c, m + f, m + f, W - (m + f) * 2, H - (m + f) * 2, u * 1.8); c.stroke();
    // printed ring around the piles
    c.lineWidth = u * 0.06; c.strokeStyle = 'rgba(255,255,255,0.10)';
    c.beginPath(); c.ellipse(W / 2, L.py, u * 6.4, u * 3.2, 0, 0, Math.PI * 2); c.stroke();
    c.setLineDash([u * 0.2, u * 0.2]);
    c.beginPath(); c.ellipse(W / 2, L.py, u * 6.8, u * 3.5, 0, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  // ---------- Drawing helpers ----------
  function text(c, str, x, y, size, color, weight = 800, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function fitText(c, str, x, y, size, color, maxW, weight = 800, align = 'center', font = Kit.UI) {
    c.font = `${weight} ${Math.round(size)}px ${font}`;
    const w = c.measureText(str).width;
    if (w > maxW && w > 0) size *= maxW / w;
    text(c, str, x, y, size, color, weight, align, font);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `700 ${Math.round(size)}px ${Kit.FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(6,20,12,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, top = '#1f5f45', bottom = '#0b2e20') {
    roundRect(c, x, y + 6, w, h, r); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }
  function pill(c, x, y, w, h, label, on, rowOn, t, sub) {
    const k = on && rowOn ? 1.06 + Math.sin(t * 5) * 0.015 : 1;
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    roundRect(c, -w / 2, -h / 2, w, h, h / 2);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, on ? '#ffe680' : 'rgba(255,255,255,0.14)'); g.addColorStop(1, on ? '#f0a000' : 'rgba(255,255,255,0.05)');
    c.fillStyle = g; c.fill();
    c.lineWidth = on && rowOn ? 4 : 2; c.strokeStyle = on && rowOn ? '#ffffff' : on ? '#ffd23f' : 'rgba(255,255,255,0.25)'; c.stroke();
    fitText(c, label, 0, sub ? -h * 0.12 : h * 0.03, h * 0.42, on ? '#3a2200' : 'rgba(255,255,255,0.85)', w * 0.86, 800);
    if (sub) fitText(c, sub, 0, h * 0.25, h * 0.24, on ? '#5a3a00' : 'rgba(255,255,255,0.6)', w * 0.86, 700);
    c.restore();
  }

  // A card at x,y (centre) with rotation and scale; face or back. Optional glow.
  function drawCard(c, card, x, y, rot, sc, faceUp, glow, dim) {
    const w = L.cw, h = L.ch;
    c.save(); c.translate(x, y); c.rotate(rot || 0); c.scale(sc, sc);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(c, -w / 2 + w * 0.03, -h / 2 + w * 0.06, w, h, w * 0.1); c.fill();
    if (glow) {
      c.shadowColor = glow; c.shadowBlur = w * 0.3;
      roundRect(c, -w / 2, -h / 2, w, h, w * 0.1); c.fillStyle = glow; c.fill();
      c.shadowBlur = 0; c.shadowColor = 'transparent';
    }
    c.drawImage(faceUp ? faceSprite(card, w, h) : backSprite(w, h), -w / 2, -h / 2, w, h);
    if (dim) { roundRect(c, -w / 2, -h / 2, w, h, w * 0.1); c.fillStyle = 'rgba(10,30,20,0.28)'; c.fill(); }
    c.restore();
  }

  function drawSuitDisc(c, s, x, y, r, t) {
    const p = clamp(suitPulse / 0.6, 0, 1);
    const k = 1 + (1 - ease.out(p)) * 0.4;
    c.save(); c.translate(x, y); c.scale(k, k);
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.beginPath(); c.ellipse(0, r * 0.95, r * 0.9, r * 0.22, 0, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#efe9dc'); g.addColorStop(1, '#bfb5a0');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = r * 0.1; c.strokeStyle = s < 2 ? '#ff6b81' : '#7d8cff'; c.stroke();
    suitFill(c, s, 0, 0, r * 0.55);
    c.restore();
  }

  // ---------- Draw ----------
  const draw = guard((c, t) => {
    const W = Kit.W, H = Kit.H, u = L.u;
    hits = [];
    c.drawImage(table, 0, 0, W, H);
    if (state === 'menu') { drawMenu(c, t); return; }

    // Players along the top
    players.forEach((p, i) => drawPlaque(c, i, t));

    // Piles
    const dp = drawPos(), pp = discardPos();
    const deckN = deck.length;
    for (let k = Math.min(5, Math.ceil(deckN / 8)) - 1; k >= 0; k--) drawCard(c, null, dp.x - k * 1.5, dp.y - k * 2.5, 0, 1, false);
    if (!deckN) { roundRect(c, dp.x - L.cw / 2, dp.y - L.ch / 2, L.cw, L.ch, L.cw * 0.1); c.lineWidth = 3; c.setLineDash([10, 8]); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.stroke(); c.setLineDash([]); }
    const humanTurn = state === 'play' && phase === 'human' && players[turn] && players[turn].human;
    if (humanTurn && onDraw) {
      const pulse = 0.5 + Math.sin(t * 6) * 0.5;
      c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = 20 + pulse * 16; c.lineWidth = 6; c.strokeStyle = '#ffe680';
      roundRect(c, dp.x - L.cw / 2 - 8, dp.y - L.ch / 2 - 12, L.cw + 16, L.ch + 20, L.cw * 0.14); c.stroke(); c.restore();
    }
    const dl = drewCard && humanTurn ? 'Pass' : 'Draw';
    roundRect(c, dp.x - u * 1.3, dp.y + L.ch / 2 + u * 0.2, u * 2.6, u * 0.75, u * 0.37);
    c.fillStyle = humanTurn && onDraw ? '#ffd23f' : 'rgba(0,0,0,0.35)'; c.fill();
    text(c, `${dl} (${deckN})`, dp.x, dp.y + L.ch / 2 + u * 0.58, u * 0.4, humanTurn && onDraw ? '#3a2200' : 'rgba(255,255,255,0.85)', 800);
    hits.push({ x: dp.x - L.cw / 2, y: dp.y - L.ch / 2, w: L.cw, h: L.ch, fn: () => { if (humanTurn) { onDraw = true; humanDraw(); } } });
    const shown = pile.slice(-4);
    shown.forEach((card) => drawCard(c, card, pp.x, pp.y, card.tilt, 1, true));
    if (!pile.length) { roundRect(c, pp.x - L.cw / 2, pp.y - L.ch / 2, L.cw, L.ch, L.cw * 0.1); c.lineWidth = 3; c.setLineDash([10, 8]); c.strokeStyle = 'rgba(255,255,255,0.3)'; c.stroke(); c.setLineDash([]); }

    // Suit to match, and the direction of play
    if (pile.length) {
      const sx = L.cx + u * 5.6;
      text(c, 'Suit', sx, L.py - u * 1.75, u * 0.42, 'rgba(255,255,255,0.75)', 800);
      drawSuitDisc(c, curSuit, sx, L.py - u * 0.1, u * 1.05, t);
      text(c, SUIT_NAMES[curSuit], sx, L.py + u * 1.55, u * 0.42, '#ffffff', 800);
    }
    if (players.length > 2) drawDirection(c, L.cx - u * 5.6, L.py, u * 1.1, t);

    // Flying cards (under the hand)
    // The hand tray
    drawTray(c, t);
    for (const f of flyers) {
      const k = ease.inOut(clamp(f.t / f.dur, 0, 1));
      const x = lerp(f.from.x, f.to.x, k), y = lerp(f.from.y, f.to.y, k) - Math.sin(k * Math.PI) * L.u * 1.2;
      const rot = lerp(f.from.rot, f.to.rot, k) + Math.sin(k * Math.PI) * f.spin;
      const sc = lerp(f.from.sc, f.to.sc, k) * (1 + Math.sin(k * Math.PI) * 0.12);
      let face = f.faceTo, sx = 1;
      if (f.faceFrom !== f.faceTo) { sx = Math.abs(Math.cos(k * Math.PI)); face = k < 0.5 ? f.faceFrom : f.faceTo; }
      c.save(); c.translate(x, y); c.scale(Math.max(0.02, sx), 1);
      drawCard(c, f.card, 0, 0, rot, sc, face);
      c.restore();
    }

    // Status line
    if (state === 'play') {
      const p = players[turn];
      let s = '';
      if (msgT > 0 && msg) s = msg;
      else if (p && phase === 'tv') s = `${p.name} is thinking…`;
      else if (p && phase === 'human') s = onDraw ? (drewCard ? 'OK passes your turn' : 'OK draws a card') : '◀ ▶ choose a card  ·  OK play  ·  ▲▼ Draw pile';
      if (s) {
        c.font = `800 ${Math.round(u * 0.5)}px ${Kit.UI}`;
        const tw = Math.min(W - u * 2, c.measureText(s).width + u * 1.4);
        roundRect(c, W / 2 - tw / 2, u * 3.55, tw, u * 0.9, u * 0.45); c.fillStyle = 'rgba(0,0,0,0.4)'; c.fill();
        fitText(c, s, W / 2, u * 4.02, u * 0.5, '#ffffff', tw - u * 0.8, 800);
      }
    }

    if (phase === 'suit' && state === 'play') drawSuitPicker(c, t);
    if (state === 'play' && phase === 'banner') drawBanner(c, t);
    if (state === 'play' && phase === 'cover') drawCover(c, t);
    if (state === 'over') drawOver(c, t);
    text(c, Kit.muted ? '🔇' : '', W - u * 0.8, H - u * 0.6, u * 0.5, '#fff', 400);
  });

  function drawDirection(c, x, y, r, t) {
    c.save(); c.translate(x, y);
    c.rotate(t * 0.8 * dir);
    c.lineWidth = r * 0.16; c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineCap = 'round';
    for (let k = 0; k < 2; k++) {
      c.rotate(Math.PI);
      c.beginPath(); c.arc(0, 0, r, 0.15, Math.PI - 0.5); c.stroke();
      const a = dir > 0 ? Math.PI - 0.5 : 0.15;
      const ax = Math.cos(a) * r, ay = Math.sin(a) * r;
      const tx = -Math.sin(a) * dir, ty = Math.cos(a) * dir;
      c.fillStyle = 'rgba(255,255,255,0.75)';
      c.beginPath(); c.moveTo(ax + tx * r * 0.4, ay + ty * r * 0.4); c.lineTo(ax - ty * r * 0.25, ay + tx * r * 0.25); c.lineTo(ax + ty * r * 0.25, ay - tx * r * 0.25); c.closePath(); c.fill();
    }
    c.restore();
    c.lineCap = 'butt';
    text(c, 'Order', x, y + r * 1.6, L.u * 0.4, 'rgba(255,255,255,0.75)', 800);
  }

  function drawPlaque(c, i, t) {
    const p = players[i], r = plaqueRect(i), u = L.u;
    const active = state === 'play' && turn === i && phase !== 'deal';
    const win = state === 'over' && winner === i;
    c.save();
    const sc = active ? 1.04 + Math.sin(t * 4) * 0.01 : 1 + p.bump * 0.05;
    c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(sc, sc); c.translate(-r.w / 2, -r.h / 2);
    panel(c, 0, 0, r.w, r.h, u * 0.5, active || win ? p.color : 'rgba(255,255,255,0.22)', active ? shade(p.color, -0.35) : 'rgba(20,50,35,0.9)', active ? shade(p.color, -0.72) : 'rgba(5,25,15,0.92)');
    if (active) { c.lineWidth = 6 + Math.sin(t * 6) * 2; c.strokeStyle = rgba(p.color, 0.4); roundRect(c, -5, -5, r.w + 10, r.h + 10, u * 0.6); c.stroke(); }
    // avatar
    const av = r.h * 0.3, ax = u * 0.3 + av, ay = r.h * 0.5;
    const g = c.createRadialGradient(ax - av * 0.3, ay - av * 0.35, av * 0.1, ax, ay, av);
    g.addColorStop(0, shade(p.color, 0.5)); g.addColorStop(0.6, p.color); g.addColorStop(1, shade(p.color, -0.4));
    c.fillStyle = g; c.beginPath(); c.arc(ax, ay, av, 0, Math.PI * 2); c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
    drawAvatarIcon(c, p.human, ax, ay, av);
    const tx = ax + av + u * 0.3, maxW = r.w * 0.6 - tx;
    fitText(c, p.name, tx, r.h * 0.33, u * 0.6, '#ffffff', Math.max(u, maxW), 900, 'left', Kit.FONT);
    const n = p.hand.length;
    text(c, n === 1 ? '1 card!' : `${n} cards`, tx, r.h * 0.7, u * 0.42, n === 1 ? '#ffd23f' : 'rgba(255,255,255,0.8)', 800, 'left');
    c.restore();
    // a small fan of card backs
    const d = plaqueDest(i), sw = L.cw * 0.34, sh = L.ch * 0.34, m = Math.min(n, 9);
    const back = backSprite(L.cw, L.ch);
    const spread = m > 1 ? Math.min(sw * 0.28, (r.w * 0.33 - sw) / (m - 1)) : 0;
    for (let k = 0; k < m; k++) {
      const a = (k - (m - 1) / 2) * Math.min(0.13, 0.8 / m);
      c.save(); c.translate(d.x + (k - (m - 1) / 2) * spread, d.y + Math.abs(a) * sw * 0.3); c.rotate(a);
      c.drawImage(back, -sw / 2, -sh / 2, sw, sh);
      c.restore();
    }
  }
  function drawAvatarIcon(c, human, x, y, r) {
    c.save(); c.fillStyle = 'rgba(255,255,255,0.95)'; c.strokeStyle = 'rgba(255,255,255,0.95)';
    if (human) {
      c.beginPath(); c.arc(x, y - r * 0.22, r * 0.28, 0, Math.PI * 2); c.fill();
      c.beginPath(); c.ellipse(x, y + r * 0.45, r * 0.48, r * 0.3, 0, Math.PI, 0); c.fill();
    } else {
      roundRect(c, x - r * 0.5, y - r * 0.38, r, r * 0.66, r * 0.12); c.lineWidth = r * 0.12; c.stroke();
      c.beginPath(); c.moveTo(x - r * 0.22, y + r * 0.5); c.lineTo(x + r * 0.22, y + r * 0.5); c.stroke();
      c.beginPath(); c.arc(x - r * 0.18, y - r * 0.06, r * 0.08, 0, Math.PI * 2); c.arc(x + r * 0.18, y - r * 0.06, r * 0.08, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  }

  function drawTray(c, t) {
    const v = viewer(), u = L.u;
    if (state !== 'play' && state !== 'over') return;
    if (v < 0 || !players[v]) {
      if (players.length && state === 'play') {
        const p = players[turn];
        const s = humans === 0 ? 'TV players are playing' : p && p.human ? 'Cards are hidden' : 'Hands are hidden while the remote is passed';
        text(c, s, L.cx, L.hy, u * 0.5, 'rgba(255,255,255,0.45)', 700);
      }
      return;
    }
    const p = players[v], h = p.hand, n = h.length;
    const myTurn = state === 'play' && phase === 'human' && turn === v;
    // name tag
    const lbl = humans === 1 ? 'Your cards' : `${p.name}'s cards`;
    text(c, lbl, u * 1.2, L.hy - L.ch / 2 - u * 0.75, u * 0.45, rgba(p.color, 1), 900, 'left');
    let focusDraw = null;
    h.forEach((card, i) => {
      const tp = trayPos(i, n), cv = cardView.get(card.id) || { x: tp.x, lift: 0 };
      const playable = myTurn && canPlay(card) && (!drewCard || card === drewCard);
      const glow = skill === 0 && playable ? 'rgba(255,215,64,0.95)' : null;
      const dim = skill === 0 && myTurn && !playable;
      const lift = cv.lift * u * 1.0 + (glow ? Math.sin(t * 4 + i) * u * 0.04 : 0);
      let x = cv.x;
      if (myTurn && i === focus && !onDraw && nopeT > 0) x += Math.sin(nopeT * 60) * u * 0.15;
      const item = () => drawCard(c, card, x, tp.y - lift, tp.rot * (1 - cv.lift), 1 + cv.lift * 0.12, true, glow, dim);
      if (myTurn && i === focus && !onDraw) focusDraw = { item, x, y: tp.y - lift };
      else item();
      hits.push({ x: x - L.cw * 0.42, y: tp.y - L.ch / 2 - lift, w: L.cw * 0.84, h: L.ch, fn: () => { if (myTurn) { if (focus === i && !onDraw) tryPlay(); else { focus = i; onDraw = false; Kit.sfx.move(); } } } });
    });
    if (focusDraw) {
      focusDraw.item();
      const pulse = 0.5 + Math.sin(t * 6) * 0.5;
      c.save(); c.translate(focusDraw.x, focusDraw.y);
      c.shadowColor = '#ffffff'; c.shadowBlur = 14 + pulse * 10; c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,0.95)';
      const w = L.cw * 1.12, hh = L.ch * 1.12;
      roundRect(c, -w / 2 - 4, -hh / 2 - 4, w + 8, hh + 8, L.cw * 0.14); c.stroke();
      c.restore();
    }
  }

  function drawBanner(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const k = phaseT, a = k < 0.25 ? ease.out(k / 0.25) : k > 0.7 ? 1 - ease.inOut(clamp((k - 0.7) / 0.2, 0, 1)) : 1;
    const y = H * 0.5, bh = u * 2.2;
    c.save();
    c.globalAlpha = a;
    const g = c.createLinearGradient(0, y - bh / 2, 0, y + bh / 2);
    g.addColorStop(0, shade(bannerCol, 0.1)); g.addColorStop(1, shade(bannerCol, -0.5));
    c.fillStyle = g; c.fillRect(0, y - bh / 2, W, bh);
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(0, y - bh / 2, W, 3); c.fillRect(0, y + bh / 2 - 3, W, 3);
    const x = W / 2 + (1 - a) * W * 0.3 * (k < 0.5 ? -1 : 1);
    outlined(c, bannerName, x, y, u * 1.2, '#ffffff', shade(bannerCol, 0.55));
    c.restore();
  }

  function drawCover(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u, p = players[turn];
    if (!p) return;
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, shade(p.color, -0.45)); g.addColorStop(1, shade(p.color, -0.85));
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // a remote control, gently swinging
    c.save(); c.translate(W / 2, H * 0.3); c.rotate(Math.sin(t * 2) * 0.12);
    roundRect(c, -u * 0.9, -u * 2.2, u * 1.8, u * 4.4, u * 0.8);
    const rg = c.createLinearGradient(-u, 0, u, 0); rg.addColorStop(0, '#3a3f55'); rg.addColorStop(0.5, '#5c6380'); rg.addColorStop(1, '#2a2e40');
    c.fillStyle = rg; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.4)'; c.stroke();
    c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, -u * 0.6, u * 0.42, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.7)';
    for (let k = 0; k < 6; k++) { c.beginPath(); c.arc((k % 2 ? 0.35 : -0.35) * u, u * (0.5 + Math.floor(k / 2) * 0.5), u * 0.13, 0, Math.PI * 2); c.fill(); }
    c.restore();
    outlined(c, `Pass the remote to ${p.name}`, W / 2, H * 0.56, u * 1.15, '#ffffff', shade(p.color, 0.5));
    text(c, 'Everyone else, look away from the screen!', W / 2, H * 0.66, u * 0.6, 'rgba(255,255,255,0.9)', 800);
    const pulse = 0.6 + Math.sin(t * 5) * 0.4;
    c.globalAlpha = pulse;
    text(c, Kit.touchFirst() ? 'Tap when ready' : 'Press OK when ready', W / 2, H * 0.77, u * 0.7, '#ffd23f', 900);
    c.globalAlpha = 1;
    hits.push({ x: 0, y: 0, w: W, h: H, fn: () => { if (phase === 'cover') { Kit.sfx.pick(); revealed = turn; startActing(); } } });
  }

  function drawSuitPicker(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(0,10,5,0.55)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W - u, u * 17), ph = u * 6.6, px = (W - pw) / 2, py = H * 0.5 - ph / 2;
    panel(c, px, py, pw, ph, u * 0.6, '#ffd23f', '#2a6b4f', '#0c3123');
    outlined(c, 'Wild 8! Pick the next suit', W / 2, py + u * 0.95, u * 0.85, '#ffffff', '#ffe680');
    const bw = (pw - u * 2.5) / 4, by = py + u * 1.9, bh = u * 3.6;
    for (let s = 0; s < 4; s++) {
      const bx = px + u * 0.8 + s * (bw + u * 0.3), on = s === suitIx;
      const k = on ? 1.07 + Math.sin(t * 5) * 0.02 : 1;
      c.save(); c.translate(bx + bw / 2, by + bh / 2); c.scale(k, k);
      roundRect(c, -bw / 2, -bh / 2, bw, bh, u * 0.4);
      const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
      g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e2dacb');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 6 : 2; c.strokeStyle = on ? '#ffd23f' : 'rgba(0,0,0,0.3)'; c.stroke();
      suitFill(c, s, 0, -bh * 0.1, Math.min(bw, bh) * 0.28);
      text(c, SUIT_NAMES[s], 0, bh * 0.34, u * 0.42, s < 2 ? RED : BLACK, 900);
      c.restore();
      hits.push({ x: bx, y: by, w: bw, h: bh, fn: () => { if (phase === 'suit') { setPhase('anim'); chooseSuit(s); } } });
    }
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    c.fillStyle = 'rgba(0,15,8,0.45)'; c.fillRect(0, 0, W, H);
    const pw = Math.min(W - u, u * 21), ph = Math.min(H - u * 0.6, u * 16.6), px = (W - pw) / 2, py = (H - ph) / 2;
    const a = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(W / 2, H / 2); c.scale(a, a); c.translate(-W / 2, -H / 2);
    panel(c, px, py, pw, ph, u * 0.7, '#ffd23f', 'rgba(25,85,58,0.96)', 'rgba(8,40,26,0.97)');
    // A fan of eights above the title
    const demo = [{ r: 8, s: 0, id: 7 }, { r: 8, s: 2, id: 33 }, { r: 8, s: 1, id: 20 }, { r: 8, s: 3, id: 46 }];
    demo.forEach((cd, i) => {
      const a2 = (i - 1.5) * 0.18 + Math.sin(t * 1.5 + i) * 0.02;
      drawCard(c, cd, W / 2 + (i - 1.5) * u * 1.25, py + u * 2.2 + Math.abs(i - 1.5) * u * 0.15, a2, 0.55, true);
    });
    outlined(c, 'Crazy Eights', W / 2, py + u * 4.3, u * 1.35, '#fff6c2', '#ffb703');
    text(c, 'Match the suit or number. 8 is wild! First to empty their hand wins.', W / 2, py + u * 5.3, u * 0.45, 'rgba(255,255,255,0.85)', 700);
    const lx = px + u * 0.9, rowH = u * 1.15;
    const rows = [py + u * 6.65, py + u * 8.55, py + u * 10.75, py + u * 12.65];
    const label = (i, s) => text(c, s, lx, rows[i], u * 0.52, menuRow === i ? '#ffe36b' : '#ffffff', 900, 'left');
    const ox = px + u * 5.6, avail = pw - (ox - px) - u * 0.8;
    // players
    label(0, 'Players');
    for (let n = 2; n <= 4; n++) {
      const w = u * 2.0, x = ox + (n - 2) * (w + u * 0.3);
      pill(c, x, rows[0] - rowH / 2, w, rowH, String(n), nPlayers === n, menuRow === 0, t);
      hits.push({ x, y: rows[0] - rowH / 2, w, h: rowH, fn: () => { nPlayers = n; fixSeats(); seatIx = Math.min(seatIx, n - 1); menuRow = 0; saveSetup(); Kit.sfx.move(); } });
    }
    // seats
    label(1, 'Seats');
    const sw = Math.min(u * 3.3, (avail - u * 0.3 * 3) / 4), sh = u * 1.5;
    for (let i = 0; i < nPlayers; i++) {
      const x = ox + i * (sw + u * 0.3), y = rows[1] - sh / 2;
      const on = menuRow === 1 && seatIx === i;
      const k = on ? 1.06 + Math.sin(t * 5) * 0.015 : 1;
      c.save(); c.translate(x + sw / 2, y + sh / 2); c.scale(k, k);
      roundRect(c, -sw / 2, -sh / 2, sw, sh, u * 0.35);
      const g = c.createLinearGradient(0, -sh / 2, 0, sh / 2);
      g.addColorStop(0, shade(COLORS[i], 0.15)); g.addColorStop(1, shade(COLORS[i], -0.5));
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 5 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.35)'; c.stroke();
      drawAvatarIcon(c, seatHuman[i], -sw * 0.3, 0, sh * 0.32);
      fitText(c, seatHuman[i] ? 'Person' : 'TV', sw * 0.12, -sh * 0.13, sh * 0.3, '#ffffff', sw * 0.55, 900);
      fitText(c, 'Seat ' + (i + 1), sw * 0.12, sh * 0.22, sh * 0.2, 'rgba(255,255,255,0.8)', sw * 0.55, 700);
      c.restore();
      hits.push({ x, y, w: sw, h: sh, fn: () => { menuRow = 1; seatIx = i; toggleSeat(i); } });
    }
    text(c, menuRow === 1 ? 'OK switches Person / TV' : '', ox + avail / 2, rows[1] + sh / 2 + u * 0.35, u * 0.36, 'rgba(255,255,255,0.7)', 700);
    // skill
    label(2, 'Skill');
    const kw = Math.min(u * 3.6, (avail - u * 0.6) / 3);
    SKILLS.forEach((s, i) => {
      const x = ox + i * (kw + u * 0.3);
      pill(c, x, rows[2] - rowH / 2, kw, rowH, s.name, skill === i, menuRow === 2, t);
      hits.push({ x, y: rows[2] - rowH / 2, w: kw, h: rowH, fn: () => { skill = i; menuRow = 2; saveSetup(); Kit.sfx.move(); } });
    });
    text(c, SKILLS[skill].tip, ox, rows[2] + rowH / 2 + u * 0.38, u * 0.38, 'rgba(255,255,255,0.75)', 700, 'left');
    // play
    const bw = u * 5.4, bh = u * 1.25, bx = W / 2 - bw / 2, by = rows[3] - bh / 2 + u * 0.3;
    const on = menuRow === 3;
    const kb = on ? 1.08 + Math.sin(t * 6) * 0.025 : 1;
    c.save(); c.translate(W / 2, by + bh / 2); c.scale(kb, kb);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const g = c.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, '#ffe680'); g.addColorStop(1, '#f08c00');
    c.fillStyle = g; c.fill();
    c.lineWidth = on ? 5 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(80,40,0,0.6)'; c.stroke();
    outlined(c, '▶  Deal', 0, bh * 0.03, bh * 0.55, '#ffffff', '#fff1c2');
    c.restore();
    hits.push({ x: bx, y: by, w: bw, h: bh, fn: () => startGame() });
    text(c, Kit.touchFirst() ? 'Tap to choose' : '▲▼ choose  ·  ◀ ▶ change  ·  OK  ·  Back for games', W / 2, py + ph - u * 0.85, u * 0.4, 'rgba(255,255,255,0.75)', 700);
    text(c, `★ Wins: ${wins}`, W / 2, py + ph - u * 0.35, u * 0.42, '#ffd23f', 800);
    c.restore();
  }

  function drawOver(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp((stateT - overT) / 0.45, 0, 1);
    c.fillStyle = `rgba(0,15,8,${0.6 * a})`; c.fillRect(0, 0, W, H);
    const p = players[winner];
    if (!p) return;
    c.save(); c.translate(W / 2, H / 2); const k = ease.back(a); c.scale(k, k);
    const pw = Math.min(W - u, u * 15), ph = u * (6.4 + standings.length * 1.05);
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.7, '#ffd23f', shade(p.color, -0.3), shade(p.color, -0.75));
    const ttl = p.name === 'You' ? 'You win!' : `${p.name} wins!`;
    outlined(c, ttl, 0, -ph / 2 + u * 1.1, u * 1.3, '#ffffff', '#ffe680');
    standings.forEach((i, n) => {
      const q = players[i], y = -ph / 2 + u * 2.3 + n * u * 1.05;
      roundRect(c, -pw * 0.4, y, pw * 0.8, u * 0.9, u * 0.3);
      c.fillStyle = n === 0 ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.08)'; c.fill();
      c.fillStyle = q.color; c.beginPath(); c.arc(-pw * 0.4 + u * 0.55, y + u * 0.45, u * 0.28, 0, Math.PI * 2); c.fill();
      text(c, (n === 0 ? '🏆 ' : '') + q.name, -pw * 0.4 + u * 1.1, y + u * 0.45, u * 0.48, '#ffffff', 900, 'left');
      text(c, q.hand.length ? `${q.hand.length} left` : 'Out!', pw * 0.37, y + u * 0.45, u * 0.42, 'rgba(255,255,255,0.8)', 800, 'right');
    });
    const by = ph / 2 - u * 2.6;
    text(c, `★ Wins: ${wins}`, 0, by, u * 0.5, '#ffd23f', 800);
    const ready = stateT - overT > 1.2;
    c.globalAlpha = ready ? 1 : 0.45;
    ['Play again', 'Menu'].forEach((s, i) => {
      const bw = u * 4.4, bh = u * 1.05, x = (i ? 1 : -1) * (bw / 2 + u * 0.25) - bw / 2, y = ph / 2 - u * 1.6;
      const on = overBtn === i;
      roundRect(c, x, y, bw, bh, bh / 2);
      const g = c.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, on ? '#ffe680' : 'rgba(255,255,255,0.18)'); g.addColorStop(1, on ? '#f08c00' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.3)'; c.stroke();
      text(c, s, x + bw / 2, y + bh / 2, u * 0.48, on ? '#3a2200' : '#fff', 900);
      hits.push({ x: W / 2 + x * k, y: H / 2 + y * k, w: bw * k, h: bh * k, fn: () => { if (stateT - overT > 1.2) { if (i === 0) startGame(); else toMenu(); } } });
    });
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  deck = makeDeck();
  window.__crazyeights = { get state() { return state; }, get phase() { return phase; }, get turn() { return turn; }, get extra() { return { games: gamesDone, cards: players.map((p) => p.hand.length), deck: deck.length, pile: pile.length, flyers: flyers.length }; } };
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (AUTO) { nPlayers = 4; setTimeout(() => startGame(), 300); }
  if (wins > 0) Kit.record(ID, wins);
})();
