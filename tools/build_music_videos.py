#!/usr/bin/env python3
"""
Builds Bazaar TV's block of popular music videos (the owner's wish, 2026-10-06): the newest official
videos in Hindi and Urdu (since 2026-10-07: the owner wants Bazaar TV about 99% Urdu and Hindi) from the music labels' and artists' own YouTube channels,
played in YouTube's own player, locked like Bazaar Hits (docs/channel/block.html). Nothing is
downloaded or re-hosted.

Like the upcoming trailers (tools/build_trailers.py), Bazaar TV's schedule holds one entry of kind
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

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "channel", "music-videos.json")

# Songs from the last this many days (new music); a quiet channel's older songs still fill in.
MAX_DAYS = 180
SECS = (100, 420)
# The whole block, about 50 minutes.
TARGET_SECS = 50 * 60
# At most this many songs from one channel, so the block has variety.
PER_SOURCE = 4

KEEP = re.compile(r"official (music )?video|\(official\)|music video|full video|video song|official song|coke studio|\| ?video\b", re.I)
SKIP = re.compile(r"lyric|lyrical|audio|visuali[sz]er|jukebox|full album|non ?stop|mashup|remix|slowed|reverb|8d|"
                  r"behind the scenes|\bbts\b|making|teaser|trailer|reaction|interview|\blive\b|concert|#shorts?\b|\bshorts\b|"
                  r"explicit|\buncensored\b|karaoke|instrumental|cover\b|tutorial|dance practice|backstage", re.I)

LANGUAGES = [
    ("Hindi", "Popular Hindi music", [
        ("T-Series", ["@tseries"], "T-Series"),
        ("Saregama", ["@saregamamusic", "@SaregamaMusic"], "Saregama"),
        ("Zee Music", ["@zeemusiccompany", "@ZeeMusicCompany"], "Zee Music"),
        ("Sony Music India", ["@SonyMusicIndia", "@sonymusicindiaVEVO"], "Sony Music India"),
        ("Tips", ["@tipsofficial", "@TipsMusic"], "Tips"),
        ("YRF", ["@yrf", "@YRFMusic"], "YRF"),
    ]),
    ("Urdu", "Popular Urdu music", [
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
            if not KEEP.search(title) or SKIP.search(title) or other_language(title):
                continue
            if secs is None or not SECS[0] <= secs <= SECS[1] or any(v["id"] == vid for v in found):
                continue
            first = old.get(vid, {}).get("found", today.isoformat())
            if (age if age is not None else (today - dt.date.fromisoformat(first)).days) > MAX_DAYS:
                continue
            found.append({"id": vid, "title": title.strip(), "label": source, "lang": lang, "secs": secs,
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
        json.dump({"name": "Popular music videos", "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "secs": total, "videos": block}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {summary}")


if __name__ == "__main__":
    main()
