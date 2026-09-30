#!/usr/bin/env python3
"""Diagnostic: compares check_streams' verdicts with ffprobe on a random sample."""
import concurrent.futures as cf
import random
import subprocess
import sys
import urllib.parse

sys.path.insert(0, "tools")
import check_streams as cs

random.seed(1)
channels, _ = cs.load_channels()
urls = {}
for ch in channels:
    for u in ch["urls"]:
        urls.setdefault(u, ch["opts"])
sample = random.sample(list(urls.items()), 1500)


def run(item):
    u, o = item
    try:
        ok = cs.stream_works(u, o)
        return u, o, ("ok" if ok else "not a stream")
    except Exception as e:
        return u, o, cs.reason(e)


def ffprobe(u, o):
    cmd = ["ffprobe", "-v", "error", "-rw_timeout", "15000000", "-user_agent", o.get("ua") or cs.APP_UA]
    if o.get("ref"):
        cmd += ["-referer", o["ref"]]
    cmd += ["-show_entries", "stream=codec_type", "-of", "csv=p=0", u]
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, timeout=40)
        return ("PLAYS " + ",".join(sorted(set(p.stdout.split())))) if "video" in p.stdout or "audio" in p.stdout else "fails: " + p.stderr.strip()[-150:]
    except subprocess.TimeoutExpired:
        return "fails: ffprobe timeout"


with cf.ThreadPoolExecutor(64) as pool:
    results = list(pool.map(run, sample))

by = {}
for u, o, r in results:
    by.setdefault(r, []).append((u, o))
print({k: len(v) for k, v in sorted(by.items(), key=lambda x: -len(x[1]))})

for r in sorted(by, key=lambda k: -len(by[k]))[:8]:
    picks = by[r][:12]
    with cf.ThreadPoolExecutor(12) as pool:
        probes = list(pool.map(lambda x: ffprobe(*x), picks))
    plays = sum(p.startswith("PLAYS") for p in probes)
    print(f"\n=== {r}: ffprobe plays {plays}/{len(picks)}")
    for (u, o), p in zip(picks, probes):
        print(" ", u[:140], "|", p[:160])
    if r == "variant HTTP 404":
        for u, o in picks[:4]:
            try:
                final, data = cs.open_url(u, o, 262144)
                print("\n--- master", u[:140], "->", final[:140])
                print("\n".join(data.decode("utf-8", "replace").splitlines()[:12]))
            except Exception as e:
                print("master err", e)
