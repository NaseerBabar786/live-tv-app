/* Promo breaks on our YouTube channels (ytc.html, bollywood.html): every 10 minutes, between two
   videos (never in the middle of one), one of our own Cable TV promos plays in our own video
   player, outside YouTube's, then the channel carries on. The promos are listed in
   media/promos.json and play in turn. Only our own promos here, never paid
   sponsor ads: YouTube's rules don't allow selling ads around its videos. Paid ads run on
   Bazaar TV (channel 1) only.

   promoBreak(muted, done): plays the promo when one is due and calls done() when it ends;
   when none is due, calls done() at once.

   2026-10-07 (owner: "pop-up ads everywhere in the app", Cable TV 1.9.89): inside the Cable TV app the
   app hands the page today's sponsors (window.cabletvAds) and each break opens with one sponsor's ad
   (their video when it's booked as a video pop-up, at most every 30 minutes, otherwise their picture
   for 20 seconds), then our promos while they fit in the break. Always between two videos, in our own
   player, never over YouTube's. On the website (no window.cabletvAds) the breaks stay our promos only.

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
    + ".promo video, .promo .pic { width: 100%; height: 100%; object-fit: contain; }"
    + ".promo .who { position: absolute; left: 3%; bottom: 14%; font: 700 clamp(12px, 1.8vw, 22px) system-ui, sans-serif;"
    + " color: #111; background: #facc15; border-radius: 6px; padding: .3em .7em; }"
    + ".promo .skip { position: absolute; right: 3%; bottom: 14%; pointer-events: auto; font: 700 clamp(13px, 2vw, 24px) system-ui, sans-serif;"
    + " color: #fff; background: rgba(16,24,39,.85); border: 2px solid rgba(255,255,255,.6); border-radius: 8px; padding: .5em 1em; cursor: pointer; }";
  document.head.appendChild(css);

  const SPONSOR_NEXT = "cabletv-sponsor-next", SPONSOR_VIDEO_AT = "cabletv-sponsor-video-at";
  const PICTURE_SECS = 20, VIDEO_EVERY_MS = 30 * 60 * 1000;
  // One sponsor's ad at the start of a break, then the break's promos while they fit in its time (60 s at most).
  function withSponsor(list) {
    const ads = (window.cabletvAds || []).filter(a => a && (a.picture || a.video));
    if (!ads.length) return list;
    const total = Math.min(60, list.reduce((t, p) => t + (p.secs || 30), 0));
    let n = 0, videoAt = 0;
    try { n = Number(localStorage.getItem(SPONSOR_NEXT)) || 0; videoAt = Number(localStorage.getItem(SPONSOR_VIDEO_AT)) || 0; } catch (e) {}
    const a = ads[n % ads.length];
    try { localStorage.setItem(SPONSOR_NEXT, String((n + 1) % ads.length)); } catch (e) {}
    const secs = a.secs > 0 ? Math.min(60, a.secs) : 30;
    let ad = null;
    if (a.popupVideo && a.video && Date.now() - videoAt >= VIDEO_EVERY_MS && secs <= total) {
      ad = { sponsor: a, src: a.video, secs };
      try { localStorage.setItem(SPONSOR_VIDEO_AT, String(Date.now())); } catch (e) {}
    } else if (a.picture && PICTURE_SECS <= total) ad = { sponsor: a, picture: a.picture, secs: PICTURE_SECS };
    if (!ad) return list;
    const out = [ad];
    let used = ad.secs;
    for (const p of list) if (used + (p.secs || 30) <= total) { out.push(p); used += p.secs || 30; }
    return out;
  }

  window.playBreak = (list, offset, muted, done) => {
    let k = 0;
    offset = Math.max(0, offset || 0);
    // Only a break seen from its start gets a sponsor (one joined part-way keeps its own timing).
    if (offset < 1) list = withSponsor(list);
    while (k < list.length && offset >= (list[k].secs || 30)) { offset -= list[k].secs || 30; k++; }
    if (k >= list.length) return done();
    const box = document.createElement("div");
    box.className = "promo";
    const v = document.createElement("video");
    v.autoplay = true;
    v.playsInline = true;
    v.muted = !!muted;
    v.volume = 0.6;
    const pic = document.createElement("img");
    pic.className = "pic";
    pic.hidden = true;
    const who = document.createElement("div");
    who.className = "who";
    who.hidden = true;
    const skip = document.createElement("button");
    skip.className = "skip";
    skip.hidden = true;
    box.append(v, pic, who, skip);
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
      startedAt = Date.now();
      // Skippable 10 seconds after this ad started (counted from its beginning, also when joined part-way).
      skipFrom = startedAt + Math.max(0, 10 - at) * 1000;
      who.hidden = !promo.sponsor;
      who.textContent = promo.sponsor ? "Ad · " + promo.sponsor.name : "";
      // The app counts a sponsor's ad that played, like its own pop-ups.
      if (promo.sponsor) location.href = "livetv://ad?id=" + encodeURIComponent(promo.sponsor.id);
      if (promo.picture) {
        v.pause(); v.removeAttribute("src"); v.load(); v.hidden = true;
        pic.src = promo.picture; pic.hidden = false;
        guard = setTimeout(next, promo.secs * 1000);
        return;
      }
      pic.hidden = true; v.hidden = false;
      v.src = /^https:/.test(promo.src) ? promo.src : "../media/" + promo.src;
      v.onloadedmetadata = () => { if (at > 1 && at < v.duration - 1) v.currentTime = at; };
      // A sponsor's video stops when its booked time is up (a break never runs over its minute).
      guard = setTimeout(next, ((promo.secs || 60) - at + (promo.sponsor ? 0.5 : 20)) * 1000);
      v.play().catch(() => { v.muted = true; v.play().catch(next); });
    }
    // A promo stuck on one frame (a TV's player stalling) moves on after 8 seconds: never a frozen screen.
    let lastT = -1, movedAt = Date.now();
    tick = setInterval(() => {
      if (list[k] && list[k].picture) movedAt = Date.now();
      else if (v.currentTime !== lastT) { lastT = v.currentTime; movedAt = Date.now(); }
      else if (Date.now() - movedAt > 8000 && Date.now() - startedAt > 8000) { movedAt = Date.now(); next(); return; }
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
    v.onerror = () => { if (!list[k] || !list[k].picture) next(); };
    v.onpause = () => { if (!v.ended && !over && !v.hidden) v.play().catch(() => {}); };
    pic.onerror = () => { if (list[k] && list[k].picture) next(); };
    start(offset);
  };

  window.promoBreak = (muted, done) => {
    if (!promos.length || Date.now() - last < EVERY_MS) return done();
    last = Date.now();
    let n = 0;
    try { n = Number(localStorage.getItem(NEXT)) || 0; } catch (e) {}
    const promo = promos[n % promos.length];
    try { localStorage.setItem(KEY, String(last)); localStorage.setItem(NEXT, String((n + 1) % promos.length)); } catch (e) {}
    // Through playBreak, so in the app a sponsor's ad comes first, and the promo can be skipped after 10 s.
    playBreak([promo], 0, muted, done);
  };
})();
