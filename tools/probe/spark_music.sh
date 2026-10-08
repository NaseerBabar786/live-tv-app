#!/bin/bash
# Temporary: fetch chosen CC BY tracks from Wikimedia Commons in parallel and convert to mp3.
mkdir -p out/m; cd out/m
UA="CableTV-ad-maker/1.0 (https://tv.bulkbazaar.ca)"
cat > list.txt <<'L'
Infraction - Dance (Upbeat Creative Future Pop).ogg
Infraction – A.I. (Cyberpunk Energetic).opus
Infraction - Sax Beat (Funk Retro Upbeat).opus
Rafael Krux - Inspiring Advertising - Upbeat Summer Corporate (cc-by) (filmmusic).mp3
Justice And Fame by Rafael Krux.ogg
Everybody Up by Sascha Ende.mp3
New Start! - PIKASONIC-422729382.mp3
Jesse Spillane - 03 - Dance Rocket.ogg
Wepa (ISRC USUAN1700020).mp3
Fireball (Antti Luode).mp3
Lame Drivers - 03 - Bhangra outro.ogg
Upbeat Forever (ISRC USUAN1500063).mp3
Computer Music All-stars - Too Much Caffeine.ogg
DHOL BEAT.wav
L
i=0
while IFS= read -r t; do i=$((i+1)); n=$(printf "%02d" $i)
  ( u="https://commons.wikimedia.org/wiki/Special:FilePath/$(python3 -c 'import sys,urllib.parse;print(urllib.parse.quote(sys.argv[1].replace(" ","_")))' "$t")"
    curl -sSL -A "$UA" --retry 4 --retry-delay 5 --max-time 150 -o "$n.src" "$u" && ffmpeg -v error -y -i "$n.src" -t 240 -ac 2 -ar 44100 -b:a 192k "$n.mp3" && echo "$n|$t" >> got.txt; rm -f "$n.src"; echo "done $n $(stat -c%s $n.mp3 2>/dev/null)" ) &
  sleep 2
done < list.txt
wait; cat got.txt
