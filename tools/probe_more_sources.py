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
    # Urdu
    ("Urdu", "Hum Sitaray", ["@HumSitarayOfficial", "@HumSitaray"], "Hum Sitaray", "show", 30, ["episode"]),
    ("Urdu", "BOL Entertainment", ["@BOLEntertainment", "@BOLEntertainmentOfficial"], "BOL Entertainment", "show", 30, ["episode"]),
    ("Urdu", "Aaj Entertainment", ["@AajEntertainment", "@AajEntertainmentOfficial"], "Aaj Entertainment", "show", 30, ["episode"]),
    ("Urdu", "SEE TV", ["@SeeTVPakistan", "@SeeTV"], "SEE TV", "show", 30, ["episode"]),
    ("Urdu", "TV One (already listed, 0 found)", ["@TVOnePakistan", "@TVOneDramas", "@tvonepk", "@TVOneOfficial"], "TV One", "show", 30, ["episode"]),
    ("Urdu", "ARY Films", ["@ARYFilms", "@ARYFilmsOfficial"], "ARY Films", "film", 70, ["full movie"]),
    ("Urdu", "HUM Films", ["@HumFilms", "@HumFilmsOfficial"], "HUM Films", "film", 70, ["full movie"]),
    ("Urdu", "Geo Films", ["@GeoFilms", "@GeoFilmsOfficial"], "Geo Films", "film", 70, ["full movie"]),
    ("Urdu", "Burka Avenger", ["@BurkaAvenger", "@BurkaAvengerOfficial"], "Burka Avenger", "kids", 10, ["episode"]),
    ("Urdu", "Jan Cartoon", ["@JanCartoon", "@JanCartoonOfficial"], "Jan Cartoon", "kids", 5, ["episode"]),
    ("Urdu", "Kids Land Urdu", ["@KidsLandUrdu", "@KidsLand"], "Kids Land", "kids", 10, ["cartoon"]),
    # Hindi
    ("Hindi", "Venus Movies", ["@VenusMovies", "@VenusMoviesOfficial"], "Venus Movies|Venus", "film", 70, ["full movie"]),
    ("Hindi", "NH Studioz", ["@NHStudioz", "@NHStudioz1"], "NH Studioz", "film", 70, ["full movie"]),
    ("Hindi", "Tips Films", ["@TipsFilms", "@TipsOfficial"], "Tips Films|Tips Official", "film", 70, ["full movie"]),
    ("Hindi", "Eros Now", ["@ErosNowMovies", "@ErosNow"], "Eros Now", "film", 70, ["full movie"]),
    ("Hindi", "B4U Movies", ["@B4UMovies", "@B4UMoviesOfficial"], "B4U Movies", "film", 70, ["full movie"]),
    ("Hindi", "Zee Studios", ["@ZeeStudios", "@ZeeStudiosOfficial"], "Zee Studios", "film", 70, ["full movie"]),
    ("Hindi", "SET India (CID, Crime Patrol)", ["@SETIndia"], "SET India|Sony Entertainment Television", "show", 30, ["CID full episode", "Crime Patrol full episode"]),
    ("Hindi", "Sony SAB", ["@sabtv", "@SonySAB"], "Sony SAB", "show", 20, ["full episode"]),
    ("Hindi", "Chhota Bheem (already listed, 0 found)", ["@chhotabheem", "@ChhotaBheemOfficial", "@GreenGoldTV"], "Chhota Bheem|Green Gold", "kids", 5, ["full episode"]),
    ("Hindi", "Motu Patlu", ["@MotuPatluOfficial", "@MotuPatlu"], "Motu Patlu", "kids", 5, ["full episode"]),
    ("Hindi", "Discovery Kids India", ["@DiscoveryKidsIndia"], "Discovery Kids India|Discovery Kids", "kids", 10, ["full episode"]),
    # Punjabi
    ("Punjabi", "Tips Punjabi", ["@TipsPunjabi"], "Tips Punjabi", "film", 70, ["full movie"]),
    ("Punjabi", "Shemaroo Punjabi", ["@ShemarooPunjabi"], "Shemaroo Punjabi", "film", 70, ["full movie"]),
    ("Punjabi", "PTC Punjabi", ["@PTCPunjabi", "@PTCPunjabiOfficial"], "PTC Punjabi", "film", 60, ["full movie", "box office"]),
    ("Punjabi", "Amar Audio", ["@AmarAudio"], "Amar Audio", "film", 70, ["full movie"]),
    ("Punjabi", "Lokdhun Punjabi", ["@LokdhunPunjabi"], "Lokdhun Punjabi|Lokdhun", "film", 70, ["full movie"]),
    ("Punjabi", "Rhythm Boyz", ["@RhythmBoyz", "@RhythmBoyzEntertainment"], "Rhythm Boyz", "film", 70, ["full movie"]),
    ("Punjabi", "Ultra Punjabi", ["@UltraPunjabi"], "Ultra Punjabi", "film", 70, ["full movie"]),
    # English
    ("English", "Free Documentary", ["@FreeDocumentary"], "Free Documentary", "show", 40, ["documentary"]),
    ("English", "Free Documentary Nature", ["@FreeDocumentaryNature"], "Free Documentary - Nature|Free Documentary Nature", "show", 40, ["documentary"]),
    ("English", "Our Planet (Netflix)", ["@OurPlanet", "@ourplanet"], "Our Planet", "show", 30, ["full episode"]),
    ("English", "BBC Earth", ["@bbcearth"], "BBC Earth", "show", 40, ["full episode"]),
    ("English", "Midnight Pulp", ["@MidnightPulp"], "Midnight Pulp", "film", 70, ["full movie"]),
    ("English", "FilmRise Family", ["@FilmRiseFamily"], "FilmRise Family", "film", 60, ["full movie"]),
    ("English", "Sesame Street", ["@SesameStreet"], "Sesame Street", "kids", 20, ["full episode"]),
    ("English", "Teletubbies", ["@teletubbies"], "Teletubbies", "kids", 10, ["full episode"]),
    ("English", "Blippi", ["@Blippi"], "Blippi", "kids", 10, ["full episode"]),
    ("English", "Super Wings", ["@SuperWings", "@SuperWingsOfficial"], "Super Wings", "kids", 10, ["full episode"]),
    ("English", "Blender Studio (CC open films)", ["@BlenderStudio", "@BlenderOfficial"], "Blender Studio|Blender", "film", 3, ["open movie"]),
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
