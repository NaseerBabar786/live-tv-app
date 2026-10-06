#!/usr/bin/env python3
"""
Builds playlists of TV channels whose streams are working right now.

Collects every channel from the two open lists Cable TV uses, iptv-org
(github.com/iptv-org/iptv) and Famelack (github.com/famelack/famelack-channels),
tests each stream the way a player would, and keeps only the ones that answer:

  * HLS (.m3u8): the playlist loads, its first variant loads, and the first
    video segment starts downloading.
  * DASH (.mpd): the manifest loads.
  * Anything else: the server starts sending data.

Every request uses the channel's own User-Agent/Referer when the list gives
one, otherwise Cable TV's. A stream that fails is tried once more with VLC's
User-Agent, and when the server answered but a later step failed, ffprobe
(installed in the workflow) has the final say.

Writes (in docs/, served at tv.bulkbazaar.ca):
  AllChannels.m3u  every working channel, grouped by country
  LiveTV.m3u       Cable TV's mix: Pakistani, Indian (Hindi/Urdu/Punjabi),
                   Canadian, British and American
  playlists.json   counts and the time of the check

Standard library only. Run: python3 tools/check_streams.py [--limit N]
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import gzip
import json
import os
import re
import shutil
import ssl
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

IPTV = "https://iptv-org.github.io/iptv"
FAMELACK = "https://raw.githubusercontent.com/famelack/famelack-channels/main/tv/raw"
CATALOGUE = "https://raw.githubusercontent.com/iptv-org/iptv/master/PLAYLISTS.md"
APP_UA = "LiveTV-Android/1.0"
TIMEOUT = 10
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs")

MIX = [  # (country code, group title, languages to keep or None)
    ("pk", "Pakistani", None),
    ("in", "Indian", {"Hindi", "Urdu", "Punjabi"}),
    ("ca", "Canadian", None),
    ("uk", "British", None),
    ("us", "American", None),
]

CTX = ssl.create_default_context()


def fetch_text(url, timeout=60):
    req = urllib.request.Request(url, headers={"User-Agent": APP_UA})
    with urllib.request.urlopen(req, timeout=timeout, context=CTX) as r:
        return r.read().decode("utf-8", "replace")


# ---------------------------------------------------------------- lists

ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def parse_m3u(text):
    """[(attrs, name, url, {user-agent, referrer})] from an extended M3U."""
    out, attrs, name, opts = [], None, "", {}
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("#EXTINF"):
            body = line.split(":", 1)[1] if ":" in line else ""
            head, _, name = body.partition('",') if '",' in body else body.rpartition(",")
            attrs = {k.lower(): v for k, v in ATTR.findall(head + '"')}
            name, opts = name.strip(), {}
        elif line.startswith("#EXTVLCOPT:"):
            k, _, v = line[11:].partition("=")
            k = k.strip().lower()
            if k == "http-user-agent":
                opts["ua"] = v.strip()
            elif k in ("http-referrer", "http-referer"):
                opts["ref"] = v.strip()
        elif line and not line.startswith("#") and attrs is not None:
            out.append((attrs, name, line, opts))
            attrs = None
    return out


def clean_name(name):
    name = re.sub(r"\s*\(\d{3,4}[pi]\)", "", name)
    return re.sub(r"\s*\[[^\]]*\]", "", name).strip() or name


RADIO = re.compile(r"\bradio\b|\bf\.?m\b|\d{2,3}[.,]\d\s*fm\b", re.I)
TVNAME = re.compile(r"t[eé]l[eé](?![a-z])|\btv\b|television", re.I)
AUDIO = re.compile(r"\.(mp3|aac|ogg|opus|m4a)(\?|$)|icecast|shoutcast|streamtheworld|zeno\.fm", re.I)


# Streams that carry a restreamer's own mark burned into the picture (it can't be hidden by the app).
STAMPED = ("5.57.74.130",)  # AXN Adria: round arrow badge over the video, 2026-10-05


def is_stamped(url):
    return any(s in url for s in STAMPED)


def is_radio(name, url):
    return bool(AUDIO.search(url) or (RADIO.search(name) and not TVNAME.search(name)))


def lang_name(name):
    return {"Panjabi": "Punjabi", "Undefined": ""}.get(name, name)


def load_channels():
    """Every channel from both lists: dicts with name, country, logo, language, genre, urls."""
    names = {}  # country code -> name, from iptv-org's catalogue
    for m in re.finditer(r"^- \S+ (.+?) <code>https://iptv-org\.github\.io/iptv/countries/(\w+)\.m3u</code>",
                         fetch_text(CATALOGUE), re.M):
        names[m.group(2)] = m.group(1).strip()

    languages, genres = {}, {}
    for attrs, _, url, _ in parse_m3u(fetch_text(f"{IPTV}/index.language.m3u")):
        languages.setdefault(url, lang_name(attrs.get("group-title", "")))
    for attrs, _, url, _ in parse_m3u(fetch_text(f"{IPTV}/index.category.m3u")):
        genres.setdefault(url, attrs.get("group-title", "").split(";")[0])

    channels = []
    for code in sorted(names):
        try:
            entries = parse_m3u(fetch_text(f"{IPTV}/countries/{code}.m3u"))
        except Exception as e:  # a country without a playlist today
            print(f"iptv-org {code}: {e}", file=sys.stderr)
            continue
        for attrs, name, url, opts in entries:
            if is_radio(name, url) or is_stamped(url):
                continue
            genre = genres.get(url) or attrs.get("group-title", "").split(";")[0]
            opts = {k: v for k, v in {"ua": opts.get("ua") or attrs.get("http-user-agent"),
                                      "ref": opts.get("ref") or attrs.get("http-referrer")}.items() if v}
            channels.append({
                "name": clean_name(name), "country": code, "logo": attrs.get("tvg-logo", ""),
                "id": attrs.get("tvg-id", ""), "language": languages.get(url, ""),
                "genre": "" if genre in ("", "Undefined") else genre, "urls": [url], "opts": opts,
            })

    # Famelack: logos and genres come from the index Cable TV bundles.
    info = {}
    try:
        with open(os.path.join(ROOT, "app/src/livetv/assets/channel_info.json"), encoding="utf-8") as f:
            info = json.load(f)
    except OSError:
        pass
    meta = json.loads(fetch_text(f"{FAMELACK}/countries_metadata.json"))
    for code, c in meta.items():
        code = code.lower()
        names.setdefault(code, c.get("country", code.upper()))
        if not c.get("channelCount"):
            continue
        try:
            entries = json.loads(fetch_text(f"{FAMELACK}/countries/{code}.json"))
        except Exception as e:
            print(f"famelack {code}: {e}", file=sys.stderr)
            continue
        for e in entries:
            urls = [u for u in (e.get("sources") or {}).get("streams", []) if u.startswith("http") and not is_stamped(u)]
            name = e.get("name", "")
            if not urls or is_radio(name, urls[0]):
                continue
            logo, genre = (info.get(e.get("nanoid", "")) or ["", ""])[:2]
            langs = e.get("languages") or []
            channels.append({
                "name": name, "country": code, "logo": logo, "id": "",
                "language": famelack_language(langs[0]) if langs else "",
                "genre": "" if genre in ("", "general") else genre.capitalize(), "urls": urls, "opts": {},
            })
    return channels, names


FAMELACK_LANGS = {"hin": "Hindi", "urd": "Urdu", "pan": "Punjabi", "eng": "English", "fra": "French",
                  "spa": "Spanish", "ara": "Arabic", "ben": "Bengali", "tam": "Tamil", "tel": "Telugu",
                  "mar": "Marathi", "guj": "Gujarati", "kan": "Kannada", "mal": "Malayalam", "por": "Portuguese",
                  "deu": "German", "ita": "Italian", "rus": "Russian", "zho": "Chinese", "tur": "Turkish",
                  "fas": "Persian", "pus": "Pashto", "snd": "Sindhi"}


def famelack_language(code):
    return FAMELACK_LANGS.get(code.lower(), code.capitalize())


# ---------------------------------------------------------------- checks

class _NoRedirectLimit(urllib.request.HTTPRedirectHandler):
    max_redirections = 6


OPENER = urllib.request.build_opener(_NoRedirectLimit, urllib.request.HTTPSHandler(context=CTX))


def open_url(url, opts, limit, ranged=False):
    headers = {"User-Agent": opts.get("ua") or APP_UA}
    if ranged:  # video segments: only the first bytes are needed
        headers["Range"] = f"bytes=0-{limit - 1}"
    if opts.get("ref"):
        headers["Referer"] = opts["ref"]
    req = urllib.request.Request(url, headers=headers)
    with OPENER.open(req, timeout=TIMEOUT) as r:
        if r.status not in (200, 206):
            raise IOError(f"HTTP {r.status}")
        data = r.read(limit)
        if data[:2] == b"\x1f\x8b" and not ranged:  # some servers gzip playlists unasked
            try:
                data = gzip.decompress(data)
            except (OSError, EOFError):
                pass
        return r.geturl(), data


def first_uri(text, base):
    for line in text.splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            return urllib.parse.urljoin(base, line)
    return None


class StageError(Exception):
    def __init__(self, stage, cause):
        super().__init__(f"{stage}: {cause}")
        self.stage, self.cause = stage, cause


def staged(stage, fn, *a, **k):
    try:
        return fn(*a, **k)
    except Exception as e:
        raise StageError(stage, e)


def stream_works(url, opts):
    final, data = staged("playlist", open_url, url, opts, 262144)
    head = data[:2048].decode("utf-8", "replace")
    if "#EXTM3U" in head:
        text = data.decode("utf-8", "replace")
        if "#EXT-X-STREAM-INF" in text:  # master playlist: follow the first variant
            tag = text.split("#EXT-X-STREAM-INF", 1)[1]
            variant = first_uri(tag.split("\n", 1)[1] if "\n" in tag else "", final)
            if not variant:
                return False
            final, data = staged("variant", open_url, variant, opts, 262144)
            text = data.decode("utf-8", "replace")
            if "#EXTM3U" not in text[:2048]:
                return False
        segment = first_uri(text, final)
        if not segment or "#EXTINF" not in text:
            return False
        _, chunk = staged("segment", open_url, segment, opts, 2048, ranged=True)
        return len(chunk) > 0
    if "<MPD" in head:
        return True
    lowered = head.lower()
    if "<html" in lowered or "<!doctype" in lowered:
        return False
    return len(data) > 0


REASONS = {}


def reason(e):
    if isinstance(e, StageError):
        return f"{e.stage} {reason(e.cause)}"
    if isinstance(e, urllib.error.HTTPError):
        return f"HTTP {e.code}"
    if isinstance(e, urllib.error.URLError):
        e = e.reason
    text = type(e).__name__
    if isinstance(e, ssl.SSLError) or "CERTIFICATE" in str(e):
        return "SSL"
    if "timed out" in str(e).lower() or isinstance(e, TimeoutError):
        return "timeout"
    return text


VLC_UA = "VLC/3.0.21 LibVLC/3.0.21"


FFPROBE = shutil.which("ffprobe")


def ffprobe_plays(url, opts):
    """A real player's opinion: ffprobe finds an audio or video track."""
    cmd = [FFPROBE, "-v", "error", "-rw_timeout", "15000000", "-user_agent", opts.get("ua") or APP_UA]
    if opts.get("ref"):
        cmd += ["-referer", opts["ref"]]
    cmd += ["-show_entries", "stream=codec_type", "-of", "csv=p=0", url]
    try:
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=40).stdout
    except subprocess.TimeoutExpired:
        return False
    return "video" in out or "audio" in out


def check(url, opts):
    """The User-Agent the stream works with (the list's or Cable TV's first, then VLC's), or None."""
    why = "not a stream"
    tries = [opts, opts] if opts.get("ua") else [opts, dict(opts, ua=VLC_UA)]
    for attempt in tries:
        try:
            if stream_works(url, attempt):
                return attempt.get("ua") or APP_UA
        except Exception as e:
            why = reason(e)
    # The server answered but a later step failed: let ffprobe (a real player) decide.
    if FFPROBE and not why.startswith("playlist"):
        for attempt in tries[:1] if opts.get("ua") else tries:
            if ffprobe_plays(url, attempt):
                return attempt.get("ua") or APP_UA
        why = "ffprobe: " + why
    REASONS[why] = REASONS.get(why, 0) + 1
    return None


# ---------------------------------------------------------------- output

def entry(ch, group):
    attrs = [f'tvg-id="{ch["id"]}"' if ch["id"] else "", f'tvg-logo="{ch["logo"]}"' if ch["logo"] else "",
             f'tvg-country="{ch["country"].upper()}"', f'group-title="{group}"', f'tvg-language="{ch["language"]}"' if ch["language"] else "",
             f'tvg-genre="{ch["genre"]}"' if ch["genre"] else ""]
    lines = ["#EXTINF:-1 " + " ".join(a for a in attrs if a) + "," + ch["name"]]
    if ch["opts"].get("ua"):
        lines.append("#EXTVLCOPT:http-user-agent=" + ch["opts"]["ua"])
    if ch["opts"].get("ref"):
        lines.append("#EXTVLCOPT:http-referrer=" + ch["opts"]["ref"])
    lines.append(ch["url"])
    return lines


def write(path, title, items, checked_at):
    lines = ["#EXTM3U", f"# {title}", f"# Every stream was tested and working at {checked_at} UTC.",
             "# Free, publicly available channels from iptv-org and Famelack. Rebuilt every day."]
    for ch, group in items:
        lines += entry(ch, group)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0, help="check only the first N channels (testing)")
    ap.add_argument("--workers", type=int, default=128)
    args = ap.parse_args()

    channels, names = load_channels()
    if args.limit:
        channels = channels[:args.limit]
    print(f"{len(channels)} channels to check", flush=True)

    # One check per distinct stream, shared by every channel that lists it.
    urls = {}
    for ch in channels:
        for u in ch["urls"]:
            urls.setdefault(u, ch["opts"])
    status = {}
    with cf.ThreadPoolExecutor(args.workers) as pool:
        futures = {pool.submit(check, u, o): u for u, o in urls.items()}
        for i, fut in enumerate(cf.as_completed(futures), 1):
            status[futures[fut]] = fut.result()
            if i % 1000 == 0:
                print(f"{i}/{len(urls)} checked, {sum(1 for v in status.values() if v)} working", flush=True)

    working, seen_url, seen_name = [], set(), set()
    for ch in channels:
        url = next((u for u in ch["urls"] if status.get(u)), None)
        if url and status[url] == VLC_UA and not ch["opts"].get("ua"):
            ch = dict(ch, opts=dict(ch["opts"], ua=VLC_UA))  # plays only with a VLC-like User-Agent
        key = (ch["country"], re.sub(r"\W+", "", ch["name"].lower()))
        if not url or url in seen_url or key in seen_name:
            continue  # dead, or the same channel already kept from the other list
        seen_url.add(url)
        seen_name.add(key)
        working.append(dict(ch, url=url))

    checked_at = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M")
    by_country = sorted(working, key=lambda c: (names.get(c["country"], c["country"]), c["name"].lower()))
    write(os.path.join(OUT, "AllChannels.m3u"), "All working channels, grouped by country",
          [(c, names.get(c["country"], c["country"].upper())) for c in by_country], checked_at)

    mix = []
    for code, title, keep in MIX:
        mix += [(c, title) for c in sorted(working, key=lambda c: c["name"].lower())
                if c["country"] == code and (keep is None or c["language"] in keep)]
    write(os.path.join(OUT, "LiveTV.m3u"), "Cable TV mix: Pakistani, Indian, Canadian, British and American",
          mix, checked_at)

    counts = {}
    for c in working:
        counts[names.get(c["country"], c["country"])] = counts.get(names.get(c["country"], c["country"]), 0) + 1
    stats = {"checked_at": checked_at, "streams_tested": len(urls), "channels_listed": len(channels),
             "working_channels": len(working),
             "need_vlc_user_agent": sum(1 for c in working if c["opts"].get("ua") == VLC_UA), "livetv_channels": len(mix),
             "failures": dict(sorted(REASONS.items(), key=lambda kv: -kv[1])[:15]),
             "livetv_groups": {t: sum(1 for _, g in mix if g == t) for _, t, _ in MIX},
             "by_country": dict(sorted(counts.items(), key=lambda kv: -kv[1]))}
    with open(os.path.join(OUT, "playlists.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=1, ensure_ascii=False)
    print(json.dumps({k: v for k, v in stats.items() if k != "by_country"}, indent=1))


if __name__ == "__main__":
    main()
