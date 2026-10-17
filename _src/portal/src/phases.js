import { sb, esc, toast, modal, phaseOf, ICON } from './lib.js';

// Fases do projeto: Pré-produção, Produção e Pós-produção. O seletor em cima do banner mostra só as páginas e
// ferramentas dessa fase (no menu do lado e na visão geral). Cada página/ferramenta tem fases por defeito e a equipa
// pode mudá-las ("Organizar fases"), guardado em projects.layouts.phases = { 'mod:guiao': ['pre'], 'tool:<id>': [...] }.
// A fase escolhida fica guardada só neste navegador, por projeto.

export const PHASES = [['pre', 'Pré-produção'], ['prod', 'Produção'], ['pos', 'Pós-produção']];
// a ficção tem uma quarta etapa: Distribuição (festivais, mostras, salas)
export const hasDist = (kind) => kind === 'ficcao';
export const phasesFor = (p) => (hasDist(p?.kind) ? [...PHASES, ['dist', 'Distribuição']] : PHASES);
export const stageOptions = (kind) => (hasDist(kind) ? [...PHASES, ['dist', 'Distribuição']] : PHASES);
const ALL = ['pre', 'prod', 'pos'];
// Tudo o que existia até 17 out 2026 é de pré-produção (as ferramentas de produção e pós-produção vêm a seguir).
const PRE = ['pre'];
const MOD_DEF = {};
const KIND_DEF = {};

export const modKey = (k) => `mod:${k}`;
export const toolKey = (b) => `tool:${b.id}`;
const defOf = (key, kind) => (key.startsWith('mod:') ? MOD_DEF[key.slice(4)] || PRE : KIND_DEF[kind] || PRE);
export function phasesOf(p, key, kind) {
  const o = p.layouts?.phases?.[key];
  return Array.isArray(o) ? o : defOf(key, kind);
}
const LS = (p) => `portal-phase:${p.id}`;
export function selPhase(p) { try { const v = localStorage.getItem(LS(p)); return phasesFor(p).some(([k]) => k === v) ? v : 'all'; } catch { return 'all'; } }
export function setSelPhase(p, v) { try { if (v === 'all') localStorage.removeItem(LS(p)); else localStorage.setItem(LS(p), v); } catch { /* sem memória do navegador */ } }
export const shows = (p, key, kind) => { const s = selPhase(p); return s === 'all' || phasesOf(p, key, kind).includes(s); };
export const phaseLabel = (k) => [...PHASES, ['dist', 'Distribuição']].find(([x]) => x === k)?.[1] || 'Tudo';

// fase em que o projeto está agora: a que foi escolhida (projects.stage) ou, sem isso, pelas datas do projeto
export function currentPhase(p) {
  if (p.stage && phasesFor(p).some(([k]) => k === p.stage)) return p.stage;
  const l = phaseOf(p).label;
  return l === 'Pré-produção' ? 'pre' : l === 'Produção' ? 'prod' : l.startsWith('Pós-produção') ? 'pos' : null;
}

// a fase que se está a ver ainda não chegou? (fase escolhida depois da fase atual do projeto)
function curIndex(p) {
  const list = phasesFor(p); const cur = currentPhase(p);
  if (cur) return list.findIndex(([k]) => k === cur);
  return p.starts_on && p.ends_on && phaseOf(p).pct >= 1 ? list.findIndex(([k]) => k === 'pos') : 0; // sem datas ou ainda não começou: pré-produção
}
export function aheadOf(p) {
  const s = selPhase(p); if (s === 'all') return null;
  const list = phasesFor(p); const i = list.findIndex(([k]) => k === s); const ci = curIndex(p);
  return i > ci ? { sel: s, cur: list[ci]?.[0] || 'pre' } : null;
}
export function aheadNotice(p) {
  const a = aheadOf(p); if (!a) return '';
  return `<section class="ahead-note" role="status"><div class="an-ic">${ICON.lock || ''}</div><div class="an-t">
      <h2>O projeto ainda não se encontra em ${esc(phaseLabel(a.sel).toLowerCase())}.</h2>
      <p class="muted">Neste momento está em <b>${esc(phaseLabel(a.cur).toLowerCase())}</b>. Quando chegar a esta etapa, as ferramentas de ${esc(phaseLabel(a.sel).toLowerCase())} aparecem aqui.</p>
      <div class="row wrap-gap"><button type="button" class="btn ghost" data-ahead-go="${a.cur}">Ver ${esc(phaseLabel(a.cur).toLowerCase())}</button>${p.canEdit !== false ? `<button type="button" class="btn primary" data-ahead-set="${a.sel}">Passar o projeto para ${esc(phaseLabel(a.sel).toLowerCase())}</button>` : ''}</div>
    </div></section>`;
}
export function bindAhead(root, p, onChange, onPhase) {
  root.querySelectorAll('[data-ahead-go]').forEach((b) => b.addEventListener('click', () => { setSelPhase(p, b.dataset.aheadGo); (onPhase || onChange)(); }));
  root.querySelectorAll('[data-ahead-set]').forEach((b) => b.addEventListener('click', async () => {
    const stage = b.dataset.aheadSet;
    const { error } = await sb.from('projects').update({ stage }).eq('id', p.id);
    if (error) return toast(error.message);
    p.stage = stage; toast(`O projeto passou para ${phaseLabel(stage).toLowerCase()}.`); onChange();
  }));
}

// barra do projeto, por baixo do cabeçalho em todas as páginas do projeto: nome + etapas como barra de progresso
const SPAN = { pre: [0, 1 / 3], prod: [1 / 3, 2 / 3], pos: [2 / 3, 1] };
export function projectStrip(p, base, extra = '') {
  const s = selPhase(p); const cur = currentPhase(p); const pct = phaseOf(p).pct || 0; const hasDates = !!(p.starts_on && p.ends_on);
  const list = phasesFor(p); const ci = list.findIndex(([k]) => k === cur);
  // com a fase escolhida: as anteriores ficam feitas, a atual a meio (ou pelas datas), as seguintes vazias
  const fill = (k) => {
    if (p.stage && ci >= 0) { const i = list.findIndex(([x]) => x === k); if (i < ci) return 1; if (i > ci) return 0; if (hasDates && SPAN[k]) { const [a, b] = SPAN[k]; return Math.max(0.08, Math.min(0.95, (pct - a) / (b - a))); } return 0.5; }
    if (!hasDates || !SPAN[k]) return 0; const [a, b] = SPAN[k]; return Math.max(0, Math.min(1, (pct - a) / (b - a)));
  };
  return `<div class="proj-strip" role="navigation" aria-label="Etapas do projeto"><div class="ps-in">
    <div class="ps-head"><a class="ps-name" href="${base}" title="Visão geral">${esc(p.name)}</a>${extra}</div>
    <div class="ps-steps" role="tablist" style="--n:${list.length}">${list.map(([k, l], i) => { const f = fill(k); return `<button type="button" role="tab" class="ps-step ${k === cur ? 'now' : ''} ${f >= 1 ? 'done' : ''}" aria-selected="${s === k}" data-phase="${k}" title="${s === k ? 'Ver todas as fases' : `Ver só ${esc(l.toLowerCase())}`}">
        <span class="ps-l"><span class="ps-n">${f >= 1 ? '✓' : i + 1}</span>${esc(l)}${k === cur ? '<i class="phase-now" title="O projeto está nesta fase"></i>' : ''}</span>
        <span class="ps-bar"><i style="width:${Math.round(f * 100)}%"></i></span></button>`; }).join('')}</div>
    <div class="ps-r">${s !== 'all' ? '<button type="button" class="link-btn small" data-phase="all">Ver tudo</button>' : ''}${p.canEdit !== false ? `<label class="ps-stage" title="Em que fase o projeto está"><span>Está em</span><select data-stage aria-label="Fase atual do projeto"><option value="">${p.stage ? 'Pelas datas' : (cur ? `${esc(phaseLabel(cur))} (datas)` : 'Pelas datas')}</option>${list.map(([k, l]) => `<option value="${k}" ${p.stage === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label><button type="button" class="link-btn small" data-phaseorg>Organizar fases</button>` : ''}</div>
  </div></div>`;
}
export function bindStrip(root, p, { onChange, onPhase, items }) {
  root.querySelectorAll('.proj-strip [data-phase]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.phase; setSelPhase(p, k !== 'all' && selPhase(p) === k ? 'all' : k); (onPhase || onChange)(); }));
  root.querySelector('.proj-strip [data-phaseorg]')?.addEventListener('click', () => organizePhases(p, items(), onChange));
  root.querySelector('.proj-strip [data-stage]')?.addEventListener('change', async (e) => {
    const stage = e.target.value || null;
    const { error } = await sb.from('projects').update({ stage }).eq('id', p.id);
    if (error) return toast(error.message);
    p.stage = stage; toast(stage ? `O projeto está em ${phaseLabel(stage).toLowerCase()}.` : 'A fase passa a vir das datas do projeto.'); onChange();
  });
}

export function phaseBar(p) {
  const s = selPhase(p); const cur = currentPhase(p);
  return `<nav class="phase-bar" aria-label="Fases do projeto">
    <div class="phase-seg" role="tablist">${[['all', 'Tudo'], ...PHASES].map(([k, l]) => `<button type="button" role="tab" aria-selected="${s === k}" data-phase="${k}">${esc(l)}${k === cur ? '<i class="phase-now" title="O projeto está nesta fase"></i>' : ''}</button>`).join('')}</div>
    <button type="button" class="link-btn small phase-org" data-phaseorg>Organizar fases</button>
  </nav>`;
}
export function bindPhaseBar(root, p, { onChange, items }) {
  root.querySelectorAll('[data-phase]').forEach((b) => b.addEventListener('click', () => { setSelPhase(p, b.dataset.phase); onChange(); }));
  root.querySelector('[data-phaseorg]')?.addEventListener('click', () => organizePhases(p, items(), onChange));
}

// items: [{ key, label, kind, group }]
export function organizePhases(p, items, after) {
  const cur = Object.fromEntries(items.map((it) => [it.key, [...phasesOf(p, it.key, it.kind)]]));
  const groups = [...new Set(items.map((it) => it.group))];
  const m = modal(`<h2>Organizar fases</h2><p class="muted small">Escolhe em que fases aparece cada página e ferramenta. Vale para toda a equipa.</p>
    <div class="phase-org-t" style="--n:${phasesFor(p).length}"><div class="pot-h"><span></span>${phasesFor(p).map(([, l]) => `<span>${esc(l)}</span>`).join('')}</div>
    ${groups.map((g) => `<p class="pot-g">${esc(g)}</p>${items.filter((it) => it.group === g).map((it) => `<div class="pot-r" data-key="${esc(it.key)}"><span>${esc(it.label)}</span>${phasesFor(p).map(([k]) => `<label><input type="checkbox" value="${k}" ${cur[it.key].includes(k) ? 'checked' : ''} aria-label="${esc(it.label)} em ${esc(phaseLabel(k))}"></label>`).join('')}</div>`).join('')}`).join('')}</div>
    <div class="row between wrap-gap"><button type="button" class="link-btn small" data-reset>Repor o que vem por defeito</button><div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-save>Guardar</button></div></div>`, { wide: true });
  m.el.querySelector('[data-reset]').addEventListener('click', async () => { await save(p, null); m.close(); after(); });
  m.el.querySelector('[data-save]').addEventListener('click', async () => {
    const phases = { ...(p.layouts?.phases || {}) };
    m.el.querySelectorAll('[data-key]').forEach((r) => {
      const it = items.find((x) => x.key === r.dataset.key); const v = [...r.querySelectorAll('input:checked')].map((i) => i.value);
      const val = v.length ? v : ALL; // só se guarda o que é diferente do que vem por defeito
      if (val.join() === defOf(it.key, it.kind).join()) delete phases[it.key]; else phases[it.key] = val;
    });
    if (await save(p, phases)) { m.close(); toast('Fases guardadas.'); after(); }
  });
}
export async function setToolPhase(p, boardId, phase) {
  const phases = { ...(p.layouts?.phases || {}), [`tool:${boardId}`]: [phase] };
  return save(p, phases);
}
async function save(p, phases) {
  const layouts = { ...(p.layouts || {}) };
  if (phases) layouts.phases = phases; else delete layouts.phases;
  const { error } = await sb.from('projects').update({ layouts }).eq('id', p.id);
  if (error) { toast('Não foi possível guardar: ' + error.message); return false; }
  p.layouts = layouts; return true;
}
