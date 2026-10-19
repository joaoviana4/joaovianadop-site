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

export function installUndo(sb, toast) {
  if (origFrom) return; toastFn = toast;
  origFrom = sb.from.bind(sb);
  sb.from = (table) => {
    const qb = origFrom(table);
    if (SKIP.has(table)) return qb;
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
    if (!started) started = (async () => {
      let before = null; let cols = null;
      try {
        if (kind === 'update') {
          cols = Object.keys(values || {}).filter((k) => k !== 'updated_at');
          if (cols.length) { const { data } = await sameFilters(fb, origFrom(table).select(['id', ...cols].join(','))).limit(MAX_ROWS + 1); before = data; }
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
      return res;
    })();
    return started.then(ok, ko);
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
  if (e.op === 'restore') {
    const { data: cur } = await origFrom(e.table).select(['id', ...e.cols].join(',')).in('id', ids);
    for (const r of e.rows) { const patch = {}; e.cols.forEach((c) => { patch[c] = r[c]; }); const { error } = await origFrom(e.table).update(patch).eq('id', r.id); if (error) throw error; }
    return { table: e.table, op: 'restore', rows: cur || [], cols: e.cols };
  }
  if (e.op === 'reinsert') {
    const { error } = await origFrom(e.table).insert(e.rows); if (error) throw error;
    return { table: e.table, op: 'remove', ids };
  }
  if (e.op === 'remove') {
    const { data: cur } = await origFrom(e.table).select('*').in('id', ids);
    const { error } = await origFrom(e.table).delete().in('id', ids); if (error) throw error;
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
