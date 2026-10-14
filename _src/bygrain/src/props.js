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
const st = { tab: 'acao', sort: 'scene', filter: '' };
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

async function load(pid) {
  const [pr, sc, ch, lo] = await Promise.all([
    sb.from('props').select('*').eq('project_id', pid).order('name'),
    sb.from('scenes').select('id, number, heading, body, character_ids, location_id, position').eq('project_id', pid).order('position'),
    sb.from('characters').select('id, name').eq('project_id', pid),
    sb.from('locations').select('id, name').eq('project_id', pid),
  ]);
  return { props: pr.data || [], scenes: sc.data || [], characters: ch.data || [], locations: lo.data || [] };
}

export async function propsPage(main, p, sub, base, cleanup) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const f = await load(p.id);
  if (sub) return propPage(main, p, f, sub, base, cleanup);
  const visible = f.props.filter((x) => !x.removed && x.type === st.tab);
  const counts = Object.fromEntries(PROP_STATUS.map(([k]) => [k, visible.filter((x) => x.status === k).length]));
  const list = visible.filter((x) => !st.filter || x.status === st.filter);
  const sceneNo = (id) => f.scenes.find((s) => s.id === id)?.number;
  main.innerHTML = `
    <div class="row between wrap-gap"><h1 class="h1 pm-title">Adereços</h1>
      <div class="row wrap-gap"><button type="button" class="btn ghost" data-add>${ICON.plus} Adereço</button><button type="button" class="btn primary" data-analyze>Analisar o guião</button></div></div>
    <div class="row between wrap-gap">
      <div class="seg dark" role="tablist">${[['acao', 'De ação'], ['cenario', 'De cenário']].map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" data-tab="${k}">${l} (${f.props.filter((x) => !x.removed && x.type === k).length})</button>`).join('')}</div>
      <label class="sel"><span class="vh">Ordenar</span><select data-sort>${[['scene', 'Por cena'], ['name', 'Nome (A–Z)'], ['status', 'Por estado'], ['category', 'Por categoria']].map(([k, l]) => `<option value="${k}" ${st.sort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    ${visible.length ? `<div class="status-bar">${PROP_STATUS.filter(([k]) => counts[k]).map(([k, l, c]) => `<i style="flex:${counts[k]};background:${c}" title="${l}: ${counts[k]}"></i>`).join('')}</div>
    <div class="pills">${PROP_STATUS.filter(([k]) => counts[k]).map(([k, l, c]) => `<button type="button" class="pill ${st.filter === k ? 'on' : ''}" data-filter="${k}" style="--c:${c}"><i></i>${l} ${counts[k]}</button>`).join('')}${st.filter ? '<button type="button" class="link-btn" data-filter="">Ver todos</button>' : ''}</div>` : ''}
    <section class="panel">${list.length ? renderList(list, f, base) : `<p class="empty-note">${f.props.length ? 'Nada com este filtro.' : 'Ainda não há adereços. Analisa o guião ou junta-os à mão.'}</p>`}</section>`;
  main.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; st.filter = ''; propsPage(main, p, null, base, cleanup); }));
  main.querySelector('[data-sort]').addEventListener('change', (e) => { st.sort = e.target.value; propsPage(main, p, null, base, cleanup); });
  main.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => { st.filter = b.dataset.filter; propsPage(main, p, null, base, cleanup); }));
  main.querySelectorAll('[data-status]').forEach((s) => s.addEventListener('change', async () => {
    await sb.from('props').update({ status: s.value }).eq('id', s.dataset.status);
    s.closest('[data-prop]').style.setProperty('--c', statusOf(s.value)[2]);
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
  main.querySelector('[data-analyze]').addEventListener('click', () => analyze(p, f, () => propsPage(main, p, null, base, cleanup)));
  void sceneNo;
}

function row(x, f, base) {
  const [, , c] = statusOf(x.status);
  const scenes = (x.scene_ids || []).map((id) => f.scenes.find((s) => s.id === id)?.number).filter(Boolean);
  return `<li class="prop-row" data-prop="${x.id}" style="--c:${c}">
    <a href="${base}/aderecos/${x.id}" class="prop-main"><strong>${esc(x.name)}</strong><span class="small muted">${[x.category, x.quantity > 1 ? `${x.quantity} un.` : '', scenes.length ? `Cenas ${scenes.join(', ')}` : ''].filter(Boolean).map(esc).join(' · ')}</span></a>
    <label class="sel"><span class="vh">Estado de ${esc(x.name)}</span><select data-status="${x.id}">${PROP_STATUS.map(([k, l]) => `<option value="${k}" ${x.status === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
  </li>`;
}
function renderList(list, f, base) {
  if (st.sort === 'scene') {
    return f.scenes.map((s) => { const ps = list.filter((x) => (x.scene_ids || []).includes(s.id)); return ps.length ? `<h3 class="prop-gh"><span class="scene-n sm">${esc(s.number)}</span>${esc(s.heading)}</h3><ul class="prop-list">${ps.map((x) => row(x, f, base)).join('')}</ul>` : ''; }).join('')
      + (() => { const none = list.filter((x) => !(x.scene_ids || []).length); return none.length ? `<h3 class="prop-gh">Sem cena</h3><ul class="prop-list">${none.map((x) => row(x, f, base)).join('')}</ul>` : ''; })();
  }
  if (st.sort === 'status') return PROP_STATUS.map(([k, l]) => { const ps = list.filter((x) => x.status === k); return ps.length ? `<h3 class="prop-gh">${l}</h3><ul class="prop-list">${ps.map((x) => row(x, f, base)).join('')}</ul>` : ''; }).join('');
  if (st.sort === 'category') { const cats = [...new Set(list.map((x) => x.category || 'Sem categoria'))].sort(); return cats.map((c) => `<h3 class="prop-gh">${esc(c)}</h3><ul class="prop-list">${list.filter((x) => (x.category || 'Sem categoria') === c).map((x) => row(x, f, base)).join('')}</ul>`).join(''); }
  return `<ul class="prop-list">${[...list].sort((a, b) => a.name.localeCompare(b.name, 'pt')).map((x) => row(x, f, base)).join('')}</ul>`;
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
      <section class="panel"><h2 class="h3">Interações</h2>${(x.interactions || []).length ? `<ul class="inter">${x.interactions.map((it) => `<li><strong>${esc(it.character || '—')}</strong> · ${esc(it.action || '')}${it.scene ? ` <span class="muted small">(cena ${esc(it.scene)})</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Sem interações registadas.</p>'}</section>
      <section class="panel"><div class="row between"><h2 class="h3">Referências</h2><div class="row"><button type="button" class="btn ghost" data-addimg>${ICON.image} Imagens</button><button type="button" class="btn ghost" data-addlink>${ICON.link} Link</button></div></div>
        ${imgs.length ? `<div class="photo-grid">${imgs.map((r, i) => `<figure><img src="${esc(urls[r.path] || '')}" alt=""><button type="button" class="icon-btn sm" data-rmimg="${i}" aria-label="Tirar imagem">${ICON.close}</button></figure>`).join('')}</div>` : ''}
        ${links.length ? `<ul class="links">${links.map((r, i) => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener noreferrer">${esc(r.title || r.url)}</a><button type="button" class="icon-btn sm" data-rmlink="${i}" aria-label="Tirar link">${ICON.close}</button></li>`).join('')}</ul>` : ''}
        ${!imgs.length && !links.length ? '<p class="muted small">Imagens e links para produtos.</p>' : ''}</section>
      <section class="panel"><h2 class="h3">Tarefas</h2><div data-tasks></div></section>
    </div><aside class="pm-side stack">
      <section class="panel"><h2 class="h3">Cenas (${scenes.length})</h2>${scenes.map((s) => `<a class="scene-ex" href="${base}/cenas/${s.id}"><span class="scene-n sm">${esc(s.number)}</span><span><span class="small">${esc(s.heading)}</span>${excerpt(s) ? `<span class="small muted mono">${esc(excerpt(s))}</span>` : ''}</span></a>`).join('')}${chips(x.scene_ids, f.scenes.map((s) => ({ id: s.id, name: `Cena ${s.number}` })), 'scene_ids')}</section>
      <section class="panel"><h2 class="h3">Personagens</h2>${chips(x.character_ids, f.characters, 'character_ids')}</section>
      <section class="panel"><h2 class="h3">Décors</h2>${chips(x.location_ids, f.locations, 'location_ids')}</section>
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
