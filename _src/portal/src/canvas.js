import { sb, esc, toast, ICON, saveLater, uploadImage, signedUrls, onLeave } from './lib.js';
import { mountGrid, COLS } from './grid.js';
import { cropSliders, cropAspect, cropImgStyle, naturalSize } from './imgcrop.js';
import { loadFonts, cleanHtml, fmtStyle, fmtBarHtml } from './textfmt.js';
export const CROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>';

// Páginas como boards (Studio). Cada página tem os seus elementos (a página em si, ou os blocos da visão geral)
// e pode receber elementos copiados de outras páginas. Uma cópia é o mesmo elemento visto noutro sítio:
// mudas num lado, muda no outro. Notas: blocos de texto livres, guardados no projeto (layouts.notes).
//
// Copiar: Ctrl+C com o rato por cima do elemento (ou botão direito → Copiar). Colar: Ctrl+V ou "Colar" na barra.
// Tudo o que se cola fica em layouts[key].extra = [{ id, ref, title }]; ref = { kind: 'page'|'block'|'tool'|'note', ... }.

const CLIP = 'portal-clip2';
const LAYERS = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 17.5l9 5 9-5" opacity=".5"/></svg>';
const PACK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="16" height="7" rx="1"/></svg>';
const UNDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';
const REDO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/></svg>';
export const newId = () => Math.random().toString(36).slice(2, 10);
export function copyRef(p, ref, title) {
  try { localStorage.setItem(CLIP, JSON.stringify({ project: p.id, ref, title, at: Date.now() })); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent('portal-clip'));
  toast(`"${title}" copiado. Vai à página onde o queres e cola com Ctrl+V (ou "Colar", na barra da direita).`, 5000);
}
export function readClip(p) { try { const c = JSON.parse(localStorage.getItem(CLIP) || 'null'); return c && c.project === p.id ? c : null; } catch { return null; } }

// Ações recomendadas de uma página (Moodboard, Mapa de luz, Fotos…): a página diz o que se pode juntar e a barra
// da direita mostra-as em cima. Se a página não estiver numa grelha (ex.: colada noutra), aparecem em box.
// acts: [{ label, icon, title?, run }]
export function offerActions(el, box, acts) {
  const ev = new CustomEvent('cv-actions', { bubbles: true, detail: { list: acts, handled: false } });
  el.dispatchEvent(ev);
  if (!box) return;
  if (ev.detail.handled || !acts.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="qi-add">${acts.map((a, i) => `<button type="button" class="qi-btn" data-cva="${i}" title="${esc(a.title || a.label)}">${a.icon || ICON.plus}<span>${esc(a.label)}</span></button>`).join('')}</div>`;
  box.querySelectorAll('[data-cva]').forEach((b) => b.addEventListener('click', () => acts[+b.dataset.cva].run()));
}

// nota partilhada (a mesma em todas as páginas onde estiver colada)
function noteEl(p, id) {
  const n = p.layouts?.notes?.[id] || { title: '', text: '' };
  const el = document.createElement('section'); el.className = 'panel cv-note';
  el.innerHTML = `<input class="cv-ntitle" value="${esc(n.title || '')}" placeholder="Nota" aria-label="Título da nota"><textarea placeholder="Escreve aqui: lembretes, links, decisões…" aria-label="Nota">${esc(n.text || '')}</textarea>`;
  const save = saveLater(async () => {
    const notes = { ...(p.layouts?.notes || {}), [id]: { title: el.querySelector('input').value, text: el.querySelector('textarea').value } };
    const layouts = { ...(p.layouts || {}), notes }; p.layouts = layouts;
    const { error } = await sb.from('projects').update({ layouts }).eq('id', p.id); if (error) toast('Não foi possível guardar a nota: ' + error.message);
  }, 700);
  el.querySelectorAll('input, textarea').forEach((x) => x.addEventListener('input', save));
  return el;
}

// elementos gerais de uma página: texto, imagem e tabela (guardados no projeto, em layouts.items[id])
const saveItem = (p, id, val) => {
  const items = { ...(p.layouts?.items || {}), [id]: val };
  const layouts = { ...(p.layouts || {}), items }; p.layouts = layouts;
  return sb.from('projects').update({ layouts }).eq('id', p.id).then(({ error }) => { if (error) toast('Não foi possível guardar: ' + error.message); });
};
// Texto da página: escreve-se direto (como as notas dos boards) e formata-se com a mesma barra: letra, tamanho,
// negrito, itálico, sublinhado, riscado, cor, alinhamento e listas. A barra aparece por cima enquanto se escreve.
// Guardado em layouts.items[id] = { html, text, fmt } (fmt = formatação do bloco inteiro; o resto fica no html).
function textEl(p, id) {
  const v = p.layouts?.items?.[id] || { text: '' };
  loadFonts();
  const el = document.createElement('div'); el.className = 'cv-text';
  el.innerHTML = `<div class="cv-rt" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Texto" data-ph="Escreve aqui…" spellcheck="true">${v.html ? cleanHtml(v.html) : esc(v.text || '').replace(/\n/g, '<br>')}</div>`;
  const ed = el.querySelector('.cv-rt');
  const style = () => ed.setAttribute('style', fmtStyle('text', v.fmt || {}));
  style();
  const save = saveLater(() => { v.html = cleanHtml(ed.innerHTML); v.text = ed.innerText; saveItem(p, id, { html: v.html, text: v.text, ...(v.fmt ? { fmt: v.fmt } : {}) }); }, 700);
  ed.addEventListener('input', save);
  // colar: só o texto (a formatação de fora vinha com letras e cores estranhas)
  ed.addEventListener('paste', (e) => { const t = e.clipboardData?.getData('text/plain'); if (t == null) return; e.preventDefault(); document.execCommand('insertText', false, t); });
  ed.addEventListener('focus', () => fmtBar.show(ed, { get: () => v.fmt || {}, set: (patch) => { const f = { ...(v.fmt || {}), ...patch }; Object.keys(f).forEach((k) => { if (f[k] === '' || f[k] == null || f[k] === false) delete f[k]; }); v.fmt = Object.keys(f).length ? f : undefined; style(); save(); }, changed: save, clear: () => { ed.innerText = ed.innerText; v.fmt = undefined; style(); save(); } }));
  ed.addEventListener('blur', () => fmtBar.hideSoon(ed));
  return el;
}
// uma barra só, para todos os textos da página (fica por cima do texto que se está a escrever)
const fmtBar = (() => {
  let bar = null, cur = null, api = null, hideT = 0, savedRange = null;
  const selIn = () => { const s2 = getSelection(); return cur && s2.rangeCount && !s2.isCollapsed && cur.contains(s2.anchorNode); };
  const place = () => { if (!bar || !cur) return; const r = cur.getBoundingClientRect(); const h = bar.offsetHeight || 44; bar.style.left = `${Math.max(8, Math.min(window.innerWidth - bar.offsetWidth - 8, r.left))}px`; bar.style.top = `${r.top - h - 10 < 64 ? r.bottom + 8 : r.top - h - 10}px`; };
  const closePops = (ex) => bar.querySelectorAll('[data-popbox]').forEach((x) => { if (x.dataset.popbox !== ex) { x.hidden = true; bar.querySelector(`[data-pop="${x.dataset.popbox}"]`)?.setAttribute('aria-expanded', 'false'); } });
  const update = () => {
    if (!bar || !api) return; const f = api.get();
    bar.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('on', (f.font || '') === b.dataset.font));
    bar.querySelectorAll('[data-size]').forEach((b) => b.classList.toggle('on', (f.size || 'm') === b.dataset.size));
    bar.querySelectorAll('[data-align]').forEach((b) => b.classList.toggle('on', (f.align || 'left') === b.dataset.align));
    bar.querySelectorAll('[data-cmd]').forEach((b) => { const k = { bold: 'b', italic: 'i', underline: 'u', strikeThrough: 's' }[b.dataset.cmd]; let on = !!f[k]; try { if (document.activeElement === cur) on = on || document.queryCommandState(b.dataset.cmd); } catch { /* nada */ } b.classList.toggle('on', on); });
    bar.querySelectorAll('[data-list]').forEach((b) => { let on = false; try { on = document.activeElement === cur && document.queryCommandState(b.dataset.list); } catch { /* nada */ } b.classList.toggle('on', on); });
    bar.querySelector('[data-colbar]').style.background = f.color || 'currentColor';
  };
  const build = () => {
    bar = document.createElement('div'); bar.className = 'fmt-bar cv-fmt'; bar.hidden = true; bar.setAttribute('role', 'toolbar'); bar.setAttribute('aria-label', 'Formatar texto');
    bar.innerHTML = fmtBarHtml(); document.body.append(bar);
    // carregar na barra não tira o cursor do texto
    bar.addEventListener('pointerdown', (e) => { if (!e.target.closest('input')) e.preventDefault(); clearTimeout(hideT); });
    bar.querySelectorAll('[data-pop]').forEach((b) => b.addEventListener('click', () => { const box = bar.querySelector(`[data-popbox="${b.dataset.pop}"]`); closePops(b.dataset.pop); box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); }));
    bar.querySelectorAll('[data-cmd]').forEach((b) => b.addEventListener('click', () => {
      if (selIn()) { document.execCommand('styleWithCSS', false, false); document.execCommand(b.dataset.cmd); api.changed(); }
      else { const k = { bold: 'b', italic: 'i', underline: 'u', strikeThrough: 's' }[b.dataset.cmd]; api.set({ [k]: !api.get()[k] }); }
      update();
    }));
    bar.querySelectorAll('[data-list]').forEach((b) => b.addEventListener('click', () => { cur?.focus(); document.execCommand(b.dataset.list); api.changed(); update(); }));
    const colBtn = bar.querySelector('[data-colbtn]');
    colBtn.addEventListener('pointerdown', () => { savedRange = selIn() ? getSelection().getRangeAt(0).cloneRange() : null; });
    const applyColor = (c) => {
      if (savedRange) { const s2 = getSelection(); s2.removeAllRanges(); s2.addRange(savedRange); document.execCommand('styleWithCSS', false, true); document.execCommand('foreColor', false, c || 'inherit'); document.execCommand('styleWithCSS', false, false); api.changed(); }
      else api.set({ color: c });
      closePops(); update();
    };
    bar.querySelectorAll('[data-tc]').forEach((b) => b.addEventListener('click', () => applyColor(b.dataset.tc)));
    bar.querySelector('[data-tcc]').addEventListener('change', (e) => applyColor(e.target.value));
    bar.querySelectorAll('[data-align]').forEach((b) => b.addEventListener('click', () => { api.set({ align: b.dataset.align === 'left' ? '' : b.dataset.align }); update(); }));
    bar.querySelectorAll('[data-font]').forEach((b) => b.addEventListener('click', () => { api.set({ font: b.dataset.font }); closePops(); update(); }));
    bar.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { api.set({ size: b.dataset.size === 'm' ? '' : b.dataset.size }); closePops(); update(); }));
    bar.querySelector('[data-clear]').addEventListener('click', () => { api.clear(); update(); });
    document.addEventListener('selectionchange', () => { if (cur && !bar.hidden) update(); });
    window.addEventListener('scroll', place, true); window.addEventListener('resize', place);
  };
  return {
    show(el, a) { if (!bar) build(); clearTimeout(hideT); cur = el; api = a; bar.hidden = false; closePops(); update(); place(); },
    hideSoon(el) { clearTimeout(hideT); hideT = setTimeout(() => { if (cur === el && document.activeElement !== el && !bar?.contains(document.activeElement)) { if (bar) bar.hidden = true; cur = null; api = null; } }, 150); },
    hide() { if (bar) bar.hidden = true; cur = null; api = null; },
  };
})();
// imagem: mantém sempre a proporção ao redimensionar; recorta-se com as pegas dos lados da própria imagem;
// legenda só se a juntarem. Mudar a imagem: largar outra por cima, ou botão direito → Mudar imagem.
const gridBox = (el, phase, d = {}) => { const detail = { phase, dl: 0, dt: 0, dw: 0, ...d }; el.dispatchEvent(new CustomEvent('gi-box', { bubbles: true, detail })); return detail.room || null; };
const dropped = new Map(); // ficheiros largados na página, à espera do elemento de imagem que os vai mostrar
function imageEl(p, id) {
  const v = p.layouts?.items?.[id] || {};
  const el = document.createElement('figure'); el.className = 'cv-img';
  let url = null;
  const draw = async () => {
    url = v.path ? (await signedUrls([v.path]))[v.path] : null;
    if (!url) {
      el.innerHTML = `<button type="button" class="cv-img-empty" data-pick>${ICON.image}<span>Escolher imagem</span><small>ou larga-a aqui</small></button>`;
      el.querySelector('[data-pick]').addEventListener('click', pick); return;
    }
    if (!v.w) { const n = await naturalSize(url); if (n) { v.w = n.w; v.h = n.h; saveItem(p, id, v); } }
    const ar = cropAspect(v.crop, v.w, v.h) || 1.5;
    const hasCap = typeof v.caption === 'string';
    el.innerHTML = `<div class="cv-img-f" data-gdrag style="aspect-ratio:${ar.toFixed(5)}"><img src="${esc(url)}" alt="${esc(v.caption || '')}" draggable="false" style="${cropImgStyle(v.crop)}"></div>
      ${hasCap ? `<figcaption><input value="${esc(v.caption)}" placeholder="Legenda" aria-label="Legenda"></figcaption>` : '<button type="button" class="cv-img-cap" data-cap title="Juntar uma legenda">+ Legenda</button>'}`;
    const frame = el.querySelector('.cv-img-f'); const img = frame.querySelector('img');
    if (v.w && v.h) {
      cropSliders(frame, {
        nat: () => ({ w: v.w, h: v.h }),
        get: () => v.crop,
        apply: (c) => { frame.style.aspectRatio = String(cropAspect(c, v.w, v.h)); img.style.cssText = cropImgStyle(c); },
        box: { start: () => gridBox(el, 'start'), move: (dl, dt, dw) => gridBox(el, 'move', { dl, dt, dw }), end: (dl, dt, dw) => gridBox(el, 'end', { dl, dt, dw }), cancel: () => gridBox(el, 'cancel') },
        commit: (c) => { if (c) v.crop = c; else delete v.crop; saveItem(p, id, v); },
      });
    }
    el.querySelector('[data-cap]')?.addEventListener('click', addCaption);
    const cap = el.querySelector('figcaption input');
    if (cap) {
      const keep = saveLater(() => { v.caption = cap.value; saveItem(p, id, v); }, 600);
      cap.addEventListener('input', keep);
      // legenda vazia ao sair: desaparece
      cap.addEventListener('blur', () => { if (!cap.value.trim()) { delete v.caption; saveItem(p, id, v); draw(); } });
    }
  };
  const addCaption = () => { if (typeof v.caption === 'string') return el.querySelector('figcaption input')?.focus(); v.caption = ''; draw().then(() => el.querySelector('figcaption input')?.focus()); };
  const up = async (file) => {
    if (!file || !/^image\//.test(file.type)) return toast('Escolhe uma imagem.');
    toast('A carregar a imagem…', 6000);
    try { const r = await uploadImage(p.id, 'paginas', file); v.path = r.path; v.w = r.w; v.h = r.h; delete v.crop; await saveItem(p, id, v); draw(); } catch (e) { toast('Não foi possível carregar: ' + (e.message || e)); }
  };
  const pick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => up(i.files[0]); i.click(); };
  // opções do botão direito (a grelha junta-as ao menu do elemento)
  el._menu = () => (url ? [
    { label: 'Mudar imagem…', icon: ICON.image, run: pick },
    typeof v.caption === 'string' ? null : { label: 'Juntar legenda', icon: ICON.title || '', run: addCaption },
    v.crop ? { label: 'Mostrar a imagem inteira', icon: CROP, run: () => { delete v.crop; saveItem(p, id, v); draw(); } } : null,
  ] : []);
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); up(e.dataTransfer.files[0]); });
  if (dropped.has(id)) { const f = dropped.get(id); dropped.delete(id); el.innerHTML = '<div class="cv-img-empty"><span>A carregar a imagem…</span></div>'; up(f); } else draw();
  return el;
}
function tableEl(p, id) {
  const v = p.layouts?.items?.[id] || {}; if (!v.rows?.length) v.rows = [['Coluna 1', 'Coluna 2', 'Coluna 3'], ['', '', ''], ['', '', '']];
  const el = document.createElement('div'); el.className = 'cv-table';
  const save = saveLater(() => saveItem(p, id, v), 600);
  const draw = () => {
    const nc = Math.max(...v.rows.map((r) => r.length));
    el.innerHTML = `<div class="cvt-w"><table><tbody>${v.rows.map((r, ri) => `<tr>${Array.from({ length: nc }, (_, ci) => `<${ri ? 'td' : 'th'}><input value="${esc(r[ci] || '')}" data-r="${ri}" data-c="${ci}" aria-label="Linha ${ri + 1}, coluna ${ci + 1}"></${ri ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</tbody></table></div>
      <div class="cvt-ui"><button type="button" data-t="addrow">${ICON.plus} Linha</button><button type="button" data-t="addcol">${ICON.plus} Coluna</button>${v.rows.length > 1 ? '<button type="button" data-t="rmrow">− Linha</button>' : ''}${nc > 1 ? '<button type="button" data-t="rmcol">− Coluna</button>' : ''}</div>`;
    el.querySelectorAll('input').forEach((i) => {
      i.addEventListener('input', () => { const r = +i.dataset.r, c = +i.dataset.c; while (v.rows[r].length <= c) v.rows[r].push(''); v.rows[r][c] = i.value; save(); });
      i.addEventListener('keydown', (e) => { if (e.key !== 'Enter') return; e.preventDefault(); const nx = el.querySelector(`input[data-r="${+i.dataset.r + 1}"][data-c="${i.dataset.c}"]`); if (nx) nx.focus(); else { v.rows.push(Array(nc).fill('')); save(); draw(); el.querySelector(`input[data-r="${+i.dataset.r + 1}"][data-c="${i.dataset.c}"]`)?.focus(); } });
    });
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => {
      const t = b.dataset.t; const n = Math.max(...v.rows.map((r) => r.length));
      if (t === 'addrow') v.rows.push(Array(n).fill(''));
      else if (t === 'addcol') v.rows.forEach((r) => { while (r.length < n) r.push(''); r.push(''); });
      else if (t === 'rmrow' && v.rows.length > 1) v.rows.pop();
      else if (t === 'rmcol' && n > 1) v.rows.forEach((r) => { r.length = Math.min(r.length, n - 1); });
      save(); draw();
    }));
  };
  draw();
  return el;
}
const GENERAL = { text: ['Texto', textEl], image: ['Imagem', imageEl], table: ['Tabela', tableEl] };

// mountCanvas(main, p, { key, label, native: [{ id, label, el, w?, x?, off?, ref? }], render: (el, ref) => Promise, here })
//   native: os elementos próprios da página; ref: o que se copia quando se copia esse elemento
//   render: desenha um elemento colado (página, bloco, ferramenta) dentro de el
//   here: a referência desta página (para não colar uma página dentro de si própria)
export function mountCanvas(main, p, { key, native, render, here, pageLabel = 'página' }) {
  main.innerHTML = `<div class="cv"><div class="cv-grid" data-cvgrid></div><aside class="cv-tools" data-cvtools aria-label="Elementos desta ${esc(pageLabel)}"></aside></div>`;
  const root = main.querySelector('[data-cvgrid]'), tools = main.querySelector('[data-cvtools]');
  const saved = p.layouts?.[key] || {};
  let acts = [];
  const extra = () => p.layouts?.[key]?.extra || [];
  const saveExtra = async (list) => {
    const layouts = { ...(p.layouts || {}), [key]: { ...(p.layouts?.[key] || {}), extra: list } }; p.layouts = layouts;
    const { error } = await sb.from('projects').update({ layouts }).eq('id', p.id); if (error) toast('Não foi possível guardar: ' + error.message);
  };
  const same = (a, b) => a && b && a.kind === b.kind && (a.page || null) === (b.page || null) && (a.sub || null) === (b.sub || null) && (a.id || null) === (b.id || null) && (a.block || null) === (b.block || null);
  const extraItem = (x) => {
    const el = document.createElement('div'); el.className = 'cv-x';
    if (x.ref.kind === 'note') el.append(noteEl(p, x.ref.id));
    else if (GENERAL[x.ref.kind]) el.append(GENERAL[x.ref.kind][1](p, x.ref.id));
    else if (here && same(x.ref, here)) el.innerHTML = '<p class="muted small">Esta é a própria página.</p>';
    else { el.innerHTML = '<p class="muted small">A carregar…</p>'; Promise.resolve(render(el, x.ref)).catch((e) => { el.innerHTML = `<p class="muted small">Não foi possível mostrar: ${esc(e.message || '')}</p>`; }); }
    return { id: `x:${x.id}`, label: x.title || (x.ref.kind === 'note' ? 'Nota' : GENERAL[x.ref.kind]?.[0] || 'Elemento'), el, w: x.w || COLS, copy: () => copyRef(p, x.ref, x.title || 'Elemento'), ref: x.ref, lockRatio: x.ref.kind === 'image', menu: () => el.firstElementChild?._menu?.() || [] };
  };
  const nativeItems = native.map((n) => ({ ...n, copy: n.ref ? () => copyRef(p, n.ref, n.label) : null, removable: n.removable }));
  // escondidos por defeito: os sugeridos que ainda não estão guardados na página
  if (!saved.grid) { const off = native.filter((n) => n.off).map((n) => n.id); if (off.length) p.layouts = { ...(p.layouts || {}), [key]: { ...(p.layouts?.[key] || {}), hidden: [...new Set([...(saved.hidden || []), ...off])] } }; }
  const grid = mountGrid(root, {
    project: p, key, items: [...nativeItems, ...extra().map(extraItem)],
    onRemove: (it) => { if (!it.id.startsWith('x:')) return false; saveExtra(extra().filter((x) => `x:${x.id}` !== it.id)); toast(it.ref?.kind === 'note' || GENERAL[it.ref?.kind] ? `${GENERAL[it.ref?.kind]?.[0] || 'Nota'} apagada desta página.` : 'Tirado desta página. O original continua onde estava.'); return true; },
    onChange: () => drawTools(),
  });
  // ações que a página em si (o elemento próprio) oferece
  root.addEventListener('cv-actions', (e) => {
    const gi = e.target.closest?.('[data-gi]'); if (!gi) return;
    e.detail.handled = true;
    if (gi.dataset.gi.startsWith('x:')) return; // páginas coladas: as ações ficam na página original
    acts = e.detail.list || []; drawTools();
  });
  const addExtra = (ref, title, w, at = null, opts) => { const x = { id: newId(), ref, title, w }; saveExtra([...extra(), x]); grid.add({ ...extraItem(x), ...(at || {}) }, opts); };

  // largar imagens (do computador) em qualquer sítio da página: cada uma vira um elemento onde foi largada
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  let dragDepth = 0;
  const cvEl = main.querySelector('.cv');
  cvEl.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; dragDepth++; root.classList.add('cg-drop'); });
  cvEl.addEventListener('dragleave', (e) => { if (!hasFiles(e)) return; dragDepth = Math.max(0, dragDepth - 1); if (!dragDepth) root.classList.remove('cg-drop'); });
  cvEl.addEventListener('dragover', (e) => { if (!hasFiles(e) || e.defaultPrevented) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  cvEl.addEventListener('drop', (e) => {
    dragDepth = 0; root.classList.remove('cg-drop');
    if (!hasFiles(e) || e.defaultPrevented) return; // largado em cima de uma imagem ou de um board: esse trata
    e.preventDefault();
    const files = [...e.dataTransfer.files].filter((f) => /^image\//.test(f.type));
    if (!files.length) return toast('Só dá para largar imagens aqui.');
    files.forEach((f, i) => {
      const id = newId(); dropped.set(id, f);
      const at = grid.cellAt(e.clientX + i * 24, e.clientY + i * 24, 4);
      addExtra({ kind: 'image', id }, 'Imagem', 4, at, { scroll: false });
    });
  });

  // camadas: lista do que está por cima para o que está por baixo; passar o rato realça o elemento na página
  let lp = null;
  function layersPanel(btn) {
    if (lp) { lp.close(); return; }
    const pop = document.createElement('div'); pop.className = 'pm-tpop cv-layers'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Camadas');
    document.body.append(pop);
    const draw = () => {
      const ls = grid.layers();
      pop.innerHTML = `<div class="row between"><strong>Camadas</strong><button type="button" class="icon-btn sm" data-x aria-label="Fechar">${ICON.close}</button></div>
        <p class="muted small">Em cima na lista = por cima na página.</p>
        <ol class="cvl-list">${ls.map((l, i) => `<li data-l="${esc(l.id)}"><span class="cvl-n">${esc(l.label)}</span>
          <button type="button" class="icon-btn sm" data-ld="up" ${i === 0 ? 'disabled' : ''} title="Subir uma camada" aria-label="Subir ${esc(l.label)}">↑</button>
          <button type="button" class="icon-btn sm" data-ld="down" ${i === ls.length - 1 ? 'disabled' : ''} title="Descer uma camada" aria-label="Descer ${esc(l.label)}">↓</button></li>`).join('')}</ol>`;
      pop.querySelector('[data-x]').addEventListener('click', close);
      pop.querySelectorAll('[data-l]').forEach((li) => {
        li.addEventListener('mouseenter', () => grid.highlight(li.dataset.l));
        li.addEventListener('mouseleave', () => grid.highlight(null));
        li.querySelector('.cvl-n').addEventListener('click', () => grid.items().find((x) => x.id === li.dataset.l)?.g.scrollIntoView({ behavior: 'smooth', block: 'center' }));
        li.querySelectorAll('[data-ld]').forEach((b) => b.addEventListener('click', () => { grid.restack(li.dataset.l, b.dataset.ld); draw(); grid.highlight(li.dataset.l); }));
      });
    };
    const r = btn.getBoundingClientRect();
    const out = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    function close() { pop.remove(); grid.highlight(null); lp = null; document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true); }
    draw();
    pop.style.top = `${Math.max(12, Math.min(window.innerHeight - pop.offsetHeight - 12, r.top))}px`; pop.style.left = `${Math.max(12, r.left - pop.offsetWidth - 10)}px`;
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', key, true); });
    lp = { close };
  }
  onLeave(() => lp?.close());
  onLeave(() => fmtBar.hide());

  // "Board": cria um board novo dentro desta página, ou mostra aqui um que já existe (é o mesmo board: o que se
  // mudar aqui muda lá). Os boards novos ficam só nesta página (não aparecem na lista de ferramentas).
  let bpk = null;
  function boardPicker(btn) {
    if (bpk) { bpk.close(); return; }
    const pop = document.createElement('div'); pop.className = 'pm-tpop cv-layers cv-bpick'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Juntar um board');
    document.body.append(pop);
    const onPage = new Set(extra().filter((x) => x.ref.kind === 'tool').map((x) => x.ref.id));
    const list = (p._boards || []).filter((b) => ((b.kind || 'board') === 'board' || b.kind === 'wrd')).sort((a, b) => (a.title || '').localeCompare(b.title || '', 'pt'));
    const norm = (x) => (x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    pop.innerHTML = `<div class="row between"><strong>Juntar um board</strong><button type="button" class="icon-btn sm" data-x aria-label="Fechar">${ICON.close}</button></div>
      <button type="button" class="btn primary sm cv-bnew" data-bnew>${ICON.plus} Novo board</button>
      ${list.length ? `<p class="muted small">Ou um que já existe (é o mesmo: o que mudares aqui muda lá):</p>${list.length > 7 ? '<input class="cv-bq" type="search" placeholder="Procurar board" aria-label="Procurar board" data-bq>' : ''}
      <ol class="cvl-list" data-bl></ol>` : ''}`;
    const drawList = (q = '') => {
      const ul = pop.querySelector('[data-bl]'); if (!ul) return;
      const rows = list.filter((b) => !q || norm(b.title).includes(norm(q)));
      ul.innerHTML = rows.map((b) => `<li><button type="button" class="cvl-n cv-bpk" data-bid="${esc(b.id)}" ${onPage.has(b.id) ? 'disabled title="Já está nesta página"' : ''}>${ICON.board}<span>${esc(b.title || 'Board')}</span>${onPage.has(b.id) ? '<small class="muted">já está aqui</small>' : ''}</button></li>`).join('') || '<li class="muted small">Nenhum board com esse nome.</li>';
      ul.querySelectorAll('[data-bid]').forEach((x) => x.addEventListener('click', () => { const b = list.find((y) => y.id === x.dataset.bid); close(); addExtra({ kind: 'tool', id: b.id }, b.title || 'Board', COLS); }));
    };
    drawList();
    pop.querySelector('[data-bq]')?.addEventListener('input', (e) => drawList(e.target.value));
    pop.querySelector('[data-x]').addEventListener('click', close);
    pop.querySelector('[data-bnew]').addEventListener('click', async (e) => {
      e.currentTarget.disabled = true;
      const { data: b, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'wrd', title: 'Board', data: { page: key } }).select('id, title, kind, parent_id, group_id, project_id').single();
      if (error) { e.currentTarget.disabled = false; return toast('Não foi possível criar o board: ' + error.message); }
      (p._boards ||= []).push(b);
      close(); addExtra({ kind: 'tool', id: b.id }, 'Board', COLS);
      toast('Board criado. Duplo clique no nome para o mudar; clica dentro para começar a juntar coisas.', 5000);
    });
    const r = btn.getBoundingClientRect();
    const out = (ev) => { if (!pop.contains(ev.target) && !btn.contains(ev.target)) close(); };
    const keyH = (ev) => { if (ev.key === 'Escape') close(); };
    function close() { pop.remove(); bpk = null; document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', keyH, true); }
    pop.style.top = `${Math.max(12, Math.min(window.innerHeight - pop.offsetHeight - 12, r.top))}px`; pop.style.left = `${Math.max(12, r.left - pop.offsetWidth - 10)}px`;
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', keyH, true); });
    pop.querySelector('[data-bq]')?.focus();
    bpk = { close };
  }
  onLeave(() => bpk?.close());
  function drawTools() {
    const clip = readClip(p);
    const own = native.filter((n) => n.label);
    // barra limpa, como a do board: ícone grande e o nome por baixo. Os elementos próprios só aparecem se foram tirados (para os voltar a pôr).
    const gone = own.filter((n) => grid.isHidden(n.id));
    tools.innerHTML = `${acts.map((a, i) => `<button type="button" data-cva="${i}" title="${esc(a.title || a.label)}">${a.icon || ICON.plus}<span>${esc(a.label)}</span></button>`).join('')}${acts.length ? '<hr>' : ''}
      <button type="button" data-gen="text" title="Juntar texto a esta ${esc(pageLabel)}">${ICON.title || ICON.note}<span>Texto</span></button>
      <button type="button" data-note title="Juntar uma nota a esta ${esc(pageLabel)}">${ICON.note}<span>Nota</span></button>
      <button type="button" data-gen="image" title="Juntar uma imagem a esta ${esc(pageLabel)}">${ICON.image}<span>Imagem</span></button>
      <button type="button" data-gen="table" title="Juntar uma tabela a esta ${esc(pageLabel)}">${ICON.table || ICON.list}<span>Tabela</span></button>
      <button type="button" data-addboard title="Juntar um board a esta ${esc(pageLabel)}: um novo ou um que já exista" aria-haspopup="dialog">${ICON.board}<span>Board</span></button>
      <button type="button" data-layers title="Camadas: escolhe o que fica por cima quando os elementos se sobrepõem" aria-haspopup="dialog">${LAYERS}<span>Camadas</span></button>
      <button type="button" data-pack title="Arrumar: encosta todos os elementos para cima, sem sobreposições">${PACK}<span>Arrumar</span></button>
      <button type="button" class="${clip ? '' : 'off'}" data-paste ${clip ? '' : 'disabled'} title="${clip ? `Colar «${esc(clip.title)}» aqui (Ctrl+V)` : 'Para colar: noutra página, passa o rato por cima de um elemento e carrega Ctrl+C (ou botão direito → Copiar)'}">${ICON.copy}<span>Colar</span></button>
      ${gone.length ? `<hr>${gone.map((n) => `<button type="button" data-own="${esc(n.id)}" title="Voltar a pôr ${esc(n.label)} na página">${n.icon || ICON.board}<span>${esc(n.label)}</span></button>`).join('')}` : ''}
      <hr><div class="cv-ur"><button type="button" data-undo title="Desfazer (Ctrl+Z)" aria-label="Desfazer">${UNDO}</button><button type="button" data-redo title="Refazer (Ctrl+Shift+Z)" aria-label="Refazer">${REDO}</button></div>`;
    // desfazer/refazer: o mesmo que Ctrl+Z. Primeiro tenta o da tabela ou do board desta página, senão o geral.
    const key = (redo) => document.dispatchEvent(new KeyboardEvent('keydown', { key: redo ? 'z' : 'z', shiftKey: redo, ctrlKey: true, bubbles: true, cancelable: true }));
    tools.querySelector('[data-undo]').addEventListener('click', () => key(false));
    tools.querySelector('[data-redo]').addEventListener('click', () => key(true));
    tools.querySelectorAll('[data-cva]').forEach((b) => b.addEventListener('click', () => acts[+b.dataset.cva]?.run()));
    tools.querySelectorAll('[data-own]').forEach((b) => b.addEventListener('click', () => grid.show(b.dataset.own)));
    tools.querySelector('[data-note]').addEventListener('click', () => addExtra({ kind: 'note', id: newId() }, 'Nota', 6));
    tools.querySelectorAll('[data-gen]').forEach((b) => b.addEventListener('click', () => { const k = b.dataset.gen; addExtra({ kind: k, id: newId() }, GENERAL[k][0], k === 'text' ? 12 : 6); }));
    tools.querySelector('[data-paste]').addEventListener('click', () => paste());
    tools.querySelector('[data-pack]').addEventListener('click', () => grid.pack());
    tools.querySelector('[data-layers]').addEventListener('click', (e) => layersPanel(e.currentTarget));
    tools.querySelector('[data-addboard]').addEventListener('click', (e) => boardPicker(e.currentTarget));
  }
  const paste = () => {
    const c = readClip(p); if (!c) return false;
    if (here && same(c.ref, here)) { toast('Não dá para colar uma página dentro dela própria.'); return true; }
    addExtra(c.ref, c.title); toast(`"${c.title}" colado aqui. É o mesmo: o que mudares num lado muda no outro.`, 4500); return true;
  };
  // Ctrl+V cola (fora de campos de texto); Ctrl+C com o rato por cima de um elemento copia-o
  let hover = null;
  root.addEventListener('pointerover', (e) => { hover = e.target.closest?.('[data-gi]')?.dataset.gi || null; });
  root.addEventListener('pointerleave', () => { hover = null; });
  const typing = (e) => e.target.closest?.('input, textarea, select, [contenteditable="true"]') || (window.getSelection && String(window.getSelection()).length);
  const onPaste = (e) => { if (!document.body.contains(root)) return off(); if (typing(e) || document.querySelector('#modal.open, .pp-over, .bp-active')) return; if (paste()) e.preventDefault(); };
  const onCopy = (e) => { if (!document.body.contains(root)) return off(); if (!hover || typing(e) || document.querySelector('.bp-active')) return; const it = grid.items().find((x) => x.id === hover); if (it?.copy) { e.preventDefault(); it.copy(); } };
  const onClip = () => { if (!document.body.contains(root)) return off(); drawTools(); };
  const off = () => { document.removeEventListener('paste', onPaste); document.removeEventListener('copy', onCopy); window.removeEventListener('portal-clip', onClip); window.removeEventListener('storage', onClip); };
  document.addEventListener('paste', onPaste); document.addEventListener('copy', onCopy); window.addEventListener('portal-clip', onClip); window.addEventListener('storage', onClip); onLeave(off);
  drawTools();
  return grid;
}
