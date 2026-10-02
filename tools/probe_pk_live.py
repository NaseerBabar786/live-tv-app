"""One-off probe: how to find a YouTube channel's current live video from its pages."""
import re, urllib.request
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI"}
def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25) as r:
        return r.geturl(), r.read().decode("utf-8", "replace")
MARKS = ["BADGE_STYLE_TYPE_LIVE_NOW", '"style":"LIVE"', "THUMBNAIL_OVERLAY_BADGE_STYLE_LIVE", '"isLive":true', "watching", "LIVE_NOW"]
for name, cid in [("Geo News", "UC_vt34wimdCzdkrzVejwX9g"), ("ARY News", "UCMmpLL2ucRHAXbNHiCPyIyg"), ("Kids Land", "UCZMKZS3L9GfhcFkMyBRoVFg")]:
    for path in ("live", "streams"):
        final, page = get(f"https://www.youtube.com/channel/{cid}/{path}")
        canon = re.search(r'<link rel="canonical" href="([^"]*)"', page)
        print(f"== {name} /{path}: final={final} canonical={canon and canon.group(1)} len={len(page)}")
        print("   marks:", {m: page.count(m) for m in MARKS})
        for m in list(re.finditer(r'"videoId":"([\w-]{11})"', page))[:40]:
            chunk = page[m.end():m.end() + 4000]
            hits = [k for k in MARKS if k in chunk]
            if hits:
                print("   ", m.group(1), hits)
        i = page.find('"isLive":true')
        if i >= 0:
            print("   around isLive:", page[max(0, i - 400):i + 100].replace("\n", " ")[:500])
