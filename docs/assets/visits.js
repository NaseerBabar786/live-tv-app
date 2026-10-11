// Anonymous website visit counting for the owner's Stats page.
// Each browser gets a random anonymous Firebase account (no name or email) and writes one
// record per day: webVisits/{day}_{uid} with page views, time spent on each page and part of a page,
// links clicked, where the visit came from (the site it came from, not the person), the hour of day,
// the time zone, and watch time per channel and programme.
// Nothing here identifies a person; only the owner's account can read the records.
(() => {
  const KEY = "AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE";
  const DOCS = "projects/live-tv-b2164/databases/(default)/documents";
  const STORE = "lt_anon";
  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const slug = (s, n = 40) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, n);
  // The page's path without .html or index: "/" is home, "/spark/advertise.html" is spark-advertise.
  const page = location.pathname.replace(/\.html$/, "").replace(/\/index$/, "").split("/").filter(Boolean)
    .map(p => p.replace(/[^a-z0-9-]/gi, "")).filter(Boolean).join("-").slice(0, 40) || "home";
  const dev = /Android TV|GoogleTV|AFT|SmartTV|Tizen|Web0S/i.test(navigator.userAgent) ? "TV"
    : /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Phone" : "Computer";
  let tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}

  let saved = null, first = "";
  try {
    if (localStorage.getItem("lt_admin") === "1") return; // The owner's own visits aren't counted.
    saved = JSON.parse(localStorage.getItem(STORE) || "null");
    first = localStorage.getItem("lt_first") || "";
    if (!first) localStorage.setItem("lt_first", first = today());
  } catch { return; } // No storage: don't count.
  let token = null, tokenUntil = 0, broken = false;

  async function auth() {
    if (token && Date.now() < tokenUntil) return token;
    let r;
    if (saved?.refresh) {
      r = await fetch(`https://securetoken.googleapis.com/v1/token?key=${KEY}`, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(saved.refresh) });
      if (r.ok) {
        const j = await r.json();
        saved = { uid: j.user_id, refresh: j.refresh_token };
        token = j.id_token; tokenUntil = Date.now() + (Number(j.expires_in) - 120) * 1000;
        localStorage.setItem(STORE, JSON.stringify(saved));
        return token;
      }
    }
    r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ returnSecureToken: true }) });
    if (!r.ok) { broken = true; throw new Error("anonymous sign-in is off"); }
    const j = await r.json();
    saved = { uid: j.localId, refresh: j.refreshToken };
    token = j.idToken; tokenUntil = Date.now() + (Number(j.expiresIn) - 120) * 1000;
    localStorage.setItem(STORE, JSON.stringify(saved));
    return token;
  }

  // Where the visit came from: the other site's name only ("google.com", "WhatsApp"), never the full address.
  function source() {
    const ref = document.referrer || "";
    if (!ref) return "";
    let host = "";
    try {
      const u = new URL(ref);
      if (u.protocol === "android-app:") host = u.hostname; // e.g. com.whatsapp
      else if (u.host === location.host) return "";
      else host = u.hostname.replace(/^(www|m|l|lm|mobile)\./, "");
    } catch { return ""; }
    if (/whatsapp/.test(host)) return "WhatsApp";
    if (/facebook|fb\.com|messenger/.test(host)) return "Facebook";
    if (/instagram/.test(host)) return "Instagram";
    if (/youtube|youtu\.be/.test(host)) return "YouTube";
    if (/(^|\.)t\.co$|twitter|x\.com/.test(host)) return "X (Twitter)";
    if (/google/.test(host)) return "Google";
    if (/bing/.test(host)) return "Bing";
    return host.slice(0, 40);
  }

  // Waiting to be sent. chans: { id: { n, c, s } }, shows: { key: { n: programme, ch: channel, s } },
  // parts: { key: { n: label, s } }, clicks: { key: { n: label, k } }.
  let pending = {}, pendingQuad = 0, pendingViews = 1, pendingTime = 0, shows = {}, parts = {}, clicks = {};
  let from = source();
  const hour = new Date().getHours();
  const q = s => "`" + s.replace(/[`\\]/g, "") + "`";
  const str = v => ({ stringValue: String(v) });
  const inc = (fieldPath, n) => ({ fieldPath, increment: { integerValue: String(n) } });

  async function flush(keepalive) {
    if (broken) return;
    const views = pendingViews, chans = pending, quad = pendingQuad, time = pendingTime, sh = shows, pa = parts, cl = clicks, src = from;
    if (!views && !quad && !time && ![chans, sh, pa, cl].some(m => Object.keys(m).length)) return;
    pendingViews = 0; pending = {}; pendingQuad = 0; pendingTime = 0; shows = {}; parts = {}; clicks = {}; from = "";
    try {
      const t = await auth();
      const day = today();
      const fields = { uid: str(saved.uid), day: str(day), dev: str(dev), first: str(first),
        channels: { mapValue: { fields: {} } }, shows: { mapValue: { fields: {} } },
        parts: { mapValue: { fields: {} } }, clicks: { mapValue: { fields: {} } } };
      const mask = ["uid", "day", "dev", "first"], transforms = [];
      if (tz) { fields.tz = str(tz.slice(0, 40)); mask.push("tz"); }
      if (views) transforms.push(inc(`pages.${q(page)}`, views), inc("views", views), inc(`hrs.${q(String(hour))}`, views));
      if (src) transforms.push(inc(`from.${q(src)}`, 1));
      if (time) transforms.push(inc(`time.${q(page)}`, time), inc("secs", time));
      // Named entries: their label is set, their count goes up.
      const named = (map, key, entries, labels, count) => {
        for (const [id, e] of Object.entries(entries)) {
          const f = {};
          for (const l of labels) { f[l] = str(e[l]); mask.push(`${map}.${q(id)}.${l}`); }
          fields[map].mapValue.fields[id] = { mapValue: { fields: f } };
          transforms.push(inc(`${map}.${q(id)}.${key}`, e[key]));
          count && count(e);
        }
      };
      let watch = 0;
      named("channels", "s", chans, ["n", "c"], e => { watch += e.s; });
      named("shows", "s", sh, ["n", "ch"]);
      named("parts", "s", pa, ["n"]);
      named("clicks", "k", cl, ["n"]);
      if (watch) transforms.push(inc("watch", watch));
      if (quad) transforms.push(inc("quad", quad));
      const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:commit`, {
        method: "POST", keepalive: !!keepalive,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ writes: [{
          update: { name: `${DOCS}/webVisits/${day}_${saved.uid}`, fields },
          updateMask: { fieldPaths: mask }, updateTransforms: transforms }] }) });
      if (r.status === 403) broken = true; // The Firestore rule isn't pasted yet.
    } catch {}
  }

  // Called by the watch pages every few seconds while a channel is playing; show = the programme's title, if known.
  let lastActive = Date.now();
  window.ltWatch = (ch, seconds, inQuad, show) => {
    if (!ch || !ch.id) return;
    lastActive = Date.now();
    const id = String(ch.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    const e = pending[id] || (pending[id] = { n: String(ch.name || "?").slice(0, 80), c: String(ch.group || "").slice(0, 40), s: 0 });
    e.s += seconds;
    if (inQuad) pendingQuad += seconds;
    if (show) {
      const k = slug(id + "-" + show, 60);
      const p = shows[k] || (shows[k] = { n: String(show).slice(0, 100), ch: String(ch.name || "").slice(0, 60), s: 0 });
      p.s += seconds;
    }
  };

  // Time on the page: counted every 5 seconds while the page is on screen and the visitor did something
  // in the last 3 minutes (or something is playing), so a tab left open doesn't count.
  for (const ev of ["pointerdown", "pointermove", "keydown", "scroll", "touchstart", "wheel"])
    addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true, capture: true });
  // The part of the page being looked at: the <section id> (or [data-stat-part]) filling most of the screen.
  const label = el => (el.dataset.statPart || el.querySelector("h1,h2,h3")?.textContent || el.id || "").trim().replace(/\s+/g, " ").slice(0, 60);
  function partInView() {
    let best = null, most = 0;
    for (const el of document.querySelectorAll("section[id], [data-stat-part]")) {
      if (el.querySelector("section[id], [data-stat-part]")) continue; // the innermost one wins
      const r = el.getBoundingClientRect();
      const seen = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0)) * (r.width > 0 ? 1 : 0);
      if (seen > most) { most = seen; best = el; }
    }
    return most > innerHeight * 0.25 ? best : null;
  }
  setInterval(() => {
    if (document.hidden || Date.now() - lastActive > 180000) return;
    pendingTime += 5;
    const el = partInView();
    const n = el && label(el);
    if (!n) return;
    const k = slug(page + "-" + (el.id || n), 60);
    (parts[k] || (parts[k] = { n: `${n}|${page}`, s: 0 })).s += 5;
  }, 5000);

  // Links clicked: downloads, other sites by name, our own pages by address. Buttons only when marked data-stat.
  addEventListener("click", ev => {
    const el = ev.target.closest?.("a[href], [data-stat]");
    if (!el) return;
    let n = el.dataset.stat || "";
    if (!n) {
      let u;
      try { u = new URL(el.getAttribute("href"), location.href); } catch { return; }
      if (!/^https?:$/.test(u.protocol) && !/^(mailto|tel|sms|whatsapp):$/.test(u.protocol)) return;
      if (u.protocol === "mailto:") n = "Email link";
      else if (u.protocol === "tel:" || u.protocol === "sms:") n = "Phone link";
      else if (/\.apk$/i.test(u.pathname)) n = "Download " + decodeURIComponent(u.pathname.split("/").pop());
      else if (u.protocol === "whatsapp:" || /wa\.me|whatsapp/.test(u.host)) n = "WhatsApp";
      else if (u.host !== location.host) n = u.host.replace(/^www\./, "");
      else if (u.pathname === location.pathname && u.hash) n = "Jump to " + u.hash.slice(1);
      else n = (u.pathname.replace(/\.html$/, "").replace(/\/index$/, "") || "/") + (u.search.startsWith("?c=") ? u.search : "");
    }
    n = n.trim().slice(0, 80);
    const k = slug(n, 60);
    if (!k) return;
    (clicks[k] || (clicks[k] = { n, k: 0 })).k++;
    if (el.tagName === "A" && el.target !== "_blank") flush(true); // leaving the page: send now
  }, { capture: true });

  flush();
  setInterval(() => flush(), 60000);
  addEventListener("pagehide", () => flush(true));
  document.addEventListener("visibilitychange", () => { if (document.hidden) flush(true); });
})();
