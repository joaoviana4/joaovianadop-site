import { sb, esc, state, dueInfo, fmtDate, STATUS, ICON, modal, confirmBox, toast, initials, todayISO } from './lib.js';

// Lista de tarefas reutilizada no projeto, na Central, na página "Tarefas" e no telemóvel.
// scope: { projectId } para um projeto, ou { mine: true } para as tarefas da pessoa em todos os projetos.

const NEXT = { todo: 'doing', doing: 'done', done: 'todo' };
const SICON = { todo: ICON.circle, doing: ICON.half, done: ICON.done };

// a lista de pessoas muda pouco: guarda-se 2 minutos (e pedidos em simultâneo partilham o mesmo pedido)
let peopleCache = null;
export async function loadPeople(fresh = false) {
  if (!fresh && peopleCache && Date.now() - peopleCache.t < 120000) return (await peopleCache.p).map((x) => ({ ...x }));
  const p = sb.from('profiles').select('id, display_name, username, role, color').order('display_name').then(({ data }) => data || []);
  peopleCache = { t: Date.now(), p };
  p.catch(() => { peopleCache = null; });
  return (await p).map((x) => ({ ...x }));
}
export const clearPeopleCache = () => { peopleCache = null; };

export function deptOf(project, id) {
  return (project?.departments || []).find((d) => d.id === id) || null;
}

function sortTasks(list, by) {
  const s = [...list];
  if (by === 'name') s.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
  else if (by === 'status') s.sort((a, b) => ['doing', 'todo', 'done'].indexOf(a.status) - ['doing', 'todo', 'done'].indexOf(b.status) || (a.due || '9999').localeCompare(b.due || '9999'));
  else s.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title, 'pt'));
  return s;
}

export function taskRow(t, { project, people, showProject }) {
  const due = dueInfo(t.due, t.status);
  const dept = deptOf(project, t.department);
  const who = people.find((p) => p.id === t.assignee_id);
  return `<li class="task s-${t.status}" data-task="${t.id}" ${dept ? `style="--dept:${esc(dept.color)}"` : ''}>
    <button type="button" class="t-status" data-act="cycle" aria-label="Estado: ${STATUS[t.status]}. Mudar">${SICON[t.status]}</button>
    <button type="button" class="t-main" data-act="edit">
      <span class="t-title">${esc(t.title)}</span>
      <span class="t-meta">
        ${showProject && project ? `<span class="t-proj">${esc(project.name)}</span>` : ''}
        ${dept ? `<span class="t-dept"><i></i>${esc(dept.name)}</span>` : ''}
        ${t.status === 'done' && t.done_at ? `<span class="muted">Feita a ${fmtDate(t.done_at)}</span>` : ''}
      </span>
    </button>
    ${who ? `<span class="avatar sm" title="${esc(who.display_name)}" style="--c:${esc(who.color)}">${esc(initials(who.display_name))}</span>` : (dept ? '' : '<span class="avatar sm empty" title="Sem responsável"></span>')}
    ${t.status !== 'done' ? `<span class="due due-${due.tone}">${esc(due.label)}</span>` : ''}
  </li>`;
}

export function mountTasks(root, { projectId = null, mine = false, compact = false, entity = null } = {}) {
  const st = { tasks: [], projects: new Map(), people: [], status: 'open', who: mine ? 'me' : 'all', dept: 'all', sort: 'due', showDone: false, dead: false };

  async function load() {
    let q = sb.from('tasks').select('*').order('created_at');
    if (projectId) q = q.eq('project_id', projectId);
    if (mine) q = q.eq('assignee_id', state.user.id);
    if (entity) q = q.eq('entity_id', entity.id);
    const [{ data: tasks, error }, people, { data: projects }] = await Promise.all([
      q, loadPeople(),
      projectId ? sb.from('projects').select('id, name, departments, is_central').eq('id', projectId) : sb.from('projects').select('id, name, departments, is_central, status').is('deleted_at', null),
    ]);
    if (st.dead) return;
    if (error) { root.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
    st.tasks = tasks; st.people = people; st.projects = new Map((projects || []).map((p) => [p.id, p]));
    draw();
  }

  function filtered() {
    return st.tasks.filter((t) => {
      if (st.status === 'open' && t.status === 'done') return false;
      if (st.status === 'todo' && t.status !== 'todo') return false;
      if (st.status === 'doing' && t.status !== 'doing') return false;
      if (st.who === 'me' && t.assignee_id !== state.user.id) return false;
      if (st.who === 'none' && t.assignee_id) return false;
      if (!['all', 'me', 'none'].includes(st.who) && t.assignee_id !== st.who) return false;
      if (st.dept !== 'all' && t.department !== st.dept) return false;
      return true;
    });
  }

  function draw() {
    const project = projectId ? st.projects.get(projectId) : null;
    const depts = project ? project.departments || [] : [];
    const open = sortTasks(filtered(), st.sort);
    const done = st.tasks.filter((t) => t.status === 'done' && (st.who !== 'me' || t.assignee_id === state.user.id)).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
    const row = (t) => taskRow(t, { project: st.projects.get(t.project_id), people: st.people, showProject: !projectId });
    root.innerHTML = `
      <div class="tasks-bar">
        <label class="sel"><span class="vh">Estado</span><select data-f="status">
          <option value="open">Abertas</option><option value="todo">Por fazer</option><option value="doing">Em curso</option></select></label>
        ${!mine ? `<label class="sel"><span class="vh">Responsável</span><select data-f="who">
          <option value="all">Todos</option><option value="me">As minhas</option><option value="none">Sem responsável</option>
          ${st.people.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select></label>` : ''}
        ${depts.length && !entity ? `<label class="sel"><span class="vh">Departamento</span><select data-f="dept"><option value="all">Todos os departamentos</option>${depts.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select></label>` : ''}
        <label class="sel"><span class="vh">Ordenar</span><select data-f="sort"><option value="due">Por urgência</option><option value="name">Por nome</option><option value="status">Por estado</option></select></label>
      </div>
      ${projectId ? `<form class="task-add" data-add>
        <input name="title" placeholder="Nova tarefa…" aria-label="Nova tarefa" autocomplete="off">
        <select name="assignee" aria-label="Responsável"><option value="">Responsável</option>${st.people.map((p) => `<option value="${p.id}">${esc(p.display_name)}</option>`).join('')}</select>
        ${depts.length ? `<select name="department" aria-label="Departamento"><option value="">Departamento</option>${depts.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select>` : ''}
        <input name="due" type="date" aria-label="Prazo">
        <button class="btn primary" aria-label="Juntar tarefa">${ICON.plus}<span>Juntar</span></button>
      </form>` : ''}
      ${open.length ? `<ul class="task-list">${open.map(row).join('')}</ul>` : `<p class="empty-note">${st.tasks.length ? 'Nada por fazer com estes filtros.' : 'Ainda não há tarefas.'}</p>`}
      ${done.length && st.status === 'open' ? `<div class="done-block">
        <button type="button" class="link-btn" data-act="toggle-done" aria-expanded="${st.showDone}">${st.showDone ? 'Esconder' : 'Ver'} as tarefas feitas (${done.length})</button>
        ${st.showDone ? `<ul class="task-list done">${done.map(row).join('')}</ul>` : ''}
      </div>` : ''}`;
    root.querySelectorAll('[data-f]').forEach((s) => { s.value = st[s.dataset.f]; s.addEventListener('change', () => { st[s.dataset.f] = s.value; draw(); }); });
    const add = root.querySelector('[data-add]');
    add && add.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(add));
      if (!f.title.trim()) return;
      const row = { project_id: projectId, title: f.title.trim(), assignee_id: f.assignee || null, department: f.department || null, due: f.due || null, ...(entity ? { entity_type: entity.type, entity_id: entity.id } : {}) };
      const { data, error } = await sb.from('tasks').insert(row).select().single();
      if (error) return toast(error.message);
      st.tasks.push(data); draw();
      root.querySelector('[data-add] input[name=title]')?.focus();
    });
  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'toggle-done') { st.showDone = !st.showDone; draw(); return; }
    const li = b.closest('[data-task]'); const t = st.tasks.find((x) => x.id === li?.dataset.task); if (!t) return;
    if (b.dataset.act === 'cycle') {
      const prev = t.status; t.status = NEXT[t.status];
      if (t.status === 'done') t.done_at = new Date().toISOString();
      draw();
      const { error } = await sb.from('tasks').update({ status: t.status }).eq('id', t.id);
      if (error) { t.status = prev; draw(); toast(error.message); }
      else if (t.status === 'done') toast('Feita. Está em "Ver as tarefas feitas".');
    }
    if (b.dataset.act === 'edit') editTask(t, st, draw);
  });

  if (entity) root.classList.add('tasks-compact');
  const ch = sb.channel('tasks-' + (projectId || 'mine') + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}) }, () => { clearTimeout(ch._t); ch._t = setTimeout(load, 400); })
    .subscribe();

  root.innerHTML = '<p class="muted">A carregar…</p>';
  load();
  return { reload: load, destroy() { st.dead = true; sb.removeChannel(ch); } };
}

export function editTask(t, st, after) {
  const project = st.projects.get(t.project_id);
  const depts = project?.departments || [];
  const m = modal(`
    <h2>Tarefa</h2>
    <form class="stack">
      <div class="field"><label for="tt">Tarefa</label><input id="tt" name="title" value="${esc(t.title)}" required></div>
      <div class="grid2">
        <div class="field"><label for="ts">Estado</label><select id="ts" name="status">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${t.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
        <div class="field"><label for="td">Prazo</label><input id="td" name="due" type="date" value="${esc(t.due || '')}"></div>
        <div class="field"><label for="ta">Responsável</label><select id="ta" name="assignee_id"><option value="">Ninguém</option>${st.people.map((p) => `<option value="${p.id}" ${t.assignee_id === p.id ? 'selected' : ''}>${esc(p.display_name)}</option>`).join('')}</select></div>
        <div class="field"><label for="tdep">Departamento</label><select id="tdep" name="department"><option value="">Nenhum</option>${depts.map((d) => `<option value="${esc(d.id)}" ${t.department === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      </div>
      <div class="field"><label for="tn">Notas</label><textarea id="tn" name="notes" rows="4">${esc(t.notes || '')}</textarea></div>
      ${project ? `<p class="muted small">Projeto: ${esc(project.name)}${t.created_at ? ` · criada a ${fmtDate(t.created_at)}` : ''}</p>` : ''}
      <div class="row between">
        <button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>
        <div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div>
      </div>
    </form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const patch = { title: f.title.trim(), status: f.status, due: f.due || null, assignee_id: f.assignee_id || null, department: f.department || null, notes: f.notes };
    const { data, error } = await sb.from('tasks').update(patch).eq('id', t.id).select().single();
    if (error) return toast(error.message);
    Object.assign(t, data); m.close(); after();
  });
  m.el.querySelector('[data-del]').addEventListener('click', async () => {
    m.close();
    if (!(await confirmBox(`Apagar a tarefa "${t.title}"?`, 'Apagar'))) return;
    const { error } = await sb.from('tasks').delete().eq('id', t.id);
    if (error) return toast(error.message);
    st.tasks.splice(st.tasks.indexOf(t), 1); after();
  });
}

export { todayISO };
