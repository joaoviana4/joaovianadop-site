import { sb, esc, toast, modal, confirmBox, ICON } from './lib.js';
import { exportPdf } from './pdf.js';
import { GRAIN_FEE, feeRowSum } from './folders.js';
import { colorField, readColor, bindColorField, colorPop, tableShortcuts, rowStyle, colStyle, makeHistory, bindUndoKeys } from './tablekit.js';

// Orçamento do projeto, como no Studio: tabela com secções, colunas de texto, valor (€) e número,
// subtotais por secção, comparação com o orçamento geral, modelos por tipo de projeto, importar e exportar Excel.
// O orçamento geral é o mesmo valor que aparece no topo do projeto e na Central de Produção (guardado em project_budgets, que só quem tem acesso ao orçamento consegue ler).

const uid = () => Math.random().toString(36).slice(2, 10);
const TYPES = [['text', 'Texto'], ['money', 'Valor (€)'], ['number', 'Número']];
const TEMPLATES = {
  fiction: [['Pré-produção', ['Guião', 'Repérage', 'Casting', 'Ensaios']], ['Equipa técnica', ['Realização', 'Produção', 'Direção de fotografia', '1.º assistente de câmara', 'Gaffer', 'Maquinista', 'Som direto', 'Direção de arte', 'Guarda-roupa', 'Caracterização', 'Anotação', 'Assistentes de produção']], ['Elenco', ['Protagonistas', 'Secundários', 'Figuração']], ['Equipamento', ['Câmara e objetivas', 'Luz', 'Maquinaria', 'Som', 'Consumíveis']], ['Arte', ['Cenografia', 'Adereços', 'Guarda-roupa', 'Caracterização']], ['Locais', ['Aluguer de locais', 'Licenças']], ['Logística', ['Transportes', 'Combustível e portagens', 'Alimentação', 'Alojamento']], ['Pós-produção', ['Montagem', 'Correção de cor', 'Som e mistura', 'Música', 'Legendas', 'VFX']], ['Outros', ['Seguros', 'Distribuição e festivais', 'Imprevistos (10 %)']]],
  music: [['Crew', ['Realização', 'Produção', 'Direção de fotografia', '1.º assistente de câmara', 'Gaffer', 'Direção de arte', 'Styling', 'Cabelos e maquilhagem', 'Assistentes de set', 'Montagem', 'Cor']], ['Gear', ['Câmara e objetivas', 'Luz', 'Maquinaria']], ['Prod costs', ['Cenografia', 'Styling', 'Catering', 'Transportes e portagens', 'Locais']], ['Outros', ['Imprevistos']]],
  ad: [['Pré-produção', ['Tratamento e pitch', 'Casting', 'Repérage']], ['Equipa', ['Realização', 'Produção', 'Direção de fotografia', 'Assistentes de câmara', 'Gaffer', 'Direção de arte', 'Styling', 'Cabelos e maquilhagem']], ['Elenco', ['Talento', 'Direitos de imagem']], ['Equipamento', ['Câmara', 'Luz', 'Maquinaria', 'Som']], ['Produção', ['Locais', 'Cenografia', 'Catering', 'Transportes']], ['Pós-produção', ['Montagem', 'Cor', 'Som', 'Grafismo', 'Versões e formatos']], ['Agência e taxas', ['Fee de produção', 'Imprevistos']]],
  doc: [['Desenvolvimento', ['Pesquisa', 'Arquivo', 'Viagens de repérage']], ['Equipa', ['Realização', 'Produção', 'Imagem', 'Som']], ['Rodagem', ['Equipamento', 'Transportes', 'Alojamento', 'Alimentação']], ['Pós-produção', ['Montagem', 'Cor', 'Som', 'Música', 'Legendas', 'Direitos de arquivo']], ['Distribuição', ['Festivais', 'Materiais de imprensa']]],
};
const TPL_NAMES = [['simple', 'Simples (4 colunas)'], ['fiction', 'Ficção (curta ou longa)'], ['music', 'Videoclipe'], ['ad', 'Publicidade e comercial'], ['doc', 'Documentário']];
const KIND_TPL = { ficcao: 'fiction', videoclipe: 'music', campanha: 'ad', branded: 'ad', redes: 'ad', lancamento: 'music', documentario: 'doc' };

function baseBudget() {
  return { main: 'v', cols: [{ id: 'd', name: 'Descrição', type: 'text' }, { id: 'n', name: 'Nome', type: 'text' }, { id: 'o', name: 'Notas', type: 'text' }, { id: 'v', name: 'Valor', type: 'money' }], rows: [1, 2, 3].map(() => ({ id: uid(), kind: 'item', cells: {} })) };
}
function templateRows(k) {
  if (!TEMPLATES[k]) return baseBudget().rows;
  const rows = [];
  TEMPLATES[k].forEach(([t, items]) => { rows.push({ id: uid(), kind: 'section', title: t }); items.forEach((d) => rows.push({ id: uid(), kind: 'item', cells: { d } })); });
  return rows;
}

// número a partir de texto português ("1.234,50 €", "1234.5", "1 234")
export function num(v) {
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[€$£\s ]/g, '').replace(/eur$/i, '');
  if (!s || s === '-' || s === '—') return null;
  if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?[\d,]+\.\d+$/.test(s)) s = s.replace(/,/g, '');
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else s = s.replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}
const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const fmt = (c, v) => (v == null || v === '' ? '' : c.type === 'money' ? eur.format(v) : new Intl.NumberFormat('pt-PT').format(v));
const fmtIn = (c, v) => { const n = num(v); return n == null ? (v ?? '') : c.type === 'money' ? new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n) : String(n).replace('.', ','); };

function sums(b) {
  const tot = {}, sec = {}; let cur = null;
  b.cols.forEach((c) => c.type !== 'text' && (tot[c.id] = 0));
  b.rows.forEach((r) => {
    if (r.kind === 'section') { cur = r.id; sec[cur] = {}; return; }
    b.cols.forEach((c) => { if (c.type === 'text') return; const n = num(r.cells?.[c.id]); if (n == null) return; tot[c.id] += n; if (cur) sec[cur][c.id] = (sec[cur][c.id] || 0) + n; });
  });
  return { tot, sec };
}

export async function budgetPage(main, p) {
  let b = p.budget && p.budget.cols ? JSON.parse(JSON.stringify(p.budget)) : null;
  let total = p.value != null ? Number(p.value) : null;
  const hist = makeHistory({ get: () => b, set: (v) => { b = v; }, after: () => { save(0); draw(); }, notify: toast });
  let undoKeysBound = false;
  let saveT;
  // Guardar com proteção: só grava se ninguém (outra janela, outra pessoa) mudou o orçamento entretanto.
  // Cada versão anterior fica guardada na base de dados (project_budget_history).
  let blocked = false;
  async function write(patch) {
    if (blocked) return false;
    if (p._store) { const ok = await p._store(patch); if (ok === 'conflict') { blocked = true; conflict(); return false; } return ok; }
    const now = new Date().toISOString();
    let res;
    if (p._budgetAt) res = await sb.from('project_budgets').update({ ...patch, updated_at: now }).eq('project_id', p.id).eq('updated_at', p._budgetAt).select('updated_at');
    else res = await sb.from('project_budgets').insert({ project_id: p.id, ...patch, updated_at: now }).select('updated_at');
    if (res.error && !/duplicate/i.test(res.error.message)) { toast('Não foi possível guardar: ' + res.error.message); return false; }
    if (res.error || !res.data?.length) { blocked = true; conflict(); return false; }
    p._budgetAt = res.data[0].updated_at; return true;
  }
  function conflict() {
    clearTimeout(saveT);
    const bar = document.createElement('div'); bar.className = 'bconflict';
    bar.innerHTML = `<strong>Este orçamento foi mudado noutra janela ou por outra pessoa.</strong><span>Para não apagar esse trabalho, esta janela deixou de guardar. Recarrega para veres a versão mais recente.</span><button type="button" class="btn primary">Recarregar</button>`;
    bar.querySelector('button').onclick = () => location.reload();
    main.prepend(bar);
  }
  const save = (delay = 600) => {
    clearTimeout(saveT);
    saveT = setTimeout(async () => { if (await write({ budget: b })) p.budget = b; }, delay);
  };
  // nome do orçamento e do valor geral: personalizáveis (ficam guardados com a tabela)
  p._renameBudget = (name) => { if (!b) b = baseBudget(); b.title = name; save(0); };
  const capName = () => b?.capName || p._capLabel || 'Orçamento geral do projeto';
  const saveTotal = async () => { if (await write({ value: total })) p.value = total; };
  async function history() {
    const { data, error } = await sb.from('project_budget_history').select('id, value, budget, saved_at').eq('project_id', p.id).order('saved_at', { ascending: false }).limit(30);
    if (error) return toast(error.message);
    const tot = (x) => { const bb = x.budget; if (!bb?.rows || !bb.main) return 0; return bb.rows.filter((r) => r.kind === 'item').reduce((a, r) => a + (Number(r.cells?.[bb.main]) || 0), 0); };
    const m = modal(`<h2>Versões anteriores</h2><p class="muted small">Cada vez que o orçamento muda, a versão anterior fica guardada aqui.</p>
      ${data.length ? `<ul class="bhist">${data.map((x) => `<li><span><strong>${new Date(x.saved_at).toLocaleString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</strong><span class="muted small">${(x.budget?.rows || []).filter((r) => r.kind === 'item').length} linhas · tabela ${eur.format(tot(x))}${x.value != null ? ` · geral ${eur.format(x.value)}` : ''}</span></span><button type="button" class="btn ghost" data-restore="${x.id}">Repor</button></li>`).join('')}</ul>` : '<p class="muted">Ainda não há versões anteriores.</p>'}
      <div class="row end"><button type="button" class="btn ghost" data-close>Fechar</button></div>`);
    m.el.querySelectorAll('[data-restore]').forEach((btn) => btn.addEventListener('click', async () => {
      const x = data.find((y) => String(y.id) === btn.dataset.restore);
      if (!(await confirmBox('Repor esta versão? A atual também fica guardada nas versões anteriores.', 'Repor'))) return;
      const prevB = b, prevT = total;
      b = x.budget ? JSON.parse(JSON.stringify(x.budget)) : null; total = x.value != null ? Number(x.value) : null;
      if (await write({ budget: b, value: total })) { p.budget = b; p.value = total; m.close(); draw(); toast('Versão reposta.'); } else { b = prevB; total = prevT; }
    }));
  }

  // Grain fee: só no orçamento geral do projeto (não nos orçamentos de departamento, que usam _store)
  const hasFee = !p._store;
  // se a tabela já tem uma linha "Agency fee" / "Grain fee", essa é a fee e a automática não se soma
  const rowFee = () => (hasFee && b ? feeRowSum(b) : 0);
  const feeP = () => (!hasFee || !b || rowFee() || b.gfee?.off ? 0 : b.gfee?.pct != null ? Number(b.gfee.pct) || 0 : GRAIN_FEE);
  const feeOf = (own) => own * feeP() / 100;
  function summary() {
    const { tot } = sums(b); const rf = rowFee(); const costs = ((b.main && tot[b.main]) || 0) - rf; const fee = rf || feeOf(costs); const own = costs + fee;
    // numa pasta (ex.: álbum), o que está atribuído aos projetos lá dentro também conta
    const extra = p._extra?.amount || 0; const t = own + extra;
    const has = total != null && total > 0; const ratio = has ? t / total : 0; const diff = has ? total - t : 0;
    const stt = !has ? 'none' : diff < 0 ? 'over' : ratio >= 0.9 ? 'near' : 'ok';
    const label = { none: p._capLabel ? 'Sem limite definido' : 'Sem orçamento geral definido', over: 'Fora do orçamento', near: 'Dentro, mas perto do limite', ok: 'Dentro do orçamento' }[stt];
    const pctTxt = String(feeP()).replace('.', ',');
    const lines = [[extra ? 'Custos desta tabela' : 'Custos', costs], ...(fee ? [[rf ? 'Agency fee (linha da tabela)' : `Grain fee · ${pctTxt} %`, fee]] : []), ...(extra ? [[p._extra.label ? p._extra.label.charAt(0).toUpperCase() + p._extra.label.slice(1) : 'Projetos dentro', extra]] : [])];
    return `<div class="bsum-grid">
      <div class="bsum-main"><span class="fl">${extra ? 'Total comprometido' : fee ? 'Total com Grain fee' : 'Total da tabela'}</span><strong class="bbig">${eur.format(t)}</strong>
        ${lines.length > 1 ? `<dl class="bsum-lines">${lines.map(([l, v]) => `<div><dt>${esc(l)}</dt><dd>${eur.format(v)}</dd></div>`).join('')}</dl>` : ''}</div>
      ${has ? `<div class="bsum-left"><span class="fl">${diff < 0 ? 'Passa' : 'Sobram'}</span><strong class="bbig bst-${stt}">${eur.format(Math.abs(diff))}</strong></div>` : ''}
      <div class="bstate"><span class="bchip bst-${stt}">${label}</span></div></div>
      ${has ? `<div class="bbar-w"><div class="bbar" role="img" aria-label="${Math.round(ratio * 100)} % do orçamento geral"><span class="bst-${stt}" style="width:${Math.min(100, ratio * 100).toFixed(1)}%"></span>${ratio > 1 ? `<i style="left:${(100 / ratio).toFixed(1)}%"></i>` : ''}</div><p class="muted small">${Math.round(ratio * 100)} % do orçamento geral</p></div>` : ''}`;
  }

  function cellInput(r, c) {
    const v = r.cells?.[c.id] ?? '';
    return `<input class="${c.type !== 'text' ? 'num' : ''}" data-cell="${c.id}" value="${esc(c.type === 'text' ? v : fmtIn(c, v))}" ${c.type !== 'text' ? 'inputmode="decimal"' : ''} aria-label="${esc(c.name)}">`;
  }

  function draw() {
    if (!b) {
      const sug = KIND_TPL[p.kind] || 'simple';
      main.innerHTML = `<div class="budget-empty"><h2 class="h2">Começar o orçamento</h2><p class="muted">Escolhe um modelo. Depois mudas linhas, secções e colunas à vontade, ou importas um Excel.</p>
        <div class="tpl-grid">${TPL_NAMES.map(([k, l]) => `<button type="button" class="tpl-card ${k === sug ? 'sug' : ''}" data-start="${k}"><strong>${l}</strong>${k === sug ? '<span class="tag blue">Sugerido</span>' : ''}<span class="small muted">${TEMPLATES[k] ? TEMPLATES[k].map((x) => x[0]).slice(0, 4).join(' · ') + (TEMPLATES[k].length > 4 ? '…' : '') : 'Descrição, Nome, Notas, Valor'}</span></button>`).join('')}</div>
        <button type="button" class="btn ghost" data-import>${ICON.open} Importar Excel ou CSV</button></div>`;
      main.querySelectorAll('[data-start]').forEach((x) => x.addEventListener('click', () => { b = baseBudget(); b.rows = templateRows(x.dataset.start); save(0); draw(); }));
      main.querySelector('[data-import]').addEventListener('click', pickImport);
      return;
    }
    const { tot, sec } = sums(b);
    const moneyCols = b.cols.filter((c) => c.type !== 'text');
    const nItems = b.rows.filter((r) => r.kind !== 'section').length;
    main.innerHTML = `
      <section class="panel bsum">
        <div class="btotal-in">
          <div class="field"><input class="label-in" data-capname value="${esc(capName())}" aria-label="Nome do valor geral" title="Clica para mudar o nome" maxlength="60"><span class="money-in"><input class="num" data-total inputmode="decimal" value="${total != null ? esc(fmtIn({ type: 'money' }, total)) : ''}" placeholder="Ex.: 8000" autocomplete="off" aria-label="${esc(capName())}"><i>€</i></span></div>
          ${hasFee ? `<div class="field bfee"><span class="label">Grain fee</span><span class="bfee-row-note muted small" data-feenote ${rowFee() ? '' : 'hidden'}>Está na tabela (linha “Agency fee”)</span><span class="bfee-in" data-feectl ${rowFee() ? 'hidden' : ''}><label class="switch-l"><input type="checkbox" data-feeon ${b.gfee?.off ? '' : 'checked'}> aplicar</label><span class="money-in"><input class="num" data-feepct inputmode="decimal" value="${esc(String(b.gfee?.pct ?? GRAIN_FEE).replace('.', ','))}" ${b.gfee?.off ? 'disabled' : ''} aria-label="Percentagem da Grain fee"><i>%</i></span></span></div>` : ''}
          ${moneyCols.length > 1 ? `<label class="field"><span class="label">Compara com a coluna</span><select data-main>${moneyCols.map((c) => `<option value="${c.id}" ${c.id === b.main ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>` : ''}
        </div>
        <div data-sum>${summary()}</div>
        ${hasFee && p.kind !== 'album' ? `<div class="bappr ${p._approvedAt ? 'on' : ''}">${p._approvedAt
          ? `<span class="bchip bst-ok">✓ Orçamento aprovado</span><span class="muted small">a ${new Date(p._approvedAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long' })} · conta nos ganhos e no resumo das Finanças</span><button type="button" class="link-btn" data-unapprove>Desfazer</button>`
          : `<button type="button" class="btn primary" data-approve>✓ Orçamento aprovado</button><span class="muted small">Até aprovares, aparece nos ganhos como “Orçamento enviado” e não conta nos totais.</span>`}</div>` : ''}
      </section>
      <div class="btools">
        <label class="sel"><span class="vh">Modelo</span><select data-tpl><option value="">Aplicar modelo…</option>${TPL_NAMES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
        <button type="button" class="btn ghost" data-import>${ICON.open} Importar Excel ou CSV</button>
        <button type="button" class="btn ghost" data-export>${ICON.copy} Exportar para Excel</button>
        <button type="button" class="btn ghost" data-pdf>${ICON.open} Exportar PDF</button>
        ${p._store ? '' : `<button type="button" class="btn ghost" data-hist>${ICON.refresh} Versões anteriores</button>`}
        ${hist.last ? `<button type="button" class="link-btn" data-undo title="Ctrl+Z">Desfazer: ${esc(hist.last)}</button>` : ''}
      </div>
      <div class="panel table-wrap btable"><table class="table budget">
        <thead><tr>${b.cols.map((c) => `<th class="${c.type !== 'text' ? 'num' : ''} ${c.color ? 'has-cc' : ''}" data-colid="${c.id}"${colStyle(c)}><button type="button" class="th-btn" data-col="${c.id}">${esc(c.name)}${c.id === b.main ? ' ●' : ''}</button></th>`).join('')}<th class="bact"><button type="button" class="icon-btn sm" data-addcol aria-label="Juntar coluna">${ICON.plus}</button></th></tr></thead>
        <tbody>${b.rows.map((r) => r.kind === 'section'
          ? `<tr class="bsec ${r.color ? 'has-rc' : ''}" data-row="${r.id}"${rowStyle(r)}><td colspan="${Math.max(1, b.cols.findIndex((c) => c.type !== 'text'))}" class="rd-cell"><button type="button" class="row-dot" data-rowcolor title="Cor da secção" aria-label="Cor da secção"></button><input class="sec-in" data-sec value="${esc(r.title)}" aria-label="Nome da secção"></td>${b.cols.slice(Math.max(1, b.cols.findIndex((c) => c.type !== 'text'))).map((c) => `<td class="num">${c.type === 'text' ? '' : `<b data-ssum="${r.id}:${c.id}">${fmt(c, sec[r.id]?.[c.id] || 0)}</b>`}</td>`).join('')}<td class="bact"><button type="button" class="icon-btn sm" data-rm aria-label="Apagar secção">${ICON.close}</button></td></tr>`
          : `<tr data-row="${r.id}" class="${r.color ? 'has-rc' : ''}"${rowStyle(r)}>${b.cols.map((c, i) => `<td class="${c.type !== 'text' ? 'num' : ''} ${c.color ? 'has-cc' : ''} ${i === 0 ? 'rd-cell' : ''}" data-colid="${c.id}"${colStyle(c)}>${i === 0 ? '<button type="button" class="row-dot" data-rowcolor title="Cor da linha" aria-label="Cor da linha"></button>' : ''}${cellInput(r, c)}</td>`).join('')}<td class="bact"><button type="button" class="icon-btn sm" data-rm aria-label="Apagar linha">${ICON.close}</button></td></tr>`).join('')}</tbody>
        <tfoot><tr>${b.cols.map((c, i) => `<td class="num">${i === 0 ? '<strong>Total</strong>' : c.type === 'text' ? '' : `<strong data-tsum="${c.id}">${fmt(c, tot[c.id] || 0)}</strong>`}</td>`).join('')}<td></td></tr>${hasFee && b.main ? `<tr class="bfee-row" ${feeP() ? '' : 'hidden'}>${b.cols.map((c, i) => `<td class="num">${i === 0 ? `Grain fee (${String(feeP()).replace('.', ',')} %)` : c.id === b.main ? `<span data-tfee>${eur.format(feeOf(tot[c.id] || 0))}</span>` : ''}</td>`).join('')}<td></td></tr><tr class="bfee-row tot" ${feeP() ? '' : 'hidden'}>${b.cols.map((c, i) => `<td class="num">${i === 0 ? '<strong>Total com Grain fee</strong>' : c.id === b.main ? `<strong data-tfeetot>${eur.format((tot[c.id] || 0) + feeOf(tot[c.id] || 0))}</strong>` : ''}</td>`).join('')}<td></td></tr>` : ''}</tfoot>
      </table></div>
      <div class="row wrap-gap"><button type="button" class="btn ghost" data-addrow>${ICON.plus} Linha</button><button type="button" class="btn ghost" data-addsec>${ICON.plus} Secção</button><span class="muted small">${nItems} ${nItems === 1 ? 'linha' : 'linhas'} · clica no nome de uma coluna para mudar nome, tipo e cor · ● conta para o total · <kbd>Alt</kbd>+<kbd>↓</kbd> linha, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↓</kbd> secção, <kbd>Alt</kbd>+<kbd>→</kbd> coluna (onde está o rato) · cor da linha no ponto à esquerda</span></div>`;
    bind();
  }

  function refreshSums() {
    const { tot, sec } = sums(b);
    main.querySelectorAll('[data-tsum]').forEach((el) => { const c = b.cols.find((x) => x.id === el.dataset.tsum); el.textContent = fmt(c, tot[c.id] || 0); });
    main.querySelectorAll('[data-ssum]').forEach((el) => { const [sid, cid] = el.dataset.ssum.split(':'); const c = b.cols.find((x) => x.id === cid); el.textContent = fmt(c, sec[sid]?.[cid] || 0); });
    const rf = rowFee(); main.querySelectorAll('.bfee-row').forEach((tr) => { tr.hidden = !feeP(); }); const fn = main.querySelector('[data-feenote]'); if (fn) fn.hidden = !rf; const fc = main.querySelector('[data-feectl]'); if (fc) fc.hidden = !!rf;
    const mt = (b.main && tot[b.main]) || 0; const tf = main.querySelector('[data-tfee]'); if (tf) tf.textContent = eur.format(feeOf(mt)); const tt = main.querySelector('[data-tfeetot]'); if (tt) tt.textContent = eur.format(mt + feeOf(mt));
    main.querySelector('[data-sum]').innerHTML = summary();
  }
  const snapshot = (label) => hist.push(label);

  function bind() {
    const totalIn = main.querySelector('[data-total]');
    totalIn.addEventListener('input', () => { total = num(totalIn.value); refreshSums(); clearTimeout(totalIn._t); totalIn._t = setTimeout(saveTotal, 600); });
    totalIn.addEventListener('blur', () => { if (total != null) totalIn.value = fmtIn({ type: 'money' }, total); });
    const setAppr = async (on) => {
      if (on && !(await confirmBox(`Marcar o orçamento de "${p.name}" como aprovado? Passa a contar nos ganhos e no resumo das Finanças como “Aceite”.`, 'Aprovar'))) return;
      const v = on ? new Date().toISOString() : null;
      if (await write({ approved_at: v, approved_by: on ? (await sb.auth.getUser()).data.user?.id || null : null })) { p._approvedAt = v; toast(on ? 'Orçamento aprovado. Já está nos ganhos.' : 'Aprovação desfeita.'); draw(); }
    };
    main.querySelector('[data-approve]')?.addEventListener('click', () => setAppr(true));
    main.querySelector('[data-unapprove]')?.addEventListener('click', () => setAppr(false));
    const cn = main.querySelector('[data-capname]');
    cn.addEventListener('change', () => { const v = cn.value.trim(); snapshot('nome'); if (!v || v === (p._capLabel || 'Orçamento geral do projeto')) delete b.capName; else b.capName = v; cn.value = capName(); save(0); });
    cn.addEventListener('keydown', (e) => { if (e.key === 'Enter') cn.blur(); });
    main.querySelector('[data-feeon]')?.addEventListener('change', (e) => { snapshot('Grain fee'); b.gfee = { ...(b.gfee || {}), off: !e.target.checked }; if (!b.gfee.off) delete b.gfee.off; save(0); draw(); });
    const fp = main.querySelector('[data-feepct]');
    fp?.addEventListener('change', () => { const n = num(fp.value); snapshot('Grain fee'); b.gfee = { ...(b.gfee || {}), pct: n == null ? GRAIN_FEE : Math.max(0, n) }; save(0); draw(); });
    main.querySelector('[data-main]')?.addEventListener('change', (e) => { b.main = e.target.value; save(); draw(); });
    main.querySelector('[data-tpl]').addEventListener('change', async (e) => {
      const k = e.target.value; if (!k) return;
      if (!(await confirmBox('Substituir as linhas pelo modelo? Podes desfazer a seguir.', 'Aplicar modelo'))) { e.target.value = ''; return; }
      snapshot('modelo'); b.rows = templateRows(k); if (k === 'simple') b.cols = baseBudget().cols; if (!b.cols.some((c) => c.id === b.main)) b.main = b.cols.find((c) => c.type === 'money')?.id || null;
      if (!b.cols.some((c) => c.id === 'd')) b.cols.unshift({ id: 'd', name: 'Descrição', type: 'text' });
      save(0); draw();
    });
    main.querySelector('[data-undo]')?.addEventListener('click', () => hist.undo());
    hist.watch(main.querySelector('table.budget'));
    if (!undoKeysBound) { bindUndoKeys(main, hist); undoKeysBound = true; }
    main.querySelector('[data-import]').addEventListener('click', pickImport);
    main.querySelector('[data-export]').addEventListener('click', () => exportXlsx(b, total, p.name, feeP()));
    main.querySelector('[data-hist]')?.addEventListener('click', history);
    main.querySelector('[data-pdf]').addEventListener('click', () => {
      const { tot, sec } = sums(b); const groups = []; let cur = { title: null, rows: [] };
      b.rows.forEach((r) => {
        if (r.kind === 'section') { if (cur.title !== null || cur.rows.length) groups.push(cur); cur = { title: r.title, color: r.color || '#1E2AD4', right: b.main && sec[r.id]?.[b.main] != null ? fmt(b.cols.find((c) => c.id === b.main), sec[r.id][b.main]) : '', rows: [] }; return; }
        cur.rows.push(b.cols.map((c) => (c.type === 'text' ? r.cells?.[c.id] ?? '' : fmt(c, num(r.cells?.[c.id])))));
      });
      groups.push(cur);
      const mainCol = b.cols.find((c) => c.id === b.main); const t = (b.main && tot[b.main]) || 0;
      exportPdf({
        title: `${b.title || 'Orçamento'} — ${p.name}`, subtitle: new Date().toLocaleDateString('pt-PT'),
        columns: b.cols.map((c) => ({ label: c.name, align: c.type === 'text' ? undefined : 'right' })),
        groups: groups.filter((g) => g.title !== null || g.rows.length),
        footer: [['Total da tabela', mainCol ? fmt(mainCol, t) : ''], ...(feeP() ? [[`Grain fee (${String(feeP()).replace('.', ',')} %)`, eur.format(feeOf(t))], ['Total com Grain fee', eur.format(t + feeOf(t))]] : []), ...(total != null ? [[capName(), eur.format(total)], [total - t - feeOf(t) < 0 ? 'Passa' : 'Sobram', eur.format(Math.abs(total - t - feeOf(t)))]] : [])],
      });
    });
    const tbody = main.querySelector('tbody');
    tbody.addEventListener('input', (e) => {
      const tr = e.target.closest('[data-row]'); const r = b.rows.find((x) => x.id === tr.dataset.row);
      if (e.target.matches('[data-sec]')) r.title = e.target.value;
      else if (e.target.matches('[data-cell]')) { const c = b.cols.find((x) => x.id === e.target.dataset.cell); r.cells = { ...(r.cells || {}), [c.id]: c.type === 'text' ? e.target.value : (num(e.target.value) ?? e.target.value) }; if (c.type !== 'text' || hasFee) refreshSums(); }
      save();
    });
    tbody.addEventListener('focusout', (e) => { if (e.target.matches('[data-cell].num')) { const c = b.cols.find((x) => x.id === e.target.dataset.cell); const n = num(e.target.value); if (n != null) e.target.value = fmtIn(c, n); } });
    tbody.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.matches('[data-cell], [data-sec]')) return;
      e.preventDefault();
      const tr = e.target.closest('tr'); const idx = e.target.matches('[data-sec]') ? 0 : [...tr.querySelectorAll('[data-cell]')].indexOf(e.target);
      let next = tr.nextElementSibling; while (next && next.classList.contains('bsec')) next = next.nextElementSibling;
      if (!next) { const i = b.rows.findIndex((x) => x.id === tr.dataset.row); b.rows.splice(i + 1, 0, { id: uid(), kind: 'item', cells: {} }); save(); draw(); next = main.querySelector(`tbody tr:nth-child(${i + 2})`); }
      next?.querySelectorAll('[data-cell]')[Math.max(0, idx)]?.focus();
    });
    tbody.addEventListener('click', (e) => {
      const dot = e.target.closest('[data-rowcolor]');
      if (dot) { const r = b.rows.find((x) => x.id === dot.closest('[data-row]').dataset.row); colorPop(dot, r.color, (c) => { snapshot('cor da linha'); if (c) r.color = c; else delete r.color; save(); draw(); }); return; }
      if (!e.target.closest('[data-rm]')) return;
      const id = e.target.closest('[data-row]').dataset.row; const r = b.rows.find((x) => x.id === id);
      if (r.kind !== 'section') { snapshot('apagar linha'); b.rows = b.rows.filter((x) => x.id !== id); save(); draw(); return; }
      // apagar uma secção apaga também as linhas dela (até à secção seguinte); dá para ficar só sem o cabeçalho
      const i0 = b.rows.indexOf(r); let i1 = i0 + 1; while (i1 < b.rows.length && b.rows[i1].kind !== 'section') i1++;
      const kids = b.rows.slice(i0 + 1, i1);
      const doAll = () => { snapshot('apagar secção'); b.rows.splice(i0, i1 - i0); save(); draw(); toast(`Secção apagada${kids.length ? ` com ${kids.length} ${kids.length === 1 ? 'linha' : 'linhas'}` : ''}. Ctrl+Z para voltar atrás.`); };
      if (!kids.length) return doAll();
      const m = modal(`<h2>Apagar a secção "${esc(r.title || 'sem nome')}"?</h2><p>Esta secção tem ${kids.length} ${kids.length === 1 ? 'linha' : 'linhas'}. Apagam-se também, com os valores todos.</p>
        <div class="row between wrap-gap"><button type="button" class="btn ghost" data-only>Só o cabeçalho</button><div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn danger" data-all>Apagar a secção e as linhas</button></div></div>`);
      m.el.querySelector('[data-all]').addEventListener('click', () => { m.close(); doAll(); });
      m.el.querySelector('[data-only]').addEventListener('click', () => { m.close(); snapshot('apagar cabeçalho'); b.rows = b.rows.filter((x) => x.id !== id); save(); draw(); });
    });
    main.querySelector('[data-addrow]').addEventListener('click', () => { snapshot('juntar linha'); b.rows.push({ id: uid(), kind: 'item', cells: {} }); save(); draw(); main.querySelector('tbody tr:last-child [data-cell]')?.focus(); });
    main.querySelector('[data-addsec]').addEventListener('click', () => { snapshot('juntar secção'); b.rows.push({ id: uid(), kind: 'section', title: 'Nova secção' }); save(); draw(); const s = main.querySelector('tbody tr:last-child [data-sec]'); s?.focus(); s?.select(); });
    main.querySelector('[data-addcol]').addEventListener('click', () => colForm(null));
    const at = (id) => { const i = b.rows.findIndex((x) => x.id === id); return i < 0 ? b.rows.length - 1 : i; };
    const insertRow = (i, row) => { snapshot(row.kind === 'section' ? 'juntar secção' : 'juntar linha'); b.rows.splice(i, 0, row); save(); draw(); const el = main.querySelector(`[data-row="${row.id}"] ${row.kind === 'section' ? '[data-sec]' : '[data-cell]'}`); el?.focus(); if (row.kind === 'section') el?.select(); };
    const insertCol = (id, side) => { snapshot('juntar coluna'); const i = b.cols.findIndex((c) => c.id === id); const c = { id: uid(), name: 'Nova coluna', type: 'text' }; b.cols.splice(i < 0 ? b.cols.length : i + side, 0, c); save(); draw(); colForm(c, true); };
    tableShortcuts(main.querySelector('table.budget'), {
      rowBelow: (id) => insertRow(at(id) + 1, { id: uid(), kind: 'item', cells: {} }),
      rowAbove: (id) => insertRow(Math.max(0, at(id)), { id: uid(), kind: 'item', cells: {} }),
      section: (id) => insertRow(at(id) + 1, { id: uid(), kind: 'section', title: 'Nova secção' }),
      colRight: (id) => insertCol(id, 1), colLeft: (id) => insertCol(id, 0),
    });
    main.querySelectorAll('[data-col]').forEach((x) => x.addEventListener('click', () => colForm(b.cols.find((c) => c.id === x.dataset.col))));
  }

  function colForm(c, justAdded = false) {
    const isNew = !c; c = c || { id: uid(), name: '', type: 'money' };
    const m = modal(`<h2>${isNew ? 'Nova coluna' : 'Coluna'}</h2><form class="stack">
      <div class="field"><label for="cn">Nome</label><input id="cn" value="${esc(c.name)}" required></div>
      <div class="field"><label for="ct">Tipo</label><select id="ct">${TYPES.map(([k, v]) => `<option value="${k}" ${c.type === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      ${colorField(c.color)}
      <div class="row between">${isNew || b.cols.length < 2 ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar coluna</button>`}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>`);
    bindColorField(m.el);
    if (justAdded) { const n = m.el.querySelector('#cn'); n.select(); }
    m.el.querySelector('form').addEventListener('submit', (e) => {
      e.preventDefault(); if (!justAdded) snapshot(isNew ? 'juntar coluna' : 'mudar coluna'); c.name = m.el.querySelector('#cn').value.trim() || 'Coluna'; c.type = m.el.querySelector('#ct').value;
      const col = readColor(m.el); if (col) c.color = col; else delete c.color;
      if (isNew) b.cols.push(c);
      if (!b.main || !b.cols.some((x) => x.id === b.main && x.type !== 'text')) b.main = b.cols.find((x) => x.type === 'money')?.id || b.cols.find((x) => x.type !== 'text')?.id || null;
      m.close(); save(); draw();
    });
    m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
      m.close(); if (!(await confirmBox(`Apagar a coluna "${c.name}"? Podes desfazer a seguir.`, 'Apagar'))) return;
      snapshot('apagar coluna'); b.cols = b.cols.filter((x) => x.id !== c.id); if (b.main === c.id) b.main = b.cols.find((x) => x.type === 'money')?.id || null; save(); draw();
    });
  }

  function pickImport() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xlsm,.csv,.tsv,.txt';
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      try {
        toast('A ler o ficheiro…');
        const sheets = await readFile(f);
        importDialog(f.name, sheets);
      } catch (e) { toast(e.code === 'old' ? 'Guarda o ficheiro como .xlsx ou .csv e tenta outra vez.' : 'Não consegui ler este ficheiro.'); }
    };
    inp.click();
  }
  function importDialog(name, sheets) {
    let si = 0; let mode = b ? 'replace' : 'replace';
    const m = modal('<div data-imp></div>', { wide: true });
    const box = m.el.querySelector('[data-imp]');
    const drawImp = () => {
      const parsed = parseRows(sheets[si].rows);
      const items = parsed.rows.filter((r) => r.kind === 'item').length, secs = parsed.rows.filter((r) => r.kind === 'section').length;
      box.innerHTML = `<h2>Importar ${esc(name)}</h2>
        ${sheets.length > 1 ? `<div class="field"><label for="is">Folha</label><select id="is">${sheets.map((s, i) => `<option value="${i}" ${i === si ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></div>` : ''}
        <p>${items} ${items === 1 ? 'linha' : 'linhas'}${secs ? ` em ${secs} ${secs === 1 ? 'secção' : 'secções'}` : ''} · colunas: ${parsed.cols.map((c) => `${esc(c.name)} <span class="muted small">(${TYPES.find((t) => t[0] === c.type)[1]})</span>`).join(', ')}${parsed.total != null ? ` · orçamento geral encontrado: <strong>${eur.format(parsed.total)}</strong>` : ''}</p>
        ${b ? `<div class="stack"><label class="check"><input type="radio" name="im" value="replace" ${mode === 'replace' ? 'checked' : ''}> Substituir a tabela atual (podes desfazer)</label><label class="check"><input type="radio" name="im" value="append" ${mode === 'append' ? 'checked' : ''}> Juntar ao fim da tabela atual</label></div>` : ''}
        <div class="row end"><button type="button" class="btn ghost" data-x>Cancelar</button><button type="button" class="btn primary" data-go ${items ? '' : 'disabled'}>Importar</button></div>`;
      box.querySelector('#is')?.addEventListener('change', (e) => { si = +e.target.value; drawImp(); });
      box.querySelectorAll('[name=im]').forEach((r) => r.addEventListener('change', () => (mode = r.value)));
      box.querySelector('[data-x]').onclick = m.close;
      box.querySelector('[data-go]').onclick = () => {
        if (b) snapshot('importação');
        if (!b || mode === 'replace') { b = { cols: parsed.cols, rows: parsed.rows, main: [...parsed.cols].reverse().find((c) => c.type === 'money')?.id || parsed.cols.find((c) => c.type !== 'text')?.id || null }; }
        else {
          const map = {};
          parsed.cols.forEach((c) => { let ex = b.cols.find((x) => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()); if (!ex) { ex = { ...c }; b.cols.push(ex); } map[c.id] = ex.id; });
          parsed.rows.forEach((r) => b.rows.push(r.kind === 'section' ? r : { id: r.id, kind: 'item', cells: Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [map[k], v])) }));
        }
        if (parsed.total != null) { total = parsed.total; saveTotal(); }
        m.close(); save(0); draw(); toast(`Orçamento importado de ${name}.`);
      };
    };
    drawImp();
  }

  draw();
}

// ---------- ler ficheiros ----------
async function loadExcel() { const mod = await import('exceljs/dist/exceljs.min.js'); return mod.default || window.ExcelJS || mod; }
async function readFile(f) {
  if (/\.(csv|tsv|txt)$/i.test(f.name)) return [{ name: f.name, rows: parseCsv(await f.text()) }];
  if (/\.(xlsx|xlsm)$/i.test(f.name)) {
    const ExcelJS = await loadExcel(); const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await f.arrayBuffer());
    return wb.worksheets.map((ws) => { const rows = []; ws.eachRow({ includeEmpty: true }, (row, i) => { const vals = []; row.eachCell({ includeEmpty: true }, (cell, c) => { let v = cell.value; if (v && typeof v === 'object') v = v.result ?? v.text ?? (v.richText ? v.richText.map((t) => t.text).join('') : ''); vals[c - 1] = v ?? ''; }); rows[i - 1] = vals; }); return { name: ws.name, rows: rows.map((r) => r || []) }; }).filter((s) => s.rows.length);
  }
  const e = new Error('format'); e.code = /\.(xls|ods|numbers)$/i.test(f.name) ? 'old' : 'format'; throw e;
}
function parseCsv(t) {
  const first = t.split(/\r?\n/)[0] || '';
  const sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.includes('\t') ? '\t' : ',';
  const out = []; let row = [], cur = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) { if (ch === '"' && t[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cur); cur = ''; } else if (ch === '\n') { row.push(cur); out.push(row); row = []; cur = ''; } else if (ch !== '\r') cur += ch;
  }
  if (cur || row.length) { row.push(cur); out.push(row); }
  return out;
}
// descobre o cabeçalho, o tipo de cada coluna, as secções e um "orçamento máximo" escrito na folha
function parseRows(raw) {
  const rows = raw.map((r) => (r || []).map((v) => (typeof v === 'string' ? v.trim() : v)));
  const width = rows.reduce((a, r) => Math.max(a, r.length), 0);
  const filled = (r) => r.filter((v) => v !== '' && v != null).length;
  const isText = (v) => typeof v === 'string' && v !== '' && num(v) == null;
  const budgetRe = /(?:max|m[áa]ximo|or[çc]amento|budget)\D{0,8}\d[\d.,\s]*/i;
  let head = -1, best = 1;
  rows.slice(0, 15).forEach((r, i) => { const n = r.filter((v) => isText(v) && !budgetRe.test(String(v))).length; if (n > best && !r.some((v) => v !== '' && v != null && !isText(v))) { best = n; head = i; } });
  const used = []; for (let c = 0; c < width; c++) if (rows.some((r) => r[c] !== '' && r[c] != null)) used.push(c);
  const hdr = head >= 0 ? rows[head] : []; const body = rows.slice(head + 1);
  const cols = used.map((src, i) => {
    const vals = body.map((r) => r[src]).filter((v) => v !== '' && v != null);
    const nums = vals.filter((v) => num(v) != null).length;
    const name = String(hdr[src] || '').trim() || `Coluna ${i + 1}`;
    const numeric = vals.length && nums / vals.length >= 0.6;
    return { id: 'c' + i + uid().slice(0, 4), name, type: numeric ? (/qtd|quant|qty|dias|days|horas|hours|n\.?º/i.test(name) ? 'number' : 'money') : 'text', src };
  });
  const out = [];
  body.forEach((r) => {
    const n = filled(r); if (!n) return;
    const texts = r.filter(isText);
    const totalRow = texts.some((v) => /^(sub)?total/i.test(v));
    if (totalRow) return;
    if (n === 1 && texts.length === 1 && !budgetRe.test(texts[0])) { out.push({ id: uid(), kind: 'section', title: texts[0] }); return; }
    if (budgetRe.test(texts.join(' ')) && n <= 2) return;
    const cells = {}; cols.forEach((c) => { const v = r[c.src]; if (v !== '' && v != null) cells[c.id] = c.type === 'text' ? String(v) : num(v) ?? String(v); });
    out.push({ id: uid(), kind: 'item', cells });
  });
  let total = null;
  rows.forEach((r) => r.forEach((v) => { const m = String(v ?? '').match(/(?:max|m[áa]ximo|or[çc]amento|budget)\D{0,8}(\d[\d.,\s]*)/i); if (m && total == null) total = num(m[1]); }));
  cols.forEach((c) => delete c.src);
  return { cols, rows: out, total };
}

async function exportXlsx(b, total, name, feePct = 0) {
  const ExcelJS = await loadExcel();
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Orçamento');
  ws.columns = b.cols.map((c) => ({ header: c.name, key: c.id, width: c.type === 'text' ? 30 : 14 }));
  ws.getRow(1).font = { bold: true };
  const { tot, sec } = sums(b);
  b.rows.forEach((r) => {
    if (r.kind === 'section') { const row = ws.addRow({}); row.getCell(1).value = r.title; row.font = { bold: true }; b.cols.forEach((c, i) => { if (c.type !== 'text' && sec[r.id]?.[c.id] != null) row.getCell(i + 1).value = sec[r.id][c.id]; }); return; }
    const o = {}; b.cols.forEach((c) => { const v = r.cells?.[c.id]; o[c.id] = c.type === 'text' ? v || '' : num(v) ?? (v || ''); }); ws.addRow(o);
  });
  ws.addRow({});
  const t = ws.addRow({}); t.getCell(1).value = 'Total'; t.font = { bold: true }; b.cols.forEach((c, i) => { if (c.type !== 'text') t.getCell(i + 1).value = tot[c.id]; });
  const fi = b.cols.findIndex((c) => c.id === b.main); const fee = feePct && fi >= 0 ? (tot[b.main] || 0) * feePct / 100 : 0;
  if (fee) { const f = ws.addRow({}); f.getCell(1).value = `Grain fee (${feePct} %)`; f.getCell(fi + 1).value = fee; const ft = ws.addRow({}); ft.getCell(1).value = 'Total com Grain fee'; ft.font = { bold: true }; ft.getCell(fi + 1).value = (tot[b.main] || 0) + fee; }
  if (total != null) {
    const i = b.cols.findIndex((c) => c.id === b.main);
    const g = ws.addRow({}); g.getCell(1).value = 'Orçamento geral'; if (i >= 0) g.getCell(i + 1).value = total;
    const d = ws.addRow({}); d.getCell(1).value = 'Diferença'; if (i >= 0) d.getCell(i + 1).value = total - (tot[b.main] || 0) - fee;
  }
  b.cols.forEach((c, i) => { if (c.type === 'money') ws.getColumn(i + 1).numFmt = '#,##0.00 "€"'; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `${(name || 'Projeto').replace(/[\\/:*?"<>|]+/g, ' ').trim()} - orcamento.xlsx`; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// Orçamento como ferramenta: um orçamento próprio para um departamento (ex.: Arte), guardado na ferramenta.
// Fica visível para quem tem acesso ao projeto; o orçamento geral continua protegido à parte.
export function budgetTool(box, p, tool) {
  let at = tool.updated_at || null;
  const q = {
    id: p.id, name: `${p.name} — ${tool.title}`, kind: tool.data?.tpl || 'simple',
    budget: tool.data?.budget || null, value: tool.data?.value ?? null,
    _capLabel: `Limite para ${tool.title}`,
    _store: async (patch) => {
      const data = { ...(tool.data || {}), ...patch };
      const now = new Date().toISOString();
      let qb = sb.from('boards').update({ data, updated_at: now }).eq('id', tool.id);
      if (at) qb = qb.eq('updated_at', at);
      const { data: rows, error } = await qb.select('updated_at');
      if (error) { toast('Não foi possível guardar: ' + error.message); return false; }
      if (!rows?.length) return 'conflict';
      at = rows[0].updated_at; tool.data = data; return true;
    },
  };
  box.innerHTML = '<div class="budget-wrap" data-b></div>';
  return budgetPage(box.querySelector('[data-b]'), q);
}
