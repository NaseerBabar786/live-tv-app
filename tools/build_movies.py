#!/usr/bin/env python3
"""
Builds a free, legal movies and TV series playlist from the Internet Archive.

Uses two of the Archive's public-domain collections:

  * feature_films: full-length films whose copyright has expired or was never
    renewed (classic Hollywood, film noir, westerns, horror, comedies).
  * classic_tv: old TV episodes in the public domain.

For each item it reads the file list and keeps one MP4 (H.264 first, then the
smaller 512Kb copy). Films become movies, grouped by decade. TV items become
series episodes named "Show Episode N" so Live TV's Movies & Series screen
files them under their show; a show needs at least MIN_EPISODES episodes.

Writes (in docs/, served at tv.bulkbazaar.ca):
  Movies.m3u     the playlist (add it in Live TV: Settings > My playlists)
  movies.json    counts and the time it was built

Standard library only. Run: python3 tools/build_movies.py [--movies N] [--items N]
"""
import argparse
import concurrent.futures as cf
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIKIDATA = "https://query.wikidata.org/sparql"
SEARCH = "https://archive.org/advancedsearch.php"
SCRAPE = "https://archive.org/services/search/v1/scrape"
METADATA = "https://archive.org/metadata/"
DOWNLOAD = "https://archive.org/download/"
POSTER = "https://archive.org/services/img/"
USER_AGENT = "LiveTV-playlist-builder/1.0 (+https://tv.bulkbazaar.ca)"
MIN_EPISODES = 3
# Films shorter than this are shorts, trailers or newsreels, not movies.
MIN_MOVIE_SECONDS = 40 * 60


def get_json(url, tries=7, timeout=150):
    """Fetches JSON, waiting and retrying when the Archive is busy (503, timeouts)."""
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            if attempt + 1 == tries:
                raise
            wait = min(120, 10 * 2 ** attempt)
            print(f"  retry in {wait}s ({e}): {url[:90]}", file=sys.stderr)
            time.sleep(wait)


def search(collection, rows):
    """The collection's most downloaded video items.

    Tries the scrape API sorted by downloads, then advanced search, then an unsorted
    scrape (paged, sorted here), since the Archive's search is often slow or busy.
    """
    q = f"collection:({collection}) AND mediatype:(movies)"
    try:
        params = {"q": q, "fields": "identifier,title,year", "sorts": "downloads desc",
                  "count": str(max(100, min(rows, 10000)))}
        docs = get_json(SCRAPE + "?" + urllib.parse.urlencode(params), tries=3, timeout=60).get("items", [])
        if docs:
            return docs[:rows]
    except Exception as e:  # noqa: BLE001
        print(f"  sorted scrape failed ({e}); trying advanced search", file=sys.stderr)
    try:
        params = [("q", q), ("fl[]", "identifier"), ("fl[]", "title"), ("fl[]", "year"),
                  ("sort[]", "downloads desc"), ("rows", str(rows)), ("page", "1"), ("output", "json")]
        docs = get_json(SEARCH + "?" + urllib.parse.urlencode(params), tries=3, timeout=60)["response"]["docs"]
        if docs:
            return docs
    except Exception as e:  # noqa: BLE001
        print(f"  advanced search failed ({e}); trying unsorted scrape", file=sys.stderr)
    docs, cursor = [], None
    while len(docs) < 20000:
        params = {"q": q, "fields": "identifier,title,year,downloads", "count": "5000"}
        if cursor:
            params["cursor"] = cursor
        page = get_json(SCRAPE + "?" + urllib.parse.urlencode(params), tries=3, timeout=60)
        docs += page.get("items", [])
        cursor = page.get("cursor")
        if not cursor:
            break
    docs.sort(key=lambda d: -int(d.get("downloads") or 0))
    return docs[:rows]

FILM_QUERY = """
SELECT ?ia ?title ?date ?links WHERE {
  VALUES ?type { wd:Q11424 wd:Q24869 wd:Q202866 wd:Q506240 }
  ?film wdt:P31 ?type; wdt:P724 ?ia; wikibase:sitelinks ?links.
  ?film rdfs:label ?title. FILTER(LANG(?title) = "en")
  OPTIONAL { ?film wdt:P577 ?date }
}
ORDER BY DESC(?links)
LIMIT %d
"""

EPISODE_QUERY = """
SELECT ?ia ?title ?show ?date WHERE {
  ?ep wdt:P31 wd:Q21191270; wdt:P724 ?ia; wdt:P179 ?series.
  ?ep rdfs:label ?title. FILTER(LANG(?title) = "en")
  ?series rdfs:label ?show. FILTER(LANG(?show) = "en")
  OPTIONAL { ?ep wdt:P577 ?date }
}
LIMIT %d
"""


def wikidata(query):
    """Rows of a Wikidata query as plain dicts; empty when Wikidata can't be reached."""
    try:
        url = WIKIDATA + "?" + urllib.parse.urlencode({"query": query, "format": "json"})
        rows = get_json(url, tries=3)["results"]["bindings"]
    except Exception as e:  # noqa: BLE001
        print(f"  Wikidata failed ({e})", file=sys.stderr)
        return []
    return [{k: v["value"] for k, v in r.items()} for r in rows]


def wikidata_items(query, limit):
    """Archive items Wikidata links to films or TV episodes, one row per item."""
    seen, docs = set(), []
    for r in wikidata(query % limit):
        ident = r["ia"].strip()
        if not ident or ident in seen:
            continue
        seen.add(ident)
        docs.append({"identifier": ident, "title": r.get("title"), "year": r.get("date", "")[:4],
                     "date": r.get("date", ""), "show": r.get("show")})
    return docs


search_down = False


def archive_search(collection, rows):
    """Archive search, or nothing when it's down (it often is for GitHub's runners)."""
    global search_down
    if search_down:
        return []
    try:
        return search(collection, rows)
    except Exception as e:  # noqa: BLE001
        print(f"  Archive search for {collection} failed ({e}); skipping it", file=sys.stderr)
        search_down = True
        return []


def merge(*lists):
    seen, out = set(), []
    for docs in lists:
        for d in docs:
            if d["identifier"] not in seen:
                seen.add(d["identifier"])
                out.append(d)
    return out


def seconds(length):
    """File length from Archive metadata: "5412.3" or "01:30:12"."""
    try:
        if ":" in str(length):
            total = 0.0
            for part in str(length).split(":"):
                total = total * 60 + float(part)
            return total
        return float(length)
    except (TypeError, ValueError):
        return 0.0


def mp4_files(identifier):
    """The item's playable MP4s, best copy of each original, in file order."""
    try:
        meta = get_json(METADATA + urllib.parse.quote(identifier), tries=3, timeout=60)
    except Exception as e:  # noqa: BLE001 - one bad item shouldn't stop the build
        print(f"  skip {identifier}: {e}", file=sys.stderr)
        return []
    if meta.get("is_dark") or meta.get("metadata", {}).get("access-restricted-item"):
        return []
    best = {}
    for f in meta.get("files", []):
        name = f.get("name", "")
        if not name.lower().endswith(".mp4"):
            continue
        fmt = f.get("format", "")
        rank = 0 if fmt.startswith("h.264") or fmt == "MPEG4" else 1 if "512Kb" in fmt else 2
        original = f.get("original") or name
        if original not in best or rank < best[original][0]:
            best[original] = (rank, name, seconds(f.get("length")), f.get("title"))
    return [{"name": n, "length": s, "title": t} for _, n, s, t in best.values()]


def clean(text):
    return re.sub(r"\s+", " ", str(text or "")).strip().replace(",", " ").strip()


def file_url(identifier, name):
    return DOWNLOAD + urllib.parse.quote(identifier) + "/" + urllib.parse.quote(name)


def extinf(name, logo, group):
    return f'#EXTINF:-1 tvg-logo="{logo}" group-title="{group}",{name}'


def show_and_episode(title):
    """Splits "Show - Episode title" / "Show: Episode title"; None when there's no show name."""
    for sep in (" - ", ": ", " – ", " | "):
        if sep in title:
            show, episode = title.split(sep, 1)
            if 2 <= len(show) <= 60:
                return show.strip(), episode.strip()
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--movies", type=int, default=400, help="films to look at")
    ap.add_argument("--items", type=int, default=800, help="TV items to look at")
    args = ap.parse_args()

    # Wikidata's links from films and episodes to Archive items come first: its query
    # service is reliable from GitHub's runners and its films are the well-known ones.
    # The Archive's own search adds more when it is up.
    wd_films = wikidata_items(FILM_QUERY, args.movies)
    wd_tv = sorted(wikidata_items(EPISODE_QUERY, args.items), key=lambda d: (d["show"] or "", d["date"]))
    print(f"Wikidata: {len(wd_films)} films, {len(wd_tv)} TV episodes")
    films = merge(wd_films, archive_search("feature_films", args.movies))
    tv = merge(wd_tv, archive_search("classic_tv", args.items))
    print(f"Search: {len(films)} films, {len(tv)} TV items")

    with cf.ThreadPoolExecutor(8) as pool:
        film_files = dict(zip([d["identifier"] for d in films], pool.map(mp4_files, [d["identifier"] for d in films])))
        tv_files = dict(zip([d["identifier"] for d in tv], pool.map(mp4_files, [d["identifier"] for d in tv])))

    lines = ["#EXTM3U", "# Free public-domain films and TV from the Internet Archive (archive.org)."]

    movies = 0
    for d in films:
        files = [f for f in film_files[d["identifier"]] if f["length"] >= MIN_MOVIE_SECONDS or not f["length"]]
        if len(files) != 1:  # none, or a film split into parts
            continue
        year = str(d.get("year") or "")[:4]
        title = clean(d.get("title"))
        if not title:
            continue
        name = f"{title} ({year})" if year.isdigit() and year not in title else title
        group = f"{year[:3]}0s" if year.isdigit() else "Classic films"
        lines += [extinf(name, POSTER + d["identifier"], group), file_url(d["identifier"], files[0]["name"])]
        movies += 1

    # Series: an item with several episodes is one show; single-episode items are
    # grouped by the show name in their title.
    shows = {}
    for d in tv:
        ident = d["identifier"]
        files = tv_files[ident]
        title = clean(d.get("title"))
        if not files or not title:
            continue
        if d.get("show"):
            shows.setdefault(clean(d["show"]), []).append((title, ident, files[0]["name"]))
        elif len(files) > 1:
            show = show_and_episode(title)[0] if show_and_episode(title) else title
            for f in files:
                ep = clean(f["title"] or os.path.splitext(os.path.basename(f["name"]))[0])
                shows.setdefault(show, []).append((ep, ident, f["name"]))
        else:
            split = show_and_episode(title)
            if split:
                shows.setdefault(split[0], []).append((split[1], ident, files[0]["name"]))

    series = episodes = 0
    for show in sorted(shows, key=str.lower):
        eps = shows[show]
        if len(eps) < MIN_EPISODES:
            continue
        series += 1
        for n, (ep, ident, name) in enumerate(eps, 1):
            lines += [extinf(f"{show} Episode {n} - {ep}", POSTER + ident, "Classic TV series"), file_url(ident, name)]
            episodes += 1

    docs = os.path.join(ROOT, "docs")
    with open(os.path.join(docs, "Movies.m3u"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    with open(os.path.join(docs, "movies.json"), "w", encoding="utf-8") as f:
        json.dump({
            "built": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
            "movies": movies,
            "series": series,
            "episodes": episodes,
        }, f, indent=2)
        f.write("\n")
    print(f"Wrote docs/Movies.m3u: {movies} movies, {series} series, {episodes} episodes")
    if movies == 0:
        sys.exit("No movies found; keeping the build red so the old playlist isn't replaced.")


if __name__ == "__main__":
    main()
