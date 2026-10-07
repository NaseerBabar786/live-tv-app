/* Promo breaks on our YouTube channels (ytc.html, bollywood.html): every 10 minutes, between two
   videos (never in the middle of one), one of our own Cable TV promos plays in our own video
   player, outside YouTube's, then the channel carries on. The promos are listed in
   media/promos.json and play in turn. Only our own promos here, never paid
   sponsor ads: YouTube's rules don't allow selling ads around its videos. Paid ads run on
   Bazaar TV (channel 1) only.

   promoBreak(muted, done): plays the promo when one is due and calls done() when it ends;
   when none is due, calls done() at once.

   2026-10-07 (owner): an ad break before every programme, part of the channel's running order
   (ytorder.js withBreaks), so it shows in Channel Studio's guide too. playBreak(promos, offset, muted, done)
   plays one break's promos from [offset] seconds in; each can be skipped after 10 seconds (OK, Enter or
   the Skip button), and skipping goes straight to the next ad in the break. */
(function () {
  const EVERY_MS = 10 * 60 * 1000;   // a break every 10 minutes (owner, 2026-10-07), at the next change of video
  const KEY = "cabletv-promo-at", NEXT = "cabletv-promo-next";
  let promos = [];
  fetch("../media/promos.json", { cache: "no-store" }).then(r => r.json())
    .then(d => { promos = (d.promos || []).filter(p => p.src); }).catch(() => {});

  // The first break comes 5 to 10 minutes after the channel opens, never on the first video change.
  let last = Date.now();
  try { last = Math.max(last - EVERY_MS / 2, Number(localStorage.getItem(KEY)) || 0); } catch (e) {}

  const css = document.createElement("style");
  css.textContent = ".promo { position: absolute; inset: 0; background: #000; z-index: 5; pointer-events: none; }"
    + ".promo video { width: 100%; height: 100%; object-fit: contain; }"
    + ".promo .skip { position: absolute; right: 3%; bottom: 14%; pointer-events: auto; font: 700 clamp(13px, 2vw, 24px) system-ui, sans-serif;"
    + " color: #fff; background: rgba(16,24,39,.85); border: 2px solid rgba(255,255,255,.6); border-radius: 8px; padding: .5em 1em; cursor: pointer; }";
  document.head.appendChild(css);

  window.playBreak = (list, offset, muted, done) => {
    let k = 0;
    offset = Math.max(0, offset || 0);
    while (k < list.length && offset >= (list[k].secs || 30)) { offset -= list[k].secs || 30; k++; }
    if (k >= list.length) return done();
    const box = document.createElement("div");
    box.className = "promo";
    const v = document.createElement("video");
    v.autoplay = true;
    v.playsInline = true;
    v.muted = !!muted;
    v.volume = 0.6;
    const skip = document.createElement("button");
    skip.className = "skip";
    skip.hidden = true;
    box.append(v, skip);
    document.body.appendChild(box);
    let guard = null, tick = null, over = false, startedAt = 0, skipFrom = 0;
    const finish = () => {
      if (over) return;
      over = true;
      clearTimeout(guard); clearInterval(tick);
      document.removeEventListener("keydown", onKey, true);
      box.remove();
      done();
    };
    const next = () => { k++; if (k >= list.length) finish(); else start(0); };
    const canSkip = () => Date.now() >= skipFrom;
    function start(at) {
      const promo = list[k];
      clearTimeout(guard);
      v.src = "../media/" + promo.src;
      v.onloadedmetadata = () => { if (at > 1 && at < v.duration - 1) v.currentTime = at; };
      startedAt = Date.now();
      // Skippable 10 seconds after this ad started (counted from its beginning, also when joined part-way).
      skipFrom = startedAt + Math.max(0, 10 - at) * 1000;
      guard = setTimeout(next, ((promo.secs || 60) - at + 20) * 1000);
      v.play().catch(() => { v.muted = true; v.play().catch(next); });
    }
    tick = setInterval(() => {
      const left = Math.ceil((skipFrom - Date.now()) / 1000);
      skip.hidden = false;
      skip.textContent = left > 0 ? `Skip ad in ${left}` : (k < list.length - 1 ? "Skip ad ›" : "Skip ›");
    }, 250);
    skip.onclick = () => { if (canSkip()) next(); };
    function onKey(e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); if (canSkip()) next(); }
    }
    document.addEventListener("keydown", onKey, true);
    v.onended = next;
    v.onerror = next;
    v.onpause = () => { if (!v.ended && !over) v.play().catch(() => {}); };
    start(offset);
  };

  window.promoBreak = (muted, done) => {
    if (!promos.length || Date.now() - last < EVERY_MS) return done();
    last = Date.now();
    let n = 0;
    try { n = Number(localStorage.getItem(NEXT)) || 0; } catch (e) {}
    const promo = promos[n % promos.length];
    try { localStorage.setItem(KEY, String(last)); localStorage.setItem(NEXT, String((n + 1) % promos.length)); } catch (e) {}
    const box = document.createElement("div");
    box.className = "promo";
    const v = document.createElement("video");
    v.src = "../media/" + promo.src;
    v.autoplay = true;
    v.playsInline = true;
    v.muted = !!muted;
    v.volume = 0.6;   // the same loudness as the YouTube videos around it
    box.appendChild(v);
    document.body.appendChild(box);
    let over = false;
    const finish = () => {
      if (over) return;
      over = true;
      clearTimeout(guard);
      box.remove();
      done();
    };
    // A promo that stalls never holds the channel up.
    const guard = setTimeout(finish, ((promo.secs || 60) + 20) * 1000);
    v.onended = finish;
    v.onerror = finish;
    // Like the channel itself, it never stays paused.
    v.onpause = () => { if (!v.ended) v.play().catch(() => {}); };
    v.play().catch(() => { v.muted = true; v.play().catch(finish); });
  };
})();
