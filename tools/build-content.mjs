// Turns the readable files in content/ into the seed files the Worker imports (public/seed).
// Run with: npm run content
//
// File format (content/*.txt, read in name order):
//   %% section-id | area | Title | Dhivehi title | Summary | Dhivehi summary
//   @@ item-id
//   title_en: ...          (also: title_dv, kind, arabic, translit, ref, audio)
//   --- en
//   English body (## headings, - lists, **bold**)
//   --- dv
//   Dhivehi body
//   @q 2:201 | Title | Dhivehi title      (a dua taken straight from the Quran files)
// "arabic: @q:1:1-7" pulls the Arabic from the Quran files instead of typing it.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const quran = (n) => JSON.parse(fs.readFileSync(path.resolve('public/quran', n + '.json'), 'utf8'));
function ayahs(ref) {
  const m = /^(\d+):(\d+)(?:-(\d+))?$/.exec(ref.trim());
  if (!m) throw new Error('bad Quran reference: ' + ref);
  const su = quran(+m[1]);
  const out = [];
  for (let a = +m[2]; a <= +(m[3] || m[2]); a++) { if (!su.ayahs[a - 1]) throw new Error('no such ayah ' + ref); out.push(su.ayahs[a - 1]); }
  return { su, list: out, s: +m[1], from: +m[2], to: +(m[3] || m[2]) };
}

const nawawi = JSON.parse(fs.readFileSync(path.resolve('tools/data/nawawi.json'), 'utf8'));
const dataLines = (f) => fs.readFileSync(path.resolve('tools/data', f), 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((l) => l.split(' | ').map((x) => x.trim()));
const nawawiDv = Object.fromEntries(dataLines('nawawi-dv.txt'));
const hisn = JSON.parse(fs.readFileSync(path.resolve('tools/data/hisn.json'), 'utf8'));
const sections = [], items = [], seen = new Set();
let section = null, kindDefault = 'article';
const dir = path.resolve('content');
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.txt')).sort()) {
  const lines = fs.readFileSync(path.join(dir, f), 'utf8').split(/\r?\n/);
  let item = null, mode = 'head';
  const close = () => {
    if (!item) return;
    for (const k of ['body_en', 'body_dv']) item[k] = (item[k] || '').trim();
    if (!item.title_en) throw new Error(`${f}: ${item.id} has no title_en`);
    if (seen.has(item.id)) throw new Error(`${f}: duplicate id ${item.id}`);
    seen.add(item.id);
    if (item.arabic?.startsWith('@h:')) { const h = hisn[item.arabic.slice(3).trim()]; if (!h) throw new Error(`${f}: no Hisn text ${item.arabic}`); item.arabic = h.ar; if (h.audio && !item.audio) item.audio = h.audio; }
    if (item.arabic?.startsWith('@q:')) item.arabic = ayahs(item.arabic.slice(3)).list.map((a) => a[0]).join(' ۝ ');
    items.push(item); item = null;
  };
  for (const raw of lines) {
    if (raw.startsWith('%% ')) {
      close();
      const [id, area, title_en, title_dv = '', summary_en = '', summary_dv = '', kind = 'article'] = raw.slice(3).split('|').map((x) => x.trim());
      section = id; kindDefault = kind;
      sections.push({ id, area, title_en, title_dv, summary_en, summary_dv, sort: sections.length + 1 });
    } else if (raw.startsWith('@@ ')) {
      close();
      item = { id: raw.slice(3).trim(), section, kind: kindDefault, sort: items.length + 1 }; mode = 'head';
    } else if (raw.startsWith('@q ')) {
      close();
      const [ref, title_en, title_dv = ''] = raw.slice(3).split('|').map((x) => x.trim());
      const r = ayahs(ref);
      const label = `${r.s}:${r.from}${r.to > r.from ? '-' + r.to : ''}`;
      let qid = `q-${r.s}-${r.from}`;
      if (seen.has(qid)) qid += '-' + section; // the same ayah may appear in more than one section
      seen.add(qid);
      items.push({ id: qid, section, kind: 'dua', sort: items.length + 1, title_en, title_dv,
        arabic: r.list.map((a) => a[0]).join(' ۝ '), body_en: r.list.map((a) => a[1]).join(' '), body_dv: r.list.map((a) => a[2]).join(' '),
        ref: `Quran ${label} (${r.su.name})`, audio: 'q:' + label });
      seen.add(`q-${r.s}-${r.from}`);
    } else if (raw.startsWith('@h ')) {
      close();
      const [n, title_en, title_dv = ''] = raw.slice(3).split('|').map((x) => x.trim());
      const h = nawawi[n];
      if (!h) throw new Error('no such hadith in the Forty: ' + n);
      items.push({ id: 'hadith-' + n, section, kind: 'article', sort: items.length + 1, title_en: `${n}. ${title_en}`, title_dv: title_dv ? `${n}. ${title_dv}` : '',
        arabic: h.ar, body_en: h.en, body_dv: nawawiDv[n] ? `**ޚުލާޞާ:** ${nawawiDv[n]}` : '', ref: `An-Nawawi's Forty Hadith, no. ${n}` });
      seen.add('hadith-' + n);
    } else if (item && raw.trim() === '--- en') mode = 'body_en';
    else if (item && raw.trim() === '--- dv') mode = 'body_dv';
    else if (item && mode === 'head') {
      const m = /^([a-z_]+):\s*(.*)$/.exec(raw);
      if (m) item[m[1]] = m[2].trim(); else if (raw.trim()) throw new Error(`${f}: unexpected line in ${item.id}: ${raw.slice(0, 50)}`);
    } else if (item) item[mode] = (item[mode] || '') + raw + '\n';
  }
  close();
}
// Short notes for the remaining surahs, kept one per line in tools/data/surah-notes-2.txt
for (const [n, title_en, title_dv, body_en, body_dv] of dataLines('surah-notes-2.txt')) {
  if (!body_dv) throw new Error('surah note ' + n + ' is incomplete');
  if (seen.has('surah-' + n)) throw new Error('duplicate surah note ' + n);
  seen.add('surah-' + n);
  items.push({ id: 'surah-' + n, section: 'surah-notes', kind: 'article', sort: items.length + 1, title_en, title_dv, body_en, body_dv });
}
// Recorded dua audio matched by text (tools/data/dua-audio.json); files live in public/audio/dua.
const duaAudio = JSON.parse(fs.readFileSync(path.resolve('tools/data/dua-audio.json'), 'utf8'));
for (const it of items) if (!it.audio && duaAudio[it.id]) it.audio = duaAudio[it.id];
for (const it of items) if (!sections.some((s) => s.id === it.section)) throw new Error('item without section: ' + it.id);

const out = path.resolve('public/seed');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const files = [];
const write = (obj) => { const name = String(files.length + 1).padStart(3, '0') + '.json'; fs.writeFileSync(path.join(out, name), JSON.stringify(obj)); files.push(name); };
const PER_FILE = 36; // one file = one Worker call; stays under the free plan's 50 queries
for (let i = 0; i < sections.length; i += PER_FILE) write({ sections: sections.slice(i, i + PER_FILE) });
for (let i = 0; i < items.length; i += PER_FILE) write({ items: items.slice(i, i + PER_FILE) });
const version = crypto.createHash('sha1').update(JSON.stringify([sections, items])).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify({ version, files }));
const noDv = items.filter((i) => !i.body_dv && i.kind === 'article').length;
console.log(`${sections.length} sections, ${items.length} items, ${files.length} seed files, version ${version}${noDv ? `, ${noDv} articles without Dhivehi` : ''}`);
