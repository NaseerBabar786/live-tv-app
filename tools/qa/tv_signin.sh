#!/usr/bin/env bash
# Signs in to Cable TV on a TV emulator with only remote keys, the way a viewer does, and saves
# where the cursor is after every key. Usage: tv_signin.sh <out-dir> <apk> <source> <email> <password>
# <source> is "keyboard" (adb's default) or "dpad" (keys sent as a real TV remote's D-pad).
set -u
OUT="$1"; APK="$2"; SRC="$3"; EMAIL="$4"; PW="$5"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"; LOG="$OUT/steps.txt"; : > "$LOG"; N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
look() { # name: screenshot + which item has the cursor
  N=$((N+1)); local f; f=$(printf "%02d-%s" $N "$1")
  adb exec-out screencap -p > "$OUT/$f.png" 2>/dev/null
  adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$OUT/$f.xml" >/dev/null 2>&1
  local foc; foc=$(python3 - "$OUT/$f.xml" <<'PY'
import sys, xml.etree.ElementTree as ET
try: r = ET.parse(sys.argv[1]).getroot()
except Exception: print("(no dump)"); sys.exit()
hits = [n for n in r.iter("node") if n.get("focused") == "true"]
def label(n):
    t = n.get("text") or n.get("content-desc") or ""
    if not t:
        for c in n.iter("node"):
            t = c.get("text") or c.get("content-desc") or ""
            if t: break
    return f"{n.get('class')} '{t[:40]}'"
print(" / ".join(label(n) for n in hits) or "(nothing focused)")
PY
)
  local ime; ime=$(adb shell dumpsys input_method | grep -m1 -o "mInputShown=[a-z]*")
  note "$f: cursor on $foc; $ime"
}
key() { if [ "$SRC" = dpad ]; then adb shell input dpad keyevent "$1"; else adb shell input keyevent "$1"; fi; sleep 2; }

adb install -r -g "$APK" >> "$LOG" 2>&1
adb shell dumpsys package "$PKG" | grep -m1 versionName | tee -a "$LOG"
adb shell monkey -p "$PKG" -c android.intent.category.LEANBACK_LAUNCHER 1 >/dev/null 2>&1
sleep 30; look start
key KEYCODE_DPAD_DOWN; look down1
key KEYCODE_DPAD_CENTER; sleep 2; look ok-on-email
adb shell input text "$EMAIL"; sleep 2; look typed-email
key KEYCODE_DPAD_DOWN; look down-after-email
key KEYCODE_BACK; look back
key KEYCODE_DPAD_DOWN; look down2
key KEYCODE_DPAD_CENTER; sleep 2; look ok-on-password
adb shell input text "$PW"; sleep 2; look typed-password
key KEYCODE_DPAD_DOWN; look down3
key KEYCODE_BACK; look back2
key KEYCODE_DPAD_DOWN; look down4
key KEYCODE_DPAD_DOWN; look down5
key KEYCODE_DPAD_CENTER; sleep 15; look after-sign-in
adb shell pidof "$PKG" >/dev/null && note "app running" || note "APP NOT RUNNING"
adb logcat -d > "$OUT/logcat.txt"
adb uninstall "$PKG" >> "$LOG" 2>&1
exit 0
