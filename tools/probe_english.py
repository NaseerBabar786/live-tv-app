"""One-off: checks candidate official English YouTube channels (owner name, full-length videos, embeddable)
for the Library's new English section. Prints a sample per channel. Not used by any build."""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import build_dramas as bd  # noqa: E402
import playable  # noqa: E402

# (name, handles, owner name(s), kind, shortest minutes, searches)
CANDIDATES = [
    ("Popcornflix", ["@Popcornflix", "@PopcornflixMovies"], "Popcornflix", "film", 70, ["full movie"]),
    ("Movie Central", ["@MovieCentral", "@MovieCentralTV"], "Movie Central", "film", 70, ["full movie"]),
    ("Paramount Vault", ["@ParamountVault", "@ParamountMovies"], "Paramount Vault|Paramount Movies", "film", 70, ["full movie"]),
    ("Maverick Movies", ["@MaverickMovies", "@MaverickFullMovies"], "Maverick Movies", "film", 70, ["full movie"]),
    ("FilmRise Movies", ["@FilmRiseMovies", "@FilmRise"], "FilmRise", "film", 70, ["full movie"]),
    ("FilmRise Family", ["@FilmRiseFamily"], "FilmRise Family", "film", 60, ["full movie"]),
    ("Gravitas Movies", ["@GravitasMovies", "@GravitasVentures"], "Gravitas", "film", 70, ["full movie"]),
    ("Movie Central Family", ["@MovieCentralFamily"], "Movie Central Family", "film", 60, ["full movie"]),
    ("Grizzly Flix", ["@GrizzlyFlix"], "Grizzly", "film", 70, ["full movie"]),
    ("Hell's Kitchen", ["@HellsKitchen", "@HellsKitchenTV"], "Hell's Kitchen", "show", 30, ["full episode"]),
    ("Kitchen Nightmares", ["@KitchenNightmares"], "Kitchen Nightmares", "show", 30, ["full episode"]),
    ("Shark Tank Global", ["@SharkTankGlobal"], "Shark Tank Global", "show", 30, ["full episode"]),
    ("Dragons' Den", ["@DragonsDen", "@BBCDragonsDen"], "Dragons' Den|Dragons Den", "show", 30, ["full episode"]),
    ("MasterChef World", ["@MasterChefWorld"], "MasterChef World", "show", 30, ["full episode"]),
    ("Come Dine With Me", ["@ComeDineWithMe"], "Come Dine With Me", "show", 30, ["full episode"]),
    ("Bondi Rescue", ["@BondiRescue", "@BondiRescueOfficial"], "Bondi Rescue", "show", 20, ["full episode"]),
    ("Border Security", ["@BorderSecurityAmericasFrontLine", "@BorderSecurity"], "Border Security", "show", 20, ["full episode"]),
    ("Real Stories", ["@RealStories"], "Real Stories", "show", 30, ["documentary"]),
    ("Timeline", ["@TimelineWorldHistoryDocumentaries", "@Timeline"], "Timeline", "show", 30, ["documentary"]),
    ("Masha and the Bear", ["@MashaBearEN", "@MashaandTheBear"], "Masha and the Bear", "kids", 10, ["full episode"]),
    ("PAW Patrol", ["@PAWPatrol", "@PAWPatrolOfficial"], "PAW Patrol", "kids", 10, ["full episode"]),
    ("Oddbods", ["@Oddbods", "@OddbodsTV"], "Oddbods", "kids", 10, ["full episode"]),
    ("Shaun the Sheep", ["@shaunthesheep", "@ShaunTheSheepOfficial"], "Shaun the Sheep", "kids", 10, ["full episode"]),
    ("Thomas & Friends", ["@ThomasAndFriends", "@ThomasFriends"], "Thomas & Friends|Thomas and Friends", "kids", 10, ["full episode"]),
    ("Pokemon", ["@pokemon", "@PokemonKids"], "Pokémon|Pokemon", "kids", 15, ["full episode"]),
]


def main():
    out = ["# English candidates", ""]
    for name, handles, owner, kind, least, searches in CANDIDATES:
        handle, cid = bd.channel_id(handles, owner)
        if not cid:
            out.append(f"## {name}: NOT FOUND\n")
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
        full = [v for v in videos if (v[2] or 0) >= least and not bd.FILM_SKIP.search(v[1])]
        sample = full[:10]
        ok = [playable.plays(v[0]) for v in sample]
        out.append(f"## {name} ({handle} {cid}): {len(videos)} videos read, {len(full)} full-length (>= {least} min), "
                   f"embeddable {sum(ok)}/{len(sample)}")
        for v, p in zip(sample, ok):
            age = f"{v[3]} days ago" if len(v) > 3 and v[3] is not None else "?"
            out.append(f"- {v[1]} ({round(v[2])} min, up {age}){'' if p else ' [NOT EMBEDDABLE]'} https://youtu.be/{v[0]}")
        out.append("")
    text = "\n".join(out)
    print(text)
    with open(os.environ.get("GITHUB_STEP_SUMMARY", "/dev/null"), "a") as f:
        f.write(text)


if __name__ == "__main__":
    main()
