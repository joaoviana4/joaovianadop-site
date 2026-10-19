// Ctrl+Z / Ctrl+Shift+Z (ou Ctrl+Y) em todas as páginas: desfaz a última alteração guardada.
//
// Como: todas as escritas passam por sb.from(tabela).update/insert/upsert/delete. Antes de cada uma
// lemos as linhas que vão mudar (só as colunas mexidas) e, se correr bem, guardamos o contrário:
//   update → repor os valores antigos · delete → voltar a inserir · insert → apagar o que entrou.
// Escritas seguidas no mesmo campo (texto a ser escrito) juntam-se numa só. Depois de desfazer, a página
// volta a desenhar-se com os dados da base de dados.
// As páginas com o seu próprio desfazer (board, shotlist, tabelas) tratam do atalho primeiro.

const SKIP = new Set(['activity', 'activity_seen', 'board_items', 'presence', 'profiles', 'push_subscriptions', 'community_members', 'project_pins']);
const MAX_ROWS = 200;
const NOUN = { projects: 'projeto', boards: 'ferramenta', tasks: 'tarefa', scenes: 'cena', shots: 'plano', characters: 'elenco', locations: 'décor', props: 'adereço', prop_bundles: 'pacote de adereços', gear: 'equipamento', scripts: 'guião', project_budgets: 'orçamento', project_questions: 'questão', project_crew: 'equipa', project_members: 'equipa', marketing_items: 'marketing', fin_movements: 'finanças', fin_accounts: 'finanças', fin_recurring: 'finanças', shot_groups: 'shotlist' };
const past = []; const future = [];
let paused = 0; let toastFn = () => {}; let origFrom = null;
const cache = new Map(); const CACHE_MAX = 5000;
const listeners = new Set();
export const onWrite = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
// Escritas na mesma linha vão por ordem (uma de cada vez): uma gravação mais antiga nunca chega depois de uma mais nova.
// Também se sabe quantas estão a caminho, para não sair da página nem fechar a janela a meio.
const chains = new Map(); const inflight = new Set();
const rowKey = (table, fb) => { const q = []; fb.url.searchParams.forEach((v, k) => { if (!['select', 'columns', 'on_conflict', 'updated_at'].includes(k)) q.push(`${k}=${v}`); }); return `${table}?${q.sort().join('&')}`; };
export const writesPending = () => inflight.size;
// escritas feitas fora deste registo (cartões do board) também contam como "a guardar"
export function trackWrite(p) { const x = Promise.resolve(p); inflight.add(x); pillState(); x.finally(() => { inflight.delete(x); pillState(); }).catch(() => {}); return x; }
export function waitWrites(ms = 6000) { if (!inflight.size) return Promise.resolve(); return Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, ms))]); }
let pill = null, pillT = null, pillShown = false;
function pillState() {
  if (typeof document === 'undefined') return;
  if (!pill) { pill = document.createElement('div'); pill.className = 'save-pill'; pill.setAttribute('role', 'status'); pill.setAttribute('aria-live', 'polite'); pill.hidden = true; document.body.append(pill); }
  clearTimeout(pillT);
  if (inflight.size) { pillT = setTimeout(() => { pill.textContent = 'A guardar…'; pill.className = 'save-pill'; pill.hidden = false; pillShown = true; }, 500); }
  else if (pillShown) { pill.textContent = 'Guardado'; pill.className = 'save-pill ok'; pillT = setTimeout(() => { pill.hidden = true; pillShown = false; }, 1400); }
}
// guarda de escrita (leitores): fn(tabela, operação) devolve uma mensagem para impedir, ou nada
let guard = null; let guardToast = 0;
export const setWriteGuard = (fn) => { guard = fn; };
const blocked = (message) => {
  const r = { data: null, error: { message, code: 'readonly' }, count: null, status: 403 };
  const px = new Proxy(function () {}, { get: (t, k) => (k === 'then' ? (ok, ko) => Promise.resolve(r).then(ok, ko) : k === 'catch' ? (ko) => Promise.resolve(r) : () => px), apply: () => px });
  return px;
};
function remember(table, data) {
  const rows = Array.isArray(data) ? data : data && typeof data === 'object' ? [data] : [];
  rows.forEach((r) => { if (!r || !r.id) return; const k = `${table}:${r.id}`; cache.set(k, { ...(cache.get(k) || {}), ...r }); });
  if (cache.size > CACHE_MAX) [...cache.keys()].slice(0, cache.size - CACHE_MAX).forEach((k) => cache.delete(k));
}
// ids de um filtro simples (id=eq.X ou id=in.(a,b))
function idsOf(fb) {
  const keys = [...fb.url.searchParams.keys()].filter((k) => !['select', 'columns', 'on_conflict', 'limit', 'order'].includes(k));
  if (keys.length !== 1 || keys[0] !== 'id') return null;
  const v = fb.url.searchParams.get('id');
  if (v.startsWith('eq.')) return [v.slice(3)];
  const m = v.match(/^in\.\((.*)\)$/); return m ? m[1].split(',').map((x) => x.replace(/^"|"$/g, '')) : null;
}

export function installUndo(sb, toast) {
  if (origFrom) return; toastFn = toast;
  origFrom = sb.from.bind(sb);
  sb.from = (table) => {
    const qb = origFrom(table);
    if (guard) for (const m of ['update', 'insert', 'upsert', 'delete']) {
      const o = qb[m].bind(qb);
      qb[m] = (...args) => { const msg = guard(table, m); if (msg) { if (Date.now() - guardToast > 2500) { guardToast = Date.now(); toastFn(msg); } return blocked(msg); } return o(...args); };
    }
    if (SKIP.has(table)) return qb;
    // o que se lê fica guardado (só em memória) para saber os valores antigos sem perguntar outra vez
    const sel = qb.select.bind(qb);
    qb.select = (...args) => { const fb = sel(...args); if (fb.method === 'GET' || fb.method === 'HEAD') { const run = fb.then.bind(fb); fb.then = (ok, ko) => run((r) => { try { remember(table, r?.data); } catch { /* nada */ } return r; }).then(ok, ko); } return fb; };
    for (const m of ['update', 'insert', 'upsert', 'delete']) {
      const orig = qb[m].bind(qb);
      qb[m] = (...args) => hook(orig(...args), table, m, args[0]);
    }
    return qb;
  };
  window.addEventListener('keydown', onKey);
}

const sameFilters = (fb, q) => { fb.url.searchParams.forEach((v, k) => { if (!['select', 'columns', 'on_conflict'].includes(k)) q.url.searchParams.append(k, v); }); return q; };

function hook(fb, table, kind, values) {
  if (paused) return fb;
  const run = fb.then.bind(fb);
  let started = null;
  fb.then = (ok, ko) => {
    if (!started) {
      const key = rowKey(table, fb); const prev = chains.get(key);
      started = (prev ? prev.catch(() => {}) : Promise.resolve()).then(() => go());
      chains.set(key, started); inflight.add(started); pillState();
      started.finally(() => { if (chains.get(key) === started) chains.delete(key); inflight.delete(started); pillState(); }).catch(() => {});
    }
    return started.then(ok, ko);
  };
  const go = async () => {
    {
      let before = null; let cols = null;
      try {
        if (kind === 'update') {
          cols = Object.keys(values || {}).filter((k) => k !== 'updated_at');
          const ids = idsOf(fb);
          const hit = ids && ids.every((id) => { const r = cache.get(`${table}:${id}`); return r && cols.every((c) => c in r); });
          if (cols.length && hit) before = ids.map((id) => { const r = cache.get(`${table}:${id}`); const o = { id }; cols.forEach((c) => { o[c] = r[c]; }); return JSON.parse(JSON.stringify(o)); });
          else if (cols.length) { const { data } = await sameFilters(fb, origFrom(table).select(['id', ...cols].join(','))).limit(MAX_ROWS + 1); before = data; }
        } else if (kind === 'delete') {
          const { data } = await sameFilters(fb, origFrom(table).select('*')).limit(MAX_ROWS + 1); before = data;
        } else if (kind === 'upsert') {
          const ids = (Array.isArray(values) ? values : [values]).map((x) => x?.id).filter(Boolean);
          cols = [...new Set((Array.isArray(values) ? values : [values]).flatMap((x) => Object.keys(x || {})))].filter((k) => k !== 'updated_at' && k !== 'id');
          if (ids.length && ids.length <= MAX_ROWS) { const { data } = await origFrom(table).select('*').in('id', ids); before = data; }
        }
      } catch { before = null; }
      const res = await run((r) => r, (e) => ({ error: e }));
      try { if (!res?.error) record(table, kind, values, before, cols, res?.data); } catch { /* o desfazer nunca impede guardar */ }
      try {
        if (!res?.error) {
          if (kind === 'update') (idsOf(fb) || (before || []).map((r) => r.id)).forEach((id) => { const k = `${table}:${id}`; if (cache.has(k)) cache.set(k, { ...cache.get(k), ...JSON.parse(JSON.stringify(values || {})) }); });
          else if (kind === 'delete') (before || []).forEach((r) => cache.delete(`${table}:${r.id}`));
          else remember(table, res?.data);
          listeners.forEach((fn) => { try { fn(table, kind); } catch { /* nada */ } });
        }
      } catch { /* nada */ }
      return res;
    }
  };
  return fb;
}

function record(table, kind, values, before, cols, data) {
  let e = null;
  if (kind === 'update') {
    if (!before?.length || before.length > MAX_ROWS || !before[0].id) return;
    e = { table, op: 'restore', rows: before, cols };
  } else if (kind === 'delete') {
    if (!before?.length || before.length > MAX_ROWS || !before[0].id) return;
    e = { table, op: 'reinsert', rows: before };
  } else if (kind === 'insert') {
    const rows = Array.isArray(data) ? data : data ? [data] : (Array.isArray(values) ? values : [values]);
    const ids = rows.map((x) => x?.id).filter(Boolean);
    if (!ids.length) return;
    e = { table, op: 'remove', ids };
  } else if (kind === 'upsert') {
    const vals = Array.isArray(values) ? values : [values];
    const existing = new Map((before || []).map((r) => [r.id, r]));
    const newIds = vals.map((x) => x?.id).filter((id) => id && !existing.has(id));
    const rows = vals.map((x) => existing.get(x?.id)).filter(Boolean);
    if (!rows.length && !newIds.length) return;
    e = { table, op: 'multi', parts: [...(rows.length ? [{ table, op: 'restore', rows, cols }] : []), ...(newIds.length ? [{ table, op: 'remove', ids: newIds }] : [])] };
  }
  if (!e) return;
  e.at = Date.now();
  // escrever num campo: várias gravações seguidas do mesmo sítio contam como uma
  const last = past[past.length - 1];
  if (last && e.op === 'restore' && last.op === 'restore' && last.table === e.table && e.at - last.at < 4000
    && last.rows.length === e.rows.length && last.rows.every((r, i) => r.id === e.rows[i].id) && last.cols.join() === e.cols.join()) { last.at = e.at; return; }
  past.push(e); if (past.length > 80) past.shift();
  future.length = 0;
}

// aplica uma operação e devolve a contrária (para refazer)
async function apply(e) {
  if (e.op === 'multi') { const inv = []; for (const x of e.parts) inv.unshift(await apply(x)); return { table: e.table, op: 'multi', parts: inv }; }
  const ids = e.op === 'remove' ? e.ids : e.rows.map((r) => r.id);
  listeners.forEach((fn) => { try { fn(e.table, e.op); } catch { /* nada */ } });
  if (e.op === 'restore') {
    const { data: cur } = await origFrom(e.table).select(['id', ...e.cols].join(',')).in('id', ids);
    for (const r of e.rows) { const patch = {}; e.cols.forEach((c) => { patch[c] = r[c]; }); const { error } = await origFrom(e.table).update(patch).eq('id', r.id); if (error) throw error; remember(e.table, [{ ...patch, id: r.id }]); }
    return { table: e.table, op: 'restore', rows: cur || [], cols: e.cols };
  }
  if (e.op === 'reinsert') {
    const { error } = await origFrom(e.table).insert(e.rows); if (error) throw error; remember(e.table, e.rows);
    return { table: e.table, op: 'remove', ids };
  }
  if (e.op === 'remove') {
    const { data: cur } = await origFrom(e.table).select('*').in('id', ids);
    const { error } = await origFrom(e.table).delete().in('id', ids); if (error) throw error; ids.forEach((id) => cache.delete(`${e.table}:${id}`));
    return { table: e.table, op: 'reinsert', rows: cur || [] };
  }
  return null;
}

let busy = false;
async function step(from, to, label) {
  if (busy) return; const e = from.pop();
  if (!e) return toastFn(label === 'undo' ? 'Nada para desfazer.' : 'Nada para refazer.');
  busy = true;
  try {
    const inv = await apply(e);
    if (inv) { inv.at = 0; to.push(inv); }
    const what = NOUN[e.table] ? ` (${NOUN[e.table]})` : '';
    toastFn((label === 'undo' ? 'Desfeito' : 'Refeito') + what + '.');
    window.dispatchEvent(new HashChangeEvent('hashchange')); // volta a desenhar a página com os dados certos
  } catch (er) { toastFn('Não foi possível ' + (label === 'undo' ? 'desfazer' : 'refazer') + ': ' + (er.message || er)); }
  finally { busy = false; }
}
export const undo = () => step(past, future, 'undo');
export const redo = () => step(future, past, 'redo');

function onKey(e) {
  if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = e.key.toLowerCase(); if (k !== 'z' && k !== 'y') return;
  const a = document.activeElement;
  if (a && (/INPUT|TEXTAREA|SELECT/.test(a.tagName) || a.isContentEditable)) return; // dentro de um campo: o desfazer do próprio texto
  if (document.querySelector('#modal.open')) return;
  e.preventDefault();
  if (k === 'y' || e.shiftKey) redo(); else undo();
}
