// Copies into src/ui what the PC app shares with the rest of Cable TV, before every start and build:
// our channels' schedule rules, cards and logo clock from the website (docs/channel, the same rules as the TV
// app's MyChannel.kt), and the stream players from node_modules. Nothing copied is edited by hand:
// change docs/channel/*.js and the PC app follows on its next build.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const ui = path.join(root, 'src', 'ui');
const copies = [
  ['../docs/channel/schedule.js', 'shared/schedule.js'],
  ['../docs/channel/cards.js', 'shared/cards.js'],
  ['../docs/channel/clock.js', 'shared/clock.js'],
  ['node_modules/hls.js/dist/hls.min.js', 'vendor/hls.min.js'],
  ['node_modules/mpegts.js/dist/mpegts.js', 'vendor/mpegts.js'],
];
for (const [from, to] of copies) {
  const src = path.join(root, from);
  const dest = path.join(ui, to);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}
// The modern games: the same pages as the TV app's (app/src/main/assets/games).
const games = path.join(root, '..', 'app', 'src', 'main', 'assets', 'games');
fs.mkdirSync(path.join(ui, 'shared', 'games'), { recursive: true });
for (const f of fs.readdirSync(games)) fs.copyFileSync(path.join(games, f), path.join(ui, 'shared', 'games', f));
// Which Cable TV (Android) version this PC app is in step with, for Settings > About.
const gradle = fs.readFileSync(path.join(root, '..', 'app', 'build.gradle.kts'), 'utf8');
const tv = /create\("livetv"\)[\s\S]*?versionName = "([^"]+)"/.exec(gradle);
const parity = JSON.parse(fs.readFileSync(path.join(root, 'parity.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
fs.writeFileSync(path.join(ui, 'shared', 'build.js'),
  `// Made by scripts/prepare.js (not saved in git).\nexport const BUILD = ${JSON.stringify({
    version: pkg.version, tvVersion: tv ? tv[1] : '', matches: parity.matches,
    // The TV sign-in client secret, from the TV_CLIENT_SECRET repository secret in CI (as in the TV app's build).
    tvClientSecret: process.env.TV_CLIENT_SECRET || '',
  })};\n`);
console.log(`Prepared src/ui (PC ${pkg.version}, in step with Cable TV ${parity.matches}; TV app now ${tv ? tv[1] : '?'})`);
