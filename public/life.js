// The Hijri calendar and countdowns, duas by situation, a personal dua list, a charity log,
// an inheritance calculator, baby names, the short-surah course, review decks, and pictures for the children's stories.
// Everything a person enters stays on their own phone (settings key "tools").
import { html, useState, useEffect } from './vendor/preact-htm.js';
import { getSettings, setSettings, onSettings, isDv, todayKey, dayNotes, getJSON } from './lib.js';
import { WORDS } from './arabic.js';
import { dueNames } from './play.js';

const L = (en, dv) => (isDv() ? dv : en);
const tools = () => getSettings().tools || {};
const saveTools = (patch) => setSettings({ tools: { ...tools(), ...patch } });
function useS() { const [, f] = useState(0); useEffect(() => onSettings(() => f((n) => n + 1)), []); return getSettings(); }
function useJSON(url) { const [d, set] = useState(null); useEffect(() => { let on = true; getJSON(url).then((x) => on && set(x)).catch(() => {}); return () => { on = false; }; }, [url]); return d; }
const Back = ({ to, label }) => html`<a class="back" href=${to || '#/t'}>‹ ${label || L('Tools', 'ޓޫލްސް')}</a>`;
const DAY = 86400000;
const X = html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>`;

// ---------- Hijri dates ----------
const HFMT = (() => { try { return new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'UTC' }); } catch { return null; } })();
const hp = (d) => { if (!HFMT) return { y: 0, m: 0, d: 0 }; const p = Object.fromEntries(HFMT.formatToParts(d).map((x) => [x.type, x.value])); return { y: parseInt(p.year, 10), m: +p.month, d: +p.day }; };
const HM_EN = ['Muharram', 'Safar', 'Rabi al-Awwal', 'Rabi al-Thani', 'Jumada al-Ula', 'Jumada al-Akhirah', 'Rajab', 'Shaban', 'Ramadan', 'Shawwal', 'Dhul-Qadah', 'Dhul-Hijjah'];
const HM_DV = ['މުޙައްރަމް', 'ޞަފަރު', 'ރަބީޢުލްއައްވަލް', 'ރަބީޢުލްއާޚިރު', 'ޖުމާދަލްއޫލާ', 'ޖުމާދަލްއާޚިރާ', 'ރަޖަބު', 'ޝަޢުބާން', 'ރަމަޟާން', 'ޝައްވާލް', 'ޛުލްޤަޢިދާ', 'ޛުލްޙިއްޖާ'];
const GM = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const today0 = () => new Date(Date.parse(todayKey()));
function monthStart(d) { let x = new Date(d.getTime() - (hp(d).d - 1) * DAY); while (hp(x).d !== 1) x = new Date(x.getTime() - DAY); return x; }
const EVENTS = [[9, 1, 'Ramadan begins', 'ރަމަޟާން ފެށުން', 'day-ramadan'], [10, 1, 'Eid al-Fitr', 'ފިޠުރު ޢީދު', 'day-eid-fitr'], [12, 9, 'The day of Arafah', 'ޢަރަފާތް ދުވަސް', 'day-arafah'], [12, 10, 'Eid al-Adha', 'އަޟްޙާ ޢީދު', 'day-eid-adha'], [1, 10, 'Ashura', 'ޢާޝޫރާ', 'day-ashura']];
export function upcoming() {
  const t0 = today0(), found = [];
  for (let i = 0; i < 380 && found.length < EVENTS.length; i++) {
    const h = hp(new Date(t0.getTime() + i * DAY));
    for (const e of EVENTS) if (e[0] === h.m && e[1] === h.d && !found.some((f) => f.e === e)) found.push({ e, days: i });
  }
  return found.sort((a, b) => a.days - b.days);
}
export function DateStrip() {
  useS();
  if (!HFMT) return null;
  const next = upcoming().slice(0, 2);
  if (!next.length) return null;
  return html`<a class="datestrip" href="#/t/calendar">${next.map(({ e, days }) => html`<span><strong class="num">${days === 0 ? L('Today', 'މިއަދު') : days}</strong><span>${days === 0 ? L(e[2], e[3]) : L(`${days === 1 ? 'day' : 'days'} to ${e[2].replace(/^The d/, 'd')}`, `ދުވަސް: ${e[3]}`)}</span></span>`)}</a>`;
}
export function CalendarPage({ boot }) {
  useS();
  const t0 = today0();
  const [anchor, setAnchor] = useState(() => monthStart(t0));
  if (!HFMT) return html`<div class="page tool"><${Back} /><h1>${L('Hijri calendar', 'ހިޖުރީ ކަލަންޑަރު')}</h1><p class="notice">${L('This phone cannot work out Hijri dates.', 'މި ފޯނަކުން ހިޖުރީ ތާރީޚު ހިސާބެއް ނުކުރެވެއެވެ.')}</p></div>`;
  const h = hp(anchor), days = [];
  for (let i = 0; i < 31; i++) { const d = new Date(anchor.getTime() + i * DAY); if (i && hp(d).d === 1) break; days.push(d); }
  const pad = anchor.getUTCDay();
  const title = (id) => { const it = boot && boot.items.find((x) => x.id === id); return it ? (isDv() && it.title_dv ? it.title_dv : it.title_en) : null; };
  const kind = (d) => { const n = dayNotes(d); return n.includes('day-eid-fitr') || n.includes('day-eid-adha') ? 'eid' : n.some((x) => ['day-arafah', 'day-ashura', 'day-white-days'].includes(x)) ? 'fast' : h.m === 9 ? 'ram' : ''; };
  const notes = [];
  for (const d of days) for (const id of dayNotes(d)) if (!['day-friday', 'day-monday-thursday', 'day-ramadan', 'day-shaban', 'day-shawwal-six', 'day-dhul-hijjah-ten', 'day-last-ten'].includes(id)) { const last = notes[notes.length - 1]; if (last && last.id === id) last.to = d; else notes.push({ id, from: d, to: d }); }
  const whole = [...new Set(days.flatMap((d) => dayNotes(d)).filter((id) => ['day-ramadan', 'day-shaban', 'day-shawwal-six', 'day-dhul-hijjah-ten', 'day-last-ten'].includes(id)))];
  const g = (d) => `${d.getUTCDate()} ${GM[d.getUTCMonth()]}`;
  const dow = isDv() ? ['އާ', 'ހޯ', 'އަ', 'ބު', 'ބުރ', 'ހު', 'ހޮ'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const up = upcoming();
  return html`<div class="page tool"><${Back} /><h1>${L('Hijri calendar', 'ހިޖުރީ ކަލަންޑަރު')}</h1>
    <div class="cal-nav"><button class="act" aria-label=${L('Previous month', 'ކުރީ މަސް')} onClick=${() => setAnchor(monthStart(new Date(anchor.getTime() - DAY)))}>‹</button>
      <span><strong>${L(HM_EN[h.m - 1], HM_DV[h.m - 1])} <span class="num">${h.y}</span></strong><span class="muted">${g(days[0])} – ${g(days[days.length - 1])} ${days[days.length - 1].getUTCFullYear()}</span></span>
      <button class="act" aria-label=${L('Next month', 'ދެން އޮތް މަސް')} onClick=${() => setAnchor(monthStart(new Date(anchor.getTime() + 32 * DAY)))}>›</button></div>
    <div class="panel cal"><div class="cal-grid cal-head">${dow.map((x) => html`<span>${x}</span>`)}</div>
      <div class="cal-grid">${Array.from({ length: pad }, () => html`<span></span>`)}${days.map((d, i) => html`<span class=${'cal-day ' + kind(d) + (d.getTime() === t0.getTime() ? ' now' : '') + (d.getUTCDay() === 5 ? ' fri' : '')}><strong class="num">${i + 1}</strong><small class="num">${d.getUTCDate() === 1 || i === 0 ? g(d) : d.getUTCDate()}</small></span>`)}</div>
      <p class="heat-key muted"><span><i class="k-eid"></i>${L('Eid', 'ޢީދު')}</span><span><i class="k-fast"></i>${L('A day to fast', 'ރޯދަހިފުން ސުންނަތް ދުވަސް')}</span>${h.m === 9 && html`<span><i class="k-ram"></i>${L('Ramadan', 'ރަމަޟާން')}</span>`}</p></div>
    ${(notes.length > 0 || whole.length > 0) && html`<h2>${L('In this month', 'މި މަހުގައި')}</h2><ul class="panel cklist calnotes">
      ${whole.map((id) => title(id) && html`<li><a href=${'#/i/' + id}><strong>${title(id)}</strong></a></li>`)}
      ${notes.map((n) => title(n.id) && html`<li><a href=${'#/i/' + n.id}><strong>${title(n.id)}</strong><span class="muted num">${n.from === n.to ? g(n.from) : `${g(n.from)} – ${g(n.to)}`}</span></a></li>`)}</ul>`}
    <h2>${L('Coming up', 'ކުރިއަށް އޮތް')}</h2>
    <div class="panel result">${up.map(({ e, days: n }) => html`<div class="rline"><span>${L(e[2], e[3])}</span><strong class="num">${n === 0 ? L('today', 'މިއަދު') : L(`in ${n} days`, `${n} ދުވަސް`)}</strong></div>`)}</div>
    <p class="notice">${L('These dates are calculated (the Umm al-Qura calendar). In the Maldives the start of Ramadan and both Eids is announced by the Ministry of Islamic Affairs after the moon is looked for, and can be a day different.', 'މި ތާރީޚުތަކަކީ ހިސާބުން ނެރެފައިވާ ތާރީޚުތަކެވެ (އުންމުލްޤުރާ ކަލަންޑަރު). ދިވެހިރާއްޖޭގައި ރަމަޟާން މަސް ފެށުމާއި ދެ ޢީދު އިޢުލާންކުރައްވަނީ ހަނދު ބެލުމަށްފަހު އިސްލާމީ ކަންތައްތަކާ ބެހޭ ވުޒާރާއިންނެވެ. އެއް ދުވަހުގެ ތަފާތެއް އައުން އެކަށީގެންވެއެވެ.')}</p>
  </div>`;
}

// ---------- duas for a situation ----------
const SITS = [
  ['I am worried or sad', 'ހާސްކަމެއް ނުވަތަ ހިތާމައެއް', ['i/dua-distress', 'i/dua-anxiety-debt', 'i/q-21-87', 'i/dhikr-hasbunallah']],
  ['I am ill, or visiting someone ill', 'ބަލިވެއްޖެ، ނުވަތަ ބަލިމީހަކަށް ޒިޔާރަތްކުރަން', ['i/dua-visiting-sick', 'i/q-21-83', 'i/pray-sick']],
  ['I have a decision to make', 'ކަމެއް ނިންމަން', ['i/dua-istikhara', 'i/pray-istikhara']],
  ['I need provision, or I am in debt', 'ރިޒުޤު ބޭނުން، ނުވަތަ ދަރަނި', ['i/rizq-halal-suffice', 'i/dua-anxiety-debt', 's/dua-rizq']],
  ['I did something wrong', 'ކުށެއް ކުރެވިއްޖެ', ['i/dua-sayyid-istighfar', 'i/q-7-23', 'i/pray-tawbah', 'i/tawbah']],
  ['Someone has died', 'މީހަކު މަރުވެއްޖެ', ['i/dua-calamity', 't/janazah', 's/duas-dead']],
  ['I am travelling', 'ދަތުރެއް ކުރަން', ['i/q-43-13', 'i/travel-prayer', 'i/hajj-8-travel-dua']],
  ['For my parents', 'މައިންބަފައިންނަށްޓަކައި', ['i/q-17-24', 'i/q-14-41']],
  ['For my husband, wife and children', 'އަނބި، ފިރި، ދަރިންނަށްޓަކައި', ['i/q-25-74', 'i/q-14-40', 'i/q-46-15']],
  ['Before study or an exam', 'ކިޔެވުމުގެ ނުވަތަ އިމްތިޙާނެއްގެ ކުރިން', ['i/q-20-114', 'i/q-20-25', 'i/rizq-knowledge-provision']],
  ['I am afraid, or someone is harming me', 'ބިރެއް، ނުވަތަ މީހަކު އަނިޔާކުރުން', ['i/dua-hasbiyallah', 'i/dua-bismillah-protection', 'i/q-23-97', 'i/q-113-1']],
  ['I cannot sleep', 'ނުނިދޭ', ['guide/sleep', 'i/dua-sleeping', 'i/q-2-255']],
  ['It is raining, or there is a storm', 'ވާރޭ ނުވަތަ ތޫފާން', ['i/dua-rain', 'i/pray-rain']],
  ['I want to thank Allah', 'ﷲ އަށް ޝުކުރުކުރަން', ['i/q-27-19', 'i/q-14-7', 'i/dhikr-subhanallah-azim']],
];
const linkTitle = (boot, path) => {
  const [kind, id] = path.split('/');
  if (kind === 'guide') return L('Before sleep, one by one', 'ނިދުމުގެ ކުރިން، އެއް ދުޢާއަށްފަހު އަނެއް ދުޢާ');
  if (kind === 't') return L('When someone dies: what to do', 'މީހަކު މަރުވުމުން ކުރަންވީ ކަންކަން');
  const row = boot && (kind === 's' ? boot.sections : boot.items).find((x) => x.id === id);
  return row ? (isDv() && row.title_dv ? row.title_dv : row.title_en) : null;
};
export function SituationsPage({ boot }) {
  useS();
  const [open, setOpen] = useState(-1);
  return html`<div class="page tool"><${Back} /><h1>${L('A dua for now', 'މި ވަގުތަށް ދުޢާއެއް')}</h1>
    <p class="lede">${L('Choose what is happening and the duas for it will open.', 'ދިމާވެފައިވާ ކަމެއް ހޮވާ. އެކަމަށް ކުރާ ދުޢާތައް ހުޅުވޭނެ.')}</p>
    <ul class="sits">${SITS.map(([en, dv, links], i) => html`<li class=${open === i ? 'open' : ''}>
      <button class="sit" aria-expanded=${open === i} onClick=${() => setOpen(open === i ? -1 : i)}><span class=${isDv() ? 'dv' : ''}>${L(en, dv)}</span><i></i></button>
      ${open === i && html`<ul class="sit-links">${links.map((p) => linkTitle(boot, p) && html`<li><a href=${'#/' + p}>${linkTitle(boot, p)}</a></li>`)}</ul>`}</li>`)}</ul>
    <a class="btn wide" href="#/t/mydua">${L('My own dua list', 'އަހަރެންގެ ދުޢާ ލިސްޓު')}</a>
  </div>`;
}

// ---------- my dua list ----------
export function MyDuaPage() {
  useS();
  const list = tools().mydua || [];
  const [v, setV] = useState('');
  const add = () => { const t = v.trim(); if (!t) return; saveTools({ mydua: [{ id: Date.now(), t: t.slice(0, 400) }, ...list] }); setV(''); };
  return html`<div class="page tool"><${Back} /><h1>${L('My dua list', 'އަހަރެންގެ ދުޢާ ލިސްޓު')}</h1>
    <p class="lede">${L('Write what you want to ask Allah for, and the names of people you make dua for. Only you can see this.', 'ﷲ ގެ ޙަޟްރަތުން އެދެން ބޭނުންވާ ކަންކަމާއި، ދުޢާކޮށްދޭ މީހުންގެ ނަންތައް ލިޔޭ. މި ލިސްޓު ފެންނާނީ ހަމައެކަނި ތިބާއަށެވެ.')}</p>
    <div class="panel form"><textarea class="field" rows="2" value=${v} placeholder=${L('For example: health for my father', 'މިސާލަކަށް: ބައްޕަގެ ޞިއްޙަތަށްޓަކައި')} onInput=${(e) => setV(e.target.value)}></textarea>
      <button class="btn primary wide" disabled=${!v.trim()} onClick=${add}>${L('Add to my list', 'ލިސްޓަށް އިތުރުކުރޭ')}</button></div>
    ${list.length > 0 && html`<ul class="panel cklist mylist">${list.map((x) => html`<li class=${x.done ? 'on' : ''}>
      <button class="ckbox" role="checkbox" aria-checked=${!!x.done} aria-label=${L('Answered', 'އިޖާބަވި')} onClick=${() => saveTools({ mydua: list.map((y) => (y === x ? { ...y, done: !y.done } : y)) })}>${x.done ? '✓' : ''}</button>
      <span class="ck-t">${x.t}</span><button class="act" aria-label=${L('Remove', 'ނަގާ')} onClick=${() => saveTools({ mydua: list.filter((y) => y !== x) })}>${X}</button></li>`)}</ul>
      <p class="muted small">${L('Tick a dua when Allah has answered it, and thank Him.', 'ﷲ ދުޢާ އިޖާބަކުރެއްވުމުން ފާހަގަކޮށް، އެކަލާނގެއަށް ޝުކުރުކުރާށެވެ.')}</p>`}
  </div>`;
}

// ---------- charity log ----------
const money = (n) => n.toLocaleString('en', { maximumFractionDigits: 2 });
export function CharityPage() {
  useS();
  const list = tools().charity || [];
  const [amt, setAmt] = useState('');
  const [note, setNote] = useState('');
  const n = parseFloat(String(amt).replace(/,/g, ''));
  const add = () => { if (!(n > 0)) return; saveTools({ charity: [{ id: Date.now(), d: todayKey(), a: n, t: note.trim().slice(0, 80) }, ...list] }); setAmt(''); setNote(''); };
  const ym = todayKey().slice(0, 7), y = todayKey().slice(0, 4);
  const sum = (f) => list.filter(f).reduce((s, x) => s + x.a, 0);
  return html`<div class="page tool"><${Back} /><h1>${L('Charity log', 'ޞަދަޤާތުގެ ދަފްތަރު')}</h1>
    <p class="lede">${L('A private note of what you have given. It never leaves this phone.', 'ދިން ޞަދަޤާތުގެ އަމިއްލަ ނޯޓެއް. މި މަޢުލޫމާތު މި ފޯނުން ބޭރަކަށް ނުދާނެއެވެ.')}</p>
    <div class="tool-two"><div class="panel"><span class="muted">${L('This month', 'މި މަހު')}</span><strong class="big num">${money(sum((x) => x.d.startsWith(ym)))}</strong></div><div class="panel"><span class="muted">${L('This year', 'މި އަހަރު')}</span><strong class="big num">${money(sum((x) => x.d.startsWith(y)))}</strong></div></div>
    <div class="panel form"><label class="tfield">${L('Amount (rufiyaa)', 'އަދަދު (ރުފިޔާ)')}<input inputmode="decimal" value=${amt} onInput=${(e) => setAmt(e.target.value)} /></label>
      <label class="tfield">${L('Given to (optional)', 'ދިނީ ކާކަށް (މަޖުބޫރެއް ނޫން)')}<input value=${note} onInput=${(e) => setNote(e.target.value)} /></label>
      <button class="btn primary wide" disabled=${!(n > 0)} onClick=${add}>${L('Add', 'އިތުރުކުރޭ')}</button></div>
    ${list.length > 0 && html`<ul class="panel cklist mylist">${list.slice(0, 60).map((x) => html`<li><span class="muted num small">${x.d.slice(5)}</span><span class="ck-t"><strong class="num">${money(x.a)}</strong>${x.t ? ' · ' + x.t : ''}</span>
      <button class="act" aria-label=${L('Remove', 'ނަގާ')} onClick=${() => saveTools({ charity: list.filter((yy) => yy !== x) })}>${X}</button></li>`)}</ul>`}
  </div>`;
}

// ---------- inheritance, the common cases ----------
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const F = (n, d = 1) => { const g = gcd(n, d) || 1; return { n: n / g, d: d / g }; };
const add = (a, b) => F(a.n * b.d + b.n * a.d, a.d * b.d), sub = (a, b) => F(a.n * b.d - b.n * a.d, a.d * b.d), mul = (a, b) => F(a.n * b.n, a.d * b.d), div = (a, b) => F(a.n * b.d, a.d * b.n);
export function inherit({ husband, wives, sons, daughters, father, mother }) {
  const kids = sons + daughters > 0, rows = [];
  const spouse = husband ? F(1, kids ? 4 : 2) : wives ? F(1, kids ? 8 : 4) : F(0);
  if (husband) rows.push({ k: 'husband', f: spouse, c: 1 });
  if (wives) rows.push({ k: 'wives', f: spouse, c: wives });
  if (mother) rows.push({ k: 'mother', f: kids ? F(1, 6) : father && (husband || wives) ? mul(F(1, 3), sub(F(1), spouse)) : F(1, 3), c: 1 });
  if (father && kids) rows.push({ k: 'father', f: F(1, 6), c: 1 });
  if (!sons && daughters) rows.push({ k: 'daughters', f: daughters === 1 ? F(1, 2) : F(2, 3), c: daughters });
  let total = rows.reduce((s, r) => add(s, r.f), F(0)), scaled = false, left = F(0);
  if (total.n > total.d) { for (const r of rows) r.f = div(r.f, total); scaled = true; total = F(1); }
  const rest = sub(F(1), total);
  if (rest.n > 0) {
    if (sons) { const parts = sons * 2 + daughters; rows.push({ k: 'sons', f: mul(rest, F(sons * 2, parts)), c: sons }); if (daughters) rows.push({ k: 'daughters', f: mul(rest, F(daughters, parts)), c: daughters }); }
    else if (father) { const fr = rows.find((r) => r.k === 'father'); if (fr) fr.f = add(fr.f, rest); else rows.push({ k: 'father', f: rest, c: 1 }); }
    else left = rest;
  }
  return { rows, scaled, left };
}
const HEIR = { husband: ['Husband', 'ފިރިމީހާ'], wives: ['Wife', 'އަނބިމީހާ'], mother: ['Mother', 'މަންމަ'], father: ['Father', 'ބައްޕަ'], sons: ['Sons', 'ފިރިހެން ދަރިން'], daughters: ['Daughters', 'އަންހެން ދަރިން'] };
function Stepper({ label, v, set, max = 12 }) {
  return html`<div class="rline step"><span>${label}</span><span class="stepper2"><button class="act" disabled=${v <= 0} onClick=${() => set(v - 1)}>−</button><strong class="num">${v}</strong><button class="act" disabled=${v >= max} onClick=${() => set(v + 1)}>+</button></span></div>`;
}
export function InheritPage() {
  useS();
  const st = { male: true, wives: 0, husband: 0, sons: 0, daughters: 0, father: 0, mother: 0, amt: '', ...(tools().inherit || {}) };
  const set = (p) => saveTools({ inherit: { ...st, ...p } });
  const amount = parseFloat(String(st.amt).replace(/,/g, '')) || 0;
  const r = inherit({ husband: st.male ? 0 : st.husband, wives: st.male ? st.wives : 0, sons: st.sons, daughters: st.daughters, father: st.father, mother: st.mother });
  return html`<div class="page tool"><${Back} /><h1>${L('Inheritance shares', 'ވާރުތަ މުދަލުގެ ބައިތައް')}</h1>
    <p class="lede">${L('For the common case: a husband or wife, children and parents.', 'ޢާންމު ޙާލަތަށް: ފިރި ނުވަތަ އަނބި، ދަރިން އަދި މައިންބަފައިން.')}</p>
    <div class="seg two"><button class=${st.male ? 'on' : ''} onClick=${() => set({ male: true })}>${L('A man has died', 'މަރުވީ ފިރިހެނެއް')}</button><button class=${!st.male ? 'on' : ''} onClick=${() => set({ male: false })}>${L('A woman has died', 'މަރުވީ އަންހެނެއް')}</button></div>
    <div class="panel result"><h2>${L('Who is alive?', 'ދިރިތިބީ ކޮންބައެއް؟')}</h2>
      ${st.male ? html`<${Stepper} label=${L('Wives', 'އަނބިން')} v=${st.wives} set=${(v) => set({ wives: v })} max=${4} />` : html`<${Stepper} label=${L('Husband', 'ފިރިމީހާ')} v=${st.husband} set=${(v) => set({ husband: v })} max=${1} />`}
      <${Stepper} label=${L('Sons', 'ފިރިހެން ދަރިން')} v=${st.sons} set=${(v) => set({ sons: v })} /><${Stepper} label=${L('Daughters', 'އަންހެން ދަރިން')} v=${st.daughters} set=${(v) => set({ daughters: v })} />
      <${Stepper} label=${L('Father', 'ބައްޕަ')} v=${st.father} set=${(v) => set({ father: v })} max=${1} /><${Stepper} label=${L('Mother', 'މަންމަ')} v=${st.mother} set=${(v) => set({ mother: v })} max=${1} /></div>
    <div class="panel form"><label class="tfield">${L('What is left after debts, funeral costs and the will (rufiyaa)', 'ދަރަންޏާއި، ކަށުކަމާކުރުމުގެ ޚަރަދާއި، ވަޞިއްޔަތަށްފަހު ބާކީ (ރުފިޔާ)')}<input inputmode="decimal" value=${st.amt} onInput=${(e) => set({ amt: e.target.value })} /></label></div>
    ${r.rows.length > 0 ? html`<div class="panel result">${r.rows.map((x) => html`<div class="rline"><span>${L(HEIR[x.k][0], HEIR[x.k][1])}${x.c > 1 ? html` <span class="muted">× ${x.c}</span>` : ''}<span class="muted small frac"> ${x.f.n}/${x.f.d}</span></span>
        <strong class="num">${amount ? money((amount * x.f.n) / x.f.d) : (100 * x.f.n / x.f.d).toFixed(1) + '%'}${x.c > 1 && amount ? html`<span class="muted small"> (${money((amount * x.f.n) / x.f.d / x.c)} ${L('each', 'ކޮންމެ މީހަކަށް')})</span>` : ''}</strong></div>`)}
      ${r.left.n > 0 && html`<div class="rline due"><span>${L('Remainder', 'ބާކީ')} <span class="muted small frac">${r.left.n}/${r.left.d}</span></span><strong class="num">${amount ? money((amount * r.left.n) / r.left.d) : (100 * r.left.n / r.left.d).toFixed(1) + '%'}</strong></div>`}</div>
      ${r.left.n > 0 && html`<p class="notice">${L('The remainder goes to the nearest male relatives on the father\'s side, such as brothers or uncles, or back to the heirs if there are none. This calculator does not work that part out.', 'ބާކީ ބައި ލިބޭނީ ބައްޕަގެ ފަރާތުގެ އެންމެ ގާތް ފިރިހެން ތިމާގެ މީހުންނަށެވެ (މިސާލަކަށް އަޚުން، ބޮޑުބޭބެމެން). އެފަދަ މީހަކު ނެތްނަމަ ވާރުތަވެރިންނަށް އަނބުރާ ލިބޭނެއެވެ. މި ބައި މި ކަލްކިއުލޭޓަރުން ހިސާބެއް ނުކުރެއެވެ.')}</p>`}
      ${r.scaled && html`<p class="notice">${L('The fixed shares added up to more than the whole, so each has been reduced in proportion (\'awl).', 'ކަނޑައެޅިފައިވާ ބައިތަކުގެ ޖުމްލަ މުޅި މުދަލަށްވުރެ ބޮޑުވާތީ، ކޮންމެ ބައެއް ނިސްބަތުން ކުޑަކުރެވިފައިވެއެވެ (ޢައުލު).')}</p>`}`
      : html`<p class="muted">${L('Add the heirs above to see their shares.', 'ބައިތައް ބެލުމަށް މަތީގައި ވާރުތަވެރިން އިތުރުކުރޭ.')}</p>`}
    <p class="notice">${L('This is a guide for the simplest cases only. Brothers and sisters, grandparents and grandchildren change the shares. For a real estate, take it to a scholar or the court.', 'މިއީ އެންމެ ސާދާ ޙާލަތްތަކަށް ހަމައެކަނި އިރުޝާދެކެވެ. އަޚުންނާއި އުޚުތުން، ކާފަ މާމަ އަދި ކާފަދަރިން ތިބިނަމަ ބައިތައް ބަދަލުވާނެއެވެ. ޙަޤީޤީ ތަރިކައެއް ބެހުމަށް ޢިލްމުވެރިއަކަށް ނުވަތަ ކޯޓަށް ހުށަހަޅާށެވެ.')}</p>
  </div>`;
}

// ---------- baby names ----------
const BOYS = [['Abdullah', 'عَبْدُ اللَّه', 'Servant of Allah', 'ﷲ ގެ އަޅާ'], ['Abdur-Rahman', 'عَبْدُ الرَّحْمَٰن', 'Servant of the Most Gracious', 'ރަޙްމާންވަންތަ ރަސްކަލާނގެ އަޅާ'], ['Muhammad', 'مُحَمَّد', 'Much praised', 'ގިނައިން ޙަމްދުކުރެވޭ'], ['Ahmad', 'أَحْمَد', 'Most praiseworthy', 'އެންމެ ޙަމްދުކުރެވޭ'],
  ['Ibrahim', 'إِبْرَاهِيم', 'The prophet, friend of Allah', 'ﷲ ގެ ޚަލީލު ނަބިއްޔާ'], ['Ismail', 'إِسْمَاعِيل', 'The prophet, son of Ibrahim', 'އިބްރާހީމްގެފާނުގެ ދަރިކަލުން ނަބިއްޔާ'], ['Yusuf', 'يُوسُف', 'The prophet known for patience and beauty', 'ކެތްތެރިކަމާއި ރީތިކަމުން މަޝްހޫރު ނަބިއްޔާ'], ['Musa', 'مُوسَى', 'The prophet who spoke with Allah', 'ﷲ ބަސްވަހީކުރެއްވި ނަބިއްޔާ'],
  ['Isa', 'عِيسَى', 'The prophet, son of Maryam', 'މަރްޔަމްގެފާނުގެ ދަރިކަލުން ނަބިއްޔާ'], ['Yahya', 'يَحْيَى', 'He lives', 'ދިރިހުންނަ'], ['Idris', 'إِدْرِيس', 'A prophet raised to a high place', 'މަތިވެރި މަޤާމަކަށް އުފުއްލެވުނު ނަބިއްޔާ'], ['Adam', 'آدَم', 'The first man and first prophet', 'އެންމެ ފުރަތަމަ އިންސާނާ'],
  ['Umar', 'عُمَر', 'Long-lived', 'ދިގު ޢުމުރެއް'], ['Ali', 'عَلِيّ', 'High, noble', 'މަތިވެރި'], ['Hamza', 'حَمْزَة', 'Strong, a lion', 'ބާރުގަދަ، ސިންގާ'], ['Bilal', 'بِلَال', 'The first caller to prayer', 'އެންމެ ފުރަތަމަ މުދިމު'],
  ['Hasan', 'حَسَن', 'Good, handsome', 'ރަނގަޅު، ރީތި'], ['Husayn', 'حُسَيْن', 'Good, handsome (little one)', 'ރީތި ކުޑަކުއްޖާ'], ['Anas', 'أَنَس', 'Friendly, good company', 'އެކުވެރި'], ['Zayd', 'زَيْد', 'Growth, increase', 'އިތުރުވުން'],
  ['Salman', 'سَلْمَان', 'Safe, sound', 'ސަލާމަތްވެގެންވާ'], ['Khalid', 'خَالِد', 'Lasting', 'ދެމިހުންނަ'], ['Amin', 'أَمِين', 'Trustworthy', 'އަމާނާތްތެރި'], ['Karim', 'كَرِيم', 'Generous', 'ދީލަތި'],
  ['Ayman', 'أَيْمَن', 'Blessed', 'ބަރަކާތްތެރި'], ['Rayyan', 'رَيَّان', 'The gate of Paradise for those who fast', 'ރޯދަވެރިންނަށް ޚާއްޞަ ސުވަރުގޭގެ ދޮރު'], ['Saad', 'سَعْد', 'Happiness, good fortune', 'އުފާވެރިކަން'], ['Hadi', 'هَادِي', 'One who guides', 'މަގުދައްކާ']];
const GIRLS = [['Maryam', 'مَرْيَم', 'Mother of the prophet Isa', 'ޢީސާގެފާނުގެ މައިކަނބަލުން'], ['Khadijah', 'خَدِيجَة', 'The first to believe, wife of the Prophet ﷺ', 'އެންމެ ފުރަތަމަ އީމާންވި، ރަސޫލާ ﷺ ގެ އަނބިކަނބަލުން'], ['Aishah', 'عَائِشَة', 'Full of life', 'ދިރުން ހުރި'], ['Fatimah', 'فَاطِمَة', 'Daughter of the Prophet ﷺ', 'ރަސޫލާ ﷺ ގެ ދަރިކަނބަލުން'],
  ['Zaynab', 'زَيْنَب', 'Daughter of the Prophet ﷺ; a fragrant tree', 'ރަސޫލާ ﷺ ގެ ދަރިކަނބަލުން؛ މީރުވަސް ދުވާ ގަހެއް'], ['Ruqayyah', 'رُقَيَّة', 'Daughter of the Prophet ﷺ', 'ރަސޫލާ ﷺ ގެ ދަރިކަނބަލުން'], ['Hafsah', 'حَفْصَة', 'Wife of the Prophet ﷺ, keeper of the first written Quran', 'ރަސޫލާ ﷺ ގެ އަނބިކަނބަލުން'], ['Asiyah', 'آسِيَة', 'The believing wife of Firawn', 'ފިރުޢައުނުގެ އީމާންވި އަނބިކަނބަލުން'],
  ['Hajar', 'هَاجَر', 'Mother of the prophet Ismail', 'އިސްމާޢީލްގެފާނުގެ މައިކަނބަލުން'], ['Sarah', 'سَارَة', 'Wife of the prophet Ibrahim', 'އިބްރާހީމްގެފާނުގެ އަނބިކަނބަލުން'], ['Aminah', 'آمِنَة', 'Trustworthy; mother of the Prophet ﷺ', 'އަމާނާތްތެރި؛ ރަސޫލާ ﷺ ގެ މައިކަނބަލުން'], ['Safiyyah', 'صَفِيَّة', 'Pure, chosen', 'ޠާހިރު، ޚިޔާރުކުރެވުނު'],
  ['Sumayyah', 'سُمَيَّة', 'The first martyr in Islam', 'އިސްލާމްދީނުގެ އެންމެ ފުރަތަމަ ޝަހީދު'], ['Asma', 'أَسْمَاء', 'Lofty, high', 'މަތިވެރި'], ['Halimah', 'حَلِيمَة', 'Gentle, patient', 'މަޑުމައިތިރި، ކެތްތެރި'], ['Shareefa', 'شَرِيفَة', 'Noble, honoured', 'ޝަރަފުވެރި'],
  ['Salma', 'سَلْمَى', 'Safe, at peace', 'ސަލާމަތްވެގެންވާ'], ['Noor', 'نُور', 'Light', 'ނޫރު، އަލި'], ['Iman', 'إِيمَان', 'Faith', 'އީމާންކަން'], ['Huda', 'هُدَى', 'Guidance', 'ހިދާޔަތް'],
  ['Yusra', 'يُسْرَى', 'Ease', 'ފަސޭހަކަން'], ['Rahmah', 'رَحْمَة', 'Mercy', 'ރަޙްމަތް'], ['Sakinah', 'سَكِينَة', 'Calm, peace of heart', 'ހިތުގެ ހަމަޖެހުން'], ['Amal', 'أَمَل', 'Hope', 'އުންމީދު'],
  ['Hana', 'هَنَاء', 'Happiness', 'އުފާވެރިކަން'], ['Jannah', 'جَنَّة', 'Garden, Paradise', 'ސުވަރުގެ'], ['Shifa', 'شِفَاء', 'Healing', 'ޝިފާ'], ['Zahra', 'زَهْرَاء', 'Bright, shining', 'ވިދާ'], ];
export function BabyNamesPage() {
  useS();
  const [girl, setGirl] = useState(false);
  const [q, setQ] = useState('');
  const fav = tools().babyFav || [];
  const list = (girl ? GIRLS : BOYS).filter((x) => !q.trim() || x[0].toLowerCase().includes(q.trim().toLowerCase()) || x[2].toLowerCase().includes(q.trim().toLowerCase()));
  return html`<div class="page tool"><${Back} /><h1>${L('Names for a baby', 'ކުއްޖަކަށް ކިޔާނެ ނަންތައް')}</h1>
    <p class="lede">${L('A child has a right to a good name. Tap the star to keep the ones you like.', 'ރަނގަޅު ނަމެއް ކިޔުމަކީ ދަރިފުޅުގެ ޙައްޤެކެވެ. ކަމުދާ ނަންތަކުގެ ތަރީގައި ފިއްތާ.')}</p>
    <div class="seg two"><button class=${!girl ? 'on' : ''} onClick=${() => setGirl(false)}>${L('Boys', 'ފިރިހެން ކުދިން')}</button><button class=${girl ? 'on' : ''} onClick=${() => setGirl(true)}>${L('Girls', 'އަންހެން ކުދިން')}</button></div>
    <input class="field" type="search" value=${q} placeholder=${L('Search a name or meaning', 'ނަމެއް ނުވަތަ މާނައެއް ހޯދާ')} onInput=${(e) => setQ(e.target.value)} />
    <ul class="nmlist">${list.map(([n, ar, en, dv]) => html`<li class="nm"><div class="nm-main bn"><button class=${'bn-star' + (fav.includes(n) ? ' on' : '')} aria-pressed=${fav.includes(n)} aria-label=${L('Keep', 'ރައްކާކުރޭ')} onClick=${() => saveTools({ babyFav: fav.includes(n) ? fav.filter((x) => x !== n) : [...fav, n] })}>★</button>
      <span class="nm-ar" lang="ar" dir="rtl">${ar}</span><span class="nm-tr">${n}</span><span class=${'nm-en' + (isDv() ? ' dv' : '')}>${L(en, dv)}</span></div></li>`)}</ul>
    ${fav.length > 0 && html`<p class="notice">${L('Kept', 'ރައްކާކުރި')}: ${fav.join(', ')}</p>`}
    <a class="btn wide" href="#/i/newborn-sunnahs">${L('What to do when a child is born', 'ދަރިއަކު އުފަންވުމުން ކުރަންވީ ކަންކަން')}</a>
  </div>`;
}

// ---------- the short surahs, one at a time ----------
const COURSE = [1, 114, 113, 112, 111, 110, 109, 108, 107, 106, 105, 104, 103, 102, 101, 100, 99, 98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87, 86, 85, 84, 83, 82, 81, 80, 79, 78];
export function CoursePage() {
  useS();
  const idx = useJSON('/quran/index.json');
  const done = tools().course || [];
  const flip = (n) => saveTools({ course: done.includes(n) ? done.filter((x) => x !== n) : [...done, n] });
  const learn = (n) => { saveTools({ hifz: { ...(tools().hifz || {}), last: n } }); location.hash = '#/t/hifz'; };
  const next = COURSE.find((n) => !done.includes(n));
  const name = (n) => { const s = idx && idx.surahs.find((x) => x.n === n); return s ? s.name : L('Surah', 'ސޫރަތް') + ' ' + n; };
  const count = (n) => { const s = idx && idx.surahs.find((x) => x.n === n); return s ? s.count : ''; };
  return html`<div class="page tool"><${Back} /><h1>${L('Learn the short surahs', 'ކުރު ސޫރަތްތައް ދަސްކުރުން')}</h1>
    <p class="lede">${L('Al-Fatihah first, then from an-Nas backwards through the last part of the Quran. Listen, repeat, hide the words, then tick it.', 'ފުރަތަމަ ފާތިޙާ، އެއަށްފަހު ނާސް ސޫރަތުން ފަށައިގެން ފަހަތަށް. އަޑުއަހައި، ތަކުރާރުކޮށް، ފޮރުވައިގެން ކިޔައި، ފާހަގަކުރޭ.')}</p>
    <div class="panel"><div class="rline"><span>${L('Memorised', 'ހިތުދަސްވި')}</span><strong class="num">${done.length} / ${COURSE.length}</strong></div><span class="bar"><i style=${{ width: (done.length / COURSE.length) * 100 + '%' }}></i></span>
      ${next && html`<button class="btn primary wide" onClick=${() => learn(next)}>${L('Next:', 'ދެން:')} ${name(next)}</button>`}
      ${done.length > 0 && html`<a class="btn wide" href="#/t/review/surahs">${L('Review what I know', 'ދަސްވި ސޫރަތްތައް މުރާޖަޢާކުރޭ')}</a>`}</div>
    <ul class="panel cklist">${COURSE.map((n) => html`<li class=${done.includes(n) ? 'on' : ''}>
      <button class="ckbox" role="checkbox" aria-checked=${done.includes(n)} aria-label=${name(n)} onClick=${() => flip(n)}>${done.includes(n) ? '✓' : ''}</button>
      <button class="ck-t linkish" onClick=${() => learn(n)}><strong>${name(n)}</strong> <span class="muted small num">${count(n)} ${L('ayahs', 'އާޔަތް')}</span></button>
      <a class="act" href=${'#/quran/' + n} aria-label=${L('Read', 'ކިޔާ')}>›</a></li>`)}</ul>
  </div>`;
}

// ---------- review decks ----------
const GAPS = [1, 2, 4, 8, 16, 30];
const dayNo = () => Math.floor((Date.now() + 5 * 3600000) / DAY);
function dueOf(store, ids, fresh) {
  const srs = tools()[store] || {}, d = dayNo();
  const due = ids.filter((i) => srs[i] && srs[i][1] <= d), nw = ids.filter((i) => !srs[i]).slice(0, Math.max(0, fresh - due.length));
  return [...due, ...nw].slice(0, 12);
}
const wordIds = () => WORDS.map((_, i) => i), surahIds = () => tools().course || [];
export const dueWords = () => dueOf('srsWords', wordIds(), 6), dueSurahs = () => dueOf('srsSurahs', surahIds(), 99);
function Deck({ store, list, card, onDone }) {
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  if (i >= list.length) return html`<div class="panel win"><strong>${list.length ? L('That is all for today.', 'މިއަދަށް ނިމުނީ.') : L('Nothing is due today.', 'މިއަދަށް މުރާޖަޢާކުރާނެ އެއްޗެއް ނެތް.')}</strong><span class="muted">${L('What you knew will come back after a longer gap.', 'އެނގުނު ތަކެތި އަނެއްކާ ގެންނާނީ މާ ދުވަސްކޮޅެއް ފަހުންނެވެ.')}</span><button class="btn primary wide" onClick=${onDone}>${L('Done', 'ނިމުނީ')}</button></div>`;
  const id = list[i], c = card(id);
  const mark = (knew) => { const srs = { ...(tools()[store] || {}) }, box = knew ? Math.min(5, (srs[id] ? srs[id][0] : -1) + 1) : 0; srs[id] = [box, dayNo() + (knew ? GAPS[box] : 1)]; saveTools({ [store]: srs }); setOpen(false); setI(i + 1); };
  return html`<div class="panel review"><span class="muted num">${i + 1} / ${list.length}</span>
    ${c.ar && html`<span class="rv-ar" lang="ar" dir="rtl">${c.ar}</span>`}<strong>${c.front}</strong>
    ${open ? html`${c.back}<div class="seg two"><button onClick=${() => mark(false)}>${L('Not yet', 'އަދި ނޭނގޭ')}</button><button class="on" onClick=${() => mark(true)}>${L('I knew it', 'އެނގުނު')}</button></div>`
      : html`<button class="btn primary wide" onClick=${() => setOpen(true)}>${c.ask}</button>`}</div>`;
}
export function ReviewPage({ deck }) {
  useS();
  const idx = useJSON('/quran/index.json');
  const [list, setList] = useState(null);
  useEffect(() => setList(deck === 'words' ? dueWords() : deck === 'surahs' ? dueSurahs() : null), [deck]);
  if (deck === 'words' && list) return html`<div class="page tool"><${Back} to="#/t/review" label=${L('Review', 'މުރާޖަޢާ')} /><h1>${L('Arabic words', 'ޢަރަބި ބަސްތައް')}</h1>
    <${Deck} store="srsWords" list=${list} onDone=${() => { location.hash = '#/t/review'; }} card=${(i) => ({ ar: WORDS[i][0], front: WORDS[i][1], ask: L('Show the meaning', 'މާނަ ދައްކާ'), back: html`<span class=${'rv-mean' + (isDv() ? ' dv' : '')}>${L(WORDS[i][2], WORDS[i][3])}</span>` })} /></div>`;
  if (deck === 'surahs' && list) { const nm = (n) => { const s = idx && idx.surahs.find((x) => x.n === n); return s ? s.name : n; };
    return html`<div class="page tool"><${Back} to="#/t/review" label=${L('Review', 'މުރާޖަޢާ')} /><h1>${L('Surahs I know', 'ދަސްވި ސޫރަތްތައް')}</h1>
    <${Deck} store="srsSurahs" list=${list} onDone=${() => { location.hash = '#/t/review'; }} card=${(n) => ({ front: `${L('Recite from memory:', 'ހިތުން ކިޔާ:')} ${nm(n)}`, ask: L('I have recited it', 'ކިޔައިފިން'), back: html`<a class="btn wide" href=${'#/quran/' + n}>${L('Open the surah to check', 'ޔަޤީންކުރުމަށް ސޫރަތް ހުޅުވާ')}</a>` })} /></div>`; }
  const rows = [['#/t/names', L('The 99 names of Allah', 'ﷲ ގެ 99 އިސްމުފުޅު'), dueNames().length], ['#/t/review/words', L('Arabic words', 'ޢަރަބި ބަސްތައް'), dueWords().length], ['#/t/review/surahs', L('Surahs I know', 'ދަސްވި ސޫރަތްތައް'), dueSurahs().length]];
  return html`<div class="page tool"><${Back} /><h1>${L('Review', 'މުރާޖަޢާ')}</h1>
    <p class="lede">${L('A few cards each day. What you know comes back less often; what you forget comes back tomorrow.', 'ދުވާލަކު މަދު ކާޑުކޮޅެއް. އެނގޭ ތަކެތި މަދުން، ހަނދާންނެތޭ ތަކެތި މާދަމާ އަނބުރާ ގެންނާނެ.')}</p>
    <div class="cardgrid rows one">${rows.map(([href, title, n]) => html`<a class="card" href=${href}><span class="disc num">${n}</span><strong>${title}</strong><span class="muted">${n ? L('ready today', 'މިއަދަށް ތައްޔާރު') : L('nothing due', 'މިއަދަކު ނެތް')}</span></a>`)}</div>
    ${!(tools().course || []).length && html`<p class="muted small">${L('Tick surahs in "Learn the short surahs" and they will appear here for review.', '"ކުރު ސޫރަތްތައް ދަސްކުރުން" ގައި ފާހަގަކުރާ ސޫރަތްތައް މުރާޖަޢާއަށް މިތަނަށް އަންނާނެ.')}</p>`}
  </div>`;
}

// ---------- pictures for the children's stories (no people or prophets are drawn) ----------
const sky = (c, g) => `<rect width="320" height="150" fill="${c}"/><rect y="112" width="320" height="38" fill="${g}"/>`;
const stars = '<g fill="#FBF5E4"><circle cx="30" cy="22" r="1.6"/><circle cx="78" cy="40" r="1.2"/><circle cx="132" cy="18" r="1.5"/><circle cx="196" cy="34" r="1.2"/><circle cx="252" cy="16" r="1.6"/><circle cx="296" cy="44" r="1.2"/></g>';
const ART = {
  'kids-nuh-ark': sky('#9DB9C6', '#2488B4') + '<g stroke="#E8F3F6" stroke-width="2" stroke-linecap="round"><path d="M40 12l-8 22M90 6l-8 22M150 14l-8 22M214 8l-8 22M270 16l-8 22"/></g><path d="M96 96h128l-18 30H114z" fill="#8A5A2B"/><rect x="132" y="70" width="56" height="26" rx="4" fill="#A8703A"/><path d="M0 120q20-10 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0v30H0z" fill="#1B6E97"/>',
  'kids-ibrahim-fire': sky('#F6E3B4', '#E8D5A3') + '<path d="M160 22c26 30 44 44 44 70a44 44 0 0 1-88 0c0-26 18-40 44-70z" fill="#E0764C"/><path d="M160 54c14 18 24 28 24 42a24 24 0 0 1-48 0c0-14 10-24 24-42z" fill="#F2C24F"/><g fill="#1F6F5C"><circle cx="70" cy="112" r="7"/><circle cx="92" cy="116" r="5"/><circle cx="240" cy="113" r="7"/><circle cx="262" cy="117" r="5"/></g>',
  'kids-musa-basket': sky('#CFEAF2', '#2488B4') + '<g stroke="#1F6F5C" stroke-width="4" stroke-linecap="round"><path d="M40 112V60M54 112V72M270 112V56M286 112V70M256 112V76"/></g><path d="M124 100h72l-8 22h-56z" fill="#B4780F"/><path d="M130 100q30-34 60 0" fill="none" stroke="#8A5A2B" stroke-width="4"/><path d="M0 124q20-8 40 0t40 0 40 0 40 0 40 0 40 0 40 0 40 0v26H0z" fill="#1B6E97"/>',
  'kids-yunus-whale': sky('#0B2B45', '#134F6E') + stars + '<circle cx="262" cy="34" r="16" fill="#FBF5E4"/><path d="M70 104c30-34 110-34 150-4 12-14 26-18 34-14-6 10-8 22-2 34-20-4-30-6-40-2-40 16-110 14-142-14z" fill="#3F8FA8"/><circle cx="104" cy="98" r="3" fill="#0B2B45"/><path d="M150 70q4-20-10-26M150 70q-2-20 14-24" stroke="#CFEAF2" stroke-width="3" fill="none" stroke-linecap="round"/>',
  'kids-sulayman-ant': sky('#CFEAF2', '#E8D5A3') + '<path d="M210 112q30-50 70 0z" fill="#C9A86A"/><g fill="#23302F"><ellipse cx="80" cy="108" rx="9" ry="6"/><circle cx="94" cy="106" r="5"/><ellipse cx="130" cy="110" rx="9" ry="6"/><circle cx="144" cy="108" r="5"/><ellipse cx="180" cy="108" rx="9" ry="6"/><circle cx="194" cy="106" r="5"/></g><circle cx="52" cy="34" r="16" fill="#F2C24F"/>',
  'kids-yusuf-dream': sky('#0B2B45', '#134F6E') + '<circle cx="70" cy="42" r="18" fill="#F2C24F"/><circle cx="256" cy="40" r="15" fill="#FBF5E4"/><circle cx="262" cy="36" r="13" fill="#0B2B45"/><g fill="#FFE38A">' + [[120, 30], [150, 56], [184, 26], [214, 60], [110, 78], [160, 92], [206, 96], [136, 104], [240, 86], [178, 66], [96, 104]].map(([x, y]) => `<path d="M${x} ${y - 7}l2 5 5 .6-4 3.4 1 5-4-2.6-4 2.6 1-5-4-3.4 5-.6z"/>`).join('') + '</g>',
  'kids-elephant': sky('#F0D9A8', '#E8D5A3') + '<rect x="130" y="62" width="60" height="52" fill="#23302F"/><rect x="130" y="74" width="60" height="6" fill="#D2A63A"/><g stroke="#23302F" stroke-width="3" fill="none" stroke-linecap="round"><path d="M40 30q8-8 16 0 8-8 16 0M100 18q8-8 16 0 8-8 16 0M206 22q8-8 16 0 8-8 16 0M256 38q8-8 16 0 8-8 16 0"/></g>',
  'kids-thirsty-dog': sky('#CFEAF2', '#E8D5A3') + '<rect x="128" y="84" width="64" height="34" rx="6" fill="#9A8F7A"/><ellipse cx="160" cy="84" rx="32" ry="9" fill="#2488B4"/><path d="M128 84V58h64v26" fill="none" stroke="#8A5A2B" stroke-width="5"/><g fill="#8A5A2B"><circle cx="60" cy="124" r="5"/><circle cx="52" cy="114" r="3"/><circle cx="60" cy="111" r="3"/><circle cx="68" cy="114" r="3"/><circle cx="96" cy="134" r="5"/><circle cx="88" cy="124" r="3"/><circle cx="96" cy="121" r="3"/><circle cx="104" cy="124" r="3"/></g>',
  'kids-zamzam': sky('#F6E3B4', '#E8D5A3') + '<path d="M0 112q50-70 110 0z" fill="#C9A86A"/><path d="M210 112q50-64 110 0z" fill="#C9A86A"/><ellipse cx="160" cy="122" rx="38" ry="10" fill="#2488B4"/><path d="M160 118V92M150 116q-4-14 4-22M170 116q4-14-4-22" stroke="#8FD3E8" stroke-width="4" fill="none" stroke-linecap="round"/>',
  'kids-hoopoe': sky('#CFEAF2', '#1F6F5C') + '<ellipse cx="160" cy="84" rx="34" ry="24" fill="#E0A63A"/><circle cx="196" cy="64" r="14" fill="#E0A63A"/><path d="M208 62l26 4-26 4z" fill="#23302F"/><path d="M190 52l-4-22 10 16 4-20 6 20 10-14-6 22z" fill="#D8704F"/><circle cx="200" cy="62" r="2.4" fill="#23302F"/><path d="M128 84l-36 14 34 6z" fill="#23302F"/><path d="M150 108v14M170 108v14" stroke="#23302F" stroke-width="3"/>',
  'kids-ayyub': sky('#CFEAF2', '#E8D5A3') + '<ellipse cx="120" cy="122" rx="44" ry="10" fill="#2488B4"/><path d="M120 116V88M108 114q-6-14 4-24M132 114q6-14-4-24" stroke="#8FD3E8" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M230 114V70" stroke="#1F6F5C" stroke-width="5"/><g fill="#2E9C83"><ellipse cx="216" cy="78" rx="16" ry="8" transform="rotate(-30 216 78)"/><ellipse cx="246" cy="70" rx="16" ry="8" transform="rotate(30 246 70)"/><ellipse cx="230" cy="58" rx="9" ry="15"/></g>',
  'kids-cave-sleepers': sky('#F6C98A', '#C9A86A') + '<path d="M60 114q20-96 100-96t100 96z" fill="#8A7A62"/><path d="M118 114q6-52 42-52t42 52z" fill="#23302F"/><circle cx="276" cy="36" r="16" fill="#F2C24F"/>',
  'kids-cave-thawr': sky('#0B2B45', '#3A3A30') + stars + '<path d="M50 114q24-92 110-92t110 92z" fill="#5E5647"/><path d="M118 114q6-50 42-50t42 50z" fill="#12100C"/><g stroke="#E8F3F6" stroke-width="1.4" fill="none"><path d="M124 112l36-46 36 46M132 112l28-34 28 34M142 112l18-22 18 22M160 66v46M130 96h60M138 86h44"/></g><ellipse cx="216" cy="110" rx="12" ry="5" fill="#C9A86A"/><circle cx="212" cy="106" r="3" fill="#FBF5E4"/><circle cx="220" cy="106" r="3" fill="#FBF5E4"/>',
  'kids-bilal': sky('#F6C98A', '#E8D5A3') + '<rect x="146" y="50" width="28" height="64" fill="#FBF5E4"/><path d="M142 50h36l-18-26z" fill="#1F6F5C"/><rect x="156" y="84" width="8" height="30" fill="#1F6F5C"/><g stroke="#B4780F" stroke-width="3" fill="none" stroke-linecap="round"><path d="M192 44q10 10 0 20M204 36q18 18 0 36M128 44q-10 10 0 20M116 36q-18 18 0 36"/></g>',
  'kids-kind-animals': sky('#CFEAF2', '#2E9C83') + '<path d="M40 96q110-26 240-6" stroke="#8A5A2B" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M118 84q34 30 70 0z" fill="#A8703A"/><g fill="#FBF5E4"><ellipse cx="140" cy="82" rx="7" ry="9"/><ellipse cx="154" cy="80" rx="7" ry="9"/><ellipse cx="168" cy="82" rx="7" ry="9"/></g><ellipse cx="236" cy="42" rx="18" ry="11" fill="#D8704F"/><circle cx="252" cy="36" r="7" fill="#D8704F"/><path d="M258 36l10 3-10 3z" fill="#23302F"/><path d="M228 40l-22-14 16 20z" fill="#A8432F"/>',
  'kids-truthful': sky('#F6E3B4', '#E8D5A3') + '<path d="M130 112q-10-40 30-46 40 6 30 46z" fill="#A8703A"/><path d="M146 66q14-14 28 0" stroke="#8A5A2B" stroke-width="5" fill="none"/><g fill="#F2C24F" stroke="#B4780F" stroke-width="2"><circle cx="214" cy="110" r="9"/><circle cx="232" cy="116" r="9"/><circle cx="100" cy="114" r="9"/></g>',
  'kids-first-things': sky('#0B2B45', '#134F6E') + stars + '<circle cx="90" cy="60" r="24" fill="#F2C24F"/><circle cx="236" cy="56" r="18" fill="#FBF5E4"/><circle cx="244" cy="50" r="16" fill="#0B2B45"/><circle cx="160" cy="96" r="22" fill="#2488B4"/><path d="M146 90q10-10 20 0t10 12q-12 8-22 0z" fill="#2E9C83"/>',
  'kids-months': sky('#0B2B45', '#134F6E') + stars + '<circle cx="160" cy="66" r="34" fill="#FBF5E4"/><circle cx="174" cy="58" r="30" fill="#0B2B45"/>',
};
export function StoryArt({ id }) {
  if (!ART[id]) return null;
  return html`<svg class="story-art" viewBox="0 0 320 150" role="img" aria-hidden="true" dangerouslySetInnerHTML=${{ __html: ART[id] }}></svg>`;
}
