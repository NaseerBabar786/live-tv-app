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
    # Urdu (2026-10-10 daily search)
    ("Urdu", "TRT Ertugrul Urdu", ["@TRTErtugrulbyPTV", "@TRTErtugrulUrdu"], "TRT Ertugrul|Ertugrul", "show", 30, ["episode", "urdu"]),
    ("Urdu", "Kurulus Osman Urdu", ["@KurulusOsmanUrdu", "@kurulusosmanurduofficial"], "Kurulus Osman", "show", 30, ["episode", "urdu"]),
    ("Urdu", "PTV classic dramas", ["@PTVDramaClassics", "@ptvclassics"], "PTV", "show", 30, ["episode", "drama"]),
    ("Urdu", "Play Entertainment", ["@PlayEntertainmentPK", "@PlayEntertainment"], "Play Entertainment", "show", 30, ["episode"]),
    # Hindi
    ("Hindi", "Sagar World (Ramayan, Shri Krishna)", ["@SagarWorld", "@TilakOfficial", "@RamanandSagarOfficial"], "Sagar|Tilak", "show", 30, ["episode", "full episode"]),
    ("Hindi", "TVF", ["@TheViralFever", "@TVF"], "TVF|The Viral Fever", "show", 20, ["full episode", "episode"]),
    ("Hindi", "Dice Media", ["@DiceMediaIndia", "@DiceMedia"], "Dice Media", "show", 20, ["episode"]),
    ("Hindi", "ZEE5 free movies", ["@ZEE5", "@zee5premium"], "ZEE5", "film", 70, ["full movie"]),
    ("Hindi", "Zee Cinema", ["@ZeeCinema"], "Zee Cinema", "film", 70, ["full movie"]),
    # Punjabi
    ("Punjabi", "Omjee Group", ["@OmjeeGroup", "@omjeecinema"], "Omjee", "film", 70, ["full movie"]),
    ("Punjabi", "Vehli Janta Films", ["@VehliJantaFilms"], "Vehli Janta", "film", 60, ["full movie"]),
    ("Punjabi", "Chaupal (full films)", ["@ChaupalTV", "@chaupal"], "Chaupal", "film", 70, ["full movie"]),
    # English
    ("English", "Curious George", ["@CuriousGeorge", "@curiousgeorgeofficial"], "Curious George", "kids", 20, ["full episode", "compilation"]),
    ("English", "Zig and Sharko", ["@ZigandSharko", "@ZigAndSharkoOfficial"], "Zig & Sharko|Zig and Sharko", "kids", 20, ["compilation", "full episode"]),
    ("English", "Shaun the Sheep", ["@shaunthesheep", "@ShaunTheSheepOfficial"], "Shaun the Sheep", "kids", 20, ["full episode", "compilation"]),
    ("English", "Wild Kratts", ["@WildKratts", "@wildkrattsofficial"], "Wild Kratts", "kids", 20, ["full episode"]),
    ("English", "WB Kids (Tom and Jerry, Looney Tunes)", ["@WBKids"], "WB Kids", "kids", 20, ["full episode", "compilation"]),
    ("English", "Great Big Story / docs: Free Documentary History", ["@FreeDocumentaryHistory"], "Free Documentary - History|Free Documentary History", "show", 40, ["documentary"]),
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
