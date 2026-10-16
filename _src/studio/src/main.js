import './style.css';
import { createClient } from '@supabase/supabase-js';
import { defaultBudget, BUDGET_TYPES, BUDGET_TEMPLATES, templateRows, parseMoney, money, cellShow, budgetSums, readBudgetFile, sheetToBudget, exportBudget } from './budget.js';

/* Ligação ao projeto BlackCat no Supabase: a mesma base de dados e as mesmas contas do Viewfinder e do Lighthouse.
   A chave publicável pode estar no código do site; o que protege os dados são as regras de acesso (RLS) de cada tabela. */
const SUPABASE_URL = 'https://cwdjpcebyhwcdwwwazev.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7s74joozp14m3UZpKwxiyw_erYpqlS_';
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------- utilidades ---------- */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const hex12 = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), b => b.toString(16).padStart(2, '0')).join('');
const f1 = n => Math.round(n * 10) / 10;
const pl = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const pd = s => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
const iso = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const addDays = (s, n) => { const d = pd(s); d.setDate(d.getDate() + n); return iso(d); };
const dayDiff = (a, b) => Math.round((pd(b) - pd(a)) / 864e5);
const dm = s => { const d = pd(s); return d.getDate() + ' ' + MES[d.getMonth()]; };
const today = () => iso(new Date());
const eighths = n => { if (!n) return '—'; const w = Math.floor(n / 8), r = n % 8; return (w ? w : '') + (r ? (w ? ' ' : '') + r + '/8' : '') || '1/8'; };
const initials = name => { const w = String(name).trim().split(/\s+/); return ((w[0] || '?')[0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase(); };

const MARK = '<svg class="mark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" stroke-width="4.4"/><path d="M5.5 26.5 26.5 5.5" stroke="currentColor" stroke-width="3.2"/></svg>';
const IC = {
  script:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M4 1.5h5.5L12.5 4.5v10h-8.5z"/><path d="M6.5 7.5h4M6.5 10h4M8 5h1.5"/></svg>',
  board:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="1.5" width="5.5" height="8" rx="1.5"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1.5"/><rect x="9" y="11.5" width="5.5" height="3" rx="1.2"/></svg>',
  table:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="11" rx="1.5"/><path d="M1.5 6.5h13M1.5 10h13M6 2.5v11"/></svg>',
  map:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="1.5" width="13" height="13" rx="1.5"/><circle cx="6" cy="9" r="1.8"/><path d="M10 4.5l2.5 1.5-2.5 1.5z" fill="currentColor"/></svg>',
  timeline:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M2 3.5h6M5 8h7M8 12.5h6"/></svg>',
  storyboard:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><rect x="1.5" y="3" width="6" height="4.2" rx="1"/><rect x="8.5" y="3" width="6" height="4.2" rx="1"/><rect x="1.5" y="9" width="6" height="4.2" rx="1"/><rect x="8.5" y="9" width="6" height="4.2" rx="1"/></svg>',
  char:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="8" cy="5.5" r="2.8"/><path d="M2.8 14c.6-2.9 2.7-4.4 5.2-4.4s4.6 1.5 5.2 4.4"/></svg>',
  place:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M2 14V6.5L8 2l6 4.5V14z"/><path d="M6.5 14v-4h3v4"/></svg>',
  team:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><circle cx="5.5" cy="6" r="2.2"/><circle cx="11" cy="6.5" r="1.8"/><path d="M1.5 13.5c.4-2.3 2-3.5 4-3.5s3.6 1.2 4 3.5M10 10.2c1.8 0 3.2 1 3.6 3.3"/></svg>',
  budget:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="8" cy="8" r="6.2"/><path d="M10.4 5.4a3.2 3.2 0 1 0 0 5.2M4.6 7.2h4.4M4.6 9h4.4"/></svg>',
  check:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="1.8" y="1.8" width="12.4" height="12.4" rx="3"/><path d="M4.8 8.2l2.2 2.2 4.2-4.6"/></svg>',
  prop:'<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M5 2.5h6l1 4H4z"/><path d="M8 6.5v5M5.5 13.5h5"/></svg>',
  caret:'<svg viewBox="0 0 10 10" width="10" height="10" aria-hidden="true"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
};
const TOOLS = {
  board:{label:'Board', desc:'Notas, imagens, paletas e listas, soltas no espaço.'},
  table:{label:'Tabela', desc:'Linhas e colunas à tua medida. Pode começar a partir do guião.'},
  map:{label:'Mapa de luz', desc:'Planta vista de cima: câmara, personagens, luzes e décor.'},
  timeline:{label:'Cronograma', desc:'Tarefas no tempo, por cima das três fases.'},
  storyboard:{label:'Storyboard', desc:'Quadros por cena, com as fotos do Viewfinder ao lado.'}
};
const TEMPLATES = {
  table:[['vazia','Em branco'],['aderecos','Adereços por cena'],['elenco','Elenco, a partir das personagens']],
  storyboard:[['cenas','Um quadro por cena'],['vazio','Em branco']],
  map:[['cena','Com as personagens da primeira cena'],['vazio','Em branco']],
  timeline:[['fases','Tarefas habituais de cada fase'],['vazio','Em branco']],
  board:[['vazio','Em branco']]
};
const PHASES = [['pre','Pré-produção'],['prod','Produção'],['pos','Pós-produção']];
const DEPTS = ['Realização','Produção','Imagem','Arte','Som','Distribuição'];
const FORMATS = ['Curta-metragem','Longa-metragem','Série'];
const KINDS = {
  fiction:{label:'Ficção', formats:['Curta-metragem','Longa-metragem','Série'], base:'Guião', unit:'Cena', units:'Cenas', person:'Personagem', people:'Personagens', place:'Décor', places:'Décors', docs:[]},
  ad:{label:'Publicidade', formats:['Spot','Branded content','Redes sociais'], base:'Projeto', unit:'Momento', units:'Momentos do spot', person:'Pessoa do casting', people:'Casting', place:'Local', places:'Locais', docs:[['brief','Brief'],['treatment','Tratamento'],['approvals','Aprovações']]},
  doc:{label:'Documentário', formats:['Curta-metragem','Longa-metragem','Série'], base:'Projeto', unit:'Sequência', units:'Sequências', person:'Protagonista', people:'Protagonistas', place:'Local', places:'Locais', docs:[['treatment','Tratamento'],['archive','Arquivo']]},
  music:{label:'Videoclipe', formats:[], base:'Projeto', unit:'Secção', units:'Seguimento', person:'Pessoa', people:'Elenco', place:'Décor', places:'Décors', docs:[['treatment','Tratamento']], times:true}
};
const KT = p => KINDS[(p && p.kind) || 'fiction'] || KINDS.fiction;
const tsec = v => { const m = String(v || '').trim().match(/^(?:(\d+):)?(\d{1,2})(?::(\d{1,2}))?$/); if (!m) return null; return m[3] != null ? (+m[1] || 0) * 3600 + +m[2] * 60 + +m[3] : (+m[1] || 0) * 60 + +m[2]; };
const tfmt = n => Math.floor(n / 60) + ':' + String(Math.round(n % 60)).padStart(2, '0');
const unitPlaces = s => s.places && s.places.length ? s.places : (s.place ? [s.place] : []);
const isExtra = (p, name) => !!(p.script && p.script.roles && p.script.roles[name] === 'extra');
const SEG_COL = ['#8e6cdb','#d6457a','#d9822b','#c9a227','#2fa37a','#4f8f9e','#7fae3a','#8a7563'];
const SONG_PARTS = ['Intro','Verso 1','Pré-refrão','Refrão','Verso 2','Refrão 2','Ponte','Refrão final','Outro'];
const SIZES = {PG:'Plano geral', PA:'Plano americano', PM:'Plano médio', GP:'Grande plano', PP:'Plano de pormenor'};
const CARD_W = {note:250, ref:270, palette:270, list:260, board:240};
const CARD_LABEL = {note:'Nota', ref:'Imagem', palette:'Paleta', list:'Lista', board:'Board'};
const CHAR_COLOURS = [0x0071e3, 0xd2691e, 0x1a9c6e, 0x9b51e0, 0xc4733b, 0x3e5a66, 0xb8336a, 0x6e6e73];

/* ---------- leitura do guião (Fountain, texto ou Final Draft .fdx) ---------- */
const HEAD = /^\s*(?:\d+[A-Z]?[.)]?\s+)?(?:\.(?=[A-ZÀ-Ý])|(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT)[.\s])/i;
function parseHeading(h){
  h = h.replace(/^\s*\d+[A-Z]?[.)]?\s+/, '').replace(/^\./, '').replace(/\s*#.*#\s*$/, '').trim().toUpperCase();
  const m = /^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT)\.?\s*/.exec(h);
  const ie = m ? (/\//.test(m[1]) ? 'INT/EXT' : m[1].replace('.', '')) : '—';
  const rest = m ? h.slice(m[0].length) : h;
  const parts = rest.split(/\s*[-–—]\s+(?=[A-ZÀ-Ý ]+$)|\s+[-–—]\s+/);
  const time = parts.length > 1 ? parts.pop().trim() : '';
  return {heading:h, ie, place:parts.join(' — ').trim() || 'SEM NOME', time};
}
function fdxToText(xml){
  const doc = new DOMParser().parseFromString(xml, 'application/xml'), out = [];
  doc.querySelectorAll('Paragraph').forEach(p => {
    const t = Array.from(p.querySelectorAll('Text')).map(x => x.textContent).join('').trim(), type = p.getAttribute('Type') || '';
    if (!t) return;
    if (type === 'Scene Heading') out.push('', /^(INT|EXT|I\/E)/i.test(t) ? t : '.' + t, '');
    else if (type === 'Character') out.push('', t.toUpperCase());
    else if (type === 'Dialogue' || type === 'Parenthetical') out.push(t);
    else out.push('', t, '');
  });
  return out.join('\n');
}
function buildIndexes(sc){
  const chars = [], places = [];
  sc.scenes.forEach(s => {
    s.chars.forEach(c => { let o = chars.find(x => x.name === c); if (!o) { o = {id:uid(), name:c, actor:'', scenes:[]}; chars.push(o); } o.scenes.push(s.n); });
    const pls = s.places && s.places.length ? s.places : (s.place ? [s.place] : []);
    pls.forEach(name => {
      let p = places.find(x => x.name === name); if (!p) { p = {id:uid(), name, ie:[], times:[], scenes:[]}; places.push(p); }
      if (p.scenes.indexOf(s.n) < 0) p.scenes.push(s.n); if (p.ie.indexOf(s.ie) < 0) p.ie.push(s.ie); if (s.time && p.times.indexOf(s.time) < 0) p.times.push(s.time);
    });
  });
  sc.chars = chars; sc.places = places; return sc;
}
function parseScript(text, fileName){
  const lines = String(text).replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
  let title = '';
  const scenes = [];
  let cur = null;
  const isBlank = i => i < 0 || i >= lines.length || !lines[i].trim();
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i], t = raw.trim();
    const meta = /^(title|título|titulo)\s*:\s*(.+)$/i.exec(t);
    if (meta && !cur) { title = meta[2].trim(); continue; }
    if (HEAD.test(t) && (isBlank(i - 1) || i === 0)) { cur = Object.assign({id:uid(), n:scenes.length + 1, chars:[], body:[]}, parseHeading(t)); scenes.push(cur); continue; }
    if (!cur) continue;
    cur.body.push(raw);
    const isCue = t.length > 1 && t.length <= 42 && isBlank(i - 1) && !isBlank(i + 1) &&
      (t[0] === '@' || (t === t.toUpperCase() && /[A-ZÀ-Ý]/.test(t) && !/:\s*$/.test(t) && !/^(FADE|CORTA|CUT|FIM|THE END|DISSOLVE|SMASH)/.test(t) && !/[.!?…]$/.test(t.replace(/\(.*\)/g, '').trim())));
    if (isCue) { const name = t.replace(/^@/, '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\s*\^\s*$/, '').trim(); if (name && cur.chars.indexOf(name) < 0) cur.chars.push(name); }
  }
  scenes.forEach(s => { while (s.body.length && !s.body[s.body.length - 1].trim()) s.body.pop(); s.len = Math.max(1, Math.round((s.body.length + 2) / 56 * 8)); });
  return buildIndexes({source:'hub', title:title || (fileName ? fileName.replace(/\.[^.]+$/, '') : 'Sem título'), fileName:fileName || 'texto colado', imported:today(), scenes});
}
/* guião visto a partir das cenas do Lighthouse, quando ainda não foi importado aqui */
function scriptFromLighthouse(p){
  if (!p.lh.length) return null;
  const sc = buildIndexes({source:'lighthouse', title:p.name, fileName:p.scriptName || 'Lighthouse', imported:null,
    scenes:p.lh.map((s, i) => Object.assign({id:s.id, n:+s.number || i + 1, number:s.number || String(i + 1), chars:(s.characters || []).slice(), body:[], len:0, lhItems:s.items || []}, parseHeading(s.heading || '')))});
  return sc;
}
function ensureManual(p){
  if (p.kind && p.kind !== 'fiction' && (!p.script || p.script.source !== 'manual')) {
    const units = (p.script && p.script.scenes) || p.lh.map((l, i) => ({id:l.id, n:+l.number || i + 1, number:String(l.number || i + 1), heading:l.heading || '', place:'', chars:(l.characters || []).slice()}));
    p.script = {source:'manual', title:p.name, fileName:'', scenes:units.map(u => ({id:u.id || uid(), n:u.n, number:String(u.number || u.n), heading:u.heading, place:u.place || '', chars:u.chars || [], start:u.start || '', end:u.end || '', ie:'—', time:'', body:[], len:0})),
      cast:(p.script && p.script.cast) || {}, extraPeople:[], extraPlaces:[], seq:units.reduce((m, u) => Math.max(m, +u.number || +u.n || 0), 0)};
  }
}
function getScript(p){
  ensureManual(p);
  const sc = p.script && p.script.scenes ? buildIndexes(Object.assign({}, p.script, {scenes:p.script.scenes.map(s => Object.assign({}, s))})) : scriptFromLighthouse(p);
  if (!sc) return null;
  if (sc.source === 'manual') {
    (p.script.extraPeople || []).forEach(n => { if (!sc.chars.some(c => c.name === n)) sc.chars.push({id:uid(), name:n, actor:'', scenes:[]}); });
    (p.script.extraPlaces || []).forEach(n => { if (!sc.places.some(c => c.name === n)) sc.places.push({id:uid(), name:n, ie:[], times:[], scenes:[]}); });
  }
  const cast = (p.script && p.script.cast) || {};
  sc.chars.forEach(c => { if (cast[c.name] != null) c.actor = cast[c.name]; });
  if (p.script && p.script.scenes) sc.scenes.forEach(s => { const l = p.lh.find(x => (x.number || '') === String(s.n)); if (l) s.lhItems = l.items || []; });
  return sc;
}

const SAMPLE = ['Title: SAL', '', '1. EXT. SALINAS DO SAMOUCO — DIA', '', 'O sol bate de chapa nos tanques. JOÃO (45) puxa o rodo devagar e junta o sal num monte branco.', '',
  'Um carro para no caminho de terra. MIGUEL (38) sai e fica a olhar, de óculos escuros.', '', 'MIGUEL', 'Disseste que ias vender.', '', 'JOÃO', '(sem parar)', 'Disse que ia pensar.', '',
  '2. INT. CASA DO GUARDA — NOITE', '', 'Cozinha pequena. Um candeeiro sobre a mesa. ROSA (72) serve a sopa aos dois filhos.', '', 'ROSA', 'Comam enquanto está quente.', '',
  'MIGUEL', 'A mãe sabe que ele não quer vender?', '', 'ROSA', 'A mãe sabe tudo.', '', '3. EXT. SALINAS DO SAMOUCO — FIM DE TARDE', '',
  'João e Miguel lado a lado, calados. CLARA (12) corre entre os tanques.', '', 'CLARA', 'O tio fica para o jantar?', '', 'JOÃO', 'Fica.'].join('\n');

/* ---------- conteúdos das ferramentas ---------- */
function tableFrom(tpl, sc){
  const scenes = sc ? sc.scenes : [], ch = sc ? sc.chars : [];
  if (tpl === 'planos') return {cols:['Plano','Cena','Décor','Enquadramento','Lente','Movimento','Descrição'], rows:scenes.map(s => [s.n + 'A', String(s.n), s.place, '', '', '', ''])};
  if (tpl === 'aderecos') return {cols:['Cena','Décor','Adereço','Quem trata','Estado'], rows:scenes.map(s => [String(s.n), s.place, '', '', 'Por arranjar'])};
  if (tpl === 'elenco') return {cols:['Personagem','Ator ou atriz','Contacto','Cenas'], rows:ch.map(c => [c.name, c.actor || '', '', c.scenes.join(', ')])};
  return {cols:['Coluna 1','Coluna 2','Coluna 3'], rows:[['','',''],['','',''],['','','']]};
}
function mapFrom(tpl, sc){
  const s = sc && sc.scenes[0], items = [{id:uid(), kind:'cam', x:520, y:330, label:'A'}];
  if (tpl === 'cena' && s) {
    s.chars.forEach((c, i) => items.push({id:uid(), kind:'actor', x:240 + i * 70, y:200, label:c}));
    items.push({id:uid(), kind:'light', x:130, y:150, label:'Key', fix:'', set:'', spread:50});
  }
  return {scene:s ? s.n : null, items};
}
function timelineFrom(tpl, ph){
  if (tpl !== 'fases') return {tasks:[]};
  const t = (name, dept, a, b) => ({id:uid(), name, dept, start:a, end:b});
  const pre = ph.pre, prod = ph.prod, pos = ph.pos, d = dayDiff(pre.start, pre.end), q = dayDiff(pos.start, pos.end);
  const at = (r, f) => addDays(r.start, Math.round((r === pre ? d : q) * f));
  return {tasks:[
    t('Repérage de décors', 'Produção', pre.start, at(pre, .3)), t('Casting', 'Realização', at(pre, .15), at(pre, .55)),
    t('Plano de rodagem', 'Produção', at(pre, .45), at(pre, .7)), t('Ensaios', 'Realização', at(pre, .7), pre.end),
    t('Testes de câmara e luz', 'Imagem', at(pre, .8), pre.end), t('Construção e adereços', 'Arte', at(pre, .5), pre.end),
    t('Rodagem', 'Produção', prod.start, prod.end), t('Montagem', 'Realização', pos.start, at(pos, .55)),
    t('Correção de cor', 'Imagem', at(pos, .6), at(pos, .8)), t('Mistura de som', 'Som', at(pos, .6), at(pos, .85)),
    t('Inscrição em festivais', 'Distribuição', at(pos, .8), pos.end)
  ]};
}
function storyFrom(tpl, sc){
  if (tpl !== 'cenas' || !sc) return {frames:[]};
  return {frames:sc.scenes.map((s, i) => ({id:uid(), scene:s.n, code:s.n + 'A', size:['PG','PM','GP','PA'][i % 4], caption:'', x:.4 + (i % 3) * .1}))};
}
function newPage(type, title, group, tpl, p){
  const sc = getScript(p);
  const data = type === 'table' ? tableFrom(tpl, sc) : type === 'map' ? mapFrom(tpl, sc) : type === 'timeline' ? timelineFrom(tpl, p.phases) : type === 'storyboard' ? storyFrom(tpl, sc) : {cards:[]};
  return {id:uid() + uid(), type, title, group:group || null, data};
}
function defaultPhases(start){
  const s = start || today();
  return {pre:{start:s, end:addDays(s, 41)}, prod:{start:addDays(s, 42), end:addDays(s, 55)}, pos:{start:addDays(s, 56), end:addDays(s, 125)}};
}

/* ---------- estado ---------- */
const state = {user:null, me:{name:'', email:''}, projects:[], photos:[], ui:{view:'home'}, status:'saved', loading:true, error:''};
const UIKEY = 'portal-studio-ui';
try { const u = JSON.parse(localStorage.getItem(UIKEY) || 'null'); if (u && typeof u === 'object') state.ui = Object.assign({view:'home'}, u, {modal:null, datesOpen:false, newOpen:false, reimport:false, meOpen:false}); } catch (e) {}
function saveUi(){ try { const u = Object.assign({}, state.ui); delete u.modal; delete u.propAsk; delete u.mapOpen; delete u.lhOpen; delete u.shotOpen; delete u.aiOpen; delete u.claudeOpen; delete u.colorFor; delete u.bfsNav; delete u.renaming; delete u.bimport; localStorage.setItem(UIKEY, JSON.stringify(u)); } catch (e) {} }
const cur = () => state.projects.find(p => p.id === state.ui.pid);
const realPage = p => p.pages.find(x => x.id === state.ui.page);
const openMap = p => { const r = state.ui.mapOpen; if (!r) return null; const E = p.entities[r.key], m = E && (E.maps || []).find(x => x.id === r.id); return m ? {id:'map', type:'map', title:m.title, group:null, data:m, embedded:true, key:r.key} : null; };
const curPage = p => openMap(p) || realPage(p);
const groupName = (p, id) => { const g = p.groups.find(x => x.id === id); return g ? g.name : ''; };
const projPhotos = p => state.photos.filter(f => f.project_id === p.id);
function photoScene(p, f){
  if (f.meta && f.meta.scene_number) return String(f.meta.scene_number);
  const s = p.lh.find(x => x.id === f.scene_id); return s ? String(s.number) : '';
}

/* ---------- carregar e guardar ---------- */
async function loadAll(){
  state.loading = true; state.error = ''; render();
  const [pr, hp, pg, sc, ph, mbr, dc] = await Promise.all([
    sb.from('projects').select('id,name,type,script_name,characters,updated_at').eq('deleted', false).order('updated_at', {ascending:false}),
    sb.from('hub_projects').select('*'),
    sb.from('hub_pages').select('*').eq('deleted', false).order('position'),
    sb.from('scenes').select('id,project_id,number,heading,characters,items,position').eq('deleted', false).order('position'),
    sb.from('photos').select('id,project_id,scene_id,shot,kind,storage_path,meta,taken_at').eq('deleted', false).order('taken_at'),
    sb.from('hub_members').select('*').order('created_at'),
    sb.from('hub_documents').select('id,project_id,kind,page,file_name,file_path,mime,version,is_current,created_at').order('version', {ascending:false})
  ]);
  const err = [pr, hp, pg, sc, ph].find(r => r.error);
  if (err) { state.loading = false; state.error = 'Não consegui ler os projetos do servidor. ' + (navigator.onLine ? 'Volta a tentar daqui a pouco.' : 'Este computador está sem internet.'); render(); return; }
  state.photos = ph.data || [];
  state.projects = (pr.data || []).map(r => {
    const h = (hp.data || []).find(x => x.project_id === r.id);
    const pages = (pg.data || []).filter(x => x.project_id === r.id).map(x => ({id:x.id, type:x.type, title:x.title, group:x.group_id, data:x.data || {}}));
    pages.forEach((x, i) => { pageSnap[x.id] = JSON.stringify({id:x.id, project_id:r.id, type:x.type, title:x.title, group_id:x.group, position:i, data:x.data, deleted:false}); });
    known[r.id] = new Set(pages.map(x => x.id));
    return {id:r.id, name:r.name, type:r.type, scriptName:r.script_name, appChars:r.characters || [], hasHub:!!h,
      format:h ? h.format : (r.type === 'fiction' ? 'Curta-metragem' : 'Outro'),
      phases:h && h.phases && h.phases.pre ? h.phases : defaultPhases(),
      groups:h && Array.isArray(h.groups) && h.groups.length ? h.groups : DEPTS.map(n => ({id:uid(), name:n})),
      script:h ? h.script : null, entities:(h && h.entities) || {}, perms:(h && h.perms) || {}, cover:h ? h.cover : null, kind:(h && h.kind) || 'fiction', tasks:(h && h.tasks) || [], homeGroup:(h && h.home_group) || '', props:(h && h.props) || [], budget:(h && h.budget) || null, propsRemoved:(h && h.props_removed) || [], propsAnalysed:(h && h.entities && h.entities['meta:props']) || null, status:(h && h.status) || 'active', members:((mbr && mbr.data) || []).filter(x => x.project_id === r.id), docs:((dc && dc.data) || []).filter(x => x.project_id === r.id), pages, lh:(sc.data || []).filter(x => x.project_id === r.id)};
  });
  // o que veio do servidor (antes de migrações locais, para essas serem guardadas)
  state.projects.forEach(p => { if (p.hasHub) hubSnap[p.id] = JSON.stringify(hubRowOf(p)); });
  state.projects.forEach(migrateStoryboards);
  state.loading = false;
  if (state.ui.view === 'project' && !cur()) state.ui.view = 'home';
  render();
}
const known = {};
const hubRowOf = p => ({project_id:p.id, format:p.format, phases:p.phases, groups:p.groups, script:p.script || null, entities:Object.assign({}, p.entities || {}, p.propsAnalysed ? {'meta:props':p.propsAnalysed} : {}), perms:p.perms || {}, cover:p.cover || null, kind:p.kind || 'fiction', tasks:p.tasks || [], home_group:p.homeGroup || null, props:p.props || [], props_removed:p.propsRemoved || [], ...(p.budget ? {budget:p.budget} : {}), status:p.status || 'active'});
const pageSnap = {}, hubSnap = {}; // o que já está guardado no servidor, para só enviar o que mudou
let persistTimer = null, persistQueue = new Set();
function setStatus(s){ state.status = s; const el = $('#status'); if (el) { el.textContent = STATUS[s]; el.classList.toggle('off', s === 'off'); } }
const STATUS = {saved:'Guardado', saving:'A guardar…', off:'Sem ligação. Guardo quando houver rede.'};
function persist(p){
  p = p || cur(); if (!p) return;
  persistQueue.add(p.id); setStatus('saving');
  clearTimeout(persistTimer); persistTimer = setTimeout(flush, 700);
}
async function flush(){
  const ids = Array.from(persistQueue); persistQueue.clear();
  for (const id of ids) {
    const p = state.projects.find(x => x.id === id); if (!p) continue;
    try {
      const hubRow = hubRowOf(p);
      const hubJ = JSON.stringify(hubRow); let r;
      // só envia o que mudou desde a última vez (antes enviava o projeto e todas as páginas a cada tecla)
      if (!p.hasHub || hubSnap[p.id] !== hubJ) { r = await sb.from('hub_projects').upsert(hubRow); if (r.error) throw r.error; hubSnap[p.id] = hubJ; }
      p.hasHub = true;
      const rows = p.pages.map((pg, i) => ({id:pg.id, project_id:p.id, type:pg.type, title:pg.title, group_id:pg.group, position:i, data:pg.data, deleted:false}));
      const snaps = rows.map(x => JSON.stringify(x)), changed = rows.filter((x, i) => pageSnap[x.id] !== snaps[i]);
      if (changed.length) { r = await sb.from('hub_pages').upsert(changed); if (r.error) throw r.error; rows.forEach((x, i) => { pageSnap[x.id] = snaps[i]; }); }
      const gone = Array.from(known[p.id] || []).filter(x => !p.pages.some(pg => pg.id === x));
      if (gone.length) { r = await sb.from('hub_pages').update({deleted:true}).in('id', gone); if (r.error) throw r.error; }
      known[p.id] = new Set(p.pages.map(x => x.id));
    } catch (e) {
      persistQueue.add(id); setStatus('off'); clearTimeout(persistTimer); persistTimer = setTimeout(flush, 8000); return;
    }
  }
  if (!persistQueue.size) setStatus('saved');
}
window.addEventListener('online', () => { if (persistQueue.size) flush(); });
window.addEventListener('beforeunload', e => { if (persistQueue.size) { e.preventDefault(); e.returnValue = ''; } });

/* imagens: vão para o armazenamento do Supabase, na pasta da tua conta */
const urlCache = new Map(), urlAt = new Map();
let hydrating = null;
async function hydrate(){
  if (hydrating) { await hydrating; }
  const imgs = Array.from(document.querySelectorAll('img[data-path]'));
  const now = Date.now(), web = p => /^https?:\/\//.test(p);
  // os links assinados valem 1 hora: renovam-se aos 50 minutos (antes as imagens partiam ao fim de uma hora)
  const need = [...new Set(imgs.map(i => i.dataset.path).filter(p => p && !web(p) && (!urlCache.has(p) || now - urlAt.get(p) > 3e6)))];
  if (need.length) {
    hydrating = sb.storage.from('photos').createSignedUrls(need, 3600).then(r => { (r.data || []).forEach(x => { if (x.signedUrl) { urlCache.set(x.path, x.signedUrl); urlAt.set(x.path, now); } }); }).finally(() => { hydrating = null; });
    await hydrating;
  }
  imgs.forEach(i => { const p = i.dataset.path, u = web(p) ? p : urlCache.get(p); if (u && i.getAttribute('src') !== u) i.src = u; });
}
async function uploadImage(file, proj){
  const blob = await shrink(file, 1600, .8);
  const p = proj || cur(), path = state.user.id + '/' + p.id + '/hub/' + crypto.randomUUID() + '.webp';
  const r = await sb.storage.from('photos').upload(path, blob, {contentType:'image/webp', upsert:false});
  if (r.error) throw r.error;
  return path;
}
function shrink(file, max, q){
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => { const img = new Image(); img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height)), cv = document.createElement('canvas');
      cv.width = Math.round(img.width * s); cv.height = Math.round(img.height * s); cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
      cv.toBlob(b => b ? res(b) : rej(new Error('blob')), 'image/webp', q);
    }; img.onerror = rej; img.src = r.result; };
    r.onerror = rej; r.readAsDataURL(file);
  });
}
const imgTag = (path, alt, cls) => '<img' + (cls ? ' class="' + cls + '"' : '') + ' data-path="' + esc(path) + '" alt="' + esc(alt || '') + '" loading="lazy">';

/* ---------- fases ---------- */
function phaseInfo(p){
  const t = today(), out = PHASES.map(([k, l]) => {
    const r = p.phases[k], len = Math.max(1, dayDiff(r.start, r.end) + 1);
    const fill = t < r.start ? 0 : t > r.end ? 100 : Math.round((dayDiff(r.start, t) + 1) / len * 100);
    return {k, l, start:r.start, end:r.end, len, fill, state:t > r.end ? 'done' : t < r.start ? 'next' : 'now'};
  });
  const now = out.find(x => x.state === 'now');
  let label;
  if (now) label = now.l + ' · ' + now.fill + ' %';
  else if (t < p.phases.pre.start) label = 'Começa a ' + dm(p.phases.pre.start);
  else if (t > p.phases.pos.end) label = 'Terminado';
  else { const nx = out.find(x => x.state === 'next'); label = nx ? 'Entre fases · ' + nx.l + ' a ' + dm(nx.start) : 'Entre fases'; }
  return {segs:out, label};
}
function phaseBar(p){
  const info = phaseInfo(p);
  const segs = info.segs.map(s => '<div class="pb-seg ' + s.state + '" style="--d:' + s.len + '"><div class="pb-label"><b>' + s.l + '</b><span>' + dm(s.start) + ' – ' + dm(s.end) + '</span></div>' +
    '<div class="pb-rail" role="progressbar" aria-label="' + s.l + '" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + s.fill + '"><i style="width:' + s.fill + '%"></i>' + (s.state === 'now' ? '<span class="pb-today" style="left:' + s.fill + '%" title="Hoje"></span>' : '') + '</div></div>').join('');
  return '<div class="phasebar"><div class="pb-track">' + segs + '</div><div class="pb-side"><span class="lbl">Hoje</span><b class="num">' + esc(info.label) + '</b><button class="btn ghost small" data-action="dates" aria-expanded="' + !!state.ui.datesOpen + '">Datas</button></div></div>' +
    (state.ui.datesOpen ? '<form class="dates-form" data-form="dates" novalidate>' + PHASES.map(([k, l]) => '<fieldset><legend>' + l + '</legend><input class="input num" type="date" id="d-' + k + '-a" value="' + p.phases[k].start + '" aria-label="' + l + ', início"><input class="input num" type="date" id="d-' + k + '-b" value="' + p.phases[k].end + '" aria-label="' + l + ', fim"></fieldset>').join('') +
      '<div class="stack"><p class="form-msg"></p><button class="btn primary" type="submit">Guardar datas</button></div></form>' : '');
}
const miniBar = p => '<div class="minibar">' + phaseInfo(p).segs.map(s => '<i style="flex:' + s.len + ' 1 0"><b style="width:' + s.fill + '%"></b></i>').join('') + '</div>';

/* ---------- desenhos ---------- */
function frameSVG(s, aspect){
  const W = 240, H = Math.round(W / (aspect || 2.39)), fx = (s.x == null ? .6 : s.x) * W, hz = H * .66;
  let fig = '', floor = '<rect class="sb-floor" y="' + f1(hz) + '" width="' + W + '" height="' + f1(H - hz) + '"/>';
  if (s.size === 'PG') {
    const h = H * .34, top = hz - h;
    fig = '<circle class="sb-fig" cx="' + f1(fx) + '" cy="' + f1(top + h * .12) + '" r="' + f1(h * .12) + '"/><rect class="sb-fig" x="' + f1(fx - h * .13) + '" y="' + f1(top + h * .26) + '" width="' + f1(h * .26) + '" height="' + f1(h * .74) + '" rx="' + f1(h * .1) + '"/>';
  } else if (s.size === 'PA' || s.size === 'PM' || s.size === 'GP') {
    const k = {PA:[.1, .3, 1.6, 1.15], PM:[.14, .36, 2.3, 1.2], GP:[.3, .5, 2, .95]}[s.size], r = H * k[0], cy = H * k[1];
    fig = '<circle class="sb-fig" cx="' + f1(fx) + '" cy="' + f1(cy) + '" r="' + f1(r) + '"/><rect class="sb-fig" x="' + f1(fx - r * k[2]) + '" y="' + f1(cy + r * k[3]) + '" width="' + f1(r * k[2] * 2) + '" height="' + H + '" rx="' + f1(r * 1.2) + '"/>';
  } else {
    const t = H * .62, cw = H * .26, ch = H * .3;
    floor = '<rect class="sb-floor" y="' + f1(t) + '" width="' + W + '" height="' + f1(H - t) + '"/>';
    fig = '<rect class="sb-fig" x="' + f1(fx - cw / 2) + '" y="' + f1(t - ch) + '" width="' + f1(cw) + '" height="' + f1(ch) + '" rx="' + f1(H * .03) + '"/><circle class="sb-handle" cx="' + f1(fx + cw / 2 + H * .04) + '" cy="' + f1(t - ch / 2) + '" r="' + f1(H * .07) + '"/>';
  }
  const label = s.code ? '<text class="sb-text" x="11" y="' + (H - 10) + '">' + esc(s.code) + '</text>' : '';
  return '<svg class="sb" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Quadro ' + (s.code || '') + ', ' + (SIZES[s.size] || '')) + '"><rect class="sb-wall" width="' + W + '" height="' + H + '"/>' +
    '<polygon class="sb-shaft" points="' + f1(W * .1) + ',0 ' + f1(W * .3) + ',0 ' + f1(W * .5) + ',' + f1(hz) + ' ' + f1(W * .18) + ',' + f1(hz) + '"/>' + floor + fig +
    '<rect class="sb-frame" x="5" y="5" width="' + (W - 10) + '" height="' + (H - 10) + '"/><path class="sb-frame" d="M' + (W / 2 - 4) + ' ' + f1(H / 2) + 'h8M' + (W / 2) + ' ' + f1(H / 2 - 4) + 'v8"/>' + label + '</svg>';
}
const MW = 640, MH = 420, rad = d => d * Math.PI / 180, deg = r => r * 180 / Math.PI;
const LIGHT_TYPES = ['Fresnel','Painel LED','Softbox','Tubo LED','Open face','HMI','Prático','Sol ou céu','Rebatedor','Bandeira'];
const SENSORS = [['24.9','Super 35'],['36','Full frame'],['23.5','APS-C'],['17.3','Micro 4/3'],['54.1','65 mm']];
const PIECES = {Parede:[200, 8], Porta:[80, 10], Janela:[100, 10], Mesa:[120, 70], Sofá:[160, 70], Cama:[150, 190], Cadeira:[40, 40], Outro:[90, 60]};
function itemAngle(m, it){
  if (it.rot != null && it.rot !== '') return +it.rot;
  if (it.kind === 'actor') { const c = m.items.find(x => x.kind === 'cam'); return c ? deg(Math.atan2(c.y - it.y, c.x - it.x)) : 90; }
  const actors = m.items.filter(i => i.kind === 'actor');
  const a = actors.reduce((b, x) => !b || Math.hypot(x.x - it.x, x.y - it.y) < Math.hypot(b.x - it.x, b.y - it.y) ? x : b, null);
  return a ? deg(Math.atan2(a.y - it.y, a.x - it.x)) : 90;
}
function camHalf(it){ const f = +it.focal || 35, s = +it.sensor || 24.9; return deg(Math.atan(s / (2 * f))); }
function lightLine(l){ return [l.type, l.model, l.cct ? l.cct + ' K' : '', l.intensity !== '' && l.intensity != null ? l.intensity + ' %' : '', l.gel].filter(Boolean).join(' · ') || [l.fix, l.set].filter(Boolean).join(' · '); }
function mapSVG(m, sel, thumb){
  const k = +m.scale || 40;
  let grid = '';
  for (let x = k, i = 1; x < MW; x += k, i++) grid += '<line x1="' + f1(x) + '" y1="0" x2="' + f1(x) + '" y2="' + MH + '"' + (i % 5 === 0 ? ' class="g5"' : '') + '/>';
  for (let y = k, i = 1; y < MH; y += k, i++) grid += '<line x1="0" y1="' + f1(y) + '" x2="' + MW + '" y2="' + f1(y) + '"' + (i % 5 === 0 ? ' class="g5"' : '') + '/>';
  let pieces = '', beams = '', cones = '', top = '', ln = 0;
  m.items.forEach(it => {
    const s = it.id === sel, a = itemAngle(m, it);
    if (it.kind === 'piece') {
      const w = +it.w || 80, h = +it.h || 40;
      pieces += '<g class="mi" data-mitem="' + it.id + '" transform="translate(' + it.x + ' ' + it.y + ') rotate(' + f1(+it.rot || 0) + ')"><rect class="ld-piece" x="' + f1(-w / 2) + '" y="' + f1(-h / 2) + '" width="' + w + '" height="' + h + '" rx="' + (h < 14 ? 1 : 5) + '"/>' +
        (h >= 14 ? '<text class="ld-label" x="0" y="3" text-anchor="middle">' + esc(String(it.label || '').toUpperCase()) + '</text>' : '') + (s ? '<rect class="ld-sel" x="' + f1(-w / 2 - 5) + '" y="' + f1(-h / 2 - 5) + '" width="' + (w + 10) + '" height="' + (h + 10) + '" rx="8"/>' : '') + '</g>' +
        (h < 14 && it.label ? '<text class="ld-label" x="' + it.x + '" y="' + (it.y - 10) + '" text-anchor="middle">' + esc(String(it.label).toUpperCase()) + '</text>' : '');
    } else if (it.kind === 'light') {
      ln++;
      const sp = (+it.spread || 45) / 2, r = 170, cool = +it.cct && +it.cct > 4300;
      if (it.type === 'Rebatedor' || it.type === 'Bandeira') {
        top += '<g class="mi ld-light" data-mitem="' + it.id + '" transform="translate(' + it.x + ' ' + it.y + ') rotate(' + f1(a) + ')"><rect class="' + (it.type === 'Bandeira' ? 'ld-flag' : 'ld-bounce') + '" x="-4" y="-22" width="8" height="44" rx="2"/><text x="-12" y="4" text-anchor="end" transform="rotate(' + f1(-a) + ' -12 0)">' + ln + '</text></g>' + (s ? '<circle class="ld-sel" cx="' + it.x + '" cy="' + it.y + '" r="26"/>' : '');
      } else {
        beams += '<path class="ld-beam' + (cool ? ' cool' : '') + '" d="M' + it.x + ' ' + it.y + 'L' + f1(it.x + r * Math.cos(rad(a - sp))) + ' ' + f1(it.y + r * Math.sin(rad(a - sp))) + 'A' + r + ' ' + r + ' 0 0 1 ' + f1(it.x + r * Math.cos(rad(a + sp))) + ' ' + f1(it.y + r * Math.sin(rad(a + sp))) + 'Z"/>';
        top += '<g class="mi ld-light" data-mitem="' + it.id + '"><circle cx="' + it.x + '" cy="' + it.y + '" r="12"/><line class="ld-dir" x1="' + f1(it.x + 12 * Math.cos(rad(a))) + '" y1="' + f1(it.y + 12 * Math.sin(rad(a))) + '" x2="' + f1(it.x + 19 * Math.cos(rad(a))) + '" y2="' + f1(it.y + 19 * Math.sin(rad(a))) + '"/><text x="' + it.x + '" y="' + (it.y + 4) + '" text-anchor="middle">' + ln + '</text>' + (s ? '<circle class="ld-sel" cx="' + it.x + '" cy="' + it.y + '" r="18"/>' : '') + '</g>';
      }
    } else if (it.kind === 'cam') {
      const h = camHalf(it), L = 150;
      cones += '<path class="ld-fov" d="M' + it.x + ' ' + it.y + 'L' + f1(it.x + L * Math.cos(rad(a - h))) + ' ' + f1(it.y + L * Math.sin(rad(a - h))) + 'L' + f1(it.x + L * Math.cos(rad(a + h))) + ' ' + f1(it.y + L * Math.sin(rad(a + h))) + 'Z"/>' +
        '<path class="ld-cone" d="M' + it.x + ' ' + it.y + 'L' + f1(it.x + L * Math.cos(rad(a - h))) + ' ' + f1(it.y + L * Math.sin(rad(a - h))) + 'M' + it.x + ' ' + it.y + 'L' + f1(it.x + L * Math.cos(rad(a + h))) + ' ' + f1(it.y + L * Math.sin(rad(a + h))) + '"/>';
      top += '<g class="mi" data-mitem="' + it.id + '"><g transform="translate(' + it.x + ' ' + it.y + ') rotate(' + f1(a) + ')"><rect class="ld-cam" x="-13" y="-9" width="18" height="18" rx="3"/><path class="ld-cam" d="M5 -5L14 -11V11L5 5Z"/></g><text class="ld-tag" x="' + it.x + '" y="' + (it.y + 30 > MH - 4 ? it.y - 20 : it.y + 30) + '" text-anchor="middle">' + esc(it.label || 'CAM') + (it.focal ? ' · ' + esc(it.focal) + ' MM' : '') + '</text>' + (s ? '<circle class="ld-sel" cx="' + it.x + '" cy="' + it.y + '" r="22"/>' : '') + '</g>';
    } else {
      const ini = String(it.label || '?').trim().slice(0, 2).toUpperCase();
      top += '<g class="mi" data-mitem="' + it.id + '"><line class="ld-face" x1="' + f1(it.x + 13 * Math.cos(rad(a))) + '" y1="' + f1(it.y + 13 * Math.sin(rad(a))) + '" x2="' + f1(it.x + 21 * Math.cos(rad(a))) + '" y2="' + f1(it.y + 21 * Math.sin(rad(a))) + '"/><circle class="ld-actor" cx="' + it.x + '" cy="' + it.y + '" r="13"/><text class="ld-actor-t" x="' + it.x + '" y="' + (it.y + 3.5) + '" text-anchor="middle">' + esc(ini) + '</text><text class="ld-label" x="' + it.x + '" y="' + (it.y + 28) + '" text-anchor="middle">' + esc(String(it.label || '').toUpperCase()) + '</text>' + (s ? '<circle class="ld-sel" cx="' + it.x + '" cy="' + it.y + '" r="19"/>' : '') + '</g>';
    }
  });
  const scale = thumb ? '' : '<g class="ld-scale"><line x1="14" y1="' + (MH - 14) + '" x2="' + f1(14 + k) + '" y2="' + (MH - 14) + '"/><text x="' + f1(14 + k + 6) + '" y="' + (MH - 10) + '">1 m</text></g>';
  return '<svg class="ld' + (thumb ? ' ld-thumb' : '') + '"' + (thumb ? '' : ' id="map-svg"') + ' viewBox="0 0 ' + MW + ' ' + MH + '" role="img" aria-label="Mapa de luz visto de cima"><g class="ld-grid">' + grid + '</g>' + pieces + beams + cones + top + scale + '</svg>';
}
/* mapa do Lighthouse convertido para o Studio (metros → pontos, rotação 0 = para cima → 0 = para a direita) */
function lhToMap(items, n){
  const xs = items.map(i => i.x), ys = items.map(i => i.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const k = Math.max(18, Math.min(60, Math.min((MW - 140) / Math.max(1, maxX - minX), (MH - 140) / Math.max(1, maxY - minY))));
  const ox = (MW - (maxX - minX) * k) / 2, oy = (MH - (maxY - minY) * k) / 2;
  const X = x => Math.round(ox + (x - minX) * k), Y = y => Math.round(oy + (y - minY) * k);
  const lt = {FRESNEL:'Fresnel', LED:'Painel LED', PANEL:'Painel LED', SOFTBOX:'Softbox', TUBE:'Tubo LED', OPENFACE:'Open face', HMI:'HMI', PRACTICAL:'Prático'};
  return {id:uid() + uid(), title:'Mapa de luz (do Lighthouse)', scene:n, scale:Math.round(k), fromLH:true, items:items.map(i => {
    const base = {id:uid(), x:X(i.x), y:Y(i.y), rot:Math.round(((+i.rot || 0) - 90 + 360) % 360)};
    if (i.kind === 'CAMERA') return Object.assign(base, {kind:'cam', label:String(i.label || '').toUpperCase(), focal:i.focal || 35, sensor:i.sensorW || 24.9});
    if (i.kind === 'LIGHT') return Object.assign(base, {kind:'light', label:i.label || '', type:lt[String(i.lightType || '').toUpperCase()] || (i.lightType ? String(i.lightType).charAt(0) + String(i.lightType).slice(1).toLowerCase() : 'Fresnel'), model:i.model || '', cct:i.cct || '', intensity:i.intensity != null ? i.intensity : '', gel:i.gel || '', spread:i.beam || 30, notes:i.notes || ''});
    if (i.kind === 'ACTOR') return Object.assign(base, {kind:'actor', label:i.label || i.character || ''});
    return Object.assign(base, {kind:'piece', label:i.label || '', w:50, h:36});
  })};
}
function exportMap(title){
  const svg = $('#map-svg'); if (!svg) return;
  const clone = svg.cloneNode(true), src = svg.querySelectorAll('*'), dst = clone.querySelectorAll('*');
  const props = ['fill','stroke','stroke-width','stroke-dasharray','opacity','fill-opacity','font-family','font-size','font-weight','letter-spacing'];
  src.forEach((el, i) => { const cs = getComputedStyle(el); dst[i].setAttribute('style', props.map(pr => pr + ':' + cs.getPropertyValue(pr)).join(';')); });
  clone.querySelectorAll('.ld-sel').forEach(x => x.remove());
  const W = MW * 2, H = MH * 2, bg = getComputedStyle(document.body).backgroundColor;
  clone.setAttribute('width', W); clone.setAttribute('height', H); clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect'); rect.setAttribute('width', MW); rect.setAttribute('height', MH); rect.setAttribute('fill', bg); clone.insertBefore(rect, clone.firstChild);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], {type:'image/svg+xml'})), img = new Image();
  img.onload = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.getContext('2d').drawImage(img, 0, 0, W, H); URL.revokeObjectURL(url);
    cv.toBlob(b => { const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = (title || 'mapa-de-luz').replace(/[\\/:*?"<>|]+/g, '-') + '.png'; document.body.appendChild(a); a.click(); a.remove(); }, 'image/png'); };
  img.onerror = () => toast('Não consegui gerar a imagem do mapa.');
  img.src = url;
}
/* mapa feito no Lighthouse: posições em metros, rotação 0 = para cima, sentido dos ponteiros */
function lhSVG(items, hl, compact){
  const xs = items.map(i => i.x), ys = items.map(i => i.y);
  const minX = Math.min(...xs) - 2.5, maxX = Math.max(...xs) + 2.5, minY = Math.min(...ys) - 2.5, maxY = Math.max(...ys) + 2.5, k = 40;
  const W = Math.round((maxX - minX) * k), H = Math.round((maxY - minY) * k), X = x => f1((x - minX) * k), Y = y => f1((y - minY) * k);
  const dir = r => [Math.sin(rad(r)), -Math.cos(rad(r))];
  let grid = '';
  for (let x = Math.ceil(minX); x <= maxX; x++) grid += '<line x1="' + X(x) + '" y1="0" x2="' + X(x) + '" y2="' + H + '"/>';
  for (let y = Math.ceil(minY); y <= maxY; y++) grid += '<line x1="0" y1="' + Y(y) + '" x2="' + W + '" y2="' + Y(y) + '"/>';
  let beams = '', top = '', n = 0;
  items.forEach(i => {
    const cx = X(i.x), cy = Y(i.y), ang = deg(Math.atan2(dir(i.rot || 0)[1], dir(i.rot || 0)[0]));
    if (i.kind === 'LIGHT') {
      n++; const sp = (i.beam || 30) / 2, r = 4 * k;
      beams += '<path class="ld-beam" d="M' + cx + ' ' + cy + 'L' + f1(cx + r * Math.cos(rad(ang - sp))) + ' ' + f1(cy + r * Math.sin(rad(ang - sp))) + 'A' + r + ' ' + r + ' 0 0 1 ' + f1(cx + r * Math.cos(rad(ang + sp))) + ' ' + f1(cy + r * Math.sin(rad(ang + sp))) + 'Z"/>';
      top += '<g class="ld-light"><circle cx="' + cx + '" cy="' + cy + '" r="11"/><text x="' + cx + '" y="' + (cy + 4) + '" text-anchor="middle">' + n + '</text></g>';
    } else if (i.kind === 'CAMERA') {
      const fov = deg(2 * Math.atan((i.sensorW || 24.9) / (2 * (i.focal || 35)))) / 2, L = 3 * k;
      beams += '<path class="ld-cone" d="M' + cx + ' ' + cy + 'L' + f1(cx + L * Math.cos(rad(ang - fov))) + ' ' + f1(cy + L * Math.sin(rad(ang - fov))) + 'M' + cx + ' ' + cy + 'L' + f1(cx + L * Math.cos(rad(ang + fov))) + ' ' + f1(cy + L * Math.sin(rad(ang + fov))) + '"/>';
      top += '<g transform="translate(' + cx + ' ' + cy + ') rotate(' + f1(ang) + ')"><rect class="ld-cam" x="-12" y="-8" width="16" height="16" rx="3"/><path class="ld-cam" d="M4 -4L12 -10V10L4 4Z"/></g><text class="ld-tag" x="' + cx + '" y="' + (cy + 26) + '" text-anchor="middle">' + esc(i.label || 'CAM') + ' · ' + (i.focal || '') + ' MM</text>' + (hl && String(i.label).toUpperCase() === hl ? '<circle class="ld-sel" cx="' + cx + '" cy="' + cy + '" r="22"/>' : '');
    } else if (i.kind === 'ACTOR') {
      top += '<line class="ld-face" x1="' + f1(cx + 12 * Math.cos(rad(ang))) + '" y1="' + f1(cy + 12 * Math.sin(rad(ang))) + '" x2="' + f1(cx + 20 * Math.cos(rad(ang))) + '" y2="' + f1(cy + 20 * Math.sin(rad(ang))) + '"/><circle class="ld-actor" cx="' + cx + '" cy="' + cy + '" r="12"/><text class="ld-actor-t" x="' + cx + '" y="' + (cy + 3.5) + '" text-anchor="middle">' + esc(String(i.label || i.character || '?').slice(0, 2)) + '</text><text class="ld-label" x="' + cx + '" y="' + (cy + 26) + '" text-anchor="middle">' + esc(String(i.label || i.character || '').toUpperCase()) + '</text>';
    } else {
      top += '<rect class="ld-piece" x="' + (cx - 14) + '" y="' + (cy - 10) + '" width="28" height="20" rx="4"/><text class="ld-label" x="' + cx + '" y="' + (cy + 24) + '" text-anchor="middle">' + esc(String(i.label || i.kind || '').toUpperCase()) + '</text>';
    }
  });
  const legend = items.filter(i => i.kind === 'LIGHT').map((i, j) => '<li><span class="ln">' + (j + 1) + '</span><div><b>' + esc(i.label || (i.lightType || 'Luz').toLowerCase()) + '</b> · ' + esc((i.lightType || '').toLowerCase()) + (i.model ? ' ' + esc(i.model) : '') + '<br><span class="dim num">' + (i.cct || '') + ' K · ' + (i.intensity != null ? i.intensity + ' %' : '') + (i.gel ? ' · ' + esc(i.gel) : '') + '</span></div></li>').join('');
  return '<svg class="ld" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Mapa de luz do Lighthouse"><g class="ld-grid">' + grid + '</g>' + beams + top + '</svg>' + (legend && !compact ? '<ol class="legend">' + legend + '</ol>' : '');
}

/* ---------- vistas ---------- */
function loginView(){
  return '<div class="login"><form class="panel" data-form="login" novalidate><div class="brand">' + MARK + '<span class="brand-name">PØRTAL STUDIØ</span></div>' +
    '<p class="lede">Entra com a mesma conta do Viewfinder e do Lighthouse. Os projetos são os mesmos.</p>' +
    '<label class="field"><span>Email</span><input class="input" id="li-email" type="email" autocomplete="username" required></label>' +
    '<label class="field"><span>Palavra-passe</span><input class="input" id="li-pass" type="password" autocomplete="current-password" required></label>' +
    '<p class="form-msg"></p><button class="btn primary" type="submit">Entrar</button></form></div>';
}
function avatarHTML(cls){ return '<span class="av' + (state.me.avatar ? ' av-img' : '') + (cls ? ' ' + cls : '') + '">' + (state.me.avatar ? imgTag(state.me.avatar, state.me.name) : esc(initials(state.me.name))) + '</span>'; }
function meMenu(){
  return '<div class="me-wrap"><span class="status' + (state.status === 'off' ? ' off' : '') + '" id="status">' + STATUS[state.status] + '</span><button class="me-btn" data-action="me" aria-expanded="' + !!state.ui.meOpen + '" aria-label="Conta">' + avatarHTML() + '</button>' +
    (state.ui.meOpen ? '<div class="me-menu"><div class="me-id">' + avatarHTML('av-lg') + '<div><b>' + esc(state.me.name) + '</b><span class="dim" style="font-size:.84rem;display:block">' + esc(state.me.email) + '</span></div></div><button class="btn small" data-action="avatar-pick">' + (state.me.avatar ? 'Mudar foto de perfil' : 'Pôr foto de perfil') + '</button>' + (state.me.avatar ? '<button class="btn ghost small" data-action="avatar-del">Tirar a foto</button>' : '') + '<button class="btn small" data-action="logout">Sair</button></div>' : '') + '</div>';
}
function kindNote(k){
  return k === 'fiction' ? 'Começa pelo guião: importas e ele separa cenas, personagens e décors.'
    : k === 'ad' ? 'Começa pelo brief e pelo tratamento. Os momentos do spot, o casting e os locais crias à mão.'
    : k === 'doc' ? 'Começa pelo tratamento. As sequências, os protagonistas e os locais crias à mão, à medida que o filme se descobre.'
    : 'Começa pelo tratamento e pela música: divides a canção em secções e cada secção tem os seus planos.';
}
const HOME_TABS = [['active','Em curso'],['done','Finalizados'],['archived','Arquivo']];
function homeView(){
  const open = !!state.ui.newOpen, tab = state.ui.homeTab || 'active';
  let list;
  if (state.loading) list = '<p class="note">A carregar os projetos…</p>';
  else if (state.error) list = '<div class="empty"><p>' + esc(state.error) + '</p><button class="btn" data-action="reload">Tentar outra vez</button></div>';
  else if (!state.projects.length) list = '<div class="empty"><h3 class="h3">Ainda não há projetos.</h3><p>Cria o primeiro.</p></div>';
  else {
    const shown = state.projects.filter(p => (p.status || 'active') === tab), groups = [];
    shown.forEach(p => { const g = p.homeGroup || ''; if (groups.indexOf(g) < 0) groups.push(g); });
    groups.sort((a, b) => !a ? 1 : !b ? -1 : a.localeCompare(b, 'pt'));
    list = shown.length ? groups.map(g => { const inG = shown.filter(p => (p.homeGroup || '') === g); return '<section class="home-group">' + (g || groups.length > 1 ? '<div class="sec-head"><h2 class="h2">' + esc(g || 'Sem grupo') + '</h2><span class="dim">' + pl(inG.length, 'projeto', 'projetos') + '</span></div>' : '') +
      '<div class="projects">' + inG.map(projectCard).join('') + '</div></section>'; }).join('')
      : '<div class="empty"><p>' + (tab === 'done' ? 'Ainda não há projetos finalizados.' : tab === 'archived' ? 'O arquivo está vazio. Um projeto arquivado sai da lista principal, mas fica todo guardado.' : 'Não há projetos em curso.') + '</p></div>';
  }
  const allGroups = []; state.projects.forEach(p => { if (p.homeGroup && allGroups.indexOf(p.homeGroup) < 0) allGroups.push(p.homeGroup); });
  const count = k => state.projects.filter(p => (p.status || 'active') === k).length;
  return '<div class="top"><div class="top-row"><div class="brand">' + MARK + '<span class="brand-name">PØRTAL STUDIØ</span></div>' + meMenu() + '</div></div>' +
    '<div class="home"><header class="home-head"><div class="lbl">Projetos</div><div class="head-row"><h1 class="display">Os teus projetos</h1>' + (open ? '' : '<button class="btn primary" data-action="new-open">Novo projeto</button>') + '</div>' +
    '<p class="lede">São os mesmos projetos do Viewfinder e do Lighthouse. Abres um de cada vez.</p></header>' +
    (open ? '<form class="panel" data-form="new-project" novalidate style="max-width:780px"><h2 class="h3">Novo projeto</h2><div class="new-grid three"><label class="field"><span>Nome</span><input class="input" id="np-name" autocomplete="off"></label><label class="field"><span>Tipo</span><select class="input" id="np-kind">' + Object.keys(KINDS).map(k => '<option value="' + k + '">' + KINDS[k].label + '</option>').join('') + '</select></label><label class="field" id="np-format-wrap"><span>Formato</span><select class="input" id="np-format">' + FORMATS.map(f => '<option>' + f + '</option>').join('') + '</select></label></div>' +
      '<p class="note" id="np-note">' + kindNote('fiction') + '</p><p class="note">O projeto aparece também no Viewfinder e no Lighthouse, com os grupos Realização, Produção, Imagem, Arte, Som e Distribuição.</p><p class="form-msg"></p><div class="row-actions"><button class="btn primary" type="submit">Criar projeto</button><button class="btn ghost" type="button" data-action="new-close">Cancelar</button></div></form>' : '') +
    '<div class="cats home-tabs" role="tablist">' + HOME_TABS.map(([k, l]) => '<button role="tab" aria-selected="' + (tab === k) + '" data-action="home-tab" data-tab="' + k + '">' + l + '<small>' + count(k) + '</small></button>').join('') + '</div>' +
    '<datalist id="home-groups">' + allGroups.map(g => '<option value="' + esc(g) + '">').join('') + '</datalist>' +
    list + '</div>';
}
function projectCard(p){
  const ph = projPhotos(p).find(f => f.kind === 'storyboard') || projPhotos(p)[0];
  const cover = (p.cover ? imgTag(p.cover, p.name) : ph ? imgTag((ph.meta && ph.meta.thumb_path) || ph.storage_path, p.name) : '<div class="cover-empty">' + MARK + '</div>') +
    '<span class="cover-tools"><button class="btn small" data-action="cover" data-id="' + esc(p.id) + '">Mudar capa</button>' + (p.cover ? '<button class="btn small" data-action="cover-reset" data-id="' + esc(p.id) + '">Automática</button>' : '') + '</span>';
  const sc = getScript(p), T = KT(p), menu = state.ui.cardMenu === p.id, st = p.status || 'active';
  const meta = sc && (sc.scenes.length || sc.chars.length) ? sc.scenes.length + ' ' + T.units.split(' ')[0].toLowerCase() + ' · ' + sc.chars.length + ' ' + T.people.toLowerCase() + ' · ' + sc.places.length + ' ' + T.places.toLowerCase() : (p.kind && p.kind !== 'fiction' ? 'A começar pelo tratamento' : 'Guião por importar');
  const openT = (p.tasks || []).filter(t => t.status !== 'done').length;
  return '<article class="pcard' + (st !== 'active' ? ' is-' + st : '') + '"><div class="cover">' + cover + '</div><div class="pbody"><div class="prow"><span class="lbl">' + esc(T.label) + (p.format && p.format !== T.label ? ' · ' + esc(p.format) : '') + '</span>' +
    '<span class="row-actions">' + (st === 'done' ? '<span class="pill">Finalizado</span>' : st === 'archived' ? '<span class="pill">Arquivado</span>' : '') +
    '<button class="x card-more" data-action="card-menu" data-id="' + esc(p.id) + '" aria-expanded="' + menu + '" aria-label="Opções de ' + esc(p.name) + '">⋯</button></span></div>' +
    '<h2 class="pname"><button class="stretch" data-action="open" data-id="' + esc(p.id) + '">' + esc(p.name) + '</button></h2>' +
    '<p class="pmeta">' + meta + (projPhotos(p).length ? ' · ' + pl(projPhotos(p).length, 'foto', 'fotos') : '') + (openT ? ' · ' + pl(openT, 'tarefa por fazer', 'tarefas por fazer') : '') + '</p>' +
    miniBar(p) + '<p class="pmeta num">' + esc(phaseInfo(p).label) + '</p>' +
    (menu ? '<div class="card-menu"><label class="field"><span>Grupo</span><input class="input" list="home-groups" data-home-group="' + esc(p.id) + '" value="' + esc(p.homeGroup || '') + '" placeholder="Ex.: Clientes, Pessoais, 2026" autocomplete="off"></label>' +
      '<div class="row-actions">' + (st !== 'active' ? '<button class="btn small" data-action="proj-status" data-id="' + esc(p.id) + '" data-st="active">Voltar a em curso</button>' : '') +
      (st !== 'done' ? '<button class="btn small" data-action="proj-status" data-id="' + esc(p.id) + '" data-st="done">Marcar como finalizado</button>' : '') +
      (st !== 'archived' ? '<button class="btn small" data-action="proj-status" data-id="' + esc(p.id) + '" data-st="archived">Arquivar</button>' : '') + '</div></div>' : '') +
    '</div></article>';
}
function projectView(p){
  const GEN = ['script', 'storyboard', 'planning', 'team', 'tasks', 'budget'], isGen = x => GEN.indexOf(x) >= 0 || String(x).indexOf('doc:') === 0;
  if (!isGen(state.ui.page) && !realPage(p)) state.ui.page = 'script';
  if (String(state.ui.page).indexOf('doc:') === 0 && !KT(p).docs.some(d => 'doc:' + d[0] === state.ui.page)) state.ui.page = 'script';
  const pg = isGen(state.ui.page) ? null : realPage(p);
  if (pg && pg.type === 'board') return boardFull(p, pg);
  const gen = () => state.ui.page === 'storyboard' ? storyboardAll(p) : state.ui.page === 'planning' ? planningView(p) : state.ui.page === 'team' ? teamPage(p) : state.ui.page === 'tasks' ? tasksPage(p) : state.ui.page === 'budget' ? budgetPage(p) : String(state.ui.page).indexOf('doc:') === 0 ? docPage(p, state.ui.page) : scriptView(p);
  return '<div class="top"><div class="top-row"><div class="top-id"><button class="back lbl" data-action="home">‹ Projetos</button><div class="top-title"><h1>' + esc(p.name) + '</h1><span class="lbl">' + esc(KT(p).label) + (p.format && p.format !== KT(p).label ? ' · ' + esc(p.format) : '') + '</span></div></div>' + meMenu() + '</div>' + phaseBar(p) + '</div>' +
    '<div class="proj">' + sideView(p) + '<main class="page">' + (pg ? pageView(p, pg) : gen()) + '</main></div>';
}
function navBtn(id, icon, label, small){
  if (state.ui.renaming === id) return '<form class="nav nav-rename" data-form="page-rename" data-id="' + esc(id) + '" novalidate>' + icon + '<input class="input" id="rename-in" value="' + esc(label) + '" aria-label="Novo nome da ferramenta" autocomplete="off" spellcheck="false"></form>';
  return '<button title="Clica outra vez, ou faz duplo clique, para mudar o nome" class="nav" data-action="page" data-id="' + esc(id) + '" aria-current="' + (state.ui.page === id) + '">' + icon + '<span>' + esc(label) + '</span>' + (small ? '<small>' + esc(small) + '</small>' : '') + '</button>';
}
function sideView(p){
  const sc = getScript(p), loose = p.pages.filter(x => !x.group || !p.groups.some(g => g.id === x.group)), col = state.ui.collapsed || {};
  const g = (page, cat, icon, label, small) => '<button class="nav" data-action="gpage" data-id="' + page + '"' + (cat ? ' data-cat="' + cat + '"' : '') + ' aria-current="' + (state.ui.page === page && (!cat || (state.ui.cat || 'cenas') === cat)) + '">' + icon + '<span>' + label + '</span>' + (small != null ? '<small>' + esc(small) + '</small>' : '') + '</button>';
  const nShots = Object.keys(p.entities).reduce((n, k) => n + ((p.entities[k] && p.entities[k].shots) || []).length, 0), T = KT(p);
  const openTasks = (p.tasks || []).filter(t => t.status !== 'done').length;
  return '<aside class="side" aria-label="Ferramentas do projeto"><div class="side-sec"><div class="lbl">' + T.base + '</div>' +
    T.docs.map(([k, l]) => g('doc:' + k, '', IC.script, l, null)).join('') +
    (sc ? g('script', 'cenas', T.times ? IC.timeline : IC.script, T.units, sc.scenes.length) + g('script', 'personagens', IC.char, T.people, sc.chars.length) + g('script', 'decors', IC.place, T.places, sc.places.length) + g('script', 'aderecos', IC.prop, 'Adereços', (p.props || []).length || '') +
      g('storyboard', '', IC.storyboard, 'Storyboard', nShots || '') + g('planning', '', IC.table, 'Planificação', nShots || '')
      : g('script', 'cenas', IC.script, 'Importar guião', '')) + '</div>' +
    '<div class="side-sec"><div class="lbl">Gestão</div>' + g('tasks', '', IC.check, 'Tarefas', openTasks || '') + g('budget', '', IC.budget, 'Orçamento', budgetBadge(p)) + g('team', '', IC.team, 'Equipa e permissões', (p.members || []).length + 1) + '</div>' +
    (loose.length ? '<div class="side-sec"><div class="lbl">Geral</div>' + loose.map(x => navBtn(x.id, IC[x.type], x.title)).join('') + '</div>' : '') +
    '<div class="side-sec"><div class="lbl">Departamentos</div>' + p.groups.map(g => {
      const pages = p.pages.filter(x => x.group === g.id), open = !col[g.id];
      const gc = deptColor(p, g);
      return '<div class="group" style="--dc:' + esc(gc) + '"><div class="group-head"><button class="caret" data-action="toggle-group" data-id="' + g.id + '" aria-expanded="' + open + '" aria-label="Mostrar ou esconder ' + esc(g.name) + '">' + IC.caret + '</button>' +
        '<button class="gdot" data-action="grp-color" data-id="' + g.id + '" title="Mudar a cor de ' + esc(g.name) + '" aria-label="Mudar a cor de ' + esc(g.name) + '"></button>' +
        '<span class="gname" contenteditable="true" data-group-name="' + g.id + '" spellcheck="false">' + esc(g.name) + '</span><span class="gcount">' + (pages.length || '') + '</span>' +
        '<button class="x" data-action="add-tool" data-group="' + g.id + '" title="Juntar ferramenta a ' + esc(g.name) + '" aria-label="Juntar ferramenta a ' + esc(g.name) + '">+</button>' +
        '<button class="x" data-action="group-del" data-id="' + g.id + '" title="Tirar grupo" aria-label="Tirar o grupo ' + esc(g.name) + '">×</button></div>' +
        (state.ui.colorFor === g.id ? '<div class="gpick" role="group" aria-label="Cor de ' + esc(g.name) + '">' + SWATCHES.map(c => '<button class="sw' + (c === gc ? ' on' : '') + '" style="--dc:' + c + '" data-action="grp-set-color" data-id="' + g.id + '" data-c="' + c + '" aria-label="Cor ' + c + '"></button>').join('') + '<label class="sw sw-any" title="Outra cor"><input type="color" value="' + esc(gc) + '" data-grp-color="' + g.id + '" aria-label="Outra cor"></label></div>' : '') +
        (open ? '<div class="group-pages">' + (g.name === 'Arte' && sc ? '<button class="nav" data-action="gpage" data-id="script" data-cat="aderecos" aria-current="false">' + IC.prop + '<span>Adereços</span><small>' + ((p.props || []).length || '') + '</small></button>' : '') + (pages.length ? pages.map(x => navBtn(x.id, IC[x.type], x.title)).join('') : (g.name === 'Arte' && sc ? '' : '<div class="group-empty">Ainda sem ferramentas</div>')) + '</div>' : '') + '</div>';
    }).join('') + '</div>' +
    '<div class="side-foot"><button class="btn ink" data-action="add-tool">+ Ferramenta</button><form class="mini-form" data-form="group-add" novalidate><input class="input" id="grp-name" autocomplete="off" placeholder="Novo grupo" aria-label="Nome do novo grupo"><button class="btn small" type="submit">Juntar</button></form></div></aside>';
}
function pageHead(p, pg){
  return '<header class="page-head"' + (pg.group ? ' style="--dc:' + esc(deptColor(p, pg.group)) + '"' : '') + '><div class="page-title"><span class="lbl">' + esc(TOOLS[pg.type].label) + (pg.group ? ' · ' + dot(deptColor(p, pg.group)) + esc(groupName(p, pg.group)) : '') + '</span><h2 class="display" contenteditable="true" data-page-title spellcheck="false">' + esc(pg.title) + '</h2></div>' +
    '<div class="page-tools"><select class="input" id="pg-group" data-page-group aria-label="Grupo desta página"><option value="">Sem grupo</option>' + p.groups.map(g => '<option value="' + g.id + '"' + (g.id === pg.group ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select>' +
    '<button class="btn ghost small" data-action="page-del">Deitar fora</button></div></header>';
}
function pageView(p, pg){
  const body = pg.type === 'board' ? boardView(pg) : pg.type === 'table' ? tableView(pg) : pg.type === 'map' ? mapView(p, pg) : pg.type === 'timeline' ? timelineView(p, pg) : storyView(p, pg);
  return pageHead(p, pg) + body;
}

/* guião */
function importView(p, sc){
  return '<header class="page-head"><div class="page-title"><span class="lbl">Guião</span><h2 class="display">' + (sc ? 'Importar outra versão' : 'Começa pelo guião') + '</h2></div>' + (sc ? '<button class="btn ghost small" data-action="reimport-cancel">Cancelar</button>' : '') + '</header>' +
    '<p class="lede" style="margin-bottom:24px">Ao importar, o guião é lido e separado em cenas, personagens e décors. Essas listas alimentam as tabelas, o storyboard e o mapa de luz.' +
    ' O ficheiro fica guardado na base de dados, e cada nova importação passa a ser uma versão.' + (p.lh.length ? ' As cenas que o projeto já tem ficam ligadas pelo número, com os planos e mapas de luz.' : ' As cenas passam também para o Lighthouse, prontas para os mapas de luz.') + '</p>' +
    '<div class="import"><div class="drop" id="drop">' + MARK + '<h3 class="h3">Arrasta o ficheiro para aqui</h3><p class="note">PDF, Fountain (.fountain), Final Draft (.fdx) ou texto (.txt). Do PØRTAL S. exportas em Fountain.</p>' +
    '<div class="row-actions"><button class="btn" data-action="pick-script">Escolher ficheiro</button><button class="btn ghost" data-action="sample-script">Experimentar com um guião de exemplo</button></div></div>' +
    '<form class="panel" data-form="paste-script" novalidate><label class="field"><span>Ou cola o texto do guião</span><textarea class="input" id="script-text" placeholder="1. EXT. SALINAS — DIA&#10;&#10;JOÃO&#10;Disse que ia pensar."></textarea></label><p class="form-msg"></p><div class="row-actions"><button class="btn primary" type="submit">Ler guião</button></div></form></div>';
}
function scriptView(p){
  const sc = getScript(p);
  if (!sc || (state.ui.reimport && sc.source !== 'manual')) return importView(p, sc);
  if (state.ui.ent) { const v = entityView(p, sc, state.ui.ent); if (v) return v; state.ui.ent = null; }
  if (state.ui.cat === 'aderecos') return propsListView(p, sc);
  if (sc.source === 'manual') return manualListView(p, sc);
  const cat = state.ui.cat || 'cenas';
  const shotsOf = s => (p.entities['scene:' + (s.number || s.n)] || {}).shots;
  let body = '';
  if (cat === 'cenas') {
    body = '<div class="table-wrap"><table class="breakdown"><thead><tr><th>Cena</th><th>Cabeçalho</th><th>Int./Ext.</th><th>Momento</th><th>Décor</th><th>Personagens</th><th>Planos</th><th>Pág.</th></tr></thead><tbody>' +
      sc.scenes.map(s => '<tr data-action="ent" data-ent="' + esc('scene:' + (s.number || s.n)) + '" tabindex="0"><td class="code">' + esc(s.number || s.n) + '</td><td class="slug">' + esc(s.heading) + '</td><td>' + esc(s.ie) + '</td><td>' + esc(s.time || '—') + '</td><td>' + esc(s.place) + '</td><td><span class="chips">' + (s.chars.length ? s.chars.map(c => '<span class="chip">' + esc(c) + '</span>').join('') : '<span class="dim">—</span>') + '</span></td><td class="num">' + ((shotsOf(s) || []).length || '—') + '</td><td class="num">' + eighths(s.len) + '</td></tr>').join('') +
      '</tbody></table></div><p class="note" style="margin-top:14px">Clicas numa cena para abrir a página dela: planos, storyboard, mapa de luz e o que quiseres juntar.</p>';
  } else if (cat === 'personagens') {
    body = '<div class="table-wrap"><table class="breakdown"><thead><tr><th>Personagem</th><th>Ator ou atriz</th><th>Cenas</th><th>Nº de cenas</th><th>Entra na cena</th></tr></thead><tbody>' +
      sc.chars.map(c => '<tr data-action="ent" data-ent="' + esc('char:' + c.name) + '" tabindex="0"><td class="code">' + esc(c.name) + '</td><td>' + (c.actor ? esc(c.actor) : '<span class="dim">Por escolher</span>') + '</td><td class="num">' + c.scenes.join(', ') + '</td><td class="num">' + c.scenes.length + '</td><td class="num">' + c.scenes[0] + '</td></tr>').join('') +
      '</tbody></table></div><p class="note" style="margin-top:14px">Clicas numa personagem para abrir a página dela. As personagens são os nomes que aparecem antes de cada fala; quem só aparece na ação, sem falar, ainda não entra nesta lista.</p>';
  } else {
    body = '<div class="table-wrap"><table class="breakdown"><thead><tr><th>Décor</th><th>Int./Ext.</th><th>Momentos</th><th>Cenas</th><th>Total de páginas</th></tr></thead><tbody>' +
      sc.places.map(pc => { const len = pc.scenes.reduce((n, k) => n + ((sc.scenes.find(s => s.n === k) || {}).len || 0), 0); return '<tr data-action="ent" data-ent="' + esc('place:' + pc.name) + '" tabindex="0"><td class="slug">' + esc(pc.name) + '</td><td>' + esc(pc.ie.join(', ')) + '</td><td>' + esc(pc.times.join(', ') || '—') + '</td><td class="num">' + pc.scenes.join(', ') + '</td><td class="num">' + eighths(len) + '</td></tr>'; }).join('') +
      '</tbody></table></div><p class="note" style="margin-top:14px">Clicas num décor para abrir a página dele. Cenas no mesmo décor rodam-se normalmente juntas.</p>';
  }
  const total = sc.scenes.reduce((n, s) => n + (s.len || 0), 0);
  const meta = sc.source === 'lighthouse' ? pl(sc.scenes.length, 'cena', 'cenas') + ' · só os cabeçalhos, vindos do Lighthouse' : pl(sc.scenes.length, 'cena', 'cenas') + ' · cerca de ' + eighths(total) + ' páginas · importado a ' + dm(sc.imported);
  return '<header class="page-head"><div class="page-title"><span class="lbl">Guião · ' + esc(sc.fileName) + '</span><h2 class="display">' + ({cenas:'Cenas', personagens:'Personagens', decors:'Décors'}[cat]) + '</h2><p class="dim num">' + meta + '</p></div>' +
    '<div class="page-tools"><button class="btn small" data-action="reimport">' + (sc.source === 'lighthouse' ? 'Importar o guião aqui' : 'Importar outra versão') + '</button></div></header>' +
    (sc.source === 'lighthouse' ? '<div class="notice"><p><b>Falta o texto do guião.</b> O Lighthouse só guardou o cabeçalho e as personagens de cada cena' + (p.scriptName ? '; o ficheiro ' + esc(p.scriptName) + ' nunca foi guardado' : '') + '. Importa-o uma vez: fica guardado na base de dados, com versões, e passa a ser o mesmo guião usado nas cenas e na análise de adereços. A numeração das cenas mantém-se.</p><button class="btn primary small" data-action="reimport">Importar ' + esc(p.scriptName || 'o guião') + '</button></div>' : '') +
    docVersions(p, 'script', 'Ficheiros do guião') + body;
}
function sceneText(p, s){
  const out = [];
  let mode = 'ac';
  (s.body || []).forEach(raw => {
    const t = raw.trim();
    if (!t) { mode = 'ac'; return; }
    const name = t.replace(/^@/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    if (mode === 'ac' && s.chars.indexOf(name) >= 0 && t === t.toUpperCase()) { out.push('<div class="cu">' + esc(t.replace(/^@/, '')) + '</div>'); mode = 'di'; return; }
    if (mode === 'di' && /^\(.*\)$/.test(t)) { out.push('<div class="pa">' + esc(t) + '</div>'); return; }
    if (mode === 'di') { out.push('<div class="di">' + esc(t) + '</div>'); return; }
    let h = esc(t); s.chars.forEach(c => { h = h.split(esc(c)).join('<mark>' + esc(c) + '</mark>'); });
    out.push('<div class="ac">' + h + '</div>');
  });
  const num = String(s.number || s.n);
  return '<article class="reader"><div class="sh">' + esc(num) + '. ' + esc(s.heading) + '</div>' +
    (out.length ? out.join('') : '<div class="ac dim">O texto desta cena está no guião original' + (p.scriptName ? ' (' + esc(p.scriptName) + ')' : '') + '. Para o ler aqui, importa a versão em Fountain ou .fdx.</div>') + '</article>';
}


function findShot(p, id){
  for (const k in p.entities) { const E = p.entities[k]; const sh = E && E.shots && E.shots.find(x => x.id === id); if (sh) return {E, sh, key:k}; }
  return null;
}
function matchPhotos(p, num, E){
  const photos = projPhotos(p).filter(f => photoScene(p, f) === num), by = {}, loose = [];
  photos.forEach(f => { const sid = E.photoShot && E.photoShot[f.id]; const sh = sid ? E.shots.find(x => x.id === sid) : E.shots.find(x => x.code === photoCode(num, f)); if (sh) (by[sh.id] = by[sh.id] || []).push(f); else loose.push(f); });
  return {by, loose};
}
function migrateStoryboards(p){
  const sc0 = getScript(p);
  if (sc0) {
    const legacy = p.pages.filter(x => x.type === 'map' && x.data && x.data.scene != null && sc0.scenes.some(s => s.n === x.data.scene));
    legacy.forEach(pg => { const s = sc0.scenes.find(x => x.n === pg.data.scene), r = ensureEntity(p, sc0, 'scene:' + (s.number || s.n)); if (!r) return; r.e.maps = r.e.maps || []; r.e.maps.push({id:pg.id, title:pg.title, scene:pg.data.scene, items:pg.data.items || []}); });
    if (legacy.length) { p.pages = p.pages.filter(x => legacy.indexOf(x) < 0); persist(p); }
  }
  const old = p.pages.filter(x => x.type === 'storyboard'); if (!old.length) return;
  const sc = getScript(p); if (!sc) return;
  old.forEach(pg => (pg.data.frames || []).forEach(fr => {
    const s = sc.scenes.find(x => x.n === fr.scene); if (!s) return;
    const r = ensureEntity(p, sc, 'scene:' + (s.number || s.n)); if (!r) return;
    if (r.e.shots.some(x => x.code === fr.code)) return;
    r.e.shots.push({id:uid(), code:fr.code, size:fr.size || 'PM', lens:'', move:'', desc:fr.caption || '', images:fr.path ? [{path:fr.path, tag:'storyboard'}] : [], link3d:''});
  }));
  p.pages = p.pages.filter(x => x.type !== 'storyboard'); persist(p);
}
function allScenes(p){
  const sc = getScript(p); if (!sc) return null;
  return {sc, list:sc.scenes.map(s => { const num = String(s.number || s.n), r = ensureEntity(p, sc, 'scene:' + num); const m = matchPhotos(p, num, r.e); syncVF(p, m, r.e); return {s, num, E:r.e, m}; })};
}
function storyboardAll(p){
  const A = allScenes(p);
  if (!A) return '<div class="empty"><h3 class="h3">Primeiro o guião.</h3><p>O storyboard organiza-se pelas cenas do guião. Importa-o e os planos aparecem aqui.</p><button class="btn" data-action="gpage" data-id="script" data-cat="cenas">Importar guião</button></div>';
  const T = KT(p);
  if (!A.list.length) return '<div class="empty"><h3 class="h3">Ainda sem ' + T.units.toLowerCase() + '.</h3><p>O storyboard organiza-se por ' + T.unit.toLowerCase() + '. Cria a primeira e os planos aparecem aqui.</p><button class="btn" data-action="gpage" data-id="script" data-cat="cenas">Ir para ' + esc(T.units) + '</button></div>';
  const total = A.list.reduce((n, x) => n + x.E.shots.length, 0);
  return '<header class="page-head"><div class="page-title"><span class="lbl">' + T.base + '</span><h2 class="display">Storyboard</h2><p class="dim">' + pl(total, 'plano', 'planos') + ' · o único storyboard do projeto</p></div></header>' +
    '<p class="note" style="margin-bottom:22px">Os planos são os mesmos da página de cada ' + T.unit.toLowerCase() + ' e da planificação: o que mudas aqui muda lá. As fotos do Viewfinder entram sozinhas no plano com o mesmo número.</p>' +
    A.list.map(({s, num, E, m}) => '<section class="sb-scene"><div class="sec-head">' + entLink('scene:' + num, unitTitle(p, s), (p.kind && p.kind !== 'fiction' ? '' : 'slug ') + 'sb-slug') + '<span class="row-actions">' + (m.loose.length ? entLink('scene:' + num, pl(m.loose.length, 'foto sem plano', 'fotos sem plano'), 'note') : '') + '<button class="btn ghost small" data-action="sb-add" data-ent="' + esc('scene:' + num) + '">+ Plano</button></span></div>' +
      (E.shots.length ? '<div class="frames">' + E.shots.map(sh => {
        const ph = (m.by[sh.id] || [])[0], up = (sh.images || []).find(x => x.tag === 'storyboard');
        const pic = ph ? imgTag((ph.meta && ph.meta.thumb_path) || ph.storage_path, sh.code) : up ? imgTag(up.path, sh.code) : frameSVG(sh, 2.39);
        return '<figure class="frame"><button class="frame-pic" data-action="shot-open" data-shot="' + sh.id + '" aria-label="Abrir o plano ' + esc(sh.code) + '">' + pic + '</button><div class="frame-meta"><b class="code">' + esc(sh.code) + '</b><select class="input mini-sel" data-shot-field="size" data-shot="' + sh.id + '" aria-label="Enquadramento">' + Object.keys(SIZES).map(k => '<option value="' + k + '"' + (k === sh.size ? ' selected' : '') + '>' + SIZES[k] + '</option>').join('') + '</select></div>' +
          '<figcaption><span contenteditable="true" data-shot-text="' + sh.id + '" data-ph="O que se vê">' + esc(sh.desc) + '</span></figcaption></figure>';
      }).join('') + '</div>' : '<p class="note">Ainda sem planos.</p>') + '</section>').join('');
}
function planningView(p){
  const A = allScenes(p);
  if (!A) return '<div class="empty"><h3 class="h3">Primeiro o guião.</h3><p>A planificação lista os planos de cada cena. Importa o guião e começa por lá.</p></div>';
  const rows = [];
  A.list.forEach(({s, num, E, m}) => E.shots.forEach(sh => rows.push('<tr><td class="code">' + entLink('scene:' + num, num) + '</td><td class="code"><button class="link-btn" data-action="shot-open" data-shot="' + sh.id + '">' + esc(sh.code) + '</button></td><td class="slug" style="font-size:.84rem">' + esc(s.place) + '</td>' +
    '<td><select class="input mini-sel" data-shot-field="size" data-shot="' + sh.id + '" aria-label="Enquadramento">' + Object.keys(SIZES).map(k => '<option value="' + k + '"' + (k === sh.size ? ' selected' : '') + '>' + SIZES[k] + '</option>').join('') + '</select></td>' +
    '<td><input class="input mini-in" data-shot-field="lens" data-shot="' + sh.id + '" value="' + esc(sh.lens) + '" placeholder="—" aria-label="Lente"></td><td><input class="input mini-in" data-shot-field="move" data-shot="' + sh.id + '" value="' + esc(sh.move) + '" placeholder="—" aria-label="Movimento"></td>' +
    '<td><span contenteditable="true" data-shot-text="' + sh.id + '" data-ph="O que se vê">' + esc(sh.desc) + '</span></td><td class="num">' + ((m.by[sh.id] || []).length + (sh.images || []).length || '—') + '</td></tr>')));
  const T = KT(p);
  return '<header class="page-head"><div class="page-title"><span class="lbl">' + T.base + '</span><h2 class="display">Planificação</h2><p class="dim">' + pl(rows.length, 'plano', 'planos') + ' em ' + A.list.length + ' ' + T.units.split(' ')[0].toLowerCase() + '</p></div></header>' +
    (rows.length ? '<div class="table-box table-wrap"><table class="plan"><thead><tr><th>' + T.unit + '</th><th>Plano</th><th>' + T.place + '</th><th>Enquadramento</th><th>Lente</th><th>Movimento</th><th>O que se vê</th><th>Imagens</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>' : '<div class="empty"><p>Ainda sem planos. Juntas planos no storyboard ou na página de cada cena.</p></div>') +
    '<p class="note" style="margin-top:14px">É a mesma lista de planos do storyboard e das páginas de cada ' + T.unit.toLowerCase() + ', vista em tabela. Para juntar um plano, usa o "+ Plano" no storyboard.</p>';
}
const ROLES = ['Realização','Assistente de realização','Direção de fotografia','Operação de câmara','Gaffer','Produção','Direção de arte','Guarda-roupa','Caracterização','Som','Montagem','Colorista','Elenco'];
const PMODS = [['guiao','Guião, cenas e storyboard'],['luz','Mapas de luz'],['ferramentas','Board, tabelas e cronograma'],['equipa','Equipa']];
const PDEF = {'Realização':['edita','ve','edita','edita'],'Assistente de realização':['edita','ve','edita','ve'],'Direção de fotografia':['edita','edita','edita','ve'],'Operação de câmara':['ve','ve','ve','nada'],'Gaffer':['ve','edita','ve','nada'],'Produção':['ve','ve','edita','edita'],'Direção de arte':['ve','ve','edita','nada'],'Guarda-roupa':['ve','nada','edita','nada'],'Caracterização':['ve','nada','edita','nada'],'Som':['ve','nada','ve','nada'],'Montagem':['ve','nada','ve','nada'],'Colorista':['ve','ve','ve','nada'],'Elenco':['ve','nada','nada','nada']};
function permsFor(p, role){
  p.perms = p.perms || {};
  if (!p.perms[role]) { const d = PDEF[role] || ['ve','ve','ve','nada']; p.perms[role] = {}; PMODS.forEach(([k], i) => { p.perms[role][k] = d[i]; }); }
  return p.perms[role];
}
function teamPage(p){
  const roles = []; (p.members || []).forEach(m => { if (roles.indexOf(m.role) < 0) roles.push(m.role); });
  const L = {edita:'Edita', ve:'Vê', nada:'—'};
  return '<header class="page-head"><div class="page-title"><span class="lbl">Equipa</span><h2 class="display">Equipa e permissões</h2><p class="dim">' + pl((p.members || []).length + 1, 'pessoa', 'pessoas') + '</p></div></header>' +
    '<div class="team-top"><section class="stack"><ul class="members">' +
      '<li class="member">' + avatarHTML() + '<div><b>' + esc(state.me.name) + ' · tu</b><small>Dona do projeto · ' + esc(state.me.email) + '</small></div><span></span></li>' +
      (p.members || []).map(m => '<li class="member"><span class="av av-soft">' + esc(initials(m.name)) + '</span><div><b>' + esc(m.name) + '</b><small>' + esc(m.role) + ' · ' + esc(m.email) + ' · <span class="pill">' + esc(m.status) + '</span></small></div><button class="btn ghost small" data-action="member-del" data-id="' + m.id + '">Tirar</button></li>').join('') + '</ul></section>' +
    '<form class="panel" data-form="invite" novalidate><h3 class="h3">Convidar alguém</h3>' +
      '<label class="field"><span>Nome</span><input class="input" id="inv-name" autocomplete="off"></label><label class="field"><span>Email</span><input class="input" id="inv-email" type="email" autocomplete="off"></label>' +
      '<label class="field"><span>Cargo</span><select class="input" id="inv-role">' + ROLES.map(r => '<option>' + r + '</option>').join('') + '</select></label>' +
      '<p class="form-msg"></p><div class="row-actions"><button class="btn primary" type="submit">Convidar</button></div>' +
      '<p class="note">Por agora o convite fica só registado aqui: ainda não sai email e a pessoa ainda não consegue entrar no projeto. Isso precisa de uma parte no servidor, que é o passo seguinte.</p></form></div>' +
    '<section class="ent-sec section-gap"><div class="sec-head"><h3 class="h2">Permissões por cargo</h3><span class="dim">Clicas numa célula para mudar</span></div>' +
      (roles.length ? '<div class="table-wrap"><table class="perms"><thead><tr><th>Cargo</th>' + PMODS.map(([, l]) => '<th>' + l + '</th>').join('') + '</tr></thead><tbody>' +
        roles.map(r => { const pr = permsFor(p, r); return '<tr><td>' + esc(r) + '</td>' + PMODS.map(([k, l]) => '<td><button class="perm ' + pr[k] + '" data-action="perm" data-role="' + esc(r) + '" data-mod="' + k + '" aria-label="' + esc(r + ', ' + l + ': ' + L[pr[k]]) + '">' + L[pr[k]] + '</button></td>').join('') + '</tr>'; }).join('') + '</tbody></table></div>' +
        '<p class="note">Edita: abre e muda. Vê: abre mas não muda. Um traço: não aparece a quem tem esse cargo.</p>'
      : '<p class="note">Quando convidares alguém, o cargo dessa pessoa aparece aqui com permissões sugeridas, que podes mudar.</p>') + '</section>';
}
function mapsStrip(p, key){
  const E = p.entities[key], maps = (E && E.maps) || [];
  return '<div class="maps-strip">' + maps.map(m => '<button class="map-thumb" data-action="emap-open" data-ent="' + esc(key) + '" data-id="' + m.id + '">' + mapSVG(m, null, true) + '<span>' + esc(m.title) + '</span></button>').join('') +
    '<button class="map-thumb map-new" data-action="emap-add" data-ent="' + esc(key) + '">' + IC.map + '<span>+ Mapa de luz</span></button></div>';
}
function lhButton(key, hl, label){ return '<button class="btn small" data-action="lh-open" data-ent="' + esc(key) + '"' + (hl ? ' data-hl="' + esc(hl) + '"' : '') + '>' + IC.map + ' ' + esc(label) + '</button>'; }
/* ---------- páginas de cena, personagem e décor ---------- */
const BLOCKS = {note:'Nota', list:'Lista', fields:'Campos', images:'Imagens', link:'Ligação', model:'Modelo 3D', links:'Links'};
const newBlock = (type, title, extra) => Object.assign({id:uid(), type, title:title || BLOCKS[type]}, type === 'note' ? {text:''} : type === 'list' ? {items:[]} : type === 'fields' ? {rows:[['', '']]} : type === 'images' ? {images:[]} : type === 'model' ? {images:[], url:'', label:''} : type === 'links' ? {links:[]} : {url:'', label:''}, extra || {});
const shotLetter = i => String.fromCharCode(65 + (i % 26)) + (i >= 26 ? Math.floor(i / 26) : '');
function photoCode(num, f){ const s = String(f.shot || '').trim(); if (!s) return ''; return /^\d+$/.test(s) ? num + shotLetter(+s - 1) : s.toUpperCase(); }
function findEnt(sc, kind, id){
  if (kind === 'scene') return sc.scenes.find(x => String(x.number || x.n) === id);
  if (kind === 'char') return sc.chars.find(x => x.name === id);
  if (kind === 'place') return sc.places.find(x => x.name === id);
  return null;
}
function ensureEntity(p, sc, key){
  const [kind] = key.split(':'), id = key.slice(kind.length + 1);
  const obj = findEnt(sc, kind, id); if (!obj) return null;
  let e = p.entities[key];
  if (!e) {
    e = p.entities[key] = {blocks:[], photoShot:{}};
    if (kind === 'char') e.blocks = personBlocks(p.kind);
    if (kind === 'place') e.blocks = [newBlock('fields', 'Ficha do ' + KT(p).place.toLowerCase(), {rows:[['Morada', ''], ['Contacto', ''], ['Estacionamento', ''], ['Eletricidade disponível', ''], ['Luz natural', '']]}), newBlock('images', 'Fotos de repérage'), newBlock('note', 'Notas')];
    if (kind === 'scene') e.blocks = [newBlock('note', 'Notas')];
    persist(p);
  }
  if (kind === 'scene' && !e.shots) {
    const num = id, codes = [];
    (obj.lhItems || []).filter(i => i.kind === 'CAMERA' && i.label).forEach(i => { const c = String(i.label).toUpperCase(); if (codes.indexOf(c) < 0) codes.push(c); });
    projPhotos(p).filter(f => photoScene(p, f) === num).forEach(f => { const c = photoCode(num, f); if (c && codes.indexOf(c) < 0) codes.push(c); });
    codes.sort();
    e.shots = codes.map(c => ({id:uid(), code:c, size:'PM', lens:'', move:'', desc:'', images:[], link3d:''}));
    persist(p);
  }
  if (kind === 'scene' && obj.lhItems && obj.lhItems.length && !e.lhImported) { e.maps = e.maps || []; e.maps.push(lhToMap(obj.lhItems, obj.n)); e.lhImported = true; persist(p); }
  e.photoShot = e.photoShot || {};
  return {kind, id, obj, e};
}
function entLink(key, label, cls){ return '<button class="link-btn' + (cls ? ' ' + cls : '') + '" data-action="ent" data-ent="' + esc(key) + '">' + esc(label) + '</button>'; }
function entityView(p, sc, key){
  if (key.indexOf('prop:') === 0) return propView(p, sc, key.slice(5));
  const r = ensureEntity(p, sc, key); if (!r) return null;
  const {kind, id, obj, e} = r;
  const list = kind === 'scene' ? sc.scenes.map(s => 'scene:' + (s.number || s.n)) : kind === 'char' ? sc.chars.map(c => 'char:' + c.name) : sc.places.map(x => 'place:' + x.name);
  const i = list.indexOf(key), prev = list[i - 1], next = list[i + 1];
  const T = KT(p), manual = sc.source === 'manual';
  const kindLabel = {scene:T.unit, char:T.person, place:T.place}[kind], catLabel = {scene:T.units, char:T.people, place:T.places}[kind];
  const nav = '<div class="ent-nav"><button class="back lbl" data-action="ent-back">‹ ' + catLabel + '</button><span class="row-actions">' +
    (prev ? '<button class="btn small" data-action="ent" data-ent="' + esc(prev) + '" aria-label="' + kindLabel + ' anterior">‹</button>' : '') + '<span class="dim num" style="font-size:.84rem">' + (i + 1) + ' de ' + list.length + '</span>' +
    (next ? '<button class="btn small" data-action="ent" data-ent="' + esc(next) + '" aria-label="' + kindLabel + ' seguinte">›</button>' : '') + '</span></div>';
  let head = '', body = '';
  if (kind === 'scene' && manual) {
    const s = obj;
    head = '<header class="ent-head"><span class="lbl">' + T.unit + ' ' + esc(id) + '</span><h2 class="display" contenteditable="true" data-unit-field="heading" data-unit="' + esc(id) + '" data-ph="Sem nome" spellcheck="false">' + esc(s.heading) + '</h2></header>' +
      '<div class="facts ent-facts">' + (T.times ? '<div><span class="lbl">Começa</span><p><input class="input mini-in num" data-unit-field="start" data-unit="' + esc(id) + '" value="' + esc(s.start || '') + '" placeholder="0:00" aria-label="Começa"></p></div><div><span class="lbl">Acaba</span><p><input class="input mini-in num" data-unit-field="end" data-unit="' + esc(id) + '" value="' + esc(s.end || '') + '" placeholder="0:30" aria-label="Acaba"></p></div>' : '') +
      (p.kind === 'music' ? segFacts(p, sc, s, id) :
      '<div><span class="lbl">' + T.place + '</span><p><input class="input mini-in" list="dl-places" data-unit-field="place" data-unit="' + esc(id) + '" value="' + esc(s.place || '') + '" placeholder="Escolhe ou escreve" aria-label="' + T.place + '">' + (s.place ? ' ' + entLink('place:' + s.place, 'abrir', 'note') : '') + '</p></div>' +
      '<div><span class="lbl">' + T.people + '</span><p class="chips">' + s.chars.map(c => '<span class="chip-x">' + entLink('char:' + c, c, 'chip') + '<button class="x" data-action="unit-person-del" data-unit="' + esc(id) + '" data-name="' + esc(c) + '" aria-label="Tirar ' + esc(c) + '">×</button></span>').join('') +
        '<select class="input mini-sel" data-unit-person="' + esc(id) + '" aria-label="Juntar pessoa"><option value="">+ Juntar…</option>' + sc.chars.filter(c => s.chars.indexOf(c.name) < 0).map(c => '<option>' + esc(c.name) + '</option>').join('') + '<option value="__nova">Outra pessoa…</option></select></p>' + (state.ui.newPersonFor === id ? '<form class="mini-form" data-form="unit-person-new" data-unit="' + esc(id) + '" novalidate><input class="input" id="new-person" autocomplete="off" placeholder="Nome"><button class="btn small" type="submit">Juntar</button></form>' : '') + '</div>') + '</div>' +
      (p.kind === 'music' ? '<form class="mini-form seg-split" data-form="seg-split" data-unit="' + esc(id) + '" novalidate><span class="lbl">Partir esta secção em</span><input class="input mini-in num" name="at" placeholder="' + esc(s.start ? tfmt((tsec(s.start) || 0) + 15) : '0:15') + '" aria-label="Momento onde partir"><input class="input mini-in" name="name" placeholder="Nome da nova secção" aria-label="Nome da nova secção" list="dl-parts"><button class="btn small" type="submit">Partir</button><datalist id="dl-parts">' + SONG_PARTS.map(x => '<option value="' + x + '">').join('') + '</datalist></form>' : '') +
      '<datalist id="dl-places">' + sc.places.map(x => '<option value="' + esc(x.name) + '">').join('') + '</datalist>';
    body = shotColumns(p, s, e, id, key) + propsSection(p, sc, 'scene', id) + tasksSection(p, sc, key, e) +
      '<div class="row-actions" style="margin-bottom:var(--space-section)"><button class="btn ghost small" data-action="unit-del" data-unit="' + esc(id) + '">Tirar ' + T.unit.toLowerCase() + ' ' + esc(id) + '</button></div>';
    return nav + head + body + blocksView(e);
  }
  if (kind === 'scene') {
    const s = obj, num = id;
    head = '<header class="ent-head"><span class="lbl">Cena ' + esc(num) + '</span><h2 class="display slug">' + esc(s.heading) + '</h2></header>' +
      '<div class="facts ent-facts"><div><span class="lbl">Int./Ext.</span><p>' + esc(s.ie) + '</p></div><div><span class="lbl">Momento</span><p>' + esc(s.time || '—') + '</p></div>' +
      '<div><span class="lbl">Décor</span><p>' + entLink('place:' + s.place, s.place) + '</p></div><div><span class="lbl">Personagens</span><p class="chips">' + (s.chars.length ? s.chars.map(c => entLink('char:' + c, c, 'chip')).join('') : '—') + '</p></div>' +
      '<div><span class="lbl">Páginas</span><p class="num">' + eighths(s.len) + '</p></div></div>';
    body = shotColumns(p, s, e, num, key) + propsSection(p, sc, 'scene', num) + '<details class="ent-more"><summary>Texto da cena</summary>' + sceneText(p, s) + '</details>' + tasksSection(p, sc, key, e);
  } else if (kind === 'char') {
    const c = obj, places = [];
    c.scenes.forEach(n => { const s = sc.scenes.find(x => x.n === n); if (s && places.indexOf(s.place) < 0) places.push(s.place); });
    head = '<header class="ent-head"><span class="lbl">' + T.person + '</span><h2 class="display">' + esc(c.name) + '</h2></header>' +
      '<div class="facts ent-facts">' + (p.kind === 'doc' ? '' : '<div><span class="lbl">' + (p.kind === 'music' ? 'Quem faz' : 'Ator ou atriz') + '</span><p><input class="input cast-input" id="cast-ent" data-cast="' + esc(c.name) + '" value="' + esc(c.actor) + '" placeholder="Por escolher" autocomplete="off"></p></div>') +
      '<div><span class="lbl">' + T.units.split(' ')[0] + '</span><p class="num">' + (c.scenes.length ? c.scenes.length + (manual ? '' : ' · entra na ' + c.scenes[0]) : '—') + '</p></div><div><span class="lbl">' + T.places + '</span><p class="chips">' + (places.length ? places.map(x => entLink('place:' + x, x, 'chip')).join('') : '—') + '</p></div></div>';
    body = '<section class="ent-sec"><div class="sec-head"><h3 class="h2">Onde entra</h3></div>' + (c.scenes.length ? sceneLinks(p, sc, c.scenes) : '<p class="note">Ainda não está em nenhuma ' + T.unit.toLowerCase() + '.</p>') + '</section>' + propsSection(p, sc, 'char', c.name) + tasksSection(p, sc, key, e);
  } else {
    const pc = obj, chars = [];
    pc.scenes.forEach(n => { const s = sc.scenes.find(x => x.n === n); (s ? s.chars : []).forEach(ch => { if (chars.indexOf(ch) < 0) chars.push(ch); }); });
    head = '<header class="ent-head"><span class="lbl">' + T.place + '</span><h2 class="display' + (manual ? '' : ' slug') + '">' + esc(pc.name) + '</h2></header>' +
      '<div class="facts ent-facts">' + (manual ? '' : '<div><span class="lbl">Int./Ext.</span><p>' + esc(pc.ie.join(', ')) + '</p></div><div><span class="lbl">Momentos</span><p>' + esc(pc.times.join(', ') || '—') + '</p></div>') +
      '<div><span class="lbl">' + T.units.split(' ')[0] + '</span><p class="num">' + (pc.scenes.length || '—') + '</p></div><div><span class="lbl">' + T.people + '</span><p class="chips">' + (chars.length ? chars.map(x => entLink('char:' + x, x, 'chip')).join('') : '—') + '</p></div></div>';
    body = '<section class="ent-sec"><div class="sec-head"><h3 class="h2">O que se passa aqui</h3></div>' + (pc.scenes.length ? sceneLinks(p, sc, pc.scenes) : '<p class="note">Ainda nada marcado para este ' + T.place.toLowerCase() + '.</p>') + '</section>' + propsSection(p, sc, 'place', pc.name) + tasksSection(p, sc, key, e) +
      '<section class="ent-sec"><div class="sec-head"><h3 class="h2">Mapas de luz</h3><span class="dim">A montagem base do espaço, que depois adaptas a cada cena</span></div>' + mapsStrip(p, key) + '</section>';
  }
  return nav + head + body + blocksView(e);
}
function shotsSection(p, s, e, num, key){
  const photos = projPhotos(p).filter(f => photoScene(p, f) === num);
  const shotOf = f => { const sid = e.photoShot[f.id]; if (sid) return e.shots.find(x => x.id === sid); const c = photoCode(num, f); return e.shots.find(x => x.code === c); };
  const loose = photos.filter(f => !shotOf(f));
  return '<section class="ent-sec"><div class="sec-head"><h3 class="h2">Planos</h3><span class="dim">' + pl(e.shots.length, 'plano', 'planos') + '</span></div>' +
      (e.shots.length ? e.shots.map(sh => shotCard(p, s, e, sh, photos.filter(f => shotOf(f) === sh))).join('') : '<p class="note">Ainda sem planos. Os planos aparecem sozinhos a partir das câmaras do Lighthouse e das fotos do Viewfinder, ou juntas aqui em baixo.</p>') +
      '<form class="shot-add" data-form="ent-shot" novalidate><label class="field"><span>Enquadramento</span><select class="input" id="es-size">' + Object.keys(SIZES).map(k => '<option value="' + k + '">' + SIZES[k] + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>Lente</span><input class="input" id="es-lens" placeholder="35 mm" autocomplete="off"></label><label class="field"><span>Movimento</span><input class="input" id="es-move" placeholder="Fixo" autocomplete="off"></label>' +
      '<label class="field"><span>O que se vê</span><input class="input" id="es-desc" autocomplete="off"></label><button class="btn primary" type="submit">Juntar plano ' + esc(num + shotLetter(e.shots.length)) + '</button></form>' +
      (loose.length ? '<div class="loose"><span class="lbl">Fotos do Viewfinder sem plano</span><div class="photos">' + loose.map(f => '<div class="stack">' + vfCard(f) + '<select class="input" data-assign="' + f.id + '" aria-label="Plano desta foto"><option value="">Juntar ao plano…</option>' + e.shots.map(x => '<option value="' + x.id + '">' + esc(x.code) + '</option>').join('') + '</select></div>').join('') + '</div></div>' : '') + '</section>' +
      '<section class="ent-sec"><div class="sec-head"><h3 class="h2">Mapas de luz</h3><span class="src">do Lighthouse</span></div><div class="ent-grid">' +
      '<div class="stack"><span class="lbl">Do Lighthouse</span>' + (s.lhItems && s.lhItems.length ? '<div>' + lhButton(key, '', 'Ver o mapa de luz do Lighthouse') + '</div>' : '<p class="note">Ainda sem mapa de luz para esta cena no Lighthouse.</p>') + '</div>' +
      '<div class="stack"><span class="lbl">Feitos aqui</span>' + mapsStrip(p, key) + '</div></div></section>';
}
function unitTitle(p, s){
  const num = String(s.number || s.n);
  return num + '. ' + (s.heading || 'Sem nome') + (s.start ? ' · ' + s.start + (s.end ? '–' + s.end : '') : '');
}
function personBlocks(kind){
  if (kind === 'doc') return [newBlock('note', 'Quem é'), newBlock('fields', 'Contacto', {rows:[['Telefone', ''], ['Email', ''], ['Disponibilidade', ''], ['Autorização de imagem', '']]}), newBlock('list', 'Guião da entrevista'), newBlock('note', 'Notas da conversa')];
  if (kind === 'ad') return [newBlock('note', 'Perfil'), newBlock('fields', 'Agência e contacto', {rows:[['Agência', ''], ['Contacto', ''], ['Cachet', ''], ['Direitos de imagem', '']]}), newBlock('images', 'Fotos e self-tapes'), newBlock('images', 'Guarda-roupa')];
  if (kind === 'music') return [newBlock('note', 'Papel no vídeo'), newBlock('images', 'Guarda-roupa e caracterização'), newBlock('fields', 'Contacto', {rows:[['Contacto', ''], ['Disponibilidade', '']]})];
  return [newBlock('note', 'Descrição'), newBlock('images', 'Guarda-roupa e referências'), newBlock('note', 'Caracterização')];
}

/* ---------- páginas de base: brief, tratamento, aprovações, arquivo ---------- */
function docDefaults(kind, k){
  if (k === 'brief') return [newBlock('fields', 'Brief', {rows:[['Cliente', ''], ['Agência', ''], ['Marca e produto', ''], ['Mensagem-chave', ''], ['Público', ''], ['Duração', ''], ['Formatos e entregáveis', ''], ['Mandatórios', ''], ['Data de entrega', '']]}), newBlock('note', 'Notas da reunião com o cliente'), newBlock('images', 'Referências do cliente')];
  if (k === 'approvals') return [newBlock('list', 'Aprovações do cliente', {items:['Tratamento', 'Casting', 'Locais', 'Guarda-roupa e arte', 'Storyboard', 'Offline (montagem)', 'Cor', 'Som e música', 'Versão final e formatos'].map(t => ({t, done:false}))}), newBlock('note', 'Comentários do cliente')];
  if (k === 'archive') return [newBlock('list', 'Material de arquivo a procurar'), newBlock('list', 'Direitos e autorizações'), newBlock('images', 'Arquivo já encontrado'), newBlock('note', 'Notas')];
  if (kind === 'ad') return [newBlock('note', 'Ideia'), newBlock('note', 'Tom e abordagem'), newBlock('images', 'Referências visuais'), newBlock('note', 'Look, cor e luz'), newBlock('note', 'Casting'), newBlock('note', 'Música e som')];
  if (kind === 'doc') return [newBlock('note', 'Sinopse'), newBlock('note', 'Tema e pergunta central'), newBlock('note', 'Abordagem e estilo'), newBlock('note', 'Protagonistas'), newBlock('note', 'Estrutura'), newBlock('images', 'Referências'), newBlock('list', 'Acessos e autorizações')];
  return [newBlock('note', 'Conceito'), newBlock('note', 'Narrativa'), newBlock('note', 'Performance'), newBlock('images', 'Referências visuais'), newBlock('note', 'Look, cor e guarda-roupa'), newBlock('note', 'Locais')];
}
function docPage(p, key){
  const k = key.slice(4), d = KT(p).docs.find(x => x[0] === k);
  if (!p.entities[key]) { p.entities[key] = {blocks:docDefaults(p.kind, k), photoShot:{}}; persist(p); }
  const notes = {brief:'O que o cliente pediu, num só sítio. Os campos mudam-se e juntam-se à vontade.', treatment:'É a base do projeto: o que queres fazer e como. Junta blocos de texto, imagens e listas à medida.', approvals:'Marca cada aprovação quando o cliente a der.', archive:'O material que não vais filmar mas que entra no filme.'};
  return '<header class="page-head"><div class="page-title"><span class="lbl">' + KT(p).base + '</span><h2 class="display">' + esc(d ? d[1] : 'Documento') + '</h2><p class="dim">' + (notes[k] || '') + '</p></div><div class="page-tools"><button class="btn small" data-action="doc-attach" data-page="' + esc(key) + '">' + (docsOf(p, key).length ? 'Juntar nova versão' : 'Juntar ficheiro') + '</button></div></header>' +
    docVersions(p, key, 'Ficheiros de ' + (d ? d[1].toLowerCase() : 'documento')) + blocksView(p.entities[key], true);
}

/* ---------- secções, momentos e sequências criadas à mão ---------- */
function segTimeline(p, sc){
  const secs = sc.scenes.map((s, i) => ({s, i, a:tsec(s.start), b:tsec(s.end)}));
  const dur = tsec(p.script && p.script.duration) || secs.reduce((m, x) => Math.max(m, x.b || 0, x.a || 0), 0);
  const timed = dur > 0 && secs.some(x => x.a != null);
  const blocks = secs.map((x, k) => {
    const nx = secs.filter(y => y.a != null && x.a != null && y.a > x.a).sort((m, n) => m.a - n.a)[0];
    const a = x.a, b = x.b != null ? x.b : nx ? nx.a : dur;
    const style = timed && a != null && b != null && b > a ? 'left:' + (a / dur * 100).toFixed(2) + '%;width:' + ((b - a) / dur * 100).toFixed(2) + '%' : '';
    return {x, style, col:SEG_COL[k % SEG_COL.length], a, b};
  });
  const flow = !timed || blocks.some(bk => !bk.style);
  const shots = s0 => ((p.entities['scene:' + s0.number] || {}).shots || []).length;
  const blk = bk => '<button class="seg-b" data-action="ent" data-ent="' + esc('scene:' + bk.x.s.number) + '" style="--sc:' + bk.col + ';' + (flow ? '' : bk.style) + '" title="' + esc(bk.x.s.heading || 'Sem nome') + '"><b>' + esc(bk.x.s.heading || 'Sem nome') + '</b><span class="num">' + (bk.a != null ? tfmt(bk.a) + (bk.b != null ? '–' + tfmt(bk.b) : '') : '') + '</span><span class="seg-meta">' + [unitPlaces(bk.x.s).length ? pl(unitPlaces(bk.x.s).length, 'décor', 'décors') : '', bk.x.s.chars.length ? pl(bk.x.s.chars.length, 'pessoa', 'pessoas') : '', shots(bk.x.s) ? pl(shots(bk.x.s), 'plano', 'planos') : ''].filter(Boolean).join(' · ') + '</span></button>';
  const ticks = timed && !flow ? Array.from({length:Math.floor(dur / 30) + 1}, (_, i) => '<i style="left:' + (i * 30 / dur * 100).toFixed(2) + '%"><span>' + tfmt(i * 30) + '</span></i>').join('') : '';
  return '<section class="seg panel"><div class="seg-head"><b>A música</b><label class="seg-dur"><span class="dim">Duração</span><input class="input mini-in num" data-seg-duration value="' + esc((p.script && p.script.duration) || '') + '" placeholder="3:45" aria-label="Duração da música"></label>' +
    (sc.scenes.length ? '' : '<button class="btn small" data-action="seg-auto">Partir com as secções habituais</button>') + '</div>' +
    (sc.scenes.length ? '<div class="seg-track' + (flow ? ' flow' : '') + '">' + blocks.map(blk).join('') + '</div>' + (ticks ? '<div class="seg-ticks">' + ticks + '</div>' : '') +
      (flow && sc.scenes.length ? '<p class="note">Escreve quando começa e acaba cada secção (e a duração da música) para a barra ficar à escala.</p>' : '')
      : '<p class="dim">Ainda sem secções. Junta-as em baixo, uma a uma, ou parte já com as secções habituais de uma música (intro, versos, refrões, ponte).</p>') + '</section>';
}
function segFacts(p, sc, s, id){
  const pls = unitPlaces(s), actors = s.chars.filter(c => !isExtra(p, c)), extras = s.chars.filter(c => isExtra(p, c));
  const chipsOf = (list, kind) => list.map(c => '<span class="chip-x">' + entLink((kind === 'place' ? 'place:' : 'char:') + c, c, 'chip' + (kind === 'extra' ? ' chip-extra' : '')) + '<button class="x" data-action="seg-del" data-kind="' + kind + '" data-unit="' + esc(id) + '" data-name="' + esc(c) + '" aria-label="Tirar ' + esc(c) + '">×</button></span>').join('');
  const opts = kind => kind === 'place' ? sc.places.filter(x => pls.indexOf(x.name) < 0).map(x => '<option>' + esc(x.name) + '</option>').join('') : sc.chars.filter(c => s.chars.indexOf(c.name) < 0 && (kind === 'extra' ? isExtra(p, c.name) : !isExtra(p, c.name))).map(c => '<option>' + esc(c.name) + '</option>').join('');
  const adder = (kind, label) => '<select class="input mini-sel" data-seg-add="' + kind + '" data-unit="' + esc(id) + '" aria-label="Juntar ' + label + '"><option value="">+ Juntar…</option>' + opts(kind) + '<option value="__nova">' + (kind === 'place' ? 'Outro décor…' : kind === 'extra' ? 'Outro figurante…' : 'Outro ator ou atriz…') + '</option></select>' +
    (state.ui.segNew && state.ui.segNew.unit === id && state.ui.segNew.kind === kind ? '<form class="mini-form" data-form="seg-new" data-kind="' + kind + '" data-unit="' + esc(id) + '" novalidate><input class="input" id="seg-new-in" autocomplete="off" placeholder="Nome"><button class="btn small" type="submit">Juntar</button></form>' : '');
  return '<div class="seg-fact"><span class="lbl">Décors</span><p class="chips">' + chipsOf(pls, 'place') + adder('place', 'décor') + '</p></div>' +
    '<div class="seg-fact"><span class="lbl">Atores</span><p class="chips">' + chipsOf(actors, 'actor') + adder('actor', 'ator ou atriz') + '</p></div>' +
    '<div class="seg-fact"><span class="lbl">Figurantes</span><p class="chips">' + chipsOf(extras, 'extra') + adder('extra', 'figurante') + '</p></div>';
}
function manualListView(p, sc){
  const T = KT(p), cat = state.ui.cat || 'cenas';
  const shotsOf = s => ((p.entities['scene:' + s.number] || {}).shots || []).length;
  const tcount = key => (p.tasks || []).filter(t => t.status !== 'done' && t.target === key).length;
  let body = '';
  if (cat === 'cenas') {
    body = (sc.scenes.length ? '<div class="table-wrap"><table class="breakdown"><thead><tr><th>Nº</th><th>' + T.unit + '</th>' + (T.times ? '<th>Tempo</th>' : '') + '<th>' + (T.times ? T.places : T.place) + '</th><th>' + T.people + '</th><th>Planos</th><th>Tarefas</th></tr></thead><tbody>' +
      sc.scenes.map(s => '<tr data-action="ent" data-ent="' + esc('scene:' + s.number) + '" tabindex="0"><td class="code">' + esc(s.number) + '</td><td><b>' + esc(s.heading || 'Sem nome') + '</b></td>' + (T.times ? '<td class="num">' + (s.start ? esc(s.start) + (s.end ? '–' + esc(s.end) : '') : '—') + '</td>' : '') +
        '<td>' + esc(unitPlaces(s).join(', ') || '—') + '</td><td><span class="chips">' + (s.chars.length ? s.chars.map(c => '<span class="chip' + (isExtra(p, c) ? ' chip-extra' : '') + '">' + esc(c) + '</span>').join('') : '<span class="dim">—</span>') + '</span></td><td class="num">' + (shotsOf(s) || '—') + '</td><td class="num">' + (tcount('scene:' + s.number) || '—') + '</td></tr>').join('') +
      '</tbody></table></div>' : '<div class="empty"><p>' + (T.times ? 'Divide a música em secções (intro, versos, refrões…) com o tempo de cada uma. Cada secção tem depois os seus planos, storyboard e mapas de luz.' : p.kind === 'ad' ? 'Divide o spot em momentos. Cada momento tem depois os seus planos, storyboard e mapas de luz.' : 'Cria as sequências do filme à medida que as descobres. Cada sequência tem depois os seus planos e mapas de luz.') + '</p></div>') +
      '<form class="unit-add" data-form="unit-add" novalidate><label class="field"><span>Nome</span><input class="input" name="name" list="dl-parts" autocomplete="off" placeholder="' + (T.times ? 'Ex.: Refrão' : p.kind === 'ad' ? 'Ex.: Abertura, produto em cena' : 'Ex.: A oficina do avô') + '"></label>' +
      (T.times ? '<label class="field"><span>Começa</span><input class="input num" name="start" placeholder="0:00" autocomplete="off"></label><label class="field"><span>Acaba</span><input class="input num" name="end" placeholder="0:30" autocomplete="off"></label>' : '') +
      '<label class="field"><span>' + T.place + '</span><input class="input" name="place" list="dl-places" autocomplete="off"></label><button class="btn primary" type="submit">Juntar</button></form><p class="form-msg"></p>' +
      '<datalist id="dl-parts">' + (T.times ? SONG_PARTS.map(x => '<option value="' + x + '">').join('') : '') + '</datalist><datalist id="dl-places">' + sc.places.map(x => '<option value="' + esc(x.name) + '">').join('') + '</datalist>';
  } else if (cat === 'personagens') {
    body = (sc.chars.length ? '<div class="table-wrap"><table class="breakdown"><thead><tr><th>Nome</th>' + (p.kind === 'doc' ? '' : '<th>' + (p.kind === 'music' ? 'Quem faz' : 'Ator ou atriz') + '</th>') + '<th>Onde entra</th><th>Tarefas</th></tr></thead><tbody>' +
      sc.chars.slice().sort((a, b) => (isExtra(p, a.name) - isExtra(p, b.name))).map(c => '<tr data-action="ent" data-ent="' + esc('char:' + c.name) + '" tabindex="0"><td class="code">' + esc(c.name) + (p.kind === 'music' ? ' <span class="chip' + (isExtra(p, c.name) ? ' chip-extra">Figurante' : '">Ator ou atriz') + '</span>' : '') + '</td>' + (p.kind === 'doc' ? '' : '<td>' + (c.actor ? esc(c.actor) : '<span class="dim">Por escolher</span>') + '</td>') + '<td class="num">' + (c.scenes.join(', ') || '—') + '</td><td class="num">' + (tcount('char:' + c.name) || '—') + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty"><p>Ainda ninguém. Juntas aqui ' + (p.kind === 'doc' ? 'os protagonistas e as pessoas a entrevistar' : p.kind === 'ad' ? 'as pessoas do casting' : 'o artista e o elenco') + '.</p></div>') +
      '<form class="mini-form add-row" data-form="person-add" novalidate><input class="input" autocomplete="off" placeholder="Nome" aria-label="Nome"><button class="btn primary small" type="submit">Juntar</button></form>';
  } else {
    body = (sc.places.length ? '<div class="table-wrap"><table class="breakdown"><thead><tr><th>' + T.place + '</th><th>Onde entra</th><th>Tarefas</th></tr></thead><tbody>' +
      sc.places.map(x => '<tr data-action="ent" data-ent="' + esc('place:' + x.name) + '" tabindex="0"><td><b>' + esc(x.name) + '</b></td><td class="num">' + (x.scenes.join(', ') || '—') + '</td><td class="num">' + (tcount('place:' + x.name) || '—') + '</td></tr>').join('') + '</tbody></table></div>'
      : '<div class="empty"><p>Ainda sem locais.</p></div>') +
      '<form class="mini-form add-row" data-form="place-add" novalidate><input class="input" autocomplete="off" placeholder="Nome do local" aria-label="Nome do local"><button class="btn primary small" type="submit">Juntar</button></form>';
  }
  const title = {cenas:T.units, personagens:T.people, decors:T.places}[cat];
  if (cat === 'cenas' && p.kind === 'music') body = segTimeline(p, sc) + body;
  return '<header class="page-head"><div class="page-title"><span class="lbl">' + T.base + '</span><h2 class="display">' + esc(title) + '</h2>' + (cat === 'cenas' && p.kind === 'music' ? '<p class="dim">Parte o clipe em secções. Cada secção funciona como uma cena: tem décors, atores, figurantes, planos e storyboard.</p>' : '') + '</div></header>' + body;
}

/* ---------- tarefas ---------- */
const TASK_ST = {todo:'Por fazer', doing:'Em curso', done:'Feita'};
function assigneeOptions(p, sel){
  const o = (v, l) => '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(l) + '</option>';
  return o('', 'Ninguém') + '<optgroup label="Pessoas">' + o('me', state.me.name + ' (tu)') + (p.members || []).map(m => o('m:' + m.id, m.name + ' · ' + m.role)).join('') + '</optgroup>' +
    '<optgroup label="Departamentos">' + p.groups.map(g => o('d:' + g.name, g.name)).join('') + '</optgroup>';
}
function assigneeLabel(p, a){
  if (!a) return '';
  if (a === 'me') return state.me.name;
  if (a.indexOf('m:') === 0) { const m = (p.members || []).find(x => x.id === a.slice(2)); return m ? m.name : 'Pessoa que saiu'; }
  return a.slice(2);
}
function targetInfo(p, sc, key){
  if (!key) return {label:'Geral', ent:null};
  const T = KT(p);
  if (key.indexOf('shot:') === 0) { const F = findShot(p, key.slice(5)); return F ? {label:'Plano ' + F.sh.code, ent:F.key} : {label:'Plano tirado', ent:null}; }
  const [kind] = key.split(':'), id = key.slice(kind.length + 1);
  if (kind === 'prop') { const pr = (p.props || []).find(x => x.id === id); return pr ? {label:'Adereço · ' + pr.name, ent:key} : {label:'Adereço tirado', ent:null}; }
  if (kind === 'scene') { const s = sc && sc.scenes.find(x => String(x.number || x.n) === id); return {label:T.unit + ' ' + id + (s && s.heading ? ' · ' + (sc.source === 'manual' ? s.heading : s.place) : ''), ent:key}; }
  return {label:id, ent:key};
}
function targetOptions(p, sc, sel, onlyKey){
  const T = KT(p), o = (v, l) => '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(l) + '</option>';
  if (onlyKey) {
    const E = p.entities[onlyKey];
    return o(onlyKey, targetInfo(p, sc, onlyKey).label) + (E && E.shots && E.shots.length ? '<optgroup label="Planos">' + E.shots.map(sh => o('shot:' + sh.id, 'Plano ' + sh.code)).join('') + '</optgroup>' : '');
  }
  if (!sc) return o('', 'Geral');
  const shots = [];
  sc.scenes.forEach(s => { const E = p.entities['scene:' + (s.number || s.n)]; (E && E.shots || []).forEach(sh => shots.push(o('shot:' + sh.id, 'Plano ' + sh.code))); });
  return o('', 'Geral') + '<optgroup label="' + T.units + '">' + sc.scenes.map(s => o('scene:' + (s.number || s.n), targetInfo(p, sc, 'scene:' + (s.number || s.n)).label)).join('') + '</optgroup>' +
    '<optgroup label="' + T.people + '">' + sc.chars.map(c => o('char:' + c.name, c.name)).join('') + '</optgroup>' +
    '<optgroup label="' + T.places + '">' + sc.places.map(x => o('place:' + x.name, x.name)).join('') + '</optgroup>' + (shots.length ? '<optgroup label="Planos">' + shots.join('') + '</optgroup>' : '');
}
const TASK_SORTS = [['urg','Urgência (prazo)'],['az','Nome (A–Z)'],['status','Estado']];
function sortTasks(list){
  const k = state.ui.taskSort || 'urg', order = {doing:0, todo:1, done:2};
  const due = t => t.due || '9999-12-31', az = (a, b) => (a.title || '').localeCompare(b.title || '', 'pt');
  return list.slice().sort((a, b) => {
    const d = (a.status === 'done') - (b.status === 'done'); if (d) return d;
    if (k === 'az') return az(a, b);
    if (k === 'status') return (order[a.status] - order[b.status]) || (due(a) < due(b) ? -1 : due(a) > due(b) ? 1 : az(a, b));
    if (a.status === 'done') return (b.doneAt || '').localeCompare(a.doneAt || '');
    return due(a) < due(b) ? -1 : due(a) > due(b) ? 1 : (order[a.status] - order[b.status]) || az(a, b);
  });
}
function dueTag(t, t0){
  if (!t.due || t.status === 'done') return '';
  const days = Math.round((pd(t.due) - pd(t0)) / 864e5);
  if (days < 0) return '<span class="late-tag">atrasada</span>';
  if (days === 0) return '<span class="due-tag soon">hoje</span>';
  if (days === 1) return '<span class="due-tag soon">amanhã</span>';
  if (days <= 7) return '<span class="due-tag">em ' + days + ' dias</span>';
  return '';
}
function taskRows(p, sc, list, showTarget){
  const t0 = today();
  return sortTasks(list).map(t => {
    const ti = targetInfo(p, sc, t.target), late = t.due && t.due < t0 && t.status !== 'done';
    const ac = t.assignee && t.assignee.indexOf('d:') === 0 ? deptColor(p, t.assignee.slice(2)) : '';
    return '<tr class="task' + (t.status === 'done' ? ' done' : '') + (late ? ' late' : '') + '"' + (ac ? ' style="--dc:' + esc(ac) + '"' : '') + '><td><button class="tstat ' + t.status + '" data-action="task-status" data-id="' + t.id + '" aria-label="Estado: ' + TASK_ST[t.status] + '. Clica para mudar">' + TASK_ST[t.status] + '</button></td>' +
      '<td class="task-title"><span contenteditable="true" data-task-title="' + t.id + '">' + esc(t.title) + '</span>' + (t.status === 'done' && t.doneAt ? '<small class="done-at">feita a ' + dm(t.doneAt) + '</small>' : '') + '</td>' +
      (showTarget ? '<td>' + (ti.ent ? entLink(ti.ent, ti.label) : esc(ti.label)) + '</td>' : (t.target && t.target.indexOf('shot:') === 0 ? '<td>' + esc(ti.label) + '</td>' : '<td class="dim">—</td>')) +
      '<td><span class="who">' + dot(ac) + '<select class="input mini-sel" data-task-assignee="' + t.id + '" aria-label="Responsável">' + assigneeOptions(p, t.assignee || '') + '</select></span></td>' +
      '<td><input class="input mini-in num" type="date" data-task-due="' + t.id + '" value="' + esc(t.due || '') + '" aria-label="Prazo">' + dueTag(t, t0) + '</td>' +
      '<td><button class="x" data-action="task-del" data-scope="task" data-id="' + t.id + '" aria-label="Tirar tarefa">×</button></td></tr>';
  }).join('');
}
function taskForm(p, sc, onlyKey){
  return '<form class="task-add" data-form="todo-add" novalidate><label class="field grow"><span>O que falta fazer</span><input class="input" name="title" autocomplete="off" placeholder="Ex.: Confirmar autorização do local"></label>' +
    '<label class="field"><span>Sobre</span><select class="input" name="target">' + targetOptions(p, sc, onlyKey || '', onlyKey) + '</select></label>' +
    '<label class="field"><span>Responsável</span><select class="input" name="assignee">' + assigneeOptions(p, '') + '</select></label>' +
    '<label class="field"><span>Prazo</span><input class="input num" type="date" name="due"></label><button class="btn primary" type="submit">Juntar tarefa</button></form><p class="form-msg"></p>';
}
function tasksSection(p, sc, key, e){
  const mine = (p.tasks || []).filter(t => t.target === key || (t.target && t.target.indexOf('shot:') === 0 && e && e.shots && e.shots.some(sh => 'shot:' + sh.id === t.target)));
  const open = mine.filter(t => t.status !== 'done').length;
  const openL = mine.filter(t => t.status !== 'done'), doneL = mine.filter(t => t.status === 'done'), showD = (state.ui.doneOpen || {})[key];
  return '<section class="ent-sec"><div class="sec-head"><h3 class="h2">Tarefas</h3><span class="dim">' + (mine.length ? open + ' por fazer de ' + mine.length : 'Nada pendente') + '</span></div>' +
    (openL.length ? '<div class="table-wrap"><table class="tasks"><tbody>' + taskRows(p, sc, openL, false) + '</tbody></table></div>' : '') +
    (doneL.length ? '<button class="done-toggle" data-action="done-toggle" data-key="' + esc(key) + '" aria-expanded="' + !!showD + '">' + (showD ? 'Esconder' : 'Mostrar') + ' ' + pl(doneL.length, 'tarefa feita', 'tarefas feitas') + '</button>' + (showD ? '<div class="table-wrap"><table class="tasks tasks-done"><tbody>' + taskRows(p, sc, doneL, false) + '</tbody></table></div>' : '') : '') +
    taskForm(p, sc, key) + '</section>';
}
function tasksPage(p){
  const sc = getScript(p), f = state.ui.tf || {}, all = p.tasks || [], t0 = today();
  const list = all.filter(t => {
    if ((f.status || 'open') === 'open' && t.status === 'done') return false;
    if (f.status && f.status !== 'open' && f.status !== 'all' && t.status !== f.status) return false;
    if (f.who) { if (f.who === 'none' ? t.assignee : t.assignee !== f.who) return false; }
    if (f.what) { const k = (t.target || '').split(':')[0] || 'geral'; if (k !== f.what) return false; }
    return true;
  });
  const c = st => all.filter(t => t.status === st).length, late = all.filter(t => t.due && t.due < t0 && t.status !== 'done').length;
  const T = KT(p), o = (v, l, cur) => '<option value="' + v + '"' + (v === (cur || '') ? ' selected' : '') + '>' + esc(l) + '</option>';
  return '<header class="page-head"><div class="page-title"><span class="lbl">Equipa</span><h2 class="display">Tarefas</h2><p class="dim">' + c('todo') + ' por fazer · ' + c('doing') + ' em curso · ' + c('done') + ' feitas' + (late ? ' · <b class="late-txt">' + pl(late, 'atrasada', 'atrasadas') + '</b>' : '') + '</p></div></header>' +
    '<div class="tfilters"><label class="field"><span>Estado</span><select class="input" data-tf="status">' + o('open', 'Por fazer e em curso', f.status || 'open') + o('todo', 'Só por fazer', f.status) + o('doing', 'Só em curso', f.status) + o('done', 'Feitas', f.status) + o('all', 'Todas', f.status) + '</select></label>' +
      '<label class="field"><span>Responsável</span><select class="input" data-tf="who">' + o('', 'Toda a gente', f.who) + o('none', 'Sem responsável', f.who) + o('me', state.me.name + ' (tu)', f.who) + (p.members || []).map(m => o('m:' + m.id, m.name, f.who)).join('') + p.groups.map(g => o('d:' + g.name, g.name + ' (departamento)', f.who)).join('') + '</select></label>' +
      '<label class="field"><span>Sobre</span><select class="input" data-tf="what">' + o('', 'Tudo', f.what) + o('scene', T.units, f.what) + o('char', T.people, f.what) + o('place', T.places, f.what) + o('shot', 'Planos', f.what) + o('prop', 'Adereços', f.what) + o('geral', 'Geral', f.what) + '</select></label>' +
      '<label class="field"><span>Ordenar por</span><select class="input" data-task-sort>' + TASK_SORTS.map(([k, l]) => o(k, l, state.ui.taskSort || 'urg')).join('') + '</select></label>' +
      ((f.status && f.status !== 'open') || f.who || f.what ? '<button class="btn ghost small" data-action="tf-clear">Limpar filtros</button>' : '') + '</div>' +
    (list.length ? '<div class="table-box table-wrap"><table class="tasks"><thead><tr><th>Estado</th><th>Tarefa</th><th>Sobre</th><th>Responsável</th><th>Prazo</th><th></th></tr></thead><tbody>' + taskRows(p, sc, list, true) + '</tbody></table></div>'
      : '<div class="empty"><p>' + (all.length ? ((f.status || 'open') === 'open' && !f.who && !f.what ? 'Está tudo feito.' : 'Nenhuma tarefa com estes filtros.') : 'Ainda sem tarefas. Juntas aqui em baixo, ou na página de cada ' + T.unit.toLowerCase() + ', ' + T.person.toLowerCase() + ' ou ' + T.place.toLowerCase() + '.') + '</p></div>') +
    doneSection() +
    '<section class="ent-sec section-gap"><div class="sec-head"><h3 class="h2">Nova tarefa</h3></div>' + taskForm(p, sc, null) + '</section>';
  function doneSection(){
    if ((f.status || 'open') !== 'open') return '';
    const dl = all.filter(t => t.status === 'done' && (!f.who || (f.who === 'none' ? !t.assignee : t.assignee === f.who)) && (!f.what || ((t.target || '').split(':')[0] || 'geral') === f.what));
    if (!dl.length) return '';
    const showD = (state.ui.doneOpen || {}).__page;
    return '<section class="done-sec"><button class="done-toggle" data-action="done-toggle" data-key="__page" aria-expanded="' + !!showD + '"><span class="tstat done" aria-hidden="true">Feita</span> ' + (showD ? 'Esconder' : 'Ver') + (dl.length === 1 ? ' a tarefa feita' : ' as ' + dl.length + ' tarefas feitas') + '</button>' +
      (showD ? '<div class="table-box table-wrap"><table class="tasks tasks-done"><tbody>' + taskRows(p, sc, dl, true) + '</tbody></table></div>' : '') + '</section>';
  }
}
/* ---------- orçamento ---------- */
function getBudget(p){
  if (!p.budget) p.budget = defaultBudget();
  const b = p.budget;
  if (!b.cols.some(c => c.id === b.main && c.type === 'money')) { const m = b.cols.find(c => c.type === 'money'); b.main = m ? m.id : null; }
  return b;
}
function budgetBadge(p){
  const b = p.budget; if (!b || b.total == null || !b.main) return '';
  const t = budgetSums(b).sums[b.main] || 0; return Math.round(t / b.total * 100) + ' %';
}
function budgetSummary(b){
  const {sums} = budgetSums(b), spent = b.main ? sums[b.main] || 0 : 0, has = b.total != null && b.total > 0;
  const pct = has ? spent / b.total : 0, diff = has ? b.total - spent : 0;
  const st = !has ? 'none' : diff < 0 ? 'over' : pct >= 0.9 ? 'near' : 'ok';
  return '<div class="bsum-grid"><div><span class="lbl">Total da tabela</span><b class="bbig num">' + money(spent) + '</b></div>' +
    (has ? '<div><span class="lbl">' + (diff < 0 ? 'Passa' : 'Sobram') + '</span><b class="bbig num bst-' + st + '">' + money(Math.abs(diff)) + '</b></div>' : '') +
    '<div class="bstate"><span class="bchip bst-' + st + '">' + (st === 'none' ? 'Sem orçamento geral definido' : st === 'over' ? 'Fora do orçamento' : st === 'near' ? 'Dentro, mas perto do limite' : 'Dentro do orçamento') + '</span></div></div>' +
    (has ? '<div class="bbar" role="img" aria-label="' + Math.round(pct * 100) + ' % do orçamento geral"><span class="bst-' + st + '" style="width:' + Math.min(100, pct * 100).toFixed(1) + '%"></span>' + (pct > 1 ? '<i style="left:' + (100 / pct).toFixed(1) + '%"></i>' : '') + '</div><p class="dim num bpct">' + Math.round(pct * 100) + ' % do orçamento geral' + (pct > 1 ? ' · a linha marca o limite' : '') + '</p>' : '');
}
function budgetPage(p){
  const b = getBudget(p), {sums, secSums} = budgetSums(b), moneyCols = b.cols.filter(c => c.type === 'money');
  const nCols = b.cols.length, firstNum = b.cols.findIndex(c => c.type !== 'text');
  const head = '<tr>' + b.cols.map((c, i) => '<th class="' + (c.type === 'text' ? '' : 'th-num') + '"><div class="bth"><input class="bth-in" data-bcol="' + c.id + '" value="' + esc(c.name) + '" aria-label="Nome da coluna" spellcheck="false">' +
    '<span class="bth-tools"><select class="bth-type" data-bcol-type="' + c.id + '" aria-label="Tipo da coluna ' + esc(c.name) + '">' + BUDGET_TYPES.map(([k, l]) => '<option value="' + k + '"' + (k === c.type ? ' selected' : '') + '>' + l + '</option>').join('') + '</select>' +
    (i > 0 ? '<button class="x" data-action="bcol-left" data-id="' + c.id + '" aria-label="Mover a coluna para a esquerda" title="Mover para a esquerda">‹</button>' : '') +
    (nCols > 1 ? '<button class="x" data-action="bcol-del" data-id="' + c.id + '" aria-label="Tirar a coluna ' + esc(c.name) + '" title="Tirar coluna">×</button>' : '') + '</span></div></th>').join('') +
    '<th class="bact"><button class="btn ghost small" data-action="bcol-add" title="Juntar coluna">+ Coluna</button></th></tr>';
  const rowTools = (r, i) => '<td class="bact"><span class="brow-tools">' + (i > 0 ? '<button class="x" data-action="brow-up" data-id="' + r.id + '" aria-label="Subir" title="Subir">↑</button>' : '') + (i < b.rows.length - 1 ? '<button class="x" data-action="brow-down" data-id="' + r.id + '" aria-label="Descer" title="Descer">↓</button>' : '') + '<button class="x" data-action="brow-del" data-id="' + r.id + '" aria-label="Tirar a linha" title="Tirar">×</button></span></td>';
  const body = b.rows.map((r, i) => {
    if (r.kind === 'section') {
      const span = firstNum < 0 ? nCols : Math.max(1, firstNum);
      return '<tr class="bsec"><td colspan="' + span + '"><input class="bsec-in" data-bsec-title="' + r.id + '" value="' + esc(r.title || '') + '" placeholder="Nome da secção" aria-label="Nome da secção" spellcheck="false"></td>' +
        b.cols.slice(span).map(c => '<td class="num">' + (c.type === 'text' ? '' : '<span data-bsec="' + r.id + ':' + c.id + '">' + (secSums[r.id] && secSums[r.id][c.id] != null ? cellShow(c, secSums[r.id][c.id]) : '') + '</span>') + '</td>').join('') + rowTools(r, i) + '</tr>';
    }
    return '<tr class="bitem">' + b.cols.map(c => { const v = (r.cells || {})[c.id]; return '<td' + (c.type === 'text' ? '' : ' class="num"') + '><input class="bcell' + (c.type === 'text' ? '' : ' bnum') + '" data-bcell="' + r.id + ':' + c.id + '" value="' + esc(c.type === 'text' ? (v || '') : cellShow({type:'number'}, v)) + '"' + (c.type === 'text' ? '' : ' inputmode="decimal"') + ' aria-label="' + esc(c.name) + '" spellcheck="false"></td>'; }).join('') + rowTools(r, i) + '</tr>';
  }).join('');
  const foot = '<tr class="btotal"><td' + (firstNum > 0 ? ' colspan="' + firstNum + '"' : '') + '><b>Total</b></td>' + (firstNum < 0 ? '' : b.cols.slice(Math.max(0, firstNum)).map(c => '<td class="num">' + (c.type === 'text' ? '' : '<b data-bsum="' + c.id + '">' + cellShow(c, sums[c.id] || 0) + '</b>') + '</td>').join('')) + '<td class="bact"></td></tr>';
  return '<header class="page-head"><div class="page-title"><span class="lbl">Gestão · ' + dot(deptColor(p, 'Produção')) + 'Produção</span><h2 class="display">Orçamento</h2><p class="dim">Soma tudo o que está na tabela e compara com o orçamento geral do projeto.</p></div></header>' +
    '<section class="panel bsum"><div class="btotal-in"><label class="field"><span>Orçamento geral do projeto</span><span class="money-in"><input class="input num" id="budget-total" data-budget-total inputmode="decimal" value="' + (b.total != null ? esc(cellShow({type:'number'}, b.total)) : '') + '" placeholder="Ex.: 8000" autocomplete="off"><i>€</i></span></label>' +
      (moneyCols.length > 1 ? '<label class="field"><span>Compara com a coluna</span><select class="input" data-budget-main>' + moneyCols.map(c => '<option value="' + c.id + '"' + (c.id === b.main ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') + '</select></label>' : '') + '</div>' +
      '<div id="bsum">' + budgetSummary(b) + '</div></section>' +
    '<div class="btools"><label class="field"><span>Modelo</span><select class="input" data-budget-tpl><option value="">Escolher modelo…</option>' + BUDGET_TEMPLATES.map(([k, l]) => '<option value="' + k + '">' + l + '</option>').join('') + '</select></label>' +
      '<button class="btn small" data-action="budget-import">Importar Excel ou CSV</button><button class="btn small" data-action="budget-export">Exportar para Excel</button></div>' +
    '<div class="table-box table-wrap"><table class="budget"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>' +
    '<div class="row-actions" style="margin-top:12px"><button class="btn small" data-action="brow-add">+ Linha</button><button class="btn small" data-action="bsec-add">+ Secção</button><span class="note">' + pl(b.rows.filter(r => r.kind !== 'section').length, 'linha', 'linhas') + ' · os nomes das colunas mudam-se clicando neles</span></div>';
}
function budgetRefresh(){
  const p = cur(); if (!p || !p.budget) return; const b = p.budget, {sums, secSums} = budgetSums(b);
  b.cols.forEach(c => { const el = document.querySelector('[data-bsum="' + c.id + '"]'); if (el) el.textContent = cellShow(c, sums[c.id] || 0); });
  document.querySelectorAll('[data-bsec]').forEach(el => { const [rid, cid] = el.dataset.bsec.split(':'), c = b.cols.find(x => x.id === cid); el.textContent = secSums[rid] && secSums[rid][cid] != null && c ? cellShow(c, secSums[rid][cid]) : ''; });
  const s0 = $('#bsum'); if (s0) s0.innerHTML = budgetSummary(b);
  const nb = document.querySelector('.nav[data-id="budget"] small'); if (nb) nb.textContent = budgetBadge(p);
}
function budgetImportModal(){
  const m = state.ui.bimport, sh = m.sheets[m.si], parsed = m.parsed;
  const prev = parsed.rows.slice(0, 10);
  return '<div class="modal enter"><div class="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="bi-t"><h2 class="h2" id="bi-t">Importar orçamento</h2>' +
    '<p class="lede">' + esc(m.file) + ' · ' + pl(parsed.rows.filter(r => r.kind === 'item').length, 'linha', 'linhas') + ', ' + pl(parsed.rows.filter(r => r.kind === 'section').length, 'secção', 'secções') + '. Os totais do ficheiro não entram: a app soma sozinha.</p>' +
    (m.sheets.length > 1 ? '<label class="field"><span>Folha</span><select class="input" data-bimp-sheet>' + m.sheets.map((x, i) => '<option value="' + i + '"' + (i === m.si ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select></label>' : '') +
    '<div class="bimp-cols"><span class="lbl">Colunas encontradas</span><div class="bimp-grid">' + parsed.cols.map((c, i) => '<label class="field"><span>' + esc(c.name) + '</span><select class="input" data-bimp-type="' + i + '">' + BUDGET_TYPES.map(([k, l]) => '<option value="' + k + '"' + (k === c.type ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>').join('') + '</div></div>' +
    '<div class="table-wrap bimp-prev"><table class="budget"><thead><tr>' + parsed.cols.map(c => '<th>' + esc(c.name) + '</th>').join('') + '</tr></thead><tbody>' +
      prev.map(r => r.kind === 'section' ? '<tr class="bsec"><td colspan="' + parsed.cols.length + '"><b>' + esc(r.title) + '</b></td></tr>' : '<tr>' + parsed.cols.map(c => '<td' + (c.type === 'text' ? '' : ' class="num"') + '>' + esc(cellShow(c, r.cells[c.id])) + '</td>').join('') + '</tr>').join('') +
      (parsed.rows.length > prev.length ? '<tr><td class="dim" colspan="' + parsed.cols.length + '">e mais ' + (parsed.rows.length - prev.length) + '…</td></tr>' : '') + '</tbody></table></div>' +
    (parsed.total != null ? '<p class="note">Encontrei um orçamento geral de <b>' + money(parsed.total) + '</b> no ficheiro; passa para o campo do orçamento geral.</p>' : '') +
    '<div class="seg-choice" role="radiogroup" aria-label="Como importar"><label><input type="radio" name="bimp-mode" value="replace"' + (m.mode !== 'append' ? ' checked' : '') + ' data-bimp-mode> Substituir a tabela atual (podes desfazer)</label><label><input type="radio" name="bimp-mode" value="append"' + (m.mode === 'append' ? ' checked' : '') + ' data-bimp-mode> Juntar ao fim da tabela atual</label></div>' +
    '<div class="row-actions"><button class="btn primary" data-action="bimp-go">Importar</button><button class="btn ghost" data-action="bimp-close">Cancelar</button></div></div></div>';
}
function budgetApplyImport(p){
  const m = state.ui.bimport, parsed = m.parsed, b = getBudget(p);
  withUndo('Orçamento importado de ' + m.file + '.', () => {
    if (m.mode === 'append') {
      const map = {};
      parsed.cols.forEach(c => { let ex = b.cols.find(x => x.name.trim().toLowerCase() === c.name.trim().toLowerCase()); if (!ex) { ex = {id:c.id, name:c.name, type:c.type}; b.cols.push(ex); } map[c.id] = ex.id; });
      parsed.rows.forEach(r => b.rows.push(r.kind === 'section' ? r : {id:r.id, kind:'item', cells:Object.fromEntries(Object.entries(r.cells).map(([k, v]) => [map[k], v]))}));
    } else {
      b.cols = parsed.cols.map(c => ({id:c.id, name:c.name, type:c.type})); b.rows = parsed.rows;
      const mc = b.cols.slice().reverse().find(c => c.type === 'money'); b.main = mc ? mc.id : null;
    }
    if (parsed.total != null) b.total = parsed.total;
  });
  state.ui.bimport = null; render();
}

/* ---------- planos: colunas na cena e página inteira de cada plano ---------- */
function syncVF(p, m, E){
  let changed = false;
  E.shots.forEach(sh => {
    const ph = (m.by[sh.id] || [])[0]; if (!ph) return;
    const meta = ph.meta || {}; sh.vf = sh.vf || {};
    if (!sh.lens && meta.lens_mm) { sh.lens = Math.round(meta.lens_mm) + ' mm'; sh.vf.lens = true; changed = true; }
    if (!sh.kit && meta.kit) { sh.kit = meta.kit; sh.vf.kit = true; changed = true; }
    if (!sh.camera && meta.camera) { sh.camera = String(meta.camera).split('·')[0].trim(); sh.vf.camera = true; changed = true; }
    if (!sh.aspect && meta.aspect) { sh.aspect = meta.aspect + (meta.squeeze > 1 ? ' · anamórfica ' + meta.squeeze + 'x' : ''); sh.vf.aspect = true; changed = true; }
  });
  if (changed) persist(p);
}
function shotPics(sh, photos){
  return photos.map(f => ({path:(f.meta && f.meta.thumb_path) || f.storage_path, full:f.storage_path, vf:f})).concat((sh.images || []).filter(x => x.tag === 'storyboard').map(x => ({path:x.path, full:x.path, own:true})));
}
function shotMaps(E, sh){ return (E.maps || []).filter(mp => mp.shot === sh.id || (mp.items || []).some(i => i.kind === 'cam' && String(i.label || '').toUpperCase() === sh.code)); }
function shotExtras(sh){
  const b = sh.blocks || [], n = t => b.filter(x => x.type === t).length;
  const parts = [];
  if (n('images')) parts.push(pl(b.filter(x => x.type === 'images').reduce((k, x) => k + x.images.length, 0), 'referência', 'referências'));
  if (n('model')) parts.push(pl(n('model'), 'modelo 3D', 'modelos 3D'));
  if (n('note') + n('list') + n('fields') + n('link')) parts.push(pl(n('note') + n('list') + n('fields') + n('link'), 'nota', 'notas'));
  return parts.join(' · ');
}
function shotColumns(p, s, E, num, key){
  const m = matchPhotos(p, num, E); syncVF(p, m, E);
  const cols = E.shots.map(sh => {
    const pics = shotPics(sh, m.by[sh.id] || []), maps = shotMaps(E, sh), ex = shotExtras(sh);
    const tasks = (p.tasks || []).filter(t => t.target === 'shot:' + sh.id && t.status !== 'done').length;
    return '<article class="scol"><button class="scol-pic" data-action="shot-open" data-shot="' + sh.id + '" aria-label="Abrir o plano ' + esc(sh.code) + '">' + (pics.length ? imgTag(pics[0].path, 'Storyboard ' + sh.code) : frameSVG(sh, 16 / 9)) + '<span class="scol-code">' + esc(sh.code) + '</span>' + (pics.length > 1 ? '<span class="scol-count">' + pics.length + '</span>' : '') + '</button>' +
      '<div class="scol-body"><div class="scol-line"><b>' + esc(SIZES[sh.size] || '') + '</b>' + (sh.move ? '<span>' + esc(sh.move) + '</span>' : '') + '</div>' +
      (sh.lens || sh.kit ? '<div class="scol-lens num">' + esc([sh.lens, sh.kit].filter(Boolean).join(' · ')) + (sh.vf && sh.vf.lens ? '<span class="src"> do Viewfinder</span>' : '') + '</div>' : '') +
      '<p class="scol-desc" contenteditable="true" data-shot-text="' + sh.id + '" data-ph="O que se vê neste plano.">' + esc(sh.desc) + '</p>' +
      (maps.length ? '<button class="scol-map" data-action="emap-open" data-ent="' + esc(key) + '" data-id="' + maps[0].id + '" aria-label="Abrir o mapa de luz">' + mapSVG(maps[0], null, true) + '<span>' + (maps.length > 1 ? pl(maps.length, 'mapa de luz', 'mapas de luz') : 'Mapa de luz') + '</span></button>' : '') +
      ((ex || tasks) ? '<p class="scol-extra">' + esc([ex, tasks ? pl(tasks, 'tarefa', 'tarefas') : ''].filter(Boolean).join(' · ')) + '</p>' : '') +
      '<button class="btn small scol-open" data-action="shot-open" data-shot="' + sh.id + '">Abrir plano</button></div></article>';
  }).join('');
  const sceneMaps = (E.maps || []).filter(mp => !E.shots.some(sh => shotMaps(E, sh).indexOf(mp) >= 0));
  return '<section class="ent-sec"><div class="sec-head"><h3 class="h2">Planos</h3><span class="dim">' + pl(E.shots.length, 'plano', 'planos') + '</span></div>' +
    '<div class="scols">' + cols + '<button class="scol scol-new" data-action="sb-add" data-ent="' + esc(key) + '"><span>+ Plano ' + esc(num + shotLetter(E.shots.length)) + '</span></button></div>' +
    (m.loose.length ? '<div class="loose"><span class="lbl">Fotos do Viewfinder sem plano</span><div class="photos">' + m.loose.map(f => '<div class="stack">' + vfCard(f) + '<select class="input" data-assign="' + f.id + '" aria-label="Plano desta foto"><option value="">Juntar ao plano…</option>' + E.shots.map(x => '<option value="' + x.id + '">' + esc(x.code) + '</option>').join('') + '</select></div>').join('') + '</div></div>' : '') +
    (sceneMaps.length ? '<div class="stack"><span class="lbl">Mapas de luz da ' + KT(p).unit.toLowerCase() + '</span><div class="maps-strip">' + sceneMaps.map(mp => '<button class="map-thumb" data-action="emap-open" data-ent="' + esc(key) + '" data-id="' + mp.id + '">' + mapSVG(mp, null, true) + '<span>' + esc(mp.title) + '</span></button>').join('') + '</div></div>' : '') +
    '</section>';
}
function allShots(p){
  const A = allScenes(p); if (!A) return [];
  const out = [];
  A.list.forEach(x => x.E.shots.forEach(sh => out.push({sh, key:'scene:' + x.num, num:x.num, s:x.s, E:x.E, m:x.m})));
  return out;
}
const SHOT_BLOCKS = [['images','Imagens de referência'],['note','Texto'],['fields','Informações'],['list','Lista'],['model','Modelo 3D'],['link','Ligação']];
function ensureShotBlocks(sh){
  if (sh.blocks) return sh.blocks;
  sh.blocks = [];
  const old3d = (sh.images || []).filter(x => x.tag === '3d'), oldLuz = (sh.images || []).filter(x => x.tag === 'luz');
  if (old3d.length || sh.link3d) sh.blocks.push({id:uid(), type:'model', title:'Modelo 3D', images:old3d.map(x => ({path:x.path})), url:sh.link3d || '', label:''});
  if (oldLuz.length) sh.blocks.push({id:uid(), type:'images', title:'Mapa de luz (imagem)', images:oldLuz.map(x => ({path:x.path}))});
  sh.images = (sh.images || []).filter(x => x.tag === 'storyboard');
  return sh.blocks;
}
function shotPage(p){
  const list = allShots(p), i = list.findIndex(x => x.sh.id === state.ui.shotOpen);
  if (i < 0) { state.ui.shotOpen = null; return ''; }
  const {sh, key, num, s, E, m} = list[i], T = KT(p), prev = list[i - 1], next = list[i + 1];
  syncVF(p, m, E); ensureShotBlocks(sh);
  const pics = shotPics(sh, m.by[sh.id] || []), idx = Math.min(state.ui.picIdx || 0, Math.max(0, pics.length - 1)), cur0 = pics[idx];
  const maps = shotMaps(E, sh);
  const vfTag = k => sh.vf && sh.vf[k] ? '<span class="src">do Viewfinder</span>' : '';
  const inp = (k, l, ph) => '<label class="field"><span>' + l + ' ' + vfTag(k) + '</span><input class="input" data-shot-field="' + k + '" data-shot="' + sh.id + '" value="' + esc(sh[k] || '') + '" placeholder="' + (ph || '—') + '" autocomplete="off"></label>';
  const meta = cur0 && cur0.vf ? cur0.vf.meta || {} : null;
  const tasks = (p.tasks || []).filter(t => t.target === 'shot:' + sh.id);
  const sc = getScript(p);
  return '<div class="shot-page" role="dialog" aria-modal="true" aria-label="Plano ' + esc(sh.code) + '">' +
    '<header class="sp-top"><div class="sp-title"><button class="back lbl" data-action="shot-close">‹ ' + esc(T.unit + ' ' + num) + '</button><h2 class="display">Plano ' + esc(sh.code) + '</h2><span class="dim sp-scene">' + esc(s.heading || '') + '</span></div>' +
      '<div class="row-actions"><button class="btn small" data-action="shot-open" data-shot="' + (prev ? prev.sh.id : '') + '"' + (prev ? '' : ' disabled') + ' aria-label="Plano anterior">‹ ' + (prev ? esc(prev.sh.code) : '') + '</button><span class="dim num">' + (i + 1) + ' de ' + list.length + '</span><button class="btn small" data-action="shot-open" data-shot="' + (next ? next.sh.id : '') + '"' + (next ? '' : ' disabled') + ' aria-label="Plano seguinte">' + (next ? esc(next.sh.code) : '') + ' ›</button><button class="x" data-action="shot-close" aria-label="Fechar">×</button></div></header>' +
    '<div class="sp-main"><section class="sp-board"><div class="sp-pic">' + (cur0 ? '<img data-path="' + esc(cur0.full) + '" alt="Storyboard do plano ' + esc(sh.code) + '">' : frameSVG(sh, 16 / 9)) + '</div>' +
      (meta ? '<p class="note num">Viewfinder · ' + esc([meta.lens_mm ? Math.round(meta.lens_mm) + ' mm' : '', meta.kit, meta.camera ? String(meta.camera).split('·')[0].trim() : '', meta.aspect].filter(Boolean).join(' · ')) + '</p>' : '') +
      '<div class="sp-thumbs">' + pics.map((x, j) => '<button class="sp-thumb' + (j === idx ? ' on' : '') + '" data-action="pic" data-i="' + j + '">' + imgTag(x.path, 'Imagem ' + (j + 1)) + '</button>').join('') +
      '<button class="sp-thumb sp-add" data-action="shot-img" data-shot="' + sh.id + '" data-tag="storyboard">+ Imagem</button>' + (cur0 && cur0.own ? '<button class="btn ghost small" data-action="shot-img-del" data-shot="' + sh.id + '" data-path="' + esc(cur0.full) + '">Tirar esta imagem</button>' : '') + '</div></section>' +
    '<aside class="sp-info"><div class="panel"><span class="lbl">Plano</span>' +
      '<label class="field"><span>Enquadramento</span><select class="input" data-shot-field="size" data-shot="' + sh.id + '">' + Object.keys(SIZES).map(k => '<option value="' + k + '"' + (k === sh.size ? ' selected' : '') + '>' + SIZES[k] + '</option>').join('') + '</select></label>' +
      '<div class="two">' + inp('lens', 'Lente', '35 mm') + inp('kit', 'Objetivas', 'Ex.: Cooke S4') + '</div><div class="two">' + inp('camera', 'Câmara', 'Ex.: Alexa 35') + inp('aspect', 'Formato', '2.39:1') + '</div>' +
      inp('move', 'Movimento', 'Fixo, travelling, steadicam…') +
      '<label class="field"><span>O que se vê</span><p class="shot-desc input-like" contenteditable="true" data-shot-text="' + sh.id + '" data-ph="Descreve o plano.">' + esc(sh.desc) + '</p></label></div>' +
      '<div class="panel"><div class="row-actions" style="justify-content:space-between"><span class="lbl">Mapa de luz</span><button class="btn ghost small" data-action="shot-map-add" data-shot="' + sh.id + '">+ Mapa de luz</button></div>' +
      (maps.length ? '<div class="sp-maps">' + maps.map(mp => '<button class="map-thumb" data-action="emap-open" data-ent="' + esc(key) + '" data-id="' + mp.id + '">' + mapSVG(mp, null, true) + '<span>' + esc(mp.title) + '</span></button>').join('') + '</div>' : '<p class="note">Ainda sem mapa de luz para este plano.</p>') + '</div>' +
      '<div class="panel"><span class="lbl">Tarefas</span>' + (tasks.length ? '<div class="table-wrap"><table class="tasks compact"><tbody>' + taskRows(p, sc, tasks, false) + '</tbody></table></div>' : '') +
      '<form class="mini-form" data-form="todo-add" data-target="' + esc('shot:' + sh.id) + '" novalidate><input class="input" name="title" autocomplete="off" placeholder="O que falta para este plano"><select class="input mini-sel" name="assignee" aria-label="Responsável">' + assigneeOptions(p, '') + '</select><input type="hidden" name="due" value=""><button class="btn small" type="submit">Juntar</button></form><p class="form-msg"></p></div></aside></div>' +
    blocksView(sh, false, SHOT_BLOCKS, 'Mais neste plano') + '</div>';
}
/* ---------- adereços: análise do guião, lista e página de cada adereço ---------- */
const deacc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const normName = s => deacc(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
function singular(w){
  if (w.length < 4) return w;
  if (/oes$|aes$/.test(w)) return w.slice(0, -3) + 'ao';
  if (/ais$/.test(w)) return w.slice(0, -2) + 'l';
  if (/eis$/.test(w)) return w.slice(0, -3) + 'el';
  if (/ns$/.test(w)) return w.slice(0, -2) + 'm';
  if (/(r|z)es$/.test(w)) return w.slice(0, -2);
  if (/s$/.test(w) && !/(ss|us|is)$/.test(w)) return w.slice(0, -1);
  return w;
}
const PROP_CATS = ['objeto pessoal','comida e bebida','documento e papelaria','tecnologia','arma','ferramenta','mobiliário','decoração','veículo','outro'];
const PROP_STATUS = ['Por arranjar','Em procura','Encomendado','Comprado','Alugado','Emprestado','Construído pela arte','Pronto'];
const PROP_ST_COL = {'Por arranjar':'red','Em procura':'orange','Encomendado':'amber','Comprado':'green','Alugado':'teal','Emprestado':'teal','Construído pela arte':'violet','Pronto':'done'};
const stCls = st => 'st st-' + (PROP_ST_COL[st] || 'red');
const PROP_SORTS = [['scene','Cena'],['name','Nome (A–Z)'],['status','Estado'],['cat','Categoria']];
/* cores dos departamentos: personalizáveis; estas são as de origem */
const DEPT_COL = {'Realização':'#8e6cdb','Produção':'#d9822b','Imagem':'#2fa37a','Arte':'#d6457a','Som':'#c9a227','Distribuição':'#4f8f9e'};
const SWATCHES = ['#8e6cdb','#d6457a','#e5484d','#d9822b','#c9a227','#7fae3a','#2fa37a','#4f8f9e','#8a7563','#6b6f76'];
function deptColor(p, g){
  if (!g) return '';
  if (typeof g === 'string') g = p.groups.find(x => x.id === g || x.name === g); if (!g) return '';
  if (g.color) return g.color;
  if (DEPT_COL[g.name]) return DEPT_COL[g.name];
  const i = p.groups.indexOf(g); return SWATCHES[(i < 0 ? 0 : i) % SWATCHES.length];
}
const dot = c => c ? '<i class="ddot" style="--dc:' + esc(c) + '"></i>' : '';
/* léxico da análise sem IA: nome → [categoria, tipo] */
const LEX = {};
[['objeto pessoal','action','telemóvel telefone carteira chave mala mochila saco óculos relógio anel aliança colar pulseira brinco guarda-chuva isqueiro cigarro charuto cachimbo fósforo lenço pente escova espelho batom perfume fotografia foto moldura caixa envelope bilhete mapa bengala brinquedo bola boneca peluche guitarra viola cinzeiro cadeado corrente medalha terço crucifixo maço,maço de tabaco;mala de viagem;saco de plástico;fio de prata;phone;cellphone;wallet;key;keys;bag;backpack;glasses;sunglasses;watch;ring;necklace;umbrella;lighter;cigarette;photo;photograph;box;envelope;ticket'],
 ['documento e papelaria','action','livro caderno diário agenda revista jornal carta postal caneta lápis papel folha documento passaporte cartão dinheiro moeda cheque contrato dossier pasta processo bloco,bloco de notas;book;notebook;newspaper;letter;pen;pencil;paper;money;contract;passport'],
 ['comida e bebida','action','copo garrafa chávena caneca prato talher garfo colher tacho panela frigideira tabuleiro pão sopa vinho cerveja café chá leite sumo bolo fruta maçã laranja sandes cesto guardanapo whisky aguardente tigela jarro termo,copo de vinho;copo de água;garrafa de vinho;glass;bottle;cup;mug;plate;fork;spoon;bread;wine;beer;coffee;tea'],
 ['tecnologia','action','computador portátil tablet televisão televisor rádio câmara gravador microfone auscultadores comando carregador lanterna auricular ecrã projetor walkie-talkie,máquina fotográfica;laptop;computer;camera;radio;flashlight;headphones;tv'],
 ['arma','action','pistola revólver espingarda caçadeira arma navalha punhal bala munição faca machado,gun;pistol;rifle;knife;shotgun;bullet'],
 ['ferramenta','action','martelo serrote tesoura corda fita balde vassoura esfregona pá enxada ancinho rodo regador escadote alicate berbequim pincel lata ferramenta,chave inglesa;chave de fendas;caixa de ferramentas;hammer;rope;bucket;scissors;shovel;ladder'],
 ['veículo','action','carro mota bicicleta carrinha camião barco trotinete trator,car;bike;bicycle;truck;van;boat;motorcycle'],
 ['mobiliário','set','mesa cadeira sofá cama armário estante banco poltrona secretária cómoda candeeiro tapete cortina banqueta,mesa de cabeceira;table;chair;sofa;couch;bed;lamp;desk'],
 ['decoração','set','quadro vaso flores vela castiçal almofada cobertor manta lençol toalha planta,relógio de parede;painting;vase;candle;pillow;blanket']
].forEach(([cat, kind, list]) => { const [single, multi] = list.split(','); single.split(' ').filter(Boolean).forEach(w => { LEX[normName(w)] = [cat, kind]; }); (multi || '').split(';').filter(Boolean).forEach(w => { LEX[normName(w)] = [cat, kind]; }); });
const LEX_KEYS = Object.keys(LEX).sort((a, b) => b.length - a.length);
const VERBS = 'traz trazem leva levam tem segura pega pegam agarra agarram segura seguram abre abrem fecha fecham bebe bebem come comem acende acendem apaga apagam liga ligam desliga desligam atira atiram guarda guardam tira tiram mostra mostram entrega entregam da dao recebe recebem pousa pousam coloca colocam poe poem deixa deixam levanta levantam le leem escreve escrevem corta cortam parte partem enche enchem serve servem empurra empurram puxa puxam carrega carregam conduz conduzem aponta apontam dispara disparam toca tocam usa usam procura procuram encontra encontram esconde escondem rasga rasgam dobra dobram embrulha embrulham fuma fumam atende atendem marca marcam mexe mexem limpa limpam lava lavam arruma arrumam pendura penduram pinta pintam agita agitam aperta apertam solta soltam larga largam arrasta arrastam empunha saca sacam estende estendem passa passam oferece oferecem examina examinam observa observam olha olham roda rodam sacode bate batem enfia enfiam mete metem retira retiram devolve devolvem apanha apanham recolhe recolhem espreita folheia folheiam abraca segue experimenta prova provam veste despe calca descalca '
  + 'picks grabs holds opens closes drinks eats lights takes puts hands gives drops pours reads writes cuts throws pulls pushes carries drives points fires uses hides finds smokes answers dials wipes washes hangs';
const VERB_SET = new Set(VERBS.split(/\s+/).filter(Boolean));
const STOP = new Set('mao maos braco bracos cabeca boca olhos olho cara rosto cabelo voz ar conversa vez tempo chao parede porta janela teto escada caminho rua casa quarto sala cozinha corpo pe pes dedo dedos ombro ombros perna pernas peito costas lagrimas lagrima respiracao coragem atencao olhar silencio luz sol lua mar vento chuva agua noite dia hora minuto segundo vida morte pai mae filho filha irmao irma avo tio tia amigo amiga homem mulher crianca rapaz rapariga gente pessoa pessoas nome palavra palavras frase resposta pergunta historia ideia coisa coisas nada tudo algo alguem ninguem door window wall floor hand hands head face eyes hair voice'.split(' '));
const FUNCW = new Set('para com de em ele ela eles elas isso isto aquilo lhe lhes se me te nos vos que mesmo mesma todo toda todos todas outro outra devagar depressa entao ainda ja la ali aqui ca tambem nao sim muito pouco bem mal sozinho sozinha juntos sobre sob entre ate desde contra sem por pela pelo pelas pelos onde quando como porque mas ou e ao aos the to at on in with of for and or it him her them'.split(' '));
const DET = /^(o|a|os|as|um|uma|uns|umas|no|na|nos|nas|do|da|dos|das|ao|a|aos|as|num|numa|pelo|pela|seu|sua|seus|suas|meu|minha|teu|tua|the|a|an|his|her|their)$/;
const canon = k => { const w = k.split(' '); w[0] = singular(w[0]); return w.join(' '); };
function origOf(sen, k){
  const toks = sen.split(/\s+/), kw = k.split(' ').length;
  for (let i = 0; i + kw <= toks.length; i++) { const cand = toks.slice(i, i + kw).join(' ').replace(/^[^\wÀ-ÿ]+|[^\wÀ-ÿ]+$/g, ''); if (canon(normName(cand)) === k || normName(cand) === k) { const w = cand.toLowerCase().split(' '); const c0 = canon(normName(w[0])); if (normName(w[0]) !== c0) w[0] = w[0].replace(/(ões|ães)$/, 'ão').replace(/ais$/, 'al').replace(/(r|z)es$/, '$1').replace(/s$/, ''); return w.join(' '); } }
  return k;
}
function analyzeRules(p, sc){
  const cast = sc.chars.map(c => c.name), castN = cast.map(c => [c, deacc(c)]);
  const found = {};
  const add = (name, cat, kind, scene, quote, inter) => {
    const k = canon(normName(name)); if (!k || STOP.has(k) || castN.some(c => normName(c[0]) === k)) return;
    const f = found[k] || (found[k] = {name:origOf(quote, k), kind, category:cat, description:'', scenes:{}});
    if (inter) f.kind = 'action';
    const sc0 = f.scenes[scene] || (f.scenes[scene] = {scene, quote, interactions:[], continuity:''});
    if (inter && !sc0.interactions.some(x => x.character === inter.character && x.action === inter.action)) sc0.interactions.push(inter);
  };
  sc.scenes.forEach(s => {
    const num = String(s.number || s.n);
    let mode = 'ac', speaker = '', last = '';
    const paras = [];
    (s.body || []).forEach(raw => {
      const t = raw.trim();
      if (!t) { mode = 'ac'; if (paras.length) paras[paras.length - 1].open = false; return; }
      const nm = t.replace(/^@/, '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
      if (mode === 'ac' && s.chars.indexOf(nm) >= 0 && t === t.toUpperCase()) { mode = 'di'; speaker = nm; if (paras.length) paras[paras.length - 1].open = false; return; }
      if (mode === 'di' && /^\(.*\)$/.test(t)) { paras.push({text:t.slice(1, -1), who:speaker}); return; }
      if (mode === 'di') return;
      const lastP = paras[paras.length - 1];
      if (lastP && !lastP.who && lastP.open) lastP.text += ' ' + t; else paras.push({text:t, who:'', open:true});
    });
    paras.forEach(pa => {
      const sentences = pa.text.split(/(?<=[.!?;:])\s+/);
      sentences.forEach(sen => {
        const dn = deacc(sen);
        const named = castN.filter(c => new RegExp('\\b' + c[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(dn)).map(c => c[0]);
        if (named.length) last = named[0];
        const who = pa.who || named[0] || last;
        const words = dn.replace(/[^a-z0-9\- ]+/g, ' ').split(/\s+/).filter(Boolean);
        const verbAt = words.findIndex(w => VERB_SET.has(w.replace(/-(o|a|os|as|lhe|lhes|se|lho|lha|lhos|lhas)$/, '')));
        const inter = verbAt >= 0 && who ? {character:who, action:sen.trim().slice(0, 160)} : null;
        const hits = new Set();
        LEX_KEYS.forEach(k => {
          if (hits.has(canon(k))) return;
          const re = new RegExp('(^|[^a-z0-9])(' + k.replace(/ /g, '\\s+') + ')(s|es)?([^a-z0-9]|$)');
          const m = re.exec(dn); if (!m) return;
          if ([...hits].some(h => h.indexOf(canon(k)) >= 0)) return;
          hits.add(canon(k));
          const idx = dn.slice(0, m.index).split(/\s+/).filter(Boolean).length;
          const near = LEX[k][1] === 'set' ? idx - verbAt <= 3 : true;
          add(k, LEX[k][0], LEX[k][1], num, sen.trim().slice(0, 220), inter && verbAt >= 0 && verbAt <= idx && near ? inter : null);
        });
        if (verbAt >= 0) {
          let i = verbAt + 1;
          if (words[i] && /^(na|no|nas|nos|em)$/.test(words[i])) i++;
          if (words[i] && DET.test(words[i])) i++;
          const hadDet = i > verbAt + 1 && DET.test(words[i - 1]), w = words[i];
          if (w && w.length > 2 && !FUNCW.has(w) && !DET.test(w) && !/mente$/.test(w) && !STOP.has(singular(w)) && !VERB_SET.has(w) && !castN.some(c => deacc(c[0]).split(' ')[0] === w)) {
            const s1 = singular(w), k2 = words[i + 1] === 'de' && words[i + 2] ? s1 + ' de ' + words[i + 2] : s1;
            const key = LEX[k2] ? k2 : LEX[s1] ? s1 : null;
            if (!key && (!hadDet || !/^[a-z]+$/.test(s1))) return;
            const ck = canon(key || s1);
            if (![...hits].some(h => h.indexOf(ck) >= 0)) { hits.add(ck); add(key || s1, key ? LEX[key][0] : 'outro', 'action', num, sen.trim().slice(0, 220), inter); }
          }
        }
        (sen.match(/[A-ZÀ-Ý][A-ZÀ-Ý\-]{2,}(?:\s+(?:DE|DO|DA|DOS|DAS|E)?\s*[A-ZÀ-Ý][A-ZÀ-Ý\-]{2,})*/g) || []).forEach(up => {
          const k = canon(normName(up));
          if (castN.some(c => normName(c[0]) === normName(up)) || /^(int|ext|cont|cont d|v o|o s|fim|corta|fade)$/.test(k) || [...hits].some(h => h.indexOf(k) >= 0 || k.indexOf(h) >= 0)) return;
          hits.add(k); add(k, (LEX[k] || ['outro'])[0], 'action', num, sen.trim().slice(0, 220), inter);
        });
      });
    });
  });
  return Object.values(found).map(f => Object.assign(f, {scenes:Object.values(f.scenes)}));
}
/* ---------- ligar a IA: a chave de cada conta fica só no servidor ---------- */
async function aiCall(body){
  const r = await sb.functions.invoke('analyze-props', {body});
  if (r.error) { let d = {}; try { d = await r.error.context.json(); } catch (e) {} const err = new Error(d.error || 'falhou'); err.code = d.error || (navigator.onLine ? 'api' : 'offline'); throw err; }
  return r.data;
}
async function aiStatus(force){
  if (state.ai && !force) return state.ai;
  try { const d = await aiCall({action:'status'}); state.ai = {own:d.own, shared:!!d.shared}; } catch (e) { state.ai = {own:null, shared:false, failed:true}; }
  render(); return state.ai;
}
const aiReady = () => !!(state.ai && (state.ai.own || state.ai.shared));
const AI_ERR = {
  format:'Isto não parece uma chave da Anthropic. As chaves começam por sk-ant-. Copia-a outra vez, inteira.',
  bad_key:'A Anthropic não reconheceu esta chave. Pode ter sido apagada ou estar incompleta. Cria uma nova e cola-a aqui.',
  no_credit:'A chave está certa, mas a conta Anthropic não tem crédito. Junta crédito em Billing e volta a carregar em Ligar.',
  forbidden:'Esta chave não tem permissão para usar o modelo. Confirma na consola da Anthropic que a chave está ativa.',
  store:'A chave é válida, mas não consegui guardá-la. Volta a tentar daqui a pouco.',
  offline:'Sem internet. Liga-te e volta a tentar.',
  api:'Não consegui falar com a Anthropic. Volta a tentar daqui a pouco.'
};
function aiModal(){
  const a = state.ai, own = a && a.own, m = state.ui.aiOpen;
  const head = '<div class="modal enter" data-action="ai-scrim"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="ai-t"><h2 class="h2" id="ai-t">Análise com IA</h2>';
  if (!a) return head + '<p class="dim">A ver se a IA já está ligada…</p></div></div>';
  if ((own || a.shared) && !m.change) {
    return head + '<p class="lede">' + (own ? 'Ligada à tua conta Anthropic, com a chave terminada em <b class="num">…' + esc(own.hint) + '</b>. Cada análise é paga por essa conta.' : 'Ligada pela chave geral do servidor.') + '</p>' +
      '<div class="row-actions">' + (m.after ? '<button class="btn primary" data-action="ai-continue">Analisar agora</button>' : '') + '<button class="btn" data-action="ai-change">' + (own ? 'Trocar chave' : 'Usar a minha chave') + '</button>' + (own ? '<button class="btn ghost" data-action="ai-remove">Desligar</button>' : '') + '<button class="btn ghost" data-action="ai-close">Fechar</button></div></div></div>';
  }
  return head + '<p class="lede">A análise com IA usa o Claude, da Anthropic, através da tua própria conta. Ligas uma vez e fica ligado em todos os teus projetos.</p>' +
    '<ol class="ai-steps">' +
    '<li><b>Abre a consola da Anthropic</b> e entra, ou cria uma conta com o teu email. <a class="btn small" href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Abrir a consola</a></li>' +
    '<li><b>Junta crédito</b> em Billing. É pré-pago e só gastas quando analisas: uma curta-metragem custa uns cêntimos; uma longa, menos de 1 $.</li>' +
    '<li><b>Cria uma chave</b> em API Keys › Create Key, dá-lhe um nome (por exemplo "Studio") e copia-a. Começa por <span class="num">sk-ant-</span>.</li>' +
    '<li><b>Cola-a aqui</b> e carrega em Ligar. Testo a chave antes de a guardar.</li></ol>' +
    '<form class="ai-key" data-form="ai-key" novalidate><input class="input num" type="password" name="key" autocomplete="off" spellcheck="false" placeholder="sk-ant-…" aria-label="Chave da API da Anthropic"' + (m.busy ? ' disabled' : '') + '><button class="btn primary" type="submit"' + (m.busy ? ' disabled' : '') + '>' + (m.busy ? 'A testar…' : 'Ligar') + '</button></form>' +
    '<p class="form-msg" role="alert">' + (m.err ? esc(AI_ERR[m.err] || AI_ERR.api) : '') + '</p>' +
    '<p class="note">A chave vai direta para o servidor do Studio, fica guardada só para a tua conta e não volta a aparecer no ecrã. Podes desligá-la aqui ou apagá-la na consola da Anthropic quando quiseres.</p>' +
    '<div class="row-actions">' + (m.change ? '<button class="btn ghost" data-action="ai-back">Voltar</button>' : '') + '<button class="btn ghost" data-action="ai-close">Agora não</button></div></div></div>';
}
function openAI(after){ state.ui.aiOpen = {after:after || null}; render(); aiStatus(true).then(() => { const i = document.querySelector('[data-form=ai-key] input'); if (i) i.focus(); }); }

/* ---------- analisar no Claude (grátis): copiar, colar no claude.ai e trazer a resposta ---------- */
const CLAUDE_RULES = `És o chefe de adereços de uma produção de cinema em Portugal e fazes o breakdown de adereços de um guião com rigor profissional.

O que conta como adereço: qualquer objeto móvel mencionado na ação ou nas indicações entre parênteses, ou presente em cena e referido no diálogo; acessórios que uma personagem manuseia (óculos que tira, relógio que consulta, mala que abre); comida e bebida que aparece ou é consumida, veículos de cena, armas, documentos, tecnologia; mobiliário e decoração mencionados.
O que não conta: roupa e calçado vestidos sem serem manuseados, caracterização; elementos fixos do espaço (paredes, portas, janelas, chão, teto) e naturais (sol, mar, vento, chuva); pessoas e animais que são personagens; objetos só referidos no diálogo que não estão em cena.

Tipo: "action" para tudo o que uma personagem manuseia, usa, dá, recebe, procura ou examina, e qualquer objeto móvel mencionado; "set" para mobiliário e decoração que vestem o espaço e ninguém manuseia.
Interações: sempre que uma personagem interage com o objeto, regista quem e o quê, mesmo quando o texto usa pronomes; resolve o pronome para a personagem certa. Usa os nomes das personagens exatamente como na lista de elenco. A ação descreve-se no presente, numa frase curta (ex.: "pega na faca e corta o pão").
Nomes: um nome canónico por objeto, no singular, em minúsculas (exceto marcas), igual em todas as cenas. Se o objeto estiver na lista de adereços conhecidos, usa esse nome exatamente. Quantidades vão na descrição.
Continuidade: se o objeto muda de estado na cena (parte-se, molha-se, fica meio vazio, sujo de sangue), escreve-o em "continuity".
Não inventes nada que não esteja no texto. Sê exaustivo: é preferível registar um objeto a mais do que falhar um.`;
const CLAUDE_FORMAT = `FORMATO DA RESPOSTA (obrigatório, a resposta vai ser lida por uma app):
Responde só com um bloco de código. Dentro dele, uma linha JSON por adereço, sem quebras de linha dentro de cada objeto, assim:
{"name":"faca","kind":"action","category":"ferramenta","description":"faca de cozinha grande","scenes":[{"scene":"1","quote":"pega na faca e corta o pão","interactions":[{"character":"ANA","action":"pega na faca e corta o pão"}],"continuity":""}]}
"category" é uma destas: ${PROP_CATS.join(', ')}.
"scene" é o número da cena exatamente como aparece abaixo. "quote" é um excerto literal curto (até 120 caracteres).
Depois do último adereço, escreve uma linha só com FIM. Se a resposta ficar comprida demais e for cortada, continua na mensagem seguinte a partir do adereço onde paraste.`;
function claudeParts(p, sc){
  const scenes = sc.scenes.filter(s => (s.body || []).length).map(s => ({n:String(s.number || s.n), heading:s.heading, chars:s.chars, text:(s.body || []).join('\n').replace(/\n{3,}/g, '\n\n')}));
  const parts = []; let cur0 = [], size = 0;
  scenes.forEach(s => { if (size + s.text.length > 24000 && cur0.length) { parts.push(cur0); cur0 = []; size = 0; } cur0.push(s); size += s.text.length; });
  if (cur0.length) parts.push(cur0);
  return parts;
}
function claudePrompt(p, sc, part, i, n){
  const known = (p.props || []).map(x => x.name).join(', ');
  return CLAUDE_RULES + '\n\n' + CLAUDE_FORMAT + '\n\n' +
    'Projeto: ' + p.name + (n > 1 ? ' · parte ' + (i + 1) + ' de ' + n : '') + '\nElenco do guião: ' + (sc.chars.map(c => c.name).join(', ') || '—') + '\nAdereços já conhecidos: ' + (known || 'nenhum') + '\n\n' +
    part.map(s => '### CENA ' + s.n + ' — ' + s.heading + '\nPersonagens com fala: ' + ((s.chars || []).join(', ') || '—') + '\n\n' + s.text).join('\n\n');
}
function parseClaudeReply(txt){
  const out = [], lines = String(txt || '').replace(/```[a-z]*/gi, '\n').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let bad = 0, end = false, lastBad = false;
  lines.forEach(l => {
    if (/^FIM\.?$/i.test(l)) { end = true; return; }
    if (l[0] === '[' || l[0] === ']') l = l.replace(/^\[|\]$/g, '').trim();
    l = l.replace(/,$/, '');
    if (l[0] !== '{') return;
    try { const o = JSON.parse(l); if (o && o.name) { out.push(o); lastBad = false; } }
    catch (e) { bad++; lastBad = true; }
  });
  if (!out.length) { try { const j = JSON.parse(String(txt).slice(String(txt).indexOf('{'), String(txt).lastIndexOf('}') + 1)); (j.props || []).forEach(o => out.push(o)); end = true; } catch (e) {} }
  return {props:out, bad, end, cut:lastBad || !end};
}
function claudeModal(p){
  const sc = getScript(p), m = state.ui.claudeOpen, parts = claudeParts(p, sc), n = parts.length, i = Math.min(m.part || 0, n - 1);
  m.acc = m.acc || {}; m.st = m.st || {};
  const range = pt => pt[0].n + (pt.length > 1 ? ' a ' + pt[pt.length - 1].n : '');
  const st = m.st[i] || {}, doneN = Object.keys(m.acc).length, allDone = doneN === n && !st.cut;
  const step = st.read && !st.cut ? 4 : st.opened ? 3 : st.copied ? 2 : 1;
  const card = (k, title, body) => '<li class="cl-step' + (step === k ? ' is-now' : step > k ? ' is-done' : '') + '"><span class="cl-num" aria-hidden="true">' + (step > k ? '✓' : k) + '</span><div class="cl-body"><h3>' + title + '</h3>' + body + '</div></li>';
  const kbd = t => '<kbd>' + t + '</kbd>';
  const head = '<div class="modal enter" data-action="claude-scrim"><div class="dialog dialog-claude" role="dialog" aria-modal="true" aria-labelledby="cl-t">' +
    '<div class="cl-top"><div><span class="lbl">Adereços · ' + esc(p.name) + '</span><h2 class="h2" id="cl-t">Analisar no Claude</h2></div><button class="btn ghost small" data-action="claude-close" aria-label="Fechar">Fechar</button></div>';
  if (allDone && m.finished) {
    return head + '<div class="cl-done"><span class="cl-big">✓</span><h3 class="h3">A lista de adereços está pronta</h3><p>' + pl((p.props || []).length, 'adereço', 'adereços') + ' com as cenas e as personagens que interagem com cada um. Revê a lista e tira o que não fizer sentido.</p><button class="btn primary" data-action="claude-done">Ver os adereços</button></div></div></div>';
  }
  return head +
    '<p class="lede cl-lede">O Claude lê o guião por ti e devolve a lista de adereços. É grátis com a tua conta do Claude: só tens de levar o pedido para lá e trazer a resposta para aqui.</p>' +
    (n > 1 ? '<div class="cl-parts"><p class="cl-parts-t">O guião é longo, por isso vai em <b>' + n + ' partes</b>. Faz os três passos para cada uma.</p><div class="cl-tabs" role="tablist">' + parts.map((pt, k) => '<button class="cl-tab' + (k === i ? ' on' : '') + (m.acc[k] && !(m.st[k] || {}).cut ? ' ok' : '') + '" data-action="claude-part" data-k="' + k + '" role="tab" aria-selected="' + (k === i) + '"><b>Parte ' + (k + 1) + (m.acc[k] && !(m.st[k] || {}).cut ? ' ✓' : '') + '</b><span>cenas ' + esc(range(pt)) + '</span></button>').join('') + '</div></div>' : '') +
    '<ol class="cl-steps">' +
    card(1, 'Copia o pedido', '<p>Leva ' + (n > 1 ? 'esta parte do guião (cenas ' + esc(range(parts[i])) + ')' : 'o guião todo') + ' e as instruções para o Claude. Não precisas de escrever nada.</p>' +
      '<button class="btn ' + (st.copied ? '' : 'primary ') + 'cl-btn" data-action="claude-copy">' + (st.copied ? 'Copiado ✓ · copiar outra vez' : 'Copiar o pedido' + (n > 1 ? ' (parte ' + (i + 1) + ')' : '')) + '</button>' +
      (m.showText ? '<p class="cl-hint">O browser não me deixou copiar sozinho. Clica na caixa, carrega em ' + kbd('Ctrl') + ' + ' + kbd('A') + ' e depois em ' + kbd('Ctrl') + ' + ' + kbd('C') + '.</p><textarea class="input cl-src" readonly aria-label="Pedido para copiar">' + esc(claudePrompt(p, sc, parts[i], i, n)) + '</textarea>' : '')) +
    card(2, 'Cola-o numa conversa nova no Claude', '<p>O botão abre o Claude noutro separador, já numa conversa nova. Clica na caixa de mensagem, cola com ' + kbd('Ctrl') + ' + ' + kbd('V') + ' e envia com ' + kbd('Enter') + '.</p>' +
      '<p class="cl-hint">O Claude vai escrever uma lista comprida, linha a linha. Espera até aparecer <b>FIM</b> no fim; numa curta demora cerca de um minuto.</p>' +
      '<a class="btn ' + (step === 2 ? 'primary ' : '') + 'cl-btn" href="https://claude.ai/new" target="_blank" rel="noopener" data-action="claude-open">Abrir o Claude</a>') +
    card(3, 'Traz a resposta para aqui', '<p>Quando acabar, carrega em <b>Copiar</b> no canto do bloco da resposta (ou no ícone de copiar por baixo da mensagem). Volta a este separador e cola na caixa.</p>' +
      '<div class="cl-paste"><textarea class="input" id="cl-reply" placeholder="Clica aqui e cola com Ctrl + V. A app lê a resposta sozinha." aria-label="Resposta do Claude"></textarea>' +
      '<button class="btn ' + (step === 3 ? 'primary ' : '') + 'small" data-action="claude-paste">Colar o que copiei</button></div>' +
      (st.cut ? '<p class="cl-warn"><b>A resposta veio cortada.</b> No Claude, escreve <b>continua</b> e envia. Depois copia a nova resposta e cola-a aqui também; o que já li não se perde.</p>' : '') +
      (m.msg ? '<p class="cl-msg" role="status">' + esc(m.msg) + '</p>' : '')) +
    '</ol>' +
    (doneN && !allDone ? '<div class="cl-foot"><span class="dim">' + pl(doneN, 'parte lida', 'partes lidas') + ' de ' + n + ' · os adereços já estão na lista</span><button class="btn ghost small" data-action="claude-done">Ver o que já entrou</button></div>' : '') +
    '</div></div>';
}
function claudeRead(p, txt){
  const m = state.ui.claudeOpen, sc = getScript(p), parts = claudeParts(p, sc), i = Math.min(m.part || 0, parts.length - 1);
  m.st = m.st || {};
  if (/FORMATO DA RESPOSTA \(obrigat/.test(txt)) { m.msg = 'Isto é o pedido, não a resposta. Cola-o no Claude (passo 2) e traz para aqui o que ele responder.'; render(); return; }
  const r = parseClaudeReply(txt);
  if (!r.props.length) { m.msg = /^\s*(És o chefe|FORMATO DA RESPOSTA)/.test(txt) ? 'Isto é o pedido, não a resposta. Cola-o no Claude (passo 2) e traz para aqui o que ele responder.' : 'Não encontrei adereços no que colaste. No Claude, copia a resposta inteira, com o botão Copiar do bloco da resposta.'; render(); return; }
  m.acc = m.acc || {};
  const prev = m.acc[i] || [], seen = new Set(prev.map(x => JSON.stringify(x)));
  m.acc[i] = prev.concat(r.props.filter(x => !seen.has(JSON.stringify(x))));
  const before = (p.props || []).length;
  mergeProps(p, sc, m.acc[i], parts[i].map(s => s.n), 'ai');
  p.propsAnalysed = {mode:'claude', at:today()};
  const added = (p.props || []).length - before;
  m.st[i] = Object.assign({}, m.st[i], {read:true, cut:r.cut});
  m.msg = pl(r.props.length, 'adereço lido', 'adereços lidos') + (added > 0 ? ', ' + pl(added, 'novo', 'novos') : '') + ' nesta parte.';
  if (!r.cut) {
    const nx = parts.findIndex((_, k) => !m.acc[k] || (m.st[k] || {}).cut);
    if (nx >= 0) { m.part = nx; m.showText = false; m.msg = 'Parte ' + (i + 1) + ' lida: ' + pl(r.props.length, 'adereço', 'adereços') + '. Agora a parte ' + (nx + 1) + ': começa outra vez pelo passo 1, numa conversa nova.'; }
    else m.finished = true;
  }
  render(); persist(p);
}

async function analyzeAI(p, sc, onStep){
  const scenes = sc.scenes.filter(s => (s.body || []).length).map(s => ({n:String(s.number || s.n), heading:s.heading, chars:s.chars, text:(s.body || []).join('\n').replace(/\n{3,}/g, '\n\n')}));
  const chunks = []; let curC = [], size = 0;
  scenes.forEach(s => { if (size + s.text.length > 36000 && curC.length) { chunks.push(curC); curC = []; size = 0; } curC.push(s); size += s.text.length; });
  if (curC.length) chunks.push(curC);
  const out = []; let done = 0;
  const known = () => (p.props || []).map(x => x.name).concat(out.map(x => x.name));
  const run = async c => {
    const data = await aiCall({scenes:c, cast:sc.chars.map(x => x.name), known:known()});
    (data.props || []).forEach(x => out.push(x));
    done++; onStep && onStep(done, chunks.length);
  };
  for (let i = 0; i < chunks.length; i += 2) await Promise.all(chunks.slice(i, i + 2).map(run));
  return out;
}
function mergeProps(p, sc, result, scenesDone, source){
  p.props = p.props || []; p.propsRemoved = p.propsRemoved || [];
  const done = new Set(scenesDone.map(String));
  p.props.forEach(pr => { if (pr.source !== 'manual') pr.appear = (pr.appear || []).filter(a => a.manual || !done.has(String(a.scene))); });
  let added = 0;
  result.forEach(rp => {
    const k = normName(rp.name), k2 = normName(singular(k));
    if (!k || p.propsRemoved.indexOf(k) >= 0) return;
    let pr = p.props.find(x => normName(x.name) === k || normName(x.name) === k2 || (x.aliases || []).indexOf(k) >= 0);
    if (!pr) { pr = {id:uid() + uid(), name:rp.name, kind:rp.kind === 'set' ? 'set' : 'action', category:PROP_CATS.indexOf(rp.category) >= 0 ? rp.category : 'outro', desc:rp.description || '', appear:[], source, status:'Por arranjar', qty:'', addChars:[], addPlaces:[], noChars:[], noPlaces:[]}; p.props.push(pr); added++; }
    else { if (!pr.desc && rp.description) pr.desc = rp.description; if (rp.kind === 'action') pr.kind = pr.kindLocked ? pr.kind : 'action'; }
    (rp.scenes || []).forEach(a => {
      if (!sc.scenes.some(s => String(s.number || s.n) === String(a.scene))) return;
      const ex = pr.appear.find(x => String(x.scene) === String(a.scene) && !x.manual);
      const inter = (a.interactions || []).filter(x => x && x.character).map(x => ({character:String(x.character).toUpperCase() === x.character ? x.character : (sc.chars.find(c => deacc(c.name) === deacc(x.character)) || {name:x.character}).name, action:x.action}));
      if (ex) { inter.forEach(x => { if (!ex.interactions.some(y => y.character === x.character && y.action === x.action)) ex.interactions.push(x); }); if (!ex.continuity && a.continuity) ex.continuity = a.continuity; }
      else pr.appear.push({scene:String(a.scene), quote:a.quote || '', interactions:inter, continuity:a.continuity || ''});
    });
  });
  p.props = p.props.filter(pr => pr.source === 'manual' || pr.appear.length || (pr.addChars || []).length || (pr.addPlaces || []).length);
  return added;
}
async function runPropAnalysis(p, mode){
  const sc = getScript(p);
  if (!sc || !sc.scenes.some(s => (s.body || []).length)) { toast('Para analisar adereços é preciso o texto do guião. Importa-o em PDF, Fountain ou Final Draft.'); return; }
  const scenesDone = sc.scenes.filter(s => (s.body || []).length).map(s => String(s.number || s.n));
  if (mode === 'rules') {
    const n = mergeProps(p, sc, analyzeRules(p, sc), scenesDone, 'rules'); p.propsAnalysed = {mode:'rules', at:today()};
    render(); persist(p); toast('Análise rápida feita: ' + pl(n, 'adereço novo', 'adereços novos') + '. Revê a lista, porque sem IA podem faltar ou sobrar objetos.'); return;
  }
  const st = await aiStatus();
  if (!st.failed && !aiReady()) { openAI('props'); return; }
  state.ui.propsAiError = null; state.ui.propsBusy = {done:0, total:1}; render();
  try {
    const res = await analyzeAI(p, sc, (d, t) => { state.ui.propsBusy = {done:d, total:t}; const el = $('#props-progress'); if (el) el.textContent = 'A analisar o guião com IA… ' + d + ' de ' + t; });
    const n = mergeProps(p, sc, res, scenesDone, 'ai'); p.propsAnalysed = {mode:'ai', at:today()};
    state.ui.propsBusy = null; render(); persist(p); toast('Análise com IA feita: ' + pl(n, 'adereço novo', 'adereços novos') + '.');
  } catch (err) {
    state.ui.propsBusy = null; render();
    if (['no_key', 'bad_key', 'no_credit', 'forbidden'].indexOf(err.code) >= 0) { state.ai = null; state.ui.aiOpen = {after:'props', change:true, err:err.code === 'no_key' ? null : err.code}; render(); aiStatus(true); return; }
    toast(err.code === 'busy' || err.code === 'rate' ? 'A IA está sobrecarregada neste momento. Volta a tentar daqui a um minuto.' : err.code === 'too_long' ? 'Há um grupo de cenas demasiado longo para analisar de uma vez.' : navigator.onLine ? 'A análise com IA falhou. A análise rápida, sem IA, continua disponível.' : 'Sem internet: a análise não foi feita.');
    state.ui.propsAiError = err.code || 'api'; render();
  }
}
function propAssoc(p, sc, pr){
  const chars = [], places = [];
  (pr.appear || []).forEach(a => {
    (a.interactions || []).forEach(x => { if (chars.indexOf(x.character) < 0) chars.push(x.character); });
    const s = sc && sc.scenes.find(x => String(x.number || x.n) === String(a.scene)); if (s && s.place && places.indexOf(s.place) < 0) places.push(s.place);
  });
  (pr.addChars || []).forEach(c => { if (chars.indexOf(c) < 0) chars.push(c); });
  (pr.addPlaces || []).forEach(c => { if (places.indexOf(c) < 0) places.push(c); });
  return {chars:chars.filter(c => (pr.noChars || []).indexOf(c) < 0), places:places.filter(c => (pr.noPlaces || []).indexOf(c) < 0), scenes:[...new Set((pr.appear || []).map(a => String(a.scene)))]};
}
function propChips(p, sc, list){
  return list.length ? '<span class="chips">' + list.map(pr => entLink('prop:' + pr.id, pr.name, 'chip' + (pr.kind === 'set' ? ' chip-set' : ''))).join('') + '</span>' : '';
}
function propsFor(p, sc, kind, id){
  return (p.props || []).filter(pr => { const A = propAssoc(p, sc, pr); return kind === 'scene' ? A.scenes.indexOf(id) >= 0 : kind === 'char' ? A.chars.indexOf(id) >= 0 : A.places.indexOf(id) >= 0; });
}
function propsSection(p, sc, kind, id){
  const list = propsFor(p, sc, kind, id), act = list.filter(x => x.kind === 'action'), set = list.filter(x => x.kind === 'set');
  const addSet = kind === 'place' ? '<form class="mini-form add-row" data-form="prop-add" data-kind="set" data-place="' + esc(id) + '" novalidate><input class="input" autocomplete="off" placeholder="Juntar adereço de cenário a este décor" aria-label="Nome do adereço"><button class="btn small" type="submit">Juntar</button></form>' : '';
  if (!list.length && !addSet) return '';
  return '<section class="ent-sec"><div class="sec-head"><h3 class="h2">Adereços</h3><span class="dim">' + (list.length ? act.length + ' de ação · ' + set.length + ' de cenário' : 'Nenhum ainda') + '</span></div>' +
    (act.length ? '<div class="stack"><span class="lbl">De ação</span>' + propChips(p, sc, act) + '</div>' : '') + (set.length ? '<div class="stack"><span class="lbl">De cenário</span>' + propChips(p, sc, set) + '</div>' : '') + addSet + '</section>';
}
function propsListView(p, sc){
  const tab = state.ui.propTab || 'action', all = p.props || [], list = all.filter(x => x.kind === tab);
  const busy = state.ui.propsBusy, hasText = sc.scenes.some(s => (s.body || []).length), T = KT(p);
  const sceneLabel = n => { const s = sc.scenes.find(x => String(x.number || x.n) === n); return s ? n : n; };
  const menu = '<div class="panel prop-analyse"><div class="row-actions" style="justify-content:space-between"><div class="stack" style="gap:2px"><b>Analisar o guião</b><span class="dim" style="font-size:.86rem">' + (p.propsAnalysed ? 'Última análise ' + (p.propsAnalysed.mode === 'rules' ? 'rápida' : 'no Claude') + ' a ' + dm(p.propsAnalysed.at) + '. Voltar a analisar junta o que falta; o que tiraste à mão não volta.' : 'Lê o guião e separa os adereços, com as cenas e as personagens que interagem com cada um.') + '</span></div>' +
    (busy ? '<span class="dim" id="props-progress">A analisar o guião com IA… ' + busy.done + ' de ' + busy.total + '</span>' :
      '<span class="row-actions"><button class="btn primary small" data-action="props-claude"' + (hasText ? '' : ' disabled') + '>Analisar no Claude</button><button class="btn small" data-action="props-rules"' + (hasText ? '' : ' disabled') + '>Rápida, sem IA</button></span>') + '</div>' +
    '<p class="note">Analisar no Claude: grátis, com a tua conta do Claude. Copias o pedido para uma conversa no Claude e trazes a resposta; a app guia-te em três passos. Rápida, sem IA: imediata, mas só procura objetos comuns e verbos de ação, por isso pode falhar ou apanhar palavras a mais.</p>' +
    (!hasText ? '<p class="form-msg">Este projeto ainda não tem o texto do guião. Importa-o em "' + T.units + '" (PDF, Fountain ou Final Draft).</p>' : '') +
    '</div>';
  const sort = state.ui.propSort || 'scene', stF = state.ui.propSt || '';
  const firstScene = pr => { const A = propAssoc(p, sc, pr); const idx = A.scenes.map(n => sc.scenes.findIndex(x => String(x.number || x.n) === String(n))).filter(x => x >= 0); return idx.length ? Math.min.apply(null, idx) : 1e6; };
  const byName = (a, b) => a.name.localeCompare(b.name, 'pt');
  const shown = list.filter(pr => !stF || (pr.status || 'Por arranjar') === stF);
  const row = (pr, extra) => {
    const A = propAssoc(p, sc, pr), refs = ((p.entities['prop:' + pr.id] || {}).blocks || []).reduce((n, b) => n + (b.images ? b.images.length : 0) + (b.links ? b.links.length : 0), 0), st0 = pr.status || 'Por arranjar';
    return '<tr data-action="ent" data-ent="' + esc('prop:' + pr.id) + '" tabindex="0"><td><b>' + esc(pr.name) + '</b>' + (pr.source === 'manual' ? '' : '<span class="src"> ' + (pr.source === 'ai' ? 'IA' : 'regras') + '</span>') + '</td><td class="dim">' + esc(pr.category) + '</td><td class="num">' + (A.scenes.map(sceneLabel).join(', ') || '—') + '</td><td>' + (A.chars.length ? '<span class="chips">' + A.chars.map(c => '<span class="chip">' + esc(c) + '</span>').join('') + '</span>' : '<span class="dim">—</span>') + '</td><td>' + esc(A.places.join(', ') || '—') + '</td>' +
      '<td data-action="noop"><select class="' + stCls(st0) + '" data-prop-field="status" data-id="' + pr.id + '" aria-label="Estado de ' + esc(pr.name) + '">' + PROP_STATUS.map(c => '<option' + (c === st0 ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></td><td class="num">' + (refs || '—') + '</td></tr>';
  };
  const grp = (label, n) => '<tr class="grp"><th colspan="7">' + label + (n != null ? ' <span class="dim num">' + n + '</span>' : '') + '</th></tr>';
  let rows = '';
  if (sort === 'name') rows = shown.slice().sort(byName).map(pr => row(pr)).join('');
  else if (sort === 'status') rows = PROP_STATUS.map(st => { const g = shown.filter(pr => (pr.status || 'Por arranjar') === st).sort(byName); return g.length ? grp('<span class="' + stCls(st) + ' st-tag">' + st + '</span>', g.length) + g.map(pr => row(pr)).join('') : ''; }).join('');
  else if (sort === 'cat') rows = PROP_CATS.map(c => { const g = shown.filter(pr => pr.category === c).sort(byName); return g.length ? grp(esc(c[0].toUpperCase() + c.slice(1)), g.length) + g.map(pr => row(pr)).join('') : ''; }).join('');
  else {
    rows = sc.scenes.map(s0 => { const num = String(s0.number || s0.n); const g = shown.filter(pr => propAssoc(p, sc, pr).scenes.indexOf(num) >= 0).sort(byName); return g.length ? grp('<span class="code">' + esc(num) + '</span> ' + esc(s0.heading || ''), g.length) + g.map(pr => row(pr)).join('') : ''; }).join('');
    const none = shown.filter(pr => firstScene(pr) === 1e6).sort(byName);
    if (none.length) rows += grp('Sem ' + T.unit.toLowerCase(), none.length) + none.map(pr => row(pr)).join('');
  }
  const counts = PROP_STATUS.map(st => [st, list.filter(pr => (pr.status || 'Por arranjar') === st).length]).filter(x => x[1]);
  const bar = list.length ? '<div class="stbar" aria-hidden="true">' + counts.map(([st, n]) => '<span class="' + stCls(st) + '" style="flex:' + n + '"></span>').join('') + '</div>' +
    '<div class="stlegend">' + counts.map(([st, n]) => '<button class="stchip' + (stF === st ? ' on' : '') + '" data-action="prop-stf" data-st="' + esc(st) + '" aria-pressed="' + (stF === st) + '"><i class="' + stCls(st) + '"></i>' + st + ' <b class="num">' + n + '</b></button>').join('') + (stF ? '<button class="linkish" data-action="prop-stf" data-st="">Ver todos</button>' : '') + '</div>' : '';
  const tools = list.length ? '<div class="list-tools">' + bar + '<label class="sortby"><span>Ordenar por</span><select class="input" data-prop-sort>' + PROP_SORTS.map(([k, l]) => '<option value="' + k + '"' + (k === sort ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>' : '';
  return '<header class="page-head"><div class="page-title"><span class="lbl">' + T.base + ' · ' + dot(deptColor(p, 'Arte')) + 'Arte</span><h2 class="display">Adereços</h2><p class="dim">' + all.filter(x => x.kind === 'action').length + ' de ação · ' + all.filter(x => x.kind === 'set').length + ' de cenário</p></div></header>' + menu +
    '<div class="cats" role="tablist">' + [['action','De ação'],['set','De cenário']].map(([k, l]) => '<button role="tab" aria-selected="' + (tab === k) + '" data-action="prop-tab" data-tab="' + k + '">' + l + '<small>' + all.filter(x => x.kind === k).length + '</small></button>').join('') + '</div>' +
    tools + (rows ? '<div class="table-wrap"><table class="breakdown' + (sort === 'name' ? '' : ' grouped') + '"><thead><tr><th>Adereço</th><th>Tipo</th><th>' + T.units.split(' ')[0] + '</th><th>Quem interage</th><th>' + T.place + '</th><th>Estado</th><th>Refs.</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : stF && list.length ? '<div class="empty"><p>Nenhum adereço ' + (tab === 'action' ? 'de ação' : 'de cenário') + ' com o estado ' + esc(stF) + '.</p></div>' : '<div class="empty"><p>' + (tab === 'action' ? 'Ainda sem adereços de ação. Analisa o guião ou junta à mão.' : 'Os adereços de cenário vestem o espaço sem serem manuseados. Juntas aqui ou na página de cada ' + T.place.toLowerCase() + '.') + '</p></div>') +
    '<form class="unit-add prop-form" data-form="prop-add" data-kind="' + tab + '" novalidate><label class="field"><span>Novo adereço ' + (tab === 'action' ? 'de ação' : 'de cenário') + '</span><input class="input" name="name" autocomplete="off" placeholder="Ex.: isqueiro de prata"></label>' +
      '<label class="field"><span>' + T.place + '</span><select class="input" name="place"><option value="">—</option>' + sc.places.map(x => '<option>' + esc(x.name) + '</option>').join('') + '</select></label>' +
      '<label class="field"><span>' + T.person + '</span><select class="input" name="char"><option value="">—</option>' + sc.chars.map(x => '<option>' + esc(x.name) + '</option>').join('') + '</select></label><button class="btn primary" type="submit">Juntar</button></form><p class="form-msg"></p>';
}
function propView(p, sc, id){
  const pr = (p.props || []).find(x => x.id === id); if (!pr) return null;
  const key = 'prop:' + id, T = KT(p), A = propAssoc(p, sc, pr);
  if (!p.entities[key]) { p.entities[key] = {blocks:[newBlock('images', 'Referências'), {id:uid(), type:'links', title:'Onde comprar ou alugar', links:[]}, newBlock('note', 'Notas')], photoShot:{}}; persist(p); }
  const e = p.entities[key], list = (p.props || []).filter(x => x.kind === pr.kind).sort((a, b) => a.name.localeCompare(b.name, 'pt')), i = list.indexOf(pr), prev = list[i - 1], next = list[i + 1];
  const nav = '<div class="ent-nav"><button class="back lbl" data-action="ent-back">‹ Adereços</button><span class="row-actions">' + (prev ? '<button class="btn small" data-action="ent" data-ent="prop:' + prev.id + '" aria-label="Adereço anterior">‹</button>' : '') + '<span class="dim num" style="font-size:.84rem">' + (i + 1) + ' de ' + list.length + '</span>' + (next ? '<button class="btn small" data-action="ent" data-ent="prop:' + next.id + '" aria-label="Adereço seguinte">›</button>' : '') + '</span></div>';
  const chipList = (arr, kind, field) => arr.map(c => '<span class="chip-x">' + entLink(kind + ':' + c, c, 'chip') + '<button class="x" data-action="prop-unlink" data-id="' + id + '" data-field="' + field + '" data-name="' + esc(c) + '" aria-label="Tirar ' + esc(c) + '">×</button></span>').join('');
  const opts = (all, used) => all.filter(x => used.indexOf(x) < 0).map(x => '<option>' + esc(x) + '</option>').join('');
  const head = '<header class="ent-head"><span class="lbl">Adereço ' + (pr.kind === 'action' ? 'de ação' : 'de cenário') + (pr.source !== 'manual' ? ' · encontrado ' + (pr.source === 'ai' ? 'pela IA' : 'pela análise rápida') : '') + '</span><h2 class="display" contenteditable="true" data-prop-name="' + id + '" spellcheck="false">' + esc(pr.name) + '</h2>' +
    '<p class="lede" contenteditable="true" data-prop-desc="' + id + '" data-ph="Descrição do adereço.">' + esc(pr.desc || '') + '</p></header>' +
    '<div class="facts ent-facts"><div><span class="lbl">Tipo</span><p><select class="input mini-sel" data-prop-field="kind" data-id="' + id + '"><option value="action"' + (pr.kind === 'action' ? ' selected' : '') + '>De ação</option><option value="set"' + (pr.kind === 'set' ? ' selected' : '') + '>De cenário</option></select></p></div>' +
    '<div><span class="lbl">Categoria</span><p><select class="input mini-sel" data-prop-field="category" data-id="' + id + '">' + PROP_CATS.map(c => '<option' + (c === pr.category ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></p></div>' +
    '<div><span class="lbl">Estado</span><p><select class="' + stCls(pr.status || 'Por arranjar') + '" data-prop-field="status" data-id="' + id + '">' + PROP_STATUS.map(c => '<option' + (c === (pr.status || 'Por arranjar') ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></p></div>' +
    '<div><span class="lbl">Quantidade</span><p><input class="input mini-in" data-prop-field="qty" data-id="' + id + '" value="' + esc(pr.qty || '') + '" placeholder="Ex.: 3 (um parte-se)"></p></div>' +
    '<div><span class="lbl">' + T.people + '</span><p class="chips">' + chipList(A.chars, 'char', 'chars') + '<select class="input mini-sel" data-prop-link="chars" data-id="' + id + '" aria-label="Juntar personagem"><option value="">+ Juntar…</option>' + opts(sc.chars.map(c => c.name), A.chars) + '</select></p></div>' +
    '<div><span class="lbl">' + T.places + '</span><p class="chips">' + chipList(A.places, 'place', 'places') + '<select class="input mini-sel" data-prop-link="places" data-id="' + id + '" aria-label="Juntar décor"><option value="">+ Juntar…</option>' + opts(sc.places.map(c => c.name), A.places) + '</select></p></div></div>';
  const apps = (pr.appear || []).slice().sort((a, b) => (parseInt(a.scene, 10) || 0) - (parseInt(b.scene, 10) || 0)).map((a, j) => {
    const s = sc.scenes.find(x => String(x.number || x.n) === String(a.scene));
    return '<li class="appear"><div class="appear-head">' + entLink('scene:' + a.scene, T.unit + ' ' + a.scene + (s ? ' · ' + (s.heading || '') : ''), 'slug-link') + '<button class="x" data-action="prop-app-del" data-id="' + id + '" data-i="' + (pr.appear.indexOf(a)) + '" aria-label="Tirar esta referência">×</button></div>' +
      (a.quote ? '<blockquote>' + esc(a.quote) + '</blockquote>' : '') +
      (a.interactions && a.interactions.length ? '<ul class="inter">' + a.interactions.map(x => '<li><b>' + esc(x.character) + '</b> — ' + esc(x.action) + '</li>').join('') + '</ul>' : '<p class="note">Mencionado, sem interação de personagens.</p>') +
      (a.continuity ? '<p class="cont"><span class="lbl">Continuidade</span> ' + esc(a.continuity) + '</p>' : '') + '</li>';
  }).join('');
  const addApp = '<form class="appear-add" data-form="prop-app" data-id="' + id + '" novalidate><label class="field"><span>' + T.unit + '</span><select class="input" name="scene">' + sc.scenes.map(s => '<option value="' + esc(s.number || s.n) + '">' + esc((s.number || s.n) + '. ' + (s.heading || '')) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>' + T.person + '</span><select class="input" name="char"><option value="">—</option>' + sc.chars.map(c => '<option>' + esc(c.name) + '</option>').join('') + '</select></label><label class="field grow"><span>O que acontece com o adereço</span><input class="input" name="action" autocomplete="off" placeholder="Ex.: pousa-o na mesa e sai"></label><button class="btn small" type="submit">Juntar</button></form>';
  const body = '<section class="ent-sec"><div class="sec-head"><h3 class="h2">No guião</h3><span class="dim">' + pl(A.scenes.length, T.unit.toLowerCase(), T.units.split(' ')[0].toLowerCase()) + '</span></div>' + (apps ? '<ul class="appears">' + apps + '</ul>' : '<p class="note">Ainda sem referências ao guião.</p>') + addApp + '</section>' +
    tasksSection(p, sc, key, e) + '<div class="row-actions" style="margin-bottom:var(--space-section)"><button class="btn ghost small" data-action="prop-del" data-id="' + id + '">Tirar este adereço</button></div>';
  return nav + head + body + blocksView(e, false, [['images','Referências'],['links','Links de produtos'],['note','Nota'],['fields','Informações'],['list','Lista']], 'Referências e onde arranjar');
}
/* PDF → texto com a disposição do guião (linhas e espaços entre blocos) */
async function pdfToText(file){
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({data:await file.arrayBuffer()}).promise;
  const out = [];
  for (let pn = 1; pn <= doc.numPages; pn++) {
    const page = await doc.getPage(pn), tc = await page.getTextContent(), H = page.getViewport({scale:1}).height;
    const rows = [];
    tc.items.forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const x = it.transform[4], y = it.transform[5];
      let r = rows.find(r0 => Math.abs(r0.y - y) < 2.5);
      if (!r) { r = {y, parts:[]}; rows.push(r); }
      r.parts.push({x, s:it.str, w:it.width || 0});
    });
    rows.sort((a, b) => b.y - a.y);
    const lines = rows.map(r => { r.parts.sort((a, b) => a.x - b.x); let s = '', end = null; r.parts.forEach(pt => { if (end != null && pt.x - end > 2 && !/\s$/.test(s) && !/^\s/.test(pt.s)) s += ' '; s += pt.s; end = pt.x + pt.w; }); return {y:r.y, x:r.parts[0].x, t:s.replace(/\s+/g, ' ').trim()}; })
      .filter(l => !(l.y > H - 60 && /^\d+\.?$/.test(l.t)) && !(l.y < 50 && /^\d+\.?$/.test(l.t)) && !/^\(?(CONTINUED|CONTINUA|CONTINUAÇÃO|CONT['’]D|MORE|MAIS)\)?:?$/i.test(l.t));
    const gaps = []; for (let i = 1; i < lines.length; i++) gaps.push(lines[i - 1].y - lines[i].y);
    const lh = gaps.length ? gaps.slice().sort((a, b) => a - b)[Math.floor(gaps.length * .25)] : 12;
    lines.forEach((l, i) => {
      if (i > 0 && lines[i - 1].y - l.y > lh * 1.5) out.push('');
      let t = l.t.replace(/\s+\d+[A-Z]?\.?\s*$/, m => (/^\s*(\d+[A-Z]?\.?\s+)?(INT|EXT|I\/E)/i.test(l.t) ? '' : m));
      out.push(t);
    });
    out.push('');
  }
  return out.join('\n').replace(/\(CONT['’]D\)|\(CONT\.\)/gi, '').replace(/\n{3,}/g, '\n\n');
}
function sceneLinks(p, sc, nums){
  return '<div class="scene-links">' + nums.map(n => {
    const s = sc.scenes.find(x => x.n === n); if (!s) return '';
    const num = String(s.number || s.n), e = p.entities['scene:' + num], ph = projPhotos(p).filter(f => photoScene(p, f) === num);
    return '<button class="scene-link" data-action="ent" data-ent="' + esc('scene:' + num) + '"><span class="pick-n">' + esc(num) + '</span><span class="' + (sc.source === 'manual' ? '' : 'slug') + '">' + esc(s.heading || 'Sem nome') + (s.start ? ' · ' + esc(s.start) + (s.end ? '–' + esc(s.end) : '') : '') + '</span><small>' + ((e && e.shots ? pl(e.shots.length, 'plano', 'planos') : 'planos por ver') + (ph.length ? ' · ' + pl(ph.length, 'foto', 'fotos') : '')) + '</small></button>';
  }).join('') + '</div>';
}
function shotCard(p, s, e, sh, photos){
  const imgs = tag => (sh.images || []).filter(x => x.tag === tag);
  const thumbs = (tag) => imgs(tag).map(x => '<figure class="thumb-img">' + imgTag(x.path, sh.code) + '<button class="x" data-action="shot-img-del" data-shot="' + sh.id + '" data-path="' + esc(x.path) + '" aria-label="Tirar imagem">×</button></figure>').join('');
  const cam = (s.lhItems || []).some(i => i.kind === 'CAMERA' && String(i.label).toUpperCase() === sh.code);
  const sb = photos.map(f => '<figure class="thumb-img">' + imgTag((f.meta && f.meta.thumb_path) || f.storage_path, 'Viewfinder ' + sh.code) + '<figcaption>Viewfinder' + (f.meta && f.meta.lens_mm ? ' · ' + esc(f.meta.lens_mm) + ' mm' : '') + '</figcaption></figure>').join('') + thumbs('storyboard');
  return '<article class="shot"><div class="shot-top"><b class="shot-code">' + esc(sh.code) + '</b>' +
    '<select class="input" data-shot-field="size" data-shot="' + sh.id + '" aria-label="Enquadramento">' + Object.keys(SIZES).map(k => '<option value="' + k + '"' + (k === sh.size ? ' selected' : '') + '>' + SIZES[k] + '</option>').join('') + '</select>' +
    '<input class="input" data-shot-field="lens" data-shot="' + sh.id + '" value="' + esc(sh.lens) + '" placeholder="Lente" aria-label="Lente">' +
    '<input class="input" data-shot-field="move" data-shot="' + sh.id + '" value="' + esc(sh.move) + '" placeholder="Movimento" aria-label="Movimento">' +
    '<button class="btn ghost small" data-action="task-for" data-target="' + esc('shot:' + sh.id) + '">+ Tarefa</button><button class="x" data-action="shot-del" data-shot="' + sh.id + '" aria-label="Tirar o plano ' + esc(sh.code) + '" title="Tirar o plano">×</button></div>' +
    '<p class="shot-desc" contenteditable="true" data-shot-text="' + sh.id + '" data-ph="O que se vê neste plano.">' + esc(sh.desc) + '</p>' +
    '<div class="shot-cols">' +
      '<div class="shot-col"><div class="col-head"><span class="lbl">Storyboard</span><button class="btn ghost small" data-action="shot-img" data-shot="' + sh.id + '" data-tag="storyboard">+ Imagem</button></div>' + (sb ? '<div class="thumbs">' + sb + '</div>' : frameSVG(sh, 2.39) + '<p class="note">Desenho provisório. As fotos do Viewfinder deste plano aparecem aqui.</p>') + '</div>' +
      '<div class="shot-col"><div class="col-head"><span class="lbl">Mapa de luz</span><button class="btn ghost small" data-action="shot-img" data-shot="' + sh.id + '" data-tag="luz">+ Imagem</button></div>' + (cam ? lhButton('scene:' + (s.number || s.n), sh.code, 'Câmara ' + sh.code + ' no mapa') : '<p class="note">Sem câmara ' + esc(sh.code) + ' no Lighthouse.</p>') + (imgs('luz').length ? '<div class="thumbs">' + thumbs('luz') + '</div>' : '') + '</div>' +
      '<div class="shot-col"><div class="col-head"><span class="lbl">Desenhos 3D</span><button class="btn ghost small" data-action="shot-img" data-shot="' + sh.id + '" data-tag="3d">+ Imagem</button></div>' + (imgs('3d').length ? '<div class="thumbs">' + thumbs('3d') + '</div>' : '<p class="note">Renders ou capturas do modelo 3D.</p>') +
        '<input class="input" data-shot-field="link3d" data-shot="' + sh.id + '" value="' + esc(sh.link3d) + '" placeholder="Link do modelo (SketchUp, Lab 3D…)" aria-label="Link do modelo 3D">' + (sh.link3d && /^https?:\/\//.test(sh.link3d) ? '<a class="note" href="' + esc(sh.link3d) + '" target="_blank" rel="noopener">Abrir o modelo</a>' : '') + '</div>' +
    '</div></article>';
}
function blocksView(e, bare, types, title){
  const blk = b => {
    let inner = '';
    if (b.type === 'note') inner = '<p class="ctext" contenteditable="true" data-blk-text="' + b.id + '" data-ph="Escreve aqui.">' + esc(b.text) + '</p>';
    else if (b.type === 'list') inner = '<ul class="checks">' + b.items.map((it, i) => '<li class="' + (it.done ? 'done' : '') + '"><input type="checkbox" data-blk-check="' + b.id + '" data-i="' + i + '"' + (it.done ? ' checked' : '') + ' aria-label="Feito"><span contenteditable="true" data-blk-item="' + b.id + '" data-i="' + i + '">' + esc(it.t) + '</span></li>').join('') + '</ul><form class="list-add" data-form="blk-item" data-id="' + b.id + '"><input class="input" autocomplete="off" placeholder="Novo item, Enter para juntar" aria-label="Novo item"></form>';
    else if (b.type === 'fields') inner = '<div class="kv">' + b.rows.map((r, i) => '<span contenteditable="true" class="kv-k" data-blk-k="' + b.id + '" data-i="' + i + '" data-ph="Campo">' + esc(r[0]) + '</span><span contenteditable="true" class="kv-v" data-blk-v="' + b.id + '" data-i="' + i + '" data-ph="—">' + esc(r[1]) + '</span>').join('') + '</div><button class="btn ghost small" data-action="blk-row" data-id="' + b.id + '">+ Campo</button>';
    else if (b.type === 'images') inner = (b.images.length ? '<div class="thumbs big">' + b.images.map(x => '<figure class="thumb-img">' + imgTag(x.path, b.title) + '<button class="x" data-action="blk-img-del" data-id="' + b.id + '" data-path="' + esc(x.path) + '" aria-label="Tirar imagem">×</button></figure>').join('') + '</div>' : '<p class="note">Ainda sem imagens.</p>') + '<button class="btn small" data-action="blk-img" data-id="' + b.id + '">+ Imagens</button>';
    else if (b.type === 'links') inner = (b.links.length ? '<ul class="links">' + b.links.map((l, j) => '<li><a href="' + esc(l.url) + '" target="_blank" rel="noopener">' + esc(l.label || l.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]) + '</a>' + (l.note ? '<span class="dim"> · ' + esc(l.note) + '</span>' : '') + '<button class="x" data-action="blk-link-del" data-id="' + b.id + '" data-i="' + j + '" aria-label="Tirar link">×</button></li>').join('') + '</ul>' : '<p class="note">Ainda sem links.</p>') +
      '<form class="link-add" data-form="blk-link" data-id="' + b.id + '" novalidate><input class="input" name="url" autocomplete="off" placeholder="https://… (loja, OLX, aluguer)" aria-label="Endereço"><input class="input" name="label" autocomplete="off" placeholder="Nome ou preço" aria-label="Nome ou preço"><button class="btn small" type="submit">Juntar</button></form>';
    else if (b.type === 'model') inner = (b.images.length ? '<div class="thumbs big">' + b.images.map(x => '<figure class="thumb-img">' + imgTag(x.path, b.title) + '<button class="x" data-action="blk-img-del" data-id="' + b.id + '" data-path="' + esc(x.path) + '" aria-label="Tirar imagem">×</button></figure>').join('') + '</div>' : '<p class="note">Renders ou capturas do modelo.</p>') +
      '<div class="row-actions"><button class="btn small" data-action="blk-img" data-id="' + b.id + '">+ Imagens</button></div><input class="input" data-blk-url="' + b.id + '" value="' + esc(b.url) + '" placeholder="Link do modelo (SketchUp, Lab 3D…)" aria-label="Link do modelo 3D">' + (/^https?:\/\//.test(b.url) ? '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">Abrir o modelo</a>' : '');
    else inner = '<div class="new-grid"><input class="input" data-blk-label=""' + b.id + '" value="' + esc(b.label) + '" placeholder="Nome" aria-label="Nome da ligação"><input class="input" data-blk-url="' + b.id + '" value="' + esc(b.url) + '" placeholder="https://" aria-label="Endereço"></div>' + (/^https?:\/\//.test(b.url) ? '<a href="' + esc(b.url) + '" target="_blank" rel="noopener">' + esc(b.label || b.url) + '</a>' : '');
    return '<section class="block"><div class="block-head"><h4 class="h3" contenteditable="true" data-blk-title="' + b.id + '" spellcheck="false">' + esc(b.title) + '</h4><span class="row-actions"><button class="x" data-action="blk-up" data-id="' + b.id + '" aria-label="Subir">↑</button><button class="x" data-action="blk-down" data-id="' + b.id + '" aria-label="Descer">↓</button><button class="x" data-action="blk-del" data-id="' + b.id + '" aria-label="Tirar bloco">×</button></span></div>' + inner + '</section>';
  };
  const list = types || Object.keys(BLOCKS).filter(k => k !== 'model').map(k => [k, BLOCKS[k]]), shotId = types === SHOT_BLOCKS ? e.id : null;
  return '<section class="ent-sec' + (shotId ? ' sp-blocks' : '') + '">' + (bare ? '' : '<div class="sec-head"><h3 class="h2">' + (title || 'Mais informação') + '</h3><span class="dim">Junta, muda de nome, ordena ou tira o que quiseres.</span></div>') + '<div class="blocks' + (bare ? ' doc-blocks' : '') + '">' + e.blocks.map(blk).join('') + '</div>' +
    '<div class="row-actions" style="margin-top:14px"><span class="lbl">Juntar</span>' + list.map(([k, l]) => '<button class="btn small" data-action="blk-add" data-type="' + k + '" data-title="' + esc(l) + '">' + esc(l) + '</button>').join('') + (shotId ? '<button class="btn small" data-action="shot-map-add" data-shot="' + shotId + '">Mapa de luz</button>' : '') + '</div></section>';
}
function vfCard(f){
  const m = f.meta || {};
  return '<figure class="vf">' + imgTag(m.thumb_path || f.storage_path, 'Foto do Viewfinder, plano ' + (f.shot || '')) + '<figcaption><b>Plano ' + esc(f.shot || '—') + '</b>' + (m.lens_mm ? ' · ' + esc(m.lens_mm) + ' mm' : '') + (m.kit ? ' · ' + esc(m.kit) : '') + (m.camera ? '<br>' + esc(String(m.camera).split('·')[0].trim()) + (m.aspect ? ' · ' + esc(m.aspect) : '') : '') + (m.note ? '<br>' + esc(m.note) : '') + '</figcaption></figure>';
}

/* board */
function boardCards(pg){
  let list = pg.data.cards || (pg.data.cards = []);
  state.ui.boardPath = state.ui.boardPath || {};
  const path = state.ui.boardPath[pg.id] || [], trail = [];
  for (let i = 0; i < path.length; i++) { const c = list.find(x => x.id === path[i] && x.type === 'board'); if (!c) { state.ui.boardPath[pg.id] = path.slice(0, i); break; } trail.push(c); list = c.cards || (c.cards = []); }
  return {list, trail};
}
const curCards = pg => boardCards(pg).list;
function boardView(pg){
  const B = boardCards(pg), cards = B.list;
  const crumbs = B.trail.length ? '<nav class="crumbs" aria-label="Boards"><button class="link-btn" data-action="board-go" data-depth="0">' + esc(pg.title) + '</button>' + B.trail.map((c, i) => '<span class="dim">›</span>' + (i === B.trail.length - 1 ? '<b>' + esc(c.title || 'Board sem nome') + '</b>' : '<button class="link-btn" data-action="board-go" data-depth="' + (i + 1) + '">' + esc(c.title || 'Board sem nome') + '</button>')).join('') + '</nav>' : '';
  return crumbs + '<div class="toolbar"><div class="tools"><button class="btn" data-action="add-card" data-type="note">Nota</button><button class="btn" data-action="add-image">Imagem</button><button class="btn" data-action="add-card" data-type="palette">Paleta</button><button class="btn" data-action="add-card" data-type="list">Lista</button><button class="btn" data-action="add-card" data-type="board">Board</button></div>' +
    '<p class="hint">Arrastas um cartão pela barra de cima. Para mudar o texto, clicas nele e escreves.</p></div>' +
    '<div class="board-scroll" id="board-scroll"><div class="board" id="board">' +
    (cards.length ? cards.map(cardHTML).join('') : '<div class="board-empty"><b>O board está vazio.</b><span>Junta aqui notas, imagens de referência, paletas e listas. Ficam onde as deixares.</span></div>') + '</div></div>';
}
function cardHTML(c){
  let body = '';
  const ttl = '<h3 class="ctitle" contenteditable="true" data-field="title" data-ph="Título" spellcheck="false">' + esc(c.title) + '</h3>';
  if (c.type === 'note') body = ttl + '<p class="ctext" contenteditable="true" data-field="text" data-ph="Escreve aqui.">' + esc(c.text) + '</p>';
  else if (c.type === 'ref') body = (c.path ? imgTag(c.path, c.caption || 'Imagem de referência') : frameSVG({size:'GP', x:.55}, 2.39)) + '<p class="ccap" contenteditable="true" data-field="caption" data-ph="Legenda">' + esc(c.caption) + '</p>';
  else if (c.type === 'palette') body = ttl + '<div class="swatches">' + c.colors.map((col, i) => '<label class="sw" style="background:' + esc(col) + '"><input type="color" value="' + esc(col) + '" data-swatch="' + i + '" aria-label="Cor ' + (i + 1) + '"></label>').join('') + '</div><div class="hexes">' + c.colors.map((col, i) => '<span data-hex="' + i + '">' + esc(col.toUpperCase()) + '</span>').join('') + '</div>';
  else if (c.type === 'board') { const kids = c.cards || []; body = ttl + '<p class="ccap">' + (kids.length ? pl(kids.length, 'cartão', 'cartões') + ': ' + esc(kids.slice(0, 3).map(k => k.title || CARD_LABEL[k.type]).join(', ')) + (kids.length > 3 ? '…' : '') : 'Vazio') + '</p><button class="btn small" data-action="board-open" data-id="' + c.id + '">Abrir</button>'; }
  else body = ttl + '<ul class="checks">' + c.items.map((it, i) => '<li class="' + (it.done ? 'done' : '') + '"><input type="checkbox" id="chk-' + c.id + '-' + i + '" data-check="' + i + '"' + (it.done ? ' checked' : '') + ' aria-label="Feito"><span contenteditable="true" data-item="' + i + '">' + esc(it.t) + '</span></li>').join('') +
    '</ul><form class="list-add" data-form="list-add" data-id="' + c.id + '"><input class="input" id="add-' + c.id + '" autocomplete="off" placeholder="Novo item, Enter para juntar" aria-label="Novo item"></form>';
  return '<article class="bcard bcard-' + c.type + (c.h && c.type !== 'ref' ? ' sized' : '') + '" data-card="' + c.id + '" style="left:' + c.x + 'px;top:' + c.y + 'px;width:' + (c.w || CARD_W[c.type]) + 'px;' + (c.h && c.type !== 'ref' ? 'height:' + c.h + 'px;' : '') + 'z-index:' + (c.z || 1) + '"><span class="rsz" data-rsz title="Arrasta para mudar o tamanho" aria-hidden="true"></span><header class="grip" data-grip><span class="lbl">' + CARD_LABEL[c.type] + '</span><button class="x" type="button" data-action="card-del" data-id="' + c.id + '" aria-label="Deitar fora este cartão" title="Deitar fora">×</button></header><div class="cbody">' + body + '</div></article>';
}
/* ---------- board em ecrã inteiro (como um Milanote ou um Miro) ---------- */
const BT = {
  note:'<svg viewBox="0 0 24 24"><path d="M5 4h14v11l-5 5H5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M14 20v-5h5M8 9h8M8 12.5h5" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  image:'<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 17l5-4.5 3.5 3 3-2.5L20 17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
  palette:'<svg viewBox="0 0 24 24"><circle cx="8" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="16" cy="9" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="16" r="3.2" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
  list:'<svg viewBox="0 0 24 24"><path d="M9 7h11M9 12h11M9 17h11" stroke="currentColor" stroke-width="1.7"/><path d="M4 6.5l1.2 1.2L7 5.8M4 11.5l1.2 1.2L7 10.8M4 16.5l1.2 1.2L7 15.8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  board:'<svg viewBox="0 0 24 24"><rect x="3.5" y="4.5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="1.7"/><rect x="7" y="8" width="5" height="4" rx=".8" fill="currentColor"/><rect x="13.5" y="11" width="4" height="5" rx=".8" fill="currentColor"/></svg>'
};
function bvKey(pg){ return pg.id + '/' + (((state.ui.boardPath || {})[pg.id]) || []).join('/'); }
function bview(pg){ state.ui.bview = state.ui.bview || {}; const k = bvKey(pg); return state.ui.bview[k] || (state.ui.bview[k] = {x:96, y:110, z:1}); }
function boardFull(p, pg){
  const B = boardCards(pg), cards = B.list, v = bview(pg);
  const crumbs = '<button class="bfs-crumb" data-action="bfs-exit">' + esc(p.name) + '</button><span class="bfs-sep">/</span>' +
    (B.trail.length ? '<button class="bfs-crumb" data-action="board-go" data-depth="0">' + esc(pg.title) + '</button>' + B.trail.map((c, i) => '<span class="bfs-sep">/</span>' + (i === B.trail.length - 1 ? '<b>' + esc(c.title || 'Board sem nome') + '</b>' : '<button class="bfs-crumb" data-action="board-go" data-depth="' + (i + 1) + '">' + esc(c.title || 'Board sem nome') + '</button>')).join('') : '<b contenteditable="true" data-page-title spellcheck="false">' + esc(pg.title) + '</b>');
  const tool = (act, type, label) => '<button class="bfs-tool" data-action="' + act + '"' + (type ? ' data-type="' + type + '"' : '') + ' title="' + label + '" aria-label="Juntar ' + label.toLowerCase() + '">' + BT[type || 'image'] + '<span>' + label + '</span></button>';
  return '<div class="bfs' + (state.ui.bfsNav || state.ui.renaming ? ' nav-open' : '') + '" id="bfs">' +
    '<div class="bfs-view" id="bfs-view" style="background-size:' + (24 * v.z) + 'px ' + (24 * v.z) + 'px;background-position:' + v.x + 'px ' + v.y + 'px"><div class="bfs-canvas" id="board" style="transform:translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.z + ')">' + cards.map(cardHTML).join('') + '</div></div>' +
    (cards.length ? '' : '<div class="bfs-empty"><b>Board vazio.</b><span>Junta notas, imagens, paletas, listas ou outros boards com a barra da direita. Também podes arrastar imagens do computador para aqui.</span></div>') +
    '<header class="bfs-top"><button class="bfs-logo" data-action="bfs-nav" aria-expanded="' + !!state.ui.bfsNav + '" title="Páginas do projeto">' + MARK + '<span>PØRTAL STUDIØ</span></button><nav class="bfs-crumbs" aria-label="Onde estás">' + crumbs + '</nav><span class="status bfs-status' + (state.status === 'off' ? ' off' : '') + '" id="status">' + STATUS[state.status] + '</span></header>' +
    '<div class="bfs-edge" aria-hidden="true"></div>' +
    '<div class="bfs-nav" aria-label="Páginas do projeto"><div class="bfs-nav-head"><button class="back lbl" data-action="home">‹ Projetos</button><b>' + esc(p.name) + '</b></div>' + sideView(p) + '</div>' +
    '<aside class="bfs-tools" aria-label="Juntar ao board">' + tool('add-card', 'note', 'Nota') + tool('add-image', null, 'Imagem') + tool('add-card', 'palette', 'Paleta') + tool('add-card', 'list', 'Lista') + tool('add-card', 'board', 'Board') + '</aside>' +
    '<div class="bfs-zoom" role="group" aria-label="Zoom"><button data-action="zoom-out" aria-label="Afastar" title="Afastar (Ctrl + roda do rato)">−</button><button class="num" data-action="zoom-reset" id="zoom-pct" title="Voltar a 100 %">' + Math.round(v.z * 100) + '%</button><button data-action="zoom-in" aria-label="Aproximar" title="Aproximar (Ctrl + roda do rato)">+</button><button data-action="zoom-fit" title="Ver tudo">Ver tudo</button></div>' +
    '<p class="bfs-hint">Arrasta o fundo para te moveres · Ctrl + roda do rato para zoom · canto inferior direito de cada cartão para o tamanho</p>' +
    '</div>';
}
function applyView(){
  const p = cur(), pg = p && curPage(p), c = $('#board'), vw = $('#bfs-view'); if (!pg || pg.type !== 'board' || !c || !vw) return;
  const v = bview(pg);
  c.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + v.z + ')';
  vw.style.backgroundSize = (24 * v.z) + 'px ' + (24 * v.z) + 'px'; vw.style.backgroundPosition = v.x + 'px ' + v.y + 'px';
  const z = $('#zoom-pct'); if (z) z.textContent = Math.round(v.z * 100) + '%';
  clearTimeout(applyView.t); applyView.t = setTimeout(saveUi, 400);
}
function zoomAt(f, cx, cy){
  const p = cur(), pg = p && curPage(p), vw = $('#bfs-view'); if (!pg || !vw) return;
  const v = bview(pg), r = vw.getBoundingClientRect();
  if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
  const nz = Math.min(4, Math.max(0.1, v.z * f));
  v.x = cx - (cx - v.x) * nz / v.z; v.y = cy - (cy - v.y) * nz / v.z; v.z = nz; applyView();
}
function zoomFit(){
  const p = cur(), pg = p && curPage(p), vw = $('#bfs-view'); if (!pg || !vw) return;
  const v = bview(pg), els = Array.from(document.querySelectorAll('#board .bcard'));
  if (!els.length) { v.x = 96; v.y = 110; v.z = 1; applyView(); return; }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  els.forEach(el => { x0 = Math.min(x0, el.offsetLeft); y0 = Math.min(y0, el.offsetTop); x1 = Math.max(x1, el.offsetLeft + el.offsetWidth); y1 = Math.max(y1, el.offsetTop + el.offsetHeight); });
  const r = vw.getBoundingClientRect(), padL = 90, padR = 120, padT = 90, padB = 90;
  const z = Math.min(1.5, Math.max(0.1, Math.min((r.width - padL - padR) / Math.max(1, x1 - x0), (r.height - padT - padB) / Math.max(1, y1 - y0))));
  v.z = z; v.x = padL + ((r.width - padL - padR) - (x1 - x0) * z) / 2 - x0 * z; v.y = padT + ((r.height - padT - padB) - (y1 - y0) * z) / 2 - y0 * z; applyView();
}
function toCanvas(clientX, clientY){
  const p = cur(), pg = p && curPage(p), vw = $('#bfs-view'); if (!pg || !vw) return {x:40, y:40};
  const v = bview(pg), r = vw.getBoundingClientRect();
  return {x:Math.round((clientX - r.left - v.x) / v.z), y:Math.round((clientY - r.top - v.y) / v.z)};
}
function sizeBoard(){
  if ($('#bfs')) return;
  const b = $('#board'); if (!b) return;
  let w = 1200, h = 760;
  b.querySelectorAll('.bcard').forEach(el => { w = Math.max(w, el.offsetLeft + el.offsetWidth + 160); h = Math.max(h, el.offsetTop + el.offsetHeight + 160); });
  b.style.width = w + 'px'; b.style.height = h + 'px';
}
function addCard(c){
  const p = cur(), pg = curPage(p), sc = $('#board-scroll'), cards = curCards(pg), n = cards.length;
  const z = cards.reduce((m, x) => Math.max(m, x.z || 1), 1) + 1;
  let x0 = (sc ? sc.scrollLeft : 0) + 40, y0 = (sc ? sc.scrollTop : 0) + 40;
  const vw = $('#bfs-view'); if (vw) { const r = vw.getBoundingClientRect(), pt = toCanvas(r.left + r.width / 2, r.top + r.height / 2); x0 = pt.x - (CARD_W[c.type] || 250) / 2; y0 = pt.y - 90; }
  const nc = Object.assign({id:uid(), x:x0 + (n % 5) * 22, y:y0 + (n % 5) * 22, z}, c);
  cards.push(nc); render(); persist(p);
  const el = document.querySelector('[data-card="' + nc.id + '"] [contenteditable]'); if (el && c.type !== 'ref') el.focus();
}

/* tabela */
function tableView(pg){
  const d = pg.data;
  return '<div class="table-box table-wrap"><table class="grid-table"><thead><tr>' + d.cols.map((c, i) => '<th><div class="th-wrap"><span contenteditable="true" data-head="' + i + '" spellcheck="false">' + esc(c) + '</span>' + (d.cols.length > 1 ? '<button class="x" data-action="col-del" data-i="' + i + '" aria-label="Tirar a coluna ' + esc(c) + '">×</button>' : '') + '</div></th>').join('') + '<th class="rowx"></th></tr></thead><tbody>' +
    d.rows.map((r, ri) => '<tr>' + d.cols.map((c, ci) => '<td><span contenteditable="true" data-cell="' + ri + ',' + ci + '">' + esc(r[ci] || '') + '</span></td>').join('') + '<td class="rowx"><button class="x" data-action="row-del" data-i="' + ri + '" aria-label="Tirar a linha ' + (ri + 1) + '">×</button></td></tr>').join('') +
    '</tbody></table></div><div class="row-actions" style="margin-top:14px"><button class="btn small" data-action="row-add">+ Linha</button><button class="btn small" data-action="col-add">+ Coluna</button>' + (d.rows.length ? '<span class="note">' + pl(d.rows.length, 'linha', 'linhas') + '</span>' : '') + '</div>';
}

/* mapa de luz */
function mapView(p, pg){
  const m = pg.data, sel = m.items.find(i => i.id === state.ui.mapSel), sc = getScript(p);
  const scene = sc && m.scene != null ? sc.scenes.find(s => s.n === m.scene) : null;
  let chars = sc ? (scene ? scene.chars : sc.chars.map(c => c.name)) : [];
  if (m.place && sc) { const pc = sc.places.find(x => x.name === m.place); if (pc) { chars = []; pc.scenes.forEach(n => { const s2 = sc.scenes.find(x => x.n === n); (s2 ? s2.chars : []).forEach(c => { if (chars.indexOf(c) < 0) chars.push(c); }); }); } }
  let inspector;
  if (sel) {
    const f = (k, l, v, t, extra) => '<label class="field"><span>' + l + '</span><input class="input" id="mf-' + k + '" data-mfield="' + k + '" value="' + esc(v == null ? '' : v) + '"' + (t ? ' type="' + t + '"' : '') + (extra || '') + ' autocomplete="off"></label>';
    const selF = (k, l, v, opts) => '<label class="field"><span>' + l + '</span><select class="input" data-mfield="' + k + '">' + opts.map(o => { const val = Array.isArray(o) ? o[0] : o, lab = Array.isArray(o) ? o[1] : o; return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select></label>';
    const auto = sel.rot == null || sel.rot === '', a = Math.round((itemAngle(m, sel) % 360 + 360) % 360);
    const rot = sel.kind === 'piece' ? '<label class="field"><span>Rotação · ' + Math.round(+sel.rot || 0) + '°</span><input type="range" min="0" max="359" data-mfield="rot" value="' + Math.round(+sel.rot || 0) + '"></label>'
      : '<label class="field"><span>Direção · ' + a + '°</span><input type="range" min="0" max="359" data-mfield="rot" value="' + a + '"' + (auto ? ' disabled' : '') + '></label><label class="check-row"><input type="checkbox" data-mauto' + (auto ? ' checked' : '') + '> ' + (sel.kind === 'actor' ? 'Virado para a câmara' : 'Apontar para a personagem mais perto') + '</label>';
    const kindName = {cam:'Câmara', actor:'Personagem', light:'Luz', piece:'Décor'}[sel.kind];
    let fields = '';
    if (sel.kind === 'cam') fields = f('label', 'Plano ou letra', sel.label) + '<div class="two">' + f('focal', 'Distância focal (mm)', sel.focal || 35, 'number', ' min="4" max="1200"') + selF('sensor', 'Sensor', sel.sensor || '24.9', SENSORS) + '</div><p class="note">Abertura do enquadramento: ' + Math.round(camHalf(sel) * 2) + '° na horizontal.</p>';
    else if (sel.kind === 'light') fields = f('label', 'Função', sel.label, '', ' placeholder="Key, contra, enchimento…"') + selF('type', 'Tipo', sel.type || 'Fresnel', LIGHT_TYPES) + f('model', 'Modelo', sel.model || sel.fix, '', ' placeholder="Ex.: Aputure 600d"') +
      '<div class="two">' + f('cct', 'Temperatura (K)', sel.cct, 'number', ' min="1000" max="12000" step="100"') + f('intensity', 'Intensidade (%)', sel.intensity, 'number', ' min="0" max="100"') + '</div>' +
      '<div class="two">' + f('gel', 'Gelatina ou filtro', sel.gel || sel.set, '', ' placeholder="1/4 CTB, difusão…"') + f('spread', 'Feixe (°)', sel.spread || 45, 'number', ' min="5" max="180"') + '</div>' + f('notes', 'Notas', sel.notes);
    else if (sel.kind === 'actor') fields = f('label', 'Nome', sel.label, '', ' list="dl-map-chars"') + '<datalist id="dl-map-chars">' + chars.map(c => '<option value="' + esc(c) + '">').join('') + '</datalist>';
    else fields = f('label', 'Nome', sel.label) + '<div class="two">' + f('w', 'Largura', sel.w, 'number', ' min="4" max="600"') + f('h', 'Profundidade', sel.h, 'number', ' min="4" max="600"') + '</div>';
    inspector = '<div class="panel inspector"><div class="row-actions" style="justify-content:space-between"><span class="lbl">' + kindName + '</span><button class="x" data-action="map-unsel" aria-label="Fechar">×</button></div>' + fields + rot +
      '<div class="row-actions"><button class="btn ghost small" data-action="map-dup">Duplicar</button><button class="btn ghost small" data-action="map-del">Tirar do mapa</button></div></div>';
  } else {
    let n = 0;
    const lights = m.items.filter(i => i.kind === 'light'), cams = m.items.filter(i => i.kind === 'cam');
    inspector = '<div class="panel inspector"><span class="lbl">Legenda</span>' + (lights.length || cams.length ? '<ol class="legend">' +
      lights.map(l => '<li><span class="ln">' + (++n) + '</span><div><b>' + esc(l.label || l.type || 'Luz') + '</b><br><span class="dim num">' + esc(lightLine(l) || '—') + '</span></div></li>').join('') +
      cams.map(k => '<li><span class="ln cam">' + esc((k.label || 'A').slice(0, 3)) + '</span><div><b>Câmara ' + esc(k.label || '') + '</b><br><span class="dim num">' + esc(k.focal || 35) + ' mm · ' + esc((SENSORS.find(s => s[0] === String(k.sensor || '24.9')) || ['', 'Super 35'])[1]) + '</span></div></li>').join('') + '</ol>' : '<p class="note">Ainda sem luzes nem câmaras.</p>') +
      '<p class="note">Arrastas cada peça para o sítio dela. Clicas numa peça para mudar o tipo, a temperatura, a direção e o resto. Delete tira a peça escolhida.</p>' +
      '<label class="field"><span>Escala · 1 m = ' + (+m.scale || 40) + ' pontos</span><input type="range" min="15" max="80" data-mscale value="' + (+m.scale || 40) + '"></label></div>';
  }
  return '<div class="toolbar"><div class="tools" style="align-items:flex-end">' +
    '<button class="btn" data-action="map-add" data-kind="cam">Câmara</button>' +
    '<label class="field" style="width:auto"><span>Luz</span><select class="input" data-map-light><option value="">Juntar…</option>' + LIGHT_TYPES.map(t => '<option>' + t + '</option>').join('') + '</select></label>' +
    '<label class="field" style="width:auto"><span>Personagem</span><select class="input" data-map-char><option value="">Juntar…</option>' + chars.map(c => '<option>' + esc(c) + '</option>').join('') + '<option value="__outra">Outra pessoa</option></select></label>' +
    '<label class="field" style="width:auto"><span>Décor</span><select class="input" data-map-piece><option value="">Juntar…</option>' + Object.keys(PIECES).map(t => '<option>' + t + '</option>').join('') + '</select></label></div>' +
    '<button class="btn small" data-action="map-export">Exportar imagem</button></div>' +
    '<div class="map-wrap"><div class="map-box" id="map-box">' + mapSVG(m, state.ui.mapSel) + '</div>' + inspector + '</div>';
}

/* cronograma */
function timelineView(p, pg){
  const tasks = pg.data.tasks || (pg.data.tasks = []), ph = p.phases;
  let a = ph.pre.start, b = ph.pos.end;
  tasks.forEach(t => { if (t.start < a) a = t.start; if (t.end > b) b = t.end; });
  const s0 = pd(a); s0.setDate(s0.getDate() - ((s0.getDay() + 6) % 7)); const start = iso(s0);
  const total = dayDiff(start, b) + 7, pct = d => f1(dayDiff(start, d) / total * 100);
  let scale = '';
  for (let d = 0; d < total; d += 14) scale += '<span style="left:' + f1(d / total * 100) + '%">' + dm(addDays(start, d)) + '</span>';
  PHASES.forEach(([k, l]) => { scale += '<b style="left:' + pct(ph[k].start) + '%">' + l + '</b>'; });
  const bands = PHASES.map(([k], i) => '<div class="tl-band b' + (i % 2) + '" style="left:' + pct(ph[k].start) + '%;width:' + f1((dayDiff(ph[k].start, ph[k].end) + 1) / total * 100) + '%"></div>').join('');
  const t0 = today(), todayLine = t0 >= start && t0 <= addDays(start, total) ? '<div class="tl-today" style="left:' + pct(t0) + '%" title="Hoje"></div>' : '';
  const order = p.groups.map(g => g.name), depts = [];
  tasks.forEach(t => { if (depts.indexOf(t.dept) < 0) depts.push(t.dept); });
  depts.sort((x, y) => (order.indexOf(x) < 0 ? 99 : order.indexOf(x)) - (order.indexOf(y) < 0 ? 99 : order.indexOf(y)));
  const rows = depts.map(d => '<div class="tl-dept lbl">' + esc(d || 'Geral') + '</div>' + tasks.filter(t => t.dept === d).sort((x, y) => x.start < y.start ? -1 : 1).map(t =>
    '<div class="tl-name"><span title="' + esc(t.name) + '">' + esc(t.name) + '</span><button class="x" data-action="task-del" data-id="' + t.id + '" aria-label="Tirar ' + esc(t.name) + '">×</button></div>' +
    '<div class="tl-track">' + bands + todayLine + '<div class="tl-bar" style="left:' + pct(t.start) + '%;width:' + Math.max(.6, f1((dayDiff(t.start, t.end) + 1) / total * 100)) + '%" title="' + esc(t.name + ': ' + dm(t.start) + ' – ' + dm(t.end)) + '"></div></div>').join('')).join('');
  return '<div class="tl-box"><div class="tl"><div></div><div class="tl-scale">' + scale + '</div>' + (rows || '<div class="tl-name" style="grid-column:1/-1;color:var(--sw-dim)">Ainda sem tarefas. Juntas a primeira em baixo.</div>') + '</div></div>' +
    '<form class="task-form" data-form="task-add" novalidate><label class="field"><span>Tarefa</span><input class="input" id="tk-name" autocomplete="off" placeholder="Ex.: Prova de guarda-roupa"></label>' +
    '<label class="field"><span>Departamento</span><select class="input" id="tk-dept">' + p.groups.map(g => '<option>' + esc(g.name) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>Início</span><input class="input num" type="date" id="tk-a" value="' + t0 + '"></label><label class="field"><span>Fim</span><input class="input num" type="date" id="tk-b" value="' + addDays(t0, 6) + '"></label>' +
    '<button class="btn primary" type="submit">Juntar tarefa</button></form><p class="form-msg" id="tk-msg"></p>' +
    '<p class="note" style="margin-top:12px">As faixas de fundo são as fases do projeto e a linha laranja é hoje. As datas das fases mudam-se no topo, em Datas.</p>';
}

/* storyboard */
function storyView(p, pg){
  const sc = getScript(p), frames = pg.data.frames || (pg.data.frames = []);
  const scenes = [];
  frames.forEach(f => { if (scenes.indexOf(f.scene) < 0) scenes.push(f.scene); });
  scenes.sort((x, y) => (x || 999) - (y || 999));
  const head = n => { const s = sc && sc.scenes.find(x => x.n === n); return s ? (s.number || s.n) + '. ' + s.heading : (n ? 'Cena ' + n : 'Sem cena'); };
  const form = '<form class="frame-form" data-form="frame-add" novalidate><label class="field"><span>Cena</span><select class="input" id="fr-scene">' + (sc ? sc.scenes.map(s => '<option value="' + s.n + '">' + esc(s.number || s.n) + '. ' + esc(s.place) + '</option>').join('') : '<option value="">Sem guião</option>') + '</select></label>' +
    '<label class="field"><span>Enquadramento</span><select class="input" id="fr-size">' + Object.keys(SIZES).map(k => '<option value="' + k + '">' + SIZES[k] + '</option>').join('') + '</select></label>' +
    '<label class="field"><span>O que se vê</span><input class="input" id="fr-cap" autocomplete="off"></label>' +
    '<button class="btn primary" type="submit">Juntar quadro</button><button class="btn" type="button" data-action="frame-image">Com imagem</button></form>';
  const vf = projPhotos(p);
  const vfBlock = vf.length ? '<section class="section-gap stack"><div class="fhead"><span class="lbl">Fotos do Viewfinder · ' + vf.length + '</span><span class="src">aparecem aqui sozinhas</span></div>' +
    groupBy(vf, f => photoScene(p, f) || '—').map(([n, list]) => '<div class="stack"><div class="slug" style="font-weight:700;color:var(--sw-ink)">' + esc(n === '—' ? 'Sem cena' : head(+n)) + '</div><div class="photos">' + list.map(vfCard).join('') + '</div></div>').join('') + '</section>' : '';
  const own = frames.length ? scenes.map(n => '<section class="sb-scene"><div class="slug" style="font-weight:700;color:var(--sw-ink)">' + esc(head(n)) + '</div><div class="frames">' +
    frames.filter(f => f.scene === n).map(f => '<figure class="frame" data-frame="' + f.id + '">' + (f.path ? imgTag(f.path, f.caption || 'Quadro ' + f.code) : frameSVG(f, 2.39)) +
      '<div class="frame-meta"><span><b class="code">' + esc(f.code) + '</b> <span class="dim">· ' + esc(SIZES[f.size] || '') + '</span></span><button class="x" data-action="frame-del" data-id="' + f.id + '" aria-label="Deitar fora o quadro ' + esc(f.code) + '">×</button></div>' +
      '<figcaption><span contenteditable="true" data-frame-cap="' + f.id + '" data-ph="O que se vê">' + esc(f.caption) + '</span></figcaption></figure>').join('') + '</div></section>').join('')
    : '<div class="empty"><h3 class="h3">Ainda sem quadros desenhados.</h3><p>Juntas um quadro por plano. Sem imagem fica um desenho com o enquadramento; com imagem usas uma foto tua.</p></div>';
  return form + own + vfBlock;
}
function groupBy(list, key){
  const out = [];
  list.forEach(x => { const k = key(x); let g = out.find(o => o[0] === k); if (!g) { g = [k, []]; out.push(g); } g[1].push(x); });
  return out.sort((a, b) => (+a[0] || 999) - (+b[0] || 999));
}

/* janela: juntar ferramenta */
function modalView(){
  const p0 = cur();
  if (state.ui.aiOpen) return aiModal();
  if (p0 && state.ui.bimport) return budgetImportModal();
  if (p0 && state.ui.claudeOpen) return claudeModal(p0);
  if (p0 && state.ui.propAsk && !state.ui.mapOpen) {
    return '<div class="modal enter"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="pa-t"><h2 class="h2" id="pa-t">Separar os adereços do guião?</h2>' +
      '<p class="lede">A app lê o guião e cria a lista de adereços, com as cenas e as personagens que interagem com cada um.</p>' +
      '<div class="ask-opts"><button class="type" data-action="prop-ask-claude"><b>Analisar no Claude</b><span>A mais completa: percebe quem faz o quê com cada objeto. Grátis, com a tua conta do Claude; a app guia-te em três passos.</span></button>' +
      '<button class="type" data-action="prop-ask-rules"><b>Rápida, sem IA</b><span>Imediata e grátis. Procura objetos comuns e verbos de ação; pode falhar ou apanhar palavras a mais.</span></button></div>' +
      '<div class="row-actions"><button class="btn ghost" data-action="prop-ask-later">Mais tarde</button></div></div></div>';
  }
  if (p0 && state.ui.mapOpen) {
    const pg = openMap(p0); if (!pg) { state.ui.mapOpen = null; return ''; }
    const [kind] = pg.key.split(':'), idv = pg.key.slice(kind.length + 1), where = kind === 'scene' ? 'Cena ' + idv : 'Décor · ' + idv;
    return '<div class="modal' + (state.ui.popEnter ? ' enter' : '') + '" data-action="pop-close"><div class="dialog dialog-wide" role="dialog" aria-modal="true" aria-label="Mapa de luz"><div class="row-actions" style="justify-content:space-between;align-items:flex-start"><div class="page-title"><span class="lbl">Mapa de luz · ' + esc(where) + '</span><h2 class="h2" contenteditable="true" data-map-title spellcheck="false">' + esc(pg.data.title) + '</h2></div>' +
      '<span class="row-actions"><button class="btn ghost small" data-action="emap-del">Deitar fora</button><button class="x" data-action="pop-close" aria-label="Fechar">×</button></span></div>' + mapView(p0, pg) + '</div></div>';
  }
  if (p0 && state.ui.lhOpen) {
    const sc = getScript(p0), r = state.ui.lhOpen, s = sc && sc.scenes.find(x => 'scene:' + (x.number || x.n) === r.key);
    if (!s) { state.ui.lhOpen = null; return ''; }
    return '<div class="modal' + (state.ui.popEnter ? ' enter' : '') + '" data-action="pop-close"><div class="dialog dialog-wide" role="dialog" aria-modal="true" aria-label="Mapa de luz do Lighthouse"><div class="row-actions" style="justify-content:space-between"><div class="page-title"><span class="lbl">Do Lighthouse' + (r.hl ? ' · câmara ' + esc(r.hl) : '') + '</span><h2 class="h2 slug">' + esc((s.number || s.n) + '. ' + s.heading) + '</h2></div><button class="x" data-action="pop-close" aria-label="Fechar">×</button></div><div class="lh-pop">' + lhSVG(s.lhItems, r.hl) + '</div></div></div>';
  }
  const m = state.ui.modal, p = cur();
  if (!m || !p) return '';
  const tpls = TEMPLATES[m.type] || [], needsScript = !getScript(p) && ['planos','aderecos','elenco','cenas','cena'].indexOf(m.tpl) >= 0;
  return '<div class="modal enter" data-action="modal-scrim"><form class="dialog" data-form="add-tool" role="dialog" aria-modal="true" aria-labelledby="dlg-t" novalidate>' +
    '<div class="row-actions" style="justify-content:space-between"><h2 class="h2" id="dlg-t">Juntar ferramenta</h2><button class="x" type="button" data-action="modal-close" aria-label="Fechar">×</button></div>' +
    '<div class="types" role="radiogroup" aria-label="Tipo de ferramenta">' + Object.keys(TOOLS).filter(k => k !== 'storyboard' && k !== 'map').map(k => '<button type="button" class="type" role="radio" aria-checked="' + (m.type === k) + '" data-action="pick-type" data-type="' + k + '"><b>' + IC[k] + TOOLS[k].label + '</b><span>' + TOOLS[k].desc + '</span></button>').join('') +
    '<div class="type soon" aria-disabled="true"><b>Mais</b><span>Folhas de serviço, orçamento e o que decidires a seguir. Ainda não estão aqui.</span></div></div>' +
    '<div class="dialog-grid"><label class="field"><span>Nome</span><input class="input" id="tool-name" autocomplete="off" value="' + esc(m.name != null ? m.name : TOOLS[m.type].label) + '"></label>' +
    '<label class="field"><span>Grupo</span><select class="input" id="tool-group"><option value="">Sem grupo</option>' + p.groups.map(g => '<option value="' + g.id + '"' + (g.id === m.group ? ' selected' : '') + '>' + esc(g.name) + '</option>').join('') + '</select></label></div>' +
    (tpls.length > 1 ? '<label class="field"><span>Começar com</span><select class="input" id="tool-tpl" data-tool-tpl>' + tpls.map(([k, l]) => '<option value="' + k + '"' + (k === m.tpl ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>' : '') +
    (needsScript ? '<p class="note">Este projeto ainda não tem guião. A ferramenta é criada vazia; importas o guião e crias outra se quiseres partir dele.</p>' : '') +
    '<div class="row-actions"><button class="btn primary" type="submit">Criar</button><button class="btn ghost" type="button" data-action="modal-close">Cancelar</button></div></form></div>';
}

/* ---------- render ---------- */
function render(){
  const bs = $('#board-scroll'), keep = bs ? [bs.scrollLeft, bs.scrollTop] : null;
  if (!state.user) { $('#app').innerHTML = loginView(); $('#modal').innerHTML = ''; return; }
  if (state.ui.view === 'project' && !cur() && !state.loading) state.ui.view = 'home';
  $('#app').innerHTML = state.ui.view === 'project' && cur() ? projectView(cur()) : homeView();
  $('#modal').innerHTML = (state.ui.shotOpen && state.ui.view === 'project' && cur() ? shotPage(cur()) : '') + modalView(); state.ui.popEnter = false; document.body.classList.toggle('noscroll', !!state.ui.shotOpen);
  const nb = $('#board-scroll');
  if (nb) { sizeBoard(); if (keep) { nb.scrollLeft = keep[0]; nb.scrollTop = keep[1]; } }
  document.body.classList.toggle('bfs-on', !!$('#bfs'));
  bindDrop(); hydrate().catch(() => {}); saveUi();
}
let mapRaf = 0;
function renderMap(){ const p = cur(), pg = p && curPage(p), box = $('#map-box'); if (box && pg && pg.type === 'map') box.innerHTML = mapSVG(pg.data, state.ui.mapSel); }
function go(){ render(); window.scrollTo(0, 0); }
function openProject(id){
  if (state.ui.pid !== id) { const pp = state.projects.find(x => x.id === id); state.ui.ent = null; state.ui.page = pp && pp.kind && pp.kind !== 'fiction' ? 'doc:' + KT(pp).docs[0][0] : 'script'; state.ui.cat = 'cenas'; state.ui.sceneId = null; state.ui.mapSel = null; }
  state.ui.pid = id; state.ui.view = 'project'; state.ui.newOpen = false; state.ui.datesOpen = false;
  const p = cur(); if (p && !p.hasHub) persist(p);
  go();
}
function segAdd(p, u, kind, name){
  if (kind === 'place') { u.places = unitPlaces(u).slice(); if (u.places.indexOf(name) < 0) u.places.push(name); u.place = u.places[0] || ''; return; }
  p.script.roles = p.script.roles || {};
  if (kind === 'extra') p.script.roles[name] = 'extra'; else if (p.script.roles[name] === 'extra' && !p.script.scenes.some(x => x !== u && x.chars.indexOf(name) >= 0)) delete p.script.roles[name];
  if (u.chars.indexOf(name) < 0) u.chars.push(name);
}
function startRename(id){ state.ui.renaming = id; render(); const i = $('#rename-in'); if (i) { i.focus(); i.select(); } }
function finishRename(save){
  const id = state.ui.renaming; if (!id) return;
  const p = cur(), pg = p && p.pages.find(x => x.id === id), i = $('#rename-in'), v = i ? i.value.trim() : '';
  state.ui.renaming = null;
  if (save && pg && v && v !== pg.title) { pg.title = v; render(); persist(p); toast('Nome mudado para ' + v + '.'); } else render();
}
document.addEventListener('dblclick', e => {
  const b = e.target.closest && e.target.closest('.nav[data-action="page"]'); if (!b) return;
  e.preventDefault(); startRename(b.dataset.id);
});
function openPage(id){ state.ui.shotOpen = null; state.ui.ent = null; state.ui.page = id; state.ui.mapSel = null; state.ui.reimport = false; state.ui.sceneId = null; go(); }

/* ---------- avisos ---------- */
let toastTimer = null;
function toast(msg, undo){
  const t = $('#toast');
  t.innerHTML = '<span>' + esc(msg) + '</span>' + (undo ? '<button class="undo" type="button">Desfazer</button>' : '');
  t.classList.toggle('has-undo', !!undo); t.hidden = false; t.classList.remove('in'); void t.offsetWidth; t.classList.add('in');
  if (undo) t.querySelector('.undo').addEventListener('click', () => { undo(); t.hidden = true; });
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6500);
}
function withUndo(msg, fn){
  const p = cur(), snap = JSON.stringify({props:p.props, propsRemoved:p.propsRemoved, groups:p.groups, pages:p.pages, entities:p.entities, script:p.script, tasks:p.tasks, budget:p.budget, page:state.ui.page, ent:state.ui.ent});
  fn(); render(); persist(p);
  toast(msg, () => { const s = JSON.parse(snap); p.groups = s.groups; p.pages = s.pages; p.entities = s.entities; p.script = s.script; p.tasks = s.tasks; p.budget = s.budget; p.props = s.props; p.propsRemoved = s.propsRemoved; state.ui.page = s.page; state.ui.ent = s.ent; render(); persist(p); });
}
function formMsg(form, text){ const m = form.querySelector('.form-msg') || (form.nextElementSibling && form.nextElementSibling.classList.contains('form-msg') ? form.nextElementSibling : null); if (m) m.textContent = text; }

/* ---------- guiões e tratamentos guardados (bucket scripts + hub_documents) ---------- */
const docsOf = (p, page) => (p.docs || []).filter(d => d.page === page).sort((a, b) => b.version - a.version);
async function saveDoc(p, page, file, text, fileName){
  const id = crypto.randomUUID(), list = docsOf(p, page), version = (list[0] ? list[0].version : 0) + 1;
  let path = null;
  if (file) {
    const ext = (file.name.match(/\.[A-Za-z0-9]{1,8}$/) || [''])[0].toLowerCase();
    path = state.user.id + '/' + p.id + '/docs/' + id + ext;
    const up = await sb.storage.from('scripts').upload(path, file, {contentType:file.type || 'application/octet-stream', upsert:false});
    if (up.error) throw up.error;
  }
  const kind = page === 'script' ? 'script' : page === 'doc:treatment' ? 'treatment' : 'other';
  const row = {id, project_id:p.id, kind, page, file_name:fileName || (file && file.name) || 'texto colado', file_path:path, mime:file ? (file.type || null) : 'text/plain', text:text || null, version, is_current:true};
  let r = await sb.from('hub_documents').update({is_current:false}).eq('project_id', p.id).eq('page', page).eq('is_current', true);
  if (r.error) throw r.error;
  r = await sb.from('hub_documents').insert(row);
  if (r.error) throw r.error;
  list.forEach(d => { d.is_current = false; });
  const meta = Object.assign({}, row, {created_at:new Date().toISOString()}); delete meta.text;
  p.docs = (p.docs || []).concat([meta]);
  return meta;
}
async function setCurrentDoc(p, d){
  let r = await sb.from('hub_documents').update({is_current:false}).eq('project_id', p.id).eq('page', d.page).eq('is_current', true);
  if (!r.error) r = await sb.from('hub_documents').update({is_current:true}).eq('id', d.id);
  if (r.error) throw r.error;
  docsOf(p, d.page).forEach(x => { x.is_current = x.id === d.id; });
}
async function openDoc(d){
  if (!d.file_path) { toast('Esta versão foi colada como texto; não há ficheiro original.'); return; }
  const w = window.open('', '_blank');
  const r = await sb.storage.from('scripts').createSignedUrl(d.file_path, 600, {download:d.file_name});
  if (r.error || !r.data) { if (w) w.close(); toast('Não consegui abrir o ficheiro. Volta a tentar.'); return; }
  if (w) w.location = r.data.signedUrl; else location.href = r.data.signedUrl;
}
function docVersions(p, page, title){
  const list = docsOf(p, page);
  if (!list.length) return '';
  const when = d => { const t = new Date(d.created_at); return t.getDate() + ' ' + MES[t.getMonth()] + ' ' + t.getFullYear(); };
  return '<details class="doc-versions"' + (state.ui.docsOpen === page ? ' open' : '') + '><summary><span class="lbl">' + esc(title) + '</span> <span class="dim num">' + pl(list.length, 'versão guardada', 'versões guardadas') + '</span></summary><ul class="doc-list">' +
    list.map(d => '<li class="' + (d.is_current ? 'is-current' : '') + '"><span class="num code">v' + d.version + '</span><span class="doc-name">' + esc(d.file_name) + '</span><span class="dim num">' + when(d) + '</span>' +
      (d.is_current ? '<span class="chip">Em uso</span>' : (page === 'script' ? '<button class="btn ghost small" data-action="doc-use" data-id="' + d.id + '">Usar esta versão</button>' : '<button class="btn ghost small" data-action="doc-use" data-id="' + d.id + '">Marcar como atual</button>')) +
      (d.file_path ? '<button class="btn ghost small" data-action="doc-open" data-id="' + d.id + '">Abrir original</button>' : '') + '</li>').join('') + '</ul></details>';
}
function docFileText(file){
  if (/\.pdf$/i.test(file.name) || file.type === 'application/pdf') return pdfToText(file).catch(() => '');
  if (/\.(txt|fountain|md|fdx)$/i.test(file.name) || /^text\//.test(file.type)) return file.text().then(t => /\.fdx$/i.test(file.name) ? fdxToText(t) : t).catch(() => '');
  return Promise.resolve('');
}

/* ---------- importar guião ---------- */
async function importScript(text, fileName, opt){
  opt = opt || {};
  const p = cur(), parsed = parseScript(text, fileName);
  if (!parsed.scenes.length) { toast('Não encontrei cabeçalhos de cena. Cada cena tem de começar por INT. ou EXT.'); return false; }
  parsed.cast = (p.script && p.script.cast) || {};
  const store = Object.assign({}, parsed); store.chars = undefined; store.places = undefined;
  let note = '';
  if (p.lh.length && parsed.scenes.length !== p.lh.length) note = ' O guião tem ' + pl(parsed.scenes.length, 'cena', 'cenas') + ' e o projeto tinha ' + p.lh.length + '; as cenas com o mesmo número ficam ligadas.';
  if (!opt.sample) {
    if (opt.doc) { store.docId = opt.doc.id; store.docVersion = opt.doc.version; }
    else {
      try { const d = await saveDoc(p, 'script', opt.file || null, text, fileName); store.docId = d.id; store.docVersion = d.version; note += ' Guardado na base de dados como versão ' + d.version + '.'; }
      catch (e) { note += ' Atenção: o ficheiro não ficou guardado na base de dados (' + (navigator.onLine ? 'erro no servidor' : 'sem internet') + '). Volta a importá-lo.'; }
    }
  }
  p.script = JSON.parse(JSON.stringify(store));
  if (!p.lh.length) {
    const rows = parsed.scenes.map((s, i) => ({id:hex12(), project_id:p.id, position:i, number:String(s.n), heading:s.heading, characters:s.chars}));
    const r = await sb.from('scenes').insert(rows).select('id,project_id,number,heading,characters,items,position');
    if (!r.error) { p.lh = r.data || []; note = ' As cenas já estão também no Lighthouse.'; }
    if (!p.appChars.length) {
      const chars = parsed.chars.map((c, i) => ({name:c.name, color:(0xff000000 | CHAR_COLOURS[i % CHAR_COLOURS.length]) | 0}));
      const r2 = await sb.from('projects').update({characters:chars, script_name:fileName || 'texto colado'}).eq('id', p.id);
      if (!r2.error) { p.appChars = chars; p.scriptName = fileName; }
    }
  }
  state.ui.reimport = false; state.ui.cat = 'cenas'; state.ui.sceneId = null; state.ui.propAsk = true; render(); persist(p);
  toast('Guião lido: ' + pl(parsed.scenes.length, 'cena', 'cenas') + ', ' + pl(parsed.chars.length, 'personagem', 'personagens') + ', ' + pl(parsed.places.length, 'décor', 'décors') + '.' + note);
  return true;
}
function readScriptFile(file){
  if (!file) return;
  if (/\.pdf$/i.test(file.name)) { toast('A ler o PDF…'); pdfToText(file).then(txt => importScript(txt, file.name, {file})).catch(() => toast('Este PDF não abriu. Se for uma digitalização (imagem), não tem texto para ler.')); return; }
  const r = new FileReader();
  r.onload = () => { const txt = String(r.result); importScript(/\.fdx$/i.test(file.name) || /<FinalDraft/i.test(txt) ? fdxToText(txt) : txt, file.name, {file}); };
  r.onerror = () => toast('Este ficheiro não abriu.');
  r.readAsText(file);
}
function bindDrop(){
  const d = $('#drop'); if (!d) return;
  d.addEventListener('dragover', e => { e.preventDefault(); d.classList.add('over'); });
  d.addEventListener('dragleave', () => d.classList.remove('over'));
  d.addEventListener('drop', e => { e.preventDefault(); d.classList.remove('over'); readScriptFile(e.dataTransfer.files && e.dataTransfer.files[0]); });
}

/* ---------- eventos ---------- */
let imageTarget = null;
const curEnt = () => { const p = cur(); if (!p) return null; if (state.ui.shotOpen) { const F = findShot(p, state.ui.shotOpen); if (F) { ensureShotBlocks(F.sh); return F.sh; } } const k = state.ui.ent || (String(state.ui.page).indexOf('doc:') === 0 ? state.ui.page : null); return k ? p.entities[k] : null; };
function pickImages(multi){ const f = $('#file-img'); if (multi) f.setAttribute('multiple', ''); else f.removeAttribute('multiple'); f.click(); }
document.addEventListener('click', e => {
  const a = e.target.closest('[data-action]');
  if (state.ui.meOpen && !e.target.closest('.me-wrap')) { state.ui.meOpen = false; render(); }
  if (state.ui.bfsNav && !e.target.closest('.bfs-nav') && !e.target.closest('.bfs-logo')) { state.ui.bfsNav = false; const b = $('#bfs'); if (b) b.classList.remove('nav-open'); }
  if (!a) return;
  if (a.dataset.action === 'modal-scrim' && e.target !== a) return;
  const act = a.dataset.action, id = a.dataset.id, p = cur(), pg = p && curPage(p);
  switch (act) {
    case 'me': state.ui.meOpen = !state.ui.meOpen; render(); break;
    case 'logout': sb.auth.signOut(); break;
    case 'avatar-pick': imageTarget = 'avatar'; pickImages(false); break;
    case 'avatar-del': sb.auth.updateUser({data:{avatar_path:null}}).then(r => { if (r.error) { toast('Não consegui tirar a foto. Volta a tentar.'); return; } state.me.avatar = ''; state.ui.meOpen = false; render(); toast('Foto de perfil tirada.'); }); break;
    case 'reload': loadAll(); break;
    case 'home': state.ui.shotOpen = null; state.ui.view = 'home'; state.ui.newOpen = false; go(); break;
    case 'open': openProject(id); break;
    case 'new-open': state.ui.newOpen = true; render(); { const n = $('#np-name'); if (n) n.focus(); } break;
    case 'new-close': state.ui.newOpen = false; render(); break;
    case 'dates': state.ui.datesOpen = !state.ui.datesOpen; render(); break;
    case 'page': if (state.ui.page === id) { startRename(id); break; } openPage(id); break;
    case 'toggle-group': state.ui.collapsed = state.ui.collapsed || {}; state.ui.collapsed[id] = !state.ui.collapsed[id]; render(); break;
    case 'group-del': { const g = p.groups.find(x => x.id === id); if (!g) break; const n = p.pages.filter(x => x.group === id).length;
      withUndo('Grupo ' + g.name + ' tirado' + (n ? '. ' + (n === 1 ? 'A página ficou' : 'As ' + n + ' páginas ficaram') + ' sem grupo.' : '.'), () => { p.groups = p.groups.filter(x => x.id !== id); p.pages.forEach(x => { if (x.group === id) x.group = null; }); }); break; }
    case 'add-tool': state.ui.modal = {type:'board', group:a.dataset.group || (pg ? pg.group : null), tpl:'vazio'}; render(); { const n = $('#tool-name'); if (n) n.focus(); } break;
    case 'pick-type': { const m = state.ui.modal, nm = $('#tool-name').value; m.name = nm === TOOLS[m.type].label ? null : nm; m.group = $('#tool-group').value || null; m.type = a.dataset.type; m.tpl = TEMPLATES[m.type][0][0]; render(); break; }
    case 'modal-close': case 'modal-scrim': state.ui.modal = null; render(); break;
    case 'page-del': withUndo(pg.title + ' deitado fora.', () => { p.pages = p.pages.filter(x => x.id !== pg.id); state.ui.page = 'script'; }); break;
    case 'pick-script': $('#file-script').click(); break;
    case 'sample-script': importScript(SAMPLE, 'exemplo.fountain', {sample:true}); break;
    case 'doc-open': { const d = (p.docs || []).find(x => x.id === a.dataset.id); if (d) openDoc(d); break; }
    case 'doc-use': { const d = (p.docs || []).find(x => x.id === a.dataset.id); if (!d) break;
      state.ui.docsOpen = d.page;
      if (d.page !== 'script') { setCurrentDoc(p, d).then(() => { render(); toast('Versão ' + d.version + ' marcada como atual.'); }).catch(() => toast('Não consegui mudar a versão. Volta a tentar.')); break; }
      toast('A abrir a versão ' + d.version + '…');
      sb.from('hub_documents').select('text').eq('id', d.id).single().then(async r => {
        if (r.error || !r.data || !r.data.text) { toast('Esta versão não tem texto guardado.'); return; }
        try { await setCurrentDoc(p, d); } catch (e) { toast('Não consegui mudar a versão. Volta a tentar.'); return; }
        importScript(r.data.text, d.file_name, {doc:d});
      }); break; }
    case 'doc-attach': docTarget = a.dataset.page; $('#file-doc').click(); break;
    case 'reimport': state.ui.reimport = true; render(); break;
    case 'reimport-cancel': state.ui.reimport = false; render(); break;
    case 'cat': state.ui.cat = a.dataset.cat; state.ui.sceneId = null; render(); break;
    case 'ent': if (state.ui.page !== 'script') state.ui.page = 'script'; state.ui.reimport = false; state.ui.ent = a.dataset.ent; { const k = a.dataset.ent.split(':')[0]; state.ui.cat = k === 'scene' ? 'cenas' : k === 'char' ? 'personagens' : k === 'prop' ? 'aderecos' : 'decors'; } go(); break;
    case 'ent-back': state.ui.ent = null; go(); break;
    case 'props-ai': runPropAnalysis(p, 'ai'); break;
    case 'props-claude': state.ui.claudeOpen = {part:0}; render(); break;
    case 'prop-ask-claude': state.ui.propAsk = false; state.ui.cat = 'aderecos'; state.ui.ent = null; state.ui.claudeOpen = {part:0}; render(); break;
    case 'claude-part': Object.assign(state.ui.claudeOpen, {part:+a.dataset.k, showText:false, msg:''}); render(); break;
    case 'claude-open': { const m = state.ui.claudeOpen, i = m.part || 0; m.st = m.st || {}; m.st[i] = Object.assign({}, m.st[i], {opened:true, copied:true}); setTimeout(render, 50); break; }
    case 'claude-paste': { const m = state.ui.claudeOpen;
      const manual = () => { m.msg = 'O browser não me deixou ler o que copiaste. Clica na caixa e cola com Ctrl + V.'; render(); const t = $('#cl-reply'); if (t) t.focus(); };
      if (navigator.clipboard && navigator.clipboard.readText) navigator.clipboard.readText().then(t => { if (t && t.trim()) claudeRead(p, t); else { m.msg = 'Não há nada copiado. No Claude, carrega em Copiar na resposta e volta aqui.'; render(); } }, manual); else manual();
      break; }
    case 'claude-copy': { const m = state.ui.claudeOpen, sc = getScript(p), parts = claudeParts(p, sc), i = Math.min(m.part || 0, parts.length - 1), txt = claudePrompt(p, sc, parts[i], i, parts.length);
      m.st = m.st || {}; const ok = () => { m.st[i] = Object.assign({}, m.st[i], {copied:true}); m.msg = ''; render(); };
      const fail = () => { m.showText = true; m.st[i] = Object.assign({}, m.st[i], {copied:true}); render(); const t = document.querySelector('.cl-src'); if (t) { t.focus(); t.select(); } };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fail); else fail();
      break; }
    case 'claude-scrim': if (e.target !== a) break; /* falls through */
    case 'claude-close': state.ui.claudeOpen = null; render(); break;
    case 'claude-done': state.ui.claudeOpen = null; state.ui.cat = 'aderecos'; state.ui.ent = null; render(); break;
    case 'props-rules': runPropAnalysis(p, 'rules'); break;
    case 'prop-ask-ai': state.ui.propAsk = false; state.ui.cat = 'aderecos'; state.ui.ent = null; render(); runPropAnalysis(p, 'ai'); break;
    case 'prop-ask-rules': state.ui.propAsk = false; state.ui.cat = 'aderecos'; state.ui.ent = null; render(); runPropAnalysis(p, 'rules'); break;
    case 'prop-ask-later': state.ui.propAsk = false; render(); break;
    case 'ai-open': state.ui.meOpen = false; openAI(null); break;
    case 'ai-scrim': if (e.target !== a) break; /* falls through */
    case 'ai-close': state.ui.aiOpen = null; render(); break;
    case 'ai-change': state.ui.aiOpen.change = true; state.ui.aiOpen.err = null; render(); { const i = document.querySelector('[data-form=ai-key] input'); if (i) i.focus(); } break;
    case 'ai-back': state.ui.aiOpen.change = false; render(); break;
    case 'ai-continue': { const after = state.ui.aiOpen.after; state.ui.aiOpen = null; render(); if (after === 'props' && p) { state.ui.page = 'script'; state.ui.cat = 'aderecos'; state.ui.ent = null; render(); runPropAnalysis(p, 'ai'); } break; }
    case 'ai-remove': aiCall({action:'remove'}).then(() => { state.ai = null; return aiStatus(true); }).then(() => { state.ui.aiOpen = null; render(); toast('IA desligada. A chave foi apagada do servidor.'); }).catch(() => toast('Não consegui desligar. Volta a tentar.')); break;
    case 'prop-tab': state.ui.propTab = a.dataset.tab; render(); break;
    case 'prop-del': { const pr = p.props.find(x => x.id === id); withUndo(pr.name + ' saiu dos adereços. Não volta numa nova análise.', () => { p.props = p.props.filter(x => x.id !== id); p.propsRemoved = (p.propsRemoved || []).concat(normName(pr.name)); state.ui.ent = null; p.tasks = (p.tasks || []).filter(t => t.target !== 'prop:' + id); }); break; }
    case 'prop-unlink': { const pr = p.props.find(x => x.id === id), f2 = a.dataset.field, nm = a.dataset.name; const addK = f2 === 'chars' ? 'addChars' : 'addPlaces', noK = f2 === 'chars' ? 'noChars' : 'noPlaces'; pr[addK] = (pr[addK] || []).filter(x => x !== nm); if ((pr[noK] || []).indexOf(nm) < 0) pr[noK] = (pr[noK] || []).concat(nm); render(); persist(p); break; }
    case 'prop-app-del': { const pr = p.props.find(x => x.id === id); withUndo('Referência tirada.', () => { pr.appear.splice(+a.dataset.i, 1); }); break; }
    case 'blk-link-del': { const b = curEnt().blocks.find(x => x.id === id); b.links.splice(+a.dataset.i, 1); render(); persist(p); break; }
    case 'shot-open': if (!a.dataset.shot) break; state.ui.shotOpen = a.dataset.shot; state.ui.picIdx = 0; state.ui.mapOpen = null; render(); { const sp = $('.shot-page'); if (sp) sp.scrollTop = 0; } break;
    case 'shot-close': state.ui.shotOpen = null; render(); break;
    case 'pic': state.ui.picIdx = +a.dataset.i; render(); break;
    case 'shot-map-add': {
      const F = findShot(p, a.dataset.shot), sc2 = getScript(p), num = F.key.slice(6), s2 = sc2.scenes.find(x => String(x.number || x.n) === num);
      const items = [{id:uid(), kind:'cam', x:520, y:330, label:F.sh.code, focal:parseInt(F.sh.lens, 10) || 35, sensor:'24.9'}];
      (s2 ? s2.chars : []).forEach((c, k2) => items.push({id:uid(), kind:'actor', x:240 + k2 * 70, y:200, label:c}));
      items.push({id:uid(), kind:'light', x:130, y:150, label:'Key', type:'Fresnel', cct:5600, intensity:80, spread:40});
      F.E.maps = F.E.maps || [];
      const mp = {id:uid() + uid(), title:'Mapa de luz ' + F.sh.code, scene:s2 ? s2.n : null, shot:F.sh.id, scale:40, items};
      F.E.maps.push(mp); state.ui.popEnter = true; state.ui.mapOpen = {key:F.key, id:mp.id}; state.ui.mapSel = null; persist(p); render(); break;
    }
    case 'map-dup': { const it = pg.data.items.find(i => i.id === state.ui.mapSel); if (!it) break; const c2 = Object.assign({}, it, {id:uid(), x:it.x + 24, y:it.y + 24}); pg.data.items.push(c2); state.ui.mapSel = c2.id; render(); persist(p); break; }
    case 'map-export': exportMap(pg.data.title); break;
    case 'home-tab': state.ui.homeTab = a.dataset.tab; state.ui.cardMenu = null; render(); break;
    case 'card-menu': state.ui.cardMenu = state.ui.cardMenu === id ? null : id; render(); break;
    case 'proj-status': { const pp = state.projects.find(x => x.id === id), was = pp.status || 'active'; pp.status = a.dataset.st; state.ui.cardMenu = null; render(); persist(pp);
      const L = {active:'em curso', done:'finalizado', archived:'arquivado'}; toast(pp.name + ' passou a ' + L[pp.status] + '.', () => { pp.status = was; render(); persist(pp); }); break; }
    case 'unit-del': { const n = a.dataset.unit; withUndo(KT(p).unit + ' ' + n + ' saiu da lista.', () => { p.script.scenes = p.script.scenes.filter(x => x.number !== n); state.ui.ent = null; p.tasks = (p.tasks || []).filter(t => t.target !== 'scene:' + n); }); break; }
    case 'seg-del': { const u = p.script.scenes.find(x => x.number === a.dataset.unit); if (!u) break; const nm = a.dataset.name;
      if (a.dataset.kind === 'place') { u.places = unitPlaces(u).filter(x => x !== nm); u.place = u.places[0] || ''; } else u.chars = u.chars.filter(c => c !== nm);
      render(); persist(p); break; }
    case 'seg-auto': { ensureManual(p); const parts = ['Intro','Verso 1','Refrão','Verso 2','Refrão 2','Ponte','Refrão final','Outro'];
      parts.forEach(name => { const seq = (p.script.seq || 0) + 1; p.script.seq = seq; p.script.scenes.push({id:uid(), n:seq, number:String(seq), heading:name, place:'', places:[], chars:[], start:'', end:'', ie:'—', time:'', body:[], len:0});
        sb.from('scenes').insert({id:hex12(), project_id:p.id, position:p.script.scenes.length - 1, number:String(seq), heading:name, characters:[]}).select('id,project_id,number,heading,characters,items,position').then(r => { if (!r.error && r.data) p.lh = p.lh.concat(r.data); }); });
      render(); persist(p); toast('Música partida em ' + parts.length + ' secções. Muda os nomes e os tempos à vontade.'); break; }
    case 'unit-person-del': { const u = p.script.scenes.find(x => x.number === a.dataset.unit); u.chars = u.chars.filter(c => c !== a.dataset.name); render(); persist(p); break; }
    case 'task-status': { const t = p.tasks.find(x => x.id === id); t.status = {todo:'doing', doing:'done', done:'todo'}[t.status] || 'todo'; if (t.status === 'done') t.doneAt = today(); else delete t.doneAt; render(); persist(p); if (t.status === 'done') toast('Tarefa feita. Continua visível em "tarefas feitas".'); break; }
    case 'done-toggle': state.ui.doneOpen = state.ui.doneOpen || {}; state.ui.doneOpen[a.dataset.key] = !state.ui.doneOpen[a.dataset.key]; render(); break;
    case 'noop': break;
    case 'brow-add': { const b = getBudget(p); b.rows.push({id:uid(), kind:'item', cells:{}}); render(); persist(p); const ins = document.querySelectorAll('tr.bitem'); const last = ins[ins.length - 1]; if (last) last.querySelector('input').focus(); break; }
    case 'bsec-add': { const b = getBudget(p); b.rows.push({id:uid(), kind:'section', title:''}); render(); persist(p); const ins = document.querySelectorAll('.bsec-in'); if (ins.length) ins[ins.length - 1].focus(); break; }
    case 'brow-del': withUndo('Linha tirada do orçamento.', () => { const b = getBudget(p); b.rows = b.rows.filter(r => r.id !== id); }); break;
    case 'brow-up': case 'brow-down': { const b = getBudget(p), i = b.rows.findIndex(r => r.id === id), j = act === 'brow-up' ? i - 1 : i + 1; if (i < 0 || j < 0 || j >= b.rows.length) break; const t = b.rows[i]; b.rows[i] = b.rows[j]; b.rows[j] = t; render(); persist(p); break; }
    case 'bcol-add': { const b = getBudget(p); b.cols.push({id:uid(), name:'Coluna ' + (b.cols.length + 1), type:'text'}); render(); persist(p); const ins = document.querySelectorAll('.bth-in'); if (ins.length) { ins[ins.length - 1].focus(); ins[ins.length - 1].select(); } break; }
    case 'bcol-del': { const b = getBudget(p), c = b.cols.find(x => x.id === id); withUndo('Coluna ' + (c ? c.name : '') + ' tirada.', () => { b.cols = b.cols.filter(x => x.id !== id); }); break; }
    case 'bcol-left': { const b = getBudget(p), i = b.cols.findIndex(c => c.id === id); if (i > 0) { const t = b.cols[i]; b.cols[i] = b.cols[i - 1]; b.cols[i - 1] = t; render(); persist(p); } break; }
    case 'budget-import': $('#file-budget').click(); break;
    case 'budget-export': exportBudget(getBudget(p), p.name).catch(() => toast('Não consegui criar o ficheiro Excel. Volta a tentar.')); break;
    case 'bimp-close': state.ui.bimport = null; render(); break;
    case 'bimp-go': budgetApplyImport(p); break;
    case 'prop-stf': state.ui.propSt = a.dataset.st || ''; if (state.ui.propSt && state.ui.propSt === a.dataset.st && a.getAttribute('aria-pressed') === 'true') state.ui.propSt = ''; render(); break;
    case 'grp-color': state.ui.colorFor = state.ui.colorFor === id ? null : id; render(); break;
    case 'grp-set-color': { const g = p.groups.find(x => x.id === id); if (g) { g.color = a.dataset.c; state.ui.colorFor = null; render(); persist(p); } break; }
    case 'task-del': if (a.dataset.scope === 'task') { const t = p.tasks.find(x => x.id === id); withUndo('Tarefa tirada.', () => { p.tasks = p.tasks.filter(x => x.id !== id); }); break; }
      withUndo('Tarefa tirada.', () => { pg.data.tasks = pg.data.tasks.filter(t => t.id !== id); }); break;
    case 'task-for': { const sel = $('[data-form="todo-add"] [name="target"]'), ti = $('[data-form="todo-add"] [name="title"]'); if (sel) { sel.value = a.dataset.target; } if (ti) { ti.scrollIntoView({block:'center'}); ti.focus(); } break; }
    case 'tf-clear': state.ui.tf = {}; render(); break;
    case 'emap-add': {
      const sc2 = getScript(p), key = a.dataset.ent, r2 = ensureEntity(p, sc2, key); if (!r2) break;
      const [kind] = key.split(':'), idv = key.slice(kind.length + 1);
      r2.e.maps = r2.e.maps || [];
      const items = [{id:uid(), kind:'cam', x:520, y:330, label:'A'}];
      if (kind === 'scene') { r2.obj.chars.forEach((c, i) => items.push({id:uid(), kind:'actor', x:240 + i * 70, y:200, label:c})); items.push({id:uid(), kind:'light', x:130, y:150, label:'Key', fix:'', set:'', spread:50}); }
      const m = {id:uid() + uid(), title:'Mapa de luz ' + (r2.e.maps.length + 1), scene:kind === 'scene' ? r2.obj.n : null, place:kind === 'place' ? idv : null, items};
      r2.e.maps.push(m); state.ui.popEnter = true; state.ui.mapOpen = {key, id:m.id}; state.ui.mapSel = null; persist(p); render(); break;
    }
    case 'emap-open': state.ui.popEnter = true; state.ui.mapOpen = {key:a.dataset.ent, id}; state.ui.mapSel = null; render(); break;
    case 'lh-open': state.ui.popEnter = true; state.ui.lhOpen = {key:a.dataset.ent, hl:a.dataset.hl || ''}; render(); break;
    case 'pop-close': if (a.classList.contains('modal') && e.target !== a) break; state.ui.mapOpen = null; state.ui.lhOpen = null; state.ui.mapSel = null; render(); break;
    case 'emap-del': { const r3 = state.ui.mapOpen, E3 = p.entities[r3.key], m3 = E3.maps.find(x => x.id === r3.id);
      withUndo(m3.title + ' deitado fora.', () => { E3.maps = E3.maps.filter(x => x.id !== r3.id); state.ui.mapOpen = null; }); break; }
    case 'cover': state.ui.coverFor = id; imageTarget = 'cover'; pickImages(false); break;
    case 'cover-reset': { const pc2 = state.projects.find(x => x.id === id); pc2.cover = null; render(); persist(pc2); toast('A capa voltou a ser automática.'); break; }
    case 'gpage': state.ui.shotOpen = null; state.ui.page = id; if (a.dataset.cat) state.ui.cat = a.dataset.cat; state.ui.ent = null; state.ui.reimport = false; state.ui.modal = null; go(); break;
    case 'sb-add': { const sc2 = getScript(p), r2 = ensureEntity(p, sc2, a.dataset.ent), num = a.dataset.ent.slice(6); r2.e.shots.push({id:uid(), code:num + shotLetter(r2.e.shots.length), size:'PM', lens:'', move:'', desc:'', images:[], link3d:''}); render(); persist(p); break; }
    case 'member-del': { const m = p.members.find(x => x.id === id); p.members = p.members.filter(x => x.id !== id); render(); sb.from('hub_members').delete().eq('id', id).then(r => { if (r.error) { p.members.push(m); render(); toast('Não consegui tirar ' + m.name + '. Volta a tentar.'); } else toast(m.name + ' saiu da equipa.'); }); break; }
    case 'perm': { const pr = permsFor(p, a.dataset.role), k = a.dataset.mod; pr[k] = {edita:'ve', ve:'nada', nada:'edita'}[pr[k]] || 've'; render(); persist(p); break; }
    case 'shot-del': { const F = findShot(p, a.dataset.shot), E = F.E, sh = F.sh; withUndo('Plano ' + sh.code + ' tirado.', () => { E.shots = E.shots.filter(x => x.id !== sh.id); }); break; }
    case 'shot-img': imageTarget = {kind:'shot', shot:a.dataset.shot, tag:a.dataset.tag}; pickImages(true); break;
    case 'shot-img-del': { const sh = findShot(p, a.dataset.shot).sh; withUndo('Imagem tirada.', () => { sh.images = sh.images.filter(x => x.path !== a.dataset.path); }); break; }
    case 'blk-add': { const E = curEnt(); E.blocks = E.blocks || []; E.blocks.push(newBlock(a.dataset.type, a.dataset.type === 'images' || a.dataset.type === 'model' ? a.dataset.title : '')); render(); persist(p); break; }
    case 'blk-up': case 'blk-down': { const E = curEnt(), i = E.blocks.findIndex(b => b.id === id), j = act === 'blk-up' ? i - 1 : i + 1; if (j >= 0 && j < E.blocks.length) { const t = E.blocks[i]; E.blocks[i] = E.blocks[j]; E.blocks[j] = t; render(); persist(p); } break; }
    case 'blk-del': { const E = curEnt(), b = E.blocks.find(x => x.id === id); withUndo('Bloco ' + b.title + ' tirado.', () => { E.blocks = E.blocks.filter(x => x.id !== id); }); break; }
    case 'blk-row': { const b = curEnt().blocks.find(x => x.id === id); b.rows.push(['', '']); render(); persist(p); break; }
    case 'blk-img': imageTarget = {kind:'blk', id}; pickImages(true); break;
    case 'blk-img-del': { const b = curEnt().blocks.find(x => x.id === id); withUndo('Imagem tirada.', () => { b.images = b.images.filter(x => x.path !== a.dataset.path); }); break; }
    case 'add-card': { const t = a.dataset.type; addCard(t === 'board' ? {type:'board', title:'', cards:[]} : t === 'note' ? {type:'note', title:'', text:''} : t === 'palette' ? {type:'palette', title:'Paleta', colors:['#1d1d1f','#4a4f55','#9aa0a6','#d9d4c7','#c4733b']} : {type:'list', title:'', items:[]}); break; }
    case 'add-image': imageTarget = 'card'; pickImages(false); break;
    case 'frame-image': imageTarget = 'frame'; pickImages(false); break;
    case 'card-del': withUndo('Cartão deitado fora.', () => { const L = curCards(pg), k = L.findIndex(c => c.id === id); if (k >= 0) L.splice(k, 1); }); break;
    case 'board-open': state.ui.boardPath = state.ui.boardPath || {}; state.ui.boardPath[pg.id] = (state.ui.boardPath[pg.id] || []).concat(id); render(); break;
    case 'bfs-nav': state.ui.bfsNav = !state.ui.bfsNav; { const b = $('#bfs'); if (b) b.classList.toggle('nav-open', state.ui.bfsNav); a.setAttribute('aria-expanded', state.ui.bfsNav); } break;
    case 'bfs-exit': state.ui.bfsNav = false; state.ui.page = 'script'; state.ui.ent = null; go(); break;
    case 'zoom-in': zoomAt(1.2); break;
    case 'zoom-out': zoomAt(1 / 1.2); break;
    case 'zoom-reset': { const v = bview(pg), vw = $('#bfs-view'), r = vw.getBoundingClientRect(); zoomAt(1 / v.z, r.width / 2, r.height / 2); break; }
    case 'zoom-fit': zoomFit(); break;
    case 'board-go': state.ui.boardPath[pg.id] = (state.ui.boardPath[pg.id] || []).slice(0, +a.dataset.depth); render(); break;
    case 'row-add': pg.data.rows.push(pg.data.cols.map(() => '')); render(); persist(p); break;
    case 'col-add': pg.data.cols.push('Coluna ' + (pg.data.cols.length + 1)); pg.data.rows.forEach(r => r.push('')); render(); persist(p); break;
    case 'row-del': withUndo('Linha tirada.', () => { pg.data.rows.splice(+a.dataset.i, 1); }); break;
    case 'col-del': withUndo('Coluna tirada.', () => { const i = +a.dataset.i; pg.data.cols.splice(i, 1); pg.data.rows.forEach(r => r.splice(i, 1)); }); break;
    case 'map-add': {
      const k = a.dataset.kind, it = {id:uid(), kind:k, x:Math.round(MW / 2 + (Math.random() * 80 - 40)), y:Math.round(MH / 2 + (Math.random() * 60 - 30))};
      if (k === 'cam') Object.assign(it, {label:String.fromCharCode(65 + pg.data.items.filter(i => i.kind === 'cam').length), focal:35, sensor:'24.9'});
      if (k === 'light') Object.assign(it, {label:'Luz', fix:'', set:'', spread:45});
      if (k === 'piece') Object.assign(it, {label:'Peça', w:120, h:60});
      pg.data.items.push(it); state.ui.mapSel = it.id; render(); persist(p); break;
    }
    case 'map-unsel': state.ui.mapSel = null; render(); break;
    case 'map-del': withUndo('Tirado do mapa.', () => { pg.data.items = pg.data.items.filter(i => i.id !== state.ui.mapSel); state.ui.mapSel = null; }); break;
    case 'frame-del': withUndo('Quadro deitado fora.', () => { pg.data.frames = pg.data.frames.filter(f => f.id !== id); }); break;
  }
});

function addFrame(path){
  const p = cur(), pg = curPage(p), n = +($('#fr-scene') || {}).value || null;
  const count = pg.data.frames.filter(f => f.scene === n).length;
  const f = {id:uid(), scene:n, code:(n || '') + String.fromCharCode(65 + (count % 26)), size:$('#fr-size').value, caption:$('#fr-cap').value.trim(), x:.35 + Math.random() * .3};
  if (path) f.path = path;
  pg.data.frames.push(f); render(); persist(p);
}

document.addEventListener('submit', async e => {
  const f = e.target; e.preventDefault();
  const p = cur(), pg = p && curPage(p), val = sel => { const el = $(sel); return el ? el.value.trim() : ''; };
  switch (f.dataset.form) {
    case 'page-rename': finishRename(true); break;
    case 'claude-reply': { const t = f.querySelector('[name=reply]').value; if (!t.trim()) { state.ui.claudeOpen.msg = 'A caixa está vazia. Cola a resposta do Claude.'; render(); break; } claudeRead(p, t); break; }
    case 'ai-key': {
      const key = (f.querySelector('[name=key]').value || '').replace(/\s+/g, ''), m = state.ui.aiOpen; if (!m) break;
      if (!/^sk-ant-/.test(key)) { m.err = 'format'; render(); break; }
      m.busy = true; m.err = null; render();
      try { const d = await aiCall({action:'save', key}); state.ai = {own:{hint:d.hint}, shared:state.ai ? state.ai.shared : false}; m.busy = false; m.change = false; render(); toast('IA ligada.'); }
      catch (err) { m.busy = false; m.err = err.code; render(); }
      break; }
    case 'login': {
      const email = val('#li-email'), pass = $('#li-pass').value;
      if (!email || !pass) { formMsg(f, 'Faltam o email ou a palavra-passe.'); return; }
      formMsg(f, ''); f.querySelector('button').disabled = true;
      const r = await sb.auth.signInWithPassword({email, password:pass});
      f.querySelector('button').disabled = false;
      if (r.error) formMsg(f, navigator.onLine ? 'O email e a palavra-passe não batem certo. É a mesma conta que usas no Viewfinder.' : 'Este computador está sem internet.');
      break;
    }
    case 'new-project': {
      const name = val('#np-name'); if (!name) { formMsg(f, 'Falta o nome do projeto.'); $('#np-name').focus(); return; }
      const id = crypto.randomUUID();
      const kind = val('#np-kind') || 'fiction';
      const r = await sb.from('projects').insert({id, name, type:kind === 'fiction' ? 'fiction' : 'other'});
      if (r.error) { formMsg(f, 'Não consegui criar o projeto no servidor. Volta a tentar.'); return; }
      const np = {id, name, type:kind === 'fiction' ? 'fiction' : 'other', kind, tasks:[], homeGroup:'', status:'active', cover:null, scriptName:'', appChars:[], hasHub:false, format:KINDS[kind].formats.length ? val('#np-format') : KINDS[kind].label, phases:defaultPhases(), groups:DEPTS.map(n => ({id:uid(), name:n})), script:null, entities:{}, perms:{}, members:[], pages:[], lh:[]};
      np.pages.push(newPage('board', 'Board', null, 'vazio', np));
      state.projects.unshift(np); openProject(id); break;
    }
    case 'paste-script': { const t = $('#script-text').value; if (!t.trim()) { formMsg(f, 'A caixa está vazia. Cola o guião ou escolhe um ficheiro.'); return; } if (!(await importScript(t, ''))) formMsg(f, 'Não encontrei cabeçalhos de cena. Cada cena tem de começar por INT. ou EXT.'); break; }
    case 'dates': {
      const r = {};
      for (const [k, l] of PHASES) { const a2 = val('#d-' + k + '-a'), b2 = val('#d-' + k + '-b'); if (!a2 || !b2 || b2 < a2) { formMsg(f, 'Em ' + l + ', o fim tem de vir depois do início.'); return; } r[k] = {start:a2, end:b2}; }
      if (r.prod.start < r.pre.end || r.pos.start < r.prod.end) { formMsg(f, 'As fases vão uma a seguir à outra: a produção começa depois da pré, e a pós depois da produção.'); return; }
      p.phases = r; state.ui.datesOpen = false; render(); persist(p); toast('Datas guardadas.'); break;
    }
    case 'group-add': { const n = val('#grp-name'); if (!n) { $('#grp-name').focus(); return; } p.groups.push({id:uid(), name:n}); render(); persist(p); break; }
    case 'add-tool': {
      const m = state.ui.modal, name = val('#tool-name') || TOOLS[m.type].label, tpl = (($('#tool-tpl') || {}).value) || 'vazio';
      const np = newPage(m.type, name, val('#tool-group') || null, tpl, p);
      p.pages.push(np); state.ui.modal = null; if (np.group && state.ui.collapsed) state.ui.collapsed[np.group] = false;
      persist(p); openPage(np.id); break;
    }
    case 'list-add': { const c = curCards(pg).find(x => x.id === f.dataset.id), t = f.querySelector('input').value.trim(); if (!c || !t) return; c.items.push({t, done:false}); render(); persist(p); const n = $('#add-' + c.id); if (n) n.focus(); break; }
    case 'task-add': {
      const name = val('#tk-name'), a2 = val('#tk-a'), b2 = val('#tk-b');
      if (!name) { formMsg(f, 'Falta o nome da tarefa.'); $('#tk-name').focus(); return; }
      if (!a2 || !b2 || b2 < a2) { formMsg(f, 'O fim tem de vir no mesmo dia ou depois do início.'); return; }
      pg.data.tasks.push({id:uid(), name, dept:val('#tk-dept'), start:a2, end:b2}); render(); persist(p); break;
    }
    case 'frame-add': addFrame(null); break;
    case 'todo-add': {
      const q = n => f.querySelector('[name="' + n + '"]'), title = q('title').value.trim();
      if (!title) { formMsg(f, 'Escreve o que falta fazer.'); q('title').focus(); return; }
      p.tasks = p.tasks || [];
      p.tasks.push({id:uid() + uid(), title, target:q('target') ? q('target').value : (f.dataset.target || ''), assignee:q('assignee').value, due:q('due').value, status:'todo', created:today()});
      render(); persist(p); toast('Tarefa juntada.'); const t2 = $('[data-form="todo-add"] [name="title"]'); if (t2) t2.focus(); break;
    }
    case 'unit-add': {
      const T = KT(p), q = n => f.querySelector('[name="' + n + '"]'), name = q('name').value.trim();
      if (!name) { formMsg(f, 'Falta o nome.'); q('name').focus(); return; }
      ensureManual(p);
      const seq = (p.script.seq || 0) + 1, number = String(seq);
      p.script.seq = seq;
      p.script.scenes.push({id:uid(), n:seq, number, heading:name, place:q('place') ? q('place').value.trim() : '', chars:[], start:q('start') ? q('start').value.trim() : '', end:q('end') ? q('end').value.trim() : '', ie:'—', time:'', body:[], len:0});
      render(); persist(p);
      const row = {id:hex12(), project_id:p.id, position:p.script.scenes.length - 1, number, heading:name, characters:[]};
      sb.from('scenes').insert(row).select('id,project_id,number,heading,characters,items,position').then(r => { if (!r.error && r.data) p.lh = p.lh.concat(r.data); });
      const n2 = $('[data-form="unit-add"] [name="name"]'); if (n2) n2.focus(); break;
    }
    case 'seg-new': { const n = f.querySelector('input').value.trim(); if (!n) return; const u = p.script.scenes.find(x => x.number === f.dataset.unit); if (!u) return; segAdd(p, u, f.dataset.kind, n); state.ui.segNew = null; render(); persist(p); break; }
    case 'seg-split': {
      const u = p.script.scenes.find(x => x.number === f.dataset.unit); if (!u) return;
      const at = f.querySelector('[name=at]').value.trim(), nm = f.querySelector('[name=name]').value.trim(), t = tsec(at);
      if (t == null) { toast('Escreve o momento onde partir, por exemplo 1:20.'); f.querySelector('[name=at]').focus(); return; }
      const a0 = tsec(u.start), b0 = tsec(u.end);
      if ((a0 != null && t <= a0) || (b0 != null && t >= b0)) { toast('Esse momento fica fora desta secção (' + (u.start || '?') + '–' + (u.end || '?') + ').'); return; }
      const seq = (p.script.seq || 0) + 1; p.script.seq = seq;
      const nu = {id:uid(), n:seq, number:String(seq), heading:nm || (u.heading ? u.heading + ' (2)' : 'Nova secção'), place:u.place || '', places:unitPlaces(u).slice(), chars:u.chars.slice(), start:tfmt(t), end:u.end || '', ie:'—', time:'', body:[], len:0};
      u.end = tfmt(t);
      const i = p.script.scenes.indexOf(u); p.script.scenes.splice(i + 1, 0, nu);
      sb.from('scenes').insert({id:hex12(), project_id:p.id, position:i + 1, number:nu.number, heading:nu.heading, characters:nu.chars}).select('id,project_id,number,heading,characters,items,position').then(r => { if (!r.error && r.data) p.lh = p.lh.concat(r.data); });
      render(); persist(p); toast('Secção partida em ' + tfmt(t) + '. A nova secção leva os mesmos décors e pessoas.'); break;
    }
    case 'unit-person-new': { const n = f.querySelector('input').value.trim(); if (!n) return; const u = p.script.scenes.find(x => x.number === f.dataset.unit); if (u.chars.indexOf(n) < 0) u.chars.push(n); state.ui.newPersonFor = null; render(); persist(p); break; }
    case 'prop-add': {
      const nameEl = f.querySelector('[name="name"]') || f.querySelector('input'), name = nameEl.value.trim();
      if (!name) { formMsg(f, 'Falta o nome do adereço.'); nameEl.focus(); return; }
      p.props = p.props || [];
      if (p.props.some(x => normName(x.name) === normName(name))) { formMsg(f, 'Já existe um adereço com este nome.'); return; }
      const place = f.dataset.place || (f.querySelector('[name="place"]') || {}).value || '', ch = (f.querySelector('[name="char"]') || {}).value || '';
      p.propsRemoved = (p.propsRemoved || []).filter(x => x !== normName(name));
      p.props.push({id:uid() + uid(), name, kind:f.dataset.kind === 'set' ? 'set' : 'action', category:'outro', desc:'', appear:[], source:'manual', status:'Por arranjar', qty:'', addChars:ch ? [ch] : [], addPlaces:place ? [place] : [], noChars:[], noPlaces:[]});
      render(); persist(p); toast(name + ' juntado aos adereços.'); break;
    }
    case 'prop-app': {
      const pr = p.props.find(x => x.id === f.dataset.id), q = n => f.querySelector('[name="' + n + '"]'), act = q('action').value.trim(), ch = q('char').value;
      if (!act) { q('action').focus(); return; }
      pr.appear.push({scene:q('scene').value, quote:'', interactions:ch ? [{character:ch, action:act}] : [], continuity:ch ? '' : act, manual:true});
      render(); persist(p); break;
    }
    case 'blk-link': {
      const b = curEnt().blocks.find(x => x.id === f.dataset.id); let url = f.querySelector('[name="url"]').value.trim();
      if (!url) return; if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
      b.links.push({url, label:f.querySelector('[name="label"]').value.trim()}); render(); persist(p); break;
    }
    case 'person-add': { const n = f.querySelector('input').value.trim(); if (!n) return; ensureManual(p); p.script.extraPeople = p.script.extraPeople || []; if (p.script.extraPeople.indexOf(n) < 0) p.script.extraPeople.push(n); render(); persist(p); break; }
    case 'place-add': { const n = f.querySelector('input').value.trim(); if (!n) return; ensureManual(p); p.script.extraPlaces = p.script.extraPlaces || []; if (p.script.extraPlaces.indexOf(n) < 0) p.script.extraPlaces.push(n); render(); persist(p); break; }
    case 'invite': {
      const name = val('#inv-name'), email = val('#inv-email'), role = val('#inv-role');
      if (!name) { formMsg(f, 'Falta o nome.'); $('#inv-name').focus(); return; }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { formMsg(f, 'Este email parece incompleto. Falta o @ ou o domínio.'); $('#inv-email').focus(); return; }
      const m = {id:uid() + uid(), project_id:p.id, name, email, role, status:'por convidar'};
      const r = await sb.from('hub_members').insert(m);
      if (r.error) { formMsg(f, 'Não consegui guardar no servidor. Volta a tentar.'); return; }
      p.members.push(m); permsFor(p, role); persist(p); render(); toast(name + ' ficou na equipa como ' + role + '.'); break;
    }
    case 'ent-shot': {
      const E = curEnt(), num = state.ui.ent.split(':').slice(1).join(':');
      E.shots.push({id:uid(), code:num + shotLetter(E.shots.length), size:val('#es-size') || 'PM', lens:val('#es-lens'), move:val('#es-move'), desc:val('#es-desc'), images:[], link3d:''});
      render(); persist(p); break;
    }
    case 'blk-item': { const b = curEnt().blocks.find(x => x.id === f.dataset.id), t = f.querySelector('input').value.trim(); if (!b || !t) return; b.items.push({t, done:false}); render(); persist(p); const n = document.querySelector('[data-form="blk-item"][data-id="' + b.id + '"] input'); if (n) n.focus(); break; }
  }
});

document.addEventListener('input', e => {
  const t = e.target, p = cur(); if (!p) return;
  const pg = curPage(p), txt = () => (t.innerText || t.textContent || '').replace(/\n+$/, ''), ds = t.dataset || {};
  const cardEl = t.closest && t.closest('[data-card]');
  if (cardEl && pg) {
    const c = curCards(pg).find(x => x.id === cardEl.dataset.card); if (!c) return;
    if (ds.field) c[ds.field] = txt();
    else if (ds.item != null) c.items[+ds.item].t = txt().trim();
    else if (ds.swatch != null) { const v = t.value, i = ds.swatch; c.colors[+i] = v; t.parentElement.style.background = v; const hx = cardEl.querySelector('[data-hex="' + i + '"]'); if (hx) hx.textContent = v.toUpperCase(); }
    persist(p); return;
  }
  if (ds.unitField) { const u = p.script.scenes.find(x => x.number === ds.unit); if (!u) return; u[ds.unitField] = ds.unitField === 'heading' ? txt().trim() : t.value.trim(); persist(p); return; }
  if (ds.propName) { const pr = p.props.find(x => x.id === ds.propName); if (pr) { pr.name = txt().trim() || pr.name; persist(p); } return; }
  if (ds.propDesc) { const pr = p.props.find(x => x.id === ds.propDesc); if (pr) { pr.desc = txt(); persist(p); } return; }
  if (ds.propField === 'qty') { const pr = p.props.find(x => x.id === ds.id); if (pr) { pr.qty = t.value; persist(p); } return; }
  if (ds.taskTitle) { const tk = p.tasks.find(x => x.id === ds.taskTitle); if (tk) { tk.title = txt().trim(); persist(p); } return; }
  if (ds.mapTitle != null && pg && pg.embedded) { pg.data.title = txt().trim() || 'Mapa de luz'; persist(p); }
  else if (ds.pageTitle != null && pg) { pg.title = txt().trim() || TOOLS[pg.type].label; const nav = document.querySelector('.nav[data-id="' + pg.id + '"] span'); if (nav) nav.textContent = pg.title; persist(p); }
  else if (ds.groupName) { const g = p.groups.find(x => x.id === ds.groupName); if (g && txt().trim()) { g.name = txt().trim(); persist(p); } }
  else if (ds.head != null && pg) { pg.data.cols[+ds.head] = txt(); persist(p); }
  else if (ds.cell && pg) { const [r, c] = ds.cell.split(',').map(Number); pg.data.rows[r][c] = txt(); persist(p); }
  else if (ds.cast) { p.script = p.script || {}; p.script.cast = p.script.cast || {}; p.script.cast[ds.cast] = t.value; persist(p); }
  else if (ds.shotField || ds.shotText) {
    const F = findShot(p, ds.shot || ds.shotText); if (!F) return;
    if (ds.shotField) { F.sh[ds.shotField] = t.value; if (F.sh.vf) delete F.sh.vf[ds.shotField]; } else F.sh.desc = txt();
    persist(p);
  }
  else if (curEnt() && (ds.blkTitle || ds.blkText || ds.blkItem || ds.blkK || ds.blkV || ds.blkUrl || ds.blkLabel)) {
    const E = curEnt(), blk = id => E.blocks.find(b => b.id === id);
    if (ds.shotField) { const sh = E.shots.find(x => x.id === ds.shot); if (sh) sh[ds.shotField] = t.value; }
    else if (ds.shotText) { const sh = E.shots.find(x => x.id === ds.shotText); if (sh) sh.desc = txt(); }
    else if (ds.blkTitle) { const b = blk(ds.blkTitle); if (b) b.title = txt().trim() || BLOCKS[b.type]; }
    else if (ds.blkText) { const b = blk(ds.blkText); if (b) b.text = txt(); }
    else if (ds.blkItem) { const b = blk(ds.blkItem); if (b) b.items[+ds.i].t = txt().trim(); }
    else if (ds.blkK) { const b = blk(ds.blkK); if (b) b.rows[+ds.i][0] = txt(); }
    else if (ds.blkV) { const b = blk(ds.blkV); if (b) b.rows[+ds.i][1] = txt(); }
    else if (ds.blkUrl) { const b = blk(ds.blkUrl); if (b) b.url = t.value.trim(); }
    else if (ds.blkLabel) { const b = blk(ds.blkLabel); if (b) b.label = t.value; }
    persist(p);
  }
  else if (ds.frameCap && pg) { const fr = pg.data.frames.find(x => x.id === ds.frameCap); if (fr) { fr.caption = txt(); persist(p); } }
  else if (ds.mfield && pg) {
    const it = pg.data.items.find(i => i.id === state.ui.mapSel); if (!it) return;
    const k = ds.mfield, lim = {spread:[5, 180], w:[4, 600], h:[4, 600], focal:[4, 1200], cct:[1000, 12000], intensity:[0, 100], rot:[0, 359]};
    it[k] = lim[k] ? (t.value === '' ? '' : Math.max(lim[k][0], Math.min(lim[k][1], +t.value))) : t.value;
    renderMap(); persist(p);
  }
  else if (ds.mscale != null && pg) { pg.data.scale = +t.value; renderMap(); persist(p);
  }
});

document.addEventListener('change', e => {
  const t0 = e.target;
  if (t0.id === 'np-kind') { const k = t0.value, fm = KINDS[k].formats, sel = $('#np-format'); $('#np-format-wrap').hidden = !fm.length; sel.innerHTML = fm.map(x => '<option>' + x + '</option>').join(''); $('#np-note').textContent = kindNote(k); return; }
  if (t0.dataset && t0.dataset.homeGroup) { const pp = state.projects.find(x => x.id === t0.dataset.homeGroup); pp.homeGroup = t0.value.trim(); state.ui.cardMenu = null; render(); persist(pp); return; }
  if (t0.dataset && (t0.dataset.bcolType || t0.dataset.budgetMain != null || t0.dataset.budgetTpl != null || t0.dataset.bimpType || t0.dataset.bimpSheet != null || t0.dataset.bimpMode != null)) {
    const p1 = cur(); if (!p1) return; const b = getBudget(p1);
    if (t0.dataset.bcolType) { const c = b.cols.find(x => x.id === t0.dataset.bcolType); if (c) { c.type = t0.value; b.rows.forEach(r => { if (r.cells && r.cells[c.id] != null && c.type !== 'text' && typeof r.cells[c.id] === 'string' && parseMoney(r.cells[c.id]) != null) r.cells[c.id] = parseMoney(r.cells[c.id]); }); } render(); persist(p1); return; }
    if (t0.dataset.budgetMain != null) { b.main = t0.value; render(); persist(p1); return; }
    if (t0.dataset.budgetTpl != null) { const k = t0.value; if (!k) return; const lbl = (BUDGET_TEMPLATES.find(x => x[0] === k) || [])[1]; withUndo('Modelo ' + lbl + ' aplicado.', () => { const d = defaultBudget(); b.cols = d.cols; b.main = 'v'; b.rows = templateRows(k); }); return; }
    const m = state.ui.bimport; if (!m) return;
    if (t0.dataset.bimpType) { m.parsed.cols[+t0.dataset.bimpType].type = t0.value; render(); return; }
    if (t0.dataset.bimpSheet != null) { m.si = +t0.value; m.parsed = sheetToBudget(m.sheets[m.si].rows); render(); return; }
    if (t0.dataset.bimpMode != null) { m.mode = t0.value; return; }
  }
  if (t0.dataset && (t0.dataset.segAdd || t0.dataset.segDuration != null)) {
    const p1 = cur(); if (!p1 || !p1.script) return;
    if (t0.dataset.segDuration != null) { const v = t0.value.trim(); if (v && tsec(v) == null) { toast('Escreve a duração como 3:45.'); return; } p1.script.duration = v; render(); persist(p1); return; }
    const u = p1.script.scenes.find(x => x.number === t0.dataset.unit); if (!u || !t0.value) return;
    if (t0.value === '__nova') { state.ui.segNew = {unit:t0.dataset.unit, kind:t0.dataset.segAdd}; render(); const i2 = $('#seg-new-in'); if (i2) i2.focus(); return; }
    segAdd(p1, u, t0.dataset.segAdd, t0.value); render(); persist(p1); return;
  }
  if (t0.dataset && t0.dataset.propSort != null) { state.ui.propSort = t0.value; render(); return; }
  if (t0.dataset && t0.dataset.taskSort != null) { state.ui.taskSort = t0.value; render(); return; }
  if (t0.dataset && t0.dataset.grpColor) { const p1 = cur(), g = p1 && p1.groups.find(x => x.id === t0.dataset.grpColor); if (g) { g.color = t0.value; state.ui.colorFor = null; render(); persist(p1); } return; }
  if (t0.dataset && t0.dataset.tf) { state.ui.tf = state.ui.tf || {}; state.ui.tf[t0.dataset.tf] = t0.value; render(); return; }
  const t = e.target, p = cur(); if (!p) return;
  const pg = curPage(p), ds = t.dataset || {};
  if (ds.check != null && pg) { const c = curCards(pg).find(x => x.id === t.closest('[data-card]').dataset.card); if (!c) return; c.items[+ds.check].done = t.checked; t.closest('li').classList.toggle('done', t.checked); persist(p); }
  else if (ds.pageGroup != null && pg) { pg.group = t.value || null; render(); persist(p); }
  else if (ds.mapScene != null && pg) { pg.data.scene = t.value ? +t.value : null; render(); persist(p); }
  else if (ds.mapLight != null && pg) { if (!t.value) return; const it = {id:uid(), kind:'light', x:Math.round(MW / 2 + (Math.random() * 100 - 50)), y:Math.round(MH / 2 + (Math.random() * 60 - 30)), label:'', type:t.value, cct:t.value === 'Prático' ? 2700 : t.value === 'Sol ou céu' ? 5600 : '', intensity:'', spread:t.value === 'Softbox' || t.value === 'Painel LED' ? 90 : 45}; pg.data.items.push(it); state.ui.mapSel = it.id; render(); persist(p); }
  else if (ds.mapPiece != null && pg) { if (!t.value) return; const d0 = PIECES[t.value]; const it = {id:uid(), kind:'piece', x:Math.round(MW / 2), y:Math.round(MH / 2), label:t.value === 'Outro' ? '' : t.value, w:d0[0], h:d0[1], rot:0}; pg.data.items.push(it); state.ui.mapSel = it.id; render(); persist(p); }
  else if (ds.mauto != null && pg) { const it = pg.data.items.find(i => i.id === state.ui.mapSel); if (!it) return; it.rot = t.checked ? null : Math.round((itemAngle(pg.data, it) % 360 + 360) % 360); render(); persist(p); }
  else if (ds.mfield && pg && t.tagName === 'SELECT') { render(); }
  else if (ds.mapChar != null && pg) {
    let name = t.value; if (!name) return; if (name === '__outra') name = 'Figurante';
    const it = {id:uid(), kind:'actor', x:Math.round(MW / 2 + (Math.random() * 120 - 60)), y:Math.round(MH / 2 + (Math.random() * 80 - 40)), label:name};
    pg.data.items.push(it); state.ui.mapSel = it.id; render(); persist(p);
  }
  else if (ds.blkCheck && curEnt()) { const b = curEnt().blocks.find(x => x.id === ds.blkCheck); b.items[+ds.i].done = t.checked; t.closest('li').classList.toggle('done', t.checked); persist(p); }
  else if (ds.assign && curEnt()) { if (t.value) { curEnt().photoShot[ds.assign] = t.value; render(); persist(p); } }
  else if (ds.shotField === 'size') { render(); }
  else if (ds.unitField === 'place') { render(); }
  else if (ds.unitPerson) { let n = t.value; if (!n) return; if (n === '__nova') { t.value = ''; state.ui.newPersonFor = ds.unitPerson; render(); const i2 = $('#new-person'); if (i2) i2.focus(); return; } const u = p.script.scenes.find(x => x.number === ds.unitPerson); if (u.chars.indexOf(n) < 0) u.chars.push(n); render(); persist(p); }
  else if (ds.propField && ds.propField !== 'qty') { const pr = p.props.find(x => x.id === ds.id); pr[ds.propField] = t.value; if (ds.propField === 'kind') pr.kindLocked = true; render(); persist(p); }
  else if (ds.propLink) { if (!t.value) return; const pr = p.props.find(x => x.id === ds.id), addK = ds.propLink === 'chars' ? 'addChars' : 'addPlaces', noK = ds.propLink === 'chars' ? 'noChars' : 'noPlaces'; pr[noK] = (pr[noK] || []).filter(x => x !== t.value); if ((pr[addK] || []).indexOf(t.value) < 0) pr[addK] = (pr[addK] || []).concat(t.value); render(); persist(p); }
  else if (ds.taskAssignee) { const tk = p.tasks.find(x => x.id === ds.taskAssignee); tk.assignee = t.value; persist(p); render(); }
  else if (ds.taskDue) { const tk = p.tasks.find(x => x.id === ds.taskDue); tk.due = t.value; persist(p); render(); }
  else if (ds.toolTpl != null && state.ui.modal) { state.ui.modal.tpl = t.value; state.ui.modal.name = $('#tool-name').value; state.ui.modal.group = $('#tool-group').value || null; render(); }
});

document.addEventListener('keydown', e => {
  const t = e.target;
  if (t && t.id === 'rename-in' && e.key === 'Escape') { e.preventDefault(); finishRename(false); return; }
  if ($('#bfs') && !(t.matches && t.matches('input,select,textarea,[contenteditable]'))) {
    const p = cur(), pg = p && curPage(p);
    if (e.key === 'Escape' && state.ui.bfsNav) { state.ui.bfsNav = false; $('#bfs').classList.remove('nav-open'); return; }
    if (e.key === 'Escape' && pg && ((state.ui.boardPath || {})[pg.id] || []).length && !state.ui.modal) { state.ui.boardPath[pg.id] = state.ui.boardPath[pg.id].slice(0, -1); render(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomAt(1.2); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '-') { e.preventDefault(); zoomAt(1 / 1.2); return; }
    if ((e.ctrlKey || e.metaKey) && e.key === '0') { e.preventDefault(); zoomFit(); return; }
  }
  if (e.key === 'Escape' && (state.ui.aiOpen || state.ui.claudeOpen || state.ui.bimport)) { state.ui.aiOpen = null; state.ui.claudeOpen = null; state.ui.bimport = null; render(); return; }
  if (e.key === 'Escape' && state.ui.shotOpen && !state.ui.modal && !state.ui.mapOpen && !state.ui.lhOpen) { state.ui.shotOpen = null; render(); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && state.ui.mapOpen && state.ui.mapSel && !(t.matches && t.matches('input,select,textarea,[contenteditable]'))) { e.preventDefault(); const p = cur(), pg = p && curPage(p); if (pg) { pg.data.items = pg.data.items.filter(i => i.id !== state.ui.mapSel); state.ui.mapSel = null; render(); persist(p); } return; }
  if (e.key === 'Escape' && (state.ui.modal || state.ui.mapOpen || state.ui.lhOpen)) { state.ui.modal = null; state.ui.mapOpen = null; state.ui.lhOpen = null; state.ui.mapSel = null; render(); return; }
  if ((e.key === 'Enter' || e.key === ' ') && t.matches && t.matches('tr[data-action]')) { e.preventDefault(); t.click(); return; }
  if (e.key === 'Enter' && !e.shiftKey && t.matches && t.matches('[data-field="title"],[data-field="caption"],[data-item],[data-page-title],[data-group-name],[data-head],[data-cell],[data-frame-cap],[data-blk-title],[data-blk-item],[data-blk-k],[data-blk-v],[data-unit-field="heading"],[data-task-title],[data-prop-name]')) { e.preventDefault(); t.blur(); }
});
document.addEventListener('input', e => {
  const t = e.target, ds = t.dataset || {}; const p = cur(); if (!p || !p.budget) return;
  const b = p.budget;
  if (ds.bcell) { const [rid, cid] = ds.bcell.split(':'), r = b.rows.find(x => x.id === rid), c = b.cols.find(x => x.id === cid); if (!r || !c) return; r.cells = r.cells || {}; r.cells[cid] = c.type === 'text' ? t.value : (parseMoney(t.value) != null ? parseMoney(t.value) : t.value); budgetRefresh(); persist(p); }
  else if (ds.budgetTotal != null) { b.total = parseMoney(t.value); budgetRefresh(); persist(p); }
  else if (ds.bsecTitle) { const r = b.rows.find(x => x.id === ds.bsecTitle); if (r) { r.title = t.value; persist(p); } }
  else if (ds.bcol) { const c = b.cols.find(x => x.id === ds.bcol); if (c) { c.name = t.value; persist(p); } }
});
document.addEventListener('focusout', e => {
  if (e.target && e.target.dataset && (e.target.dataset.bcell || e.target.dataset.budgetTotal != null)) { const p = cur(); const ds = e.target.dataset; if (p && p.budget) { const b = p.budget; let c = null, v;
    if (ds.bcell) { const [rid, cid] = ds.bcell.split(':'); c = b.cols.find(x => x.id === cid); const r = b.rows.find(x => x.id === rid); v = r && r.cells ? r.cells[cid] : null; } else { c = {type:'number'}; v = b.total; }
    if (c && c.type !== 'text' && typeof v === 'number') e.target.value = cellShow({type:'number'}, v); } }
  if (e.target && e.target.id === 'rename-in' && state.ui.renaming) { setTimeout(() => { if (state.ui.renaming && document.activeElement !== $('#rename-in')) finishRename(true); }, 0); return; }
  const ds = e.target.dataset || {};
  if (ds.groupName) render();
  if (ds.unitField === 'heading') { const p = cur(), l = p && p.lh.find(x => String(x.number) === ds.unit); if (l) { const h = (e.target.innerText || '').trim(); l.heading = h; sb.from('scenes').update({heading:h}).eq('id', l.id).then(() => {}); } render(); }
});
document.addEventListener('paste', e => {
  const el = e.target.closest && e.target.closest('[contenteditable]'); if (!el) return;
  e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text/plain'));
});

/* arrastar: cartões do board e peças do mapa de luz */
let drag = null;
function svgPoint(svg, e){ const m = svg && svg.getScreenCTM && svg.getScreenCTM(); if (!m) return null; const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(m.inverse()); }
document.addEventListener('pointerdown', e => {
  const p = cur(), pg = p && curPage(p); if (!pg) return;
  const mi = e.target.closest && e.target.closest('[data-mitem]');
  if (mi && pg.type === 'map') {
    const it = pg.data.items.find(i => i.id === mi.dataset.mitem), pt = svgPoint($('#map-svg'), e); if (!it || !pt) return;
    drag = {map:true, it, dx:it.x - pt.x, dy:it.y - pt.y, id:e.pointerId};
    if (state.ui.mapSel !== it.id) { state.ui.mapSel = it.id; render(); }
    e.preventDefault(); return;
  }
  const rz = e.target.closest && e.target.closest('[data-rsz]');
  if (rz && pg.type === 'board') {
    const el = rz.closest('[data-card]'), c = curCards(pg).find(x => x.id === el.dataset.card); if (!c) return;
    drag = {rsz:true, el, c, sx:e.clientX, sy:e.clientY, ow:el.offsetWidth, oh:el.offsetHeight, z:$('#bfs') ? bview(pg).z : 1, id:e.pointerId};
    try { rz.setPointerCapture(e.pointerId); } catch (err) {}
    el.classList.add('resizing'); e.preventDefault(); return;
  }
  const vwE = e.target.closest && e.target.closest('#bfs-view');
  if (vwE && pg.type === 'board' && (e.button === 1 || !e.target.closest('.bcard'))) {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    const v = bview(pg); drag = {pan:true, sx:e.clientX, sy:e.clientY, ox:v.x, oy:v.y, id:e.pointerId};
    try { vwE.setPointerCapture(e.pointerId); } catch (err) {}
    vwE.classList.add('panning'); e.preventDefault(); return;
  }
  const grip = e.target.closest && e.target.closest('[data-grip]'); if (!grip || e.target.closest('button')) return;
  const el = grip.closest('[data-card]'), c = curCards(pg).find(x => x.id === el.dataset.card); if (!c) return;
  c.z = curCards(pg).reduce((m, x) => Math.max(m, x.z || 1), 1) + 1; el.style.zIndex = c.z;
  drag = {el, c, sx:e.clientX, sy:e.clientY, ox:c.x, oy:c.y, z:$('#bfs') ? bview(pg).z : 1, free:!!$('#bfs'), id:e.pointerId};
  try { grip.setPointerCapture(e.pointerId); } catch (err) {}
  el.classList.add('dragging'); e.preventDefault();
});
document.addEventListener('pointermove', e => {
  if (!drag || e.pointerId !== drag.id) return;
  if (drag.map) { const pt = svgPoint($('#map-svg'), e); if (!pt) return; drag.it.x = Math.round(Math.max(12, Math.min(MW - 12, pt.x + drag.dx))); drag.it.y = Math.round(Math.max(12, Math.min(MH - 12, pt.y + drag.dy))); if (!mapRaf) mapRaf = requestAnimationFrame(() => { mapRaf = 0; renderMap(); }); return; }
  if (drag.pan) { const p = cur(), pg = p && curPage(p); if (!pg) return; const v = bview(pg); v.x = drag.ox + e.clientX - drag.sx; v.y = drag.oy + e.clientY - drag.sy; applyView(); return; }
  if (drag.rsz) {
    const w = Math.max(drag.c.type === 'ref' ? 80 : 150, Math.round(drag.ow + (e.clientX - drag.sx) / drag.z)), h = Math.max(70, Math.round(drag.oh + (e.clientY - drag.sy) / drag.z));
    drag.c.w = w; drag.el.style.width = w + 'px';
    if (drag.c.type !== 'ref') { drag.c.h = h; drag.el.style.height = h + 'px'; drag.el.classList.add('sized'); }
    return;
  }
  let x = Math.round(drag.ox + (e.clientX - drag.sx) / (drag.z || 1)), y = Math.round(drag.oy + (e.clientY - drag.sy) / (drag.z || 1));
  if (!drag.free) { x = Math.max(0, x); y = Math.max(0, y); }
  drag.c.x = x; drag.c.y = y; drag.el.style.left = x + 'px'; drag.el.style.top = y + 'px';
});
function endDrag(){
  if (!drag) return;
  if (drag.pan) { const vw = $('#bfs-view'); if (vw) vw.classList.remove('panning'); drag = null; saveUi(); return; }
  if (drag.el) { drag.el.classList.remove('dragging'); drag.el.classList.remove('resizing'); sizeBoard(); }
  drag = null; persist();
}
/* roda do rato: mover; Ctrl ou Cmd + roda (ou pinça no trackpad): zoom */
document.addEventListener('wheel', e => {
  const vw = e.target.closest && e.target.closest('#bfs-view'); if (!vw) return;
  const p = cur(), pg = p && curPage(p); if (!pg || pg.type !== 'board') return;
  e.preventDefault();
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  if (e.ctrlKey || e.metaKey) { const r = vw.getBoundingClientRect(); zoomAt(Math.exp(-e.deltaY * k * 0.0025), e.clientX - r.left, e.clientY - r.top); }
  else { const v = bview(pg); v.x -= (e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX) * k; v.y -= (e.shiftKey && !e.deltaX ? 0 : e.deltaY) * k; applyView(); }
}, {passive:false});
/* arrastar imagens do computador para o board */
document.addEventListener('dragover', e => { if (e.target.closest && e.target.closest('#bfs-view') && e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); $('#bfs-view').classList.add('dropping'); } });
document.addEventListener('dragleave', e => { const vw = $('#bfs-view'); if (vw && !vw.contains(e.relatedTarget)) vw.classList.remove('dropping'); });
document.addEventListener('drop', async e => {
  const vw = e.target.closest && e.target.closest('#bfs-view'); if (!vw) return;
  e.preventDefault(); vw.classList.remove('dropping');
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []).filter(f => /^image\//.test(f.type)); if (!files.length) { toast('Só consigo juntar imagens arrastadas.'); return; }
  const p = cur(), at = toCanvas(e.clientX, e.clientY);
  toast(files.length > 1 ? 'A enviar ' + files.length + ' imagens…' : 'A enviar a imagem…');
  let k = 0;
  for (const f of files) {
    try { const path = await uploadImage(f, p); addCard({type:'ref', path, caption:f.name.replace(/\.[^.]+$/, ''), x:at.x + k * 30, y:at.y + k * 30}); k++; }
    catch (err) { toast('Uma imagem não foi enviada. Volta a tentar.'); }
  }
});
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);

$('#file-img').addEventListener('change', async e => {
  const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return;
  const target = imageTarget, p = target === 'cover' ? state.projects.find(x => x.id === state.ui.coverFor) : cur();
  if (target === 'avatar') {
    toast('A enviar a foto…');
    try {
      const blob = await shrink(files[0], 512, .85), path = state.user.id + '/profile/' + crypto.randomUUID() + '.webp';
      const up = await sb.storage.from('photos').upload(path, blob, {contentType:'image/webp', upsert:false}); if (up.error) throw up.error;
      const old = state.me.avatar, r = await sb.auth.updateUser({data:{avatar_path:path}}); if (r.error) throw r.error;
      if (old) sb.storage.from('photos').remove([old]).catch(() => {});
      state.me.avatar = path; state.ui.meOpen = false; render(); toast('Foto de perfil mudada.');
    } catch (err) { toast(navigator.onLine ? 'A foto não foi enviada. Experimenta um JPEG ou um PNG.' : 'Sem internet: a foto não foi enviada.'); }
    return;
  }
  toast(files.length > 1 ? 'A enviar ' + files.length + ' imagens…' : 'A enviar a imagem…');
  let ok = 0;
  for (const file of files) {
    try {
      const path = await uploadImage(file, p); ok++;
      if (target === 'cover') { const pc = state.projects.find(x => x.id === state.ui.coverFor); if (pc) { pc.cover = path; persist(pc); render(); } }
      else if (target === 'frame') addFrame(path);
      else if (target === 'card') addCard({type:'ref', path, caption:file.name.replace(/\.[^.]+$/, '')});
      else if (target && target.kind === 'shot') { const F = findShot(p, target.shot), sh = F && F.sh; if (sh) { sh.images = sh.images || []; sh.images.push({path, tag:target.tag}); } }
      else if (target && target.kind === 'blk') { const E = curEnt(), b = E && E.blocks.find(x => x.id === target.id); if (b) b.images.push({path}); }
    } catch (err) { toast(navigator.onLine ? file.name + ' não foi enviada. Experimenta um JPEG ou um PNG.' : 'Sem internet: as imagens não foram enviadas.'); }
  }
  if (target && target.kind) { render(); persist(p); }
  if (ok) toast(ok > 1 ? ok + ' imagens guardadas.' : 'Imagem guardada.');
});
$('#file-script').addEventListener('change', e => { const file = e.target.files && e.target.files[0]; e.target.value = ''; readScriptFile(file); });
document.addEventListener('paste', e => {
  if (!e.target || e.target.id !== 'cl-reply') return;
  const t = e.clipboardData && e.clipboardData.getData('text'); const p = cur();
  if (!t || !p || !state.ui.claudeOpen) return;
  e.preventDefault(); claudeRead(p, t);
});
$('#file-budget').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0]; e.target.value = ''; if (!file || !cur()) return;
  try {
    const sheets = (await readBudgetFile(file)).filter(s0 => s0.rows.some(r => r && r.some(v => v !== '' && v != null)));
    if (!sheets.length) { toast('Este ficheiro não tem nada para importar.'); return; }
    state.ui.bimport = {file:file.name, sheets, si:0, parsed:sheetToBudget(sheets[0].rows), mode:'replace'}; render();
  } catch (err) { toast(err.code === 'old' ? 'Este formato não abre aqui. No Excel ou no Numbers, guarda como .xlsx ou .csv e importa outra vez.' : 'Este ficheiro não abriu. Importa um .xlsx ou um .csv.'); }
});
let docTarget = null;
$('#file-doc').addEventListener('change', async e => {
  const file = e.target.files && e.target.files[0]; e.target.value = ''; const p = cur();
  if (!file || !p || !docTarget) return;
  if (file.size > 50 * 1024 * 1024) { toast('Este ficheiro passa dos 50 MB. Exporta uma versão mais leve.'); return; }
  const page = docTarget; toast('A guardar ' + file.name + '…');
  try { const txt = await docFileText(file); const d = await saveDoc(p, page, file, txt, file.name); state.ui.docsOpen = page; render(); toast(file.name + ' guardado como versão ' + d.version + '.'); }
  catch (err) { toast(navigator.onLine ? 'O ficheiro não ficou guardado. Volta a tentar.' : 'Sem internet: o ficheiro não ficou guardado.'); }
});

/* ---------- arranque ---------- */
function setUser(u){
  state.user = u; state.ai = null;
  if (u) { const md = u.user_metadata || {}; state.me = {email:u.email || '', avatar:md.avatar_path || '', name:md.full_name || md.name || (u.email || '').split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}; }
}
sb.auth.onAuthStateChange((ev, session) => {
  const was = state.user && state.user.id, now = session && session.user;
  if (now && was === now.id) { state.user = now; return; }
  setUser(now || null);
  if (now) loadAll(); else { state.projects = []; render(); }
});
sb.auth.getSession().then(({data}) => { if (!data.session) { setUser(null); render(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
render();
