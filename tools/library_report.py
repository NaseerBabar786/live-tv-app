#!/usr/bin/env python3
"""
The morning report of what the Library's daily update added (owner, 2026-10-08): every programme
in the Library's lists (docs/Dramas.m3u, docs/Free.m3u) whose added="..." day is the given day,
grouped by language and section, with counts and titles. Episodes of one show are counted together.
Also says whether each list's build ran today and how it ended (needs the gh CLI; skipped without it).

Run: python3 tools/library_report.py [YYYY-MM-DD]   (default: today, UTC)
"""
import datetime as dt
import json
import os
import re
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LISTS = ["Dramas.m3u", "Free.m3u"]  # Movies.m3u left the Library on 2026-10-08 (Bazaar Cinema only)
BUILDS = [("Dramas and shows", "build-dramas.yml"), ("Classic films (Bazaar Cinema)", "build-movies.yml"),
          ("Free films", "build-free.yml")]
LANGUAGES = ["Urdu", "Hindi", "Punjabi", "English"]
SECTIONS = {"Movies": "Movies", "Series": "Series", "Shows": "Shows", "Kids": "Kids"}
ATTR = re.compile(r'([\w-]+)="([^"]*)"')
EPISODE = re.compile(r"^(.*?)\s+Episode\s+(\d+)$", re.IGNORECASE)
MAX_TITLES = 12


def entries(path):
    with open(path, encoding="utf-8") as f:
        lines = f.read().splitlines()
    for i, line in enumerate(lines):
        if line.startswith("#EXTINF"):
            head, _, name = line.partition('",')
            attrs = dict(ATTR.findall(line[: len(head) + 1]))
            yield attrs, name.strip() or line.rsplit(",", 1)[-1].strip()


def builds(day):
    out = []
    for label, wf in BUILDS:
        try:
            runs = json.loads(subprocess.run(
                ["gh", "api", f"repos/NaseerBabar786/live-tv-app/actions/workflows/{wf}/runs?per_page=5&event=schedule"],
                check=True, capture_output=True, text=True).stdout)["workflow_runs"]
        except Exception:  # noqa: BLE001
            return []
        run = next((r for r in runs if r["created_at"].startswith(day)), None)
        if not run:
            out.append(f"{label}: did not run today")
        elif run["status"] != "completed":
            out.append(f"{label}: still running")
        else:
            out.append(f"{label}: {'OK' if run['conclusion'] == 'success' else 'FAILED (' + str(run['conclusion']) + ')'}"
                       + ("" if run["conclusion"] == "success" else f" {run['html_url']}"))
    return out


def main():
    day = sys.argv[1] if len(sys.argv) > 1 else dt.datetime.now(dt.timezone.utc).date().isoformat()
    new = defaultdict(lambda: defaultdict(list))  # language -> section -> [(group, name)]
    for name in LISTS:
        path = os.path.join(ROOT, "docs", name)
        if not os.path.exists(path):
            continue
        for attrs, title in entries(path):
            if attrs.get("added") != day:
                continue
            lang = attrs.get("tvg-language") or "English"
            section = SECTIONS.get(attrs.get("tvg-genre", ""), attrs.get("tvg-genre") or "Other")
            new[lang][section].append((attrs.get("group-title", ""), title))

    total = sum(len(v) for s in new.values() for v in s.values())
    print(f"Library update {day}: {total} new programmes" if total else f"Library update {day}: nothing new today")
    for line in builds(day):
        print(f"  {line}")
    for lang in LANGUAGES + sorted(set(new) - set(LANGUAGES)):
        if lang not in new:
            continue
        sections = new[lang]
        print(f"\n{lang} ({sum(len(v) for v in sections.values())} new)")
        for section in ["Movies", "Series", "Shows", "Kids"] + sorted(set(sections) - set(SECTIONS)):
            items = sections.get(section)
            if not items:
                continue
            # Films by name; episodes of one show counted together ("Kaffara: 3 new episodes (23-25)");
            # cooking, Islamic and kids' videos counted by their folder ("Kitchen Nightmares: 25 new").
            shows, folders, films = defaultdict(list), defaultdict(int), []
            for group, title in items:
                m = EPISODE.match(title)
                if section == "Movies":
                    films.append(title)
                elif m and section != "Kids":
                    shows[m.group(1)].append(int(m.group(2)))
                else:
                    folders[group or title] += 1
            names = sorted(films) + [
                f"{show}: {len(eps)} new episode{'s' if len(eps) > 1 else ''} ({min(eps)}"
                + (f"-{max(eps)})" if len(eps) > 1 else ")") for show, eps in sorted(shows.items())] + [
                f"{folder}: {n} new" for folder, n in sorted(folders.items(), key=lambda kv: -kv[1])]
            more = f", and {len(names) - MAX_TITLES} more" if len(names) > MAX_TITLES else ""
            print(f"  {section} ({len(items)}): " + "; ".join(names[:MAX_TITLES]) + more)


if __name__ == "__main__":
    main()
