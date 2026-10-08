#!/usr/bin/env python3
"""One-off probe (not for main): which official YouTube channels carry car content (reviews, top 10s,
new launches, supercars, motorsport, Pakistani/Indian market), how much, and do they embed."""
import collections, json, os, re, sys
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tools"))
from build_dramas import channel_id, videos_page  # noqa: E402
from preair_check import lookup  # noqa: E402
from build_youtube_channels import NEVER  # noqa: E402

SKIP = re.compile(rf"{NEVER}|horror|ghost|haunted|bhoot|crash compilation|fatal|accident|death|died|killed|"
                  r"politic|election|giveaway|sponsored|podcast|q ?& ?a\b|livestream|merch", re.I)
KINDS = {
 "top10": r"top ?\d+|\b\d+ best|best .*cars|worst|ranking|ranked|list",
 "review": r"review|tested|test drive|drive\b|driven|road test|walkaround|walk around|first drive|ownership",
 "launch": r"new |launch|reveal|unveil|2026|2027|revealed|debut|price in|prices",
 "versus": r"\bvs\b|versus|drag race|comparison|compare|twin test|shootout|lap time",
 "supercar": r"ferrari|lamborghini|mclaren|bugatti|porsche|koenigsegg|pagani|hypercar|supercar|rolls|bentley|aston",
 "motorsport": r"highlights|race|grand prix|\bgp\b|qualifying|rally|le mans|f1|formula|motogp|wec|nascar|indycar",
}
SEARCHES = ["review", "top 10", "highlights"]

CANDS = [
 # Urdu (Pakistan)
 ("PakWheels", ["@PakWheels"], "PakWheels"),
 ("Car Mate PK", ["@CarMatePK"], "Car Mate"),
 ("Sunday Drive", ["@SundayDrive", "@sundaydrivepk"], "Sunday Drive"),
 ("AutoWorld PK", ["@AutoWorldPK", "@autoworldpakistan"], "Auto World|AutoWorld"),
 ("Wheels Pakistan", ["@WheelsPakistan", "@wheelspk"], "Wheels Pakistan"),
 ("Car Pakistan", ["@CarPakistan", "@carspakistan"], "Car Pakistan|Cars Pakistan"),
 ("Auto Insider PK", ["@AutoInsiderPK"], "Auto Insider"),
 ("Pakistan Auto Show", ["@PAPSPakistan"], "Pakistan Auto"),
 ("Zeeshan Ali Rizvi", ["@ZeeshanAliRizvi"], "Zeeshan"),
 ("Car Reviews Pakistan", ["@CarReviewsPakistan"], "Car Reviews Pakistan|Car Review Pakistan"),
 ("Dawn Auto", ["@DawnNewsEnglish"], "Dawn"),
 ("Changan Pakistan", ["@ChanganPakistan"], "Changan"),
 ("Toyota Indus", ["@ToyotaIndus", "@ToyotaPakistan"], "Toyota"),
 ("Honda Atlas", ["@HondaAtlasCars", "@HondaPakistan"], "Honda"),
 ("Suzuki Pakistan", ["@PakSuzuki", "@SuzukiPakistan"], "Suzuki"),
 ("Kia Lucky Motors", ["@KiaPakistan", "@KiaLuckyMotors"], "Kia"),
 ("BYD Pakistan", ["@BYDPakistan"], "BYD"),
 # Hindi (India)
 ("CarDekho", ["@CarDekhoIndia"], "CarDekho"),
 ("ZigWheels", ["@ZigWheels"], "ZigWheels"),
 ("MotorOctane", ["@MotorOctane"], "MotorOctane"),
 ("91Wheels", ["@91Wheels", "@91wheels"], "91Wheels"),
 ("Gagan Choudhary", ["@GaganChoudhary"], "Gagan Choudhary"),
 ("V3Cars", ["@V3Cars", "@v3cars"], "V3Cars|V3 Cars"),
 ("Cartoq", ["@Cartoq", "@CarToq"], "Cartoq|CarToq"),
 ("Times Drive Hindi", ["@TimesDriveHindi"], "Times Drive"),
 ("Auto Live", ["@AutoLive", "@autolivein"], "Auto Live"),
 ("Car Lelo", ["@CarLelo"], "Car Lelo"),
 ("Autocar India Hindi", ["@AutocarIndiaHindi"], "Autocar India"),
 ("Bike Dekho", ["@BikeDekho"], "BikeDekho"),
 ("Auto Yogi", ["@AutoYogi"], "Auto Yogi"),
 ("Tata Motors", ["@TataMotorsCars", "@TataMotors"], "Tata Motors"),
 ("Mahindra", ["@MahindraAutomotive", "@MahindraRise"], "Mahindra"),
 ("Maruti Suzuki", ["@MarutiSuzukiIndia", "@MarutiSuzuki"], "Maruti"),
]

def kinds(title):
    return [k for k, rx in KINDS.items() if re.search(rx, title, re.I)]

out = {}
for label, handles, name in CANDS:
    row = {"label": label}
    try:
        how, chan = channel_id(handles, name)
    except Exception as e:  # noqa: BLE001
        how, chan, row["err"] = None, None, str(e)
    row["found"], row["chan"] = how, chan
    if not chan:
        out[label] = row; print(label, "not found", flush=True); continue
    vids, seen = [], set()
    for url in [f"https://www.youtube.com/channel/{chan}/videos"] + [f"https://www.youtube.com/channel/{chan}/search?query=" + q.replace(" ", "+") for q in SEARCHES]:
        try:
            for v in videos_page(url, with_age=True):
                if v[0] not in seen:
                    seen.add(v[0]); vids.append(v)
        except Exception as e:  # noqa: BLE001
            print("  ", url, e, file=sys.stderr)
    kept = []
    for vid, title, mins, age in vids:
        if SKIP.search(title):
            continue
        if mins is not None and not 3 <= mins <= 90:
            continue
        kept.append({"id": vid, "title": title, "mins": mins, "age": age, "kinds": kinds(title)})
    checks = collections.Counter(lookup(k["id"]) or "no answer" for k in kept[:20])
    total = sum(k["mins"] or 0 for k in kept)
    kc = collections.Counter(x for k in kept for x in k["kinds"])
    recent = sum(1 for k in kept if k["age"] is not None and k["age"] <= 30)
    row.update({"videos_seen": len(vids), "kept": len(kept), "hours": round(total / 60, 1), "last30d": recent,
                "kinds": dict(kc), "embed": dict(checks),
                "items": [(k["id"], k["title"][:110], round(k["mins"] or 0), k["age"], k["kinds"]) for k in kept]})
    out[label] = row
    print(f"{label:28} seen={len(vids):3} kept={len(kept):3} h={row['hours']:5} 30d={recent:3} kinds={dict(kc)} embed={dict(checks)}", flush=True)
os.makedirs("probe", exist_ok=True)
json.dump(out, open("probe/cars_results2.json", "w"), ensure_ascii=False, indent=1)
