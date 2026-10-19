import { sb, esc, toast, ICON, saveLater } from './lib.js';
import { mountGrid, COLS } from './grid.js';

// Páginas como boards (Studio). Cada página tem os seus elementos (a página em si, ou os blocos da visão geral)
// e pode receber elementos copiados de outras páginas. Uma cópia é o mesmo elemento visto noutro sítio:
// mudas num lado, muda no outro. Notas: blocos de texto livres, guardados no projeto (layouts.notes).
//
// Copiar: botão de copiar no canto de cada elemento (ou Ctrl+C com o rato por cima). Colar: Ctrl+V ou "Colar" na barra.
// Tudo o que se cola fica em layouts[key].extra = [{ id, ref, title }]; ref = { kind: 'page'|'block'|'tool'|'note', ... }.

const CLIP = 'portal-clip2';
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
    else if (here && same(x.ref, here)) el.innerHTML = '<p class="muted small">Esta é a própria página.</p>';
    else { el.innerHTML = '<p class="muted small">A carregar…</p>'; Promise.resolve(render(el, x.ref)).catch((e) => { el.innerHTML = `<p class="muted small">Não foi possível mostrar: ${esc(e.message || '')}</p>`; }); }
    return { id: `x:${x.id}`, label: x.title || (x.ref.kind === 'note' ? 'Nota' : 'Elemento'), el, w: x.w || COLS, copy: () => copyRef(p, x.ref, x.title || 'Elemento'), ref: x.ref };
  };
  const nativeItems = native.map((n) => ({ ...n, copy: n.ref ? () => copyRef(p, n.ref, n.label) : null, removable: n.removable }));
  // escondidos por defeito: os sugeridos que ainda não estão guardados na página
  if (!saved.grid) { const off = native.filter((n) => n.off).map((n) => n.id); if (off.length) p.layouts = { ...(p.layouts || {}), [key]: { ...(p.layouts?.[key] || {}), hidden: [...new Set([...(saved.hidden || []), ...off])] } }; }
  const grid = mountGrid(root, {
    project: p, key, items: [...nativeItems, ...extra().map(extraItem)],
    onRemove: (it) => { if (!it.id.startsWith('x:')) return false; saveExtra(extra().filter((x) => `x:${x.id}` !== it.id)); toast(it.ref?.kind === 'note' ? 'Nota apagada desta página.' : 'Tirado desta página. O original continua onde estava.'); return true; },
    onChange: () => drawTools(),
  });
  // ações que a página em si (o elemento próprio) oferece
  root.addEventListener('cv-actions', (e) => {
    const gi = e.target.closest?.('[data-gi]'); if (!gi) return;
    e.detail.handled = true;
    if (gi.dataset.gi.startsWith('x:')) return; // páginas coladas: as ações ficam na página original
    acts = e.detail.list || []; drawTools();
  });
  const addExtra = (ref, title, w) => { const x = { id: newId(), ref, title, w }; saveExtra([...extra(), x]); grid.add(extraItem(x)); };

  function drawTools() {
    const clip = readClip(p);
    const own = native.filter((n) => n.label);
    // barra limpa, como a do board: ícone grande e o nome por baixo. Os elementos próprios só aparecem se foram tirados (para os voltar a pôr).
    const gone = own.filter((n) => grid.isHidden(n.id));
    tools.innerHTML = `${acts.map((a, i) => `<button type="button" data-cva="${i}" title="${esc(a.title || a.label)}">${a.icon || ICON.plus}<span>${esc(a.label)}</span></button>`).join('')}${acts.length ? '<hr>' : ''}<button type="button" data-note title="Juntar uma nota a esta ${esc(pageLabel)}">${ICON.note}<span>Nota</span></button>
      <button type="button" class="${clip ? '' : 'off'}" data-paste ${clip ? '' : 'disabled'} title="${clip ? `Colar «${esc(clip.title)}» aqui (Ctrl+V)` : 'Para colar: copia um elemento noutra página (botão de copiar no canto dele)'}">${ICON.copy}<span>Colar</span></button>
      <hr><button type="button" data-undo title="Desfazer a última alteração (Ctrl+Z)">${UNDO}<span>Desfazer</span></button><button type="button" data-redo title="Refazer (Ctrl+Shift+Z)">${REDO}<span>Refazer</span></button>
      ${gone.length ? `<hr>${gone.map((n) => `<button type="button" data-own="${esc(n.id)}" title="Voltar a pôr ${esc(n.label)} na página">${n.icon || ICON.board}<span>${esc(n.label)}</span></button>`).join('')}` : ''}`;
    // desfazer/refazer: o mesmo que Ctrl+Z. Primeiro tenta o da tabela ou do board desta página, senão o geral.
    const key = (redo) => document.dispatchEvent(new KeyboardEvent('keydown', { key: redo ? 'z' : 'z', shiftKey: redo, ctrlKey: true, bubbles: true, cancelable: true }));
    tools.querySelector('[data-undo]').addEventListener('click', () => key(false));
    tools.querySelector('[data-redo]').addEventListener('click', () => key(true));
    tools.querySelectorAll('[data-cva]').forEach((b) => b.addEventListener('click', () => acts[+b.dataset.cva]?.run()));
    tools.querySelectorAll('[data-own]').forEach((b) => b.addEventListener('click', () => grid.show(b.dataset.own)));
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
  const onPaste = (e) => { if (!document.body.contains(root)) return off(); if (typing(e) || document.querySelector('#modal.open, .pp-over, .bp-active')) return; if (paste()) e.preventDefault(); };
  const onCopy = (e) => { if (!document.body.contains(root)) return off(); if (!hover || typing(e) || document.querySelector('.bp-active')) return; const it = grid.items().find((x) => x.id === hover); if (it?.copy) { e.preventDefault(); it.copy(); } };
  const onClip = () => { if (!document.body.contains(root)) return off(); drawTools(); };
  const off = () => { document.removeEventListener('paste', onPaste); document.removeEventListener('copy', onCopy); window.removeEventListener('portal-clip', onClip); window.removeEventListener('storage', onClip); };
  document.addEventListener('paste', onPaste); document.addEventListener('copy', onCopy); window.addEventListener('portal-clip', onClip); window.addEventListener('storage', onClip);
  drawTools();
  return grid;
}
