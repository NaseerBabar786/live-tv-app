"""Titles for Spark TV's on-screen writing. Spark TV is an Urdu channel (the owner, 2026-10-07): writing
on screen is Urdu, or English where needed, never Hindi script. YouTube titles of Hindi uploads often
mix Devanagari with English; the Devanagari is taken out and the rest kept."""
import re

DEVANAGARI = re.compile(r"[ऀ-ॿ꣠-ꣿ]+")


def screen_title(title, fallback=""):
    t = DEVANAGARI.sub(" ", title or "")
    t = re.sub(r"\(\s*\)|\[\s*\]", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^[\s\-–—|:·,]+|[\s\-–—|:·,]+$", "", t)
    # "(Santa is Coming) – ChuChu TV ..." reads better without the brackets at the start.
    m = re.match(r"^\(([^()]+)\)\s*(.*)$", t)
    if m:
        t = f"{m.group(1)} {m.group(2)}".strip()
    return t if len(re.findall(r"\w", t)) >= 3 else fallback
