#!/usr/bin/env bash
# QA for the Free viewers' Info Corner screen (forced on in this QA build): screenshots over the promo slides.
set -u
OUT="$1"; APK="$2"; PKG=com.naseerbabar.livetv
mkdir -p "$OUT"; LOG="$OUT/steps.txt"; : > "$LOG"
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
shot() { adb exec-out screencap -p > "$OUT/$1.png" 2>/dev/null; note "screenshot $1 running=$(adb shell pidof $PKG >/dev/null && echo yes || echo NO)"; }
adb logcat -c
adb install -r "$APK" >> "$LOG" 2>&1
for p in ACCESS_COARSE_LOCATION ACCESS_FINE_LOCATION POST_NOTIFICATIONS; do adb shell pm grant "$PKG" android.permission.$p >/dev/null 2>&1; done
adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1
sleep 20; shot 01-start
# Back closes a start screen or dialog if one is up, without leaving the app.
sleep 5; shot 02-25s
sleep 10; shot 03-35s
sleep 10; shot 04-45s
sleep 10; shot 05-55s
sleep 15; shot 06-70s
sleep 20; shot 07-90s
adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 2; adb shell input keyevent KEYCODE_DPAD_RIGHT; sleep 2; shot 08-row-right
adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 10; shot 09-picked-channel
sleep 30; shot 10-later
adb logcat -d > "$OUT/logcat.txt"
grep -E "FATAL EXCEPTION|AndroidRuntime" -A20 "$OUT/logcat.txt" > "$OUT/crashes-found.txt" || echo "no crash" > "$OUT/crashes-found.txt"
