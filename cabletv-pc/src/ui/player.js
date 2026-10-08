// One picture: a channel stream (hls.js, mpegts.js or the browser's own player), one of our scheduled
// channels, or a locked YouTube page of ours in a <webview> (StreamPlayer.kt, WebPreview and
// WebChannelActivity in the TV app). Every tile, the 1+List picture and the full screen use it.
import { streamKinds, youtubeId } from './util.js';
import { whatsOn, fillerFor, blockAt } from './shared/schedule.js';
import * as mine from './mychannel.js';
import * as leveler from './leveler.js';
import * as store from './store.js';

const Hls = window.Hls;
const mpegts = window.mpegts;

/** Every player's stream headers by host, sent to the window (it adds them to the stream requests). */
const headers = new Map();
function shareHeaders() {
  const map = {};
  for (const h of headers.values()) Object.assign(map, h);
  window.pc?.setStreamHeaders(map);
}

/** Our pages' livetv:// signals and the keys pressed on them, by the webview's id. */
const webviews = new Map();
window.pc?.on('web-signal', ({ id, signal }) => webviews.get(id)?.signal(signal));

export const equalVolume = () => store.get('equalVolume', true);

const timeText = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/**
 * A player in [host]. [opts]: muted, quality ('normal', 'low' or 'lower' for the small tiles), and
 * small (a tile: no YouTube pages larger than needed, messages short).
 */
export function createPlayer(host, opts = {}) {
  const root = document.createElement('div');
  root.className = 'player';
  const video = document.createElement('video');
  video.playsInline = true;
  video.autoplay = true;
  video.muted = !!opts.muted;
  const message = document.createElement('div');
  message.className = 'player-msg hidden';
  const spinner = document.createElement('div');
  spinner.className = 'spinner hidden';
  root.append(video, spinner, message);
  host.appendChild(root);

  let channel = null;
  let muted = !!opts.muted;
  let quality = opts.quality || 'normal';
  let hls = null, ts = null, web = null, webUrl = null;
  let candidates = [], attempt = 0;
  let timer = null;
  let scheduled = null; // { url, zero } on our scheduled channels
  let endedUrl = null, fillerUrl = null, lastFiller = null;
  let fallback = false; // our YouTube channel's page gave up: its free films play instead
  let paused = false;
  let stallTimer = null;
  const self = {};

  function setMessage(text) {
    message.textContent = text || '';
    message.classList.toggle('hidden', !text);
    self.onError && self.onError(text || null);
  }
  const busy = (on) => spinner.classList.toggle('hidden', !on);

  function stopStream() {
    clearTimeout(stallTimer);
    if (hls) { hls.destroy(); hls = null; }
    if (ts) { try { ts.destroy(); } catch {} ts = null; }
    video.removeAttribute('src');
    try { video.load(); } catch {}
  }
  function stopWeb() {
    if (!web) return;
    try { webviews.delete(web.getWebContentsId()); } catch {}
    web.remove();
    web = null;
    webUrl = null;
    video.classList.remove('hidden');
  }

  // ---------- Our locked YouTube pages ----------

  function showWeb(url) {
    stopStream();
    setMessage(null);
    busy(false);
    const page = muted ? url + (url.includes('?') ? '&' : '?') + 'mute=1' : url;
    if (web && webUrl === page) return;
    stopWeb();
    web = document.createElement('webview');
    web.className = 'webpage';
    web.setAttribute('src', page);
    web.setAttribute('partition', 'persist:pages');
    webUrl = page;
    video.classList.add('hidden');
    const w = web;
    w.addEventListener('dom-ready', () => {
      try {
        w.setAudioMuted(muted);
        webviews.set(w.getWebContentsId(), { signal: (s) => onSignal(w, s) });
      } catch {}
    });
    // A page that doesn't load: the channel's films instead, like a page that gives up.
    w.addEventListener('did-fail-load', (e) => { if (e.isMainFrame && e.errorCode !== -3) onSignal(w, 'fallback'); });
    root.insertBefore(w, spinner);
  }

  function onSignal(w, signal) {
    if (w !== web || !channel) return;
    if (signal === 'done') { scheduleStep(); return; }
    if (signal !== 'fallback') return;
    const c = mine.configOf(channel);
    if (mine.webPage(channel) && c) {
      // Our YouTube channel: its free films under its own name (MyChannel backup).
      fallback = true;
      stopWeb();
      scheduleStep();
    } else {
      stopWeb();
      setMessage(`${channel.name} can't play right now. Try again in a while.`);
    }
  }

  // ---------- Streams ----------

  function kindsFor(url) { return streamKinds(url).map((k) => [url, k]); }

  function prepare() {
    clearTimeout(stallTimer);
    if (hls) { hls.destroy(); hls = null; }
    if (ts) { try { ts.destroy(); } catch {} ts = null; }
    const pick = candidates[attempt];
    if (!pick) return;
    const [url, kind] = pick;
    busy(true);
    const zero = scheduled && scheduled.url === url ? scheduled.zero : null;
    const seek = () => { if (zero != null) { try { video.currentTime = Math.max(0, (Date.now() - zero) / 1000); } catch {} } };
    video.addEventListener('loadedmetadata', seek, { once: true });
    if (kind === 'hls' && Hls && Hls.isSupported()) {
      const small = quality !== 'normal';
      hls = new Hls({
        capLevelToPlayerSize: true,
        startLevel: small ? 0 : -1,
        maxBufferLength: small ? 20 : 30,
        backBufferLength: 10,
        manifestLoadingMaxRetry: 2,
        levelLoadingMaxRetry: 3,
        fragLoadingMaxRetry: 3,
      });
      if (small) hls.autoLevelCapping = 0;
      hls.on(Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
        fail(data.response && data.response.code ? 'refused' : 'network');
      });
      hls.loadSource(url);
      hls.attachMedia(video);
    } else if (kind === 'ts' && mpegts && mpegts.isSupported()) {
      ts = mpegts.createPlayer({ type: 'mpegts', isLive: zero == null, url }, { enableWorker: true, lazyLoad: false, liveBufferLatencyChasing: true });
      ts.on(mpegts.Events.ERROR, (type) => fail(type === mpegts.ErrorTypes.NETWORK_ERROR ? 'network' : 'format'));
      ts.attachMediaElement(video);
      ts.load();
    } else {
      video.src = url;
    }
    if (!muted && equalVolume()) { leveler.attach(video); leveler.flush(video); }
    video.play().catch(() => {});
    // Nothing after 25 seconds: the next way to play it.
    stallTimer = setTimeout(() => { if (video.readyState < 2) fail('timeout'); }, 25000);
  }

  function fail(why) {
    if (attempt + 1 < candidates.length) { attempt++; prepare(); return; }
    busy(false);
    stopStream();
    setMessage({
      network: "Can't reach this channel. Check your internet connection.",
      refused: "The channel's server refused the stream. It may be offline or geo-blocked.",
      format: "This stream format isn't supported.",
      timeout: "This channel isn't sending a picture right now.",
    }[why] || "This channel can't be played right now.");
  }

  video.addEventListener('playing', () => { busy(false); clearTimeout(stallTimer); self.onPlaying && self.onPlaying(); });
  video.addEventListener('waiting', () => busy(true));
  video.addEventListener('error', () => { if (candidates.length && video.getAttribute('src')) fail('format'); });
  video.addEventListener('ended', () => {
    if (!channel || !mine.isMine(channel)) return;
    endedUrl = scheduled && scheduled.url;
    scheduleStep();
  });

  // ---------- Our scheduled channels ----------

  function scheduleStep() {
    clearTimeout(timer);
    if (!channel) return;
    const c = mine.configOf(channel);
    if (!c) { setMessage(`${channel.name} is starting. Please wait a moment.`); timer = setTimeout(scheduleStep, 5000); return; }
    const now = Date.now();
    const on = whatsOn(c, now);
    const again = (at) => { timer = setTimeout(scheduleStep, Math.min(60000, Math.max(1000, at - now))); };
    if (on.off) {
      scheduled = null;
      stopWeb();
      stopStream();
      busy(false);
      const next = on.next ? ` Next: ${on.next.title} at ${timeText(on.nextAt)}.` : '';
      setMessage(`${channel.name} is off air right now.${next}`);
      again(on.nextAt || now + 60000);
      return;
    }
    const url = on.video.url;
    again(on.until);
    if (youtubeId(url)) {
      // Bazaar TV's trailers and music videos: our locked page; a small tile just says what's on.
      const b = blockAt(c, now);
      const page = b && mine.blockPage(channel, now);
      if (page && !opts.small) { scheduled = null; showWeb(page); return; }
      stopWeb(); stopStream(); busy(false); scheduled = null;
      setMessage(`Movie trailers and music videos are on now. Open ${channel.name} to watch them.`);
      return;
    }
    stopWeb();
    if (url === endedUrl && on.offset > 0) {
      // Over before its time: short fillers until the schedule moves on.
      if (fillerUrl && !video.paused && !video.ended) return;
      const left = on.until - now;
      const f = left > 3000 ? fillerFor(c, left, now, lastFiller) : null;
      if (f) {
        fillerUrl = lastFiller = f.url;
        scheduled = { url: f.url, zero: null };
        candidates = kindsFor(f.url); attempt = 0; setMessage(null); prepare();
      }
      return;
    }
    endedUrl = null; fillerUrl = null;
    const zero = on.video.secs > 0 ? now - on.offset : null;
    if (scheduled && scheduled.url === url && scheduled.zero === zero && (hls || ts || video.getAttribute('src'))) return;
    scheduled = { url, zero };
    candidates = kindsFor(url); attempt = 0; setMessage(null); prepare();
  }

  // ---------- What the screens call ----------

  self.play = (ch) => {
    clearTimeout(timer);
    channel = ch;
    scheduled = null; endedUrl = null; fillerUrl = null; lastFiller = null; fallback = false; paused = false;
    candidates = []; attempt = 0;
    setMessage(null);
    if (!ch) { stopWeb(); stopStream(); busy(false); return; }
    headers.set(self, (() => {
      try { return ch.userAgent || ch.referrer ? { [new URL(ch.url).hostname]: { ua: ch.userAgent, referrer: ch.referrer } } : {}; } catch { return {}; }
    })());
    shareHeaders();
    const page = mine.pageFor(ch);
    if (page) { showWeb(page); return; }
    if (mine.isMine(ch)) { scheduleStep(); return; }
    stopWeb();
    candidates = [ch.url, ...(ch.alternates || [])].flatMap(kindsFor);
    prepare();
  };
  self.channel = () => channel;
  self.retry = () => self.play(channel);
  self.stop = () => self.play(null);
  self.isWeb = () => !!web && !fallback;
  self.setMuted = (m) => {
    muted = !!m;
    video.muted = muted;
    if (!muted && equalVolume() && (hls || ts || video.getAttribute('src'))) leveler.attach(video);
    if (web) {
      try { web.setAudioMuted(muted); } catch {}
    }
  };
  self.setQuality = (q) => {
    if (q === quality) return;
    quality = q;
    if (hls) hls.autoLevelCapping = q === 'normal' ? -1 : 0;
  };
  /** The ad break: the channel waits, then goes back to live (or to where the schedule is). */
  self.pause = () => { paused = true; video.pause(); if (web) { try { web.setAudioMuted(true); } catch {} } };
  self.resume = () => {
    if (!paused) return;
    paused = false;
    if (web) { try { web.setAudioMuted(muted); } catch {} return; }
    if (hls && hls.liveSyncPosition) { try { video.currentTime = hls.liveSyncPosition; } catch {} }
    if (scheduled && scheduled.zero != null) { try { video.currentTime = (Date.now() - scheduled.zero) / 1000; } catch {} }
    video.play().catch(() => {});
  };
  self.video = video;
  self.element = root;
  /** Frames dropped so far (the 1+3 big picture's smoothness check). */
  self.droppedFrames = () => (video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality().droppedVideoFrames : 0);
  self.freeze = (on) => { if (on) video.pause(); else video.play().catch(() => {}); };
  self.destroy = () => {
    unsub();
    clearTimeout(timer);
    clearTimeout(stallTimer);
    headers.delete(self);
    shareHeaders();
    stopWeb();
    stopStream();
    root.remove();
  };
  // Our channels' new settings: the schedule picks them up.
  const unsub = mine.onChange(() => { if (channel && mine.isMine(channel) && !web) scheduleStep(); });
  return self;
}
