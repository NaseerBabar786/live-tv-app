# Multi Chat (Android phone)

Several WhatsApp accounts in one app, each in its own separate box. Each account is the
official web.whatsapp.com in its own WebView profile (separate cookies and storage), signed
in with a QR code or "Log in with phone number". Kotlin and Jetpack Compose.

The Windows PC version is in [`../multichat-pc`](../multichat-pc).

## Features

- Any number of accounts, each with its own name, colour and photo, in a bar at the top
- Unread count on each account (read from the page title)
- Notifications labelled with the account's name, colour and photo; tap opens that account
- Per-account mute and quiet hours; option to hide message text in notifications
- Quick replies: saved texts typed into the open chat's message box (you still press Send)
- PIN lock with fingerprint unlock, auto-lock time, and no chats in the recent-apps preview
- Stays connected in the background with a quiet "connected" notification
- Downloads from chats save to Downloads > Multi Chat; attachments and voice notes work
- Updates itself from the `multichat-v…` GitHub releases

Needs Android 8 or newer and Android System WebView 110 or newer (for separate profiles).

Not possible by design: sending bulk or automatic messages. Multi Chat never reads chats or
sends anything by itself. It is not made by or connected with WhatsApp or Meta.

## Build

`./gradlew :multichat:assembleDebug` (CI builds it on every push; see `.github/workflows/build-apk.yml`).
Newest APK: https://github.com/NaseerBabar786/live-tv-app/releases/download/multichat/MultiChat.apk
