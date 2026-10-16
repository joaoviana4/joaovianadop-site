import { sb, esc, toast, ICON, signedUrls, modal } from './lib.js';
import { newLightmapData } from './lmdata.js';

// Mapas de luz: uma só página no departamento Imagem com os mapas de todos os planos, em vez de uma aba por mapa.
// Grelha (com o storyboard de cada plano) ou lista, por cena/secção. Carregar num plano abre o mapa dele
// (cria-o se ainda não existir). Mapas que não são de um plano (montagem base de um décor, gerais) ficam em "Outros mapas".

const VKEY = 'bg-lmhub-view';
const view = () => { try { return localStorage.getItem(VKEY) || 'grid'; } catch { return 'grid'; } };
const st = { filter: 'all', q: '' };

// cria (ou abre) o mapa de luz de um plano; usado aqui e na página do plano
export async function openShotLightmap(p, x, base) {
  if (x.lightmap_id) { location.hash = `${base}/f/${x.lightmap_id}`; return; }
  const grp = (p.departments || []).find((d) => d.id === 'imagem') ? 'imagem' : null;
  const { data: tool, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'lightmap', title: `Mapa de luz ${x.code || ''}`.trim(), group_id: grp, data: { ...newLightmapData({ cameraCode: x.code || '' }), shot_id: x.id } }).select().single();
  if (error) return toast(error.message);
  await sb.from('shots').update({ lightmap_id: tool.id }).eq('id', x.id);
  location.hash = `${base}/f/${tool.id}`;
}

export async function lightmapsPage(main, p, base) {
  main.innerHTML = '<p class="muted">A carregar…</p>';
  const [{ data: shots }, { data: scenes }, { data: maps }] = await Promise.all([
    sb.from('shots').select('id, scene_id, code, description, framing, lens, image_path, lightmap_id, position').eq('project_id', p.id).order('position'),
    sb.from('scenes').select('id, number, heading, position').eq('project_id', p.id).order('position'),
    sb.from('boards').select('id, title, data, updated_at').eq('project_id', p.id).eq('kind', 'lightmap').order('created_at'),
  ]);
  const S = shots || [], SC = scenes || [], M = maps || [];
  const urls = await signedUrls(S.map((x) => x.image_path).filter(Boolean));
  const mapOf = new Map(M.map((m) => [m.id, m]));
  const used = new Set(S.map((x) => x.lightmap_id).filter(Boolean));
  const others = M.filter((m) => !used.has(m.id));
  const draw = () => {
    const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
    const ok = (x) => (st.filter === 'all' || (st.filter === 'with' ? !!x.lightmap_id : !x.lightmap_id)) && words.every((w) => `${x.code} ${x.description} ${x.framing} ${x.lens}`.toLowerCase().includes(w));
    const groups = [...SC.map((s) => ({ s, list: S.filter((x) => x.scene_id === s.id) })), { s: null, list: S.filter((x) => !x.scene_id || !SC.some((s) => s.id === x.scene_id)) }]
      .map((g) => ({ ...g, list: g.list.filter(ok) })).filter((g) => g.list.length);
    const nWith = S.filter((x) => x.lightmap_id).length;
    const mode = view();
    const tile = (x) => {
      const m = x.lightmap_id && mapOf.get(x.lightmap_id); const n = m?.data?.items?.length || 0;
      return `<button type="button" class="lmh-tile ${m ? 'has' : ''}" data-shot="${x.id}">
        <span class="sb-img">${urls[x.image_path] ? `<img src="${esc(urls[x.image_path])}" alt="" loading="lazy">` : `${ICON.image}<small>Sem storyboard</small>`}</span>
        <span class="lmh-b"><strong>${esc(x.code || 'Plano')}</strong><span class="muted small">${esc(x.description || [x.framing, x.lens].filter(Boolean).join(' · ') || '')}</span>
        <span class="lmh-st small">${m ? `${ICON.bulb} ${n} ${n === 1 ? 'elemento' : 'elementos'}` : `${ICON.plus} Criar mapa de luz`}</span></span></button>`;
    };
    const row = (x) => {
      const m = x.lightmap_id && mapOf.get(x.lightmap_id); const n = m?.data?.items?.length || 0;
      return `<tr class="click-row" data-shot="${x.id}"><td class="lmh-th">${urls[x.image_path] ? `<img src="${esc(urls[x.image_path])}" alt="" loading="lazy">` : ''}</td><td><strong>${esc(x.code || 'Plano')}</strong></td><td class="muted">${esc(x.description || '')}</td><td class="muted small">${esc([x.framing, x.lens].filter(Boolean).join(' · '))}</td>
        <td>${m ? `<span class="chip ok-chip">${ICON.bulb} ${esc(m.title)} · ${n}</span>` : '<span class="muted small">Sem mapa</span>'}</td><td class="num">${m ? 'Abrir' : 'Criar'} ${ICON.chev}</td></tr>`;
    };
    const head = (s) => (s ? `${esc(s.number)}${s.heading ? ` · ${esc(s.heading)}` : ''}` : 'Planos sem cena');
    main.innerHTML = `<div class="row between wrap-gap"><div><h1 class="h1 pm-title">Mapas de luz</h1><p class="muted">Um mapa por plano. Carrega num plano para abrir o mapa dele, ou criá-lo. ${S.length ? `${nWith} de ${S.length} planos com mapa.` : ''}</p></div>
        <button type="button" class="btn ghost" data-newfree>${ICON.plus} Mapa sem plano</button></div>
      <div class="row wrap-gap lmh-bar">
        <label class="search"><span class="vh">Procurar</span>${ICON.search}<input type="search" data-q placeholder="Procurar plano…" value="${esc(st.q)}" autocomplete="off"></label>
        <div class="seg dark" role="radiogroup" aria-label="Mostrar">${[['all', 'Todos'], ['with', 'Com mapa'], ['without', 'Sem mapa']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${st.filter === k}" aria-selected="${st.filter === k}" data-f="${k}">${l}</button>`).join('')}</div>
        <div class="seg dark ent-mode" role="radiogroup" aria-label="Vista">${[['grid', 'Grelha'], ['list', 'Lista']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${mode === k}" aria-selected="${mode === k}" data-v="${k}">${l}</button>`).join('')}</div>
      </div>
      ${!S.length ? `<div class="empty-box"><p>Ainda não há planos.</p><p class="muted small">Junta planos no storyboard, na shotlist ou nas cenas; cada um passa a ter aqui o seu mapa de luz.</p></div>` : ''}
      ${groups.map((g) => `<section class="lmh-sec"><h2 class="h3">${head(g.s)} <span class="muted small">· ${g.list.length} ${g.list.length === 1 ? 'plano' : 'planos'}</span></h2>
        ${mode === 'list' ? `<div class="panel table-wrap"><table class="table lmh-t"><tbody>${g.list.map(row).join('')}</tbody></table></div>` : `<div class="lmh-grid">${g.list.map(tile).join('')}</div>`}</section>`).join('')}
      ${S.length && !groups.length ? '<p class="empty-note">Nenhum plano com estes filtros.</p>' : ''}
      ${others.length ? `<section class="lmh-sec"><h2 class="h3">Outros mapas <span class="muted small">· montagens base e mapas que não são de um plano</span></h2>
        <ul class="lmh-others">${others.map((m) => `<li><a href="${base}/f/${m.id}">${ICON.bulb}<strong>${esc(m.title)}</strong><span class="muted small">${m.data?.items?.length || 0} elementos</span></a>
          <button type="button" class="link-btn small" data-link="${m.id}">Ligar a um plano</button></li>`).join('')}</ul></section>` : ''}`;
    main.querySelectorAll('[data-shot]').forEach((el) => el.addEventListener('click', () => openShotLightmap(p, S.find((x) => x.id === el.dataset.shot), base)));
    main.querySelectorAll('[data-f]').forEach((b) => b.addEventListener('click', () => { st.filter = b.dataset.f; draw(); }));
    main.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { try { localStorage.setItem(VKEY, b.dataset.v); } catch { /* nada */ } draw(); }));
    const qi = main.querySelector('[data-q]');
    qi.addEventListener('input', () => { st.q = qi.value; const pos = qi.selectionStart; draw(); const n = main.querySelector('[data-q]'); n.focus(); n.setSelectionRange(pos, pos); });
    main.querySelector('[data-newfree]').addEventListener('click', async () => {
      const grp = (p.departments || []).find((d) => d.id === 'imagem') ? 'imagem' : null;
      const { data: tool, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'lightmap', title: 'Mapa de luz', group_id: grp, data: newLightmapData() }).select().single();
      if (error) return toast(error.message);
      location.hash = `${base}/f/${tool.id}`;
    });
    // ligar um mapa solto a um plano (o plano passa a abrir este mapa)
    main.querySelectorAll('[data-link]').forEach((b) => b.addEventListener('click', () => {
      const free = S.filter((x) => !x.lightmap_id);
      if (!free.length) return toast('Todos os planos já têm mapa.');
      const m = modal(`<h2>Ligar a um plano</h2><form class="stack"><div class="field"><label for="ls">Plano</label><select id="ls">${free.map((x) => { const s = SC.find((y) => y.id === x.scene_id); return `<option value="${x.id}">${esc(x.code || 'Plano')}${s ? ` · cena ${esc(s.number)}` : ''}</option>`; }).join('')}</select></div>
        <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Ligar</button></div></form>`);
      m.el.querySelector('form').addEventListener('submit', async (e) => {
        e.preventDefault(); const sid = m.el.querySelector('#ls').value; const mp = mapOf.get(b.dataset.link);
        const { error } = await sb.from('shots').update({ lightmap_id: mp.id }).eq('id', sid); if (error) return toast(error.message);
        await sb.from('boards').update({ data: { ...(mp.data || {}), shot_id: sid } }).eq('id', mp.id);
        m.close(); lightmapsPage(main, p, base);
      });
    }));
  };
  draw();
}
