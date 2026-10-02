#!/usr/bin/env python3
"""
Builds app/src/livetv/assets/channel_info.json: a logo and category for each
Famelack (TV Garden) channel, matched by name against the iptv-org database.

Famelack's lists have no logos, and downloading the iptv-org database on the
phone would cost ~13 MB, so the match is done here and shipped with the app.

Output: {"<famelack nanoid>": ["<logo url>", "<category or empty>"], ...}
"""
import json
import re
import sys
import urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor

FAMELACK = "https://raw.githubusercontent.com/famelack/famelack-channels/main/tv/raw"
IPTV_ORG = "https://raw.githubusercontent.com/iptv-org/api/gh-pages"
OUT = "app/src/livetv/assets/channel_info.json"


def fetch(url):
    with urllib.request.urlopen(url, timeout=120) as r:
        return json.load(r)


def norm(name):
    s = name.lower()
    s = re.sub(r"\(.*?\)", "", s)
    s = re.sub(r"\b(hd|fhd|uhd|4k|sd|tv|channel|television)\b", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def logo_rank(logo):
    # Prefer the main feed, logos in use, non-picon, landscape, larger.
    return (
        logo.get("feed") is None,
        logo.get("in_use", False),
        "picons" not in (logo.get("tags") or []),
        (logo.get("width") or 0) >= (logo.get("height") or 0),
        logo.get("width") or 0,
    )


def main():
    channels = fetch(f"{IPTV_ORG}/channels.json")
    best = {}
    for logo in fetch(f"{IPTV_ORG}/logos.json"):
        cur = best.get(logo["channel"])
        if cur is None or logo_rank(logo) > logo_rank(cur):
            best[logo["channel"]] = logo

    by_country = defaultdict(dict)
    everywhere = defaultdict(set)
    for c in channels:
        if c.get("closed") or c["id"] not in best:
            continue
        info = (best[c["id"]]["url"], (c.get("categories") or [""])[0])
        for n in [c["name"], *(c.get("alt_names") or [])]:
            key = norm(n)
            if key:
                by_country[c["country"].lower()].setdefault(key, info)
                everywhere[key].add(info)

    def lookup(name, cc):
        key = norm(name)
        local = by_country.get(cc, {})
        if key in local:
            return local[key]
        if len(everywhere.get(key, ())) == 1:
            return next(iter(everywhere[key]))
        # "CBC News Toronto" -> "CBC News": longest known name it starts with.
        prefixes = [k for k in local if len(k) >= 4 and key.startswith(k)]
        return local[max(prefixes, key=len)] if prefixes else None

    countries = [c.lower() for c, m in fetch(f"{FAMELACK}/countries_metadata.json").items() if m.get("hasChannels")]
    with ThreadPoolExecutor(8) as pool:
        lists = dict(zip(countries, pool.map(lambda c: fetch(f"{FAMELACK}/countries/{c}.json"), countries)))

    out, total = {}, 0
    for cc, entries in lists.items():
        for e in entries:
            total += 1
            hit = lookup(e.get("name", ""), cc)
            if hit and e.get("nanoid"):
                out[e["nanoid"]] = list(hit)

    with open(OUT, "w") as f:
        json.dump(out, f, separators=(",", ":"), sort_keys=True)
    print(f"Matched {len(out)} of {total} channels -> {OUT}", file=sys.stderr)


if __name__ == "__main__":
    main()
