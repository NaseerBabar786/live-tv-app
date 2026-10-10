#!/bin/bash
# Spark TV on an emulator: install, open, watch a channel, move around, open Settings; screenshots + crashes.
out=$1; apk=$2; pkg=ca.bulkbazaar.sparktv
mkdir -p "$out"
shot() { adb exec-out screencap -p > "$out/$1.png"; }
alive() { adb shell pidof $pkg > /dev/null && echo "$1: running" >> "$out/steps.txt" || echo "$1: NOT RUNNING" >> "$out/steps.txt"; }
key() { adb shell input keyevent "$1"; sleep "${2:-2}"; }
adb logcat -c
adb install -r "$apk" > "$out/install.txt" 2>&1
cat "$out/install.txt"; grep -q Success "$out/install.txt" || { echo "INSTALL FAILED" >> "$out/steps.txt"; }
adb shell monkey -p $pkg -c android.intent.category.LEANBACK_LAUNCHER 1 > /dev/null 2>&1 || adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1
sleep 45; shot 01-start; alive start
sleep 30; shot 02-after-75s; alive after-75s
key KEYCODE_DPAD_DOWN 3; shot 03-down
key KEYCODE_DPAD_CENTER 25; shot 04-ok-channel; alive ok-channel
key KEYCODE_CHANNEL_UP 20; shot 05-channel-up
key KEYCODE_DPAD_DOWN 15; shot 06-down-in-player
# Number keys while watching: 2 Classics, 3 Comedy, 4 Sports, 5 Travel, 6 Music (each needs to play).
for n in 1 2 3 4; do sleep 60; shot 06-one-$n; alive one-$n; done
key KEYCODE_BACK 5; shot 07-back; alive back
for i in 1 2 3 4 5 6; do key KEYCODE_DPAD_DOWN 2; done; shot 08-list-bottom
key KEYCODE_DPAD_CENTER 30; shot 09-last-channel; alive last-channel
key KEYCODE_BACK 4
key KEYCODE_MENU 4; shot 10-menu
key KEYCODE_BACK 3
adb shell am force-stop $pkg; sleep 2
adb shell monkey -p $pkg -c android.intent.category.LEANBACK_LAUNCHER 1 > /dev/null 2>&1 || adb shell monkey -p $pkg -c android.intent.category.LAUNCHER 1
sleep 40; shot 11-second-start; alive second-start
adb shell dumpsys package $pkg | grep -m3 -E "versionName|versionCode" > "$out/version.txt"
adb logcat -d > "$out/logcat.txt"
grep -E "FATAL EXCEPTION|ANR in $pkg|Process: $pkg" -A25 "$out/logcat.txt" > "$out/crashes-found.txt" || echo "No crash found" > "$out/crashes-found.txt"
grep -iE "youtube|googlevideo" "$out/logcat.txt" | head -20 > "$out/youtube-lines.txt"
cat "$out/steps.txt" "$out/crashes-found.txt" | head -60
