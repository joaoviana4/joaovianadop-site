import './style.css';
import { sb, state, esc, $, loadProfile, isStaff, isAdmin, toast, modal, confirmBox, ICON, LOGO, KINDS, ROLES, phaseOf, greeting, initials, signedUrls, uploadImage, callFn, authPw, MIN_PW, fmtDate, dueInfo, registerSW, BASE } from './lib.js';
import { renderAuth } from './auth.js';
import { mountBoard } from './board.js';
import { mountTasks, loadPeople } from './tasks.js';

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
  if (parts[0] === 'p' && parts[1]) return projectView(parts[1], parts[2] === 'b' ? parts[3] : null);
  if (parts[0] === 'central') {
    if (!isStaff()) return go('#/');
    const { data } = await sb.from('projects').select('id').eq('is_central', true).limit(1).maybeSingle();
    if (!data) return toast('A Central de Produção ainda não existe.');
    return projectView(data.id, parts[1] === 'b' ? parts[2] : null);
  }
  if (parts[0] === 'tarefas') return tasksPage(parts[1] || 'minhas');
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
const homeState = { tab: 'active' };
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
        <div class="proj-grid" data-grid><p class="muted">A carregar…</p></div>
      </section>
      ${staff ? `<aside class="home-side">
        <section class="panel">
          <div class="row between"><h2 class="h3">Central de Produção</h2><span class="tag blue">Só membros</span></div>
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

  const [{ data: projects }, { data: tasks }] = await Promise.all([
    sb.from('projects').select('*').eq('is_central', false).order('updated_at', { ascending: false }),
    sb.from('tasks').select('id, project_id, title, status, due, assignee_id'),
  ]);
  const list = (projects || []).filter((p) => p.status === homeState.tab);
  const open = (pid) => (tasks || []).filter((t) => t.project_id === pid && t.status !== 'done').length;
  const covers = await signedUrls(list.map((p) => p.cover_path));
  const mineOpen = (tasks || []).filter((t) => t.assignee_id === state.user.id && t.status !== 'done');
  const hero = app.querySelector('[data-hero]');
  if (hero) hero.textContent = staff ? `Tens ${mineOpen.length} ${mineOpen.length === 1 ? 'tarefa aberta' : 'tarefas abertas'} em ${new Set(mineOpen.map((t) => t.project_id)).size} projetos.` : `Tens acesso a ${(projects || []).length} ${projects?.length === 1 ? 'projeto' : 'projetos'}.`;

  const grid = app.querySelector('[data-grid]');
  grid.innerHTML = list.length ? list.map((p) => {
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
  }).join('') : `<p class="empty-note">${homeState.tab === 'active' ? (staff ? 'Ainda não há projetos em curso. Cria o primeiro em "Novo projeto".' : 'Ainda não foste convidado para nenhum projeto em curso.') : 'Nada aqui.'}</p>`;
  grid.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const p = list.find((x) => x.id === b.dataset.more); projectDetailsModal(p, homePage); }));

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
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div>
    </form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const { data, error } = await sb.from('projects').insert({ name: f.name.trim(), client: f.client.trim(), kind: f.kind, starts_on: f.starts_on || null, ends_on: f.ends_on || null }).select().single();
    if (error) return toast(error.message);
    await sb.from('project_members').insert({ project_id: data.id, user_id: state.user.id });
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
    const { data, error } = await sb.from('projects').update(patch).eq('id', p.id).select().single();
    if (error) return toast(error.message);
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
      <h3 class="h3">Equipa da Grain</h3>
      <p class="muted small">Todos os membros e administradores têm acesso a todos os projetos.</p>
      <ul class="people">${staff.map((x) => `<li><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}</span><span class="muted small">${esc(ROLES[x.role])}</span></li>`).join('')}</ul>
    </section>
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
  root.querySelectorAll('[data-rminv]').forEach((b) => b.addEventListener('click', async () => { await sb.from('invites').delete().eq('id', b.dataset.rminv); projectTeam(root, p); }));
}

// ---------- vista do projeto: board em ecrã inteiro ----------
async function projectView(projectId, boardId) {
  const { data: p, error } = await sb.from('projects').select('*').eq('id', projectId).maybeSingle();
  if (error || !p) { app.innerHTML = `<div class="page">${header('')}<div class="wrap"><p class="empty-note">Este projeto não existe ou não tens acesso.</p></div></div>`; bindHeader(app); return; }
  const { data: boards } = await sb.from('boards').select('id, parent_id, title').eq('project_id', p.id);
  const root = (boards || []).find((b) => !b.parent_id);
  const cur = (boards || []).find((b) => b.id === boardId) || root;
  const base = p.is_central ? '#/central' : `#/p/${p.id}`;
  const chain = []; let b = cur; while (b) { chain.unshift(b); b = (boards || []).find((x) => x.id === b.parent_id); }
  const boardHash = (id) => (id === root.id ? base : `${base}/b/${id}`);

  const tools = [['note', 'Nota', ICON.note], ['image', 'Imagem', ICON.image], ['palette', 'Paleta', ICON.palette], ['list', 'Lista', ICON.list], ['board', 'Board', ICON.board], ['title', 'Título', ICON.title], ['link', 'Ligação', ICON.link]];
  const pages = [['board', 'Board', ICON.board], ['tarefas', 'Tarefas', ICON.task], ['equipa', p.is_central ? 'Equipa' : 'Equipa e convites', ICON.team], ...(isStaff() ? [['detalhes', 'Detalhes', ICON.info]] : [])];
  document.body.classList.add('is-board');
  onCleanup(() => document.body.classList.remove('is-board'));

  app.innerHTML = `<div class="pv">
    <div class="pv-board"></div>
    <div class="pv-top">
      <button type="button" class="pv-mark" data-side aria-label="Abrir o menu do projeto">${LOGO('studio')}</button>
      <nav class="crumbs" aria-label="Caminho">
        <a href="#/">${p.is_central ? 'Início' : 'Projetos'}</a>
        ${chain.map((c, i) => `<span>/</span>${i === chain.length - 1 ? `<span aria-current="page">${esc(i === 0 ? p.name : c.title)}</span>` : `<a href="${boardHash(c.id)}">${esc(i === 0 ? p.name : c.title)}</a>`}`).join('')}
      </nav>
    </div>
    <div class="pv-edge" data-edge aria-hidden="true"></div>
    <nav class="pv-side" data-sidebar aria-label="Páginas do projeto">
      <div class="side-h"><strong>${esc(p.name)}</strong>${p.client ? `<span class="muted small">${esc(p.client)}</span>` : ''}</div>
      ${pages.map(([k, l, ic]) => `<button type="button" class="side-a" data-page="${k}">${ic}<span>${l}</span></button>`).join('')}
      <hr>
      <a class="side-a" href="#/">${ICON.home}<span>Início</span></a>
      ${isStaff() && !p.is_central ? `<a class="side-a" href="#/central">${ICON.board}<span>Central de Produção</span></a>` : ''}
      ${isStaff() ? `<a class="side-a" href="#/tarefas">${ICON.task}<span>As minhas tarefas</span></a>` : ''}
    </nav>
    <div class="pv-tools" role="toolbar" aria-label="Juntar ao board">
      ${tools.map(([k, l, ic]) => `<button type="button" data-tool="${k}" title="${l}" aria-label="Juntar ${l.toLowerCase()}">${ic}<span>${l}</span></button>`).join('')}
    </div>
    <div class="pv-zoom">
      <button type="button" data-z="out" aria-label="Afastar">${ICON.minus}</button>
      <button type="button" data-z="reset" class="pct" aria-label="Voltar a 100%">100%</button>
      <button type="button" data-z="in" aria-label="Aproximar">${ICON.plus}</button>
      <button type="button" data-z="fit" aria-label="Ver tudo">${ICON.fit}<span>Ver tudo</span></button>
    </div>
    <aside class="pv-drawer" data-drawer hidden aria-label="Painel">
      <div class="drawer-h"><h2 class="h3" data-dtitle></h2><button type="button" class="icon-btn" data-dclose aria-label="Fechar o painel">${ICON.close}</button></div>
      <div class="drawer-b" data-dbody></div>
    </aside>
  </div>`;

  const pct = app.querySelector('.pct');
  const board = mountBoard(app.querySelector('.pv-board'), {
    projectId: p.id, boardId: cur.id,
    onOpenBoard: (id) => go(boardHash(id)),
    onUp: () => { if (!drawerOpen()) { if (cur.parent_id) go(boardHash(cur.parent_id)); } },
    onZoom: (k) => (pct.textContent = Math.round(k * 100) + '%'),
  });
  onCleanup(() => board.destroy());

  app.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => board.add(b.dataset.tool)));
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
  app.querySelector('[data-side]').addEventListener('click', () => side.classList.toggle('open'));

  // painéis por cima do board
  const drawer = app.querySelector('[data-drawer]');
  const dbody = app.querySelector('[data-dbody]');
  let sub = null;
  const drawerOpen = () => !drawer.hidden;
  const closeDrawer = () => { drawer.hidden = true; sub && sub.destroy && sub.destroy(); sub = null; side.querySelectorAll('[data-page]').forEach((x) => x.removeAttribute('aria-current')); };
  onCleanup(() => sub && sub.destroy && sub.destroy());
  app.querySelector('[data-dclose]').addEventListener('click', closeDrawer);
  const onEsc = (e) => { if (e.key === 'Escape' && drawerOpen() && !document.querySelector('#modal.open')) { e.stopImmediatePropagation(); closeDrawer(); } };
  document.addEventListener('keydown', onEsc, true); onCleanup(() => document.removeEventListener('keydown', onEsc, true));

  side.querySelectorAll('[data-page]').forEach((btn) => btn.addEventListener('click', () => {
    const k = btn.dataset.page;
    side.classList.remove('open');
    if (k === 'board') return closeDrawer();
    closeDrawer();
    side.querySelector(`[data-page="${k}"]`).setAttribute('aria-current', 'page');
    drawer.hidden = false;
    app.querySelector('[data-dtitle]').textContent = btn.textContent.trim();
    if (k === 'tarefas') sub = mountTasks(dbody, { projectId: p.id });
    if (k === 'equipa') projectTeam(dbody, p);
    if (k === 'detalhes') { dbody.innerHTML = detailsForm(p); bindDetails(dbody, p, () => projectView(projectId, boardId)); }
  }));
}

// ---------- tarefas (todas) ----------
function tasksPage(tab) {
  app.innerHTML = `<div class="page">${header('tasks')}
    <div class="wrap page-pad">
      <div class="row between wrap-gap"><h1 class="h1">Tarefas</h1>
        <div class="seg dark" role="tablist">
          <button type="button" role="tab" aria-selected="${tab === 'minhas'}" data-t="minhas">As minhas</button>
          ${isStaff() ? `<button type="button" role="tab" aria-selected="${tab === 'todas'}" data-t="todas">Todas</button>` : ''}
        </div></div>
      <div class="panel" data-list></div>
    </div></div>`;
  bindHeader(app);
  app.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => go('#/tarefas/' + b.dataset.t)));
  const t = mountTasks(app.querySelector('[data-list]'), { mine: tab === 'minhas' });
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
      <section class="panel"><h2 class="h3">Convites</h2><div data-invites class="muted">A carregar…</div></section>
    </div></div>`;
  bindHeader(app);
  app.querySelector('[data-newuser]').addEventListener('click', newUser);
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
    <td class="row end"><button type="button" class="link-btn" data-pw="${u.id}">Palavra-passe</button>${u.id !== state.user.id ? `<button type="button" class="icon-btn" data-deluser="${u.id}" aria-label="Apagar a conta de ${esc(u.display_name)}">${ICON.trash}</button>` : ''}</td>
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
