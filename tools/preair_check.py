"""
The pre-air check (owner's rule, 2026-10-07): "on all our channels, in every programme, no YouTube options
show ... also in the Library ... no video goes live until you do a check". Two parts:

  --pages   Every page of ours that plays YouTube is locked: YouTube's buttons off (controls 0, no keyboard,
            no full-screen button, no related videos, no notes), a clear sheet over the player taking every
            click, our own cover over every state but PLAYING and over errors, the player taller than its
            box so YouTube's own title and bars sit out of sight, keepplaying.js (a pause is undone), and no
            link to YouTube. The app (TV + phone) and the PC app never hand anything to YouTube's site or app.
            Offline; fails the CI run when anything is missing.

  --lists   Every YouTube video on our lists is checked before it goes on air: our channels (yt-*.json,
            Spark Hits, Spark TV's trailers, music videos and programme blocks), the Library
            (Dramas.m3u, MTA.m3u) and the live channels (PakistanLive.m3u). A video that won't play in an embedded
            player (YouTube's oEmbed: 401 = embedding turned off, 404 = removed or private; or found by the
            nightly check, unplayable.json) is taken off the list, so it never shows YouTube's error or
            "Watch on YouTube" screen. A new video whose check gets no answer is held back until it passes.
            The locked days (locked/*.json) stay as they are; their players skip what preair-bad.json and
            unplayable.json list.
            --files FILE ...   only these lists (the build jobs check what they just made)
            --save             also keep what was learnt (preair.json, preair-bad.json); only the hourly job

  python3 tools/preair_check.py --pages
  python3 tools/preair_check.py --lists [--save] [--files docs/Dramas.m3u ...]
"""
import argparse
import datetime
import glob
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from no_horror import is_horror  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DOCS = os.path.join(ROOT, "docs")
CHANNEL = os.path.join(DOCS, "channel")
CACHE = os.path.join(CHANNEL, "preair.json")       # video id -> the day it last passed
BAD = os.path.join(CHANNEL, "preair-bad.json")     # what failed, read by the players and the builders
RECHECK_DAYS = 3
YT_ID = re.compile(r"^[\w-]{11}$")
YT_URL = re.compile(r"^https?://(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|shorts/|live/)|youtu\.be/)([\w-]{11})")


def rel(path):
    return os.path.relpath(path, ROOT)


# ---------------------------------------------------------------- pages

# Pages only the owner sees (Channel Studio's preview), not channels.
ADMIN_PAGES = {"docs/studio.html"}
# Library films pause on our own button (our cover with a still goes over YouTube's paused screen), so they
# don't undo a pause; everything else does.
OWN_PAUSE = {"docs/channel/film.html"}
NEEDED_VARS = {"controls": "0", "disablekb": "1", "fs": "0", "rel": "0", "iv_load_policy": "3"}


def check_pages():
    problems = []
    pages = [p for p in glob.glob(os.path.join(DOCS, "**", "*.html"), recursive=True) if rel(p) not in ADMIN_PAGES]
    players = 0
    for page in sorted(pages):
        name = rel(page)
        text = open(page, encoding="utf-8").read()
        if re.search(r"""href=["'`]https?://(?:www\.|m\.)?(?:youtube\.com|youtu\.be)""", text):
            problems.append(f"{name}: has a link to YouTube.")
        if re.search(r"""<iframe[^>]+src=["'`][^"'`]*youtube(?:-nocookie)?\.com/embed""", text) or \
                re.search(r"""\.src\s*=\s*[`'"]https://www\.youtube(?:-nocookie)?\.com/embed""", text):
            problems.append(f"{name}: puts YouTube's player in an iframe of its own, without our lock.")
        if "YT.Player(" not in text:
            continue
        players += 1
        m = re.search(r"playerVars:\s*\{([^}]*)\}", text)
        vars_ = dict(re.findall(r"(\w+):\s*([^,}]+)", m.group(1))) if m else {}
        for key, want in NEEDED_VARS.items():
            if vars_.get(key, "").strip() != want:
                problems.append(f"{name}: playerVars must have {key}: {want}.")
        if 'class="shield"' not in text:
            problems.append(f"{name}: no clear sheet (class=\"shield\") over the player.")
        if 'class="cover"' not in text or "cover(true" not in text:
            problems.append(f"{name}: no cover of ours over YouTube's loading and paused screens.")
        if "onError" not in text:
            problems.append(f"{name}: no onError; YouTube's error screen would stay.")
        if name not in OWN_PAUSE and "keepplaying.js" not in text:
            problems.append(f"{name}: doesn't load keepplaying.js (a pause must be undone).")
        if "--box" not in text and "height: 140vh" not in text:
            problems.append(f"{name}: the player isn't taller than its box, so YouTube's own bars could show.")
    # The apps: nothing of ours opens YouTube's app or site.
    code = glob.glob(os.path.join(ROOT, "app", "src", "main", "**", "*.kt"), recursive=True) + \
        glob.glob(os.path.join(ROOT, "cabletv-pc", "src", "**", "*.js"), recursive=True)
    for f in code:
        text = open(f, encoding="utf-8").read()
        for bad in ("com.google.android.youtube", "vnd.youtube"):
            if bad in text:
                problems.append(f"{rel(f)}: hands videos to YouTube's app ({bad}).")
    for f in ("app/src/main/java/com/livetv/app/WebChannelActivity.kt", "app/src/main/java/com/livetv/app/ui/YouTubePlayer.kt"):
        text = open(os.path.join(ROOT, f), encoding="utf-8").read()
        if text.count("shouldOverrideUrlLoading") != text.count("YouTube.blocksNavigation("):
            problems.append(f"{f}: a page's window can still be taken to YouTube (YouTube.blocksNavigation).")
    print(f"Checked {len(pages)} pages, {players} with YouTube's player, and {len(code)} app files.")
    for p in problems:
        print(f"::error::{p}")
    if problems:
        print(f"{len(problems)} problem(s): YouTube's own screens could show on our channels.")
        return 1
    print("All locked: no YouTube buttons, titles, logos or 'More videos' on our channels.")
    return 0


# ---------------------------------------------------------------- lists

def load(path, default):
    try:
        return json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        return default


def lookup(video_id):
    """'ok', a reason it won't play, or None when YouTube gave no answer."""
    url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote(f"https://www.youtube.com/watch?v={video_id}")
    for _ in range(2):
        try:
            urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}), timeout=15).close()
            return "ok"
        except urllib.error.HTTPError as e:
            if e.code == 401:
                return "embedding turned off by its owner"
            if e.code in (400, 404):
                return "removed or private"
        except Exception:
            pass
    return None


# Lists whose items carry a YouTube video id ("id"): taken off the list when it fails.
JSON_LISTS = ["channel/yt-*.json", "channel/bollywood.json", "channel/trailers.json", "channel/music-videos.json",
              "channel/block-*.json", "weather/videos.json"]
M3U_LISTS = ["Dramas.m3u", "MTA.m3u", "PakistanLive.m3u"]
# Lists of songs and weather clips rather than programmes: the no-horror rule doesn't take songs off them.
NOT_PROGRAMMES = {"bollywood.json", "music-videos.json", "sur.json", "videos.json"}


def all_lists():
    files = []
    for pattern in JSON_LISTS + M3U_LISTS:
        files += sorted(glob.glob(os.path.join(DOCS, pattern)))
    return files


def ids_in(path):
    if path.endswith(".m3u"):
        return [m.group(1) for line in open(path, encoding="utf-8") if (m := YT_URL.match(line.strip()))]
    d = load(path, {})
    return [v["id"] for key in ("videos", "songs", "spares") for v in d.get(key, []) if isinstance(v, dict) and YT_ID.match(str(v.get("id", "")))]


def drop(path, gone):
    """Takes the videos in gone off the list; how many went."""
    if path.endswith(".m3u"):
        lines = open(path, encoding="utf-8").read().split("\n")
        out, n, i = [], 0, 0
        while i < len(lines):
            m = YT_URL.match(lines[i].strip())
            if m and m.group(1) in gone:
                n += 1
                # Its #EXTINF line (and any #EXTVLCOPT lines) go with it.
                while out and out[-1].startswith("#") and not out[-1].startswith("#EXTM3U"):
                    last = out.pop()
                    if last.startswith("#EXTINF"):
                        break
            else:
                out.append(lines[i])
            i += 1
        if n:
            open(path, "w", encoding="utf-8").write("\n".join(out))
        return n
    d = load(path, {})
    n = 0
    for key in ("videos", "songs", "spares"):
        if isinstance(d.get(key), list):
            keep = [v for v in d[key] if not (isinstance(v, dict) and v.get("id") in gone)]
            n += len(d[key]) - len(keep)
            d[key] = keep
    if n:
        # The running length of a programme block is the sum of its videos (block.html, schedule.js).
        if isinstance(d.get("secs"), (int, float)) and d.get("videos") and all("secs" in v for v in d["videos"]):
            d["secs"] = sum(v["secs"] for v in d["videos"])
        with open(path, "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, indent=1)
            f.write("\n")
    return n


def check_lists(files, save):
    today = datetime.date.today()
    cache = load(CACHE, {}).get("ok", {})
    bad = load(BAD, {}).get("ids", {})
    nightly = load(os.path.join(CHANNEL, "unplayable.json"), {}).get("ids", {})
    where = {}
    for f in files:
        for i in ids_in(f):
            where.setdefault(i, set()).add(os.path.basename(f))
    fresh = lambda i: i in cache and (today - datetime.date.fromisoformat(cache[i])).days < RECHECK_DAYS
    todo = [i for i in where if i not in nightly and not fresh(i)]
    with ThreadPoolExecutor(16) as pool:
        answers = dict(zip(todo, pool.map(lookup, todo)))
    unanswered = [i for i, a in answers.items() if a is None]
    print(f"{len(where)} videos on {len(files)} lists; {len(todo)} looked up, {len(unanswered)} got no answer.")
    # YouTube not answering most look-ups (too many at once) says nothing about the videos: they are tried
    # again on the next run instead of emptying the lists. A few unanswered new videos are held back.
    jammed = bool(todo) and len(unanswered) > len(todo) / 4
    if jammed:
        print(f"::warning::{len(unanswered)} of {len(todo)} look-ups got no answer; those are tried again next run.")
    gone = {}
    for i, a in answers.items():
        if a == "ok":
            cache[i] = today.isoformat()
            bad.pop(i, None)
        elif a is not None:
            gone[i] = a
            cache.pop(i, None)
            bad[i] = {"why": a, "where": sorted(where[i]), "since": bad.get(i, {}).get("since", today.isoformat())}
        elif i not in cache and not jammed:
            gone[i] = "not checked yet (no answer from YouTube); held back until it passes"
        # A video that passed before and got no answer now stays: it played a few days ago.
    for i in where:
        if i in nightly:
            gone[i] = nightly[i].get("why", "can't play here")
        elif i in bad and i not in answers:
            gone[i] = bad[i]["why"]
    # The owner's rule (2026-10-08): no horror on our channels (tools/no_horror.py). Songs from a horror
    # film's soundtrack are not horror programmes, so the music lists keep them; the Library is not part of it.
    for f in files:
        if f.endswith(".m3u") or os.path.basename(f) in NOT_PROGRAMMES:
            continue
        for key in ("videos", "spares"):
            for v in load(f, {}).get(key, []) or []:
                if isinstance(v, dict) and v.get("id") in where and is_horror(v):
                    gone[v["id"]] = "horror (no horror on our channels)"
                    bad[v["id"]] = {"why": gone[v["id"]], "where": sorted(where[v["id"]]),
                                    "since": bad.get(v["id"], {}).get("since", today.isoformat())}
    total = 0
    for f in files:
        mine = {i for i in gone if os.path.basename(f) in where.get(i, ())}
        n = drop(f, mine) if mine else 0
        if n:
            total += n
            print(f"::warning::{rel(f)}: {n} video(s) taken off before going on air.")
    for i, why in sorted(gone.items()):
        print(f"  {i} ({', '.join(sorted(where[i]))}): {why}")
    if save:
        keep = {i: d for i, d in cache.items() if (today - datetime.date.fromisoformat(d)).days < 30}
        with open(CACHE, "w", encoding="utf-8") as f:
            json.dump({"checked": today.isoformat(), "ok": dict(sorted(keep.items()))}, f, indent=0)
            f.write("\n")
        recent = {i: b for i, b in bad.items() if (today - datetime.date.fromisoformat(b["since"])).days < 60}
        with open(BAD, "w", encoding="utf-8") as f:
            json.dump({"checked": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                       "ids": dict(sorted(recent.items()))}, f, ensure_ascii=False, indent=1)
            f.write("\n")
    print(f"Pre-air check done: {total} video(s) kept off the air, {len(where) - len(gone)} passed.")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pages", action="store_true")
    ap.add_argument("--lists", action="store_true")
    ap.add_argument("--save", action="store_true")
    ap.add_argument("--files", nargs="*")
    a = ap.parse_args()
    if not (a.pages or a.lists):
        ap.error("say --pages and/or --lists")
    code = 0
    if a.pages:
        code |= check_pages()
    if a.lists:
        files = [os.path.join(ROOT, f) if not os.path.isabs(f) else f for f in a.files] if a.files else all_lists()
        code |= check_lists([f for f in files if os.path.exists(f)], a.save)
    sys.exit(code)


if __name__ == "__main__":
    main()
