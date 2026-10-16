import { sb, esc, toast, modal, confirmBox, ICON } from './lib.js';
import { exportPdf } from './pdf.js';
import { BUILTIN } from './gearcat.js';

// Equipamento do projeto (sobretudo imagem): câmaras, objetivas, luzes, modificadores, maquinaria, elétrico, filtros.
// O mapa de luz só usa o que está nesta lista: assim o plano de luz bate certo com o que vem da rental.
// Tabela `gear`: { category, name, brand, qty, specs, supplier, price_day, notes, position }.

export const CATS = [
  ['light', 'Luzes'], ['camera', 'Câmaras'], ['lens', 'Objetivas'], ['modifier', 'Modificadores e frames'], ['stand', 'Tripés e suportes'],
  ['grip', 'Maquinaria'], ['power', 'Elétrico'], ['filter', 'Filtros'], ['other', 'Outros'],
];
export const catLabel = (k) => (CATS.find((c) => c[0] === k) || CATS[CATS.length - 1])[1];
export const LIGHT_KINDS = ['COB / LED pontual', 'Fresnel', 'Painel LED', 'Tubo LED', 'HMI', 'Tungsténio', 'Softlight', 'Prático'];
export const COLOR_KINDS = [['day', 'Daylight'], ['tungsten', 'Tungsténio'], ['bicolor', 'Bicolor'], ['rgb', 'RGB / cor total']];
export const MOD_KINDS = [['softbox', 'Softbox'], ['lantern', 'Lanterna / china ball'], ['dome', 'Dome / parabólico'], ['fresnel', 'Lente Fresnel'], ['grid', 'Grelha (eggcrate)'], ['frame', 'Frame / butterfly'], ['flag', 'Bandeira / negativo'], ['bounce', 'Rebatedor']];
export const FABRICS = ['', 'Full Grid Cloth', '1/2 Grid Cloth', '1/4 Grid Cloth', 'Silk', 'Ultrabounce', 'Muslin', 'Negativo (Duvetyne)', 'Lee 216', 'Lee 250', 'Lee 251', 'Opal'];

// Base de dados geral de equipamento: tabela `gear_catalog` (a equipa junta e corrige); BUILTIN é só o ponto de partida
// e serve enquanto a base de dados não responde. CATALOG é sempre o mesmo array (o mapa de luz lê-o diretamente).
export const CATALOG = BUILTIN.map((g) => ({ ...g, specs: { ...g.specs } }));
let catAt = 0; let catP = null;
export function loadCatalog(force = false) {
  if (!force && catP && Date.now() - catAt < 300000) return catP;
  catAt = Date.now();
  catP = sb.from('gear_catalog').select('*').order('category').order('brand').order('name').then(({ data, error }) => {
    if (!error && data?.length) CATALOG.splice(0, CATALOG.length, ...data);
    return CATALOG;
  }).catch(() => CATALOG);
  return catP;
}

// --------- especificações: resumo curto e utilidades para o mapa ---------
export function specLine(g) {
  const s = g.specs || {};
  if (g.category === 'light') return [s.type, s.watts ? `${s.watts} W` : '', s.cct ? (s.cct[0] === s.cct[1] ? `${s.cct[0]}K` : `${s.cct[0]}–${s.cct[1]}K`) : '', (COLOR_KINDS.find((c) => c[0] === s.color) || [])[1], s.beam ? `${s.beam}°` : '', s.battery ? 'bateria' : ''].filter(Boolean).join(' · ');
  if (g.category === 'camera') return [s.format, s.sensor_w ? `sensor ${s.sensor_w} mm` : '', s.mount ? `encaixe ${s.mount}` : ''].filter(Boolean).join(' · ');
  if (g.category === 'lens') return [s.zoom ? `${s.zoom[0]}–${s.zoom[1]} mm` : (s.focals || []).join(', ') + ((s.focals || []).length ? ' mm' : ''), s.tstop, s.squeeze ? `anamórfica ${s.squeeze}x` : ''].filter(Boolean).join(' · ');
  if (g.category === 'modifier') return [(MOD_KINDS.find((m) => m[0] === s.mod) || [])[1], s.size_m ? `${s.size_m} m` : '', s.fabric].filter(Boolean).join(' · ');
  if (g.category === 'stand') return [s.stand === 'camera' ? 'Para câmara' : s.stand === 'light' ? 'Para luz / frames' : '', s.max_h ? `até ${s.max_h} m` : '', s.max_kg ? `aguenta ${s.max_kg} kg` : ''].filter(Boolean).join(' · ');
  if (g.category === 'power') return [s.capacity_w ? `${s.capacity_w} W disponíveis` : '', s.battery ? 'bateria' : ''].filter(Boolean).join(' · ');
  return '';
}
export const gearName = (g) => [g.brand, g.name].filter(Boolean).join(' ');
export const lensFocals = (g) => { const s = g?.specs || {}; if (s.zoom) return null; return s.focals || []; };

export async function loadGear(pid) {
  const { data, error } = await sb.from('gear').select('*').eq('project_id', pid).order('position').order('created_at');
  if (error) { toast('Não foi possível ler o equipamento: ' + error.message); return []; }
  return data || [];
}

// --------- juntar equipamento (catálogo ou à mão) ---------
// devolve a linha criada (ou null). cat: categoria sugerida (ex.: 'light' quando vem do mapa de luz)
export function addGearModal(p, { cat = '', onDone } = {}) {
  let q = ''; let fcat = cat;
  const m = modal(`<h2>Juntar equipamento</h2>
    <p class="muted small">Escolhe do catálogo (já traz as especificações) ou escreve o teu. Os valores são de referência: confirma com a ficha da rental.</p>
    <div class="row wrap-gap"><input type="search" data-q placeholder="Procurar: Aputure, SkyPanel, FX6, 6x6…" aria-label="Procurar no catálogo" style="flex:1 1 240px">
      <select data-cat aria-label="Categoria"><option value="">Todas</option>${CATS.map(([k, l]) => `<option value="${k}" ${k === cat ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="gr-cat" data-list></div>
    <details class="gr-own"><summary>${ICON.plus} Não está no catálogo? Escrever à mão</summary><form class="stack" data-own>
      <div class="grid2"><div class="field"><label for="go-n">Nome</label><input id="go-n" name="name" required placeholder="ex: Aputure 600c Pro"></div>
      <div class="field"><label for="go-c">Categoria</label><select id="go-c" name="category">${CATS.map(([k, l]) => `<option value="${k}" ${k === (cat || 'light') ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
      <label class="check"><input type="checkbox" name="tocat" checked> Guardar também na base de dados geral (para os outros projetos)</label>
      <div class="row end"><button class="btn primary">Juntar e editar</button></div></form></details>
    <div class="row end"><button type="button" class="btn ghost" data-close>Fechar</button></div>`, { wide: true });
  const list = m.el.querySelector('[data-list]');
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const draw = () => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const rows = CATALOG.map((g, i) => ({ g, i })).filter(({ g }) => (!fcat || g.category === fcat) && words.every((w) => norm(`${g.brand} ${g.name} ${catLabel(g.category)} ${specLine(g)}`).includes(w)));
    list.innerHTML = rows.length ? CATS.filter(([k]) => rows.some((r) => r.g.category === k)).map(([k, l]) => `<h4>${l}</h4>${rows.filter((r) => r.g.category === k).map(({ g, i }) => `<button type="button" class="gr-ci" data-i="${i}"><b>${esc(gearName(g))}</b><small>${esc(specLine(g))}</small><span class="gr-plus">${ICON.plus}</span></button>`).join('')}`).join('') : '<p class="muted small">Nada no catálogo com isto. Escreve à mão em baixo.</p>';
    list.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', async () => {
      const g = CATALOG[+b.dataset.i];
      const row = await insertGear(p, { ...g, specs: JSON.parse(JSON.stringify(g.specs || {})) });
      if (!row) return;
      b.classList.add('added'); b.querySelector('.gr-plus').innerHTML = '✓';
      toast(`${gearName(g)} juntado ao equipamento.`);
      onDone && onDone(row);
    }));
  };
  m.el.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; draw(); });
  m.el.querySelector('[data-cat]').addEventListener('change', (e) => { fcat = e.target.value; draw(); });
  loadCatalog().then(() => { if (document.body.contains(list)) draw(); });
  m.el.querySelector('[data-own]').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const specs = f.category === 'light' ? { type: 'COB / LED pontual', watts: null, cct: [5600, 5600], color: 'day', beam: 55 } : f.category === 'modifier' ? { mod: 'frame', size_m: 1.2 } : f.category === 'lens' ? { focals: [] } : {};
    const row = await insertGear(p, { category: f.category, name: f.name.trim(), brand: '', specs });
    if (!row) return;
    if (f.tocat) await toCatalog(row, true);
    m.close(); onDone && onDone(row); editGearModal(row, { onDone });
  });
  draw();
  return m;
}
// copia uma peça para a base de dados geral (se ainda lá não estiver; se estiver, atualiza as especificações)
export async function toCatalog(g, quiet = false) {
  const row = { category: g.category, brand: (g.brand || '').trim(), name: (g.name || '').trim(), specs: g.specs || {}, supplier: g.supplier || null, price_day: g.price_day ?? null, notes: g.notes || null, updated_at: new Date().toISOString() };
  const { error } = await sb.from('gear_catalog').upsert(row, { onConflict: 'category,brand,name' });
  if (error) { toast(error.message); return false; }
  loadCatalog(true); if (!quiet) toast('Guardado na base de dados de equipamento.');
  return true;
}
async function insertGear(p, g) {
  const { data, error } = await sb.from('gear').insert({ project_id: p.id, category: g.category, name: g.name, brand: g.brand || '', qty: g.qty || 1, specs: g.specs || {}, price_day: g.price_day ?? null, supplier: g.supplier || null, position: Date.now() / 1000 }).select().single();
  if (error) { toast(error.message); return null; }
  return data;
}

// --------- editar uma peça ---------
export function editGearModal(g, { onDone, onDelete, table = 'gear' } = {}) {
  const s = g.specs || {}; const isCat = table === 'gear_catalog';
  const num = (name, label, val, extra = '') => `<div class="field"><label>${label}</label><input name="${name}" inputmode="decimal" value="${esc(val ?? '')}" ${extra}></div>`;
  let specs = '';
  if (g.category === 'light') specs = `<div class="grid3">
      <div class="field"><label>Tipo</label><select name="type">${LIGHT_KINDS.map((t) => `<option ${t === s.type ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <div class="field"><label>Cor</label><select name="color">${COLOR_KINDS.map(([k, l]) => `<option value="${k}" ${k === s.color ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      ${num('watts', 'Consumo (W)', s.watts)}
      ${num('cct0', 'Temperatura mín. (K)', s.cct?.[0])}${num('cct1', 'Temperatura máx. (K)', s.cct?.[1])}${num('beam', 'Abertura do feixe (°)', s.beam)}
      <label class="check"><input type="checkbox" name="battery" ${s.battery ? 'checked' : ''}> Funciona a bateria</label></div>`;
  if (g.category === 'camera') specs = `<div class="grid3">${num('format', 'Formato', s.format)}${num('sensor_w', 'Largura do sensor (mm)', s.sensor_w)}${num('mount', 'Encaixe (mount)', s.mount)}</div><p class="muted small">A largura do sensor serve para o mapa de luz desenhar o enquadramento certo.</p>`;
  if (g.category === 'lens') specs = `<div class="grid3">${num('focals', 'Focais do set (mm, separadas por vírgula)', (s.focals || []).join(', '))}${num('zoom', 'Ou zoom (ex: 24-70)', s.zoom ? s.zoom.join('-') : '')}${num('tstop', 'Abertura', s.tstop)}${num('squeeze', 'Anamórfica (squeeze, ex: 2)', s.squeeze)}</div>`;
  if (g.category === 'modifier') specs = `<div class="grid3"><div class="field"><label>Tipo</label><select name="mod">${MOD_KINDS.map(([k, l]) => `<option value="${k}" ${k === s.mod ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${num('size_m', 'Tamanho (m)', s.size_m)}
      <div class="field"><label>Tela</label><select name="fabric">${FABRICS.map((t) => `<option ${t === (s.fabric || '') ? 'selected' : ''} value="${esc(t)}">${t || '—'}</option>`).join('')}</select></div></div>`;
  if (g.category === 'stand') specs = `<div class="grid2"><div class="field"><label>Para</label><select name="stand"><option value="light" ${s.stand !== 'camera' ? 'selected' : ''}>Luz / frames / bandeiras</option><option value="camera" ${s.stand === 'camera' ? 'selected' : ''}>Câmara</option></select></div>${num('max_h', 'Altura máxima (m)', s.max_h)}${num('max_kg', 'Carga máxima (kg)', s.max_kg)}</div>`;
  if (g.category === 'power') specs = `<div class="grid2">${num('capacity_w', 'Potência disponível (W)', s.capacity_w)}<label class="check"><input type="checkbox" name="battery" ${s.battery ? 'checked' : ''}> Bateria / estação</label></div><p class="muted small">Geradores e baterias com potência entram na conta de consumo dos mapas de luz.</p>`;
  const m = modal(`<h2>${esc(gearName(g) || 'Equipamento')}</h2>
    <form class="stack" data-f>
      <div class="grid3"><div class="field" style="grid-column:span 2"><label>Nome / modelo</label><input name="name" value="${esc(g.name)}" required></div><div class="field"><label>Marca</label><input name="brand" value="${esc(g.brand || '')}"></div></div>
      <div class="grid3"><div class="field"><label>Categoria</label><select name="category">${CATS.map(([k, l]) => `<option value="${k}" ${k === g.category ? 'selected' : ''}>${l}</option>`).join('')}</select></div>${isCat ? `<label class="check"><input type="checkbox" name="owned" ${g.owned ? 'checked' : ''}> É da Grain (kit próprio)</label>` : num('qty', 'Quantidade', g.qty)}${num('price_day', 'Preço por dia (€)', g.price_day)}</div>
      ${specs}
      <div class="grid2"><div class="field"><label>Fornecedor / rental</label><input name="supplier" value="${esc(g.supplier || '')}"></div><div class="field"><label>Notas</label><input name="notes" value="${esc(g.notes || '')}"></div></div>
      <div class="row between"><span class="row wrap-gap">${g.id ? `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} ${isCat ? 'Apagar da base de dados' : 'Tirar da lista'}</button>` : ''}${!isCat && g.id ? '<button type="button" class="btn ghost" data-tocat title="Fica disponível em todos os projetos e nos mapas de luz">Guardar na base de dados</button>' : ''}</span><div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div>
    </form>`, { wide: true });
  const f = m.el.querySelector('[data-f]');
  const n = (v) => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault(); const v = Object.fromEntries(new FormData(f));
    const ns = { ...s };
    if (g.category === 'light' && v.category === 'light') Object.assign(ns, { type: v.type, color: v.color, watts: n(v.watts), cct: [n(v.cct0) || 5600, n(v.cct1) || n(v.cct0) || 5600], beam: n(v.beam), battery: !!v.battery });
    if (g.category === 'camera') Object.assign(ns, { format: v.format, sensor_w: n(v.sensor_w), mount: v.mount || undefined });
    if (g.category === 'lens') { const z = String(v.zoom || '').split(/[-–]/).map(n).filter(Boolean); Object.assign(ns, { focals: String(v.focals || '').split(/[,;\s]+/).map(n).filter(Boolean), zoom: z.length === 2 ? z : null, tstop: v.tstop, squeeze: n(v.squeeze) }); if (!ns.zoom) delete ns.zoom; if (!ns.squeeze) delete ns.squeeze; }
    if (g.category === 'modifier') Object.assign(ns, { mod: v.mod, size_m: n(v.size_m), fabric: v.fabric });
    if (g.category === 'stand') { Object.assign(ns, { stand: v.stand, max_h: n(v.max_h), max_kg: n(v.max_kg) }); if (!ns.max_kg) delete ns.max_kg; }
    if (g.category === 'power') Object.assign(ns, { capacity_w: n(v.capacity_w), battery: !!v.battery });
    const patch = { name: v.name.trim(), brand: v.brand.trim(), category: v.category, ...(isCat ? { owned: !!v.owned } : { qty: Math.max(0, Math.round(n(v.qty) ?? 1)) }), price_day: n(v.price_day), supplier: v.supplier.trim(), notes: v.notes.trim(), specs: ns, updated_at: new Date().toISOString() };
    const { data, error } = g.id ? await sb.from(table).update(patch).eq('id', g.id).select().single() : await sb.from(table).insert(patch).select().single();
    if (error) return toast(/duplicate|unique/i.test(error.message) ? 'Já existe um equipamento com esta marca e nome nesta categoria.' : error.message);
    if (isCat) loadCatalog(true);
    m.close(); onDone && onDone(data);
  });
  m.el.querySelector('[data-tocat]')?.addEventListener('click', () => toCatalog(g));
  m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmBox(isCat ? `Apagar "${gearName(g)}" da base de dados de equipamento? Os projetos que já o têm na lista continuam a tê-lo.` : `Tirar "${gearName(g)}" do equipamento? Nos mapas de luz onde está usado fica marcado como "fora da lista".`, isCat ? 'Apagar' : 'Tirar'))) return;
    const { error } = await sb.from(table).delete().eq('id', g.id); if (error) return toast(error.message);
    if (isCat) loadCatalog(true);
    m.close(); onDelete && onDelete(g);
  });
}

// quanto de cada peça é usado nos mapas de luz do projeto: Map(gearId -> [{tool, count}])
export async function gearUsage(pid) {
  const { data } = await sb.from('boards').select('id, title, data').eq('project_id', pid).eq('kind', 'lightmap');
  const use = new Map();
  (data || []).forEach((b) => {
    const c = new Map();
    (b.data?.items || []).forEach((it) => [it.gear_id, it.lens_id, it.mod_id].filter(Boolean).forEach((gid) => c.set(gid, (c.get(gid) || 0) + 1)));
    c.forEach((n, gid) => { if (!use.has(gid)) use.set(gid, []); use.get(gid).push({ id: b.id, title: b.title, n }); });
  });
  return use;
}

export const lightWatts = (gear) => gear.filter((g) => g.category === 'light').reduce((a, g) => a + (g.specs?.watts || 0) * (g.qty || 0), 0);

// --------- página Equipamento ---------
export async function gearPage(main, p, base) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  loadCatalog();
  let gear = await loadGear(p.id);
  let usage = await gearUsage(p.id);
  let fcat = ''; let q = '';
  try { fcat = localStorage.getItem('bg-gear-cat') || ''; } catch { /* nada */ }
  const reload = async () => { gear = await loadGear(p.id); usage = await gearUsage(p.id); draw(); };
  const save = async (g, patch) => { Object.assign(g, patch); const { error } = await sb.from('gear').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', g.id); if (error) toast(error.message); stats(); };
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const stats = () => {
    const box = main.querySelector('[data-stats]'); if (!box) return;
    const lights = gear.filter((g) => g.category === 'light');
    const day = gear.reduce((a, g) => a + (Number(g.price_day) || 0) * (g.qty || 0), 0);
    const cap = gear.filter((g) => g.category === 'power').reduce((a, g) => a + (g.specs?.capacity_w || 0) * (g.qty || 0), 0);
    box.innerHTML = `<div class="gr-stat"><b>${gear.reduce((a, g) => a + (g.qty || 0), 0)}</b><span>peças</span></div>
      <div class="gr-stat"><b>${lights.reduce((a, g) => a + (g.qty || 0), 0)}</b><span>luzes</span></div>
      <div class="gr-stat"><b>${(lightWatts(gear) / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} kW</b><span>se tudo acender a 100%</span></div>
      <div class="gr-stat"><b>${cap ? (cap / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 }) + ' kW' : '—'}</b><span>geradores e baterias</span></div>
      <div class="gr-stat"><b>${day ? day.toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' }) : '—'}</b><span>por dia de aluguer</span></div>`;
  };
  const draw = () => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const shown = gear.filter((g) => (!fcat || g.category === fcat) && words.every((w) => norm(`${gearName(g)} ${g.supplier} ${specLine(g)} ${g.notes}`).includes(w)));
    main.innerHTML = `
      <div class="row between wrap-gap"><div><h1 class="h1 pm-title">Equipamento</h1><p class="muted">Tudo o que vem para a rodagem. Os mapas de luz só usam o que está aqui, por isso o plano de luz bate certo com a lista da rental.</p></div>
        <div class="row wrap-gap"><button type="button" class="btn ghost" data-paste>${ICON.list} Colar lista</button><button type="button" class="btn ghost" data-pdf>${ICON.open} Exportar PDF</button><button type="button" class="btn primary" data-add>${ICON.plus} Equipamento</button></div></div>
      <div class="gr-stats" data-stats></div>
      <div class="row wrap-gap gr-filters">
        <div class="seg dark gr-seg" role="tablist">${[['', 'Tudo'], ...CATS].filter(([k]) => !k || gear.some((g) => g.category === k)).map(([k, l]) => `<button type="button" role="tab" aria-selected="${fcat === k}" data-c="${k}">${l}<small>${k ? gear.filter((g) => g.category === k).length : gear.length}</small></button>`).join('')}</div>
        <input type="search" data-q value="${esc(q)}" placeholder="Procurar…" aria-label="Procurar equipamento" style="flex:1 1 200px;max-width:320px">
      </div>
      ${!gear.length ? `<div class="empty-note gr-empty"><p><strong>Ainda não há equipamento.</strong></p><p class="muted">Junta luzes, câmaras e objetivas do catálogo, ou cola a lista que a rental te mandou.</p><button type="button" class="btn primary" data-add2>${ICON.plus} Juntar equipamento</button></div>` : ''}
      ${CATS.filter(([k]) => shown.some((g) => g.category === k)).map(([k, l]) => `<section class="panel gr-sec"><h2 class="h3">${l}</h2>
        <div class="gr-tw"><table class="gr-t"><thead><tr><th>Equipamento</th><th class="gr-q">Qtd.</th><th>Especificações</th><th>Fornecedor</th><th class="gr-p">€ / dia</th><th>Nos mapas</th><th></th></tr></thead><tbody>
        ${shown.filter((g) => g.category === k).map((g) => { const u = usage.get(g.id) || []; const max = Math.max(0, ...u.map((x) => x.n)); return `<tr data-g="${g.id}">
          <td><button type="button" class="gr-name" data-edit="${g.id}"><b>${esc(g.name)}</b>${g.brand ? `<small>${esc(g.brand)}</small>` : ''}</button></td>
          <td class="gr-q"><input class="gr-in" data-f="qty" inputmode="numeric" value="${esc(g.qty)}" aria-label="Quantidade"></td>
          <td class="gr-spec">${esc(specLine(g)) || '<span class="muted">—</span>'}${g.notes ? `<small>${esc(g.notes)}</small>` : ''}</td>
          <td><input class="gr-in" data-f="supplier" value="${esc(g.supplier || '')}" placeholder="—" aria-label="Fornecedor"></td>
          <td class="gr-p"><input class="gr-in" data-f="price_day" inputmode="decimal" value="${esc(g.price_day ?? '')}" placeholder="—" aria-label="Preço por dia"></td>
          <td>${u.length ? u.map((x) => `<a class="chip ${x.n > g.qty ? 'warn' : ''}" href="${base}/f/${x.id}" title="${x.n} usad${x.n === 1 ? 'o' : 'os'} neste mapa">${esc(x.title)}${x.n > 1 ? ` ×${x.n}` : ''}</a>`).join(' ') : '<span class="muted small">—</span>'}${max > g.qty ? `<small class="danger-text">Um mapa usa ${max}, só há ${g.qty}.</small>` : ''}</td>
          <td class="gr-act"><button type="button" class="icon-btn" data-edit="${g.id}" aria-label="Editar">${ICON.note}</button></td></tr>`; }).join('')}
        </tbody></table></div></section>`).join('')}`;
    stats();
    main.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { fcat = b.dataset.c; try { localStorage.setItem('bg-gear-cat', fcat); } catch { /* nada */ } draw(); }));
    main.querySelector('[data-q]').addEventListener('input', (e) => { q = e.target.value; const pos = e.target.selectionStart; draw(); const i = main.querySelector('[data-q]'); i.focus(); i.setSelectionRange(pos, pos); });
    [main.querySelector('[data-add]'), main.querySelector('[data-add2]')].filter(Boolean).forEach((b) => b.addEventListener('click', () => addGearModal(p, { cat: fcat, onDone: () => reload() })));
    main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => { const g = gear.find((x) => x.id === b.dataset.edit); editGearModal(g, { onDone: reload, onDelete: reload }); }));
    main.querySelectorAll('tr[data-g] [data-f]').forEach((inp) => inp.addEventListener('change', () => {
      const g = gear.find((x) => x.id === inp.closest('tr').dataset.g); const k = inp.dataset.f;
      let v = inp.value.trim();
      if (k === 'qty') v = Math.max(0, parseInt(v, 10) || 0);
      if (k === 'price_day') { const x = parseFloat(v.replace(',', '.')); v = Number.isFinite(x) ? x : null; }
      save(g, { [k]: v });
    }));
    main.querySelector('[data-pdf]').addEventListener('click', () => exportPdf({
      title: `Equipamento — ${p.name}`, subtitle: p.client || '',
      columns: [{ label: 'Equipamento', width: '30%' }, { label: 'Qtd.', width: '6%', align: 'center' }, { label: 'Especificações', width: '34%' }, { label: 'Fornecedor', width: '18%' }, { label: '€/dia', width: '12%', align: 'right' }],
      groups: CATS.filter(([k]) => gear.some((g) => g.category === k)).map(([k, l]) => ({ title: l, color: '#2FB67C', rows: gear.filter((g) => g.category === k).map((g) => [gearName(g), String(g.qty), specLine(g) + (g.notes ? ` — ${g.notes}` : ''), g.supplier || '', g.price_day != null ? Number(g.price_day).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) + ' €' : '']) })),
      footer: [['Peças', String(gear.reduce((a, g) => a + (g.qty || 0), 0))], ['Luzes a 100%', `${(lightWatts(gear) / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })} kW`], ['Por dia', gear.reduce((a, g) => a + (Number(g.price_day) || 0) * (g.qty || 0), 0).toLocaleString('pt-PT', { style: 'currency', currency: 'EUR' })]],
    }));
    main.querySelector('[data-paste]').addEventListener('click', () => pasteList(p, reload));
  };
  draw();
}

// colar uma lista (uma peça por linha, "2x SkyPanel S60" ou "SkyPanel S60 - 2"): reconhece o que está no catálogo
function pasteList(p, done) {
  const m = modal(`<h2>Colar lista de equipamento</h2><p class="muted small">Uma peça por linha. A quantidade pode vir antes ou depois ("2x SkyPanel S60", "Frame 6x6 - 2"). O que reconhecer no catálogo vem com as especificações; o resto entra em "Outros" para completares.</p>
    <textarea data-t rows="10" placeholder="2x Aputure LS 600d Pro&#10;1 ARRI SkyPanel S60-C&#10;Frame 6x6 - 2&#10;Sony FX6"></textarea>
    <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Juntar</button></div>`, { wide: true });
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  m.el.querySelector('[data-ok]').addEventListener('click', async () => {
    const lines = m.el.querySelector('[data-t]').value.split('\n').map((l) => l.trim()).filter(Boolean);
    const rows = lines.map((l, i) => {
      let qty = 1; let name = l;
      let r = l.match(/^(\d+)\s*(x|un\.?|×)?\s+(.+)$/i); if (r) { qty = +r[1]; name = r[3]; }
      else if ((r = l.match(/^(.+?)\s*[-–x×:]\s*(\d+)\s*(un\.?)?$/i))) { name = r[1]; qty = +r[2]; }
      const n = norm(name);
      const hit = CATALOG.find((g) => { const full = norm(`${g.brand} ${g.name}`); const short = norm(g.name); return n === full || n === short || n.includes(short) || full.includes(n); });
      return hit ? { project_id: p.id, category: hit.category, brand: hit.brand, name: hit.name, specs: hit.specs, qty, position: Date.now() / 1000 + i } : { project_id: p.id, category: 'other', brand: '', name: name.trim(), specs: {}, qty, position: Date.now() / 1000 + i };
    });
    if (!rows.length) return m.close();
    const { error } = await sb.from('gear').insert(rows); if (error) return toast(error.message);
    const known = rows.filter((r) => r.category !== 'other').length;
    m.close(); toast(`${rows.length} peças juntadas (${known} reconhecidas no catálogo).`); done();
  });
}
