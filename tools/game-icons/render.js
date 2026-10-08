// node render.js [ids...]  -> png/<id>.png (512) from svg/<id>.svg, fonts Fredoka/Outfit available
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const dir = __dirname;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 512, height: 512 } });
  let ids = process.argv.slice(2);
  if (!ids.length) ids = fs.readdirSync(path.join(dir, 'svg')).filter(f => f.endsWith('.svg')).map(f => f.slice(0, -4));
  for (const id of ids) {
    const svg = fs.readFileSync(path.join(dir, 'svg', id + '.svg'), 'utf8');
    fs.writeFileSync(path.join(dir,'_r.html'),`<html><head><style>
@font-face{font-family:Fredoka;src:url(Fredoka.woff2);font-weight:300 900}
@font-face{font-family:Outfit;src:url(Outfit.woff2);font-weight:300 900}
html,body{margin:0;background:transparent}svg{display:block;width:512px;height:512px}</style></head><body>${svg}</body></html>`);
    await p.goto('file://'+path.join(dir,'_r.html'));
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(50);
    await p.screenshot({ path: path.join(dir, 'png', id + '.png'), omitBackground: true });
  }
  await b.close();
})();
