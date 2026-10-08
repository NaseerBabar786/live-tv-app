"""One-off: finds Pakistani morning shows posted in full on their channels' official YouTube accounts."""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dramas as bd  # noqa: E402
import library_check as lc  # noqa: E402
import playable  # noqa: E402

# (show, title words that mark it, channel handles, channel name)
SHOWS = [
    ("Good Morning Pakistan", "good morning pakistan", ["@ARYDigitalasia", "@ARYDigital"], "ARY Digital"),
    ("Jago Pakistan Jago", "jago pakistan jago", ["@HUMTV", "@humtvofficial"], "HUM TV"),
    ("Hum Subah", "subh|subah|morning", ["@HUMTV"], "HUM TV"),
    ("Har Pal Geo morning", "morning|subh|subah|salam", ["@HARPALGEO"], "HAR PAL GEO"),
    ("Geo Pakistan", "geo pakistan", ["@geonews", "@GeoNewsOfficial"], "Geo News"),
    ("Good Morning Zindagi", "good morning zindagi|morning", ["@APlusEntertainmentOfficial", "@APlusTVPakistan"], "A Plus Entertainment"),
    ("Express morning", "morning|subh|subah", ["@ExpressEntertainment", "@ExpressTVpk"], "Express TV"),
    ("PTV Home morning", "morning|subh|subah|salam pakistan", ["@PTVHomeOfficial", "@PTVHome"], "PTV Home"),
    ("Aaj Pakistan", "aaj pakistan", ["@AajEntertainment"], "Aaj Entertainment"),
    ("Naya Din (Samaa)", "naya din", ["@SAMAATV", "@SamaaTV"], "SAMAA TV"),
    ("Green morning", "morning|subh|subah", ["@GreenEntertainmentpk", "@GreenEntertainment"], "Green Entertainment"),
    ("TV One morning", "morning|salam zindagi|subh", ["@TVOnePakistanOfficial", "@tvonepk"], "TV One"),
    ("Bol morning", "morning|subh|subah", ["@BOLEntertainment"], "BOL Entertainment"),
    ("Masala Mornings", "masala mornings", ["@MasalaTVRecipes", "@MasalaTV"], "Masala TV"),
    ("ARY Zindagi morning", "morning|subh|subah", ["@ARYZindagiOfficial", "@ARYZindagi"], "ARY Zindagi"),
]
QUERIES = ["morning show", "good morning", "morning", "subh"]


def main():
    out = ["# Morning shows", ""]
    for show, words, handles, owner in SHOWS:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            out.append(f"## {show}: channel NOT FOUND\n")
            continue
        mark = re.compile(words, re.I)
        seen, videos = set(), []
        qs = [show.split(" (")[0]] + QUERIES
        urls = [f"https://www.youtube.com/channel/{cid}/videos"] + [
            f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q}) for q in qs]
        for url in urls:
            try:
                for v in bd.videos_page(url, with_age=True):
                    if v[0] not in seen:
                        seen.add(v[0]); videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"{show}: {url} failed {e}", file=sys.stderr)
        hits = [v for v in videos if mark.search(v[1])]
        full = [v for v in hits if (v[2] or 0) >= 30]
        ages = [v[3] for v in full if len(v) > 3 and v[3] is not None]
        sample = full[:6]
        ok = [playable.plays(v[0]) for v in sample]
        still = [lc.look(v[0])[1].get("still") for v in sample]
        out.append(f"## {show} ({handle} {cid}): {len(videos)} read, {len(hits)} match, {len(full)} full >=30 min, "
                   f"newest {min(ages) if ages else '?'} d, oldest {max(ages) if ages else '?'} d, embed {sum(ok)}/{len(sample)}, still {sum(1 for s in still if s)}")
        for v, p, s in zip(sample, ok, still):
            out.append(f"- {v[1]} ({round(v[2])} min, {v[3] if len(v) > 3 else '?'} d){'' if p else ' [NOT EMBEDDABLE]'}{' [STILL]' if s else ''}")
        for v in [v for v in hits if (v[2] or 0) < 30][:3]:
            out.append(f"  short: {v[1]} ({v[2] and round(v[2])} min)")
        out.append("")
    text = "\n".join(out)
    print(text)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write(text)


if __name__ == "__main__":
    main()
