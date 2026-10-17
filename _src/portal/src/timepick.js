// Escolher horas depressa: ao clicar num campo de hora aparece um quadro com as horas (5…4) e, depois de
// escolher a hora, os minutos de 5 em 5. Continua a dar para escrever qualquer hora (ex: 9:37).
let box = null; let cur = null; let setting = false;
const close = () => { box?.remove(); box = null; cur = null; document.removeEventListener('mousedown', outside, true); };
const outside = (e) => { if (box && !box.contains(e.target) && e.target !== cur) close(); };
const pad = (n) => String(n).padStart(2, '0');
// "9" → "09:00", "937" → "09:37", "9h37" → "09:37"
export function normTime(v) {
  const t = String(v || '').trim(); if (!t) return '';
  let m = t.match(/^(\d{1,2})\s*[:hH.]\s*(\d{1,2})?\s*h?$/) || t.match(/^(\d{1,2})$/);
  if (m) { const h = Number(m[1]), mi = Number(m[2] || 0); if (h < 24 && mi < 60) return `${pad(h)}:${pad(mi)}`; }
  m = t.match(/^(\d{1,2})(\d{2})$/); if (m) { const h = Number(m[1]), mi = Number(m[2]); if (h < 24 && mi < 60) return `${pad(h)}:${pad(mi)}`; }
  return t;
}
function open(inp, set) {
  if (cur === inp && box) return;
  close(); cur = inp;
  box = document.createElement('div'); box.className = 'tp'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', 'Escolher hora');
  const [h0, m0] = (normTime(inp.value).match(/^(\d{2}):(\d{2})$/) || []).slice(1).map(Number);
  let hour = Number.isFinite(h0) ? h0 : null;
  const hours = [...Array(19)].map((_, i) => i + 5).concat([0, 1, 2, 3, 4]);
  const draw = (stage) => {
    box.innerHTML = stage === 'h'
      ? `<div class="tp-h">Hora</div><div class="tp-g h">${hours.map((h) => `<button type="button" data-h="${h}" class="${h === hour ? 'on' : ''}">${h}</button>`).join('')}</div>`
      : `<div class="tp-h"><button type="button" class="tp-back" data-back>‹ ${pad(hour)}h</button><span>Minutos</span></div><div class="tp-g m">${[...Array(12)].map((_, i) => i * 5).map((mi) => `<button type="button" data-m="${mi}" class="${hour === h0 && mi === m0 ? 'on' : ''}">${pad(hour)}:${pad(mi)}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); hour = Number(b.dataset.h); set(inp, `${pad(hour)}:00`); draw('m'); }));
    box.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); set(inp, `${pad(hour)}:${pad(Number(b.dataset.m))}`); close(); }));
    box.querySelector('[data-back]')?.addEventListener('mousedown', (e) => { e.preventDefault(); draw('h'); });
  };
  draw('h');
  document.body.append(box);
  const r = inp.getBoundingClientRect(); const w = 248;
  box.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.scrollX + window.innerWidth - w - 8))}px`;
  const below = r.bottom + 6 + box.offsetHeight < window.innerHeight;
  box.style.top = `${(below ? r.bottom + 6 : r.top - box.offsetHeight - 6) + window.scrollY}px`;
  document.addEventListener('mousedown', outside, true);
}
// set(input, valor): põe o valor e avisa a página (dispara "input")
const defaultSet = (inp, v) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); };
export function bindTimes(inputs, set0 = defaultSet) {
  const set = (inp, v) => { setting = true; try { set0(inp, v); } finally { setting = false; } };
  inputs.forEach((inp) => {
    if (inp.dataset.tp) return; inp.dataset.tp = '1'; inp.setAttribute('autocomplete', 'off'); inp.setAttribute('inputmode', 'numeric');
    inp.addEventListener('focus', () => open(inp, set));
    inp.addEventListener('click', () => open(inp, set));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Escape' || e.key === 'Tab') close(); if (e.key === 'Enter') { close(); inp.blur(); } });
    inp.addEventListener('input', () => { if (!setting && box && cur === inp && /\d/.test(inp.value)) close(); });
    inp.addEventListener('blur', () => { const n = normTime(inp.value); if (n !== inp.value) set(inp, n); setTimeout(() => { if (cur === inp && document.activeElement !== inp) close(); }, 150); });
  });
}
