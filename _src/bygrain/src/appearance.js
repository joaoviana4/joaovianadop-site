import { sb, state, esc, modal, toast, ICON } from './lib.js';

// Aparência do PØRTAL Studio, à escolha de cada pessoa: tema (claro, escuro ou o do sistema),
// cor de destaque e fundo. Fica no navegador (para abrir já com o aspeto certo) e no perfil
// (studio.profiles.prefs.look), para acompanhar a pessoa noutros computadores. O byGrain não usa isto.

const KEY = 'portal-look';
export const ACCENTS = [['#0071e3', 'Azul PØRTAL'], ['#5e5ce6', 'Índigo'], ['#bf5af2', 'Violeta'], ['#e5579b', 'Rosa'], ['#d93a3a', 'Vermelho'], ['#d9731f', 'Laranja'], ['#b88a00', 'Âmbar'], ['#1f9a5c', 'Verde'], ['#14857f', 'Verde-azulado'], ['#1d1d1f', 'Grafite']];
export const THEMES = [['light', 'Claro'], ['dark', 'Escuro'], ['auto', 'Como o sistema']];
export const BGS = [['liso', 'Liso'], ['quente', 'Papel quente'], ['frio', 'Frio'], ['pontos', 'Pontos'], ['cor', 'Toque de cor'], ['preto', 'Preto (só no escuro)']];
const DEF = { theme: 'light', accent: '#0071e3', bg: 'liso' };

let look = { ...DEF };
try { look = { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* nada */ }
const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyLook(l = look) {
  const r = document.documentElement;
  const theme = l.theme === 'auto' ? (mq?.matches ? 'dark' : 'light') : l.theme;
  r.dataset.theme = theme;
  r.dataset.bg = l.bg || 'liso';
  // grafite no escuro seria invisível: passa a quase branco
  const acc = l.accent === '#1d1d1f' && theme === 'dark' ? '#e5e5ea' : l.accent || DEF.accent;
  r.style.setProperty('--blue', acc);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#131315' : '#f5f5f7');
}
mq?.addEventListener?.('change', () => look.theme === 'auto' && applyLook());
applyLook();

function store(l, remote = true) {
  look = { ...DEF, ...l };
  try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* nada */ }
  applyLook();
  if (remote && state.profile) {
    const prefs = { ...(state.profile.prefs || {}), look };
    state.profile.prefs = prefs;
    sb.from('profiles').update({ prefs }).eq('id', state.profile.id).then(({ error }) => error && toast(error.message));
  }
}
// depois de carregar o perfil: o que está guardado na conta manda
export function syncLookFromProfile() {
  const l = state.profile?.prefs?.look;
  if (l && JSON.stringify({ ...DEF, ...l }) !== JSON.stringify(look)) store(l, false);
}

export const lookButton = () => `<button type="button" class="icon-btn look-btn" data-look aria-label="Aparência" title="Aparência">${ICON.palette}</button>`;

export function appearanceMenu() {
  const m = modal(`<h2>Aparência</h2><p class="muted small">Só muda o teu Studio. Fica guardado na tua conta.</p>
    <div class="stack look-form">
      <div class="field"><span class="label">Tema</span><div class="seg dark" role="radiogroup" aria-label="Tema">${THEMES.map(([k, l]) => `<button type="button" role="radio" aria-checked="${look.theme === k}" aria-selected="${look.theme === k}" data-theme-set="${k}">${l}</button>`).join('')}</div></div>
      <div class="field"><span class="label">Cor de destaque</span><div class="look-sw">${ACCENTS.map(([c, l]) => `<button type="button" class="look-c ${look.accent.toLowerCase() === c ? 'on' : ''}" style="--c:${c}" data-acc="${c}" aria-label="${esc(l)}" title="${esc(l)}"></button>`).join('')}
        <label class="look-c custom ${ACCENTS.some(([c]) => c === look.accent.toLowerCase()) ? '' : 'on'}" title="Outra cor" style="--c:${esc(look.accent)}"><input type="color" value="${esc(look.accent)}" data-acc-custom aria-label="Outra cor">+</label></div></div>
      <div class="field"><span class="label">Fundo</span><div class="look-bgs">${BGS.map(([k, l]) => `<button type="button" class="look-bg ${look.bg === k ? 'on' : ''}" data-bg-set="${k}"><i class="lb-${k}"></i><span>${l}</span></button>`).join('')}</div></div>
      <div class="row between"><button type="button" class="link-btn small" data-look-reset>Repor o aspeto original</button><button type="button" class="btn primary" data-close>Feito</button></div>
    </div>`);
  const redraw = () => { m.close(); appearanceMenu(); };
  m.el.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => { store({ ...look, theme: b.dataset.themeSet }); redraw(); }));
  m.el.querySelectorAll('[data-acc]').forEach((b) => b.addEventListener('click', () => { store({ ...look, accent: b.dataset.acc }); redraw(); }));
  const ci = m.el.querySelector('[data-acc-custom]');
  ci.addEventListener('input', () => { look.accent = ci.value; applyLook(); });
  ci.addEventListener('change', () => { store({ ...look, accent: ci.value }); redraw(); });
  m.el.querySelectorAll('[data-bg-set]').forEach((b) => b.addEventListener('click', () => { store({ ...look, bg: b.dataset.bgSet, ...(b.dataset.bgSet === 'preto' ? { theme: 'dark' } : {}) }); redraw(); }));
  m.el.querySelector('[data-look-reset]').addEventListener('click', () => { store({ ...DEF }); redraw(); });
}
