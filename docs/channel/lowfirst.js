/* Owner's rule for every one of our channels (2026-10-09, sharpened 2026-10-11): the picture always starts
   at the very lowest quality, so a channel plays at once and quick channel changes never wait; only when
   the viewer stays on the channel and it plays smoothly does it step up, one step at a time, as far as the
   connection allows.
   YouTube's player has no quality setting any more: it picks the quality from the size of the picture and
   the connection. So the player is made small (the picture STEPS[0] css px wide, about 144p) and stretched
   to its place on the screen. After 8 smooth seconds it grows to the middle step (about 360p), after 10 more
   to its real size, where YouTube goes as high as the connection allows. If it stalls for 3 seconds it goes
   one step down and tries again after 20 smooth seconds.
   The small player is taller than its picture (BAND css px above and below), so YouTube draws its own bars
   there, above and below the box we show (the pages' --box rule): only the picture and our own things show.
   That also keeps the player at YouTube's 200 x 200 smallest size. Small players on TVs (?still=1) show
   only a picture over the video (still.js), so theirs stays at the lowest step: their sound is all that
   comes through, and the bandwidth goes to the big player. lowFirst(player) is called by the page. */
(function () {
  const still = new URLSearchParams(location.search).has("still");
  const STEPS = still ? [200] : [200, 640, 0];   // picture width in css px; 0 = the player's real size
  const WAIT = [8, 10];                          // smooth seconds before each step up
  const BAND = 60;
  const root = document.documentElement;
  const css = document.createElement("style");
  css.textContent = "html.lowq #player { left: var(--lq-l) !important; top: var(--lq-t) !important; right: auto !important; " +
    "bottom: auto !important; width: var(--lq-w) !important; height: var(--lq-h) !important; " +
    "box-sizing: border-box !important; transform-origin: 0 0 !important; transform: scale(var(--lq-s)) !important; }";
  document.head.appendChild(css);

  let step = 0;
  /** Puts the player at step i: its picture STEPS[i] px wide, stretched over exactly the place it had. */
  function place(i) {
    step = i;
    root.classList.remove("lowq");
    const w = STEPS[i], el = document.getElementById("player");
    if (!w || !el) return;
    const r = el.getBoundingClientRect();
    const vh = Math.min(r.height, r.width * 9 / 16), vw = vh * 16 / 9;
    if (vw <= w * 1.15) return;                  // already that small on the screen
    const s = vw / w, set = (k, v) => root.style.setProperty(k, `${v}px`);
    set("--lq-l", 0); set("--lq-t", 0); set("--lq-w", w); set("--lq-h", w * 9 / 16 + 2 * BAND);
    root.style.setProperty("--lq-s", `${s}`);
    root.classList.add("lowq");
    // The picture lands exactly where it was, whatever box the player is placed in.
    const at = el.getBoundingClientRect();
    set("--lq-l", r.left + (r.width - vw) / 2 - at.left);
    set("--lq-t", r.top + (r.height - vh) / 2 - BAND * s - at.top);
  }
  window.addEventListener("resize", () => place(step));

  window.lowFirst = player => {
    place(0);
    let smooth = 0, stalled = 0, lastT = -1, need = WAIT[0];
    setInterval(() => {
      if (!player || !player.getPlayerState) return;
      const state = player.getPlayerState(), t = player.getCurrentTime ? player.getCurrentTime() : 0;
      const moving = state === YT.PlayerState.PLAYING && t !== lastT;
      lastT = t;
      smooth = moving ? smooth + 1 : 0;
      stalled = state === YT.PlayerState.BUFFERING ? stalled + 1 : 0;
      if (step < STEPS.length - 1 && smooth >= need) {
        place(step + 1); smooth = 0; need = WAIT[step] || WAIT[WAIT.length - 1];
      } else if (step > 0 && stalled >= 3) {
        place(step - 1); stalled = 0; smooth = 0; need = 20;
      }
    }, 1000);
  };
})();
