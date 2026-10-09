#!/usr/bin/env bash
# A21: ad breaks in Strip and Carousel (break interval cut to 1 minute in this build).
set -u
OUT="$1"; APK="$2"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"; LOG="$OUT/steps.txt"; : > "$LOG"; N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$1" >/dev/null 2>&1; }
shot() { N=$((N+1)); local f; f="$(printf '%03d' $N)-$1"; adb exec-out screencap -p > "$OUT/$f.png" 2>/dev/null; dump "$OUT/$f.xml"; note "screenshot $f"; }
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
tap_text() { local b; b=$(find_text "$@"); if [ -n "$b" ]; then adb shell input tap $b; note "tapped '$1'"; sleep 2; return 0; fi; note "could not find '$*'"; return 1; }
running() { adb shell pidof "$PKG" >/dev/null 2>&1; }
alive() { running && note "OK: app running ($1)" || note "PROBLEM: APP NOT RUNNING ($1)"; }
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 || adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; }
has() { dump "$OUT/_has.xml"; grep -qiE "$1" "$OUT/_has.xml"; }

adb logcat -c
adb install -r -g "$APK" >> "$LOG" 2>&1
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
launch; sleep 40; shot start

open_mode() { # mode name
  adb shell am force-stop "$PKG"; launch; sleep 25
  [ -z "$(find_text "Modes")" ] && { adb shell input keyevent KEYCODE_BACK; sleep 3; }
  tap_text "Modes" && sleep 2
  shot "modes-for-$1"
  tap_text "$1" || return 1
  sleep 10; shot "$1-open"
}

check_mode() { # mode name
  local m="$1" seen=""
  open_mode "$m" || { note "FAIL: could not open $m"; return; }
  # A regular channel in the big picture (our YouTube channels have no breaks): move along a few.
  for i in 1 2 3 4; do adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 1; done
  adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 10; shot "$m-regular-channel"
  for i in $(seq 1 30); do
    if has "skip in|ad 1 of|skip ad"; then seen=1; break; fi
    sleep 5
  done
  if [ -z "$seen" ]; then note "FAIL: no ad break in $m within 150 s"; shot "$m-no-break"; return; fi
  note "PASS: ad break showed in $m"; shot "$m-break"
  sleep 4; shot "$m-break-later"
  adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 1
  shot "$m-keys-during-break"
  sleep 10
  adb shell input keyevent KEYCODE_BACK; sleep 3; shot "$m-after-back"
  if has "skip ad"; then note "FAIL: Back did not skip the ad in $m"; elif has "skip in"; then note "INFO: next ad of the break showing after Back"; else note "PASS: Back skipped the ad in $m"; fi
  sleep 30
  shot "$m-after-break"
  alive "$m after the break"
}

check_mode Strip
check_mode Carousel
adb logcat -d > "$OUT/logcat.txt"
grep -E "FATAL EXCEPTION|AndroidRuntime" -A15 "$OUT/logcat.txt" > "$OUT/crashes-found.txt" || echo "none" > "$OUT/crashes-found.txt"
rm -f "$OUT"/_*.xml
