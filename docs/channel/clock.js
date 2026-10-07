// The time beside our channel logo (owner, 2026-10-07): small, under the logo in a top corner and
// above it in a bottom one, lined up with its outer edge, sized from the logo so it looks the same
// on a TV, a phone and the Studio preview. Follows the logo (#bug) wherever the page moves it.
(() => {
  const css = document.createElement("style");
  css.textContent = ".bugclock { position: absolute; pointer-events: none; white-space: nowrap; color: rgba(255,255,255,.92);" +
    " font: 700 16px system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; line-height: 1.2; background: rgba(0,0,0,.43);" +
    " text-shadow: 1px 1px 3px rgba(0,0,0,.65); } .bugclock[hidden] { display: none; }";
  document.head.appendChild(css);
  const pad = n => (n < 10 ? "0" : "") + n;
  const now = () => { const d = new Date(), h = d.getHours(); return `${h % 12 || 12}:${pad(d.getMinutes())} ${h < 12 ? "AM" : "PM"}`; };
  let el = null;
  function place() {
    const bug = document.getElementById("bug");
    if (!bug) return;
    if (!el) { el = document.createElement("div"); el.className = "bugclock"; }
    if (el.parentNode !== bug.parentNode) bug.parentNode.insertBefore(el, bug.nextSibling);
    const w = bug.offsetWidth, h = bug.offsetHeight, nw = bug.naturalWidth, nh = bug.naturalHeight;
    const shown = !/\b(hidden|off)\b/.test(bug.className) && w > 0 && h > 0 && nw > 0 && getComputedStyle(bug).display !== "none" && getComputedStyle(bug).visibility !== "hidden";
    el.hidden = !shown;
    if (!shown) return;
    // Where the picture is really drawn inside the box (object-fit: contain).
    const s = Math.min(w / nw, h / nh), dw = nw * s, dh = nh * s;
    const dx = bug.offsetLeft + (w - dw) / 2, dy = bug.offsetTop + (h - dh) / 2;
    const size = dh * 1.45 / 9 * (dw / dh > 1.5 ? 1 : 0.6);  // a square logo gets a smaller clock
    el.textContent = now();
    el.style.fontSize = size + "px";
    el.style.padding = `${size * 0.1}px ${size * 0.31}px`;
    el.style.borderRadius = size * 0.24 + "px";
    const c = bug.className, bottom = /\b(br|bl)\b/.test(c), left = /\b(tl|bl)\b/.test(c);
    const ch = el.offsetHeight, cw = el.offsetWidth, gap = size * 0.28;
    // The lowest fifth of our wide logo pictures is empty (76 of 393 rows): the time tucks up into it.
    const inkBottom = dy + dh * (dw / dh > 1.5 ? 317 / 393 : 1);
    el.style.top = (bottom ? dy - gap - ch : inkBottom + gap) + "px";
    el.style.left = (left ? dx : dx + dw - cw) + "px";
  }
  place();
  setInterval(place, 1000);
  addEventListener("resize", place);
})();
