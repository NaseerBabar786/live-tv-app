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
Iqra Quran's text, translations, reciters and font (`qurankit/src/main/assets/quran`, `res/font`) and
logo (`docs/quran/logo.svg`) are copied the same way.

## Not on PC yet (second test build)

Browse, Carousel, Strip, Duo, News, CP24, Home and My Screen modes; Movies & Dramas (Library);
the 24 classic games (the PC has the two modern ones); Messages, Suggestions, promo codes and billing details. The Modes menu shows them as
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
- 1.9.99: Library YouTube films and episodes play inside Cable TV on our film page
  (`docs/channel/film.html`: pause, back and forward 10 s, a progress bar, goes on where it was left)
  instead of the YouTube app. The PC has no Library yet; when it gets one, it loads the same page.
- 1.10.0: phone touch fixes (swipes now change channel in full screen and on tiles; a tap on the tile
  with the sound opens it full screen). Phone-only; the PC uses its mouse and keyboard.
- 1.10.1: every Library list (Dramas, Movies, Free) is rebuilt every morning at about 5 am Toronto time and
  dates each programme (`added="..."`, `tools/first_seen.py`); the Library shows a "Newly added" chip, NEW marks
  and new titles first, in each language and section, on TV and phone (same APK). The PC has no Library yet;
  when it gets one, it reads the same `added` dates and shows the same Newly added section.

## In step

- 1.9.91 (PC 1.0.1): only Free and Gold packages; Free is fixed (every feature, only our own channels)
  and every package has at least that; old Silver and Platinum count as Gold (`plans.js`).
- 1.9.96 (PC 1.0.4): packages screen shows Free once (no "Free · free") and Gold at one price a month, $9.99 by default (`settings.js`, `plans.js`).
- 1.9.100 (PC 1.0.5): the start screen shows only a loading circle while the channels load; no sponsor
  or words, no 5-second countdown (`screens/start.js`).
- 1.10.2 (PC 1.0.6): Settings has "MTA channels" (off by default). When on, MTA's 8 live channels come
  right after our Bazaar channels as 16 to 23 (the other channels from 24), also in Favorites and in
  every language, and they are free in every package (`mta.js`, `channels.js`, `plans.js`).
- 1.10.3 (PC 1.0.7): two modern games, Block Burst and Color Pour, in a 🎮 Games screen. Both apps open the
  very same pages (`app/src/main/assets/games`, copied in by `scripts/prepare.js`; `screens/games.js`).
- 1.10.5 (PC 1.0.9): no YouTube screen ever shows (owner's rule, 2026-10-07). Our pages in a
  `<webview>` can't be taken to YouTube's own site (`main.js`), as on Android (`YouTube.blocksNavigation`).
  The locked YouTube pages themselves (player taller than its box, cover on errors) are the website's,
  shared by both apps. The Library's "open in the YouTube app" is gone on Android; the PC has no Library yet.
- 1.10.6 (PC 1.0.10): the welcome invitation. Every viewer who hasn't used promo code WELCOME gets "Try Gold free
  for one month" from the Cable TV team, with a one-press "Use code WELCOME" and a request for a good review. It pops
  up once per account (users/{uid}.welcomeAt) about 25 s after start; TV and phone keep it at the top of Messages,
  the PC (no Messages screen yet) in Settings. The PC also gets "🎟 Have a promo code?" in Settings (`welcome.js`,
  `screens/welcome.js`, `plans.redeem`).
- 1.10.7 (PC 1.0.11): Iqra Quran in the top bar: Kids Qaida, Read with recitation, Hifz, and Namaz (prayer timeline,
  Azan with muezzin choice, reminders), in Cable TV's colours (`screens/quran.js`, `prayer.js`, `azan.js`). On PC the
  Qaida letter sounds use Windows' own Arabic voice when it has one, and the Azan plays while the PC app is open
  (full screen, the channels paused), with a Windows notification for every prayer, chime, message and reminder. Translations: up to 3 of 60+ languages, each downloaded when picked (`docs/quran/tr`).
- 1.10.8: phones only. The phone app has no Games (the games are made for the TV remote; owner's rule 2026-10-08).
  Nothing changes on PC, which keeps its games like the TV.
- 1.10.9: TV remote only. The sign-in and Change password text boxes no longer trap the remote's cursor
  (Up/Down always leave them, OK opens the keyboard, yellow outline like buttons). The PC is typed on with a real
  keyboard and mouse, so nothing changes there.
- 1.10.10 (PC 1.0.12): new viewers, and viewers who never picked countries, start on every country of the
  working list (about 7,900 channels) instead of the Pakistani, Indian, Canadian, British and American mix.
  Same change on PC.
