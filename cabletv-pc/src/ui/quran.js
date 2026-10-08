// Iqra Quran's rules, kept apart from the screens so the tests can check them: the kids' Qaida path
// (Qaida.kt), Hifz revision the madrasa way (Hifz.kt) and the recitation links (Reciter in Quran.kt).
// No DOM here. Days are epoch days (days since 1970-01-01, local time).

// ---------- Recitations (Quran.kt) ----------

/** "Husary_128kbps", 2, 255 -> https://everyayah.com/data/Husary_128kbps/002255.mp3 */
export const audioUrl = (folder, surah, ayah) =>
  `https://everyayah.com/data/${folder}/${String(surah).padStart(3, '0')}${String(ayah).padStart(3, '0')}.mp3`;

/** Arabic numerals in the ayah-end marker, e.g. ﴿١٢﴾ (ReadScreens.kt). */
export const ayahMark = (n) => `﴿${String(n).replace(/[0-9]/g, (d) => String.fromCharCode(0x660 + +d))}﴾`;

/** Today as days since 1 Jan 1970 in local time (AppViewModel.today). */
export function today(now = Date.now()) {
  return Math.floor((now - new Date(now).getTimezoneOffset() * 60000) / 86400000);
}

// ---------- Hifz (Hifz.kt) ----------
// Sabaq: today's new lesson. Sabqi: lessons from the last 7 days, revised every day.
// Manzil: older lessons, revised on a growing schedule so nothing is forgotten.
// An item is { surah, from, to, learnedOn, lastReview, level, weak }.

export const hifzKey = (item) => `${item.surah}:${item.from}-${item.to}`;

/** Days between Manzil revisions, growing each time a passage is revised well. */
const INTERVALS = [1, 2, 4, 7, 14, 21, 30];
export const interval = (level) => INTERVALS[Math.min(Math.max(level, 0), INTERVALS.length - 1)];

export const GROUPS = ['Sabaq', 'Sabqi', 'Manzil'];

export function group(item, day) {
  const d = day - item.learnedOn;
  if (d === 0) return 'Sabaq';
  if (d >= 1 && d <= 7) return 'Sabqi';
  return 'Manzil';
}

/** Whether [item] should be revised on [day]. Sabaq and Sabqi are daily; weak passages too. */
export function isDue(item, day) {
  if (item.lastReview >= day) return false;
  if (group(item, day) !== 'Manzil') return true;
  return !!item.weak || day - item.lastReview >= interval(item.level || 0);
}

/** After a revision: "good" moves the next Manzil revision further out, "weak" brings it back. */
export function reviewed(item, day, good) {
  return good
    ? { ...item, lastReview: day, level: (item.level || 0) + 1, weak: false }
    : { ...item, lastReview: day, level: Math.max(0, (item.level || 0) - 2), weak: true };
}

/**
 * The listening plan for a lesson: each ayah [perAyah] times, then the whole passage [wholeTimes]
 * times so the ayahs join up in memory. Steps are { surah, ayah, round, rounds }.
 */
export function plan(surah, from, to, perAyah, wholeTimes) {
  if (!(from >= 1 && from <= to)) throw new Error(`bad range ${from}-${to}`);
  const steps = [];
  for (let a = from; a <= to; a++) for (let r = 1; r <= perAyah; r++) steps.push({ surah, ayah: a, round: r, rounds: perAyah });
  if (to > from) {
    for (let r = 1; r <= wholeTimes; r++) for (let a = from; a <= to; a++) steps.push({ surah, ayah: a, round: r, rounds: wholeTimes });
  }
  return steps;
}

/** Where each of the 30 juz starts, as [surah, ayah]. */
export const JUZ_STARTS = [
  [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148], [5, 82], [6, 111], [7, 88], [8, 41],
  [9, 93], [11, 6], [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1], [25, 21], [27, 56],
  [29, 46], [33, 31], [36, 28], [39, 32], [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
];

/** The juz (1 to 30) an ayah is in. */
export function juzOf(surah, ayah) {
  let juz = 1;
  JUZ_STARTS.forEach(([s, a], i) => { if (surah > s || (surah === s && ayah >= a)) juz = i + 1; });
  return juz;
}

/** Share of each juz memorized, 0 to 1, from [items] and each surah's ayah count (index 0 = surah 1). */
export function juzProgress(items, ayahCounts) {
  const total = new Array(30).fill(0);
  ayahCounts.forEach((count, i) => { for (let a = 1; a <= count; a++) total[juzOf(i + 1, a) - 1]++; });
  const known = new Set();
  for (const it of items) for (let a = it.from; a <= it.to; a++) known.add(`${it.surah}:${a}`);
  const done = new Array(30).fill(0);
  for (const k of known) { const [s, a] = k.split(':').map(Number); done[juzOf(s, a) - 1]++; }
  return total.map((t, i) => (t === 0 ? 0 : done[i] / t));
}

// ---------- Qaida (Qaida.kt) ----------
// Letters, joined shapes, harakat, tanween, long vowels, jazm, tashdeed, words, then short surahs.

const FATHA = 'َ', KASRA = 'ِ', DAMMA = 'ُ';
const FATHATAN = 'ً', KASRATAN = 'ٍ', DAMMATAN = 'ٌ';
const SUKUN = 'ْ', SHADDA = 'ّ', ZWJ = '‍';

const L = (char, say, en, ur, joins = true) => ({ char, say, en, ur, joins });

/** The 29 letters with their names; [say] is what the Arabic voice reads out. */
export const LETTERS = [
  L('ا', 'أَلِف', 'Alif', 'الف', false), L('ب', 'بَاء', 'Baa', 'با'), L('ت', 'تَاء', 'Taa', 'تا'),
  L('ث', 'ثَاء', 'Thaa', 'ثا'), L('ج', 'جِيم', 'Jeem', 'جیم'), L('ح', 'حَاء', 'Haa', 'حا'),
  L('خ', 'خَاء', 'Khaa', 'خا'), L('د', 'دَال', 'Daal', 'دال', false), L('ذ', 'ذَال', 'Dhaal', 'ذال', false),
  L('ر', 'رَاء', 'Raa', 'را', false), L('ز', 'زَاي', 'Zaa', 'زا', false), L('س', 'سِين', 'Seen', 'سین'),
  L('ش', 'شِين', 'Sheen', 'شین'), L('ص', 'صَاد', 'Saad', 'صاد'), L('ض', 'ضَاد', 'Daad', 'ضاد'),
  L('ط', 'طَاء', 'Taa (heavy)', 'طا'), L('ظ', 'ظَاء', 'Zaa (heavy)', 'ظا'), L('ع', 'عَيْن', 'Ain', 'عین'),
  L('غ', 'غَيْن', 'Ghain', 'غین'), L('ف', 'فَاء', 'Faa', 'فا'), L('ق', 'قَاف', 'Qaaf', 'قاف'),
  L('ك', 'كَاف', 'Kaaf', 'کاف'), L('ل', 'لَام', 'Laam', 'لام'), L('م', 'مِيم', 'Meem', 'میم'),
  L('ن', 'نُون', 'Noon', 'نون'), L('و', 'وَاو', 'Waw', 'واؤ', false), L('ه', 'هَاء', 'Ha', 'ہا'),
  L('ء', 'هَمْزَة', 'Hamza', 'ہمزہ', false), L('ي', 'يَاء', 'Yaa', 'یا'),
];

/** Letters that carry a vowel sign in the sound lessons (no alif, no hamza). */
const voiced = LETTERS.filter((l) => l.char !== 'ا' && l.char !== 'ء');

/** The start, middle and end shapes of a letter, using a zero-width joiner to show the joins. */
export const shapes = (l) => (l.joins ? [l.char, l.char + ZWJ, ZWJ + l.char + ZWJ, ZWJ + l.char] : [l.char, ZWJ + l.char]);

/** One card: [text] shown big, [say] read out, [en]/[ur] small labels under it. */
const item = (text, say, en = '', ur = '') => ({ text, say, en, ur });

const withMarks = (...marks) => voiced.flatMap((l) => marks.map((m) => item(l.char + m, l.char + m, l.en, l.ur)));
const longVowels = () => voiced.flatMap((l) => [
  item(l.char + FATHA + 'ا', l.char + FATHA + 'ا', l.en, l.ur),
  item(l.char + KASRA + 'ي' + SUKUN, l.char + KASRA + 'ي', l.en, l.ur),
  item(l.char + DAMMA + 'و' + SUKUN, l.char + DAMMA + 'و', l.en, l.ur),
]);
const jazm = () => voiced.flatMap((l) => [FATHA, KASRA, DAMMA].map((v) => { const t = `ا${v}${l.char}${SUKUN}`; return item(t, t, l.en, l.ur); }));
const tashdeed = () => voiced.flatMap((l) => [FATHA, KASRA, DAMMA].map((v) => { const t = `ا${FATHA}${l.char}${SHADDA}${v}`; return item(t, t, l.en, l.ur); }));

/** Short words from the Quran with their meaning. */
export const WORDS = [
  item('اَللّٰهُ', 'اَللّٰهُ', 'Allah', 'اللہ'), item('رَبِّ', 'رَبِّ', 'Lord', 'رب'),
  item('اَلْحَمْدُ', 'اَلْحَمْدُ', 'All praise', 'تمام تعریف'), item('رَحْمٰنِ', 'رَحْمَانِ', 'Most Merciful', 'بہت مہربان'),
  item('مٰلِكِ', 'مَالِكِ', 'Master', 'مالک'), item('يَوْمِ', 'يَوْمِ', 'Day', 'دن'),
  item('كِتَابٌ', 'كِتَابٌ', 'Book', 'کتاب'), item('قَلَمٌ', 'قَلَمٌ', 'Pen', 'قلم'),
  item('بَيْتٌ', 'بَيْتٌ', 'House', 'گھر'), item('نُوْرٌ', 'نُورٌ', 'Light', 'نور'),
  item('جَنَّةٌ', 'جَنَّةٌ', 'Paradise', 'جنت'), item('قُرْاٰنٌ', 'قُرْآنٌ', 'Quran', 'قرآن'),
  item('اِسْلَامٌ', 'إِسْلَامٌ', 'Islam', 'اسلام'), item('مَسْجِدٌ', 'مَسْجِدٌ', 'Mosque', 'مسجد'),
  item('رَسُوْلٌ', 'رَسُولٌ', 'Messenger', 'رسول'), item('نَبِيٌّ', 'نَبِيٌّ', 'Prophet', 'نبی'),
  item('سَلَامٌ', 'سَلَامٌ', 'Peace', 'سلامتی'), item('خَلَقَ', 'خَلَقَ', 'He created', 'اس نے پیدا کیا'),
  item('قُلْ', 'قُلْ', 'Say', 'کہو'), item('هُوَ', 'هُوَ', 'He', 'وہ'),
  item('اَحَدٌ', 'أَحَدٌ', 'One', 'ایک'), item('اَلنَّاسِ', 'النَّاسِ', 'Mankind', 'لوگ'),
  item('اَلْفَلَقِ', 'الْفَلَقِ', 'Daybreak', 'صبح'), item('اِقْرَاْ', 'اِقْرَأْ', 'Read', 'پڑھ'),
  item('عَلَّمَ', 'عَلَّمَ', 'He taught', 'اس نے سکھایا'), item('صَبْرٌ', 'صَبْرٌ', 'Patience', 'صبر'),
  item('شُكْرٌ', 'شُكْرٌ', 'Thanks', 'شکر'), item('اُمٌّ', 'أُمٌّ', 'Mother', 'ماں'),
];

/** Short surahs for the last step, in the order children usually learn them. */
export const FIRST_SURAHS = [1, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98, 97];

const lesson = (id, en, ur, tipEn, tipUr, kind, items) => ({ id, en, ur, tipEn, tipUr, kind, items });

export const LESSONS = [
  lesson(1, 'Letters', 'حروفِ تہجی', 'Tap a letter to hear its name. Say it after the voice.',
    'حرف پر ٹیپ کریں اور اس کا نام سنیں۔ آواز کے بعد دہرائیں۔', 'Letters', LETTERS.map((l) => item(l.char, l.say, l.en, l.ur))),
  lesson(2, 'Joined letters', 'حروفِ مرکبات', 'Letters change shape when they join: start, middle and end.',
    'حروف ملنے پر شکل بدلتے ہیں: شروع، درمیان اور آخر۔', 'Shapes', LETTERS.map((l) => item(shapes(l).join('  '), l.say, l.en, l.ur))),
  lesson(3, 'Zabar', 'زبر', 'Zabar is a small line above the letter. It makes an "a" sound: ba, ta, tha.',
    'زبر حرف کے اوپر چھوٹی لکیر ہے۔ اس سے "اَ" کی آواز آتی ہے: بَ، تَ، ثَ۔', 'Sounds', withMarks(FATHA)),
  lesson(4, 'Zer', 'زیر', 'Zer is a small line below the letter. It makes an "i" sound: bi, ti, thi.',
    'زیر حرف کے نیچے چھوٹی لکیر ہے۔ اس سے "اِ" کی آواز آتی ہے: بِ، تِ، ثِ۔', 'Sounds', withMarks(KASRA)),
  lesson(5, 'Pesh', 'پیش', 'Pesh is a small waw above the letter. It makes a "u" sound: bu, tu, thu.',
    'پیش حرف کے اوپر چھوٹی واؤ ہے۔ اس سے "اُ" کی آواز آتی ہے: بُ، تُ، ثُ۔', 'Sounds', withMarks(DAMMA)),
  lesson(6, 'Zabar, zer, pesh together', 'زبر، زیر، پیش ایک ساتھ', 'Read each letter three ways: ba, bi, bu.',
    'ہر حرف کو تین طرح پڑھیں: بَ، بِ، بُ۔', 'Sounds', withMarks(FATHA, KASRA, DAMMA)),
  lesson(7, 'Tanween', 'تنوین', 'Two zabar, two zer or two pesh add an "n" sound: ban, bin, bun.',
    'دو زبر، دو زیر یا دو پیش سے "ن" کی آواز آتی ہے: بًا، بٍ، بٌ۔', 'Sounds', withMarks(FATHATAN, KASRATAN, DAMMATAN)),
  lesson(8, 'Long vowels (madd)', 'حروفِ مدہ', 'Alif, yaa and waw after a vowel make it long: baa, bee, boo.',
    'الف، یا اور واؤ آواز کو لمبا کرتے ہیں: بَا، بِیْ، بُوْ۔', 'Sounds', longVowels()),
  lesson(9, 'Jazm (sukoon)', 'جزم', 'Jazm means the letter has no vowel; join it to the letter before: ab, ib, ub.',
    'جزم والا حرف پچھلے حرف سے مل کر پڑھا جاتا ہے: اَبْ، اِبْ، اُبْ۔', 'Sounds', jazm()),
  lesson(10, 'Tashdeed', 'تشدید', 'Tashdeed doubles the letter: read it twice, once joined and once with its vowel.',
    'تشدید والا حرف دو بار پڑھا جاتا ہے: ایک بار ملا کر، ایک بار حرکت کے ساتھ۔', 'Sounds', tashdeed()),
  lesson(11, 'Quran words', 'قرآنی الفاظ', 'Now read whole words from the Quran, and learn what they mean.',
    'اب قرآن کے پورے الفاظ پڑھیں اور ان کا مطلب سیکھیں۔', 'Words', WORDS),
  lesson(12, 'Short surahs', 'چھوٹی سورتیں', 'Listen to the teacher read slowly, ayah by ayah, and repeat.',
    'استاد کی آہستہ تلاوت سنیں، آیت بہ آیت، اور دہرائیں۔', 'Surahs', []),
];

export const lessonById = (id) => LESSONS.find((l) => l.id === id);

/** Stars for a finished quiz: 3 for at most one mistake, 2 for a few, otherwise 1. */
export const stars = (mistakes) => (mistakes <= 1 ? 3 : mistakes <= 4 ? 2 : 1);

/** How many questions a quiz asks. */
export const QUIZ_LENGTH = 10;

const shuffled = (list, rnd) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};

/** A quiz question: the answer and four options (the answer among them), never repeating [previous]. */
export function newQuestion(pool, previous = null, rnd = Math.random) {
  const choices = pool.filter((it) => it !== previous);
  const answer = choices[Math.floor(rnd() * choices.length)];
  const others = shuffled(pool.filter((it) => it !== answer && it.say !== answer.say), rnd).slice(0, 3);
  return { answer, options: shuffled([...others, answer], rnd) };
}

/** Items with the same text (e.g. the same word twice) would make two right answers. */
export const quizPool = (l) => l.items.filter((it, i, all) => all.findIndex((x) => x.text === it.text) === i);

// ---------- Translations (Translations.kt, Store.translations) ----------
// Urdu and English ship with the app; the other languages are downloaded the first time they're picked.

export const TR_BASE = 'https://tv.bulkbazaar.ca/quran/tr/';

/** A language: { code, en, native, rtl, translator }. */
export const BUILT_IN_LANGS = [
  { code: 'ur', en: 'Urdu', native: 'اردو', rtl: true, translator: 'Fateh Muhammad Jalandhari' },
  { code: 'en', en: 'English', native: 'English', rtl: false, translator: 'Saheeh International' },
];

/** The downloadable languages from index.json (the built-in two left out); empty when the text isn't a list. */
export function parseTrIndex(text) {
  try {
    const o = typeof text === 'string' ? JSON.parse(text) : text;
    return o.languages
      .map((l) => ({ code: l.code, en: l.en, native: l.native || l.en, rtl: !!l.rtl, translator: l.translator || '' }))
      .filter((l) => l.code && !BUILT_IN_LANGS.some((b) => b.code === l.code));
  } catch {
    return [];
  }
}

/** The translations to show, from before there were languages: None, Urdu, English or Both. */
export function migrateTranslations(old) {
  if (old === 'None') return [];
  if (old === 'English') return ['en'];
  if (old === 'Both') return ['ur', 'en'];
  return ['ur'];
}

/** Shows or hides [code] under each ayah; at most three at once (the oldest pick goes). */
export function toggleTranslation(list, code) {
  return list.includes(code) ? list.filter((c) => c !== code) : [...list, code].slice(-3);
}

/** A translation file's text, per surah and ayah. */
export const parseTranslation = (text) => (typeof text === 'string' ? JSON.parse(text) : text).surahs;
