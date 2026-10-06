/* Promo breaks on our YouTube channels (ytc.html, bollywood.html): now and then, between two
   videos (never in the middle of one), our own 25-second Cable TV promo plays in our own video
   player, outside YouTube's, then the channel carries on. Only our own promos here, never paid
   sponsor ads: YouTube's rules don't allow selling ads around its videos. Paid ads run on
   Bazaar TV (channel 1) only.

   promoBreak(muted, done): plays the promo when one is due and calls done() when it ends;
   when none is due, calls done() at once. */
(function () {
  const EVERY_MS = 30 * 60 * 1000;   // at most one break every 30 minutes
  const LONGEST_MS = 40 * 1000;      // a promo that stalls never holds the channel up
  const SRC = "../media/livetv-ad.mp4";
  const KEY = "cabletv-promo-at";

  // The first break comes 30 minutes after the channel opens, not on the first video change.
  let last = Date.now();
  try { last = Math.max(last - EVERY_MS / 2, Number(localStorage.getItem(KEY)) || 0); } catch (e) {}

  const css = document.createElement("style");
  css.textContent = ".promo { position: absolute; inset: 0; background: #000; z-index: 5; pointer-events: none; }"
    + ".promo video { width: 100%; height: 100%; object-fit: contain; }";
  document.head.appendChild(css);

  window.promoBreak = (muted, done) => {
    if (Date.now() - last < EVERY_MS) return done();
    last = Date.now();
    try { localStorage.setItem(KEY, String(last)); } catch (e) {}
    const box = document.createElement("div");
    box.className = "promo";
    const v = document.createElement("video");
    v.src = SRC;
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
    const guard = setTimeout(finish, LONGEST_MS);
    v.onended = finish;
    v.onerror = finish;
    // Like the channel itself, it never stays paused.
    v.onpause = () => { if (!v.ended) v.play().catch(() => {}); };
    v.play().catch(() => { v.muted = true; v.play().catch(finish); });
  };
})();
