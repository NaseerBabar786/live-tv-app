# Cable TV for PC: in step with Cable TV

Owner's rule (2026-10-07): every Cable TV feature goes to every platform together: the TV app,
this PC app, the phone app, and any platform added later. The check `parity.yml`
(`tools/parity_check.py`, platforms in `.github/platforms.json`) fails a pull request that changes
Cable TV (`app/src/main`, `app/src/livetv`, or its version) without changing this folder.

When Cable TV changes:

1. Make the same change here (the files say which Kotlin file each one follows), and raise
   `version` in `package.json`.
2. Set `"matches"` in `parity.json` to the new Cable TV version.
3. If the change doesn't apply to the PC (a TV-only fix, a change for another app that shares
   `app/src/main`), add a line below saying so instead.

Website code shared with the PC app (`docs/channel/schedule.js`, `cards.js`, `clock.js`) is copied in
at every build (`scripts/prepare.js`); changing it needs a new PC version too.

## Not on PC yet (second test build)

Browse, Carousel, Strip, Duo, News, CP24, Home and My Screen modes; Movies & Dramas (Library);
Games; Messages, Suggestions, promo codes and billing details. The Modes menu shows them as
"coming soon on PC".

## Changes that needed nothing on PC

- 1.9.89: ad breaks in Library films. The PC has no Library yet; the PC's breaks already follow the
  5-second ad length rule and keep paid sponsors off YouTube content (our YouTube pages run their own
  promo breaks).
- 1.9.90: phone touch layouts (upright 1+List, sideways full screen). Phone-only; the PC keeps its mouse
  and keyboard layout.
- YouTube channels never paused on YouTube's screen (docs/channel/keepplaying.js): the PC loads the
  same live pages (ytc.html, yt.html, bollywood.html), so it gets the fix without a new PC build.
- 1.9.94: Settings > My playlists no longer has "Find playlists online" or "+ Add playlist link".
  The PC never had playlist settings, so nothing to remove here.
- 1.9.95: Library YouTube films and episodes play inside Cable TV on our film page
  (`docs/channel/film.html`: pause, back and forward 10 s, a progress bar, goes on where it was left)
  instead of the YouTube app. The PC has no Library yet; when it gets one, it loads the same page.

## In step

- 1.9.91 (PC 1.0.1): only Free and Gold packages; Free is fixed (every feature, only our own channels)
  and every package has at least that; old Silver and Platinum count as Gold (`plans.js`).
