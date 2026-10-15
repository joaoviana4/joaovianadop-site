import { sb, esc, toast, confirmBox, ICON } from './lib.js';
import { exportPdf } from './pdf.js';
import { ensureModules } from './modules.js';
import { fullscreenButton } from './layout.js';

// Shotlist / planeamento: todos os planos numa tabela rápida, em grupos coloridos (como numa folha de cálculo).
// Os planos são os mesmos do storyboard e das secções: dar uma secção a um plano põe-no lá.

const COLS = [
  ['description', 'Descrição do shot', '26%'], ['scene_id', 'Secção', '11%'], ['direction_notes', 'Notas direção', '15%'], ['tech_notes', 'Notas técnicas', '15%'],
  ['car', 'Carro', '7%'], ['rig', 'Rig + lente', '9%'], ['prop', 'Prop', '7%'], ['tc', 'TC', '6%'],
];
const PALETTE = ['#C8382D', '#FF8A3D', '#E3B341', '#2FB67C', '#2AA8C9', '#4F7BFF', '#7C5CFF', '#F06BD0', '#F05252', '#8A8A99'];
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export async function shotlistPage(main, p, base) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const [g, s, sc] = await Promise.all([
    sb.from('shot_groups').select('*').eq('project_id', p.id).order('position'),
    sb.from('shots').select('*').eq('project_id', p.id).order('position'),
    sb.from('scenes').select('id, heading, number, position').eq('project_id', p.id).order('position'),
  ]);
  const st = { groups: g.data || [], shots: s.data || [], scenes: sc.data || [] };
  const savers = new Map();
  const saveShot = (id, k, v) => { const key = id + k; if (!savers.has(key)) savers.set(key, debounce((val) => sb.from('shots').update({ [k]: val, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => error && toast(error.message)), 500)); savers.get(key)(v); };
  const saveGroup = (id, k, v) => { const key = 'g' + id + k; if (!savers.has(key)) savers.set(key, debounce((val) => sb.from('shot_groups').update({ [k]: val }).eq('id', id).then(({ error }) => error && toast(error.message)), 500)); savers.get(key)(v); };
  const sceneName = (id) => st.scenes.find((x) => x.id === id)?.heading || '';
  const buckets = () => {
    const out = st.groups.map((gr) => ({ gr, shots: st.shots.filter((x) => x.group_id === gr.id) }));
    const loose = st.shots.filter((x) => !x.group_id || !st.groups.some((gr) => gr.id === x.group_id));
    if (loose.length) out.push({ gr: null, shots: loose });
    return out;
  };

  const draw = (focus) => {
    let n = 0;
    const b = buckets();
    main.innerHTML = `
      <div class="row between wrap-gap"><div><h1 class="h1 pm-title">Shotlist</h1><p class="muted">${st.shots.length} ${st.shots.length === 1 ? 'plano' : 'planos'} em ${st.groups.length} ${st.groups.length === 1 ? 'grupo' : 'grupos'}. Escreve e passa à frente com Tab; Enter na última linha junta outro plano.</p></div>
        <div class="row wrap-gap"><button type="button" class="btn ghost" data-pdf>${ICON.open} Exportar PDF</button><button type="button" class="btn primary" data-addgroup>${ICON.plus} Grupo</button></div></div>
      <div class="sl-wrap" data-slwrap><table class="sl">
        <colgroup><col style="width:36px">${COLS.map(([, , w]) => `<col style="width:${w}">`).join('')}<col style="width:36px"></colgroup>
        <thead><tr><th>#</th>${COLS.map(([, l]) => `<th>${l}</th>`).join('')}<th></th></tr></thead>
        ${b.map(({ gr, shots }) => `<tbody data-g="${gr ? gr.id : ''}">
          <tr class="sl-g" style="--c:${esc(gr?.color || '#3a3a46')}"><td colspan="${COLS.length + 2}"><div class="sl-gh">
            ${gr ? `<label class="sl-sw" title="Mudar a cor do grupo">${ICON.palette}<input type="color" data-gcolor value="${esc(gr.color)}" aria-label="Cor do grupo"></label>
              <input class="sl-gname" data-gk="name" value="${esc(gr.name)}" placeholder="Nome do grupo" aria-label="Nome do grupo">
              <input class="sl-gnote" data-gk="note" value="${esc(gr.note || '')}" placeholder="Nota" aria-label="Nota do grupo">` : '<strong class="sl-gname">Sem grupo</strong>'}
            <span class="sl-count">${shots.length}</span>
            <button type="button" class="sl-gbtn" data-addshot title="Juntar plano">${ICON.plus}</button>
            ${gr ? `<button type="button" class="sl-gbtn" data-delgroup title="Apagar grupo">${ICON.trash}</button>` : ''}
          </div></td></tr>
          ${shots.map((x) => `<tr data-s="${x.id}"><td class="sl-n">${++n}</td>${COLS.map(([k]) => k === 'scene_id'
            ? `<td><select data-k="scene_id" aria-label="Secção"><option value="">—</option>${st.scenes.map((s2) => `<option value="${s2.id}" ${x.scene_id === s2.id ? 'selected' : ''}>${esc(s2.heading || 'Secção ' + s2.number)}</option>`).join('')}</select></td>`
            : `<td><textarea rows="1" data-k="${k}" aria-label="${k}">${esc(x[k] || '')}</textarea></td>`).join('')}
            <td><button type="button" class="sl-del" data-delshot title="Apagar plano" aria-label="Apagar plano">${ICON.trash}</button></td></tr>`).join('')}
        </tbody>`).join('')}
      </table></div>
      ${!st.groups.length && !st.shots.length ? `<div class="empty-box"><p>Ainda não há planos.</p><p class="muted small">Cria um grupo (um set, uma cena, um momento) e escreve os planos.</p></div>` : ''}`;
    const wrap = main.querySelector('[data-slwrap]'); main.querySelector('[data-pdf]').before(fullscreenButton(wrap, 'sl-' + p.id));
    const autosize = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
    main.querySelectorAll('.sl textarea').forEach(autosize);
    main.querySelectorAll('[data-s]').forEach((tr) => {
      const x = st.shots.find((y) => y.id === tr.dataset.s);
      tr.querySelectorAll('[data-k]').forEach((el) => {
        el.addEventListener('input', () => { if (el.tagName === 'TEXTAREA') autosize(el); x[el.dataset.k] = el.value || null; saveShot(x.id, el.dataset.k, el.value || null); });
        if (el.tagName === 'TEXTAREA') el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const last = tr.parentElement.lastElementChild === tr; if (last) addShot(x.group_id || null, el.dataset.k); else tr.nextElementSibling?.querySelector(`[data-k="${el.dataset.k}"]`)?.focus(); }
        });
      });
      tr.querySelector('[data-delshot]').addEventListener('click', async () => {
        if (!(await confirmBox(`Apagar o plano "${x.description || 'sem descrição'}"?`, 'Apagar plano'))) return;
        const { error } = await sb.from('shots').delete().eq('id', x.id); if (error) return toast(error.message);
        st.shots.splice(st.shots.indexOf(x), 1); draw();
      });
    });
    main.querySelectorAll('[data-g]').forEach((tb) => {
      const gr = st.groups.find((y) => y.id === tb.dataset.g);
      tb.querySelector('[data-addshot]').addEventListener('click', () => addShot(gr?.id || null, 'description'));
      if (!gr) return;
      tb.querySelectorAll('[data-gk]').forEach((el) => el.addEventListener('input', () => { gr[el.dataset.gk] = el.value; saveGroup(gr.id, el.dataset.gk, el.value || (el.dataset.gk === 'name' ? '' : null)); }));
      tb.querySelector('[data-gcolor]').addEventListener('input', (e) => { gr.color = e.target.value; tb.querySelector('.sl-g').style.setProperty('--c', gr.color); saveGroup(gr.id, 'color', gr.color); });
      tb.querySelector('[data-delgroup]').addEventListener('click', async () => {
        const k = st.shots.filter((y) => y.group_id === gr.id).length;
        if (!(await confirmBox(`Apagar o grupo "${gr.name || 'sem nome'}"?${k ? ` Os ${k} planos ficam em "Sem grupo".` : ''}`, 'Apagar grupo'))) return;
        const { error } = await sb.from('shot_groups').delete().eq('id', gr.id); if (error) return toast(error.message);
        st.groups.splice(st.groups.indexOf(gr), 1); st.shots.forEach((y) => { if (y.group_id === gr.id) y.group_id = null; }); draw();
      });
    });
    main.querySelector('[data-addgroup]').addEventListener('click', async () => {
      const color = PALETTE[st.groups.length % PALETTE.length];
      const { data, error } = await sb.from('shot_groups').insert({ project_id: p.id, name: '', color, position: st.groups.length }).select().single();
      if (error) return toast(error.message);
      st.groups.push(data); draw(); main.querySelector(`[data-g="${data.id}"] .sl-gname`)?.focus();
    });
    main.querySelector('[data-pdf]').addEventListener('click', () => exportPdf({
      title: `Shotlist — ${p.name}`, subtitle: [p.client, `${st.shots.length} planos`].filter(Boolean).join(' · '), landscape: true,
      columns: [{ label: '#', width: '4%' }, ...COLS.map(([, l, w]) => ({ label: l, width: w }))],
      groups: (() => { let i = 0; return buckets().map(({ gr, shots }) => ({ title: gr ? gr.name || ' ' : 'Sem grupo', color: gr?.color || '#555', note: gr?.note, rows: shots.map((x) => [++i, ...COLS.map(([k]) => (k === 'scene_id' ? sceneName(x.scene_id) : x[k] || ''))]) })); })(),
    }));
    if (focus) { const el = main.querySelector(`[data-s="${focus.id}"] [data-k="${focus.k}"]`); el?.focus(); }
  };
  async function addShot(groupId, k = 'description') {
    const pos = Math.max(0, ...st.shots.filter((x) => (x.group_id || null) === groupId).map((x) => x.position || 0)) + 1;
    const { data, error } = await sb.from('shots').insert({ project_id: p.id, group_id: groupId, position: pos, code: '' }).select().single();
    if (error) return toast(error.message);
    st.shots.push(data); draw({ id: data.id, k });
    ensureModules(p, ['storyboard'], { quiet: true });
  }
  draw();
}
