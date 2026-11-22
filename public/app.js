import { html, render, useState, useEffect, useRef, useMemo } from './vendor/preact-htm.js';
import { getSettings, setSettings, onSettings, applyTheme, t, pick, isDv, PRAYERS, mvNow, timesFor, fmtTime, fmtSpan, hijri, today as todayText, getJSON, forget, api, ayahUrl, parseQuranRef, Markdown, loadAccount, getUser, accountAuth, accountLogout, todayKey, dayNotes } from './lib.js';
import { LETTERS, WORDS } from './arabic.js';
import { Admin } from './admin.js';
import { StepFigure, PrayerPicker } from './figures.js';

// ---------- hooks ----------
function useSettings() {
  const [s, set] = useState(getSettings());
  useEffect(() => onSettings(set), []);
  return s;
}
function useRoute() {
  const read = () => (location.hash.replace(/^#\/?/, '') || '').split('/').map(decodeURIComponent);
  const [r, set] = useState(read());
  useEffect(() => {
    const f = () => { set(read()); };
    addEventListener('hashchange', f);
    return () => removeEventListener('hashchange', f);
  }, []);
  return r;
}
function useData(loader, deps) {
  const [state, set] = useState({ loading: true });
  const [n, setN] = useState(0);
  useEffect(() => {
    let live = true;
    set({ loading: true });
    loader().then((data) => live && set({ data }), (error) => live && set({ error }));
    return () => { live = false; };
  }, [...deps, n]);
  return { ...state, reload: () => setN(n + 1) };
}
const Wait = ({ s, children }) => s.loading ? html`<p class="status" role="status">${t('loading')}…</p>`
  : s.error ? html`<div class="status"><p>${t('failed')}</p><button class="btn" onClick=${s.reload}>${t('retry')}</button></div>` : children(s.data);

// ---------- audio ----------
const player = { el: new Audio(), queue: [], i: -1, playing: false, subs: new Set() };
player.el.preload = 'auto';
const emit = () => player.subs.forEach((f) => f({}));
player.el.addEventListener('ended', () => { if (player.i + 1 < player.queue.length) playAt(player.i + 1); else stopAudio(); });
player.el.addEventListener('error', () => {
  const cur = player.queue[player.i];
  // A reciter folder that is missing or renamed: carry on with Alafasy instead of stopping.
  if (cur && cur.s && !cur.url.includes('Alafasy_128kbps') && !cur.fell) { cur.fell = true; cur.url = ayahUrl(cur.s, cur.a, 'Alafasy_128kbps'); cur.label += ' (Alafasy)'; player.el.src = cur.url; player.el.play().catch(() => {}); emit(); return; }
  player.failed = true; player.playing = false; emit();
});
player.el.addEventListener('pause', () => { player.playing = false; emit(); });
player.el.addEventListener('playing', () => { player.playing = true; player.failed = false; emit(); });
// ---------- offline recitation: ayah files saved on this device ----------
const AUDIO_CACHE = 'dheen-audio';
async function fetchAyah(url) {
  try { const r = await fetch(url, { mode: 'cors' }); if (r.ok) return r; } catch {}
  const r = await fetch('/api/audio-proxy/' + url.split('/data/')[1]); // the audio host refused a direct download: go through our own server
  if (!r.ok) throw new Error('download failed');
  return r;
}
async function downloadAyahs(list, onProgress, ctl) {
  const cache = await caches.open(AUDIO_CACHE);
  navigator.storage?.persist?.();
  let done = 0, failed = 0;
  const q = [...list];
  const worker = async () => {
    while (q.length && !ctl.stop) {
      const [s, a] = q.shift(), url = ayahUrl(s, a);
      try { if (!(await cache.match(url))) { const r = await fetchAyah(url); await cache.put(url, new Response(await r.blob(), { headers: { 'Content-Type': 'audio/mpeg' } })); } } catch { failed++; }
      onProgress(++done, failed);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return { done, failed };
}
async function savedCount(list) {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(AUDIO_CACHE);
  let n = 0;
  for (const [s, a] of list) if (await cache.match(ayahUrl(s, a))) n++;
  return n;
}
async function playAt(i) {
  player.i = i;
  const item = player.queue[i];
  let src = item.url;
  try {
    if ('caches' in window && item.s) {
      const hit = await (await caches.open(AUDIO_CACHE)).match(item.url);
      if (hit) { if (player.blob) URL.revokeObjectURL(player.blob); player.blob = URL.createObjectURL(await hit.blob()); src = player.blob; }
    }
  } catch {}
  if (player.i !== i) return;
  player.el.src = src;
  player.el.play().catch(() => {});
  emit();
}
function OfflineAudio({ list, label }) {
  const s = useSettings();
  const [st, setSt] = useState({ saved: null });
  const ctl = useRef({ stop: false });
  useEffect(() => { let live = true; setSt({ saved: null }); if (list.length <= 300) savedCount(list).then((n) => live && setSt({ saved: n })); else setSt({ saved: -1 }); return () => { live = false; ctl.current.stop = true; }; }, [list.length, list[0]?.[0], s.reciter]);
  if (!('caches' in window)) return null;
  const start = async () => {
    ctl.current = { stop: false };
    setSt({ run: true, done: 0, failed: 0 });
    const r = await downloadAyahs(list, (done, failed) => setSt({ run: true, done, failed }), ctl.current);
    setSt({ saved: r.done - r.failed, failed: r.failed, finished: !ctl.current.stop });
  };
  if (st.run) return html`<span class="offline"><button class="btn" onClick=${() => { ctl.current.stop = true; }}><${Icon} name="close" /> ${t('stop')}</button><span class="muted num">${st.done} / ${list.length}${st.failed ? ` (${st.failed} ✕)` : ''}</span><span class="bar"><i style=${{ width: (st.done / list.length) * 100 + '%' }}></i></span></span>`;
  const all = st.saved === list.length;
  return html`<span class="offline"><button class="btn" disabled=${all} onClick=${start}><${Icon} name="down" /> ${all ? t('savedOffline') : label}</button>
    ${st.saved > 0 && !all && html`<span class="muted num">${st.saved} / ${list.length}</span>`}${st.failed > 0 && html`<span class="muted">${t('someFailed')}</span>`}</span>`;
}
function playQueue(queue, start = 0) { player.queue = queue; player.failed = false; playAt(start); }
function stopAudio() { player.el.pause(); player.queue = []; player.i = -1; emit(); }
function toggleAudio() { if (player.playing) player.el.pause(); else player.el.play().catch(() => {}); }
function useAudio() {
  const [, set] = useState({});
  useEffect(() => { player.subs.add(set); return () => player.subs.delete(set); }, []);
  return { current: player.queue[player.i], playing: player.playing, failed: player.failed, i: player.i, queue: player.queue };
}
function itemQueue(item) {
  const refs = parseQuranRef(item.audio);
  const label = pick(item, 'title');
  if (refs) return refs.map(([s, a]) => ({ url: ayahUrl(s, a), key: 'item:' + item.id, label }));
  if (item.audio === 'file') return [{ url: '/api/audio/' + item.id, key: 'item:' + item.id, label }];
  if (/^(https:\/)?\//.test(item.audio)) return [{ url: item.audio, key: 'item:' + item.id, label }];
  return null;
}
// Where there is no recording, the device's own Arabic voice reads the text. It is a pronunciation aid, not a reciter.
function SpeakButton({ item }) {
  const [state, setState] = useState('');
  const speak = () => {
    const synth = window.speechSynthesis;
    if (synth.speaking) { synth.cancel(); setState(''); return; }
    const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('ar'));
    if (!voice && synth.getVoices().length) { setState('none'); return; }
    const u = new SpeechSynthesisUtterance(item.arabic.replace(/[.،]/g, '، '));
    u.lang = voice ? voice.lang : 'ar-SA'; if (voice) u.voice = voice; u.rate = 0.8;
    u.onend = u.onerror = () => setState('');
    stopAudio(); synth.speak(u); setState('on');
  };
  useEffect(() => () => window.speechSynthesis.cancel(), []);
  return html`<button class="btn listen" aria-pressed=${state === 'on'} onClick=${speak}><${Icon} name=${state === 'on' ? 'pause' : 'play'} /> ${state === 'on' ? t('stop') : t('readAloud')}</button>
    ${state === 'none' && html`<span class="muted">${t('noVoice')}</span>`}`;
}
function ListenButton({ item }) {
  const a = useAudio();
  const q = itemQueue(item);
  if (!q) return null; // no recording: no button. The phone's own voice is not used, many phones have no Arabic voice.
  const mine = a.current?.key === 'item:' + item.id;
  return html`<button class="btn listen" aria-pressed=${mine && a.playing} onClick=${() => (mine ? toggleAudio() : playQueue(q))}>
    <${Icon} name=${mine && a.playing ? 'pause' : 'play'} /> ${mine && a.playing ? t('pause') : t('listen')}</button>`;
}
function MiniPlayer() {
  const a = useAudio();
  if (!a.current) return null;
  return html`<div class="miniplayer" role="region" aria-label="Audio">
    <button class="icon-btn" onClick=${toggleAudio} aria-label=${a.playing ? t('pause') : t('play')}><${Icon} name=${a.playing ? 'pause' : 'play'} /></button>
    <span class="mp-label">${a.failed ? t('failed') : a.current.label}</span>
    <button class="icon-btn" onClick=${stopAudio} aria-label=${t('stop')}><${Icon} name="close" /></button>
  </div>`;
}

// ---------- icons ----------
const PATHS = {
  home: 'M3 11.5 12 4l9 7.5M6 10v9h12v-9', quran: 'M4 5c3-1.5 6-1.5 8 0 2-1.5 5-1.5 8 0v14c-3-1.5-6-1.5-8 0-2-1.5-5-1.5-8 0zM12 5v14',
  prayer: 'M12 3c2 2.5 4.5 3.5 4.5 7H7.5c0-3.5 2.500-4.500 4.500-7zM5 21V10.500h14V21M10 21v-4a2 2 0 0 1 4 0v4', duas: 'M7 20c-2-2-3-5-3-8l2.500-5 2 4.500V6l2-2 1.500 2 1.500-2 2 2v5.500l2-4.500 2.500 5c0 3-1 6-3 8',
  library: 'M5 4h4v16H5zM10.500 4h4v16h-4zM16 6l3.500-1 3 14-3.500 1z', search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', settings: 'M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0M16 5v4M10 10v4M18 15v4',
  full: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  compass: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM15.5 8.5l-2 5-5 2 2-5z', bell: 'M6 16v-5a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0',
  explore: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z', check: 'M5 12.5l4.5 4.5L19 7.5', calendar: 'M5 6h14v14H5zM5 10h14M9 3.5v4M15 3.5v4',
  moon: 'M19 14.5A8 8 0 0 1 9.5 5a7 7 0 1 0 9.5 9.5z', kaaba: 'M5 8l7-3 7 3v10l-7 3-7-3zM5 11.5l7 3 7-3M12 14.5V21', star: 'M12 4l2.4 5 5.6.7-4.1 3.8 1.1 5.5-5-2.8-5 2.8 1.1-5.5L4 9.7l5.6-.7z',
  drop: 'M12 3.5c3 4 5.5 6.8 5.5 10a5.5 5.5 0 0 1-11 0c0-3.2 2.5-6 5.5-10z', book: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6', chat: 'M4 6h16v10H9l-5 4zM8 10h8M8 13h5',
  down: 'M12 4v11M7 11l5 5 5-5M5 20h14',
  count: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM12 8.500v7M8.500 12h7',
  play: 'M7 4.500v15l12-7.500z', pause: 'M7 5h3.500v14H7zM13.500 5H17v14h-3.500z', close: 'M6 6l12 12M18 6 6 18', mark: 'M7 4h10v16l-5-4-5 4z', back: 'M14 5l-7 7 7 7', next: 'M9 5l7 7-7 7',
};
const Icon = ({ name, fill }) => html`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" fill=${fill || (name === 'play' || name === 'pause' ? 'currentColor' : 'none')} stroke="currentColor" stroke-width="1.700" stroke-linecap="round" stroke-linejoin="round"><path d=${PATHS[name]} /></svg>`;

// ---------- prayer times ----------
const prayerData = () => getJSON('/data/prayer.json');
function useClock() {
  const [now, set] = useState(mvNow());
  useEffect(() => { const id = setInterval(() => set(mvNow()), 20000); return () => clearInterval(id); }, []);
  return now;
}
function nextPrayer(times, minute) {
  for (const i of [0, 2, 3, 4, 5]) if (times[i] > minute) return { i, at: times[i], left: times[i] - minute };
  return { i: 0, at: times[0], left: times[0] + 1440 - minute, tomorrow: true };
}
function DayBand({ times, minute }) {
  // The day drawn as a strip from Fajr-40min to Isha+40min, with a marker for now.
  const start = times[0] - 40, end = times[5] + 40;
  const pos = (m) => Math.max(0, Math.min(100, ((m - start) / (end - start)) * 100));
  const sky = `linear-gradient(to right, var(--night) 0%, var(--dawn) ${pos(times[1])}%, var(--noon) ${pos(times[2])}%, var(--dusk) ${pos(times[4])}%, var(--night) 100%)`;
  return html`<div class="dayband" aria-hidden="true">
    <div class="sky" style=${{ background: sky }}>
      ${[0, 2, 3, 4, 5].map((i) => html`<span class="tick" style=${{ insetInlineStart: pos(times[i]) + '%' }}></span>`)}
      ${minute >= start && minute <= end && html`<span class="nowmark" style=${{ insetInlineStart: pos(minute) + '%' }}></span>`}
    </div>
  </div>`;
}
// ---------- the sky over the lagoon, drawn for the current minute of the day ----------
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mixHex = (a, b, k) => { const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(' ')})`; };
const clamp01 = (x) => Math.max(0, Math.min(1, x));
function skyAt(times, m) {
  const [fajr, sunrise, , asr, maghrib, isha] = times;
  const stops = [[fajr - 50, '#07182E', '#0E2C4A'], [fajr, '#0B2545', '#2B4A72'], [sunrise - 8, '#4C6FA8', '#F2A76B'], [sunrise + 50, '#4FA9DA', '#BFE6F2'], [asr, '#3F9CD3', '#C9ECF2'], [maghrib - 45, '#5B86C4', '#F4C27A'], [maghrib, '#5A4E8C', '#EE7B4D'], [maghrib + 25, '#2A2B5E', '#A4506B'], [isha + 10, '#0B2545', '#1C3A60'], [isha + 70, '#07182E', '#0E2C4A']];
  if (m <= stops[0][0] || m >= stops[stops.length - 1][0]) return ['rgb(7 24 46)', 'rgb(14 44 74)'];
  let i = 0;
  while (m > stops[i + 1][0]) i++;
  const k = (m - stops[i][0]) / (stops[i + 1][0] - stops[i][0]);
  return [mixHex(stops[i][1], stops[i + 1][1], k), mixHex(stops[i][2], stops[i + 1][2], k)];
}
const STARS = [[22, 18, 1.1], [58, 40, .8], [88, 14, 1.3], [120, 52, .7], [150, 22, 1], [183, 44, .8], [205, 12, 1.2], [238, 34, .7], [262, 58, .9], [290, 20, 1.3], [318, 46, .8], [345, 14, 1], [372, 38, 1.1], [40, 70, .7], [135, 80, .8], [225, 76, .7], [330, 78, .9], [385, 66, .7]];
function SkyScene({ times, minute }) {
  const [fajr, sunrise, , , maghrib, isha] = times;
  const [top, bottom] = skyAt(times, minute);
  const day = clamp01((minute - sunrise + 20) / 40) * clamp01((maghrib + 20 - minute) / 40);
  const night = minute < fajr || minute > isha ? 1 : minute < sunrise ? clamp01((sunrise - minute) / (sunrise - fajr)) * 0.8 : minute > maghrib ? clamp01((minute - maghrib) / (isha - maghrib)) * 0.9 : 0;
  const ts = (minute - sunrise) / (maghrib - sunrise);
  const sun = { x: 30 + 340 * ts, y: 128 - Math.sin(Math.PI * clamp01(ts)) * 96 + (ts < 0 ? -ts * 300 : ts > 1 ? (ts - 1) * 300 : 0) };
  const m2 = minute < sunrise ? minute + 1440 : minute;
  const tm = (m2 - maghrib) / (sunrise + 1440 - maghrib);
  const moon = { x: 40 + 320 * tm, y: 120 - Math.sin(Math.PI * clamp01(tm)) * 92 };
  const land = mixHex('#0A2422', '#3A5C58', day * 0.35);
  const id = useMemo(() => 's' + Math.random().toString(36).slice(2, 7), []);
  return html`<svg class="scene" viewBox="0 0 400 170" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs>
      <linearGradient id=${id + 'a'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${top} /><stop offset="1" stop-color=${bottom} /></linearGradient>
      <linearGradient id=${id + 'b'} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${mixHex('#0F7A74', '#FFFFFF', 0.12 + day * 0.25)} /><stop offset="1" stop-color="#083F3C" /></linearGradient>
      <radialGradient id=${id + 'c'}><stop offset="0" stop-color="#FFF6D6" /><stop offset=".45" stop-color="#FFD98A" stop-opacity=".55" /><stop offset="1" stop-color="#FFD98A" stop-opacity="0" /></radialGradient>
    </defs>
    <rect width="400" height="130" fill=${`url(#${id}a)`} />
    <g class="sc-far" opacity=${night}>${STARS.map(([x, y, r], i) => html`<circle cx=${x} cy=${y} r=${r} fill="#FFFFFF" class="sc-star" style=${{ animationDelay: (i % 6) * 0.5 + 's' }} />`)}</g>
    <g class="sc-far">
      ${night > 0.15 && html`<g transform=${`translate(${moon.x.toFixed(1)} ${moon.y.toFixed(1)})`} opacity=${night}><circle r="22" fill=${`url(#${id}c)`} opacity=".35" /><path d="M2-11a11 11 0 1 0 0 22a8.500 8.500 0 1 1 0-22z" fill="#F8F2D4" transform="rotate(-24)" /></g>`}
      ${ts > -0.08 && ts < 1.08 && html`<g transform=${`translate(${sun.x.toFixed(1)} ${sun.y.toFixed(1)})`}><circle r="40" fill=${`url(#${id}c)`} class="sc-halo" /><circle r="12" fill="#FFF3C4" /><circle r="12" fill="#FFC857" opacity=${0.2 + (1 - Math.sin(Math.PI * clamp01(ts))) * 0.6} /></g>`}
    </g>
    <g class="sc-mid" opacity=${day * 0.9}><g class="sc-cloud"><ellipse cx="80" cy="44" rx="34" ry="8" fill="#FFFFFF" opacity=".7" /><ellipse cx="100" cy="38" rx="22" ry="8" fill="#FFFFFF" opacity=".8" /></g><g class="sc-cloud slow"><ellipse cx="300" cy="62" rx="40" ry="7" fill="#FFFFFF" opacity=".55" /><ellipse cx="280" cy="57" rx="20" ry="7" fill="#FFFFFF" opacity=".7" /></g></g>
    <rect y="128" width="400" height="42" fill=${`url(#${id}b)`} />
    ${ts > -0.05 && ts < 1.05 && html`<ellipse cx=${sun.x.toFixed(1)} cy="140" rx="10" ry="14" fill="#FFE3A1" opacity=${0.18 + (1 - Math.sin(Math.PI * clamp01(ts))) * 0.3} class="sc-glint" />`}
    <g class="sc-mid" fill=${land} stroke=${land}>
      <path d="M196 129Q244 111 300 117Q346 121 384 129Z" stroke="none" />
      <path d="M262 120v-13h28v13zM266 107a10 10 0 0 1 20 0zM275.300 97.500l.7-5 .7 5zM296 120V93h5v27zM294.500 93h8l-4-9z" stroke="none" />
      <g fill="none" stroke-width="1.800" stroke-linecap="round"><path d="M230 121q-3-14 3-25M233 96q-9-4-15 2M233 96q-7-9-14-7M233 96q1-10 9-11M233 96q8-5 15-1M233 96q9 0 12 7" /><path d="M330 121q3-12-2-20M328 101q-8-3-13 3M328 101q-5-8-12-6M328 101q2-9 10-9M328 101q8-3 13 2" /><path d="M350 124q2-8-1-14M349 110q-6-2-10 2M349 110q1-7 7-7M349 110q6-2 10 2" /></g>
    </g>
    <g class="sc-boat"><path d="M58 135h36q4-4 5-10q-2 6-8 8h-33z" fill="#3B2A1E" /><path d="M76 133v-17l13 15z" fill="#F4EBDD" /><path d="M75 133v-19" stroke="#3B2A1E" stroke-width="1" /></g>
    <g class="sc-near">
      <path class="sc-wave w1" d="M-400 142q25-5 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0v30h-800z" fill="#FFFFFF" opacity=".10" />
      <path class="sc-wave w2" d="M-400 152q25-6 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0v20h-800z" fill="#FFFFFF" opacity=".12" />
      <path class="sc-wave w3" d="M-400 161q25-5 50 0t50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0 50 0v12h-800z" fill="#FFFFFF" opacity=".16" />
    </g>
  </svg>`;
}
// A ring of tasbih beads around the counter. The ring turns one bead with every tap.
function Beads({ c, n }) {
  const fixed = n > 1 && n <= 33, total = fixed ? n : 33;
  const lit = fixed ? Math.min(c, n) : c === 0 ? 0 : ((c - 1) % 33) + 1;
  return html`<svg class="beads" viewBox="-112 -112 224 224" aria-hidden="true" style=${{ transform: `rotate(${(-lit * 360) / total}deg)` }}>
    <circle r="100" class="bead-string" />
    ${Array.from({ length: total }, (_, i) => { const a = (i / total) * 2 * Math.PI - Math.PI / 2; return html`<circle cx=${(Math.cos(a) * 100).toFixed(1)} cy=${(Math.sin(a) * 100).toFixed(1)} r=${total > 20 ? 7 : total > 8 ? 9 : 11} class=${i < lit ? 'bead on' : 'bead'} />`; })}
  </svg>`;
}

const PRAY5 = [0, 2, 3, 4, 5]; // positions in PRAYERS that are prayers (sunrise is not)
const prayedOn = (s, day) => (s.prayed || {})[day] || [0, 0, 0, 0, 0];
function togglePrayed(k) {
  const s = getSettings(), day = todayKey();
  const cur = [...prayedOn(s, day)];
  cur[k] = cur[k] ? 0 : 1;
  const all = { ...(s.prayed || {}), [day]: cur };
  const keys = Object.keys(all).sort();
  while (keys.length > 120) delete all[keys.shift()];
  setSettings({ prayed: all });
  if (cur[k] && navigator.vibrate) navigator.vibrate(15);
  return cur[k];
}
// Ticks made from a notification button wait in a cache entry until the app is open to record them.
async function mergePendingPrayed() {
  if (!('caches' in window)) return;
  try {
    const cache = await caches.open('dheen-settings');
    const hit = await cache.match('/__prayed');
    if (!hit) return;
    const pending = await hit.json();
    const all = { ...(getSettings().prayed || {}) };
    for (const [day, ks] of Object.entries(pending)) { const cur = [...(all[day] || [0, 0, 0, 0, 0])]; for (const k of Object.keys(ks)) if (+k >= 0 && +k < 5) cur[+k] = 1; all[day] = cur; }
    await cache.delete('/__prayed');
    setSettings({ prayed: all });
  } catch {}
}
// A gentle question on the home screen about prayers whose time has passed today and are not ticked yet.
function CatchUp() {
  const s = useSettings();
  const now = useClock();
  const d = useData(prayerData, []);
  const [hidden, setHidden] = useState(false);
  if (!d.data || hidden) return null;
  const { times } = timesFor(d.data, s.island, now);
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const done = prayedOn(s, todayKey());
  const open = PRAY5.map((i, k) => ({ i, k })).filter(({ i, k }) => times[i] + 20 <= minute && !done[k]);
  if (!open.length) return null;
  const names = open.map(({ i }) => t(PRAYERS[i]));
  return html`<section class="catchup" role="group" aria-label=${t('catchAsk')}>
    <p><strong>${t('catchAsk')}</strong></p>
    <div class="chips">${open.map(({ i, k }) => html`<button class="chip catch-chip" onClick=${() => togglePrayed(k)}><${Icon} name="check" /> ${t(PRAYERS[i])}</button>`)}</div>
    <div class="catch-foot">${open.length > 1 && html`<button class="btn primary" onClick=${() => open.forEach(({ k }) => togglePrayed(k))}>${t('catchAll')}</button>`}<button class="btn" onClick=${() => setHidden(true)}>${t('catchLater')}</button></div>
  </section>`;
}
function WeekDots({ s }) {
  const days = [];
  for (let i = 6; i >= 0; i--) { const d = new Date(mvNow().getTime() - i * 86400000).toISOString().slice(0, 10); days.push(prayedOn(s, d).reduce((a, b) => a + b, 0)); }
  if (!days.some(Boolean)) return null;
  return html`<p class="week"><span>${t('last7')}</span>${days.map((n) => html`<i class=${n === 5 ? 'full' : ''}><span class="num">${n}</span></i>`)}</p>`;
}
function PrayerCard({ compact, track }) {
  const s = useSettings();
  const now = useClock();
  const d = useData(prayerData, []);
  const [just, setJust] = useState(-1);
  return html`<${Wait} s=${d}>${(data) => {
    const { island, times } = timesFor(data, s.island, now);
    const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
    const nx = nextPrayer(times, minute);
    const done = prayedOn(s, todayKey());
    return html`<section class="prayercard">
      <div class="pc-head">
        <div>
          <p class="pc-next">${t(PRAYERS[nx.i])} <span class="num">${fmtTime(nx.at)}</span></p>
          <a class="pc-left pc-count" href="#/countdown">${isDv() ? `${fmtSpan(nx.left)} ${t('nextIn')}` : `${t('nextIn')} ${fmtSpan(nx.left)}`} <${Icon} name="next" /></a>
        </div>
        <span class="pc-side"><a class="pc-island" href="#/settings">${island.a}. ${island.n}</a><a class="pc-island pc-qibla" href="#/qibla"><${Icon} name="compass" /> ${t('qibla')}</a></span>
      </div>
      <${SkyScene} times=${times} minute=${minute} />
      ${track ? html`<ol class="times track">
        ${PRAYERS.map((p, i) => { const k = PRAY5.indexOf(i); return html`<li class=${i === nx.i && !nx.tomorrow ? 'is-next' : ''}>
          ${k < 0 ? html`<span></span>` : html`<button class="pcheck" aria-pressed=${!!done[k]} aria-label=${`${t(p)}: ${t('markPrayed')}`} onClick=${() => setJust(togglePrayed(k) ? k : -1)}><${Icon} name="check" /></button>`}
          <span>${t(p)}</span><span class="num">${fmtTime(times[i])}</span></li>`; })}
      </ol>
      ${just >= 0 ? html`<p class="after"><span>${t('afterPrayer')}: ${t(PRAYERS[PRAY5[just]])}</span><a href=${`#/guide/after-${PRAYERS[PRAY5[just]]}`}>${t('startDhikr')}</a></p>` : html`<p class="pc-hint">${t('tickPrayers')}</p>`}
      <${WeekDots} s=${s} />` : html`<ol class="times ${compact ? 'compact' : ''}">
        ${PRAYERS.map((p, i) => html`<li class=${i === nx.i && !nx.tomorrow ? 'is-next' : times[i] <= minute ? 'is-past' : ''}><span>${t(p)}</span><span class="num">${fmtTime(times[i])}</span></li>`)}
      </ol>`}
    </section>`;
  }}<//>`;
}

// ---------- content store ----------
let bootP = null;
function loadBoot(fresh) {
  if (!bootP || fresh) bootP = getJSON('/api/bootstrap', { fresh: true });
  return bootP;
}
const sectionItems = (id) => getJSON('/api/sections/' + encodeURIComponent(id)).then((r) => r.items);
function useBoot() {
  const [state, set] = useState({ loading: true });
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        let b = await loadBoot();
        while (b.seeding && live) {
          set({ loading: true, seeding: true });
          const r = await api('/seed-step', { method: 'POST' });
          if (r.done) { forget('/api/'); b = await loadBoot(true); }
        }
        live && set({ data: b });
      } catch (error) { live && set({ error }); }
    })();
    return () => { live = false; };
  }, []);
  return state;
}

// ---------- pages ----------
const DAILY = [[2, 286], [94, 5], [2, 152], [13, 28], [65, 3], [39, 53], [3, 139], [29, 69], [2, 186], [49, 13], [16, 97], [20, 114], [25, 63], [31, 17], [59, 18], [103, 3], [17, 23], [4, 135], [5, 8], [14, 7], [40, 60], [2, 153], [3, 159], [33, 70], [41, 34], [55, 13], [57, 4], [93, 5], [64, 11], [9, 51]];
function AyahOfDay() {
  const [sn, an] = DAILY[Math.floor(Date.now() / 86400000) % DAILY.length];
  const d = useData(() => getJSON(`/quran/${sn}.json`), [sn]);
  const s = useSettings();
  const au = useAudio();
  if (!d.data) return null;
  const a = d.data.ayahs[an - 1];
  const mine = au.current?.s === sn && au.current?.a === an && au.queue.length === 1;
  const play = () => (mine ? toggleAudio() : playQueue([{ url: ayahUrl(sn, an), key: `q:${sn}:${an}`, s: sn, a: an, label: `${d.data.name} ${sn}:${an}` }]));
  return html`<section class="block">
    <h2>${t('ayahOfDay')}</h2>
    <div class="daily">
      <a href=${`#/quran/${sn}/${an}`}>
        <p class="ar" lang="ar" dir="rtl">${a[0]}</p>
        <p class=${isDv() ? 'dv' : ''}>${isDv() ? a[2] : a[1]}</p>
      </a>
      <div class="daily-foot">
        <a class="muted" href=${`#/quran/${sn}/${an}`}>${d.data.name} ${sn}:${an}</a>
        <button class="btn daily-play" onClick=${play} aria-label=${`${t(mine && au.playing ? 'pause' : 'play')} ${t('ayah')}`}><${Icon} name=${mine && au.playing ? 'pause' : 'play'} /> ${t('listen')}</button>
      </div>
    </div>
  </section>`;
}
// What is worth doing right now: by the clock, the weekday and the Hijri date.
function NowCard({ boot }) {
  const s = useSettings();
  const now = useClock();
  const d = useData(prayerData, []);
  if (!d.data) return null;
  const { times } = timesFor(d.data, s.island, now);
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  const rows = [];
  const title = (id) => { const it = boot.items.find((x) => x.id === id); return it ? pick(it, 'title') : null; };
  const todayIds = dayNotes(now);
  for (const id of todayIds) if (title(id)) rows.push([`#/i/${id}`, 'calendar', title(id), t('todayIs')]);
  const tomorrow = new Date(now.getTime() + 86400000);
  for (const id of dayNotes(tomorrow)) if (['day-monday-thursday', 'day-white-days', 'day-arafah', 'day-ashura', 'day-eid-fitr', 'day-eid-adha'].includes(id) && !todayIds.includes(id) && title(id)) rows.push([`#/i/${id}`, 'calendar', title(id), t('tomorrowIs')]);
  if (now.getUTCDay() === 5) { rows.push(['#/quran/18', 'quran', t('kahfFriday')]); rows.push(['#/count/dhikr-salawat', 'count', t('salawatFriday')]); }
  if (minute >= times[0] && minute < times[2]) rows.push(['#/guide/sec:duas-morning-evening', 'duas', t('morningAdhkar')]);
  else if (minute >= times[3] && minute < times[5]) rows.push(['#/guide/sec:duas-morning-evening', 'duas', t('eveningAdhkar')]);
  else if (minute >= times[5] || minute < times[0]) rows.push(['#/i/dua-sleeping', 'moon', t('beforeSleep')]);
  if (!rows.length) return null;
  return html`<section class="now">
    <h2>${t('nowTitle')}</h2>
    <ul>${rows.slice(0, 6).map(([href, icon, label, tag]) => html`<li><a href=${href}><${Icon} name=${icon} /><span>${label}</span>${tag ? html`<span class="tag">${tag}</span>` : html`<${Icon} name="next" />`}</a></li>`)}</ul>
  </section>`;
}
const FEATURES = [['s/salah-steps', 'prayer'], ['qibla', 'compass'], ['s/wudu-steps', 'drop'], ['duas', 'duas'], ['s/dhikr-tongue', 'count'], ['s/special-days', 'calendar'], ['s/fasting-eid-duas', 'moon'], ['s/janazah-steps', 'prayer'], ['s/duas-dead', 'duas'], ['s/umrah-steps', 'kaaba'], ['s/hajj-steps', 'kaaba'], ['s/prophets', 'book'], ['s/kids-stories', 'star'], ['arabic', 'chat'], ['explore', 'explore']];
function Card({ href, icon, title, sub, count }) {
  return html`<a class="card" data-tone=${icon} href=${href}><span class="disc"><${Icon} name=${icon} /></span><strong>${title}</strong>${sub && html`<span class="muted">${sub}</span>`}${count != null && html`<span class="count num">${count}</span>`}</a>`;
}
function featureCard(boot, [path, icon]) {
  if (path === 'qibla') return html`<${Card} href="#/qibla" icon=${icon} title=${t('qibla')} sub=${t('qiblaSub')} />`;
  if (path === 'duas') return html`<${Card} href="#/duas" icon=${icon} title=${t('duas')} sub=${t('g_duas')} />`;
  if (path === 'arabic') return html`<${Card} href="#/arabic" icon=${icon} title=${t('g_arabic')} sub=${t('arabicLede')} />`;
  if (path === 'explore') return html`<${Card} href="#/explore" icon=${icon} title=${t('explore')} sub=${t('exploreLede')} />`;
  const sec = boot.sections.find((x) => x.id === path.slice(2));
  return sec ? html`<${Card} href=${'#/' + path} icon=${icon} title=${pick(sec, 'title')} sub=${pick(sec, 'summary')} />` : null;
}
function Home({ boot }) {
  const s = useSettings();
  return html`<div class="page wide home">
    <header class="hello">
      <div><p class="hello-day">${todayText()}</p><p class="muted" title=${t('hijriNote')}>${hijri()}</p></div>
      <p class="bismillah" lang="ar" dir="rtl">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</p>
    </header>
    <a class="memstrip" href="#/memory"><span class="mem-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>${t('memShort')} <strong>${t('memName')}</strong> <span class="mem-ar-in" lang="ar" dir="rtl">شَرِيفَة أَحْمَد</span>${t('memAfter')} <span class="num">1972 – 2023</span></span><span class="memstrip-go">${t('memAsk')}</span></a>
    <${CatchUp} />
    <div class="home-grid">
      <div class="col"><${PrayerCard} track /></div>
      <div class="col">
        ${!s.notif.on && html`<a class="resume notif-cta" href="#/settings/notifications"><span class="muted">${t('notifCtaSub')}</span><strong><${Icon} name="bell" /> ${t('notifCta')}</strong></a>`}
        <${NowCard} boot=${boot} />
        ${s.last && html`<a class="resume" href=${`#/quran/${s.last.s}/${s.last.a}`}>
          <span class="muted">${t('continueReading')}</span>
          <strong>${s.last.name} <span class="num">${s.last.s}:${s.last.a}</span></strong>
        </a>`}
        ${(s.pagesRead || []).length > 0 && html`<a class="progress" href=${`#/mushaf/${s.mpage || 1}`}><span class="muted">${t('modeBook')}: ${t('pageWord')} <span class="num">${s.mpage || 1}</span></span><strong><span class="num">${s.pagesRead.length}</span> / <span class="num">604</span> ${t('pagesRead')}</strong><span class="bar"><i style=${{ width: (s.pagesRead.length / 604) * 100 + '%' }}></i></span></a>`}
        <${AyahOfDay} />
      </div>
    </div>
    <section class="group"><h2>${t('explore')}</h2><div class="cardgrid">${FEATURES.map((f) => featureCard(boot, f))}</div></section>
    <${MemoryPanel} />
  </div>`;
}

function QuranIndex() {
  const d = useData(() => getJSON('/quran/index.json'), []);
  const s = useSettings();
  const [q, setQ] = useState('');
  return html`<div class="page wide">
    <h1>${t('quran')}</h1>
    <div class="modes" role="group" aria-label=${t('quran')}>
      <button class="mode" aria-pressed=${s.qmode !== 'book'} onClick=${() => setSettings({ qmode: 'study' })}><strong>${t('modeStudy')}</strong><span>${t('modeStudyHint')}</span></button>
      <button class="mode" aria-pressed=${s.qmode === 'book'} onClick=${() => setSettings({ qmode: 'book' })}><strong>${t('modeBook')}</strong><span>${t('modeBookHint')}</span></button>
    </div>
    ${s.qmode === 'book' && html`<a class="resume" href=${`#/mushaf/${s.mpage || 1}`}><span class="muted">${t('continueReading')}</span><strong>${t('pageWord')} <span class="num">${s.mpage || 1}</span></strong></a>`}
    <input class="field" type="search" placeholder=${t('findSurah')} aria-label=${t('findSurah')} value=${q} onInput=${(e) => setQ(e.target.value)} />
    ${!q && s.marks.length > 0 && html`<details class="marks"><summary>${t('bookmarks')} (${s.marks.length})</summary>
      <ul class="plainlist">${s.marks.map((m) => html`<li><a href=${`#/quran/${m.s}/${m.a}`}>${m.name} <span class="num">${m.s}:${m.a}</span></a></li>`)}</ul></details>`}
    <${Wait} s=${d}>${(data) => {
      const needle = q.trim().toLowerCase().replace(/[-' ]/g, '');
      const list = data.surahs.filter((x) => !needle || String(x.n) === needle || x.name.toLowerCase().replace(/[-' ]/g, '').includes(needle) || x.en.toLowerCase().includes(q.trim().toLowerCase()) || x.ar.includes(q.trim()));
      if (!list.length) return html`<p class="status">${t('noResults')}</p>`;
      return html`<ol class="surahs">
        ${list.map((x) => html`<li><a href=${s.qmode === 'book' ? `#/mushaf/${x.page}` : `#/quran/${x.n}`}>
          <span class="sn num">${x.n}</span>
          <span class="smain"><strong>${x.name}</strong><span class="muted">${isDv() ? '' : x.en + ', '}${x.count} ${t('ayahs')}, ${t(x.rev === 'M' ? 'makki' : 'madani')}</span></span>
          <span class="sar" lang="ar" dir="rtl">${x.ar}</span>
        </a></li>`)}
      </ol>`;
    }}<//>
  </div>`;
}

function SurahNote({ n }) {
  const [note, setNote] = useState(null);
  useEffect(() => { setNote(null); loadBoot().then((b) => b.items.some((i) => i.id === 'surah-' + n) && sectionItems('surah-notes').then((items) => setNote(items.find((i) => i.id === 'surah-' + n)))).catch(() => {}); }, [n]);
  if (!note) return null;
  const dv = isDv() && note.body_dv;
  return html`<details class="surah-note"><summary>${t('aboutSurah')}</summary><div class=${dv ? 'dv' : ''}><${Markdown} text=${dv ? note.body_dv : note.body_en} /></div></details>`;
}
function Surah({ n, focus }) {
  const d = useData(() => getJSON(`/quran/${n}.json`), [n]);
  const s = useSettings();
  const a = useAudio();
  const seen = useRef(null);
  useEffect(() => {
    if (!d.data) return;
    const el = focus && document.getElementById('a' + focus);
    if (el) el.scrollIntoView({ block: 'start' }); else scrollTo(0, 0);
    // Remember the last ayah that scrolled past the top, so "Continue reading" works.
    seen.current?.disconnect();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { const an = +e.target.dataset.a; clearTimeout(io.t); io.t = setTimeout(() => setSettings({ last: { s: d.data.n, a: an, name: d.data.name } }), 800); }
    }, { rootMargin: '-10% 0px -70% 0px' });
    document.querySelectorAll('.ayah').forEach((el) => io.observe(el));
    seen.current = io;
    return () => { clearTimeout(io.t); io.disconnect(); };
  }, [d.data, focus]);
  // Follow the audio as it moves through the surah.
  useEffect(() => { if (a.current?.s === n && a.playing) document.getElementById('a' + a.current.a)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [a.current?.key]);
  const toggle = (k) => { const show = { ...s.show, [k]: !s.show[k] }; if (!show.ar && !show.en && !show.dv) return; setSettings({ show }); };
  return html`<${Wait} s=${d}>${(su) => {
    // The button beside an ayah plays that ayah and stops; "Play surah" plays on to the end.
    const playOne = (i) => playQueue([{ url: ayahUrl(su.n, i + 1), key: `q:${su.n}:${i + 1}`, s: su.n, a: i + 1, label: `${su.name} ${su.n}:${i + 1}` }]);
    const queueFrom = (i) => playQueue(su.ayahs.map((_, j) => ({ url: ayahUrl(su.n, j + 1), key: `q:${su.n}:${j + 1}`, s: su.n, a: j + 1, label: `${su.name} ${su.n}:${j + 1}` })), i);
    const marked = (an) => s.marks.some((m) => m.s === su.n && m.a === an);
    const mark = (an) => setSettings({ marks: marked(an) ? s.marks.filter((m) => !(m.s === su.n && m.a === an)) : [...s.marks, { s: su.n, a: an, name: su.name }] });
    return html`<div class="page surah">
      <header class="surah-head">
        <a class="backlink" href="#/quran"><${Icon} name="back" /> ${t('quran')}</a>
        <p class="surah-ar" lang="ar" dir="rtl">${su.ar}</p>
        <h1>${su.name}</h1>
        <p class="muted">${isDv() ? '' : su.en + ', '}${su.count} ${t('ayahs')}, ${t(su.rev === 'M' ? 'makki' : 'madani')}</p>
        <${SurahNote} n=${su.n} />
        <div class="toolbar">
          <a class="btn" href=${`#/mushaf/${su.page}`}><${Icon} name="quran" /> ${t('modeBook')}</a>
          <${OfflineAudio} list=${su.ayahs.map((_, j) => [su.n, j + 1])} label=${t('downloadSurah')} />
          <button class="btn primary" onClick=${() => (a.current?.s === su.n ? toggleAudio() : queueFrom(0))}><${Icon} name=${a.current?.s === su.n && a.playing ? 'pause' : 'play'} /> ${a.current?.s === su.n && a.playing ? t('pause') : t('playSurah')}</button>
          <span class="chips" role="group" aria-label="Show">
            ${[['ar', 'arabic'], ['en', 'english'], ['dv', 'dhivehi']].map(([k, l]) => html`<button class="chip" aria-pressed=${s.show[k]} onClick=${() => toggle(k)}>${t(l)}</button>`)}
          </span>
        </div>
      </header>
      ${su.n !== 1 && su.n !== 9 && html`<p class="basmala ar" lang="ar" dir="rtl">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</p>`}
      <ol class="ayahs">
        ${su.ayahs.map((v, i) => {
          const an = i + 1, on = a.current?.key === `q:${su.n}:${an}`;
          return html`<li class="ayah ${on ? 'is-playing' : ''}" id=${'a' + an} data-a=${an}>
            <div class="ayah-side">
              <span class="num an">${an}</span>
              <button class="icon-btn" aria-label=${`${t(on && a.playing ? 'pause' : 'play')} ${t('ayah')} ${an}`} onClick=${() => (on ? toggleAudio() : playOne(i))}><${Icon} name=${on && a.playing ? 'pause' : 'play'} /></button>
              <button class="icon-btn" aria-label=${`${t('bookmark')} ${an}`} aria-pressed=${marked(an)} onClick=${() => mark(an)}><${Icon} name="mark" fill=${marked(an) ? 'currentColor' : 'none'} /></button>
            </div>
            <div class="ayah-body">
              ${s.show.ar && html`<p class="ar" lang="ar" dir="rtl" style=${{ fontSize: s.arSize + 'px' }}>${v[0]}${su.sajda.includes(an) ? ' ۩' : ''}</p>`}
              ${s.show.en && html`<p class="tr" lang="en" dir="ltr">${v[1]}</p>`}
              ${s.show.dv && html`<p class="tr dv" lang="dv" dir="rtl">${v[2]}</p>`}
            </div>
          </li>`;
        })}
      </ol>
      <nav class="pager">
        ${su.n > 1 ? html`<a class="btn" href=${`#/quran/${su.n - 1}`}><${Icon} name="back" /> ${su.n - 1}</a>` : html`<span></span>`}
        ${su.n < 114 && html`<a class="btn" href=${`#/quran/${su.n + 1}`}>${su.n + 1} <${Icon} name="next" /></a>`}
      </nav>
    </div>`;
  }}<//>`;
}

const sectionsOf = (boot, area) => boot.sections.filter((x) => x.area === area);
const countIn = (boot, id) => boot.items.filter((i) => i.section_id === id).length;
function SectionList({ boot, sections }) {
  return html`<ul class="seclist">${sections.map((sec) => html`<li><a href=${`#/s/${sec.id}`}>
    <strong>${pick(sec, 'title')}</strong>
    ${pick(sec, 'summary') && html`<span class="muted">${pick(sec, 'summary')}</span>`}
    <span class="count num">${countIn(boot, sec.id)}</span>
  </a></li>`)}</ul>`;
}
// Every section belongs to one group on the Explore page.
const GROUPS = ['g_worship', 'g_duas', 'g_quran', 'g_days', 'g_stories', 'g_kids', 'g_arabic', 'g_know'];
const AREA_GROUP = { prayer: 'g_worship', hajj: 'g_worship', duas: 'g_duas', quran: 'g_quran', days: 'g_days', history: 'g_stories', kids: 'g_kids', arabic: 'g_arabic' };
const AREA_ICON = { prayer: 'prayer', hajj: 'kaaba', duas: 'duas', quran: 'quran', days: 'calendar', history: 'book', kids: 'star', arabic: 'chat' };
const groupOf = (sec) => (sec.id === 'seasons' ? 'g_days' : AREA_GROUP[sec.area] || 'g_know');
const SectionCards = ({ boot, sections }) => sections.map((sec) => html`<${Card} href=${`#/s/${sec.id}`} icon=${AREA_ICON[sec.area] || 'library'} title=${pick(sec, 'title')} sub=${pick(sec, 'summary')} count=${countIn(boot, sec.id)} />`);
function ExplorePage({ boot, focus }) {
  useEffect(() => { if (focus) document.getElementById(focus)?.scrollIntoView({ block: 'start' }); else scrollTo(0, 0); }, [focus]);
  return html`<div class="page wide">
    <h1>${t('explore')}</h1>
    <nav class="jump" aria-label=${t('explore')}>${GROUPS.map((g) => html`<a class="chip" href=${`#/explore/${g}`}>${t(g)}</a>`)}</nav>
    ${GROUPS.map((g) => html`<section class="group" id=${g}><h2>${t(g)}</h2><div class="cardgrid">
      ${g === 'g_quran' && html`<${Card} href="#/quran" icon="quran" title=${t('readQuran')} sub=${t('readQuranSum')} /><${Card} href="#/mushaf" icon="quran" title=${t('mushafT')} sub=${t('mushafSum')} />`}
      ${g === 'g_arabic' && html`<${Card} href="#/arabic/letters" icon="chat" title=${t('letters')} sub=${t('tapLetter')} /><${Card} href="#/arabic/words" icon="chat" title=${t('wordPractice')} sub=${t('whatMeans')} />`}
      ${g === 'g_duas' && html`<${Card} href="#/s/dhikr-tongue" icon="count" title=${t('counter')} sub=${t('tapToCount')} />`}
      <${SectionCards} boot=${boot} sections=${boot.sections.filter((x) => groupOf(x) === g)} />
    </div></section>`)}
  </div>`;
}
function PrayerPage({ boot }) {
  return html`<div class="page wide">
    <h1>${t('prayer')}</h1>
    <div class="home-grid"><div class="col"><${PrayerCard} track /></div>
      <div class="col"><section class="group"><h2>${t('guides')}</h2><div class="cardgrid one"><${Card} href="#/qibla" icon="compass" title=${t('qibla')} sub=${t('qiblaSub')} /><${SectionCards} boot=${boot} sections=${boot.sections.filter((x) => x.area === 'prayer')} /></div></section></div></div>
    <section class="group"><h2>${t('g_worship')}</h2><div class="cardgrid"><${SectionCards} boot=${boot} sections=${boot.sections.filter((x) => x.area === 'hajj' || x.id === 'pillars')} /></div></section>
  </div>`;
}
function DuasPage({ boot }) {
  return html`<div class="page wide"><h1>${t('duas')}</h1>
    <div class="cardgrid"><${Card} href="#/s/dhikr-tongue" icon="count" title=${t('counter')} sub=${t('tapToCount')} /><${Card} href="#/guide/sec:duas-morning-evening" icon="duas" title=${t('morningAdhkar')} sub=${t('oneByOne')} /><${Card} href="#/guide/after-dhuhr" icon="duas" title=${t('afterPrayer')} sub=${t('oneByOne')} /></div>
    <section class="group"><h2>${t('g_duas')}</h2><div class="cardgrid"><${SectionCards} boot=${boot} sections=${sectionsOf(boot, 'duas')} /></div></section></div>`;
}

// ---------- guided dhikr: one remembrance at a time, with its count ----------
const GUIDE_COUNTS = { 'dua-bismillah-protection': 3, 'dua-hasbiyallah': 7, 'dua-subhanallah-100': 100, 'dhikr-tahlil-100': 100 };
// How many times a dua is said: a fixed list first, then whatever its title states ("three times", "33 times").
const COUNT_WORDS = { two: 2, three: 3, four: 4, five: 5, seven: 7, ten: 10, hundred: 100 };
function countFor(it) {
  if (GUIDE_COUNTS[it.id]) return GUIDE_COUNTS[it.id];
  const m = /\b(?:(\d+)|(?:one |a )?(hundred)|(two|three|four|five|seven|ten))\s+times\b(?!\s+between)/i.exec(it.title_en || '');
  if (!m) return 1;
  return m[1] ? +m[1] : COUNT_WORDS[(m[2] || m[3]).toLowerCase()] || 1;
}
const firstPara = (x) => (x || '').split(/\n\s*\n/)[0].replace(/\*\*/g, '');
const fromItem = (it, n) => ({ ar: it.arabic, tr: it.translit, en: firstPara(it.body_en), dv: firstPara(it.body_dv), n, title_en: it.title_en, title_dv: it.title_dv, ref: it.ref, item: it });
const TAHLIL_EN = 'There is no god but Allah, alone, with no partner. His is the dominion and His is the praise, and He has power over all things.';
const TAHLIL_DV = 'ﷲ ފިޔަވައި އެހެން އިލާހަކު ނުވެއެވެ. އެކަލާނގެއަށް ބައިވެރިއަކު ނުވެއެވެ. ވެރިކަމާއި ޙަމްދު ހުރީ އެކަލާނގެއަށެވެ. އެކަލާނގެއީ ކޮންމެ ކަމެއްގެ މައްޗަށް ކުޅަދުންވަންތަ ރަސްކަލާނގެއެވެ.';
const TASBIH = [
  { ar: 'سُبْحَانَ اللَّهِ', tr: 'Subhanallah', en: 'Glory be to Allah.', dv: 'ﷲ ހުސްޠާހިރުވަންތައެވެ.', n: 33, title_en: 'Tasbih', title_dv: 'ތަސްބީޙަ', ref: 'Muslim 597' },
  { ar: 'الْحَمْدُ لِلَّهِ', tr: 'Alhamdulillah', en: 'All praise is for Allah.', dv: 'ޙަމްދު ހުރީ ﷲ އަށެވެ.', n: 33, title_en: 'Tahmid', title_dv: 'ތަޙްމީދު', ref: 'Muslim 597' },
  { ar: 'اللَّهُ أَكْبَرُ', tr: 'Allahu akbar', en: 'Allah is the Greatest.', dv: 'ﷲ އީ އެންމެ ބޮޑު ފަރާތެވެ.', n: 33, title_en: 'Takbir', title_dv: 'ތަކްބީރު', ref: 'Muslim 597' },
  { ar: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', tr: "La ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamdu, wa huwa 'ala kulli shay'in qadir.", en: TAHLIL_EN, dv: TAHLIL_DV, n: 1, title_en: 'To complete the hundred', title_dv: 'ސަތޭކަ ފުރިހަމަކުރުމަށް', ref: 'Muslim 597' },
];
const TEN = { ar: 'لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، يُحْيِي وَيُمِيتُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ', tr: "La ilaha illallahu wahdahu la sharika lah, lahul-mulku wa lahul-hamdu, yuhyi wa yumit, wa huwa 'ala kulli shay'in qadir.", en: 'There is no god but Allah, alone, with no partner. His is the dominion and His is the praise. He gives life and causes death, and He has power over all things. Said ten times after Fajr and after Maghrib.', dv: 'ﷲ ފިޔަވައި އެހެން އިލާހަކު ނުވެއެވެ. ވެރިކަމާއި ޙަމްދު ހުރީ އެކަލާނގެއަށެވެ. ދިރުއްވަނީވެސް މަރުގަންނަވަނީވެސް އެކަލާނގެއެވެ. ފަތިސް ނަމާދަށްފަހުގައާއި މަޣްރިބު ނަމާދަށްފަހު ދިހަ ފަހަރު ކިޔާށެވެ.', n: 10, title_en: 'Ten times after Fajr and Maghrib', title_dv: 'ފަތިހާއި މަޣްރިބަށްފަހު ދިހަ ފަހަރު', ref: 'Tirmidhi 3474' };
const FAJR_DUA = { ar: 'اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا، وَرِزْقًا طَيِّبًا، وَعَمَلًا مُتَقَبَّلًا', tr: "Allahumma inni as'aluka 'ilman nafi'an, wa rizqan tayyiban, wa 'amalan mutaqabbala.", en: 'O Allah, I ask You for knowledge that benefits, provision that is good, and deeds that are accepted.', dv: 'އޭ ﷲ! ފައިދާކުރާ ޢިލްމަކާއި، ޙަލާލު ރަނގަޅު ރިޒުޤަކާއި، ޤަބޫލުވާ ޢަމަލެއް ދެއްވުން އެދި ދަންނަވަމެވެ.', n: 1, title_en: 'After Fajr', title_dv: 'ފަތިސް ނަމާދަށްފަހު', ref: 'Ibn Majah 925' };
async function quranStep(sn, from, to, n) {
  const su = await getJSON(`/quran/${sn}.json`);
  const list = su.ayahs.slice(from - 1, to || su.ayahs.length);
  return { ar: list.map((a) => a[0]).join(' ۝ '), en: list.map((a) => a[1]).join(' '), dv: list.map((a) => a[2]).join(' '), n, title_en: from === 255 ? 'Ayat al-Kursi' : `Surah ${su.name}`, title_dv: from === 255 ? 'އާޔަތުލް ކުރްސީ' : `ސޫރަތު ${su.name}`, ref: `Quran ${sn}${to === from ? ':' + from : ''}`, queue: list.map((_, j) => ({ url: ayahUrl(sn, from + j), s: sn, a: from + j, label: `${su.name} ${sn}:${from + j}` })) };
}
async function buildGuide(id, boot) {
  if (id.startsWith('after-')) {
    const p = id.slice(6), twice = p === 'fajr' || p === 'maghrib';
    const items = await sectionItems('duas-after-salah');
    const get = (x) => items.find((i) => i.id === x);
    const steps = [];
    for (const x of ['dua-istighfar-salam', 'dua-tahlil-after-salah']) if (get(x)) steps.push(fromItem(get(x), 1));
    steps.push(...TASBIH, await quranStep(2, 255, 255, 1));
    for (const sn of [112, 113, 114]) steps.push(await quranStep(sn, 1, 0, twice ? 3 : 1));
    if (twice) steps.push(TEN);
    if (p === 'fajr') steps.push(FAJR_DUA);
    return { title: `${t('afterPrayer')}: ${t(p)}`, back: '#/', steps };
  }
  const secId = id.replace(/^sec:/, '');
  const sec = boot.sections.find((x) => x.id === secId);
  const items = (await sectionItems(secId)).filter((i) => i.arabic);
  return { title: sec ? pick(sec, 'title') : '', back: `#/s/${secId}`, steps: items.map((it) => fromItem(it, countFor(it))) };
}
function GuidePage({ boot, id }) {
  const d = useData(() => buildGuide(id, boot), [id]);
  const [pos, setPos] = useState(0);
  const [c, setC] = useState(0);
  const audio = useAudio();
  useEffect(() => { setPos(0); setC(0); }, [id]);
  const go = (p) => { setPos(p); setC(0); scrollTo(0, 0); };
  return html`<${Wait} s=${d}>${(g) => {
    const n = g.steps.length, st = g.steps[pos];
    if (!n) return html`<div class="page"><a class="backlink" href=${g.back}><${Icon} name="back" /> ${t('back')}</a><p class="status">${t('noResults')}</p></div>`;
    if (!st) return html`<div class="page guide"><a class="backlink" href=${g.back}><${Icon} name="back" /> ${t('back')}</a>
      <div class="guide-done"><span class="disc big"><${Icon} name="check" /></span><h1>${g.title}</h1><p>${t('guideDone')}</p>
      <div class="toolbar"><a class="btn primary" href="#/">${t('home')}</a><button class="btn" onClick=${() => go(0)}>${t('again')}</button></div></div></div>`;
    const tap = () => {
      const v = c + 1; setC(v);
      if (navigator.vibrate) navigator.vibrate(v >= st.n ? [50, 50, 120] : 12);
      if (v >= st.n) setTimeout(() => go(pos + 1), st.n > 1 ? 450 : 160);
    };
    const queue = st.queue || (st.item ? itemQueue(st.item) : null);
    return html`<div class="page guide">
      <a class="backlink" href=${g.back}><${Icon} name="back" /> ${g.title}</a>
      <div class="guide-top"><p class="muted">${t('step')} <span class="num">${pos + 1}</span> ${t('of')} <span class="num">${n}</span></p><span class="bar"><i style=${{ width: (pos / n) * 100 + '%' }}></i></span></div>
      <h1>${isDv() ? st.title_dv || st.title_en : st.title_en}</h1>
      <p class="ar guide-ar" lang="ar" dir="rtl">${st.ar}</p>
      ${st.tr && html`<p class="translit" dir="ltr">${st.tr}</p>`}
      <p class=${isDv() ? 'dv guide-mean' : 'guide-mean'}>${isDv() ? st.dv || st.en : st.en}</p>
      ${st.ref && html`<p class="muted" dir="ltr">${st.ref}</p>`}
      <div class="tapwrap small">${st.n > 1 && html`<${Beads} c=${c} n=${st.n} />`}<button class="tapper small ${c >= st.n ? 'is-done' : ''}" key=${pos} onClick=${tap} aria-label=${t('count')} style=${{ '--pct': Math.min(1, c / st.n) }}>
        ${st.n > 1 ? html`<span class="tap-num num" key=${c}>${c}</span><span class="tap-hint"><span class="num">${st.n}</span> ${t('timesWord')}</span>` : html`<${Icon} name="check" /><span class="tap-hint">${t('onceWord')}</span>`}
      </button></div>
      <p class="muted">${t('tapCount')}</p>
      <div class="toolbar">
        ${pos > 0 && html`<button class="btn" onClick=${() => go(pos - 1)}><${Icon} name="back" /> ${t('back')}</button>`}
        ${queue && queue.length > 0 && html`<button class="btn" onClick=${() => (audio.i >= 0 ? stopAudio() : playQueue(queue))}><${Icon} name=${audio.i >= 0 ? 'pause' : 'play'} /> ${t('listen')}</button>`}
        <button class="btn" onClick=${() => go(pos + 1)}>${t('skip')} <${Icon} name="next" /></button>
      </div>
    </div>`;
  }}<//>`;
}

// ---------- learn Arabic ----------
function LetterChart() {
  const [sel, setSel] = useState(0);
  const L = LETTERS[sel];
  return html`<div class="letters-wrap">
    <div class="letters" dir="rtl">${LETTERS.map((l, i) => html`<button class="letter" aria-pressed=${i === sel} onClick=${() => setSel(i)}><span class="ar" lang="ar">${l[0]}</span><span class="dv">${l[3]}</span></button>`)}</div>
    <div class="letter-card" key=${sel}>
      <p class="ar letter-big" lang="ar">${L[0]}</p>
      <h2>${L[1]}</h2>
      <dl>
        <dt>${t('soundT')}</dt><dd>${L[2]}</dd>
        <dt>${t('thaanaT')}</dt><dd class="dv">${L[3]}</dd>
        <dt>${L[4] ? t('formsT') : t('aloneT')}</dt><dd class="ar forms" lang="ar" dir="rtl">${L[4] ? html`<span>${L[0]}ـ</span><span>ـ${L[0]}ـ</span><span>ـ${L[0]}</span>` : html`<span>${L[0]}</span><span>ـ${L[0]}</span>`}</dd>
        <dt>${t('exampleT')}</dt><dd><span class="ar" lang="ar" dir="rtl">${L[5]}</span> <em dir="ltr">${L[6]}</em> · ${isDv() ? html`<span class="dv">${L[8]}</span>` : L[7]}</dd>
      </dl>
    </div>
  </div>`;
}
function WordQuiz() {
  const s = useSettings();
  const known = s.arWords || [];
  const make = (prev) => {
    const pool = WORDS.map((_, i) => i).filter((i) => i !== prev);
    const fresh = pool.filter((i) => !known.includes(WORDS[i][0]));
    const from = fresh.length ? fresh : pool;
    const q = from[Math.floor(Math.random() * from.length)];
    const others = pool.filter((i) => i !== q).sort(() => Math.random() - 0.5).slice(0, 3);
    return { q, opts: [q, ...others].sort(() => Math.random() - 0.5), picked: -1 };
  };
  const [st, setSt] = useState(() => make(-1));
  const W = WORDS[st.q], col = isDv() ? 3 : 2;
  const choose = (i) => {
    if (st.picked >= 0) return;
    setSt({ ...st, picked: i });
    if (i === st.q && !known.includes(W[0])) setSettings({ arWords: [...known, W[0]] });
  };
  return html`<div class="quiz">
    <p class="muted"><span class="num">${known.length}</span> / <span class="num">${WORDS.length}</span> ${t('learnedT')}</p>
    <span class="bar"><i style=${{ width: (known.length / WORDS.length) * 100 + '%' }}></i></span>
    <p class="muted">${t('whatMeans')}</p>
    <p class="ar quiz-word" lang="ar" dir="rtl" key=${st.q}>${W[0]}</p>
    <p class="translit" dir="ltr">${W[1]}</p>
    <div class="quiz-opts">${st.opts.map((i) => html`<button class="btn opt ${st.picked >= 0 ? (i === st.q ? 'right' : i === st.picked ? 'wrong' : '') : ''} ${isDv() ? 'dv' : ''}" onClick=${() => choose(i)}>${WORDS[i][col]}</button>`)}</div>
    ${st.picked >= 0 && html`<div class="quiz-result" role="status"><p><strong>${st.picked === st.q ? t('correctT') : `${t('wrongT')}:`}</strong> ${st.picked === st.q ? '' : html`<span class=${isDv() ? 'dv' : ''}>${W[col]}</span>`}</p><button class="btn primary" onClick=${() => setSt(make(st.q))}>${t('nextWord')} <${Icon} name="next" /></button></div>`}
  </div>`;
}
function ArabicPage({ boot, tab }) {
  const cur = tab || 'letters';
  const lessons = boot.items.filter((x) => x.section_id === 'arabic-lessons');
  return html`<div class="page wide arabic">
    <h1>${t('g_arabic')}</h1>
    <p class="lede">${t('arabicLede')}</p>
    <nav class="jump">${[['letters', 'letters'], ['words', 'wordPractice'], ['lessons', 'lessons']].map(([k, key]) => html`<a class="chip" href=${`#/arabic/${k}`} aria-pressed=${cur === k}>${t(key)}</a>`)}</nav>
    ${cur === 'letters' && html`<${LetterChart} />`}
    ${cur === 'words' && html`<${WordQuiz} />`}
    ${cur === 'lessons' && html`<div class="cardgrid">${lessons.map((it, i) => html`<a class="card" href=${`#/i/${it.id}`}><span class="disc num">${i + 1}</span><strong>${pick(it, 'title')}</strong></a>`)}</div>`}
  </div>`;
}

function Recitation({ item, big }) {
  const s = useSettings();
  if (!item.arabic && !item.translit) return null;
  return html`<div class="recite">
    ${item.arabic && html`<p class="ar" lang="ar" dir="rtl" style=${{ fontSize: (big && item.arabic.length < 320 ? s.arSize : s.arSize - 6) + 'px' }}>${item.arabic}</p>`}
    ${item.translit && html`<p class="translit" lang="en" dir="ltr">${item.translit}</p>`}
  </div>`;
}
function ItemBody({ item }) {
  const dvShown = isDv() && item.body_dv;
  return html`
    <${Recitation} item=${item} big />
    <div class="toolbar"><${ListenButton} item=${item} />${item.kind === 'dua' && html`<a class="btn" href=${`#/count/${item.id}`}><${Icon} name="count" /> ${t('count')}</a>`}</div>
    <div class=${dvShown ? 'dv' : ''}><${Markdown} text=${dvShown ? item.body_dv : item.body_en} /></div>
    ${item.ref && html`<p class="ref muted" dir="ltr">${t('source')}: ${item.ref}</p>`}
    ${dvShown && !item.dv_reviewed ? html`<p class="notice">${t('dvUnreviewed')}</p>` : null}`;
}
function SectionPage({ boot, id }) {
  const sec = boot.sections.find((x) => x.id === id);
  const d = useData(() => sectionItems(id), [id, boot.rev]);
  useEffect(() => scrollTo(0, 0), [id]);
  if (!sec) return html`<div class="page"><p class="status">${t('noResults')}</p></div>`;
  const backHref = sec.area === 'prayer' ? '#/prayer' : sec.area === 'duas' ? '#/duas' : sec.area === 'arabic' ? '#/arabic/lessons' : `#/explore/${groupOf(sec)}`;
  return html`<div class="page">
    <a class="backlink" href=${backHref}><${Icon} name="back" /> ${t(sec.area === 'prayer' ? 'prayer' : sec.area === 'duas' ? 'duas' : groupOf(sec))}</a>
    <h1>${pick(sec, 'title')}</h1>
    ${pick(sec, 'summary') && html`<p class="lede">${pick(sec, 'summary')}</p>`}
    <${Wait} s=${d}>${(items) => {
      const kind = items[0]?.kind;
      if (kind === 'step') return html`<ol class="steps">${items.map((it, i) => html`<li id=${it.id}>
        <p class="stepno muted">${t('step')} <span class="num">${i + 1}</span> ${t('of')} <span class="num">${items.length}</span></p>
        <h2>${pick(it, 'title')}</h2><${StepFigure} id=${it.id} />${it.id === 'salah-02-takbir' && html`<h3 class="picker-title">${t('chooseNiyyah')}</h3><${PrayerPicker} />`}<${ItemBody} item=${it} /></li>`)}</ol>`;
      if (kind === 'dua') return html`${items.filter((x) => x.arabic).length > 1 && html`<a class="btn primary guide-start" href=${`#/guide/sec:${id}`}><${Icon} name="count" /> ${t('oneByOne')}</a>`}<ul class="duas">${items.map((it) => html`<li id=${it.id}><h2>${pick(it, 'title')}</h2><${ItemBody} item=${it} /></li>`)}</ul>`;
      return html`<ul class="seclist">${items.map((it) => html`<li><a href=${`#/i/${it.id}`}><strong>${pick(it, 'title')}</strong></a></li>`)}</ul>`;
    }}<//>
  </div>`;
}
function ItemPage({ boot, id }) {
  const meta = boot.items.find((x) => x.id === id);
  const d = useData(() => (meta ? sectionItems(meta.section_id) : Promise.resolve([])), [id, boot.rev]);
  useEffect(() => scrollTo(0, 0), [id]);
  if (!meta) return html`<div class="page"><p class="status">${t('noResults')}</p></div>`;
  const sec = boot.sections.find((x) => x.id === meta.section_id);
  return html`<div class=${'page article' + (meta.section_id.startsWith('kids') ? ' kids-read' : '')}>
    <a class="backlink" href=${`#/s/${meta.section_id}`}><${Icon} name="back" /> ${sec ? pick(sec, 'title') : t('back')}</a>
    <${Wait} s=${d}>${(items) => {
      const i = items.findIndex((x) => x.id === id), it = items[i];
      if (!it) return html`<p class="status">${t('noResults')}</p>`;
      return html`<article><h1>${pick(it, 'title')}</h1><${StepFigure} id=${it.id} /><${ItemBody} item=${it} />
        <nav class="pager">
          ${items[i - 1] ? html`<a class="btn" href=${`#/i/${items[i - 1].id}`}><${Icon} name="back" /> ${pick(items[i - 1], 'title')}</a>` : html`<span></span>`}
          ${items[i + 1] && html`<a class="btn" href=${`#/i/${items[i + 1].id}`}>${pick(items[i + 1], 'title')} <${Icon} name="next" /></a>`}
        </nav></article>`;
    }}<//>
  </div>`;
}

function SearchPage({ boot }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const idx = useData(() => getJSON('/quran/index.json'), []);
  useEffect(() => {
    if (q.trim().length < 2) { setRes(null); return; }
    const id = setTimeout(() => api('/search?q=' + encodeURIComponent(q.trim())).then((r) => setRes(r.items), () => {
      const n = q.trim().toLowerCase(); // offline: fall back to titles already on the device
      setRes(boot.items.filter((i) => i.title_en.toLowerCase().includes(n) || i.title_dv.includes(q.trim())).slice(0, 40));
    }), 250);
    return () => clearTimeout(id);
  }, [q]);
  const needle = q.trim().toLowerCase().replace(/[-' ]/g, '');
  const surahs = needle.length >= 2 && idx.data ? idx.data.surahs.filter((x) => String(x.n) === needle || x.name.toLowerCase().replace(/[-' ]/g, '').includes(needle) || x.en.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const m = /^(\d{1,3})[:.\s](\d{1,3})$/.exec(q.trim());
  return html`<div class="page">
    <h1>${t('search')}</h1>
    <input class="field" type="search" autofocus placeholder=${t('searchHint')} aria-label=${t('searchHint')} value=${q} onInput=${(e) => setQ(e.target.value)} />
    <ul class="seclist">
      ${m && +m[1] >= 1 && +m[1] <= 114 && html`<li><a href=${`#/quran/${m[1]}/${m[2]}`}><strong>${t('quran')} <span class="num">${m[1]}:${m[2]}</span></strong></a></li>`}
      ${surahs.map((x) => html`<li><a href=${`#/quran/${x.n}`}><strong>${x.name}</strong><span class="muted">${t('quran')}, ${x.count} ${t('ayahs')}</span></a></li>`)}
      ${(res || []).map((it) => { const sec = boot.sections.find((x) => x.id === it.section_id); return html`<li><a href=${it.kind === 'article' ? `#/i/${it.id}` : `#/s/${it.section_id}`}><strong>${pick(it, 'title')}</strong><span class="muted">${sec ? pick(sec, 'title') : ''}</span></a></li>`; })}
    </ul>
    ${res && !res.length && !surahs.length && !m && html`<p class="status">${t('noResults')}</p>`}
  </div>`;
}

// ---------- mushaf: the Quran as a book, Arabic only ----------
const arNum = (n) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
const pageData = (p) => getJSON(`/quran/page/${p}.json`);
function MushafPage({ p, surahs, side }) {
  const d = useData(() => pageData(p), [p]);
  const a = useAudio();
  if (!d.data) return html`<div class="leaf ${side}" aria-busy="true"></div>`;
  const pg = d.data;
  const queue = pg.ayahs.map(([s, n]) => ({ url: ayahUrl(s, n), key: `q:${s}:${n}`, s, a: n, label: `${surahs[s - 1].name} ${s}:${n}` }));
  const parts = [];
  let run = [];
  const flush = () => { if (run.length) { parts.push(html`<p class="mtext" lang="ar" dir="rtl">${run}</p>`); run = []; } };
  pg.ayahs.forEach(([s, n, text], i) => {
    if (n === 1) {
      flush();
      parts.push(html`<div class="surah-banner"><i aria-hidden="true"></i><span>سُورَةُ ${surahs[s - 1].ar}</span><i aria-hidden="true"></i></div>`);
      if (s !== 1 && s !== 9) parts.push(html`<p class="mbasmala" lang="ar" dir="rtl">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</p>`);
    }
    const on = a.current?.key === `q:${s}:${n}`;
    run.push(html`<span class="mayah ${on ? 'is-playing' : ''}" role="button" tabindex="0" aria-label=${`${surahs[s - 1].name} ${s}:${n}`}
      onClick=${() => (on ? toggleAudio() : playQueue(queue, i))} onKeyDown=${(e) => e.key === 'Enter' && playQueue(queue, i)}>${text}<span class="mend">${'۝' + arNum(n)}</span> </span>`);
  });
  flush();
  const first = pg.ayahs[0][0];
  return html`<div class="leaf ${side}">
    <div class="leaf-frame">
      <div class="leaf-head"><span lang="ar">سُورَةُ ${surahs[first - 1].ar}</span><i class="lh-star" aria-hidden="true"></i><span lang="ar">الجزء ${arNum(pg.juz)}</span></div>
      <div class="leaf-body ${pg.ayahs.length < 9 && p < 3 ? 'is-opening' : ''}">${parts}</div>
      <div class="leaf-foot num"><span>${arNum(p)}</span></div>
    </div>
  </div>`;
}
// ---------- paper fold: drag a page of the mushaf and it folds over like paper ----------
function clipHalf(W, H, M, n, keep) {
  const pts = [[0, 0], [W, 0], [W, H], [0, H]], out = [];
  const side = (q) => ((q[0] - M[0]) * n[0] + (q[1] - M[1]) * n[1]) * keep;
  for (let i = 0; i < 4; i++) {
    const a = pts[i], b = pts[(i + 1) % 4], sa = side(a), sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0) !== (sb >= 0)) { const k = sa / (sa - sb); out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]); }
  }
  return out;
}
const polyCss = (pts) => (pts.length < 3 ? 'polygon(0 0, 0 0, 0 0)' : 'polygon(' + pts.map((q) => q[0].toFixed(1) + 'px ' + q[1].toFixed(1) + 'px').join(',') + ')');
function attachFold(el, api) {
  const top = el.querySelector('.fold-top'), flap = el.querySelector('.fold-flap'), shade = el.querySelector('.fold-shade');
  const shFlap = shade.querySelector('.sh-flap'), shUnder = shade.querySelector('.sh-under');
  const under = { next: el.querySelector('.under-next'), prev: el.querySelector('.under-prev') };
  let st = null, raf = 0, dragged = false;
  const reset = () => { top.style.clipPath = ''; flap.style.display = 'none'; shade.style.display = 'none'; for (const u of Object.values(under)) if (u) u.style.visibility = 'hidden'; el.classList.remove('is-folding'); };
  // Keep the lifted corner where real paper could reach: no further from the spine than the page is wide.
  const clampP = (P) => {
    const { W, H, C, dir } = st, sx = dir === 'next' ? W : 0;
    let q = P;
    for (const [hx, hy, max] of [[sx, C[1], W], [sx, H - C[1], Math.hypot(W, H)]]) { const d = Math.hypot(q[0] - hx, q[1] - hy); if (d > max) q = [hx + ((q[0] - hx) * max) / d, hy + ((q[1] - hy) * max) / d]; }
    return q;
  };
  const apply = (P) => {
    const { W, H, C } = st, dx = P[0] - C[0], dy = P[1] - C[1], len = Math.hypot(dx, dy);
    if (len < 1.5) { top.style.clipPath = ''; flap.style.clipPath = polyCss([]); shade.style.opacity = 0; return; }
    const n = [dx / len, dy / len], M = [(C[0] + P[0]) / 2, (C[1] + P[1]) / 2], mn = M[0] * n[0] + M[1] * n[1];
    top.style.clipPath = polyCss(clipHalf(W, H, M, n, 1)); // what is still lying flat
    flap.style.clipPath = polyCss(clipHalf(W, H, M, n, -1)); // the part that has lifted...
    flap.style.transform = `matrix(${1 - 2 * n[0] * n[0]},${-2 * n[0] * n[1]},${-2 * n[0] * n[1]},${1 - 2 * n[1] * n[1]},${2 * mn * n[0]},${2 * mn * n[1]})`; // ...mirrored across the crease
    shade.style.opacity = 1;
    shade.style.transform = `translate(${M[0].toFixed(1)}px,${M[1].toFixed(1)}px) rotate(${Math.atan2(n[1], n[0]).toFixed(4)}rad)`;
    shFlap.style.width = Math.min(44, len / 2).toFixed(1) + 'px';
    shUnder.style.width = Math.min(60, len / 2 + 8).toFixed(1) + 'px';
  };
  const down = (e) => {
    if (st && st.anim) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const r = el.getBoundingClientRect();
    st = { tgt: e.target, x0: e.clientX, y0: e.clientY, r, W: r.width, H: r.height, active: false, id: e.pointerId, vx: 0, lx: e.clientX, lt: performance.now() };
    dragged = false;
  };
  const move = (e) => {
    if (!st || st.anim || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.active) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      const dir = dx > 0 ? 'next' : 'prev'; // as in an Arabic book: pull the left edge to the right to go on
      if (!under[dir]) { st = null; return; }
      st.active = true; st.dir = dir; dragged = true;
      st.C = [dir === 'next' ? 0 : st.W, st.y0 - st.r.top > st.H / 2 ? st.H : 0]; // the corner nearest the finger lifts
      under[dir].style.visibility = 'visible'; flap.style.display = 'block'; shade.style.display = 'block'; el.classList.add('is-folding');
      try { el.setPointerCapture(e.pointerId); } catch {}
    }
    const now = performance.now(), sgn = st.dir === 'next' ? 1 : -1;
    if (now > st.lt) st.vx = (e.clientX - st.lx) / (now - st.lt);
    st.lx = e.clientX; st.lt = now;
    st.P = clampP([st.C[0] + Math.max(0, sgn * dx) * 2 * sgn, st.C[1] + dy * 0.75]);
    apply(st.P);
    if (e.cancelable) e.preventDefault();
  };
  const up = (e) => {
    if (!st || st.anim) return;
    if (!st.active) { // a plain tap: in full screen, the page edges turn the page
      const moved = Math.hypot(e.clientX - st.x0, e.clientY - st.y0), f = (e.clientX - st.r.left) / st.W;
      const tg0 = st.tgt; st = null;
      const tg = tg0, onText = tg && tg.closest && tg.closest('.mayah, button, a'); // a tap on an ayah plays it, it never turns the page
      if (moved < 8 && !onText && api.focus() && e.type === 'pointerup' && matchMedia('(prefers-reduced-motion: reduce)').matches) // edge taps only where the fold animation is switched off { if (f < 0.1) api.next(); else if (f > 0.9) api.prev(); }
      return;
    }
    const sgn = st.dir === 'next' ? 1 : -1;
    const done = e.type === 'pointerup' && (Math.abs(st.P[0] - st.C[0]) / (2 * st.W) > 0.26 || st.vx * sgn > 0.5);
    const from = st.P, to = done ? [st.dir === 'next' ? 2 * st.W : -st.W, st.C[1]] : st.C, t0 = performance.now(), D = done ? 300 : 220;
    st.anim = true;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / D), q = 1 - Math.pow(1 - k, 3);
      apply(clampP([from[0] + (to[0] - from[0]) * q, from[1] + (to[1] - from[1]) * q]));
      if (k < 1) { raf = requestAnimationFrame(step); return; }
      const dir = st.dir; st = null;
      if (done) (dir === 'next' ? api.next : api.prev)(true); else reset();
    };
    raf = requestAnimationFrame(step);
  };
  const edge = (e) => { const x = e.touches[0] ? e.touches[0].clientX : 99; if ((x < 30 || x > innerWidth - 30) && e.cancelable) e.preventDefault(); };
  el.addEventListener('touchstart', edge, { passive: false });
  const click = (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } };
  el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move, { passive: false });
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('click', click, true);
  return () => { cancelAnimationFrame(raf); el.removeEventListener('touchstart', edge); el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); el.removeEventListener('click', click, true); };
}
function Mushaf({ page }) {
  const idx = useData(() => getJSON('/quran/index.json'), []);
  const [wide, setWide] = useState(matchMedia('(min-width: 900px)').matches);
  const [dir, setDir] = useState('');
  const touch = useRef(null);
  const [pick, setPick] = useState(false);
  const [sq, setSq] = useState('');
  const [focus, setFocus] = useState(false);
  // Full screen: hide everything except the page. Uses the browser's full-screen mode where it exists.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('focus', focus);
    if (focus) root.requestFullscreen?.().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen?.();
    const f = () => { if (!document.fullscreenElement && document.fullscreenEnabled) setFocus(false); };
    document.addEventListener('fullscreenchange', f);
    return () => { document.removeEventListener('fullscreenchange', f); root.classList.remove('focus'); };
  }, [focus]);
  useEffect(() => { const m = matchMedia('(min-width: 900px)'); const f = () => setWide(m.matches); m.addEventListener('change', f); return () => m.removeEventListener('change', f); }, []);
  const p = Math.min(604, Math.max(1, page || getSettings().mpage || 1));
  // A spread is an odd page on the right and the next even page on the left, as in a printed mushaf.
  const right = wide ? (p % 2 ? p : p - 1) : p;
  const go = (to, d) => { const n = Math.min(604, Math.max(1, to)); if (n === p) return; setDir(d); location.hash = `#/mushaf/${n}`; };
  const markRead = (pages) => setSettings({ pagesRead: [...new Set([...(getSettings().pagesRead || []), ...pages.filter((x) => x >= 1 && x <= 604)])].sort((x, y) => x - y) });
  const next = (quiet) => { markRead(wide ? [right, right + 1] : [right]); go(right + (wide ? 2 : 1), quiet === true ? 'none' : 'next'); }; // turning forward counts the page as read
  const prev = (quiet) => go(right - (wide ? 2 : 1), quiet === true ? 'none' : 'prev');
  const bookRef = useRef(null), turn = useRef({});
  turn.current = { next, prev, focus: () => focus };
  // On one-page screens the page can be dragged and folds over like paper.
  useEffect(() => {
    if (wide || !bookRef.current || !bookRef.current.querySelector('.fold-top')) return;
    return attachFold(bookRef.current, { next: (q) => turn.current.next(q), prev: (q) => turn.current.prev(q), focus: () => turn.current.focus() });
  }, [right, wide, !!idx.data]);
  useEffect(() => { setSettings({ mpage: p }); scrollTo(0, 0); [p + 1, p + 2, p - 1].forEach((n) => n >= 1 && n <= 604 && pageData(n).catch(() => {})); }, [p]);
  useEffect(() => {
    const f = (e) => { if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return; if (e.key === 'ArrowLeft') next(); if (e.key === 'ArrowRight') prev(); if (e.key === 'f') setFocus((v) => !v); if (e.key === 'Escape') setFocus(false); };
    addEventListener('keydown', f); return () => removeEventListener('keydown', f);
  });
  if (!idx.data) return html`<div class="page"><p class="status" role="status">${t('loading')}…</p></div>`;
  const surahs = idx.data.surahs;
  const onStart = (e) => { touch.current = [e.touches[0].clientX, e.touches[0].clientY]; };
  const onEnd = (e) => {
    if (!touch.current) return;
    const dx = e.changedTouches[0].clientX - touch.current[0], dy = e.changedTouches[0].clientY - touch.current[1];
    touch.current = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx > 0 ? next : prev)(); // swipe right turns forward, as in an Arabic book
  };
  return html`<div class="mushaf" dir="ltr">
    <div class="mushaf-bar">
      <a class="backlink" href="#/quran"><${Icon} name="back" /> ${t('quran')}</a>
      <button class="btn" aria-expanded=${pick} onClick=${() => setPick(!pick)}><${Icon} name="quran" /> ${t('openSurah')}</button>
      <button class="btn" onClick=${() => setFocus(true)}><${Icon} name="full" /> ${t('fullScreen')}</button>
      <label class="pagejump">${t('pageWord')}<input type="number" min="1" max="604" value=${p} onChange=${(e) => go(+e.target.value || p, 'next')} /></label>
    </div>
    ${pick && html`<div class="island-panel surah-panel">
      <input class="field" type="search" autofocus placeholder=${t('findSurah')} value=${sq} onInput=${(e) => setSq(e.target.value)} />
      <div class="island-list"><ol class="surahs">${surahs.filter((x) => { const n = sq.trim().toLowerCase().replace(/[-' ]/g, ''); return !n || String(x.n) === n || x.name.toLowerCase().replace(/[-' ]/g, '').includes(n) || x.en.toLowerCase().includes(sq.trim().toLowerCase()); }).map((x) => html`<li><a href=${`#/mushaf/${x.page}`} onClick=${() => { setPick(false); setSq(''); setDir('next'); }}>
        <span class="sn num">${x.n}</span><span class="smain"><strong>${x.name}</strong><span class="muted">${t('pageWord')} ${x.page}, ${x.count} ${t('ayahs')}</span></span><span class="sar" lang="ar" dir="rtl">${x.ar}</span></a></li>`)}</ol></div>
    </div>`}
    ${focus && html`<button class="focus-exit" onClick=${() => setFocus(false)} aria-label=${t('exitFull')}><${Icon} name="close" /></button>
      ${wide && html`<button class="turn-zone left" onClick=${next} aria-label=${t('nextPage')}></button><button class="turn-zone right" onClick=${prev} aria-label=${t('prevPage')}></button>`}`}
    ${wide ? html`<div class="book is-spread turn-${dir}" key=${right} onTouchStart=${onStart} onTouchEnd=${onEnd}>
      ${right + 1 <= 604 && html`<${MushafPage} p=${right + 1} surahs=${surahs} side="left" />`}
      <${MushafPage} p=${right} surahs=${surahs} side="right" />
    </div>` : html`<div class="book single turn-${dir}" key=${right} ref=${bookRef}>
      ${right + 1 <= 604 && html`<div class="under under-next" aria-hidden="true"><${MushafPage} p=${right + 1} surahs=${surahs} side="right" /></div>`}
      ${right - 1 >= 1 && html`<div class="under under-prev" aria-hidden="true"><${MushafPage} p=${right - 1} surahs=${surahs} side="right" /></div>`}
      <div class="fold-top"><${MushafPage} p=${right} surahs=${surahs} side="right" /></div>
      <div class="fold-flap" aria-hidden="true"></div>
      <div class="fold-shade" aria-hidden="true"><i class="sh-under"></i><i class="sh-flap"></i></div>
    </div>`}
    <div class="mushaf-nav">
      <button class="btn" onClick=${next} disabled=${right + (wide ? 1 : 0) >= 604}><${Icon} name="back" /> ${t('nextPage')}</button>
      <span class="muted">${wide ? t('tapAyah') : t('foldHint')}</span>
      <button class="btn" onClick=${prev} disabled=${right <= 1}>${t('prevPage')} <${Icon} name="next" /></button>
    </div>
  </div>`;
}

// ---------- dhikr counter ----------
function CounterPage({ boot, id }) {
  const s = useSettings();
  const meta = boot.items.find((x) => x.id === id);
  const d = useData(() => (meta ? sectionItems(meta.section_id) : Promise.resolve([])), [id]);
  const [bump, setBump] = useState(0);
  if (!meta) return html`<div class="page"><p class="status">${t('noResults')}</p></div>`;
  const day = todayKey();
  const c = (s.counts || {})[id] || {};
  const today = c.d === day ? c.c || 0 : 0;
  const save = (next) => setSettings({ counts: { ...(getSettings().counts || {}), [id]: { ...c, ...next } } });
  const tap = () => {
    const n = today + 1;
    save({ n: (c.n || 0) + 1, d: day, c: n });
    setBump(bump + 1);
    if (navigator.vibrate) navigator.vibrate(c.t && n === c.t ? [60, 60, 160] : 12);
  };
  const item = (d.data || []).find((x) => x.id === id) || meta;
  const pct = c.t ? Math.min(1, today / c.t) : 0;
  return html`<div class="page counter">
    <a class="backlink" href=${`#/s/${meta.section_id}`}><${Icon} name="back" /> ${t('back')}</a>
    <h1>${pick(item, 'title')}</h1>
    ${item.arabic && html`<p class="ar counter-ar" lang="ar" dir="rtl">${item.arabic}</p>`}
    ${item.translit && html`<p class="translit" dir="ltr">${item.translit}</p>`}
    <div class="tapwrap"><${Beads} c=${today} n=${c.t || 33} /><button class="tapper ${c.t && today >= c.t ? 'is-done' : ''}" onClick=${tap} aria-label=${t('count')} style=${{ '--pct': pct }}>
      <span class="tap-num num" key=${bump}>${today}</span>
      <span class="tap-hint">${c.t ? (today >= c.t ? t('reached') : `${t('target')} ${c.t}`) : t('tapToCount')}</span>
    </button></div>
    <div class="row"><span>${t('target')}</span><span class="chips">${[0, 3, 7, 33, 100, 1000].map((n) => html`<button class="chip" aria-pressed=${(c.t || 0) === n} onClick=${() => save({ t: n })}>${n || t('noTarget')}</button>`)}</span></div>
    <div class="row"><span>${t('todayWord')}: <strong class="num">${today}</strong></span><span>${t('totalWord')}: <strong class="num">${c.n || 0}</strong></span></div>
    <button class="btn" onClick=${() => save({ n: Math.max(0, (c.n || 0) - today), c: 0, d: day })}>${t('resetToday')}</button>
  </div>`;
}

// ---------- account ----------
function AccountBox() {
  const s = useSettings();
  const [f, setF] = useState({ username: '', password: '' });
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const user = getUser();
  const go = (mode) => async (e) => {
    e.preventDefault(); setBusy(true); setMsg('');
    try { await accountAuth(mode, f.username, f.password); setF({ username: '', password: '' }); } catch (x) { setMsg(x.message); }
    setBusy(false);
  };
  if (user) return html`<section class="block account"><h2>${t('account')}</h2>
    <div class="row"><span>${t('signedInAs')} <strong dir="ltr">${user}</strong></span><button class="btn" onClick=${accountLogout}>${t('signOut')}</button></div>
    <p class="muted"><span class="num">${(s.pagesRead || []).length}</span> / 604 ${t('pagesRead')}, <span class="num">${Object.values(s.counts || {}).reduce((n, c) => n + (c.n || 0), 0)}</span> ${t('count')}</p>
  </section>`;
  return html`<section class="block account"><h2>${t('account')}</h2>
    <p class="muted">${t('accountHint')}</p>
    <form class="form" onSubmit=${go('login')}>
      <label>${t('username')}<input class="field" dir="ltr" autocomplete="username" value=${f.username} onInput=${(e) => setF({ ...f, username: e.target.value })} required /></label>
      <label>${t('password')}<input class="field" dir="ltr" type="password" autocomplete="current-password" value=${f.password} onInput=${(e) => setF({ ...f, password: e.target.value })} required minlength="8" /></label>
      ${msg && html`<p class="notice" role="alert">${msg}</p>`}
      <div class="toolbar"><button class="btn primary" disabled=${busy}>${t('signIn')}</button><button type="button" class="btn" disabled=${busy} onClick=${go('register')}>${t('createAccount')}</button></div>
      <p class="muted">${t('noReset')}</p>
    </form>
  </section>`;
}

// ---------- settings ----------
// Folder names on everyayah.com. If one fails to load, playback falls back to Alafasy (see the audio error handler).
const RECITERS = [
  ['Imams of the two Holy Mosques', 'ދެ ޙަރަމްފުޅުގެ އިމާމުން', [['Abdurrahmaan_As-Sudais_192kbps', 'Abdurrahman As-Sudais'], ['Saood_ash-Shuraym_128kbps', 'Saud Ash-Shuraim'], ['Maher_AlMuaiqly_64kbps', 'Maher Al-Muaiqly'], ['Yasser_Ad-Dussary_128kbps', 'Yasser Ad-Dossari'], ['Abdullaah_3awwaad_Al-Juhaynee_128kbps', 'Abdullah Al-Juhany'], ['Hudhaify_128kbps', 'Ali Al-Hudhaify'], ['Salah_Al_Budair_128kbps', 'Salah Al-Budair'], ['Muhammad_Ayyoub_128kbps', 'Muhammad Ayyub'], ['Ali_Jaber_64kbps', 'Ali Jaber']]],
  ['Well-known reciters', 'މަޝްހޫރު ޤާރީން', [['Alafasy_128kbps', 'Mishary Alafasy'], ['Ghamadi_40kbps', "Sa'd Al-Ghamdi"], ['Abu_Bakr_Ash-Shaatree_128kbps', 'Abu Bakr Ash-Shatri'], ['Nasser_Alqatami_128kbps', 'Nasser Al-Qatami'], ['Ahmed_ibn_Ali_al-Ajamy_128kbps_ketaballah.net', 'Ahmad Al-Ajmi'], ['Hani_Rifai_192kbps', 'Hani Ar-Rifai'], ['Fares_Abbad_64kbps', 'Fares Abbad'], ['Abdullah_Basfar_64kbps', 'Abdullah Basfar'], ['Muhammad_Jibreel_128kbps', 'Muhammad Jibreel'], ['Salaah_AbdulRahman_Bukhatir_128kbps', 'Salah Bukhatir'], ['Khaalid_Abdullaah_al-Qahtaanee_192kbps', 'Khalid Al-Qahtani']]],
  ['Classic Egyptian masters', 'މިޞްރުގެ ކުރީގެ ޤާރީން', [['Husary_64kbps', 'Mahmoud Khalil Al-Husary'], ['Husary_Muallim_128kbps', 'Al-Husary (teaching, slow)'], ['Abdul_Basit_Murattal_64kbps', 'Abdul Basit (Murattal)'], ['Abdul_Basit_Mujawwad_128kbps', 'Abdul Basit (Mujawwad)'], ['Minshawy_Murattal_128kbps', 'Al-Minshawi (Murattal)'], ['Minshawy_Mujawwad_192kbps', 'Al-Minshawi (Mujawwad)'], ['Mohammad_al_Tablaway_128kbps', 'Muhammad At-Tablawi'], ['Ayman_Sowaid_64kbps', 'Ayman Suwaid']]],
];
const reciterName = (id) => { for (const g of RECITERS) for (const r of g[2]) if (r[0] === id) return r[1]; return id; };
function ReciterPicker() {
  const s = useSettings();
  const [open, setOpen] = useState(false);
  return html`<div class="islandpick">
    <div class="row"><span>${t('reciter')}</span><button class="btn" aria-expanded=${open} onClick=${() => setOpen(!open)}>${reciterName(s.reciter)} <${Icon} name=${open ? 'close' : 'next'} /></button></div>
    ${open && html`<div class="island-panel"><div class="island-list">
      ${RECITERS.map(([en, dv, list]) => html`<section><h3>${isDv() ? dv : en}</h3><div class="chips wrap">${list.map(([id, name]) => html`<button class="chip" aria-pressed=${s.reciter === id} onClick=${() => { setSettings({ reciter: id }); playQueue([{ url: ayahUrl(1, 2, id), key: 'sample', label: name }]); }}>${name}</button>`)}</div></section>`)}
      <p class="muted">${t('reciterHint')}</p>
    </div></div>`}
  </div>`;
}
const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
async function pushSubscription() { const reg = await navigator.serviceWorker.ready; return reg.pushManager.getSubscription(); }
async function syncPush(s) {
  const sub = await pushSubscription();
  if (sub && s.notif.on) await api('/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint, island: s.island, prayers: s.notif.prayers, lead: s.notif.lead }) });
}
function Notifications() {
  const s = useSettings();
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches;
  const save = (notif) => { const next = { ...getSettings(), notif: { ...s.notif, ...notif } }; setSettings({ notif: next.notif }); syncPush(next).catch((e) => setMsg(e.message)); };
  const turnOn = async () => {
    setBusy(true); setMsg('');
    try {
      if ((await Notification.requestPermission()) !== 'granted') throw new Error(t('notifBlocked'));
      const { key } = await api('/push/key');
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
      await api('/push/subscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint, island: s.island, prayers: s.notif.prayers, lead: s.notif.lead }) });
      setSettings({ notif: { ...s.notif, on: true } });
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  const turnOff = async () => {
    setBusy(true);
    try { const sub = await pushSubscription(); if (sub) { await api('/push/unsubscribe', { method: 'POST', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => {}); await sub.unsubscribe(); } } catch {}
    setSettings({ notif: { ...s.notif, on: false } }); setBusy(false);
  };
  if (!supported || ios) return html`<p class="notice">${t('notifIos')}</p>`;
  return html`<div class="notif-box">
    ${s.notif.on && html`<p class="notif-on"><${Icon} name="check" /> ${t('notifOn')}</p>`}
    <button class="btn ${s.notif.on ? '' : 'primary'}" disabled=${busy} onClick=${s.notif.on ? turnOff : turnOn}>${s.notif.on ? t('turnOff') : t('turnOn')}</button>
    ${msg && html`<p class="notice" role="alert">${msg}</p>`}
    ${s.notif.on && html`<div class="chips wrap" role="group">
      ${[0, 1, 2, 3, 4].map((p) => html`<button class="chip" aria-pressed=${!!(s.notif.prayers & (1 << p))} onClick=${() => save({ prayers: s.notif.prayers ^ (1 << p) })}>${t(['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'][p])}</button>`)}
    </div>
    <label class="row">${t('notifyBefore')}
      <select value=${s.notif.lead} onChange=${(e) => save({ lead: +e.target.value })}>
        <option value="0">${t('atTime')}</option>${[5, 10, 15].map((m) => html`<option value=${m}>${m} ${t('minBefore')}</option>`)}
      </select></label>`}
  </div>`;
}
// Island chooser: search by island or atoll, grouped north to south.
const ATOLLS = [['HA', 'Haa Alif', 'ހއ'], ['HDh', 'Haa Dhaalu', 'ހދ'], ['Sh', 'Shaviyani', 'ށ'], ['N', 'Noonu', 'ނ'], ['R', 'Raa', 'ރ'], ['B', 'Baa', 'ބ'], ['Lh', 'Lhaviyani', 'ޅ'], ['K', 'Kaafu', 'ކ'], ['AA', 'Alif Alif', 'އއ'], ['ADh', 'Alif Dhaalu', 'އދ'], ['V', 'Vaavu', 'ވ'], ['M', 'Meemu', 'މ'], ['F', 'Faafu', 'ފ'], ['Dh', 'Dhaalu', 'ދ'], ['Th', 'Thaa', 'ތ'], ['L', 'Laamu', 'ލ'], ['GA', 'Gaafu Alif', 'ގއ'], ['GDh', 'Gaafu Dhaalu', 'ގދ'], ['Gn', 'Gnaviyani', 'ޏ'], ['S', 'Seenu (Addu)', 'ސ']];
function IslandPicker({ islands, value, onPick }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const cur = islands.find((i) => i.id === value);
  const needle = q.trim().toLowerCase();
  const known = ATOLLS.map((a) => a[0]);
  const codes = [...ATOLLS, ...[...new Set(islands.map((i) => i.a))].filter((c) => !known.includes(c)).map((c) => [c, c, c])];
  const groups = codes.map(([code, name, dv]) => ({ code, name, dv, list: islands.filter((i) => i.a === code && (!needle || i.n.toLowerCase().includes(needle) || name.toLowerCase().includes(needle) || code.toLowerCase() === needle)).sort((a, b) => a.n.localeCompare(b.n)) })).filter((g) => g.list.length);
  return html`<div class="islandpick">
    <div class="row"><span>${t('island')}</span><button class="btn" aria-expanded=${open} onClick=${() => setOpen(!open)}>${cur ? `${cur.a}. ${cur.n}` : '…'} <${Icon} name=${open ? 'close' : 'next'} /></button></div>
    ${open && html`<div class="island-panel">
      <input class="field" type="search" autofocus placeholder=${t('findIsland')} aria-label=${t('findIsland')} value=${q} onInput=${(e) => setQ(e.target.value)} />
      <div class="island-list">
        ${groups.map((g) => html`<section><h3>${isDv() ? g.dv + '. ' : ''}${g.name} <span class="muted num">${g.list.length}</span></h3>
          <div class="chips wrap">${g.list.map((i) => html`<button class="chip" aria-pressed=${i.id === value} onClick=${() => { onPick(i.id); setOpen(false); setQ(''); }}>${i.n}</button>`)}</div></section>`)}
        ${!groups.length && html`<p class="status">${t('noResults')}</p>`}
      </div>
    </div>`}
  </div>`;
}
function FullOffline() {
  const s = useSettings();
  const idx = useData(() => getJSON('/quran/index.json'), []);
  const [used, setUsed] = useState(null);
  const refresh = () => navigator.storage?.estimate?.().then((e) => setUsed(e.usage)).catch(() => {});
  useEffect(() => { refresh(); }, []);
  if (!idx.data) return null;
  const all = [];
  for (const su of idx.data.surahs) for (let a = 1; a <= su.count; a++) all.push([su.n, a]);
  const wipe = async () => { if (confirm(t('deleteAudioAsk'))) { await caches.delete('dheen-audio'); refresh(); location.reload(); } };
  return html`<div class="fulloffline">
    <p><strong>${t('offlineAudio')}</strong> <span class="muted">${reciterName(s.reciter)}</span></p>
    <p class="muted">${t('offlineAudioHint')}</p>
    <div class="toolbar"><${OfflineAudio} list=${all} label=${t('downloadQuran')} /><button class="btn danger" onClick=${wipe}>${t('deleteAudio')}</button></div>
    ${used != null && html`<p class="muted">${t('storageUsed')}: <span class="num">${(used / 1048576).toFixed(0)} MB</span></p>`}
  </div>`;
}
let installEvt = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; dispatchEvent(new Event('dheen-installable')); });
function SettingsPage() {
  const s = useSettings();
  const pd = useData(prayerData, []);
  const [dl, setDl] = useState(null);
  const [canInstall, setCanInstall] = useState(!!installEvt);
  useEffect(() => { if (location.hash.endsWith('/notifications')) setTimeout(() => document.getElementById('notifications')?.scrollIntoView({ block: 'center' }), 400); }, []);
  useEffect(() => { const f = () => setCanInstall(true); addEventListener('dheen-installable', f); return () => removeEventListener('dheen-installable', f); }, []);
  const download = async () => {
    for (let n = 1; n <= 114; n++) { await fetch(`/quran/${n}.json`).catch(() => {}); setDl(n); }
    setDl('done');
  };
  const seg = (key, opts) => html`<span class="chips" role="group">${opts.map(([v, l]) => html`<button class="chip" aria-pressed=${s[key] === v} onClick=${() => setSettings({ [key]: v })}>${l}</button>`)}</span>`;
  return html`<div class="page settings">
    <h1>${t('settings')}</h1>
    <section class="set-card">
      <div class="row"><span>${t('language')}</span>${seg('lang', [['en', 'English'], ['dv', 'ދިވެހި']])}</div>
      <div class="row"><span>${t('theme')}</span>${seg('theme', [['auto', t('auto')], ['light', t('light')], ['dark', t('dark')]])}</div>
      <${IslandPicker} islands=${pd.data?.islands || []} value=${s.island} onPick=${(id) => { setSettings({ island: id }); syncPush(getSettings()).catch(() => {}); }} />
    </section>
    <section class="set-card" id="notifications"><h2><${Icon} name="bell" /> ${t('notifications')}</h2><${Notifications} /></section>
    <section class="set-card"><h2><${Icon} name="quran" /> ${t('quran')}</h2>
      <${ReciterPicker} />
      <label class="row"><span>${t('arabicSize')}</span><input type="range" min="22" max="44" step="2" value=${s.arSize} onInput=${(e) => setSettings({ arSize: +e.target.value })} /></label>
      <p class="ar sample" lang="ar" dir="rtl" style=${{ fontSize: s.arSize + 'px' }}>ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ</p>
      <div class="row"><span>${t('offline')}</span>
        ${dl === 'done' ? html`<span class="muted">${t('downloaded')}</span>` : html`<button class="btn" disabled=${dl !== null} onClick=${download}>${dl ? `${dl} / 114` : t('download')}</button>`}</div>
      <${FullOffline} />
    </section>
    <${AccountBox} />
    ${canInstall && html`<button class="btn primary" onClick=${() => { installEvt.prompt(); setCanInstall(false); }}>${t('install')}</button>`}
    <section class="block"><h2>${t('about')}</h2>
      <div class="prose small" dir="ltr">
        <p>Arabic text: Uthmani script from the Tanzil project. English: Marmaduke Pickthall (1930). Dhivehi: translation published by the Office of the President of the Maldives. Recitations stream from everyayah.com.</p>
        <p>Prayer times follow the published Maldives timetable for each island. If your mosque's time differs, follow the mosque.</p>
        <p>Articles are summaries for learning. For a ruling on your own situation, ask a qualified scholar.</p>
      </div>
      <a class="backlink" href="#/admin">${t('admin')}</a>
    </section>
  </div>`;
}


// ---------- live countdown to the next prayer ----------
function CountdownPage() {
  const s = useSettings();
  const d = useData(prayerData, []);
  const [, tick] = useState(0);
  useEffect(() => { const id = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(id); }, []);
  return html`<${Wait} s=${d}>${(data) => {
    const now = mvNow();
    const { island, times } = timesFor(data, s.island, now);
    const sec = now.getUTCHours() * 3600 + now.getUTCMinutes() * 60 + now.getUTCSeconds();
    const at = PRAY5.map((i) => times[i] * 60);
    // "It is time" stays up for 20 minutes after a prayer comes in
    let k = at.findIndex((t) => sec >= t && sec - t < 1200), arrived = k >= 0, left = 0, span = 1;
    if (!arrived) {
      k = at.findIndex((t) => t > sec);
      const prev = k > 0 ? at[k - 1] : k === 0 ? at[4] - 86400 : at[4];
      const next = k >= 0 ? at[k] : at[0] + 86400;
      if (k < 0) k = 0;
      left = next - sec; span = Math.max(1, next - prev);
    }
    const name = t(PRAYERS[PRAY5[k]]);
    const pct = arrived ? 1 : 1 - left / span;
    const hh = Math.floor(left / 3600), mm = Math.floor((left % 3600) / 60), ss = left % 60;
    const clock = `${hh ? hh + ':' : ''}${String(mm).padStart(hh ? 2 : 1, '0')}:${String(ss).padStart(2, '0')}`;
    const done = prayedOn(s, todayKey())[k];
    const R = 96, C = 2 * Math.PI * R;
    return html`<div class="page countdown ${arrived ? 'is-now' : ''}">
      <a class="backlink" href="#/"><${Icon} name="back" /> ${t('home')}</a>
      <div class="cd-ring" role="timer" aria-live="off">
        <svg viewBox="-110 -110 220 220" aria-hidden="true"><circle r=${R} class="cd-track" /><circle r=${R} class="cd-arc" stroke-dasharray=${C.toFixed(1)} stroke-dashoffset=${(C * (1 - pct)).toFixed(1)} transform="rotate(-90)" /></svg>
        <div class="cd-mid">
          ${arrived ? html`<span class="cd-small">${t('cdNow')}</span><strong class="cd-name">${name}</strong><span class="cd-small num">${fmtTime(times[PRAY5[k]])}</span>`
            : html`<span class="cd-small">${isDv() ? `${name} ${t('cdIn')}` : `${name} ${t('cdIn')}`}</span><strong class="cd-clock num">${clock}</strong><span class="cd-small num">${fmtTime(times[PRAY5[k]])}</span>`}
        </div>
      </div>
      <p class="muted">${island.a}. ${island.n}</p>
      ${arrived && html`<div class="toolbar cd-actions">
        <button class="btn ${done ? '' : 'primary'}" aria-pressed=${!!done} onClick=${() => togglePrayed(k)}><${Icon} name="check" /> ${t('cdPrayed')}</button>
        <a class="btn" href=${`#/guide/after-${PRAYERS[PRAY5[k]]}`}><${Icon} name="count" /> ${t('startDhikr')}</a>
      </div>`}
      <ol class="cd-list">${PRAY5.map((i, j) => html`<li class=${j === k ? 'on' : ''}><span>${t(PRAYERS[i])}</span><span class="num">${fmtTime(times[i])}</span></li>`)}</ol>
    </div>`;
  }}<//>`;
}

// ---------- qibla compass ----------
function QiblaPage() {
  const s = useSettings();
  const d = useData(prayerData, []);
  const [heading, setHeading] = useState(null);
  const [state, setState] = useState('idle'); // idle, on, denied, none
  const near = useRef(false);
  const dial = useRef(null);
  const live = useRef({ target: null, shown: null, last: 0, raf: 0 });
  useEffect(() => () => { cancelAnimationFrame(live.current.raf); window.removeEventListener('deviceorientationabsolute', onTurn, true); window.removeEventListener('deviceorientation', onTurn, true); }, []);
  function onTurn(e) {
    let h = null;
    if (typeof e.webkitCompassHeading === 'number') h = e.webkitCompassHeading; // iPhone: degrees from north
    else if (e.absolute && e.alpha != null) h = 360 - e.alpha; // Android
    if (h == null || Number.isNaN(h)) return;
    const L = live.current;
    h = (h + ((screen.orientation && screen.orientation.angle) || 0) + 360) % 360;
    // keep the angle continuous (359 -> 361, not 359 -> 1) so the dial never spins the long way round
    if (L.target == null) { L.target = h; L.shown = h; }
    else { let d = h - (((L.target % 360) + 360) % 360); if (d > 180) d -= 360; if (d < -180) d += 360; L.target += d; }
  }
  // The dial is turned directly on every frame, without redrawing the page; the words underneath update a few times a second.
  function frame(now) {
    const L = live.current;
    if (L.target != null) {
      L.shown += (L.target - L.shown) * 0.4;
      if (dial.current) dial.current.style.transform = `rotate(${(-L.shown).toFixed(2)}deg)`;
      if (now - L.last > 160) { L.last = now; const r = Math.round((((L.shown % 360) + 360) % 360)); setHeading((prev) => (prev === r ? prev : r)); }
    }
    L.raf = requestAnimationFrame(frame);
  }
  const start = async () => {
    try {
      if (typeof DeviceOrientationEvent === 'undefined') return setState('none');
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        if ((await DeviceOrientationEvent.requestPermission()) !== 'granted') return setState('denied');
      }
      window.addEventListener('deviceorientationabsolute', onTurn, true);
      window.addEventListener('deviceorientation', onTurn, true);
      setState('on');
      cancelAnimationFrame(live.current.raf); live.current.raf = requestAnimationFrame(frame);
      setTimeout(() => { if (live.current.target == null) setState('none'); }, 3000);
    } catch { setState('denied'); }
  };
  return html`<${Wait} s=${d}>${(data) => {
    const { island } = timesFor(data, s.island, mvNow());
    const q = island.q ?? 300.8;
    const off = heading == null ? null : ((q - heading + 540) % 360) - 180; // how far the qibla is to the right (+) or left (-)
    const aligned = off != null && Math.abs(off) < 4;
    if (aligned && !near.current && navigator.vibrate) navigator.vibrate([40, 40, 90]);
    near.current = aligned;
    const points = isDv() ? ['އުތުރު', 'އިރުމަތި', 'ދެކުނު', 'ހުޅަނގު'] : ['N', 'E', 'S', 'W'];
    return html`<div class="page qibla">
      <a class="backlink" href="#/prayer"><${Icon} name="back" /> ${t('prayer')}</a>
      <h1>${t('qibla')}</h1>
      <p class="lede">${island.a}. ${island.n}: <strong class="num">${q.toFixed(0)}°</strong> ${t('qiblaFrom')}</p>
      <div class="compass ${aligned ? 'is-aligned' : ''}" role="img" aria-label=${`${t('qibla')} ${q.toFixed(0)}°`}>
        <span class="compass-top" aria-hidden="true"></span>
        <div class="dial" ref=${dial}>
          <svg viewBox="-110 -110 220 220" aria-hidden="true">
            <circle r="104" class="dial-rim" /><circle r="92" class="dial-face" />
            ${Array.from({ length: 72 }, (_, i) => html`<line x1="0" y1=${i % 18 === 0 ? -92 : i % 6 === 0 ? -92 : -92} x2="0" y2=${i % 18 === 0 ? -76 : i % 6 === 0 ? -82 : -87} transform=${`rotate(${i * 5})`} class=${i % 18 === 0 ? 'tick major' : 'tick'} />`)}
            ${points.map((p, i) => html`<text x="0" y="-58" transform=${`rotate(${i * 90})`} class=${i === 0 ? 'pt north' : 'pt'}>${p}</text>`)}
            <g transform=${`rotate(${q})`}>
              <path d="M0 -98 L9 -70 L0 -76 L-9 -70 Z" class="q-arrow" />
              <line x1="0" y1="-70" x2="0" y2="-18" class="q-line" />
              <g transform="translate(0 -40)"><rect x="-11" y="-11" width="22" height="22" rx="2.5" class="kaaba" /><rect x="-11" y="-6" width="22" height="4" class="kaaba-band" /></g>
            </g>
            <circle r="6" class="dial-hub" />
          </svg>
        </div>
      </div>
      ${state === 'on' && heading != null && html`<p class="q-status ${aligned ? 'ok' : ''}" role="status">${aligned ? t('qiblaFacing') : `${t(off > 0 ? 'turnRight' : 'turnLeft')} ${Math.abs(off).toFixed(0)}°`}</p>`}
      ${state === 'idle' && html`<button class="btn primary" onClick=${start}><${Icon} name="explore" /> ${t('startCompass')}</button>`}
      ${state === 'denied' && html`<p class="notice">${t('compassDenied')}</p>`}
      ${state === 'none' && html`<p class="notice">${t('compassNone')}</p>`}
      <ul class="q-tips muted"><li>${t('qTip1')}</li><li>${t('qTip2')}</li><li>${t('qTip3')}</li></ul>
    </div>`;
  }}<//>`;
}

// ---------- dedication ----------
const MEM_AR = 'اللَّهُمَّ اغْفِرْ لَهَا وَارْحَمْهَا، وَعَافِهَا، وَاعْفُ عَنْهَا، وَأَكْرِمْ نُزُلَهَا، وَوَسِّعْ مُدْخَلَهَا، وَاغْسِلْهَا بِالْمَاءِ وَالثَّلْجِ وَالْبَرَدِ، وَنَقِّهَا مِنَ الْخَطَايَا كَمَا نَقَّيْتَ الثَّوْبَ الْأَبْيَضَ مِنَ الدَّنَسِ، وَأَبْدِلْهَا دَارًا خَيْرًا مِنْ دَارِهَا، وَأَهْلًا خَيْرًا مِنْ أَهْلِهَا، وَأَدْخِلْهَا الْجَنَّةَ، وَأَعِذْهَا مِنْ عَذَابِ الْقَبْرِ وَعَذَابِ النَّارِ';
const MEM_TR = "Allahummaghfir laha warhamha, wa 'afiha wa'fu 'anha, wa akrim nuzulaha, wa wassi' mudkhalaha, waghsilha bil-ma'i wath-thalji wal-barad, wa naqqiha minal-khataya kama naqqaytath-thawbal-abyada minad-danas, wa abdilha daran khayran min dariha, wa ahlan khayran min ahliha, wa adkhilhal-jannah, wa a'idhha min 'adhabil-qabri wa 'adhabin-nar.";
function MemoryPanel() {
  return html`<a class="memory" href="#/memory">
    <span class="mem-mark" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="mem-text"><span class="muted">${t('memOf')}</span><strong>${t('memName')}</strong><span class="mem-ar-name" lang="ar" dir="rtl">شَرِيفَة أَحْمَد</span><span class="muted">${t('memDates')}</span><span class="mem-line">${t('memLine')}</span></span>
    <span class="btn primary">${t('memAsk')}</span>
  </a>`;
}
function MemoryPage() {
  const [msg, setMsg] = useState('');
  useEffect(() => scrollTo(0, 0), []);
  const share = async () => {
    const data = { title: 'Sharaf', text: `${t('memShort')} ${t('memName')} (شَرِيفَة أَحْمَد)${t('memAfter')}. ${t('memLine')}`, url: location.origin };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); setMsg(t('copied')); } } catch {}
  };
  return html`<div class="page mempage">
    <a class="backlink" href="#/"><${Icon} name="back" /> ${t('home')}</a>
    <header class="mem-head">
      <span class="mem-mark" aria-hidden="true"><i></i><i></i><i></i></span>
      <p class="ar mem-app" lang="ar" dir="rtl">شَرَفُ أُمِّي</p>
      <p class="muted">${t('appMeaning')}</p>
      <p class="muted">${t('memOf')}</p>
      <h1>${t('memName')}</h1>
      <p class="mem-ar-name" lang="ar" dir="rtl">شَرِيفَة أَحْمَد</p>
      <p class="muted">${t('memDates')}</p>
      <p class="ar mem-rahimaha" lang="ar" dir="rtl">رَحِمَهَا ٱللَّهُ وَأَسْكَنَهَا فَسِيحَ جَنَّاتِهِ</p>
    </header>
    <p class=${isDv() ? 'dv' : ''}>${t('memWhy')}</p>
    <section class="mem-dua">
      <h2>${t('memTitle')}</h2>
      <p class="ar" lang="ar" dir="rtl">${MEM_AR}</p>
      <p class="translit" dir="ltr">${MEM_TR}</p>
      <p class=${isDv() ? 'dv' : ''}>${t('memMeaning')}</p>
      <p class="muted" dir="ltr">Muslim 963</p>
      <p class="notice ${isDv() ? 'dv' : ''}">${t('memShort2')} <span class="ar" lang="ar" dir="rtl">اللَّهُمَّ اغْفِرْ لَهَا وَارْحَمْهَا</span></p>
    </section>
    <div class="toolbar"><button class="btn primary" onClick=${share}>${t('shareApp')}</button>${msg && html`<span class="muted" role="status">${msg}</span>`}</div>
  </div>`;
}

// ---------- shell ----------
// Phones and tablets get five destinations in a bottom bar; wide screens get the same plus more in a bar across the top.
const NAV = [['', 'home', 'home'], ['quran', 'quran', 'quran'], ['prayer', 'prayer', 'prayer'], ['duas', 'duas', 'duas'], ['explore/g_stories', 'stories', 'book', 1], ['arabic', 'arabicT', 'chat', 1], ['explore', 'explore', 'explore']];
function App() {
  const appSettings = useSettings();
  // one text-size setting drives Arabic everywhere
  useEffect(() => { document.documentElement.style.setProperty('--ar-size', (appSettings.arSize || 30) + 'px'); }, [appSettings.arSize]);
  const route = useRoute();
  const boot = useBoot();
  const [head, a, b] = route;
  const tab = head === 'quran' || head === 'mushaf' ? 'quran' : head === 'prayer' ? 'prayer' : head === 'duas' ? 'duas' : head === 'arabic' ? 'arabic' : head === 'explore' || head === 'library' ? (a === 'g_stories' ? 'explore/g_stories' : 'explore') : head === '' ? '' : null;
  let page;
  if (head === 'quran') page = a ? html`<${Surah} n=${Math.min(114, Math.max(1, +a || 1))} focus=${+b || 0} />` : html`<${QuranIndex} />`;
  else if (head === 'mushaf') page = html`<${Mushaf} page=${+a || 0} />`;
  else if (head === 'settings') page = html`<${SettingsPage} />`;
  else if (head === 'admin') page = html`<${Admin} route=${route} boot=${boot.data} onChange=${() => { forget('/api/'); location.reload(); }} />`;
  else if (boot.loading) page = html`<div class="page"><p class="status" role="status">${boot.seeding ? t('settingUp') : t('loading')}…</p></div>`;
  else if (boot.error) page = html`<div class="page"><div class="status"><p>${t('failed')}</p><button class="btn" onClick=${() => location.reload()}>${t('retry')}</button></div></div>`;
  else if (head === 'prayer') page = html`<${PrayerPage} boot=${boot.data} />`;
  else if (head === 'duas') page = html`<${DuasPage} boot=${boot.data} />`;
  else if (head === 'explore' || head === 'library') page = html`<${ExplorePage} boot=${boot.data} focus=${a} />`;
  else if (head === 'arabic') page = html`<${ArabicPage} boot=${boot.data} tab=${a} />`;
  else if (head === 'countdown') page = html`<${CountdownPage} />`;
  else if (head === 'qibla') page = html`<${QiblaPage} />`;
  else if (head === 'memory') page = html`<${MemoryPage} />`;
  else if (head === 'guide') page = html`<${GuidePage} boot=${boot.data} id=${decodeURIComponent(a || '')} />`;
  else if (head === 's') page = html`<${SectionPage} boot=${boot.data} id=${a} />`;
  else if (head === 'i') page = html`<${ItemPage} boot=${boot.data} id=${a} />`;
  else if (head === 'search') page = html`<${SearchPage} boot=${boot.data} />`;
  else if (head === 'count') page = html`<${CounterPage} boot=${boot.data} id=${a} />`;
  else page = html`<${Home} boot=${boot.data} />`;
  const link = ([path, key, icon]) => html`<a href=${'#/' + path} aria-current=${tab === path ? 'page' : null}><${Icon} name=${icon} /><span>${t(key)}</span></a>`;
  return html`<div class="shell">
    <header class="topbar">
      <a class="brand" href="#/"><span>${t('appName')}</span><span class="brand-ar" lang="ar" dir="rtl">شَرَفُ أُمِّي</span></a>
      <nav class="topnav" aria-label="Main">${NAV.map(link)}</nav>
      <span class="top-actions">
        <a class="icon-btn search-btn" href="#/search" aria-label=${t('search')}><${Icon} name="search" /><span>${t('search')}</span></a>
        <a class="icon-btn" href="#/settings" aria-label=${t('settings')}><${Icon} name="settings" /></a>
      </span>
    </header>
    <main id="main"><div class="route" key=${head + '/' + (head === 'mushaf' || head === 'explore' || head === 'arabic' ? '' : a || '')}>${page}</div>
      ${head !== 'mushaf' && head !== 'memory' && head !== '' && html`<footer class="memfoot"><a href="#/memory">${t('memShort')} <strong>${t('memName')}</strong> <span class="mem-ar-in" lang="ar" dir="rtl">شَرِيفَة أَحْمَد</span>${t('memAfter')}. ${t('memAsk')}</a></footer>`}</main>
    <${MiniPlayer} />
    <nav class="tabs" aria-label="Main">${NAV.filter((x) => !x[3]).map(link)}</nav>
  </div>`;
}

// Items fade up the first time they scroll into view. Without JS or with reduced motion nothing is hidden.
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('motion');
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
  const scan = () => document.querySelectorAll('.steps > li:not(.in), .duas > li:not(.in), .ayah:not(.in), .block:not(.in), .prose > *:not(.in)').forEach((el) => io.observe(el));
  new MutationObserver(scan).observe(document.getElementById('app'), { childList: true, subtree: true });
}
// Cards lean towards the pointer. Only where there is a real pointer and motion is welcome.
if (matchMedia('(hover: hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const TILT = '.prayercard, .card, .memory, .letter-card, .now, .daily';
  let cur = null;
  const clear = (el) => { el.style.removeProperty('--tx'); el.style.removeProperty('--ty'); };
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest ? e.target.closest(TILT) : null;
    if (cur && cur !== el) { clear(cur); cur = null; }
    if (!el) return;
    cur = el;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--tx', ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
    el.style.setProperty('--ty', ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
  }, { passive: true });
  document.addEventListener('pointerleave', () => { if (cur) { clear(cur); cur = null; } }, true);
}
// iPhone ignores the viewport's no-zoom setting, so pinch zoom is stopped here (double-tap zoom is stopped by touch-action in the stylesheet). Text size is set in Settings instead.
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });
applyTheme();
setSettings({});
loadAccount();
mergePendingPrayed();
document.addEventListener('visibilitychange', () => { if (!document.hidden) mergePendingPrayed(); });
const root = document.getElementById('app');
root.textContent = ''; // remove the static "Loading…" placeholder from index.html, which otherwise stays at the bottom of every page
render(html`<${App} />`, root);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
  // a tapped notification asks the open app to show the countdown
  navigator.serviceWorker.addEventListener('message', (e) => { if (e.data && typeof e.data.go === 'string' && e.data.go.startsWith('#/')) location.hash = e.data.go; if (e.data && e.data.prayedSync) mergePendingPrayed(); });
}
