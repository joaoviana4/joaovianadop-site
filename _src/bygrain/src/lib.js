import { createClient } from '@supabase/supabase-js';

// Projeto Supabase "byGrain" (separado do BlackCat). A chave anon é pública por natureza;
// o que protege os dados são as regras de acesso (RLS) na base de dados.
export const SUPABASE_URL = 'https://ppovjdyrhdfedjcdnnol.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwb3ZqZHlyaGRmZWRqY2Rubm9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5OTI5MzAsImV4cCI6MjEwNzU2ODkzMH0.kPXLy8d8J0RoiRrXbihP17BU264RWbnsJ1Mokvkcf_8';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bygrain-auth' },
});

// O Supabase exige palavras-passe com 6+ caracteres. Para aceitar palavras-passe curtas
// na fase de teste (ex: 1234), a app junta sempre o mesmo prefixo antes de enviar.
// Tem de ser igual em todo o lado (entrar, criar conta, convites, mudar palavra-passe).
export const authPw = (p) => 'bygrain:' + p;
export const MIN_PW = 4;

export const BASE = '/bygrain/';

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
  redes: 'Redes sociais', documentario: 'Documentário', outro: 'Outro', central: 'Central',
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
export const state = { user: null, profile: null };

export async function loadProfile() {
  const { data: { session } } = await sb.auth.getSession();
  state.user = session?.user || null;
  if (!state.user) { state.profile = null; return null; }
  const { data } = await sb.from('profiles').select('*').eq('id', state.user.id).single();
  state.profile = data;
  const { data: perms } = await sb.from('user_perms').select('perm').eq('user_id', state.user.id);
  state.perms = new Set((perms || []).map((x) => x.perm));
  return data;
}
export const isStaff = () => ['admin', 'member'].includes(state.profile?.role);
export const isAdmin = () => state.profile?.role === 'admin';
// permissões: os administradores têm tudo; os outros só o que um administrador lhes der
export const PERMS = { budget: ['Orçamentos', 'Vê e edita o orçamento e os valores de todos os projetos'], finance: ['Finanças', 'Vê e edita as finanças da Central (movimentos, contas e despesas)'] };
export const hasPerm = (k) => isAdmin() || !!state.perms?.has(k);
// colunas de projects que a app pode ler (os valores vivem em project_budgets, protegidos)
export const PROJECT_COLS = 'id, name, client, kind, status, is_central, cover_path, departments, starts_on, ends_on, created_by, created_at, updated_at, done_at, music, layouts, modules';

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
  const { data, error } = await sb.functions.invoke(name, { body });
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
export async function signedUrl(path) {
  if (!path) return null;
  const c = urlCache.get(path);
  if (c && c.exp > Date.now()) return c.url;
  const { data } = await sb.storage.from('files').createSignedUrl(path, 3600 * 6);
  if (!data) return null;
  urlCache.set(path, { url: data.signedUrl, exp: Date.now() + 3600 * 5 * 1000 });
  return data.signedUrl;
}
export async function signedUrls(paths) {
  const need = [...new Set(paths.filter((p) => p && !(urlCache.get(p)?.exp > Date.now())))];
  if (need.length) {
    const { data } = await sb.storage.from('files').createSignedUrls(need, 3600 * 6);
    (data || []).forEach((d) => d.signedUrl && urlCache.set(d.path, { url: d.signedUrl, exp: Date.now() + 3600 * 5 * 1000 }));
  }
  return Object.fromEntries(paths.filter(Boolean).map((p) => [p, urlCache.get(p)?.url]));
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
  const { error } = await sb.storage.from('files').upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false });
  if (error) throw error;
  return { path, w, h };
}

export function registerSW() {
  if ('serviceWorker' in navigator && location.hostname !== 'localhost') {
    navigator.serviceWorker.register(BASE + 'sw.js', { scope: BASE }).catch(() => {});
  }
}

export const ICON = {
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
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
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/></svg>',
  open: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6"/></svg>',
  money: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6.5 9.5v5M17.5 9.5v5"/></svg>',
  bulb: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/></svg>',
  camera: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="7" width="13" height="10" rx="2"/><path d="M16 10.5l5-3v9l-5-3"/></svg>',
  prop: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8l8-4 8 4-8 4z"/><path d="M4 8v8l8 4 8-4V8M12 12v8"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  circle: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/></svg>',
  half: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 1 0 17z" class="fill"/></svg>',
  done: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5" class="fill"/><path d="M8 12.5l2.8 2.8L16.5 9.5" class="ink"/></svg>',
};

export const LOGO = (sub = 'studio') => `<span class="logo" aria-label="byGrain ${esc(sub)}"><span class="logo-mark"><span class="by">by</span><span class="grain">grain</span><span class="reg">®</span></span><span class="logo-sub">${esc(sub)}</span></span>`;
