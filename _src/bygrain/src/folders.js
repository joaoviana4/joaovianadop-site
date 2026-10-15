import { sb, esc, ICON, KINDS, PROJECT_COLS, signedUrls, phaseOf, modal, confirmBox, toast, isAdmin, hideProject, loadHidden } from './lib.js';

// Projetos-pasta (ex.: um álbum): têm um orçamento geral e projetos lá dentro (ex.: os videoclipes),
// cada um com o seu orçamento. O que cada projeto tem atribuído conta para o orçamento geral da pasta.
// projects.parent_id aponta para a pasta.

export const isFolder = (p) => p?.kind === 'album';
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
// Grain fee: percentagem da byGrain sobre os custos do orçamento do projeto (10 % por defeito).
// Só existe no orçamento geral do projeto — os orçamentos de departamento (ex.: Arte) não têm fee.
export const GRAIN_FEE = 10;
export const feePct = (b) => (b?.gfee?.off ? 0 : b?.gfee?.pct != null ? Number(b.gfee.pct) || 0 : GRAIN_FEE);
export const grainFee = (b) => tableTotal(b) * feePct(b) / 100;
export const tableTotal = (b) => (!b?.rows || !b.main ? 0 : b.rows.filter((r) => r.kind === 'item').reduce((a, r) => a + (Number(r.cells?.[b.main]) || 0), 0));

// projetos dentro da pasta, com o orçamento de cada um (só chega o de quem tem acesso)
export async function loadChildren(p) {
  const { data: kids } = await sb.from('projects').select(PROJECT_COLS).eq('parent_id', p.id).is('deleted_at', null).order('starts_on', { ascending: true, nullsFirst: false }).order('name');
  const hidden = await loadHidden();
  const list = (kids || []).filter((k) => !hidden.has(k.id));
  if (!list.length) return [];
  const [{ data: bud }, { data: tasks }] = await Promise.all([
    sb.from('project_budgets').select('project_id, value, budget').in('project_id', list.map((k) => k.id)),
    sb.from('tasks').select('project_id, status').in('project_id', list.map((k) => k.id)).neq('status', 'done'),
  ]);
  const bmap = new Map((bud || []).map((b) => [b.project_id, b]));
  return list.map((k) => {
    const b = bmap.get(k.id);
    return { ...k, _b: b ? { value: b.value != null ? Number(b.value) : null, spent: tableTotal(b.budget), fee: grainFee(b.budget) } : null, _open: (tasks || []).filter((t) => t.project_id === k.id).length };
  });
}
// quanto cada projeto pesa no orçamento geral: o valor atribuído; se não tiver, o total da sua tabela
export const allocated = (k) => (k._b ? (k._b.value != null ? k._b.value : k._b.spent + (k._b.fee || 0)) : 0);
export function rollup(kids) {
  const seen = kids.filter((k) => k._b);
  return { alloc: seen.reduce((a, k) => a + allocated(k), 0), spent: seen.reduce((a, k) => a + (k._b.spent || 0), 0), hidden: kids.length - seen.length };
}

// cartões dos projetos dentro da pasta (na visão geral)
export async function childrenSection(box, p, kids, { base, canBudget, onNew, canEdit, after }) {
  const covers = await signedUrls(kids.map((k) => k.cover_path));
  const R = rollup(kids);
  const own = tableTotal(p.budget) + grainFee(p.budget);
  const total = p.value != null ? Number(p.value) : null;
  const committed = R.alloc + own;
  box.innerHTML = `
    <div class="row between wrap-gap"><div><h2 class="h3">Projetos neste ${esc((KINDS[p.kind] || 'projeto').split(' ')[0].toLowerCase())}</h2><p class="muted small">Cada projeto tem o seu orçamento; o que tem atribuído conta para o orçamento geral.</p></div>
      ${onNew ? `<button type="button" class="btn primary" data-newchild>${ICON.plus} Novo projeto dentro</button>` : ''}</div>
    ${canBudget ? `<div class="fold-sum">
      <div><span>Orçamento geral</span><b>${total != null ? eur.format(total) : '—'}</b></div>
      <div><span>Atribuído aos projetos</span><b>${eur.format(R.alloc)}</b></div>
      <div><span>Custos da própria pasta (com Grain fee)</span><b>${eur.format(own)}</b></div>
      <div class="${total != null && committed > total ? 'over' : ''}"><span>${total == null ? 'Total comprometido' : committed > total ? 'Passa' : 'Sobra'}</span><b>${total == null ? eur.format(committed) : eur.format(Math.abs(total - committed))}</b></div>
      ${total ? `<div class="fold-bar ${committed > total ? 'over' : committed > total * 0.9 ? 'near' : ''}"><i style="width:${Math.min(100, (committed / total) * 100)}%"></i></div>` : ''}
      ${R.hidden ? `<p class="muted small">${R.hidden} projeto${R.hidden > 1 ? 's' : ''} sem orçamento visível para ti.</p>` : ''}
    </div>` : ''}
    ${kids.length ? `<div class="fold-grid">${kids.map((k) => { const ph = phaseOf(k); return `<div class="fold-cw">${`<span class="fold-act">${canEdit ? `<button type="button" class="icon-btn sm" data-ren="${k.id}" title="Mudar o nome" aria-label="Mudar o nome de ${esc(k.name)}">${ICON.edit}</button>` : ''}<button type="button" class="icon-btn sm" data-hide="${k.id}" title="Tirar da minha lista (os outros continuam a vê-lo)" aria-label="Tirar ${esc(k.name)} da minha lista">${ICON.hide}</button>${isAdmin() ? `<button type="button" class="icon-btn sm" data-del="${k.id}" title="Mandar para a reciclagem (para toda a gente)" aria-label="Apagar ${esc(k.name)}">${ICON.trash}</button>` : ''}</span>`}<a class="fold-card" href="#/p/${k.id}">
      <span class="fold-cover" style="${covers[k.cover_path] ? `background-image:url('${esc(covers[k.cover_path])}')` : ''}"><span class="tag dark">${esc(KINDS[k.kind] || k.kind)}</span></span>
      <span class="fold-b"><b>${esc(k.name)}</b><small>${esc(ph.label || 'Sem datas')} · ${k._open} tarefa${k._open === 1 ? '' : 's'} aberta${k._open === 1 ? '' : 's'}</small>
      ${canBudget && k._b ? `<small class="fold-money">${k._b.value != null ? eur.format(k._b.value) : 'sem valor'} · gasto ${eur.format(k._b.spent)}</small>` : ''}</span></a></div>`; }).join('')}</div>`
      : `<p class="empty-note">Ainda não há projetos aqui dentro.${onNew ? ' Cria o primeiro em “Novo projeto dentro”.' : ''}</p>`}`;
  box.querySelector('[data-newchild]')?.addEventListener('click', onNew);
  const kid = (id) => kids.find((k) => k.id === id);
  box.querySelectorAll('[data-ren]').forEach((b) => b.addEventListener('click', () => {
    const k = kid(b.dataset.ren);
    const m = modal(`<h2>Mudar o nome</h2><form class="stack"><div class="field"><label for="kn">Nome do projeto</label><input id="kn" value="${esc(k.name)}" required maxlength="120"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    const inp = m.el.querySelector('#kn'); inp.focus(); inp.select();
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault(); const name = inp.value.trim(); if (!name) return;
      const { error } = await sb.from('projects').update({ name }).eq('id', k.id);
      if (error) return toast(error.message);
      k.name = name; m.close(); toast('Nome mudado.'); after ? after() : childrenSection(box, p, kids, { base, canBudget, onNew, canEdit, after });
    });
  }));
  box.querySelectorAll('[data-hide]').forEach((b) => b.addEventListener('click', async () => {
    const k = kid(b.dataset.hide);
    if (!(await hideProject(k.id))) return;
    toast(`"${k.name}" saiu da tua lista. Os outros continuam a vê-lo; voltas a mostrá-lo em "Escondidos", no início.`);
    after ? after() : childrenSection(box, p, kids.filter((x) => x.id !== k.id), { base, canBudget, onNew, canEdit, after });
  }));
  box.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    const k = kid(b.dataset.del);
    if (!(await confirmBox(`Apagar "${k.name}"? Vai para a reciclagem e só é apagado de vez daqui a 10 dias. Até lá, qualquer pessoa da equipa o pode recuperar.`, 'Mandar para a reciclagem'))) return;
    const { error } = await sb.rpc('trash_project', { p: k.id });
    if (error) return toast(error.message);
    toast('Foi para a reciclagem. Podes recuperá-lo durante 10 dias, no separador "Reciclagem".');
    after ? after() : childrenSection(box, p, kids.filter((x) => x.id !== k.id), { base, canBudget, onNew, canEdit, after });
  }));
}

// painel do orçamento da pasta: uma linha por projeto, com o atribuído e o gasto
export function budgetChildrenPanel(box, p, kids) {
  const R = rollup(kids);
  box.innerHTML = `<section class="panel fold-bud"><div class="row between wrap-gap"><h2 class="h3">Projetos dentro</h2><span class="muted small">Atribuído = orçamento geral de cada projeto (ou o total da tabela, se não tiver)</span></div>
    ${kids.length ? `<div class="cst-tw"><table class="fold-t"><thead><tr><th>Projeto</th><th>Atribuído</th><th>Gasto (tabela)</th><th></th></tr></thead><tbody>
      ${kids.map((k) => { const pct = k._b && k._b.value ? Math.min(100, (k._b.spent / k._b.value) * 100) : 0; return `<tr><td><a href="#/p/${k.id}/orcamento">${esc(k.name)}</a><small>${esc(KINDS[k.kind] || '')}</small></td>
        <td>${k._b ? (k._b.value != null ? eur.format(k._b.value) : `<span class="muted">${eur.format(k._b.spent + (k._b.fee || 0))} (sem valor, com fee)</span>`) : '<span class="muted">sem acesso</span>'}</td>
        <td>${k._b ? eur.format(k._b.spent) : '—'}</td>
        <td class="fold-mini">${k._b?.value ? `<span class="fold-bar ${k._b.spent > k._b.value ? 'over' : pct > 90 ? 'near' : ''}"><i style="width:${pct}%"></i></span>` : ''}</td></tr>`; }).join('')}
      </tbody><tfoot><tr><td>Total dos projetos</td><td>${eur.format(R.alloc)}</td><td>${eur.format(R.spent)}</td><td></td></tr></tfoot></table></div>` : '<p class="muted small">Ainda não há projetos dentro desta pasta.</p>'}
  </section>`;
  return R.alloc;
}
