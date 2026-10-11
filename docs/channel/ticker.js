/* Every channel's ticker (owner, 2026-10-11): "Test transmission" shows behind the moving words, and the
   "advertise with us" words (the WhatsApp number, tv.bulkbazaar.ca/advertise) are left out; the rest of
   the line keeps running. Works on any page with a .ticker strip, whatever sets its words and when. */
(function () {
  const AD = /advertis|اشتہار|602\s*6500|\/advertise/i;
  function clean(s) {
    const out = [];
    let dropped = false;
    for (const p of String(s || "").split(/\s*·\s*/)) {
      const t = p.trim();
      if (!t) continue;
      // A bare web address right after the advertise words was part of them.
      if (AD.test(t) || (dropped && /^(tv\.)?bulkbazaar\.ca\/?$/i.test(t))) { dropped = true; continue; }
      dropped = false;
      out.push(t);
    }
    return out.join(" · ");
  }
  window.cleanTicker = clean;

  const css = document.createElement("style");
  css.textContent =
    ".ticker::before { content: 'TEST TRANSMISSION  ·  ٹیسٹ ٹرانسمیشن'; position: absolute; inset: 0; display: flex;" +
    " align-items: center; justify-content: center; font-weight: 900; letter-spacing: .3em; color: #fff; opacity: .22;" +
    " white-space: nowrap; pointer-events: none; z-index: 0; }" +
    ".ticker > span { position: relative; z-index: 1; }" +
    // Inside the app's screens the page's line is hidden (keepplaying.js, &noticker=1): the words behind it go too.
    (new URLSearchParams(location.search).has("noticker") ? ".ticker::before { content: none !important; }" : "");
  document.head.appendChild(css);

  function fix(el) {
    const now = el.textContent, c = clean(now);
    if (c !== now.trim()) el.textContent = c;
  }
  function watch() {
    document.querySelectorAll(".ticker > span").forEach(function (el) {
      fix(el);
      new MutationObserver(function () { fix(el); }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch); else watch();
})();
