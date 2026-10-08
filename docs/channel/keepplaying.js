/* The owner's rule for every YouTube channel: YouTube's own paused screen (its title, share arrow,
   pause sign, "More videos" and logo) never shows. A TV or browser can pause the video behind the page's
   back (the app's window going out of view, another player taking the sound) and turn down the page's
   playVideo() at that moment, so the video stayed paused with YouTube's buttons on it (the owner's photo:
   Bazaar Sports in 1+List, 2026-10-07). keepPlaying(player, busy, cover): while paused, our cover goes
   over it and play is asked for again every second and whenever the page comes back into view.
   busy() is true while the page means the player to be still (our ad break, our own show). */
window.keepPlaying = (player, busy, cover) => {
  const kick = () => {
    if (busy() || !player || !player.getPlayerState) return;
    if (player.getPlayerState() === YT.PlayerState.PAUSED) { cover(); player.playVideo(); }
  };
  setInterval(kick, 1000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) kick(); });
  window.addEventListener("pageshow", kick);
  window.addEventListener("focus", kick);
};
