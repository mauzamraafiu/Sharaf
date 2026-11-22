// Content admin: sign in, review Dhivehi text, edit or add items, upload recordings.
import { html, useState, useEffect } from './vendor/preact-htm.js';
import { api } from './lib.js';

const AREAS = ['prayer', 'duas', 'beliefs', 'quran', 'hadith', 'fiqh', 'history', 'spirit', 'modern', 'life'];

function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try { await api('/admin/login', { method: 'POST', body: JSON.stringify({ password: pw }) }); onDone(); } catch (x) { setErr(x.message); }
  };
  return html`<form class="form" onSubmit=${submit}>
    <label>Admin password<input class="field" type="password" autocomplete="current-password" value=${pw} onInput=${(e) => setPw(e.target.value)} required /></label>
    ${err && html`<p class="notice" role="alert">${err}</p>`}
    <button class="btn primary">Sign in</button>
  </form>`;
}

function Editor({ id, boot, onSaved }) {
  const isNew = id === 'new';
  const [it, setIt] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    if (isNew) setIt({ id: '', section_id: boot.sections[0]?.id || '', kind: 'article', title_en: '', title_dv: '', body_en: '', body_dv: '', arabic: '', translit: '', ref: '', audio: '', sort: 100, dv_reviewed: 0 });
    else api('/admin/items/' + id).then((r) => setIt(r.item), (e) => setMsg(e.message));
  }, [id]);
  if (!it) return html`<p class="status">${msg || 'Loading…'}</p>`;
  const set = (k) => (e) => setIt({ ...it, [k]: e.target.type === 'checkbox' ? (e.target.checked ? 1 : 0) : e.target.value });
  const save = async (e) => {
    e.preventDefault(); setMsg('');
    try { await api('/admin/items/' + it.id, { method: 'PUT', body: JSON.stringify(it) }); setMsg('Saved'); onSaved(); } catch (x) { setMsg(x.message); }
  };
  const upload = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    setMsg('Uploading…');
    try { await api(`/admin/items/${it.id}/audio`, { method: 'PUT', body: f, headers: { 'Content-Type': f.type || 'audio/mpeg' } }); setIt({ ...it, audio: 'file' }); setMsg('Recording uploaded'); } catch (x) { setMsg(x.message); }
  };
  const remove = async () => {
    if (!confirm(`Delete "${it.title_en}"? This cannot be undone.`)) return;
    await api('/admin/items/' + it.id, { method: 'DELETE' }); onSaved(); location.hash = '#/admin';
  };
  return html`<form class="form" onSubmit=${save}>
    <a class="backlink" href="#/admin">Back to list</a>
    <label>ID (lowercase, dashes)<input class="field" value=${it.id} onInput=${set('id')} disabled=${!isNew} required pattern="[a-z0-9-]{2,80}" /></label>
    <label>Section<select class="field" value=${it.section_id} onChange=${set('section_id')}>${boot.sections.map((s) => html`<option value=${s.id}>${s.area} / ${s.title_en}</option>`)}</select></label>
    <label>Kind<select class="field" value=${it.kind} onChange=${set('kind')}><option value="article">Article</option><option value="dua">Dua</option><option value="step">Step in a guide</option></select></label>
    <label>Title (English)<input class="field" value=${it.title_en} onInput=${set('title_en')} required /></label>
    <label>Title (Dhivehi)<input class="field dv" dir="rtl" value=${it.title_dv} onInput=${set('title_dv')} /></label>
    <label>Arabic text<textarea class="field ar" dir="rtl" rows="3" value=${it.arabic} onInput=${set('arabic')}></textarea></label>
    <label>Transliteration<textarea class="field" rows="2" value=${it.translit} onInput=${set('translit')}></textarea></label>
    <label>Body (English). Use ## for headings and - for lists.<textarea class="field" rows="12" value=${it.body_en} onInput=${set('body_en')}></textarea></label>
    <label>Body (Dhivehi)<textarea class="field dv" dir="rtl" rows="12" value=${it.body_dv} onInput=${set('body_dv')}></textarea></label>
    <label class="check"><input type="checkbox" checked=${!!it.dv_reviewed} onChange=${set('dv_reviewed')} /> Dhivehi text has been reviewed</label>
    <label>Source reference<input class="field" value=${it.ref} onInput=${set('ref')} /></label>
    <label>Audio: leave empty, a link (https://…), or a Quran reference such as q:2:255 or q:1:1-7<input class="field" value=${it.audio} onInput=${set('audio')} /></label>
    ${!isNew && html`<label>Or upload a recording (up to 1.5 MB)<input type="file" accept="audio/*" onChange=${upload} /></label>`}
    <label>Order in section<input class="field" type="number" value=${it.sort} onInput=${set('sort')} /></label>
    ${msg && html`<p class="notice" role="status">${msg}</p>`}
    <div class="toolbar"><button class="btn primary">Save changes</button>${!isNew && html`<button type="button" class="btn danger" onClick=${remove}>Delete item</button>`}</div>
  </form>`;
}

export function Admin({ route, boot, onChange }) {
  const [admin, setAdmin] = useState(null);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('unreviewed');
  const [q, setQ] = useState('');
  const check = () => api('/admin/me').then((r) => setAdmin(r.admin), () => setAdmin(false));
  useEffect(() => { check(); }, []);
  useEffect(() => { if (admin) api('/admin/stats').then(setStats, () => {}); }, [admin]);
  if (admin === null || !boot) return html`<div class="page"><p class="status">Loading…</p></div>`;
  if (!admin) return html`<div class="page"><h1>Content admin</h1><${Login} onDone=${check} /></div>`;
  if (route[1] === 'edit') return html`<div class="page"><h1>${route[2] === 'new' ? 'Add an item' : 'Edit item'}</h1><${Editor} id=${route[2]} boot=${boot} onSaved=${onChange} /></div>`;
  const items = boot.items.filter((i) => (filter === 'all' || !i.dv_reviewed) && (!q || i.title_en.toLowerCase().includes(q.toLowerCase()) || i.id.includes(q.toLowerCase())));
  return html`<div class="page" dir="ltr">
    <h1>Content admin</h1>
    ${stats && html`<p class="lede">${stats.items.total} items, ${stats.items.reviewed || 0} with reviewed Dhivehi, ${stats.items.edited || 0} edited here. ${stats.subscribers} devices get prayer notifications.</p>`}
    <div class="toolbar">
      <a class="btn primary" href="#/admin/edit/new">Add an item</a>
      <span class="chips"><button class="chip" aria-pressed=${filter === 'unreviewed'} onClick=${() => setFilter('unreviewed')}>Dhivehi to review</button><button class="chip" aria-pressed=${filter === 'all'} onClick=${() => setFilter('all')}>All items</button></span>
      <button class="btn" onClick=${async () => { await api('/admin/logout', { method: 'POST' }); setAdmin(false); }}>Sign out</button>
    </div>
    <input class="field" type="search" placeholder="Filter by title or ID" value=${q} onInput=${(e) => setQ(e.target.value)} />
    <ul class="seclist">${items.slice(0, 300).map((i) => html`<li><a href=${`#/admin/edit/${i.id}`}><strong>${i.title_en}</strong><span class="muted">${i.section_id} / ${i.kind}${i.dv_reviewed ? ', reviewed' : ''}</span></a></li>`)}</ul>
    ${!items.length && html`<p class="status">Nothing here. Every item's Dhivehi has been reviewed.</p>`}
  </div>`;
}
