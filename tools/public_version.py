"""NextGen Cable version names: clean public numbers, test builds named after the coming release.

The owner's rule (2026-10-08): at most one public release a day, and the numbers of the test builds
in between never show up in a released version. So CI, not the gradle file, names NextGen Cable:

  public version P = the newest released or held NextGen Cable version with its last number + 1
                     (never below FLOOR, the first clean number after the old per-change numbers)
  test build       = "P.N", N = this build's run number minus the build that P follows
                     (shown in the app as "P test N", see Updater.label)
  released build   = "P", rebuilt from the tested commit when the owner says yes (release-approved.yml)

  python3 tools/public_version.py test <run number> <newest tag or title> [<held title>]  -> prints P.N
  python3 tools/public_version.py apply <name>     rewrites NextGen Cable's versionName in app/build.gradle.kts
  python3 tools/public_version.py clean <name> [<newest tag>]   "1.11.0.5" -> "1.11.0"; a build from
        before this naming ("1.10.26") becomes the next number after the newest release ("1.10.23")

Tags look like "v1.10.22-build1101"; the held release's title "APPROVED build 1170 (NextGen Cable 1.11.0), ...".
"""
import re, sys

FLOOR = (1, 11, 0)
GRADLE = "app/build.gradle.kts"


def parse(text):
    """(version tuple, build number) from a release tag or title, or None."""
    v = re.search(r"(\d+)\.(\d+)\.(\d+)", text or "")
    b = re.search(r"build\s*(\d+)", text or "")
    if not v:
        return None
    return tuple(int(x) for x in v.groups()), int(b.group(1)) if b else 0


def test_name(run, *releases):
    found = [p for p in (parse(r) for r in releases) if p]
    base, build = max(found) if found else ((0, 0, 0), 0)
    public = (base[0], base[1], base[2] + 1)
    if public < FLOOR:
        public = FLOOR
    n = max(1, run - build)
    return "%d.%d.%d.%d" % (public + (n,))


def apply(name):
    with open(GRADLE) as f:
        text = f.read()
    # The first versionName is NextGen Cable's (livetv flavor); Max, Plus and Player keep theirs.
    text = re.sub(r'(versionName\s*=\s*")[^"]+(")', lambda m: m.group(1) + name + m.group(2), text, count=1)
    with open(GRADLE, "w") as f:
        f.write(text)


def main():
    mode = sys.argv[1]
    if mode == "test":
        print(test_name(int(sys.argv[2]), *sys.argv[3:]))
    elif mode == "apply":
        apply(sys.argv[2])
        print(GRADLE, "NextGen Cable versionName =", sys.argv[2])
    elif mode == "clean":
        parts = sys.argv[2].split(".")
        latest = parse(sys.argv[3]) if len(sys.argv) > 3 else None
        if len(parts) == 4 or not latest:
            print(".".join(parts[:3]))
        else:
            print("%d.%d.%d" % (latest[0][0], latest[0][1], latest[0][2] + 1))


if __name__ == "__main__":
    main()
