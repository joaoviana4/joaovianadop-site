import { sb, esc, toast, confirmBox, ICON, signedUrl, uploadImage } from './lib.js';
import { mountTasks } from './tasks.js';

// Página de um plano: imagem em grande, tudo o que se sabe dele, secção/cena e grupo da shotlist, tarefas.
// Chega-se aqui a partir do storyboard, da grelha do seguimento, da shotlist e das secções.

const FIELDS = [
  ['description', 'Descrição', 3], ['direction_notes', 'Notas de direção', 2], ['tech_notes', 'Notas técnicas', 2],
];
const SMALL = [['framing', 'Enquadramento'], ['movement', 'Movimento'], ['lens', 'Lente'], ['rig', 'Rig'], ['car', 'Carro'], ['prop', 'Prop'], ['tc', 'TC']];
const debounce = (fn, ms = 500) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export async function shotPage(main, p, id, base, cleanup) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const [{ data: shots }, { data: scenes }, { data: groups }] = await Promise.all([
    sb.from('shots').select('*').eq('project_id', p.id).order('position'),
    sb.from('scenes').select('id, number, heading, position').eq('project_id', p.id).order('position'),
    sb.from('shot_groups').select('id, name, color, position').eq('project_id', p.id).order('position'),
  ]);
  const x = (shots || []).find((s) => s.id === id);
  if (!x) { main.innerHTML = `<p class="empty-note">Este plano já não existe.</p><a href="${base}/storyboard">Voltar ao storyboard</a>`; return; }
  // mesma ordem do storyboard: por secção/cena, depois pelos grupos da shotlist
  const order = [...(scenes || []).flatMap((sc) => shots.filter((s) => s.scene_id === sc.id)), ...shots.filter((s) => !s.scene_id)];
  const i = order.indexOf(x); const prev = order[i - 1], next = order[i + 1];
  const scene = (scenes || []).find((s) => s.id === x.scene_id);
  const group = (groups || []).find((g) => g.id === x.group_id);
  const script = p._hasScript;
  const unit = script ? 'cenas' : 'seguimento';
  const img = x.image_path ? await signedUrl(x.image_path) : null;
  const title = x.code || x.description || 'Plano sem nome';
  main.innerHTML = `
    <nav class="row between wrap-gap"><span class="row wrap-gap"><a href="${base}/storyboard" class="link-btn">${ICON.back} Storyboard</a>${scene ? `<a href="${base}/${unit}/${scene.id}" class="link-btn">${esc(scene.heading || 'Secção')}</a>` : ''}<a href="${base}/shotlist" class="link-btn">Shotlist</a></span>
      <span class="row">${prev ? `<a class="btn ghost" href="${base}/plano/${prev.id}" aria-label="Plano anterior">${ICON.back}</a>` : ''}<span class="muted small">${i + 1} de ${order.length}</span>${next ? `<a class="btn ghost" href="${base}/plano/${next.id}" aria-label="Plano seguinte">${ICON.chev}</a>` : ''}</span></nav>
    <header class="shot-head"><input class="title-in" data-f="code" value="${esc(x.code || '')}" placeholder="Código (ex: 3.1)" aria-label="Código do plano"></header>
    <div class="shot-layout">
      <section class="shot-big" data-img tabindex="0" role="button" aria-label="${img ? 'Mudar a imagem' : 'Juntar imagem'}">${img ? `<img src="${esc(img)}" alt="${esc(title)}">` : `<span>${ICON.image}<strong>Juntar imagem</strong><small>clica, arrasta ou cola com Ctrl+V</small></span>`}</section>
      <section class="panel stack shot-fields">
        <div class="grid2">
          <div class="field" style="grid-column:1/-1"><label for="ss">${script ? 'Cena' : 'Secção'}</label><select id="ss" data-f="scene_id"><option value="">—</option>${(scenes || []).map((s) => `<option value="${s.id}" ${s.id === x.scene_id ? 'selected' : ''}>${esc(s.heading || 'Secção ' + s.number)}</option>`).join('')}</select></div>
        </div>
        ${FIELDS.map(([k, l, r]) => `<div class="field"><label for="f-${k}">${l}</label><textarea id="f-${k}" data-f="${k}" rows="${r}">${esc(x[k] || '')}</textarea></div>`).join('')}
        <div class="grid3">${SMALL.map(([k, l]) => `<div class="field"><label for="f-${k}">${l}</label><input id="f-${k}" data-f="${k}" value="${esc(x[k] || '')}"></div>`).join('')}</div>
        <div class="row wrap-gap"><button type="button" class="btn ghost" data-lm>${ICON.bulb} ${x.lightmap_id ? 'Abrir mapa de luz' : 'Criar mapa de luz'}</button>${img ? '<button type="button" class="btn ghost" data-rmimg>Tirar imagem</button>' : ''}<button type="button" class="btn ghost danger-text" data-del>${ICON.trash} Apagar plano</button></div>
      </section>
    </div>
    <section class="panel"><h2 class="h3">Tarefas deste plano</h2><div data-tasks></div></section>`;
  const savers = new Map();
  const save = (k, v) => { if (!savers.has(k)) savers.set(k, debounce((val) => sb.from('shots').update({ [k]: val, updated_at: new Date().toISOString() }).eq('id', x.id).then(({ error }) => error && toast(error.message)))); savers.get(k)(v); };
  main.querySelectorAll('[data-f]').forEach((el) => {
    const ev = el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => { x[el.dataset.f] = el.value || null; save(el.dataset.f, el.value || (el.dataset.f === 'code' ? '' : null)); if (el.tagName === 'SELECT') setTimeout(() => shotPage(main, p, id, base, cleanup), 600); });
  });
  const box = main.querySelector('[data-img]');
  const setImage = async (file) => {
    try { toast('A enviar a imagem…'); const up = await uploadImage(p.id, 'storyboard', file); const { error } = await sb.from('shots').update({ image_path: up.path, updated_at: new Date().toISOString() }).eq('id', x.id); if (error) return toast(error.message); shotPage(main, p, id, base, cleanup); } catch (e) { toast(e.message || String(e)); }
  };
  const pick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => inp.files[0] && setImage(inp.files[0]); inp.click(); };
  box.addEventListener('click', pick);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
  box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drop'); });
  box.addEventListener('dragleave', () => box.classList.remove('drop'));
  box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drop'); const f = [...e.dataTransfer.files].find((y) => y.type.startsWith('image/')); f && setImage(f); });
  const onPaste = (e) => { if (e.target.closest?.('input, textarea')) return; const f = [...(e.clipboardData?.files || [])].find((y) => y.type.startsWith('image/')); if (!f) return; e.preventDefault(); setImage(f); };
  document.addEventListener('paste', onPaste); cleanup(() => document.removeEventListener('paste', onPaste));
  main.querySelector('[data-rmimg]')?.addEventListener('click', async () => {
    if (!(await confirmBox('Tirar a imagem deste plano?', 'Tirar'))) return;
    await sb.from('shots').update({ image_path: null }).eq('id', x.id); shotPage(main, p, id, base, cleanup);
  });
  main.querySelector('[data-lm]').addEventListener('click', async () => (await import('./lmhub.js')).openShotLightmap(p, x, base));
  main.querySelector('[data-del]').addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar o plano "${title}"?`, 'Apagar plano'))) return;
    const { error } = await sb.from('shots').delete().eq('id', x.id); if (error) return toast(error.message);
    location.hash = next ? `${base}/plano/${next.id}` : prev ? `${base}/plano/${prev.id}` : `${base}/storyboard`;
  });
  const t = mountTasks(main.querySelector('[data-tasks]'), { projectId: p.id, entity: { type: 'shot', id: x.id } }); cleanup(() => t.destroy());
}
