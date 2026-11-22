// Animated guides for the prayer and wudu steps: an illustrated, faceless figure in a thobe and cap.
import { html, useState, useEffect, useRef } from './vendor/preact-htm.js';
import { getSettings, setSettings, isDv } from './lib.js';

// Side view, facing right. Joints: foot, knee, hip, shoulder, head, elbow, hand.
const P = {
  stand: [[100, 142], [101, 110], [100, 78], [101, 42], [103, 25], [102, 62], [104, 84]],
  raise: [[100, 142], [101, 110], [100, 78], [101, 42], [103, 25], [114, 50], [112, 31]],
  fold: [[100, 142], [101, 110], [100, 78], [101, 42], [103, 25], [101, 62], [114, 66]],
  bow: [[100, 142], [101, 110], [96, 78], [134, 74], [151, 77], [127, 92], [105, 106]],
  kneel: [[82, 140], [118, 140], [112, 106], [114, 70], [116, 53], [118, 88], [124, 106]],
  sit: [[82, 140], [120, 140], [92, 120], [98, 84], [100, 67], [106, 104], [117, 118]],
  sujud: [[82, 140], [120, 140], [104, 106], [141, 121], [158, 133], [133, 132], [146, 141]],
  point: [[82, 140], [120, 140], [92, 120], [98, 84], [100, 67], [106, 104], [121, 115]],
  salamR: [[82, 140], [120, 140], [92, 120], [98, 84], [104, 67], [106, 104], [117, 118]],
  dua: [[82, 140], [120, 140], [92, 120], [98, 84], [100, 67], [110, 98], [121, 85]],
  salamL: [[82, 140], [120, 140], [92, 120], [98, 84], [96, 67], [106, 104], [117, 118]],
};
const SALAH = {
  'salah-01-prepare': ['stand'], 'salah-02-takbir': ['stand', 'raise', 'fold'], 'salah-03-opening-dua': ['fold'], 'salah-04-fatiha': ['fold'], 'salah-05-surah': ['fold'],
  'salah-06-ruku': ['fold', 'raise', 'bow'], 'salah-07-itidal': ['bow', 'raise', 'stand'], 'salah-08-sujud': ['stand', 'kneel', 'sujud'], 'salah-09-sitting': ['sujud', 'sit', 'sujud'],
  'salah-10-second-rakah': ['sujud', 'kneel', 'stand', 'fold'], 'salah-11-tashahhud': ['sit', 'point'], 'salah-12-salawat': ['point'], 'salah-13-dua-before-salam': ['point'], 'salah-14-salam': ['sit', 'salamR', 'sit', 'salamL'],
};
const RAKAH = ['fold', 'bow', 'stand', 'kneel', 'sujud', 'sit', 'sujud', 'kneel', 'stand']; // one full rak'ah
Object.assign(SALAH, {
  'janazah-3-niyyah': ['stand', 'raise', 'fold'], 'janazah-4-salawat': ['fold', 'raise', 'fold'], 'janazah-5-dua': ['fold', 'raise', 'fold'], 'janazah-6-salam': ['fold', 'raise', 'fold'],
  'tj-3-wudu-two': RAKAH, 'tj-4-opening': ['stand', 'raise', 'fold'], 'tj-5-pray': RAKAH, 'tj-6-sujud': ['kneel', 'sujud'], 'tj-7-before-salam': ['sit', 'point'], 'tj-8-dua-after': ['sit', 'dua'], 'tj-9-istighfar': ['sit', 'dua'], 'tj-10-witr': RAKAH,
  'pray-tahajjud': RAKAH, 'pray-witr': RAKAH, 'pray-duha': RAKAH, 'pray-rawatib': RAKAH, 'pray-istikhara': RAKAH, 'pray-tarawih': RAKAH, 'pray-eid': ['stand', 'raise', 'fold', 'raise', 'fold'], 'pray-jumuah': RAKAH,
  'pray-tahiyyat-masjid': RAKAH, 'pray-tawbah': RAKAH, 'pray-eclipse': ['fold', 'bow', 'fold', 'bow', 'stand', 'kneel', 'sujud'], 'pray-rain': RAKAH, 'pray-sujud-tilawah': ['fold', 'kneel', 'sujud', 'kneel', 'stand'], 'pray-sick': ['sit', 'point'],
});
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a, b, t) => a.map((p, i) => [p[0] + (b[i][0] - p[0]) * t, p[1] + (b[i][1] - p[1]) * t]);
const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// A limb or the robe as a filled ribbon of varying width along its joints.
function ribbon(pts, w) {
  const left = [], right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * w[i], ny = (dx / len) * w[i];
    left.push([p[0] + nx, p[1] + ny]); right.unshift([p[0] - nx, p[1] - ny]);
  });
  return 'M' + [...left, ...right].map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
}

// A limb or the robe: a thick rounded stroke with a thin darker outline behind it, so bends stay smooth.
const line = (pts) => pts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
const limb = (pts, w, cls) => html`<polyline points=${line(pts)} class="fig-l fig-out" style=${{ strokeWidth: w + 2.200 }} /><polyline points=${line(pts)} class=${'fig-l fig-in-' + cls} style=${{ strokeWidth: w }} />`;

export function PrayerFigure({ seq }) {
  const [pts, setPts] = useState(P[seq[seq.length - 1]]);
  const box = useRef(null);
  useEffect(() => {
    if (seq.length < 2 || still()) { setPts(P[seq[seq.length - 1]]); return; }
    let raf, start = null, on = false;
    const MOVE = 1300, HOLD = 1200, STEP = MOVE + HOLD, total = seq.length * STEP;
    const tick = (now) => {
      if (start === null) start = now;
      const t = (now - start) % total, i = Math.floor(t / STEP), into = t - i * STEP;
      const from = P[seq[i]], to = P[seq[(i + 1) % seq.length]];
      setPts(into < HOLD ? from : mix(from, to, ease((into - HOLD) / MOVE)));
      if (on) raf = requestAnimationFrame(tick);
    };
    const io = new IntersectionObserver(([e]) => { on = e.isIntersecting; cancelAnimationFrame(raf); if (on) raf = requestAnimationFrame(tick); });
    io.observe(box.current);
    return () => { on = false; cancelAnimationFrame(raf); io.disconnect(); };
  }, [seq.join()]);
  const [foot, knee, hip, sh, head, elbow, hand] = pts;
  const down = Math.max(0, Math.min(1, (knee[1] - 112) / 26)); // 0 standing, 1 knees on the ground
  const upright = down < 0.5 && Math.abs(sh[0] - hip[0]) < 14;
  const unit = (a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; };
  const up = unit(hip, sh), front = [-up[1], up[0]]; // front of the chest, whatever way the back leans
  const at = (p, f, u) => [p[0] + front[0] * f + up[0] * u, p[1] + front[1] * f + up[1] * u];
  const neck = [sh[0] + (head[0] - sh[0]) * 0.42, sh[1] + (head[1] - sh[1]) * 0.42];
  const ang = (Math.atan2(head[1] - sh[1], head[0] - sh[0]) * 180) / Math.PI + 90; // head tilt follows the spine
  const hem = down > 0.5 ? [[knee[0] - 4, knee[1] - 3], [foot[0] + 12, foot[1] - 5]] : [knee, [foot[0] + 1, foot[1] - 13]];
  const arm = (Math.atan2(hand[1] - elbow[1], hand[0] - elbow[0]) * 180) / Math.PI;
  const cuff = [hand[0] - (hand[0] - elbow[0]) * 0.22, hand[1] - (hand[1] - elbow[1]) * 0.22];
  const rtl = isDv();
  return html`<svg ref=${box} class="figure" viewBox="40 0 158 156" role="img" aria-label="Prayer position" direction="ltr">
    <path d="M52 144h138l4 7H48z" class="fig-mat" /><path d="M56 147.500h130" class="fig-mat-edge" />
    <ellipse cx=${(foot[0] + knee[0] + hand[0]) / 3 + 6} cy="144.500" rx=${Math.max(24, Math.abs(head[0] - foot[0]) * 0.62)} ry="2.400" class="fig-shadow" />
    <g class="fig-qibla-g"><path d="M171 13h14M180 8l5 5-5 5" class="fig-qibla" /><text x="178" y="30" class="fig-label">${rtl ? 'ޤިބްލަ' : 'qiblah'}</text></g>
    ${down > 0.5 && html`<path d=${`M${foot[0] + 6} ${foot[1] - 1}h-12a3.400 3.400 0 0 1 0-6.800l10 1z`} class="fig-skin fig-skin-line" />`}
    ${limb([hip, hem[0], hem[1]], 25 - down * 6, 'robe')}
    ${limb([at(sh, 0, -3), at(hip, 0, 2)], 23, 'robe')}
    <polyline points=${line([at(sh, 0, -3), hip, hem[0], hem[1]])} class="fig-l fig-in-robe" style=${{ strokeWidth: 19 }} />
    <path d=${`M${line([at(sh, 9.500, -5)])}L${line([at(sh, 9.500, -24)])}`} class="fig-fold" />
    <path d=${`M${line([at(hip, -9, 0)])}L${line([[hem[0][0] - 9 + down * 6, hem[0][1]]])}`} class="fig-fold fig-fold-soft" />
    ${upright && html`<path d=${`M${foot[0] - 7} ${foot[1]}h22a3.600 3.600 0 0 0-2.500-6.400l-9-1.800h-10.500z`} class="fig-skin fig-skin-line" />`}
    ${limb([neck, at(sh, 0, 2)], 7.500, 'neck')}
    <path d=${`M${line([at(sh, -7, 3)])}Q${line([at(sh, 0, 9)])} ${line([at(sh, 8, 2)])}`} class="fig-collar" />
    <g transform=${`rotate(${ang.toFixed(1)} ${head[0]} ${head[1]})`}>
      <path d=${`M${head[0] + 8} ${head[1] + 1}q4.500 1.200 3 3.600q-2 .8-3.600-.4z`} class="fig-skin" />
      <circle cx=${head[0]} cy=${head[1]} r="10" class="fig-skin fig-skin-line" />
      <path d=${`M${head[0] - 4} ${head[1] + 8.500}q7 4.500 12-3.500q-1 7.500-6 8.500q-4 .5-6-5z`} class="fig-beard" />
      <path d=${`M${head[0] - 3.500} ${head[1] + 1}a2.300 3 0 1 1 1.500 4`} class="fig-ear" />
      <path d=${`M${head[0] - 10.600} ${head[1] - 2}q.6-9.500 10.600-9.500t10.600 9.500z`} class="fig-cap" />
    </g>
    ${limb([at(sh, 1, -4), elbow, cuff], 11, 'sleeve')}
    <ellipse cx=${hand[0]} cy=${hand[1]} rx="5.600" ry="3.700" transform=${`rotate(${arm.toFixed(1)} ${hand[0]} ${hand[1]})`} class="fig-skin fig-skin-line" />
  </svg>`;
}

// Front view for wudu: the part being washed glows and water runs over it.
const WUDU = {
  'wudu-1-intention': { part: html`<circle cx="100" cy="74" r="8" class="w-on w-pulse" />` },
  'wudu-2-hands': { part: html`<circle cx="63" cy="110" r="7.500" class="w-on" /><circle cx="137" cy="110" r="7.500" class="w-on" />`, drops: [[63, 96], [137, 96]] },
  'wudu-3-mouth-nose': { part: html`<ellipse cx="100" cy="36" rx="7" ry="5.500" class="w-on" />`, drops: [[100, 22]] },
  'wudu-4-face': { part: html`<circle cx="100" cy="30" r="14" class="w-on" />`, drops: [[93, 10], [107, 12]] },
  'wudu-5-arms': { part: html`<path d="M74 78 L63 106 M126 78 L137 106" class="w-on-line" />`, drops: [[68, 74], [132, 74]] },
  'wudu-6-head': { part: html`<path d="M85 26a15 15 0 0 1 30 0z" class="w-on" /><circle cx="84.500" cy="32" r="3.400" class="w-on" /><circle cx="115.500" cy="32" r="3.400" class="w-on" />`, drops: [[100, 2]] },
  'wudu-7-feet': { part: html`<ellipse cx="90" cy="147" rx="9" ry="4.500" class="w-on" /><ellipse cx="110" cy="147" rx="9" ry="4.500" class="w-on" />`, drops: [[90, 130], [110, 130]] },
  'wudu-8-dua': { part: null, raised: true },
};
function WuduFigure({ step }) {
  const w = WUDU[step];
  const arms = w.raised ? 'M80 58 L66 36 M120 58 L134 36' : 'M80 58 L63 108 M120 58 L137 108';
  const hands = w.raised ? [[65, 33], [135, 33]] : [[63, 110], [137, 110]];
  return html`<svg class="figure" viewBox="40 0 120 156" role="img" aria-label="Part to wash">
    <ellipse cx="100" cy="151" rx="34" ry="3" class="fig-shadow" />
    <ellipse cx="90" cy="147" rx="8" ry="4" class="fig-skin" /><ellipse cx="110" cy="147" rx="8" ry="4" class="fig-skin" />
    <path d=${arms} class="fig-sleeve-line" />
    <path d="M80 54 Q100 48 120 54 L124 142 Q100 148 76 142z" class="fig-robe" />
    <path d="M100 56v84" class="fig-fold" />
    <path d="M95 44h10v10h-10z" class="fig-skin" />
    <circle cx="100" cy="30" r="14" class="fig-skin" /><path d="M86 26a14 14 0 0 1 28 0z" class="fig-cap" />
    ${hands.map(([x, y]) => html`<circle cx=${x} cy=${y} r="5.500" class="fig-skin" />`)}
    ${w.part}
    ${(w.drops || []).map(([x, y], i) => html`<g class="w-drops" style=${{ animationDelay: i * 0.4 + 's' }}>
      <path d=${`M${x} ${y}q4 6 0 9q-4-3 0-9z`} /><path d=${`M${x + 6} ${y - 9}q3 5 0 7q-3-2 0-7z`} /><path d=${`M${x - 6} ${y - 15}q3 5 0 7q-3-2 0-7z`} /></g>`)}
  </svg>`;
}
export function StepFigure({ id }) {
  if (SALAH[id]) return html`<div class="figure-box"><${PrayerFigure} seq=${SALAH[id]} /></div>`;
  if (WUDU[id]) return html`<div class="figure-box"><${WuduFigure} step=${id} /></div>`;
  return null;
}

// ---------- choose a prayer: its intention and its rak'ah-by-rak'ah outline ----------
const PR = {
  fajr: { en: 'Fajr', dv: 'ފަތިސް', ar: 'الصُّبْحِ', tr: 's-subhi', n: 2, loud: true },
  dhuhr: { en: 'Dhuhr', dv: 'މެންދުރު', ar: 'الظُّهْرِ', tr: 'z-zuhri', n: 4, loud: false },
  asr: { en: 'Asr', dv: 'ޢަޞްރު', ar: 'الْعَصْرِ', tr: "l-'asri", n: 4, loud: false },
  maghrib: { en: 'Maghrib', dv: 'މަޣްރިބް', ar: 'الْمَغْرِبِ', tr: 'l-maghribi', n: 3, loud: true },
  isha: { en: 'Isha', dv: 'ޢިޝާ', ar: 'الْعِشَاءِ', tr: "l-'isha'i", n: 4, loud: true },
};
const NUM = { 2: { ar: 'رَكْعَتَيْنِ', tr: "rak'atayni", en: 'two', dv: 'ދެ' }, 3: { ar: 'ثَلَاثَ رَكَعَاتٍ', tr: "thalatha raka'atin", en: 'three', dv: 'ތިން' }, 4: { ar: 'أَرْبَعَ رَكَعَاتٍ', tr: "arba'a raka'atin", en: 'four', dv: 'ހަތަރު' } };
const ROLE = {
  alone: { en: 'Praying alone', dv: 'އެކަނި', ar: '', tr: '', me: '', md: '' },
  follow: { en: 'Behind an imam', dv: 'އިމާމެއްގެ ފަހަތުގައި', ar: ' مَأْمُومًا', tr: " ma'muman", me: ', following the imam', md: 'އިމާމާ ތަބާވެ، ' },
  imam: { en: 'As the imam', dv: 'އިމާމުވެ', ar: ' إِمَامًا', tr: ' imaman', me: ', as imam', md: 'އިމާމުވެ، ' },
};
export function PrayerPicker() {
  const [sel, setSel] = useState(getSettings().prayerSel || { p: 'fajr', r: 'alone' });
  const pick = (patch) => { const next = { ...sel, ...patch }; setSel(next); setSettings({ prayerSel: next }); };
  const p = PR[sel.p], n = NUM[p.n], r = ROLE[sel.r], dv = isDv();
  const rows = [];
  for (let i = 1; i <= p.n; i++) {
    const voice = p.loud && i <= 2 ? (dv ? 'އަޑުހަރުކޮށް' : 'aloud') : (dv ? 'މަޑުމަޑުން' : 'quietly');
    const parts = [i <= 2 ? (dv ? `ފާތިޙާއާއި ސޫރަތެއް (${voice})` : `Al-Fatihah and a surah (${voice})`) : (dv ? `ފާތިޙާ އެކަނި (${voice})` : `Al-Fatihah only (${voice})`), dv ? 'ރުކޫޢު، އިޢުތިދާލު' : 'bow, rise'];
    if (sel.p === 'fajr' && i === 2) parts.push(dv ? 'ޤުނޫތު' : 'qunut');
    parts.push(dv ? 'ދެ ސަޖިދަ' : 'two prostrations');
    if (i === 2 && p.n > 2) parts.push(dv ? 'ފުރަތަމަ އައްތަޙިއްޔާތު' : 'first tashahhud');
    if (i === p.n) parts.push(dv ? 'ފަހު އައްތަޙިއްޔާތު، ޞަލަވާތް، ސަލާމް' : 'final tashahhud, salawat, salam');
    rows.push(parts.join(dv ? '، ' : ', '));
  }
  return html`<div class="picker">
    <div class="chips wrap" role="group">${Object.entries(PR).map(([k, v]) => html`<button class="chip" aria-pressed=${sel.p === k} onClick=${() => pick({ p: k })}>${dv ? v.dv : v.en}</button>`)}</div>
    <div class="chips wrap" role="group">${Object.entries(ROLE).map(([k, v]) => html`<button class="chip" aria-pressed=${sel.r === k} onClick=${() => pick({ r: k })}>${dv ? v.dv : v.en}</button>`)}</div>
    <div class="recite" key=${sel.p + sel.r}>
      <p class="ar" lang="ar" dir="rtl">أُصَلِّي فَرْضَ ${p.ar} ${n.ar} مُسْتَقْبِلَ الْقِبْلَةِ أَدَاءً${r.ar} لِلَّهِ تَعَالَى</p>
      <p class="translit" lang="en" dir="ltr">Usalli farda${p.tr} ${n.tr} mustaqbilal-qiblati ada'an${r.tr} lillahi ta'ala.</p>
      <p class=${dv ? 'dv' : ''}>${dv ? `ޤިބްލައަށް ކުރިމަތިލައި، ${p.dv} ނަމާދުގެ ފަރުޟު ${n.dv} ރަކުޢަތް، ${r.md}އަދާކޮށް، ﷲ އަށްޓަކައި ކުރުމަށް ނިޔަތްގަތީމެވެ.` : `I pray the obligatory ${p.en} prayer, ${n.en} rak'ahs, facing the qiblah, on time${r.me}, for Allah the Exalted.`}</p>
    </div>
    <ol class="outline ${dv ? 'dv' : ''}">${rows.map((t, i) => html`<li><strong>${dv ? `${i + 1} ވަނަ ރަކުޢަތް` : `Rak'ah ${i + 1}`}</strong><span>${t}</span></li>`)}</ol>
    <p class="muted">${dv ? 'ނިޔަތަކީ ހިތުގެ ޤަޞްދެވެ. ޝާފިޢީ މަޛްހަބުގައި ތަކްބީރުގެ ކުރިން ދުލުން ކިޔުމަކީ ހިތަށް އެހީވާ ސުންނަތެކެވެ.' : 'The intention is the resolve in the heart at the takbir. In the Shafi\'i school, saying it quietly just before the takbir is recommended as a help to the heart, in Arabic or your own language.'}</p>
  </div>`;
}
