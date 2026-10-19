import { sb, esc, toast, modal, ICON, saveLater } from './lib.js';
import { budgetSheet, makeSheet, isFormula, show } from './formula.js';

// Blocos extra da visão geral (só no Studio): notas e ferramentas "coladas" (orçamento, tabelas, folhas de serviço…).
// Guardados em projects.layouts.overview.extra = [{ id, kind: 'note'|'budget'|'tool', text?, ref?, title?, pos? }].
// Copiar: no orçamento ou numa ferramenta, "Copiar para a visão geral" guarda o que foi copiado; na visão geral cola-se
// com o botão "Colar" da barra da direita ou com Ctrl+V.

const CLIP = 'portal-clip';
export function copyToOverview(p, item) {
  try { localStorage.setItem(CLIP, JSON.stringify({ ...item, project: p.id, at: Date.now() })); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent('portal-clip'));
  toast(`"${item.title}" copiado. Vai à Visão geral e cola com Ctrl+V ou com o botão Colar.`, 5000);
}
export function readClip(p) {
  try { const c = JSON.parse(localStorage.getItem(CLIP) || 'null'); return c && c.project === p.id ? c : null; } catch { return null; }
}
export const uid = () => Math.random().toString(36).slice(2, 10);

const eur = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const nf = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 });
const head = (title, href, sub = '') => `<div class="row between"><h2 class="h3">${esc(title)}</h2>${href ? `<a class="small" href="${href}">Abrir</a>` : ''}</div>${sub ? `<p class="muted small ovx-sub">${sub}</p>` : ''}`;

// orçamento (do projeto ou de uma ferramenta Orçamento): descrição e valor, com secções, subtotais e total
function budgetHtml(b, cap) {
  if (!b?.cols?.length) return '<p class="muted small">Ainda não há orçamento.</p>';
  const S = budgetSheet(b);
  const main = b.cols.find((c) => c.id === b.main) || b.cols.find((c) => c.type === 'money');
  const txt = b.cols.find((c) => c.type === 'text');
  const val = (r, c) => { const v = S.value(r, c.id); return typeof v === 'number' ? v : null; };
  let total = 0; const secs = new Map(); let cur = null;
  b.rows.forEach((r) => { if (r.kind === 'section') { cur = r.id; secs.set(cur, 0); return; } const n = main ? val(r, main) || 0 : 0; total += n; if (cur) secs.set(cur, secs.get(cur) + n); });
  const rows = b.rows.slice(0, 40);
  return `<table class="ovx-table"><tbody>${rows.map((r) => r.kind === 'section'
    ? `<tr class="sec"><td>${esc(r.title || 'Secção')}</td><td class="num">${main ? eur.format(secs.get(r.id) || 0) : ''}</td></tr>`
    : `<tr><td>${esc(txt ? (isFormula(r.cells?.[txt.id]) ? show(S.value(r, txt.id)) : r.cells?.[txt.id] || '') : '')}</td><td class="num">${main && val(r, main) != null ? eur.format(val(r, main)) : ''}</td></tr>`).join('')}
    ${b.rows.length > rows.length ? `<tr><td class="muted small" colspan="2">e mais ${b.rows.length - rows.length} linhas…</td></tr>` : ''}</tbody>
    <tfoot><tr><td><strong>Total</strong></td><td class="num"><strong>${eur.format(total)}</strong></td></tr>${cap != null ? `<tr class="${total > cap ? 'over' : ''}"><td class="muted">Orçamento geral</td><td class="num">${eur.format(cap)}</td></tr>` : ''}</tfoot></table>`;
}
// tabela: as primeiras linhas, com as fórmulas já calculadas
function tableHtml(d) {
  const cols = d?.columns || [], rows = d?.rows || [];
  if (!cols.length) return '<p class="muted small">Tabela vazia.</p>';
  const S = makeSheet({ rows: rows.length, cols: cols.length, raw: (r, c) => { const col = cols[c]; const v = rows[r]?.cells?.[col.id]; return col.type === 'check' ? !!v : v; } });
  const cell = (r, c, ri, ci) => { const v = r.cells?.[c.id]; if (c.type === 'check') return v ? '✓' : ''; if (isFormula(v)) return show(S.value(ri, ci)); if (c.type === 'date' && v) return new Date(v + 'T00:00:00').toLocaleDateString('pt-PT'); return v ?? ''; };
  const list = rows.slice(0, 15);
  return `<div class="ovx-scroll"><table class="ovx-table grid"><thead><tr>${cols.map((c) => `<th>${esc(c.name)}</th>`).join('')}</tr></thead><tbody>${list.map((r, ri) => `<tr>${cols.map((c, ci) => `<td class="${c.type === 'number' ? 'num' : ''}">${esc(String(cell(r, c, ri, ci)))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    ${rows.length > list.length ? `<p class="muted small">e mais ${rows.length - list.length} linhas…</p>` : ''}`;
}
function callsheetHtml(d) {
  const sheets = d?.sheets || (d?.rows ? [d] : []);
  if (!sheets.length) return '<p class="muted small">Ainda sem dias.</p>';
  return `<ul class="ovx-list">${sheets.map((sh, i) => `<li><b>Dia ${esc(sh.day || i + 1)}</b><span class="muted small">${sh.date ? new Date(sh.date + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' }) : 'sem data'}${sh.place ? ` · ${esc(sh.place)}` : ''}${sh.call ? ` · call ${esc(sh.call)}` : ''}</span><span class="muted small">${(sh.rows || []).filter((r) => r.kind !== 'band').length} planos</span></li>`).join('')}</ul>`;
}
function timelineHtml(d) {
  const items = (d?.items || []).filter((x) => x.start).sort((a, b) => a.start.localeCompare(b.start));
  if (!items.length) return '<p class="muted small">Sem datas marcadas.</p>';
  return `<ul class="ovx-list">${items.slice(0, 12).map((x) => `<li><i class="dot" style="background:${esc(x.color || '#8A8A99')}"></i><span>${esc(x.name || 'Data')}</span><span class="muted small">${new Date(x.start + 'T00:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}</span></li>`).join('')}</ul>`;
}

// desenha um bloco extra dentro de el; save(item) guarda as mudanças (notas)
export async function renderExtra(el, p, item, base, save) {
  if (item.kind === 'note') {
    el.innerHTML = `<section class="panel ovx-note"><input class="ovx-title" value="${esc(item.title || '')}" placeholder="Nota" aria-label="Título da nota"><textarea rows="4" placeholder="Escreve aqui: lembretes, links, decisões…" aria-label="Nota">${esc(item.text || '')}</textarea></section>`;
    const ta = el.querySelector('textarea'), ti = el.querySelector('.ovx-title');
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.max(90, ta.scrollHeight) + 'px'; };
    requestAnimationFrame(fit);
    const later = saveLater(() => save(), 700);
    ta.addEventListener('input', () => { item.text = ta.value; fit(); later(); });
    ti.addEventListener('input', () => { item.title = ti.value; later(); });
    return;
  }
  if (item.kind === 'budget') {
    if (!p.canBudget) { el.innerHTML = `<section class="panel">${head(item.title || 'Orçamento')}<p class="muted small">Só quem tem acesso ao orçamento vê este bloco.</p></section>`; return; }
    el.innerHTML = `<section class="panel ovx">${head(p.budget?.title || item.title || 'Orçamento', `${base}/orcamento`)}${budgetHtml(p.budget, p.value != null ? Number(p.value) : null)}</section>`;
    return;
  }
  if (item.kind === 'tool') {
    el.innerHTML = `<section class="panel ovx">${head(item.title || 'Ferramenta')}<p class="muted small">A carregar…</p></section>`;
    const { data: b } = await sb.from('boards').select('id, title, kind, data').eq('id', item.ref).maybeSingle();
    if (!b) { el.innerHTML = `<section class="panel">${head(item.title || 'Ferramenta')}<p class="muted small">Esta ferramenta já não existe. Podes tirar o bloco.</p></section>`; return; }
    const href = `${base}/${b.kind === 'board' ? 'b' : 'f'}/${b.id}`;
    let body;
    if (b.kind === 'table') body = tableHtml(b.data);
    else if (b.kind === 'budget') body = budgetHtml(b.data?.budget, b.data?.value ?? null);
    else if (b.kind === 'callsheet') body = callsheetHtml(b.data);
    else if (b.kind === 'timeline') body = timelineHtml(b.data);
    else body = `<p class="muted small">Abre a ferramenta para a veres inteira.</p><a class="btn ghost sm" href="${href}">${ICON.open} Abrir ${esc(b.title)}</a>`;
    el.innerHTML = `<section class="panel ovx">${head(b.title, href)}${body}</section>`;
  }
}

// escolher o que juntar: o orçamento do projeto ou uma das ferramentas
export function pickTool(p, onPick) {
  const tools = (p._boards || []).filter((b) => !b.parent_id && !['mkt', 'wrd', 'lightmap'].includes(b.kind));
  const opts = [...(p.canBudget ? [{ kind: 'budget', title: p.budget?.title || 'Orçamento', icon: ICON.money }] : []), ...tools.map((b) => ({ kind: 'tool', ref: b.id, title: b.title, icon: ICON[b.kind === 'table' ? 'list' : b.kind === 'budget' ? 'money' : b.kind === 'callsheet' ? 'calendar' : b.kind === 'timeline' ? 'calendar' : 'board'] || ICON.board }))];
  const m = modal(`<h2>Juntar à visão geral</h2><p class="muted small">Escolhe o que queres ver aqui. Atualiza-se sozinho quando mudares o original.</p>
    ${opts.length ? `<div class="ovx-pick">${opts.map((o, i) => `<button type="button" data-i="${i}">${o.icon}<span>${esc(o.title)}</span></button>`).join('')}</div>` : '<p class="muted">Ainda não há ferramentas neste projeto.</p>'}
    <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button></div>`, { wide: true });
  m.el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => { m.close(); const o = opts[+b.dataset.i]; onPick({ kind: o.kind, ref: o.ref, title: o.title }); }));
}
