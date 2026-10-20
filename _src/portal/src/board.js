import { trackWrite, DB_SCHEMA, sb, BUCKET, esc, signedUrl, signedUrls, uploadImage, toast, modal, confirmBox, ICON, onLeave } from './lib.js';
import { ytId } from './music.js';
import { cropSliders, cropAspect, cropImgStyle } from './imgcrop.js';
const DECOMP_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 17.5h7M17.5 14v7"/></svg>';

// Board infinito à maneira do Milanote: cada cartão é uma linha própria na base de dados,
// por isso duas pessoas podem trabalhar no mesmo board sem se apagarem uma à outra.

const MIN = { note: [140, 80], title: [160, 50], image: [80, 60], palette: [180, 110], list: [180, 120], board: [56, 56], link: [180, 80], video: [240, 170], audio: [220, 110] };
const SIZE = { note: [280, 180], title: [520, 72], palette: [320, 150], list: [280, 220], board: [96, 96], link: [300, 110], video: [480, 316], audio: [340, 128] };

// ---------- formatação de texto (notas, títulos, listas) ----------
// Alinhamento, letra e tamanho valem para o cartão inteiro. Negrito, itálico, sublinhado e cor valem para o
// texto selecionado (a escrever) ou para o cartão inteiro (sem seleção). Fontes grátis do Google Fonts.
// cartão copiado com Ctrl+C (fica entre boards enquanto a página estiver aberta)
let CLIP = null;
async function copyToSystem(it) {
  const mark = CLIP.mark;
  try {
    if (it.kind === 'image' && it.data?.path && window.ClipboardItem && navigator.clipboard?.write) {
      const url = await signedUrl(it.data.path);
      const png = await new Promise((res, rej) => { const im = new Image(); im.crossOrigin = 'anonymous'; im.onload = () => { const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; c.getContext('2d').drawImage(im, 0, 0); c.toBlob((b) => (b ? res(b) : rej()), 'image/png'); }; im.onerror = rej; im.src = url; });
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png, 'text/plain': new Blob([mark], { type: 'text/plain' }) })]);
      return;
    }
    await navigator.clipboard.writeText(mark);
  } catch { try { await navigator.clipboard.writeText(mark); } catch { /* sem acesso: o Ctrl+V dentro do Studio continua a funcionar pelo CLIP */ } }
}

export const FONTS = [['', 'Predefinida'], ['Instrument Sans', 'Instrument Sans'], ['Inter', 'Inter'], ['Montserrat', 'Montserrat'], ['Archivo Black', 'Archivo Black'], ['Bebas Neue', 'Bebas Neue'],
  ['Playfair Display', 'Playfair Display'], ['DM Serif Display', 'DM Serif Display'], ['Lora', 'Lora'], ['Instrument Serif', 'Instrument Serif'], ['Space Mono', 'Space Mono'], ['Courier Prime', 'Courier Prime'], ['Caveat', 'Caveat (à mão)']];
const SIZES = [['s', 'Pequeno', 0.8], ['m', 'Normal', 1], ['l', 'Grande', 1.35], ['xl', 'Muito grande', 1.8]];
const BASE = { note: 15, title: 44, list: 14 };
const TEXT_COLORS = ['', '#0B0B14', '#F4F1E8', '#C8382D', '#F08A24', '#E3B341', '#2FB67C', '#2AA8C9', '#1E2AD4', '#7C5CFF', '#E5579B'];
let fontsLoaded = false;
function loadFonts() {
  if (fontsLoaded) return; fontsLoaded = true;
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;700&family=Montserrat:ital,wght@0,400;0,700;1,400&family=Archivo+Black&family=Bebas+Neue&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Serif+Display:ital@0;1&family=Lora:ital,wght@0,400;0,700;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Caveat:wght@400;700&display=swap';
  document.head.append(l);
}
// só deixa passar formatação simples (nada de scripts, links ou estilos estranhos)
const OK_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'DIV', 'P', 'SPAN', 'FONT']);
const OK_STYLE = ['color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line'];
export function cleanHtml(html) {
  const t = document.createElement('template'); t.innerHTML = html || '';
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1 || !OK_TAGS.has(n.tagName)) { if (n.nodeType === 1) { walk(n); n.replaceWith(...n.childNodes); } else n.remove(); return; }
      walk(n);
      let el = n;
      if (n.tagName === 'FONT') { el = document.createElement('span'); if (n.getAttribute('color')) el.style.color = n.getAttribute('color'); el.append(...n.childNodes); n.replaceWith(el); }
      const keep = OK_STYLE.map((k) => [k, el.style.getPropertyValue(k)]).filter(([, v]) => v);
      [...el.attributes].forEach((a) => el.removeAttribute(a.name));
      keep.forEach(([k, v]) => el.style.setProperty(k, v));
    });
  };
  walk(t.content);
  return t.innerHTML;
}
const fmtStyle = (kind, f = {}) => {
  const k = (SIZES.find((x) => x[0] === f.size) || SIZES[1])[2];
  return [f.align ? `text-align:${f.align}` : '', f.font ? `font-family:'${f.font}',var(--sans)` : '', f.size && BASE[kind] ? `font-size:${Math.round(BASE[kind] * k)}px` : '', f.color ? `color:${f.color}` : '', f.b ? 'font-weight:700' : '', f.i ? 'font-style:italic' : '', f.u ? 'text-decoration:underline' : ''].filter(Boolean).join(';');
};

export function mountBoard(root, { projectId, boardId, onOpenBoard, onUp, onZoom, onSelect, presence, embedded = false }) {
  // embedded: o board dentro de uma página (pré-visualização). Só responde ao teclado, ao colar e à roda do rato
  // depois de se clicar dentro dele; fora disso a página faz scroll e cola normalmente.
  let active = !embedded;
  const onDocDown = (e) => { active = root.contains(e.target); root.classList.toggle('bp-active', active); };
  if (embedded) document.addEventListener('pointerdown', onDocDown, true);
  // cartões que outras pessoas estão a mexer agora (não se podem tocar até largarem)
  let locked = new Map();
  const lockedBy = (id) => locked.get(id);
  const blocked = (id) => { const w = lockedBy(id); if (!w) return false; toast(`${w.uid === presence?.me ? 'Tu, noutra janela' : w.name} está a mexer neste cartão.`); return true; };
  const items = new Map();
  const st = { view: { x: 0, y: 0, k: 1 }, sel: null, editing: null, drag: null, pointers: new Map(), pinch: null, dead: false };
  let fmtReady = false;
  const viewKey = `bygrain-view-${boardId}`;

  root.innerHTML = `<div class="stage" tabindex="0" aria-label="Board"><div class="world"></div><div class="drop-hint" hidden>Larga as imagens para as juntar ao board</div><div class="color-bar" hidden role="toolbar" aria-label="Cor do cartão"></div></div>`;
  const stage = root.querySelector('.stage');
  const world = root.querySelector('.world');
  const bar = root.querySelector('.color-bar');
  const COLORS = [['', 'Predefinida'], ['#FFFFFF', 'Branco'], ['#FFE58F', 'Amarelo'], ['#FFC9DE', 'Rosa'], ['#C9D7FF', 'Azul claro'], ['#BFEBD6', 'Verde'], ['#E3D4FF', 'Lilás'], ['#FFD2B0', 'Laranja'], ['#2B2B36', 'Escuro'], ['#1E2AD4', 'Azul Grain'], ['#C8382D', 'Vermelho']];
  const isDark = (hex) => { const h = (hex || '').replace('#', ''); if (h.length !== 6) return false; const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.55; };
  function placeBar() {
    bar.hidden = true;
    updateFmt();
    const it = st.sel && items.get(st.sel);
    onSelect && onSelect(it && it.kind !== 'image' ? { kind: it.kind, bg: it.data?.bg || '' } : null);
  }
  bar.addEventListener('pointerdown', (e) => e.stopPropagation());
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-bg]'); if (!b) return; setBg(b.dataset.bg); });
  bar.addEventListener('input', (e) => { if (e.target.matches('[data-bgc]')) setBg(e.target.value, 400); });
  function setBg(c, delay = 0) {
    const it = items.get(st.sel); if (!it) return;
    mark(it, 'bg');
    it.data = { ...(it.data || {}), bg: c || undefined }; if (!c) delete it.data.bg;
    cardEl(it); save(it, ['data'], delay); if (!delay) placeBar();
  }

  // ---------- barra de formatação de texto ----------
  loadFonts();
  const fbar = document.createElement('div');
  fbar.className = 'fmt-bar'; fbar.hidden = true; fbar.setAttribute('role', 'toolbar'); fbar.setAttribute('aria-label', 'Formatar texto');
  fbar.innerHTML = `
    <span class="fmt-col"><button type="button" data-pop="font" title="Letra" aria-label="Letra" aria-expanded="false"><span class="fmt-aa">Aa</span></button>
      <span class="fmt-pop fmt-list" data-popbox="font" hidden>${FONTS.map(([v, l]) => `<button type="button" data-font="${esc(v)}" style="${v ? `font-family:'${v}'` : ''}">${esc(l)}</button>`).join('')}</span></span>
    <span class="fmt-col"><button type="button" data-pop="size" title="Tamanho" aria-label="Tamanho" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V5h10v2M9 5v14M7 19h4M14 12v-1h6v1M17 11v8M15.5 19h3"/></svg></button>
      <span class="fmt-pop fmt-list" data-popbox="size" hidden>${SIZES.map(([v, l, k]) => `<button type="button" data-size="${v}" style="font-size:${Math.round(13 * k)}px">${l}</button>`).join('')}</span></span>
    <hr>
    <button type="button" data-cmd="bold" title="Negrito (Ctrl+B)" aria-label="Negrito"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Itálico (Ctrl+I)" aria-label="Itálico"><i>I</i></button>
    <button type="button" data-cmd="underline" title="Sublinhado (Ctrl+U)" aria-label="Sublinhado"><u>U</u></button>
    <span class="fmt-col"><button type="button" data-pop="color" data-colbtn title="Cor do texto" aria-label="Cor do texto" aria-expanded="false"><span class="fmt-a">A</span><i data-colbar></i></button>
      <span class="fmt-pop fmt-colors" data-popbox="color" data-colpop hidden>${TEXT_COLORS.map((c) => `<button type="button" data-tc="${c}" class="${c ? '' : 'none'}" style="${c ? `background:${c}` : ''}" aria-label="${c || 'Predefinida'}"></button>`).join('')}<label class="cb-custom" title="Outra cor"><input type="color" data-tcc value="#C8382D" aria-label="Outra cor"><span>+</span></label></span></span>
    <hr>
    ${[['left', 'Alinhar à esquerda', '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'], ['center', 'Centrar', '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'], ['right', 'Alinhar à direita', '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>']].map(([al, l, d]) => `<button type="button" data-align="${al}" title="${l}" aria-label="${l}"><svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg></button>`).join('')}
    <hr>
    <button type="button" data-clear title="Tirar a formatação" aria-label="Tirar a formatação"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12M12 5l-3 14M4 20l16-16"/></svg></button>`;
  root.appendChild(fbar);
  fbar.addEventListener('pointerdown', (e) => { e.stopPropagation(); if (!e.target.closest('select, input')) e.preventDefault(); });
  const closePops = (except) => fbar.querySelectorAll('[data-popbox]').forEach((p) => { if (p.dataset.popbox !== except) { p.hidden = true; fbar.querySelector(`[data-pop="${p.dataset.popbox}"]`)?.setAttribute('aria-expanded', 'false'); } });
  fbar.querySelectorAll('[data-pop]').forEach((b) => b.addEventListener('click', () => { const box = fbar.querySelector(`[data-popbox="${b.dataset.pop}"]`); closePops(b.dataset.pop); box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); }));
  const fmtTarget = () => { const it = st.sel && items.get(st.sel); return it && ['note', 'title', 'list'].includes(it.kind) ? it : null; };
  const selInEdit = () => { const ed = st.editing; if (!ed) return false; const s2 = getSelection(); return s2.rangeCount && !s2.isCollapsed && ed.el.contains(s2.anchorNode); };
  function updateFmt() {
    if (!fmtReady) return;
    const it = fmtTarget();
    fbar.hidden = !it;
    if (!it) { closePops(); return; }
    const f = it.data?.fmt || {};
    fbar.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('on', (f.font || '') === b.dataset.font));
    fbar.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', (f.size || 'm') === b.dataset.size));
    fbar.querySelectorAll('[data-align]').forEach((b) => b.classList.toggle('on', (f.align || 'left') === b.dataset.align));
    const rich = st.editing && ['note', 'title'].includes(it.kind);
    fbar.querySelectorAll('[data-cmd]').forEach((b) => { const k = { bold: 'b', italic: 'i', underline: 'u' }[b.dataset.cmd]; b.classList.toggle('on', rich && selInEdit() ? document.queryCommandState(b.dataset.cmd) : !!f[k]); });
    fbar.querySelector('[data-colbar]').style.background = f.color || 'currentColor';
  }
  const onSelChange = () => { if (st.editing && !fbar.hidden) updateFmt(); };
  document.addEventListener('selectionchange', onSelChange);
  fmtReady = true;
  const setFmt = (patch) => {
    const it = fmtTarget(); if (!it) return;
    if (!(st.editing && st.editing.id === it.id)) mark(it, 'fmt-' + Object.keys(patch).join());
    const fmt = { ...(it.data?.fmt || {}), ...patch }; Object.keys(fmt).forEach((k) => { if (fmt[k] === '' || fmt[k] == null || fmt[k] === false) delete fmt[k]; });
    it.data = { ...(it.data || {}), fmt }; if (!Object.keys(fmt).length) delete it.data.fmt;
    if (st.editing && st.editing.id === it.id) {
      // a escrever: aplica o estilo ao elemento sem refazer o cartão (para não perder o cursor)
      const box = it.kind === 'list' ? st.editing.el.closest('.list-fmt') : st.editing.el;
      if (box) box.setAttribute('style', fmtStyle(it.kind, fmt));
    } else cardEl(it);
    save(it, ['data'], 300); updateFmt();
  };
  fbar.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
    const it = fmtTarget(); if (!it) return;
    if (['note', 'title'].includes(it.kind) && selInEdit()) { document.execCommand('styleWithCSS', false, false); document.execCommand(b.dataset.cmd); updateFmt(); return; }
    const k = { bold: 'b', italic: 'i', underline: 'u' }[b.dataset.cmd]; setFmt({ [k]: !(it.data?.fmt || {})[k] });
  }));
  const colPop = fbar.querySelector('[data-colpop]'); const colBtn = fbar.querySelector('[data-colbtn]');

  let savedRange = null;
  colBtn.addEventListener('pointerdown', () => { const s2 = getSelection(); savedRange = selInEdit() ? s2.getRangeAt(0).cloneRange() : null; });
  const applyColor = (c) => {
    const it = fmtTarget(); if (!it) return;
    if (['note', 'title'].includes(it.kind) && st.editing && savedRange) {
      const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(savedRange);
      document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, c || 'inherit'); document.execCommand('styleWithCSS', false, false);
    } else setFmt({ color: c });
    closePops(); updateFmt();
  };
  colPop.querySelectorAll('[data-tc]').forEach((b) => b.addEventListener('click', () => applyColor(b.dataset.tc)));
  colPop.querySelector('[data-tcc]').addEventListener('change', (e) => applyColor(e.target.value));
  fbar.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => setFmt({ align: b.dataset.align === 'left' ? '' : b.dataset.align })));
  fbar.querySelectorAll('[data-font]').forEach((b) => b.addEventListener('click', () => { setFmt({ font: b.dataset.font }); closePops(); }));
  fbar.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { setFmt({ size: b.dataset.size === 'm' ? '' : b.dataset.size }); closePops(); }));
  fbar.querySelector('[data-clear]').addEventListener('click', () => {
    const it = fmtTarget(); if (!it) return;
    if (st.editing && st.editing.id === it.id) { const el = st.editing.el; el.innerText = el.innerText; }
    if (!(st.editing && st.editing.id === it.id)) mark(it);
    const d = { ...(it.data || {}) }; delete d.fmt; delete d.html; it.data = d;
    if (!(st.editing && st.editing.id === it.id)) cardEl(it); else { const box = it.kind === 'list' ? st.editing.el.closest('.list-fmt') : st.editing.el; box?.removeAttribute('style'); }
    save(it, ['data']); updateFmt();
  });

  // ---------- vista ----------
  function applyView() {
    const { x, y, k } = st.view;
    world.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
    stage.style.backgroundPosition = `${x}px ${y}px`;
    stage.style.backgroundSize = `${24 * k}px ${24 * k}px`;
    onZoom && onZoom(k);
    placeBar && placeBar();
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
  // Ctrl + roda: zoom suave. Cada passo da roda junta-se a um alvo e o zoom chega lá aos poucos
  // (rato: ~12% por passo; trackpad/pinça: segue o gesto quase direto).
  const zs = { want: 0, cx: 0, cy: 0, raf: 0 };
  function smoothZoom(e) {
    let d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1);
    d = Math.max(-120, Math.min(120, d));
    const rate = Math.abs(d) < 40 ? 0.006 : 0.0012;
    zs.want += -d * rate; zs.cx = e.clientX; zs.cy = e.clientY;
    if (!zs.raf) zs.raf = requestAnimationFrame(stepZoom);
  }
  function stepZoom() {
    const part = Math.abs(zs.want) < 0.002 ? zs.want : zs.want * 0.28;
    zs.want -= part;
    zoomAt(zs.cx, zs.cy, Math.exp(part));
    zs.raf = zs.want ? requestAnimationFrame(stepZoom) : 0;
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
      case 'note': return `<div class="txt note-txt" data-field="text" style="${fmtStyle('note', d.fmt)}">${d.html ? cleanHtml(d.html) : esc(d.text || '')}</div>`;
      case 'title': return `<div class="txt title-txt" data-field="text" style="${fmtStyle('title', d.fmt)}">${d.html ? cleanHtml(d.html) : esc(d.text || 'Título')}</div>`;
      // recorte: pegas a meio de cada lado da imagem (cropSliders, em cardEl)
      case 'image': return `${urls[d.path] ? `<div class="img-crop"><img src="${esc(urls[d.path])}" alt="${esc(d.caption || '')}" draggable="false" style="${d.crop ? cropImgStyle(d.crop) : 'width:100%;height:100%;object-fit:cover'}"></div>` : '<div class="img-wait">A carregar…</div>'}${d.caption ? `<div class="caption">${esc(d.caption)}</div>` : ''}`;
      case 'palette': return `<div class="txt card-h" data-field="title">${esc(d.title || 'Paleta')}</div>
        <div class="swatches">${(d.colors || []).map((c, i) => `<div class="sw"><button type="button" data-ui="color" data-i="${i}" style="background:${esc(c)}" aria-label="Mudar cor ${esc(c)}"></button><span>${esc(c.toUpperCase())}</span><button type="button" class="x" data-ui="rmcolor" data-i="${i}" aria-label="Tirar cor">${ICON.close}</button></div>`).join('')}
        <button type="button" class="sw-add" data-ui="addcolor" aria-label="Juntar cor">${ICON.plus}</button></div>`;
      case 'list': return `<div class="list-fmt" style="${fmtStyle('list', d.fmt)}"><div class="txt card-h" data-field="title">${esc(d.title || 'Lista')}</div>
        <ul class="checklist">${(d.items || []).map((li, i) => `<li class="${li.done ? 'done' : ''}"><button type="button" class="chk" data-ui="toggle" data-i="${i}" aria-label="${li.done ? 'Desmarcar' : 'Marcar'}">${li.done ? ICON.check : ''}</button><span class="txt" data-field="item" data-i="${i}">${esc(li.text)}</span><button type="button" class="x" data-ui="rmitem" data-i="${i}" aria-label="Tirar">${ICON.close}</button></li>`).join('')}</ul>
        <button type="button" class="add-item" data-ui="additem">${ICON.plus} Item</button></div>`;
      case 'board': { const cov = urls[d.cover] || covers[d.board_id];
        return `<div class="bcov" ${cov ? `style="background-image:url('${esc(cov)}')"` : ''}>${cov ? '' : ICON.board}</div><div class="txt bname" data-field="title">${esc(d.title || 'Board')}</div><button type="button" class="cov-btn" data-ui="cover" title="Mudar a capa" aria-label="Mudar a capa">${ICON.image}</button><button type="button" class="cov-btn dc-btn" data-ui="decomp" title="Desfazer aqui: passa todos os elementos deste board para aqui (o board original não se perde se estiver noutro sítio)" aria-label="Desfazer o board aqui">${DECOMP_ICON}</button>`; }
      case 'video': { const id = ytId(d.url); const playing = st.playing === it.id;
        return `<div class="vid-h"><span class="txt card-h" data-field="title">${esc(d.title || 'Pre-vis')}</span><a class="open-link sm" data-ui="link" href="${esc(d.url || '#')}" target="_blank" rel="noopener noreferrer" title="Abrir no YouTube">${ICON.open}</a></div>
          <div class="vid" data-ui="media">${!id ? '<p class="muted small">Link do YouTube inválido.</p>' : playing ? `<iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0" title="${esc(d.title || 'Vídeo')}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>` : `<button type="button" class="vid-play" data-ui="play" aria-label="Ver o vídeo"><img src="https://i.ytimg.com/vi/${id}/hqdefault.jpg" alt="" draggable="false" onerror="this.remove()"><span>▶</span></button>`}</div>`; }
      case 'audio': return `<div class="txt card-h" data-field="title">${esc(d.title || d.name || 'Música')}</div><div data-ui="media" class="aud">${urls[d.path] ? `<audio controls preload="metadata" src="${esc(urls[d.path])}"></audio>` : '<span class="muted small">A carregar…</span>'}</div>`;
      case 'link': { let host = ''; try { host = new URL(d.url).hostname.replace(/^www\./, ''); } catch { /* url inválido */ }
        const yid = ytId(d.url);
        if (yid) return `<a class="yt-ref" data-ui="link" href="${esc(d.url)}" target="_blank" rel="noopener noreferrer"><img src="https://i.ytimg.com/vi/${yid}/hqdefault.jpg" alt="" draggable="false" onerror="this.remove()"><i>${ICON.open}</i></a><div class="txt card-h" data-field="title">${esc(d.title || 'Referência')}</div>`;
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
    if (it.kind === 'image') imageCrop(it, el);
    const bg = it.data?.bg;
    el.classList.toggle('dark-bg', !!bg && isDark(bg) && it.kind !== 'title');
    el.classList.toggle('light-tile', it.kind === 'board' && !!bg && !isDark(bg));
    el.classList.toggle('dflt', !bg && !['title', 'image', 'board', 'audio', 'video', 'line', 'arrow'].includes(it.kind));
    if (bg && it.kind === 'title') el.style.color = bg;
    else if (bg && it.kind === 'board') el.style.setProperty('--tile', bg);
    else if (bg) el.style.background = bg;
    el.classList.toggle('sel', st.sel === it.id);
    const lk = lockedBy(it.id);
    el.classList.toggle('card-locked', !!lk);
    if (lk) { el.style.setProperty('--lk', lk.color || '#F08A24'); el.dataset.lockName = lk.name; } else delete el.dataset.lockName;
    return el;
  }
  // recortar na própria imagem: a imagem não muda de escala, o cartão acompanha o recorte (igual às páginas)
  function imageCrop(it, el) {
    const fr = el.querySelector('.img-crop'); if (!fr) return;
    const img = fr.querySelector('img');
    // imagens antigas sem tamanho guardado: lê-se quando a imagem carregar
    if (!it.data?.w || !it.data?.h) { img?.addEventListener('load', () => { if (!img.naturalWidth) return; it.data = { ...(it.data || {}), w: img.naturalWidth, h: img.naturalHeight }; imageCrop(it, el); }, { once: true }); return; }
    let s0 = null, cc = null;
    const nat = () => ({ w: it.data.w, h: it.data.h });
    cropSliders(fr, {
      nat, get: () => it.data?.crop, zoom: () => st.view.k,
      apply: (c) => { cc = c; fr.querySelector('img').style.cssText = cropImgStyle(c); },
      box: {
        start: () => { mark(it, 'crop'); s0 = { x: it.x, y: it.y, w: it.w, h: it.h }; return { left: Infinity, right: Infinity, top: Infinity }; },
        move: (dl, dt, dw) => {
          it.x = Math.round(s0.x + dl); it.y = Math.round(s0.y + dt); it.w = Math.round(s0.w + dw);
          it.h = Math.round(it.w / (cropAspect(cc, it.data.w, it.data.h) || 1));
          Object.assign(el.style, { left: `${it.x}px`, top: `${it.y}px`, width: `${it.w}px`, height: `${it.h}px` }); placeBar();
        },
        end: () => {},
        cancel: () => { Object.assign(it, s0); cardEl(it); placeBar(); },
      },
      commit: (c) => {
        const d = { ...(it.data || {}) }; if (c) d.crop = c; else delete d.crop;
        it.data = d; cardEl(it); placeBar(); save(it, ['data', 'x', 'y', 'w', 'h']);
      },
    });
  }
  function renderAll() { world.innerHTML = ''; [...items.values()].sort((a, b) => a.z - b.z).forEach(cardEl); }
  function select(id) {
    st.sel = id;
    presence?.setCard(id || null);
    world.querySelectorAll('.card').forEach((c) => c.classList.toggle('sel', c.dataset.id === id));
    placeBar();
  }

  // ---------- gravar ----------
  // um temporizador por cartão, mas os campos juntam-se: mexer no texto e logo a seguir no tamanho grava os dois
  const saveT = new Map();
  function save(it, fields, delay = 0) {
    const cur = saveT.get(it.id) || { fields: new Set() };
    fields.forEach((f) => cur.fields.add(f));
    clearTimeout(cur.t);
    const run = () => {
      if (saveT.get(it.id) !== cur) return;
      saveT.delete(it.id);
      const patch = {}; cur.fields.forEach((f) => (patch[f] = it[f]));
      return trackWrite(sb.from('board_items').update(patch).eq('id', it.id).then(({ error }) => { if (error) toast('Não foi possível guardar: ' + error.message); }));
    };
    saveT.set(it.id, cur);
    if (delay) { cur.t = setTimeout(run, delay); cur.flush = run; } else run();
  }
  const flushItems = () => [...saveT.values()].forEach((c) => { clearTimeout(c.t); c.flush?.(); });
  const maxZ = () => Math.max(0, ...[...items.values()].map((i) => i.z));

  // ---------- desfazer / refazer (Ctrl+Z, Ctrl+Shift+Z ou Ctrl+Y) ----------
  // Cada operação guarda o "antes": mover, redimensionar, escrever, cor, formatação, criar e apagar cartões.
  const undoStack = []; const redoStack = [];
  const snap = (it) => JSON.parse(JSON.stringify({ x: it.x, y: it.y, w: it.w, h: it.h, z: it.z, data: it.data || {} }));
  const rowOf = (it) => ({ id: it.id, board_id: it.board_id || boardId, project_id: it.project_id, kind: it.kind, x: it.x, y: it.y, w: it.w, h: it.h, z: it.z, data: JSON.parse(JSON.stringify(it.data || {})) });
  const pending = new Map(); // ficheiros que só se apagam se ninguém desfizer
  function record(op) { undoStack.push(op); if (undoStack.length > 80) undoStack.shift(); redoStack.length = 0; }
  let lastMark = { id: null, at: 0, kind: '' };
  // chamar ANTES de mudar um cartão; mudanças seguidas do mesmo tipo (ex.: arrastar a cor) contam como uma
  function mark(it, kind = 'edit') {
    if (!it) return;
    const now = Date.now();
    if (lastMark.id === it.id && lastMark.kind === kind && now - lastMark.at < 900 && kind !== 'edit') { lastMark.at = now; return; }
    lastMark = { id: it.id, at: now, kind };
    record({ t: 'upd', id: it.id, before: snap(it) });
  }
  async function applyOp(op, dir) {
    if (op.t === 'decomp') return applyDecomp(op, dir);
    if (op.t === 'upd') {
      const it = items.get(op.id); if (!it) return null;
      const now = snap(it); Object.assign(it, JSON.parse(JSON.stringify(op.before)));
      cardEl(it); save(it, ['x', 'y', 'w', 'h', 'z', 'data']);
      return { ...op, before: now };
    }
    const insert = (op.t === 'add') === (dir === 'redo');
    if (insert) {
      const row = op.row;
      const { error } = await sb.from('board_items').insert(row);
      if (error && !/duplicate/i.test(error.message)) { toast(error.message); return null; }
      pending.delete(row.id); items.set(row.id, { ...row }); cardEl(items.get(row.id)); select(row.id);
    } else {
      const it = items.get(op.row.id); if (!it) return op;
      items.delete(it.id); world.querySelector(`[data-id="${it.id}"]`)?.remove(); if (st.sel === it.id) { st.sel = null; placeBar(); }
      await sb.from('board_items').delete().eq('id', it.id);
    }
    return op;
  }
  async function undo() {
    if (st.editing) commitEdit();
    const op = undoStack.pop(); if (!op) return toast('Nada para desfazer.');
    const back = await applyOp(op, 'undo'); if (back) redoStack.push(back);
  }
  async function redo() {
    const op = redoStack.pop(); if (!op) return toast('Nada para refazer.');
    const back = await applyOp(op, 'redo'); if (back) undoStack.push(back);
  }

  async function create(kind, at, data = {}, size) {
    const r = stage.getBoundingClientRect();
    const c = at || dropAt || toWorld(r.left + r.width / 2, r.top + r.height / 2); dropAt = null;
    const [w, h] = size || SIZE[kind] || [260, 160];
    const row = { board_id: boardId, kind, x: Math.round(c.x - w / 2), y: Math.round(c.y - h / 2), w, h, z: maxZ() + 1, data };
    const { data: ins, error } = await sb.from('board_items').insert(row).select().single();
    if (error) { toast('Não foi possível criar: ' + error.message); return null; }
    items.set(ins.id, ins); cardEl(ins); select(ins.id);
    record({ t: 'add', row: rowOf(ins) });
    return ins;
  }

  // o que o projeto já tem: música e pre-vis do seguimento, das ferramentas "Música e pre-vis" e de outros boards
  async function projectMedia() {
    const [{ data: pr }, { data: tools }, { data: cards }] = await Promise.all([
      sb.from('projects').select('music').eq('id', projectId).maybeSingle(),
      sb.from('boards').select('id, title, data').eq('project_id', projectId).eq('kind', 'media'),
      sb.from('board_items').select('id, board_id, kind, data').eq('project_id', projectId).in('kind', ['audio', 'video']),
    ]);
    const out = { audio: [], video: [] }; const seen = new Set();
    const push = (k, x) => { const key = k + (x.path || x.url); if (seen.has(key)) return; seen.add(key); out[k].push(x); };
    const fromMusic = (m, where) => {
      if (!m) return;
      if (m.audio_path) push('audio', { path: m.audio_path, title: (m.audio_name || 'Música').replace(/\.[^.]+$/, ''), where });
      if (m.previs_url && ytId(m.previs_url)) push('video', { url: m.previs_url, title: 'Pre-vis', where });
      (m.refs || []).forEach((r) => ytId(r.url) && push('video', { url: r.url, title: r.title || 'Referência', where: `${where} · referência` }));
    };
    fromMusic(pr?.music, 'Seguimento');
    (tools || []).forEach((t) => fromMusic(t.data, t.title));
    (cards || []).filter((c) => c.board_id !== boardId).forEach((c) => (c.kind === 'audio' ? c.data?.path && push('audio', { path: c.data.path, title: c.data.title || c.data.name || 'Música', where: 'Outro board' }) : c.data?.url && push('video', { url: c.data.url, title: c.data.title || 'Vídeo', where: 'Outro board' })));
    return out;
  }
  async function pickMedia(kind) {
    const m = modal(`<h2>${kind === 'audio' ? 'Juntar música' : 'Juntar pre-vis ou vídeo'}</h2><div data-mlist><p class="muted">A procurar no projeto…</p></div>`);
    const list = (await projectMedia())[kind];
    m.el.querySelector('[data-mlist]').innerHTML = `${list.length ? `<p class="muted small">Já existe no projeto:</p><div class="pick-list">${list.map((x, i) => `<button type="button" class="pick-it" data-i="${i}">${kind === 'audio' ? ICON.music : `<img src="https://i.ytimg.com/vi/${ytId(x.url)}/default.jpg" alt="" onerror="this.remove()">`}<span><strong>${esc(x.title)}</strong><small>${esc(x.where)}</small></span>${ICON.plus}</button>`).join('')}</div>` : `<p class="muted small">Ainda não há ${kind === 'audio' ? 'música' : 'vídeos'} no projeto.</p>`}
      <div class="row between"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-new>${kind === 'audio' ? `${ICON.plus} Carregar outro ficheiro` : `${ICON.plus} Colar outro link`}</button></div>`;
    m.el.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', async () => {
      const x = list[+b.dataset.i]; m.close();
      if (kind === 'audio') { urls = { ...urls, ...(await signedUrls([x.path])) }; create('audio', null, { path: x.path, title: x.title, shared: true }); }
      else create('video', null, { url: x.url, title: x.title });
    }));
    m.el.querySelector('[data-new]').addEventListener('click', () => { m.close(); add(kind, { fresh: true }); });
    m.el.querySelector('[data-mlist] [data-close]').addEventListener('click', () => m.close());
  }

  // ponto onde a ferramenta foi largada (arrastar da barra); fica à espera do primeiro cartão criado
  let dropAt = null;
  // juntar um board: ligar um que já existe no projeto (moodboards de figurino e de décors, boards de outras ferramentas) ou criar um novo
  async function newChild() {
    const { data: b, error } = await sb.from('boards').insert({ project_id: projectId, parent_id: boardId, title: 'Novo board' }).select().single();
    if (error) return toast(error.message);
    return create('board', null, { board_id: b.id, title: 'Novo board' });
  }
  async function boardMenu() {
    const { data: all } = await sb.from('boards').select('id, title, kind, parent_id, data').eq('project_id', projectId).in('kind', ['board', 'wrd']).order('title');
    const here = new Set([...items.values()].filter((x) => x.kind === 'board').map((x) => x.data?.board_id));
    // não deixa ligar o próprio board nem os de cima (dava uma volta sem fim)
    const up = new Set([boardId]); let cur = (all || []).find((b) => b.id === boardId);
    while (cur?.parent_id) { up.add(cur.parent_id); cur = (all || []).find((b) => b.id === cur.parent_id); }
    const list = (all || []).filter((b) => !up.has(b.id));
    const label = (b) => (b.kind === 'wrd' ? (b.data?.location_id ? 'Moodboard de décor' : 'Moodboard de figurino') : b.parent_id ? 'Board dentro de outro' : 'Board');
    const m = modal(`<h2>Juntar um board</h2>
      <button type="button" class="btn primary bm-new" data-new>${ICON.plus} Criar um board novo aqui</button>
      <div class="field"><label for="bmq">Ou liga um que já existe</label><input id="bmq" type="search" placeholder="Procurar (ex: Moodboard, figurino, nome do ator…)" autocomplete="off"></div>
      <ul class="bm-list" data-list></ul>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button></div>`);
    const draw = () => {
      const q = m.el.querySelector('#bmq').value.trim().toLowerCase();
      const xs = list.filter((b) => !q || `${b.title} ${label(b)}`.toLowerCase().includes(q));
      m.el.querySelector('[data-list]').innerHTML = xs.length ? xs.map((b) => `<li><button type="button" data-b="${b.id}" ${here.has(b.id) ? 'disabled' : ''}><b>${esc(b.title || 'Board')}</b><small class="muted">${esc(label(b))}${here.has(b.id) ? ' · já está neste board' : ''}</small></button><button type="button" class="btn ghost sm bm-copy" data-bcopy="${b.id}" title="Copia todos os elementos desse board para este (o original fica como está)">Copiar o conteúdo</button></li>`).join('') : '<li class="muted small">Nenhum board com esse nome.</li>';
      m.el.querySelectorAll('[data-b]').forEach((x) => x.addEventListener('click', () => { const b = list.find((y) => y.id === x.dataset.b); m.close(); create('board', null, { board_id: b.id, title: b.title || 'Board', link: true }); }));
      m.el.querySelectorAll('[data-bcopy]').forEach((x) => x.addEventListener('click', () => { m.close(); decompose(x.dataset.bcopy, null); }));
    };
    m.el.querySelector('#bmq').addEventListener('input', draw);
    m.el.querySelector('[data-new]').addEventListener('click', () => { m.close(); newChild(); });
    draw(); setTimeout(() => m.el.querySelector('#bmq')?.focus(), 50);
  }
  async function add(kind, opts = {}) {
    dropAt = opts.at || null;
    if (kind === 'image') return imageMenu();
    if (kind === 'board') return boardMenu();
    if ((kind === 'video' || kind === 'audio') && !opts.fresh) return pickMedia(kind);
    if (kind === 'video') {
      const m = modal(`<h2>Pre-vis ou vídeo</h2><p class="muted small">Toca dentro do board.</p><form class="stack"><div class="field"><label for="vurl">Link do YouTube</label><input id="vurl" type="url" placeholder="https://youtu.be/…" required></div><div class="field"><label for="vtit">Nome</label><input id="vtit" value="Pre-vis"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`);
      m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); let u = m.el.querySelector('#vurl').value.trim(); if (!/^https?:\/\//.test(u)) u = 'https://' + u; if (!ytId(u)) return toast('Esse link não parece ser do YouTube.'); create('video', null, { url: u, title: m.el.querySelector('#vtit').value.trim() }); m.close(); });
      return;
    }
    if (kind === 'audio') {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.mp3,.wav,.m4a,.aac';
      inp.onchange = async () => {
        const file = inp.files[0]; if (!file) return;
        if (file.size > 25 * 1024 * 1024) return toast('O ficheiro passa dos 25 MB. Exporta em MP3.');
        toast('A enviar a música…');
        const ext = (file.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
        const path = `${projectId}/audio/${Date.now()}.${ext}`;
        const { error } = await sb.storage.from(BUCKET).upload(path, file, { contentType: file.type || 'audio/mpeg' });
        if (error) return toast(error.message);
        urls = { ...urls, ...(await signedUrls([path])) };
        create('audio', null, { path, name: file.name, title: file.name.replace(/\.[^.]+$/, '') });
      };
      inp.click(); return;
    }
    if (kind === 'link') {
      const m = modal(`<h2>Juntar ligação</h2><form class="stack"><div class="field"><label for="lurl">Endereço</label><input id="lurl" type="url" placeholder="https://" required></div><div class="field"><label for="ltit">Nome (opcional)</label><input id="ltit"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`);
      m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); let u = m.el.querySelector('#lurl').value.trim(); if (!u) return; if (!/^https?:\/\//.test(u)) u = 'https://' + u; create('link', null, { url: u, title: m.el.querySelector('#ltit').value.trim() }, ytId(u) ? [300, 230] : undefined); m.close(); });
      return;
    }
    const defaults = { note: { text: '' }, title: { text: 'Título' }, palette: { title: 'Paleta', colors: ['#1E2AD4', '#F4F1E8', '#0C0C12'] }, list: { title: 'Lista', items: [{ text: 'Primeiro item', done: false }] } };
    const it = await create(kind, null, defaults[kind] || {});
    if (it && (kind === 'note' || kind === 'title')) startEdit(it.id, world.querySelector(`[data-id="${it.id}"] .txt`));
  }

  // capa de um board: carregar do computador ou escolher uma das imagens desse board (ou voltar à automática)
  async function coverMenu(it) {
    const d = it.data || {};
    const m = modal(`<h2>Capa do board</h2>
      <button type="button" class="btn primary bm-new" data-up>${ICON.open} Carregar do computador</button>
      <p class="muted small">Ou escolhe uma imagem de dentro de "${esc(d.title || 'Board')}":</p>
      <div class="im-grid" data-grid><p class="muted small">A carregar…</p></div>
      <div class="row between"><button type="button" class="btn ghost" data-auto ${d.cover ? '' : 'disabled'}>Capa automática (a primeira imagem)</button><button type="button" class="btn ghost" data-close>Fechar</button></div>`, { wide: true });
    const setCover = (path) => { it.data = { ...it.data, cover: path || null }; if (!path) delete it.data.cover; save(it, ['data']); cardEl(it); toast(path ? 'Capa mudada.' : 'Capa automática.'); };
    m.el.querySelector('[data-up]').addEventListener('click', () => {
      m.close();
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => { try { toast('A enviar a capa…'); const up = await uploadImage(projectId, 'board', inp.files[0]); urls = { ...urls, ...(await signedUrls([up.path])) }; setCover(up.path); } catch (e) { toast(e.message || String(e)); } };
      inp.click();
    });
    m.el.querySelector('[data-auto]').addEventListener('click', () => { m.close(); setCover(null); });
    const { data: imgs } = d.board_id ? await sb.from('board_items').select('data').eq('board_id', d.board_id).eq('kind', 'image').order('z') : { data: [] };
    const paths = [...new Set((imgs || []).map((x) => x.data?.path).filter(Boolean))];
    const u = await signedUrls(paths); urls = { ...urls, ...u };
    const grid = m.el.querySelector('[data-grid]');
    grid.innerHTML = paths.length ? paths.map((pth) => `<button type="button" class="im-t ${d.cover === pth ? 'on' : ''}" data-p="${esc(pth)}">${u[pth] ? `<img src="${esc(u[pth])}" alt="" loading="lazy">` : ''}</button>`).join('') : '<p class="muted small">Este board ainda não tem imagens. Carrega uma do computador.</p>';
    grid.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { m.close(); setCover(b.dataset.p); }));
  }
  // juntar imagens: do computador, ou uma que já está no projeto (boards, storyboard, elenco, décors, adereços, figurino)
  async function imageMenu() {
    const at0 = dropAt;
    const m = modal(`<h2>Juntar imagem</h2>
      <button type="button" class="btn primary bm-new" data-up>${ICON.open} Carregar do computador</button>
      <div class="field"><label for="imq">Ou escolhe uma imagem do projeto</label><input id="imq" type="search" placeholder="Procurar (ex: storyboard, figurino, nome do décor…)" autocomplete="off"></div>
      <div class="im-grid" data-grid><p class="muted small">A juntar as imagens do projeto…</p></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok disabled>Juntar</button></div>`, { wide: true });
    m.el.querySelector('[data-up]').addEventListener('click', () => { m.close(); dropAt = at0; pickImages(); });
    const [bi, sh, ch, lo, pr, bs] = await Promise.all([
      sb.from('board_items').select('board_id, data').eq('project_id', projectId).eq('kind', 'image').limit(400),
      sb.from('shots').select('code, image_path').eq('project_id', projectId).not('image_path', 'is', null),
      sb.from('characters').select('name, info').eq('project_id', projectId),
      sb.from('locations').select('name, photos').eq('project_id', projectId),
      sb.from('props').select('name, refs').eq('project_id', projectId),
      sb.from('boards').select('id, title').eq('project_id', projectId),
    ]);
    const bt = new Map((bs.data || []).map((b) => [b.id, b.title]));
    const out = []; const seen = new Set();
    const put = (path, label, shared = true) => { if (!path || seen.has(path)) return; seen.add(path); out.push({ path, label, shared }); };
    (bi.data || []).forEach((x) => put(x.data?.path, `Board · ${bt.get(x.board_id) || ''}`, false));
    (sh.data || []).forEach((x) => put(x.image_path, `Storyboard · plano ${x.code || ''}`));
    (ch.data || []).forEach((c) => { put(c.info?.photo, `Elenco · ${c.name}`); (c.info?.wardrobe?.costumes || []).forEach((k) => (k.photos || []).forEach((ph) => put(ph.path, `Figurino · ${c.name} · ${k.name || ''}`))); (c.info?.wardrobe?.fittings || []).forEach((ph) => put(ph.path, `Prova de guarda-roupa · ${c.name}`)); });
    (lo.data || []).forEach((l) => (l.photos || []).forEach((ph) => put(ph.path, `Décor · ${l.name}`)));
    (pr.data || []).forEach((x) => (x.refs || []).forEach((ph) => put(ph.path, `Adereço · ${x.name}`)));
    const u = await signedUrls(out.map((x) => x.path));
    urls = { ...urls, ...u };
    const chosen = new Set();
    const grid = m.el.querySelector('[data-grid]'); const ok = m.el.querySelector('[data-ok]');
    const draw = () => {
      const q = m.el.querySelector('#imq').value.trim().toLowerCase();
      const xs = out.filter((x) => u[x.path] && (!q || x.label.toLowerCase().includes(q)));
      grid.innerHTML = xs.length ? xs.map((x) => `<button type="button" class="im-t ${chosen.has(x.path) ? 'on' : ''}" data-p="${esc(x.path)}" title="${esc(x.label)}"><img src="${esc(u[x.path])}" alt="" loading="lazy"><small>${esc(x.label)}</small></button>`).join('') : `<p class="muted small">${out.length ? 'Nenhuma imagem com esse nome.' : 'Ainda não há imagens no projeto.'}</p>`;
      grid.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { const pth = b.dataset.p; if (chosen.has(pth)) chosen.delete(pth); else chosen.add(pth); b.classList.toggle('on'); ok.disabled = !chosen.size; ok.textContent = chosen.size > 1 ? `Juntar ${chosen.size} imagens` : 'Juntar'; }));
    };
    m.el.querySelector('#imq').addEventListener('input', draw);
    ok.addEventListener('click', async () => {
      const picks = out.filter((x) => chosen.has(x.path)); m.close();
      let off = 0;
      for (const x of picks) {
        const dim = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth || 320, h: im.naturalHeight || 240 }); im.onerror = () => res({ w: 320, h: 240 }); im.src = u[x.path]; });
        const pt = at0 ? { x: at0.x + off, y: at0.y + off } : null;
        await create('image', pt, { path: x.path, w: dim.w, h: dim.h, ...(x.shared ? { shared: true } : {}) }, [320, Math.round(320 * (dim.h / dim.w))]);
        off += 30;
      }
    });
    draw(); setTimeout(() => m.el.querySelector('#imq')?.focus(), 50);
  }
  function pickImages() {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => addImages([...inp.files]);
    inp.click();
  }
  async function addImages(files, at) {
    at = at || dropAt; dropAt = null;
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
    st.editing = { id, el, before: items.get(id) ? snap(items.get(id)) : null }; bar.hidden = true;
    const rich = el.dataset.field === 'text' && ['note', 'title'].includes(items.get(id)?.kind);
    if (rich) el.contentEditable = 'true';
    else { el.contentEditable = 'plaintext-only'; if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true'; }
    // colar sempre como texto simples (sem formatação de outros sites)
    el.onpaste = (e) => { e.preventDefault(); e.stopPropagation(); const t = e.clipboardData?.getData('text/plain') || ''; document.execCommand('insertText', false, t); };
    updateFmt();
    el.focus();
    const r = document.createRange(); r.selectNodeContents(el); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }
  function commitEdit() {
    const ed = st.editing; if (!ed) return;
    st.editing = null; ed.el.contentEditable = 'false'; setTimeout(placeBar);
    const it = items.get(ed.id); if (!it) return;
    if (ed.before) { const b = JSON.stringify(ed.before.data); queueMicrotask(() => { if (JSON.stringify(it.data || {}) !== b) record({ t: 'upd', id: it.id, before: ed.before }); }); }
    const text = ed.el.innerText.replace(/\n$/, '');
    const f = ed.el.dataset.field;
    const d = { ...(it.data || {}) };
    if (f === 'item') { const i = +ed.el.dataset.i; d.items = [...(d.items || [])]; if (text.trim()) d.items[i] = { ...d.items[i], text }; else d.items.splice(i, 1); }
    else d[f] = text;
    if (f === 'text' && ['note', 'title'].includes(it.kind)) {
      const html = cleanHtml(ed.el.innerHTML);
      if (/<(b|strong|i|em|u|s|strike|span)\b/i.test(html)) d.html = html; else delete d.html;
    }
    it.data = d; save(it, ['data']);
    if (f === 'item' || it.kind === 'board') cardEl(it);
    if (it.kind === 'board' && f === 'title' && d.board_id && !d.link) sb.from('boards').update({ title: text || 'Board' }).eq('id', d.board_id).then(() => {});
  }

  // ---------- botões dentro dos cartões ----------
  async function onUi(btn, it) {
    if (!['link', 'media', 'play', 'openboard', 'decomp', 'cover'].includes(btn.dataset.ui)) mark(it, 'ui-' + btn.dataset.ui);
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
      case 'cover': return coverMenu(it);
      case 'decomp': return d.board_id && decompose(d.board_id, it);
      case 'link': case 'media': return;
      case 'play': st.playing = it.id; cardEl(it); return;
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
      if (blocked(it.id)) { e.preventDefault(); return; }
      select(it.id);
      if (it.z < maxZ()) { it.z = maxZ() + 1; card.style.zIndex = it.z; save(it, ['z']); }
      const rs = e.target.closest('[data-rs]');
      st.drag = { before: snap(it), mode: rs ? 'resize' : 'move', id: it.id, sx: e.clientX, sy: e.clientY, ox: it.x, oy: it.y, ow: it.w, oh: it.h, moved: false };
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
    if (g.mode === 'move') { it.x = Math.round(g.ox + dx / k); it.y = Math.round(g.oy + dy / k); el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; placeBar(); }
    else {
      const [mw, mh] = MIN[it.kind] || [80, 60];
      let w = Math.max(mw, g.ow + dx / k), h = Math.max(mh, g.oh + dy / k);
      if (it.kind === 'image' && it.data?.w) h = w / (cropAspect(it.data.crop, it.data.w, it.data.h) || it.data.w / it.data.h);
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
    if (g.moved) { record({ t: 'upd', id: it.id, before: g.before }); save(it, g.mode === 'move' ? ['x', 'y'] : ['w', 'h']); }
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  stage.addEventListener('dblclick', (e) => {
    const card = e.target.closest('.card'); if (!card) { add('note').then(() => {}); return; }
    const it = items.get(card.dataset.id); if (!it) return;
    if (blocked(it.id)) return;
    const txt = e.target.closest('.txt') || (it.kind === 'note' || it.kind === 'title' ? card.querySelector('.txt') : null);
    if (it.kind === 'board') { if (!e.target.closest('[data-ui]')) onOpenBoard(it.data.board_id); return; }
    if (it.kind === 'image') return editCaption(it);
    if (txt) startEdit(it.id, txt);
  });
  stage.addEventListener('click', (e) => {
    const ui = e.target.closest('[data-ui]'); if (!ui) return;
    const card = ui.closest('.card'); const it = card && items.get(card.dataset.id); if (!it) return;
    if (!['link', 'media', 'play', 'openboard'].includes(ui.dataset.ui) && blocked(it.id)) { e.preventDefault(); return; }
    if (ui.dataset.ui !== 'link') e.preventDefault();
    onUi(ui, it);
  });

  function editCaption(it) {
    const m = modal(`<h2>Legenda da imagem</h2><form class="stack"><div class="field"><label for="cap">Legenda</label><input id="cap" value="${esc(it.data?.caption || '')}"></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); mark(it); it.data = { ...it.data, caption: m.el.querySelector('#cap').value.trim() }; save(it, ['data']); cardEl(it); m.close(); });
  }

  stage.addEventListener('wheel', (e) => {
    if (!active && !(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) smoothZoom(e);
    else { st.view.x -= e.deltaX; st.view.y -= e.deltaY; applyView(); }
  }, { passive: false });

  // largar e colar imagens
  stage.addEventListener('dragover', (e) => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); root.querySelector('.drop-hint').hidden = false; } });
  stage.addEventListener('dragleave', (e) => { if (e.target === stage) root.querySelector('.drop-hint').hidden = true; });
  stage.addEventListener('drop', (e) => { e.preventDefault(); root.querySelector('.drop-hint').hidden = true; addImages([...e.dataTransfer.files], toWorld(e.clientX, e.clientY)); });
  const onPaste = (e) => {
    if (!active) return;
    if (st.editing || /INPUT|TEXTAREA/.test(document.activeElement?.tagName) || document.querySelector('#modal.open')) return;
    // cartão copiado com Ctrl+C (neste board ou noutro): cola uma cópia igual, com a mesma imagem
    const mark = e.clipboardData?.getData('text/plain')?.trim();
    if (CLIP && mark === CLIP.mark) {
      e.preventDefault(); CLIP.n = (CLIP.n || 0) + 1;
      const same = CLIP.board === boardId; const off = same ? 30 * CLIP.n : 0;
      const r = stage.getBoundingClientRect(); const c = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      const it = CLIP.item; create(it.kind, same ? { x: it.x + it.w / 2 + off, y: it.y + it.h / 2 + off } : c, JSON.parse(JSON.stringify(it.data)), [it.w, it.h]);
      return;
    }
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addImages(files); return; }
    const t = e.clipboardData?.getData('text/plain')?.trim();
    if (t && /^https?:\/\/\S+$/.test(t)) { e.preventDefault(); create('link', null, { url: t, title: '' }, ytId(t) ? [300, 230] : undefined); }
    else if (t) { e.preventDefault(); create('note', null, { text: t }); }
  };
  document.addEventListener('paste', onPaste); onLeave(() => document.removeEventListener('paste', onPaste));

  // teclado
  const onKey = async (e) => {
    if (!active || document.querySelector('#modal.open')) return;
    const typing = st.editing || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if (st.editing && e.key === 'Escape') { e.preventDefault(); commitEdit(); return; }
    if (st.editing && e.key === 'Enter' && st.editing.el.dataset.field === 'item' && !e.shiftKey) {
      e.preventDefault(); const it = items.get(st.editing.id); commitEdit(); if (it) onUi({ dataset: { ui: 'additem' } }, it); return;
    }
    if (st.editing && e.key === 'Enter' && st.editing.el.dataset.field !== 'text' && !e.shiftKey) { e.preventDefault(); commitEdit(); return; }
    if (typing) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && (e.key.toLowerCase() === 'z' || e.key.toLowerCase() === 'y')) { e.preventDefault(); if (e.key.toLowerCase() === 'y' || e.shiftKey) redo(); else undo(); return; }
    if (mod && (e.key === '=' || e.key === '+')) { e.preventDefault(); zoomBy(1.2); }
    else if (mod && e.key === '-') { e.preventDefault(); zoomBy(1 / 1.2); }
    else if (mod && e.key === '0') { e.preventDefault(); fit(); }
    else if (mod && e.key.toLowerCase() === 'c' && st.sel && !st.editing && !String(window.getSelection?.() || '')) {
      // copiar o cartão: fica pronto para colar (Ctrl+V) aqui ou noutro board; uma imagem vai também
      // para a área de transferência do computador, para a colares num plano, noutra app, etc.
      const it = items.get(st.sel); if (!it || it.kind === 'board') return;
      e.preventDefault();
      CLIP = { mark: `portal-card:${Date.now().toString(36)}`, item: JSON.parse(JSON.stringify({ kind: it.kind, data: it.data, x: it.x, y: it.y, w: it.w, h: it.h })), board: boardId, n: 0 };
      copyToSystem(it).then(() => toast(it.kind === 'image' ? 'Imagem copiada.' : 'Copiado. Cola com Ctrl+V.'));
    } else if (mod && e.key.toLowerCase() === 'd' && st.sel) {
      e.preventDefault(); const it = items.get(st.sel); if (!it || it.kind === 'board') return;
      create(it.kind, { x: it.x + it.w / 2 + 30, y: it.y + it.h / 2 + 30 }, JSON.parse(JSON.stringify(it.data)), [it.w, it.h]);
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && st.sel) {
      // apaga o cartão selecionado, mesmo que o foco tenha ficado num botão da barra
      e.preventDefault(); const it = items.get(st.sel); if (!it) return;
      if (it.kind === 'board' && !it.data?.link && !(await confirmBox(`Apagar o board "${it.data?.title || 'Board'}" e tudo o que tem dentro?`, 'Apagar'))) return;
      await remove(it);
    } else if (e.key === 'Escape') {
      if (st.sel) select(null); else onUp && onUp();
    } else if (e.key === 'Enter' && st.sel) {
      const it = items.get(st.sel); const txt = world.querySelector(`[data-id="${st.sel}"] .txt`);
      if (it && txt) { e.preventDefault(); startEdit(it.id, txt); }
    }
  };
  document.addEventListener('keydown', onKey);

  // ---------- desfazer um board aqui (ou copiar o conteúdo de outro board) ----------
  // Mostra primeiro onde os elementos vão ficar (uma pré-visualização que se arrasta), sem tapar o que já cá está.
  // Ao confirmar, copia todos os elementos para este board. O cartão do board sai daqui; o board original continua a
  // existir se estiver noutro sítio (outro cartão, ferramenta do menu, moodboard de um décor…). Se só existia aqui, sai.
  let dc = null;
  async function decompose(srcId, card) {
    if (dc) dc.cancel();
    if (srcId === boardId) return toast('Não dá para copiar um board para dentro dele próprio.');
    const [{ data: src }, { data: rows, error }] = await Promise.all([
      sb.from('boards').select('id, title, kind, parent_id, data, project_id, group_id, position, created_by, visible_to').eq('id', srcId).maybeSingle(),
      sb.from('board_items').select('*').eq('board_id', srcId),
    ]);
    if (error) return toast(error.message);
    if (!rows?.length) return toast(`O board «${src?.title || 'Board'}» está vazio: não há nada para passar.`);
    const nu = await signedUrls(rows.filter((r) => r.kind === 'image' || r.kind === 'audio').map((r) => r.data?.path).concat(rows.filter((r) => r.kind === 'board').map((r) => r.data?.cover)));
    urls = { ...urls, ...nu };
    const bx = Math.min(...rows.map((r) => r.x)), by = Math.min(...rows.map((r) => r.y));
    const bw = Math.max(...rows.map((r) => r.x + r.w)) - bx, bh = Math.max(...rows.map((r) => r.y + r.h)) - by;
    const others = () => [...items.values()].filter((x) => !card || x.id !== card.id);
    const hits = (gx, gy) => others().some((o) => gx < o.x + o.w + 16 && gx + bw + 16 > o.x && gy < o.y + o.h + 16 && gy + bh + 16 > o.y);
    // sítio inicial: onde está o cartão (ou o meio do ecrã); se tapar alguma coisa, à direita, depois por baixo de tudo
    const r0 = stage.getBoundingClientRect(); const mid = toWorld(r0.left + r0.width / 2, r0.top + r0.height / 2);
    const all = others();
    const cx = card ? card.x : Math.round(mid.x - bw / 2), cy = card ? card.y : Math.round(mid.y - bh / 2);
    const right = all.length ? Math.max(...all.map((o) => o.x + o.w)) + 80 : cx, top = all.length ? Math.min(...all.map((o) => o.y)) : cy;
    const below = all.length ? Math.max(...all.map((o) => o.y + o.h)) + 80 : cy, left = all.length ? Math.min(...all.map((o) => o.x)) : cx;
    let [gx, gy] = [[cx, cy], [right, card ? card.y : top], [left, below]].find(([x, y]) => !hits(x, y)) || [right, top];
    const g = document.createElement('div'); g.className = 'dc-ghost';
    g.style.cssText = `width:${bw}px;height:${bh}px;z-index:${maxZ() + 5}`;
    g.innerHTML = rows.slice().sort((a, b) => a.z - b.z).map((r) => {
      const d = r.data || {}; const u = r.kind === 'image' ? urls[d.path] : r.kind === 'board' ? urls[d.cover] : '';
      const txt = r.kind === 'image' ? '' : (d.text || d.title || (d.html ? d.html.replace(/<[^>]+>/g, ' ') : '') || { palette: 'Paleta', list: 'Lista', board: 'Board', video: 'Vídeo', audio: 'Música', link: 'Ligação' }[r.kind] || '').slice(0, 80);
      return `<div class="dc-it k-${esc(r.kind)}" style="left:${r.x - bx}px;top:${r.y - by}px;width:${r.w}px;height:${r.h}px;${u ? `background-image:url('${esc(u)}')` : ''}${d.bg && r.kind !== 'title' ? `;background-color:${esc(d.bg)}` : ''}">${txt ? `<span>${esc(txt)}</span>` : ''}</div>`;
    }).join('') + `<div class="dc-tag"></div>`;
    world.appendChild(g);
    const tag = g.querySelector('.dc-tag');
    const place = () => { g.style.left = `${gx}px`; g.style.top = `${gy}px`; const bad = hits(gx, gy); g.classList.toggle('dc-bad', bad); tag.textContent = bad ? 'Está por cima de outros elementos: arrasta para um espaço livre' : `${rows.length} ${rows.length === 1 ? 'elemento' : 'elementos'} · arrasta para escolher o sítio`; tag.style.transform = `scale(${1 / st.view.k})`; const s2 = root.querySelector('[data-dcs]'); if (s2) { s2.textContent = bad ? 'Por cima de outros elementos' : 'Arrasta para escolher o sítio'; s2.classList.toggle('bad', bad); } };
    place();
    // mostra a pré-visualização inteira no ecrã
    { const k = Math.max(0.1, Math.min(st.view.k, (r0.width - 300) / (bw + 200), (r0.height - 260) / (bh + 200)));
      const inView = gx * st.view.k + st.view.x > 40 && (gx + bw) * st.view.k + st.view.x < r0.width - 130 && gy * st.view.k + st.view.y > 90 && (gy + bh) * st.view.k + st.view.y < r0.height - 100;
      if (!inView) { st.view = { k, x: r0.width / 2 - (gx + bw / 2) * k, y: r0.height / 2 - (gy + bh / 2) * k }; applyView(); } }
    const ui = document.createElement('div'); ui.className = 'dc-bar'; ui.setAttribute('role', 'dialog'); ui.setAttribute('aria-label', 'Onde ficam os elementos');
    ui.innerHTML = `<span>${card ? 'Desfazer' : 'Copiar'} <b>${esc(src?.title || 'Board')}</b> aqui · <span class="muted" data-dcs></span></span><button type="button" class="btn ghost sm" data-dcx>Cancelar</button><button type="button" class="btn primary sm" data-dcok>Colocar aqui</button>`;
    root.appendChild(ui); place();
    ui.addEventListener('pointerdown', (e) => e.stopPropagation());
    let drag = null;
    const mv = (e) => { if (!drag) return; gx = Math.round(drag.gx + (e.clientX - drag.x) / st.view.k); gy = Math.round(drag.gy + (e.clientY - drag.y) / st.view.k); place(); };
    const up = () => { drag = null; g.classList.remove('dc-drag'); };
    g.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); drag = { x: e.clientX, y: e.clientY, gx, gy }; g.classList.add('dc-drag'); });
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); } if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); finish(true); } };
    document.addEventListener('keydown', key, true);
    let done = false;
    async function finish(ok) {
      if (done) return; done = true; dc = null;
      g.remove(); ui.remove(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); document.removeEventListener('keydown', key, true);
      if (!ok) return;
      if (hits(gx, gy) && !(await confirmBox('Os elementos vão ficar por cima de outros. Colocar mesmo assim?', 'Colocar'))) return decompose(srcId, card);
      const z0 = maxZ() + 1, zMin = Math.min(...rows.map((r) => r.z));
      const copies = rows.map((r) => {
        const d = JSON.parse(JSON.stringify(r.data || {}));
        if (r.kind === 'board') d.link = true; // um board dentro do outro passa como ligação (não se apaga com o cartão)
        return { id: crypto.randomUUID(), board_id: boardId, kind: r.kind, x: gx + (r.x - bx), y: gy + (r.y - by), w: r.w, h: r.h, z: z0 + (r.z - zMin), data: d };
      });
      const { error: e1 } = await sb.from('board_items').insert(copies);
      if (e1) return toast('Não foi possível copiar: ' + e1.message);
      const op = { t: 'decomp', copies, card: card ? rowOf(card) : null, src: null, srcItems: null };
      if (card) {
        items.delete(card.id); world.querySelector(`[data-id="${card.id}"]`)?.remove(); if (st.sel === card.id) { st.sel = null; placeBar(); }
        await sb.from('board_items').delete().eq('id', card.id);
        // o board original: fica se estiver noutro sítio; se era só um board dentro deste e já não aparece em lado nenhum, sai
        if (src && src.kind === 'board' && src.parent_id === boardId) {
          const [{ count: elsewhere }, { count: kids }] = await Promise.all([
            sb.from('board_items').select('id', { count: 'exact', head: true }).eq('kind', 'board').eq('data->>board_id', src.id),
            sb.from('boards').select('id', { count: 'exact', head: true }).eq('parent_id', src.id),
          ]);
          if (!elsewhere && !kids) { const { error: e2 } = await sb.from('boards').delete().eq('id', src.id); if (!e2) { op.src = src; op.srcItems = rows; } }
        }
      }
      copies.forEach((c) => { items.set(c.id, { ...c }); cardEl(items.get(c.id)); });
      record(op);
      toast(`${copies.length} ${copies.length === 1 ? 'elemento passou' : 'elementos passaram'} para este board. Ctrl+Z para desfazer.`);
    }
    ui.querySelector('[data-dcx]').addEventListener('click', () => finish(false));
    ui.querySelector('[data-dcok]').addEventListener('click', () => finish(true));
    dc = { cancel: () => finish(false) };
  }
  async function applyDecomp(op, dir) {
    if (dir === 'undo') {
      const ids = op.copies.map((c) => c.id);
      ids.forEach((id) => { items.delete(id); world.querySelector(`[data-id="${id}"]`)?.remove(); });
      if (ids.includes(st.sel)) { st.sel = null; placeBar(); }
      await sb.from('board_items').delete().in('id', ids);
      if (op.src) { const { error } = await sb.from('boards').insert(op.src); if (!error && op.srcItems?.length) await sb.from('board_items').insert(op.srcItems); }
      if (op.card) { const { error } = await sb.from('board_items').insert(op.card); if (!error || /duplicate/i.test(error.message)) { items.set(op.card.id, { ...op.card }); cardEl(items.get(op.card.id)); } }
    } else {
      const { error } = await sb.from('board_items').insert(op.copies); if (error && !/duplicate/i.test(error.message)) { toast(error.message); return null; }
      op.copies.forEach((c) => { items.set(c.id, { ...c }); cardEl(items.get(c.id)); });
      if (op.card) { items.delete(op.card.id); world.querySelector(`[data-id="${op.card.id}"]`)?.remove(); await sb.from('board_items').delete().eq('id', op.card.id); }
      if (op.src) await sb.from('boards').delete().eq('id', op.src.id);
    }
    return op;
  }

  async function remove(it) {
    if (it.kind !== 'board') record({ t: 'del', row: rowOf(it) });
    items.delete(it.id); world.querySelector(`[data-id="${it.id}"]`)?.remove(); st.sel = null; placeBar();
    const { error } = await sb.from('board_items').delete().eq('id', it.id);
    if (error) return toast(error.message);
    if (it.kind === 'board' && it.data?.board_id && !it.data.link) await sb.from('boards').delete().eq('id', it.data.board_id);
    // imagens e áudio: o ficheiro só é apagado ao sair do board, para o Ctrl+Z poder trazer o cartão de volta
    if ((it.kind === 'image' || it.kind === 'audio') && it.data?.path) { pending.set(it.id, it); toast('Apagado. Ctrl+Z para desfazer.'); return; }
    toast('Apagado.');
  }

  // apaga o ficheiro de uma imagem/áudio que saiu do board (se mais nada no projeto o usar)
  async function cleanupFiles(it) {
    const path = it.data?.path; if (!path) return;
    if (it.kind === 'image' && it.data.shared) return; // vem do storyboard, do elenco, dos décors…: o ficheiro é deles
    if (it.kind === 'image') { const { count } = await sb.from('board_items').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('data->>path', path); if (!count) await sb.storage.from(BUCKET).remove([path]); return; }
    if (it.kind !== 'audio' || it.data.shared) return;
    const [{ count }, { data: pr }, { data: tools }] = await Promise.all([
      sb.from('board_items').select('id', { count: 'exact', head: true }).eq('project_id', projectId).eq('kind', 'audio').eq('data->>path', path),
      sb.from('projects').select('music').eq('id', projectId).maybeSingle(),
      sb.from('boards').select('data').eq('project_id', projectId).eq('kind', 'media'),
    ]);
    const used = (count || 0) > 0 || pr?.music?.audio_path === path || (tools || []).some((t) => t.data?.audio_path === path);
    if (!used) await sb.storage.from(BUCKET).remove([path]);
  }

  // ---------- tempo real ----------
  const ch = sb.channel('board-' + boardId)
    .on('postgres_changes', { event: 'INSERT', schema: DB_SCHEMA, table: 'board_items', filter: `board_id=eq.${boardId}` }, async ({ new: row }) => {
      if (items.has(row.id)) return;
      if ((row.kind === 'image' || row.kind === 'audio') && row.data?.path) urls = { ...urls, ...(await signedUrls([row.data.path])) };
      items.set(row.id, row); cardEl(row);
    })
    .on('postgres_changes', { event: 'UPDATE', schema: DB_SCHEMA, table: 'board_items', filter: `board_id=eq.${boardId}` }, ({ new: row }) => {
      if (st.drag?.id === row.id || st.editing?.id === row.id || saveT.has(row.id)) return;
      const cur = items.get(row.id); if (!cur) return;
      if (cur.updated_at && row.updated_at && row.updated_at < cur.updated_at) return;
      items.set(row.id, row); cardEl(row);
    })
    .on('postgres_changes', { event: 'DELETE', schema: DB_SCHEMA, table: 'board_items' }, ({ old }) => {
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
    urls = await signedUrls([...data.filter((r) => r.kind === 'image' || r.kind === 'audio').map((r) => r.data?.path), ...data.filter((r) => r.kind === 'board').map((r) => r.data?.cover), ...firstImgs.map((i) => i.data?.path)]);
    firstImgs.forEach((i) => { if (!covers[i.board_id] && urls[i.data?.path]) covers[i.board_id] = urls[i.data.path]; });
    renderAll();
    let saved = null; try { saved = JSON.parse(localStorage.getItem(viewKey) || 'null'); } catch { /* nada */ }
    if (saved && Number.isFinite(saved.k)) { st.view = saved; applyView(); } else fit();
  })();
  applyView();
  if (!embedded) stage.focus({ preventScroll: true });
  // marcar os cartões em uso por outras pessoas (sem redesenhar o conteúdo)
  const offLocks = presence?.onCards((m) => {
    locked = m;
    world.querySelectorAll('.card').forEach((el) => {
      const lk = locked.get(el.dataset.id);
      el.classList.toggle('card-locked', !!lk);
      if (lk) { el.style.setProperty('--lk', lk.color || '#F08A24'); el.dataset.lockName = lk.name; } else delete el.dataset.lockName;
    });
    if (st.sel && locked.has(st.sel) && !st.editing) select(null);
  });

  return {
    add, fit, zoomBy, setZoom, colors: COLORS, undo, redo,
    // coordenadas no board para um ponto do ecrã, ou null se estiver fora do board
    worldAt: (cx, cy) => { const r = stage.getBoundingClientRect(); return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom ? toWorld(cx, cy) : null; },
    setColor: (c, delay) => setBg(c, delay),
    get zoom() { return st.view.k; },
    destroy() {
      st.dead = true; dc?.cancel(); commitEdit(); flushItems();
      pending.forEach((it) => cleanupFiles(it)); pending.clear(); offLocks && offLocks(); presence?.setCard(null);
      document.removeEventListener('keydown', onKey); document.removeEventListener('paste', onPaste); document.removeEventListener('pointerdown', onDocDown, true); document.removeEventListener('selectionchange', onSelChange);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end);
      sb.removeChannel(ch);
    },
  };
}
