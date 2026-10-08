import json, re, sys, urllib.request
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
def post(url, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), headers={"User-Agent": UA, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        return r.read().decode("utf-8", "replace")
for vid in sys.argv[1:]:
    txt = post("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", {"videoId": vid, "context": {"client": {"clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en"}}})
    j = json.loads(txt)
    # where does this video's own length appear?
    for k in ("lengthSeconds", "approxDurationMs", "lengthText", "durationMs", "accessibilityData\":{\"label\":\"", "\"duration\"", "macroMarkers", "storyboard", "heatMarker", "playerOverlay"):
        print(vid, k, txt.count(k))
    for m in re.finditer(r'"(?:lengthSeconds|approxDurationMs|durationMs|videoDurationMs)":"?(\d+)', txt):
        print("  ", txt[max(0, m.start()-120):m.end()+20].replace("\n", " "))
        break
    m = re.search(r'"heatSeekerHeatMarkers|"markersMap"', txt); print(" markers", bool(m))
    m = re.search(r'"videoPrimaryInfoRenderer".{0,3000}', txt); print(" primary", m and m.group(0)[:300])
    try:
        print(" contents keys", list(j["contents"]["twoColumnWatchNextResults"]["results"]["results"]["contents"][0]))
    except Exception as e:
        print(" no contents", e)
    bot = "confirm you" in txt; print(" bot", bot, len(txt))
