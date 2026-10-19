import { sb, esc, toast, ICON, signedUrls, uploadImage, confirmBox } from './lib.js';
import { entMode, entUrls, modeToggle, bindMode, entItems } from './entview.js';

// Figurino (departamento de Arte): cada ator/personagem tem uma página com
//  · o moodboard "Moodboard (nome)" — um board normal, que se abre em ecrã inteiro
//  · as medidas
//  · figurinos (Figurino 1, 2… com nome editável, notas e fotos de referência)
//  · fotos das provas de guarda-roupa
// Tudo fica em characters.info.wardrobe = { board_id, measures: {k: v}, costumes: [{id, name, notes, photos:[{path}]}], fittings: [{path, caption}] }.

const MEASURES = [
  ['altura', 'Altura'], ['peso', 'Peso'], ['peito', 'Peito / busto'], ['cintura', 'Cintura'], ['anca', 'Anca'], ['ombros', 'Ombros'],
  ['manga', 'Comprimento de manga'], ['entrepernas', 'Entrepernas'], ['colarinho', 'Colarinho / pescoço'], ['cabeca', 'Cabeça (chapéus)'],
  ['camisola', 'Tamanho de camisola'], ['calcas', 'Tamanho de calças'], ['vestido', 'Tamanho de vestido'], ['sapato', 'Número de sapato'],
];
const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
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
  main.innerHTML = `<div class="row between wrap-gap"><div><h1 class="h1 pm-title">Figurino</h1><p class="muted">Uma página por ator: moodboard, medidas, figurinos com referências e as provas de guarda-roupa.</p></div>${chars.length ? modeToggle('wardrobe') : ''}</div>
    ${chars.length ? entItems(items, { mode, urls }) : `<div class="empty-box"><p>Ainda não há atores nem personagens.</p><p class="muted small">Junta-os em ${p.kind === 'ficcao' ? 'Personagens (ou importa o guião)' : 'Atores e figurantes'}; aparecem aqui sozinhos.</p></div>`}`;
  bindMode(main, 'wardrobe', () => wardrobePage(main, p, sub, base, cleanup));
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

  main.innerHTML = `<a href="${base}/figurino" class="link-btn">${ICON.back} Figurino</a>
    <header class="wr-head">
      <span class="wr-ph">${urls[c.info?.photo] ? `<img src="${esc(urls[c.info.photo])}" alt="">` : ICON.team}</span>
      <div><h1 class="h1">${esc(title)}</h1><p class="muted">${c.actor ? esc(c.name) : c.info?.extra ? 'Figurante' : 'Personagem'}</p></div>
      <button type="button" class="btn primary wr-mood" data-mood>${ICON.board} Moodboard (${esc(title)})</button>
    </header>
    <div class="wr-grid">
      <section class="panel stack"><h2 class="h3">Medidas</h2>
        <table class="table wr-meas"><tbody>${MEASURES.map(([k, l]) => `<tr><th>${l}</th><td><input data-m="${k}" value="${esc(w.measures[k] || '')}" aria-label="${l}" placeholder="—"></td></tr>`).join('')}
          ${(w.extraMeasures || []).map((x, i) => `<tr><th><input class="wr-mname" data-xn="${i}" value="${esc(x.name)}" aria-label="Nome da medida"></th><td class="row"><input data-xv="${i}" value="${esc(x.value || '')}" aria-label="${esc(x.name)}" placeholder="—"><button type="button" class="icon-btn sm" data-xrm="${i}" aria-label="Tirar">${ICON.close}</button></td></tr>`).join('')}</tbody></table>
        <button type="button" class="link-btn small" data-xadd>${ICON.plus} Outra medida</button>
        <div class="field"><label for="wn">Notas (alergias a tecidos, preferências, tatuagens a tapar…)</label><textarea id="wn" data-m="notas" rows="3">${esc(w.measures.notas || '')}</textarea></div>
      </section>
      <section class="stack wr-costumes">
        <div class="row between"><h2 class="h3">Figurinos</h2><button type="button" class="btn ghost" data-cadd>${ICON.plus} Figurino</button></div>
        ${w.costumes.length ? w.costumes.map((x, i) => `<article class="panel stack wr-cost" data-ci="${i}">
          <div class="row between"><input class="title-in h3 wr-cname" data-cname="${i}" value="${esc(x.name)}" aria-label="Nome do figurino"><button type="button" class="icon-btn" data-crm="${i}" aria-label="Apagar figurino">${ICON.trash}</button></div>
          <textarea data-cnotes="${i}" rows="2" placeholder="Peças, cores, tecidos, cenas onde entra…">${esc(x.notes || '')}</textarea>
          <div class="row between"><span class="label">Referências</span><button type="button" class="link-btn small" data-cph="${i}">${ICON.plus} Fotos</button></div>
          <div class="photo-grid wr-photos" data-cdrop="${i}">${(x.photos || []).map((ph, j) => img(ph, `${i}:${j}`, 'data-cphrm')).join('') || '<p class="muted small">Larga aqui fotos de referência, ou cola com Ctrl+V depois de carregares neste figurino.</p>'}</div>
        </article>`).join('') : '<div class="empty-box"><p>Ainda não há figurinos.</p><p class="muted small">Cria o "Figurino 1" e junta-lhe as fotos de referência.</p></div>'}
      </section>
    </div>
    <section class="panel stack">
      <div class="row between"><h2 class="h3">Provas de guarda-roupa</h2><button type="button" class="btn ghost" data-fadd>${ICON.plus} Fotos</button></div>
      <div class="photo-grid wr-fit" data-fdrop>${w.fittings.map((ph, i) => `<figure>${urls[ph.path] ? `<img src="${esc(urls[ph.path])}" alt="" loading="lazy">` : ''}<input class="wr-cap" data-fcap="${i}" value="${esc(ph.caption || '')}" placeholder="Legenda (figurino, data…)" aria-label="Legenda"><button type="button" class="icon-btn sm" data-frm="${i}" aria-label="Tirar foto">${ICON.close}</button></figure>`).join('') || '<p class="muted small">Fotos das provas com o ator vestido. Larga-as aqui ou cola com Ctrl+V.</p>'}</div>
    </section>`;

  // moodboard: cria-se na primeira vez (um board próprio, fora da lista de ferramentas)
  main.querySelector('[data-mood]').addEventListener('click', async () => {
    let bid = w.board_id;
    if (bid) { const { data: ex } = await sb.from('boards').select('id').eq('id', bid).maybeSingle(); if (!ex) bid = null; }
    if (!bid) {
      const grp = (p.departments || []).find((d) => d.id === 'arte') ? 'arte' : null;
      const { data: b, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'wrd', title: `Moodboard (${title})`, group_id: grp, data: { character_id: c.id } }).select('id').single();
      if (error) return toast(error.message);
      w.board_id = b.id; await saveNow(); bid = b.id;
    }
    location.hash = `${base}/b/${bid}`;
  });
  // medidas
  main.querySelectorAll('[data-m]').forEach((el) => el.addEventListener('input', () => { w.measures[el.dataset.m] = el.value; save(); }));
  main.querySelector('[data-xadd]').addEventListener('click', async () => { w.extraMeasures = [...(w.extraMeasures || []), { name: 'Medida', value: '' }]; await saveNow(); redraw(); });
  main.querySelectorAll('[data-xn]').forEach((el) => el.addEventListener('input', () => { w.extraMeasures[+el.dataset.xn].name = el.value; save(); }));
  main.querySelectorAll('[data-xv]').forEach((el) => el.addEventListener('input', () => { w.extraMeasures[+el.dataset.xv].value = el.value; save(); }));
  main.querySelectorAll('[data-xrm]').forEach((b) => b.addEventListener('click', async () => { w.extraMeasures.splice(+b.dataset.xrm, 1); await saveNow(); redraw(); }));
  // figurinos
  main.querySelector('[data-cadd]').addEventListener('click', async () => { w.costumes.push({ id: uid(), name: `Figurino ${w.costumes.length + 1}`, notes: '', photos: [] }); await saveNow(); redraw(); requestAnimationFrame(() => { const el = main.querySelector(`[data-cname="${w.costumes.length - 1}"]`); el?.focus(); el?.select(); }); });
  main.querySelectorAll('[data-cname]').forEach((el) => el.addEventListener('input', () => { w.costumes[+el.dataset.cname].name = el.value; save(); }));
  main.querySelectorAll('[data-cnotes]').forEach((el) => el.addEventListener('input', () => { w.costumes[+el.dataset.cnotes].notes = el.value; save(); }));
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
  main.querySelector('[data-fadd]').addEventListener('click', () => pick(toFit));
  const fd = main.querySelector('[data-fdrop]');
  fd.addEventListener('dragover', (e) => e.preventDefault()); fd.addEventListener('drop', (e) => { e.preventDefault(); upload(e.dataTransfer.files, toFit); });
  fd.closest('.panel').addEventListener('pointerdown', () => { target = toFit; main.querySelectorAll('.wr-cost').forEach((x) => x.classList.remove('on')); });
  main.querySelectorAll('[data-fcap]').forEach((el) => el.addEventListener('input', () => { w.fittings[+el.dataset.fcap].caption = el.value; save(); }));
  main.querySelectorAll('[data-frm]').forEach((b) => b.addEventListener('click', async () => { w.fittings.splice(+b.dataset.frm, 1); await saveNow(); redraw(); }));
  const onPaste = (e) => {
    if (!document.body.contains(fd)) { document.removeEventListener('paste', onPaste); return; }
    if (e.target.closest?.('input, textarea') || document.querySelector('#modal .modal')) return;
    const files = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/')); if (!files.length) return;
    e.preventDefault(); upload(files, target || (w.costumes.length ? toCostume(w.costumes.length - 1) : toFit));
  };
  document.addEventListener('paste', onPaste); cleanup(() => document.removeEventListener('paste', onPaste));
}
