#!/usr/bin/env bash
# Library main page with the Spark TV and MTA folders (2026-10-09). Usage: run_library.sh <out-dir> <no-sign-in-apk>
set -u
OUT="$1"; APK="$2"; PKG=com.naseerbabar.livetv
mkdir -p "$OUT"; LOG="$OUT/steps.txt"; : > "$LOG"; N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$1" >/dev/null 2>&1; }
shot() { N=$((N+1)); local f; f="$(printf '%03d' $N)-$1"; adb exec-out screencap -p > "$OUT/$f.png" 2>/dev/null; dump "$OUT/$f.xml"; note "screenshot $f"; }
key() { adb shell input keyevent "$@"; sleep 1; }
find_text() {
  dump "$OUT/_tap.xml"
  python3 - "$OUT/_tap.xml" "$@" <<'PY'
import re, sys, xml.etree.ElementTree as ET
try: root = ET.parse(sys.argv[1]).getroot()
except Exception: sys.exit(0)
nodes = list(root.iter("node"))
for exact in (True, False):
    for want in sys.argv[2:]:
        w = want.lower()
        for n in nodes:
            for t in ((n.get("text") or ""), (n.get("content-desc") or "")):
                t = t.lower().strip()
                if t and ((t == w) if exact else (w in t)):
                    x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds")))
                    if x2 > x1 and y2 > y1:
                        print((x1 + x2) // 2, (y1 + y2) // 2); sys.exit(0)
PY
}
tap_text() { local b; b=$(find_text "$@"); if [ -n "$b" ]; then adb shell input tap $b; note "tapped '$1' at $b"; sleep 2; return 0; fi; note "could not find '$*'"; return 1; }
running() { adb shell pidof "$PKG" >/dev/null 2>&1; }
alive() { running && note "OK: app running ($1)" || note "PROBLEM: APP NOT RUNNING ($1)"; }
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 || adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; }
fresh() { adb shell am force-stop "$PKG"; launch; sleep "${1:-25}"; }
library() {
  fresh 20
  if [ -z "$(find_text "Library")" ]; then key KEYCODE_BACK; sleep 2; fi
  tap_text "Library" || { key KEYCODE_BACK; sleep 2; tap_text "Library"; }
  sleep 20
}

adb logcat -c
adb install -r -g "$APK" >> "$LOG" 2>&1 || adb install -r "$APK" >> "$LOG" 2>&1
launch; sleep 40; shot start
alive start

note "== MTA off (default) =="
library; shot library-mta-off
tap_text "Spark TV" && { sleep 5; shot spark-folder; tap_text "Spark TV One" && { sleep 4; shot spark-episodes; key KEYCODE_BACK; sleep 2; }; key KEYCODE_BACK; sleep 2; shot back-to-library; }
tap_text "Urdu" && { sleep 5; tap_text "Shows" && { sleep 3; shot urdu-shows; }; key KEYCODE_BACK; sleep 2; }
alive "mta off"

note "== MTA on =="
adb shell am force-stop "$PKG"; sleep 2
F=/data/data/$PKG/shared_prefs/live_tv.xml
adb shell "run-as $PKG sh -c 'grep -q \"name=\\\"mta\\\"\" $F && sed -i \"s/name=\\\"mta\\\" value=\\\"false\\\"/name=\\\"mta\\\" value=\\\"true\\\"/\" $F || sed -i \"s#</map>#    <boolean name=\\\"mta\\\" value=\\\"true\\\" />\\n</map>#\" $F'" >> "$LOG" 2>&1
adb shell "run-as $PKG cat $F" | grep -i mta | tee -a "$LOG"
library; shot library-mta-on
# Focus walk with the remote: Down/Right through the tiles.
key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_RIGHT; key KEYCODE_DPAD_RIGHT; shot library-focus-walk
tap_text "MTA" && { sleep 5; shot mta-folder; key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_CENTER; sleep 4; shot mta-show; key KEYCODE_BACK; sleep 2; key KEYCODE_BACK; sleep 2; shot back-from-mta; }
alive "mta on"
adb logcat -d > "$OUT/logcat.txt"
grep -n "FATAL EXCEPTION" -A20 "$OUT/logcat.txt" > "$OUT/crashes-found.txt" || echo "no crashes" > "$OUT/crashes-found.txt"
cat "$OUT/crashes-found.txt" | head -30
