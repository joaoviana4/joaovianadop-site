import { esc } from './lib.js';

// Peças comuns às tabelas (orçamentos e tabelas): cores de colunas e linhas, e atalhos de teclado.
//  Alt + ↓ / ↑   nova linha por baixo / por cima da linha onde está o rato (ou o cursor)
//  Alt + → / ←   nova coluna à direita / à esquerda da coluna onde está o rato
//  Alt + Shift + ↓  nova secção (no orçamento)

export const TINTS = ['', '#C8382D', '#FF8A3D', '#E3B341', '#2FB67C', '#2AA8C9', '#4F7BFF', '#7C5CFF', '#F06BD0', '#8A8A99'];

export function colorField(cur = '') {
  return `<div class="field"><span class="label">Cor</span><div class="tk-sw" role="radiogroup" aria-label="Cor">${TINTS.map((c) => `<label title="${c ? c : 'Sem cor'}"><input type="radio" name="tkcolor" value="${c}" ${c === (cur || '') ? 'checked' : ''}><span style="${c ? `--c:${c}` : ''}" class="${c ? '' : 'none'}"></span></label>`).join('')}
    <label class="tk-custom" title="Outra cor"><input type="color" data-tkcustom value="${esc(cur && !TINTS.includes(cur) ? cur : '#1E2AD4')}"><span>+</span></label></div></div>`;
}
export function readColor(root) {
  const custom = root.querySelector('[data-tkcustom]');
  if (custom?.dataset.used) return custom.value;
  return root.querySelector('[name=tkcolor]:checked')?.value || '';
}
export function bindColorField(root) {
  const custom = root.querySelector('[data-tkcustom]');
  custom?.addEventListener('input', () => { custom.dataset.used = '1'; root.querySelectorAll('[name=tkcolor]').forEach((r) => (r.checked = false)); });
  root.querySelectorAll('[name=tkcolor]').forEach((r) => r.addEventListener('change', () => { if (custom) delete custom.dataset.used; }));
}

// pequeno menu de cores junto a um botão (cor da linha)
export function colorPop(anchor, cur, onPick) {
  document.querySelector('.tk-pop')?.remove();
  const pop = document.createElement('div');
  pop.className = 'tk-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Cor da linha');
  pop.innerHTML = `${TINTS.map((c) => `<button type="button" data-c="${c}" class="${c ? '' : 'none'} ${c === (cur || '') ? 'on' : ''}" style="${c ? `--c:${c}` : ''}" aria-label="${c || 'Sem cor'}"></button>`).join('')}<label class="tk-custom" title="Outra cor"><input type="color" value="${esc(cur || '#1E2AD4')}"><span>+</span></label>`;
  document.body.append(pop);
  const r = anchor.getBoundingClientRect();
  pop.style.left = `${Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)}px`;
  pop.style.top = `${r.bottom + 6 + window.scrollY}px`;
  const close = () => { pop.remove(); document.removeEventListener('pointerdown', out, true); };
  const out = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
  setTimeout(() => document.addEventListener('pointerdown', out, true));
  pop.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { onPick(b.dataset.c); close(); }));
  pop.querySelector('input').addEventListener('change', (e) => { onPick(e.target.value); close(); });
}

// atalhos: o "alvo" é a linha/coluna debaixo do rato; se o rato não estiver na tabela, a da célula com o cursor
export function tableShortcuts(table, { rowBelow, rowAbove, section, colRight, colLeft }) {
  let hRow = null, hCol = null;
  table.addEventListener('mouseover', (e) => {
    const tr = e.target.closest('[data-row]'); if (tr) hRow = tr.dataset.row;
    const cell = e.target.closest('[data-colid]'); if (cell) hCol = cell.dataset.colid;
  });
  table.addEventListener('mouseleave', () => { hRow = null; hCol = null; });
  const onKey = (e) => {
    if (!document.body.contains(table)) { document.removeEventListener('keydown', onKey); return; }
    if (!e.altKey || !['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const f = document.activeElement;
    const row = hRow || (table.contains(f) ? f.closest('[data-row]')?.dataset.row : null);
    const col = hCol || (table.contains(f) ? f.closest('[data-colid]')?.dataset.colid : null);
    if (!row && !col && !table.matches(':hover')) return;
    e.preventDefault();
    if (e.key === 'ArrowDown') (e.shiftKey && section ? section : rowBelow)?.(row);
    if (e.key === 'ArrowUp') rowAbove?.(row);
    if (e.key === 'ArrowRight') colRight?.(col);
    if (e.key === 'ArrowLeft') colLeft?.(col);
  };
  document.addEventListener('keydown', onKey);
}

export const rowStyle = (r) => (r.color ? ` style="--rc:${esc(r.color)}"` : '');
export const colStyle = (c) => (c.color ? ` style="--cc:${esc(c.color)}"` : '');

// ---------- desfazer / refazer (Ctrl+Z, Ctrl+Shift+Z ou Ctrl+Y) ----------
// Guarda o estado da tabela antes de cada operação (linha, coluna, secção, cor, modelo, texto escrito numa célula).
// Enquanto se escreve numa célula, o Ctrl+Z desfaz as letras (o normal do browser); fora disso desfaz a última operação.
export function makeHistory({ get, set, after, notify }) {
  const past = []; const future = [];
  const snap = () => JSON.stringify(get());
  const h = {
    push(label, raw) { past.push({ label, data: raw ?? snap() }); if (past.length > 60) past.shift(); future.length = 0; },
    get last() { return past[past.length - 1]?.label || null; },
    undo() { const s = past.pop(); if (!s) return notify?.('Nada para desfazer.'); future.push({ label: s.label, data: snap() }); set(JSON.parse(s.data)); after(); notify?.(`Desfeito: ${s.label}.`); },
    redo() { const s = future.pop(); if (!s) return notify?.('Nada para refazer.'); past.push({ label: s.label, data: snap() }); set(JSON.parse(s.data)); after(); notify?.(`Refeito: ${s.label}.`); },
    // texto: guarda o estado antes da primeira tecla numa célula
    watch(table) {
      let before = null;
      table.addEventListener('focusin', (e) => { if (e.target.matches('input, textarea, select')) { before = snap(); delete e.target.dataset.dirty; } }, true);
      table.addEventListener('input', (e) => { const t = e.target; if (!t.matches('input, textarea, select') || t.dataset.dirty) return; t.dataset.dirty = '1'; if (before) h.push('escrever', before); }, true);
    },
  };
  return h;
}
export function bindUndoKeys(root, h) {
  const onKey = (e) => {
    if (!document.body.contains(root)) { document.removeEventListener('keydown', onKey); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase(); const redo = (k === 'z' && e.shiftKey) || k === 'y'; const undo = k === 'z' && !e.shiftKey;
    if (!undo && !redo) return;
    if (document.querySelector('#modal .modal')) return;
    const a = document.activeElement;
    // a escrever fora da tabela, ou já com letras escritas nesta célula: deixa o browser desfazer o texto
    if (a && a.matches('input, textarea, [contenteditable=true]') && (!root.contains(a) || a.dataset.dirty)) return;
    e.preventDefault(); if (undo) h.undo(); else h.redo();
  };
  document.addEventListener('keydown', onKey);
}
