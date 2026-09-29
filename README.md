# Live TV (Android)

A native Android app for watching live TV channels from an M3U / M3U8 playlist.
Kotlin, Jetpack Compose and Media3 ExoPlayer.

## Features

- Channel grid with logos, group filter chips, search and pull to refresh
- Favorites (tap the star or long-press a channel)
- Full-screen player for HLS (`.m3u8`), DASH (`.mpd`) and MPEG-TS / progressive streams
- Previous / next channel buttons, plus Channel Up/Down on TV remotes
- Picture-in-picture when you leave the app while watching
- Playlist from a URL or a file on the device; the last downloaded playlist is cached for offline start
- Per-channel `http-user-agent` and `http-referrer` from `#EXTVLCOPT` lines
- Installs on phones, tablets and Android TV (leanback launcher entry)

The app ships with a small sample playlist of public test streams published by
streaming vendors (`app/src/main/assets/sample.m3u`). Use **Settings** in the
app to load your own playlist. Only use playlists you have the right to watch.

## Build

Requirements: JDK 17+ and the Android SDK (Android Studio installs both).

```bash
./gradlew assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk
```

Or open the folder in Android Studio and press Run.

Install on a connected device:

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Project layout

```
app/src/main/java/com/livetv/app/
  MainActivity.kt            screen switching, TV remote keys, picture-in-picture
  data/Channel.kt            channel model
  data/M3uParser.kt          M3U / EXTINF parser
  data/ChannelRepository.kt  playlist loading, cache, favorites, settings
  ui/MainViewModel.kt        UI state, search, filters, channel zapping
  ui/ChannelListScreen.kt    channel grid
  ui/SettingsDialog.kt       playlist URL / file picker
  player/StreamPlayer.kt     ExoPlayer setup, stream type detection, error handling
  player/PlayerScreen.kt     full-screen player UI
```

Parser tests: `./gradlew testDebugUnitTest`
