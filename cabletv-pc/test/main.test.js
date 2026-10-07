// The window's helpers: versions, crash reports and stream headers.
const test = require('node:test');
const assert = require('node:assert/strict');
const { compareVersions, crashFields, streamHeaders, LIVETV_SIGNAL, APP_UA } = require('../src/util');

test('compares versions', () => {
  assert.ok(compareVersions('1.0.1', '1.0.0') > 0);
  assert.equal(compareVersions('1.0', '1.0.0'), 0);
});

test('crash reports carry the Android apps fields', () => {
  const f = crashFields({ app: 'ca.bulkbazaar.cabletv.pc', version: '1.0.0', error: 'x', stack: 's', onStart: true, device: 'PC', os: 'Windows_NT 10' }).fields;
  for (const k of ['app', 'version', 'code', 'device', 'android', 'time', 'error', 'stack', 'onStart']) assert.ok(k in f, k);
});

test('streams get the TV app User-Agent; our website does not', () => {
  assert.equal(streamHeaders('https://cdn.example.com/a.m3u8', 'xhr', {}, {})['User-Agent'], APP_UA);
  assert.equal(streamHeaders('https://tv.bulkbazaar.ca/LiveTV.m3u', 'xhr', { a: 1 }, {})['User-Agent'], undefined);
  const h = streamHeaders('https://cdn.example.com/a.m3u8', 'media', {}, { 'cdn.example.com': { ua: 'UA2', referrer: 'https://r/' } });
  assert.deepEqual([h['User-Agent'], h.Referer], ['UA2', 'https://r/']);
});

test('reads our pages signals', () => {
  assert.equal(LIVETV_SIGNAL('livetv://fallback'), 'fallback');
  assert.equal(LIVETV_SIGNAL('https://x'), null);
});
