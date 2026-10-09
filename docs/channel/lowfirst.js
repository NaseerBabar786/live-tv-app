/* Owner's rule for every one of our channels (2026-10-09): the picture starts at a low quality, so it plays
   at once (full screen, Browse, every multi-screen mode), and steps up as the connection allows.
   YouTube's player has no quality setting any more: it picks the quality from the player's size and the
   connection. So the player starts small (LOW_H tall) and is stretched to its place on the screen; after
   5 seconds of smooth playing it gets its real size back and YouTube steps the quality up as far as the
   connection allows. If it then stalls for 3 seconds, it goes small again and tries once more after
   20 smooth seconds. Small players on TVs (?still=1) show only a picture over the video (still.js), so
   theirs stays small: its sound is all that comes through, and the bandwidth goes to the big player.
   LOW_H 360 keeps YouTube's top bar inside the band above the screen (the pages' --box rule), so only our
   own things show while the picture is small. lowFirst(player) is called by the page with its player. */
(function () {
  const still = new URLSearchParams(location.search).has("still");
  const LOW_H = still ? 144 : 360;
  const root = document.documentElement;
  const css = document.createElement("style");
  css.textContent = "html.lowq #player { left: var(--lq-l) !important; top: var(--lq-t) !important; right: auto !important; " +
    "bottom: auto !important; width: var(--lq-w) !important; height: var(--lq-h) !important; " +
    "box-sizing: border-box !important; transform-origin: 0 0 !important; transform: scale(var(--lq-s)) !important; }";
  document.head.appendChild(css);

  let low = false;
  /** Shrinks the player, keeping it where it is on the screen. Not when it's small already. */
  function goLow() {
    const el = document.getElementById("player");
    if (!el) return false;
    root.classList.remove("lowq");
    const r = el.getBoundingClientRect();
    if (r.height <= LOW_H * 1.15 || r.width <= 0) { low = false; return false; }
    const s = r.height / LOW_H, set = (k, v) => root.style.setProperty(k, `${v}px`);
    set("--lq-l", 0); set("--lq-t", 0); set("--lq-w", r.width / s); set("--lq-h", LOW_H);
    root.style.setProperty("--lq-s", `${s}`);
    root.classList.add("lowq");
    // Moved to exactly where it was, whatever box it's placed in.
    const at = el.getBoundingClientRect();
    set("--lq-l", r.left - at.left); set("--lq-t", r.top - at.top);
    return (low = true);
  }
  function goFull() { root.classList.remove("lowq"); low = false; }
  window.addEventListener("resize", () => { if (low) goLow(); });

  window.lowFirst = player => {
    goLow();
    let smooth = 0, stalled = 0, lastT = -1, need = 5;
    setInterval(() => {
      if (!player || !player.getPlayerState) return;
      const state = player.getPlayerState(), t = player.getCurrentTime ? player.getCurrentTime() : 0;
      const moving = state === YT.PlayerState.PLAYING && t !== lastT;
      lastT = t;
      smooth = moving ? smooth + 1 : 0;
      if (low) {
        if (!still && smooth >= need) { goFull(); stalled = 0; }
        return;
      }
      stalled = state === YT.PlayerState.BUFFERING ? stalled + 1 : 0;
      if (stalled >= 3 && goLow()) { smooth = 0; need = 20; }
    }, 1000);
  };
})();
