import { esc } from './lib.js';

// Formatação de texto partilhada pelos boards (notas, títulos, listas) e pelo Texto das páginas:
// letras, tamanhos, cores, e a limpeza do HTML que se guarda (só formatação simples).
export const FONTS = [['', 'Predefinida'], ['Instrument Sans', 'Instrument Sans'], ['Inter', 'Inter'], ['Montserrat', 'Montserrat'], ['Archivo Black', 'Archivo Black'], ['Bebas Neue', 'Bebas Neue'],
  ['Playfair Display', 'Playfair Display'], ['DM Serif Display', 'DM Serif Display'], ['Lora', 'Lora'], ['Instrument Serif', 'Instrument Serif'], ['Space Mono', 'Space Mono'], ['Courier Prime', 'Courier Prime'], ['Caveat', 'Caveat (à mão)']];
export const SIZES = [['s', 'Pequeno', 0.8], ['m', 'Normal', 1], ['l', 'Grande', 1.35], ['xl', 'Muito grande', 1.8]];
const BASE = { note: 15, title: 44, list: 14, text: 17 };
export const TEXT_COLORS = ['', '#0B0B14', '#F4F1E8', '#C8382D', '#F08A24', '#E3B341', '#2FB67C', '#2AA8C9', '#1E2AD4', '#7C5CFF', '#E5579B'];
let fontsLoaded = false;
export function loadFonts() {
  if (fontsLoaded) return; fontsLoaded = true;
  const l = document.createElement('link'); l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;600;700&family=Instrument+Serif:ital@0;1&family=Inter:wght@400;700&family=Montserrat:ital,wght@0,400;0,700;1,400&family=Archivo+Black&family=Bebas+Neue&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Serif+Display:ital@0;1&family=Lora:ital,wght@0,400;0,700;1,400&family=Space+Mono:ital,wght@0,400;0,700;1,400&family=Caveat:wght@400;700&display=swap';
  document.head.append(l);
}
// só deixa passar formatação simples (nada de scripts, links ou estilos estranhos)
const OK_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'DIV', 'P', 'SPAN', 'FONT', 'UL', 'OL', 'LI']);
const OK_STYLE = ['color', 'font-weight', 'font-style', 'text-decoration', 'text-decoration-line'];
export function cleanHtml(html) {
  const t = document.createElement('template'); t.innerHTML = html || '';
  const walk = (node) => {
    [...node.childNodes].forEach((n) => {
      if (n.nodeType === 3) return;
      if (n.nodeType !== 1 || !OK_TAGS.has(n.tagName)) { if (n.nodeType === 1) { walk(n); n.replaceWith(...n.childNodes); } else n.remove(); return; }
      walk(n);
      let el = n;
      if (n.tagName === 'FONT') { el = document.createElement('span'); if (n.getAttribute('color')) el.style.color = n.getAttribute('color'); el.append(...n.childNodes); n.replaceWith(el); }
      const keep = OK_STYLE.map((k) => [k, el.style.getPropertyValue(k)]).filter(([, v]) => v);
      [...el.attributes].forEach((a) => el.removeAttribute(a.name));
      keep.forEach(([k, v]) => el.style.setProperty(k, v));
    });
  };
  walk(t.content);
  return t.innerHTML;
}
export const fmtStyle = (kind, f = {}) => {
  const k = (SIZES.find((x) => x[0] === f.size) || SIZES[1])[2];
  return [f.align ? `text-align:${f.align}` : '', f.font ? `font-family:'${f.font}',var(--sans)` : '', f.size && BASE[kind] ? `font-size:${Math.round(BASE[kind] * k)}px` : '', f.color ? `color:${f.color}` : '', f.b ? 'font-weight:700' : '', f.i ? 'font-style:italic' : '', f.u || f.s ? `text-decoration:${[f.u ? 'underline' : '', f.s ? 'line-through' : ''].filter(Boolean).join(' ')}` : ''].filter(Boolean).join(';');
};


// a barra (igual nos dois sítios): letra, tamanho, negrito/itálico/sublinhado, cor, alinhamento, tirar formatação
export const fmtBarHtml = () => `
    <span class="fmt-col"><button type="button" data-pop="font" title="Letra" aria-label="Letra" aria-expanded="false"><span class="fmt-aa">Aa</span></button>
      <span class="fmt-pop fmt-list" data-popbox="font" hidden>${FONTS.map(([v, l]) => `<button type="button" data-font="${esc(v)}" style="${v ? `font-family:'${v}'` : ''}">${esc(l)}</button>`).join('')}</span></span>
    <span class="fmt-col"><button type="button" data-pop="size" title="Tamanho" aria-label="Tamanho" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7V5h10v2M9 5v14M7 19h4M14 12v-1h6v1M17 11v8M15.5 19h3"/></svg></button>
      <span class="fmt-pop fmt-list" data-popbox="size" hidden>${SIZES.map(([v, l, k]) => `<button type="button" data-size="${v}" style="font-size:${Math.round(13 * k)}px">${l}</button>`).join('')}</span></span>
    <hr>
    <button type="button" data-cmd="bold" title="Negrito (Ctrl+B)" aria-label="Negrito"><b>B</b></button>
    <button type="button" data-cmd="italic" title="Itálico (Ctrl+I)" aria-label="Itálico"><i>I</i></button>
    <button type="button" data-cmd="underline" title="Sublinhado (Ctrl+U)" aria-label="Sublinhado"><u>U</u></button>
    <button type="button" data-cmd="strikeThrough" title="Riscado" aria-label="Riscado"><s>S</s></button>
    <span class="fmt-col"><button type="button" data-pop="color" data-colbtn title="Cor do texto" aria-label="Cor do texto" aria-expanded="false"><span class="fmt-a">A</span><i data-colbar></i></button>
      <span class="fmt-pop fmt-colors" data-popbox="color" data-colpop hidden>${TEXT_COLORS.map((c) => `<button type="button" data-tc="${c}" class="${c ? '' : 'none'}" style="${c ? `background:${c}` : ''}" aria-label="${c || 'Predefinida'}"></button>`).join('')}<label class="cb-custom" title="Outra cor"><input type="color" data-tcc value="#C8382D" aria-label="Outra cor"><span>+</span></label></span></span>
    <hr>
    ${[['left', 'Alinhar à esquerda', '<path d="M4 6h16M4 10h10M4 14h16M4 18h10"/>'], ['center', 'Centrar', '<path d="M4 6h16M7 10h10M4 14h16M7 18h10"/>'], ['right', 'Alinhar à direita', '<path d="M4 6h16M10 10h10M4 14h16M10 18h10"/>']].map(([al, l, d]) => `<button type="button" data-align="${al}" title="${l}" aria-label="${l}"><svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg></button>`).join('')}
    <hr>
    <button type="button" data-list="insertUnorderedList" title="Lista com pontos" aria-label="Lista com pontos"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/></svg></button>
    <button type="button" data-list="insertOrderedList" title="Lista numerada" aria-label="Lista numerada"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 6h10M10 12h10M10 18h10M4 5l1.5-1V9M3.6 13.2c.5-.8 2.4-.8 2.4.4 0 1-2.4 1.9-2.4 3h2.6"/></svg></button>
    <hr>
    <button type="button" data-clear title="Tirar a formatação" aria-label="Tirar a formatação"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12M12 5l-3 14M4 20l16-16"/></svg></button>`;
