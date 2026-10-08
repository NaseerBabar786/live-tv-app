# Temporary: download chosen CC BY music from Wikimedia Commons (with retries) and convert to mp3.
import json, os, urllib.request, urllib.parse, time, subprocess, re
UA = {"User-Agent": "CableTV-ad-maker/1.0 (https://tv.bulkbazaar.ca; naseerahmadbabar@gmail.com)"}
T = ["DHOL BEAT.wav", "Infraction - Dance (Upbeat Creative Future Pop).ogg", "Infraction – A.I. (Cyberpunk Energetic).opus",
     "Rafael Krux - Inspiring Advertising - Upbeat Summer Corporate (cc-by) (filmmusic).mp3", "Justice And Fame by Rafael Krux.ogg",
     "Everybody Up by Sascha Ende.mp3", "Bright New Day by Sascha Ende.mp3", "New Start! - PIKASONIC-422729382.mp3",
     "Jesse Spillane - 03 - Dance Rocket.ogg", "Wepa (ISRC USUAN1700020).mp3", "Bumba Crossing (ISRC USUAN1500031).mp3",
     "Tech Live (ISRC USUAN1700030).mp3", "Upbeat Forever (ISRC USUAN1500063).mp3", "Fireball (Antti Luode).mp3", "Hustlin (Antti Luode).mp3",
     "Digital Mix Maestro - Time Altitudes (Uplifting Trance).opus", "Lame Drivers - 03 - Bhangra outro.ogg", "Shiny Tech (ISRC USUAN1100078).mp3",
     "Computer Music All-stars - Too Much Caffeine.ogg", "Infraction - Sax Beat (Funk Retro Upbeat).opus", "Funk O (Antti Luode).mp3", "Härdelli (Antti Luode).mp3"]
os.makedirs("out/m", exist_ok=True); meta = {}
for t in T:
    q = urllib.parse.urlencode(dict(action="query", format="json", titles="File:" + t, prop="imageinfo", iiprop="url|extmetadata"))
    for k in range(5):
        try:
            d = json.loads(urllib.request.urlopen(urllib.request.Request("https://commons.wikimedia.org/w/api.php?" + q, headers=UA), timeout=30).read())
            pg = list(d["query"]["pages"].values())[0]; ii = pg["imageinfo"][0]; url = ii["url"]; md = ii["extmetadata"]
            b = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120).read()
            if len(b) < 10000: raise Exception("small")
            name = re.sub(r"[^A-Za-z0-9]+", "_", t.rsplit(".", 1)[0])[:60]
            src = f"out/m/{name}.src"; open(src, "wb").write(b)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-ac", "2", "-ar", "44100", "-b:a", "192k", f"out/m/{name}.mp3"], check=True); os.remove(src)
            meta[name] = {"title": t, "url": url, "page": "https://commons.wikimedia.org/wiki/File:" + urllib.parse.quote(t.replace(" ", "_")),
                          "lic": md.get("LicenseShortName", {}).get("value"), "artist": re.sub("<[^>]+>", "", md.get("Artist", {}).get("value", ""))}
            print("ok", t); break
        except Exception as e:
            print("retry", t, e); time.sleep(5 * (k + 1))
    time.sleep(3)
json.dump(meta, open("out/m/meta.json", "w"), ensure_ascii=False, indent=1)
