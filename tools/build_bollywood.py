#!/usr/bin/env python3
"""
Builds the song list of Spark Hits, our music channel of film songs (channel 4 in Cable TV).

The songs are the music labels' own uploads on their official YouTube channels (T-Series,
Saregama, Zee Music, Sony Music India, Tips, YRF, Coke Studio...), which they publish free
for anyone to watch. They play in YouTube's own embedded player on
tv.bulkbazaar.ca/channel/bollywood.html (also inside the app), one after another, so
nothing is downloaded or re-hosted, as YouTube's terms require.

Only songs are kept: 2 to 9 minutes long, not trailers, teasers, jukeboxes, shorts or
full films. Songs found on earlier runs are kept for KEEP_DAYS, so the list builds up.

Writes docs/channel/bollywood.json. Standard library only.
Run: python3 tools/build_bollywood.py
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dramas import channel_id, videos_feed, videos_page  # noqa: E402
from build_youtube_channels import other_language  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "channel", "bollywood.json")
KEEP_DAYS = 180
MAX_SONGS = 400

# (label, handles, name its YouTube channel must carry)
LABELS = [
    ("T-Series", ["@tseries"], "T-Series"),
    ("Saregama", ["@saregamamusic", "@SaregamaMusic"], "Saregama"),
    ("Zee Music", ["@zeemusiccompany", "@ZeeMusicCompany"], "Zee Music"),
    ("Sony Music India", ["@SonyMusicIndia", "@sonymusicindiaVEVO"], "Sony Music India"),
    ("Tips", ["@tipsofficial", "@TipsMusic"], "Tips"),
    ("YRF", ["@yrf", "@YRFMusic"], "YRF"),
    ("Coke Studio Pakistan", ["@cokestudio", "@CokeStudioPakistan"], "Coke Studio"),
    ("Coke Studio Bharat", ["@CokeStudioBharat"], "Coke Studio Bharat"),
    ("Speed Records", ["@SpeedRecords"], "Speed Records"),
]
NOT_SONG = re.compile(r"trailer|teaser|jukebox|full (movie|film|album)|making|behind the scenes|reaction|"
                      r"#shorts?\b|promo|interview|non ?stop|mashup|\blive\b|audio|motion poster|"
                      r"announcement|\bbts\b|first look|dialogue|scene", re.I)


def main():
    today = dt.date.today()
    old = {}
    if os.path.exists(OUT):
        old = {s["id"]: s for s in json.load(open(OUT, encoding="utf-8")).get("songs", [])}

    found = {}
    for label, handles, name in LABELS:
        _, cid = channel_id(handles, name)
        if not cid:
            print(f"{label}: channel not found", file=sys.stderr)
            continue
        videos = []
        for url in (f"https://www.youtube.com/channel/{cid}/videos",
                    f"https://www.youtube.com/channel/{cid}/search?query=official+video+song"):
            try:
                videos += videos_page(url)
            except Exception as e:  # noqa: BLE001
                print(f"  {url}: {e}", file=sys.stderr)
        if not videos:
            try:
                videos = videos_feed(cid)
            except Exception as e:  # noqa: BLE001
                print(f"  feed: {e}", file=sys.stderr)
        kept = 0
        for vid, title, mins in videos:
            # Urdu, Hindi, Punjabi and English songs only (the owner's wish, 2026-10-06).
            if NOT_SONG.search(title) or vid in found or other_language(title):
                continue
            # The feed has no lengths; a song from it is kept on its title alone.
            if mins is not None and not 2 <= mins <= 9:
                continue
            found[vid] = {"id": vid, "title": title.strip(), "label": label,
                          "found": old.get(vid, {}).get("found", today.isoformat())}
            kept += 1
        print(f"{label}: {len(videos)} videos, {kept} songs")

    for vid, s in old.items():
        if vid not in found and not other_language(s["title"]) and (today - dt.date.fromisoformat(s["found"])).days <= KEEP_DAYS:
            found[vid] = s
    songs = sorted(found.values(), key=lambda s: s["found"], reverse=True)[:MAX_SONGS]
    if len(songs) < 10:
        sys.exit("Too few songs; keeping the old list.")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"name": "Spark Hits", "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "songs": songs}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote docs/channel/bollywood.json: {len(songs)} songs")


if __name__ == "__main__":
    main()
