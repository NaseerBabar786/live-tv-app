"""One-off: Indian TV comedy shows posted in full on their channels' official YouTube accounts."""
import os, re, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dramas as bd  # noqa: E402
import library_check as lc  # noqa: E402
import playable  # noqa: E402

# (channel handles, channel name, shows to look for)
CHANNELS = [
    (["@SETIndia"], "SET India|Sony Entertainment Television", ["The Kapil Sharma Show", "Comedy Circus", "India's Laughter Champion", "Madness Machayenge", "Indian Game Show"]),
    (["@SonyPal"], "Sony Pal", ["Comedy Circus", "Kapil Sharma"]),
    (["@SonySAB", "@sabtv"], "Sony SAB", ["F.I.R", "Chidiya Ghar", "Lapataganj", "Office Office", "Jijaji Chhat Per Hain", "May I Come In Madam", "Partners Trouble Ho Gayi Double", "Taarak Mehta"]),
    (["@ColorsTV"], "Colors TV", ["Comedy Nights Bachao", "Comedy Nights with Kapil", "Entertainment Ki Raat", "Khatra Khatra", "Laughter Chefs", "Comedy Nights Live"]),
    (["@andtvchannel"], "&TV|And TV", ["Comedy Dangal", "Bhabi Ji Ghar Par Hai", "Happu Ki Ultan Paltan", "Jijaji Chhat Parr Koii Hai", "Gharwali Pedwali"]),
    (["@StarPlus"], "StarPlus|Star Plus", ["Comedy Classes", "Sarabhai", "Khichdi", "Laughter Challenge"]),
    (["@HatsOffProductions", "@hatsoffproductions"], "Hats Off Productions", ["Sarabhai vs Sarabhai", "Khichdi", "Baa Bahoo Aur Baby", "Instant Khichdi"]),
    (["@zeetv"], "Zee TV", ["Hum Paanch", "Comedy", "Jeannie Aur Juju"]),
    (["@DoordarshanNational"], "Doordarshan National", ["Flop Show", "Ulta Pulta", "Dekh Bhai Dekh", "Shrimaan Shrimati", "Yeh Jo Hai Zindagi"]),
    (["@PrasarBharatiArchives"], "Prasar Bharati Archives", ["Ulta Pulta", "Yeh Jo Hai Zindagi", "Flop Show", "Nukkad"]),
    (["@DangalTVChannel"], "Dangal TV", ["Comedy", "Hamari Bhabhi"]),
    (["@StarBharat"], "Star Bharat", ["Gangs of Filmistan", "Comedy"]),
    (["@TheKapilSharmaShow"], "The Kapil Sharma Show", ["Kapil"]),
    (["@ShemarooComedy"], "Shemaroo Comedy", ["comedy show", "full episode"]),
]


def main():
    out = ["# Comedy shows", ""]
    for handles, owner, shows in CHANNELS:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            out.append(f"## {owner}: channel NOT FOUND\n")
            continue
        out.append(f"## {owner} ({handle} {cid})")
        for show in shows:
            seen, videos = set(), []
            for q in (f"{show} full episode", f"{show} episode", show):
                url = f"https://www.youtube.com/channel/{cid}/search?" + urllib.parse.urlencode({"query": q})
                try:
                    for v in bd.videos_page(url, with_age=True):
                        if v[0] not in seen:
                            seen.add(v[0]); videos.append(v)
                except Exception as e:  # noqa: BLE001
                    print(f"{show}: failed {e}", file=sys.stderr)
            key = re.sub(r"[^a-z]", "", show.lower())[:10]
            hits = [v for v in videos if key in re.sub(r"[^a-z]", "", v[1].lower())]
            full = [v for v in hits if (v[2] or 0) >= 15 and not bd.SKIP.search(v[1])]
            sample = full[:4]
            ok = [playable.plays(v[0]) for v in sample]
            still = [lc.look(v[0])[1].get("still") for v in sample]
            out.append(f"- **{show}**: {len(hits)} match, {len(full)} full >=15 min, embed {sum(ok)}/{len(sample)}, still {sum(1 for s in still if s)}")
            for v, p in zip(sample[:3], ok):
                out.append(f"    - {v[1][:110]} ({round(v[2])} min){'' if p else ' [NO EMBED]'}")
        out.append("")
    text = "\n".join(out)
    print(text)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write(text)


if __name__ == "__main__":
    main()
