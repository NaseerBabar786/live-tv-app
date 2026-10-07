// Prayer times on PC must match qurankit's (PrayerTimesTest.kt), with the same expected values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { prayerTimes, format, hijri, nextMode, methodForCountry, effectiveMode, nextEvent, around, parseVoices, voiceFor, timesFor, atMs } from '../src/ui/prayer.js';

function near(expected, minutes, slack = 2) {
  const [h, m] = expected.split(':').map(Number);
  assert.ok(Math.abs(h * 60 + m - minutes) <= slack, `expected ${expected}, got ${format(minutes, true)}`);
}

test('matches a published timetable', () => {
  // Quinte West, Ontario, 7 October 2026 (EDT, UTC-4), as a well-known prayer app shows it.
  const t = prayerTimes(2026, 10, 7, 44.11, -77.58, -240, 'Isna', 'Shafi');
  near('07:15', t.Sunrise);
  near('16:06', t.Asr);
  near('18:41', t.Maghrib);
  near('20:00', t.Isha);
  assert.ok(t.Fajr < t.Sunrise && t.Sunrise < t.Zuhr);
  assert.ok(t.Zuhr < t.Asr && t.Asr < t.Maghrib && t.Maghrib < t.Isha);
});

test('Hanafi Asr is later', () => {
  const shafi = prayerTimes(2026, 10, 7, 24.86, 67.0, 300, 'Karachi', 'Shafi');
  const hanafi = prayerTimes(2026, 10, 7, 24.86, 67.0, 300, 'Karachi', 'Hanafi');
  assert.ok(hanafi.Asr > shafi.Asr + 30);
});

test('Umm al-Qura Isha is 90 minutes after Maghrib', () => {
  const t = prayerTimes(2026, 3, 1, 21.42, 39.83, 180, 'UmmAlQura', 'Shafi');
  assert.ok(Math.abs(t.Isha - t.Maghrib - 90) <= 1);
});

test('formats 12 and 24 hours', () => {
  assert.equal(format(5 * 60 + 45), '5:45 AM');
  assert.equal(format(12 * 60 + 3), '12:03 PM');
  assert.equal(format(0), '12:00 AM');
  assert.equal(format(20 * 60, true), '20:00');
});

test('Hijri dates', () => {
  // 1 Ramadan 1446 = 1 March 2025; 1 Ramadan 1447 = 18 February 2026 (arithmetic calendar).
  assert.deepEqual(hijri(2025, 3, 1), [1, 9, 1446]);
  assert.deepEqual(hijri(2026, 2, 18), [1, 9, 1447]);
  assert.deepEqual(hijri(2026, 10, 7), [24, 4, 1448]);
});

test('modes cycle', () => {
  assert.equal(nextMode('Azan'), 'Chime');
  assert.equal(nextMode('Off'), 'Azan');
});

test('method by country', () => {
  assert.equal(methodForCountry('ca').id, 'Isna');
  assert.equal(methodForCountry('PK').id, 'Karachi');
  assert.equal(methodForCountry(null).id, 'Mwl');
});

// The PC's own checks of the Azan rules (AzanSettings in Azan.kt).
const settings = (o = {}) => ({ modes: {}, voiceId: 'makkah', fajrVoiceId: '', volume: 80, reminder: 0, quietFrom: 0, quietTo: 0,
  method: null, asr: 'Shafi', hijriAdjust: 0, place: { latitude: 44.11, longitude: -77.58, city: 'Quinte West', country: 'CA' }, ...o });

test('quiet hours turn an Azan into a message', () => {
  const night = new Date(2026, 9, 7, 23, 30).getTime();
  const day = new Date(2026, 9, 7, 13, 0).getTime();
  const s = settings({ quietFrom: 22, quietTo: 6 });
  assert.equal(effectiveMode(s, 'Isha', night), 'Message');
  assert.equal(effectiveMode(s, 'Zuhr', day), 'Azan');
  assert.equal(effectiveMode(settings({ modes: { Zuhr: 'Off' }, quietFrom: 22, quietTo: 6 }), 'Zuhr', night), 'Off');
});

test('next event, reminders and the prayers around now', () => {
  // An hour before Zuhr, whatever the test machine's time zone.
  const base = new Date(2026, 9, 7, 12, 0).getTime();
  const now = atMs(0, timesFor(settings(), 0, base).Zuhr - 60, base);
  const e = nextEvent(settings(), now);
  assert.equal(e.prayer, 'Zuhr');
  assert.equal(e.mode, 'Azan');
  const r = nextEvent(settings({ reminder: 10 }), now);
  assert.ok(r.reminder && r.at === e.at - 10 * 60000);
  assert.equal(nextEvent(settings({ modes: { Zuhr: 'Off' } }), now).prayer, 'Asr');
  const [last, next] = around(settings(), now);
  assert.deepEqual([last[0], next[0]], ['Sunrise', 'Zuhr']);
  assert.equal(nextEvent(settings({ place: null }), now), null);
});

test('recordings list and the Fajr choice', () => {
  const voices = parseVoices(JSON.stringify({ voices: [{ id: 'makkah', en: 'Makkah', file: 'makkah.mp3' }, { id: 'f', en: 'Fajr', fajr: true, file: 'f.mp3' }] }));
  assert.equal(voices[0].url, 'https://tv.bulkbazaar.ca/quran/azan/makkah.mp3');
  assert.equal(voiceFor(settings(), voices, 'Fajr').id, 'makkah');
  assert.equal(voiceFor(settings({ fajrVoiceId: 'f' }), voices, 'Fajr').id, 'f');
  assert.equal(voiceFor(settings({ fajrVoiceId: 'f' }), voices, 'Zuhr').id, 'makkah');
  assert.deepEqual(parseVoices('nope'), []);
});
