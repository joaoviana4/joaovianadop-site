import { onWrite } from './undo.js';
import { sb, BUCKET, esc, toast, modal, confirmBox, ICON, signedUrl, signedUrls, uploadImage, fmtDate } from './lib.js';
import { entMode, entUrls, modeToggle, bindMode, entItems, photoField, bindPhoto, bindEdits } from './entview.js';
import { parseScript, fileToText, eighthsLabel } from './script.js';
import { mountTasks } from './tasks.js';
import { mountReader } from './scriptview.js';
import { sceneInfo, placeProps } from './sceneinfo.js';
import { moodboardPanel, bindMoodboard } from './moodboard.js';
import { geoPanel } from './placegeo.js';
import { analyzeScriptModal, applyBreakdown, quickBreakdown } from './scriptan.js';
import { newLightmapData } from './lmdata.js';
import { ensureModules } from './modules.js';

// Modelo de ficção, igual ao do Studio: guião → cenas, personagens e décors → planos e storyboard.

export const FICTION_PAGES = [
  ['guiao', 'Guião', ICON.note], ['cenas', 'Cenas', ICON.list], ['personagens', 'Personagens', ICON.team],
  ['decors', 'Décors', ICON.home], ['aderecos', 'Adereços', ICON.prop], ['storyboard', 'Storyboard', ICON.image], ['planificacao', 'Planificação', ICON.board],
];
export const FICTION_DEPTS = [
  { id: 'realizacao', name: 'Realização', color: '#7C5CFF' }, { id: 'producao', name: 'Produção', color: '#F08A24' },
  { id: 'imagem', name: 'Imagem', color: '#2FB67C' }, { id: 'arte', name: 'Arte', color: '#E5579B' },
  { id: 'som', name: 'Som', color: '#C9A227' }, { id: 'distribuicao', name: 'Distribuição', color: '#1F8A8A' },
];
const FRAMINGS = ['', 'Plano geral', 'Plano de conjunto', 'Plano americano', 'Plano médio', 'Plano próximo', 'Grande plano', 'Muito grande plano', 'Plano de pormenor', 'Contraplano', 'Plano subjetivo (POV)', 'Over the shoulder', 'Two-shot', 'Insert'];
const MOVES = ['', 'Fixo', 'Panorâmica', 'Tilt', 'Travelling', 'Dolly in', 'Dolly out', 'Steadicam', 'Câmara à mão', 'Gimbal', 'Grua', 'Drone', 'Zoom', 'Plano-sequência'];

const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

// os dados da página ficam em memória enquanto ninguém grava nestas tabelas (navegar entre páginas fica imediato)
const memo = new Map();
onWrite((t) => { if (['scenes', 'characters', 'locations', 'shots', 'scripts'].includes(t)) memo.clear(); });
async function load(pid) {
  const m = memo.get(pid);
  if (m && Date.now() - m.t < 45000) return m.f;
  const f = await loadNow(pid);
  memo.set(pid, { t: Date.now(), f });
  return f;
}
async function loadNow(pid) {
  const [sc, ch, lo, sh, sp] = await Promise.all([
    sb.from('scenes').select('*').eq('project_id', pid).order('position'),
    sb.from('characters').select('*').eq('project_id', pid).order('position'),
    sb.from('locations').select('*').eq('project_id', pid).order('position'),
    sb.from('shots').select('*').eq('project_id', pid).order('position'),
    sb.from('scripts').select('id, version, filename, file_path, is_current, created_at').eq('project_id', pid).neq('kind', 'tratamento').order('version', { ascending: false }),
  ]);
  return { scenes: sc.data || [], characters: ch.data || [], locations: lo.data || [], shots: sh.data || [], scripts: sp.data || [] };
}

// interior / exterior de um décor, a partir das cenas do guião que lá acontecem
const ieOf = (locId, f) => { const v = new Set(f.scenes.filter((s) => s.location_id === locId).map((s) => s.int_ext).filter(Boolean).flatMap((x) => x.split('/'))); return v.has('INT') && v.has('EXT') ? 'INT/EXT' : v.has('INT') ? 'INT' : v.has('EXT') ? 'EXT' : ''; };
const IE_LABEL = { INT: 'Interior', EXT: 'Exterior', 'INT/EXT': 'Interior e exterior' };
const sceneTitle = (s, f) => { const loc = f.locations.find((l) => l.id === s.location_id); return [s.int_ext, loc?.name || s.heading].filter(Boolean).join('. '); };
const nameList = (ids, f) => (ids || []).map((id) => f.characters.find((c) => c.id === id)?.name).filter(Boolean);

export async function fictionPage(main, p, page, sub, base, cleanup) {
  if (page === 'aderecos') return (await import('./props.js')).propsPage(main, p, sub, base, cleanup);
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const f = await load(p.id);
  const R = { guiao, cenas, personagens, decors, storyboard, planificacao };
  return R[page](main, p, f, sub, base, cleanup);
}

// ---------- Guião ----------
// o que o projeto já conhece, para realçar no guião: personagens, décors, adereços e figurino (cada um leva à sua página)
async function scriptMarks(p, f, base) {
  const title = (x) => x.toLowerCase().replace(/(^|[\s\-'’.])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
  const out = []; const seen = new Set();
  const add = (term, kind, href, t) => { const k = term.trim().toLocaleLowerCase('pt'); if (k.length < 2 || seen.has(k)) return; seen.add(k); out.push({ term: term.trim(), kind, href, title: t }); };
  f.characters.filter((c) => !c.info?.extra).forEach((c) => {
    const href = `${base}/personagens/${c.id}`; const t = `Personagem: ${c.name}${c.actor ? ` (${c.actor})` : ''}`;
    add(c.name, 'char', href, t); add(title(c.name), 'char', href, t);
    const core = c.name.replace(/^(SR|SRA|DR|DRA|D|DONA|PADRE|TIA|TIO)\.?\s+/i, ''); if (core !== c.name) { add(core, 'char', href, t); add(title(core), 'char', href, t); }
  });
  f.locations.forEach((l) => add(l.name, 'loc', `${base}/decors/${l.id}`, `Décor: ${l.name}`));
  try {
    const { data: props } = await sb.from('props').select('id, name, removed').eq('project_id', p.id);
    (props || []).filter((x) => !x.removed).forEach((x) => add(x.name, 'prop', `${base}/aderecos/${x.id}`, `Adereço: ${x.name}`));
  } catch { /* sem adereços */ }
  f.scenes.forEach((sc) => Object.entries(sc.info?.wardrobe || {}).forEach(([cid, w]) => String(w?.notes || '').split(/;\s*/).forEach((ph) => { if (ph.length >= 4 && ph.length <= 60) add(ph, 'wrd', `${base}/figurino/${cid}`, `Figurino: ${f.characters.find((c) => c.id === cid)?.name || ''}`); })));
  return out;
}

function guiao(main, p, f, _sub, base) {
  const cur = f.scripts.find((s) => s.is_current) || f.scripts[0];
  main.innerHTML = `
    <div class="row between wrap-gap"><h1 class="h1 pm-title">Guião</h1>${f.scripts.length ? `<span class="row wrap-gap"><button type="button" class="btn ghost" data-analyze>Analisar o guião</button><button type="button" class="btn primary" data-imp>${ICON.plus} Importar nova versão</button></span>` : ''}</div>
    ${f.scripts.length ? '' : `<div class="drop-box" data-drop>
      <strong>Importa o guião</strong>
      <p class="muted">PDF, Fountain, Final Draft (.fdx) ou texto. A app separa as cenas, as personagens e os décors.</p>
      <div class="row wrap-gap"><button type="button" class="btn primary" data-imp>${ICON.open} Escolher ficheiro</button><button type="button" class="btn ghost" data-paste>Colar texto</button></div>
      <p class="muted small">Também podes largar o ficheiro aqui.</p>
    </div>`}
    ${f.scripts.length ? `<div class="sr-head">
      <label class="sr-ver"><span class="muted small">Versão</span><select data-ver aria-label="Versão do guião">${f.scripts.map((s) => `<option value="${s.id}" ${s.id === cur?.id ? 'selected' : ''}>v${s.version} · ${esc(s.filename || 'Texto colado')} · ${fmtDate(s.created_at)}${s.is_current ? ' · em uso' : ''}</option>`).join('')}</select></label>
      <button type="button" class="btn ghost sm" data-use hidden>Usar esta versão</button>
      <span class="muted small sr-stats">${f.scenes.length} cenas · ${f.characters.length} personagens · ${f.locations.length} décors</span>
    </div>
    <div data-reader class="sr-wrap"></div>` : ''}`;
  const pick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.pdf,.fountain,.fdx,.txt,.md,application/pdf,text/plain'; inp.onchange = () => inp.files[0] && importFile(inp.files[0]); inp.click(); };
  main.querySelectorAll('[data-imp]').forEach((b) => b.addEventListener('click', pick));
  main.querySelector('[data-analyze]')?.addEventListener('click', () => analyzeScriptModal(p, f, () => { location.hash = `${base}/cenas`; }));
  main.querySelector('[data-paste]')?.addEventListener('click', () => {
    const m = modal(`<h2>Colar o guião</h2><form class="stack"><div class="field"><label for="st">Texto do guião</label><textarea id="st" rows="14" class="mono" placeholder="INT. CASA - NOITE&#10;&#10;..."></textarea></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Continuar</button></div></form>`, { wide: true });
    m.el.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); const t = m.el.querySelector('#st').value; m.close(); preview(t, null); });
  });
  const drop = main.querySelector('[data-drop]');
  if (drop) {
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); const file = e.dataTransfer.files[0]; file && importFile(file); });
  }
  let reader = null;
  const marksP = scriptMarks(p, f, base);
  const showVersion = async (id) => {
    reader?.destroy();
    const { data } = await sb.from('scripts').select('*').eq('id', id).single();
    const box = main.querySelector('[data-reader]'); if (!box || !data) return;
    const marks = data.is_current ? await marksP : null;
    reader = mountReader(box, { version: data, marks, sceneHref: data.is_current ? (n) => { const sc = f.scenes.find((x) => String(x.number) === String(n)); return sc ? `${base}/cenas/${sc.id}` : `${base}/cenas`; } : null });
    const use = main.querySelector('[data-use]'); use.hidden = !!data.is_current; use.dataset.use = data.id;
  };
  if (cur) showVersion(cur.id);
  window.addEventListener('hashchange', () => reader?.destroy(), { once: true });
  main.querySelector('[data-ver]')?.addEventListener('change', (e) => showVersion(e.target.value));
  main.querySelectorAll('[data-use]').forEach((b) => b.addEventListener('click', async () => {
    if (!(await confirmBox('Usar esta versão? As cenas são atualizadas pelo número; os planos e o storyboard ficam onde estão.', 'Usar esta versão'))) return;
    const { data } = await sb.from('scripts').select('*').eq('id', b.dataset.use).single();
    await applyScript(p, f, parseScript(data.body));
    await sb.from('scripts').update({ is_current: false }).eq('project_id', p.id).neq('kind', 'tratamento');
    await sb.from('scripts').update({ is_current: true }).eq('id', data.id);
    toast(`Versão v${data.version} em uso.`); location.hash = `${base}/guiao`; window.dispatchEvent(new HashChangeEvent('hashchange'));
  }));

  async function importFile(file) {
    try { toast('A ler o guião…', 8000); const t = await fileToText(file); preview(t, file); }
    catch (e) { toast('Não consegui ler este ficheiro: ' + (e.message || e)); }
  }
  function preview(text, file) {
    const r = parseScript(text);
    if (!r.scenes.length) { toast('Não encontrei cabeçalhos de cena (INT. / EXT.). Confirma o ficheiro.', 6000); return; }
    const changed = f.scenes.length && f.scenes.length !== r.scenes.length;
    const m = modal(`<h2>${r.scenes.length} cenas encontradas</h2>
      <p>${r.characters.length} personagens · ${r.locations.length} décors · ${eighthsLabel(r.scenes.reduce((a, s) => a + s.eighths, 0))} páginas</p>
      ${changed ? `<p class="warn">O projeto tinha ${f.scenes.length} cenas e esta versão tem ${r.scenes.length}. As cenas ficam ligadas pelo número; as que já não existem ficam na lista para decidires.</p>` : ''}
      <div class="scroll-list"><ol>${r.scenes.slice(0, 200).map((s) => `<li><strong>${esc(s.number)}</strong> ${esc(s.heading)} <span class="muted small">${esc(s.characters.join(', '))}</span></li>`).join('')}</ol></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-go>Importar</button></div>`, { wide: true });
    m.el.querySelector('[data-go]').addEventListener('click', async (e) => {
      e.target.disabled = true; e.target.textContent = 'A importar…';
      try {
        const version = (f.scripts[0]?.version || 0) + 1;
        let file_path = null;
        if (file) {
          file_path = `${p.id}/scripts/v${version}-${file.name.replace(/[^\w.\-]+/g, '_')}`;
          const { error } = await sb.storage.from(BUCKET).upload(file_path, file, { contentType: file.type || 'application/octet-stream' });
          if (error) file_path = null;
        }
        await sb.from('scripts').update({ is_current: false }).eq('project_id', p.id).neq('kind', 'tratamento');
        const { error } = await sb.from('scripts').insert({ project_id: p.id, version, filename: file?.name || '', file_path, body: text, is_current: true });
        if (error) throw error;
        await applyScript(p, f, r);
        m.close(); toast(`Guião importado: ${r.scenes.length} cenas.`);
        location.hash = `${base}/cenas`;
      } catch (er) { toast(er.message || String(er)); e.target.disabled = false; e.target.textContent = 'Importar'; }
    });
  }
}

async function applyScript(p, f, r) {
  const key = (s) => s.trim().toUpperCase();
  const locs = new Map(f.locations.map((l) => [key(l.name), l]));
  const newLocs = r.locations.filter((n) => !locs.has(n)).map((name, i) => ({ project_id: p.id, name, position: f.locations.length + i }));
  if (newLocs.length) { const { data } = await sb.from('locations').insert(newLocs).select(); (data || []).forEach((l) => locs.set(key(l.name), l)); }
  const chars = new Map(f.characters.map((c) => [key(c.name), c]));
  const newChars = r.characters.filter((n) => !chars.has(key(n))).map((name, i) => ({ project_id: p.id, name, position: f.characters.length + i }));
  if (newChars.length) { const { data } = await sb.from('characters').insert(newChars).select(); (data || []).forEach((c) => chars.set(key(c.name), c)); }
  const byNum = new Map(f.scenes.map((s) => [String(s.number), s]));
  const ins = []; const ups = [];
  r.scenes.forEach((s, i) => {
    const row = { project_id: p.id, number: s.number, heading: s.heading, int_ext: s.int_ext, time_of_day: s.time_of_day, location_id: locs.get(key(s.location || ''))?.id || null, character_ids: s.characters.map((n) => chars.get(key(n))?.id).filter(Boolean), body: s.body, eighths: s.eighths, position: i };
    const ex = byNum.get(String(s.number));
    if (ex) ups.push({ ...row, id: ex.id, notes: ex.notes }); else ins.push(row);
  });
  if (ins.length) { const { error } = await sb.from('scenes').insert(ins); if (error) throw error; }
  if (ups.length) { const { error } = await sb.from('scenes').upsert(ups); if (error) throw error; }
  // personagens também pelas apresentações e pelos nomes nas ações, figurantes e figurino (análise rápida)
  try {
    const { data: fresh } = await sb.from('scenes').select('*').eq('project_id', p.id).order('position');
    f.scenes = fresh || f.scenes; f.characters = [...chars.values()];
    await applyBreakdown(p, f, quickBreakdown(f));
  } catch { /* a análise rápida pode ser refeita à mão */ }
  p._hasScript = true;
  await ensureModules(p, ['cenas', ...(r.characters.length ? ['elenco'] : []), ...(r.locations.length ? ['decors'] : [])]);
}

// ---------- Cenas ----------
function cenas(main, p, f, sub, base, cleanup) {
  if (sub) return cena(main, p, f, sub, base, cleanup);
  const nShots = (id) => f.shots.filter((s) => s.scene_id === id).length;
  main.innerHTML = `
    <div class="row between wrap-gap"><h1 class="h1 pm-title">Cenas</h1><span class="row wrap-gap">${f.scenes.length ? '<button type="button" class="btn ghost" data-analyze>Analisar personagens e figurino</button>' : ''}<button type="button" class="btn ghost" data-add>${ICON.plus} Cena</button></span></div>
    ${f.scenes.length ? `<div class="panel table-wrap"><table class="table"><thead><tr><th>Nº</th><th>Cena</th><th>Momento</th><th>Personagens</th><th>Páginas</th><th>Planos</th></tr></thead><tbody>
      ${f.scenes.map((s) => `<tr class="click-row" data-href="${base}/cenas/${s.id}"><td><a href="${base}/cenas/${s.id}"><strong>${esc(s.number)}</strong></a></td><td>${esc(sceneTitle(s, f))}</td><td class="muted">${esc(s.time_of_day)}</td><td class="small">${esc(nameList(s.character_ids, f).join(', '))}</td><td class="muted">${eighthsLabel(s.eighths)}</td><td>${nShots(s.id) || '<span class="muted">—</span>'}</td></tr>`).join('')}
    </tbody></table></div>` : `<div class="empty-box"><p>Ainda não há cenas.</p><p class="muted small">Importa o guião para as separar automaticamente, ou cria-as à mão.</p><a class="btn primary" href="${base}/guiao">Importar guião</a></div>`}`;
  main.querySelector('[data-analyze]')?.addEventListener('click', () => analyzeScriptModal(p, f, () => cenas(main, p, f, null, base, cleanup)));
  main.querySelectorAll('[data-href]').forEach((tr) => tr.addEventListener('click', (e) => { if (!e.target.closest('a')) location.hash = tr.dataset.href; }));
  main.querySelector('[data-add]').addEventListener('click', () => {
    const m = modal(`<h2>Nova cena</h2><form class="stack"><div class="grid2"><div class="field"><label for="sn">Número</label><input id="sn" value="${f.scenes.length + 1}" required></div><div class="field"><label for="sie">INT / EXT</label><select id="sie"><option>INT</option><option>EXT</option><option>INT/EXT</option></select></div></div>
      <div class="field"><label for="sl">Décor</label><input id="sl" list="locs" required><datalist id="locs">${f.locations.map((l) => `<option value="${esc(l.name)}">`).join('')}</datalist></div>
      <div class="field"><label for="st">Momento do dia</label><input id="st" placeholder="DIA, NOITE…"></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div></form>`);
    m.el.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = m.el.querySelector('#sl').value.trim().toUpperCase(); const ie = m.el.querySelector('#sie').value; const t = m.el.querySelector('#st').value.trim().toUpperCase();
      let loc = f.locations.find((l) => l.name.toUpperCase() === name);
      if (!loc) { const { data } = await sb.from('locations').insert({ project_id: p.id, name, position: f.locations.length }).select().single(); loc = data; }
      const { data, error } = await sb.from('scenes').insert({ project_id: p.id, number: m.el.querySelector('#sn').value.trim(), int_ext: ie, time_of_day: t, location_id: loc?.id, heading: `${ie}. ${name}${t ? ' - ' + t : ''}`, position: f.scenes.length }).select().single();
      if (error) return toast(error.message);
      m.close(); location.hash = `${base}/cenas/${data.id}`;
    });
  });
}

export function shotCard(sh, url, base) {
  return `<article class="shot" data-shot="${sh.id}">
    <div class="shot-img" data-img tabindex="0" role="button" aria-label="${url ? 'Ver o plano em grande' : 'Juntar imagem de storyboard'}">${url ? `<img src="${esc(url)}" alt="Storyboard ${esc(sh.code)}">` : `<span>${ICON.image}<small>Juntar storyboard</small><small class="muted">ou cola com Ctrl+V</small></span>`}</div>
    <div class="shot-f">
      <div class="row between">${base ? `<a class="shot-code shot-code-a" href="${base}/plano/${sh.id}" title="Abrir o plano ${esc(sh.code)}">${esc(sh.code || 'Plano')}</a>` : `<input class="shot-code" data-f="code" value="${esc(sh.code)}" aria-label="Código do plano">`}<span class="row">${base ? `<a class="icon-btn sm" href="${base}/plano/${sh.id}" title="Abrir o plano" aria-label="Abrir o plano">${ICON.open}</a>` : ''}<button type="button" class="icon-btn sm" data-del aria-label="Apagar plano">${ICON.trash}</button></span></div>
      <label class="mini">Enquadramento<select data-f="framing">${FRAMINGS.map((x) => `<option ${x === sh.framing ? 'selected' : ''} value="${esc(x)}">${esc(x || '—')}</option>`).join('')}${sh.framing && !FRAMINGS.includes(sh.framing) ? `<option selected>${esc(sh.framing)}</option>` : ''}</select></label>
      <label class="mini">Movimento<select data-f="movement">${MOVES.map((x) => `<option ${x === sh.movement ? 'selected' : ''} value="${esc(x)}">${esc(x || '—')}</option>`).join('')}${sh.movement && !MOVES.includes(sh.movement) ? `<option selected>${esc(sh.movement)}</option>` : ''}</select></label>
      <label class="mini">Lente<input data-f="lens" value="${esc(sh.lens)}" placeholder="ex: 35mm"></label>
      <label class="mini">Descrição<textarea data-f="description" rows="3">${esc(sh.description)}</textarea></label>
      <button type="button" class="btn ghost sm-btn" data-lm>${ICON.bulb} ${sh.lightmap_id ? 'Abrir mapa de luz' : 'Mapa de luz'}</button>
    </div>
  </article>`;
}

async function cena(main, p, f, sid, base, cleanup) {
  const s = f.scenes.find((x) => x.id === sid);
  if (!s) { main.innerHTML = '<p class="empty-note">Esta cena já não existe.</p>'; return; }
  const idx = f.scenes.indexOf(s); const prev = f.scenes[idx - 1], next = f.scenes[idx + 1];
  const shots = f.shots.filter((x) => x.scene_id === s.id);
  const urls = await signedUrls(shots.map((x) => x.image_path));
  const loc = f.locations.find((l) => l.id === s.location_id);
  main.innerHTML = `
    <nav class="row between wrap-gap"><a href="${base}/cenas" class="link-btn">${ICON.back} Cenas</a>
      <span class="row">${prev ? `<a class="btn ghost" href="${base}/cenas/${prev.id}" aria-label="Cena anterior">${ICON.back} ${esc(prev.number)}</a>` : ''}${next ? `<a class="btn ghost" href="${base}/cenas/${next.id}" aria-label="Cena seguinte">${esc(next.number)} ${ICON.chev}</a>` : ''}</span></nav>
    <header class="scene-h"><span class="scene-n">${esc(s.number)}</span><div><h1 class="h2">${esc(s.heading || sceneTitle(s, f))}</h1>
      <div class="chips">${loc ? `<a class="chip" href="${base}/decors/${loc.id}">${ICON.home}${esc(loc.name)}</a>` : ''}${s.time_of_day ? `<span class="chip">${esc(s.time_of_day)}</span>` : ''}${s.eighths ? `<span class="chip">${eighthsLabel(s.eighths)} pág.</span>` : ''}
</div></div></header>
    <section><div class="row between"><h2 class="h3">Planos</h2><span class="muted small">${shots.length} ${shots.length === 1 ? 'plano' : 'planos'}</span></div>
      <div class="shots" data-shots>${shots.map((x) => shotCard(x, urls[x.image_path], base)).join('')}<button type="button" class="shot-add" data-addshot>${ICON.plus}<span>Plano</span></button></div></section>
    <div data-sinfo class="si"></div>
    <section class="panel"><div class="row between"><h2 class="h3">Texto da cena</h2><a class="link-btn small" href="${base}/guiao">Abrir o guião ${ICON.chev}</a></div><div data-scenetext class="sr-wrap"><p class="muted small">A abrir…</p></div></section>
    <section class="panel"><h2 class="h3">Tarefas da cena</h2><div data-tasks></div></section>
    <section class="panel"><h2 class="h3">Notas</h2><textarea data-notes rows="4" placeholder="Notas de realização, produção, continuidade…">${esc(s.notes)}</textarea></section>`;
  const t = mountTasks(main.querySelector('[data-tasks]'), { projectId: p.id, entity: { type: 'scene', id: s.id } }); cleanup(() => t.destroy());
  const saveNotes = debounce((v) => sb.from('scenes').update({ notes: v }).eq('id', s.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message)));
  main.querySelector('[data-notes]').addEventListener('input', (e) => saveNotes(e.target.value));
  sceneInfo(main.querySelector('[data-sinfo]'), p, f, s, base);
  // a cena tal como está no guião: as páginas do PDF desta cena, ou o texto paginado como guião
  (async () => {
    const box = main.querySelector('[data-scenetext]'); if (!box) return;
    const cur = f.scripts.find((x) => x.is_current) || f.scripts[0];
    const { data: v } = cur ? await sb.from('scripts').select('id, body, file_path, filename').eq('id', cur.id).maybeSingle() : { data: null };
    let idx = -1;
    if (v?.file_path && /\.pdf$/i.test(v.file_path)) idx = parseScript(v.body || '').scenes.findIndex((x) => String(x.number) === String(s.number));
    const marks = await scriptMarks(p, f, base);
    const r = idx >= 0 ? mountReader(box, { version: v, scene: idx, compact: true, marks })
      : mountReader(box, { version: { body: `${s.heading || ''}\n\n${s.body || ''}`, file_path: null }, compact: true, marks });
    cleanup(() => r.destroy());
  })();
  bindShots(main, p, f, s, shots, urls, base);
}

function nextCode(scene, shots) {
  // planos numerados 1.1, 1.2, 1.3… (cena.plano)
  const pre = `${scene.number}.`;
  const used = new Set(shots.map((x) => x.code));
  let n = shots.reduce((m, x) => { const k = String(x.code || '').startsWith(pre) ? parseInt(String(x.code).slice(pre.length), 10) : 0; return k > m ? k : m; }, 0) + 1;
  while (used.has(pre + n)) n++;
  return pre + n;
}

export function bindShots(main, p, f, s, shots, urls, base) {
  const wrap = main.querySelector('[data-shots]');
  const savers = new Map();
  const save = (id, patch) => sb.from('shots').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id).then(({ error }) => error && toast(error.message));
  wrap.addEventListener('input', (e) => {
    const el = e.target.closest('[data-f]'); if (!el) return;
    const id = el.closest('[data-shot]').dataset.shot; const sh = shots.find((x) => x.id === id);
    sh[el.dataset.f] = el.value;
    if (!savers.has(id + el.dataset.f)) savers.set(id + el.dataset.f, debounce((v) => save(id, { [el.dataset.f]: v }), 500));
    savers.get(id + el.dataset.f)(el.value);
  });
  wrap.addEventListener('click', async (e) => {
    if (e.target.closest('[data-addshot]')) {
      const { data, error } = await sb.from('shots').insert({ project_id: p.id, scene_id: s.id, code: nextCode(s, shots), position: shots.length }).select().single();
      if (error) return toast(error.message);
      shots.push(data); f.shots.push(data); ensureModules(p, ['storyboard']);
      wrap.querySelector('[data-addshot]').insertAdjacentHTML('beforebegin', shotCard(data, null, base));
      return;
    }
    const card = e.target.closest('[data-shot]'); if (!card) return;
    const sh = shots.find((x) => x.id === card.dataset.shot);
    if (e.target.closest('[data-del]')) {
      if (!(await confirmBox(`Apagar o plano ${sh.code}?`, 'Apagar'))) return;
      await sb.from('shots').delete().eq('id', sh.id); card.remove(); shots.splice(shots.indexOf(sh), 1); f.shots.splice(f.shots.indexOf(sh), 1); return;
    }
    if (e.target.closest('[data-lm]')) {
      if (sh.lightmap_id) { location.hash = `${base}/f/${sh.lightmap_id}`; return; }
      const names = (s.character_ids || []).map((id) => f.characters.find((c) => c.id === id)?.name).filter(Boolean);
      const grp = (p.departments || []).find((d) => d.id === 'imagem') ? 'imagem' : null;
      const { data: tool, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'lightmap', title: `Mapa de luz ${sh.code}`, group_id: grp, data: { ...newLightmapData({ cameraCode: sh.code, people: names }), shot_id: sh.id } }).select().single();
      if (error) return toast(error.message);
      await save(sh.id, { lightmap_id: tool.id });
      location.hash = `${base}/f/${tool.id}`; return;
    }
    if (e.target.closest('[data-img]')) {
      if (sh.image_path) return shotViewer(f, sh, base);
      pickImage(sh, card);
    }
  });
  wrap.addEventListener('dragover', (e) => { if (e.target.closest('[data-img]')) e.preventDefault(); });
  wrap.addEventListener('drop', (e) => {
    const box = e.target.closest('[data-img]'); if (!box) return; e.preventDefault();
    const card = box.closest('[data-shot]'); const sh = shots.find((x) => x.id === card.dataset.shot);
    const file = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/')); file && setImage(sh, card, file);
  });
  // colar (Ctrl+V) para o plano com o rato por cima ou o último em que se carregou
  let target = null;
  wrap.addEventListener('pointerover', (e) => { const c = e.target.closest('[data-shot]'); if (c) target = c; });
  wrap.addEventListener('focusin', (e) => { const c = e.target.closest('[data-shot]'); if (c) target = c; });
  const onPaste = (e) => {
    if (!document.body.contains(wrap)) { document.removeEventListener('paste', onPaste); return; }
    if (e.target.closest?.('input, textarea')) return;
    const file = [...(e.clipboardData?.files || [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    const card = target && document.body.contains(target) ? target : wrap.querySelector('[data-shot]');
    if (!card) return toast('Cria primeiro um plano para colar a imagem.');
    e.preventDefault();
    setImage(shots.find((x) => x.id === card.dataset.shot), card, file);
  };
  document.addEventListener('paste', onPaste);
  function pickImage(sh, card) { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => inp.files[0] && setImage(sh, card, inp.files[0]); inp.click(); }
  async function setImage(sh, card, file) {
    try {
      toast('A enviar a imagem…');
      const up = await uploadImage(p.id, 'storyboard', file);
      await save(sh.id, { image_path: up.path }); sh.image_path = up.path;
      const u = await signedUrl(up.path);
      card.querySelector('[data-img]').innerHTML = `<img src="${esc(u)}" alt="Storyboard ${esc(sh.code)}">`;
      toast('Storyboard juntado.');
    } catch (er) { toast(er.message || String(er)); }
  }
}

// plano em grande, com ‹ › pelos planos do projeto inteiro
export async function shotViewer(f, start, base) {
  const all = [...f.scenes.flatMap((sc) => f.shots.filter((x) => x.scene_id === sc.id)), ...f.shots.filter((x) => !x.scene_id)].filter((x) => x.image_path);
  let i = Math.max(0, all.findIndex((x) => x.id === start.id));
  const m = modal('<div data-v></div>', { wide: true });
  m.el.classList.add('viewer');
  const draw = async () => {
    const sh = all[i]; const sc = f.scenes.find((x) => x.id === sh.scene_id);
    const u = await signedUrl(sh.image_path);
    m.el.querySelector('[data-v]').innerHTML = `
      <div class="row between"><h2>${esc(sh.code)} <span class="muted small">${f.unitPath === 'seguimento' ? esc(sc?.heading || '') : `Cena ${esc(sc?.number || '')}`} · ${i + 1} de ${all.length}</span></h2>
        <div class="row"><button type="button" class="icon-btn" data-p aria-label="Plano anterior" ${i ? '' : 'disabled'}>${ICON.back}</button><button type="button" class="icon-btn" data-n aria-label="Plano seguinte" ${i < all.length - 1 ? '' : 'disabled'}>${ICON.chev}</button><button type="button" class="icon-btn" data-close aria-label="Fechar">${ICON.close}</button></div></div>
      <div class="viewer-img">${u ? `<img src="${esc(u)}" alt="">` : '<p class="muted">Sem storyboard.</p>'}</div>
      <div class="chips">${[sh.framing, sh.movement, sh.lens].filter(Boolean).map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div>
      ${sh.description ? `<p>${esc(sh.description)}</p>` : ''}
      ${sc ? `<a class="link-btn" href="${base}/${f.unitPath || 'cenas'}/${sc.id}">${f.unitPath === 'seguimento' ? 'Abrir a secção' : 'Abrir a cena'}</a>` : ''}`;
    m.el.querySelector('[data-p]').onclick = () => { if (i) { i--; draw(); } };
    m.el.querySelector('[data-n]').onclick = () => { if (i < all.length - 1) { i++; draw(); } };
    m.el.querySelector('[data-close]').onclick = m.close;
    const a = m.el.querySelector('a.link-btn'); if (a) a.onclick = () => m.close();
  };
  const onKey = (e) => { if (e.key === 'ArrowLeft' && i) { i--; draw(); } if (e.key === 'ArrowRight' && i < all.length - 1) { i++; draw(); } };
  document.addEventListener('keydown', onKey);
  const obs = new MutationObserver(() => { if (!document.body.contains(m.el)) { document.removeEventListener('keydown', onKey); obs.disconnect(); } });
  obs.observe(document.querySelector('#modal'), { childList: true });
  draw();
}

// ---------- Personagens ----------
async function personagens(main, p, f, sub, base, cleanup) {
  if (sub) return personagem(main, p, f, sub, base, cleanup);
  const count = (id) => f.scenes.filter((s) => (s.character_ids || []).includes(id)).length;
  const urls = await entUrls([f.characters]);
  const mode = entMode('people');
  const items = f.characters.map((c) => ({ e: c, href: `${base}/personagens/${c.id}`, title: c.name, sub: esc(c.actor || 'Sem ator ou atriz'), meta: `${count(c.id)} ${count(c.id) === 1 ? 'cena' : 'cenas'}`, edit: { table: 'characters', field: 'actor', placeholder: 'Ator ou atriz', label: 'Ator ou atriz' } }));
  main.innerHTML = `<div class="row between wrap-gap"><h1 class="h1 pm-title">Personagens</h1><div class="row">${f.characters.length ? modeToggle('people') : ''}<button type="button" class="btn ghost" data-add>${ICON.plus} Personagem</button></div></div>
    ${f.characters.length ? entItems(items, { mode, urls }) : '<p class="empty-note">Ainda não há personagens. Aparecem ao importar o guião.</p>'}`;
  bindMode(main, 'people', () => personagens(main, p, f, sub, base, cleanup));
  bindEdits(main, items);
  main.querySelector('[data-add]').addEventListener('click', () => addNamed('characters', 'Nova personagem', p, f.characters, (id) => (location.hash = `${base}/personagens/${id}`)));
}

function addNamed(table, title, p, list, after) {
  const m = modal(`<h2>${title}</h2><form class="stack"><div class="field"><label for="nm">Nome</label><input id="nm" required></div><div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Criar</button></div></form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const { data, error } = await sb.from(table).insert({ project_id: p.id, name: m.el.querySelector('#nm').value.trim().toUpperCase(), position: list.length }).select().single();
    if (error) return toast(error.message);
    m.close(); after(data.id);
  });
}

function blocks(ent, defs) {
  return defs.map(([k, label, ph]) => `<div class="field"><label for="b-${k}">${label}</label><textarea id="b-${k}" data-info="${k}" rows="3" placeholder="${esc(ph || '')}">${esc(ent.info?.[k] || '')}</textarea></div>`).join('');
}
function bindBlocks(main, table, ent) {
  const save = debounce(() => sb.from(table).update({ info: ent.info }).eq('id', ent.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message)), 600);
  main.querySelectorAll('[data-info]').forEach((t) => t.addEventListener('input', () => { ent.info = { ...(ent.info || {}), [t.dataset.info]: t.value }; save(); }));
}
function sceneLinks(list, f, base) {
  return list.length ? `<ul class="scene-links">${list.map((s) => `<li><a href="${base}/cenas/${s.id}"><strong>${esc(s.number)}</strong><span>${esc(sceneTitle(s, f))}</span><span class="muted small">${esc(s.time_of_day)}</span></a></li>`).join('')}</ul>` : '<p class="muted small">Ainda não entra em nenhuma cena.</p>';
}

async function personagem(main, p, f, id, base, cleanup) {
  const c = f.characters.find((x) => x.id === id);
  if (!c) { main.innerHTML = '<p class="empty-note">Esta personagem já não existe.</p>'; return; }
  const scenes = f.scenes.filter((s) => (s.character_ids || []).includes(c.id));
  main.innerHTML = `<a href="${base}/personagens" class="link-btn">${ICON.back} Personagens</a>
    <header class="ent-h"><input class="title-in h1" data-ename value="${esc(c.name)}" aria-label="Nome da personagem"><button type="button" class="icon-btn" data-delent aria-label="Apagar personagem">${ICON.trash}</button></header>
    <div class="pm-grid"><div class="pm-boards stack">
      <section class="panel stack">${await photoField(c)}<div class="field"><label for="actor">Ator ou atriz</label><input id="actor" data-actor value="${esc(c.actor)}"></div>
        <div class="grid2"><div class="field"><label for="cph">Telefone</label><input id="cph" data-cinfo="phone" type="tel" inputmode="tel" placeholder="912 345 678" value="${esc(c.info?.phone || '')}"></div><div class="field"><label for="cem">Email</label><input id="cem" data-cinfo="email" type="email" value="${esc(c.info?.email || '')}"></div></div>
        ${blocks(c, [['descricao', 'Descrição'], ['guarda_roupa', 'Guarda-roupa'], ['caracterizacao', 'Caracterização']])}</section>
      <section class="panel"><h2 class="h3">Tarefas</h2><div data-tasks></div></section>
    </div><aside class="pm-side"><section class="panel"><h2 class="h3">Onde entra (${scenes.length})</h2>${sceneLinks(scenes, f, base)}</section></aside></div>`;
  const saveActor = debounce((v) => sb.from('characters').update({ actor: v }).eq('id', c.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message)));
  main.querySelector('[data-actor]').addEventListener('input', (e) => saveActor(e.target.value));
  bindBlocks(main, 'characters', c);
  { const sv = debounce((v) => sb.from('characters').update({ name: v }).eq('id', c.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message))); main.querySelector('[data-ename]').addEventListener('input', (e) => { c.name = e.target.value; if (c.name.trim()) sv(c.name.trim()); }); }
  { const saveI = debounce(() => sb.from('characters').update({ info: c.info }).eq('id', c.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message)), 600); main.querySelectorAll('[data-cinfo]').forEach((t) => t.addEventListener('input', () => { c.info = { ...(c.info || {}), [t.dataset.cinfo]: t.value.trim() }; saveI(); })); }
  bindPhoto(main, p, 'characters', c, () => personagem(main, p, f, id, base, cleanup));
  const t = mountTasks(main.querySelector('[data-tasks]'), { projectId: p.id, entity: { type: 'character', id: c.id } }); cleanup(() => t.destroy());
  main.querySelector('[data-delent]').addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar a personagem ${c.name}?`, 'Apagar'))) return;
    await sb.from('characters').delete().eq('id', c.id); location.hash = `${base}/personagens`;
  });
}

// ---------- Décors ----------
async function decors(main, p, f, sub, base, cleanup) {
  if (sub) return decor(main, p, f, sub, base, cleanup);
  const count = (id) => f.scenes.filter((s) => s.location_id === id).length;
  const urls = await entUrls([f.locations]);
  const mode = entMode('places');
  const items = f.locations.map((l) => ({ e: l, href: `${base}/decors/${l.id}`, title: l.name, sub: esc(l.info?.morada || 'Sem morada'), meta: `${ieOf(l.id, f) ? `<span class="ie-tag">${ieOf(l.id, f)}</span> ` : ''}${count(l.id)} ${count(l.id) === 1 ? 'cena' : 'cenas'}`, edit: { table: 'locations', field: 'info.morada', placeholder: 'Morada ou link do Google Maps', label: 'Morada' } }));
  main.innerHTML = `<div class="row between wrap-gap"><h1 class="h1 pm-title">Décors</h1><div class="row">${f.locations.length ? modeToggle('places') : ''}<button type="button" class="btn ghost" data-add>${ICON.plus} Décor</button></div></div>
    ${f.locations.length ? entItems(items, { mode, urls, place: true }) : '<p class="empty-note">Ainda não há décors. Aparecem ao importar o guião.</p>'}`;
  bindMode(main, 'places', () => decors(main, p, f, sub, base, cleanup));
  bindEdits(main, items);
  main.querySelector('[data-add]').addEventListener('click', () => addNamed('locations', 'Novo décor', p, f.locations, (id) => (location.hash = `${base}/decors/${id}`)));
}

async function decor(main, p, f, id, base, cleanup) {
  const l = f.locations.find((x) => x.id === id);
  if (!l) { main.innerHTML = '<p class="empty-note">Este décor já não existe.</p>'; return; }
  const scenes = f.scenes.filter((s) => s.location_id === l.id);
  const photos = l.photos || [];
  const urls = await signedUrls(photos.map((x) => x.path));
  main.innerHTML = `<a href="${base}/decors" class="link-btn">${ICON.back} Décors</a>
    <header class="ent-h"><div class="ent-hl"><input class="title-in h1" data-ename value="${esc(l.name)}" aria-label="Nome do décor"><div class="ent-tags">${ieOf(l.id, f) ? `<span class="ie-tag lg" title="Pelas cenas do guião">${IE_LABEL[ieOf(l.id, f)]}</span>` : ''}${(() => { const tods = [...new Set(scenes.map((x) => x.time_of_day).filter(Boolean))]; return tods.length ? `<span class="muted small">${esc(tods.join(' · '))}</span>` : ''; })()}</div></div><button type="button" class="icon-btn" data-delent aria-label="Apagar décor">${ICON.trash}</button></header>
    <div class="pm-grid"><div class="pm-boards stack">
      <section class="panel stack"><h2 class="h3">Ficha</h2><div class="grid2">${[['morada', 'Morada'], ['contacto', 'Contacto'], ['estacionamento', 'Estacionamento'], ['eletricidade', 'Eletricidade'], ['luz_natural', 'Luz natural'], ['notas', 'Notas']].map(([k, lab]) => `<div class="field"><label for="i-${k}">${lab}</label><textarea id="i-${k}" data-info="${k}" rows="2">${esc(l.info?.[k] || '')}</textarea></div>`).join('')}</div></section>
      <section class="panel"><div class="row between"><h2 class="h3">Fotos de repérage</h2><button type="button" class="btn ghost" data-addph>${ICON.plus} Fotos</button></div>
        <div class="photo-grid" data-photos>${photos.map((ph, i) => `<figure><img src="${esc(urls[ph.path] || '')}" alt=""><button type="button" class="icon-btn sm" data-rmph="${i}" aria-label="Tirar foto">${ICON.close}</button></figure>`).join('') || '<p class="muted small">Ainda sem fotos. Também podes largá-las aqui ou colar com Ctrl+V.</p>'}</div></section>
      <section class="panel"><div class="row between"><h2 class="h3">Mapas de luz da montagem base</h2><button type="button" class="btn ghost" data-newlm>${ICON.bulb} Mapa de luz</button></div><div data-lms class="muted small">A carregar…</div></section>
      <section class="panel dp-props" data-dprops><p class="muted small">A carregar adereços…</p></section>
      <section class="panel"><h2 class="h3">Tarefas</h2><div data-tasks></div></section>
    </div><aside class="pm-side">${moodboardPanel(l)}<section class="panel geo-panel" data-geo></section><section class="panel"><h2 class="h3">Cenas neste décor (${scenes.length})</h2>${sceneLinks(scenes, f, base)}</section></aside></div>`;
  bindBlocks(main, 'locations', l);
  bindMoodboard(main, p, { table: 'locations', row: l, key: 'location_id', base });
  placeProps(main.querySelector('[data-dprops]'), p, l, scenes.map((s) => s.id), base);
  geoPanel(main.querySelector('[data-geo]'), p, l);
  { const sv = debounce((v) => sb.from('locations').update({ name: v }).eq('id', l.id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message))); main.querySelector('[data-ename]').addEventListener('input', (e) => { l.name = e.target.value; if (l.name.trim()) sv(l.name.trim()); }); }
  const t = mountTasks(main.querySelector('[data-tasks]'), { projectId: p.id, entity: { type: 'location', id: l.id } }); cleanup(() => t.destroy());
  sb.from('boards').select('id, title').eq('project_id', p.id).eq('kind', 'lightmap').eq('data->>location_id', l.id).then(({ data }) => {
    const box = main.querySelector('[data-lms]'); if (!box) return;
    box.innerHTML = (data || []).length ? `<ul class="links">${data.map((b) => `<li><a href="${base}/f/${b.id}">${ICON.bulb} ${esc(b.title)}</a></li>`).join('')}</ul>` : 'Ainda sem mapas de luz para este décor.';
  });
  main.querySelector('[data-newlm]').addEventListener('click', async () => {
    const grp = (p.departments || []).find((d) => d.id === 'imagem') ? 'imagem' : null;
    const { data: tool, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'lightmap', title: `Montagem base — ${l.name}`, group_id: grp, data: { ...newLightmapData(), location_id: l.id } }).select().single();
    if (error) return toast(error.message);
    location.hash = `${base}/f/${tool.id}`;
  });
  const add = async (files) => {
    const imgs = [...files].filter((x) => x.type.startsWith('image/')); if (!imgs.length) return;
    toast(`A enviar ${imgs.length} ${imgs.length === 1 ? 'foto' : 'fotos'}…`, 8000);
    for (const file of imgs) { try { const up = await uploadImage(p.id, 'decors', file); l.photos = [...(l.photos || []), { path: up.path }]; } catch (e) { toast(e.message); } }
    await sb.from('locations').update({ photos: l.photos }).eq('id', l.id); decor(main, p, f, id, base, cleanup);
  };
  main.querySelector('[data-addph]').addEventListener('click', () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true; inp.onchange = () => add(inp.files); inp.click(); });
  const grid = main.querySelector('[data-photos]');
  grid.addEventListener('dragover', (e) => e.preventDefault());
  grid.addEventListener('drop', (e) => { e.preventDefault(); add(e.dataTransfer.files); });
  { const h = (e) => { if (!document.body.contains(grid)) { document.removeEventListener('paste', h); return; } if (e.target.closest?.('input, textarea') || document.querySelector('#modal .modal')) return; const fs = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/')); if (fs.length) { e.preventDefault(); add(fs); } }; document.addEventListener('paste', h); }
  grid.querySelectorAll('[data-rmph]').forEach((b) => b.addEventListener('click', async () => { l.photos = l.photos.filter((_, i) => i !== +b.dataset.rmph); await sb.from('locations').update({ photos: l.photos }).eq('id', l.id); decor(main, p, f, id, base, cleanup); }));
  main.querySelector('[data-delent]').addEventListener('click', async () => {
    if (!(await confirmBox(`Apagar o décor ${l.name}? As cenas ficam sem décor.`, 'Apagar'))) return;
    await sb.from('locations').delete().eq('id', l.id); location.hash = `${base}/decors`;
  });
}

// ---------- Storyboard ----------
async function storyboard(main, p, f, _sub, base) {
  const urls = await signedUrls(f.shots.map((x) => x.image_path));
  const withShots = f.scenes.filter((s) => f.shots.some((x) => x.scene_id === s.id));
  main.innerHTML = `<h1 class="h1 pm-title">Storyboard</h1>
    ${withShots.length ? withShots.map((s) => `<section class="sb-scene"><a class="sb-h" href="${base}/cenas/${s.id}"><span class="scene-n sm">${esc(s.number)}</span>${esc(sceneTitle(s, f))}<span class="muted small">${esc(s.time_of_day)}</span></a>
      <div class="sb-grid">${f.shots.filter((x) => x.scene_id === s.id).map((x) => `<a class="sb-shot" href="${base}/plano/${x.id}"><span class="sb-img">${urls[x.image_path] ? `<img src="${esc(urls[x.image_path])}" alt="">` : ICON.image}</span><span><strong>${esc(x.code)}</strong> <span class="muted small">${esc([x.framing, x.movement].filter(Boolean).join(' · '))}</span></span>${x.description ? `<span class="small sb-d">${esc(x.description)}</span>` : ''}</a>`).join('')}</div></section>`).join('')
    : `<p class="empty-note">Ainda não há planos. Cria-os dentro de cada cena.</p>${f.scenes.length ? `<a class="btn primary" href="${base}/cenas">Ir para as cenas</a>` : ''}`}`;
}

// ---------- Planificação ----------
function planificacao(main, p, f, _sub, base) {
  const rows = f.scenes.flatMap((s) => f.shots.filter((x) => x.scene_id === s.id).map((x) => ({ s, x })));
  main.innerHTML = `<h1 class="h1 pm-title">Planificação</h1>
    ${rows.length ? `<div class="panel table-wrap"><table class="table plan"><thead><tr><th>Cena</th><th>Plano</th><th>Enquadramento</th><th>Movimento</th><th>Lente</th><th>Descrição</th></tr></thead><tbody>
    ${rows.map(({ s, x }) => `<tr data-shot="${x.id}"><td><a href="${base}/cenas/${s.id}">${esc(s.number)}</a></td><td><a class="pl-code" href="${base}/plano/${x.id}" title="Abrir o plano">${esc(x.code || 'Plano')}</a></td>
      <td><select data-f="framing" aria-label="Enquadramento">${FRAMINGS.map((o) => `<option ${o === x.framing ? 'selected' : ''} value="${esc(o)}">${esc(o || '—')}</option>`).join('')}</select></td>
      <td><select data-f="movement" aria-label="Movimento">${MOVES.map((o) => `<option ${o === x.movement ? 'selected' : ''} value="${esc(o)}">${esc(o || '—')}</option>`).join('')}</select></td>
      <td><input data-f="lens" value="${esc(x.lens)}" aria-label="Lente"></td><td><input data-f="description" value="${esc(x.description)}" aria-label="Descrição"></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="empty-note">Ainda não há planos. Cria-os dentro de cada cena.</p>'}`;
  const savers = new Map();
  main.addEventListener('input', (e) => {
    const el = e.target.closest('[data-f]'); if (!el) return;
    const id = el.closest('[data-shot]').dataset.shot; const k = id + el.dataset.f;
    if (!savers.has(k)) savers.set(k, debounce((v) => sb.from('shots').update({ [el.dataset.f]: v }).eq('id', id).then(({ error }) => error && toast('Não foi possível guardar: ' + error.message)), 500));
    savers.get(k)(el.value);
  });
}

export async function fictionStats(p) {
  const c = async (t) => ((await sb.from(t).select('id').eq('project_id', p.id)).data || []).length;
  const [scenes, characters, locations, shots] = await Promise.all([c('scenes'), c('characters'), c('locations'), c('shots')]);
  return { scenes, characters, locations, shots };
}
