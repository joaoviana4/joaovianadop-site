import { saveLater, sb, esc, toast, ICON, signedUrls, uploadImage, confirmBox } from './lib.js';
import { entMode, entUrls, modeToggle, bindMode, entItems, bindPhoto } from './entview.js';
import { quickInfo, heroPhoto } from './quickinfo.js';
import { pageButtons } from './pagenotes.js';
import { offerActions } from './canvas.js';

// Figurino (departamento de Arte): cada ator/personagem tem uma página com
//  · o moodboard "Moodboard (nome)" — um board normal, que se abre em ecrã inteiro
//  · as medidas
//  · figurinos (Figurino 1, 2… com nome editável, notas e fotos de referência)
//  · fotos das provas de guarda-roupa
//  · o board geral do figurino (do projeto inteiro) e um board por figurino, como o moodboard
// Tudo fica em characters.info.wardrobe = { board_id, measures: {k: v}, costumes: [{id, name, notes, photos:[{path}]}], fittings: [{path, caption}] }.

const MEASURES = [
  ['altura', 'Altura'], ['peso', 'Peso'], ['peito', 'Peito / busto'], ['cintura', 'Cintura'], ['anca', 'Anca'], ['ombros', 'Ombros'],
  ['manga', 'Comprimento de manga'], ['entrepernas', 'Entrepernas'], ['colarinho', 'Colarinho / pescoço'], ['cabeca', 'Cabeça (chapéus)'],
  ['camisola', 'Tamanho de camisola'], ['calcas', 'Tamanho de calças'], ['vestido', 'Tamanho de vestido'], ['sapato', 'Número de sapato'],
];
const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 600) => saveLater(fn, ms);
const W = (c) => ({ measures: {}, costumes: [], fittings: [], ...(c.info?.wardrobe || {}) });

export async function wardrobePage(main, p, sub, base, cleanup) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const { data } = await sb.from('characters').select('*').eq('project_id', p.id).order('position');
  const chars = data || [];
  if (sub) { const c = chars.find((x) => x.id === sub); if (c) return personPage(main, p, c, base, cleanup); }
  const urls = await entUrls([chars]);
  const mode = entMode('wardrobe');
  const cnt = (c) => { const w = W(c); const n = w.costumes.length; return n ? `${n} ${n === 1 ? 'figurino' : 'figurinos'}` : '<span class="muted">Ainda sem figurinos</span>'; };
  const items = chars.map((c) => ({ e: c, href: `${base}/figurino/${c.id}`, title: c.actor || c.name, sub: esc(c.actor ? c.name : c.info?.extra ? 'Figurante' : 'Personagem'), meta: cnt(c) }));
  main.innerHTML = `<div class="row between wrap-gap"><div><h1 class="h1 pm-title">Figurino</h1><p class="muted">Uma página por ator: moodboard, medidas, figurinos com referências e as provas de guarda-roupa.</p></div><div class="row wrap-gap"><button type="button" class="btn primary" data-genboard>${ICON.board} Board geral do figurino</button>${chars.length ? modeToggle('wardrobe') : ''}</div></div>
    ${chars.length ? entItems(items, { mode, urls }) : `<div class="empty-box"><p>Ainda não há atores nem personagens.</p><p class="muted small">Junta-os em ${p.kind === 'ficcao' ? 'Personagens (ou importa o guião)' : 'Atores e figurantes'}; aparecem aqui sozinhos.</p></div>`}`;
  bindMode(main, 'wardrobe', () => wardrobePage(main, p, sub, base, cleanup));
  main.querySelector('[data-genboard]').addEventListener('click', async () => {
    const id = await openBoard(p, (b) => b.data?.general, { title: 'Figurino (geral)', data: { general: true } });
    if (id) location.hash = `${base}/b/${id}`;
  });
}

// boards do figurino: ficam fora da lista de ferramentas (kind 'wrd'); cria-se na primeira vez que se abre
async function openBoard(p, match, { title, data, known }) {
  if (known) { const { data: ex } = await sb.from('boards').select('id').eq('id', known).maybeSingle(); if (ex) return ex.id; }
  const { data: list } = await sb.from('boards').select('id, data').eq('project_id', p.id).eq('kind', 'wrd');
  const found = (list || []).find(match); if (found) return found.id;
  const grp = (p.departments || []).find((d) => d.id === 'arte') ? 'arte' : null;
  const { data: b, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'wrd', title, group_id: grp, data }).select('id').single();
  if (error) { toast(error.message); return null; }
  return b.id;
}

async function personPage(main, p, c, base, cleanup) {
  const w = W(c);
  const paths = [c.info?.photo, ...w.costumes.flatMap((x) => (x.photos || []).map((y) => y.path)), ...w.fittings.map((y) => y.path)].filter(Boolean);
  const urls = await signedUrls(paths);
  const title = c.actor || c.name;
  const save = debounce(() => sb.from('characters').update({ info: { ...(c.info || {}), wardrobe: w } }).eq('id', c.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message)));
  const saveNow = async () => { c.info = { ...(c.info || {}), wardrobe: w }; const { error } = await sb.from('characters').update({ info: c.info }).eq('id', c.id); if (error) toast(error.message); };
  const redraw = () => personPage(main, p, c, base, cleanup);
  const img = (ph, i, attr) => `<figure>${urls[ph.path] ? `<img src="${esc(urls[ph.path])}" alt="" loading="lazy">` : '<span class="muted small">a carregar…</span>'}<button type="button" class="icon-btn sm" ${attr}="${i}" aria-label="Tirar foto">${ICON.close}</button></figure>`;

  // página limpa: em cima a foto, o nome e só o que está preenchido; o resto abre-se com botões
  main.innerHTML = `<nav class="row between"><a href="${base}/figurino" class="link-btn">${ICON.back} Figurino</a><span data-pp></span></nav>
    <header class="qi-hero">
      ${heroPhoto(urls[c.info?.photo], 'Foto')}
      <div class="qi-main"><span class="small muted">${c.info?.extra ? 'Figurante' : c.actor ? esc(c.name) : 'Personagem'}</span><h1 class="h1">${esc(title)}</h1>
        <div data-qi></div><div data-acts></div></div>
    </header>
    <span hidden><button type="button" data-cadd></button><button type="button" data-fadd2></button></span>
    <section class="panel bp-wrap" data-mb hidden></section>
    <section class="stack wr-costumes">
      ${w.costumes.length ? `<div class="row between"><h2 class="h3">Figurinos</h2></div>` : ''}
      ${w.costumes.map((x, i) => `<article class="panel stack wr-cost" data-ci="${i}">
        <div class="row between wrap-gap"><input class="title-in h3 wr-cname" data-cname="${i}" value="${esc(x.name)}" aria-label="Nome do figurino">
          <div class="row wrap-gap"><button type="button" class="btn ghost sm" data-cph="${i}">${ICON.image} Fotos</button>${x.notes ? '' : `<button type="button" class="btn ghost sm" data-cnote="${i}">${ICON.note} Nota</button>`}<button type="button" class="btn ghost sm" data-cboard="${i}" title="Board deste figurino, em ecrã inteiro">${ICON.board} Board</button><button type="button" class="icon-btn" data-crm="${i}" aria-label="Apagar figurino">${ICON.trash}</button></div></div>
        <textarea data-cnotes="${i}" rows="2" placeholder="Peças, cores, tecidos, cenas onde entra…" ${x.notes ? '' : 'hidden'}>${esc(x.notes || '')}</textarea>
        ${(x.photos || []).length ? `<div class="photo-grid wr-photos" data-cdrop="${i}">${x.photos.map((ph, j) => img(ph, `${i}:${j}`, 'data-cphrm')).join('')}</div>` : `<div class="wr-drop" data-cdrop="${i}">Larga aqui fotos de referência, ou cola com Ctrl+V</div>`}
      </article>`).join('')}
    </section>
    ${w.fittings.length ? `<section class="panel stack" data-fsec>
      <div class="row between"><h2 class="h3">Provas de guarda-roupa</h2><button type="button" class="btn ghost sm" data-fadd>${ICON.plus} Fotos</button></div>
      <div class="photo-grid wr-fit" data-fdrop>${w.fittings.map((ph, i) => `<figure>${urls[ph.path] ? `<img src="${esc(urls[ph.path])}" alt="" loading="lazy">` : ''}<input class="wr-cap" data-fcap="${i}" value="${esc(ph.caption || '')}" placeholder="Legenda (figurino, data…)" aria-label="Legenda"><button type="button" class="icon-btn sm" data-frm="${i}" aria-label="Tirar foto">${ICON.close}</button></figure>`).join('')}</div>
    </section>` : ''}`;

  // medidas, características e notas: só aparece o que estiver preenchido
  const qi = quickInfo(main.querySelector('[data-qi]'), {
    groups: [
      { key: 'medidas', label: 'Medidas', add: 'Medidas e tamanhos', fields: MEASURES.map(([k, l]) => ({ k, label: l })),
        show: (get) => MEASURES.filter(([k]) => String(get(k) || '').trim()).map(([k, l]) => `${l} ${get(k)}`).concat((w.extraMeasures || []).filter((x) => x.value).map((x) => `${x.name} ${x.value}`)).join(' · ') },
      { key: 'notas', label: 'Características', add: 'Características (alergias, tatuagens…)', fields: [{ k: 'notas', label: 'Alergias a tecidos, preferências, tatuagens a tapar…', type: 'textarea' }] },
    ],
    get: (k) => w.measures[k],
    save: async (patch) => { Object.assign(w.measures, patch); await saveNow(); },
  });
  void qi;
  bindPhoto(main, p, 'characters', c, redraw);
  pageButtons(main.querySelector('[data-pp]'), p, { type: 'character', id: c.id, label: title });

  // moodboard: aparece na página (pré-visualização) quando existe; cria-se pela barra da direita
  const showMood = async () => {
    const el = main.querySelector('[data-mb]'); if (!el || !w.board_id) return;
    el.hidden = false;
    const { boardPreview } = await import('./boardview.js');
    const h = boardPreview(el, p, { boardId: w.board_id, title: 'Moodboard', href: `${base}/b/${w.board_id}`, base }); if (h) cleanup(() => h.destroy());
  };
  const createMood = async () => {
    let bid = w.board_id;
    if (bid) { const { data: ex } = await sb.from('boards').select('id').eq('id', bid).maybeSingle(); if (!ex) bid = null; }
    if (!bid) {
      const grp = (p.departments || []).find((d) => d.id === 'arte') ? 'arte' : null;
      const { data: b, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'wrd', title: `Moodboard (${title})`, group_id: grp, data: { character_id: c.id } }).select('id').single();
      if (error) return toast(error.message);
      w.board_id = b.id; await saveNow();
    }
    await showMood(); main.querySelector('[data-mb]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }); offer();
  };
  const offer = () => offerActions(main, main.querySelector('[data-acts]'), [
    { label: 'Figurino', icon: ICON.hanger || ICON.plus, title: 'Juntar um figurino', run: () => main.querySelector('[data-cadd]').click() },
    { label: 'Provas', icon: ICON.image, title: 'Juntar fotos das provas de guarda-roupa', run: () => main.querySelector('[data-fadd2]').click() },
    ...(!w.board_id ? [{ label: 'Moodboard', icon: ICON.board, title: 'Criar o moodboard (aparece aqui na página)', run: createMood }] : []),
  ]);
  offer();
  showMood();
  // board de cada figurino
  main.querySelectorAll('[data-cboard]').forEach((btn) => btn.addEventListener('click', async () => {
    const x = w.costumes[+btn.dataset.cboard];
    const id = await openBoard(p, (b) => b.data?.costume_id === x.id, { title: `${x.name} (${title})`, data: { character_id: c.id, costume_id: x.id }, known: x.board_id });
    if (!id) return;
    if (x.board_id !== id) { x.board_id = id; await saveNow(); }
    location.hash = `${base}/b/${id}`;
  }));
  // figurinos
  main.querySelector('[data-cadd]')?.addEventListener('click', async () => { w.costumes.push({ id: uid(), name: `Figurino ${w.costumes.length + 1}`, notes: '', photos: [] }); await saveNow(); redraw(); requestAnimationFrame(() => { const el = main.querySelector(`[data-cname="${w.costumes.length - 1}"]`); el?.focus(); el?.select(); }); });
  main.querySelectorAll('[data-cname]').forEach((el) => el.addEventListener('input', () => { w.costumes[+el.dataset.cname].name = el.value; save(); }));
  main.querySelectorAll('[data-cnotes]').forEach((el) => el.addEventListener('input', () => { w.costumes[+el.dataset.cnotes].notes = el.value; save(); }));
  main.querySelectorAll('[data-cnote]').forEach((b) => b.addEventListener('click', () => { const t = main.querySelector(`[data-cnotes="${b.dataset.cnote}"]`); t.hidden = false; t.focus(); b.remove(); }));
  main.querySelectorAll('[data-crm]').forEach((b) => b.addEventListener('click', async () => { const x = w.costumes[+b.dataset.crm]; if (!(await confirmBox(`Apagar "${x.name}" e as suas fotos de referência?`, 'Apagar'))) return; w.costumes.splice(+b.dataset.crm, 1); await saveNow(); redraw(); }));
  main.querySelectorAll('[data-cphrm]').forEach((b) => b.addEventListener('click', async () => { const [i, j] = b.dataset.cphrm.split(':').map(Number); w.costumes[i].photos.splice(j, 1); await saveNow(); redraw(); }));

  const upload = async (files, put) => {
    const imgs = [...files].filter((f) => f.type.startsWith('image/')); if (!imgs.length) return;
    toast(`A enviar ${imgs.length} ${imgs.length === 1 ? 'foto' : 'fotos'}…`, 8000);
    for (const f of imgs) { try { const up = await uploadImage(p.id, 'figurino', f); put({ path: up.path }); } catch (e) { toast(e.message); } }
    await saveNow(); redraw();
  };
  const pick = (put) => { const i = document.createElement('input'); i.type = 'file'; i.accept = 'image/*'; i.multiple = true; i.onchange = () => upload(i.files, put); i.click(); };
  const toCostume = (i) => (ph) => { w.costumes[i].photos = [...(w.costumes[i].photos || []), ph]; };
  const toFit = (ph) => { w.fittings.push({ ...ph, caption: '' }); };
  let target = null; // onde vai um Ctrl+V: o último figurino em que se carregou, ou as provas
  main.querySelectorAll('[data-cph]').forEach((b) => b.addEventListener('click', () => pick(toCostume(+b.dataset.cph))));
  main.querySelectorAll('[data-ci]').forEach((el) => el.addEventListener('pointerdown', () => { target = toCostume(+el.dataset.ci); main.querySelectorAll('.wr-cost').forEach((x) => x.classList.toggle('on', x === el)); }));
  main.querySelectorAll('[data-cdrop]').forEach((el) => { el.addEventListener('dragover', (e) => e.preventDefault()); el.addEventListener('drop', (e) => { e.preventDefault(); upload(e.dataTransfer.files, toCostume(+el.dataset.cdrop)); }); });
  main.querySelectorAll('[data-fadd], [data-fadd2]').forEach((b) => b.addEventListener('click', () => pick(toFit)));
  const fd = main.querySelector('[data-fdrop]');
  if (fd) { fd.addEventListener('dragover', (e) => e.preventDefault()); fd.addEventListener('drop', (e) => { e.preventDefault(); upload(e.dataTransfer.files, toFit); }); main.querySelector('[data-fsec]').addEventListener('pointerdown', () => { target = toFit; main.querySelectorAll('.wr-cost').forEach((x) => x.classList.remove('on')); }); }
  main.querySelectorAll('[data-fcap]').forEach((el) => el.addEventListener('input', () => { w.fittings[+el.dataset.fcap].caption = el.value; save(); }));
  main.querySelectorAll('[data-frm]').forEach((b) => b.addEventListener('click', async () => { w.fittings.splice(+b.dataset.frm, 1); await saveNow(); redraw(); }));
  const anchor = main.querySelector('.qi-hero');
  const onPaste = (e) => {
    if (!document.body.contains(anchor)) { document.removeEventListener('paste', onPaste, true); return; }
    if (e.target.closest?.('input, textarea') || document.querySelector('#modal .modal') || e.target.closest?.('[data-photo-drop]')) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/')); if (!files.length) return;
    if (!target && !w.costumes.length) return; // sem figurinos: a imagem colada vai para a foto (bindPhoto)
    e.preventDefault(); upload(files, target || toCostume(w.costumes.length - 1));
  };
  document.addEventListener('paste', onPaste, true); cleanup(() => document.removeEventListener('paste', onPaste, true));
}

// Resumo do figurino para a página da personagem/ator: figurinos com foto, medidas, provas e o que veste em cada cena.
export async function wardrobeSummary(el, p, c, base, scenes = []) {
  if (!el) return;
  const w = W(c);
  const paths = [...w.costumes.map((k) => k.photos?.[0]?.path), ...w.fittings.slice(0, 4).map((x) => x.path)].filter(Boolean);
  const urls = await signedUrls(paths);
  const meas = Object.entries(w.measures || {}).filter(([, v]) => String(v || '').trim());
  const lbl = (k) => (MEASURES.find((m) => m[0] === k) || [k, k])[1];
  const byScene = scenes.map((s) => ({ s, x: s.info?.wardrobe?.[c.id] })).filter((r) => r.x && (r.x.costume || r.x.notes));
  const cname = (id) => w.costumes.find((k) => k.id === id)?.name || '';
  el.innerHTML = `<div class="row between wrap-gap"><h2 class="h3">Figurino</h2><a class="btn ghost sm" href="${base}/figurino/${c.id}">${ICON.hanger || ''} Abrir figurino</a></div>
    ${w.costumes.length ? `<div class="wsum-c">${w.costumes.map((k) => `<a class="wsum-k" href="${base}/figurino/${c.id}"><span class="wsum-ph">${k.photos?.[0]?.path && urls[k.photos[0].path] ? `<img src="${esc(urls[k.photos[0].path])}" alt="" loading="lazy">` : ''}</span><b>${esc(k.name || 'Figurino')}</b>${k.notes ? `<small class="muted">${esc(k.notes)}</small>` : ''}</a>`).join('')}</div>` : '<p class="muted small">Ainda não há figurinos para esta personagem.</p>'}
    ${byScene.length ? `<h3 class="h4 wsum-h">Por cena</h3><ul class="wsum-s">${byScene.map(({ s, x }) => `<li><a href="${base}/cenas/${s.id}"><b>${esc(s.number || '')}</b> <span class="muted">${esc(s.heading || '')}</span></a><span>${esc([cname(x.costume), x.notes].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>` : ''}
    ${meas.length ? `<h3 class="h4 wsum-h">Medidas</h3><p class="small wsum-m">${meas.map(([k, v]) => `<span><span class="muted">${esc(lbl(k))}</span> ${esc(v)}</span>`).join('')}</p>` : ''}
    ${w.fittings.length ? `<h3 class="h4 wsum-h">Provas de guarda-roupa <span class="muted small">${w.fittings.length}</span></h3><div class="wsum-f">${w.fittings.slice(0, 4).map((x) => (urls[x.path] ? `<img src="${esc(urls[x.path])}" alt="${esc(x.caption || '')}" title="${esc(x.caption || '')}" loading="lazy">` : '')).join('')}</div>` : ''}`;
}
