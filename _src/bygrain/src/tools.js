import { sb, esc, toast, modal, confirmBox, ICON, fmtDate, todayISO, daysUntil } from './lib.js';
import { loadPeople, editTask } from './tasks.js';
import { shootDays } from './shootdays.js';

// Ferramentas de projeto além do board: tabela e cronograma (o mapa de luz está em lightmap.js).

export const TOOL_KINDS = {
  board: { label: 'Board', icon: ICON.board },
  table: { label: 'Tabela', icon: ICON.list },
  timeline: { label: 'Cronograma', icon: ICON.task },
  lightmap: { label: 'Mapa de luz', icon: ICON.bulb },
  budget: { label: 'Orçamento', icon: ICON.money },
  media: { label: 'Música e pre-vis', icon: ICON.music },
  callsheet: { label: 'Folha de serviço', icon: ICON.calendar },
  transport: { label: 'Mapa de transportes', icon: ICON.car },
  distribution: { label: 'Tabela Distribuição', icon: ICON.globe },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 700) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

import { projectContacts } from './contacts.js';
// ---------- modelos de tabela ----------
export async function tableTemplate(p, tpl) {
  const col = (name, type = 'text') => ({ id: uid(), name, type });
  if (tpl === 'cast') {
    const cols = [col('Personagem'), col('Ator ou atriz'), col('Telefone'), col('Email'), col('Disponibilidade'), col('Confirmado', 'check')];
    const { data } = await sb.from('characters').select('name, actor, info').eq('project_id', p.id).order('position');
    return { columns: cols, rows: (data || []).map((c) => ({ id: uid(), cells: { [cols[0].id]: c.name, [cols[1].id]: c.actor, [cols[2].id]: c.info?.phone || '', [cols[3].id]: c.info?.email || '' } })) };
  }
  if (tpl === 'contacts') {
    const cols = [col('Nome'), col('Função'), col('Departamento'), col('Telefone'), col('Email')];
    const list = await projectContacts(p);
    return { columns: cols, rows: list.map((c) => ({ id: uid(), cells: { [cols[0].id]: c.name, [cols[1].id]: c.job, [cols[2].id]: c.dept, [cols[3].id]: c.phone, [cols[4].id]: c.email } })) };
  }
  if (tpl === 'props') {
    const cols = [col('Cena'), col('Adereço'), col('Estado'), col('Responsável'), col('Notas')];
    const [{ data: scenes }, { data: props }] = await Promise.all([
      sb.from('scenes').select('id, number').eq('project_id', p.id).order('position'),
      sb.from('props').select('name, status, scene_ids').eq('project_id', p.id).eq('removed', false),
    ]);
    const rows = [];
    if (!(scenes || []).length) (props || []).forEach((x) => rows.push({ id: uid(), cells: { [cols[1].id]: x.name, [cols[2].id]: x.status.replace('_', ' ') } }));
    (scenes || []).forEach((s) => {
      const ps = (props || []).filter((x) => (x.scene_ids || []).includes(s.id));
      if (!ps.length) rows.push({ id: uid(), cells: { [cols[0].id]: s.number } });
      ps.forEach((x) => rows.push({ id: uid(), cells: { [cols[0].id]: s.number, [cols[1].id]: x.name, [cols[2].id]: x.status.replace('_', ' ') } }));
    });
    return { columns: cols, rows };
  }
  if (tpl === 'deliverables') {
    const cols = [col('Peça'), col('Formato'), col('Plataforma'), col('Publicação', 'date'), col('Aprovado', 'check')];
    return { columns: cols, rows: ['Teaser', 'Reel', 'Posts'].map((t) => ({ id: uid(), cells: { [cols[0].id]: t } })) };
  }
  const cols = [col('Nome'), col('Notas'), col('Feito', 'check')];
  return { columns: cols, rows: [1, 2, 3].map(() => ({ id: uid(), cells: {} })) };
}

// ---------- tabela ----------
import { exportPdf } from './pdf.js';
import { colorField, readColor, bindColorField, colorPop, tableShortcuts, rowStyle, colStyle, makeHistory, bindUndoKeys } from './tablekit.js';

export function tableTool(main, p, tool) {
  let data = { columns: [], rows: [], ...(tool.data || {}) };
  const hist = makeHistory({ get: () => data, set: (v) => { data = v; }, after: () => { draw(); save(); }, notify: toast });
  const snap = (l) => hist.push(l);
  const save = debounce(async () => {
    const { error } = await sb.from('boards').update({ data, updated_at: new Date().toISOString() }).eq('id', tool.id);
    if (error) toast('Não foi possível guardar: ' + error.message);
  });
  function cell(r, c) {
    const v = r.cells?.[c.id] ?? '';
    if (c.type === 'check') return `<input type="checkbox" data-c="${c.id}" ${v ? 'checked' : ''} aria-label="${esc(c.name)}">`;
    if (c.type === 'number') return `<input type="number" data-c="${c.id}" value="${esc(v)}" aria-label="${esc(c.name)}">`;
    if (c.type === 'date') return `<input type="date" data-c="${c.id}" value="${esc(v)}" aria-label="${esc(c.name)}">`;
    return `<input data-c="${c.id}" value="${esc(v)}" aria-label="${esc(c.name)}">`;
  }
  function draw() {
    main.querySelector('[data-tbl]').innerHTML = `<table class="table sheet"><thead><tr>${data.columns.map((c) => `<th data-colid="${c.id}" class="${c.color ? 'has-cc' : ''}"${colStyle(c)}><button type="button" class="th-btn" data-col="${c.id}">${esc(c.name)}</button></th>`).join('')}<th class="th-add"><button type="button" class="icon-btn sm" data-addcol aria-label="Juntar coluna">${ICON.plus}</button></th></tr></thead>
      <tbody>${data.rows.map((r) => `<tr data-row="${r.id}" class="${r.color ? 'has-rc' : ''}"${rowStyle(r)}>${data.columns.map((c, i) => `<td class="t-${c.type} ${c.color ? 'has-cc' : ''} ${i === 0 ? 'rd-cell' : ''}" data-colid="${c.id}"${colStyle(c)}>${i === 0 ? '<button type="button" class="row-dot" data-rowcolor title="Cor da linha" aria-label="Cor da linha"></button>' : ''}${cell(r, c)}</td>`).join('')}<td><button type="button" class="icon-btn sm" data-rmrow aria-label="Apagar linha">${ICON.close}</button></td></tr>`).join('')}</tbody></table>
      <div class="row wrap-gap"><button type="button" class="link-btn" data-addrow>${ICON.plus} Linha</button><span class="muted small"><kbd>Alt</kbd>+<kbd>↓</kbd> linha e <kbd>Alt</kbd>+<kbd>→</kbd> coluna onde está o rato · cor da linha no ponto à esquerda · cor da coluna clicando no nome</span></div>`;
    const at = (id) => { const i = data.rows.findIndex((x) => x.id === id); return i < 0 ? data.rows.length - 1 : i; };
    const insRow = (i) => { snap('juntar linha'); const r = { id: uid(), cells: {} }; data.rows.splice(i, 0, r); draw(); save(); main.querySelector(`[data-row="${r.id}"] [data-c]`)?.focus(); };
    const insCol = (id, side) => { snap('juntar coluna'); const i = data.columns.findIndex((c) => c.id === id); const c = { id: uid(), name: 'Nova coluna', type: 'text' }; data.columns.splice(i < 0 ? data.columns.length : i + side, 0, c); draw(); save(); colForm(c, true); };
    hist.watch(main.querySelector('table.sheet'));
    tableShortcuts(main.querySelector('table.sheet'), { rowBelow: (id) => insRow(at(id) + 1), rowAbove: (id) => insRow(Math.max(0, at(id))), colRight: (id) => insCol(id, 1), colLeft: (id) => insCol(id, 0) });
  }
  bindUndoKeys(main, hist);
  main.innerHTML = `<div class="row end"><button type="button" class="btn ghost" data-people title="Junta a equipa e o elenco com os contactos que já estão no projeto">${ICON.team} Pessoas do projeto</button><button type="button" class="btn ghost" data-pdf>${ICON.open} Exportar PDF</button></div><div class="tbl-wrap" data-tbl></div>`;
  // folha de contactos: junta as pessoas do projeto (e preenche telefones/emails que faltem nas que já lá estão)
  main.querySelector('[data-people]').addEventListener('click', async () => {
    const list = await projectContacts(p);
    if (!list.length) return toast('Ainda não há pessoas no projeto (equipa e convites, ou atores e figurantes).');
    const find = (re) => data.columns.find((c) => re.test(String(c.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()));
    const cName = find(/^(nome|pessoa|quem|ator|atriz)/) || data.columns.find((c) => (c.type || 'text') === 'text');
    const map = [[cName, 'name'], [find(/personagem/), 'role'], [find(/func|cargo|papel/), 'job'], [find(/departamento|dept/), 'dept'], [find(/telef|telem|contacto|phone|tlm/), 'phone'], [find(/e-?mail/), 'email']].filter(([c]) => c);
    if (!cName) return toast('A tabela precisa de uma coluna para o nome.');
    if (!map.some(([, k]) => k === 'phone')) { data.columns.push({ id: uid(), name: 'Telefone', type: 'text' }); map.push([data.columns[data.columns.length - 1], 'phone']); }
    const norm = (v) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    snap('juntar pessoas do projeto');
    let added = 0, filled = 0;
    list.forEach((c) => {
      const row = data.rows.find((r) => norm(r.cells?.[cName.id]) && (norm(r.cells[cName.id]) === norm(c.name) || (c.role && norm(r.cells[cName.id]) === norm(c.role))));
      if (row) { map.forEach(([col, k]) => { if (!row.cells[col.id] && c[k]) { row.cells[col.id] = c[k]; filled++; } }); return; }
      data.rows.push({ id: uid(), cells: Object.fromEntries(map.filter(([, k]) => c[k]).map(([col, k]) => [col.id, c[k]])) }); added++;
    });
    draw(); save();
    toast(added || filled ? `${added ? `${added} ${added === 1 ? 'pessoa juntada' : 'pessoas juntadas'}` : ''}${added && filled ? ' · ' : ''}${filled ? `${filled} ${filled === 1 ? 'campo preenchido' : 'campos preenchidos'}` : ''}.` : 'Já estão todos na tabela.');
  });
  draw();
  main.querySelector('[data-pdf]').addEventListener('click', () => exportPdf({
    title: tool.title, subtitle: p.name, landscape: data.columns.length > 5,
    columns: data.columns.map((c) => ({ label: c.name, align: c.type === 'number' ? 'right' : c.type === 'check' ? 'center' : undefined })),
    groups: [{ title: null, rows: data.rows.map((r) => data.columns.map((c) => { const v = r.cells?.[c.id]; return c.type === 'check' ? (v ? '✓' : '') : c.type === 'date' && v ? new Date(v + 'T00:00:00').toLocaleDateString('pt-PT') : v ?? ''; })) }],
  }));
  main.addEventListener('input', (e) => {
    const inp = e.target.closest('[data-c]'); if (!inp) return;
    const r = data.rows.find((x) => x.id === inp.closest('[data-row]').dataset.row);
    r.cells = { ...(r.cells || {}), [inp.dataset.c]: inp.type === 'checkbox' ? inp.checked : inp.value };
    save();
  });
  main.addEventListener('keydown', (e) => {
    const inp = e.target.closest('[data-c]'); if (!inp || e.key !== 'Enter') return;
    e.preventDefault();
    const tr = inp.closest('tr'); const idx = [...tr.querySelectorAll('[data-c]')].indexOf(inp);
    let next = tr.nextElementSibling;
    if (!next) { snap('juntar linha'); data.rows.push({ id: uid(), cells: {} }); draw(); save(); next = main.querySelector('tbody tr:last-child'); }
    next.querySelectorAll('[data-c]')[idx]?.focus();
  });
  main.addEventListener('click', (e) => {
    const dot = e.target.closest('[data-rowcolor]');
    if (dot) { const r = data.rows.find((x) => x.id === dot.closest('[data-row]').dataset.row); colorPop(dot, r.color, (c) => { snap('cor da linha'); if (c) r.color = c; else delete r.color; draw(); save(); }); return; }
    if (e.target.closest('[data-addrow]')) { snap('juntar linha'); data.rows.push({ id: uid(), cells: {} }); draw(); save(); main.querySelector('tbody tr:last-child [data-c]')?.focus(); return; }
    if (e.target.closest('[data-rmrow]')) { snap('apagar linha'); const id = e.target.closest('[data-row]').dataset.row; data.rows = data.rows.filter((r) => r.id !== id); draw(); save(); return; }
    if (e.target.closest('[data-addcol]')) return colForm(null);
    const th = e.target.closest('[data-col]'); if (th) colForm(data.columns.find((c) => c.id === th.dataset.col));
  });
  function colForm(c, justAdded = false) {
    const isNew = !c; c = c || { id: uid(), name: '', type: 'text' };
    const m = modal(`<h2>${isNew ? 'Nova coluna' : 'Coluna'}</h2><form class="stack">
      <div class="field"><label for="cn">Nome</label><input id="cn" value="${esc(c.name)}" required></div>
      <div class="field"><label for="ct">Tipo</label><select id="ct">${[['text', 'Texto'], ['number', 'Número'], ['date', 'Data'], ['check', 'Visto']].map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${colorField(c.color)}
      <div class="row between">${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar coluna</button>`}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>`);
    bindColorField(m.el);
    if (justAdded) m.el.querySelector('#cn').select();
    m.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault(); if (!justAdded) snap(isNew ? 'juntar coluna' : 'mudar coluna'); c.name = m.el.querySelector('#cn').value.trim() || 'Coluna'; c.type = m.el.querySelector('#ct').value;
      const col = readColor(m.el); if (col) c.color = col; else delete c.color;
      if (isNew) data.columns.push(c); m.close(); draw(); save();
    });
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      m.close(); if (!(await confirmBox(`Apagar a coluna "${c.name}"?`, 'Apagar'))) return;
      snap('apagar coluna'); data.columns = data.columns.filter((x) => x.id !== c.id); draw(); save();
    });
  }
}

// ---------- cronograma ----------
const PHASES_BASE = [['pre', 'Pré-produção', '#7C5CFF'], ['prod', 'Produção', '#F08A24'], ['post', 'Pós-produção', '#2FB67C']];
const COLORS = [['#2B7FFF', 'Azul'], ['#E5484D', 'Vermelho'], ['#E3B341', 'Amarelo'], ['#2FB67C', 'Verde'], ['#9B6CFF', 'Roxo'], ['#F08A24', 'Laranja'], ['#E05FA8', 'Rosa'], ['#8A8A99', 'Cinzento']];
const PRESETS = ['Repérage', 'Casting', 'Ensaio', 'Provas de guarda-roupa', 'Reunião de produção', 'Leitura técnica', 'Teste de câmara', 'Entrega do offline', 'Color grading', 'Mistura de som', 'Entrega final', 'Estreia', 'Festival'];
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

// dias de rodagem seguidos juntam-se numa barra ("Rodagem · dias 1–4 · 14–17 nov")
function runs(days) {
  const out = []; let cur = null;
  [...days].sort((a, b) => a.date.localeCompare(b.date)).forEach((x) => {
    if (cur && diff(cur.b, x.date) <= 1) { cur.b = x.date; cur.days.push(x.day); }
    else { cur = { a: x.date, b: x.date, days: [x.day], board: x.board }; out.push(cur); }
  });
  out.forEach((r) => { const ds = r.days.length > 1 ? `dias ${r.days[0]}–${r.days[r.days.length - 1]}` : `dia ${r.days[0]}`; r.label = `Rodagem · ${ds} · ${fmtDate(r.a)}${r.b !== r.a ? ` – ${fmtDate(r.b)}` : ''}`; r.title = r.label; });
  return out;
}
export async function timelineTool(main, p, tool) {
  const data = { ...(tool.data || {}) };
  if (!data.phases) {
    const s = p.starts_on || todayISO(); const e = p.ends_on || addDays(s, 60); const n = Math.max(3, diff(s, e));
    data.phases = { pre: [s, addDays(s, Math.round(n / 3))], prod: [addDays(s, Math.round(n / 3) + 1), addDays(s, Math.round((2 * n) / 3))], post: [addDays(s, Math.round((2 * n) / 3) + 1), e] };
  }
  // ficção: quarta etapa, Distribuição (depois da pós-produção)
  if (p.kind === 'ficcao' && !data.phases.dist) { const e = data.phases.post?.[1] || p.ends_on || todayISO(); data.phases.dist = [addDays(e, 1), addDays(e, 180)]; }
  const PHASES = p.kind === 'ficcao' ? [...PHASES_BASE, ['dist', 'Distribuição', '#1F8A8A']] : PHASES_BASE;
  const [{ data: tasks }, people, sdays] = await Promise.all([sb.from('tasks').select('*').eq('project_id', p.id), loadPeople(), shootDays(p).catch(() => [])]);
  const shoot = sdays.filter((x) => x.date);
  const st = { tasks: tasks || [], people, projects: new Map([[p.id, p]]) };
  const save = debounce(() => sb.from('boards').update({ data, updated_at: new Date().toISOString() }).eq('id', tool.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message)));
  const draw = () => {
    const dated = st.tasks.filter((t) => t.due);
    const items = (data.items ||= []);
    const all = [...Object.values(data.phases).flat(), ...dated.map((t) => t.due), ...items.flatMap((x) => [x.start, x.end]).filter(Boolean), ...shoot.map((x) => x.date), todayISO()];
    const start = addDays(all.reduce((a, b) => (a < b ? a : b)), -3), end = addDays(all.reduce((a, b) => (a > b ? a : b)), 3);
    const total = Math.max(1, diff(start, end));
    const pct = (iso) => `${(diff(start, iso) / total) * 100}%`;
    const w = (a, b) => `${(Math.max(1, diff(a, b) + 1) / total) * 100}%`;
    const months = []; let d = new Date(start + 'T00:00:00'); d.setDate(1);
    while (d.toISOString().slice(0, 10) <= end) { const iso = d.toISOString().slice(0, 10); months.push(iso < start ? start : iso); d.setMonth(d.getMonth() + 1); }
    const depts = p.departments || [];
    const groups = [...depts.map((dp) => ({ ...dp, list: dated.filter((t) => t.department === dp.id) })), { id: '', name: 'Sem departamento', color: '#8A8A99', list: dated.filter((t) => !t.department || !depts.some((x) => x.id === t.department)) }].filter((g) => g.list.length);
    main.innerHTML = `
      <div class="tl-phases">${PHASES.map(([k, l, c]) => `<fieldset class="tl-ph" style="--g:${c}"><legend><i></i>${l}</legend><input type="date" data-ph="${k}" data-i="0" value="${data.phases[k][0]}" aria-label="${l}: início"><span>até</span><input type="date" data-ph="${k}" data-i="1" value="${data.phases[k][1]}" aria-label="${l}: fim"></fieldset>`).join('')}</div>
      <section class="tl-items"><div class="row between wrap-gap"><h3 class="h4">Outras datas</h3><button type="button" class="btn ghost sm" data-additem>${ICON.plus} Data</button></div>
        ${items.length ? `<ul>${items.map((x) => `<li data-item="${x.id}">
          <label class="tl-col" style="--g:${esc(x.color)}" title="Cor"><i></i><select data-if="color" aria-label="Cor">${COLORS.map(([c, n]) => `<option value="${c}" ${c === x.color ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <input data-if="name" value="${esc(x.name)}" placeholder="ex: Repérage, Ensaio, Entrega do offline, Estreia" list="tl-presets" aria-label="Nome">
          <input type="date" data-if="start" value="${esc(x.start || '')}" aria-label="Data">
          <span class="muted small">até</span>
          <input type="date" data-if="end" value="${esc(x.end || '')}" aria-label="Até (opcional)" title="Opcional: deixa vazio para um só dia">
          <button type="button" class="icon-btn sm" data-delitem aria-label="Apagar esta data">${ICON.trash}</button></li>`).join('')}</ul>` : '<p class="muted small">Junta repérages, ensaios, reuniões, entregas, estreias… Aparecem no cronograma e na visão geral.</p>'}
        <datalist id="tl-presets">${PRESETS.map((x) => `<option value="${x}">`).join('')}</datalist>
      </section>
      <div class="tl">
        <div class="tl-scale">${months.map((m) => `<span style="left:${pct(m)}">${fmtDate(m).split(' ')[1]}</span>`).join('')}</div>
        <div class="tl-row tl-phase-row">${PHASES.map(([k, l, c]) => `<div class="tl-bar ph" style="left:${pct(data.phases[k][0])};width:${w(data.phases[k][0], data.phases[k][1])};--g:${c}" title="${l}">${l}</div>`).join('')}</div>
        ${shoot.length ? `<div class="tl-group"><div class="tl-gh" style="--g:#F08A24"><i></i>Dias de rodagem <span class="muted small">(das folhas de serviço)</span></div>${runs(shoot).map((r) => `<div class="tl-row">${r.a === r.b ? `<a class="tl-ms" href="${location.hash.split('/f/')[0]}/f/${r.board}" style="left:${pct(r.a)};--g:#F08A24" title="${esc(r.title)}"><i></i><span>${esc(r.label)}</span></a>` : `<a class="tl-bar it" href="${location.hash.split('/f/')[0]}/f/${r.board}" style="left:${pct(r.a)};width:${w(r.a, r.b)};--g:#F08A24;text-decoration:none" title="${esc(r.title)}"></a><span class="tl-lbl" style="left:calc(${pct(r.a)} + ${w(r.a, r.b)})">${esc(r.label)}</span>`}</div>`).join('')}</div>` : ''}
        ${items.filter((x) => x.start).length ? `<div class="tl-group"><div class="tl-gh" style="--g:#8A8A99"><i></i>Outras datas</div>
          ${[...items].filter((x) => x.start).sort((a, b) => a.start.localeCompare(b.start)).map((x) => x.end && x.end > x.start
            ? `<div class="tl-row"><div class="tl-bar it" style="left:${pct(x.start)};width:${w(x.start, x.end)};--g:${esc(x.color)}" title="${esc(x.name)}: ${fmtDate(x.start)} – ${fmtDate(x.end)}"></div><span class="tl-lbl" style="left:calc(${pct(x.start)} + ${w(x.start, x.end)})">${esc(x.name || 'Data')} · ${fmtDate(x.start)} – ${fmtDate(x.end)}</span></div>`
            : `<div class="tl-row"><div class="tl-ms" style="left:${pct(x.start)};--g:${esc(x.color)}" title="${esc(x.name)}: ${fmtDate(x.start)}"><i></i><span>${esc(x.name || 'Data')} · ${fmtDate(x.start)}</span></div></div>`).join('')}</div>` : ''}
        ${groups.map((g) => `<div class="tl-group"><div class="tl-gh" style="--g:${esc(g.color)}"><i></i>${esc(g.name)}</div>
          ${g.list.sort((a, b) => a.due.localeCompare(b.due)).map((t) => { const s0 = t.created_at ? t.created_at.slice(0, 10) : addDays(t.due, -3); const s1 = s0 > t.due ? addDays(t.due, -1) : s0; return `<div class="tl-row"><button type="button" class="tl-bar task ${t.status} ${t.status !== 'done' && daysUntil(t.due) < 0 ? 'late' : ''}" data-t="${t.id}" style="left:${pct(s1)};width:${w(s1, t.due)};--g:${esc(g.color)}"><span>${esc(t.title)}</span></button></div>`; }).join('')}
        </div>`).join('') || '<p class="muted small tl-empty">As tarefas com prazo aparecem aqui.</p>'}
        <div class="tl-today" style="left:${pct(todayISO())}"><span>Hoje</span></div>
      </div>`;
    main.querySelectorAll('[data-ph]').forEach((inp) => inp.addEventListener('change', () => { data.phases[inp.dataset.ph][+inp.dataset.i] = inp.value; save(); draw(); }));
    main.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => editTask(st.tasks.find((t) => t.id === b.dataset.t), st, draw)));
    main.querySelector('[data-additem]').addEventListener('click', () => { items.push({ id: uid(), name: '', start: todayISO(), end: '', color: COLORS[items.length % COLORS.length][0] }); save(); draw(); main.querySelector('[data-item]:last-of-type [data-if="name"]')?.focus(); });
    main.querySelectorAll('[data-item]').forEach((li) => {
      const x = items.find((y) => y.id === li.dataset.item);
      li.querySelector('[data-if="name"]').addEventListener('input', (e) => { x.name = e.target.value; save(); });
      li.querySelector('[data-if="name"]').addEventListener('change', () => draw());
      ['start', 'end', 'color'].forEach((k) => li.querySelector(`[data-if="${k}"]`).addEventListener('change', (e) => { x[k] = e.target.value; if (k === 'start' && x.end && x.end < x.start) x.end = ''; save(); draw(); }));
      li.querySelector('[data-delitem]').addEventListener('click', async () => { if (x.name && !(await confirmBox(`Apagar "${x.name}"?`, 'Apagar'))) return; data.items = items.filter((y) => y !== x); save(); draw(); });
    });
  };
  draw();
}
