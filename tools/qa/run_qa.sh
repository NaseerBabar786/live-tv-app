#!/usr/bin/env bash
# Pop-up messages from the owner (2026-10-09), on Android TV emulators.
# Usage: run_qa.sh <out-dir> <no-sign-in-apk>
# The no-sign-in build has no account, so this branch adds a QA-only broadcast that shows a message
# (and fakes the send): adb shell am broadcast -a com.livetv.QA_MESSAGE --es text "..."
set -u
OUT="$1"; QA_APK="$2"
PKG=com.naseerbabar.livetv
mkdir -p "$OUT"
LOG="$OUT/steps.txt"; : > "$LOG"
N=0
note() { echo "$(date -u +%H:%M:%S) $*" | tee -a "$LOG"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1 && adb pull /sdcard/ui.xml "$1" >/dev/null 2>&1; }
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
}
alive() { running && note "OK: app running ($1)" || note "PROBLEM: APP NOT RUNNING ($1)"; }
section() { note "===== $* ====="; }

has() { [ -n "$(find_text "$@")" ]; }
check() { # name text...
  local n="$1"; shift
  if has "$@"; then note "PASS: $n"; else note "FAIL: $n (no '$*' on screen)"; fi
}
nocheck() { # name text...
  local n="$1"; shift
  if has "$@"; then note "FAIL: $n ('$*' still on screen)"; else note "PASS: $n"; fi
}
message() { adb shell am broadcast -a com.livetv.QA_MESSAGE -p "$PKG" --es text "'$1'" >/dev/null; note "sent message: $1"; sleep 4; }

adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb logcat -c

section "start"
adb install -r -g "$QA_APK" >> "$LOG" 2>&1 || adb install -r "$QA_APK" >> "$LOG" 2>&1
grant; launch
sleep 40; shot home
alive "start"
if [ -z "$(find_text "Modes")" ]; then key KEYCODE_BACK; sleep 2; fi
tap_text "Modes" && { sleep 2; tap_text "1+List"; sleep 15; }
shot one-plus-list

section "1 pop-up over 1+List, one-press answer"
message "Assalam o Alaikum! Your Gold package ends next week. Do you want to keep it?"
shot popup-1plus-list
check "pop-up shows over 1+List" "Message from the Cable TV team"
check "message text shows" "Your Gold package ends next week"
check "quick answers show" "👍 OK, got it" "OK, got it"
key KEYCODE_DPAD_CENTER
sleep 1; shot after-quick-answer
check "answer sent" "Sent to the Cable TV team"
sleep 3; shot popup-gone
nocheck "pop-up closes after answering" "Message from the Cable TV team"
alive "after quick answer"

section "2 Close with Back"
message "Second message: please restart your TV tonight."
shot popup-2
key KEYCODE_BACK; sleep 2; shot after-back
nocheck "Back closes the pop-up" "Message from the Cable TV team"
alive "after back"

section "3 full screen"
key KEYCODE_DPAD_CENTER; sleep 10; shot full-screen
message "Third message over the full-screen channel."
shot popup-full-screen
check "pop-up over full screen" "Message from the Cable TV team"
tap_text "Close" && { sleep 2; shot after-close; nocheck "Close button closes it" "Message from the Cable TV team"; }
alive "full screen"

section "4 our YouTube channel full screen (its own window)"
for n in 2 4 3; do
  dial "$n"; sleep 15; shot "channel-$n"
  case "$(top_activity)" in *WebChannelActivity*) break ;; esac
done
note "top: $(top_activity)"
message "Fourth message over a YouTube channel."
shot popup-web-channel
check "pop-up over the YouTube channel window" "Message from the Cable TV team"
key KEYCODE_DPAD_CENTER; sleep 1; shot web-after-answer
sleep 2; shot web-popup-gone
nocheck "web pop-up closes after answering" "Message from the Cable TV team"
alive "web channel"
key KEYCODE_BACK; sleep 3; shot back-from-web
nocheck "no pop-up left on the main screen" "Message from the Cable TV team"
alive "back from web channel"

section "5 restart keeps working"
adb shell am force-stop "$PKG"; launch; sleep 30; shot restart
message "Fifth message after a restart."
shot popup-after-restart
check "pop-up after restart" "Message from the Cable TV team"
key KEYCODE_BACK; sleep 2
alive "restart"

section "end"
grep -h "QA-MSG" <(adb logcat -d) | tee -a "$LOG"
adb logcat -d > "$OUT/logcat.txt"
adb logcat -b crash -d > "$OUT/crash.txt"
grep -n "FATAL EXCEPTION\|ANR in\|Application Not Responding" "$OUT"/logcat.txt > "$OUT/crashes-found.txt"
note "crash lines found: $(wc -l < "$OUT/crashes-found.txt")"
grep -c "^.*PASS" "$LOG" | xargs -I{} note "passes: {}"
grep "FAIL\|PROBLEM" "$LOG" | tee "$OUT/fails.txt"
rm -f "$OUT/_tap.xml"
exit 0
