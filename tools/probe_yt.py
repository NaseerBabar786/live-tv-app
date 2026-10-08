import json, re, sys, urllib.request
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
def get(url, data=None, headers=None):
    h = {"User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", "Cookie": "CONSENT=YES+1; SOCS=CAI"}
    h.update(headers or {})
    req = urllib.request.Request(url, data=data, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=40) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return str(e), ""
vid = sys.argv[1]
st, page = get(f"https://www.youtube.com/watch?v={vid}&hl=en")
print("watch", st, len(page), {k: page.count(k) for k in ("lengthSeconds", "shortDescription", "playerStoryboardSpecRenderer", "confirm you", "consent.youtube", "LOGIN_REQUIRED", "UNPLAYABLE", "playabilityStatus")})
m = re.search(r'"playabilityStatus":\{"status":"(\w+)"(?:,"reason":"([^"]*)")?', page); print(" playability", m and m.groups())
for client, ver, extra in (("WEB", "2.20250101.00.00", {}), ("TVHTML5_SIMPLY_EMBEDDED_PLAYER", "2.0", {"thirdParty": {"embedUrl": "https://www.youtube.com/"}}),
                           ("ANDROID_VR", "1.60.19", {}), ("WEB_EMBEDDED_PLAYER", "1.20250101.00.00", {"thirdParty": {"embedUrl": "https://tv.bulkbazaar.ca/"}})):
    body = {"videoId": vid, "context": {"client": {"clientName": client, "clientVersion": ver, "hl": "en"}, **extra}}
    st, txt = get("https://www.youtube.com/youtubei/v1/player?prettyPrint=false", json.dumps(body).encode(), {"Content-Type": "application/json"})
    try:
        j = json.loads(txt)
        vd = j.get("videoDetails", {})
        sb = j.get("storyboards", {})
        print(client, st, j.get("playabilityStatus", {}).get("status"), j.get("playabilityStatus", {}).get("reason"), "len", vd.get("lengthSeconds"),
              "desc", (vd.get("shortDescription") or "")[:200].replace("\n", " / "), "sb", list(sb))
    except Exception as e:
        print(client, st, "bad", e, txt[:200])
st, txt = get("https://www.youtube.com/youtubei/v1/next?prettyPrint=false", json.dumps({"videoId": vid, "context": {"client": {"clientName": "WEB", "clientVersion": "2.20250101.00.00", "hl": "en"}}}).encode(), {"Content-Type": "application/json"})
print("next", st, len(txt), txt.count("attributedDescription"), re.findall(r'"attributedDescription":\{"content":"((?:[^"\\]|\\.){0,200})', txt)[:1])
