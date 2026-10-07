// The PC app's rules that must match the TV app's.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseM3u, nameKey, javaHashHex, countryCode, siteUrl, compareVersions, streamKinds, youtubeId } from '../src/ui/util.js';

test('parses an M3U playlist like M3uParser.kt', () => {
  const list = parseM3u('#EXTM3U\n#EXTINF:-1 tvg-id="geo.pk" tvg-logo="l.png" tvg-country="PK" group-title="Pakistani",Geo News\n' +
    '#EXTVLCOPT:http-user-agent=Mozilla\n#EXTVLCOPT:http-referrer=https://x.pk/\nhttps://a/b.m3u8\n');
  assert.equal(list.length, 1);
  assert.deepEqual([list[0].name, list[0].country, list[0].group, list[0].userAgent, list[0].referrer], ['Geo News', 'pk', 'Pakistani', 'Mozilla', 'https://x.pk/']);
});

test('channel keys are Java hashCodes, so PC and TV stats add up', () => {
  assert.equal(javaHashHex('hello'), (99162322).toString(16));
  assert.equal(javaHashHex(''), '0');
  // A negative Java hash shows as Integer.toHexString does.
  assert.equal(javaHashHex('https://example.com/live/stream.m3u8').length <= 8, true);
});

test('names, countries and sites', () => {
  assert.equal(nameKey('92 News HD'), nameKey('92 News'));
  assert.equal(countryCode({ country: 'gb' }), 'UK');
  assert.equal(siteUrl('bulkbazaar.ca'), 'https://bulkbazaar.ca');
  assert.equal(siteUrl('437 602 6500'), null);
});

test('versions, stream kinds and YouTube ids', () => {
  assert.ok(compareVersions('1.10.0', '1.9.9') > 0);
  assert.deepEqual(streamKinds('https://x/a.m3u8?t=1'), ['hls']);
  assert.deepEqual(streamKinds('https://x/a.ts'), ['ts']);
  assert.deepEqual(streamKinds('https://x/live'), ['hls', 'ts', 'file']);
  assert.equal(youtubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
});

test('weather section reads the forecast like WeatherApp.kt', async () => {
  const W = await import('../src/ui/weatherdata.js');
  const dates = ['2026-10-07', '2026-10-08', '2026-10-09'];
  const times = dates.flatMap((d) => [...Array(24).keys()].map((h) => `${d}T${String(h).padStart(2, '0')}:00`));
  const each = (f) => dates.flatMap(() => [...Array(24).keys()].map(f));
  const json = {
    current: { time: '2026-10-07T19:15', temperature_2m: 17.6, apparent_temperature: 16.2, relative_humidity_2m: 71, weather_code: 2, is_day: 0,
      wind_speed_10m: 14.3, wind_direction_10m: 310, wind_gusts_10m: 29, pressure_msl: 1015.4, uv_index: 0, visibility: 24140, cloud_cover: 40, dew_point_2m: 12.1 },
    hourly: { time: times, temperature_2m: each((h) => 10 + Math.floor(h / 2)), apparent_temperature: each((h) => 10 + Math.floor(h / 2)),
      weather_code: each((h) => (h === 15 ? 95 : 2)), precipitation_probability: each((h) => h * 4), is_day: each((h) => (h >= 7 && h <= 18 ? 1 : 0)),
      wind_speed_10m: each(() => 10) },
    daily: { time: dates, weather_code: [95, 3, 61], temperature_2m_max: [21.4, 33, 15], temperature_2m_min: [9.2, 12, 8],
      precipitation_probability_max: [80, 10, 60], precipitation_sum: [30, 0, 4.2], snowfall_sum: [0, 0, 0],
      sunrise: ['2026-10-07T07:19', '2026-10-08T07:20', '2026-10-09T07:21'], sunset: ['2026-10-07T18:44', '2026-10-08T18:42', '2026-10-09T18:40'],
      uv_index_max: [4.1, 5, 2], wind_speed_10m_max: [25, 70, 20] },
  };
  const r = W.parse(json, { latitude: 43.59, longitude: -79.64, city: 'Mississauga', country: 'CA', region: 'Ontario' }, false);
  assert.equal(r.current.temperature, 18);
  assert.equal(r.current.windFrom, 'NW');
  assert.equal(W.hoursFromNow(r)[0].time, '2026-10-07T19:00');
  assert.deepEqual(W.partsFromNow(r).map((p) => p.name), ['Evening', 'Night', 'Morning', 'Noon', 'Afternoon']);
  assert.equal(W.partsFromNow(r)[4].code, 95);
  const titles = W.headsUp(r).map((a) => a.title);
  for (const t of ['Thunderstorms today', 'Heavy rain today', 'Heat tomorrow', 'Strong wind tomorrow']) assert.ok(titles.includes(t), t);
  assert.equal(W.dayName('2026-10-09', '2026-10-07'), 'Fri');
  assert.equal(W.clock('2026-10-07T07:19'), '7:19 AM');
  const news = W.parseNews('<rss><item><title>Rain on the way - CBC News</title><link>https://n/1</link><pubDate>Tue, 07 Oct 2026 12:00:00 GMT</pubDate><source url="x">CBC News</source></item></rss>');
  assert.deepEqual([news[0].title, news[0].source], ['Rain on the way', 'CBC News']);
});
