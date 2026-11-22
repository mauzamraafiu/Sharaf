// The 99 names, the seerah timeline, the tasbih, three checklists, saved items with notes,
// searching inside the Quran, and sharing a dua or ayah as a picture.
// Everything a person saves stays in their own settings (keys "saved", "notes", and "tools").
import { html, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { getSettings, setSettings, onSettings, isDv, getJSON } from './lib.js';
import { NAMES, SEERAH, UMRAH, HAJJ, JANAZAH, PATH, TASBIH } from './more-data.js';

const L = (en, dv) => (isDv() ? dv : en);
const tools = () => getSettings().tools || {};
const saveTools = (patch) => setSettings({ tools: { ...tools(), ...patch } });
function useS() { const [, f] = useState(0); useEffect(() => onSettings(() => f((n) => n + 1)), []); return getSettings(); }
const P = {
  check: 'M5 12.5l4.5 4.5L19 7.5', share: 'M12 15V4M8 8l4-4 4 4M5 13v6h14v-6', mark: 'M7 4h10v16l-5-4-5 4z', note: 'M5 5h14v10l-4 4H5zM15 19v-4h4M8 9h8M8 12h5',
  close: 'M6 6l12 12M18 6 6 18', next: 'M9 5l7 7-7 7', undo: 'M8 8H4V4M4 8a8 8 0 1 1-1 6',
};
const I = ({ n, fill }) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill=${fill || 'none'} stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d=${P[n]} /></svg>`;
const Back = () => html`<a class="back" href="#/t">‹ ${L('Tools', 'ޓޫލްސް')}</a>`;

// ---------- share as a picture ----------
function wrap(ctx, text, max) {
  const out = []; let line = '';
  for (const w of String(text).split(/\s+/)) {
    const t = line ? line + ' ' + w : w;
    if (line && ctx.measureText(t).width > max) { out.push(line); line = w; } else line = t;
  }
  if (line) out.push(line);
  return out;
}
const THAANA = /[ހ-޿]/;
// Draws the card at a given Arabic size and returns how tall it came out, so the caller can shrink it to fit.
function drawCard(cv, c, ar) {
  const W = 1080, pad = 96, inner = W - pad * 2, ctx = cv.getContext('2d');
  const trSize = Math.round(ar * 0.56), dv = THAANA.test(c.text || '');
  const blocks = [];
  if (c.title) { ctx.font = `600 34px Figtree, Faruma, sans-serif`; blocks.push({ lines: wrap(ctx, c.title, inner), font: ctx.font, lh: 46, color: '#1F6F5C', rtl: THAANA.test(c.title), gap: 40 }); }
  if (c.ar) { ctx.font = `${ar}px "Amiri Quran", serif`; ctx.direction = 'rtl'; blocks.push({ lines: wrap(ctx, c.ar, inner), font: ctx.font, lh: ar * 1.95, color: '#1D1A12', rtl: true, gap: 44 }); }
  if (c.text) { ctx.font = `${trSize}px ${dv ? 'Faruma, "Noto Sans Thaana"' : 'Literata, Georgia'}, serif`; ctx.direction = dv ? 'rtl' : 'ltr'; blocks.push({ lines: wrap(ctx, c.text, inner), font: ctx.font, lh: trSize * (dv ? 1.9 : 1.5), color: '#3A3A30', rtl: dv, gap: 40 }); }
  if (c.ref) blocks.push({ lines: [c.ref], font: `500 30px Figtree, sans-serif`, lh: 40, color: '#6B6753', rtl: false, gap: 0 });
  const body = blocks.reduce((h, b) => h + b.lines.length * b.lh + b.gap, 0);
  const H = Math.max(1080, Math.round(body + 380));
  if (cv.height !== H || cv.width !== W) { cv.width = W; cv.height = H; }
  ctx.fillStyle = '#FBF5E4'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#1F6F5C'; ctx.lineWidth = 6; ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.strokeStyle = '#D2A63A'; ctx.lineWidth = 2; ctx.strokeRect(52, 52, W - 104, H - 104);
  const star = (x, y, r) => { ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#D2A63A'; ctx.strokeStyle = '#1F6F5C'; ctx.lineWidth = 3; for (const a of [0, Math.PI / 4]) { ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.rect(-r, -r, r * 2, r * 2); ctx.fill(); ctx.stroke(); ctx.restore(); } ctx.beginPath(); ctx.arc(0, 0, r * 0.5, 0, 7); ctx.fillStyle = '#FBF5E4'; ctx.fill(); ctx.stroke(); ctx.restore(); };
  star(W / 2, 44, 22); star(W / 2, H - 44, 22);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  let y = (H - 150 - body) / 2 + 70;
  for (const b of blocks) {
    ctx.font = b.font; ctx.fillStyle = b.color; ctx.direction = b.rtl ? 'rtl' : 'ltr';
    for (const ln of b.lines) { ctx.fillText(ln, W / 2, y + b.lh / 2); y += b.lh; }
    y += b.gap;
  }
  ctx.direction = 'ltr'; ctx.font = '600 32px Literata, Georgia, serif'; ctx.fillStyle = '#1F6F5C';
  ctx.fillText('Sharaf', W / 2, H - 112);
  return H;
}
export async function shareCard(c) {
  try { await Promise.all([document.fonts.load('60px "Amiri Quran"', c.ar || 'ا'), document.fonts.load('30px Literata'), document.fonts.load('30px Faruma', 'ހ'), document.fonts.load('600 30px Figtree')]); } catch {}
  const cv = document.createElement('canvas');
  let text = c.text || '';
  if (text.length > 900) text = text.slice(0, 880).replace(/\s+\S*$/, '') + '…';
  const card = { ...c, text };
  for (const size of [64, 56, 48, 42, 36, 30]) if (drawCard(cv, card, size) <= 1920) break;
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  const file = new File([blob], 'sharaf.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return 'shared'; } catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'sharaf.png'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return 'saved';
}
export function ShareBtn({ card, label }) {
  const [busy, setBusy] = useState(false);
  const go = async () => { if (busy) return; setBusy(true); try { await shareCard(typeof card === 'function' ? card() : card); } finally { setBusy(false); } };
  const text = L('Share as a picture', 'ފޮޓޯއެއްގެ ގޮތުގައި ހިއްސާކުރޭ');
  return html`<button class=${label ? 'btn' : 'act'} disabled=${busy} onClick=${go} aria-label=${text} title=${text}><${I} n="share" />${label ? html` ${L('Share', 'ހިއްސާ')}` : null}</button>`;
}

// ---------- saved items and notes ----------
const savedList = () => getSettings().saved || [];
export const isSaved = (k) => savedList().some((x) => x.k === k);
export function toggleSaved(k, title_en, title_dv) {
  setSettings({ saved: isSaved(k) ? savedList().filter((x) => x.k !== k) : [{ k, title_en, title_dv, at: Date.now() }, ...savedList()] });
}
export const noteFor = (k) => (getSettings().notes || {})[k] || '';
export function setNote(k, text) {
  const notes = { ...(getSettings().notes || {}) };
  if (text.trim()) notes[k] = text.trim().slice(0, 2000); else delete notes[k];
  setSettings({ notes });
}
export function SaveBtn({ item }) {
  useS();
  const k = 'i:' + item.id, on = isSaved(k);
  const text = on ? L('Saved. Tap to remove', 'ރައްކާކުރެވިފައި. ނެގުމަށް ފިއްތާ') : L('Save', 'ރައްކާކުރޭ');
  return html`<button class="act" aria-pressed=${on} aria-label=${text} title=${text} onClick=${() => toggleSaved(k, item.title_en, item.title_dv)}><${I} n="mark" fill=${on ? 'currentColor' : 'none'} /></button>`;
}
export function NoteBox({ k, open, onClose }) {
  const [v, setV] = useState(noteFor(k));
  useEffect(() => setV(noteFor(k)), [k]);
  if (!open) return null;
  return html`<div class="notebox">
    <textarea class="field" rows="3" value=${v} placeholder=${L('Write a note for yourself', 'އަމިއްލައަށް ނޯޓެއް ލިޔޭ')} onInput=${(e) => setV(e.target.value)}></textarea>
    <div class="toolbar"><button class="btn primary" onClick=${() => { setNote(k, v); onClose && onClose(); }}>${L('Save note', 'ނޯޓު ރައްކާކުރޭ')}</button>
      ${noteFor(k) && html`<button class="btn danger" onClick=${() => { setNote(k, ''); setV(''); onClose && onClose(); }}>${L('Delete note', 'ނޯޓު ފޮހެލާ')}</button>`}</div>
  </div>`;
}
function SavedRow({ k, href, title, onRemove }) {
  const [open, setOpen] = useState(false);
  const note = noteFor(k);
  return html`<li class="saved-row">
    <a href=${href}><strong>${title}</strong>${note && !open && html`<span class="saved-note">${note}</span>`}</a>
    <span class="acts"><button class="act" aria-pressed=${!!note} aria-label=${L('Note', 'ނޯޓު')} onClick=${() => setOpen(!open)}><${I} n="note" /></button>
      <button class="act" aria-label=${L('Remove', 'ނަގާ')} onClick=${onRemove}><${I} n="close" /></button></span>
    <${NoteBox} k=${k} open=${open} onClose=${() => setOpen(false)} />
  </li>`;
}
export function SavedPage() {
  const s = useS();
  const marks = s.marks || [], saved = s.saved || [];
  const loose = Object.keys(s.notes || {}).filter((k) => k.startsWith('q:') && !marks.some((m) => `q:${m.s}:${m.a}` === k));
  const empty = !marks.length && !saved.length && !loose.length;
  return html`<div class="page tool"><${Back} /><h1>${L('Saved', 'ރައްކާކުރި ތަކެތި')}</h1>
    ${empty && html`<div class="panel"><p>${L('Nothing saved yet. Tap the bookmark on any dua or ayah and it will be kept here, with room for your own note.', 'އަދި އެއްވެސް އެއްޗެއް ރައްކާކޮށްފައެއް ނެތެވެ. ދުޢާއެއް ނުވަތަ އާޔަތެއްގެ ބުކްމާކުގައި ފިއްތާލުމުން މިތަނުގައި ރައްކާވާނެއެވެ. އަމިއްލަ ނޯޓެއްވެސް ލިޔެވޭނެއެވެ.')}</p><a class="btn primary wide" href="#/duas">${L('Open the duas', 'ދުޢާތައް ހުޅުވާ')}</a></div>`}
    ${(marks.length > 0 || loose.length > 0) && html`<h2>${L('Ayahs', 'އާޔަތްތައް')}</h2><ul class="saved panel">
      ${marks.map((m) => html`<${SavedRow} k=${`q:${m.s}:${m.a}`} href=${`#/quran/${m.s}/${m.a}`} title=${`${m.name} ${m.s}:${m.a}`} onRemove=${() => setSettings({ marks: marks.filter((x) => x !== m) })} />`)}
      ${loose.map((k) => { const [, sn, an] = k.split(':'); return html`<${SavedRow} k=${k} href=${`#/quran/${sn}/${an}`} title=${`${L('Quran', 'ޤުރުއާން')} ${sn}:${an}`} onRemove=${() => setNote(k, '')} />`; })}
    </ul>`}
    ${saved.length > 0 && html`<h2>${L('Duas and reading', 'ދުޢާއާއި ކިޔުންތައް')}</h2><ul class="saved panel">
      ${saved.map((x) => html`<${SavedRow} k=${x.k} href=${'#/i/' + x.k.slice(2)} title=${isDv() && x.title_dv ? x.title_dv : x.title_en} onRemove=${() => toggleSaved(x.k)} />`)}
    </ul>`}
  </div>`;
}

// ---------- search inside the Quran ----------
const AR = /[؀-ۿ]/;
const plainAr = (s) => s.normalize('NFD').replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه');
export function QuranFind({ q, names }) {
  const text = q.trim();
  const lang = THAANA.test(text) ? 'dv' : AR.test(text) ? 'ar' : 'en';
  const [res, setRes] = useState(null);
  const [failed, setFailed] = useState(false);
  const [all, setAll] = useState(false);
  useEffect(() => {
    setRes(null); setFailed(false); setAll(false);
    if (text.length < (lang === 'en' ? 3 : 2)) return;
    let on = true;
    const id = setTimeout(() => getJSON(`/quran/find-${lang}.json`).then((all) => {
      if (!on) return;
      const needle = lang === 'ar' ? plainAr(text) : text.toLowerCase();
      const hits = []; let total = 0;
      for (let s = 0; s < all.length; s++) for (let a = 0; a < all[s].length; a++) {
        const hay = lang === 'en' ? all[s][a].toLowerCase() : all[s][a], at = hay.indexOf(needle);
        if (at < 0) continue;
        total++;
        if (hits.length < 40) hits.push([s + 1, a + 1, all[s][a], at]);
      }
      setRes({ hits, total });
    }, () => on && setFailed(true)), 300);
    return () => { on = false; clearTimeout(id); };
  }, [text]);
  if (failed) return html`<p class="muted small">${L('Searching inside the Quran needs a connection the first time.', 'ޤުރުއާނުގެ ތެރެއިން ހޯދުމަށް ފުރަތަމަ ފަހަރު އިންޓަނެޓް ބޭނުންވެއެވެ.')}</p>`;
  if (!res || !res.total) return null;
  const cut = (str, at) => { const a = Math.max(0, at - 60), b = Math.min(str.length, at + text.length + 90); return [(a ? '…' : '') + str.slice(a, at), str.slice(at, at + text.length), str.slice(at + text.length, b) + (b < str.length ? '…' : '')]; };
  return html`<section class="qfind">
    <h2>${L('In the Quran', 'ޤުރުއާނުގައި')} <span class="muted num">${res.total}</span></h2>
    <ul class="seclist">${res.hits.slice(0, all ? 40 : 4).map(([s, a, str, at]) => { const [x, y, z] = cut(str, at); return html`<li><a href=${`#/quran/${s}/${a}`}>
      <strong>${names && names[s - 1] ? names[s - 1].name : L('Surah', 'ސޫރަތް') + ' ' + s} <span class="num">${s}:${a}</span></strong>
      <span class=${'qfind-t ' + (lang === 'dv' ? 'dv' : lang === 'ar' ? 'ar' : '')} lang=${lang} dir=${lang === 'en' ? 'ltr' : 'rtl'}>${x}<mark>${y}</mark>${z}</span></a></li>`; })}</ul>
    ${!all && res.hits.length > 4 && html`<button class="btn wide" onClick=${() => setAll(true)}>${L(`Show all ${res.total} ayahs`, `${res.total} އާޔަތް އެއްކޮށް ދައްކާ`)}</button>`}
    ${all && res.total > res.hits.length && html`<p class="muted small">${L(`Showing the first ${res.hits.length} of ${res.total}. Add another word to narrow it.`, `${res.total} ގެ ތެރެއިން ފުރަތަމަ ${res.hits.length}. ހަނިކުރުމަށް އިތުރު ބަހެއް ލިޔޭ.`)}</p>`}
  </section>`;
}

// ---------- the 99 names ----------
export function NamesPage() {
  const s = useS();
  const known = tools().names || [];
  const [open, setOpen] = useState(-1);
  const [only, setOnly] = useState(false);
  const day = Math.floor((Date.now() + 5 * 3600000) / 86400000);
  const todays = [0, 1, 2].map((i) => (day * 3 + i) % 99);
  const flip = (i) => saveTools({ names: known.includes(i) ? known.filter((x) => x !== i) : [...known, i] });
  const Row = (i, big) => { const [ar, tr, en, dv] = NAMES[i], on = known.includes(i); return html`<li class=${'nm' + (big ? ' big' : '') + (on ? ' known' : '') + (open === i ? ' open' : '')}>
    <button class="nm-main" onClick=${() => setOpen(open === i ? -1 : i)} aria-expanded=${open === i}>
      <span class="nm-n num">${i + 1}</span><span class="nm-ar" lang="ar" dir="rtl">${ar}</span>
      <span class="nm-tr">${tr}</span><span class=${'nm-en' + (isDv() ? ' dv' : '')}>${L(en, dv)}</span></button>
    ${(open === i || big) && html`<div class="nm-more"><button class=${'btn' + (on ? ' primary' : '')} onClick=${() => flip(i)}><${I} n="check" /> ${on ? L('I know this one', 'މި އިސްމުފުޅު އެނގޭ') : L('Mark as learnt', 'ދަސްވެއްޖެކަމަށް ފާހަގަކުރޭ')}</button>
      <${ShareBtn} label card=${{ ar, text: `${tr}: ${L(en, dv)}`, ref: L(`Name ${i + 1} of 99`, `99 ގެ ތެރެއިން ${i + 1}`) }} /></div>`}
  </li>`; };
  const list = NAMES.map((_, i) => i).filter((i) => !only || !known.includes(i));
  return html`<div class="page tool names"><${Back} />
    <h1>${L('The 99 names of Allah', 'ﷲ ގެ 99 އިސްމުފުޅު')}</h1>
    <p class="lede">${L('"To Allah belong the most beautiful names, so call on Him by them." (7:180)', '"އެންމެ ރިވެތި އިސްމުފުޅުތައް ވަނީ ﷲ އަށެވެ. ފަހެ އެ އިސްމުފުޅުތަކުން އެކަލާނގެއަށް ދުޢާކުރާށެވެ." (7:180)')}</p>
    <div class="panel"><div class="rline"><span>${L('Learnt', 'ދަސްވި')}</span><strong class="num">${known.length} / 99</strong></div><span class="bar"><i style=${{ width: (known.length / 99) * 100 + '%' }}></i></span></div>
    <h2>${L('Three for today', 'މިއަދަށް ތިން އިސްމުފުޅު')}</h2>
    <ul class="nmlist nm-today">${todays.map((i) => Row(i, true))}</ul>
    <h2 class="nm-all">${L('All the names', 'ހުރިހާ އިސްމުފުޅުތައް')} <button class="chip" aria-pressed=${only} onClick=${() => setOnly(!only)}>${L('Not learnt yet', 'އަދި ދަސްނުވާ')}</button></h2>
    <ul class="nmlist">${list.map((i) => Row(i))}</ul>
    <p class="notice">${L('This is the well-known list, which comes from a narration in Tirmidhi (3507). Many hadith scholars say the list itself was added by a narrator, and Allah has more names than these. The Dhivehi meanings are a draft and have not been reviewed.', 'މިއީ މަޝްހޫރު ލިސްޓެވެ. އެއީ ތިރްމިޛީ (3507) ގައިވާ ރިވާޔަތަކުން އައިސްފައިވާ ލިސްޓެކެވެ. ގިނަ ޙަދީޘް ޢިލްމުވެރިން ވިދާޅުވަނީ ލިސްޓަކީ ރާވީއެއް އިތުރުކުރެއްވި އެއްޗެއް ކަމަށެވެ. ﷲ ގެ އިސްމުފުޅުތައް މިއަށްވުރެ ގިނައެވެ. ދިވެހި މާނަތަކަކީ މުރާޖަޢާނުކުރެވޭ ޑްރާފްޓެކެވެ.')}</p>
  </div>`;
}

// ---------- seerah timeline ----------
export function SeerahPage() {
  useS();
  return html`<div class="page tool"><${Back} />
    <h1>${L('The life of the Prophet ﷺ, year by year', 'ރަސޫލާ ﷺ ގެ ޙަޔާތްޕުޅު، އަހަރުން އަހަރަށް')}</h1>
    <p class="lede">${L('Tap any event to read more. Years before the Hijrah are approximate.', 'އިތުރަށް ކިޔުމަށް ޙާދިޘާއެއްގައި ފިއްތާ. ހިޖުރައިގެ ކުރީގެ އަހަރުތަކަކީ ގާތްގަނޑަކަށް ބުނެވޭ އަހަރުތަކެވެ.')}</p>
    <ol class="tline">${SEERAH.map(([yr, age, en, dv, sen, sdv, href]) => html`<li><a href=${href}>
      <span class="tl-yr num">${yr}</span>
      <span class="tl-body"><strong>${L(en, dv)}</strong><span class="muted">${L(sen, sdv)}</span>${age > 0 && html`<span class="tl-age">${L(`Age ${age}`, `ޢުމުރުފުޅުން ${age}`)}</span>`}</span></a></li>`)}</ol>
    <p class="notice">${L('Dates follow the commonly given ones in the books of seerah; scholars differ on some by a year or so.', 'ތާރީޚުތަކަކީ ސީރަތުގެ ފޮތްތަކުގައި ޢާންމުކޮށް ލިޔެފައިވާ ތާރީޚުތަކެވެ. ބައެއް ތާރީޚުތަކުގައި ޢިލްމުވެރިންގެ މެދުގައި އަހަރެއްހާ ދުވަހުގެ ޚިލާފު ހުރެއެވެ.')}</p>
  </div>`;
}

// ---------- tasbih ----------
let actx;
function click(strong) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    const o = actx.createOscillator(), g = actx.createGain(), t0 = actx.currentTime;
    o.frequency.value = strong ? 660 : 420; o.type = 'sine';
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(strong ? 0.25 : 0.12, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + (strong ? 0.28 : 0.07));
    o.connect(g).connect(actx.destination); o.start(t0); o.stop(t0 + 0.3);
  } catch {}
}
export function TasbihPage() {
  useS();
  const st = { i: 0, c: 0, total: 0, sound: true, ...(tools().tasbih || {}) };
  const [bump, setBump] = useState(0);
  const set = (p) => saveTools({ tasbih: { ...st, ...p } });
  const [ar, tr, en, dv, target] = TASBIH[st.i];
  const done = st.c >= target;
  const tap = () => {
    if (done && st.i < 2) { set({ i: st.i + 1, c: 1, total: st.total + 1 }); feel(false); setBump(bump + 1); return; }
    const c = st.c + 1, hit = c === target;
    set({ c, total: st.total + 1 });
    feel(hit); setBump(bump + 1);
  };
  const feel = (hit) => { if (navigator.vibrate) navigator.vibrate(hit ? [70, 60, 180] : 14); if (st.sound) click(hit); };
  return html`<div class="page tool tasbih"><${Back} /><h1>${L('Tasbih', 'ތަސްބީޙަ')}</h1>
    <div class="chips tsb-pick">${TASBIH.map((x, i) => html`<button class="chip" aria-pressed=${st.i === i} onClick=${() => set({ i, c: 0 })}>${x[1]}</button>`)}</div>
    <p class="ar tsb-ar" lang="ar" dir="rtl">${ar}</p>
    <p class=${'tsb-en' + (isDv() ? ' dv' : '')}>${L(en, dv)}</p>
    <button class=${'tapper tsb-tap' + (done ? ' is-done' : '')} style=${{ '--pct': Math.min(1, st.c / target) }} onClick=${tap} aria-label=${L('Count', 'ގުނާ')}>
      <span class="tap-num num" key=${bump}>${st.c}</span>
      <span class="tap-hint">${done ? (st.i < 2 ? L('Tap for the next', 'ދެން އޮތް ޛިކުރަށް ފިއްތާ') : L('Done', 'ނިމިއްޖެ')) : `${L('of', 'ގެ ތެރެއިން')} ${target}`}</span>
    </button>
    <div class="toolbar tsb-foot">
      <button class="btn" onClick=${() => set({ c: 0 })}><${I} n="undo" /> ${L('Start again', 'އަލުން ފަށާ')}</button>
      <button class="chip" aria-pressed=${st.sound} onClick=${() => set({ sound: !st.sound })}>${L('Click sound', 'ކްލިކް އަޑު')}</button>
    </div>
    <p class="muted small">${L(`Counted in total: ${st.total}. Android phones also give a small tap with each count; iPhones cannot vibrate from a web app, so the click sound stands in for it and stays quiet when the phone is on silent.`, `ޖުމްލަ ގުނި އަދަދު: ${st.total}. އެންޑްރޮއިޑް ފޯނުތަކުގައި ކޮންމެ ފަހަރަކު ކުޑަކޮށް ތެޅިލާނެއެވެ. އައިފޯނުގައި ވެބް އެޕަކުން ވައިބްރޭޓެއް ނުކުރެވޭތީ، އޭގެ ބަދަލުގައި ކްލިކް އަޑެއް އިވޭނެއެވެ. ފޯނު ސައިލެންޓްގައި ހުންނައިރު އަޑެއް ނީވޭނެއެވެ.`)}</p>
  </div>`;
}

// ---------- checklists ----------
function Checklist({ store, groups, links }) {
  useS();
  const done = tools()[store] || [];
  const flip = (id) => saveTools({ [store]: done.includes(id) ? done.filter((x) => x !== id) : [...done, id] });
  const all = groups.flatMap((g) => g[2]).length;
  const n = groups.flatMap((g) => g[2]).filter((r) => done.includes(r[0])).length;
  return html`<div class="panel"><div class="rline"><span>${L('Done', 'ނިމުނު')}</span><strong class="num">${n} / ${all}</strong></div><span class="bar"><i style=${{ width: (n / all) * 100 + '%' }}></i></span></div>
    ${groups.map(([en, dv, rows]) => html`<section class="ck"><h2>${L(en, dv)}</h2><ul class="panel cklist">${rows.map(([id, ren, rdv, href]) => html`<li class=${done.includes(id) ? 'on' : ''}>
      <button class="ckbox" role="checkbox" aria-checked=${done.includes(id)} aria-label=${L(ren, rdv)} onClick=${() => flip(id)}>${done.includes(id) && html`<${I} n="check" />`}</button>
      ${links ? html`<a class=${'ck-t' + (isDv() ? ' dv' : '')} href=${href}>${L(ren, rdv)}</a>` : html`<span class=${'ck-t' + (isDv() ? ' dv' : '')} onClick=${() => flip(id)}>${L(ren, rdv)}</span>`}
      ${href && html`<a class="act" href=${href} aria-label=${L('Read how', 'ގޮތް ކިޔާ')} tabindex=${links ? -1 : 0}><${I} n="next" /></a>`}</li>`)}</ul></section>`)}
    ${n > 0 && html`<button class="btn" onClick=${() => saveTools({ [store]: [] })}><${I} n="undo" /> ${L('Clear all ticks', 'ހުރިހާ ފާހަގައެއް ފޮހެލާ')}</button>`}`;
}
export function HajjPage() {
  useS();
  const tab = tools().hajjTab || 'umrah';
  return html`<div class="page tool"><${Back} /><h1>${L('Hajj and Umrah, step by step', 'ޙައްޖާއި ޢުމްރާ، ފިޔަވަޅުން ފިޔަވަޅަށް')}</h1>
    <p class="lede">${L('Tick each rite as you finish it. This page works without a connection once it has been opened.', 'ކޮންމެ ކަމެއް ނިމުމުން ފާހަގަކުރޭ. އެއްފަހަރު ހުޅުވުމަށްފަހު މި ޞަފްޙާ އިންޓަނެޓް ނެތިވެސް ބޭނުންކުރެވޭނެއެވެ.')}</p>
    <div class="seg two"><button class=${tab === 'umrah' ? 'on' : ''} onClick=${() => saveTools({ hajjTab: 'umrah' })}>${L('Umrah', 'ޢުމްރާ')}</button><button class=${tab === 'hajj' ? 'on' : ''} onClick=${() => saveTools({ hajjTab: 'hajj' })}>${L('Hajj', 'ޙައްޖު')}</button></div>
    ${tab === 'umrah' ? html`<${Checklist} key="u" store="umrahDone" groups=${UMRAH} />` : html`<${Checklist} key="h" store="hajjDone" groups=${HAJJ} />`}
    <p class="notice">${L('The Hajj list follows tamattu: Umrah first, then Hajj. Follow your group leader where the order differs.', 'ޙައްޖުގެ ލިސްޓު އޮތީ ތަމައްތުޢު ޙައްޖުގެ ތަރުތީބުންނެވެ: ފުރަތަމަ ޢުމްރާ، އެއަށްފަހު ޙައްޖު. ތަރުތީބު ތަފާތުވާ ތަންތަނުގައި ގްރޫޕުގެ އިސްވެރިޔާގެ އިރުޝާދަށް ތަބާވާށެވެ.')}</p>
  </div>`;
}
export function JanazahPage() {
  return html`<div class="page tool"><${Back} /><h1>${L('When someone dies', 'މީހަކު މަރުވުމުން')}</h1>
    <p class="lede">${L('What to do, in order. Tap the arrow on any line for the words and the details.', 'ކުރަންވީ ކަންކަން، ތަރުތީބުން. ކިޔާނެ ބަސްތަކާއި ތަފްޞީލު ބެލުމަށް ތީރުގައި ފިއްތާ.')}</p>
    <${Checklist} store="janazahDone" groups=${JANAZAH} />
    <a class="btn primary wide" href="#/s/janazah-steps">${L('The funeral prayer in full', 'ކަށުނަމާދު ފުރިހަމައަށް')}</a>
  </div>`;
}
export function PathPage() {
  return html`<div class="page tool"><${Back} /><h1>${L('New to Islam: the first month', 'އިސްލާމްދީނަށް އަލަށް ވަން މީހުންނަށް: ފުރަތަމަ މަސް')}</h1>
    <p class="lede">${L('One short reading a day. Go at your own pace; nothing here has to be finished in thirty days.', 'ދުވާލަކު ކުރު ކިޔުމެއް. އަމިއްލަ ދުވެލީގައި ކުރިއަށް ދާށެވެ. ތިރީސް ދުވަހުން ނިންމަންޖެހޭނެ ކަމެއް ނެތެވެ.')}</p>
    <${Checklist} store="pathDone" groups=${PATH} links />
  </div>`;
}
