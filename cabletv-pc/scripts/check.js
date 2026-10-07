// Syntax check of every script, so a typo fails the build instead of the viewer's start.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const files = [];
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) { if (f.name !== 'vendor') walk(p); } else if (f.name.endsWith('.js')) files.push(p);
  }
})(path.join(__dirname, '..', 'src'));
for (const f of files) execFileSync(process.execPath, ['--check', f], { stdio: 'inherit' });
console.log(`Checked ${files.length} scripts.`);
