// Shared helpers: settings, language, prayer-time maths, API calls, small markdown renderer.
import { html } from './vendor/preact-htm.js';

// ---------- settings (kept on this device) ----------
const DEFAULTS = {
  lang: 'en', theme: 'auto', island: 102, reciter: 'Alafasy_128kbps',
  show: { ar: true, en: true, dv: true }, arSize: 30, last: null, marks: [],
  notif: { on: false, prayers: 31, lead: 0 }, qmode: 'study', mpage: 1, pagesRead: [], counts: {}, prayed: {}, arWords: [], saved: [], notes: {},
};
let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem('dheen') || '{}') }; } catch {}
const listeners = new Set();
export const getSettings = () => settings;
export function setSettings(patch) {
  settings = { ...settings, ...patch };
  try { localStorage.setItem('dheen', JSON.stringify(settings)); } catch {}
  if (user && Object.keys(patch).some((k) => SYNC_KEYS.includes(k))) schedulePush();
  // The service worker cannot read localStorage, so mirror what it needs into a cache entry.
  if ('caches' in window) caches.open('dheen-settings').then((c) => c.put('/__settings', new Response(JSON.stringify({ lang: settings.lang, island: settings.island, lead: settings.notif.lead })))).catch(() => {});
  applyTheme();
  listeners.forEach((f) => f(settings));
}
export const onSettings = (f) => { listeners.add(f); return () => listeners.delete(f); };
export function applyTheme() {
  const dark = settings.theme === 'dark' || (settings.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const r = document.documentElement;
  r.dataset.theme = dark ? 'dark' : 'light';
  r.lang = settings.lang === 'dv' ? 'dv' : 'en';
  r.dir = settings.lang === 'dv' ? 'rtl' : 'ltr';
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#071A1C' : '#0B4F4C');
}

// ---------- account: progress follows the reader to any device they sign in on ----------
const SYNC_KEYS = ['prayed', 'arWords', 'last', 'marks', 'mpage', 'pagesRead', 'counts', 'island', 'reciter', 'show', 'arSize', 'qmode', 'mScale', 'qTaj', 'saved', 'notes', 'log'];
let user = null, pushTimer = null;
export const getUser = () => user;
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    const data = Object.fromEntries(SYNC_KEYS.map((k) => [k, settings[k]]));
    fetch('/api/account/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).catch(() => {});
  }, 2500);
}
// Merge what the server has with what this device has, so nothing read on either is lost.
function mergeRemote(r) {
  const m = { ...settings };
  for (const k of ['last', 'island', 'reciter', 'show', 'arSize', 'qmode']) if (r[k] != null && settings[k] === DEFAULTS[k]) m[k] = r[k];
  m.mpage = Math.max(settings.mpage || 1, r.mpage || 1);
  m.pagesRead = [...new Set([...(settings.pagesRead || []), ...(r.pagesRead || [])])].sort((a, b) => a - b);
  const seen = new Set(), marks = [];
  for (const x of [...(settings.marks || []), ...(r.marks || [])]) { const k = x.s + ':' + x.a; if (!seen.has(k)) { seen.add(k); marks.push(x); } }
  m.marks = marks;
  m.prayed = { ...(r.prayed || {}) };
  for (const [d, v] of Object.entries(settings.prayed || {})) m.prayed[d] = (m.prayed[d] || [0, 0, 0, 0, 0]).map((x, i) => (x || v[i] ? 1 : 0));
  m.arWords = [...new Set([...(settings.arWords || []), ...(r.arWords || [])])];
  const sk = new Set(); m.saved = [];
  for (const x of [...(settings.saved || []), ...(r.saved || [])]) if (x && x.k && !sk.has(x.k)) { sk.add(x.k); m.saved.push(x); }
  m.notes = { ...(r.notes || {}), ...(settings.notes || {}) };
  m.log = { ...(r.log || {}) };
  for (const [d, n] of Object.entries(settings.log || {})) m.log[d] = Math.max(m.log[d] || 0, n);
  m.counts = { ...(r.counts || {}) };
  for (const [id, c] of Object.entries(settings.counts || {})) if (!m.counts[id] || (c.n || 0) > (m.counts[id].n || 0)) m.counts[id] = c;
  settings = m;
  try { localStorage.setItem('dheen', JSON.stringify(settings)); } catch {}
  schedulePush();
}
export async function loadAccount() {
  try { const r = await api('/account/me'); user = r.user; if (user) mergeRemote(r.data || {}); } catch {}
  listeners.forEach((f) => f(settings));
}
export async function accountAuth(mode, username, password) {
  const r = await api('/account/' + mode, { method: 'POST', body: JSON.stringify({ username, password }) });
  user = r.user; mergeRemote(r.data || {});
  listeners.forEach((f) => f(settings));
}
export async function accountLogout() { await api('/account/logout', { method: 'POST' }).catch(() => {}); user = null; listeners.forEach((f) => f(settings)); }
export const todayKey = () => mvNow().toISOString().slice(0, 10);
// Reading log: how many ayahs were read each day, for the goal and the streak. Each ayah or page counts once per visit.
const readSeen = new Set();
export function logRead(key, n = 1) {
  if (readSeen.has(key)) return;
  readSeen.add(key);
  const log = { ...(settings.log || {}) }, d = todayKey();
  log[d] = (log[d] || 0) + n;
  const keys = Object.keys(log).sort();
  while (keys.length > 200) delete log[keys.shift()];
  setSettings({ log });
}

// ---------- language ----------
const T = {
  hajjCk: ['Hajj and Umrah checklist', 'ޙައްޖާއި ޢުމްރާގެ ޗެކްލިސްޓު'], hajjCkSum: ['Tick each rite as you do it', 'ކުރާ ކޮންމެ ކަމެއް ފާހަގަކުރޭ'],
  janazahCk: ['When someone dies', 'މީހަކު މަރުވުމުން'], janazahCkSum: ['What the family does, in order', 'ޢާއިލާއިން ކުރަންވީ ކަންކަން، ތަރުތީބުން'],
  seerahT: ['Seerah timeline', 'ސީރަތުގެ ތާރީޚު'], seerahSum: ['The life of the Prophet ﷺ, year by year', 'ރަސޫލާ ﷺ ގެ ޙަޔާތްޕުޅު، އަހަރުން އަހަރަށް'],
  names99: ['The 99 names of Allah', 'ﷲ ގެ 99 އިސްމުފުޅު'], names99Sum: ['Three a day', 'ދުވާލަކު ތިން އިސްމުފުޅު'],
  pathT: ['New to Islam', 'އިސްލާމްދީނަށް އަލަށް'], pathSum: ['A first month of short readings', 'ފުރަތަމަ މަހަށް ކުރު ކިޔުންތައް'],
  tasbihT: ['Tasbih', 'ތަސްބީޙަ'], tasbihSum: ['33, 33, 33 after the prayer', 'ނަމާދަށްފަހު 33، 33، 33'],
  home: ['Home', 'ފުރަތަމަ ޞަފްޙާ'], quran: ['Quran', 'ޤުރުއާން'], prayer: ['Prayer', 'ނަމާދު'], duas: ['Duas', 'ދުޢާ'],
  library: ['Library', 'ލައިބްރަރީ'], search: ['Search', 'ހޯދާ'], settings: ['Settings', 'ސެޓިންގްސް'],
  fajr: ['Fajr', 'ފަތިސް'], sunrise: ['Sunrise', 'އިރުއެރުން'], dhuhr: ['Dhuhr', 'މެންދުރު'], asr: ['Asr', 'ޢަޞްރު'], maghrib: ['Maghrib', 'މަޣްރިބް'], isha: ['Isha', 'ޢިޝާ'],
  nextIn: ['in', 'ބާކީ'], now: ['now', 'މިހާރު'], prayerTimesFor: ['Prayer times for', 'ނަމާދު ވަގުތު:'], changeIsland: ['Change island', 'ރަށް ބަދަލުކުރޭ'],
  continueReading: ['Continue reading', 'ކިޔަމުން ގެންދިޔަ ތަނުން'], ayah: ['Ayah', 'އާޔަތް'], ayahs: ['ayahs', 'އާޔަތް'],
  ayahOfDay: ['An ayah for today', 'މިއަދުގެ އާޔަތެއް'], openSurah: ['Open surah', 'ސޫރަތް ހުޅުވާ'],
  makki: ['Makkah', 'މައްކާ'], madani: ['Madinah', 'މަދީނާ'], juz: ['Juz', 'ފޮތް'], findSurah: ['Find a surah by name or number', 'ސޫރަތުގެ ނަން ނުވަތަ ނަންބަރުން ހޯދާ'],
  play: ['Play', 'އަޑުއަހާ'], pause: ['Pause', 'މަޑުކުރޭ'], playSurah: ['Play surah', 'ސޫރަތް އަޑުއަހާ'], stop: ['Stop', 'ހުއްޓާލާ'],
  bookmark: ['Bookmark', 'ބުކްމާކް'], bookmarks: ['Bookmarks', 'ބުކްމާކްތައް'], noBookmarks: ['Tap the ribbon on any ayah to keep it here.', 'އާޔަތެއްގެ ބުކްމާކް ފިއްތާލުމުން މިތަނުން ފެންނާނެ.'],
  arabic: ['Arabic', 'ޢަރަބި'], english: ['English', 'އިނގިރޭސި'], dhivehi: ['Dhivehi', 'ދިވެހި'],
  howToPray: ['Learn to pray', 'ނަމާދުކުރާނެ ގޮތް'], guides: ['Guides', 'ގައިޑްތައް'],
  meaning: ['Meaning', 'މާނަ'], source: ['Source', 'މަސްދަރު'], listen: ['Listen', 'އަޑުއަހާ'],
  dvUnreviewed: ['Dhivehi text not yet reviewed by a scholar', 'ދިވެހި ލިޔުން އަދި ޢިލްމުވެރިއަކު މުރާޖަޢާ ނުކުރޭ'],
  searchHint: ['Search articles, duas and surahs', 'ލިޔުންތަކާއި ދުޢާއާއި ސޫރަތް ހޯދާ'], noResults: ['Nothing matches that. Try a shorter word.', 'އެއްވެސް ނަތީޖާއެއް ނުފެނުނު. ކުރު ލަފްޒަކުން ހޯދާ.'],
  language: ['Language', 'ބަސް'], theme: ['Theme', 'ތީމް'], light: ['Light', 'އަލި'], dark: ['Dark', 'އަނދިރި'], auto: ['Match device', 'ޑިވައިސްއާ އެއްގޮތަށް'],
  island: ['Your island', 'ތިބާގެ ރަށް'], reciter: ['Reciter', 'ޤާރީ'], arabicSize: ['Arabic text size', 'ޢަރަބި އަކުރުގެ ސައިޒު'],
  notifications: ['Prayer-time notifications', 'ނަމާދު ވަގުތުގެ ނޮޓިފިކޭޝަން'], turnOn: ['Turn on notifications', 'ނޮޓިފިކޭޝަން އޮންކުރޭ'], turnOff: ['Turn off notifications', 'ނޮޓިފިކޭޝަން އޮފްކުރޭ'],
  notifyBefore: ['Notify', 'އެންގުން'], atTime: ['at prayer time', 'ވަގުތު ޖެހުމުން'], minBefore: ['min before', 'މިނެޓް ކުރިން'],
  notifIos: ['On iPhone, add this app to your Home Screen first (Share, then Add to Home Screen).', 'އައިފޯނުގައި ފުރަތަމަ މި އެޕް ހޯމް ސްކްރީނަށް އެޑްކުރައްވާ.'],
  notifBlocked: ['Notifications are blocked for this site. Allow them in your browser settings, then try again.', 'މި ސައިޓަށް ނޮޓިފިކޭޝަން ބްލޮކްކޮށްފައިވޭ. ބްރައުޒަރު ސެޓިންގްސްއިން ހުއްދަދީ.'],
  offline: ['Quran offline', 'އޮފްލައިން ޤުރުއާން'], download: ['Download all 114 surahs', 'ހުރިހާ ސޫރަތެއް ޑައުންލޯޑްކުރޭ'], downloaded: ['All surahs saved on this device', 'ހުރިހާ ސޫރަތެއް ރައްކާކުރެވިއްޖެ'],
  about: ['About and sources', 'މަޢުލޫމާތާއި މަސްދަރު'], admin: ['Content admin', 'އެޑްމިން'], install: ['Install app', 'އެޕް އިންސްޓޯލްކުރޭ'],
  loading: ['Loading', 'ލޯޑުވަނީ'], settingUp: ['Preparing the library', 'ލައިބްރަރީ ތައްޔާރުކުރަނީ'],
  failed: ['Could not load this. Check your connection and try again.', 'ލޯޑެއް ނުކުރެވުނު. އިންޓަނެޓް ޗެކްކޮށްފައި އަލުން މަސައްކަތްކުރޭ.'], retry: ['Try again', 'އަލުން މަސައްކަތްކުރޭ'],
  hijriNote: ['Hijri date is calculated; the official Maldives date can differ by a day.', 'ހިޖުރީ ތާރީޚަކީ ހިސާބުން ނެގި ތާރީޚެއް. ރަސްމީ ތާރީޚާ ދުވަހެއްގެ ތަފާތު އުޅެދާނެ.'],
  beliefs: ['Beliefs and worship', 'ޢަޤީދާއާއި އަޅުކަން'], t_quran: ['The Quran', 'ކީރިތި ޤުރުއާން'], hadith: ['Hadith and Sunnah', 'ޙަދީޘާއި ސުންނަތް'], fiqh: ['Fiqh', 'ފިޤްހު'],
  history: ['Seerah and history', 'ސީރަތާއި ތާރީޚު'], spirit: ['Theology and spirituality', 'ޢަޤީދާގެ ޢިލްމާއި ތަޒްކިޔާ'], modern: ['Modern topics', 'މިޒަމާނުގެ މައުޟޫޢުތައް'], life: ['Daily life', 'ދުވަހުގެ ދިރިއުޅުން'],
  modeStudy: ['With translation', 'ތަރުޖަމާއާއެކު'], modeStudyHint: ['Ayah by ayah, English and Dhivehi', 'އާޔަތުން އާޔަތަށް، ދިވެހި އަދި އިނގިރޭސި'],
  modeBook: ['Mushaf', 'މުޞްޙަފު'], modeBookHint: ['Arabic only, page by page like the printed book', 'ޢަރަބި އެކަނި، ޗާޕު މުޞްޙަފު ފަދައިން ޞަފްޙާ ޞަފްޙާއަށް'],
  pageWord: ['Page', 'ޞަފްޙާ'], nextPage: ['Next page', 'ކުރިއަށް'], prevPage: ['Previous page', 'ފަހަތަށް'], tapAyah: ['Tap an ayah to hear it', 'އަޑުއަހަން އާޔަތުގައި ފިއްތާ'],
  aboutSurah: ['About this surah', 'މި ސޫރަތާ ބެހޭ'],
  counter: ['Counter', 'ކައުންޓަރު'], count: ['Count', 'ގުނާ'], tapToCount: ['Tap anywhere on the circle', 'ބޮޅުގައި ފިއްތާ'], todayWord: ['Today', 'މިއަދު'], totalWord: ['All time', 'ޖުމްލަ'],
  target: ['Target', 'ޓާގެޓު'], noTarget: ['None', 'ނެތް'], resetToday: ['Reset today', 'މިއަދުގެ ޢަދަދު ރީސެޓްކުރޭ'], reached: ['Target reached', 'ޓާގެޓު ހަމަވެއްޖެ'],
  account: ['Your account', 'ތިބާގެ އެކައުންޓް'], accountHint: ['Sign in to keep your reading progress, bookmarks and counts on every device.', 'ކިޔެވުމުގެ ޕްރޮގްރެސްއާއި، ބުކްމާކްތަކާއި، ޢަދަދުތައް ހުރިހާ ޑިވައިސްއެއްގައި ބެހެއްޓުމަށް ސައިން އިންކުރޭ.'],
  username: ['Email or username', 'އީމެއިލް ނުވަތަ ޔޫޒަރނޭމް'], password: ['Password', 'ޕާސްވޯޑް'], signIn: ['Sign in', 'ސައިން އިން'], createAccount: ['Create account', 'އެކައުންޓް ހަދާ'], signOut: ['Sign out', 'ސައިން އައުޓް'],
  signedInAs: ['Signed in as', 'ސައިން އިންކޮށްފައިވަނީ'], noReset: ['There is no password reset yet, so keep your password safe.', 'ޕާސްވޯޑް ރީސެޓެއް ނުކުރެވޭނެ. ޕާސްވޯޑް ރައްކާކުރޭ.'],
  progress: ['Your Quran progress', 'ޤުރުއާން ކިޔެވުމުގެ ޕްރޮގްރެސް'], pagesRead: ['pages read', 'ޞަފްޙާ ކިޔައިފި'], markRead: ['Mark as read', 'ކިޔައިފިކަމަށް ފާހަގަކުރޭ'], markedRead: ['Read', 'ކިޔައިފި'],
  readAloud: ['Read aloud (device voice)', 'ކިޔައިދީ (ޑިވައިސްގެ އަޑު)'], noVoice: ['No Arabic voice on this device. On Windows: Settings, Time & language, Speech, Add voices, Arabic. Most phones already have one.', 'މި ޑިވައިސްގައި ޢަރަބި އަޑެއް ނެތް. ވިންޑޯޒްގައި: Settings، Time & language، Speech، Add voices، Arabic.'],
  chooseNiyyah: ['Choose your prayer to see its intention and steps', 'ނިޔަތާއި މަރުޙަލާތައް ބެލުމަށް ނަމާދު ޚިޔާރުކުރޭ'],
  findIsland: ['Search island or atoll', 'ރަށް ނުވަތަ އަތޮޅު ހޯދާ'],
  fullScreen: ['Full screen', 'ފުލް ސްކްރީން'], exitFull: ['Leave full screen', 'ފުލް ސްކްރީނުން ނުކުމޭ'], reciterHint: ['Tap a name to choose it and hear a sample.', 'ޚިޔާރުކޮށް ނަމޫނާއެއް އަޑުއަހަން ނަމުގައި ފިއްތާ.'],
  downloadSurah: ['Save audio offline', 'އަޑު އޮފްލައިންކޮށް ރައްކާކުރޭ'], savedOffline: ['Audio saved offline', 'އަޑު ރައްކާކުރެވިއްޖެ'], someFailed: ['Some ayahs did not download. Tap again to retry.', 'ބައެއް އާޔަތް ޑައުންލޯޑެއް ނުވި. އަލުން ފިއްތާ.'],
  offlineAudio: ['Offline recitation', 'އޮފްލައިން ތިލާވަތު'], offlineAudioHint: ['Saves every ayah of the chosen reciter on this device: about 0.6 to 1.5 GB. Use Wi-Fi. You can stop and continue later.', 'ޚިޔާރުކުރި ޤާރީގެ ހުރިހާ އާޔަތެއް މި ޑިވައިސްގައި ރައްކާކުރޭ: ގާތްގަނޑަކަށް 0.6 އިން 1.5 ޖީބީ. ވައިފައި ބޭނުންކުރޭ.'],
  downloadQuran: ['Download the whole Quran', 'މުޅި ޤުރުއާން ޑައުންލޯޑްކުރޭ'], deleteAudio: ['Delete saved audio', 'ރައްކާކުރި އަޑު ޑިލީޓްކުރޭ'], deleteAudioAsk: ['Delete all recitation saved on this device?', 'މި ޑިވައިސްގައި ރައްކާކުރި ހުރިހާ ތިލާވަތެއް ޑިލީޓްކުރަންވީތަ؟'], storageUsed: ['Storage used by this app', 'މި އެޕް ބޭނުންކުރާ ޖާގަ'],
  explore: ['Explore', 'ބަލާލާ'], exploreLede: ['Everything in the app, by subject.', 'އެޕްގައިވާ ހުރިހާ އެއްޗެއް، މައުޟޫޢުން މައުޟޫޢަށް.'],
  tickPrayers: ['Tick each prayer once you have prayed it', 'ކޮންމެ ނަމާދެއް ކުރުމަށްފަހު ފާހަގަކުރޭ'], prayedMark: ['prayed', 'ކުރެވިއްޖެ'], markPrayed: ['Mark as prayed', 'ކުރެވުނުކަމަށް ފާހަގަކުރޭ'],
  afterPrayer: ['After the prayer', 'ނަމާދަށްފަހު'], startDhikr: ['Say the dhikr after', 'ފަހުގެ ޛިކުރު ކިޔާ'], last7: ['Last 7 days', 'ފާއިތުވި 7 ދުވަސް'],
  nowTitle: ['Good to do now', 'މި ވަގުތު ކުރަން ރަނގަޅު ކަންތައް'], morningAdhkar: ['Morning remembrances', 'ހެނދުނުގެ ޛިކުރުތައް'], eveningAdhkar: ['Evening remembrances', 'ހަވީރުގެ ޛިކުރުތައް'], beforeSleep: ['Dua before sleeping', 'ނިދުމުގެ ކުރިން ކިޔާ ދުޢާ'],
  kahfFriday: ['Friday: read Surah Al-Kahf', 'ހުކުރު: ސޫރަތުލް ކަހްފު ކިޔަވާ'], salawatFriday: ['Friday: send blessings on the Prophet ﷺ', 'ހުކުރު: ޞަލަވާތް ގިނަކުރޭ'],
  todayIs: ['Today', 'މިއަދު'], tomorrowIs: ['Tomorrow', 'މާދަމާ'], oneByOne: ['Say them one by one', 'އެއް ދުޢާއަށްފަހު އަނެއް ދުޢާ ކިޔާ'],
  nextStep: ['Next', 'ކުރިއަށް'], skip: ['Skip', 'ދޫކޮށްލާ'], guideDone: ['Finished. May Allah accept it from you.', 'ނިމުނީ. ﷲ ޤަބޫލުކުރައްވާށި.'], timesWord: ['times', 'ފަހަރު'], onceWord: ['once', 'އެއް ފަހަރު'], tapCount: ['Tap the circle each time you say it', 'ކިޔާ ކޮންމެ ފަހަރަކު ބޮޅުގައި ފިއްތާ'], again: ['Start again', 'އަލުން ފަށާ'],
  g_worship: ['Worship, step by step', 'އަޅުކަން، މަރުޙަލާއިން މަރުޙަލާއަށް'], g_duas: ['Duas and dhikr', 'ދުޢާއާއި ޛިކުރު'], g_quran: ['The Quran', 'ކީރިތި ޤުރުއާން'], g_days: ['The Islamic year', 'އިސްލާމީ އަހަރު'], g_stories: ['Stories', 'ވާހަކަތައް'], g_kids: ['For children', 'ކުދިންނަށް'], g_arabic: ['Learn Arabic', 'ޢަރަބި ދަސްކުރުން'], g_know: ['Knowledge', 'ޢިލްމު'],
  readQuran: ['Read with translation', 'ތަރުޖަމާއާއެކު ކިޔަވާ'], readQuranSum: ['114 surahs in Arabic, English and Dhivehi, with recitation.', '114 ސޫރަތް ޢަރަބި، އިނގިރޭސި އަދި ދިވެހިން، ތިލާވަތާއެކު.'], mushafT: ['The Mushaf', 'މުޞްޙަފު'], mushafSum: ['Arabic only, page by page, like the printed book.', 'ހަމައެކަނި ޢަރަބި، ޞަފްޙާއިން ޞަފްޙާއަށް.'],
  stories: ['Stories', 'ވާހަކަ'], kids: ['Children', 'ކުދިން'], learn: ['Learn', 'ދަސްކުރޭ'], arabicT: ['Arabic', 'ޢަރަބި'],
  letters: ['Letters', 'އަކުރުތައް'], wordPractice: ['Word practice', 'ބަސް ފަރިތަކުރުން'], lessons: ['Lessons', 'ފިލާވަޅުތައް'], formsT: ['At the start, in the middle, at the end', 'ފެށުމުގައި، މެދުގައި، ނިމުމުގައި'], aloneT: ['Does not join to the next letter', 'ފަހަތުގެ އަކުރާ ނުގުޅޭ'], soundT: ['Sound', 'އަޑު'], thaanaT: ['Thaana', 'ތާނަ'], exampleT: ['Example', 'މިސާލު'],
  whatMeans: ['What does this word mean?', 'މި ބަހުގެ މާނައަކީ ކޮބާ؟'], correctT: ['Correct', 'ރަނގަޅު'], wrongT: ['It means', 'މާނައަކީ'], learnedT: ['words learned', 'ބަސް ދަސްވެއްޖެ'], nextWord: ['Next word', 'އަނެއް ބަސް'], arabicLede: ['Letters, reading marks and the words that make up most of the Quran.', 'އަކުރުތަކާއި، ފިލިތަކާއި، ޤުރުއާނުގެ ބޮޑު ބައެއް އުފެދިފައިވާ ބަސްތައް.'],
  tapLetter: ['Tap a letter', 'އަކުރެއްގައި ފިއްތާ'], readAloud2: ['Read to me', 'ކިޔައިދީ'],
  appName: ['Sharaf', 'ޝަރަފު'], appMeaning: ['Sharaf: "my mother\'s honour"', 'ޝަރަފު އުންމީ: "އަހަރެންގެ މަންމަގެ ޝަރަފު"'],
  memName: ['Shareefa Ahmed', 'ޝަރީފާ އަޙްމަދު'], memDates: ['24 July 1972 – 18 February 2023', '24 ޖުލައި 1972 – 18 ފެބުރުވަރީ 2023'],
  memShort: ['In memory of our beloved mother,', 'އަޅުގަނޑުމެންގެ ލޯބިވާ މަންމަ،'], memAfter: ['', 'ގެ ހަނދާނުގައި'], memOf: ['In loving memory of', 'ލޯބިވާ މަންމަ، އަލްމަރުޙޫމާ'], memLine: ['This app is dedicated to her memory. If anything in it benefits you, please make dua for her.', 'މި އެޕަކީ އެކަމަނާގެ ހަނދާނުގައި ހަދާފައިވާ އެޕެކެވެ. މި އެޕުން ފައިދާއެއް ލިބިއްޖެ ނަމަ، އެކަމަނާއަށްޓަކައި ދުޢާކޮށްދެއްވާށެވެ.'],
  memAsk: ['Please remember her in your duas', 'އެކަމަނާއަށްޓަކައި ދުޢާކޮށްދެއްވުން އެދެމެވެ'], memTitle: ['A dua for our beloved mother', 'އަޅުގަނޑުމެންގެ ލޯބިވާ މަންމައަށްޓަކައި ދުޢާއެއް'],
  memWhy: ['The Prophet ﷺ said that when a person dies their deeds end except for three: ongoing charity, knowledge that benefits, and a righteous child who prays for them (Muslim 1631). This app was built by her children as that charity and that knowledge. Your dua for her completes it.', 'ނަބިއްޔާ ﷺ ޙަދީޘްކުރެއްވިއެވެ: އިންސާނާ މަރުވުމުން ތިން ކަމެއް ފިޔަވައި އޭނާގެ ޢަމަލުތައް ކެނޑެއެވެ: ދެމިހުންނަ ޞަދަޤާތެއް، ފައިދާކުރާ ޢިލްމެއް، އޭނާއަށް ދުޢާކުރާ ޞާލިޙު ދަރިއެއް (މުސްލިމް 1631). މި އެޕަކީ އެކަމަނާގެ ދަރިން، އެ ޞަދަޤާތާއި އެ ޢިލްމުގެ ގޮތުގައި ހަދާފައިވާ އެޕެކެވެ. އެކަމަނާއަށް ތިބާ ކުރާ ދުޢާއިން އެކަން ފުރިހަމަވެއެވެ.'],
  memMeaning: ['O Allah, forgive her and have mercy on her, give her wellbeing and pardon her. Receive her with honour and make her entrance wide. Wash her with water, snow and hail, and cleanse her of sins as a white garment is cleansed of dirt. Give her a home better than her home and a family better than her family. Admit her to the Garden and protect her from the punishment of the grave and of the Fire.', 'އޭ ﷲ! އެކަމަނާއަށް ފުއްސަވައި ރަޙްމަތްލައްވާނދޭވެ. ޢާފިޔަތު ދެއްވައި މަޢާފުކުރައްވާނދޭވެ. އެކަމަނާގެ މެހެމާންދާރީ ކަރާމާތްތެރިކޮށް، ވަންނަ ތަން ތަނަވަސްކުރައްވާނދޭވެ. ފެނާއި ސްނޯއާއި ގަނޑުފެނުން އެކަމަނާ ދޮވެ، ހުދު ފޮތިގަނޑު ހަޑިން ސާފުކުރާ ފަދައިން ފާފަތަކުން ސާފުކުރައްވާނދޭވެ. އެކަމަނާގެ ގެއަށްވުރެ ހެޔޮ ގެއެއް، އަހުލުންނަށްވުރެ ހެޔޮ އަހުލުންތަކެއް ދެއްވާނދޭވެ. ސުވަރުގެއަށް ވައްދަވައި، ކަށްވަޅުގެ ޢަޛާބާއި ނަރަކައިގެ ޢަޛާބުން ސަލާމަތްކުރައްވާނދޭވެ.'],
  memShort2: ['Or simply say: O Allah, forgive her and have mercy on her.', 'ނުވަތަ ހަމައެކަނި މިހެން ކިޔާށެވެ: އޭ ﷲ! އެކަމަނާއަށް ފުއްސަވައި ރަޙްމަތްލައްވާނދޭވެ.'], shareApp: ['Share this app', 'މި އެޕް ޝެއަރކުރޭ'], copied: ['Link copied', 'ލިންކް ކޮޕީކުރެވިއްޖެ'],
  qibla: ['Qibla', 'ޤިބްލަ'], qiblaSub: ['A compass that points to the Ka\'bah from your island.', 'ތިބާގެ ރަށުން ކަޢުބާއާ ދިމާ ދައްކާ ސަމުގާއެއް.'], qiblaFrom: ['clockwise from true north (west-north-west)', 'އަސްލު އުތުރުން ފެށިގެން ގަޑީގެ ކަށި ދާ ދިމާއަށް (ހުޅަނގު އުތުރު)'],
  startCompass: ['Start the compass', 'ސަމުގާ ފަށާ'], qiblaFacing: ['You are facing the qibla', 'ތިބާ މިހުރީ ޤިބްލައަށް ކުރިމަތިލައިގެން'], turnRight: ['Turn right', 'ކަނާތަށް އެނބުރޭ'], turnLeft: ['Turn left', 'ވާތަށް އެނބުރޭ'],
  compassDenied: ['The compass was not allowed. On iPhone, close and reopen the app, press Start again and choose Allow.', 'ސަމުގާ ބޭނުންކުރުމުގެ ހުއްދަ ނުލިބުނު. އައިފޯނުގައި އެޕް ލައްޕައި އަލުން ހުޅުވައި، ފަށާ ފިއްތައި ހުއްދަ ދޭށެވެ.'], compassNone: ['This device has no compass the app can read. Use the number above with any compass: the gold arrow shows the direction when north on the dial points to true north.', 'މި ޑިވައިސްގައި އެޕަށް ބޭނުންކުރެވޭ ސަމުގާއެއް ނެތް. މަތީގައިވާ އަދަދު ކޮންމެ ސަމުގާއަކާއެކު ބޭނުންކުރޭ.'],
  qTip1: ['Hold the phone flat, like a plate.', 'ފޯނު ތަށްޓެއް ފަދައިން ތިރިކޮށް ހިފަހައްޓާ.'], qTip2: ['Keep away from metal, speakers and magnets. If it looks wrong, move the phone in a figure of eight.', 'ދަގަނޑާއި ސްޕީކަރާއި މެގްނެޓާ ދުރުގައި ބަހައްޓާ. ގޯސްކަމަށް ހީވާ ނަމަ ފޯނު 8 ގެ ބައްޓަމަށް ހަރަކާތްކުރޭ.'], qTip3: ['A phone compass can be a few degrees out. If the mosque nearby faces a slightly different way, follow the mosque.', 'ފޯނުގެ ސަމުގާ މަދު ޑިގްރީއެއް ތަފާތުވެދާނެ. ކައިރީ މިސްކިތް ހުރީ ތަފާތު ދިމާއަކަށް ނަމަ މިސްކިތާ އެއްގޮތްކުރޭ.'],
  cdIn: ['in', 'އަށް ބާކީ'], cdNow: ['It is time for', 'ނަމާދު ވަގުތު ޖެހިއްޖެ'], cdPrayed: ['I have prayed', 'ނަމާދުކޮށްފިން'],
  catchAsk: ['Have you prayed these today?', 'މިއަދު މި ނަމާދުތައް ކުރެވުނުތަ؟'], catchAll: ['Yes, all of them', 'އާނ، ހުރިހާ ނަމާދެއް'], catchLater: ['Not now', 'މިހާރު ނޫން'],
  foldHint: ['Drag the page from its edge or corner to turn it. Tap an ayah to hear it.', 'ޞަފްޙާ އުކުމަށް އޭގެ އަރިމަތިން ނުވަތަ ކަނުން ދަމާ. އާޔަތެއް އަޑުއެހުމަށް ފިއްތާ.'],
  notifOn: ['Alerts are on for the prayers below', 'ތިރީގައިވާ ނަމާދުތަކަށް އެލާޓް ޖައްސާފައި'],
  notifCta: ['Turn on prayer-time alerts', 'ނަމާދު ވަގުތުގެ އެލާޓް ޖައްސާ'], notifCtaSub: ['Get a notification at each prayer time', 'ކޮންމެ ނަމާދު ވަގުތެއްގައި ނޮޓިފިކޭޝަނެއް'],
  articles: ['articles', 'ލިޔުން'], back: ['Back', 'ފަހަތަށް'], step: ['Step', 'މަރުޙަލާ'], of: ['of', '/'],
};
export const t = (k) => (T[k] ? T[k][settings.lang === 'dv' ? 1 : 0] : k);
export const pick = (o, f) => (settings.lang === 'dv' && o[f + '_dv'] ? o[f + '_dv'] : o[f + '_en']);
export const isDv = () => settings.lang === 'dv';

// ---------- prayer times ----------
export const PRAYERS = ['fajr', 'sunrise', 'dhuhr', 'asr', 'maghrib', 'isha'];
export function mvNow() { return new Date(Date.now() + 5 * 3600000); } // Maldives is UTC+5, no DST
export function dayIndex(d) {
  const y = d.getUTCFullYear();
  const doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86400000);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return !leap && doy >= 59 ? doy + 1 : doy;
}
export function timesFor(data, islandId, d = mvNow()) {
  const isl = data.islands.find((i) => i.id === islandId) || data.islands.find((i) => i.id === 102);
  return { island: isl, times: data.groups[isl.g][dayIndex(d)].map((m) => m + isl.o) };
}
export const fmtTime = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
export function fmtSpan(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return isDv() ? `${h ? h + ' ގަޑި ' : ''}${m} މިނެޓް` : `${h ? h + ' h ' : ''}${m} min`;
}
const DV_DAYS = ['އާދީއްތަ', 'ހޯމަ', 'އަންގާރަ', 'ބުދަ', 'ބުރާސްފަތި', 'ހުކުރު', 'ހޮނިހިރު'];
const DV_MONTHS = ['ޖަނަވަރީ', 'ފެބުރުވަރީ', 'މާރިޗު', 'އެޕްރީލް', 'މޭ', 'ޖޫން', 'ޖުލައި', 'އޮގަސްޓު', 'ސެޕްޓެންބަރު', 'އޮކްޓޫބަރު', 'ނޮވެންބަރު', 'ޑިސެންބަރު'];
const DV_HIJRI = ['މުޙައްރަމް', 'ޞަފަރު', 'ރަބީޢުލްއައްވަލް', 'ރަބީޢުލްއާޚިރު', 'ޖުމާދަލްއޫލާ', 'ޖުމާދަލްއާޚިރާ', 'ރަޖަބު', 'ޝަޢުބާން', 'ރަމަޟާން', 'ޝައްވާލް', 'ޛުލްޤަޢިދާ', 'ޛުލްޙިއްޖާ'];
// Browsers have no Dhivehi date names, so those are supplied here.
export function today() {
  const d = mvNow();
  if (!isDv()) return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(d);
  return `${DV_DAYS[d.getUTCDay()]}، ${d.getUTCDate()} ${DV_MONTHS[d.getUTCMonth()]}`;
}
// Hijri month (1-12), day and weekday (0 = Sunday) for a Maldives date, by the Umm al-Qura calculation.
export function hijriParts(d = mvNow()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(d).map((x) => [x.type, x.value]));
    return { m: +p.month, d: +p.day, w: d.getUTCDay() };
  } catch { return { m: 0, d: 0, w: d.getUTCDay() }; }
}
// Which entries of the "special days" section apply to a date. Returns item ids.
export function dayNotes(d = mvNow()) {
  const { m, d: day, w } = hijriParts(d), out = [];
  const noFast = (m === 10 && day === 1) || (m === 12 && day >= 10 && day <= 13);
  if (m === 9) out.push(day >= 20 ? 'day-last-ten' : 'day-ramadan');
  if (m === 10 && day === 1) out.push('day-eid-fitr');
  if (m === 10 && day > 1) out.push('day-shawwal-six');
  if (m === 12 && day <= 8) out.push('day-dhul-hijjah-ten');
  if (m === 12 && day === 9) out.push('day-arafah');
  if (m === 12 && day >= 10 && day <= 13) out.push('day-eid-adha');
  if (m === 1 && (day === 9 || day === 10)) out.push('day-ashura');
  if (m === 8) out.push('day-shaban');
  if (w === 5) out.push('day-friday');
  if (m !== 9 && !noFast) {
    if (day >= 13 && day <= 15) out.push('day-white-days');
    if (w === 1 || w === 4) out.push('day-monday-thursday');
  }
  return out;
}
export function hijri() {
  try {
    const d = mvNow();
    if (!isDv()) return new Intl.DateTimeFormat('en-GB-u-ca-islamic-umalqura', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatToParts(d).map((x) => [x.type, x.value]));
    return `${parts.day} ${DV_HIJRI[+parts.month - 1]} ${parts.year}`;
  } catch { return ''; }
}

// ---------- data loading ----------
const mem = new Map();
export async function getJSON(url, { fresh = false } = {}) {
  if (!fresh && mem.has(url)) return mem.get(url);
  const p = fetch(url).then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); });
  mem.set(url, p);
  p.catch(() => mem.delete(url));
  return p;
}
export const forget = (prefix) => { for (const k of mem.keys()) if (k.startsWith(prefix)) mem.delete(k); };
export async function api(path, opts = {}) {
  const res = await fetch('/api' + path, { ...opts, headers: opts.body && typeof opts.body === 'string' ? { 'Content-Type': 'application/json', ...(opts.headers || {}) } : opts.headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
export const ayahUrl = (s, a, reciter = settings.reciter) => `https://everyayah.com/data/${reciter}/${String(s).padStart(3, '0')}${String(a).padStart(3, '0')}.mp3`;
// "q:2:255" or "q:1:1-7" -> list of [surah, ayah]
export function parseQuranRef(audio) {
  const m = /^q:(\d+):(\d+)(?:-(\d+))?$/.exec(audio || '');
  if (!m) return null;
  const out = [];
  for (let a = +m[2]; a <= +(m[3] || m[2]); a++) out.push([+m[1], a]);
  return out;
}

// ---------- tiny markdown (headings, lists, quotes, bold, italics) ----------
function inline(s) {
  const parts = s.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p) => (p.startsWith('**') ? html`<strong>${p.slice(2, -2)}</strong>` : p.startsWith('*') && p.length > 2 ? html`<em>${p.slice(1, -1)}</em>` : p));
}
export function Markdown({ text }) {
  const blocks = [];
  let list = null, para = [];
  const flush = () => {
    if (para.length) { blocks.push(html`<p>${inline(para.join(' '))}</p>`); para = []; }
    if (list) { blocks.push(list.ordered ? html`<ol>${list.items.map((i) => html`<li>${inline(i)}</li>`)}</ol>` : html`<ul>${list.items.map((i) => html`<li>${inline(i)}</li>`)}</ul>`); list = null; }
  };
  for (const raw of (text || '').split('\n')) {
    const line = raw.trim();
    let m;
    if (!line) flush();
    else if ((m = /^(#{2,3})\s+(.*)$/.exec(line))) { flush(); blocks.push(m[1].length === 2 ? html`<h2>${inline(m[2])}</h2>` : html`<h3>${inline(m[2])}</h3>`); }
    else if ((m = /^[-•]\s+(.*)$/.exec(line))) { if (para.length || (list && list.ordered)) flush(); (list ||= { ordered: false, items: [] }).items.push(m[1]); }
    else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) { if (para.length || (list && !list.ordered)) flush(); (list ||= { ordered: true, items: [] }).items.push(m[1]); }
    else if ((m = /^>\s?(.*)$/.exec(line))) { flush(); blocks.push(html`<blockquote>${inline(m[1])}</blockquote>`); }
    else { if (list) flush(); para.push(line); }
  }
  flush();
  return html`<div class="prose">${blocks}</div>`;
}
