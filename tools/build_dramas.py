#!/usr/bin/env python3
"""
Builds a playlist of the newest Pakistani drama episodes, telefilms, cooking and Islamic
shows and Urdu cartoons from their owners' own official YouTube channels (ARY Digital,
HUM TV, Geo Entertainment, Green Entertainment, PTV Home, Masala TV, Burka Avenger...).

These are videos the channels publish for free themselves. Cable TV plays them in
YouTube's own player (YouTube app on TVs, YouTube's embedded player on phones), so
nothing is downloaded or re-hosted, as YouTube's terms require.

Only full episodes are kept: titles with an episode number, not teasers, promos,
clips or OSTs, and (when YouTube says how long they are) at least MIN_MINUTES long.
Episodes found on earlier runs are kept for KEEP_DAYS, so each show builds up.

Writes (in docs/, served at tv.bulkbazaar.ca):
  Dramas.m3u     the playlist (built into Cable TV's Movies & Series)
  dramas.json    every episode kept, with the day it was found, and counts
                 (the day also goes in the playlist as added="...", for the Library's Newly added)
  MTA.m3u        MTA's own videos (an optional Library section, off unless the viewer turns it on)

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

# Each channel's YouTube handles, most likely first, then a YouTube channel search (only a
# channel whose name fits the search words is used), and the language of its programmes.
CHANNELS = [
    ("ARY Digital", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital", "Urdu"),
    ("HUM TV", ["@HUMTV", "@humtvofficial"], "HUM TV", "Urdu"),
    ("Geo Entertainment", ["@HARPALGEO", "@harpalgeoofficial"], "HAR PAL GEO", "Urdu"),
    ("Green Entertainment", ["@GreenEntertainmentpk", "@GreenEntertainment", "@greentvpk"], "Green Entertainment", "Urdu"),
    ("PTV Home", ["@PTVHomeOfficial", "@PTVHome", "@ptvhomeofficialchannel"], "PTV Home", "Urdu"),
    ("Express TV", ["@ExpressEntertainment", "@ExpressTVpk"], "Express TV", "Urdu"),
    ("A-Plus", ["@APlusEntertainmentOfficial", "@APlusTVPakistan", "@aplusdramas"], "A Plus Entertainment", "Urdu"),
    ("TV One", ["@TVOnePakistan", "@TVOneDramas", "@tvonepk"], "TV One Pakistan", "Urdu"),
    ("ARY Zindagi", ["@ARYZindagiOfficial", "@ARYZindagi"], "ARY Zindagi", "Urdu"),
    ("Geo Kahani", ["@GeoKahani", "@GeoKahaniOfficial"], "Geo Kahani", "Urdu"),
    ("Taarak Mehta Ka Ooltah Chashmah", ["@TaarakMehtaKaOoltahChashmah", "@tmkoc"], "Taarak Mehta Ka Ooltah Chashmah", "Hindi"),
    ("Prasar Bharati Archives", ["@PrasarBharatiArchives", "@prasarbharatiarchive"], "Prasar Bharati Archives", "Hindi"),
    ("FilmRise TV", ["@FilmRiseTV", "@FilmRiseClassicTV", "@FilmRiseTelevision"], "FilmRise", "English"),
]

# The same TV channels' own Dailymotion accounts (only verified accounts with exactly that
# name), for episodes their YouTube channels don't have: (name, search, language).
DAILYMOTION = "https://api.dailymotion.com"
# Also tried by these Dailymotion usernames, since its search ranks big channels poorly.
DM_CHANNELS = [
    ("ARY Digital", "ARY Digital", "Urdu", ["arydigital", "ARYDigitalasia", "arydigitalofficial"]),
    ("HUM TV", "HUM TV", "Urdu", ["humtv", "humtvofficial", "HUMTVpk"]),
    ("Geo Entertainment", "Har Pal Geo", "Urdu", ["harpalgeo", "harpalgeoofficial", "geoentertainment"]),
    ("Green Entertainment", "Green Entertainment", "Urdu", ["greenentertainment", "greentvpk"]),
    ("Express TV", "Express Entertainment", "Urdu", ["expressentertainment", "expresstv"]),
    ("A-Plus", "A Plus Entertainment", "Urdu", ["aplusentertainment", "aplustv"]),
    ("ARY Zindagi", "ARY Zindagi", "Urdu", ["aryzindagi"]),
    ("PTV Home", "PTV Home", "Urdu", ["ptvhome", "ptvhomeofficial"]),
    ("Taarak Mehta Ka Ooltah Chashmah", "Taarak Mehta Ka Ooltah Chashmah", "Hindi", ["tmkoc", "taarakmehtakaooltahchashmah"]),
    ("Sony SAB", "Sony SAB", "Hindi", ["sonysab", "sabtv"]),
    ("Zee TV", "Zee TV", "Hindi", ["zeetv", "zeetvofficial"]),
    ("Colors TV", "Colors TV", "Hindi", ["colorstv", "colors"]),
    ("Star Plus", "StarPlus", "Hindi", ["starplus", "starplusofficial"]),
]

# One show from a channel that also posts much else: (show, handles, channel search, language,
# searches in the channel, words a title must have). Full episodes only, filed under Shows.
SHOW_SEARCHES = [
    ("The Kapil Sharma Show", ["@SETIndia", "@SonyTV", "@sonytvofficial", "@TheKapilSharmaShow"],
     "SET India|Sony Entertainment Television|Sony TV|The Kapil Sharma Show", "Hindi",
     ["kapil sharma show full episode", "the kapil sharma show ep"], r"kapil"),
]
MIN_SHOW_EPISODE_MINUTES = 30

# Channels whose single-episode telefilms go under Urdu Movies.
TELEFILM_CHANNELS = {"ARY Digital", "HUM TV", "Geo Entertainment"}
TELEFILM = re.compile(r"\btele[\s-]?films?\b", re.IGNORECASE)
MIN_TELEFILM_MINUTES = 45
TELEFILM_WORDS = re.compile(
    r"\b(tele[\s-]?films?|eid|ul|al|adha|fitr|special|full|new|latest|hd|4k|ary digital|ary|hum tv|hum|"
    r"har pal geo|geo tv|geo|digital|pakistani|drama|\d{4})\b", re.IGNORECASE)

# Channels where every full video is a show, filed in a folder named after the channel:
# (name, handles, search, language, shortest video in minutes).
SHOW_CHANNELS = [
    ("Masala TV", ["@MasalaTVRecipes", "@masalatv", "@MasalaTV"], "Masala TV", "Urdu", 3),
    ("Food Fusion", ["@FoodFusionPk", "@FoodFusion"], "Food Fusion", "Urdu", 3),
    ("ARY Qtv", ["@ARYQtvOfficial", "@ARYQtv", "@QtvOfficial"], "ARY Qtv", "Urdu", 3),
    ("Madani Channel", ["@MadaniChannel", "@MadaniChannelOfficial"], "Madani Channel", "Urdu", 3),
    ("Sanjeev Kapoor Khazana", ["@SanjeevKapoorKhazana"], "Sanjeev Kapoor Khazana", "Hindi", 3),
    ("Kabita's Kitchen", ["@KabitasKitchen"], "Kabitas Kitchen", "Hindi", 3),
    ("DW Documentary", ["@DWDocumentary"], "DW Documentary", "English", 20),
    ("National Geographic", ["@NatGeo"], "National Geographic", "English", 20),
]
# Cartoons from their makers' own channels, filed under Kids.
KIDS_CHANNELS = [
    # No official Urdu channel exists for Burka Avenger or Commander Safeguard (only an Afghan
    # Dari/Pashto one and fan re-uploads), so they are left out.
    ("Chhota Bheem", ["@chhotabheem", "@ChhotaBheemOfficial"], "Chhota Bheem", "Hindi", 5),
    ("Little Krishna", ["@LittleKrishna", "@LittleKrishnaOfficial"], "Little Krishna", "Hindi", 5),
    ("Mr Bean", ["@MrBean"], "Mr Bean", "English", 5),
    ("Peppa Pig", ["@PeppaPigOfficial", "@peppapig"], "Peppa Pig", "English", 5),
    ("Pocoyo", ["@Pocoyo", "@PocoyoEnglish"], "Pocoyo", "English", 5),
]
# Muslim Television Ahmadiyya's own channels; their videos go to MTA.m3u only, which Live
# TV shows only when the viewer turns MTA on in Settings.
MTA_CHANNELS = [
    # MTA's long-standing channel is "mtaOnline1" (it streams MTA's live channels); "@mtaonline" is an empty account.
    ("MTA International", ["@mtaonline1", "@MTAInternational"],
     "mtaOnline1|MTA International|Muslim Television Ahmadiyya|MTA TV", 10),
]
MTA_FOLDERS = [
    ("Friday Sermons", re.compile(r"friday sermon|khutba|خطبہ", re.I)),
    ("Quran", re.compile(r"\bquran|qur'?an|tilawat|recitation|تلاوت", re.I)),
    ("Children's Programmes", re.compile(r"\b(kids?|children|bachon|atfal|waqf-?e-?nau)\b", re.I)),
]
SHOW_SKIP = re.compile(r"\b(teaser|promo|trailer|shorts|live stream|live)\b|#shorts", re.IGNORECASE)
# Channels of one show only, whose titles name the story arc instead ("Flats Ki Renovation Episode 1778").
SINGLE_SHOW = {"Taarak Mehta Ka Ooltah Chashmah"}
# A "show name" that is only a filler word ("FULL Episode 4777"): the channel's name is used instead.
NO_SHOW_NAME = re.compile(r"^(full|full episode|new|latest|watch the show|se\s*\d+|season\s*\d+)$", re.IGNORECASE)

# Official YouTube channels of the companies that own the Hindi dubbed rights and
# publish full movies free themselves.
MOVIE_CHANNELS = [
    ("Goldmines", ["@GoldminesTelefilms", "@Goldmines"], "Goldmines"),
    ("Pen Movies", ["@PenMovies"], "Pen Movies"),
    ("RKD Studios", ["@RKDStudios"], "RKD Studios"),
    ("Aditya Movies", ["@AdityaMovies"], "Aditya Movies"),
]
MIN_MOVIE_MINUTES = 80
DUBBED = re.compile(r"hindi\s+dubbed", re.IGNORECASE)
MOVIE_SKIP = re.compile(r"\b(trailer|teaser|promo|scenes?|songs?|jukebox|comedy|action scene|fight|clip|shorts)\b", re.IGNORECASE)

# Film studios' own channels with full films in their own language: (name, handles, search,
# language). Punjabi channels also put up songs and other languages, so their titles must say Punjabi.
FILM_CHANNELS = [
    ("Shemaroo", ["@ShemarooMovies", "@shemaroo"], "Shemaroo", "Hindi"),
    ("Rajshri", ["@rajshri", "@RajshriFilms"], "Rajshri", "Hindi"),
    ("Ultra", ["@UltraMovieParlour", "@UltraBollywood"], "Ultra", "Hindi"),
    ("White Hill Studios", ["@WhiteHillStudios", "@WhiteHillMusic"], "White Hill", "Punjabi"),
    ("Saga Music", ["@SagaMusic", "@SagaHits"], "Saga", "Punjabi"),
    ("Speed Records", ["@SpeedRecords", "@SpeedPunjabi"], "Speed Records", "Punjabi"),
    ("FilmRise Movies", ["@FilmRiseMovies", "@FilmRise"], "FilmRise", "English"),
]
MIN_FILM_MINUTES = 70
FILM_SKIP = re.compile(r"\b(trailer|teaser|promo|scenes?|jukebox|clip|shorts|songs?|video song|audio)\b|#shorts", re.IGNORECASE)
OTHER_LANGUAGE = re.compile(r"\b(marathi|gujarati|bhojpuri|tamil|telugu|bengali|kannada|malayalam|odia|rajasthani|haryanvi)\b", re.IGNORECASE)

# Reality, game and talk shows, as opposed to drama serials. Cable TV files them under Shows.
SHOW = re.compile(r"\b(tamasha|show|reality|jeeto|hasna mana|game|talk|podcast|morning|ramzan|ramadan|transmission|"
                  r"mazaaq raat|g sarkar|the knock)\b", re.IGNORECASE)

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
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9",
                                                       "Cookie": "CONSENT=YES+1; SOCS=CAI"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            if attempt + 1 == tries:
                raise
            print(f"  retry ({e}): {url}", file=sys.stderr)
            time.sleep(5 * 2 ** attempt)


GENERIC = {"official", "entertainment", "tv", "pakistan", "pk", "channel", "hd"}


def compact(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())


def _key(text):
    return compact(" ".join(w for w in re.split(r"[^\w]+", text) if w.lower() not in GENERIC)) or compact(text)


def is_owner(title, expect, exact=False):
    """Whether a YouTube channel's name fits the channel we want ("ARY Digital HD" for
    "ARY Digital"), so a handle someone else owns is never used. A channel found by search
    must have exactly that name ("Burka Avenger Afghanistan" or "commandersafeguard1" is
    someone else's)."""
    if "|" in expect:  # any of several names
        return any(is_owner(title, e, exact) for e in expect.split("|"))
    if exact:
        return _key(title) == _key(expect)
    return _key(expect) in compact(title)


def channel_id(handles, query):
    """The YouTube channel id for one of the handles, or the top channel search result for
    the query; only a channel whose name fits the query is used."""
    for handle in handles:
        try:
            page = fetch(f"https://www.youtube.com/{handle}", tries=2)
        except Exception as e:  # noqa: BLE001
            print(f"  {handle}: {e}", file=sys.stderr)
            continue
        m = re.search(r'"externalId":"(UC[\w-]{22})"', page) or re.search(r'channel_id=(UC[\w-]{22})', page)
        title = re.search(r'<meta property="og:title" content="([^"]*)"', page)
        title = html.unescape(title.group(1)) if title else ""
        if m and is_owner(title, query):
            print(f"  {handle} is {title!r}")
            return handle, m.group(1)
        if m:
            print(f"  {handle} is {title!r}, not {query!r}; skipped", file=sys.stderr)
    try:
        page = fetch("https://www.youtube.com/results?" + urllib.parse.urlencode({"search_query": query.split("|")[0], "sp": "EgIQAg=="}), tries=2)
        for m in list(re.finditer(r'"channelRenderer":\{"channelId":"(UC[\w-]{22})"', page))[:5]:
            title = re.search(r'"title":\{"simpleText":"((?:[^"\\]|\\.)*)"', page[m.end():m.end() + 3000])
            title = _text(title.group(1)) if title else ""
            if is_owner(title, query, exact=True):
                print(f"  search {query!r} found {title!r}")
                return f"search {query!r}", m.group(1)
            print(f"  search {query!r}: {title!r} skipped", file=sys.stderr)
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


AGE = re.compile(r'"(?:simpleText|content)":"(?:Streamed )?(\d+) (second|minute|hour|day|week|month|year)s? ago"')
AGE_DAYS = {"second": 0, "minute": 0, "hour": 0, "day": 1, "week": 7, "month": 30, "year": 365}


def age_days(chunk):
    """How many days ago the video in this piece of the page went up ("3 weeks ago"); None when not shown."""
    m = AGE.search(chunk)
    return int(m.group(1)) * AGE_DAYS[m.group(2)] if m else None


def videos_page(url, with_age=False):
    """Videos on a channel page (its Videos tab or a search in the channel): (id, title, minutes),
    and with [with_age] also how many days ago each went up (None when the page doesn't say).

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
            out.append((m.group(1), _text(title.group(1)), minutes(length.group(1)) if length else None) +
                       ((age_days(chunk[:4000]),) if with_age else ()))
    for m in re.finditer(r'"lockupViewModel":\{', page):
        chunk = page[m.end():m.end() + 12000]
        vid = re.search(r'"contentId":"([\w-]{11})"', chunk)
        if not vid or vid.group(1) in seen or "LOCKUP_CONTENT_TYPE_VIDEO" not in chunk[:12000]:
            continue
        title = re.search(r'"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', chunk)
        length = re.search(r'"text":"(\d{1,2}:\d{2}(?::\d{2})?)"', chunk)
        if title:
            seen.add(vid.group(1))
            out.append((vid.group(1), _text(title.group(1)), minutes(length.group(1)) if length else None) +
                       ((age_days(chunk[:8000]),) if with_age else ()))
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
        show, number = TAIL.sub("", m.group(1)).strip(" -|:–([{"), m.group(2)
    elif first:
        show, number = first.group(2).strip(), first.group(1)
    else:
        return None
    if not 2 <= len(show) <= 50:
        return None
    return show, int(number)


FILLER = re.compile(r"\b(latest|new|released|superhit|super hit|blockbuster|south|full|movie|action|romantic|comedy|hd|4k|hindi|\d{4})\b", re.I)


def movie_name(title):
    """ "Pushpa (Hindi Dubbed) Full Movie | Allu Arjun" to "Pushpa"; a quoted name wins
    ('Allu Sirish Latest "ABCD" Hindi Dubbed Movie' to "ABCD")."""
    quoted = re.search(r'["“”]([^"“”]{2,40})["“”]', title)
    if quoted:
        name = quoted.group(1)
    else:
        name = re.split(r"\s*[|(\[]|\s+-\s+|\s+(?:new\s+)?(?:south\s+)?(?:hindi\s+dubbed|full\s+(?:hd\s+)?movie)",
                        title, 1, flags=re.I)[0]
        name = FILLER.sub("", name)
    name = re.sub(r"\s+", " ", name).strip(" -|:–#\"'")
    if len(name) < 2 or re.search(r"\.(com|in|net)\b|www\.", name, re.I):
        return None
    return name


def get_json(url):
    return json.loads(fetch(url, tries=3))


def dm_user(search, usernames=()):
    """The id of the verified Dailymotion account with exactly this name, or None."""
    fields = "id,username,screenname,verified,videos_total"
    users = []
    for username in usernames:
        try:
            users.append(get_json(f"{DAILYMOTION}/user/{urllib.parse.quote(username)}?fields={fields}"))
        except Exception:  # noqa: BLE001
            pass  # no such user
    query = urllib.parse.urlencode({"search": search, "fields": fields, "limit": 20})
    try:
        users += get_json(f"{DAILYMOTION}/users?{query}").get("list", [])
    except Exception as e:  # noqa: BLE001
        print(f"  Dailymotion search {search!r} failed ({e})", file=sys.stderr)
    for u in users:
        names = (u.get("screenname") or "", u.get("username") or "")
        if u.get("verified") and any(is_owner(n, search, exact=True) for n in names):
            print(f"  Dailymotion {search!r} is {u.get('screenname')!r} (@{u.get('username')}, {u.get('videos_total')} videos)")
            return u["id"]
    print(f"  Dailymotion {search!r}: no verified account with that name "
          f"({', '.join(repr(u.get('screenname')) + (' verified' if u.get('verified') else '') for u in users[:5])})",
          file=sys.stderr)
    return None


DM_NEWS = re.compile(r"headlines|news|bulletin|capital talk|talk show|live", re.I)


def dailymotion(kept, today):
    """Adds full episodes from DM_CHANNELS to kept (keys "dm:<id>"); YouTube's copy of an
    episode is the one listed when both have it."""
    for name, search, language, usernames in DM_CHANNELS:
        uid = dm_user(search, usernames)
        if not uid:
            continue
        videos = []
        for page in (1, 2, 3):
            query = urllib.parse.urlencode({"fields": "id,title,duration", "sort": "recent", "limit": 100, "page": page})
            try:
                data = get_json(f"{DAILYMOTION}/user/{uid}/videos?{query}")
            except Exception as e:  # noqa: BLE001
                print(f"  {name}: Dailymotion page {page} failed ({e})", file=sys.stderr)
                break
            videos += [(v["id"], v.get("title") or "", (v.get("duration") or 0) / 60) for v in data.get("list", [])]
            if not data.get("has_more"):
                break
        new = 0
        for vid, title, mins in videos:
            ep = episode(title)
            if not ep or mins < MIN_MINUTES:
                continue
            if mins > 180 or DM_NEWS.search(title):
                continue
            if language == "Hindi" and OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            show = name if name in SINGLE_SHOW or NO_SHOW_NAME.match(ep[0].strip()) else ep[0]
            if show != name and re.sub(r"\d", "", compact(show)) in (compact(name), compact(search), ""):
                continue  # "Express Entertainment (51)": the channel's name, not a drama's
            key = f"dm:{vid}"
            if key in kept:
                kept[key]["seen"] = today.isoformat()
            else:
                kept[key] = {"show": show, "episode": ep[1], "channel": name, "language": language, "title": title,
                             "source": "dailymotion", "url": f"https://www.dailymotion.com/video/{vid}",
                             "logo": f"https://www.dailymotion.com/thumbnail/video/{vid}", "added": today.isoformat()}
                new += 1
        print(f"{name} (Dailymotion): {len(videos)} videos, {new} new episodes")
        for _, title, mins in videos[:3]:
            print(f"    e.g. {title} ({round(mins)} min)")


def show_searches(kept, today):
    """Adds full episodes of each SHOW_SEARCHES show to kept, all in one folder per show."""
    for show, handles, query, language, searches, must in SHOW_SEARCHES:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{show}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        for q in searches:
            url = f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q})
            try:
                for v in videos_page(url):
                    if v[0] not in seen:
                        seen.add(v[0])
                        videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"  {show}: search {q!r} failed ({e})", file=sys.stderr)
        new = 0
        for vid, title, mins in videos:
            ep = episode(title)
            if not ep or not re.search(must, title, re.I) or SKIP.search(title) or (mins or 0) < MIN_SHOW_EPISODE_MINUTES:
                continue
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            else:
                kept[vid] = {"show": show, "episode": ep[1], "channel": show, "language": language,
                             "title": title, "added": today.isoformat()}
                new += 1
        print(f"{show} ({handle} {cid}): {len(videos)} videos, {new} new episodes")
        for _, title, mins in videos[:4]:
            print(f"    e.g. {title} ({mins and round(mins)} min)")


def unique_episodes(episodes):
    """One copy of each episode (language, show, number), YouTube's first, and one spelling of
    each show's name, so a show never gets two folders."""
    names, seen, out = {}, set(), []
    for vid, v in sorted(episodes.items(), key=lambda kv: kv[1].get("source") == "dailymotion"):
        show = (v.get("language", "Urdu"), compact(v["show"]))
        names.setdefault(show, v["show"])
        if show + (v["episode"],) in seen:
            continue
        seen.add(show + (v["episode"],))
        out.append((vid, {**v, "show": names[show]}))
    return out


def telefilm_name(title):
    """ "Telefilm | Mann Pagal | ARY Digital" or 'Eid Telefilm "Mann Pagal"' to "Mann Pagal"."""
    quoted = re.search(r'["“”‘’]([^"“”‘’]{2,40})["“”‘’]', title)
    parts = [quoted.group(1)] if quoted else re.split(r"\s*[|\[\](){}]\s*|\s+[-–]\s+", title)
    for part in parts:
        name = re.sub(r"\s+", " ", TELEFILM_WORDS.sub("", part)).strip(" -|:–\"'")
        if len(name) >= 2 and not re.search(r"\.(com|pk|tv)\b|www\.", name, re.I):
            return name
    return None


def short_title(title):
    """A video title without its hashtags and trailing "| Channel" parts, at most 80 letters."""
    name = re.sub(r"#\S+", "", title)
    parts = [p.strip() for p in re.split(r"\s*\|\s*", name) if p.strip()]
    name = " | ".join(parts[:2]) if parts else title
    return (name[:77] + "...") if len(name) > 80 else name


def channel_shows(kept, today, channels, genre):
    """Adds every full video from each channel (SHOW_CHANNELS or KIDS_CHANNELS) to kept."""
    for name, handles, query, language, shortest in channels:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        urls = [f"https://www.youtube.com/channel/{cid}/videos"]
        if genre == "Kids":
            urls.append(f"https://www.youtube.com/channel/{cid}/search?query=episode")
        for url in urls:
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
        for vid, title, _ in videos[:3]:
            print(f"    e.g. {title}")
        new = 0
        for vid, title, mins in videos:
            if SHOW_SKIP.search(title) or (mins is not None and mins < shortest):
                continue
            if language == "Hindi" and OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            else:
                kept[vid] = {"item": short_title(title), "folder": name, "genre": genre, "channel": name,
                             "language": language, "title": title, "added": today.isoformat()}
                new += 1
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {new} new {genre.lower()}")


def mta(kept, today):
    """Adds MTA's full videos to kept, each in a folder by programme and in Urdu or English."""
    for name, handles, query, shortest in MTA_CHANNELS:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        for url in (f"https://www.youtube.com/channel/{cid}/videos",
                    f"https://www.youtube.com/channel/{cid}/search?query=friday+sermon",
                    f"https://www.youtube.com/channel/{cid}/search?query=quran",
                    f"https://www.youtube.com/channel/{cid}/search?query=children"):
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
                print(f"  {name}: {len(videos)} videos from the feed")
            except Exception as e:  # noqa: BLE001
                print(f"  {name} feed failed ({e})", file=sys.stderr)
        new = 0
        for vid, title, mins in videos:
            if SHOW_SKIP.search(title) or (mins is not None and mins < shortest):
                continue
            folder = next((f for f, pattern in MTA_FOLDERS if pattern.search(title)), "Programmes")
            genre = "Kids" if folder == "Children's Programmes" else "Shows"
            language = "Urdu" if re.search(r"urdu|[\u0600-\u06ff]", title, re.I) else "English"
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            else:
                kept[vid] = {"item": short_title(title), "folder": folder, "genre": genre, "channel": name,
                             "language": language, "title": title, "mta": True, "added": today.isoformat()}
                new += 1
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {new} new")
        for _, title, mins in videos[:5]:
            print(f"    e.g. {title} ({mins and round(mins)} min)")


def films(kept, today):
    """Adds full films from FILM_CHANNELS to kept."""
    for name, handles, query, language in FILM_CHANNELS:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        for url in (f"https://www.youtube.com/channel/{cid}/videos",
                    f"https://www.youtube.com/channel/{cid}/search?query=full+movie"):
            try:
                for v in videos_page(url):
                    if v[0] not in seen:
                        seen.add(v[0])
                        videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"  {name}: {url} failed ({e})", file=sys.stderr)
        new = 0
        for vid, title, mins in videos:
            if FILM_SKIP.search(title) or (mins or 0) < MIN_FILM_MINUTES:
                continue
            if language == "Punjabi" and not re.search(r"punjabi", title, re.I):
                continue
            if language == "Hindi" and OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            movie = movie_name(title)
            if not movie:
                continue
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            else:
                kept[vid] = {"movie": movie, "channel": name, "group": name, "language": language,
                             "title": title, "added": today.isoformat()}
                new += 1
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {new} new {language} films")
        for _, title, mins in videos[:3]:
            print(f"    e.g. {title} ({mins and round(mins)} min)")


def dubbed_movies(kept, today):
    """Adds full Hindi dubbed movies from MOVIE_CHANNELS to kept."""
    for name, handles, query in MOVIE_CHANNELS:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        for url in (f"https://www.youtube.com/channel/{cid}/videos",
                    f"https://www.youtube.com/channel/{cid}/search?query=hindi+dubbed+full+movie"):
            try:
                for v in videos_page(url):
                    if v[0] not in seen:
                        seen.add(v[0])
                        videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"  {name}: {url} failed ({e})", file=sys.stderr)
        new = 0
        for vid, title, mins in videos:
            if not DUBBED.search(title) or MOVIE_SKIP.search(title) or (mins or 0) < MIN_MOVIE_MINUTES:
                continue
            movie = movie_name(title)
            if movie and vid not in kept:
                kept[vid] = {"movie": movie, "channel": name, "title": title, "added": today.isoformat()}
                new += 1
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {new} new Hindi dubbed movies")


def main():
    state_path = os.path.join(DOCS, "dramas.json")
    try:
        with open(state_path, encoding="utf-8") as f:
            kept = json.load(f).get("videos", {})
    except (OSError, ValueError):
        kept = {}
    today = dt.date.today()

    found = 0
    for name, handles, query, language in CHANNELS:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        # The Videos tab has the newest uploads (mostly clips); a search in the
        # channel for "episode" finds more full episodes.
        urls = [f"https://www.youtube.com/channel/{cid}/videos",
                f"https://www.youtube.com/channel/{cid}/search?query=episode"]
        if name in TELEFILM_CHANNELS:
            urls.append(f"https://www.youtube.com/channel/{cid}/search?query=telefilm")
        for url in urls:
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
        new = telefilms = 0
        skipped = []
        for vid, title, mins in videos:
            if name in TELEFILM_CHANNELS and TELEFILM.search(title) and not SKIP.search(title):
                film = telefilm_name(title)
                if film and (mins or 0) >= MIN_TELEFILM_MINUTES and vid not in kept:
                    kept[vid] = {"telefilm": film, "channel": name, "title": title, "added": today.isoformat()}
                    telefilms += 1
                continue
            ep = episode(title)
            if not ep or (mins is not None and mins < MIN_MINUTES):
                skipped.append(f"{title} ({mins and round(mins)} min)")
                continue
            if language == "Hindi" and OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            show = name if name in SINGLE_SHOW or NO_SHOW_NAME.match(ep[0].strip()) else ep[0]
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            else:
                kept[vid] = {"show": show, "episode": ep[1], "channel": name, "language": language,
                             "title": title, "added": today.isoformat()}
                new += 1
            found += 1
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {new} new episodes, {telefilms} new telefilms")
        for t in skipped[:6]:
            print(f"    skipped: {t}")

    show_searches(kept, today)
    dailymotion(kept, today)
    dubbed_movies(kept, today)
    films(kept, today)
    channel_shows(kept, today, SHOW_CHANNELS, "Shows")
    channel_shows(kept, today, KIDS_CHANNELS, "Kids")
    mta(kept, today)

    # Kept until KEEP_DAYS after a video was last found, so a show still on its channel's
    # page (such as an old PTV classic) stays.
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    kept = {k: v for k, v in kept.items() if v.get("seen", v["added"]) >= cutoff}
    episodes = {k: v for k, v in kept.items() if "show" in v}
    movies = {k: v for k, v in kept.items() if "movie" in v}
    telefilms = {k: v for k, v in kept.items() if "telefilm" in v}
    items = {k: v for k, v in kept.items() if "item" in v and not v.get("mta")}
    mta_items = {k: v for k, v in kept.items() if v.get("mta")}
    rows = sorted(unique_episodes(episodes), key=lambda kv: (kv[1]["channel"], kv[1]["show"].lower(), kv[1]["episode"]))

    lines = ["#EXTM3U", "# Pakistani dramas, shows, cartoons and Hindi dubbed movies from their owners' official YouTube uploads."]
    names = set()
    for vid, v in sorted(movies.items(), key=lambda kv: kv[1]["movie"].lower()):
        language = v.get("language", "Hindi")
        if (language, compact(v["movie"])) in names:  # the same film from two channels
            continue
        names.add((language, compact(v["movie"])))
        lines.append(f'#EXTINF:-1 added="{v["added"]}" tvg-logo="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" tvg-language="{language}" '
                     f'tvg-genre="Movies" group-title="{v.get("group", "Hindi dubbed movies")}",{v["movie"]}')
        lines.append(f"https://www.youtube.com/watch?v={vid}")
    for vid, v in sorted(telefilms.items(), key=lambda kv: kv[1]["telefilm"].lower()):
        if ("telefilm", v["telefilm"].lower()) in names:
            continue
        names.add(("telefilm", v["telefilm"].lower()))
        lines.append(f'#EXTINF:-1 added="{v["added"]}" tvg-logo="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" tvg-language="Urdu" '
                     f'tvg-genre="Movies" group-title="Telefilms",{v["telefilm"]}')
        lines.append(f"https://www.youtube.com/watch?v={vid}")
    for vid, v in sorted(items.items(), key=lambda kv: (kv[1]["genre"], kv[1]["folder"], kv[1]["added"], kv[1]["item"])):
        lines.append(f'#EXTINF:-1 added="{v["added"]}" tvg-logo="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" tvg-language="{v.get("language", "Urdu")}" '
                     f'tvg-genre="{v["genre"]}" group-title="{v["folder"]}",{v["item"].replace(",", " ")}')
        lines.append(f"https://www.youtube.com/watch?v={vid}")
    for vid, v in rows:
        kind = "Shows" if SHOW.search(v["show"]) else "Series"
        logo = v.get("logo") or f"https://i.ytimg.com/vi/{vid}/hqdefault.jpg"
        lines.append(f'#EXTINF:-1 added="{v["added"]}" tvg-logo="{logo}" tvg-language="{v.get("language", "Urdu")}" '
                     f'tvg-genre="{kind}" group-title="{v["channel"]}",{v["show"]} Episode {v["episode"]}')
        lines.append(v.get("url") or f"https://www.youtube.com/watch?v={vid}")
    with open(os.path.join(DOCS, "Dramas.m3u"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    lines = ["#EXTM3U", "# MTA (Muslim Television Ahmadiyya) programmes from its own YouTube channel."]
    for vid, v in sorted(mta_items.items(), key=lambda kv: (kv[1]["folder"], kv[1]["added"], kv[1]["item"]), reverse=True):
        lines.append(f'#EXTINF:-1 added="{v["added"]}" tvg-logo="https://i.ytimg.com/vi/{vid}/hqdefault.jpg" tvg-language="{v["language"]}" '
                     f'tvg-genre="{v["genre"]}" group-title="MTA {v["folder"]}",{v["item"].replace(",", " ")}')
        lines.append(f"https://www.youtube.com/watch?v={vid}")
    with open(os.path.join(DOCS, "MTA.m3u"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    shows = {(v["channel"], v["show"]) for v in episodes.values()}
    with open(state_path, "w", encoding="utf-8") as f:
        json.dump({"built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "shows": len(shows), "episodes": len(episodes), "movies": len(movies),
                   "telefilms": len(telefilms), "show_videos": sum(v["genre"] == "Shows" for v in items.values()),
                   "kids_videos": sum(v["genre"] == "Kids" for v in items.values()), "mta_videos": len(mta_items),
                   "videos": kept},
                  f, indent=1, ensure_ascii=False)
        f.write("\n")
    print(f"Wrote docs/Dramas.m3u: {len(shows)} shows, {len(episodes)} episodes, {len(movies)} movies, "
          f"{len(telefilms)} telefilms, {len(items)} cooking/Islamic/kids videos")
    if not kept:
        sys.exit("No episodes found; keeping the build red so the old playlist isn't replaced.")


if __name__ == "__main__":
    main()
