import './style.css';
import { daysUntil } from './lib.js';
import { loadHidden, hideProject, unhideProject } from './lib.js';
import { IS_STUDIO, sb, BUCKET, state, esc, $, loadProfile, isStaff, isAdmin, toast, modal, confirmBox, ICON, LOGO, KINDS, ROLES, phaseOf, greeting, initials, signedUrls, uploadImage, callFn, authPw, MIN_PW, fmtDate, dueInfo, registerSW, isInstalled, installApp, BASE, PROJECT_COLS, hasPerm } from './lib.js';
import { renderAuth } from './auth.js';
import { activityButton, bindActivity, activityPage } from './activity.js';
import { mountBoard } from './board.js';
import { visField, bindVis, readVis } from './vis.js';
import { onWrite } from './undo.js';
import { mountTasks, loadPeople, clearPeopleCache } from './tasks.js';
import { TOOL_KINDS, tableTool, timelineTool, tableTemplate } from './tools.js';
import { isFolder, loadChildren, rollup, childrenSection, budgetChildrenPanel } from './folders.js';
import { mountTaskCenter } from './taskcenter.js';
import { clipPage, CLIP_PAGES, mediaTool } from './music.js';
import { mountSituation } from './overview.js';
import { clearFullscreen } from './layout.js';
import { newLightmapData } from './lmdata.js';
// páginas pesadas só carregam quando são abertas (o site arranca mais depressa)
const lazy = {
  finance: () => import('./finance.js'), lightmap: () => import('./lightmap.js'), lmhub: () => import('./lmhub.js'), wardrobe: () => import('./wardrobe.js'), gear: () => import('./gear.js'),
  props: () => import('./props.js'), budget: () => import('./budget.js'), shotlist: () => import('./shotlist.js'),
  shot: () => import('./shot.js'), marketing: () => import('./marketing.js'), callsheet: () => import('./callsheet.js'), transport: () => import('./transport.js'),
};
// pré-carrega em segundo plano depois de o site abrir, para a primeira abertura também ser rápida
setTimeout(() => { const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500)); idle(() => Object.values(lazy).forEach((f) => f().catch(() => {}))); }, 4000);
import { joinProject, leaveProject, lockPage, boardPresence, onPresence, whoLabel } from './presence.js';
import { budgetWhoChip, budgetAccessPanel, globalPermsPanel } from './perms.js';
import { MODULES, TEMPLATES, modulesOf, hasMod, scriptMode, modLabel, modPath, modulesModal, autoModules, ensureModules } from './modules.js';
import { FICTION_PAGES, FICTION_DEPTS, fictionPage, fictionStats } from './fiction.js';

const app = $('#app');
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);
function teardown() { clearFullscreen(); cleanup.forEach((f) => { try { f(); } catch { /* nada */ } }); cleanup = []; }

registerSW();
// a roda do rato não muda valores sem querer nos campos numéricos
document.addEventListener('wheel', (e) => { const a = document.activeElement; if (a?.type === 'number' && e.target === a) a.blur(); }, { passive: true });

// ---------- arranque ----------
let recovering = false;
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { recovering = true; teardown(); renderAuth(app, { onDone: () => { recovering = false; boot(); } }).show('newpw'); }
  if (ev === 'SIGNED_OUT') { teardown(); boot(); }
});

async function boot() {
  if (recovering) return;
  await loadProfile();
  if (IS_STUDIO) import('./appearance.js').then((a) => a.syncLookFromProfile());
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
  state.ctx = { project: null };
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
  leaveProject();
  if (parts[0] === 'tarefas') return tasksPage();
  if (parts[0] === 'equipamento') return isStaff() ? gearDbPage() : go('#/');
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
    <div class="topbar-r">
    ${activityButton()}
    ${IS_STUDIO ? `<button type="button" class="icon-btn look-btn" data-look aria-label="Aparência" title="Aparência">${ICON.palette}</button>` : ''}
    <button type="button" class="acct" data-acct aria-label="Conta e definições">
      <span class="acct-role">${esc(ROLES[p.role])}</span>
      <span class="avatar" style="--c:${esc(p.color)}">${esc(initials(p.display_name))}</span>
    </button>
    </div>
  </header>`;
}
function bindHeader(root) {
  root.querySelector('[data-acct]')?.addEventListener('click', accountMenu);
  bindActivity(root);
  if (IS_STUDIO) root.querySelector('[data-look]')?.addEventListener('click', async () => (await import('./appearance.js')).appearanceMenu());
}
function accountMenu() {
  const p = state.profile;
  const m = modal(`
    <div class="acct-card"><span class="avatar lg" style="--c:${esc(p.color)}">${esc(initials(p.display_name))}</span>
      <div><strong>${esc(p.display_name)}</strong><div class="muted">${esc(p.username ? '@' + p.username : p.email)} · ${esc(ROLES[p.role])}</div></div></div>
    <div class="menu-list">
      <button type="button" data-a="name">${ICON.team} O meu nome e telefone</button>
      <button type="button" data-a="pw">${ICON.info} Mudar palavra-passe</button>
      <a href="${BASE}tasks/" target="_blank" rel="noopener">${ICON.task} Abrir a app de tarefas (telemóvel)</a>
      ${isInstalled() ? '' : `<button type="button" data-a="install">${ICON.open} Instalar no computador</button>`}
      <button type="button" data-a="out">${ICON.logout} Sair</button>
    </div>
    <div class="row end"><button class="btn ghost" data-close>Fechar</button></div>`);
  m.el.querySelector('[data-a=out]').addEventListener('click', async () => { m.close(); await sb.auth.signOut(); });
  m.el.querySelector('[data-a=install]')?.addEventListener('click', async () => {
    const r = await installApp(); m.close();
    if (r === 'ok') return toast('Pronto: o PØRTAL Studio ficou instalado como app.');
    if (r === 'no') return;
    const mac = /Mac/.test(navigator.platform) && !/Chrome|Edg/.test(navigator.userAgent);
    modal(`<h2>Instalar no computador</h2>
      ${mac ? `<p><b>Safari (Mac):</b> menu <b>Ficheiro › Adicionar à Dock</b>. A app fica na Dock e no Launchpad, numa janela própria.</p>` : ''}
      <p><b>Chrome ou Edge (Windows e Mac):</b> carrega no ícone de instalar à direita da barra de endereço (um ecrã com uma seta), ou no menu ⋮ › <b>Transmitir, guardar e partilhar › Instalar página como app</b>.</p>
      ${mac ? '' : `<p><b>Safari (Mac):</b> menu <b>Ficheiro › Adicionar à Dock</b>.</p>`}
      <p class="muted small">Abre numa janela própria, com ícone na barra de tarefas ou na Dock, e atualiza-se sozinha.</p>
      <div class="row end"><button type="button" class="btn primary" data-close>Percebi</button></div>`);
  });
  m.el.querySelector('[data-a=pw]').addEventListener('click', () => { m.close(); changePassword(); });
  m.el.querySelector('[data-a=name]').addEventListener('click', () => {
    m.close();
    const n = modal(`<h2>Os teus dados</h2><form class="stack"><div class="field"><label for="dn">Nome</label><input id="dn" value="${esc(p.display_name)}" required></div><div class="field"><label for="dph">Telefone</label><input id="dph" type="tel" inputmode="tel" value="${esc(p.phone || '')}"><span class="muted small">Aparece nas folhas de contactos e de serviço dos projetos onde estás.</span></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    n.el.querySelector('form').addEventListener('submit', async (e) => { e.preventDefault(); const v = n.el.querySelector('#dn').value.trim(); if (!v) return; const ph = n.el.querySelector('#dph').value.trim() || null; await sb.from('profiles').update({ display_name: v, phone: ph }).eq('id', p.id); clearPeopleCache(); p.display_name = v; p.phone = ph; n.close(); route(); });
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
            ${[['active', 'Em curso'], ['done', 'Finalizados'], ['archived', 'Arquivo'], ['hidden', 'Escondidos'], ...(staff ? [['trash', 'Reciclagem']] : [])].map(([k, v]) => `<button type="button" role="tab" aria-selected="${homeState.tab === k}" data-tab="${k}">${v}</button>`).join('')}
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
            <a href="#/equipamento">${ICON.camera || ICON.board}<span><strong>Base de dados de equipamento</strong><small>Câmaras, luzes, tripés e o resto</small></span>${ICON.chev}</a>
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
  app.querySelector('[data-new]')?.addEventListener('click', () => newProject());

  const [{ data: projects }, { data: tasks }, { data: myMem }, hidden] = await Promise.all([
    sb.from('projects').select(PROJECT_COLS).eq('is_central', false).order('updated_at', { ascending: false }),
    sb.from('tasks').select('id, project_id, title, status, due, assignee_id'),
    sb.from('project_members').select('project_id').eq('user_id', state.user.id),
    loadHidden(),
  ]);
  // "atribuídos a mim": sou membro do projeto ou tenho tarefas lá
  const mineSet = new Set([...(myMem || []).map((m) => m.project_id), ...(tasks || []).filter((t) => t.assignee_id === state.user.id).map((t) => t.project_id), ...(projects || []).filter((x) => x.lead_id === state.user.id || x.manager_id === state.user.id).map((x) => x.id)]);
  const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const sorters = { recent: (a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''), az: (a, b) => a.name.localeCompare(b.name, 'pt'), due: (a, b) => (a.ends_on || '9999').localeCompare(b.ends_on || '9999') || a.name.localeCompare(b.name, 'pt') };
  // projetos dentro de uma pasta (ex.: videoclipes de um álbum) aparecem dentro dela; numa pesquisa aparecem soltos
  const byId = new Map((projects || []).map((p) => [p.id, p]));
  const inFolder = (p) => { const par = p.parent_id && byId.get(p.parent_id); return !!par && !par.deleted_at && (!homeState.mine || mineSet.has(par.id)); };
  const kidsOf = (id) => (projects || []).filter((k) => k.parent_id === id && !k.deleted_at && !hidden.has(k.id));
  // projetos que tirei da minha lista: só desaparecem para mim (os outros continuam a vê-los)
  const isHidden = (p) => hidden.has(p.id) || (p.parent_id && hidden.has(p.parent_id));
  const pick = () => (projects || []).filter((p) => (homeState.tab === 'trash' ? !!p.deleted_at && !(p.parent_id && byId.get(p.parent_id)?.deleted_at === p.deleted_at) : homeState.tab === 'hidden' ? !p.deleted_at && hidden.has(p.id) : !p.deleted_at && !isHidden(p) && p.status === homeState.tab && (homeState.q || !inFolder(p))) && (!homeState.mine || mineSet.has(p.id) || kidsOf(p.id).some((k) => mineSet.has(k.id))) && (!homeState.q || norm(`${p.name} ${p.client} ${byId.get(p.parent_id)?.name || ''}`).includes(norm(homeState.q)))).sort(sorters[homeState.sort]);
  let list = pick();
  const open = (pid) => (tasks || []).filter((t) => t.project_id === pid && t.status !== 'done').length;
  const covers = await signedUrls((projects || []).map((p) => p.cover_path));
  const mineOpen = (tasks || []).filter((t) => t.assignee_id === state.user.id && t.status !== 'done');
  const hero = app.querySelector('[data-hero]');
  if (hero) hero.textContent = staff ? `Tens ${mineOpen.length} ${mineOpen.length === 1 ? 'tarefa aberta' : 'tarefas abertas'} em ${new Set(mineOpen.map((t) => t.project_id)).size} projetos.` : `Tens acesso a ${(projects || []).length} ${projects?.length === 1 ? 'projeto' : 'projetos'}.`;

  const grid = app.querySelector('[data-grid]');
  const people = staff ? await loadPeople() : [];
  const drawTrash = () => {
    const DAY = 86400000;
    grid.innerHTML = list.length ? list.map((p) => {
      const left = Math.max(0, Math.ceil((new Date(p.deleted_at).getTime() + 10 * DAY - Date.now()) / DAY));
      const who = people.find((x) => x.id === p.deleted_by);
      return `<article class="proj-card trash-card">
        <div class="proj-cover" style="background:${coverColor(p.id)}"><div class="grain-layer soft" aria-hidden="true"></div><span class="tag dark">${esc(KINDS[p.kind] || p.kind)}</span><span class="trash-left">${left === 0 ? 'Apaga-se hoje' : `Apaga-se em ${left} ${left === 1 ? 'dia' : 'dias'}`}</span></div>
        <div class="proj-body">
          <div><div class="proj-name">${esc(p.name)}</div><div class="muted small">${esc(p.client || '—')} · apagado a ${fmtDate(p.deleted_at)}${who ? ` por ${esc(who.display_name)}` : ''}</div></div>
          <div class="row wrap-gap"><button type="button" class="btn primary" data-restore="${p.id}">${ICON.refresh} Recuperar</button>${isAdmin() ? `<button type="button" class="btn ghost danger-text" data-purge="${p.id}">${ICON.trash} Apagar já</button>` : ''}</div>
        </div></article>`;
    }).join('') : '<p class="empty-note">A reciclagem está vazia. Os projetos apagados ficam aqui 10 dias antes de desaparecerem de vez.</p>';
    grid.querySelectorAll('[data-restore]').forEach((b) => b.addEventListener('click', async () => {
      const p = list.find((x) => x.id === b.dataset.restore);
      const { error } = await sb.from('projects').update({ deleted_at: null, deleted_by: null }).eq('id', p.id);
      if (error) return toast(error.message);
      // os projetos que foram para a reciclagem com a pasta voltam com ela
      const inside = (projects || []).filter((k) => k.parent_id === p.id && k.deleted_at === p.deleted_at);
      if (inside.length) { await sb.from('projects').update({ deleted_at: null, deleted_by: null }).in('id', inside.map((k) => k.id)); inside.forEach((k) => (k.deleted_at = null)); }
      toast(`"${p.name}" voltou para os projetos.`); p.deleted_at = null; drawGrid();
    }));
    grid.querySelectorAll('[data-purge]').forEach((b) => b.addEventListener('click', async () => {
      const p = list.find((x) => x.id === b.dataset.purge);
      if (!(await confirmBox(`Apagar "${p.name}" de vez, com todos os boards, tarefas e ficheiros? Isto não dá para desfazer.`, 'Apagar de vez'))) return;
      toast('A apagar os ficheiros…');
      const inside = (projects || []).filter((k) => k.parent_id === p.id && k.deleted_at === p.deleted_at);
      for (const k of inside) { await purgeFiles(k.id); await sb.from('projects').delete().eq('id', k.id); projects.splice(projects.indexOf(k), 1); }
      await purgeFiles(p.id);
      const { error } = await sb.from('projects').delete().eq('id', p.id);
      if (error) return toast(error.message);
      projects.splice(projects.indexOf(p), 1); toast('Apagado de vez.'); drawGrid();
    }));
  };
  const drawHidden = () => {
    grid.innerHTML = list.length ? list.map((p) => `<article class="proj-card trash-card">
        <div class="proj-cover" style="${covers[p.cover_path] ? `background-image:url('${esc(covers[p.cover_path])}')` : `background:${coverColor(p.id)}`}"><div class="grain-layer soft" aria-hidden="true"></div><span class="tag dark">${esc(KINDS[p.kind] || p.kind)}</span></div>
        <div class="proj-body">
          <div><div class="proj-name">${esc(p.name)}</div><div class="muted small">${esc(p.client || '—')} · tiraste da tua lista a ${fmtDate(hidden.get(p.id))}</div></div>
          <div class="row wrap-gap"><button type="button" class="btn primary" data-unhide="${p.id}">${ICON.eye} Voltar a mostrar</button><a class="btn ghost" href="#/p/${p.id}">Abrir</a></div>
        </div></article>`).join('') : '<p class="empty-note">Não tens projetos escondidos. Quando tiras um projeto da tua lista, ele fica aqui — e continua a existir para o resto da equipa.</p>';
    grid.querySelectorAll('[data-unhide]').forEach((b) => b.addEventListener('click', async () => {
      if (!(await unhideProject(b.dataset.unhide))) return;
      hidden.delete(b.dataset.unhide); toast('Voltou para a tua lista.'); drawGrid();
    }));
  };
  const drawGrid = () => { list = pick(); if (homeState.tab === 'trash') return drawTrash(); if (homeState.tab === 'hidden') return drawHidden(); grid.innerHTML = list.length ? list.map((p) => {
    const ph = phaseOf(p); const kids = kidsOf(p.id); const n = open(p.id) + kids.reduce((a, k) => a + open(k.id), 0);
    const par = p.parent_id && byId.get(p.parent_id);
    return `<article class="proj-card ${p.kind === 'album' ? 'is-folder' : ''}">
      <a href="#/p/${p.id}" class="proj-link" aria-label="Abrir ${esc(p.name)}"></a>
      <div class="proj-cover" style="${covers[p.cover_path] ? `background-image:url('${esc(covers[p.cover_path])}')` : `background:${coverColor(p.id)}`}">
        <div class="grain-layer soft" aria-hidden="true"></div>
        <span class="tag dark">${esc(KINDS[p.kind] || p.kind)}</span>
        <span class="on-cover-acts"><button type="button" class="icon-btn on-cover" data-hidep="${p.id}" title="Tirar da minha lista (os outros continuam a vê-lo)" aria-label="Tirar ${esc(p.name)} da minha lista">${ICON.hide}</button>${staff ? `<button type="button" class="icon-btn on-cover" data-more="${p.id}" aria-label="Opções de ${esc(p.name)}">${ICON.dots}</button>` : ''}</span>
      </div>
      <div class="proj-body">
        <div><div class="proj-name">${p.kind === 'album' ? `<span class="fold-ic">${ICON.board}</span>` : ''}${esc(p.name)}</div><div class="muted small">${esc(p.client || '—')}${par ? ` · em ${esc(par.name)}` : ''}</div></div>
        ${p.kind === 'album' ? `<div class="fold-kids">${kids.length ? kids.slice(0, 4).map((k) => `<span>${esc(k.name)}</span>`).join('') + (kids.length > 4 ? `<span>+${kids.length - 4}</span>` : '') : '<span class="muted">Sem projetos lá dentro</span>'}</div>` : ''}
        <div class="proj-prog"><div class="row between small muted"><span>${esc(ph.label || 'Sem datas')}</span><span>${n} ${n === 1 ? 'tarefa aberta' : 'tarefas abertas'}</span></div>
        <div class="bar"><i style="width:${Math.round(ph.pct * 100)}%"></i></div></div>
      </div>
    </article>`;
  }).join('') : `<p class="empty-note">${homeState.q ? `Nenhum projeto com "${esc(homeState.q)}".` : homeState.mine ? 'Não estás atribuído a nenhum projeto aqui.' : homeState.tab === 'active' ? (staff ? 'Ainda não há projetos em curso. Cria o primeiro em "Novo projeto".' : 'Ainda não foste convidado para nenhum projeto em curso.') : 'Nada aqui.'}</p>`;
  grid.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); const p = list.find((x) => x.id === b.dataset.more); projectDetailsModal(p, homePage); }));
  grid.querySelectorAll('[data-hidep]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault(); const p = list.find((x) => x.id === b.dataset.hidep);
    if (!(await hideProject(p.id))) return;
    hidden.set(p.id, new Date().toISOString());
    toast(`"${p.name}" saiu da tua lista. Para o resto da equipa continua igual; voltas a mostrá-lo em "Escondidos".`); drawGrid();
  })); };
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

// todos os ficheiros de um projeto (fotos, música, guiões…), pasta a pasta
async function purgeFiles(pid) {
  const all = [];
  const walk = async (prefix, depth = 0) => {
    const { data } = await sb.storage.from(BUCKET).list(prefix, { limit: 1000 });
    for (const it of data || []) { const path = `${prefix}/${it.name}`; if (it.id) all.push(path); else if (depth < 4) await walk(path, depth + 1); }
  };
  await walk(pid);
  for (let i = 0; i < all.length; i += 100) await sb.storage.from(BUCKET).remove(all.slice(i, i + 100));
}

function coverColor(id) {
  const c = ['#232A7A', '#3A2420', '#1D3A33', '#2E2E38', '#3B2F12', '#2A1F3D', '#14324A'];
  let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return c[h % c.length];
}

async function newProject(opts = {}) {
  const parent = opts.parent && opts.parent.id ? opts.parent : null;
  const { data: folders } = await sb.from('projects').select('id, name').eq('kind', 'album').is('deleted_at', null).order('name');
  const m = modal(`<h2>${parent ? `Novo projeto em ${esc(parent.name)}` : 'Novo projeto'}</h2>
    <form class="stack">
      <div class="field"><label for="pn">Nome</label><input id="pn" name="name" required></div>
      <div class="field"><label for="pc">Artista ou marca</label><input id="pc" name="client"></div>
      <div class="field"><label for="pk">Tipo</label><select id="pk" name="kind">${Object.entries(KINDS).filter(([k]) => k !== 'central' && (!parent || k !== 'album')).map(([k, v]) => `<option value="${k}" ${parent && k === 'videoclipe' ? 'selected' : ''}>${v}</option>`).join('')}</select><span class="muted small" data-foldhint hidden>Uma pasta junta vários projetos (ex.: os videoclipes de um álbum). Tem um orçamento geral, e o orçamento de cada projeto lá dentro conta para ele.</span></div>
      <div class="field" data-parentf><label for="pp">Dentro de</label><select id="pp" name="parent_id"><option value="">— nenhuma pasta —</option>${(folders || []).map((f) => `<option value="${f.id}" ${parent?.id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>
      <div class="grid2"><div class="field"><label for="ps">Começa</label><input id="ps" name="starts_on" type="date"></div><div class="field"><label for="pe">Entrega</label><input id="pe" name="ends_on" type="date"></div></div>
      <fieldset class="start-choice"><legend>Começar com</legend>
        <label class="sc-opt"><input type="radio" name="start" value="tpl" checked><span><strong>Modelo de <span data-kname></span></strong><small data-tplpages></small></span></label>
        <label class="sc-opt"><input type="radio" name="start" value="zero"><span><strong>Do zero</strong><small>Só Visão geral, Equipa e Detalhes. As outras páginas juntas-as depois com o + ao lado do nome do projeto, ou aparecem sozinhas quando houver dados para elas.</small></span></label>
      </fieldset>
      ${hasPerm('budget') ? `<div class="field"><label for="pv">Orçamento (€, opcional)</label><input id="pv" name="value" type="number" step="0.01" min="0" inputmode="decimal"><span class="muted small">${ICON.lock} Só quem tem acesso ao orçamento vê este valor.</span></div>` : ''}
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div>
    </form>`);
  const syncTpl = () => { const k = m.el.querySelector('#pk').value; m.el.querySelector('[data-kname]').textContent = (KINDS[k] || k).toLowerCase(); m.el.querySelector('[data-tplpages]').textContent = (TEMPLATES[k] || TEMPLATES.default).map((x) => (x === 'elenco' && k === 'ficcao' ? MODULES.elenco.scriptLabel : MODULES[x].label)).join(' · '); };
  const syncFold = () => { const k = m.el.querySelector('#pk').value; m.el.querySelector('[data-parentf]').hidden = k === 'album' || !(folders || []).length; m.el.querySelector('[data-foldhint]').hidden = k !== 'album'; };
  m.el.querySelector('#pk').addEventListener('change', () => { syncTpl(); syncFold(); }); syncTpl(); syncFold();
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const modules = { list: f.start === 'zero' ? [] : [...(TEMPLATES[f.kind] || TEMPLATES.default)], removed: [] };
    const { data, error } = await sb.from('projects').insert({ name: f.name.trim(), client: f.client.trim(), kind: f.kind, parent_id: f.kind !== 'album' && f.parent_id ? f.parent_id : null, starts_on: f.starts_on || null, ends_on: f.ends_on || null, modules, ...(f.kind === 'ficcao' ? { departments: FICTION_DEPTS } : {}) }).select(PROJECT_COLS).single();
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
      <div class="field"><label for="dlead">Líder do projeto</label><select id="dlead" name="lead_id" data-person="${esc(p.lead_id || '')}"><option value="">— ninguém —</option></select></div>
      <div class="field"><label for="dman">Encarregue do projeto</label><select id="dman" name="manager_id" data-person="${esc(p.manager_id || '')}"><option value="">— ninguém —</option></select></div>
      ${p._folders && p._folders.length ? `<div class="field"><label for="dpar">Dentro da pasta</label><select id="dpar" name="parent_id"><option value="">— nenhuma —</option>${p._folders.map((f) => `<option value="${f.id}" ${f.id === p.parent_id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>` : ''}
      ${p.canBudget ? `<div class="field"><label for="dv">Orçamento (€) <span class="muted small">${ICON.lock} privado</span></label><input id="dv" name="value" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.value ?? '')}"></div>` : ''}
    </div>
    <div class="field"><span class="label">Capa</span><div class="row"><button type="button" class="btn ghost" data-cover>${ICON.image} Escolher imagem</button>${p.cover_path ? '<button type="button" class="btn ghost" data-nocover>Tirar capa</button>' : ''}</div></div>`}
    <fieldset class="depts"><legend>Departamentos e cores</legend>
      ${(p.departments || []).map((d, i) => `<div class="dept-row"><input type="color" value="${esc(d.color)}" data-dcolor="${i}" aria-label="Cor de ${esc(d.name)}"><input value="${esc(d.name)}" data-dname="${i}" aria-label="Nome do departamento"><button type="button" class="icon-btn" data-drm="${i}" aria-label="Tirar ${esc(d.name)}">${ICON.close}</button></div>`).join('')}
      <button type="button" class="link-btn" data-dadd>${ICON.plus} Departamento</button>
    </fieldset>
    <div class="row between">
      <span class="row wrap-gap">${!p.is_central ? `<button type="button" class="btn ghost" data-hidep title="Os outros continuam a vê-lo">${ICON.hide} Tirar da minha lista</button>` : ''}${isAdmin() && !p.is_central ? `<button type="button" class="btn ghost danger-text" data-delp title="Vai para a reciclagem para toda a gente">${ICON.trash} Apagar para todos</button>` : ''}</span>
      <button class="btn primary">Guardar</button>
    </div>
  </form>`;
}
function bindDetails(root, p, after) {
  const pSel = root.querySelectorAll('select[data-person]');
  if (pSel.length) loadPeople().then((people) => pSel.forEach((sel) => { const cur = sel.dataset.person; sel.insertAdjacentHTML('beforeend', people.filter((x) => x.role !== 'guest' || x.id === cur).map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.display_name)}</option>`).join('')); }));
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
  form.querySelector('[data-hidep]')?.addEventListener('click', async () => {
    if (!(await hideProject(p.id))) return;
    document.querySelector('#modal')?.replaceChildren();
    toast(`"${p.name}" saiu da tua lista. Para o resto da equipa continua igual; voltas a mostrá-lo em "Escondidos", no início.`); go('#/'); if (location.hash === '#/' || !location.hash) homePage();
  });
  form.querySelector('[data-delp]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar "${p.name}"? Vai para a reciclagem e só é apagado de vez daqui a 10 dias. Até lá, qualquer pessoa da equipa o pode recuperar.`, 'Mandar para a reciclagem'))) return;
    const { error } = await sb.rpc('trash_project', { p: p.id });
    if (error) return toast(error.message);
    document.querySelector('#modal')?.replaceChildren();
    toast('Foi para a reciclagem. Podes recuperá-lo durante 10 dias, no separador "Reciclagem".'); homeState.tab = 'active'; go('#/'); if (location.hash === '#/' || !location.hash) homePage();
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const patch = { departments: depts.filter((d) => d.name.trim()), updated_at: new Date().toISOString() };
    if (!p.is_central) Object.assign(patch, { name: f.name.trim(), client: f.client.trim(), kind: f.kind, status: f.status, starts_on: f.starts_on || null, ends_on: f.ends_on || null, lead_id: f.lead_id || null, manager_id: f.manager_id || null });
    if ('parent_id' in f) patch.parent_id = f.kind === 'album' ? null : (f.parent_id || null);
    const { data, error } = await sb.from('projects').update(patch).eq('id', p.id).select(PROJECT_COLS).single();
    if (error) return toast(error.message);
    if (p.canBudget && 'value' in f) { const v = f.value === '' ? null : Number(f.value); const r = await sb.from('project_budgets').upsert({ project_id: p.id, value: v, updated_at: new Date().toISOString() }, { onConflict: 'project_id' }).select('updated_at'); if (r.error) return toast(r.error.message); data.value = v; p._budgetAt = r.data?.[0]?.updated_at || p._budgetAt; }
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
    sb.from('project_members').select('user_id, added_at, depts, job, phone, email').eq('project_id', p.id),
    loadPeople(),
    isStaff() ? sb.from('invites').select('id, email, created_at, expires_at, used_at').eq('project_id', p.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const staff = people.filter((x) => x.role !== 'guest');
  const guests = people.filter((x) => x.role === 'guest' && (members || []).some((m) => m.user_id === x.id));
  const inv = (invites || []);
  const istate = (i) => (i.used_at ? `Usado a ${fmtDate(i.used_at)}` : new Date(i.expires_at) < new Date() ? 'Expirou' : `Válido até ${fmtDate(i.expires_at)}`);
  root.innerHTML = `
    <section class="stack">
      ${p.is_central ? `<h3 class="h3">Equipa da Grain</h3><p class="muted small">Todos os membros e administradores têm acesso à Central.</p>` : ''}
      ${p.is_central ? `<ul class="people">${staff.map((x) => `<li><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}</span><span class="muted small">${esc(ROLES[x.role])}</span></li>`).join('')}</ul>` : '<div data-crew></div>'}
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
  const crewEl = root.querySelector('[data-crew]'); if (crewEl) crewPanel(crewEl, p, people, members || [], () => projectTeam(root, p));
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

// ---------- equipa do projeto por departamento ----------
// Pessoas da Grain (project_members) e pessoas sem conta (project_crew), cada uma com função e departamentos.
async function crewPanel(el, p, people, members, reload) {
  const { data: crewRows } = await sb.from('project_crew').select('*').eq('project_id', p.id).order('created_at');
  const depts = p.departments || [];
  const byId = new Map(people.map((x) => [x.id, x]));
  const list = [
    ...members.filter((m) => byId.has(m.user_id) && byId.get(m.user_id).role !== 'guest').map((m) => { const x = byId.get(m.user_id); const phone = m.phone || x.phone || ''; return { t: 'm', id: m.user_id, name: x.display_name, color: x.color, job: m.job || '', depts: m.depts || [], sub: [phone, m.email].filter(Boolean).join(' · ') || ROLES[x.role], phone, email: m.email || '' }; }),
    ...(crewRows || []).map((c) => ({ t: 'c', id: c.id, name: c.name, color: '#5A5A66', job: c.job || '', depts: c.depts || [], sub: [c.phone, c.email].filter(Boolean).join(' · ') || 'sem conta no studio', email: c.email, phone: c.phone })),
  ];
  const canEdit = isStaff();
  const dchip = (id) => { const d = depts.find((x) => x.id === id); return d ? `<span class="dchip" style="--dc:${esc(d.color)}">${esc(d.name)}</span>` : ''; };
  const row = (x) => `<li class="crew-row"><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.name))}</span>
    <span class="crew-n"><b>${esc(x.name)}</b><small class="muted">${esc(x.job || x.sub || '')}${x.job && x.sub ? ` · ${esc(x.sub)}` : ''}</small></span>
    <span class="crew-d">${x.depts.map(dchip).join('')}</span>
    ${canEdit ? `<span class="crew-a"><button type="button" class="link-btn" data-cedit="${x.t}:${x.id}">Editar</button><button type="button" class="link-btn danger-text" data-crm="${x.t}:${x.id}">Tirar</button></span>` : ''}</li>`;
  const groups = depts.map((d) => ({ d, xs: list.filter((x) => x.depts.includes(d.id)) }));
  const none = list.filter((x) => !x.depts.some((id) => depts.some((d) => d.id === id)));
  el.innerHTML = `<div class="row between wrap-gap"><div><h3 class="h3">Equipa do projeto</h3><p class="muted small">Quem trabalha neste projeto, por departamento. Todos os membros da Grain continuam a ter acesso.</p></div>${canEdit ? `<button type="button" class="btn primary" data-cadd>${ICON.plus} Adicionar pessoa</button>` : ''}</div>
    ${groups.map((g) => `<div class="crew-g"><div class="crew-hrow"><h4 class="crew-h"><i style="background:${esc(g.d.color)}"></i>${esc(g.d.name)} <span class="muted">${g.xs.length}</span></h4>${canEdit ? `<button type="button" class="link-btn" data-cadd-d="${esc(g.d.id)}">${ICON.plus} Juntar a ${esc(g.d.name)}</button>` : ''}</div>${g.xs.length ? `<ul class="crew">${g.xs.map(row).join('')}</ul>` : '<p class="crew-empty muted small">Ninguém neste departamento.</p>'}</div>`).join('')}
    ${none.length ? `<div class="crew-g"><div class="crew-hrow"><h4 class="crew-h"><i></i>Sem departamento <span class="muted">${none.length}</span></h4></div><ul class="crew">${none.map(row).join('')}</ul></div>` : ''}
    ${!list.length && !depts.length ? `<p class="empty-note">Ainda ninguém na equipa.${canEdit ? ' Usa “Adicionar pessoa”.' : ''}</p>` : ''}`;
  const form = (x, preDept) => {
    const isNew = !x; const inProj = (id) => members.find((m) => m.user_id === id);
    const free = people.filter((y) => y.role !== 'guest');
    const m = modal(`<h2>${isNew ? 'Adicionar pessoa' : esc(x.name)}</h2><form class="stack" data-cf>
      ${isNew ? `<div class="seg dark" role="tablist"><button type="button" role="tab" aria-selected="true" data-ct="m">Da Grain</button><button type="button" role="tab" aria-selected="false" data-ct="c">Sem conta</button></div>
        <div class="field" data-for="m"><label for="cu">Pessoa</label><select id="cu" name="user_id">${free.map((y) => `<option value="${y.id}">${esc(y.display_name)}${inProj(y.id) ? ' — já está no projeto' : ''}</option>`).join('')}</select></div>
        <div data-for="c" hidden class="field"><label for="cn2">Nome</label><input id="cn2" name="name"></div>`
        : x.t === 'c' ? `<div class="field"><label for="cn2">Nome</label><input id="cn2" name="name" value="${esc(x.name)}" required></div>` : ''}
      <div class="grid2"><div class="field"><label for="cp">Telefone</label><input id="cp" name="phone" type="tel" inputmode="tel" value="${esc(x?.phone || '')}" placeholder="912 345 678"></div><div class="field"><label for="ce">Email</label><input id="ce" name="email" type="email" value="${esc(x?.email || '')}"></div></div>
      <p class="muted small">O contacto fica associado a esta pessoa: aparece sozinho na folha de contactos, na folha de serviço e no mapa de transportes.</p>
      <div class="field"><label for="cj">Função</label><input id="cj" name="job" value="${esc(x?.job || '')}" placeholder="Ex.: Gaffer, 1.º AC, Produtora" list="crew-jobs"></div>
      <fieldset class="dpick"><legend>Departamentos</legend>${depts.length ? depts.map((d) => `<label><input type="checkbox" name="dept" value="${esc(d.id)}" ${x?.depts.includes(d.id) || (isNew && preDept === d.id) ? 'checked' : ''}><span style="--dc:${esc(d.color)}">${esc(d.name)}</span></label>`).join('') : '<p class="muted small">Este projeto ainda não tem departamentos (Detalhes → Departamentos e cores).</p>'}</fieldset>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">${isNew ? 'Adicionar' : 'Guardar'}</button></div></form>
      <datalist id="crew-jobs">${['Realização', 'Produção', 'Direção de fotografia', '1.º assistente de câmara', '2.º assistente de câmara', 'Gaffer', 'Eletricista', 'Maquinista', 'Direção de arte', 'Adereços', 'Guarda-roupa', 'Cabelos e maquilhagem', 'Som direto', 'Montagem', 'Cor', 'Assistente de produção', 'Making of'].map((j) => `<option value="${j}">`).join('')}</datalist>`, { wide: true });
    let tab = 'm';
    m.el.querySelectorAll('[data-ct]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.ct; m.el.querySelectorAll('[data-ct]').forEach((y) => y.setAttribute('aria-selected', y === b)); m.el.querySelectorAll('[data-for]').forEach((y) => { y.hidden = y.dataset.for !== tab; }); }));
    m.el.querySelector('[data-cf]').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target); const dsel = fd.getAll('dept'); const job = (fd.get('job') || '').trim() || null;
      const phone = (fd.get('phone') || '').trim() || null; const email = (fd.get('email') || '').trim() || null;
      let r;
      if (isNew && tab === 'm') {
        const uid = fd.get('user_id'); if (!uid) return toast('Escolhe uma pessoa.');
        const cur = inProj(uid);
        // quem já está no projeto: junta os departamentos novos aos que já tinha
        r = cur ? await sb.from('project_members').update({ depts: [...new Set([...(cur.depts || []), ...dsel])], job: job || cur.job || null, phone: phone || cur.phone || null, email: email || cur.email || null }).eq('project_id', p.id).eq('user_id', uid)
          : await sb.from('project_members').insert({ project_id: p.id, user_id: uid, depts: dsel, job, phone, email });
      }
      else if (isNew) { const name = (fd.get('name') || '').trim(); if (!name) return toast('Escreve o nome.'); r = await sb.from('project_crew').insert({ project_id: p.id, name, email, phone, depts: dsel, job }); }
      else if (x.t === 'm') r = await sb.from('project_members').update({ depts: dsel, job, phone, email }).eq('project_id', p.id).eq('user_id', x.id);
      else r = await sb.from('project_crew').update({ name: (fd.get('name') || '').trim() || x.name, email, phone, depts: dsel, job }).eq('id', x.id);
      if (r.error) return toast(r.error.message);
      m.close(); toast(isNew ? 'Adicionado à equipa.' : 'Guardado.'); reload();
    });
  };
  const find = (k) => { const [t, id] = k.split(':'); return list.find((x) => x.t === t && x.id === id); };
  el.querySelector('[data-cadd]')?.addEventListener('click', () => form(null));
  el.querySelectorAll('[data-cadd-d]').forEach((b) => b.addEventListener('click', () => form(null, b.dataset.caddD)));
  el.querySelectorAll('[data-cedit]').forEach((b) => b.addEventListener('click', () => form(find(b.dataset.cedit))));
  el.querySelectorAll('[data-crm]').forEach((b) => b.addEventListener('click', async () => {
    const x = find(b.dataset.crm); if (!(await confirmBox(`Tirar ${x.name} da equipa deste projeto?`, 'Tirar'))) return;
    const r = x.t === 'm' ? await sb.from('project_members').delete().eq('project_id', p.id).eq('user_id', x.id) : await sb.from('project_crew').delete().eq('id', x.id);
    if (r.error) return toast(r.error.message); reload();
  }));
}

// ---------- projeto: página com ferramentas; os boards criam-se lá dentro ----------
const projBase = (p) => (p.is_central ? '#/central' : `#/p/${p.id}`);
const toolHref = (p, b) => `${projBase(p)}/${(b.kind || 'board') === 'board' ? 'b' : 'f'}/${b.id}`;

// projetos já abertos ficam em memória 60 s: mudar de página dentro do projeto não volta a pedir tudo.
// Qualquer gravação nas tabelas do projeto apaga esta memória; a página do orçamento pede sempre de novo.
const projCache = new Map();
onWrite((t) => { if (['projects', 'project_budgets', 'boards', 'scripts', 'budget_access', 'project_members', 'community_members', 'communities'].includes(t)) projCache.clear(); });
async function loadProject(id, { fresh = false } = {}) {
  const c = projCache.get(id);
  if (!fresh && c && Date.now() - c.t < 60000) {
    const p = c.p;
    setCtx({ comm: p.community_id ? commById(p.community_id) : null, project: p });
    return p;
  }
  const p = await loadProjectNow(id);
  if (p) projCache.set(id, { t: Date.now(), p }); else projCache.delete(id);
  return p;
}
async function loadProjectNow(id) {
  // tudo de uma vez (antes eram 4 idas à base de dados, uma atrás da outra)
  const [{ data: p }, { data: fin }, { data: grant }, { count: nScripts }, { data: boards }] = await Promise.all([
    sb.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle(),
    // o orçamento só chega a quem tem acesso (a base de dados devolve vazio aos outros)
    sb.from('project_budgets').select('value, budget, updated_at, approved_at').eq('project_id', id).maybeSingle(),
    sb.from('budget_access').select('user_id').eq('project_id', id).eq('user_id', state.user.id).maybeSingle(),
    sb.from('scripts').select('id', { count: 'exact', head: true }).eq('project_id', id).neq('kind', 'tratamento'),
    sb.from('boards').select('id, parent_id, title, group_id, position, created_at, kind, visible_to, created_by').eq('project_id', id).order('position').order('created_at'),
  ]);
  if (!p || p.deleted_at) return null;
  p._hasScript = (nScripts || 0) > 0;
  p.canBudget = !p.is_central && (hasPerm('budget') || !!grant);
  p.value = p.canBudget ? fin?.value ?? null : null;
  p.budget = p.canBudget ? fin?.budget ?? null : null;
  p._budgetAt = p.canBudget ? fin?.updated_at ?? null : null;
  p._approvedAt = p.canBudget ? fin?.approved_at ?? null : null;
  p._boards = boards || [];
  if (p.parent_id) { const { data: par } = await sb.from('projects').select('id, name, kind, deleted_at').eq('id', p.parent_id).maybeSingle(); p._parent = par && !par.deleted_at ? par : null; }
  return p;
}
function notFound() {
  app.innerHTML = `<div class="page">${header('')}<div class="wrap page-pad"><p class="empty-note">Este projeto não existe ou não tens acesso.</p><a href="#/">Voltar ao início</a></div></div>`;
  bindHeader(app);
}

// grupos de boards = departamentos do projeto (como no Studio), mais "Outros".
// Algumas ferramentas pertencem a um departamento fixo: Equipamento e mapas de luz → Imagem; Adereços → Arte.
const FIXED_DEPTS = { imagem: { name: 'Imagem', color: '#2FB67C' }, arte: { name: 'Arte', color: '#E5579B' } };
const normName = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function deptOf(p, key) { return (p.departments || []).find((d) => d.id === key || normName(d.name) === key) || null; }
// garante que o departamento existe no projeto (cria-o se faltar) e devolve o id
async function ensureDept(p, key) {
  const d = deptOf(p, key); if (d) return d.id;
  const nd = { id: key, ...FIXED_DEPTS[key] };
  const deps = [...(p.departments || []), nd];
  const { error } = await sb.from('projects').update({ departments: deps }).eq('id', p.id);
  if (error) { toast(error.message); return key; }
  p.departments = deps; return key;
}
function boardGroups(p) {
  // os mapas de luz não aparecem um a um: ficam todos na página "Mapas de luz" do departamento Imagem
  const top = p._boards.filter((b) => !b.parent_id && b.kind !== 'mkt' && b.kind !== 'wrd' && b.kind !== 'lightmap');
  const hasMaps = p._boards.some((b) => b.kind === 'lightmap');
  const groups = (p.departments || []).map((d) => ({ ...d, boards: top.filter((b) => b.group_id === d.id), pages: [] }));
  const need = (key, mod) => { if (p.is_central || !(mod === 'mapas' ? hasMaps || ['equipamento', 'storyboard', 'shotlist'].some((k) => hasMod(p, k)) : hasMod(p, mod))) return; let g = groups.find((x) => x.id === (deptOf(p, key)?.id || key)); if (!g) { g = { id: key, ...FIXED_DEPTS[key], boards: [], pages: [], virtual: true }; groups.push(g); } g.pages.push(mod); };
  need('imagem', 'equipamento'); need('imagem', 'mapas'); need('arte', 'aderecos'); need('arte', 'figurino');
  const known = new Set(groups.map((g) => g.id));
  const other = top.filter((b) => !b.group_id || !known.has(b.group_id));
  if (other.length) groups.push({ id: '', name: 'Outros', color: '#8A8A99', boards: other, pages: [] });
  return groups;
}
// páginas fixas dentro de um departamento (módulos e a página dos mapas de luz)
const pageMeta = (k) => (k === 'mapas' ? { label: 'Mapas de luz', icon: 'bulb' } : MODULES[k]);

function projectNav(p, active) {
  const base = projBase(p);
  navState.p = p; navState.active = active;
  const mods = p.is_central ? [['tarefas', 'Tarefas', ICON.task]] : modulesOf(p).filter((k) => (k !== 'orcamento' || p.canBudget) && k !== 'equipamento' && k !== 'aderecos' && k !== 'figurino').map((k) => [modPath(p, k), modLabel(p, k), ICON[MODULES[k].icon]]);
  const pages = [['geral', 'Visão geral', ICON.home], ...(p.is_central && isStaff() ? [['financas', 'Finanças', ICON.money]] : []), ...mods, ['atividade', 'Atividade', ICON.bell], ['equipa', p.is_central ? 'Equipa' : 'Equipa e convites', ICON.team], ...(isStaff() ? [['detalhes', 'Detalhes', ICON.info]] : [])];
  return `
    ${p._parent ? `<a class="pn-parent" href="#/p/${p._parent.id}">${ICON.back}<span>${esc(p._parent.name)}</span></a>` : ''}
    <div class="pn-h"><div><strong>${esc(p.name)}</strong>${p.client ? `<span class="muted small">${esc(p.client)}</span>` : ''}</div>${!p.is_central && isStaff() ? `<button type="button" class="icon-btn sm pn-mods" data-mods title="Páginas do projeto" aria-label="Juntar ou tirar páginas">${ICON.plus}</button>` : ''}</div>
    <div class="pn-online" data-online></div>
    ${pages.map(([k, l, ic]) => `<a class="side-a" href="${base}${k === 'geral' ? '' : '/' + k}" ${active === k ? 'aria-current="page"' : ''}>${ic}<span>${l}</span></a>`).join('')}
    <div class="pn-sec"><span>Ferramentas</span><button type="button" class="icon-btn sm" data-newboard="" aria-label="Nova ferramenta">${ICON.plus}</button></div>
    ${boardGroups(p).map((g) => `<div class="pn-group" style="--g:${esc(g.color)}">
      <div class="pn-gh"><i></i><span>${esc(g.name)}</span>${g.id ? `<button type="button" class="icon-btn sm" data-newboard="${esc(g.id)}" aria-label="Novo board em ${esc(g.name)}">${ICON.plus}</button>` : ''}</div>
      ${(g.pages || []).map((k) => `<a class="side-a sub" href="${base}/${k}" ${active === k ? 'aria-current="page"' : ''}>${ICON[pageMeta(k).icon]}<span>${esc(pageMeta(k).label)}</span></a>`).join('')}
      ${g.boards.map((b) => `<a class="side-a sub" href="${toolHref(p, b)}" ${active === b.id ? 'aria-current="page"' : ''}>${(TOOL_KINDS[b.kind] || TOOL_KINDS.board).icon}<span>${esc(b.title)}</span>${b.visible_to?.length ? `<i class="vis-lock" title="Só algumas pessoas veem">${ICON.lock}</i>` : ''}</a>`).join('')}
    </div>`).join('')}`;
}
const navState = { p: null, active: null };
// quando as páginas mudam (à mão ou sozinhas), o menu atualiza-se logo
window.addEventListener('bg-modules', () => {
  const nav = document.querySelector('.proj-nav'); if (!nav || !navState.p) return;
  nav.innerHTML = projectNav(navState.p, navState.active); bindProjectNav(nav, navState.p);
});
function bindProjectNav(root, p) {
  const box = root.querySelector('[data-online]');
  if (box) {
    joinProject(p.id);
    const off = onPresence((list) => {
      const seen = new Map(); list.forEach((x) => seen.set(x.uid === state.user.id ? x.tab : x.uid, x));
      const ppl = [...seen.values()];
      box.innerHTML = ppl.length ? `<span class="av-stack">${ppl.slice(0, 5).map((x) => `<span class="avatar sm" style="--c:${esc(x.color)}" title="${esc(whoLabel(x))}">${esc(initials(x.name))}</span>`).join('')}</span><small>${ppl.length === 1 ? `${esc(whoLabel(ppl[0]))} também está aqui` : `+${ppl.length} aqui agora`}</small>` : '';
    });
    onCleanup(off);
  }
  root.querySelector('[data-mods]')?.addEventListener('click', () => modulesModal(p));
  root.querySelectorAll('[data-newboard]').forEach((b) => b.addEventListener('click', () => newBoard(p, b.dataset.newboard)));
}

function newBoard(p, groupId = '', kind = 'board') {
  const fic = scriptMode(p);
  // os adereços têm uma única página por projeto (Arte › Adereços), por isso não há modelo de tabela de adereços
  const tpls = [['blank', 'Em branco'], ['contacts', 'Folha de contactos (equipa e elenco)'], ['deliverables', 'Entregas (peças, formatos, plataformas)'], ['cast', fic ? 'Elenco' : 'Atores e figurantes']];
  const m = modal(`<h2>Nova ferramenta</h2>
    <form class="stack">
      <div class="tool-kinds" role="radiogroup" aria-label="Ferramenta">${Object.entries(TOOL_KINDS).map(([k, v]) => `<label class="tool-k"><input type="radio" name="kind" value="${k}" ${k === kind ? 'checked' : ''}><span>${v.icon}${v.label}</span></label>`).join('')}</div>
      <div class="field"><label for="bn">Nome</label><input id="bn" name="title" placeholder="ex: Moodboard, Storyboard, Plano de rodagem" required></div>
      <div class="field" data-tplf hidden><label for="bt">Modelo</label><select id="bt" name="tpl">${tpls.map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label for="bg">Departamento</label><select id="bg" name="group_id"><option value="">Nenhum</option>${(p.departments || []).map((d) => `<option value="${esc(d.id)}" ${d.id === groupId ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}${groupId && FIXED_DEPTS[groupId] && !deptOf(p, groupId) ? `<option value="${groupId}" selected>${FIXED_DEPTS[groupId].name}</option>` : ''}</select></div>
      <p class="small muted" data-propsnote hidden>Os adereços têm uma página única por projeto, em Arte. ${hasMod(p, 'aderecos') ? `<a href="${projBase(p)}/aderecos">Abrir Adereços</a>` : '<button type="button" class="link-btn" data-addprops>Juntar a página de Adereços</button>'}</p>
      <div data-vis></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar e abrir</button></div>
    </form>`);
  const form = m.el.querySelector('form');
  visField([]).then((h) => { const v = m.el.querySelector('[data-vis]'); if (v) { v.innerHTML = h; bindVis(form); } });
  const propsNote = () => { const g = form.elements.group_id.value; const arte = deptOf(p, 'arte'); m.el.querySelector('[data-propsnote]').hidden = !(g && (g === 'arte' || g === arte?.id)) && !/^\s*adere/i.test(form.elements.title.value); };
  form.elements.group_id.addEventListener('change', propsNote); form.elements.title.addEventListener('input', propsNote); setTimeout(propsNote);
  m.el.querySelector('[data-addprops]')?.addEventListener('click', async () => { await ensureModules(p, ['aderecos']); m.close(); go(`${projBase(p)}/aderecos`); });
  const ttl = form.elements.title;
  const sync = () => {
    const k = form.elements.kind.value; m.el.querySelector('[data-tplf]').hidden = k !== 'table'; if (!ttl.dataset.touched) ttl.value = k === 'board' ? '' : TOOL_KINDS[k].label;
    const sel = form.elements.group_id; const img = deptOf(p, 'imagem');
    if (k === 'lightmap') { if (!img && !sel.querySelector('option[value="imagem"]')) sel.insertAdjacentHTML('beforeend', '<option value="imagem">Imagem</option>'); sel.value = img?.id || 'imagem'; sel.disabled = true; } else sel.disabled = false;
  };
  ttl.addEventListener('input', () => (ttl.dataset.touched = '1'));
  form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', sync)); sync();
  const tplNames = { blank: 'Tabela', deliverables: 'Entregas', props: 'Adereços por cena', cast: 'Elenco', contacts: 'Contactos' };
  form.elements.tpl.addEventListener('change', () => { if (!ttl.dataset.touched) ttl.value = tplNames[form.elements.tpl.value]; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    if (/^\s*adere/i.test(f.title) && f.kind !== 'budget') { toast('Os adereços têm uma página única por projeto, em Arte › Adereços.'); if (!hasMod(p, 'aderecos')) await ensureModules(p, ['aderecos']); m.close(); return go(`${projBase(p)}/aderecos`); }
    if (f.kind === 'lightmap') f.group_id = await ensureDept(p, 'imagem');
    else if (f.group_id === 'imagem' && !deptOf(p, 'imagem')) f.group_id = await ensureDept(p, 'imagem');
    else if (f.group_id === 'arte' && !deptOf(p, 'arte')) f.group_id = await ensureDept(p, 'arte');
    const data = f.kind === 'table' ? await tableTemplate(p, f.tpl) : f.kind === 'lightmap' ? newLightmapData() : f.kind === 'callsheet' ? { sheets: [(await lazy.callsheet()).newCallsheet(p, 1)] } : f.kind === 'transport' ? (await lazy.transport()).newTransport(p) : {};
    const { data: row, error } = await sb.from('boards').insert({ project_id: p.id, title: f.title.trim(), group_id: f.group_id || null, position: p._boards.length, kind: f.kind, data, visible_to: readVis(form) }).select().single();
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
  if (tool.kind === 'lightmap') return lightmapView(p, tool);
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
  joinProject(p.id);
  { const lk = lockPage(`${p.id}:f:${tool.id}`, app.querySelector('[data-main]'), { reopen: () => route() }); onCleanup(() => lk.destroy()); }
  if (tool.kind === 'table') tableTool(box, p, tool);
  if (tool.kind === 'timeline') timelineTool(box, p, tool);
  if (tool.kind === 'budget') (await lazy.budget()).budgetTool(box, p, tool);
  if (tool.kind === 'media') mediaTool(box, p, tool);
  if (tool.kind === 'callsheet') (await lazy.callsheet()).callsheetTool(box, p, tool);
  if (tool.kind === 'transport') (await lazy.transport()).transportTool(box, p, tool);
  if (tool.kind === 'lightmap') {
    const { data: chars } = await sb.from('characters').select('name, actor').eq('project_id', p.id).order('position');
    const lm = (await lazy.lightmap()).lightmapTool(box, p, tool, { characters: (chars || []).map((c) => c.name), base: projBase(p) });
    onCleanup(() => lm.destroy());
  }
}

function boardOptions(p, b, after) {
  const m = modal(`<h2>${esc((TOOL_KINDS[b.kind] || TOOL_KINDS.board).label)}</h2>
    <form class="stack">
      <div class="field"><label for="bn">Nome</label><input id="bn" name="title" value="${esc(b.title)}" required></div>
      <div class="field"><label for="bg">Departamento</label><select id="bg" name="group_id" ${b.kind === 'lightmap' ? 'disabled title="Os mapas de luz ficam sempre em Imagem"' : ''}><option value="">Nenhum</option>${(p.departments || []).map((d) => `<option value="${esc(d.id)}" ${d.id === b.group_id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
      <div data-vis></div>
      <div class="row between">
        <button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>
        <div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div>
      </div>
    </form>`);
  const canVis = isStaff() || b.created_by === state.user?.id;
  if (canVis) visField(b.visible_to || []).then((h) => { const v = m.el.querySelector('[data-vis]'); if (v) { v.innerHTML = h; bindVis(m.el.querySelector('form')); } });
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const vis = canVis && e.target.querySelector('[name=vis]') ? { visible_to: readVis(e.target) } : {};
    const { error } = await sb.from('boards').update({ title: f.title.trim(), ...(b.kind === 'lightmap' ? {} : { group_id: f.group_id || null }), ...vis }).eq('id', b.id);
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
  const p = await loadProject(projectId, { fresh: ['orcamento', 'detalhes', 'equipa'].includes(page) });
  if (!p) return notFound();
  state.ctx = { project: p };
  if (page === 'detalhes' && !isStaff()) page = 'geral';
  if (page !== 'geral') setTimeout(() => autoModules(p), 0);
  app.innerHTML = `<div class="page">${header(p.is_central ? 'central' : '')}
    <div class="proj-layout">
      <nav class="proj-nav" aria-label="Projeto">${projectNav(p, page)}</nav>
      <main class="proj-main" data-main></main>
    </div></div>`;
  bindHeader(app); bindProjectNav(app, p);
  const main = app.querySelector('[data-main]');
  const titles = { tarefas: 'Tarefas', equipa: p.is_central ? 'Equipa' : 'Equipa e convites', detalhes: 'Detalhes' };
  joinProject(p.id);
  // páginas de trabalho: só uma janela edita de cada vez (as outras ficam só a ver)
  if (['orcamento', 'seguimento', 'decors', 'elenco', 'personagens', 'aderecos', 'cenas', 'guiao', 'planificacao', 'detalhes', 'shotlist', 'storyboard', 'financas', 'plano', 'equipamento', 'figurino', 'tratamento'].includes(page)) {
    const lk = lockPage(`${p.id}:${page}:${sub || ''}`, main, { reopen: () => route() });
    onCleanup(() => lk.destroy());
  }
  if (page === 'geral') return projectOverview(main, p);
  if (page === 'atividade') return activityPage(main, p);
  if (page === 'financas' && p.is_central && isStaff()) return (await lazy.finance()).financePage(main, sub);
  if (page === 'orcamento' && p.canBudget) {
    const folder = isFolder(p);
    main.innerHTML = `<div class="row between wrap-gap"><div><h1 class="h1 pm-title"><input class="title-in" data-btitle value="${esc(p.budget?.title || 'Orçamento')}" aria-label="Nome do orçamento" title="Clica para mudar o nome" maxlength="80"></h1><p class="muted">${folder ? 'Orçamento geral da pasta: os custos próprios (tabela em baixo) mais o que está atribuído a cada projeto lá dentro.' : 'Soma tudo o que está na tabela e compara com o orçamento geral do projeto.'}</p></div><div data-who></div></div>${folder ? '<div data-kids></div>' : ''}<div class="budget-wrap" data-b></div>`;
    budgetWhoChip(main.querySelector('[data-who]'), p);
    if (folder) { const kids = await loadChildren(p); p._extra = { amount: budgetChildrenPanel(main.querySelector('[data-kids]'), p, kids), label: 'atribuídos aos projetos dentro' }; }
    const done = (await lazy.budget()).budgetPage(main.querySelector('[data-b]'), p);
    const ti = main.querySelector('[data-btitle]');
    const commitT = () => { const v = ti.value.trim() || 'Orçamento'; ti.value = v; if (v !== (p.budget?.title || 'Orçamento')) p._renameBudget?.(v); };
    ti.addEventListener('change', commitT); ti.addEventListener('keydown', (e) => { if (e.key === 'Enter') ti.blur(); if (e.key === 'Escape') { ti.value = p.budget?.title || 'Orçamento'; ti.blur(); } });
    return done;
  }
  if (page === 'marketing' && !p.is_central) return (await lazy.marketing()).marketingPage(main, p, sub, projBase(p));
  if (page === 'shotlist') return (await lazy.shotlist()).shotlistPage(main, p, projBase(p));
  if (page === 'equipamento' && !p.is_central) return (await lazy.gear()).gearPage(main, p, projBase(p));
  if (page === 'mapas' && !p.is_central) return (await lazy.lmhub()).lightmapsPage(main, p, projBase(p));
  if (page === 'plano' && sub) return (await lazy.shot()).shotPage(main, p, sub, projBase(p), onCleanup);
  {
    const scr = scriptMode(p);
    if (['guiao', 'cenas', 'planificacao'].includes(page) || (scr && ['personagens', 'elenco', 'decors', 'storyboard'].includes(page))) return fictionPage(main, p, page === 'elenco' ? 'personagens' : page, sub, projBase(p), onCleanup);
    if (['seguimento', 'decors', 'elenco', 'personagens', 'storyboard'].includes(page)) return clipPage(main, p, page === 'personagens' ? 'elenco' : page, sub, projBase(p), onCleanup);
  }
  if (['orcamento', 'financas'].includes(page)) { main.innerHTML = `<div class="empty-box"><p>${ICON.lock} Não tens acesso a esta parte.</p><p class="muted small">Pede a um administrador.</p></div>`; return; }
  if (page === 'aderecos' && !p.is_central) return (await lazy.props()).propsPage(main, p, sub, projBase(p), onCleanup);
  if (page === 'figurino' && !p.is_central) return (await lazy.wardrobe()).wardrobePage(main, p, sub, projBase(p), onCleanup);
  if (page === 'tratamento' && !p.is_central) return (await import('./treatment.js')).treatmentPage(main, p, projBase(p), onCleanup);
  main.innerHTML = `<h1 class="h1 pm-title">${esc(titles[page] || '')}</h1><div class="panel" data-body></div>`;
  const body = main.querySelector('[data-body]');
  if (page === 'tarefas') { body.classList.remove('panel'); body.classList.add('tc'); const t = mountTaskCenter(body, { projectId: p.id }); onCleanup(() => t.destroy()); }
  if (page === 'equipa') projectTeam(body, p);
  if (page === 'detalhes') {
    if (!p.is_central && p.kind !== 'album') { const { data: fs } = await sb.from('projects').select('id, name').eq('kind', 'album').is('deleted_at', null).neq('id', p.id).order('name'); p._folders = fs || []; }
    body.innerHTML = detailsForm(p); bindDetails(body, p, () => projectPage(projectId, 'detalhes'));
  }
}

function budgetUsed(p) {
  const b = p.budget; if (!b?.rows || !b.main) return 0;
  return b.rows.filter((r) => r.kind === 'item').reduce((a, r) => a + (Number(r.cells?.[b.main]) || 0), 0);
}

async function projectOverview(main, p) {
  const base = projBase(p);
  const kids = isFolder(p) ? await loadChildren(p) : null;
  p._kidsAlloc = kids ? rollup(kids).alloc : 0;
  const [{ data: tasks }, { data: items }, people] = await Promise.all([
    sb.from('tasks').select('*').eq('project_id', p.id).neq('status', 'done'),
    sb.from('board_items').select('board_id, kind, data').eq('project_id', p.id),
    loadPeople(),
  ]);
  const cover = p.cover_path ? (await signedUrls([p.cover_path]))[p.cover_path] : null;
  const fs = hasMod(p, 'cenas') ? await fictionStats(p) : null;
  const imgPaths = (items || []).filter((i) => i.kind === 'image').map((i) => i.data?.path);
  const thumbs = await signedUrls(imgPaths.slice(0, 40));
  const ph = phaseOf(p);
  const top = p._boards.filter((b) => !b.parent_id && b.kind !== 'mkt' && b.kind !== 'wrd' && b.kind !== 'lightmap');
  const nMaps = p._boards.filter((b) => b.kind === 'lightmap').length;
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
        ${!p.is_central ? `<div class="pm-leads" data-leads></div>` : ''}
        ${p.canBudget && hasMod(p, 'orcamento') ? (() => { const used = budgetUsed(p) + (p._kidsAlloc || 0); const over = p.value != null && used > p.value; return `<button type="button" class="pm-budget ${over ? 'over' : ''}" data-budget title="Só quem tem acesso ao orçamento vê isto"><span>${ICON.lock} Orçamento${p._approvedAt ? ' <em class="appr">✓ aprovado</em>' : ''}</span>${p.value != null ? `<strong>${eur.format(p.value)}</strong>${used ? `<small>${eur.format(used)} na tabela${over ? ` · ${eur.format(used - p.value)} acima` : ''}</small>` : ''}` : '<strong class="muted-w">Definir</strong>'}</button>`; })() : ''}
        ${ph.label ? `<div class="pm-phase"><div class="row between small"><span>${esc(ph.label)}</span><span>${Math.round(ph.pct * 100)}%</span></div><div class="bar light"><i style="width:${Math.round(ph.pct * 100)}%"></i></div></div>` : ''}
      </div>
    </section>
    ${fs ? `<div class="stats">${[['cenas', 'Cenas', fs.scenes], ['personagens', 'Personagens', fs.characters], ['decors', 'Décors', fs.locations], ['storyboard', 'Planos', fs.shots]].map(([k, l, n]) => `<a class="stat" href="${base}/${k}"><strong>${n}</strong><span>${l}</span></a>`).join('')}${fs.scenes ? '' : `<a class="stat cta" href="${base}/guiao"><strong>${ICON.plus}</strong><span>Importar guião</span></a>`}</div>` : ''}
    ${kids ? '<section class="panel fold-sec" data-kids></section>' : ''}
    ${!p.is_central && hasMod(p, 'marketing') ? '<section class="panel mk-upbox" data-mkup></section>' : ''}
    ${p._parent ? `<a class="fold-up" href="#/p/${p._parent.id}">${ICON.back} Faz parte de <b>${esc(p._parent.name)}</b></a>` : ''}
    ${p.is_central ? '' : '<div class="ov" data-situation></div>'}
    <div class="pm-grid ${p.is_central ? '' : 'solo'}">
      <section class="pm-boards" aria-labelledby="h-boards">
        <div class="row between"><h2 id="h-boards" class="h2">Ferramentas</h2><button type="button" class="btn primary" data-nb>${ICON.plus} Nova ferramenta</button></div>
        ${top.length || nMaps ? `<div class="board-grid">${top.map((b) => { const d = deptMap.get(b.group_id); const th = thumbOf(b.id); return `
          <article class="board-card" style="--g:${esc(d?.color || '#8A8A99')}">
            <a href="${toolHref(p, b)}" class="proj-link" aria-label="Abrir ${esc(b.title)}"></a>
            <div class="bc-cover" ${th ? `style="background-image:url('${esc(th)}')"` : ''}>${th ? '' : (TOOL_KINDS[b.kind] || TOOL_KINDS.board).icon}</div>
            <div class="bc-body"><strong>${esc(b.title)}${b.visible_to?.length ? ` <i class="vis-lock" title="Visível só para ${b.visible_to.length} ${b.visible_to.length === 1 ? 'pessoa' : 'pessoas'}">${ICON.lock}</i>` : ''}</strong><span class="small muted">${d ? `<i class="dot"></i>${esc(d.name)} · ` : ''}${(b.kind || 'board') === 'board' ? `${count(b.id)} ${count(b.id) === 1 ? 'cartão' : 'cartões'}` : esc((TOOL_KINDS[b.kind] || {}).label || '')}</span></div>
            <button type="button" class="icon-btn bc-more" data-bopt="${b.id}" aria-label="Opções de ${esc(b.title)}">${ICON.dots}</button>
          </article>`; }).join('')}${nMaps ? `<article class="board-card" style="--g:${esc(deptOf(p, 'imagem')?.color || '#2FB67C')}"><a href="${base}/mapas" class="proj-link" aria-label="Abrir os mapas de luz"></a><div class="bc-cover">${ICON.bulb}</div><div class="bc-body"><strong>Mapas de luz</strong><span class="small muted"><i class="dot"></i>Imagem · ${nMaps} ${nMaps === 1 ? 'mapa' : 'mapas'}</span></div></article>` : ''}</div>`
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
  if (!p.is_central) { mountSituation(main.querySelector('[data-situation]'), p, base); autoModules(p); }
  const mkup = main.querySelector('[data-mkup]'); if (mkup) lazy.marketing().then((m) => m.upcomingBox(mkup, p, base));
  if (kids) childrenSection(main.querySelector('[data-kids]'), p, kids, { base, canBudget: p.canBudget, onNew: isStaff() ? () => newProject({ parent: p }) : null, canEdit: isStaff(), after: () => projectPage(p.id, 'geral') });
  const leadsEl = main.querySelector('[data-leads]');
  if (leadsEl) drawLeads(leadsEl, p);
  if (p.is_central) { const box = document.createElement('div'); box.className = 'co'; main.querySelector('.pm-head').after(box); centralOverview(box); }
}

// ---------- Central: visão geral dos projetos ----------
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
// líder e encarregue do projeto: aparecem no topo do projeto; quem é da equipa pode mudar ali mesmo
async function drawLeads(el, p) {
  const people = await loadPeople(); const by = (id) => people.find((x) => x.id === id);
  const chip = (k, label) => { const x = by(p[k]); return `<button type="button" class="pm-lead ${x ? '' : 'empty'}" data-lk="${k}" ${isStaff() ? '' : 'disabled'} title="${isStaff() ? `Mudar ${label.toLowerCase()}` : label}"><small>${label}</small>${x ? `<span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><b>${esc(x.display_name)}</b>` : `<b class="muted-w">${isStaff() ? 'Atribuir' : '—'}</b>`}</button>`; };
  el.innerHTML = chip('lead_id', 'Líder') + chip('manager_id', 'Encarregue');
  el.querySelectorAll('[data-lk]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.lk; const label = k === 'lead_id' ? 'Líder do projeto' : 'Encarregue do projeto';
    const m = modal(`<h2>${label}</h2><p class="muted small">${k === 'lead_id' ? 'Quem lidera e responde pelo projeto.' : 'Quem trata do projeto no dia a dia.'}</p><div class="lead-pick">${[{ id: '', display_name: 'Ninguém' }, ...people.filter((x) => x.role !== 'guest')].map((x) => `<button type="button" class="lead-opt ${(p[k] || '') === x.id ? 'on' : ''}" data-pid="${x.id}">${x.id ? `<span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span>` : '<span class="avatar sm none">—</span>'}<span>${esc(x.display_name)}</span></button>`).join('')}</div><div class="row end"><button type="button" class="btn ghost" data-close>Fechar</button></div>`);
    m.el.querySelectorAll('[data-pid]').forEach((o) => o.addEventListener('click', async () => {
      const v = o.dataset.pid || null;
      const { error } = await sb.from('projects').update({ [k]: v }).eq('id', p.id);
      if (error) return toast(error.message);
      p[k] = v; m.close(); toast('Guardado.'); drawLeads(el, p);
    }));
  }));
}

const coState = { ym: new Date().toISOString().slice(0, 7) };
const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
async function centralOverview(box) {
  box.innerHTML = '<p class="muted">A carregar os projetos…</p>';
  const [{ data: projects }, { data: members }, { data: fins }, { data: tasks }, people] = await Promise.all([
    sb.from('projects').select(PROJECT_COLS).eq('is_central', false).is('deleted_at', null),
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
  const pname = (id) => people.find((x) => x.id === id)?.display_name;
  const leadCell = (x) => (x.lead_id || x.manager_id ? `${x.lead_id ? `<b>${esc(pname(x.lead_id) || '—')}</b>` : '<span class="muted">sem líder</span>'}${x.manager_id ? `<br><span class="muted">${esc(pname(x.manager_id) || '')}</span>` : ''}` : '<span class="muted">—</span>');
  const val = (v) => (v == null ? '<span class="muted">—</span>' : eur.format(v));
  const valOf = (x) => { const par = parentOf(x); if (par) return `<span class="muted" title="Já incluído no orçamento geral de ${esc(par.name)}">${x.value == null ? '—' : eur.format(x.value)} <small>(em ${esc(par.name)})</small></span>`; if (isFolder(x) && x.value == null) { const k = eff(x); return k ? `${eur.format(k)} <small class="muted">(soma dos projetos)</small>` : val(null); } return val(x.value); };

  // projetos dentro de uma pasta (álbum) já contam no orçamento geral da pasta: não se somam outra vez
  const byPid = new Map((projects || []).map((x) => [x.id, x]));
  const parentOf = (x) => (x.parent_id && byPid.get(x.parent_id)) || null;
  const kidsOf = (id) => (projects || []).filter((k) => k.parent_id === id);
  const eff = (x) => (x.value != null ? Number(x.value) : isFolder(x) ? kidsOf(x.id).reduce((a, k) => a + (Number(k.value) || 0), 0) : 0);
  const sum = (l) => { const ids = new Set(l.map((x) => x.id)); return l.reduce((a, x) => { const par = parentOf(x); if (par && ids.has(par.id)) return a; return a + eff(x); }, 0); };
  // os projetos dentro de uma pasta aparecem logo a seguir à pasta
  const nest = (l) => { const ids = new Set(l.map((x) => x.id)); const out = []; l.filter((x) => !(parentOf(x) && ids.has(x.parent_id))).forEach((x) => { out.push(x); l.filter((k) => k.parent_id === x.id).forEach((k) => out.push(k)); }); return out; };
  const ongoing = nest((projects || []).filter((x) => x.status === 'active').sort((a, b) => (a.ends_on || '9999').localeCompare(b.ends_on || '9999')));
  const finished = nest((projects || []).filter((x) => x.status !== 'active' && x.done_at && x.done_at.slice(0, 7) === coState.ym).sort((a, b) => b.done_at.localeCompare(a.done_at)));
  const [y, m] = coState.ym.split('-');
  const stateCell = (x) => { const ph = phaseOf(x); const d = x.ends_on ? daysUntil(x.ends_on) : null; return `<div class="co-state"><span>${esc(ph.label || 'Sem datas')}</span><div class="bar"><i style="width:${Math.round(ph.pct * 100)}%"></i></div>${d != null && d < 0 ? '<span class="small late-txt2">Prazo passado</span>' : ''}</div>`; };
  box.innerHTML = `
    <section class="co-sec">
      <div class="co-h"><h2 class="h2">Projetos em curso</h2><span class="muted">${ongoing.length} ${ongoing.length === 1 ? 'projeto' : 'projetos'}${money ? ` · <strong class="co-total">${eur.format(sum(ongoing))}</strong>` : ''}</span></div>
      <div class="panel table-wrap">${ongoing.length ? `<table class="table co-table"><thead><tr><th>Projeto</th>${money ? '<th class="num">Orçamento</th>' : ''}<th>Líder · encarregue</th><th>Atribuídos</th><th>Estado</th><th class="num">Tarefas</th><th>Entrega</th></tr></thead><tbody>
        ${ongoing.map((x) => `<tr class="click-row" data-href="#/p/${x.id}"><td${parentOf(x) ? ' class="co-child"' : ''}><a href="#/p/${x.id}" class="co-name"><strong>${esc(x.name)}</strong><span class="small muted">${esc(x.client || '')}${x.client ? ' · ' : ''}${esc(KINDS[x.kind] || x.kind)}</span></a></td>${money ? `<td class="num">${valOf(x)}</td>` : ''}<td class="small co-lead">${leadCell(x)}</td><td>${avatars(x.id)}</td><td>${stateCell(x)}</td><td class="num">${open(x.id) || '<span class="muted">0</span>'}</td><td class="small">${x.ends_on ? fmtDate(x.ends_on) : '<span class="muted">—</span>'}</td></tr>`).join('')}
      </tbody>${money ? `<tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${eur.format(sum(ongoing))}</strong></td><td colspan="5"></td></tr></tfoot>` : ''}</table>` : '<p class="empty-note">Não há projetos em curso.</p>'}</div>
    </section>
    <section class="co-sec">
      <div class="co-h"><h2 class="h2">Finalizados</h2>
        <div class="month-nav"><button type="button" class="icon-btn" data-cm="-1" aria-label="Mês anterior">${ICON.back}</button><strong>${MESES_L[+m - 1]} ${y}</strong><button type="button" class="icon-btn" data-cm="1" aria-label="Mês seguinte">${ICON.chev}</button></div>
        <span class="muted">${finished.length} ${finished.length === 1 ? 'projeto' : 'projetos'}${money ? ` · <strong class="co-total">${eur.format(sum(finished))}</strong>` : ''}</span></div>
      <div class="panel table-wrap">${finished.length ? `<table class="table co-table"><thead><tr><th>Projeto</th>${money ? '<th class="num">Orçamento</th>' : ''}<th>Atribuídos</th><th>Fechado a</th></tr></thead><tbody>
        ${finished.map((x) => `<tr class="click-row" data-href="#/p/${x.id}"><td${parentOf(x) ? ' class="co-child"' : ''}><a href="#/p/${x.id}" class="co-name"><strong>${esc(x.name)}</strong><span class="small muted">${esc(x.client || '')}${x.client ? ' · ' : ''}${esc(KINDS[x.kind] || x.kind)}</span></a></td>${money ? `<td class="num">${valOf(x)}</td>` : ''}<td>${avatars(x.id)}</td><td class="small">${fmtDate(x.done_at)}</td></tr>`).join('')}
      </tbody>${money ? `${money ? `<tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${eur.format(sum(finished))}</strong></td><td colspan="2"></td></tr></tfoot>` : ''}` : ''}</table>` : `<p class="empty-note">Nenhum projeto finalizado em ${MESES_L[+m - 1]}.</p>`}</div>
    </section>`;
  box.querySelectorAll('[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) go(tr.dataset.href); }));
  box.querySelectorAll('[data-cm]').forEach((b) => b.addEventListener('click', () => { const [yy, mm] = coState.ym.split('-').map(Number); const d = new Date(yy, mm - 1 + Number(b.dataset.cm), 1); coState.ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; centralOverview(box); }));
}

// ---------- mapa de luz em ecrã inteiro (como os boards) ----------
async function lightmapView(p, tool) {
  const base = projBase(p);
  document.body.classList.add('is-board');
  onCleanup(() => document.body.classList.remove('is-board'));
  app.innerHTML = `<div class="pv lmv">
    <div class="lmv-stage" data-main></div>
    <div class="pv-top">
      <button type="button" class="pv-mark" data-side aria-label="Abrir o menu do projeto">${LOGO('studio')}</button>
      <nav class="crumbs" aria-label="Caminho"><a href="${base}">${esc(p.name)}</a><span>/</span><a href="${base}/mapas">Mapas de luz</a><span>/</span><span aria-current="page">${esc(tool.title)}</span></nav>
    </div>
    <div class="pv-edge" data-edge aria-hidden="true"></div>
    <nav class="pv-side" data-sidebar aria-label="Páginas do projeto">
      ${projectNav(p, 'mapas')}
      <hr>
      <a class="side-a" href="#/">${ICON.back}<span>Voltar ao início</span></a>
    </nav>
  </div>`;
  bindProjectNav(app, p);
  const stage = app.querySelector('[data-main]');
  joinProject(p.id);
  { const lk = lockPage(`${p.id}:f:${tool.id}`, stage, { reopen: () => route() }); onCleanup(() => lk.destroy()); }
  const { data: chars } = await sb.from('characters').select('name, actor').eq('project_id', p.id).order('position');
  const lm = (await lazy.lightmap()).lightmapTool(stage, p, tool, { characters: (chars || []).map((c) => c.name), base, onOptions: () => boardOptions(p, tool, () => toolPage(p.id, tool.id)) });
  onCleanup(() => lm.destroy());
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

  const tools = [['note', 'Nota', ICON.note], ['image', 'Imagem', ICON.image], ['palette', 'Paleta', ICON.palette], ['list', 'Lista', ICON.list], ['board', 'Board', ICON.board], ['title', 'Título', ICON.title], ['link', 'Ligação', ICON.link], ['video', 'Pre-vis / vídeo', ICON.camera], ['audio', 'Música', ICON.music]];
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
      <button type="button" data-undo aria-label="Desfazer" title="Desfazer (Ctrl+Z)">↶</button>
      <button type="button" data-redo aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)">↷</button>
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
  joinProject(p.id);
  const bp = boardPresence(cur.id);
  onCleanup(() => bp.leave());
  const board = mountBoard(app.querySelector('.pv-board'), {
    projectId: p.id, boardId: cur.id, presence: bp,
    onOpenBoard: (id) => go(`${base}/b/${id}`),
    onUp: async () => {
      if (cur.parent_id) return go(`${base}/b/${cur.parent_id}`);
      // board de um item de marketing: volta para a página do item
      if (cur.kind === 'wrd') { const { data: wb } = await sb.from('boards').select('data').eq('id', cur.id).maybeSingle(); if (wb?.data?.location_id) return go(`${base}/decors/${wb.data.location_id}`); return go(`${base}/figurino${wb?.data?.character_id ? '/' + wb.data.character_id : ''}`); }
      if (cur.kind === 'mkt') { const { data: mi } = await sb.from('marketing_items').select('id').eq('board_id', cur.id).maybeSingle(); if (mi) return go(`${base}/marketing/${mi.id}`); }
      go(base);
    },
    onZoom: (k) => (pct.textContent = Math.round(k * 100) + '%'),
    onSelect: (info) => {
      selInfo = info;
      cBtn.disabled = !info;
      cBtn.querySelector('.cdot').style.background = info?.bg || '';
      if (!info) closePop(); else if (!cPop.hidden) drawPop();
    },
  });
  onCleanup(() => board.destroy());

  // ferramentas: clicar junta no centro; arrastar para o board junta onde se largar
  app.querySelectorAll('[data-tool]').forEach((x) => {
    let drag = null;
    x.addEventListener('click', (e) => { if (x._dragged) { x._dragged = false; e.preventDefault(); return; } board.add(x.dataset.tool); });
    x.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      drag = { sx: e.clientX, sy: e.clientY, on: false, ghost: null };
      const move = (ev) => {
        if (!drag) return;
        if (!drag.on && Math.hypot(ev.clientX - drag.sx, ev.clientY - drag.sy) < 6) return;
        if (!drag.on) { drag.on = true; drag.ghost = document.createElement('div'); drag.ghost.className = `tool-ghost tg-${x.dataset.tool}`; drag.ghost.innerHTML = x.innerHTML; document.body.append(drag.ghost); document.body.classList.add('tool-dragging'); }
        drag.ghost.style.transform = `translate(${ev.clientX}px, ${ev.clientY}px)`;
        drag.ghost.classList.toggle('out', !board.worldAt(ev.clientX, ev.clientY) || !!ev.target.closest?.('.pv-tools, .fmt-bar, .pv-zoom'));
      };
      const up = (ev) => {
        window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
        if (!drag) return; const d = drag; drag = null;
        if (!d.on) return;
        d.ghost.remove(); document.body.classList.remove('tool-dragging'); x._dragged = true; setTimeout(() => { x._dragged = false; }, 0);
        const overUi = document.elementFromPoint(ev.clientX, ev.clientY)?.closest('.pv-tools, .fmt-bar, .pv-zoom, .pv-colorpop');
        const at = !overUi && ev.type === 'pointerup' ? board.worldAt(ev.clientX, ev.clientY) : null;
        if (at) board.add(x.dataset.tool, { at });
      };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    });
    x.addEventListener('dragstart', (e) => e.preventDefault());
  });
  app.querySelector('[data-undo]').addEventListener('click', () => board.undo());
  app.querySelector('[data-redo]').addEventListener('click', () => board.redo());
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
async function gearDbPage() {
  app.innerHTML = `<div class="page">${header('')}<div class="wrap page-pad" data-gdb></div></div>`;
  bindHeader(app);
  (await import('./gearbase.js')).gearBasePage(app.querySelector('[data-gdb]'));
}
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
    try { clearPeopleCache(); await callFn('admin-users', { action: 'update', user_id: s.dataset.role, role: s.value }); toast('Papel mudado.'); } catch (e) { toast(e.message); teamPage(); }
  }));
  app.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => {
    const u = people.find((x) => x.id === b.dataset.pw);
    const m = modal(`<h2>Palavra-passe de ${esc(u.display_name)}</h2><form class="stack"><div class="field"><label for="npw">Nova palavra-passe</label><input id="npw" type="text" autocomplete="off" required></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const v = m.el.querySelector('#npw').value;
      if (v.length < MIN_PW) return toast(`Pelo menos ${MIN_PW} caracteres.`);
      try { clearPeopleCache(); await callFn('admin-users', { action: 'update', user_id: u.id, password: authPw(v) }); m.close(); toast('Palavra-passe mudada.'); } catch (er) { toast(er.message); }
    });
  }));
  app.querySelectorAll('[data-deluser]').forEach((b) => b.addEventListener('click', async () => {
    const u = people.find((x) => x.id === b.dataset.deluser);
    if (!(await confirmBox(`Apagar a conta de ${u.display_name}?`, 'Apagar'))) return;
    try { clearPeopleCache(); await callFn('admin-users', { action: 'delete', user_id: u.id }); toast('Conta apagada.'); teamPage(); } catch (e) { toast(e.message); }
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
    try { clearPeopleCache(); await callFn('admin-users', { action: 'create', ...f, password: authPw(f.password) }); m.close(); toast('Conta criada.'); teamPage(); } catch (er) { toast(er.message); }
  });
}
