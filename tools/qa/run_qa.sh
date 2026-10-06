#!/usr/bin/env bash
# Drives Free Live TV on an emulator and saves screenshots, screen dumps and a crash report.
# Usage: run_qa.sh <out-dir> <release-apk> <no-sign-in-apk>
# The release APK is the one viewers install; it stops at Google sign-in. The second APK is the
# same code built without the sign-in secret, so the app skips sign-in and every screen can be reached.
set -u
OUT="$1"; RELEASE_APK="$2"; QA_APK="$3"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"
LOG="$OUT/steps.txt"
: > "$LOG"

note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
shot() { # name
  adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/$1.xml" >/dev/null 2>&1
  note "screenshot $1"
}
key() { adb shell input keyevent "$@"; sleep 1; }
# Taps the centre of the first on-screen element whose text or description matches.
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  adb pull /sdcard/ui.xml "$OUT/_tap.xml" >/dev/null 2>&1
  local b
  b=$(python3 - "$OUT/_tap.xml" "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
try:
    root = ET.parse(sys.argv[1]).getroot()
except Exception:
    sys.exit(0)
want = sys.argv[2].lower()
for n in root.iter("node"):
    t = (n.get("text") or "") + "|" + (n.get("content-desc") or "")
    if want in t.lower():
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds")))
        print((x1 + x2) // 2, (y1 + y2) // 2)
        break
PY
)
  if [ -n "$b" ]; then adb shell input tap $b; note "tapped '$1' at $b"; sleep 2; return 0; fi
  note "could not find '$1' on screen"; return 1
}
running() { adb shell pidof "$PKG" >/dev/null 2>&1; }
grant() {
  for p in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION POST_NOTIFICATIONS; do
    adb shell pm grant "$PKG" android.permission.$p >/dev/null 2>&1
  done
}
launch() {
  adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 \
    || adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
}

adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb shell getprop ro.build.version.release > "$OUT/android-version.txt"
adb shell wm size > "$OUT/screen-size.txt"
adb logcat -c

# ---- Part 1: the release APK viewers download ----
note "installing release APK"
adb install -r -g "$RELEASE_APK" >> "$LOG" 2>&1 || adb install -r "$RELEASE_APK" >> "$LOG" 2>&1
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
grant
launch
sleep 6;  shot 01-release-start
sleep 20; shot 02-release-sign-in
running && note "release app still running after 26 s" || note "RELEASE APP NOT RUNNING"
adb logcat -d > "$OUT/logcat-release.txt"
adb logcat -b crash -d > "$OUT/crash-release.txt"
adb uninstall "$PKG" >> "$LOG" 2>&1
adb logcat -c

# ---- Part 2: same code without sign-in ----
note "installing no-sign-in APK"
adb install -r -g "$QA_APK" >> "$LOG" 2>&1 || adb install -r "$QA_APK" >> "$LOG" 2>&1
grant
launch
sleep 5;  shot 03-start-screen
sleep 35; shot 04-home
# OK on the focused channel opens it full screen.
key KEYCODE_DPAD_CENTER
sleep 12; shot 05-player
# The owner's own channels by number: 0, 00, 000, 0000.
for n in 1 2 3 4; do
  # All digits in one command, so a slow emulator can't split "00" into two separate "0"s.
  adb shell input keyevent $(for i in $(seq $n); do printf "KEYCODE_0 "; done)
  sleep 4;  shot "06-channel-$(printf '0%.0s' $(seq $n))-dial"
  sleep 12; shot "07-channel-$(printf '0%.0s' $(seq $n))"
done
key KEYCODE_BACK
sleep 3; shot 08-after-back
key KEYCODE_BACK
sleep 3; shot 09-modes
key KEYCODE_BACK
sleep 3; shot 10-back-again
# Settings: the gear button.
launch; sleep 3
tap_text "Settings" && { sleep 3; shot 11-settings; key KEYCODE_BACK; }
running && note "app still running at the end" || note "APP NOT RUNNING AT THE END"
adb logcat -d > "$OUT/logcat.txt"
adb logcat -b crash -d > "$OUT/crash.txt"
grep -n "FATAL EXCEPTION\|ANR in $PKG\|Process: $PKG" "$OUT"/logcat*.txt > "$OUT/crashes-found.txt"
note "crash lines found: $(wc -l < "$OUT/crashes-found.txt")"
rm -f "$OUT/_tap.xml"
exit 0
