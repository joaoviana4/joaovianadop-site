import { sb, esc, toast, modal, confirmBox, ICON, signedUrls, uploadImage } from './lib.js';
import { mountTasks } from './tasks.js';

// Adereços (departamento de Arte), como no Studio: de ação e de cenário, estados com cores,
// página própria com cenas, interações, continuidade e referências. Análise do guião no Claude (grátis) ou rápida.

export const PROP_STATUS = [
  ['por_arranjar', 'Por arranjar', '#E5484D'], ['em_procura', 'Em procura', '#F08A24'], ['encomendado', 'Encomendado', '#E3B341'],
  ['comprado', 'Comprado', '#3CC98A'], ['alugado', 'Alugado', '#2AA8A8'], ['emprestado', 'Emprestado', '#2AA8A8'],
  ['construido', 'Construído pela arte', '#9B6CFF'], ['pronto', 'Pronto', '#1F7A4D'],
];
const statusOf = (k) => PROP_STATUS.find((s) => s[0] === k) || PROP_STATUS[0];
const st = { tab: 'acao', sort: 'scene', filter: '', q: '', view: (() => { try { return localStorage.getItem('bg-props-view') || 'list'; } catch { return 'list'; } })() };
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 });
export const RENTED = new Set(['alugado', 'emprestado']);

async function load(pid) {
  const [pr, sc, ch, lo, bu] = await Promise.all([
    sb.from('props').select('*').eq('project_id', pid).order('name'),
    sb.from('scenes').select('id, number, heading, body, character_ids, location_id, position').eq('project_id', pid).order('position'),
    sb.from('characters').select('id, name').eq('project_id', pid),
    sb.from('locations').select('id, name').eq('project_id', pid),
    sb.from('prop_bundles').select('*').eq('project_id', pid).order('created_at'),
  ]);
  return { props: pr.data || [], scenes: sc.data || [], characters: ch.data || [], locations: lo.data || [], bundles: bu.data || [] };
}

// custo total: adereços soltos + cada pacote contado uma vez
export function propsCost(props, bundles) {
  const live = props.filter((x) => !x.removed);
  const loose = live.filter((x) => !x.bundle_id).reduce((a, x) => a + (Number(x.price) || 0), 0);
  const used = new Set(live.map((x) => x.bundle_id).filter(Boolean));
  return loose + bundles.filter((b) => used.has(b.id)).reduce((a, b) => a + (Number(b.total) || 0), 0);
}
const priceLabel = (x, f) => { const bu = x.bundle_id && f.bundles.find((b) => b.id === x.bundle_id); if (bu) return `Pacote · ${esc(bu.name)}`; return x.price != null && x.price !== '' ? eur.format(x.price) : ''; };

export async function propsPage(main, p, sub, base, cleanup) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const f = await load(p.id);
  if (sub) return propPage(main, p, f, sub, base, cleanup);
  const hasScenes = f.scenes.length > 0; const clip = p.kind === 'videoclipe';
  if (!hasScenes && st.sort === 'scene') st.sort = 'name';
  const urls = await signedUrls(f.props.map((x) => (x.refs || []).find((r) => r.kind === 'image')?.path).filter(Boolean));
  const draw = () => {
    const visible = f.props.filter((x) => !x.removed && x.type === st.tab);
    const counts = Object.fromEntries(PROP_STATUS.map(([k]) => [k, visible.filter((x) => x.status === k).length]));
    const norm = (v) => String(v || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const list = visible.filter((x) => (!st.filter || x.status === st.filter) && (!st.q || norm(`${x.name} ${x.category} ${x.supplier}`).includes(norm(st.q))));
    const cost = propsCost(f.props, f.bundles);
    main.innerHTML = `
      <div class="row between wrap-gap"><div><h1 class="h1 pm-title">Adereços</h1>${cost ? `<p class="muted">Custo total ${eur.format(cost)}${f.bundles.length ? ` · ${f.bundles.length} ${f.bundles.length === 1 ? 'pacote de aluguer' : 'pacotes de aluguer'}` : ''}</p>` : ''}</div>
        <div class="row wrap-gap"><button type="button" class="btn ghost" data-add>${ICON.plus} Adereço</button>${hasScenes && !clip ? '<button type="button" class="btn primary" data-analyze>Analisar o guião</button>' : ''}</div></div>
      <div class="props-bar">
        <div class="seg dark" role="tablist">${[['acao', 'De ação'], ['cenario', 'De cenário']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" data-tab="${k}">${l} (${f.props.filter((x) => !x.removed && x.type === k).length})</button>`).join('')}</div>
        <label class="search"><span class="vh">Procurar adereços</span>${ICON.search}<input type="search" data-q value="${esc(st.q)}" placeholder="Procurar…" autocomplete="off"></label>
        <label class="sel"><span class="vh">Ordenar</span><select data-sort>${[...(hasScenes ? [['scene', clip ? 'Por secção' : 'Por cena']] : []), ['name', 'Ordem alfabética'], ['status', 'Por estado'], ['category', 'Por categoria'], ['price_desc', 'Preço: mais caro'], ['price_asc', 'Preço: mais barato'], ['supplier', 'Por fornecedor'], ['recent', 'Mais recentes']].map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <div class="seg dark view-seg" role="radiogroup" aria-label="Vista">${[['list', ICON.list, 'Lista'], ['grid', ICON.image, 'Grelha']].map(([k, ic, l]) => `<button type="button" role="radio" aria-checked="${st.view === k}" aria-selected="${st.view === k}" data-view="${k}" title="${l}">${ic}<span>${l}</span></button>`).join('')}</div>
      </div>
      ${visible.length ? `<div class="status-bar">${PROP_STATUS.filter(([k]) => counts[k]).map(([k, l, c]) => `<i style="flex:${counts[k]};background:${c}" title="${l}: ${counts[k]}"></i>`).join('')}</div>
      <div class="pills">${PROP_STATUS.filter(([k]) => counts[k]).map(([k, l, c]) => `<button type="button" class="pill ${st.filter === k ? 'on' : ''}" data-filter="${k}" style="--c:${c}"><i></i>${l} ${counts[k]}</button>`).join('')}${st.filter ? '<button type="button" class="link-btn" data-filter="">Ver todos</button>' : ''}</div>` : ''}
      <section class="${st.view === 'grid' ? 'props-gridwrap' : 'panel'}" data-listbox>${list.length ? renderList(list, f, base, urls) : `<p class="empty-note">${st.q ? `Nenhum adereço com "${esc(st.q)}".` : f.props.length ? 'Nada com este filtro.' : (hasScenes ? 'Ainda não há adereços. Analisa o guião ou junta-os à mão.' : 'Ainda não há adereços. Junta-os em "Adereço".')}</p>`}</section>`;
    main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; st.filter = ''; draw(); }));
    main.querySelector('[data-sort]').addEventListener('change', (e) => { st.sort = e.target.value; draw(); });
    main.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { st.filter = b.dataset.filter; draw(); }));
    main.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; try { localStorage.setItem('bg-props-view', st.view); } catch { /* sem armazenamento */ } draw(); }));
    const q = main.querySelector('[data-q]');
    q.addEventListener('input', () => { st.q = q.value; const pos = q.selectionStart; draw(); const nq = main.querySelector('[data-q]'); nq.focus(); nq.setSelectionRange(pos, pos); });
    main.querySelectorAll('[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
      const x = f.props.find((y) => y.id === sel.dataset.status); x.status = sel.value;
      await sb.from('props').update({ status: sel.value }).eq('id', x.id);
      sel.closest('[data-prop]').style.setProperty('--c', statusOf(sel.value)[2]);
    }));
    main.querySelector('[data-add]').addEventListener('click', () => {
      const m = modal(`<h2>Novo adereço</h2><form class="stack"><div class="field"><label for="pn">Nome</label><input id="pn" required></div>
        <div class="field"><label for="pt">Tipo</label><select id="pt"><option value="acao" ${st.tab === 'acao' ? 'selected' : ''}>De ação</option><option value="cenario" ${st.tab === 'cenario' ? 'selected' : ''}>De cenário</option></select></div>
        <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div></form>`);
      m.el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const { data, error } = await sb.from('props').insert({ project_id: p.id, name: m.el.querySelector('#pn').value.trim(), type: m.el.querySelector('#pt').value, manual: true }).select().single();
        if (error) return toast(error.message); m.close(); location.hash = `${base}/aderecos/${data.id}`;
      });
    });
    main.querySelector('[data-analyze]')?.addEventListener('click', () => analyze(p, f, () => propsPage(main, p, null, base, cleanup)));
  };
  draw();
}

function row(x, f, base) {
  const [, , c] = statusOf(x.status);
  const scenes = (x.scene_ids || []).map((id) => f.scenes.find((s) => s.id === id)?.number).filter(Boolean);
  const pr = priceLabel(x, f);
  return `<li class="prop-row" data-prop="${x.id}" style="--c:${c}">
    <a href="${base}/aderecos/${x.id}" class="prop-main"><strong>${esc(x.name)}</strong><span class="small muted">${[x.category, x.quantity > 1 ? `${x.quantity} un.` : '', x.supplier, scenes.length ? `Cenas ${scenes.join(', ')}` : ''].filter(Boolean).map(esc).join(' · ')}</span></a>
    ${pr ? `<span class="prop-price">${pr}</span>` : ''}
    <label class="sel"><span class="vh">Estado de ${esc(x.name)}</span><select data-status="${x.id}">${PROP_STATUS.map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </li>`;
}
function tile(x, f, base, urls) {
  const [, l, c] = statusOf(x.status);
  const img = urls[(x.refs || []).find((r) => r.kind === 'image')?.path];
  const pr = priceLabel(x, f); const n = (x.refs || []).filter((r) => r.kind === 'image').length;
  return `<a class="prop-tile" href="${base}/aderecos/${x.id}" style="--c:${c}">
    <span class="pt-img">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : `<span class="pt-empty">${ICON.prop}</span>`}<span class="pt-st"><i></i>${l}</span>${n > 1 ? `<span class="pt-n">${n} fotos</span>` : ''}</span>
    <span class="pt-name">${esc(x.name)}</span>
    <span class="pt-meta">${[x.category, pr].filter(Boolean).join(' · ') || '&nbsp;'}</span>
  </a>`;
}
function renderList(list, f, base, urls) {
  const wrap = (ps) => (st.view === 'grid' ? `<div class="prop-grid">${ps.map((x) => tile(x, f, base, urls)).join('')}</div>` : `<ul class="prop-list">${ps.map((x) => row(x, f, base)).join('')}</ul>`);
  const group = (title, ps) => (ps.length ? `<h3 class="prop-gh">${title}</h3>${wrap(ps)}` : '');
  if (st.sort === 'scene') {
    return f.scenes.map((s) => group(`<span class="scene-n sm">${esc(s.number)}</span>${esc(s.heading)}`, list.filter((x) => (x.scene_ids || []).includes(s.id)))).join('')
      + group('Sem cena', list.filter((x) => !(x.scene_ids || []).length));
  }
  if (st.sort === 'status') return PROP_STATUS.map(([k, l]) => group(l, list.filter((x) => x.status === k))).join('');
  if (st.sort === 'category') { const cats = [...new Set(list.map((x) => x.category || 'Sem categoria'))].sort(); return cats.map((c) => group(esc(c), list.filter((x) => (x.category || 'Sem categoria') === c))).join(''); }
  if (st.sort === 'supplier') { const sups = [...new Set(list.map((x) => x.supplier || 'Sem fornecedor'))].sort(); return sups.map((c) => group(esc(c), list.filter((x) => (x.supplier || 'Sem fornecedor') === c))).join(''); }
  const cost = (x) => { if (x.bundle_id) { const bu = f.bundles.find((b) => b.id === x.bundle_id); const n = f.props.filter((y) => y.bundle_id === x.bundle_id && !y.removed).length || 1; return (Number(bu?.total) || 0) / n; } return x.price == null ? null : Number(x.price); };
  const sorted = [...list].sort((a, b) => {
    if (st.sort === 'price_desc' || st.sort === 'price_asc') { const A = cost(a), B = cost(b); if (A == null && B == null) return a.name.localeCompare(b.name, 'pt'); if (A == null) return 1; if (B == null) return -1; return st.sort === 'price_desc' ? B - A : A - B; }
    if (st.sort === 'recent') return (b.created_at || '').localeCompare(a.created_at || '');
    return a.name.localeCompare(b.name, 'pt');
  });
  return wrap(sorted);
}

// ---------- página do adereço ----------
async function propPage(main, p, f, id, base, cleanup) {
  const x = f.props.find((y) => y.id === id);
  if (!x) { main.innerHTML = '<p class="empty-note">Este adereço já não existe.</p>'; return; }
  const imgs = (x.refs || []).filter((r) => r.kind === 'image'); const links = (x.refs || []).filter((r) => r.kind === 'link');
  const urls = await signedUrls(imgs.map((r) => r.path));
  const scenes = f.scenes.filter((s) => (x.scene_ids || []).includes(s.id));
  const excerpt = (s) => { const lines = (s.body || '').split('\n').filter((l) => l.toLowerCase().includes(x.name.toLowerCase().split(' ')[0])); return lines.slice(0, 2).join(' … '); };
  const chips = (ids, list, key) => `<div class="chips">${(ids || []).map((i) => { const e = list.find((y) => y.id === i); return e ? `<span class="chip">${esc(e.name)}<button type="button" class="chip-x" data-rm="${key}:${i}" aria-label="Tirar ${esc(e.name)}">${ICON.close}</button></span>` : ''; }).join('')}
    <label class="sel chip-add"><span class="vh">Juntar</span><select data-addrel="${key}"><option value="">+ Juntar</option>${list.filter((e) => !(ids || []).includes(e.id)).map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label></div>`;
  main.innerHTML = `<a href="${base}/aderecos" class="link-btn">${ICON.back} Adereços</a>
    <header class="ent-h"><h1 class="h1">${esc(x.name)}</h1><button type="button" class="icon-btn" data-delprop aria-label="Tirar adereço">${ICON.trash}</button></header>
    <div class="pm-grid"><div class="pm-boards stack">
      <section class="panel stack"><div class="grid2">
        <div class="field"><label for="pty">Tipo</label><select id="pty" data-k="type"><option value="acao" ${x.type === 'acao' ? 'selected' : ''}>De ação</option><option value="cenario" ${x.type === 'cenario' ? 'selected' : ''}>De cenário</option></select></div>
        <div class="field"><label for="pst">Estado</label><select id="pst" data-k="status">${PROP_STATUS.map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="pca">Categoria</label><input id="pca" data-k="category" value="${esc(x.category)}" list="pcats"><datalist id="pcats">${['Mobiliário', 'Decoração', 'Comida e bebida', 'Documentos', 'Eletrónica', 'Armas de cena', 'Veículos', 'Roupa e acessórios', 'Iluminação prática'].map((c) => `<option value="${c}">`).join('')}</datalist></div>
        <div class="field"><label for="pq">Quantidade</label><input id="pq" type="number" min="1" data-k="quantity" value="${esc(x.quantity)}"></div>
      </div>
      <div class="field"><label for="pd">Descrição</label><textarea id="pd" rows="3" data-k="description">${esc(x.description)}</textarea></div>
      <div class="field"><label for="pco">Continuidade (parte-se, molha-se, fica vazio…)</label><textarea id="pco" rows="2" data-k="continuity">${esc(x.continuity)}</textarea></div></section>
      <section class="panel stack" data-acq></section>
      <section class="panel"><h2 class="h3">Interações</h2>${(x.interactions || []).length ? `<ul class="inter">${x.interactions.map((it) => `<li><strong>${esc(it.character || '—')}</strong> · ${esc(it.action || '')}${it.scene ? ` <span class="muted small">(cena ${esc(it.scene)})</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Sem interações registadas.</p>'}</section>
      <section class="panel"><div class="row between"><h2 class="h3">Referências</h2><div class="row"><button type="button" class="btn ghost" data-addimg>${ICON.image} Imagens</button><button type="button" class="btn ghost" data-addlink>${ICON.link} Link</button></div></div>
        ${imgs.length ? `<div class="photo-grid">${imgs.map((r, i) => `<figure><img src="${esc(urls[r.path] || '')}" alt=""><button type="button" class="icon-btn sm" data-rmimg="${i}" aria-label="Tirar imagem">${ICON.close}</button></figure>`).join('')}</div>` : ''}
        ${links.length ? `<ul class="links">${links.map((r, i) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title || r.url)}</a><button type="button" class="icon-btn sm" data-rmlink="${i}" aria-label="Tirar link">${ICON.close}</button></li>`).join('')}</ul>` : ''}
        ${!imgs.length && !links.length ? '<p class="muted small">Imagens e links para produtos.</p>' : ''}</section>
      <section class="panel"><h2 class="h3">Tarefas</h2><div data-tasks></div></section>
    </div><aside class="pm-side stack">
      ${f.scenes.length ? `<section class="panel"><h2 class="h3">${p.kind === 'videoclipe' ? 'Secções' : 'Cenas'} (${scenes.length})</h2>${scenes.map((s) => `<a class="scene-ex" href="${base}/${p.kind === 'videoclipe' ? 'seguimento' : 'cenas'}/${s.id}"><span class="scene-n sm">${esc(s.number)}</span><span><span class="small">${esc(s.heading)}</span>${excerpt(s) ? `<span class="small muted mono">${esc(excerpt(s))}</span>` : ''}</span></a>`).join('')}${chips(x.scene_ids, f.scenes.map((s) => ({ id: s.id, name: p.kind === 'videoclipe' ? s.heading : `Cena ${s.number}` })), 'scene_ids')}</section>` : ''}
      ${f.characters.length ? `<section class="panel"><h2 class="h3">${p.kind === 'videoclipe' ? 'Atores e figurantes' : 'Personagens'}</h2>${chips(x.character_ids, f.characters, 'character_ids')}</section>` : ''}
      ${f.locations.length ? `<section class="panel"><h2 class="h3">Décors</h2>${chips(x.location_ids, f.locations, 'location_ids')}</section>` : ''}
    </aside></div>`;
  const savers = {};
  main.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => {
    const k = el.dataset.k; x[k] = el.type === 'number' ? Number(el.value) || 1 : el.value;
    (savers[k] ||= debounce((v) => sb.from('props').update({ [k]: v }).eq('id', x.id)))(x[k]);
  }));
  const reload = () => propPage(main, p, f, id, base, cleanup);
  const saveRel = async (key) => { await sb.from('props').update({ [key]: x[key] }).eq('id', x.id); reload(); };
  main.querySelectorAll('[data-addrel]').forEach((s) => s.addEventListener('change', () => { if (!s.value) return; const k = s.dataset.addrel; x[k] = [...(x[k] || []), s.value]; saveRel(k); }));
  main.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => { const [k, v] = b.dataset.rm.split(':'); x[k] = (x[k] || []).filter((i) => i !== v); saveRel(k); }));
  const saveRefs = async () => { await sb.from('props').update({ refs: x.refs }).eq('id', x.id); reload(); };
  main.querySelector('[data-addimg]').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = async () => { toast('A enviar…'); for (const file of inp.files) { try { const up = await uploadImage(p.id, 'props', file); x.refs = [...(x.refs || []), { kind: 'image', path: up.path }]; } catch (e) { toast(e.message); } } saveRefs(); };
    inp.click();
  });
  main.querySelector('[data-addlink]').addEventListener('click', () => {
    const m = modal(`<h2>Link para produto</h2><form class="stack"><div class="field"><label for="lu">Endereço</label><input id="lu" type="url" required placeholder="https://"></div><div class="field"><label for="lt">Nome (opcional)</label><input id="lt"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); let u = m.el.querySelector('#lu').value.trim(); if (!/^https?:\/\//.test(u)) u = 'https://' + u; x.refs = [...(x.refs || []), { kind: 'link', url: u, title: m.el.querySelector('#lt').value.trim() }]; m.close(); saveRefs(); });
  });
  main.querySelectorAll('[data-rmimg]').forEach((b) => b.addEventListener('click', () => { const r = imgs[+b.dataset.rmimg]; x.refs = x.refs.filter((y) => y !== r); saveRefs(); }));
  main.querySelectorAll('[data-rmlink]').forEach((b) => b.addEventListener('click', () => { const r = links[+b.dataset.rmlink]; x.refs = x.refs.filter((y) => y !== r); saveRefs(); }));
  main.querySelector('[data-delprop]').addEventListener('click', async () => {
    if (!(await confirmBox(`Tirar "${x.name}"? Não volta numa nova análise.`, 'Tirar'))) return;
    await sb.from('props').update({ removed: true }).eq('id', x.id); location.hash = `${base}/aderecos`;
  });
  const t = mountTasks(main.querySelector('[data-tasks]'), { projectId: p.id, entity: { type: 'prop', id: x.id } }); cleanup(() => t.destroy());
  acquisition(main.querySelector('[data-acq]'), p, f, x);
  main.querySelector('#pst').addEventListener('change', () => acquisition(main.querySelector('[data-acq]'), p, f, x));
}

// ---------- quanto custa e de onde vem ----------
function acquisition(box, p, f, x) {
  const rented = RENTED.has(x.status);
  const bu = x.bundle_id ? f.bundles.find((b) => b.id === x.bundle_id) : null;
  const mates = bu ? f.props.filter((y) => y.bundle_id === bu.id && !y.removed && y.id !== x.id) : [];
  const lbl = { comprado: 'Preço de compra', construido: 'Custo de construção (materiais)', alugado: 'Valor do aluguer', emprestado: 'Valor (se houver)', encomendado: 'Preço', pronto: 'Custo' }[x.status] || 'Preço previsto';
  const supLbl = x.status === 'emprestado' ? 'Quem emprestou' : x.status === 'alugado' ? 'Alugado a' : x.status === 'construido' ? 'Quem construiu' : 'Onde se compra / fornecedor';
  box.innerHTML = `<div class="row between"><h2 class="h3">${ICON.money} Custo e origem</h2>${bu ? '<span class="tag internal">Pacote</span>' : ''}</div>
    <div class="grid2">
      <div class="field"><label for="psu">${supLbl}</label><input id="psu" data-acqk="supplier" value="${esc(x.supplier || bu?.supplier || '')}" list="psups" placeholder="ex: Adereços & Cia, Feira da Ladra, IKEA"><datalist id="psups">${[...new Set(f.props.map((y) => y.supplier).concat(f.bundles.map((b) => b.supplier)).filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist></div>
      ${bu ? `<div class="field"><span class="label">${lbl}</span><p class="acq-in">Incluído no pacote</p></div>` : `<div class="field"><label for="ppr">${lbl} (€)</label><input id="ppr" data-acqk="price" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(x.price ?? '')}" placeholder="0,00"></div>`}
      ${rented ? `<div class="field"><label for="prb">Devolver até</label><input id="prb" data-acqk="return_by" type="date" value="${esc(x.return_by || '')}"></div>` : ''}
    </div>
    ${rented ? `<div class="acq-bundle">
      <div class="seg dark" role="radiogroup" aria-label="Como foi alugado">${[['solo', 'Sozinho'], ['bundle', 'Em pacote com outros adereços']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${(k === 'bundle') === !!bu}" aria-selected="${(k === 'bundle') === !!bu}" data-bmode="${k}">${l}</button>`).join('')}</div>
      ${bu ? `<div class="bundle-card">
          <div class="grid2"><div class="field"><label for="bn">Nome do pacote</label><input id="bn" data-bk="name" value="${esc(bu.name)}"></div>
          <div class="field"><label for="bt">Valor total do pacote (€)</label><input id="bt" data-bk="total" type="number" step="0.01" min="0" value="${esc(bu.total ?? '')}"></div></div>
          <p class="small muted">${mates.length ? `No mesmo pacote: ${mates.map((y) => `<a href="#${location.hash.slice(1).replace(/[^/]+$/, y.id)}">${esc(y.name)}</a>`).join(', ')}` : 'Ainda é o único adereço neste pacote. Junta os outros na página de cada um.'}${bu.total ? ` · ${eur.format(bu.total / (mates.length + 1))} por adereço, em média` : ''}</p>
          <label class="sel"><span class="vh">Mudar de pacote</span><select data-pickb><option value="">Mudar para outro pacote…</option>${f.bundles.filter((b) => b.id !== bu.id).map((b) => `<option value="${b.id}">${esc(b.name)}${b.supplier ? ` · ${esc(b.supplier)}` : ''}</option>`).join('')}<option value="__new">+ Novo pacote</option></select></label>
        </div>` : ''}
    </div>` : ''}`;
  const save = debounce((k, v) => sb.from('props').update({ [k]: v }).eq('id', x.id).then(({ error }) => error && toast(error.message)), 500);
  box.querySelectorAll('[data-acqk]').forEach((el) => el.addEventListener('input', () => { const k = el.dataset.acqk; const v = el.value === '' ? null : el.type === 'number' ? Number(el.value) : el.value; x[k] = v; save(k, v); }));
  const saveB = debounce((k, v) => sb.from('prop_bundles').update({ [k]: v }).eq('id', bu.id).then(({ error }) => error && toast(error.message)), 500);
  box.querySelectorAll('[data-bk]').forEach((el) => el.addEventListener('input', () => { const k = el.dataset.bk; const v = el.type === 'number' ? (el.value === '' ? null : Number(el.value)) : el.value; bu[k] = v; saveB(k, v); }));
  const setBundle = async (id) => { const { error } = await sb.from('props').update({ bundle_id: id }).eq('id', x.id); if (error) return toast(error.message); x.bundle_id = id; acquisition(box, p, f, x); };
  const newBundle = () => {
    const m = modal(`<h2>Novo pacote de aluguer</h2><p class="muted small">Quando vários adereços são alugados juntos por um só valor.</p><form class="stack">
      <div class="field"><label for="nbn">Nome</label><input id="nbn" required placeholder="ex: Pacote bar — Adereços & Cia"></div>
      <div class="grid2"><div class="field"><label for="nbs">Alugado a</label><input id="nbs" value="${esc(x.supplier || '')}"></div><div class="field"><label for="nbt">Valor total (€)</label><input id="nbt" type="number" step="0.01" min="0"></div></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar pacote</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const tv = m.el.querySelector('#nbt').value;
      const { data, error } = await sb.from('prop_bundles').insert({ project_id: p.id, name: m.el.querySelector('#nbn').value.trim(), supplier: m.el.querySelector('#nbs').value.trim() || null, total: tv === '' ? null : Number(tv) }).select().single();
      if (error) return toast(error.message);
      f.bundles.push(data); m.close(); setBundle(data.id);
    });
  };
  box.querySelectorAll('[data-bmode]').forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.bmode === 'solo') { if (x.bundle_id) setBundle(null); return; }
    if (x.bundle_id) return;
    if (!f.bundles.length) return newBundle();
    const m = modal(`<h2>Em que pacote?</h2><div class="stack">${f.bundles.map((bb) => `<button type="button" class="btn ghost" data-b="${bb.id}">${esc(bb.name)}${bb.supplier ? ` · ${esc(bb.supplier)}` : ''}${bb.total ? ` · ${eur.format(bb.total)}` : ''}</button>`).join('')}<button type="button" class="btn primary" data-b="__new">${ICON.plus} Novo pacote</button></div>`);
    m.el.querySelectorAll('[data-b]').forEach((bb) => bb.addEventListener('click', () => { m.close(); if (bb.dataset.b === '__new') newBundle(); else setBundle(bb.dataset.b); }));
  }));
  box.querySelector('[data-pickb]')?.addEventListener('change', (e) => { const v = e.target.value; if (!v) return; if (v === '__new') newBundle(); else setBundle(v); });
}

// ---------- análise ----------
const CHUNK = 28000;
function buildPrompts(f) {
  const parts = []; let cur = []; let size = 0;
  f.scenes.forEach((s) => { const t = `CENA ${s.number} — ${s.heading}\n${s.body}\n`; if (size + t.length > CHUNK && cur.length) { parts.push(cur); cur = []; size = 0; } cur.push(s); size += t.length; });
  if (cur.length) parts.push(cur);
  const chars = f.characters.map((c) => c.name).join(', ');
  return parts.map((scenes, i) => ({ scenes, text: `És assistente de arte num filme. Lê ${parts.length > 1 ? `esta parte (${i + 1} de ${parts.length}) do` : 'o'} guião e faz a lista de adereços.

Regras:
- "acao": objetos que uma personagem manuseia, usa, dá, recebe ou examina.
- "cenario": mobiliário e decoração importantes que ninguém manuseia.
- Percebe pronomes: indica quem faz o quê com cada objeto.
- Junta o mesmo objeto numa só entrada, com todas as cenas.
- Não inventes objetos que o guião não sugere. Inclui os implícitos óbvios (ex.: fuma → isqueiro).
- Personagens conhecidas: ${chars || '(ver guião)'}.

Responde APENAS com JSON neste formato e escreve FIM na última linha:
[{"nome":"caixa do disco","tipo":"acao","categoria":"Documentos","cenas":["1","3"],"personagens":["ANTÓNIO"],"interacoes":[{"cena":"1","personagem":"ANTÓNIO","acao":"tira a caixa e dá-a a Duarte"}],"continuidade":"fica aberta a partir da cena 3"}]
FIM

GUIÃO:
${scenes.map((s) => `CENA ${s.number} — ${s.heading}\n${s.body}`).join('\n\n')}` }));
}

function parseAnswer(txt) {
  const t = String(txt || '').replace(/```json|```/g, '');
  const a = t.indexOf('['), b = t.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error(t.includes('GUIÃO:') ? 'Colaste o pedido em vez da resposta do Claude.' : 'Não encontrei a lista na resposta. Se veio cortada, escreve "continua" ao Claude e cola também a continuação.');
  return JSON.parse(t.slice(a, b + 1));
}

async function mergeProps(p, f, list) {
  const key = (s) => String(s || '').trim().toLowerCase();
  const byName = new Map(f.props.map((x) => [key(x.name), x]));
  const sceneId = (n) => f.scenes.find((s) => String(s.number) === String(n))?.id;
  const charId = (n) => f.characters.find((c) => key(c.name) === key(n))?.id;
  let added = 0;
  for (const it of list) {
    const name = String(it.nome || it.name || '').trim(); if (!name) continue;
    const ex = byName.get(key(name));
    if (ex?.removed) continue;
    const scene_ids = [...new Set([...(ex?.scene_ids || []), ...(it.cenas || []).map(sceneId).filter(Boolean)])];
    const character_ids = [...new Set([...(ex?.character_ids || []), ...(it.personagens || []).map(charId).filter(Boolean)])];
    const location_ids = [...new Set([...(ex?.location_ids || []), ...scene_ids.map((id) => f.scenes.find((s) => s.id === id)?.location_id).filter(Boolean)])];
    const interactions = [...(ex?.interactions || []), ...(it.interacoes || []).map((x) => ({ scene: String(x.cena || ''), character: x.personagem || '', action: x.acao || '' }))];
    const row = { scene_ids, character_ids, location_ids, interactions, ...(it.continuidade && !ex?.continuity ? { continuity: it.continuidade } : {}), ...(it.categoria && !ex?.category ? { category: it.categoria } : {}) };
    if (ex) { await sb.from('props').update(row).eq('id', ex.id); Object.assign(ex, row); }
    else { const { data } = await sb.from('props').insert({ project_id: p.id, name, type: it.tipo === 'cenario' ? 'cenario' : 'acao', ...row }).select().single(); if (data) { f.props.push(data); byName.set(key(name), data); added++; } }
  }
  return added;
}

const COMMON = ['telemóvel', 'telefone', 'chávena', 'copo', 'garrafa', 'cigarro', 'isqueiro', 'fósforos', 'chave', 'chaves', 'carteira', 'mala', 'mochila', 'caixa', 'carta', 'cartas', 'envelope', 'livro', 'caderno', 'caneta', 'jornal', 'fotografia', 'foto', 'faca', 'garfo', 'prato', 'pistola', 'arma', 'relógio', 'anel', 'colar', 'óculos', 'chapéu', 'casaco', 'guarda-chuva', 'rádio', 'televisão', 'computador', 'portátil', 'câmara', 'disco', 'cassete', 'vela', 'lanterna', 'candeeiro', 'mesa', 'cadeira', 'sofá', 'cama', 'espelho', 'quadro', 'vaso', 'flores', 'bolo', 'pão', 'vinho', 'cerveja', 'café', 'bilhete', 'dinheiro', 'mapa', 'bicicleta', 'carro'];
const ACTION = /\b(pega|segura|abre|fecha|dá|recebe|tira|pousa|examina|guarda|atira|bebe|come|acende|lê|escreve|liga|desliga|entrega|mostra|agarra)\b/i;
function quickAnalysis(f) {
  const found = new Map();
  f.scenes.forEach((s) => (s.body || '').split(/(?<=[.!?])\s+|\n/).forEach((sent) => {
    COMMON.forEach((w) => { if (new RegExp(`\\b${w}\\b`, 'i').test(sent)) { const e = found.get(w) || { nome: w, tipo: 'cenario', cenas: [], personagens: [], interacoes: [] }; if (ACTION.test(sent)) e.tipo = 'acao'; if (!e.cenas.includes(s.number)) e.cenas.push(s.number); found.set(w, e); } });
  }));
  return [...found.values()];
}

function analyze(p, f, after) {
  if (!f.scenes.length) return toast('Importa primeiro o guião.');
  const prompts = buildPrompts(f);
  let part = 0; const answers = [];
  const m = modal('<div data-an></div>', { wide: true });
  const box = m.el.querySelector('[data-an]');
  const intro = () => {
    box.innerHTML = `<h2>Analisar o guião</h2>
      <div class="an-opts"><button type="button" class="an-opt" data-claude><strong>Analisar no Claude</strong><span class="small">Grátis e a mais completa: percebe pronomes e quem faz o quê com cada objeto. Usa a tua conta do Claude.</span><span class="tag blue">Recomendada</span></button>
      <button type="button" class="an-opt" data-quick><strong>Rápida, sem IA</strong><span class="small">Imediata, mas só procura objetos comuns e verbos de ação. Pode falhar ou apanhar palavras a mais.</span></button></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button></div>`;
    box.querySelector('[data-close]').onclick = m.close;
    box.querySelector('[data-quick]').onclick = async () => { const n = await mergeProps(p, f, quickAnalysis(f)); m.close(); toast(`A lista de adereços está pronta (${n} novos).`); after(); };
    box.querySelector('[data-claude]').onclick = step;
  };
  const step = () => {
    const pr = prompts[part];
    box.innerHTML = `<h2>Analisar no Claude${prompts.length > 1 ? ` — parte ${part + 1} de ${prompts.length}` : ''}</h2>
      ${prompts.length > 1 ? `<p class="muted small">Cenas ${esc(pr.scenes[0].number)} a ${esc(pr.scenes[pr.scenes.length - 1].number)}. Cada parte vai numa conversa nova.</p>` : ''}
      <ol class="an-steps">
        <li><strong>Copia o pedido.</strong> <button type="button" class="btn ghost" data-copy>${ICON.copy} Copiar o pedido</button><textarea class="mono" rows="3" readonly hidden data-ptext>${esc(pr.text)}</textarea></li>
        <li><strong>Cola-o numa conversa nova no Claude</strong> e espera até aparecer FIM. <a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">${ICON.open} Abrir o Claude</a></li>
        <li><strong>Traz a resposta.</strong> Copia a resposta inteira e cola aqui.<textarea class="mono" rows="6" data-ans placeholder="Cola aqui a resposta do Claude…"></textarea><button type="button" class="link-btn" data-pastebtn>Colar o que copiei</button></li>
      </ol><p class="auth-err" hidden data-err></p>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-read>Ler a resposta</button></div>`;
    box.querySelector('[data-close]').onclick = m.close;
    box.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(pr.text); toast('Pedido copiado.'); } catch { const ta = box.querySelector('[data-ptext]'); ta.hidden = false; ta.select(); toast('Seleciona e copia o texto da caixa.'); } };
    box.querySelector('[data-pastebtn]').onclick = async () => { try { box.querySelector('[data-ans]').value = await navigator.clipboard.readText(); } catch { toast('O browser não deixou colar. Usa Ctrl + V na caixa.'); } };
    box.querySelector('[data-read]').onclick = async () => {
      const err = box.querySelector('[data-err]'); err.hidden = true;
      const txt = box.querySelector('[data-ans]').value;
      if (!/\bFIM\b/.test(txt) && !txt.trim().endsWith(']') && !txt.includes(']\n')) { err.textContent = 'A resposta parece cortada. Escreve "continua" ao Claude e cola também a continuação.'; err.hidden = false; return; }
      try { answers.push(...parseAnswer(txt)); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
      part++;
      if (part < prompts.length) return step();
      const n = await mergeProps(p, f, answers);
      box.innerHTML = `<h2>A lista de adereços está pronta</h2><p>${answers.length} adereços lidos, ${n} novos.</p><div class="row end"><button type="button" class="btn primary" data-close>Ver a lista</button></div>`;
      box.querySelector('[data-close]').onclick = () => { m.close(); after(); };
    };
  };
  intro();
}
