"""One-off: checks candidate official free sources for the Library in Urdu, Hindi, Punjabi and English
(owner name, full-length videos, embeddable, not a still picture). Prints a sample per channel.
Not used by any build."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dramas as bd  # noqa: E402
import library_check as lc  # noqa: E402
import playable  # noqa: E402

# (language, name, handles, owner name(s), kind, shortest minutes, searches)
CANDIDATES = [
    # Urdu (2026-10-09 daily search)
    ("Urdu", "Har Pal Geo", ["@HarPalGeo", "@harpalgeoofficial"], "Har Pal Geo", "show", 30, ["episode", "full episode"]),
    ("Urdu", "Express Entertainment", ["@ExpressEntertainmentPK", "@ExpressEntertainment"], "Express Entertainment", "show", 30, ["episode"]),
    ("Urdu", "LTN Family", ["@LTNFamilyOfficial", "@LTNFamily"], "LTN Family", "show", 30, ["episode"]),
    ("Urdu", "Hum Network telefilms", ["@HUMTV"], "HUM TV|Hum TV", "film", 60, ["telefilm", "full telefilm"]),
    ("Urdu", "Pakistani classic films (Geo Films / Lollywood)", ["@LollywoodClassics"], "Lollywood Classics", "film", 70, ["full movie"]),
    # Hindi
    ("Hindi", "NFDC India", ["@NFDCIndia", "@NFDC"], "NFDC|National Film Development", "film", 60, ["full movie", "full film"]),
    ("Hindi", "Children's Film Society India", ["@CFSIIndia", "@childrensfilmsocietyindia"], "Children's Film Society|CFSI", "film", 45, ["full movie", "full film"]),
    ("Hindi", "Goldmines Bollywood", ["@GoldminesBollywood"], "Goldmines Bollywood", "film", 70, ["full movie"]),
    ("Hindi", "Wamindia Movies", ["@WamindiaMovies", "@Wamindia"], "Wamindia", "film", 70, ["full movie"]),
    ("Hindi", "Shemaroo Kids", ["@ShemarooKids"], "Shemaroo Kids", "kids", 10, ["full episode", "cartoon"]),
    ("Hindi", "Zee Classic / Zee Music Classic films", ["@ZeeClassic"], "Zee Classic", "film", 70, ["full movie"]),
    # Punjabi
    ("Punjabi", "Jaswinder Bhalla films (Speed Punjabi)", ["@SpeedPunjabi"], "Speed Punjabi", "film", 70, ["full movie"]),
    ("Punjabi", "White Hill Dhaakad", ["@WhiteHillDhaakad"], "White Hill Dhaakad", "film", 70, ["full movie"]),
    # English
    ("English", "Real Stories", ["@RealStories"], "Real Stories", "show", 40, ["documentary", "full documentary"]),
    ("English", "Timeline World History", ["@TimelineChannel", "@timelineworldhistorydocumentaries"], "Timeline", "show", 40, ["documentary"]),
    ("English", "Wonder", ["@WONDERchannel", "@WonderChannel"], "Wonder", "show", 40, ["documentary"]),
    ("English", "Timeless Classic Movies", ["@TimelessClassicMovies"], "Timeless Classic Movies", "film", 60, ["full movie"]),
    ("English", "Grjngo Western Movies", ["@GrjngoWesternMovies", "@Grjngo"], "Grjngo", "film", 60, ["full movie", "western"]),
    ("English", "Moviedome", ["@Moviedome"], "Moviedome", "film", 70, ["full movie"]),
    ("English", "LEGO full episodes", ["@LEGO"], "LEGO", "kids", 15, ["full episode"]),
    ("English", "Little Baby Bum Kids TV", ["@LittleBabyBum"], "Little Baby Bum", "kids", 20, ["compilation"]),
]


def main():
    out = ["# More Library sources", ""]
    for lang, name, handles, owner, kind, least, searches in CANDIDATES:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            out.append(f"## [{lang}] {name}: NOT FOUND\n")
            continue
        videos, seen = [], set()
        urls = [f"https://www.youtube.com/channel/{cid}/videos"] + [
            f"https://www.youtube.com/channel/{cid}/search?query={s.replace(' ', '+')}" for s in searches]
        for url in urls:
            try:
                for v in bd.videos_page(url, with_age=True):
                    if v[0] not in seen:
                        seen.add(v[0])
                        videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"{name}: {url} failed {e}", file=sys.stderr)
        skip = bd.FILM_SKIP if kind == "film" else bd.SKIP
        full = [v for v in videos if (v[2] or 0) >= least and not skip.search(v[1])]
        sample = full[:8]
        ok = [playable.plays(v[0]) for v in sample]
        still = [lc.look(v[0])[1].get("still") for v in sample]
        out.append(f"## [{lang}] {name} ({handle} {cid}): {len(videos)} read, {len(full)} full (>= {least} min), "
                   f"embeddable {sum(ok)}/{len(sample)}, still pictures {sum(1 for s in still if s)}/{len(sample)}")
        for v, p, s in zip(sample, ok, still):
            age = f"{v[3]} d" if len(v) > 3 and v[3] is not None else "?"
            flags = ("" if p else " [NOT EMBEDDABLE]") + (" [STILL]" if s else "")
            out.append(f"- {v[1]} ({round(v[2])} min, up {age}){flags} https://youtu.be/{v[0]}")
        out.append("")
        print(out[-len(sample) - 2], flush=True)
    text = "\n".join(out)
    print(text)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write(text)


if __name__ == "__main__":
    main()
