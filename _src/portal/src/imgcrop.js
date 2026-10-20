import { esc, modal, ICON } from './lib.js';

// Recorte de imagens (páginas e boards). O recorte guarda-se como frações da imagem original:
// crop = { x, y, w, h } (0–1). A imagem nunca é alterada: só se mostra a parte escolhida.
// Fora do modo de recorte, redimensionar mantém sempre a proporção (da parte recortada).

const RATIOS = [['', 'Livre'], ['orig', 'Original'], ['16:9', '16:9'], ['4:3', '4:3'], ['1:1', '1:1'], ['4:5', '4:5'], ['9:16', '9:16'], ['2.39:1', '2.39:1']];
const FULL = { x: 0, y: 0, w: 1, h: 1 };
export const isFull = (c) => !c || (c.x <= 0.0005 && c.y <= 0.0005 && c.w >= 0.9995 && c.h >= 0.9995);

// proporção (largura/altura) do que se vê, em píxeis
export function cropAspect(crop, nw, nh) {
  const c = crop || FULL; if (!nw || !nh) return null;
  return (c.w * nw) / (c.h * nh);
}
// estilo da <img> dentro de uma caixa com overflow:hidden e a proporção do recorte
export function cropImgStyle(crop) {
  const c = crop || FULL;
  return `position:absolute;width:${(100 / c.w).toFixed(4)}%;height:${(100 / c.h).toFixed(4)}%;left:${(-c.x / c.w * 100).toFixed(4)}%;top:${(-c.y / c.h * 100).toFixed(4)}%;max-width:none;object-fit:fill`;
}
export function naturalSize(url) {
  return new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res(null); im.src = url; });
}

// abre o modo de recorte; devolve o recorte novo, ou null se cancelar
export function cropDialog(url, crop0, nat) {
  return new Promise((resolve) => {
    let c = { ...(crop0 || FULL) }; let ratio = ''; let result = null;
    const m = modal(`<div class="crp">
      <div class="row between wrap-gap"><h2>Recortar imagem</h2>
        <div class="seg crp-ratios" role="radiogroup" aria-label="Proporção">${RATIOS.map(([k, l]) => `<button type="button" role="radio" data-ratio="${k}" aria-checked="${k === ''}">${l}</button>`).join('')}</div></div>
      <div class="crp-stage"><img src="${esc(url)}" alt="" draggable="false"><div class="crp-clip"><div class="crp-shade"></div></div><div class="crp-box" tabindex="0" aria-label="Zona recortada (arrasta para mover)">
        ${['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => `<i class="crp-h ${h}" data-h="${h}"></i>`).join('')}<span class="crp-g"></span></div></div>
      <div class="row between"><button type="button" class="btn ghost" data-reset>${ICON.refresh || ''} Imagem inteira</button>
        <span class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Aplicar</button></span></div></div>`, { wide: true, onClose: () => resolve(result) });
    m.el.classList.add('crp-modal');
    const stage = m.el.querySelector('.crp-stage'), box = m.el.querySelector('.crp-box');
    // Aplicar com a imagem inteira = tirar o recorte (devolve FULL); Cancelar, X ou Esc = null
    m.el.querySelector('[data-ok]').addEventListener('click', () => { result = isFull(c) ? { ...FULL } : c; m.close(); });
    m.el.querySelector('[data-reset]').addEventListener('click', () => { c = { ...FULL }; ratio = ''; mark(); draw(); });
    const shade = m.el.querySelector('.crp-shade');
    const draw = () => { const st = { left: `${c.x * 100}%`, top: `${c.y * 100}%`, width: `${c.w * 100}%`, height: `${c.h * 100}%` }; Object.assign(box.style, st); Object.assign(shade.style, st); };
    const mark = () => m.el.querySelectorAll('[data-ratio]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.ratio === ratio)));
    // proporção pedida, em frações (w/h) tendo em conta o tamanho da imagem
    const want = () => {
      if (!ratio || !nat?.w) return null;
      const r = ratio === 'orig' ? nat.w / nat.h : (() => { const [a, b] = ratio.split(':').map(Number); return a / b; })();
      return r * (nat.h / nat.w);
    };
    const fit = () => {
      const r = want(); if (!r) return;
      // ajusta à volta do centro, o maior possível dentro da imagem
      const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      let w = c.w, h = w / r; if (h > 1) { h = 1; w = h * r; } if (w > 1) { w = 1; h = w / r; }
      if (h > c.h && c.h < 1) { h = Math.min(1, c.h); w = h * r; }
      c = { w, h, x: Math.min(1 - w, Math.max(0, cx - w / 2)), y: Math.min(1 - h, Math.max(0, cy - h / 2)) };
    };
    m.el.querySelectorAll('[data-ratio]').forEach((b) => b.addEventListener('click', () => { ratio = b.dataset.ratio; mark(); fit(); draw(); }));
    const MIN = 0.04;
    box.addEventListener('pointerdown', (e) => {
      e.preventDefault(); box.setPointerCapture(e.pointerId);
      const h = e.target.dataset.h || 'move'; const R = stage.getBoundingClientRect(); const c0 = { ...c }; const sx = e.clientX, sy = e.clientY; const r = want();
      const mv = (ev) => {
        const dx = (ev.clientX - sx) / R.width, dy = (ev.clientY - sy) / R.height;
        if (h === 'move') { c.x = Math.min(1 - c0.w, Math.max(0, c0.x + dx)); c.y = Math.min(1 - c0.h, Math.max(0, c0.y + dy)); draw(); return; }
        let { x, y, w, h: hh } = c0;
        if (h.includes('w')) { const nx = Math.min(x + w - MIN, Math.max(0, x + dx)); w += x - nx; x = nx; }
        if (h.includes('e')) w = Math.min(1 - x, Math.max(MIN, w + dx));
        if (h.includes('n')) { const ny = Math.min(y + hh - MIN, Math.max(0, y + dy)); hh += y - ny; y = ny; }
        if (h.includes('s')) hh = Math.min(1 - y, Math.max(MIN, hh + dy));
        if (r) {
          // proporção fixa: a aresta que se puxa manda; a outra acompanha
          if (h === 'n' || h === 's') { const nw = hh * r; if (x + nw > 1) { w = 1 - x; hh = w / r; } else w = nw; }
          else { let nh = w / r; if (y + nh > 1 || (h.includes('n') && nh > y + hh)) { nh = h.includes('n') ? y + hh : 1 - y; w = nh * r; } if (h.includes('n')) y = y + hh - nh; hh = nh; if (h.includes('w')) x = c0.x + c0.w - w; }
        }
        c = { x: Math.max(0, x), y: Math.max(0, y), w: Math.min(1, w), h: Math.min(1, hh) }; draw();
      };
      const up = () => { box.removeEventListener('pointermove', mv); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); };
      box.addEventListener('pointermove', mv); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    });
    m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.target.closest('button')) { e.preventDefault(); m.el.querySelector('[data-ok]').click(); } });
    draw();
  });
}
