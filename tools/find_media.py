#!/usr/bin/env python3
"""Looks up free-to-use films (CC BY / public domain) for the AI dub test and prints their
direct file links, sizes and licences. Run by .github/workflows/ai-dub.yml (step "find")."""
import json, sys, urllib.parse, urllib.request

UA = {"User-Agent": "BazaarTV-media-finder/1.0 (tv.bulkbazaar.ca)"}


def get(url):
    for _ in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40) as r:
                return json.load(r)
        except Exception as e:
            print("  !", url[:90], e)
    return {}


def archive_item(ident):
    m = get(f"https://archive.org/metadata/{ident}")
    if not m.get("files"):
        print(f"[archive] {ident}: nothing"); return
    md = m.get("metadata", {})
    print(f"[archive] {ident} | {md.get('title')} | licence={md.get('licenseurl')} | rights={str(md.get('rights'))[:80]} | coll={md.get('collection')}")
    for f in m["files"]:
        if f["name"].lower().endswith((".mp4", ".mkv", ".mov", ".webm", ".ogv", ".avi")):
            print(f"    https://archive.org/download/{ident}/{urllib.parse.quote(f['name'])}  {int(f.get('size', 0)) // 1000000} MB  {f.get('length', '')}s  {f.get('height', '')}p")


def archive_search(q, rows=8):
    url = "https://archive.org/advancedsearch.php?" + urllib.parse.urlencode(
        {"q": q, "fl[]": ["identifier", "title", "licenseurl", "runtime"], "rows": rows, "output": "json", "sort[]": "downloads desc"}, doseq=True)
    for d in get(url).get("response", {}).get("docs", []):
        print(f"[search] {q[:40]} -> {d.get('identifier')} | {d.get('title')} | {d.get('licenseurl')} | {d.get('runtime')}")


def commons(q, n=12):
    url = "https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode({
        "action": "query", "format": "json", "generator": "search", "gsrnamespace": 6, "gsrlimit": n,
        "gsrsearch": q, "prop": "imageinfo", "iiprop": "url|size|extmetadata"})
    for p in get(url).get("query", {}).get("pages", {}).values():
        ii = (p.get("imageinfo") or [{}])[0]; em = ii.get("extmetadata", {})
        print(f"[commons] {p['title']} | {ii.get('size', 0) // 1000000} MB | {em.get('LicenseShortName', {}).get('value')} | {ii.get('duration', '')} | {ii.get('url')}")


if __name__ == "__main__":
    for ident in ["superman_the_mechanical_monsters", "SupermanTheMechanicalMonsters", "superman_1941", "Superman-TheMechanicalMonsters",
                  "popeye_ali_baba", "Popeye_forty_thieves", "Popeye_Sindbad", "TheMechanicalMonsters"]:
        archive_item(ident)
    for q in ['title:("mechanical monsters") AND mediatype:movies', 'title:(superman) AND title:(fleischer) AND mediatype:movies',
              'title:(popeye) AND collection:(classic_cartoons) AND mediatype:movies', 'collection:classic_cartoons AND mediatype:movies AND title:(superman)']:
        archive_search(q)
    for q in ["Superman Mechanical Monsters filetype:video", "Fleischer Superman filetype:video", "Popeye public domain filetype:video"]:
        commons(q)
