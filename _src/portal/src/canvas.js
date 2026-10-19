import { sb, esc, toast, ICON, saveLater } from './lib.js';
import { mountGrid, COLS } from './grid.js';

// Páginas como boards (Studio). Cada página tem os seus elementos (a página em si, ou os blocos da visão geral)
// e pode receber elementos copiados de outras páginas. Uma cópia é o mesmo elemento visto noutro sítio:
// mudas num lado, muda no outro. Notas: blocos de texto livres, guardados no projeto (layouts.notes).
//
// Copiar: botão de copiar no canto de cada elemento (ou Ctrl+C com o rato por cima). Colar: Ctrl+V ou "Colar" na barra.
// Tudo o que se cola fica em layouts[key].extra = [{ id, ref, title }]; ref = { kind: 'page'|'block'|'tool'|'note', ... }.

const CLIP = 'portal-clip2';
export const newId = () => Math.random().toString(36).slice(2, 10);
export function copyRef(p, ref, title) {
  try { localStorage.setItem(CLIP, JSON.stringify({ project: p.id, ref, title, at: Date.now() })); } catch { /* nada */ }
  window.dispatchEvent(new CustomEvent('portal-clip'));
  toast(`"${title}" copiado. Vai à página onde o queres e cola com Ctrl+V (ou "Colar", na barra da direita).`, 5000);
}
export function readClip(p) { try { const c = JSON.parse(localStorage.getItem(CLIP) || 'null'); return c && c.project === p.id ? c : null; } catch { return null; } }

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

// mountCanvas(main, p, { key, label, native: [{ id, label, el, w?, x?, off?, ref? }], render: (el, ref) => Promise, here })
//   native: os elementos próprios da página; ref: o que se copia quando se copia esse elemento
//   render: desenha um elemento colado (página, bloco, ferramenta) dentro de el
//   here: a referência desta página (para não colar uma página dentro de si própria)
export function mountCanvas(main, p, { key, native, render, here, pageLabel = 'página' }) {
  main.innerHTML = `<div class="cv"><div class="cv-grid" data-cvgrid></div><aside class="cv-tools" data-cvtools aria-label="Elementos desta ${esc(pageLabel)}"></aside></div>`;
  const root = main.querySelector('[data-cvgrid]'), tools = main.querySelector('[data-cvtools]');
  const saved = p.layouts?.[key] || {};
  const extra = () => p.layouts?.[key]?.extra || [];
  const saveExtra = async (list) => {
    const layouts = { ...(p.layouts || {}), [key]: { ...(p.layouts?.[key] || {}), extra: list } }; p.layouts = layouts;
    const { error } = await sb.from('projects').update({ layouts }).eq('id', p.id); if (error) toast('Não foi possível guardar: ' + error.message);
  };
  const same = (a, b) => a && b && a.kind === b.kind && (a.page || null) === (b.page || null) && (a.sub || null) === (b.sub || null) && (a.id || null) === (b.id || null) && (a.block || null) === (b.block || null);
  const extraItem = (x) => {
    const el = document.createElement('div'); el.className = 'cv-x';
    if (x.ref.kind === 'note') el.append(noteEl(p, x.ref.id));
    else if (here && same(x.ref, here)) el.innerHTML = '<p class="muted small">Esta é a própria página.</p>';
    else { el.innerHTML = '<p class="muted small">A carregar…</p>'; Promise.resolve(render(el, x.ref)).catch((e) => { el.innerHTML = `<p class="muted small">Não foi possível mostrar: ${esc(e.message || '')}</p>`; }); }
    return { id: `x:${x.id}`, label: x.title || (x.ref.kind === 'note' ? 'Nota' : 'Elemento'), el, w: x.w || COLS, copy: () => copyRef(p, x.ref, x.title || 'Elemento'), ref: x.ref };
  };
  const nativeItems = native.map((n) => ({ ...n, copy: n.ref ? () => copyRef(p, n.ref, n.label) : null, removable: n.removable }));
  // escondidos por defeito: os sugeridos que ainda não estão guardados na página
  if (!saved.grid) { const off = native.filter((n) => n.off).map((n) => n.id); if (off.length) p.layouts = { ...(p.layouts || {}), [key]: { ...(p.layouts?.[key] || {}), hidden: [...new Set([...(saved.hidden || []), ...off])] } }; }
  const grid = mountGrid(root, {
    project: p, key, items: [...nativeItems, ...extra().map(extraItem)],
    onRemove: (it) => { if (!it.id.startsWith('x:')) return false; saveExtra(extra().filter((x) => `x:${x.id}` !== it.id)); toast('Tirado desta página. O original continua onde estava.'); return true; },
    onChange: () => drawTools(),
  });
  const addExtra = (ref, title, w) => { const x = { id: newId(), ref, title, w }; saveExtra([...extra(), x]); grid.add(extraItem(x)); };

  function drawTools() {
    const clip = readClip(p);
    const own = native.filter((n) => n.label);
    tools.innerHTML = `${own.length > 1 || own.some((n) => grid.isHidden(n.id)) ? `<p class="cvt-h">Desta ${esc(pageLabel)}</p>${own.map((n) => { const on = !grid.isHidden(n.id); return `<button type="button" class="${on ? 'on' : ''}" data-own="${esc(n.id)}" title="${on ? `${esc(n.label)}: está na página` : `Juntar ${esc(n.label)}`}">${n.icon || ICON.board}<span>${esc(n.label)}</span>${on ? '' : '<i>+</i>'}</button>`; }).join('')}<hr>` : ''}
      <p class="cvt-h">Juntar</p>
      <button type="button" data-note>${ICON.note}<span>Nota</span><i>+</i></button>
      <button type="button" class="paste ${clip ? '' : 'off'}" data-paste ${clip ? '' : 'disabled'} title="${clip ? `Colar ${esc(clip.title)}` : 'Copia um elemento noutra página (botão de copiar no canto dele) e cola-o aqui'}">${ICON.copy}<span>${clip ? `Colar «${esc(clip.title)}»` : 'Colar'}</span></button>
      <p class="cvt-tip muted">Passa o rato por um elemento: ⠿ para mover, canto de baixo para redimensionar, copiar para levar para outra página.</p>`;
    tools.querySelectorAll('[data-own]').forEach((b) => b.addEventListener('click', () => { const id = b.dataset.own; if (grid.isHidden(id)) grid.show(id); else root.querySelector(`[data-gi="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }));
    tools.querySelector('[data-note]').addEventListener('click', () => addExtra({ kind: 'note', id: newId() }, 'Nota', 6));
    tools.querySelector('[data-paste]').addEventListener('click', () => paste());
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
  const onPaste = (e) => { if (!document.body.contains(root)) return off(); if (typing(e) || document.querySelector('#modal.open')) return; if (paste()) e.preventDefault(); };
  const onCopy = (e) => { if (!document.body.contains(root)) return off(); if (!hover || typing(e)) return; const it = grid.items().find((x) => x.id === hover); if (it?.copy) { e.preventDefault(); it.copy(); } };
  const onClip = () => { if (!document.body.contains(root)) return off(); drawTools(); };
  const off = () => { document.removeEventListener('paste', onPaste); document.removeEventListener('copy', onCopy); window.removeEventListener('portal-clip', onClip); window.removeEventListener('storage', onClip); };
  document.addEventListener('paste', onPaste); document.addEventListener('copy', onCopy); window.addEventListener('portal-clip', onClip); window.addEventListener('storage', onClip);
  drawTools();
  return grid;
}
