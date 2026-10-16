import { sb, esc, ICON, toast, signedUrl, signedUrls, uploadImage, initials } from './lib.js';

// Atores, figurantes e décors em grelha (com foto) ou em lista. A escolha fica guardada por tipo.
// Foto: décors → a primeira foto de repérage (locations.photos); pessoas → info.photo.
const KEY = (k) => `bg-entview-${k}`;
export function entMode(k) { try { return localStorage.getItem(KEY(k)) || 'grid'; } catch { return 'grid'; } }
function setMode(k, v) { try { localStorage.setItem(KEY(k), v); } catch { /* nada */ } }

export const entPhoto = (e) => (e.photos || [])[0]?.path || e.info?.photo || null;
export const entUrls = (lists) => signedUrls(lists.flat().map(entPhoto).filter(Boolean));

export function modeToggle(k) {
  const m = entMode(k);
  return `<div class="seg dark ent-mode" role="radiogroup" aria-label="Vista">${[['grid', 'Grelha'], ['list', 'Lista']].map(([v, l]) => `<button type="button" role="radio" aria-checked="${m === v}" aria-selected="${m === v}" data-entmode="${v}">${l}</button>`).join('')}</div>`;
}
export function bindMode(root, k, redraw) {
  root.querySelectorAll('[data-entmode]').forEach((b) => b.addEventListener('click', () => { if (entMode(k) === b.dataset.entmode) return; setMode(k, b.dataset.entmode); redraw(); }));
}

// items: [{ e, href, title, sub, meta }]; place = décor (sem foto mostra o ícone de casa), senão iniciais
export function entItems(items, { mode, urls, place = false }) {
  const pic = (e, title, cls) => { const u = urls[entPhoto(e)]; return `<span class="${cls}">${u ? `<img src="${esc(u)}" alt="" loading="lazy">` : place ? ICON.home : `<b>${esc(initials(title))}</b>`}</span>`; };
  if (mode === 'list') {
    return `<div class="ent-list">${items.map(({ e, href, title, sub, meta }) => `<a class="ent-row" href="${href}">${pic(e, title, 'ent-th')}<strong>${esc(title)}</strong><span class="muted small">${sub}</span><span class="small">${meta}</span>${ICON.chev}</a>`).join('')}</div>`;
  }
  return `<div class="ent-tiles">${items.map(({ e, href, title, sub, meta }) => `<a class="ent-tile" href="${href}">${pic(e, title, 'ent-ph')}<span class="ent-tb"><strong>${esc(title)}</strong><span class="muted small">${sub}</span><span class="small">${meta}</span></span></a>`).join('')}</div>`;
}

// Foto de uma pessoa (atores, figurantes, personagens): guardada em info.photo
export async function photoField(e) {
  const path = e.info?.photo; const url = path ? await signedUrl(path) : null;
  return `<div class="ent-photo" data-photo-drop>${url ? `<img src="${esc(url)}" alt="">` : `<span class="muted small">Sem foto</span>`}
    <div class="row"><button type="button" class="btn ghost sm" data-photo-add>${ICON.image} ${url ? 'Mudar foto' : 'Juntar foto'}</button>${url ? `<button type="button" class="link-btn small" data-photo-rm>Tirar</button>` : ''}</div></div>`;
}
export function bindPhoto(root, p, table, e, redraw) {
  const save = async (path) => { e.info = { ...(e.info || {}), photo: path }; if (!path) delete e.info.photo; const { error } = await sb.from(table).update({ info: e.info }).eq('id', e.id); if (error) toast(error.message); redraw(); };
  const up = async (file) => { if (!file?.type?.startsWith('image/')) return; try { toast('A enviar a foto…'); const r = await uploadImage(p.id, 'elenco', file); await save(r.path); } catch (err) { toast(err.message); } };
  root.querySelector('[data-photo-add]')?.addEventListener('click', () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.onchange = () => up(i.files[0]); i.click(); });
  root.querySelector('[data-photo-rm]')?.addEventListener('click', () => save(null));
  const d = root.querySelector('[data-photo-drop]');
  d?.addEventListener('dragover', (ev) => ev.preventDefault());
  d?.addEventListener('drop', (ev) => { ev.preventDefault(); up(ev.dataTransfer.files[0]); });
}

// Fotos de um décor (locations.photos = [{ path }]); a primeira é a que aparece na grelha
export async function placePhotos(l) {
  const photos = l.photos || []; const urls = await signedUrls(photos.map((x) => x.path));
  return `<section class="panel"><div class="row between"><h2 class="h3">Fotos do décor</h2><button type="button" class="btn ghost" data-addph>${ICON.plus} Fotos</button></div>
    <div class="photo-grid" data-photos>${photos.map((ph, i) => `<figure><img src="${esc(urls[ph.path] || '')}" alt="">${i === 0 ? '<figcaption class="small muted">Capa</figcaption>' : `<button type="button" class="link-btn small" data-coverph="${i}">Usar como capa</button>`}<button type="button" class="icon-btn sm" data-rmph="${i}" aria-label="Tirar foto">${ICON.close}</button></figure>`).join('') || '<p class="muted small">Ainda sem fotos. Também podes largá-las aqui.</p>'}</div></section>`;
}
export function bindPlacePhotos(root, p, l, redraw) {
  const put = async () => { const { error } = await sb.from('locations').update({ photos: l.photos }).eq('id', l.id); if (error) toast(error.message); redraw(); };
  const add = async (files) => {
    const imgs = [...files].filter((x) => x.type.startsWith('image/')); if (!imgs.length) return;
    toast(`A enviar ${imgs.length} ${imgs.length === 1 ? 'foto' : 'fotos'}…`, 8000);
    for (const file of imgs) { try { const up = await uploadImage(p.id, 'decors', file); l.photos = [...(l.photos || []), { path: up.path }]; } catch (e) { toast(e.message); } }
    put();
  };
  root.querySelector('[data-addph]')?.addEventListener('click', () => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.onchange = () => add(i.files); i.click(); });
  const grid = root.querySelector('[data-photos]');
  grid?.addEventListener('dragover', (e) => e.preventDefault());
  grid?.addEventListener('drop', (e) => { e.preventDefault(); add(e.dataTransfer.files); });
  root.querySelectorAll('[data-rmph]').forEach((b) => b.addEventListener('click', () => { l.photos = l.photos.filter((_, i) => i !== +b.dataset.rmph); put(); }));
  root.querySelectorAll('[data-coverph]').forEach((b) => b.addEventListener('click', () => { const i = +b.dataset.coverph; const ph = l.photos[i]; l.photos = [ph, ...l.photos.filter((_, j) => j !== i)]; put(); }));
}
