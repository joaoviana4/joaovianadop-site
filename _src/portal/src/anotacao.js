import { sb, esc, toast, modal, ICON, uploadImage, signedUrls, confirmBox, BUCKET } from './lib.js';
import { shootDays } from './shootdays.js';

// Folhas de Anotação (etapa Produção). A anotadora carrega as fotos (ou PDFs) das folhas de cada dia; o studio
// guarda-as, o Claude lê a letra manuscrita (de graça, na conta Claude de quem está a usar: copiar o pedido,
// arrastar as fotos, colar a resposta) e tudo fica organizado por cena, plano e take para a montagem.
// Cada plano mostra a informação em digital e, ao lado, a foto da folha original.
// Tabela annotation_sheets: { n (nº de identificação no projeto), day, date, image_path, file_name, status, data }.
// status: 'novo' (por ler) → 'lido' (lido pelo Claude, por rever) → 'revisto'.

const FIELDS = [
  ['folha', 'Folha nº'], ['data', 'Data'], ['cena', 'Cena'], ['plano', 'Plano'], ['decor', 'Décor'], ['efeito', 'Efeito'],
  ['cartao', 'Cartão / K7'], ['camara', 'Câmara'], ['objetiva', 'Objetiva'], ['filtro', 'Filtro'], ['diafragma', 'Diafragma'],
  ['nd', 'ND'], ['som', 'Som'], ['fps', 'FPS'], ['altura', 'Altura'], ['movimento', 'Movimento'], ['distancia', 'Distância / enquadramento'],
];
const TAKE_COLS = [['take', 'Take'], ['clip', 'Clip'], ['tc_in', 'TC in'], ['tc_out', 'TC out'], ['min', 'Minut.'], ['obs', 'Observações']];
const STATUS = { novo: ['Por ler', 'st-new'], lido: ['Por rever', 'st-read'], revisto: ['Revista', 'st-ok'] };
const BATCH = 15;
const norm = (v) => String(v ?? '').trim();
const natural = (a, b) => String(a).localeCompare(String(b), 'pt', { numeric: true, sensitivity: 'base' });
const planKey = (d) => `${norm(d.cena) || '?'}|${norm(d.plano) || '?'}`;
const fmtDate = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); };
const idTag = (n) => `ID ${String(n).padStart(3, '0')}`;

async function load(p) {
  const { data, error } = await sb.from('annotation_sheets').select('*').eq('project_id', p.id).order('n');
  if (error) throw error;
  return data || [];
}

// ---------- página ----------
export async function anotacaoPage(main, p, base, sub) {
  main.innerHTML = '<p class="muted">A abrir as folhas de anotação…</p>';
  let sheets;
  try { sheets = await load(p); } catch (e) { main.innerHTML = `<h1 class="h1">Folhas de Anotação</h1><p class="auth-err">Não foi possível abrir: ${esc(e.message)}</p>`; return; }
  const urls = await signedUrls(sheets.map((s) => s.image_path).filter(Boolean));
  const home = `${base}/anotacao`;
  const st = { view: 'plano' };
  try { st.view = localStorage.getItem('bg-anot-view') || 'plano'; } catch { /* nada */ }

  if (sub && sub.startsWith('p:')) return planView(main, p, home, sheets, urls, decodeURIComponent(sub.slice(2)));
  if (sub) { const s = sheets.find((x) => x.id === sub); if (s) return sheetView(main, p, home, sheets, urls, s); }

  const draw = () => {
    const toRead = sheets.filter((s) => s.status === 'novo');
    const toReview = sheets.filter((s) => s.status === 'lido');
    main.innerHTML = `<div class="row between wrap-gap"><div><span class="small muted">Produção</span><h1 class="h1">Folhas de Anotação</h1></div>
        <div class="row wrap-gap"><button type="button" class="btn ghost" data-models>${ICON.note} Modelos para imprimir</button>
          ${sheets.length ? `<button type="button" class="btn ghost" data-export>${ICON.open} Exportar para a montagem</button>` : ''}
          <button type="button" class="btn ${toRead.length ? 'ghost' : 'primary'}" data-up>${ICON.plus} Carregar folhas</button>
          ${toRead.length ? `<button type="button" class="btn primary" data-read>Ler com o Claude (${toRead.length})</button>` : ''}</div></div>
      ${sheets.length ? `<div class="an-stats"><span><b>${sheets.length}</b> ${sheets.length === 1 ? 'folha' : 'folhas'}</span>${toRead.length ? `<span class="st-new"><b>${toRead.length}</b> por ler</span>` : ''}${toReview.length ? `<span class="st-read"><b>${toReview.length}</b> por rever</span>` : ''}<span><b>${new Set(sheets.filter((s) => s.status !== 'novo').map((s) => planKey(s.data))).size}</b> planos</span><span><b>${sheets.reduce((n, s) => n + (s.data?.takes?.length || 0), 0)}</b> takes</span></div>
        <div class="seg an-seg" role="tablist" aria-label="Organizar"><button type="button" role="tab" aria-selected="${st.view === 'plano'}" data-view="plano">Por cena e plano</button><button type="button" role="tab" aria-selected="${st.view === 'dia'}" data-view="dia">Por dia</button></div>
        <div data-body></div>`
      : `<div class="empty-box"><p><b>Carrega as fotos das folhas de anotação de cada dia.</b></p><p class="muted small">Tira uma foto a cada folha (ou junta o PDF), carrega-as aqui e lê-as com o Claude. O studio organiza tudo por cena, plano e take, com a foto da folha ao lado, pronto para a montagem.</p><button type="button" class="btn primary" data-up2>${ICON.plus} Carregar folhas</button></div>`}`;
    const body = main.querySelector('[data-body]');
    if (body) body.innerHTML = st.view === 'dia' ? dayHtml() : planHtml();
    bind();
  };
  const thumb = (s) => `<a class="an-th" href="${home}/${s.id}" title="${esc(idTag(s.n))}${s.data?.cena ? ` · Cena ${esc(s.data.cena)} plano ${esc(s.data.plano || '?')}` : ''}">
      ${urls[s.image_path] ? `<img src="${esc(urls[s.image_path])}" alt="" loading="lazy">` : '<span class="an-noimg"></span>'}
      <span class="an-badge ${STATUS[s.status]?.[1] || ''}">${esc(STATUS[s.status]?.[0] || '')}</span>
      <span class="an-cap"><b>${s.data?.cena ? `${esc(s.data.cena)} / ${esc(s.data.plano || '?')}` : esc(idTag(s.n))}</b><small>${s.data?.takes?.length ? `${s.data.takes.length} takes` : s.data?.folha ? `folha ${esc(s.data.folha)}` : ''}</small></span></a>`;
  const dayHtml = () => {
    const groups = new Map();
    sheets.forEach((s) => { const k = s.date || s.day || ''; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(s); });
    return [...groups.entries()].sort(([a], [b]) => (a || '9999').localeCompare(b || '9999')).map(([k, list]) => `<section class="an-day"><h2 class="h3">${k ? (list[0].day ? `Dia ${esc(list[0].day)} · ` : '') + esc(list[0].date ? fmtDate(list[0].date) : '') : 'Sem dia'}<span class="muted small"> · ${list.length} ${list.length === 1 ? 'folha' : 'folhas'}</span></h2><div class="an-grid">${list.map(thumb).join('')}</div></section>`).join('');
  };
  const planHtml = () => {
    const read = sheets.filter((s) => s.status !== 'novo');
    const novo = sheets.filter((s) => s.status === 'novo');
    const scenes = new Map();
    read.forEach((s) => { const c = norm(s.data?.cena) || '?'; const pk = planKey(s.data); if (!scenes.has(c)) scenes.set(c, new Map()); const m = scenes.get(c); if (!m.has(pk)) m.set(pk, []); m.get(pk).push(s); });
    return `${novo.length ? `<div class="an-pending"><p class="small"><b>${novo.length} ${novo.length === 1 ? 'folha por ler' : 'folhas por ler'}.</b> Depois de lidas aparecem aqui, por cena e plano.</p><div class="an-grid sm">${novo.map(thumb).join('')}</div></div>` : ''}
      ${[...scenes.entries()].sort(([a], [b]) => natural(a, b)).map(([c, plans]) => `<section class="an-scene"><h2 class="h3">Cena ${esc(c)}</h2>
        <div class="an-plans">${[...plans.entries()].sort(([a], [b]) => natural(a.split('|')[1], b.split('|')[1])).map(([pk, list]) => {
          const takes = list.flatMap((s) => s.data?.takes || []); const good = takes.filter((t) => t.bom).map((t) => t.take).filter(Boolean);
          const d0 = list[0].data || {}; const review = list.some((s) => s.status === 'lido'); const doubts = list.reduce((n, s) => n + (s.data?.duvidas?.length || 0), 0);
          return `<a class="an-plan" href="${home}/p:${encodeURIComponent(pk)}">
            <span class="an-pimg">${urls[list[0].image_path] ? `<img src="${esc(urls[list[0].image_path])}" alt="" loading="lazy">` : ''}</span>
            <span class="an-pmain"><b>Plano ${esc(pk.split('|')[1])}</b><small class="muted">${esc([d0.distancia, d0.movimento, d0.objetiva].filter(Boolean).join(' · ') || d0.decor || '')}</small>
              <small>${takes.length} ${takes.length === 1 ? 'take' : 'takes'}${good.length ? ` · bom: ${esc(good.join(', '))}` : ''}${list.length > 1 ? ` · ${list.length} folhas` : ''}</small></span>
            <span class="an-pflags">${review ? '<span class="an-badge st-read">Por rever</span>' : '<span class="an-badge st-ok">Revista</span>'}${doubts ? `<span class="an-badge st-new" title="Coisas que o Claude não conseguiu ler com certeza">${doubts} ${doubts === 1 ? 'dúvida' : 'dúvidas'}</span>` : ''}</span></a>`;
        }).join('')}</div></section>`).join('') || (novo.length ? '' : '<p class="muted">Ainda não há folhas lidas.</p>')}`;
  };
  const bind = () => {
    main.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => { st.view = b.dataset.view; try { localStorage.setItem('bg-anot-view', st.view); } catch { /* nada */ } draw(); }));
    main.querySelectorAll('[data-up], [data-up2]').forEach((b) => b.addEventListener('click', () => uploadModal(p, sheets, () => anotacaoPage(main, p, base))));
    main.querySelector('[data-read]')?.addEventListener('click', () => readModal(p, sheets.filter((s) => s.status === 'novo'), urls, () => anotacaoPage(main, p, base)));
    main.querySelector('[data-models]')?.addEventListener('click', () => modelsModal(p));
    main.querySelector('[data-export]')?.addEventListener('click', () => exportModal(p, sheets));
  };
  draw();
}

// ---------- um plano: digital + fotos das folhas ----------
function planView(main, p, home, sheets, urls, pk) {
  const list = sheets.filter((s) => s.status !== 'novo' && planKey(s.data) === pk);
  if (!list.length) { location.hash = home; return; }
  const [c, pl] = pk.split('|');
  const all = sheets.filter((s) => s.status !== 'novo').map((s) => planKey(s.data)).filter((v, i, a) => a.indexOf(v) === i)
    .sort((a, b) => natural(a.split('|')[0], b.split('|')[0]) || natural(a.split('|')[1], b.split('|')[1]));
  const i = all.indexOf(pk);
  main.innerHTML = `<div class="row between wrap-gap"><div><a class="small" href="${home}">${ICON.back} Folhas de Anotação</a><h1 class="h1">Cena ${esc(c)} · Plano ${esc(pl)}</h1></div>
      <div class="row">${i > 0 ? `<a class="btn ghost" href="${home}/p:${encodeURIComponent(all[i - 1])}" aria-label="Plano anterior">${ICON.back}</a>` : ''}${i < all.length - 1 ? `<a class="btn ghost" href="${home}/p:${encodeURIComponent(all[i + 1])}" aria-label="Plano seguinte">${ICON.chev}</a>` : ''}</div></div>
    ${list.map((s) => `<div data-sheet="${s.id}"></div>`).join('')}`;
  list.forEach((s) => sheetEditor(main.querySelector(`[data-sheet="${s.id}"]`), p, s, urls, home, () => planView(main, p, home, sheets, urls, planKey(s.data))));
}
function sheetView(main, p, home, sheets, urls, s) {
  main.innerHTML = `<div class="row between wrap-gap"><div><a class="small" href="${home}">${ICON.back} Folhas de Anotação</a><h1 class="h1">${s.data?.cena ? `Cena ${esc(s.data.cena)} · Plano ${esc(s.data.plano || '?')}` : esc(idTag(s.n))}</h1></div></div><div data-sheet></div>`;
  sheetEditor(main.querySelector('[data-sheet]'), p, s, urls, home, () => sheetView(main, p, home, sheets, urls, s));
}

function sheetEditor(box, p, s, urls, home, redraw) {
  const d = s.data || (s.data = {});
  d.takes ||= [];
  let timer;
  const save = (patch = {}) => { clearTimeout(timer); timer = setTimeout(async () => {
    const row = { data: s.data, updated_at: new Date().toISOString(), ...patch };
    const { error } = await sb.from('annotation_sheets').update(row).eq('id', s.id);
    if (error) toast('Não foi possível guardar: ' + error.message); else Object.assign(s, patch);
  }, patch.status ? 0 : 600); };
  const img = urls[s.image_path];
  const draw = () => {
    box.innerHTML = `<section class="an-sheet">
      <div class="an-digital">
        <div class="row between wrap-gap"><span class="small muted">${esc(idTag(s.n))}${s.date ? ` · ${esc(fmtDate(s.date))}` : ''}${s.day ? ` · Dia ${esc(s.day)}` : ''}${s.file_name ? ` · ${esc(s.file_name)}` : ''}</span>
          <span class="row">${s.status === 'novo' ? '<span class="an-badge st-new">Por ler</span>' : s.status === 'lido' ? '<button type="button" class="btn primary sm" data-ok>Marcar como revista</button>' : '<span class="an-badge st-ok">Revista</span><button type="button" class="link-btn" data-unok>Voltar a rever</button>'}
          <button type="button" class="icon-btn sm" data-del aria-label="Apagar esta folha" title="Apagar esta folha">${ICON.trash}</button></span></div>
        ${d.duvidas?.length ? `<div class="an-doubts"><b>Confirma na foto:</b><ul>${d.duvidas.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
        <div class="an-fields">${FIELDS.map(([k, l]) => `<label class="an-f"><span>${esc(l)}</span><input data-k="${k}" value="${esc(d[k] ?? '')}" autocomplete="off"></label>`).join('')}</div>
        <div class="an-takes-wrap"><table class="an-takes"><thead><tr><th class="an-bom" title="Take bom (escolhido)">Bom</th>${TAKE_COLS.map(([, l]) => `<th>${esc(l)}</th>`).join('')}<th></th></tr></thead><tbody>
          ${d.takes.map((t, i) => `<tr class="${t.bom ? 'good' : ''}"><td class="an-bom"><button type="button" class="an-star ${t.bom ? 'on' : ''}" data-bom="${i}" aria-pressed="${!!t.bom}" aria-label="Take bom">${t.bom ? '★' : '☆'}</button></td>${TAKE_COLS.map(([k]) => `<td>${k === 'obs' ? `<textarea rows="1" data-t="${i}:${k}">${esc(t[k] ?? '')}</textarea>` : `<input data-t="${i}:${k}" value="${esc(t[k] ?? '')}">`}</td>`).join('')}<td><button type="button" class="icon-btn sm" data-rmt="${i}" aria-label="Tirar take">${ICON.close}</button></td></tr>`).join('')}
        </tbody></table><button type="button" class="link-btn" data-addt>+ Take</button></div>
        <label class="an-f wide"><span>Diálogos</span><textarea rows="3" data-k="dialogos">${esc(d.dialogos ?? '')}</textarea></label>
        <label class="an-f wide"><span>Descrição do plano</span><textarea rows="4" data-k="descricao">${esc(d.descricao ?? '')}</textarea></label>
      </div>
      <figure class="an-photo">${img ? `<button type="button" class="an-zoom" data-zoom aria-label="Ver a folha em grande"><img src="${esc(img)}" alt="Foto da folha de anotação ${esc(idTag(s.n))}"></button><figcaption class="small muted">Folha original · clica para ver em grande</figcaption>` : '<p class="muted small">Sem foto.</p>'}</figure>
    </section>`;
    const fit = (t) => { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; };
    requestAnimationFrame(() => box.querySelectorAll('textarea').forEach(fit));
    box.querySelectorAll('[data-k]').forEach((el) => el.addEventListener('input', () => { d[el.dataset.k] = el.value; if (el.tagName === 'TEXTAREA') fit(el); save(); }));
    box.querySelectorAll('[data-k="cena"], [data-k="plano"]').forEach((el) => el.addEventListener('change', () => toast('Cena/plano mudados. A folha passa para esse plano na lista.')));
    box.querySelectorAll('[data-t]').forEach((el) => el.addEventListener('input', () => { const [i, k] = el.dataset.t.split(':'); d.takes[+i][k] = el.value; if (el.tagName === 'TEXTAREA') fit(el); save(); }));
    box.querySelectorAll('[data-bom]').forEach((b) => b.addEventListener('click', () => { const t = d.takes[+b.dataset.bom]; t.bom = !t.bom; save(); draw(); }));
    box.querySelectorAll('[data-rmt]').forEach((b) => b.addEventListener('click', () => { d.takes.splice(+b.dataset.rmt, 1); save(); draw(); }));
    box.querySelector('[data-addt]').addEventListener('click', () => { const last = d.takes[d.takes.length - 1]; d.takes.push({ take: last && /^\d+$/.test(last.take) ? String(+last.take + 1) : '', clip: '', tc_in: '', tc_out: '', min: '', obs: '', bom: false }); save(); draw(); });
    box.querySelector('[data-ok]')?.addEventListener('click', () => { if (d.duvidas?.length) d.duvidas = []; save({ status: 'revisto' }); s.status = 'revisto'; draw(); toast('Folha revista.'); });
    box.querySelector('[data-unok]')?.addEventListener('click', () => { save({ status: 'lido' }); s.status = 'lido'; draw(); });
    box.querySelector('[data-del]').addEventListener('click', async () => {
      if (!(await confirmBox(`Apagar a folha ${idTag(s.n)} e a foto?`, 'Apagar'))) return;
      const { error } = await sb.from('annotation_sheets').delete().eq('id', s.id); if (error) return toast(error.message);
      if (s.image_path) sb.storage.from(BUCKET).remove([s.image_path]).catch(() => {});
      toast('Folha apagada.'); location.hash = home;
    });
    box.querySelector('[data-zoom]')?.addEventListener('click', () => zoom(img));
  };
  draw();
  void redraw;
}

function zoom(src) {
  const m = modal(`<div class="an-zoomer" data-z><img src="${esc(src)}" alt="Folha de anotação"></div><div class="row between"><span class="muted small">Roda do rato ou dois dedos para aproximar; arrasta para mover.</span><button type="button" class="btn ghost" data-close>Fechar</button></div>`, { wide: true });
  const z = m.el.querySelector('[data-z]'), im = z.querySelector('img');
  let k = 1, x = 0, y = 0, drag = null;
  const ap = () => { im.style.transform = `translate(${x}px, ${y}px) scale(${k})`; };
  z.addEventListener('wheel', (e) => { e.preventDefault(); k = Math.max(1, Math.min(6, k * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); if (k === 1) { x = 0; y = 0; } ap(); }, { passive: false });
  z.addEventListener('pointerdown', (e) => { drag = [e.clientX - x, e.clientY - y]; z.setPointerCapture(e.pointerId); });
  z.addEventListener('pointermove', (e) => { if (!drag) return; x = e.clientX - drag[0]; y = e.clientY - drag[1]; ap(); });
  z.addEventListener('pointerup', () => { drag = null; });
  z.addEventListener('dblclick', () => { k = k > 1 ? 1 : 2.5; if (k === 1) { x = 0; y = 0; } ap(); });
}

// ---------- carregar fotos / PDFs ----------
async function pdfPages(file) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i); const vp = page.getViewport({ scale: 2.2 });
    const cv = document.createElement('canvas'); cv.width = vp.width; cv.height = vp.height;
    await page.render({ canvasContext: cv.getContext('2d'), viewport: vp }).promise;
    const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
    out.push(new File([blob], `${file.name.replace(/\.pdf$/i, '')} p${i}.jpg`, { type: 'image/jpeg' }));
  }
  return out;
}
async function uploadModal(p, sheets, after) {
  const days = await shootDays(p).catch(() => []);
  const today = new Date().toISOString().slice(0, 10);
  const guess = days.find((d) => d.date === today) || days.filter((d) => d.date && d.date <= today).pop() || days[0];
  const m = modal(`<h2>Carregar folhas de anotação</h2>
    <form class="stack">
      <div class="field"><label for="an-day">Dia de rodagem</label>
        ${days.length ? `<select id="an-day">${days.map((d, i) => `<option value="${i}" ${d === guess ? 'selected' : ''}>Dia ${esc(d.day)}${d.date ? ` · ${esc(fmtDate(d.date))}` : ''}${d.place ? ` · ${esc(d.place)}` : ''}</option>`).join('')}<option value="x">Outra data…</option></select>` : ''}
        <input id="an-date" type="date" value="${esc(guess?.date || today)}" ${days.length ? 'hidden' : ''} aria-label="Data"></div>
      <label class="an-drop" data-drop><input type="file" accept="image/*,application/pdf" multiple hidden data-file><span><b>Escolhe as fotos ou os PDFs</b><br><span class="muted small">Ou arrasta-os para aqui. Uma folha por foto; um PDF com várias páginas conta uma folha por página.</span></span></label>
      <p class="muted small" data-picked></p>
      <p class="muted small">Dica para ler bem: foto de cima, com a folha inteira, sem sombras e com boa luz.</p>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary" data-go disabled>Carregar</button></div>
    </form>`);
  let files = [];
  const sel = m.el.querySelector('#an-day'), di = m.el.querySelector('#an-date');
  sel?.addEventListener('change', () => { di.hidden = sel.value !== 'x'; if (sel.value !== 'x') di.value = days[+sel.value].date || ''; });
  const pick = (list) => { files = [...list].filter((f) => f.type.startsWith('image/') || f.type === 'application/pdf'); m.el.querySelector('[data-picked]').textContent = files.length ? `${files.length} ${files.length === 1 ? 'ficheiro escolhido' : 'ficheiros escolhidos'}.` : ''; m.el.querySelector('[data-go]').disabled = !files.length; };
  m.el.querySelector('[data-file]').addEventListener('change', (e) => pick(e.target.files));
  const drop = m.el.querySelector('[data-drop]');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); pick(e.dataTransfer.files); });
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = m.el.querySelector('[data-go]'); btn.disabled = true;
    const d = sel && sel.value !== 'x' ? days[+sel.value] : null;
    const date = d ? d.date || null : di.value || null, day = d ? d.day : null;
    let imgs = [];
    try { for (const f of files) imgs.push(...(f.type === 'application/pdf' ? await pdfPages(f) : [f])); } catch (err) { btn.disabled = false; return toast('Não foi possível abrir o PDF: ' + err.message); }
    imgs = imgs.sort((a, b) => natural(a.name, b.name));
    let n = sheets.reduce((x, s) => Math.max(x, s.n), 0), ok = 0;
    for (const f of imgs) {
      btn.textContent = `A carregar ${ok + 1} de ${imgs.length}…`;
      try {
        const up = await uploadImage(p.id, 'anotacao', f);
        n += 1;
        const { error } = await sb.from('annotation_sheets').insert({ project_id: p.id, n, day, date, image_path: up.path, file_name: f.name, status: 'novo', data: {} });
        if (error) throw error; ok += 1;
      } catch (err) { toast(`Falhou ${f.name}: ${err.message}`, 6000); }
    }
    m.close();
    toast(ok ? `${ok} ${ok === 1 ? 'folha carregada' : 'folhas carregadas'}. Agora lê-as com o Claude.` : 'Nenhuma folha carregada.');
    after();
  });
}

// ---------- ler com o Claude (grátis, na conta Claude de quem usa) ----------
// As fotos descarregam-se com uma faixa "ID 007" por cima, para o Claude dizer de que foto é cada resposta.
async function stamped(url, n) {
  const blob = await (await fetch(url)).blob();
  const bmp = await createImageBitmap(blob);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k), band = Math.max(70, Math.round(w * 0.06));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h + band;
  const c = cv.getContext('2d');
  c.fillStyle = '#FFE14D'; c.fillRect(0, 0, w, band);
  c.fillStyle = '#000'; c.font = `bold ${Math.round(band * 0.62)}px Arial, sans-serif`; c.textBaseline = 'middle';
  c.fillText(idTag(n), Math.round(band * 0.3), band / 2);
  c.drawImage(bmp, 0, band, w, h);
  return new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9));
}
async function contextFor(p) {
  const [{ data: chars }, { data: locs }, { data: scenes }] = await Promise.all([
    sb.from('characters').select('name, actor').eq('project_id', p.id),
    sb.from('locations').select('name').eq('project_id', p.id),
    sb.from('scenes').select('number, heading').eq('project_id', p.id).order('position').limit(300),
  ]);
  return {
    chars: (chars || []).map((c) => [c.name, c.actor].filter(Boolean).join(' / ')).filter(Boolean),
    locs: (locs || []).map((l) => l.name).filter(Boolean),
    scenes: (scenes || []).map((s) => s.number).filter(Boolean),
  };
}
function buildPrompt(p, list, ctx) {
  return `És anotador(a) de cinema e vais passar para digital folhas de anotação de rodagem, muitas escritas à mão em português de Portugal.
Junto a esta mensagem vão ${list.length} fotos. Cada foto tem uma faixa amarela no topo com um código "ID nnn" (ex: ID 007). Esse código não faz parte da folha: serve só para identificares a foto.

Projeto: ${p.name}
${ctx.chars.length ? `Personagens / atores (usa estas grafias quando aparecerem): ${ctx.chars.join('; ')}\n` : ''}${ctx.locs.length ? `Décors do projeto: ${ctx.locs.join('; ')}\n` : ''}${ctx.scenes.length ? `Números de cena que existem: ${ctx.scenes.join(', ')}\n` : ''}
Como ler:
- Transcreve o que está escrito, sem inventar. Os modelos de folha variam: procura cada campo pelo rótulo (Cena, Plano, Take, Clip, TC, Minutagem, Objetiva, Filtro, Diafragma, ND, Som, FPS, Movimento, Distância, Décor, Efeito, Cartão/K7, Câmara, Altura, Data, Folha nº).
- "Cena/Plano" escrito junto (ex: 12/3 ou 12-3) separa-se em cena 12 e plano 3.
- Efeito: escreve como na folha (ex: "INT | NOITE"). Se houver opções impressas (Dia/Noite, Int/Ext) usa só as que estão assinaladas.
- Takes: uma linha por take, pela ordem da folha. Um take rodeado com círculo, com visto, com "OK", "B", "bom", "print" ou estrela é bom: "bom": true.
- Minutagem e timecodes tal como escritos (ex: 01:14, 00:12:03:10).
- Observações do take: o texto completo dessa linha, mesmo que continue em várias linhas.
- Diálogos e Descrição do plano: o texto completo; se a folha só tiver uma caixa "Diálogos + descrição", põe tudo em "descricao". Se houver um croqui (desenho), escreve "[croqui]" e descreve-o numa frase.
- Se não tens a certeza de uma palavra ou número, escreve a tua melhor leitura seguida de (?) e junta uma nota curta em "duvidas", ex: "Take 3: minutagem 00:58 ou 00:38".
- Campos vazios ficam "".

Formato da resposta (obrigatório): só um bloco de código json com uma lista, um objeto por foto, e no fim, fora do bloco, a palavra FIM.
\`\`\`json
[{"id":"ID 007","folha":"74","data":"04/06/2025","cena":"2","plano":"2","decor":"","efeito":"INT | NOITE","cartao":"A010","camara":"A","objetiva":"50 mm","filtro":"","diafragma":"","nd":"","som":"","fps":"25","altura":"","movimento":"","distancia":"","takes":[{"take":"1","clip":"C001","tc_in":"","tc_out":"","min":"01:14","obs":"","bom":false}],"dialogos":"","descricao":"","duvidas":[]}]
\`\`\`
FIM`;
}
export function parseReply(txt, list) {
  if (/Formato da resposta \(obrigat/.test(txt)) throw new Error('Isto é o pedido, não a resposta. Cola a resposta do Claude.');
  const m = txt.match(/```(?:json)?\s*([\s\S]*?)```/i);
  let raw = (m ? m[1] : txt).trim();
  const a = raw.indexOf('['), b = raw.lastIndexOf(']');
  if (a < 0 || b < a) throw new Error('Não encontrei a lista na resposta. Copia a resposta inteira do Claude, com o bloco de código.');
  raw = raw.slice(a, b + 1);
  let arr; try { arr = JSON.parse(raw); } catch { throw new Error('A resposta está incompleta ou cortada. Pede ao Claude "continua" e cola tudo.'); }
  if (!Array.isArray(arr)) throw new Error('A resposta não tem o formato esperado.');
  const byN = new Map(list.map((s) => [s.n, s]));
  const out = []; const used = new Set();
  arr.forEach((o, i) => {
    const n = Number(String(o.id || '').replace(/\D/g, ''));
    let s = byN.get(n);
    if (!s || used.has(s.id)) s = list.find((x, j) => j === i && !used.has(x.id)); // sem ID: pela ordem das fotos
    if (!s) return;
    used.add(s.id);
    const d = {};
    FIELDS.forEach(([k]) => { d[k] = norm(o[k]); });
    d.takes = (Array.isArray(o.takes) ? o.takes : []).map((t) => ({ take: norm(t.take), clip: norm(t.clip), tc_in: norm(t.tc_in), tc_out: norm(t.tc_out), min: norm(t.min), obs: norm(t.obs), bom: t.bom === true || t.bom === 'true' }));
    d.dialogos = norm(o.dialogos); d.descricao = norm(o.descricao);
    d.duvidas = (Array.isArray(o.duvidas) ? o.duvidas : []).map(norm).filter(Boolean);
    out.push([s, d]);
  });
  if (!out.length) throw new Error('Nenhuma das respostas corresponde às fotos deste lote. Confirma que colaste a resposta certa.');
  return out;
}
function readModal(p, pending, urls, after) {
  const lots = []; for (let i = 0; i < pending.length; i += BATCH) lots.push(pending.slice(i, i + BATCH));
  let li = 0, total = 0, doubts = 0;
  const m = modal('<div data-an></div>', { wide: true });
  const box = m.el.querySelector('[data-an]');
  const step = async () => {
    const list = lots[li];
    const ctx = await contextFor(p).catch(() => ({ chars: [], locs: [], scenes: [] }));
    const prompt = buildPrompt(p, list, ctx);
    box.innerHTML = `<h2>Ler as folhas com o Claude${lots.length > 1 ? ` — lote ${li + 1} de ${lots.length}` : ''}</h2>
      <p class="muted small">Grátis, com a tua conta do Claude. ${list.length} ${list.length === 1 ? 'folha' : 'folhas'} neste lote (${list.map((s) => idTag(s.n)).join(', ')}).${lots.length > 1 ? ' Cada lote vai numa conversa nova.' : ''}</p>
      <ol class="an-steps">
        <li><strong>Descarrega as fotos deste lote.</strong> Vêm com uma faixa amarela "ID" por cima, para o Claude saber qual é qual. <button type="button" class="btn ghost" data-dl>${ICON.open} Descarregar ${list.length} ${list.length === 1 ? 'foto' : 'fotos'}</button><span class="muted small" data-dlst></span></li>
        <li><strong>Copia o pedido.</strong> <button type="button" class="btn ghost" data-copy>${ICON.copy} Copiar o pedido</button><textarea class="mono" rows="3" readonly hidden data-ptext>${esc(prompt)}</textarea></li>
        <li><strong>Abre uma conversa nova no Claude, cola o pedido e arrasta as fotos descarregadas</strong> para a mesma mensagem. Envia e espera até aparecer FIM. <a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">${ICON.open} Abrir o Claude</a></li>
        <li><strong>Traz a resposta.</strong> Copia a resposta inteira e cola aqui.<textarea class="mono" rows="6" data-ans placeholder="Cola aqui a resposta do Claude…"></textarea><button type="button" class="link-btn" data-pastebtn>Colar o que copiei</button></li>
      </ol><p class="auth-err" hidden data-err></p>
      <div class="row end"><button type="button" class="btn ghost" data-close>Fechar</button><button type="button" class="btn primary" data-go>Ler a resposta</button></div>`;
    box.querySelector('[data-close]').onclick = () => { m.close(); if (total) after(); };
    box.querySelector('[data-dl]').onclick = async (e) => {
      const b = e.currentTarget, stx = box.querySelector('[data-dlst]'); b.disabled = true;
      for (let i = 0; i < list.length; i++) {
        stx.textContent = ` ${i + 1} de ${list.length}…`;
        try {
          const url = urls[list[i].image_path] || (await signedUrls([list[i].image_path]))[list[i].image_path];
          const blob = await stamped(url, list[i].n);
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `anotacao-${idTag(list[i].n).replace(' ', '')}.jpg`; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 4000);
          await new Promise((r) => setTimeout(r, 350));
        } catch (err) { toast(`Não foi possível preparar ${idTag(list[i].n)}: ${err.message}`); }
      }
      stx.textContent = ' Prontas, na pasta de transferências. Se o browser perguntar, deixa descarregar vários ficheiros.'; b.disabled = false;
    };
    box.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(prompt); toast('Pedido copiado.'); } catch { const ta = box.querySelector('[data-ptext]'); ta.hidden = false; ta.select(); toast('Seleciona e copia o texto da caixa.'); } };
    box.querySelector('[data-pastebtn]').onclick = async () => { try { box.querySelector('[data-ans]').value = await navigator.clipboard.readText(); } catch { toast('O browser não deixou colar. Usa Ctrl + V na caixa.'); } };
    box.querySelector('[data-go]').onclick = async () => {
      const err = box.querySelector('[data-err]'); err.hidden = true;
      let res; try { res = parseReply(box.querySelector('[data-ans]').value, list); } catch (e) { err.textContent = e.message; err.hidden = false; return; }
      for (const [s, d] of res) {
        const { error } = await sb.from('annotation_sheets').update({ data: d, status: 'lido', updated_at: new Date().toISOString() }).eq('id', s.id);
        if (error) { err.textContent = 'Não foi possível guardar: ' + error.message; err.hidden = false; return; }
        s.data = d; s.status = 'lido'; total += 1; doubts += d.duvidas.length;
      }
      const missed = list.length - res.length;
      li += 1;
      if (li < lots.length) { toast(`${res.length} lidas.${missed ? ` ${missed} ficaram por ler.` : ''} Agora o lote ${li + 1}.`); return step(); }
      box.innerHTML = `<h2>Folhas lidas</h2><p>${total} ${total === 1 ? 'folha passou' : 'folhas passaram'} para digital e já estão organizadas por cena e plano.${missed ? ` ${missed} ficaram por ler (o Claude não respondeu sobre elas): tenta outra vez.` : ''}</p>
        ${doubts ? `<p class="muted">O Claude deixou ${doubts} ${doubts === 1 ? 'dúvida' : 'dúvidas'} para confirmares na foto. Abre cada plano, compara com a foto ao lado e marca como revista.</p>` : '<p class="muted">Abre cada plano, compara com a foto ao lado e marca como revista.</p>'}
        <div class="row end"><button type="button" class="btn primary" data-close>Ver as folhas</button></div>`;
      box.querySelector('[data-close]').onclick = () => { m.close(); after(); };
    };
  };
  step();
}

// ---------- exportar para a montagem ----------
function rowsOf(sheets) {
  const out = [];
  sheets.filter((s) => s.status !== 'novo').sort((a, b) => natural(a.data?.cena || '', b.data?.cena || '') || natural(a.data?.plano || '', b.data?.plano || '') || a.n - b.n).forEach((s) => {
    const d = s.data || {};
    const base = [s.day ? `Dia ${s.day}` : '', s.date || d.data || '', d.folha || '', d.cena || '', d.plano || ''];
    const tail = [d.camara, d.cartao, d.objetiva, d.filtro, d.diafragma, d.nd, d.fps, d.som, d.movimento, d.distancia, d.decor, d.efeito, d.descricao, d.dialogos, s.status === 'revisto' ? 'Revista' : 'Por rever'].map((v) => v || '');
    (d.takes?.length ? d.takes : [{}]).forEach((t) => out.push([...base, t.take || '', t.clip || '', t.tc_in || '', t.tc_out || '', t.min || '', t.bom ? 'Sim' : '', t.obs || '', ...tail]));
  });
  return out;
}
const HEAD = ['Dia', 'Data', 'Folha', 'Cena', 'Plano', 'Take', 'Clip', 'TC in', 'TC out', 'Minut.', 'Bom', 'Observações', 'Câmara', 'Cartão', 'Objetiva', 'Filtro', 'Diafragma', 'ND', 'FPS', 'Som', 'Movimento', 'Distância', 'Décor', 'Efeito', 'Descrição', 'Diálogos', 'Estado'];
function exportModal(p, sheets) {
  const unread = sheets.filter((s) => s.status === 'novo').length, review = sheets.filter((s) => s.status === 'lido').length;
  const m = modal(`<h2>Exportar para a montagem</h2><p class="muted small">Uma linha por take, por ordem de cena e plano, com todos os dados de câmara e as observações.${review ? ` ${review} ${review === 1 ? 'folha ainda não foi revista' : 'folhas ainda não foram revistas'}.` : ''}${unread ? ` ${unread} por ler não entram.` : ''}</p>
    <div class="an-opts"><button type="button" class="an-opt" data-x="xlsx"><strong>Excel</strong><span class="small">Para abrir no Excel, Numbers ou Google Sheets e partilhar com os montadores.</span></button>
    <button type="button" class="an-opt" data-x="csv"><strong>CSV</strong><span class="small">Para importar no Avid, Premiere, Resolve ou noutro programa.</span></button></div>
    <div class="row end"><button type="button" class="btn ghost" data-close>Fechar</button></div>`);
  m.el.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', async () => {
    const rows = rowsOf(sheets); const name = `anotacao-${(p.name || 'projeto').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').toLowerCase()}`;
    if (b.dataset.x === 'csv') {
      const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
      const blob = new Blob(['﻿' + [HEAD, ...rows].map((r) => r.map(q).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
      dl(blob, `${name}.csv`);
    } else {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Anotação');
      ws.addRow(HEAD).font = { bold: true };
      rows.forEach((r) => { const row = ws.addRow(r); if (r[10] === 'Sim') row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDDF5E8' } }; });
      ws.columns.forEach((c, i) => { c.width = [8, 11, 7, 7, 7, 6, 9, 12, 12, 8, 6, 40, 8, 9, 10, 12, 9, 6, 6, 14, 14, 22, 18, 12, 50, 50, 10][i] || 12; });
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      dl(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${name}.xlsx`);
    }
    toast('Exportado.');
  }));
}
function dl(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// ---------- modelos em branco para imprimir ----------
const MODELS = [
  ['portal', 'Folha de anotação', 'Cabeçalho com filme, data, décor e efeito; câmara, objetiva, filtro, diafragma, ND, som e FPS; tabela de takes com clip, TC e minutagem; diálogos e descrição do plano.'],
  ['classico', 'Clássico', 'Cena/plano, K7, câmara, objetiva, filtro, diafragma, altura e distância; som e timecode; takes com minutagem; descrição/croqui e diálogos lado a lado.'],
  ['takes', 'Só takes (várias por página)', 'Para dias com muitos planos curtos: cena, plano e takes, três blocos por folha.'],
];
function modelsModal(p) {
  const m = modal(`<h2>Modelos para imprimir</h2><p class="muted small">Folhas em branco (A4) com o nome do filme já escrito. Qualquer modelo, ou outro qualquer, é lido pelo Claude.</p>
    <div class="an-opts">${MODELS.map(([k, l, d]) => `<button type="button" class="an-opt" data-m="${k}"><strong>${esc(l)}</strong><span class="small">${esc(d)}</span></button>`).join('')}</div>
    <div class="row between"><label class="row small">Quantas folhas <input type="number" min="1" max="200" value="20" data-q style="width:80px"></label><button type="button" class="btn ghost" data-close>Fechar</button></div>`, { wide: true });
  m.el.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => printModel(p, b.dataset.m, Math.max(1, Math.min(200, +m.el.querySelector('[data-q]').value || 1)))));
}
function printModel(p, kind, q) {
  const film = esc(p.name || '');
  const lines = (n) => Array.from({ length: n }, () => '<div class="ln"></div>').join('');
  const takes = (n) => `<table class="tk"><tr><th style="width:9%">TAKE</th><th style="width:11%">CLIP</th><th style="width:13%">TC IN</th><th style="width:13%">TC OUT</th><th style="width:10%">MINUT.</th><th>OBSERVAÇÕES</th></tr>${Array.from({ length: n }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}</table>`;
  const page = {
    portal: (i) => `<div class="pg"><div class="hd"><b>FOLHA DE ANOTAÇÃO</b><span>FOLHA Nº ______</span></div>
      <table class="kv"><tr><td><i>Filme</i> ${film}</td><td><i>Data</i> ___ / ___ / ______</td><td rowspan="3" class="big"><i>CENA</i></td></tr>
      <tr><td><i>Décor</i></td><td><i>Efeito</i> INT / EXT · DIA / NOITE</td></tr>
      <tr><td><i>Cartão</i> &nbsp; &nbsp; &nbsp; &nbsp; <i>Câmara</i></td><td><i>Objetiva</i> &nbsp; &nbsp; &nbsp; &nbsp; <i>Filtro</i></td></tr>
      <tr><td><i>Diafragma</i> &nbsp; &nbsp; &nbsp; <i>ND</i></td><td><i>Som</i> &nbsp; &nbsp; &nbsp; &nbsp; &nbsp; <i>FPS</i></td><td rowspan="2" class="big"><i>PLANO</i></td></tr>
      <tr><td><i>Movimento</i></td><td><i>Distância</i></td></tr></table>
      ${takes(12)}<div class="bx"><i>DIÁLOGOS</i>${lines(5)}</div><div class="bx"><i>DESCRIÇÃO DO PLANO</i>${lines(6)}</div><div class="ft">${film} · ${i + 1}</div></div>`,
    classico: (i) => `<div class="pg"><div class="hd"><b>Folha de Anotação</b><span>Folha nº: ________</span></div>
      <table class="kv"><tr><td><i>Filme</i> ${film}</td><td><i>K7 nº</i></td><td><i>Cena/Plano</i></td></tr>
      <tr><td><i>Décor</i></td><td><i>Câmara</i></td><td><i>Objetiva</i></td></tr>
      <tr><td><i>Efeito</i> ☐ Dia ☐ Noite ☐ Int ☐ Ext</td><td><i>Data</i></td><td><i>Filtro</i></td></tr>
      <tr><td><i>Som</i> ☐ Áudio ☐ Mudo · <i>Som nº</i></td><td><i>Timecode</i> IN __:__:__:__ OUT __:__:__:__</td><td><i>Diafragma</i></td></tr>
      <tr><td></td><td></td><td><i>Altura</i> &nbsp; &nbsp; <i>Distância</i></td></tr></table>
      ${takes(10)}<div class="two"><div class="bx"><i>Descrição do plano / croqui</i>${lines(9)}</div><div class="bx"><i>Diálogos</i>${lines(9)}</div></div><div class="ft">${film} · ${i + 1}</div></div>`,
    takes: (i) => `<div class="pg">${[0, 1, 2].map(() => `<div class="mini"><div class="hd"><b>${film}</b><span><i>Data</i> ___/___ &nbsp; <i>Cena</i> ______ &nbsp; <i>Plano</i> ______ &nbsp; <i>Objetiva</i> ______</span></div>${takes(5)}</div>`).join('')}<div class="ft">${film} · ${i + 1}</div></div>`,
  }[kind];
  const w = window.open('', '_blank'); if (!w) return toast('O browser bloqueou a janela. Deixa abrir janelas para este site.');
  w.document.write(`<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>Folhas de anotação · ${film}</title><style>
    @page{size:A4;margin:12mm} *{box-sizing:border-box} body{margin:0;font:11px/1.3 Arial,Helvetica,sans-serif;color:#000}
    .pg{page-break-after:always;height:270mm;display:flex;flex-direction:column;gap:3mm} .pg:last-child{page-break-after:auto}
    .hd{display:flex;justify-content:space-between;align-items:baseline;border-bottom:2px solid #000;padding-bottom:2mm} .hd b{font-size:16px;letter-spacing:.04em}
    i{font-style:normal;font-size:9px;text-transform:uppercase;letter-spacing:.05em;color:#444;margin-right:4px}
    table{width:100%;border-collapse:collapse} td,th{border:1px solid #000;padding:2.2mm 2mm;text-align:left;vertical-align:top}
    th{font-size:9px;letter-spacing:.05em;background:#eee} .tk td{height:7.5mm} .big{width:22%;font-size:9px}
    .bx{border:1px solid #000;padding:2mm;flex:1;display:flex;flex-direction:column} .ln{border-bottom:1px solid #bbb;flex:1;min-height:6mm}
    .two{display:grid;grid-template-columns:1fr 1fr;gap:3mm;flex:1} .mini{flex:1;display:flex;flex-direction:column;gap:2mm;border-bottom:1px dashed #999;padding-bottom:3mm}
    .ft{font-size:8px;color:#777;text-align:right}
  </style></head><body>${Array.from({ length: q }, (_, i) => page(i)).join('')}<script>onload=()=>setTimeout(()=>print(),300)<\/script></body></html>`);
  w.document.close();
}
