import { sb, state, esc, ICON, modal, initials, DB_SCHEMA } from './lib.js';

// Atividade: "Rúben Mendes alterou o orçamento · da.selva". Um sino no topo com as novidades dos meus
// projetos (as minhas próprias alterações não contam), um aviso no momento quando alguém mexe,
// e a página "Atividade" de cada projeto. Carregar numa linha leva ao sítio da alteração.
// Os dados vêm de studio.activity (escritos por gatilhos na base de dados).

const st = { seen: null, unread: 0, ch: null, names: new Map(), projects: new Map(), listeners: new Set() };

// ---------- texto e ligação de cada linha ----------
const BOARD_NOUN = { board: 'o board', wrd: 'o moodboard', mkt: 'o board', table: 'a tabela', timeline: 'o cronograma', lightmap: 'o mapa de luz', budget: 'o orçamento', media: 'a página de música e pre-vis', callsheet: 'a folha de serviço', transport: 'o mapa de transportes' };
const q = (s) => (s ? `«${s}»` : '');
export function describe(a) {
  const nm = q(a.name);
  const V = { insert: 'criou', update: 'alterou', delete: 'apagou', done: 'concluiu', approve: 'aprovou' };
  const v = V[a.action] || 'alterou';
  switch (a.t) {
    case 'budget': return a.action === 'approve' ? 'aprovou o orçamento' : 'alterou o orçamento';
    case 'board': { const n = BOARD_NOUN[a.board_kind] || 'o board'; return a.action === 'update' ? `mexeu n${n.slice(0, 1) === 'a' ? 'a' : 'o'}${n.slice(n.indexOf(' '))} ${nm}` : `${v} ${n} ${nm}`; }
    case 'task': return `${v} a tarefa ${nm}`;
    case 'scene': return `${v} a cena ${nm}`;
    case 'shot': return `${v} o plano ${a.name || ''}`.trim();
    case 'script': return a.action === 'insert' ? 'juntou uma versão nova do guião' : `${v} o guião`;
    case 'prop': return `${v} o adereço ${nm}`;
    case 'character': return `${v} ${nm || 'uma pessoa do elenco'}`;
    case 'location': return `${v} o décor ${nm}`;
    case 'gear': return a.action === 'insert' ? `juntou ${nm || 'equipamento'} ao equipamento` : a.action === 'delete' ? `tirou ${nm} do equipamento` : `alterou ${nm} no equipamento`;
    case 'marketing': return `${v} ${nm} no marketing`;
    case 'question': return a.action === 'insert' ? `levantou a questão ${nm}` : a.action === 'done' ? `decidiu ${nm}` : `${v} a questão ${nm}`;
    case 'details': return 'alterou os detalhes do projeto';
    case 'team': return a.action === 'insert' ? `juntou ${a.name || 'uma pessoa'} à equipa` : a.action === 'delete' ? `tirou ${a.name || 'uma pessoa'} da equipa` : `alterou ${a.name || 'a equipa'} na equipa`;
    default: return `${v} ${nm}`;
  }
}
export function hrefOf(a, p) {
  const base = p?.is_central ? `#/c/${p.community_id}/central` : `#/p/${a.project_id}`;
  const fiction = p && (p.kind === 'ficcao' || (p.modules?.list || []).includes('cenas'));
  const gone = a.action === 'delete';
  switch (a.t) {
    case 'budget': return `${base}/orcamento`;
    case 'board': return gone || !a.board_id ? base : `${base}/${['board', 'mkt', 'wrd'].includes(a.board_kind || 'board') ? 'b' : 'f'}/${a.board_id}`;
    case 'task': return `${base}/tarefas`;
    case 'scene': return `${base}/${fiction ? 'cenas' : 'seguimento'}${gone ? '' : `/${a.entity_id}`}`;
    case 'shot': return gone ? `${base}/storyboard` : `${base}/plano/${a.entity_id}`;
    case 'script': return `${base}/guiao`;
    case 'prop': return `${base}/aderecos`;
    case 'character': return `${base}/${fiction ? 'personagens' : 'elenco'}${gone ? '' : `/${a.entity_id}`}`;
    case 'location': return `${base}/decors${gone ? '' : `/${a.entity_id}`}`;
    case 'gear': return `${base}/equipamento`;
    case 'marketing': return `${base}/marketing${gone ? '' : `/${a.entity_id}`}`;
    case 'details': return `${base}/detalhes`;
    case 'team': return `${base}/equipa`;
    default: return base;
  }
}
const ago = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'agora'; if (s < 3600) return `há ${Math.floor(s / 60)} min`; if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400); return d === 1 ? 'ontem' : d < 7 ? `há ${d} dias` : new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
};

// nomes de pessoas e projetos das linhas (guardados para não pedir sempre)
async function hydrate(rows) {
  const ppl = [...new Set(rows.map((r) => r.actor_id).filter((id) => id && !st.names.has(id)))];
  const prj = [...new Set(rows.map((r) => r.project_id).filter((id) => !st.projects.has(id)))];
  const [a, b] = await Promise.all([
    ppl.length ? sb.from('profiles').select('id, display_name, color').in('id', ppl) : Promise.resolve({ data: [] }),
    prj.length ? sb.from('projects').select('id, name, kind, modules, is_central, community_id').in('id', prj) : Promise.resolve({ data: [] }),
  ]);
  (a.data || []).forEach((x) => st.names.set(x.id, x));
  (b.data || []).forEach((x) => st.projects.set(x.id, x));
}
const who = (id) => st.names.get(id) || { display_name: 'Alguém', color: '#8A8A99' };

// ---------- não lidas ----------
async function loadSeen() {
  if (st.seen) return st.seen;
  const { data } = await sb.from('activity_seen').select('seen_at').eq('user_id', state.user.id).maybeSingle();
  // primeira vez: conta só o que acontecer daqui para a frente (não 300 linhas antigas)
  if (!data) { const now = new Date().toISOString(); await sb.from('activity_seen').upsert({ user_id: state.user.id, seen_at: now }); st.seen = now; }
  else st.seen = data.seen_at;
  return st.seen;
}
async function countUnread() {
  const seen = await loadSeen();
  const { count } = await sb.from('activity').select('id', { count: 'exact', head: true }).neq('actor_id', state.user.id).gt('updated_at', seen);
  st.unread = count || 0; paint();
}
async function markSeen() {
  st.seen = new Date().toISOString(); st.unread = 0; paint();
  await sb.from('activity_seen').upsert({ user_id: state.user.id, seen_at: st.seen });
}
function paint() {
  document.querySelectorAll('[data-actbadge]').forEach((b) => { b.textContent = st.unread > 99 ? '99+' : String(st.unread); b.hidden = !st.unread; });
}

// ---------- sino no topo ----------
export const activityButton = () => `<button type="button" class="icon-btn act-btn" data-act aria-label="Atividade" title="Atividade">${ICON.bell}<span class="act-badge" data-actbadge hidden>0</span></button>`;
export function bindActivity(root) {
  const b = root.querySelector('[data-act]'); if (!b) return;
  b.addEventListener('click', () => openPanel());
  paint();
  start();
}

// ligação em tempo real: conta e avisa quando alguém mexe
let started = false;
async function start() {
  if (started || !state.user) return; started = true;
  await countUnread();
  st.ch = sb.channel('activity-feed')
    .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'activity' }, async ({ new: a, eventType }) => {
      if (!a || a.actor_id === state.user.id) return;
      await hydrate([a]);
      if (eventType === 'INSERT' || new Date(a.updated_at) > new Date(st.seen || 0)) countUnread();
      st.listeners.forEach((f) => f(a));
      if (eventType !== 'INSERT') return; // juntar alterações não volta a avisar
      const p = st.projects.get(a.project_id); const x = who(a.actor_id);
      pop(`<a href="${hrefOf(a, p)}" class="act-toast"><span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span><span><b>${esc(x.display_name)}</b> ${esc(describe(a))}${p ? `<small class="muted">${esc(p.is_central ? 'Central de Produção' : p.name)}</small>` : ''}</span></a>`);
    })
    .subscribe();
}

// aviso no canto (até 3 ao mesmo tempo), carrega para ir lá
function pop(html) {
  let box = document.querySelector('.act-pops');
  if (!box) { box = document.createElement('div'); box.className = 'act-pops'; box.setAttribute('aria-live', 'polite'); document.body.append(box); }
  const el = document.createElement('div'); el.className = 'act-pop'; el.innerHTML = html + `<button type="button" class="icon-btn sm" aria-label="Fechar">${ICON.close}</button>`;
  el.querySelector('button').addEventListener('click', () => el.remove());
  el.querySelector('a').addEventListener('click', () => el.remove());
  box.prepend(el); while (box.children.length > 3) box.lastChild.remove();
  setTimeout(() => el.classList.add('out'), 7000); setTimeout(() => el.remove(), 7400);
}

// lista (do projeto, ou de todos os meus projetos)
async function fetchRows({ projectId = null, limit = 60, before = null } = {}) {
  let qy = sb.from('activity').select('*').order('updated_at', { ascending: false }).limit(limit);
  if (projectId) qy = qy.eq('project_id', projectId);
  if (before) qy = qy.lt('updated_at', before);
  const { data } = await qy;
  await hydrate(data || []);
  return data || [];
}
function rowHtml(a, { showProject = true, seen = null } = {}) {
  const x = who(a.actor_id); const p = st.projects.get(a.project_id);
  const unread = seen && a.actor_id !== state.user.id && new Date(a.updated_at) > new Date(seen);
  return `<li class="act-row ${unread ? 'unread' : ''}"><a href="${hrefOf(a, p)}">
    <span class="avatar sm" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span>
    <span class="act-txt"><span><b>${esc(a.actor_id === state.user.id ? 'Tu' : x.display_name)}</b> ${esc(describe(a))}${a.n > 1 ? ` <span class="muted small">(${a.n} alterações)</span>` : ''}</span>
      <small class="muted">${showProject && p ? `${esc(p.is_central ? 'Central de Produção' : p.name)} · ` : ''}${ago(a.updated_at)}</small></span>
    ${unread ? '<i class="act-dot" aria-label="Nova"></i>' : ''}</a></li>`;
}

async function openPanel() {
  const projectId = state.ctx?.project?.id || null;
  const seen = st.seen;
  const m = modal(`<div class="row between act-head"><h2>Atividade</h2>${projectId ? `<div class="seg dark" role="tablist"><button type="button" role="tab" aria-selected="false" data-scope="all">Todos os projetos</button><button type="button" role="tab" aria-selected="true" data-scope="p">Este projeto</button></div>` : ''}</div>
    <ul class="act-list" data-list><li class="muted">A carregar…</li></ul>`, { wide: true });
  let scope = projectId ? 'p' : 'all';
  const draw = async () => {
    const rows = (await fetchRows({ projectId: scope === 'p' ? projectId : null })).filter((a) => a.actor_id !== state.user.id || scope === 'p');
    const el = m.el.querySelector('[data-list]');
    el.innerHTML = rows.length ? rows.map((a) => rowHtml(a, { showProject: scope !== 'p', seen })).join('') : '<li class="muted">Ainda não há atividade de outras pessoas.</li>';
    el.querySelectorAll('a').forEach((x) => x.addEventListener('click', () => m.close()));
  };
  m.el.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => { scope = b.dataset.scope; m.el.querySelectorAll('[data-scope]').forEach((y) => y.setAttribute('aria-selected', y === b)); draw(); }));
  await draw();
  markSeen();
}

// página "Atividade" de um projeto: tudo, incluindo as minhas alterações
export async function activityPage(main, p) {
  main.innerHTML = `<div class="row between wrap-gap"><div><h1 class="h1 pm-title">Atividade</h1><p class="muted">Quem mexeu em quê neste projeto. Alterações seguidas da mesma pessoa na mesma coisa aparecem juntas.</p></div></div>
    <section class="panel"><ul class="act-list" data-list><li class="muted">A carregar…</li></ul><div class="row" data-more></div></section>`;
  const el = main.querySelector('[data-list]'); const more = main.querySelector('[data-more]');
  let rows = [];
  const load = async () => {
    const got = await fetchRows({ projectId: p.id, limit: 80, before: rows.length ? rows[rows.length - 1].updated_at : null });
    rows = [...rows, ...got];
    el.innerHTML = rows.length ? rows.map((a) => rowHtml(a, { showProject: false, seen: st.seen })).join('') : '<li class="muted">Ainda não há atividade neste projeto.</li>';
    more.innerHTML = got.length === 80 ? '<button type="button" class="btn ghost" data-mo>Ver mais</button>' : '';
    more.querySelector('[data-mo]')?.addEventListener('click', load);
  };
  await load();
  const live = (a) => { if (a.project_id !== p.id || !document.body.contains(el)) { st.listeners.delete(live); return; } rows = [a, ...rows.filter((r) => r.id !== a.id)]; el.innerHTML = rows.map((r) => rowHtml(r, { showProject: false, seen: st.seen })).join(''); };
  st.listeners.add(live);
}
