#!/usr/bin/env python3
"""
Builds docs/PakistanLive.m3u (tv.bulkbazaar.ca/PakistanLive.m3u): the 24/7 live streams that
Pakistani channels run on their own YouTube channels (Geo News, ARY News...), for channels
that have no working stream in our lists. Live TV adds them after its Pakistani channels and
plays them in YouTube's own player, as YouTube's terms require.

A channel's live video changes whenever it restarts its stream, so this runs every few hours.
A channel that isn't live is left out until it is again. Each channel is found by its exact
name (see build_dramas.channel_id), so only the channel's own uploads are used.

Standard library only. Run: python3 tools/build_live.py
"""
import html
import os
import re
import sys

from build_dramas import DOCS, channel_id, fetch

# (name in Live TV, the YouTube channel's exact name, genre)
LIVE_CHANNELS = [
    ("Geo News", "Geo News", "News"),
    ("Geo News English", "Geo News English", "News"),
    ("ARY News", "ARY News", "News"),
    ("Express News", "Express News", "News"),
    ("92 News", "92 News HD", "News"),
    ("Hum News", "HUM News", "News"),
    ("GNN", "GNN", "News"),
    ("Aaj News", "Aaj News", "News"),
    ("BOL News", "BOL News", "News"),
    ("Suno News", "SUNO NEWS HD", "News"),
    ("ARY Digital", "ARY Digital HD", "Entertainment"),
    ("Kids Land Urdu", "Kids Land", "Kids"),
]
LIVE_BADGE = "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE"
# The channel's round-the-clock stream, rather than a press conference it is also streaming.
ALWAYS_ON = re.compile(r"24\s*/\s*7|24x7|24×7|non-?stop", re.IGNORECASE)


def live_videos(page):
    """(video id, title) of each video on a channel's Live tab that is live now, in page order."""
    marks = [(m.start(), m.group(1)) for m in re.finditer(r'"videoId":"([\w-]{11})"', page)]
    text = {}
    for n, (start, vid) in enumerate(marks):
        # The page from this mention to the next mention of another video belongs to this video.
        end = next((s for s, v in marks[n + 1:] if v != vid), len(page))
        text[vid] = text.get(vid, "") + page[start:end]
    out = []
    for vid, chunk in text.items():
        if LIVE_BADGE not in chunk:
            continue
        title = (re.search(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', chunk)
                 or re.search(r'"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', chunk))
        out.append((vid, html.unescape(title.group(1)) if title else ""))
    return out


def main():
    lines = []
    for name, query, genre in LIVE_CHANNELS:
        _, cid = channel_id([], query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        try:
            live = live_videos(fetch(f"https://www.youtube.com/channel/{cid}/streams", tries=2))
        except Exception as e:  # noqa: BLE001
            print(f"  {name}: Live tab failed ({e})", file=sys.stderr)
            continue
        if not live:
            print(f"{name} ({cid}): not live now; left out", file=sys.stderr)
            continue
        vid, title = next((v for v in live if ALWAYS_ON.search(v[1])), live[0])
        print(f"{name} ({cid}): {vid} {title[:70]!r} ({len(live)} live)")
        lines.append(f'#EXTINF:-1 tvg-logo="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" tvg-country="PK" '
                     f'tvg-language="Urdu" tvg-genre="{genre}" group-title="Pakistani",{name}')
        lines.append(f"https://www.youtube.com/watch?v={vid}")
    print(f"{len(lines) // 2} of {len(LIVE_CHANNELS)} channels live")
    if not lines:
        sys.exit("No channel was live (or YouTube couldn't be read); keeping the last list.")
    with open(os.path.join(DOCS, "PakistanLive.m3u"), "w", encoding="utf-8") as f:
        f.write("\n".join(["#EXTM3U", "# Pakistani channels' own 24/7 live streams on their YouTube channels."] + lines) + "\n")


if __name__ == "__main__":
    main()
