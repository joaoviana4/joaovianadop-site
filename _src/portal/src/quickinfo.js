import { esc, modal, ICON } from './lib.js';

// Informação "à mão": em vez de caixas abertas na página, só se mostra o que está preenchido (como factos curtos)
// e botões pequenos "+ Morada", "+ Medidas"… que abrem uma janela ao centro para preencher.
// groups: [{ key, label, add?, fields: [{ k, label, type?, placeholder?, options?, wide? }], show?: (v) => string }]
// get(k) devolve o valor; save(patch) grava (pode ser async). Clicar num facto volta a abrir a janela desse grupo.

const filled = (v) => v != null && String(v).trim() !== '';
const one = (g, get) => g.fields.length === 1;

export function quickInfo(box, { groups, get, save, readOnly = false, actions = '' }) {
  const draw = () => {
    const has = groups.filter((g) => g.fields.some((f) => filled(get(f.k))));
    const empty = groups.filter((g) => !has.includes(g));
    const text = (g) => (g.show ? g.show(get) : one(g) ? String(get(g.fields[0].k)) : g.fields.filter((f) => filled(get(f.k))).map((f) => `${f.label} ${get(f.k)}`).join(' · '));
    const long = (g) => one(g) && (g.fields[0].type === 'textarea');
    box.innerHTML = `${has.length ? `<dl class="qi-facts">${has.map((g) => `<div class="qi-f ${long(g) ? 'long' : ''}"><dt>${esc(g.label)}</dt><dd>${readOnly ? `<span>${esc(text(g))}</span>` : `<button type="button" class="qi-v" data-qg="${esc(g.key)}" title="Mudar ${esc(g.label.toLowerCase())}">${esc(text(g))}</button>`}</dd></div>`).join('')}</dl>` : ''}
      ${!readOnly && (empty.length || actions) ? `<div class="qi-add">${empty.map((g) => `<button type="button" class="qi-btn" data-qg="${esc(g.key)}">${ICON.plus}<span>${esc(g.add || g.label)}</span></button>`).join('')}${actions}</div>` : ''}`;
    box.querySelectorAll('[data-qg]').forEach((b) => b.addEventListener('click', () => open(groups.find((g) => g.key === b.dataset.qg))));
  };
  const open = (g) => {
    const field = (f) => {
      const v = get(f.k) ?? '';
      const id = `qi-${f.k}`;
      const input = f.type === 'textarea' ? `<textarea id="${id}" name="${esc(f.k)}" rows="${f.rows || 4}" placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`
        : f.type === 'select' ? `<select id="${id}" name="${esc(f.k)}">${f.options.map(([k, l]) => `<option value="${esc(k)}" ${String(v) === String(k) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`
          : `<input id="${id}" name="${esc(f.k)}" type="${f.type || 'text'}" value="${esc(v)}" placeholder="${esc(f.placeholder || '')}" ${f.type === 'number' ? 'step="any" inputmode="decimal"' : ''} autocomplete="off">`;
      return `<div class="field ${f.wide || f.type === 'textarea' ? 'qi-wide' : ''}"><label for="${id}">${esc(f.label)}</label>${input}</div>`;
    };
    const anyFilled = g.fields.some((f) => filled(get(f.k)));
    const m = modal(`<h2>${esc(g.label)}</h2>${g.hint ? `<p class="muted small">${esc(g.hint)}</p>` : ''}<form class="stack"><div class="qi-form ${g.fields.length > 3 ? 'many' : ''}">${g.fields.map(field).join('')}</div>
      <p class="muted small">Só o que preencheres aparece na página.</p>
      <div class="row between">${anyFilled ? '<button type="button" class="btn ghost danger-text" data-clear>Limpar</button>' : '<span></span>'}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Guardar</button></div></div></form>`, { wide: g.fields.length > 3 });
    const f = m.el.querySelector('form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const patch = Object.fromEntries(g.fields.map((x) => { const el = f.elements[x.k]; const v = el.value.trim(); return [x.k, x.type === 'number' ? (v === '' ? null : v) : v]; }));
      await save(patch); m.close(); draw();
    });
    m.el.querySelector('[data-clear]')?.addEventListener('click', async () => { await save(Object.fromEntries(g.fields.map((x) => [x.k, x.type === 'number' ? null : '']))); m.close(); draw(); });
  };
  draw();
  return { draw, open: (key) => open(groups.find((g) => g.key === key)) };
}

// foto no topo da página (pessoa): pequena, ao alto; sem foto, um quadrado "+ Foto". Usa os mesmos data-* do bindPhoto.
export const heroPhoto = (url, label = 'Foto') => `<div class="qi-photo ${url ? '' : 'empty'}" data-photo-drop>${url ? `<img src="${esc(url)}" alt="">` : ''}
  <button type="button" class="qi-photo-btn" data-photo-add title="${url ? 'Mudar a foto (ou arrasta/cola uma imagem)' : 'Juntar foto (ou arrasta/cola uma imagem)'}">${url ? ICON.edit : `${ICON.image}<span>${esc(label)}</span>`}</button>
  ${url ? `<button type="button" class="qi-photo-rm" data-photo-rm title="Tirar a foto" aria-label="Tirar a foto">${ICON.close}</button>` : ''}</div>`;
