// Everyday tools: Ramadan, zakat, missed prayers, a khatm plan, memorising, the children's star chart,
// the daily quiz, mosques nearby, the Friday card, deeds done in memory, and the azan while the app is open.
// Everything a person enters stays on their own device (settings key "tools").
import { html, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { getSettings, setSettings, onSettings, isDv, mvNow, todayKey, timesFor, fmtTime, fmtSpan, hijriParts, getJSON, api, ayahUrl } from './lib.js';
import { QUIZ } from './quiz.js';

const L = (en, dv) => (isDv() ? dv : en);
const tools = () => getSettings().tools || {};
const save = (patch) => setSettings({ tools: { ...tools(), ...patch } });
function useS() { const [, f] = useState(0); useEffect(() => onSettings(() => f((n) => n + 1)), []); return getSettings(); }
function useJSON(url) { const [d, set] = useState(null); useEffect(() => { let on = true; getJSON(url).then((x) => on && set(x)).catch(() => {}); return () => { on = false; }; }, [url]); return d; }
function useTick(ms = 30000) { const [, f] = useState(0); useEffect(() => { const i = setInterval(() => f((n) => n + 1), ms); return () => clearInterval(i); }, []); }
const Back = () => html`<a class="back" href="#/t">‹ ${L('Tools', 'ޓޫލްސް')}</a>`;
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) && n > 0 ? n : 0; };
const money = (n) => n.toLocaleString('en', { maximumFractionDigits: 2 });

export const TOOLS = [
  ['ramadan', 'Ramadan', 'ރަމަޟާން', 'Suhoor and iftar times, a fasting tracker and a juz a day.', 'ހާރުކާ ވަގުތާއި ރޯދަވީއްލާ ވަގުތު، ރޯދައިގެ ޗާޓު، ދުވާލަކު ފޮތެއް.'],
  ['khatm', 'Finish the Quran', 'ޤުރުއާން ޚަތިމްކުރުން', 'Pick a number of days and read your pages each day.', 'ދުވަސްތައް ކަނޑައަޅައި، ކޮންމެ ދުވަހަކު ޞަފްޙާތައް ކިޔަވާ.'],
  ['hifz', 'Memorise', 'ހިތުދަސްކުރުން', 'Hear an ayah again and again, then hide it and test yourself.', 'އާޔަތެއް ތަކުރާރުކޮށް އަޑުއަހައި، ފޮރުވައިގެން ކިޔާ.'],
  ['quiz', 'Daily quiz', 'ދުވަހުގެ ކުއިޒް', 'Five questions a day.', 'ދުވާލަކު ފަސް ސުވާލު.'],
  ['kids', 'Children\'s star chart', 'ކުދިންގެ ތަރި ޗާޓު', 'A star for every good deed today.', 'މިއަދު ކުރާ ކޮންމެ ހެޔޮ ކަމަކަށް ތަރިއެއް.'],
  ['qada', 'Missed prayers', 'ޤަޟާ ނަމާދު', 'Count what you owe and tick each one you make up.', 'ޤަޟާކުރަންޖެހޭ ނަމާދު ގުނައި، ކުރާ ކޮންމެ ނަމާދެއް ފާހަގަކުރޭ.'],
  ['zakat', 'Zakat calculator', 'ޒަކާތް ހިސާބުކުރުން', 'Work out 2.5% on what you own, in rufiyaa.', 'ރުފިޔާއިން، މުދަލުގެ 2.5% ހިސާބުކުރޭ.'],
  ['mosque', 'Mosques near me', 'ކައިރީގައިވާ މިސްކިތްތައް', 'Open the map at the nearest mosques.', 'އެންމެ ކައިރި މިސްކިތްތައް ޗާޓުން ބަލާ.'],
];

export function ToolsPage({ name }) {
  useS();
  const P = { ramadan: Ramadan, khatm: Khatm, hifz: Hifz, quiz: Quiz, kids: Kids, qada: Qada, zakat: Zakat, mosque: Mosque }[name];
  if (P) return html`<div class="page tool"><${Back} /><${P} /></div>`;
  return html`<div class="page wide"><h1>${L('Tools', 'ޓޫލްސް')}</h1>
    <div class="tool-grid">${TOOLS.map(([id, en, dv, sen, sdv]) => html`<a class="card" href=${'#/t/' + id}><strong>${L(en, dv)}</strong><span class="muted">${L(sen, sdv)}</span></a>`)}
      <a class="card" href="#/s/sisters"><strong>${L('For sisters', 'އަންހެނުންނަށް')}</strong><span class="muted">${L('Prayer and fasting rulings particular to women.', 'އަންހެނުންނަށް ޚާއްޞަ ނަމާދާއި ރޯދައިގެ ޙުކުމްތައް.')}</span></a></div>
    <${AzanSetting} /></div>`;
}

// ---------- Ramadan ----------
const JUZ_PAGE = [1, 22, 42, 62, 82, 102, 121, 142, 162, 182, 201, 222, 242, 262, 282, 302, 322, 342, 362, 382, 402, 422, 442, 462, 482, 502, 522, 542, 562, 582];
function Ramadan() {
  useTick();
  const s = getSettings(), data = useJSON('/data/prayer.json'), h = hijriParts(), now = mvNow(), minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const year = now.getUTCFullYear(), t = tools(), fast = (t.fast || {})[year] || {}, tar = (t.tarawih || {})[year] || {};
  const flip = (key, cur, d) => save({ [key]: { ...(t[key] || {}), [year]: { ...cur, [d]: cur[d] ? 0 : 1 } } });
  const inR = h.m === 9, day = inR ? h.d : 0;
  let times = null; if (data) times = timesFor(data, s.island, now).times;
  const until = (m) => (m >= minute ? fmtSpan(m - minute) : null);
  return html`<h1>${L('Ramadan', 'ރަމަޟާން')}</h1>
    <p class="lede">${inR ? L(`Today is day ${day} of Ramadan.`, `މިއަދަކީ ރަމަޟާން މަހުގެ ${day} ވަނަ ދުވަހެވެ.`) : L('It is not Ramadan now. You can still use this page for voluntary fasts and to see how it works.', 'މިހާރަކީ ރަމަޟާން މަހެއް ނޫނެވެ. ސުންނަތް ރޯދަތަކަށްވެސް މި ޞަފްޙާ ބޭނުންކުރެވޭނެއެވެ.')}</p>
    ${times && html`<div class="tool-two">
      <div class="set-card"><span class="muted">${L('Suhoor ends (Fajr)', 'ހާރުކާ ވަގުތު ނިމޭ (ފަތިސް)')}</span><strong class="big num">${fmtTime(times[0])}</strong><span class="muted">${until(times[0]) ? L('in ', '') + until(times[0]) : L('passed for today', 'މިއަދަށް ފާއިތުވެއްޖެ')}</span></div>
      <div class="set-card"><span class="muted">${L('Iftar (Maghrib)', 'ރޯދަވީއްލުން (މަޣްރިބު)')}</span><strong class="big num">${fmtTime(times[4])}</strong><span class="muted">${until(times[4]) ? L('in ', '') + until(times[4]) : L('passed for today', 'މިއަދަށް ފާއިތުވެއްޖެ')}</span></div></div>`}
    <div class="row-links"><a class="btn" href="#/s/fasting-eid-duas">${L('Duas for fasting', 'ރޯދައިގެ ދުޢާތައް')}</a>${inR && day <= 30 && html`<a class="btn primary" href=${'#/mushaf/' + JUZ_PAGE[day - 1]}>${L(`Today's juz: ${day}`, `މިއަދުގެ ފޮތް: ${day}`)}</a>`}</div>
    <h2>${L('Fasts kept', 'ހިފި ރޯދަތައް')} <span class="muted num">${Object.values(fast).filter(Boolean).length} / 30</span></h2>
    <div class="daygrid">${Array.from({ length: 30 }, (_, i) => html`<button class=${'day' + (fast[i + 1] ? ' on' : '') + (i + 1 === day ? ' today' : '')} onClick=${() => flip('fast', fast, i + 1)}>${i + 1}</button>`)}</div>
    <h2>${L('Tarawih prayed', 'ކުރި ތަރާވީޙް')} <span class="muted num">${Object.values(tar).filter(Boolean).length} / 30</span></h2>
    <div class="daygrid">${Array.from({ length: 30 }, (_, i) => html`<button class=${'day' + (tar[i + 1] ? ' on' : '') + (i + 1 === day ? ' today' : '')} onClick=${() => flip('tarawih', tar, i + 1)}>${i + 1}</button>`)}</div>
    <p class="muted small">${L('The start of Ramadan is announced by the Ministry of Islamic Affairs after the moon is sighted; the day number here is calculated and can differ by a day.', 'ރަމަޟާން މަސް ފެށޭ ދުވަސް އިޢުލާނުކުރައްވަނީ އިސްލާމީ ކަންތައްތަކާބެހޭ ވުޒާރާއިންނެވެ. މިތަނުގައިވާ ދުވަސް އެއް ދުވަހުގެ ތަފާތު އައުން އެކަށީގެންވެއެވެ.')}</p>`;
}

// ---------- Zakat ----------
function Zakat() {
  const z = tools().zakat || {}, set = (k) => (e) => save({ zakat: { ...z, [k]: e.target.value } });
  const F = (k, en, dv, hint) => html`<label class="field"><span>${L(en, dv)}</span><input inputmode="decimal" value=${z[k] || ''} onInput=${set(k)} placeholder=${hint || '0'} /></label>`;
  const pg = num(z.pg), ps = num(z.ps), bySilver = (z.basis || 'silver') === 'silver';
  const total = num(z.cash) + num(z.gold) * pg + num(z.silver) * ps + num(z.goods) + num(z.owed) - num(z.debts);
  const nisab = bySilver ? 595 * ps : 85 * pg, known = nisab > 0, due = known && total >= nisab ? total * 0.025 : 0;
  return html`<h1>${L('Zakat calculator', 'ޒަކާތް ހިސާބުކުރުން')}</h1>
    <p class="lede">${L('Zakat is 2.5% of wealth that has stayed above the nisab for one lunar year. Enter amounts in rufiyaa.', 'ޒަކާތަކީ، ހިޖުރީ އެއް އަހަރު ވަންދެން ނިޞާބަށްވުރެ މަތީގައި ހުރި މުދަލުގެ 2.5% އެވެ. ޢަދަދުތައް ރުފިޔާއިން ލިޔޭ.')}</p>
    <div class="set-card form">
      ${F('cash', 'Cash and bank savings', 'ނަގުދު ފައިސާއާއި ބޭންކުގައިވާ ފައިސާ')}
      ${F('gold', 'Gold you own (grams)', 'ރަން (ގްރާމް)')}${F('silver', 'Silver you own (grams)', 'ރިހި (ގްރާމް)')}
      ${F('goods', 'Goods for sale, at today\'s value', 'ވިއްކަން ހުރި މުދާ، މިއަދުގެ އަގުން')}
      ${F('owed', 'Money owed to you that you expect back', 'ލިބެންޖެހޭ، ލިބޭނެކަމަށް ބަލާ ފައިސާ')}
      ${F('debts', 'Debts you must pay now', 'މިހާރު ދައްކަންޖެހޭ ދަރަނި')}
    </div>
    <div class="set-card form"><p class="muted small">${L('Today\'s price per gram. Ask a jeweller; the app does not know it.', 'މިއަދުގެ ގްރާމެއްގެ އަގު. ގަހަނާ ފިހާރައަކުން އަހާ.')}</p>
      ${F('pg', 'Gold, rufiyaa per gram', 'ރަން، ގްރާމަކަށް ރުފިޔާ')}${F('ps', 'Silver, rufiyaa per gram', 'ރިހި، ގްރާމަކަށް ރުފިޔާ')}
      <div class="chips"><button class=${'chip' + (bySilver ? ' on' : '')} onClick=${() => save({ zakat: { ...z, basis: 'silver' } })}>${L('Nisab by silver (595 g)', 'ރިހީގެ ނިޞާބު (595 ގްރާމް)')}</button><button class=${'chip' + (!bySilver ? ' on' : '')} onClick=${() => save({ zakat: { ...z, basis: 'gold' } })}>${L('Nisab by gold (85 g)', 'ރަނުގެ ނިޞާބު (85 ގްރާމް)')}</button></div></div>
    <div class="set-card result"><span class="muted">${L('Wealth that counts', 'ޒަކާތް ވާޖިބުވާ މުދާ')}</span><strong class="num">${money(Math.max(0, total))}</strong>
      <span class="muted">${L('Nisab', 'ނިޞާބު')}</span><strong class="num">${known ? money(nisab) : L('enter the price per gram', 'ގްރާމެއްގެ އަގު ލިޔޭ')}</strong>
      <span class="muted">${L('Zakat to pay', 'ދައްކަންޖެހޭ ޒަކާތް')}</span><strong class="big num">${known ? money(due) : '–'}</strong>
      ${known && total < nisab && html`<p class="muted small">${L('Your wealth is below the nisab, so no zakat is due.', 'މުދާ ނިޞާބަށްވުރެ މަދުވާތީ ޒަކާތެއް ވާޖިބެއް ނުވެއެވެ.')}</p>`}</div>
    <p class="muted small">${L('This is a simple guide. Scholars differ on details such as jewellery that is worn, and which nisab to use; the silver nisab is the more cautious. Zakat al-fitr is separate: it is paid per person before the Eid prayer, at the amount announced each year. Ask a scholar or the Ministry of Islamic Affairs about your own case.', 'މިއީ ފަސޭހަ ގައިޑެކެވެ. އަޅާ ގަހަނާ ފަދަ ތަފްޞީލުތަކުގައި ޢިލްމުވެރިންގެ ޚިޔާލު ތަފާތެވެ. ފިޠުރު ޒަކާތަކީ ވަކި ޒަކާތެކެވެ. އަމިއްލަ ޙާލަތާމެދު ޢިލްމުވެރިއަކާ ނުވަތަ އިސްލާމީ ވުޒާރާއާ ސުވާލުކުރޭ.')}</p>`;
}

// ---------- Missed prayers ----------
const QADA = [['fajr', 'Fajr', 'ފަތިސް'], ['dhuhr', 'Dhuhr', 'މެންދުރު'], ['asr', 'Asr', 'ޢަޞްރު'], ['maghrib', 'Maghrib', 'މަޣްރިބު'], ['isha', 'Isha', 'ޢިޝާ'], ['fast', 'Fasts of Ramadan', 'ރަމަޟާން މަހުގެ ރޯދަ']];
function Qada() {
  const q = tools().qada || {}, bump = (k, d) => save({ qada: { ...q, [k]: Math.max(0, (q[k] || 0) + d) } });
  const total = QADA.reduce((a, [k]) => a + (q[k] || 0), 0);
  return html`<h1>${L('Missed prayers', 'ޤަޟާ ނަމާދު')}</h1>
    <p class="lede">${L('Set how many of each you still owe. Press "Made one up" each time you pray one.', 'ކޮންމެ ނަމާދަކުން ޤަޟާކުރަންޖެހޭ ޢަދަދު ކަނޑައަޅާ. ޤަޟާކުރާ ކޮންމެ ފަހަރަކު "ޤަޟާކޮށްފިން" އަށް ފިއްތާ.')}</p>
    <div class="set-card">${QADA.map(([k, en, dv]) => html`<div class="qrow"><strong>${L(en, dv)}</strong><span class="qn num">${q[k] || 0}</span>
      <button class="btn" onClick=${() => bump(k, 1)} aria-label="add">+</button><button class="btn" onClick=${() => bump(k, 10)}>+10</button>
      <button class="btn primary" disabled=${!(q[k] > 0)} onClick=${() => bump(k, -1)}>${L('Made one up', 'ޤަޟާކޮށްފިން')}</button></div>`)}</div>
    <p class="muted">${L('Still owed: ', 'ބާކީ: ')}<strong class="num">${total}</strong></p>
    <p class="muted small">${L('A missed obligatory prayer is made up as soon as you can, in the same number of rak\'ahs. Praying one missed prayer with each prayer of the day is a steady way to clear them.', 'ފަރުޟު ނަމާދެއް ދޫވެއްޖެނަމަ ކުރެވެން އޮތް އެންމެ އަވަހަކަށް، ހަމަ އެ ރަކުޢަތްތަކަށް ޤަޟާކުރާށެވެ.')}</p>`;
}

// ---------- Khatm plan ----------
function Khatm() {
  const k = tools().khatm, [days, setDays] = useState(30);
  if (!k) return html`<h1>${L('Finish the Quran', 'ޤުރުއާން ޚަތިމްކުރުން')}</h1>
    <p class="lede">${L('The mushaf has 604 pages. Choose how many days you want to finish in.', 'މުޞްޙަފުގައި 604 ޞަފްޙާ ވެއެވެ. ނިންމަން ބޭނުންވާ ދުވަސްތައް ކަނޑައަޅާ.')}</p>
    <div class="chips">${[7, 15, 30, 60, 90, 180].map((d) => html`<button class=${'chip' + (days === d ? ' on' : '')} onClick=${() => setDays(d)}>${d} ${L('days', 'ދުވަސް')}</button>`)}</div>
    <p><strong class="big num">${Math.ceil(604 / days)}</strong> ${L('pages a day', 'ޞަފްޙާ ދުވާލަކު')}</p>
    <button class="btn primary" onClick=${() => save({ khatm: { start: todayKey(), days, done: 0 } })}>${L('Start today', 'މިއަދު ފަށާ')}</button>`;
  const per = Math.ceil(604 / k.days), done = Math.min(604, k.done || 0), from = done + 1, to = Math.min(604, done + per);
  const dayNo = Math.floor((Date.parse(todayKey()) - Date.parse(k.start)) / 86400000) + 1, should = Math.min(604, dayNo * per), gap = should - done;
  return html`<h1>${L('Finish the Quran', 'ޤުރުއާން ޚަތިމްކުރުން')}</h1>
    <div class="bar"><i style=${{ width: (done / 604) * 100 + '%' }}></i></div>
    <p class="muted"><span class="num">${done} / 604</span> ${L('pages', 'ޞަފްޙާ')} · ${L('day', 'ދުވަސް')} <span class="num">${Math.min(dayNo, k.days)} / ${k.days}</span></p>
    ${done >= 604 ? html`<div class="set-card"><strong>${L('Khatm complete. May Allah accept it.', 'ޚަތިމް ނިމިއްޖެ. ﷲ ޤަބޫލުކުރައްވާށި.')}</strong><a class="btn" href="#/duas">${L('Make dua', 'ދުޢާކުރޭ')}</a></div>`
      : html`<div class="set-card"><span class="muted">${L('Today\'s reading', 'މިއަދުގެ ކިޔެވުން')}</span><strong class="big num">${from} – ${to}</strong>
        <div class="row-links"><a class="btn primary" href=${'#/mushaf/' + from}>${L('Open the page', 'ޞަފްޙާ ހުޅުވާ')}</a><button class="btn" onClick=${() => save({ khatm: { ...k, done: to } })}>${L('I have read these', 'މި ޞަފްޙާތައް ކިޔައިފިން')}</button></div>
        ${gap > per ? html`<p class="muted small">${L(`You are ${gap - per} pages behind the plan. Read a little extra when you can.`, `ޕްލޭނަށްވުރެ ${gap - per} ޞަފްޙާ ފަހަތުގައި.`)}</p>` : gap <= 0 ? html`<p class="muted small">${L('You are ahead of the plan.', 'ޕްލޭނަށްވުރެ ކުރީގައި.')}</p>` : null}</div>`}
    <button class="btn" onClick=${() => { if (confirm(L('Start a new plan? Your progress in this one will be cleared.', 'އާ ޕްލޭނެއް ފަށަންތަ؟'))) save({ khatm: null }); }}>${L('Start a new plan', 'އާ ޕްލޭނެއް ފަށާ')}</button>`;
}

// ---------- Memorise ----------
function Hifz() {
  const idx = useJSON('/quran/index.json'), h = tools().hifz || {}, [n, setN] = useState(h.last || 112), sur = useJSON(`/quran/${n}.json`);
  const [a, setA] = useState(1), [reps, setReps] = useState(5), [hide, setHide] = useState(false), [left, setLeft] = useState(0), au = useRef(null), known = h.known || {};
  useEffect(() => { setA(1); stop(); save({ hifz: { ...(tools().hifz || {}), last: n } }); }, [n]);
  useEffect(() => () => stop(), []);
  const stop = () => { if (au.current) { au.current.pause(); au.current = null; } setLeft(0); };
  const play = () => {
    stop(); let c = reps; setLeft(c);
    const el = new Audio(ayahUrl(n, a)); au.current = el;
    el.onended = () => { c -= 1; setLeft(c); if (c > 0 && au.current === el) { el.currentTime = 0; el.play().catch(() => {}); } else if (au.current === el) au.current = null; };
    el.play().catch(() => setLeft(0));
  };
  if (!idx || !sur) return html`<h1>${L('Memorise', 'ހިތުދަސްކުރުން')}</h1><p class="muted">…</p>`;
  const ay = sur.ayahs[a - 1] || sur.ayahs[0];
  return html`<h1>${L('Memorise', 'ހިތުދަސްކުރުން')}</h1>
    <label class="field"><span>${L('Surah', 'ސޫރަތް')}</span><select value=${n} onChange=${(e) => setN(+e.target.value)}>${idx.surahs.map((s) => html`<option value=${s.n}>${s.n}. ${s.name}${known[s.n] ? ' ✓' : ''}</option>`)}</select></label>
    <div class="set-card hifz"><p class="muted">${L('Ayah', 'އާޔަތް')} <span class="num">${a} / ${sur.count}</span></p>
      <p class=${'ar hifz-ar' + (hide ? ' hidden' : '')} lang="ar" dir="rtl" onClick=${() => hide && setHide(false)}>${ay[0]}</p>
      ${!hide && html`<p class="muted">${isDv() ? ay[2] : ay[1]}</p>`}
      <div class="row-links"><button class="btn" disabled=${a <= 1} onClick=${() => { stop(); setA(a - 1); }}>‹</button>
        ${left ? html`<button class="btn primary" onClick=${stop}>${L('Stop', 'ހުއްޓާ')} · ${left}</button>` : html`<button class="btn primary" onClick=${play}>${L('Listen', 'އަޑުއަހާ')} × ${reps}</button>`}
        <button class="btn" disabled=${a >= sur.count} onClick=${() => { stop(); setA(a + 1); }}>›</button></div>
      <div class="chips">${[3, 5, 10, 20].map((r) => html`<button class=${'chip' + (reps === r ? ' on' : '')} onClick=${() => setReps(r)}>× ${r}</button>`)}
        <button class=${'chip' + (hide ? ' on' : '')} onClick=${() => setHide(!hide)}>${hide ? L('Show the ayah', 'އާޔަތް ދައްކާ') : L('Hide and test me', 'ފޮރުވާފައި ކިޔަން')}</button></div></div>
    <button class=${'btn' + (known[n] ? ' primary' : '')} onClick=${() => save({ hifz: { ...h, last: n, known: { ...known, [n]: known[n] ? 0 : 1 } } })}>${known[n] ? L('I know this surah ✓', 'މި ސޫރަތް ހިތުދަސް ✓') : L('Mark this surah as memorised', 'މި ސޫރަތް ހިތުދަސްކަމަށް ފާހަގަކުރޭ')}</button>
    <p class="muted">${L('Surahs memorised: ', 'ހިތުދަސް ސޫރަތްތައް: ')}<strong class="num">${Object.values(known).filter(Boolean).length} / 114</strong></p>
    <p class="muted small">${L('Listening needs the internet unless you saved this surah\'s audio offline. Check what you memorise with a teacher.', 'އަޑުއެހުމަށް އިންޓަނެޓް ބޭނުންވެއެވެ. ހިތުދަސްކުރާ އެއްޗެއް އެދުރަކު ލައްވާ ބަލުވާ.')}</p>`;
}

// ---------- Daily quiz ----------
function pickDaily(list, n) { // the same questions for everyone on the same day
  const seed = Math.floor(Date.parse(todayKey()) / 86400000), out = [], used = new Set();
  for (let i = 0; out.length < Math.min(n, list.length); i++) { const k = (seed * 7 + i * 13 + i * i * 5) % list.length; if (!used.has(k)) { used.add(k); out.push(list[k]); } }
  return out;
}
function QuizRun({ list, store }) {
  const day = todayKey(), q = tools()[store] || {}, [i, setI] = useState(0), [picked, setPicked] = useState(null), [score, setScore] = useState(0);
  if (q.day === day && i === 0 && picked === null) return html`<div class="set-card"><strong class="big num">${q.score} / ${list.length}</strong><p>${L('Done for today. New questions tomorrow.', 'މިއަދަށް ނިމުނީ. މާދަމާ އާ ސުވާލުތައް.')}</p><p class="muted">${L('Days in a row: ', 'ވިދިވިދިގެން ދުވަސް: ')}<strong class="num">${q.streak || 1}</strong></p></div>`;
  if (i >= list.length) return html`<div class="set-card"><strong class="big num">${score} / ${list.length}</strong><p>${score === list.length ? L('All correct. Ma sha\' Allah!', 'ހުރިހާ ޖަވާބެއް ރަނގަޅު. މާޝާﷲ!') : L('Well done. Read the ones you missed and try again tomorrow.', 'ޝާބާސް. މާދަމާ އަލުން މަސައްކަތްކުރޭ.')}</p></div>`;
  const [en, dv, oe, od, right, ne, nd] = list[i], opts = isDv() ? od : oe;
  const next = () => {
    if (i + 1 >= list.length) { const y = new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10); save({ [store]: { day, score, streak: q.day === y ? (q.streak || 1) + 1 : 1 } }); }
    setI(i + 1); setPicked(null);
  };
  return html`<p class="muted num">${i + 1} / ${list.length}</p><h2>${L(en, dv)}</h2>
    <div class="answers">${opts.map((o, k) => html`<button class=${'btn answer' + (picked !== null ? (k === right ? ' right' : k === picked ? ' wrong' : '') : '')} disabled=${picked !== null} onClick=${() => { setPicked(k); if (k === right) setScore(score + 1); }}>${o}</button>`)}</div>
    ${picked !== null && html`<div class="set-card"><strong>${picked === right ? L('Correct.', 'ރަނގަޅު.') : L('Not quite.', 'ނޫން.')}</strong><p>${L(ne, nd)}</p><button class="btn primary" onClick=${next}>${i + 1 >= list.length ? L('See my score', 'ނަތީޖާ ބަލާ') : L('Next question', 'ދެން އޮތް ސުވާލު')}</button></div>`}`;
}
function Quiz() { return html`<h1>${L('Daily quiz', 'ދުވަހުގެ ކުއިޒް')}</h1><${QuizRun} list=${pickDaily(QUIZ, 5)} store="quiz" />`; }

// ---------- Children ----------
const DEEDS = [['Prayed on time', 'ވަގުތަށް ނަމާދުކުރިން'], ['Read some Quran', 'ޤުރުއާން ކިޔެވިން'], ['Said Bismillah before eating', 'ކެއުމުގެ ކުރިން ބިސްމިﷲ ކިޔިން'], ['Helped mum or dad', 'މަންމައަށް ނުވަތަ ބައްޕައަށް އެހީވިން'], ['Said salam first', 'ފުރަތަމަ ސަލާމްކުރިން'], ['Shared something', 'އެއްޗެއް ހިއްސާކުރިން'], ['Told the truth', 'ތެދު ބުނިން'], ['Said my dua before sleeping', 'ނިދުމުގެ ކުރިން ދުޢާ ކިޔިން']];
function Kids() {
  const day = todayKey(), st = tools().stars || {}, mine = st[day] || [];
  const flip = (i) => save({ stars: { ...st, [day]: mine.includes(i) ? mine.filter((x) => x !== i) : [...mine, i] } });
  const week = Array.from({ length: 7 }, (_, k) => (st[new Date(Date.parse(day) - k * 86400000).toISOString().slice(0, 10)] || []).length).reduce((a, b) => a + b, 0);
  return html`<h1>${L('My star chart', 'އަހަރެންގެ ތަރި ޗާޓު')}</h1>
    <p class="lede">${L('Tap each good thing you did today.', 'މިއަދު ކުރި ކޮންމެ ހެޔޮ ކަމެއްގައި ފިއްތާ.')}</p>
    <div class="deeds">${DEEDS.map(([en, dv], i) => html`<button class=${'deed' + (mine.includes(i) ? ' on' : '')} onClick=${() => flip(i)}><span class="star">★</span>${L(en, dv)}</button>`)}</div>
    <div class="tool-two"><div class="set-card"><span class="muted">${L('Stars today', 'މިއަދުގެ ތަރިތައް')}</span><strong class="big num">${mine.length}</strong></div><div class="set-card"><span class="muted">${L('Stars this week', 'މި ހަފްތާގެ ތަރިތައް')}</span><strong class="big num">${week}</strong></div></div>
    <div class="row-links"><a class="btn primary" href="#/s/kids-stories">${L('Read a story', 'ވާހަކައެއް ކިޔާ')}</a></div>
    <h2>${L('Quiz for children', 'ކުދިންގެ ކުއިޒް')}</h2><${QuizRun} list=${pickDaily(QUIZ.filter((q) => q[7]), 3)} store="kidquiz" />`;
}

// ---------- Mosques ----------
function Mosque() {
  const [msg, setMsg] = useState('');
  const go = () => {
    const open = (u) => { location.href = u; };
    if (!navigator.geolocation) return open('https://www.google.com/maps/search/mosque+near+me');
    setMsg(L('Finding where you are…', 'ތިބާ ހުރި ތަން ހޯދަނީ…'));
    navigator.geolocation.getCurrentPosition((p) => open(`https://www.google.com/maps/search/mosque/@${p.coords.latitude},${p.coords.longitude},16z`), () => open('https://www.google.com/maps/search/mosque+near+me'), { timeout: 8000 });
  };
  return html`<h1>${L('Mosques near me', 'ކައިރީގައިވާ މިސްކިތްތައް')}</h1>
    <p class="lede">${L('This opens Google Maps and searches for mosques around you. Sharaf does not keep its own list of mosques.', 'މިއިން ގޫގުލް މެޕްސް ހުޅުވައި ކައިރީގައިވާ މިސްކިތްތައް ހޯދައިދޭނެއެވެ.')}</p>
    <div class="row-links"><button class="btn primary" onClick=${go}>${L('Open the map', 'ޗާޓު ހުޅުވާ')}</button><a class="btn" href="#/qibla">${L('Qibla compass', 'ޤިބުލަ ސަމުގާ')}</a></div>
    ${msg && html`<p class="muted">${msg}</p>`}`;
}

// ---------- Friday ----------
export function FridayCard() {
  if (mvNow().getUTCDay() !== 5) return null;
  return html`<section class="friday"><strong>${L('It is Friday', 'މިއަދަކީ ހުކުރު ދުވަހެވެ')}</strong>
    <p>${L('Read Surah al-Kahf, send many salawat on the Prophet ﷺ, and make dua in the last hour before Maghrib.', 'ސޫރަތުލް ކަހްފު ކިޔަވައި، ނަބިއްޔާ ﷺ އަށް ގިނައިން ޞަލަވާތް ކިޔަވައި، މަޣްރިބުގެ ކުރީގެ ފަހު ގަޑީގައި ދުޢާކުރޭ.')}</p>
    <div class="row-links"><a class="btn primary" href="#/quran/18">${L('Open Surah al-Kahf', 'ސޫރަތުލް ކަހްފު ހުޅުވާ')}</a></div></section>`;
}

// ---------- Deeds done in her memory ----------
const DEED_KEYS = [['dua', 'I made dua for her', 'އެކަމަނާއަށްޓަކައި ދުޢާކޮށްފިން'], ['sadaqah', 'I gave charity on her behalf', 'އެކަމަނާގެ ނަމުގައި ޞަދަޤާތް ދީފިން'], ['quran', 'I read Quran and asked Allah to give her its reward', 'ޤުރުއާން ކިޔަވައި، ސަވާބު އެކަމަނާއަށް ދެއްވުން އެދި ދުޢާކޮށްފިން']];
export function DeedCounters() {
  const [c, setC] = useState(null), [, f] = useState(0), day = todayKey();
  useEffect(() => { api('/counters').then(setC).catch(() => setC({})); }, []);
  const mine = (k) => { try { return localStorage.getItem('dheen-deed-' + k) === day; } catch { return false; } };
  const add = async (k) => { try { localStorage.setItem('dheen-deed-' + k, day); } catch {} f((n) => n + 1); try { setC(await api('/counters/' + k, { method: 'POST' })); } catch {} };
  return html`<section class="deedbox"><h2>${L('Gifts sent to her', 'އެކަމަނާއަށް ފޮނުވި ހަދިޔާ')}</h2>
    <p class="muted">${L('When you do one of these for her, tap it. Everyone who opens this page sees the total.', 'އެކަމަނާއަށްޓަކައި މިއިން ކަމެއް ކުރުމުން ފިއްތާ. މި ޞަފްޙާ ހުޅުވާ އެންމެންނަށް ޖުމްލަ ފެންނާނެއެވެ.')}</p>
    ${DEED_KEYS.map(([k, en, dv]) => html`<div class="deedrow"><strong class="num">${c ? c[k] || 0 : '…'}</strong><span>${L(en, dv)}</span><button class=${'btn' + (mine(k) ? '' : ' primary')} disabled=${mine(k)} onClick=${() => add(k)}>${mine(k) ? L('Counted today', 'މިއަދު ގުނިއްޖެ') : L('I did this', 'މިކަން ކޮށްފިން')}</button></div>`)}
    <p class="muted small">${L('Dua and charity for the dead benefit them by agreement of the scholars. On gifting the reward of reciting Quran, scholars differ.', 'މަރުވެފައިވާ މީހުންނަށް ދުޢާއާއި ޞަދަޤާތުގެ ފައިދާ ލިބޭކަމުގައި ޢިލްމުވެރިން އިއްތިފާޤުވެއެވެ. ޤުރުއާން ކިޔެވުމުގެ ސަވާބު ހަދިޔާކުރުމާމެދު ޚިޔާލު ތަފާތެވެ.')}</p></section>`;
}

// ---------- Azan while the app is open ----------
// Played through Web Audio, which an iPhone silences when its ring switch is on silent.
let actx = null, azanBuf = null, azanSrc = null;
const unlock = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch {} };
if (typeof window !== 'undefined') window.addEventListener('pointerdown', unlock, { passive: true });
async function playAzan(onEnd) {
  unlock(); if (!actx) return false;
  try {
    if (!azanBuf) azanBuf = await actx.decodeAudioData(await (await fetch('/audio/azan/azan.mp3')).arrayBuffer());
    stopAzan(); azanSrc = actx.createBufferSource(); azanSrc.buffer = azanBuf; azanSrc.connect(actx.destination); azanSrc.onended = () => { azanSrc = null; onEnd && onEnd(); }; azanSrc.start();
    return true;
  } catch { return false; }
}
function stopAzan() { try { if (azanSrc) { azanSrc.onended = null; azanSrc.stop(); } } catch {} azanSrc = null; }
export function AzanWatcher() {
  const s = useS(), data = useJSON('/data/prayer.json'), [on, setOn] = useState(false), last = useRef('');
  useEffect(() => {
    if (!data || !(s.tools || {}).azan) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const now = mvNow(), minute = now.getUTCHours() * 60 + now.getUTCMinutes(), { times } = timesFor(data, getSettings().island, now);
      [0, 2, 3, 4, 5].forEach((i) => { const key = todayKey() + ':' + i; if (minute === times[i] && last.current !== key) { last.current = key; playAzan(() => setOn(false)).then((ok) => ok && setOn(true)); } });
    };
    const t = setInterval(check, 15000); check(); return () => clearInterval(t);
  }, [data, (s.tools || {}).azan, s.island]);
  if (!on) return null;
  return html`<div class="azanbar" role="status"><span>${L('Azan', 'ބަންގި')}</span><button class="btn" onClick=${() => { stopAzan(); setOn(false); }}>${L('Stop', 'ހުއްޓާ')}</button></div>`;
}
function AzanSetting() {
  const on = !!tools().azan, [test, setTest] = useState(false);
  return html`<section class="set-card azan-set"><h2>${L('Azan sound', 'ބަންގީގެ އަޑު')}</h2>
    <p class="muted">${L('Plays the azan when a prayer time arrives while Sharaf is open on the screen. It follows your phone: on an iPhone set to silent it makes no sound. When the app is closed you still get the normal alert, which uses your phone\'s own alert sound.', 'ޝަރަފު ހުޅުވާފައި އޮންނައިރު ނަމާދު ވަގުތު ޖެހުމުން ބަންގި ގޮވާނެއެވެ. ފޯނު ސައިލެންޓްގައި ބާއްވާފައިވާނަމަ އަޑެއް ނުލައްވާނެއެވެ. އެޕް ލައްޕާފައި އޮންނައިރު ލިބޭނީ ޢާންމު އެލާޓެވެ.')}</p>
    <div class="row-links"><button class=${'btn' + (on ? ' primary' : '')} onClick=${() => { unlock(); save({ azan: !on }); }}>${on ? L('Azan is on', 'ބަންގި އޮން') : L('Turn the azan on', 'ބަންގި އޮންކުރޭ')}</button>
      <button class="btn" onClick=${() => { if (test) { stopAzan(); setTest(false); } else playAzan(() => setTest(false)).then((ok) => setTest(ok)); }}>${test ? L('Stop', 'ހުއްޓާ') : L('Hear it now', 'މިހާރު އަޑުއަހާ')}</button></div></section>`;
}
