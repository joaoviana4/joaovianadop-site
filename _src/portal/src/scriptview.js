import { esc, ICON, signedUrl } from './lib.js';
import { parseScript, openPdf, pdfPageText, isSceneHeading, classifyLines } from './script.js';

// Leitor do guião: as páginas do PDF tal como foram escritas (ou, para Fountain / Final Draft / texto,
// o texto paginado com a formatação de guião), com índice de cenas, zoom, ir para a página e ecrã inteiro.
//
// mountReader(el, { version, scenes, sceneHref }) → { destroy }
//   version: linha de `scripts` (body, file_path, filename)
//   scenes:  cenas do projeto (para ligar cada cena do índice à página da cena), opcional
//   sceneHref(number): link para a página da cena, opcional

const KEY = 'portal-script-zoom';
const getZoom = () => { try { return localStorage.getItem(KEY) || 'fit'; } catch { return 'fit'; } };
const setZoom = (z) => { try { localStorage.setItem(KEY, String(z)); } catch { /* sem armazenamento */ } };

export function mountReader(el, { version, sceneHref, pagesIndex = false }) {
  const isPdf = /\.pdf$/i.test(version.file_path || '') || /\.pdf$/i.test(version.filename || '');
  const idx = pagesIndex ? [] : parseScript(version.body || '').scenes; // índice de cenas
  el.innerHTML = `<div class="sr">
    <aside class="sr-side" data-side>
      ${pagesIndex ? `<div class="sr-side-h"><strong>Páginas</strong><span class="muted small" data-pn></span></div><ol class="sr-thumbs" data-thumbs></ol><ol hidden data-scenes>` : `<div class="sr-side-h"><strong>Cenas</strong><span class="muted small">${idx.length}</span></div>
      <input class="sr-find" type="search" placeholder="Procurar cena" aria-label="Procurar cena" data-find>
      <ol class="sr-scenes" data-scenes>`}${idx.map((s, i) => `<li><button type="button" data-sc="${i}"><b>${esc(s.number)}</b><span>${esc(s.heading.replace(/^\d+[A-Z]?\.?\s+/, ''))}</span></button>${sceneHref ? `<a class="sr-go" href="${esc(sceneHref(s.number))}" title="Abrir a cena ${esc(s.number)}" aria-label="Abrir a cena ${esc(s.number)}">${ICON.open || '›'}</a>` : ''}</li>`).join('') || '<li class="muted small">Sem cenas.</li>'}</ol>
    </aside>
    <div class="sr-main">
      <div class="sr-bar">
        <button type="button" class="icon-btn sm sr-toggle" data-toggle title="${pagesIndex ? 'Páginas' : 'Índice de cenas'}" aria-label="Mostrar ou esconder o índice">${ICON.list}</button>
        <span class="sr-pg"><button type="button" class="icon-btn sm" data-prev aria-label="Página anterior">‹</button>
          <input data-pg inputmode="numeric" value="1" aria-label="Página"><span class="muted">de <span data-n>…</span></span>
          <button type="button" class="icon-btn sm" data-next aria-label="Página seguinte">›</button></span>
        <span class="sr-zoom"><button type="button" class="icon-btn sm" data-zout aria-label="Diminuir">−</button><button type="button" class="link-btn" data-zfit title="Ajustar à largura"><span data-zl>100%</span></button><button type="button" class="icon-btn sm" data-zin aria-label="Aumentar">+</button></span>
        <span class="sr-right">${version.file_path ? `<button type="button" class="link-btn" data-dl>Descarregar</button>` : ''}<button type="button" class="icon-btn sm" data-fs title="Ecrã inteiro" aria-label="Ecrã inteiro">⤢</button></span>
      </div>
      <div class="sr-pages" data-pages tabindex="0"><p class="muted sr-wait">A abrir o guião…</p></div>
    </div>
  </div>`;
  const root = el.querySelector('.sr');
  const pagesEl = el.querySelector('[data-pages]');
  const pgIn = el.querySelector('[data-pg]');
  let destroyed = false;
  let zoom = getZoom(); // 'fit' ou número
  let pages = []; // { el, w, h, rendered }
  let scenePage = []; // índice da cena → página (0-based)
  let sceneAnchor = []; // modo texto: elemento da linha do cabeçalho
  let pdf = null, pdfjs = null, io = null;
  const BASE_W = 816; // largura de uma página (8.5in a 96dpi)

  const scale = () => {
    if (zoom !== 'fit') return Number(zoom);
    const w = pagesEl.clientWidth - 48;
    return Math.max(0.4, Math.min(1.6, w / BASE_W));
  };
  const zl = () => { el.querySelector('[data-zl]').textContent = `${Math.round(scale() * 100)}%`; };

  // ---------- PDF ----------
  async function openPdfMode() {
    const url = await signedUrl(version.file_path);
    if (!url) throw new Error('sem acesso ao ficheiro');
    ({ pdf, pdfjs } = await openPdf({ url }));
    if (destroyed) return;
    pagesEl.innerHTML = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i);
      const vp = pg.getViewport({ scale: 1 });
      const box = document.createElement('div');
      box.className = 'sr-page pdf'; box.dataset.p = i - 1;
      box.innerHTML = `<span class="sr-pnum">${i}</span>`;
      pagesEl.append(box);
      pages.push({ el: box, w: vp.width * (96 / 72), h: vp.height * (96 / 72), page: pg, rendered: 0 });
    }
    el.querySelector('[data-n]').textContent = pages.length;
    layout();
    if (pagesIndex) { thumbs(); return; }
    // cenas → página: conta os cabeçalhos de cena em cada página
    let k = 0;
    for (let i = 0; i < pages.length && !destroyed; i++) {
      const t = await pdfPageText(pages[i].page);
      t.split('\n').forEach((l) => { if (isSceneHeading(l) && k < idx.length) scenePage[k++] = i; });
    }
    for (; k < idx.length; k++) scenePage[k] = scenePage[k - 1] ?? 0;
    markScene();
  }
  // miniaturas das páginas (índice dos tratamentos)
  async function thumbs() {
    const box = el.querySelector('[data-thumbs]'); if (!box) return;
    el.querySelector('[data-pn]').textContent = pages.length;
    box.innerHTML = pages.map((_, i) => `<li><button type="button" data-tp="${i}"><span class="sr-tc"></span><small>${i + 1}</small></button></li>`).join('');
    box.addEventListener('click', (e) => { const b = e.target.closest('[data-tp]'); if (b) { goPage(+b.dataset.tp, true); if (matchMedia('(max-width: 760px)').matches) root.classList.add('no-side'); } });
    for (let i = 0; i < pages.length && !destroyed; i++) {
      const vp = pages[i].page.getViewport({ scale: 150 / pages[i].page.getViewport({ scale: 1 }).width });
      const cv = document.createElement('canvas'); cv.width = Math.floor(vp.width); cv.height = Math.floor(vp.height);
      try { await pages[i].page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise; } catch { continue; }
      box.querySelector(`[data-tp="${i}"] .sr-tc`)?.append(cv);
    }
  }
  async function renderPdfPage(p) {
    const s = scale();
    if (p.rendered === s) return;
    p.rendered = s;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const vp = p.page.getViewport({ scale: s * (96 / 72) });
    const cv = document.createElement('canvas');
    cv.width = Math.floor(vp.width * dpr); cv.height = Math.floor(vp.height * dpr);
    const ctx = cv.getContext('2d');
    await p.page.render({ canvasContext: ctx, viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
    if (destroyed || p.rendered !== s) return;
    const tl = document.createElement('div');
    tl.className = 'textLayer';
    tl.style.setProperty('--scale-factor', vp.scale);
    try { await new pdfjs.TextLayer({ textContentSource: await p.page.getTextContent(), container: tl, viewport: vp }).render(); } catch { /* sem camada de texto */ }
    p.el.querySelectorAll('canvas, .textLayer').forEach((x) => x.remove());
    p.el.prepend(cv); p.el.append(tl);
  }

  // ---------- Texto (Fountain, FDX, colado) ----------
  function textMode() {
    const blocks = classifyLines(version.body || '');
    // paginação: ~55 linhas por página, com quebra de linha aproximada por tipo
    const W = { action: 60, head: 60, trans: 60, center: 60, char: 38, paren: 25, dlg: 35 };
    const LPP = 55;
    const out = [[]]; let used = 0;
    blocks.forEach((b, i) => {
      if (b.t === 'blank') { if (used && used < LPP) { out[out.length - 1].push(b); used++; } return; }
      const n = Math.max(1, Math.ceil((b.s || '').length / W[b.t]));
      const keep = b.t === 'head' || b.t === 'char' ? 3 : 0; // não deixa cabeçalho nem nome no fundo da página
      if (used && used + n + keep > LPP) { while (out[out.length - 1].length && out[out.length - 1].at(-1).t === 'blank') out[out.length - 1].pop(); out.push([]); used = 0; }
      out[out.length - 1].push(b); used += n;
    });
    pagesEl.innerHTML = '';
    let k = 0;
    out.forEach((blk, i) => {
      const box = document.createElement('div');
      box.className = 'sr-page txt'; box.dataset.p = i;
      box.innerHTML = `<span class="sr-pnum">${i + 1}.</span>${blk.map((b) => b.t === 'blank' ? '<div class="sl-blank"></div>' : `<div class="sl-${b.t}">${esc(b.s)}</div>`).join('')}`;
      box.querySelectorAll('.sl-head').forEach((h) => { if (k < idx.length) { scenePage[k] = i; sceneAnchor[k] = h; k++; } });
      pagesEl.append(box);
      pages.push({ el: box, w: BASE_W, h: BASE_W * 11 / 8.5 });
    });
    el.querySelector('[data-n]').textContent = pages.length;
    layout();
    markScene();
  }

  // ---------- comum ----------
  function layout() {
    const s = scale();
    pages.forEach((p) => { p.el.style.width = `${Math.round(p.w * s)}px`; p.el.style.height = `${Math.round(p.h * s)}px`; p.el.style.setProperty('--z', s); });
    zl();
    if (pdf) {
      io?.disconnect();
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) renderPdfPage(pages[+e.target.dataset.p]); }), { root: pagesEl, rootMargin: '600px 0px' });
      pages.forEach((p) => io.observe(p.el));
    }
  }
  const curPage = () => {
    const top = pagesEl.scrollTop + pagesEl.clientHeight * 0.3;
    let c = 0; pages.forEach((p, i) => { if (p.el.offsetTop <= top) c = i; }); return c;
  };
  const goPage = (i, smooth) => { const p = pages[Math.max(0, Math.min(pages.length - 1, i))]; if (p) pagesEl.scrollTo({ top: p.el.offsetTop - 16, behavior: smooth ? 'smooth' : 'auto' }); };
  function markScene() {
    const c = curPage();
    if (document.activeElement !== pgIn) pgIn.value = pages.length ? c + 1 : 1;
    let cur = scenePage.findIndex((p) => p === c); if (cur < 0) scenePage.forEach((p, i) => { if (p < c) cur = i; });
    if (sceneAnchor.length) { const top = pagesEl.scrollTop + pagesEl.clientHeight * 0.3; sceneAnchor.forEach((a, i) => { if (a && a.getBoundingClientRect().top - pagesEl.getBoundingClientRect().top + pagesEl.scrollTop <= top) cur = i; }); }
    el.querySelectorAll('[data-sc]').forEach((b) => b.classList.toggle('on', +b.dataset.sc === cur));
    el.querySelectorAll('[data-tp]').forEach((b) => b.classList.toggle('on', +b.dataset.tp === c));
  }
  const rezoom = (z) => {
    const c = curPage(); const p = pages[c]; const off = p ? (pagesEl.scrollTop - p.el.offsetTop) / p.el.offsetHeight : 0;
    zoom = z; setZoom(z); layout();
    if (p) pagesEl.scrollTop = p.el.offsetTop + off * p.el.offsetHeight;
  };
  const step = (d) => { const steps = [0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2]; const s = scale(); const n = d > 0 ? steps.find((x) => x > s + 0.01) : [...steps].reverse().find((x) => x < s - 0.01); if (n) rezoom(n); };

  let raf = 0;
  pagesEl.addEventListener('scroll', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(markScene); });
  el.querySelector('[data-prev]').addEventListener('click', () => goPage(curPage() - 1, true));
  el.querySelector('[data-next]').addEventListener('click', () => goPage(curPage() + 1, true));
  pgIn.addEventListener('change', () => { const n = parseInt(pgIn.value, 10); if (n) goPage(n - 1); pgIn.blur(); });
  pgIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') pgIn.dispatchEvent(new Event('change')); });
  el.querySelector('[data-zin]').addEventListener('click', () => step(1));
  el.querySelector('[data-zout]').addEventListener('click', () => step(-1));
  el.querySelector('[data-zfit]').addEventListener('click', () => rezoom('fit'));
  el.querySelector('[data-toggle]').addEventListener('click', () => { root.classList.toggle('no-side'); if (zoom === 'fit') rezoom('fit'); });
  el.querySelector('[data-fs]').addEventListener('click', () => { if (document.fullscreenElement) document.exitFullscreen(); else root.requestFullscreen?.().catch(() => {}); });
  const onFs = () => { root.classList.toggle('fs', document.fullscreenElement === root); if (zoom === 'fit') setTimeout(() => rezoom('fit'), 60); };
  document.addEventListener('fullscreenchange', onFs);
  el.querySelector('[data-dl]')?.addEventListener('click', async () => { const u = await signedUrl(version.file_path); u && window.open(u, '_blank', 'noopener'); });
  el.querySelector('[data-scenes]').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sc]'); if (!b) return;
    const i = +b.dataset.sc;
    if (sceneAnchor[i]) pagesEl.scrollTo({ top: sceneAnchor[i].getBoundingClientRect().top - pagesEl.getBoundingClientRect().top + pagesEl.scrollTop - 24, behavior: 'smooth' });
    else goPage(scenePage[i] ?? 0, true);
    if (matchMedia('(max-width: 760px)').matches) root.classList.add('no-side');
  });
  el.querySelector('[data-find]')?.addEventListener('input', (e) => {
    const w = e.target.value.toLowerCase().trim();
    el.querySelectorAll('[data-scenes] li').forEach((li) => { li.hidden = !!w && !li.textContent.toLowerCase().includes(w); });
  });
  pagesEl.addEventListener('keydown', (e) => {
    if (e.target !== pagesEl) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(curPage() + 1, true); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(curPage() - 1, true); }
  });
  const onWheel = (e) => { if (!(e.ctrlKey || e.metaKey)) return; e.preventDefault(); const s = scale(); rezoom(Math.max(0.4, Math.min(2.5, +(s * Math.exp(-e.deltaY * 0.002)).toFixed(3)))); };
  pagesEl.addEventListener('wheel', onWheel, { passive: false });
  let rt = 0; const onResize = () => { clearTimeout(rt); rt = setTimeout(() => zoom === 'fit' && rezoom('fit'), 120); };
  window.addEventListener('resize', onResize);
  if (matchMedia('(max-width: 760px)').matches) root.classList.add('no-side');

  (isPdf && version.file_path ? openPdfMode() : Promise.resolve(textMode())).catch(() => { if (!destroyed) { pages = []; scenePage = []; pdf = null; textMode(); } });

  return {
    destroy() { destroyed = true; io?.disconnect(); window.removeEventListener('resize', onResize); document.removeEventListener('fullscreenchange', onFs); pdf?.destroy?.(); },
  };
}
