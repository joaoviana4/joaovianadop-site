// Recorte de imagens (páginas e boards). O recorte guarda-se como frações da imagem original:
// crop = { x, y, w, h } (0–1). A imagem nunca é alterada: só se mostra a parte escolhida.
// Recorta-se na própria imagem, com as pegas dos lados (sem janela). Redimensionar mantém sempre a proporção.

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

// Pegas de recorte na própria imagem, uma a meio de cada lado (aparecem ao passar o rato). Arrastar uma pega para
// dentro corta esse lado; para fora volta a mostrar o que estava cortado. A imagem não muda de escala: a caixa
// acompanha o recorte e, enquanto se arrasta, vê-se a imagem inteira esbatida à volta. Esc a meio desfaz.
// frame: a caixa com overflow:hidden onde está a <img> (estilo de cropImgStyle).
// opts: { nat: () => ({ w, h }), get: () => crop, apply(crop) (desenha a caixa com este recorte),
//         box: { start() → { left, right, top } (espaço livre em px) ou null, move(dl, dt, dw), end(dl, dt, dw), cancel() },
//         zoom: () => escala do ecrã (boards), commit(crop | null) }
const MINPX = 40;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function cropSliders(frame, opts) {
  frame.querySelectorAll('.crs-h').forEach((x) => x.remove());
  frame.insertAdjacentHTML('beforeend', ['n', 'e', 's', 'w'].map((sd) => `<span class="crs-h ${sd}" data-crs="${sd}" title="Arrasta para recortar"><i></i></span>`).join(''));
  frame.querySelectorAll('[data-crs]').forEach((hd) => hd.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const nat = opts.nat(); if (!nat?.w || !nat?.h) return;
    const room = opts.box.start(); if (!room) return;
    const side = hd.dataset.crs; const k = opts.zoom?.() || 1;
    const c0 = { ...(opts.get() || FULL) };
    const pw = frame.offsetWidth / c0.w, ph = pw * (nat.h / nat.w); // tamanho (px) da imagem inteira, à escala de agora
    const img = frame.querySelector('img');
    const ghost = document.createElement('img'); ghost.className = 'crs-ghost'; ghost.alt = ''; ghost.draggable = false; ghost.src = img?.currentSrc || img?.src || '';
    ghost.style.width = `${pw}px`; ghost.style.height = `${ph}px`;
    frame.before(ghost); frame.classList.add('crs-on'); document.body.classList.add('crs-busy');
    let c = { ...c0 }, dl = 0, dt = 0, dw = 0;
    const put = () => { ghost.style.left = `${frame.offsetLeft - c.x * pw}px`; ghost.style.top = `${frame.offsetTop - c.y * ph}px`; };
    const sx = e.clientX, sy = e.clientY;
    const mv = (m) => {
      const dx = (m.clientX - sx) / k, dy = (m.clientY - sy) / k;
      dl = 0; dt = 0; dw = 0; c = { ...c0 };
      if (side === 'w') { dl = clamp(dx, Math.max(-c0.x * pw, -room.left), c0.w * pw - MINPX); c.x = c0.x + dl / pw; c.w = c0.w - dl / pw; dw = -dl; }
      if (side === 'e') { dw = clamp(dx, -(c0.w * pw - MINPX), Math.min((1 - c0.x - c0.w) * pw, room.right)); c.w = c0.w + dw / pw; }
      if (side === 'n') { dt = clamp(dy, Math.max(-c0.y * ph, -room.top), c0.h * ph - MINPX); c.y = c0.y + dt / ph; c.h = c0.h - dt / ph; }
      if (side === 's') { const dh = clamp(dy, -(c0.h * ph - MINPX), (1 - c0.y - c0.h) * ph); c.h = c0.h + dh / ph; }
      // arredonda e cola às arestas da imagem
      ['x', 'y', 'w', 'h'].forEach((q) => { c[q] = Math.round(c[q] * 10000) / 10000; });
      if (c.x < 0.002) { c.w += c.x; c.x = 0; } if (c.y < 0.002) { c.h += c.y; c.y = 0; }
      if (c.x + c.w > 0.998) c.w = 1 - c.x; if (c.y + c.h > 0.998) c.h = 1 - c.y;
      opts.apply(c); opts.box.move(dl, dt, dw); put();
    };
    const stop = (ok) => {
      window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', upH); window.removeEventListener('pointercancel', cancelH); window.removeEventListener('keydown', key, true);
      ghost.remove(); frame.classList.remove('crs-on'); document.body.classList.remove('crs-busy');
      if (!ok) { opts.apply(c0); opts.box.cancel(); return; }
      opts.box.end(dl, dt, dw); opts.commit(isFull(c) ? null : c);
    };
    const upH = () => stop(true); const cancelH = () => stop(false);
    const key = (ev) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); stop(false); } };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', upH); window.addEventListener('pointercancel', cancelH); window.addEventListener('keydown', key, true);
    put();
  }));
}
