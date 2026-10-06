"""Checks each show plays: follows the link, reads codec and exact length with ffprobe."""
import json, subprocess, sys
shows = json.load(open(sys.argv[1]))
out = []
for s in shows:
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,codec_type,width,height",
                        "-of", "json", s["url"]], capture_output=True, text=True, timeout=180)
    try:
        j = json.loads(r.stdout)
        v = next(x for x in j["streams"] if x["codec_type"] == "video")
        s.update(secs=int(float(j["format"]["duration"])), codec=v["codec_name"], size=f'{v.get("width")}x{v.get("height")}',
                 audio=any(x["codec_type"] == "audio" for x in j["streams"]), ok=True)
    except Exception:
        s.update(ok=False, err=r.stderr[-300:])
    print(json.dumps(s), flush=True)
