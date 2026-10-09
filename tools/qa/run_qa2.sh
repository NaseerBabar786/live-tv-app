#!/usr/bin/env bash
# Tonight's test build, walked through the owner's checklist on an Android TV emulator (2026-10-09).
# Usage: run_qa.sh <out-dir> <test-apk> <no-sign-in-apk> [public-apk]
# The test APK is the owner's test build; it stops at sign-in. The no-sign-in APK is the same code built
# without the sign-in secret (every feature, no packages), so every screen can be reached.
set -u
OUT="$1"; TEST_APK="$2"; QA_APK="$3"; PUBLIC_APK="${4:-}"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"
LOG="$OUT/steps.txt"; : > "$LOG"
N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$1" >/dev/null 2>&1; }
shot() { # name
  N=$((N+1)); local f; f="$(printf '%03d' $N)-$1"
  adb exec-out screencap -p > "$OUT/$f.png" 2>/dev/null
  dump "$OUT/$f.xml"
  note "screenshot $f  [$(top_activity)]"
}
top_activity() { adb shell dumpsys activity activities 2>/dev/null | grep -m1 -E "mResumedActivity|topResumedActivity" | grep -o "[a-zA-Z0-9_.]*/[a-zA-Z0-9_.]*" | head -1; }
key() { adb shell input keyevent "$@"; sleep 1; }
dial() { adb shell input keyevent $(echo "$1" | sed 's/./KEYCODE_& /g'); note "dialled $1"; }
# Finds the first element whose text/description equals (or else contains) the wanted text; prints its centre.
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
tap_text() { # tap_text "label" ["other label" ...]
  local b; b=$(find_text "$@")
  if [ -n "$b" ]; then adb shell input tap $b; note "tapped '$1' at $b"; sleep 2; return 0; fi
  note "could not find '$*' on screen"; return 1
}
# Scrolls the area at x (finger moves up) until the text shows, then taps it.
scroll_tap() { # x text...
  local x="$1"; shift
  for i in $(seq 1 14); do
    tap_text "$@" && return 0
    adb shell input swipe "$x" 900 "$x" 450 400; sleep 1
  done
  return 1
}
running() { adb shell pidof "$PKG" >/dev/null 2>&1; }
grant() { for p in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION POST_NOTIFICATIONS; do adb shell pm grant "$PKG" android.permission.$p >/dev/null 2>&1; done; }
launch() {
  adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 \
    || adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
}
fresh() { # clean start in 1+List
  adb shell am force-stop "$PKG"; launch; sleep "${1:-25}"
  # An update prompt would cover every screen; answer it with Later.
  if [ -n "$(find_text "Update now")" ]; then tap_text "Later"; sleep 2; fi
}
alive() { running && note "OK: app running ($1)" || note "PROBLEM: APP NOT RUNNING ($1)"; }
section() { note "===== $* ====="; }


# List helper: go to the top of the channel list first, then scroll down looking for the name.
list_tap() { # name...
  for i in 1 2 3 4 5 6 7 8 9 10; do adb shell input swipe 1660 350 1660 950 200; done; sleep 2
  scroll_tap 1660 "$@"
}
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb logcat -c
note "installing build 1288 (no-sign-in copy of the same commit)"
adb install -r -g "$QA_APK" >> "$LOG" 2>&1 || adb install -r "$QA_APK" >> "$LOG" 2>&1
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
grant; launch; sleep 40
fresh 20
if [ -z "$(find_text "Modes")" ]; then key KEYCODE_BACK; sleep 2; fi
tap_text "Modes" && { sleep 2; tap_text "1+List" && sleep 10; }

section "list from the top"
for i in 1 2 3 4 5 6 7 8 9 10; do adb shell input swipe 1660 350 1660 950 200; done; sleep 2
for i in 1 2 3 4 5 6; do shot "list-top-$i"; adb shell input swipe 1660 950 1660 450 600; sleep 2; done

section "channels small, then full screen by OK on the player"
for ch in "1|Spark TV One" "62|Spark Gurbani" "5|Spark Shayari" "47|Spark Auto" "32|Spark Auto Hindi" "64|Spark Sufi Qawwali"; do
  num="${ch%%|*}"; name="${ch#*|}"
  fresh 15
  if list_tap "$name"; then
    sleep 4; shot "ch$num-small-5s"; sleep 10; shot "ch$num-small-15s"
    adb shell input tap 700 600; note "tapped the player"
    sleep 3; shot "ch$num-full-3s"; sleep 8; shot "ch$num-full-11s"; sleep 15; shot "ch$num-full-26s"
    key KEYCODE_BACK; sleep 3
    alive "channel $num"
  else
    note "PROBLEM: channel $num ($name) is not in the channel list"
  fi
done

section "dial 62 and 1 from full screen"
fresh 15; adb shell input tap 700 600; sleep 6; shot dial-from-full
dial 62; sleep 3; shot dial-62-1s; sleep 10; shot dial-62-11s
dial 1; sleep 3; shot dial-1-1s; sleep 10; shot dial-1-11s; sleep 20; shot dial-1-31s
key KEYCODE_BACK; sleep 2

section "library favorites"
fresh 15
tap_text "Library" && sleep 6
tap_text "Punjabi" && { sleep 6; shot lib-punjabi
  # Hold on the first film's poster for 1.5 s (a long press, like holding OK).
  adb shell input swipe 1044 220 1044 220 1500; sleep 1; shot lib-after-hold
  key KEYCODE_BACK; sleep 3; }
shot lib-home-after-hold
tap_text "★ Favorites" "Favorites" && { sleep 4; shot lib-favorites; }
key KEYCODE_BACK; sleep 2
alive "library"

section "learn namaz steps"
fresh 15
tap_text "Iqra Quran" && sleep 8
scroll_tap 960 "Learn Namaz" && sleep 4
tap_text "How to pray" && { sleep 4
  # Teacher voice picker at the top of a step; Hamed is the default teacher.
  if [ -n "$(find_text "Hamed")" ]; then note "OK: teacher picker shows Hamed"; else note "PROBLEM: no teacher picker with Hamed on step 1"; fi
  for i in $(seq 1 15); do
    shot "step-$i-top"
    adb shell input swipe 960 900 960 300 500; sleep 1; shot "step-$i-more"
    scroll_tap 960 "Next" || break
    sleep 3
  done
  key KEYCODE_BACK; sleep 2; }
tap_text "Duas of namaz" && { sleep 4
  for i in $(seq 1 30); do adb shell input swipe 960 950 960 350 500; sleep 1
    if [ -n "$(find_text "Du'a-e-Qunut (in Witr)")" ]; then adb shell input swipe 960 700 960 450 500; sleep 1; shot duas-qunut; adb shell input swipe 960 900 960 500 500; sleep 1; shot duas-qunut-2; break; fi
  done; key KEYCODE_BACK; sleep 2; }
tap_text "Rak'at of the 5 prayers" && { sleep 4; shot rakat; adb shell input swipe 960 900 960 300 500; sleep 1; shot rakat-2; }
alive "quran"

section "app bazaar button in the top bar"
fresh 15
shot top-bar
if [ -n "$(find_text "App Bazaar")" ]; then note "OK: App Bazaar is on the screen"; tap_text "App Bazaar" && { sleep 6; shot app-bazaar-opened; key KEYCODE_BACK; sleep 3; }; else note "PROBLEM: no App Bazaar button on the start screen"; fi
alive "app bazaar button"

section "weather follows the theme, radar shows rain"
for th in "Emerald" "Royal" "Midnight"; do
  adb shell am force-stop "$PKG"
  printf '<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map><string name="theme">%s</string></map>\n' "$th" > /tmp/theme.xml
  adb push /tmp/theme.xml /data/local/tmp/theme.xml >/dev/null
  adb shell "run-as $PKG mkdir -p shared_prefs; run-as $PKG cp /data/local/tmp/theme.xml shared_prefs/theme.xml"
  adb shell run-as $PKG cat shared_prefs/theme.xml | grep -q "$th" || adb exec-in "run-as $PKG sh -c 'cat > shared_prefs/theme.xml'" < /tmp/theme.xml
  note "theme set to $th: $(adb shell run-as $PKG cat shared_prefs/theme.xml | tr -d '\n')"
  fresh 15
  tap_text "Weather" && { sleep 12; shot "weather-$th"
    tap_text "Maps" && { sleep 15; shot "weather-maps-$th"; }
    key KEYCODE_BACK; sleep 2; }
done
alive "weather themes"

section "azan clock weather tile"
fresh 15
tap_text "Iqra Quran" && sleep 8
scroll_tap 960 "Azan Clock" && { sleep 10; shot azan-clock; sleep 10; shot azan-clock-20s
  # The weather tile under "Next prayer" opens Cable TV's Weather; Back returns to Azan Clock.
  tap_text "Feels like" "Checking the weather…" "Weather can't be reached right now" && { sleep 10; shot azan-weather-opened; key KEYCODE_BACK; sleep 4; shot azan-after-back; }; }
alive "azan clock"

section "end"
adb logcat -d > "$OUT/logcat.txt"
grep -n "FATAL EXCEPTION\|ANR in\|Process: $PKG" "$OUT"/logcat*.txt > "$OUT/crashes-found.txt"
note "crash lines found: $(wc -l < "$OUT/crashes-found.txt")"
rm -f "$OUT/_tap.xml"
exit 0
