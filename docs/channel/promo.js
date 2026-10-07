/* Promo breaks on our YouTube channels (ytc.html, bollywood.html): every 10 minutes, between two
   videos (never in the middle of one), one of our own Cable TV promos plays in our own video
   player, outside YouTube's, then the channel carries on. The promos are listed in
   media/promos.json and play in turn. Only our own promos here, never paid
   sponsor ads: YouTube's rules don't allow selling ads around its videos. Paid ads run on
   Bazaar TV (channel 1) only.

   promoBreak(muted, done): plays the promo when one is due and calls done() when it ends;
   when none is due, calls done() at once. */
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
    + ".promo video { width: 100%; height: 100%; object-fit: contain; }";
  document.head.appendChild(css);

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
