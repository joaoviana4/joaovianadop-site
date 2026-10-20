import { sb, esc, toast, ICON, saveLater } from './lib.js';

// Grelha com encaixe (Studio): cada página é feita de elementos que se arrastam e redimensionam numa grelha
// de 12 colunas. Os elementos sobem sozinhos para ocupar os espaços vazios (como num dashboard).
// Altura: automática (segue o conteúdo) até alguém a esticar; duplo clique na pega do canto volta a automática.
// Guardado em projects.layouts[key] = { grid: { id: { x, y, w, h } }, hidden: [ids], extra: [...] } (igual para a equipa).

export const COLS = 12;
const ROW = 8; // altura de uma linha da grelha (px)
const GAP = 18; // espaço entre elementos (px)
const MOBILE = 900;

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.span && b.y < a.y + a.span;

export function mountGrid(root, { project, key, items, onRemove, onChange }) {
  const saved = project.layouts?.[key] || {};
  const pos = saved.grid || {};
  let hidden = new Set(saved.hidden || []);
  // nomes dados pela equipa a cada elemento (layouts[key].titles)
  const titles = { ...(saved.titles || {}) };
  const nameOf = (it) => titles[it.id] || it.label || '';
  const applyTitle = (it) => {
    const l = it.g?.querySelector('.gi-l'); if (l) l.textContent = nameOf(it);
    const h = [...it.el.querySelectorAll('h2, h3')].find((x) => !x.closest('.gi-bar')); if (!h) return;
    if (!h.dataset.orig) h.dataset.orig = h.textContent;
    h.textContent = titles[it.id] || h.dataset.orig;
  };
  const saveTitles = saveLater(async () => {
    const layouts = { ...(project.layouts || {}), [key]: { ...(project.layouts?.[key] || {}), titles } };
    project.layouts = layouts;
    const { error } = await sb.from('projects').update({ layouts }).eq('id', project.id);
    if (error) toast('Não foi possível guardar o nome: ' + error.message);
  }, 300);
  function rename(it) {
    const l = it.g.querySelector('.gi-l'); const inp = document.createElement('input');
    inp.className = 'gi-in'; inp.value = nameOf(it); inp.setAttribute('aria-label', 'Nome do elemento');
    l.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true; inp.replaceWith(l);
      if (ok) { const v = inp.value.trim(); if (!v || v === it.label) delete titles[it.id]; else titles[it.id] = v; saveTitles(); }
      applyTitle(it); onChange?.();
    };
    inp.addEventListener('keydown', (k) => { if (k.key === 'Enter') finish(true); else if (k.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
  }
  const list = [];
  root.classList.add('cg');
  root.style.setProperty('--cg-row', `${ROW}px`); root.style.setProperty('--cg-gap', `${GAP}px`);

  const save = saveLater(async () => {
    const grid = Object.fromEntries(list.map((it) => [it.id, { x: it.x, y: it.y, w: it.w, h: it.h }]));
    const layouts = { ...(project.layouts || {}), [key]: { ...(project.layouts?.[key] || {}), grid, hidden: [...hidden] } };
    project.layouts = layouts;
    const { error } = await sb.from('projects').update({ layouts }).eq('id', project.id);
    if (error) toast('Não foi possível guardar a arrumação: ' + error.message);
  }, 600);

  const mobile = () => root.clientWidth < MOBILE;
  const colW = () => (root.clientWidth - GAP * (COLS - 1)) / COLS;

  function wrap(it) {
    const g = document.createElement('div');
    g.className = 'gi'; g.dataset.gi = it.id;
    g.innerHTML = `<div class="gi-bar" role="toolbar" aria-label="${esc(it.label || 'Elemento')}">
        <span class="gi-grip" title="Arrasta para mudar de sítio" aria-hidden="true">⠿</span><span class="gi-l" title="Duplo clique para mudar o nome">${esc(nameOf(it))}</span><button type="button" class="gi-b" data-gname title="Mudar o nome" aria-label="Mudar o nome de ${esc(nameOf(it))}">✎</button>
        ${it.copy ? `<button type="button" class="gi-b" data-gcopy title="Copiar (depois cola noutra página com Ctrl+V)" aria-label="Copiar ${esc(it.label || '')}">${ICON.copy}</button>` : ''}
        ${it.removable !== false ? `<button type="button" class="gi-b" data-grm title="${it.id.startsWith('x:') ? 'Apagar desta página' : 'Tirar desta página (volta pela barra da direita)'}" aria-label="Tirar ${esc(it.label || '')} desta página">${ICON.trash}</button>` : ''}
      </div><div class="gi-c"></div><span class="gi-rs" title="Arrasta para redimensionar · duplo clique: altura automática" aria-hidden="true"></span>`;
    g.querySelector('.gi-c').append(it.el);
    it.g = g;
    g.querySelector('[data-gname]').addEventListener('click', () => rename(it));
    g.querySelector('.gi-l').addEventListener('dblclick', () => rename(it));
    applyTitle(it);
    g.querySelector('[data-gcopy]')?.addEventListener('click', () => it.copy());
    g.querySelector('[data-grm]')?.addEventListener('click', () => remove(it.id));
    g.querySelector('.gi-grip').addEventListener('pointerdown', (e) => startDrag(e, it));
    g.querySelector('.gi-rs').addEventListener('pointerdown', (e) => startResize(e, it));
    g.querySelector('.gi-rs').addEventListener('dblclick', () => { it.h = 0; layout(); save(); });
    // altura automática: acompanha o conteúdo
    new ResizeObserver(() => { if (!it.h) schedule(); }).observe(g.querySelector('.gi-c'));
    return g;
  }
  const spanOf = (it) => {
    if (it.h) return it.h;
    const c = it.g.querySelector('.gi-c');
    return Math.max(4, Math.ceil((c.scrollHeight + GAP) / ROW));
  };

  // arruma: o elemento "preso" (o que se está a arrastar) fica onde está; os outros sobem o mais possível
  function compact(pinned) {
    const vis = list.filter((it) => !hidden.has(it.id));
    vis.forEach((it) => { it.span = spanOf(it); it.w = Math.max(1, Math.min(COLS, it.w)); it.x = Math.max(0, Math.min(COLS - it.w, it.x)); });
    const order = [...vis].sort((a, b) => (a === pinned ? -1 : b === pinned ? 1 : 0) || a.y - b.y || a.x - b.x);
    const placed = [];
    order.forEach((it) => {
      if (it !== pinned) { it.y = Math.max(0, Math.min(it.y, 100000)); let y = 0; while (placed.some((o) => overlaps({ ...it, y }, o))) y++; it.y = y; }
      else it.y = Math.max(0, it.y);
      placed.push(it);
    });
  }
  function apply(skip) {
    list.forEach((it) => {
      const g = it.g; g.hidden = hidden.has(it.id); if (g.hidden || it === skip) return;
      g.style.gridColumn = `${it.x + 1} / span ${it.w}`; g.style.gridRow = `${it.y + 1} / span ${it.span}`;
      g.classList.toggle('fixed', !!it.h);
      if (it.h) g.querySelector('.gi-c').style.height = `${it.h * ROW - GAP}px`; else g.querySelector('.gi-c').style.height = '';
    });
  }
  let raf = 0;
  const schedule = () => { if (raf || drag) return; raf = requestAnimationFrame(() => { raf = 0; layout(); }); };
  function layout() { if (mobile()) { root.classList.add('cg-stack'); return; } root.classList.remove('cg-stack'); compact(null); apply(); }

  // ---------- arrastar ----------
  let drag = null;
  function startDrag(e, it) {
    if (mobile() || e.button !== 0) return;
    e.preventDefault();
    const r = it.g.getBoundingClientRect(), R = root.getBoundingClientRect();
    drag = { it, dx: e.clientX - r.left, dy: e.clientY - r.top, R, ph: document.createElement('div') };
    drag.ph.className = 'gi-ph'; root.append(drag.ph);
    it.g.classList.add('dragging');
    Object.assign(it.g.style, { position: 'fixed', left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, zIndex: 60 });
    const move = (ev) => {
      const R2 = root.getBoundingClientRect(); const cw = colW();
      it.g.style.left = `${ev.clientX - drag.dx}px`; it.g.style.top = `${ev.clientY - drag.dy}px`;
      const lx = ev.clientX - drag.dx - R2.left, ly = ev.clientY - drag.dy - R2.top;
      it.x = Math.max(0, Math.min(COLS - it.w, Math.round(lx / (cw + GAP)))); it.y = Math.max(0, Math.round(ly / ROW));
      compact(it); apply(it);
      drag.ph.style.gridColumn = `${it.x + 1} / span ${it.w}`; drag.ph.style.gridRow = `${it.y + 1} / span ${it.span}`;
      autoScroll(ev.clientY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up);
      it.g.classList.remove('dragging'); ['position', 'left', 'top', 'width', 'zIndex'].forEach((k) => { it.g.style[k] = ''; });
      drag.ph.remove(); drag = null; layout(); save(); onChange?.();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }
  const autoScroll = (y) => { if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 50) window.scrollBy(0, 14); };

  // ---------- redimensionar ----------
  function startResize(e, it) {
    if (mobile() || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = it.g.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY;
    it.g.classList.add('resizing'); drag = { it };
    const move = (ev) => {
      const cw = colW();
      it.w = Math.max(2, Math.min(COLS - it.x, Math.round((r.width + ev.clientX - sx + GAP) / (cw + GAP))));
      it.h = Math.max(6, Math.round((r.height + ev.clientY - sy + GAP) / ROW));
      compact(it); apply();
      autoScroll(ev.clientY);
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); it.g.classList.remove('resizing'); drag = null; layout(); save(); onChange?.(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
  }

  function remove(id) {
    const it = list.find((x) => x.id === id); if (!it) return;
    if (onRemove && onRemove(it)) { list.splice(list.indexOf(it), 1); it.g.remove(); }
    else hidden.add(id);
    layout(); save(); onChange?.();
  }
  function add(it, { at = 'end' } = {}) {
    const p0 = pos[it.id];
    const bottom = list.filter((x) => !hidden.has(x.id)).reduce((m, x) => Math.max(m, x.y + (x.span || 0)), 0);
    const obj = { ...it, x: p0?.x ?? it.x ?? 0, y: p0?.y ?? (at === 'end' ? bottom : 0), w: p0?.w ?? it.w ?? COLS, h: p0?.h ?? it.h ?? 0 };
    list.push(obj); root.append(wrap(obj));
    return obj;
  }

  items.forEach((it) => add(it));
  // os novos (sem posição guardada) vão para o fim, pela ordem dada
  requestAnimationFrame(() => { layout(); });
  window.addEventListener('resize', schedule);

  return {
    add(it) { const o = add(it); hidden.delete(it.id); requestAnimationFrame(() => { layout(); save(); o.g.scrollIntoView({ behavior: 'smooth', block: 'center' }); }); onChange?.(); return o; },
    show(id) { hidden.delete(id); layout(); save(); onChange?.(); list.find((x) => x.id === id)?.g.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    isHidden: (id) => hidden.has(id),
    has: (id) => list.some((x) => x.id === id),
    items: () => list,
    layout,
  };
}
