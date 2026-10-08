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
 11 Bazaar Dramas Urdu  full episodes of Pakistani dramas from the TV channels' own channels
 12 Bazaar Cooking recipes and cooking shows from the cooks' own channels
 13 Latest Movies  the newest full films in Hindi, English, Punjabi and Urdu from the studios',
                   labels' and TV channels' own uploads, newest first (no logo of ours on it)
 14 Bazaar Teens  science, cartoons, challenges and talent shows for 12 to 16 year olds
 16 Bazaar Dramas Hindi  full episodes of Hindi serials from the Indian TV channels' own channels
 17 Bazaar Shayari  Urdu and Hindi poetry: mushairas, kavi sammelan and poets reciting, from the
                    organisers', TV channels' and poets' own channels

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
from no_horror import is_horror  # noqa: E402  (the owner's rule 2026-10-08: no horror on our channels)

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


# Every channel is in one language (the owner, 2026-10-08): Urdu "ur", Hindi "hi", English "en", Punjabi "pa".
# A video is in its source's language ("lang", or "langs" per source), unless its title names one of
# Urdu, Hindi or Punjabi alone ("Punjabi Song" from Coke Studio, "Hindi Dubbed"). A channel with "split"
# writes each language's videos to that language's list and leaves out the rest.
TITLE_LANGS = {"ur": re.compile(r"\burdu\b", re.I), "hi": re.compile(r"\bhindi\b", re.I), "pa": re.compile(r"\bpunjabi\b", re.I)}


def language_of(ch, label, title):
    named = [code for code, rx in TITLE_LANGS.items() if rx.search(title)]
    if len(named) == 1:
        return named[0]
    return ch.get("langs", {}).get(label, ch.get("lang"))


# Never on our channels, whatever the source.
# Reality, game, talent, chat and cooking shows: never on the drama channels (the channel-fit rule, 2026-10-08).
NOT_DRAMA = (r"reality|tamasha|\bbuzz\b|bigg boss|game show|jeeto|laughter chefs|kapil|khatron|indian idol|superstar singer|dance|"
             r"talent|got latent|shark tank|masterchef|cooking|recipe|kitchen|mix plate|morning|talk show|podcast|elimination|"
             r"pati patni aur panga|the journalist")

NEVER = r"trailer|teaser|#shorts?\b|\bshorts\b|promo|reaction|announcement|first look|motion poster|\blive\b|livestream|premiere"

CHANNELS = {
    "filmein": {
        "lang": "hi",
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
        # One language per channel (the owner, 2026-10-08): Punjabi songs stay here (3 -> Spark Music Punjabi),
        # Urdu ones go to Spark Music Urdu (musicur).
        "lang": "pa", "langs": {"Coke Studio Pakistan": "ur", "Oriental Star Agencies": "ur"},
        "split": {"pa": "sur", "ur": "musicur"},
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
        "lang": "en", "langs": {"Ghulam Rasool": "ur", "Jugnu Kids": "ur", "Kids TV Urdu": "ur",
                                "ChuChu TV Hindi": "hi", "Infobells Hindi": "hi"},
        "split": {"en": "kids", "hi": "kidshi", "ur": "kidsur"},
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
        "lang": "en", "langs": {"Pro Kabaddi": "hi"},
        "split": {"en": "sports", "hi": "sportshi"},
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
        "lang": "en",
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
        "lang": "hi", "langs": {"Mr Bean": "en", "Shaun the Sheep": "en", "Just For Laughs Gags": "en", "The Pink Panther": "en",
                                "Laurel and Hardy": "en", "Dry Bar Comedy": "en", "Bulbulay": "ur", "Sawa Teen": "ur",
                                "Hum Sab Umeed Se Hain": "ur", "Mazaaq Raat": "ur"},
        "split": {"hi": "comedy", "ur": "comedyur", "en": "comedyen"},
        "name": "Bazaar Comedy", "mins": (2, 50),
        "sources": [
            ("Mr Bean", ["@MrBean"], "Mr Bean"),
            ("Taarak Mehta", ["@TaarakMehtaKaOoltahChashmah", "@SonySAB"], "Taarak Mehta|Sony SAB"),
            ("Bulbulay", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital"),
            ("The Kapil Sharma Show", ["@SonyTV", "@SETIndia"], "Sony Entertainment Television|SET India"),
            ("Shaun the Sheep", ["@shaunthesheep"], "Shaun the Sheep"),
            # More variety (the owner, 2026-10-08: "so many times Taarak Mehta ... English comedy programs
            # ... stand-up comedy shows"). Family-friendly shows from their own channels only.
            # Hindi and Urdu sitcoms and comedy shows
            ("Bhabiji Ghar Par Hain", ["@andtvchannel", "@AndTV"], "&TV|And TV"),
            ("Wagle Ki Duniya", ["@SonySAB", "@sonysab"], "Sony SAB"),
            ("Sawa Teen", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital"),
            ("Hum Sab Umeed Se Hain", ["@HarPalGeo", "@GeoEntertainment"], "HAR PAL GEO|Har Pal Geo|Geo Entertainment"),
            ("Mazaaq Raat", ["@DunyaNews", "@dunyanewsofficial"], "Dunya News"),
            # English comedy
            ("Just For Laughs Gags", ["@JustForLaughsGags", "@justforlaughsgags"], "Just For Laughs Gags"),
            ("The Pink Panther", ["@ThePinkPanther", "@officialpinkpanther"], "Pink Panther"),
            ("Laurel and Hardy", ["@LaurelandHardyOfficial", "@laurelandhardy"], "Laurel and Hardy|Laurel & Hardy"),
            # Clean stand-up comedy
            ("Dry Bar Comedy", ["@DryBarComedy", "@drybarcomedy"], "Dry Bar Comedy"),
            ("Zakir Khan", ["@ZakirKhan", "@zakirkhan"], "Zakir Khan"),
            ("Gaurav Kapoor", ["@GauravKapoor", "@gauravkapoorcomedy"], "Gaurav Kapoor"),
        ],
        # A source channel with many kinds of shows: only these shows are taken from it.
        "only": {"Bulbulay": r"bulbulay", "The Kapil Sharma Show": r"kapil", "Taarak Mehta": r"taarak|tmkoc|mehta",
                 "Bhabiji Ghar Par Hain": r"bhabi ?ji", "Wagle Ki Duniya": r"wagle", "Sawa Teen": r"sawa teen",
                 "Hum Sab Umeed Se Hain": r"hum sab umeed", "Mazaaq Raat": r"mazaa?q raat"},
        # Stand-up must be clean: nothing marked for grown-ups only.
        "skip": r"podcast|interview|breaking news|news (?:bulletin|headlines)|vlog|reaction|roast|adult|18\+|explicit|uncensored|not for kids|a rated|nsfw",
        # No one show fills the channel: at most this many videos from each (newest kept); the page also
        # lets the shows take turns (mix: true in docs/channel/schedule.js).
        "most": {"*": 25},
    },
    "english": {
        "lang": "en",
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
        "lang": "hi",
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
    # 2 is Urdu dramas and 24 Hindi dramas (the owner, 2026-10-08): two channels, one language each.
    "dramas": {
        "lang": "ur",
        "name": "Bazaar Dramas Urdu", "mins": (18, 75), "search": "episode",
        # Full episodes only, no teasers, OSTs or clips; no reality or game shows (Tamasha) or cooking shows (channel-fit rule).
        "keep": r"episode|\bep\b|\bepi\b|ep\s*\d|قسط",
        "skip": rf"\bost\b|title song|scene|best moment|clip|bts|behind the scenes|review|highlights|recap|interview|morning show|news|{NOT_DRAMA}",
        "sources": [
            ("HUM TV", ["@HUMTV", "@humtvpk"], "HUM TV"),
            ("ARY Digital", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital"),
            ("Har Pal Geo", ["@HarPalGeo", "@harpalgeo"], "HAR PAL GEO|Har Pal Geo"),
            ("Green Entertainment", ["@GreenTVEntertainment", "@greenentertainment"], "Green"),
            ("Express TV", ["@ExpressTV", "@expresstv"], "Express TV"),
            ("Geo Entertainment", ["@GeoEntertainment"], "Geo"),
            ("ARY Zindagi", ["@ARYZindagiOfficial", "@ARYZindagi"], "ARY Zindagi"),
            ("Geo Kahani", ["@GeoKahani"], "Geo Kahani"),
            ("LTN Family", ["@LTNFamily", "@ltnfamily"], "LTN Family"),
            ("PTV Home", ["@PTVHomeOfficial", "@PTVHome"], "PTV Home"),
            ("Aaj Entertainment", ["@AajEntertainment"], "Aaj Entertainment"),
        ],
    },
    "hindidramas": {
        "lang": "hi",
        "name": "Bazaar Dramas Hindi", "mins": (15, 75), "search": ["full episode", "episode"],
        "keep": r"episode|\bep\b|\bepi\b|ep\.?\s*\d|एपिसोड",
        "skip": rf"\bost\b|title (song|track)|best moment|bts|behind the scenes|review|highlights|recap|interview|news|promo|precap|{NOT_DRAMA}",
        # Doordarshan uploads much more than drama: only its serials.
        "only": {"Doordarshan": r"byomkesh|ye hawayein|flop show|tenali|malgudi|hum log|buniyaad|circus|fauji|tehkikaat|surabhi|serial"},
        "sources": [
            ("StarPlus", ["@StarPlus"], "StarPlus|Star Plus"),
            ("Sony SAB", ["@SonySAB"], "Sony SAB"),
            ("Sony Pal", ["@SonyPal"], "Sony Pal"),
            ("SET India", ["@SETIndia", "@SonyTV"], "Sony Entertainment Television|SET India", ["crime patrol full episode", "full episode"]),
            ("Colors TV", ["@ColorsTV"], "Colors"),
            ("And TV", ["@andtvchannel"], "&TV|And TV"),
            ("Dangal TV", ["@DangalTVChannel", "@DangalTV"], "Dangal"),
            ("Shemaroo TV", ["@ShemarooTV", "@shemarootv"], "Shemaroo"),
            ("Shemaroo Umang", ["@ShemarooUmang"], "Shemaroo Umang"),
            ("Sun Neo", ["@SunNeo", "@SunNeoTV"], "Sun Neo"),
            ("Doordarshan", ["@DoordarshanNational", "@ddnational"], "Doordarshan|DD National"),
        ],
    },
    # 17 Spark Shayari (owner, 2026-10-08): Urdu and Hindi poetry recited, never sung (sung ghazals belong on
    # Spark Music), no lessons, talks or panels, no politics, no horror, no other languages.
    "shayari": {
        "name": "Bazaar Shayari", "mins": (2, 150), "search": ["mushaira", "shayari", "kavi sammelan"],
        "keep": r"mushair|musha'?era|mushayra|shayari|shayri|shaayri|\bsher\b|ghazal|nazm|kavi ?sammelan|kavi samm?elan|kavita|kavya|"
                r"poet|poem|recit|kalam|kalaam|مشاعر|شاعر|غزل|نظم|کلام|कवि|कविता|शायर|मुशायर|ग़ज़ल|गज़ल|नज़्म",
        "skip": r"\bsong\b|singer|singing|sung|qawwal|music video|musical|jukebox|\bost\b|lyrical|cover|unplugged|concert|non-?stop|"
                r"learning|module|lesson|lecture|explained|seminar|panel|discussion|in conversation|book launch|rekhta books|dastak|"
                r"tribute|speaks|\btalk\b|podcast|interview|storytelling|aftermovie|\bwhy\b|history of|who shaped|lives|rivalr|prose|nobel|"
                r"by children|school|"
                r"marathi|kashmiri|punjabi|pashto|sindhi|mushairo|angrezi|english mushaira|gujarati|bengali|dogri|"
                r"noha|marsiya|majlis|horror|bhoot|bhut|ghost|chudail|\bdarr?\b|daravn|"
                r"news|debate|politic|election|chunav|चुनाव|modi|rahul gandhi|kejriwal|yogi|imran khan|nawaz|shehbaz|maryam|bjp|"
                r"congress|\bpti\b|pml|gyanesh|reaction|roast|stand ?up|comedy show|meme",
        # Festivals and the Akademi upload much more than poetry: only their mushairas and readings.
        "only": {
            "Sahitya Akademi": r"mushaira|urdu|hindi|kavi|poets'? meet|ghazal|poetry reading",
            "Faiz Festival": r"mushaira|in mushaira|poetry performed|recit",
            "Lahore Literary Festival": r"mushaira",
            "Doordarshan": r"kavi|mushaira|sammelan|kavita",
            "Kumar Vishwas": r"kavi ?sammelan|mushaira|jashn|shayar|ghazal",
        },
        "sources": [
            ("Rekhta", ["@JashneRekhta"], "Jashn-e-Rekhta|Jashn e Rekhta|JashneRekhta"),
            ("Sahitya Akademi", ["@SahityaAkademi"], "Sahitya Akademi"),
            ("DD Urdu", ["@DDUrdu", "@DDUrduOfficial"], "DD Urdu"),
            ("Doordarshan", ["@DoordarshanNational", "@ddnational"], "Doordarshan|DD National"),
            ("PTV Home", ["@PTVHomeOfficial", "@PTVHome"], "PTV Home|PTV"),
            ("PTV National", ["@PTVNationalOfficial", "@PTVNational"], "PTV National|PTV"),
            ("Lahore Literary Festival", ["@LahoreLiteraryFestival"], "Lahore Literary"),
            ("Faiz Festival", ["@FaizFestival"], "Faiz"),
            ("Mushaira Media", ["@MushairaMedia"], "Mushaira Media|Mushaira"),
            ("Sahitya Tak", ["@SahityaTak"], "Sahitya Tak|Sahitya"),
            ("Kumar Vishwas", ["@KumarVishwas"], "Kumar Vishwas"),
            ("Kommune", ["@KommuneIndia"], "Kommune"),
            ("The Social House", ["@TheSocialHouse"], "Social House"),
            ("Hindi Kavita", ["@HindiKavita"], "Hindi Kavita"),
            ("Urdu Studio", ["@UrduStudio"], "Urdu Studio"),
        ],
        "cap": {"*": 60},
        # Urdu poetry stays on Shayari (5); the Hindi sources make Kavi Sammelan (27).
        "lang": "ur", "split": {"ur": "shayari", "hi": "kavi"},
        "langs": {"Rekhta": "ur", "Sahitya Akademi": "ur", "DD Urdu": "ur", "Doordarshan": "hi", "PTV Home": "ur",
                  "PTV National": "ur", "Lahore Literary Festival": "ur", "Faiz Festival": "ur", "Mushaira Media": "ur",
                  "Sahitya Tak": "hi", "Kumar Vishwas": "hi", "Kommune": "hi", "The Social House": "hi",
                  "Hindi Kavita": "hi", "Urdu Studio": "ur"},
    },
    "cooking": {
        "lang": "hi", "langs": {"Food Fusion": "ur", "Kitchen with Amna": "ur", "Masala TV": "ur", "Chef Zakir": "ur",
                                "Shireen Anwar": "ur"},
        "split": {"hi": "cooking", "ur": "cookingur"},
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
        "lang": "en", "langs": {"Fact Tech": "hi", "Nick India": "hi"},
        "split": {"en": "teens", "hi": "teenshi"},
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
    # Punjabi (the owner, 2026-10-08: "a couple more Punjabi channels"). Each goes on air with 50+ programmes.
    "gurbani": {
        # 62: shabad kirtan and paths from the labels' and SGPC's own channels. No ads over it (owner's channel rule).
        "lang": "pa",
        "name": "Bazaar Gurbani", "mins": (5, 180), "search": ["shabad kirtan", "gurbani", "nitnem", "sukhmani sahib"],
        "skip": r"status|whatsapp|ringtone|reels?\b|vlog|interview|news|debate|speech|controvers",
        "sources": [
            ("T-Series Shabad Gurbani", ["@tseriesshabad", "@TSeriesShabadGurbani"], "Shabad Gurbani"),
            ("Amritt Saagar", ["@amrittsaagar", "@AmrittSaagar"], "Amritt Saagar"),
            ("SGPC", ["@officialsgpc", "@SGPCSriAmritsar"], "SGPC|Shiromani"),
            ("Finetouch Gurbani", ["@FinetouchGurbani", "@FinetouchMusic"], "Finetouch"),
        ],
        "most": {"*": 150},
    },
    "moviespa": {
        # 63: full Punjabi films (older years too), comedies included, from the studios' and labels' own channels.
        # The newest ones (Latest Movies' Punjabi films) are put at the front by merge_latest.
        "lang": "pa",
        "name": "Bazaar Movies Punjabi", "mins": (70, 200), "search": ["punjabi full movie", "full punjabi movie", "full movie"],
        "keep": r"punjabi",
        "skip": r"scene|song|jukebox|comedy scenes|best of|spoof|clip|review|explained|recap|hindi dubbed|horror|slasher|erotic|18\+",
        "sources": [
            ("White Hill Studios", ["@WhiteHillStudios", "@WhiteHillDhol", "@WhiteHillMusic"], "White Hill"),
            ("Yellow Music", ["@YellowMusicOfficial", "@YellowMusic"], "Yellow Music"),
            ("Speed Punjabi", ["@SpeedPunjabi", "@speedpunjabi"], "Speed Punjabi"),
            ("ShemarooMe Punjabi", ["@ShemarooMePunjabi", "@ShemarooPunjabi"], "Shemaroo"),
            ("Punjabi Hits", ["@PunjabiHits"], "Punjabi Hits"),
            ("Saga Hits", ["@sagahits", "@SagaMusic"], "Saga"),
            ("Tips Punjabi", ["@TipsPunjabi"], "Tips Punjabi"),
            ("PTC Punjabi Gold", ["@PTCPunjabiGold", "@ptcpunjabigold"], "PTC Punjabi"),
            ("Omjee", ["@OmjeeGroup", "@OmjeeStarStudios"], "Omjee"),
        ],
    },
    "sufi": {
        # 64: Sufi kalam and qawwali, mostly Nusrat Fateh Ali Khan, from the label's own channels.
        "lang": "pa",
        "name": "Bazaar Sufi Qawwali", "mins": (4, 120), "search": ["qawwali", "sufi kalam", "nusrat fateh ali khan"],
        "keep": r"qawwal|kalam|sufi|kafi|dhamal|nusrat|sabri|abida|bulleh|heer|naat|manqabat",
        "skip": r"jukebox|non ?stop|mashup|remix|lyric|status|whatsapp|reels?\b|interview|bts|behind the scenes|#shorts",
        "sources": [
            ("OSA Islamic", ["@OSAIslamic", "@osaislamic"], "OSA Islamic|Oriental Star"),
            ("Nusrat Fateh Ali Khan", ["@NusratFatehAliKhanOfficial", "@NFAKOfficial"], "Nusrat Fateh Ali Khan"),
            ("Sabri Brothers", ["@SabriBrothersOfficial"], "Sabri Brothers"),
            ("Abida Parveen", ["@AbidaParveenOfficial"], "Abida Parveen"),
        ],
    },
    "latest": {
        # Since 2026-10-08 Latest Movies is no channel of its own: each language's newest films lead that
        # language's Movies channel (merge_latest below).
        "lang": "hi", "langs": {"FilmRise Movies": "en", "Popcornflix": "en", "Paramount Movies": "en", "Movie Central": "en",
                                "Moviegrams": "en", "Maverick Movies": "en", "White Hill": "pa", "Saga": "pa",
                                "Speed Records": "pa", "Tips Punjabi": "pa", "ARY Digital": "ur", "HUM TV": "ur",
                                "Har Pal Geo": "ur", "Green Entertainment": "ur", "ARY Films": "ur"},
        # The owner's rule (2026-10-07): only films released this year or last year. The year must be in
        # the title ("Do Khiladi (2026)"), and every year named there must be one of the two, so an old film
        # re-uploaded as "New Released 2026" with "(2018)" in its name stays out.
        "name": "Latest Movies", "mins": (60, 200), "search": ["full movie %(year)s", "full movie %(last)s", "full movie"],
        "newest": True, "max_age": 365, "max": 120, "release_years": 1,
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
            ("White Hill", ["@WhiteHillMusic", "@WhiteHillStudios"], "White Hill", ["punjabi movie %(year)s", "punjabi movie %(last)s"]),
            ("Saga", ["@SagaMusic", "@SagaMusicOfficial", "@SagaHits"], "Saga", ["punjabi movie %(year)s", "punjabi movie %(last)s"]),
            ("Speed Records", ["@SpeedRecords"], "Speed Records", ["full movie %(year)s", "full movie %(last)s"]),
            ("Tips Punjabi", ["@TipsPunjabi"], "Tips Punjabi", ["full movie %(year)s", "full movie %(last)s"]),
            # Urdu (Pakistani films and telefilms from the TV channels)
            ("ARY Digital", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital", ["telefilm %(year)s", "telefilm %(last)s"]),
            ("HUM TV", ["@HUMTV", "@humtvpk"], "HUM TV", ["telefilm %(year)s", "telefilm %(last)s"]),
            ("Har Pal Geo", ["@HarPalGeo", "@harpalgeo"], "HAR PAL GEO|Har Pal Geo", ["telefilm %(year)s", "telefilm %(last)s"]),
            ("Green Entertainment", ["@GreenTVEntertainment", "@greenentertainment"], "Green", ["telefilm %(year)s", "telefilm %(last)s"]),
            ("ARY Films", ["@ARYFilms", "@aryfilms"], "ARY Films", ["full movie %(year)s", "full movie %(last)s", "full movie"]),
        ],
        # The newest few from each source, so every language gets its share.
        "cap": {"*": 8},
    },
}

SUMMARIES = []
YEAR = re.compile(r"\b(19[3-9]\d|20[0-4]\d)\b")


def recent_film(title, today, years):
    """Whether the title names a year, and every year it names is this year or one of the last [years]."""
    named = [int(y) for y in YEAR.findall(title)]
    return bool(named) and min(named) >= today.year - years


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
    split = ch.get("split") or {}
    old = {}
    for each in sorted({cid, *split.values()}):
        path = os.path.join(ROOT, "docs", "channel", f"yt-{each}.json")
        if os.path.exists(path):
            old.update({v["id"]: v for v in json.load(open(path, encoding="utf-8")).get("videos", [])})
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
        # Upload days from the channel feed (its 15 newest): Latest Movies, and Bazaar TV One's new-only blocks.
        dates = upload_dates(chan)
        for vid, title, mins, age in videos:
            if vid in found or skip.search(title) or is_horror(title) or other_language(title) or (keep and not keep.search(title)) or (only and not only.search(title)):
                continue
            if ch.get("release_years") is not None and not recent_film(title, today, ch["release_years"]):
                continue
            # A video with no known length (from the feed) is kept on its title alone.
            if mins is not None and not low <= mins <= high:
                continue
            if kept >= ch.get("cap", {}).get(label, ch.get("cap", {}).get("*", MAX_VIDEOS)):
                break
            found[vid] = {"id": vid, "title": title.strip(), "label": label, "mins": mins,
                          "found": old.get(vid, {}).get("found", today.isoformat())}
            if ch.get("lang"):
                found[vid]["lang"] = language_of(ch, label, title)
            # When it went up on YouTube, as far as the page says ("3 weeks ago"): Bazaar TV One's blocks
            # take only new uploads (tools/build_bazaar_blocks.py, the owner's wish 2026-10-08).
            posted = dates.get(vid) or ((today - dt.timedelta(days=age)).isoformat() if age is not None else old.get(vid, {}).get("posted"))
            if posted:
                found[vid]["posted"] = posted
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
        if ch.get("release_years") is not None and not recent_film(v["title"], today, ch["release_years"]):
            continue
        # (A title the channel now skips goes too, so a rule added later also clears what came before it.)
        if vid not in found and v.get("label") in labels and not is_horror(v) and not other_language(v["title"]) and not skip.search(v["title"]) and (today - dt.date.fromisoformat(v.get("up", v["found"]))).days <= ch.get("max_age", KEEP_DAYS):
            found[vid] = v
            if ch.get("lang"):
                v["lang"] = language_of(ch, v["label"], v["title"])
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
    videos = sorted(found.values(), key=newest, reverse=True)
    if ch.get("most"):
        # Balance: the newest few of each source, so one show doesn't fill the channel.
        per, counted = ch["most"], {}
        balanced = []
        for v in videos:
            counted[v["label"]] = counted.get(v["label"], 0) + 1
            if counted[v["label"]] <= per.get(v["label"], per.get("*", MAX_VIDEOS)):
                balanced.append(v)
        videos = balanced
    videos = videos[:ch.get("max", MAX_VIDEOS)]
    lists = {cid: videos}
    if split:
        lists = {each: [v for v in videos if v.get("lang") == code] for code, each in split.items()}
    wrote = False
    for each, vids in lists.items():
        name = ch["name"] if each == cid else f"{ch['name']} ({each})"
        summary = f"{name}: {len(vids)} videos" + (f" ({', '.join(counts)})" if each == cid else "")
        if ch.get("events") or ch.get("recent_years"):
            summary += f"; {sum(1 for v in vids if v.get('top'))} top ({'main events and newest' if ch.get('events') else 'new films'})"
        SUMMARIES.append(summary)
        # (Latest Movies is written even when short: an old list would break the owner's year rule.)
        if len(vids) < 5 and ch.get("release_years") is None:
            print(f"{name}: too few videos; keeping the old list.", file=sys.stderr)
            continue
        out = os.path.join(ROOT, "docs", "channel", f"yt-{each}.json")
        with open(out, "w", encoding="utf-8") as f:
            json.dump({"name": name, "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                       "videos": vids}, f, ensure_ascii=False, indent=1)
            f.write("\n")
        print(f"Wrote {os.path.relpath(out, ROOT)}: {summary}")
        wrote = True
    return wrote


# Each language's newest films (Latest Movies' list) lead that language's Movies channel; Punjabi and
# Urdu films are kept in lists of their own until those channels have enough to go on air.
LATEST_INTO = {"hi": "hindi", "en": "english", "pa": "moviespa", "ur": "moviesur"}


def merge_latest():
    src = os.path.join(ROOT, "docs", "channel", "yt-latest.json")
    if not os.path.exists(src):
        return
    latest = json.load(open(src, encoding="utf-8")).get("videos", [])
    for code, each in LATEST_INTO.items():
        path = os.path.join(ROOT, "docs", "channel", f"yt-{each}.json")
        data = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else {"name": f"Latest Movies ({each})", "videos": []}
        new = [dict(v, top=True, latest=True) for v in latest if v.get("lang") == code]
        ids = {v["id"] for v in new}
        rest = [v for v in data["videos"] if not v.get("latest") and v["id"] not in ids]
        if not new and len(rest) == len(data["videos"]):
            continue
        data["videos"] = new + rest
        data["built"] = dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
            f.write("\n")
        SUMMARIES.append(f"Newest films into {each}: {len(new)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--channel", choices=sorted(CHANNELS))
    args = ap.parse_args()
    today = dt.date.today()
    ok = [build(cid, CHANNELS[cid], today) for cid in ([args.channel] if args.channel else CHANNELS)]
    merge_latest()
    if os.environ.get("GITHUB_ACTIONS"):
        # One notice for all of them: GitHub shows only 10 per step, and there are more channels than that.
        print("::notice title=YouTube channel lists::" + "%0A".join(SUMMARIES))
    if not any(ok):
        sys.exit("No channel list could be built.")


if __name__ == "__main__":
    main()
