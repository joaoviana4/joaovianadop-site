import { sb, esc, toast, modal, confirmBox, ICON } from './lib.js';

// Décors: agrupar (vários décors no mesmo local/morada, ex.: CASA, CASA DE BANHO, QUARTO) e juntar (dois nomes para o
// mesmo décor, ex.: "STAND UP" e "STAND-UP").
// · Agrupar: info.grupo = id do décor principal. Quem não tem morada usa a do principal (folha de serviço, hospital, mapa).
// · Juntar: tudo o que apontava para o décor que sai passa para o que fica, e o que sai é apagado.

export const groupOf = (loc, all) => (loc?.info?.grupo ? (all || []).find((x) => x.id === loc.info.grupo) || null : null);
export const membersOf = (loc, all) => (all || []).filter((x) => x.info?.grupo === loc.id);

// ordem da lista: cada décor principal seguido dos do mesmo local
export function groupedOrder(all) {
  const list = all || []; const byId = new Map(list.map((l) => [l.id, l]));
  const top = list.filter((l) => !l.info?.grupo || !byId.has(l.info.grupo));
  return top.flatMap((t) => [{ l: t, child: false }, ...list.filter((x) => x.info?.grupo === t.id).map((x) => ({ l: x, child: true }))]);
}

// barra na página do décor: "Mesmo local que …" e "Juntar a outro décor"
export function locGroupBar(el, p, loc, all, base, path, { onChange } = {}) {
  if (!el) return;
  const draw = () => {
    const parent = groupOf(loc, all); const kids = membersOf(loc, all);
    // só se agrupa num décor principal (um nível), nunca nele próprio nem num que já está dentro deste
    const opts = all.filter((x) => x.id !== loc.id && !x.info?.grupo);
    el.innerHTML = `<div class="loc-grp">
      ${kids.length ? `<span class="muted small">Neste local também:</span> ${kids.map((k) => `<a class="chip" href="${base}/${path}/${k.id}">${esc(k.name)}</a>`).join(' ')}`
        : `<label class="loc-grp-sel"><span class="muted small">Mesmo local (morada) que</span>
          <select data-grp aria-label="Mesmo local que"><option value="">— nenhum —</option>${opts.map((x) => `<option value="${x.id}" ${parent?.id === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
          ${parent ? `<a class="small" href="${base}/${path}/${parent.id}">Abrir ${esc(parent.name)}</a>` : ''}`}
      <button type="button" class="link-btn small" data-merge title="Para dois nomes que são o mesmo décor">Juntar a outro décor…</button>
    </div>`;
    el.querySelector('[data-grp]')?.addEventListener('change', async (e) => {
      const v = e.target.value; const info = { ...(loc.info || {}) };
      if (v) info.grupo = v; else delete info.grupo;
      const { error } = await sb.from('locations').update({ info }).eq('id', loc.id);
      if (error) { toast(error.message); return draw(); }
      loc.info = info; loc._parent = groupOf(loc, all);
      const par = groupOf(loc, all);
      toast(par ? `Agrupado com ${par.name}. Sem morada própria, usa a de ${par.name}.` : 'Já não está agrupado.');
      draw(); onChange?.();
    });
    el.querySelector('[data-merge]').addEventListener('click', () => mergeDialog(p, loc, all, base, path));
  };
  draw();
}

function mergeDialog(p, loc, all, base, path) {
  const others = all.filter((x) => x.id !== loc.id);
  if (!others.length) return toast('Não há outro décor para juntar.');
  const m = modal(`<h2>Juntar «${esc(loc.name)}» a outro décor</h2>
    <p class="muted small">Para quando o mesmo décor aparece com dois nomes (ex.: "STAND UP" e "STAND-UP"). As cenas, fotos, notas, tarefas, mapas de luz e o moodboard passam para o décor que escolheres, e «${esc(loc.name)}» desaparece.</p>
    <p class="muted small">Se são sítios diferentes na mesma morada (ex.: CASA e CASA DE BANHO), usa antes "Mesmo local que".</p>
    <form class="stack"><div class="field"><label for="mg">Fica</label><select id="mg">${others.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></div>
    <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Juntar</button></div></form>`);
  m.el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const keep = others.find((x) => x.id === m.el.querySelector('#mg').value); if (!keep) return;
    if (!(await confirmBox(`Juntar «${loc.name}» a «${keep.name}»? Fica só «${keep.name}».`, 'Juntar'))) return;
    try { await mergeLocations(p, keep, loc, all); toast(`«${loc.name}» juntou-se a «${keep.name}».`); location.hash = `${base}/${path}/${keep.id}`; }
    catch (er) { toast('Não foi possível juntar: ' + (er.message || er)); }
  });
}

const swap = (arr, from, to) => { const out = []; (arr || []).forEach((x) => { const v = x === from ? to : x; if (!out.includes(v)) out.push(v); }); return out; };
export async function mergeLocations(p, keep, drop, all = []) {
  const ok = ({ error }) => { if (error) throw error; };
  ok(await sb.from('scenes').update({ location_id: keep.id }).eq('project_id', p.id).eq('location_id', drop.id));
  const [{ data: sc }, { data: pr }, { data: bs }] = await Promise.all([
    sb.from('scenes').select('id, location_ids').eq('project_id', p.id).contains('location_ids', [drop.id]),
    sb.from('props').select('id, location_ids').eq('project_id', p.id).contains('location_ids', [drop.id]),
    sb.from('boards').select('id, data').eq('project_id', p.id).eq('data->>location_id', drop.id),
  ]);
  for (const s of sc || []) ok(await sb.from('scenes').update({ location_ids: swap(s.location_ids, drop.id, keep.id) }).eq('id', s.id));
  for (const x of pr || []) ok(await sb.from('props').update({ location_ids: swap(x.location_ids, drop.id, keep.id) }).eq('id', x.id));
  for (const b of bs || []) ok(await sb.from('boards').update({ data: { ...(b.data || {}), location_id: keep.id } }).eq('id', b.id));
  ok(await sb.from('tasks').update({ entity_id: keep.id }).eq('entity_type', 'location').eq('entity_id', drop.id));
  await sb.from('page_notes').update({ entity_id: keep.id }).eq('entity_type', 'location').eq('entity_id', drop.id);
  // os que estavam no mesmo local que o que sai passam para o que fica
  for (const x of all.filter((l) => l.info?.grupo === drop.id && l.id !== keep.id)) ok(await sb.from('locations').update({ info: { ...x.info, grupo: keep.id } }).eq('id', x.id));
  const dInfo = { ...(drop.info || {}) }; delete dInfo.grupo; if (keep.id === drop.info?.grupo) delete dInfo.grupo;
  const info = { ...dInfo, ...(keep.info || {}) };
  ok(await sb.from('locations').update({ info, photos: [...(keep.photos || []), ...(drop.photos || [])] }).eq('id', keep.id));
  ok(await sb.from('locations').delete().eq('id', drop.id));
}
