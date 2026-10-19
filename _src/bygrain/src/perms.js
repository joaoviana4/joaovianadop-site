import { sb, esc, toast, modal, ICON, ROLES, PERMS, hasPerm, isAdmin, initials, state } from './lib.js';
import { loadPeople } from './tasks.js';

// Quem pode ver o orçamento de um projeto:
//  · administradores (sempre)
//  · quem tem a permissão "Orçamentos" (em todos os projetos), dada em Equipa e permissões
//  · quem recebeu acesso só a este projeto (budget_access)

export async function budgetAccess(p) {
  const [people, { data: members }, { data: grants }, { data: perms }] = await Promise.all([
    loadPeople(),
    sb.from('project_members').select('user_id').eq('project_id', p.id),
    sb.from('budget_access').select('user_id').eq('project_id', p.id),
    sb.from('user_perms').select('user_id, perm'),
  ]);
  const memberIds = new Set((members || []).map((m) => m.user_id));
  const granted = new Set((grants || []).map((g) => g.user_id));
  const global = new Set((perms || []).filter((x) => x.perm === 'budget').map((x) => x.user_id));
  // quem tem acesso ao projeto: equipa da Grain + convidados deste projeto
  const inProject = people.filter((x) => x.role !== 'guest' || memberIds.has(x.id));
  const how = (x) => (x.role === 'admin' ? 'admin' : global.has(x.id) ? 'global' : granted.has(x.id) ? 'project' : null);
  return { people: inProject, how, sees: inProject.filter((x) => how(x)) };
}

const avatar = (x) => `<span class="avatar sm" title="${esc(x.display_name)}" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span>`;

// pequeno resumo "quem vê" para pôr no topo do orçamento
export async function budgetWhoChip(box, p, onManage) {
  const a = await budgetAccess(p);
  box.innerHTML = `<button type="button" class="who-chip" data-who>${ICON.lock}<span>Visível para</span><span class="av-stack">${a.sees.slice(0, 5).map(avatar).join('')}${a.sees.length > 5 ? `<span class="avatar sm more">+${a.sees.length - 5}</span>` : ''}</span><span class="muted small">${a.sees.length} de ${a.people.length}</span>${hasPerm('budget') ? '<span class="link-btn">Gerir</span>' : ''}</button>`;
  box.querySelector('[data-who]').addEventListener('click', () => {
    const m = modal(`<h2>Quem vê o orçamento</h2><p class="muted small">O orçamento e o valor deste projeto só aparecem a estas pessoas, na vista geral, na Central e aqui. Para os outros, simplesmente não existe.</p><div data-acc></div><div class="row end"><button type="button" class="btn primary" data-close>Feito</button></div>`);
    budgetAccessPanel(m.el.querySelector('[data-acc]'), p, () => budgetWhoChip(box, p, onManage));
  });
}

// lista com interruptores: usada na equipa do projeto e no "Gerir" do orçamento
export async function budgetAccessPanel(root, p, after, pre) {
  const a = await (pre || budgetAccess(p));
  const can = hasPerm('budget');
  const rows = [...a.people].sort((x, y) => ['admin', 'global', 'project', null].indexOf(a.how(x)) - ['admin', 'global', 'project', null].indexOf(a.how(y)) || x.display_name.localeCompare(y.display_name, 'pt'));
  root.innerHTML = `<ul class="perm-list">${rows.map((x) => { const h = a.how(x); return `<li>
      ${avatar(x)}<span class="pl-name"><strong>${esc(x.display_name)}</strong><span class="muted small">${esc(ROLES[x.role])}</span></span>
      ${h === 'admin' ? '<span class="perm-tag">Sempre · administrador</span>'
        : h === 'global' ? '<span class="perm-tag">Todos os projetos</span>'
        : `<label class="switch ${can ? '' : 'off'}"><input type="checkbox" data-grant="${x.id}" ${h === 'project' ? 'checked' : ''} ${can ? '' : 'disabled'}><span class="sw-ui" aria-hidden="true"></span><span class="vh">Ver o orçamento deste projeto</span></label>`}
    </li>`; }).join('')}</ul>
    ${can ? '<p class="muted small">"Todos os projetos" muda-se em Equipa e permissões. Aqui dás acesso só a este projeto, por exemplo a um produtor externo.</p>' : '<p class="muted small">Só administradores ou quem tem a permissão "Orçamentos" pode mudar isto.</p>'}`;
  root.querySelectorAll('[data-grant]').forEach((c) => c.addEventListener('change', async () => {
    const q = c.checked
      ? sb.from('budget_access').insert({ project_id: p.id, user_id: c.dataset.grant })
      : sb.from('budget_access').delete().eq('project_id', p.id).eq('user_id', c.dataset.grant);
    const { error } = await q;
    if (error) { toast(error.message); c.checked = !c.checked; return; }
    toast(c.checked ? 'Agora vê o orçamento deste projeto.' : 'Deixou de ver o orçamento.');
    after && after();
  }));
}

// Equipa e permissões (administradores): interruptores globais por pessoa
export async function globalPermsPanel(root) {
  const [{ data: people }, { data: perms }] = await Promise.all([
    sb.from('profiles').select('id, display_name, role, color').order('display_name'),
    sb.from('user_perms').select('user_id, perm'),
  ]);
  const has = (u, k) => (perms || []).some((x) => x.user_id === u && x.perm === k);
  const staff = (people || []).filter((x) => x.role !== 'guest');
  root.innerHTML = `
    <div class="perm-matrix">
      <div class="pm-row pm-headrow"><span>Pessoa</span>${Object.entries(PERMS).map(([, [l, d]]) => `<span title="${esc(d)}">${l}</span>`).join('')}</div>
      ${staff.map((u) => `<div class="pm-row">${avatar(u)}<span class="pl-name"><strong>${esc(u.display_name)}</strong><span class="muted small">${esc(ROLES[u.role])}</span></span>
        ${Object.keys(PERMS).map((k) => u.role === 'admin' ? '<span class="perm-tag">Sempre</span>' : `<label class="switch"><input type="checkbox" data-perm="${k}" data-user="${u.id}" ${has(u.id, k) ? 'checked' : ''}><span class="sw-ui" aria-hidden="true"></span><span class="vh">${PERMS[k][0]} para ${esc(u.display_name)}</span></label>`).join('')}</div>`).join('')}
    </div>
    <ul class="perm-legend">${Object.entries(PERMS).map(([, [l, d]]) => `<li><strong>${l}</strong> ${esc(d)}.</li>`).join('')}
      <li><strong>Convidados</strong> nunca veem valores, a não ser que lhes dês acesso ao orçamento de um projeto específico, na equipa desse projeto.</li></ul>`;
  root.querySelectorAll('[data-perm]').forEach((c) => c.addEventListener('change', async () => {
    const q = c.checked
      ? sb.from('user_perms').insert({ user_id: c.dataset.user, perm: c.dataset.perm })
      : sb.from('user_perms').delete().eq('user_id', c.dataset.user).eq('perm', c.dataset.perm);
    const { error } = await q;
    if (error) { toast(error.message); c.checked = !c.checked; return; }
    if (c.dataset.user === state.user.id) { state.perms[c.checked ? 'add' : 'delete'](c.dataset.perm); }
    toast('Permissão guardada.');
  }));
}

export { isAdmin };
