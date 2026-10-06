#!/usr/bin/env python3
"""
Builds docs/epg.json (tv.bulkbazaar.ca/epg.json): what's on now and next on our channels, for
Live TV Max's guide. Programme listings come from the free public XMLTV guides at
epgshare01.online, one or more files per country. Only channels that are in our lists (the
Famelack countries Cable TV shows by default, plus docs/LiveTV.m3u) are kept, and only the next
30 hours, so the file stays small enough for a TV to download.

Channels are matched by name: both sides go through key() (Guide.key in the app does the same),
so "Geo News HD" in a guide matches "Geo News" in our list.

Output: {"updated": <unix seconds>, "channels": {"<key>": [[start, stop, "title"], ...]}}

Standard library only. Run: python3 tools/build_epg.py
"""
import gzip
import io
import json
import os
import re
import sys
import time
import unicodedata
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime

DOCS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs")
OUT = os.path.join(DOCS, "epg.json")

GUIDES = "https://epgshare01.online/epgshare01/"
# Our default countries (Famelack.MIX) and the guide files' country codes.
COUNTRIES = {"pk": "PK", "in": "IN", "ca": "CA", "uk": "UK", "us": "US"}
FAMELACK = "https://raw.githubusercontent.com/famelack/famelack-channels/main/tv/raw/countries/{}.json"
# Each country's guide files: "epg_ripper_PK1.xml.gz", "epg_ripper_US2.xml.gz"... (not the
# huge local-station files such as US_LOCALS).
GUIDE_FILE = re.compile(r'href="(epg_ripper_({})\d*\.xml\.gz)"'.format("|".join(COUNTRIES.values())))

HOURS = 30
MAX_PER_CHANNEL = 24
UA = "Mozilla/5.0 (LiveTV guide builder; +https://tv.bulkbazaar.ca)"

_DROP_TAIL = {"hd", "fhd", "uhd", "sd", "4k", "tv", "channel", "pk", "in", "ca", "uk", "us", "usa", "east", "west"}


def key(name):
    """Matching key for a channel name; must stay the same as Guide.key in the app."""
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\([^)]*\)|\[[^\]]*\]", " ", s)
    words = re.findall(r"[a-z0-9]+", s)
    while len(words) > 1 and words[-1] in _DROP_TAIL:
        words.pop()
    return "".join(words)


def fetch(url, tries=3):
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            print(f"  {url}: {e}", file=sys.stderr)
            time.sleep(3 * (attempt + 1))
    return None


def our_keys():
    keys = set()
    for cc in COUNTRIES:
        raw = fetch(FAMELACK.format(cc))
        if not raw:
            continue
        for entry in json.loads(raw):
            if entry.get("name"):
                keys.add(key(entry["name"]))
    m3u = os.path.join(DOCS, "LiveTV.m3u")
    if os.path.exists(m3u):
        for line in open(m3u, encoding="utf-8", errors="ignore"):
            if line.startswith("#EXTINF") and "," in line:
                keys.add(key(line.rsplit(",", 1)[1].strip()))
    # Very short names ("10 TV" -> "10") would match unrelated channels.
    return {k for k in keys if len(k) >= 3}


def when(text):
    """XMLTV time "20261004183000 +0000" -> unix seconds."""
    text = text.strip()
    try:
        if " " in text:
            return int(datetime.strptime(text, "%Y%m%d%H%M%S %z").timestamp())
        return int(datetime.strptime(text[:14] + " +0000", "%Y%m%d%H%M%S %z").timestamp())
    except ValueError:
        return None


def read_guide(data, wanted, now, out):
    """Adds the wanted channels' programmes in the window from one XMLTV file to out."""
    stream = gzip.GzipFile(fileobj=io.BytesIO(data))
    ids = {}  # guide channel id -> our key
    kept = 0
    for _, el in ET.iterparse(stream, events=("end",)):
        if el.tag == "channel":
            cid = el.get("id", "")
            names = [d.text or "" for d in el.findall("display-name")]
            # The id ("Geo.News.pk") often names the channel too.
            names.append(re.sub(r"\.[a-z]{2}$", "", cid, flags=re.IGNORECASE).replace(".", " "))
            for n in names:
                k = key(n)
                if k in wanted:
                    ids[cid] = k
                    break
            el.clear()
        elif el.tag == "programme":
            k = ids.get(el.get("channel", ""))
            if k:
                start, stop = when(el.get("start", "")), when(el.get("stop", ""))
                title = (el.findtext("title") or "").strip()
                if start and stop and title and stop > now and start < now + HOURS * 3600:
                    out.setdefault(k, {})[start] = [start, stop, title[:80]]
                    kept += 1
            el.clear()
    return len(set(ids.values())), kept


def main():
    now = int(time.time())
    wanted = our_keys()
    print(f"{len(wanted)} channel names in our lists")
    if not wanted:
        sys.exit("Could not load our channel lists.")
    index = fetch(GUIDES)
    files = sorted(set(m.group(1) for m in GUIDE_FILE.finditer(index.decode("utf-8", "ignore")))) if index else []
    print("Guide files:", ", ".join(files) or "none")
    out = {}
    for name in files:
        data = fetch(GUIDES + name)
        if not data:
            continue
        try:
            channels, programmes = read_guide(data, wanted, now, out)
            print(f"  {name}: {channels} of our channels, {programmes} programmes")
        except (ET.ParseError, OSError, EOFError) as e:
            print(f"  {name}: could not read ({e})", file=sys.stderr)
    channels = {k: sorted(v.values())[:MAX_PER_CHANNEL] for k, v in sorted(out.items())}
    print(f"{len(channels)} channels with a guide")
    if not channels:
        sys.exit("No guide data; keeping the old file.")
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump({"updated": now, "channels": channels}, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote {OUT} ({os.path.getsize(OUT) // 1024} KB)")


if __name__ == "__main__":
    main()
