import { sb, esc, modal, ICON } from './lib.js';
import { MODULES, modulesOf, modLabel, modPath, scriptMode } from './modules.js';

// Pesquisa dentro do projeto (Ctrl+K ou o botão da lupa): páginas, ferramentas, cenas, planos, personagens,
// décors, adereços, tarefas e figurinos. Tudo num só sítio, com o link para a página certa.
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function projectSearch(p, base) {
  const m = modal(`<div class="ps"><div class="ps-in">${ICON.search}<input type="search" placeholder="Procurar neste projeto: cenas, planos, pessoas, décors, adereços, tarefas…" autocomplete="off" aria-label="Procurar no projeto"></div><div class="ps-res" data-res><p class="muted small">A juntar o projeto…</p></div></div>`, { wide: true });
  const inp = m.el.querySelector('input'); const res = m.el.querySelector('[data-res]');
  setTimeout(() => inp.focus(), 30);
  const fic = scriptMode(p);
  const [sc, sh, ch, lo, pr, tk] = await Promise.all([
    sb.from('scenes').select('id, number, heading, time_of_day, position').eq('project_id', p.id).order('position'),
    sb.from('shots').select('id, code, description, framing').eq('project_id', p.id),
    sb.from('characters').select('id, name, actor, info').eq('project_id', p.id),
    sb.from('locations').select('id, name, info').eq('project_id', p.id),
    sb.from('props').select('id, name, category, removed').eq('project_id', p.id),
    sb.from('tasks').select('id, title, status').eq('project_id', p.id),
  ]);
  const items = [];
  const add = (group, title, sub, href, icon) => items.push({ group, title, sub, href, icon, k: norm(`${title} ${sub}`) });
  modulesOf(p).forEach((k) => add('Páginas', modLabel(p, k), MODULES[k].desc || '', `${base}/${modPath(p, k)}`, ICON[MODULES[k].icon]));
  [['atividade', 'Atividade'], ['equipa', 'Equipa e convites'], ['detalhes', 'Detalhes']].forEach(([k, l]) => add('Páginas', l, '', `${base}/${k}`, ICON.info));
  (p._boards || []).forEach((b) => add('Ferramentas', b.title || 'Sem nome', b.kind === 'wrd' ? 'Moodboard' : '', b.kind === 'board' || b.kind === 'wrd' || !b.kind ? `${base}/b/${b.id}` : `${base}/f/${b.id}`, ICON.board));
  (sc.data || []).forEach((s) => add(fic ? 'Cenas' : 'Secções', `${fic ? `${s.number} ` : ''}${s.heading || 'Sem nome'}`, s.time_of_day || '', `${base}/${fic ? 'cenas' : 'seguimento'}/${s.id}`, ICON.list));
  (sh.data || []).forEach((x) => add('Planos', x.code || 'Plano', [x.framing, x.description].filter(Boolean).join(' · '), `${base}/plano/${x.id}`, ICON.camera));
  (ch.data || []).forEach((c) => { add(c.info?.extra ? 'Figurantes' : fic ? 'Personagens' : 'Elenco', c.name, c.actor || '', `${base}/${fic ? 'personagens' : 'elenco'}/${c.id}`, ICON.team); (c.info?.wardrobe?.costumes || []).forEach((k) => add('Figurino', k.name || 'Figurino', c.name, `${base}/figurino/${c.id}`, ICON.hanger)); });
  (lo.data || []).forEach((l) => add('Décors', l.name, l.info?.morada || l.info?.address || '', `${base}/decors/${l.id}`, ICON.home));
  (pr.data || []).filter((x) => !x.removed).forEach((x) => add('Adereços', x.name, x.category || '', `${base}/aderecos/${x.id}`, ICON.prop));
  (tk.data || []).forEach((t) => add('Tarefas', t.title, t.status === 'done' ? 'feita' : '', `${base}/tarefas`, ICON.task));
  let sel = 0; let shown = [];
  const draw = () => {
    const q = norm(inp.value).trim(); const ws = q.split(/\s+/).filter(Boolean);
    const rank = (x) => { const t = norm(x.title); return t === q ? 0 : t.startsWith(q) ? 1 : ws.every((w) => t.includes(w)) ? 2 : 3; };
    shown = ws.length ? items.filter((x) => ws.every((w) => x.k.includes(w))).map((x, i) => ({ x, r: rank(x), i })).sort((a, b) => a.r - b.r || a.i - b.i).map((y) => y.x).slice(0, 60) : items.filter((x) => x.group === 'Páginas' || x.group === 'Ferramentas').slice(0, 30);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    const groups = [...new Set(shown.map((x) => x.group))];
    let i = -1;
    res.innerHTML = shown.length ? groups.map((g) => `<div class="ps-g"><span class="ps-gh">${esc(g)}</span>${shown.filter((x) => x.group === g).map((x) => { i++; return `<a class="ps-r ${i === sel ? 'on' : ''}" href="${x.href}" data-i="${i}">${x.icon || ''}<span><b>${esc(x.title)}</b>${x.sub ? `<small>${esc(x.sub)}</small>` : ''}</span></a>`; }).join('')}</div>`).join('') : '<p class="muted small">Nada encontrado.</p>';
    // a ordem do teclado segue a ordem no ecrã
    shown = [...res.querySelectorAll('[data-i]')].map((a) => shown[+a.dataset.i]);
    res.querySelectorAll('.ps-r').forEach((a, k) => { a.dataset.i = k; a.classList.toggle('on', k === sel); a.addEventListener('click', () => m.close()); });
  };
  inp.addEventListener('input', () => { sel = 0; draw(); });
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); res.querySelector('.ps-r.on')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); res.querySelector('.ps-r.on')?.scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter' && shown[sel]) { e.preventDefault(); m.close(); location.hash = shown[sel].href; }
  });
  draw();
}
