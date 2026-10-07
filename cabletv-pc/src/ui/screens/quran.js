// Iqra Quran inside Cable TV (QuranSection.kt in the TV app): the same screens as the Iqra Quran app
// (qurankit: HomeScreen.kt, QaidaScreens.kt, ReadScreens.kt, HifzScreens.kt, PrayerScreens.kt, SettingsScreen.kt, kept
// in AppViewModel.kt's order), drawn in Cable TV's colours so it feels part of the app. Recitation is
// one MP3 per ayah from everyayah.com (AyahPlayer.kt); Qaida letters are read by the PC's own Arabic
// voice (Speaker.kt). Back steps back through the Quran screens, then from its home to Cable TV.
import { h, dialog } from '../dom.js';
import * as nav from '../nav.js';
import * as store from '../store.js';
import * as Q from '../quran.js';
import * as P from '../prayer.js';
import * as azan from '../azan.js';

// ---------- Words on screen, in English and Urdu (Strings.kt) ----------

const S = {
  appName: ['Iqra Quran', 'اقرا قرآن'],
  tagline: ['Learn, read and memorize the Quran', 'قرآن سیکھیں، پڑھیں اور حفظ کریں'],
  kids: ['Kids Qaida', 'بچوں کا قاعدہ'],
  kidsSub: ['From alif to reading the Quran', 'الف سے قرآن پڑھنے تک'],
  read: ['Read Quran', 'قرآن پڑھیں'],
  readSub: ['With audio and translation', 'تلاوت اور ترجمے کے ساتھ'],
  hifz: ['Hifz', 'حفظ'],
  hifzSub: ['Memorize and revise', 'یاد کریں اور دہرائیں'],
  settings: ['Settings', 'ترتیبات'],
  continueReading: ['Continue reading', 'جہاں چھوڑا تھا وہاں سے پڑھیں'],
  loading: ['Loading the Quran…', 'قرآن لوڈ ہو رہا ہے…'],
  back: ['Back', 'واپس'],
  quiz: ['Quiz', 'سوالات'],
  playAll: ['Play all', 'سب سنیں'],
  stop: ['Stop', 'روکیں'],
  whichOne: ['Which one did you hear?', 'آپ نے کون سا سنا؟'],
  listenAgain: ['Listen again', 'دوبارہ سنیں'],
  wellDone: ['Well done!', 'شاباش!'],
  finished: ['Lesson finished', 'سبق مکمل'],
  playAgain: ['Play again', 'دوبارہ کھیلیں'],
  done: ['Done', 'ٹھیک ہے'],
  noArabicVoice: [
    'This PC has no Arabic voice yet. Add one in Windows Settings > Time & language > Speech (Arabic), then come back.',
    'اس کمپیوٹر پر عربی آواز موجود نہیں۔ ونڈوز سیٹنگز > ٹائم اینڈ لینگویج > اسپیچ میں عربی آواز شامل کریں، پھر واپس آئیں۔',
  ],
  surahs: ['Surahs', 'سورتیں'],
  shortSurahs: ['Short surahs', 'چھوٹی سورتیں'],
  ayahs: ['ayahs', 'آیات'],
  makki: ['Makki', 'مکی'],
  madani: ['Madani', 'مدنی'],
  play: ['Play', 'چلائیں'],
  pause: ['Pause', 'روکیں'],
  reciter: ['Reciter', 'قاری'],
  translation: ['Translation', 'ترجمہ'],
  textSize: ['Text size', 'لکھائی کا سائز'],
  none: ['None', 'کوئی نہیں'],
  urdu: ['Urdu', 'اردو'],
  english: ['English', 'انگریزی'],
  both: ['Both', 'دونوں'],
  language: ['App language', 'ایپ کی زبان'],
  noInternet: ['Could not play the audio. Check the internet.', 'تلاوت نہیں چل سکی۔ انٹرنیٹ چیک کریں۔'],
  profiles: ['Who is learning?', 'کون سیکھ رہا ہے؟'],
  addProfile: ['Add child', 'بچہ شامل کریں'],
  name: ['Name', 'نام'],
  save: ['Save', 'محفوظ کریں'],
  cancel: ['Cancel', 'منسوخ'],
  delete: ['Delete', 'حذف کریں'],
  newLesson: ['New lesson (Sabaq)', 'نیا سبق'],
  newLessonSub: ['Pick a surah and the ayahs to learn', 'سورت اور آیات چنیں'],
  todaysRevision: ["Today's revision", 'آج کی دہرائی'],
  nothingDue: ['Nothing to revise today. Start a new lesson!', 'آج دہرانے کو کچھ نہیں۔ نیا سبق شروع کریں!'],
  Sabaq: ['Sabaq (today)', 'سبق (آج)'],
  Sabqi: ['Sabqi (this week)', 'سبقی (اس ہفتے)'],
  Manzil: ['Manzil (older)', 'منزل (پرانا)'],
  memorizedList: ['Memorized', 'یاد کیا ہوا'],
  juzMap: ['My 30 juz', 'میرے 30 پارے'],
  fromAyah: ['From ayah', 'آیت سے'],
  toAyah: ['To ayah', 'آیت تک'],
  repeatEach: ['Repeat each ayah', 'ہر آیت دہرائیں'],
  repeatAll: ['Then repeat all together', 'پھر سب ایک ساتھ'],
  gap: ['Pause after each ayah', 'ہر آیت کے بعد وقفہ'],
  start: ['Start', 'شروع کریں'],
  hideText: ['Hide text', 'عبارت چھپائیں'],
  showText: ['Show text', 'عبارت دکھائیں'],
  tapToPeek: ['Click to peek', 'دیکھنے کے لیے کلک کریں'],
  memorized: ['I memorized it', 'میں نے یاد کر لیا'],
  good: ['Good', 'اچھا یاد ہے'],
  weak: ['Weak', 'کمزور ہے'],
  repeat: ['Repeat', 'دہرائیں'],
  ayahWord: ['Ayah', 'آیت'],
  savedToHifz: ['Added to your Hifz revision.', 'آپ کی حفظ دہرائی میں شامل ہو گیا۔'],
  kidsReciter: ['Teacher voice for kids', 'بچوں کے لیے استاد کی آواز'],
  credits: ['Sources', 'ذرائع'],
  creditsText: [
    'Quran text (Indo-Pak script) and translations: Quran Foundation (quran.com). Urdu: Fateh Muhammad Jalandhari. ' +
      'English: Saheeh International. Recitations: EveryAyah.com. Quran font: Scheherazade New by SIL (Open Font License).',
    'قرآن کا متن (انڈو پاک رسم الخط) اور تراجم: قرآن فاؤنڈیشن (quran.com)۔ اردو: فتح محمد جالندھری۔ انگریزی: صحیح انٹرنیشنل۔ ' +
      'تلاوت: EveryAyah.com۔ فونٹ: Scheherazade New (SIL)۔',
  ],
  surahLesson: ['Pick a surah to learn', 'سیکھنے کے لیے سورت چنیں'],
  seconds: ['s', 'سیکنڈ'],
  lineSpacing: ['Line spacing', 'سطروں کا فاصلہ'],
  normal: ['Normal', 'عام'],
  wide: ['Wide', 'زیادہ'],
  wider: ['Wider', 'اور زیادہ'],
  learner: ['Learner', 'طالب علم'],
};

/** Text for the Namaz screens (PS in PrayerScreens.kt). */
const PS = {
  namaz: ['Namaz', 'نماز'],
  namazSub: ['Prayer times and Azan', 'نماز کے اوقات اور اذان'],
  now: ['NOW', 'اب'],
  next: ['Next', 'اگلی'],
  azanSettings: ['Azan settings', 'اذان کی ترتیبات'],
  findingPlace: ['Finding your area for the prayer times…', 'نماز کے اوقات کے لیے آپ کا علاقہ معلوم کیا جا رہا ہے…'],
  tapBell: ['Press the bell beside a prayer to choose: Azan, chime, message or off.', 'ہر نماز کے ساتھ گھنٹی دبا کر چنیں: اذان، گھنٹی، پیغام یا بند۔'],
  muezzin: ['Muezzin (Azan voice)', 'مؤذن (اذان کی آواز)'],
  fajrMuezzin: ['Fajr Azan', 'فجر کی اذان'],
  sameAsOthers: ['Same as the others', 'باقی نمازوں جیسی'],
  volume: ['Azan volume', 'اذان کی آواز'],
  reminder: ['Reminder before each prayer', 'ہر نماز سے پہلے یاد دہانی'],
  off: ['Off', 'بند'],
  minutesShort: ['min', 'منٹ'],
  quiet: ['Quiet hours (Azan becomes a message)', 'خاموش اوقات (اذان کی جگہ صرف پیغام)'],
  method: ['Fajr and Isha calculation', 'فجر اور عشاء کا حساب'],
  automatic: ['Automatic', 'خودکار'],
  asr: ['Asr time', 'عصر کا وقت'],
  hijriAdjust: ['Islamic date: move by days', 'اسلامی تاریخ: دنوں میں تبدیلی'],
  place: ['Your area', 'آپ کا علاقہ'],
  findAgain: ['Find my area again', 'علاقہ دوبارہ معلوم کریں'],
  testAzan: ['Hear it', 'سنیں'],
  recordings: ['Azan recordings', 'اذان کی ریکارڈنگز'],
  noVoices: ['The Azan recordings are loading. Check the internet.', 'اذان کی ریکارڈنگز لوڈ ہو رہی ہیں۔ انٹرنیٹ چیک کریں۔'],
  comingUp: ['coming up in', 'باقی وقت'],
  pcNote: ['The Azan plays while Cable TV is open on this PC, with a Windows notification.', 'اذان اس وقت چلتی ہے جب یہ کمپیوٹر پر Cable TV کھلا ہو، ساتھ ونڈوز کی اطلاع بھی آتی ہے۔'],
};
/** The bell on the timeline for each mode. */
const MODE_ICON = { Azan: '🔊', Chime: '🔔', Message: '💬', Off: '🔕' };

/** Bright colours for the kids' lesson tiles and learners (KidColors in Theme.kt). */
const KID_COLORS = ['#26A69A', '#EF6C00', '#7E57C2', '#29B6F6', '#EC407A', '#9CCC65', '#FFA726', '#5C6BC0'];
const TRANSLATIONS = [['None', S.none], ['Urdu', S.urdu], ['English', S.english], ['Both', S.both]];

// ---------- The Quran text, loaded once ----------

/** Reads a file next to index.html (fetch can't read file:// pages; XHR can). */
function readText(url) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('GET', url);
    x.onload = () => ((x.status === 200 || x.status === 0) && x.responseText ? resolve(x.responseText) : reject(new Error(`${url}: ${x.status}`)));
    x.onerror = () => reject(new Error(`${url} could not be read`));
    x.send();
  });
}

let quranPromise = null;
function loadQuran() {
  quranPromise ??= Promise.all(['quran', 'ur', 'en'].map((n) => readText(`shared/quran/${n}.json`).then(JSON.parse)))
    .then(([q, ur, en]) => ({
      surahs: q.surahs.map((s) => ({ number: s.n, nameAr: s.ar, nameEn: s.en, meaningEn: s.enMeaning, meaningUr: s.ur, makki: s.place === 'makkah', ayahs: s.ayahs })),
      urdu: ur.surahs,
      english: en.surahs,
    }))
    .catch((e) => { quranPromise = null; throw e; });
  return quranPromise;
}
let recitersPromise = null;
const loadReciters = () => (recitersPromise ??= readText('shared/quran/reciters.json').then(JSON.parse));

// ---------- Recitation (AyahPlayer.kt) ----------

/** Plays tracks { surah, ayah, url, label } one after another, with an optional pause after each. */
function createAyahPlayer() {
  const audio = new Audio();
  audio.preload = 'auto';
  let queue = [], index = -1, gapMs = 0, gapTimer = null, pausedInGap = false, onFinished = null;
  const p = { playing: false, error: false, onChange: null };
  const changed = () => p.onChange && p.onChange();
  const load = (i) => { index = i; audio.src = queue[i].url; audio.play().catch(() => {}); changed(); };

  function next() {
    gapTimer = null;
    if (index + 1 < queue.length) load(index + 1);
    else finish();
  }
  function finish() {
    clearTimeout(gapTimer); gapTimer = null;
    const done = onFinished;
    onFinished = null;
    queue = []; index = -1; pausedInGap = false;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    p.playing = false;
    changed();
    done && done();
  }
  audio.addEventListener('playing', () => { p.playing = true; changed(); });
  audio.addEventListener('pause', () => { if (!gapTimer && !audio.ended) { p.playing = false; changed(); } });
  audio.addEventListener('ended', () => {
    if (!queue.length) return;
    // A gap between ayahs (time to repeat) still counts as playing.
    if (gapMs > 0) { p.playing = true; gapTimer = setTimeout(next, gapMs); } else next();
  });
  audio.addEventListener('error', () => { if (!queue.length) return; p.error = true; p.stop(); });

  /** The queue position and track now playing, or null when stopped. */
  p.current = () => (index >= 0 && queue[index] ? { index, track: queue[index] } : null);
  p.play = (tracks, startIndex = 0, gap = 0, onDone = null) => {
    clearTimeout(gapTimer); gapTimer = null; pausedInGap = false;
    if (!tracks.length) return;
    queue = tracks; gapMs = gap; onFinished = onDone; p.error = false;
    load(Math.min(Math.max(startIndex, 0), tracks.length - 1));
  };
  p.togglePause = () => {
    if (!queue.length) return;
    if (gapTimer) { clearTimeout(gapTimer); gapTimer = null; pausedInGap = true; p.playing = false; changed(); return; }
    if (!audio.paused) { audio.pause(); return; }
    // Resuming after a paused gap moves on to the next ayah.
    if (pausedInGap || audio.ended) { pausedInGap = false; next(); return; }
    audio.play().catch(() => {});
  };
  p.stop = () => {
    onFinished = null;
    clearTimeout(gapTimer); gapTimer = null;
    queue = []; index = -1; pausedInGap = false;
    audio.pause(); audio.removeAttribute('src'); audio.load();
    p.playing = false;
    changed();
  };
  return p;
}

// ---------- The Arabic voice for Qaida (Speaker.kt) ----------

/** Reads letters and syllables aloud with Windows' own Arabic voice, when the PC has one. */
function createSpeaker() {
  const synth = window.speechSynthesis;
  const sp = { status: 'starting', onStatus: null };
  let voice = null, speaking = null, onDone = null, counter = 0;
  const pick = () => {
    voice = synth ? synth.getVoices().find((v) => /^ar([-_]|$)/i.test(v.lang)) || null : null;
    const status = voice ? 'ready' : 'noArabic';
    if (status !== sp.status && (voice || sp.status === 'starting')) { sp.status = status; sp.onStatus && sp.onStatus(); }
  };
  if (synth) {
    synth.addEventListener('voiceschanged', pick);
    if (synth.getVoices().length) pick();
    // Windows lists its voices a moment after start; none by then means none at all.
    setTimeout(() => { if (sp.status === 'starting') pick(); }, 1500);
  } else sp.status = 'noArabic';

  function finished(id) {
    if (id !== speaking) return;
    speaking = null;
    const cb = onDone;
    onDone = null;
    cb && cb();
  }
  /** Says [text]; [done] runs when it has finished. */
  sp.say = (text, done = null) => {
    if (sp.status !== 'ready') return;
    synth.cancel();
    const id = `u${++counter}`;
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    // A little slower than normal speech, so children can follow.
    u.rate = 0.75;
    u.onend = () => finished(id);
    u.onerror = () => finished(id);
    speaking = id;
    onDone = done;
    synth.speak(u);
  };
  sp.stop = () => { onDone = null; speaking = null; synth && synth.cancel(); };
  return sp;
}

// ---------- What the section remembers (Store.kt), under quran.* ----------

const K = 'quran.';
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// ---------- The section ----------

/** Opens Iqra Quran over Cable TV; [onClose] runs when Back leaves its home screen. */
export function openQuran({ onClose }) {
  const player = createAyahPlayer();
  const speaker = createSpeaker();
  const state = {
    lang: store.get(`${K}language`) || (/^ur/i.test(navigator.language || '') ? 'ur' : 'en'),
    reciterId: store.get(`${K}reciter`, 'husary_muallim'),
    kidsReciterId: store.get(`${K}kidsReciter`, 'husary_muallim'),
    translation: store.get(`${K}translation`, 'Urdu'),
    textSize: store.get(`${K}textSize`, 30),
    lineSpacing: store.get(`${K}lineSpacing`, 0),
    lastRead: store.get(`${K}lastRead`), // [surah, ayah]
    profiles: store.get(`${K}profiles`, []),
    profile: null,
    stars: {},
    hifz: [],
  };
  let quran = null, reciters = [];
  const stack = [{ name: 'home' }];
  let screen = null; // { el, first, key, cleanup }

  const t = (pair) => (state.lang === 'ur' ? pair[1] : pair[0]);
  const tr = (en, ur) => (state.lang === 'ur' ? ur : en);

  // Everyone starts with one learner, so nothing has to be set up before the first lesson.
  if (!state.profiles.length) { state.profiles = [{ id: uid(), name: '', color: 0 }]; store.set(`${K}profiles`, state.profiles); }
  selectProfile(state.profiles.find((p) => p.id === store.get(`${K}profile`)) || state.profiles[0]);

  const root = h('div.quran');
  document.getElementById('app').appendChild(root);

  function applyLook() {
    root.dir = state.lang === 'ur' ? 'rtl' : 'ltr';
    root.lang = state.lang;
    root.style.setProperty('--q-size', `${state.textSize}px`);
    root.style.setProperty('--q-line', String(1.9 + 0.35 * state.lineSpacing));
  }

  // ---------- Settings and progress (AppViewModel.kt) ----------

  const reciter = (kids) => reciters.find((r) => r.id === (kids ? state.kidsReciterId : state.reciterId)) || reciters[0];
  function setPref(key, storeKey, value) { state[key] = value; store.set(K + storeKey, value); applyLook(); }
  const changeTextSize = (delta) => setPref('textSize', 'textSize', Math.min(64, Math.max(20, state.textSize + delta)));
  function markRead(surah, ayah) { setPref('lastRead', 'lastRead', [surah, ayah]); }

  function selectProfile(p) {
    state.profile = p;
    store.set(`${K}profile`, p.id);
    state.stars = store.get(`${K}stars.${p.id}`, {});
    state.hifz = store.get(`${K}hifz.${p.id}`, []);
  }
  function saveProfile(id, name) {
    const clean = name.trim().slice(0, 24);
    if (id == null) {
      const p = { id: uid(), name: clean, color: state.profiles.length % KID_COLORS.length };
      state.profiles = [...state.profiles, p];
      store.set(`${K}profiles`, state.profiles);
      selectProfile(p);
    } else {
      state.profiles = state.profiles.map((p) => (p.id === id ? { ...p, name: clean } : p));
      store.set(`${K}profiles`, state.profiles);
      if (state.profile.id === id) state.profile = state.profiles.find((p) => p.id === id);
    }
  }
  function deleteProfile(p) {
    if (state.profiles.length <= 1) return;
    state.profiles = state.profiles.filter((x) => x.id !== p.id);
    store.set(`${K}profiles`, state.profiles);
    store.remove(`${K}stars.${p.id}`);
    store.remove(`${K}hifz.${p.id}`);
    if (state.profile.id === p.id) selectProfile(state.profiles[0]);
  }
  const profileName = (p, i) => p.name || `${t(S.learner)} ${i + 1}`;

  function recordStars(lessonId, earned) {
    if (earned <= (state.stars[lessonId] || 0)) return;
    state.stars = { ...state.stars, [lessonId]: earned };
    store.set(`${K}stars.${state.profile.id}`, state.stars);
  }
  const saveHifz = () => store.set(`${K}hifz.${state.profile.id}`, state.hifz);
  function addHifz(surah, from, to) {
    const day = Q.today();
    // Learning the same passage again replaces the old entry.
    const item = { surah, from, to, learnedOn: day, lastReview: day, level: 0, weak: false };
    state.hifz = [...state.hifz.filter((x) => Q.hifzKey(x) !== Q.hifzKey(item)), item];
    saveHifz();
  }
  function reviewHifz(item, good) {
    state.hifz = state.hifz.map((x) => (Q.hifzKey(x) === Q.hifzKey(item) ? Q.reviewed(x, Q.today(), good) : x));
    saveHifz();
  }

  // ---------- Moving between screens ----------

  function quiet() { player.stop(); speaker.stop(); azan.stopSample(); }
  function open(s) { quiet(); stack.push(s); render(); }
  /** Replaces the current screen, e.g. lesson to quiz. */
  function replace(s) { quiet(); stack[stack.length - 1] = s; render(); }
  function back() {
    quiet();
    if (stack.length <= 1) { close(); return; }
    const left = stack.pop();
    render({ focusKey: left.ret });
  }

  // Each screen is { name, ...its own values, ret }: [ret] is the data-k highlighted again when Back returns to the screen below.

  /** Draws the screen on top of the stack; [focusKey] is the data-k of the thing to highlight. */
  function render({ focusKey } = {}) {
    screen?.cleanup?.();
    player.onChange = null;
    speaker.onStatus = null;
    applyLook();
    const s = stack[stack.length - 1];
    // Qaida needs only its own lessons; the rest waits for the Quran text and the reciters.
    const needsText = !['home', 'qaidaMap', 'lesson', 'quiz', 'prayer', 'azanSettings'].includes(s.name);
    screen = needsText && (!quran || !reciters.length) ? loadingScreen() : SCREENS[s.name](s);
    root.innerHTML = '';
    root.appendChild(screen.el);
    const target = (focusKey && screen.el.querySelector(`[data-k="${CSS.escape(focusKey)}"]`)) || screen.first || nav.focusables(screen.el)[0];
    nav.focus(target);
  }

  /** Draws the same screen again in place, keeping the highlight where it was. */
  function redraw() {
    const k = document.activeElement?.closest?.('[data-k]')?.dataset.k;
    const scroller = root.querySelector('.quran-body');
    const top = scroller ? scroller.scrollTop : 0;
    render({ focusKey: k });
    const again = root.querySelector('.quran-body');
    if (again && !k) again.scrollTop = top;
  }

  function loadingScreen() {
    const msg = h('div.quran-loading', h('div.spinner'), h('p', t(S.loading)));
    const me = { el: h('div.quran-screen', topBar('', back), msg) };
    Promise.all([loadQuran(), loadReciters()]).then(([q, r]) => {
      quran = q; reciters = r;
      if (screen === me && !closed) render();
    }).catch(() => { msg.querySelector('p').textContent = 'Could not open the Quran files. Reinstall Cable TV for PC.'; });
    return me;
  }

  // ---------- Building blocks (Components.kt) ----------

  /** A focusable thing; [k] names it so a redraw can highlight it again. */
  const btn = (spec, k, onClick, ...children) => h(spec, { focus: true, 'data-k': k, on: { click: onClick } }, ...children);

  function topBar(title, onBack, ...actions) {
    return h('div.quran-bar',
      btn('button.quran-round.quran-back', 'back', onBack, '←'),
      h('div.quran-bar-title', title), ...actions);
  }
  const round = (k, label, icon, onClick) => { const b = btn('button.quran-round', k, onClick, icon); b.title = label; return b; };
  const choice = (k, label, selected, onClick) => btn(`button.quran-choice${selected ? '.on' : ''}`, k, onClick, label);
  const choiceRow = (...items) => h('div.quran-choices', ...items);
  const arabic = (text, cls = '') => h(`div.quran-ar${cls}`, { dir: 'rtl' }, text);
  const starsEl = (count) => h('div.quran-stars', [0, 1, 2].map((i) => h(`span${i < count ? '.on' : ''}`, i < count ? '★' : '☆')));
  const heading = (text) => h('h3.quran-h', text);

  function bigTile(k, title, sub, color, icon, onClick, badge) {
    const el = btn('button.quran-tile', k, onClick,
      icon ? h('div.quran-tile-icon', icon) : null, h('div.quran-tile-title', title), h('div.quran-tile-sub', sub), badge || null);
    el.style.background = color;
    return el;
  }

  function stepper(k, label, value, min, max, suffix, onChange) {
    return h('div.quran-stepper', h('div.quran-step-label', label),
      btn('button.quran-step', `${k}-`, () => { if (value > min) onChange(value - 1); }, '−'),
      h('div.quran-step-value', `${value}${suffix}`),
      btn('button.quran-step', `${k}+`, () => { if (value < max) onChange(value + 1); }, '+'));
  }

  const screenEl = (bar, ...body) => {
    const scroller = h('div.quran-body', ...body);
    return { el: h('div.quran-screen', bar, scroller), scroller };
  };

  // ---------- Home (HomeScreen.kt) ----------

  function homeScreen() {
    const settings = round('settings', t(S.settings), '⚙', () => open({ name: 'settings', ret: 'settings' }));
    const head = h('div.quran-head',
      btn('button.quran-round.quran-back', 'back', back, '←'),
      h('img.quran-logo', { src: 'shared/quran/logo.svg', alt: '' }),
      h('div.quran-head-text', h('div.quran-title', t(S.appName)), h('div.quran-muted', t(S.tagline))),
      settings);
    const verse = arabic('اِقۡرَاۡ بِاسۡمِ رَبِّكَ الَّذِىۡ خَلَقَ', '.quran-verse');

    // Learners: click one to switch to it; click the selected one again to rename or delete it.
    const chips = h('div.quran-chips', state.profiles.map((p, i) => {
      const selected = state.profile.id === p.id;
      const color = KID_COLORS[p.color % KID_COLORS.length];
      const name = profileName(p, i);
      const dot = h('span.quran-dot', name.slice(0, 1));
      const chip = btn(`button.quran-chip${selected ? '.on' : ''}`, `p-${p.id}`, () => {
        if (selected) profileDialog(p); else { selectProfile(p); redraw(); }
      }, dot, h('span', name));
      if (selected) chip.style.background = color; else dot.style.background = color;
      if (selected) dot.style.color = color;
      return chip;
    }), state.profiles.length < 6 ? (() => { const b = btn('button.quran-chip.quran-add', 'add', () => profileDialog(null), '+'); b.title = t(S.addProfile); return b; })() : null);

    // The next prayer and the time left, else what the section is; it moves on every 20 seconds.
    const namaz = bigTile('namaz', t(PS.namaz), '', KID_COLORS[7], '🕌', () => open({ name: 'prayer', ret: 'namaz' }));
    const namazSub = () => {
      const next = P.around(azan.settings())?.[1];
      const p = next && P.prayerById(next[0]);
      namaz.querySelector('.quran-tile-sub').textContent = p ? `${tr(p.en, p.ur)} · ${countdown(next[1] - Date.now())}` : t(PS.namazSub);
    };
    namazSub();
    const namazTimer = setInterval(namazSub, 20000);
    const offAzan = azan.onChange(namazSub);
    const kids = bigTile('kids', t(S.kids), t(S.kidsSub), KID_COLORS[1], '🧒', () => open({ name: 'qaidaMap', ret: 'kids' }));
    const tiles = h('div.quran-tiles',
      kids,
      bigTile('read', t(S.read), t(S.readSub), KID_COLORS[0], '📖', () => open({ name: 'surahs', forHifz: false, kids: false, ret: 'read' })),
      bigTile('hifz', t(S.hifz), t(S.hifzSub), KID_COLORS[2], '🧠', () => open({ name: 'hifzHome', ret: 'hifz' })),
      namaz);
    const last = state.lastRead;
    let cont = null;
    if (last && quran) {
      const s = quran.surahs[last[0] - 1];
      cont = bigTile('continue', t(S.continueReading), `${s.nameEn} · ${s.nameAr} · ${t(S.ayahWord)} ${last[1]}`, '#0B5D45', '🔖',
        () => open({ name: 'read', surah: last[0], ayah: last[1], kids: false, ret: 'continue' }));
      cont.classList.add('wide');
    }
    // The Quran text loads in the background, then "Continue reading" appears.
    if (!quran && last) loadQuran().then((q) => { quran = q; if (stack.length === 1 && root.isConnected) redraw(); }).catch(() => {});
    const el = h('div.quran-screen', h('div.quran-body.quran-home', head, verse, heading(t(S.profiles)), chips, tiles, cont));
    return { el, first: kids, cleanup: () => { clearInterval(namazTimer); offAzan(); } };
  }

  function profileDialog(p) {
    const input = h('input.field', { type: 'text', maxlength: '24', placeholder: t(S.name), focus: true });
    input.value = p ? p.name : '';
    const canDelete = p && state.profiles.length > 1;
    dialog({
      title: p ? t(S.name) : t(S.addProfile),
      body: input,
      buttons: [
        [t(S.save), () => { saveProfile(p ? p.id : null, input.value); redraw(); }],
        canDelete ? [t(S.delete), () => { deleteProfile(p); redraw(); }] : null,
        [t(S.cancel), null],
      ].filter(Boolean),
    });
    const scrims = document.querySelectorAll('.scrim');
    scrims[scrims.length - 1]?.setAttribute('dir', root.dir);
    nav.focus(input);
  }

  // ---------- Kids Qaida (QaidaScreens.kt) ----------

  function qaidaMapScreen() {
    const tiles = Q.LESSONS.map((l, i) => {
      const preview = l.kind === 'Surahs' ? 'الفاتحة · الناس · الفلق · الاخلاص' : l.items.slice(0, 4).map((x) => x.text.replace(/‍/g, '')).join(' ');
      const tile = bigTile(`lesson-${l.id}`, `${l.id}. ${tr(l.en, l.ur)}`, preview, KID_COLORS[i % KID_COLORS.length], null, () => {
        if (l.kind === 'Surahs') open({ name: 'surahs', forHifz: false, kids: true, ret: `lesson-${l.id}` });
        else open({ name: 'lesson', id: l.id, ret: `lesson-${l.id}` });
      }, l.kind === 'Surahs' ? null : starsEl(state.stars[l.id] || 0));
      tile.querySelector('.quran-tile-sub').dir = 'rtl';
      return tile;
    });
    const { el } = screenEl(topBar(t(S.kids), back), h('div.quran-grid.lessons', tiles));
    return { el, first: tiles[0] };
  }

  /** The "no Arabic voice" line, shown once the PC has said it has none. */
  function voiceNote() {
    const note = h('p.quran-note');
    const show = () => { note.textContent = speaker.status === 'noArabic' ? t(S.noArabicVoice) : ''; };
    show();
    return { note, show };
  }

  /** A lesson: a tip, then every card. Click a card to hear it; "Play all" reads them one by one. */
  function lessonScreen(s) {
    const l = Q.lessonById(s.id);
    let selected = -1, run = 0, runs = 0;
    const cards = l.items.map((it, i) => {
      const label = tr(it.en, it.ur);
      return btn('button.quran-letter', `card-${i}`, () => { stopAll(); select(i); speaker.say(it.say); },
        arabic(it.text), label ? h('div.quran-letter-label', label) : null);
    });
    const select = (i) => { selected = i; cards.forEach((c, j) => c.classList.toggle('on', j === selected)); };
    const playBtn = round('playall', t(S.playAll), '▶', () => { if (run) stopAll(); else playAll(); });
    function stopAll() { run = 0; speaker.stop(); playBtn.textContent = '▶'; playBtn.title = t(S.playAll); }
    async function playAll() {
      const me = (run = ++runs);
      playBtn.textContent = '■'; playBtn.title = t(S.stop);
      for (let i = 0; i < l.items.length && run === me; i++) {
        select(i);
        cards[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        await new Promise((resolve) => {
          const cap = setTimeout(resolve, 6000);
          speaker.say(l.items[i].say, () => { clearTimeout(cap); resolve(); });
          if (speaker.status !== 'ready') { clearTimeout(cap); setTimeout(resolve, 800); }
        });
        // Time to say it back.
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      if (run === me) stopAll();
    }
    const { note, show } = voiceNote();
    speaker.onStatus = show;
    const wide = l.kind === 'Shapes' || l.kind === 'Words';
    const { el } = screenEl(
      topBar(`${l.id}. ${tr(l.en, l.ur)}`, back, playBtn, round('quiz', t(S.quiz), '?', () => replace({ name: 'quiz', id: l.id, ret: s.ret }))),
      h('p.quran-tip', tr(l.tipEn, l.tipUr)), note,
      h(`div.quran-grid.letters${wide ? '.wide' : ''}`, cards));
    return { el, first: cards[0], cleanup: () => { run = 0; } };
  }

  /** Hear a sound, pick the card that matches out of four. Ten questions; stars at the end. */
  function quizScreen(s) {
    const l = Q.lessonById(s.id);
    const pool = Q.quizPool(l);
    let roundNo = 0, mistakes = 0, wrong = new Set(), correct = false, question = Q.newQuestion(pool);
    let askTimer = null, nextTimer = null;
    const area = h('div.quran-quiz');
    const { note, show } = voiceNote();
    const ask = () => { clearTimeout(askTimer); askTimer = setTimeout(() => speaker.say(question.answer.say), 300); };
    speaker.onStatus = () => { show(); if (speaker.status === 'ready' && roundNo < Q.QUIZ_LENGTH) ask(); };

    function draw() {
      area.innerHTML = '';
      if (roundNo >= Q.QUIZ_LENGTH) {
        const again = choice('again', t(S.playAgain), true, () => { roundNo = 0; mistakes = 0; wrong = new Set(); question = Q.newQuestion(pool); draw(); ask(); });
        area.append(h('div.quran-title', t(S.finished)), h('div.quran-bigstars', starsEl(Q.stars(mistakes))), h('p.quran-big', t(S.wellDone)),
          choiceRow(again, choice('done', t(S.done), false, back)));
        nav.focus(again);
        return;
      }
      const options = question.options.map((opt, i) => {
        const isAnswer = opt === question.answer;
        const b = btn(`button.quran-option${correct && isAnswer ? '.good' : ''}${wrong.has(i) ? '.bad' : ''}`, `opt-${i}`, () => {
          if (correct) return;
          if (isAnswer) {
            correct = true;
            draw();
            nextTimer = setTimeout(() => {
              correct = false; wrong = new Set(); roundNo++;
              if (roundNo < Q.QUIZ_LENGTH) { question = Q.newQuestion(pool, question.answer); draw(); ask(); }
              else { recordStars(l.id, Q.stars(mistakes)); draw(); }
            }, 1200);
          } else if (!wrong.has(i)) {
            wrong.add(i); mistakes++; b.classList.add('bad'); speaker.say(question.answer.say);
          }
        }, arabic(opt.text));
        return b;
      });
      area.append(note, h('div.quran-muted', `${roundNo + 1} / ${Q.QUIZ_LENGTH}`),
        h('div.quran-ask', h(`div.quran-question${correct ? '.good' : ''}`, correct ? t(S.wellDone) : t(S.whichOne)),
          round('listen', t(S.listenAgain), '🔊', () => speaker.say(question.answer.say))),
        h('div.quran-options', options));
      nav.focus(correct ? options.find((o) => o.classList.contains('good')) : options[0]);
    }
    const { el } = screenEl(topBar(`${t(S.quiz)} · ${tr(l.en, l.ur)}`, back), area);
    draw();
    ask();
    return { el, first: area.querySelector('.quran-option'), cleanup: () => { clearTimeout(askTimer); clearTimeout(nextTimer); } };
  }

  // ---------- Surahs and reading (ReadScreens.kt) ----------

  function surahsScreen(s) {
    const list = s.kids ? Q.FIRST_SURAHS.map((n) => quran.surahs[n - 1]) : quran.surahs;
    const title = s.kids ? t(S.shortSurahs) : s.forHifz ? t(S.surahLesson) : t(S.surahs);
    const rows = list.map((su) => btn('button.quran-surah', `surah-${su.number}`, () => {
      open(s.forHifz ? { name: 'hifzSetup', surah: su.number, ret: `surah-${su.number}` } : { name: 'read', surah: su.number, ayah: 1, kids: s.kids, ret: `surah-${su.number}` });
    },
    h('div.quran-num', String(su.number)),
    h('div.quran-surah-text', h('div.quran-surah-name', su.nameEn),
      h('div.quran-muted', `${tr(su.meaningEn, su.meaningUr)} · ${su.ayahs.length} ${t(S.ayahs)} · ${su.makki ? t(S.makki) : t(S.madani)}`)),
    arabic(su.nameAr, '.quran-surah-ar')));
    const { el } = screenEl(topBar(title, back), h('div.quran-list', rows));
    return { el, first: rows[0] };
  }

  /** Translation, reciter, text size and line spacing (ReadOptions and ThemePicker without the themes). */
  function readingOptions({ kids = false, settingsPage = false } = {}) {
    const box = h(settingsPage ? 'div' : 'div.quran-options-panel');
    const recChoices = (useKids) => reciters.map((r) => choice(`${useKids ? 'krec' : 'rec'}-${r.id}`, tr(r.en, r.ur), reciter(useKids).id === r.id, () => {
      if (useKids) setPref('kidsReciterId', 'kidsReciter', r.id); else setPref('reciterId', 'reciter', r.id);
      redraw();
    }));
    box.append(
      heading(t(S.lineSpacing)),
      choiceRow([S.normal, S.wide, S.wider].map((label, i) => choice(`ls-${i}`, t(label), state.lineSpacing === i, () => { setPref('lineSpacing', 'lineSpacing', i); redraw(); }))),
      heading(t(S.translation)),
      choiceRow(TRANSLATIONS.map(([mode, label]) => choice(`tr-${mode}`, t(label), state.translation === mode, () => { setPref('translation', 'translation', mode); redraw(); }))),
      heading(t(S.reciter)),
      choiceRow(recChoices(settingsPage ? false : kids)));
    if (settingsPage) box.append(heading(t(S.kidsReciter)), choiceRow(recChoices(true)));
    const size = settingsPage ? arabic('بِسۡمِ اللّٰهِ', '.quran-sample') : h('div.quran-step-value', String(state.textSize));
    box.append(heading(t(S.textSize)), choiceRow(
      choice('size-', 'A−', false, () => { changeTextSize(-4); if (!settingsPage) size.textContent = String(state.textSize); }),
      size,
      choice('size+', 'A+', false, () => { changeTextSize(4); if (!settingsPage) size.textContent = String(state.textSize); })));
    return box;
  }

  /**
   * Reading a surah: every ayah with its translation. Click an ayah to play from there; the playing
   * ayah is highlighted and kept on screen. In the kids' path the teacher leaves a pause after each ayah.
   */
  function readScreen(s) {
    const su = quran.surahs[s.surah - 1];
    const rec = reciter(s.kids);
    let optionsOpen = !!s.optionsOpen;
    const playBtn = round('play', t(S.play), '▶', () => {
      const cur = player.current();
      if (!cur) playFrom(playingAyah() ?? lastAyah); else player.togglePause();
    });
    const optionsBtn = round('options', t(S.settings), 'Aa', () => {
      optionsOpen = !optionsOpen; s.optionsOpen = optionsOpen; panel.classList.toggle('hidden', !optionsOpen);
    });
    const panel = readingOptions({ kids: s.kids });
    panel.classList.toggle('hidden', !optionsOpen);
    const errBar = h('div.quran-error.hidden', t(S.noInternet));
    let lastAyah = s.ayah;

    const header = h('div.quran-surah-head',
      arabic(`سُوۡرَةُ ${su.nameAr}`, '.quran-head-ar'),
      h('div.quran-head-sub', `${tr(su.meaningEn, su.meaningUr)} · ${su.ayahs.length} ${t(S.ayahs)} · ${tr(rec.en, rec.ur)}`),
      su.number !== 1 && su.number !== 9 ? arabic(quran.surahs[0].ayahs[0], '.quran-bismillah') : null);
    const mode = state.translation;
    const cards = su.ayahs.map((text, i) => {
      const n = i + 1;
      return btn('button.quran-ayah', `ayah-${n}`, () => playFrom(n),
        arabic(`${text} ${Q.ayahMark(n)}`),
        mode === 'Urdu' || mode === 'Both' ? h('div.quran-ur', { dir: 'rtl' }, quran.urdu[su.number - 1][i]) : null,
        mode === 'English' || mode === 'Both' ? h('div.quran-en', { dir: 'ltr' }, `${n}. ${quran.english[su.number - 1][i]}`) : null);
    });

    const playingAyah = () => { const c = player.current(); return c && c.track.surah === su.number ? c.track.ayah : null; };
    function playFrom(ayah) {
      const tracks = su.ayahs.map((_, i) => ({ surah: su.number, ayah: i + 1, url: Q.audioUrl(rec.folder, su.number, i + 1) }));
      markRead(su.number, ayah);
      // Kids get time to repeat each ayah after the teacher.
      player.play(tracks, ayah - 1, s.kids ? 4000 : 0);
    }
    let shown = null;
    player.onChange = () => {
      const a = playingAyah();
      playBtn.textContent = player.playing ? '❚❚' : '▶';
      playBtn.title = player.playing ? t(S.pause) : t(S.play);
      errBar.classList.toggle('hidden', !player.error);
      if (a === shown) return;
      if (shown) cards[shown - 1].classList.remove('on');
      shown = a;
      if (!a) return;
      lastAyah = a;
      s.ayah = a;
      markRead(su.number, a);
      const card = cards[a - 1];
      card.classList.add('on');
      if (cards.includes(document.activeElement)) nav.focus(card);
      card.scrollIntoView({ block: 'center', behavior: 'smooth' });
    };

    const { el, scroller } = screenEl(topBar(`${su.number}. ${su.nameEn}`, back, optionsBtn, playBtn), panel, errBar,
      h('div.quran-list', header, cards));
    player.onChange();
    // Opens where reading stopped.
    requestAnimationFrame(() => { if (s.ayah > 1) cards[s.ayah - 1]?.scrollIntoView({ block: 'start' }); else scroller.scrollTop = 0; });
    return { el, first: playBtn, playPause: () => playBtn.click() };
  }

  // ---------- Hifz (HifzScreens.kt) ----------

  /** Hifz home: today's revision (Sabaq, Sabqi, Manzil), the 30-juz map and a new lesson. */
  function hifzHomeScreen() {
    const day = Q.today();
    const due = state.hifz.filter((x) => Q.isDue(x, day));
    const newTile = bigTile('new', t(S.newLesson), t(S.newLessonSub), KID_COLORS[2], '+', () => open({ name: 'surahs', forHifz: true, kids: false, ret: 'new' }));
    newTile.classList.add('wide');
    const body = [newTile, h('h2.quran-accent', t(S.todaysRevision))];
    if (!due.length) body.push(h('p.quran-muted', t(S.nothingDue)));
    for (const g of Q.GROUPS) {
      const inGroup = due.filter((x) => Q.group(x, day) === g);
      if (inGroup.length) body.push(heading(t(S[g])), ...inGroup.map((x) => revisionRow(x, 'due')));
    }
    body.push(h('h2.quran-accent', t(S.juzMap)), juzMap(Q.juzProgress(state.hifz, quran.surahs.map((x) => x.ayahs.length))));
    const rest = state.hifz.filter((x) => !Q.isDue(x, day)).sort((a, b) => a.surah - b.surah || a.from - b.from);
    if (rest.length) body.push(heading(t(S.memorizedList)), ...rest.map((x) => revisionRow(x, 'done')));
    const { el } = screenEl(topBar(t(S.hifz), back), h('div.quran-list', body));
    return { el, first: newTile };
  }

  function revisionRow(item, where) {
    const su = quran.surahs[item.surah - 1];
    const k = `${where}-${Q.hifzKey(item)}`;
    return h('div.quran-row',
      h('div.quran-row-text', h('div.quran-surah-name', `${su.nameEn} ${item.from}–${item.to}`),
        h(`div${item.weak ? '.quran-accent' : '.quran-muted'}`, su.nameAr + (item.weak ? ` · ${t(S.weak)}` : ''))),
      round(`${k}-play`, t(S.repeat), '▶', () => open({ name: 'hifzSession', surah: item.surah, from: item.from, to: item.to, perAyah: 1, wholeTimes: 2, gapSeconds: 0, revising: true, ret: `${k}-play` })),
      choice(`${k}-good`, t(S.good), false, () => { reviewHifz(item, true); redraw(); }),
      choice(`${k}-weak`, t(S.weak), false, () => { reviewHifz(item, false); redraw(); }));
  }

  /** 30 squares, one per juz, filled in as it is memorized. */
  function juzMap(progress) {
    const mix = (p) => {
      const a = [0x3e, 0x6b, 0x5b], b = [0x43, 0xa0, 0x47];
      return `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * p)).join(',')})`;
    };
    return h('div.quran-juz', progress.map((p, i) => {
      const cell = h(`div.quran-juz-cell${p >= 1 ? '.full' : p > 0 ? '.some' : ''}`, h('b', String(i + 1)), p > 0 ? h('small', `${Math.floor(p * 100)}%`) : null);
      if (p > 0) cell.style.background = mix(p);
      return cell;
    }));
  }

  /** New lesson: pick the ayahs and how many times to repeat. */
  function hifzSetupScreen(s) {
    const su = quran.surahs[s.surah - 1];
    const count = su.ayahs.length;
    s.setup ??= { from: 1, to: Math.min(count, 3), perAyah: 5, whole: 3, gap: 3 };
    const v = s.setup;
    const set = (k, value) => { v[k] = value; if (k === 'from' && v.to < value) v.to = value; redraw(); };
    const start = choice('start', t(S.start), true, () => replace({ name: 'hifzSession', surah: s.surah, from: v.from, to: v.to, perAyah: v.perAyah, wholeTimes: v.whole, gapSeconds: v.gap, revising: false, ret: s.ret }));
    const { el } = screenEl(topBar(`${t(S.newLesson)} · ${su.nameEn}`, back), h('div.quran-form',
      arabic(su.nameAr, '.quran-center.quran-title-ar'),
      stepper('from', t(S.fromAyah), v.from, 1, count, '', (x) => set('from', x)),
      stepper('to', t(S.toAyah), v.to, v.from, count, '', (x) => set('to', x)),
      stepper('each', t(S.repeatEach), v.perAyah, 1, 20, '×', (x) => set('perAyah', x)),
      stepper('whole', t(S.repeatAll), v.whole, 0, 20, '×', (x) => set('whole', x)),
      stepper('gap', t(S.gap), v.gap, 0, 15, ` ${t(S.seconds)}`, (x) => set('gap', x)),
      arabic(`${su.ayahs.slice(v.from - 1, v.to).join(' ')} ${Q.ayahMark(v.to)}`, '.quran-preview'),
      h('div.quran-center', start)));
    return { el, first: el.querySelector('[data-k="from+"]') };
  }

  /**
   * Listening and repeating: each ayah several times with a pause to say it back, then all of them
   * together. The text can be hidden to test yourself, and peeked at by clicking it.
   */
  function hifzSessionScreen(s) {
    const su = quran.surahs[s.surah - 1];
    const steps = Q.plan(s.surah, s.from, s.to, s.perAyah, s.wholeTimes);
    let hidden = s.revising, peek = false, finished = false, saved = false, peekTimer = null;
    const status = h('div.quran-status');
    const bar = h('div.quran-progress', h('div'));
    const err = h('div.quran-bad.hidden', t(S.noInternet));
    const text = arabic('', '.quran-center.quran-session-ar');
    const peekLabel = h('div.quran-peek', t(S.tapToPeek));
    const textBox = btn('button.quran-textbox', 'text', () => {
      if (!hidden) return;
      peek = true; draw();
      clearTimeout(peekTimer);
      peekTimer = setTimeout(() => { peek = false; draw(); }, 3000);
    }, text, peekLabel);
    const playBtn = btn('button.quran-round.big', 'play', () => { if (finished || !player.current()) start(); else player.togglePause(); }, '▶');
    const hideBtn = choice('hide', '', false, () => { hidden = !hidden; draw(); });
    const memBtn = s.revising ? null : choice('mem', t(S.memorized), true, () => {
      if (saved) return;
      addHifz(s.surah, s.from, s.to);
      saved = true; draw();
    });

    function start() {
      finished = false;
      const rec = reciter(false);
      const tracks = steps.map((st) => ({ surah: st.surah, ayah: st.ayah, url: Q.audioUrl(rec.folder, st.surah, st.ayah), label: `${st.round} / ${st.rounds}` }));
      player.play(tracks, 0, s.gapSeconds * 1000, () => { finished = true; draw(); });
    }
    function draw() {
      const cur = player.current();
      const ayah = cur ? cur.track.ayah : s.from;
      status.textContent = finished ? t(S.finished) : `${t(S.ayahWord)} ${ayah} · ${t(S.repeat)} ${cur ? cur.track.label : ''}`;
      bar.firstChild.style.width = `${finished ? 100 : ((cur ? cur.index : 0) + 1) / steps.length * 100}%`;
      err.classList.toggle('hidden', !player.error);
      text.textContent = `${su.ayahs[ayah - 1]} ${Q.ayahMark(ayah)}`;
      const showText = !hidden || peek;
      text.classList.toggle('blurred', !showText);
      peekLabel.classList.toggle('hidden', showText);
      playBtn.textContent = finished ? '↻' : player.playing ? '❚❚' : '▶';
      playBtn.title = player.playing ? t(S.pause) : t(S.play);
      hideBtn.textContent = hidden ? t(S.showText) : t(S.hideText);
      hideBtn.classList.toggle('on', hidden);
      if (memBtn) { memBtn.textContent = saved ? t(S.savedToHifz) : t(S.memorized); memBtn.classList.toggle('on', !saved); }
    }
    player.onChange = draw;
    const { el } = screenEl(topBar(`${t(S.hifz)} · ${su.nameEn} ${s.from}–${s.to}`, back), h('div.quran-session',
      err, status, bar, textBox, h('div.quran-choices.quran-center', playBtn, hideBtn), memBtn ? h('div.quran-center', memBtn) : null));
    start();
    draw();
    return { el, first: playBtn, playPause: () => playBtn.click(), cleanup: () => clearTimeout(peekTimer) };
  }

  // ---------- Settings (SettingsScreen.kt; inside Cable TV the colours follow Cable TV's theme) ----------

  function settingsScreen() {
    const ur = choice('lang-ur', 'اردو', state.lang === 'ur', () => { setPref('lang', 'language', 'ur'); redraw(); });
    const { el } = screenEl(topBar(t(S.settings), back), h('div.quran-form',
      heading(t(S.language)),
      choiceRow(ur, choice('lang-en', 'English', state.lang === 'en', () => { setPref('lang', 'language', 'en'); redraw(); })),
      readingOptions({ settingsPage: true }),
      heading(t(S.credits)), h('p.quran-muted', t(S.creditsText))));
    return { el, first: ur };
  }

  // ---------- Namaz (PrayerScreens.kt) ----------

  const countdown = (ms) => P.countdown(ms, t(PS.minutesShort), state.lang === 'ur' ? 'گھنٹے' : null);
  const minutesOfDay = (ms) => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };

  /** Redraws the Namaz screens after a setting changes, and every 20 seconds as the clock moves. */
  function live() {
    const off = azan.onChange(() => redraw());
    const timer = setInterval(() => redraw(), 20000);
    return () => { off(); clearInterval(timer); };
  }

  /** Today's prayers on a timeline, with a bell per prayer and the time left to the next one. */
  function prayerScreen() {
    const s = azan.settings();
    const now = Date.now();
    const gear = round('azanSettings', t(PS.azanSettings), '⚙', () => open({ name: 'azanSettings', ret: 'azanSettings' }));
    gear.classList.add('quran-plain');
    const bar = topBar(t(PS.namaz), back, gear);
    const times = P.timesFor(s, 0, now);
    if (!times) {
      azan.refreshPlace();
      const { el } = screenEl(bar, h('p.quran-big', t(PS.findingPlace)));
      return { el, first: gear, cleanup: live() };
    }
    const line = timeline(s, times, now);
    const { el } = screenEl(bar, h('div.namaz',
      h('div.namaz-col', line),
      h('div.namaz-col', dateCard(s, now), nextCard(s, now), h('p.quran-muted', t(PS.tapBell)), h('p.quran-muted', t(PS.pcNote)), placeLine(s))));
    return { el, first: line.querySelector('[data-focus]'), cleanup: live() };
  }

  function dateCard(s, now) {
    const d = new Date(now);
    const [hd, hm, hy] = P.hijri(d.getFullYear(), d.getMonth() + 1, d.getDate(), s.hijriAdjust);
    return h('div.namaz-date',
      h('div.namaz-weekday', d.toLocaleDateString([], { weekday: 'long' })),
      h('div.quran-muted', d.toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })),
      h('div.namaz-hijri', `${hd} ${(state.lang === 'ur' ? P.HIJRI_UR : P.HIJRI_EN)[hm - 1]} ${hy}`));
  }

  /** The vertical line: a node per prayer, and between the last prayer and the next a coloured bar with "NOW". */
  function timeline(s, times, now) {
    const ar = P.around(s, now);
    const box = h('div.namaz-line');
    P.PRAYERS.forEach((p, i) => {
      const at = P.atMs(0, times[p.id], now);
      const isCurrent = !!ar && ar[0][0] === p.id && ar[0][1] === at;
      const isNext = !!ar && ar[1][0] === p.id && ar[1][1] === at;
      box.append(prayerRow(s, p, times[p.id], isCurrent || isNext, at < now && !isCurrent));
      if (i < P.PRAYERS.length - 1) {
        box.append(isCurrent ? progressGap(ar, now) : h(`div.namaz-gap${at < now ? '.past' : ''}`, h('div.namaz-side'), h('div.namaz-node')));
      }
    });
    // After Isha (or before Fajr) the bar runs to tomorrow's Fajr.
    if (ar && ar[0][0] === 'Isha' && ar[0][1] <= now && ar[1][0] === 'Fajr') {
      box.append(progressGap(ar, now), h('div.namaz-after', `${tr('Fajr', 'فجر')} · ${P.format(P.timesFor(s, 1, now)?.Fajr ?? 0)}`));
    }
    return box;
  }

  function prayerRow(s, p, minutes, highlight, past) {
    let bell = null;
    if (p.hasAzan) {
      const mode = P.MODES.find((m) => m.id === P.modeOf(s, p.id));
      bell = btn(`button.namaz-bell${mode.id === 'Off' ? '.off' : ''}`, `bell-${p.id}`, () => azan.setMode(p.id, P.nextMode(mode.id)), MODE_ICON[mode.id]);
      bell.title = tr(mode.en, mode.ur);
    }
    return h(`div.namaz-row${highlight ? '.hl' : ''}${past ? '.past' : ''}`,
      h('div.namaz-side', bell, h('span.namaz-time', P.format(minutes))),
      h('div.namaz-node', h('i')),
      h('div.namaz-name', tr(p.en, p.ur)));
  }

  /** The time between the last prayer and the next: green, then orange, then red as it runs out, "NOW" where we are. */
  function progressGap(ar, now) {
    const span = Math.max(1, ar[1][1] - ar[0][1]);
    const f = Math.min(1, Math.max(0, (now - ar[0][1]) / span));
    const color = f < 0.5 ? '#43A047' : f < 0.8 ? '#FFA726' : '#E53935';
    const top = `clamp(0px, calc(${f * 100}% - 12px), calc(100% - 24px))`;
    const at = (el) => { el.style.top = top; el.style.color = color; return el; };
    const dot = h('b');
    dot.style.top = `${f * 100}%`;
    dot.style.background = color;
    return h('div.namaz-progress',
      h('div.namaz-side', at(h('span.namaz-now-time', P.format(minutesOfDay(now))))),
      h('div.namaz-node.bar', dot),
      h('div.namaz-now', at(h('span', `${state.lang === 'ur' ? '▸' : '◂'} ${t(PS.now)} · ${countdown(ar[1][1] - now)}`))));
  }

  /** The next prayer, big, with the time left. */
  function nextCard(s, now) {
    const next = P.around(s, now)?.[1];
    if (!next) return null;
    const p = P.prayerById(next[0]);
    return h('div.namaz-next',
      h('div.namaz-next-label', t(PS.next)),
      h('div.namaz-next-name', `${tr(p.en, p.ur)} · ${P.format(minutesOfDay(next[1]))}`),
      h('div.namaz-next-left', `${t(PS.comingUp)} ${countdown(next[1] - now)}`));
  }

  function placeLine(s) {
    if (!s.place) return null;
    const m = P.methodInUse(s);
    return h('p.quran-muted', `📍 ${[s.place.city, s.place.country].filter(Boolean).join(', ')} · ${tr(m.en, m.ur)}`);
  }

  /** Muezzin, volume, reminder, quiet hours, calculation and place. */
  function azanSettingsScreen() {
    const a = azan.settings();
    const voices = azan.voices();
    if (!voices.length) azan.refreshVoices();
    const body = [heading(t(PS.namaz))];
    for (const p of P.WITH_AZAN) {
      body.push(h('div.namaz-mode-label', tr(p.en, p.ur)),
        choiceRow(P.MODES.map((m) => choice(`mode-${p.id}-${m.id}`, tr(m.en, m.ur), P.modeOf(a, p.id) === m.id, () => azan.setMode(p.id, m.id)))));
    }
    const voiceRow = (k, label, selected, id, onPick) => {
      const playing = azan.samplePlaying() === id;
      return h('div.quran-choices',
        round(`${k}-play-${id}`, playing ? t(S.stop) : t(PS.testAzan), playing ? '■' : '▶', () => {
          if (playing) azan.stopSample(); else azan.playSample(id, () => redraw());
          redraw();
        }),
        choice(`${k}-${id}`, label, selected, onPick));
    };
    const chosen = P.voiceById(voices, a.voiceId)?.id;
    body.push(heading(t(PS.muezzin)));
    if (!voices.length) body.push(h('p.quran-muted', t(PS.noVoices)));
    voices.filter((v) => !v.fajr).forEach((v) => body.push(voiceRow('voice', tr(v.en, v.ur), chosen === v.id, v.id, () => azan.set('voiceId', v.id))));
    body.push(heading(t(PS.fajrMuezzin)), choiceRow(choice('fajr-same', t(PS.sameAsOthers), !a.fajrVoiceId, () => azan.set('fajrVoiceId', ''))));
    voices.forEach((v) => body.push(voiceRow('fajr', tr(v.en, v.ur), a.fajrVoiceId === v.id, v.id, () => azan.set('fajrVoiceId', v.id))));
    body.push(stepper('volume', t(PS.volume), Math.round(a.volume / 10), 1, 10, '0%', (x) => azan.set('volume', x * 10)));
    body.push(heading(t(PS.reminder)), choiceRow([0, 5, 10, 15, 30].map((m) =>
      choice(`rem-${m}`, m === 0 ? t(PS.off) : `${m} ${t(PS.minutesShort)}`, a.reminder === m, () => azan.set('reminder', m)))));
    body.push(heading(t(PS.quiet)), choiceRow([[0, 0], [22, 6], [23, 5], [0, 5]].map(([from, to]) =>
      choice(`quiet-${from}-${to}`, from === to ? t(PS.off) : `${P.format(from * 60)} – ${P.format(to * 60)}`, a.quietFrom === from && a.quietTo === to,
        () => { azan.set('quietFrom', from); azan.set('quietTo', to); }))));
    const auto = P.methodForCountry(a.place?.country);
    body.push(heading(t(PS.method)), choiceRow(
      choice('method-auto', `${t(PS.automatic)} (${tr(auto.en, auto.ur)})`, !a.method, () => azan.set('method', null)),
      P.METHODS.map((m) => choice(`method-${m.id}`, tr(m.en, m.ur), a.method === m.id, () => azan.set('method', m.id)))));
    body.push(heading(t(PS.asr)), choiceRow(P.ASR.map((m) => choice(`asr-${m.id}`, tr(m.en, m.ur), a.asr === m.id, () => azan.set('asr', m.id)))));
    body.push(stepper('hijri', t(PS.hijriAdjust), a.hijriAdjust, -2, 2, '', (x) => azan.set('hijriAdjust', x)));
    body.push(heading(t(PS.place)),
      h('p', a.place ? [a.place.city, a.place.country].filter(Boolean).join(', ') : t(PS.findingPlace)),
      choiceRow(choice('find', t(PS.findAgain), false, () => azan.refreshPlace(true))));
    body.push(heading(t(PS.recordings)), ...voices.map((v) => h('p.quran-muted.namaz-credit', `${v.en}: ${v.credit}`)));
    const { el } = screenEl(topBar(t(PS.azanSettings), back), h('div.quran-form', body));
    return { el, first: el.querySelector('.quran-form [data-focus]'), cleanup: live() };
  }

  const SCREENS = {
    prayer: prayerScreen, azanSettings: azanSettingsScreen,
    home: homeScreen, qaidaMap: qaidaMapScreen, lesson: lessonScreen, quiz: quizScreen, surahs: surahsScreen,
    read: readScreen, hifzHome: hifzHomeScreen, hifzSetup: hifzSetupScreen, hifzSession: hifzSessionScreen, settings: settingsScreen,
  };

  // ---------- Keys ----------

  const pop = nav.push(root, (key) => {
    if (key === 'back') { back(); return true; }
    if (key === 'fullscreen') { window.pc?.fullscreen('toggle'); return true; }
    return false;
  });
  // Space and the keyboard's Play/Pause key pause and resume the recitation (the remote's Play/Pause).
  let lastToggle = 0;
  const playPause = () => {
    if (Date.now() - lastToggle < 300) return;
    lastToggle = Date.now();
    if (screen?.playPause) screen.playPause();
    else if (player.current()) player.togglePause();
  };
  const onKey = (e) => {
    const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA');
    if (document.querySelector('.scrim, .azan-full')) return;
    if ((e.key === ' ' && !typing) || e.key === 'MediaPlayPause') {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === 'keydown' && !e.repeat) playPause();
    }
  };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('keyup', onKey, true);
  // Windows sends the media keys to the playing page's media session too.
  const session = navigator.mediaSession;
  const mediaActions = ['play', 'pause'];
  try { mediaActions.forEach((a) => session?.setActionHandler(a, playPause)); } catch {}

  window.addEventListener('azan-start', quiet);

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    screen?.cleanup?.();
    player.onChange = null;
    speaker.onStatus = null;
    quiet();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('keyup', onKey, true);
    try { mediaActions.forEach((a) => session?.setActionHandler(a, null)); } catch {}
    window.removeEventListener('azan-start', quiet);
    pop();
    root.remove();
    onClose && onClose();
  }

  // The Quran text and reciters load while the home screen shows.
  loadReciters().then((r) => { reciters = r; }).catch(() => {});
  loadQuran().then((q) => { quran = q; }).catch(() => {});
  render();
  return { close };
}
