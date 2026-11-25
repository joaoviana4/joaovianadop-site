import { sb, esc, modal, toast, ICON, uploadImage, signedUrls, knownUrl } from './lib.js';
import { ACCENTS, setProjectAccent } from './appearance.js';

// Capa e cor de um projeto, numa só janela. A capa aparece no cartão e no topo da visão geral; a cor
// troca o azul do Studio enquanto se está dentro do projeto (o preto/branco do tema fica igual).
// `live`: a janela foi aberta dentro do próprio projeto, por isso a cor muda logo à volta.
const HEX = /^#[0-9a-f]{6}$/i;

// ---- enquadramento da capa: { x, y } = ponto (0–100) que fica ao centro; z = zoom (1 = imagem toda a cobrir) ----
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function normFrame(f) {
  const x = clamp(Number(f?.x ?? 50), 0, 100), y = clamp(Number(f?.y ?? 50), 0, 100), z = clamp(Number(f?.z ?? 1), 1, 2);
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, z: Math.round(z * 100) / 100 };
}
export function frameCss(f) {
  const { x, y, z } = normFrame(f);
  return `background-position:${x}% ${y}%;transform-origin:${x}% ${y}%;transform:scale(${z})`;
}
// camada da capa dentro de uma caixa (cartão, topo do projeto, pasta); shade = escurece em baixo para o texto
export const coverLayer = (url, frame, shade = false) => (url ? `<span class="cov-img${shade ? ' shade' : ''}" aria-hidden="true" style="background-image:url('${esc(url)}');${frameCss(frame)}"></span>` : '');

export function projectLookModal(p, after, { live = false } = {}) {
  const cur = HEX.test(p.accent || '') ? p.accent.toLowerCase() : null;
  const custom = cur && !ACCENTS.some(([c]) => c === cur);
  const coverUrl = p.cover_path ? knownUrl(p.cover_path) : null;
  const m = modal(`<h2>Capa e cor</h2><p class="muted small">Toda a equipa do projeto vê a capa e a cor.</p>
    <div class="stack pl-form">
      <div class="field"><span class="label">Capa</span>
        <div class="pl-cover ${p.cover_path ? 'has' : ''}" data-plcov>${p.cover_path ? coverLayer(coverUrl || '', p.cover_frame, true) : `<span>${ICON.image} Sem capa</span>`}</div>
        ${p.cover_path ? `<p class="muted small pl-hint">Arrasta a imagem para a subir, descer ou pôr mais à esquerda ou à direita.</p>
        <label class="pl-zoom"><span class="muted small">Recorte</span><input type="range" min="1" max="2" step="0.01" value="${normFrame(p.cover_frame).z}" data-plz aria-label="Recorte (zoom)"><b data-plzv>${Math.round(normFrame(p.cover_frame).z * 100)}%</b></label>` : ''}
        <div class="row wrap-gap"><button type="button" class="btn sm" data-plpick>${ICON.image}<span>${p.cover_path ? 'Mudar a imagem…' : 'Escolher imagem…'}</span></button>${p.cover_path ? '<button type="button" class="link-btn small" data-plcenter>Centrar</button><button type="button" class="link-btn small" data-plnocov>Tirar a capa</button>' : ''}</div>
      </div>
      <div class="field"><span class="label">Cor do projeto</span>
        <div class="look-sw">${ACCENTS.map(([c, l]) => `<button type="button" class="look-c ${cur === c ? 'on' : ''}" style="--c:${c}" data-plc="${c}" aria-label="${esc(l)}" title="${esc(l)}"></button>`).join('')}
          <label class="look-c custom ${custom ? 'on' : ''}" title="Outra cor" style="--c:${esc(cur || '#e5579b')}"><input type="color" value="${esc(cur || '#e5579b')}" data-plcustom aria-label="Outra cor">+</label></div>
        <p class="muted small">Troca o azul por esta cor dentro do projeto: botões, seleções e destaques. O fundo preto (ou claro) fica igual.</p>
        ${cur ? '<button type="button" class="link-btn small" data-plnone>Sem cor própria (usa a da Aparência de cada pessoa)</button>' : ''}
      </div>
      <div class="row end"><button type="button" class="btn primary" data-close>Feito</button></div>
    </div>`);
  const reopen = () => { m.close(); projectLookModal(p, after, { live }); };
  const done = () => { after && after(); };

  // ---- capa ----
  if (p.cover_path && !coverUrl) signedUrls([p.cover_path]).then((u) => { const el = m.el.querySelector('[data-plcov] .cov-img'); if (el && u[p.cover_path]) el.style.backgroundImage = `url('${u[p.cover_path]}')`; }).catch(() => {});

  // ---- enquadrar: arrastar a imagem e o recorte (zoom) ----
  const box = m.el.querySelector('[data-plcov]'); const layer = box.querySelector('.cov-img');
  let fr = normFrame(p.cover_frame);
  // as outras capas que estão à vista (o topo do projeto por trás da janela) acompanham
  const paint = () => {
    const css = frameCss(fr);
    [layer, ...document.querySelectorAll(`[data-covfor="${p.id}"] .cov-img`)].forEach((el) => { if (el) { el.style.backgroundPosition = `${fr.x}% ${fr.y}%`; el.style.transformOrigin = `${fr.x}% ${fr.y}%`; el.style.transform = `scale(${fr.z})`; } });
    const zv = m.el.querySelector('[data-plzv]'); if (zv) zv.textContent = `${Math.round(fr.z * 100)}%`;
    return css;
  };
  let saveT = null;
  const saveFrame = () => {
    clearTimeout(saveT);
    saveT = setTimeout(async () => {
      const v = normFrame(fr); const isDef = v.x === 50 && v.y === 50 && v.z === 1;
      const { error } = await sb.from('projects').update({ cover_frame: isDef ? null : v }).eq('id', p.id);
      if (error) return toast(error.message);
      p.cover_frame = isDef ? null : v; framed = true;
    }, 250);
  };
  let framed = false;
  if (layer) {
    // tamanho natural da imagem: para o arrasto andar à mesma velocidade que o rato
    let nat = null; { const im = new Image(); im.onload = () => { nat = { w: im.naturalWidth, h: im.naturalHeight }; }; const bg = layer.style.backgroundImage.match(/url\(['"]?(.*?)['"]?\)/); if (bg) im.src = bg[1]; }
    const spare = () => {
      const W = box.clientWidth, H = box.clientHeight; const a = nat ? nat.w / nat.h : W / H;
      const dw = Math.max(W, H * a) * fr.z, dh = Math.max(H, W / a) * fr.z; // tamanho mostrado (cobre a caixa) com o zoom
      return { x: Math.max(dw - W, W * 0.25), y: Math.max(dh - H, H * 0.25) };
    };
    box.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return; e.preventDefault(); box.setPointerCapture(e.pointerId); box.classList.add('dragging');
      const sx = e.clientX, sy = e.clientY, f0 = { ...fr }, sp = spare();
      const move = (ev) => { fr = normFrame({ ...fr, x: f0.x - ((ev.clientX - sx) / sp.x) * 100, y: f0.y - ((ev.clientY - sy) / sp.y) * 100 }); paint(); };
      const up = () => { box.removeEventListener('pointermove', move); box.removeEventListener('pointerup', up); box.removeEventListener('pointercancel', up); box.classList.remove('dragging'); saveFrame(); };
      box.addEventListener('pointermove', move); box.addEventListener('pointerup', up); box.addEventListener('pointercancel', up);
    });
    // setas do teclado também mexem (com a caixa focada)
    box.tabIndex = 0;
    box.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-2, 0], ArrowRight: [2, 0], ArrowUp: [0, -2], ArrowDown: [0, 2] }[e.key]; if (!d) return;
      e.preventDefault(); fr = normFrame({ ...fr, x: fr.x - d[0], y: fr.y - d[1] }); paint(); saveFrame();
    });
    const zr = m.el.querySelector('[data-plz]');
    zr?.addEventListener('input', () => { fr = normFrame({ ...fr, z: +zr.value }); paint(); });
    zr?.addEventListener('change', saveFrame);
    m.el.querySelector('[data-plcenter]')?.addEventListener('click', () => { fr = normFrame(null); if (zr) zr.value = '1'; paint(); saveFrame(); });
  }
  // ao fechar, a página por trás refaz-se com o enquadramento novo
  const mo = new MutationObserver(() => { if (!document.body.contains(box)) { mo.disconnect(); if (framed) { clearTimeout(saveT); done(); } } });
  mo.observe(document.getElementById('modal') || document.body, { childList: true, subtree: true });
  m.el.querySelector('[data-plpick]').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      if (!inp.files?.[0]) return;
      try {
        toast('A enviar a capa…');
        const up = await uploadImage(p.id, 'cover', inp.files[0]);
        const { error } = await sb.from('projects').update({ cover_path: up.path, cover_frame: null }).eq('id', p.id);
        if (error) throw error;
        p.cover_path = up.path; p.cover_frame = null;
        await signedUrls([up.path]).catch(() => ({}));
        toast('Capa mudada.'); done(); reopen();
      } catch (e) { toast(e.message || String(e)); }
    };
    inp.click();
  });
  m.el.querySelector('[data-plnocov]')?.addEventListener('click', async () => {
    const { error } = await sb.from('projects').update({ cover_path: null, cover_frame: null }).eq('id', p.id);
    if (error) return toast(error.message);
    p.cover_path = null; p.cover_frame = null; toast('Capa tirada.'); done(); reopen();
  });

  // ---- cor ----
  const save = async (c) => {
    const v = c && HEX.test(c) ? c.toLowerCase() : null;
    const { error } = await sb.from('projects').update({ accent: v }).eq('id', p.id);
    if (error) { if (live) setProjectAccent(p.accent); return toast(error.message); }
    p.accent = v; if (live) setProjectAccent(v);
    toast(v ? 'Cor do projeto mudada.' : 'O projeto volta à cor de cada pessoa.'); done(); reopen();
  };
  m.el.querySelectorAll('[data-plc]').forEach((b) => b.addEventListener('click', () => save(b.dataset.plc)));
  const ci = m.el.querySelector('[data-plcustom]');
  ci.addEventListener('input', () => { if (live) setProjectAccent(ci.value); ci.closest('.look-c')?.style.setProperty('--c', ci.value); });
  ci.addEventListener('change', () => save(ci.value));
  m.el.querySelector('[data-plnone]')?.addEventListener('click', () => save(null));
}
