"""The newsreader's fixed lines in the 8-hour-set bulletins (no clock time), shared by make_news.py and the
lip-synced clip maker (tools/news/modal/longcat_avatar.py --lines). Owner 2026-10-10: make each reader's fixed lines
once with real lip sync (LongCat-Video-Avatar on Modal) and reuse them every day, since a fresh clip per bulletin
costs far more than the free monthly credit. Changing a text here means the clips must be made again."""

GREET = "السلام علیکم، اور یہ ہے اسپارک ٹی وی نیوز۔ "
OPEN = {
    "headlines": GREET + "پیش ہیں اس وقت کی اہم خبریں۔",
    "full": GREET + "تفصیلی خبرنامے میں خوش آمدید۔",
}
CLOSE = ("یہ تھیں اس وقت کی خبریں۔ خبروں کی سرخیاں ہر گھنٹے، اور تفصیلی خبرنامہ ہر چار گھنٹے بعد، "
         "صرف اسپارک ٹی وی پر۔ اللہ حافظ۔")

# Which lines each newsroom needs: headlines are read in rooms q (day) and n (night), the full news in t and r.
ROOM_KIND = {"q": "headlines", "n": "headlines", "t": "full", "r": "full"}


def line_keys(room):
    """(key, text) pairs a reader needs in this newsroom."""
    kind = ROOM_KIND[room]
    return [(f"open-{kind}", OPEN[kind]), ("close", CLOSE)]


def clip_name(picture_id, key):
    """Release file name of a lip-synced line, e.g. lip-anchor-1q-open-headlines.mp4 on channel-media."""
    return f"lip-{picture_id}-{key}.mp4"
