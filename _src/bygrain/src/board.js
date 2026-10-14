import { sb, esc, signedUrls, uploadImage, toast, modal, confirmBox, ICON } from './lib.js';

// Board infinito à maneira do Milanote: cada cartão é uma linha própria na base de dados,
// por isso duas pessoas podem trabalhar no mesmo board sem se apagarem uma à outra.

const MIN = { note: [140, 80], title: [160, 50], image: [80, 60], palette: [180, 110], list: [180, 120], board: [56, 56], link: [180, 80] };
const SIZE = { note: [280, 180], title: [520, 72], palette: [320, 150], list: [280, 220], board: [96, 96], link: [300, 110] };

export function mountBoard(root, { projectId, boardId, onOpenBoard, onUp, onZoom }) {
  const items = new Map();
  const st = { view: { x: 0, y: 0, k: 1 }, sel: null, editing: null, drag: null, pointers: new Map(), pinch: null, dead: false };
  const viewKey = `bygrain-view-${boardId}`;

  root.innerHTML = `<div class="stage" tabindex="0" aria-label="Board"><div class="world"></div><div class="drop-hint" hidden>Larga as imagens para as juntar ao board</div></div>`;
  const stage = root.querySelector('.stage');
  const world = root.querySelector('.world');

  // ---------- vista ----------
  function applyView() {
    const { x, y, k } = st.view;
    world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    stage.style.backgroundPosition = `${x}px ${y}px`;
    stage.style.backgroundSize = `${24 * k}px ${24 * k}px`;
    onZoom && onZoom(k);
    clearTimeout(applyView.t);
    applyView.t = setTimeout(() => { try { localStorage.setItem(viewKey, JSON.stringify(st.view)); } catch { /* sem armazenamento */ } }, 300);
  }
  const toWorld = (cx, cy) => { const r = stage.getBoundingClientRect(); return { x: (cx - r.left - st.view.x) / st.view.k, y: (cy - r.top - st.view.y) / st.view.k }; };
  function zoomAt(cx, cy, factor) {
    const r = stage.getBoundingClientRect();
    const k2 = Math.max(0.1, Math.min(4, st.view.k * factor));
    const px = cx - r.left, py = cy - r.top;
    st.view.x = px - (px - st.view.x) * (k2 / st.view.k);
    st.view.y = py - (py - st.view.y) * (k2 / st.view.k);
    st.view.k = k2; applyView();
  }
  function zoomBy(f) { const r = stage.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
  function setZoom(k) { zoomBy(k / st.view.k); }
  function fit() {
    const r = stage.getBoundingClientRect();
    if (!items.size) { st.view = { x: r.width / 2 - 200, y: r.height / 2 - 120, k: 1 }; applyView(); return; }
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    items.forEach((it) => { x1 = Math.min(x1, it.x); y1 = Math.min(y1, it.y); x2 = Math.max(x2, it.x + it.w); y2 = Math.max(y2, it.y + it.h); });
    const pad = 120;
    const k = Math.max(0.1, Math.min(1.1, Math.min(r.width / (x2 - x1 + pad * 2), r.height / (y2 - y1 + pad * 2))));
    st.view = { k, x: r.width / 2 - ((x1 + x2) / 2) * k, y: r.height / 2 - ((y1 + y2) / 2) * k };
    applyView();
  }

  // ---------- desenhar cartões ----------
  let urls = {};
  let covers = {}; // capa automática: a primeira imagem do board de dentro
  function inner(it) {
    const d = it.data || {};
    switch (it.kind) {
      case 'note': return `<div class="txt note-txt" data-field="text">${esc(d.text || '')}</div>`;
      case 'title': return `<div class="txt title-txt" data-field="text">${esc(d.text || 'Título')}</div>`;
      case 'image': return `${urls[d.path] ? `<img src="${esc(urls[d.path])}" alt="${esc(d.caption || '')}" draggable="false">` : '<div class="img-wait">A carregar…</div>'}${d.caption ? `<div class="caption">${esc(d.caption)}</div>` : ''}`;
      case 'palette': return `<div class="txt card-h" data-field="title">${esc(d.title || 'Paleta')}</div>
        <div class="swatches">${(d.colors || []).map((c, i) => `<div class="sw"><button type="button" data-ui="color" data-i="${i}" style="background:${esc(c)}" aria-label="Mudar cor ${esc(c)}"></button><span>${esc(c.toUpperCase())}</span><button type="button" class="x" data-ui="rmcolor" data-i="${i}" aria-label="Tirar cor">${ICON.close}</button></div>`).join('')}
        <button type="button" class="sw-add" data-ui="addcolor" aria-label="Juntar cor">${ICON.plus}</button></div>`;
      case 'list': return `<div class="txt card-h" data-field="title">${esc(d.title || 'Lista')}</div>
        <ul class="checklist">${(d.items || []).map((li, i) => `<li class="${li.done ? 'done' : ''}"><button type="button" class="chk" data-ui="toggle" data-i="${i}" aria-label="${li.done ? 'Desmarcar' : 'Marcar'}">${li.done ? ICON.check : ''}</button><span class="txt" data-field="item" data-i="${i}">${esc(li.text)}</span><button type="button" class="x" data-ui="rmitem" data-i="${i}" aria-label="Tirar">${ICON.close}</button></li>`).join('')}</ul>
        <button type="button" class="add-item" data-ui="additem">${ICON.plus} Item</button>`;
      case 'board': { const cov = urls[d.cover] || covers[d.board_id];
        return `<div class="bcov" ${cov ? `style="background-image:url('${esc(cov)}')"` : ''}>${cov ? '' : ICON.board}</div><div class="txt bname" data-field="title">${esc(d.title || 'Board')}</div><button type="button" class="cov-btn" data-ui="cover" title="Mudar a capa" aria-label="Mudar a capa">${ICON.image}</button>`; }
      case 'link': { let host = ''; try { host = new URL(d.url).hostname.replace(/^www\./, ''); } catch { /* url inválido */ }
        return `<div class="txt card-h" data-field="title">${esc(d.title || host || 'Ligação')}</div><div class="link-host">${esc(host)}</div><a class="open-link" data-ui="link" href="${esc(d.url || '#')}" target="_blank" rel="noopener noreferrer">Abrir ${ICON.open}</a>`; }
      default: return '';
    }
  }
  function cardEl(it) {
    let el = world.querySelector(`[data-id="${it.id}"]`);
    if (!el) { el = document.createElement('div'); el.className = `card k-${it.kind}`; el.dataset.id = it.id; world.appendChild(el); }
    if (it.kind === 'palette') it.w = Math.max(it.w, 28 + (it.data?.colors || []).length * 70 + 40);
    el.style.cssText = `left:${it.x}px;top:${it.y}px;width:${it.w}px;height:${it.h}px;z-index:${it.z}`;
    el.innerHTML = `${inner(it)}<div class="rs" data-rs aria-hidden="true"></div>`;
    el.classList.toggle('sel', st.sel === it.id);
    return el;
  }
  function renderAll() { world.innerHTML = ''; [...items.values()].sort((a, b) => a.z - b.z).forEach(cardEl); }
  function select(id) {
    st.sel = id;
    world.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
  }

  // ---------- gravar ----------
  const saveT = new Map();
  function save(it, fields, delay = 0) {
    const run = async () => {
      saveT.delete(it.id);
      const patch = {}; fields.forEach((f) => (patch[f] = it[f]));
      const { error } = await sb.from('board_items').update(patch).eq('id', it.id);
      if (error) toast('Não foi possível guardar: ' + error.message);
    };
    clearTimeout(saveT.get(it.id));
    if (delay) saveT.set(it.id, setTimeout(run, delay)); else run();
  }
  const maxZ = () => Math.max(0, ...[...items.values()].map((i) => i.z));

  async function create(kind, at, data = {}, size) {
    const r = stage.getBoundingClientRect();
    const c = at || toWorld(r.left + r.width / 2, r.top + r.height / 2);
    const [w, h] = size || SIZE[kind] || [260, 160];
    const row = { board_id: boardId, kind, x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h, z: maxZ() + 1, data };
    const { data: ins, error } = await sb.from('board_items').insert(row).select().single();
    if (error) { toast('Não foi possível criar: ' + error.message); return null; }
    items.set(ins.id, ins); cardEl(ins); select(ins.id);
    return ins;
  }

  async function add(kind) {
    if (kind === 'image') return pickImages();
    if (kind === 'board') {
      const { data: b, error } = await sb.from('boards').insert({ project_id: projectId, parent_id: boardId, title: 'Novo board' }).select().single();
      if (error) return toast(error.message);
      return create('board', null, { board_id: b.id, title: 'Novo board' });
    }
    if (kind === 'link') {
      const m = modal(`<h2>Juntar ligação</h2><form class="stack"><div class="field"><label for="lurl">Endereço</label><input id="lurl" type="url" placeholder="https://" required></div><div class="field"><label for="ltit">Nome (opcional)</label><input id="ltit"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`);
      m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); let u = m.el.querySelector('#lurl').value.trim(); if (!u) return; if (!/^https?:\/\//.test(u)) u = 'https://' + u; create('link', null, { url: u, title: m.el.querySelector('#ltit').value.trim() }); m.close(); });
      return;
    }
    const defaults = { note: { text: '' }, title: { text: 'Título' }, palette: { title: 'Paleta', colors: ['#1E2AD4', '#F4F1E8', '#0C0C12'] }, list: { title: 'Lista', items: [{ text: 'Primeiro item', done: false }] } };
    const it = await create(kind, null, defaults[kind] || {});
    if (it && (kind === 'note' || kind === 'title')) startEdit(it.id, world.querySelector(`[data-id="${it.id}"] .txt`));
  }

  function pickImages() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => addImages([...inp.files]);
    inp.click();
  }
  async function addImages(files, at) {
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!imgs.length) return;
    toast(imgs.length > 1 ? `A enviar ${imgs.length} imagens…` : 'A enviar a imagem…', 6000);
    let off = 0;
    for (const f of imgs) {
      try {
        const up = await uploadImage(projectId, 'board', f);
        const w = 320, h = Math.round(320 * (up.h / up.w));
        const p = at ? { x: at.x + off, y: at.y + off } : null;
        urls = { ...urls, ...(await signedUrls([up.path])) };
        await create('image', p, { path: up.path, w: up.w, h: up.h }, [w, h]);
        off += 30;
      } catch (e) { toast('Falhou: ' + (e.message || e)); }
    }
    toast('Pronto.');
  }

  // ---------- editar texto ----------
  function startEdit(id, el) {
    if (!el) return;
    st.editing = { id, el };
    el.contentEditable = 'plaintext-only';
    if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function commitEdit() {
    const ed = st.editing; if (!ed) return;
    st.editing = null; ed.el.contentEditable = 'false';
    const it = items.get(ed.id); if (!it) return;
    const text = ed.el.innerText.replace(/\n$/, '');
    const f = ed.el.dataset.field;
    const d = { ...(it.data || {}) };
    if (f === 'item') { const i = +ed.el.dataset.i; d.items = [...(d.items || [])]; if (text.trim()) d.items[i] = { ...d.items[i], text }; else d.items.splice(i, 1); }
    else d[f] = text;
    it.data = d; save(it, ['data']);
    if (f === 'item' || it.kind === 'board') cardEl(it);
    if (it.kind === 'board' && f === 'title' && d.board_id) sb.from('boards').update({ title: text || 'Board' }).eq('id', d.board_id).then(() => {});
  }

  // ---------- botões dentro dos cartões ----------
  async function onUi(btn, it) {
    const d = { ...(it.data || {}) }; const i = +btn.dataset.i;
    switch (btn.dataset.ui) {
      case 'toggle': d.items = d.items.map((x, j) => (j === i ? { ...x, done: !x.done } : x)); break;
      case 'rmitem': d.items = d.items.filter((_, j) => j !== i); break;
      case 'additem': {
        d.items = [...(d.items || []), { text: 'Novo item', done: false }]; it.data = d; save(it, ['data']); cardEl(it);
        const els = world.querySelectorAll(`[data-id="${it.id}"] [data-field="item"]`); const last = els[els.length - 1];
        if (last) { const r = document.createRange(); startEdit(it.id, last); r.selectNodeContents(last); getSelection().removeAllRanges(); getSelection().addRange(r); }
        return;
      }
      case 'addcolor': case 'rmcolor': {
        d.colors = btn.dataset.ui === 'addcolor' ? [...(d.colors || []), '#888888'] : d.colors.filter((_, j) => j !== i);
        // a paleta alarga ou encolhe com o número de cores
        it.w = Math.max(MIN.palette[0], 28 + d.colors.length * 70 + 40);
        it.data = d; save(it, ['data', 'w']); cardEl(it); return;
      }
      case 'color': {
        const inp = document.createElement('input'); inp.type = 'color'; inp.value = d.colors[i];
        inp.style.cssText = 'position:fixed;opacity:0;pointer-events:none;left:50%;top:50%';
        document.body.appendChild(inp);
        inp.addEventListener('input', () => { d.colors[i] = inp.value; it.data = { ...d }; cardEl(it); save(it, ['data'], 400); });
        inp.addEventListener('change', () => inp.remove());
        inp.click(); return;
      }
      case 'openboard': return d.board_id && onOpenBoard(d.board_id);
      case 'cover': {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = async () => {
          try { toast('A enviar a capa…'); const up = await uploadImage(projectId, 'board', inp.files[0]); urls = { ...urls, ...(await signedUrls([up.path])) }; it.data = { ...it.data, cover: up.path }; save(it, ['data']); cardEl(it); toast('Capa mudada.'); } catch (e) { toast(e.message || String(e)); }
        };
        inp.click(); return;
      }
      case 'link': return;
      default: return;
    }
    it.data = d; save(it, ['data']); cardEl(it);
  }

  // ---------- rato, dedos e trackpad ----------
  stage.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pointers.size === 2) {
      const [a, b] = [...st.pointers.values()];
      st.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), k: st.view.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: st.view.x, vy: st.view.y };
      st.drag = null; return;
    }
    const card = e.target.closest('.card');
    const ui = e.target.closest('[data-ui]');
    if (st.editing && e.target.closest('.txt') === st.editing.el) return;
    if (st.editing) commitEdit();
    if (ui) return;
    if (!card) {
      select(null);
      st.drag = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: st.view.x, vy: st.view.y };
      stage.classList.add('panning');
    } else {
      const it = items.get(card.dataset.id); if (!it) return;
      select(it.id);
      if (it.z < maxZ()) { it.z = maxZ() + 1; card.style.zIndex = it.z; save(it, ['z']); }
      const rs = e.target.closest('[data-rs]');
      st.drag = { mode: rs ? 'resize' : 'move', id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, ow: it.w, oh: it.h, moved: false };
    }
    e.preventDefault();
  });
  const onMove = (e) => {
    if (st.pointers.has(e.pointerId)) st.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (st.pinch && st.pointers.size === 2) {
      const [a, b] = [...st.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y); const p = st.pinch;
      const k2 = Math.max(0.1, Math.min(4, p.k * (d / p.d)));
      const r = stage.getBoundingClientRect(); const cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
      const wx = (p.cx - r.left - p.vx) / p.k, wy = (p.cy - r.top - p.vy) / p.k;
      st.view = { k: k2, x: cx - wx * k2, y: cy - wy * k2 }; applyView(); return;
    }
    const g = st.drag; if (!g) return;
    const dx = e.clientX - g.sx, dy = e.clientY - g.sy;
    if (g.mode === 'pan') { st.view.x = g.vx + dx; st.view.y = g.vy + dy; applyView(); return; }
    const it = items.get(g.id); if (!it) return;
    if (Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
    const k = st.view.k; const el = world.querySelector(`[data-id="${it.id}"]`);
    if (g.mode === 'move') { it.x = Math.round(g.ox + dx / k); it.y = Math.round(g.oy + dy / k); el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; }
    else {
      const [mw, mh] = MIN[it.kind] || [80, 60];
      let w = Math.max(mw, g.ow + dx / k), h = Math.max(mh, g.oh + dy / k);
      if (it.kind === 'image' && it.data?.w) h = w * (it.data.h / it.data.w);
      it.w = Math.round(w); it.h = Math.round(h); el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
    }
  };
  window.addEventListener('pointermove', onMove);
  const end = (e) => {
    st.pointers.delete(e.pointerId);
    if (st.pointers.size < 2) st.pinch = null;
    const g = st.drag; st.drag = null; stage.classList.remove('panning');
    if (!g || g.mode === 'pan') return;
    const it = items.get(g.id); if (!it) return;
    if (g.moved) save(it, g.mode === 'move' ? ['x', 'y'] : ['w', 'h']);
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  stage.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.card'); if (!card) { add('note').then(() => {}); return; }
    const it = items.get(card.dataset.id); if (!it) return;
    const txt = e.target.closest('.txt') || (it.kind === 'note' || it.kind === 'title' ? card.querySelector('.txt') : null);
    if (it.kind === 'board') { if (!e.target.closest('[data-ui]')) onOpenBoard(it.data.board_id); return; }
    if (it.kind === 'image') return editCaption(it);
    if (txt) startEdit(it.id, txt);
  });
  stage.addEventListener('click', (e) => {
    const ui = e.target.closest('[data-ui]'); if (!ui) return;
    const card = ui.closest('.card'); const it = card && items.get(card.dataset.id); if (!it) return;
    if (ui.dataset.ui !== 'link') e.preventDefault();
    onUi(ui, it);
  });

  function editCaption(it) {
    const m = modal(`<h2>Legenda da imagem</h2><form class="stack"><div class="field"><label for="cap">Legenda</label><input id="cap" value="${esc(it.data?.caption || '')}"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); it.data = { ...it.data, caption: m.el.querySelector('#cap').value.trim() }; save(it, ['data']); cardEl(it); m.close(); });
  }

  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.01)));
    else { st.view.x -= e.deltaX; st.view.y -= e.deltaY; applyView(); }
  }, { passive: false });

  // largar e colar imagens
  stage.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); root.querySelector('.drop-hint').hidden = false; } });
  stage.addEventListener('dragleave', (e) => { if (e.target === stage) root.querySelector('.drop-hint').hidden = true; });
  stage.addEventListener('drop', (e) => { e.preventDefault(); root.querySelector('.drop-hint').hidden = true; addImages([...e.dataTransfer.files], toWorld(e.clientX, e.clientY)); });
  const onPaste = (e) => {
    if (st.editing || /INPUT|TEXTAREA/.test(document.activeElement?.tagName) || document.querySelector('#modal.open')) return;
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addImages(files); return; }
    const t = e.clipboardData?.getData('text/plain')?.trim();
    if (t && /^https?:\/\/\S+$/.test(t)) { e.preventDefault(); create('link', null, { url: t, title: '' }); }
    else if (t) { e.preventDefault(); create('note', null, { text: t }); }
  };
  document.addEventListener('paste', onPaste);

  // teclado
  const onKey = async (e) => {
    if (document.querySelector('#modal.open')) return;
    const typing = st.editing || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName);
    if (st.editing && e.key === 'Escape') { e.preventDefault(); commitEdit(); return; }
    if (st.editing && e.key === 'Enter' && st.editing.el.dataset.field === 'item' && !e.shiftKey) {
      e.preventDefault(); const it = items.get(st.editing.id); commitEdit(); if (it) onUi({ dataset: { ui: 'additem' } }, it); return;
    }
    if (st.editing && e.key === 'Enter' && st.editing.el.dataset.field !== 'text' && !e.shiftKey) { e.preventDefault(); commitEdit(); return; }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.2); }
    else if (mod && e.key === '-') { e.preventDefault(); zoomBy(1 / 1.2); }
    else if (mod && e.key === '0') { e.preventDefault(); fit(); }
    else if (mod && e.key.toLowerCase() === 'd' && st.sel) {
      e.preventDefault(); const it = items.get(st.sel); if (!it || it.kind === 'board') return;
      create(it.kind, { x: it.x + it.w / 2 + 30, y: it.y + it.h / 2 + 30 }, JSON.parse(JSON.stringify(it.data)), [it.w, it.h]);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel && (stage.contains(document.activeElement) || document.activeElement === document.body)) {
      e.preventDefault(); const it = items.get(st.sel); if (!it) return;
      if (it.kind === 'board' && !(await confirmBox(`Apagar o board "${it.data?.title || 'Board'}" e tudo o que tem dentro?`, 'Apagar'))) return;
      await remove(it);
    } else if (e.key === 'Escape') {
      if (st.sel) select(null); else onUp && onUp();
    } else if (e.key === 'Enter' && st.sel) {
      const it = items.get(st.sel); const txt = world.querySelector(`[data-id="${st.sel}"] .txt`);
      if (it && txt) { e.preventDefault(); startEdit(it.id, txt); }
    }
  };
  document.addEventListener('keydown', onKey);

  async function remove(it) {
    items.delete(it.id); world.querySelector(`[data-id="${it.id}"]`)?.remove(); st.sel = null;
    const { error } = await sb.from('board_items').delete().eq('id', it.id);
    if (error) return toast(error.message);
    if (it.kind === 'board' && it.data?.board_id) await sb.from('boards').delete().eq('id', it.data.board_id);
    if (it.kind === 'image' && it.data?.path) await sb.storage.from('files').remove([it.data.path]);
    toast('Apagado.');
  }

  // ---------- tempo real ----------
  const ch = sb.channel('board-' + boardId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'board_items', filter: `board_id=eq.${boardId}` }, async ({ new: row }) => {
      if (items.has(row.id)) return;
      if (row.kind === 'image' && row.data?.path) urls = { ...urls, ...(await signedUrls([row.data.path])) };
      items.set(row.id, row); cardEl(row);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'board_items', filter: `board_id=eq.${boardId}` }, ({ new: row }) => {
      if (st.drag?.id === row.id || st.editing?.id === row.id || saveT.has(row.id)) return;
      const cur = items.get(row.id); if (!cur) return;
      if (cur.updated_at && row.updated_at && row.updated_at < cur.updated_at) return;
      items.set(row.id, row); cardEl(row);
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'board_items' }, ({ old }) => {
      if (old?.id && items.has(old.id)) { items.delete(old.id); world.querySelector(`[data-id="${old.id}"]`)?.remove(); }
    })
    .subscribe();

  // ---------- carregar ----------
  (async () => {
    const { data, error } = await sb.from('board_items').select('*').eq('board_id', boardId);
    if (st.dead) return;
    if (error) { toast(error.message); return; }
    data.forEach((r) => items.set(r.id, r));
    const childIds = data.filter((r) => r.kind === 'board' && r.data?.board_id).map((r) => r.data.board_id);
    let firstImgs = [];
    if (childIds.length) { const { data: imgs } = await sb.from('board_items').select('board_id, data, z').in('board_id', childIds).eq('kind', 'image').order('z'); firstImgs = imgs || []; }
    urls = await signedUrls([...data.filter((r) => r.kind === 'image').map((r) => r.data?.path), ...data.filter((r) => r.kind === 'board').map((r) => r.data?.cover), ...firstImgs.map((i) => i.data?.path)]);
    firstImgs.forEach((i) => { if (!covers[i.board_id] && urls[i.data?.path]) covers[i.board_id] = urls[i.data.path]; });
    renderAll();
    let saved = null; try { saved = JSON.parse(localStorage.getItem(viewKey) || 'null'); } catch { /* nada */ }
    if (saved && Number.isFinite(saved.k)) { st.view = saved; applyView(); } else fit();
  })();
  applyView();
  stage.focus({ preventScroll: true });

  return {
    add, fit, zoomBy, setZoom,
    get zoom() { return st.view.k; },
    destroy() {
      st.dead = true; commitEdit();
      document.removeEventListener('keydown', onKey); document.removeEventListener('paste', onPaste);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      sb.removeChannel(ch);
    },
  };
}
