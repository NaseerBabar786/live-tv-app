#!/usr/bin/env python3
"""
Makes a "coming up" promo (make_promo.py) for every show booked on Bazaar TV's schedule, once:
a booking whose promo is already made with the same name, time, videos and maker is skipped.

usage: make_show_promos.py out_dir [--remake] [--max N]
Reads the owner's saved schedule (Firestore channel/main, the public copy Channel Studio saves),
else the ready-made one (docs/channel/test-schedule.json). Writes the new promos to out_dir and
updates docs/media/show-promos.json (Channel Studio reads it) and the Media Library's Promos section.
"""
import hashlib, json, os, re, sys, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import make_promo  # noqa: E402

REPO = os.environ.get("GITHUB_REPOSITORY", "NaseerBabar786/live-tv-app")
RELEASE = f"https://github.com/{REPO}/releases/download/channel-media/"
MANIFEST = os.path.join(ROOT, "docs/media/show-promos.json")
LIBRARY = os.path.join(ROOT, "docs/media/library.json")
DAY_EN = {"all": "Every day", "weekdays": "Monday to Friday", "weekend": "Saturday & Sunday", "mon": "Every Monday",
          "tue": "Every Tuesday", "wed": "Every Wednesday", "thu": "Every Thursday", "fri": "Every Friday",
          "sat": "Every Saturday", "sun": "Every Sunday"}
WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def schedule():
    url = "https://firestore.googleapis.com/v1/projects/live-tv-b2164/databases/(default)/documents/channel/main"
    try:
        doc = json.load(urllib.request.urlopen(url, timeout=30))
        return json.loads(doc["fields"]["data"]["stringValue"]), "the owner's saved schedule"
    except Exception as e:
        print("Saved schedule not readable, using the ready-made one:", e)
        return json.load(open(os.path.join(ROOT, "docs/channel/test-schedule.json"))), "the ready-made schedule"


def clock(hhmm):
    h, m = (int(x) for x in hhmm.split(":"))
    return f"{h % 12 or 12}{':%02d' % m if m else ''} {'AM' if h < 12 else 'PM'}"


def when_text(day, hhmm):
    if re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
        import datetime
        d = datetime.date.fromisoformat(day)
        return f"{d.strftime('%A, %B')} {d.day} · {clock(hhmm)}", WEEKDAYS[d.weekday()]
    return f"{DAY_EN.get(day, 'Every day')} · {clock(hhmm)}", day


def slug(t):
    return re.sub(r"[^a-z0-9]+", "-", t.lower()).strip("-")[:40] or "show"


def maker_version():
    h = hashlib.sha1()
    for f in ("make_promo.py", "cinematic.py", "music_gen.py"):
        h.update(open(os.path.join(HERE, f), "rb").read())
    return h.hexdigest()[:10]


def credits():
    """Licence lines for known videos, from the free show library and the Media Library."""
    out = {}
    try:
        for x in json.load(open(os.path.join(ROOT, "docs/channel/library.json"))):
            out[x["url"]] = (x.get("licence", ""), x.get("cat", ""))
    except Exception:
        pass
    try:
        for x in json.load(open(LIBRARY))["items"]:
            u = x.get("url", "")
            out.setdefault(u if u.startswith("http") else "https://tv.bulkbazaar.ca/" + u, (x.get("credit", ""), x.get("cat", "")))
    except Exception:
        pass
    # Blender open films on our channel-media release.
    for name, line in (("sintel", "Sintel © Blender Foundation, sintel.org (CC BY 3.0)"),
                       ("tears", "Tears of Steel © Blender Foundation, mango.blender.org (CC BY 3.0)"),
                       ("bunny", "Big Buck Bunny © Blender Foundation, bigbuckbunny.org (CC BY 3.0)"),
                       ("elephant", "Elephants Dream © Blender Foundation, orange.blender.org (CC BY 2.5)"),
                       ("caminandes", "Caminandes © Blender Foundation, caminandes.com (CC BY 3.0)")):
        out[name] = (line, "Cartoons" if name in ("bunny", "caminandes") else "")
    return out


def bookings(cfg):
    """One entry per booked slot: what its promo shows and says."""
    vids = {v["id"]: v for v in cfg.get("videos", [])}
    lic = credits()
    out = []
    for s in cfg.get("slots", []):
        eps = [vids[i] for i in (s.get("episodes") or [s.get("video")]) if i in vids]
        eps = [v for v in eps if v.get("secs", 0) > 0 and v.get("kind", "programme") == "programme"]
        if not eps or not re.fullmatch(r"\d{1,2}:\d{2}", s.get("time", "")):
            continue
        title = s.get("show") or eps[0]["title"]
        when, day = when_text(s.get("day", "all"), s["time"])
        known = [lic.get(eps[0]["url"])] + [v for k, v in lic.items() if not k.startswith("http") and k in eps[0]["url"].lower()]
        credit, cat = next((x for x in known if x), ("", ""))
        kids = re.search(r"cartoon|kids|children|popeye|superman|bunny|llama|caminandes", (cat + " " + title).lower())
        key = f"{slug(make_promo.clean_title(title))}-{s.get('day', 'all')}-{s['time'].replace(':', '')}"
        out.append({"key": key, "title": title, "show": s.get("show", ""), "when": when, "day": day, "time": s["time"],
                    "videos": [v["url"] for v in eps], "series": len(eps) > 1, "credit": credit,
                    "mood": "energetic" if kids else "cinematic", "secs": 20, "lang": "ur"})
    return out


def main():
    out_dir = sys.argv[1]
    remake = "--remake" in sys.argv
    limit = int(sys.argv[sys.argv.index("--max") + 1]) if "--max" in sys.argv else 8
    os.makedirs(out_dir, exist_ok=True)
    cfg, source = schedule()
    old = json.load(open(MANIFEST)) if os.path.exists(MANIFEST) else {"promos": {}}
    version = maker_version()
    promos, made = {}, 0
    for b in bookings(cfg):
        spec = {k: v for k, v in b.items() if k != "key"}
        h = hashlib.sha1(json.dumps([spec, version], sort_keys=True).encode()).hexdigest()[:12]
        have = old["promos"].get(b["key"])
        if have and have.get("hash") == h and not remake:
            promos[b["key"]] = have
            continue
        if made >= limit:
            if have:
                promos[b["key"]] = have
            continue
        name = f"show-promo-{b['key']}.mp4"
        print("Making", name, "for", b["title"], "·", b["when"])
        try:
            info = make_promo.make(spec, os.path.join(out_dir, name))
        except Exception as e:
            print("  failed:", e)
            if have:
                promos[b["key"]] = have
            continue
        made += 1
        promos[b["key"]] = {"title": make_promo.clean_title(b["title"]), "when": b["when"], "day": b["day"], "time": b["time"],
                            "videos": b["videos"], "url": RELEASE + name, "secs": info["secs"], "voice": info["voice"],
                            "credit": b["credit"], "hash": h}
    json.dump({"about": f"Coming-up promos for the shows booked on Bazaar TV (from {source}), made by tools/promos.",
               "promos": promos}, open(MANIFEST, "w"), indent=1, ensure_ascii=False)
    # Media Library › Cable TV Promos: one item per show promo, old ones taken out.
    lib = json.load(open(LIBRARY))
    lib["items"] = [x for x in lib["items"] if not x.get("id", "").startswith("show-promo-")]
    for k, p in promos.items():
        lib["items"].append({"id": "show-promo-" + k, "cat": "promos", "lang": "ur", "title": f"Promo: {p['title']}",
                             "url": p["url"], "secs": p["secs"], "about": f"Coming up on Bazaar TV: {p['title']}, {p['when']}.",
                             "credit": "Our own promo with original music" + (f". Pictures: {p['credit']}" if p["credit"] else "") + "."})
    json.dump(lib, open(LIBRARY, "w"), indent=1, ensure_ascii=False)
    print(f"{made} new promo(s); {len(promos)} booked show(s) have one.")


if __name__ == "__main__":
    main()
