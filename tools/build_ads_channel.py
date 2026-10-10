#!/usr/bin/env python3
"""
Builds the sponsors' part of Spark Ads (channel 15, the owner's wish, 2026-10-07): a channel that
plays our NextGen Cable promos and our sponsors' ads round the clock.

Spark Ads' schedule (docs/channel/ads-schedule.json) holds list entries of kind "ads": our promos
(docs/media/app-promos.json, the same list as the app's pop-up) and the sponsors (this file's output,
docs/channel/ads-sponsors.json). The apps and the website (MyChannel.expand, schedule.js expand) put
the lists in their places, so the channel follows the promos and the sponsors without anyone saving it.

The sponsors come from the public copy tv.bulkbazaar.ca/sponsors saves on every change
(Firestore channel/ads-sponsors). Today's active sponsors (Toronto day) go in, in the owner's order:
- a sponsor video that keeps the ad length rule (5 to 60 seconds) plays as it is;
- otherwise the sponsor's picture becomes a 10-second video here (a slow zoom, so it moves),
  saved in docs/channel/ads/ under a name made from the picture, so a new picture gets a new file.
Until the owner's list has been saved once, no sponsor ads play.

Writes docs/channel/ads-sponsors.json and docs/channel/ads/*.mp4. Needs ffmpeg.
Run: python3 tools/build_ads_channel.py
"""
import base64
import datetime as dt
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "docs", "channel", "ads-sponsors.json")
MEDIA = os.path.join(ROOT, "docs", "channel", "ads")
SITE = "https://tv.bulkbazaar.ca/channel/"
DOC = ("https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/"
       "channel/ads-sponsors?key=AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE")
# Until the owner's sponsors list is published: no sponsor ads (no Bulk Bazaar ad for now, owner 2026-10-09);
# the channel plays our promos and the Spark TV ads.
DEFAULT = []
PICTURE_SECS = 10


def sponsors():
    """The published list, or None when there's none yet (or it can't be read)."""
    try:
        with urllib.request.urlopen(DOC, timeout=30) as r:
            data = json.load(r).get("fields", {}).get("data", {}).get("stringValue")
    except urllib.error.HTTPError as e:
        if e.code in (403, 404):
            return None
        raise
    return json.loads(data).get("sponsors", []) if data else None


def showing(s, today):
    return bool(s.get("active")) and (not s.get("start") or s["start"] <= today) and (not s.get("end") or s["end"] >= today)


def picture_video(data_url):
    """A 10-second 1280x720 video of the sponsor's picture, slowly zooming in; its file name (made once per picture)."""
    raw = base64.b64decode(data_url.split(",", 1)[1])
    name = "sp-" + hashlib.sha1(raw).hexdigest()[:12] + ".mp4"
    path = os.path.join(MEDIA, name)
    if os.path.exists(path):
        return name
    os.makedirs(MEDIA, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        pic = os.path.join(tmp, "pic.jpg")
        with open(pic, "wb") as f:
            f.write(raw)
        frames = PICTURE_SECS * 25
        # The picture fitted on black at 16:9, then a gentle zoom to 103% over the 10 seconds.
        vf = ("scale=2560:1440:force_original_aspect_ratio=decrease,pad=2560:1440:(ow-iw)/2:(oh-ih)/2:color=black,"
              f"zoompan=z='1+0.03*on/{frames}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={frames}:s=1280x720:fps=25,"
              "format=yuv420p")
        subprocess.run([
            "ffmpeg", "-v", "error", "-y", "-loop", "1", "-i", pic,
            "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
            "-vf", vf, "-t", str(PICTURE_SECS), "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-c:a", "aac", "-b:a", "64k", "-shortest", "-movflags", "+faststart", path,
        ], check=True)
    return name


def main():
    today = dt.datetime.now(ZoneInfo("America/Toronto")).strftime("%Y-%m-%d")
    listed = sponsors()
    if listed is None:
        if os.path.exists(OUT):
            print("No published sponsors list yet; keeping the current one.")
            return
        ads = DEFAULT
    else:
        ads = []
        for s in listed:
            if not showing(s, today):
                continue
            name = (s.get("name") or "Sponsor").strip()
            video, secs = (s.get("video") or "").strip(), int(s.get("videoSecs") or 0)
            # The ad length rule: 5 to 60 seconds in steps of 5 (a video measured a little off still plays).
            if video.startswith("https://") and 5 <= secs <= 60:
                ads.append({"src": video, "title": name, "secs": secs})
            elif (s.get("image") or "").startswith("data:image"):
                ads.append({"src": SITE + "ads/" + picture_video(s["image"]), "title": name, "secs": PICTURE_SECS})
            else:
                print(f"::warning::{name}: no picture and no video of 5 to 60 seconds, left out.")
    # Pictures no sponsor uses any more.
    used = {a["src"].rsplit("/", 1)[-1] for a in ads}
    if os.path.isdir(MEDIA):
        for f in os.listdir(MEDIA):
            if f.endswith(".mp4") and f not in used:
                os.remove(os.path.join(MEDIA, f))
    out = {
        "note": "Spark Ads' sponsors (channel 15), built by tools/build_ads_channel.py from tv.bulkbazaar.ca/sponsors. Do not edit by hand.",
        "ads": ads,
    }
    with open(OUT, "w") as f:
        json.dump(out, f, indent=2, ensure_ascii=False)
        f.write("\n")
    print(f"{len(ads)} sponsor ads for {today}: " + ", ".join(a["title"] for a in ads))


if __name__ == "__main__":
    main()
