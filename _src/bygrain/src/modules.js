import { sb, esc, toast, modal, ICON, KINDS } from './lib.js';

// Páginas de um projeto ("módulos"). Visão geral, Equipa e Detalhes existem sempre; o resto junta-se
// quando faz falta. Os modelos por tipo de projeto já trazem as páginas habituais, e as páginas
// aparecem sozinhas quando o projeto passa a ter dados para elas (ex.: um décor numa secção do seguimento
// cria a página Décors). Guardado em projects.modules = { list: [...], removed: [...] }.

export const MODULES = {
  orcamento: { label: 'Orçamento', icon: 'money', desc: 'Tabela de custos por secções, comparada com o orçamento geral. Só aparece a quem tem acesso.' },
  seguimento: { label: 'Seguimento', icon: 'music', desc: 'Parte a música ou o filme em secções, cada uma com décors, atores, figurantes e planos. Pre-vis e música no topo.' },
  guiao: { label: 'Guião', icon: 'note', desc: 'Importa o guião (PDF, Final Draft, Fountain) e separa cenas, personagens e décors sozinho.' },
  cenas: { label: 'Cenas', icon: 'list', desc: 'Breakdown cena a cena, com planos, tarefas e notas.' },
  elenco: { label: 'Atores e figurantes', scriptLabel: 'Personagens', icon: 'team', desc: 'Uma página por pessoa: papel, contacto, notas e onde aparece.' },
  decors: { label: 'Décors', icon: 'home', desc: 'Uma página por local: morada, notas, fotos e onde aparece.' },
  storyboard: { label: 'Storyboard', icon: 'image', desc: 'Todos os planos do projeto, por ordem.' },
  shotlist: { label: 'Shotlist', icon: 'list', desc: 'Todos os planos numa tabela rápida, em grupos coloridos, com notas de direção e técnicas. Exporta para PDF.' },
  planificacao: { label: 'Planificação', icon: 'board', desc: 'Lista de planos para a rodagem.' },
  equipamento: { label: 'Equipamento', icon: 'camera', desc: 'Câmaras, objetivas, luzes, frames, maquinaria e elétrico do projeto, com especificações, quantidades e rental. Os mapas de luz usam esta lista.' },
  aderecos: { label: 'Adereços', icon: 'prop', desc: 'Lista e grelha de adereços com fotos, estado, custo, fornecedor e pacotes de aluguer.' },
  tarefas: { label: 'Tarefas', icon: 'task', desc: 'Tarefas do projeto, por pessoa e departamento.' },
};
// ordem no menu
export const ORDER = ['orcamento', 'seguimento', 'guiao', 'cenas', 'elenco', 'decors', 'storyboard', 'shotlist', 'planificacao', 'equipamento', 'aderecos', 'tarefas'];
// o seguimento e as cenas usam a mesma lista de secções/cenas: um projeto usa um ou outro
const SCRIPT = ['guiao', 'cenas', 'planificacao'];

export const TEMPLATES = {
  videoclipe: ['orcamento', 'seguimento', 'elenco', 'decors', 'storyboard', 'shotlist', 'equipamento', 'aderecos', 'tarefas'],
  ficcao: ['orcamento', 'guiao', 'cenas', 'elenco', 'decors', 'storyboard', 'planificacao', 'equipamento', 'aderecos', 'tarefas'],
  campanha: ['orcamento', 'seguimento', 'elenco', 'decors', 'storyboard', 'shotlist', 'equipamento', 'aderecos', 'tarefas'],
  branded: ['orcamento', 'seguimento', 'decors', 'shotlist', 'equipamento', 'aderecos', 'tarefas'],
  documentario: ['orcamento', 'elenco', 'decors', 'equipamento', 'tarefas'],
  album: ['orcamento', 'tarefas'],
  default: ['orcamento', 'tarefas'],
};

const state = (p) => {
  const m = p.modules;
  if (m && Array.isArray(m.list)) return { list: m.list, removed: m.removed || [] };
  return { list: TEMPLATES[p.kind] || TEMPLATES.default, removed: [] };
};
// as Cenas só existem depois de importar um guião (p._hasScript vem do carregamento do projeto)
export const modulesOf = (p) => (p.is_central ? [] : ORDER.filter((k) => state(p).list.includes(k) && (k !== 'cenas' || p._hasScript)));
export const hasMod = (p, k) => modulesOf(p).includes(k);
export const scriptMode = (p) => SCRIPT.some((k) => hasMod(p, k));
export const modLabel = (p, k) => (k === 'elenco' && scriptMode(p) ? MODULES.elenco.scriptLabel : MODULES[k].label);
// endereço da página (as personagens da ficção usam "personagens")
export const modPath = (p, k) => (k === 'elenco' && scriptMode(p) ? 'personagens' : k);

async function persist(p, list, removed) {
  const modules = { list: ORDER.filter((k) => list.includes(k)), removed: [...new Set(removed)] };
  const { error } = await sb.from('projects').update({ modules }).eq('id', p.id);
  if (error) { toast('Não foi possível guardar as páginas: ' + error.message); return false; }
  p.modules = modules;
  window.dispatchEvent(new CustomEvent('bg-modules', { detail: { projectId: p.id } }));
  return true;
}

// junta páginas porque passou a haver dados para elas. user=true quando foi a pessoa que fez a ação
export async function ensureModules(p, keys, { user = true, quiet = false } = {}) {
  if (p.is_central) return;
  const s = state(p);
  const add = keys.filter((k) => MODULES[k] && !s.list.includes(k) && (user || !s.removed.includes(k)))
    .filter((k) => !(k === 'seguimento' && SCRIPT.some((x) => s.list.includes(x))) && !(SCRIPT.includes(k) && s.list.includes('seguimento')));
  if (!add.length) return;
  if (await persist(p, [...s.list, ...add], s.removed.filter((k) => !add.includes(k))) && !quiet) {
    toast(`${add.length === 1 ? 'Página criada' : 'Páginas criadas'}: ${add.map((k) => modLabel(p, k)).join(', ')}.`);
  }
}

// ao abrir o projeto: se já há dados de um tipo e a página não existe (nem foi tirada à mão), junta-a
export async function autoModules(p) {
  if (p.is_central) return;
  const c = async (t, extra) => { let q = sb.from(t).select('id', { count: 'exact', head: true }).eq('project_id', p.id); if (extra) q = extra(q); const { count } = await q; return count || 0; };
  const [loc, ch, sh, pr, sc, ge] = await Promise.all([c('locations'), c('characters'), c('shots'), c('props', (q) => q.eq('removed', false)), c('scenes'), c('gear')]);
  const want = [];
  if (loc) want.push('decors'); if (ch) want.push('elenco'); if (sh) want.push('storyboard', ...(scriptMode(p) ? [] : ['shotlist'])); if (pr) want.push('aderecos'); if (ge) want.push('equipamento');
  if (sc && !hasMod(p, 'seguimento') && !hasMod(p, 'cenas')) want.push(scriptMode(p) ? 'cenas' : 'seguimento');
  if (want.length) await ensureModules(p, want, { user: false });
}

// "+" ao lado do nome do projeto
export function modulesModal(p) {
  const draw = (m) => {
    const s = state(p);
    m.el.querySelector('[data-mods]').innerHTML = ORDER.map((k) => {
      const on = s.list.includes(k);
      const noScript = k === 'cenas' && !p._hasScript;
      const clash = noScript || (!on && ((k === 'seguimento' && SCRIPT.some((x) => s.list.includes(x))) || (SCRIPT.includes(k) && s.list.includes('seguimento'))));
      return `<div class="mod-card ${on ? 'on' : ''}">
        <span class="mod-ic">${ICON[MODULES[k].icon] || ''}</span>
        <span class="mod-t"><strong>${esc(modLabel(p, k))}</strong><small>${esc(noScript ? 'Fica disponível depois de importares um guião. Junta a página Guião e importa-o: as cenas aparecem sozinhas.' : clash ? (k === 'seguimento' ? 'Este projeto usa cenas de guião. Tira Guião, Cenas e Planificação para usar o seguimento.' : 'Este projeto usa o seguimento. Tira-o para trabalhar com guião e cenas.') : MODULES[k].desc)}</small></span>
        ${noScript ? '<span class="perm-tag">Precisa de guião</span>' : on ? `<button type="button" class="btn ghost" data-off="${k}">Tirar</button>` : `<button type="button" class="btn ${clash ? 'ghost' : 'primary'}" data-on="${k}" ${clash ? 'disabled' : ''}>${ICON.plus} Juntar</button>`}
      </div>`;
    }).join('');
    m.el.querySelectorAll('[data-on]').forEach((b) => b.addEventListener('click', async () => { await ensureModules(p, [b.dataset.on], { quiet: true }); draw(m); }));
    m.el.querySelectorAll('[data-off]').forEach((b) => b.addEventListener('click', async () => { const s2 = state(p); await persist(p, s2.list.filter((k) => k !== b.dataset.off), [...s2.removed, b.dataset.off]); draw(m); }));
  };
  const m = modal(`<h2>Páginas do projeto</h2><p class="muted small">Visão geral, Equipa e Detalhes existem sempre. Tirar uma página só a esconde do menu: o que lá estava não se perde.</p>
    <div class="mod-list" data-mods></div>
    <div class="row between wrap-gap"><button type="button" class="link-btn small" data-tpl>Repor o modelo de ${esc((KINDS[p.kind] || p.kind).toLowerCase())}</button><button type="button" class="btn primary" data-close>Feito</button></div>`, { wide: true });
  m.el.querySelector('[data-tpl]').addEventListener('click', async () => { await persist(p, TEMPLATES[p.kind] || TEMPLATES.default, []); draw(m); });
  draw(m);
}
