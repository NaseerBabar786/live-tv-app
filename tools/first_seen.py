#!/usr/bin/env python3
"""
Marks each programme in a Library playlist with the day it first appeared there, so Cable TV's
Library can show a "Newly added" section (items added in the last few days).

Adds added="YYYY-MM-DD" to every #EXTINF line. The day comes from, in order:
  - an added="..." the builder already wrote (Dramas.m3u knows when it found each episode),
  - the same link in the playlist as it was last published (git HEAD), so a programme keeps its day,
  - today, for a programme that is new since then.
The first time a playlist gets these marks, everything already in it is dated BASELINE_DAYS ago,
so the whole old list doesn't show up as new.

Standard library only. Run after a builder, before publishing: python3 tools/first_seen.py docs/Movies.m3u
"""
import datetime as dt
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BASELINE_DAYS = 30
ADDED = re.compile(r'\sadded="(\d{4}-\d{2}-\d{2})"')


def entries(text):
    """(EXTINF line index, link) for each programme in an M3U text."""
    lines = text.splitlines()
    out = []
    extinf = None
    for i, line in enumerate(lines):
        s = line.strip()
        if s.startswith("#EXTINF"):
            extinf = i
        elif s and not s.startswith("#") and extinf is not None:
            out.append((extinf, s))
            extinf = None
    return lines, out


def published(path):
    """The playlist as it was last committed, or None for a new file."""
    rel = os.path.relpath(os.path.abspath(path), ROOT)
    try:
        return subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=ROOT, check=True,
                              capture_output=True, text=True).stdout
    except (subprocess.CalledProcessError, OSError):
        return None


def mark(path, today=None):
    today = today or dt.date.today()
    old = published(path)
    before = {}
    if old:
        lines, items = entries(old)
        for i, url in items:
            m = ADDED.search(lines[i])
            if m:
                before.setdefault(url, m.group(1))
    # Never marked before: what was already there counts as old.
    baseline = None
    if old and not before:
        baseline = (today - dt.timedelta(days=BASELINE_DAYS)).isoformat()
        _, items = entries(old)
        before = {url: baseline for _, url in items}

    with open(path, encoding="utf-8") as f:
        lines, items = entries(f.read())
    new = 0
    for i, url in items:
        m = ADDED.search(lines[i])
        if m:
            day = m.group(1)
            lines[i] = ADDED.sub("", lines[i])
        else:
            day = before.get(url)
            if day is None:
                day = today.isoformat()
                new += 1
        lines[i] = re.sub(r"^(#EXTINF:\s*-?\d+)", rf'\1 added="{day}"', lines[i], count=1)
    with open(path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")
    recent = (today - dt.timedelta(days=7)).isoformat()
    week = sum(1 for i, _ in items if ADDED.search(lines[i]).group(1) >= recent)
    print(f"{os.path.basename(path)}: {len(items)} programmes, {new} new today, {week} added in the last 7 days"
          + (f" (first marking: the old list dated {baseline})" if baseline else ""))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("Usage: first_seen.py PLAYLIST.m3u [...]")
    for p in sys.argv[1:]:
        mark(p)
