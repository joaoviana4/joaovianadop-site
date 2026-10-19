import { sb, esc, toast, ICON } from './lib.js';

// Rodagem (etapa Produção): as folhas de serviço feitas na pré-produção, só para ler, com um visto por plano
// para marcar o que já foi filmado, e um resumo de cada dia. Os vistos ficam em shoot_marks (qualquer pessoa
// do projeto pode marcar); mudar a folha em si continua a ser na ferramenta Folha de serviço, para quem pode editar.

const fmtDay = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); const s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const sheetsOf = (b) => b.data?.sheets || (b.data?.rows ? [b.data] : []);
const shotLabel = (r, cols) => { const c = r.cells || {}; return [c.cena, c.efeito].filter(Boolean).join(' · ') || r.num || cols.map((x) => c[x.id]).find(Boolean) || 'Plano'; };

async function loadAll(p) {
  const [{ data: boards }, { data: marks }, { data: shots }] = await Promise.all([
    sb.from('boards').select('id, title, data, created_at').eq('project_id', p.id).eq('kind', 'callsheet').order('created_at'),
    sb.from('shoot_marks').select('*').eq('project_id', p.id),
    sb.from('shots').select('id').eq('project_id', p.id),
  ]);
  const days = [];
  (boards || []).forEach((b) => sheetsOf(b).forEach((sh, i) => days.push({ board: b, i, sh, rows: (sh.rows || []).filter((r) => r.kind !== 'band') })));
  days.sort((a, b) => (a.sh.date || '9999').localeCompare(b.sh.date || '9999') || a.i - b.i);
  return { boards: boards || [], days, marks: new Map((marks || []).map((m) => [`${m.board_id}:${m.row_id}`, m])), shots: shots || [] };
}

// planos do filme e quantos já foram filmados (cada plano conta uma vez, mesmo que volte a ser filmado noutro dia)
function totals(st) {
  const all = new Set(st.shots.map((s) => s.id)), done = new Set();
  st.days.forEach((d) => d.rows.forEach((r) => {
    const k = r.shot_id || `${d.board.id}:${r.id}`; all.add(k);
    if (st.marks.has(`${d.board.id}:${r.id}`)) done.add(k);
  }));
  return { total: all.size, filmed: [...done].filter((k) => all.has(k)).length };
}
export async function shootProgress(p) {
  try { const st = await loadAll(p); const t = totals(st); return { ...t, days: st.days.length, daysDone: st.days.filter((d) => d.rows.length && d.rows.every((r) => st.marks.has(`${d.board.id}:${r.id}`))).length }; } catch { return null; }
}

export async function rodagemPage(main, p, base) {
  main.innerHTML = '<p class="muted">A abrir as folhas de serviço…</p>';
  const st = await loadAll(p);
  const canEdit = p.canEdit !== false;
  let cur = 0, saved = null;
  try { saved = localStorage.getItem(`bg-rod:${p.id}`); } catch { /* nada */ }
  if (saved != null) cur = Math.max(0, Math.min(st.days.length - 1, Number(saved) || 0));
  // abre no primeiro dia com planos por filmar, se não houver um escolhido antes
  else { const i = st.days.findIndex((d) => d.rows.some((r) => !st.marks.has(`${d.board.id}:${r.id}`))); if (i > 0) cur = i; }
  const dayStats = (d) => { const done = d.rows.filter((r) => st.marks.has(`${d.board.id}:${r.id}`)).length; return { done, total: d.rows.length, left: d.rows.length - done }; };

  const draw = () => {
    if (!st.days.length) {
      main.innerHTML = `<h1 class="h1">Rodagem</h1><div class="empty-box"><p>Ainda não há folhas de serviço. Quando a pré-produção fizer a folha de serviço de cada dia, os dias aparecem aqui para marcares o que foi filmado.</p>${canEdit ? `<p class="muted small">Cria uma em Pré-produção: juntar ferramenta, Folha de serviço.</p>` : ''}</div>`;
      return;
    }
    const t = totals(st);
    const d = st.days[cur]; const s = dayStats(d); const cols = d.sh.cols || [];
    main.innerHTML = `<div class="row between wrap-gap"><div><span class="small muted">Produção</span><h1 class="h1">Rodagem</h1></div>
        ${canEdit ? `<a class="btn ghost" href="${base}/f/${d.board.id}" data-edit title="Abre a folha de serviço deste dia para mudar horários, planos ou elenco">${ICON.edit} Editar folha de serviço</a>` : ''}</div>
      <section class="panel rod-sum">
        <div class="rod-big"><strong>${pct(t.filmed, t.total)}%</strong><span>do filme filmado</span></div>
        <div class="rod-bar"><div class="bar ok"><i style="width:${pct(t.filmed, t.total)}%"></i></div>
          <div class="row between small muted"><span>${t.filmed} de ${t.total} planos filmados</span><span>${t.total - t.filmed === 1 ? 'falta 1 plano' : `faltam ${t.total - t.filmed} planos`}</span></div></div>
      </section>
      <div class="rod-days" role="tablist" aria-label="Dias de rodagem">${st.days.map((x, i) => { const y = dayStats(x); const full = y.total && !y.left;
        return `<button type="button" role="tab" class="rod-day ${i === cur ? 'on' : ''} ${full ? 'full' : ''}" aria-selected="${i === cur}" data-day="${i}">
          <b>Dia ${esc(x.sh.day || i + 1)}</b><small>${esc(x.sh.date ? fmtDay(x.sh.date) : 'sem data')}</small>
          <span class="rod-mini"><i style="width:${pct(y.done, y.total)}%"></i></span><small class="muted">${y.total ? `${y.done}/${y.total}${full ? ' ✓' : ''}` : 'sem planos'}</small></button>`; }).join('')}</div>
      <section class="panel rod-sheet">
        <div class="rod-h"><div><h2 class="h3">Dia ${esc(d.sh.day || cur + 1)}${d.sh.days ? ` de ${esc(d.sh.days)}` : ''}${d.sh.date ? ` · ${esc(fmtDay(d.sh.date))}` : ''}</h2>
          <p class="muted small">${[d.sh.call ? `Call ${esc(d.sh.call)}h` : '', esc(d.sh.place || ''), esc(d.sh.address || '')].filter(Boolean).join(' · ') || 'Sem local'}${st.boards.length > 1 ? ` · ${esc(d.board.title || 'Folha de serviço')}` : ''}</p></div>
          <div class="rod-daysum"><span><b>${s.total}</b> planeados</span><span class="ok"><b>${s.done}</b> filmados</span><span class="${s.left ? 'rod-late' : ''}"><b>${s.left}</b> por filmar</span><span><b>${pct(s.done, s.total)}%</b></span></div></div>
        ${(d.sh.times || []).some((x) => x.value) || (d.sh.cast || []).length ? `<div class="rod-info">${(d.sh.times || []).filter((x) => x.value).map((x) => `<span class="chip">${esc(x.label)} ${esc(x.value)}</span>`).join('')}${(d.sh.cast || []).filter((c) => c.name).map((c) => `<span class="chip">${esc(c.name)}${c.role ? ` · ${esc(c.role)}` : ''}${c.call ? ` · ${esc(c.call)}` : ''}</span>`).join('')}</div>` : ''}
        ${d.sh.notes ? `<p class="small rod-notes">${esc(d.sh.notes)}</p>` : ''}
        ${s.total ? `<div class="row between small"><span class="muted">Marca cada plano quando estiver filmado. Toda a equipa vê os vistos.</span>
            <span class="row">${s.left ? '<button type="button" class="link-btn" data-all="1">Marcar todos</button>' : ''}${s.done ? '<button type="button" class="link-btn" data-all="0">Tirar todos</button>' : ''}</span></div>` : ''}
        <div class="rod-table-wrap"><table class="rod-table"><thead><tr><th class="rod-ck"><span class="vh">Filmado</span></th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>
          ${(d.sh.rows || []).map((r) => {
            if (r.kind === 'band') return `<tr class="rod-band ${esc(r.tone || 'grey')}"><td colspan="${cols.length + 1}">${esc(r.text || '')}</td></tr>`;
            const m = st.marks.get(`${d.board.id}:${r.id}`);
            return `<tr class="${m ? 'filmed' : ''}" data-r="${esc(r.id)}"><td class="rod-ck"><button type="button" class="rod-check ${m ? 'on' : ''}" data-ck="${esc(r.id)}" aria-pressed="${!!m}" aria-label="${m ? 'Filmado. Tirar o visto' : 'Marcar como filmado'}: ${esc(shotLabel(r, cols))}" title="${m ? `Filmado${m.filmed_at ? ' às ' + new Date(m.filmed_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : ''}` : 'Marcar como filmado'}">${m ? ICON.done || '✓' : ''}</button></td>${cols.map((c) => `<td><span class="pre">${esc(r.cells?.[c.id] ?? '')}</span></td>`).join('')}</tr>`;
          }).join('') || `<tr><td colspan="${cols.length + 1}" class="muted">Esta folha ainda não tem planos.</td></tr>`}
        </tbody></table></div>
      </section>
      <section class="panel"><h2 class="h3">Resumo dos dias</h2>
        <table class="rod-resume"><thead><tr><th>Dia</th><th>Data</th><th>Local</th><th>Planeados</th><th>Filmados</th><th>Por filmar</th><th></th></tr></thead><tbody>
        ${st.days.map((x, i) => { const y = dayStats(x); return `<tr data-day="${i}" class="${i === cur ? 'on' : ''}"><td>Dia ${esc(x.sh.day || i + 1)}</td><td>${esc(x.sh.date ? fmtDay(x.sh.date) : '—')}</td><td>${esc(x.sh.place || '—')}</td><td>${y.total}</td><td>${y.done}</td><td class="${y.left ? 'rod-late' : ''}">${y.left}</td><td class="rod-rbar"><span class="rod-mini"><i style="width:${pct(y.done, y.total)}%"></i></span></td></tr>`; }).join('')}
        </tbody></table></section>`;
    bind();
  };
  const go = (i) => { cur = i; try { localStorage.setItem(`bg-rod:${p.id}`, i); } catch { /* nada */ } draw(); };
  const toggle = async (d, rows, on) => {
    const keys = rows.map((r) => `${d.board.id}:${r.id}`);
    const before = new Map(keys.map((k) => [k, st.marks.get(k)]));
    rows.forEach((r) => { const k = `${d.board.id}:${r.id}`; if (on) st.marks.set(k, { board_id: d.board.id, row_id: r.id, filmed_at: new Date().toISOString() }); else st.marks.delete(k); });
    draw();
    const q = on
      ? sb.from('shoot_marks').upsert(rows.map((r) => ({ board_id: d.board.id, row_id: r.id, project_id: p.id, shot_id: r.shot_id || null, sheet_index: d.i })), { onConflict: 'board_id,row_id' })
      : sb.from('shoot_marks').delete().eq('board_id', d.board.id).in('row_id', rows.map((r) => r.id));
    const { error } = await q;
    if (error) { before.forEach((v, k) => (v ? st.marks.set(k, v) : st.marks.delete(k))); draw(); toast('Não foi possível guardar o visto: ' + error.message); }
  };
  const bind = () => {
    main.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.day))));
    const d = st.days[cur]; if (!d) return;
    main.querySelectorAll('[data-ck]').forEach((b) => b.addEventListener('click', () => { const r = d.rows.find((x) => x.id === b.dataset.ck); if (r) toggle(d, [r], !st.marks.has(`${d.board.id}:${r.id}`)); }));
    main.querySelectorAll('[data-all]').forEach((b) => b.addEventListener('click', () => { const on = b.dataset.all === '1'; toggle(d, d.rows.filter((r) => st.marks.has(`${d.board.id}:${r.id}`) !== on), on); }));
    // a folha de serviço abre no mesmo dia
    main.querySelector('[data-edit]')?.addEventListener('click', () => { try { localStorage.setItem(`bg-cs-day:${d.board.id}`, d.i); } catch { /* nada */ } });
  };
  draw();
  // vistos de outras pessoas: volta a ler quando a janela regressa ao primeiro plano
  const onVis = async () => { if (!main.isConnected) return document.removeEventListener('visibilitychange', onVis); if (document.visibilityState !== 'visible') return; const { data } = await sb.from('shoot_marks').select('*').eq('project_id', p.id); if (data) { st.marks = new Map(data.map((m) => [`${m.board_id}:${m.row_id}`, m])); draw(); } };
  document.addEventListener('visibilitychange', onVis);
}
