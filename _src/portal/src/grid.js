import { sb, esc, toast, ICON, saveLater, onLeave } from './lib.js';

// Página livre (Studio), como um board do Milanote: cada elemento fica exatamente onde é largado e pode ficar por
// cima de outro. Nada se mexe sozinho. O que fica por cima decide-se nas camadas (botões do elemento ou "Camadas"
// na barra da direita). Posições alinhadas a 12 colunas e a linhas de 24 px (Alt ao arrastar: passo fino de 8 px).
// Enquanto ninguém mexeu na página, ela arruma-se sozinha (cada bloco por baixo do anterior); ao primeiro arrastar
// fica tudo fixo. "Arrumar" (barra da direita) volta a encostar tudo de uma vez.
// Altura: automática (segue o conteúdo) até alguém a esticar; duplo clique na pega do canto volta a automática.
// Guardado em projects.layouts[key] = { grid: { id: { x, y, w, h, z } }, hidden: [ids], titles, extra } (igual para a equipa).
// Unidades: x e w em colunas; y e h em linhas de 8 px (h inclui o espaço de 18 px por baixo).

export const COLS = 12;
const ROW = 8; // altura de uma linha (px)
const SNAP = 3; // ao arrastar, encaixa de 3 em 3 linhas (24 px)
const GAP = 18; // espaço entre colunas (px)
const MOBILE = 900;

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.span && b.y < a.y + a.span;
const FRONT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" stroke="none"/><path d="M4 15V5a1 1 0 0 1 1-1h10"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2"/><path d="M20 9v10a1 1 0 0 1-1 1H9"/></svg>';

export function mountGrid(root, { project, key, items, onRemove, onChange }) {
  const saved = project.layouts?.[key] || {};
  const pos = saved.grid || {};
  let hidden = new Set(saved.hidden || []);
  // livre: alguém já arrumou esta página à mão, por isso nada se mexe sozinho
  let free = !!saved.grid;
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
  const list = []; const ros = [];
  root.classList.add('cg', 'cg-free');

  const save = saveLater(async () => {
    const grid = Object.fromEntries(list.map((it) => [it.id, { x: it.x, y: it.y, w: it.w, h: it.h, z: it.z }]));
    const layouts = { ...(project.layouts || {}), [key]: { ...(project.layouts?.[key] || {}), grid, hidden: [...hidden] } };
    project.layouts = layouts;
    const { error } = await sb.from('projects').update({ layouts }).eq('id', project.id);
    if (error) toast('Não foi possível guardar a arrumação: ' + error.message);
  }, 600);

  const mobile = () => root.clientWidth < MOBILE;
  const colW = () => (root.clientWidth - GAP * (COLS - 1)) / COLS;
  const vis = () => list.filter((it) => !hidden.has(it.id));
  // posição em CSS: acompanha a largura da página sem contas em JavaScript
  const leftCss = (x) => `calc((100% - ${GAP * (COLS - 1)}px) / ${COLS} * ${x} + ${GAP * x}px)`;
  const widthCss = (w) => `calc((100% - ${GAP * (COLS - 1)}px) / ${COLS} * ${w} + ${GAP * (w - 1)}px)`;

  function wrap(it) {
    const g = document.createElement('div');
    g.className = 'gi'; g.dataset.gi = it.id;
    g.innerHTML = `<div class="gi-bar" role="toolbar" aria-label="${esc(it.label || 'Elemento')}" title="Arrasta por aqui para mudar de sítio">
        <span class="gi-grip" aria-hidden="true">⠿</span><span class="gi-l" title="Duplo clique para mudar o nome">${esc(nameOf(it))}</span><button type="button" class="gi-b" data-gname title="Mudar o nome" aria-label="Mudar o nome de ${esc(nameOf(it))}">✎</button>
        <button type="button" class="gi-b" data-gz="front" title="Trazer para a frente" aria-label="Trazer ${esc(it.label || '')} para a frente">${FRONT}</button>
        <button type="button" class="gi-b" data-gz="back" title="Enviar para trás" aria-label="Enviar ${esc(it.label || '')} para trás">${BACK}</button>
        ${it.copy ? `<button type="button" class="gi-b" data-gcopy title="Copiar (depois cola noutra página com Ctrl+V)" aria-label="Copiar ${esc(it.label || '')}">${ICON.copy}</button>` : ''}
        ${it.removable !== false ? `<button type="button" class="gi-b" data-grm title="${it.id.startsWith('x:') ? 'Apagar desta página' : 'Tirar desta página (volta pela barra da direita)'}" aria-label="Tirar ${esc(it.label || '')} desta página">${ICON.trash}</button>` : ''}
      </div><div class="gi-c"></div><span class="gi-rs" title="Arrasta para redimensionar · duplo clique: altura automática" aria-hidden="true"></span>`;
    g.querySelector('.gi-c').append(it.el);
    it.g = g;
    g.querySelector('[data-gname]').addEventListener('click', () => rename(it));
    g.querySelector('.gi-l').addEventListener('dblclick', () => rename(it));
    applyTitle(it);
    g.querySelectorAll('[data-gz]').forEach((b) => b.addEventListener('click', () => restack(it.id, b.dataset.gz)));
    g.querySelector('[data-gcopy]')?.addEventListener('click', () => it.copy());
    g.querySelector('[data-grm]')?.addEventListener('click', () => remove(it.id));
    // arrasta-se pela barra inteira (não só pela pega)
    g.querySelector('.gi-bar').addEventListener('pointerdown', (e) => startDrag(e, it));
    g.querySelector('.gi-rs').addEventListener('pointerdown', (e) => startResize(e, it));
    g.querySelector('.gi-rs').addEventListener('dblclick', () => { it.h = 0; place(it); fitHeight(); save(); });
    // altura automática: acompanha o conteúdo (só mexe nos outros enquanto a página se arruma sozinha)
    { const ro = new ResizeObserver(() => schedule()); ro.observe(g.querySelector('.gi-c')); ros.push(ro); }
    return g;
  }
  const spanOf = (it) => (it.h ? it.h : Math.max(4, Math.ceil(((it.g?.offsetHeight || 0) + GAP) / ROW)));

  function place(it) {
    const g = it.g; g.hidden = hidden.has(it.id); if (g.hidden) return;
    g.style.left = leftCss(it.x); g.style.width = widthCss(it.w); g.style.top = `${it.y * ROW}px`; g.style.zIndex = String(it.z || 1);
    g.classList.toggle('fixed', !!it.h);
    g.querySelector('.gi-c').style.height = it.h ? `${it.h * ROW - GAP}px` : '';
  }
  // a página tem a altura do elemento que vai mais abaixo
  function fitHeight(extra = 0) {
    const b = vis().reduce((m, it) => Math.max(m, it.y * ROW + it.g.offsetHeight), 0);
    root.style.height = `${Math.max(b, extra) + 48}px`;
  }
  // arrumação automática (página ainda não mexida, ou "Arrumar"): cada um sobe o mais possível
  function pack() {
    const v = vis();
    v.forEach((it) => { it.span = spanOf(it); it.w = Math.max(1, Math.min(COLS, it.w)); it.x = Math.max(0, Math.min(COLS - it.w, it.x)); });
    const placed = [];
    [...v].sort((a, b) => a.y - b.y || a.x - b.x).forEach((it) => { let y = 0; while (placed.some((o) => overlaps({ ...it, y }, o))) y++; it.y = y; placed.push(it); });
  }
  let raf = 0;
  const schedule = () => { if (raf || busy) return; raf = requestAnimationFrame(() => { raf = 0; layout(); }); };
  function layout() {
    if (mobile()) { root.classList.add('cg-stack'); root.style.height = ''; return; }
    root.classList.remove('cg-stack');
    if (!free) pack();
    list.forEach(place); fitHeight();
  }
  // a partir do primeiro arrastar, nada se mexe sozinho
  const freeze = () => { free = true; };

  // ---------- camadas ----------
  function restack(id, dir) {
    const it = list.find((x) => x.id === id); if (!it) return;
    freeze();
    const order = [...list].sort((a, b) => (a.z || 0) - (b.z || 0));
    const i = order.indexOf(it); order.splice(i, 1);
    const j = dir === 'front' ? order.length : dir === 'back' ? 0 : dir === 'up' ? Math.min(order.length, i + 1) : Math.max(0, i - 1);
    order.splice(j, 0, it);
    order.forEach((x, k) => { x.z = k + 1; if (x.g) x.g.style.zIndex = String(x.z); });
    save(); onChange?.();
  }

  // ---------- arrastar ----------
  let busy = null;
  const autoScroll = (y) => { if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 50) window.scrollBy(0, 14); };
  function startDrag(e, it) {
    if (mobile() || e.button !== 0 || e.target.closest('button, input, a')) return;
    e.preventDefault();
    if (!free) { layout(); freeze(); }
    const cw = colW(); const R0 = root.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY, left0 = it.x * (cw + GAP), top0 = it.y * ROW;
    let nx = it.x, ny = it.y, ev = e, rf = 0;
    busy = it; root.classList.add('cg-show'); it.g.classList.add('dragging'); it.g.style.zIndex = '100000';
    const step = () => {
      rf = 0;
      const R = root.getBoundingClientRect();
      const dx = ev.clientX - sx, dy = ev.clientY - sy + (R0.top - R.top);
      nx = Math.max(0, Math.min(COLS - it.w, Math.round((left0 + dx) / (cw + GAP))));
      ny = Math.max(0, ev.altKey ? Math.round((top0 + dy) / ROW) : Math.round((top0 + dy) / (ROW * SNAP)) * SNAP);
      // só o elemento arrastado se mexe (transform: rápido), sempre em cima da grelha
      it.g.style.transform = `translate(${nx * (cw + GAP) - left0}px, ${ny * ROW - top0}px)`;
      if (ny * ROW + it.g.offsetHeight + 48 > root.offsetHeight) fitHeight(ny * ROW + it.g.offsetHeight);
      autoScroll(ev.clientY);
    };
    const move = (m) => { ev = m; if (!rf) rf = requestAnimationFrame(step); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(rf); if (ev !== e) step();
      it.x = nx; it.y = ny; it.g.style.transform = '';
      it.g.classList.remove('dragging'); root.classList.remove('cg-show'); busy = null;
      place(it); fitHeight(); save(); onChange?.();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  // ---------- redimensionar ----------
  function startResize(e, it) {
    if (mobile() || e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    if (!free) { layout(); freeze(); }
    const r = it.g.getBoundingClientRect(); const sx = e.clientX, sy = e.clientY; const cw = colW();
    busy = it; it.g.classList.add('resizing'); root.classList.add('cg-show');
    let ev = e, rf = 0;
    const step = () => {
      rf = 0;
      it.w = Math.max(2, Math.min(COLS - it.x, Math.round((r.width + ev.clientX - sx + GAP) / (cw + GAP))));
      it.h = Math.max(6, Math.round((r.height + ev.clientY - sy + GAP) / (ROW * SNAP)) * SNAP);
      place(it); if (it.y * ROW + it.h * ROW + 48 > root.offsetHeight) fitHeight(it.y * ROW + it.h * ROW);
      autoScroll(ev.clientY);
    };
    const move = (m) => { ev = m; if (!rf) rf = requestAnimationFrame(step); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(rf); if (ev !== e) step();
      it.g.classList.remove('resizing'); root.classList.remove('cg-show'); busy = null;
      fitHeight(); save(); onChange?.();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  function remove(id) {
    const it = list.find((x) => x.id === id); if (!it) return;
    if (onRemove && onRemove(it)) { list.splice(list.indexOf(it), 1); it.g.remove(); }
    else hidden.add(id);
    layout(); save(); onChange?.();
  }
  function add(it, { at = 'end' } = {}) {
    const p0 = pos[it.id];
    const bottom = list.filter((x) => !hidden.has(x.id) && x.g).reduce((m, x) => Math.max(m, x.y + spanOf(x)), 0);
    const z = p0?.z ?? list.reduce((m, x) => Math.max(m, x.z || 0), 0) + 1;
    const obj = { ...it, x: p0?.x ?? it.x ?? 0, y: p0?.y ?? (at === 'end' ? bottom : 0), w: p0?.w ?? it.w ?? COLS, h: p0?.h ?? it.h ?? 0, z };
    list.push(obj); root.append(wrap(obj)); place(obj);
    return obj;
  }

  items.forEach((it) => add(it));
  requestAnimationFrame(() => { layout(); });
  window.addEventListener('resize', schedule);
  onLeave(() => { window.removeEventListener('resize', schedule); ros.forEach((r) => r.disconnect()); ros.length = 0; });

  return {
    add(it) {
      const o = add(it); hidden.delete(it.id);
      requestAnimationFrame(() => { layout(); save(); o.g.scrollIntoView({ behavior: 'smooth', block: 'center' }); }); onChange?.(); return o;
    },
    show(id) {
      const it = list.find((x) => x.id === id); hidden.delete(id);
      // volta para o fundo da página e por cima de tudo, para não ficar escondido atrás de outro
      if (it && free) { it.y = vis().filter((x) => x !== it).reduce((m, x) => Math.max(m, x.y + spanOf(x)), 0); it.z = list.reduce((m, x) => Math.max(m, x.z || 0), 0) + 1; }
      layout(); save(); onChange?.(); it?.g.scrollIntoView({ behavior: 'smooth', block: 'center' });
    },
    isHidden: (id) => hidden.has(id),
    has: (id) => list.some((x) => x.id === id),
    items: () => list,
    layout,
    // "Arrumar": encosta tudo para cima, sem sobreposições (uma vez)
    pack() { if (mobile()) return; pack(); free = true; list.forEach(place); fitHeight(); save(); onChange?.(); },
    // camadas: do que está por cima para o que está por baixo
    layers: () => vis().slice().sort((a, b) => (b.z || 0) - (a.z || 0)).map((it) => ({ id: it.id, label: nameOf(it) || it.label || 'Elemento' })),
    restack,
    highlight(id) { list.forEach((it) => it.g?.classList.toggle('gi-hl', it.id === id)); },
  };
}
