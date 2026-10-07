// The PC app says which Cable TV (Android) version it matches; the parity check keeps it current.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('parity.json names the Cable TV version in app/build.gradle.kts', () => {
  const gradle = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'build.gradle.kts'), 'utf8');
  const tv = /create\("livetv"\)[\s\S]*?versionName = "([^"]+)"/.exec(gradle)[1];
  const parity = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parity.json'), 'utf8'));
  assert.equal(parity.matches, tv, `Cable TV is ${tv} but cabletv-pc/parity.json says ${parity.matches}: bring the PC app in step (see cabletv-pc/PARITY.md)`);
});
