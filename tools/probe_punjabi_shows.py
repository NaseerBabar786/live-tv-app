"""One-off: Punjabi TV series and comedy shows on official YouTube channels."""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dramas as bd  # noqa: E402
import library_check as lc  # noqa: E402
import playable  # noqa: E402

CHANNELS = [
    ("PTC Punjabi", ["@PTCPunjabi"], "PTC Punjabi", ["full episode", "episode", "serial", "comedy"]),
    ("Zee Punjabi", ["@ZeePunjabi", "@zeepunjabiofficial"], "Zee Punjabi", ["full episode", "episode"]),
    ("Pitaara TV", ["@PitaaraTV"], "Pitaara", ["episode", "comedy", "full episode"]),
    ("Gurchet Chitarkar", ["@GurchetChitarkar", "@gurchetchitarkarofficial"], "Gurchet Chitarkar", ["family", "episode", "comedy", "full"]),
    ("Jaswinder Bhalla", ["@JaswinderBhalla", "@jaswinderbhallaofficial"], "Jaswinder Bhalla", ["chhankata", "comedy", "full"]),
    ("Chhankata", ["@Chhankata"], "Chhankata", ["chhankata", "full"]),
    ("Speed Records", ["@SpeedRecords"], "Speed Records", ["comedy", "chhankata", "full comedy"]),
    ("Saga Music", ["@SagaMusic"], "Saga", ["comedy", "full comedy", "episode"]),
    ("Goyal Music", ["@GoyalMusic"], "Goyal Music", ["comedy", "full comedy"]),
    ("Chaupal", ["@ChaupalTV", "@chaupal"], "Chaupal", ["episode", "full episode"]),
    ("DD Punjabi", ["@DDPunjabi", "@ddpunjabiofficial"], "DD Punjabi", ["episode", "serial", "comedy"]),
    ("PTV Punjabi / PTV Home", ["@PTVHomeOfficial"], "PTV Home", ["punjabi", "punjabi drama"]),
    ("Apna Punjab TV", ["@ApnaPunjabTV"], "Apna Punjab", ["episode", "comedy"]),
    ("Desi Channel / Hum Punjabi", ["@HumPunjabi"], "Hum Punjabi", ["episode"]),
]
EP = re.compile(r"\b(episode|ep\.?\s*\d|part\s*\d|full comedy|comedy movie|full movie|full)\b", re.I)


def main():
    out = ["# Punjabi series / comedy", ""]
    for name, handles, owner, qs in CHANNELS:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            out.append(f"## {name}: NOT FOUND\n")
            continue
        seen, videos = set(), []
        urls = [f"https://www.youtube.com/channel/{cid}/videos"] + [
            f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q}) for q in qs]
        for url in urls:
            try:
                for v in bd.videos_page(url):
                    if v[0] not in seen:
                        seen.add(v[0]); videos.append(v)
            except Exception as e:  # noqa: BLE001
                print(f"{name}: failed {e}", file=sys.stderr)
        full = [v for v in videos if (v[2] or 0) >= 15 and not bd.SKIP.search(v[1]) and EP.search(v[1])]
        sample = full[:6]
        ok = [playable.plays(v[0]) for v in sample]
        still = [lc.look(v[0])[1].get("still") for v in sample]
        out.append(f"## {name} ({handle} {cid}): {len(videos)} read, {len(full)} long episode/comedy videos, "
                   f"embed {sum(ok)}/{len(sample)}, still {sum(1 for s in still if s)}")
        for v, p in zip(sample, ok):
            out.append(f"- {v[1][:110]} ({round(v[2])} min){'' if p else ' [NO EMBED]'}")
        out.append("")
    text = "\n".join(out)
    print(text)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write(text)


if __name__ == "__main__":
    main()
