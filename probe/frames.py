import json, os, urllib.request, collections
os.makedirs("probe/frames", exist_ok=True)
v = json.load(open("docs/channel/yt-shayari.json"))["videos"]
by = collections.defaultdict(list)
for x in v: by[x["label"]].append(x)
print(len(v), round(sum((x.get("mins") or 0) for x in v) / 60, 1), "h", {k: len(x) for k, x in by.items()})
for label, xs in by.items():
    for i, x in enumerate(xs[:2]):
        name = f"probe/frames/{label.replace(' ', '_')}-{i}.jpg"
        try:
            urllib.request.urlretrieve(f"https://i.ytimg.com/vi/{x['id']}/hq2.jpg", name)
        except Exception as e:
            print(label, e)
