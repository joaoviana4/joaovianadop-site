import { sb, esc, toast, modal, confirmBox, ICON, todayISO, hasPerm } from './lib.js';
import { costsOf, grainFee, feePct } from './folders.js';

// Finanças: Resumo (com gráficos e saúde financeira), Ganhos por projeto e Ganhos por pessoa.
// Ganhos (fin_earnings): uma linha por trabalho, ligada ou não a um projeto. Se seguir o orçamento,
// o valor (sem IVA) é o orçamento geral do projeto e atualiza-se sozinho. Cada linha tem cortes
// (o que cada pessoa recebe), custos diretos, IVA, estado e datas de pagamento.
// O que fica na Grain = valor − cortes − custos diretos (os movimentos de saída ligados ao projeto também contam).

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const pct = (x) => `${Math.round(x * 100)} %`;
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const EST = { orcamento: ['Orçamento enviado', 'mute'], aceite: ['Aceite', 'blue'], faturado: ['Faturado', 'warn'], pago: ['Pago', 'good'], perdido: ['Perdido', 'mute'] };
const C_BILL = '#5B7CFF', C_PAID = '#2FA874'; // validados no fundo escuro (dataviz)
const days = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const ym = (iso) => (iso || '').slice(0, 7);
const dd = (iso) => (iso ? `${+iso.slice(8, 10)} ${MES[+iso.slice(5, 7) - 1]}` : '');

// carrega tudo o que as contas precisam
export async function loadFin() {
  const [{ data: earn }, { data: mov }, { data: acc }, { data: rec }, { data: projects }, { data: people }] = await Promise.all([
    sb.from('fin_earnings').select('*').order('date', { ascending: false }),
    sb.from('fin_movements').select('date, amount, direction, category, project_id, account_id'),
    sb.from('fin_accounts').select('id, opening_balance'),
    sb.from('fin_recurring').select('amount, active'),
    sb.from('projects').select('id, name, client, kind, status, deleted_at').eq('is_central', false).is('deleted_at', null).order('name'),
    sb.from('profiles').select('id, display_name').order('display_name'),
  ]);
  const ids = [...new Set((projects || []).map((p) => p.id))];
  const { data: bud } = ids.length ? await sb.from('project_budgets').select('project_id, value, budget, approved_at').in('project_id', ids) : { data: [] };
  // ligado ao orçamento do projeto: o valor é o orçamento geral (ou, se não houver, a tabela + Grain fee);
  // a agency fee, se não for escrita à mão, é a Grain fee do orçamento
  const fullOf = (b) => (b.value != null ? Number(b.value) : b.budget?.rows ? costsOf(b.budget) + grainFee(b.budget) : null);
  const bmap = new Map((bud || []).map((b) => [b.project_id, fullOf(b)]));
  const feeMap = new Map((bud || []).filter((b) => b.budget?.rows).map((b) => [b.project_id, { fee: grainFee(b.budget), pct: feePct(b.budget) }]));
  const movs = mov || [];
  const E = (earn || []).map((e) => {
    const gross = e.follow_budget && e.project_id && bmap.get(e.project_id) != null ? bmap.get(e.project_id) : Number(e.amount) || 0;
    const cuts = (e.cuts || []).map((c) => ({ ...c, value: c.mode === 'pct' ? gross * (Number(c.amount) || 0) / 100 : Number(c.amount) || 0 }));
    const cutSum = cuts.reduce((a, c) => a + c.value, 0);
    const movCosts = e.project_id ? movs.filter((m) => m.direction === 'out' && m.project_id === e.project_id).reduce((a, m) => a + Number(m.amount), 0) : 0;
    const direct = (Number(e.costs) || 0) + movCosts;
    // agency fee = o que fica na Grain; retenção interna = agency fee + cortes da equipa
    const linkedFee = e.follow_budget && e.project_id ? feeMap.get(e.project_id) : null;
    const fee = e.fee != null && e.fee !== '' ? Number(e.fee) : linkedFee ? linkedFee.fee : null;
    const keep = fee != null ? fee : gross - cutSum - direct;
    return { ...e, feeRaw: e.fee, feeAuto: (e.fee == null || e.fee === '') && !!linkedFee, gross, vat: gross * (Number(e.vat_rate) || 0) / 100, cuts, cutSum, direct, fee: fee || 0, keep, retained: keep + cutSum, fromBudget: e.follow_budget && e.project_id && bmap.get(e.project_id) != null };
  });
  const fixedMonthly = (rec || []).filter((r) => r.active).reduce((a, r) => a + Number(r.amount), 0);
  const balance = (acc || []).reduce((a, x) => a + Number(x.opening_balance), 0) + movs.reduce((a, m) => a + (m.direction === 'in' ? 1 : -1) * Number(m.amount), 0);
  return { E, movs, fixedMonthly, balance, projects: projects || [], people: people || [], bmap, feeMap };
}

// ---------- gráficos (SVG simples, com dica ao passar o rato) ----------
function tipBind(box) {
  const tip = document.createElement('div'); tip.className = 'ch-tip'; tip.hidden = true; box.append(tip);
  box.addEventListener('pointermove', (e) => { const t = e.target.closest('[data-tip]'); if (!t) { tip.hidden = true; return; } tip.innerHTML = t.dataset.tip; tip.hidden = false; const r = box.getBoundingClientRect(); tip.style.left = `${Math.min(r.width - 170, e.clientX - r.left + 12)}px`; tip.style.top = `${e.clientY - r.top + 12}px`; });
  box.addEventListener('pointerleave', () => { tip.hidden = true; });
}
const niceMax = (v) => { if (v <= 0) return 1; const p = Math.pow(10, Math.floor(Math.log10(v))); const n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p; };
const kfmt = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-PT', { maximumFractionDigits: 1 })}k` : String(Math.round(v)));

function barsByMonth(year, E) {
  const bill = Array(12).fill(0), paid = Array(12).fill(0);
  E.filter((e) => e.status !== 'orcamento' && e.status !== 'perdido').forEach((e) => { if (e.date?.startsWith(year)) bill[+e.date.slice(5, 7) - 1] += e.gross; if (e.status === 'pago' && e.paid_on?.startsWith(year)) paid[+e.paid_on.slice(5, 7) - 1] += e.gross; });
  const W = 640, H = 220, L = 44, B = 26, T = 10; const max = niceMax(Math.max(...bill, ...paid));
  const bw = (W - L - 10) / 12; const y = (v) => T + (H - T - B) * (1 - v / max);
  const ticks = [0, 0.5, 1].map((f) => max * f);
  return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Faturação e recebido por mês em ${year}">
    ${ticks.map((t) => `<line x1="${L}" x2="${W - 6}" y1="${y(t)}" y2="${y(t)}" class="ch-grid"/><text x="${L - 6}" y="${y(t) + 3}" text-anchor="end" class="ch-ax">${kfmt(t)}</text>`).join('')}
    ${bill.map((v, i) => { const x = L + i * bw + bw * 0.14; const w = bw * 0.34; return `<g data-tip="<b>${MES[i]} ${year}</b><br><i style='background:${C_BILL}'></i>Faturado ${eur.format(v)}<br><i style='background:${C_PAID}'></i>Recebido ${eur.format(paid[i])}">
      <rect x="${L + i * bw}" y="${T}" width="${bw}" height="${H - T - B}" fill="transparent"/>
      ${v ? `<path d="M${x} ${y(0)} V${y(v) + 4} q0 -4 4 -4 h${w - 8} q4 0 4 4 V${y(0)} Z" fill="${C_BILL}"/>` : ''}
      ${paid[i] ? `<path d="M${x + w + 2} ${y(0)} V${y(paid[i]) + 4} q0 -4 4 -4 h${w - 8} q4 0 4 4 V${y(0)} Z" fill="${C_PAID}"/>` : ''}
      <text x="${L + i * bw + bw / 2}" y="${H - 8}" text-anchor="middle" class="ch-ax">${MES[i]}</text></g>`; }).join('')}
    <line x1="${L}" x2="${W - 6}" y1="${y(0)}" y2="${y(0)}" class="ch-base"/></svg>`;
}

function cashLine(F) {
  // 6 meses: saldo de hoje + recebimentos previstos (por receber, pela data prevista) − custos fixos − cortes a pagar desses recebimentos
  const now = todayISO(); const months = []; let bal = F.balance;
  const pend = F.E.filter((e) => ['aceite', 'faturado'].includes(e.status));
  const when = (e) => e.due_date || addDays(e.date || now, 30);
  for (let i = 0; i < 6; i++) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + i); const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const inn = pend.filter((e) => (i === 0 ? ym(when(e)) <= k : ym(when(e)) === k)).reduce((a, e) => a + e.gross - e.cuts.filter((c) => !c.paid).reduce((s, c) => s + c.value, 0), 0);
    bal = bal + inn - F.fixedMonthly; months.push({ k, label: `${MES[d.getMonth()]}`, bal, inn });
  }
  const W = 640, H = 200, L = 52, B = 26, T = 12;
  const vals = [F.balance, ...months.map((m) => m.bal)];
  const lo = Math.min(0, ...vals), hi = Math.max(1, ...vals); const span = niceMax(hi - lo);
  const y = (v) => T + (H - T - B) * (1 - (v - lo) / span); const x = (i) => L + (W - L - 20) * (i / 6);
  const pts = vals.map((v, i) => `${x(i)},${y(v)}`).join(' ');
  return `<svg viewBox="0 0 ${W} ${H}" class="ch" role="img" aria-label="Previsão de tesouraria a 6 meses">
    <line x1="${L}" x2="${W - 10}" y1="${y(0)}" y2="${y(0)}" class="ch-base"/>${lo < 0 ? `<rect x="${L}" y="${y(0)}" width="${W - L - 10}" height="${y(lo) - y(0)}" class="ch-neg"/>` : ''}
    <text x="${L - 6}" y="${y(0) + 3}" text-anchor="end" class="ch-ax">0</text><text x="${L - 6}" y="${y(lo + span) + 3}" text-anchor="end" class="ch-ax">${kfmt(lo + span)}</text>
    <polyline points="${pts}" fill="none" stroke="${C_BILL}" stroke-width="2" stroke-linejoin="round"/>
    ${vals.map((v, i) => `<g data-tip="<b>${i === 0 ? 'Hoje' : months[i - 1].label}</b><br>Saldo previsto ${eur.format(v)}${i ? `<br>Entradas previstas ${eur.format(months[i - 1].inn)}<br>Custos fixos −${eur.format(F.fixedMonthly)}` : ''}"><rect x="${x(i) - 20}" y="${T}" width="40" height="${H - T - B}" fill="transparent"/><circle cx="${x(i)}" cy="${y(v)}" r="4" fill="${v < 0 ? 'var(--late)' : C_BILL}" stroke="var(--panel)" stroke-width="2"/><text x="${x(i)}" y="${H - 8}" text-anchor="middle" class="ch-ax">${i === 0 ? 'hoje' : months[i - 1].label}</text></g>`).join('')}
    <text x="${x(6)}" y="${y(vals[6]) - 10}" text-anchor="end" class="ch-val">${eur.format(vals[6])}</text></svg>`;
}

const hbars = (rows, { color = C_BILL, two = false } = {}) => {
  const max = Math.max(1, ...rows.map((r) => r.v + (r.v2 || 0)));
  return rows.length ? `<ul class="hb">${rows.map((r) => `<li data-tip="<b>${esc(r.l)}</b><br>${two ? `<i style='background:${C_PAID}'></i>Recebido ${eur.format(r.v)}<br><i style='background:${C_BILL}'></i>Por receber ${eur.format(r.v2)}` : eur.format(r.v)}"><span class="hb-l">${esc(r.l)}</span><span class="hb-t"><i style="width:${(r.v / max) * 100}%;background:${two ? C_PAID : color}"></i>${two ? `<i style="width:${(r.v2 / max) * 100}%;background:${C_BILL}"></i>` : ''}</span><span class="hb-v">${eur.format(r.v + (r.v2 || 0))}</span></li>`).join('')}</ul>` : '<p class="muted small">Sem dados neste ano.</p>';
};

// ---------- indicadores de saúde financeira ----------
function health(year, F) {
  const E = F.E.filter((e) => e.date?.startsWith(year) && !['orcamento', 'perdido'].includes(e.status));
  const bill = E.reduce((a, e) => a + e.gross, 0);
  const margin = E.reduce((a, e) => a + e.keep, 0);
  const retained = E.reduce((a, e) => a + e.retained, 0);
  const mElapsed = year === todayISO().slice(0, 4) ? new Date().getMonth() + 1 : 12;
  const general = F.movs.filter((m) => m.direction === 'out' && !m.project_id && m.date?.startsWith(year)).reduce((a, m) => a + Number(m.amount), 0);
  const monthlyCost = F.fixedMonthly || general / mElapsed;
  const gm = bill ? retained / bill : null;
  const cover = monthlyCost ? (margin / mElapsed) / monthlyCost : null;
  const feeRatio = bill ? margin / bill : null;
  const be = feeRatio && feeRatio > 0 ? monthlyCost / feeRatio : null;
  const autonomy = monthlyCost ? F.balance / monthlyCost : null;
  const paid = F.E.filter((e) => e.status === 'pago' && e.paid_on && e.date);
  const dso = paid.length ? paid.reduce((a, e) => a + Math.max(0, days(e.date, e.paid_on)), 0) / paid.length : null;
  const withDue = paid.filter((e) => e.due_date);
  const ontime = withDue.length ? withDue.filter((e) => e.paid_on <= e.due_date).length / withDue.length : null;
  const byClient = {}; E.forEach((e) => { const k = (e.client || 'Sem cliente').trim(); byClient[k] = (byClient[k] || 0) + e.gross; });
  const top = Object.entries(byClient).sort((a, b) => b[1] - a[1])[0];
  const conc = bill && top ? top[1] / bill : null;
  const q = Math.floor(new Date().getMonth() / 3); const qStart = `${todayISO().slice(0, 4)}-${String(q * 3 + 1).padStart(2, '0')}`; const qEnd = `${todayISO().slice(0, 4)}-${String(q * 3 + 3).padStart(2, '0')}`;
  const vat = F.E.filter((e) => ['faturado', 'pago'].includes(e.status) && ym(e.date) >= qStart && ym(e.date) <= qEnd).reduce((a, e) => a + e.vat, 0);
  const st3 = (v, good, warn, inv = false) => (v == null ? 'none' : inv ? (v <= good ? 'good' : v <= warn ? 'warn' : 'bad') : (v >= good ? 'good' : v >= warn ? 'warn' : 'bad'));
  return [
    ['Retenção interna', gm == null ? '—' : pct(gm), st3(gm, 0.4, 0.2), 'Agency fee + cortes da equipa, a dividir pelo total dos orçamentos: o que fica dentro da Grain. Acima de 40 % é saudável.'],
    ['Cobertura dos custos fixos', cover == null ? '—' : `${cover.toFixed(1).replace('.', ',')}×`, st3(cover, 1.2, 1), 'Agency fee médio por mês a dividir pelos custos fixos do mês. Abaixo de 1× o que fica na Grain não paga a estrutura.'],
    ['Ponto de equilíbrio', be == null ? '—' : `${eur.format(be)}/mês`, be == null ? 'none' : (bill / mElapsed) >= be ? 'good' : 'bad', 'Quanto é preciso faturar por mês para pagar os custos fixos com o agency fee médio (custos fixos ÷ rácio do agency fee).'],
    ['Autonomia', autonomy == null ? '—' : `${Math.max(0, autonomy).toFixed(1).replace('.', ',')} meses`, st3(autonomy, 6, 3), 'Quantos meses o saldo de caixa aguenta os custos fixos sem entrar dinheiro.'],
    ['Prazo médio de recebimento', dso == null ? '—' : `${Math.round(dso)} dias`, st3(dso, 30, 60, true), 'Dias, em média, entre a data do trabalho e o dia em que foi pago.'],
    ['Pagamentos a tempo', ontime == null ? '—' : pct(ontime), st3(ontime, 0.8, 0.6), 'Percentagem dos pagamentos que chegaram até à data prevista.'],
    ['Peso do maior cliente', conc == null ? '—' : `${pct(conc)}${top ? ` · ${top[0]}` : ''}`, st3(conc, 0.35, 0.5, true), 'Quanto da faturação do ano vem de um só cliente. Acima de 50 % é um risco.'],
    ['IVA a reservar', eur.format(vat), 'none', 'IVA do que foi faturado neste trimestre. É dinheiro do Estado: convém não contar com ele.'],
  ];
}

// ---------- RESUMO ----------
export async function summaryTab(box, st) {
  const F = await loadFin();
  const year = st.year;
  const E = F.E.filter((e) => e.date?.startsWith(year) && !['orcamento', 'perdido'].includes(e.status));
  const bill = E.reduce((a, e) => a + e.gross, 0);
  const got = F.E.filter((e) => e.status === 'pago' && (e.paid_on || e.date)?.startsWith(year)).reduce((a, e) => a + e.gross, 0);
  const due = F.E.filter((e) => ['aceite', 'faturado'].includes(e.status)).reduce((a, e) => a + e.gross, 0);
  const keep = E.reduce((a, e) => a + e.keep, 0);
  const general = F.movs.filter((m) => m.direction === 'out' && !m.project_id && m.date?.startsWith(year));
  const genSum = general.reduce((a, m) => a + Number(m.amount), 0);
  const today = todayISO();
  const late = F.E.filter((e) => ['aceite', 'faturado'].includes(e.status) && e.due_date && e.due_date < today);
  const stale = F.E.filter((e) => e.status === 'orcamento' && days(e.date, today) > 14);
  const byCat = {}; general.forEach((m) => { const k = m.category || 'Sem categoria'; byCat[k] = (byCat[k] || 0) + Number(m.amount); });
  const people = perPerson(F, year);
  const H = health(year, F);
  box.innerHTML = `
    <div class="fin-bar"><div class="month-nav"><button type="button" class="icon-btn" data-y="-1" aria-label="Ano anterior">${ICON.back}</button><strong>${year}</strong><button type="button" class="icon-btn" data-y="1" aria-label="Ano seguinte">${ICON.chev}</button></div><span class="muted small">Valores sem IVA</span></div>
    <div class="fin-kpis">
      <div class="fstat"><span class="fl">Faturação</span><strong>${eur.format(bill)}</strong><span class="fs">${E.length} trabalho${E.length === 1 ? '' : 's'} em ${year}</span></div>
      <div class="fstat"><span class="fl">Recebido</span><strong class="pos">${eur.format(got)}</strong><span class="fs">pago em ${year}</span></div>
      <div class="fstat"><span class="fl">Por receber</span><strong>${eur.format(due)}</strong><span class="fs ${late.length ? 'neg' : ''}">${late.length ? `${late.length} em atraso` : 'nada em atraso'}</span></div>
      <div class="fstat good"><span class="fl">Agency fee</span><strong>${eur.format(keep)}</strong><span class="fs">fica na Grain · ${bill ? pct(keep / bill) : '—'} do total</span></div>
      <div class="fstat"><span class="fl">Cortes da equipa</span><strong>${eur.format(E.reduce((a, e) => a + e.cutSum, 0))}</strong><span class="fs">retenção interna ${bill ? pct(E.reduce((a, e) => a + e.retained, 0) / bill) : '—'}</span></div>
      ${hasPerm('finance') ? `<div class="fstat"><span class="fl">Gastos gerais</span><strong class="neg">${eur.format(genSum)}</strong><span class="fs">${eur.format(F.fixedMonthly)}/mês em custos fixos</span></div>
      <div class="fstat ${F.balance >= 0 ? '' : 'bad'}"><span class="fl">Saldo de caixa</span><strong>${eur.format(F.balance)}</strong><span class="fs">todas as contas</span></div>` : ''}
    </div>
    ${late.length || stale.length ? `<section class="panel fin-alert"><h2 class="h3">Precisa de atenção</h2><ul>${late.map((e) => `<li><span class="bchip bst-over">Pagamento em atraso</span> <b>${esc(e.title)}</b> · ${eur.format(e.gross)} · previsto a ${esc(dd(e.due_date))} (${days(e.due_date, today)} dias de atraso)</li>`).join('')}${stale.map((e) => `<li><span class="bchip bst-near">Orçamento sem resposta</span> <b>${esc(e.title)}</b> · enviado há ${days(e.date, today)} dias</li>`).join('')}</ul></section>` : ''}
    <div class="fin-charts">
      <section class="panel ch-box"><div class="row between wrap-gap"><h2 class="h3">Faturação por mês</h2><span class="ch-leg"><i style="background:${C_BILL}"></i>Faturado <i style="background:${C_PAID}"></i>Recebido</span></div>${barsByMonth(year, F.E)}</section>
      ${hasPerm('finance') ? `<section class="panel ch-box"><div class="row between wrap-gap"><h2 class="h3">Tesouraria nos próximos 6 meses</h2><span class="muted small">saldo + o que está por receber − custos fixos</span></div>${cashLine(F)}</section>` : `<section class="panel ch-box"><h2 class="h3">Cortes por mês</h2>${hbars(MES.map((mm, k) => ({ l: mm, v: E.filter((e) => +e.date.slice(5, 7) === k + 1).reduce((a, e) => a + e.cutSum, 0) })).filter((x) => x.v))}</section>`}
    </div>
    <section class="panel"><div class="row between wrap-gap"><h2 class="h3">Saúde financeira</h2><span class="muted small">Passa o rato no ⓘ para ver a conta</span></div>
      <div class="fin-health">${H.map(([l, v, s, help]) => `<div class="fh fh-${s}"><span class="fl">${esc(l)} <span class="fh-i" tabindex="0" title="${esc(help)}" aria-label="${esc(help)}">ⓘ</span></span><strong>${esc(v)}</strong><span class="fh-s">${{ good: '● Saudável', warn: '▲ Atenção', bad: '■ Em risco', none: '' }[s]}</span></div>`).join('')}</div></section>
    <div class="fin-charts">
      <section class="panel ch-box"><div class="row between wrap-gap"><h2 class="h3">Ganhos por pessoa</h2><span class="ch-leg"><i style="background:${C_PAID}"></i>Recebido <i style="background:${C_BILL}"></i>Por receber</span></div>${hbars(people.map((p) => ({ l: p.name, v: p.paid, v2: p.due })), { two: true })}</section>
      ${hasPerm('finance') ? `<section class="panel ch-box"><h2 class="h3">Gastos gerais por categoria</h2>${hbars(Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([l, v]) => ({ l, v })))}</section>` : ''}
    </div>`;
  box.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { st.year = String(+st.year + +b.dataset.y); summaryTab(box, st); }));
  box.querySelectorAll('.ch-box').forEach(tipBind);
}

// ganhos individuais: soma dos cortes de cada pessoa
function perPerson(F, year) {
  const m = new Map();
  F.E.filter((e) => e.date?.startsWith(year) && e.status !== 'perdido' && e.status !== 'orcamento').forEach((e) => e.cuts.forEach((c) => {
    const name = c.user_id ? F.people.find((p) => p.id === c.user_id)?.display_name || c.name : c.name; if (!name) return;
    const r = m.get(name) || { name, paid: 0, due: 0, jobs: [] };
    if (c.paid) r.paid += c.value; else r.due += c.value; r.jobs.push({ e, c }); m.set(name, r);
  }));
  return [...m.values()].sort((a, b) => b.paid + b.due - (a.paid + a.due));
}

// ---------- GANHOS ----------
export async function earningsTab(box, st) {
  const F = await loadFin();
  const year = st.year;
  const list = F.E.filter((e) => e.date?.startsWith(year)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const real = list.filter((e) => !['orcamento', 'perdido'].includes(e.status));
  const T = (k) => real.reduce((a, e) => a + e[k], 0);
  const linked = new Set(F.E.map((e) => e.project_id).filter(Boolean));
  const missing = F.projects.filter((p) => !linked.has(p.id) && F.bmap.get(p.id) != null && p.kind !== 'album');
  box.innerHTML = `
    <div class="fin-bar"><div class="month-nav"><button type="button" class="icon-btn" data-y="-1" aria-label="Ano anterior">${ICON.back}</button><strong>Ganhos ${year}</strong><button type="button" class="icon-btn" data-y="1" aria-label="Ano seguinte">${ICON.chev}</button></div>
      <div class="fin-actions">${missing.length ? `<button type="button" class="btn ghost" data-sync>Juntar projetos com orçamento <span class="count">${missing.length}</span></button>` : ''}<button type="button" class="btn primary" data-add>${ICON.plus} Ganho</button></div></div>
    ${list.length ? (() => {
      // como a folha "Earnings": um bloco por mês, uma coluna de corte por pessoa, totais e rácios no fim
      const ppl = []; list.forEach((e) => e.cuts.forEach((c) => { if (c.name && !ppl.includes(c.name)) ppl.push(c.name); }));
      const cutOf = (e, n) => e.cuts.filter((c) => c.name === n).reduce((a, c) => a + c.value, 0);
      const months = [...new Set(list.map((e) => ym(e.date)))].sort();
      const MESL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
      const head = (mk) => `<tr class="earn-mh"><th>${MESL[+mk.slice(5, 7) - 1]}</th><th>Projeto</th><th>Project leader</th><th class="num">Agency fee</th><th class="num">Orçamento total</th>${ppl.map((n) => `<th class="num">${esc(n)} cut</th>`).join('')}<th>Estado</th><th>Pagamento</th></tr>`;
      const row = (e) => { const late = ['aceite', 'faturado'].includes(e.status) && e.due_date && e.due_date < todayISO(); return `<tr class="click-row ${['orcamento', 'perdido'].includes(e.status) ? 'off' : ''}" data-e="${e.id}" ${e.color ? `style="--rowc:${esc(e.color)}"` : ''}>
        <td></td><td><strong>${esc(e.title || '—')}</strong>${e.client || e.fromBudget ? `<div class="small muted">${esc(e.client || '')}${e.fromBudget ? ' · segue o orçamento' : ''}</div>` : ''}</td><td>${esc(e.leader || '')}</td>
        <td class="num" ${e.feeAuto ? 'title="Grain fee do orçamento do projeto"' : ''}>${eur2.format(e.fee)}${e.feeAuto ? '<small class="muted"> GF</small>' : ''}</td><td class="num">${eur2.format(e.gross)}</td>${ppl.map((n) => { const v = cutOf(e, n); return `<td class="num ${v ? '' : 'muted'}">${eur2.format(v)}</td>`; }).join('')}
        <td><span class="est est-${EST[e.status][1]}">${EST[e.status][0]}</span></td>
        <td class="small ${late ? 'neg' : 'muted'}">${e.status === 'pago' ? `pago a ${esc(dd(e.paid_on))}` : e.due_date ? `${late ? 'atrasado · ' : ''}previsto ${esc(dd(e.due_date))}` : '—'}</td></tr>`; };
      const tot = real.reduce((a, e) => a + e.gross, 0), fee = T('fee'), team = T('cutSum');
      const r = (x) => (tot ? `${(x / tot * 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %` : '—');
      return `<section class="panel earn-sheet"><h2 class="earn-title">byGrain Earnings ${year}</h2><div class="table-wrap"><table class="table fin earn">
        ${months.map((mk) => `<tbody>${head(mk)}${list.filter((e) => ym(e.date) === mk).sort((x, y) => (x.created_at || '').localeCompare(y.created_at || '')).map(row).join('')}</tbody>`).join('')}
      </table></div>
      <div class="earn-tot">
        <div><span>Internal retention ratio</span><b>${r(fee + team)}</b></div>
        <div><span>Agency fee ratio</span><b>${r(fee)}</b></div>
        <div><span>Agency fee total</span><b>${eur2.format(fee)}</b></div>
        <div><span>Orçamentos total</span><b>${eur2.format(tot)}</b></div>
        ${ppl.map((n) => `<div><span>${esc(n)} cut total</span><b>${eur2.format(real.reduce((a, e) => a + cutOf(e, n), 0))}</b></div>`).join('')}
        <div><span>Grain team cut total</span><b>${eur2.format(team)}</b></div>
        <div><span>Team earning ratio</span><b>${r(team)}</b></div>
      </div><p class="muted small">Totais sem orçamentos enviados nem trabalhos perdidos. Carrega numa linha para editar (estado, datas de pagamento, cortes, IVA).</p></section>`;
    })() : `<section class="panel"><div class="fin-empty"><p>Ainda não há ganhos em ${year}.</p><p class="muted small">Cada trabalho é uma linha: orçamento total (pode seguir o orçamento do projeto), agency fee, cortes de cada pessoa, estado e datas de pagamento.</p></div></section>`}`;
  box.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { st.year = String(+st.year + +b.dataset.y); earningsTab(box, st); }));
  const again = () => earningsTab(box, st);
  box.querySelector('[data-add]').addEventListener('click', () => earningForm(F, null, again));
  box.querySelectorAll('[data-e]').forEach((r) => r.addEventListener('click', () => earningForm(F, F.E.find((x) => x.id === r.dataset.e), again)));
  box.querySelector('[data-sync]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Criar ${missing.length} linha${missing.length === 1 ? '' : 's'} de ganhos a partir dos projetos com orçamento? O valor segue o orçamento de cada projeto.`, 'Juntar'))) return;
    const { error } = await sb.from('fin_earnings').insert(missing.map((p) => ({ project_id: p.id, title: p.name, client: p.client, follow_budget: true, status: 'aceite', date: todayISO() })));
    if (error) return toast(error.message); toast('Projetos juntados aos ganhos.'); again();
  });
}

function earningForm(F, e, after) {
  const isNew = !e;
  e = e || { title: '', client: '', date: todayISO(), amount: '', follow_budget: true, vat_rate: 23, status: 'aceite', due_date: addDays(todayISO(), 30), paid_on: null, cuts: [], costs: '', notes: '', project_id: null };
  let cuts = JSON.parse(JSON.stringify(e.cuts || [])).map((c) => ({ name: c.name || '', user_id: c.user_id || null, amount: c.amount, mode: c.mode || 'eur', paid: !!c.paid }));
  const m = modal(`<h2>${isNew ? 'Novo ganho' : esc(e.title || 'Ganho')}</h2>
    <form class="stack" data-f>
      <div class="grid2">
        <div class="field"><label>Projeto</label><select name="project_id"><option value="">— nenhum —</option>${F.projects.map((p) => `<option value="${p.id}" ${p.id === e.project_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
        <div class="field"><label>Trabalho</label><input name="title" value="${esc(e.title)}" required></div>
        <div class="field"><label>Cliente</label><input name="client" value="${esc(e.client || '')}"></div>
        <div class="field"><label>Project leader</label><input name="leader" value="${esc(e.leader || '')}" list="fin-people"></div>
        <div class="field"><label>Data</label><input type="date" name="date" value="${esc(e.date)}" required></div>
      </div>
      <label class="check"><input type="checkbox" name="follow_budget" ${e.follow_budget ? 'checked' : ''}> Valor = orçamento geral do projeto (atualiza-se sozinho)</label>
      <div class="grid3">
        <div class="field"><label>Agency fee (€)</label><input name="fee" inputmode="decimal" value="${esc(e.feeAuto ? '' : (isNew ? '' : e.feeRaw ?? ''))}" placeholder="${e.feeAuto ? `Grain fee: ${eur2.format(e.fee)}` : 'fica na Grain'}"></div>
        <div class="field" data-amountf><label>Orçamento total s/ IVA (€)</label><input name="amount" inputmode="decimal" value="${esc(e.amount ?? '')}"></div>
        <div class="field"><label>IVA (%)</label><input name="vat_rate" inputmode="decimal" value="${esc(e.vat_rate)}"></div>
        <div class="field"><label>Custos diretos (€)</label><input name="costs" inputmode="decimal" value="${esc(e.costs ?? '')}" placeholder="além dos movimentos do projeto"></div>
      </div>
      <div class="grid3">
        <div class="field"><label>Estado</label><select name="status">${Object.entries(EST).map(([k, [l]]) => `<option value="${k}" ${k === e.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label>Pagamento previsto</label><input type="date" name="due_date" value="${esc(e.due_date || '')}"></div>
        <div class="field"><label>Pago a</label><input type="date" name="paid_on" value="${esc(e.paid_on || '')}"></div>
      </div>
      <fieldset class="cuts"><legend>Cortes (ganhos individuais)</legend><div data-cuts></div><button type="button" class="link-btn" data-addcut>${ICON.plus} Pessoa</button></fieldset>
      <div class="field"><label>Notas</label><textarea name="notes" rows="2">${esc(e.notes || '')}</textarea></div>
      <div class="field"><span class="label">Destacar a linha</span><div class="row wrap-gap earn-colors">${['', '#E3B341', '#2FB67C', '#C8382D', '#4F7BFF', '#7C5CFF'].map((c) => `<label><input type="radio" name="color" value="${c}" ${c === (e.color || '') ? 'checked' : ''}><span style="${c ? `background:${c}` : ''}" class="${c ? '' : 'none'}"></span></label>`).join('')}</div></div>
      <p class="small muted" data-calc></p>
      <div class="row between">${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>`}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div>
    </form>
    <datalist id="fin-people">${F.people.map((p) => `<option value="${esc(p.display_name)}">`).join('')}</datalist>`, { wide: true });
  const f = m.el.querySelector('[data-f]');
  const num = (v) => { const x = parseFloat(String(v ?? '').replace(/\s/g, '').replace(',', '.')); return Number.isFinite(x) ? x : null; };
  const gross = () => (f.elements.follow_budget.checked && f.elements.project_id.value && F.bmap.get(f.elements.project_id.value) != null ? F.bmap.get(f.elements.project_id.value) : num(f.elements.amount.value) || 0);
  const calc = () => {
    const g = gross(); const cs = cuts.reduce((a, c) => a + (c.mode === 'pct' ? g * (num(c.amount) || 0) / 100 : num(c.amount) || 0), 0); const pid = f.elements.project_id.value; const mv = pid ? F.movs.filter((x) => x.direction === 'out' && x.project_id === pid).reduce((a, x) => a + Number(x.amount), 0) : 0; const d = (num(f.elements.costs.value) || 0) + mv;
    m.el.querySelector('[data-calc]').textContent = `${(() => { const fe = num(f.elements.fee.value); return fe != null ? `Orçamento ${eur2.format(g)} · agency fee ${eur2.format(fe)} (${g ? Math.round((fe / g) * 100) : 0} %) · cortes ${eur2.format(cs)} · retenção interna ${eur2.format(fe + cs)} (${g ? Math.round(((fe + cs) / g) * 100) : 0} %)` : `Orçamento ${eur2.format(g)} − cortes ${eur2.format(cs)} − custos ${eur2.format(d)}${mv ? ` (inclui ${eur2.format(mv)} de movimentos do projeto)` : ''} = fica na Grain ${eur2.format(g - cs - d)}`; })()}${f.elements.follow_budget.checked && f.elements.project_id.value && F.bmap.get(f.elements.project_id.value) == null ? ' · o projeto ainda não tem orçamento geral' : ''}`;
    m.el.querySelector('[data-amountf]').hidden = f.elements.follow_budget.checked && !!f.elements.project_id.value && F.bmap.get(f.elements.project_id.value) != null;
  };
  const drawCuts = () => {
    const box = m.el.querySelector('[data-cuts]');
    box.innerHTML = cuts.map((c, i) => `<div class="cut-row"><input list="fin-people" data-c="name" data-i="${i}" value="${esc(c.name)}" placeholder="Pessoa" aria-label="Pessoa"><input data-c="amount" data-i="${i}" inputmode="decimal" value="${esc(c.amount ?? '')}" placeholder="0" aria-label="Valor"><select data-c="mode" data-i="${i}" aria-label="Tipo"><option value="eur" ${c.mode !== 'pct' ? 'selected' : ''}>€</option><option value="pct" ${c.mode === 'pct' ? 'selected' : ''}>%</option></select><label class="check"><input type="checkbox" data-c="paid" data-i="${i}" ${c.paid ? 'checked' : ''}> pago</label><button type="button" class="icon-btn" data-rmcut="${i}" aria-label="Tirar">${ICON.close}</button></div>`).join('') || '<p class="muted small">Sem cortes: tudo fica na Grain (menos custos).</p>';
    box.querySelectorAll('[data-c]').forEach((el) => el.addEventListener(el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input', () => { const c = cuts[+el.dataset.i]; c[el.dataset.c] = el.type === 'checkbox' ? el.checked : el.value; if (el.dataset.c === 'name') { const p = F.people.find((x) => x.display_name === el.value); c.user_id = p ? p.id : null; } calc(); }));
    box.querySelectorAll('[data-rmcut]').forEach((b) => b.addEventListener('click', () => { cuts.splice(+b.dataset.rmcut, 1); drawCuts(); calc(); }));
  };
  m.el.querySelector('[data-addcut]').addEventListener('click', () => { cuts.push({ name: '', user_id: null, amount: '', mode: 'eur', paid: false }); drawCuts(); m.el.querySelector('.cut-row:last-child input')?.focus(); });
  f.elements.project_id.addEventListener('change', () => { const p = F.projects.find((x) => x.id === f.elements.project_id.value); if (p) { if (!f.elements.title.value) f.elements.title.value = p.name; if (!f.elements.client.value) f.elements.client.value = p.client || ''; } calc(); });
  f.addEventListener('input', calc); f.addEventListener('change', calc);
  f.elements.status.addEventListener('change', () => { if (f.elements.status.value === 'pago' && !f.elements.paid_on.value) f.elements.paid_on.value = todayISO(); });
  drawCuts(); calc();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault(); const v = Object.fromEntries(new FormData(f));
    const row = { leader: (v.leader || '').trim(), fee: num(v.fee), color: v.color || null, project_id: v.project_id || null, title: v.title.trim(), client: v.client.trim(), date: v.date, follow_budget: !!v.follow_budget, amount: num(v.amount), vat_rate: num(v.vat_rate) ?? 23, costs: num(v.costs), status: v.status, due_date: v.due_date || null, paid_on: v.paid_on || null, notes: v.notes, cuts: cuts.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim(), amount: num(c.amount) || 0 })), updated_at: new Date().toISOString() };
    const { error } = isNew ? await sb.from('fin_earnings').insert(row) : await sb.from('fin_earnings').update(row).eq('id', e.id);
    if (error) return toast(error.message); m.close(); after();
  });
  m.el.querySelector('[data-del]')?.addEventListener('click', async () => { m.close(); if (!(await confirmBox(`Apagar "${e.title}" dos ganhos?`, 'Apagar'))) return; await sb.from('fin_earnings').delete().eq('id', e.id); after(); });
}

// ---------- PESSOAS (ganhos individuais) ----------
export async function peopleTab(box, st) {
  const F = await loadFin();
  const year = st.year;
  const rows = perPerson(F, year);
  const tot = rows.reduce((a, r) => a + r.paid + r.due, 0);
  box.innerHTML = `
    <div class="fin-bar"><div class="month-nav"><button type="button" class="icon-btn" data-y="-1" aria-label="Ano anterior">${ICON.back}</button><strong>Ganhos por pessoa ${year}</strong><button type="button" class="icon-btn" data-y="1" aria-label="Ano seguinte">${ICON.chev}</button></div><span class="muted small">Soma dos cortes de cada pessoa nos ganhos</span></div>
    ${rows.length ? `<div class="fin-kpis"><div class="fstat"><span class="fl">Pago às pessoas</span><strong>${eur.format(rows.reduce((a, r) => a + r.paid, 0))}</strong></div><div class="fstat"><span class="fl">Por pagar às pessoas</span><strong class="neg">${eur.format(rows.reduce((a, r) => a + r.due, 0))}</strong></div><div class="fstat"><span class="fl">Total em cortes</span><strong>${eur.format(tot)}</strong><span class="fs">${rows.length} pessoa${rows.length === 1 ? '' : 's'}</span></div></div>
    <div class="ppl-grid">${rows.map((r) => `<section class="panel ppl"><div class="row between"><h2 class="h3">${esc(r.name)}</h2><b>${eur.format(r.paid + r.due)}</b></div>
      <div class="hb-t big"><i style="width:${(r.paid / Math.max(1, r.paid + r.due)) * 100}%;background:${C_PAID}"></i><i style="width:${(r.due / Math.max(1, r.paid + r.due)) * 100}%;background:${C_BILL}"></i></div>
      <p class="small muted">${eur.format(r.paid)} recebido · ${eur.format(r.due)} por receber</p>
      <ul class="ppl-jobs">${r.jobs.map(({ e, c }, i) => `<li><span><b>${esc(e.title)}</b><small>${esc(e.date)} · ${EST[e.status][0]}</small></span><span class="num">${eur2.format(c.value)}</span><label class="check"><input type="checkbox" data-paycut="${e.id}|${(e.cuts || []).indexOf(c)}" ${c.paid ? 'checked' : ''}> pago</label></li>`).join('')}</ul></section>`).join('')}</div>`
      : '<p class="empty-note">Ainda não há cortes neste ano. Junta pessoas e valores em cada ganho (separador Ganhos).</p>'}`;
  box.querySelectorAll('[data-y]').forEach((b) => b.addEventListener('click', () => { st.year = String(+st.year + +b.dataset.y); peopleTab(box, st); }));
  box.querySelectorAll('[data-paycut]').forEach((cb) => cb.addEventListener('change', async () => {
    const [id, idx] = cb.dataset.paycut.split('|'); const e = F.E.find((x) => x.id === id);
    const cuts = (e.cuts || []).map(({ value, ...c }, i) => (i === +idx ? { ...c, paid: cb.checked } : c));
    const { error } = await sb.from('fin_earnings').update({ cuts, updated_at: new Date().toISOString() }).eq('id', id);
    if (error) { toast(error.message); cb.checked = !cb.checked; return; }
    peopleTab(box, st);
  }));
}
