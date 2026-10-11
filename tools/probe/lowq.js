// Which picture quality YouTube picks for each player size, and where its top bar sits.
const { chromium } = require("playwright");
const vid = process.argv[2];
const sizes = [["now-360", 457, 360], ["low-144", 183, 144], ["box-256x256", 256, 256], ["box-256x200", 256, 200],
  ["low-240", 305, 240], ["full", 1920, 1512]];
(async () => {
  const b = await chromium.launch({ args: ["--autoplay-policy=no-user-gesture-required"] });
  for (const [name, w, h] of sizes) {
    const page = await b.newPage({ viewport: { width: Math.max(w, 400), height: Math.max(h, 300) } });
    const t0 = Date.now();
    await page.goto(`http://localhost:8000/tools/probe/lowq.html?v=${vid}&w=${w}&h=${h}`);
    const out = { name, w, h, samples: [] };
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(1000);
      const s = await page.evaluate(() => window.p && p.getPlayerState ? { st: p.getPlayerState(), q: p.getPlaybackQuality(), t: +p.getCurrentTime().toFixed(1), lv: p.getAvailableQualityLevels().join(",") } : null);
      out.samples.push(s && `${i + 1}s st${s.st} ${s.q} t${s.t}`);
      if (i === 0 || i === 19) out.levels = s && s.lv;
      if (s && s.t > 0 && !out.firstFrameS) out.firstFrameS = (Date.now() - t0) / 1000;
    }
    const f = page.frames().find(x => x.url().includes("youtube"));
    if (f) out.chrome = await f.evaluate(() => {
      const r = el => { const e = document.querySelector(el); if (!e) return null; const b = e.getBoundingClientRect(); return `${Math.round(b.top)}..${Math.round(b.bottom)} vis=${getComputedStyle(e).display}/${getComputedStyle(e).opacity}`; };
      const v = document.querySelector("video"); const vb = v && v.getBoundingClientRect();
      return { top: r(".ytp-chrome-top"), title: r(".ytp-title"), small: !!document.querySelector(".ytp-small-mode"),
        video: vb && `${Math.round(vb.left)},${Math.round(vb.top)} ${Math.round(vb.width)}x${Math.round(vb.height)} decoded ${v.videoWidth}x${v.videoHeight}`,
        body: document.body.innerText.slice(0, 120) };
    }).catch(e => String(e));
    await page.screenshot({ path: `probe-${name}.png` });
    console.log(JSON.stringify(out));
    await page.close();
  }
  await b.close();
})();
