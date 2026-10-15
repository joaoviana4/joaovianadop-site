import { sb, esc, toast, modal, confirmBox, ICON, fmtDate, todayISO, daysUntil } from './lib.js';
import { loadPeople, editTask } from './tasks.js';

// Ferramentas de projeto além do board: tabela e cronograma (o mapa de luz está em lightmap.js).

export const TOOL_KINDS = {
  board: { label: 'Board', icon: ICON.board },
  table: { label: 'Tabela', icon: ICON.list },
  timeline: { label: 'Cronograma', icon: ICON.task },
  lightmap: { label: 'Mapa de luz', icon: ICON.bulb },
  budget: { label: 'Orçamento', icon: ICON.money },
  media: { label: 'Música e pre-vis', icon: ICON.music },
};
const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 700) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// ---------- modelos de tabela ----------
export async function tableTemplate(p, tpl) {
  const col = (name, type = 'text') => ({ id: uid(), name, type });
  if (tpl === 'cast') {
    const cols = [col('Personagem'), col('Ator ou atriz'), col('Contacto'), col('Disponibilidade'), col('Confirmado', 'check')];
    const { data } = await sb.from('characters').select('name, actor').eq('project_id', p.id).order('position');
    return { columns: cols, rows: (data || []).map((c) => ({ id: uid(), cells: { [cols[0].id]: c.name, [cols[1].id]: c.actor } })) };
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

export function tableTool(main, p, tool) {
  const data = { columns: [], rows: [], ...(tool.data || {}) };
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
    main.querySelector('[data-tbl]').innerHTML = `<table class="table sheet"><thead><tr>${data.columns.map((c) => `<th><button type="button" class="th-btn" data-col="${c.id}">${esc(c.name)}</button></th>`).join('')}<th class="th-add"><button type="button" class="icon-btn sm" data-addcol aria-label="Juntar coluna">${ICON.plus}</button></th></tr></thead>
      <tbody>${data.rows.map((r) => `<tr data-row="${r.id}">${data.columns.map((c) => `<td class="t-${c.type}">${cell(r, c)}</td>`).join('')}<td><button type="button" class="icon-btn sm" data-rmrow aria-label="Apagar linha">${ICON.close}</button></td></tr>`).join('')}</tbody></table>
      <button type="button" class="link-btn" data-addrow>${ICON.plus} Linha</button>`;
  }
  main.innerHTML = `<div class="row end"><button type="button" class="btn ghost" data-pdf>${ICON.open} Exportar PDF</button></div><div class="tbl-wrap" data-tbl></div>`;
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
    if (!next) { data.rows.push({ id: uid(), cells: {} }); draw(); save(); next = main.querySelector('tbody tr:last-child'); }
    next.querySelectorAll('[data-c]')[idx]?.focus();
  });
  main.addEventListener('click', (e) => {
    if (e.target.closest('[data-addrow]')) { data.rows.push({ id: uid(), cells: {} }); draw(); save(); main.querySelector('tbody tr:last-child [data-c]')?.focus(); return; }
    if (e.target.closest('[data-rmrow]')) { const id = e.target.closest('[data-row]').dataset.row; data.rows = data.rows.filter((r) => r.id !== id); draw(); save(); return; }
    if (e.target.closest('[data-addcol]')) return colForm(null);
    const th = e.target.closest('[data-col]'); if (th) colForm(data.columns.find((c) => c.id === th.dataset.col));
  });
  function colForm(c) {
    const isNew = !c; c = c || { id: uid(), name: '', type: 'text' };
    const m = modal(`<h2>${isNew ? 'Nova coluna' : 'Coluna'}</h2><form class="stack">
      <div class="field"><label for="cn">Nome</label><input id="cn" value="${esc(c.name)}" required></div>
      <div class="field"><label for="ct">Tipo</label><select id="ct">${[['text', 'Texto'], ['number', 'Número'], ['date', 'Data'], ['check', 'Visto']].map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="row between">${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar coluna</button>`}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>`);
    m.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault(); c.name = m.el.querySelector('#cn').value.trim() || 'Coluna'; c.type = m.el.querySelector('#ct').value;
      if (isNew) data.columns.push(c); m.close(); draw(); save();
    });
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      m.close(); if (!(await confirmBox(`Apagar a coluna "${c.name}"?`, 'Apagar'))) return;
      data.columns = data.columns.filter((x) => x.id !== c.id); draw(); save();
    });
  }
}

// ---------- cronograma ----------
const PHASES = [['pre', 'Pré-produção', '#7C5CFF'], ['prod', 'Produção', '#F08A24'], ['post', 'Pós-produção', '#2FB67C']];
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const diff = (a, b) => Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);

export async function timelineTool(main, p, tool) {
  const data = { ...(tool.data || {}) };
  if (!data.phases) {
    const s = p.starts_on || todayISO(); const e = p.ends_on || addDays(s, 60); const n = Math.max(3, diff(s, e));
    data.phases = { pre: [s, addDays(s, Math.round(n / 3))], prod: [addDays(s, Math.round(n / 3) + 1), addDays(s, Math.round((2 * n) / 3))], post: [addDays(s, Math.round((2 * n) / 3) + 1), e] };
  }
  const [{ data: tasks }, people] = await Promise.all([sb.from('tasks').select('*').eq('project_id', p.id), loadPeople()]);
  const st = { tasks: tasks || [], people, projects: new Map([[p.id, p]]) };
  const save = debounce(() => sb.from('boards').update({ data, updated_at: new Date().toISOString() }).eq('id', tool.id));
  const draw = () => {
    const dated = st.tasks.filter((t) => t.due);
    const all = [...Object.values(data.phases).flat(), ...dated.map((t) => t.due), todayISO()];
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
      <div class="tl">
        <div class="tl-scale">${months.map((m) => `<span style="left:${pct(m)}">${fmtDate(m).split(' ')[1]}</span>`).join('')}</div>
        <div class="tl-row tl-phase-row">${PHASES.map(([k, l, c]) => `<div class="tl-bar ph" style="left:${pct(data.phases[k][0])};width:${w(data.phases[k][0], data.phases[k][1])};--g:${c}" title="${l}">${l}</div>`).join('')}</div>
        ${groups.map((g) => `<div class="tl-group"><div class="tl-gh" style="--g:${esc(g.color)}"><i></i>${esc(g.name)}</div>
          ${g.list.sort((a, b) => a.due.localeCompare(b.due)).map((t) => { const s0 = t.created_at ? t.created_at.slice(0, 10) : addDays(t.due, -3); const s1 = s0 > t.due ? addDays(t.due, -1) : s0; return `<div class="tl-row"><button type="button" class="tl-bar task ${t.status} ${t.status !== 'done' && daysUntil(t.due) < 0 ? 'late' : ''}" data-t="${t.id}" style="left:${pct(s1)};width:${w(s1, t.due)};--g:${esc(g.color)}"><span>${esc(t.title)}</span></button></div>`; }).join('')}
        </div>`).join('') || '<p class="muted small tl-empty">As tarefas com prazo aparecem aqui.</p>'}
        <div class="tl-today" style="left:${pct(todayISO())}"><span>Hoje</span></div>
      </div>`;
    main.querySelectorAll('[data-ph]').forEach((inp) => inp.addEventListener('change', () => { data.phases[inp.dataset.ph][+inp.dataset.i] = inp.value; save(); draw(); }));
    main.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => editTask(st.tasks.find((t) => t.id === b.dataset.t), st, draw)));
  };
  draw();
}
