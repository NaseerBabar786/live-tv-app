// The PC app says which Cable TV (Android) version it matches; the parity check keeps it current.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// The owner put the PC app on hold (2026-10-08): while .github/platforms.json marks it "paused", Cable TV
// changes no longer have to reach the PC, as in tools/parity_check.py, so these two checks wait too.
const platforms = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '.github', 'platforms.json'), 'utf8'));
const paused = platforms.platforms.find((p) => p.folder === 'cabletv-pc/')?.paused;
const opts = paused ? { skip: `PC app on hold: ${paused}` } : {};

test('parity.json names the Cable TV version in app/build.gradle.kts', opts, () => {
  const gradle = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'build.gradle.kts'), 'utf8');
  const tv = /create\("livetv"\)[\s\S]*?versionName = "([^"]+)"/.exec(gradle)[1];
  const parity = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'parity.json'), 'utf8'));
  assert.equal(parity.matches, tv, `Cable TV is ${tv} but cabletv-pc/parity.json says ${parity.matches}: bring the PC app in step (see cabletv-pc/PARITY.md)`);
});

test('the PC Games screen has the same modern games as the TV app (WEB_GAMES in Game.kt)', opts, async () => {
  const kt = fs.readFileSync(path.join(__dirname, '..', '..', 'app', 'src', 'main', 'java', 'com', 'livetv', 'app', 'games', 'Game.kt'), 'utf8');
  const tv = [...kt.matchAll(/WebGameInfo\("([^"]+)", "([^"]+)", "[^"]+", "([^"]+)"\)/g)].map((m) => [m[1], m[2], m[3]]);
  const { GAMES } = await import('../src/ui/screens/games.js');
  assert.deepEqual(GAMES.map((g) => [g.id, g.name, g.page]), tv);
});
