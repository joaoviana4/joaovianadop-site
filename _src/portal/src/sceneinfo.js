import { sb, esc, toast, ICON, signedUrls, initials } from './lib.js';
import { entPhoto } from './entview.js';
import { PROP_STATUS } from './propstatus.js';

// Informação da cena: personagens com o figurino de cada uma nesta cena, figurantes e adereços.
// O figurino da cena fica em scenes.info.wardrobe = { [character_id]: { costume, notes } }
// (costume = id de um figurino em characters.info.wardrobe.costumes).

const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

export async function sceneInfo(el, p, f, s, base) {
  const { data: props } = await sb.from('props').select('id, name, type, status, category, scene_ids, interactions, removed, refs').eq('project_id', p.id).order('name');
  const sp = (props || []).filter((x) => !x.removed && (x.scene_ids || []).includes(s.id));
  const people = () => (s.character_ids || []).map((id) => f.characters.find((c) => c.id === id)).filter(Boolean);
  const extras = () => (s.extra_ids || []).map((id) => f.characters.find((c) => c.id === id)).filter(Boolean);
  const W = () => ({ ...(s.info?.wardrobe || {}) });
  const costumesOf = (c) => c.info?.wardrobe?.costumes || [];
  const paths = [...f.characters.map(entPhoto), ...f.characters.flatMap((c) => costumesOf(c).map((x) => x.photos?.[0]?.path)), ...sp.map((x) => x.refs?.[0]?.path)].filter(Boolean);
  const urls = await signedUrls(paths);

  const saveInfo = async (patch) => {
    s.info = { ...(s.info || {}), ...patch };
    const { error } = await sb.from('scenes').update({ info: s.info }).eq('id', s.id);
    if (error) toast('Não foi possível guardar: ' + error.message);
  };
  const saveIds = async (field, ids) => {
    s[field] = ids;
    const { error } = await sb.from('scenes').update({ [field]: ids }).eq('id', s.id);
    if (error) toast('Não foi possível guardar: ' + error.message);
  };

  const card = (c) => {
    const w = W()[c.id] || {};
    const cos = costumesOf(c);
    const cur = cos.find((x) => x.id === w.costume);
    const ph = urls[entPhoto(c)];
    const cph = cur?.photos?.[0]?.path && urls[cur.photos[0].path];
    return `<article class="si-card" data-cid="${c.id}">
      <header class="si-h"><span class="si-av">${ph ? `<img src="${esc(ph)}" alt="">` : `<b>${esc(initials(c.name))}</b>`}</span>
        <span class="si-n"><a href="${base}/personagens/${c.id}"><strong>${esc(c.name)}</strong></a><small class="muted">${esc(c.actor || 'Sem ator')}${c.info?.age ? ` · ${esc(c.info.age)} anos` : ''}</small></span>
        <button type="button" class="icon-btn sm" data-rm="${c.id}" title="Tirar da cena" aria-label="Tirar ${esc(c.name)} da cena">${ICON.close}</button></header>
      <div class="si-w">
        ${cph ? `<img class="si-cph" src="${esc(cph)}" alt="">` : ''}
        <div class="si-wf">
          <label class="mini">Figurino nesta cena<select data-costume>${['<option value="">Por definir</option>', ...cos.map((x) => `<option value="${esc(x.id)}" ${x.id === w.costume ? 'selected' : ''}>${esc(x.name || 'Figurino')}</option>`)].join('')}</select></label>
          <label class="mini">Notas de figurino<textarea data-wnotes rows="2" placeholder="O que veste, estado da roupa (suja, molhada…), continuidade">${esc(w.notes || '')}</textarea></label>
          <a class="link-btn small" href="${base}/figurino/${c.id}">${cos.length ? `Ver os ${cos.length} figurinos` : 'Criar figurinos'} de ${esc(c.name)} ${ICON.chev}</a>
        </div>
      </div>
    </article>`;
  };
  const addSel = (list, used, attr, label) => { const free = list.filter((c) => !used.includes(c.id)); return free.length ? `<select class="si-add" ${attr} aria-label="${label}"><option value="">+ ${label}</option>${free.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>` : ''; };
  const st = (k) => PROP_STATUS.find((x) => x[0] === k) || PROP_STATUS[0];

  const draw = () => {
    const ppl = people(); const ex = extras();
    el.innerHTML = `
      <section class="si-sec"><div class="row between wrap-gap"><h2 class="h3">Personagens e figurino <span class="muted small">${ppl.length}</span></h2>${addSel(f.characters.filter((c) => !c.info?.extra), s.character_ids || [], 'data-addc', 'Personagem')}</div>
        ${ppl.length ? `<div class="si-grid">${ppl.map(card).join('')}</div>` : '<p class="muted small">Ainda não há personagens nesta cena. Usa "Analisar personagens e figurino" na lista de cenas, ou junta-as aqui.</p>'}</section>
      <section class="si-sec"><div class="row between wrap-gap"><h2 class="h3">Figurantes <span class="muted small">${ex.length}</span></h2>${addSel(f.characters.filter((c) => c.info?.extra), s.extra_ids || [], 'data-adde', 'Figurante')}</div>
        ${ex.length ? `<div class="chips">${ex.map((c) => `<span class="chip">${esc(c.name)}<button type="button" class="chip-x" data-rme="${c.id}" aria-label="Tirar ${esc(c.name)}">×</button></span>`).join('')}</div>` : '<p class="muted small">Sem figurantes.</p>'}</section>
      <section class="si-sec"><div class="row between wrap-gap"><h2 class="h3">Adereços <span class="muted small">${sp.length}</span></h2><a class="link-btn small" href="${base}/aderecos">Todos os adereços ${ICON.chev}</a></div>
        ${sp.length ? `<ul class="si-props">${sp.map((x) => { const [, lbl, col] = st(x.status); const it = (x.interactions || []).filter((i) => String(i.scene) === String(s.number)); const ref = x.refs?.[0]?.path && urls[x.refs[0].path]; return `<li><a href="${base}/aderecos/${x.id}" style="--c:${col}">
          <span class="si-pimg">${ref ? `<img src="${esc(ref)}" alt="">` : ''}</span>
          <span class="si-pn"><strong>${esc(x.name)}</strong><small class="muted">${x.type === 'cenario' ? 'Cenário' : 'Ação'}${x.category ? ` · ${esc(x.category)}` : ''}</small>${it.length ? `<small>${it.map((i) => `${i.character ? `<b>${esc(i.character)}</b> ` : ''}${esc(i.action || '')}`).join('<br>')}</small>` : ''}</span>
          <span class="si-st"><i></i>${esc(lbl)}</span></a></li>`; }).join('')}</ul>` : `<p class="muted small">Sem adereços nesta cena. <a href="${base}/aderecos">Analisa o guião nos adereços</a> para os encontrar.</p>`}</section>`;
    bind();
  };
  const bind = () => {
    el.querySelectorAll('[data-cid]').forEach((card) => {
      const cid = card.dataset.cid;
      const notes = debounce((v) => { const w = W(); w[cid] = { ...(w[cid] || {}), notes: v }; saveInfo({ wardrobe: w }); });
      card.querySelector('[data-wnotes]').addEventListener('input', (e) => notes(e.target.value));
      card.querySelector('[data-costume]').addEventListener('change', async (e) => { const w = W(); w[cid] = { ...(w[cid] || {}), costume: e.target.value || null }; await saveInfo({ wardrobe: w }); draw(); });
    });
    el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => { await saveIds('character_ids', (s.character_ids || []).filter((x) => x !== b.dataset.rm)); draw(); }));
    el.querySelectorAll('[data-rme]').forEach((b) => b.addEventListener('click', async () => { await saveIds('extra_ids', (s.extra_ids || []).filter((x) => x !== b.dataset.rme)); draw(); }));
    el.querySelector('[data-addc]')?.addEventListener('change', async (e) => { if (!e.target.value) return; await saveIds('character_ids', [...(s.character_ids || []), e.target.value]); draw(); });
    el.querySelector('[data-adde]')?.addEventListener('change', async (e) => { if (!e.target.value) return; await saveIds('extra_ids', [...(s.extra_ids || []), e.target.value]); draw(); });
  };
  draw();
}
