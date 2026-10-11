#!/usr/bin/env python3
"""
The Weather section's videos (NextGen Cable 1.10.20): the newest weather videos from the weather channels'
own YouTube channels (The Weather Network, The Weather Channel, AccuWeather), for the Video tab.

The app plays them in YouTube's embedded player inside our locked film page (docs/channel/film.html),
like the Library, so nothing is downloaded or re-hosted. Only videos that play in an embedded player are
listed (tools/playable.py), and the job runs the pre-air check on the list before it's published.

Writes docs/weather/videos.json (tv.bulkbazaar.ca/weather/videos.json):
  {"updated": "...", "channels": {name: channel id}, "videos": [{"id", "title", "channel", "published"}]}

Standard library only. Run: python3 tools/build_weather_videos.py
"""
import datetime as dt
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dramas import channel_id, fetch  # noqa: E402
from playable import plays  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "weather", "videos.json")
CHANNELS = [
    ("The Weather Network", ["@weathernetwork", "@TheWeatherNetwork"]),
    ("The Weather Channel", ["@weatherchannel", "@TheWeatherChannel"]),
    ("AccuWeather", ["@accuweather", "@AccuWeather"]),
]
KEEP_DAYS = 14
MOST = 40


def feed(cid):
    """(id, title, published unix time) for the channel's newest uploads."""
    xml = fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}", tries=2)
    out = []
    for entry in re.findall(r"<entry>(.*?)</entry>", xml, re.S):
        vid = re.search(r"<yt:videoId>([\w-]{11})</yt:videoId>", entry)
        title = re.search(r"<media:title>(.*?)</media:title>", entry, re.S)
        when = re.search(r"<published>([^<]+)</published>", entry)
        if not (vid and title and when):
            continue
        try:
            published = int(dt.datetime.fromisoformat(when.group(1).replace("Z", "+00:00")).timestamp())
        except ValueError:
            continue
        out.append((vid.group(1), html.unescape(title.group(1)).strip(), published))
    return out


def main():
    try:
        old = json.load(open(OUT, encoding="utf-8"))
    except (OSError, ValueError):
        old = {}
    known = old.get("channels", {})
    cutoff = dt.datetime.now(dt.timezone.utc).timestamp() - KEEP_DAYS * 86400
    videos, ids = [], {}
    for name, handles in CHANNELS:
        cid = known.get(name)
        if not cid:
            try:
                found = channel_id(handles, name)
            except Exception as e:  # noqa: BLE001
                print(f"{name}: {e}", file=sys.stderr)
                found = None
            cid = found[1] if found else None
        if not cid:
            print(f"{name}: channel not found; skipped", file=sys.stderr)
            continue
        ids[name] = cid
        try:
            items = feed(cid)
        except Exception as e:  # noqa: BLE001
            print(f"{name}: feed failed ({e})", file=sys.stderr)
            continue
        for vid, title, published in items:
            # Shorts are upright clips; the TV shows wide videos.
            if published < cutoff or "#shorts" in title.lower():
                continue
            videos.append({"id": vid, "title": title, "channel": name, "published": published})
        print(f"{name}: {len(items)} in the feed")
    videos.sort(key=lambda v: -v["published"])
    seen, keep = set(), []
    for v in videos:
        if v["id"] in seen or not plays(v["id"]):
            continue
        seen.add(v["id"])
        keep.append(v)
        if len(keep) >= MOST:
            break
    if not keep and old.get("videos"):
        print("Nothing found this time; the old list stays.", file=sys.stderr)
        return
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"), "channels": {**known, **ids},
                   "videos": keep}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"{len(keep)} weather videos written.")


if __name__ == "__main__":
    main()
