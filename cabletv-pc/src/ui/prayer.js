// Prayer times and the Azan's rules (qurankit: Prayer.kt and Azan.kt), kept apart from the screens so the
// tests can check them. Times are worked out on the PC from the sun's position (the praytimes.org formulas),
// so they need no internet. No DOM here. [s] below is the Azan settings object (screens/quran.js, azan.js):
// { modes, voiceId, fajrVoiceId, volume, reminder, quietFrom, quietTo, method, asr, hijriAdjust, place }.

/** The five prayers, plus sunrise (shown on the timeline, never an Azan). */
export const PRAYERS = [
  { id: 'Fajr', en: 'Fajr', ur: 'فجر', hasAzan: true },
  { id: 'Sunrise', en: 'Sunrise', ur: 'طلوعِ آفتاب', hasAzan: false },
  { id: 'Zuhr', en: 'Zuhr', ur: 'ظہر', hasAzan: true },
  { id: 'Asr', en: 'Asr', ur: 'عصر', hasAzan: true },
  { id: 'Maghrib', en: 'Maghrib', ur: 'مغرب', hasAzan: true },
  { id: 'Isha', en: 'Isha', ur: 'عشاء', hasAzan: true },
];
export const WITH_AZAN = PRAYERS.filter((p) => p.hasAzan);
export const prayerById = (id) => PRAYERS.find((p) => p.id === id);

/** What happens at a prayer's time; the bell on the timeline goes round them in this order. */
export const MODES = [
  { id: 'Azan', en: 'Azan', ur: 'اذان' },
  { id: 'Chime', en: 'Chime', ur: 'گھنٹی' },
  { id: 'Message', en: 'Message', ur: 'پیغام' },
  { id: 'Off', en: 'Off', ur: 'بند' },
];
export const nextMode = (id) => MODES[(MODES.findIndex((m) => m.id === id) + 1) % MODES.length].id;

/**
 * Ways of working out Fajr and Isha: the sun's angle below the horizon, or (Umm al-Qura) Isha a fixed
 * time after Maghrib. ISNA is what Cable TV's News mode shows (aladhan method 2).
 */
export const METHODS = [
  { id: 'Isna', en: 'North America (ISNA)', ur: 'شمالی امریکہ (ISNA)', fajr: 15, isha: 15, ishaMinutes: 0 },
  { id: 'Karachi', en: 'Karachi (Pakistan, India)', ur: 'کراچی (پاکستان، بھارت)', fajr: 18, isha: 18, ishaMinutes: 0 },
  { id: 'Mwl', en: 'Muslim World League', ur: 'مسلم ورلڈ لیگ', fajr: 18, isha: 17, ishaMinutes: 0 },
  { id: 'UmmAlQura', en: 'Umm al-Qura (Makkah)', ur: 'ام القریٰ (مکہ)', fajr: 18.5, isha: 0, ishaMinutes: 90 },
  { id: 'Egypt', en: 'Egypt', ur: 'مصر', fajr: 19.5, isha: 17.5, ishaMinutes: 0 },
  { id: 'Ahmadiyya', en: "Ahmadiyya Muslim Jama'at", ur: 'جماعت احمدیہ', fajr: 18, isha: 18, ishaMinutes: 0 },
];
const method = (id) => METHODS.find((m) => m.id === id);

/** The usual method where the viewer lives (country code from their internet address). */
export function methodForCountry(code) {
  const c = String(code || '').toUpperCase();
  if (['US', 'CA'].includes(c)) return method('Isna');
  if (['PK', 'IN', 'BD', 'AF'].includes(c)) return method('Karachi');
  if (['SA', 'AE', 'QA', 'KW', 'BH', 'OM', 'YE'].includes(c)) return method('UmmAlQura');
  if (['EG', 'SD', 'LY'].includes(c)) return method('Egypt');
  return method('Mwl');
}

/** Asr: Shafi, Maliki and Hanbali (shadow as long as the thing) or Hanafi (twice as long). */
export const ASR = [
  { id: 'Shafi', en: 'Shafi (standard)', ur: 'شافعی (عام)', factor: 1 },
  { id: 'Hanafi', en: 'Hanafi', ur: 'حنفی', factor: 2 },
];

// ---------- The sun (PrayerTimes in Prayer.kt) ----------

const mod = (a, n) => ((a % n) + n) % n;
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

function julian(year, month, day) {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + b - 1524.5;
}

/** The sun's declination and the equation of time (hours) at Julian day [jd]. */
function sun(jd) {
  const d = jd - 2451545.0;
  const g = mod(357.529 + 0.98560028 * d, 360);
  const q = mod(280.459 + 0.98564736 * d, 360);
  const l = mod(q + 1.915 * Math.sin(rad(g)) + 0.020 * Math.sin(rad(2 * g)), 360);
  const e = 23.439 - 0.00000036 * d;
  const ra = mod(deg(Math.atan2(Math.cos(rad(e)) * Math.sin(rad(l)), Math.cos(rad(l)))) / 15, 24);
  const decl = deg(Math.asin(Math.sin(rad(e)) * Math.sin(rad(l))));
  const eqt = mod(q / 15 - ra + 12, 24) - 12;
  return [decl, eqt];
}

/**
 * Times for [year]-[month]-[day] at [lat], [lng], as minutes after local midnight keyed by prayer id;
 * [offset] is the local time zone's offset from UTC that day, in minutes. [methodId]/[asrId] name METHODS/ASR.
 */
export function prayerTimes(year, month, day, lat, lng, offset, methodId, asrId) {
  const m = method(methodId) || method('Mwl');
  const asr = ASR.find((a) => a.id === asrId) || ASR[0];
  const jd = julian(year, month, day) - lng / (15 * 24);
  const noon = (t) => mod(12 - sun(jd + t / 24)[1], 24);
  const angleTime = (angle, t, before) => {
    const decl = sun(jd + t / 24)[0];
    const v = (-Math.sin(rad(angle)) - Math.sin(rad(decl)) * Math.sin(rad(lat))) / (Math.cos(rad(decl)) * Math.cos(rad(lat)));
    const h = deg(Math.acos(Math.min(1, Math.max(-1, v)))) / 15;
    return noon(t) + (before ? -h : h);
  };
  const asrTime = (t) => {
    const decl = sun(jd + t / 24)[0];
    return angleTime(-deg(Math.atan(1 / (asr.factor + Math.tan(rad(Math.abs(lat - decl)))))), t, false);
  };
  let t = [5, 6, 12, 13, 18, 18];
  for (let i = 0; i < 2; i++) {
    t = [
      angleTime(m.fajr, t[0], true), angleTime(0.833, t[1], true), noon(t[2]), asrTime(t[3]),
      angleTime(0.833, t[4], false), m.ishaMinutes > 0 ? t[4] : angleTime(m.isha, t[5], false),
    ];
  }
  const shift = offset / 60 - lng / 15;
  const hours = t.map((x) => x + shift);
  if (m.ishaMinutes > 0) hours[5] = hours[4] + m.ishaMinutes / 60;
  // Zuhr a few minutes after the sun's highest point, as prayer timetables give it.
  hours[2] += 2 / 60;
  return Object.fromEntries(PRAYERS.map((p, i) => [p.id, mod(Math.round(hours[i] * 60), 24 * 60)]));
}

/** "5:45 AM" or, with [h24], "05:45". */
export function format(minutes, h24 = false) {
  const h = Math.floor(minutes / 60) % 24, m = minutes % 60;
  const mm = String(m).padStart(2, '0');
  if (h24) return `${String(h).padStart(2, '0')}:${mm}`;
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---------- The Islamic date (Hijri in Prayer.kt) ----------

export const HIJRI_EN = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Thani',
  'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul Qadah', 'Dhul Hijjah'];
export const HIJRI_UR = ['محرم', 'صفر', 'ربیع الاول', 'ربیع الثانی', 'جمادی الاول', 'جمادی الثانی',
  'رجب', 'شعبان', 'رمضان', 'شوال', 'ذوالقعدہ', 'ذوالحجہ'];

/** [day, month 1-12, year] by the usual arithmetic calendar; [adjust] moves it to match local moon sighting. */
export function hijri(year, month, day, adjust = 0) {
  const f = Math.floor;
  let y = year, m = month;
  if (m < 3) { y -= 1; m += 12; }
  const a = f(y / 100);
  const b = 2 - a + f(a / 4);
  const jd = f(365.25 * (y + 4716)) + f(30.6001 * (m + 1)) + day + b - 1524 + adjust;
  const l0 = jd - 1948440 + 10632;
  const n = f((l0 - 1) / 10631);
  const l1 = l0 - 10631 * n + 354;
  const j = f((10985 - l1) / 5316) * f((50 * l1) / 17719) + f(l1 / 5670) * f((43 * l1) / 15238);
  const l2 = l1 - f((30 - j) / 15) * f((17719 * j) / 50) - f(j / 16) * f((15238 * j) / 43) + 29;
  const hm = f((24 * l2) / 709);
  const hd = l2 - f((709 * hm) / 24);
  return [hd, hm, 30 * n + j - 30];
}

// ---------- The Azan settings' rules (AzanSettings in Azan.kt) ----------

export const DEFAULTS = {
  modes: {}, voiceId: 'makkah', fajrVoiceId: '', volume: 80, reminder: 0, quietFrom: 0, quietTo: 0,
  method: null, asr: 'Shafi', hijriAdjust: 0, place: null,
};
export const modeOf = (s, prayerId) => s.modes?.[prayerId] || 'Azan';

/** The method in use: the chosen one, else the usual one for the viewer's country. */
export const methodInUse = (s) => method(s.method) || methodForCountry(s.place?.country);

/** Local midnight-based date [daysFromToday] after [now]. */
function dayOf(now, daysFromToday) {
  const d = new Date(now);
  d.setDate(d.getDate() + daysFromToday);
  return d;
}

/** One day's times (minutes after midnight by prayer id), or null before the place is known. */
export function timesFor(s, daysFromToday = 0, now = Date.now()) {
  const p = s.place;
  if (!p) return null;
  const d = dayOf(now, daysFromToday);
  d.setHours(12, 0, 0, 0);
  return prayerTimes(d.getFullYear(), d.getMonth() + 1, d.getDate(), p.latitude, p.longitude, -d.getTimezoneOffset(), methodInUse(s).id, s.asr);
}

/** Epoch ms of [minutes] after midnight on the day [daysFromToday]. */
export function atMs(daysFromToday, minutes, now = Date.now()) {
  const d = dayOf(now, daysFromToday);
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d.getTime();
}

/** What a prayer's mode becomes at [at]: during quiet hours an Azan or chime is only a message. */
export function effectiveMode(s, prayerId, at) {
  const m = modeOf(s, prayerId);
  if (s.quietFrom === s.quietTo || m === 'Off' || m === 'Message') return m;
  const hour = new Date(at).getHours();
  const quiet = s.quietFrom < s.quietTo ? hour >= s.quietFrom && hour < s.quietTo : hour >= s.quietFrom || hour < s.quietTo;
  return quiet ? 'Message' : m;
}

/** The next Azan, chime, message or reminder after [now], as { prayer, at, mode, reminder } (two days ahead). */
export function nextEvent(s, now = Date.now()) {
  const events = [];
  for (let day = 0; day <= 2; day++) {
    const t = timesFor(s, day, now);
    if (!t) return null;
    for (const p of WITH_AZAN) {
      const at = atMs(day, t[p.id], now);
      const mode = effectiveMode(s, p.id, at);
      if (mode === 'Off') continue;
      events.push({ prayer: p.id, at, mode, reminder: false });
      if (s.reminder > 0) events.push({ prayer: p.id, at: at - s.reminder * 60000, mode: 'Message', reminder: true });
    }
  }
  return events.filter((e) => e.at > now).sort((a, b) => a.at - b.at)[0] || null;
}

/** The prayer whose time it is now (the last one passed) and the next one: [[id, ms], [id, ms]], or null. */
export function around(s, now = Date.now()) {
  const all = [];
  for (let day = -1; day <= 1; day++) {
    const t = timesFor(s, day, now);
    if (!t) return null;
    for (const p of PRAYERS) all.push([p.id, atMs(day, t[p.id], now)]);
  }
  all.sort((a, b) => a[1] - b[1]);
  let i = -1;
  all.forEach((x, k) => { if (x[1] <= now) i = k; });
  if (i < 0 || i + 1 >= all.length) return null;
  return [all[i], all[i + 1]];
}

/** "1 h 20 min" / "41 min" ([min] and [hours] are the words in the viewer's language). */
export function countdown(ms, min = 'min', hours = null) {
  const mins = Math.max(0, Math.floor((ms + 59999) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? (hours ? `${h} ${hours} ${m} ${min}` : `${h} h ${m} ${min}`) : `${m} ${min}`;
}

// ---------- Recordings (docs/quran/azan/azan.json) ----------

export const AZAN_BASE = 'https://tv.bulkbazaar.ca/quran/azan/';

/** The recordings list: [{ id, en, ur, fajr, url, credit }]; empty when the text isn't a list. */
export function parseVoices(text) {
  try {
    const o = typeof text === 'string' ? JSON.parse(text) : text;
    return o.voices.map((v) => ({ id: v.id, en: v.en, ur: v.ur || v.en, fajr: !!v.fajr, url: AZAN_BASE + v.file, credit: v.credit || '' }));
  } catch {
    return [];
  }
}

export const voiceById = (voices, id) => voices.find((v) => v.id === id) || voices.find((v) => !v.fajr) || null;

/** The recording for [prayerId]. */
export const voiceFor = (s, voices, prayerId) =>
  voiceById(voices, prayerId === 'Fajr' && s.fajrVoiceId ? s.fajrVoiceId : s.voiceId);
