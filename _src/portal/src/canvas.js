import { sb, esc, toast, ICON, saveLater, uploadImage, signedUrls, onLeave } from './lib.js';
import { mountGrid, COLS } from './grid.js';
import { cropDialog, cropAspect, cropImgStyle, naturalSize, isFull } from './imgcrop.js';
export const CROP = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>';

// Páginas como boards (Studio). Cada página tem os seus elementos (a página em si, ou os blocos da visão geral)
// e pode receber elementos copiados de outras páginas. Uma cópia é o mesmo elemento visto noutro sítio:
// mudas num lado, muda no outro. Notas: blocos de texto livres, guardados no projeto (layouts.notes).
//
// Copiar: botão de copiar no canto de cada elemento (ou Ctrl+C com o rato por cima). Colar: Ctrl+V ou "Colar" na barra.
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
function textEl(p, id) {
  const v = p.layouts?.items?.[id] || { text: '' };
  const el = document.createElement('div'); el.className = 'cv-text';
  el.innerHTML = `<textarea placeholder="Escreve aqui…" aria-label="Texto">${esc(v.text || '')}</textarea>`;
  const ta = el.querySelector('textarea'); const fit = () => { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; };
  const save = saveLater(() => saveItem(p, id, { text: ta.value }), 700);
  ta.addEventListener('input', () => { fit(); save(); }); requestAnimationFrame(fit);
  return el;
}
// imagem: mantém sempre a proporção ao redimensionar; "Recortar" escolhe a parte que se vê; legenda só se a juntarem
function imageEl(p, id) {
  const v = p.layouts?.items?.[id] || {};
  const el = document.createElement('figure'); el.className = 'cv-img';
  const draw = async () => {
    const url = v.path ? (await signedUrls([v.path]))[v.path] : null;
    if (!url) {
      el.innerHTML = `<button type="button" class="cv-img-empty" data-pick>${ICON.image}<span>Escolher imagem</span><small>ou larga-a aqui</small></button>`;
      el.querySelector('[data-pick]').addEventListener('click', pick); return;
    }
    if (!v.w) { const n = await naturalSize(url); if (n) { v.w = n.w; v.h = n.h; saveItem(p, id, v); } }
    const ar = cropAspect(v.crop, v.w, v.h) || 1.5;
    const hasCap = typeof v.caption === 'string';
    el.innerHTML = `<div class="cv-img-f" style="aspect-ratio:${ar.toFixed(5)}"><img src="${esc(url)}" alt="${esc(v.caption || '')}" draggable="false" style="${cropImgStyle(v.crop)}"></div>
      ${hasCap ? `<figcaption><input value="${esc(v.caption)}" placeholder="Legenda" aria-label="Legenda"></figcaption>` : ''}
      <div class="cv-img-tools"><button type="button" data-crop>${CROP} Recortar</button>${hasCap ? '' : `<button type="button" data-cap>${ICON.title || ''} Legenda</button>`}<button type="button" data-pick>${ICON.image} Mudar</button></div>`;
    el.querySelector('[data-pick]').addEventListener('click', pick);
    el.querySelector('[data-crop]').addEventListener('click', async () => {
      const c = await cropDialog(url, v.crop, { w: v.w, h: v.h }); if (!c) return;
      if (isFull(c)) delete v.crop; else v.crop = c;
      await saveItem(p, id, v); draw();
    });
    el.querySelector('[data-cap]')?.addEventListener('click', () => { v.caption = ''; draw().then(() => el.querySelector('figcaption input')?.focus()); });
    const cap = el.querySelector('figcaption input');
    if (cap) {
      const keep = saveLater(() => { v.caption = cap.value; saveItem(p, id, v); }, 600);
      cap.addEventListener('input', keep);
      // legenda vazia ao sair: desaparece
      cap.addEventListener('blur', () => { if (!cap.value.trim()) { delete v.caption; saveItem(p, id, v); draw(); } });
    }
  };
  const up = async (file) => {
    if (!file || !/^image\//.test(file.type)) return toast('Escolhe uma imagem.');
    toast('A carregar a imagem…', 6000);
    try { const r = await uploadImage(p.id, 'paginas', file); v.path = r.path; v.w = r.w; v.h = r.h; delete v.crop; await saveItem(p, id, v); draw(); } catch (e) { toast('Não foi possível carregar: ' + (e.message || e)); }
  };
  const pick = () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => up(i.files[0]); i.click(); };
  el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('over'); });
  el.addEventListener('dragleave', () => el.classList.remove('over'));
  el.addEventListener('drop', (e) => { e.preventDefault(); el.classList.remove('over'); up(e.dataTransfer.files[0]); });
  draw();
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
    return { id: `x:${x.id}`, label: x.title || (x.ref.kind === 'note' ? 'Nota' : GENERAL[x.ref.kind]?.[0] || 'Elemento'), el, w: x.w || COLS, copy: () => copyRef(p, x.ref, x.title || 'Elemento'), ref: x.ref, lockRatio: x.ref.kind === 'image' };
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
  const addExtra = (ref, title, w) => { const x = { id: newId(), ref, title, w }; saveExtra([...extra(), x]); grid.add(extraItem(x)); };

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
      <button type="button" data-layers title="Camadas: escolhe o que fica por cima quando os elementos se sobrepõem" aria-haspopup="dialog">${LAYERS}<span>Camadas</span></button>
      <button type="button" data-pack title="Arrumar: encosta todos os elementos para cima, sem sobreposições">${PACK}<span>Arrumar</span></button>
      <button type="button" class="${clip ? '' : 'off'}" data-paste ${clip ? '' : 'disabled'} title="${clip ? `Colar «${esc(clip.title)}» aqui (Ctrl+V)` : 'Para colar: copia um elemento noutra página (botão de copiar no canto dele)'}">${ICON.copy}<span>Colar</span></button>
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
