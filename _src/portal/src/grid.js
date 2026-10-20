import { sb, esc, toast, ICON, saveLater, onLeave } from './lib.js';

// Página livre (Studio), como um board do Milanote: cada elemento fica exatamente onde é largado e pode ficar por
// cima de outro. Nada se mexe sozinho. Arrasta-se pela parte de fora de cada elemento (a moldura que aparece ao passar
// o rato, as margens e o título). Sem barra de botões: só o caixote no canto; o resto (nome, camadas, copiar) está no
// menu do botão direito e em "Camadas" na barra da direita. Ctrl+C / Ctrl+V copiam e colam.
// Ao arrastar, cola às arestas e ao centro dos outros elementos, com guias (Alt: sem encaixe).
// Enquanto ninguém mexeu na página, ela arruma-se sozinha (cada bloco por baixo do anterior); ao primeiro arrastar
// fica tudo fixo. "Arrumar" (barra da direita) volta a encostar tudo de uma vez.
// Altura: automática (segue o conteúdo) até alguém a esticar; duplo clique na pega do canto volta a automática.
// Guardado em projects.layouts[key] = { grid: { id: { x, y, w, h, z } }, hidden: [ids], titles, extra } (igual para a equipa).
// Unidades: x e w em colunas (podem ter casas decimais); y e h em linhas de 8 px (h inclui o espaço de 18 px por baixo).

export const COLS = 12;
const ROW = 8; // altura de uma linha (px)
const GAP = 18; // espaço entre colunas (px)
const MOBILE = 900;

const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.span && b.y < a.y + a.span;
const FRONT = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" fill="currentColor" stroke="none"/><path d="M4 15V5a1 1 0 0 1 1-1h10"/></svg>';
const BACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="12" height="12" rx="2"/><path d="M20 9v10a1 1 0 0 1-1 1H9"/></svg>';
// onde carregar não arrasta o elemento (botões, campos, links, pegas…)
const NODRAG = 'button, a, input, textarea, select, label, option, [contenteditable="true"], [draggable="true"], [role="button"], [role="slider"], [data-nodrag], .gi-rs, .gi-del, .crs-h';

export function mountGrid(root, { project, key, items, onRemove, onChange }) {
  const saved = project.layouts?.[key] || {};
  const pos = saved.grid || {};
  let hidden = new Set(saved.hidden || []);
  // livre: alguém já arrumou esta página à mão, por isso nada se mexe sozinho
  let free = !!saved.grid;
  // nomes dados pela equipa a cada elemento (layouts[key].titles)
  const titles = { ...(saved.titles || {}) };
  const nameOf = (it) => titles[it.id] || it.label || '';
  // o título do elemento (o primeiro h2/h3 que não seja um botão ou link): mostra o nome dado pela equipa
  const headOf = (it) => [...it.el.querySelectorAll('h2, h3')].find((x) => !x.closest('button, a, [contenteditable="true"]')) || null;
  // títulos com nome próprio (ex.: o nome de um board, que se muda no próprio board) não levam o nome da página
  const applyTitle = (it) => {
    const h = headOf(it); if (!h || h.closest('[data-ownname]')) return;
    if (!h.dataset.orig) h.dataset.orig = h.textContent;
    h.textContent = titles[it.id] || h.dataset.orig;
  };
  const saveTitles = saveLater(async () => {
    const layouts = { ...(project.layouts || {}), [key]: { ...(project.layouts?.[key] || {}), titles } };
    project.layouts = layouts;
    const { error } = await sb.from('projects').update({ layouts }).eq('id', project.id);
    if (error) toast('Não foi possível guardar o nome: ' + error.message);
  }, 300);
  // mudar o nome: no próprio título (duplo clique) ou, se o elemento não tiver título, numa caixinha no canto
  function rename(it) {
    let h = headOf(it); if (h?.closest('[data-ownname]')) h = null;
    const inp = document.createElement('input');
    inp.className = h ? 'gi-in' : 'gi-in gi-in-float'; inp.value = nameOf(it); inp.setAttribute('aria-label', 'Nome do elemento');
    if (h) { h.hidden = true; h.after(inp); } else it.g.append(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (ok) => {
      if (done) return; done = true; inp.remove(); if (h) h.hidden = false;
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
    const rmTitle = it.id.startsWith('x:') ? 'Apagar desta página' : 'Tirar desta página (volta pela barra da direita)';
    g.innerHTML = `<span class="gi-edge" aria-hidden="true" title="Arrasta para mudar de sítio · botão direito: mais opções"></span><div class="gi-c"></div>
      ${it.removable !== false ? `<button type="button" class="gi-del" data-grm title="${rmTitle}" aria-label="${it.id.startsWith('x:') ? 'Apagar' : 'Tirar'} ${esc(nameOf(it))}">${ICON.trash}</button>` : ''}
      <span class="gi-rs" title="Arrasta para redimensionar · duplo clique: altura automática" aria-hidden="true"></span>`;
    g.querySelector('.gi-c').append(it.el);
    it.g = g;
    applyTitle(it);
    g.querySelector('[data-grm]')?.addEventListener('click', () => remove(it.id));
    // arrastar: pela moldura de fora (logo), ou pelas margens, pelo título e pelas zonas marcadas com data-gdrag
    // (depois de mexer 4 px, para um clique continuar a ser um clique)
    g.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || mobile()) return;
      const t = e.target;
      if (t.classList.contains('gi-edge')) return startDrag(e, it, true);
      if (t.closest(NODRAG)) return;
      const h = headOf(it);
      if (t === g || t.classList.contains('gi-c') || t === it.el || (t.parentElement === it.el && !t.closest('input, textarea')) || (h && h.contains(t)) || t.closest('[data-gdrag]')) startDrag(e, it, false);
    });
    g.addEventListener('dblclick', (e) => { const h = headOf(it); if (h && !h.closest('[data-ownname]') && h.contains(e.target) && !e.target.closest(NODRAG)) rename(it); });
    g.addEventListener('contextmenu', (e) => {
      if (mobile() || e.target.closest('input, textarea, select, [contenteditable="true"], a')) return;
      e.preventDefault(); menu(it, e.clientX, e.clientY);
    });
    // recorte das imagens: a caixa do elemento acompanha o recorte (ver imgcrop.js)
    g.addEventListener('gi-box', (e) => { e.stopPropagation(); cropBox(it, e.detail); });
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
    if (it.lockRatio) it.h = 0; // imagens: a altura segue sempre a largura (proporção da imagem)
    g.classList.toggle('fixed', !!it.h);
    // a altura escolhida é mínima: o elemento nunca fica mais baixo do que o seu conteúdo (nada cortado)
    const c = g.querySelector('.gi-c'); c.style.height = ''; c.style.minHeight = it.h ? `${it.h * ROW - GAP}px` : '';
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

  // ---------- guias de alinhamento (como no Milanote) ----------
  // Ao arrastar ou redimensionar, as arestas e o centro do elemento "colam" às arestas e ao centro dos outros
  // (e ao espaço normal de 18 px entre eles). Aparece uma linha fina onde alinha. Alt: sem encaixe.
  const SN = 7; // distância (px) a que cola
  function targets(it) {
    const cw = colW(); const X = [0, root.clientWidth], Y = [0];
    vis().forEach((o) => {
      if (o === it) return;
      const L = o.x * (cw + GAP), T = o.y * ROW, W = o.g.offsetWidth, H = o.g.offsetHeight;
      X.push(L, L + W, L + W / 2, L + W + GAP, L - GAP);
      Y.push(T, T + H, T + H / 2, T + H + GAP, T - GAP);
    });
    return { X, Y };
  }
  // devolve a correção (px) para a aresta mais perto de um alvo, e o alvo
  function snapTo(edges, list) {
    let best = null;
    edges.forEach((e) => list.forEach((t) => { const d = t - e; if (Math.abs(d) <= SN && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t }; }));
    return best;
  }
  const guides = { v: null, h: null };
  function showGuides(gx, gy) {
    ['v', 'h'].forEach((k) => {
      const at = k === 'v' ? gx : gy;
      if (at == null) { guides[k]?.remove(); guides[k] = null; return; }
      if (!guides[k]) { guides[k] = document.createElement('div'); guides[k].className = `cg-guide ${k}`; root.append(guides[k]); }
      guides[k].style[k === 'v' ? 'left' : 'top'] = `${Math.round(at)}px`;
    });
  }
  const r3 = (n) => Math.round(n * 1000) / 1000;

  // ---------- arrastar ----------
  let busy = null;
  const autoScroll = (y) => { if (y < 70) window.scrollBy(0, -14); else if (y > window.innerHeight - 50) window.scrollBy(0, 14); };
  function startDrag(e, it, now) {
    if (mobile() || e.button !== 0) return;
    if (now) e.preventDefault();
    const sx = e.clientX, sy = e.clientY;
    let on = false, cw, R0, left0, top0, W, H, T, nl, nt, ev = e, rf = 0;
    const begin = () => {
      on = true;
      if (!free) { layout(); freeze(); }
      cw = colW(); R0 = root.getBoundingClientRect(); left0 = it.x * (cw + GAP); top0 = it.y * ROW;
      W = it.g.offsetWidth; H = it.g.offsetHeight; T = targets(it); nl = left0; nt = top0;
      busy = it; root.classList.add('cg-show'); it.g.classList.add('dragging'); it.g.style.zIndex = '100000';
      document.body.classList.add('cg-nosel'); try { window.getSelection()?.removeAllRanges(); } catch { /* nada */ }
      document.activeElement?.blur?.();
    };
    if (now) begin();
    const step = () => {
      rf = 0;
      const R = root.getBoundingClientRect();
      nl = Math.max(0, Math.min(root.clientWidth - W, left0 + ev.clientX - sx));
      nt = Math.max(0, top0 + ev.clientY - sy + (R0.top - R.top));
      let gx = null, gy = null;
      if (!ev.altKey) {
        const a = snapTo([nl, nl + W, nl + W / 2], T.X); if (a) { nl += a.d; gx = a.t; }
        const b = snapTo([nt, nt + H, nt + H / 2], T.Y); if (b) { nt += b.d; gy = b.t; }
      }
      showGuides(gx, gy);
      // só o elemento arrastado se mexe (transform: rápido)
      it.g.style.transform = `translate(${nl - left0}px, ${nt - top0}px)`;
      if (nt + H + 48 > root.offsetHeight) fitHeight(nt + H);
      autoScroll(ev.clientY);
    };
    const move = (m) => {
      ev = m;
      if (!on) { if (Math.hypot(m.clientX - sx, m.clientY - sy) < 4) return; begin(); }
      if (!rf) rf = requestAnimationFrame(step);
    };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      if (!on) return;
      cancelAnimationFrame(rf); if (ev !== e) step();
      it.x = r3(nl / (cw + GAP)); it.y = r3(nt / ROW); it.g.style.transform = '';
      it.g.classList.remove('dragging'); root.classList.remove('cg-show'); document.body.classList.remove('cg-nosel'); showGuides(null, null); busy = null;
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
    const L = it.x * (cw + GAP), Tp = it.y * ROW; const T = targets(it);
    busy = it; it.g.classList.add('resizing'); root.classList.add('cg-show');
    let ev = e, rf = 0;
    const step = () => {
      rf = 0;
      let wpx = Math.max(160, Math.min(root.clientWidth - L, r.width + ev.clientX - sx));
      let hpx = Math.max(48, r.height + ev.clientY - sy);
      let gx = null, gy = null;
      if (!ev.altKey) {
        const a = snapTo([L + wpx], T.X); if (a) { wpx += a.d; gx = a.t; }
        const b = snapTo([Tp + hpx], T.Y); if (b) { hpx += b.d; gy = b.t; }
      }
      showGuides(gx, gy);
      it.w = r3((wpx + GAP) / (cw + GAP)); it.h = it.lockRatio ? 0 : r3((hpx + GAP) / ROW);
      place(it); if (Tp + hpx + 48 > root.offsetHeight) fitHeight(Tp + hpx);
      autoScroll(ev.clientY);
    };
    const move = (m) => { ev = m; if (!rf) rf = requestAnimationFrame(step); };
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      cancelAnimationFrame(rf); if (ev !== e) step();
      it.g.classList.remove('resizing'); root.classList.remove('cg-show'); showGuides(null, null); busy = null;
      fitHeight(); save(); onChange?.();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  }

  // ---------- recorte de imagem: a caixa muda com o recorte ----------
  let box0 = null;
  function cropBox(it, d) {
    const g = it.g;
    if (d.phase === 'start') {
      if (mobile()) { d.room = null; return; }
      if (!free) { layout(); freeze(); }
      const cw = colW(); box0 = { L: it.x * (cw + GAP), T: it.y * ROW, W: g.offsetWidth, cw };
      d.room = { left: box0.L, right: root.clientWidth - box0.L - box0.W, top: box0.T };
      busy = it; g.classList.add('cropping'); g.style.zIndex = '100000'; return;
    }
    if (!box0) return;
    if (d.phase === 'move') {
      g.style.left = `${box0.L + d.dl}px`; g.style.top = `${box0.T + d.dt}px`; g.style.width = `${box0.W + d.dw}px`;
      if (box0.T + d.dt + g.offsetHeight + 48 > root.offsetHeight) fitHeight(box0.T + d.dt + g.offsetHeight);
      return;
    }
    if (d.phase === 'end') {
      it.x = r3(Math.max(0, box0.L + d.dl) / (box0.cw + GAP)); it.y = r3(Math.max(0, box0.T + d.dt) / ROW); it.w = r3(Math.min(COLS, (box0.W + d.dw + GAP) / (box0.cw + GAP)));
    }
    box0 = null; busy = null; g.classList.remove('cropping'); place(it); fitHeight();
    if (d.phase === 'end') { save(); onChange?.(); }
  }

  // ---------- menu do botão direito ----------
  let menuEl = null;
  const closeMenu = () => { menuEl?.remove(); menuEl = null; document.removeEventListener('pointerdown', outMenu, true); document.removeEventListener('keydown', keyMenu, true); window.removeEventListener('scroll', closeMenu, true); };
  const outMenu = (e) => { if (menuEl && !menuEl.contains(e.target)) closeMenu(); };
  const keyMenu = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeMenu(); } };
  function menu(it, x, y) {
    closeMenu();
    const ex = (it.menu?.() || []).filter(Boolean);
    const opts = [
      ...(it.copy ? [['copy', `${ICON.copy}<span>Copiar</span><kbd>Ctrl+C</kbd>`, () => it.copy()]] : []),
      ['name', '<i class="gi-mi">✎</i><span>Mudar o nome</span>', () => rename(it)],
      ['front', `${FRONT}<span>Trazer para a frente</span>`, () => restack(it.id, 'front')],
      ['back', `${BACK}<span>Enviar para trás</span>`, () => restack(it.id, 'back')],
      ...ex.map((o, i) => [`x${i}`, `${o.icon || '<i class="gi-mi"></i>'}<span>${esc(o.label)}</span>`, o.run]),
      ...(it.removable !== false ? [['rm', `${ICON.trash}<span>${it.id.startsWith('x:') ? 'Apagar desta página' : 'Tirar desta página'}</span>`, () => remove(it.id), 'danger']] : []),
    ];
    menuEl = document.createElement('div'); menuEl.className = 'gi-menu'; menuEl.setAttribute('role', 'menu'); menuEl.setAttribute('aria-label', nameOf(it) || 'Elemento');
    menuEl.innerHTML = `<div class="gi-mt">${esc(nameOf(it) || 'Elemento')}</div>${opts.map(([k, h, , cls]) => `${k === 'front' || k === 'rm' || k === 'x0' ? '<hr>' : ''}<button type="button" role="menuitem" class="${cls || ''}" data-mk="${k}">${h}</button>`).join('')}`;
    document.body.append(menuEl);
    const w = menuEl.offsetWidth, h = menuEl.offsetHeight;
    menuEl.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, x))}px`; menuEl.style.top = `${Math.max(8, Math.min(window.innerHeight - h - 8, y))}px`;
    menuEl.querySelectorAll('[data-mk]').forEach((b) => b.addEventListener('click', () => { const o = opts.find((q) => q[0] === b.dataset.mk); closeMenu(); o?.[2](); }));
    menuEl.querySelector('button')?.focus();
    setTimeout(() => { document.addEventListener('pointerdown', outMenu, true); document.addEventListener('keydown', keyMenu, true); window.addEventListener('scroll', closeMenu, true); });
  }
  onLeave(closeMenu);

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
