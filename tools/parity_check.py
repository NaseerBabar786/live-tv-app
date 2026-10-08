"""Keeps every Cable TV platform in step (owner's rule, 2026-10-07: a feature added to Cable TV goes to
TV, PC and phone together, and to any platform added later).

For a pull request, compares the changed files with .github/platforms.json:
- Cable TV (the Android app) changed: every platform's folder must change too, with the feature, or
  with a line in its PARITY.md saying why nothing was needed there (a TV-only fix, another app's change).
- Cable TV's version changed: each platform's parity file must name that version ("matches").
- A platform's own code (or the website code it shares) changed: its version must go up, so the
  installed copies are offered the update.

Run: python3 tools/parity_check.py <base-ref>   (CI: the pull request's base commit)
"""
import json
import re
import subprocess
import sys


def git(*args):
    return subprocess.run(["git", *args], check=True, capture_output=True, text=True).stdout


def show(ref, path):
    try:
        return git("show", f"{ref}:{path}")
    except subprocess.CalledProcessError:
        return None


def main(base):
    config = json.load(open(".github/platforms.json"))
    src = config["source"]
    changed = [f for f in git("diff", "--name-only", f"{base}...HEAD").splitlines() if f]
    errors = []

    def tv_version(text):
        m = re.search(src["version_regex"], text or "")
        return m.group(1) if m else None

    old_v = tv_version(show(base, src["version_file"]))
    new_v = tv_version(open(src["version_file"]).read())
    tv_changed = any(f.startswith(tuple(src["paths"])) for f in changed) or old_v != new_v
    tv_files = [f for f in changed if f.startswith(tuple(src["paths"]))]

    for p in config["platforms"]:
        name = p["name"]
        if p.get("paused"):
            print(f"{name} is paused ({p['paused']}), not checked.")
            continue
        touched = [f for f in changed if f.startswith(p["folder"])]
        if tv_changed and not touched:
            errors.append(
                f"{src['name']} changed ({', '.join(tv_files[:5]) or 'version ' + str(new_v)}) but {name} did not. "
                f"Make the same change in {p['folder']}, or add a line to {p['notes']} saying why it isn't needed there.")
        if new_v and p.get("parity_file"):
            matches = json.load(open(p["parity_file"])).get("matches")
            if matches != new_v:
                errors.append(f"{src['name']} is {new_v} but {p['parity_file']} says \"matches\": \"{matches}\". "
                              f"Bring {name} in step and set it to {new_v}.")
        code_changed = any(f.startswith(tuple(p.get("code", []))) or f in p.get("shared", []) for f in changed)
        if code_changed and p.get("package_file"):
            old_pkg = show(base, p["package_file"])
            if old_pkg is not None:
                old = json.loads(old_pkg).get("version")
                new = json.load(open(p["package_file"])).get("version")
                if old == new:
                    errors.append(f"{name}'s code changed but its version is still {new}: raise it in {p['package_file']} "
                                  f"so installed copies are offered the update.")

    if errors:
        print("Cable TV platforms are out of step:\n")
        for e in errors:
            print(f"- {e}")
            print(f"::error::{e}")
        sys.exit(1)
    print(f"All Cable TV platforms are in step (Cable TV {new_v}).")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "origin/main")
