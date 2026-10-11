#!/bin/bash
# Installs App Bazaar before/after on the TV emulator and takes screenshots of the store and its Help page.
mkdir -p out
exec > >(tee -a out/run-log.txt) 2>&1
set -x
pwd
adb shell wm size > out/screen.txt; adb shell wm density >> out/screen.txt
shot() {
  timeout 180 adb install --no-streaming -r -t "$1" || timeout 180 adb install -r -t "$1"
  adb shell monkey -p com.naseerbabar.appbazaar -c android.intent.category.LEANBACK_LAUNCHER 1
  sleep 25
  adb exec-out screencap -p > "out/$2-store.png"
  adb shell input keyevent KEYCODE_DPAD_DOWN; adb shell input keyevent KEYCODE_DPAD_DOWN; sleep 2
  adb exec-out screencap -p > "out/$2-store-down.png"
  adb shell input keyevent KEYCODE_DPAD_CENTER; sleep 4
  adb exec-out screencap -p > "out/$2-detail.png"
  adb logcat -d -b crash > "out/$2-crash.txt"
  adb shell am force-stop com.naseerbabar.appbazaar
  adb uninstall com.naseerbabar.appbazaar
  adb logcat -c
}
shot before.apk before
shot appbazaar/build/outputs/apk/debug/appbazaar-debug.apk after
find out -empty -delete; ls -la out
