import { sb, esc, toast, modal, ICON } from './lib.js';
import { analyzeScenes } from './breakdown.js';

// Análise do guião (cenas → personagens, figurantes e figurino de cada personagem em cada cena).
// Como nos adereços: no Claude (copiar o pedido, colar a resposta) ou rápida, sem IA. Mostra o resultado
// para rever antes de aplicar.

const key = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const CHUNK = 30000;

function prompts(f) {
  const parts = []; let cur = []; let size = 0;
  f.scenes.forEach((s) => { const t = `CENA ${s.number} — ${s.heading}\n${s.body || ''}\n`; if (size + t.length > CHUNK && cur.length) { parts.push(cur); cur = []; size = 0; } cur.push(s); size += t.length; });
  if (cur.length) parts.push(cur);
  const known = f.characters.filter((c) => !c.info?.extra).map((c) => c.name).join(', ');
  return parts.map((scenes, i) => ({ scenes, text: `És assistente de realização e de guarda-roupa num filme. Lê ${parts.length > 1 ? `esta parte (${i + 1} de ${parts.length}) do` : 'o'} guião e faz o desglose de personagens por cena.

Regras:
- Em cada cena, lista TODAS as personagens que estão em cena, mesmo as que não falam (ex.: "os três irmãos" → os nomes dos três), e não incluas as que só são mencionadas em diálogo.
- Usa sempre o mesmo nome para a mesma personagem, em maiúsculas, como aparece nas deixas.
- "figurantes": grupos ou pessoas sem nome (ex.: "Pescadores", "Clientes do café").
- "figurino": o que cada personagem veste ou usa nessa cena, se o guião disser ou sugerir (roupa, estado da roupa: suja de sangue, molhada…).
- Para cada personagem, a idade e uma descrição curta, se o guião as der.
- Personagens que já conhecemos: ${known || '(nenhuma)'}.

Responde APENAS com JSON neste formato e escreve FIM na última linha:
{"personagens":[{"nome":"FRANCISCO","idade":"31","descricao":"irmão do meio, veste de preto"}],
 "cenas":[{"cena":"1","personagens":["FRANCISCO","ANTÓNIO"],"figurantes":["Pescadores"],"figurino":{"FRANCISCO":"vestido de preto","ANTÓNIO":"camisa azul aos quadrados, manchada; óculos de sol de tartaruga"}}]}
FIM

GUIÃO:
${scenes.map((s) => `CENA ${s.number} — ${s.heading}\n${s.body || ''}`).join('\n\n')}` }));
}

function parseAnswer(txt) {
  const t = String(txt || '').replace(/```json|```/g, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b < a) throw new Error(t.includes('GUIÃO:') ? 'Colaste o pedido em vez da resposta do Claude.' : 'Não encontrei o resultado na resposta. Se veio cortada, escreve "continua" ao Claude e cola também a continuação.');
  const j = JSON.parse(t.slice(a, b + 1));
  return {
    characters: (j.personagens || []).map((c) => ({ name: String(c.nome || '').toUpperCase().trim(), age: String(c.idade || ''), desc: c.descricao || '' })).filter((c) => c.name),
    scenes: (j.cenas || []).map((s) => ({ number: String(s.cena), characters: (s.personagens || []).map((n) => String(n).toUpperCase().trim()), extras: s.figurantes || [], wardrobe: Object.fromEntries(Object.entries(s.figurino || {}).map(([k, v]) => [String(k).toUpperCase().trim(), Array.isArray(v) ? v : [String(v)]])) })),
  };
}

// junta várias partes (ou a análise rápida) num só resultado
function normalize(r) {
  const chars = new Map();
  (r.characters || []).forEach((c) => { const k = key(c.name); if (!chars.has(k)) chars.set(k, { ...c, scenes: [] }); });
  (r.scenes || []).forEach((s) => s.characters.forEach((n) => { const k = key(n); if (!chars.has(k)) chars.set(k, { name: n, age: '', desc: '', scenes: [] }); const c = chars.get(k); if (!c.scenes.includes(s.number)) c.scenes.push(s.number); }));
  return { characters: [...chars.values()], scenes: r.scenes || [] };
}

// Aplica: cria personagens e figurantes que faltam, junta-os às cenas e deixa as notas de figurino em cada cena.
export async function applyBreakdown(p, f, r, { only } = {}) {
  r = normalize(r);
  const byKey = new Map(f.characters.map((c) => [key(c.name), c]));
  const want = r.characters.filter((c) => !only || only.has(key(c.name)));
  const ins = want.filter((c) => !byKey.has(key(c.name))).map((c, i) => ({ project_id: p.id, name: c.name, position: f.characters.length + i, info: { ...(c.age ? { age: c.age } : {}), ...(c.desc ? { desc: c.desc } : {}) } }));
  if (ins.length) { const { data, error } = await sb.from('characters').insert(ins).select(); if (error) throw error; (data || []).forEach((c) => { f.characters.push(c); byKey.set(key(c.name), c); }); }
  // idade e descrição nas que já existiam, só se estiverem vazias
  for (const c of want) {
    const ex = byKey.get(key(c.name)); if (!ex || ins.some((x) => x.name === c.name)) continue;
    const info = { ...(ex.info || {}) }; let ch = false;
    if (c.age && !info.age) { info.age = c.age; ch = true; }
    if (c.desc && !info.desc) { info.desc = c.desc; ch = true; }
    if (ch) { ex.info = info; await sb.from('characters').update({ info }).eq('id', ex.id); }
  }
  // figurantes
  const exNames = [...new Set(r.scenes.flatMap((s) => s.extras || []))].filter((n) => !byKey.has(key(n)));
  if (exNames.length) { const { data } = await sb.from('characters').insert(exNames.map((name, i) => ({ project_id: p.id, name, position: f.characters.length + i, info: { extra: true } }))).select(); (data || []).forEach((c) => { f.characters.push(c); byKey.set(key(c.name), c); }); }
  let n = 0;
  for (const s of r.scenes) {
    const sc = f.scenes.find((x) => String(x.number) === String(s.number)); if (!sc) continue;
    const ids = s.characters.filter((nm) => !only || only.has(key(nm))).map((nm) => byKey.get(key(nm))?.id).filter(Boolean);
    const exIds = (s.extras || []).map((nm) => byKey.get(key(nm))?.id).filter(Boolean);
    const character_ids = [...new Set([...(sc.character_ids || []), ...ids])];
    const extra_ids = [...new Set([...(sc.extra_ids || []), ...exIds])];
    const info = { ...(sc.info || {}) }; const w = { ...(info.wardrobe || {}) };
    Object.entries(s.wardrobe || {}).forEach(([nm, list]) => { const c = byKey.get(key(nm)); if (!c || (only && !only.has(key(nm)))) return; const cur = w[c.id] || {}; if (!cur.notes) w[c.id] = { ...cur, notes: list.join('; ') }; });
    info.wardrobe = w;
    const { error } = await sb.from('scenes').update({ character_ids, extra_ids, info }).eq('id', sc.id);
    if (!error) { Object.assign(sc, { character_ids, extra_ids, info }); n++; }
  }
  return { characters: ins.length, extras: exNames.length, scenes: n };
}

export const quickBreakdown = (f) => analyzeScenes(f.scenes, f.characters.filter((c) => !c.info?.extra).map((c) => c.name));

export function analyzeScriptModal(p, f, after) {
  if (!f.scenes.length) return toast('Importa primeiro o guião.');
  const ps = prompts(f);
  let part = 0; const answers = { characters: [], scenes: [] };
  const m = modal('<div data-an></div>', { wide: true });
  const box = m.el.querySelector('[data-an]');
  const intro = () => {
    box.innerHTML = `<h2>Analisar o guião</h2>
      <p class="muted">Encontra as personagens de cada cena (também as que não falam), os figurantes e o que cada uma veste. Revês tudo antes de aplicar.</p>
      <div class="an-opts"><button type="button" class="an-opt" data-claude><strong>Analisar no Claude</strong><span class="small">A mais completa: percebe "os três irmãos", pronomes e quem está em cena. Grátis, usa a tua conta do Claude.</span><span class="tag blue">Recomendada</span></button>
      <button type="button" class="an-opt" data-quick><strong>Rápida, sem IA</strong><span class="small">Imediata. Lê deixas, apresentações ("FRANCISCO (31)"), nomes nas ações, figurantes em maiúsculas e a roupa descrita.</span></button></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button></div>`;
    box.querySelector('[data-close]').onclick = m.close;
    box.querySelector('[data-quick]').onclick = () => review(quickBreakdown(f));
    box.querySelector('[data-claude]').onclick = step;
  };
  const step = () => {
    const pr = ps[part];
    box.innerHTML = `<h2>Analisar no Claude${ps.length > 1 ? ` — parte ${part + 1} de ${ps.length}` : ''}</h2>
      ${ps.length > 1 ? `<p class="muted small">Cenas ${esc(pr.scenes[0].number)} a ${esc(pr.scenes[pr.scenes.length - 1].number)}. Cada parte vai numa conversa nova.</p>` : ''}
      <ol class="an-steps">
        <li><strong>Copia o pedido.</strong> <button type="button" class="btn ghost" data-copy>${ICON.copy} Copiar o pedido</button><textarea class="mono" rows="3" readonly hidden data-ptext>${esc(pr.text)}</textarea></li>
        <li><strong>Cola-o numa conversa nova no Claude</strong> e espera até aparecer FIM. <a class="btn ghost" href="https://claude.ai/new" target="_blank" rel="noopener">${ICON.open} Abrir o Claude</a></li>
        <li><strong>Traz a resposta.</strong> Copia a resposta inteira e cola aqui.<textarea class="mono" rows="6" data-ans placeholder="Cola aqui a resposta do Claude…"></textarea><button type="button" class="link-btn" data-pastebtn>Colar o que copiei</button></li>
      </ol><p class="auth-err" hidden data-err></p>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-read>Ler a resposta</button></div>`;
    box.querySelector('[data-close]').onclick = m.close;
    box.querySelector('[data-copy]').onclick = async () => { try { await navigator.clipboard.writeText(pr.text); toast('Pedido copiado.'); } catch { const ta = box.querySelector('[data-ptext]'); ta.hidden = false; ta.select(); toast('Seleciona e copia o texto da caixa.'); } };
    box.querySelector('[data-pastebtn]').onclick = async () => { try { box.querySelector('[data-ans]').value = await navigator.clipboard.readText(); } catch { toast('O browser não deixou colar. Usa Ctrl + V na caixa.'); } };
    box.querySelector('[data-read]').onclick = () => {
      const err = box.querySelector('[data-err]'); err.hidden = true;
      try { const r = parseAnswer(box.querySelector('[data-ans]').value); answers.characters.push(...r.characters); answers.scenes.push(...r.scenes); }
      catch (e) { err.textContent = e.message || 'A resposta não está completa.'; err.hidden = false; return; }
      part++;
      if (part < ps.length) return step();
      review(answers);
    };
  };
  const review = (raw) => {
    const r = normalize(raw);
    const exist = new Set(f.characters.map((c) => key(c.name)));
    const extras = [...new Set(r.scenes.flatMap((s) => s.extras || []))];
    const nW = r.scenes.reduce((a, s) => a + Object.keys(s.wardrobe || {}).length, 0);
    box.innerHTML = `<h2>Resultado da análise</h2>
      <p class="muted">${r.characters.length} personagens · ${extras.length} grupos de figurantes · figurino descrito em ${nW} ${nW === 1 ? 'caso' : 'casos'}. Tira o visto ao que não for personagem.</p>
      <div class="an-chars">${r.characters.map((c) => `<label class="an-char"><input type="checkbox" data-k="${esc(key(c.name))}" checked><span><strong>${esc(c.name)}</strong>${c.age ? ` <span class="muted">(${esc(c.age)})</span>` : ''}${exist.has(key(c.name)) ? '' : ' <span class="tag blue">nova</span>'}<small class="muted">${c.scenes.length} ${c.scenes.length === 1 ? 'cena' : 'cenas'}${c.desc ? ` · ${esc(c.desc)}` : ''}</small></span></label>`).join('')}</div>
      <div class="scroll-list an-scenes"><table class="table"><thead><tr><th>Cena</th><th>Personagens</th><th>Figurantes</th><th>Figurino</th></tr></thead><tbody>
        ${r.scenes.map((s) => `<tr><td><strong>${esc(s.number)}</strong></td><td class="small">${esc(s.characters.join(', ')) || '<span class="muted">—</span>'}</td><td class="small">${esc((s.extras || []).join(', '))}</td><td class="small">${Object.entries(s.wardrobe || {}).map(([k, v]) => `<b>${esc(k)}</b>: ${esc(v.join('; '))}`).join('<br>')}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-apply>Aplicar</button></div>`;
    box.querySelector('[data-close]').onclick = m.close;
    box.querySelector('[data-apply]').onclick = async (e) => {
      e.target.disabled = true; e.target.textContent = 'A aplicar…';
      const only = new Set([...box.querySelectorAll('[data-k]')].filter((x) => x.checked).map((x) => x.dataset.k));
      try { const res = await applyBreakdown(p, f, r, { only }); m.close(); toast(`Análise aplicada: ${res.scenes} cenas, ${res.characters} personagens novas${res.extras ? `, ${res.extras} grupos de figurantes` : ''}.`); after?.(); }
      catch (er) { toast(er.message || String(er)); e.target.disabled = false; e.target.textContent = 'Aplicar'; }
    };
  };
  intro();
}
