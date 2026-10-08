"""One-off: how many full Punjabi films official channels have, with deeper searches."""
import os, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dramas as bd  # noqa: E402
import library_check as lc  # noqa: E402
import playable  # noqa: E402

CHANNELS = [
    ("Shemaroo Punjabi", ["@ShemarooPunjabi"], "Shemaroo Punjabi"),
    ("Lokdhun Punjabi", [], "Lokdhun Punjabi|Lokdhun"),
    ("Rhythm Boyz", ["@RhythmBoyz"], "Rhythm Boyz"),
    ("Ultra Punjabi", ["@UltraPunjabi"], "Ultra Punjabi"),
    ("White Hill Studios", ["@WhiteHillStudios"], "White Hill"),
    ("Saga Music", ["@SagaMusic", "@SagaHits"], "Saga"),
    ("Speed Records", ["@SpeedRecords"], "Speed Records"),
    ("Pitaara TV", ["@PitaaraTV", "@pitaara"], "Pitaara"),
    ("Ishtar Punjabi", ["@IshtarPunjabi"], "Ishtar Punjabi"),
    ("T-Series Apna Punjab", ["@TSeriesApnaPunjab"], "T-Series Apna Punjab"),
    ("Geet MP3", ["@GeetMP3"], "Geet MP3"),
    ("Humble Motion Pictures", ["@HumbleMotionPictures"], "Humble Motion Pictures|Humble Music"),
    ("Jass Records", ["@JassRecords"], "Jass Records"),
    ("Batra Showbiz", ["@BatraShowbiz"], "Batra Showbiz"),
    ("Zee Punjabi", ["@ZeePunjabi"], "Zee Punjabi"),
    ("Goyal Music", ["@GoyalMusic", "@GoyalMusicOfficial"], "Goyal Music"),
    ("Tips Punjabi", ["@TipsPunjabi"], "Tips Punjabi"),
    ("Eros Now Punjabi", ["@ErosNowPunjabi"], "Eros Now Punjabi"),
    ("Sagahits Movies", ["@SagaHitsMovies"], "Saga Hits Movies|Saga Movies"),
    ("Punjabi Movies Shemaroo", ["@ShemarooPunjabiMovies"], "Shemaroo Punjabi Movies"),
]
QUERIES = ["full movie", "punjabi movie", "full punjabi movie", "new punjabi movie", "punjabi film",
           "comedy movie", "movie 2025", "movie 2024", "movie 2023", "movie 2022", "old punjabi movie", "superhit punjabi movie"]


def main():
    out = ["# Punjabi films", ""]
    for name, handles, owner in CHANNELS:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            out.append(f"## {name}: NOT FOUND\n")
            continue
        seen, videos = set(), []
        first = 0
        urls = [f"https://www.youtube.com/channel/{cid}/videos"] + [
            f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q}) for q in QUERIES]
        for i, url in enumerate(urls):
            try:
                for v in bd.videos_page(url):
                    if v[0] not in seen:
                        seen.add(v[0]); videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"{name}: failed {e}", file=sys.stderr)
            if i == 1:
                first = len([v for v in videos if (v[2] or 0) >= 70 and not bd.FILM_SKIP.search(v[1])])
        full = [v for v in videos if (v[2] or 0) >= 70 and not bd.FILM_SKIP.search(v[1])]
        sample = full[:6]
        ok = [playable.plays(v[0]) for v in sample]
        still = [lc.look(v[0])[1].get("still") for v in sample]
        out.append(f"## {name} ({handle} {cid}): {len(videos)} read, full films {len(full)} (videos+full movie search only: {first}), "
                   f"embed {sum(ok)}/{len(sample)}, still {sum(1 for s in still if s)}")
        for v, p in zip(sample[:3], ok):
            out.append(f"- {v[1][:100]} ({round(v[2])} min){'' if p else ' [NO EMBED]'}")
        out.append("")
    text = "\n".join(out)
    print(text)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write(text)


if __name__ == "__main__":
    main()
