// Act It Out: charades for the whole room. 2 to 4 teams (or 1 team for practice) take turns: one person
// acts the word shown big on the TV - no talking! - while their team shouts guesses before the timer runs out.
// Remote (the actor holds it): OK = Got it (+1), Right = Skip, Left = undo the last one.
// Beginner: simple single words, 90 seconds and free skips; Normal: 60 s, 3 free skips; Hard: 45 s and each
// skip costs a point. Rounds: 3, 5 or 7; every team acts once per round. Record = best score in one turn.
'use strict';

(() => {
  const { ease, shade, roundRect, clamp, lerp, rgba } = Kit;
  const ID = 'actitout';
  const AUTO = /auto/.test(location.hash);
  const SPEED = AUTO ? 4 : 1;
  const TEAM_COLORS = ['#ff4d6d', '#3d8bff', '#2ed573', '#ffb020'];
  const SKILLS = [
    { name: 'Beginner', tip: 'Simple single words  ·  90 seconds  ·  free skips', time: 90, freeSkips: 99, cost: 0 },
    { name: 'Normal', tip: 'Words and phrases  ·  60 seconds  ·  3 free skips', time: 60, freeSkips: 3, cost: 1 },
    { name: 'Hard', tip: 'Words and phrases  ·  45 seconds  ·  each skip costs 1 point', time: 45, freeSkips: 0, cost: 1 },
  ];
  const ROUNDS = [3, 5, 7];
  let warned = false;
  const guard = (fn) => (...a) => { try { return fn(...a); } catch (e) { if (!warned) { warned = true; console.error(e); } } };

  // ---------- Words: easy = simple single words (Beginner), more = harder words and phrases ----------
  const W = (s) => s.split('|').map((x) => x.trim()).filter(Boolean);
  const CATS = [
    { name: 'Animals', icon: '🐾',
      easy: W('cat|dog|fish|bird|frog|duck|cow|pig|horse|sheep|lion|tiger|bear|monkey|elephant|snake|rabbit|mouse|chicken|owl|penguin|kangaroo|giraffe|crab|bee|butterfly|spider|dolphin|shark|turtle|zebra|camel|goat|bat|gorilla|octopus|parrot|panda'),
      more: W('flamingo|crocodile|jellyfish|squirrel|peacock|hedgehog|seal|sloth|lobster|woodpecker|rooster|chameleon|ostrich|koala|polar bear|puppy wagging its tail|a cat chasing a mouse|a bird building a nest|a snail in a hurry|a dog chasing its tail|a frog catching a fly|an elephant taking a bath|a monkey eating a banana|a penguin sliding on ice') },
    { name: 'Actions', icon: '🏃',
      easy: W('run|jump|swim|sleep|eat|dance|sing|read|write|clap|laugh|cry|sneeze|yawn|wave|hug|climb|cook|drive|fly|skip|kick|throw|catch|paint|brush|wash|sweep|knock|push|pull|whisper|shiver|hop'),
      more: W('brushing your teeth|tying your shoes|walking a dog|juggling|blowing bubbles|building a sandcastle|riding a bike|flying a kite|making a sandwich|changing a light bulb|hula hooping|ice skating|rowing a boat|blowing out candles|climbing a ladder|carrying heavy bags|taking a photo|opening a present|popping a balloon|walking on ice|wrapping a gift|putting on a tight sweater|chasing a bus|feeding the ducks|washing a car|planting a seed|playing the drums|walking in deep snow|catching a butterfly|doing the dishes') },
    { name: 'Jobs', icon: '👷',
      easy: W('doctor|teacher|chef|farmer|pilot|firefighter|nurse|dentist|painter|singer|dancer|baker|builder|clown|magician|astronaut|artist|waiter|vet|plumber|mechanic|gardener|librarian|photographer|lifeguard|hairdresser|scientist|zookeeper|referee|detective|judge|juggler|tailor|cowboy'),
      more: W('bus driver|ice cream seller|window cleaner|lion tamer|deep sea diver|delivery driver|tour guide|orchestra conductor|crossing guard|news reporter|weather presenter|mail carrier|police officer|train driver|ballet dancer|rock star|taxi driver|circus acrobat|football coach|pizza maker|sculptor|beekeeper|knight in armour|ship captain') },
    { name: 'Sports', icon: '⚽',
      easy: W('soccer|tennis|golf|boxing|skiing|surfing|swimming|bowling|karate|hockey|baseball|basketball|running|cycling|archery|diving|rowing|skating|wrestling|fencing|volleyball|cricket|rugby|badminton|sailing|gymnastics|yoga|skateboarding|snowboarding'),
      more: W('penalty kick|high jump|long jump|table tennis|water skiing|horse riding|relay race|slam dunk|figure skating|weight lifting|synchronized swimming|tug of war|hurdles|javelin throw|sack race|egg and spoon race|goalkeeper diving|bungee jumping|rock climbing|scoring a goal|a hole in one|ten pin strike|marathon finish line|limbo dancing') },
    { name: 'Food', icon: '🍕',
      easy: W('pizza|banana|apple|cake|cookie|popcorn|soup|sandwich|burger|carrot|egg|cheese|bread|lemon|grapes|corn|orange|pancake|cereal|noodles|watermelon|candy|chocolate|pie|salad|taco|sausage|toast|milk|juice|honey|pretzel|donut|strawberry|pineapple|coconut|potato|onion|broccoli'),
      more: W('spaghetti and meatballs|hot chocolate|corn on the cob|birthday cake|ice cream cone|a very spicy pepper|peeling a banana|chewing gum|cotton candy|fried egg|peanut butter sandwich|cup of tea|bowl of cereal|slurping noodles|a sour lemon|melting ice cream|popcorn at the movies|jelly that wobbles|a hot potato|making pancakes|sushi|french fries|a giant sandwich') },
    { name: 'Things at Home', icon: '🏠',
      easy: W('chair|bed|door|window|lamp|clock|phone|television|sofa|bath|shower|toothbrush|mirror|fridge|oven|broom|umbrella|pillow|blanket|keys|cup|plate|spoon|fork|toaster|kettle|book|stairs|computer|camera|piano|guitar|scissors|hairdryer|candle|curtain|ladder|bucket'),
      more: W('washing machine|alarm clock|rocking chair|garden hose|light switch|ironing board|bunk bed|doorbell|piggy bank|teddy bear|jigsaw puzzle|coat hanger|laundry basket|vacuum cleaner|remote control|rubber duck|cuckoo clock|squeaky door|dripping tap|bubble bath|board game|fish tank|ceiling fan|garden gnome') },
    { name: 'Places', icon: '🗺️',
      easy: W('beach|school|zoo|park|farm|castle|jungle|desert|island|library|hospital|airport|museum|circus|kitchen|garden|forest|mountain|volcano|cave|space|playground|bakery|cinema|restaurant|supermarket|igloo|lighthouse|pool|bridge|station'),
      more: W('haunted house|the North Pole|a busy train station|under the sea|a theme park|a snowy mountain top|a pirate ship|a dentist waiting room|a birthday party|a car wash|an elevator|a bowling alley|a hot air balloon|a submarine|a campfire|a roller coaster|a crowded bus|a spooky forest at night|the top of a tall tower|a rocket ship|a tree house|a carnival|a magic show') },
    { name: 'Feelings', icon: '😊',
      easy: W('happy|sad|angry|scared|tired|excited|bored|surprised|sleepy|hungry|cold|hot|shy|proud|silly|nervous|grumpy|confused|brave|dizzy|lonely|calm|worried|sick|thirsty|ticklish|embarrassed|curious|cheerful'),
      more: W('so excited you cannot sit still|scared of a spider|lost in a crowd|waiting for a long time|stepping on a toy|winning a prize|very very sleepy|trying not to laugh|a brain freeze|smelling something stinky|hearing a strange noise|tasting something yucky|getting a surprise gift|a bad hair day|stuck in the rain|so full you might pop|scared on a roller coaster|missing the bus') },
    { name: 'Movie Moments', icon: '🎬',
      easy: W('superhero|dragon|wizard|mermaid|robot|alien|pirate|knight|princess|monster|spy|treasure|dinosaur|genie|unicorn|giant|fairy|ghost|snowman|ninja'),
      more: W('lost in the jungle|a space adventure|the haunted castle|a pirate treasure hunt|the dinosaur escape|a robot that learns to dance|the giant who was afraid of mice|a race to the moon|the magic carpet ride|the great cake contest|a superhero saves the city|the toy that came to life|the snowman who melted|attack of the giant bugs|a dragon who cannot breathe fire|shipwrecked on an island|the time machine|the underwater kingdom|the secret agent mission|escape from the volcano|the runaway train|the talking dog|the shrinking family|the monster under the bed|the lost puppy finds home|the knight and the friendly dragon|the alien who wanted pizza|a wizard school adventure|the race car champion|the invisible kid') },
  ];

  // ---------- Setup (remembered) ----------
  const saved = Kit.store.get(ID + '.setup', null) || {};
  let teams = clamp((saved.teams | 0) || 2, 1, 4);
  let roundsIx = clamp(saved.rounds | 0, 0, 2);
  let catIx = clamp(saved.cat | 0, 0, CATS.length); // 0 = all
  let skill = clamp(Kit.store.get(ID + '.skill', 0) | 0, 0, 2);
  let best = Kit.store.get(ID + '.best', 0) | 0;
  function saveSetup() { Kit.store.set(ID + '.setup', { teams, rounds: roundsIx, cat: catIx }); Kit.store.set(ID + '.skill', skill); }

  // ---------- State ----------
  // state: 'menu', 'ready', 'count', 'play', 'summary', 'over'
  let state = 'menu', stateT = 0, menuRow = 4, overBtn = 0;
  let scores = [], team = 0, round = 1, nRounds = 3, deck = [], word = null, timeLeft = 60, turnScore = 0, skipsUsed = 0;
  let log = [], history = [], cardAnim = 0, outgoing = [], newBest = false, gamesDone = 0, autoT = 0, lastTick = -1;

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const x = a[i]; a[i] = a[j]; a[j] = x; } return a; }
  function buildDeck() {
    const cats = catIx === 0 ? CATS : [CATS[catIx - 1]];
    const out = [];
    cats.forEach((c) => {
      c.easy.forEach((w) => out.push({ w, cat: c }));
      if (skill > 0) c.more.forEach((w) => out.push({ w, cat: c }));
    });
    return shuffle(out);
  }
  const nextWord = () => { if (!deck.length) deck = buildDeck(); return deck.pop(); };
  const setState = (s) => { state = s; stateT = 0; };
  const teamName = (i) => `Team ${i + 1}`;
  const S = () => SKILLS[skill];

  // ---------- Sounds ----------
  const sndDing = () => { Kit.tone(1318.5, { type: 'sine', dur: 0.5, vol: 0.2 }); Kit.tone(1975.5, { type: 'sine', dur: 0.4, vol: 0.08, at: 0.03 }); Kit.tone(987.8, { type: 'triangle', dur: 0.25, vol: 0.08 }); };
  const sndSkip = () => { Kit.noise({ dur: 0.22, vol: 0.12, freq: 1800, q: 0.7, sweep: 0.4 }); Kit.tone(420, { type: 'triangle', dur: 0.14, vol: 0.08, slide: 0.6 }); };
  const sndBuzz = () => { Kit.tone(140, { type: 'sawtooth', dur: 0.7, vol: 0.12 }); Kit.tone(147, { type: 'square', dur: 0.7, vol: 0.06 }); };
  const sndTick = (hi) => Kit.tone(hi ? 1200 : 900, { type: 'square', dur: 0.04, vol: 0.06 });
  const sndCount = (go) => Kit.tone(go ? 1046.5 : 523.25, { type: 'triangle', dur: go ? 0.45 : 0.2, vol: 0.18 });

  // ---------- Flow ----------
  function startGame() {
    saveSetup();
    nRounds = ROUNDS[roundsIx];
    scores = Array(teams).fill(0);
    team = 0; round = 1; deck = buildDeck(); newBest = false;
    setState('ready');
    Kit.sfx.pick();
  }
  function toMenu() { setState('menu'); }
  function startCountdown() { setState('count'); sndCount(false); lastTick = 3; }
  function startTurn() {
    setState('play');
    timeLeft = S().time; turnScore = 0; skipsUsed = 0; log = []; history = []; outgoing = [];
    word = nextWord(); cardAnim = 0; lastTick = -1; autoT = 0;
    sndCount(true);
  }
  function gotIt() {
    if (state !== 'play' || !word) return;
    turnScore++;
    history.push({ type: 'got', word, cost: 0 });
    log.push({ w: word.w, got: true });
    const cx = Kit.W / 2, cy = L.cardY;
    Kit.burst(cx, cy, '#7dffb0', 26, 1.1); Kit.burst(cx, cy, '#ffd23f', 18, 0.9); Kit.burst(cx, cy, TEAM_COLORS[team], 12, 0.8);
    Kit.float('+1', cx + L.u * 7, cy - L.u * 1.8, { color: '#7dffb0', size: L.u * 1.4, life: 1 });
    sndDing();
    outgoing.push({ word, t: 0, dir: -1, got: true });
    word = nextWord(); cardAnim = 0;
  }
  function skipIt() {
    if (state !== 'play' || !word) return;
    let cost = 0;
    skipsUsed++;
    if (skipsUsed > S().freeSkips && turnScore > 0) { cost = S().cost; turnScore -= cost; }
    history.push({ type: 'skip', word, cost });
    log.push({ w: word.w, got: false });
    sndSkip();
    if (cost) Kit.float(`-${cost}`, Kit.W / 2 + L.u * 5, L.cardY - L.u * 2, { color: '#ff8a8a', size: L.u * 1.1 });
    outgoing.push({ word, t: 0, dir: 1, got: false });
    word = nextWord(); cardAnim = 0;
  }
  function undo() {
    if (state !== 'play' || !history.length) { Kit.sfx.nope(); return; }
    const h = history.pop();
    log.pop();
    if (h.type === 'got') turnScore--; else { turnScore += h.cost; skipsUsed--; }
    if (word) deck.push(word);
    word = h.word; cardAnim = 0;
    Kit.tone(660, { type: 'triangle', dur: 0.12, vol: 0.12, slide: 0.6 });
    Kit.float('Undo', Kit.W / 2, L.cardY - L.u * 2.4, { color: '#c9d6ff', size: L.u * 0.8 });
  }
  function timeUp() {
    sndBuzz();
    Kit.shake(6, 0.3);
    scores[team] += turnScore;
    newBest = false;
    if (turnScore > best) {
      best = turnScore; newBest = true;
      Kit.store.set(ID + '.best', best);
      Kit.record(ID, best);
    }
    if (word) deck.push(word);
    word = null;
    setState('summary');
    if (newBest || turnScore >= 5) { Kit.confetti(newBest ? 120 : 60); Kit.sfx.win(); }
  }
  function afterSummary() {
    if (team < teams - 1) { team++; setState('ready'); return; }
    if (round < nRounds) { round++; team = 0; setState('ready'); return; }
    gamesDone++;
    setState('over'); overBtn = 0;
    Kit.confetti(180); Kit.sfx.win();
  }

  // ---------- Keys and taps ----------
  const ROWS = 5; // teams, rounds, skill, category, play
  function menuKey(k) {
    if (k === 'up') { menuRow = (menuRow + ROWS - 1) % ROWS; Kit.sfx.move(); return; }
    if (k === 'down') { menuRow = (menuRow + 1) % ROWS; Kit.sfx.move(); return; }
    if (k === 'ok') { startGame(); return; }
    const d = k === 'left' ? -1 : k === 'right' ? 1 : 0;
    if (!d) return;
    if (menuRow === 0) teams = clamp(teams + d, 1, 4);
    else if (menuRow === 1) roundsIx = clamp(roundsIx + d, 0, 2);
    else if (menuRow === 2) skill = clamp(skill + d, 0, 2);
    else if (menuRow === 3) catIx = (catIx + d + CATS.length + 1) % (CATS.length + 1);
    else return;
    Kit.sfx.move(); saveSetup();
  }
  Kit.onKeys(guard((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (state === 'menu') { menuKey(k); return; }
    if (state === 'ready') { if (k === 'ok') startCountdown(); return; }
    if (state === 'count') return;
    if (state === 'play') {
      if (stateT < 0.25) return;
      if (k === 'ok') gotIt();
      else if (k === 'right') skipIt();
      else if (k === 'left') undo();
      return;
    }
    if (state === 'summary') { if (k === 'ok' && stateT > 1) afterSummary(); return; }
    if (state === 'over') {
      if (stateT < 1.2) return;
      if (k === 'left' || k === 'right' || k === 'up' || k === 'down') { overBtn = 1 - overBtn; Kit.sfx.move(); }
      else if (k === 'ok') { if (overBtn === 0) startGame(); else toMenu(); }
    }
  }));
  const inside = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  let hits = [];
  Kit.onPointer({ down: guard((e) => { for (let i = hits.length - 1; i >= 0; i--) if (inside(e, hits[i])) { hits[i].fn(); return; } }) });
  let hidden = false;
  document.addEventListener('visibilitychange', () => { hidden = document.hidden; });

  // ---------- Update ----------
  const update = guard((rdt) => {
    if (hidden) return;
    const dt = rdt * SPEED;
    stateT += dt;
    cardAnim = Math.min(1, cardAnim + rdt * 3.2);
    for (let i = outgoing.length - 1; i >= 0; i--) { outgoing[i].t += rdt; if (outgoing[i].t > 0.6) outgoing.splice(i, 1); }
    if (state === 'count') {
      const n = 3 - Math.floor(stateT);
      if (n !== lastTick && n > 0) { lastTick = n; sndCount(false); }
      if (stateT >= 3) startTurn();
    } else if (state === 'play') {
      timeLeft -= dt;
      const s = Math.ceil(timeLeft);
      if (s !== lastTick && s <= 10 && s > 0) { lastTick = s; sndTick(s <= 5); }
      if (timeLeft <= 0) { timeLeft = 0; timeUp(); return; }
      if (AUTO) { autoT += dt; if (autoT > 3) { autoT = 0; const r = Math.random(); if (r < 0.65) gotIt(); else if (r < 0.92) skipIt(); else undo(); } }
    } else if (AUTO) {
      if (state === 'ready' && stateT > 1.5) startCountdown();
      else if (state === 'summary' && stateT > 2.5) afterSummary();
      else if (state === 'over' && stateT > 4) startGame();
    }
  });

  // ---------- Layout and the stage ----------
  let L = { u: 40, cardY: 400 };
  const stage = document.createElement('canvas');
  function layout(w, h) {
    if (!w || !h) return;
    const u = Math.min(w / 32, h / 18);
    L = { u, cardY: h * 0.47, W: w, H: h };
    drawStage(w, h);
  }
  Kit.onResize(layout);

  // A theatre stage: velvet curtains, a wooden floor and footlights; drawn once per size.
  function drawStage(w, h) {
    stage.width = Math.max(1, Math.round(w)); stage.height = Math.max(1, Math.round(h));
    const c = stage.getContext('2d'), u = L.u;
    let g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2a0f45'); g.addColorStop(0.7, '#14062a'); g.addColorStop(1, '#0a0318');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // back wall glow
    g = c.createRadialGradient(w / 2, h * 0.42, u, w / 2, h * 0.45, w * 0.55);
    g.addColorStop(0, 'rgba(255,190,120,0.22)'); g.addColorStop(1, 'rgba(255,190,120,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // floor
    const fy = h * 0.8;
    g = c.createLinearGradient(0, fy, 0, h);
    g.addColorStop(0, '#8a4f22'); g.addColorStop(1, '#3d1f08');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, h); c.lineTo(w * 0.06, fy); c.lineTo(w * 0.94, fy); c.lineTo(w, h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2;
    for (let k = 1; k < 14; k++) { const x = (k / 14) * w; c.beginPath(); c.moveTo(lerp(w * 0.06, w * 0.94, k / 14), fy); c.lineTo(x, h); c.stroke(); }
    c.fillStyle = 'rgba(255,220,160,0.25)'; c.fillRect(w * 0.06, fy, w * 0.88, 3);
    // curtains
    const curtain = (x0, x1, flip) => {
      const folds = 7;
      for (let k = 0; k < folds; k++) {
        const a = lerp(x0, x1, k / folds), b = lerp(x0, x1, (k + 1) / folds);
        const cg = c.createLinearGradient(a, 0, b, 0);
        cg.addColorStop(0, '#5a0618'); cg.addColorStop(0.45, '#c41a3a'); cg.addColorStop(0.6, '#e0324f'); cg.addColorStop(1, '#5a0618');
        c.fillStyle = cg;
        c.beginPath(); c.moveTo(a, 0); c.lineTo(b, 0);
        const sway = (flip ? -1 : 1) * u * 0.6 * (k / folds);
        c.lineTo(b + sway, h); c.lineTo(a + sway, h); c.closePath(); c.fill();
      }
    };
    curtain(0, w * 0.1, false);
    curtain(w * 0.9, w, true);
    // valance on top
    g = c.createLinearGradient(0, 0, 0, u * 1.6);
    g.addColorStop(0, '#7a0a22'); g.addColorStop(1, '#c41a3a');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(w, 0); c.lineTo(w, u * 1.0);
    const sw = w / 12;
    for (let k = 12; k > 0; k--) c.quadraticCurveTo((k - 0.5) * sw, u * 1.9, (k - 1) * sw, u * 1.0);
    c.closePath(); c.fill();
    c.strokeStyle = '#ffcf5a'; c.lineWidth = u * 0.08;
    c.beginPath(); c.moveTo(0, u * 1.0);
    for (let k = 0; k < 12; k++) c.quadraticCurveTo((k + 0.5) * sw, u * 1.9, (k + 1) * sw, u * 1.0);
    c.stroke();
    // footlights
    for (let k = 0; k < 9; k++) {
      const x = w * (0.15 + k * 0.0875), y = fy + u * 0.15;
      const lg = c.createRadialGradient(x, y, 1, x, y, u * 0.9);
      lg.addColorStop(0, 'rgba(255,240,190,0.9)'); lg.addColorStop(0.2, 'rgba(255,210,120,0.4)'); lg.addColorStop(1, 'rgba(255,200,100,0)');
      c.fillStyle = lg; c.fillRect(x - u, y - u, u * 2, u * 2);
    }
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
  function outlined(c, str, x, y, size, top, bottom, align = 'center', maxW = 1e9) {
    c.font = `700 ${Math.round(size)}px ${Kit.FONT}`;
    const w = c.measureText(str).width;
    if (w > maxW && w > 0) { size *= maxW / w; c.font = `700 ${Math.round(size)}px ${Kit.FONT}`; }
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.16; c.strokeStyle = 'rgba(20,5,40,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  function panel(c, x, y, w, h, r, border, top = '#3d1d6e', bottom = '#1a0b33') {
    roundRect(c, x, y + 6, w, h, r); c.fillStyle = 'rgba(0,0,0,0.35)'; c.fill();
    roundRect(c, x, y, w, h, r);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fill();
    c.lineWidth = 3; c.strokeStyle = border; c.stroke();
  }
  function pill(c, x, y, w, h, label, on, rowOn, t) {
    const k = on && rowOn ? 1.06 + Math.sin(t * 5) * 0.015 : 1;
    c.save(); c.translate(x + w / 2, y + h / 2); c.scale(k, k);
    roundRect(c, -w / 2, -h / 2, w, h, h / 2);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, on ? '#ffe680' : 'rgba(255,255,255,0.14)'); g.addColorStop(1, on ? '#f0a000' : 'rgba(255,255,255,0.05)');
    c.fillStyle = g; c.fill();
    c.lineWidth = on && rowOn ? 4 : 2; c.strokeStyle = on && rowOn ? '#ffffff' : on ? '#ffd23f' : 'rgba(255,255,255,0.25)'; c.stroke();
    fitText(c, label, 0, h * 0.03, h * 0.42, on ? '#3a2200' : 'rgba(255,255,255,0.85)', w * 0.86, 800);
    c.restore();
  }
  // Wrap a phrase into at most 3 lines that fit maxW at the biggest size possible.
  function wordLines(c, str, maxW, maxH, start) {
    let size = start;
    for (let tries = 0; tries < 30; tries++) {
      c.font = `700 ${Math.round(size)}px ${Kit.FONT}`;
      const words = str.split(' ');
      const lines = [];
      let cur = '';
      for (const wd of words) {
        const t2 = cur ? cur + ' ' + wd : wd;
        if (c.measureText(t2).width <= maxW || !cur) cur = t2; else { lines.push(cur); cur = wd; }
      }
      if (cur) lines.push(cur);
      const widest = Math.max(...lines.map((l) => c.measureText(l).width));
      if (widest <= maxW && lines.length * size * 1.1 <= maxH) return { lines, size };
      size *= 0.92;
    }
    return { lines: [str], size };
  }

  function drawWordCard(c, wd, x, y, w, h, t, alpha, rot, tint) {
    c.save(); c.globalAlpha = alpha; c.translate(x, y); c.rotate(rot);
    c.fillStyle = 'rgba(0,0,0,0.35)'; roundRect(c, -w / 2 + 6, -h / 2 + 12, w, h, L.u * 0.6); c.fill();
    roundRect(c, -w / 2, -h / 2, w, h, L.u * 0.6);
    const g = c.createLinearGradient(0, -h / 2, 0, h / 2);
    g.addColorStop(0, '#ffffff'); g.addColorStop(1, tint || '#f1e8ff');
    c.fillStyle = g; c.fill();
    c.lineWidth = L.u * 0.12; c.strokeStyle = TEAM_COLORS[team] || '#ffd23f'; c.stroke();
    // category ribbon
    const label = `${wd.cat.icon}  ${wd.cat.name}`;
    c.font = `800 ${Math.round(L.u * 0.5)}px ${Kit.UI}`;
    const rw = c.measureText(label).width + L.u * 1.2, rh = L.u * 0.8;
    roundRect(c, -rw / 2, -h / 2 - rh / 2, rw, rh, rh / 2);
    c.fillStyle = shade(TEAM_COLORS[team] || '#ffd23f', -0.2); c.fill();
    text(c, label, 0, -h / 2 + 1, L.u * 0.5, '#ffffff', 800);
    const fit = wordLines(c, wd.w.toUpperCase(), w * 0.88, h * 0.72, L.u * 2.6);
    const lh = fit.size * 1.08, y0 = -((fit.lines.length - 1) * lh) / 2 + h * 0.04;
    fit.lines.forEach((ln, i) => {
      c.font = `700 ${Math.round(fit.size)}px ${Kit.FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = '#2a1050'; c.fillText(ln, 0, y0 + i * lh);
    });
    // gloss
    const gg = c.createLinearGradient(0, -h / 2, 0, 0);
    gg.addColorStop(0, 'rgba(255,255,255,0.6)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
    roundRect(c, -w / 2 + 6, -h / 2 + 6, w - 12, h * 0.4, L.u * 0.5); c.fillStyle = gg; c.fill();
    c.restore();
  }

  function drawTimer(c, x, y, r, t) {
    const total = S().time, k = clamp(timeLeft / total, 0, 1);
    const low = timeLeft <= 10;
    const pulse = low ? 1 + Math.sin(t * 10) * 0.04 : 1;
    c.save(); c.translate(x, y); c.scale(pulse, pulse);
    c.fillStyle = 'rgba(0,0,0,0.4)'; c.beginPath(); c.arc(0, 0, r * 1.08, 0, Math.PI * 2); c.fill();
    const g = c.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
    g.addColorStop(0, '#5a2a9c'); g.addColorStop(1, '#22093f');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.lineWidth = r * 0.16; c.strokeStyle = 'rgba(255,255,255,0.12)';
    c.beginPath(); c.arc(0, 0, r * 0.86, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = low ? '#ff4d6d' : k < 0.4 ? '#ffb020' : '#7dffb0'; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, r * 0.86, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); c.stroke();
    c.lineCap = 'butt';
    outlined(c, String(Math.ceil(timeLeft)), 0, r * 0.04, r * 0.8, '#ffffff', low ? '#ffb3c0' : '#e6dcff');
    c.restore();
  }

  function scoreStrip(c, y, t, highlight) {
    const u = L.u, n = teams, w = Math.min(u * 5.2, (Kit.W - u * 4) / n - u * 0.3), gap = u * 0.3;
    const total = n * w + (n - 1) * gap;
    for (let i = 0; i < n; i++) {
      const x = (Kit.W - total) / 2 + i * (w + gap), on = highlight && i === team;
      const h = u * 1.1;
      c.save();
      roundRect(c, x, y - h / 2, w, h, h / 2);
      const g = c.createLinearGradient(0, y - h / 2, 0, y + h / 2);
      g.addColorStop(0, shade(TEAM_COLORS[i], on ? 0.1 : -0.3)); g.addColorStop(1, shade(TEAM_COLORS[i], on ? -0.4 : -0.7));
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#ffffff' : 'rgba(255,255,255,0.3)'; c.stroke();
      text(c, teamName(i), x + h * 0.5, y, u * 0.45, '#ffffff', 900, 'left');
      text(c, String(scores[i] || 0), x + w - h * 0.5, y, u * 0.6, '#ffffff', 900, 'right', Kit.FONT);
      c.restore();
    }
  }

  // ---------- Draw ----------
  const draw = guard((c, t) => {
    const Wd = Kit.W, H = Kit.H, u = L.u;
    hits = [];
    c.drawImage(stage, 0, 0, Wd, H);
    // a slowly swinging spotlight
    const sx = Wd / 2 + Math.sin(t * 0.7) * u * 1.5;
    const g = c.createRadialGradient(sx, H * 0.5, u, sx, H * 0.5, u * 11);
    g.addColorStop(0, 'rgba(255,240,200,0.16)'); g.addColorStop(1, 'rgba(255,240,200,0)');
    c.fillStyle = g; c.fillRect(0, 0, Wd, H);
    if (state === 'menu') drawMenu(c, t);
    else if (state === 'ready' || state === 'count') drawReady(c, t);
    else if (state === 'play') drawPlay(c, t);
    else if (state === 'summary') drawSummary(c, t);
    else if (state === 'over') drawOver(c, t);
  });

  function drawMenu(c, t) {
    const Wd = Kit.W, H = Kit.H, u = L.u;
    const pw = Math.min(Wd - u, u * 21), ph = Math.min(H - u * 0.6, u * 16.4), px = (Wd - pw) / 2, py = (H - ph) / 2 + u * 0.3;
    const a = ease.back(clamp(stateT / 0.5, 0, 1));
    c.save(); c.translate(Wd / 2, H / 2); c.scale(a, a); c.translate(-Wd / 2, -H / 2);
    panel(c, px, py, pw, ph, u * 0.7, '#ffd23f', 'rgba(70,30,120,0.95)', 'rgba(26,10,52,0.97)');
    // masks
    drawMask(c, Wd / 2 - u * 7.2, py + u * 1.3, u * 0.85, true, t);
    drawMask(c, Wd / 2 + u * 7.2, py + u * 1.3, u * 0.85, false, t);
    outlined(c, 'Act It Out', Wd / 2, py + u * 1.45, u * 1.4, '#ffffff', '#ffd1f0');
    text(c, 'Act the word on the TV - no talking! Your team guesses before time runs out.', Wd / 2, py + u * 2.65, u * 0.44, 'rgba(255,255,255,0.88)', 700);
    const lx = px + u * 0.9, ox = px + u * 5.2, avail = pw - (ox - px) - u * 0.8;
    const rows = [py + u * 4.1, py + u * 5.95, py + u * 7.8, py + u * 10.0, py + u * 12.5];
    const label = (i, s) => text(c, s, lx, rows[i], u * 0.5, menuRow === i ? '#ffe36b' : '#ffffff', 900, 'left');
    const rh = u * 1.1;
    label(0, 'Teams');
    for (let n = 1; n <= 4; n++) {
      const w = Math.min(u * 3.2, (avail - u * 0.9) / 4), x = ox + (n - 1) * (w + u * 0.3);
      pill(c, x, rows[0] - rh / 2, w, rh, n === 1 ? '1 (practice)' : String(n), teams === n, menuRow === 0, t);
      hits.push({ x, y: rows[0] - rh / 2, w, h: rh, fn: () => { teams = n; menuRow = 0; saveSetup(); Kit.sfx.move(); } });
    }
    label(1, 'Rounds');
    ROUNDS.forEach((r, i) => {
      const w = u * 2.2, x = ox + i * (w + u * 0.3);
      pill(c, x, rows[1] - rh / 2, w, rh, String(r), roundsIx === i, menuRow === 1, t);
      hits.push({ x, y: rows[1] - rh / 2, w, h: rh, fn: () => { roundsIx = i; menuRow = 1; saveSetup(); Kit.sfx.move(); } });
    });
    text(c, `Every team acts ${ROUNDS[roundsIx]} times`, ox + u * 7.6, rows[1], u * 0.38, 'rgba(255,255,255,0.7)', 700, 'left');
    label(2, 'Skill');
    const kw = Math.min(u * 3.6, (avail - u * 0.6) / 3);
    SKILLS.forEach((s, i) => {
      const x = ox + i * (kw + u * 0.3);
      pill(c, x, rows[2] - rh / 2, kw, rh, s.name, skill === i, menuRow === 2, t);
      hits.push({ x, y: rows[2] - rh / 2, w: kw, h: rh, fn: () => { skill = i; menuRow = 2; saveSetup(); Kit.sfx.move(); } });
    });
    text(c, S().tip, ox, rows[2] + rh / 2 + u * 0.38, u * 0.38, 'rgba(255,255,255,0.75)', 700, 'left');
    label(3, 'Words');
    const cw = Math.min(u * 9, avail - u * 2.2), cx = ox + u * 1.0;
    const on = menuRow === 3;
    text(c, '◀', ox + u * 0.35, rows[3], u * 0.6, on ? '#ffe36b' : 'rgba(255,255,255,0.5)', 900);
    text(c, '▶', cx + cw + u * 0.65, rows[3], u * 0.6, on ? '#ffe36b' : 'rgba(255,255,255,0.5)', 900);
    pill(c, cx, rows[3] - rh / 2, cw, rh, catIx === 0 ? '🎭  All categories' : `${CATS[catIx - 1].icon}  ${CATS[catIx - 1].name}`, true, on, t);
    hits.push({ x: cx, y: rows[3] - rh / 2, w: cw, h: rh, fn: () => { menuRow = 3; catIx = (catIx + 1) % (CATS.length + 1); saveSetup(); Kit.sfx.move(); } });
    const count = (catIx === 0 ? CATS : [CATS[catIx - 1]]).reduce((s, k) => s + k.easy.length + (skill > 0 ? k.more.length : 0), 0);
    text(c, `${count} ${skill === 0 ? 'simple words' : 'words and phrases'}`, ox, rows[3] + rh / 2 + u * 0.38, u * 0.38, 'rgba(255,255,255,0.75)', 700, 'left');
    const bw = u * 5.8, bh = u * 1.25, bx = Wd / 2 - bw / 2, by = rows[4] - bh / 2 + u * 0.4, pon = menuRow === 4;
    const kb = pon ? 1.08 + Math.sin(t * 6) * 0.025 : 1;
    c.save(); c.translate(Wd / 2, by + bh / 2); c.scale(kb, kb);
    roundRect(c, -bw / 2, -bh / 2, bw, bh, bh / 2);
    const gb = c.createLinearGradient(0, -bh / 2, 0, bh / 2); gb.addColorStop(0, '#ffe680'); gb.addColorStop(1, '#f08c00');
    c.fillStyle = gb; c.fill(); c.lineWidth = pon ? 5 : 2; c.strokeStyle = pon ? '#ffffff' : 'rgba(80,40,0,0.6)'; c.stroke();
    outlined(c, "▶  Let's act!", 0, bh * 0.03, bh * 0.52, '#ffffff', '#fff1c2');
    c.restore();
    hits.push({ x: bx, y: by, w: bw, h: bh, fn: () => startGame() });
    text(c, Kit.touchFirst() ? 'Tap to choose' : '▲▼ choose  ·  ◀ ▶ change  ·  OK play  ·  Back for games', Wd / 2, py + ph - u * 0.85, u * 0.4, 'rgba(255,255,255,0.75)', 700);
    text(c, `★ Best turn: ${best}`, Wd / 2, py + ph - u * 0.35, u * 0.42, '#ffd23f', 800);
    c.restore();
  }

  // A theatre mask (happy or sad).
  function drawMask(c, x, y, r, happy, t) {
    c.save(); c.translate(x, y); c.rotate((happy ? -0.2 : 0.2) + Math.sin(t * 2 + (happy ? 0 : 1)) * 0.06);
    const g = c.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, '#fff8d0'); g.addColorStop(0.6, happy ? '#ffd23f' : '#9fd8ff'); g.addColorStop(1, happy ? '#c88a00' : '#3d7bd0');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-r, -r * 0.6); c.quadraticCurveTo(0, -r * 1.05, r, -r * 0.6); c.quadraticCurveTo(r * 1.05, r * 0.5, 0, r * 1.05); c.quadraticCurveTo(-r * 1.05, r * 0.5, -r, -r * 0.6); c.fill();
    c.lineWidth = r * 0.06; c.strokeStyle = 'rgba(60,30,0,0.6)'; c.stroke();
    c.fillStyle = '#2a1050';
    c.beginPath(); c.ellipse(-r * 0.38, -r * 0.2, r * 0.2, r * (happy ? 0.12 : 0.15), happy ? 0.2 : -0.3, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(r * 0.38, -r * 0.2, r * 0.2, r * (happy ? 0.12 : 0.15), happy ? -0.2 : 0.3, 0, Math.PI * 2); c.fill();
    c.lineWidth = r * 0.14; c.strokeStyle = '#2a1050'; c.lineCap = 'round';
    c.beginPath();
    if (happy) c.arc(0, r * 0.2, r * 0.42, 0.15 * Math.PI, 0.85 * Math.PI); else c.arc(0, r * 0.75, r * 0.38, 1.2 * Math.PI, 1.8 * Math.PI);
    c.stroke(); c.lineCap = 'butt';
    c.restore();
  }

  function drawReady(c, t) {
    const Wd = Kit.W, H = Kit.H, u = L.u, col = TEAM_COLORS[team];
    const a = ease.back(clamp(stateT / 0.45, 0, 1));
    text(c, teams === 1 ? `Practice  ·  Round ${round} of ${nRounds}` : `Round ${round} of ${nRounds}`, Wd / 2, u * 2.6, u * 0.6, 'rgba(255,255,255,0.85)', 800);
    if (state === 'ready') {
      c.save(); c.translate(Wd / 2, H * 0.3); c.scale(a, a);
      outlined(c, teams === 1 ? 'Get ready!' : `Get ready, ${teamName(team)}!`, 0, 0, u * 1.6, '#ffffff', shade(col, 0.4), 'center', Wd - u * 4);
      c.restore();
      const pw = Math.min(Wd - u * 4, u * 20), ph = u * 5.2, px = (Wd - pw) / 2, py = H * 0.4;
      panel(c, px, py, pw, ph, u * 0.6, col, 'rgba(60,25,105,0.92)', 'rgba(25,10,50,0.95)');
      const lines = [
        ['🎭', 'Pick an actor: they hold the remote and stand next to the TV.'],
        ['🙈', `${teams === 1 ? 'Guessers' : teamName(team)}: look at your actor, not the screen!`],
        ['🤫', 'Act out each word - no talking, no pointing at things in the room.'],
        ['🔘', 'OK = Got it!   ▶ = Skip   ◀ = Undo'],
      ];
      lines.forEach(([ic, s], i) => {
        const y = py + u * 0.95 + i * u * 1.1;
        text(c, ic, px + u * 1.0, y, u * 0.6, '#fff', 400);
        fitText(c, s, px + u * 1.8, y, u * 0.5, '#ffffff', pw - u * 2.4, 700, 'left');
      });
      const pulse = 0.6 + Math.sin(t * 5) * 0.4;
      c.globalAlpha = pulse;
      text(c, Kit.touchFirst() ? 'Tap to start the timer' : `Press OK to start the ${S().time}-second timer`, Wd / 2, py + ph + u * 1.0, u * 0.65, '#ffd23f', 900);
      c.globalAlpha = 1;
      hits.push({ x: 0, y: 0, w: Wd, h: H, fn: () => { if (state === 'ready') startCountdown(); } });
    } else {
      const n = Math.max(1, 3 - Math.floor(stateT)), f = stateT % 1;
      outlined(c, teams === 1 ? 'Actor, get ready…' : `${teamName(team)}, get ready…`, Wd / 2, H * 0.24, u * 1.0, '#ffffff', shade(col, 0.4));
      c.save(); c.translate(Wd / 2, H * 0.52);
      const k = 1.6 - ease.out(f) * 0.6;
      c.scale(k, k); c.globalAlpha = 1 - f * 0.5;
      const g = c.createRadialGradient(0, 0, u, 0, 0, u * 3.2);
      g.addColorStop(0, rgba(col, 0.6)); g.addColorStop(1, rgba(col, 0));
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, u * 3.2, 0, Math.PI * 2); c.fill();
      outlined(c, String(n), 0, 0, u * 4, '#ffffff', shade(col, 0.5));
      c.restore();
    }
    scoreStrip(c, H - u * 1.2, t, true);
  }

  function drawPlay(c, t) {
    const Wd = Kit.W, H = Kit.H, u = L.u, col = TEAM_COLORS[team];
    const cw = Math.min(Wd * 0.62, u * 20), ch = u * 6.6;
    // cards flying away
        for (const o of outgoing) {
      const k = ease.inOut(clamp(o.t / 0.6, 0, 1));
      drawWordCard(c, o.word, Wd / 2 + o.dir * k * Wd * 0.6, L.cardY - (o.got ? k * u * 3 : 0), cw, ch, t, 1 - k * 0.7, o.dir * k * 0.4, o.got ? '#c8ffd9' : '#d8d8e0');
    }
    // team chip
    c.save();
    roundRect(c, u * 1.6, u * 2.0, u * 7.2, u * 1.6, u * 0.8);
    const g = c.createLinearGradient(0, u * 2.0, 0, u * 3.6);
    g.addColorStop(0, shade(col, 0.1)); g.addColorStop(1, shade(col, -0.5));
    c.fillStyle = g; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.7)'; c.stroke();
    text(c, teams === 1 ? 'Practice' : teamName(team), u * 2.3, u * 2.55, u * 0.55, '#ffffff', 900, 'left');
    text(c, `Round ${round} of ${nRounds}`, u * 2.3, u * 3.1, u * 0.4, 'rgba(255,255,255,0.85)', 700, 'left');
    outlined(c, String(turnScore), u * 7.6, u * 2.8, u * 1.1, '#ffffff', '#fff1b8');
    c.restore();
    drawTimer(c, Wd - u * 3.4, u * 3.4, u * 1.6, t);
    if (skill === 1) text(c, `Free skips left: ${Math.max(0, S().freeSkips - skipsUsed)}`, Wd - u * 3.4, u * 5.5, u * 0.4, 'rgba(255,255,255,0.8)', 700);
    if (skill === 2) text(c, 'Skips cost 1 point', Wd - u * 3.4, u * 5.5, u * 0.4, 'rgba(255,255,255,0.8)', 700);
    if (word) {
      const k = ease.back(cardAnim);
      c.save(); c.translate(Wd / 2, L.cardY); c.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k); c.translate(-Wd / 2, -L.cardY);
      drawWordCard(c, word, Wd / 2 + (1 - k) * u * 2, L.cardY + Math.sin(t * 2) * u * 0.08, cw, ch, t, clamp(cardAnim * 2, 0, 1), Math.sin(t * 1.3) * 0.008, null);
      c.restore();
    }
    // the three actions
    const by = L.cardY + ch / 2 + u * 1.5, bh = u * 1.25;
    const btns = [
      { label: '◀  Undo', w: u * 4.2, cols: ['#c9b8ff', '#7d5cd6'], fn: undo, on: history.length > 0 },
      { label: 'OK  Got it!', w: u * 6.2, cols: ['#7dffb0', '#13b86a'], fn: gotIt, on: true },
      { label: skill === 2 || (skill === 1 && skipsUsed >= S().freeSkips) ? 'Skip (-1)  ▶' : 'Skip  ▶', w: u * 4.6, cols: ['#ffd0a0', '#f07a20'], fn: skipIt, on: true },
    ];
    const total = btns.reduce((s, b) => s + b.w, 0) + u * 0.6 * 2;
    let x = Wd / 2 - total / 2;
    btns.forEach((b) => {
      c.save(); c.globalAlpha = b.on ? 1 : 0.4;
      roundRect(c, x, by, b.w, bh, bh / 2);
      const gg = c.createLinearGradient(0, by, 0, by + bh); gg.addColorStop(0, b.cols[0]); gg.addColorStop(1, b.cols[1]);
      c.fillStyle = gg; c.fill(); c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.8)'; c.stroke();
      fitText(c, b.label, x + b.w / 2, by + bh / 2, u * 0.55, '#1a0b33', b.w * 0.86, 900);
      c.restore();
      hits.push({ x, y: by, w: b.w, h: bh, fn: b.fn });
      x += b.w + u * 0.6;
    });
    // got-it ticker
    const got = log.filter((l) => l.got).slice(-6).map((l) => l.w);
    if (got.length) fitText(c, '✓ ' + got.join('  ·  '), Wd / 2, by + bh + u * 0.8, u * 0.42, 'rgba(200,255,220,0.85)', Wd - u * 6, 700);
    // time-up flash
    if (timeLeft < 5) { c.fillStyle = `rgba(255,40,80,${0.08 + 0.06 * Math.sin(t * 12)})`; c.fillRect(0, 0, Wd, H); }
  }

  function drawSummary(c, t) {
    const Wd = Kit.W, H = Kit.H, u = L.u, col = TEAM_COLORS[team];
    const a = ease.back(clamp(stateT / 0.45, 0, 1));
    c.save(); c.translate(Wd / 2, H * 0.47); c.scale(a, a);
    const pw = Math.min(Wd - u * 3, u * 22), ph = u * 12.4;
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.7, col, 'rgba(70,30,120,0.96)', 'rgba(26,10,52,0.97)');
    outlined(c, "Time's up!", 0, -ph / 2 + u * 1.1, u * 1.3, '#ffffff', '#ffd1f0');
    const who = teams === 1 ? 'You' : teamName(team);
    text(c, `${who} scored ${turnScore} ${turnScore === 1 ? 'point' : 'points'}`, 0, -ph / 2 + u * 2.35, u * 0.7, shade(col, 0.4), 900);
    if (newBest) text(c, '★ New best turn! ★', 0, -ph / 2 + u * 3.2, u * 0.55, '#ffd23f', 900);
    // words, two columns
    const items = log.slice(-16);
    const colW = pw * 0.44, y0 = -ph / 2 + u * 4.1;
    if (!items.length) text(c, 'No words this time - have another go!', 0, y0 + u * 1, u * 0.5, 'rgba(255,255,255,0.75)', 700);
    items.forEach((it, i) => {
      const cx = i < 8 ? -pw * 0.46 : pw * 0.04, y = y0 + (i % 8) * u * 0.72;
      fitText(c, (it.got ? '✓  ' : '✗  ') + it.w, cx, y, u * 0.46, it.got ? '#9dffc4' : 'rgba(255,255,255,0.45)', colW, 800, 'left');
    });
    const last = round === nRounds && team === teams - 1;
    c.globalAlpha = stateT > 1 ? 0.6 + Math.sin(t * 5) * 0.4 : 0.3;
    text(c, Kit.touchFirst() ? 'Tap to continue' : last ? 'OK: see the winner' : `OK: next up - ${teams === 1 ? 'next round' : teamName((team + 1) % teams)}`, 0, ph / 2 - u * 0.7, u * 0.6, '#ffd23f', 900);
    c.globalAlpha = 1;
    c.restore();
    scoreStrip(c, H - u * 1.2, t, true);
    hits.push({ x: 0, y: 0, w: Wd, h: H, fn: () => { if (state === 'summary' && stateT > 1) afterSummary(); } });
  }

  function drawOver(c, t) {
    const Wd = Kit.W, H = Kit.H, u = L.u;
    const a = ease.back(clamp(stateT / 0.5, 0, 1));
    const top = Math.max(...scores);
    const winners = scores.map((s, i) => i).filter((i) => scores[i] === top);
    c.save(); c.translate(Wd / 2, H / 2); c.scale(a, a);
    const pw = Math.min(Wd - u * 2, u * 16), ph = u * (6.8 + teams * 1.05);
    const wc = winners.length === 1 ? TEAM_COLORS[winners[0]] : '#b388ff';
    panel(c, -pw / 2, -ph / 2, pw, ph, u * 0.7, '#ffd23f', shade(wc, -0.3), shade(wc, -0.78));
    const ttl = teams === 1 ? `Practice done: ${scores[0]} points!` : winners.length > 1 ? "It's a tie!" : `${teamName(winners[0])} wins!`;
    outlined(c, ttl, 0, -ph / 2 + u * 1.2, u * 1.25, '#ffffff', '#ffe680', 'center', pw - u);
    const order = scores.map((s, i) => i).sort((x, y) => scores[y] - scores[x]);
    order.forEach((i, n) => {
      const y = -ph / 2 + u * 2.4 + n * u * 1.05;
      roundRect(c, -pw * 0.4, y, pw * 0.8, u * 0.9, u * 0.3);
      c.fillStyle = scores[i] === top ? 'rgba(255,210,63,0.22)' : 'rgba(255,255,255,0.08)'; c.fill();
      c.fillStyle = TEAM_COLORS[i]; c.beginPath(); c.arc(-pw * 0.4 + u * 0.55, y + u * 0.45, u * 0.28, 0, Math.PI * 2); c.fill();
      text(c, (scores[i] === top && teams > 1 ? '🏆 ' : '') + teamName(i), -pw * 0.4 + u * 1.1, y + u * 0.45, u * 0.5, '#ffffff', 900, 'left');
      text(c, `${scores[i]}`, pw * 0.37, y + u * 0.45, u * 0.6, '#ffffff', 900, 'right', Kit.FONT);
    });
    text(c, `★ Best turn: ${best}`, 0, ph / 2 - u * 2.5, u * 0.5, '#ffd23f', 800);
    c.globalAlpha = stateT > 1.2 ? 1 : 0.45;
    ['Play again', 'Menu'].forEach((s, i) => {
      const bw = u * 4.4, bh = u * 1.05, x = (i ? 1 : -1) * (bw / 2 + u * 0.25) - bw / 2, y = ph / 2 - u * 1.6;
      const on = overBtn === i;
      roundRect(c, x, y, bw, bh, bh / 2);
      const g = c.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, on ? '#ffe680' : 'rgba(255,255,255,0.18)'); g.addColorStop(1, on ? '#f08c00' : 'rgba(255,255,255,0.06)');
      c.fillStyle = g; c.fill();
      c.lineWidth = on ? 4 : 2; c.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.3)'; c.stroke();
      text(c, s, x + bw / 2, y + bh / 2, u * 0.48, on ? '#3a2200' : '#fff', 900);
      hits.push({ x: Wd / 2 + x * a, y: H / 2 + y * a, w: bw * a, h: bh * a, fn: () => { if (stateT > 1.2) { if (i === 0) startGame(); else toMenu(); } } });
    });
    c.globalAlpha = 1;
    c.restore();
  }

  // ---------- Start ----------
  window.__actitout = {
    get state() { return state; }, get phase() { return state; },
    get extra() { return { games: gamesDone, round, team, scores, best, words: CATS.reduce((s, k) => s + k.easy.length + k.more.length, 0), easy: CATS.reduce((s, k) => s + k.easy.length, 0) }; },
  };
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  Kit.canvas.focus();
  if (AUTO) { teams = 2; roundsIx = 0; skill = 1; setTimeout(() => startGame(), 300); }
  if (best > 0) Kit.record(ID, best);
})();
