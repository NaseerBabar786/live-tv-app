#!/usr/bin/env python3
"""
Builds a playlist of the newest Pakistani drama episodes from the TV channels' own
official YouTube channels (ARY Digital, HUM TV, Geo Entertainment).

These are videos the channels publish for free themselves. Live TV plays them in
YouTube's own player (YouTube app on TVs, YouTube's embedded player on phones), so
nothing is downloaded or re-hosted, as YouTube's terms require.

Only full episodes are kept: titles with an episode number, not teasers, promos,
clips or OSTs, and (when YouTube says how long they are) at least MIN_MINUTES long.
Episodes found on earlier runs are kept for KEEP_DAYS, so each show builds up.

Writes (in docs/, served at tv.bulkbazaar.ca):
  Dramas.m3u     the playlist (built into Live TV's Movies & Series)
  dramas.json    every episode kept, with the day it was found, and counts

Standard library only. Run: python3 tools/build_dramas.py
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
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
MIN_MINUTES = 15
KEEP_DAYS = 120

# Each channel's YouTube handles, most likely first, then a YouTube channel search.
CHANNELS = [
    ("ARY Digital", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital"),
    ("HUM TV", ["@HUMTV", "@humtvofficial"], "HUM TV"),
    ("Geo Entertainment", ["@HARPALGEO", "@harpalgeoofficial"], "HAR PAL GEO"),
]

SKIP = re.compile(
    r"\b(teaser|promo|preview|trailer|ost|title song|best scene|scenes?|clip|highlights?|"
    r"bts|behind the scenes|review|reaction|shorts|making|interview|recap|status)\b|#shorts",
    re.IGNORECASE,
)
# "Episode 30 - Show Name - ..." (some channels put the number first).
EPISODE_FIRST = re.compile(r"^(?:Episode|Ep\.?)\s*(\d{1,4})\s*[-|:–]\s*([^|\-–\[]+)", re.IGNORECASE)
EPISODE = re.compile(r"^(.*?)[\s\-|:–]*\b(?:Episode|Epi|Ep\.?)\s*(\d{1,4})\b", re.IGNORECASE)
# Words that sit between the show name and "Episode" but aren't part of the name.
TAIL = re.compile(r"(?:[\s\-|:–]+|\b(?:2nd\s+)?last|\bmega|\bfinal|\bdouble)+$", re.IGNORECASE)


def fetch(url, tries=4):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if attempt + 1 == tries:
                raise
            print(f"  retry ({e}): {url}", file=sys.stderr)
            time.sleep(5 * 2 ** attempt)


def channel_id(handles, query):
    for handle in handles:
        try:
            page = fetch(f"https://www.youtube.com/{handle}", tries=2)
        except Exception as e:  # noqa: BLE001
            print(f"  {handle}: {e}", file=sys.stderr)
            continue
        m = re.search(r'"externalId":"(UC[\w-]{22})"', page) or re.search(r'channel_id=(UC[\w-]{22})', page)
        if m:
            return handle, m.group(1)
    try:
        page = fetch("https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": query, "sp": "EgIQAg=="}), tries=2)
        m = re.search(r'"channelRenderer":\{"channelId":"(UC[\w-]{22})"', page)
        if m:
            return f"search {query!r}", m.group(1)
    except Exception as e:  # noqa: BLE001
        print(f"  search {query!r}: {e}", file=sys.stderr)
    return None, None


def minutes(length):
    """ "38:12" or "1:02:03" to minutes; None when unknown."""
    if not length:
        return None
    total = 0
    for part in length.split(":"):
        if not part.isdigit():
            return None
        total = total * 60 + int(part)
    return total / 60


def _text(raw):
    return json.loads(f'"{raw}"')


def videos_page(url):
    """Videos on a channel page (its Videos tab or a search in the channel): (id, title, minutes).

    Reads both of the page layouts YouTube serves: the older videoRenderer and the
    newer lockupViewModel.
    """
    page = fetch(url)
    out, seen = [], set()
    for m in re.finditer(r'"videoRenderer":\{"videoId":"([\w-]{11})"', page):
        chunk = page[m.end():m.end() + 6000]
        title = re.search(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', chunk)
        length = re.search(r'"lengthText":\{.*?"simpleText":"([\d:]+)"', chunk)
        if title and m.group(1) not in seen:
            seen.add(m.group(1))
            out.append((m.group(1), _text(title.group(1)), minutes(length.group(1)) if length else None))
    for m in re.finditer(r'"lockupViewModel":\{', page):
        chunk = page[m.end():m.end() + 12000]
        vid = re.search(r'"contentId":"([\w-]{11})"', chunk)
        if not vid or vid.group(1) in seen or "LOCKUP_CONTENT_TYPE_VIDEO" not in chunk[:12000]:
            continue
        title = re.search(r'"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', chunk)
        length = re.search(r'"text":"(\d{1,2}:\d{2}(?::\d{2})?)"', chunk)
        if title:
            seen.add(vid.group(1))
            out.append((vid.group(1), _text(title.group(1)), minutes(length.group(1)) if length else None))
    if not out:
        markers = {k: page.count(k) for k in ("videoRenderer", "lockupViewModel", "consent", "ytInitialData")}
        print(f"  no videos read from the page ({len(page)} bytes, {markers})", file=sys.stderr)
    return out


def videos_feed(cid):
    """The channel's 15 newest uploads from its RSS feed (no lengths)."""
    feed = fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={cid}")
    ids = re.findall(r"<yt:videoId>([\w-]{11})</yt:videoId>", feed)
    titles = [html.unescape(t) for t in re.findall(r"<media:title>(.*?)</media:title>", feed)]
    return [(i, t, None) for i, t in zip(ids, titles)]


def episode(title):
    """(show, number) for a full-episode title; None for anything else."""
    if SKIP.search(title):
        return None
    m = EPISODE.match(title.strip())
    first = EPISODE_FIRST.match(title.strip())
    if m and m.group(1).strip(" -|:–"):
        show, number = TAIL.sub("", m.group(1)).strip(" -|:–"), m.group(2)
    elif first:
        show, number = first.group(2).strip(), first.group(1)
    else:
        return None
    if not 2 <= len(show) <= 50:
        return None
    return show, int(number)


def main():
    state_path = os.path.join(DOCS, "dramas.json")
    try:
        with open(state_path, encoding="utf-8") as f:
            kept = json.load(f).get("videos", {})
    except (OSError, ValueError):
        kept = {}
    today = dt.date.today()

    found = 0
    for name, handles, query in CHANNELS:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        # The Videos tab has the newest uploads (mostly clips); a search in the
        # channel for "episode" finds more full episodes.
        for url in (f"https://www.youtube.com/channel/{cid}/videos",
                    f"https://www.youtube.com/channel/{cid}/search?query=episode"):
            try:
                for v in videos_page(url):
                    if v[0] not in seen:
                        seen.add(v[0])
                        videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"  {name}: {url} failed ({e})", file=sys.stderr)
        if not videos:
            try:
                videos = videos_feed(cid)
            except Exception as e:  # noqa: BLE001
                print(f"  {name} feed failed ({e})", file=sys.stderr)
        # Fill in earlier episodes of each show found, with a search in the channel for it.
        shows = sorted({ep[0] for ep in (episode(t) for _, t, _ in videos) if ep})
        for show in shows[:15]:
            url = f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": f"{show} episode"})
            try:
                for v in videos_page(url):
                    ep = episode(v[1])
                    if v[0] not in seen and ep and ep[0].lower() == show.lower():
                        seen.add(v[0])
                        videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"  {name}: search for {show!r} failed ({e})", file=sys.stderr)
        new = 0
        skipped = []
        for vid, title, mins in videos:
            ep = episode(title)
            if not ep or (mins is not None and mins < MIN_MINUTES):
                skipped.append(f"{title} ({mins and round(mins)} min)")
                continue
            if vid not in kept:
                kept[vid] = {"show": ep[0], "episode": ep[1], "channel": name, "title": title, "added": today.isoformat()}
                new += 1
            found += 1
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {new} new episodes")
        for t in skipped[:6]:
            print(f"    skipped: {t}")

    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    kept = {k: v for k, v in kept.items() if v["added"] >= cutoff}
    rows = sorted(kept.items(), key=lambda kv: (kv[1]["channel"], kv[1]["show"].lower(), kv[1]["episode"]))

    lines = ["#EXTM3U", "# Pakistani drama episodes from the channels' official YouTube uploads."]
    for vid, v in rows:
        lines.append(f'#EXTINF:-1 tvg-logo="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" '
                     f'group-title="{v["channel"]} dramas",{v["show"]} Episode {v["episode"]}')
        lines.append(f"https://www.youtube.com/watch?v={vid}")
    with open(os.path.join(DOCS, "Dramas.m3u"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    shows = {(v["channel"], v["show"]) for v in kept.values()}
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump({"built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "shows": len(shows), "episodes": len(kept), "videos": kept}, f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"Wrote docs/Dramas.m3u: {len(shows)} shows, {len(kept)} episodes")
    if not kept:
        sys.exit("No episodes found; keeping the build red so the old playlist isn't replaced.")


if __name__ == "__main__":
    main()
