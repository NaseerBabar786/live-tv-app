// The "Up next" and "Today on Spark TV" cards over the picture (owner, 2026-10-07): every 10 minutes
// what's coming next, every 20 minutes today's shows first, coming up with the ad breaks. When they
// show comes from cardAt in schedule.js, so the website, Channel Studio and the app agree.
// Same look as MyChannelOverlay.kt in the app.
import { cardAt, upNext, todaysShows, timeText } from "./schedule.js";

const CSS = `
.bt-card { position: absolute; z-index: 6; background: rgba(11,18,32,.92); color: #fff; border-radius: .6em; padding: .7em 1em;
  font-family: inherit; font-size: clamp(9px, 1.6vw, 20px); font-size: max(7px, 1.8cqw); line-height: 1.3; pointer-events: none;
  box-shadow: 0 .3em 1.2em rgba(0,0,0,.45); opacity: 0; transition: opacity .5s, transform .5s; }
.bt-card.show { opacity: 1; transform: none !important; }
.bt-card .h { color: #FACC15; font-weight: 800; letter-spacing: .08em; font-size: .8em; margin-bottom: .25em; }
.bt-card .t { font-weight: 800; font-size: 1.15em; max-width: 22em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bt-card .s { opacity: .8; font-size: .85em; margin-top: .15em; }
.bt-next { bottom: 12%; left: 2.5%; transform: translateX(-30%); }
.bt-next.right { left: auto; right: 2.5%; transform: translateX(30%); }
.bt-today { top: 50%; left: 2.5%; transform: translate(-30%, -50%); min-width: 18em; max-width: 34em; }
.bt-today.show { transform: translateY(-50%) !important; }
.bt-today.right { left: auto; right: 2.5%; transform: translate(30%, -50%); }
.bt-today .row { display: flex; gap: .8em; padding: .2em 0; font-size: .95em; }
.bt-today .row .w { width: 5.2em; white-space: nowrap; flex: none; opacity: .75; font-variant-numeric: tabular-nums; }
.bt-today .row > div:last-child { flex: 1; min-width: 0; }
.bt-today .row .m { font-size: .8em; opacity: .7; font-weight: 400; color: #fff; }
.bt-today .row .n { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 18em; }
.bt-today .row.on .w { color: #4ADE80; opacity: 1; font-weight: 700; }
.bt-today .row.hi .w, .bt-today .row.hi .n { color: #FACC15; opacity: 1; font-weight: 700; }
`;

function whenText(at, now) {
  const min = Math.max(1, Math.round((at - now) / 60000));
  return min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + " min" : ""}`.trim();
}

/** Shows the cards in [stage]; [config]() gives the schedule now (or null while there's none). */
export function mountCards(stage, config) {
  if (!document.getElementById("bt-card-css")) {
    const st = document.createElement("style");
    st.id = "bt-card-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }
  // Sizes follow the picture's width, like the app's overlay.
  if (getComputedStyle(stage).containerType === "normal") stage.style.containerType = "inline-size";
  const next = document.createElement("div"), today = document.createElement("div");
  next.className = "bt-card bt-next"; today.className = "bt-card bt-today";
  stage.append(next, today);
  let shownKey = "";
  const tick = () => {
    const c = config();
    const now = Date.now();
    const card = c && c.active !== false ? cardAt(c, now) : null;
    // Our logo's corner decides the side: the cards never cover it.
    const corner = c?.logoCorner || "tr";
    today.classList.toggle("right", corner === "tl" || corner === "bl");
    next.classList.toggle("right", corner === "bl");
    const key = card ? `${card.today}|${card.until}` : "";
    if (key !== shownKey) {
      shownKey = key;
      if (card) fill(card.today ? today : next, card.today, c, now);
    }
    today.classList.toggle("show", !!card?.today);
    next.classList.toggle("show", !!card && !card.today);
  };
  tick();
  return setInterval(tick, 1000);
}

function fill(el, isToday, c, now) {
  // Times in the viewer's own time, like the clock beside the logo and the app's cards.
  el.innerHTML = "";
  const add = (cls, text, parent = el) => { const d = document.createElement("div"); d.className = cls; d.textContent = text; parent.appendChild(d); return d; };
  if (isToday) {
    const list = todaysShows(c, now);
    if (!list.length) { el.classList.remove("show"); return; }
    add("h", `TODAY ON ${(c.name || "Spark TV One").toUpperCase()}`);
    let hi = false;
    for (const s of list) {
      const row = add("row", "");
      const on = s.at <= now;
      if (on) row.classList.add("on");
      else if (!hi) { row.classList.add("hi"); hi = true; }
      add("w", on ? "NOW" : timeText(s.at), row);
      const n = add("n", s.title, add("", "", row));
      if (s.more) add("m", `+${s.more} more today`, n.parentNode);
    }
  } else {
    const list = upNext(c, now, 2);
    if (!list.length) return;
    add("h", "UP NEXT");
    add("t", list[0].title);
    add("s", `${timeText(list[0].at)} · ${whenText(list[0].at, now)}`);
    if (list[1]) add("s", `Later: ${timeText(list[1].at)}  ${list[1].title}`);
  }
}
