// The "Up next" card over the picture (owner, 2026-10-07): every 10 minutes what's coming next, every
// 20 minutes the rest of today's shows with it. Big in the middle of our own "next programme" slate,
// so it never covers a sponsor's ad; small and low on the picture when there's no slate.
// When it shows comes from cardAt in schedule.js, so the website, Channel Studio and the app agree.
// Same look as ScheduleCard in MyChannelOverlay.kt.
import { cardAt, upNext, laterShows, sameDay, timeText } from "./schedule.js";

const CSS = `
.bt-card { position: absolute; z-index: 6; background: rgba(11,18,32,.94); color: #fff; border-radius: .6em; padding: .8em 1.1em;
  font-family: inherit; font-size: clamp(8px, 1.3vw, 18px); font-size: max(6px, 1.25cqw); line-height: 1.3; pointer-events: none;
  box-shadow: 0 .3em 1.2em rgba(0,0,0,.45); opacity: 0; transition: opacity .5s, transform .5s; max-width: 44%; }
.bt-card.big { font-size: max(8px, 2cqw); left: 50%; top: 50%; transform: translate(-50%, -50%) scale(.96); max-width: 64%; min-width: 30%; }
.bt-card.big.show { transform: translate(-50%, -50%); }
.bt-card.small { bottom: 11%; left: 2.5%; transform: translateY(.5em); }
.bt-card.small.right { left: auto; right: 2.5%; }
.bt-card.small.show { transform: none; }
.bt-card.show { opacity: 1; }
.bt-card .h { color: #FACC15; font-weight: 800; letter-spacing: .08em; font-size: .8em; }
.bt-card .t { font-weight: 800; font-size: 1.5em; margin-top: .15em; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.bt-card .s { opacity: .8; font-size: .95em; margin-top: .1em; }
.bt-card .h2 { color: #FACC15; font-weight: 800; letter-spacing: .08em; font-size: .75em; margin: .9em 0 .25em; }
.bt-card .row { display: flex; gap: .8em; padding: .12em 0; font-size: .9em; }
.bt-card .row .w { width: 5.4em; flex: none; opacity: .75; font-weight: 700; white-space: nowrap; font-variant-numeric: tabular-nums; }
.bt-card .row .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
`;

function whenText(at, now) {
  const min = Math.floor((at - now) / 60000);
  return `${timeText(at)} · ` + (min < 1 ? "starting now" : min < 60 ? `in ${min} min` : `in ${Math.floor(min / 60)} h ${min % 60 ? (min % 60) + " min" : ""}`.trim());
}

/** Shows the card in [stage]; [config]() gives the schedule now (or null while there's none). */
export function mountCards(stage, config) {
  if (!document.getElementById("bt-card-css")) {
    const st = document.createElement("style");
    st.id = "bt-card-css"; st.textContent = CSS;
    document.head.appendChild(st);
  }
  // Sizes follow the picture's width, like the app's overlay.
  if (getComputedStyle(stage).containerType === "normal") stage.style.containerType = "inline-size";
  const el = document.createElement("div");
  el.className = "bt-card big";
  stage.append(el);
  let shownKey = "";
  const tick = () => {
    const c = config();
    const now = Date.now();
    const card = c && c.active !== false ? cardAt(c, now) : null;
    const key = card ? `${card.until}` : "";
    if (key !== shownKey) {
      shownKey = key;
      // A card keeps what it showed while it fades out.
      if (card && !fill(el, card, c, now)) shownKey = "";
    }
    el.classList.toggle("show", !!card && !!shownKey);
  };
  tick();
  return setInterval(tick, 1000);
}

/** Fills the card; false when there's nothing coming up. */
function fill(el, card, c, now) {
  const next = upNext(c, now, 1)[0];
  if (!next) return false;
  // Our logo's corner decides the side of the small card: it never covers the logo.
  el.className = "bt-card " + (card.onSlate ? "big" : "small" + (c.logoCorner === "bl" ? " right" : ""));
  el.innerHTML = "";
  const add = (cls, text, parent = el) => { const d = document.createElement("div"); d.className = cls; d.textContent = text; parent.appendChild(d); return d; };
  add("h", `UP NEXT ON ${(c.name || "Bazaar TV").toUpperCase()}`);
  add("t", next.title);
  add("s", whenText(next.at, now));
  if (card.today) {
    const later = laterShows(c, now, next.title, card.onSlate ? 4 : 2);
    if (later.length) {
      add("h2", later.every(u => sameDay(c, now, u.at)) ? "LATER TODAY" : "COMING UP");
      for (const u of later) {
        const row = add("row", "");
        add("w", timeText(u.at), row);
        add("n", u.title + (u.more ? `  (+${u.more} more)` : ""), row);
      }
    }
  }
  return true;
}
