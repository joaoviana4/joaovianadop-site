import { sb, esc, modal, toast, ICON, uploadImage, signedUrls, knownUrl } from './lib.js';
import { ACCENTS, setProjectAccent } from './appearance.js';

// Capa e cor de um projeto, numa só janela. A capa aparece no cartão e no topo da visão geral; a cor
// troca o azul do Studio enquanto se está dentro do projeto (o preto/branco do tema fica igual).
// `live`: a janela foi aberta dentro do próprio projeto, por isso a cor muda logo à volta.
const HEX = /^#[0-9a-f]{6}$/i;

export function projectLookModal(p, after, { live = false } = {}) {
  const cur = HEX.test(p.accent || '') ? p.accent.toLowerCase() : null;
  const custom = cur && !ACCENTS.some(([c]) => c === cur);
  const coverUrl = p.cover_path ? knownUrl(p.cover_path) : null;
  const m = modal(`<h2>Capa e cor</h2><p class="muted small">Toda a equipa do projeto vê a capa e a cor.</p>
    <div class="stack pl-form">
      <div class="field"><span class="label">Capa</span>
        <div class="pl-cover ${p.cover_path ? 'has' : ''}" data-plcov ${coverUrl ? `style="background-image:url('${esc(coverUrl)}')"` : ''}>${p.cover_path ? '' : `<span>${ICON.image} Sem capa</span>`}</div>
        <div class="row wrap-gap"><button type="button" class="btn sm" data-plpick>${ICON.image}<span>${p.cover_path ? 'Mudar a imagem…' : 'Escolher imagem…'}</span></button>${p.cover_path ? '<button type="button" class="link-btn small" data-plnocov>Tirar a capa</button>' : ''}</div>
      </div>
      <div class="field"><span class="label">Cor do projeto</span>
        <div class="look-sw">${ACCENTS.map(([c, l]) => `<button type="button" class="look-c ${cur === c ? 'on' : ''}" style="--c:${c}" data-plc="${c}" aria-label="${esc(l)}" title="${esc(l)}"></button>`).join('')}
          <label class="look-c custom ${custom ? 'on' : ''}" title="Outra cor" style="--c:${esc(cur || '#e5579b')}"><input type="color" value="${esc(cur || '#e5579b')}" data-plcustom aria-label="Outra cor">+</label></div>
        <p class="muted small">Troca o azul por esta cor dentro do projeto: botões, seleções e destaques. O fundo preto (ou claro) fica igual.</p>
        ${cur ? '<button type="button" class="link-btn small" data-plnone>Sem cor própria (usa a da Aparência de cada pessoa)</button>' : ''}
      </div>
      <div class="row end"><button type="button" class="btn primary" data-close>Feito</button></div>
    </div>`);
  const reopen = () => { m.close(); projectLookModal(p, after, { live }); };
  const done = () => { after && after(); };

  // ---- capa ----
  if (p.cover_path && !coverUrl) signedUrls([p.cover_path]).then((u) => { const el = m.el.querySelector('[data-plcov]'); if (el && u[p.cover_path]) el.style.backgroundImage = `url('${u[p.cover_path]}')`; }).catch(() => {});
  m.el.querySelector('[data-plpick]').addEventListener('click', () => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
    inp.onchange = async () => {
      if (!inp.files?.[0]) return;
      try {
        toast('A enviar a capa…');
        const up = await uploadImage(p.id, 'cover', inp.files[0]);
        const { error } = await sb.from('projects').update({ cover_path: up.path }).eq('id', p.id);
        if (error) throw error;
        p.cover_path = up.path;
        await signedUrls([up.path]).catch(() => ({}));
        toast('Capa mudada.'); done(); reopen();
      } catch (e) { toast(e.message || String(e)); }
    };
    inp.click();
  });
  m.el.querySelector('[data-plnocov]')?.addEventListener('click', async () => {
    const { error } = await sb.from('projects').update({ cover_path: null }).eq('id', p.id);
    if (error) return toast(error.message);
    p.cover_path = null; toast('Capa tirada.'); done(); reopen();
  });

  // ---- cor ----
  const save = async (c) => {
    const v = c && HEX.test(c) ? c.toLowerCase() : null;
    const { error } = await sb.from('projects').update({ accent: v }).eq('id', p.id);
    if (error) { if (live) setProjectAccent(p.accent); return toast(error.message); }
    p.accent = v; if (live) setProjectAccent(v);
    toast(v ? 'Cor do projeto mudada.' : 'O projeto volta à cor de cada pessoa.'); done(); reopen();
  };
  m.el.querySelectorAll('[data-plc]').forEach((b) => b.addEventListener('click', () => save(b.dataset.plc)));
  const ci = m.el.querySelector('[data-plcustom]');
  ci.addEventListener('input', () => { if (live) setProjectAccent(ci.value); ci.closest('.look-c')?.style.setProperty('--c', ci.value); });
  ci.addEventListener('change', () => save(ci.value));
  m.el.querySelector('[data-plnone]')?.addEventListener('click', () => save(null));
}
