import { sb } from './lib.js';

// Dias de rodagem do projeto, a partir das folhas de serviço: [{ day, date, place, address, board }] por data.
export async function shootDays(p) {
  const { data } = await sb.from('boards').select('id, data').eq('project_id', p.id).eq('kind', 'callsheet');
  const out = [];
  (data || []).forEach((b) => (b.data?.sheets || (b.data?.rows ? [b.data] : [])).forEach((sh, i) => out.push({ day: sh.day || String(i + 1), date: sh.date || '', place: sh.place || '', address: sh.address || '', board: b.id })));
  return out.sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
}
