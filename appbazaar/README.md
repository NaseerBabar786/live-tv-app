# App Bazaar (Android app)

The apps.bulkbazaar.ca store as an app for Android phones and TVs (Google TV, Android TV, Fire TV).

- Reads the app list from https://apps.bulkbazaar.ca/apps.json (repo NaseerBabar786/app-store), so an app
  added to the website shows up here with no new App Bazaar version. The last list is kept for offline use.
- Each app shows Install, Update or Open. "package" in apps.json tells it which app on the device is ours;
  "version" in apps.json is compared with the installed version. The app-store repo's sync job fills both
  from the real APKs every hour.
- Install downloads the APK and opens Android's installer (Android always asks to confirm).
- App Bazaar's own entry in apps.json (id `app-bazaar`) lets it update itself the same way.
- CI publishes it in the fixed release `app-bazaar`:
  https://github.com/NaseerBabar786/live-tv-app/releases/download/app-bazaar/AppBazaar.apk
  Downloader code on TVs: tv.bulkbazaar.ca/bazaar
