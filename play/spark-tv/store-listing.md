# Spark TV Urdu: Google Play listing

Paste this into Play Console. Spark TV Urdu carries only programmes we own or may show (our news and ads,
public-domain films and shows, free-licence music). Never show or name a YouTube channel, a TV network,
Cable TV, App Bazaar or tv.bulkbazaar.ca downloads in the listing, screenshots or video.

## App details
- **App name:** Spark TV Urdu (the owner, 2026-10-09: three apps on Google Play are already called "Spark TV";
  the channels inside keep their Spark names)
- **Package name:** ca.bulkbazaar.sparktv (fixed after the first upload)
- **Developer:** Bulk Bazaar Inc.
- **App or game:** App · **Free or paid:** Free
- **Category:** Entertainment
- **Contains ads:** Yes (our own and our sponsors' short video ads between programmes; no ad network)
- **In-app purchases:** **No for now.** While Spark TV Urdu has channel 1 alone, the app shows no Gold layouts
  (nothing to put side by side). When more channels are added: one subscription, Gold, product ID `spark_gold` (auto-renewing). Create it in
  Play Console under Monetize > Subscriptions with that exact ID, then add base plans (for example 1 month
  and 1 year; the price is the owner's choice). The app lists every base plan it finds, longest first.

## Short description (80 characters max)
Spark TV One: Urdu and Hindi films, stories and shayari of the classic poets.

## Full description
Spark TV Urdu brings you free channels, ready to watch on your TV, phone or tablet.

Spark TV One
• Films in Urdu and Hindi, dubbed by us, and our own stories
• Shayari: couplets of Ghalib, Mir, Iqbal and the classic Urdu poets
• More channels are on the way

Features
• Made for Android TV and Google TV, with full remote support; works on phones and tablets too
• Live TV feel: every channel runs on a schedule, like real TV
• Clock and local weather in the top bar
• No account and no sign-in

Spark TV Urdu's films and shows are in the public domain (from the Internet Archive) or free-licence
(Blender Foundation films, dubbed by us), its music is free-licence (from Wikimedia Commons), and the
poetry readings and stories are our own.

## Graphics (in this folder)
- **App icon (512 × 512):** icon-512.png
- **Feature graphic (1024 × 500):** feature-graphic.png
- **Android TV banner (1280 × 720):** tv-banner.png
- **Screenshots:** Claude takes them from the emulator: TV (1920 × 1080) at least 1, phone at least 2.

## Privacy policy
https://tv.bulkbazaar.ca/sparktv/privacy.html (App content > Privacy policy)

## Data safety form (App content > Data safety)
- Does your app collect or share any of the required user data types? **Yes**
  - **Location > Approximate location:** collected, not shared. Purpose: App functionality (local weather).
    Processed ephemerally: **Yes**. Required: **Yes**. This is the IP-based city lookup for the weather
    (geojs.io, then open-meteo.com); nothing is stored.
  - **App info and performance > Crash logs** and **> Diagnostics:** collected, not shared. Purpose: App
    functionality (fixing crashes). Processed ephemerally: **No**. Required: **Yes** (no switch in the app).
    Not linked to the user: the report holds only the error, app version, device model and Android version
    (app/src/main/java/com/livetv/app/CrashGuard.kt), kept in our Firebase project.
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS)
- Do you provide a way for users to request that their data is deleted? **No** (nothing about a person is
  stored: crash reports carry no identifier)

## Content rating questionnaire
- Category: **Entertainment** (not a game)
- Violence: **Yes, mild / unrealistic** (old films and cartoons-era comedy can include fist fights or
  gunfights). Sexual content, crude humour, drugs, gambling: **No**.
- Does the app let users interact or share content? **No**
- Does the app show news? **No**

## Other App content answers
- Target audience: **18 and over** (keeps the app out of Google's Families rules)
- News app: **No** (news is one channel; the app is entertainment)
- Ads: **Yes, my app contains ads**
- Government app: **No** · Financial features: **None** · Health: **No**

## App access
All functionality is available without special access. Note for the reviewer:
"Spark TV opens on its channel list with Spark TV One, which plays at once; no sign-in and no purchases."

## Android TV
Setup > Advanced settings > Form factors > Add Android TV. Upload the TV screenshot first; the word
"Android TV" is in the description above, as Google asks.
