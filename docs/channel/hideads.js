/* YouTube's own ads inside a video come with its "Skip" button. On our Cable TV channels our cover
   hides them and their sound is off until the programme is back (owner, 2026-10-10; not on Spark One,
   which plays no YouTube). An ad shows as a different video id, or as a much shorter length than the
   programme's. Same as the check in block.html.

   hideYouTubeAds(player, expected, cover, soundOn): expected() gives { id, secs } of what should be
   playing (null during our own breaks), cover(on) our page's cover, soundOn() whether the page has sound. */
window.hideYouTubeAds = (player, expected, cover, soundOn) => {
  let on = false;
  const longest = {};
  setInterval(() => {
    try {
      const e = expected();
      if (!e || !player.getPlayerState) return;
      const playing = player.getPlayerState() === YT.PlayerState.PLAYING;
      const vid = player.getVideoData?.()?.video_id, d = player.getDuration?.() || 0;
      const want = e.secs || longest[e.id] || 0;
      const ad = playing && ((vid && vid !== e.id) || (d > 0 && d <= 180 && want >= 120 && d < want / 2));
      if (ad) {
        if (!on) { on = true; player.mute(); }
        cover(true);  // again every half second, so the page's own "playing" never takes it off
      } else {
        if (playing && vid === e.id) longest[e.id] = Math.max(longest[e.id] || 0, d);
        if (on) { on = false; if (soundOn()) player.unMute(); if (playing) cover(false); }
      }
    } catch (err) {}
  }, 500);
};
