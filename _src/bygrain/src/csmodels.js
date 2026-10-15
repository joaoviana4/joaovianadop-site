import { esc } from './lib.js';

// Modelos de exportação da folha de serviço (para além do "Clássico", que vive em callsheet.js).
// Todos usam os mesmos dados da folha; cada modelo arruma-os à sua maneira.
// As cores vêm da paleta da folha: frame = cor principal, hi = destaque, lo = secundária, box = fundo, ln = linhas.

const v = (x) => (x == null ? '' : String(x));
const has = (x) => v(x).trim() !== '';
const longDate = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); const s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const mapUrl = (u) => (/^https?:/.test(v(u)) ? v(u) : has(u) ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(u)}` : '');
const link = (u, label) => { const h = mapUrl(u); return h ? `<a href="${esc(h)}">${esc(label || u)}</a>` : esc(label || ''); };
const timeOf = (d, re) => (d.times || []).find((t) => re.test(v(t.label).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))?.value || '';
const shotRows = (d) => d.rows || [];
const more = (d) => d.more || {};

// ---------- Longa-metragem: cabeçalho em três colunas com a hora de call em grande ----------
function longa(d, P, ink) {
  const m = more(d);
  const css = `
  .lg { font: 8.6px/1.3 Arial, Helvetica, sans-serif; color: #111; }
  .lg table { width: 100%; border-collapse: collapse; }
  .lg td, .lg th { border: 1px solid ${P.ln}; padding: 2.5px 4px; vertical-align: top; }
  .lg th { background: ${P.lo}; color: ${ink(P.lo)}; font-weight: 700; text-transform: uppercase; font-size: 7.6px; letter-spacing: .03em; }
  .lg .title { text-align: center; font-size: 22px; font-weight: 800; letter-spacing: .04em; background: ${P.frame}; color: ${ink(P.frame)}; padding: 6px; margin-bottom: 6px; text-transform: uppercase; }
  .lg .top { display: grid; grid-template-columns: 1fr 1.15fr 1fr; gap: 6px; align-items: start; }
  .lg .kv td:first-child { font-weight: 700; white-space: nowrap; width: 42%; }
  .lg .mid { border: 1px solid ${P.ln}; text-align: center; padding: 6px 4px; display: flex; flex-direction: column; gap: 3px; }
  .lg .mid .unit { font-weight: 800; letter-spacing: .1em; text-transform: uppercase; font-size: 11px; }
  .lg .mid .call { font-size: 40px; font-weight: 800; line-height: 1; margin: 4px 0; }
  .lg .mid .sm { font-size: 8px; text-transform: uppercase; letter-spacing: .05em; }
  .lg .mid .place { font-size: 13px; font-weight: 800; text-transform: uppercase; }
  .lg .mid .dayof { background: ${P.frame}; color: ${ink(P.frame)}; font-weight: 800; font-size: 14px; padding: 3px; margin-top: 4px; text-transform: uppercase; }
  .lg .hl { background: ${P.hi}; color: ${ink(P.hi)}; font-weight: 700; }
  .lg .band { background: ${P.frame}; color: ${ink(P.frame)}; font-weight: 800; text-transform: uppercase; text-align: center; padding: 3px; margin: 6px 0 0; font-size: 9px; letter-spacing: .05em; }
  .lg .notes { border: 1px solid ${P.ln}; border-top: 0; padding: 4px 6px; text-align: center; font-weight: 700; text-transform: uppercase; font-size: 7.8px; white-space: pre-wrap; }
  .lg .pre th, .lg .pre td { text-align: center; }
  .lg .shots td { text-align: center; } .lg .shots td.l { text-align: left; }
  .lg .shots tr.b td { background: ${P.lo}; color: ${ink(P.lo)}; font-weight: 700; text-align: left; } .lg .shots tr.b.y td { background: ${P.hi}; color: ${ink(P.hi)}; text-align: center; }
  .lg .safe td { text-align: center; width: 20%; } .lg .safe b { display: block; text-transform: uppercase; font-size: 7.6px; margin-bottom: 2px; }
  .lg .req td:first-child { font-weight: 700; width: 22%; background: ${P.lo}; color: ${ink(P.lo)}; }
  .lg .foot { margin-top: 6px; text-align: center; font-weight: 800; background: ${P.hi}; color: ${ink(P.hi)}; padding: 6px; border: 1px solid ${P.ln}; text-transform: uppercase; }
  .lg a { color: inherit; }
  .lg .pre-w { white-space: pre-wrap; }`;
  const kv = (rows) => `<table class="kv">${rows.filter(([, x]) => has(x)).map(([k, x]) => `<tr><td>${esc(k)}</td><td>${x}</td></tr>`).join('')}</table>`;
  const right = kv([
    ['Local', esc(d.place)], ['Morada', link(d.address, d.address)], ['Base', esc(m.base)],
    ['Meteorologia', esc([d.weather?.text, [d.weather?.min, d.weather?.max].filter(has).join(' / ')].filter(has).join(' · '))],
    ['Nascer do sol', esc(m.sunrise)], ['Pôr do sol', esc(m.sunset)],
    ...(d.times || []).map((t) => [t.label, `<b>${esc(t.value)}</b>`]),
    ['Estacionamento', link(d.parking?.url || d.parking?.name, d.parking?.name)],
  ]);
  const left = kv((d.contacts || []).map((c) => [c.role, esc(c.value)]));
  const shots = `<table class="shots"><thead><tr>${(d.cols || []).map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${shotRows(d).map((r) => (r.kind === 'band'
    ? `<tr class="b ${r.tone === 'yellow' ? 'y' : ''}"><td colspan="${(d.cols || []).length}">${esc(r.text)}</td></tr>`
    : `<tr>${(d.cols || []).map((c) => `<td class="${/resumo|descri|acao|ação/i.test(c.label) ? 'l' : ''}">${esc(r.cells?.[c.id] ?? '')}</td>`).join('')}</tr>`)).join('')}</tbody></table>`;
  const cast = (d.cast || []).length ? `<div class="band">${esc(d.castTitle || 'Elenco')}</div><table><thead><tr><th>#</th><th>Nome</th><th>Personagem</th><th>Cena</th><th>Call</th><th>Saída</th><th>Notas</th></tr></thead><tbody>${d.cast.map((c, i) => `<tr><td>${i + 1}</td><td><b>${esc(c.name)}</b></td><td>${esc(c.role)}</td><td>${esc(c.scene)}</td><td class="hl">${esc(c.call)}</td><td>${esc(c.out)}</td><td>${esc(c.obs)}</td></tr>`).join('')}</tbody></table>` : '';
  const veh = (d.vehicles || []).length ? `<div class="band">Veículos</div><table><thead><tr><th>Veículo</th><th>Condutor</th><th>Call</th><th>Notas</th></tr></thead><tbody>${d.vehicles.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.driver)}</td><td>${esc(x.call)}</td><td>${esc(x.obs)}</td></tr>`).join('')}</tbody></table>` : '';
  const safe = `<div class="band">Contactos de segurança</div><table class="safe"><tr>
    <td><b>Hospital</b>${esc(d.hospital?.name)}<br>${link(d.hospital?.url, d.hospital?.url ? 'mapa' : '')}</td>
    <td><b>Emergência</b>${esc(m.ambulance || '112')}</td>
    <td><b>Polícia</b>${esc(m.police)}</td>
    <td><b>Bombeiros</b>${esc(m.fire)}</td>
    <td><b>Estacionamento</b>${esc(d.parking?.name)}</td></tr></table>`;
  const req = (d.deptNotes || []).filter((x) => has(x.text)).length ? `<div class="band">Necessidades por departamento</div><table class="req">${d.deptNotes.filter((x) => has(x.text)).map((x) => `<tr><td>${esc(x.dept)}</td><td class="pre-w">${esc(x.text)}</td></tr>`).join('')}</table>` : '';
  const body = `<div class="lg">
    <div class="title">${esc(d.title)}</div>
    <div class="top">${left}
      <div class="mid"><span class="unit">${esc(m.unit || 'Unidade principal')}</span><span>${esc(longDate(d.date))}</span><span class="sm">Call geral</span><span class="call">${esc(d.call)}</span>
        ${has(m.ready) || has(m.wrap_est) ? `<span class="sm">${has(m.ready) ? `Pronto a filmar ${esc(m.ready)}` : ''}${has(m.ready) && has(m.wrap_est) ? ' · ' : ''}${has(m.wrap_est) ? `Wrap previsto ${esc(m.wrap_est)}` : ''}</span>` : ''}
        <span class="place">${esc(d.place)}</span><span class="dayof">Dia ${esc(d.day)} de ${esc(d.days)}</span></div>
      ${right}</div>
    ${(d.depts || []).length ? `<div class="band">Pré-calls</div><table class="pre"><tr>${d.depts.map((t) => `<th>${esc(t.name)}</th>`).join('')}</tr><tr>${d.depts.map((t) => `<td><b>${esc(t.time)}</b></td>`).join('')}</tr></table>` : ''}
    ${has(d.notes) || has(m.general) ? `<div class="band">Notas da unidade</div><div class="notes">${esc([d.notes, m.general].filter(has).join('\n'))}</div>` : ''}
    <div class="band">Plano do dia</div>${shots}
    ${cast}${veh}${safe}${req}
    ${has(m.quote) ? `<div class="notes" style="border-top:1px solid ${P.ln};margin-top:6px;font-style:italic;text-transform:none">“${esc(m.quote)}”</div>` : ''}
    <div class="foot">${esc(d.footer)}</div></div>`;
  return { css, body };
}

// ---------- Cartões: caixas de informação, calls por departamento em cartões e plano da diária ----------
function cartoes(d, P, ink) {
  const m = more(d);
  const ic = {
    info: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/></svg>',
    sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
    food: '<svg viewBox="0 0 24 24"><path d="M5 3v8a3 3 0 0 0 6 0V3M8 3v18M17 3c-2 2-3 5-3 8h3v10"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    pin: '<svg viewBox="0 0 24 24"><path d="M12 21s-7-6.5-7-12a7 7 0 0 1 14 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/></svg>',
    star: '<svg viewBox="0 0 24 24"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg>',
  };
  const css = `
  .ct { font: 8.6px/1.35 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; }
  .ct svg { width: 13px; height: 13px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; vertical-align: -2px; }
  .ct table { width: 100%; border-collapse: collapse; }
  .ct .crew { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px 10px; font-size: 7.6px; padding-bottom: 6px; border-bottom: 1px solid ${P.ln}; }
  .ct .crew b { font-weight: 700; }
  .ct .head { display: grid; grid-template-columns: 1fr 1fr; align-items: end; padding: 10px 2px 8px; border-bottom: 2px solid ${P.frame}; }
  .ct .head h1 { margin: 0; font-size: 22px; font-style: italic; font-weight: 800; } .ct .head .sub { color: #666; font-size: 9px; }
  .ct .head .r { text-align: right; } .ct .head .r b { display: block; color: ${P.frame}; font-size: 14px; letter-spacing: .03em; text-transform: uppercase; } .ct .head .r span { display: block; font-size: 11px; }
  .ct .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0; }
  .ct .card { border: 1px solid ${P.ln}; border-radius: 6px; overflow: hidden; background: ${P.box}; }
  .ct .card h3 { margin: 0; background: ${P.frame}; color: ${ink(P.frame)}; font-size: 9px; padding: 5px 7px; text-transform: uppercase; letter-spacing: .04em; display: flex; justify-content: space-between; align-items: center; }
  .ct .card table td { padding: 2.5px 6px; border-bottom: 1px solid ${P.lo}; } .ct .card table td:last-child { text-align: right; font-weight: 700; }
  .ct .card .tx { padding: 5px 7px; white-space: pre-wrap; }
  .ct .bar { background: ${P.frame}; color: ${ink(P.frame)}; text-align: center; font-weight: 800; text-transform: uppercase; letter-spacing: .06em; padding: 5px; margin-top: 10px; font-size: 10px; border-radius: 4px 4px 0 0; }
  .ct .bar svg { margin: 0 6px; }
  .ct .loc { text-align: center; padding: 5px; border: 1px solid ${P.ln}; border-top: 0; } .ct .loc b { font-size: 11px; display: block; }
  .ct a { color: ${P.frame}; }
  .ct .depts { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-top: 8px; }
  .ct .dep { border: 1px solid ${P.ln}; border-radius: 6px; text-align: center; overflow: hidden; } .ct .dep span { display: block; background: ${P.lo}; color: ${ink(P.lo)}; font-weight: 700; font-size: 7.6px; text-transform: uppercase; padding: 3px 2px; } .ct .dep b { display: block; font-size: 13px; padding: 4px 0; }
  .ct .plan { border: 1px solid ${P.ln}; border-top: 0; }
  .ct .plan th { background: ${P.lo}; color: ${ink(P.lo)}; font-size: 7.4px; text-transform: uppercase; padding: 4px; text-align: left; }
  .ct .plan td { padding: 4px; border-top: 1px solid ${P.lo}; vertical-align: top; } .ct .plan td.n { font-weight: 800; font-size: 11px; text-align: center; width: 26px; }
  .ct .plan tr.b td { background: ${P.lo}; color: ${ink(P.lo)}; text-align: center; font-style: italic; font-weight: 700; padding: 3px; }
  .ct .plan tr.b.y td { background: ${P.hi}; color: ${ink(P.hi)}; }
  .ct .tbl { border: 1px solid ${P.ln}; border-top: 0; } .ct .tbl th { background: ${P.lo}; color: ${ink(P.lo)}; font-size: 7.4px; text-transform: uppercase; padding: 4px; } .ct .tbl td { padding: 4px; text-align: center; border-top: 1px solid ${P.lo}; }
  .ct .notes4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 8px; border: 1px solid ${P.ln}; border-top: 0; }
  .ct .notes4 .card .tx { min-height: 34px; text-align: center; }
  .ct .box { border: 1px solid ${P.ln}; border-top: 0; padding: 7px; text-align: center; white-space: pre-wrap; }
  .ct .quote { font-style: italic; font-weight: 700; }
  .ct .hosp { margin-top: 10px; } .ct .hosp .bar { background: ${P.hi}; color: ${ink(P.hi)}; }`;
  const crew = (d.contacts || []).filter((c) => has(c.value) || has(c.role));
  const hours = [d.call, timeOf(d, /wrap/)].filter(has).join(' – ');
  const cols = d.cols || [];
  const body = `<div class="ct">
    ${crew.length ? `<div class="crew">${crew.map((c) => `<span><b>${esc(c.role)}:</b> ${esc(c.value)}</span>`).join('')}</div>` : ''}
    <div class="head"><div><h1>${esc(d.title)}</h1>${has(m.subtitle) ? `<div class="sub">${esc(m.subtitle)}</div>` : ''}</div>
      <div class="r"><b>Folha de serviço #${esc(d.day)}</b><span>${esc(longDate(d.date))}</span><span>${esc(hours)}</span></div></div>
    <div class="cards">
      <div class="card"><h3>Informação geral ${ic.info}</h3><div class="tx">${esc([d.notes, has(m.base) ? 'Base: ' + m.base : ''].filter(has).join('\n'))}</div></div>
      <div class="card"><h3>Meteorologia ${ic.sun}</h3><table>${[[d.weather?.text, ' '], ['Mín. / Máx.', [d.weather?.min, d.weather?.max].filter(has).join(' / ')], ['Nascer do sol', m.sunrise], ['Pôr do sol', m.sunset]].filter(([a, b]) => has(a) && has(b)).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></div>
      <div class="card"><h3>Alimentação ${ic.food}</h3><table>${(d.times || []).filter((t) => !/wrap/i.test(t.label)).map((t) => `<tr><td>${esc(t.label)}</td><td>${esc(t.value)}</td></tr>`).join('')}</table></div>
      <div class="card"><h3>Horários ${ic.clock}</h3><table>${[['Call geral', d.call], ['Pronto a filmar', m.ready], ['Wrap previsto', m.wrap_est || timeOf(d, /wrap/)]].filter(([, b]) => has(b)).map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</table></div>
    </div>
    <div class="bar">${ic.pin} No décor</div><div class="loc"><b>${esc(d.place)}</b>${link(d.address, d.address)}${has(d.parking?.name) ? `<br>Estacionamento: ${esc(d.parking.name)}` : ''}</div>
    ${(d.depts || []).length ? `<div class="depts">${d.depts.map((t) => `<div class="dep"><span>${esc(t.name)}</span><b>${esc(t.time)}</b></div>`).join('')}</div>` : ''}
    <div class="bar">${ic.star} Planeamento da diária ${ic.star}</div>
    <table class="plan"><thead><tr><th>#</th>${cols.map((c) => `<th>${esc(c.label)}</th>`).join('')}</tr></thead><tbody>${(() => { let n = 0; return shotRows(d).map((r) => (r.kind === 'band'
      ? `<tr class="b ${r.tone === 'yellow' ? 'y' : ''}"><td colspan="${cols.length + 1}">// ${esc(r.text)} //</td></tr>`
      : `<tr><td class="n">${esc(r.num ?? ++n)}</td>${cols.map((c) => `<td>${esc(r.cells?.[c.id] ?? '')}</td>`).join('')}</tr>`)).join(''); })()}</tbody></table>
    ${(d.cast || []).length ? `<div class="bar">${ic.star} ${esc(d.castTitle || 'Elenco')} ${ic.star}</div><table class="tbl"><thead><tr><th>Nome</th><th>Personagem</th><th>Cena</th><th>Call</th><th>Saída</th><th>Notas</th></tr></thead><tbody>${d.cast.map((c) => `<tr><td><b>${esc(c.name)}</b></td><td>${esc(c.role)}</td><td>${esc(c.scene)}</td><td><b>${esc(c.call)}</b></td><td>${esc(c.out)}</td><td>${esc(c.obs)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${(d.vehicles || []).length ? `<div class="bar">Veículos</div><table class="tbl"><thead><tr><th>Veículo</th><th>Condutor</th><th>Call</th><th>Notas</th></tr></thead><tbody>${d.vehicles.map((x) => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.driver)}</td><td>${esc(x.call)}</td><td>${esc(x.obs)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${(d.deptNotes || []).length ? `<div class="bar">Notas</div><div class="notes4">${d.deptNotes.map((x) => `<div class="card"><h3>${esc(x.dept)}</h3><div class="tx">${esc(x.text) || '—'}</div></div>`).join('')}</div>` : ''}
    ${has(m.general) ? `<div class="bar">Apontamentos gerais</div><div class="box">${esc(m.general)}</div>` : ''}
    ${has(m.quote) ? `<div class="bar">Frase do dia</div><div class="box quote">“${esc(m.quote)}”</div>` : ''}
    ${has(d.hospital?.name) || has(d.hospital?.url) ? `<div class="hosp"><div class="bar">Hospital mais próximo</div><div class="box">${esc(d.hospital?.name)} ${d.hospital?.url ? '· ' + link(d.hospital.url, 'mapa') : ''}${has(m.ambulance) ? ` · Emergência ${esc(m.ambulance)}` : ' · Emergência 112'}</div></div>` : ''}
    ${has(d.footer) ? `<div class="bar" style="border-radius:4px;margin-top:10px">${esc(d.footer)}</div>` : ''}
    </div>`;
  return { css, body };
}

// lista de modelos: o "classic" é desenhado em callsheet.js
export const CS_MODELS = [
  { id: 'classic', label: 'Clássico', desc: 'Moldura de cor, caixas de destaque e tabela de planos.', preset: null },
  { id: 'longa', label: 'Longa-metragem', desc: 'Call em grande ao centro, pré-calls, plano do dia, segurança e necessidades por departamento.', preset: { frame: '#1F3B57', hi: '#FFF2A8', lo: '#CFE2F3', box: '#FFFFFF', ln: '#3A3A3A' }, render: longa },
  { id: 'cartoes', label: 'Cartões', desc: 'Caixas de informação, calls em cartões, planeamento da diária, notas por departamento e frase do dia.', preset: { frame: '#5B4374', hi: '#E9B8B8', lo: '#EEEAF3', box: '#FFFFFF', ln: '#C9C1D3' }, render: cartoes },
];
