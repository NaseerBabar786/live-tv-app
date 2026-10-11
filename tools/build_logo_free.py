#!/usr/bin/env python3
"""
Writes docs/LogoFree.m3u: every programme we have that carries no other channel's logo, for the owner's
"Logo-free" folder in the Library (owner, 2026-10-11: "separate them in the library so I can see what kind
of content is available"; only on his TV, see Vod.Folder.LOGO_FREE).

  * YouTube videos on our channel lists that tools/logo_check.py found clean, grouped by channel. An
    uploader that stamps its logo on a fifth or more of its checked videos counts as stamping all of them,
    the same rule as build_youtube_channels.keep_clean;
  * our own and public-domain programmes on the Google Play channels (docs/channel/play/*.json): archive.org
    films, our AI-dubbed films, shayari, music, never ads or idents.

Run after the channel lists and the pre-air check, so only videos that passed it are listed.
Run: python3 tools/build_logo_free.py
"""
import glob
import json
import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CH = os.path.join(ROOT, "docs", "channel")
OUT = os.path.join(ROOT, "docs", "LogoFree.m3u")
LANG = {"ur": "Urdu", "hi": "Hindi", "pa": "Punjabi", "en": "English"}


def attr(text):
    return re.sub(r'["\n\r]', "'", str(text)).strip()


def language(name, v):
    if v.get("lang") in LANG:
        return LANG[v["lang"]]
    for word in ("Urdu", "Hindi", "Punjabi", "English"):
        if word.lower() in name.lower():
            return word
    return "English"


def main():
    results = json.load(open(os.path.join(CH, "logo-check.json"), encoding="utf-8"))["videos"]
    lists = []
    for path in sorted(glob.glob(os.path.join(CH, "yt-*.json"))):
        data = json.load(open(path, encoding="utf-8"))
        lists.append((data.get("name", os.path.basename(path)), data.get("videos", [])))
    seen, stamped = {}, {}
    for _, vids in lists:
        for v in vids:
            r = results.get(v["id"])
            if r:
                seen[v["label"]] = seen.get(v["label"], 0) + 1
                stamped[v["label"]] = stamped.get(v["label"], 0) + bool(r["logo"])
    branded = {label for label, n in seen.items() if n >= 3 and stamped[label] / n >= 0.2}

    lines = ["#EXTM3U", "# Programmes with no other channel's logo (tools/build_logo_free.py), for the owner's Library folder."]
    done, counts = set(), {}
    for name, vids in lists:
        group = re.sub(r"\s*\(\w+\)$", "", name)
        for v in vids:
            if v["id"] in done or v["label"] in branded or results.get(v["id"], {}).get("logo") is not False:
                continue
            done.add(v["id"])
            mins = f' mins="{round(v["mins"])}"' if v.get("mins") else ""
            lines.append(f'#EXTINF:-1{mins} added="{v.get("found", "")}" tvg-logo="https://i.ytimg.com/vi/{v["id"]}/hqdefault.jpg" '
                         f'tvg-language="{language(name, v)}" tvg-genre="Movies" desc="{attr(v["label"])}" '
                         f'group-title="{attr(group)}",{attr(v["title"])}')
            lines.append(f"https://www.youtube.com/watch?v={v['id']}")
            counts[group] = counts.get(group, 0) + 1
    for path in sorted(glob.glob(os.path.join(CH, "play", "*.json"))):
        data = json.load(open(path, encoding="utf-8"))
        group = data.get("name", "Spark")
        for v in data.get("videos", []):
            if v.get("kind") != "programme" or v["url"] in done:
                continue
            done.add(v["url"])
            mins = f' mins="{round(v["secs"] / 60)}"' if v.get("secs") else ""
            lines.append(f'#EXTINF:-1{mins} tvg-language="{language(group, v)}" tvg-genre="Movies" '
                         f'group-title="{attr(group)}",{attr(v["title"])}')
            lines.append(v["url"])
            counts[group] = counts.get(group, 0) + 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {sum(counts.values())} programmes")
    for group, n in sorted(counts.items(), key=lambda x: -x[1]):
        print(f"  {group}: {n}")


if __name__ == "__main__":
    main()
