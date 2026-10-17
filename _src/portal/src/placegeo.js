import { sb, esc, toast, ICON, todayISO } from './lib.js';
import { geocode, nearby, weatherFor, pinUrl } from './geo.js';
import { scriptMode } from './modules.js';

// Painel "Perto daqui e sol" na página de um décor: hospital mais perto (com urgência, público/privado,
// tempo de carro), polícia e bombeiros, e sol e tempo para um dia. Fica guardado em locations.info.geo / info.near.
// a ficção escreve a morada em info.morada; os videoclipes/campanhas em info.address
export const placeAddr = (p, loc) => { const i = loc?.info || {}; const a = p && scriptMode(p) ? [i.morada, i.address] : [i.address, i.morada]; return (a.find((x) => x && String(x).trim()) || '').trim(); };

export async function geoPanel(el, p, loc, { onChange } = {}) {
  if (!el) return;
  const save = async () => { const { error } = await sb.from('locations').update({ info: loc.info }).eq('id', loc.id); if (error) toast('Não foi possível guardar: ' + error.message); onChange?.(); };
  let date = el.dataset.date || todayISO();
  const draw = (msg) => {
    const info = loc.info || {}; const near = info.near; const addr = placeAddr(p, loc);
    const stale = near && info.geo?.q !== addr;
    const chosen = info.hospital_pick ?? 0;
    el.innerHTML = `<div class="row between wrap-gap"><h2 class="h3">Perto daqui</h2>${addr ? `<button type="button" class="btn ghost sm" data-find>${near ? '↻ Atualizar' : `${ICON.search} Procurar`}</button>` : ''}</div>
      ${!addr ? '<p class="muted small">Escreve a morada do décor (ou cola um link do Google Maps) para encontrar o hospital mais perto e as horas do sol.</p>'
      : msg ? `<p class="muted small">${msg}</p>`
      : !near ? '<p class="muted small">Encontra o hospital mais perto, a polícia, os bombeiros e o sol para este sítio.</p>'
      : `${stale ? '<p class="warn small">A morada mudou: carrega em Atualizar.</p>' : ''}
        ${info.geo?.approx ? `<p class="muted small">Não encontrei a morada exata; usei a zona (${esc(info.geo.label?.split(',').slice(0, 2).join(',') || '')}).</p>` : ''}
        <ul class="geo-h">${(near.hospitals || []).map((h, i) => `<li class="${i === chosen ? 'on' : ''}">
          <label class="geo-pick" title="Usar na folha de serviço"><input type="radio" name="hp-${loc.id}" value="${i}" ${i === chosen ? 'checked' : ''}></label>
          <span class="geo-n"><a href="${esc(h.url)}" target="_blank" rel="noopener"><b>${esc(h.name)}</b></a>
            <small>${[h.emergency ? '<span class="tag red">Urgência</span>' : '', h.kind ? `<span class="tag">${esc(h.kind)}</span>` : ''].join(' ')} ${h.min != null ? `${h.min} min de carro · ` : ''}${String(h.km).replace('.', ',')} km${h.phone ? ` · <a href="tel:${esc(h.phone)}">${esc(h.phone)}</a>` : ''}</small></span></li>`).join('') || '<li class="muted small">Não encontrei hospitais num raio de 40 km.</li>'}</ul>
        ${[['Polícia', near.police?.[0]], ['Bombeiros', near.fire?.[0]]].filter(([, x]) => x).map(([l, x]) => `<p class="geo-o small"><span class="muted">${l}</span> <a href="${esc(x.url)}" target="_blank" rel="noopener">${esc(x.name)}</a> · ${x.min != null ? `${x.min} min` : `${String(x.km).replace('.', ',')} km`}${x.phone ? ` · ${esc(x.phone)}` : ''}</p>`).join('')}
        <p class="muted small">Do OpenStreetMap: confirma antes da rodagem. O escolhido entra nas folhas de serviço deste décor.</p>`}
      ${addr && info.geo ? `<div class="geo-sun"><div class="row between wrap-gap"><h3 class="h4">Sol e tempo</h3><input type="date" data-sdate value="${esc(date)}" aria-label="Dia"></div><div data-sun class="small muted">A ver…</div></div>` : ''}`;
    el.querySelector('[data-find]')?.addEventListener('click', find);
    el.querySelectorAll(`[name="hp-${loc.id}"]`).forEach((r) => r.addEventListener('change', async () => { loc.info = { ...(loc.info || {}), hospital_pick: Number(r.value) }; await save(); draw(); }));
    el.querySelector('[data-sdate]')?.addEventListener('change', (e) => { date = e.target.value || todayISO(); el.dataset.date = date; sun(); });
    if (addr && info.geo) sun();
  };
  const sun = async () => {
    const box = el.querySelector('[data-sun]'); if (!box) return;
    try {
      const w = await weatherFor(loc.info.geo, date);
      box.className = 'geo-sunv';
      box.innerHTML = `<div class="geo-sunrow"><span>☀︎ Nascer <b>${esc(w.sunrise)}</b></span><span>Pôr <b>${esc(w.sunset)}</b></span></div>
        <div class="geo-sunrow small"><span>Golden hour <b>${esc(w.goldenAm)}</b> · <b>${esc(w.goldenPm)}</b></span><span>Blue hour <b>${esc(w.blueAm)}</b> · <b>${esc(w.bluePm)}</b></span></div>
        <div class="geo-sunrow small"><span>${esc(w.text || '—')}${w.min != null ? ` · ${w.min}° / ${w.max}°` : ''}${w.rainP != null ? ` · chuva ${w.rainP}%` : ''}${w.wind != null ? ` · vento ${w.wind} km/h` : ''}</span>${w.kind === 'estimativa' ? '<span class="tag">estimativa (média dos últimos anos)</span>' : ''}</div>`;
    } catch (e) { box.textContent = e.message || 'Sem dados para este dia.'; }
  };
  const find = async () => {
    const addr = placeAddr(p, loc);
    draw('A procurar no mapa…');
    try {
      const g = await geocode(addr);
      if (!g) { draw('Não encontrei esta morada. Experimenta escrever a localidade, ou cola um link do Google Maps.'); return; }
      const near = await nearby(g);
      loc.info = { ...(loc.info || {}), geo: { lat: g.lat, lng: g.lng, label: g.label, q: addr, approx: !!g.approx }, near: { ...near, at: new Date().toISOString() }, hospital_pick: 0 };
      await save(); draw();
    } catch (e) { draw(esc(e.message || 'Não foi possível procurar agora.')); }
  };
  draw();
  const af = document.querySelector('[data-info="morada"], [data-info="address"]');
  if (af && !af.dataset.geoBound) { af.dataset.geoBound = '1'; af.addEventListener('change', () => draw()); }
}

// para a folha de serviço: hospital escolhido, polícia, bombeiros e coordenadas de um décor (procura se ainda não tiver)
export async function placeInfo(p, loc) {
  const addr = placeAddr(p, loc);
  if (!addr) return null;
  if (!loc.info?.near || loc.info?.geo?.q !== addr) {
    const g = await geocode(addr); if (!g) return null;
    const near = await nearby(g);
    loc.info = { ...(loc.info || {}), geo: { lat: g.lat, lng: g.lng, label: g.label, q: addr, approx: !!g.approx }, near: { ...near, at: new Date().toISOString() } };
    await sb.from('locations').update({ info: loc.info }).eq('id', loc.id);
  }
  const n = loc.info.near; const h = n.hospitals?.[loc.info.hospital_pick ?? 0] || n.hospitals?.[0];
  return { geo: loc.info.geo, hospital: h, police: n.police?.[0], fire: n.fire?.[0] };
}
export { pinUrl };
