import json, os, urllib.request, collections
os.makedirs("probe/frames", exist_ok=True)
for cid in ("dramas", "hindidramas"):
    v = json.load(open(f"docs/channel/yt-{cid}.json"))["videos"]
    by = collections.defaultdict(list)
    for x in v: by[x["label"]].append(x)
    print(cid, len(v), {k: len(x) for k, x in by.items()})
    for label, xs in by.items():
        for i, x in enumerate(xs[:2]):
            name = f"probe/frames/{cid}-{label.replace(' ', '_').replace('&','and')}-{i}.jpg"
            try:
                urllib.request.urlretrieve(f"https://i.ytimg.com/vi/{x['id']}/hq2.jpg", name)
            except Exception as e:
                print(label, e)
