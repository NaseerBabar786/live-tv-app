#!/usr/bin/env python3
"""
Hindi TV serials for the Library's Hindi Series (owner, 2026-10-08: "only 8 programs are showing ...
fill that Hindi section"). Full episodes from the Indian channels' own official YouTube channels
(StarPlus, Sony SAB, Sony Pal, &TV, Colors, Dangal, Shemaroo Umang, Sun Neo, Doordarshan...).

These channels put the show's name in a different place in every title:
  "Gautam Gets Furious | Full Ep. 2 | Pandya Store"            (StarPlus: after the episode)
  "Sasural Simar Ka 2 |  Ep. 43 | The Grand Wedding ... | Colors TV"   (Colors: before it)
  "Tenali Rama - Ep 693 - Full Episode - 27th February 2020"   (Sony SAB)
  "काले तूफ़ान ... | Raazz Mahal Full Episode 14 | Shemaroo Umang Serial"
so build_dramas' "<Show> Episode N" pattern misses them. Here a title is cut into its parts, and
the show is the part that comes back in the channel's other titles (each episode's one-line story
is different every time). Text next to the episode number ("Raazz Mahal Full Episode 14") is the
show's name as it stands. Every show found is then searched in its channel for earlier episodes.

Used by build_dramas.main(); adds episodes to its kept dict in the same form as its own
channels. Run alone to print what it finds without writing anything:
    python3 tools/hindi_serials.py
"""
import collections
import re
import sys
import urllib.parse

# (name shown as the Library folder's channel, YouTube handles, channel name to match)
SERIAL_CHANNELS = [
    ("StarPlus", ["@StarPlus"], "StarPlus|Star Plus"),
    ("Sony SAB", ["@SonySAB", "@sabtv"], "Sony SAB"),
    ("Sony Pal", ["@SonyPal"], "Sony Pal"),
    ("Sony TV", ["@SETIndia"], "SET India|Sony Entertainment Television"),
    ("&TV", ["@andtvchannel"], "&TV|And TV"),
    ("Colors TV", ["@ColorsTV"], "Colors TV|Colors"),
    ("Dangal TV", ["@DangalTVChannel"], "Dangal TV|Dangal"),
    ("Shemaroo Umang", ["@ShemarooUmang"], "Shemaroo Umang"),
    ("Sun Neo", ["@SunNeo"], "Sun Neo"),
    ("Doordarshan National", ["@DoordarshanNational"], "Doordarshan National|DD National"),
]
MIN_MINUTES = 15
SEARCHES = ["full episode", "episode"]
MAX_SEARCHED_SHOWS = 30  # per channel, shows searched for their earlier episodes

EP = re.compile(r"(?:\bfull\s+)?\b(?:episode|epi|ep)s?\.?\s*[:#\-]?\s*(\d{1,4})\b", re.I)
# Words that are never a show's name: the channel's own name, "Full Episode", dates, labels.
NOISE = re.compile(
    r"#\S+|@\s?\S+|\bfull\s+(?:episodes?|ep\.?|hd)\b|\bnew\s+(?:episodes?|show)\b|\bdigital exclusive\b|"
    r"\b(?:hindi\s+)?(?:tv\s+)?serial\b|\bhindi drama(?: show)?\b|\b(?:family|supernatural hindi|hindi) drama\b|"
    r"\b(?:colors tv|dangal tv(?: channel)?|sun neo|shemaroo umang|starplus|star plus|sony sab|sony pal|sony tv|"
    r"set india|and tv|&tv|doordarshan national|dd national)\b|"
    r"\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*,?(?:\s+\d{2,4})?\b|"
    r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b|"
    r"\b(?:sign up for )?sony liv(?: on youtube)?\b|\bhd\b|\bfull\b|\bepisode\b|\bnew\b",
    re.I)
PARTS = re.compile(r"\s*[|｜]\s*")
DASHES = re.compile(r"\s+[-–—]\s+|[?!]\s*-\s*")


def parts(title):
    """The title's parts, and which one holds the episode number (None when there is none)."""
    raw = PARTS.split(title) if "|" in title or "｜" in title else DASHES.split(title)
    if len(raw) == 1:
        raw = DASHES.split(title)
    out, ep_at = [], None
    for p in raw:
        has_ep = bool(EP.search(p))
        text = NOISE.sub(" ", EP.sub(" ", p))
        text = re.sub(r"\s+", " ", text).strip(" -–—:,.|()[]'\"")
        if has_ep and ep_at is None:
            ep_at = len(out)
        out.append((text, has_ep))
    return out, ep_at


def key(text):
    return re.sub(r"[^\w]", "", text.lower())


def usable(text):
    k = key(text)
    return 2 <= len(text) <= 50 and k and not k.isdigit()


def show_of(title, counts):
    """(show, episode) for a full-episode title, using how often each part appears in the channel."""
    m = EP.search(title)
    if not m:
        return None
    ps, ep_at = parts(title)
    if ep_at is not None:
        text, _ = ps[ep_at]
        # "Raazz Mahal Full Episode 14": the name stands next to the number.
        if usable(text) and counts[key(text)] >= 2:
            return text, int(m.group(1))
    best = None
    for i, (text, _) in enumerate(ps):
        if not usable(text) or counts[key(text)] < 2:
            continue
        rank = (counts[key(text)], -abs(i - (ep_at if ep_at is not None else i)))
        if best is None or rank > best[0]:
            best = (rank, text)
    if best:
        return best[1], int(m.group(1))
    if ep_at is not None and usable(ps[ep_at][0]) and len(ps) == 1:
        return ps[ep_at][0], int(m.group(1))  # "KBR EP 53"
    return None


def guesses(titles):
    """Parts likely to be show names (to search for), by where the name usually sits in this channel."""
    counts = count(titles)
    offsets = collections.Counter()
    for t in titles:
        ps, ep_at = parts(t)
        if ep_at is None:
            continue
        for i, (text, _) in enumerate(ps):
            if usable(text) and counts[key(text)] >= 2 and i != ep_at:
                offsets[i - ep_at] += 1
    out = collections.Counter()
    names = {}
    for t in titles:
        ps, ep_at = parts(t)
        if ep_at is None:
            continue
        # Until the channel's layout is known, both neighbours of the episode number are tried.
        near = [o for o, _ in offsets.most_common(2)] or [-1, 1]
        picks = [ps[ep_at][0]] + [ps[ep_at + o][0] for o in near if 0 <= ep_at + o < len(ps)]
        for text in picks:
            if usable(text):
                out[key(text)] += 1 + counts[key(text)]
                names.setdefault(key(text), text)
    return [names[k] for k, _ in out.most_common()]


def count(titles):
    counts = collections.Counter()
    for t in titles:
        ps, _ = parts(t)
        for k in {key(text) for text, _ in ps if usable(text)}:
            counts[k] += 1
    return counts


def collect(bd, cid, name):
    videos, seen = [], set()
    urls = [f"https://www.youtube.com/channel/{cid}/videos"] + [
        f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q}) for q in SEARCHES]
    for url in urls:
        try:
            for v in bd.videos_page(url):
                if v[0] not in seen:
                    seen.add(v[0])
                    videos.append(v)
        except Exception as e:  # noqa: BLE001
            print(f"  {name}: {url} failed ({e})", file=sys.stderr)
    full = [v for v in videos if EP.search(v[1]) and not bd.SKIP.search(v[1])]
    for show in guesses([v[1] for v in full])[:MAX_SEARCHED_SHOWS]:
        url = f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": f"{show} full episode"})
        try:
            for v in bd.videos_page(url):
                if v[0] not in seen and key(show) in key(v[1]):
                    seen.add(v[0])
                    videos.append(v)
        except Exception as e:  # noqa: BLE001
            print(f"  {name}: search for {show!r} failed ({e})", file=sys.stderr)
    return videos


def add(kept, today, dry_run=False):
    """Adds the channels' full episodes to kept (build_dramas' dict, keyed by video id)."""
    import build_dramas as bd  # here, as build_dramas calls this module
    total = collections.Counter()
    for name, handles, query in SERIAL_CHANNELS:
        handle, cid = bd.channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos = collect(bd, cid, name)
        titles = [t for _, t, _ in videos if EP.search(t) and not bd.SKIP.search(t)]
        counts = count(titles)
        shows, new, skipped = collections.Counter(), 0, []
        for vid, title, mins in videos:
            if bd.SKIP.search(title) or (mins is not None and mins < MIN_MINUTES):
                continue
            if bd.OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            found = show_of(title, counts)
            if not found:
                if EP.search(title):
                    skipped.append(title)
                continue
            show, number = found
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            elif dry_run or bd.plays(vid):
                kept[vid] = {"show": show, "episode": number, "channel": name, "language": "Hindi",
                             "title": title, "added": today.isoformat()}
                new += 1
            else:
                continue
            shows[show] += 1
        total[name] = sum(shows.values())
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {len(shows)} shows, {sum(shows.values())} episodes, {new} new")
        for show, n in shows.most_common():
            print(f"    {show}: {n}")
        for t in skipped[:5]:
            print(f"    no show name: {t}")
    print(f"Hindi serials: {sum(total.values())} episodes from {len(total)} channels")


if __name__ == "__main__":
    import datetime as dt
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    add({}, dt.date.today(), dry_run="--check" not in sys.argv)
