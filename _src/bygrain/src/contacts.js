import { sb } from './lib.js';

// Contactos das pessoas de um projeto, num só sítio: equipa com conta (project_members + perfil),
// equipa sem conta (project_crew) e elenco (characters: ator/atriz, telefone e email em info).
// Usado pela folha de contactos, pela folha de serviço e pelo mapa de transportes,
// para o telefone de cada pessoa aparecer sozinho assim que está preenchido num sítio.
export async function projectContacts(p) {
  const deps = new Map((p.departments || []).map((d) => [d.id, d.name]));
  const [{ data: mem }, { data: crew }, { data: chars }] = await Promise.all([
    sb.from('project_members').select('user_id, job, depts, phone, email, profiles!project_members_user_id_fkey(display_name, email, phone)').eq('project_id', p.id),
    sb.from('project_crew').select('name, job, depts, phone, email').eq('project_id', p.id).order('created_at'),
    sb.from('characters').select('name, actor, info').eq('project_id', p.id).order('position'),
  ]);
  const out = [];
  (mem || []).filter((m) => m.profiles).forEach((m) => out.push({ kind: 'crew', name: m.profiles.display_name, job: m.job || '', dept: (m.depts || []).map((d) => deps.get(d)).filter(Boolean).join(', '), phone: m.phone || m.profiles.phone || '', email: m.email || m.profiles.email || '' }));
  (crew || []).forEach((c) => out.push({ kind: 'crew', name: c.name, job: c.job || '', dept: (c.depts || []).map((d) => deps.get(d)).filter(Boolean).join(', '), phone: c.phone || '', email: c.email || '' }));
  (chars || []).forEach((c) => out.push({ kind: c.info?.extra ? 'extra' : 'cast', name: c.actor || c.name, role: c.name, job: c.info?.extra ? 'Figurante' : c.actor ? `Elenco · ${c.name}` : 'Elenco', dept: 'Elenco', phone: c.info?.phone || '', email: c.info?.email || '' }));
  return out;
}
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// telefone de alguém pelo nome (ator, personagem ou pessoa da equipa)
export const phoneFor = (list, name) => { const n = norm(name); if (!n) return ''; const x = list.find((c) => c.phone && (norm(c.name) === n || norm(c.role) === n)); return x?.phone || ''; };
// "Nome - 912 345 678", como nas folhas de serviço
export const nameWithPhone = (c) => [c.name, c.phone].filter(Boolean).join(' - ');
