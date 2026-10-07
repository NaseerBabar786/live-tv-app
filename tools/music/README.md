# Music for our videos

The owner asked on 2026-10-07 to replace the old home-made synth sound everywhere with good music.
`library.py` hands out real recordings with a free licence (CC BY 3.0, from Wikimedia Commons, copies on
the `sur-media` release). Every video that uses one shows the credit line from `library.credit()`.

| mood | track | used by |
|---|---|---|
| energetic | "Upbeat Sitar" by Antti Luode (130 BPM, stretched to 128 for the ads) | Cable TV Video Ads 1-4 |
| promo | "Psychedelic Crater" by Kevin MacLeod (120 BPM) | show promos (tools/promos), news opening |
| happy | "Happy sitar" by Antti Luode | Cable TV Video Ad 5 |
| calm | "Vadodora Chill Mix" by Kevin MacLeod | news bed, story videos |

Tempo and first downbeat were measured once, so `bed()` starts on a bar line and cuts stay on the beat.
Never put back the synthesized music generators (old tools/promos/music_gen.py and cinematic.py).
