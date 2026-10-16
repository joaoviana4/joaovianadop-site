import { sb, esc, toast, modal, confirmBox, ICON, todayISO, hasPerm } from './lib.js';
import { CID, withC } from './lib.js';
import { summaryTab, earningsTab, peopleTab } from './finsummary.js';

// Finanças da Grain (Central de Produção, só membros): movimentos do mês, contas e despesas mensais fixas.

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const money = (n) => eur.format(Number(n) || 0);
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const CATS = ['Cliente', 'Produção', 'Equipamento', 'Aluguer de material', 'Software e subscrições', 'Renda e estúdio', 'Transportes', 'Alimentação', 'Equipa e freelancers', 'Impostos e contabilidade', 'Marketing', 'Outros'];
const KINDS = { banco: 'Banco', caixa: 'Caixa', cartao: 'Cartão', outra: 'Outra' };
const st = { tab: 'resumo', ym: todayISO().slice(0, 7), year: todayISO().slice(0, 4) };

const ymLabel = (ym) => { const [y, m] = ym.split('-'); return `${MESES[+m - 1]} ${y}`; };
const shiftYm = (ym, d) => { const [y, m] = ym.split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`; };
const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); };
const dmy = (iso) => { const [, m, d] = iso.split('-'); return `${+d} ${MESES[+m - 1].slice(0, 3)}`; };

export async function financePage(main, sub) {
  // Resumo, Ganhos e Pessoas: membros e administradores. Movimentos, contas e custos fixos: quem tem a permissão Finanças.
  const full = hasPerm('finance');
  if (['resumo', 'ganhos', 'pessoas', 'movimentos', 'contas', 'despesas'].includes(sub)) st.tab = sub;
  if (!full && ['movimentos', 'contas', 'despesas'].includes(st.tab)) st.tab = 'resumo';
  main.innerHTML = `<div class="row between wrap-gap"><h1 class="h1 pm-title">Finanças</h1>
    <div class="seg dark" role="tablist">${[['resumo', 'Resumo'], ['ganhos', 'Ganhos'], ['pessoas', 'Pessoas'], ...(full ? [['movimentos', 'Movimentos'], ['contas', 'Contas'], ['despesas', 'Custos fixos']] : [])].map(([k, l]) => `<button type="button" role="tab" aria-selected="${st.tab === k}" data-t="${k}">${l}</button>`).join('')}</div></div>
    <div class="fin" data-fin><p class="muted">A carregar…</p></div>`;
  main.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { st.tab = b.dataset.t; financePage(main); }));
  const box = main.querySelector('[data-fin]');
  if (st.tab === 'resumo') return summaryTab(box, st);
  if (st.tab === 'ganhos') return earningsTab(box, st);
  if (st.tab === 'pessoas') return peopleTab(box, st);
  const [{ data: accounts }, { data: recurring }, { data: projects }] = await Promise.all([
    sb.from('fin_accounts').select('*').eq('community_id', CID()).order('position'),
    sb.from('fin_recurring').select('*').eq('community_id', CID()).order('day_of_month'),
    sb.from('projects').select('id, name').eq('is_central', false).eq('community_id', CID()).is('deleted_at', null).order('name'),
  ]);
  const ctx = { accounts: accounts || [], recurring: recurring || [], projects: projects || [], reload: () => financePage(main) };
  if (st.tab === 'movimentos') return movements(box, ctx);
  if (st.tab === 'contas') return accountsTab(box, ctx);
  return recurringTab(box, ctx);
}

// ---------- movimentos ----------
async function movements(box, ctx) {
  const from = `${st.ym}-01`, to = `${st.ym}-${lastDay(st.ym)}`;
  const { data } = await sb.from('fin_movements').select('*').eq('community_id', CID()).gte('date', from).lte('date', to).order('date', { ascending: false }).order('created_at', { ascending: false });
  const list = data || [];
  const sum = (dir) => list.filter((x) => x.direction === dir).reduce((a, x) => a + Number(x.amount), 0);
  const inn = sum('in'), out = sum('out');
  const acc = (id) => ctx.accounts.find((a) => a.id === id);
  const proj = (id) => ctx.projects.find((p) => p.id === id);
  const pending = ctx.recurring.filter((r) => r.active && !list.some((m) => m.recurring_id === r.id));
  const byCat = {}; list.filter((x) => x.direction === 'out').forEach((x) => { byCat[x.category || 'Sem categoria'] = (byCat[x.category || 'Sem categoria'] || 0) + Number(x.amount); });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const nIn = list.filter((x) => x.direction === 'in').length, nOut = list.length - nIn;
  box.innerHTML = `
    <div class="fin-bar">
      <div class="month-nav"><button type="button" class="icon-btn" data-m="-1" aria-label="Mês anterior">${ICON.back}</button><strong>${ymLabel(st.ym)}</strong><button type="button" class="icon-btn" data-m="1" aria-label="Mês seguinte">${ICON.chev}</button></div>
      <div class="fin-actions">${pending.length ? `<button type="button" class="btn ghost" data-fixed>Lançar despesas mensais <span class="count">${pending.length}</span></button>` : ''}<button type="button" class="btn primary" data-add>${ICON.plus} Movimento</button></div>
    </div>
    <div class="fin-stats">
      <div class="fstat"><span class="fl">Entradas</span><strong class="pos">${money(inn)}</strong><span class="fs">${nIn} ${nIn === 1 ? 'movimento' : 'movimentos'}</span></div>
      <div class="fstat"><span class="fl">Saídas</span><strong class="neg">${money(out)}</strong><span class="fs">${nOut} ${nOut === 1 ? 'movimento' : 'movimentos'}${pending.length ? ` · ${pending.length} ${pending.length === 1 ? 'fixa' : 'fixas'} por lançar` : ''}</span></div>
      <div class="fstat ${inn - out >= 0 ? 'good' : 'bad'}"><span class="fl">Resultado do mês</span><strong>${money(inn - out)}</strong><span class="fs">${inn - out >= 0 ? 'Positivo' : 'Negativo'}</span></div>
    </div>
    <div class="fin-grid">
      <section class="panel fin-main"><h2 class="h3">Movimentos</h2>${list.length ? `<div class="table-wrap"><table class="table fin"><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th class="num">Valor</th></tr></thead><tbody>
        ${list.map((m) => `<tr class="click-row" data-mov="${m.id}"><td class="muted">${dmy(m.date)}</td><td><strong>${esc(m.description)}</strong>${m.project_id ? `<div class="small muted">${esc(proj(m.project_id)?.name || '')}</div>` : ''}${m.recurring_id ? '<div class="small muted">Despesa mensal</div>' : ''}</td><td class="small">${esc(m.category)}</td><td class="small">${esc(acc(m.account_id)?.name || '—')}</td><td class="num ${m.direction === 'in' ? 'pos' : 'neg'}">${m.direction === 'in' ? '+' : '−'}${money(m.amount)}</td></tr>`).join('')}
      </tbody></table></div>` : `<div class="fin-empty"><p>Ainda não há movimentos em ${ymLabel(st.ym)}.</p><button type="button" class="btn ghost" data-add2>${ICON.plus} Juntar o primeiro</button></div>`}</section>
      <aside class="fin-side"><section class="panel"><h2 class="h3">Saídas por categoria</h2>
        ${cats.length ? `<ul class="cat-bars">${cats.map(([c, v]) => `<li><div class="row between small"><span>${esc(c)}</span><span>${money(v)}</span></div><div class="bar"><i style="width:${Math.round((v / out) * 100)}%"></i></div></li>`).join('')}</ul>` : '<p class="muted small">Sem saídas este mês.</p>'}
      </section></aside>
    </div>`;
  box.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { st.ym = shiftYm(st.ym, +b.dataset.m); movements(box, ctx); }));
  box.querySelectorAll('[data-add], [data-add2]').forEach((b) => b.addEventListener('click', () => movementForm(ctx, null, () => movements(box, ctx))));
  box.querySelectorAll('[data-mov]').forEach((r) => r.addEventListener('click', () => movementForm(ctx, list.find((x) => x.id === r.dataset.mov), () => movements(box, ctx))));
  box.querySelector('[data-fixed]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Lançar ${pending.length} ${pending.length === 1 ? 'despesa mensal' : 'despesas mensais'} em ${ymLabel(st.ym)} (${money(pending.reduce((a, r) => a + Number(r.amount), 0))})?`, 'Lançar'))) return;
    const rows = pending.map((r) => ({ date: `${st.ym}-${String(Math.min(r.day_of_month, lastDay(st.ym))).padStart(2, '0')}`, description: r.name, amount: r.amount, direction: 'out', category: r.category, account_id: r.account_id, recurring_id: r.id }));
    const { error } = await sb.from('fin_movements').insert(withC(rows));
    if (error) return toast(error.message);
    toast('Despesas mensais lançadas.'); movements(box, ctx);
  });
}

function selectOpts(list, cur, empty = '—') {
  return `<option value="">${empty}</option>` + list.map((x) => `<option value="${x.id}" ${x.id === cur ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
}

function movementForm(ctx, m, after) {
  const isNew = !m;
  m = m || { date: st.ym === todayISO().slice(0, 7) ? todayISO() : `${st.ym}-01`, description: '', amount: '', direction: 'out', category: '', account_id: ctx.accounts[0]?.id, project_id: null, notes: '' };
  const md = modal(`<h2>${isNew ? 'Novo movimento' : 'Movimento'}</h2>
    <form class="stack">
      <div class="seg dark dir" role="radiogroup" aria-label="Tipo">
        <label><input type="radio" name="direction" value="out" ${m.direction === 'out' ? 'checked' : ''}><span>Saída</span></label>
        <label><input type="radio" name="direction" value="in" ${m.direction === 'in' ? 'checked' : ''}><span>Entrada</span></label>
      </div>
      <div class="field"><label for="md">Descrição</label><input id="md" name="description" value="${esc(m.description)}" required></div>
      <div class="grid2">
        <div class="field"><label for="ma">Valor (€)</label><input id="ma" name="amount" type="number" step="0.01" min="0" inputmode="decimal" value="${esc(m.amount)}" required></div>
        <div class="field"><label for="mdt">Data</label><input id="mdt" name="date" type="date" value="${esc(m.date)}" required></div>
        <div class="field"><label for="mc">Categoria</label><input id="mc" name="category" list="cats" value="${esc(m.category)}"><datalist id="cats">${CATS.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
        <div class="field"><label for="mac">Conta</label><select id="mac" name="account_id">${selectOpts(ctx.accounts, m.account_id)}</select></div>
      </div>
      <div class="field"><label for="mp">Projeto (opcional)</label><select id="mp" name="project_id">${selectOpts(ctx.projects, m.project_id, 'Nenhum')}</select></div>
      <div class="field"><label for="mn">Notas</label><textarea id="mn" name="notes" rows="2">${esc(m.notes)}</textarea></div>
      <div class="row between">${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>`}
        <div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div>
    </form>`);
  md.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const row = { description: f.description.trim(), amount: Number(String(f.amount).replace(',', '.')), direction: f.direction, date: f.date, category: f.category.trim(), account_id: f.account_id || null, project_id: f.project_id || null, notes: f.notes };
    const { error } = isNew ? await sb.from('fin_movements').insert(withC(row)) : await sb.from('fin_movements').update(row).eq('id', m.id);
    if (error) return toast(error.message);
    md.close(); after();
  });
  md.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    md.close(); if (!(await confirmBox(`Apagar "${m.description}"?`, 'Apagar'))) return;
    await sb.from('fin_movements').delete().eq('id', m.id); after();
  });
}

// ---------- contas ----------
async function accountsTab(box, ctx) {
  const { data } = await sb.from('fin_movements').select('account_id, amount, direction').eq('community_id', CID());
  const bal = (a) => Number(a.opening_balance) + (data || []).filter((m) => m.account_id === a.id).reduce((s, m) => s + (m.direction === 'in' ? 1 : -1) * Number(m.amount), 0);
  const total = ctx.accounts.reduce((s, a) => s + bal(a), 0);
  box.innerHTML = `
    <div class="fin-bar"><div class="fin-sum"><span>Saldo total</span><strong class="${total >= 0 ? 'pos' : 'neg'}">${money(total)}</strong><span>${ctx.accounts.length} ${ctx.accounts.length === 1 ? 'conta' : 'contas'}</span></div><button type="button" class="btn primary" data-add>${ICON.plus} Conta</button></div>
    <div class="acc-grid">${ctx.accounts.map((a) => `<button type="button" class="ent-card acc" data-acc="${a.id}" style="--g:${esc(a.color)}"><span class="small muted"><i class="dot"></i>${esc(KINDS[a.kind] || a.kind)}</span><strong>${esc(a.name)}</strong><span class="acc-bal ${bal(a) >= 0 ? 'pos' : 'neg'}">${money(bal(a))}</span><span class="small muted">Saldo inicial ${money(a.opening_balance)}</span></button>`).join('')}</div>`;
  box.querySelector('[data-add]').addEventListener('click', () => accountForm(ctx, null));
  box.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => accountForm(ctx, ctx.accounts.find((a) => a.id === b.dataset.acc))));
}
function accountForm(ctx, a) {
  const isNew = !a; a = a || { name: '', kind: 'banco', opening_balance: 0, color: '#1E2AD4', notes: '' };
  const md = modal(`<h2>${isNew ? 'Nova conta' : 'Conta'}</h2><form class="stack">
    <div class="field"><label for="an">Nome</label><input id="an" name="name" value="${esc(a.name)}" required></div>
    <div class="grid2"><div class="field"><label for="ak">Tipo</label><select id="ak" name="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <div class="field"><label for="ab">Saldo inicial (€)</label><input id="ab" name="opening_balance" type="number" step="0.01" value="${esc(a.opening_balance)}"></div></div>
    <div class="field"><label for="ac">Cor</label><input id="ac" name="color" type="color" value="${esc(a.color)}"></div>
    <div class="field"><label for="ano">Notas</label><textarea id="ano" name="notes" rows="2">${esc(a.notes)}</textarea></div>
    <div class="row between">${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>`}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>`);
  md.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const row = { name: f.name.trim(), kind: f.kind, opening_balance: Number(f.opening_balance) || 0, color: f.color, notes: f.notes };
    const { error } = isNew ? await sb.from('fin_accounts').insert(withC({ ...row, position: ctx.accounts.length })) : await sb.from('fin_accounts').update(row).eq('id', a.id);
    if (error) return toast(error.message); md.close(); st.tab = 'contas'; ctx.reload();
  });
  md.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    md.close(); if (!(await confirmBox(`Apagar a conta "${a.name}"? Os movimentos ficam, sem conta.`, 'Apagar'))) return;
    await sb.from('fin_accounts').delete().eq('id', a.id); ctx.reload();
  });
}

// ---------- despesas mensais ----------
function recurringTab(box, ctx) {
  const active = ctx.recurring.filter((r) => r.active);
  const total = active.reduce((s, r) => s + Number(r.amount), 0);
  const acc = (id) => ctx.accounts.find((a) => a.id === id);
  box.innerHTML = `
    <div class="fin-bar"><div class="fin-sum"><span>Total por mês</span><strong class="neg">${money(total)}</strong><span>${active.length} ${active.length === 1 ? 'despesa ativa' : 'despesas ativas'}</span></div><button type="button" class="btn primary" data-add>${ICON.plus} Despesa mensal</button></div>
    <section class="panel">${ctx.recurring.length ? `<div class="table-wrap"><table class="table fin"><thead><tr><th>Dia</th><th>Despesa</th><th>Categoria</th><th>Conta</th><th class="num">Valor</th><th>Ativa</th></tr></thead><tbody>
      ${ctx.recurring.map((r) => `<tr class="click-row ${r.active ? '' : 'off'}" data-rec="${r.id}"><td class="muted">${r.day_of_month}</td><td><strong>${esc(r.name)}</strong></td><td class="small">${esc(r.category)}</td><td class="small">${esc(acc(r.account_id)?.name || '—')}</td><td class="num neg">${money(r.amount)}</td><td>${r.active ? 'Sim' : 'Não'}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty-note">Ainda não há despesas mensais. Junta as fixas (renda, software, contabilista…) e lança-as todos os meses em Movimentos com um clique.</p>'}</section>`;
  box.querySelector('[data-add]').addEventListener('click', () => recurringForm(ctx, null));
  box.querySelectorAll('[data-rec]').forEach((r) => r.addEventListener('click', () => recurringForm(ctx, ctx.recurring.find((x) => x.id === r.dataset.rec))));
}
function recurringForm(ctx, r) {
  const isNew = !r; r = r || { name: '', amount: '', category: '', account_id: ctx.accounts[0]?.id, day_of_month: 1, active: true, notes: '' };
  const md = modal(`<h2>${isNew ? 'Nova despesa mensal' : 'Despesa mensal'}</h2><form class="stack">
    <div class="field"><label for="rn">Nome</label><input id="rn" name="name" value="${esc(r.name)}" placeholder="ex: Renda do estúdio, Adobe, Contabilista" required></div>
    <div class="grid2"><div class="field"><label for="ra">Valor (€)</label><input id="ra" name="amount" type="number" step="0.01" min="0" value="${esc(r.amount)}" required></div>
    <div class="field"><label for="rd">Dia do mês</label><input id="rd" name="day_of_month" type="number" min="1" max="31" value="${esc(r.day_of_month)}"></div>
    <div class="field"><label for="rc">Categoria</label><input id="rc" name="category" list="cats2" value="${esc(r.category)}"><datalist id="cats2">${CATS.map((c) => `<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="field"><label for="rac">Conta</label><select id="rac" name="account_id">${selectOpts(ctx.accounts, r.account_id)}</select></div></div>
    <label class="check"><input type="checkbox" name="active" ${r.active ? 'checked' : ''}> Ativa</label>
    <div class="row between">${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>`}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>`);
  md.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const row = { name: f.name.trim(), amount: Number(f.amount) || 0, day_of_month: Math.min(31, Math.max(1, +f.day_of_month || 1)), category: f.category.trim(), account_id: f.account_id || null, active: !!f.active };
    const { error } = isNew ? await sb.from('fin_recurring').insert(withC(row)) : await sb.from('fin_recurring').update(row).eq('id', r.id);
    if (error) return toast(error.message); md.close(); st.tab = 'despesas'; ctx.reload();
  });
  md.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    md.close(); if (!(await confirmBox(`Apagar "${r.name}"? Os movimentos já lançados ficam.`, 'Apagar'))) return;
    await sb.from('fin_recurring').delete().eq('id', r.id); ctx.reload();
  });
}
