# Cable TV for PC

Cable TV on Windows: the same channels, modes, sign-in, favourites and ads as the Cable TV app on
Android TV. The keyboard is the remote: arrows move, Enter is OK (hold it, or right click, for the
long press), Esc or Backspace is Back, Page Up/Down and the mouse wheel change channel, the number
keys type a channel number, F or F11 is full screen.

- `npm start` runs it (Electron), `npm run check` checks and tests it, `npm run dist` builds
  `CableTV-PC-Setup.exe` and `CableTV-PC-Portable.exe` (Windows).
- `src/main.js` is the window: crash rollback and reports, updates, stream headers, our locked
  YouTube pages. `src/ui/` holds the screens; each file names the TV app file it follows.
- Builds go to the owner's `test` release first (`build-cabletv-pc.yml`); after the owner's yes,
  `release-approved.yml` with `cable-tv-pc` sends them to everyone.
- Keep it in step with the TV app: see [PARITY.md](PARITY.md).
