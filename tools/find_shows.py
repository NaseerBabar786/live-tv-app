"""Finds free-to-broadcast shows on archive.org: for each search, the most-downloaded items with
an H.264 MP4, their length and a direct link. Prints one JSON line per item (run in Actions)."""
import json, sys, urllib.parse, urllib.request

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "FreeLiveTV/1.0"}), timeout=60) as r:
        return json.load(r)

SEARCHES = [
    ("raja", 'title:(raja harishchandra) AND mediatype:movies', 3),
    ("kaliya", 'title:(kaliya mardan) AND mediatype:movies', 2),
    ("phalke", '(dadasaheb phalke OR "lanka dahan") AND mediatype:movies', 3),
    ("thief", 'title:("thief of bagdad") AND year:1924 AND mediatype:movies', 2),
    ("sindbad", 'title:(popeye sindbad) AND mediatype:movies', 2),
    ("alibaba", 'title:(popeye "ali baba") AND mediatype:movies', 2),
    ("aladdin", 'title:(popeye aladdin) AND mediatype:movies', 2),
    ("gulliver", 'title:("gulliver\'s travels") AND year:1939 AND mediatype:movies', 2),
    ("superman", 'collection:classic_cartoons AND title:(superman)', 6),
    ("felix", 'collection:classic_cartoons AND title:(felix)', 4),
    ("casper", 'collection:classic_cartoons AND title:(casper)', 3),
    ("keaton", 'title:("the general" OR "sherlock jr" OR "steamboat bill" OR "the navigator") AND creator:(keaton) AND mediatype:movies', 6),
    ("keaton2", 'title:(buster keaton) AND mediatype:movies AND collection:(feature_films OR silent_films)', 6),
    ("lloyd", 'title:("safety last" OR "the freshman" OR "grandma\'s boy") AND mediatype:movies', 4),
    ("chaplin", 'title:(chaplin) AND collection:(feature_films OR silent_films OR comedy_films) AND mediatype:movies', 6),
    ("laurel", 'title:("flying deuces" OR "laurel and hardy") AND mediatype:movies', 4),
    ("apollo", 'title:(apollo 11) AND creator:(nasa) AND mediatype:movies', 4),
    ("nasa", 'collection:nasa AND mediatype:movies AND title:(earth OR moon OR space station)', 6),
    ("blender", 'title:(spring OR "cosmos laundromat" OR "agent 327" OR "coffee run" OR "sprite fright" OR caminandes OR "glass half" OR "wing it") AND title:(blender) AND mediatype:movies', 8),
    ("travel", 'collection:prelinger AND title:(india OR pakistan OR kashmir OR bombay OR delhi OR lahore OR karachi)', 8),
    ("nature", 'collection:prelinger AND title:(animals OR birds OR ocean OR nature)', 4),
]

for tag, q, rows in SEARCHES:
    url = "https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(
        [("q", q), ("fl[]", "identifier"), ("fl[]", "title"), ("fl[]", "year"), ("fl[]", "licenseurl"),
         ("fl[]", "collection"), ("sort[]", "downloads desc"), ("rows", str(rows)), ("output", "json")])
    try:
        docs = get(url)["response"]["docs"]
    except Exception as e:
        print(json.dumps({"tag": tag, "error": str(e)})); continue
    for d in docs:
        ident = d["identifier"]
        try:
            meta = get(f"https://archive.org/metadata/{ident}")
        except Exception as e:
            print(json.dumps({"tag": tag, "id": ident, "error": str(e)})); continue
        files = [f for f in meta.get("files", []) if f.get("name", "").lower().endswith(".mp4")]
        def score(f):
            fmt = f.get("format", "")
            return (fmt == "h.264 HD", fmt == "h.264", fmt == "MPEG4", fmt == "512Kb MPEG4", -abs(int(f.get("size", 0) or 0) - 600_000_000))
        files.sort(key=score, reverse=True)
        if not files:
            print(json.dumps({"tag": tag, "id": ident, "title": d.get("title"), "error": "no mp4"})); continue
        f = files[0]
        length = f.get("length")
        try:
            length = float(length) if length and ":" not in str(length) else sum(float(x) * 60 ** i for i, x in enumerate(reversed(str(length).split(":"))))
        except Exception:
            length = None
        m = meta.get("metadata", {})
        print(json.dumps({
            "tag": tag, "id": ident, "title": m.get("title"), "year": m.get("year") or m.get("date"),
            "license": m.get("licenseurl") or m.get("rights") or "", "collection": m.get("collection"),
            "file": f["name"], "format": f.get("format"), "size": f.get("size"), "secs": length,
            "url": f"https://archive.org/download/{ident}/{urllib.parse.quote(f['name'])}",
        }), flush=True)
