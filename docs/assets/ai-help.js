// AI help for the owner's admin pages (Channel Studio): a 🎙 button that opens a voice chat with Claude.
// Speak a question (browser speech recognition), Claude answers in text and out loud (speech synthesis).
// The Claude API key is never in this public code: the owner pastes it once and it's kept in Firestore
// at sponsorDeals/_aiHelp, which only the admin account can read (see the sponsorDeals rule).
// The page sets window.studioFirebase = { auth, db, fs } after starting Firebase; this waits for it.

const KEY_DOC = ["sponsorDeals", "_aiHelp"];
const MODELS = ["claude-sonnet-5-5", "claude-haiku-4-5"];
const LANGS = [
  { code: "en-US", label: "English", say: "English" },
  { code: "ur-PK", label: "اردو", say: "Urdu, written in Urdu script" },
  { code: "hi-IN", label: "हिन्दी", say: "Hindi, written in Devanagari" },
];
const HISTORY_KEY = "lt_aihelp_chat";
const LANG_KEY = "lt_aihelp_lang";

const css = `
#aiFab { position: fixed; right: 16px; bottom: 88px; z-index: 30; border-radius: 999px; padding: 14px 20px; font: inherit; font-weight: 800; font-size: 17px; border: 0; background: #7C3AED; color: #fff; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
#aiFab:hover { outline: 3px solid var(--focus); }
#aiBox { position: fixed; right: 16px; bottom: 16px; z-index: 31; width: min(440px, calc(100vw - 32px)); height: min(640px, calc(100vh - 32px)); display: flex; flex-direction: column; background: var(--surface); border: 2px solid #7C3AED; border-radius: 16px; box-shadow: 0 10px 40px rgba(0,0,0,.6); overflow: hidden; }
#aiBox header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--surface-2); border: 0; height: auto; position: static; }
#aiBox header b { flex: 1; font-size: 17px; }
#aiBox select, #aiBox input[type=text], #aiBox input[type=password] { padding: 8px 10px; border-radius: 10px; border: 1.5px solid var(--line); background: var(--bg); color: var(--text); font: inherit; }
#aiBox .x { background: none; border: 0; color: var(--text); font-size: 22px; cursor: pointer; padding: 0 6px; }
#aiMsgs { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
#aiMsgs .m { max-width: 88%; padding: 9px 12px; border-radius: 14px; white-space: pre-wrap; line-height: 1.4; font-size: 15px; }
#aiMsgs .me { align-self: flex-end; background: #312E81; color: #E0E7FF; }
#aiMsgs .ai { align-self: flex-start; background: var(--bg); border: 1px solid var(--line); }
#aiMsgs .note { align-self: center; color: var(--muted); font-size: 13px; text-align: center; }
#aiMsgs [dir=rtl] { text-align: right; }
#aiBar { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-top: 1px solid var(--line); }
#aiBar input { flex: 1; min-width: 0; }
#aiMic { width: 56px; height: 56px; border-radius: 50%; border: 0; background: var(--red); color: #fff; font-size: 26px; cursor: pointer; flex: none; }
#aiMic.on { background: #16A34A; animation: aiPulse 1s ease-in-out infinite; }
@keyframes aiPulse { 50% { box-shadow: 0 0 0 10px rgba(22,163,74,.25); } }
#aiOpts { display: flex; gap: 14px; flex-wrap: wrap; padding: 0 12px 10px; font-size: 13px; color: var(--muted); }
#aiOpts label { display: flex; gap: 5px; align-items: center; cursor: pointer; }
#aiOpts button { background: none; border: 0; color: var(--accent); font: inherit; cursor: pointer; padding: 0; }
#aiSetup { padding: 14px; display: grid; gap: 10px; overflow-y: auto; }
#aiSetup ol { margin: 0; padding-left: 20px; }
`;

const wait = ms => new Promise(r => setTimeout(r, ms));
while (!window.studioFirebase) await wait(200);
const { auth, db, fs } = window.studioFirebase;
const { ADMIN_EMAIL } = await import("../firebase-config.js");

const store = {
  get(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

let apiKey = null, model = MODELS[0], keyLoaded = false;
let chat = store.get(HISTORY_KEY, []);      // [{ role: "user"|"assistant", content }]
let lang = LANGS.find(l => l.code === store.get(LANG_KEY, "en-US")) || LANGS[0];
let speakOn = true, handsFree = true, busy = false, rec = null, listening = false;

const style = document.createElement("style");
style.textContent = css;
document.head.appendChild(style);

const fab = document.createElement("button");
fab.id = "aiFab";
fab.type = "button";
fab.className = "hidden";
fab.textContent = "🎙 Ask AI";
fab.title = "Ask Claude a question by voice";
document.body.appendChild(fab);

const box = document.createElement("div");
box.id = "aiBox";
box.className = "hidden";
box.innerHTML = `
  <header><b>🎙 AI help</b><select id="aiLang" aria-label="Language"></select><button class="x" id="aiClose" aria-label="Close">✕</button></header>
  <div id="aiSetup" class="hidden">
    <p style="margin:0"><b>One-time setup:</b> AI help uses your own Claude API key, so answers are billed to you (a question costs about one cent).</p>
    <ol>
      <li>Open <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com › API keys</a> and sign in.</li>
      <li>Add a little credit under <b>Billing</b> (5 dollars lasts a long time).</li>
      <li>Press <b>Create key</b>, copy it, and paste it here.</li>
    </ol>
    <input type="password" id="aiKey" placeholder="sk-ant-…" autocomplete="off">
    <div class="row"><button class="btn primary" id="aiKeySave" type="button">Save key</button><span class="small" id="aiKeyMsg"></span></div>
    <p class="small" style="margin:0">The key is saved in your private Firebase area that only your admin account can read. It is never put on the public website.</p>
  </div>
  <div id="aiMsgs"></div>
  <div id="aiBar"><button id="aiMic" type="button" aria-label="Talk">🎤</button><input type="text" id="aiText" placeholder="Tap 🎤 and speak, or type here"><button class="btn" id="aiSend" type="button">Send</button></div>
  <div id="aiOpts">
    <label><input type="checkbox" id="aiSpeak" checked> Speak answers</label>
    <label><input type="checkbox" id="aiHands" checked> Listen again after each answer</label>
    <button type="button" id="aiClear">New chat</button>
    <button type="button" id="aiChangeKey">Change key</button>
  </div>`;
document.body.appendChild(box);

const $ = id => document.getElementById(id);
for (const l of LANGS) $("aiLang").add(new Option(l.label, l.code, false, l === lang));
$("aiLang").onchange = () => { lang = LANGS.find(l => l.code === $("aiLang").value); store.set(LANG_KEY, lang.code); if (rec) rec.lang = lang.code; };
$("aiSpeak").onchange = () => { speakOn = $("aiSpeak").checked; if (!speakOn) speechSynthesis?.cancel(); };
$("aiHands").onchange = () => { handsFree = $("aiHands").checked; };
$("aiClose").onclick = () => { box.classList.add("hidden"); fab.classList.remove("hidden"); stopAll(); };
$("aiClear").onclick = () => { stopAll(); chat = []; store.set(HISTORY_KEY, chat); renderChat(); };
$("aiChangeKey").onclick = () => showSetup(true);
$("aiSend").onclick = () => ask($("aiText").value);
$("aiText").onkeydown = e => { if (e.key === "Enter") ask($("aiText").value); };
$("aiMic").onclick = () => listening ? rec?.stop() : listen();
$("aiKeySave").onclick = saveKey;

fab.onclick = async () => {
  fab.classList.add("hidden");
  box.classList.remove("hidden");
  renderChat();
  if (!keyLoaded) await loadKey();
  showSetup(!apiKey);
  if (apiKey && !chat.length) note("Hi Naseer! Tap 🎤 and ask me anything about Channel Studio or your apps.");
};

auth.onAuthStateChanged(user => {
  const admin = user && user.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  fab.classList.toggle("hidden", !admin || !box.classList.contains("hidden"));
  if (!admin) { box.classList.add("hidden"); stopAll(); apiKey = null; keyLoaded = false; }
});

// ---------- the key ----------
async function loadKey() {
  try {
    const snap = await fs.getDoc(fs.doc(db, ...KEY_DOC));
    apiKey = snap.exists() ? snap.data().key || null : null;
    if (snap.exists() && snap.data().model) model = snap.data().model;
    keyLoaded = true;
  } catch (e) {
    note("Couldn't read your saved key: " + e.message);
  }
}
async function saveKey() {
  const k = $("aiKey").value.trim();
  if (!/^sk-ant-/.test(k)) return $("aiKeyMsg").textContent = "That doesn't look like a Claude key (it starts with sk-ant-).";
  $("aiKeyMsg").textContent = "Checking the key…";
  const test = await callClaude([{ role: "user", content: "Say OK." }], null, k).catch(e => e);
  if (test instanceof Error) return $("aiKeyMsg").textContent = test.message;
  try {
    await fs.setDoc(fs.doc(db, ...KEY_DOC), { key: k, model, updatedAt: fs.serverTimestamp() });
  } catch (e) {
    return $("aiKeyMsg").textContent = "The key works but couldn't be saved: " + e.message;
  }
  apiKey = k; $("aiKey").value = ""; $("aiKeyMsg").textContent = "";
  showSetup(false);
  note("Key saved ✓. Tap 🎤 and ask me anything.");
}
function showSetup(on) {
  $("aiSetup").classList.toggle("hidden", !on);
  $("aiMsgs").classList.toggle("hidden", on);
  $("aiBar").classList.toggle("hidden", on);
  $("aiOpts").classList.toggle("hidden", on);
}

// ---------- chat ----------
function bubble(cls, text) {
  const d = document.createElement("div");
  d.className = "m " + cls;
  d.dir = "auto";
  d.textContent = text;
  $("aiMsgs").appendChild(d);
  $("aiMsgs").scrollTop = $("aiMsgs").scrollHeight;
  return d;
}
function note(text) { bubble("note", text).className = "note"; }
function renderChat() {
  $("aiMsgs").innerHTML = "";
  for (const m of chat) bubble(m.role === "user" ? "me" : "ai", m.content);
}

function systemPrompt() {
  // What the owner is looking at right now: the whole Studio page as text (help, videos, loop, slots, guide).
  const page = (document.querySelector("main")?.innerText || "").replace(/\n{3,}/g, "\n\n").slice(0, 14000);
  return `You are the voice helper inside Channel Studio (tv.bulkbazaar.ca/studio), talking with Naseer, the owner of the Free Live TV apps. Your answers are read aloud, so:
- Reply in ${lang.say}. Keep it short: 1 to 4 plain sentences, unless he asks for steps; then give numbered steps, one short line each.
- No markdown, no tables, no emojis, no web links unless he asks for one. Use simple, friendly words.

What you know:
- Channel Studio runs the owner's own TV channels inside the Free Live TV app (Android phones and Google TV): Bazaar TV channel 0, Bazaar Cinema 00, Bazaar Music 000, Bazaar Kids 00000; Bazaar Hits 0000 runs by itself from music labels' songs. Public watch page: tv.bulkbazaar.ca/channel.
- There is no streaming server: the schedule is a list of videos (direct MP4 or .m3u8 links), a non-stop loop, and optional time slots. Everyone sees the same moment, like real TV. Nothing changes until he presses Save; TVs pick up changes within about 10 minutes, or right away after restarting the app.
- Videos must be direct links (archive.org MPEG4 download link, Dropbox with raw=1). YouTube, Facebook and Google Drive links don't work. Best format MP4 H.264 with AAC sound, 720p or 1080p.
- Only show things he has the rights to: his own videos, public domain or Creative Commons shows (the Free show library in step 2 lists safe ones). "US public domain" may differ in Canada. Non-commercial licences can't be used with ads.
- His other apps: Free Live TV, Live TV Plus and Live TV Max, Iqra Quran, App Bazaar (apps.bulkbazaar.ca), Notes for Claude, Multi Chat. Other admin pages: /admin, /sponsors, /stats, /users, /packages, /media.
- You can't press buttons or change the website or apps yourself. Tell him exactly which button to press on this page. For new features or fixes to the apps or website, tell him to ask Claude in the project chat.
- If you don't know something, say so plainly.

The Studio page as he sees it right now (unsaved changes included):
${page}`;
}

async function ask(text) {
  text = (text || "").trim();
  if (!text || busy) return;
  if (!apiKey) return showSetup(true);
  stopAll();
  $("aiText").value = "";
  chat.push({ role: "user", content: text });
  bubble("me", text);
  const out = bubble("ai", "…");
  busy = true;
  const speaker = sentenceSpeaker();
  try {
    let full = "";
    await callClaude(chat.slice(-20), part => {
      full += part;
      out.textContent = full;
      $("aiMsgs").scrollTop = $("aiMsgs").scrollHeight;
      speaker.add(part);
    });
    speaker.end();
    chat.push({ role: "assistant", content: full.trim() || "(no answer)" });
    store.set(HISTORY_KEY, chat.slice(-30));
    await speaker.done;
    if (handsFree && !box.classList.contains("hidden")) listen();
  } catch (e) {
    chat.pop();
    out.className = "note";
    out.textContent = e.message;
    if (e.badKey) { apiKey = null; showSetup(true); }
  } finally {
    busy = false;
  }
}

/** Streams an answer from Claude; [onText] gets each new piece of text. Throws Errors with plain messages. */
async function callClaude(messages, onText, key = apiKey) {
  for (let i = MODELS.indexOf(model); i < MODELS.length; i++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: MODELS[i], max_tokens: 1024, system: onText ? systemPrompt() : undefined, messages, stream: !!onText }),
    }).catch(() => { throw new Error("No internet connection. Check it and try again."); });
    if (res.ok) {
      if (MODELS[i] !== model) model = MODELS[i];
      if (onText) await readStream(res, onText);
      return;
    }
    const body = await res.json().catch(() => ({}));
    const msg = body.error?.message || "";
    if (res.status === 404 && /model/i.test(msg) && i + 1 < MODELS.length) continue;
    if (res.status === 401 || res.status === 403) throw Object.assign(new Error("Claude didn't accept the key. Paste a new one (console.anthropic.com › API keys)."), { badKey: true });
    if (/credit balance/i.test(msg)) throw new Error("Your Claude account is out of credit. Add some at console.anthropic.com › Billing, then ask again.");
    if (res.status === 429 || res.status === 529 || res.status >= 500) throw new Error("Claude is busy right now. Try again in a minute.");
    throw new Error("Claude said: " + (msg || res.status));
  }
}
async function readStream(res, onText) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") onText(ev.delta.text);
      if (ev.type === "error") throw new Error("Claude is busy right now. Try again in a minute.");
    }
  }
}

// ---------- voice ----------
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (!SR) {
  $("aiMic").classList.add("hidden");
  $("aiHands").closest("label").classList.add("hidden");
  $("aiText").placeholder = "Type your question (voice works in Chrome or Edge)";
}
function listen() {
  if (!SR || listening || busy) return;
  speechSynthesis?.cancel();
  rec = new SR();
  rec.lang = lang.code;
  rec.interimResults = true;
  rec.continuous = false;
  let finalText = "";
  rec.onresult = e => {
    let interim = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
      else interim += e.results[i][0].transcript;
    }
    $("aiText").value = finalText + interim;
  };
  rec.onerror = e => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed") note("Allow the microphone for this page (the 🔒 or 🎤 icon in the address bar), then tap 🎤 again.");
    else if (e.error === "language-not-supported") note("This browser can't hear " + lang.label + ". Try English, or type.");
  };
  rec.onend = () => {
    listening = false;
    $("aiMic").classList.remove("on");
    $("aiMic").textContent = "🎤";
    const t = (finalText || $("aiText").value).trim();
    if (t) ask(t);
  };
  listening = true;
  $("aiMic").classList.add("on");
  $("aiMic").textContent = "■";
  $("aiText").value = "";
  try { rec.start(); } catch { listening = false; $("aiMic").classList.remove("on"); $("aiMic").textContent = "🎤"; }
}
function stopAll() {
  if (rec && listening) { rec.onend = null; rec.abort(); listening = false; $("aiMic").classList.remove("on"); $("aiMic").textContent = "🎤"; }
  window.speechSynthesis?.cancel();
}

function pickVoice() {
  const voices = speechSynthesis.getVoices();
  const base = lang.code.slice(0, 2);
  return voices.find(v => v.lang.replace("_", "-") === lang.code && /google|natural|online/i.test(v.name))
    || voices.find(v => v.lang.replace("_", "-") === lang.code)
    || voices.find(v => v.lang.startsWith(base));
}
window.speechSynthesis?.getVoices();

/** Speaks text as it streams in, one sentence at a time (long single utterances get cut off in Chrome). */
function sentenceSpeaker() {
  let pending = "", queued = 0, ended = false, finish;
  const done = new Promise(r => finish = r);
  const check = () => { if (ended && queued === 0) finish(); };
  const say = text => {
    const clean = text.replace(/[*#_`>|]/g, "").replace(/https?:\/\/\S+/g, "").trim();
    if (!clean || !speakOn || !window.speechSynthesis) return;
    const voice = pickVoice();
    if (!voice && lang.code !== "en-US") return;
    const u = new SpeechSynthesisUtterance(clean);
    u.lang = lang.code;
    if (voice) u.voice = voice;
    u.rate = 1.02;
    queued++;
    u.onend = u.onerror = () => { queued--; check(); };
    speechSynthesis.speak(u);
  };
  return {
    done,
    add(part) {
      pending += part;
      const m = pending.match(/^[\s\S]*[.!?۔।\n](\s|$)/);
      if (m) { say(m[0]); pending = pending.slice(m[0].length); }
    },
    end() {
      say(pending); pending = ""; ended = true;
      if (speakOn && lang.code !== "en-US" && !pickVoice()) note("This device has no " + lang.label + " voice, so the answer is shown as text only.");
      check();
    },
  };
}
