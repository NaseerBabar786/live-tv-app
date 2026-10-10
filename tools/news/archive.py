"""Archive of Spark TV One's news for the Library's Spark TV folder: the full report of each day (owner,
2026-10-08, the newest 30 kept) and every headlines bulletin (owner, 2026-10-10, kept 30 days), each its own row.

    python3 tools/news/archive.py news-full.mp4 news-full.json [full]
    python3 tools/news/archive.py news-headlines.mp4 news-headlines.json headlines
      -> uploads it to the news-archive release (news-full-YYYY-MM-DD.mp4 by the report's day, or
         news-headlines-YYYY-MM-DD-HH.mp4 by the bulletin's start hour, Toronto time), drops what is past
         keeping, and rewrites docs/NewsArchive.m3u (the Library reads it). A bulletin already archived is
         not uploaded again.
Needs GH_TOKEN and GITHUB_REPOSITORY (gh CLI).
"""
import datetime as dt, json, os, re, subprocess, sys

KEEP = 30            # full reports: the newest 30
HEADLINE_DAYS = 30   # headlines: the last 30 days
TAG = "news-archive"
CHANNEL = "Spark TV One"
HERE = os.path.dirname(os.path.abspath(__file__))
M3U = os.path.join(HERE, "..", "..", "docs", "NewsArchive.m3u")
LOGO = "https://tv.bulkbazaar.ca/channel/logos/spark-news-poster.png"  # 2:3 posters, tools/make_library_folders.py
HEADLINES_LOGO = "https://tv.bulkbazaar.ca/channel/logos/spark-headlines-poster.png"
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October",
          "November", "December"]
FULL = re.compile(r"news-full-(\d{4}-\d{2}-\d{2})\.mp4")
HEADLINES = re.compile(r"news-headlines-(\d{4}-\d{2}-\d{2})-(\d{2})\.mp4")


def gh(*args, check=True):
    return subprocess.run(["gh", *args], capture_output=True, text=True, check=check).stdout


def hour_label(h):
    return f"{h % 12 or 12} {'AM' if h < 12 else 'PM'}"


def day_label(d):
    return f"{d.day} {MONTHS[d.month - 1]} {d.year}"


def playlist(assets, repo):
    """The Library's list: full reports (group Spark TV One), then headlines (group Spark TV One Headlines), newest first."""
    full = sorted((a["name"] for a in assets if FULL.fullmatch(a["name"])), reverse=True)
    heads = sorted((a["name"] for a in assets if HEADLINES.fullmatch(a["name"])), reverse=True)
    lines = ["#EXTM3U", f"# {CHANNEL}: the full news report of each day (the newest {KEEP}) and every headlines bulletin "
             f"(the last {HEADLINE_DAYS} days), newest first (tools/news/archive.py)."]
    url = f"https://github.com/{repo}/releases/download/{TAG}/"
    for name in full:
        d = dt.date.fromisoformat(FULL.fullmatch(name).group(1))
        lines.append(f'#EXTINF:-1 mins="10" added="{d.isoformat()}" desc="The full Urdu news report of the day on {CHANNEL}." '
                     f'tvg-logo="{LOGO}" tvg-language="Urdu" tvg-genre="Shows" group-title="{CHANNEL}",'
                     f"{CHANNEL} News · {day_label(d)}")
        lines.append(url + name)
    for name in heads:
        m = HEADLINES.fullmatch(name); d = dt.date.fromisoformat(m.group(1)); h = int(m.group(2))
        lines.append(f'#EXTINF:-1 mins="3" added="{d.isoformat()}" desc="The Urdu news headlines on {CHANNEL}, {hour_label(h)}." '
                     f'tvg-logo="{HEADLINES_LOGO}" tvg-language="Urdu" tvg-genre="Shows" group-title="{CHANNEL} Headlines",'
                     f"{CHANNEL} Headlines · {day_label(d)}, {hour_label(h)}")
        lines.append(url + name)
    return "\n".join(lines) + "\n"


def main():
    mp4, info = sys.argv[1], json.load(open(sys.argv[2]))
    kind = sys.argv[3] if len(sys.argv) > 3 else "full"
    repo = os.environ["GITHUB_REPOSITORY"]
    slot = dt.datetime.fromisoformat(info["slot"])   # the slot is in Toronto time
    name = f"news-full-{slot.date().isoformat()}.mp4" if kind == "full" else \
        f"news-headlines-{slot.date().isoformat()}-{slot.hour:02d}.mp4"
    if subprocess.run(["gh", "release", "view", TAG, "-R", repo], capture_output=True).returncode:
        gh("release", "create", TAG, "--prerelease", "-t", "News archive",
           "-n", f"Spark TV One's news for the Library: the full report of each day and every headlines bulletin.", "-R", repo)
    assets = json.loads(gh("api", f"repos/{repo}/releases/tags/{TAG}"))["assets"]
    if kind == "full" or name not in {a["name"] for a in assets}:
        os.link(mp4, name) if not os.path.exists(name) else None
        gh("release", "upload", TAG, name, "-R", repo, "--clobber")
        assets = json.loads(gh("api", f"repos/{repo}/releases/tags/{TAG}"))["assets"]
        print("archived", name)
    else:
        print(name, "is already archived")
    full = sorted((a for a in assets if FULL.fullmatch(a["name"])), key=lambda a: a["name"], reverse=True)
    oldest = (slot.date() - dt.timedelta(days=HEADLINE_DAYS)).isoformat()
    gone = full[KEEP:] + [a for a in assets if (m := HEADLINES.fullmatch(a["name"])) and m.group(1) < oldest]
    for old in gone:
        gh("api", "-X", "DELETE", f"repos/{repo}/releases/assets/{old['id']}")
        print("dropped", old["name"])
    kept = [a for a in assets if a not in gone]
    open(M3U, "w").write(playlist(kept, repo))


if __name__ == "__main__":
    main()
