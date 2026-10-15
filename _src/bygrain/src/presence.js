import { sb, state, esc, initials, ICON } from './lib.js';

// Quem está onde, em tempo real (Supabase Realtime Presence), por projeto.
// · Páginas e ferramentas: só uma janela pode editar de cada vez. Quem chega depois vê em modo de leitura,
//   com o nome de quem está a editar, e pode editar logo que essa pessoa sai.
// · Boards: várias pessoas ao mesmo tempo, mas cada cartão só pode ser mexido por uma de cada vez.
// Cada separador conta como uma presença (duas janelas tuas também não se pisam).

const TAB = Math.random().toString(36).slice(2, 10);
const IDLE_MS = 5 * 60 * 1000;
let room = null; // { pid, ch, me, subs: Set, ready }

function meBase() {
  return { uid: state.user.id, name: state.profile?.display_name || 'Alguém', color: state.profile?.color || '#8A8A99', tab: TAB, at: Date.now(), page: null, holds: null, since: null, board: null, card: null };
}

function others() {
  if (!room) return [];
  const st = room.ch.presenceState();
  return Object.values(st).flat().filter((x) => x.tab !== TAB);
}
const emit = () => room?.subs.forEach((fn) => { try { fn(others()); } catch { /* nada */ } });

export function joinProject(pid) {
  if (!state.user) return null;
  if (room?.pid === pid) return room;
  leaveProject();
  const ch = sb.channel(`room:${pid}`, { config: { presence: { key: `${state.user.id}:${TAB}` } } });
  room = { pid, ch, me: meBase(), subs: new Set(), ready: false };
  const r = room;
  ch.on('presence', { event: 'sync' }, emit)
    .subscribe(async (status) => { if (status === 'SUBSCRIBED' && room === r) { r.ready = true; await ch.track(r.me); emit(); } });
  return room;
}
export function leaveProject() {
  if (!room) return;
  try { room.ch.untrack(); sb.removeChannel(room.ch); } catch { /* nada */ }
  room = null;
}
async function update(patch) {
  if (!room) return;
  Object.assign(room.me, patch);
  if (room.ready) { try { await room.ch.track(room.me); } catch { /* sem ligação */ } }
}
export function onPresence(fn) { room?.subs.add(fn); fn(others()); return () => room?.subs.delete(fn); }
export const whoLabel = (x) => (x.uid === state.user?.id ? 'Tu, noutra janela' : x.name);

// ---------- bloquear uma página / ferramenta ----------
// root: o elemento com o conteúdo editável. reopen: volta a abrir a página (com dados frescos).
export function lockPage(key, root, { reopen } = {}) {
  if (!room) return { destroy() {} };
  const banner = document.createElement('div');
  banner.className = 'lock-banner'; banner.hidden = true;
  document.body.append(banner);
  let mode = 'pending'; let idleT; let wasViewer = false; let lastHolder = null;
  const since = Date.now();
  // modo só de leitura "suave": vídeos, música e links continuam a funcionar; só o que muda dados fica parado
  let locked = false;
  const allowed = (t) => !!t.closest?.('a[href], .yt, iframe, audio, video, .lock-banner, [data-lock-ok]');
  const guard = (e) => {
    if (!locked || allowed(e.target)) return;
    if (e.type === 'keydown' && !['Tab', 'Escape'].includes(e.key) && !e.key.startsWith('Arrow') && !e.key.startsWith('Page') && e.key !== 'Home' && e.key !== 'End' && !e.target.matches?.('input, textarea, select, [contenteditable]')) return;
    if (e.type === 'keydown' && (e.key === 'Tab' || e.key.startsWith('Arrow') || e.key.startsWith('Page'))) return;
    if (e.type === 'pointerdown' && !e.target.closest?.('button, input, textarea, select, label, [contenteditable], [draggable=true], [data-img], [role=button]')) return;
    if (e.type === 'click' && !e.target.closest?.('button, input, select, label, [data-img], [role=button]')) return;
    e.preventDefault(); e.stopPropagation();
    if (e.type === 'click' || e.type === 'pointerdown') { banner.classList.remove('nudge'); void banner.offsetWidth; banner.classList.add('nudge'); }
  };
  ['beforeinput', 'keydown', 'click', 'change', 'paste', 'drop', 'dragstart', 'pointerdown'].forEach((ev) => root.addEventListener(ev, guard, true));
  const setLocked = (on) => { locked = on; root.classList.toggle('is-locked', on); };
  // carregar dentro de um vídeo do YouTube conta como atividade (o clique fica dentro do vídeo)
  const onBlur = () => setTimeout(() => { if (document.activeElement?.tagName === 'IFRAME' && root.contains(document.activeElement)) bump(); }, 0);
  window.addEventListener('blur', onBlur);
  update({ page: key, holds: key, since });

  const holderOf = (list) => {
    const all = [...list.filter((x) => x.holds === key), ...(room.me.holds === key ? [room.me] : [])];
    all.sort((a, b) => (a.since || 0) - (b.since || 0) || String(a.tab).localeCompare(String(b.tab)));
    return all[0] || null;
  };
  const render = (list) => {
    const h = holderOf(list);
    if (h && h.tab !== TAB) {
      mode = 'viewer'; wasViewer = true; lastHolder = h;
      setLocked(true);
      banner.hidden = false;
      banner.innerHTML = `<span class="avatar sm" style="--c:${esc(h.color)}">${esc(initials(h.name))}</span><span><strong>${esc(whoLabel(h))} está a editar isto.</strong> Para não se apagarem um ao outro, aqui ficas só a ver. Quando sair, podes editar.</span>`;
    } else if (room.me.holds === key) {
      setLocked(false);
      if (wasViewer && mode === 'viewer') {
        // quem estava a editar saiu: recarregar para trazer o que mudou
        banner.hidden = false;
        banner.innerHTML = `${ICON.refresh}<span><strong>${esc(lastHolder ? whoLabel(lastHolder) : 'A outra pessoa')} saiu.</strong> Atualiza para veres as alterações e editares.</span><button type="button" class="btn primary" data-reload>Atualizar e editar</button>`;
        setLocked(true);
        banner.querySelector('[data-reload]').onclick = () => reopen && reopen();
        mode = 'stale';
      } else if (mode !== 'stale') { mode = 'editor'; banner.hidden = true; }
    } else if (mode === 'idle') {
      banner.hidden = false;
    }
  };
  const off = onPresence(render);

  // inatividade: larga a edição para outra pessoa poder entrar
  const bump = () => {
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      if (mode !== 'editor') return;
      mode = 'idle'; update({ holds: null });
      setLocked(true);
      banner.hidden = false;
      banner.innerHTML = `${ICON.lock}<span><strong>Pausado por estares parado.</strong> Assim outra pessoa pode editar.</span><button type="button" class="btn primary" data-resume>Continuar a editar</button>`;
      banner.querySelector('[data-resume]').onclick = () => reopen && reopen();
    }, IDLE_MS);
  };
  ['pointerdown', 'keydown', 'input'].forEach((ev) => root.addEventListener(ev, bump, true));
  bump();
  return {
    destroy() {
      off(); clearTimeout(idleT); banner.remove(); setLocked(false); ['beforeinput', 'keydown', 'click', 'change', 'paste', 'drop', 'dragstart', 'pointerdown'].forEach((ev) => root.removeEventListener(ev, guard, true)); window.removeEventListener('blur', onBlur);
      if (room?.me.holds === key || room?.me.page === key) update({ holds: null, page: null, since: null });
    },
  };
}

// ---------- boards: cartões em uso ----------
export function boardPresence(boardId) {
  update({ board: boardId, card: null, page: `board:${boardId}` });
  return {
    me: state.user?.id,
    setCard(id) { if (room && room.me.card !== id) update({ card: id }); },
    // devolve Map(cardId -> pessoa) com os cartões que outras janelas estão a mexer
    onCards(fn) { return onPresence((list) => fn(new Map(list.filter((x) => x.board === boardId && x.card).map((x) => [x.card, x])))); },
    onPeople(fn) { return onPresence((list) => fn(list.filter((x) => x.board === boardId))); },
    leave() { update({ board: null, card: null, page: null }); },
  };
}

// avatares de quem está no projeto (para o menu do projeto)
export function peopleHere(list) {
  const seen = new Map();
  list.forEach((x) => { if (!seen.has(x.uid) || x.uid === state.user?.id) seen.set(x.uid + (x.uid === state.user?.id ? x.tab : ''), x); });
  return [...seen.values()];
}
