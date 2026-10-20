import { sb, esc, toast, modal, ICON } from './lib.js';
import { CATS, CATALOG, loadCatalog, specLine, gearName, editGearModal, catLabel, LIGHT_SOURCES, lightSource, LENS_FILTERS, lensMatch } from './gear.js';

// Base de dados de equipamento: câmaras, luzes, tripés e suportes (e o resto) num só sítio,
// partilhada por todos os projetos. O que está aqui aparece no mapa de luz (lista + catálogo geral)
// e no "Juntar equipamento" de cada projeto.

const TABS = [['camera', 'Câmaras'], ['light', 'Luzes'], ['stand', 'Tripés e suportes'], ['lens', 'Objetivas'], ['modifier', 'Modificadores'], ['more', 'Outros']];
const MORE = ['grip', 'power', 'filter', 'other'];
const st = { tab: 'camera', q: '', brand: '', sub: '', owned: false, src: '', lk: '' };
try { st.tab = localStorage.getItem('bg-gdb-tab') || 'camera'; } catch { /* nada */ }
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

// sub-filtro de cada separador (tipo de luz, formato da câmara, para que serve o tripé…)
const subOf = (g) => {
  const s = g.specs || {};
  if (g.category === 'light') return s.type || '';
  if (g.category === 'camera') return (s.format || '').replace(/\s*\(.*\)$/, '') || '';
  if (g.category === 'stand') return s.stand === 'camera' ? 'Para câmara' : 'Para luz / frames';
  if (g.category === 'lens') return s.squeeze ? 'Anamórficas' : s.zoom ? 'Zoom' : s.vintage ? 'Vintage' : 'Fixas';
  if (g.category === 'modifier') return s.mod || '';
  return catLabel(g.category);
};
const inTab = (g, tab) => (tab === 'more' ? MORE.includes(g.category) : g.category === tab);

// colunas por separador
function cols(tab) {
  if (tab === 'camera') return [['Formato', (s) => s.format], ['Sensor', (s) => (s.sensor_w ? `${s.sensor_w} mm` : '')], ['Encaixe', (s) => s.mount]];
  if (tab === 'light') return [['Fonte', (s, g) => (LIGHT_SOURCES.find(([k]) => k === lightSource(g)) || [])[1]?.replace(' (Kino Flo)', '')], ['Tipo', (s) => s.type], ['Consumo', (s) => (s.watts ? `${s.watts} W` : '')], ['Cor', (s) => (s.cct ? (s.cct[0] === s.cct[1] ? `${s.cct[0]}K` : `${s.cct[0]}–${s.cct[1]}K`) : '') + (s.color === 'rgb' ? ' · RGB' : '')], ['Feixe', (s) => (s.beam ? `${s.beam}°` : '')], ['', (s) => (s.battery ? '<span class="chip">bateria</span>' : '')]];
  if (tab === 'stand') return [['Para', (s) => (s.stand === 'camera' ? 'Câmara' : 'Luz / frames')], ['Altura máx.', (s) => (s.max_h ? `${s.max_h} m` : '')], ['Carga máx.', (s) => (s.max_kg ? `${s.max_kg} kg` : '')]];
  if (tab === 'lens') return [['Focais', (s) => (s.zoom ? `${s.zoom[0]}–${s.zoom[1]} mm` : (s.focals || []).join(', ') + ((s.focals || []).length ? ' mm' : ''))], ['Abertura', (s) => s.tstop], ['Cobre', (s) => ({ S16: 'Super 16', S35: 'Super 35', FF: 'Full frame', LF: 'Large format / VV', MF: 'Médio formato', 65: '65 mm' }[s.cover] || s.cover || '')], ['Encaixe', (s) => s.mount], ['', (s) => `${s.squeeze ? `<span class="chip">anamórfica ${s.squeeze}x</span>` : ''}${s.vintage ? '<span class="chip">vintage</span>' : ''}${s.origin === 'URSS' ? '<span class="chip">soviética</span>' : s.origin === 'RDA' ? '<span class="chip">RDA</span>' : ''}`]];
  return [['Detalhes', (s, g) => esc(specLine(g))]];
}

export async function gearBasePage(root) {
  root.innerHTML = '<p class="muted">A carregar a base de dados…</p>';
  await loadCatalog(true);
  draw(root);
}

function draw(root) {
  const all = CATALOG.filter((g) => g.id); // só o que está na base de dados
  const list0 = all.filter((g) => inTab(g, st.tab));
  const brands = [...new Set(list0.map((g) => g.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  const subs = [...new Set(list0.map(subOf).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt'));
  if (st.brand && !brands.includes(st.brand)) st.brand = '';
  if (st.sub && !subs.includes(st.sub)) st.sub = '';
  const words = norm(st.q).split(/\s+/).filter(Boolean);
  const list = list0.filter((g) => (!st.src || st.tab !== 'light' || lightSource(g) === st.src) && (!st.lk || st.tab !== 'lens' || lensMatch(g, st.lk)) && (!st.brand || g.brand === st.brand) && (!st.sub || subOf(g) === st.sub) && (!st.owned || g.owned) && words.every((w) => norm(`${g.brand} ${g.name} ${specLine(g)} ${g.supplier || ''} ${g.notes || ''}`).includes(w)));
  const C = cols(st.tab);
  const count = (tab) => all.filter((g) => inTab(g, tab)).length;
  root.innerHTML = `
    <div class="row between wrap-gap gdb-head">
      <div><h1 class="h1">Base de dados de equipamento</h1><p class="muted">Câmaras, luzes, tripés e o resto do material, partilhados por todos os projetos. O que está aqui aparece nos mapas de luz e no equipamento de cada projeto. Valores de referência: confirma sempre na ficha da rental.</p></div>
      <button type="button" class="btn primary" data-add>${ICON.plus} Juntar equipamento</button>
    </div>
    <div class="seg dark gdb-tabs" role="tablist">${TABS.map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" data-tab="${k}">${l} <span class="count">${count(k)}</span></button>`).join('')}</div>
    ${st.tab === 'lens' ? `<div class="gdb-src" role="radiogroup" aria-label="Tipo de lente">${LENS_FILTERS.map(([k, l]) => `<button type="button" role="radio" aria-checked="${(st.lk || '') === k}" data-lk="${k}">${l} <span class="count">${list0.filter((g) => lensMatch(g, k)).length}</span></button>`).join('')}</div>` : ''}
    ${st.tab === 'light' ? `<div class="gdb-src" role="radiogroup" aria-label="Fonte de luz">${[['', 'Todas'], ...LIGHT_SOURCES].map(([k, l]) => `<button type="button" role="radio" aria-checked="${st.src === k}" data-src="${k}">${l} <span class="count">${k ? list0.filter((g) => lightSource(g) === k).length : list0.length}</span></button>`).join('')}</div>` : ''}
    <div class="row wrap-gap gdb-filters">
      <label class="search"><span class="vh">Procurar</span>${ICON.search}<input type="search" data-q placeholder="Procurar marca, modelo, especificação…" value="${esc(st.q)}" autocomplete="off"></label>
      ${brands.length > 1 ? `<label class="sel"><span class="vh">Marca</span><select data-brand><option value="">Todas as marcas</option>${brands.map((b) => `<option ${b === st.brand ? 'selected' : ''}>${esc(b)}</option>`).join('')}</select></label>` : ''}
      ${subs.length > 1 ? `<label class="sel"><span class="vh">Tipo</span><select data-sub><option value="">Todos os tipos</option>${subs.map((x) => `<option ${x === st.sub ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}
      <label class="check"><input type="checkbox" data-owned ${st.owned ? 'checked' : ''}> Só o kit da Grain</label>
      <span class="muted small">${list.length} de ${list0.length}</span>
    </div>
    <div class="panel table-wrap">${list.length ? `<table class="gr-t gdb-t"><thead><tr><th>Marca</th><th>Modelo</th>${st.tab === 'more' ? '<th>Categoria</th>' : ''}${C.map(([h]) => `<th>${h}</th>`).join('')}<th>Preço/dia</th><th></th></tr></thead><tbody>
      ${list.map((g) => `<tr class="click-row" data-id="${g.id}"><td class="muted">${esc(g.brand || '—')}</td><td><b>${esc(g.name)}</b>${g.owned ? ' <span class="chip own">Grain</span>' : ''}${g.supplier ? `<div class="small muted">${esc(g.supplier)}</div>` : ''}</td>
        ${st.tab === 'more' ? `<td class="muted">${esc(catLabel(g.category))}</td>` : ''}
        ${C.map(([h, f]) => { const v = f(g.specs || {}, g); return `<td>${v && !String(v).startsWith('<') ? esc(v) : v || (h ? '<span class="muted">—</span>' : '')}</td>`; }).join('')}
        <td>${g.price_day != null ? eur.format(g.price_day) : '<span class="muted">—</span>'}</td>
        <td class="gdb-act"><button type="button" class="link-btn" data-toproj="${g.id}" title="Juntar ao equipamento de um projeto">${ICON.plus} Projeto</button></td></tr>`).join('')}
    </tbody></table>` : `<p class="empty-note">${st.q || st.brand || st.sub || st.owned ? 'Nada com estes filtros.' : 'Ainda não há nada aqui.'} Usa “Juntar equipamento”.</p>`}</div>`;

  const redraw = () => draw(root);
  root.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.tab; st.brand = ''; st.sub = ''; st.src = ''; st.lk = ''; try { localStorage.setItem('bg-gdb-tab', st.tab); } catch { /* nada */ } redraw(); }));
  const qi = root.querySelector('[data-q]');
  qi.addEventListener('input', () => { st.q = qi.value; const pos = qi.selectionStart; redraw(); const n = root.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); });
  root.querySelectorAll('[data-src]').forEach((b) => b.addEventListener('click', () => { st.src = b.dataset.src; redraw(); }));
  root.querySelectorAll('[data-lk]').forEach((b) => b.addEventListener('click', () => { st.lk = b.dataset.lk; redraw(); }));
  root.querySelector('[data-brand]')?.addEventListener('change', (e) => { st.brand = e.target.value; redraw(); });
  root.querySelector('[data-sub]')?.addEventListener('change', (e) => { st.sub = e.target.value; redraw(); });
  root.querySelector('[data-owned]').addEventListener('change', (e) => { st.owned = e.target.checked; redraw(); });
  const after = async () => { await loadCatalog(true); redraw(); };
  root.querySelectorAll('tr[data-id]').forEach((tr) => tr.addEventListener('click', (e) => {
    if (e.target.closest('[data-toproj]')) return;
    const g = CATALOG.find((x) => x.id === tr.dataset.id);
    editGearModal({ ...g, specs: { ...(g.specs || {}) } }, { table: 'gear_catalog', onDone: after, onDelete: after });
  }));
  root.querySelectorAll('[data-toproj]').forEach((b) => b.addEventListener('click', () => toProject(CATALOG.find((x) => x.id === b.dataset.toproj))));
  root.querySelector('[data-add]').addEventListener('click', () => {
    const cat = st.tab === 'more' ? 'other' : st.tab;
    const base = { category: cat, brand: '', name: '', specs: cat === 'light' ? { type: 'COB / LED pontual', watts: null, cct: [5600, 5600], color: 'day', beam: 55 } : cat === 'camera' ? { format: 'Full frame', sensor_w: 36 } : cat === 'stand' ? { stand: 'light' } : cat === 'modifier' ? { mod: 'frame', size_m: 1.2 } : cat === 'lens' ? { focals: [] } : {} };
    editGearModal(base, { table: 'gear_catalog', onDone: after });
  });
}

// juntar uma peça da base de dados ao equipamento de um projeto
async function toProject(g) {
  const { data: projects } = await sb.from('projects').select('id, name, kind').eq('is_central', false).is('deleted_at', null).neq('kind', 'album').order('updated_at', { ascending: false });
  const m = modal(`<h2>Juntar a um projeto</h2><p class="muted small">${esc(gearName(g))} · ${esc(specLine(g))}</p>
    <form class="stack"><div class="grid2"><div class="field"><label for="gp">Projeto</label><select id="gp" required>${(projects || []).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="gq">Quantidade</label><input id="gq" type="number" min="1" value="1"></div></div>
    <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const pid = m.el.querySelector('#gp').value; if (!pid) return;
    const { error } = await sb.from('gear').insert({ project_id: pid, category: g.category, name: g.name, brand: g.brand || '', qty: Math.max(1, +m.el.querySelector('#gq').value || 1), specs: JSON.parse(JSON.stringify(g.specs || {})), price_day: g.price_day ?? null, supplier: g.supplier || null, position: Date.now() / 1000 });
    if (error) return toast(error.message);
    m.close(); toast(`Juntado ao equipamento de ${(projects || []).find((p) => p.id === pid)?.name || 'projeto'}.`);
  });
}
