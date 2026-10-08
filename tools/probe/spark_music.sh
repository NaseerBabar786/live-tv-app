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
    curl -sSL -A "$UA" --retry 4 --retry-delay 5 --max-time 150 -o "$n.${t##*.}" "$u" && echo "$n|$t" >> got.txt; echo "done $n" ) &
  sleep 2
done < list.txt
wait; cat got.txt || true; ls -la
# licence and artist for each file
python3 - <<'P'
import json,urllib.request,urllib.parse
out={}
for l in open('got.txt'):
    n,t=l.rstrip('\n').split('|',1)
    q=urllib.parse.urlencode(dict(action='query',format='json',titles='File:'+t,prop='imageinfo',iiprop='url|extmetadata'))
    d=json.loads(urllib.request.urlopen(urllib.request.Request('https://commons.wikimedia.org/w/api.php?'+q,headers={'User-Agent':'CableTV-ad-maker/1.0 (https://tv.bulkbazaar.ca)'}),timeout=60).read())
    md=list(d['query']['pages'].values())[0]['imageinfo'][0]['extmetadata']
    out[n]={k:md.get(k,{}).get('value') for k in ['LicenseShortName','Artist','ObjectName','Credit','AttributionRequired','UsageTerms']}
    out[n]['title']=t
json.dump(out,open('meta.json','w'),ensure_ascii=False,indent=1)
P
