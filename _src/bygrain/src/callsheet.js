import { sb, esc, toast, modal, confirmBox, ICON, signedUrl } from './lib.js';
import { projectContacts, nameWithPhone } from './contacts.js';
import { placeAddr } from './placegeo.js';
import { bindTimes } from './timepick.js';
const TIME_P = /^(call|more\.(ready|wrap_est|sunrise|sunset)|depts\.\d+\.time|times\.\d+\.value|cast\.\d+\.(call|out)|vehicles\.\d+\.call)$/;
import { CS_MODELS } from './csmodels.js';

// Folha de serviço (call sheet) de um dia de rodagem, no estilo do modelo "A Forma e o Silêncio":
// cabeçalho com dia, contactos, call e morada, meteorologia, notas, hospital e estacionamento, horários,
// calls por departamento, elenco e a lista de planos do dia (com faixas de notas: preparação, almoço, wrap…).
// Tudo editável no próprio documento; os planos escolhem-se da shotlist e trazem décor e elenco sozinhos.
// Importa folhas feitas no Excel / Google Sheets e exporta para PDF.

const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms = 700) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const DEPTS = ['Realização', 'Produção', 'DF', 'Imagem', 'Iluminação', 'Arte', 'Som', 'Guarda-roupa', 'Make-up/Cabelos'];
const COLS = [['cena', 'Cena'], ['efeito', 'Efeito'], ['crono', 'Crono'], ['actor', 'Actor nº'], ['resumo', 'Resumo da ação'], ['cam', 'Cam'], ['tecnico', 'Técnico'], ['paf', 'PAF']];

export function newCallsheet(p, n = 1) {
  return {
    title: (p.name || '').toUpperCase(), date: '', day: String(n), days: '1', accent: '#C8382D',
    contacts: [['Diretora Produção', ''], ['Ass. Produção', ''], ['1ª Ass. Realização', ''], ['2ª Ass. Realização', '']].map(([role, v]) => ({ id: uid(), role, value: v })),
    call: '08:00', place: '', address: '', weather: { text: '', min: '', max: '' },
    notes: '', hospital: { name: '', url: '' }, parking: { name: '', url: '' },
    times: [['PAF', ''], ['Almoço', ''], ['Wrap', '']].map(([label, value]) => ({ id: uid(), label, value })),
    depts: DEPTS.map((d) => ({ id: uid(), name: d, time: '' })),
    castTitle: 'Elenco', cast: [],
    cols: COLS.map(([id, label]) => ({ id, label })),
    rows: [{ id: uid(), kind: 'band', text: 'PREP + REHEARSAL', tone: 'grey' }],
    footer: `WRAP ${(p.name || '').toUpperCase()}`,
  };
}

// ---------- cores da folha exportada ----------
// moldura, caixas de destaque (amarelo), caixas secundárias (cinzento), fundo das caixas e linhas. O texto ajusta-se sozinho.
export const PALETTE_KEYS = [['frame', 'Moldura'], ['hi', 'Destaque'], ['lo', 'Secundária'], ['box', 'Caixas'], ['ln', 'Linhas']];
const PRESETS = [
  ['Clássico', { frame: '#C8382D', hi: '#FFE599', lo: '#D9D9D9', box: '#FFFFFF', ln: '#000000' }],
  ['Limpo', { frame: '#FFFFFF', hi: '#F2F2F2', lo: '#F2F2F2', box: '#FFFFFF', ln: '#BFBFBF' }],
  ['byGrain', { frame: '#1E2AD4', hi: '#F4F1E8', lo: '#DCDDF7', box: '#FFFFFF', ln: '#0B0B14' }],
  ['Noite', { frame: '#0B0B14', hi: '#E3B341', lo: '#3A3A46', box: '#FFFFFF', ln: '#0B0B14' }],
  ['Verde', { frame: '#2F6B4F', hi: '#D9EAD3', lo: '#E6E6E6', box: '#FFFFFF', ln: '#1F3D2E' }],
  ['Rosa', { frame: '#F06BD0', hi: '#FFE1F4', lo: '#EDEDED', box: '#FFFFFF', ln: '#333333' }],
];
const lum = (hex) => { const h = String(hex || '#000').replace('#', ''); const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h; const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
export const inkOn = (hex) => (lum(hex) > 0.35 ? '#000000' : '#FFFFFF');
const paletteOf = (d) => ({ ...PRESETS[0][1], ...(d.palette || {}), frame: d.accent || d.palette?.frame || PRESETS[0][1].frame });
const paletteVars = (pal) => `--acc:${pal.frame};--hi:${pal.hi};--hi-t:${inkOn(pal.hi)};--lo:${pal.lo};--lo-t:${inkOn(pal.lo)};--box:${pal.box};--box-t:${inkOn(pal.box)};--ln:${pal.ln}`;

const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
const set = (o, path, v) => { const ks = path.split('.'); const last = ks.pop(); const t = ks.reduce((a, k) => a[k], o); t[last] = v; };
const fmtDay = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); const s = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1).replace(',', ' |'); };

// o mesmo HTML serve para editar (inputs) e para imprimir (texto)
function sheetHtml(d, edit) {
  const f = (path, ph = '', cls = '') => (edit ? `<input class="cs-in ${cls}" data-p="${path}" value="${esc(get(d, path) ?? '')}" placeholder="${esc(ph)}">` : `<span class="${cls}">${esc(get(d, path) ?? '')}</span>`);
  const ta = (path, ph = '') => (edit ? `<textarea class="cs-in" data-p="${path}" rows="2" placeholder="${esc(ph)}">${esc(get(d, path) ?? '')}</textarea>` : `<span class="pre">${esc(get(d, path) ?? '')}</span>`);
  const link = (path, label) => { const u = get(d, path); return edit ? f(path, 'link do Google Maps') : (u ? `<a href="${esc(u)}">${esc(label || u)}</a>` : ''); };
  const x = (attr) => (edit ? `<button type="button" class="cs-x" ${attr} aria-label="Tirar">×</button>` : '');
  const add = (attr, label) => (edit ? `<button type="button" class="cs-add" ${attr}>+ ${label}</button>` : '');
  return `<div class="cs-frame" style="${esc(paletteVars(paletteOf(d)))}"><div class="cs">
    <div class="cs-title">${f('title', 'NOME DO PROJETO', 'b')}</div>
    <div class="cs-day"><span>${edit ? `<input type="date" class="cs-in" data-p="date" value="${esc(d.date || '')}">` : esc(fmtDay(d.date))}</span><span class="b">DIA ${f('day', '1', 'cs-num')} DE ${f('days', '3', 'cs-num')}</span></div>
    <div class="cs-top">
      <table class="cs-box cs-contacts">${d.contacts.map((c, i) => `<tr><th>${f(`contacts.${i}.role`, 'Função')}</th><td>${f(`contacts.${i}.value`, 'Nome - telefone')}${x(`data-rm="contacts:${c.id}"`)}</td></tr>`).join('')}${edit ? `<tr><td colspan="2">${add('data-addc', 'contacto')} ${add('data-pickc', 'da equipa')}</td></tr>` : ''}</table>
      <div class="cs-box cs-call"><div class="cs-callh">CALL: ${f('call', '08:00', 'cs-num')}H - ${f('place', 'Local')}</div><div class="cs-addr"><b>MORADA:</b> ${link('address')}</div></div>
      <div class="cs-box cs-weather"><div class="cs-h">METEOROLOGIA</div><div>${f('weather.text', 'ex: Nublado')}</div><div class="cs-temps"><span class="t-min">${f('weather.min', '12°', 'cs-num')}</span><span class="t-max">${f('weather.max', '20°', 'cs-num')}</span></div></div>
    </div>
    <div class="cs-mid">
      <div class="cs-box"><div class="cs-h">NOTAS DE PRODUÇÃO</div><div class="cs-notes">${ta('notes', 'ex: Base de produção - Bar do Teatro')}</div></div>
      <div class="cs-stack"><div class="cs-box"><div class="cs-h grey">HOSPITAL MAIS PRÓXIMO</div><div class="cs-c">${f('hospital.name', 'Nome')} ${link('hospital.url', 'mapa')}</div></div>
        <div class="cs-box"><div class="cs-h grey">ESTACIONAMENTO MAIS PRÓXIMO</div><div class="cs-c">${f('parking.name', 'Nome')} ${link('parking.url', 'mapa')}</div></div></div>
      <table class="cs-box cs-times">${d.times.map((t, i) => `<tr><th>${f(`times.${i}.label`, 'Hora')}:</th><td>${f(`times.${i}.value`, '00:00', 'cs-num')}${x(`data-rm="times:${t.id}"`)}</td></tr>`).join('')}${edit ? `<tr><td colspan="2">${add('data-addt', 'hora')}</td></tr>` : ''}</table>
    </div>
    <table class="cs-box cs-depts"><tr>${d.depts.map((t, i) => `<th>${f(`depts.${i}.name`, 'Dep.')}${x(`data-rm="depts:${t.id}"`)}</th>`).join('')}${edit ? `<th>${add('data-addd', '')}</th>` : ''}</tr><tr>${d.depts.map((t, i) => `<td>${f(`depts.${i}.time`, '08:00', 'cs-num')}</td>`).join('')}${edit ? '<td></td>' : ''}</tr></table>
    <table class="cs-box cs-cast"><tr><th>${f('castTitle', 'Elenco')}</th><th>PERSONAGEM</th><th>CENA</th><th>CALL</th><th>SAÍDA</th><th>OBS.</th></tr>
      ${d.cast.map((c, i) => `<tr>${['name', 'role', 'scene', 'call', 'out', 'obs'].map((k) => `<td>${f(`cast.${i}.${k}`, '')}</td>`).join('')}${edit ? `<td class="cs-xcell">${x(`data-rm="cast:${c.id}"`)}</td>` : ''}</tr>`).join('')}
      ${edit ? `<tr><td colspan="6">${add('data-addcast', 'pessoa')}</td></tr>` : ''}</table>
    <table class="cs-box cs-shots"><thead><tr>${d.cols.map((c, i) => `<th>${edit ? `<input class="cs-in" data-p="cols.${i}.label" value="${esc(c.label)}">${x(`data-rmcol="${c.id}"`)}` : esc(c.label)}</th>`).join('')}${edit ? `<th class="cs-ctl">${add('data-addcol', '')}</th>` : ''}</tr></thead>
      <tbody>${d.rows.map((r, i) => (r.kind === 'band'
        ? `<tr class="cs-band ${r.tone || 'grey'}" data-row="${r.id}"><td colspan="${d.cols.length}">${f(`rows.${i}.text`, 'ex: ALMOÇO 13:00 - 14:00', 'b')}</td>${edit ? `<td class="cs-ctl"><button type="button" class="cs-tone" data-tone="${r.id}" title="Mudar cor">◐</button><button type="button" class="cs-mv" data-mv="${r.id}:-1">↑</button><button type="button" class="cs-mv" data-mv="${r.id}:1">↓</button>${x(`data-rm="rows:${r.id}"`)}</td>` : ''}</tr>`
        : `<tr data-row="${r.id}">${d.cols.map((c) => `<td>${edit ? `<textarea class="cs-in" rows="1" data-p="rows.${i}.cells.${c.id}">${esc(r.cells?.[c.id] ?? '')}</textarea>` : `<span class="pre">${esc(r.cells?.[c.id] ?? '')}</span>`}</td>`).join('')}${edit ? `<td class="cs-ctl"><button type="button" class="cs-mv" data-mv="${r.id}:-1">↑</button><button type="button" class="cs-mv" data-mv="${r.id}:1">↓</button>${x(`data-rm="rows:${r.id}"`)}</td>` : ''}</tr>`)).join('')}</tbody></table>
    ${edit ? `<div class="cs-actions"><button type="button" class="cs-add" data-pick>+ Planos da shotlist</button><button type="button" class="cs-add" data-addrow>+ Linha</button><button type="button" class="cs-add" data-addband>+ Faixa (ex: almoço, slider in)</button></div>` : ''}
    <div class="cs-foot">${f('footer', 'WRAP', 'b')}</div>
  </div></div>`;
}

// ---------- vista do studio (para trabalhar) ----------
// Os mesmos dados, num aspeto do studio. O modelo clássico (moldura vermelha) fica para o PDF e o Excel.
function studioHtml(d) {
  const f = (path, ph = '', cls = '') => `<input class="cst-in ${cls}" data-p="${path}" value="${esc(get(d, path) ?? '')}" placeholder="${esc(ph)}" aria-label="${esc(ph || path)}">`;
  const ta = (path, ph = '', rows = 2) => `<textarea class="cst-in" data-p="${path}" rows="${rows}" placeholder="${esc(ph)}" aria-label="${esc(ph)}">${esc(get(d, path) ?? '')}</textarea>`;
  const x = (attr) => `<button type="button" class="cst-x" ${attr} aria-label="Tirar" title="Tirar">×</button>`;
  const add = (attr, label) => `<button type="button" class="cst-add" ${attr}>${ICON.plus}<span>${label}</span></button>`;
  const x2 = x;
  const go = (url) => (url && /^https?:/.test(url) ? `<a class="cst-go" href="${esc(url)}" target="_blank" rel="noopener" title="Abrir">${ICON.open}</a>` : '');
  const shots = d.rows.filter((r) => r.kind === 'shot').length;
  return `<div class="cst" style="--acc:${esc(d.accent || '#C8382D')}">
    <header class="cst-hero">
      <div class="cst-hl">
        <div class="cst-kick">Dia ${f('day', '1', 'cst-n')} de ${f('days', '1', 'cst-n')}</div>
        ${f('title', 'Nome do projeto', 'cst-title')}
        <label class="cst-date">${ICON.calendar}<span data-prettydate>${esc(fmtDay(d.date) || 'Escolher a data')}</span><input type="date" data-p="date" value="${esc(d.date || '')}" aria-label="Data" onclick="try{this.showPicker()}catch(e){}"></label>
      </div>
      <div class="cst-call">
        <span class="cst-lab">Call</span>
        ${f('call', '08:00', 'cst-big')}
        ${f('place', 'Local / décor', 'cst-place')}
        <div class="cst-addr">${f('address', 'Morada ou link do Google Maps')}${go(d.address)}</div>
      </div>
    </header>

    <div class="cst-grid">
      <section class="cst-card"><h3>Contactos</h3>
        <div class="cst-list">${d.contacts.map((c, i) => `<div class="cst-li"><div class="cst-lic">${f(`contacts.${i}.role`, 'Função', 'cst-role')}${f(`contacts.${i}.value`, 'Nome - telefone', 'cst-val')}</div>${x(`data-rm="contacts:${c.id}"`)}</div>`).join('')}</div>
        <div class="row wrap-gap">${add('data-addc', 'Contacto')}${add('data-pickc', 'Da equipa e elenco')}</div></section>
      <section class="cst-card"><h3>Horários</h3>
        <div class="cst-times">${d.times.map((t, i) => `<div class="cst-time">${f(`times.${i}.label`, 'Hora')}${f(`times.${i}.value`, '00:00', 'cst-tv')}${x(`data-rm="times:${t.id}"`)}</div>`).join('')}</div>
        ${add('data-addt', 'Hora')}
        <h3 class="cst-sub">Meteorologia</h3>
        <div class="cst-weather">${f('weather.text', 'ex: Nublado')}<span class="cst-temp min">${f('weather.min', 'mín.', 'cst-n')}</span><span class="cst-temp max">${f('weather.max', 'máx.', 'cst-n')}</span></div>
      </section>
      <section class="cst-card"><h3>Notas de produção</h3>
        ${ta('notes', 'ex: Base de produção - Bar do Teatro', 3)}
        <h3 class="cst-sub">Hospital mais próximo</h3>
        <div class="cst-place2">${f('hospital.name', 'Nome')}<div class="cst-addr">${f('hospital.url', 'link do Google Maps')}${go(d.hospital?.url)}</div></div>
        <h3 class="cst-sub">Estacionamento mais próximo</h3>
        <div class="cst-place2">${f('parking.name', 'Nome')}<div class="cst-addr">${f('parking.url', 'link do Google Maps')}${go(d.parking?.url)}</div></div>
      </section>
    </div>

    <section class="cst-card"><h3>Calls por departamento</h3>
      <div class="cst-depts">${d.depts.map((t, i) => `<div class="cst-dept">${f(`depts.${i}.name`, 'Departamento')}${f(`depts.${i}.time`, '08:00', 'cst-tv')}${x(`data-rm="depts:${t.id}"`)}</div>`).join('')}${add('data-addd', 'Departamento')}</div>
    </section>

    <section class="cst-card"><div class="cst-h">${f('castTitle', 'Elenco', 'cst-h3')}<span class="muted small">${d.cast.length} ${d.cast.length === 1 ? 'pessoa' : 'pessoas'}</span></div>
      ${d.cast.length ? `<div class="cst-tw"><table class="cst-t"><thead><tr><th>Nome</th><th>Personagem</th><th>Cena</th><th>Call</th><th>Saída</th><th>Obs.</th><th></th></tr></thead><tbody>
        ${d.cast.map((c, i) => `<tr>${['name', 'role', 'scene', 'call', 'out', 'obs'].map((k) => `<td>${f(`cast.${i}.${k}`, '')}</td>`).join('')}<td class="cst-ctl">${x(`data-rm="cast:${c.id}"`)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted small">Ao juntar planos da shotlist, o elenco das secções entra aqui sozinho.</p>'}
      ${add('data-addcast', 'Pessoa')}
    </section>

    <section class="cst-card"><div class="cst-h"><h3>Planos do dia</h3><span class="muted small">${shots} ${shots === 1 ? 'plano' : 'planos'}</span>
        <span class="cst-acts"><button type="button" class="btn primary sm" data-pick>${ICON.plus} Planos da shotlist</button></span></div>
      <div class="cst-tw"><table class="cst-t cst-shots"><thead><tr><th class="cst-num">#</th>${d.cols.map((c, i) => `<th><span class="cst-colh"><input class="cst-in" data-p="cols.${i}.label" value="${esc(c.label)}" aria-label="Nome da coluna">${x(`data-rmcol="${c.id}"`)}</span></th>`).join('')}<th class="cst-ctl"><button type="button" class="cst-x plus" data-addcol title="Juntar coluna" aria-label="Juntar coluna">+</button></th></tr></thead>
        <tbody>${(() => { let n = 0; return d.rows.map((r, i) => {
          const ctl = `<td class="cst-ctl">${r.kind === 'band' ? `<button type="button" class="cst-mv" data-tone="${r.id}" title="Mudar cor da faixa">◐</button>` : ''}<button type="button" class="cst-mv" data-mv="${r.id}:-1" aria-label="Subir">↑</button><button type="button" class="cst-mv" data-mv="${r.id}:1" aria-label="Descer">↓</button>${x(`data-rm="rows:${r.id}"`)}</td>`;
          if (r.kind === 'band') return `<tr class="cst-band ${r.tone || 'grey'}" data-row="${r.id}"><td colspan="${d.cols.length + 1}">${f(`rows.${i}.text`, 'ex: ALMOÇO 13:00 - 14:00')}</td>${ctl}</tr>`;
          n += 1;
          return `<tr data-row="${r.id}"><td class="cst-num"><span>${esc(r.num ?? n)}</span></td>${d.cols.map((c) => `<td class="${/resumo|t[eé]cnico|descri|a[cç][aã]o/i.test(c.label) ? 'wide' : ''}"><textarea class="cst-in" rows="1" data-p="rows.${i}.cells.${c.id}" aria-label="${esc(c.label)}">${esc(r.cells?.[c.id] ?? '')}</textarea></td>`).join('')}${ctl}</tr>`;
        }).join(''); })()}</tbody></table></div>
      <div class="row wrap-gap">${add('data-addrow', 'Linha')}${add('data-addband', 'Faixa (almoço, slider in…)')}</div>
    </section>

    <details class="cst-card cst-more" ${Object.values(d.more || {}).some((x) => String(x || '').trim()) || (d.vehicles || []).length || (d.deptNotes || []).length ? 'open' : ''}>
      <summary><h3>Mais informação</h3><span class="muted small">Aparece nos modelos de exportação que a usam (Longa-metragem, Cartões)</span></summary>
      <div class="cst-mgrid">
        <label><span>Unidade</span>${f('more.unit', 'ex: Unidade principal')}</label><label><span>Subtítulo</span>${f('more.subtitle', 'ex: Uma produção …')}</label>
        <label><span>Base / unit base</span>${f('more.base', 'Onde fica a base')}</label><label><span>Pronto a filmar</span>${f('more.ready', '09:00')}</label>
        <label><span>Wrap previsto</span>${f('more.wrap_est', '19:00')}</label><label><span>Nascer do sol</span>${f('more.sunrise', '07:45')}</label>
        <label><span>Pôr do sol</span>${f('more.sunset', '18:58')}</label><label><span>Emergência</span>${f('more.ambulance', '112')}</label>
        <label><span>Polícia</span>${f('more.police', 'Posto mais próximo')}</label><label><span>Bombeiros</span>${f('more.fire', 'Quartel mais próximo')}</label>
      </div>
      <label class="cst-wide"><span>Apontamentos gerais</span>${ta('more.general', 'Avisos para toda a equipa', 2)}</label>
      <label class="cst-wide"><span>Frase do dia</span>${f('more.quote', 'Opcional')}</label>
      <h3 class="cst-sub">Veículos</h3>
      ${(d.vehicles || []).length ? `<div class="cst-tw"><table class="cst-t"><thead><tr><th>Veículo</th><th>Condutor</th><th>Call</th><th>Notas</th><th></th></tr></thead><tbody>${d.vehicles.map((x, i) => `<tr>${['name', 'driver', 'call', 'obs'].map((k) => `<td>${f(`vehicles.${i}.${k}`, '')}</td>`).join('')}<td class="cst-ctl">${x2(`data-rm="vehicles:${x.id}"`)}</td></tr>`).join('')}</tbody></table></div>` : ''}
      ${add('data-addveh', 'Veículo')}
      <h3 class="cst-sub">Notas por departamento</h3>
      <div class="cst-dn">${(d.deptNotes || []).map((x, i) => `<div class="cst-dni">${f(`deptNotes.${i}.dept`, 'Departamento', 'cst-role')}${ta(`deptNotes.${i}.text`, 'O que este departamento precisa de saber', 2)}${x2(`data-rm="deptNotes:${x.id}"`)}</div>`).join('')}</div>
      ${add('data-adddn', 'Nota de departamento')}
    </details>

    <footer class="cst-foot">${f('footer', 'WRAP', 'cst-footin')}</footer>
  </div>`;
}

// Uma ferramenta guarda todos os dias de rodagem: { sheets: [folha do dia 1, dia 2, …] }.
// (as folhas antigas, de um só dia, passam a ser o dia 1)
const wrap = (data, p) => { const w = data?.sheets?.length ? data : { sheets: [data?.rows ? data : newCallsheet(p, 1)] }; w.sheets.forEach((sh, i) => { if (!sh.day) sh.day = String(i + 1); if (!sh.days) sh.days = String(w.sheets.length); sh.more = sh.more || {}; sh.vehicles = sh.vehicles || []; sh.deptNotes = sh.deptNotes || []; }); return w; };
const shortDay = (iso) => { if (!iso) return ''; const d = new Date(iso + 'T00:00:00'); return d.toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, ''); };

// Escolher a pessoa num menu, como os planos: ao clicar no campo "Nome - telefone" de um contacto aparece a
// equipa e o elenco do projeto; ao escolher entra o nome com o telefone (e a função, se estiver vazia).
let peopleCache = null;
function peoplePicker(main, p, d, save) {
  if (!main.dataset.ppFresh) { main.dataset.ppFresh = '1'; peopleCache = null; } // lista acabada de ler cada vez que se abre a folha
  const norm = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const words = (x) => norm(x).split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !['de', 'da', 'do'].includes(w));
  let box = null; let items = []; let sel = 0; let input = null;
  const close = () => { box?.remove(); box = null; input = null; };
  const pick = (c) => {
    if (!input || !c) return;
    const i = Number(input.dataset.p.split('.')[1]);
    input.value = nameWithPhone(c); set(d, input.dataset.p, input.value);
    const role = main.querySelector(`[data-p="contacts.${i}.role"]`);
    if (role && !role.value.trim()) { role.value = c.kind === 'crew' ? (c.job || c.dept || '') : c.role || ''; set(d, `contacts.${i}.role`, role.value); }
    save(); close();
  };
  const render = () => {
    if (!box || !input) return;
    const i = Number(input.dataset.p.split('.')[1]);
    const role = words(d.contacts[i]?.role);
    const q = norm(input.value).trim();
    const score = (c) => { const j = words(`${c.job} ${c.dept} ${c.role}`); return role.filter((w) => j.some((x) => x.startsWith(w.slice(0, 5)))).length; };
    items = peopleCache.list.filter((c) => !q || norm(`${c.name} ${c.job} ${c.role} ${c.phone}`).includes(q) || norm(nameWithPhone(c)) === q)
      .map((c) => ({ c, s: score(c) })).sort((a, b) => b.s - a.s || (a.c.kind === 'crew' ? -1 : 1) - (b.c.kind === 'crew' ? -1 : 1)).map((x) => x.c);
    sel = Math.min(sel, Math.max(0, items.length - 1));
    box.innerHTML = items.length ? items.map((c, k) => `<button type="button" class="cs-pp-i ${k === sel ? 'on' : ''}" data-k="${k}"><span><b>${esc(c.name)}</b><small>${esc(c.kind === 'crew' ? (c.job || c.dept || 'Equipa') : c.role ? `${c.role}${c.kind === 'extra' ? ' · figurante' : ''}` : 'Elenco')}</small></span><span class="cs-pp-ph">${esc(c.phone || 'sem telefone')}</span></button>`).join('')
      : `<p class="muted small">Ninguém com esse nome na equipa nem no elenco. Junta as pessoas em Equipa e convites.</p>`;
    box.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('mousedown', (e) => { e.preventDefault(); pick(items[+b.dataset.k]); }));
  };
  const open = async (el) => {
    if (input === el && box) return;
    close(); input = el;
    if (peopleCache?.pid !== p.id) peopleCache = { pid: p.id, list: await projectContacts(p) };
    if (input !== el) return;
    box = document.createElement('div'); box.className = 'cs-pp'; box.setAttribute('role', 'listbox');
    const r = el.getBoundingClientRect();
    box.style.left = `${Math.max(8, Math.min(r.left + window.scrollX, window.innerWidth - 340))}px`; box.style.top = `${r.bottom + window.scrollY + 4}px`; box.style.minWidth = `${Math.max(280, r.width)}px`;
    document.body.append(box); sel = 0; render();
  };
  main.querySelectorAll('[data-p^="contacts."][data-p$=".value"]').forEach((el) => {
    el.setAttribute('autocomplete', 'off');
    el.addEventListener('focus', () => open(el));
    el.addEventListener('click', () => open(el));
    el.addEventListener('input', () => { if (box && input === el) { sel = 0; render(); } });
    el.addEventListener('blur', () => setTimeout(() => { if (input === el) close(); }, 120));
    el.addEventListener('keydown', (e) => {
      if (!box || input !== el) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); render(); }
      else if (e.key === 'Enter' && items[sel]) { e.preventDefault(); pick(items[sel]); }
      else if (e.key === 'Escape') { close(); }
    });
  });
}

export function callsheetTool(main, p, tool) {
  const all = wrap(tool.data, p);
  const key = `bg-cs-day:${tool.id}`;
  let cur = 0; try { cur = Math.min(all.sheets.length - 1, Math.max(0, Number(localStorage.getItem(key)) || 0)); } catch { /* nada */ }
  let d = all.sheets[cur];
  const save = debounce(async () => { all.sheets[cur] = d; const { error } = await sb.from('boards').update({ data: all, updated_at: new Date().toISOString() }).eq('id', tool.id); if (error) toast('Não foi possível guardar: ' + error.message); else tool.data = all; });
  const go = (i) => { cur = Math.max(0, Math.min(all.sheets.length - 1, i)); d = all.sheets[cur]; try { localStorage.setItem(key, cur); } catch { /* nada */ } draw(); };
  // "DIA x DE y" acompanha os dias quando se junta ou tira um dia
  const renumber = () => { const n = all.sheets.length; all.sheets.forEach((sh, i) => { sh.day = String(i + 1); sh.days = String(n); }); };
  const used = () => { const m = new Map(); all.sheets.forEach((sh, i) => { if (i !== cur) sh.rows.forEach((r) => r.shot_id && m.set(r.shot_id, sh.day || i + 1)); }); return m; };
  const addDay = (blank) => {
    const copy = blank ? newCallsheet(p, 1) : JSON.parse(JSON.stringify(d));
    if (!blank) { copy.rows = copy.rows.filter((r) => r.kind === 'band'); copy.cast = []; copy.weather = { text: '', min: '', max: '' }; }
    copy.accent = d.accent; copy.title = d.title; copy.footer = d.footer;
    const last = all.sheets[all.sheets.length - 1]?.date;
    if (last) { const nx = new Date(last + 'T00:00:00'); nx.setDate(nx.getDate() + 1); copy.date = `${nx.getFullYear()}-${String(nx.getMonth() + 1).padStart(2, '0')}-${String(nx.getDate()).padStart(2, '0')}`; } else copy.date = '';
    all.sheets.push(copy); renumber(); save(); go(all.sheets.length - 1);
    toast(blank ? 'Dia novo, em branco.' : 'Dia novo com os mesmos contactos, horários e local (sem planos nem elenco).');
  };
  // hospital, polícia, bombeiros, meteorologia e sol a partir do décor do dia (ou da morada escrita)
  // ao abrir: se o local de um dia é um décor do projeto, a morada acompanha a do décor
  (async () => {
    const { data: locs } = await sb.from('locations').select('id, name, info').eq('project_id', p.id);
    const n = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    let changed = false;
    all.sheets.forEach((sh) => {
      const l = (locs || []).find((x) => sh.place && n(x.name) === n(sh.place)); const a = placeAddr(p, l);
      if (l && a && a !== (sh.address || '').trim()) { sh.address = a; if (sh.hospital) sh.hospital = { name: '', url: '' }; changed = true; }
    });
    if (changed) { save(); draw(); toast('Morada atualizada a partir do décor.'); }
  })();
  const geoTried = new Set();
  const geoFill = async ({ hosp = false, wx = false, loud = false }) => {
    if (!d.place && !d.address) { if (loud) toast('Escreve primeiro o local ou a morada.'); return; }
    if (loud) toast('A procurar…', 6000);
    try {
      const { data: locs } = await sb.from('locations').select('id, name, info').eq('project_id', p.id);
      const n = (x) => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
      let loc = (locs || []).find((l) => n(l.name) === n(d.place)) || (locs || []).find((l) => d.place && (n(l.name).includes(n(d.place)) || n(d.place).includes(n(l.name))));
      if (loc && !placeAddr(p, loc) && d.address) loc = null;
      const { placeInfo } = await import('./placegeo.js');
      const { geocode, nearby, weatherFor, weatherLine, pinUrl } = await import('./geo.js');
      let info = loc ? await placeInfo(p, loc) : null;
      if (!info && d.address) { const g = await geocode(d.address); if (g) { const nb = await nearby(g); info = { geo: g, hospital: nb.hospitals[0], police: nb.police[0], fire: nb.fire[0] }; } }
      if (!info?.geo) { if (loud) toast('Não encontrei este local no mapa. Junta a morada no décor ou aqui.'); return; }
      const sheet = d; let changed = false;
      const put = (path, v, force) => { const cur0 = get(sheet, path); if (v && (force || !cur0)) { set(sheet, path, v); changed = true; } };
      sheet.more ||= {};
      if (info.hospital) { put('hospital.name', `${info.hospital.name}${info.hospital.min != null ? ` (${info.hospital.min} min)` : ''}`, hosp); put('hospital.url', info.hospital.url, hosp); }
      if (info.police) put('more.police', `${info.police.name}${info.police.phone ? ` · ${info.police.phone}` : ''}`, hosp);
      if (info.fire) put('more.fire', `${info.fire.name}${info.fire.phone ? ` · ${info.fire.phone}` : ''}`, hosp);
      put('more.ambulance', '112', false);
      if (sheet.date) {
        const w = await weatherFor(info.geo, sheet.date);
        sheet.weather ||= {};
        put('weather.text', `${weatherLine(w)}${w.kind === 'estimativa' ? ' (estimativa)' : ''}`, wx);
        if (w.min != null) { put('weather.min', `${w.min}°`, wx); put('weather.max', `${w.max}°`, wx); }
        put('more.sunrise', w.sunrise, wx); put('more.sunset', w.sunset, wx);
      }
      if (changed && sheet === d) { save(); draw(); }
      if (loud) toast(changed ? 'Folha preenchida com o hospital, o sol e o tempo. Confirma antes de enviar.' : 'Já estava tudo preenchido.');
      void pinUrl;
    } catch (e) { if (loud) toast(e.message || 'Não foi possível procurar agora.'); }
  };
  const draw = () => {
    main.innerHTML = `<div class="cs-days" role="tablist" aria-label="Dias de rodagem">
        <button type="button" class="cs-dnav" data-go="-1" aria-label="Dia anterior" ${cur === 0 ? 'disabled' : ''}>${ICON.back}</button>
        <div class="cs-dtabs">${all.sheets.map((sh, i) => `<button type="button" role="tab" class="cs-dtab ${i === cur ? 'on' : ''}" aria-selected="${i === cur}" data-day="${i}" style="--acc:${esc(sh.accent || '#C8382D')}"><b>Dia ${esc(sh.day || i + 1)}</b>${sh.date ? `<small>${esc(shortDay(sh.date))}</small>` : ''}<small class="muted">${sh.rows.filter((r) => r.kind === 'shot').length} pl.</small></button>`).join('')}</div>
        <button type="button" class="cs-dnav" data-go="1" aria-label="Dia seguinte" ${cur === all.sheets.length - 1 ? 'disabled' : ''}>${ICON.chev}</button>
        <button type="button" class="btn ghost" data-addday>${ICON.plus} Dia</button>
        <button type="button" class="btn ghost" data-addblank title="Dia novo sem copiar nada">${ICON.plus} Dia em branco</button>
        ${all.sheets.length > 1 ? `<button type="button" class="btn ghost danger-text" data-rmday title="Apagar este dia">${ICON.trash}</button>` : ''}
      </div>
      <div class="row between wrap-gap cs-bar">
        <div class="row wrap-gap"><label class="cs-acc" title="Cor de destaque"><input type="color" data-acc value="${esc(d.accent || '#C8382D')}"><span>Cor</span></label>
          <button type="button" class="btn ghost" data-import>${ICON.open} Importar do Excel</button>
          <button type="button" class="btn ghost" data-geofill title="Hospital mais perto, polícia, bombeiros, meteorologia e horas do sol, a partir do local e da data">☀︎ Hospital, sol e tempo</button></div>
        <button type="button" class="btn primary" data-export>${ICON.open} Exportar</button></div>
      ${studioHtml(d)}`;
    const auto = (t) => { if (t.tagName === 'TEXTAREA') { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; } };
    main.querySelectorAll('.cst textarea').forEach(auto);
    main.querySelectorAll('[data-p]').forEach((el) => el.addEventListener('input', () => { set(d, el.dataset.p, el.value); auto(el); save(); if (el.dataset.p === 'date') { const pd = main.querySelector('[data-prettydate]'); if (pd) pd.textContent = fmtDay(d.date) || 'Escolher a data'; }
      if (['date', 'day'].includes(el.dataset.p)) { const t = main.querySelector(`[data-day="${cur}"]`); if (t) t.innerHTML = `<b>Dia ${esc(d.day || cur + 1)}</b>${d.date ? `<small>${esc(shortDay(d.date))}</small>` : ''}<small class="muted">${d.rows.filter((r) => r.kind === 'shot').length} pl.</small>`; } }));
    main.querySelector('[data-acc]').addEventListener('input', (e) => { d.accent = e.target.value; main.querySelector('.cst').style.setProperty('--acc', d.accent); save(); });
    main.querySelectorAll('[data-day]').forEach((b) => b.addEventListener('click', () => go(Number(b.dataset.day))));
    main.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(cur + Number(b.dataset.go))));
    main.querySelector('[data-addday]').addEventListener('click', () => addDay(false));
    main.querySelector('[data-addblank]').addEventListener('click', () => addDay(true));
    main.querySelector('[data-rmday]')?.addEventListener('click', async () => {
      if (!(await confirmBox(`Apagar o dia ${d.day || cur + 1} e tudo o que está nesta folha?`, 'Apagar dia'))) return;
      all.sheets.splice(cur, 1); renumber(); save(); go(Math.min(cur, all.sheets.length - 1));
    });
    const on = (sel, fn) => main.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { fn(b); save(); draw(); }));
    on('[data-addc]', () => d.contacts.push({ id: uid(), role: '', value: '' }));
    // contactos da equipa e do elenco: escolhe-se a pessoa e entra "Nome - telefone" com a função
    main.querySelectorAll('[data-pickc]').forEach((b) => b.addEventListener('click', async () => {
      const list = await projectContacts(p);
      if (!list.length) return toast('Ainda não há pessoas com contacto no projeto. Junta-as em Equipa e convites ou em Atores e figurantes.');
      const m = modal(`<h2>Juntar contactos</h2><p class="muted small">Quem já tem telefone na equipa ou no elenco. Para mudar um número, muda-o na pessoa e volta a juntar.</p>
        <div class="cs-cpick">${list.map((c, i) => `<label class="cs-cpi"><input type="checkbox" value="${i}" ${d.contacts.some((x) => x.value === nameWithPhone(c)) ? 'checked disabled' : ''}><span><b>${esc(c.name)}</b><small class="muted">${esc([c.job, c.phone || 'sem telefone'].filter(Boolean).join(' · '))}</small></span></label>`).join('')}</div>
        <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Juntar</button></div>`, { wide: true });
      m.el.querySelector('[data-ok]').addEventListener('click', () => {
        [...m.el.querySelectorAll('input:checked:not(:disabled)')].forEach((cb) => { const c = list[+cb.value]; d.contacts.push({ id: uid(), role: c.kind === 'crew' ? (c.job || c.dept || '') : c.role ? `${c.role}${c.kind === 'extra' ? ' (figurante)' : ''}` : 'Elenco', value: nameWithPhone(c) }); });
        m.close(); save(); draw();
      });
    }));
    peoplePicker(main, p, d, save);
    bindTimes([...main.querySelectorAll('[data-p]')].filter((el) => TIME_P.test(el.dataset.p)));
    main.querySelector('[data-geofill]')?.addEventListener('click', () => geoFill({ hosp: true, wx: true, loud: true }));
    ['place', 'address'].forEach((k) => main.querySelector(`[data-p="${k}"]`)?.addEventListener('change', () => geoFill({ hosp: true })));
    main.querySelector('[data-p="date"]')?.addEventListener('change', () => geoFill({ wx: true }));
    { const k = `${cur}|${d.place}|${d.address}|${d.date}`; if (!geoTried.has(k) && (d.place || d.address) && (!d.hospital?.name || (d.date && !d.weather?.text))) { geoTried.add(k); geoFill({}); } }
    on('[data-addt]', () => d.times.push({ id: uid(), label: '', value: '' }));
    on('[data-addd]', () => d.depts.push({ id: uid(), name: '', time: '' }));
    on('[data-addcast]', () => d.cast.push({ id: uid(), name: '', role: '', scene: '', call: '', out: '', obs: '' }));
    on('[data-addrow]', () => d.rows.push({ id: uid(), kind: 'shot', cells: {} }));
    on('[data-addband]', () => d.rows.push({ id: uid(), kind: 'band', text: '', tone: 'grey' }));
    on('[data-addcol]', () => d.cols.push({ id: uid(), label: 'Nova' }));
    on('[data-addveh]', () => d.vehicles.push({ id: uid(), name: '', driver: '', call: '', obs: '' }));
    on('[data-adddn]', () => d.deptNotes.push({ id: uid(), dept: '', text: '' }));
    on('[data-tone]', (b) => { const r = d.rows.find((y) => y.id === b.dataset.tone); r.tone = r.tone === 'yellow' ? 'grey' : 'yellow'; });
    on('[data-mv]', (b) => { const [id, dir] = b.dataset.mv.split(':'); const i = d.rows.findIndex((y) => y.id === id); const j = i + Number(dir); if (j < 0 || j >= d.rows.length) return; [d.rows[i], d.rows[j]] = [d.rows[j], d.rows[i]]; });
    main.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
      const [list, id] = b.dataset.rm.split(':');
      if (list === 'rows' && !(await confirmBox('Tirar esta linha da folha?', 'Tirar'))) return;
      d[list] = d[list].filter((y) => y.id !== id); save(); draw();
    }));
    main.querySelectorAll('[data-rmcol]').forEach((b) => b.addEventListener('click', async () => {
      const c = d.cols.find((y) => y.id === b.dataset.rmcol); if (!(await confirmBox(`Tirar a coluna "${c.label}"?`, 'Tirar'))) return; d.cols = d.cols.filter((y) => y !== c); save(); draw();
    }));
    main.querySelector('[data-pick]').addEventListener('click', () => { const before = `${d.place}|${d.address}`; pickShots(p, d, () => { save(); draw(); if (`${d.place}|${d.address}` !== before) geoFill({ hosp: true }); }, used()); });
    main.querySelector('[data-export]').addEventListener('click', () => exportDialog(all, cur, () => { save(); draw(); }));
    main.querySelector('[data-import]').addEventListener('click', () => importXlsx(d, (nd) => { all.sheets[cur] = nd; d = nd; save(); draw(); }));
  };
  draw();
}

// escolher os planos do dia: vêm com a secção/cena, descrição, câmara, técnica; o décor e o elenco preenchem-se
async function pickShots(p, d, after, elsewhere = new Map()) {
  const [{ data: shots }, { data: scenes }, { data: locs }, { data: chars }] = await Promise.all([
    sb.from('shots').select('*').eq('project_id', p.id).order('position'),
    sb.from('scenes').select('id, number, heading, int_ext, time_of_day, location_id, location_ids, character_ids, extra_ids, position').eq('project_id', p.id).order('position'),
    sb.from('locations').select('id, name, info').eq('project_id', p.id),
    sb.from('characters').select('id, name, actor, info').eq('project_id', p.id),
  ]);
  const used = new Set(d.rows.map((r) => r.shot_id).filter(Boolean));
  // mesma ordem e numeração da shotlist: secção a secção (por posição), depois os planos sem secção
  const byPos = (a, b) => (a.position || 0) - (b.position || 0);
  const groups = [...(scenes || []).map((s) => ({ s, list: (shots || []).filter((x) => x.scene_id === s.id).sort(byPos) })), { s: null, list: (shots || []).filter((x) => !x.scene_id || !(scenes || []).some((s) => s.id === x.scene_id)) }].filter((g) => g.list.length);
  if (!groups.length) return toast('Ainda não há planos no projeto. Junta-os na shotlist ou no storyboard.');
  let n = 0; const num = new Map(); groups.forEach((g) => g.list.forEach((x) => num.set(x.id, ++n)));
  const ordered = groups.flatMap((g) => g.list);
  const urls = new Map(await Promise.all(ordered.filter((x) => x.image_path).map(async (x) => [x.id, await signedUrl(x.image_path).catch(() => null)])));
  let view = 'list'; try { view = localStorage.getItem('bg-cs-pick') || 'list'; } catch { /* nada */ }
  const lbl = (x) => `<span class="cs-pn">${num.get(x.id)}</span><span class="cs-pd">${x.code ? `<b>${esc(x.code)}</b> · ` : ''}${esc(x.description || 'Plano sem descrição')}</span>`;
  const item = (x) => `<label class="cs-pi"><input type="checkbox" value="${x.id}" ${used.has(x.id) ? 'disabled checked' : ''}>${view === 'grid' ? `<span class="cs-pimg">${urls.get(x.id) ? `<img src="${esc(urls.get(x.id))}" alt="" loading="lazy">` : `<span class="cs-pnoimg">${ICON.image}</span>`}</span>` : ''}<span class="cs-pt">${lbl(x)}</span>${used.has(x.id) ? '<small class="muted">já neste dia</small>' : elsewhere.has(x.id) ? `<small class="muted">no dia ${esc(elsewhere.get(x.id))}</small>` : ''}</label>`;
  const m = modal(`<div class="row between wrap-gap"><h2>Planos deste dia</h2><div class="seg dark view-seg" role="radiogroup" aria-label="Vista">${[['list', ICON.list, 'Lista'], ['grid', ICON.image, 'Grelha']].map(([k, ic, l]) => `<button type="button" role="radio" data-v="${k}" title="${l}">${ic}<span>${l}</span></button>`).join('')}</div></div><p class="muted small">Escolhe os planos. A numeração é a da shotlist e entram por essa ordem, com a ${p._hasScript ? 'cena' : 'secção'}, a descrição e a técnica; o décor e o elenco preenchem-se sozinhos.</p>
    <div class="cs-pick" data-pickbox></div>
    <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Juntar à folha</button></div>`, { wide: true });
  const box = m.el.querySelector("[data-pickbox]");
  const drawPick = () => {
    const keep = new Set([...box.querySelectorAll('input[value]:checked:not(:disabled)')].map((c) => c.value));
    box.className = `cs-pick ${view === 'grid' ? 'is-grid' : ''}`;
    box.innerHTML = groups.map(({ s, list }) => `<fieldset><legend><label><input type="checkbox" data-all> ${esc(s ? s.heading || 'Sem nome' : 'Sem secção')} <span class="muted small">${num.get(list[0].id)}–${num.get(list[list.length - 1].id)}</span></label></legend><div class="cs-pl">${list.map(item).join('')}</div></fieldset>`).join('');
    box.querySelectorAll('input[value]').forEach((c) => { if (keep.has(c.value)) c.checked = true; });
    box.querySelectorAll('[data-all]').forEach((a) => a.addEventListener('change', () => a.closest('fieldset').querySelectorAll('input[value]:not(:disabled)').forEach((c) => (c.checked = a.checked))));
    m.el.querySelectorAll('[data-v]').forEach((b) => { b.setAttribute('aria-checked', b.dataset.v === view); b.setAttribute('aria-selected', b.dataset.v === view); });
  };
  m.el.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => { view = b.dataset.v; try { localStorage.setItem('bg-cs-pick', view); } catch { /* nada */ } drawPick(); }));
  drawPick();
  m.el.querySelector('[data-ok]').addEventListener('click', () => {
    const ids = [...m.el.querySelectorAll('input[value]:checked:not(:disabled)')].map((c) => c.value);
    if (!ids.length) return m.close();
    const chosen = ordered.filter((x) => ids.includes(x.id));
    const secIds = new Set();
    chosen.forEach((x) => {
      const s = (scenes || []).find((y) => y.id === x.scene_id); if (s) secIds.add(s.id);
      const people = s ? [...(s.character_ids || []), ...(s.extra_ids || [])] : [];
      const idx = people.map((pid) => (chars || []).findIndex((c) => c.id === pid) + 1).filter((n) => n > 0);
      const cells = {
        cena: s ? (p._hasScript ? s.number : s.heading) : '', efeito: s ? [s.int_ext, s.time_of_day].filter(Boolean).join('/') : '', crono: '',
        actor: idx.join(';'), resumo: x.description || '', cam: [x.rig, x.lens].filter(Boolean).join(' · '),
        tecnico: [x.framing, x.movement, x.direction_notes, x.tech_notes].filter(Boolean).join(' || '), paf: x.tc || '',
      };
      d.rows.push({ id: uid(), kind: 'shot', shot_id: x.id, num: num.get(x.id), cells });
    });
    // décor e elenco do dia
    const secs = (scenes || []).filter((s) => secIds.has(s.id));
    const locIds = [...new Set(secs.flatMap((s) => [s.location_id, ...(s.location_ids || [])]).filter(Boolean))];
    const loc = (locs || []).find((l) => l.id === locIds[0]);
    const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    if (loc && !d.place) d.place = loc.name;
    // a morada vem sempre do décor (a que está escrita na página do décor), se o local da folha for esse décor
    if (loc && placeAddr(p, loc) && same(d.place, loc.name)) d.address = placeAddr(p, loc);
    const castIds = [...new Set(secs.flatMap((s) => [...(s.character_ids || []), ...(s.extra_ids || [])]))];
    castIds.forEach((cid) => {
      const c = (chars || []).find((y) => y.id === cid); if (!c || d.cast.some((y) => y.char_id === cid)) return;
      const scs = secs.filter((s) => [...(s.character_ids || []), ...(s.extra_ids || [])].includes(cid)).map((s) => (p._hasScript ? s.number : s.heading)).join(', ');
      d.cast.push({ id: uid(), char_id: cid, name: c.actor || c.name, role: c.info?.extra ? 'Figurante' : c.actor ? c.name : (c.info?.role || ''), scene: scs, call: d.call || '', out: '', obs: c.info?.phone ? `Tel. ${c.info.phone}` : '' });
    });
    m.close(); after();
    toast(`${chosen.length} ${chosen.length === 1 ? 'plano juntado' : 'planos juntados'}${loc ? `, décor: ${loc.name}` : ''}.`);
  });
}

// importar uma folha feita no Excel/Google Sheets: reconhece os rótulos habituais e a tabela de planos
async function importXlsx(d, done) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xlsm';
  inp.onchange = async () => {
    const file = inp.files[0]; if (!file) return;
    try {
      toast('A ler o ficheiro…');
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const grid = []; ws.eachRow({ includeEmpty: true }, (row, r) => { const vals = []; row.eachCell({ includeEmpty: true }, (cell, c) => { let v = cell.value; if (v && typeof v === 'object') v = v.result ?? v.text ?? v.hyperlink ?? (v.richText ? v.richText.map((t) => t.text).join('') : ''); if (v instanceof Date) v = v.toISOString(); vals[c - 1] = v == null ? '' : String(v).trim(); }); grid[r - 1] = vals; });
      const rows = grid.map((r) => (r || []).map((v) => v ?? ''));
      const nd = JSON.parse(JSON.stringify(d));
      const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
      const next = (r, c) => { for (let k = c + 1; k < (rows[r] || []).length; k++) if (rows[r][k]) return rows[r][k]; return rows[r + 1]?.[c] || ''; };
      const used = new Set();
      rows.forEach((r, ri) => r.forEach((v, ci) => {
        const n = norm(v); if (!n) return;
        const take = () => { used.add(ri); return next(ri, ci); };
        let m;
        if ((m = n.match(/^call:?\s*(\d{1,2}[:h]\d{2})h?\s*-?\s*(.*)$/i))) { nd.call = m[1].replace('h', ':'); if (m[2]) nd.place = v.split('-').slice(1).join('-').trim(); }
        else if (n.startsWith('morada')) nd.address = v.replace(/^morada:?\s*/i, '') || take();
        else if (n.startsWith('notas de produ')) nd.notes = rows[ri + 1]?.find(Boolean) || '';
        else if (n.startsWith('hospital')) { const t = rows[ri + 1]?.find(Boolean) || ''; nd.hospital = { name: t.replace(/https?:\/\/\S+/, '').trim(), url: (t.match(/https?:\/\/\S+/) || [''])[0] }; }
        else if (n.startsWith('estacionamento')) { const t = rows[ri + 1]?.find(Boolean) || ''; nd.parking = { name: t.replace(/https?:\/\/\S+/, '').trim(), url: (t.match(/https?:\/\/\S+/) || [''])[0] }; }
        else if (/^(paf|almoco|wrap|jantar|pequeno.almoco)\s*:?$/.test(n)) { const label = v.replace(/:$/, ''); const val = take(); const ex = nd.times.find((t) => norm(t.label) === norm(label)); if (ex) ex.value = val; else nd.times.push({ id: uid(), label, value: val }); }
        else if ((m = n.match(/dia\s*(\d+)\s*de\s*(\d+)/))) { nd.day = m[1]; nd.days = m[2]; }
        else if (/(produc|realiza|ass\.)/.test(n) && ci <= 2 && /\d{3}\s?\d{3}\s?\d{3}/.test(next(ri, ci))) { const val = take(); const ex = nd.contacts.find((c) => norm(c.role) === n); if (ex) ex.value = val; else nd.contacts.push({ id: uid(), role: v, value: val }); }
      }));
      if (rows[0]) { const t = rows.find((r) => r.filter(Boolean).length === 1)?.find(Boolean); if (t) nd.title = t; }
      // departamentos: linha com vários nomes de departamento e a de baixo com horas
      const deptRow = rows.findIndex((r) => r.filter((v) => /^(realiza|produc|imagem|ilumina|arte|som|guarda|make|df)/.test(norm(v))).length >= 3);
      if (deptRow >= 0) nd.depts = rows[deptRow].map((v, c) => (v ? { id: uid(), name: v, time: rows[deptRow + 1]?.[c] || '' } : null)).filter(Boolean);
      // elenco: cabeçalho com PERSONAGEM
      const castRow = rows.findIndex((r) => r.some((v) => /^personage/.test(norm(v))));
      if (castRow >= 0) {
        const h = rows[castRow].map(norm); const col = (re) => h.findIndex((v) => re.test(v));
        const ci = { name: h.findIndex((v) => v), role: col(/personage/), scene: col(/^cena/), call: col(/^call/), out: col(/saida/), obs: col(/^obs/) };
        nd.castTitle = rows[castRow][ci.name] || 'Elenco'; nd.cast = [];
        for (let r = castRow + 1; r < rows.length && rows[r].some(Boolean) && !rows[r].some((v) => /resumo|efeito/.test(norm(v))); r++) nd.cast.push({ id: uid(), name: rows[r][ci.name] || '', role: rows[r][ci.role] || '', scene: rows[r][ci.scene] || '', call: rows[r][ci.call] || '', out: rows[r][ci.out] || '', obs: rows[r][ci.obs] || '' });
      }
      // planos: cabeçalho com RESUMO / CENA / EFEITO…
      const shotRow = rows.findIndex((r) => r.filter((v) => /^(cena|efeito|crono|resumo|cam|tecnico|paf|actor|ator)/.test(norm(v))).length >= 3);
      if (shotRow >= 0) {
        const hdr = rows[shotRow].map((v, c) => ({ c, v })).filter((x) => x.v);
        nd.cols = hdr.map((x) => ({ id: 'c' + x.c, label: x.v }));
        nd.rows = [];
        for (let r = shotRow + 1; r < rows.length; r++) {
          const vals = rows[r]; const filled = vals.filter(Boolean);
          if (!filled.length) continue;
          if (filled.length === 1) { const t = filled[0]; nd.rows.push({ id: uid(), kind: 'band', text: t, tone: /almo|wrap/i.test(t) ? 'yellow' : 'grey' }); continue; }
          const cells = {}; hdr.forEach((x) => (cells['c' + x.c] = vals[x.c] || '')); nd.rows.push({ id: uid(), kind: 'shot', cells });
        }
        const last = nd.rows[nd.rows.length - 1]; if (last?.kind === 'band' && /^wrap/i.test(last.text)) { nd.footer = last.text; nd.rows.pop(); }
      }
      done(nd); toast('Folha importada. Confere os campos: os que não reconheci ficaram como estavam.');
    } catch (e) { toast('Não consegui ler este ficheiro: ' + (e.message || e)); }
  };
  inp.click();
}

// documento completo (para imprimir e para a pré-visualização), no modelo escolhido
function docHtml(list, modelId = 'classic') {
  const d = list[0];
  const model = CS_MODELS.find((x) => x.id === modelId) || CS_MODELS[0];
  let css = ''; let pages;
  if (model.render) {
    const out = list.map((x) => model.render(x, paletteOf(x), inkOn));
    css = out[0].css; pages = out.map((o) => o.body);
  } else {
    css = [...document.styleSheets].map((st) => { try { return [...st.cssRules].map((r) => r.cssText).filter((t) => /\.cs[\s.\-{:,]|\.cs$/.test(t) && !t.includes('.cst')).join('\n'); } catch { return ''; } }).join('\n')
      + ' .cs-frame { padding: 16px !important; } a { color: #1155cc; } body { font: 9px/1.3 Arial, Helvetica, sans-serif; color: #000; }';
    pages = list.map((x) => sheetHtml(x, false));
  }
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(d.title)} — Folha de serviço ${list.length > 1 ? 'todos os dias' : 'dia ' + esc(d.day)}</title><style>
    @page { size: A4 portrait; margin: 8mm; } * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; background: #fff; } ${css}
  </style></head><body>${pages.map((b, i) => `<div style="${i ? 'break-before: page;' : ''}">${b}</div>`).join('')}</body></html>`;
}
function printSheet(list, modelId) {
  const html = docHtml(list, modelId);
  const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(fr); const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000); }, 300);
}

function exportDialog(all, cur, changed) {
  let pref = {}; try { pref = JSON.parse(localStorage.getItem('bg-cs-export') || '{}'); } catch { /* nada */ }
  const fmt = pref.fmt || 'pdf';
  const d = all.sheets[cur];
  const pal = paletteOf(d);
  let model = d.model || 'classic';
  const radio = (name, val, on, title, sub) => `<label class="cs-opt"><input type="radio" name="${name}" value="${val}" ${on ? 'checked' : ''}><span><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></label>`;
  const same = (a, b) => PALETTE_KEYS.every(([k]) => String(a[k]).toLowerCase() === String(b[k]).toLowerCase());
  const chip = ([name, p]) => `<button type="button" class="cs-pre ${same(p, pal) ? 'on' : ''}" data-pre="${esc(name)}" title="${esc(name)}"><span class="cs-pre-sw" style="--f:${p.frame};--h:${p.hi};--l:${p.lo};--b:${p.box};--n:${p.ln}"><i></i><i></i><i></i></span><span>${esc(name)}</span></button>`;
  const m = modal(`<h2>Exportar folha de serviço</h2>
    <form class="stack" data-f>
      <fieldset class="cs-opts"><legend>Formato</legend>${radio('fmt', 'pdf', fmt === 'pdf', 'PDF', 'Para enviar e imprimir, no modelo escolhido')}${radio('fmt', 'xlsx', fmt === 'xlsx', 'Excel (.xlsx)', 'Para editar no Excel ou Google Sheets (grelha clássica)')}</fieldset>
      <fieldset class="cs-opts cs-models"><legend>Modelo</legend>${CS_MODELS.map((x) => radio('model', x.id, x.id === model, x.label, x.desc)).join('')}</fieldset>
      <div class="cs-colors">
        <div class="stack">
          <span class="cs-leg">Cores</span>
          <div class="cs-pres">${PRESETS.map(chip).join('')}</div>
          <div class="cs-cols">${PALETTE_KEYS.map(([k, l]) => `<label class="cs-col"><input type="color" name="c-${k}" value="${esc(pal[k])}"><span>${l}</span></label>`).join('')}</div>
          <small class="muted">As cores ficam guardadas nesta folha de serviço (todos os dias). O texto passa a branco ou preto sozinho para se ler bem.</small>
        </div>
        <div class="cs-prev" aria-hidden="true"><iframe data-prev title="Pré-visualização" tabindex="-1"></iframe></div>
      </div>
      ${all.sheets.length > 1 ? `<fieldset class="cs-opts"><legend>Dias</legend>${radio('days', 'one', true, `Só o dia ${esc(d.day || cur + 1)}`)}${radio('days', 'all', false, `Todos os dias (${all.sheets.length})`, 'No PDF, um dia por página; no Excel, uma folha por dia')}</fieldset>` : ''}
      <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn primary">Exportar</button></div>
    </form>`, { wide: true });
  const f = m.el.querySelector('[data-f]');
  const read = () => Object.fromEntries(PALETTE_KEYS.map(([k]) => [k, f.elements[`c-${k}`].value]));
  const fr = m.el.querySelector('[data-prev]');
  let prevT;
  const paint = () => {
    const cur2 = read();
    clearTimeout(prevT); prevT = setTimeout(() => { fr.srcdoc = docHtml([{ ...d, palette: cur2, accent: cur2.frame }], model); }, 80);
    m.el.querySelectorAll('[data-pre]').forEach((b) => b.classList.toggle('on', same(PRESETS.find(([n]) => n === b.dataset.pre)[1], cur2)));
  };
  f.querySelectorAll('input[type=color]').forEach((i) => i.addEventListener('input', paint));
  const xlsxNote = () => { const x = f.elements.fmt.value === 'xlsx'; m.el.querySelector('.cs-models').classList.toggle('dim', x); };
  f.querySelectorAll('[name=fmt]').forEach((r) => r.addEventListener('change', xlsxNote));
  f.querySelectorAll('[name=model]').forEach((r) => r.addEventListener('change', () => {
    model = r.value;
    const mm = CS_MODELS.find((x) => x.id === model); const p = mm.preset || PRESETS[0][1];
    PALETTE_KEYS.forEach(([k]) => (f.elements[`c-${k}`].value = p[k])); paint();
  }));
  paint(); xlsxNote();
  m.el.querySelectorAll('[data-pre]').forEach((b) => b.addEventListener('click', () => { const p = PRESETS.find(([n]) => n === b.dataset.pre)[1]; PALETTE_KEYS.forEach(([k]) => (f.elements[`c-${k}`].value = p[k])); paint(); }));
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = Object.fromEntries(new FormData(f));
    const np = read();
    // guarda as cores em todos os dias desta folha
    all.sheets.forEach((sh) => { sh.palette = { ...np }; sh.accent = np.frame; sh.model = model; });
    changed && changed();
    try { localStorage.setItem('bg-cs-export', JSON.stringify({ fmt: v.fmt })); } catch { /* nada */ }
    const list = v.days === 'all' ? all.sheets : [d];
    m.close();
    if (v.fmt === 'xlsx') await exportXlsx(list); else printSheet(list, model);
  });
}

async function exportXlsx(list) {
  toast('A preparar o Excel…');
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'byGrain Studio';
  const argb = (hex) => 'FF' + String(hex || '#C8382D').replace('#', '').toUpperCase();
  list.forEach((d, si) => {
    const pal = paletteOf(d);
    const YEL = argb(pal.hi), GRY = argb(pal.lo), BOX = argb(pal.box);
    const ink = (a) => argb(inkOn('#' + a.slice(2)));
    const line = { style: 'thin', color: { argb: argb(pal.ln) } };
    const border = { top: line, left: line, bottom: line, right: line };
    const name = `Dia ${d.day || si + 1}`.replace(/[\\/?*[\]:]/g, '').slice(0, 31);
    const ws = wb.addWorksheet(wb.worksheets.some((w) => w.name === name) ? `${name} (${si + 1})` : name, { properties: { tabColor: { argb: argb(d.accent) } }, pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.3, bottom: 0.3, header: 0, footer: 0 } } });
    const N = Math.max(d.cols.length, 8, Math.min(d.depts.length, 12));
    // a moldura: uma coluna e uma linha de cada lado, pintadas com a cor da folha (no modelo clássico)
    ws.columns = [{ width: 2.5 }, ...Array.from({ length: N }, (_, i) => ({ width: d.cols[i] && /resumo|t[eé]cnico|cam/i.test(d.cols[i].label) ? 26 : 13 })), { width: 2.5 }];
    ws.getRow(1).height = 10;
    const H = Math.floor(N / 2);
    let r = 1;
    const cell = (row, col, value, o = {}) => {
      const c = ws.getCell(row + 1, col + 1); c.value = value ?? '';
      c.font = { name: 'Arial', size: o.size || 9, bold: !!o.bold, color: { argb: o.color || ink(o.fill || BOX) }, underline: o.link ? true : undefined };
      c.alignment = { vertical: 'middle', horizontal: o.left ? 'left' : 'center', wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: o.fill || BOX } };
      if (o.border !== false) c.border = border;
      return c;
    };
    const span = (row, c1, c2, value, o) => { if (c2 > c1) ws.mergeCells(row + 1, c1 + 1, row + 1, c2 + 1); const c = cell(row, c1, value, o); for (let k = c1 + 1; k <= c2; k++) { ws.getCell(row + 1, k + 1).border = border; ws.getCell(row + 1, k + 1).fill = c.fill; } return c; };
    const height = (row, h) => { ws.getRow(row + 1).height = h; };
    const link = (url, text) => (url && /^https?:/.test(url) ? { text: text || url, hyperlink: url } : (text || url || ''));
    // título e dia
    span(r, 1, N, d.title, { bold: true, size: 12 }); height(r, 22); r++;
    span(r, 1, N - 2, fmtDay(d.date), { left: true, bold: true }); span(r, N - 1, N, `DIA ${d.day || si + 1} DE ${d.days || list.length}`, { bold: true }); r += 2;
    // contactos (esquerda) | call, morada e meteorologia (direita)
    const top = r;
    d.contacts.forEach((c, i) => { span(top + i, 1, Math.max(1, Math.floor(H / 2)), c.role, { bold: true, fill: YEL, left: true }); span(top + i, Math.floor(H / 2) + 1, H, c.value, { left: true }); });
    let rr = top;
    span(rr, H + 2, N, `CALL: ${d.call || ''} H - ${d.place || ''}`, { bold: true, size: 12, fill: YEL }); height(rr, 26); rr++;
    span(rr, H + 2, N, link(d.address, d.address ? `MORADA: ${d.address}` : 'MORADA:'), { bold: false, color: d.address && inkOn(pal.box) === '#000000' ? 'FF1155CC' : undefined, link: !!d.address }); rr += 2;
    span(rr, H + 2, N, 'METEOROLOGIA', { bold: true, fill: YEL }); rr++;
    span(rr, H + 2, N, [d.weather?.text, [d.weather?.min, d.weather?.max].filter(Boolean).join(' / ')].filter(Boolean).join(' · ')); rr++;
    r = Math.max(top + d.contacts.length, rr) + 1;
    // notas, hospital, estacionamento (esquerda) | horários (direita)
    const mid = r; let lr = mid;
    span(lr, 1, H, 'NOTAS DE PRODUÇÃO', { bold: true, fill: YEL }); lr++;
    span(lr, 1, H, d.notes || '', { bold: true }); height(lr, Math.max(18, 12 * String(d.notes || '').split('\n').length)); lr += 2;
    span(lr, 1, H, 'HOSPITAL MAIS PRÓXIMO', { bold: true, fill: GRY }); lr++;
    span(lr, 1, H, link(d.hospital?.url, [d.hospital?.name, d.hospital?.url].filter(Boolean).join(' ')), { color: d.hospital?.url && inkOn(pal.box) === '#000000' ? 'FF1155CC' : undefined }); lr += 2;
    span(lr, 1, H, 'ESTACIONAMENTO MAIS PRÓXIMO', { bold: true, fill: GRY }); lr++;
    span(lr, 1, H, link(d.parking?.url, [d.parking?.name, d.parking?.url].filter(Boolean).join(' ')), { color: d.parking?.url && inkOn(pal.box) === '#000000' ? 'FF1155CC' : undefined }); lr++;
    const tc = H + 2 + Math.floor((N - H - 2) / 2);
    d.times.forEach((t, i) => { span(mid + i, H + 2, tc, `${t.label}:`, { bold: true, fill: YEL }); span(mid + i, tc + 1, N, t.value, { bold: true }); });
    r = Math.max(lr, mid + d.times.length) + 1;
    // calls por departamento
    if (d.depts.length) {
      d.depts.slice(0, N).forEach((t, i) => { cell(r, i + 1, String(t.name || '').toUpperCase(), { bold: true, fill: YEL, size: 8 }); cell(r + 1, i + 1, t.time); });
      r += 3;
    }
    // elenco
    const castH = [d.castTitle || 'ELENCO', 'PERSONAGEM', 'CENA', 'CALL', 'SAÍDA', 'OBS.'];
    const cw = Math.max(1, Math.floor(N / 6));
    const ccol = (k) => [1 + k * cw, k === 5 ? N : k * cw + cw];
    castH.forEach((h, k) => span(r, ...ccol(k), String(h).toUpperCase(), { bold: true, fill: YEL }));
    r++;
    d.cast.forEach((c) => { ['name', 'role', 'scene', 'call', 'out', 'obs'].forEach((k, j) => span(r, ...ccol(j), c[k] || '')); r++; });
    r++;
    // planos
    // a última coluna estica até à largura toda
    const sc = (i) => [i + 1, i === d.cols.length - 1 ? N : i + 1];
    d.cols.forEach((c, i) => span(r, ...sc(i), String(c.label || '').toUpperCase(), { bold: true, fill: GRY, size: 8 }));
    height(r, 18); r++;
    d.rows.forEach((row) => {
      if (row.kind === 'band') span(r, 1, N, row.text, { bold: true, fill: row.tone === 'yellow' ? YEL : GRY, left: row.tone !== 'yellow' });
      else d.cols.forEach((c, i) => span(r, ...sc(i), row.cells?.[c.id] ?? ''));
      r++;
    });
    r++;
    span(r, 1, N, d.footer, { bold: true, fill: YEL }); height(r, 30);
    for (let y = 1; y <= r + 2; y++) for (let x = 1; x <= N + 2; x++) { const c = ws.getCell(y, x); if (!c.border && !c.isMerged) c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(pal.frame) } }; }
    height(r + 1, 10);
    ws.pageSetup.printArea = `A1:${ws.getColumn(N + 2).letter}${r + 2}`;
    ws.views = [{ showGridLines: false }];
  });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const d0 = list[0];
  a.download = `${(d0.title || 'Folha de servico').replace(/[\\/:*?"<>|]/g, '')} - FS ${list.length > 1 ? 'todos os dias' : 'D' + (d0.day || 1)}.xlsx`;
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast('Excel exportado.');
}
