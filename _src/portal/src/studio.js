import './style.css';
import { settleSaves, navStart, daysUntil, runLeave } from './lib.js';
import { loadHidden, hideProject, unhideProject } from './lib.js';
import { loadComms, commById, setCtx, CID, isPlatformAdmin, PERMS } from './lib.js';
import { activityButton, bindActivity, activityPage } from './activity.js';
import { IS_STUDIO, sb, BUCKET, state, esc, $, loadProfile, isStaff, isAdmin, toast, modal, confirmBox, ICON, LOGO, KINDS, ROLES, phaseOf, greeting, initials, signedUrls, knownUrl, uploadImage, callFn, authPw, MIN_PW, fmtDate, dueInfo, todayISO, registerSW, isInstalled, installApp, BASE, PROJECT_COLS, hasPerm, leadsOf } from './lib.js';
import { renderAuth } from './auth.js';
import { visField, bindVis, readVis } from './vis.js';
import { onWrite, setWriteGuard } from './undo.js';
import { applyHero, heroEditor, heroTitle } from './herobanner.js';
import { aheadNotice, bindAhead, aheadOf, stageOptions, projectStrip, bindStrip, phaseBar, bindPhaseBar, shows, modKey, toolKey, selPhase, setSelPhase, phaseLabel, phasesOf, setToolPhase, stagesOn } from './phases.js';
import { projectSearch } from './psearch.js';
import { mountTasks, loadPeople, clearPeopleCache, addTaskModal } from './tasks.js';
import { TOOL_KINDS, tableTool, timelineTool, tableTemplate } from './tools.js';
import { isFolder, loadChildren, rollup, childrenSection, budgetChildrenPanel } from './folders.js';
import { mountTaskCenter } from './taskcenter.js';
import { clipPage, CLIP_PAGES, mediaTool } from './music.js';
import { mountSituation, situationData, questionsButton } from './overview.js';
import { mountCanvas } from './canvas.js';
import { clearFullscreen } from './layout.js';
import { newLightmapData } from './lmdata.js';
// páginas pesadas só carregam quando são abertas (o site arranca mais depressa)
const lazy = {
  finance: () => import('./finance.js'), lightmap: () => import('./lightmap.js'), lmhub: () => import('./lmhub.js'), wardrobe: () => import('./wardrobe.js'), gear: () => import('./gear.js'),
  props: () => import('./props.js'), budget: () => import('./budget.js'), shotlist: () => import('./shotlist.js'),
  shot: () => import('./shot.js'), marketing: () => import('./marketing.js'), callsheet: () => import('./callsheet.js'), rodagem: () => import('./rodagem.js'), anotacao: () => import('./anotacao.js'), transport: () => import('./transport.js'),
};
// pré-carrega em segundo plano depois de o site abrir, para a primeira abertura também ser rápida
setTimeout(() => { const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500)); idle(() => Object.values(lazy).forEach((f) => f().catch(() => {}))); }, 4000);
import { joinProject, leaveProject, lockPage, boardPresence, onPresence, whoLabel } from './presence.js';
import { budgetWhoChip, budgetAccessPanel, budgetAccess } from './perms.js';
import { MODULES, TEMPLATES, modulesOf, hasMod, scriptMode, modLabel, modPath, modulesModal, autoModules, ensureModules, addableModules } from './modules.js';
import { FICTION_PAGES, FICTION_DEPTS, fictionPage, fictionStats } from './fiction.js';

const app = $('#app');
let cleanup = [];
const onCleanup = (fn) => cleanup.push(fn);
function teardown() { clearFullscreen(); runLeave(); cleanup.forEach((f) => { try { f(); } catch { /* nada */ } }); cleanup = []; }

registerSW();
// a roda do rato não muda valores sem querer nos campos numéricos
document.addEventListener('wheel', (e) => { const a = document.activeElement; if (a?.type === 'number' && e.target === a) a.blur(); }, { passive: true });

// ---------- arranque ----------
let recovering = false;
sb.auth.onAuthStateChange((ev) => {
  if (ev === 'PASSWORD_RECOVERY') { recovering = true; teardown(); renderAuth(app, { onDone: () => { recovering = false; boot(); } }).show('newpw'); }
  if (ev === 'SIGNED_OUT') { teardown(); boot(); }
});

// pede de antemão o que a página vai precisar, ao mesmo tempo que o resto (o leitor de pedidos em lib.js junta os iguais)
function warmRoute() {
  try {
    const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    if (parts[0] !== 'p' || !/^[0-9a-f-]{36}$/.test(parts[1] || '')) return;
    const id = parts[1];
    warmProject(id);
    const w = (q) => Promise.resolve(q).then(() => {}, () => {});
    if (!parts[2]) {
      w(sb.from('tasks').select('*').eq('project_id', id));
      w(sb.from('board_items').select('board_id, kind, data').eq('project_id', id));
      w(sb.from('props').select('id, name, status, removed').eq('project_id', id));
      w(sb.from('project_questions').select('*').eq('project_id', id).order('created_at'));
    }
    if (parts[2] === 'f' && parts[3]) w(sb.from('boards').select('*').eq('id', parts[3]).maybeSingle());
  } catch { /* só uma ajuda */ }
}

async function boot() {
  if (recovering) return;
  queueMicrotask(warmRoute); // (depois de o módulo acabar de carregar)
  await loadProfile(); // já traz as comunidades ao mesmo tempo
  if (IS_STUDIO) import('./appearance.js').then((a) => a.syncLookFromProfile());
  if (!state.user || !state.profile) {
    teardown();
    document.body.className = 'is-auth';
    renderAuth(app, { onDone: boot }).show('login');
    return;
  }
  document.body.className = '';
  route();
  // depois da primeira página, vai buscando em segundo plano o código das páginas mais usadas
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1500));
  idle(() => { import('./board.js').catch(() => {}); });
}
window.addEventListener('hashchange', () => { if (!state.user) return; warmRoute(); route(); });
// ficheiros largados num sítio que não os aceita: o browser não abre a imagem por cima do Studio (perdia-se a página)
{
  const files = (e) => [...(e.dataTransfer?.types || [])].includes('Files') && !e.target.closest?.('input[type="file"]');
  document.addEventListener('dragover', (e) => { if (files(e) && !e.defaultPrevented) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; } });
  document.addEventListener('drop', (e) => { if (files(e) && !e.defaultPrevented) { e.preventDefault(); toast('Larga as imagens dentro de uma página ou de um board.'); } });
}
boot();

// logo da comunidade (guardado como imagem pequena em communities.logo_path) ou a cor com as iniciais
const isLogo = (v) => typeof v === 'string' && /^data:image\//.test(v);
const commMark = (c, cls = 'comm-dot') => (isLogo(c?.logo_path) ? `<span class="${cls} has-logo"><img src="${esc(c.logo_path)}" alt=""></span>` : `<span class="${cls}" style="background:${esc(c?.color || '#8A8A99')}">${cls === 'comm-dot' ? esc(initials(c?.name || '')) : ''}</span>`);
function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

// quando uma página foi desenhada com dados guardados (o servidor demorou) e os novos chegam diferentes,
// volta a desenhá-la — mas só logo a seguir a abrir e se ninguém estiver a escrever ou com uma janela aberta
let routedAt = 0;
window.addEventListener('portal-stale', () => {
  if (!state.user || Date.now() - routedAt > 20000) return;
  const a = document.activeElement;
  if (a?.matches?.('input, textarea, select, [contenteditable="true"]') || document.querySelector('#modal.open, .pm-tpop, .dragging, .resizing')) return;
  const y = window.scrollY; route().then(() => requestAnimationFrame(() => window.scrollTo(0, y)));
});
async function route() {
  routedAt = Date.now();
  // antes de mudar de página: envia o que ainda estava por guardar e espera que chegue à base de dados,
  // para a página seguinte (ou a mesma, ao voltar) já mostrar os dados novos
  navStart(); // as gravações por fazer seguem já; a página nova não fica à espera delas
  teardown();
  setReadOnly(null);
  const h = location.hash.replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'p' && parts[1]) return parts[2] === 'b' ? boardView(parts[1], parts[3]) : parts[2] === 'f' ? toolPage(parts[1], parts[3]) : projectPage(parts[1], parts[2] || 'geral', parts[3]);
  // comunidades: #/c/<id>, #/c/<id>/central/..., #/c/<id>/pessoas, #/c/<id>/tarefas
  if (parts[0] === 'c' && parts[1]) {
    const c = commById(parts[1]) || (await loadComms(), commById(parts[1]));
    if (!c) { setCtx(); toast('Não tens acesso a esta comunidade.'); return go('#/'); }
    setCtx({ comm: c });
    if (parts[2] === 'central') {
      if (!c.business || !isStaff()) return go(`#/c/${c.id}`);
      const { data } = await sb.from('projects').select('id').eq('is_central', true).eq('community_id', c.id).limit(1).maybeSingle();
      if (!data) { toast('A Central desta comunidade ainda não existe.'); return go(`#/c/${c.id}`); }
      return parts[3] === 'b' ? boardView(data.id, parts[4]) : parts[3] === 'f' ? toolPage(data.id, parts[4]) : projectPage(data.id, parts[3] || 'geral', parts[4]);
    }
    leaveProject();
    if (parts[2] === 'pessoas') return isAdmin() ? communityTeamPage(c) : go(`#/c/${c.id}`);
    if (parts[2] === 'tarefas') return tasksPage(c);
    return homePage(c);
  }
  setCtx();
  leaveProject();
  if (parts[0] === 'central') return go(state.comms.find((c) => c.business) ? `#/c/${state.comms.find((c) => c.business).id}/central` : '#/');
  if (parts[0] === 'tarefas') return tasksPage();
  if (parts[0] === 'equipamento') return gearDbPage();
  return homePage();
}

// ---------- cabeçalho ----------
function header(active) {
  const p = state.profile; const c = state.ctx?.comm;
  const link = (href, label, key) => `<a href="${href}" class="nav-a" ${active === key ? 'aria-current="page"' : ''}>${label}</a>`;
  const role = c ? ROLES[c.my_role] : 'Conta pessoal';
  return `<header class="topbar">
    <div class="topbar-l">
      <a href="#/" class="brand" aria-label="byGrain Studio, início">${LOGO('studio')}</a>
      <nav aria-label="Principal" class="nav">
        ${link('#/', 'Início', 'home')}
        ${c ? `<span class="nav-sep" aria-hidden="true">/</span><a href="#/c/${c.id}" class="nav-a nav-comm" ${active === 'comm' ? 'aria-current="page"' : ''}>${isLogo(c.logo_path) ? commMark(c, 'nav-logo') : `<i style="background:${esc(c.color)}"></i>`}${esc(c.name)}</a>
          ${c.business && isStaff() ? link(`#/c/${c.id}/central`, 'Central de Produção', 'central') : ''}
          ${isStaff() ? link(`#/c/${c.id}/tarefas`, 'Tarefas', 'tasks') : ''}
          ${isAdmin() ? link(`#/c/${c.id}/pessoas`, 'Pessoas', 'team') : ''}` : link('#/tarefas', 'As minhas tarefas', 'tasks')}
      </nav>
    </div>
    <div class="topbar-r">
    ${activityButton()}
    ${IS_STUDIO ? `<button type="button" class="icon-btn look-btn" data-look aria-label="Aparência" title="Aparência">${ICON.palette}</button>` : ''}
    <button type="button" class="acct" data-acct aria-label="Conta e definições">
      <span class="acct-role">${esc(role)}</span>
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
      <div><strong>${esc(p.display_name)}</strong><div class="muted">${esc(p.username ? '@' + p.username : p.email)}</div></div></div>
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
// Início (comm = null): os meus projetos (fora de comunidades), os fixados e as minhas comunidades.
// Comunidade (comm): os projetos dela, a Central (se tiver parte business) e as pessoas.
// menu pequeno junto a um botão (⋯): items = [{ label, icon, run, check, danger } | '-' | falso]
function popMenu(btn, title, items) {
  document.querySelector('.gi-menu.pop-menu')?.remove();
  const list = items.filter(Boolean).filter((x, i, a) => x !== '-' || (i > 0 && a[i - 1] !== '-' && i < a.length - 1));
  const m = document.createElement('div'); m.className = 'gi-menu pop-menu'; m.setAttribute('role', 'menu'); m.setAttribute('aria-label', title || 'Opções');
  m.innerHTML = `${title ? `<div class="gi-mt">${esc(title)}</div>` : ''}${list.map((x, i) => x === '-' ? '<hr>' : `<button type="button" role="${x.check !== undefined ? 'menuitemradio' : 'menuitem'}" ${x.check !== undefined ? `aria-checked="${!!x.check}"` : ''} class="${x.danger ? 'danger' : ''}" data-mi="${i}">${x.check !== undefined ? `<i class="gi-mi">${x.check ? '✓' : ''}</i>` : x.icon || '<i class="gi-mi"></i>'}<span>${esc(x.label)}</span></button>`).join('')}`;
  document.body.append(m);
  const r = btn.getBoundingClientRect(); const w = m.offsetWidth, h = m.offsetHeight;
  m.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w))}px`;
  m.style.top = `${r.bottom + 6 + h > window.innerHeight - 8 ? Math.max(8, r.top - h - 6) : r.bottom + 6}px`;
  const close = () => { m.remove(); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true); window.removeEventListener('scroll', close, true); };
  const out = (e) => { if (!m.contains(e.target) && !btn.contains(e.target)) close(); };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); btn.focus(); } };
  m.querySelectorAll('[data-mi]').forEach((b) => b.addEventListener('click', () => { const x = list[+b.dataset.mi]; close(); x?.run?.(); }));
  setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', key, true); window.addEventListener('scroll', close, true); });
  m.querySelector('button')?.focus();
  onCleanup(close);
}

async function homePage(comm = null) {
  const staff = isStaff();
  if (homeState.scope !== (comm?.id || '')) { homeState.scope = comm?.id || ''; homeState.tab = 'active'; homeState.mine = false; }
  app.innerHTML = `<div class="page">${header(comm ? 'comm' : 'home')}
    <section class="hero"><div class="grain-layer" aria-hidden="true"></div>
      ${comm ? '' : `<button type="button" class="hero-edit" data-hero-edit title="Personalizar o banner (só para ti)">${ICON.palette} Personalizar</button>`}
      <div class="wrap hero-in">
        <div>${comm ? `<div class="hero-comm">${isLogo(comm.logo_path) ? commMark(comm, 'hero-logo') : ''}<div><p class="hero-kicker">${isLogo(comm.logo_path) ? '' : `<i style="background:${esc(comm.color)}"></i>`}Comunidade · ${esc(ROLES[comm.my_role])}</p><h1 class="hero-h">${esc(comm.name)}</h1></div></div>` : `<p class="hero-kicker hero-kick-w" data-hero-kicker hidden></p><h1 class="hero-h" data-hero-title>${esc(heroTitle())}</h1>`}<p class="hero-p" data-hero>&nbsp;</p></div>
        ${staff ? `<button type="button" class="btn cream" data-new>${ICON.plus} Novo projeto</button>` : ''}
      </div>
    </section>
    <div class="wrap home-grid">
      <section aria-labelledby="h-proj" class="home-main">
        <div class="row between wrap-gap">
          <h2 id="h-proj" class="h2">${comm ? (staff ? 'Projetos' : 'Os teus projetos') : 'Os meus projetos'}</h2>
          <div class="seg dark" role="tablist" aria-label="Estado dos projetos">
            ${[['active', 'Em curso'], ['done', 'Finalizados'], ['archived', 'Arquivo'], ['hidden', 'Escondidos'], ...(isAdmin() ? [['trash', 'Reciclagem']] : [])].map(([k, v]) => `<button type="button" role="tab" aria-selected="${homeState.tab === k}" data-tab="${k}">${v}</button>`).join('')}
          </div>
        </div>
        <div class="proj-tools">
          <label class="search"><span class="vh">Procurar projetos</span>${ICON.search}<input type="search" data-q placeholder="Procurar por projeto ou artista…" value="${esc(homeState.q)}" autocomplete="off"></label>
          ${comm && staff ? `<div class="seg" role="tablist" aria-label="Que projetos mostrar">${[[false, 'Todos'], [true, 'Atribuídos a mim']].map(([k, v]) => `<button type="button" role="tab" aria-selected="${homeState.mine === k}" data-mine-f="${k}">${v}</button>`).join('')}</div>` : ''}
          <label class="sel"><span class="vh">Ordenar</span><select data-sort>${[['recent', 'Mais recentes'], ['az', 'Ordem alfabética'], ['due', 'Entrega mais próxima']].map(([k, v]) => `<option value="${k}" ${homeState.sort === k ? 'selected' : ''}>${v}</option>`).join('')}</select></label>
        </div>
        <div class="proj-grid" data-grid><p class="muted">A carregar…</p></div>
      </section>
      <aside class="home-side">
        ${comm ? `${comm.business && staff ? `<section class="panel">
          <div class="row between"><h2 class="h3">Central de Produção</h2><span class="tag internal">${ICON.lock}Interno</span></div>
          <div class="menu-list">
            <a href="#/c/${comm.id}/central">${ICON.board}<span><strong>Abrir a Central</strong><small>Visão geral, finanças e planeamento da comunidade</small></span>${ICON.chev}</a>
            <a href="#/c/${comm.id}/central/tarefas">${ICON.task}<span><strong>Tarefas internas</strong><small>O que não pertence a um projeto</small></span>${ICON.chev}</a>
          </div>
        </section>` : ''}
        ${isAdmin() ? `<section class="panel"><div class="row between"><h2 class="h3">Pessoas</h2><a href="#/c/${comm.id}/pessoas" class="small">Gerir</a></div><div class="av-stack" data-cpeople></div></section>` : ''}
        ${!staff ? '<section class="panel"><h2 class="h3">Acesso de convidado</h2><p class="muted">Vês apenas os projetos desta comunidade para os quais foste convidado.</p></section>' : ''}`
        : `<section class="panel">
          <div class="row between"><h2 class="h3">Comunidades</h2><button type="button" class="link-btn small" data-newcomm>${ICON.plus} Nova</button></div>
          <div class="menu-list comm-list">${state.comms.length ? state.comms.map((c) => `<a href="#/c/${c.id}">${commMark(c)}<span><strong>${esc(c.name)}</strong><small>${esc(ROLES[c.my_role])}${c.business ? ' · com Central' : ''}</small></span>${ICON.chev}</a>`).join('') : '<p class="muted small">Uma comunidade é um espaço partilhado (uma produtora, um coletivo): pessoas próprias, projetos dela e, se quiseres, a parte business com a Central de Produção.</p>'}</div>
        </section>`}
        <section class="panel">
          <div class="row between"><h2 class="h3">As minhas tarefas</h2><a href="${comm ? `#/c/${comm.id}/tarefas` : '#/tarefas'}" class="small">Ver todas</a></div>
          <ul class="mini-tasks" data-mine><li class="muted">A carregar…</li></ul>
          <a class="small muted" href="${BASE}tasks/" target="_blank" rel="noopener">Abrir no telemóvel</a>
        </section>
        <a class="side-link" href="#/equipamento">${ICON.camera || ICON.board} Base de dados de equipamento</a>
      </aside>
    </div></div>`;
  bindHeader(app);
  if (!comm) { const he = app.querySelector('.hero'); applyHero(he); heroEditor(he); }
  app.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => { homeState.tab = b.dataset.tab; homePage(comm); }));
  app.querySelector('[data-new]')?.addEventListener('click', () => newProject({ comm }));
  app.querySelector('[data-newcomm]')?.addEventListener('click', () => newCommunity());
  const cpe = app.querySelector('[data-cpeople]'); if (cpe) loadPeople().then((pp) => { cpe.innerHTML = pp.slice(0, 8).map((x) => `<span class="avatar sm" title="${esc(x.display_name)}" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span>`).join('') + (pp.length > 8 ? `<span class="avatar sm more">+${pp.length - 8}</span>` : ''); });

  const pq = sb.from('projects').select(PROJECT_COLS).eq('is_central', false).order('updated_at', { ascending: false });
  const [{ data: projects0 }, { data: tasks0 }, { data: myMem }, hidden, { data: pins }] = await Promise.all([
    comm ? pq.eq('community_id', comm.id) : pq.is('community_id', null),
    sb.from('tasks').select('id, project_id, title, status, due, assignee_id'),
    sb.from('project_members').select('project_id').eq('user_id', state.user.id),
    loadHidden(),
    sb.from('project_pins').select('project_id'),
  ]);
  const pinned = new Set((pins || []).map((x) => x.project_id));
  // no início também aparecem os projetos de comunidades que fixei (continuam a ser da comunidade)
  let projects = projects0 || [];
  if (!comm && pinned.size) { const { data: pp } = await sb.from('projects').select(PROJECT_COLS).in('id', [...pinned]).not('community_id', 'is', null); projects = [...projects, ...(pp || [])]; }
  const projIds = new Set(projects.map((x) => x.id));
  const tasks = (tasks0 || []).filter((t) => comm ? projIds.has(t.project_id) : true);
  // "atribuídos a mim": sou membro do projeto ou tenho tarefas lá
  const mineSet = new Set([...(myMem || []).map((m) => m.project_id), ...(tasks || []).filter((t) => t.assignee_id === state.user.id).map((t) => t.project_id), ...(projects || []).filter((x) => leadsOf(x).includes(state.user.id)).map((x) => x.id)]);
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
  if (hero) hero.textContent = staff || !comm ? `Tens ${mineOpen.length} ${mineOpen.length === 1 ? 'tarefa aberta' : 'tarefas abertas'} em ${new Set(mineOpen.map((t) => t.project_id)).size} projetos.` : `Tens acesso a ${(projects || []).length} ${projects?.length === 1 ? 'projeto' : 'projetos'}.`;

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
        <span class="on-cover-acts">${p.community_id && pinned.has(p.id) ? `<span class="icon-btn on-cover on pin-mark" title="Fixado no teu início">${ICON.pin}</span>` : ''}<button type="button" class="icon-btn on-cover" data-more="${p.id}" aria-haspopup="menu" aria-label="Opções de ${esc(p.name)}">${ICON.dots}</button></span>
      </div>
      <div class="proj-body">
        <div><div class="proj-name" ${staff ? `data-rename="${p.id}" title="Duplo clique para mudar o nome"` : ''}>${p.kind === 'album' ? `<span class="fold-ic">${ICON.board}</span>` : ''}<span class="pn-txt">${esc(p.name)}</span></div><div class="muted small">${esc(p.client || '—')}${par ? ` · em ${esc(par.name)}` : ''}</div>${!comm && p.community_id ? (() => { const c = commById(p.community_id); return c ? `<span class="comm-chip" style="--cc:${esc(c.color)}">${esc(c.name)}</span>` : ''; })() : ''}</div>
        ${p.kind === 'album' ? `<div class="fold-kids">${kids.length ? kids.slice(0, 4).map((k) => `<span>${esc(k.name)}</span>`).join('') + (kids.length > 4 ? `<span>+${kids.length - 4}</span>` : '') : '<span class="muted">Sem projetos lá dentro</span>'}</div>` : ''}
        <div class="proj-prog"><div class="row between small muted"><span>${esc(ph.label || 'Sem datas')}</span><span>${n} ${n === 1 ? 'tarefa aberta' : 'tarefas abertas'}</span></div>
        <div class="bar"><i style="width:${Math.round(ph.pct * 100)}%"></i></div></div>
      </div>
    </article>`;
  }).join('') : `<p class="empty-note">${homeState.q ? `Nenhum projeto com "${esc(homeState.q)}".` : homeState.mine ? 'Não estás atribuído a nenhum projeto aqui.' : homeState.tab === 'active' ? (staff ? 'Ainda não há projetos em curso. Cria o primeiro em "Novo projeto".' : 'Ainda não foste convidado para nenhum projeto em curso.') : 'Nada aqui.'}</p>`;
  grid.querySelectorAll('[data-trashp]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault(); e.stopPropagation(); const p = list.find((x) => x.id === b.dataset.trashp);
    if (!(await confirmBox(`Apagar "${p.name}"? Vai para a reciclagem e só é apagado de vez daqui a 10 dias. Até lá, qualquer pessoa da equipa o pode recuperar.`, 'Mandar para a reciclagem'))) return;
    const { error } = await sb.rpc('trash_project', { p: p.id });
    if (error) return toast(error.message);
    projects = projects.filter((x) => x.id !== p.id); toast(`"${p.name}" foi para a reciclagem. Podes recuperá-lo durante 10 dias.`); drawGrid();
  }));
  // mudar o nome ali mesmo: duplo clique no nome
  grid.querySelectorAll('[data-rename]').forEach((el) => {
    // um clique abre o projeto (como o resto do cartão); dois cliques mudam o nome
    let t = null;
    el.addEventListener('click', (e) => { e.preventDefault(); if (el.querySelector('input')) return; clearTimeout(t); t = setTimeout(() => go(`#/p/${el.dataset.rename}`), 260); });
    el.addEventListener('dblclick', (e) => {
      e.preventDefault(); e.stopPropagation(); clearTimeout(t); if (el.querySelector('input')) return;
      const p = list.find((x) => x.id === el.dataset.rename); const txt = el.querySelector('.pn-txt');
      const inp = document.createElement('input'); inp.className = 'pn-rename'; inp.value = p.name; inp.setAttribute('aria-label', 'Nome do projeto');
      txt.replaceWith(inp); el.closest('.proj-card').classList.add('renaming'); inp.focus(); inp.select();
      let done = false;
      const finish = async (ok) => {
        if (done) return; done = true; const v = inp.value.trim();
        if (ok && v && v !== p.name) { const { error } = await sb.from('projects').update({ name: v }).eq('id', p.id); if (error) toast(error.message); else { p.name = v; projCache.delete(p.id); toast('Nome mudado.'); } }
        drawGrid();
      };
      inp.addEventListener('keydown', (k) => { k.stopPropagation(); if (k.key === 'Enter') finish(true); else if (k.key === 'Escape') finish(false); });
      inp.addEventListener('click', (k) => { k.preventDefault(); k.stopPropagation(); });
      inp.addEventListener('blur', () => finish(true));
    });
  });
  // ⋯ do cartão: um menu curto com o que se faz mais vezes; o formulário completo fica em "Todos os detalhes"
  grid.querySelectorAll('[data-more]').forEach((b) => b.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation(); const p = list.find((x) => x.id === b.dataset.more); if (!p) return;
    const card = b.closest('.proj-card');
    const setStatus = async (v) => { const { error } = await sb.from('projects').update({ status: v }).eq('id', p.id); if (error) return toast(error.message); p.status = v; projCache.delete(p.id); toast({ active: 'Está em curso.', done: 'Marcado como finalizado.', archived: 'Foi para o arquivo.' }[v]); drawGrid(); };
    const pickCover = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = async () => { try { toast('A enviar a capa…'); const up = await uploadImage(p.id, 'cover', inp.files[0]); const { error } = await sb.from('projects').update({ cover_path: up.path }).eq('id', p.id); if (error) throw error; projCache.delete(p.id); toast('Capa mudada.'); homePage(comm); } catch (er) { toast(er.message || String(er)); } }; inp.click(); };
    popMenu(b, p.name, [
      { label: 'Abrir', icon: ICON.open, run: () => go(`#/p/${p.id}`) },
      staff && { label: 'Mudar o nome', icon: ICON.title, run: () => card.querySelector('[data-rename]')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })) },
      staff && { label: p.cover_path ? 'Mudar a capa…' : 'Pôr uma capa…', icon: ICON.image, run: pickCover },
      staff && p.cover_path && { label: 'Tirar a capa', icon: ICON.close, run: async () => { await sb.from('projects').update({ cover_path: null }).eq('id', p.id); projCache.delete(p.id); toast('Capa tirada.'); homePage(comm); } },
      '-',
      ...(staff ? [['active', 'Em curso'], ['done', 'Finalizado'], ['archived', 'Arquivado']].map(([k, l]) => ({ label: l, check: p.status === k, run: () => p.status !== k && setStatus(k) })) : []),
      '-',
      p.community_id && { label: pinned.has(p.id) ? 'Tirar do meu início' : 'Fixar no meu início', icon: ICON.pin, run: () => togglePin(p.id) },
      { label: 'Tirar da minha lista', icon: ICON.hide, run: () => hideMine(p) },
      staff && { label: 'Todos os detalhes…', icon: ICON.dots, run: () => projectDetailsModal(p, () => homePage(comm)) },
      isAdmin() && '-',
      isAdmin() && { label: 'Apagar', icon: ICON.trash, danger: true, run: () => trashOne(p) },
    ]);
  }));
  const togglePin = async (id) => {
    const r = pinned.has(id) ? await sb.from('project_pins').delete().eq('project_id', id).eq('user_id', state.user.id) : await sb.from('project_pins').insert({ project_id: id });
    if (r.error) return toast(r.error.message);
    if (pinned.has(id)) { pinned.delete(id); toast('Saiu do teu início.'); if (!comm) { projects = projects.filter((x) => x.id !== id); } } else { pinned.add(id); toast('Fixado no teu início.'); }
    drawGrid();
  };
  const hideMine = async (p) => {
    if (!(await hideProject(p.id))) return;
    hidden.set(p.id, new Date().toISOString());
    toast(`"${p.name}" saiu da tua lista. Para o resto da equipa continua igual; voltas a mostrá-lo em "Escondidos".`); drawGrid();
  };
  const trashOne = async (p) => {
    if (!(await confirmBox(`Apagar "${p.name}"? Vai para a reciclagem e só é apagado de vez daqui a 10 dias. Até lá, qualquer pessoa da equipa o pode recuperar.`, 'Mandar para a reciclagem'))) return;
    const { error } = await sb.rpc('trash_project', { p: p.id });
    if (error) return toast(error.message);
    projects = projects.filter((x) => x.id !== p.id); toast(`"${p.name}" foi para a reciclagem. Podes recuperá-lo durante 10 dias.`); drawGrid();
  };
  grid.querySelectorAll('[data-pin]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault(); const id = b.dataset.pin;
    const r = pinned.has(id) ? await sb.from('project_pins').delete().eq('project_id', id).eq('user_id', state.user.id) : await sb.from('project_pins').insert({ project_id: id });
    if (r.error) return toast(r.error.message);
    if (pinned.has(id)) { pinned.delete(id); toast('Saiu do teu início.'); if (!comm) { projects = projects.filter((x) => x.id !== id); } } else { pinned.add(id); toast('Fixado no teu início.'); }
    drawGrid();
  }));
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

// novo projeto, por passos: 1) nome e categoria; 2) fase e departamentos. O resto (artista, datas, líderes, capa,
// orçamento) junta-se depois, dentro do projeto (Detalhes).
const BASE_DEPTS = [{ id: 'criativo', name: 'Criativo', color: '#7C5CFF' }, { id: 'producao', name: 'Produção', color: '#F08A24' }, { id: 'imagem', name: 'Imagem', color: '#2FB67C' }, { id: 'pos', name: 'Pós-produção', color: '#E3B341' }, { id: 'digital', name: 'Digital', color: '#2AA8C9' }, { id: 'cliente', name: 'Cliente', color: '#E5579B' }];
const DEPT_COLORS = ['#7C5CFF', '#F08A24', '#2FB67C', '#E3B341', '#2AA8C9', '#E5579B', '#1F8A8A', '#E5484D', '#8A8A99'];
async function newProject(opts = {}) {
  const parent = opts.parent && opts.parent.id ? opts.parent : null;
  // o projeto fica na comunidade onde estou (ou na da pasta); fora de comunidades é pessoal
  const commId = parent ? parent.community_id || null : opts.comm?.id || CID();
  const fq = sb.from('projects').select('id, name').eq('kind', 'album').is('deleted_at', null).order('name');
  const { data: folders } = await (commId ? fq.eq('community_id', commId) : fq.is('community_id', null));
  const st = { step: 1, name: '', kind: parent ? 'videoclipe' : 'videoclipe', parent_id: parent?.id || '', stage: 'pre', depts: null };
  const kinds = Object.entries(KINDS).filter(([k]) => k !== 'central' && (!parent || k !== 'album'));
  const m = modal('<div data-np></div>');
  const box = m.el.querySelector('[data-np]');
  const deptsFor = (k) => JSON.parse(JSON.stringify(k === 'ficcao' ? FICTION_DEPTS : BASE_DEPTS)).map((d) => ({ ...d, on: true }));
  const draw = () => {
    const where = !parent ? `<p class="muted small">${commId ? `Na comunidade <b>${esc(commById(commId)?.name || '')}</b>: a equipa da comunidade tem acesso.` : 'Projeto pessoal: só tu e quem convidares.'}</p>` : '';
    const steps = '';
    if (st.step === 1) {
      box.innerHTML = `<h2>${parent ? `Novo projeto em ${esc(parent.name)}` : 'Novo projeto'}</h2>${where}${steps}
        <form class="stack" data-s1>
          <div class="field"><label for="pn">Nome do projeto</label><input id="pn" name="name" value="${esc(st.name)}" required autocomplete="off"></div>
          <fieldset class="np-kinds"><legend>Categoria</legend>${kinds.map(([k, v]) => `<label class="np-k"><input type="radio" name="kind" value="${k}" ${st.kind === k ? 'checked' : ''}><span>${esc(v)}</span></label>`).join('')}</fieldset>
          ${(folders || []).length ? `<div class="field" data-parentf ${st.kind === 'album' ? 'hidden' : ''}><label for="pp">Dentro de</label><select id="pp" name="parent_id"><option value="">— nenhuma pasta —</option>${folders.map((f) => `<option value="${f.id}" ${st.parent_id === f.id ? 'selected' : ''}>${esc(f.name)}</option>`).join('')}</select></div>` : ''}
          <p class="muted small" data-albhint ${st.kind === 'album' ? '' : 'hidden'}>Um álbum é uma pasta: junta os videoclipes e lançamentos do mesmo artista.</p>
          <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">${st.kind === 'album' ? 'Criar álbum' : 'Seguinte'}</button></div>
        </form>`;
      const f = box.querySelector('[data-s1]');
      f.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', () => { st.name = f.name.value; st.kind = r.value; st.parent_id = f.parent_id?.value || st.parent_id; st.depts = null; draw(); box.querySelector('#pn').focus(); }));
      f.addEventListener('submit', (e) => { e.preventDefault(); st.name = f.name.value.trim(); st.parent_id = f.parent_id?.value || ''; if (!st.name) return; if (st.kind === 'album') return create(); st.step = 2; draw(); });
      setTimeout(() => { const n = box.querySelector('#pn'); n?.focus(); n?.setSelectionRange(n.value.length, n.value.length); }, 30);
      return;
    }
    if (!st.depts) st.depts = deptsFor(st.kind);
    const opts = stageOptions(st.kind);
    box.innerHTML = `<h2>${esc(st.name)}</h2>${steps}
      <form class="stack" data-s2>
        <fieldset class="stage-pick"><legend>Em que fase está o projeto?</legend><div class="stage-opts">${opts.map(([v, l], i) => `<label class="stage-o"><input type="radio" name="stage" value="${v}" ${st.stage === v ? 'checked' : ''}><span><b>${i + 1}</b>${esc(l)}</span></label>`).join('')}</div></fieldset>
        <fieldset class="np-depts"><legend>Departamentos</legend><p class="muted small">Tira os que não precisas ou junta outros. Podes mudar depois em Detalhes.</p>
          <div class="np-dl">${st.depts.map((d, i) => `<label class="np-d ${d.on ? '' : 'off'}"><input type="checkbox" data-di="${i}" ${d.on ? 'checked' : ''}><i style="background:${esc(d.color)}"></i><input class="np-dn" data-dn="${i}" value="${esc(d.name)}" aria-label="Nome do departamento"></label>`).join('')}</div>
          <button type="button" class="link-btn small" data-dadd>${ICON.plus} Departamento</button></fieldset>
        <div class="row between"><button type="button" class="btn ghost" data-back>${ICON.back || '←'} Voltar</button><button class="btn primary">Criar projeto</button></div>
      </form>`;
    const f = box.querySelector('[data-s2]');
    f.querySelectorAll('[name=stage]').forEach((r) => r.addEventListener('change', () => { st.stage = r.value; }));
    f.querySelectorAll('[data-di]').forEach((c) => c.addEventListener('change', () => { st.depts[+c.dataset.di].on = c.checked; c.closest('.np-d').classList.toggle('off', !c.checked); }));
    f.querySelectorAll('[data-dn]').forEach((x) => x.addEventListener('input', () => { st.depts[+x.dataset.dn].name = x.value; }));
    f.querySelector('[data-dadd]').addEventListener('click', () => { const n = st.depts.length; st.depts.push({ id: 'd' + Math.random().toString(36).slice(2, 7), name: 'Novo departamento', color: DEPT_COLORS[n % DEPT_COLORS.length], on: true }); draw(); const ins = box.querySelectorAll('[data-dn]'); const last = ins[ins.length - 1]; last?.focus(); last?.select(); });
    f.querySelector('[data-back]').addEventListener('click', () => { st.step = 1; draw(); });
    f.addEventListener('submit', (e) => { e.preventDefault(); create(); });
  };
  let busy = false;
  const create = async () => {
    if (busy) return; busy = true;
    const kind = st.kind; const stage = kind === 'album' ? null : st.stage || 'pre';
    const modules = { list: [...(TEMPLATES[kind] || TEMPLATES.default)], removed: [] };
    const departments = kind === 'album' ? undefined : (st.depts || deptsFor(kind)).filter((d) => d.on && d.name.trim()).map(({ id, name, color }) => ({ id, name: name.trim(), color }));
    const so = stageOptions(kind).map(([k]) => k);
    const row = { community_id: commId, name: st.name, client: '', kind, stage, parent_id: kind !== 'album' && st.parent_id ? st.parent_id : null, modules,
      ...(kind === 'album' ? {} : { layouts: { stages: so.slice(0, Math.max(1, so.indexOf(stage) + 1)) }, departments }) };
    const { data, error } = await sb.from('projects').insert(row).select(PROJECT_COLS).single();
    if (error) { busy = false; return toast(error.message); }
    await sb.from('project_members').insert({ project_id: data.id, user_id: state.user.id });
    clearPeopleCache();
    m.close(); go(`#/p/${data.id}`);
  };
  draw();
}

// ---------- detalhes do projeto ----------
// Compacto: capa, nome e artista em cima; tipo, estado, fase e datas numa linha; líderes e departamentos em
// "pílulas"; o resto (pasta, orçamento, tirar da lista, apagar) fica em "Mais opções".
function detailsForm(p) {
  const cover = p.cover_path ? knownUrl(p.cover_path) : null;
  const sel = (name, label, opts, cur) => `<label class="pd-pill"><span>${label}</span><select name="${name}">${opts.map(([k, l]) => `<option value="${esc(k)}" ${(cur || '') === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
  const more = !p.is_central && ((p._folders && p._folders.length) || p.canBudget);
  return `<form class="pd" data-details>
    <div class="pd-head">
      ${p.is_central ? '' : `<button type="button" class="pd-cover ${p.cover_path ? 'has' : ''}" data-cover title="${p.cover_path ? 'Mudar a capa' : 'Pôr uma capa'}" aria-label="${p.cover_path ? 'Mudar a capa' : 'Pôr uma capa'}" ${cover ? `style="background-image:url('${esc(cover)}')"` : ''}>${p.cover_path ? '' : ICON.image}</button>`}
      <div class="pd-id">
        <input class="pd-name" name="name" value="${esc(p.name)}" placeholder="Nome do projeto" aria-label="Nome" required ${p.is_central ? 'readonly' : ''}>
        ${p.is_central ? '' : `<input class="pd-client" name="client" value="${esc(p.client)}" placeholder="Artista ou marca" aria-label="Artista ou marca">`}
        ${p.cover_path && !p.is_central ? '<button type="button" class="link-btn small" data-nocover>Tirar a capa</button>' : ''}
      </div>
    </div>
    ${p.is_central ? '' : `<div class="pd-row">
      ${sel('kind', 'Tipo', Object.entries(KINDS).filter(([k]) => k !== 'central'), p.kind)}
      ${sel('status', 'Estado', [['active', 'Em curso'], ['done', 'Finalizado'], ['archived', 'Arquivo']], p.status)}
      ${sel('stage', 'Fase', [['', 'Pelas datas'], ...stageOptions(p.kind)], p.stage)}
    </div>
    <div class="pd-row">
      <label class="pd-pill"><span>Começa</span><input name="starts_on" type="date" value="${esc(p.starts_on || '')}"></label>
      <span class="pd-arrow" aria-hidden="true">→</span>
      <label class="pd-pill"><span>Entrega</span><input name="ends_on" type="date" value="${esc(p.ends_on || '')}"></label>
    </div>
    <div class="pd-sec"><span class="pd-lab">Líderes</span><div class="pm-leads in-form" data-leadsform></div></div>`}
    <div class="pd-sec"><span class="pd-lab">Departamentos</span>
      <div class="pd-depts">${(p.departments || []).map((d, i) => `<span class="pd-dept" style="--c:${esc(d.color)}"><label class="pd-dc" title="Mudar a cor"><input type="color" value="${esc(d.color)}" data-dcolor="${i}" aria-label="Cor de ${esc(d.name)}"></label><input class="pd-dn" value="${esc(d.name)}" size="${Math.max(3, (d.name || '').length + 1)}" data-dname="${i}" aria-label="Nome do departamento"><button type="button" class="pd-dx" data-drm="${i}" aria-label="Tirar ${esc(d.name)}" title="Tirar">${ICON.close}</button></span>`).join('')}
        <button type="button" class="pd-dadd" data-dadd>${ICON.plus} Departamento</button></div>
    </div>
    ${more ? `<details class="pd-more"><summary>Mais opções</summary><div class="pd-row">
      ${p._folders && p._folders.length ? sel('parent_id', 'Pasta', [['', '— nenhuma —'], ...p._folders.map((f) => [f.id, f.name])], p.parent_id) : ''}
      ${p.canBudget ? `<label class="pd-pill"><span>Orçamento (€) ${ICON.lock}</span><input name="value" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(p.value ?? '')}" placeholder="privado"></label>` : ''}
    </div></details>` : ''}
    <div class="row between pd-foot">
      <span class="row wrap-gap">${!p.is_central ? `<button type="button" class="link-btn small" data-hidep title="Os outros continuam a vê-lo">${ICON.hide} Tirar da minha lista</button>` : ''}${isAdmin() && !p.is_central ? `<button type="button" class="link-btn small danger-text" data-delp title="Vai para a reciclagem para toda a gente">${ICON.trash} Apagar para todos</button>` : ''}</span>
      <button class="btn primary">Guardar</button>
    </div>
  </form>`;
}
function bindDetails(root, p, after) {
  { const lf = root.querySelector('[data-leadsform]'); if (lf) drawLeads(lf, p); }
  const pSel = root.querySelectorAll('select[data-person]');
  if (pSel.length) loadPeople().then((people) => pSel.forEach((sel) => { const cur = sel.dataset.person; sel.insertAdjacentHTML('beforeend', people.filter((x) => x.role !== 'guest' || x.id === cur).map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.display_name)}</option>`).join('')); }));
  const form = root.querySelector('[data-details]');
  const depts = JSON.parse(JSON.stringify(p.departments || []));
  const redraw = () => { root.innerHTML = detailsForm({ ...p, departments: depts }); bindDetails(root, { ...p, departments: depts }, after); };
  form.querySelectorAll('[data-dcolor]').forEach((i) => i.addEventListener('input', () => (depts[+i.dataset.dcolor].color = i.value)));
  form.querySelectorAll('[data-dname]').forEach((i) => i.addEventListener('input', () => { depts[+i.dataset.dname].name = i.value; i.size = Math.max(3, i.value.length + 1); }));
  form.querySelectorAll('[data-dcolor]').forEach((i) => i.addEventListener('input', () => i.closest('.pd-dept')?.style.setProperty('--c', i.value)));
  { const cv = form.querySelector('.pd-cover.has'); if (cv && !cv.style.backgroundImage && p.cover_path) signedUrls([p.cover_path]).then((m) => { if (m[p.cover_path]) cv.style.backgroundImage = `url('${m[p.cover_path]}')`; }).catch(() => {}); }
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
    toast(`"${p.name}" saiu da tua lista. Para o resto da equipa continua igual; voltas a mostrá-lo em "Escondidos", no início.`); go(p.community_id ? `#/c/${p.community_id}` : '#/');
  });
  form.querySelector('[data-delp]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar "${p.name}"? Vai para a reciclagem e só é apagado de vez daqui a 10 dias. Até lá, qualquer pessoa da equipa o pode recuperar.`, 'Mandar para a reciclagem'))) return;
    const { error } = await sb.rpc('trash_project', { p: p.id });
    if (error) return toast(error.message);
    document.querySelector('#modal')?.replaceChildren();
    toast('Foi para a reciclagem. Podes recuperá-lo durante 10 dias, no separador "Reciclagem".'); homeState.tab = 'active'; go(p.community_id ? `#/c/${p.community_id}` : '#/');
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    const patch = { departments: depts.filter((d) => d.name.trim()), updated_at: new Date().toISOString() };
    if (!p.is_central) if (!p.is_central && f.stage && !stagesOn(p).includes(f.stage)) patch.layouts = { ...(p.layouts || {}), stages: [...stagesOn(p), f.stage] };
    if (!p.is_central) Object.assign(patch, { name: f.name.trim(), client: f.client.trim(), kind: f.kind, status: f.status, stage: f.stage || null, starts_on: f.starts_on || null, ends_on: f.ends_on || null });
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
  // a equipa sem conta e quem vê o orçamento pedem-se já, ao mesmo tempo que o resto
  const crewP = p.is_central ? null : sb.from('project_crew').select('*').eq('project_id', p.id).order('created_at');
  const accP = p.canBudget ? budgetAccess(p) : null;
  const [{ data: members }, people, { data: invites }] = await Promise.all([
    sb.from('project_members').select('user_id, added_at, depts, job, phone, email, can_edit').eq('project_id', p.id),
    loadPeople(),
    isStaff() ? sb.from('invites').select('id, email, created_at, expires_at, used_at').eq('project_id', p.id).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
  ]);
  const staff = people.filter((x) => x.role !== 'guest');
  const guests = people.filter((x) => x.role === 'guest' && (members || []).some((m) => m.user_id === x.id));
  const inv = (invites || []);
  const istate = (i) => (i.used_at ? `Usado a ${fmtDate(i.used_at)}` : new Date(i.expires_at) < new Date() ? 'Expirou' : `Válido até ${fmtDate(i.expires_at)}`);
  root.innerHTML = `
    <section class="stack">
      ${p.is_central ? `<h3 class="h3">Equipa de ${esc(state.ctx?.comm?.name || '')}</h3><p class="muted small">Todos os membros e administradores da comunidade têm acesso à Central.</p>` : ''}
      ${p.is_central ? `<ul class="people">${staff.map((x) => `<li><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}</span><span class="muted small">${esc(ROLES[x.role])}</span></li>`).join('')}</ul>` : '<div data-crew></div>'}
    </section>
    ${p.canBudget ? `<section class="stack">
      <h3 class="h3">${ICON.lock} Quem vê o orçamento</h3>
      <p class="muted small">Quem não estiver aqui não vê o orçamento nem o valor do projeto em lado nenhum.</p>
      <div data-budgetacc></div>
    </section>` : ''}
    ${p.is_central ? '' : `<section class="stack">
      <h3 class="h3">Convidados externos</h3>
      ${guests.length ? `<ul class="people">${guests.map((x) => { const gm = (members || []).find((m) => m.user_id === x.id); return `<li><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}</span>${isStaff() && p.canEdit !== false ? `<select class="acc-sel" data-gacc="${x.id}" aria-label="Acesso de ${esc(x.display_name)}"><option value="1" ${gm?.can_edit !== false ? 'selected' : ''}>Pode editar</option><option value="0" ${gm?.can_edit === false ? 'selected' : ''}>Só leitura</option></select><button type="button" class="link-btn danger-text" data-rmguest="${x.id}">Tirar do projeto</button>` : gm?.can_edit === false ? '<span class="ro-tag">Só leitura</span>' : ''}</li>`; }).join('')}</ul>` : '<p class="muted small">Ainda ninguém de fora.</p>'}
    </section>
    ${isStaff() && p.canEdit !== false ? `<section class="stack">
      <h3 class="h3">Convidar pessoa externa</h3>
      <p class="muted small">Gera um código que só funciona uma vez, para este email e este projeto. Vale 14 dias.</p>
      <form class="row wrap-gap" data-invite><input type="email" name="email" placeholder="email@exemplo.com" aria-label="Email da pessoa" required><select name="acc" aria-label="Acesso" class="acc-sel"><option value="1">Pode editar</option><option value="0">Só leitura</option></select><button class="btn primary">Gerar código</button></form>
      <div data-code></div>
      ${inv.length ? `<ul class="invites">${inv.map((i) => `<li><span>${esc(i.email)}</span><span class="muted small">${istate(i)}</span>${!i.used_at ? `<button type="button" class="icon-btn" data-rminv="${i.id}" aria-label="Anular convite">${ICON.trash}</button>` : ''}</li>`).join('')}</ul>` : ''}
    </section>` : ''}`}`;
  const acc = root.querySelector('[data-budgetacc]'); if (acc) budgetAccessPanel(acc, p, undefined, accP);
  const crewEl = root.querySelector('[data-crew]'); if (crewEl) crewPanel(crewEl, p, people, members || [], () => projectTeam(root, p), crewP);
  root.querySelector('[data-invite]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = e.target.email.value.trim();
    const { data: code, error } = await sb.rpc('create_invite_as', { p_project: p.id, p_email: email, p_can_edit: e.target.acc.value !== '0' });
    if (error) return toast(error.message);
    const url = location.origin + BASE;
    const msg = `Olá! Foste convidado para o projeto "${p.name}" no byGrain Studio.\n\n1. Entra em ${url}\n2. Escolhe "Tenho um código"\n3. Usa o email ${email} e o código ${code}\n\nO código só funciona uma vez e vale 14 dias.`;
    root.querySelector('[data-code]').innerHTML = `<div class="code-box"><div class="code">${esc(code)}</div><p class="muted small">Copia já: por segurança, o código não volta a ser mostrado.</p><textarea rows="6" readonly>${esc(msg)}</textarea><button type="button" class="btn ghost" data-copy>${ICON.copy} Copiar mensagem</button></div>`;
    root.querySelector('[data-copy]').addEventListener('click', async () => { try { await navigator.clipboard.writeText(msg); toast('Copiado.'); } catch { root.querySelector('.code-box textarea').select(); } });
    e.target.reset();
  });
  root.querySelectorAll('[data-gacc]').forEach((sel) => sel.addEventListener('change', async () => {
    const { error } = await sb.from('project_members').update({ can_edit: sel.value !== '0' }).eq('project_id', p.id).eq('user_id', sel.dataset.gacc);
    toast(error ? error.message : sel.value === '0' ? 'Passa a ter acesso só de leitura.' : 'Passa a poder editar.');
  }));
  root.querySelectorAll('[data-rmguest]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('Tirar esta pessoa do projeto?', 'Tirar'))) return;
    await sb.from('project_members').delete().eq('project_id', p.id).eq('user_id', b.dataset.rmguest); projectTeam(root, p);
  }));
  root.querySelectorAll('[data-rminv]').forEach((b) => b.addEventListener('click', async () => { await sb.from('invites').delete().eq('id', b.dataset.rminv); projectTeam(root, p); }));
}

// ---------- equipa do projeto por departamento ----------
// Pessoas da Grain (project_members) e pessoas sem conta (project_crew), cada uma com função e departamentos.
async function crewPanel(el, p, people, members, reload, crewP) {
  const { data: crewRows } = await (crewP || sb.from('project_crew').select('*').eq('project_id', p.id).order('created_at'));
  const depts = p.departments || [];
  const byId = new Map(people.map((x) => [x.id, x]));
  const list = [
    ...members.filter((m) => byId.has(m.user_id) && byId.get(m.user_id).role !== 'guest').map((m) => { const x = byId.get(m.user_id); const phone = m.phone || x.phone || ''; return { t: 'm', id: m.user_id, canEdit: m.can_edit !== false, name: x.display_name, color: x.color, job: m.job || '', depts: m.depts || [], sub: [phone, m.email].filter(Boolean).join(' · ') || ROLES[x.role], phone, email: m.email || '' }; }),
    ...(crewRows || []).map((c) => ({ t: 'c', id: c.id, name: c.name, color: '#5A5A66', job: c.job || '', depts: c.depts || [], sub: [c.phone, c.email].filter(Boolean).join(' · ') || 'sem conta no studio', email: c.email, phone: c.phone })),
  ];
  const canEdit = isStaff() && p.canEdit !== false;
  const dchip = (id) => { const d = depts.find((x) => x.id === id); return d ? `<span class="dchip" style="--dc:${esc(d.color)}">${esc(d.name)}</span>` : ''; };
  const row = (x) => `<li class="crew-row"><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.name))}</span>
    <span class="crew-n"><b>${esc(x.name)}</b><small class="muted">${esc(x.job || x.sub || '')}${x.job && x.sub ? ` · ${esc(x.sub)}` : ''}</small></span>
    <span class="crew-d">${x.depts.map(dchip).join('')}${x.t === 'm' && !x.canEdit ? '<span class="ro-tag" title="Vê o projeto mas não muda nada">Só leitura</span>' : ''}</span>
    ${canEdit ? `<span class="crew-a"><button type="button" class="link-btn" data-cedit="${x.t}:${x.id}">Editar</button><button type="button" class="link-btn danger-text" data-crm="${x.t}:${x.id}">Tirar</button></span>` : ''}</li>`;
  const groups = depts.map((d) => ({ d, xs: list.filter((x) => x.depts.includes(d.id)) }));
  const none = list.filter((x) => !x.depts.some((id) => depts.some((d) => d.id === id)));
  el.innerHTML = `<div class="row between wrap-gap"><div><h3 class="h3">Equipa do projeto</h3><p class="muted small">Quem trabalha neste projeto, por departamento. ${p.community_id ? 'Os membros da comunidade têm sempre acesso.' : 'Num projeto pessoal só entra quem está aqui.'}</p></div>${canEdit ? `<button type="button" class="btn primary" data-cadd>${ICON.plus} Adicionar pessoa</button>` : ''}</div>
    ${groups.map((g) => `<div class="crew-g"><div class="crew-hrow"><h4 class="crew-h"><i style="background:${esc(g.d.color)}"></i>${esc(g.d.name)} <span class="muted">${g.xs.length}</span></h4>${canEdit ? `<button type="button" class="link-btn" data-cadd-d="${esc(g.d.id)}">${ICON.plus} Juntar a ${esc(g.d.name)}</button>` : ''}</div>${g.xs.length ? `<ul class="crew">${g.xs.map(row).join('')}</ul>` : '<p class="crew-empty muted small">Ninguém neste departamento.</p>'}</div>`).join('')}
    ${none.length ? `<div class="crew-g"><div class="crew-hrow"><h4 class="crew-h"><i></i>Sem departamento <span class="muted">${none.length}</span></h4></div><ul class="crew">${none.map(row).join('')}</ul></div>` : ''}
    ${!list.length && !depts.length ? `<p class="empty-note">Ainda ninguém na equipa.${canEdit ? ' Usa “Adicionar pessoa”.' : ''}</p>` : ''}`;
  const form = (x, preDept) => {
    const isNew = !x; const inProj = (id) => members.find((m) => m.user_id === id);
    const free = people.filter((y) => y.role !== 'guest');
    const m = modal(`<h2>${isNew ? 'Adicionar pessoa' : esc(x.name)}</h2><form class="stack" data-cf>
      ${isNew ? `<div class="seg dark" role="tablist"><button type="button" role="tab" aria-selected="true" data-ct="m">Com conta</button><button type="button" role="tab" aria-selected="false" data-ct="c">Sem conta</button></div>
        <div class="field" data-for="m"><label for="cu">Pessoa</label><select id="cu" name="user_id">${free.map((y) => `<option value="${y.id}">${esc(y.display_name)}${inProj(y.id) ? ' — já está no projeto' : ''}</option>`).join('')}</select></div>
        <div data-for="c" hidden class="field"><label for="cn2">Nome</label><input id="cn2" name="name"></div>`
        : x.t === 'c' ? `<div class="field"><label for="cn2">Nome</label><input id="cn2" name="name" value="${esc(x.name)}" required></div>` : ''}
      <div class="grid2"><div class="field"><label for="cp">Telefone</label><input id="cp" name="phone" type="tel" inputmode="tel" value="${esc(x?.phone || '')}" placeholder="912 345 678"></div><div class="field"><label for="ce">Email</label><input id="ce" name="email" type="email" value="${esc(x?.email || '')}"></div></div>
      <p class="muted small">O contacto fica associado a esta pessoa: aparece sozinho na folha de contactos, na folha de serviço e no mapa de transportes.</p>
      <div class="field"><label for="cj">Função</label><input id="cj" name="job" value="${esc(x?.job || '')}" placeholder="Ex.: Gaffer, 1.º AC, Produtora" list="crew-jobs"></div>
      ${isNew || x.t === 'm' ? `<fieldset class="acc-pick" ${isNew ? 'data-for="m"' : ''}><legend>Acesso ao projeto</legend>
        <label><input type="radio" name="acc" value="1" ${!x || x.canEdit ? 'checked' : ''}><span><b>Pode editar</b><small>Cria, muda e apaga nas páginas que vê.</small></span></label>
        <label><input type="radio" name="acc" value="0" ${x && !x.canEdit ? 'checked' : ''}><span><b>Só leitura</b><small>Vê as páginas que lhe estão abertas, sem mudar nada. Pode marcar as tarefas que são dele.</small></span></label>
        ${p.community_id ? '<small class="muted">Os administradores da comunidade e os líderes do projeto podem sempre editar.</small>' : ''}</fieldset>` : ''}
      <fieldset class="dpick"><legend>Departamentos</legend>${depts.length ? depts.map((d) => `<label><input type="checkbox" name="dept" value="${esc(d.id)}" ${x?.depts.includes(d.id) || (isNew && preDept === d.id) ? 'checked' : ''}><span style="--dc:${esc(d.color)}">${esc(d.name)}</span></label>`).join('') : '<p class="muted small">Este projeto ainda não tem departamentos (Detalhes → Departamentos e cores).</p>'}</fieldset>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">${isNew ? 'Adicionar' : 'Guardar'}</button></div></form>
      <datalist id="crew-jobs">${['Realização', 'Produção', 'Direção de fotografia', '1.º assistente de câmara', '2.º assistente de câmara', 'Gaffer', 'Eletricista', 'Maquinista', 'Direção de arte', 'Adereços', 'Guarda-roupa', 'Cabelos e maquilhagem', 'Som direto', 'Montagem', 'Cor', 'Assistente de produção', 'Making of'].map((j) => `<option value="${j}">`).join('')}</datalist>`, { wide: true });
    let tab = 'm';
    m.el.querySelectorAll('[data-ct]').forEach((b) => b.addEventListener('click', () => { tab = b.dataset.ct; m.el.querySelectorAll('[data-ct]').forEach((y) => y.setAttribute('aria-selected', y === b)); m.el.querySelectorAll('[data-for]').forEach((y) => { y.hidden = y.dataset.for !== tab; }); }));
    m.el.querySelector('[data-cf]').addEventListener('submit', async (e) => {
      e.preventDefault(); const fd = new FormData(e.target); const dsel = fd.getAll('dept'); const job = (fd.get('job') || '').trim() || null;
      const phone = (fd.get('phone') || '').trim() || null; const email = (fd.get('email') || '').trim() || null;
      const can_edit = fd.get('acc') !== '0';
      let r;
      if (isNew && tab === 'm') {
        const uid = fd.get('user_id'); if (!uid) return toast('Escolhe uma pessoa.');
        const cur = inProj(uid);
        // quem já está no projeto: junta os departamentos novos aos que já tinha
        r = cur ? await sb.from('project_members').update({ depts: [...new Set([...(cur.depts || []), ...dsel])], job: job || cur.job || null, phone: phone || cur.phone || null, email: email || cur.email || null, can_edit }).eq('project_id', p.id).eq('user_id', uid)
          : await sb.from('project_members').insert({ project_id: p.id, user_id: uid, depts: dsel, job, phone, email, can_edit });
      }
      else if (isNew) { const name = (fd.get('name') || '').trim(); if (!name) return toast('Escreve o nome.'); r = await sb.from('project_crew').insert({ project_id: p.id, name, email, phone, depts: dsel, job }); }
      else if (x.t === 'm') r = await sb.from('project_members').update({ depts: dsel, job, phone, email, can_edit }).eq('project_id', p.id).eq('user_id', x.id);
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
const projBase = (p) => (p.is_central ? `#/c/${p.community_id}/central` : `#/p/${p.id}`);
const toolHref = (p, b) => `${projBase(p)}/${['board', 'wrd', 'mkt'].includes(b.kind || 'board') ? 'b' : 'f'}/${b.id}`; // boards (também os moodboards e os das páginas) abrem no board

// projetos já abertos ficam em memória 60 s: mudar de página dentro do projeto não volta a pedir tudo.
// Qualquer gravação nas tabelas do projeto apaga esta memória; a página do orçamento pede sempre de novo.
const projCache = new Map();
onWrite((t) => { if (['projects', 'project_budgets', 'boards', 'scripts', 'budget_access', 'project_members', 'community_members', 'communities'].includes(t)) projCache.clear(); });
// ---------- só leitura ----------
// Quem está no projeto como leitor (project_members.can_edit = false) vê tudo o que lhe está aberto mas não muda
// nada: a base de dados recusa (RLS) e aqui escondem-se os botões de criar/apagar e os campos ficam só de leitura.
const RO_OK = new Set(['activity', 'activity_seen', 'profiles', 'push_subscriptions', 'project_pins', 'project_hidden', 'presence']);
let roObs = null; let roRaf = 0;
const RO_DATA = /^(add|new|rm|del|remove|trash|up$|upload|cadd|crm|cedit|edit|import|analy|apply|use$|reset|mods$|pick$|url$|cover|change|move|dup|tpl|create|save|rename|plus|drop$|clear|sec|split|merge|restore|approve|toggleshot|shot$|addshot)/i;
const RO_TEXT = /^\s*(\+|novo|nova|adicionar|juntar|apagar|tirar|guardar|carregar|importar|analisar|mudar|editar|recomeçar|criar|duplicar|eliminar|remover|substituir|repor)/i;
function roScan() {
  roRaf = 0;
  const root = document.querySelector('.proj-main'); if (!root) return;
  root.querySelectorAll('button:not([data-ro-ok]), a.btn').forEach((b) => {
    if (b.closest('.pk, .sr-head, .sr-tools, [data-ro-ok]')) return;
    const keys = Object.keys(b.dataset);
    if (keys.some((k) => RO_DATA.test(k)) || RO_TEXT.test(b.textContent || '') || /apagar|tirar|remover/i.test(b.getAttribute('aria-label') || '')) b.hidden = true;
  });
  root.querySelectorAll('input:not([type=search]):not([type=checkbox]):not([type=radio]):not([readonly]), textarea:not([readonly])').forEach((i) => { if (!i.closest('[data-ro-ok], .pk')) i.readOnly = true; });
  root.querySelectorAll('td select, .field select, form select, [data-row] select, select[data-k], select[data-f]').forEach((x) => { if (!x.closest('[data-ro-ok]')) x.disabled = true; });
  root.querySelectorAll('[contenteditable="true"]').forEach((x) => x.setAttribute('contenteditable', 'false'));
  root.querySelectorAll('[draggable="true"]').forEach((x) => x.setAttribute('draggable', 'false'));
}
function setReadOnly(p) {
  const ro = !!(p && p.canEdit === false);
  document.body.classList.toggle('readonly', ro);
  setWriteGuard(ro ? (table, kind) => (RO_OK.has(table) || (table === 'tasks' && kind === 'update') ? null : 'Tens acesso só de leitura neste projeto.') : null);
  if (ro && !roObs) { roObs = new MutationObserver(() => { if (!roRaf) roRaf = requestAnimationFrame(roScan); }); roObs.observe(document.getElementById('app') || document.body, { childList: true, subtree: true }); roRaf = requestAnimationFrame(roScan); }
  if (!ro && roObs) { roObs.disconnect(); roObs = null; }
}

async function loadProject(id, { fresh = false } = {}) {
  const c = projCache.get(id);
  if (!fresh && c && Date.now() - c.t < 60000) {
    const p = c.p;
    setCtx({ comm: p.community_id ? commById(p.community_id) : null, project: p });
    setReadOnly(p);
    return p;
  }
  const p = await loadProjectNow(id);
  if (p) projCache.set(id, { t: Date.now(), p }); else projCache.delete(id);
  setReadOnly(p);
  return p;
}
// tudo o que o projeto precisa num só pedido (project_boot, na base de dados); se falhar, os pedidos de antes
const bootQ = (id) => sb.rpc('project_boot', { p: id }, { get: true });
export function warmProject(id) { if (!projCache.get(id)) bootQ(id).then(() => {}, () => {}); }
async function loadProjectNow(id) {
  let p, fin, grant, nScripts, boards, canEdit, tl;
  const { data: bt, error: be } = await bootQ(id);
  if (!be && bt) {
    ({ project: p, fin, grant, nScripts, boards, canEdit, tl } = bt);
    tl = tl ? [tl] : [];
  } else {
    let pr, gr;
    [{ data: pr }, { data: fin }, { data: gr }, { count: nScripts }, { data: boards }, { data: canEdit }, { data: tl }] = await Promise.all([
      sb.from('projects').select(`${PROJECT_COLS}, parent:parent_id(id, name, kind, deleted_at)`).eq('id', id).maybeSingle()
        .then((r) => (r.error ? sb.from('projects').select(PROJECT_COLS).eq('id', id).maybeSingle() : r)),
      sb.from('project_budgets').select('value, budget, updated_at, approved_at, status').eq('project_id', id).maybeSingle(),
      sb.from('budget_access').select('user_id').eq('project_id', id).eq('user_id', state.user.id).maybeSingle(),
      sb.from('scripts').select('id', { count: 'exact', head: true }).eq('project_id', id).neq('kind', 'tratamento'),
      sb.from('boards').select('id, parent_id, title, group_id, position, created_at, kind, visible_to, created_by').eq('project_id', id).order('position').order('created_at'),
      sb.rpc('can_edit_project', { p: id }),
      sb.from('boards').select('id, phases:data->phases').eq('project_id', id).eq('kind', 'timeline').order('position').limit(1),
    ]);
    p = pr; grant = !!gr;
  }
  if (!p || p.deleted_at) return null;
  p.canEdit = canEdit !== false;
  { const t = (tl || [])[0]; const ph = t ? t.phases || t.data?.phases || null : null; p._tlPhases = ph && typeof ph === 'object' ? ph : null; p._tlHref = t ? `${p.is_central ? `#/c/${p.community_id}/central` : `#/p/${p.id}`}/f/${t.id}` : null; }
  // permissões do ecrã: as da comunidade do projeto, ou de dono/convidado num projeto pessoal
  if (p.community_id && !commById(p.community_id)) await loadComms();
  setCtx({ comm: p.community_id ? commById(p.community_id) : null, project: p });
  p._hasScript = (nScripts || 0) > 0;
  p.canBudget = !p.is_central && (hasPerm('budget') || !!grant);
  p.value = p.canBudget ? fin?.value ?? null : null;
  p.budget = p.canBudget ? fin?.budget ?? null : null;
  p._budgetAt = p.canBudget ? fin?.updated_at ?? null : null;
  p._approvedAt = p.canBudget ? fin?.approved_at ?? null : null;
  p._budgetStatus = p.canBudget ? fin?.status || (fin?.approved_at ? 'aprovado' : 'curso') : null;
  p._boards = boards || [];
  if (p.parent_id) { let par = Array.isArray(p.parent) ? p.parent[0] : p.parent; if (par === undefined || (par && !par.id)) ({ data: par } = await sb.from('projects').select('id, name, kind, deleted_at').eq('id', p.parent_id).maybeSingle()); p._parent = par && !par.deleted_at ? par : null; }
  delete p.parent;
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
// ao lado do nome do projeto, na barra das etapas: "Só leitura" e o + das páginas (antes estavam no menu do lado)
const stripExtra = (p) => `${p.canEdit === false ? '<span class="ro-badge" title="Podes ver tudo o que te está aberto, mas não mudar nada">Só leitura</span>' : ''}`;
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
// tudo o que pode ter fase: páginas do projeto, páginas fixas dos departamentos e ferramentas
function phaseItems(p) {
  const pages = modulesOf(p).filter((k) => k !== 'orcamento' || p.canBudget).map((k) => ({ key: modKey(k), label: modLabel(p, k), group: 'Páginas' }));
  const gs = boardGroups(p);
  const deptPages = gs.flatMap((g) => (g.pages || []).filter((k) => !pages.some((x) => x.key === modKey(k))).map((k) => ({ key: modKey(k), label: `${pageMeta(k).label}`, group: g.name })));
  const tools = gs.flatMap((g) => g.boards.map((b) => ({ key: toolKey(b), label: b.title, kind: b.kind, group: g.name })));
  return [...pages, ...deptPages, ...tools];
}
// páginas fixas dentro de um departamento (módulos e a página dos mapas de luz)
const pageMeta = (k) => (k === 'mapas' ? { label: 'Mapas de luz', icon: 'bulb' } : MODULES[k]);

function projectNav(p, active) {
  const base = projBase(p);
  navState.p = p; navState.active = active;
  const ph = p.is_central ? 'all' : selPhase(p);
  const mods = p.is_central ? [['tarefas', 'Tarefas', ICON.task]] : modulesOf(p).filter((k) => (k !== 'orcamento' || p.canBudget) && k !== 'equipamento' && k !== 'aderecos' && k !== 'figurino' && shows(p, modKey(k))).map((k) => [modPath(p, k), modLabel(p, k), ICON[MODULES[k].icon]]);
  const pages = [['geral', 'Visão geral', ICON.home], ...(p.is_central && isStaff() ? [['financas', 'Finanças', ICON.money]] : []), ...mods, ['atividade', 'Atividade', ICON.bell], ['equipa', p.is_central ? 'Equipa' : 'Equipa e convites', ICON.team], ...(isStaff() ? [['detalhes', 'Detalhes', ICON.info]] : [])];
  return `
    ${p._parent ? `<a class="pn-parent" href="#/p/${p._parent.id}">${ICON.back}<span>${esc(p._parent.name)}</span></a>` : ''}
    ${p.is_central ? `<div class="pn-h"><div><strong>${esc(p.name)}</strong>${p.client ? `<span class="muted small">${esc(p.client)}</span>` : ''}</div>${p.canEdit === false ? '<span class="ro-badge" title="Podes ver tudo o que te está aberto, mas não mudar nada">Só leitura</span>' : ''}${!p.is_central && isStaff() && p.canEdit !== false ? `<button type="button" class="icon-btn sm pn-mods" data-mods title="Páginas do projeto" aria-label="Juntar ou tirar páginas">${ICON.plus}</button>` : ''}</div>` : ''}
    <div class="pn-searchrow"><button type="button" class="pn-search" data-psearch title="Procurar no projeto (Ctrl+K)">${ICON.search}<span>Procurar</span><kbd>Ctrl K</kbd></button>${!p.is_central && isStaff() && p.canEdit !== false ? `<button type="button" class="icon-btn pn-mods" data-mods title="Juntar páginas ao projeto" aria-label="Juntar páginas ao projeto">${ICON.plus}</button>` : ''}</div>
    <div class="pn-online" data-online></div>
    ${pages.map(([k, l, ic]) => `<a class="side-a" href="${base}${k === 'geral' ? '' : '/' + k}" ${active === k ? 'aria-current="page"' : ''}>${ic}<span>${l}</span></a>`).join('')}
    <div class="pn-sec"><span>Ferramentas</span>${p.canEdit !== false ? `<button type="button" class="icon-btn sm" data-newboard="" aria-label="Nova ferramenta">${ICON.plus}</button>` : ''}</div>
    ${boardGroups(p).map((g) => ({ ...g, pages: p.is_central ? g.pages || [] : (g.pages || []).filter((k) => shows(p, modKey(k))), boards: p.is_central ? g.boards : g.boards.filter((b) => shows(p, toolKey(b), b.kind)) })).filter((g) => ph === 'all' || g.pages.length || g.boards.length).map((g) => `<div class="pn-group" style="--g:${esc(g.color)}">
      <div class="pn-gh"><i></i><span>${esc(g.name)}</span>${g.id && p.canEdit !== false ? `<button type="button" class="icon-btn sm" data-newboard="${esc(g.id)}" aria-label="Novo board em ${esc(g.name)}">${ICON.plus}</button>` : ''}</div>
      ${(g.pages || []).map((k) => `<a class="side-a sub" href="${base}/${k}" ${active === k ? 'aria-current="page"' : ''}>${ICON[pageMeta(k).icon]}<span>${esc(pageMeta(k).label)}</span></a>`).join('')}
      ${g.boards.map((b) => `<div class="side-row"><a class="side-a sub" href="${toolHref(p, b)}" ${active === b.id ? 'aria-current="page"' : ''}>${(TOOL_KINDS[b.kind] || TOOL_KINDS.board).icon}<span>${esc(b.title)}</span>${b.visible_to?.length ? `<i class="vis-lock" title="Só algumas pessoas veem">${ICON.lock}</i>` : ''}</a>${p.canEdit !== false ? `<button type="button" class="side-more" data-smore="${b.id}" aria-label="Mais opções de ${esc(b.title)}" title="Mudar o nome ou apagar">${ICON.dots}</button>` : ''}</div>`).join('')}
    </div>`).join('')}`;
}
const navState = { p: null, active: null };
// quando as páginas mudam (à mão ou sozinhas), o menu atualiza-se logo
window.addEventListener('bg-modules', () => {
  const nav = document.querySelector('.proj-nav'); if (!nav || !navState.p) return;
  nav.innerHTML = projectNav(navState.p, navState.active); bindProjectNav(nav, navState.p);
});
// a barra do projeto fica no mesmo sítio ao mudar de página (antes voltava sempre ao topo)
const navScroll = new Map();
function bindProjectNav(root, p) {
  { const nav = root.querySelector('.proj-nav'); if (nav) { const y = navScroll.get(p.id); if (y) { nav.scrollTop = y; requestAnimationFrame(() => { nav.scrollTop = y; }); } nav.addEventListener('scroll', () => navScroll.set(p.id, nav.scrollTop), { passive: true }); } }
  root.querySelector('[data-psearch]')?.addEventListener('click', () => projectSearch(p, projBase(p)));
  if (!window.__psKey) { window.__psKey = true; document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && navState.p && document.querySelector('[data-psearch]')) { e.preventDefault(); if (!document.querySelector('#modal.open')) projectSearch(navState.p, projBase(navState.p)); } }); }
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
  if (!p.is_central) bindStrip(root, p, { onChange: () => route(), onPhase: () => go(projBase(p)), items: () => phaseItems(p) });
  root.querySelectorAll('[data-newboard]').forEach((b) => b.addEventListener('click', () => newBoard(p, b.dataset.newboard)));
  // ⋯ ao lado de cada ferramenta: mudar o nome e o departamento, ou apagar
  root.querySelectorAll('[data-smore]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault(); e.stopPropagation();
    const b = p._boards.find((x) => x.id === btn.dataset.smore); if (!b) return;
    document.querySelector('.side-pop')?.remove();
    const pop = document.createElement('div'); pop.className = 'side-pop'; pop.setAttribute('role', 'menu');
    pop.innerHTML = `<button type="button" role="menuitem" data-a="opt">${ICON.edit} Nome e departamento</button><button type="button" role="menuitem" class="danger-text" data-a="del">${ICON.trash} Apagar ferramenta</button>`;
    document.body.append(pop);
    const r = btn.getBoundingClientRect();
    pop.style.top = `${Math.min(window.innerHeight - pop.offsetHeight - 8, r.bottom + 4)}px`; pop.style.left = `${Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)}px`;
    const close = () => { pop.remove(); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', esc1, true); };
    const out = (ev) => { if (!pop.contains(ev.target) && ev.target !== btn) close(); };
    const esc1 = (ev) => { if (ev.key === 'Escape') close(); };
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', esc1, true); });
    const after = () => route();
    pop.querySelector('[data-a="opt"]').addEventListener('click', () => { close(); boardOptions(p, b, after); });
    pop.querySelector('[data-a="del"]').addEventListener('click', () => { close(); deleteTool(p, b, after); });
    pop.querySelector('button').focus();
  }));
}

const TOOL_HINTS = { board: 'moodboard quadro referencias cartoes imagens', table: 'folha lista contactos entregas elenco', timeline: 'calendario datas prazos plano', lightmap: 'luz iluminacao planta', budget: 'custos dinheiro valores', media: 'musica previs video audio', callsheet: 'folha de servico dia de rodagem horarios', transport: 'carros viagens boleias', distribution: 'festivais mostras submissoes premios trailer filme links' };
// ferramentas e páginas mais próprias de cada departamento (aparecem primeiro em "Nova ferramenta")
// cada ferramenta: [tipo, nome sugerido, modelo de tabela]; páginas: chaves de MODULES
const TPL_NAMES = { blank: 'Tabela', deliverables: 'Entregas', props: 'Adereços por cena', cast: 'Elenco', contacts: 'Contactos' };
const tplNamesOf = (t) => TPL_NAMES[t] || 'Tabela';
const DEPT_TOOLS = [
  [/^pos|post|montagem|edic|^som|sonoplast|^cor$|color|vfx|grafism|distribu/, { tools: [['media', 'Música e pre-vis'], ['distribution', 'Tabela Distribuição'], ['timeline', 'Cronograma de pós']], pages: [] }],
  [/realiza|criativ|direc|dire[cç][aã]o art[ií]stica/, { tools: [['board', 'Moodboard'], ['board', 'Referências'], ['timeline', 'Cronograma']], pages: ['storyboard', 'shotlist', 'tratamento'] }],
  [/produ/, { tools: [['table', 'Contactos', 'contacts'], ['timeline', 'Cronograma'], ['callsheet', 'Folha de serviço'], ['transport', 'Mapa de transportes'], ['budget', 'Orçamento'], ['table', 'Entregas', 'deliverables']], pages: ['orcamento', 'planificacao'] }],
  [/imagem|fotograf|camara|luz|ilumina/, { tools: [['lightmap', 'Mapa de luz'], ['board', 'Referências de imagem']], pages: ['equipamento', 'storyboard', 'shotlist'] }],
  [/arte|cenograf|adere/, { tools: [['board', 'Moodboard de arte']], pages: ['aderecos', 'figurino'] }],
  [/guarda|figurin|wardrobe|caracteriza|maquilh|cabel/, { tools: [['board', 'Moodboard de figurino']], pages: ['figurino'] }],
  [/marketing|comunica|redes|social/, { tools: [['distribution', 'Tabela Distribuição'], ['board', 'Moodboard']], pages: ['marketing'] }],
];
function newBoard(p, groupId = '', kind = 'board') {
  const fic = scriptMode(p);
  const dept = groupId ? ((p.departments || []).find((d) => d.id === groupId) || FIXED_DEPTS[groupId] || null) : null;
  const dname = dept ? normName(dept.name) : '';
  const rec = dept ? (DEPT_TOOLS.find(([re]) => re.test(dname) || re.test(normName(groupId)))?.[1] || null) : null;
  const recTools = rec ? rec.tools.filter(([k]) => TOOL_KINDS[k]) : [];
  const recPages = rec ? rec.pages.filter((k) => MODULES[k] && (hasMod(p, k) || addableModules(p).includes(k))) : [];
  const hasRec = !!(recTools.length || recPages.length);
  const kindRadio = (k, label, extra = '', checked = false, hint = '') => `<label class="tool-k" data-q="${esc(`${label} ${TOOL_KINDS[k].label} ${TOOL_HINTS[k] || ''} ${hint}`)}"><input type="radio" name="kind" value="${k}" ${extra} ${checked ? 'checked' : ''}><span>${TOOL_KINDS[k].icon}${esc(label)}</span></label>`;
  const pageBtn = (k) => hasMod(p, k) ? `<button type="button" class="tool-pg on" data-openmod="${k}" data-q="${esc(`${modLabel(p, k)} ${MODULES[k].desc}`)}" title="Já existe neste projeto: abrir">${ICON[MODULES[k].icon] || ''}<span>${esc(modLabel(p, k))}</span><small>abrir</small></button>`
    : `<button type="button" class="tool-pg" data-addmod="${k}" data-q="${esc(`${modLabel(p, k)} ${MODULES[k].desc}`)}" title="${esc(MODULES[k].desc)}">${ICON[MODULES[k].icon] || ''}<span>${esc(modLabel(p, k))}</span></button>`;
  const otherPages = addableModules(p).filter((k) => !recPages.includes(k));
  // os adereços têm uma única página por projeto (Arte › Adereços), por isso não há modelo de tabela de adereços
  const tpls = [['blank', 'Em branco'], ['contacts', 'Folha de contactos (equipa e elenco)'], ['deliverables', 'Entregas (peças, formatos, plataformas)'], ['cast', fic ? 'Elenco' : 'Atores e figurantes']];
  const m = modal(`<h2>Nova ferramenta</h2>
    <form class="stack">
      <input type="search" class="tool-q" data-toolq placeholder="Procurar ferramenta ou página…" aria-label="Procurar ferramenta" autocomplete="off">
      ${hasRec ? `<div class="tool-rec" data-trec><p class="tool-rec-h"><i style="background:${esc(dept.color || 'var(--blue)')}"></i>Para ${esc(dept.name)}</p>
        ${recTools.length ? `<div class="tool-kinds" role="radiogroup" aria-label="Ferramentas de ${esc(dept.name)}">${recTools.map(([k, label, tpl], i) => kindRadio(k, label, `data-title="${esc(label)}" ${tpl ? `data-tpl="${tpl}"` : ''}`, i === 0)).join('')}</div>` : ''}
        ${recPages.length ? `<div class="tool-pl">${recPages.map(pageBtn).join('')}</div>` : ''}</div>
        <button type="button" class="tool-more" data-tmore aria-expanded="false"><span>Outras ferramentas</span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button>` : ''}
      <div class="tool-others" data-tothers ${hasRec ? 'hidden' : ''}>
        <div class="tool-kinds" role="radiogroup" aria-label="Ferramenta">${Object.keys(TOOL_KINDS).map((k) => kindRadio(k, TOOL_KINDS[k].label, '', !hasRec && k === kind)).join('')}</div>
        ${otherPages.length ? `<div class="tool-pages" data-tpages><p class="small muted">Ou junta uma página ao projeto</p><div class="tool-pl">${otherPages.map(pageBtn).join('')}</div></div>` : ''}
      </div>
      <p class="small muted" data-toolnone hidden>Nada com esse nome.</p>
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
  const nq = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tq = m.el.querySelector('[data-toolq]');
  tq.addEventListener('input', () => {
    const q = nq(tq.value.trim()); let n = 0;
    const oth = m.el.querySelector('[data-tothers]'); const more = m.el.querySelector('[data-tmore]');
    if (more) { oth.hidden = !q && more.getAttribute('aria-expanded') !== 'true'; more.hidden = !!q; }
    m.el.querySelectorAll('.tool-k, .tool-pg').forEach((el) => { const ok = !q || nq(el.dataset.q).includes(q); el.hidden = !ok; if (ok) n++; });
    const tp = m.el.querySelector('[data-tpages]'); if (tp) tp.hidden = !!q && !tp.querySelector('.tool-pg:not([hidden])');
    m.el.querySelector('[data-toolnone]').hidden = n > 0;
    const vis = [...m.el.querySelectorAll('.tool-k:not([hidden]) input')];
    if (q && vis.length && !vis.some((i) => i.checked)) { vis[0].checked = true; sync(); }
  });
  tq.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); const k = m.el.querySelector('.tool-k:not([hidden]) input'); if (k) { k.checked = true; sync(); form.elements.title.focus(); } else m.el.querySelector('.tool-pg:not([hidden])')?.click(); } });
  setTimeout(() => tq.focus(), 30);
  m.el.querySelector('[data-tmore]')?.addEventListener('click', (e) => { const b = e.currentTarget; const open = b.getAttribute('aria-expanded') !== 'true'; b.setAttribute('aria-expanded', open); m.el.querySelector('[data-tothers]').hidden = !open; });
  m.el.querySelectorAll('[data-openmod]').forEach((b) => b.addEventListener('click', () => { m.close(); go(`${projBase(p)}/${modPath(p, b.dataset.openmod)}`); }));
  m.el.querySelectorAll('[data-addmod]').forEach((b) => b.addEventListener('click', async () => { const k = b.dataset.addmod; await ensureModules(p, [k]); m.close(); go(`${projBase(p)}/${modPath(p, k)}`); }));
  const ttl = form.elements.title;
  const sync = () => {
    const r = form.querySelector('[name=kind]:checked'); const k = r?.value || 'board';
    m.el.querySelector('[data-tplf]').hidden = k !== 'table';
    if (r?.dataset.tpl) form.elements.tpl.value = r.dataset.tpl;
    if (!ttl.dataset.touched) ttl.value = r?.dataset.title || (k === 'board' ? '' : k === 'table' ? (tplNamesOf(form.elements.tpl.value)) : TOOL_KINDS[k].label);
    const sel = form.elements.group_id; const img = deptOf(p, 'imagem');
    if (k === 'lightmap') { if (!img && !sel.querySelector('option[value="imagem"]')) sel.insertAdjacentHTML('beforeend', '<option value="imagem">Imagem</option>'); sel.value = img?.id || 'imagem'; sel.disabled = true; } else sel.disabled = false;
  };
  ttl.addEventListener('input', () => (ttl.dataset.touched = '1'));
  form.querySelectorAll('[name=kind]').forEach((r) => r.addEventListener('change', sync)); sync();
  const tplNames = TPL_NAMES;
  form.elements.tpl.addEventListener('change', () => { if (!ttl.dataset.touched) ttl.value = tplNames[form.elements.tpl.value]; });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(form));
    f.kind ||= 'board';
    if (/^\s*adere/i.test(f.title) && f.kind !== 'budget') { toast('Os adereços têm uma página única por projeto, em Arte › Adereços.'); if (!hasMod(p, 'aderecos')) await ensureModules(p, ['aderecos']); m.close(); return go(`${projBase(p)}/aderecos`); }
    if (f.kind === 'lightmap') f.group_id = await ensureDept(p, 'imagem');
    else if (f.group_id === 'imagem' && !deptOf(p, 'imagem')) f.group_id = await ensureDept(p, 'imagem');
    else if (f.group_id === 'arte' && !deptOf(p, 'arte')) f.group_id = await ensureDept(p, 'arte');
    const data = f.kind === 'table' ? await tableTemplate(p, f.tpl) : f.kind === 'lightmap' ? newLightmapData() : f.kind === 'callsheet' ? { sheets: [(await lazy.callsheet()).newCallsheet(p, 1)] } : f.kind === 'transport' ? (await lazy.transport()).newTransport(p) : f.kind === 'distribution' ? (await import('./distribution.js')).newDistribution() : {};
    const { data: row, error } = await sb.from('boards').insert({ project_id: p.id, title: f.title.trim(), group_id: f.group_id || null, position: p._boards.length, kind: f.kind, data, visible_to: readVis(form) }).select().single();
    if (error) return toast(error.message);
    const sph = p.is_central ? 'all' : selPhase(p);
    if (sph !== 'all' && !phasesOf(p, toolKey(row), row.kind).includes(sph)) await setToolPhase(p, row.id, sph);
    m.close(); go(toolHref(p, row));
  });
}

// ---------- ferramentas (tabela, cronograma, mapa de luz) ----------
const TOOL_MOD = { budget: () => lazy.budget(), callsheet: () => lazy.callsheet(), transport: () => lazy.transport(), distribution: () => import('./distribution.js') };
async function toolPage(projectId, toolId) {
  const cached = projCache.get(projectId)?.p;
  const k0 = cached?._boards?.find((b) => b.id === toolId)?.kind; if (k0 && TOOL_MOD[k0]) TOOL_MOD[k0]().catch(() => {});
  const [p, { data: tool }] = await Promise.all([loadProject(projectId), sb.from('boards').select('*').eq('id', toolId).maybeSingle()]);
  if (!p) return notFound();
  if (tool && TOOL_MOD[tool.kind]) TOOL_MOD[tool.kind]().catch(() => {});
  if (!tool) return go(projBase(p));
  if (['board', 'wrd', 'mkt'].includes(tool.kind || 'board')) { history.replaceState(null, '', `${projBase(p)}/b/${tool.id}`); return boardView(projectId, tool.id); }
  if (tool.kind === 'board') return go(toolHref(p, tool));
  if (tool.kind === 'lightmap') return lightmapView(p, tool);
  const d = (p.departments || []).find((x) => x.id === tool.group_id);
  app.innerHTML = `<div class="page ${p.is_central ? '' : 'has-strip'}">${header(p.is_central ? 'central' : '')}${p.is_central ? '' : projectStrip(p, projBase(p), stripExtra(p))}
    <div class="proj-layout">
      <nav class="proj-nav" aria-label="Projeto">${projectNav(p, tool.id)}</nav>
      <main class="proj-main" data-main>${p.is_central ? '' : aheadNotice(p)}
        <div class="row between wrap-gap"><div><span class="small muted">${(TOOL_KINDS[tool.kind] || {}).label || ''}${d ? ` · ${esc(d.name)}` : ''}</span><h1 class="h1">${esc(tool.title)}</h1></div>
          <div class="row wrap-gap"><button type="button" class="btn ghost" data-tooltask>${ICON.plus} Adicionar tarefa</button><button type="button" class="btn ghost" data-topt>${ICON.dots} Opções</button>${p.canEdit !== false ? `<button type="button" class="icon-btn" data-tdel title="Apagar esta ferramenta" aria-label="Apagar esta ferramenta">${ICON.trash}</button>` : ''}</div></div>
        <div data-tool></div>
      </main>
    </div></div>`;
  bindHeader(app); bindProjectNav(app, p);
  if (!p.is_central) bindAhead(app, p, () => go(projBase(p)), () => go(projBase(p)));
  app.querySelector('[data-topt]').addEventListener('click', () => boardOptions(p, tool, () => toolPage(projectId, toolId)));
  app.querySelector('[data-tdel]')?.addEventListener('click', () => deleteTool(p, tool, () => toolPage(projectId, toolId)));
  app.querySelector('[data-tooltask]')?.addEventListener('click', () => addTaskModal({ projectId: p.id, departments: p.departments || [], entity: { type: 'board', id: tool.id }, where: tool.title }));
  const box = app.querySelector('[data-tool]');
  joinProject(p.id);
  if (IS_STUDIO) import('./miniplayer.js').then((m) => m.miniPlayer(p, { page: 'f', sub: toolId, base: projBase(p) })).catch(() => {});
  { const lk = lockPage(`${p.id}:f:${tool.id}`, app.querySelector('[data-main]'), { reopen: () => route() }); onCleanup(() => lk.destroy()); }
  if (IS_STUDIO && !p.is_central && !['lightmap'].includes(tool.kind)) {
    const el = document.createElement('div'); el.className = 'cv-page';
    mountCanvas(box, p, { key: `f:${tool.id}`, pageLabel: 'ferramenta', here: { kind: 'tool', id: tool.id },
      native: [{ id: 'tool', label: tool.title, el, ref: { kind: 'tool', id: tool.id }, removable: false }], render: (b, ref) => renderRef(b, p, ref) });
    return renderToolBody(el, p, tool);
  }
  return renderToolBody(box, p, tool);
}

async function renderToolBody(box, p, tool) {
  if (tool.kind === 'table') tableTool(box, p, tool);
  if (tool.kind === 'timeline') timelineTool(box, p, tool);
  if (tool.kind === 'budget') (await lazy.budget()).budgetTool(box, p, tool);
  if (tool.kind === 'media') mediaTool(box, p, tool);
  if (tool.kind === 'callsheet') (await lazy.callsheet()).callsheetTool(box, p, tool);
  if (tool.kind === 'transport') (await lazy.transport()).transportTool(box, p, tool);
  if (tool.kind === 'distribution') (await import('./distribution.js')).distributionTool(box, p, tool);
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
  m.el.querySelector('[data-del]').addEventListener('click', () => { m.close(); deleteTool(p, b, after); });
}

// apagar uma ferramenta: diz o que se perde e pede confirmação (com visto quando há conteúdo)
async function deleteTool(p, b, after) {
  const { data: full } = await sb.from('boards').select('id, title, kind, data').eq('id', b.id).maybeSingle();
  const d = full?.data || b.data || {};
  const n = (x, a, c) => `${x} ${x === 1 ? a : c}`;
  const lost = [];
  if (b.kind === 'callsheet') {
    const sh = d.sheets || (d.rows ? [d] : []); const shots = sh.reduce((t, x) => t + (x.rows || []).filter((r) => r.kind !== 'band').length, 0);
    if (sh.length) lost.push(n(sh.length, 'dia de rodagem', 'dias de rodagem')); if (shots) lost.push(n(shots, 'plano na folha', 'planos nas folhas'));
    const { count } = await sb.from('shoot_marks').select('row_id', { count: 'exact', head: true }).eq('board_id', b.id); if (count) lost.push(n(count, 'visto de plano filmado', 'vistos de planos filmados'));
  } else if (b.kind === 'table') { if (d.rows?.length) lost.push(n(d.rows.length, 'linha', 'linhas')); }
  else if (b.kind === 'budget') { const r = (d.rows || []).filter((x) => x.kind !== 'section').length; if (r) lost.push(n(r, 'linha de orçamento', 'linhas de orçamento')); }
  else if (b.kind === 'timeline') { if (d.items?.length) lost.push(n(d.items.length, 'data marcada', 'datas marcadas')); }
  else if (b.kind === 'transport') { const t = (d.days || d.trips || []).length; if (t) lost.push(n(t, 'registo', 'registos')); }
  else { const [{ count: items }, { count: kids }] = await Promise.all([sb.from('board_items').select('id', { count: 'exact', head: true }).eq('board_id', b.id), sb.from('boards').select('id', { count: 'exact', head: true }).eq('parent_id', b.id)]); if (items) lost.push(n(items, 'cartão ou imagem', 'cartões e imagens')); if (kids) lost.push(n(kids, 'board dentro', 'boards dentro')); }
  const label = ((TOOL_KINDS[b.kind] || TOOL_KINDS.board).label || 'ferramenta').toLowerCase();
  const m = modal(`<h2>Apagar "${esc(b.title)}"?</h2>
    <p>${lost.length ? `Esta ${esc(label)} tem ${esc(lost.join(', '))}. Tudo isto desaparece para toda a equipa.` : `Esta ${esc(label)} ainda está vazia.`}</p>
    <p class="muted small">Não dá para desfazer.${b.kind === 'callsheet' ? ' As datas dos dias de rodagem deixam de aparecer no cronograma e na Rodagem.' : ''}</p>
    ${lost.length ? '<label class="check"><input type="checkbox" data-sure> Percebo que vou perder este conteúdo</label>' : ''}
    <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn danger" data-go ${lost.length ? 'disabled' : ''}>${ICON.trash} Apagar</button></div>`);
  m.el.querySelector('[data-sure]')?.addEventListener('change', (e) => { m.el.querySelector('[data-go]').disabled = !e.target.checked; });
  m.el.querySelector('[data-go]').addEventListener('click', async () => {
    const { data: gone, error } = await sb.from('boards').delete().eq('id', b.id).select('id');
    if (error) return toast(error.message);
    if (!gone?.length) return toast('Não tens permissão para apagar esta ferramenta. Pede a um administrador ou a um líder do projeto.');
    m.close(); toast(`"${b.title}" foi apagada.`);
    if (location.hash.includes(b.id)) go(projBase(p)); else after();
  });
}

async function projectPage(projectId, page, sub) {
  const p = await loadProject(projectId, { fresh: ['orcamento', 'detalhes'].includes(page) });
  if (!p) return notFound();
  if (page === 'detalhes' && !isStaff()) page = 'geral';
  if (page !== 'geral') setTimeout(() => autoModules(p), 0);
  app.innerHTML = `<div class="page ${p.is_central ? '' : 'has-strip'}">${header(p.is_central ? 'central' : '')}${p.is_central ? '' : projectStrip(p, projBase(p), stripExtra(p))}
    <div class="proj-layout">
      <nav class="proj-nav" aria-label="Projeto">${projectNav(p, page)}</nav>
      <main class="proj-main ${!p.is_central && aheadOf(p) && page === 'geral' ? 'ov-ahead' : ''}">${p.is_central ? '' : aheadNotice(p)}<div data-main></div></main>
    </div></div>`;
  bindHeader(app); bindProjectNav(app, p);
  if (!p.is_central) bindAhead(app, p, () => go(projBase(p)), () => go(projBase(p)));
  const main = app.querySelector('[data-main]');
  // tarefa ligada a esta página (ou à cena / pessoa / décor / plano / adereço aberto): botão no canto superior direito
  if (!p.is_central && p.canEdit !== false) app.querySelector('.topbar-r')?.insertAdjacentHTML('afterbegin', `<button type="button" class="btn ghost sm task-top" data-pagetask>${ICON.plus}<span>Adicionar tarefa</span></button>`);
  app.querySelector('[data-pagetask]')?.addEventListener('click', () => {
    const ENT = { cenas: 'scene', seguimento: 'scene', personagens: 'character', elenco: 'character', figurino: 'character', decors: 'location', plano: 'shot', aderecos: 'prop', marketing: 'marketing' };
    const entity = sub && ENT[page] ? { type: ENT[page], id: sub } : ['tarefas', 'geral'].includes(page) ? null : { type: `page:${page}`, id: null };
    const label = (pageMeta(page)?.label || { geral: 'Visão geral', atividade: 'Atividade', equipa: 'Equipa', detalhes: 'Detalhes', plano: 'Plano' }[page] || page);
    const h = main.querySelector('h1, .title-in, .scene-h h1');
    const where = !entity ? '' : sub ? `${label} · ${(h?.value || h?.textContent || '').trim()}` : label;
    addTaskModal({ projectId: p.id, departments: p.departments || [], entity, where });
  });
  joinProject(p.id);
  // videoclipes com música: mini leitor que acompanha as páginas do projeto
  if (IS_STUDIO) import('./miniplayer.js').then((m) => m.miniPlayer(p, { page, sub, base: projBase(p) })).catch(() => {});
  // páginas de trabalho: só uma janela edita de cada vez (as outras ficam só a ver)
  if (['orcamento', 'seguimento', 'decors', 'elenco', 'personagens', 'aderecos', 'cenas', 'guiao', 'planificacao', 'detalhes', 'shotlist', 'storyboard', 'financas', 'plano', 'equipamento', 'figurino', 'tratamento'].includes(page)) {
    const lk = lockPage(`${p.id}:${page}:${sub || ''}`, main, { reopen: () => route() });
    onCleanup(() => lk.destroy());
  }
  // Studio: cada página é um board (grelha com encaixe), com a página em si como elemento e o que se colar de outras
  if (IS_STUDIO && !p.is_central && !['detalhes', 'equipa'].includes(page)) {
    if (page === 'geral') return projectOverview(main, p);
    const el = document.createElement('div'); el.className = 'cv-page';
    const label = pageMeta(page)?.label || { atividade: 'Atividade', tarefas: 'Tarefas', plano: 'Plano', rodagem: 'Rodagem', anotacao: 'Folhas de Anotação', personagens: 'Personagens' }[page] || page;
    mountCanvas(main, p, { key: `pg:${page}${sub ? ':' + sub : ''}`, pageLabel: 'página', here: { kind: 'page', page, sub: sub || null },
      native: [{ id: 'page', label, el, ref: { kind: 'page', page, sub: sub || null }, removable: false }], render: (box, ref) => renderRef(box, p, ref) });
    return renderPage(el, p, page, sub);
  }
  return renderPage(main, p, page, sub);
}

// desenha um elemento colado: uma página, um bloco da visão geral, uma ferramenta
async function renderRef(box, p, ref) {
  if (ref.kind === 'page') return renderPage(box, p, ref.page, ref.sub || undefined, { plain: true });
  if (ref.kind === 'block') { const tmp = document.createElement('div'); return mountSituation(tmp, p, projBase(p), { onBlocks: (bl) => { const b = bl.find((x) => x.id === ref.block); box.innerHTML = ''; if (b) box.append(b.el); else box.innerHTML = '<p class="muted small">Este bloco não tem nada para mostrar agora.</p>'; } }); }
  if (ref.kind === 'tool') {
    const { data: tool } = await sb.from('boards').select('*').eq('id', ref.id).maybeSingle();
    if (!tool) { box.innerHTML = '<p class="muted small">Esta ferramenta já não existe. Podes tirá-la daqui.</p>'; return; }
    box.innerHTML = `<div class="row between cv-th"><a href="${toolHref(p, tool)}"><strong>${esc(tool.title)}</strong></a><a class="small" href="${toolHref(p, tool)}">Abrir</a></div><div data-tb></div>`;
    if (tool.kind === 'board' || tool.kind === 'wrd') { const { boardPreview } = await import('./boardview.js'); box.innerHTML = ''; boardPreview(box, p, { boardId: tool.id, title: tool.title, href: toolHref(p, tool), base: projBase(p), renamable: true, onRename: (v) => { tool.title = v; const b = p._boards?.find((x) => x.id === tool.id); if (b) b.title = v; } }); return; }
    if (tool.kind === 'lightmap') { box.querySelector('[data-tb]').innerHTML = `<a class="btn ghost" href="${toolHref(p, tool)}">${ICON.open} Abrir ${esc(tool.title)}</a>`; return; }
    return renderToolBody(box.querySelector('[data-tb]'), p, tool);
  }
}

async function renderPage(main, p, page, sub, { plain = false } = {}) {
  const titles = { tarefas: 'Tarefas', equipa: p.is_central ? 'Equipa' : 'Equipa e convites', detalhes: 'Detalhes' };
  if (page === 'geral') return projectOverview(main, p, { plain });
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
  if (page === 'anotacao' && !p.is_central) return (await lazy.anotacao()).anotacaoPage(main, p, projBase(p), sub);
  if (page === 'rodagem' && !p.is_central) return (await lazy.rodagem()).rodagemPage(main, p, projBase(p));
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
  main.innerHTML = page === 'tarefas' ? `<div class="tc-titlebar"><h1 class="h1 pm-title">${esc(titles[page] || '')}</h1><div data-tcbar></div></div><div class="tc" data-body></div>` : `<h1 class="h1 pm-title">${esc(titles[page] || '')}</h1><div class="panel" data-body></div>`;
  const body = main.querySelector('[data-body]');
  if (page === 'tarefas') { const t = mountTaskCenter(body, { projectId: p.id, bar: main.querySelector('[data-tcbar]') }); onCleanup(() => t.destroy()); }
  if (page === 'equipa') projectTeam(body, p);
  if (page === 'detalhes') {
    if (!p.is_central && p.kind !== 'album') { const fq = sb.from('projects').select('id, name').eq('kind', 'album').is('deleted_at', null).neq('id', p.id).order('name'); const { data: fs } = await (p.community_id ? fq.eq('community_id', p.community_id) : fq.is('community_id', null)); p._folders = fs || []; }
    body.innerHTML = detailsForm(p); bindDetails(body, p, () => projectPage(p.id, 'detalhes'));
  }
}

function budgetUsed(p) {
  const b = p.budget; if (!b?.rows || !b.main) return 0;
  return b.rows.filter((r) => r.kind === 'item').reduce((a, r) => a + (Number(r.cells?.[b.main]) || 0), 0);
}

async function projectOverview(main, p, { plain = false } = {}) {
  const base = projBase(p);
  // o banner aparece logo, enquanto o resto carrega (a página não fica em branco)
  if (!p.is_central && !main.querySelector('.pm-head')) {
    const cu = knownUrl(p.cover_path);
    main.innerHTML = `<section class="pm-head" style="${cu ? `background-image:linear-gradient(rgba(12,12,18,.15),rgba(12,12,18,.75)),url('${esc(cu)}')` : ''}"><div class="grain-layer moving" aria-hidden="true"></div>
      <div class="pm-head-in"><span class="tag dark">${esc(KINDS[p.kind] || p.kind)}</span><h1 class="pm-name">${esc(p.name)}</h1>
      <p class="pm-sub">${[p.client, p.starts_on && p.ends_on ? `${fmtDate(p.starts_on)} – ${fmtDate(p.ends_on)}` : ''].filter(Boolean).map(esc).join(' · ')}</p></div></section>
      <p class="muted cv-wait">A carregar…</p>`;
  }
  // tudo ao mesmo tempo (antes eram 4 ou 5 esperas seguidas)
  // (um pedido do Supabase só corre quando se espera por ele, e corre de novo a cada espera: Promise.resolve faz um só)
  const allTasksP = Promise.resolve(sb.from('tasks').select('*').eq('project_id', p.id));
  const itemsP = Promise.resolve(sb.from('board_items').select('board_id, kind, data').eq('project_id', p.id));
  if (!p.is_central) p._preSit = situationData(p, allTasksP); // a caixa do ponto de situação começa já a pedir os seus dados
  const thumbsP = itemsP.then(({ data }) => signedUrls((data || []).filter((i) => i.kind === 'image').map((i) => i.data?.path).slice(0, 40)));
  const [kids, { data: allTasks }, { data: items }, people, coverMap, fs, thumbs] = await Promise.all([
    isFolder(p) ? loadChildren(p) : null,
    allTasksP, itemsP, loadPeople(),
    p.cover_path ? signedUrls([p.cover_path]) : {},
    hasMod(p, 'cenas') ? fictionStats(p) : null,
    thumbsP,
  ]);
  p._kidsAlloc = kids ? rollup(kids).alloc : 0;
  const tasks = (allTasks || []).filter((t) => t.status !== 'done');
  const cover = p.cover_path ? coverMap[p.cover_path] : null;
  const ph = phaseOf(p);
  const top = p._boards.filter((b) => !b.parent_id && b.kind !== 'mkt' && b.kind !== 'wrd' && b.kind !== 'lightmap');
  const nMaps = p._boards.filter((b) => b.kind === 'lightmap').length && (p.is_central || shows(p, modKey('mapas'))) ? p._boards.filter((b) => b.kind === 'lightmap').length : 0;
  const allTop = top.length;
  if (!p.is_central) top.splice(0, top.length, ...top.filter((b) => shows(p, toolKey(b), b.kind)));
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
        ${!p.is_central ? (() => { const n = tasks.length, all = (allTasks || []).length, late = tasks.filter((t) => t.due && t.due < todayISO()).length; return `<div class="pm-pills"><button type="button" class="pm-tasks ${late ? 'late' : ''}" data-pmtasks aria-expanded="false" aria-haspopup="true" title="Ver as tarefas do projeto">${ICON.task}<span>${n ? `Tem ${n} ${n === 1 ? 'tarefa' : 'tarefas'}` : all ? 'Tarefas todas feitas' : 'Sem tarefas'}${late ? ` · ${late} ${late === 1 ? 'atrasada' : 'atrasadas'}` : ''}</span>${all ? `<i class="pm-tbar" aria-hidden="true"><b style="width:${Math.round(((all - n) / all) * 100)}%"></b></i>` : ''}</button><button type="button" class="pm-tasks pm-q" data-pmq aria-expanded="false" aria-haspopup="true" title="Questões do projeto: o que ainda está por decidir"><b class="pm-qi" aria-hidden="true">?</b><span>Questões</span></button></div>`; })() : ''}
        ${p.canBudget && hasMod(p, 'orcamento') ? (() => { const used = budgetUsed(p) + (p._kidsAlloc || 0); const over = p.value != null && used > p.value; return `<button type="button" class="pm-budget ${over ? 'over' : ''}" data-budget title="Só quem tem acesso ao orçamento vê isto"><span>${ICON.lock} Orçamento${p._budgetStatus && p._budgetStatus !== 'curso' ? ` <em class="appr bs-${p._budgetStatus}">${{ por_aprovar: 'por aprovar', aprovado: '✓ aprovado', rejeitado: 'rejeitado' }[p._budgetStatus]}</em>` : ''}</span>${p.value != null ? `<strong>${eur.format(p.value)}</strong>${used ? `<small>${eur.format(used)} na tabela${over ? ` · ${eur.format(used - p.value)} acima` : ''}</small>` : ''}` : '<strong class="muted-w">Definir</strong>'}</button>`; })() : ''}
        ${ph.label || p.stage ? `<div class="pm-phase"><div class="row between small"><span>${esc(p.stage ? phaseLabel(p.stage) : ph.label)}</span><span>${Math.round(ph.pct * 100)}%</span></div><div class="bar light"><i style="width:${Math.round(ph.pct * 100)}%"></i></div></div>` : ''}
      </div>
    </section>
    ${fs ? `<div class="stats">${[['cenas', 'Cenas', fs.scenes], ['personagens', 'Personagens', fs.characters], ['decors', 'Décors', fs.locations], ['storyboard', 'Planos', fs.shots]].map(([k, l, n]) => `<a class="stat" href="${base}/${k}"><strong>${n}</strong><span>${l}</span></a>`).join('')}${fs.scenes ? '' : `<a class="stat cta" href="${base}/guiao"><strong>${ICON.plus}</strong><span>Importar guião</span></a>`}</div>` : ''}
    ${kids ? '<section class="panel fold-sec" data-kids></section>' : ''}
    ${!p.is_central && hasMod(p, 'marketing') ? '<section class="panel mk-upbox" data-mkup></section>' : ''}
    ${p._parent ? `<a class="fold-up" href="#/p/${p._parent.id}">${ICON.back} Faz parte de <b>${esc(p._parent.name)}</b></a>` : ''}
    ${p.is_central ? '' : '<div class="ov" data-situation></div>'}
    <!-- nos projetos as ferramentas estão na barra lateral; aqui só na Central -->
    <div class="pm-grid ${p.is_central ? '' : 'solo'}" ${p.is_central ? '' : 'hidden'}>
      <section class="pm-boards" aria-labelledby="h-boards">
        <div class="row between"><h2 id="h-boards" class="h2">Ferramentas</h2><button type="button" class="btn primary" data-nb>${ICON.plus} Nova ferramenta</button></div>
        ${top.length || nMaps ? `<div class="board-grid">${top.map((b) => { const d = deptMap.get(b.group_id); const th = thumbOf(b.id); return `
          <article class="board-card" style="--g:${esc(d?.color || '#8A8A99')}">
            <a href="${toolHref(p, b)}" class="proj-link" aria-label="Abrir ${esc(b.title)}"></a>
            <div class="bc-cover" ${th ? `style="background-image:url('${esc(th)}')"` : ''}>${th ? '' : (TOOL_KINDS[b.kind] || TOOL_KINDS.board).icon}</div>
            <div class="bc-body"><strong>${esc(b.title)}${b.visible_to?.length ? ` <i class="vis-lock" title="Visível só para ${b.visible_to.length} ${b.visible_to.length === 1 ? 'pessoa' : 'pessoas'}">${ICON.lock}</i>` : ''}</strong><span class="small muted">${d ? `<i class="dot"></i>${esc(d.name)} · ` : ''}${(b.kind || 'board') === 'board' ? `${count(b.id)} ${count(b.id) === 1 ? 'cartão' : 'cartões'}` : esc((TOOL_KINDS[b.kind] || {}).label || '')}</span></div>
            <button type="button" class="icon-btn bc-more" data-bopt="${b.id}" aria-label="Opções de ${esc(b.title)}">${ICON.dots}</button>
          </article>`; }).join('')}${nMaps ? `<article class="board-card" style="--g:${esc(deptOf(p, 'imagem')?.color || '#2FB67C')}"><a href="${base}/mapas" class="proj-link" aria-label="Abrir os mapas de luz"></a><div class="bc-cover">${ICON.bulb}</div><div class="bc-body"><strong>Mapas de luz</strong><span class="small muted"><i class="dot"></i>Imagem · ${nMaps} ${nMaps === 1 ? 'mapa' : 'mapas'}</span></div></article>` : ''}</div>`
        : allTop ? `<div class="empty-box"><p>Nenhuma ferramenta em ${esc(phaseLabel(selPhase(p)).toLowerCase())}.</p><p class="muted small">Muda de fase em cima, ou usa "Organizar fases" para escolher onde cada ferramenta aparece.</p></div>` : `<div class="empty-box"><p>Ainda não há ferramentas neste projeto.</p><p class="muted small">Boards para o tratamento, o moodboard ou um brainstorm (abrem em ecrã inteiro), tabelas, cronograma e mapas de luz.</p><button type="button" class="btn primary" data-nb>${ICON.plus} Criar a primeira</button></div>`}
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
  const asCanvas = IS_STUDIO && !plain && !p.is_central;
  if (!p.is_central && !asCanvas) { mountSituation(main.querySelector('[data-situation]'), p, base); autoModules(p); }
  const mkup = main.querySelector('[data-mkup]'); if (mkup) lazy.marketing().then((m) => m.upcomingBox(mkup, p, base));
  if (kids) childrenSection(main.querySelector('[data-kids]'), p, kids, { base, canBudget: p.canBudget, onNew: isStaff() ? () => newProject({ parent: p }) : null, canEdit: isStaff(), after: () => projectPage(p.id, 'geral') });
  // tarefas do projeto: um botão no banner; ao carregar mostra as que estão por fazer
  main.querySelector('[data-pmtasks]')?.addEventListener('click', (e) => {
    const btn = e.currentTarget; const open = document.querySelector('.pm-tpop'); if (open) { open.remove(); btn.setAttribute('aria-expanded', 'false'); return; }
    const deptMap2 = new Map((p.departments || []).map((d) => [d.id, d]));
    const list = [...tasks].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    const pop = document.createElement('div'); pop.className = 'pm-tpop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Tarefas do projeto');
    pop.innerHTML = `<div class="row between"><strong>${list.length ? `${list.length} por fazer` : 'Nada por fazer'}</strong><button type="button" class="icon-btn sm" data-x aria-label="Fechar">${ICON.close}</button></div>
      ${list.length ? `<ul>${list.slice(0, 10).map((t) => { const du = dueInfo(t.due, t.status); const who = people.find((x) => x.id === t.assignee_id); const dp = deptMap2.get(t.department); return `<li><a href="${base}/tarefas">${dp ? `<i class="dot" style="background:${esc(dp.color)}"></i>` : '<i class="dot"></i>'}<span class="t">${esc(t.title)}</span><span class="muted small">${esc(who?.display_name || '')}</span><span class="due due-${du.tone}">${esc(du.label)}</span></a></li>`; }).join('')}${list.length > 10 ? `<li class="muted small">e mais ${list.length - 10}…</li>` : ''}</ul>` : '<p class="muted small">Não há tarefas por fazer neste projeto.</p>'}
      <div class="row between"><a class="small" href="${base}/tarefas">Ver todas as tarefas</a><button type="button" class="btn ghost sm" data-newt>${ICON.plus} Nova tarefa</button></div>`;
    document.body.append(pop);
    const r = btn.getBoundingClientRect();
    pop.style.top = `${r.bottom + 8}px`; pop.style.left = `${Math.max(12, Math.min(window.innerWidth - pop.offsetWidth - 12, r.left))}px`;
    btn.setAttribute('aria-expanded', 'true');
    const close = () => { pop.remove(); btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', k, true); window.removeEventListener('scroll', close, true); };
    const out = (ev) => { if (!pop.contains(ev.target) && !btn.contains(ev.target)) close(); };
    const k = (ev) => { if (ev.key === 'Escape') close(); };
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', k, true); window.addEventListener('scroll', close, true); });
    pop.querySelector('[data-x]').addEventListener('click', close);
    pop.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    pop.querySelector('[data-newt]').addEventListener('click', () => { close(); addTaskModal({ projectId: p.id, departments: p.departments || [], entity: null, where: '' }); });
  });
  onCleanup(() => document.querySelector('.pm-tpop')?.remove());
  { const qb = main.querySelector('[data-pmq]'); if (qb) { const q = questionsButton(qb, p); onCleanup(() => q.close()); } }
  const leadsEl = main.querySelector('[data-leads]');
  if (leadsEl) drawLeads(leadsEl, p);
  if (p.is_central) { const box = document.createElement('div'); box.className = 'co'; main.querySelector('.pm-head').after(box); centralOverview(box); }
  // Studio: a visão geral é um board — o banner e cada bloco são elementos da grelha
  if (asCanvas) {
    autoModules(p);
    const sit = main.querySelector('[data-situation]');
    const head = document.createElement('div'); head.className = 'cv-headblk';
    [...main.children].forEach((c) => { if (c !== sit && !c.matches('.pm-grid[hidden]')) head.append(c); });
    // o banner fica à vista enquanto os blocos carregam (a página não fica em branco); depois passa para a grelha
    main.insertBefore(head, sit);
    head.querySelector('.pm-head')?.setAttribute('data-gdrag', ''); // o banner arrasta-se por qualquer sítio que não seja um botão
    sit.innerHTML = '<p class="muted cv-wait">A preparar a visão geral…</p>';
    // projetos novos: a visão geral começa só com o que é das tarefas; o resto junta-se pela barra da direita
    const fresh = !p.layouts?.['pg:geral']?.grid && String(p.created_at || '') >= '2026-10-19';
    const TASKY = new Set(['who', 'depts']);
    await mountSituation(sit, p, base, { onBlocks: (blocks) => {
      mountCanvas(main, p, { key: 'pg:geral', pageLabel: 'visão geral', here: { kind: 'page', page: 'geral', sub: null },
        native: [{ id: 'head', label: 'Banner do projeto', el: head, removable: false }, ...blocks.map((b) => ({ id: b.id, label: b.label, el: b.el, w: fresh && b.id === 'who' ? 12 : b.w, x: fresh && b.id === 'who' ? 0 : b.x, off: fresh && !TASKY.has(b.id) ? true : b.off, icon: b.icon, ref: { kind: 'block', block: b.id } }))],
        render: (bx, ref) => renderRef(bx, p, ref) });
    } });
  }
}

// ---------- Central: visão geral dos projetos ----------
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
// líderes do projeto (um ou mais): aparecem no topo do projeto e nos detalhes; quem é da equipa pode mudar ali mesmo
async function drawLeads(el, p) {
  const people = await loadPeople(); const by = (id) => people.find((x) => x.id === id);
  const ids = leadsOf(p);
  const chip = (x) => `<span class="pm-lead"><small>Líder</small><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><b>${esc(x.display_name)}</b></span>`;
  el.innerHTML = `${ids.map(by).filter(Boolean).map(chip).join('')}${isStaff() ? `<button type="button" class="pm-lead ${ids.length ? 'add' : 'empty'}" data-lk title="Escolher os líderes do projeto">${ids.length ? '+ Líder' : '<small>Líder</small><b>Atribuir</b>'}</button>` : ids.length ? '' : '<span class="pm-lead empty"><small>Líder</small><b>—</b></span>'}`;
  el.querySelector('[data-lk]')?.addEventListener('click', () => {
    const sel = new Set(ids);
    const m = modal(`<h2>Líderes do projeto</h2><p class="muted small">Quem lidera e responde pelo projeto. Podem ser várias pessoas.</p><div class="lead-pick">${people.filter((x) => x.role !== 'guest').map((x) => `<button type="button" class="lead-opt ${sel.has(x.id) ? 'on' : ''}" data-pid="${x.id}"><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span>${esc(x.display_name)}</span></button>`).join('')}</div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Guardar</button></div>`);
    m.el.querySelectorAll('[data-pid]').forEach((o) => o.addEventListener('click', () => { const id = o.dataset.pid; if (sel.has(id)) sel.delete(id); else sel.add(id); o.classList.toggle('on', sel.has(id)); }));
    m.el.querySelector('[data-ok]').addEventListener('click', async () => {
      // pela ordem em que estavam, os novos no fim
      const list = [...ids.filter((id) => sel.has(id)), ...[...sel].filter((id) => !ids.includes(id))];
      const { error } = await sb.from('projects').update({ lead_ids: list, lead_id: list[0] || null }).eq('id', p.id);
      if (error) return toast(error.message);
      p.lead_ids = list; p.lead_id = list[0] || null; m.close(); toast('Guardado.');
      document.querySelectorAll('[data-leads], [data-leadsform]').forEach((x) => drawLeads(x, p));
    });
  });
}

const coState = { ym: new Date().toISOString().slice(0, 7) };
const MESES_L = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
async function centralOverview(box) {
  box.innerHTML = '<p class="muted">A carregar os projetos…</p>';
  const [{ data: projects }, { data: members }, { data: fins }, { data: tasks }, people] = await Promise.all([
    sb.from('projects').select(PROJECT_COLS).eq('is_central', false).eq('community_id', CID()).is('deleted_at', null),
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
  const leadCell = (x) => { const ns = leadsOf(x).map(pname).filter(Boolean); return ns.length ? `<b>${ns.map(esc).join(', ')}</b>` : '<span class="muted">sem líder</span>'; };
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
      <div class="panel table-wrap">${ongoing.length ? `<table class="table co-table"><thead><tr><th>Projeto</th>${money ? '<th class="num">Orçamento</th>' : ''}<th>Líderes</th><th>Atribuídos</th><th>Estado</th><th class="num">Tarefas</th><th>Entrega</th></tr></thead><tbody>
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
      <a class="pv-mark" href="${base}" aria-label="Voltar à visão geral do projeto" title="Visão geral do projeto">${LOGO('studio')}</a><button type="button" class="pv-menu" data-side aria-label="Abrir as páginas do projeto" title="Páginas do projeto">${ICON.list}</button>
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
  const boardMod = import('./board.js'); // o código do board chega ao mesmo tempo que os dados
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
      <a class="pv-mark" href="${base}" aria-label="Voltar à visão geral do projeto" title="Visão geral do projeto">${LOGO('studio')}</a><button type="button" class="pv-menu" data-side aria-label="Abrir as páginas do projeto" title="Páginas do projeto">${ICON.list}</button>
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
  if (IS_STUDIO) import('./miniplayer.js').then((m) => m.miniPlayer(p, { page: 'b', sub: boardId, base: projBase(p) })).catch(() => {});
  const bp = boardPresence(cur.id);
  onCleanup(() => bp.leave());
  const { mountBoard } = await boardMod;
  if (!app.querySelector('.pv-board')) return;
  const board = mountBoard(app.querySelector('.pv-board'), {
    projectId: p.id, boardId: cur.id, presence: bp,
    onOpenBoard: (id) => go(`${base}/b/${id}`),
    onUp: async () => {
      if (cur.parent_id) return go(`${base}/b/${cur.parent_id}`);
      // board de um item de marketing: volta para a página do item
      if (cur.kind === 'wrd') { const { data: wb } = await sb.from('boards').select('data').eq('id', cur.id).maybeSingle(); if (wb?.data?.location_id) return go(`${base}/decors/${wb.data.location_id}`); if (wb?.data?.page) { const [, pg, sb2] = String(wb.data.page).split(':'); return go(!pg || pg === 'geral' ? base : `${base}/${pg}${sb2 ? '/' + sb2 : ''}`); } if (!wb?.data?.character_id && !wb?.data?.person_id) return go(base); return go(`${base}/figurino${wb?.data?.character_id ? '/' + wb.data.character_id : ''}`); }
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
function tasksPage(comm = null) {
  app.innerHTML = `<div class="page">${header('tasks')}
    <div class="wrap page-pad">
      <div class="tc-titlebar"><h1 class="h1">${comm ? `Tarefas · ${esc(comm.name)}` : 'As minhas tarefas'}</h1><div data-tcbar></div></div>
      <div class="tc" data-list></div>
    </div></div>`;
  bindHeader(app);
  const t = mountTaskCenter(app.querySelector('[data-list]'), { ...(comm ? { communityId: comm.id } : { mine: true }), bar: app.querySelector('[data-tcbar]') });
  onCleanup(() => t.destroy());
}

// ---------- comunidades ----------
const COMM_COLORS = ['#0071e3', '#5e5ce6', '#bf5af2', '#e5579b', '#d93a3a', '#d9731f', '#1f9a5c', '#14857f', '#1d1d1f'];
function newCommunity() {
  const m = modal(`<h2>Nova comunidade</h2><p class="muted small">Um espaço partilhado, como uma produtora ou um coletivo: tem as suas pessoas e os seus projetos. Tu ficas administrador.</p>
    <form class="stack">
      <div class="field"><label for="cn">Nome</label><input id="cn" name="name" required placeholder="Ex.: byGrain"></div>
      <div class="field"><span class="label">Cor</span><div class="look-sw">${COMM_COLORS.map((c, i) => `<label class="look-c ${i === 0 ? 'on' : ''}" style="--c:${c}"><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''} class="vh">&nbsp;</label>`).join('')}</div></div>
      <label class="sc-opt"><input type="checkbox" name="business" checked><span><strong>Parte business</strong><small>Central de Produção: visão geral de todos os projetos, finanças (ganhos, movimentos, contas, custos fixos) e tarefas internas. Dá para ligar ou desligar depois.</small></span></label>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar comunidade</button></div>
    </form>`);
  m.el.querySelectorAll('input[name=color]').forEach((r) => r.addEventListener('change', () => m.el.querySelectorAll('.look-c').forEach((l) => l.classList.toggle('on', l.contains(r) && r.checked))));
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const name = String(f.get('name') || '').trim(); if (!name) return;
    const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + Math.random().toString(36).slice(2, 6);
    const { data, error } = await sb.from('communities').insert({ name, slug, color: f.get('color') || COMM_COLORS[0], business: !!f.get('business'), created_by: state.user.id }).select('id').single();
    if (error) return toast(error.message);
    await loadComms(); m.close(); toast('Comunidade criada.'); go(`#/c/${data.id}`);
  });
}

// pessoas da comunidade (administradores): papéis, permissões, contas e definições
async function communityTeamPage(c) {
  app.innerHTML = `<div class="page">${header('team')}
    <div class="wrap page-pad stack-lg">
      <div class="row between wrap-gap"><div><h1 class="h1">Pessoas</h1><p class="muted">${esc(c.name)}</p></div><button type="button" class="btn primary" data-newuser>${ICON.plus} Juntar pessoa</button></div>
      <section class="panel"><h2 class="h3">Membros</h2>
        <p class="muted small">Administradores gerem a comunidade e as pessoas. Membros veem todos os projetos da comunidade${c.business ? ' e a Central de Produção' : ''}. Convidados só veem os projetos para os quais foram convidados.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Nome</th><th>Utilizador</th><th>Email</th><th>Papel</th>${Object.entries(PERMS).map(([, [l]]) => `<th>${l}</th>`).join('')}<th><span class="vh">Ações</span></th></tr></thead><tbody data-users><tr><td colspan="7" class="muted">A carregar…</td></tr></tbody></table></div>
        <p class="muted small">${Object.entries(PERMS).map(([, [l, d]]) => `<b>${l}</b>: ${esc(d)}.`).join(' ')} Os administradores têm sempre tudo.</p>
      </section>
      <section class="panel stack"><h2 class="h3">Comunidade</h2>
        <form class="stack" data-csettings>
          <div class="grid2"><div class="field"><label for="ccn">Nome</label><input id="ccn" name="name" value="${esc(c.name)}" required></div>
          <div class="field"><span class="label">Cor</span><div class="look-sw">${COMM_COLORS.map((col) => `<label class="look-c ${col === c.color ? 'on' : ''}" style="--c:${col}"><input type="radio" name="color" value="${col}" ${col === c.color ? 'checked' : ''} class="vh">&nbsp;</label>`).join('')}</div></div></div>
          <div class="field"><span class="label">Logo</span><div class="row wrap-gap comm-logo-f">${commMark(c, 'comm-logo-pv')}<button type="button" class="btn ghost sm" data-logoup>${ICON.image || ICON.plus} ${isLogo(c.logo_path) ? 'Mudar o logo' : 'Carregar logo'}</button>${isLogo(c.logo_path) ? '<button type="button" class="link-btn small danger-text" data-logorm>Tirar o logo</button>' : ''}<small class="muted">Quadrado de preferência. Aparece no topo, no início e na lista de comunidades.</small></div></div>
          <label class="sc-opt"><input type="checkbox" name="business" ${c.business ? 'checked' : ''}><span><strong>Parte business</strong><small>Central de Produção com a visão geral, finanças e tarefas internas.</small></span></label>
          <div class="row between"><button type="button" class="btn ghost danger-text" data-leave>Sair da comunidade</button><button class="btn primary">Guardar</button></div>
        </form>
      </section>
    </div></div>`;
  bindHeader(app);
  app.querySelector('[data-newuser]').addEventListener('click', () => newUser(c));
  const { data: rows } = await sb.from('community_members').select('role, perms, user_id, profiles!community_members_user_id_fkey(id, display_name, username, email, color)').eq('community_id', c.id);
  const people = (rows || []).filter((r) => r.profiles).map((r) => ({ ...r.profiles, role: r.role, perms: r.perms || [] })).sort((a, b) => ['admin', 'member', 'guest'].indexOf(a.role) - ['admin', 'member', 'guest'].indexOf(b.role) || a.display_name.localeCompare(b.display_name, 'pt'));
  const call = (body) => callFn('admin-users', { community_id: c.id, ...body });
  app.querySelector('[data-users]').innerHTML = people.map((u) => `<tr>
    <td><span class="cell-person"><span class="avatar sm" style="--c:${esc(u.color)}">${esc(initials(u.display_name))}</span>${esc(u.display_name)}</span></td>
    <td>${u.username ? '@' + esc(u.username) : '<span class="muted">—</span>'}</td>
    <td class="muted">${esc(u.email || '')}</td>
    <td><select data-role="${u.id}" aria-label="Papel de ${esc(u.display_name)}" ${u.id === state.user.id ? 'disabled' : ''}>${Object.entries(ROLES).map(([k, v]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td>
    ${Object.keys(PERMS).map((k) => `<td>${u.role === 'admin' ? '<span class="perm-tag">Sempre</span>' : `<label class="switch"><input type="checkbox" data-perm="${k}" data-user="${u.id}" ${u.perms.includes(k) ? 'checked' : ''}><span class="sw-ui" aria-hidden="true"></span><span class="vh">${PERMS[k][0]}</span></label>`}</td>`).join('')}
    <td><div class="row end"><button type="button" class="link-btn" data-pw="${u.id}">Palavra-passe</button>${u.id !== state.user.id ? `<button type="button" class="icon-btn" data-deluser="${u.id}" aria-label="Tirar ${esc(u.display_name)} da comunidade">${ICON.trash}</button>` : ''}</div></td>
  </tr>`).join('');
  app.querySelectorAll('[data-role]').forEach((sel) => sel.addEventListener('change', async () => {
    try { clearPeopleCache(); await call({ action: 'update', user_id: sel.dataset.role, role: sel.value }); toast('Papel mudado.'); communityTeamPage(c); } catch (e) { toast(e.message); communityTeamPage(c); }
  }));
  app.querySelectorAll('[data-perm]').forEach((cb) => cb.addEventListener('change', async () => {
    const u = people.find((x) => x.id === cb.dataset.user);
    const perms = cb.checked ? [...new Set([...u.perms, cb.dataset.perm])] : u.perms.filter((x) => x !== cb.dataset.perm);
    try { await call({ action: 'update', user_id: u.id, perms }); u.perms = perms; toast('Permissão mudada.'); } catch (e) { toast(e.message); cb.checked = !cb.checked; }
  }));
  app.querySelectorAll('[data-pw]').forEach((b) => b.addEventListener('click', () => {
    const u = people.find((x) => x.id === b.dataset.pw);
    const m = modal(`<h2>Palavra-passe de ${esc(u.display_name)}</h2><p class="muted small">Só funciona para contas que pertencem apenas a esta comunidade. Quem também usa o PØRTAL noutros sítios muda a sua palavra-passe sozinho.</p><form class="stack"><div class="field"><label for="npw">Nova palavra-passe</label><input id="npw" type="text" autocomplete="off" required></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const v = m.el.querySelector('#npw').value;
      if (v.length < MIN_PW) return toast(`Pelo menos ${MIN_PW} caracteres.`);
      try { await call({ action: 'update', user_id: u.id, password: authPw(v) }); m.close(); toast('Palavra-passe mudada.'); } catch (er) { toast(er.message); }
    });
  }));
  app.querySelectorAll('[data-deluser]').forEach((b) => b.addEventListener('click', async () => {
    const u = people.find((x) => x.id === b.dataset.deluser);
    if (!(await confirmBox(`Tirar ${u.display_name} da comunidade? A conta continua a existir; só deixa de ver os projetos da comunidade.`, 'Tirar'))) return;
    try { clearPeopleCache(); await call({ action: 'delete', user_id: u.id }); toast('Saiu da comunidade.'); communityTeamPage(c); } catch (e) { toast(e.message); }
  }));
  const form = app.querySelector('[data-csettings]');
  const saveLogo = async (logo_path) => {
    const { error } = await sb.from('communities').update({ logo_path }).eq('id', c.id);
    if (error) return toast(error.message);
    await loadComms(); toast(logo_path ? 'Logo guardado.' : 'Logo tirado.'); setCtx({ comm: commById(c.id) }); communityTeamPage(commById(c.id));
  };
  form.querySelector('[data-logoup]')?.addEventListener('click', () => {
    const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*';
    i.onchange = async () => {
      const f = i.files[0]; if (!f) return;
      try {
        // fica pequeno (256 px) e guardado na própria comunidade, para aparecer logo sem pedir mais nada
        const bmp = await createImageBitmap(f); const k = Math.min(1, 256 / Math.max(bmp.width, bmp.height));
        const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
        cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
        const url = cv.toDataURL('image/webp', 0.85);
        if (url.length > 120000) return toast('A imagem é demasiado pesada. Experimenta uma mais simples.');
        saveLogo(url);
      } catch { toast('Não deu para ler essa imagem.'); }
    };
    i.click();
  });
  form.querySelector('[data-logorm]')?.addEventListener('click', () => saveLogo(null));
  form.querySelectorAll('input[name=color]').forEach((r) => r.addEventListener('change', () => form.querySelectorAll('.look-c').forEach((l) => l.classList.toggle('on', l.contains(r) && r.checked))));
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); const f = new FormData(form);
    const { error } = await sb.from('communities').update({ name: String(f.get('name')).trim() || c.name, color: f.get('color') || c.color, business: !!f.get('business') }).eq('id', c.id);
    if (error) return toast(error.message);
    await loadComms(); toast('Guardado.'); setCtx({ comm: commById(c.id) }); communityTeamPage(commById(c.id));
  });
  app.querySelector('[data-leave]').addEventListener('click', async () => {
    const admins = people.filter((x) => x.role === 'admin');
    if (admins.length === 1 && admins[0].id === state.user.id) return toast('És o único administrador: passa a administração a outra pessoa antes de saíres.');
    if (!(await confirmBox(`Sair de ${c.name}? Deixas de ver os projetos da comunidade.`, 'Sair'))) return;
    const { error } = await sb.from('community_members').delete().eq('community_id', c.id).eq('user_id', state.user.id);
    if (error) return toast(error.message);
    await loadComms(); go('#/');
  });
}

function newUser(c) {
  const m = modal(`<h2>Juntar pessoa a ${esc(c.name)}</h2>
    <p class="muted small">Se a pessoa já tem conta no PØRTAL (ou no Viewfinder), basta o email: entra logo na comunidade. Se não tem, cria-se a conta com a palavra-passe que escolheres.</p>
    <form class="stack">
      <div class="field"><label for="ue">Email</label><input id="ue" name="email" type="email" required></div>
      <div class="grid2">
        <div class="field"><label for="un">Nome</label><input id="un" name="display_name"></div>
        <div class="field"><label for="ur">Papel</label><select id="ur" name="role"><option value="member">Membro</option><option value="admin">Administrador</option><option value="guest">Convidado</option></select></div>
        <div class="field"><label for="uu">Utilizador (opcional)</label><input id="uu" name="username" autocapitalize="none" spellcheck="false" placeholder="ex: rubenmendes"></div>
        <div class="field"><label for="up">Palavra-passe inicial (só para contas novas)</label><input id="up" name="password" type="text" autocomplete="off"></div>
      </div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div>
    </form>`, { wide: true });
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    if (f.password && f.password.length < MIN_PW) return toast(`Pelo menos ${MIN_PW} caracteres.`);
    try { clearPeopleCache(); await callFn('admin-users', { action: 'create', community_id: c.id, ...f, password: f.password ? authPw(f.password) : '' }); m.close(); toast('Está na comunidade.'); communityTeamPage(c); } catch (er) { toast(er.message); }
  });
}
