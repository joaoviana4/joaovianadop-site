import { DB_SCHEMA, sb, esc, state, dueInfo, fmtDate, STATUS, ICON, toast, initials } from './lib.js';
import { loadPeople, deptOf, editTask, addTaskModal } from './tasks.js';

// Central de tarefas, como no Studio, em três partes:
// 1. As minhas tarefas  2. Atribuir tarefas (com filtros)  3. Histórico das tarefas feitas.

const NEXT = { todo: 'doing', doing: 'done', done: 'todo' };
const SICON = { todo: ICON.circle, doing: ICON.half, done: ICON.done };
const ABOUT = { '': 'Geral', scene: 'Cenas', character: 'Personagens', location: 'Décors', shot: 'Planos', prop: 'Adereços' };
const ABOUT_ONE = { scene: 'Cena', character: 'Personagem', location: 'Décor', shot: 'Plano', prop: 'Adereço' };
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

async function entityNames(tasks) {
  const by = {}; tasks.forEach((t) => t.entity_id && t.entity_type && (by[t.entity_type] ||= new Set()).add(t.entity_id));
  const conf = { scene: ['scenes', 'number'], character: ['characters', 'name'], location: ['locations', 'name'], shot: ['shots', 'code'], prop: ['props', 'name'] };
  const out = {};
  await Promise.all(Object.entries(by).map(async ([type, ids]) => {
    const [table, col] = conf[type] || []; if (!table) return;
    const { data } = await sb.from(table).select(`id, ${col}`).in('id', [...ids]);
    (data || []).forEach((r) => (out[r.id] = `${ABOUT_ONE[type]} ${r[col]}`));
  }));
  return out;
}

export function mountTaskCenter(root, { projectId = null, communityId = null, mine = false } = {}) {
  const st = { tasks: [], people: [], projects: new Map(), names: {}, f: { status: 'open', who: 'all', about: 'all', dept: 'all', sort: 'due' }, q: '', histLimit: 60, dead: false };

  async function load() {
    let q = sb.from('tasks').select('*').order('created_at');
    if (projectId) q = q.eq('project_id', projectId);
    if (mine) q = q.eq('assignee_id', state.user.id);
    const pq = sb.from('projects').select('id, name, departments, is_central, kind, status, community_id').is('deleted_at', null).order('name');
    const [{ data: tasks0, error }, people, { data: projects }] = await Promise.all([
      q, loadPeople(), communityId ? pq.eq('community_id', communityId) : pq,
    ]);
    // numa comunidade: só as tarefas dos projetos dela
    const tasks = communityId ? (tasks0 || []).filter((t) => (projects || []).some((p) => p.id === t.project_id)) : tasks0;
    if (st.dead) return;
    if (error) { root.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
    st.tasks = tasks || []; st.people = people; st.projects = new Map((projects || []).map((p) => [p.id, p]));
    st.names = await entityNames(st.tasks);
    draw();
  }

  const proj = (t) => st.projects.get(t.project_id);
  const projName = (p) => (p?.is_central ? 'Central de Produção' : p?.name || '');
  const sortT = (list, by) => {
    const s = [...list];
    if (by === 'name') return s.sort((a, b) => a.title.localeCompare(b.title, 'pt'));
    if (by === 'status') return s.sort((a, b) => ['doing', 'todo'].indexOf(a.status) - ['doing', 'todo'].indexOf(b.status) || (a.due || '9999').localeCompare(b.due || '9999'));
    return s.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999') || a.title.localeCompare(b.title, 'pt'));
  };

  function row(t, { showWho = true } = {}) {
    const p = proj(t); const dept = deptOf(p, t.department); const due = dueInfo(t.due, t.status);
    const who = st.people.find((x) => x.id === t.assignee_id);
    const about = t.entity_id ? st.names[t.entity_id] : '';
    return `<li class="task s-${t.status}" data-task="${t.id}" ${dept ? `style="--dept:${esc(dept.color)}"` : ''}>
      <button type="button" class="t-status" data-act="cycle" aria-label="Estado: ${STATUS[t.status]}. Mudar">${SICON[t.status]}</button>
      <button type="button" class="t-main" data-act="edit"><span class="t-title">${esc(t.title)}</span>
        <span class="t-meta">${!projectId ? `<span class="t-proj">${esc(projName(p))}</span>` : ''}${about ? `<span>${esc(about)}</span>` : ''}${dept ? `<span class="t-dept"><i></i>${esc(dept.name)}</span>` : ''}${t.status === 'doing' ? '<span class="t-doing">Em curso</span>' : ''}${t.status === 'done' && t.done_at ? `<span>Feita a ${fmtDate(t.done_at)}</span>` : ''}</span></button>
      ${showWho ? (who ? `<span class="avatar sm" title="${esc(who.display_name)}" style="--c:${esc(who.color)}">${esc(initials(who.display_name))}</span>` : dept ? `<span class="dept-badge" title="${esc(dept.name)}" style="--dept:${esc(dept.color)}">${esc(dept.name.slice(0, 3))}</span>` : '<span class="avatar sm empty" title="Sem responsável"></span>') : ''}
      ${t.status !== 'done' ? `<span class="due due-${due.tone}">${esc(due.label)}</span>` : `<button type="button" class="link-btn" data-act="reopen">Reabrir</button>`}
    </li>`;
  }

  function filtered() {
    const f = st.f;
    return st.tasks.filter((t) => {
      if (t.status === 'done') return false;
      if (f.status !== 'open' && t.status !== f.status) return false;
      if (f.who === 'me' && t.assignee_id !== state.user.id) return false;
      if (f.who === 'none' && (t.assignee_id || t.department)) return false;
      if (f.who.startsWith('p:') && t.assignee_id !== f.who.slice(2)) return false;
      if (f.who.startsWith('d:') && (t.assignee_id || t.department !== f.who.slice(2))) return false;
      if (f.about !== 'all' && (t.entity_type || '') !== f.about) return false;
      if (f.dept !== 'all' && t.department !== f.dept) return false;
      return true;
    });
  }

  function addForm() {
    const projs = [...st.projects.values()].filter((p) => p.status !== 'archived');
    const p = projectId ? st.projects.get(projectId) : projs[0];
    const depts = p?.departments || [];
    return `<form class="task-add big" data-add>
      <input name="title" placeholder="O que é preciso fazer?" aria-label="Nova tarefa" autocomplete="off" required>
      ${projectId ? '' : `<select name="project_id" aria-label="Projeto" data-proj>${projs.map((x) => `<option value="${x.id}">${esc(projName(x))}</option>`).join('')}</select>`}
      <select name="assignee" aria-label="Responsável"><option value="">Responsável</option><optgroup label="Pessoas">${st.people.map((x) => `<option value="p:${x.id}">${esc(x.display_name)}</option>`).join('')}</optgroup>${depts.length ? `<optgroup label="Departamentos">${depts.map((d) => `<option value="d:${esc(d.id)}">${esc(d.name)}</option>`).join('')}</optgroup>` : ''}</select>
      ${depts.length ? `<select name="department" aria-label="Departamento"><option value="">Departamento</option>${depts.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select>` : ''}
      <input name="due" type="date" aria-label="Prazo">
      <button class="btn primary">${ICON.plus}<span>Atribuir</span></button>
    </form>`;
  }

  function draw() {
    const me = state.user.id;
    const mine = sortT(st.tasks.filter((t) => t.status !== 'done' && t.assignee_id === me), 'due');
    const lateMine = mine.filter((t) => dueInfo(t.due, t.status).tone === 'late').length;
    const list = sortT(filtered(), st.f.sort);
    const p = projectId ? st.projects.get(projectId) : null;
    const allDepts = p ? p.departments || [] : [];
    const aboutTypes = [...new Set(st.tasks.map((t) => t.entity_type || ''))];
    const q = st.q.trim().toLowerCase();
    const done = st.tasks.filter((t) => t.status === 'done' && (!q || t.title.toLowerCase().includes(q) || projName(proj(t)).toLowerCase().includes(q))).sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
    const months = []; done.slice(0, st.histLimit).forEach((t) => { const k = (t.done_at || t.created_at).slice(0, 7); let g = months.find((m) => m.k === k); if (!g) months.push((g = { k, list: [] })); g.list.push(t); });
    const sel = (k, opts) => `<label class="sel"><span class="vh">${k}</span><select data-f="${k}">${opts.map(([v, l]) => `<option value="${esc(v)}" ${st.f[k] === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
    root.innerHTML = `
      <section class="tc-sec">
        <div class="tc-h"><h2 class="h2">As minhas tarefas</h2><span class="muted small">${mine.length} ${mine.length === 1 ? 'aberta' : 'abertas'}${lateMine ? ` · <span class="late-txt2">${lateMine} ${lateMine === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}</span></div>
        <div class="panel">${mine.length ? `<ul class="task-list">${mine.map((t) => row(t, { showWho: false })).join('')}</ul>` : '<p class="empty-note">Não tens tarefas abertas.</p>'}</div>
      </section>
      <section class="tc-sec">
        <div class="tc-h"><h2 class="h2">Atribuir tarefas</h2><button type="button" class="btn primary sm" data-newtask>${ICON.plus} Adicionar tarefa</button></div>
        <div class="panel stack">
          <div class="tasks-bar">
            ${sel('status', [['open', 'Abertas'], ['todo', 'Por fazer'], ['doing', 'Em curso']])}
            ${sel('who', [['all', 'Todos os responsáveis'], ['me', 'As minhas'], ['none', 'Sem responsável'], ...st.people.map((x) => ['p:' + x.id, x.display_name]), ...allDepts.map((d) => ['d:' + d.id, `Departamento: ${d.name}`])])}
            ${aboutTypes.length > 1 || aboutTypes[0] ? sel('about', [['all', 'Diz respeito a: tudo'], ...aboutTypes.map((k) => [k, ABOUT[k] || k])]) : ''}
            ${allDepts.length ? sel('dept', [['all', 'Todos os departamentos'], ...allDepts.map((d) => [d.id, d.name])]) : ''}
            ${sel('sort', [['due', 'Por urgência'], ['name', 'Por nome'], ['status', 'Por estado']])}
          </div>
          ${list.length ? `<ul class="task-list">${list.map((t) => row(t)).join('')}</ul>` : `<p class="empty-note">${st.tasks.some((t) => t.status !== 'done') ? 'Nada com estes filtros.' : 'Ainda não há tarefas abertas.'}</p>`}
        </div>
      </section>
      <section class="tc-sec">
        <div class="tc-h"><h2 class="h2">Histórico</h2><span class="muted small">${(() => { const n = st.tasks.filter((t) => t.status === 'done').length; return `${n} ${n === 1 ? 'tarefa feita' : 'tarefas feitas'}`; })()}</span></div>
        <div class="panel stack">
          <input type="search" data-q value="${esc(st.q)}" placeholder="Procurar no histórico…" aria-label="Procurar no histórico">
          ${months.length ? months.map((m) => `<div class="hist-m"><h3 class="hist-h">${MESES[+m.k.slice(5, 7) - 1]} ${m.k.slice(0, 4)} <span>${m.list.length}</span></h3><ul class="task-list done">${m.list.map((t) => row(t)).join('')}</ul></div>`).join('') : `<p class="empty-note">${q ? 'Nada encontrado.' : 'As tarefas feitas ficam aqui guardadas, com a data em que foram feitas.'}</p>`}
          ${done.length > st.histLimit ? `<button type="button" class="link-btn" data-more>Ver mais (${done.length - st.histLimit})</button>` : ''}
        </div>
      </section>`;
    root.querySelectorAll('[data-f]').forEach((s) => s.addEventListener('change', () => { st.f[s.dataset.f] = s.value; draw(); }));
    const qi = root.querySelector('[data-q]');
    qi.addEventListener('input', () => { st.q = qi.value; const pos = qi.selectionStart; draw(); const n = root.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); });
    root.querySelector('[data-more]')?.addEventListener('click', () => { st.histLimit += 100; draw(); });
    root.querySelector('[data-newtask]')?.addEventListener('click', () => {
      const projs = [...st.projects.values()].filter((x) => x.status !== 'archived' && !x.deleted_at);
      const pr = projectId ? st.projects.get(projectId) : null;
      addTaskModal({ projectId: projectId || null, departments: pr?.departments || [], projects: projectId ? null : projs.map((x) => ({ id: x.id, name: projName(x), departments: x.departments || [] })) });
    });  }

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const t = st.tasks.find((x) => x.id === b.closest('[data-task]')?.dataset.task); if (!t) return;
    if (b.dataset.act === 'edit') return editTask(t, st, draw);
    const prev = t.status;
    t.status = b.dataset.act === 'reopen' ? 'todo' : NEXT[t.status];
    t.done_at = t.status === 'done' ? new Date().toISOString() : null;
    draw();
    const { error } = await sb.from('tasks').update({ status: t.status }).eq('id', t.id);
    if (error) { t.status = prev; draw(); return toast(error.message); }
    if (t.status === 'done') toast('Feita. Fica guardada no Histórico.');
  });

  const ch = sb.channel('tc-' + (projectId || 'all') + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'tasks', ...(projectId ? { filter: `project_id=eq.${projectId}` } : {}) }, () => { clearTimeout(ch._t); ch._t = setTimeout(load, 500); })
    .subscribe();
  const onAdded = (e) => { if (st.dead) return; const t = e.detail; if (t && (!projectId || t.project_id === projectId) && st.projects.has(t.project_id) && !st.tasks.some((x) => x.id === t.id)) { st.tasks.push(t); draw(); } };
  window.addEventListener('portal-task-added', onAdded);
  root.innerHTML = '<p class="muted">A carregar…</p>';
  load();
  return { destroy() { st.dead = true; sb.removeChannel(ch); window.removeEventListener('portal-task-added', onAdded); } };
}
