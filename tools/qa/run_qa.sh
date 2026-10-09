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
}
alive() { running && note "OK: app running ($1)" || note "PROBLEM: APP NOT RUNNING ($1)"; }
section() { note "===== $* ====="; }

adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell getprop ro.build.version.release > "$OUT/android-version.txt"
adb shell dumpsys package com.google.android.webview 2>/dev/null | grep -m1 versionName > "$OUT/webview-version.txt"
adb logcat -c

# ---- 1. Start-up: the owner's test APK, fresh and as an update over the public version ----
section "1 start-up, test APK"
if [ -n "$PUBLIC_APK" ] && [ -f "$PUBLIC_APK" ]; then
  note "installing the public APK first"
  adb install -r "$PUBLIC_APK" >> "$LOG" 2>&1
  adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
  grant; launch; sleep 25; shot public-start
  adb shell am force-stop "$PKG"
fi
note "installing the test APK over it"
adb install -r "$TEST_APK" >> "$LOG" 2>&1 || { adb uninstall "$PKG" >> "$LOG" 2>&1; adb install -r "$TEST_APK" >> "$LOG" 2>&1; }
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
grant; launch
sleep 6;  shot test-start
sleep 25; shot test-after-30s
alive "test APK after 30 s"
adb shell am force-stop "$PKG"; launch; sleep 20; shot test-second-start
alive "test APK second start"
adb logcat -d > "$OUT/logcat-test-apk.txt"
adb uninstall "$PKG" >> "$LOG" 2>&1
adb logcat -c

# ---- The same code without sign-in ----
note "installing the no-sign-in APK"
adb install -r -g "$QA_APK" >> "$LOG" 2>&1 || adb install -r "$QA_APK" >> "$LOG" 2>&1
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
grant; launch
sleep 6;  shot qa-start-screen
sleep 30; shot qa-home
alive "no-sign-in start"
# The app may open in Browse; Back from Browse opens Modes. Make sure we're in 1+List.
fresh 20; shot qa-relaunch
if [ -z "$(find_text "Modes")" ]; then key KEYCODE_BACK; sleep 2; fi
tap_text "Modes" && { sleep 2; shot modes-menu; tap_text "1+List" && sleep 15; }
shot one-plus-list

# ---- 2. The channel list: numbers and language groups ----
section "2 channel list"
for i in $(seq 1 16); do
  dump "$OUT/list-page-$(printf '%02d' $i).xml"
  [ $((i % 3)) = 1 ] && shot "list-page-$i"
  adb shell input swipe 1660 950 1660 350 600; sleep 2
done

# ---- 3 + 4. Our new channels: small player (1+List) and full screen, with timed pictures ----
section "3 new channels + 4 fast start"
for ch in "5|Spark Shayari" "27|Spark Kavi Sammelan" "32|Spark Auto Hindi" "47|Spark Auto" "62|Spark Gurbani" "63|Spark Movies Punjabi" "64|Spark Sufi Qawwali" "1|Spark TV One" "81|MTA"; do
  num="${ch%%|*}"; name="${ch#*|}"
  fresh 18
  if scroll_tap 1660 "$name"; then
    sleep 1; shot "ch$num-small-1s"
    sleep 4; shot "ch$num-small-5s"
    sleep 10; shot "ch$num-small-15s"
    # OK on the playing channel opens it full screen.
    key KEYCODE_DPAD_CENTER
    sleep 2; shot "ch$num-full-3s"
    sleep 7; shot "ch$num-full-10s"
    sleep 15; shot "ch$num-full-25s"
    # Number buttons while full screen: go to the next channel by number (tests dialling too).
    alive "channel $num"
  else
    note "PROBLEM: channel $num ($name) not found in the list"
  fi
done
# Dialling numbers from full screen: 5 -> 27 -> 64 -> 101.
fresh 18
key KEYCODE_DPAD_CENTER; sleep 8; shot dial-start-full
for d in 5 27 64 101; do dial "$d"; sleep 4; shot "dial-$d-2s"; sleep 10; shot "dial-$d-12s"; done
alive "dialling"
# Multi-screen: 2x2 with our channels.
fresh 18
tap_text "Modes" && { sleep 2; tap_text "2×2" "2x2"; sleep 3; shot multi-2x2-3s; sleep 10; shot multi-2x2-13s; sleep 20; shot multi-2x2-33s; }
alive "2x2"
key KEYCODE_BACK; sleep 2; shot multi-after-back
tap_text "Modes" && { sleep 2; tap_text "1+3"; sleep 5; shot multi-1plus3-5s; sleep 15; shot multi-1plus3-20s; }
key KEYCODE_BACK; sleep 2
tap_text "Modes" && { sleep 2; tap_text "1+List"; sleep 3; }

# ---- 6. Library ----
section "6 library"
fresh 18
# The Library loads about 17k entries: keys pressed while it loads must still be answered (no ANR).
anr_before=$(adb logcat -d | grep -cE "ANR in com.naseerbabar")
tap_text "Library" && { for i in 1 2 3 4 5 6; do key KEYCODE_DPAD_RIGHT; sleep 0.5; key KEYCODE_DPAD_DOWN; sleep 0.5; done; sleep 4; shot library-home-after-keys
  if [ "$(adb logcat -d | grep -cE "ANR in com.naseerbabar")" -gt "$anr_before" ]; then note "FAIL: ANR while the Library loaded"; else note "OK: no ANR while pressing keys during Library load"; fi
  key KEYCODE_BACK; sleep 2; fresh 18; tap_text "Library"; sleep 6; shot library-home; }
tap_text "Urdu" && { sleep 6; shot library-urdu; tap_text "Shows" && { sleep 4; shot library-urdu-shows; scroll_tap 960 "Good Morning Pakistan" "Morning" && { sleep 4; shot library-urdu-morning; key KEYCODE_BACK; }; }; key KEYCODE_BACK; sleep 2; }
fresh 18; tap_text "Library"; sleep 6
tap_text "Hindi" && { sleep 6; shot library-hindi; tap_text "Shows" && { sleep 4; shot library-hindi-shows; scroll_tap 960 "Kapil" "Comedy" && { sleep 4; shot library-hindi-comedy; key KEYCODE_BACK; }; }; key KEYCODE_BACK; sleep 2; }
fresh 18; tap_text "Library"; sleep 6
tap_text "Punjabi" && { sleep 6; shot library-punjabi-movies; adb shell input swipe 960 900 960 400 400; sleep 2; shot library-punjabi-movies-2;
  # Hold OK on the focused film: it should go into Favorites.
  key KEYCODE_DPAD_DOWN; adb shell input keyevent --longpress KEYCODE_DPAD_CENTER; sleep 1; shot library-hold-ok; sleep 2
  tap_text "Series" && { sleep 4; shot library-punjabi-series; }
  tap_text "Shows" && { sleep 4; shot library-punjabi-shows; }
  key KEYCODE_BACK; sleep 2; key KEYCODE_BACK; sleep 2; }
fresh 18; tap_text "Library"; sleep 6; shot library-home-after-hold
tap_text "★ Favorites" "Favorites" && { sleep 4; shot library-favorites; }
alive "library"

# ---- 7. Games ----
section "7 games"
fresh 18
tap_text "Games" && { sleep 5; shot games-1; adb shell input swipe 960 900 960 300 500; sleep 2; shot games-2; adb shell input swipe 960 900 960 300 500; sleep 2; shot games-3; adb shell input swipe 960 900 960 300 500; sleep 2; shot games-4; }
alive "games"

# ---- 8. Weather ----
section "8 weather"
fresh 18
tap_text "Weather" && { sleep 12; shot weather-1; adb shell input swipe 960 900 960 300 500; sleep 3; shot weather-2;
  for t in "Maps" "Hourly" "14 Days" "News" "Video"; do tap_text "$t" && { sleep 6; shot "weather-$(echo $t | tr ' ' _)"; }; done; }
alive "weather"

# ---- 9. Iqra Quran: Learn Namaz ----
section "9 iqra quran"
fresh 18
tap_text "Iqra Quran" && { sleep 8; shot quran-home; }
scroll_tap 960 "Learn Namaz" "نماز سیکھیں" && { sleep 4; shot namaz-home; }
tap_text "How to pray" "نماز کا طریقہ" && { sleep 4; shot namaz-steps-1
  for i in $(seq 2 16); do
    tap_text "Next" "اگلا" || key KEYCODE_DPAD_RIGHT
    sleep 2; shot "namaz-steps-$i"
  done
  key KEYCODE_BACK; sleep 2; }
tap_text "Duas of namaz" "نماز کی دعائیں" && { sleep 4; shot namaz-duas
  scroll_tap 960 "Tashahhud (At-Tahiyyat)" "تشہد" && { sleep 4; shot namaz-tashahhud; adb shell input swipe 960 900 960 400 400; sleep 2; shot namaz-tashahhud-2; key KEYCODE_BACK; sleep 2; }
  scroll_tap 960 "Du'a-e-Qunut (in Witr)" "دعائے قنوت" && { sleep 4; shot namaz-qunut; adb shell input swipe 960 900 960 400 400; sleep 2; shot namaz-qunut-2; key KEYCODE_BACK; sleep 2; }
  key KEYCODE_BACK; sleep 2; }
tap_text "Rak'at of the 5 prayers" "پانچ نمازوں کی رکعتیں" && { sleep 4; shot namaz-rakat; key KEYCODE_BACK; sleep 2; }
alive "quran"

section "end"
adb logcat -d > "$OUT/logcat.txt"
adb logcat -b crash -d > "$OUT/crash.txt"
grep -n "FATAL EXCEPTION\|ANR in\|Application Not Responding\|Process: $PKG" "$OUT"/logcat*.txt > "$OUT/crashes-found.txt"
note "crash lines found: $(wc -l < "$OUT/crashes-found.txt")"
adb shell ls -l /data/anr >> "$LOG" 2>&1
rm -f "$OUT/_tap.xml"
exit 0
