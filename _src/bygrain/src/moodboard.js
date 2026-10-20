import { sb, esc, toast, ICON, confirmBox } from './lib.js';

// Moodboard de uma coisa do projeto (décor, …): um board próprio, "Moodboard (nome)", fora da lista de
// ferramentas. Cria-se na primeira vez; o id fica em <tabela>.info.moodboard_id e o board guarda
// data.location_id para o botão "voltar" levar de novo à página do décor.

export const moodboardPanel = (row) => `<section class="panel mb-panel"><div class="row between wrap-gap"><div><h2 class="h3">Moodboard</h2>
  <p class="muted small">${row.info?.moodboard_id ? 'Referências visuais deste décor.' : 'Junta referências visuais, cores e texturas para este décor.'}</p></div>
  <button type="button" class="btn ${row.info?.moodboard_id ? 'primary' : 'ghost'}" data-moodboard>${ICON.image} ${row.info?.moodboard_id ? 'Abrir moodboard' : 'Criar moodboard'}</button></div></section>`;

export function bindMoodboard(root, p, { table, row, key, base, group = 'arte' }) {
  root.querySelector('[data-moodboard]')?.addEventListener('click', async (e) => {
    e.currentTarget.disabled = true;
    let bid = row.info?.moodboard_id;
    if (bid) { const { data: ex } = await sb.from('boards').select('id').eq('id', bid).maybeSingle(); if (!ex) bid = null; }
    if (!bid) {
      const grp = (p.departments || []).find((d) => d.id === group) ? group : null;
      const { data: b, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'wrd', title: `Moodboard (${row.name || 'sem nome'})`, group_id: grp, data: { [key]: row.id } }).select('id').single();
      if (error) { e.currentTarget.disabled = false; return toast(error.message); }
      row.info = { ...(row.info || {}), moodboard_id: b.id };
      const { error: e2 } = await sb.from(table).update({ info: row.info }).eq('id', row.id);
      if (e2) toast('Não foi possível guardar: ' + e2.message);
      bid = b.id;
    }
    location.hash = `${base}/b/${bid}`;
  });
}

// Studio: o moodboard aparece dentro da página (pré-visualização do board) só quando existe.
// Criar: pela barra da direita ("Moodboard"), que chama createMoodboard e volta a desenhar este espaço.
export async function createMoodboard(p, { table, row, key, group = 'arte' }) {
  let bid = row.info?.moodboard_id;
  if (bid) { const { data: ex } = await sb.from('boards').select('id').eq('id', bid).maybeSingle(); if (ex) return bid; }
  const grp = (p.departments || []).find((d) => d.id === group) ? group : null;
  const { data: b, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'wrd', title: `Moodboard (${row.name || 'sem nome'})`, group_id: grp, data: { [key]: row.id } }).select('id').single();
  if (error) { toast(error.message); return null; }
  row.info = { ...(row.info || {}), moodboard_id: b.id };
  const { error: e2 } = await sb.from(table).update({ info: row.info }).eq('id', row.id);
  if (e2) toast('Não foi possível guardar: ' + e2.message);
  return b.id;
}
export async function moodboardView(el, p, { row, base, table = 'locations', after }) {
  if (!el) return null;
  const bid = row.info?.moodboard_id;
  if (!bid) { el.hidden = true; el.innerHTML = ''; return null; }
  el.hidden = false;
  let boardPreview;
  try { ({ boardPreview } = await import('./boardview.js')); } catch { el.innerHTML = `<p class="muted small">Não foi possível mostrar o moodboard aqui. <a href="${base}/b/${bid}">Abrir o moodboard</a></p>`; return null; }
  let h = null;
  const onRemove = async () => {
    if (!(await confirmBox('Apagar o moodboard? As imagens e notas que tem também se apagam.', 'Apagar'))) return;
    const { error } = await sb.from('boards').delete().eq('id', bid); if (error) return toast(error.message);
    row.info = { ...(row.info || {}) }; delete row.info.moodboard_id;
    const { error: e2 } = await sb.from(table).update({ info: row.info }).eq('id', row.id); if (e2) toast('Não foi possível guardar: ' + e2.message);
    h?.destroy(); el.hidden = true; el.innerHTML = ''; toast('Moodboard apagado.'); after && after();
  };
  // o nome mostrado é o do board (por defeito "Moodboard"; muda-se no ✎ ou com duplo clique)
  const { data: bd } = await sb.from('boards').select('title').eq('id', bid).maybeSingle();
  const shown = !bd?.title || /^Moodboard \(.*\)$/.test(bd.title) ? 'Moodboard' : bd.title;
  h = boardPreview(el, p, { boardId: bid, title: shown, href: `${base}/b/${bid}`, base, onRemove, renamable: true });
  return h;
}
