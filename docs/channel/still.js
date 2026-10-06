// On TVs the Cable TV app's small picture can't show YouTube's video (only its sound comes through), so
// there the page shows the playing video's own picture instead (?still=1, Cable TV 1.9.60). Full screen
// plays the video as normal.
(function () {
  window.stillFor = () => {};
  if (!new URLSearchParams(location.search).has("still")) return;
  const img = document.createElement("img");
  img.alt = "";
  img.style.cssText = "position:absolute;left:0;top:0;width:100%;height:calc(100% - var(--strip, 0px));" +
    "object-fit:cover;background:#000;pointer-events:none";
  document.getElementById("player").after(img);
  window.stillFor = player => {
    let shown = null;
    setInterval(() => {
      const id = player && player.getVideoData && player.getVideoData().video_id;
      if (id && id !== shown) { shown = id; img.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`; }
    }, 1000);
  };
})();
