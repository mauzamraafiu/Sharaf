// Service worker: keeps the app usable offline and shows prayer-time notifications.
const SHELL = 'dheen-shell-v72';
const DATA = 'dheen-data-v1';
const SHELL_FILES = ['/', '/index.html', '/app.js', '/lib.js', '/admin.js', '/figures.js', '/arabic.js', '/figure3d.js', '/tools.js', '/more.js', '/play.js', '/life.js', '/more-data.js', '/quiz.js', '/vendor/three.module.min.js', '/styles.css', '/vendor/preact-htm.js', '/manifest.webmanifest', '/icons/icon-192.png',
  '/fonts/figtree.woff2', '/fonts/literata.woff2', '/fonts/amiri-quran.woff2', '/fonts/faruma.ttf', '/fonts/thaana-400.woff2', '/quran/index.json', '/data/prayer.json'];

self.addEventListener('install', (e) => e.waitUntil(caches.open(SHELL).then((c) => c.addAll(SHELL_FILES)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('dheen-') && ![SHELL, DATA, 'dheen-settings', 'dheen-audio'].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim())));

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // recitation audio streams straight from its host
  if (url.pathname.startsWith('/api/')) {
    if (url.pathname.startsWith('/api/admin') || url.pathname.startsWith('/api/account') || url.pathname.startsWith('/api/push') || url.pathname.startsWith('/api/audio')) return;
    e.respondWith(networkFirst(req, DATA));
  } else if (/^\/(quran|fonts|vendor|data)\//.test(url.pathname)) e.respondWith(cacheFirst(req, DATA));
  else if (url.pathname.startsWith('/seed/')) return;
  else e.respondWith(networkFirst(req.mode === 'navigate' ? new Request('/') : req, SHELL));
});

// ---- prayer notifications: the push carries no data, so work out which prayer it is here ----
const NAMES = { en: ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'], dv: ['ފަތިސް', 'މެންދުރު', 'ޢަޞްރު', 'މަޣްރިބް', 'ޢިޝާ'] };
function dayIndex(d) {
  const y = d.getUTCFullYear();
  const doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86400000);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return !leap && doy >= 59 ? doy + 1 : doy;
}
const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
async function prayerNotice() {
  let s = { lang: 'en', island: 102, lead: 0 };
  try { s = { ...s, ...(await (await caches.match('/__settings')).json()) }; } catch {}
  const dv = s.lang === 'dv';
  let title = dv ? 'ނަމާދު ވަގުތު' : 'Prayer time', body = '', data = null;
  try {
    const data = await (await cacheFirst(new Request('/data/prayer.json'), DATA)).json();
    const isl = data.islands.find((i) => i.id === s.island) || data.islands.find((i) => i.id === 102);
    const now = new Date(Date.now() + 5 * 3600000);
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const row = data.groups[isl.g][dayIndex(now)];
    let best = null;
    [0, 2, 3, 4, 5].forEach((col, p) => { const t = row[col] + isl.o, diff = t - minute; if (diff >= -15 && diff <= 20 && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { p, t, diff }; });
    if (best) {
      const name = NAMES[dv ? 'dv' : 'en'][best.p];
      data = { p: best.p, day: now.toISOString().slice(0, 10), arrived: best.diff <= 0 };
      if (best.diff > 0) {
        title = dv ? `${name}: ${best.diff} މިނެޓް ބާކީ` : `${name} in ${best.diff} ${best.diff === 1 ? 'minute' : 'minutes'}`;
        body = dv ? `${hhmm(best.t)}، ${isl.n}. ކައުންޓްޑައުން ބެލުމަށް ފިއްތާ.` : `${hhmm(best.t)} in ${isl.n}. Tap to see the countdown.`;
      } else {
        title = dv ? `${name} ނަމާދު ވަގުތު ޖެހިއްޖެ` : `It is time for ${name}`;
        body = dv ? `${hhmm(best.t)}، ${isl.n}. ނަމާދަށްފަހުގެ ޛިކުރަށް ފިއްތާ.` : `${hhmm(best.t)} in ${isl.n}. Tap for the dhikr after the prayer.`;
      }
    }
    if (!best && now.getUTCDay() === 5 && minute >= 530 && minute <= 620) { // the Friday morning reminder
      title = dv ? 'ހުކުރު ދުވަސް' : 'It is Friday';
      body = dv ? 'ސޫރަތުލް ކަހްފު ކިޔަވައި، ގިނައިން ޞަލަވާތް ކިޔަވާ.' : 'Read Surah al-Kahf and send salawat on the Prophet ﷺ.';
      data = { go: '#/quran/18' };
    }
  } catch {}
  const opts = { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'prayer', renotify: true, data };
  // Android shows this as a button on the alert; iPhone ignores it.
  if (data && data.arrived) opts.actions = [{ action: 'prayed', title: dv ? 'ނަމާދުކޮށްފިން' : 'I have prayed' }];
  return self.registration.showNotification(title, opts);
}
self.addEventListener('push', (e) => e.waitUntil(prayerNotice()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const d = e.notification.data;
  if (e.action === 'prayed' && d) {
    // Tick the prayer without opening the app: leave a note the app picks up, and tell it now if it is open.
    e.waitUntil((async () => {
      const cache = await caches.open('dheen-settings');
      let pending = {};
      try { pending = await (await cache.match('/__prayed')).json(); } catch {}
      (pending[d.day] ||= {})[d.p] = 1;
      await cache.put('/__prayed', new Response(JSON.stringify(pending)));
      for (const c of await self.clients.matchAll({ type: 'window', includeUncontrolled: true })) c.postMessage({ prayedSync: true });
    })());
    return;
  }
  // Open the live countdown, in the app window if one is already open.
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (list) => {
    const c = list[0];
    const go = (d && d.go) || '#/countdown';
    if (!c) return self.clients.openWindow('/' + go);
    try { c.postMessage({ go }); return await c.focus(); } catch { return self.clients.openWindow('/' + go); }
  }));
});
