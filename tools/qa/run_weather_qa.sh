#!/usr/bin/env bash
# Spark Weather 1.0.0 on an emulator: install, open every tab, play a video, open Settings (theme, °F,
# morning forecast), fire the morning forecast, and look for crashes or freezes (ANR) in logcat.
# Usage: run_weather_qa.sh <out-dir> <apk>
set -u
OUT="$1"; APK="$2"
PKG=com.naseerbabar.sparkweather
mkdir -p "$OUT"; LOG="$OUT/steps.txt"; : > "$LOG"; N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
dump() { timeout 45 adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && timeout 20 adb pull /sdcard/ui.xml "$1" >/dev/null 2>&1; }
running() { adb shell pidof "$PKG" >/dev/null 2>&1; }
shot() { N=$((N+1)); local f; f="$(printf '%03d' $N)-$1"; adb exec-out screencap -p > "$OUT/$f.png" 2>/dev/null; dump "$OUT/$f.xml"; note "screenshot $f running=$(running && echo yes || echo NO)"; }
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
tap_text() { local b; b=$(find_text "$@"); if [ -n "$b" ]; then adb shell input tap $b; note "tapped '$1' at $b"; sleep 5; return 0; fi; note "could not find '$*'"; return 1; }
back() { adb shell input keyevent KEYCODE_BACK; sleep 2; }
launch() { adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1 || adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1; sleep 10; }
grant() { for p in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION POST_NOTIFICATIONS; do adb shell pm grant "$PKG" android.permission.$p >/dev/null 2>&1; done; }
# The tab row scrolls sideways on phones: swipe it left when a tab is off screen.
tab_tap() { tap_text "$@" && return 0; local b; b=$(find_text "Hourly"); [ -n "$b" ] || return 1; set -- "$@"; local y=${b#* }; adb shell input swipe 900 $y 150 $y 300; sleep 2; tap_text "$@"; }
weather() { find_text "☀️ Weather" | grep -q . || { back; find_text "☀️ Weather" | grep -q . || launch; }; tap_text "☀️ Weather" >/dev/null; }

adb logcat -c
note "install $(basename "$APK")"; adb install -r "$APK" >>"$LOG" 2>&1 || note "INSTALL FAILED"
adb shell dumpsys package "$PKG" | grep -m2 -E 'versionName|versionCode' | tee -a "$LOG"
grant; launch; sleep 10; shot home
for tab in "Hourly" "7 Days" "14 Days" "Maps" "News" "Video"; do
  weather
  if tab_tap "$tab"; then sleep 6; shot "tab-$(echo "$tab" | tr ' ' '-')"; fi
done
# A weather video plays in our locked film page, then Back comes back to the app.
weather; if tab_tap "Video"; then sleep 8; tap_text " h ago" " d ago" " m ago" "ago"; sleep 20; shot video-playing; back; sleep 3; shot after-video; fi
weather
if tap_text "⚙ Settings" "Settings"; then
  shot settings
  tap_text "Pure black" && shot theme-pure-black
  tap_text "°F" && shot unit-f
  tap_text "7:00 am" && shot morning-7
  back; sleep 3; shot back-from-settings
fi
# The morning forecast notification, fired now instead of waiting for 7 am.
# The receiver is not exported (only the app's own alarm reaches it), so the shell needs root to fire it.
adb root >/dev/null 2>&1; sleep 4; adb wait-for-device
adb shell am broadcast -n "$PKG/com.sparkweather.app.MorningForecast" >>"$LOG" 2>&1; sleep 45
adb logcat -d -s MorningForecast | tee -a "$LOG"
adb shell cmd statusbar expand-notifications; sleep 3; shot notifications; adb shell cmd statusbar collapse; sleep 2
adb shell dumpsys notification --noredact 2>/dev/null | grep -A3 "pkg=$PKG" | head -20 | tee "$OUT/notification.txt" >>"$LOG"
adb shell dumpsys notification --noredact 2>/dev/null | grep -m3 "android.title=\|android.text=" | tee -a "$OUT/notification.txt" >>"$LOG"
# The widget provider runs its update (the home screen draws it on a real phone).
adb shell am broadcast -a android.appwidget.action.APPWIDGET_UPDATE -n "$PKG/com.sparkweather.app.WeatherWidget" --eia appWidgetIds 1 >>"$LOG" 2>&1; sleep 15
# Back out of the app, then open it again: the theme and °F must still be there.
for i in 1 2 3; do adb shell input keyevent KEYCODE_BACK; sleep 0.4; done; sleep 4
launch; sleep 8; shot reopened

adb logcat -d > "$OUT/logcat.txt" 2>/dev/null
{ grep -n -E "FATAL EXCEPTION|ANR in $PKG|Process: $PKG" "$OUT/logcat.txt" || true; } > "$OUT/crashes-found.txt"
if [ -s "$OUT/crashes-found.txt" ]; then note "CRASHES/ANR FOUND"; else note "no crash or ANR in logcat"; echo "none" > "$OUT/crashes-found.txt"; fi
running && note "app still running at the end" || note "APP NOT RUNNING at the end"
