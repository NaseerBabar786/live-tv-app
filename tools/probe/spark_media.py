# Temporary (spark-media-probe branch): fetch current thumbnails of what our channels air, and CC BY music candidates.
import json, os, urllib.request, urllib.parse, re, time
UA = {"User-Agent": "CableTV-ad-maker/1.0 (tv.bulkbazaar.ca)"}
def get(url, timeout=30):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout).read()
os.makedirs("out/thumbs", exist_ok=True); os.makedirs("out/music", exist_ok=True)
lists = {k: f"docs/channel/yt-{k}.json" for k in ["filmein","sur","kids","sports","travel","comedy","english","hindi","dramas","cooking","latest","teens"]}
lists["hits"] = "docs/channel/bollywood.json"; lists["trailers"] = "docs/channel/trailers.json"; lists["mv"] = "docs/channel/music-videos.json"
index = {}
for k, p in lists.items():
    try: vids = json.load(open(p))["videos"]
    except Exception as e: print("skip", k, e); continue
    os.makedirs(f"out/thumbs/{k}", exist_ok=True); index[k] = []
    for v in vids[:14]:
        vid = v.get("id");  
        if not vid: continue
        for q in ("maxresdefault", "sddefault", "hqdefault"):
            try:
                b = get(f"https://i.ytimg.com/vi/{vid}/{q}.jpg")
                if len(b) > 3000:
                    open(f"out/thumbs/{k}/{vid}.jpg", "wb").write(b); index[k].append({"id": vid, "q": q, "title": v.get("title"), "label": v.get("label")}); break
            except Exception: pass
json.dump(index, open("out/thumbs/index.json", "w"), ensure_ascii=False, indent=1)
# music: Wikimedia Commons audio, CC BY / CC0 only
API = "https://commons.wikimedia.org/w/api.php?"
found = {}
for q in ["Kevin MacLeod", "bhangra", "dhol", "Antti Luode", "upbeat music", "energetic music", "dance music electronic", "bollywood instrumental", "punjabi beat", "tabla beat"]:
    params = dict(action="query", format="json", generator="search", gsrsearch=f"{q} filetype:audio", gsrnamespace=6, gsrlimit=50,
                  prop="imageinfo", iiprop="url|size|extmetadata|mediatype")
    try: d = json.loads(get(API + urllib.parse.urlencode(params)))
    except Exception as e: print("search fail", q, e); continue
    for pg in (d.get("query") or {}).get("pages", {}).values():
        ii = (pg.get("imageinfo") or [{}])[0]; md = ii.get("extmetadata", {})
        lic = (md.get("LicenseShortName", {}) or {}).get("value", "")
        if not re.search(r"CC BY \d|CC0|Public domain", lic) or re.search(r"SA|NC|ND", lic): continue
        if ii.get("size", 0) > 25_000_000: continue
        art = re.sub("<[^>]+>", "", (md.get("Artist", {}) or {}).get("value", ""))[:80]
        found[pg["title"]] = {"url": ii.get("url"), "lic": lic, "artist": art, "size": ii.get("size"), "q": q,
                              "dur": (md.get("Duration") or {}).get("value") if isinstance(md.get("Duration"), dict) else None}
    time.sleep(1)
json.dump(found, open("out/music/candidates.json", "w"), ensure_ascii=False, indent=1)
print("candidates", len(found))
n = 0
for t, m in found.items():
    if n >= 60: break
    try:
        name = re.sub(r"[^A-Za-z0-9._-]+", "_", t.replace("File:", ""))[:90]
        open(f"out/music/{name}", "wb").write(get(m["url"], 60)); n += 1; time.sleep(.5)
    except Exception as e: print("dl fail", t, e)
print("downloaded", n)
