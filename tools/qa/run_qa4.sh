#!/usr/bin/env bash
# Voice search (remote mic key), Spark headings and the TV top bar on an Android TV emulator (2026-10-10).
# Usage: run_qa4.sh <out-dir> <no-sign-in-apk>
set -u
OUT="$1"; QA_APK="$2"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"
LOG="$OUT/steps.txt"; : > "$LOG"
N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
dump() { timeout 45 adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && timeout 20 adb pull /sdcard/ui.xml "$1" >/dev/null 2>&1; }
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
(adb logcat -v time > "$OUT/logcat-live.txt" 2>&1 &)
note "installing the no-sign-in copy (PRs #433, #434, #436 merged on main)"
adb install -r "$QA_APK" >> "$LOG" 2>&1
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
note "speech services on this emulator: $(adb shell cmd package query-services -a android.speech.RecognitionService 2>/dev/null | grep -o 'packageName=[^ ]*' | tr '\n' ' ')"
note "speech screens on this emulator: $(adb shell cmd package query-activities -a android.speech.action.RECOGNIZE_SPEECH 2>/dev/null | grep -o 'packageName=[^ ]*' | sort -u | tr '\n' ' ')"
grant; launch; sleep 40
fresh 20
if [ -z "$(find_text "Modes")" ]; then key KEYCODE_BACK; sleep 2; fi
tap_text "Modes" && { sleep 2; tap_text "1+List" && sleep 10; }

section "top bar: names under icons, Cable TV name, clock, date and weather visible"
shot "topbar-midnight"
for th in "Emerald" "Royal" "Pure black"; do
  adb shell am force-stop "$PKG"
  printf '<?xml version="1.0" encoding="utf-8" standalone="yes" ?>\n<map><string name="theme">%s</string></map>\n' "$th" > /tmp/theme.xml
  adb push /tmp/theme.xml /data/local/tmp/theme.xml >/dev/null
  adb shell "run-as $PKG mkdir -p shared_prefs; run-as $PKG cp /data/local/tmp/theme.xml shared_prefs/theme.xml"
  fresh 20
  shot "topbar-$(echo $th | tr ' ' '-')"
done
# Back to the default theme, then walk the top bar with the remote so the focus highlight shows on each button.
adb shell "run-as $PKG rm -f shared_prefs/theme.xml"
fresh 20
for i in 1 2 3 4 5 6; do key KEYCODE_DPAD_UP; done
shot "topbar-focus-0"
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do key KEYCODE_DPAD_RIGHT; shot "topbar-focus-$i"; done

section "Spark headings in the channel list"
fresh 20
list_tap "SPARK URDU" "Spark Urdu" >/dev/null; shot "list-spark-urdu"
list_tap "SPARK HINDI" "Spark Hindi" >/dev/null; shot "list-spark-hindi"

section "search box after the mic"
fresh 20
tap_text "Search" && { sleep 2; shot "search-box-open"; key KEYCODE_DPAD_DOWN; shot "search-box-after-down"; key KEYCODE_BACK; }

section "voice search from the remote's search key (KEYCODE_SEARCH), permission not yet given"
adb shell pm revoke "$PKG" android.permission.RECORD_AUDIO >/dev/null 2>&1
fresh 20
key KEYCODE_SEARCH; sleep 3; shot "search-key-1"
tap_text "While using the app" "Allow" "Only this time" && sleep 3
shot "search-key-after-allow"
sleep 6; shot "search-key-listening-9s"
alive "search key"
key KEYCODE_BACK; sleep 2; shot "search-key-after-back"

section "voice search from the remote's voice/assistant key (KEYCODE_VOICE_ASSIST)"
fresh 20
key KEYCODE_VOICE_ASSIST; sleep 4; shot "voice-assist-key"
alive "voice assist key"
key KEYCODE_BACK; sleep 2
if ! running || [ "$(top_activity | cut -d/ -f1)" != "$PKG" ]; then launch; sleep 10; fi

section "voice search from the top-bar mic"
fresh 20
tap_text "Voice" "Voice search" && { sleep 4; shot "mic-button"; key KEYCODE_BACK; }
alive "mic button"

section "Google TV voice search sends a channel name (SEARCH intent)"
adb shell am start -a android.intent.action.SEARCH -n "$PKG/com.livetv.app.MainActivity" --es query "Spark Comedy" >> "$LOG" 2>&1
sleep 15; shot "search-intent-spark-comedy"
adb shell am start -a android.media.action.MEDIA_PLAY_FROM_SEARCH -n "$PKG/com.livetv.app.MainActivity" --es query "Spark Shayari" >> "$LOG" 2>&1
sleep 15; shot "play-from-search-spark-shayari"
alive "search intents"

section "end"
adb logcat -d > "$OUT/logcat.txt"
grep -n "FATAL EXCEPTION\|ANR in\|Process: $PKG" "$OUT"/logcat*.txt > "$OUT/crashes-found.txt"
grep -n -i "SpeechRecognizer\|RecognitionService\|speech" "$OUT/logcat.txt" | head -80 > "$OUT/speech-log.txt"
note "crash lines found: $(wc -l < "$OUT/crashes-found.txt")"
rm -f "$OUT/_tap.xml"
exit 0
