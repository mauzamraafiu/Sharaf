import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { ISLANDS } from './islands.js';
import { generateVapid, sendPush } from './push.js';

const SCHEMA_VERSION = '3';
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS sections (id TEXT PRIMARY KEY, area TEXT NOT NULL, title_en TEXT NOT NULL, title_dv TEXT NOT NULL DEFAULT '', summary_en TEXT NOT NULL DEFAULT '', summary_dv TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, section_id TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'article', title_en TEXT NOT NULL, title_dv TEXT NOT NULL DEFAULT '', body_en TEXT NOT NULL DEFAULT '', body_dv TEXT NOT NULL DEFAULT '', arabic TEXT NOT NULL DEFAULT '', translit TEXT NOT NULL DEFAULT '', ref TEXT NOT NULL DEFAULT '', audio TEXT NOT NULL DEFAULT '', sort INTEGER NOT NULL DEFAULT 0, dv_reviewed INTEGER NOT NULL DEFAULT 0, edited INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS items_section ON items (section_id, sort)`,
  `CREATE TABLE IF NOT EXISTS audio_files (item_id TEXT PRIMARY KEY, mime TEXT NOT NULL, data BLOB NOT NULL, updated_at INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS push_subs (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, island_id INTEGER NOT NULL, prayers INTEGER NOT NULL DEFAULT 31, lead_min INTEGER NOT NULL DEFAULT 0, last_key INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL)`,
  `CREATE INDEX IF NOT EXISTS push_due ON push_subs (lead_min, island_id)`,
  `CREATE TABLE IF NOT EXISTS login_attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS counters (key TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL DEFAULT 0)`,
];

let schemaReady = false;
async function ensureSchema(db) {
  if (schemaReady) return;
  let v = null;
  try {
    v = (await db.prepare(`SELECT value FROM meta WHERE key='schema'`).first())?.value;
  } catch {}
  if (v !== SCHEMA_VERSION) {
    await db.batch([...SCHEMA.map((s) => db.prepare(s)), db.prepare(`INSERT INTO meta (key,value) VALUES ('schema',?1) ON CONFLICT(key) DO UPDATE SET value=?1`).bind(SCHEMA_VERSION)]);
  }
  schemaReady = true;
}

async function getMeta(db) {
  const { results } = await db.prepare(`SELECT key, value FROM meta`).all();
  return Object.fromEntries(results.map((r) => [r.key, r.value]));
}
const setMeta = (db, key, value) => db.prepare(`INSERT INTO meta (key,value) VALUES (?1,?2) ON CONFLICT(key) DO UPDATE SET value=?2`).bind(key, String(value));

// ---------- content import (seed files live in public/seed) ----------
async function asset(env, path) {
  const res = await env.ASSETS.fetch(new Request('https://assets.local' + path));
  if (!res.ok) throw new Error('missing asset ' + path);
  return res.json();
}

// Imports at most one seed file per call so a call stays inside the free plan's query limit.
async function seedStep(env, meta) {
  const index = await asset(env, '/seed/index.json');
  let pos = meta.seed_version === index.version ? Number(meta.seed_pos || 0) : 0;
  if (pos >= index.files.length) return { done: true, pos, total: index.files.length };
  const file = await asset(env, '/seed/' + index.files[pos]);
  const db = env.DB;
  const now = Date.now();
  const stmts = [];
  for (const s of file.sections || []) {
    stmts.push(db.prepare(`INSERT INTO sections (id,area,title_en,title_dv,summary_en,summary_dv,sort) VALUES (?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(id) DO UPDATE SET area=?2,title_en=?3,title_dv=?4,summary_en=?5,summary_dv=?6,sort=?7`).bind(s.id, s.area, s.title_en, s.title_dv || '', s.summary_en || '', s.summary_dv || '', s.sort || 0));
  }
  for (const it of file.items || []) {
    stmts.push(db.prepare(`INSERT INTO items (id,section_id,kind,title_en,title_dv,body_en,body_dv,arabic,translit,ref,audio,sort,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13)
      ON CONFLICT(id) DO UPDATE SET section_id=?2,kind=?3,title_en=?4,title_dv=?5,body_en=?6,body_dv=?7,arabic=?8,translit=?9,ref=?10,audio=CASE WHEN items.audio='file' THEN 'file' ELSE ?11 END,sort=?12,updated_at=?13 WHERE items.edited=0`)
      .bind(it.id, it.section, it.kind || 'article', it.title_en, it.title_dv || '', it.body_en || '', it.body_dv || '', it.arabic || '', it.translit || '', it.ref || '', it.audio || '', it.sort || 0, now));
  }
  pos++;
  stmts.push(setMeta(db, 'seed_version', index.version), setMeta(db, 'seed_pos', pos), setMeta(db, 'content_rev', now));
  await db.batch(stmts);
  return { done: pos >= index.files.length, pos, total: index.files.length };
}

// ---------- admin session ----------
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg)));
}
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
async function isAdmin(c) {
  const pw = c.env.ADMIN_PASSWORD;
  const tok = getCookie(c, 'dheen_admin');
  if (!pw || !tok) return false;
  const [exp, sig] = tok.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(pw, 'admin:' + exp));
}

const app = new Hono();

app.use('/api/*', async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store');
});
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: 'Something went wrong on the server. Try again.' }, 500);
});

// ---------- public content ----------
app.get('/api/bootstrap', async (c) => {
  const db = c.env.DB;
  const [meta, sections, items, index] = await Promise.all([
    getMeta(db),
    db.prepare(`SELECT * FROM sections ORDER BY sort, id`).all(),
    db.prepare(`SELECT id, section_id, kind, title_en, title_dv, sort, dv_reviewed FROM items ORDER BY section_id, sort, id`).all(),
    asset(c.env, '/seed/index.json'),
  ]);
  const seeding = meta.seed_version !== index.version || Number(meta.seed_pos || 0) < index.files.length;
  return c.json({ sections: sections.results, items: items.results, rev: meta.content_rev || '0', seeding });
});

// Shared totals shown on the memorial page: how many times people did a good deed in her memory.
const COUNTER_KEYS = ['dua', 'sadaqah', 'quran'];
const readCounters = async (db) => Object.fromEntries((await db.prepare('SELECT key, n FROM counters').all()).results.map((r) => [r.key, r.n]));
app.get('/api/counters', async (c) => { await ensureSchema(c.env.DB); return c.json(await readCounters(c.env.DB)); });
app.post('/api/counters/:key', async (c) => {
  const key = c.req.param('key');
  if (!COUNTER_KEYS.includes(key)) return c.json({ error: 'unknown' }, 400);
  await ensureSchema(c.env.DB);
  await c.env.DB.prepare('INSERT INTO counters (key, n) VALUES (?1, 1) ON CONFLICT(key) DO UPDATE SET n = n + 1').bind(key).run();
  return c.json(await readCounters(c.env.DB));
});
app.post('/api/seed-step', async (c) => c.json(await seedStep(c.env, await getMeta(c.env.DB))));

app.get('/api/sections/:id', async (c) => {
  const { results } = await c.env.DB.prepare(`SELECT id, section_id, kind, title_en, title_dv, body_en, body_dv, arabic, translit, ref, audio, sort, dv_reviewed FROM items WHERE section_id=?1 ORDER BY sort, id`).bind(c.req.param('id')).all();
  return c.json({ items: results });
});

app.get('/api/search', async (c) => {
  const q = (c.req.query('q') || '').trim().slice(0, 60);
  if (q.length < 2) return c.json({ items: [] });
  const like = '%' + q.replace(/[%_\\]/g, (m) => '\\' + m) + '%';
  const { results } = await c.env.DB.prepare(`SELECT id, section_id, kind, title_en, title_dv,
      CASE WHEN title_en LIKE ?1 ESCAPE '\\' OR title_dv LIKE ?1 ESCAPE '\\' THEN 0 ELSE 1 END AS rank
    FROM items WHERE title_en LIKE ?1 ESCAPE '\\' OR title_dv LIKE ?1 ESCAPE '\\' OR body_en LIKE ?1 ESCAPE '\\' OR body_dv LIKE ?1 ESCAPE '\\' OR translit LIKE ?1 ESCAPE '\\'
    ORDER BY rank, sort LIMIT 40`).bind(like).all();
  return c.json({ items: results });
});

app.get('/api/audio/:id', async (c) => {
  const row = await c.env.DB.prepare(`SELECT mime, data, updated_at FROM audio_files WHERE item_id=?1`).bind(c.req.param('id')).first();
  if (!row) return c.json({ error: 'No recording for this item.' }, 404);
  return new Response(new Uint8Array(row.data), { headers: { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=86400', 'Accept-Ranges': 'none' } });
});

// ---------- push ----------
async function vapidFor(db, meta) {
  if (meta.vapid) return JSON.parse(meta.vapid);
  const v = await generateVapid();
  await db.prepare(`INSERT INTO meta (key,value) VALUES ('vapid',?1) ON CONFLICT(key) DO NOTHING`).bind(JSON.stringify(v)).run();
  return JSON.parse((await db.prepare(`SELECT value FROM meta WHERE key='vapid'`).first()).value);
}
app.get('/api/push/key', async (c) => c.json({ key: (await vapidFor(c.env.DB, await getMeta(c.env.DB))).publicKey }));

app.post('/api/push/subscribe', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const island = ISLANDS.find((i) => i[0] === Number(b.island));
  let host = '';
  try { host = new URL(b.endpoint).protocol === 'https:' ? new URL(b.endpoint).hostname : ''; } catch {}
  if (!island || !host) return c.json({ error: 'Choose an island and allow notifications first.' }, 400);
  const prayers = Math.max(0, Math.min(31, Number(b.prayers ?? 31) | 0));
  const lead = [0, 5, 10, 15].includes(Number(b.lead)) ? Number(b.lead) : 0;
  await c.env.DB.prepare(`INSERT INTO push_subs (endpoint, island_id, prayers, lead_min, created_at) VALUES (?1,?2,?3,?4,?5)
    ON CONFLICT(endpoint) DO UPDATE SET island_id=?2, prayers=?3, lead_min=?4`).bind(b.endpoint, island[0], prayers, lead, Date.now()).run();
  return c.json({ ok: true });
});
app.post('/api/push/unsubscribe', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  await c.env.DB.prepare(`DELETE FROM push_subs WHERE endpoint=?1`).bind(String(b.endpoint || '')).run();
  return c.json({ ok: true });
});

// ---------- admin ----------
app.post('/api/admin/login', async (c) => {
  const pw = c.env.ADMIN_PASSWORD;
  if (!pw) return c.json({ error: 'No admin password is set. Add the ADMIN_PASSWORD secret in Cloudflare, then try again.' }, 503);
  const db = c.env.DB;
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const now = Date.now();
  const recent = await db.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip=?1 AND ts>?2`).bind(ip, now - 15 * 60000).first();
  if (recent.n >= 5) return c.json({ error: 'Too many wrong passwords. Wait 15 minutes and try again.' }, 429);
  const b = await c.req.json().catch(() => ({}));
  const [a, e] = await Promise.all([hmac('cmp', String(b.password || '')), hmac('cmp', pw)]);
  if (!safeEqual(a, e)) {
    await db.batch([db.prepare(`INSERT INTO login_attempts (ip, ts) VALUES (?1,?2)`).bind(ip, now), db.prepare(`DELETE FROM login_attempts WHERE ts<?1`).bind(now - 86400000)]);
    return c.json({ error: 'Wrong password.' }, 401);
  }
  const exp = now + 12 * 3600000;
  setCookie(c, 'dheen_admin', `${exp}.${await hmac(pw, 'admin:' + exp)}`, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Strict', path: '/', maxAge: 12 * 3600 });
  return c.json({ ok: true });
});
app.post('/api/admin/logout', (c) => { deleteCookie(c, 'dheen_admin', { path: '/' }); return c.json({ ok: true }); });
app.get('/api/admin/me', async (c) => c.json({ admin: await isAdmin(c) }));

app.use('/api/admin/*', async (c, next) => {
  if (!(await isAdmin(c))) return c.json({ error: 'Sign in as admin first.' }, 401);
  await next();
});

app.get('/api/admin/stats', async (c) => {
  const db = c.env.DB;
  const [items, subs] = await Promise.all([
    db.prepare(`SELECT COUNT(*) AS total, SUM(dv_reviewed) AS reviewed, SUM(edited) AS edited FROM items`).first(),
    db.prepare(`SELECT COUNT(*) AS n FROM push_subs`).first(),
  ]);
  return c.json({ items, subscribers: subs.n });
});
app.get('/api/admin/items/:id', async (c) => c.json({ item: await c.env.DB.prepare(`SELECT * FROM items WHERE id=?1`).bind(c.req.param('id')).first() }));

const FIELDS = ['section_id', 'kind', 'title_en', 'title_dv', 'body_en', 'body_dv', 'arabic', 'translit', 'ref', 'audio', 'sort', 'dv_reviewed'];
app.put('/api/admin/items/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  if (!/^[a-z0-9-]{2,80}$/.test(id)) return c.json({ error: 'Use lowercase letters, numbers and dashes for the ID.' }, 400);
  const b = await c.req.json().catch(() => ({}));
  if (!b.title_en || !b.section_id) return c.json({ error: 'An English title and a section are required.' }, 400);
  const v = FIELDS.map((f) => (f === 'sort' || f === 'dv_reviewed' ? Number(b[f] || 0) : String(b[f] ?? (f === 'kind' ? 'article' : ''))));
  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO items (id, ${FIELDS.join(',')}, edited, updated_at) VALUES (?1, ${FIELDS.map((_, i) => '?' + (i + 2)).join(',')}, 1, ?${FIELDS.length + 2})
      ON CONFLICT(id) DO UPDATE SET ${FIELDS.map((f, i) => `${f}=?${i + 2}`).join(',')}, edited=1, updated_at=?${FIELDS.length + 2}`).bind(id, ...v, now),
    setMeta(db, 'content_rev', now),
  ]);
  return c.json({ ok: true });
});
app.delete('/api/admin/items/:id', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  await db.batch([db.prepare(`DELETE FROM items WHERE id=?1`).bind(id), db.prepare(`DELETE FROM audio_files WHERE item_id=?1`).bind(id), setMeta(db, 'content_rev', Date.now())]);
  return c.json({ ok: true });
});
app.put('/api/admin/items/:id/audio', async (c) => {
  const db = c.env.DB;
  const id = c.req.param('id');
  const mime = c.req.header('Content-Type') || '';
  if (!/^audio\/(mpeg|mp4|aac|ogg|webm|wav|x-m4a)/.test(mime)) return c.json({ error: 'Upload an audio file (MP3, M4A, OGG or WAV).' }, 400);
  const buf = await c.req.arrayBuffer();
  if (buf.byteLength > 1500000) return c.json({ error: 'The recording is over 1.5 MB. Shorten it or lower the quality, then upload again.' }, 413);
  const now = Date.now();
  await db.batch([
    db.prepare(`INSERT INTO audio_files (item_id, mime, data, updated_at) VALUES (?1,?2,?3,?4) ON CONFLICT(item_id) DO UPDATE SET mime=?2, data=?3, updated_at=?4`).bind(id, mime.split(';')[0], buf, now),
    db.prepare(`UPDATE items SET audio='file', updated_at=?2 WHERE id=?1`).bind(id, now),
    setMeta(db, 'content_rev', now),
  ]);
  return c.json({ ok: true });
});
app.put('/api/admin/sections/:id', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const id = c.req.param('id');
  if (!/^[a-z0-9-]{2,60}$/.test(id) || !b.title_en || !b.area) return c.json({ error: 'A section needs an ID, an area and an English title.' }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare(`INSERT INTO sections (id,area,title_en,title_dv,summary_en,summary_dv,sort) VALUES (?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(id) DO UPDATE SET area=?2,title_en=?3,title_dv=?4,summary_en=?5,summary_dv=?6,sort=?7`).bind(id, b.area, b.title_en, b.title_dv || '', b.summary_en || '', b.summary_dv || '', Number(b.sort || 0)),
    setMeta(c.env.DB, 'content_rev', Date.now()),
  ]);
  return c.json({ ok: true });
});

// Recitation files fetched through the Worker, used only when a browser cannot download them directly for offline use.
app.get('/api/audio-proxy/:reciter/:file', async (c) => {
  const { reciter, file } = c.req.param();
  if (!/^[A-Za-z0-9_.-]{3,80}$/.test(reciter) || !/^\d{6}\.mp3$/.test(file)) return c.json({ error: 'Not found.' }, 404);
  const up = await fetch(`https://everyayah.com/data/${reciter}/${file}`, { cf: { cacheEverything: true, cacheTtl: 2592000 } });
  if (!up.ok) return c.json({ error: 'Recitation not available.' }, 502);
  return new Response(up.body, { headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=31536000, immutable' } });
});

// ---------- reader accounts: sign in to keep reading progress and counters across devices ----------
// 20,000 PBKDF2 rounds keeps a sign-in inside the free plan's CPU allowance. Passwords are salted and never stored.
async function passHash(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = Uint8Array.from(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 20000 }, key, 256));
}
async function sessionSecret(db) {
  const row = await db.prepare(`SELECT value FROM meta WHERE key='session_secret'`).first();
  if (row) return row.value;
  const s = hex(crypto.getRandomValues(new Uint8Array(32)));
  await db.prepare(`INSERT INTO meta (key,value) VALUES ('session_secret',?1) ON CONFLICT(key) DO NOTHING`).bind(s).run();
  return (await db.prepare(`SELECT value FROM meta WHERE key='session_secret'`).first()).value;
}
async function startSession(c, uid) {
  const exp = Date.now() + 90 * 86400000;
  const sig = await hmac(await sessionSecret(c.env.DB), `u:${uid}:${exp}`);
  setCookie(c, 'dheen_user', `${uid}.${exp}.${sig}`, { httpOnly: true, secure: new URL(c.req.url).protocol === 'https:', sameSite: 'Lax', path: '/', maxAge: 90 * 86400 });
}
async function currentUser(c) {
  const [uid, exp, sig] = (getCookie(c, 'dheen_user') || '').split('.');
  if (!uid || !sig || Number(exp) < Date.now()) return null;
  if (!safeEqual(sig, await hmac(await sessionSecret(c.env.DB), `u:${uid}:${exp}`))) return null;
  return Number(uid);
}
const cleanName = (s) => String(s || '').trim().toLowerCase();
async function tooManyTries(c) {
  const ip = c.req.header('CF-Connecting-IP') || 'local';
  const n = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM login_attempts WHERE ip=?1 AND ts>?2`).bind('u:' + ip, Date.now() - 15 * 60000).first();
  return n.n >= 8 ? ip : null;
}
app.post('/api/account/register', async (c) => {
  const b = await c.req.json().catch(() => ({}));
  const username = cleanName(b.username), password = String(b.password || '');
  if (!/^[a-z0-9_.@+-]{3,60}$/.test(username)) return c.json({ error: 'Use your email, or a username of 3 or more letters and numbers.' }, 400);
  if (password.length < 8) return c.json({ error: 'Use a password of at least 8 characters.' }, 400);
  if (await tooManyTries(c)) return c.json({ error: 'Too many attempts. Wait 15 minutes and try again.' }, 429);
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  const now = Date.now();
  try {
    const r = await c.env.DB.prepare(`INSERT INTO users (username, salt, hash, created_at) VALUES (?1,?2,?3,?4)`).bind(username, salt, await passHash(password, salt), now).run();
    await startSession(c, r.meta.last_row_id);
  } catch { return c.json({ error: 'That username is taken. Choose another.' }, 409); }
  return c.json({ user: username, data: {} });
});
app.post('/api/account/login', async (c) => {
  const db = c.env.DB;
  const b = await c.req.json().catch(() => ({}));
  if (await tooManyTries(c)) return c.json({ error: 'Too many wrong attempts. Wait 15 minutes and try again.' }, 429);
  const row = await db.prepare(`SELECT id, username, salt, hash, data FROM users WHERE username=?1`).bind(cleanName(b.username)).first();
  if (!row || !safeEqual(row.hash, await passHash(String(b.password || ''), row.salt))) {
    await db.prepare(`INSERT INTO login_attempts (ip, ts) VALUES (?1,?2)`).bind('u:' + (c.req.header('CF-Connecting-IP') || 'local'), Date.now()).run();
    return c.json({ error: 'Wrong email or password. If you have not made an account yet, press Create account.' }, 401);
  }
  await startSession(c, row.id);
  return c.json({ user: row.username, data: JSON.parse(row.data || '{}') });
});
app.post('/api/account/logout', (c) => { deleteCookie(c, 'dheen_user', { path: '/' }); return c.json({ ok: true }); });
app.get('/api/account/me', async (c) => {
  const uid = await currentUser(c);
  if (!uid) return c.json({ user: null });
  const row = await c.env.DB.prepare(`SELECT username, data FROM users WHERE id=?1`).bind(uid).first();
  return c.json(row ? { user: row.username, data: JSON.parse(row.data || '{}') } : { user: null });
});
app.put('/api/account/data', async (c) => {
  const uid = await currentUser(c);
  if (!uid) return c.json({ error: 'Sign in first.' }, 401);
  const text = await c.req.text();
  if (text.length > 60000) return c.json({ error: 'Too much data to save.' }, 413);
  try { JSON.parse(text); } catch { return c.json({ error: 'Bad data.' }, 400); }
  await c.env.DB.prepare(`UPDATE users SET data=?1, updated_at=?2 WHERE id=?3`).bind(text, Date.now(), uid).run();
  return c.json({ ok: true });
});

app.all('/api/*', (c) => c.json({ error: 'Not found.' }, 404));

// ---------- cron: content import, then prayer notifications ----------
const MV_OFFSET_MS = 5 * 3600000;
export function dayIndex(d) {
  // d is a Date already shifted to Maldives time; table has 366 rows (29 Feb at 59).
  const y = d.getUTCFullYear();
  const doy = Math.floor((Date.UTC(y, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(y, 0, 1)) / 86400000);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return !leap && doy >= 59 ? doy + 1 : doy;
}
const PRAYER_COL = [0, 2, 3, 4, 5]; // fajr, dhuhr, asr, maghrib, isha in the day row
const LATE_WINDOW = 10; // keep sending for this many minutes if a minute's batch was full
const BATCH = 40; // stays under the 50 subrequests a free-plan run may make

async function notifyDue(env, meta) {
  const db = env.DB;
  const mv = new Date(Date.now() + MV_OFFSET_MS);
  const di = dayIndex(mv);
  const minute = mv.getUTCHours() * 60 + mv.getUTCMinutes();
  // Cheap pre-check before touching assets: is any prayer anywhere near now?
  const day = await asset(env, `/data/day/${di}.json`);
  const due = new Map(); // "lead:prayer" -> island ids
  for (const [id, g, off] of ISLANDS) {
    const row = day[g];
    if (!row) continue;
    for (let p = 0; p < 5; p++) {
      const t = row[PRAYER_COL[p]] + off;
      for (const lead of [0, 5, 10, 15]) {
        const send = t - lead;
        if (minute >= send && minute <= send + LATE_WINDOW) {
          const k = `${lead}:${p}`;
          if (!due.has(k)) due.set(k, []);
          due.get(k).push(id);
        }
        // People who are warned ahead also get a second alert when the time itself arrives.
        if (lead === 0 && minute >= t && minute <= t + 1) {
          const k = `T:${p}`;
          if (!due.has(k)) due.set(k, []);
          due.get(k).push(id);
        }
      }
    }
  }
  const subs = [];
  // Friday morning, 09:00 to 09:20 in the Maldives: one reminder to read al-Kahf, when no prayer alert is due.
  if (!due.size && mv.getUTCDay() === 5 && minute >= 540 && minute <= 560) {
    const key = 2000000 + di;
    const { results } = await db.prepare('SELECT id, endpoint FROM push_subs WHERE last_key != ?1 LIMIT ?2').bind(key, BATCH).all();
    for (const r of results) subs.push({ ...r, key });
  }
  if (!due.size && !subs.length) return 0;
  for (const [k, ids] of due) {
    if (subs.length >= BATCH) break;
    const atTime = k.startsWith('T:');
    const [lead, p] = atTime ? [0, Number(k.slice(2))] : k.split(':').map(Number);
    // last_key remembers the last alert sent to a subscriber, so nobody gets the same one twice.
    const key = atTime ? 1000000 + di * 10 + p + 1 : di * 10 + p + 1;
    const { results } = await db.prepare(`SELECT id, endpoint FROM push_subs WHERE ${atTime ? 'lead_min > ?1' : 'lead_min = ?1'} AND island_id IN (${ids.join(',')}) AND (prayers & ?2) != 0 AND last_key != ?3 ${atTime ? '' : 'AND last_key != ?5'} LIMIT ?4`)
      .bind(lead, 1 << p, key, BATCH - subs.length, ...(atTime ? [] : [1000000 + di * 10 + p + 1])).all();
    for (const r of results) subs.push({ ...r, key });
  }
  if (!subs.length) return 0;
  const vapid = await vapidFor(db, meta);
  const tokens = meta.vapid_tokens ? JSON.parse(meta.vapid_tokens) : {};
  const subject = env.PUSH_CONTACT || 'mailto:admin@example.com';
  let tokensChanged = false;
  const sent = [], gone = [];
  await Promise.all(subs.map(async (s) => {
    try {
      const r = await sendPush(s.endpoint, vapid, tokens, subject);
      tokensChanged = tokensChanged || r.changed;
      if (r.status === 404 || r.status === 410) gone.push(s.id);
      else sent.push(s);
    } catch { sent.push(s); }
  }));
  const stmts = [];
  const byKey = {};
  for (const s of sent) (byKey[s.key] ||= []).push(s.id);
  for (const [key, ids] of Object.entries(byKey)) stmts.push(db.prepare(`UPDATE push_subs SET last_key=?1 WHERE id IN (${ids.join(',')})`).bind(Number(key)));
  if (gone.length) stmts.push(db.prepare(`DELETE FROM push_subs WHERE id IN (${gone.join(',')})`));
  if (tokensChanged) stmts.push(setMeta(db, 'vapid_tokens', JSON.stringify(tokens)));
  if (stmts.length) await db.batch(stmts);
  return sent.length;
}

export default {
  fetch: app.fetch,
  async scheduled(event, env, ctx) {
    await ensureSchema(env.DB);
    const meta = await getMeta(env.DB);
    const index = await asset(env, '/seed/index.json');
    const seeding = meta.seed_version !== index.version || Number(meta.seed_pos || 0) < index.files.length;
    if (seeding) await seedStep(env, meta);
    else await notifyDue(env, meta);
  },
};
