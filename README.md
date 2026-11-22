# Sharaf (شَرَفُ أُمِّي, "my mother's honour")

The Worker and its database are named `sharaf`. A few names nobody sees (browser storage keys, cache names) still say `dheen`.

*In loving memory of Shareefa Ahmed (24 July 1972 – 18 February 2023). May Allah have mercy on her. The dedication text lives in `public/lib.js` (keys starting `mem`) and `public/app.js` (MemoryPanel, MemoryPage).*

Quran with English and Dhivehi translation and recitation, Maldives prayer times with notifications, how to pray, duas, and a library of articles on Islam in English and Dhivehi. An installable PWA on Cloudflare Workers (free plan).

## Run it on your PC

Double-click **start.bat** and press Enter. It installs what it needs the first time, starts the app and opens http://localhost:8787. The same file stops it, updates it, opens it for a phone on your Wi-Fi, rebuilds content and resets the local database.

- Needs Node.js 20 or newer (https://nodejs.org).
- Local admin page: http://localhost:8787/#/admin, password `admin12345` (set in `.dev.vars`, local only).

## Put it online

1. **GitHub.** Create an empty repository, then in this folder:
   ```
   git init
   git add .
   git commit -m "Sharaf"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/YOUR-REPO.git
   git push -u origin main
   ```
2. **Workers Builds.** Cloudflare dashboard > Workers & Pages > Create > Import a repository > pick the repo. Leave the build command empty and the deploy command as `npx wrangler deploy`. The first deploy creates the D1 database by itself (the config has no `database_id` on purpose). After this, every push to `main` goes live.
3. **Admin password.** In the Worker: Settings > Variables and Secrets > add a secret named `ADMIN_PASSWORD`. Use a long one. Without it nobody can sign in to the admin page.
4. **Your domain.** In the Worker: Settings > Domains & Routes > Add > Custom domain, and type the domain or subdomain you bought on Cloudflare.
5. Optional: change `PUSH_CONTACT` in `wrangler.jsonc` to your own `mailto:` address. Push services use it to contact the sender.

The first visitors see "Preparing the library" for a few seconds while content is imported. After later deploys, new content is imported in the background, one file a minute.

## How it stays inside the free plan

- The Quran, prayer timetable, fonts and the app itself are static files. They do not run the Worker and do not count against the 100,000 requests a day.
- Only `/api/*` runs the Worker. Each call makes a handful of D1 queries.
- Content is imported one small file per call (36 rows), under the 50-query limit.
- One Cron Trigger runs each minute. Notifications carry no data, so the Worker signs a short token instead of encrypting messages; the phone works out which prayer it is. A run sends at most 40 notifications, so a busy prayer time is spread over a few minutes. With many subscribers on one island, this is the first limit you would meet.
- Uploaded recordings are stored in D1, up to 1.5 MB each.

## Reader accounts

Settings has "Your account". A reader picks a username and password; their last-read place, mushaf page, pages read, bookmarks and dhikr counts are then saved in D1 and merged on any device they sign in on. There is no email, so there is no password reset yet. Passwords are salted and hashed (PBKDF2, 20,000 rounds, chosen to fit the free plan's CPU limit).

## Editing content

**In the browser:** `/#/admin`. "Dhivehi to review" lists every item whose Dhivehi has not been checked. Edit, tick "Dhivehi text has been reviewed", save. Items edited here are never overwritten by a later deploy.

**In files:** everything is in `content/*.txt` in a readable format explained at the top of `tools/build-content.mjs`. After editing, run option 6 in start.bat (or `npm run content`), then commit and push.

## Where things are

```
src/index.js        Worker: API, admin, content import, cron notifications
src/push.js         Web Push signing
public/             The app (Preact, no build step), service worker, fonts
public/quran/       One file per surah: Arabic, English, Dhivehi
public/quran/page/  The mushaf view: 604 pages, Arabic only
public/data/        Prayer timetable for 205 islands
public/seed/        Generated from content/, imported into D1
content/            Articles, prayer guide and duas you can edit
tools/              Scripts that generate the data and seed files
```

## Sources and licences to check before a public launch

- An-Nawawi's Forty Hadith: Arabic and English from the fawazahmed0/hadith-api dataset (`tools/data/nawawi.json`). The English wording comes from a published translation; check its terms or replace it with your own. Dhivehi for these 42 is not written yet.
- Arabic text: Uthmani script (Tanzil project), via the fawazahmed0/quran-api dataset.
- English: Marmaduke Pickthall, 1930. Its language is old-fashioned. A modern translation would need its publisher's permission.
- Dhivehi: the translation published by the Office of the President of the Maldives, as distributed by Tanzil. Tanzil's terms ask for attribution and non-commercial use; confirm with the publisher if the app will carry ads or be sold.
- Prayer times: the `mv-prayertimes` dataset (ISC licence), a copy of the published Maldives timetable. Compare a few islands with the current official times.
- Dhivehi font: Faruma (Office of the President of the Maldives), taken unmodified from the fonts.mv collection. It is in everyday public use; confirm its terms before a commercial launch. Noto Sans Thaana (OFL) stays as the fallback.
- Dua recordings in `public/audio/dua` are the Hisn al-Muslim audio files, copied from the rn0x/Adhkar-json repository, which states no licence. Get permission or replace them before a public launch.
- Recitation audio streams from everyayah.com and is not stored here.
- Hadith numbers follow common numbering; verify them when reviewing each item.

## Added in this version

- **Prayer check-off** on the home screen, with the dhikr to say after each prayer as a guided counter (`#/guide/after-fajr` and so on). Any dua section can also be gone through one dua at a time.
- **"Good to do now"**: suggestions by time of day, weekday and Hijri date (Mondays and Thursdays, the white days, Ramadan, Arafah, Ashura, the Eids). The Hijri date is calculated (Umm al-Qura) and can differ from the official Maldives date by a day.
- **New content** in `content/12` to `content/15`: the funeral prayer, duas for the dead and visiting graves, Ramadan, fasting and Eid duas, special days, Umrah, Hajj, four more prophets, stories from the Quran, children's stories and eight Arabic lessons.
- **Learn Arabic** (`#/arabic`): letter chart with Thaana equivalents and a word quiz. Data is in `public/arabic.js`.
- **Layout**: bottom bar on phones and tablets, a bar across the top on wide screens, and an Explore page listing everything by subject.
- Arabic marked `@h:` in the content files is taken from the Hisn al-Muslim dataset in `tools/data/hisn.json`. Arabic typed by hand (the Janazah and fasting intentions, the Eid takbir, the Laylat al-Qadr dua, the dhikr in `app.js`) should be checked by a scholar, as should every Dhivehi translation.
