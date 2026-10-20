import { createClient } from '@supabase/supabase-js';
import { installUndo, waitWrites, writesPending, trackWrite } from './undo.js';
export { trackWrite };
import { FLAVOR, IS_STUDIO } from './flavor.js';
export { IS_STUDIO, FLAVOR };

// byGrain: Supabase "byGrain". Studio: BlackCat, esquema "studio" (ver flavor.js). A chave anon é pública por natureza;
// o que protege os dados são as regras de acesso (RLS) na base de dados.
export const SUPABASE_URL = FLAVOR.url;
const SUPABASE_ANON = FLAVOR.anon;

// Leituras repetidas: o mesmo pedido (GET/HEAD igual) feito por várias partes da página ao mesmo tempo, ou logo a
// seguir, vai à base de dados uma só vez. Dura 2 s depois de chegar; qualquer gravação limpa tudo, para nunca se
// mostrar algo velho depois de mudar alguma coisa. Também deixa pedir de antemão (warm) o que a página vai precisar.
const readCache = new Map();
const READ_TTL = 2000;
export const clearReadCache = () => readCache.clear();
function cachedFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const method = (init.method || (typeof input === 'string' ? 'GET' : input.method) || 'GET').toUpperCase();
  if (!url.includes('/rest/v1/')) return fetch(input, init);
  if (method !== 'GET' && method !== 'HEAD') { readCache.clear(); return fetch(input, init); }
  const h = new Headers(init.headers || (typeof input === 'string' ? undefined : input.headers));
  const key = [method, url, h.get('authorization'), h.get('accept'), h.get('accept-profile'), h.get('prefer'), h.get('range')].join('|');
  const hit = readCache.get(key);
  if (hit && (!hit.at || Date.now() - hit.at < READ_TTL)) return hit.p.then((r) => r.clone());
  const e = { at: 0, p: null };
  e.p = fetch(input, init).then((r) => { if (!r.ok) readCache.delete(key); else e.at = Date.now(); return r; }, (err) => { readCache.delete(key); throw err; });
  readCache.set(key, e);
  if (readCache.size > 300) readCache.delete(readCache.keys().next().value);
  return e.p.then((r) => r.clone());
}

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: FLAVOR.storageKey },
  db: { schema: FLAVOR.schema },
  global: { fetch: cachedFetch },
});
// mudanças feitas por outra pessoa (tempo real): o que se ler a seguir vem sempre fresco
{
  const ch = sb.channel.bind(sb);
  sb.channel = (...a) => { const c = ch(...a); const on = c.on.bind(c); c.on = (type, filter, cb) => on(type, filter, typeof cb === 'function' ? (...x) => { clearReadCache(); return cb(...x); } : cb); return c; };
}
// Ctrl+Z em todas as páginas (undo.js)
queueMicrotask(() => installUndo(sb, (m) => toast(m)));

// Gravações com pequeno atraso (enquanto se escreve). Ficam registadas para serem enviadas logo
// ao mudar de página, e a janela avisa antes de fechar se ainda houver alguma por guardar.
const pendingSaves = new Set();
export function saveLater(fn, ms = 600) {
  let t = null, args = [];
  const entry = { flush: () => { if (!t) return null; clearTimeout(t); t = null; pendingSaves.delete(entry); try { return fn(...args); } catch { return null; } } };
  const f = (...a) => { args = a; clearTimeout(t); pendingSaves.add(entry); t = setTimeout(entry.flush, ms); };
  f.now = (...a) => { if (a.length) args = a; clearTimeout(t); t = -1; pendingSaves.add(entry); return entry.flush(); };
  return f;
}
export async function settleSaves(ms = 6000) {
  const out = [...pendingSaves].map((e) => e.flush());
  await Promise.race([Promise.allSettled(out), new Promise((r) => setTimeout(r, ms))]);
  await waitWrites(ms);
}
window.addEventListener('beforeunload', (e) => {
  if (!pendingSaves.size && !writesPending()) return;
  [...pendingSaves].forEach((x) => x.flush());
  e.preventDefault(); e.returnValue = '';
});
// ao sair de uma página: tira o que ela pendurou na janela (colar, copiar, redimensionar…). Sem isto, cada página
// visitada ficava presa na memória e a reagir em segundo plano, e o Studio ia ficando mais lento ao longo do dia.
const leaveFns = new Set();
export const onLeave = (f) => { leaveFns.add(f); return f; };
export function runLeave() { const fs = [...leaveFns]; leaveFns.clear(); fs.forEach((f) => { try { f(); } catch { /* nada */ } }); }
// ficheiros: sb.storage.from(BUCKET)
export const BUCKET = FLAVOR.bucket;

// byGrain: o Supabase exige 6+ caracteres; para aceitar palavras-passe curtas na fase de teste (ex: 1234)
// a app junta sempre o mesmo prefixo antes de enviar. No Studio as contas são as do BlackCat: vai tal e qual.
export const authPw = (p) => FLAVOR.pwPrefix + p;
export const MIN_PW = FLAVOR.minPw;

export const BASE = FLAVOR.base;

// ---------- texto e datas ----------
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const DAY = 86400000;
export function todayISO() { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); }
export function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(todayISO() + 'T00:00:00'), b = new Date(iso + 'T00:00:00');
  return Math.round((b - a) / DAY);
}
export function dueInfo(iso, status) {
  if (!iso) return { label: 'Sem prazo', tone: 'none' };
  const n = daysUntil(iso);
  if (status === 'done') return { label: fmtDate(iso), tone: 'none' };
  if (n < 0) return { label: n === -1 ? 'Atrasada · ontem' : `Atrasada · ${-n} dias`, tone: 'late' };
  if (n === 0) return { label: 'Hoje', tone: 'soon' };
  if (n === 1) return { label: 'Amanhã', tone: 'soon' };
  return { label: `Em ${n} dias`, tone: 'later' };
}
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export function fmtDate(iso) { if (!iso) return ''; const d = new Date(iso.length <= 10 ? iso + 'T00:00:00' : iso); return `${d.getDate()} ${MESES[d.getMonth()]}`; }
export function greeting() { const h = new Date().getHours(); return h < 6 ? 'Boa noite' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; }
export function initials(name) { return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase(); }

export const KINDS = {
  ficcao: 'Ficção', campanha: 'Comercial', lancamento: 'Lançamento', videoclipe: 'Videoclipe', branded: 'Branded',
  redes: 'Redes sociais', documentario: 'Documentário', album: 'Álbum (pasta)', outro: 'Outro', central: 'Central',
};
export const STATUS = { todo: 'Por fazer', doing: 'Em curso', done: 'Feita' };
export const ROLES = { admin: 'Administrador', member: 'Membro', guest: 'Convidado' };

export function phaseOf(p) {
  if (!p.starts_on || !p.ends_on) return { label: '', pct: 0 };
  const s = new Date(p.starts_on), e = new Date(p.ends_on), now = new Date();
  const pct = Math.max(0, Math.min(1, (now - s) / Math.max(1, e - s)));
  const label = pct <= 0 ? 'Ainda não começou' : pct < 0.34 ? 'Pré-produção' : pct < 0.67 ? 'Produção' : pct < 1 ? 'Pós-produção e lançamento' : 'Prazo terminado';
  return { label, pct };
}

// ---------- toast e janelas ----------
let toastT;
export function toast(msg, ms = 2600) {
  const t = $('#toast'); if (!t) return;
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => (t.hidden = true), ms);
}

export function modal(html, { wide = false, onClose } = {}) {
  const root = $('#modal');
  root.innerHTML = `<div class="modal-back" data-close></div><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  root.classList.add('open');
  const close = () => { root.classList.remove('open'); root.innerHTML = ''; document.removeEventListener('keydown', onKey, true); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);
  root.querySelector('.modal-back').addEventListener('click', close);
  root.querySelectorAll('[data-close]').forEach((b) => b !== root.querySelector('.modal-back') && b.addEventListener('click', close));
  const first = root.querySelector('input, select, textarea, button:not([data-close])');
  first && setTimeout(() => first.focus(), 30);
  return { el: root.querySelector('.modal'), close };
}

export function confirmBox(text, okLabel = 'Confirmar') {
  return new Promise((res) => {
    const m = modal(`<h2>${esc(text)}</h2><div class="row end"><button class="btn ghost" data-close>Cancelar</button><button class="btn danger" data-ok>${esc(okLabel)}</button></div>`, { onClose: () => res(false) });
    m.el.querySelector('[data-ok]').addEventListener('click', () => { res(true); m.close(); });
  });
}

// ---------- sessão ----------
// ctx = onde estou: numa comunidade (comm) e/ou num projeto (project). As permissões do ecrã dependem disto.
export const state = { user: null, profile: null, comms: [], ctx: { comm: null, project: null } };

export async function loadProfile() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user || null;
  if (!state.user) { state.profile = null; return null; }
  const [{ data }] = await Promise.all([sb.from('profiles').select('*').eq('id', state.user.id).single(), loadComms()]);
  state.profile = data;
    return data;
}
// as minhas comunidades, com o meu papel e permissões em cada uma
let commsP = null;
export function loadComms() {
  if (!state.user) { state.comms = []; return Promise.resolve([]); }
  if (commsP) return commsP; // o mesmo pedido serve quem chamar ao mesmo tempo
  commsP = loadCommsNow().finally(() => { commsP = null; });
  return commsP;
}
async function loadCommsNow() {
  const { data } = await sb.from('community_members').select('role, perms, communities(id, name, slug, color, logo_path, business, created_at)').eq('user_id', state.user.id);
  state.comms = (data || []).filter((x) => x.communities).map((x) => ({ ...x.communities, my_role: x.role, my_perms: x.perms || [] })).sort((a, b) => a.name.localeCompare(b.name, 'pt'));
  return state.comms;
}
export const commById = (id) => state.comms.find((c) => c.id === id) || null;
export function setCtx({ comm = null, project = null } = {}) { state.ctx = { comm, project }; }
export const CID = () => state.ctx?.comm?.id || null;
// junta a comunidade atual a uma linha (ou lista de linhas) antes de gravar
export const withC = (x) => (Array.isArray(x) ? x.map((r) => ({ ...r, community_id: CID() })) : { ...x, community_id: CID() });
const ownsCtxProject = () => { const p = state.ctx?.project; return !!p && p.created_by === state.user?.id; };
// "equipa" = membro ou administrador da comunidade; num projeto pessoal, o dono; fora de tudo (início), eu
export const isStaff = () => { const c = state.ctx?.comm; if (c) return ['admin', 'member'].includes(c.my_role); return state.ctx?.project ? ownsCtxProject() : true; };
export const isAdmin = () => { const c = state.ctx?.comm; if (c) return c.my_role === 'admin'; return state.ctx?.project ? ownsCtxProject() : true; };
export const isPlatformAdmin = () => state.profile?.role === 'admin';
// permissões dentro da comunidade (dadas pelo administrador): orçamentos e finanças
export const PERMS = { budget: ['Orçamentos', 'Vê e edita o orçamento e os valores de todos os projetos da comunidade'], finance: ['Finanças', 'Vê e edita as finanças da Central (movimentos, contas e despesas)'] };
export const hasPerm = (k) => { const c = state.ctx?.comm; if (c) return c.my_role === 'admin' || (c.my_perms || []).includes(k); return state.ctx?.project ? ownsCtxProject() && k === 'budget' : false; };
// colunas de projects que a app pode ler (os valores vivem em project_budgets, protegidos)
export const PROJECT_COLS = 'id, community_id, name, client, kind, status, is_central, cover_path, departments, starts_on, ends_on, created_by, created_at, updated_at, done_at, music, layouts, modules, deleted_at, deleted_by, parent_id, lead_id, lead_ids, manager_id, stage';
// líderes do projeto (vários); lead_id fica com o primeiro, para o que ainda o lê
export const leadsOf = (p) => { const a = Array.isArray(p?.lead_ids) ? p.lead_ids.filter(Boolean) : []; return a.length ? a : p?.lead_id ? [p.lead_id] : []; };

export async function signIn(identifier, password) {
  let email = String(identifier || '').trim().toLowerCase();
  if (!email.includes('@')) {
    const { data } = await sb.rpc('email_for_username', { p_username: email });
    if (!data) throw new Error('Utilizador ou palavra-passe errados.');
    email = data;
  }
  const { error } = await sb.auth.signInWithPassword({ email, password: authPw(password) });
  if (error) throw new Error('Utilizador ou palavra-passe errados.');
}

export async function callFn(name, body) {
  const { data, error } = await sb.functions.invoke(FLAVOR.fn(name), { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); msg = j.error || msg; } catch { /* sem corpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------- ficheiros ----------
const urlCache = new Map();
// os links assinados (válidos 6 h) sobrevivem a recarregar a página: as imagens voltam a sair da cache do browser
try { const saved = JSON.parse(sessionStorage.getItem('portal-urls') || '[]'); saved.forEach(([k, v]) => { if (v?.exp > Date.now()) urlCache.set(k, v); }); } catch { /* sem armazenamento */ }
let urlSaveT = 0;
const saveUrls = () => { clearTimeout(urlSaveT); urlSaveT = setTimeout(() => { try { sessionStorage.setItem('portal-urls', JSON.stringify([...urlCache.entries()].slice(-1500))); } catch { /* cheio ou bloqueado */ } }, 800); };
// imagens que já são links da web (ex.: projetos de demonstração) não passam pelo armazenamento
const isWeb = (p) => /^https?:\/\//.test(p || '');
// 'vf:<caminho>' = fotografia do Viewfinder (balde photos do BlackCat); o resto = ficheiros do projeto
const bucketOf = (path) => (String(path).startsWith('vf:') ? ['photos', path.slice(3)] : [BUCKET, path]);
export async function signedUrl(path) {
  if (!path) return null;
  if (isWeb(path)) return path;
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const [bk, key] = bucketOf(path);
  const { data } = await sb.storage.from(bk).createSignedUrl(key, 3600 * 6);
  if (!data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3600 * 5 * 1000 });
  return data.signedUrl;
}
export async function signedUrls(paths) {
  const need = [...new Set(paths.filter((p) => p && !isWeb(p) && !(urlCache.get(p)?.exp > Date.now())))];
  if (need.length) {
    // por balde: os ficheiros do projeto e (no Studio) as fotografias do Viewfinder, que vêm como 'vf:<caminho>'
    const groups = {};
    for (const p of need) { const [bk, key] = bucketOf(p); (groups[bk] ||= []).push([p, key]); }
    await Promise.all(Object.entries(groups).map(async ([bk, list]) => {
      const { data } = await sb.storage.from(bk).createSignedUrls(list.map((x) => x[1]), 3600 * 6);
      const back = new Map(list.map(([p, key]) => [key, p]));
      (data || []).forEach((d) => d.signedUrl && urlCache.set(back.get(d.path) || d.path, { url: d.signedUrl, exp: Date.now() + 3600 * 5 * 1000 }));
      saveUrls();
    }));
  }
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, isWeb(p) ? p : urlCache.get(p)?.url]));
}

// Comprime imagens para WebP (máx. 2400 px) antes de enviar. Devolve {blob, w, h}.
export async function compressImage(file, max = 2400) {
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return { blob: file, w: 800, h: 600, ext: file.type === 'image/gif' ? 'gif' : 'svg' };
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * k), h = Math.round(bmp.height * k);
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/webp', 0.86));
  return { blob, w, h, ext: 'webp' };
}
export async function uploadImage(projectId, folder, file) {
  const { blob, w, h, ext } = await compressImage(file);
  const path = `${projectId}/${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false });
  if (error) throw error;
  return { path, w, h };
}

// instalar a app no computador (Chrome/Edge guardam o pedido; Safari não tem pedido: mostram-se os passos)
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; });
export const isInstalled = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export async function installApp() {
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null; return r?.outcome === 'accepted' ? 'ok' : 'no'; }
  return 'manual';
}
export function registerSW() {
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
    navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {});
  }
  watchVersion();
}

// avisa quando há uma versão nova do site publicada (uma janela aberta fica com a versão antiga até recarregar)
function watchVersion() {
  const mine = [...document.querySelectorAll('script[type=module][src]')].map((x) => new URL(x.src, location.href).pathname).sort().join('|');
  if (!mine) return;
  let shown = false;
  const check = async () => {
    if (shown || document.visibilityState !== 'visible') return;
    try {
      const html = await (await fetch(location.pathname.replace(/[^/]*$/, '') + 'index.html', { cache: 'no-store' })).text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const live = [...doc.querySelectorAll('script[type=module][src]')].map((x) => new URL(x.getAttribute('src'), location.href).pathname).sort().join('|');
      if (live && live !== mine) {
        shown = true;
        const bar = document.createElement('div');
        bar.className = 'new-version'; bar.setAttribute('role', 'status');
        bar.innerHTML = '<span>Há uma versão nova do studio.</span><button type="button" class="btn primary sm">Atualizar</button><button type="button" class="new-x" aria-label="Fechar">×</button>';
        bar.querySelector('.btn').onclick = () => location.reload();
        bar.querySelector('.new-x').onclick = () => bar.remove();
        document.body.append(bar);
      }
    } catch { /* sem ligação */ }
  };
  setInterval(check, 120000);
  document.addEventListener('visibilitychange', check);
}

export const ICON = {
  table: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10"/></svg>',
  globe: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5s1.1-5.9 3.6-8.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  car: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 16v-4l2-5h12l2 5v4"/><rect x="3" y="12" width="18" height="5" rx="1.5"/><circle cx="7.5" cy="17.5" r="1.5"/><circle cx="16.5" cy="17.5" r="1.5"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>',
  lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  music: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/></svg>',
  question: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5v.01"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  back: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  chev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  dots: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5"/></svg>',
  image: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6l-1 6 3 3v1H7v-1l3-3z"/><path d="M12 14v6"/></svg>',
  hanger: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7.5a2 2 0 1 1 2-2"/><path d="M12 7.5v1.2L3.4 15.6a1.2 1.2 0 0 0 .8 2.1h15.6a1.2 1.2 0 0 0 .8-2.1L12 8.7"/></svg>',
  palette: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.6-1 1.1-1.9-.6-1-.1-2.1 1.1-2.1H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/></svg>',
  list: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6l1 1 2-2M4 12l1 1 2-2M4 18l1 1 2-2"/></svg>',
  board: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="5" height="5"/><path d="M14 8h3M14 12h3M7 16h10"/></svg>',
  title: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>',
  task: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12.5l2.8 2.8L16.5 9.5"/></svg>',
  team: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.8.2 5 2.6 5 5.8"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/></svg>',
  home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/></svg>',
  fit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  minus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
  hide: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c5 0 9 6 9 6a17 17 0 0 1-2.6 3.2M6.6 6.6C4.3 8.2 3 12 3 12s4 6 9 6c1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6z"/><circle cx="12" cy="12" r="3"/></svg>',
  megaphone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 10v4h3l7 4V6L6 10H3zM16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
  bell: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2zM10 20a2 2 0 0 0 4 0"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4.5h4.5M12 8v4.5l3 1.8"/></svg>',
  money: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/></svg>',
  prop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/></svg>',
  half: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" class="fill"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" class="fill"/><path d="M8 12.5l2.8 2.8L16.5 9.5" class="ink"/></svg>',
};

const PORTAL_MARK = '<svg class="pmark" viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="9.5" fill="none" stroke="currentColor" stroke-width="4.4"/><path d="M5.5 26.5 26.5 5.5" stroke="currentColor" stroke-width="3.2"/></svg>';
export const LOGO = IS_STUDIO
  ? (sub = 'studio') => `<span class="logo plogo" aria-label="PØRTAL ${esc(sub)}">${PORTAL_MARK}<span class="plogo-name">PØRTAL <span>${esc(sub === 'studio' ? 'STUDIØ' : String(sub).toUpperCase())}</span></span></span>`
  : (sub = 'studio') => `<span class="logo" aria-label="byGrain ${esc(sub)}"><span class="logo-mark"><span class="by">by</span><span class="grain">grain</span><span class="reg">®</span></span><span class="logo-sub">${esc(sub)}</span></span>`;

// Tirar um projeto só da minha lista (como no Milanote): os outros continuam a vê-lo.
// Mandar para a reciclagem (para toda a gente) é só para administradores.
export async function loadHidden() { const { data } = await sb.from('project_hidden').select('project_id, hidden_at'); return new Map((data || []).map((x) => [x.project_id, x.hidden_at])); }
export async function hideProject(id) { const { error } = await sb.from('project_hidden').insert({ project_id: id }); if (error && !/duplicate/i.test(error.message)) { toast(error.message); return false; } return true; }
export async function unhideProject(id) { const { error } = await sb.from('project_hidden').delete().eq('project_id', id); if (error) { toast(error.message); return false; } return true; }

// ---------- avisos no telemóvel (web push) ----------
export const VAPID_PUBLIC = FLAVOR.vapid || 'BFN0DLO1kU0Ydsua1qfcY7Jcm-pE0E8To76LCxC1m51yTizh018Lnqp2Wf8ILE2ouHYh-ToVxOuF5hxnqV1s_N8';
const b64u = (s) => { const p = '='.repeat((4 - (s.length % 4)) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map((c) => c.charCodeAt(0))); };
export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export async function pushState() {
  if (!pushSupported()) return isIOS() && !isStandalone() ? 'install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration(BASE); const sub = reg && (await reg.pushManager.getSubscription());
  return sub ? 'on' : 'off';
}
export async function enablePush() {
  if (!pushSupported()) throw new Error(isIOS() ? 'Primeiro adiciona a app ao ecrã principal e abre-a a partir do ícone.' : 'Este browser não suporta avisos.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Os avisos foram bloqueados. Podes ligá-los nas definições do telemóvel.');
  const reg = (await navigator.serviceWorker.getRegistration(BASE)) || (await navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }));
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64u(VAPID_PUBLIC) }));
  const j = sub.toJSON();
  await sb.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await sb.from('push_subscriptions').insert({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) });
  if (error) throw error;
}
export async function disablePush() {
  const reg = await navigator.serviceWorker.getRegistration(BASE); const sub = reg && (await reg.pushManager.getSubscription());
  if (sub) { await sb.from('push_subscriptions').delete().eq('endpoint', sub.endpoint); await sub.unsubscribe(); }
}
export const DB_SCHEMA = FLAVOR.schema;
