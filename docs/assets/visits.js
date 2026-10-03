// Anonymous website visit counting for the owner's Stats page.
// Each browser gets a random anonymous Firebase account (no name or email) and writes one
// record per day: webVisits/{day}_{uid} with page views, and watch time per channel.
// Nothing here identifies a person; only the owner's account can read the records.
(() => {
  const KEY = "AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE";
  const DOCS = "projects/live-tv-b2164/databases/(default)/documents";
  const STORE = "lt_anon";
  const pad = n => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const page = (location.pathname.replace(/\/+$/, "").split("/").pop() || "home").replace(/\.html$/, "").replace(/[^a-z0-9-]/gi, "") || "home";
  const dev = /Android TV|GoogleTV|AFT|SmartTV|Tizen|Web0S/i.test(navigator.userAgent) ? "TV"
    : /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? "Phone" : "Computer";

  let saved = null;
  try {
    if (localStorage.getItem("lt_admin") === "1") return; // The owner's own visits aren't counted.
    saved = JSON.parse(localStorage.getItem(STORE) || "null");
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

  // Watch time waiting to be sent: { channelId: { n: name, c: country, s: seconds } }, plus 2×2 seconds.
  let pending = {}, pendingQuad = 0, pendingViews = 1;
  const q = s => "`" + s.replace(/[`\\]/g, "") + "`";

  async function flush(keepalive) {
    if (broken) return;
    const views = pendingViews, chans = pending, quad = pendingQuad;
    if (!views && !quad && !Object.keys(chans).length) return;
    pendingViews = 0; pending = {}; pendingQuad = 0;
    try {
      const t = await auth();
      const day = today();
      const fields = { uid: { stringValue: saved.uid }, day: { stringValue: day }, dev: { stringValue: dev }, channels: { mapValue: { fields: {} } } };
      const mask = ["uid", "day", "dev"], transforms = [];
      if (views) transforms.push({ fieldPath: `pages.${q(page)}`, increment: { integerValue: String(views) } },
        { fieldPath: "views", increment: { integerValue: String(views) } });
      let watch = 0;
      for (const [id, c] of Object.entries(chans)) {
        fields.channels.mapValue.fields[id] = { mapValue: { fields: { n: { stringValue: c.n }, c: { stringValue: c.c } } } };
        mask.push(`channels.${q(id)}.n`, `channels.${q(id)}.c`);
        transforms.push({ fieldPath: `channels.${q(id)}.s`, increment: { integerValue: String(c.s) } });
        watch += c.s;
      }
      if (watch) transforms.push({ fieldPath: "watch", increment: { integerValue: String(watch) } });
      if (quad) transforms.push({ fieldPath: "quad", increment: { integerValue: String(quad) } });
      const r = await fetch(`https://firestore.googleapis.com/v1/${DOCS}:commit`, {
        method: "POST", keepalive: !!keepalive,
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + t },
        body: JSON.stringify({ writes: [{
          update: { name: `${DOCS}/webVisits/${day}_${saved.uid}`, fields },
          updateMask: { fieldPaths: mask }, updateTransforms: transforms }] }) });
      if (r.status === 403) broken = true; // The Firestore rule isn't pasted yet.
    } catch {}
  }

  // Called by the watch page every few seconds while a channel is playing.
  window.ltWatch = (ch, seconds, inQuad) => {
    if (!ch || !ch.id) return;
    const id = String(ch.id).replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    const e = pending[id] || (pending[id] = { n: String(ch.name || "?").slice(0, 80), c: String(ch.group || "").slice(0, 40), s: 0 });
    e.s += seconds;
    if (inQuad) pendingQuad += seconds;
  };

  flush();
  setInterval(() => flush(), 60000);
  addEventListener("pagehide", () => flush(true));
})();
