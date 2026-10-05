# Multi Chat for PC (Windows)

Several WhatsApp accounts side by side on a Windows PC. Each account is the official
web.whatsapp.com in its own Electron session (`persist:acc-<id>`), signed in with its own QR
code. The Android version is in [`../multichat`](../multichat).

## Features

- Account bar with name, colour, photo and unread count; Ctrl+1 to Ctrl+9 switch accounts
- Side by side view of all accounts (Ctrl+Shift+S)
- Windows notifications labelled with the account's name and photo; click opens that account
- Per-account mute and quiet hours; option to hide message text
- Quick replies (Ctrl+Shift+Q): click to type a saved text into the open chat; you press Send
- PIN lock (Ctrl+L), auto-lock when the PC is idle or locked
- Runs in the tray, unread count on the taskbar icon, optional start with Windows
- Tells you when a newer version is out

Multi Chat never reads chats or sends anything by itself, and it is not made by or connected
with WhatsApp or Meta.

## Build

```
npm ci
npm start          # run it
npm run check      # syntax check + tests
npm run dist       # Windows installer and portable .exe in dist/ (on Windows)
```

CI (`.github/workflows/build-multichat-pc.yml`) builds both on a Windows runner and keeps the
newest in the fixed `multichat-pc` release:
- https://github.com/NaseerBabar786/live-tv-app/releases/download/multichat-pc/MultiChat-Setup.exe
- https://github.com/NaseerBabar786/live-tv-app/releases/download/multichat-pc/MultiChat-Portable.exe
