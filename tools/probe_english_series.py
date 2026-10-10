"""One-off: checks candidate official English series channels for the Library's English Series tab
(owner name, full-length episodes, embeddable, not a still picture). Not used by any build."""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dramas as bd  # noqa: E402
import library_check as lc  # noqa: E402
import playable  # noqa: E402

SE = re.compile(r"\b(?:S(?:eason)?\s*(\d{1,2})\s*[,:\-|]?\s*E(?:p(?:isode)?\.?)?\s*(\d{1,3}))\b|\b(?:Episode|Ep\.?)\s*(\d{1,4})\b", re.I)

# (name, handles, owner name(s), shortest minutes, searches)
CANDIDATES = [
    ("Midsomer Murders", ["@MidsomerMurders", "@midsomermurdersofficial"], "Midsomer Murders", 40, ["full episode", "season 20"]),
    ("Dhar Mann", ["@DharMann"], "Dhar Mann", 10, ["full episode"]),
    ("Corner Gas", ["@CornerGas", "@CornerGasOfficial", "@cornergasofficial"], "Corner Gas", 18, ["full episode", "season 1 episode"]),
    ("Little Mosque on the Prairie", ["@LittleMosqueOnThePrairie", "@littlemosque"], "Little Mosque", 18, ["full episode", "episode"]),
    ("Mr. D", ["@MrDTV", "@MrD"], "Mr. D|Mr D", 18, ["full episode"]),
    ("Neighbours", ["@Neighbours", "@neighbourstv"], "Neighbours", 18, ["full episode"]),
    ("Shortland Street", ["@ShortlandStreet", "@shortlandstreetofficial"], "Shortland Street", 18, ["full episode"]),
    ("Brokenwood Mysteries", ["@BrokenwoodMysteries", "@thebrokenwoodmysteries"], "Brokenwood", 40, ["full episode"]),
    ("Brat TV", ["@brat", "@BratTV"], "Brat", 8, ["episode 1", "full season"]),
    ("Heartland", ["@HeartlandTV", "@heartlandtvseries"], "Heartland", 35, ["full episode"]),
    ("Murdoch Mysteries", ["@MurdochMysteries", "@murdochmysteriesofficial"], "Murdoch Mysteries", 40, ["full episode"]),
    ("Doc Martin", ["@DocMartin", "@docmartinofficial"], "Doc Martin", 40, ["full episode"]),
    ("Republic of Doyle", ["@RepublicofDoyle"], "Republic of Doyle", 40, ["full episode"]),
    ("Kim's Convenience", ["@KimsConvenience"], "Kim's Convenience", 18, ["full episode"]),
    ("The Chosen", ["@TheChosenSeries", "@thechosen"], "The Chosen", 40, ["full episode", "season 1 episode"]),
    ("Studio C", ["@StudioC"], "Studio C", 18, ["full episode"]),
    ("Citizen Khan (BBC)", ["@BBC"], "BBC", 25, ["citizen khan full episode"]),
    ("Ackley Bridge (Channel 4)", ["@Channel4", "@channel4entertainment"], "Channel 4", 40, ["ackley bridge full episode"]),
    ("Banijay drama", ["@BanijayDrama", "@banijaydramauk"], "Banijay", 40, ["full episode"]),
    ("Fremantle drama", ["@FremantleDrama", "@fremantle"], "Fremantle", 40, ["full episode"]),
]


def main():
    out = ["# English series sources", ""]
    for name, handles, owner, least, searches in CANDIDATES:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            out.append(f"## {name}: NOT FOUND\n")
            print(out[-1], flush=True)
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
        full = [v for v in videos if (v[2] or 0) >= least and not bd.SKIP.search(v[1])]
        numbered = sum(1 for v in full if SE.search(v[1]))
        sample = full[:8]
        ok = [playable.plays(v[0]) for v in sample]
        still = [lc.look(v[0])[1].get("still") for v in sample]
        out.append(f"## {name} ({handle} {cid}): {len(videos)} read, {len(full)} full (>= {least} min), {numbered} numbered, "
                   f"embeddable {sum(ok)}/{len(sample)}, still {sum(1 for s in still if s)}/{len(sample)}")
        for v, p, s in zip(sample, ok, still):
            age = f"{v[3]} d" if len(v) > 3 and v[3] is not None else "?"
            flags = ("" if p else " [NOT EMBEDDABLE]") + (" [STILL]" if s else "")
            out.append(f"- {v[1]} ({round(v[2])} min, up {age}){flags} https://youtu.be/{v[0]}")
        out.append("")
        print("\n".join(out[-len(sample) - 2:]), flush=True)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write("\n".join(out))


if __name__ == "__main__":
    main()
