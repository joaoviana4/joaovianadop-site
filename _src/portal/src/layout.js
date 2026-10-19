import { sb, esc, toast, ICON, saveLater } from './lib.js';

// Páginas organizáveis: cada bloco [data-blk] pode ir para a esquerda, para a direita ou ocupar a largura toda,
// subir, descer, ser arrastado ou escondido. A arrumação fica guardada no projeto (igual para toda a equipa).
//
// Os blocos seguidos que não são "inteira" formam uma faixa com duas colunas (esquerda e direita).

const editing = new Set();
const SPLITS = [['2:1', '2/3 + 1/3'], ['1:1', 'Metade + metade'], ['1:2', '1/3 + 2/3']];
const POS = [['left', 'Esquerda', '◧'], ['full', 'Largura toda', '▭'], ['right', 'Direita', '◨']];

// inline: os controlos de cada bloco aparecem ao passar o rato (sem o modo "Organizar"); tirar um bloco esconde-o
// (onRemove pode tratar dele, ex.: notas e ferramentas coladas, que se apagam). b.off: escondido por defeito.
export function mountLayout(root, { project, key, blocks, title = 'página', inline = false, onRemove, onChange }) {
  const els = new Map([...root.querySelectorAll(':scope > [data-blk]')].map((e) => [e.dataset.blk, e]));
  const defs = blocks.filter((b) => els.has(b.id));
  const saved = project.layouts?.[key] || {};
  const st = {
    order: [...(saved.order || []).filter((id) => els.has(id)), ...defs.map((b) => b.id).filter((id) => !(saved.order || []).includes(id))],
    pos: Object.fromEntries(defs.map((b) => [b.id, saved.pos?.[b.id] || b.pos || 'full'])),
    hidden: [...(saved.hidden || []).filter((id) => els.has(id)), ...defs.filter((b) => b.off && !(saved.order || []).includes(b.id) && !(saved.hidden || []).includes(b.id)).map((b) => b.id)],
    split: saved.split || '2:1',
  };
  const label = (id) => defs.find((b) => b.id === id)?.label || id;
  const save = saveLater(async () => {
    {
      const layouts = { ...(project.layouts || {}), [key]: { ...(project.layouts?.[key] || {}), order: st.order, pos: st.pos, hidden: st.hidden, split: st.split } };
      const { error } = await sb.from('projects').update({ layouts }).eq('id', project.id);
      if (error) toast('Não foi possível guardar a arrumação: ' + error.message); else project.layouts = layouts;
    }
  }, 500);

  const bar = document.createElement('div');
  bar.className = 'lay-bar';
  root.before(bar);

  function render() {
    const on = inline || editing.has(key);
    root.classList.add('lay');
    root.classList.toggle('lay-edit', on);
    root.classList.toggle('lay-inline', inline);
    root.style.setProperty('--split', { '2:1': '1.7fr 1fr', '1:1': '1fr 1fr', '1:2': '1fr 1.7fr' }[st.split]);
    els.forEach((e) => e.remove());
    root.querySelectorAll(':scope > .lay-band').forEach((b) => b.remove());
    let band = null;
    st.order.forEach((id) => {
      const e = els.get(id);
      if (!e) return;
      const hidden = st.hidden.includes(id);
      if (hidden && (!on || inline)) return;
      e.classList.toggle('lay-hidden', hidden);
      decorate(e, id, on);
      const pos = st.pos[id];
      if (pos === 'full') { band = null; root.append(e); return; }
      if (!band) { band = document.createElement('div'); band.className = 'lay-band'; band.innerHTML = '<div class="lay-col" data-col="left"></div><div class="lay-col" data-col="right"></div>'; root.append(band); }
      band.querySelector(`[data-col="${pos}"]`).append(e);
    });
    // colunas vazias numa faixa: o outro lado ocupa tudo
    root.querySelectorAll(':scope > .lay-band').forEach((b) => b.classList.toggle('one', [...b.children].some((c) => !c.children.length)));
    if (inline) { bar.hidden = true; onChange?.(st); return; }
    bar.innerHTML = on
      ? `<div class="lay-tools"><strong>${ICON.board} A organizar a ${esc(title)}</strong>
          <span class="muted small">Arrasta pela pega, ou usa os botões de cada bloco.</span>
          <label class="sel"><span class="vh">Colunas</span><select data-split>${SPLITS.map(([k, l]) => `<option value="${k}" ${st.split === k ? 'selected' : ''}>Colunas: ${l}</option>`).join('')}</select></label>
          <button type="button" class="btn ghost" data-reset>Repor</button>
          <button type="button" class="btn primary" data-done>Feito</button></div>`
      : `<button type="button" class="lay-open" data-edit title="Organizar esta página">${ICON.board}<span>Organizar página</span></button>`;
    bar.querySelector('[data-edit]')?.addEventListener('click', () => { editing.add(key); render(); });
    bar.querySelector('[data-done]')?.addEventListener('click', () => { editing.delete(key); render(); });
    bar.querySelector('[data-split]')?.addEventListener('change', (e) => { st.split = e.target.value; save(); render(); });
    bar.querySelector('[data-reset]')?.addEventListener('click', () => { st.order = defs.map((b) => b.id); defs.forEach((b) => (st.pos[b.id] = b.pos || 'full')); st.hidden = []; st.split = '2:1'; save(); render(); });
  }

  function decorate(e, id, on) {
    e.querySelector(':scope > .lay-h')?.remove();
    e.draggable = false;
    if (!on) return;
    const h = document.createElement('div');
    h.className = 'lay-h';
    const hidden = st.hidden.includes(id);
    const i = st.order.indexOf(id);
    h.innerHTML = `<span class="lay-grip" draggable="true" title="Arrastar" aria-hidden="true">⠿</span><strong>${esc(label(id))}</strong>
      <span class="lay-btns">
        <span class="lay-seg" role="group" aria-label="Posição">${POS.map(([k, l, g]) => `<button type="button" data-pos="${k}" class="${st.pos[id] === k ? 'on' : ''}" title="${l}" aria-label="${l}" aria-pressed="${st.pos[id] === k}">${g}</button>`).join('')}</span>
        <button type="button" data-mv="-1" title="Subir" aria-label="Subir" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button type="button" data-mv="1" title="Descer" aria-label="Descer" ${i === st.order.length - 1 ? 'disabled' : ''}>↓</button>
        ${inline ? `<button type="button" data-hide class="lay-x" title="Tirar da página" aria-label="Tirar ${esc(label(id))} da página">${ICON.close}</button>` : `<button type="button" data-hide title="${hidden ? 'Mostrar' : 'Esconder'}">${hidden ? 'Mostrar' : 'Esconder'}</button>`}
      </span>`;
    e.prepend(h);
    h.querySelectorAll('[data-pos]').forEach((b) => b.addEventListener('click', () => { st.pos[id] = b.dataset.pos; save(); render(); }));
    h.querySelectorAll('[data-mv]').forEach((b) => b.addEventListener('click', () => { const j = i + Number(b.dataset.mv); if (j < 0 || j >= st.order.length) return; st.order.splice(i, 1); st.order.splice(j, 0, id); save(); render(); }));
    h.querySelector('[data-hide]').addEventListener('click', () => {
      if (inline && onRemove && onRemove(id)) { st.order = st.order.filter((x) => x !== id); els.delete(id); e.remove(); save(); render(); return; }
      st.hidden = hidden ? st.hidden.filter((x) => x !== id) : [...st.hidden, id]; save(); render();
    });
    const grip = h.querySelector('.lay-grip');
    grip.addEventListener('dragstart', (ev) => { ev.dataTransfer.setData('text/plain', id); ev.dataTransfer.effectAllowed = 'move'; e.classList.add('lay-dragging'); });
    grip.addEventListener('dragend', () => e.classList.remove('lay-dragging'));
    e.addEventListener('dragover', (ev) => { if (!editing.has(key)) return; ev.preventDefault(); const r = e.getBoundingClientRect(); e.classList.toggle('drop-before', ev.clientY < r.top + r.height / 2); e.classList.toggle('drop-after', ev.clientY >= r.top + r.height / 2); });
    e.addEventListener('dragleave', () => e.classList.remove('drop-before', 'drop-after'));
    e.addEventListener('drop', (ev) => {
      ev.preventDefault(); const after = e.classList.contains('drop-after'); e.classList.remove('drop-before', 'drop-after');
      const from = ev.dataTransfer.getData('text/plain'); if (!from || from === id) return;
      st.order.splice(st.order.indexOf(from), 1);
      st.order.splice(st.order.indexOf(id) + (after ? 1 : 0), 0, from);
      // quem é largado junto de um bloco numa coluna passa para essa coluna
      st.pos[from] = st.pos[id];
      save(); render();
    });
  }

  render();
  return {
    render, st,
    isHidden: (id) => st.hidden.includes(id),
    show(id) { st.hidden = st.hidden.filter((x) => x !== id); save(); render(); els.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
    // junta um bloco novo (nota, ferramenta colada) no fim
    add(el, def) { el.dataset.blk = def.id; defs.push(def); els.set(def.id, el); st.order.push(def.id); st.pos[def.id] = def.pos || 'full'; save(); render(); el.scrollIntoView({ behavior: 'smooth', block: 'center' }); },
  };
}

// ecrã inteiro para um bloco (grelha de secções, shotlist…): ocupa a janela toda. Esc ou "Sair" para voltar.
// Fica ligado mesmo quando o bloco se redesenha (ex.: ao juntar um plano), por isso é por chave.
const fsOn = new Set();
let fsKeyHandler = null;
export function fullscreenButton(el, key, label = 'Ecrã inteiro') {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'btn ghost fs-btn';
  const apply = () => {
    const on = fsOn.has(key);
    el.classList.toggle('fs-on', on); document.body.classList.toggle('fs-lock', fsOn.size > 0);
    b.classList.toggle('fs-float', on);
    b.innerHTML = `${on ? ICON.close : ICON.fit}<span>${on ? 'Sair do ecrã inteiro' : label}</span>`;
  };
  b.addEventListener('click', () => { if (fsOn.has(key)) fsOn.delete(key); else fsOn.add(key); apply(); });
  if (fsKeyHandler) document.removeEventListener('keydown', fsKeyHandler);
  fsKeyHandler = (e) => { if (e.key === 'Escape' && fsOn.has(key) && !document.querySelector('#modal .modal')) { fsOn.delete(key); apply(); } };
  document.addEventListener('keydown', fsKeyHandler);
  apply();
  return b;
}
export function clearFullscreen() { fsOn.clear(); document.body.classList.remove('fs-lock'); }
