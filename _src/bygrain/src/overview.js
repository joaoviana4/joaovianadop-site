import { sb, esc, toast, modal, ICON, dueInfo, fmtDate, initials, daysUntil, todayISO, state } from './lib.js';
import { loadPeople } from './tasks.js';
import { PROP_STATUS } from './propstatus.js';
import { trackHtml, musicStats } from './music.js';
import { mountLayout } from './layout.js';
import { hasMod } from './modules.js';
import { selPhase, currentPhase } from './phases.js';

// "Ponto de situação" do projeto: o que falta fazer e por quem, adereços em falta,
// questões de produção por decidir, departamentos e cronograma. Sem valores (esses ficam no Orçamento).

const READY = new Set(['pronto', 'comprado', 'alugado', 'emprestado', 'construido']);
const PH = [['pre', 'Pré-produção', '#7C5CFF'], ['prod', 'Rodagem', '#F08A24'], ['post', 'Pós-produção', '#2FB67C'], ['dist', 'Distribuição', '#1F8A8A']];
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
const av = (x) => (x ? `<span class="avatar sm" title="${esc(x.display_name)}" style="--c:${esc(x.color)}">${esc(initials(x.display_name))}</span>` : '<span class="avatar sm empty" title="Sem responsável"></span>');

function milestone(p, phases) {
  const t = todayISO();
  if (phases) {
    const [ps, pe] = phases.prod || [];
    if (ps && t < ps) return { big: `${daysUntil(ps)} dias`, label: `até à rodagem · ${fmtDate(ps)}` };
    if (ps && pe && t <= pe) return { big: 'Em rodagem', label: `até ${fmtDate(pe)}` };
    const end = phases.post?.[1];
    if (end && t <= end) return { big: `${daysUntil(end)} dias`, label: `até à entrega · ${fmtDate(end)}` };
  }
  if (p.ends_on) { const d = daysUntil(p.ends_on); return d >= 0 ? { big: `${d} dias`, label: `até à entrega · ${fmtDate(p.ends_on)}` } : { big: 'Prazo passado', label: fmtDate(p.ends_on), late: true }; }
  return { big: '—', label: 'Sem datas definidas' };
}

function timelineHtml(p, phases, items = []) {
  const s = phases?.pre?.[0] || p.starts_on, e = phases?.post?.[1] || p.ends_on;
  if (!s || !e || e <= s) return '<p class="muted small">Define as datas do projeto (ou cria um Cronograma) para veres as fases aqui.</p>';
  const T = (d) => new Date(d + 'T00:00:00').getTime();
  const pct = (d) => Math.max(0, Math.min(100, ((T(d) - T(s)) / (T(e) - T(s))) * 100));
  const today = todayISO();
  const bars = phases ? PH.map(([k, l, c]) => phases[k] ? `<div class="ov-ph" style="left:${pct(phases[k][0])}%;width:${Math.max(2, pct(phases[k][1]) - pct(phases[k][0]))}%;--g:${c}" title="${l}: ${fmtDate(phases[k][0])} – ${fmtDate(phases[k][1])}"><span>${l}</span></div>` : '').join('') : `<div class="ov-ph" style="left:0;width:100%;--g:#7C5CFF"><span>Projeto</span></div>`;
  const its = items.filter((x) => x.start).sort((a, b) => a.start.localeCompare(b.start));
  const marks = its.filter((x) => x.start >= s && x.start <= e).map((x) => `<i class="ov-ms" style="left:${pct(x.start)}%;--g:${esc(x.color || '#8A8A99')}" title="${esc(x.name || 'Data')}: ${fmtDate(x.start)}${x.end && x.end > x.start ? ' – ' + fmtDate(x.end) : ''}"></i>`).join('');
  return `<div class="ov-tl">${bars}${marks}${today >= s && today <= e ? `<i class="ov-today" style="left:${pct(today)}%"><span>Hoje</span></i>` : ''}</div>
    <div class="row between small muted"><span>${fmtDate(s)}</span><span>${fmtDate(e)}</span></div>
    ${phases || its.length ? `<ul class="ov-phl">${phases ? PH.map(([k, l, c]) => phases[k] ? `<li style="--g:${c}"><i></i><span>${l}</span><span class="muted">${fmtDate(phases[k][0])} – ${fmtDate(phases[k][1])}</span></li>` : '').join('') : ''}${its.map((x) => `<li class="ms" style="--g:${esc(x.color || '#8A8A99')}"><i></i><span>${esc(x.name || 'Data')}</span><span class="muted">${fmtDate(x.start)}${x.end && x.end > x.start ? ' – ' + fmtDate(x.end) : ''}</span></li>`).join('')}</ul>` : ''}`;
}

// ---------- mapa de rodagem: onde estamos (pré-rodagem, dia X de N, pausa, terminada) e os dias todos ----------
const dayLong = (iso) => { const d = new Date(iso + 'T00:00:00'); const s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const dayShort = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
export function shootStatus(shoot, today = todayISO()) {
  const L = shoot?.list || []; const n = L.length;
  if (!n) return { kind: 'none', big: 'Sem dias de rodagem', label: 'Os dias aparecem aqui quando houver folhas de serviço com planos.' };
  const lab = (d) => `Dia ${d.day || L.indexOf(d) + 1}`;
  const dated = L.filter((d) => d.date);
  const todayD = dated.find((d) => d.date === today);
  if (todayD) return { kind: 'today', cur: todayD, big: `${lab(todayD)} de ${n}`, label: `Hoje${todayD.place ? ` · ${todayD.place}` : ''}${todayD.call ? ` · call ${todayD.call}h` : ''}` };
  if (dated.length) {
    const first = dated[0], last = dated[dated.length - 1], next = dated.find((d) => d.date > today);
    const days = (iso) => Math.round((new Date(iso + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000);
    if (today < first.date) { const k = days(first.date); return { kind: 'pre', cur: first, big: 'Pré-rodagem', label: `${k === 1 ? 'Falta 1 dia' : `Faltam ${k} dias`} para o ${lab(first).toLowerCase()} · ${dayLong(first.date)}${first.place ? ` · ${first.place}` : ''}` }; }
    if (today > last.date && !L.some((d) => !d.date)) { const left = (shoot.total || 0) - (shoot.filmed || 0); return { kind: 'end', big: 'Rodagem terminada', label: left > 0 ? `${left === 1 ? 'Ficou 1 plano' : `Ficaram ${left} planos`} por marcar como filmado` : `${n} ${n === 1 ? 'dia' : 'dias'} filmados` }; }
    if (next) { const k = days(next.date); return { kind: 'pause', cur: next, big: 'Pausa na rodagem', label: `O ${lab(next).toLowerCase()} é ${k === 1 ? 'amanhã' : `daqui a ${k} dias`} · ${dayLong(next.date)}${next.place ? ` · ${next.place}` : ''}` }; }
  }
  // sem datas: o primeiro dia que ainda tem planos por filmar
  const open = L.find((d) => d.total && d.done < d.total);
  if (!open) return { kind: 'end', big: 'Rodagem terminada', label: 'Todos os planos das folhas estão marcados como filmados.' };
  const started = L.some((d) => d.done > 0);
  return { kind: started ? 'today' : 'pre', cur: open, big: started ? `${lab(open)} de ${n}` : 'Pré-rodagem', label: started ? `${open.total - open.done} ${open.total - open.done === 1 ? 'plano' : 'planos'} por filmar neste dia (sem data na folha de serviço)` : 'Ainda nenhum plano foi marcado como filmado. Junta as datas às folhas de serviço para o mapa contar os dias.' };
}
function shootMap(shoot, base) {
  const s = shootStatus(shoot); const L = shoot?.list || []; const today = todayISO();
  return `<section class="panel ov-map">
    <div class="row between wrap-gap"><div class="ovm-now ovm-${s.kind}"><span class="small muted">Mapa de rodagem</span><strong>${esc(s.big)}</strong><span>${esc(s.label)}</span></div>
      <a class="btn ghost" href="${base}/rodagem">Abrir a rodagem</a></div>
    ${L.length ? `<ol class="ovm-days">${L.map((d) => { const st = d.date === today ? 'today' : d.total && d.done === d.total ? 'done' : d.done ? 'part' : d.date && d.date < today ? 'late' : 'next'; const isCur = s.cur === d;
      return `<li class="ovm-d ${st} ${isCur ? 'cur' : ''}"><a href="${base}/rodagem" data-rday="${L.indexOf(d)}">
        <b>Dia ${esc(d.day || L.indexOf(d) + 1)}</b><small>${d.date ? esc(dayShort(d.date)) : 'sem data'}</small><small class="muted ovm-place">${esc(d.place || '')}</small>
        <span class="rod-mini"><i style="width:${d.total ? Math.round((d.done / d.total) * 100) : 0}%"></i></span><small class="muted">${d.total ? `${d.done}/${d.total} planos` : 'sem planos'}</small>
        ${st === 'today' ? '<em>Hoje</em>' : isCur && s.kind !== 'today' ? '<em>A seguir</em>' : st === 'late' ? '<em class="late">Por fechar</em>' : ''}</a></li>`; }).join('')}</ol>` : ''}
  </section>`;
}

export function situationData(p, tasksP) {
  const isMusic = hasMod(p, 'seguimento');
  return Promise.all([
    tasksP || sb.from('tasks').select('*').eq('project_id', p.id),
    sb.from('props').select('id, name, status, removed').eq('project_id', p.id),
    sb.from('project_questions').select('*').eq('project_id', p.id).order('created_at'),
    loadPeople(),
    sb.from('boards').select('id, data').eq('project_id', p.id).eq('kind', 'timeline').limit(1),
    isMusic ? musicStats(p.id) : Promise.resolve(null),
    import('./rodagem.js').then((m) => m.shootProgress(p)).catch(() => null),
  ]);
}
export async function mountSituation(box, p, base, { onChange } = {}) {
  box.innerHTML = '<p class="muted">A preparar o ponto de situação…</p>';
  const isMusic = hasMod(p, 'seguimento'); const withProps = hasMod(p, 'aderecos');
  const pre = p._preSit; p._preSit = null; // os dados pedidos pela visão geral só servem a primeira vez
  const [{ data: tasks }, { data: props }, { data: questions }, people, { data: tl }, ms, shoot] = await (pre || situationData(p));
  const st = { showResolved: false, questions: questions || [] };
  const all = tasks || [];
  const open = all.filter((t) => t.status !== 'done');
  const late = open.filter((t) => t.due && t.due < todayISO());
  const P = (props || []).filter((x) => !x.removed);
  const missing = P.filter((x) => !READY.has(x.status));
  const phases = tl?.[0]?.data?.phases || null;
  const depts = p.departments || [];
  const deptOf = (id) => depts.find((d) => d.id === id);
  const staff = people.filter((x) => x.role !== 'guest');
  const mile = milestone(p, phases);

  const draw = () => {
    const qOpen = st.questions.filter((q) => !q.resolved_at);
    const qDone = st.questions.filter((q) => q.resolved_at);
    // tarefas abertas agrupadas por pessoa (quem tem mais atrasadas primeiro)
    const groups = new Map();
    open.forEach((t) => { const k = t.assignee_id || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    const order = [...groups.entries()].sort(([a, x], [b, y]) => (a === '') - (b === '') || y.filter((t) => late.includes(t)).length - x.filter((t) => late.includes(t)).length || y.length - x.length);
    const doneN = all.length - open.length, sh = shoot && shoot.total ? shoot : null;
    // o resumo da rodagem é da etapa Produção (ou de "todas" quando o projeto já está a filmar)
    const ph = selPhase(p), inProd = ph === 'prod' || (ph === 'all' && currentPhase(p) === 'prod');
    box.innerHTML = `<div data-lay>
      <div data-blk="prog"><section class="panel ov-prog">
        <div class="ov-pg"><div class="row between"><a href="${base}/tarefas"><strong>Tarefas</strong></a><span class="muted small">${all.length ? `${open.length === 1 ? '1 por fazer' : `${open.length} por fazer`} · ${doneN} de ${all.length} feitas` : 'Ainda não há tarefas'}</span></div>
          <div class="bar big"><i style="width:${all.length ? Math.round((doneN / all.length) * 100) : 0}%"></i></div></div>
        ${inProd ? `<div class="ov-pg"><div class="row between"><a href="${base}/rodagem"><strong>Planos</strong></a><span class="muted small">${sh ? `${sh.total - sh.filmed === 1 ? 'falta 1 plano' : `faltam ${sh.total - sh.filmed} planos`} · ${sh.filmed} de ${sh.total} filmados` : 'Ainda não há planos'}</span></div>
          <div class="bar big ok"><i style="width:${sh ? Math.round((sh.filmed / sh.total) * 100) : 0}%"></i></div></div>
        <div class="ov-pg ov-film"><div class="row between"><strong>Filme</strong><span class="ov-pct">${sh ? Math.round((sh.filmed / sh.total) * 100) : 0}%</span></div>
          <div class="bar big film"><i style="width:${sh ? Math.round((sh.filmed / sh.total) * 100) : 0}%"></i></div>
          <span class="muted small">${sh ? `${shoot.daysDone} de ${shoot.days} ${shoot.days === 1 ? 'dia de rodagem fechado' : 'dias de rodagem fechados'}` : 'Os planos marcados como filmados na Rodagem contam aqui.'}</span></div>` : ''}
      </section></div>
      ${inProd ? `<div data-blk="mapa">${shootMap(shoot, base)}</div>` : ''}
      <div data-blk="kpis"><div class="ov-kpis">
        <a class="ov-kpi ${late.length ? 'warn' : ''}" href="${base}/tarefas"><span class="k-ic">${ICON.task}</span><strong>${open.length}</strong><span>${open.length === 1 ? 'tarefa por fazer' : 'tarefas por fazer'}</span>${late.length ? `<em>${plural(late.length, 'atrasada', 'atrasadas')}</em>` : all.length ? `<em class="ok">${all.length - open.length} de ${all.length} feitas</em>` : ''}</a>
        ${withProps ? `<a class="ov-kpi ${missing.length ? 'warn' : ''}" href="${base}/aderecos"><span class="k-ic">${ICON.prop}</span><strong>${missing.length}</strong><span>${missing.length === 1 ? 'adereço em falta' : 'adereços em falta'}</span>${P.length ? `<em class="${missing.length ? '' : 'ok'}">${P.length - missing.length} de ${P.length} prontos</em>` : '<em>sem lista ainda</em>'}</a>` : ''}
        <a class="ov-kpi ${qOpen.length ? 'warn' : ''}" href="#ov-q" data-jump><span class="k-ic">${ICON.question}</span><strong>${qOpen.length}</strong><span>${qOpen.length === 1 ? 'questão por decidir' : 'questões por decidir'}</span>${qDone.length ? `<em class="ok">${plural(qDone.length, 'resolvida', 'resolvidas')}</em>` : ''}</a>
        <div class="ov-kpi ${mile.late ? 'warn' : ''}"><span class="k-ic">${ICON.calendar || ICON.clock || ICON.task}</span><strong>${esc(mile.big)}</strong><span>${esc(mile.label)}</span></div>
        ${ms ? `<a class="ov-kpi" href="${base}/seguimento"><span class="k-ic">${ICON.music}</span><strong>${ms.scenes.length}</strong><span>${ms.scenes.length === 1 ? 'secção no seguimento' : 'secções no seguimento'}</span><em>${plural(ms.shots, 'plano', 'planos')}</em></a>` : ''}
      </div></div>

      ${ms && ms.scenes.length ? `<div data-blk="music"><section class="panel ov-music"><div class="row between"><h2 class="h3">Seguimento</h2><a class="small" href="${base}/seguimento">Abrir</a></div>${trackHtml(ms.scenes, p.music?.duration, { base, compact: true })}</section></div>` : ''}

        <div data-blk="who"><section class="panel ov-who">
          <div class="row between"><h2 class="h3">Quem tem o quê</h2><a class="small" href="${base}/tarefas">Todas as tarefas</a></div>
          ${order.length ? `<ul class="ov-people">${order.map(([uid, list]) => { const who = people.find((x) => x.id === uid); const l = list.filter((t) => late.includes(t)).length; const sorted = [...list].sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
            return `<li class="${uid ? '' : 'nobody'}">
              <div class="ovp-h">${av(who)}<strong>${uid ? esc(who?.display_name || 'Alguém') : 'Sem responsável'}</strong><span class="muted small">${plural(list.length, 'por fazer', 'por fazer')}</span>${l ? `<span class="due due-late">${plural(l, 'atrasada', 'atrasadas')}</span>` : ''}</div>
              <ul class="ovp-t">${sorted.slice(0, 3).map((t) => { const du = dueInfo(t.due, t.status); const d = deptOf(t.department); return `<li><a href="${base}/tarefas">${d ? `<i class="dot" style="--g:${esc(d.color)}"></i>` : '<i class="dot"></i>'}<span>${esc(t.title)}</span><span class="due due-${du.tone}">${esc(du.label)}</span></a></li>`; }).join('')}${sorted.length > 3 ? `<li class="muted small">e mais ${sorted.length - 3}…</li>` : ''}</ul>
            </li>`; }).join('')}</ul>`
          : `<div class="empty-box sm"><p>${all.length ? 'Está tudo feito.' : 'Ainda não há tarefas.'}</p><a class="btn ghost" href="${base}/tarefas">${ICON.plus} Distribuir tarefas</a></div>`}
        </section></div>

        <div data-blk="crono"><section class="panel"><h2 class="h3">Cronograma</h2>${timelineHtml(p, phases, tl?.[0]?.data?.items || [])}</section></div>
          ${depts.length ? `<div data-blk="depts"><section class="panel"><h2 class="h3">Por departamento</h2><ul class="ov-depts">${depts.map((d) => { const dt = all.filter((t) => t.department === d.id); const done = dt.filter((t) => t.status === 'done').length; const q = qOpen.filter((x) => x.department === d.id).length;
              return `<li style="--g:${esc(d.color)}"><div class="row between small"><span><i class="dot"></i>${esc(d.name)}</span><span class="muted">${dt.length ? `${done}/${dt.length}` : '—'}${q ? ` · ${plural(q, 'questão', 'questões')}` : ''}</span></div><div class="bar"><i style="width:${dt.length ? Math.round((done / dt.length) * 100) : 0}%"></i></div></li>`; }).join('')}</ul></section></div>` : ''}

        <div data-blk="questions"><section class="panel ov-q" id="ov-q">
          <div class="row between"><h2 class="h3">Questões de produção</h2><span class="muted small">o que ainda está por decidir</span></div>
          <form class="ov-qadd" data-qadd>
            <input name="text" placeholder="ex: Licença para filmar na rua? Confirmar o cão no set?" aria-label="Nova questão" autocomplete="off" required>
            ${depts.length ? `<select name="department" aria-label="Departamento"><option value="">Departamento</option>${depts.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select>` : ''}
            <select name="owner_id" aria-label="Quem trata"><option value="">Quem trata</option>${staff.map((x) => `<option value="${x.id}">${esc(x.display_name)}</option>`).join('')}</select>
            <button class="btn primary" aria-label="Juntar questão">${ICON.plus}</button>
          </form>
          ${qOpen.length ? `<ul class="ov-qs">${qOpen.map((q) => { const d = deptOf(q.department); const o = people.find((x) => x.id === q.owner_id); return `<li data-q="${q.id}">
              <button type="button" class="q-check" data-qact="resolve" aria-label="Marcar como resolvida">${ICON.circle || ''}</button>
              <span class="q-main"><span class="q-text">${esc(q.text)}</span><span class="q-meta">${d ? `<span class="t-dept" style="--dept:${esc(d.color)}"><i></i>${esc(d.name)}</span>` : ''}<span class="muted small">${fmtDate(q.created_at)}</span></span></span>
              ${av(o)}
              <button type="button" class="icon-btn sm" data-qact="del" aria-label="Apagar questão">${ICON.trash}</button></li>`; }).join('')}</ul>`
          : `<p class="muted small">${qDone.length ? 'Nada por decidir.' : 'Aponta aqui o que ainda tem de ser resolvido: autorizações, décors por confirmar, transportes, horários, dúvidas para o cliente…'}</p>`}
          ${qDone.length ? `<button type="button" class="link-btn" data-qact="toggle">${st.showResolved ? 'Esconder' : 'Ver'} as resolvidas (${qDone.length})</button>
            ${st.showResolved ? `<ul class="ov-qs done">${qDone.map((q) => `<li data-q="${q.id}"><button type="button" class="q-check on" data-qact="reopen" aria-label="Reabrir">${ICON.done || '✓'}</button><span class="q-main"><span class="q-text">${esc(q.text)}</span>${q.answer ? `<span class="q-ans">${esc(q.answer)}</span>` : ''}<span class="muted small">Resolvida a ${fmtDate(q.resolved_at)}</span></span></li>`).join('')}</ul>` : ''}` : ''}
        </section></div>

        ${withProps ? `<div data-blk="props"><section class="panel ov-props">
          <div class="row between"><h2 class="h3">Adereços em falta</h2><a class="small" href="${base}/aderecos">Todos os adereços</a></div>
          ${P.length ? `<div class="bar ok"><i style="width:${Math.round(((P.length - missing.length) / P.length) * 100)}%"></i></div>
            ${missing.length ? `<ul class="ov-pl">${missing.slice(0, 8).map((x) => { const s = PROP_STATUS.find((y) => y[0] === x.status) || PROP_STATUS[0]; return `<li><a href="${base}/aderecos/${x.id}"><span>${esc(x.name)}</span><span class="pstat" style="--c:${s[2]}">${esc(s[1])}</span></a></li>`; }).join('')}${missing.length > 8 ? `<li class="muted small">e mais ${missing.length - 8}…</li>` : ''}</ul>` : '<p class="muted small">Está tudo pronto.</p>'}`
          : `<p class="muted small">Ainda não há adereços.</p><a class="btn ghost" href="${base}/aderecos">${ICON.plus} Juntar adereços</a>`}
        </section></div>` : ''}
      </div>`;
    mountLayout(box.querySelector('[data-lay]'), { project: p, key: 'overview', title: 'vista geral', blocks: [
      { id: 'prog', label: 'Progresso', pos: 'full' }, { id: 'mapa', label: 'Mapa de rodagem', pos: 'full' }, { id: 'kpis', label: 'Números do projeto', pos: 'full' }, { id: 'music', label: 'Seguimento', pos: 'full' },
      { id: 'who', label: 'Quem tem o quê', pos: 'left' }, { id: 'crono', label: 'Cronograma', pos: 'right' }, { id: 'depts', label: 'Por departamento', pos: 'right' },
      { id: 'questions', label: 'Questões de produção', pos: 'left' }, { id: 'props', label: 'Adereços em falta', pos: 'right' },
    ] });
    bind();
  };

  const bind = () => {
    box.querySelectorAll('[data-rday]').forEach((a) => a.addEventListener('click', () => { try { localStorage.setItem(`bg-rod:${p.id}`, a.dataset.rday); } catch { /* nada */ } }));
    box.querySelector('[data-jump]')?.addEventListener('click', (e) => { e.preventDefault(); box.querySelector('#ov-q')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); box.querySelector('[data-qadd] input')?.focus({ preventScroll: true }); });
    box.querySelector('[data-qadd]').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = Object.fromEntries(new FormData(e.target));
      if (!f.text.trim()) return;
      const { data, error } = await sb.from('project_questions').insert({ project_id: p.id, text: f.text.trim(), department: f.department || null, owner_id: f.owner_id || null }).select().single();
      if (error) return toast(error.message);
      st.questions.push(data); draw(); box.querySelector('[data-qadd] input').focus();
    });
    box.querySelectorAll('[data-qact]').forEach((b) => b.addEventListener('click', async () => {
      const act = b.dataset.qact;
      if (act === 'toggle') { st.showResolved = !st.showResolved; return draw(); }
      const q = st.questions.find((x) => x.id === b.closest('[data-q]')?.dataset.q); if (!q) return;
      if (act === 'del') { const { error } = await sb.from('project_questions').delete().eq('id', q.id); if (error) return toast(error.message); st.questions.splice(st.questions.indexOf(q), 1); return draw(); }
      if (act === 'reopen') { const { error } = await sb.from('project_questions').update({ resolved_at: null }).eq('id', q.id); if (error) return toast(error.message); q.resolved_at = null; return draw(); }
      if (act === 'resolve') {
        const m = modal(`<h2>Resolvida</h2><p class="muted">${esc(q.text)}</p><form class="stack"><div class="field"><label for="qa">O que ficou decidido (opcional)</label><textarea id="qa" rows="3" placeholder="ex: Licença pedida à câmara, chega dia 20."></textarea></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Marcar como resolvida</button></div></form>`);
        m.el.querySelector('form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const patch = { resolved_at: new Date().toISOString(), answer: m.el.querySelector('#qa').value.trim() || null };
          const { error } = await sb.from('project_questions').update(patch).eq('id', q.id);
          if (error) return toast(error.message);
          Object.assign(q, patch); m.close(); draw(); toast('Resolvida. Fica em "Ver as resolvidas".');
        });
      }
    }));
  };
  draw();
  return { reload: () => mountSituation(box, p, base, { onChange }) };
}

export { state };
