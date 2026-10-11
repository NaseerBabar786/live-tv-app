"""
Per-title facts for NextGen Cable's Library (owner, 2026-10-10), kept in docs/library-info/titles.json:
  - the year a film or programme came out ("Released 2019" in its details). From the title when it says
    ("Film Name (2019)"), else from Wikidata (a film's publication date, a series' first air date), but only
    when exactly one film or series of that name and country fits; never a guess.
  - its official trailer ("Watch trailer" next to "Watch"): a YouTube search for "<title> official trailer"
    whose answer names the title, says trailer (or teaser / promo for dramas), is short, comes from a verified
    channel or the programme's own channel, and plays in our player. Nothing found means no button.
And how many titles the Library has (docs/library-count.json), for the number under the Library button.

Used by tools/library_check.py; run on its own to print what it finds for some titles:
    python3 tools/library_titles.py --probe "Movies|Hindi|14 Phere" "Series|Urdu|Kaneez"
"""
import datetime as dt
import json
import os
import re
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TITLES = os.path.join(ROOT, "docs", "library-info", "titles.json")
COUNT = os.path.join(ROOT, "docs", "library-count.json")
UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
      "Chrome/124.0 Safari/537.36")
WIKI_UA = "CableTVLibrary/1.0 (https://tv.bulkbazaar.ca; naseerahmadbabar@gmail.com)"
MAX_LOOKS = int(os.environ.get("LIBRARY_TITLES_MAX", "1500"))  # titles looked up per run; the rest next morning
AGAIN_DAYS = 30  # a title with nothing found is looked up again after this long
# Wikidata answers "429 too many requests" to parallel bursts: one request at a time, at most 2 a second,
# and only this many year look-ups per run (the rest the next morning).
MAX_YEARS = int(os.environ.get("LIBRARY_YEARS_MAX", "400"))
WIKI_GAP = 0.5

# The same patterns as the app (Vod.kt), so a show's name here is the folder's name there.
SEASON_EPISODE = re.compile(r"^(.*?)[\s._\-:|]*\bS(\d{1,2})[\s._\-]*E(\d{1,3})\b.*$", re.I)
CROSS = re.compile(r"^(.*?)[\s._\-:|]+(\d{1,2})x(\d{1,3})\b.*$", re.I)
EPISODE_ONLY = re.compile(r"^(.*?)[\s._\-:|]+(?:Episode\s*|Ep\.?\s*|E)(\d{1,4})\b.*$", re.I)
BRACKETED = re.compile(r"\(.*?\)|\[.*?]")
FILLER = re.compile(r"\b(the|full movie|full episode|hd|4k)\b")


def title_key(name):
    s = FILLER.sub(" ", BRACKETED.sub(" ", name.lower()))
    return "".join(c for c in s if c.isalnum())


def show_name(name, group):
    for rx in (SEASON_EPISODE, CROSS, EPISODE_ONLY):
        m = rx.match(name.strip())
        if m and m.group(1).strip(" -:|._"):
            return m.group(1).strip().strip("-:|._").strip()
    return group or name


def title_of(attrs, name):
    """(kind, language, title) of one #EXTINF entry: a film is its own title, an episode its show's."""
    section = attrs.get("tvg-genre", "")
    language = attrs.get("tvg-language", "English")
    if section in ("Series", "Shows", "Kids"):
        return "show", language, show_name(name, attrs.get("group-title"))
    return "movie", language, name.split(" | ")[0].strip()


def entry_key(kind, language, title):
    return f"{kind}|{language}|{title_key(title)}"


def get_json(url, ua=UA, data=None):
    req = urllib.request.Request(url, data=data, headers={"User-Agent": ua, "Content-Type": "application/json",
                                                         "Accept-Language": "en-US,en;q=0.9"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return json.loads(r.read().decode("utf-8", "replace"))


_wiki_lock = threading.Lock()
_wiki_last = [0.0]
_wiki_left = [MAX_YEARS]


class WikiBusy(Exception):
    """Wikidata kept saying "too many requests", or this run's year look-ups are used up."""


def wiki_json(url):
    """get_json for Wikidata, one request at a time with a gap, waiting and trying again on 429."""
    for wait in (5, 20, 60, None):
        with _wiki_lock:
            gap = _wiki_last[0] + WIKI_GAP - time.monotonic()
            if gap > 0:
                time.sleep(gap)
            try:
                return get_json(url, ua=WIKI_UA)
            except urllib.error.HTTPError as e:
                if e.code != 429:
                    raise
                if wait is None:
                    _wiki_left[0] = 0  # still busy after a minute and a half: no more years this run
                    raise WikiBusy(str(e)) from e
                retry = e.headers.get("Retry-After", "")
                time.sleep(int(retry) if retry.isdigit() and int(retry) < 300 else wait)
            finally:
                _wiki_last[0] = time.monotonic()


# --- the year ---------------------------------------------------------------------------------------------

YEAR_IN_TITLE = re.compile(r"[(\[]((?:19[3-9]|20[0-4])\d)[)\]]")
FILM = re.compile(r"\bfilm\b|\bmovie\b", re.I)
SERIES = re.compile(r"television|\btv\b|web series|drama|serial|sitcom|soap opera|talk show|reality|game show|"
                    r"cartoon|animated series|children's series", re.I)
COUNTRY = {
    "Urdu": re.compile(r"pakistan|urdu", re.I),
    "Hindi": re.compile(r"india|hindi|bollywood", re.I),
    "Punjabi": re.compile(r"punjab|india|pakistan", re.I),
}
SOUTH_ASIAN = re.compile(r"pakistan|india|hindi|urdu|bollywood|punjab|tamil|telugu|bengali|malayalam|kannada|marathi", re.I)


def wikidata_year(kind, language, title):
    """The year, when exactly one film (or series) of that name from that country is on Wikidata."""
    key = title_key(title)
    if len(key) < 3:
        return None
    with _wiki_lock:
        if _wiki_left[0] <= 0:
            raise WikiBusy("year look-ups for this run used up")
        _wiki_left[0] -= 1
    found = wiki_json("https://www.wikidata.org/w/api.php?action=wbsearchentities&type=item&language=en&uselang=en"
                     "&limit=15&format=json&search=" + urllib.parse.quote(title)).get("search", [])
    fits = FILM if kind == "movie" else SERIES
    hits = [h for h in found if fits.search(h.get("description", "")) and
            (title_key(h.get("label", "")) == key or title_key(h.get("match", {}).get("text", "")) == key)]
    if language in COUNTRY:
        hits = [h for h in hits if COUNTRY[language].search(h.get("description", ""))]
    elif language == "English":
        hits = [h for h in hits if not SOUTH_ASIAN.search(h.get("description", ""))]
    if not hits:
        return None
    claims = wiki_json("https://www.wikidata.org/w/api.php?action=wbgetentities&props=claims&format=json&ids=" +
                       "|".join(h["id"] for h in hits[:5])).get("entities", {})
    years = set()
    for h in hits[:5]:
        props = claims.get(h["id"], {}).get("claims", {})
        days = [c["mainsnak"]["datavalue"]["value"]["time"] for p in ("P577", "P580") for c in props.get(p, [])
                if c.get("mainsnak", {}).get("datavalue")]
        if days:
            years.add(min(int(d[1:5]) for d in days))
        else:
            m = re.search(r"\b((?:19|20)\d\d)\b", h.get("description", ""))
            if m:
                years.add(int(m.group(1)))
    return years.pop() if len(years) == 1 else None


# --- the trailer ------------------------------------------------------------------------------------------

TRAILER_WORDS = {"movie": re.compile(r"\btrailer\b", re.I),
                 "show": re.compile(r"\b(?:trailer|teaser|promo)\b", re.I)}
NOT_OFFICIAL = re.compile(r"fan[- ]?made|concept|reaction|review|explained|breakdown|spoof|parody|recap|"
                          r"behind the scenes|making of|interview|scene|song|reacts?\b|edit\b|tribute|ai\b", re.I)
HORROR = re.compile(r"horror|zombie|exorcis|demonic|haunted|ghost|bhoot|chudail|churail|ہارر|हॉरर", re.I)


def renderers(node):
    """Every videoRenderer in a YouTube search answer."""
    if isinstance(node, dict):
        if "videoRenderer" in node:
            yield node["videoRenderer"]
        for v in node.values():
            yield from renderers(v)
    elif isinstance(node, list):
        for v in node:
            yield from renderers(v)


def find_trailer(kind, title, channel, exclude):
    """The official trailer's YouTube id, or None."""
    key = title_key(title)
    if len(key) < 3:
        return None
    body = {"query": f"{title} official trailer", "context": {"client": {
        "clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en", "gl": "CA"}}}
    page = get_json("https://www.youtube.com/youtubei/v1/search?prettyPrint=false", data=json.dumps(body).encode())
    for n, v in enumerate(renderers(page)):
        if n >= 8:
            break
        vid = v.get("videoId")
        name = "".join(r.get("text", "") for r in v.get("title", {}).get("runs", []))
        owner = "".join(r.get("text", "") for r in v.get("ownerText", {}).get("runs", []))
        badges = json.dumps(v.get("ownerBadges", []))
        length = v.get("lengthText", {}).get("simpleText", "")
        secs = 0
        for part in length.split(":"):
            secs = secs * 60 + int(part) if part.isdigit() else secs
        if not vid or vid in exclude or not length or secs > 6 * 60:
            continue
        if key not in title_key(name) or not TRAILER_WORDS[kind].search(name) or NOT_OFFICIAL.search(name) or HORROR.search(name):
            continue
        if "VERIFIED" not in badges and title_key(owner) != title_key(channel or ""):
            continue
        try:
            sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
            from playable import plays
            if not plays(vid):
                continue
        except ImportError:
            pass
        return vid
    return None


# --- the whole Library ------------------------------------------------------------------------------------

def load(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def look(kind, language, title, channel, exclude, before=None):
    """What is known of one title: [before] (an earlier look) plus whatever is still missing. "yearChecked" is
    only set once the year look-up really finished, so one Wikidata hiccup never hides a year for a month."""
    found = dict(before or {})
    found["checked"] = dt.date.today().isoformat()
    if not found.get("year") and not found.get("yearChecked"):
        m = YEAR_IN_TITLE.search(title)
        try:
            year = int(m.group(1)) if m else wikidata_year(kind, language, BRACKETED.sub("", title).strip())
            if year:
                found["year"] = year
            found["yearChecked"] = found["checked"]
        except WikiBusy:
            pass  # next run
        except Exception as e:  # noqa: BLE001
            print(f"  {title}: year failed ({e})", file=sys.stderr)
    if not found.get("trailer") and (before is None or not before.get("trailerChecked")):
        try:
            trailer = find_trailer(kind, BRACKETED.sub("", title).strip(), channel, exclude)
            if trailer:
                found["trailer"] = trailer
            found["trailerChecked"] = found["checked"]
        except Exception as e:  # noqa: BLE001
            print(f"  {title}: trailer failed ({e})", file=sys.stderr)
    return found


def update(entries, ids):
    """Looks up the titles of [entries] ((kind, language, title, channel) per #EXTINF) not looked at yet, or
    with nothing found for a month, and returns {entry key: {"year", "trailer"}} (also saved in titles.json).
    [ids] are the Library's own video ids, never taken for a trailer."""
    from concurrent.futures import ThreadPoolExecutor
    known = load(TITLES, {})
    wanted = {}
    for kind, language, title, channel in entries:
        wanted.setdefault(entry_key(kind, language, title), (kind, language, title, channel))
    again = (dt.date.today() - dt.timedelta(days=AGAIN_DAYS)).isoformat()
    for v in known.values():  # a month on, a title with nothing found is looked at afresh
        if not v.get("year") and not v.get("trailer") and v.get("checked", "") < again:
            v.pop("yearChecked", None)
            v.pop("trailerChecked", None)
    # Titles never looked at first, then ones whose year look-up did not finish (Wikidata busy last time).
    todo = ([k for k in wanted if k not in known] +
            [k for k in wanted if k in known and not known[k].get("year") and not known[k].get("yearChecked")])
    todo = todo[:MAX_LOOKS]
    with ThreadPoolExecutor(6) as pool:
        for k, found in zip(todo, pool.map(lambda k: look(*wanted[k], ids, known.get(k)), todo)):
            known[k] = found
    # Other playlists' titles stay (Dramas and Free share this file).
    os.makedirs(os.path.dirname(TITLES), exist_ok=True)
    with open(TITLES, "w", encoding="utf-8") as f:
        json.dump(known, f, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
        f.write("\n")
    mine = {k: known[k] for k in wanted if k in known}
    print(f"Titles: looked up {len(todo)} of {len(wanted)}; {sum(1 for v in mine.values() if v.get('year'))} with a year, "
          f"{sum(1 for v in mine.values() if v.get('trailer'))} with a trailer")
    return known


ATTR = re.compile(r'([\w-]+)="([^"]*)"')


def titles_in(path):
    """(kind, language, title key) of every title in a playlist."""
    out = set()
    try:
        lines = open(path, encoding="utf-8").read().splitlines()
    except OSError:
        return out
    for line in lines:
        if line.startswith("#EXTINF"):
            head, _, name = line.partition('",')
            attrs = dict(ATTR.findall(head + '"'))
            kind, language, title = title_of(attrs, name)
            out.add((kind, language, title_key(title) or name))
    return out


def write_count():
    """How many titles (films, and dramas or shows each counted once) the Library has, for the number under
    NextGen Cable's Library button: Dramas, Free and the news archive always; MTA's only when MTA is on."""
    docs = os.path.join(ROOT, "docs")
    main = set()
    for name in ("Dramas.m3u", "Free.m3u", "NewsArchive.m3u"):
        main |= titles_in(os.path.join(docs, name))
    mta = titles_in(os.path.join(docs, "MTA.m3u"))
    with open(COUNT, "w", encoding="utf-8") as f:
        json.dump({"titles": len(main), "mta": len(mta), "updated": dt.date.today().isoformat()}, f)
        f.write("\n")
    print(f"Library count: {len(main)} titles (+{len(mta)} MTA)")


if __name__ == "__main__":
    if sys.argv[1:2] == ["--count"]:
        write_count()
    for arg in sys.argv[2:] if sys.argv[1:2] == ["--probe"] else []:
        kind, language, title = arg.split("|", 2)
        kind = "movie" if kind == "Movies" else "show"
        print(arg, json.dumps(look(kind, language, title, "", set()), ensure_ascii=False))
