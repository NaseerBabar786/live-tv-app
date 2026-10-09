"""Daily archive of the full news report for the owner's review (owner, 2026-10-08): one report a day in the
app's Library under the channel's name, the newest 30 kept, the oldest dropped by themselves.

    python3 tools/news/archive.py news-full.mp4 news-full.json
      -> uploads it to the news-archive release as news-full-YYYY-MM-DD.mp4 (the report's day, Toronto time),
         deletes reports older than the newest KEEP, and rewrites docs/NewsArchive.m3u (the Library reads it).
Needs GH_TOKEN and GITHUB_REPOSITORY (gh CLI).
"""
import datetime as dt, json, os, re, subprocess, sys

KEEP = 30
TAG = "news-archive"
CHANNEL = "Spark TV One"
HERE = os.path.dirname(os.path.abspath(__file__))
M3U = os.path.join(HERE, "..", "..", "docs", "NewsArchive.m3u")
LOGO = "https://tv.bulkbazaar.ca/channel/logos/spark-news-poster.png"  # 2:3 poster, tools/make_library_folders.py
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]


def gh(*args, check=True):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=check).stdout


def main():
    mp4, info = sys.argv[1], json.load(open(sys.argv[2]))
    repo = os.environ["GITHUB_REPOSITORY"]
    day = dt.datetime.fromisoformat(info["slot"]).date().isoformat()   # the slot is in Toronto time
    name = f"news-full-{day}.mp4"
    if subprocess.run(["gh", "release", "view", TAG, "-R", repo], capture_output=True).returncode:
        gh("release", "create", TAG, "--prerelease", "-t", "News archive",
           "-n", f"The full news report of each day, the newest {KEEP} kept, for the owner's review.", "-R", repo)
    os.link(mp4, name) if not os.path.exists(name) else None
    gh("release", "upload", TAG, name, "-R", repo, "--clobber")
    assets = json.loads(gh("api", f"repos/{repo}/releases/tags/{TAG}"))["assets"]
    reports = sorted((a for a in assets if re.fullmatch(r"news-full-\d{4}-\d{2}-\d{2}\.mp4", a["name"])),
                     key=lambda a: a["name"], reverse=True)
    for old in reports[KEEP:]:
        gh("api", "-X", "DELETE", f"repos/{repo}/releases/assets/{old['id']}")
        print("dropped", old["name"])
    lines = ["#EXTM3U", f"# {CHANNEL}: the full news report of each day, newest first (the newest {KEEP}; tools/news/archive.py)."]
    for a in reports[:KEEP]:
        d = dt.date.fromisoformat(a["name"][10:20])
        title = f"{CHANNEL} News · {d.day} {MONTHS[d.month - 1]} {d.year}"
        lines.append(f'#EXTINF:-1 mins="10" added="{d.isoformat()}" desc="The full Urdu news report of the day on {CHANNEL}." '
                     f'tvg-logo="{LOGO}" tvg-language="Urdu" tvg-genre="Shows" group-title="{CHANNEL}",{title}')
        lines.append(f"https://github.com/{repo}/releases/download/{TAG}/{a['name']}")
    open(M3U, "w").write("\n".join(lines) + "\n")
    print("archived", name, f"({min(len(reports), KEEP)} kept)")


if __name__ == "__main__":
    main()
