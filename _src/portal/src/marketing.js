import { sb, esc, toast, modal, confirmBox, ICON, KINDS, fmtDate, initials, isStaff, saveLater } from './lib.js';
import { loadPeople } from './tasks.js';
import { isFolder } from './folders.js';

// Marketing: calendário de lançamentos e conteúdos de um projeto (sobretudo de um álbum).
// Cada item (TikTok, capa, teaser, lançamento…) tem data, estado, responsável, plataformas e uma página própria
// (notas, checklist e um board de ideias). Os itens "grandes" (ex.: videoclipe) são projetos: dentro de um álbum
// criam um projeto lá dentro e, no calendário, abrem esse projeto. Quem fica responsável recebe uma tarefa.
// Tabela: marketing_items.

export const MK = {
  videoclipe: { label: 'Videoclipe', color: '#7C5CFF', project: 'videoclipe' },
  visualizer: { label: 'Visualizer', color: '#9B6CFF', project: 'videoclipe' },
  lancamento: { label: 'Lançamento', color: '#E5484D' },
  teaser: { label: 'Teaser', color: '#F08A24' },
  tiktok: { label: 'TikTok', color: '#2AA8C9' },
  reels: { label: 'Reels', color: '#E5579B' },
  post: { label: 'Post', color: '#3CC98A' },
  story: { label: 'Story', color: '#7FB0FF' },
  capa: { label: 'Capa / artwork', color: '#E3B341' },
  imprensa: { label: 'Imprensa / entrevista', color: '#A0A0B0' },
  live: { label: 'Concerto / live', color: '#C8382D' },
  outro: { label: 'Outro', color: '#6E6E80' },
};
export const MK_STATUS = [['ideia', 'Ideia'], ['producao', 'Em produção'], ['pronto', 'Pronto'], ['agendado', 'Agendado'], ['publicado', 'Publicado']];
const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Spotify', 'Facebook', 'Imprensa', 'Rádio'];
const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const kindOf = (k) => MK[k] || MK.outro;
const stLabel = (s) => (MK_STATUS.find((x) => x[0] === s) || MK_STATUS[0])[1];
const pad = (n) => String(n).padStart(2, '0');
const isoD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const todayISO = () => isoD(new Date());
const ui = { view: 'mes', ym: todayISO().slice(0, 7), kind: '', who: '' };
try { Object.assign(ui, JSON.parse(localStorage.getItem('bg-mkt-ui') || '{}'), { ym: todayISO().slice(0, 7) }); } catch { /* nada */ }
const saveUi = () => { try { localStorage.setItem('bg-mkt-ui', JSON.stringify({ view: ui.view, kind: ui.kind, who: ui.who })); } catch { /* nada */ } };

// itens do projeto e dos projetos dentro dele (num álbum vê-se tudo junto)
async function load(p) {
  const { data: kids } = isFolder(p) ? await sb.from('projects').select('id, name, kind, ends_on, starts_on, status').eq('parent_id', p.id).is('deleted_at', null) : { data: [] };
  const ids = [p.id, ...(kids || []).map((k) => k.id)];
  const [{ data: items, error }, people] = await Promise.all([
    sb.from('marketing_items').select('*').in('project_id', ids).order('date', { ascending: true, nullsFirst: false }).order('created_at'),
    loadPeople(),
  ]);
  if (error) toast(error.message);
  return { items: items || [], kids: kids || [], people: people.filter((x) => x.role !== 'guest') };
}

// projetos da pasta que ainda não estão no calendário entram sozinhos (com a data de entrega, se tiverem)
async function syncKids(p, D) {
  if (!isFolder(p) || !isStaff()) return false;
  const linked = new Set(D.items.map((i) => i.linked_project_id).filter(Boolean));
  const missing = D.kids.filter((k) => !linked.has(k.id));
  if (!missing.length) return false;
  const rows = missing.map((k) => ({ project_id: p.id, title: k.name, kind: MK[k.kind] ? k.kind : 'videoclipe', date: k.ends_on || null, status: k.status === 'done' ? 'publicado' : 'producao', linked_project_id: k.id }));
  const { error } = await sb.from('marketing_items').insert(rows).setHeader('x-client-info', 'portal-auto'); // automático: não vai para a Atividade
  return !error;
}

// quem fica responsável recebe uma tarefa (com aviso no telemóvel); acompanha a data, o nome e o estado
async function syncTask(it, hostId) {
  const title = `${kindOf(it.kind).label}: ${it.title}`;
  const status = it.status === 'publicado' ? 'done' : 'todo';
  if (!it.assignee_id) {
    if (it.task_id) { await sb.from('tasks').delete().eq('id', it.task_id); await sb.from('marketing_items').update({ task_id: null }).eq('id', it.id); it.task_id = null; }
    return;
  }
  if (it.task_id) {
    const { data } = await sb.from('tasks').update({ title, assignee_id: it.assignee_id, due: it.date || null, status }).eq('id', it.task_id).select('id');
    if (data?.length) return;
  }
  const { data: t, error } = await sb.from('tasks').insert({ project_id: it.linked_project_id || hostId, title, assignee_id: it.assignee_id, due: it.date || null, status, department: 'digital', entity_type: 'marketing', entity_id: it.id }).select('id').single();
  if (!error && t) { await sb.from('marketing_items').update({ task_id: t.id }).eq('id', it.id); it.task_id = t.id; }
}

// ---------- página Marketing ----------
export async function marketingPage(main, p, sub, base) {
  if (sub) return itemPage(main, p, sub, base);
  main.innerHTML = '<p class="muted">A carregar o calendário…</p>';
  let D = await load(p);
  if (await syncKids(p, D)) D = await load(p);
  const go = (h) => { location.hash = h; };
  const draw = () => {
    const list = D.items.filter((i) => (!ui.kind || i.kind === ui.kind) && (!ui.who || i.assignee_id === ui.who));
    const undated = list.filter((i) => !i.date);
    const person = (id) => D.people.find((x) => x.id === id);
    const chip = (i) => { const k = kindOf(i.kind); const who = person(i.assignee_id); return `<button type="button" class="mk-chip st-${i.status}" draggable="true" data-it="${i.id}" style="--mk:${k.color}" title="${esc(`${k.label} · ${i.title} · ${stLabel(i.status)}${who ? ' · ' + who.display_name : ''}`)}"><i></i><span>${esc(i.title)}</span>${i.linked_project_id ? `<em>${ICON.open}</em>` : ''}${who ? `<b class="avatar xs" style="--c:${esc(who.color)}">${esc(initials(who.display_name))}</b>` : ''}</button>`; };
    const [y, m] = ui.ym.split('-').map(Number);
    let body = '';
    if (ui.view === 'mes') {
      const first = new Date(y, m - 1, 1); const start = new Date(first); start.setDate(1 - ((first.getDay() + 6) % 7));
      const cells = []; for (let d = new Date(start); cells.length < 42; d.setDate(d.getDate() + 1)) cells.push(new Date(d));
      const weeks = cells.slice(35).every((d) => d.getMonth() !== m - 1) ? cells.slice(0, 35) : cells;
      body = `<div class="mk-cal"><div class="mk-dow">${DIAS.map((d) => `<span>${d}</span>`).join('')}</div><div class="mk-grid">${weeks.map((d) => { const iso = isoD(d); const its = list.filter((i) => i.date === iso); return `<div class="mk-day ${d.getMonth() !== m - 1 ? 'out' : ''} ${iso === todayISO() ? 'today' : ''}" data-day="${iso}"><div class="mk-dn"><span>${d.getDate()}</span>${isStaff() ? `<button type="button" class="mk-add" data-addday="${iso}" aria-label="Juntar a ${d.getDate()}">${ICON.plus}</button>` : ''}</div>${its.map(chip).join('')}</div>`; }).join('')}</div></div>`;
    } else {
      // roll-out: por semana, do mais próximo para a frente
      const dated = list.filter((i) => i.date).sort((a, b) => a.date.localeCompare(b.date));
      const wk = (iso) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return isoD(d); };
      const weeks = [...new Set(dated.map((i) => wk(i.date)))];
      body = weeks.length ? `<div class="mk-roll">${weeks.map((w) => { const end = new Date(w + 'T12:00:00'); end.setDate(end.getDate() + 6); return `<section class="mk-week ${isoD(end) < todayISO() ? 'past' : ''}"><h3>Semana de ${fmtDate(w)}</h3><ul>${dated.filter((i) => wk(i.date) === w).map((i) => { const k = kindOf(i.kind); const who = person(i.assignee_id); return `<li class="mk-row" data-it="${i.id}" style="--mk:${k.color}"><span class="mk-date">${fmtDate(i.date)}</span><span class="mk-kind"><i></i>${esc(k.label)}</span><b>${esc(i.title)}</b>${i.linked_project_id ? `<small class="muted">projeto ${ICON.open}</small>` : ''}<span class="mk-st st-${i.status}">${stLabel(i.status)}</span><span class="mk-who">${who ? `<b class="avatar xs" style="--c:${esc(who.color)}">${esc(initials(who.display_name))}</b>${esc(who.display_name)}` : '<span class="muted">sem responsável</span>'}</span>${(i.platforms || []).length ? `<small class="muted">${esc(i.platforms.join(' · '))}</small>` : ''}</li>`; }).join('')}</ul></section>`; }).join('')}</div>` : '<p class="empty-note">Ainda não há nada com data. Junta o primeiro lançamento.</p>';
    }
    const counts = Object.keys(MK).map((k) => [k, D.items.filter((i) => i.kind === k).length]).filter(([, n]) => n);
    main.innerHTML = `
      <div class="row between wrap-gap"><div><h1 class="h1 pm-title">Marketing</h1><p class="muted">Quando e como sai cada coisa: lançamentos, videoclipes, teasers, TikToks, capas… Cada um tem responsável e página própria; os videoclipes abrem o projeto.</p></div>
        ${isStaff() ? `<button type="button" class="btn primary" data-new>${ICON.plus} Novo</button>` : ''}</div>
      <div class="row wrap-gap mk-bar">
        <div class="seg dark" role="tablist"><button type="button" role="tab" aria-selected="${ui.view === 'mes'}" data-v="mes">Calendário</button><button type="button" role="tab" aria-selected="${ui.view === 'lista'}" data-v="lista">Roll-out</button></div>
        ${ui.view === 'mes' ? `<div class="month-nav"><button type="button" class="icon-btn" data-m="-1" aria-label="Mês anterior">${ICON.back}</button><strong>${MES[m - 1]} ${y}</strong><button type="button" class="icon-btn" data-m="1" aria-label="Mês seguinte">${ICON.chev}</button><button type="button" class="link-btn" data-m="0">Hoje</button></div>` : ''}
        <label class="sel"><span class="vh">Tipo</span><select data-fk><option value="">Todos os tipos</option>${counts.map(([k, n]) => `<option value="${k}" ${ui.kind === k ? 'selected' : ''}>${esc(MK[k].label)} (${n})</option>`).join('')}</select></label>
        <label class="sel"><span class="vh">Responsável</span><select data-fw><option value="">Todas as pessoas</option>${D.people.map((x) => `<option value="${x.id}" ${ui.who === x.id ? 'selected' : ''}>${esc(x.display_name)}</option>`).join('')}</select></label>
      </div>
      <div class="mk-wrap ${undated.length ? 'has-side' : ''}">
        <div class="mk-main">${body}</div>
        ${undated.length ? `<aside class="mk-side" data-day=""><h3>Sem data <span class="muted">${undated.length}</span></h3><p class="muted small">Arrasta para um dia do calendário.</p>${undated.map(chip).join('')}</aside>` : ''}
      </div>
      <div class="mk-legend">${counts.map(([k]) => `<span style="--mk:${MK[k].color}"><i></i>${esc(MK[k].label)}</span>`).join('')}</div>`;
    main.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { ui.view = b.dataset.v; saveUi(); draw(); }));
    main.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { if (b.dataset.m === '0') ui.ym = todayISO().slice(0, 7); else { const d = new Date(y, m - 1 + +b.dataset.m, 1); ui.ym = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; } draw(); }));
    main.querySelector('[data-fk]').addEventListener('change', (e) => { ui.kind = e.target.value; saveUi(); draw(); });
    main.querySelector('[data-fw]').addEventListener('change', (e) => { ui.who = e.target.value; saveUi(); draw(); });
    main.querySelector('[data-new]')?.addEventListener('click', () => itemForm(p, D, null, { date: null }, reload));
    main.querySelectorAll('[data-addday]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); itemForm(p, D, null, { date: b.dataset.addday }, reload); }));
    // abrir: videoclipes vão para o projeto; o resto para a página do item
    main.querySelectorAll('[data-it]').forEach((el) => el.addEventListener('click', () => { const it = D.items.find((x) => x.id === el.dataset.it); if (!it) return; go(it.linked_project_id ? `#/p/${it.linked_project_id}` : `${base}/marketing/${it.id}`); }));
    // arrastar para mudar a data
    if (isStaff()) {
      main.querySelectorAll('.mk-chip').forEach((c) => c.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/mk', c.dataset.it); e.dataTransfer.effectAllowed = 'move'; c.classList.add('dragging'); }));
      main.querySelectorAll('[data-day]').forEach((d) => {
        d.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('text/mk')) { e.preventDefault(); d.classList.add('drop'); } });
        d.addEventListener('dragleave', () => d.classList.remove('drop'));
        d.addEventListener('drop', async (e) => {
          e.preventDefault(); d.classList.remove('drop');
          const it = D.items.find((x) => x.id === e.dataTransfer.getData('text/mk')); if (!it) return;
          const date = d.dataset.day || null; if (it.date === date) return;
          it.date = date; draw();
          const { error } = await sb.from('marketing_items').update({ date, updated_at: new Date().toISOString() }).eq('id', it.id);
          if (error) return toast(error.message);
          if (it.linked_project_id && date) await sb.from('projects').update({ ends_on: date }).eq('id', it.linked_project_id);
          syncTask(it, p.id);
        });
      });
    }
  };
  const reload = async () => { D = await load(p); draw(); };
  draw();
}

// ---------- novo / editar ----------
function itemForm(p, D, it, preset, after) {
  const isNew = !it; it = it || { title: '', kind: 'tiktok', date: preset.date, status: 'ideia', assignee_id: null, platforms: [], linked_project_id: null, notes: '' };
  const folder = isFolder(p);
  const m = modal(`<h2>${isNew ? 'Novo no calendário' : esc(it.title)}</h2>
    <form class="stack" data-f>
      <div class="field"><span class="label">Tipo</span><div class="mk-kinds">${Object.entries(MK).map(([k, v]) => `<label><input type="radio" name="kind" value="${k}" ${k === it.kind ? 'checked' : ''}><span style="--mk:${v.color}"><i></i>${esc(v.label)}</span></label>`).join('')}</div></div>
      <div class="grid2"><div class="field"><label for="mt">Nome</label><input id="mt" name="title" value="${esc(it.title)}" required placeholder="Ex.: Teaser do refrão"></div>
        <div class="field"><label for="md">Data</label><input id="md" type="date" name="date" value="${esc(it.date || '')}"></div>
        <div class="field"><label for="ms">Estado</label><select id="ms" name="status">${MK_STATUS.map(([k, l]) => `<option value="${k}" ${k === it.status ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="field"><label for="ma">Responsável</label><select id="ma" name="assignee_id"><option value="">— ninguém —</option>${D.people.map((x) => `<option value="${x.id}" ${x.id === it.assignee_id ? 'selected' : ''}>${esc(x.display_name)}</option>`).join('')}</select></div></div>
      <fieldset class="dpick"><legend>Plataformas</legend>${PLATFORMS.map((pl) => `<label><input type="checkbox" name="pl" value="${pl}" ${(it.platforms || []).includes(pl) ? 'checked' : ''}><span style="--dc:#5B7CFF">${pl}</span></label>`).join('')}</fieldset>
      <div class="field" data-projf hidden><label for="mp">Projeto</label><select id="mp" name="proj">${folder && isNew ? '<option value="new">Criar um projeto novo dentro deste álbum</option>' : ''}<option value="">— nenhum —</option>${D.kids.map((k) => `<option value="${k.id}" ${k.id === it.linked_project_id ? 'selected' : ''}>${esc(k.name)}</option>`).join('')}</select><small class="muted">Os videoclipes são projetos: no calendário abrem o projeto${folder ? ' e aparecem na página principal do álbum' : ''}.</small></div>
      ${isNew ? '' : '<div class="field"><label for="mn">Notas</label><textarea id="mn" name="notes" rows="3">' + esc(it.notes || '') + '</textarea></div>'}
      <div class="row between">${isNew ? '<span></span>' : `<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar</button>`}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">${isNew ? 'Juntar' : 'Guardar'}</button></div></div>
    </form>`, { wide: true });
  const f = m.el.querySelector('[data-f]');
  const projF = m.el.querySelector('[data-projf]');
  const syncKind = () => { const k = f.elements.kind.value; projF.hidden = !MK[k]?.project; };
  f.addEventListener('change', (e) => { if (e.target.name === 'kind') syncKind(); });
  syncKind();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f)); const pls = new FormData(f).getAll('pl');
    const row = { title: v.title.trim(), kind: v.kind, date: v.date || null, status: v.status, assignee_id: v.assignee_id || null, platforms: pls, updated_at: new Date().toISOString(), ...(isNew ? {} : { notes: v.notes || '' }) };
    if (MK[v.kind]?.project) {
      if (v.proj === 'new') {
        const { data: np, error } = await sb.from('projects').insert({ name: row.title, client: p.client || '', kind: MK[v.kind].project, parent_id: p.id, ends_on: row.date }).select('id').single();
        if (error) return toast(error.message);
        row.linked_project_id = np.id;
      } else row.linked_project_id = v.proj || null;
    } else if (!isNew) row.linked_project_id = it.linked_project_id && MK[it.kind]?.project ? null : it.linked_project_id;
    let saved;
    if (isNew) { const { data, error } = await sb.from('marketing_items').insert({ project_id: p.id, ...row }).select().single(); if (error) return toast(error.message); saved = data; }
    else { const { data, error } = await sb.from('marketing_items').update(row).eq('id', it.id).select().single(); if (error) return toast(error.message); saved = data; }
    if (saved.linked_project_id && saved.date) await sb.from('projects').update({ ends_on: saved.date }).eq('id', saved.linked_project_id);
    await syncTask(saved, p.id);
    m.close(); toast(isNew ? (row.linked_project_id && v.proj === 'new' ? 'Juntado ao calendário e criado o projeto dentro do álbum.' : 'Juntado ao calendário.') : 'Guardado.');
    after && after(saved);
  });
  m.el.querySelector('[data-del]')?.addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar "${it.title}" do calendário?${it.linked_project_id ? ' O projeto continua a existir.' : ''}`, 'Apagar'))) return;
    if (it.task_id) await sb.from('tasks').delete().eq('id', it.task_id);
    const { error } = await sb.from('marketing_items').delete().eq('id', it.id); if (error) return toast(error.message);
    m.close(); after && after(null);
  });
}

// ---------- página de um item (TikTok, capa, teaser…) ----------
async function itemPage(main, p, id, base) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const [{ data: it }, people] = await Promise.all([sb.from('marketing_items').select('*').eq('id', id).maybeSingle(), loadPeople()]);
  if (!it) { main.innerHTML = `<p class="empty-note">Este item já não existe. <a href="${base}/marketing">Voltar ao Marketing</a></p>`; return; }
  if (it.linked_project_id) { location.hash = `#/p/${it.linked_project_id}`; return; }
  const staff = people.filter((x) => x.role !== 'guest');
  const save = async (patch, quiet = true) => { Object.assign(it, patch); const { error } = await sb.from('marketing_items').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', it.id); if (error) return toast(error.message); if (['date', 'assignee_id', 'status', 'title', 'kind'].some((k) => k in patch)) syncTask(it, it.project_id); if (!quiet) toast('Guardado.'); };
  const draw = () => {
    const k = kindOf(it.kind); const done = (it.checklist || []).filter((c) => c.done).length;
    main.innerHTML = `
      <a class="fold-up" href="${base}/marketing">${ICON.back} Marketing</a>
      <div class="mk-item-head" style="--mk:${k.color}"><span class="mk-kind big"><i></i>${esc(k.label)}</span>
        <h1 class="h1"><input class="title-in" data-title value="${esc(it.title)}" aria-label="Nome"></h1></div>
      <section class="panel mk-fields">
        <label class="field"><span class="label">Data</span><input type="date" data-k="date" value="${esc(it.date || '')}"></label>
        <label class="field"><span class="label">Estado</span><select data-k="status">${MK_STATUS.map(([s, l]) => `<option value="${s}" ${s === it.status ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Responsável</span><select data-k="assignee_id"><option value="">— ninguém —</option>${staff.map((x) => `<option value="${x.id}" ${x.id === it.assignee_id ? 'selected' : ''}>${esc(x.display_name)}</option>`).join('')}</select></label>
        <label class="field"><span class="label">Tipo</span><select data-k="kind">${Object.entries(MK).filter(([, v]) => !v.project).map(([kk, v]) => `<option value="${kk}" ${kk === it.kind ? 'selected' : ''}>${esc(v.label)}</option>`).join('')}</select></label>
        <fieldset class="dpick mk-pl"><legend>Plataformas</legend>${PLATFORMS.map((pl) => `<label><input type="checkbox" data-pl value="${pl}" ${(it.platforms || []).includes(pl) ? 'checked' : ''}><span style="--dc:#5B7CFF">${pl}</span></label>`).join('')}</fieldset>
      </section>
      <div class="mk-cols">
        <section class="panel"><h2 class="h3">Notas e texto</h2><p class="muted small">Ideia, legenda, hashtags, música, referências…</p><textarea class="mk-notes" data-notes rows="10" placeholder="Escreve aqui…">${esc(it.notes || '')}</textarea></section>
        <section class="panel"><div class="row between"><h2 class="h3">Checklist</h2><span class="muted small">${done}/${(it.checklist || []).length}</span></div>
          <ul class="mk-check">${(it.checklist || []).map((c, i) => `<li class="${c.done ? 'done' : ''}"><label class="check"><input type="checkbox" data-ci="${i}" ${c.done ? 'checked' : ''}><span>${esc(c.t)}</span></label><button type="button" class="icon-btn sm" data-cx="${i}" aria-label="Tirar">${ICON.close}</button></li>`).join('')}</ul>
          <form class="row" data-cadd><input name="t" placeholder="Ex.: gravar voz off" aria-label="Novo ponto" autocomplete="off"><button class="btn ghost">${ICON.plus}</button></form>
          <hr class="mk-hr"><h2 class="h3">Board</h2><p class="muted small">Referências, imagens, guião do vídeo — num board em ecrã inteiro.</p>
          <button type="button" class="btn primary" data-board>${ICON.board} ${it.board_id ? 'Abrir o board' : 'Criar o board'}</button></section>
      </div>
      ${isStaff() ? `<div class="row end"><button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar do calendário</button></div>` : ''}`;
    const ti = main.querySelector('[data-title]');
    ti.addEventListener('change', () => { const v = ti.value.trim(); if (v && v !== it.title) save({ title: v }); });
    main.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('change', () => { save({ [el.dataset.k]: el.value || null }); if (el.dataset.k === 'kind') draw(); }));
    main.querySelectorAll('[data-pl]').forEach((el) => el.addEventListener('change', () => save({ platforms: [...main.querySelectorAll('[data-pl]:checked')].map((x) => x.value) })));
    const na = main.querySelector('[data-notes]'); const nl = saveLater(() => save({ notes: na.value }), 600);
    na.addEventListener('input', () => nl());
    main.querySelectorAll('[data-ci]').forEach((el) => el.addEventListener('change', () => { const cl = [...(it.checklist || [])]; cl[+el.dataset.ci] = { ...cl[+el.dataset.ci], done: el.checked }; save({ checklist: cl }); draw(); }));
    main.querySelectorAll('[data-cx]').forEach((el) => el.addEventListener('click', () => { const cl = [...(it.checklist || [])]; cl.splice(+el.dataset.cx, 1); save({ checklist: cl }); draw(); }));
    main.querySelector('[data-cadd]').addEventListener('submit', (e) => { e.preventDefault(); const t = e.target.t.value.trim(); if (!t) return; save({ checklist: [...(it.checklist || []), { t, done: false }] }); draw(); main.querySelector('[data-cadd] input')?.focus(); });
    main.querySelector('[data-board]').addEventListener('click', async () => {
      if (!it.board_id) {
        const { data: b, error } = await sb.from('boards').insert({ project_id: it.project_id, title: `${kindOf(it.kind).label}: ${it.title}`, kind: 'mkt', data: { item: it.id } }).select('id').single();
        if (error) return toast(error.message);
        await save({ board_id: b.id });
      }
      location.hash = `#/p/${it.project_id}/b/${it.board_id}`;
    });
    main.querySelector('[data-del]')?.addEventListener('click', async () => {
      if (!(await confirmBox(`Apagar "${it.title}" do calendário?`, 'Apagar'))) return;
      if (it.task_id) await sb.from('tasks').delete().eq('id', it.task_id);
      const { error } = await sb.from('marketing_items').delete().eq('id', it.id); if (error) return toast(error.message);
      location.hash = `${base}/marketing`;
    });
  };
  draw();
}

// próximos lançamentos (para a visão geral do projeto / álbum)
export async function upcomingBox(box, p, base) {
  const ids = [p.id];
  if (isFolder(p)) { const { data } = await sb.from('projects').select('id').eq('parent_id', p.id).is('deleted_at', null); (data || []).forEach((k) => ids.push(k.id)); }
  const { data } = await sb.from('marketing_items').select('id, title, kind, date, status, linked_project_id').in('project_id', ids).gte('date', todayISO()).order('date').limit(6);
  if (!data?.length) { box.remove(); return; }
  box.innerHTML = `<div class="row between"><h2 class="h3">Próximos lançamentos</h2><a href="${base}/marketing" class="small">Abrir o Marketing</a></div>
    <ul class="mk-up">${data.map((i) => { const k = kindOf(i.kind); return `<li style="--mk:${k.color}"><a href="${i.linked_project_id ? `#/p/${i.linked_project_id}` : `${base}/marketing/${i.id}`}"><span class="mk-date">${fmtDate(i.date)}</span><span class="mk-kind"><i></i>${esc(k.label)}</span><b>${esc(i.title)}</b><span class="mk-st st-${i.status}">${stLabel(i.status)}</span></a></li>`; }).join('')}</ul>`;
}
