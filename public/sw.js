// Service worker: keeps the app usable offline and shows prayer-time notifications.
const SHELL = 'dheen-shell-v22';
const DATA = 'dheen-data-v1';
const SHELL_FILES = ['/', '/index.html', '/app.js', '/lib.js', '/admin.js', '/figures.js', '/arabic.js', '/styles.css', '/vendor/preact-htm.js', '/manifest.webmanifest', '/icons/icon-192.png',
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
  let title = dv ? 'ނަމާދު ވަގުތު' : 'Prayer time', body = '';
  try {
    const data = await (await cacheFirst(new Request('/data/prayer.json'), DATA)).json();
    const isl = data.islands.find((i) => i.id === s.island) || data.islands.find((i) => i.id === 102);
    const now = new Date(Date.now() + 5 * 3600000);
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const row = data.groups[isl.g][dayIndex(now)];
    let best = null;
    [0, 2, 3, 4, 5].forEach((col, p) => { const t = row[col] + isl.o, diff = t - minute; if (diff >= -15 && diff <= 20 && (!best || Math.abs(diff) < Math.abs(best.diff))) best = { p, t, diff }; });
    if (best) {
      title = `${NAMES[dv ? 'dv' : 'en'][best.p]} ${hhmm(best.t)}`;
      body = best.diff > 0 ? (dv ? `${isl.n}: ${best.diff} މިނެޓް ބާކީ` : `In ${best.diff} min at ${isl.n}`) : (dv ? `${isl.n}: ނަމާދު ވަގުތު ޖެހިއްޖެ` : `It is time to pray at ${isl.n}`);
    }
  } catch {}
  return self.registration.showNotification(title, { body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', tag: 'prayer', renotify: true });
}
self.addEventListener('push', (e) => e.waitUntil(prayerNotice()));
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window' }).then((list) => (list[0] ? list[0].focus() : self.clients.openWindow('/#/prayer'))));
});
