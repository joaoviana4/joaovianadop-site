import { sb, esc, toast, modal, phaseOf } from './lib.js';

// Fases do projeto: Pré-produção, Produção e Pós-produção. O seletor em cima do banner mostra só as páginas e
// ferramentas dessa fase (no menu do lado e na visão geral). Cada página/ferramenta tem fases por defeito e a equipa
// pode mudá-las ("Organizar fases"), guardado em projects.layouts.phases = { 'mod:guiao': ['pre'], 'tool:<id>': [...] }.
// A fase escolhida fica guardada só neste navegador, por projeto.

export const PHASES = [['pre', 'Pré-produção'], ['prod', 'Produção'], ['pos', 'Pós-produção']];
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
export function selPhase(p) { try { const v = localStorage.getItem(LS(p)); return PHASES.some(([k]) => k === v) ? v : 'all'; } catch { return 'all'; } }
export function setSelPhase(p, v) { try { if (v === 'all') localStorage.removeItem(LS(p)); else localStorage.setItem(LS(p), v); } catch { /* sem memória do navegador */ } }
export const shows = (p, key, kind) => { const s = selPhase(p); return s === 'all' || phasesOf(p, key, kind).includes(s); };
export const phaseLabel = (k) => PHASES.find(([x]) => x === k)?.[1] || 'Tudo';

// fase em que o projeto está agora (pelas datas do projeto)
export function currentPhase(p) {
  const l = phaseOf(p).label;
  return l === 'Pré-produção' ? 'pre' : l === 'Produção' ? 'prod' : l.startsWith('Pós-produção') ? 'pos' : null;
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
    <div class="phase-org-t"><div class="pot-h"><span></span>${PHASES.map(([, l]) => `<span>${esc(l)}</span>`).join('')}</div>
    ${groups.map((g) => `<p class="pot-g">${esc(g)}</p>${items.filter((it) => it.group === g).map((it) => `<div class="pot-r" data-key="${esc(it.key)}"><span>${esc(it.label)}</span>${PHASES.map(([k]) => `<label><input type="checkbox" value="${k}" ${cur[it.key].includes(k) ? 'checked' : ''} aria-label="${esc(it.label)} em ${esc(phaseLabel(k))}"></label>`).join('')}</div>`).join('')}`).join('')}</div>
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
