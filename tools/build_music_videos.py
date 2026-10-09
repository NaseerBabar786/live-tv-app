#!/usr/bin/env python3
"""
Builds Spark TV's block of popular music videos (the owner's wish, 2026-10-06): the newest official
videos in Hindi and Urdu (since 2026-10-07: the owner wants Spark TV 100% Urdu and Hindi) from the music labels' and artists' own YouTube channels,
played in YouTube's own player, locked like Spark Hits (docs/channel/block.html). Nothing is
downloaded or re-hosted.

Like the upcoming trailers (tools/build_trailers.py), Spark TV's schedule holds one entry of kind
"music" pointing at docs/channel/music-videos.json, and the app and the website put this list in
its place, so the block changes every day.

Writes docs/channel/music-videos.json. Standard library only.
Run: python3 tools/build_music_videos.py
"""
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dramas import channel_id  # noqa: E402
from build_trailers import uploads  # noqa: E402
from build_youtube_channels import other_language  # noqa: E402
from titles import screen_title  # noqa: E402
from playable import keep_playable  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "channel", "music-videos.json")

# Songs from the last this many days only: Spark TV One is a newly launched channel with fresh content
# (the owner, 2026-10-08). Was 180.
MAX_DAYS = 90
SECS = (100, 420)
# The whole block, about 50 minutes.
TARGET_SECS = 50 * 60
# At most this many songs from one channel, so the block has variety.
PER_SOURCE = 4

KEEP = re.compile(r"official (music )?video|\(official\)|music video|full video|video song|official song|coke studio|\| ?video\b", re.I)
SKIP = re.compile(r"lyric|lyrical|audio|visuali[sz]er|jukebox|full album|non ?stop|mashup|remix|slowed|reverb|8d|"
                  r"behind the scenes|\bbts\b|making|teaser|trailer|reaction|interview|\blive\b|concert|#shorts?\b|\bshorts\b|"
                  r"explicit|\buncensored\b|karaoke|instrumental|cover\b|tutorial|dance practice|backstage|"
                  # Old songs the labels put up again in a new picture quality, or as golden oldies.
                  r"8k ?/ ?4k|4k ?/ ?8k|remaster|evergreen|old is gold|golden era|retro|classic|throwback|\b[6-9]0'?s\b", re.I)
# A song whose title names a year before last year is an old song.
OLD_YEAR = re.compile(r"\b(19[3-9]\d|20[0-4]\d)\b")

LANGUAGES = [
    ("Hindi", "مقبول ہندی گانے", [
        ("T-Series", ["@tseries"], "T-Series"),
        ("Saregama", ["@saregamamusic", "@SaregamaMusic"], "Saregama"),
        ("Zee Music", ["@zeemusiccompany", "@ZeeMusicCompany"], "Zee Music"),
        ("Sony Music India", ["@SonyMusicIndia", "@sonymusicindiaVEVO"], "Sony Music India"),
        ("Tips", ["@tipsofficial", "@TipsMusic"], "Tips"),
        ("YRF", ["@yrf", "@YRFMusic"], "YRF"),
    ]),
    ("Urdu", "مقبول اردو گانے", [
        ("Coke Studio Pakistan", ["@cokestudio", "@CokeStudioPakistan"], "Coke Studio"),
        ("Atif Aslam", ["@AtifAslam", "@atifaslam"], "Atif Aslam"),
        ("Asim Azhar", ["@AsimAzharOfficial", "@AsimAzhar"], "Asim Azhar"),
        ("Ali Zafar", ["@AliZafarOfficial", "@alizafar"], "Ali Zafar"),
        ("Velo Sound Station", ["@VeloSoundStation", "@velosoundstation"], "Velo Sound Station"),
        ("Rahat Fateh Ali Khan", ["@RahatFatehAliKhan", "@RFAKOfficial"], "Rahat Fateh Ali Khan"),
    ]),
]


def language(lang, sources, today, old):
    found = []
    for source, handles, name in sources:
        _, chan = channel_id(handles, name)
        if not chan:
            print(f"{source}: channel not found", file=sys.stderr)
            continue
        try:
            videos = uploads(f"https://www.youtube.com/channel/{chan}/videos")
        except Exception as e:  # noqa: BLE001
            print(f"  {source}: {e}", file=sys.stderr)
            continue
        kept = 0
        for vid, title, secs, age in videos:
            if kept >= PER_SOURCE:
                break
            if not KEEP.search(title) or SKIP.search(title) or other_language(title) or \
                    any(int(y) < today.year - 1 for y in OLD_YEAR.findall(title)):
                continue
            if secs is None or not SECS[0] <= secs <= SECS[1] or any(v["id"] == vid for v in found):
                continue
            first = old.get(vid, {}).get("found", today.isoformat())
            # Only songs whose upload date YouTube shows (2026-10-08), so an old song never counts as new.
            if age is None or age > MAX_DAYS:
                continue
            found.append({"id": vid, "title": screen_title(title, source), "label": source, "lang": lang, "secs": secs,
                          "age": age, "found": first, "kind": "music"})
            kept += 1
            print(f"    {age if age is not None else '?':>3} days  {title}")
        print(f"{lang} · {source}: {len(videos)} videos, {kept} kept")
    return found


def main():
    today = dt.date.today()
    old = {}
    if os.path.exists(OUT):
        old = {v["id"]: v for v in json.load(open(OUT, encoding="utf-8")).get("videos", [])}
    lists = [(lang, label, language(lang, sources, today, old)) for lang, label, sources in LANGUAGES]
    # Only videos that play in an embedded player (Spark TV's block page): tools/playable.py.
    lists = [(lang, label, keep_playable(videos)) for lang, label, videos in lists]
    # An equal share for each language; one with too few songs leaves its share to the others.
    # Within a language the channels take turns, newest songs first.
    chosen = {lang: [] for lang, _, _ in lists}
    used, share = 0, TARGET_SECS // len(lists)
    for lang, _, videos in lists:
        by_source = {}
        for v in sorted(videos, key=lambda v: v["age"] if v["age"] is not None else 999):
            by_source.setdefault(v["label"], []).append(v)
        mixed = [v for row in __import__("itertools").zip_longest(*by_source.values()) for v in row if v]
        videos[:] = mixed
    for rnd in range(2):
        for lang, _, videos in lists:
            have = sum(v["secs"] for v in chosen[lang])
            for v in videos:
                if v in chosen[lang] or used + v["secs"] > TARGET_SECS or (rnd == 0 and have + v["secs"] > share):
                    continue
                chosen[lang].append(v)
                have += v["secs"]
                used += v["secs"]
    block = []
    for lang, label, videos in lists:
        for i, v in enumerate(v for v in videos if v in chosen[lang]):
            item = {k: v[k] for k in ("id", "title", "label", "lang", "secs", "found", "kind")}
            if i == 0:
                item["section"] = label
            block.append(item)
    counts = ", ".join(f"{lang} {len(chosen[lang])}" for lang, _, _ in lists)
    total = sum(v["secs"] for v in block)
    summary = f"{len(block)} music videos, {total // 60} min ({counts})"
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::notice title=Music videos::{summary}")
    for v in block:
        print(f"  {v['lang']:8} {v['secs']:4}s  {v['label']:22} {v['title']}")
    if len(block) < 8:
        sys.exit(f"Too few music videos ({summary}); keeping the old list.")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"name": "مقبول گانے", "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "secs": total, "videos": block}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {summary}")


if __name__ == "__main__":
    main()
