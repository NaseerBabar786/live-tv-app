// The time beside our channel logo (owner, 2026-10-07): small and see-through like the logo, a small
// gap under its drawing in a top corner and above it in a bottom one (never on it), lined up with its
// outer edge, sized from the logo so it looks the same on a TV, a phone and the Studio preview.
// Follows the logo (#bug) wherever the page moves it.
(() => {
  const css = document.createElement("style");
  css.textContent = ".bugclock { position: absolute; pointer-events: none; white-space: nowrap; color: #fff; opacity: .55;" +
    " font: 700 16px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1;" +
    " text-shadow: 1px 1px 3px rgba(0,0,0,.5); } .bugclock[hidden] { display: none; }";
  document.head.appendChild(css);
  const pad = n => (n < 10 ? "0" : "") + n;
  const now = () => { const d = new Date(), h = d.getHours(); return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`; };
  // Which rows of each logo picture have something drawn (top, bottom as parts of its height).
  const inks = {};
  function inkOf(img) {
    if (inks[img.src]) return inks[img.src];
    let ink = [0, 1];
    try {
      const c = document.createElement("canvas"), w = c.width = img.naturalWidth, h = c.height = img.naturalHeight;
      const g = c.getContext("2d"); g.drawImage(img, 0, 0);
      const px = g.getImageData(0, 0, w, h).data;
      const solid = y => { for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 40) return true; return false; };
      let top = 0, last = h - 1;
      while (top < h && !solid(top)) top++;
      while (last > top && !solid(last)) last--;
      if (top < h) ink = [top / h, (last + 1) / h];
    } catch (e) { /* a picture from elsewhere can't be read: keep clear of its whole box */ }
    return (inks[img.src] = ink);
  }
  let el = null;
  function place() {
    const bug = document.getElementById("bug");
    if (!bug) return;
    if (!el) { el = document.createElement("div"); el.className = "bugclock"; }
    if (el.parentNode !== bug.parentNode) bug.parentNode.insertBefore(el, bug.nextSibling);
    const w = bug.offsetWidth, h = bug.offsetHeight, nw = bug.naturalWidth, nh = bug.naturalHeight;
    const shown = !/\b(hidden|off)\b/.test(bug.className) && bug.complete && w > 0 && h > 0 && nw > 0 &&
      getComputedStyle(bug).display !== "none" && getComputedStyle(bug).visibility !== "hidden";
    el.hidden = !shown;
    if (!shown) return;
    // Where the picture is really drawn inside the box (object-fit: contain).
    const s = Math.min(w / nw, h / nh), dw = nw * s, dh = nh * s;
    const dx = bug.offsetLeft + (w - dw) / 2, dy = bug.offsetTop + (h - dh) / 2;
    const size = dh * 1.45 / 9 * (dw / dh > 1.5 ? 1 : 0.6);  // a square logo gets a smaller clock
    el.textContent = now();
    el.style.fontSize = size + "px";
    const c = bug.className, bottom = /\b(br|bl)\b/.test(c), left = /\b(tl|bl)\b/.test(c);
    const [inkTop, inkBottom] = inkOf(bug), ch = el.offsetHeight, cw = el.offsetWidth, gap = dh * 0.3 / 9;
    el.style.top = (bottom ? dy + dh * inkTop - gap - ch : dy + dh * inkBottom + gap) + "px";
    el.style.left = (left ? dx : dx + dw - cw) + "px";
  }
  place();
  setInterval(place, 1000);
  addEventListener("resize", place);
})();
