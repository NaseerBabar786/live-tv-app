#!/usr/bin/env python3
"""
Builds the video lists of our channels that run like Bazaar Hits (1.9.47): official uploads
from well-known YouTube channels, played one after another in YouTube's own embedded player
on tv.bulkbazaar.ca/channel/ytc.html?c=<id> (also inside the app), locked so nobody can pause,
skip or leave for YouTube. Nothing is downloaded or re-hosted, as YouTube's terms require.

  2 Bazaar Cinema  full films from the studios' own channels
  3 Bazaar Music   Punjabi, Sufi and qawwali from the labels' channels and Coke Studio (film songs are on 4)
  5 Bazaar Kids    cartoons and English kids' shows from the makers' channels
  6 Bazaar Sports  mostly cricket (ICC, PCB, BCCI, PSL, IPL...), plus wrestling (WWE, AEW), Canadian favourites (NHL, Sportsnet, TSN, Blue Jays, Raptors, CFL) and other popular sports
  7 Bazaar Travel  tourism boards and travel shows
  8 Bazaar Comedy  comedy shows from their channels
  9 Bazaar Movies English  full English films from studios' and distributors' free-movie channels
 10 Bazaar Movies Hindi    full Hindi films from the studios' channels
 11 Bazaar Dramas  full episodes of Pakistani dramas from the TV channels' own channels
 12 Bazaar Cooking recipes and cooking shows from the cooks' own channels
 13 Latest Movies  the newest full films in Hindi, English, Punjabi and Urdu from the studios',
                   labels' and TV channels' own uploads, newest first (no logo of ours on it)
 14 Bazaar Teens  science, cartoons, challenges and talent shows for 12 to 16 year olds

Only the channel that really owns each handle is used (its name must match). Videos found on
earlier runs are kept for KEEP_DAYS, so each list builds up. The public-domain schedules
(build_filmein.py, build_archive_channels.py, build_sur.py) stay as the backup the page falls
back to when YouTube won't play.

Writes docs/channel/yt-<id>.json. Standard library only.
Run: python3 tools/build_youtube_channels.py [--channel ID]
"""
import argparse
import datetime as dt
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from build_dramas import channel_id, fetch, videos_feed, videos_page  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP_DAYS = 180
MAX_VIDEOS = 400

# Our channels play Urdu, Hindi, Punjabi and English programmes (the owner's wish, 2026-10-06): a
# title naming another language is left out, unless it also says it's in one of ours ("Hindi dubbed").
OTHER_LANGUAGE = re.compile(r"\b(tamil|telugu|kannada|malayalam|marathi|gujarati|bengali|bangla|bhojpuri|odia|oriya|"
                            r"assamese|nepali|sinhala|haryanvi|rajasthani|spanish|español|espanol|portugu[eê]s|french|"
                            r"français|deutsch|german|arabic|عربي|türkçe|turkce|indonesia|bahasa|russian|русский|"
                            r"chinese|中文|japanese|日本語|korean|한국어|italiano|thai|vietnamese)\b", re.I)
OUR_LANGUAGE = re.compile(r"\b(hindi|urdu|punjabi|english)\b", re.I)


def other_language(title):
    return bool(OTHER_LANGUAGE.search(title)) and not OUR_LANGUAGE.search(title)


# Never on our channels, whatever the source.
NEVER = r"trailer|teaser|#shorts?\b|\bshorts\b|promo|reaction|announcement|first look|motion poster|\blive\b|livestream|premiere"

CHANNELS = {
    "filmein": {
        "name": "Bazaar Cinema", "mins": (70, 200), "search": "full movie",
        "keep": r"full (movie|film)|movie|film",
        "skip": r"scene|song|jukebox|comedy scenes|best of|spoof",
        "sources": [
            ("Shemaroo", ["@ShemarooMovies", "@shemaroo"], "Shemaroo"),
            ("Rajshri", ["@rajshri", "@RajshriFilms"], "Rajshri"),
            ("Ultra", ["@UltraMovieParlour", "@UltraBollywood"], "Ultra"),
            ("Goldmines", ["@GoldminesTelefilms", "@Goldmines"], "Goldmines"),
            ("Pen Movies", ["@PenMovies"], "Pen Movies"),
            ("Venus", ["@VenusMovies", "@venusmovies"], "Venus"),
        ],
    },
    "sur": {
        # More sources and searches (2026-10-07): the channel had about 11 hours and repeated its day.
        "name": "Bazaar Music", "mins": (2, 15), "search": ["official video", "qawwali", "sufi", "punjabi song"],
        "skip": r"jukebox|full album|non ?stop|mashup|audio|lyric|lyrical|making|interview|bts|behind the scenes",
        "sources": [
            ("White Hill Music", ["@WhiteHillMusic"], "White Hill"),
            ("Desi Melodies", ["@DesiMelodies"], "Desi Melodies"),
            ("Geet MP3", ["@GeetMP3"], "Geet MP3"),
            ("Oriental Star Agencies", ["@OSAWorldwide", "@OrientalStarAgencies"], "Oriental Star|OSA"),
            ("Saga Music", ["@SagaMusic", "@SagaMusicOfficial"], "Saga"),
            ("Speed Records", ["@SpeedRecords"], "Speed Records"),
            ("T-Series Apna Punjab", ["@TSeriesApnaPunjab", "@tseriesapnapunjab"], "Apna Punjab"),
            ("Coke Studio Pakistan", ["@cokestudio", "@CokeStudioPakistan"], "Coke Studio"),
            ("Jass Records", ["@JassRecords"], "Jass Records"),
            ("Humble Music", ["@HumbleMusic"], "Humble Music"),
        ],
    },
    "kids": {
        "name": "Bazaar Kids", "mins": (2, 60),
        "skip": r"toy|unboxing|scary|horror|prank",
        "sources": [
            ("Ghulam Rasool", ["@GhulamRasoolCartoon", "@ghulamrasool", "@GhulamRasoolOfficial", "@KidsLandUrdu"], "Ghulam Rasool|Kids Land"),
            ("ChuChu TV Hindi", ["@ChuChuTVHindi", "@ChuChuTVHindiRhymes"], "ChuChu TV Hindi|ChuChuTV Hindi"),
            ("Infobells Hindi", ["@InfobellsHindi", "@infobellshindi"], "Infobells"),
            ("Jugnu Kids", ["@JugnuKids", "@jugnukids"], "Jugnu Kids"),
            ("ChuChu TV", ["@ChuChuTV"], "ChuChu TV"),
            ("Cocomelon", ["@CoComelon", "@cocomelon"], "CoComelon"),
            ("Masha and the Bear", ["@MashaBearEN", "@MashaandtheBear"], "Masha and The Bear"),
            ("Peppa Pig", ["@PeppaPigOfficial"], "Peppa Pig"),
            ("Kids TV Urdu", ["@KidsTVUrdu"], "Kids TV"),
            # English programmes for kids (the owner's wish, 2026-10-07), from the shows' own channels.
            ("Bluey", ["@BlueyOfficialChannel", "@Bluey"], "Bluey"),
            ("Super Simple Songs", ["@SuperSimpleSongs"], "Super Simple"),
            ("Pinkfong", ["@Pinkfong", "@PinkfongBabyShark"], "Pinkfong"),
            ("Little Baby Bum", ["@LittleBabyBum"], "Little Baby Bum"),
            ("Blippi", ["@Blippi"], "Blippi"),
            ("Sesame Street", ["@SesameStreet"], "Sesame Street"),
            ("PBS Kids", ["@pbskids", "@PBSKIDS"], "PBS KIDS|PBS Kids"),
            ("PAW Patrol", ["@PAWPatrolOfficial", "@pawpatrol"], "PAW Patrol"),
            ("Pocoyo", ["@PocoyoEnglish", "@Pocoyo"], "Pocoyo"),
            ("Oddbods", ["@Oddbods"], "Oddbods"),
            ("Mr Bean Cartoon", ["@MrBeanCartoonWorld", "@MrBeanCartoon"], "Mr Bean"),
            ("Numberblocks", ["@Numberblocks"], "Numberblocks"),
            ("Hey Duggee", ["@HeyDuggeeOfficial", "@HeyDuggee"], "Hey Duggee"),
            ("Thomas & Friends", ["@ThomasAndFriends", "@thomasandfriends"], "Thomas"),
        ],
        # Each English show gets a share, so the Urdu and Hindi cartoons stay on the channel too.
        "cap": {label: 20 for label in ("Bluey", "Super Simple Songs", "Pinkfong", "Little Baby Bum", "Blippi",
                                        "Sesame Street", "PBS Kids", "PAW Patrol", "Pocoyo", "Oddbods",
                                        "Mr Bean Cartoon", "Numberblocks", "Hey Duggee", "Thomas & Friends")},
    },
    "sports": {
        "name": "Bazaar Sports", "mins": (2, 45), "search": "highlights",
        "skip": r"podcast|press conference|interview|reaction|preview|prediction|draw|ticket|bet",
        # Cricket is the main part, then wrestling, then the most-watched other sports (the owner's wish, 2026-10-06).
        "sources": [
            ("ICC", ["@ICC"], "ICC"),
            ("Pakistan Cricket", ["@TheRealPCB", "@PakistanCricketBoard"], "Pakistan Cricket"),
            ("BCCI", ["@BCCI", "@bcci"], "BCCI"),
            ("PSL", ["@thepsl", "@PSL"], "PSL|Pakistan Super League"),
            ("IPL", ["@IPL"], "IPL|Indian Premier League"),
            ("England Cricket", ["@englandcricket"], "England"),
            ("Cricket Australia", ["@cricketcomau", "@CricketAustralia"], "cricket.com.au|Cricket Australia"),
            ("CPL", ["@CPLT20"], "CPL|Caribbean Premier League"),
            ("WWE", ["@WWE"], "WWE"),
            ("AEW", ["@AEW", "@AllEliteWrestling"], "All Elite Wrestling|AEW"),
            ("FIFA", ["@FIFA"], "FIFA"),
            ("Premier League", ["@premierleague"], "Premier League"),
            ("NBA", ["@NBA"], "NBA"),
            ("Formula 1", ["@Formula1"], "FORMULA 1|Formula 1"),
            ("Pro Kabaddi", ["@ProKabaddi", "@prokabaddileague"], "Pro Kabaddi|ProKabaddi"),
            # Popular in Canada: hockey, the Raptors, the Blue Jays and the CFL.
            ("NHL", ["@NHL"], "NHL"),
            ("Sportsnet", ["@Sportsnet", "@sportsnet"], "Sportsnet"),
            ("TSN", ["@TSN", "@tsn"], "TSN"),
            ("Blue Jays", ["@BlueJays", "@bluejays"], "Blue Jays|Toronto Blue Jays"),
            ("Raptors", ["@Raptors", "@raptors"], "Raptors|Toronto Raptors"),
            ("CFL", ["@CFL", "@cfl"], "CFL|Canadian Football League"),
        ],
        # Big main events come round often (marked "top"): the owner's wish, 2026-10-06.
        "events": r"final|semi-?final|world cup|champions trophy|asia cup|t20 world|ashes|test series|odi series|"
                  r"wrestlemania|summerslam|royal rumble|survivor series|money in the bank|elimination chamber|crown jewel|"
                  r"night of champions|all in|double or nothing|full gear|revolution|playoff|stanley cup|grey cup|"
                  r"world series|nba finals|champions league|el clasico|grand prix|derby",
        # Fewer from the non-cricket sources, so cricket stays about half the channel.
        "cap": {"AEW": 25, "FIFA": 20, "Premier League": 20, "NBA": 15, "Formula 1": 15, "Pro Kabaddi": 15, "WWE": 60,
                "NHL": 20, "Sportsnet": 15, "TSN": 15, "Blue Jays": 10, "Raptors": 10, "CFL": 10},
    },
    "travel": {
        # More sources and searches (2026-10-07): the channel had about 6 hours and repeated its day.
        "name": "Bazaar Travel", "mins": (2, 60), "search": ["travel guide", "things to do", "episode"],
        "skip": r"podcast|interview|news|press|webinar|conference|recipe",
        "sources": [
            ("Incredible India", ["@IncredibleIndia", "@incredibleindia"], "Incredible India"),
            ("Lonely Planet", ["@lonelyplanet"], "Lonely Planet"),
            ("Visit Dubai", ["@VisitDubai", "@visitdubai"], "Visit Dubai"),
            ("Visit Saudi", ["@VisitSaudi"], "Visit Saudi"),
            ("Türkiye", ["@GoTurkiye", "@goturkiye"], "Go Türkiye|GoTürkiye|Turkiye"),
            ("Expedia", ["@Expedia", "@ExpediaTV"], "Expedia"),
            ("Rick Steves", ["@RickStevesEurope", "@ricksteves"], "Rick Steves"),
            ("Kerala Tourism", ["@KeralaTourism", "@keralatourism"], "Kerala Tourism"),
            ("Switzerland Tourism", ["@MySwitzerland", "@myswitzerland"], "Switzerland"),
            ("Visit Maldives", ["@VisitMaldives", "@visitmaldives"], "Maldives"),
            ("Destination Canada", ["@ExploreCanada", "@DestinationCanada"], "Canada"),
            ("VisitBritain", ["@VisitBritain", "@visitbritain"], "VisitBritain|Visit Britain"),
            ("Kara and Nate", ["@KaraandNate"], "Kara and Nate"),
        ],
    },
    "comedy": {
        "name": "Bazaar Comedy", "mins": (2, 45),
        "skip": r"podcast|interview|news|vlog|reaction|roast|adult|18\+",
        "sources": [
            ("Mr Bean", ["@MrBean"], "Mr Bean"),
            ("Taarak Mehta", ["@TaarakMehtaKaOoltahChashmah", "@SonySAB"], "Taarak Mehta|Sony SAB"),
            ("Bulbulay", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital"),
            ("The Kapil Sharma Show", ["@SonyTV", "@SETIndia"], "Sony Entertainment Television|SET India"),
            ("Shaun the Sheep", ["@shaunthesheep"], "Shaun the Sheep"),
        ],
        # A source channel with many kinds of shows: only these shows are taken from it.
        "only": {"Bulbulay": r"bulbulay", "The Kapil Sharma Show": r"kapil", "Taarak Mehta": r"taarak|tmkoc|mehta"},
    },
    "english": {
        "name": "Bazaar Movies English", "mins": (70, 200), "search": "full movie",
        "keep": r"full (movie|film)|movie|film",
        "skip": r"scene|clip|horror|slasher|erotic|18\+|hindi|dubbed|spoof",
        "sources": [
            ("FilmRise Movies", ["@FilmRiseMovies", "@FilmRiseFilms"], "FilmRise"),
            ("Popcornflix", ["@Popcornflix", "@popcornflix"], "Popcornflix"),
            ("Paramount Movies", ["@ParamountMovies"], "Paramount Movies|Paramount"),
            ("Movie Central", ["@MovieCentral", "@MovieCentralFilms"], "Movie Central"),
            ("Moviegrams", ["@Moviegrams", "@moviegrams"], "Moviegrams"),
            ("Family Movies", ["@FamilyMoviesForFree", "@ClassicFamilyMovies"], "Family"),
        ],
    },
    "hindi": {
        "name": "Bazaar Movies Hindi", "mins": (70, 200),
        "search": ["hindi full movie", "new hindi movie %(year)s", "new hindi movie %(last)s"],
        # Mostly new films (the owner's wish, 2026-10-06): a film whose title names a year from the
        # last four is "top", and the channel page plays those three times as often as the rest.
        "recent_years": 4,
        "keep": r"full (movie|film)|movie|film",
        "skip": r"scene|song|jukebox|comedy scenes|best of|spoof|clip",
        "sources": [
            ("Goldmines Bollywood", ["@GoldminesBollywood", "@GoldminesHindi"], "Goldmines"),
            ("Tips Films", ["@TipsFilms", "@tipsfilms"], "Tips"),
            ("B4U Movies", ["@B4UMovies", "@b4umovies"], "B4U"),
            ("Zee Studios", ["@ZeeStudios", "@zeestudios"], "Zee"),
            ("Eros Now", ["@ErosNow", "@erosnow"], "Eros"),
            ("Shemaroo Movies", ["@ShemarooMovies"], "Shemaroo"),
            ("Pen Movies", ["@PenMovies"], "Pen Movies"),
        ],
    },
    "dramas": {
        "name": "Bazaar Dramas", "mins": (18, 75), "search": "episode",
        # Full episodes only, no teasers, OSTs or clips.
        "keep": r"episode|\bep\b|\bepi\b|ep\s*\d|قسط",
        "skip": r"\bost\b|title song|scene|best moment|clip|bts|behind the scenes|review|highlights|recap|interview|morning show|news",
        "sources": [
            ("HUM TV", ["@HUMTV", "@humtvpk"], "HUM TV"),
            ("ARY Digital", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital"),
            ("Har Pal Geo", ["@HarPalGeo", "@harpalgeo"], "HAR PAL GEO|Har Pal Geo"),
            ("Green Entertainment", ["@GreenTVEntertainment", "@greenentertainment"], "Green"),
            ("Express TV", ["@ExpressTV", "@expresstv"], "Express TV"),
            ("Geo Entertainment", ["@GeoEntertainment"], "Geo"),
        ],
    },
    "cooking": {
        "name": "Bazaar Cooking", "mins": (4, 45),
        "skip": r"vlog|q ?& ?a|giveaway|unboxing|review|haul|podcast|mukbang|eating challenge",
        "sources": [
            ("Food Fusion", ["@FoodFusionPk", "@foodfusion"], "Food Fusion"),
            ("Kitchen with Amna", ["@KitchenWithAmna", "@kitchenwithamna"], "Kitchen With Amna"),
            ("Masala TV", ["@MasalaTVRecipes", "@MasalaTV"], "Masala TV|Masala"),
            ("Sanjeev Kapoor", ["@SanjeevKapoorKhazana", "@sanjeevkapoorkhazana"], "Sanjeev Kapoor"),
            ("Ranveer Brar", ["@RanveerBrar", "@ranveerbrar"], "Ranveer Brar"),
            ("Kabita's Kitchen", ["@KabitasKitchen", "@kabitaskitchen"], "Kabita"),
            ("Chef Zakir", ["@ChefZakirOfficial"], "Zakir"),
            ("Shireen Anwar", ["@ShireenAnwarRecipes"], "Shireen"),
            ("Get Curried", ["@GetCurried", "@getcurried"], "Get Curried"),
        ],
    },
    # For 12 to 16 year olds (the owner's wish, 2026-10-07); Bazaar Kids stays for small children.
    "teens": {
        "name": "Bazaar Teens", "mins": (3, 30),
        "skip": r"horror|scary|gore|explicit|18\+|podcast|vlog|merch|sponsor|giveaway|toy|nursery|rhymes?|preschool|toddler",
        "sources": [
            # Science and how things work
            ("Kurzgesagt", ["@kurzgesagt"], "Kurzgesagt"),
            ("TED-Ed", ["@TEDEd"], "TED-Ed"),
            ("SciShow", ["@SciShow"], "SciShow"),
            ("Veritasium", ["@veritasium"], "Veritasium"),
            ("Mark Rober", ["@MarkRober"], "Mark Rober"),
            ("CrashCourse", ["@crashcourse"], "CrashCourse|Crash Course"),
            ("National Geographic", ["@NatGeo"], "National Geographic"),
            ("Fact Tech", ["@FactTechz"], "FactTechz|Fact Tech"),
            # Cartoons and shows
            ("Cartoon Network", ["@cartoonnetwork"], "Cartoon Network"),
            ("Disney Channel", ["@disneychannel"], "Disney Channel"),
            ("Nickelodeon", ["@Nickelodeon"], "Nickelodeon"),
            ("Nick India", ["@NickIndia", "@nickindia"], "Nick India|Nickelodeon India"),
            ("Pokemon", ["@pokemon"], "Pokemon|Pokémon"),
            # Challenges, sport tricks and talent shows
            ("Dude Perfect", ["@DudePerfect"], "Dude Perfect"),
            ("MrBeast", ["@MrBeast"], "MrBeast"),
            ("Got Talent Global", ["@GotTalentGlobal"], "Got Talent"),
        ],
        "cap": {label: 30 for label in ("Kurzgesagt", "TED-Ed", "SciShow", "Veritasium", "Mark Rober", "CrashCourse",
                                        "National Geographic", "Fact Tech", "Cartoon Network", "Disney Channel",
                                        "Nickelodeon", "Nick India", "Pokemon", "Dude Perfect", "MrBeast", "Got Talent Global")},
    },
    # The owner's wish (2026-10-06): just "Latest Movies", newest uploads first, no logo of ours. Only the
    # rights holders' own channels: re-uploads of new films by anyone else are pirated and soon taken down.
    "latest": {
        "name": "Latest Movies", "mins": (60, 200), "search": "full movie",
        "newest": True, "max_age": 365, "max": 120,
        "keep": r"full (movie|film)|movie|film|telefilm",
        "skip": r"scene|song|jukebox|comedy scenes|best of|spoof|clip|horror|slasher|erotic|18\+|review|explained|recap",
        "sources": [
            # Hindi (new South films dubbed in Hindi are most of what the studios put up)
            ("Goldmines", ["@GoldminesTelefilms", "@Goldmines"], "Goldmines"),
            ("Goldmines Bollywood", ["@GoldminesBollywood", "@GoldminesHindi"], "Goldmines"),
            ("Pen Movies", ["@PenMovies"], "Pen Movies"),
            ("Shemaroo Movies", ["@ShemarooMovies"], "Shemaroo"),
            ("Ultra Movie Parlour", ["@UltraMovieParlour"], "Ultra"),
            ("Tips Films", ["@TipsFilms", "@tipsfilms"], "Tips"),
            ("B4U Movies", ["@B4UMovies", "@b4umovies"], "B4U"),
            ("Zee Studios", ["@ZeeStudios", "@zeestudios"], "Zee"),
            ("RKD Studios", ["@RKDStudios", "@rkdstudios"], "RKD"),
            ("Aditya Movies", ["@AdityaMovies", "@adityamovies"], "Aditya"),
            ("Rajshri", ["@rajshri", "@RajshriFilms"], "Rajshri"),
            # English
            ("FilmRise Movies", ["@FilmRiseMovies", "@FilmRiseFilms"], "FilmRise"),
            ("Popcornflix", ["@Popcornflix", "@popcornflix"], "Popcornflix"),
            ("Paramount Movies", ["@ParamountMovies"], "Paramount Movies|Paramount"),
            ("Movie Central", ["@MovieCentral", "@MovieCentralFilms"], "Movie Central"),
            ("Moviegrams", ["@Moviegrams", "@moviegrams"], "Moviegrams"),
            ("Maverick Movies", ["@MaverickMovies", "@maverickmovies"], "Maverick"),
            # Punjabi
            ("White Hill", ["@WhiteHillMusic", "@WhiteHillStudios"], "White Hill", "punjabi full movie"),
            ("Saga", ["@SagaMusic", "@SagaMusicOfficial", "@SagaHits"], "Saga", "punjabi full movie"),
            ("Speed Records", ["@SpeedRecords"], "Speed Records", "full movie"),
            ("Tips Punjabi", ["@TipsPunjabi"], "Tips Punjabi", "full movie"),
            # Urdu (Pakistani films and telefilms from the TV channels)
            ("ARY Digital", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital", "telefilm"),
            ("HUM TV", ["@HUMTV", "@humtvpk"], "HUM TV", "telefilm"),
            ("Har Pal Geo", ["@HarPalGeo", "@harpalgeo"], "HAR PAL GEO|Har Pal Geo", "telefilm"),
            ("Green Entertainment", ["@GreenTVEntertainment", "@greenentertainment"], "Green", "telefilm"),
            ("ARY Films", ["@ARYFilms", "@aryfilms"], "ARY Films", "full movie"),
        ],
        # The newest few from each source, so every language gets its share.
        "cap": {"*": 5},
    },
}

SUMMARIES = []


def upload_dates(chan):
    """When each of the channel's 15 newest uploads went up (its RSS feed): {video id: "yyyy-mm-dd"}."""
    try:
        feed = fetch(f"https://www.youtube.com/feeds/videos.xml?channel_id={chan}", tries=2)
    except Exception as e:  # noqa: BLE001
        print(f"  feed: {e}", file=sys.stderr)
        return {}
    return dict(re.findall(r"<yt:videoId>([\w-]{11})</yt:videoId>.*?<published>(\d{4}-\d\d-\d\d)", feed, re.S))


def build(cid, ch, today):
    out = os.path.join(ROOT, "docs", "channel", f"yt-{cid}.json")
    old = {}
    if os.path.exists(out):
        old = {v["id"]: v for v in json.load(open(out, encoding="utf-8")).get("videos", [])}
    skip = re.compile(rf"{NEVER}|{ch['skip']}", re.I)
    keep = re.compile(ch["keep"], re.I) if ch.get("keep") else None
    low, high = ch["mins"]
    found, counts = {}, []
    # A source may name its own search (a 4th item) in place of the channel's.
    for label, handles, name, *own in ch["sources"]:
        _, chan = channel_id(handles, name)
        if not chan:
            print(f"{label}: channel not found", file=sys.stderr)
            counts.append(f"{label} 0 (not found)")
            continue
        videos = []
        pages = [f"https://www.youtube.com/channel/{chan}/videos"]
        searches = own[0] if own else ch.get("search") or []
        for query in [searches] if isinstance(searches, str) else searches:
            query = query % {"year": today.year, "last": today.year - 1}
            pages.append(f"https://www.youtube.com/channel/{chan}/search?query=" + query.replace(" ", "+"))
        for url in pages:
            try:
                videos += videos_page(url, with_age=True)
            except Exception as e:  # noqa: BLE001
                print(f"  {url}: {e}", file=sys.stderr)
        if not videos:
            try:
                videos = [v + (None,) for v in videos_feed(chan)]
            except Exception as e:  # noqa: BLE001
                print(f"  feed: {e}", file=sys.stderr)
        only = re.compile(ch.get("only", {}).get(label, ""), re.I) if label in ch.get("only", {}) else None
        kept = dated = 0
        dates = upload_dates(chan) if ch.get("newest") else {}
        for vid, title, mins, age in videos:
            if vid in found or skip.search(title) or other_language(title) or (keep and not keep.search(title)) or (only and not only.search(title)):
                continue
            # A video with no known length (from the feed) is kept on its title alone.
            if mins is not None and not low <= mins <= high:
                continue
            if kept >= ch.get("cap", {}).get(label, ch.get("cap", {}).get("*", MAX_VIDEOS)):
                break
            found[vid] = {"id": vid, "title": title.strip(), "label": label, "mins": mins,
                          "found": old.get(vid, {}).get("found", today.isoformat())}
            if ch.get("newest"):
                # When it went up on YouTube: the channel's feed (its 15 newest), else "3 weeks ago" on the
                # page, else as known before; a film with no known date goes after the dated ones.
                up = dates.get(vid) or ((today - dt.timedelta(days=age)).isoformat() if age is not None else old.get(vid, {}).get("up"))
                if up and (today - dt.date.fromisoformat(up)).days > ch["max_age"]:
                    del found[vid]
                    continue
                if up:
                    found[vid]["up"] = up
                    dated += 1
            kept += 1
        print(f"{label}: {len(videos)} videos, {kept} kept")
        counts.append(f"{label} {kept}" + (f" ({dated} dated)" if ch.get("newest") else ""))

    labels = {label for label, *_ in ch["sources"]}
    for vid, v in old.items():
        # A source taken off the list goes with its videos.
        # (Latest Movies keeps only films whose upload day is known.)
        if ch.get("newest") and not v.get("up"):
            continue
        if vid not in found and v.get("label") in labels and not other_language(v["title"]) and (today - dt.date.fromisoformat(v.get("up", v["found"]))).days <= ch.get("max_age", KEEP_DAYS):
            found[vid] = v
    # Main events from the last two weeks, and anything found in the last two days, are "top":
    # the channel page plays them far more often (Bazaar Sports, the owner's wish, 2026-10-06).
    if ch.get("events"):
        events = re.compile(ch["events"], re.I)
        for v in found.values():
            age = (today - dt.date.fromisoformat(v["found"])).days
            v["top"] = bool(events.search(v["title"]) and age <= 14) or age <= 2
    if ch.get("recent_years"):
        for v in found.values():
            years = [int(y) for y in re.findall(r"\b(19[5-9]\d|20[0-4]\d)\b", v["title"])]
            v["top"] = bool(years) and max(years) >= today.year - ch["recent_years"]
    # Newest films first, so the list keeps them when it is full (Latest Movies: by the day each went up on YouTube).
    if ch.get("newest"):
        newest = lambda v: (bool(v.get("up")), v.get("up", ""))  # noqa: E731
    else:
        newest = lambda v: (bool(v.get("top")), v["found"])  # noqa: E731
    videos = sorted(found.values(), key=newest, reverse=True)[:ch.get("max", MAX_VIDEOS)]
    summary = f"{ch['name']}: {len(videos)} videos ({', '.join(counts)})"
    if ch.get("events") or ch.get("recent_years"):
        summary += f"; {sum(1 for v in videos if v.get('top'))} top ({'main events and newest' if ch.get('events') else 'new films'})"
    SUMMARIES.append(summary)
    if len(videos) < 5:
        print(f"{ch['name']}: too few videos; keeping the old list.", file=sys.stderr)
        return False
    with open(out, "w", encoding="utf-8") as f:
        json.dump({"name": ch["name"], "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                   "videos": videos}, f, ensure_ascii=False, indent=1)
        f.write("\n")
    print(f"Wrote {os.path.relpath(out, ROOT)}: {summary}")
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", choices=sorted(CHANNELS))
    args = ap.parse_args()
    today = dt.date.today()
    ok = [build(cid, CHANNELS[cid], today) for cid in ([args.channel] if args.channel else CHANNELS)]
    if os.environ.get("GITHUB_ACTIONS"):
        # One notice for all of them: GitHub shows only 10 per step, and there are more channels than that.
        print("::notice title=YouTube channel lists::" + "%0A".join(SUMMARIES))
    if not any(ok):
        sys.exit("No channel list could be built.")


if __name__ == "__main__":
    main()
