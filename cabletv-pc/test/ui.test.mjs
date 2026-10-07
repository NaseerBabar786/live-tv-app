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
