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
# Each list's language and Library type (owner, 2026-10-11: "organise it the same way as the other Library",
# by language, then Movies, Series, Shows or Kids). Lists not named here are English shows.
LISTS = {
    "english": ("en", "Movies"), "hindi": ("hi", "Movies"), "filmein": ("hi", "Movies"), "moviespa": ("pa", "Movies"),
    "moviesur": ("ur", "Movies"), "latest": (None, "Movies"), "trailers": ("en", "Shows"),
    "dramas": ("ur", "Series"), "hindidramas": ("hi", "Series"), "comedyur": ("ur", "Series"), "comedy": ("hi", "Series"),
    "comedypa": ("pa", "Shows"), "cookingur": ("ur", "Shows"), "cooking": ("hi", "Shows"), "musicur": ("ur", "Shows"),
    "shayari": ("ur", "Shows"), "sufi": ("ur", "Shows"), "kavi": ("hi", "Shows"), "sur": ("pa", "Shows"),
    "gurbani": ("pa", "Shows"), "autohi": ("hi", "Shows"), "sportshi": ("hi", "Shows"), "teenshi": ("hi", "Shows"),
    "kids": ("en", "Kids"), "kidshi": ("hi", "Kids"), "kidsur": ("ur", "Kids"),
}
PLAY = {"pclassics": ("en", "Movies"), "purdu": ("ur", "Movies"), "phindi": ("hi", "Movies"),
        "pshayari": ("ur", "Shows"), "pnews": ("ur", "Shows"), "pone": ("ur", "Shows")}


def attr(text):
    return re.sub(r'["\n\r]', "'", str(text)).strip()


def main():
    results = json.load(open(os.path.join(CH, "logo-check.json"), encoding="utf-8"))["videos"]
    lists = []
    for path in sorted(glob.glob(os.path.join(CH, "yt-*.json"))):
        data = json.load(open(path, encoding="utf-8"))
        lists.append((os.path.basename(path)[3:-5], data.get("videos", [])))
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
    for cid, vids in lists:
        lang, kind = LISTS.get(cid, ("en", "Shows"))
        for v in vids:
            if v["id"] in done or v["label"] in branded or results.get(v["id"], {}).get("logo") is not False:
                continue
            done.add(v["id"])
            mins = f' mins="{round(v["mins"])}"' if v.get("mins") else ""
            code = v.get("lang") or lang or "en"
            language = LANG.get(code, code if code in LANG.values() else "English")
            # A series or show without episode numbers goes in a folder of its uploader's name.
            lines.append(f'#EXTINF:-1{mins} added="{v.get("found", "")}" tvg-logo="https://i.ytimg.com/vi/{v["id"]}/hqdefault.jpg" '
                         f'tvg-language="{language}" tvg-genre="{kind}" group-title="{attr(v["label"])}",{attr(v["title"])}')
            lines.append(f"https://www.youtube.com/watch?v={v['id']}")
            counts[(language, kind)] = counts.get((language, kind), 0) + 1
    # Films first, so a dubbed film that Spark One also plays is filed as a film.
    order = lambda path: (PLAY.get(os.path.basename(path)[:-5], ("", "Shows"))[1] != "Movies", path)  # noqa: E731
    for path in sorted(glob.glob(os.path.join(CH, "play", "*.json")), key=order):
        data = json.load(open(path, encoding="utf-8"))
        group = data.get("name", "Spark")
        lang, kind = PLAY.get(os.path.basename(path)[:-5], ("en", "Shows"))
        language = LANG[lang]
        for v in data.get("videos", []):
            if v.get("kind") != "programme" or v["url"] in done:
                continue
            done.add(v["url"])
            mins = f' mins="{round(v["secs"] / 60)}"' if v.get("secs") else ""
            lines.append(f'#EXTINF:-1{mins} tvg-language="{language}" tvg-genre="{kind}" '
                         f'group-title="{attr(group)}",{attr(v["title"])}')
            lines.append(v["url"])
            counts[(language, kind)] = counts.get((language, kind), 0) + 1
    with open(OUT, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    print(f"Wrote {os.path.relpath(OUT, ROOT)}: {sum(counts.values())} programmes")
    for (language, kind), n in sorted(counts.items()):
        print(f"  {language} {kind}: {n}")


if __name__ == "__main__":
    main()
