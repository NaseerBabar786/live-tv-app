"""Prints the apps' crash reports (Firestore crashReports), grouped by app, version and error.

Signs in as the read-only crash-reader@bulkbazaar.ca login, whose password is in the
CRASH_READER_PASSWORD environment variable (Claude's cloud environment; never in the repo).
The owner sees the same list at tv.bulkbazaar.ca/crashes.

  python3 tools/crash_reports.py            # summary, newest problems first
  python3 tools/crash_reports.py --stacks   # with the full error trace of each problem
"""
import json, os, sys, urllib.request
from collections import defaultdict

KEY = "AIzaSyAukJcRHwIV_W3TKtr3_5XiVJZe-7491KE"
READER = "crash-reader@bulkbazaar.ca"
DOCS = "https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/crashReports?pageSize=300"


def post(url, body):
    req = urllib.request.Request(url, json.dumps(body).encode(), {"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def value(v):
    return next(iter(v.values())) if v else None


def main():
    password = os.environ.get("CRASH_READER_PASSWORD")
    if not password:
        sys.exit("CRASH_READER_PASSWORD is not set (the owner adds it in the project's cloud environment).")
    token = post(f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={KEY}",
                 {"email": READER, "password": password, "returnSecureToken": True})["idToken"]
    docs, page = [], ""
    while True:
        req = urllib.request.Request(DOCS + (f"&pageToken={page}" if page else ""), headers={"Authorization": "Bearer " + token})
        with urllib.request.urlopen(req, timeout=30) as r:
            data = json.load(r)
        docs += [{k: value(v) for k, v in d.get("fields", {}).items()} for d in data.get("documents", [])]
        page = data.get("nextPageToken")
        if not page:
            break
    groups = defaultdict(list)
    for d in docs:
        groups[(d.get("app"), d.get("version"), d.get("error"))].append(d)
    print(f"{len(docs)} crash reports, {len(groups)} different problems")
    newest = lambda items: max(i.get("time") or "" for i in items)
    for (app, version, error), items in sorted(groups.items(), key=lambda kv: newest(kv[1]), reverse=True):
        devices = sorted({f"{i.get('device')} / Android {i.get('android')}" for i in items})
        on_start = sum(1 for i in items if i.get("onStart"))
        print(f"\n{app} {version}: {len(items)}x (on start {on_start}), last {newest(items)}\n  {error}\n  devices: {'; '.join(devices)}")
        if "--stacks" in sys.argv:
            latest = max(items, key=lambda i: i.get("time") or "")
            print("  " + (latest.get("stack") or "").replace("\n", "\n  "))


if __name__ == "__main__":
    main()
