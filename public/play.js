// Reading goals and streaks, children's games, the week at a glance for parents, and spaced review of the 99 names.
import { html, useState, useEffect } from './vendor/preact-htm.js';
import { getSettings, setSettings, onSettings, isDv, todayKey } from './lib.js';
import { LETTERS } from './arabic.js';
import { NAMES } from './more-data.js';

const L = (en, dv) => (isDv() ? dv : en);
const tools = () => getSettings().tools || {};
const saveTools = (patch) => setSettings({ tools: { ...tools(), ...patch } });
function useS() { const [, f] = useState(0); useEffect(() => onSettings(() => f((n) => n + 1)), []); return getSettings(); }
const Back = ({ to, label }) => html`<a class="back" href=${to || '#/t'}>‹ ${label || L('Tools', 'ޓޫލްސް')}</a>`;
const dayAdd = (key, n) => new Date(Date.parse(key) + n * 86400000).toISOString().slice(0, 10);
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const Stars = ({ n }) => html`<span class="stars" aria-label=${n + ' / 3'}>${[1, 2, 3].map((i) => html`<i class=${i <= n ? 'on' : ''}>★</i>`)}</span>`;

// ---------- reading goal and streak ----------
export function streakOf(log, goal, today = todayKey()) {
  let n = 0, d = (log[today] || 0) >= goal ? today : dayAdd(today, -1);
  while ((log[d] || 0) >= goal) { n++; d = dayAdd(d, -1); }
  return n;
}
const DV_DOW = ['އާ', 'ހޯ', 'އަ', 'ބު', 'ބުރ', 'ހު', 'ހޮ'], EN_DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
export function ProgressPage() {
  const s = useS();
  const log = s.log || {}, goal = tools().goal || 10, today = todayKey(), done = log[today] || 0;
  const streak = streakOf(log, goal, today);
  const best = Math.max(streak, tools().bestStreak || 0);
  useEffect(() => { if (streak > (tools().bestStreak || 0)) saveTools({ bestStreak: streak }); }, [streak]);
  // 12 weeks ending this week, one column a week, Sunday at the top
  const dow = new Date(Date.parse(today)).getUTCDay();
  const start = dayAdd(today, -(11 * 7 + dow));
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => dayAdd(start, w * 7 + d)));
  const level = (k) => { const v = log[k] || 0; return k > today ? 'x' : !v ? 0 : v < goal ? 1 : v < goal * 2 ? 2 : 3; };
  const week = Array.from({ length: 7 }, (_, k) => dayAdd(today, -k));
  const prayed = week.reduce((n, k) => n + ((s.prayed || {})[k] || []).filter(Boolean).length, 0);
  const daysRead = Object.keys(log).filter((k) => log[k] > 0).length;
  return html`<div class="page tool"><${Back} /><h1>${L('My reading', 'އަހަރެންގެ ކިޔެވުން')}</h1>
    <div class="panel streak"><span class="streak-n num">${streak}</span>
      <span><strong>${streak === 1 ? L('day in a row', 'ދުވަސް ވިދިވިދިގެން') : L('days in a row', 'ދުވަސް ވިދިވިދިގެން')}</strong><span class="muted">${L(`Longest so far: ${best}`, `މިހާތަނަށް އެންމެ ދިގު: ${best}`)}</span></span></div>
    <div class="panel"><div class="rline"><span>${L('Today', 'މިއަދު')}</span><strong class="num">${done} / ${goal} ${L('ayahs', 'އާޔަތް')}</strong></div><span class="bar"><i style=${{ width: Math.min(100, (done / goal) * 100) + '%' }}></i></span>
      ${done >= goal ? html`<p class="okline">${L('Goal reached today. May Allah accept it.', 'މިއަދުގެ ލަނޑުދަނޑި ޙާޞިލުވެއްޖެ. ﷲ ޤަބޫލުކުރައްވާށި.')}</p>` : html`<a class="btn primary wide" href=${s.last ? `#/quran/${s.last.s}/${s.last.a}` : '#/quran'}>${L('Continue reading', 'ކިޔެވުން ކުރިއަށް ގެންދޭ')}</a>`}</div>
    <h2>${L('My goal each day', 'ކޮންމެ ދުވަހެއްގެ ލަނޑުދަނޑި')}</h2>
    <div class="seg">${[5, 10, 20, 50].map((g) => html`<button class=${goal === g ? 'on' : ''} onClick=${() => saveTools({ goal: g })}>${g} ${L('ayahs', 'އާޔަތް')}</button>`)}</div>
    <h2>${L('The last 12 weeks', 'ފާއިތުވި 12 ހަފްތާ')}</h2>
    <div class="panel heat-wrap"><div class="heat" role="img" aria-label=${L(`${daysRead} days with reading`, `${daysRead} ދުވަހު ކިޔެވި`)}>
      <div class="heat-col heat-dow">${(isDv() ? DV_DOW : EN_DOW).map((x) => html`<span>${x}</span>`)}</div>
      ${weeks.map((w) => html`<div class="heat-col">${w.map((k) => html`<i class=${'h' + level(k) + (k === today ? ' now' : '')} title=${k}></i>`)}</div>`)}</div>
      <p class="heat-key muted"><span><i class="h0"></i>${L('none', 'ނެތް')}</span><span><i class="h1"></i>${L('some', 'ކުޑަކޮށް')}</span><span><i class="h2"></i>${L('goal met', 'ލަނޑުދަނޑި')}</span><span><i class="h3"></i>${L('double', 'ދެގުނަ')}</span></p></div>
    <div class="tool-two"><div class="panel"><span class="muted">${L('Prayers ticked, last 7 days', 'ފާއިތުވި 7 ދުވަހު ފާހަގަކުރި ނަމާދު')}</span><strong class="big num">${prayed} / 35</strong></div>
      <div class="panel"><span class="muted">${L('Mushaf pages read', 'ކިޔެވި މުޞްޙަފު ޞަފްޙާ')}</span><strong class="big num">${(s.pagesRead || []).length} / 604</strong></div></div>
    <p class="muted small">${L('An ayah counts once you have stayed on it for a moment in the reader. A page turned in the mushaf counts as 10 ayahs. This is kept on your phone only.', 'ކިޔާ ބައިގައި އާޔަތެއްގައި ކުޑަ އިރުކޮޅަކު މަޑުކުރުމުން އެ އާޔަތެއް ގުނޭނެއެވެ. މުޞްޙަފުގެ ޞަފްޙާއެއް ގުނޭނީ 10 އާޔަތުގެ ގޮތުގައެވެ. މި މަޢުލޫމާތު ރައްކާވަނީ ހަމައެކަނި ތިބާގެ ފޯނުގައެވެ.')}</p>
  </div>`;
}

// ---------- children's games ----------
const ORDER = {
  wudu: ['Put wudu in order', 'ވުޟޫ ތަރުތީބުކުރޭ', [
    ['Say Bismillah', 'ބިސްމި ކިޔުން'], ['Wash the hands', 'ދެއަތްތިލަ ދޮވުން'], ['Rinse the mouth and nose', 'އަނގަޔާއި ނޭފަތަށް ފެންލުން'], ['Wash the face', 'މޫނު ދޮވުން'],
    ['Wash the arms to the elbows', 'އުޅަނބޮށްޓާ ހަމައަށް ދެއަތް ދޮވުން'], ['Wipe the head', 'ބޮލުގައި ފެންފުހުން'], ['Wash the feet', 'ދެފައި ދޮވުން']]],
  salah: ['Put the prayer in order', 'ނަމާދު ތަރުތީބުކުރޭ', [
    ['Say Allahu akbar and raise the hands', 'ދެއަތް އުފުލައި ﷲ އަކްބަރު ކިޔުން'], ['Stand and read al-Fatihah', 'ކޮޅަށް ހުރެ ފާތިޙާ ކިޔެވުން'], ['Bow down in ruku', 'ރުކޫޢަށް ދިއުން'], ['Stand up straight', 'ސީދާ ކޮޅަށް ތެދުވުން'],
    ['Go down in sujud', 'ސަޖިދައަށް ދިއުން'], ['Sit for a moment', 'ކުޑަ އިރުކޮޅަކު އިށީނުން'], ['Sujud again', 'އަނެއްކާ ސަޖިދަކުރުން'], ['Sit and say the tashahhud', 'އިށީނދެ އައްތަޙިއްޔާތު ކިޔުން'], ['Say salam to the right and left', 'ކަނާތާއި ވާތަށް ސަލާމްގޮވުން']]],
};
ORDER.pillars = ['The five pillars in order', 'ފަސް ރުކުން ތަރުތީބުކުރޭ', [
  ['The shahada: saying there is no god but Allah and Muhammad is His Messenger', 'ޝަހާދަތް ކިޔުން'], ['Praying five times a day', 'ދުވާލަކު ފަސް ނަމާދު ކުރުން'], ['Giving zakat', 'ޒަކާތް ދިނުން'], ['Fasting in Ramadan', 'ރަމަޟާން މަހު ރޯދަހިފުން'], ['Going on Hajj', 'ޙައްޖަށް ދިއުން']]];
ORDER.day = ['The five prayers through the day', 'ދުވަހުގެ ފަސް ނަމާދު ތަރުތީބުކުރޭ', [
  ['Fajr, before the sun comes up', 'ފަތިސް، އިރު އެރުމުގެ ކުރިން'], ['Dhuhr, in the middle of the day', 'މެންދުރު، ދުވާލުގެ މެދުތެރޭ'], ['Asr, in the afternoon', 'ޢަޞްރު، ހަވީރު'], ['Maghrib, when the sun has set', 'މަޣްރިބު، އިރު އޮއްސުމުން'], ['Isha, at night', 'ޢިޝާ، ރޭގަނޑު']]];
const starsFor = (miss) => (miss === 0 ? 3 : miss <= 2 ? 2 : 1);
const saveBest = (id, n) => { const g = tools().games || {}; if ((g[id] || 0) < n) saveTools({ games: { ...g, [id]: n } }); };
function OrderGame({ id }) {
  const [title, titleDv, steps] = ORDER[id];
  const [deck, setDeck] = useState(() => shuffle(steps.map((_, i) => i)));
  const [at, setAt] = useState(0);
  const [miss, setMiss] = useState(0);
  const [bad, setBad] = useState(-1);
  const done = at === steps.length;
  const tap = (i) => {
    if (i === at) { setAt(at + 1); setBad(-1); if (at + 1 === steps.length) saveBest(id, starsFor(miss)); }
    else { setMiss(miss + 1); setBad(i); setTimeout(() => setBad(-1), 450); }
  };
  const again = () => { setDeck(shuffle(steps.map((_, i) => i))); setAt(0); setMiss(0); };
  return html`<h1>${L(title, titleDv)}</h1>
    <p class="lede">${L('Tap what comes first, then what comes next.', 'އެންމެ ފުރަތަމަ އަންނަ ކަމުގައި ފިއްތާ. ދެން އޭގެ ފަހުން އަންނަ ކަމުގައި.')}</p>
    ${at > 0 && html`<ol class="og-done panel">${steps.slice(0, at).map(([en, dv]) => html`<li>${L(en, dv)}</li>`)}</ol>`}
    ${done ? html`<div class="panel win"><${Stars} n=${starsFor(miss)} /><strong>${L('Well done!', 'ޝާބާސް!')}</strong><button class="btn primary wide" onClick=${again}>${L('Play again', 'އަނެއްކާ ކުޅޭ')}</button></div>`
      : html`<div class="og-deck">${deck.filter((i) => i >= at).map((i) => html`<button key=${i} class=${'og-card' + (bad === i ? ' bad' : '')} onClick=${() => tap(i)}>${L(steps[i][0], steps[i][1])}</button>`)}</div>`}`;
}
const RAKAH = [['Fajr', 'ފަތިސް', 2], ['Dhuhr', 'މެންދުރު', 4], ['Asr', 'ޢަޞްރު', 4], ['Maghrib', 'މަޣްރިބު', 3], ['Isha', 'ޢިޝާ', 4]];
// [what is shown (en, dv), the right answer (en, dv)]. Wrong answers are drawn from the other rows.
const QA = {
  say: [['What do we say?', 'ކިޔަނީ ކީކޭ؟'], [
    ['Before eating', 'ކެއުމުގެ ކުރިން', 'Bismillah', 'ބިސްމިﷲ'], ['After eating', 'ކައި ނިމުމުން', 'Alhamdulillah', 'އަލްޙަމްދުލިﷲ'], ['When we meet someone', 'މީހަކާ ބައްދަލުވުމުން', 'Assalamu alaykum', 'އައްސަލާމު ޢަލައިކުމް'],
    ['When we plan to do something', 'ކަމެއް ކުރަން ރާވާއިރު', 'In sha Allah', 'އިން ޝާﷲ'], ['When we see something beautiful', 'ރީތި އެއްޗެއް ފެނުމުން', 'Ma sha Allah', 'މާ ޝާﷲ'], ['When someone helps us', 'މީހަކު އެހީވުމުން', 'Jazakallahu khayran', 'ޖަޒާކަﷲ ޚައިރަން'],
    ['When we do something wrong', 'ކުށެއް ކުރެވުމުން', 'Astaghfirullah', 'އަސްތަޣްފިރުﷲ'], ['When we hear sad news', 'ހިތާމަވެރި ޚަބަރެއް އިވުމުން', 'Inna lillahi wa inna ilayhi rajiun', 'އިންނާ ލިﷲ ހި ވައިންނާ އިލައިހި ރާޖިޢޫން']]],
  who: [['Which prophet?', 'ކޮން ނަބިއްޔެއް؟'], [
    ['He built a big ship', 'ބޮޑު ނަވެއް ބިނާކުރެއްވި', 'Nuh', 'ނޫޙު'], ['A big fish swallowed him', 'ބޮޑު މަހެއް ދިރުވާލި', 'Yunus', 'ޔޫނުސް'], ['The fire did not burn him', 'އަލިފާނުން އަނދައިނުގަތް', 'Ibrahim', 'އިބްރާހީމް'],
    ['His stick turned into a snake', 'އަސާކޮޅު ހަރުފަޔަކަށް ބަދަލުވި', 'Musa', 'މޫސާ'], ['He understood the ants and the birds', 'ހިންޏާއި ދޫނީގެ ބަސް ދެނެވަޑައިގަތް', 'Sulayman', 'ސުލައިމާން'], ['He dreamed of eleven stars', 'އެގާރަ ތަރި ހުވަފެނުން ފެނުނު', 'Yusuf', 'ޔޫސުފު'],
    ['He was very patient when he was ill', 'ބަލީގައި ވަރަށް ކެތްތެރިވި', 'Ayyub', 'އައްޔޫބު'], ['The first man', 'އެންމެ ފުރަތަމަ އިންސާނާ', 'Adam', 'އާދަމް'], ['The last prophet ﷺ', 'އެންމެ ފަހުގެ ނަބިއްޔާ ﷺ', 'Muhammad', 'މުޙައްމަދު']]],
};
const AR_NUM = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '١٠'];
function makeRound(kind) {
  if (QA[kind]) { const [ask, rows] = QA[kind]; return shuffle(rows).slice(0, 8).map((r) => {
    const opts = shuffle([r, ...shuffle(rows.filter((x) => x[2] !== r[2])).slice(0, 3)]);
    return { show: L(r[0], r[1]), small: true, ask, opts: opts.map((x) => L(x[2], x[3])), right: opts.indexOf(r) };
  }); }
  if (kind === 'numbers') return shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]).slice(0, 8).map((n) => {
    const opts = shuffle([n, ...shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((x) => x !== n)).slice(0, 3)]);
    return { show: AR_NUM[n], ar: true, ask: ['Which number is this?', 'މިއީ ކޮން ޢަދަދެއް؟'], opts: opts.map(String), right: opts.indexOf(n) };
  });
  if (kind === 'letters') return shuffle(LETTERS.map((_, i) => i)).slice(0, 8).map((i) => {
    const opts = shuffle([i, ...shuffle(LETTERS.map((_, j) => j).filter((j) => j !== i)).slice(0, 3)]);
    return { show: LETTERS[i][0], ar: true, ask: ['Which letter is this?', 'މިއީ ކޮން އަކުރެއް؟'], opts: opts.map((j) => LETTERS[j][1]), right: opts.indexOf(i) };
  });
  return shuffle(RAKAH).map(([en, dv, n]) => ({ show: L(en, dv), ask: ['How many rakahs?', 'ކިތައް ރަކުޢަތް؟'], opts: ['2', '3', '4'], right: n - 2 }));
}
function PickGame({ id, title }) {
  const [qs, setQs] = useState(() => makeRound(id));
  const [i, setI] = useState(0);
  const [miss, setMiss] = useState(0);
  const [picked, setPicked] = useState(-1);
  const q = qs[i];
  const pick = (k) => {
    if (picked >= 0) return;
    setPicked(k);
    const wrong = k !== q.right;
    if (wrong) setMiss(miss + 1);
    setTimeout(() => { setPicked(-1); if (i + 1 === qs.length) saveBest(id, starsFor(miss + (wrong ? 1 : 0))); setI(i + 1); }, wrong ? 1100 : 550);
  };
  const again = () => { setQs(makeRound(id)); setI(0); setMiss(0); };
  if (!q) return html`<h1>${title}</h1><div class="panel win"><${Stars} n=${starsFor(miss)} /><strong>${L('Well done!', 'ޝާބާސް!')}</strong><span class="muted">${L(`${qs.length - miss} of ${qs.length} right first time`, `${qs.length} ގެ ތެރެއިން ${qs.length - miss} ރަނގަޅު`)}</span><button class="btn primary wide" onClick=${again}>${L('Play again', 'އަނެއްކާ ކުޅޭ')}</button></div>`;
  return html`<h1>${title}</h1>
    <span class="bar"><i style=${{ width: (i / qs.length) * 100 + '%' }}></i></span>
    <div class="panel pg-q"><span class=${'pg-show' + (q.ar ? ' ar' : '') + (q.small ? ' small' : '')} lang=${q.ar ? 'ar' : null}>${q.show}</span><span class="muted">${L(q.ask[0], q.ask[1])}</span></div>
    <div class=${'pg-opts n' + q.opts.length + (q.small ? ' one' : '')}>${q.opts.map((o, k) => html`<button class=${'og-card' + (picked >= 0 && k === q.right ? ' good' : picked === k ? ' bad' : '')} onClick=${() => pick(k)}>${o}</button>`)}</div>`;
}
// Find the pairs: each Arabic letter and its name.
function newPairs() { const pick = shuffle(LETTERS.map((_, i) => i)).slice(0, 6); return shuffle(pick.flatMap((i) => [{ p: i, t: LETTERS[i][0], ar: true }, { p: i, t: LETTERS[i][1] }])); }
function PairsGame() {
  const [cards, setCards] = useState(newPairs);
  const [open, setOpen] = useState([]);
  const [found, setFound] = useState([]);
  const [miss, setMiss] = useState(0);
  const stars = miss <= 3 ? 3 : miss <= 7 ? 2 : 1;
  const tap = (k) => {
    if (open.length === 2 || open.includes(k) || found.includes(cards[k].p)) return;
    const now = [...open, k];
    setOpen(now);
    if (now.length < 2) return;
    if (cards[now[0]].p === cards[now[1]].p) { const f = [...found, cards[k].p]; setTimeout(() => { setFound(f); setOpen([]); if (f.length === 6) saveBest('pairs', stars); }, 450); }
    else { setMiss(miss + 1); setTimeout(() => setOpen([]), 900); }
  };
  const again = () => { setCards(newPairs()); setOpen([]); setFound([]); setMiss(0); };
  return html`<h1>${L('Find the pairs', 'ޖޯޑު ހޯދާ')}</h1>
    <p class="lede">${L('Turn over two cards. Match each letter with its name.', 'ދެ ކާޑު ހުޅުވާ. ކޮންމެ އަކުރެއް އޭގެ ނަމާ ގުޅުވާ.')}</p>
    ${found.length === 6 ? html`<div class="panel win"><${Stars} n=${stars} /><strong>${L('Well done!', 'ޝާބާސް!')}</strong><button class="btn primary wide" onClick=${again}>${L('Play again', 'އަނެއްކާ ކުޅޭ')}</button></div>`
      : html`<div class="mem">${cards.map((c, k) => { const up = open.includes(k) || found.includes(c.p); return html`<button class=${'mem-card' + (up ? ' up' : '') + (found.includes(c.p) ? ' got' : '')} onClick=${() => tap(k)} aria-label=${up ? c.t : L('Hidden card', 'ފޮރުވިފައިވާ ކާޑު')}>${up ? html`<span class=${c.ar ? 'ar' : ''}>${c.t}</span>` : html`<i></i>`}</button>`; })}</div>`}`;
}
const GAMES = [['wudu', 'Put wudu in order', 'ވުޟޫ ތަރުތީބުކުރޭ'], ['salah', 'Put the prayer in order', 'ނަމާދު ތަރުތީބުކުރޭ'], ['pairs', 'Find the pairs', 'ޖޯޑު ހޯދާ'], ['who', 'Which prophet?', 'ކޮން ނަބިއްޔެއް؟'],
  ['say', 'What do we say?', 'ކިޔަނީ ކީކޭ؟'], ['letters', 'Name the letter', 'އަކުރުގެ ނަން ބުނޭ'], ['numbers', 'Arabic numbers', 'ޢަރަބި ޢަދަދު'], ['rakahs', 'How many rakahs?', 'ކިތައް ރަކުޢަތް؟'],
  ['pillars', 'The five pillars in order', 'ފަސް ރުކުން ތަރުތީބުކުރޭ'], ['day', 'The five prayers through the day', 'ދުވަހުގެ ފަސް ނަމާދު']];
export function GamesPage({ game }) {
  useS();
  const g = GAMES.find((x) => x[0] === game);
  if (g) return html`<div class="page tool games"><${Back} to="#/t/games" label=${L('Games', 'ކުޅިވަރު')} />
    ${game === 'pairs' ? html`<${PairsGame} />` : ORDER[game] ? html`<${OrderGame} key=${game} id=${game} />` : html`<${PickGame} key=${game} id=${game} title=${L(g[1], g[2])} />`}</div>`;
  const best = tools().games || {};
  return html`<div class="page tool games"><${Back} /><h1>${L('Games for children', 'ކުދިންގެ ކުޅިވަރު')}</h1>
    <p class="lede">${L('Ten short games. Three stars for no mistakes.', 'ދިހަ ކުރު ކުޅިވަރު. އެއްވެސް ކުށެއް ނެތިއްޔާ ތިން ތަރި.')}</p>
    <div class="game-grid">${GAMES.map(([id, en, dv]) => html`<a class="game-tile" href=${'#/t/games/' + id}><strong>${L(en, dv)}</strong><${Stars} n=${best[id] || 0} /></a>`)}</div>
    <a class="btn wide" href="#/t/kids">${L('My star chart', 'އަހަރެންގެ ތަރި ޗާޓު')}</a>
  </div>`;
}

// ---------- for parents: the child's week ----------
export function ParentWeek() {
  const s = useS();
  const st = tools().stars || {}, today = todayKey(), best = tools().games || {};
  const days = Array.from({ length: 7 }, (_, k) => dayAdd(today, k - 6));
  const top = Math.max(1, ...days.map((d) => (st[d] || []).length));
  const names = isDv() ? DV_DOW : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return html`<details class="panel parent"><summary>${L('For parents: this week', 'ބެލެނިވެރިންނަށް: މި ހަފްތާ')}</summary>
    <div class="pw-bars">${days.map((d) => { const n = (st[d] || []).length; return html`<span class="pw-day"><span class="pw-n num">${n}</span><i style=${{ height: 6 + (n / top) * 54 + 'px' }} class=${n ? 'on' : ''}></i><span class="muted">${names[new Date(Date.parse(d)).getUTCDay()]}</span></span>`; })}</div>
    <p class="muted small">${L('Stars the child tapped on the chart each day.', 'ކޮންމެ ދުވަހަކު ކުއްޖާ ޗާޓުގައި ފާހަގަކުރި ތަރިތައް.')}</p>
    <div class="pw-games">${GAMES.map(([id, en, dv]) => html`<div class="rline"><span>${L(en, dv)}</span><${Stars} n=${best[id] || 0} /></div>`)}</div>
    <p class="muted small">${L('All of this is kept on this phone only. Nothing is sent anywhere.', 'މި ހުރިހާ މަޢުލޫމާތެއް ރައްކާވަނީ ހަމައެކަނި މި ފޯނުގައެވެ.')}</p>
  </details>`;
}

// ---------- spaced review of the 99 names ----------
// Each name has a box 0 to 5. Known moves it up and it comes back after a longer gap; not known sends it back to tomorrow.
const GAPS = [1, 2, 4, 8, 16, 30];
const dayNo = () => Math.floor((Date.now() + 5 * 3600000) / 86400000);
export function dueNames() {
  const srs = tools().srs || {}, d = dayNo();
  const due = Object.keys(srs).map(Number).filter((i) => srs[i][1] <= d);
  const fresh = NAMES.map((_, i) => i).filter((i) => !srs[i]).slice(0, Math.max(0, 5 - due.length));
  return [...due, ...fresh].slice(0, 10);
}
export function NamesReview({ onDone }) {
  const [list] = useState(dueNames);
  const [i, setI] = useState(0);
  const [open, setOpen] = useState(false);
  if (i >= list.length) return html`<div class="panel win"><strong>${L('That is all for today.', 'މިއަދަށް ނިމުނީ.')}</strong><span class="muted">${L('The ones you knew will come back after a longer gap.', 'އެނގުނު އިސްމުފުޅުތައް އަނެއްކާ ގެންނާނީ މާ ދުވަސްކޮޅެއް ފަހުންނެވެ.')}</span><button class="btn primary wide" onClick=${onDone}>${L('Back to the list', 'ލިސްޓަށް އެނބުރި ދޭ')}</button></div>`;
  const n = list[i], [ar, tr, en, dv] = NAMES[n];
  const mark = (knew) => {
    const srs = { ...(tools().srs || {}) }, box = knew ? Math.min(5, (srs[n] ? srs[n][0] : -1) + 1) : 0;
    srs[n] = [box, dayNo() + (knew ? GAPS[box] : 1)];
    const known = tools().names || [];
    saveTools({ srs, names: box >= 2 && !known.includes(n) ? [...known, n] : known });
    setOpen(false); setI(i + 1);
  };
  return html`<div class="panel review"><span class="muted num">${i + 1} / ${list.length}</span>
    <span class="rv-ar" lang="ar" dir="rtl">${ar}</span><strong>${tr}</strong>
    ${open ? html`<span class=${'rv-mean' + (isDv() ? ' dv' : '')}>${L(en, dv)}</span>
      <div class="seg two"><button onClick=${() => mark(false)}>${L('Not yet', 'އަދި ނޭނގޭ')}</button><button class="on" onClick=${() => mark(true)}>${L('I knew it', 'އެނގުނު')}</button></div>`
      : html`<button class="btn primary wide" onClick=${() => setOpen(true)}>${L('Show the meaning', 'މާނަ ދައްކާ')}</button>`}
  </div>`;
}
