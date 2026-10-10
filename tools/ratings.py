"""
Viewers' ratings of Spark channel programmes (owner, 2026-10-10): near the end of a programme the channel page
(docs/channel/ytc.html) asks for 👍 / 👎 or 1 to 5 stars and saves the answer in the owner's Firebase ("ratings",
nothing personal: channel, video, title, like, stars, time). Channel Studio shows them per programme, and the
daily channel lists (tools/build_youtube_channels.py) mark the best-liked programmes, and other episodes of the
same show, "top", so they come round more often; programmes most viewers dislike are never "top".

    python3 tools/ratings.py      prints what viewers think, best liked first
"""
import json
import re
import sys
import urllib.parse
import urllib.request

URL = ("https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/ratings"
       "?pageSize=300&key=AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE")
# A programme needs this many answers before it counts as liked or disliked.
LEAST = 2


def load():
    """{video id: {"up": n, "down": n, "stars": [..], "title": str}}; empty when they can't be read."""
    out, token = {}, ""
    try:
        while True:
            req = urllib.request.Request(URL + (f"&pageToken={urllib.parse.quote(token)}" if token else ""),
                                         headers={"User-Agent": "CableTV-ratings/1.0"})
            with urllib.request.urlopen(req, timeout=30) as r:
                page = json.loads(r.read().decode("utf-8"))
            for doc in page.get("documents", []):
                f = doc.get("fields", {})
                vid = f.get("video", {}).get("stringValue")
                if not vid:
                    continue
                v = out.setdefault(vid, {"up": 0, "down": 0, "stars": [], "title": f.get("title", {}).get("stringValue", "")})
                like = int(f.get("like", {}).get("integerValue", 0))
                stars = int(f.get("stars", {}).get("integerValue", 0))
                if like > 0:
                    v["up"] += 1
                elif like < 0:
                    v["down"] += 1
                if 1 <= stars <= 5:
                    v["stars"].append(stars)
            token = page.get("nextPageToken")
            if not token:
                break
    except Exception as e:  # noqa: BLE001
        print(f"::warning::Viewers' ratings could not be read ({e}); are the Firestore rules for 'ratings' published?", file=sys.stderr)
    return out


def votes(r):
    """(good, bad): a like or 4-5 stars is good, a dislike or 1-2 stars bad."""
    good = r["up"] + sum(1 for s in r["stars"] if s >= 4)
    bad = r["down"] + sum(1 for s in r["stars"] if s <= 2)
    return good, bad


def liked(r):
    good, bad = votes(r)
    return good >= LEAST and good >= 2 * bad


def disliked(r):
    good, bad = votes(r)
    return bad >= LEAST and bad > good


EPISODE = re.compile(r"\s(?:episode|ep\.?|e)\s*\d+.*$|\s[|｜#].*$|\s-\s.*$|\s\(.*$", re.I)


def show_of(title):
    """A programme's show ("Mere Pass Raho Tum Episode 4 | Geo" -> "mere pass raho tum"), for "similar ones"."""
    return re.sub(r"\s+", " ", EPISODE.sub("", title or "")).strip().lower()


def apply(videos, ratings):
    """Marks the best-liked programmes and their shows' other episodes "top", and disliked ones not top.
    Returns how many were raised and lowered."""
    # Last time's marks come off first, so a programme viewers stop liking goes back to normal.
    for v in videos:
        if v.pop("rated", None) == "high":
            v["top"] = False
    if not ratings:
        return 0, 0
    shows = {show_of(v["title"]) for v in videos if v["id"] in ratings and liked(ratings[v["id"]])}
    shows.discard("")
    up = down = 0
    for v in videos:
        r = ratings.get(v["id"])
        if r and disliked(r):
            down += bool(v.get("top"))
            v["top"] = False
            v["rated"] = "low"
        elif (r and liked(r)) or show_of(v["title"]) in shows:
            up += not v.get("top")
            v["top"] = True
            v["rated"] = "high"
    return up, down


if __name__ == "__main__":
    rs = load()
    for vid, r in sorted(rs.items(), key=lambda x: -(votes(x[1])[0] - votes(x[1])[1])):
        avg = sum(r["stars"]) / len(r["stars"]) if r["stars"] else 0
        print(f"{vid}  👍{r['up']} 👎{r['down']} ★{avg:.1f} ({len(r['stars'])})  {r['title'][:70]}")
