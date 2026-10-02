#!/usr/bin/env python3
"""
Builds a playlist of free films and shows that their makers share openly, for Live TV's
Library. Every source here is public domain or freely licensed by its owner:

  * Wikimedia Commons: public-domain and Creative Commons films and documentaries
    (played from Commons' own WebM copies).
  * NASA: NASA's own videos, which are public domain (MP4).
  * Vimeo Staff Picks: short films their makers post on Vimeo; they play in Vimeo's
    embedded player, as Vimeo allows.
  * PeerTube: films on PeerTube sites under a Creative Commons or public-domain licence,
    found with the SepiaSearch index (MP4).

Nothing that is already in Movies.m3u or Dramas.m3u is listed again, and each title is
listed once, so the Library never shows a film twice.

Writes (in docs/, served at tv.bulkbazaar.ca):
  Free.m3u    the playlist (built into Live TV's Library)
  free.json   counts and the time it was built

Standard library only. Run: python3 tools/build_free.py
"""
import datetime as dt
import html
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
USER_AGENT = "LiveTV-playlist-builder/1.0 (+https://tv.bulkbazaar.ca)"

COMMONS = "https://commons.wikimedia.org/w/api.php"
# Commons searches for full films and documentaries (deepcat: also looks in subcategories).
COMMONS_SEARCHES = [
    ('filetype:video deepcat:"Feature films"', "Movies"),
    ('filetype:video deepcat:"Films in the public domain"', "Movies"),
    ('filetype:video deepcat:"Silent films"', "Movies"),
    ('filetype:video deepcat:"Documentary films"', "Shows"),
]
MIN_FILM_SECONDS = 40 * 60
MIN_SHOW_SECONDS = 10 * 60

NASA = "https://images-api.nasa.gov"
NASA_QUERIES = ["documentary", "NASA Explorers", "ScienceCasts", "Space Station documentary"]
MAX_NASA = 80
MIN_NASA_SECONDS = 3 * 60

VIMEO_FEEDS = [("https://vimeo.com/channels/staffpicks/videos/rss", "Vimeo Staff Picks")]

SEPIA = "https://sepiasearch.org/api/v1/search/videos"
# PeerTube licence ids: 1-6 are Creative Commons licences, 7 is public domain.
FREE_LICENCES = [1, 2, 3, 4, 5, 6, 7]
# Stock-footage codes and ads in titles.
JUNK = re.compile(r"\b[A-Z]{1,3}\d{4,}[a-z]?\b|\bpromo(tional)?\b|\bcommercial\b|\bstock footage\b|\btier list\b"
                  r"|\btraining films?\b|\breaction\b|\breview\b|\bmusic video\b|this week @nasa|\ba year of\b"
                  r"|\bbudget\b|\bpinkfong\b|\bcocomelon\b", re.I)
# Titles in other scripts (Russian, Chinese...) aren't in the Library's four languages.
OTHER_SCRIPT = re.compile(r"[\u0400-\u04ff\u0370-\u03ff\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af\u0e00-\u0e7f]")
PEERTUBE_LANGUAGES = {"en": "English", "hi": "Hindi", "ur": "Urdu", "pa": "Punjabi"}


def fetch(url, tries=4, data=None):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, data=data, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if attempt + 1 == tries:
                raise
            print(f"  retry ({e}): {url[:100]}", file=sys.stderr)
            time.sleep(5 * 2 ** attempt)


def get_json(url):
    return json.loads(fetch(url))


def compact(text):
    """A title reduced to its letters and digits, the way Live TV matches titles."""
    text = re.sub(r"\(.*?\)|\[.*?\]", " ", (text or "").lower())
    text = re.sub(r"\b(the|full movie|full episode|hd|4k)\b", " ", text)
    return "".join(ch for ch in text if ch.isalnum())


def clean_title(name):
    name = name.strip().strip('"“”').strip()
    name = re.sub(r"\.(webm|ogv|ogg|mp4|mpg|mpeg)$", "", name, flags=re.I)
    name = re.sub(r"^File:", "", name)
    name = name.replace("_", " ")
    name = re.sub(r"\s+", " ", name).strip(" -|:")
    return name[:90]


def known_titles():
    """(language, title key) of everything in the other two built-in lists."""
    known = set()
    for file in ("Movies.m3u", "Dramas.m3u"):
        try:
            with open(os.path.join(DOCS, file), encoding="utf-8") as f:
                for line in f:
                    if line.startswith("#EXTINF"):
                        lang = re.search(r'tvg-language="([^"]*)"', line)
                        known.add(((lang.group(1) if lang else "English"), compact(line.rsplit(",", 1)[-1])))
        except OSError:
            pass
    return known


def commons():
    """Films and documentaries on Wikimedia Commons, with a WebM copy Android can play."""
    out = []
    seen = set()
    for category, genre in COMMONS_SEARCHES:
        params = {
            "action": "query", "format": "json", "generator": "search", "gsrsearch": category,
            "gsrnamespace": "6", "gsrlimit": "50", "prop": "videoinfo",
            "viprop": "url|mediatype|size|derivatives|extmetadata", "viurlwidth": "640",
        }
        cont, count = {}, 0
        for _ in range(8):
            try:
                data = get_json(COMMONS + "?" + urllib.parse.urlencode({**params, **cont}))
            except Exception as e:  # noqa: BLE001
                print(f"  Commons {category}: {e}", file=sys.stderr)
                break
            for page in (data.get("query", {}).get("pages") or {}).values():
                if page.get("title") in seen:
                    continue
                seen.add(page.get("title"))
                info = (page.get("videoinfo") or [{}])[0]
                if info.get("mediatype") != "VIDEO":
                    continue
                seconds = float(info.get("duration") or 0)
                if seconds < (MIN_FILM_SECONDS if genre == "Movies" else MIN_SHOW_SECONDS):
                    continue
                meta = info.get("extmetadata") or {}
                licence = (meta.get("LicenseShortName") or {}).get("value", "")
                if not re.search(r"public domain|cc0|cc[ -]by", licence, re.I):
                    continue
                # Commons' own re-encodings: the 720p or 480p VP9/VP8 WebM plays on Android.
                webms = [d for d in info.get("derivatives") or [] if d.get("src", "").endswith(".webm")]
                webms.sort(key=lambda d: (int(d.get("height") or 0) > 720, -int(d.get("height") or 0)))
                src = webms[0]["src"] if webms else (info.get("url") if info.get("url", "").endswith(".webm") else None)
                if not src:
                    continue
                title = clean_title(html.unescape(re.sub("<[^>]+>", "", (meta.get("ObjectName") or {}).get("value", "")))
                                    or page.get("title", ""))
                out.append({"name": title, "url": src, "logo": info.get("thumburl", ""), "language": "English",
                            "genre": genre, "group": "Wikimedia Commons", "source": "commons"})
                count += 1
            cont = data.get("continue") or {}
            if not cont:
                break
        print(f"Commons {category}: {count} videos")
    return out


def nasa():
    """NASA's own videos (public domain), largest MP4 up to 720p."""
    out, seen = [], set()
    for q in NASA_QUERIES:
        try:
            items = get_json(f"{NASA}/search?" + urllib.parse.urlencode({"q": q, "media_type": "video", "page_size": 50}))
        except Exception as e:  # noqa: BLE001
            print(f"  NASA {q!r}: {e}", file=sys.stderr)
            continue
        for item in items.get("collection", {}).get("items", []):
            data = (item.get("data") or [{}])[0]
            nid = data.get("nasa_id")
            if not nid or nid in seen or len(out) >= MAX_NASA:
                continue
            seen.add(nid)
            try:
                files = get_json(urllib.parse.quote(item["href"], safe=":/?=&%"))
            except Exception as e:  # noqa: BLE001
                print(f"  NASA {nid}: {e}", file=sys.stderr)
                continue
            mp4 = next((f for want in ("~large.mp4", "~medium.mp4", "~orig.mp4") for f in files if f.endswith(want)), None)
            if not mp4:
                continue
            preview = next((l.get("href") for l in item.get("links") or [] if l.get("rel") == "preview"), "")
            out.append({"name": clean_title(data.get("title", nid)),
                        "url": urllib.parse.quote(mp4.replace("http://", "https://"), safe=":/?=&%~"),
                        "logo": preview, "language": "English", "genre": "Shows", "group": "NASA", "source": "nasa"})
        print(f"NASA {q!r}: {len(out)} videos so far")
    return out


def vimeo():
    """Short films from Vimeo Staff Picks, played in Vimeo's own player."""
    out = []
    for feed, group in VIMEO_FEEDS:
        try:
            xml = fetch(feed)
        except Exception as e:  # noqa: BLE001
            print(f"  Vimeo {feed}: {e}", file=sys.stderr)
            continue
        for item in re.findall(r"<item>(.*?)</item>", xml, re.S):
            link = re.search(r"<link>\s*(https://vimeo\.com/[^<\s]*?(\d{5,12}))\s*</link>", item)
            title = re.search(r"<title>(.*?)</title>", item, re.S)
            if not (link and title):
                continue
            thumb = re.search(r'<media:thumbnail[^>]*url="([^"]+)"', item)
            name = clean_title(html.unescape(re.sub(r"<!\[CDATA\[|\]\]>", "", title.group(1))))
            out.append({"name": name, "url": f"https://vimeo.com/{link.group(2)}", "logo": thumb.group(1) if thumb else "",
                        "language": "English", "genre": "Movies", "group": "Short films", "source": "vimeo"})
        print(f"Vimeo {group}: {len(out)} films")
    return out


def peertube():
    """Freely licensed films on PeerTube sites (SepiaSearch), as MP4 files."""
    out = []
    for lang, language in PEERTUBE_LANGUAGES.items():
        query = [("search", "film"), ("categoryOneOf", "2"), ("durationMin", str(MIN_FILM_SECONDS)),
                 ("languageOneOf", lang), ("count", "50"), ("sort", "-views")]
        query += [("licenceOneOf", str(i)) for i in FREE_LICENCES]
        try:
            found = get_json(SEPIA + "?" + urllib.parse.urlencode(query)).get("data", [])
        except Exception as e:  # noqa: BLE001
            print(f"  PeerTube {lang}: {e}", file=sys.stderr)
            continue
        count = 0
        for v in found:
            if (v.get("licence") or {}).get("id") not in FREE_LICENCES or v.get("isLive") or v.get("nsfw"):
                continue
            if JUNK.search(v.get("name") or "") or (v.get("name") or "").isupper():
                continue  # archive dumps ("PROMO FILM GG46255"), not films to watch
            host = (v.get("account") or {}).get("host") or (v.get("channel") or {}).get("host")
            if not host or not v.get("uuid"):
                continue
            try:
                full = get_json(f"https://{host}/api/v1/videos/{v['uuid']}")
            except Exception as e:  # noqa: BLE001
                print(f"  PeerTube {host}: {e}", file=sys.stderr)
                continue
            files = list(full.get("files") or [])
            for playlist in full.get("streamingPlaylists") or []:
                files += playlist.get("files") or []
            files = [f for f in files if (f.get("fileUrl") or "").endswith(".mp4")]
            files.sort(key=lambda f: (int((f.get("resolution") or {}).get("id") or 0) > 720,
                                      -int((f.get("resolution") or {}).get("id") or 0)))
            if not files:
                continue
            thumb = full.get("previewPath") or full.get("thumbnailPath") or ""
            out.append({"name": clean_title(v.get("name", "")), "url": files[0]["fileUrl"],
                        "logo": f"https://{host}{thumb}" if thumb else "", "language": language,
                        "genre": "Movies", "group": "PeerTube films", "source": "peertube"})
            count += 1
        print(f"PeerTube {language}: {len(found)} found, {count} with a file")
    return out


def main():
    known = known_titles()
    print(f"{len(known)} titles already in Movies.m3u and Dramas.m3u")
    items, skipped = [], 0
    seen = set(known)
    for item in commons() + nasa() + vimeo() + peertube():
        item["name"] = re.sub(r"\s+", " ", item["name"].replace(",", " ").replace('"', "")).strip()
        if JUNK.search(item["name"]) or OTHER_SCRIPT.search(item["name"]):
            skipped += 1
            continue
        key = (item["language"], compact(item["name"]))
        if not key[1] or key in seen:
            skipped += 1
            continue
        seen.add(key)
        items.append(item)
    items.sort(key=lambda i: (i["language"], i["genre"], i["group"], i["name"].lower()))

    lines = ["#EXTM3U", "# Free films and shows shared openly by their makers: Wikimedia Commons, NASA, Vimeo, PeerTube."]
    for i in items:
        name = i["name"]
        lines.append(f'#EXTINF:-1 tvg-logo="{i["logo"]}" tvg-language="{i["language"]}" tvg-genre="{i["genre"]}" '
                     f'group-title="{i["group"]}",{name}')
        lines.append(i["url"])
    counts = {}
    for i in items:
        counts[i["source"]] = counts.get(i["source"], 0) + 1
    print(f"Wrote docs/Free.m3u: {len(items)} items {counts}, {skipped} left out as already listed or repeated")
    if not items:
        sys.exit("Nothing found; keeping the build red so the old playlist isn't replaced.")
    with open(os.path.join(DOCS, "Free.m3u"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    with open(os.path.join(DOCS, "free.json"), "w", encoding="utf-8") as f:
        json.dump({"built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "items": len(items),
                   "sources": counts}, f, indent=1)
        f.write("\n")


if __name__ == "__main__":
    main()
