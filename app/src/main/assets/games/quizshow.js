// Quiz Show: a TV game show quiz. Ten questions a round from general knowledge, cricket, geography,
// science and Islamic knowledge (or all of them mixed). 100 points for each right answer plus a bonus
// for answering quickly; keep a streak going for the flames. Remote: arrows pick an answer (A-D),
// OK locks it in. Touch: tap an answer. M mutes.
'use strict';

(() => {
  const { sfx, ease, shade, roundRect, clamp, lerp } = Kit;

  // ---------- Questions (the same as the app's Quiz Time): topic, question, right answer, three wrong ----------
  const GK = 'General knowledge', CR = 'Cricket', GEO = 'Geography', SCI = 'Science', ISL = 'Islamic knowledge';
  const QUESTIONS = [
    [GK, "How many days are there in a leap year?", "366", "365", "364", "360"],
    [GK, "How many minutes are in one hour?", "60", "100", "30", "90"],
    [GK, "Which colour do you get by mixing blue and yellow?", "Green", "Purple", "Orange", "Brown"],
    [GK, "How many sides does a hexagon have?", "6", "5", "7", "8"],
    [GK, "What is the national language of Pakistan?", "Urdu", "Punjabi", "Sindhi", "Pashto"],
    [GK, "Who is known as the founder of Pakistan?", "Muhammad Ali Jinnah", "Allama Iqbal", "Liaquat Ali Khan", "Sir Syed Ahmad Khan"],
    [GK, "Which poet is called the national poet of Pakistan?", "Allama Iqbal", "Faiz Ahmed Faiz", "Mirza Ghalib", "Ahmad Faraz"],
    [GK, "On which date is Pakistan's Independence Day?", "14 August", "23 March", "25 December", "15 August"],
    [GK, "On which date is Canada Day?", "1 July", "4 July", "1 June", "11 November"],
    [GK, "What is the currency of Pakistan?", "Rupee", "Taka", "Dirham", "Riyal"],
    [GK, "What is the currency of the United Kingdom?", "Pound sterling", "Euro", "Dollar", "Franc"],
    [GK, "Which leaf is on the flag of Canada?", "Maple", "Oak", "Palm", "Fern"],
    [GK, "How many players are there in a football team on the field?", "11", "10", "9", "12"],
    [GK, "Which month has the fewest days?", "February", "April", "June", "November"],
    [GK, "How many hours are there in a day?", "24", "12", "20", "48"],
    [GK, "What do bees make?", "Honey", "Milk", "Silk", "Wax only"],
    [GK, "Which is the largest animal in the world?", "Blue whale", "Elephant", "Giraffe", "Great white shark"],
    [GK, "Which is the fastest land animal?", "Cheetah", "Lion", "Horse", "Leopard"],
    [GK, "What is the national flower of Pakistan?", "Jasmine", "Rose", "Tulip", "Lotus"],
    [GK, "What is the national animal of Pakistan?", "Markhor", "Lion", "Snow leopard", "Camel"],
    [GK, "How many letters are in the English alphabet?", "26", "24", "28", "25"],
    [GK, "Which instrument has black and white keys?", "Piano", "Guitar", "Violin", "Flute"],
    [GK, "What is frozen water called?", "Ice", "Steam", "Fog", "Dew"],
    [GK, "Which shape has three sides?", "Triangle", "Square", "Circle", "Pentagon"],
    [CR, "Which country won the 1992 Cricket World Cup?", "Pakistan", "England", "India", "Australia"],
    [CR, "Who captained Pakistan to the 1992 World Cup win?", "Imran Khan", "Javed Miandad", "Wasim Akram", "Inzamam-ul-Haq"],
    [CR, "Which country won the first Cricket World Cup in 1975?", "West Indies", "Australia", "England", "India"],
    [CR, "Which country won the 1983 Cricket World Cup?", "India", "West Indies", "Pakistan", "Australia"],
    [CR, "Which country won the 2011 Cricket World Cup?", "India", "Sri Lanka", "Australia", "Pakistan"],
    [CR, "Which country won the 1996 Cricket World Cup?", "Sri Lanka", "Australia", "India", "Pakistan"],
    [CR, "Which country won the 2009 T20 World Cup?", "Pakistan", "Sri Lanka", "India", "England"],
    [CR, "Which country won the 2017 Champions Trophy?", "Pakistan", "India", "England", "Bangladesh"],
    [CR, "How many balls are there in an over?", "6", "5", "8", "10"],
    [CR, "How many players does a cricket team have on the field?", "11", "10", "12", "9"],
    [CR, "How many runs is a ball hit over the boundary without bouncing?", "6", "4", "5", "8"],
    [CR, "How many stumps are there at one end of the pitch?", "3", "2", "4", "1"],
    [CR, "Which player was nicknamed the 'Rawalpindi Express'?", "Shoaib Akhtar", "Waqar Younis", "Wasim Akram", "Mohammad Asif"],
    [CR, "Which batsman is called the 'Little Master'?", "Sachin Tendulkar", "Brian Lara", "Javed Miandad", "Virat Kohli"],
    [CR, "Which bowler is known as the 'Sultan of Swing'?", "Wasim Akram", "Imran Khan", "Shane Warne", "Glenn McGrath"],
    [CR, "How long is a cricket pitch between the stumps?", "22 yards", "20 yards", "25 yards", "18 yards"],
    [CR, "What is a batsman out for zero called?", "A duck", "A goose", "A zero", "A blank"],
    [CR, "Who scored 400 not out, the highest Test innings?", "Brian Lara", "Matthew Hayden", "Virender Sehwag", "Hanif Mohammad"],
    [CR, "Where is Lord's cricket ground?", "London", "Melbourne", "Lahore", "Mumbai"],
    [CR, "Which city is Gaddafi Stadium in?", "Lahore", "Karachi", "Rawalpindi", "Multan"],
    [GEO, "What is the capital of Pakistan?", "Islamabad", "Karachi", "Lahore", "Rawalpindi"],
    [GEO, "What is the capital of Canada?", "Ottawa", "Toronto", "Montreal", "Vancouver"],
    [GEO, "What is the capital of India?", "New Delhi", "Mumbai", "Kolkata", "Chennai"],
    [GEO, "What is the capital of Saudi Arabia?", "Riyadh", "Jeddah", "Makkah", "Madinah"],
    [GEO, "What is the capital of Turkey?", "Ankara", "Istanbul", "Izmir", "Bursa"],
    [GEO, "What is the capital of Australia?", "Canberra", "Sydney", "Melbourne", "Perth"],
    [GEO, "What is the capital of Bangladesh?", "Dhaka", "Chittagong", "Sylhet", "Khulna"],
    [GEO, "What is the capital of the United Arab Emirates?", "Abu Dhabi", "Dubai", "Sharjah", "Ajman"],
    [GEO, "Which is the highest mountain in the world?", "Mount Everest", "K2", "Nanga Parbat", "Kangchenjunga"],
    [GEO, "K2, the second highest mountain, is in which country?", "Pakistan", "Nepal", "India", "China only"],
    [GEO, "Which is the longest river in Pakistan?", "Indus", "Jhelum", "Chenab", "Ravi"],
    [GEO, "Which is the largest ocean?", "Pacific", "Atlantic", "Indian", "Arctic"],
    [GEO, "Which is the largest continent?", "Asia", "Africa", "Europe", "North America"],
    [GEO, "Which is the largest country by area?", "Russia", "Canada", "China", "United States"],
    [GEO, "Which is the largest city of Pakistan?", "Karachi", "Lahore", "Faisalabad", "Islamabad"],
    [GEO, "Which province of Pakistan is the largest by area?", "Balochistan", "Punjab", "Sindh", "Khyber Pakhtunkhwa"],
    [GEO, "Niagara Falls is on the border of Canada and which country?", "United States", "Mexico", "Greenland", "Cuba"],
    [GEO, "Which is the largest province of Canada by population?", "Ontario", "Quebec", "British Columbia", "Alberta"],
    [GEO, "Which desert is the largest hot desert in the world?", "Sahara", "Thar", "Gobi", "Kalahari"],
    [GEO, "The Thar desert is shared by Pakistan and which country?", "India", "Iran", "Afghanistan", "China"],
    [GEO, "Which river flows through Cairo?", "Nile", "Tigris", "Euphrates", "Jordan"],
    [GEO, "How many continents are there?", "7", "5", "6", "8"],
    [SCI, "Which planet is closest to the Sun?", "Mercury", "Venus", "Earth", "Mars"],
    [SCI, "Which planet is known as the Red Planet?", "Mars", "Jupiter", "Venus", "Saturn"],
    [SCI, "Which is the largest planet in our solar system?", "Jupiter", "Saturn", "Neptune", "Earth"],
    [SCI, "What gas do plants take in from the air?", "Carbon dioxide", "Oxygen", "Nitrogen", "Hydrogen"],
    [SCI, "What gas do we need to breathe to live?", "Oxygen", "Carbon dioxide", "Helium", "Nitrogen"],
    [SCI, "At what temperature does water boil at sea level?", "100 °C", "90 °C", "50 °C", "120 °C"],
    [SCI, "At what temperature does water freeze?", "0 °C", "10 °C", "-10 °C", "4 °C"],
    [SCI, "How many bones does an adult human have?", "206", "106", "306", "256"],
    [SCI, "Which organ pumps blood around the body?", "Heart", "Lungs", "Liver", "Kidneys"],
    [SCI, "What is H2O better known as?", "Water", "Salt", "Sugar", "Air"],
    [SCI, "What is the closest star to the Earth?", "The Sun", "Polaris", "Sirius", "Alpha Centauri"],
    [SCI, "What force pulls things down to the ground?", "Gravity", "Magnetism", "Friction", "Wind"],
    [SCI, "How many legs does a spider have?", "8", "6", "10", "4"],
    [SCI, "How many legs does an insect have?", "6", "8", "4", "10"],
    [SCI, "What do we call animals that eat only plants?", "Herbivores", "Carnivores", "Omnivores", "Predators"],
    [SCI, "What is the hardest natural material?", "Diamond", "Gold", "Iron", "Glass"],
    [SCI, "What does the Moon go around?", "The Earth", "The Sun", "Mars", "Jupiter"],
    [SCI, "Which part of the plant makes food using sunlight?", "Leaf", "Root", "Stem", "Flower"],
    [SCI, "What travels faster, light or sound?", "Light", "Sound", "Both the same", "Neither moves"],
    [SCI, "How many planets are in our solar system?", "8", "9", "7", "10"],
    [ISL, "How many daily prayers are there in Islam?", "5", "3", "4", "6"],
    [ISL, "How many surahs are in the Holy Quran?", "114", "100", "120", "99"],
    [ISL, "What is the first surah of the Quran?", "Al-Fatiha", "Al-Baqarah", "Al-Ikhlas", "Yaseen"],
    [ISL, "What is the longest surah of the Quran?", "Al-Baqarah", "Al-Imran", "An-Nisa", "Yaseen"],
    [ISL, "In which month do Muslims fast?", "Ramadan", "Shawwal", "Muharram", "Rajab"],
    [ISL, "Ramadan is which month of the Islamic calendar?", "9th", "1st", "10th", "12th"],
    [ISL, "Which Eid comes right after Ramadan?", "Eid al-Fitr", "Eid al-Adha", "Both", "Neither"],
    [ISL, "In which city is the Kaaba?", "Makkah", "Madinah", "Jerusalem", "Riyadh"],
    [ISL, "In which city is Masjid an-Nabawi?", "Madinah", "Makkah", "Taif", "Jeddah"],
    [ISL, "How many pillars of Islam are there?", "5", "4", "6", "7"],
    [ISL, "What is the pilgrimage to Makkah called?", "Hajj", "Zakat", "Sawm", "Salah"],
    [ISL, "What is the giving of a share of wealth to the poor called?", "Zakat", "Hajj", "Salah", "Shahada"],
    [ISL, "Which is the first month of the Islamic calendar?", "Muharram", "Ramadan", "Safar", "Rabi al-Awwal"],
    [ISL, "In which month is Hajj performed?", "Dhul Hijjah", "Ramadan", "Muharram", "Shawwal"],
    [ISL, "Which angel brought the revelation to the Prophet ﷺ?", "Jibreel (Gabriel)", "Mikaeel", "Israfeel", "Malik"],
    [ISL, "In which cave did the first revelation come?", "Cave of Hira", "Cave of Thawr", "Cave of Uhud", "Cave of Quba"],
    [ISL, "What is the call to prayer called?", "Adhan", "Iqamah", "Dua", "Takbeer"],
    [ISL, "Which direction do Muslims face in prayer?", "The Qibla (Kaaba)", "East", "North", "Jerusalem"],
    [ISL, "Which surah is called the heart of the Quran?", "Yaseen", "Al-Mulk", "Ar-Rahman", "Al-Kahf"],
    [ISL, "How many rakats are in the Fajr fard prayer?", "2", "3", "4", "1"],
    [ISL, "How many rakats are in the Maghrib fard prayer?", "3", "2", "4", "5"],
    [ISL, "What was the first mosque built in Islam?", "Masjid Quba", "Masjid al-Haram", "Masjid an-Nabawi", "Masjid al-Aqsa"],
    [ISL, "The migration from Makkah to Madinah is called?", "Hijrah", "Hajj", "Umrah", "Isra"],
  ].map(([topic, text, right, ...wrong]) => ({ topic, text, right, wrong }));

  const CATS = [
    { id: 'mixed', name: 'Mixed', topic: null, icon: '🎲', color: '#ffc53d', tip: 'A bit of everything' },
    { id: 'gk', name: 'General knowledge', topic: GK, icon: '💡', color: '#ff7a45', tip: 'Everyday facts' },
    { id: 'cricket', name: 'Cricket', topic: CR, icon: '🏏', color: '#3d8bff', tip: 'World Cups and legends' },
    { id: 'geo', name: 'Geography', topic: GEO, icon: '🌍', color: '#22c7b8', tip: 'Capitals, rivers, peaks' },
    { id: 'science', name: 'Science', topic: SCI, icon: '🔬', color: '#ff4f9a', tip: 'Planets, bodies, nature' },
    { id: 'islamic', name: 'Islamic knowledge', topic: ISL, icon: '🕌', color: '#7bd23f', tip: 'Quran, prayer, history' },
  ];
  const TOPIC_ICON = { [GK]: '💡', [CR]: '🏏', [GEO]: '🌍', [SCI]: '🔬', [ISL]: '🕌' };
  const TOTAL = 10, TIME = 15;
  const ANS = [
    { letter: 'A', color: '#ff6a3d' },
    { letter: 'B', color: '#2f86ff' },
    { letter: 'C', color: '#f5a400' },
    { letter: 'D', color: '#e83f8f' },
  ];
  const GREEN = '#22c55e', RED = '#ef3b3b', GOLD = '#ffc53d';
  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.51, 1567.98, 1760];

  // ---------- Records ----------
  let bests = Kit.store.get('quizshow.best', {});
  if (!bests || typeof bests !== 'object') bests = {};
  CATS.forEach((c) => { if (typeof bests[c.id] !== 'number') bests[c.id] = 0; });
  let catIx = clamp(Kit.store.get('quizshow.cat', 0) | 0, 0, CATS.length - 1);
  const topBest = () => Math.max(0, ...CATS.map((c) => bests[c.id] || 0));

  // ---------- The round ----------
  // state: 'menu', 'intro' (card flips in), 'ask' (clock running), 'locked' (drumroll), 'reveal', 'results'
  let state = 'menu', stateT = 0, phaseT = 0, paused = false;
  let round = [], num = 0, q = null, answers = [], rightIx = 0, cursor = 0, picked = -1;
  let timeLeft = TIME, score = 0, shown = 0, bump = 0, correct = 0, streak = 0, bestStreak = 0;
  let results = [], newBest = false, lastPts = 0, tickSec = 99, flameT = 0;
  let menuCursor = catIx;
  const flyers = [];

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  function start() {
    catIx = menuCursor;
    Kit.store.set('quizshow.cat', catIx);
    const cat = CATS[catIx];
    const pool = cat.topic ? QUESTIONS.filter((x) => x.topic === cat.topic) : QUESTIONS.slice();
    round = shuffle(pool.slice()).slice(0, TOTAL);
    score = 0; shown = 0; correct = 0; streak = 0; bestStreak = 0; results = []; newBest = false;
    flyers.length = 0;
    ask(0);
    [0, 2, 4].forEach((n, i) => Kit.tone(NOTES[n], { type: 'triangle', dur: 0.18, vol: 0.16, at: i * 0.08 }));
  }

  function ask(n) {
    num = n; q = round[n];
    answers = shuffle([q.right, ...q.wrong.slice(0, 3)]);
    rightIx = answers.indexOf(q.right);
    cursor = 0; picked = -1; timeLeft = TIME; tickSec = 99;
    setState('intro');
    Kit.noise({ dur: 0.35, vol: 0.09, freq: 900, q: 0.7, sweep: 4 });
  }
  function setState(s) { state = s; phaseT = 0; }

  function lockIn(i) {
    if (state !== 'ask') return;
    picked = i; cursor = i;
    // Points are earned when the answer is locked: 100 plus a third of the tenths of a second left.
    lastPts = 100 + Math.floor(Math.max(0, timeLeft) * 10 / 3);
    setState('locked');
    Kit.tone(392, { type: 'square', dur: 0.08, vol: 0.08 });
    Kit.tone(784, { type: 'triangle', dur: 0.16, vol: 0.16, at: 0.04 });
    // Drumroll
    for (let k = 0; k < 9; k++) Kit.noise({ dur: 0.05, vol: 0.05 + k * 0.006, freq: 260, q: 1.2, at: 0.1 + k * 0.05, type: 'lowpass' });
  }

  function reveal() {
    setState('reveal');
    const L0 = L.btn[rightIx];
    if (picked === rightIx) {
      correct++; streak++; bestStreak = Math.max(bestStreak, streak);
      results.push(1);
      // Ding!
      Kit.tone(NOTES[7], { type: 'sine', dur: 0.7, vol: 0.2 });
      Kit.tone(NOTES[7] * 2, { type: 'sine', dur: 0.4, vol: 0.06 });
      Kit.tone(NOTES[9], { type: 'triangle', dur: 0.5, vol: 0.12, at: 0.09 });
      Kit.noise({ dur: 0.3, vol: 0.06, freq: 7000, q: 0.5, type: 'highpass' });
      Kit.burst(L0.x + L0.w / 2, L0.y + L0.h / 2, GREEN, 26, 1.1);
      Kit.burst(L0.x + L0.w / 2, L0.y + L0.h / 2, GOLD, 14, 0.9);
      flyers.push({ x0: L0.x + L0.w / 2, y0: L0.y + L0.h / 2, t: 0, pts: lastPts, done: false });
      const fast = lastPts >= 140;
      if (streak >= 3) {
        Kit.float(`🔥 ${streak} in a row!`, Kit.W / 2, L.card.y + L.card.h * 0.5, { color: '#ff9b3d', size: L.u * 52, life: 1.4, big: true });
        Kit.tone(NOTES[5], { type: 'triangle', dur: 0.2, vol: 0.1, at: 0.25 });
        Kit.tone(NOTES[8], { type: 'triangle', dur: 0.3, vol: 0.1, at: 0.33 });
      } else if (fast) {
        Kit.float('Lightning fast!', Kit.W / 2, L.card.y + L.card.h * 0.5, { color: '#7de8ff', size: L.u * 50, life: 1.3, big: true });
      } else {
        Kit.float('Correct!', Kit.W / 2, L.card.y + L.card.h * 0.5, { color: '#7dff9b', size: L.u * 56, life: 1.2, big: true });
      }
    } else {
      streak = 0;
      results.push(0);
      Kit.tone(130, { type: 'sawtooth', dur: 0.45, vol: 0.12 });
      Kit.tone(98, { type: 'square', dur: 0.5, vol: 0.07 });
      Kit.shake(8, 0.3);
      if (picked >= 0) {
        const b = L.btn[picked];
        Kit.burst(b.x + b.w / 2, b.y + b.h / 2, RED, 12, 0.7);
        Kit.float('Not quite!', Kit.W / 2, L.card.y + L.card.h * 0.5, { color: '#ff8a8a', size: L.u * 52, life: 1.2, big: true });
      } else {
        Kit.float("Time's up!", Kit.W / 2, L.card.y + L.card.h * 0.5, { color: '#ffb23f', size: L.u * 56, life: 1.2, big: true });
      }
    }
  }

  function finish() {
    setState('results');
    newBest = false;
    const cat = CATS[catIx];
    if (score > (bests[cat.id] || 0)) {
      newBest = bests[cat.id] > 0 || score > 0;
      bests[cat.id] = score;
      Kit.store.set('quizshow.best', bests);
    }
    Kit.record('quizshow', topBest());
    if (correct >= TOTAL / 2) { sfx.win(); Kit.confetti(correct >= 9 ? 180 : 110); } else sfx.over();
  }
  const starsFor = (n) => (n >= 9 ? 3 : n >= 7 ? 2 : n >= 5 ? 1 : 0);

  function toMenu() { setState('menu'); menuCursor = catIx; flyers.length = 0; }

  // ---------- Layout ----------
  let L = { u: 1, btn: [], card: { x: 0, y: 0, w: 1, h: 1 }, cards: [] };
  function layout(W, H) {
    if (!W || !H) return;
    const wide = W >= H;
    const u = wide ? Math.min(W / 1280, H / 720) : Math.min(W / 720, H / 1280);
    const card = wide
      ? { w: Math.min(W * 0.84, 1000 * u), h: 196 * u, y: 128 * u }
      : { w: W * 0.92, h: 300 * u, y: 170 * u };
    card.x = (W - card.w) / 2;
    const gap = 22 * u;
    const btn = [];
    if (wide) {
      const bw = (card.w - gap) / 2, bh = Math.min(128 * u, (H - (card.y + card.h + 40 * u) - 70 * u - gap) / 2);
      const y0 = card.y + card.h + 36 * u;
      for (let i = 0; i < 4; i++) btn.push({ x: card.x + (i % 2) * (bw + gap), y: y0 + Math.floor(i / 2) * (bh + gap), w: bw, h: bh });
    } else {
      const bw = card.w, bh = 120 * u;
      const y0 = card.y + card.h + 40 * u;
      for (let i = 0; i < 4; i++) btn.push({ x: card.x, y: y0 + i * (bh + gap), w: bw, h: bh });
    }
    const top = wide ? 58 * u : 70 * u;
    L = { u, wide, card, btn, top, score: { x: card.x + 10 * u, y: top }, cards: L.cards };
    sprites.clear();
    buildStage(W, H);
  }
  Kit.onResize(layout);

  // ---------- Cached pictures (gradients are slow on TV boxes) ----------
  const sprites = new Map();
  const DPR = () => Math.min(window.devicePixelRatio || 1, 2);
  function sprite(name, w, h, draw, pad = 0) {
    const k = `${name}|${Math.round(w)}|${Math.round(h)}`;
    let s = sprites.get(k);
    if (s) return s;
    const d = DPR();
    s = document.createElement('canvas');
    s.width = Math.ceil((w + pad * 2) * d); s.height = Math.ceil((h + pad * 2) * d);
    const c = s.getContext('2d');
    c.scale(d, d); c.translate(pad, pad);
    draw(c, w, h);
    s.pad = pad;
    sprites.set(k, s);
    return s;
  }
  function blit(c, s, x, y, w, h) {
    const p = s.pad || 0;
    c.drawImage(s, x - p, y - p, w + p * 2, h + p * 2);
  }

  // Answer button: a glossy coloured pill with a letter badge.
  const buttonPic = (color, w, h) => sprite('btn' + color, w, h, (c) => {
    const r = h * 0.3;
    // Lower lip gives depth.
    roundRect(c, 0, h * 0.06, w, h * 0.94, r); c.fillStyle = shade(color, -0.55); c.fill();
    roundRect(c, 0, 0, w, h * 0.92, r);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, shade(color, 0.22)); g.addColorStop(0.55, color); g.addColorStop(1, shade(color, -0.3));
    c.fillStyle = g; c.fill();
    c.lineWidth = Math.max(2, h * 0.025); c.strokeStyle = shade(color, 0.45); c.stroke();
    // Gloss
    c.save(); roundRect(c, 0, 0, w, h * 0.92, r); c.clip();
    const gl = c.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, 'rgba(255,255,255,0.38)'); gl.addColorStop(1, 'rgba(255,255,255,0.02)');
    c.fillStyle = gl; roundRect(c, h * 0.08, h * 0.05, w - h * 0.16, h * 0.4, h * 0.2); c.fill();
    c.restore();
    // Badge
    const bx = h * 0.48, by = h * 0.46, br = h * 0.29;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.arc(bx, by + h * 0.03, br, 0, Math.PI * 2); c.fill();
    const bg = c.createRadialGradient(bx - br * 0.3, by - br * 0.4, br * 0.1, bx, by, br);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(1, '#dfe6ff');
    c.fillStyle = bg; c.beginPath(); c.arc(bx, by, br, 0, Math.PI * 2); c.fill();
  });
  // Soft glow ring around a button: blurred once here, never per frame.
  const glowPic = (color, w, h) => sprite('glow' + color, w, h, (c) => {
    c.shadowColor = color; c.shadowBlur = h * 0.35;
    c.lineWidth = h * 0.06; c.strokeStyle = color;
    roundRect(c, 0, 0, w, h * 0.96, h * 0.3); c.stroke();
    c.shadowBlur = h * 0.15; c.stroke();
  }, h * 0.45);
  // The question card: dark glass with a golden rim.
  const cardPic = (w, h) => sprite('card', w, h, (c) => {
    const r = h * 0.16;
    roundRect(c, 0, 0, w, h, r);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d2f7a'); g.addColorStop(1, '#0b1440');
    c.fillStyle = g; c.fill();
    c.lineWidth = h * 0.035; const rg = c.createLinearGradient(0, 0, w, h);
    rg.addColorStop(0, '#ffe7a0'); rg.addColorStop(0.5, '#ffb81c'); rg.addColorStop(1, '#ffe7a0');
    c.strokeStyle = rg; c.stroke();
    roundRect(c, h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12, r * 0.7);
    c.lineWidth = 2; c.strokeStyle = 'rgba(140,180,255,0.25)'; c.stroke();
    c.save(); roundRect(c, 0, 0, w, h, r); c.clip();
    const gl = c.createLinearGradient(0, 0, 0, h * 0.5);
    gl.addColorStop(0, 'rgba(160,200,255,0.18)'); gl.addColorStop(1, 'rgba(160,200,255,0)');
    c.fillStyle = gl; c.fillRect(0, 0, w, h * 0.5);
    c.restore();
  });
  // The back of the card, seen while it flips.
  const cardBackPic = (w, h) => sprite('cardback', w, h, (c) => {
    const r = h * 0.16;
    roundRect(c, 0, 0, w, h, r);
    const g = c.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#ffcf4a'); g.addColorStop(1, '#e8890c');
    c.fillStyle = g; c.fill();
    c.lineWidth = h * 0.035; c.strokeStyle = '#fff1c4'; c.stroke();
    c.font = `900 ${h * 0.6}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(120,50,0,0.35)'; c.fillText('?', w / 2 + h * 0.03, h / 2 + h * 0.05);
    c.fillStyle = '#fffbe8'; c.fillText('?', w / 2, h / 2);
  });
  const bulbPic = (on, s) => sprite('bulb' + on, s, s, (c) => {
    const g = c.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    if (on) { g.addColorStop(0, '#ffffff'); g.addColorStop(0.3, '#fff0b0'); g.addColorStop(0.55, 'rgba(255,200,60,0.55)'); g.addColorStop(1, 'rgba(255,180,40,0)'); }
    else { g.addColorStop(0, '#8a6a2a'); g.addColorStop(0.28, '#5a4420'); g.addColorStop(0.32, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0)'); }
    c.fillStyle = g; c.fillRect(0, 0, s, s);
  });
  const starPic = (filled, s) => sprite('star' + filled, s, s, (c) => {
    c.translate(s / 2, s / 2);
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = (i % 2 ? 0.21 : 0.47) * s, a = -Math.PI / 2 + (i * Math.PI) / 5;
      c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath();
    c.lineJoin = 'round';
    if (filled) {
      const g = c.createLinearGradient(0, -s / 2, 0, s / 2);
      g.addColorStop(0, '#fff6c2'); g.addColorStop(0.5, '#ffc53d'); g.addColorStop(1, '#e07b00');
      c.fillStyle = g; c.fill();
      c.lineWidth = s * 0.05; c.strokeStyle = '#9a4f00'; c.stroke();
    } else {
      c.fillStyle = 'rgba(20,30,80,0.9)'; c.fill();
      c.lineWidth = s * 0.04; c.strokeStyle = 'rgba(150,170,255,0.4)'; c.stroke();
    }
  });
  const panelPic = (w, h) => sprite('panel', w, h, (c) => {
    const r = Math.min(w, h) * 0.08;
    roundRect(c, 0, 0, w, h, r);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#22378c'); g.addColorStop(1, '#0a123a');
    c.fillStyle = g; c.fill();
    c.lineWidth = 4; c.strokeStyle = GOLD; c.stroke();
    c.save(); roundRect(c, 0, 0, w, h, r); c.clip();
    const gl = c.createLinearGradient(0, 0, 0, h * 0.35);
    gl.addColorStop(0, 'rgba(160,200,255,0.16)'); gl.addColorStop(1, 'rgba(160,200,255,0)');
    c.fillStyle = gl; c.fillRect(0, 0, w, h * 0.35); c.restore();
  });
  const menuCardPic = (color, w, h) => sprite('mc' + color, w, h, (c) => {
    const r = h * 0.14;
    roundRect(c, 0, 0, w, h, r);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1d2f7a'); g.addColorStop(1, '#0c1546');
    c.fillStyle = g; c.fill();
    c.save(); roundRect(c, 0, 0, w, h, r); c.clip();
    const tg = c.createLinearGradient(0, 0, 0, h * 0.5);
    tg.addColorStop(0, Kit.rgba(color, 0.45)); tg.addColorStop(1, Kit.rgba(color, 0));
    c.fillStyle = tg; c.fillRect(0, 0, w, h * 0.5);
    c.fillStyle = color; c.fillRect(0, 0, w, h * 0.04);
    c.restore();
    roundRect(c, 0, 0, w, h, r);
    c.lineWidth = 2; c.strokeStyle = Kit.rgba(color, 0.6); c.stroke();
  });

  // ---------- The stage: background drawn once per size; light beams sweep over it ----------
  const stagePic = document.createElement('canvas');
  const beamPic = document.createElement('canvas');
  function buildStage(W, H) {
    const s = 0.5;
    stagePic.width = Math.max(1, Math.round(W * s)); stagePic.height = Math.max(1, Math.round(H * s));
    const c = stagePic.getContext('2d');
    c.scale(s, s);
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0a1a52'); g.addColorStop(0.55, '#06103a'); g.addColorStop(1, '#020619');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    // Back wall: soft vertical panels.
    const n = 14;
    for (let i = 0; i < n; i++) {
      c.fillStyle = i % 2 ? 'rgba(80,120,255,0.035)' : 'rgba(0,0,0,0.06)';
      c.fillRect((i * W) / n, 0, W / n, H * 0.78);
    }
    // Glow behind the card.
    const rg = c.createRadialGradient(W / 2, H * 0.32, 0, W / 2, H * 0.32, W * 0.5);
    rg.addColorStop(0, 'rgba(70,120,255,0.32)'); rg.addColorStop(1, 'rgba(70,120,255,0)');
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // Stage floor with a spotlight pool.
    const fy = H * 0.8;
    const fg = c.createLinearGradient(0, fy, 0, H);
    fg.addColorStop(0, '#0d1f5c'); fg.addColorStop(1, '#030820');
    c.fillStyle = fg; c.fillRect(0, fy, W, H - fy);
    c.fillStyle = 'rgba(120,170,255,0.35)'; c.fillRect(0, fy, W, 2);
    c.save(); c.translate(W / 2, H * 0.92); c.scale(1, 0.16);
    const pg = c.createRadialGradient(0, 0, 0, 0, 0, W * 0.42);
    pg.addColorStop(0, 'rgba(255,230,160,0.45)'); pg.addColorStop(1, 'rgba(255,230,160,0)');
    c.fillStyle = pg; c.beginPath(); c.arc(0, 0, W * 0.42, 0, Math.PI * 2); c.fill();
    c.restore();
    // Vignette
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,8,0.6)');
    c.fillStyle = vg; c.fillRect(0, 0, W, H);

    // One light beam: a soft cone, pointing down from its top centre.
    beamPic.width = 160; beamPic.height = 400;
    const b = beamPic.getContext('2d');
    const bg = b.createLinearGradient(0, 0, 0, 400);
    bg.addColorStop(0, 'rgba(255,240,200,0.55)'); bg.addColorStop(1, 'rgba(255,240,200,0)');
    b.fillStyle = bg;
    b.beginPath(); b.moveTo(72, 0); b.lineTo(88, 0); b.lineTo(160, 400); b.lineTo(0, 400); b.closePath(); b.fill();
    const sg = b.createLinearGradient(0, 0, 160, 0);
    sg.addColorStop(0, 'rgba(0,0,0,1)'); sg.addColorStop(0.35, 'rgba(0,0,0,0)'); sg.addColorStop(0.65, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,1)');
    b.globalCompositeOperation = 'destination-out'; b.fillStyle = sg; b.fillRect(0, 0, 160, 400);
  }
  const BEAMS = [
    { x: 0.08, hue: 'w', a: 0.55, sp: 0.5, ph: 0 }, { x: 0.92, hue: 'w', a: -0.55, sp: 0.45, ph: 2 },
    { x: 0.3, hue: 'w', a: 0.2, sp: 0.7, ph: 4 }, { x: 0.7, hue: 'w', a: -0.2, sp: 0.6, ph: 1 },
  ];
  function drawStage(c, t) {
    const W = Kit.W, H = Kit.H;
    c.imageSmoothingEnabled = true;
    c.drawImage(stagePic, 0, 0, W, H);
    c.save();
    c.globalCompositeOperation = 'lighter';
    const len = H * 1.15, wid = len * 0.42;
    for (const b of BEAMS) {
      const ang = b.a * 0.6 + Math.sin(t * b.sp + b.ph) * 0.28;
      c.save();
      c.translate(W * b.x, -H * 0.04);
      c.rotate(ang);
      c.globalAlpha = 0.22 + Math.sin(t * 0.9 + b.ph) * 0.05;
      c.drawImage(beamPic, -wid / 2, 0, wid, len);
      c.restore();
    }
    c.restore();
  }

  // ---------- Text helpers ----------
  const FONT = 'system-ui, "Segoe UI", Roboto, sans-serif';
  function text(c, str, x, y, size, color, weight = 800, align = 'center') {
    c.font = `${weight} ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.fillStyle = color; c.fillText(str, x, y);
  }
  function outlined(c, str, x, y, size, top, bottom, align = 'center') {
    c.font = `900 ${Math.round(size)}px ${FONT}`;
    c.textAlign = align; c.textBaseline = 'middle';
    c.lineJoin = 'round'; c.lineWidth = size * 0.14; c.strokeStyle = 'rgba(3,8,30,0.92)';
    c.strokeText(str, x, y);
    const g = c.createLinearGradient(0, y - size / 2, 0, y + size / 2);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    c.fillStyle = g; c.fillText(str, x, y);
  }
  // Word-wraps to at most maxLines, shrinking the font until it fits. Cached per string and size.
  const wrapCache = new Map();
  function fit(c, str, maxW, size, maxLines, weight = 800) {
    const k = `${str}|${Math.round(maxW)}|${Math.round(size)}|${maxLines}|${weight}`;
    const hit = wrapCache.get(k);
    if (hit) return hit;
    let s = size, lines;
    for (; s > size * 0.45; s *= 0.93) {
      c.font = `${weight} ${Math.round(s)}px ${FONT}`;
      lines = [];
      let line = '';
      for (const w of str.split(' ')) {
        const tryL = line ? line + ' ' + w : w;
        if (c.measureText(tryL).width > maxW && line) { lines.push(line); line = w; } else line = tryL;
      }
      lines.push(line);
      if (lines.length <= maxLines && lines.every((l) => c.measureText(l).width <= maxW)) break;
    }
    const out = { lines, size: Math.round(s) };
    if (wrapCache.size > 400) wrapCache.clear();
    wrapCache.set(k, out);
    return out;
  }

  // ---------- Keys and taps ----------
  const muteBox = () => ({ x: Kit.W - 62 * L.u, y: 10 * L.u, w: 52 * L.u, h: 52 * L.u });
  function moveCursor(cur, k, cols, rows) {
    let x = cur % cols, y = Math.floor(cur / cols);
    if (k === 'left') x = (x + cols - 1) % cols;
    else if (k === 'right') x = (x + 1) % cols;
    else if (k === 'up') y = (y + rows - 1) % rows;
    else if (k === 'down') y = (y + 1) % rows;
    return y * cols + x;
  }
  Kit.onKeys((k) => {
    if (k === 'mute') { Kit.toggleMute(); return; }
    if (paused) { if (k === 'ok' || k === 'up' || k === 'down' || k === 'left' || k === 'right') { paused = false; sfx.pick(); } return; }
    if (state === 'menu') {
      if (k === 'ok') { start(); return; }
      const cols = L.wide ? 3 : 2;
      const n = moveCursor(menuCursor, k, cols, Math.ceil(CATS.length / cols));
      if (n !== menuCursor && n < CATS.length) { menuCursor = n; sfx.move(); }
      return;
    }
    if (state === 'results') {
      if (phaseT < 1.4) return;
      if (k === 'ok') start();
      else if (k === 'up' || k === 'down' || k === 'left' || k === 'right') { sfx.move(); toMenu(); }
      return;
    }
    if (state === 'ask' || state === 'intro') {
      if (k === 'ok') { if (state === 'ask') lockIn(cursor); return; }
      const n = L.wide ? moveCursor(cursor, k, 2, 2) : moveCursor(cursor, k === 'left' ? 'up' : k === 'right' ? 'down' : k, 1, 4);
      if (n !== cursor) { cursor = n; Kit.tone(560 + n * 70, { type: 'triangle', dur: 0.05, vol: 0.09 }); }
    }
  });
  const inBox = (e, r) => r && e.x >= r.x && e.y >= r.y && e.x <= r.x + r.w && e.y <= r.y + r.h;
  Kit.onPointer({
    down(e) {
      if (inBox(e, muteBox())) { Kit.toggleMute(); return; }
      if (paused) { paused = false; return; }
      if (state === 'menu') {
        const i = L.cards.findIndex((r) => inBox(e, r));
        if (i >= 0) { if (i === menuCursor) start(); else { menuCursor = i; sfx.move(); } }
        return;
      }
      if (state === 'results') {
        if (phaseT < 1.4) return;
        if (inBox(e, L.menuBtn)) { sfx.move(); toMenu(); } else start();
        return;
      }
      if (state === 'ask') {
        const i = L.btn.findIndex((r) => inBox(e, r));
        if (i >= 0) lockIn(i);
      }
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (state === 'ask' || state === 'intro' || state === 'locked' || state === 'reveal')) paused = true;
  });

  // ---------- Update ----------
  function update(dt) {
    stateT += dt;
    flameT += dt;
    if (!L.btn.length) layout(Kit.W, Kit.H);
    shown += (score - shown) * Math.min(1, dt * 9);
    if (Math.abs(score - shown) < 0.5) shown = score;
    bump = Math.max(0, bump - dt * 3);
    if (paused) return;
    phaseT += dt;
    for (const f of flyers) {
      f.t += dt / 0.75;
      if (f.t >= 1 && !f.done) {
        f.done = true; score += f.pts; bump = 1;
        Kit.burst(L.score.x + 70 * L.u, L.score.y, GOLD, 16, 0.8);
        Kit.tone(NOTES[5], { type: 'square', dur: 0.06, vol: 0.06 });
        Kit.tone(NOTES[8], { type: 'square', dur: 0.12, vol: 0.06, at: 0.06 });
      }
    }
    for (let i = flyers.length - 1; i >= 0; i--) if (flyers[i].t > 1.2) flyers.splice(i, 1);

    if (state === 'intro' && phaseT > 0.95) setState('ask');
    else if (state === 'ask') {
      timeLeft -= dt;
      const sec = Math.ceil(timeLeft);
      if (sec !== tickSec) {
        tickSec = sec;
        if (sec <= 5 && sec > 0) {
          Kit.tone(sec <= 3 ? 1100 : 880, { type: 'square', dur: 0.04, vol: 0.06 });
          Kit.noise({ dur: 0.03, vol: 0.05, freq: 3500, q: 2 });
        }
      }
      if (timeLeft <= 0) { timeLeft = 0; picked = -1; reveal(); }
    } else if (state === 'locked' && phaseT > 0.65) reveal();
    else if (state === 'reveal' && phaseT > 2.1 && flyers.length === 0) {
      if (num + 1 >= round.length) finish(); else ask(num + 1);
    } else if (state === 'results') {
      // Stars pop in one by one.
      const st = starsFor(correct);
      for (let i = 0; i < 3; i++) {
        const at = 0.7 + i * 0.35;
        if (phaseT - dt < at && phaseT >= at && i < st) {
          [0, 2, 4].forEach((n, j) => Kit.tone(NOTES[Math.min(9, n + i * 2)], { type: 'triangle', dur: 0.25, vol: 0.14, at: j * 0.05 }));
          const p = L.starPos && L.starPos[i];
          if (p) Kit.burst(p.x, p.y, GOLD, 20, 1);
        }
      }
    }
  }

  // ---------- Drawing ----------
  function draw(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    drawStage(c, t);
    if (!L.btn.length) return;
    if (state === 'menu') drawMenu(c, t);
    else if (state === 'results') { drawHud(c, t); drawResults(c, t); }
    else { drawHud(c, t); drawQuestion(c, t); drawAnswers(c, t); drawFlyers(c); }

    const mb = muteBox();
    c.globalAlpha = 0.75; text(c, Kit.muted ? '🔇' : '🔊', mb.x + mb.w / 2, mb.y + mb.h / 2, mb.h * 0.55, '#fff', 400); c.globalAlpha = 1;

    if (paused) {
      c.fillStyle = 'rgba(2,6,25,0.72)'; c.fillRect(0, 0, W, H);
      outlined(c, 'Paused', W / 2, H * 0.42, 90 * u, '#ffffff', GOLD);
      text(c, Kit.touchFirst() ? 'Tap to carry on' : 'OK to carry on  ·  Back for games', W / 2, H * 0.56, 34 * u, 'rgba(255,255,255,0.85)', 700);
    }
  }

  function drawHud(c, t) {
    const W = Kit.W, u = L.u, ty = L.top;
    // Score
    const sx = L.score.x;
    text(c, 'SCORE', sx, ty - 30 * u, 18 * u, 'rgba(180,200,255,0.75)', 800, 'left');
    c.save();
    c.translate(sx, ty + 4 * u); c.scale(1 + bump * 0.22, 1 + bump * 0.22);
    outlined(c, String(Math.round(shown)), 0, 0, 46 * u, '#fff6c2', '#ffb703', 'left');
    c.restore();
    c.font = `900 ${Math.round(46 * u)}px ${FONT}`;
    const sw = c.measureText(String(Math.round(shown))).width;
    // Streak flames
    if (streak >= 2 && state !== 'results') {
      const fx = sx + sw + 36 * u;
      const fl = 1 + Math.sin(flameT * 14) * 0.06 + Math.min(streak, 6) * 0.03;
      roundRect(c, fx - 6 * u, ty - 20 * u, 98 * u, 44 * u, 22 * u);
      c.fillStyle = 'rgba(255,110,40,0.22)'; c.fill();
      c.lineWidth = 2; c.strokeStyle = 'rgba(255,150,60,0.7)'; c.stroke();
      c.save(); c.translate(fx + 20 * u, ty + 1 * u); c.scale(fl, fl);
      text(c, '🔥', 0, 0, 30 * u, '#fff', 400);
      c.restore();
      outlined(c, `×${streak}`, fx + 42 * u, ty + 2 * u, 30 * u, '#ffe1a8', '#ff7a1a', 'left');
    }
    // Progress dots
    if (L.wide || true) {
      const n = round.length || TOTAL, r = 9 * u, gap = 30 * u;
      const x0 = W / 2 - ((n - 1) * gap) / 2, y = L.wide ? ty - 8 * u : ty + 44 * u;
      if (L.wide) text(c, `Question ${Math.min(num + 1, n)} of ${n}`, W / 2, y + 30 * u, 20 * u, 'rgba(210,225,255,0.85)', 800);
      for (let i = 0; i < n; i++) {
        const x = x0 + i * gap;
        const res = results[i];
        c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2);
        if (res === 1) c.fillStyle = GREEN; else if (res === 0) c.fillStyle = RED;
        else if (i === num && state !== 'results') c.fillStyle = GOLD; else c.fillStyle = 'rgba(120,145,230,0.3)';
        c.fill();
        if (i === num && state !== 'results' && res === undefined) {
          c.lineWidth = 3 * u; c.strokeStyle = `rgba(255,197,61,${0.4 + Math.sin(t * 6) * 0.3})`;
          c.beginPath(); c.arc(x, y, r + 5 * u, 0, Math.PI * 2); c.stroke();
        }
      }
    }
    // Best
    const best = Math.max(bests[CATS[catIx].id] || 0, score);
    text(c, `👑 ${best}`, W - 80 * u, L.top, 28 * u, '#ffd76a', 900, 'right');
  }

  function drawQuestion(c, t) {
    const u = L.u, cd = L.card;
    // Flip: the gold back turns over to show the question.
    const fp = state === 'intro' ? clamp(phaseT / 0.55, 0, 1) : 1;
    const ang = Math.PI * (1 - ease.out(fp));
    const sx = Math.max(0.02, Math.abs(Math.cos(ang)));
    const back = ang > Math.PI / 2;
    const cx = cd.x + cd.w / 2, cy = cd.y + cd.h / 2;
    const lift = Math.sin(ang) * 0.06;
    c.save();
    c.translate(cx, cy); c.scale(sx * (1 + lift), 1 + lift);
    if (back) {
      blit(c, cardBackPic(cd.w, cd.h), -cd.w / 2, -cd.h / 2, cd.w, cd.h);
      c.restore();
      return;
    }
    blit(c, cardPic(cd.w, cd.h), -cd.w / 2, -cd.h / 2, cd.w, cd.h);
    // Chasing marquee bulbs along the rim.
    const bs = 26 * u, per = 2 * (cd.w + cd.h), nb = Math.floor(per / (34 * u));
    const chase = Math.floor(t * 8);
    const fast = state === 'reveal' && picked === rightIx;
    for (let i = 0; i < nb; i++) {
      let d = (i / nb) * per, x, y;
      const hw = cd.w / 2 - 14 * u, hh = cd.h / 2 - 14 * u;
      const pw = hw * 2, ph = hh * 2;
      d = (d / per) * (2 * (pw + ph));
      if (d < pw) { x = -hw + d; y = -hh; } else if (d < pw + ph) { x = hw; y = -hh + (d - pw); }
      else if (d < 2 * pw + ph) { x = hw - (d - pw - ph); y = hh; } else { x = -hw; y = hh - (d - 2 * pw - ph); }
      const on = fast ? (Math.floor(t * 12) % 2 === 0) : (i + chase) % 3 === 0;
      c.drawImage(bulbPic(on, bs), x - bs / 2, y - bs / 2, bs, bs);
    }
    // Question text
    // Dim the question for a moment while the verdict pops up over it.
    const dim = state === 'reveal' ? 0.25 + 0.75 * clamp((phaseT - 1.1) / 0.4, 0, 1) : 1;
    c.globalAlpha = dim;
    const f = fit(c, q.text, cd.w - 120 * u, 44 * u, 2);
    const lh = f.size * 1.22;
    const y0 = 10 * u - ((f.lines.length - 1) * lh) / 2;
    f.lines.forEach((ln, i) => {
      c.font = `800 ${f.size}px ${FONT}`;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(0,0,20,0.5)'; c.fillText(ln, 0, y0 + i * lh + 3 * u);
      c.fillStyle = '#ffffff'; c.fillText(ln, 0, y0 + i * lh);
    });
    c.globalAlpha = 1;
    c.restore();

    // Category chip on the card's top-left edge.
    const chip = `${TOPIC_ICON[q.topic] || '❓'} ${q.topic}`;
    c.font = `800 ${Math.round(22 * u)}px ${FONT}`;
    const cw = c.measureText(chip).width + 36 * u, ch = 40 * u;
    const chx = cd.x + 34 * u, chy = cd.y - ch / 2;
    const ca = state === 'intro' ? clamp((phaseT - 0.3) / 0.3, 0, 1) : 1;
    if (ca > 0) {
      c.save(); c.globalAlpha = ca;
      roundRect(c, chx, chy, cw, ch, ch / 2);
      c.fillStyle = '#ffc53d'; c.fill();
      c.lineWidth = 3 * u; c.strokeStyle = '#fff1c4'; c.stroke();
      text(c, chip, chx + cw / 2, chy + ch / 2 + 1, 22 * u, '#3a2200', 800);
      c.restore();
    }

    // Countdown ring on the top-right edge.
    const rr = 40 * u, rx = cd.x + cd.w - 70 * u, ry = cd.y;
    const frac = clamp(timeLeft / TIME, 0, 1);
    const col = frac > 0.5 ? '#2de2e6' : frac > 0.25 ? '#ffc53d' : '#ff4d4d';
    const urgent = state === 'ask' && timeLeft <= 5;
    const pulse = urgent ? 1 + Math.max(0, Math.sin(t * Math.PI * 2 * 1)) * 0.08 : 1;
    c.save(); c.translate(rx, ry); c.scale(pulse, pulse);
    c.beginPath(); c.arc(0, 0, rr + 6 * u, 0, Math.PI * 2); c.fillStyle = '#0a1440'; c.fill();
    c.lineWidth = 3 * u; c.strokeStyle = '#ffc53d'; c.stroke();
    c.beginPath(); c.arc(0, 0, rr - 4 * u, 0, Math.PI * 2);
    c.lineWidth = 9 * u; c.strokeStyle = 'rgba(120,150,255,0.2)'; c.stroke();
    c.beginPath(); c.arc(0, 0, rr - 4 * u, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
    c.lineCap = 'round'; c.strokeStyle = col; c.stroke(); c.lineCap = 'butt';
    text(c, String(Math.ceil(timeLeft)), 0, 2 * u, 34 * u, urgent ? '#ffd0d0' : '#ffffff', 900);
    c.restore();
  }

  function drawAnswers(c, t) {
    const u = L.u;
    const showing = state === 'reveal';
    answers.forEach((ans, i) => {
      const b = L.btn[i];
      // Slide in one after another after the card flips.
      const inT = state === 'intro' ? clamp((phaseT - 0.35 - i * 0.08) / 0.35, 0, 1) : 1;
      if (inT <= 0) return;
      const sel = (state === 'ask' && i === cursor) || ((state === 'locked' || showing) && i === picked);
      let color = ANS[i].color, alpha = 1, glow = null, dx = 0, scale = 1, mark = '';
      if (state === 'ask' || state === 'intro') {
        alpha = i === cursor ? 1 : 0.82;
        if (i === cursor && state === 'ask') { glow = '#ffffff'; scale = 1.04 + Math.sin(t * 6) * 0.01; }
      } else if (state === 'locked') {
        if (i === picked) { color = '#ffb21c'; glow = '#ffe08a'; scale = 1.05 + Math.sin(t * 22) * 0.012; } else alpha = 0.45;
      } else if (showing) {
        if (i === rightIx) {
          color = GREEN; glow = '#7dffa8'; mark = '✓';
          scale = 1.05 + Math.sin(phaseT * 8) * 0.015 * Math.max(0, 1 - phaseT / 2);
        } else if (i === picked) {
          color = RED; mark = '✕'; glow = '#ff7a7a';
          dx = Math.sin(phaseT * 55) * 12 * u * Math.max(0, 1 - phaseT * 2.2);
        } else alpha = 0.32;
      }
      const ek = ease.back(inT);
      const ox = (1 - ek) * (i % 2 === 0 || !L.wide ? -1 : 1) * 120 * u;
      c.save();
      c.globalAlpha = alpha * Math.min(1, inT * 1.5);
      c.translate(b.x + b.w / 2 + dx + ox, b.y + b.h / 2);
      c.scale(scale, scale);
      if (glow) {
        const ga = showing && i === rightIx ? 0.75 + Math.sin(t * 10) * 0.25 : 0.65 + Math.sin(t * 6) * 0.25;
        c.globalAlpha = alpha * ga;
        blit(c, glowPic(glow, b.w, b.h), -b.w / 2, -b.h / 2, b.w, b.h);
        c.globalAlpha = alpha * Math.min(1, inT * 1.5);
      }
      blit(c, buttonPic(color, b.w, b.h), -b.w / 2, -b.h / 2, b.w, b.h);
      // Letter in the badge, or ✓ / ✕ when revealed.
      const bx = -b.w / 2 + b.h * 0.48, by = -b.h / 2 + b.h * 0.46;
      text(c, mark || ANS[i].letter, bx, by + 2 * u, b.h * 0.34, mark ? (mark === '✓' ? '#14833c' : '#c41f1f') : shade(ANS[i].color, -0.25), 900);
      // Answer text
      const tx = -b.w / 2 + b.h * 0.95, maxW = b.w - b.h * 1.15;
      const f = fit(c, ans, maxW, 38 * u, 2);
      const lh = f.size * 1.15, y0 = -b.h * 0.04 - ((f.lines.length - 1) * lh) / 2;
      c.font = `800 ${f.size}px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
      f.lines.forEach((ln, j) => {
        c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillText(ln, tx + 2 * u, y0 + j * lh + 3 * u);
        c.fillStyle = '#ffffff'; c.fillText(ln, tx, y0 + j * lh);
      });
      c.restore();
    });
    // Hint under the buttons.
    const last = L.btn[3];
    if (state === 'ask' || state === 'intro') {
      const hint = Kit.touchFirst() ? 'Tap an answer' : 'Arrows pick an answer  ·  OK locks it in';
      text(c, hint, Kit.W / 2, last.y + last.h + 30 * u, 22 * u, 'rgba(200,215,255,0.7)', 700);
    } else if (state === 'locked') {
      text(c, 'Final answer…', Kit.W / 2, last.y + last.h + 30 * u, 24 * u, '#ffd76a', 800);
    } else if (showing && picked !== rightIx) {
      text(c, `The answer is ${ANS[rightIx].letter}: ${q.right}`, Kit.W / 2, last.y + last.h + 30 * u, 24 * u, '#9dffbb', 800);
    }
  }

  function drawFlyers(c) {
    const u = L.u;
    for (const f of flyers) {
      if (f.t >= 1) continue;
      const k = ease.inOut(clamp(f.t, 0, 1));
      const tx = L.score.x + 60 * u, ty = L.score.y;
      // An arc up and over to the score.
      const x = lerp(f.x0, tx, k), y = lerp(f.y0, ty, k) - Math.sin(k * Math.PI) * 120 * u;
      const s = (1 - k * 0.45) * 46 * u;
      c.save(); c.translate(x, y);
      outlined(c, `+${f.pts}`, 0, 0, s, '#fff6c2', '#ffb703');
      c.restore();
      c.globalAlpha = 0.6;
      for (let j = 1; j <= 4; j++) {
        const kk = ease.inOut(clamp(f.t - j * 0.04, 0, 1));
        const px = lerp(f.x0, tx, kk), py = lerp(f.y0, ty, kk) - Math.sin(kk * Math.PI) * 120 * u;
        c.fillStyle = GOLD; c.beginPath(); c.arc(px, py, (8 - j * 1.4) * u, 0, Math.PI * 2); c.fill();
      }
      c.globalAlpha = 1;
    }
  }

  function drawMenu(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u, wide = L.wide;
    // Title with a bobbing ?
    const ty = wide ? 92 * u : 130 * u;
    const pop = 1 + Math.sin(t * 2.5) * 0.02;
    c.save(); c.translate(W / 2, ty); c.scale(pop, pop);
    outlined(c, 'QUIZ SHOW', 0, 0, (wide ? 88 : 96) * u, '#fff6c2', '#ffb21c');
    c.restore();
    text(c, Kit.touchFirst() ? 'Tap a category to play' : 'Arrows choose a category  ·  OK to play', W / 2, ty + 70 * u, 26 * u, 'rgba(210,225,255,0.85)', 700);
    const cols = wide ? 3 : 2, rows = Math.ceil(CATS.length / cols);
    const gap = 26 * u;
    const cw = wide ? Math.min(330 * u, (W * 0.86 - gap * 2) / 3) : (W * 0.92 - gap) / 2;
    const ch = wide ? 190 * u : 230 * u;
    const gx = (W - (cw * cols + gap * (cols - 1))) / 2;
    const gy = wide ? 215 * u : 300 * u;
    L.cards = CATS.map((cat, i) => ({ x: gx + (i % cols) * (cw + gap), y: gy + Math.floor(i / cols) * (ch + gap), w: cw, h: ch }));
    CATS.forEach((cat, i) => {
      const r = L.cards[i], on = i === menuCursor;
      const appear = ease.back(clamp((stateT - i * 0.06) / 0.45, 0, 1));
      const k = (on ? 1.07 + Math.sin(t * 5) * 0.012 : 1) * appear;
      if (k <= 0.01) return;
      c.save();
      c.translate(r.x + r.w / 2, r.y + r.h / 2); c.scale(k, k);
      if (on) { c.globalAlpha = 0.7 + Math.sin(t * 6) * 0.25; blit(c, glowPic('#ffd76a', r.w, r.h), -r.w / 2, -r.h / 2, r.w, r.h); c.globalAlpha = 1; }
      c.globalAlpha = on ? 1 : 0.88;
      blit(c, menuCardPic(cat.color, r.w, r.h), -r.w / 2, -r.h / 2, r.w, r.h);
      if (on) { roundRect(c, -r.w / 2, -r.h / 2, r.w, r.h, r.h * 0.14); c.lineWidth = 4 * u; c.strokeStyle = GOLD; c.stroke(); }
      text(c, cat.icon, 0, -r.h * 0.22, r.h * 0.26, '#fff', 400);
      const f = fit(c, cat.name, r.w * 0.9, r.h * 0.15, 1, 900);
      text(c, cat.name, 0, r.h * 0.07, f.size, '#ffffff', 900);
      text(c, cat.tip, 0, r.h * 0.22, r.h * 0.085, 'rgba(210,225,255,0.75)', 600);
      text(c, `👑 ${bests[cat.id]}`, 0, r.h * 0.37, r.h * 0.1, '#ffd76a', 800);
      c.restore();
    });
    const by = gy + rows * (ch + gap) + 16 * u;
    text(c, '10 questions  ·  15 seconds each  ·  answer fast for bonus points', W / 2, by, 22 * u, 'rgba(200,215,255,0.7)', 600);
  }

  function drawResults(c, t) {
    const W = Kit.W, H = Kit.H, u = L.u;
    const a = clamp(phaseT / 0.45, 0, 1);
    c.fillStyle = `rgba(2,6,25,${0.6 * a})`; c.fillRect(0, 0, W, H);
    const pw = Math.min(W * 0.9, 720 * u), ph = Math.min(H * 0.8, 530 * u);
    c.save();
    c.translate(W / 2, H / 2 + 6 * u);
    const k = ease.back(a); c.scale(k, k);
    blit(c, panelPic(pw, ph), -pw / 2, -ph / 2, pw, ph);
    const st = starsFor(correct);
    const title = st === 3 ? 'Superstar!' : st === 2 ? 'Great show!' : st === 1 ? 'Well played!' : 'Better luck next time';
    outlined(c, title, 0, -ph * 0.4, (st ? 56 : 44) * u, '#ffffff', '#9fc3ff');
    // Stars
    const ss = 92 * u;
    L.starPos = [];
    for (let i = 0; i < 3; i++) {
      const x = (i - 1) * ss * 1.15, y = -ph * 0.2 + (i === 1 ? -14 * u : 6 * u);
      L.starPos.push({ x: W / 2 + x * k, y: H / 2 + 6 * u + y * k });
      const at = 0.7 + i * 0.35;
      const lit = i < st && phaseT >= at;
      const sk = lit ? ease.elastic(clamp((phaseT - at) / 0.6, 0, 1)) : 1;
      const s = (i === 1 ? ss * 1.15 : ss) * sk;
      c.save(); c.translate(x, y); c.rotate(lit ? Math.sin(t * 2 + i) * 0.06 : 0);
      c.drawImage(starPic(false, ss * 1.15), -(i === 1 ? ss * 1.15 : ss) / 2, -(i === 1 ? ss * 1.15 : ss) / 2, i === 1 ? ss * 1.15 : ss, i === 1 ? ss * 1.15 : ss);
      if (lit) c.drawImage(starPic(true, ss * 1.15), -s / 2, -s / 2, s, s);
      c.restore();
    }
    text(c, `${correct} of ${round.length} right`, 0, -ph * 0.02, 32 * u, '#ffffff', 800);
    outlined(c, String(Math.round(shown)), 0, ph * 0.12, 72 * u, '#fff6c2', '#ffb703');
    const cat = CATS[catIx];
    const best = bests[cat.id];
    text(c, newBest && phaseT > 1.2 ? '🎉 New best score!' : `👑 Best ${best}  ·  ${cat.icon} ${cat.name}`, 0, ph * 0.24, 26 * u, newBest ? '#ffd76a' : 'rgba(220,230,255,0.9)', 800);
    if (bestStreak >= 2) text(c, `🔥 Best streak ${bestStreak}`, 0, ph * 0.31, 22 * u, '#ffb27a', 700);
    const ready = phaseT > 1.4;
    c.globalAlpha = ready ? 1 : 0.4;
    // Play-again pill
    const bw = 300 * u, bh = 56 * u, by = ph * 0.36;
    roundRect(c, -bw / 2, by, bw, bh, bh / 2);
    c.fillStyle = GOLD; c.fill();
    text(c, Kit.touchFirst() ? 'Tap to play again' : 'OK  play again', 0, by + bh / 2 + 1, 26 * u, '#3a2200', 900);
    c.globalAlpha = 1;
    c.restore();
    const mw = 420 * u, mh = 40 * u, my = H / 2 + 6 * u + (ph / 2 + 16 * u) * k;
    c.globalAlpha = ready ? a : 0.4 * a;
    roundRect(c, W / 2 - mw / 2, my, mw, mh, mh / 2);
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill();
    text(c, Kit.touchFirst() ? 'Other categories' : 'Arrows  other categories', W / 2, my + mh / 2, 20 * u, 'rgba(230,236,255,0.9)', 700);
    c.globalAlpha = 1;
    L.menuBtn = { x: W / 2 - mw / 2, y: my, w: mw, h: mh };
  }

  // ---------- Start ----------
  window.addEventListener('load', () => Kit.canvas.focus());
  Kit.run(update, draw);
  layout(Kit.W, Kit.H);
  Kit.canvas.focus();
  if (topBest() > 0) Kit.record('quizshow', topBest());
})();
