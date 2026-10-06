"""Version codes for the owner's test builds and crash rollbacks.

Android won't install a lower versionCode over a higher one, so going back to the last good version
needs that version rebuilt with a higher code. CI therefore builds every app with versionCode x10
("scale"), and rebuilds the last approved version with this build's code + 1 ("rollback"), so the
rollback always installs over the test build, and the next real version (code + 1, x10) installs over
the rollback again.

  python3 tools/version_codes.py scale
  python3 tools/version_codes.py rollback <old checkout dir>   (run after "scale", from the new checkout)
"""
import re, sys

FILES = ["app/build.gradle.kts", "appbazaar/build.gradle.kts", "quran/build.gradle.kts",
         "livecam/build.gradle.kts", "multichat/build.gradle.kts", "claudenotes/build.gradle.kts"]
CODE = re.compile(r"(versionCode\s*=\s*)(\d+)")


def codes(path):
    with open(path) as f:
        return [int(m.group(2)) for m in CODE.finditer(f.read())]


def rewrite(path, new_codes):
    with open(path) as f:
        text = f.read()
    it = iter(new_codes)
    text = CODE.sub(lambda m: m.group(1) + str(next(it)), text)
    with open(path, "w") as f:
        f.write(text)


def main():
    mode = sys.argv[1]
    for path in FILES:
        if mode == "scale":
            rewrite(path, [c * 10 for c in codes(path)])
        elif mode == "rollback":
            old = sys.argv[2].rstrip("/") + "/" + path
            try:
                old_codes = codes(old)
            except FileNotFoundError:
                continue
            new = codes(path)
            if len(old_codes) != len(new):
                print(f"{path}: {len(old_codes)} version codes in the old version, {len(new)} now; skipped")
                continue
            rewrite(old, [c + 1 for c in new])
        print(path, codes(path) if mode == "scale" else codes(sys.argv[2].rstrip("/") + "/" + path))


if __name__ == "__main__":
    main()
