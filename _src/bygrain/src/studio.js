import './style.css';
import { daysUntil } from './lib.js';
import { sb, state, esc, $, loadProfile, isStaff, isAdmin, toast, modal, confirmBox, ICON, LOGO, KINDS, ROLES, phaseOf, greeting, initials, signedUrls, uploadImage, callFn, authPw, MIN_PW, fmtDate, dueInfo, registerSW, BASE, PROJECT_COLS, hasPerm } from './lib.js';
import { renderAuth } from './auth.js';
import { mountBoard } from './board.js';
import { mountTasks, loadPeople } from './tasks.js';
import { financePage } from './finance.js';
import { TOOL_KINDS, tableTool, timelineTool, tableTemplate } from './tools.js';
import { lightmapTool, newLightmapData } from './lightmap.js';
import { propsPage } from './props.js';
import { budgetPage } from './budget.js';
import { mountTaskCenter } from './taskcenter.js';
import { clipPage, CLIP_PAGES } from './music.js';
import { mountSituation } from './overview.js';
import { budgetWhoChip, budgetAccessPanel, globalPermsPanel } from './perms.js';
import { FICTION_PAGES, FICTION_DEPTS, fictionPage, fictionStats } from './fiction.js';

const app = $('#app');
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);
function teardown() { cleanup.forEach((f) => { try { f(); } catch { /* nada */ } }); cleanup = []; }

registerSW();

// ---------- arranque ----------
let recovering = false;
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { recovering = true; teardown(); renderAuth(app, { onDone: () => { recovering = false; boot(); } }).show('newpw'); }
  if (ev === 'SIGNED_OUT') { teardown(); boot(); }
});

async function boot() {
  if (recovering) return;
  await loadProfile();
  if (!state.user || !state.profile) {
    teardown();
    document.body.className = 'is-auth';
    renderAuth(app, { onDone: boot }).show('login');
    return;
  }
  document.body.className = '';
  route();
}
window.addEventListener('hashchange', () => state.user && route());
boot();

function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  teardown();
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) return parts[2] === 'b' ? boardView(parts[1], parts[3]) : parts[2] === 'f' ? toolPage(parts[1], parts[3]) : projectPage(parts[1], parts[2] || 'geral', parts[3]);
  if (parts[0] === 'central') {
    if (!isStaff()) return go('#/');
    const { data } = await sb.from('projects').select('id').eq('is_central', true).limit(1).maybeSingle();
    if (!data) return toast('A Central de Produção ainda não existe.');
    return parts[1] === 'b' ? boardView(data.id, parts[2]) : parts[1] === 'f' ? toolPage(data.id, parts[2]) : projectPage(data.id, parts[1] || 'geral', parts[2]);
  }
  if (parts[0] === 'tarefas') return tasksPage();
  if (parts[0] === 'equipa') return isAdmin() ? teamPage() : go('#/');
  return homePage();
}

// ---------- cabeçalho ----------
function header(active) {
  const p = state.profile;
  const link = (href, label, key) => `<a href="${href}" class="nav-a" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
  return `<header class="topbar">
    <div class="topbar-l">
      <a href="#/" class="brand" aria-label="byGrain Studio, início">${LOGO('studio')}</a>
      <nav aria-label="Principal" class="nav">
        ${link('#/', 'Início', 'home')}
        ${isStaff() ? link('#/central', 'Central de Produção', 'central') + link('#/tarefas', 'Tarefas', 'tasks') : ''}
        ${isAdmin() ? link('#/equipa', 'Equipa e permissões', 'team') : ''}
      </nav>
    </div>
    <button type="button" class="acct" data-acct aria-label="Conta e definições">
      <span class="acct-role">${esc(ROLES[p.role])}</span>
      <span class="avatar" style="--c:${esc(p.color)}">${esc(initials(p.display_name))}</span>
    </button>
  </header>`;
}
function bindHeader(root) {
  root.querySelector('[data-acct]')?.addEventListener('click', accountMenu);
}
function accountMenu() {
  const p = state.profile;
  const m = modal(`
    <div class="acct-card"><span class="avatar lg" style="--c:${esc(p.color)}">${esc(initials(p.display_name))}</span>
      <div><strong>${esc(p.display_name)}</strong><div class="muted">${esc(p.username ? '@' + p.username : p.email)} · ${esc(ROLES[p.role])}</div></div></div>
    <div class="menu-list">
      <button type="button" data-a="name">${ICON.team} Mudar o meu nome</button>
      <button type="button" data-a="pw">${ICON.info} Mudar palavra-passe</button>
      <a href="${BASE}tasks/" target="_blank" rel="noopener">${ICON.task} Abrir a app de tarefas (telemóvel)</a>
      <button type="button" data-a="out">${ICON.logout} Sair</button>
    </div>
    <div class="row end"><button class="btn ghost" data-close>Fechar</button></div>`);
  m.el.querySelector('[data-a=out]').addEventListener('click', async () => { m.close(); await sb.auth.signOut(); });
  m.el.querySelector('[data-a=pw]').addEventListener('click', () => { m.close(); changePassword(); });
  m.el.querySelector('[data-a=name]').addEventListener('click', () => {
    m.close();
    const n = modal(`<h2>O teu nome</h2><form class="stack"><div class="field"><label for="dn">Nome</label><input id="dn" value="${esc(p.display_name)}" required></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    n.el.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); const v = n.el.querySelector('#dn').value.trim(); if (!v) return; await sb.from('profiles').update({ display_name: v }).eq('id', p.id); p.display_name = v; n.close(); route(); });
  });
}
function changePassword() {
  const m = modal(`<h2>Mudar palavra-passe</h2><form class="stack"><div class="field"><label for="np">Nova palavra-passe</label><input id="np" type="password" autocomplete="new-password" required></div><p class="muted small">Pelo menos ${MIN_PW} caracteres.</p><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault(); const v = m.el.querySelector('#np').value;
    if (v.length < MIN_PW) return toast(`Pelo menos ${MIN_PW} caracteres.`);
    const { error } = await sb.auth.updateUser({ password: authPw(v) });
    if (error) return toast(error.message);
    m.close(); toast('Palavra-passe mudada.');
  });
}

// ---------- página inicial ----------
const homeState = { tab: 'active', q: '', mine: false, sort: 'recent' };
async function homePage() {
  const staff = isStaff();
  app.innerHTML = `<div class="page">${header('home')}
    <section class="hero"><div class="grain-layer" aria-hidden="true"></div>
      <div class="wrap hero-in">
        <div><h1 class="hero-h">${greeting()}, ${esc(state.profile.display_name.split(' ')[0])}.</h1><p class="hero-p" data-hero>&nbsp;</p></div>
        ${staff ? `<button type="button" class="btn cream" data-new>${ICON.plus} Novo projeto</button>` : ''}
      </div>
    </section>
    <div class="wrap home-grid">
      <section aria-labelledby="h-proj" class="home-main">
        <div class="row between wrap-gap">
          <h2 id="h-proj" class="h2">${staff ? 'Projetos' : 'Os teus projetos'}</h2>
          <div class="seg dark" role="tablist" aria-label="Estado dos projetos">
            ${[['active', 'Em curso'], ['done', 'Finalizados'], ['archived', 'Arquivo']].map(([k, v]) => `<button type="button" role="tab" aria-selected="${homeState.tab === k}" data-tab="${k}">${v}</button>`).join('')}
          </div>
        </div>
        <div class="proj-tools">
          <label class="search"><span class="vh">Procurar projetos</span>${ICON.search}<input type="search" data-q placeholder="Procurar por projeto ou artista…" value="${esc(homeState.q)}" autocomplete="off"></label>
          ${staff ? `<div class="seg" role="tablist" aria-label="Que projetos mostrar">${[[false, 'Todos'], [true, 'Atribuídos a mim']].map(([k, v]) => `<button type="button" role="tab" aria-selected="${homeState.mine === k}" data-mine-f="${k}">${v}</button>`).join('')}</div>` : ''}
          <label class="sel"><span class="vh">Ordenar</span><select data-sort>${[['recent', 'Mais recentes'], ['az', 'Ordem alfabética'], ['due', 'Entrega mais próxima']].map(([k, v]) => `<option value="${k}" ${homeState.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
        <div class="proj-grid" data-grid><p class="muted">A carregar…</p></div>
      </section>
      ${staff ? `<aside class="home-side">
        <section class="panel">
          <div class="row between"><h2 class="h3">Central de Produção</h2><span class="tag internal">${ICON.lock}Internal</span></div>
          <div class="menu-list" data-central>
            <a href="#/central">${ICON.board}<span><strong>Abrir a Central</strong><small>Contas, planeamento e calendário da Grain</small></span>${ICON.chev}</a>
            <a href="#/central">${ICON.task}<span><strong>Tarefas internas</strong><small>O que não pertence a um projeto</small></span>${ICON.chev}</a>
          </div>
        </section>
        <section class="panel">
          <div class="row between"><h2 class="h3">As minhas tarefas</h2><a href="#/tarefas" class="small">Ver todas</a></div>
          <ul class="mini-tasks" data-mine><li class="muted">A carregar…</li></ul>
          <a class="small muted" href="${BASE}tasks/" target="_blank" rel="noopener">Abrir no telemóvel</a>
        </section>
      </aside>` : `<aside class="home-side"><section class="panel"><h2 class="h3">Acesso de convidado</h2><p class="muted">Vês apenas os projetos para os quais foste convidado. Para entrar noutro projeto, pede um código a quem o gere.</p></section></aside>`}
    </div></div>`;
  bindHeader(app);
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { homeState.tab = b.dataset.tab; homePage(); }));
  app.querySelector('[data-new]')?.addEventListener('click', newProject);

  const [{ data: projects }, { data: tasks }, { data: myMem }] = await Promise.all([
    sb.from('projects').select(PROJECT_COLS).eq('is_central', false).order('updated_at', { ascending: false }),
    sb.from('tasks').select('id, project_id, title, status, due, assignee_id'),
    sb.from('project_members').select('project_id').eq('user_id', state.user.id),
  ]);
  // "atribuídos a mim": sou membro do projeto ou tenho tarefas lá
  const mineSet = new Set([...(myMem || []).map((m) => m.project_id), ...(tasks || []).filter((t) => t.assignee_id === state.user.id).map((t) => t.project_id)]);
  const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const sorters = { recent: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''), az: (a, b) => a.name.localeCompare(b.name, 'pt'), due: (a, b) => (a.ends_on || '9999').localeCompare(b.ends_on || '9999') || a.name.localeCompare(b.name, 'pt') };
  const pick = () => (projects || []).filter((p) => p.status === homeState.tab && (!homeState.mine || mineSet.has(p.id)) && (!homeState.q || norm(`${p.name} ${p.client}`).includes(norm(homeState.q)))).sort(sorters[homeState.sort]);
  let list = pick();
  const open = (pid) => (tasks || []).filter((t) => t.project_id === pid && t.status !== 'done').length;
  const covers = await signedUrls((projects || []).map((p) => p.cover_path));
  const mineOpen = (tasks || []).filter((t) => t.assignee_id === state.user.id && t.status !== 'done');
  const hero = app.querySelector('[data-hero]');
  if (hero) hero.textContent = staff ? `Tens ${mineOpen.length} ${mineOpen.length === 1 ? 'tarefa aberta' : 'tarefas abertas'} em ${new Set(mineOpen.map((t) => t.project_id)).size} projetos.` : `Tens acesso a ${(projects || []).length} ${projects?.length === 1 ? 'projeto' : 'projetos'}.`;

  const grid = app.querySelector('[data-grid]');
  const drawGrid = () => { list = pick(); grid.innerHTML = list.length ? list.map((p) => {
    const ph = phaseOf(p); const n = open(p.id);
    return `<article class="proj-card">
      <a href="#/p/${p.id}" class="proj-link" aria-label="Abrir ${esc(p.name)}"></a>
      <div class="proj-cover" style="${covers[p.cover_path] ? `background-image:url('${esc(covers[p.cover_path])}')` : `background:${coverColor(p.id)}`}">
        <div class="grain-layer soft" aria-hidden="true"></div>
        <span class="tag dark">${esc(KINDS[p.kind] || p.kind)}</span>
        ${staff ? `<button type="button" class="icon-btn on-cover" data-more="${p.id}" aria-label="Opções de ${esc(p.name)}">${ICON.dots}</button>` : ''}
      </div>
      <div class="proj-body">
        <div><div class="proj-name">${esc(p.name)}</div><div class="muted small">${esc(p.client || '—')}</div></div>
        <div class="proj-prog"><div class="row between small muted"><span>${esc(ph.label || 'Sem datas')}</span><span>${n} ${n === 1 ? 'tarefa aberta' : 'tarefas abertas'}</span></div>
        <div class="bar"><i style="width:${Math.round(ph.pct * 100)}%"></i></div></div>
      </div>
    </article>`;
  }).join('') : `<p class="empty-note">${homeState.q ? `Nenhum projeto com "${esc(homeState.q)}".` : homeState.mine ? 'Não estás atribuído a nenhum projeto aqui.' : homeState.tab === 'active' ? (staff ? 'Ainda não há projetos em curso. Cria o primeiro em "Novo projeto".' : 'Ainda não foste convidado para nenhum projeto em curso.') : 'Nada aqui.'}</p>`;
  grid.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const p = list.find((x) => x.id === b.dataset.more); projectDetailsModal(p, homePage); })); };
  drawGrid();
  app.querySelector('[data-q]').addEventListener('input', (e) => { homeState.q = e.target.value; drawGrid(); });
  app.querySelector('[data-sort]').addEventListener('change', (e) => { homeState.sort = e.target.value; drawGrid(); });
  app.querySelectorAll('[data-mine-f]').forEach((b) => b.addEventListener('click', () => { homeState.mine = b.dataset.mineF === 'true'; app.querySelectorAll('[data-mine-f]').forEach((x) => x.setAttribute('aria-selected', x === b)); drawGrid(); }));

  const mineEl = app.querySelector('[data-mine]');
  if (mineEl) {
    const pmap = new Map((projects || []).map((p) => [p.id, p.name]));
    const top = mineOpen.sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 6);
    mineEl.innerHTML = top.length ? top.map((t) => { const d = dueInfo(t.due, t.status); return `<li><a href="#/p/${t.project_id}"><span><strong>${esc(t.title)}</strong><small>${esc(pmap.get(t.project_id) || 'Central de Produção')}</small></span><span class="due due-${d.tone}">${esc(d.label)}</span></a></li>`; }).join('') : '<li class="muted">Sem tarefas abertas.</li>';
  }
}

function coverColor(id) {
  const c = ['#232A7A', '#3A2420', '#1D3A33', '#2E2E38', '#3B2F12', '#2A1F3D', '#14324A'];
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}

function newProject() {
  const m = modal(`<h2>Novo projeto</h2>
    <form class="stack">
      <div class="field"><label for="pn">Nome</label><input id="pn" name="name" required></div>
      <div class="field"><label for="pc">Artista ou marca</label><input id="pc" name="client"></div>
      <div class="field"><label for="pk">Tipo</label><select id="pk" name="kind">${Object.entries(KINDS).filter(([k]) => k !== 'central').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="grid2"><div class="field"><label for="ps">Começa</label><input id="ps" name="starts_on" type="date"></div><div class="field"><label for="pe">Entrega</label><input id="pe" name="ends_on" type="date"></div></div>
      ${hasPerm('budget') ? `<div class="field"><label for="pv">Orçamento (€, opcional)</label><input id="pv" name="value" type="number" step="0.01" min="0" inputmode="decimal"><span class="muted small">${ICON.lock} Só quem tem acesso ao orçamento vê este valor.</span></div>` : ''}
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div>
    </form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { data, error } = await sb.from('projects').insert({ name: f.name.trim(), client: f.client.trim(), kind: f.kind, starts_on: f.starts_on || null, ends_on: f.ends_on || null, ...(f.kind === 'ficcao' ? { departments: FICTION_DEPTS } : {}) }).select(PROJECT_COLS).single();
    if (error) return toast(error.message);
    await sb.from('project_members').insert({ project_id: data.id, user_id: state.user.id });
    if (f.value) await sb.from('project_budgets').upsert({ project_id: data.id, value: Number(f.value) });
    m.close(); go(`#/p/${data.id}`);
  });
}

// ---------- detalhes do projeto ----------
function detailsForm(p) {
  return `<form class="stack" data-details>
    <div class="field"><label for="dn">Nome</label><input id="dn" name="name" value="${esc(p.name)}" required ${p.is_central ? 'readonly' : ''}></div>
    ${p.is_central ? '' : `<div class="field"><label for="dc">Artista ou marca</label><input id="dc" name="client" value="${esc(p.client)}"></div>
    <div class="grid2">
      <div class="field"><label for="dk">Tipo</label><select id="dk" name="kind">${Object.entries(KINDS).filter(([k]) => k !== 'central').map(([k, v]) => `<option value="${k}" ${p.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="dst">Estado</label><select id="dst" name="status"><option value="active" ${p.status === 'active' ? 'selected' : ''}>Em curso</option><option value="done" ${p.status === 'done' ? 'selected' : ''}>Finalizado</option><option value="archived" ${p.status === 'archived' ? 'selected' : ''}>Arquivo</option></select></div>
      <div class="field"><label for="ds">Começa</label><input id="ds" name="starts_on" type="date" value="${esc(p.starts_on || '')}"></div>
      <div class="field"><label for="de">Entrega</label><input id="de" name="ends_on" type="date" value="${esc(p.ends_on || '')}"></div>
      ${p.canBudget ? `<div class="field"><label for="dv">Orçamento (€) <span class="muted small">${ICON.lock} privado</span></label><input id="dv" name="value" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.value ?? '')}"></div>` : ''}
    </div>
    <div class="field"><span class="label">Capa</span><div class="row"><button type="button" class="btn ghost" data-cover>${ICON.image} Escolher imagem</button>${p.cover_path ? '<button type="button" class="btn ghost" data-nocover>Tirar capa</button>' : ''}</div></div>`}
    <fieldset class="depts"><legend>Departamentos e cores</legend>
      ${(p.departments || []).map((d, i) => `<div class="dept-row"><input type="color" value="${esc(d.color)}" data-dcolor="${i}" aria-label="Cor de ${esc(d.name)}"><input value="${esc(d.name)}" data-dname="${i}" aria-label="Nome do departamento"><button type="button" class="icon-btn" data-drm="${i}" aria-label="Tirar ${esc(d.name)}">${ICON.close}</button></div>`).join('')}
      <button type="button" class="link-btn" data-dadd>${ICON.plus} Departamento</button>
    </fieldset>
    <div class="row between">
      ${isAdmin() && !p.is_central ? `<button type="button" class="btn ghost danger-text" data-delp>${ICON.trash} Apagar projeto</button>` : '<span></span>'}
      <button class="btn primary">Guardar</button>
    </div>
  </form>`;
}
function bindDetails(root, p, after) {
  const form = root.querySelector('[data-details]');
  const depts = JSON.parse(JSON.stringify(p.departments || []));
  const redraw = () => { root.innerHTML = detailsForm({ ...p, departments: depts }); bindDetails(root, { ...p, departments: depts }, after); };
  form.querySelectorAll('[data-dcolor]').forEach((i) => i.addEventListener('input', () => (depts[+i.dataset.dcolor].color = i.value)));
  form.querySelectorAll('[data-dname]').forEach((i) => i.addEventListener('input', () => (depts[+i.dataset.dname].name = i.value)));
  form.querySelectorAll('[data-drm]').forEach((b) => b.addEventListener('click', () => { depts.splice(+b.dataset.drm, 1); p.departments = depts; redraw(); }));
  form.querySelector('[data-dadd]').addEventListener('click', () => { depts.push({ id: 'd' + Date.now().toString(36), name: 'Novo', color: '#8A8A99' }); p.departments = depts; redraw(); });
  form.querySelector('[data-cover]')?.addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => { try { toast('A enviar a capa…'); const up = await uploadImage(p.id, 'cover', inp.files[0]); await sb.from('projects').update({ cover_path: up.path }).eq('id', p.id); p.cover_path = up.path; toast('Capa mudada.'); after && after(); } catch (e) { toast(e.message); } };
    inp.click();
  });
  form.querySelector('[data-nocover]')?.addEventListener('click', async () => { await sb.from('projects').update({ cover_path: null }).eq('id', p.id); p.cover_path = null; toast('Capa tirada.'); after && after(); });
  form.querySelector('[data-delp]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar "${p.name}" com o board, as tarefas e os ficheiros? Não dá para desfazer.`, 'Apagar'))) return;
    const { error } = await sb.from('projects').delete().eq('id', p.id);
    if (error) return toast(error.message);
    toast('Projeto apagado.'); go('#/');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const patch = { departments: depts.filter((d) => d.name.trim()), updated_at: new Date().toISOString() };
    if (!p.is_central) Object.assign(patch, { name: f.name.trim(), client: f.client.trim(), kind: f.kind, status: f.status, starts_on: f.starts_on || null, ends_on: f.ends_on || null });
    const { data, error } = await sb.from('projects').update(patch).eq('id', p.id).select(PROJECT_COLS).single();
    if (error) return toast(error.message);
    if (p.canBudget && 'value' in f) { const v = f.value === '' ? null : Number(f.value); const r = await sb.from('project_budgets').upsert({ project_id: p.id, value: v, updated_at: new Date().toISOString() }); if (r.error) return toast(r.error.message); data.value = v; }
    Object.assign(p, data); toast('Guardado.'); after && after(data);
  });
}
function projectDetailsModal(p, after) {
  const m = modal(`<h2>${esc(p.name)}</h2><div data-body></div>`, { wide: true });
  const body = m.el.querySelector('[data-body]');
  body.innerHTML = detailsForm(p);
  bindDetails(body, p, () => { m.close(); after && after(); });
}

// ---------- equipa do projeto e convites ----------
async function projectTeam(root, p) {
  const [{ data: members }, people, { data: invites }] = await Promise.all([
    sb.from('project_members').select('user_id, added_at').eq('project_id', p.id),
    loadPeople(),
    isStaff() ? sb.from('invites').select('id, email, created_at, expires_at, used_at').eq('project_id', p.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const staff = people.filter((x) => x.role !== 'guest');
  const guests = people.filter((x) => x.role === 'guest' && (members || []).some((m) => m.user_id === x.id));
  const inv = (invites || []);
  const istate = (i) => (i.used_at ? `Usado a ${fmtDate(i.used_at)}` : new Date(i.expires_at) < new Date() ? 'Expirou' : `Válido até ${fmtDate(i.expires_at)}`);
  root.innerHTML = `
    <section class="stack">
      <h3 class="h3">${p.is_central ? 'Equipa da Grain' : 'Atribuídos ao projeto'}</h3>
      <p class="muted small">${p.is_central ? 'Todos os membros e administradores têm acesso à Central.' : 'Quem trabalha neste projeto. Todos os membros da Grain continuam a ter acesso.'}</p>
      ${(() => { const assigned = p.is_central ? staff : staff.filter((x) => (members || []).some((m) => m.user_id === x.id)); const free = staff.filter((x) => !assigned.includes(x));
        return `<ul class="people">${assigned.map((x) => `<li><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}</span><span class="muted small">${esc(ROLES[x.role])}</span>${!p.is_central && isStaff() ? `<button type="button" class="link-btn danger-text" data-rmguest="${x.id}">Tirar</button>` : ''}</li>`).join('') || '<li class="muted small">Ainda ninguém atribuído.</li>'}</ul>
        ${!p.is_central && isStaff() && free.length ? `<label class="sel"><span class="vh">Atribuir pessoa</span><select data-assign><option value="">+ Atribuir pessoa da Grain</option>${free.map((x) => `<option value="${x.id}">${esc(x.display_name)}</option>`).join('')}</select></label>` : ''}`; })()}
    </section>
    ${p.canBudget ? `<section class="stack">
      <h3 class="h3">${ICON.lock} Quem vê o orçamento</h3>
      <p class="muted small">Quem não estiver aqui não vê o orçamento nem o valor do projeto em lado nenhum.</p>
      <div data-budgetacc></div>
    </section>` : ''}
    ${p.is_central ? '' : `<section class="stack">
      <h3 class="h3">Convidados externos</h3>
      ${guests.length ? `<ul class="people">${guests.map((x) => `<li><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}</span>${isStaff() ? `<button type="button" class="link-btn danger-text" data-rmguest="${x.id}">Tirar do projeto</button>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Ainda ninguém de fora.</p>'}
    </section>
    ${isStaff() ? `<section class="stack">
      <h3 class="h3">Convidar pessoa externa</h3>
      <p class="muted small">Gera um código que só funciona uma vez, para este email e este projeto. Vale 14 dias.</p>
      <form class="row" data-invite><input type="email" name="email" placeholder="email@exemplo.com" aria-label="Email da pessoa" required><button class="btn primary">Gerar código</button></form>
      <div data-code></div>
      ${inv.length ? `<ul class="invites">${inv.map((i) => `<li><span>${esc(i.email)}</span><span class="muted small">${istate(i)}</span>${!i.used_at ? `<button type="button" class="icon-btn" data-rminv="${i.id}" aria-label="Anular convite">${ICON.trash}</button>` : ''}</li>`).join('')}</ul>` : ''}
    </section>` : ''}`}`;
  const acc = root.querySelector('[data-budgetacc]'); if (acc) budgetAccessPanel(acc, p);
  root.querySelector('[data-invite]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const { data: code, error } = await sb.rpc('create_invite', { p_project: p.id, p_email: email });
    if (error) return toast(error.message);
    const url = location.origin + BASE;
    const msg = `Olá! Foste convidado para o projeto "${p.name}" no byGrain Studio.\n\n1. Entra em ${url}\n2. Escolhe "Tenho um código"\n3. Usa o email ${email} e o código ${code}\n\nO código só funciona uma vez e vale 14 dias.`;
    root.querySelector('[data-code]').innerHTML = `<div class="code-box"><div class="code">${esc(code)}</div><p class="muted small">Copia já: por segurança, o código não volta a ser mostrado.</p><textarea rows="6" readonly>${esc(msg)}</textarea><button type="button" class="btn ghost" data-copy>${ICON.copy} Copiar mensagem</button></div>`;
    root.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(msg); toast('Copiado.'); } catch { root.querySelector('.code-box textarea').select(); } });
    e.target.reset();
  });
  root.querySelectorAll('[data-rmguest]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('Tirar esta pessoa do projeto?', 'Tirar'))) return;
    await sb.from('project_members').delete().eq('project_id', p.id).eq('user_id', b.dataset.rmguest); projectTeam(root, p);
  }));
  root.querySelector('[data-assign]')?.addEventListener('change', async (e) => { if (!e.target.value) return; const { error } = await sb.from('project_members').insert({ project_id: p.id, user_id: e.target.value }); if (error) toast(error.message); projectTeam(root, p); });
  root.querySelectorAll('[data-rminv]').forEach((b) => b.addEventListener('click', async () => { await sb.from('invites').delete().eq('id', b.dataset.rminv); projectTeam(root, p); }));
}

// ---------- projeto: página com ferramentas; os boards criam-se lá dentro ----------
const projBase = (p) => (p.is_central ? '#/central' : `#/p/${p.id}`);
const toolHref = (p, b) => `${projBase(p)}/${(b.kind || 'board') === 'board' ? 'b' : 'f'}/${b.id}`;

async function loadProject(id) {
  const { data: p } = await sb.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle();
  if (!p) return null;
  // o orçamento só chega a quem tem acesso (a base de dados devolve vazio aos outros)
  const [{ data: fin }, { data: grant }] = await Promise.all([
    sb.from('project_budgets').select('value, budget').eq('project_id', id).maybeSingle(),
    sb.from('budget_access').select('user_id').eq('project_id', id).eq('user_id', state.user.id).maybeSingle(),
  ]);
  p.canBudget = !p.is_central && (hasPerm('budget') || !!grant);
  p.value = p.canBudget ? fin?.value ?? null : null;
  p.budget = p.canBudget ? fin?.budget ?? null : null;
  const { data: boards } = await sb.from('boards').select('id, parent_id, title, group_id, position, created_at, kind').eq('project_id', id).order('position').order('created_at');
  p._boards = boards || [];
  return p;
}
function notFound() {
  app.innerHTML = `<div class="page">${header('')}<div class="wrap page-pad"><p class="empty-note">Este projeto não existe ou não tens acesso.</p><a href="#/">Voltar ao início</a></div></div>`;
  bindHeader(app);
}

// grupos de boards = departamentos do projeto (como no Studio), mais "Outros"
function boardGroups(p) {
  const top = p._boards.filter((b) => !b.parent_id);
  const groups = (p.departments || []).map((d) => ({ ...d, boards: top.filter((b) => b.group_id === d.id) }));
  const known = new Set(groups.map((g) => g.id));
  const other = top.filter((b) => !b.group_id || !known.has(b.group_id));
  if (other.length) groups.push({ id: '', name: 'Outros', color: '#8A8A99', boards: other });
  return groups;
}

function projectNav(p, active) {
  const base = projBase(p);
  const pages = [['geral', 'Visão geral', ICON.home], ...(p.is_central && hasPerm('finance') ? [['financas', 'Finanças', ICON.money]] : []), ...(p.canBudget ? [['orcamento', 'Orçamento', ICON.money]] : []), ...(p.kind === 'ficcao' ? FICTION_PAGES : p.kind === 'videoclipe' ? CLIP_PAGES : p.is_central ? [] : [['aderecos', 'Adereços', ICON.prop]]), ['tarefas', 'Tarefas', ICON.task], ['equipa', p.is_central ? 'Equipa' : 'Equipa e convites', ICON.team], ...(isStaff() ? [['detalhes', 'Detalhes', ICON.info]] : [])];
  return `
    <div class="pn-h"><strong>${esc(p.name)}</strong>${p.client ? `<span class="muted small">${esc(p.client)}</span>` : ''}</div>
    ${pages.map(([k, l, ic]) => `<a class="side-a" href="${base}${k === 'geral' ? '' : '/' + k}" ${active === k ? 'aria-current="page"' : ''}>${ic}<span>${l}</span></a>`).join('')}
    <div class="pn-sec"><span>Ferramentas</span><button type="button" class="icon-btn sm" data-newboard="" aria-label="Nova ferramenta">${ICON.plus}</button></div>
    ${boardGroups(p).map((g) => `<div class="pn-group" style="--g:${esc(g.color)}">
      <div class="pn-gh"><i></i><span>${esc(g.name)}</span>${g.id ? `<button type="button" class="icon-btn sm" data-newboard="${esc(g.id)}" aria-label="Novo board em ${esc(g.name)}">${ICON.plus}</button>` : ''}</div>
      ${g.boards.map((b) => `<a class="side-a sub" href="${toolHref(p, b)}" ${active === b.id ? 'aria-current="page"' : ''}>${(TOOL_KINDS[b.kind] || TOOL_KINDS.board).icon}<span>${esc(b.title)}</span></a>`).join('')}
    </div>`).join('')}`;
}
function bindProjectNav(root, p) {
  root.querySelectorAll('[data-newboard]').forEach((b) => b.addEventListener('click', () => newBoard(p, b.dataset.newboard)));
}

function newBoard(p, groupId = '', kind = 'board') {
  const fic = p.kind === 'ficcao';
  const tpls = [['blank', 'Em branco'], ['deliverables', 'Entregas (peças, formatos, plataformas)'], ['props', fic ? 'Adereços por cena' : 'Adereços'], ...(fic ? [['cast', 'Elenco']] : [])];
  const m = modal(`<h2>Nova ferramenta</h2>
    <form class="stack">
      <div class="tool-kinds" role="radiogroup" aria-label="Ferramenta">${Object.entries(TOOL_KINDS).map(([k, v]) => `<label class="tool-k"><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${v.icon}${v.label}</span></label>`).join('')}</div>
      <div class="field"><label for="bn">Nome</label><input id="bn" name="title" placeholder="ex: Moodboard, Storyboard, Plano de rodagem" required></div>
      <div class="field" data-tplf hidden><label for="bt">Modelo</label><select id="bt" name="tpl">${tpls.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label for="bg">Departamento</label><select id="bg" name="group_id"><option value="">Nenhum</option>${(p.departments || []).map((d) => `<option value="${esc(d.id)}" ${d.id === groupId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar e abrir</button></div>
    </form>`);
  const form = m.el.querySelector('form');
  const ttl = form.elements.title;
  const sync = () => { const k = form.elements.kind.value; m.el.querySelector('[data-tplf]').hidden = k !== 'table'; if (!ttl.dataset.touched) ttl.value = k === 'board' ? '' : TOOL_KINDS[k].label; };
  ttl.addEventListener('input', () => (ttl.dataset.touched = '1'));
  form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', sync)); sync();
  const tplNames = { blank: 'Tabela', deliverables: 'Entregas', props: 'Adereços por cena', cast: 'Elenco' };
  form.elements.tpl.addEventListener('change', () => { if (!ttl.dataset.touched) ttl.value = tplNames[form.elements.tpl.value]; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const data = f.kind === 'table' ? await tableTemplate(p, f.tpl) : f.kind === 'lightmap' ? newLightmapData() : {};
    const { data: row, error } = await sb.from('boards').insert({ project_id: p.id, title: f.title.trim(), group_id: f.group_id || null, position: p._boards.length, kind: f.kind, data }).select().single();
    if (error) return toast(error.message);
    m.close(); go(toolHref(p, row));
  });
}

// ---------- ferramentas (tabela, cronograma, mapa de luz) ----------
async function toolPage(projectId, toolId) {
  const p = await loadProject(projectId);
  if (!p) return notFound();
  const { data: tool } = await sb.from('boards').select('*').eq('id', toolId).maybeSingle();
  if (!tool) return go(projBase(p));
  if (tool.kind === 'board') return go(toolHref(p, tool));
  const d = (p.departments || []).find((x) => x.id === tool.group_id);
  app.innerHTML = `<div class="page">${header(p.is_central ? 'central' : '')}
    <div class="proj-layout">
      <nav class="proj-nav" aria-label="Projeto">${projectNav(p, tool.id)}</nav>
      <main class="proj-main" data-main>
        <div class="row between wrap-gap"><div><span class="small muted">${(TOOL_KINDS[tool.kind] || {}).label || ''}${d ? ` · ${esc(d.name)}` : ''}</span><h1 class="h1">${esc(tool.title)}</h1></div>
          <button type="button" class="btn ghost" data-topt>${ICON.dots} Opções</button></div>
        <div data-tool></div>
      </main>
    </div></div>`;
  bindHeader(app); bindProjectNav(app, p);
  app.querySelector('[data-topt]').addEventListener('click', () => boardOptions(p, tool, () => toolPage(projectId, toolId)));
  const box = app.querySelector('[data-tool]');
  if (tool.kind === 'table') tableTool(box, p, tool);
  if (tool.kind === 'timeline') timelineTool(box, p, tool);
  if (tool.kind === 'lightmap') {
    const { data: chars } = p.kind === 'ficcao' ? await sb.from('characters').select('name').eq('project_id', p.id).order('position') : { data: [] };
    const lm = lightmapTool(box, p, tool, { characters: (chars || []).map((c) => c.name) });
    onCleanup(() => lm.destroy());
  }
}

function boardOptions(p, b, after) {
  const m = modal(`<h2>${esc((TOOL_KINDS[b.kind] || TOOL_KINDS.board).label)}</h2>
    <form class="stack">
      <div class="field"><label for="bn">Nome</label><input id="bn" name="title" value="${esc(b.title)}" required></div>
      <div class="field"><label for="bg">Departamento</label><select id="bg" name="group_id"><option value="">Nenhum</option>${(p.departments || []).map((d) => `<option value="${esc(d.id)}" ${d.id === b.group_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div class="row between">
        <button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>
        <div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div>
      </div>
    </form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { error } = await sb.from('boards').update({ title: f.title.trim(), group_id: f.group_id || null }).eq('id', b.id);
    if (error) return toast(error.message);
    m.close(); after();
  });
  m.el.querySelector('[data-del]').addEventListener('click', async () => {
    m.close();
    if (!(await confirmBox(`Apagar "${b.title}" e tudo o que tem dentro?`, 'Apagar'))) return;
    const { error } = await sb.from('boards').delete().eq('id', b.id);
    if (error) return toast(error.message);
    toast('Apagado.'); if (location.hash.includes(b.id)) go(projBase(p)); else after();
  });
}

async function projectPage(projectId, page, sub) {
  const p = await loadProject(projectId);
  if (!p) return notFound();
  if (page === 'detalhes' && !isStaff()) page = 'geral';
  app.innerHTML = `<div class="page">${header(p.is_central ? 'central' : '')}
    <div class="proj-layout">
      <nav class="proj-nav" aria-label="Projeto">${projectNav(p, page)}</nav>
      <main class="proj-main" data-main></main>
    </div></div>`;
  bindHeader(app); bindProjectNav(app, p);
  const main = app.querySelector('[data-main]');
  const titles = { tarefas: 'Tarefas', equipa: p.is_central ? 'Equipa' : 'Equipa e convites', detalhes: 'Detalhes' };
  if (page === 'geral') return projectOverview(main, p);
  if (page === 'financas' && p.is_central && hasPerm('finance')) return financePage(main, sub);
  if (page === 'orcamento' && p.canBudget) { main.innerHTML = `<div class="row between wrap-gap"><div><h1 class="h1 pm-title">Orçamento</h1><p class="muted">Soma tudo o que está na tabela e compara com o orçamento geral do projeto.</p></div><div data-who></div></div><div class="budget-wrap" data-b></div>`; budgetWhoChip(main.querySelector('[data-who]'), p); return budgetPage(main.querySelector('[data-b]'), p); }
  if (p.kind === 'videoclipe' && CLIP_PAGES.some(([k]) => k === page) && page !== 'aderecos') return clipPage(main, p, page, sub, projBase(p), onCleanup);
  if (['orcamento', 'financas'].includes(page)) { main.innerHTML = `<div class="empty-box"><p>${ICON.lock} Não tens acesso a esta parte.</p><p class="muted small">Pede a um administrador.</p></div>`; return; }
  if (page === 'aderecos' && !p.is_central) return propsPage(main, p, sub, projBase(p), onCleanup);
  if (p.kind === 'ficcao' && FICTION_PAGES.some(([k]) => k === page)) return fictionPage(main, p, page, sub, projBase(p), onCleanup);
  main.innerHTML = `<h1 class="h1 pm-title">${esc(titles[page] || '')}</h1><div class="panel" data-body></div>`;
  const body = main.querySelector('[data-body]');
  if (page === 'tarefas') { body.classList.remove('panel'); body.classList.add('tc'); const t = mountTaskCenter(body, { projectId: p.id }); onCleanup(() => t.destroy()); }
  if (page === 'equipa') projectTeam(body, p);
  if (page === 'detalhes') { body.innerHTML = detailsForm(p); bindDetails(body, p, () => projectPage(projectId, 'detalhes')); }
}

function budgetUsed(p) {
  const b = p.budget; if (!b?.rows || !b.main) return 0;
  return b.rows.filter((r) => r.kind === 'item').reduce((a, r) => a + (Number(r.cells?.[b.main]) || 0), 0);
}

async function projectOverview(main, p) {
  const base = projBase(p);
  const [{ data: tasks }, { data: items }, people] = await Promise.all([
    sb.from('tasks').select('*').eq('project_id', p.id).neq('status', 'done'),
    sb.from('board_items').select('board_id, kind, data').eq('project_id', p.id),
    loadPeople(),
  ]);
  const cover = p.cover_path ? (await signedUrls([p.cover_path]))[p.cover_path] : null;
  const fs = p.kind === 'ficcao' ? await fictionStats(p) : null;
  const imgPaths = (items || []).filter((i) => i.kind === 'image').map((i) => i.data?.path);
  const thumbs = await signedUrls(imgPaths.slice(0, 40));
  const ph = phaseOf(p);
  const top = p._boards.filter((b) => !b.parent_id);
  const count = (id) => (items || []).filter((i) => i.board_id === id).length;
  const thumbOf = (id) => { const im = (items || []).find((i) => i.board_id === id && i.kind === 'image' && thumbs[i.data?.path]); return im ? thumbs[im.data.path] : null; };
  const deptMap = new Map((p.departments || []).map((d) => [d.id, d]));
  const next = (tasks || []).sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999')).slice(0, 6);
  main.innerHTML = `
    <section class="pm-head" style="${cover ? `background-image:linear-gradient(rgba(12,12,18,.15),rgba(12,12,18,.75)),url('${esc(cover)}')` : ''}">
      <div class="grain-layer moving" aria-hidden="true"></div>
      <div class="pm-head-in">
        <span class="tag dark">${esc(KINDS[p.kind] || p.kind)}</span>
        <h1 class="pm-name">${esc(p.name)}</h1>
        <p class="pm-sub">${[p.client, p.starts_on && p.ends_on ? `${fmtDate(p.starts_on)} – ${fmtDate(p.ends_on)}` : ''].filter(Boolean).map(esc).join(' · ')}</p>
        ${p.canBudget ? (() => { const used = budgetUsed(p); const over = p.value != null && used > p.value; return `<button type="button" class="pm-budget ${over ? 'over' : ''}" data-budget title="Só quem tem acesso ao orçamento vê isto"><span>${ICON.lock} Orçamento</span>${p.value != null ? `<strong>${eur.format(p.value)}</strong>${used ? `<small>${eur.format(used)} na tabela${over ? ` · ${eur.format(used - p.value)} acima` : ''}</small>` : ''}` : '<strong class="muted-w">Definir</strong>'}</button>`; })() : ''}
        ${ph.label ? `<div class="pm-phase"><div class="row between small"><span>${esc(ph.label)}</span><span>${Math.round(ph.pct * 100)}%</span></div><div class="bar light"><i style="width:${Math.round(ph.pct * 100)}%"></i></div></div>` : ''}
      </div>
    </section>
    ${fs ? `<div class="stats">${[['cenas', 'Cenas', fs.scenes], ['personagens', 'Personagens', fs.characters], ['decors', 'Décors', fs.locations], ['storyboard', 'Planos', fs.shots]].map(([k, l, n]) => `<a class="stat" href="${base}/${k}"><strong>${n}</strong><span>${l}</span></a>`).join('')}${fs.scenes ? '' : `<a class="stat cta" href="${base}/guiao"><strong>${ICON.plus}</strong><span>Importar guião</span></a>`}</div>` : ''}
    ${p.is_central ? '' : '<div class="ov" data-situation></div>'}
    <div class="pm-grid ${p.is_central ? '' : 'solo'}">
      <section class="pm-boards" aria-labelledby="h-boards">
        <div class="row between"><h2 id="h-boards" class="h2">Ferramentas</h2><button type="button" class="btn primary" data-nb>${ICON.plus} Nova ferramenta</button></div>
        ${top.length ? `<div class="board-grid">${top.map((b) => { const d = deptMap.get(b.group_id); const th = thumbOf(b.id); return `
          <article class="board-card" style="--g:${esc(d?.color || '#8A8A99')}">
            <a href="${toolHref(p, b)}" class="proj-link" aria-label="Abrir ${esc(b.title)}"></a>
            <div class="bc-cover" ${th ? `style="background-image:url('${esc(th)}')"` : ''}>${th ? '' : (TOOL_KINDS[b.kind] || TOOL_KINDS.board).icon}</div>
            <div class="bc-body"><strong>${esc(b.title)}</strong><span class="small muted">${d ? `<i class="dot"></i>${esc(d.name)} · ` : ''}${(b.kind || 'board') === 'board' ? `${count(b.id)} ${count(b.id) === 1 ? 'cartão' : 'cartões'}` : esc((TOOL_KINDS[b.kind] || {}).label || '')}</span></div>
            <button type="button" class="icon-btn bc-more" data-bopt="${b.id}" aria-label="Opções de ${esc(b.title)}">${ICON.dots}</button>
          </article>`; }).join('')}</div>`
        : `<div class="empty-box"><p>Ainda não há ferramentas neste projeto.</p><p class="muted small">Boards para o tratamento, o moodboard ou um brainstorm (abrem em ecrã inteiro), tabelas, cronograma e mapas de luz.</p><button type="button" class="btn primary" data-nb>${ICON.plus} Criar a primeira</button></div>`}
      </section>
      ${p.is_central ? `<aside class="pm-side">
        <section class="panel">
          <div class="row between"><h2 class="h3">Próximas tarefas</h2><a href="${base}/tarefas" class="small">Ver todas</a></div>
          <ul class="mini-tasks">${next.length ? next.map((t) => { const du = dueInfo(t.due, t.status); const d = deptMap.get(t.department); const who = people.find((x) => x.id === t.assignee_id); return `<li><a href="${base}/tarefas"><span><strong>${esc(t.title)}</strong><small>${[who?.display_name, d?.name].filter(Boolean).map(esc).join(' · ') || 'Sem responsável'}</small></span><span class="due due-${du.tone}">${esc(du.label)}</span></a></li>`; }).join('') : '<li class="muted">Sem tarefas abertas.</li>'}</ul>
        </section>
      </aside>` : ''}
    </div>`;
  main.querySelectorAll('[data-nb]').forEach((b) => b.addEventListener('click', () => newBoard(p)));
  main.querySelector('[data-budget]')?.addEventListener('click', () => go(`${base}/orcamento`));
  if (false) main.querySelector('[data-budget]')?.addEventListener('click', () => {
    const m = modal(`<h2>Orçamento do projeto</h2><form class="stack"><div class="field"><label for="bv">Orçamento (€)</label><input id="bv" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.value ?? '')}"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const v = m.el.querySelector('#bv').value;
      const { error } = await sb.from('projects').update({ value: v === '' ? null : Number(v) }).eq('id', p.id);
      if (error) return toast(error.message);
      m.close(); toast('Orçamento guardado.'); projectPage(p.id, 'geral');
    });
  });
  main.querySelectorAll('[data-bopt]').forEach((btn) => btn.addEventListener('click', () => boardOptions(p, p._boards.find((x) => x.id === btn.dataset.bopt), () => projectPage(p.id, 'geral'))));
  if (!p.is_central) mountSituation(main.querySelector('[data-situation]'), p, base);
  if (p.is_central) { const box = document.createElement('div'); box.className = 'co'; main.querySelector('.pm-head').after(box); centralOverview(box); }
}

// ---------- Central: visão geral dos projetos ----------
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const coState = { ym: new Date().toISOString().slice(0, 7) };
const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
async function centralOverview(box) {
  box.innerHTML = '<p class="muted">A carregar os projetos…</p>';
  const [{ data: projects }, { data: members }, { data: fins }, { data: tasks }, people] = await Promise.all([
    sb.from('projects').select(PROJECT_COLS).eq('is_central', false),
    sb.from('project_members').select('project_id, user_id'),
    sb.from('project_budgets').select('project_id, value'),
    sb.from('tasks').select('project_id, assignee_id, status'),
    loadPeople(),
  ]);
  const staffIds = new Set(people.filter((x) => x.role !== 'guest').map((x) => x.id));
  const money = hasPerm('budget');
  const vmap = new Map((fins || []).map((x) => [x.project_id, x.value]));
  (projects || []).forEach((x) => { x.value = vmap.get(x.id) ?? null; });
  const who = (pid) => { const ids = new Set([...(members || []).filter((m) => m.project_id === pid).map((m) => m.user_id), ...(tasks || []).filter((t) => t.project_id === pid && t.assignee_id).map((t) => t.assignee_id)]); return people.filter((x) => ids.has(x.id)).sort((a, b) => staffIds.has(b.id) - staffIds.has(a.id)); };
  const avatars = (pid) => { const l = who(pid); return l.length ? `<span class="av-stack">${l.slice(0, 4).map((x) => `<span class="avatar sm" title="${esc(x.display_name)}" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span>`).join('')}${l.length > 4 ? `<span class="avatar sm more">+${l.length - 4}</span>` : ''}</span>` : '<span class="muted small">—</span>'; };
  const open = (pid) => (tasks || []).filter((t) => t.project_id === pid && t.status !== 'done').length;
  const val = (v) => (v == null ? '<span class="muted">—</span>' : eur.format(v));
  const ongoing = (projects || []).filter((x) => x.status === 'active').sort((a, b) => (a.ends_on || '9999').localeCompare(b.ends_on || '9999'));
  const finished = (projects || []).filter((x) => x.status !== 'active' && x.done_at && x.done_at.slice(0, 7) === coState.ym).sort((a, b) => b.done_at.localeCompare(a.done_at));
  const sum = (l) => l.reduce((a, x) => a + (Number(x.value) || 0), 0);
  const [y, m] = coState.ym.split('-');
  const stateCell = (x) => { const ph = phaseOf(x); const d = x.ends_on ? daysUntil(x.ends_on) : null; return `<div class="co-state"><span>${esc(ph.label || 'Sem datas')}</span><div class="bar"><i style="width:${Math.round(ph.pct * 100)}%"></i></div>${d != null && d < 0 ? '<span class="small late-txt2">Prazo passado</span>' : ''}</div>`; };
  box.innerHTML = `
    <section class="co-sec">
      <div class="co-h"><h2 class="h2">Projetos em curso</h2><span class="muted">${ongoing.length} ${ongoing.length === 1 ? 'projeto' : 'projetos'}${money ? ` · <strong class="co-total">${eur.format(sum(ongoing))}</strong>` : ''}</span></div>
      <div class="panel table-wrap">${ongoing.length ? `<table class="table co-table"><thead><tr><th>Projeto</th>${money ? '<th class="num">Orçamento</th>' : ''}<th>Atribuídos</th><th>Estado</th><th class="num">Tarefas</th><th>Entrega</th></tr></thead><tbody>
        ${ongoing.map((x) => `<tr class="click-row" data-href="#/p/${x.id}"><td><a href="#/p/${x.id}" class="co-name"><strong>${esc(x.name)}</strong><span class="small muted">${esc(x.client || '')}${x.client ? ' · ' : ''}${esc(KINDS[x.kind] || x.kind)}</span></a></td>${money ? `<td class="num">${val(x.value)}</td>` : ''}<td>${avatars(x.id)}</td><td>${stateCell(x)}</td><td class="num">${open(x.id) || '<span class="muted">0</span>'}</td><td class="small">${x.ends_on ? fmtDate(x.ends_on) : '<span class="muted">—</span>'}</td></tr>`).join('')}
      </tbody>${money ? `<tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${eur.format(sum(ongoing))}</strong></td><td colspan="4"></td></tr></tfoot>` : ''}</table>` : '<p class="empty-note">Não há projetos em curso.</p>'}</div>
    </section>
    <section class="co-sec">
      <div class="co-h"><h2 class="h2">Finalizados</h2>
        <div class="month-nav"><button type="button" class="icon-btn" data-cm="-1" aria-label="Mês anterior">${ICON.back}</button><strong>${MESES_L[+m - 1]} ${y}</strong><button type="button" class="icon-btn" data-cm="1" aria-label="Mês seguinte">${ICON.chev}</button></div>
        <span class="muted">${finished.length} ${finished.length === 1 ? 'projeto' : 'projetos'}${money ? ` · <strong class="co-total">${eur.format(sum(finished))}</strong>` : ''}</span></div>
      <div class="panel table-wrap">${finished.length ? `<table class="table co-table"><thead><tr><th>Projeto</th>${money ? '<th class="num">Orçamento</th>' : ''}<th>Atribuídos</th><th>Fechado a</th></tr></thead><tbody>
        ${finished.map((x) => `<tr class="click-row" data-href="#/p/${x.id}"><td><a href="#/p/${x.id}" class="co-name"><strong>${esc(x.name)}</strong><span class="small muted">${esc(x.client || '')}${x.client ? ' · ' : ''}${esc(KINDS[x.kind] || x.kind)}</span></a></td>${money ? `<td class="num">${val(x.value)}</td>` : ''}<td>${avatars(x.id)}</td><td class="small">${fmtDate(x.done_at)}</td></tr>`).join('')}
      </tbody>${money ? `${money ? `<tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${eur.format(sum(finished))}</strong></td><td colspan="2"></td></tr></tfoot>` : ''}` : ''}</table>` : `<p class="empty-note">Nenhum projeto finalizado em ${MESES_L[+m - 1]}.</p>`}</div>
    </section>`;
  box.querySelectorAll('[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(tr.dataset.href); }));
  box.querySelectorAll('[data-cm]').forEach((b) => b.addEventListener('click', () => { const [yy, mm] = coState.ym.split('-').map(Number); const d = new Date(yy, mm - 1 + Number(b.dataset.cm), 1); coState.ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; centralOverview(box); }));
}

// ---------- board em ecrã inteiro ----------
async function boardView(projectId, boardId) {
  const p = await loadProject(projectId);
  if (!p) return notFound();
  const boards = p._boards;
  const cur = boards.find((b) => b.id === boardId);
  if (!cur) return go(projBase(p));
  const base = projBase(p);
  const chain = []; let b = cur; while (b) { chain.unshift(b); b = boards.find((x) => x.id === b.parent_id); }
  const topId = chain[0].id;

  const tools = [['note', 'Nota', ICON.note], ['image', 'Imagem', ICON.image], ['palette', 'Paleta', ICON.palette], ['list', 'Lista', ICON.list], ['board', 'Board', ICON.board], ['title', 'Título', ICON.title], ['link', 'Ligação', ICON.link]];
  document.body.classList.add('is-board');
  onCleanup(() => document.body.classList.remove('is-board'));

  app.innerHTML = `<div class="pv">
    <div class="pv-board"></div>
    <div class="pv-top">
      <button type="button" class="pv-mark" data-side aria-label="Abrir o menu do projeto">${LOGO('studio')}</button>
      <nav class="crumbs" aria-label="Caminho">
        <a href="${base}">${esc(p.name)}</a>
        ${chain.map((c, i) => `<span>/</span>${i === chain.length - 1 ? `<span aria-current="page">${esc(c.title)}</span>` : `<a href="${base}/b/${c.id}">${esc(c.title)}</a>`}`).join('')}
      </nav>
    </div>
    <div class="pv-edge" data-edge aria-hidden="true"></div>
    <nav class="pv-side" data-sidebar aria-label="Páginas do projeto">
      ${projectNav(p, topId)}
      <hr>
      <a class="side-a" href="#/">${ICON.back}<span>Voltar ao início</span></a>
    </nav>
    <div class="pv-tools" role="toolbar" aria-label="Juntar ao board">
      ${tools.map(([k, l, ic]) => `<button type="button" data-tool="${k}" title="${l}" aria-label="Juntar ${l.toLowerCase()}">${ic}<span>${l}</span></button>`).join('')}
      <hr>
      <button type="button" data-color title="Cor do cartão selecionado" aria-label="Cor do cartão selecionado" aria-expanded="false" disabled><span class="cdot"></span><span>Cor</span></button>
    </div>
    <div class="pv-colorpop" data-cpop hidden role="dialog" aria-label="Cor do cartão"></div>
    <div class="pv-zoom">
      <button type="button" data-z="out" aria-label="Afastar">${ICON.minus}</button>
      <button type="button" data-z="reset" class="pct" aria-label="Voltar a 100%">100%</button>
      <button type="button" data-z="in" aria-label="Aproximar">${ICON.plus}</button>
      <button type="button" data-z="fit" aria-label="Ver tudo">${ICON.fit}<span>Ver tudo</span></button>
    </div>
  </div>`;
  bindProjectNav(app, p);
  const cBtn = app.querySelector('[data-color]'); const cPop = app.querySelector('[data-cpop]');
  let selInfo = null;
  const drawPop = () => {
    const cur = selInfo?.bg || '';
    cPop.innerHTML = `<p class="small muted">${selInfo?.kind === 'title' ? 'Cor do texto' : 'Cor de fundo'}</p><div class="cp-grid">${board.colors.map(([c, n]) => `<button type="button" class="cb-sw ${cur === c ? 'on' : ''}" data-bg="${c}" style="${c ? `background:${c}` : ''}" title="${n}" aria-label="${n}"></button>`).join('')}<label class="cb-custom" title="Outra cor"><input type="color" data-bgc value="${cur || '#F4F1E8'}" aria-label="Outra cor"><span>+</span></label></div>`;
  };
  const closePop = () => { cPop.hidden = true; cBtn.setAttribute('aria-expanded', 'false'); };
  cBtn.addEventListener('click', () => { if (!selInfo) return; if (cPop.hidden) { drawPop(); cPop.hidden = false; cBtn.setAttribute('aria-expanded', 'true'); } else closePop(); });
  cPop.addEventListener('click', (e) => { const b = e.target.closest('[data-bg]'); if (b) { board.setColor(b.dataset.bg); drawPop(); } });
  cPop.addEventListener('input', (e) => { if (e.target.matches('[data-bgc]')) board.setColor(e.target.value, 400); });
  const popOutside = (e) => { if (!cPop.hidden && !e.target.closest('[data-cpop], [data-color]')) closePop(); };
  document.addEventListener('pointerdown', popOutside, true); onCleanup(() => document.removeEventListener('pointerdown', popOutside, true));

  const pct = app.querySelector('.pct');
  const board = mountBoard(app.querySelector('.pv-board'), {
    projectId: p.id, boardId: cur.id,
    onOpenBoard: (id) => go(`${base}/b/${id}`),
    onUp: () => go(cur.parent_id ? `${base}/b/${cur.parent_id}` : base),
    onZoom: (k) => (pct.textContent = Math.round(k * 100) + '%'),
    onSelect: (info) => {
      selInfo = info;
      cBtn.disabled = !info;
      cBtn.querySelector('.cdot').style.background = info?.bg || '';
      if (!info) closePop(); else if (!cPop.hidden) drawPop();
    },
  });
  onCleanup(() => board.destroy());

  app.querySelectorAll('[data-tool]').forEach((x) => x.addEventListener('click', () => board.add(x.dataset.tool)));
  app.querySelector('[data-z=in]').addEventListener('click', () => board.zoomBy(1.2));
  app.querySelector('[data-z=out]').addEventListener('click', () => board.zoomBy(1 / 1.2));
  app.querySelector('[data-z=reset]').addEventListener('click', () => board.setZoom(1));
  app.querySelector('[data-z=fit]').addEventListener('click', () => board.fit());

  // barra lateral: aparece ao encostar o rato à esquerda, ou ao clicar no símbolo
  const side = app.querySelector('[data-sidebar]');
  let hideT;
  const showSide = () => { clearTimeout(hideT); side.classList.add('open'); };
  const hideSide = () => { hideT = setTimeout(() => side.classList.remove('open'), 250); };
  app.querySelector('[data-edge]').addEventListener('mouseenter', showSide);
  side.addEventListener('mouseenter', showSide); side.addEventListener('mouseleave', hideSide);
  app.querySelector('[data-side]').addEventListener('click', showSide);
  const outside = (e) => { if (side.classList.contains('open') && !e.target.closest('[data-sidebar], [data-side], [data-edge], #modal')) side.classList.remove('open'); };
  document.addEventListener('pointerdown', outside, true); onCleanup(() => document.removeEventListener('pointerdown', outside, true));
}

// ---------- tarefas (todas) ----------
function tasksPage() {
  app.innerHTML = `<div class="page">${header('tasks')}
    <div class="wrap page-pad">
      <h1 class="h1">Tarefas</h1>
      <div class="tc" data-list></div>
    </div></div>`;
  bindHeader(app);
  const t = mountTaskCenter(app.querySelector('[data-list]'));
  onCleanup(() => t.destroy());
}

// ---------- equipa e permissões (administradores) ----------
async function teamPage() {
  app.innerHTML = `<div class="page">${header('team')}
    <div class="wrap page-pad stack-lg">
      <div class="row between wrap-gap"><h1 class="h1">Equipa e permissões</h1><button type="button" class="btn primary" data-newuser>${ICON.plus} Nova conta</button></div>
      <section class="panel"><h2 class="h3">Contas</h2>
        <p class="muted small">Administradores gerem contas e permissões. Membros veem todos os projetos e a Central de Produção. Convidados só veem os projetos para os quais foram convidados.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Utilizador</th><th>Email</th><th>Papel</th><th><span class="vh">Ações</span></th></tr></thead><tbody data-users><tr><td colspan="5" class="muted">A carregar…</td></tr></tbody></table></div>
      </section>
      <section class="panel"><h2 class="h3">Permissões</h2>
        <p class="muted small">O que cada pessoa da equipa pode ver para além dos projetos. Os administradores veem sempre tudo. O acesso ao orçamento de um único projeto dá-se na equipa desse projeto.</p>
        <div data-perms class="muted">A carregar…</div>
      </section>
      <section class="panel"><h2 class="h3">Convites</h2><div data-invites class="muted">A carregar…</div></section>
    </div></div>`;
  bindHeader(app);
  app.querySelector('[data-newuser]').addEventListener('click', newUser);
  globalPermsPanel(app.querySelector('[data-perms]'));
  const [people, { data: invites }, { data: projects }] = await Promise.all([
    sb.from('profiles').select('*').order('role').order('display_name').then((r) => r.data || []),
    sb.from('invites').select('*').order('created_at', { ascending: false }),
    sb.from('projects').select('id, name'),
  ]);
  const pmap = new Map((projects || []).map((p) => [p.id, p.name]));
  app.querySelector('[data-users]').innerHTML = people.map((u) => `<tr>
    <td><span class="cell-person"><span class="avatar sm" style="--c:${esc(u.color)}">${esc(initials(u.display_name))}</span>${esc(u.display_name)}</span></td>
    <td>${u.username ? '@' + esc(u.username) : '<span class="muted">—</span>'}</td>
    <td class="muted">${esc(u.email || '')}</td>
    <td><select data-role="${u.id}" aria-label="Papel de ${esc(u.display_name)}" ${u.id === state.user.id ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
    <td><div class="row end"><button type="button" class="link-btn" data-pw="${u.id}">Palavra-passe</button>${u.id !== state.user.id ? `<button type="button" class="icon-btn" data-deluser="${u.id}" aria-label="Apagar a conta de ${esc(u.display_name)}">${ICON.trash}</button>` : ''}</div></td>
  </tr>`).join('');
  app.querySelectorAll('[data-role]').forEach((s) => s.addEventListener('change', async () => {
    try { await callFn('admin-users', { action: 'update', user_id: s.dataset.role, role: s.value }); toast('Papel mudado.'); } catch (e) { toast(e.message); teamPage(); }
  }));
  app.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => {
    const u = people.find((x) => x.id === b.dataset.pw);
    const m = modal(`<h2>Palavra-passe de ${esc(u.display_name)}</h2><form class="stack"><div class="field"><label for="npw">Nova palavra-passe</label><input id="npw" type="text" autocomplete="off" required></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const v = m.el.querySelector('#npw').value;
      if (v.length < MIN_PW) return toast(`Pelo menos ${MIN_PW} caracteres.`);
      try { await callFn('admin-users', { action: 'update', user_id: u.id, password: authPw(v) }); m.close(); toast('Palavra-passe mudada.'); } catch (er) { toast(er.message); }
    });
  }));
  app.querySelectorAll('[data-deluser]').forEach((b) => b.addEventListener('click', async () => {
    const u = people.find((x) => x.id === b.dataset.deluser);
    if (!(await confirmBox(`Apagar a conta de ${u.display_name}?`, 'Apagar'))) return;
    try { await callFn('admin-users', { action: 'delete', user_id: u.id }); toast('Conta apagada.'); teamPage(); } catch (e) { toast(e.message); }
  }));
  const ist = (i) => (i.used_at ? `Usado a ${fmtDate(i.used_at)}` : new Date(i.expires_at) < new Date() ? 'Expirou' : `Válido até ${fmtDate(i.expires_at)}`);
  app.querySelector('[data-invites]').innerHTML = (invites || []).length
    ? `<ul class="invites">${invites.map((i) => `<li><span>${esc(i.email)}</span><span class="muted small">${esc(pmap.get(i.project_id) || '')}</span><span class="muted small">${ist(i)}</span></li>`).join('')}</ul>`
    : '<p class="muted small">Ainda não há convites. Gera-os dentro de cada projeto, em "Equipa e convites".</p>';
}

function newUser() {
  const m = modal(`<h2>Nova conta</h2>
    <form class="stack">
      <div class="field"><label for="un">Nome</label><input id="un" name="display_name" required></div>
      <div class="grid2">
        <div class="field"><label for="uu">Utilizador</label><input id="uu" name="username" autocapitalize="none" spellcheck="false" placeholder="ex: rubenmendes" required></div>
        <div class="field"><label for="ur">Papel</label><select id="ur" name="role"><option value="member">Membro</option><option value="admin">Administrador</option><option value="guest">Convidado</option></select></div>
      </div>
      <div class="field"><label for="ue">Email (opcional, serve para recuperar a palavra-passe)</label><input id="ue" name="email" type="email"></div>
      <div class="field"><label for="up">Palavra-passe inicial</label><input id="up" name="password" type="text" autocomplete="off" required></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar conta</button></div>
    </form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.password.length < MIN_PW) return toast(`Pelo menos ${MIN_PW} caracteres.`);
    try { await callFn('admin-users', { action: 'create', ...f, password: authPw(f.password) }); m.close(); toast('Conta criada.'); teamPage(); } catch (er) { toast(er.message); }
  });
}
