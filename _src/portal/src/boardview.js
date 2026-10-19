import { esc, ICON } from './lib.js';
import { mountBoard } from './board.js';

// Board dentro de uma página (Studio): vê-se e mexe-se ali mesmo (clica dentro para mexer; roda do rato faz scroll
// à página até clicares), e "Ecrã inteiro" abre o board normal. Ex.: o moodboard na página do ator ou do décor.
export function boardPreview(el, p, { boardId, title = 'Board', href, base, height = 440, actions = '' }) {
  if (!el || !boardId) return null;
  el.classList.add('bp');
  el.innerHTML = `<div class="row between wrap-gap bp-h"><h2 class="h3">${esc(title)}</h2><span class="row">${actions}<span class="muted small bp-hint">Clica dentro para mexer</span><a class="btn ghost sm" href="${esc(href)}" title="Abrir o board em ecrã inteiro">${ICON.open}<span>Ecrã inteiro</span></a></span></div>
    <div class="bp-box" style="height:${height}px"><div class="bp-root"></div></div>`;
  const b = mountBoard(el.querySelector('.bp-root'), { projectId: p.id, boardId, embedded: true, onOpenBoard: (id) => { location.hash = `${base}/b/${id}`; } });
  // sai sozinho quando a página muda ou o elemento desaparece
  let dead = false;
  const destroy = () => { if (dead) return; dead = true; clearInterval(tm); window.removeEventListener('hashchange', onHash); try { b.destroy(); } catch { /* nada */ } };
  const onHash = () => setTimeout(() => { if (!document.body.contains(el)) destroy(); }, 0);
  const tm = setInterval(() => { if (!document.body.contains(el)) destroy(); }, 2500);
  window.addEventListener('hashchange', onHash);
  return { board: b, destroy };
}
