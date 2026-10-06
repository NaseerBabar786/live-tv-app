#!/usr/bin/env python3
"""
Builds the video lists of our channels that run like Bazaar Hits (1.9.47): official uploads
from well-known YouTube channels, played one after another in YouTube's own embedded player
on tv.bulkbazaar.ca/channel/ytc.html?c=<id> (also inside the app), locked so nobody can pause,
skip or leave for YouTube. Nothing is downloaded or re-hosted, as YouTube's terms require.

  2 Bazaar Cinema  full films from the studios' own channels
  3 Bazaar Music   Punjabi, Sufi and qawwali from the labels' channels (film songs are on 4)
  5 Bazaar Kids    cartoons from the makers' channels
  6 Bazaar Sports  cricket highlights (ICC, PCB, BCCI, PSL, IPL...) and a little football
  7 Bazaar Travel  tourism boards and travel shows
  8 Bazaar Comedy  comedy shows from their channels
  9 Bazaar Movies English  full English films from studios' and distributors' free-movie channels
 10 Bazaar Movies Hindi    full Hindi films from the studios' channels
 11 Bazaar Dramas  full episodes of Pakistani dramas from the TV channels' own channels
 12 Bazaar Cooking recipes and cooking shows from the cooks' own channels

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
from build_dramas import channel_id, videos_feed, videos_page  # noqa: E402

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
        "name": "Bazaar Music", "mins": (2, 15), "search": "official video",
        "skip": r"jukebox|full album|non ?stop|mashup|audio|lyric|lyrical|making|interview|bts|behind the scenes",
        "sources": [
            ("White Hill Music", ["@WhiteHillMusic"], "White Hill"),
            ("Desi Melodies", ["@DesiMelodies"], "Desi Melodies"),
            ("Geet MP3", ["@GeetMP3"], "Geet MP3"),
            ("Oriental Star Agencies", ["@OSAWorldwide", "@OrientalStarAgencies"], "Oriental Star|OSA"),
            ("Saga Music", ["@SagaMusic", "@SagaMusicOfficial"], "Saga"),
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
        ],
    },
    "sports": {
        "name": "Bazaar Sports", "mins": (2, 30), "search": "highlights",
        "skip": r"podcast|press conference|interview|reaction|preview|prediction|draw|ticket|bet",
        # Mostly cricket (the owner's wish, 2026-10-06), a little football.
        "sources": [
            ("ICC", ["@ICC"], "ICC"),
            ("Pakistan Cricket", ["@TheRealPCB", "@PakistanCricketBoard"], "Pakistan Cricket"),
            ("BCCI", ["@BCCI", "@bcci"], "BCCI"),
            ("PSL", ["@thepsl", "@PSL"], "PSL|Pakistan Super League"),
            ("IPL", ["@IPL"], "IPL|Indian Premier League"),
            ("England Cricket", ["@englandcricket"], "England"),
            ("Cricket Australia", ["@cricketcomau", "@CricketAustralia"], "cricket.com.au|Cricket Australia"),
            ("CPL", ["@CPLT20"], "CPL|Caribbean Premier League"),
            ("FIFA", ["@FIFA"], "FIFA"),
        ],
    },
    "travel": {
        "name": "Bazaar Travel", "mins": (2, 60),
        "skip": r"podcast|interview|news|press|webinar|conference|recipe",
        "sources": [
            ("Incredible India", ["@IncredibleIndia", "@incredibleindia"], "Incredible India"),
            ("Lonely Planet", ["@lonelyplanet"], "Lonely Planet"),
            ("Visit Dubai", ["@VisitDubai", "@visitdubai"], "Visit Dubai"),
            ("Visit Saudi", ["@VisitSaudi"], "Visit Saudi"),
            ("Türkiye", ["@GoTurkiye", "@goturkiye"], "Go Türkiye|GoTürkiye|Turkiye"),
            ("Expedia", ["@Expedia", "@ExpediaTV"], "Expedia"),
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
        "name": "Bazaar Movies Hindi", "mins": (70, 200), "search": "hindi full movie",
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
}


def build(cid, ch, today):
    out = os.path.join(ROOT, "docs", "channel", f"yt-{cid}.json")
    old = {}
    if os.path.exists(out):
        old = {v["id"]: v for v in json.load(open(out, encoding="utf-8")).get("videos", [])}
    skip = re.compile(rf"{NEVER}|{ch['skip']}", re.I)
    keep = re.compile(ch["keep"], re.I) if ch.get("keep") else None
    low, high = ch["mins"]
    found, counts = {}, []
    for label, handles, name in ch["sources"]:
        _, chan = channel_id(handles, name)
        if not chan:
            print(f"{label}: channel not found", file=sys.stderr)
            counts.append(f"{label} 0 (not found)")
            continue
        videos = []
        pages = [f"https://www.youtube.com/channel/{chan}/videos"]
        if ch.get("search"):
            pages.append(f"https://www.youtube.com/channel/{chan}/search?query=" + ch["search"].replace(" ", "+"))
        for url in pages:
            try:
                videos += videos_page(url)
            except Exception as e:  # noqa: BLE001
                print(f"  {url}: {e}", file=sys.stderr)
        if not videos:
            try:
                videos = videos_feed(chan)
            except Exception as e:  # noqa: BLE001
                print(f"  feed: {e}", file=sys.stderr)
        only = re.compile(ch.get("only", {}).get(label, ""), re.I) if label in ch.get("only", {}) else None
        kept = 0
        for vid, title, mins in videos:
            if vid in found or skip.search(title) or other_language(title) or (keep and not keep.search(title)) or (only and not only.search(title)):
                continue
            # A video with no known length (from the feed) is kept on its title alone.
            if mins is not None and not low <= mins <= high:
                continue
            found[vid] = {"id": vid, "title": title.strip(), "label": label, "mins": mins,
                          "found": old.get(vid, {}).get("found", today.isoformat())}
            kept += 1
        print(f"{label}: {len(videos)} videos, {kept} kept")
        counts.append(f"{label} {kept}")

    labels = {label for label, _, _ in ch["sources"]}
    for vid, v in old.items():
        # A source taken off the list goes with its videos.
        if vid not in found and v.get("label") in labels and not other_language(v["title"]) and (today - dt.date.fromisoformat(v["found"])).days <= KEEP_DAYS:
            found[vid] = v
    videos = sorted(found.values(), key=lambda v: v["found"], reverse=True)[:MAX_VIDEOS]
    summary = f"{ch['name']}: {len(videos)} videos ({', '.join(counts)})"
    if os.environ.get("GITHUB_ACTIONS"):
        print(f"::notice title={ch['name']}::{summary}")
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
    if not any(ok):
        sys.exit("No channel list could be built.")


if __name__ == "__main__":
    main()
