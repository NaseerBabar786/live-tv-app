#!/usr/bin/env python3
"""
Channel 1's 8-hour set (the owner's rule, 2026-10-08; memory: channel1-eight-hour-set-rule).

One 8-hour set plays three times a day, from 12 am, 8 am and 4 pm (Toronto). Each half hour is about
25 minutes of programme with two 1-minute ad breaks inside it, then a 5-minute segment at :25 and :55
(ads, today's programmes, weather, tips: tools/make_channel1_segment.py). The news goes with the set:
the full news at the start of each set and 4 hours in (12, 4 and 8, morning and evening), the headlines
at the other hours. The dramas are serials from episode 1, one episode further each day; all three
sets of a day show the same episodes. No whole films.

    hour 1  Mitti De Baway        (after the full news)
    hour 2  Uswah
    hour 3  a new recipe, then comedy (Taarak Mehta's newest episode: it began in 2008)
    hour 4  Tark-e-Tamanna
    hour 5  Mohabbat ya Aitebar   (after the full news)
    hour 6  Madaar
    hour 7  Raqaas
    hour 8  new songs and new film trailers

How it plays on every TV and the website with no app update (docs/channel/schedule.js, MyChannel.kt):
the news, the ad breaks and the segments are time slots; the programmes are the loop, which waits during
each slot. Each hour leaves 43 minutes of programme (37 after the full news), so every hour's programme
is filled to exactly that with new songs and trailers, then our own short clips. The loop then lines up
with the clock in every set.

Run in .github/workflows/build-trailers.yml after the day's lists:
  python3 tools/build_channel1_set.py --find [YYYY-MM-DD]    finds today's episodes (YouTube) -> channel1-episodes.json
  (the pre-air check runs on channel1-episodes.json)
  python3 tools/build_channel1_set.py --layout [YYYY-MM-DD]  writes docs/channel/test-schedule.json
"""
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
ROOT = os.path.dirname(HERE)
CHANNEL = os.path.join(ROOT, "docs", "channel")
SCHEDULE = os.path.join(CHANNEL, "test-schedule.json")
SERIALS_FILE = os.path.join(CHANNEL, "channel1-serials.json")   # every episode found so far
EPISODES_FILE = os.path.join(CHANNEL, "channel1-episodes.json")  # today's picks (checked before air)
SET_FILE = os.path.join(CHANNEL, "channel1-set.json")            # today's set, for the "Today" list

# Day 1 of the serials: episode 1 plays on this day, episode 2 the next day, and so on.
START = dt.date(2026, 10, 9)
GREEN = ("Green Entertainment", ["@GreenTVEntertainment", "@greenentertainment"], "Green")
SERIALS = [
    dict(hour=1, show="Mitti De Baway", urdu="مٹی دے باوے", source=GREEN),
    dict(hour=2, show="Uswah", urdu="اسوہ", source=("Har Pal Geo", ["@HarPalGeo", "@harpalgeo"], "HAR PAL GEO|Har Pal Geo")),
    dict(hour=4, show="Tark-e-Tamanna", urdu="ترکِ تمنا", source=("HUM TV", ["@HUMTV", "@humtvpk"], "HUM TV")),
    dict(hour=5, show="Mohabbat ya Aitebar", urdu="محبت یا اعتبار", source=("Aaj Entertainment", ["@AajEntertainment"], "Aaj Entertainment")),
    dict(hour=6, show="Madaar", urdu="مدار", source=GREEN),
    dict(hour=7, show="Raqaas", urdu="رقاص", source=GREEN),
]
FULL_NEWS = {1, 5}  # the set's hours (1-8) that open with the full news
HOUR = 3600
HEADLINES, FULL, AD, SEGMENT = 180, 600, 60, 300
# Programme time in an hour: what the slots (news, ad breaks, two segments) leave.
BUDGET = {h: HOUR - (FULL + 3 * AD if h in FULL_NEWS else HEADLINES + 4 * AD) - 2 * SEGMENT for h in range(1, 9)}
NOT_EPISODE = re.compile(r"teaser|promo|\bost\b|review|scene|highlight|recap|clip|bts|behind|reaction|preview|"
                         r"\bnext\b|making|interview|title song|best moment", re.I)
EPISODE_NO = re.compile(r"\b(?:episode|epi|ep)\.?\s*0*(\d{1,3})\b", re.I)
REL = "https://github.com/NaseerBabar786/live-tv-app/releases/download/channel-media/"


def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return default


def save(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
        f.write("\n")


def episode_today(today):
    return max(1, (today - START).days + 1)


def key(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def find(today):
    """Looks up each serial's episodes on its TV channel's own YouTube channel and keeps every one found."""
    from build_dramas import channel_id, videos_page
    known = load(SERIALS_FILE, {})
    n = episode_today(today)
    picks = []
    for s in SERIALS:
        eps = known.setdefault(s["show"], {})
        label, handles, name = s["source"]
        # YouTube sometimes answers a request with an empty page (the first live run found nothing on
        # Green's channel, the test run an hour earlier found most of it), so each look is tried 3 times.
        chan = None
        for attempt in range(3):
            _, chan = channel_id(handles, name)
            if chan:
                break
            time.sleep(5 * (attempt + 1))
        if chan:
            show = s["show"].replace("-", " ")
            for q in (f"{show} episode {n:02d}", f"{show} episode {n}", f"{show} episode", show):
                url = f"https://www.youtube.com/channel/{chan}/search?query=" + urllib.parse.quote_plus(q)
                found = []
                for attempt in range(3):
                    try:
                        found = videos_page(url)
                    except Exception as e:  # noqa: BLE001
                        print(f"  {url}: {e}", file=sys.stderr)
                    if found:
                        break
                    time.sleep(5 * (attempt + 1))
                for vid, title, mins in found:
                    m = EPISODE_NO.search(title)
                    if not m or NOT_EPISODE.search(title) or key(s["show"]) not in key(title[:60]):
                        continue
                    if mins is not None and not 15 <= mins <= 60:
                        continue
                    eps.setdefault(m.group(1), {"id": vid, "title": title.strip(), "secs": round((mins or 38) * 60)})
                if str(n) in eps:
                    break
        else:
            print(f"::warning::{s['show']}: {label}'s YouTube channel not found")
        got = eps.get(str(n))
        print(f"{s['show']}: episode {n} {'found' if got else 'NOT found'} ({len(eps)} episodes known)")
        if got:
            picks.append(dict(got, show=s["show"], episode=n))
    save(SERIALS_FILE, known)
    save(EPISODES_FILE, {"name": "Channel 1 serials", "built": today.isoformat(), "videos": picks})


def yt(v, prefix):
    return {"id": f"{prefix}-{v['id']}", "title": v["title"], "url": "https://www.youtube.com/watch?v=" + v["id"],
            "secs": int(v["secs"]), "kind": "programme"}


def layout(today):
    sched = load(SCHEDULE, {})
    base = {v["id"]: v for v in sched.get("videos", []) if not v["id"].startswith("c1-")}
    # Our own clips: the slots' videos and the short pieces that make each hour come out exact.
    own = {k: base[k] for k in ("welcome", "break", "next", "adbb", "adhere", "promo", "promo2", "adbreak")}
    base["ad9"] = {"id": "ad9", "title": "کیبل ٹی وی", "url": "https://tv.bulkbazaar.ca/media/cable-tv-video-ad-9.mp4", "secs": 15, "kind": "ad"}
    base["adbreak-c"] = {"id": "adbreak-c", "title": "اشتہارات", "url": "https://tv.bulkbazaar.ca/channel/media/ad-break-c.mp4", "secs": 60, "kind": "ad"}
    base["segment"] = {"id": "segment", "title": "وقفہ: آج کے پروگرام اور موسم", "url": REL + "segment.mp4", "secs": SEGMENT, "kind": "programme"}
    for kind, secs in (("headlines", HEADLINES), ("full", FULL)):
        plain = base[f"news-{kind}"]
        for room in ("day", "night"):
            base[f"news-{kind}-{room}"] = dict(plain, id=f"news-{kind}-{room}", url=REL + f"news-{kind}-{room}.mp4", secs=secs)
    for gone in ("today", "trailers", "music", "drama-1", "drama-2", "drama-3", "cooking", "comedy", "film"):
        base.pop(gone, None)

    n = episode_today(today)
    episodes = {v["show"]: v for v in load(EPISODES_FILE, {}).get("videos", []) if v.get("episode") == n}
    bad = set(load(os.path.join(CHANNEL, "preair-bad.json"), {}).get("ids", {}))
    fine = lambda v: v["id"] not in bad and v.get("secs", 0) > 0  # noqa: E731
    lists = {name: [v for v in load(os.path.join(CHANNEL, name), {}).get("videos", []) if fine(v)]
             for name in ("music-videos.json", "trailers.json", "block-cooking.json", "block-comedy.json",
                          "block-drama-1.json", "block-drama-2.json", "block-drama-3.json")}
    # In case a serial's episode isn't there: today's new drama episodes (the blocks, their spares, then Bazaar Dramas).
    spare_dramas = []
    for name in ("block-drama-1.json", "block-drama-2.json", "block-drama-3.json"):
        d = load(os.path.join(CHANNEL, name), {})
        spare_dramas += [v for v in d.get("videos", []) + d.get("spares", []) if fine(v)]
    spare_dramas += [dict(v, secs=round(v["mins"] * 60)) for v in load(os.path.join(CHANNEL, "yt-dramas.json"), {}).get("videos", [])
                     if v.get("mins") and v["id"] not in bad]
    songs = sorted(lists["music-videos.json"] + lists["trailers.json"], key=lambda v: -v["secs"])
    used = set()
    pads = sorted([own[k] for k in ("promo2", "adbb", "adhere", "welcome", "next", "break")] + [base["ad9"]], key=lambda v: -v["secs"])

    loop, videos, hours, t, target = [], [], [], 0, 0
    for h in range(1, 9):
        target += BUDGET[h]
        main = []
        serial = next((s for s in SERIALS if s["hour"] == h), None)
        if serial:
            ep = episodes.get(serial["show"])
            if ep and fine(ep):
                main.append((dict(ep), f"{serial['urdu']}: قسط {n}", f"{serial['show']} · Episode {n}"))
            else:
                # Not on YouTube yet (or failed the check): a new drama episode from today's lists instead.
                print(f"::warning title=Channel 1::{serial['show']} episode {n} not available; a new drama episode plays in its place.")
                alt = next((v for v in spare_dramas if v["id"] not in used and v["secs"] <= BUDGET[h]), None)
                if alt:
                    main.append((alt, "ڈرامہ", re.split(r"\s*[|\[(]\s*|\s+-\s+", alt["title"])[0]))
        elif h == 3:
            cook = next((v for v in lists["block-cooking.json"] if v["secs"] <= 15 * 60), None)
            if cook:
                main.append((cook, "کھانا پکائیں", re.split(r"\s+(?:\||by|-)\s+", cook["title"], maxsplit=1, flags=re.I)[0]))
            comedy = next(iter(lists["block-comedy.json"]), None)
            if comedy:
                m = re.search(r"episode\s*(\d+)", comedy["title"], re.I)
                main.append((comedy, "مزاحیہ", (comedy.get("label") or "Comedy") + (f" · Episode {m.group(1)}" if m else "")))
        hour = {"hour": h, "full_news": h in FULL_NEWS, "programmes": []}
        loop.append("next"); t += own["next"]["secs"]
        start = len(loop)
        for v, urdu, title in main:
            item = yt(v, f"c1-{h}")
            videos.append(item); loop.append(item["id"]); used.add(v["id"]); t += item["secs"]
            hour["programmes"].append({"id": item["id"], "urdu": urdu, "title": title, "secs": item["secs"]})
        # Fill to the hour's end: new songs and trailers (hour 8 is all of them), then our own short clips.
        # (A song can come back in a later hour when the day's list runs short, never twice in one hour.)
        here = set()
        for again in (False, True):
            for v in songs:
                if target - t < 150:
                    break
                if v["id"] in here or (v["id"] in used and not again) or v["secs"] > target - t:
                    continue
                item = yt(v, f"c1-{h}{'r' if v['id'] in used else ''}")
                videos.append(item); loop.append(item["id"]); used.add(v["id"]); here.add(v["id"]); t += item["secs"]
                if h == 8 and not hour["programmes"]:
                    hour["programmes"].append({"id": item["id"], "urdu": "نئے گانے اور فلموں کے ٹریلر", "title": "New songs and film trailers", "secs": 0})
        # Our clips go in the gaps between this hour's programmes and songs, at most 30 s in a gap, so
        # no ad break in the loop runs over 60 s (owner's rule; three 30 s promos back to back broke it,
        # 2026-10-08). Whatever doesn't fit carries on into the next hour's filling.
        gaps = [i + 1 for i in range(start, len(loop)) if loop[i] != "next"]
        room = {g: (22 if g == len(loop) else 30) for g in gaps}  # the next hour opens with the 8 s "next"
        put = {g: [] for g in gaps}
        for p in pads:
            for g in sorted(gaps, key=lambda g: len(put[g])):
                if target - t < p["secs"]:
                    break
                if room[g] >= p["secs"] and p["id"] not in put[g]:
                    put[g].append(p["id"]); room[g] -= p["secs"]; t += p["secs"]
        for g in sorted(gaps, reverse=True):
            loop[g:g] = put[g]
        hours.append(hour)
    # A few seconds can be left over (or an episode ran long): the last song ends that much early or late,
    # so the set is exactly 8 hours of slots and programmes and lines up again at 8 am and 4 pm.
    last = videos[-1]
    last["secs"] += target - t
    if last["secs"] < 60:
        print(f"::warning title=Channel 1::the set ran {t - target} s over; the last song is cut to {last['secs']} s.")
    print(f"Set for {today} (episode {n}): {target - t:+d} s on the last song; serials found: "
          f"{', '.join(s['show'] for s in SERIALS if s['show'] in episodes) or 'none'}")

    slots, ads = [], ["promo", "adbreak", "adbreak-c"]
    turn = 0
    for hh in range(24):
        h = hh % 8 + 1
        # The news rooms (owner, 2026-10-08): the day studio from 6 am to 5:59 pm, the night one otherwise.
        room = "day" if 6 <= hh < 18 else "night"
        slots.append({"day": "all", "time": f"{hh:02d}:00", "video": f"{'news-full' if h in FULL_NEWS else 'news-headlines'}-{room}"})
        for mm in ([17] if h in FULL_NEWS else [10, 18]) + [38, 47]:
            slots.append({"day": "all", "time": f"{hh:02d}:{mm:02d}", "video": ads[turn % len(ads)]})
            turn += 1
        slots.append({"day": "all", "time": f"{hh:02d}:25", "video": "segment"})
        slots.append({"day": "all", "time": f"{hh:02d}:55", "video": "segment"})
    slots.sort(key=lambda s: s["time"])
    sched["videos"] = list(base.values()) + videos
    loop = apart_from_slot_ads(loop, slots, {v["id"]: v for v in sched["videos"]})
    sched["loop"] = loop
    sched["slots"] = slots
    sched["fillers"] = ["promo2", "adhere", "adbb", "next"]
    sched["ticker"] = ("Welcome to Bazaar TV, channel 1 on Cable TV  ·  New Pakistani dramas from episode 1, a new episode every day  ·  "
                       "Full news at 12, 4 and 8, headlines every hour  ·  Advertise with us: WhatsApp 437 602 6500  ·  "
                       "tv.bulkbazaar.ca/advertise  ·  Shop at bulkbazaar.ca")
    save(SCHEDULE, sched)
    save(SET_FILE, {"date": today.isoformat(), "episode": n, "hours": hours})
    print(f"Wrote {os.path.relpath(SCHEDULE, ROOT)}: {len(loop)} loop items, {len(slots)} slots.")


def on_air(loop, slots, by_id, hours=8):
    """What one set plays, as schedule.js plays it (a time slot plays its video and the loop waits, then
    carries on): [(start, end, id, loop index or None for a slot)], in seconds from the set's start."""
    at = sorted((int(s["time"][:2]) * 3600 + int(s["time"][3:]) * 60, s["video"]) for s in slots)
    out, t, k, done = [], 0, 0, 0  # done: seconds of loop item k already played
    for start, vid in [x for x in at if x[0] < hours * 3600] + [(hours * 3600, None)]:
        while t < start:
            secs = by_id[loop[k % len(loop)]]["secs"]
            end = min(t + secs - done, start)
            out.append((t, end, loop[k % len(loop)], k % len(loop)))
            done += end - t
            t = end
            if done >= secs:
                k, done = k + 1, 0
        if vid:
            out.append((start, start + by_id[vid]["secs"], vid, None))
            t = start + by_id[vid]["secs"]
    return out


def apart_from_slot_ads(loop, slots, by_id):
    """Our short clips in the loop can land right next to a time-slot ad break and make it longer than
    60 s (the owner's rule). Such a clip swaps places with the programme after it until none does."""
    is_ad = lambda i: by_id[i]["kind"] in ("ad", "ident")  # noqa: E731
    loop = list(loop)
    for _ in range(100):
        run, bad = [], None
        for piece in on_air(loop, slots, by_id) + [(0, 0, None, None)]:
            if piece[2] and is_ad(piece[2]):
                run.append(piece)
                continue
            if sum(p[1] - p[0] for p in run) > 61 and any(p[3] is not None for p in run):
                bad = next(p[3] for p in run if p[3] is not None)
                break
            run = []
        if bad is None:
            return loop
        nxt = next((k for k in range(bad + 1, len(loop)) if not is_ad(loop[k])), None)
        if nxt is None:
            break
        loop.insert(nxt, loop.pop(bad))  # the clip now plays after that programme
    print("::warning title=Channel 1::an ad break next to a time slot is still over 60 s.")
    return loop


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "--layout"
    today = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else dt.date.today()
    if mode == "--find":
        find(today)
    else:
        layout(today)


if __name__ == "__main__":
    main()
