# Live Cam (Android phone + Google TV)

Watch CCTV and IP cameras live, like the Wyze app, straight from the cameras on your
network. Kotlin, Jetpack Compose and Media3 ExoPlayer (RTSP + HLS).

## Features

- Home screen plays every camera live in a grid (muted, uses the substream when set)
- Tap a camera, or press OK on the TV remote, for full screen with sound
- Next / previous camera: swipe on a phone, Up/Down or Channel Up/Down on a TV remote
- Add a camera by brand and IP address; the RTSP address is filled in for
  Hikvision, Dahua / Amcrest / Lorex, Reolink, Tapo, Uniview, docker-wyze-bridge
  and generic ONVIF cameras, or paste any rtsp:// or http(s):// address
- Username and password per camera (RTSP Basic and Digest login)
- RTSP over TCP by default, low-latency buffering, automatic reconnect
- Screen stays on while the app is open, for a camera wall on the TV
- Camera list is saved only on the device

Wyze cameras have no public stream API. To use them, run
[docker-wyze-bridge](https://github.com/mrlt8/docker-wyze-bridge) on a computer or NAS and
pick "Wyze (docker-wyze-bridge)" with that machine's IP.

## Build

```bash
./gradlew :livecam:assembleDebug
# APK: livecam/build/outputs/apk/debug/livecam-debug.apk
./gradlew :livecam:testDebugUnitTest
```

CI builds the APK on every push; on `main` it is published as the `livecam-v<version>`
GitHub release (`LiveCam.apk`).
