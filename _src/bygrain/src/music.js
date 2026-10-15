import { sb, esc, toast, confirmBox, modal, ICON, signedUrls, signedUrl, uploadImage } from './lib.js';
import { shotCard, bindShots, shotViewer } from './fiction.js';
import { mountTasks } from './tasks.js';
import { mountLayout, fullscreenButton } from './layout.js';
import { ensureModules } from './modules.js';

// Videoclipes: a música partida em secções (intro, versos, refrões, ponte…), como no Studio.
// Cada secção é uma linha de "scenes" com tempos; décors = locations, pessoas = characters (figurantes têm info.extra).

export const PARTS = ['Intro', 'Verso 1', 'Pré-refrão', 'Refrão', 'Verso 2', 'Refrão 2', 'Ponte', 'Refrão final', 'Outro'];
const AUTO = ['Intro', 'Verso 1', 'Refrão', 'Verso 2', 'Refrão 2', 'Ponte', 'Refrão final', 'Outro'];
export const SEG_COLORS = ['#8e6cdb', '#d6457a', '#d9822b', '#c9a227', '#2fa37a', '#4f8f9e', '#7fae3a', '#8a7563'];
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// "1:20" → 80 · "80" → 80 · "1:02:03" → 3723
export function parseT(v) {
  const s = String(v ?? '').trim().replace(',', '.'); if (!s) return null;
  if (!/^\d+(\.\d+)?(:\d{1,2}(\.\d+)?){0,2}$/.test(s)) return null;
  return s.split(':').reduce((a, x) => a * 60 + Number(x), 0);
}
export const fmtT = (n) => { if (n == null) return ''; n = Math.round(n); const m = Math.floor(n / 60), s = n % 60; return `${m}:${String(s).padStart(2, '0')}`; };

async function load(pid) {
  const [sc, ch, lo, sh, gr] = await Promise.all([
    sb.from('scenes').select('*').eq('project_id', pid).order('position'),
    sb.from('characters').select('*').eq('project_id', pid).order('position'),
    sb.from('locations').select('*').eq('project_id', pid).order('position'),
    sb.from('shots').select('*').eq('project_id', pid).order('position'),
    sb.from('shot_groups').select('*').eq('project_id', pid).order('position'),
  ]);
  return { scenes: sc.data || [], characters: ch.data || [], locations: lo.data || [], shots: sh.data || [], groups: gr.data || [], unitPath: 'seguimento' };
}

// posição de cada secção na barra; se faltarem tempos, a barra passa a "fluida" (blocos iguais)
export function layout(scenes, duration) {
  const t = scenes.map((s) => ({ s, a: parseT(s.starts_at), b: parseT(s.ends_at) }));
  const total = parseT(duration) || t.reduce((m, x) => Math.max(m, x.b || 0, x.a || 0), 0);
  const scaled = total > 0 && t.every((x) => x.a != null);
  const out = t.map((x, i) => {
    const nxt = t.filter((y) => y.a != null && x.a != null && y.a > x.a).sort((p, q) => p.a - q.a)[0];
    const b = x.b != null ? x.b : nxt ? nxt.a : total;
    return { ...x, b, col: x.s.color || SEG_COLORS[i % SEG_COLORS.length], style: scaled && b > x.a ? `left:${(x.a / total * 100).toFixed(2)}%;width:${((b - x.a) / total * 100).toFixed(2)}%` : '' };
  });
  return { items: out, total, scaled: scaled && out.every((x) => x.style) };
}

export function trackHtml(scenes, duration, { base, f, compact = false } = {}) {
  if (!scenes.length) return '';
  const L = layout(scenes, duration);
  const nShots = (id) => (f?.shots || []).filter((x) => x.scene_id === id).length;
  const ticks = L.scaled ? Array.from({ length: Math.floor(L.total / 30) + 1 }, (_, i) => `<i style="left:${(i * 30 / L.total * 100).toFixed(2)}%"><span>${fmtT(i * 30)}</span></i>`).join('') : '';
  return `<div class="seg-track ${L.scaled ? '' : 'flow'} ${compact ? 'compact' : ''}">${L.items.map((x) => `<a class="seg-b" href="${base}/seguimento/${x.s.id}" style="--sc:${x.col};${x.style}" title="${esc(x.s.heading || 'Sem nome')}">
      <b>${esc(x.s.heading || 'Sem nome')}</b>${x.a != null ? `<span class="num">${fmtT(x.a)}${x.b != null ? '–' + fmtT(x.b) : ''}</span>` : ''}
      ${compact ? '' : `<span class="seg-meta">${[(x.s.location_ids || []).length ? `${x.s.location_ids.length} ${x.s.location_ids.length === 1 ? 'décor' : 'décors'}` : '', ((x.s.character_ids || []).length + (x.s.extra_ids || []).length) ? `${(x.s.character_ids || []).length + (x.s.extra_ids || []).length} pessoas` : '', nShots(x.s.id) ? `${nShots(x.s.id)} ${nShots(x.s.id) === 1 ? 'plano' : 'planos'}` : ''].filter(Boolean).join(' · ')}</span>`}
    </a>`).join('')}</div>${ticks ? `<div class="seg-ticks">${ticks}</div>` : ''}`;
}

export const CLIP_PAGES = [
  ['seguimento', 'Seguimento', ICON.music], ['decors', 'Décors', ICON.home], ['elenco', 'Atores e figurantes', ICON.team],
  ['storyboard', 'Storyboard', ICON.image], ['aderecos', 'Adereços', ICON.prop],
];

export async function clipPage(main, p, page, sub, base, cleanup) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const f = await load(p.id);
  if (page === 'decors') return sub ? entityPage(main, p, f, 'place', sub, base, cleanup) : entityList(main, p, f, 'place', base);
  if (page === 'elenco') return sub ? entityPage(main, p, f, 'person', sub, base, cleanup) : entityList(main, p, f, 'person', base);
  if (page === 'storyboard') return storyboard(main, p, f, base);
  return musicPage(main, p, f, sub, base, cleanup);
}

// YouTube: tira o id de qualquer formato de link (watch, youtu.be, shorts, embed)
export function ytId(url) {
  const m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/))([\w-]{11})/);
  return m ? m[1] : null;
}
// um ficheiro de música pode estar a ser usado em boards: só se apaga se mais nada o usar
async function removeIfUnused(pid, path) {
  if (!path) return;
  const { count } = await sb.from('board_items').select('id', { count: 'exact', head: true }).eq('project_id', pid).eq('kind', 'audio').eq('data->>path', path);
  if (!count) await sb.storage.from('files').remove([path]);
}
const normUrl = (u) => { u = String(u || '').trim(); return u && !/^https?:\/\//i.test(u) ? 'https://' + u : u; };

// música (ficheiro ou link), pre-vis (YouTube, toca aqui) e referências (links, abrem no YouTube)
export async function mediaPanel(slots, p, music, saveNow) {
  const audioUrl = music.audio_path ? await signedUrl(music.audio_path) : null;
  const pv = ytId(music.previs_url);
  const refs = music.refs || [];
  const box = document.createElement('div');
  box.innerHTML = `
      <section class="panel mv-previs">
        <div class="row between"><h2 class="h3">Pre-vis</h2>${music.previs_url ? `<button type="button" class="link-btn small" data-pv-edit>Mudar link</button>` : ''}</div>
        ${pv ? `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${pv}?rel=0" title="Pre-vis" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
          : `<form class="mv-form" data-pv-form><input type="url" name="u" placeholder="Link do YouTube do pre-vis" value="${esc(music.previs_url || '')}" aria-label="Link do pre-vis no YouTube"><button class="btn primary">Guardar</button></form>${music.previs_url ? '<p class="small late-txt2">Este link não parece ser do YouTube.</p>' : '<p class="muted small">Cola um link do YouTube (pode ser não listado). Toca aqui mesmo.</p>'}`}
      </section>
      <section class="panel mv-song">
        <h2 class="h3">${ICON.music} A música</h2>
        ${audioUrl ? `<p class="mv-file"><strong>${esc(music.audio_name || 'Música')}</strong></p><audio controls preload="metadata" src="${esc(audioUrl)}"></audio>
            <div class="row wrap-gap"><button type="button" class="btn ghost" data-audio>${ICON.refresh} Trocar ficheiro</button><button type="button" class="link-btn danger-text small" data-audio-rm>Tirar</button></div>`
          : `<button type="button" class="mv-drop" data-audio>${ICON.plus}<span><strong>Carregar a música</strong><small>MP3, WAV ou M4A · até 25 MB</small></span></button>`}
        <form class="mv-form" data-song-form><input type="url" name="u" placeholder="ou link (Spotify, YouTube, Drive…)" value="${esc(music.song_url || '')}" aria-label="Link da música"><button class="btn ghost">Guardar</button></form>
        ${music.song_url ? `<a class="small" href="${esc(music.song_url)}" target="_blank" rel="noopener noreferrer">${ICON.open} Abrir o link da música</a>` : ''}
      </section>
    <section class="panel mv-refs">
      <div class="row between"><h2 class="h3">Referências</h2><span class="muted small">abrem no YouTube</span></div>
      ${refs.length ? `<div class="ref-grid">${refs.map((r, i) => { const id = ytId(r.url); return `<div class="ref-card"><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer"><span class="ref-thumb">${id ? `<img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" loading="lazy" onerror="this.remove()">` : ICON.link}<i>${ICON.open}</i></span><span class="ref-t">${esc(r.title || (id ? 'Vídeo do YouTube' : r.url))}</span></a><button type="button" class="icon-btn sm" data-ref-rm="${i}" aria-label="Tirar referência">${ICON.close}</button></div>`; }).join('')}</div>` : ''}
      <form class="mv-form ref-add" data-ref-form><input type="url" name="u" placeholder="Link do YouTube" required aria-label="Link da referência"><input name="t" placeholder="Nota (opcional): o que interessa aqui" aria-label="Nota da referência"><button class="btn primary">${ICON.plus} Juntar</button></form>
    </section>`;
  const redraw = () => mediaPanel(slots, p, music, saveNow);
  const set = async (patch) => { Object.assign(music, patch); if (await saveNow()) redraw(); };
  box.querySelector('[data-pv-form]')?.addEventListener('submit', (e) => { e.preventDefault(); set({ previs_url: normUrl(e.target.u.value) || null }); });
  box.querySelector('[data-pv-edit]')?.addEventListener('click', () => {
    const m = modal(`<h2>Link do pre-vis</h2><form class="stack"><div class="field"><label for="pvu">Link do YouTube</label><input id="pvu" type="url" value="${esc(music.previs_url || '')}"></div><div class="row between"><button type="button" class="btn ghost danger-text" data-clear>Tirar o pre-vis</button><div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>`);
    m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); m.close(); set({ previs_url: normUrl(m.el.querySelector('#pvu').value) || null }); });
    m.el.querySelector('[data-clear]').addEventListener('click', () => { m.close(); set({ previs_url: null }); });
  });
  box.querySelector('[data-song-form]').addEventListener('submit', (e) => { e.preventDefault(); set({ song_url: normUrl(e.target.u.value) || null }); });
  box.querySelectorAll('[data-audio]').forEach((b) => b.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.mp3,.wav,.m4a,.aac';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      if (file.size > 25 * 1024 * 1024) return toast('O ficheiro passa dos 25 MB. Exporta em MP3.');
      toast('A enviar a música…');
      const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
      const path = `${p.id}/music/${Date.now()}.${ext}`;
      const { error } = await sb.storage.from('files').upload(path, file, { contentType: file.type || 'audio/mpeg' });
      if (error) return toast(error.message);
      const old = music.audio_path;
      await set({ audio_path: path, audio_name: file.name });
      removeIfUnused(p.id, old);
      toast('Música carregada.');
    };
    inp.click();
  }));
  box.querySelector('[data-audio-rm]')?.addEventListener('click', async () => {
    if (!(await confirmBox('Tirar o ficheiro da música?', 'Tirar'))) return;
    const old = music.audio_path; await set({ audio_path: null, audio_name: null }); removeIfUnused(p.id, old);
  });
  box.querySelector('[data-ref-form]').addEventListener('submit', (e) => { e.preventDefault(); const u = normUrl(e.target.u.value); if (!u) return; set({ refs: [...refs, { url: u, title: e.target.t.value.trim() }] }); });
  box.querySelectorAll('[data-ref-rm]').forEach((b) => b.addEventListener('click', () => set({ refs: refs.filter((_, i) => i !== +b.dataset.refRm) })));
  slots.previs?.replaceChildren(box.querySelector('.mv-previs'));
  slots.song?.replaceChildren(box.querySelector('.mv-song'));
  slots.refs?.replaceChildren(box.querySelector('.mv-refs'));
}

async function musicPage(main, p, f, sub, base, cleanup) {
  if (sub) return section(main, p, f, sub, base, cleanup);
  const music = { ...(p.music || {}) };
  const saveNow = async () => { const { error } = await sb.from('projects').update({ music }).eq('id', p.id); if (error) { toast(error.message); return false; } p.music = { ...music }; return true; };
  const saveMusic = debounce(async () => { const { error } = await sb.from('projects').update({ music }).eq('id', p.id); if (error) toast(error.message); else p.music = { ...music }; }, 500);
  const shotUrls = await signedUrls([...f.shots.map((x) => x.image_path), ...f.scenes.flatMap((x) => (x.refs || []).map((r) => r.path))].filter(Boolean));
  let view = (() => { try { return localStorage.getItem('bg-seg-view') || 'grid'; } catch { return 'grid'; } })();
  // secções em colunas, como no Milanote: nome, descrição e as imagens dos planos
  const gridHtml = (L) => `<div class="seg-cols">${L.items.map((x) => { const sh = f.shots.filter((y) => y.scene_id === x.s.id); const href = `${base}/seguimento/${x.s.id}`; return `<div class="seg-col" style="--sc:${x.col}">
      <button type="button" class="icon-btn sm sc-del" data-delsec="${x.s.id}" aria-label="Apagar a secção ${esc(x.s.heading || '')}" title="Apagar secção">${ICON.trash}</button>
      <a class="sc-h" href="${href}"><strong>${esc(x.s.heading || 'Sem nome')}</strong><small>${x.a != null ? `${fmtT(x.a)}${x.b != null ? '–' + fmtT(x.b) : ''} · ` : ''}${sh.length} ${sh.length === 1 ? 'plano' : 'planos'}</small></a>
      ${x.s.notes ? `<a class="sc-desc" href="${href}"><b>Descrição:</b>${x.s.notes.split('\n').filter((l) => l.trim()).map((l) => `<span>${esc(l)}</span>`).join('')}</a>` : `<a class="sc-desc empty" href="${href}">Sem descrição. Abre para escrever a ideia desta secção.</a>`}
      ${(x.s.refs || []).filter((r) => shotUrls[r.path]).map((r) => `<a href="${href}" class="sc-img" title="Referência"><img src="${esc(shotUrls[r.path])}" alt="Referência" loading="lazy"></a>`).join('')}
      ${sh.map((y) => `<span class="sc-wrap"><a href="${base}/plano/${y.id}" class="sc-img sc-shot" title="${esc(y.description || y.code || 'Plano')}">${shotUrls[y.image_path] ? `<img src="${esc(shotUrls[y.image_path])}" alt="${esc(y.code)}" loading="lazy">` : `<span>${esc(y.code || y.description || 'Plano')}</span>`}</a><button type="button" class="icon-btn sm sc-shotdel" data-delshot="${y.id}" title="Apagar plano" aria-label="Apagar plano">${ICON.trash}</button></span>`).join('')}
    </div>`; }).join('')}</div>`;
  const draw = () => {
    const L = layout(f.scenes, music.duration);
    main.innerHTML = `
      <div class="row between wrap-gap"><div><h1 class="h1 pm-title">Seguimento</h1><p class="muted">Parte o clipe em secções da música. Cada secção funciona como uma cena: décors, atores, figurantes, planos e tarefas.</p></div></div>
      <div data-lay>
      <div data-blk="previs"><div data-slot="previs"></div></div>
      <div data-blk="song"><div data-slot="song"></div></div>
      <div data-blk="refs"><div data-slot="refs"></div></div>
      <div data-blk="track"><section class="panel seg">
        <div class="seg-head"><strong>${esc(music.title || p.name)}</strong>
          <label class="seg-dur"><span class="muted small">Duração</span><input class="mini-in num" data-dur value="${esc(music.duration || '')}" placeholder="3:45" aria-label="Duração da música"></label>
          <label class="seg-dur"><span class="muted small">BPM</span><input class="mini-in num" data-bpm value="${esc(music.bpm || '')}" placeholder="—" aria-label="BPM" inputmode="numeric"></label>
          ${f.scenes.length ? '' : '<button type="button" class="btn primary" data-auto>Partir com as secções habituais</button>'}
        </div>
        ${f.scenes.length ? trackHtml(f.scenes, music.duration, { base, f }) + (L.scaled ? '' : '<p class="muted small">Escreve quando começa cada secção (e a duração da música) para a barra ficar à escala.</p>') : '<p class="muted">Ainda sem secções. Junta-as em baixo, uma a uma, ou parte já com as secções habituais de uma música (intro, versos, refrões, ponte).</p>'}
      </section></div>
      ${f.scenes.length ? `<div data-blk="table"><div class="seg-viewbar"><div class="seg dark" role="radiogroup" aria-label="Vista das secções">${[['grid', 'Grelha'], ['list', 'Lista']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${view === k}" aria-selected="${view === k}" data-segview="${k}">${l}</button>`).join('')}</div></div>${view === 'grid' ? gridHtml(L) : `<div class="panel table-wrap"><table class="table seg-table"><thead><tr><th></th><th>Secção</th><th>Começa</th><th>Acaba</th><th>Décors</th><th>Pessoas</th><th class="num">Planos</th><th></th></tr></thead><tbody>
        ${L.items.map((x) => `<tr data-sid="${x.s.id}">
          <td><i class="seg-dot" style="--sc:${x.col}"></i></td>
          <td><input class="cell-in" data-f="heading" value="${esc(x.s.heading || '')}" list="dl-parts" aria-label="Nome da secção"></td>
          <td><input class="cell-in num t" data-f="starts_at" value="${esc(x.s.starts_at || '')}" placeholder="0:00" aria-label="Começa"></td>
          <td><input class="cell-in num t" data-f="ends_at" value="${esc(x.s.ends_at || '')}" placeholder="${x.b != null ? fmtT(x.b) : '—'}" aria-label="Acaba"></td>
          <td class="small">${esc((x.s.location_ids || []).map((id) => f.locations.find((l) => l.id === id)?.name).filter(Boolean).join(', ')) || '<span class="muted">—</span>'}</td>
          <td class="small">${esc([...(x.s.character_ids || []), ...(x.s.extra_ids || [])].map((id) => f.characters.find((c) => c.id === id)?.name).filter(Boolean).join(', ')) || '<span class="muted">—</span>'}</td>
          <td class="num">${f.shots.filter((y) => y.scene_id === x.s.id).length || '<span class="muted">—</span>'}</td>
          <td><span class="row nowrap"><a class="btn ghost sm-btn" href="${base}/seguimento/${x.s.id}">Abrir ${ICON.chev}</a><button type="button" class="icon-btn sm" data-delsec="${x.s.id}" aria-label="Apagar a secção ${esc(x.s.heading || '')}" title="Apagar secção">${ICON.trash}</button></span></td></tr>`).join('')}
      </tbody></table></div>`}</div>` : ''}
      <div data-blk="add"><form class="panel row wrap-gap seg-add" data-add>
        <strong class="small">Nova secção</strong>
        <input name="name" placeholder="ex: Refrão" list="dl-parts" aria-label="Nome da secção" required>
        <input name="start" class="mini-in num" placeholder="começa 1:20" aria-label="Começa">
        <input name="end" class="mini-in num" placeholder="acaba 1:45" aria-label="Acaba">
        <button class="btn primary">${ICON.plus} Juntar</button>
      </form></div>
      </div>
      <datalist id="dl-parts">${PARTS.map((x) => `<option value="${x}">`).join('')}</datalist>`;
    mediaPanel({ previs: main.querySelector('[data-slot=previs]'), song: main.querySelector('[data-slot=song]'), refs: main.querySelector('[data-slot=refs]') }, p, music, saveNow);
    mountLayout(main.querySelector('[data-lay]'), { project: p, key: 'seguimento', title: 'página do seguimento', blocks: [
      { id: 'previs', label: 'Pre-vis', pos: 'left' }, { id: 'song', label: 'A música', pos: 'right' }, { id: 'refs', label: 'Referências', pos: 'full' },
      { id: 'track', label: 'Barra das secções', pos: 'full' }, { id: 'table', label: 'Secções (grelha ou lista)', pos: 'full' }, { id: 'add', label: 'Nova secção', pos: 'full' },
    ] });
    const tb = main.querySelector('[data-blk="table"]'); const vb = tb?.querySelector('.seg-viewbar'); if (vb) vb.prepend(fullscreenButton(tb, 'seg-' + p.id));
    main.querySelectorAll('[data-delshot]').forEach((b) => b.addEventListener('click', async (e) => {
      e.preventDefault(); const sh = f.shots.find((x) => x.id === b.dataset.delshot); if (!sh) return;
      if (!(await confirmBox(`Apagar o plano "${sh.code || sh.description || 'sem nome'}"?`, 'Apagar plano'))) return;
      const { error } = await sb.from('shots').delete().eq('id', sh.id); if (error) return toast(error.message);
      f.shots.splice(f.shots.indexOf(sh), 1); draw();
    }));
    main.querySelectorAll('[data-delsec]').forEach((b) => b.addEventListener('click', async (e) => { e.preventDefault(); e.stopPropagation(); const sc = f.scenes.find((x) => x.id === b.dataset.delsec); if (sc && (await deleteSection(sc, f))) draw(); }));
    main.querySelectorAll('[data-segview]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.segview; try { localStorage.setItem('bg-seg-view', view); } catch { /* sem armazenamento */ } draw(); }));
    main.querySelector('[data-dur]').addEventListener('input', (e) => { music.duration = e.target.value.trim(); saveMusic(); });
    main.querySelector('[data-dur]').addEventListener('change', draw);
    main.querySelector('[data-bpm]').addEventListener('input', (e) => { music.bpm = e.target.value.trim(); saveMusic(); });
    main.querySelector('[data-auto]')?.addEventListener('click', async () => {
      const rows = AUTO.map((h, i) => ({ project_id: p.id, number: String(i + 1), heading: h, position: i, character_ids: [] }));
      const { data, error } = await sb.from('scenes').insert(rows).select();
      if (error) return toast(error.message);
      f.scenes = data.sort((a, b) => a.position - b.position); draw();
      toast(`Música partida em ${AUTO.length} secções. Muda os nomes e os tempos à vontade.`);
    });
    const savers = new Map();
    main.querySelectorAll('[data-sid] [data-f]').forEach((inp) => {
      const s = f.scenes.find((x) => x.id === inp.closest('[data-sid]').dataset.sid); const k = inp.dataset.f;
      inp.addEventListener('input', () => {
        s[k] = inp.value.trim();
        if (!savers.has(s.id + k)) savers.set(s.id + k, debounce((v) => sb.from('scenes').update({ [k]: v }).eq('id', s.id).then(({ error }) => error && toast(error.message)), 500));
        savers.get(s.id + k)(s[k]);
      });
      inp.addEventListener('change', () => { if (inp.classList.contains('t') && inp.value && parseT(inp.value) == null) return toast('Escreve o tempo assim: 1:20'); setTimeout(draw, 550); });
    });
    main.querySelector('[data-add]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = Object.fromEntries(new FormData(e.target));
      const n = f.scenes.reduce((m, x) => Math.max(m, Number(x.number) || 0), 0) + 1;
      const { data, error } = await sb.from('scenes').insert({ project_id: p.id, number: String(n), heading: fd.name.trim(), starts_at: fd.start.trim() || null, ends_at: fd.end.trim() || null, position: f.scenes.length, character_ids: [] }).select().single();
      if (error) return toast(error.message);
      f.scenes.push(data); draw(); main.querySelector('[data-add] [name=name]').focus();
    });
  };
  draw();
}

async function section(main, p, f, sid, base, cleanup) {
  const s = f.scenes.find((x) => x.id === sid);
  if (!s) { main.innerHTML = `<p class="empty-note">Esta secção já não existe.</p><a href="${base}/seguimento">Voltar ao seguimento</a>`; return; }
  const idx = f.scenes.indexOf(s); const prev = f.scenes[idx - 1], next = f.scenes[idx + 1];
  const L = layout(f.scenes, p.music?.duration); const me = L.items[idx];
  const shots = f.shots.filter((x) => x.scene_id === s.id);
  const urls = await signedUrls(shots.map((x) => x.image_path));
  const refUrls = await signedUrls((s.refs || []).map((r) => r.path).filter(Boolean));
  const isExtra = (c) => !!c.info?.extra;
  const chips = (ids, kind) => (ids || []).map((id) => { const e = (kind === 'place' ? f.locations : f.characters).find((x) => x.id === id); return e ? `<span class="chip"><a href="${base}/${kind === 'place' ? 'decors' : 'elenco'}/${e.id}">${esc(e.name)}</a><button type="button" class="chip-x" data-rm="${kind}" data-id="${id}" aria-label="Tirar ${esc(e.name)}">${ICON.close}</button></span>` : ''; }).join('');
  const adder = (kind, label) => {
    const used = new Set(kind === 'place' ? s.location_ids || [] : [...(s.character_ids || []), ...(s.extra_ids || [])]);
    const pool = kind === 'place' ? f.locations : f.characters.filter((c) => (kind === 'extra') === isExtra(c));
    return `<select class="mini-sel" data-addent="${kind}" aria-label="Juntar ${label}"><option value="">+ Juntar…</option>${pool.filter((x) => !used.has(x.id)).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}<option value="__new">${kind === 'place' ? 'Outro décor…' : kind === 'extra' ? 'Outro figurante…' : 'Outra pessoa…'}</option></select>`;
  };
  main.innerHTML = `
    <nav class="row between wrap-gap"><a href="${base}/seguimento" class="link-btn">${ICON.back} Seguimento</a>
      <span class="row">${prev ? `<a class="btn ghost" href="${base}/seguimento/${prev.id}">${ICON.back} ${esc(prev.heading)}</a>` : ''}${next ? `<a class="btn ghost" href="${base}/seguimento/${next.id}">${esc(next.heading)} ${ICON.chev}</a>` : ''}</span></nav>
    <div class="seg-mini">${trackHtml(f.scenes, p.music?.duration, { base, f, compact: true })}</div>
    <header class="scene-h"><span class="scene-n" style="background:${me.col}">${idx + 1}</span><div><h1 class="h2">${esc(s.heading || 'Sem nome')}</h1>
      <p class="muted">${me.a != null ? `${fmtT(me.a)}${me.b != null ? ' – ' + fmtT(me.b) : ''}${me.b != null && me.a != null ? ` · ${Math.round(me.b - me.a)} s` : ''}` : 'Sem tempos ainda'}</p></div></header>
    <section class="panel seg-facts">
      <div class="seg-fact"><span class="lbl">Décors</span><p class="chips">${chips(s.location_ids, 'place')}${adder('place', 'décor')}</p></div>
      <div class="seg-fact"><span class="lbl">Artista e elenco</span><p class="chips">${chips(s.character_ids, 'actor')}${adder('actor', 'pessoa')}</p></div>
      <div class="seg-fact"><span class="lbl">Figurantes</span><p class="chips">${chips(s.extra_ids, 'extra')}${adder('extra', 'figurante')}</p></div>
      <form class="row wrap-gap seg-split" data-split><span class="small muted">Partir esta secção em</span><input class="mini-in num" name="at" placeholder="${me.a != null ? fmtT(me.a + 15) : '0:15'}" aria-label="Momento onde partir"><input name="name" placeholder="Nome da nova secção" list="dl-parts" aria-label="Nome da nova secção"><button class="btn ghost">Partir</button></form>
      <datalist id="dl-parts">${PARTS.map((x) => `<option value="${x}">`).join('')}</datalist>
    </section>
    <section class="panel"><h2 class="h3">Descrição</h2><textarea data-notes rows="4" placeholder="O que acontece nesta parte da música: performance, narrativa, ritmo da montagem…">${esc(s.notes || '')}</textarea></section>
    <section class="panel sec-refs" data-refs>
      <div class="row between"><h2 class="h3">Referências</h2><div class="row"><span class="muted small paste-hint">arrasta, cola com Ctrl+V ou</span><button type="button" class="btn ghost" data-addref>${ICON.image} Juntar imagens</button></div></div>
      ${(s.refs || []).length ? `<div class="ref-imgs">${s.refs.map((r, i) => `<figure><button type="button" class="ref-open" data-refopen="${i}" aria-label="Ver em grande"><img src="${esc(refUrls[r.path] || '')}" alt=""></button><button type="button" class="icon-btn sm" data-refrm="${i}" aria-label="Tirar imagem">${ICON.close}</button></figure>`).join('')}</div>` : '<p class="muted small sec-refs-empty">Imagens de referência para esta parte do clipe: luz, cor, enquadramentos, guarda-roupa…</p>'}
    </section>
    <section><div class="row between"><h2 class="h3">Planos</h2><span class="muted small">${shots.length} ${shots.length === 1 ? 'plano' : 'planos'}</span></div>
      <div class="shots" data-shots>${shots.map((x) => shotCard(x, urls[x.image_path], base)).join('')}<button type="button" class="shot-add" data-addshot>${ICON.plus}<span>Plano</span></button></div></section>
    <section class="panel"><h2 class="h3">Tarefas desta secção</h2><div data-tasks></div></section>
    <div class="row end"><button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar secção</button></div>`;
  const t = mountTasks(main.querySelector('[data-tasks]'), { projectId: p.id, entity: { type: 'scene', id: s.id } }); cleanup(() => t.destroy());
  const saveNotes = debounce((v) => sb.from('scenes').update({ notes: v }).eq('id', s.id));
  main.querySelector('[data-notes]').addEventListener('input', (e) => saveNotes(e.target.value));
  bindShots(main, p, f, s, shots, urls, base);
  // referências da secção: imagens (botão, arrastar ou colar com o rato por cima do painel)
  const refsBox = main.querySelector('[data-refs]');
  const addRefs = async (files) => {
    const imgs = [...files].filter((x) => x.type.startsWith('image/')); if (!imgs.length) return;
    toast(imgs.length > 1 ? `A enviar ${imgs.length} imagens…` : 'A enviar a imagem…');
    const add = [];
    for (const file of imgs) { try { const up = await uploadImage(p.id, 'refs', file); add.push({ kind: 'image', path: up.path }); } catch (er) { toast(er.message || String(er)); } }
    s.refs = [...(s.refs || []), ...add];
    const { error } = await sb.from('scenes').update({ refs: s.refs }).eq('id', s.id); if (error) return toast(error.message);
    redraw();
  };
  refsBox.querySelector('[data-addref]').addEventListener('click', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.onchange = () => addRefs(inp.files); inp.click(); });
  refsBox.addEventListener('dragover', (e) => { e.preventDefault(); refsBox.classList.add('drop'); });
  refsBox.addEventListener('dragleave', () => refsBox.classList.remove('drop'));
  refsBox.addEventListener('drop', (e) => { e.preventDefault(); refsBox.classList.remove('drop'); addRefs(e.dataTransfer.files); });
  let overRefs = false;
  refsBox.addEventListener('pointerenter', () => (overRefs = true)); refsBox.addEventListener('pointerleave', () => (overRefs = false));
  const onPaste = (e) => {
    if (!document.body.contains(refsBox)) { document.removeEventListener('paste', onPaste, true); return; }
    if (!overRefs || e.target.closest?.('input, textarea')) return;
    const files = [...(e.clipboardData?.files || [])]; if (!files.some((x) => x.type.startsWith('image/'))) return;
    e.preventDefault(); e.stopPropagation(); addRefs(files);
  };
  document.addEventListener('paste', onPaste, true);
  cleanup(() => document.removeEventListener('paste', onPaste, true));
  refsBox.querySelectorAll('[data-refrm]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('Tirar esta imagem das referências?', 'Tirar'))) return;
    const r = s.refs[+b.dataset.refrm]; s.refs = s.refs.filter((x) => x !== r);
    await sb.from('scenes').update({ refs: s.refs }).eq('id', s.id); if (r?.path) sb.storage.from('files').remove([r.path]); redraw();
  }));
  refsBox.querySelectorAll('[data-refopen]').forEach((b) => b.addEventListener('click', () => {
    const imgs = (s.refs || []).map((r) => refUrls[r.path]).filter(Boolean); let i = +b.dataset.refopen;
    const m = modal('<div class="ref-view"><img alt=""><div class="row between"><button type="button" class="icon-btn" data-p aria-label="Anterior">' + ICON.back + '</button><span class="muted small" data-n></span><button type="button" class="icon-btn" data-nx aria-label="Seguinte">' + ICON.chev + '</button></div></div>', { wide: true });
    const show = () => { m.el.querySelector('img').src = imgs[i]; m.el.querySelector('[data-n]').textContent = `${i + 1} de ${imgs.length}`; };
    m.el.querySelector('[data-p]').onclick = () => { i = (i - 1 + imgs.length) % imgs.length; show(); };
    m.el.querySelector('[data-nx]').onclick = () => { i = (i + 1) % imgs.length; show(); };
    show();
  }));
  const field = { place: 'location_ids', actor: 'character_ids', extra: 'extra_ids' };
  const redraw = () => section(main, p, f, sid, base, cleanup);
  const setIds = async (kind, ids) => { s[field[kind]] = ids; const { error } = await sb.from('scenes').update({ [field[kind]]: ids }).eq('id', s.id); if (error) toast(error.message); if (ids.length) await ensureModules(p, [kind === 'place' ? 'decors' : 'elenco']); redraw(); };
  main.querySelectorAll('[data-addent]').forEach((sel) => sel.addEventListener('change', async () => {
    const kind = sel.dataset.addent; let id = sel.value; if (!id) return;
    if (id === '__new') {
      const name = (prompt(kind === 'place' ? 'Nome do décor' : 'Nome') || '').trim(); // prompt simples: protótipo
      if (!name) { sel.value = ''; return; }
      const table = kind === 'place' ? 'locations' : 'characters';
      const list = kind === 'place' ? f.locations : f.characters;
      const { data, error } = await sb.from(table).insert({ project_id: p.id, name, position: list.length, ...(kind === 'extra' ? { info: { extra: true } } : {}) }).select().single();
      if (error) return toast(error.message);
      list.push(data); id = data.id;
    }
    setIds(kind, [...(s[field[kind]] || []), id]);
  }));
  main.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => setIds(b.dataset.rm, (s[field[b.dataset.rm]] || []).filter((x) => x !== b.dataset.id))));
  main.querySelector('[data-split]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const at = parseT(e.target.at.value); const name = e.target.name.value.trim();
    if (at == null) { toast('Escreve o momento onde partir, por exemplo 1:20.'); return e.target.at.focus(); }
    if ((me.a != null && at <= me.a) || (me.b != null && at >= me.b)) return toast(`Esse momento fica fora desta secção (${fmtT(me.a) || '?'}–${fmtT(me.b) || '?'}).`);
    const n = f.scenes.reduce((m, x) => Math.max(m, Number(x.number) || 0), 0) + 1;
    const after = f.scenes.slice(idx + 1);
    const row = { project_id: p.id, number: String(n), heading: name || `${s.heading} (2)`, starts_at: fmtT(at), ends_at: s.ends_at || null, position: idx + 1, location_ids: s.location_ids || [], character_ids: s.character_ids || [], extra_ids: s.extra_ids || [] };
    const { data, error } = await sb.from('scenes').insert(row).select().single();
    if (error) return toast(error.message);
    await sb.from('scenes').update({ ends_at: fmtT(at) }).eq('id', s.id);
    await Promise.all(after.map((x, i) => sb.from('scenes').update({ position: idx + 2 + i }).eq('id', x.id)));
    toast('Secção partida em duas.'); location.hash = `${base}/seguimento/${data.id}`;
  });
  main.querySelector('[data-del]').addEventListener('click', async () => { if (await deleteSection(s, f)) location.hash = `${base}/seguimento`; });
}

// apagar uma secção (com confirmação). Os planos não se perdem: ficam na shotlist, sem secção.
export async function deleteSection(s, f) {
  const n = f.shots.filter((x) => x.scene_id === s.id).length;
  if (!(await confirmBox(`Apagar a secção "${s.heading || 'Sem nome'}"?${n ? ` Os ${n} ${n === 1 ? 'plano continua' : 'planos continuam'} na shotlist, sem secção.` : ''}`, 'Apagar secção'))) return false;
  if (n) await sb.from('shots').update({ scene_id: null }).eq('scene_id', s.id);
  const { error } = await sb.from('scenes').delete().eq('id', s.id);
  if (error) { toast(error.message); return false; }
  f.scenes.splice(f.scenes.indexOf(s), 1);
  f.shots.forEach((x) => { if (x.scene_id === s.id) x.scene_id = null; });
  toast('Secção apagada.');
  return true;
}

export async function musicStats(pid) {
  const [{ data: sc }, { data: sh }] = await Promise.all([
    sb.from('scenes').select('id, heading, starts_at, ends_at, location_ids, character_ids, extra_ids, position').eq('project_id', pid).order('position'),
    sb.from('shots').select('id').eq('project_id', pid),
  ]);
  return { scenes: sc || [], shots: (sh || []).length };
}

// ---------- décors e pessoas (cada um tem a sua página) ----------
const sectionsWith = (f, kind, id) => f.scenes.filter((s) => (kind === 'place' ? s.location_ids || [] : [...(s.character_ids || []), ...(s.extra_ids || [])]).includes(id));

function entityList(main, p, f, kind, base) {
  const isPlace = kind === 'place';
  const path = isPlace ? 'decors' : 'elenco';
  const card = (e) => { const n = sectionsWith(f, kind, e.id).length; return `<a class="ent-card" href="${base}/${path}/${e.id}"><strong>${esc(e.name)}</strong><span class="muted small">${isPlace ? esc(e.info?.address || 'Sem morada') : esc(e.actor || (e.info?.extra ? 'Figurante' : 'Sem nome real'))}</span><span class="small">${n ? `${n} ${n === 1 ? 'secção' : 'secções'}` : '<span class="muted">Ainda em nenhuma secção</span>'}</span></a>`; };
  const people = f.characters.filter((c) => !c.info?.extra), extras = f.characters.filter((c) => c.info?.extra);
  main.innerHTML = `<div class="row between wrap-gap"><h1 class="h1 pm-title">${isPlace ? 'Décors' : 'Atores e figurantes'}</h1>
      <div class="row">${isPlace ? `<button type="button" class="btn ghost" data-add="place">${ICON.plus} Décor</button>` : `<button type="button" class="btn ghost" data-add="actor">${ICON.plus} Ator ou atriz</button><button type="button" class="btn ghost" data-add="extra">${ICON.plus} Figurante</button>`}</div></div>
    ${isPlace ? (f.locations.length ? `<div class="ent-grid">${f.locations.map(card).join('')}</div>` : '<p class="empty-note">Ainda não há décors. Junta-os aqui ou dentro de cada secção do seguimento.</p>')
      : `<h2 class="h3">Artista e elenco</h2>${people.length ? `<div class="ent-grid">${people.map(card).join('')}</div>` : '<p class="muted small">Ninguém ainda.</p>'}
         <h2 class="h3">Figurantes</h2>${extras.length ? `<div class="ent-grid">${extras.map(card).join('')}</div>` : '<p class="muted small">Ninguém ainda.</p>'}`}`;
  main.querySelectorAll('[data-add]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.add;
    const m = modal(`<h2>${k === 'place' ? 'Novo décor' : k === 'extra' ? 'Novo figurante' : 'Novo ator ou atriz'}</h2><form class="stack"><div class="field"><label for="nm">Nome</label><input id="nm" required></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const table = k === 'place' ? 'locations' : 'characters'; const list = k === 'place' ? f.locations : f.characters;
      const { data, error } = await sb.from(table).insert({ project_id: p.id, name: m.el.querySelector('#nm').value.trim(), position: list.length, ...(k === 'extra' ? { info: { extra: true } } : {}) }).select().single();
      if (error) return toast(error.message);
      m.close(); location.hash = `${base}/${path}/${data.id}`;
    });
  }));
}

async function entityPage(main, p, f, kind, id, base, cleanup) {
  const isPlace = kind === 'place'; const path = isPlace ? 'decors' : 'elenco';
  const list = isPlace ? f.locations : f.characters; const e = list.find((x) => x.id === id);
  if (!e) { main.innerHTML = `<p class="empty-note">Já não existe.</p><a href="${base}/${path}">Voltar</a>`; return; }
  const secs = sectionsWith(f, kind, id);
  const info = { ...(e.info || {}) };
  const fields = isPlace ? [['address', 'Morada / localização', 'Onde fica, como se chega, contacto do local'], ['notes', 'Notas', 'Autorizações, horários, luz natural, som, estacionamento…']]
    : [['role', 'Papel no clipe', 'ex: o artista, a mulher do bar, dançarina'], ['contact', 'Contacto', 'Telefone, email, agência'], ['notes', 'Notas', 'Guarda-roupa, cabelo e maquilhagem, disponibilidade…']];
  main.innerHTML = `
    <nav class="row between wrap-gap"><a href="${base}/${path}" class="link-btn">${ICON.back} ${isPlace ? 'Décors' : 'Atores e figurantes'}</a></nav>
    <header class="row between wrap-gap"><div><span class="small muted">${isPlace ? 'Décor' : info.extra ? 'Figurante' : 'Ator ou atriz'}</span><input class="title-in h1" data-name value="${esc(e.name)}" aria-label="Nome"></div>
      <button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button></header>
    <div class="ent-layout">
      <section class="panel stack">
        ${isPlace ? '' : `<div class="field"><label for="ea">Nome real</label><input id="ea" data-actor value="${esc(e.actor || '')}" placeholder="Quem faz"></div>${''}<label class="row small"><input type="checkbox" data-extra ${info.extra ? 'checked' : ''}> É figurante</label>`}
        ${fields.map(([k, l, ph]) => `<div class="field"><label for="ei-${k}">${l}</label><textarea id="ei-${k}" data-info="${k}" rows="${k === 'notes' ? 4 : 2}" placeholder="${esc(ph)}">${esc(info[k] || '')}</textarea></div>`).join('')}
      </section>
      <section class="panel"><h2 class="h3">Aparece em</h2>
        ${secs.length ? `<ul class="ent-secs">${secs.map((s) => { const i = f.scenes.indexOf(s); return `<li><a href="${base}/seguimento/${s.id}"><i class="seg-dot" style="--sc:${SEG_COLORS[i % SEG_COLORS.length]}"></i><span>${esc(s.heading || 'Sem nome')}</span><span class="muted small">${esc([s.starts_at, s.ends_at].filter(Boolean).join('–'))}</span></a></li>`; }).join('')}</ul>` : '<p class="muted small">Ainda em nenhuma secção. Junta-o dentro de uma secção do seguimento.</p>'}
      </section>
    </div>
    <section class="panel"><h2 class="h3">Tarefas</h2><div data-tasks></div></section>`;
  const table = isPlace ? 'locations' : 'characters';
  const save = debounce((patch) => sb.from(table).update(patch).eq('id', e.id).then(({ error }) => error && toast(error.message)), 500);
  main.querySelector('[data-name]').addEventListener('input', (ev) => { e.name = ev.target.value; save({ name: e.name }); });
  main.querySelector('[data-actor]')?.addEventListener('input', (ev) => { e.actor = ev.target.value; save({ actor: e.actor }); });
  main.querySelector('[data-extra]')?.addEventListener('change', async (ev) => {
    info.extra = ev.target.checked; e.info = { ...info };
    // passa a secção certa: figurantes ficam em extra_ids, o resto em character_ids
    await sb.from(table).update({ info }).eq('id', e.id);
    await Promise.all(secs.map((s) => { const c = (s.character_ids || []).filter((x) => x !== id), x = (s.extra_ids || []).filter((y) => y !== id); (info.extra ? x : c).push(id); s.character_ids = c; s.extra_ids = x; return sb.from('scenes').update({ character_ids: c, extra_ids: x }).eq('id', s.id); }));
    toast(info.extra ? 'Agora é figurante.' : 'Agora está no elenco.');
  });
  main.querySelectorAll('[data-info]').forEach((t) => t.addEventListener('input', () => { info[t.dataset.info] = t.value; e.info = { ...info }; save({ info: e.info }); }));
  main.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar "${e.name}"? Sai também das secções onde está.`, 'Apagar'))) return;
    const key = isPlace ? ['location_ids'] : ['character_ids', 'extra_ids'];
    await Promise.all(secs.map((s) => { const patch = {}; key.forEach((k) => (patch[k] = (s[k] || []).filter((x) => x !== id))); return sb.from('scenes').update(patch).eq('id', s.id); }));
    const { error } = await sb.from(table).delete().eq('id', e.id);
    if (error) return toast(error.message);
    location.hash = `${base}/${path}`;
  });
  const t = mountTasks(main.querySelector('[data-tasks]'), { projectId: p.id, entity: { type: isPlace ? 'location' : 'character', id: e.id } }); cleanup(() => t.destroy());
}

// ---------- storyboard geral: todos os planos, secção a secção ----------
async function storyboard(main, p, f, base) {
  const urls = await signedUrls(f.shots.map((x) => x.image_path).filter(Boolean));
  const L = layout(f.scenes, p.music?.duration);
  const moveOpts = (y) => `<select class="sb-move" data-move="${y.id}" aria-label="Mover para outra secção" title="Mover para outra secção"><option value="">Mover para…</option>${f.scenes.filter((s2) => s2.id !== y.scene_id).map((s2) => `<option value="${s2.id}">${esc(s2.heading || 'Sem nome')}</option>`).join('')}${y.scene_id ? '<option value="__none">Sem secção</option>' : ''}</select>`;
  const card = (y) => `<div class="sb-card" draggable="true" data-shot="${y.id}">
      <a class="sb-shot" href="${base}/plano/${y.id}" draggable="false"><span class="sb-img">${urls[y.image_path] ? `<img src="${esc(urls[y.image_path])}" alt="" loading="lazy" draggable="false">` : `${ICON.image}<small>Sem imagem</small>`}</span><span class="sb-cap">${y.code ? `<b>${esc(y.code)}</b>` : ''}${esc([y.framing, y.movement, y.direction_notes].filter(Boolean).join(' · '))}</span>${y.description ? `<span class="sb-desc">${esc(y.description)}</span>` : ''}</a>
      <div class="sb-tools">${moveOpts(y)}<button type="button" class="icon-btn sm" data-delshot="${y.id}" title="Apagar plano" aria-label="Apagar plano">${ICON.trash}</button></div>
    </div>`;
  const sec = (sid, title, color, shots, href, sub) => `<section class="sb-sec" style="--sc:${color}" data-drop="${sid}">
      <div class="sb-h"><i class="seg-dot"></i>${href ? `<a href="${href}"><strong>${esc(title)}</strong></a>` : `<strong>${esc(title)}</strong>`}${sub ? `<span class="muted small">${esc(sub)}</span>` : ''}<span class="muted small">· ${shots.length} ${shots.length === 1 ? 'plano' : 'planos'}</span>${sid ? `<button type="button" class="icon-btn sm sb-secdel" data-delsec="${sid}" title="Apagar secção" aria-label="Apagar a secção ${esc(title)}">${ICON.trash}</button>` : ''}</div>
      ${shots.length ? `<div class="sb-grid">${shots.map(card).join('')}</div>` : `<p class="sb-empty muted small">Arrasta planos para aqui${href ? ` ou <a href="${href}">junta-os na secção</a>` : ''}.</p>`}
    </section>`;
  const loose = f.shots.filter((y) => !y.scene_id || !f.scenes.some((s2) => s2.id === y.scene_id));
  const byPos = (a, b) => (a.position || 0) - (b.position || 0);
  main.innerHTML = `<div class="row between wrap-gap"><div><h1 class="h1 pm-title">Storyboard</h1><p class="muted">Todos os planos, pela ordem da música. Carrega num plano para o abrir; arrasta-o para outra secção para o mudar. Para juntar uma imagem, cola com Ctrl+V com o rato por cima do plano.</p></div><span class="muted small">${f.shots.length} ${f.shots.length === 1 ? 'plano' : 'planos'}</span></div>
    ${f.scenes.length ? trackHtml(f.scenes, p.music?.duration, { base, f, compact: true }) : ''}
    ${L.items.map((x) => sec(x.s.id, x.s.heading || 'Sem nome', x.col, f.shots.filter((y) => y.scene_id === x.s.id).sort(byPos), `${base}/seguimento/${x.s.id}`, x.a != null ? fmtT(x.a) + (x.b != null ? '–' + fmtT(x.b) : '') : '')).join('')}
    ${loose.length ? sec('', 'Sem secção', '#8A8A99', loose.sort(byPos), null, 'da shotlist, ainda por arrumar') : ''}
    ${!f.scenes.length && !f.shots.length ? `<div class="empty-box"><p>Ainda não há planos.</p><p class="muted small">Junta-os numa secção do seguimento ou na shotlist.</p><a class="btn primary" href="${base}/seguimento">Abrir o seguimento</a></div>` : ''}`;
  const redraw = () => storyboard(main, p, f, base);
  const moveTo = async (id, to) => {
    const sh = f.shots.find((x) => x.id === id); if (!sh) return;
    const pos = Math.max(0, ...f.shots.filter((y) => (y.scene_id || null) === to).map((y) => y.position || 0)) + 1;
    const { error } = await sb.from('shots').update({ scene_id: to, position: pos, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) return toast(error.message);
    sh.scene_id = to; sh.position = pos; toast(to ? `Movido para "${f.scenes.find((s2) => s2.id === to)?.heading || 'secção'}".` : 'Movido para "Sem secção".'); redraw();
  };
  let hover = null;
  main.querySelectorAll('.sb-card').forEach((c) => {
    c.addEventListener('pointerenter', () => (hover = c.dataset.shot));
    c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/x-shot', c.dataset.shot); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  });
  main.querySelectorAll('[data-drop]').forEach((z) => {
    z.addEventListener('dragover', (e) => { if (![...e.dataTransfer.types].includes('text/x-shot')) return; e.preventDefault(); z.classList.add('drop'); });
    z.addEventListener('dragleave', (e) => { if (!z.contains(e.relatedTarget)) z.classList.remove('drop'); });
    z.addEventListener('drop', (e) => { const id = e.dataTransfer.getData('text/x-shot'); z.classList.remove('drop'); if (!id) return; e.preventDefault(); const to = z.dataset.drop || null; const sh = f.shots.find((x) => x.id === id); if ((sh?.scene_id || null) !== to) moveTo(id, to); });
  });
  main.querySelectorAll('[data-move]').forEach((sel) => sel.addEventListener('change', () => { if (!sel.value) return; moveTo(sel.dataset.move, sel.value === '__none' ? null : sel.value); }));
  main.querySelectorAll('[data-delsec]').forEach((b) => b.addEventListener('click', async () => {
    const sc = f.scenes.find((x) => x.id === b.dataset.delsec);
    if (sc && (await deleteSection(sc, f))) redraw();
  }));
  main.querySelectorAll('[data-delshot]').forEach((b) => b.addEventListener('click', async () => {
    const sh = f.shots.find((x) => x.id === b.dataset.delshot);
    if (!(await confirmBox(`Apagar o plano "${sh.code || sh.description || 'sem nome'}"? Sai também da shotlist e da secção.`, 'Apagar plano'))) return;
    const { error } = await sb.from('shots').delete().eq('id', sh.id); if (error) return toast(error.message);
    f.shots.splice(f.shots.indexOf(sh), 1); toast('Plano apagado.'); redraw();
  }));
  const setImg = async (sh, file) => {
    try { toast('A enviar a imagem…'); const up = await uploadImage(p.id, 'storyboard', file); const { error } = await sb.from('shots').update({ image_path: up.path, updated_at: new Date().toISOString() }).eq('id', sh.id); if (error) return toast(error.message); sh.image_path = up.path; redraw(); } catch (e) { toast(e.message || String(e)); }
  };
  const onPaste = (e) => {
    if (!document.body.contains(main.querySelector('.sb-card'))) { document.removeEventListener('paste', onPaste); return; }
    const file = [...(e.clipboardData?.files || [])].find((x) => x.type.startsWith('image/')); if (!file || !hover) return;
    e.preventDefault(); setImg(f.shots.find((x) => x.id === hover), file);
  };
  document.addEventListener('paste', onPaste);
}

// Música, pre-vis e referências como ferramenta (para qualquer projeto ou departamento)
export function mediaTool(box, p, tool) {
  const music = { ...(tool.data || {}) };
  const saveNow = async () => { const { error } = await sb.from('boards').update({ data: music, updated_at: new Date().toISOString() }).eq('id', tool.id); if (error) { toast(error.message); return false; } tool.data = { ...music }; return true; };
  box.innerHTML = `<div data-lay><div data-blk="previs"><div data-slot="previs"></div></div><div data-blk="song"><div data-slot="song"></div></div><div data-blk="refs"><div data-slot="refs"></div></div></div>`;
  mediaPanel({ previs: box.querySelector('[data-slot=previs]'), song: box.querySelector('[data-slot=song]'), refs: box.querySelector('[data-slot=refs]') }, p, music, saveNow);
  mountLayout(box.querySelector('[data-lay]'), { project: p, key: 'tool-' + tool.id, title: 'ferramenta', blocks: [
    { id: 'previs', label: 'Pre-vis', pos: 'left' }, { id: 'song', label: 'A música', pos: 'right' }, { id: 'refs', label: 'Referências', pos: 'full' },
  ] });
}
