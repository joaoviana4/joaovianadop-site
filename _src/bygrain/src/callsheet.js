import { sb, esc, toast, modal, confirmBox, ICON } from './lib.js';

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
    title: (p.name || '').toUpperCase(), date: '', day: n, days: '', accent: '#C8382D',
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
  return `<div class="cs-frame" style="--acc:${esc(d.accent || '#C8382D')}"><div class="cs">
    <div class="cs-title">${f('title', 'NOME DO PROJETO', 'b')}</div>
    <div class="cs-day"><span>${edit ? `<input type="date" class="cs-in" data-p="date" value="${esc(d.date || '')}">` : esc(fmtDay(d.date))}</span><span class="b">DIA ${f('day', '1', 'cs-num')} DE ${f('days', '3', 'cs-num')}</span></div>
    <div class="cs-top">
      <table class="cs-box cs-contacts">${d.contacts.map((c, i) => `<tr><th>${f(`contacts.${i}.role`, 'Função')}</th><td>${f(`contacts.${i}.value`, 'Nome - telefone')}${x(`data-rm="contacts:${c.id}"`)}</td></tr>`).join('')}${edit ? `<tr><td colspan="2">${add('data-addc', 'contacto')}</td></tr>` : ''}</table>
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

export function callsheetTool(main, p, tool) {
  let d = tool.data && tool.data.rows ? tool.data : newCallsheet(p);
  const save = debounce(async () => { const { error } = await sb.from('boards').update({ data: d, updated_at: new Date().toISOString() }).eq('id', tool.id); if (error) toast('Não foi possível guardar: ' + error.message); else tool.data = d; });
  const draw = () => {
    main.innerHTML = `<div class="row between wrap-gap cs-bar">
        <div class="row wrap-gap"><label class="cs-acc" title="Cor da moldura"><input type="color" data-acc value="${esc(d.accent || '#C8382D')}"><span>Cor</span></label>
          <button type="button" class="btn ghost" data-import>${ICON.open} Importar do Excel</button>
          <button type="button" class="btn ghost" data-dup>${ICON.copy} Duplicar para outro dia</button></div>
        <button type="button" class="btn primary" data-pdf>${ICON.open} Exportar PDF</button></div>
      <div class="cs-wrap">${sheetHtml(d, true)}</div>`;
    const auto = (t) => { if (t.tagName === 'TEXTAREA') { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; } };
    main.querySelectorAll('.cs textarea').forEach(auto);
    main.querySelectorAll('[data-p]').forEach((el) => el.addEventListener('input', () => { set(d, el.dataset.p, el.value); auto(el); save(); }));
    main.querySelector('[data-acc]').addEventListener('input', (e) => { d.accent = e.target.value; main.querySelector('.cs-frame').style.setProperty('--acc', d.accent); save(); });
    const on = (sel, fn) => main.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => { fn(b); save(); draw(); }));
    on('[data-addc]', () => d.contacts.push({ id: uid(), role: '', value: '' }));
    on('[data-addt]', () => d.times.push({ id: uid(), label: '', value: '' }));
    on('[data-addd]', () => d.depts.push({ id: uid(), name: '', time: '' }));
    on('[data-addcast]', () => d.cast.push({ id: uid(), name: '', role: '', scene: '', call: '', out: '', obs: '' }));
    on('[data-addrow]', () => d.rows.push({ id: uid(), kind: 'shot', cells: {} }));
    on('[data-addband]', () => d.rows.push({ id: uid(), kind: 'band', text: '', tone: 'grey' }));
    on('[data-addcol]', () => d.cols.push({ id: uid(), label: 'Nova' }));
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
    main.querySelector('[data-pick]').addEventListener('click', () => pickShots(p, d, () => { save(); draw(); }));
    main.querySelector('[data-pdf]').addEventListener('click', () => printSheet(d));
    main.querySelector('[data-import]').addEventListener('click', () => importXlsx(d, (nd) => { d = nd; save(); draw(); }));
    main.querySelector('[data-dup]').addEventListener('click', async () => {
      const copy = JSON.parse(JSON.stringify(d)); copy.day = String((Number(d.day) || 0) + 1); copy.date = ''; copy.rows = copy.rows.filter((r) => r.kind === 'band'); copy.cast = [];
      const { data: row, error } = await sb.from('boards').insert({ project_id: p.id, kind: 'callsheet', title: `Folha de serviço — Dia ${copy.day}`, group_id: tool.group_id, position: 999, data: copy }).select().single();
      if (error) return toast(error.message);
      toast('Folha do dia seguinte criada (mesmos contactos e locais, sem planos).');
      location.hash = location.hash.replace(/\/f\/[^/]+$/, `/f/${row.id}`);
    });
  };
  draw();
}

// escolher os planos do dia: vêm com a secção/cena, descrição, câmara, técnica; o décor e o elenco preenchem-se
async function pickShots(p, d, after) {
  const [{ data: shots }, { data: scenes }, { data: locs }, { data: chars }] = await Promise.all([
    sb.from('shots').select('*').eq('project_id', p.id).order('position'),
    sb.from('scenes').select('id, number, heading, int_ext, time_of_day, location_id, location_ids, character_ids, extra_ids, position').eq('project_id', p.id).order('position'),
    sb.from('locations').select('id, name, info').eq('project_id', p.id),
    sb.from('characters').select('id, name, actor, info').eq('project_id', p.id),
  ]);
  const used = new Set(d.rows.map((r) => r.shot_id).filter(Boolean));
  const groups = [...(scenes || []).map((s) => ({ s, list: (shots || []).filter((x) => x.scene_id === s.id) })), { s: null, list: (shots || []).filter((x) => !x.scene_id) }].filter((g) => g.list.length);
  if (!groups.length) return toast('Ainda não há planos no projeto. Junta-os na shotlist ou no storyboard.');
  const m = modal(`<h2>Planos deste dia</h2><p class="muted small">Escolhe os planos. Entram pela ordem da lista, com a ${p._hasScript ? 'cena' : 'secção'}, a descrição e a técnica; o décor e o elenco preenchem-se sozinhos.</p>
    <div class="cs-pick">${groups.map(({ s, list }) => `<fieldset><legend><label><input type="checkbox" data-all> ${esc(s ? s.heading || 'Sem nome' : 'Sem secção')}</label></legend>${list.map((x) => `<label class="cs-pi"><input type="checkbox" value="${x.id}" ${used.has(x.id) ? 'disabled checked' : ''}><span>${esc(x.code ? x.code + ' · ' : '')}${esc(x.description || 'Plano sem descrição')}</span>${used.has(x.id) ? '<small class="muted">já na folha</small>' : ''}</label>`).join('')}</fieldset>`).join('')}</div>
    <div class="row end"><button type="button" class="btn ghost" data-close>Cancelar</button><button type="button" class="btn primary" data-ok>Juntar à folha</button></div>`, { wide: true });
  m.el.querySelectorAll('[data-all]').forEach((a) => a.addEventListener('change', () => a.closest('fieldset').querySelectorAll('input[value]:not(:disabled)').forEach((c) => (c.checked = a.checked))));
  m.el.querySelector('[data-ok]').addEventListener('click', () => {
    const ids = [...m.el.querySelectorAll('input[value]:checked:not(:disabled)')].map((c) => c.value);
    if (!ids.length) return m.close();
    const chosen = (shots || []).filter((x) => ids.includes(x.id));
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
      d.rows.push({ id: uid(), kind: 'shot', shot_id: x.id, cells });
    });
    // décor e elenco do dia
    const secs = (scenes || []).filter((s) => secIds.has(s.id));
    const locIds = [...new Set(secs.flatMap((s) => [s.location_id, ...(s.location_ids || [])]).filter(Boolean))];
    const loc = (locs || []).find((l) => l.id === locIds[0]);
    if (loc && !d.place) d.place = loc.name;
    if (loc && !d.address && loc.info?.address) d.address = loc.info.address;
    const castIds = [...new Set(secs.flatMap((s) => [...(s.character_ids || []), ...(s.extra_ids || [])]))];
    castIds.forEach((cid) => {
      const c = (chars || []).find((y) => y.id === cid); if (!c || d.cast.some((y) => y.char_id === cid)) return;
      const scs = secs.filter((s) => [...(s.character_ids || []), ...(s.extra_ids || [])].includes(cid)).map((s) => (p._hasScript ? s.number : s.heading)).join(', ');
      d.cast.push({ id: uid(), char_id: cid, name: c.actor || c.name, role: c.info?.extra ? 'Figurante' : c.actor ? c.name : (c.info?.role || ''), scene: scs, call: d.call || '', out: '', obs: '' });
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

function printSheet(d) {
  const css = [...document.styleSheets].map((s) => { try { return [...s.cssRules].map((r) => r.cssText).filter((t) => t.includes('.cs')).join('\n'); } catch { return ''; } }).join('\n');
  const html = `<!doctype html><html lang="pt"><head><meta charset="utf-8"><title>${esc(d.title)} — Folha de serviço dia ${esc(d.day)}</title><style>
    @page { size: A4 portrait; margin: 8mm; } * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { margin: 0; font: 9px/1.3 Arial, Helvetica, sans-serif; color: #000; } ${css}
    .cs-frame { padding: 16px !important; } a { color: #1155cc; }
  </style></head><body>${sheetHtml(d, false)}</body></html>`;
  const fr = document.createElement('iframe'); fr.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  document.body.append(fr); const doc = fr.contentWindow.document; doc.open(); doc.write(html); doc.close();
  setTimeout(() => { fr.contentWindow.focus(); fr.contentWindow.print(); setTimeout(() => fr.remove(), 60000); }, 300);
}
