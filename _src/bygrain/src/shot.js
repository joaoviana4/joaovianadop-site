import { saveLater, sb, esc, toast, confirmBox, ICON, signedUrl, uploadImage } from './lib.js';
import { mountTasks } from './tasks.js';

// Página de um plano: imagem em grande, tudo o que se sabe dele, secção/cena e grupo da shotlist, tarefas.
// Chega-se aqui a partir do storyboard, da grelha do seguimento, da shotlist e das secções.

const FIELDS = [
  ['description', 'Descrição', 3], ['direction_notes', 'Notas de direção', 2], ['tech_notes', 'Notas técnicas', 2],
];
const SMALL = [['framing', 'Enquadramento'], ['movement', 'Movimento'], ['lens', 'Lente'], ['tc', 'TC']];
// campos que só aparecem quando têm valor ou quando se juntam ("+ Campo")
const OPTIONAL = [['rig', 'Rig'], ['car', 'Carro'], ['prop', 'Prop / adereço (texto)']];
const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 500) => saveLater(fn, ms);

export async function shotPage(main, p, id, base, cleanup) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const [{ data: shots }, { data: scenes }, { data: groups }, { data: chars }] = await Promise.all([
    sb.from('shots').select('*').eq('project_id', p.id).order('position'),
    sb.from('scenes').select('id, number, heading, position, character_ids, extra_ids').eq('project_id', p.id).order('position'),
    sb.from('shot_groups').select('id, name, color, position').eq('project_id', p.id).order('position'),
    sb.from('characters').select('id, name, actor, info').eq('project_id', p.id).order('position'),
  ]);
  const { data: props } = await sb.from('props').select('id, name, type, category, scene_ids, removed').eq('project_id', p.id).order('name');
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
  const extra = Array.isArray(x.extra) ? x.extra : [];
  const shownOpt = OPTIONAL.filter(([k]) => x[k]);
  main.innerHTML = `
    <nav class="row between wrap-gap"><span class="row wrap-gap"><a href="${base}/storyboard" class="link-btn">${ICON.back} Storyboard</a>${scene ? `<a href="${base}/${unit}/${scene.id}" class="link-btn">${esc(scene.heading || 'Secção')}</a>` : ''}<a href="${base}/shotlist" class="link-btn">Shotlist</a></span>
      <span class="row">${prev ? `<a class="btn ghost" href="${base}/plano/${prev.id}" aria-label="Plano anterior">${ICON.back}</a>` : ''}<span class="muted small">${i + 1} de ${order.length}</span>${next ? `<a class="btn ghost" href="${base}/plano/${next.id}" aria-label="Plano seguinte">${ICON.chev}</a>` : ''}</span></nav>
    <header class="shot-head"><input class="title-in" data-f="code" value="${esc(x.code || '')}" placeholder="Código (ex: 3.1)" aria-label="Código do plano"></header>
    <div class="shot-layout">
      <div class="shot-left">
        <section class="shot-big" data-img tabindex="0" role="button" aria-label="${img ? 'Mudar a imagem' : 'Juntar imagem'}">${img ? `<img src="${esc(img)}" alt="${esc(title)}">` : `<span>${ICON.image}<strong>Juntar imagem</strong><small>clica, arrasta ou cola com Ctrl+V</small></span>`}</section>
        <section class="panel shot-in" data-in></section>
        <div class="row wrap-gap shot-acts"><button type="button" class="btn ghost sm" data-lm>${ICON.bulb} ${x.lightmap_id ? 'Abrir mapa de luz' : 'Criar mapa de luz'}</button>${img ? '<button type="button" class="btn ghost sm" data-rmimg>Tirar imagem</button>' : ''}<button type="button" class="btn ghost sm danger-text" data-del>${ICON.trash} Apagar plano</button></div>
      </div>
      <section class="panel stack shot-fields">
        <div class="field"><label for="ss">${script ? 'Cena' : 'Secção'}</label><select id="ss" data-f="scene_id"><option value="">—</option>${(scenes || []).map((s) => `<option value="${s.id}" ${s.id === x.scene_id ? 'selected' : ''}>${esc(s.heading || 'Secção ' + s.number)}</option>`).join('')}</select></div>
        ${FIELDS.map(([k, l, r]) => `<div class="field"><label for="f-${k}">${l}</label><textarea id="f-${k}" data-f="${k}" rows="${r}">${esc(x[k] || '')}</textarea></div>`).join('')}
        <div class="grid4">${SMALL.map(([k, l]) => `<div class="field"><label for="f-${k}">${l}</label><input id="f-${k}" data-f="${k}" value="${esc(x[k] || '')}"></div>`).join('')}</div>
        <div class="shot-extra" data-extra>
          ${shownOpt.map(([k, l]) => `<div class="field ex-f"><label for="f-${k}">${l}</label><div class="row"><input id="f-${k}" data-f="${k}" value="${esc(x[k] || '')}"><button type="button" class="icon-btn sm" data-rmopt="${k}" aria-label="Tirar ${l}">${ICON.close}</button></div></div>`).join('')}
          ${extra.map((e, k) => `<div class="field ex-f"><input class="ex-l" data-exl="${k}" value="${esc(e.label || '')}" placeholder="Nome do campo" aria-label="Nome do campo"><div class="row"><input data-exv="${k}" value="${esc(e.value || '')}" aria-label="${esc(e.label || 'Campo')}"><button type="button" class="icon-btn sm" data-rmex="${k}" aria-label="Tirar campo">${ICON.close}</button></div></div>`).join('')}
        </div>
        <div class="ex-add"><button type="button" class="link-btn small" data-addex>${ICON.plus} Campo</button></div>
      </section>
    </div>
    <section class="panel"><h2 class="h3">Tarefas deste plano</h2><div data-tasks></div></section>`;
  inPanel(main.querySelector('[data-in]'), x, scene, chars || [], (props || []).filter((y) => !y.removed), base);
  // campos extra: rig / carro / prop (colunas do plano) ou um campo com nome à escolha (shots.extra)
  const saveExtra = debounce(() => sb.from('shots').update({ extra: x.extra, updated_at: new Date().toISOString() }).eq('id', x.id).then(({ error }) => error && toast(error.message)), 500);
  main.querySelectorAll('[data-exl]').forEach((el) => el.addEventListener('input', () => { x.extra[+el.dataset.exl].label = el.value; saveExtra(); }));
  main.querySelectorAll('[data-exv]').forEach((el) => el.addEventListener('input', () => { x.extra[+el.dataset.exv].value = el.value; saveExtra(); }));
  main.querySelectorAll('[data-rmex]').forEach((b) => b.addEventListener('click', async () => { x.extra.splice(+b.dataset.rmex, 1); await sb.from('shots').update({ extra: x.extra }).eq('id', x.id); shotPage(main, p, id, base, cleanup); }));
  main.querySelectorAll('[data-rmopt]').forEach((b) => b.addEventListener('click', async () => { await sb.from('shots').update({ [b.dataset.rmopt]: null }).eq('id', x.id); shotPage(main, p, id, base, cleanup); }));
  main.querySelector('[data-addex]').addEventListener('click', (e) => {
    const free = OPTIONAL.filter(([k]) => !x[k]);
    const menu = document.createElement('div'); menu.className = 'ex-menu';
    menu.innerHTML = `${free.map(([k, l]) => `<button type="button" data-k="${k}">${esc(l)}</button>`).join('')}<button type="button" data-k="">Outro campo…</button>`;
    e.currentTarget.after(menu);
    const off = (ev) => { if (!menu.contains(ev.target)) { menu.remove(); document.removeEventListener('mousedown', off, true); } };
    document.addEventListener('mousedown', off, true);
    menu.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', async () => {
      menu.remove(); document.removeEventListener('mousedown', off, true);
      if (b.dataset.k) { const opt = OPTIONAL.find(([k]) => k === b.dataset.k); const row = main.querySelector('[data-extra]'); row.insertAdjacentHTML('afterbegin', `<div class="field ex-f"><label for="f-${opt[0]}">${opt[1]}</label><div class="row"><input id="f-${opt[0]}" data-f="${opt[0]}" value=""></div></div>`); const inp = row.querySelector(`#f-${opt[0]}`); inp.addEventListener('input', () => { x[opt[0]] = inp.value || null; save(opt[0], inp.value || null); }); inp.focus(); return; }
      x.extra = [...extra, { id: uid(), label: '', value: '' }];
      await sb.from('shots').update({ extra: x.extra }).eq('id', x.id);
      await shotPage(main, p, id, base, cleanup);
      const ls = main.querySelectorAll('[data-exl]'); ls[ls.length - 1]?.focus();
    }));
  });
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


// Neste plano: das personagens e adereços da cena, quem e o quê aparece. Personagens: carregar muda
// — → em plano → só no set → —. Adereços: carregar liga/desliga. Fica em shots.cast_ids, set_ids e prop_ids.
function inPanel(el, x, scene, chars, props, base) {
  if (!el) return;
  const inScene = scene ? [...(scene.character_ids || []), ...(scene.extra_ids || [])] : [];
  const sceneProps = () => (scene ? props.filter((pr) => (pr.scene_ids || []).includes(scene.id)) : []);
  const save = async () => { const { error } = await sb.from('shots').update({ cast_ids: x.cast_ids || [], set_ids: x.set_ids || [], prop_ids: x.prop_ids || [], updated_at: new Date().toISOString() }).eq('id', x.id); if (error) toast(error.message); };
  const draw = () => {
    const cast = new Set(x.cast_ids || []); const set = new Set(x.set_ids || []); const pin = new Set(x.prop_ids || []);
    const ids = [...new Set([...inScene, ...cast, ...set])];
    const ppl = ids.map((id) => chars.find((c) => c.id === id)).filter(Boolean);
    const others = chars.filter((c) => !ids.includes(c.id));
    const pls = [...new Map([...sceneProps(), ...props.filter((pr) => pin.has(pr.id))].map((pr) => [pr.id, pr])).values()];
    const otherProps = props.filter((pr) => !pls.some((y) => y.id === pr.id)).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
    const st = (id) => (cast.has(id) ? 'frame' : set.has(id) ? 'set' : '');
    el.innerHTML = `<div class="in-row"><span class="in-h">Personagens</span><div class="chips">${ppl.map((c) => `<button type="button" class="cp-chip ${st(c.id)}" data-cp="${c.id}" title="${st(c.id) === 'frame' ? 'Em plano' : st(c.id) === 'set' ? 'No set, fora de plano' : 'Não está neste plano'}${c.actor ? ` · ${esc(c.actor)}` : ''}">${esc(c.name)}${st(c.id) === 'set' ? ' <small>set</small>' : ''}</button>`).join('')}${others.length ? `<button type="button" class="in-plus" data-cpadd aria-label="Juntar personagem" title="Juntar outra personagem">+</button>` : ''}</div></div>
      <div class="in-row"><span class="in-h">Adereços</span><div class="chips">${pls.map((pr) => `<button type="button" class="cp-chip prop ${pin.has(pr.id) ? 'frame' : ''}" data-pp="${pr.id}" title="${pin.has(pr.id) ? 'Neste plano' : 'Na cena, não neste plano'}">${esc(pr.name)}</button>`).join('') || '<span class="muted small">Sem adereços na cena.</span>'}<button type="button" class="in-plus" data-ppadd aria-label="Juntar adereço" title="Procurar ou criar um adereço">+</button></div></div>
      <p class="muted small in-help">Carrega para marcar. Personagens: em plano → só no set → não está.</p>`;
    el.querySelectorAll('[data-cp]').forEach((b) => b.addEventListener('click', () => {
      const id = b.dataset.cp; const s0 = st(id);
      x.cast_ids = (x.cast_ids || []).filter((y) => y !== id); x.set_ids = (x.set_ids || []).filter((y) => y !== id);
      if (s0 === '') x.cast_ids.push(id); else if (s0 === 'frame') x.set_ids.push(id);
      save(); draw();
    }));
    el.querySelectorAll('[data-pp]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.pp; x.prop_ids = pin.has(id) ? (x.prop_ids || []).filter((y) => y !== id) : [...(x.prop_ids || []), id]; save(); draw(); }));
    el.querySelector('[data-cpadd]')?.addEventListener('click', (e) => picker(e.currentTarget, {
      placeholder: 'Procurar personagem…', items: others.map((c) => ({ id: c.id, label: c.name, sub: [c.actor, c.info?.extra ? 'Figurante' : ''].filter(Boolean).join(' · ') })),
      onPick: (id) => { x.cast_ids = [...(x.cast_ids || []), id]; save(); draw(); },
    }));
    el.querySelector('[data-ppadd]')?.addEventListener('click', (e) => picker(e.currentTarget, {
      placeholder: 'Procurar adereço…',
      items: otherProps.map((pr) => ({ id: pr.id, label: pr.name, sub: [pr.category, pr.type === 'cenario' ? 'cenário' : 'ação', (pr.scene_ids || []).length ? `${pr.scene_ids.length} ${pr.scene_ids.length === 1 ? 'cena' : 'cenas'}` : 'sem cena'].filter(Boolean).join(' · ') })),
      create: (name) => `Criar o adereço «${name}»`,
      onPick: (id) => { x.prop_ids = [...(x.prop_ids || []), id]; save(); draw(); },
      onCreate: async (name) => {
        const { data: np, error } = await sb.from('props').insert({ project_id: x.project_id, name, type: 'acao', scene_ids: scene ? [scene.id] : [], character_ids: x.cast_ids || [] }).select('id, name, type, scene_ids, category, removed').single();
        if (error) return toast(error.message);
        props.push(np); x.prop_ids = [...(x.prop_ids || []), np.id]; save(); draw(); toast(`Adereço «${name}» criado e ligado a este plano.`);
      },
    }));
  };
  draw();
}


// menu pequeno com pesquisa (personagens, adereços…), junto ao botão que o abriu
const pnorm = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function picker(anchor, { items, placeholder, onPick, create, onCreate }) {
  document.querySelector('.pk')?.remove();
  const box = document.createElement('div'); box.className = 'pk';
  box.innerHTML = `<input type="search" placeholder="${esc(placeholder || 'Procurar…')}" autocomplete="off"><div class="pk-l" data-l></div>`;
  document.body.append(box);
  const r = anchor.getBoundingClientRect();
  box.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - 300))}px`;
  box.style.top = `${r.bottom + window.scrollY + 6}px`;
  const inp = box.querySelector('input'); const list = box.querySelector('[data-l]');
  let sel = 0; let shown = [];
  const close = () => { box.remove(); document.removeEventListener('mousedown', out, true); };
  const out = (e) => { if (!box.contains(e.target) && e.target !== anchor) close(); };
  document.addEventListener('mousedown', out, true);
  const draw = () => {
    const q = pnorm(inp.value).trim();
    shown = items.filter((x) => !q || pnorm(`${x.label} ${x.sub}`).includes(q)).sort((a, b) => (pnorm(a.label).startsWith(q) ? 0 : 1) - (pnorm(b.label).startsWith(q) ? 0 : 1)).slice(0, 80);
    const canCreate = create && inp.value.trim() && !items.some((x) => pnorm(x.label) === q);
    if (canCreate) shown.push({ create: true, label: inp.value.trim() });
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    list.innerHTML = shown.length ? shown.map((x, i) => `<button type="button" class="pk-i ${i === sel ? 'on' : ''} ${x.create ? 'new' : ''}" data-i="${i}">${x.create ? `+ ${esc(create(x.label))}` : `<b>${esc(x.label)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}`}</button>`).join('') : '<p class="muted small">Nada encontrado.</p>';
    list.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); choose(shown[+b.dataset.i]); }));
  };
  const choose = (x) => { if (!x) return; close(); if (x.create) onCreate?.(x.label); else onPick(x.id); };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); choose(shown[sel]); }
    else if (e.key === 'Escape') close();
  });
  draw(); setTimeout(() => inp.focus(), 20);
}
