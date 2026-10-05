#!/usr/bin/env python3
"""Builds the Quran text that Iqra Quran ships inside the app (quran/src/main/assets/quran).

- quran.json: the 114 surahs with their names and the Arabic text in the Indo-Pak script
  (as published by the Quran Foundation, api.quran.com).
- ur.json / en.json: one Urdu and one English translation, ayah by ayah.

It also checks that every reciter in reciters.json still has audio on everyayah.com.
Run by .github/workflows/build-quran.yml; the files are committed, so the app works offline.
"""
import json
import os
import re
import sys
import time
import urllib.request

API = "https://api.quran.com/api/v4"
OUT = os.path.join(os.path.dirname(__file__), "..", "quran", "src", "main", "assets", "quran")

# Translations, picked by name so a changed resource id can't swap in a different work.
TRANSLATIONS = {
    "ur": ("ur", ["jalandh"], "Fateh Muhammad Jalandhry"),
    "en": ("en", ["saheeh", "sahih"], "Saheeh International"),
}


def get(url, tries=4):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "IqraQuran-build", "Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as e:  # noqa: BLE001
            print(f"  {url}: {e}", file=sys.stderr)
            time.sleep(2 * (i + 1))
    sys.exit(f"Could not fetch {url}")


def head_ok(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "IqraQuran-build"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status == 200
    except Exception:  # noqa: BLE001
        return False


def clean(text):
    """Translations carry footnote markers like <sup foot_note=123>1</sup>; keep plain text."""
    text = re.sub(r"<sup[^>]*>.*?</sup>", "", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", text).strip()


def tidy_arabic(text):
    """The Indo-Pak text uses private-use characters for a few stop signs that only the
    publisher's own font can draw; standard fonts show them as empty boxes, so they are dropped.
    Invisible marks are removed and wide spaces become normal ones."""
    text = "".join(ch for ch in text if not 0xE000 <= ord(ch) <= 0xF8FF)
    text = text.replace("\ufe8e", "\u0627")
    text = re.sub("[\u200b\u200e\u200f\ufeff]", "", text)
    text = re.sub("[\u2002\u2003\u00a0]", " ", text)
    return re.sub(" +", " ", text).strip()


def by_surah(verses, field):
    out = [[] for _ in range(114)]
    for v in sorted(verses, key=lambda v: tuple(int(x) for x in v["verse_key"].split(":"))):
        s, a = (int(x) for x in v["verse_key"].split(":"))
        assert a == len(out[s - 1]) + 1, f"gap before {v['verse_key']}"
        out[s - 1].append(tidy_arabic(v[field]))
    return out


def main():
    os.makedirs(OUT, exist_ok=True)

    chapters_en = get(f"{API}/chapters?language=en")["chapters"]
    chapters_ur = {c["id"]: c for c in get(f"{API}/chapters?language=ur")["chapters"]}
    indopak = by_surah(get(f"{API}/quran/verses/indopak")["verses"], "text_indopak")

    surahs = []
    for c in chapters_en:
        n = c["id"]
        ayahs = indopak[n - 1]
        assert len(ayahs) == c["verses_count"], f"surah {n}: {len(ayahs)} != {c['verses_count']}"
        surahs.append({
            "n": n,
            "ar": c["name_arabic"],
            "en": c["name_simple"],
            "enMeaning": c["translated_name"]["name"],
            "ur": chapters_ur.get(n, c)["translated_name"]["name"],
            "place": c["revelation_place"],
            "ayahs": ayahs,
        })
    total = sum(len(s["ayahs"]) for s in surahs)
    assert len(surahs) == 114 and total == 6236, (len(surahs), total)
    with open(os.path.join(OUT, "quran.json"), "w", encoding="utf-8") as f:
        json.dump({"source": "Quran Foundation (api.quran.com), Indo-Pak script", "surahs": surahs},
                  f, ensure_ascii=False, separators=(",", ":"))
    print(f"quran.json: {len(surahs)} surahs, {total} ayahs")

    for code, (lang, keys, expected) in TRANSLATIONS.items():
        resources = get(f"{API}/resources/translations?language={lang}")["translations"]
        match = [r for r in resources if any(k in (r["name"] + r.get("author_name", "")).lower() for k in keys)
                 and r["language_name"].lower().startswith("urdu" if code == "ur" else "english")]
        if not match:
            sys.exit(f"No {expected} translation found; available: {[r['name'] for r in resources]}")
        res = match[0]
        verses = get(f"{API}/quran/translations/{res['id']}")["translations"]
        assert len(verses) == 6236, f"{res['name']}: {len(verses)} ayahs"
        # This endpoint lists ayahs in order without verse keys.
        texts = [clean(v["text"]) for v in verses]
        per = []
        i = 0
        for s in surahs:
            per.append(texts[i:i + len(s["ayahs"])])
            i += len(s["ayahs"])
        with open(os.path.join(OUT, f"{code}.json"), "w", encoding="utf-8") as f:
            json.dump({"name": res.get("author_name") or res["name"], "surahs": per},
                      f, ensure_ascii=False, separators=(",", ":"))
        print(f"{code}.json: {res['name']} (id {res['id']}); 1:1 = {per[0][0][:80]}")

    with open(os.path.join(OUT, "reciters.json"), encoding="utf-8") as f:
        reciters = json.load(f)
    missing = [r["folder"] for r in reciters
               if not head_ok(f"https://everyayah.com/data/{r['folder']}/114006.mp3")]
    if missing:
        sys.exit(f"No audio on everyayah.com for: {missing}")
    print(f"reciters ok: {[r['folder'] for r in reciters]}")


if __name__ == "__main__":
    main()
