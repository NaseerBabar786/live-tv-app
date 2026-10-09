#!/usr/bin/env bash
# The TV extras (guide, reminders, last channel, sleep timer, widgets, profiles, report, screensaver, home
# screen) on an Android TV emulator, with screenshots (2026-10-09).
# Usage: run_extras.sh <out-dir> <no-sign-in-apk> [public-apk]
# The no-sign-in APK is this branch built without the sign-in secret (every feature, no packages).
set -u
OUT="$1"; QA_APK="$2"; PUBLIC_APK="${3:-}"
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

crashes() { adb logcat -d | grep -A30 "FATAL EXCEPTION" > "$OUT/crashes-found.txt"; [ -s "$OUT/crashes-found.txt" ] && note "PROBLEM: crash found ($1)" || note "OK: no crash ($1)"; }

# ---- 0. Update over the public version keeps settings ----
if [ -n "$PUBLIC_APK" ] && [ -f "$PUBLIC_APK" ]; then
  section "0 update over the public version"
  adb install -r "$PUBLIC_APK" >> "$LOG" 2>&1
  grant; launch; sleep 30; shot public-start
  adb shell am force-stop "$PKG"
fi
note "installing the no-sign-in APK"
adb install -r -g "$QA_APK" >> "$LOG" 2>&1 || { adb uninstall "$PKG" >> "$LOG" 2>&1; adb install -r -g "$QA_APK" >> "$LOG" 2>&1; }
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
grant; launch; sleep 35; shot start
alive "start"
fresh 20
if [ -z "$(find_text "Modes")" ]; then key KEYCODE_BACK; sleep 2; fi
tap_text "Modes" && { sleep 2; tap_text "1+List" && sleep 12; }
shot one-plus-list-top-bar

# ---- 1. TV guide + reminder ----
section "1 guide"
tap_text "Guide" && {
  sleep 10; shot guide
  key KEYCODE_DPAD_RIGHT; key KEYCODE_DPAD_RIGHT; shot guide-right-2
  key KEYCODE_DPAD_CENTER; sleep 2; shot guide-ok-later-show
  key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_DOWN; key KEYCODE_DPAD_DOWN; shot guide-down-3
  tap_text "Later ▶" && { sleep 3; shot guide-later; }
  key KEYCODE_BACK; sleep 3; shot guide-back
}
alive "guide"

# ---- 2. Settings: TV extras ----
section "2 settings"
tap_text "Settings" && {
  sleep 3
  scroll_tap 960 "Sleep timer" && { sleep 2; shot sleep-dialog; tap_text "15 minutes"; sleep 2; }
  tap_text "Settings"; sleep 3
  scroll_tap 960 "Widgets on full screen" && { sleep 2
    for w in "Clock and weather" "Next Azan" "Cricket score" "Gold and dollar rates" "Up next"; do tap_text "$w"; done
    shot widgets-dialog; tap_text "Done"; sleep 2; }
  tap_text "Settings"; sleep 3
  scroll_tap 960 "Family profiles" && { sleep 2; shot profiles-dialog
    tap_text "＋ Add a profile" "Add a profile" && { sleep 2; shot profiles-add; tap_text "Dad"; sleep 2; shot profiles-two; }
    tap_text "Done"; sleep 2; }
}
alive "settings"

# ---- 3. Full screen: widgets, channel bar, last channel ----
section "3 full screen"
fresh 20
key KEYCODE_DPAD_CENTER; sleep 25; shot full-widgets-25s
key KEYCODE_DPAD_CENTER; sleep 1; shot full-channel-bar
dial 5; sleep 12; shot full-dial-5
adb shell input keyevent KEYCODE_LAST_CHANNEL; sleep 10; shot full-last-channel
note "home screen card:"; adb shell content query --uri content://android.media.tv/watch_next_program --projection title:intent_uri >> "$LOG" 2>&1
adb shell content query --uri content://android.media.tv/preview_program --projection title >> "$LOG" 2>&1 | head -5
alive "full screen"
crashes "full screen"

# ---- 4. Report a channel in 1+List (hold OK) ----
section "4 report"
fresh 20
adb shell input keyevent --longpress KEYCODE_DPAD_CENTER; sleep 2; shot hold-ok-menu
tap_text "Channel not working" && { sleep 2; shot after-report; }
alive "report"

# ---- 5. Who's watching (two profiles) ----
section "5 profiles"
fresh 35; shot whos-watching
tap_text "Dad" && { sleep 8; shot dad-profile; }
alive "profiles"

# ---- 6. Voice search button ----
section "6 voice"
tap_text "Voice search" && { sleep 4; shot voice-search; key KEYCODE_BACK; sleep 2; }
alive "voice"

# ---- 7. Home screen ----
section "7 home"
key KEYCODE_HOME; sleep 6; shot launcher-home
launch; sleep 15

# ---- 8. Screensaver: 11 minutes in Weather, no button ----
section "8 screensaver"
tap_text "Weather" && { sleep 660; shot screensaver-11min; key KEYCODE_DPAD_CENTER; sleep 3; shot screensaver-closed; }
alive "screensaver"



crashes "end"
adb logcat -d > "$OUT/logcat.txt"
note "done"
