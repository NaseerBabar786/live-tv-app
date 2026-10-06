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
    for ident in ["sprite-fright-2021", "CosmosLaundromat", "cosmos-laundromat", "CosmosLaundromatFirstCycle",
                  "DuckandC1951", "Sintel", "agent-327-operation-barbershop", "wing-it-blender"]:
        archive_item(ident)
    for q in ['title:("cosmos laundromat")', 'title:("sprite fright")', 'title:("wing it") AND blender',
              'title:(charge) AND blender', 'collection:prelinger AND subject:(nature OR animals OR science) AND mediatype:movies',
              'collection:nasa AND mediatype:movies AND title:(documentary)']:
        archive_search(q)
    for q in ["Cosmos Laundromat filetype:video", "Sprite Fright filetype:video", "Wing It Blender filetype:video",
              "NASA documentary filetype:video", "documentary narrated public domain filetype:video incategory:Documentary_films"]:
        commons(q)
