import { DB_SCHEMA, sb, esc, state, fmtDate, ICON, confirmBox, toast } from './lib.js';
import { mountTasks, loadPeople } from './tasks.js';

// Tarefas e notas de uma página (cena, secção, plano, personagem, décor, adereço…): em vez de caixas na página,
// dois botões no topo ("Tarefas 3", "Notas 2") que abrem uma janela ao centro.
// Notas: cada pessoa tem as suas; cada nota é "Só eu" ou "Toda a equipa" (tabela page_notes, com RLS).
// legacy: o campo de notas antigo da página (partilhado), { get, save } — aparece como "Nota da página" se tiver texto.

const filled = (v) => v != null && String(v).trim() !== '';

// janela ao centro própria (não usa o #modal, para que editar uma tarefa possa abrir por cima)
export function sheet(title, { wide = false, onClose } = {}) {
  const el = document.createElement('div'); el.className = 'pp-over';
  el.innerHTML = `<div class="pp-back"></div><div class="pp-box ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><header class="pp-h"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-ppx aria-label="Fechar" title="Fechar (Esc)">${ICON.close}</button></header><div class="pp-b"></div></div>`;
  document.body.append(el);
  let done = false;
  const close = () => { if (done) return; done = true; el.remove(); document.removeEventListener('keydown', onKey, true); window.removeEventListener('hashchange', close); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape' && !document.querySelector('#modal.open')) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close);
  el.querySelector('.pp-back').addEventListener('click', close);
  el.querySelector('[data-ppx]').addEventListener('click', close);
  return { body: el.querySelector('.pp-b'), el, close };
}

// box: onde ficam os botões (normalmente no topo da página, à direita)
export function pageButtons(box, p, { type, id, label = '', legacy = null }) {
  if (!box || !id) return null;
  box.classList.add('pp-btns');
  box.innerHTML = `<button type="button" class="pp-btn" data-ppt title="Tarefas desta página">${ICON.task}<span>Tarefas</span><b data-nt></b></button><button type="button" class="pp-btn" data-ppn title="Notas desta página">${ICON.note}<span>Notas</span><b data-nn></b></button>`;
  const counts = async () => {
    const [t, n] = await Promise.all([
      sb.from('tasks').select('id', { count: 'exact', head: true }).eq('entity_id', id).neq('status', 'done'),
      sb.from('page_notes').select('id', { count: 'exact', head: true }).eq('entity_id', id),
    ]);
    if (!document.body.contains(box)) return;
    const nn = (n.count || 0) + (legacy && filled(legacy.get()) ? 1 : 0);
    box.querySelector('[data-nt]').textContent = t.count ? String(t.count) : '';
    box.querySelector('[data-nn]').textContent = nn ? String(nn) : '';
  };
  const onAdded = (e) => { if (!document.body.contains(box)) { window.removeEventListener('portal-task-added', onAdded); return; } if (e.detail?.entity_id === id) counts(); };
  window.addEventListener('portal-task-added', onAdded);
  box.querySelector('[data-ppt]').addEventListener('click', () => {
    const s = sheet(`Tarefas${label ? ' · ' + label : ''}`, { wide: true, onClose: () => { t.destroy(); counts(); } });
    const t = mountTasks(s.body, { projectId: p.id, entity: { type, id } });
  });
  box.querySelector('[data-ppn]').addEventListener('click', () => notesSheet(p, { type, id, label, legacy }, counts));
  counts();
  return { refresh: counts };
}

function notesSheet(p, { type, id, label, legacy }, after) {
  const me = state.user?.id;
  let notes = [], people = [], pub = false, editing = null, dead = false;
  const ch = sb.channel('page-notes-' + id + Math.random().toString(36).slice(2))
    .on('postgres_changes', { event: '*', schema: DB_SCHEMA, table: 'page_notes', filter: `entity_id=eq.${id}` }, () => { clearTimeout(ch._t); ch._t = setTimeout(load, 400); })
    .subscribe();
  const s = sheet(`Notas${label ? ' · ' + label : ''}`, { wide: true, onClose: () => { dead = true; sb.removeChannel(ch); after && after(); } });
  const who = (uid) => people.find((x) => x.id === uid)?.display_name || 'Alguém';
  const li = (n) => {
    const mine = n.author_id === me;
    const meta = mine ? (n.is_public ? 'Toda a equipa vê' : 'Só tu vês') : who(n.author_id);
    if (editing === n.id) return `<li class="pp-note" data-nid="${n.id}"><textarea data-ebody rows="4" aria-label="Nota">${esc(n.body)}</textarea><div class="row end"><button type="button" class="btn ghost" data-ecancel>Cancelar</button><button type="button" class="btn primary" data-esave>Guardar</button></div></li>`;
    return `<li class="pp-note" data-nid="${n.id}"><p>${esc(n.body)}</p><div class="pp-nm"><span class="muted small">${esc(meta)} · ${fmtDate(n.updated_at || n.created_at)}</span>${mine ? `<span class="row">
      <button type="button" class="link-btn small" data-vis2>${n.is_public ? 'Passar a só eu' : 'Mostrar à equipa'}</button>
      <button type="button" class="icon-btn sm" data-edit title="Mudar" aria-label="Mudar a nota">${ICON.edit}</button>
      <button type="button" class="icon-btn sm" data-rm title="Apagar" aria-label="Apagar a nota">${ICON.trash}</button></span>` : ''}</div></li>`;
  };
  const draw = () => {
    if (dead) return;
    const mine = notes.filter((n) => n.author_id === me), others = notes.filter((n) => n.author_id !== me);
    const draft = s.body.querySelector('[data-new] textarea')?.value || '';
    s.body.innerHTML = `
      <form class="pp-new" data-new>
        <textarea name="body" rows="3" placeholder="Escreve uma nota${label ? ` sobre ${esc(label)}` : ''}…" aria-label="Nova nota">${esc(draft)}</textarea>
        <div class="row between wrap-gap"><div class="pp-vis" role="group" aria-label="Quem vê esta nota"><button type="button" data-vis="0" aria-pressed="${!pub}">Só eu</button><button type="button" data-vis="1" aria-pressed="${pub}">Toda a equipa</button></div><button class="btn primary">Juntar nota</button></div>
      </form>
      ${legacy && filled(legacy.get()) ? `<section class="pp-sec"><h3>Nota da página <span class="muted small">· toda a equipa</span></h3><textarea data-legacy rows="3" aria-label="Nota da página">${esc(legacy.get())}</textarea></section>` : ''}
      <section class="pp-sec"><h3>As minhas notas</h3>${mine.length ? `<ul class="pp-list">${mine.map(li).join('')}</ul>` : '<p class="muted small">Ainda não tens notas aqui.</p>'}</section>
      ${others.length ? `<section class="pp-sec"><h3>Da equipa</h3><ul class="pp-list">${others.map(li).join('')}</ul></section>` : ''}`;
    const f = s.body.querySelector('[data-new]');
    f.querySelectorAll('[data-vis]').forEach((b) => b.addEventListener('click', () => { pub = b.dataset.vis === '1'; f.querySelectorAll('[data-vis]').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.vis === '1') === pub))); }));
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = f.elements.body.value.trim(); if (!body) return;
      const { data, error } = await sb.from('page_notes').insert({ project_id: p.id, entity_type: type, entity_id: id, body, is_public: pub }).select().single();
      if (error) return toast('Não foi possível guardar a nota: ' + error.message);
      f.elements.body.value = '';
      notes.unshift({ author_id: me, created_at: new Date().toISOString(), ...data }); draw();
    });
    f.elements.body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) f.requestSubmit(); });
    const lg = s.body.querySelector('[data-legacy]');
    if (lg) { let tm; lg.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => legacy.save(lg.value), 600); }); }
    s.body.querySelectorAll('[data-nid]').forEach((el) => {
      const n = notes.find((x) => x.id === el.dataset.nid); if (!n) return;
      const upd = async (patch) => { const { error } = await sb.from('page_notes').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', n.id); if (error) return toast('Não foi possível guardar: ' + error.message); Object.assign(n, patch); editing = null; draw(); };
      el.querySelector('[data-vis2]')?.addEventListener('click', () => upd({ is_public: !n.is_public }));
      el.querySelector('[data-edit]')?.addEventListener('click', () => { editing = n.id; draw(); s.body.querySelector('[data-ebody]')?.focus(); });
      el.querySelector('[data-ecancel]')?.addEventListener('click', () => { editing = null; draw(); });
      el.querySelector('[data-esave]')?.addEventListener('click', () => { const v = el.querySelector('[data-ebody]').value.trim(); if (v) upd({ body: v }); });
      el.querySelector('[data-rm]')?.addEventListener('click', async () => {
        if (!(await confirmBox('Apagar esta nota?', 'Apagar'))) return;
        const { error } = await sb.from('page_notes').delete().eq('id', n.id); if (error) return toast(error.message);
        notes = notes.filter((x) => x !== n); draw();
      });
    });
  };
  async function load() {
    const [{ data, error }, ppl] = await Promise.all([sb.from('page_notes').select('*').eq('entity_id', id).order('created_at', { ascending: false }), loadPeople()]);
    if (dead) return;
    if (error) { s.body.innerHTML = `<p class="muted">${esc(error.message)}</p>`; return; }
    notes = data || []; people = ppl || []; draw();
  }
  s.body.innerHTML = '<p class="muted">A carregar…</p>';
  load();
  setTimeout(() => s.body.querySelector('[data-new] textarea')?.focus(), 60);
}

// "Entra em 1 · 4 · 7": só os números das cenas; ao clicar abre a lista com as cenas descritas
// list: [{ id, number, title, sub, href }]
export function sceneNums(list, { what = 'Cenas', empty = '' } = {}) {
  if (!list.length) return empty ? `<p class="muted small sc-none">${esc(empty)}</p>` : '';
  return `<button type="button" class="sc-nums" data-scnums title="Ver as ${esc(what.toLowerCase())}"><span class="muted small">${esc(what)}</span>${list.map((s) => `<b>${esc(s.number)}</b>`).join('')}${ICON.chev}</button>`;
}
export function bindSceneNums(root, list, { title = 'Cenas' } = {}) {
  root.querySelector('[data-scnums]')?.addEventListener('click', () => {
    const s = sheet(`${title} (${list.length})`);
    s.body.innerHTML = `<ul class="scene-links pp-scenes">${list.map((x) => `<li><a href="${esc(x.href)}"><strong>${esc(x.number)}</strong><span>${esc(x.title || '')}</span><span class="muted small">${esc(x.sub || '')}</span></a></li>`).join('')}</ul>`;
  });
}
