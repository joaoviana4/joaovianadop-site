import { sb, esc, toast, ICON, state, signedUrls, knownUrl, greeting, compressImage, saveLater } from './lib.js';
import { FLAVOR } from './flavor.js';

// Banner do início ("Boa tarde, nome"): cada pessoa escolhe o seu. Fica no perfil (profiles.prefs.hero):
// { img: <caminho da imagem>, pos: 0–100 (enquadramento vertical), color, title, kicker,
//   size: 'compact' | 'normal' | 'tall', grain: true/false }
// A imagem vai para a pasta da própria pessoa (FLAVOR.ownDir: no Studio photos/<uid>/…, na byGrain files/u/<uid>/…),
// que só ela pode ver e mudar.
const DEF = { img: null, pos: 50, color: '', title: '', kicker: '', size: 'normal', grain: true };
const COLORS = ['', '#111114', '#2B2B33', '#3A2E5C', '#1F4E3D', '#6B2B2B', '#8A5A12', '#0E4A6B'];
const cfg = () => ({ ...DEF, ...(state.profile?.prefs?.hero || {}) });
const first = () => (state.profile?.display_name || '').split(' ')[0];
const titleOf = (c) => (c.title ? c.title.replace(/\{nome\}/gi, first()).replace(/\{sauda[cç][aã]o\}/gi, greeting()) : `${greeting()}, ${first()}.`);
export const heroTitle = () => titleOf(cfg());

// desenha o banner com a configuração (a guardada ou a que está a ser escolhida)
export function applyHero(el, c = cfg()) {
  if (!el) return;
  el.classList.toggle('hero-compact', c.size === 'compact');
  el.classList.toggle('hero-tall', c.size === 'tall');
  const gl = el.querySelector('.grain-layer'); if (gl) gl.hidden = c.grain === false;
  el.style.backgroundColor = c.color || '';
  // texto claro em cima de imagem ou de cor escura; escuro em cima de cor clara
  const lum = (hex) => { const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return null; const n = parseInt(m[1], 16); return (0.2126 * (n >> 16 & 255) + 0.7152 * (n >> 8 & 255) + 0.0722 * (n & 255)) / 255; };
  const L = lum(c.color);
  el.classList.toggle('hero-on-dark', !!c.img || (L != null && L < 0.55));
  el.classList.toggle('hero-on-light', !c.img && L != null && L >= 0.55);
  const set = (u) => {
    el.style.backgroundImage = u ? `linear-gradient(rgba(10,10,16,.12), rgba(10,10,16,.62)), url('${u}')` : '';
    el.style.backgroundPosition = `center ${c.pos ?? 50}%`;
    el.classList.toggle('hero-img', !!u);
  };
  if (c.img) { const k = knownUrl(c.img); if (k) set(k); else signedUrls([c.img]).then((m) => set(m[c.img])).catch(() => set(null)); } else set(null);
  const h = el.querySelector('[data-hero-title]'); if (h) h.textContent = titleOf(c);
  const k = el.querySelector('[data-hero-kicker]'); if (k) { k.textContent = c.kicker || ''; k.hidden = !c.kicker; }
}

const savePrefs = saveLater(async (hero) => {
  const prefs = { ...(state.profile.prefs || {}), hero };
  state.profile.prefs = prefs;
  const { error } = await sb.from('profiles').update({ prefs }).eq('id', state.profile.id);
  if (error) toast('Não foi possível guardar o banner: ' + error.message);
}, 500);

// botão "Personalizar" no banner: um painel ao lado, e o banner muda enquanto se escolhe
export function heroEditor(el) {
  const btn = el.querySelector('[data-hero-edit]'); if (!btn) return;
  let pop = null;
  btn.addEventListener('click', () => {
    if (pop) { pop.close(); return; }
    let c = cfg();
    const p = document.createElement('div'); p.className = 'pm-tpop hero-pop'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'Personalizar o banner');
    document.body.append(p);
    const commit = () => { applyHero(el, c); savePrefs({ ...c }); };
    const draw = () => {
      p.innerHTML = `<div class="row between"><strong>O teu banner</strong><button type="button" class="icon-btn sm" data-x aria-label="Fechar">${ICON.close}</button></div>
        <div class="hp-sec"><span class="label">Imagem de fundo</span>
          <div class="row wrap-gap"><button type="button" class="btn ghost sm" data-img>${ICON.image} ${c.img ? 'Mudar' : 'Escolher imagem'}</button>${c.img ? '<button type="button" class="btn ghost sm" data-noimg>Tirar</button>' : ''}</div>
          ${c.img ? `<label class="hp-range"><span class="muted small">Enquadramento</span><input type="range" min="0" max="100" value="${c.pos ?? 50}" data-pos aria-label="Enquadramento vertical"></label>` : ''}</div>
        <div class="hp-sec"><span class="label">Cor${c.img ? ' (por trás da imagem)' : ''}</span>
          <div class="look-sw">${COLORS.map((x) => `<button type="button" class="look-c ${(c.color || '') === x ? 'on' : ''}" style="--c:${x || 'var(--blue)'}" data-col="${x}" aria-label="${x || 'Igual ao tema'}" title="${x || 'Igual ao tema'}"></button>`).join('')}
            <label class="look-c custom ${c.color && !COLORS.includes(c.color) ? 'on' : ''}" title="Outra cor" style="--c:${esc(c.color || '#444')}"><input type="color" value="${esc(c.color || '#444444')}" data-colc aria-label="Outra cor">+</label></div></div>
        <div class="hp-sec"><label class="label" for="hp-t">Título</label><input id="hp-t" data-t value="${esc(c.title)}" placeholder="${esc(`${greeting()}, ${first()}.`)}" maxlength="80">
          <small class="muted">Vazio: a saudação do dia. Podes usar {nome} e {saudação}.</small></div>
        <div class="hp-sec"><label class="label" for="hp-k">Frase pequena por cima</label><input id="hp-k" data-k value="${esc(c.kicker)}" placeholder="Ex.: Temporada de videoclipes 2026" maxlength="90"></div>
        <div class="hp-sec"><span class="label">Altura</span><div class="seg dark" role="radiogroup" aria-label="Altura">${[['compact', 'Baixo'], ['normal', 'Normal'], ['tall', 'Alto']].map(([k, l]) => `<button type="button" role="radio" aria-checked="${c.size === k}" aria-selected="${c.size === k}" data-size="${k}">${l}</button>`).join('')}</div></div>
        <label class="check"><input type="checkbox" data-grain ${c.grain !== false ? 'checked' : ''}><span>Grão por cima</span></label>
        <div class="row between"><button type="button" class="link-btn small" data-reset>Voltar ao original</button><button type="button" class="btn primary sm" data-ok>Feito</button></div>`;
      p.querySelector('[data-x]').addEventListener('click', close);
      p.querySelector('[data-ok]').addEventListener('click', close);
      p.querySelector('[data-img]').addEventListener('click', pickImg);
      p.querySelector('[data-noimg]')?.addEventListener('click', () => { c.img = null; commit(); draw(); });
      p.querySelector('[data-pos]')?.addEventListener('input', (e) => { c.pos = +e.target.value; commit(); });
      p.querySelectorAll('[data-col]').forEach((b) => b.addEventListener('click', () => { c.color = b.dataset.col; commit(); draw(); }));
      p.querySelector('[data-colc]').addEventListener('input', (e) => { c.color = e.target.value; commit(); });
      p.querySelector('[data-colc]').addEventListener('change', () => draw());
      p.querySelector('[data-t]').addEventListener('input', (e) => { c.title = e.target.value; commit(); });
      p.querySelector('[data-k]').addEventListener('input', (e) => { c.kicker = e.target.value; commit(); });
      p.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { c.size = b.dataset.size; commit(); draw(); }));
      p.querySelector('[data-grain]').addEventListener('change', (e) => { c.grain = e.target.checked; commit(); });
      p.querySelector('[data-reset]').addEventListener('click', () => { c = { ...DEF }; commit(); draw(); });
      place();
    };
    const pickImg = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = async () => {
        const f = inp.files[0]; if (!f) return;
        try {
          toast('A enviar a imagem…');
          const { blob, ext } = await compressImage(f, 2400);
          const own = FLAVOR.ownDir(state.user.id);
          const path = `${own.dir}/${crypto.randomUUID()}.${ext}`;
          const { error } = await sb.storage.from(own.bucket).upload(path, blob, { contentType: blob.type || 'image/webp', upsert: false });
          if (error) throw error;
          const old = c.img; c.img = `${own.prefix}${path}`; c.pos = 50; commit(); draw();
          // a imagem anterior (da própria pessoa) já não faz falta
          if (old?.startsWith(`${own.prefix}${own.dir}/`)) sb.storage.from(own.bucket).remove([old.slice(own.prefix.length)]).catch(() => {});
        } catch (e) { toast('Não foi possível enviar: ' + (e.message || e)); }
      };
      inp.click();
    };
    const place = () => { const r = btn.getBoundingClientRect(); p.style.top = `${Math.min(window.innerHeight - p.offsetHeight - 12, r.bottom + 8)}px`; p.style.left = `${Math.max(12, r.right - p.offsetWidth)}px`; };
    const out = (e) => { if (!p.contains(e.target) && !btn.contains(e.target)) close(); };
    const key = (e) => { if (e.key === 'Escape') close(); };
    function close() { p.remove(); pop = null; document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', key, true); savePrefs.now?.(); }
    draw();
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', key, true); });
    pop = { close };
  });
}
