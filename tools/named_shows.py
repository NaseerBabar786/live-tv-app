#!/usr/bin/env python3
"""
Named TV shows for the Library's Shows sections: Pakistani morning shows (owner, 2026-10-08: "so many
morning shows ... add that into our library"), Indian TV comedy shows ("Kapil Sharma show ...
Comedy Bachao ... as possible") and Punjabi comedy and series ("Punjabi language comedy shows plus
series"). Each one comes from its own channel's official YouTube account.

These shows are dated, not numbered ("Good Morning Pakistan | Golden Memories | 8th October 2026"),
so build_dramas' episode reader skips them. Here each show is searched for in its channel; full
broadcasts (not clips) whose title names the show go into the show's own folder under Shows.
Anything about politics is left out (owner: no politics in the Library).

Used by build_dramas.main(); adds items to its kept dict in the same form as channel_shows().
Run alone to print what it finds without writing anything:
    python3 tools/named_shows.py
"""
import re
import sys
import urllib.parse

# (folder name, title words that mark the show, channel handles, channel name, language, shortest minutes)
SHOWS = [
    # Pakistani morning shows
    ("Good Morning Pakistan", r"good morning pakistan", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital", "Urdu", 30),
    ("Morning At Home", r"morning at home", ["@PTVHomeOfficial", "@PTVHome"], "PTV Home", "Urdu", 30),
    ("Naya Din", r"naya din", ["@SAMAATV", "@SamaaTV"], "SAMAA TV", "Urdu", 30),
    ("Good Morning Zindagi", r"good morning zind|morning with sahir", ["@APlusEntertainmentOfficial"], "A Plus Entertainment", "Urdu", 30),
    # Indian TV comedy shows
    ("The Kapil Sharma Show", r"kapil sharma show", ["@SETIndia"], "SET India|Sony Entertainment Television", "Hindi", 20),
    ("The Kapil Sharma Show", r"kapil sharma show", ["@TheKapilSharmaShow"], "The Kapil Sharma Show", "Hindi", 20),
    ("India's Laughter Champion", r"laughter champion", ["@SETIndia"], "SET India|Sony Entertainment Television", "Hindi", 20),
    ("Madness Machayenge", r"madness machayenge", ["@SETIndia"], "SET India|Sony Entertainment Television", "Hindi", 20),
    ("Comedy Circus", r"comedy circus", ["@SETIndia"], "SET India|Sony Entertainment Television", "Hindi", 20),
    ("Comedy Nights Bachao", r"comedy nights bachao", ["@ColorsTV"], "Colors TV|Colors", "Hindi", 20),
    ("Comedy Nights with Kapil", r"comedy nights with kapil", ["@ColorsTV"], "Colors TV|Colors", "Hindi", 20),
    ("Comedy Nights Live", r"comedy nights live", ["@ColorsTV"], "Colors TV|Colors", "Hindi", 20),
    ("Entertainment Ki Raat", r"entertainment ki raat", ["@ColorsTV"], "Colors TV|Colors", "Hindi", 20),
    ("Khatra Khatra Khatra", r"khatra khatra", ["@ColorsTV"], "Colors TV|Colors", "Hindi", 20),
    ("Laughter Chefs", r"laughter chefs", ["@ColorsTV"], "Colors TV|Colors", "Hindi", 20),
    ("Comedy Dangal", r"comedy dangal", ["@andtvchannel"], "&TV|And TV", "Hindi", 20),
    ("F.I.R", r"\bf\.?\s?i\.?\s?r\b", ["@SonySAB", "@sabtv"], "Sony SAB", "Hindi", 18),
    ("Chidiya Ghar", r"chidiya ghar", ["@SonySAB", "@sabtv"], "Sony SAB", "Hindi", 18),
    ("Lapataganj", r"lapataganj", ["@SonySAB", "@sabtv"], "Sony SAB", "Hindi", 18),
    ("Jijaji Chhat Per Hain", r"jijaji chhat", ["@SonySAB", "@sabtv"], "Sony SAB", "Hindi", 18),
    ("Partners Trouble Ho Gayi Double", r"partners trouble", ["@SonySAB", "@sabtv"], "Sony SAB", "Hindi", 18),
    ("Khichdi", r"khichdi", ["@StarPlus"], "StarPlus|Star Plus", "Hindi", 18),
    ("Hum Paanch", r"hum paanch", ["@zeetv"], "Zee TV", "Hindi", 18),
    ("Yaaron Ki Baraat", r"yaaron ki baraat", ["@zeetv"], "Zee TV", "Hindi", 18),
    ("Flop Show", r"flop show", ["@DoordarshanNational"], "Doordarshan National|DD National", "Hindi", 18),
    ("Raju Hazir Ho", r"raju hazir", ["@DangalTVChannel"], "Dangal TV|Dangal", "Hindi", 18),
    ("Bharti Ka Show", r"bharti ka show", ["@ShemarooComedy"], "Shemaroo Comedy", "Hindi", 18),
    # Punjabi comedy and series
    ("Chhankata", r"chhankata|chankata", ["@GoyalMusic", "@GoyalMusicOfficial"], "Goyal Music", "Punjabi", 15),
    ("Bhagan Walian", r"bhagan wal", ["@ddpunjabiofficial", "@DDPunjabi"], "DD Punjabi", "Punjabi", 15),
    ("Eh Kehi Rutt Aayi", r"kehi rutt", ["@ddpunjabiofficial", "@DDPunjabi"], "DD Punjabi", "Punjabi", 15),
    ("Yaaran Di No.1 Yaari", r"yaaran di", ["@PitaaraTV", "@pitaara"], "Pitaara", "Punjabi", 15),
    ("Strings Of Punjab", r"strings of punjab", ["@PitaaraTV", "@pitaara"], "Pitaara", "Punjabi", 15),
    ("Chah Te Chuski", r"chah te chuski", ["@PitaaraTV", "@pitaara"], "Pitaara", "Punjabi", 15),
    ("Disha Di Wedding", r"disha di wedding", ["@PitaaraTV", "@pitaara"], "Pitaara", "Punjabi", 15),
    ("Pakki Punjaban", r"pakki punjaban", ["@PTCPunjabi"], "PTC Punjabi", "Punjabi", 15),
]
# Never in the Library: uncut footage, the Prime Minister's radio talk, reality shows the owner left out.
LEFT_OUT = re.compile(r"\b(uncensored|mann ki baat|bigg boss|horror|bhoot|adult)\b|\b18\+", re.I)
SEARCHES = ["{show}", "{show} full", "{show} full episode"]
POLITICS = re.compile(
    r"\b(imran khan|nawaz|shehbaz|zardari|bilawal|maryam|pti|pml|ppp|election|siyasat|siyasi|politic\w*|"
    r"government|hukumat|army chief|modi|bjp|congress)\b", re.I)


def find(bd, show, mark, cid):
    videos, seen = [], set()
    urls = [f"https://www.youtube.com/channel/{cid}/videos"] + [
        f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q.format(show=show)})
        for q in SEARCHES]
    for url in urls:
        try:
            for v in bd.videos_page(url):
                if v[0] not in seen and mark.search(v[1]):
                    seen.add(v[0])
                    videos.append(v)
        except Exception as e:  # noqa: BLE001
            print(f"  {show}: {url} failed ({e})", file=sys.stderr)
    return videos


def add(kept, today, dry_run=False):
    """Adds each show's full broadcasts to kept (build_dramas' dict, keyed by video id)."""
    import build_dramas as bd  # here, as build_dramas calls this module
    channels = {}
    for show, words, handles, owner, language, shortest in SHOWS:
        if owner not in channels:
            channels[owner] = bd.channel_id(handles, owner)
        handle, cid = channels[owner]
        if not cid:
            print(f"{show}: channel {owner} not found", file=sys.stderr)
            continue
        new = total = 0
        for vid, title, mins in find(bd, show, re.compile(words, re.I), cid):
            if bd.SKIP.search(title) or POLITICS.search(title) or LEFT_OUT.search(title) or (mins is not None and mins < shortest):
                continue
            if language == "Hindi" and bd.OTHER_LANGUAGE.search(title) and not re.search(r"hindi", title, re.I):
                continue
            if vid in kept:
                kept[vid]["seen"] = today.isoformat()
            elif dry_run or bd.plays(vid):
                kept[vid] = {"item": bd.short_title(title), "folder": show, "genre": "Shows", "channel": show,
                             "language": language, "title": title, "added": today.isoformat()}
                new += 1
            else:
                continue
            total += 1
        print(f"{show} ({owner}, {handle} {cid}): {total} full shows, {new} new")


if __name__ == "__main__":
    import datetime as dt
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    add({}, dt.date.today(), dry_run="--check" not in sys.argv)
