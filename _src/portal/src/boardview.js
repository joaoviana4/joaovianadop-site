import { esc, ICON, sb, toast, saveLater } from './lib.js';
import { mountBoard } from './board.js';

// Board dentro de uma página (Studio): vê-se e mexe-se ali mesmo (clica dentro para mexer; roda do rato faz scroll
// à página até clicares), e "Ecrã inteiro" abre o board normal. Ex.: o moodboard na página do ator ou do décor.
// renamable: o nome do board muda-se ali mesmo (✎ ou duplo clique), e grava em boards.title (onRename recebe o nome novo)
export function boardPreview(el, p, { boardId, title = 'Board', href, base, height = 440, actions = '', onRemove = null, renamable = false, onRename = null }) {
  if (!el || !boardId) return null;
  el.classList.add('bp');
  // altura escolhida por quem arrasta a pega de baixo (guardada no projeto, igual para a equipa)

  const savedH = Number(p.layouts?.bpH?.[boardId]) || height;
  el.innerHTML = `<div class="row between wrap-gap bp-h"><h2 class="h3 bp-title"><span data-bptitle title="Duplo clique para mudar o nome">${esc(title)}</span>${renamable ? `<button type="button" class="gi-b bp-ren" data-bpren title="Mudar o nome" aria-label="Mudar o nome">✎</button>` : ''}</h2><span class="row">${actions}<span class="muted small bp-hint">Clica dentro para mexer</span><a class="btn ghost sm" href="${esc(href)}" title="Abrir o board em ecrã inteiro">${ICON.open}<span>Ecrã inteiro</span></a>${onRemove ? `<button type="button" class="icon-btn" data-bprm title="Apagar ${esc(title.toLowerCase())}" aria-label="Apagar ${esc(title.toLowerCase())}">${ICON.trash}</button>` : ''}</span></div>
    <div class="bp-box" style="height:${savedH}px"><div class="bp-root"></div></div><span class="bp-rs" title="Arrasta para mudar a altura · duplo clique: altura normal" aria-hidden="true"></span>`;
  // nome
  const tEl = el.querySelector('[data-bptitle]');
  const rename = () => {
    if (!renamable || el.querySelector('.bp-tin')) return;
    const inp = document.createElement('input'); inp.className = 'bp-tin'; inp.value = tEl.textContent; inp.setAttribute('aria-label', 'Nome');
    tEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const end = async (ok) => {
      if (done) return; done = true; const v = inp.value.trim(); inp.replaceWith(tEl);
      if (!ok || !v || v === tEl.textContent) return;
      const old = tEl.textContent; tEl.textContent = v;
      const { error } = await sb.from('boards').update({ title: v }).eq('id', boardId);
      if (error) { tEl.textContent = old; return toast('Não foi possível mudar o nome: ' + error.message); }
      onRename?.(v);
    };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); end(true); } if (e.key === 'Escape') end(false); });
    inp.addEventListener('blur', () => end(true));
  };
  el.querySelector('[data-bpren]')?.addEventListener('click', rename);
  if (renamable) tEl.addEventListener('dblclick', rename);
  // altura
  const box = el.querySelector('.bp-box');
  const saveH = saveLater(async (h) => {
    const layouts = { ...(p.layouts || {}), bpH: { ...(p.layouts?.bpH || {}), [boardId]: h } };
    if (h === height) delete layouts.bpH[boardId];
    const { error } = await sb.from('projects').update({ layouts }).eq('id', p.id);
    if (!error) p.layouts = layouts;
  }, 400);
  const rs = el.querySelector('.bp-rs');
  rs.addEventListener('pointerdown', (e) => {
    e.preventDefault(); const y0 = e.clientY, h0 = box.offsetHeight; rs.setPointerCapture(e.pointerId);
    const mv = (ev) => { box.style.height = `${Math.max(200, Math.min(1600, h0 + ev.clientY - y0))}px`; };
    const up = () => { rs.removeEventListener('pointermove', mv); rs.removeEventListener('pointerup', up); saveH(box.offsetHeight); };
    rs.addEventListener('pointermove', mv); rs.addEventListener('pointerup', up);
  });
  rs.addEventListener('dblclick', () => { box.style.height = `${height}px`; saveH(height); });

  const b = mountBoard(el.querySelector('.bp-root'), { projectId: p.id, boardId, embedded: true, onOpenBoard: (id) => { location.hash = `${base}/b/${id}`; } });
  el.querySelector('[data-bprm]')?.addEventListener('click', () => onRemove());
  // sai sozinho quando a página muda ou o elemento desaparece
  let dead = false;
  const destroy = () => { if (dead) return; dead = true; clearInterval(tm); window.removeEventListener('hashchange', onHash); try { b.destroy(); } catch { /* nada */ } };
  const onHash = () => setTimeout(() => { if (!document.body.contains(el)) destroy(); }, 0);
  const tm = setInterval(() => { if (!document.body.contains(el)) destroy(); }, 2500);
  window.addEventListener('hashchange', onHash);
  return { board: b, destroy };
}
