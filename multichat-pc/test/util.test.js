const test = require('node:test');
const assert = require('node:assert');
const u = require('../src/util');

test('reads the unread count from the WhatsApp Web title', () => {
  assert.strictEqual(u.unreadFromTitle('(3) WhatsApp'), 3);
  assert.strictEqual(u.unreadFromTitle('(120) WhatsApp'), 120);
  assert.strictEqual(u.unreadFromTitle('WhatsApp'), 0);
  assert.strictEqual(u.unreadFromTitle(''), 0);
  assert.strictEqual(u.unreadFromTitle(null), 0);
});

test('quiet hours, including ranges past midnight', () => {
  const at = (h, m) => new Date(2026, 0, 1, h, m);
  const night = { on: true, from: '22:00', to: '07:00' };
  assert.ok(u.inQuietHours(night, at(23, 30)));
  assert.ok(u.inQuietHours(night, at(3, 0)));
  assert.ok(!u.inQuietHours(night, at(7, 0)));
  assert.ok(!u.inQuietHours(night, at(12, 0)));
  const lunch = { on: true, from: '12:00', to: '13:00' };
  assert.ok(u.inQuietHours(lunch, at(12, 30)));
  assert.ok(!u.inQuietHours(lunch, at(13, 0)));
  assert.ok(!u.inQuietHours({ ...night, on: false }, at(23, 30)));
  assert.ok(u.inQuietHours({ on: true, from: '09:00', to: '09:00' }, at(15, 0)));
  assert.ok(!u.inQuietHours({ on: true, from: 'x', to: '07:00' }, at(3, 0)));
});

test('versions and initials', () => {
  assert.strictEqual(u.compareVersions('1.10.0', '1.9.9'), 1);
  assert.strictEqual(u.compareVersions('1.0', '1.0.0'), 0);
  assert.strictEqual(u.compareVersions('1.0.0', '1.0.1'), -1);
  assert.strictEqual(u.versionFromTitle('Multi Chat for PC 1.2.3'), '1.2.3');
  assert.strictEqual(u.versionFromTitle('Multi Chat'), null);
  assert.strictEqual(u.initials('Bulk Bazaar'), 'BB');
  assert.strictEqual(u.initials('personal'), 'P');
  assert.strictEqual(u.initials('  '), '?');
});
