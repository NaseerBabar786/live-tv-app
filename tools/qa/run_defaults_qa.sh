#!/usr/bin/env bash
# Default settings check on the TV emulator. Usage: run_defaults_qa.sh <out> <main-apk> <new-apk>
# 1) fresh install of the new build: languages must be English/Hindi/Urdu/Punjabi, all countries.
# 2) Settings > Default settings works without a crash.
# 3) update from main's build over the top: the viewer's saved settings must not change.
set -u
OUT="$1"; MAIN_APK="$2"; NEW_APK="$3"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"; LOG="$OUT/steps.txt"; : > "$LOG"
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
shot() { adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null; adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/$1.xml" >/dev/null 2>&1; note "screenshot $1"; }
key() { adb shell input keyevent "$@"; sleep 1; }
tap_text() {
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml "$OUT/_tap.xml" >/dev/null 2>&1
  local b; b=$(python3 - "$OUT/_tap.xml" "$1" <<'PY'
import re, sys, xml.etree.ElementTree as ET
try: root = ET.parse(sys.argv[1]).getroot()
except Exception: sys.exit(0)
want = sys.argv[2].lower()
for n in root.iter("node"):
    t = (n.get("text") or "") + "|" + (n.get("content-desc") or "")
    if want in t.lower():
        x1, y1, x2, y2 = map(int, re.findall(r"\d+", n.get("bounds"))); print((x1 + x2) // 2, (y1 + y2) // 2); break
PY
)
  if [ -n "$b" ]; then adb shell input tap $b; note "tapped '$1' at $b"; sleep 2; return 0; fi
  note "could not find '$1' on screen"; return 1
}
running() { adb shell pidof "$PKG" >/dev/null 2>&1; }
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1 || adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; }
prefs() { adb shell run-as "$PKG" cat shared_prefs/live_tv.xml > "$OUT/$1.xml" 2>&1; note "prefs $1:"; grep -iE 'languages|playlist_source|defaults_v1|<string>' "$OUT/$1.xml" | tee -a "$LOG"; }
settings() { # opens Settings from a clean launch
  adb shell am force-stop "$PKG"; launch; sleep 25
  key KEYCODE_BACK; sleep 2  # Browse/full screen -> step out
  tap_text "Settings" || { key KEYCODE_BACK; sleep 2; tap_text "Settings"; }
  sleep 3
}
for s in window_animation_scale transition_animation_scale animator_duration_scale; do adb shell settings put global $s 0; done
adb logcat -c

note "== 1. fresh install of the new build"
adb install -r -g "$NEW_APK" >> "$LOG" 2>&1
launch; sleep 30; shot 01-fresh-start
prefs prefs-01-fresh
grep -q 'English' "$OUT/prefs-01-fresh.xml" && grep -q 'Punjabi' "$OUT/prefs-01-fresh.xml" && note "PASS fresh install has the 4 default languages" || note "FAIL fresh install languages"
settings; shot 02-settings
for i in 1 2 3 4 5 6; do key KEYCODE_DPAD_DOWN; done; shot 02b-settings-scrolled

note "== 2. change languages by hand, then Default settings"
adb shell am force-stop "$PKG"
adb shell "run-as $PKG sed -i -e 's#<string>Hindi</string>##' -e 's#<string>Urdu</string>##' -e 's#<string>Punjabi</string>##' shared_prefs/live_tv.xml"
prefs prefs-02-only-english
grep -q 'Hindi' "$OUT/prefs-02-only-english.xml" && note "FAIL could not change languages for the test" || note "OK languages changed to English only"
settings; shot 03-settings-only-english
tap_text "Default settings"; shot 04-confirm
tap_text "Yes, use defaults"; sleep 10; shot 05-after-defaults
running && note "PASS running after Default settings" || note "FAIL NOT RUNNING after Default settings"
prefs prefs-03-after-defaults
grep -q 'Hindi' "$OUT/prefs-03-after-defaults.xml" && grep -q 'Punjabi' "$OUT/prefs-03-after-defaults.xml" && note "PASS Default settings brought back the 4 languages" || note "FAIL Default settings languages"
settings; shot 06-settings-after-defaults
adb logcat -d > "$OUT/logcat-new.txt"

note "== 3. update over main's build keeps settings"
adb uninstall "$PKG" >> "$LOG" 2>&1; adb logcat -c
adb install -r -g "$MAIN_APK" >> "$LOG" 2>&1
launch; sleep 30; shot 07-main-start
prefs prefs-04-main
adb shell am force-stop "$PKG"
adb install -r -g "$NEW_APK" >> "$LOG" 2>&1
launch; sleep 30; shot 08-updated-start
running && note "PASS updated app running" || note "FAIL updated app NOT running"
prefs prefs-05-updated
grep -q 'name="languages"' "$OUT/prefs-05-updated.xml" && note "FAIL update wrote languages over the viewer's settings" || note "PASS update kept the viewer's languages (all languages)"
adb logcat -d > "$OUT/logcat-update.txt"
adb logcat -b crash -d > "$OUT/crash.txt"
grep -n "FATAL EXCEPTION\|ANR in\|Process: $PKG" "$OUT"/logcat*.txt > "$OUT/crashes-found.txt"
note "crash lines found: $(wc -l < "$OUT/crashes-found.txt")"
rm -f "$OUT/_tap.xml"; exit 0
