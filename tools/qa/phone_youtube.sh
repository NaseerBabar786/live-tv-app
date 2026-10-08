#!/usr/bin/env bash
# QA branch only: opens our YouTube channel pages in Cable TV's full-screen window and saves what shows.
set -u
OUT="$1"; APK="$2"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"
adb install -r "$APK" > "$OUT/install.txt" 2>&1
adb shell getprop ro.build.version.release > "$OUT/android.txt"
adb shell dumpsys package com.google.android.webview | grep versionName | head -2 >> "$OUT/android.txt"
adb shell dumpsys package com.android.webview | grep versionName | head -2 >> "$OUT/android.txt"
adb shell settings put secure immersive_mode_confirmations confirmed
run() { # name url ua
  adb logcat -c
  adb shell am force-stop "$PKG"
  adb shell am start -n "$PKG/com.livetv.app.WebChannelActivity" --es url "'$2'" --es qa_ua "$3" > "$OUT/$1-start.txt" 2>&1
  sleep 12; adb exec-out screencap -p > "$OUT/$1-12s.png"
  sleep 18; adb exec-out screencap -p > "$OUT/$1-30s.png"; sleep 16
  adb logcat -d -s QAWEB:I chromium:* cr_*:* > "$OUT/$1-log.txt" 2>&1
}
U="https://tv.bulkbazaar.ca/channel/ytc.html?c=music&app=1&v=999"
H="https://tv.bulkbazaar.ca/channel/bollywood.html?app=1&v=999"
run hits "$H" plain
run hits-nox "$H" nox
run music "$U" plain
run music-nox "$U" nox
run hits-nox2 "$H" nox
run hits2 "$H" plain
run music-nox2 "$U" nox
run music2 "$U" plain
