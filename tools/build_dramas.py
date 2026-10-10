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
  MTA.m3u        MTA's own videos, a folder per programme, in Urdu and English (an optional Library
                 section, off unless the viewer turns MTA on)

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

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from playable import plays  # noqa: E402
import hindi_serials  # noqa: E402
import named_shows  # noqa: E402

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
    # More free sources the owner approved (2026-10-08, "more free movie sources" thread; probed from Actions).
    ("Aaj Entertainment", ["@AajEntertainment"], "Aaj Entertainment", "Urdu"),
    # Daily new-sources check, 2026-10-09 (probe run 37920714292).
    ("LTN Family", ["@LTNFamily", "channel/UCEXUJUcgAw0PVX0y4sAaoCA"], "LTN Family", "Urdu"),
    # FilmRise TV (1950s-60s sitcoms such as That Girl) left on 2026-10-07 with the other old English programmes.
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

# Channels taken out of the Library: what was kept from them goes at once, not after KEEP_DAYS.
RETIRED = {"FilmRise TV"}

# Channels whose single-episode telefilms go under Urdu Movies.
TELEFILM_CHANNELS = {"ARY Digital", "HUM TV", "Geo Entertainment", "LTN Family"}
TELEFILM = re.compile(r"\btele[\s-]?films?\b", re.IGNORECASE)
MIN_TELEFILM_MINUTES = 45
TELEFILM_WORDS = re.compile(
    r"\b(tele[\s-]?films?|eid|ul|al|adha|fitr|special|full|new|latest|hd|4k|ary digital|ary|hum tv|hum|"
    r"har pal geo|geo tv|geo|ltn family|ltn|digital|pakistani|drama|\d{4})\b", re.IGNORECASE)

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
    # Newer English shows from their owners' channels (owner, 2026-10-07: replace the old English films).
    ("Hell's Kitchen", ["@HellsKitchen"], "Hell's Kitchen", "English", 30),
    ("Kitchen Nightmares", ["@KitchenNightmares"], "Kitchen Nightmares", "English", 30),
    ("MasterChef", ["@MasterChefWorld"], "MasterChef World", "English", 30),
    ("Shark Tank", ["@SharkTankGlobal"], "Shark Tank Global", "English", 30),
    ("Dragons' Den", ["@DragonsDen"], "Dragons' Den|Dragons Den", "English", 30),
    ("Border Security", ["@BorderSecurity"], "Border Security", "English", 20),
    ("Free Documentary", ["@FreeDocumentary"], "Free Documentary", "English", 20),
    ("Free Documentary Nature", ["@FreeDocumentaryNature"], "Free Documentary - Nature|Free Documentary Nature", "English", 20),
    ("BBC Earth", ["@bbcearth"], "BBC Earth", "English", 40),
    ("Timeline", ["@TimelineChannel", "channel/UC88lvyJe7aHZmcvzvubDFRg"], "Timeline - World History|Timeline", "English", 20),
    ("Free Documentary History", ["@FreeDocumentaryHistory", "channel/UCsgPO6cNV0wBG-Og3bUZoFA"],
     "Free Documentary - History|Free Documentary History", "English", 20),
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
    ("Masha and the Bear", ["@MashaBearEN"], "Masha and the Bear", "English", 10),
    ("PAW Patrol", ["@PAWPatrolOfficial"], "PAW Patrol", "English", 10),
    ("Oddbods", ["@Oddbods"], "Oddbods", "English", 10),
    ("Thomas & Friends", ["@ThomasAndFriends"], "Thomas & Friends|Thomas and Friends", "English", 10),
    ("Pokémon", ["@pokemon"], "Pokémon|Pokemon", "English", 15),
    ("Motu Patlu", [], "Motu Patlu", "Hindi", 5),
    ("Sesame Street", ["@SesameStreet"], "Sesame Street", "English", 20),
    ("Teletubbies", ["@teletubbies"], "Teletubbies", "English", 10),
    ("Blippi", ["@Blippi"], "Blippi", "English", 10),
    ("Super Wings", [], "Super Wings", "English", 10),
    ("Shemaroo Kids", ["@ShemarooKids", "channel/UC9iBBFfq7L3ipvodSLrU8gQ"], "Shemaroo Kids", "Hindi", 10),
    ("LEGO Ninjago", ["@LEGO", "channel/UCP-Ng5SXUEt0VE-TXqRdL6g"], "LEGO", "English", 15),
    # Daily new-sources check, 2026-10-10: full-episode compilations.
    ("Curious George", ["@CuriousGeorge", "channel/UCu7IDy0y-ZA0qaG51wrQY6w"], "Curious George", "English", 20),
    ("Zig & Sharko", ["@ZigandSharko", "channel/UCcKJJuOe2tOqgrKw0Gks-sw"], "Zig & Sharko|Zig and Sharko", "English", 20),
    ("Wild Kratts", ["@WildKratts", "channel/UCxEmDFo1yUbbxjEb9RjitVA"], "Wild Kratts", "English", 20),
    ("WB Kids", ["@WBKids", "channel/UC9trsD1jCTXXtN3xIOIU8gg"], "WB Kids", "English", 20),
]
# Channels that also post other things: only titles with these words are kept.
ONLY_TITLES = {
    "Pokémon": re.compile(r"full episode", re.IGNORECASE),
    "Hell's Kitchen": re.compile(r"full episode|marathon|season \d", re.IGNORECASE),
    "LEGO Ninjago": re.compile(r"full episode", re.IGNORECASE),
}
# Channels that also post things that don't fit the Library: titles with these words are left out.
SKIP_TITLES = {
    "Timeline": re.compile(r"uncensored|footage|murder|serial killer|killer|massacre|execution", re.IGNORECASE),
}
# Kids' channels post Halloween specials in October: nothing scary goes on the Kids shelf.
SCARY = re.compile(r"hallowe+n|spooky|scary|creepy|ghosts?|monsters? night|haunted", re.IGNORECASE)
# Muslim Television Ahmadiyya's own channels; their videos go to MTA.m3u only, which Live
# TV shows only when the viewer turns MTA on in Settings.
MTA_CHANNELS = [
    # MTA's long-standing channel is "mtaOnline1" (it streams MTA's live channels); "@mtaonline" is an empty account.
    ("MTA International", ["@mtaonline1", "@MTAInternational"],
     "mtaOnline1|MTA International|Muslim Television Ahmadiyya|MTA TV", 10),
]
# Folders for videos found outside a playlist (the Videos tab and searches).
MTA_FOLDERS = [
    ("Friday Sermons", re.compile(r"friday sermon|khutba|خطبہ", re.I)),
    ("Quran", re.compile(r"\bquran|qur'?an|tilawat|recitation|تلاوت", re.I)),
    ("Children's Programmes", re.compile(r"\b(kids?|children|bachon|atfal|waqf-?e-?nau)\b", re.I)),
]
MTA_FOLDER_NAMES = {f for f, _ in MTA_FOLDERS} | {"Programmes"}
# Each of MTA's playlists is one programme and becomes its own folder in the Library (owner, 2026-10-08:
# grow the MTA section from MTA's own YouTube, with an Urdu shelf and a folder per programme).
MTA_MAX_PLAYLISTS = 80
MTA_PER_PLAYLIST = 40     # newest videos of each programme
MTA_MAX_VIDEOS = 1500     # in the whole MTA section
MTA_KIDS = re.compile(r"\b(kids?|children'?s?|bachon|bachchon|atfal|nasirat|waqf-?e-?nau|cartoons?|story time|stories|"
                      r"kudak|guld[au]sta|qisse|kahaniyan|kahani)\b", re.I)
# The Library has Urdu, Hindi, Punjabi and English shelves only: programmes in other languages are left out.
MTA_OTHER_LANGUAGE = re.compile(
    r"\b(arabic|french|german|deutsch|spanish|bengali|bangla|indonesian|bahasa|swahili|turkish|russian|chinese|"
    r"japanese|tamil|malayalam|sindhi|pashto|persian|farsi|dutch|italian|portuguese|hausa|yoruba|twi|luganda|"
    r"kirundi|creole|bosnian|albanian|norwegian|swedish|danish|thai|burmese|sinhala|tagalog)\b|"
    r"[\u0980-\u09ff\u0b80-\u0bff\u0d00-\u0d7f\u4e00-\u9fff\u3040-\u30ff\u0400-\u04ff]", re.I)
MTA_URDU = re.compile(r"\burdu\b|[\u0600-\u06ff]|\b\w+-e-\w+\b|\b(liqa|tilawat|ki|ka|ke|aur|mein|hain|kya|kaise|hamari|hamare|zindagi|"
                      r"bachon|bachchon|dars|seerat|tarbiyat|tarbiyyat|nazm|nazmen|taleem|baatein)\b", re.I)
MTA_ENGLISH = re.compile(r"\benglish\b|\b(the|with|and|of|in|what|how|why|is)\b", re.I)
MTA_TAGS = re.compile(r"\s*[|\-–:]*\s*\b(mta(\s*international)?|muslim television ahmadiyya|in urdu|in english|urdu|english|"
                      r"playlist|full episodes?|all episodes?)\b\s*[|\-–:]*\s*", re.I)

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
    ("Wamindia Movies", ["@WamindiaMovies", "channel/UCt7_pnSRPKU3bu2GqmgH8gQ"], "Wamindia"),
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
    # Newer English films (2000s to this year) from the companies that own them (owner, 2026-10-07).
    ("Movie Central", ["@MovieCentral"], "Movie Central", "English"),
    ("Popcornflix", ["@Popcornflix"], "Popcornflix", "English"),
    ("Maverick Movies", ["@MaverickMovies"], "Maverick Movies", "English"),
    ("Gravitas Movies", ["@GravitasMovies"], "Gravitas", "English"),
    # More free sources the owner approved (2026-10-08, "more free movie sources" thread; probed from Actions).
    ("ARY Films", ["@ARYFilms"], "ARY Films", "Urdu"),
    ("NH Studioz", ["@NHStudioz"], "NH Studioz", "Hindi"),
    # Daily new-sources check, 2026-10-09 (probe run 37920714292).
    ("Zee Classic", ["channel/UC3ux-QuJyWnEuEjzksKgnpQ"], "Zee Classic", "Hindi"),
    ("Goldmines Bollywood", ["@GoldminesBollywood", "channel/UCOF23vGxkbhN4wl7ROrgXsA"], "Goldmines Bollywood", "Hindi"),
    # Daily new-sources check, 2026-10-10 (probe run 38046642733).
    ("Zee Cinema", ["channel/UCxz2c50dBGCGDbbbZ8LesNQ"], "Zee Cinema", "Hindi"),
    ("Chaupal", ["channel/UCH3FAffJyp6RBYLSZsYnKdQ"], "Chaupal", "Punjabi"),
    ("Shemaroo Punjabi", ["@ShemarooPunjabi"], "Shemaroo Punjabi", "Punjabi"),
    ("Lokdhun Punjabi", [], "Lokdhun Punjabi|Lokdhun", "Punjabi"),
    ("Rhythm Boyz", ["@RhythmBoyz"], "Rhythm Boyz", "Punjabi"),
    ("Ultra Punjabi", ["@UltraPunjabi"], "Ultra Punjabi", "Punjabi"),
    # More Punjabi film labels (owner asked for many more Punjabi films, 2026-10-08; probe run 37851429617).
    ("T-Series Apna Punjab", ["channel/UCcvNYxWXR_5TjVK7cSCdW-g"], "T-Series Apna Punjab", "Punjabi"),
    ("Pitaara TV", ["@PitaaraTV"], "Pitaara", "Punjabi"),
    ("Goyal Music", ["@GoyalMusicOfficial", "channel/UCCnJqOskTbrUVcYVyda39PA"], "Goyal Music", "Punjabi"),
    ("Humble Motion Pictures", ["@HumbleMotionPictures"], "Humble Motion Pictures", "Punjabi"),
    ("Geet MP3", ["@GeetMP3"], "Geet MP3", "Punjabi"),
]
# Punjabi film channels that post only Punjabi films, so their titles needn't say "Punjabi".
ALL_PUNJABI = {"Shemaroo Punjabi", "Lokdhun Punjabi", "Rhythm Boyz", "Ultra Punjabi",
               "T-Series Apna Punjab", "Pitaara TV", "Humble Motion Pictures", "Chaupal"}
# Punjabi channels have many more films than their /videos page shows, so these searches run too.
PUNJABI_SEARCHES = ["punjabi movie", "full film", "comedy movie", "new punjabi movie"]
# Channels whose titles start with a one-line story and put the film's name second:
# "He Fell In Love With A Fake Princess | Princess for a Day | Full 2026 Romance Movie".
NAME_SECOND = {"Movie Central"}
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
            if name in ONLY_TITLES and not ONLY_TITLES[name].search(title):
                continue
            if name in SKIP_TITLES and SKIP_TITLES[name].search(title):
                continue
            if genre == "Kids" and SCARY.search(title):
                continue
            if language == "Hindi" and OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            elif language == "English" and not plays(vid):
                continue  # its owner doesn't let it play in other apps
            else:
                kept[vid] = {"item": short_title(title), "folder": name, "genre": genre, "channel": name,
                             "language": language, "title": title, "added": today.isoformat()}
                new += 1
        print(f"{name} ({handle} {cid}): {len(videos)} videos, {new} new {genre.lower()}")


def browse(url, max_pages=1):
    """A YouTube page and up to max_pages - 1 more of what follows it when scrolled (YouTube's own
    "continuation" requests), as one text to read videos or playlists from."""
    page = fetch(url)
    texts = [page]
    key = re.search(r'"INNERTUBE_API_KEY":"([\w-]+)"', page)
    version = re.search(r'"INNERTUBE_CLIENT_VERSION":"([\w.-]+)"', page)
    token = re.search(r'"continuationCommand":\{"token":"([^"]+)"', page)
    for _ in range(max_pages - 1):
        if not (version and token):
            break
        body = json.dumps({"context": {"client": {"clientName": "WEB", "clientVersion": version.group(1), "hl": "en"}},
                           "continuation": token.group(1)}).encode()
        req = urllib.request.Request("https://www.youtube.com/youtubei/v1/browse" + (f"?key={key.group(1)}" if key else ""), data=body,
                                     headers={"User-Agent": USER_AGENT, "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                more = r.read().decode("utf-8", "replace")
        except Exception as e:  # noqa: BLE001
            print(f"  more of {url} failed ({e})", file=sys.stderr)
            break
        texts.append(more)
        token = re.search(r'"continuationCommand":\{"token":"([^"]+)"', more)
    return "\n".join(texts)


def playlist_videos(text):
    """(id, title, minutes) of each video on a playlist page."""
    out, seen = [], set()
    for m in re.finditer(r'"playlistVideoRenderer":\{"videoId":"([\w-]{11})"', text):
        chunk = text[m.end():m.end() + 6000]
        title = re.search(r'"title":\{"runs":\[\{"text":"((?:[^"\\]|\\.)*)"', chunk)
        length = re.search(r'"lengthSeconds":"(\d+)"', chunk)
        if title and m.group(1) not in seen:
            seen.add(m.group(1))
            out.append((m.group(1), _text(title.group(1)), int(length.group(1)) / 60 if length else None))
    # YouTube's newer layout lists a playlist's videos as lockupViewModel cards, like a channel's Videos tab.
    for m in re.finditer(r'"lockupViewModel":\{', text):
        chunk = text[m.end():m.end() + 12000]
        vid = re.search(r'"contentId":"([\w-]{11})"', chunk)
        if not vid or vid.group(1) in seen or "LOCKUP_CONTENT_TYPE_VIDEO" not in chunk:
            continue
        title = re.search(r'"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', chunk)
        length = re.search(r'"text":"(\d{1,2}:\d{2}(?::\d{2})?)"', chunk)
        if title:
            seen.add(vid.group(1))
            out.append((vid.group(1), _text(title.group(1)), minutes(length.group(1)) if length else None))
    if not out:
        markers = {k: text.count(k) for k in ("playlistVideoRenderer", "lockupViewModel", "videoId", "consent", "ytInitialData")}
        print(f"    no videos read from the playlist page ({len(text)} bytes, {markers})", file=sys.stderr)
    return out


def channel_playlists(text):
    """(playlist id, title) of each playlist on a channel's Playlists tab."""
    out, seen = [], set()
    for m in re.finditer(r'"lockupViewModel":\{', text):
        chunk = text[m.end():m.end() + 12000]
        if "LOCKUP_CONTENT_TYPE_PLAYLIST" not in chunk[:12000]:
            continue
        pid = re.search(r'"contentId":"((?:PL|UU)[\w-]{10,})"', chunk)
        title = re.search(r'"lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', chunk)
        if pid and title and pid.group(1) not in seen:
            seen.add(pid.group(1))
            out.append((pid.group(1), _text(title.group(1))))
    for m in re.finditer(r'"gridPlaylistRenderer":\{"playlistId":"(PL[\w-]{10,})"', text):
        title = re.search(r'"(?:simpleText|text)":"((?:[^"\\]|\\.)*)"', text[m.end():m.end() + 3000])
        if title and m.group(1) not in seen:
            seen.add(m.group(1))
            out.append((m.group(1), _text(title.group(1))))
    return out


def mta_language(text, default=None, plain=False):
    """Urdu or English from a title (Urdu letters or words, "English"); default when it doesn't say.
    With plain, only a title that names its language or is written in Urdu letters counts."""
    if re.search(r"\benglish\b", text, re.I):
        return "English"
    if re.search(r"\burdu\b|[؀-ۿ]", text, re.I):
        return "Urdu"
    if plain:
        return default
    if MTA_URDU.search(text):
        return "Urdu"
    if MTA_ENGLISH.search(text):
        return "English"
    return default


def mta_folder(title):
    """A playlist's title as a short folder name ("Rah-e-Huda | Urdu | MTA" to "Rah-e-Huda")."""
    # Urdu letters go too: the Library's Urdu shelf already says the language ("Friday Sermon | خطبئہِ جمعہ 2011").
    name = MTA_TAGS.sub(" ", re.sub(r"#\S+|[\u0600-\u06ff]+", "", title)).strip(" |-–:,")
    name = re.sub(r"\s{2,}", " ", re.sub(r"\(\s*\)|\[\s*\]", "", name)).strip(" |-–:,") or title
    name = re.sub(r"\s*\|\s*(?=\d{4}$)", " ", name)  # "Friday Sermon | 2011" to "Friday Sermon 2011"
    return (name[:37] + "...") if len(name) > 40 else name


def mta(kept, today):
    """Adds MTA's full videos to kept: each of its programmes (a playlist on its channel) in its own
    folder, plus the newest uploads and searches filed under Friday Sermons, Quran, Children's
    Programmes or Programmes; each in Urdu or English."""
    total = 0
    for name, handles, query, shortest in MTA_CHANNELS:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        # (id, title, minutes, folder, language, kids) for every video found, programmes first.
        found, seen = [], set()
        try:
            lists = channel_playlists(browse(f"https://www.youtube.com/channel/{cid}/playlists", max_pages=4))
        except Exception as e:  # noqa: BLE001
            print(f"  {name}: playlists failed ({e})", file=sys.stderr)
            lists = []
        print(f"  {name}: {len(lists)} playlists: " + "; ".join(t for _, t in lists[:40]))
        used = 0
        for pid, ptitle in lists:
            if used >= MTA_MAX_PLAYLISTS:
                break
            if MTA_OTHER_LANGUAGE.search(ptitle) and not re.search(r"\b(urdu|english)\b", ptitle, re.I):
                print(f"    skipped (language): {ptitle}")
                continue
            try:
                videos = playlist_videos(browse(f"https://www.youtube.com/playlist?list={pid}", max_pages=3))
            except Exception as e:  # noqa: BLE001
                print(f"    {ptitle}: failed ({e})", file=sys.stderr)
                continue
            found_here = len(videos)
            videos = [v for v in videos if not SHOW_SKIP.search(v[1]) and not MTA_OTHER_LANGUAGE.search(v[1])]
            if not videos:
                print(f"    {ptitle} ({pid}): {found_here} videos, none kept")
                continue
            used += 1
            # The programme's language: its playlist title, else what most of its videos' titles say.
            language = mta_language(ptitle)
            if not language:
                votes = [mta_language(t) for _, t, _ in videos]
                language = "Urdu" if votes.count("Urdu") > votes.count("English") else "English"
            kids = bool(MTA_KIDS.search(ptitle))
            folder = mta_folder(ptitle)
            # Playlists mostly run oldest first: the newest of each programme are at the end.
            newest = videos[-MTA_PER_PLAYLIST:][::-1] if len(videos) > MTA_PER_PLAYLIST else videos[::-1]
            n = 0
            for vid, title, mins in newest:
                if vid not in seen:
                    seen.add(vid)
                    found.append((vid, title, mins, folder, mta_language(title, language, plain=True), kids))
                    n += 1
            print(f"    {folder} ({language}{', kids' if kids else ''}): {len(videos)} videos, {n} taken")
        for url in (f"https://www.youtube.com/channel/{cid}/videos",
                    f"https://www.youtube.com/channel/{cid}/search?query=friday+sermon",
                    f"https://www.youtube.com/channel/{cid}/search?query=quran",
                    f"https://www.youtube.com/channel/{cid}/search?query=urdu",
                    f"https://www.youtube.com/channel/{cid}/search?query=children"):
            try:
                for vid, title, mins in videos_page(url):
                    if vid not in seen:
                        seen.add(vid)
                        folder = next((f for f, pattern in MTA_FOLDERS if pattern.search(title)), "Programmes")
                        found.append((vid, title, mins, folder, mta_language(title, "English"),
                                      folder == "Children's Programmes"))
            except Exception as e:  # noqa: BLE001
                print(f"  {name}: {url} failed ({e})", file=sys.stderr)
        if not found:
            try:
                for vid, title, mins in videos_feed(cid):
                    folder = next((f for f, pattern in MTA_FOLDERS if pattern.search(title)), "Programmes")
                    found.append((vid, title, mins, folder, mta_language(title, "English"), folder == "Children's Programmes"))
                print(f"  {name}: {len(found)} videos from the feed")
            except Exception as e:  # noqa: BLE001
                print(f"  {name} feed failed ({e})", file=sys.stderr)
        new = 0
        for vid, title, mins, folder, language, kids in found:
            if total >= MTA_MAX_VIDEOS:
                break
            # A programme's own playlist may have short episodes (a 5-minute Qur'an lesson); other videos need [shortest].
            if SHOW_SKIP.search(title) or (mins is not None and mins < (5 if kids or folder not in MTA_FOLDER_NAMES else shortest)):
                continue
            total += 1
            entry = {"item": short_title(title), "folder": folder, "genre": "Kids" if kids else "Shows",
                     "channel": name, "language": language, "title": title, "mta": True}
            if vid in kept:
                kept[vid].update(entry, seen=today.isoformat())
            else:
                kept[vid] = dict(entry, added=today.isoformat())
                new += 1
        print(f"{name} ({handle} {cid}): {len(found)} videos, {total} kept, {new} new")
        for _, title, mins, folder, language, _ in found[:8]:
            print(f"    e.g. {folder} | {language} | {title} ({mins and round(mins)} min)")


def uploaded_by(vid, cid, handle, query):
    """Whether the label's own channel put the video up (None when YouTube didn't answer). A
    search inside a channel also shows YouTube's paid films (Coco, Minions, Anora), which never
    belong in the Library."""
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={vid}")
    try:
        info = json.loads(fetch(url, tries=2))
    except Exception:  # noqa: BLE001
        return None
    author_url = info.get("author_url", "")
    return (cid in author_url or (handle.startswith("@") and author_url.lower().endswith(handle.lower()))
            or is_owner(info.get("author_name", ""), query))


def films(kept, today):
    """Adds full films from FILM_CHANNELS to kept."""
    for name, handles, query, language in FILM_CHANNELS:
        handle, cid = channel_id(handles, query)
        if not cid:
            print(f"{name}: channel not found", file=sys.stderr)
            continue
        videos, seen = [], set()
        searches = ["full movie"] + (PUNJABI_SEARCHES if language == "Punjabi" else [])
        for url in [f"https://www.youtube.com/channel/{cid}/videos"] + [
                f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q}) for q in searches]:
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
            if language == "Punjabi" and name not in ALL_PUNJABI and not re.search(r"punjabi", title, re.I):
                continue
            if language == "Hindi" and OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            parts = [p.strip() for p in title.split("|")]
            movie = movie_name(parts[1] if name in NAME_SECOND and len(parts) >= 3 else title)
            if not movie:
                continue
            if vid in kept and kept[vid].get("owner_ok"):
                kept[vid]["seen"] = today.isoformat()
                continue
            own = uploaded_by(vid, cid, handle, query)
            if own is False:
                kept.pop(vid, None)  # a paid YouTube film that a channel search shows, not the label's own
                continue
            if own is None:
                continue  # ask again tomorrow
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
                kept[vid]["owner_ok"] = True
            elif not plays(vid):
                continue  # its owner doesn't let it play in other apps
            else:
                kept[vid] = {"movie": movie, "channel": name, "group": name, "language": language,
                             "title": title, "added": today.isoformat(), "owner_ok": True}
                new += 1
        for vid in [v for v, e in kept.items() if e.get("movie") and e.get("channel") == name and not e.get("owner_ok")]:
            own = uploaded_by(vid, cid, handle, query)  # films listed before the uploader check
            if own is False:
                print(f"    off, not {name}'s own: {kept.pop(vid)['movie']}")
            elif own:
                kept[vid]["owner_ok"] = True
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
            urls += [f"https://www.youtube.com/channel/{cid}/search?query=telefilm",
                     f"https://www.youtube.com/channel/{cid}/search?query=full+telefilm"]
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
    hindi_serials.add(kept, today)  # StarPlus, Sony, Colors, &TV, Dangal... (show name anywhere in the title)
    named_shows.add(kept, today)  # morning shows, Indian comedy, Punjabi comedy and series (by name)
    mta(kept, today)

    # Kept until KEEP_DAYS after a video was last found, so a show still on its channel's
    # page (such as an old PTV classic) stays.
    cutoff = (today - dt.timedelta(days=KEEP_DAYS)).isoformat()
    kept = {k: v for k, v in kept.items() if v.get("seen", v["added"]) >= cutoff and v.get("channel") not in RETIRED}
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
