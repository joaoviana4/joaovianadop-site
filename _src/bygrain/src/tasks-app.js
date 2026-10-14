import './style.css';
import { sb, state, esc, $, loadProfile, toast, ICON, LOGO, dueInfo, daysUntil, fmtDate, initials, registerSW, STATUS, BASE } from './lib.js';
import { renderAuth } from './auth.js';
import { loadPeople, deptOf, editTask } from './tasks.js';

// byGrain Tasks: a app do telemóvel. Só as tarefas de cada pessoa, o projeto e o prazo.
const app = $('#app');
registerSW();

const NEXT = { todo: 'doing', doing: 'done', done: 'todo' };
const SICON = { todo: ICON.circle, doing: ICON.half, done: ICON.done };
const st = { tasks: [], projects: new Map(), people: [], showDone: false, ch: null };

sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') renderAuth(app, { mobile: true, sub: 'tasks', onDone: boot }).show('newpw');
  if (ev === 'SIGNED_OUT') boot();
});

async function boot() {
  await loadProfile();
  if (!state.user || !state.profile) {
    document.body.className = 'mobile is-auth';
    renderAuth(app, { mobile: true, sub: 'tasks', onDone: boot }).show('login');
    return;
  }
  document.body.className = 'mobile';
  shell();
  load();
  if (!st.ch) {
    st.ch = sb.channel('my-tasks').on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => { clearTimeout(st.t); st.t = setTimeout(load, 500); }).subscribe();
  }
}
boot();
document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user) load(); });

function shell() {
  const p = state.profile;
  app.innerHTML = `<div class="m-app">
    <header class="m-head"><div class="grain-layer" aria-hidden="true"></div>
      <div class="m-head-in">
        ${LOGO('tasks')}
        <div class="row">
          <button type="button" class="icon-btn light" data-refresh aria-label="Atualizar">${ICON.refresh}</button>
          <button type="button" class="avatar" data-me style="--c:${esc(p.color)}" aria-label="Conta">${esc(initials(p.display_name))}</button>
        </div>
      </div>
      <div class="m-sum" data-sum>&nbsp;</div>
    </header>
    <main class="m-body" data-body><p class="muted">A carregar…</p></main>
  </div>`;
  app.querySelector('[data-refresh]').addEventListener('click', () => { load(); toast('Atualizado.'); });
  app.querySelector('[data-me]').addEventListener('click', async () => {
    const { modal } = await import('./lib.js');
    const m = modal(`<div class="acct-card"><span class="avatar lg" style="--c:${esc(p.color)}">${esc(initials(p.display_name))}</span><div><strong>${esc(p.display_name)}</strong><div class="muted small">${esc(p.username ? '@' + p.username : p.email)}</div></div></div>
      <div class="menu-list"><a href="${BASE}">${ICON.board} Abrir o Studio</a><button type="button" data-out>${ICON.logout} Sair</button></div>
      <div class="row end"><button class="btn ghost" data-close>Fechar</button></div>`);
    m.el.querySelector('[data-out]').addEventListener('click', async () => { m.close(); await sb.auth.signOut(); });
  });
}

async function load() {
  const [{ data: tasks, error }, { data: projects }, people] = await Promise.all([
    sb.from('tasks').select('*').eq('assignee_id', state.user.id),
    sb.from('projects').select('id, name, departments, is_central'),
    loadPeople(),
  ]);
  if (error) return toast(error.message);
  st.tasks = tasks || []; st.projects = new Map((projects || []).map((p) => [p.id, p])); st.people = people;
  draw();
}

function group(t) {
  if (!t.due) return 'none';
  const n = daysUntil(t.due);
  if (n < 0) return 'late'; if (n === 0) return 'today'; if (n <= 7) return 'week'; return 'later';
}
const GROUPS = [['late', 'Atrasadas'], ['today', 'Hoje'], ['week', 'Próximos 7 dias'], ['later', 'Mais tarde'], ['none', 'Sem prazo']];

function card(t) {
  const p = st.projects.get(t.project_id);
  const dept = deptOf(p, t.department);
  const due = dueInfo(t.due, t.status);
  return `<li class="m-task s-${t.status}" data-task="${t.id}" ${dept ? `style="--dept:${esc(dept.color)}"` : ''}>
    <button type="button" class="t-status" data-act="cycle" aria-label="Estado: ${STATUS[t.status]}. Mudar">${SICON[t.status]}</button>
    <button type="button" class="m-main" data-act="edit">
      <span class="t-title">${esc(t.title)}</span>
      <span class="t-meta"><span class="t-proj">${esc(p?.is_central ? 'Central de Produção' : p?.name || '')}</span>${dept ? `<span class="t-dept"><i></i>${esc(dept.name)}</span>` : ''}</span>
    </button>
    <span class="due due-${t.status === 'done' ? 'none' : due.tone}">${esc(t.status === 'done' ? (t.done_at ? fmtDate(t.done_at) : 'Feita') : due.label)}</span>
  </li>`;
}

function draw() {
  const open = st.tasks.filter((t) => t.status !== 'done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  const done = st.tasks.filter((t) => t.status === 'done').sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  const late = open.filter((t) => group(t) === 'late').length;
  const today = open.filter((t) => group(t) === 'today').length;
  $('[data-sum]').innerHTML = `<strong>${open.length}</strong> ${open.length === 1 ? 'tarefa aberta' : 'tarefas abertas'}${late ? ` · <span class="late-txt">${late} ${late === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}${today ? ` · ${today} para hoje` : ''}`;
  const body = $('[data-body]');
  body.innerHTML = (open.length ? GROUPS.map(([k, label]) => {
    const g = open.filter((t) => group(t) === k);
    return g.length ? `<section class="m-group"><h2>${label} <span>${g.length}</span></h2><ul>${g.map(card).join('')}</ul></section>` : '';
  }).join('') : '<p class="empty-note">Não tens tarefas abertas. Bom trabalho.</p>')
  + (done.length ? `<div class="done-block"><button type="button" class="link-btn" data-toggle aria-expanded="${st.showDone}">${st.showDone ? 'Esconder' : 'Ver'} as tarefas feitas (${done.length})</button>${st.showDone ? `<ul class="m-done">${done.map(card).join('')}</ul>` : ''}</div>` : '');
  body.querySelector('[data-toggle]')?.addEventListener('click', () => { st.showDone = !st.showDone; draw(); });
}

app.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const t = st.tasks.find((x) => x.id === b.closest('[data-task]')?.dataset.task); if (!t) return;
  if (b.dataset.act === 'cycle') {
    const prev = t.status; t.status = NEXT[t.status]; if (t.status === 'done') t.done_at = new Date().toISOString();
    if (navigator.vibrate) navigator.vibrate(12);
    draw();
    const { error } = await sb.from('tasks').update({ status: t.status }).eq('id', t.id);
    if (error) { t.status = prev; draw(); toast(error.message); }
  } else if (b.dataset.act === 'edit') {
    editTask(t, st, () => { st.tasks = st.tasks.filter((x) => x.assignee_id === state.user.id); draw(); });
  }
});
