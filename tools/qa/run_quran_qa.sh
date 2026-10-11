#!/usr/bin/env bash
# Iqra Quran 1.4.3 on an emulator: update over the public 1.3.0, then open every home section,
# press Back through them, and look for crashes or freezes (ANR) in logcat.
# Usage: run_quran_qa.sh <out-dir> <new-apk> [public-apk]
set -u
OUT="$1"; NEW_APK="$2"; PUBLIC_APK="${3:-}"
PKG=com.naseerbabar.iqraquran
mkdir -p "$OUT"; LOG="$OUT/steps.txt"; : > "$LOG"; N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
dump() { timeout 45 adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && timeout 20 adb pull /sdcard/ui.xml "$1" >/dev/null 2>&1; }
shot() { N=$((N+1)); local f; f="$(printf '%03d' $N)-$1"; adb exec-out screencap -p > "$OUT/$f.png" 2>/dev/null; dump "$OUT/$f.xml"; note "screenshot $f running=$(running && echo yes || echo NO)"; }
running() { adb shell pidof "$PKG" >/dev/null 2>&1; }
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
tap_text() { local b; b=$(find_text "$@"); if [ -n "$b" ]; then adb shell input tap $b; note "tapped '$1' at $b"; sleep 4; return 0; fi; note "could not find '$*'"; return 1; }
scroll_tap() { for i in 1 2 3 4 5 6; do tap_text "$@" && return 0; adb shell input swipe 500 1500 500 700 400 2>/dev/null; adb shell input keyevent KEYCODE_DPAD_DOWN; sleep 1; done; return 1; }
back() { adb shell input keyevent KEYCODE_BACK; sleep 2; }
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1; sleep 8; }
grant() { for p in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION POST_NOTIFICATIONS; do adb shell pm grant "$PKG" android.permission.$p >/dev/null 2>&1; done; }
home() { for i in 1 2 3; do find_text "Kids Qaida" "بچوں کا قاعدہ" | grep -q . && return 0; back; find_text "Kids Qaida" "بچوں کا قاعدہ" | grep -q . && return 0; launch; done; }

adb logcat -c
if [ -n "$PUBLIC_APK" ] && [ -s "$PUBLIC_APK" ]; then
  note "install public $(basename "$PUBLIC_APK")"; adb install -r "$PUBLIC_APK" >>"$LOG" 2>&1; grant; launch; shot public-home
  # A setting to check it survives the update: switch the app language to Urdu if the button is there.
  adb shell am force-stop "$PKG"
fi
note "install new $(basename "$NEW_APK")"; adb install -r "$NEW_APK" >>"$LOG" 2>&1 || { note "INSTALL FAILED"; }
adb shell dumpsys package "$PKG" | grep -m2 -E 'versionName|versionCode' | tee -a "$LOG"
grant; launch; shot home-after-update

for sec in "Kids Qaida|بچوں کا قاعدہ" "Read Quran|قرآن پڑھیں" "Hifz|حفظ" "Azan Clock|اذان گھڑی" "Learn Namaz|نماز سیکھیں"; do
  en="${sec%%|*}"; ur="${sec##*|}"; home
  if scroll_tap "$en" "$ur"; then
    shot "$(echo "$en" | tr ' ' '-')"
    case "$en" in
      "Read Quran") tap_text "Al-Fatihah" "Al-Faatiha" "الفاتحة" "1" && { shot read-surah1; sleep 6; shot read-surah1-later; back; } ;;
      "Kids Qaida") adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 4; shot qaida-lesson; back ;;
      "Learn Namaz") adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 4; shot namaz-step; adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 3; back; back; ;;
      "Azan Clock") sleep 4; shot azan-later ;;
    esac
    back; shot "after-back-$(echo "$en" | tr ' ' '-')"
  fi
done
home; tap_text "Settings" "ترتیبات" && { shot settings; scroll_tap "Translation" "ترجمہ" && shot translation; back; back; }
# Fast Back presses (the freeze reported on 2026-10-10 was on Back).
home; scroll_tap "Learn Namaz" "نماز سیکھیں" && { adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 2; for i in 1 2 3 4 5; do adb shell input keyevent KEYCODE_BACK; sleep 0.3; done; sleep 5; }
launch; shot final

adb logcat -d > "$OUT/logcat.txt" 2>/dev/null
{ grep -n -E "FATAL EXCEPTION|ANR in $PKG|Process: $PKG" "$OUT/logcat.txt" || true; } > "$OUT/crashes-found.txt"
if [ -s "$OUT/crashes-found.txt" ]; then note "CRASHES/ANR FOUND"; else note "no crash or ANR in logcat"; echo "none" > "$OUT/crashes-found.txt"; fi
running && note "app still running at the end" || note "APP NOT RUNNING at the end"
