"""
Will a YouTube video play in an embedded player (Spark TV's locked block page)? The owner saw a film stuck on
"YouTube didn't start (error 150)" (2026-10-07): its owner had turned embedding off. The lists our builders write
(trailers, music videos, Spark TV's blocks) leave such videos out, the same way the nightly channel check does
(tools/check_channels.mjs): docs/channel/unplayable.json, and YouTube's oEmbed answer (401 = embedding turned off,
404 = removed or private). Any other answer, or no answer, counts as playable.
"""
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

CHANNEL = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "channel")
_known = None
_cache = {}


def _unplayable():
    global _known
    if _known is None:
        try:
            _known = set(json.load(open(os.path.join(CHANNEL, "unplayable.json"), encoding="utf-8")).get("ids", {}))
        except (OSError, ValueError):
            _known = set()
        # And what the hourly pre-air check found (tools/preair_check.py).
        try:
            _known |= set(json.load(open(os.path.join(CHANNEL, "preair-bad.json"), encoding="utf-8")).get("ids", {}))
        except (OSError, ValueError):
            pass
    return _known


def plays(video_id):
    if video_id in _unplayable():
        return False
    if video_id not in _cache:
        url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={video_id}")
        try:
            urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=15).close()
            _cache[video_id] = True
        except urllib.error.HTTPError as e:
            _cache[video_id] = e.code not in (401, 404)
        except Exception:
            _cache[video_id] = True
    return _cache[video_id]


def keep_playable(videos):
    """The videos (dicts with an "id") that will play embedded, in their order."""
    with ThreadPoolExecutor(8) as pool:
        ok = list(pool.map(lambda v: plays(v["id"]), videos))
    return [v for v, good in zip(videos, ok) if good]
