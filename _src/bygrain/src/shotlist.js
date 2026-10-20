import { saveLater, sb, esc, toast, confirmBox, ICON, onLeave } from './lib.js';
import { exportPdf } from './pdf.js';
import { ensureModules } from './modules.js';
import { fullscreenButton } from './layout.js';
import { tableShortcuts } from './tablekit.js';

// Shotlist: todos os planos numa tabela rápida, agrupados pelas SECÇÕES do seguimento (ou cenas).
// Uma secção criada aqui aparece no seguimento e no storyboard; mudar o nome ou a cor muda lá também.
// Atalhos como nas tabelas: Alt+↓ / Alt+↑ plano novo, Alt+Shift+↓ secção nova, Ctrl+Z desfaz, Ctrl+Shift+Z refaz.

const COLS = [
  ['description', 'Descrição do shot', '28%'], ['direction_notes', 'Notas direção', '17%'], ['tech_notes', 'Notas técnicas', '17%'],
  ['car', 'Carro', '8%'], ['rig', 'Rig + lente', '10%'], ['prop', 'Prop', '8%'], ['tc', 'TC', '6%'],
];
const PALETTE = ['#C8382D', '#FF8A3D', '#E3B341', '#2FB67C', '#2AA8C9', '#4F7BFF', '#7C5CFF', '#F06BD0', '#F05252', '#8A8A99'];
const SEG = ['#8e6cdb', '#d6457a', '#d9822b', '#c9a227', '#2fa37a', '#4f8f9e', '#7fae3a', '#8a7563'];
const debounce = (fn, ms = 600) => saveLater(fn, ms);

export async function shotlistPage(main, p, base) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const [s, sc] = await Promise.all([
    sb.from('shots').select('*').eq('project_id', p.id).order('position'),
    sb.from('scenes').select('*').eq('project_id', p.id).order('position'),
  ]);
  const st = { shots: s.data || [], scenes: sc.data || [] };
  const unit = p._hasScript ? 'cena' : 'secção';
  const colorOf = (sec) => sec.color || SEG[st.scenes.indexOf(sec) % SEG.length];

  // ---------- desfazer: cada operação guarda como se desfaz e refaz ----------
  const past = [], future = [];
  const op = (label, undo, redo) => { past.push({ label, undo, redo }); if (past.length > 60) past.shift(); future.length = 0; };
  const runUndo = async () => { const o = past.pop(); if (!o) return toast('Nada para desfazer.'); await o.undo(); future.push(o); draw(); toast(`Desfeito: ${o.label}.`); };
  const runRedo = async () => { const o = future.pop(); if (!o) return toast('Nada para refazer.'); await o.redo(); past.push(o); draw(); toast(`Refeito: ${o.label}.`); };

  const savers = new Map();
  const dbShot = (id, patch) => sb.from('shots').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => error && toast(error.message));
  const saveShot = (id, k, v) => { const key = id + k; if (!savers.has(key)) savers.set(key, debounce((val) => dbShot(id, { [k]: val }), 500)); savers.get(key)(v); };
  const saveScene = (id, k, v) => { const key = 's' + id + k; if (!savers.has(key)) savers.set(key, debounce((val) => sb.from('scenes').update({ [k]: val }).eq('id', id).then(({ error }) => error && toast(error.message)), 500)); savers.get(key)(v); };
  const buckets = () => {
    const out = st.scenes.map((sec) => ({ sec, shots: st.shots.filter((x) => x.scene_id === sec.id).sort((a, b) => (a.position || 0) - (b.position || 0)) }));
    const loose = st.shots.filter((x) => !x.scene_id || !st.scenes.some((sec) => sec.id === x.scene_id));
    if (loose.length) out.push({ sec: null, shots: loose });
    return out;
  };

  async function addShot(sceneId, k = 'description', afterId = null, before = false) {
    const list = st.shots.filter((x) => (x.scene_id || null) === sceneId).sort((a, b) => (a.position || 0) - (b.position || 0));
    let pos;
    const ref = afterId ? list.find((x) => x.id === afterId) : null;
    if (ref) { const i = list.indexOf(ref); const nb = before ? list[i - 1] : list[i + 1]; pos = nb ? ((ref.position || 0) + (nb.position || 0)) / 2 : (ref.position || 0) + (before ? -1 : 1); }
    else pos = Math.max(0, ...list.map((x) => x.position || 0)) + 1;
    const { data, error } = await sb.from('shots').insert({ project_id: p.id, scene_id: sceneId, position: Math.round(pos * 1000) / 1000, code: '' }).select().single();
    if (error) return toast(error.message);
    st.shots.push(data); draw({ id: data.id, k });
    let cur = data;
    op('juntar plano', async () => { await sb.from('shots').delete().eq('id', cur.id); st.shots = st.shots.filter((x) => x.id !== cur.id); },
      async () => { const { data: d2 } = await sb.from('shots').insert({ ...cur, id: undefined }).select().single(); if (d2) { cur = d2; st.shots.push(d2); } });
    ensureModules(p, ['storyboard'], { quiet: true });
  }
  async function addSection(afterSceneId = null) {
    const i = afterSceneId ? st.scenes.findIndex((x) => x.id === afterSceneId) : st.scenes.length - 1;
    const pos = i + 1;
    const color = PALETTE[st.scenes.length % PALETTE.length];
    const n = st.scenes.reduce((m, x) => Math.max(m, Number(x.number) || 0), 0) + 1;
    const after = st.scenes.slice(pos);
    await Promise.all(after.map((x, j) => sb.from('scenes').update({ position: pos + 1 + j }).eq('id', x.id)));
    after.forEach((x, j) => (x.position = pos + 1 + j));
    const { data, error } = await sb.from('scenes').insert({ project_id: p.id, number: String(n), heading: '', position: pos, color, character_ids: [] }).select().single();
    if (error) return toast(error.message);
    st.scenes.splice(pos, 0, data); draw();
    main.querySelector(`[data-sec="${data.id}"] .sl-gname`)?.focus();
    let cur = data;
    op(`juntar ${unit}`, async () => { await sb.from('scenes').delete().eq('id', cur.id); st.scenes = st.scenes.filter((x) => x.id !== cur.id); },
      async () => { const { data: d2 } = await sb.from('scenes').insert({ ...cur, id: undefined, created_at: undefined }).select().single(); if (d2) { cur = d2; st.scenes.splice(Math.min(pos, st.scenes.length), 0, d2); } });
  }

  const draw = (focus) => {
    let n = 0;
    const b = buckets();
    const nSec = st.scenes.length;
    main.innerHTML = `
      <div class="row between wrap-gap"><div><h1 class="h1 pm-title">Shotlist</h1><p class="muted">${st.shots.length} ${st.shots.length === 1 ? 'plano' : 'planos'} em ${nSec} ${nSec === 1 ? unit : unit === 'cena' ? 'cenas' : 'secções'}. As ${unit === 'cena' ? 'cenas' : 'secções'} são as mesmas do ${unit === 'cena' ? 'guião' : 'seguimento'} e do storyboard.</p>
        <p class="muted small"><kbd>Alt</kbd>+<kbd>↓</kbd>/<kbd>↑</kbd> plano novo onde está o rato · <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↓</kbd> ${unit} nova · <kbd>Ctrl</kbd>+<kbd>Z</kbd> desfaz · Enter na última linha junta outro plano · o número abre o plano</p></div>
        <div class="row wrap-gap"><button type="button" class="btn ghost" data-pdf>${ICON.open} Exportar PDF</button><button type="button" class="btn primary" data-addsec>${ICON.plus} ${unit === 'cena' ? 'Cena' : 'Secção'}</button></div></div>
      <div class="sl-wrap" data-slwrap><table class="sl">
        <colgroup><col style="width:44px">${COLS.map(([, , w]) => `<col style="width:${w}">`).join('')}<col style="width:72px"></colgroup>
        <thead><tr><th>#</th>${COLS.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead>
        ${b.map(({ sec, shots }) => `<tbody data-sec="${sec ? sec.id : ''}">
          <tr class="sl-g" style="--c:${esc(sec ? colorOf(sec) : '#3a3a46')}" data-row="${sec ? 'sec:' + sec.id : 'sec:'}"><td colspan="${COLS.length + 2}"><div class="sl-gh">
            ${sec ? `<label class="sl-sw" title="Mudar a cor">${ICON.palette}<input type="color" data-scolor value="${esc(colorOf(sec))}" aria-label="Cor da ${unit}"></label>
              <input class="sl-gname" data-sk="heading" value="${esc(sec.heading || '')}" placeholder="Nome da ${unit}" aria-label="Nome da ${unit}">
              <input class="sl-gnote" data-sk="note" value="${esc(sec.note || '')}" placeholder="Nota" aria-label="Nota">
              <a class="sl-gbtn" href="${base}/${unit === 'cena' ? 'cenas' : 'seguimento'}/${sec.id}" title="Abrir a ${unit}">${ICON.open}</a>` : `<strong class="sl-gname">Sem ${unit}</strong>`}
            <span class="sl-count">${shots.length}</span>
            <button type="button" class="sl-gbtn" data-addshot title="Juntar plano">${ICON.plus}</button>
            ${sec ? `<button type="button" class="sl-gbtn" data-delsec title="Apagar ${unit}">${ICON.trash}</button>` : ''}
          </div></td></tr>
          ${shots.map((x) => `<tr data-s="${x.id}" data-row="${x.id}"><td class="sl-n"><a href="${base}/plano/${x.id}" title="Abrir o plano">${++n}</a></td>${COLS.map(([k]) => `<td><textarea rows="1" data-k="${k}" aria-label="${k}">${esc(x[k] || '')}</textarea></td>`).join('')}
            <td class="sl-act"><select class="sl-move" data-move aria-label="Mover para outra ${unit}" title="Mover para outra ${unit}"><option value="">↔</option>${st.scenes.filter((y) => y.id !== x.scene_id).map((y) => `<option value="${y.id}">${esc(y.heading || 'Sem nome')}</option>`).join('')}${x.scene_id ? `<option value="__none">Sem ${unit}</option>` : ''}</select><button type="button" class="sl-del" data-delshot title="Apagar plano" aria-label="Apagar plano">${ICON.trash}</button></td></tr>`).join('')}
        </tbody>`).join('')}
      </table></div>
      ${!st.scenes.length && !st.shots.length ? `<div class="empty-box"><p>Ainda não há planos.</p><p class="muted small">Cria uma ${unit} e escreve os planos.</p></div>` : ''}`;
    const wrap = main.querySelector('[data-slwrap]'); main.querySelector('[data-pdf]').before(fullscreenButton(wrap, 'sl-' + p.id));
    const autosize = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
    main.querySelectorAll('.sl textarea').forEach(autosize);
    main.querySelectorAll('[data-s]').forEach((tr) => {
      const x = st.shots.find((y) => y.id === tr.dataset.s);
      tr.querySelectorAll('[data-k]').forEach((el) => {
        let before = null;
        el.addEventListener('focus', () => { before = x[el.dataset.k] ?? null; });
        el.addEventListener('blur', () => { const k = el.dataset.k; const after = x[k] ?? null; if (before !== after) { const b0 = before; op('escrever', async () => { x[k] = b0; await dbShot(x.id, { [k]: b0 }); }, async () => { x[k] = after; await dbShot(x.id, { [k]: after }); }); } before = null; });
        el.addEventListener('input', () => { autosize(el); x[el.dataset.k] = el.value || null; saveShot(x.id, el.dataset.k, el.value || null); });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.altKey) { e.preventDefault(); const last = tr.parentElement.lastElementChild === tr; if (last) addShot(x.scene_id || null, el.dataset.k, x.id); else tr.nextElementSibling?.querySelector(`[data-k="${el.dataset.k}"]`)?.focus(); }
        });
      });
      tr.querySelector('[data-move]').addEventListener('change', async (e) => {
        const to = e.target.value === '__none' ? null : e.target.value; if (!e.target.value) return;
        const from = x.scene_id || null; const pos = Math.max(0, ...st.shots.filter((y) => (y.scene_id || null) === to).map((y) => y.position || 0)) + 1; const oldPos = x.position;
        x.scene_id = to; x.position = pos; await dbShot(x.id, { scene_id: to, position: pos });
        op('mover plano', async () => { x.scene_id = from; x.position = oldPos; await dbShot(x.id, { scene_id: from, position: oldPos }); }, async () => { x.scene_id = to; x.position = pos; await dbShot(x.id, { scene_id: to, position: pos }); });
        draw();
      });
      tr.querySelector('[data-delshot]').addEventListener('click', async () => {
        if (!(await confirmBox(`Apagar o plano "${x.description || 'sem descrição'}"?`, 'Apagar plano'))) return;
        const { error } = await sb.from('shots').delete().eq('id', x.id); if (error) return toast(error.message);
        st.shots = st.shots.filter((y) => y.id !== x.id); let cur = { ...x };
        op('apagar plano', async () => { const { data } = await sb.from('shots').insert({ ...cur, id: undefined }).select().single(); if (data) { cur = data; st.shots.push(data); } }, async () => { await sb.from('shots').delete().eq('id', cur.id); st.shots = st.shots.filter((y) => y.id !== cur.id); });
        draw();
      });
    });
    main.querySelectorAll('[data-sec]').forEach((tb) => {
      const sec = st.scenes.find((y) => y.id === tb.dataset.sec);
      tb.querySelector('[data-addshot]').addEventListener('click', () => addShot(sec?.id || null, 'description'));
      if (!sec) return;
      tb.querySelectorAll('[data-sk]').forEach((el) => {
        let before = null;
        el.addEventListener('focus', () => { before = sec[el.dataset.sk] ?? ''; });
        el.addEventListener('blur', () => { const k = el.dataset.sk; const after = sec[k] ?? ''; if (before !== null && before !== after) { const b0 = before; op('mudar nome', async () => { sec[k] = b0; await sb.from('scenes').update({ [k]: b0 }).eq('id', sec.id); }, async () => { sec[k] = after; await sb.from('scenes').update({ [k]: after }).eq('id', sec.id); }); } });
        el.addEventListener('input', () => { sec[el.dataset.sk] = el.value; saveScene(sec.id, el.dataset.sk, el.value || (el.dataset.sk === 'heading' ? '' : null)); });
      });
      tb.querySelector('[data-scolor]').addEventListener('change', (e) => { const old = sec.color || null; sec.color = e.target.value; tb.querySelector('.sl-g').style.setProperty('--c', sec.color); saveScene(sec.id, 'color', sec.color); const nw = sec.color; op('mudar cor', async () => { sec.color = old; await sb.from('scenes').update({ color: old }).eq('id', sec.id); }, async () => { sec.color = nw; await sb.from('scenes').update({ color: nw }).eq('id', sec.id); }); });
      tb.querySelector('[data-delsec]').addEventListener('click', async () => {
        const mine = st.shots.filter((y) => y.scene_id === sec.id);
        if (!(await confirmBox(`Apagar a ${unit} "${sec.heading || 'sem nome'}"?${mine.length ? ` Os ${mine.length} planos ficam em "Sem ${unit}".` : ''} Também sai do ${unit === 'cena' ? 'guião' : 'seguimento'}.`, `Apagar ${unit}`))) return;
        if (mine.length) await sb.from('shots').update({ scene_id: null }).eq('scene_id', sec.id);
        const { error } = await sb.from('scenes').delete().eq('id', sec.id); if (error) return toast(error.message);
        mine.forEach((y) => (y.scene_id = null)); st.scenes = st.scenes.filter((y) => y.id !== sec.id);
        let cur = { ...sec };
        op(`apagar ${unit}`, async () => { const { data } = await sb.from('scenes').insert({ ...cur, id: undefined, created_at: undefined }).select().single(); if (data) { cur = data; st.scenes.push(data); st.scenes.sort((a, c) => a.position - c.position); await sb.from('shots').update({ scene_id: data.id }).in('id', mine.map((y) => y.id)); mine.forEach((y) => (y.scene_id = data.id)); } },
          async () => { await sb.from('shots').update({ scene_id: null }).eq('scene_id', cur.id); await sb.from('scenes').delete().eq('id', cur.id); mine.forEach((y) => (y.scene_id = null)); st.scenes = st.scenes.filter((y) => y.id !== cur.id); });
        draw();
      });
    });
    main.querySelector('[data-addsec]').addEventListener('click', () => addSection());
    main.querySelector('[data-pdf]').addEventListener('click', () => exportPdf({
      title: `Shotlist — ${p.name}`, subtitle: [p.client, `${st.shots.length} planos`].filter(Boolean).join(' · '), landscape: true,
      columns: [{ label: '#', width: '4%' }, ...COLS.map(([, l, w]) => ({ label: l, width: w }))],
      groups: (() => { let i = 0; return buckets().map(({ sec, shots }) => ({ title: sec ? sec.heading || ' ' : `Sem ${unit}`, color: sec ? colorOf(sec) : '#555', note: sec?.note, rows: shots.map((x) => [++i, ...COLS.map(([k]) => x[k] || '')]) })); })(),
    }));
    // atalhos: linha onde está o rato (plano ou cabeçalho de secção)
    const secOfRow = (rowId) => { if (!rowId) return st.scenes[st.scenes.length - 1]?.id || null; if (rowId.startsWith('sec:')) return rowId.slice(4) || null; return st.shots.find((y) => y.id === rowId)?.scene_id || null; };
    const shotOfRow = (rowId) => (rowId && !rowId.startsWith('sec:') ? rowId : null);
    tableShortcuts(main.querySelector('table.sl'), {
      rowBelow: (r) => addShot(secOfRow(r), 'description', shotOfRow(r)),
      rowAbove: (r) => addShot(secOfRow(r), 'description', shotOfRow(r), true),
      section: (r) => addSection(secOfRow(r)),
    });
    if (focus) main.querySelector(`[data-s="${focus.id}"] [data-k="${focus.k}"]`)?.focus();
  };

  // Ctrl+Z / Ctrl+Shift+Z (enquanto se escreve numa célula, desfaz as letras, como sempre)
  const onKey = (e) => {
    if (!document.body.contains(main.querySelector('table.sl') || main)) { document.removeEventListener('keydown', onKey); return; }
    if (!main.querySelector('table.sl')) return;
    if (main.closest('.is-locked')) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase(); const undo = k === 'z' && !e.shiftKey; const redo = (k === 'z' && e.shiftKey) || k === 'y';
    if (!undo && !redo) return;
    if (document.querySelector('#modal .modal')) return;
    const a = document.activeElement;
    if (a && a.matches('textarea, input') && (!main.contains(a) || a._dirty)) return;
    e.preventDefault(); a?.blur?.(); if (undo) runUndo(); else runRedo();
  };
  main.addEventListener('input', (e) => { e.target._dirty = true; }, true);
  main.addEventListener('focusin', (e) => { e.target._dirty = false; }, true);
  document.addEventListener('keydown', onKey); onLeave(() => document.removeEventListener('keydown', onKey));
  draw();
}
