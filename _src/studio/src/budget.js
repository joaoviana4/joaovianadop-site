/* ---------- Orçamento: uma tabela por projeto, com total e comparação com o orçamento geral ---------- */

const uidB = () => Math.random().toString(36).slice(2, 10);
export const BUDGET_TYPES = [['text', 'Texto'], ['money', 'Valor (€)'], ['number', 'Número']];

export function defaultBudget(){
  return {total:null, main:'v', cols:[{id:'d', name:'Descrição', type:'text'}, {id:'n', name:'Nome', type:'text'}, {id:'o', name:'Notas', type:'text'}, {id:'v', name:'Valor', type:'money'}],
    rows:[{id:uidB(), kind:'item', cells:{}}, {id:uidB(), kind:'item', cells:{}}, {id:uidB(), kind:'item', cells:{}}]};
}

/* modelos prontos: as mesmas quatro colunas, com secções e linhas típicas, sem valores */
const SECS = {
  fiction:[['Pré-produção', ['Guião', 'Repérage', 'Casting', 'Ensaios']], ['Equipa técnica', ['Realização', 'Produção', 'Direção de fotografia', '1.º assistente de câmara', 'Gaffer', 'Maquinista', 'Som direto', 'Direção de arte', 'Guarda-roupa', 'Caracterização', 'Anotação', 'Assistentes de produção']], ['Elenco', ['Protagonistas', 'Secundários', 'Figuração']], ['Equipamento', ['Câmara e objetivas', 'Luz', 'Maquinaria', 'Som', 'Consumíveis']], ['Arte', ['Cenografia', 'Adereços', 'Guarda-roupa', 'Caracterização']], ['Locais', ['Aluguer de locais', 'Licenças']], ['Logística', ['Transportes', 'Combustível e portagens', 'Alimentação', 'Alojamento']], ['Pós-produção', ['Montagem', 'Correção de cor', 'Som e mistura', 'Música', 'Legendas', 'VFX']], ['Outros', ['Seguros', 'Distribuição e festivais', 'Imprevistos (10 %)']]],
  music:[['Crew', ['Realização', 'Produção', 'Direção de fotografia', '1.º assistente de câmara', 'Gaffer', 'Direção de arte', 'Styling', 'Cabelos e maquilhagem', 'Assistentes de set', 'Montagem', 'Cor']], ['Gear', ['Câmara e objetivas', 'Luz', 'Maquinaria']], ['Prod costs', ['Cenografia', 'Styling', 'Catering', 'Transportes e portagens', 'Locais']], ['Outros', ['Imprevistos']]],
  ad:[['Pré-produção', ['Tratamento e pitch', 'Casting', 'Repérage']], ['Equipa', ['Realização', 'Produção', 'Direção de fotografia', 'Assistentes de câmara', 'Gaffer', 'Direção de arte', 'Styling', 'Cabelos e maquilhagem']], ['Elenco', ['Talento', 'Direitos de imagem']], ['Equipamento', ['Câmara', 'Luz', 'Maquinaria', 'Som']], ['Produção', ['Locais', 'Cenografia', 'Catering', 'Transportes']], ['Pós-produção', ['Montagem', 'Cor', 'Som', 'Grafismo', 'Versões e formatos']], ['Agência e taxas', ['Fee de produção', 'Imprevistos']]],
  doc:[['Desenvolvimento', ['Pesquisa', 'Arquivo', 'Viagens de repérage']], ['Equipa', ['Realização', 'Produção', 'Imagem', 'Som']], ['Rodagem', ['Equipamento', 'Transportes', 'Alojamento', 'Alimentação']], ['Pós-produção', ['Montagem', 'Cor', 'Som', 'Música', 'Legendas', 'Direitos de arquivo']], ['Distribuição', ['Festivais', 'Materiais de imprensa']]]
};
export const BUDGET_TEMPLATES = [['simple', 'Simples (4 colunas)'], ['fiction', 'Ficção (curta ou longa)'], ['music', 'Videoclipe'], ['ad', 'Publicidade'], ['doc', 'Documentário']];
export function templateRows(key){
  if (!SECS[key]) return defaultBudget().rows;
  const rows = [];
  SECS[key].forEach(([sec, items]) => { rows.push({id:uidB(), kind:'section', title:sec}); items.forEach(it => rows.push({id:uidB(), kind:'item', cells:{d:it}})); });
  return rows;
}

/* números: aceita "1.250,50", "1250.5", "1 250 €", "70,00 €" */
export function parseMoney(v){
  if (v == null) return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let s = String(v).replace(/[€$£\s ]/g, '').replace(/eur$/i, '');
  if (!s || s === '-' || s === '—') return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s); s = s.replace(/[()]/g, '').replace(/^-/, '');
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  const n = parseFloat(s); if (!isFinite(n) || !/^\d*\.?\d*$/.test(s)) return null;
  return neg ? -n : n;
}
const fmtMoney = new Intl.NumberFormat('pt-PT', {style:'currency', currency:'EUR', minimumFractionDigits:2, maximumFractionDigits:2, useGrouping:'always'});
const fmtNum = new Intl.NumberFormat('pt-PT', {maximumFractionDigits:2, useGrouping:'always'});
export const money = n => fmtMoney.format(n || 0);
export const cellShow = (col, v) => { if (col.type === 'text') return v == null ? '' : String(v); const n = parseMoney(v); return n == null ? (v == null ? '' : String(v)) : col.type === 'money' ? fmtMoney.format(n) : fmtNum.format(n); };

export function budgetSums(b){
  const sums = {}, secSums = {}; let sec = null;
  b.cols.forEach(c => { if (c.type !== 'text') sums[c.id] = 0; });
  b.rows.forEach(r => {
    if (r.kind === 'section') { sec = r.id; secSums[sec] = {}; return; }
    b.cols.forEach(c => { if (c.type === 'text') return; const n = parseMoney((r.cells || {})[c.id]); if (n == null) return; sums[c.id] += n; if (sec) secSums[sec][c.id] = (secSums[sec][c.id] || 0) + n; });
  });
  return {sums, secSums};
}

/* ---------- importar: .xlsx, .csv ---------- */
function csvRows(text){
  const first = text.split(/\r?\n/)[0] || '', sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : first.indexOf('\t') >= 0 ? '\t' : ',';
  const out = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; continue; }
    if (ch === '"') q = true; else if (ch === sep) { row.push(cell); cell = ''; } else if (ch === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else if (ch !== '\r') cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out;
}
async function xlsxSheets(file){
  const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default || window.ExcelJS;
  const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map(ws => {
    const rows = [];
    ws.eachRow({includeEmpty:true}, (r, i) => {
      const vals = [];
      r.eachCell({includeEmpty:true}, (c, k) => {
        let v = c.value;
        if (v && typeof v === 'object') v = v.result != null ? v.result : v.richText ? v.richText.map(t => t.text).join('') : v.text != null ? v.text : v instanceof Date ? v.toISOString().slice(0, 10) : '';
        vals[k - 1] = v == null ? '' : v;
      });
      rows[i - 1] = vals;
    });
    return {name:ws.name, rows:Array.from(rows, r => r || [])};
  });
}
export async function readBudgetFile(file){
  if (/\.csv$|\.tsv$|\.txt$/i.test(file.name)) return [{name:file.name, rows:csvRows(await file.text())}];
  if (/\.xlsx$|\.xlsm$/i.test(file.name)) return xlsxSheets(file);
  const err = new Error('format'); err.code = /\.xls$|\.ods$|\.numbers$/i.test(file.name) ? 'old' : 'format'; throw err;
}
/* transforma uma folha em colunas + linhas (secções, itens), sem totais */
export function sheetToBudget(rows){
  const clean = rows.map(r => (r || []).map(v => typeof v === 'string' ? v.trim() : v));
  const width = clean.reduce((m, r) => Math.max(m, r.length), 0);
  const filled = r => r.filter(v => v !== '' && v != null).length;
  const isTextish = v => typeof v === 'string' && v !== '' && parseMoney(v) == null;
  /* cabeçalho: a primeira linha com pelo menos 2 textos e sem números */
  const BUD = /(?:max|m[áa]ximo|or[çc]amento|budget)\D{0,6}[\d.,\s]+/i;
  let hi = -1, best = 1;
  clean.slice(0, 15).forEach((r, i) => { const n = r.filter(v => isTextish(v) && !BUD.test(String(v))).length; if (n > best && !r.some(v => v !== '' && v != null && !isTextish(v))) { best = n; hi = i; } });
  const used = []; for (let c = 0; c < width; c++) if (clean.some(r => r[c] !== '' && r[c] != null)) used.push(c);
  const header = hi >= 0 ? clean[hi] : [];
  const body = clean.slice(hi + 1);
  const cols = used.map((c, i) => {
    const vals = body.map(r => r[c]).filter(v => v !== '' && v != null);
    const nums = vals.filter(v => parseMoney(v) != null).length;
    const name = String(header[c] || '').trim() || 'Coluna ' + (i + 1);
    const isNum = vals.length && nums / vals.length >= 0.6;
    return {id:'c' + i + uidB().slice(0, 4), name, type:isNum ? (/qtd|quant|qty|dias|days|horas|hours|n\.?º/i.test(name) ? 'number' : 'money') : 'text', src:c};
  });
  const firstText = cols.find(c => c.type === 'text');
  const out = [];
  if (hi > 0) { const pr = clean[hi - 1], t = pr.filter(v => isTextish(v) && !BUD.test(String(v))); if (t.length === 1 && pr.filter(v => v !== '' && v != null).length <= 2) out.push({id:uidB(), kind:'section', title:String(t[0])}); }
  body.forEach(r => {
    const n = filled(r); if (!n) return;
    const texts = cols.filter(c => c.type === 'text').map(c => r[c.src]).filter(v => v !== '' && v != null);
    const label = String(texts[0] || r.find(v => v !== '' && v != null) || '');
    if (/^(sub)?total/i.test(label)) return;
    const hasNum = cols.some(c => c.type !== 'text' && parseMoney(r[c.src]) != null);
    /* uma linha só com uma palavra (ou repetição do cabeçalho) é uma secção */
    const looksHeader = r.filter(isTextish).length >= 2 && !hasNum && cols.every(c => r[c.src] === '' || r[c.src] == null || c.type === 'text');
    if ((n === 1 && !hasNum && texts.length === 1) || (looksHeader && out.length && texts.every(t => t === String(t).toUpperCase()))) {
      if (looksHeader && n > 1) return; /* cabeçalho repetido de uma sub-tabela */
      out.push({id:uidB(), kind:'section', title:label}); return;
    }
    const cells = {}; cols.forEach(c => { const v = r[c.src]; if (v !== '' && v != null) cells[c.id] = c.type === 'text' ? String(v) : (parseMoney(v) != null ? parseMoney(v) : String(v)); });
    out.push({id:uidB(), kind:'item', cells});
  });
  /* tenta descobrir o orçamento geral ("MAX 8000", "Orçamento: 8000") */
  let total = null;
  clean.forEach(r => r.forEach(v => { const m = String(v || '').match(/(?:max|m[áa]ximo|or[çc]amento|budget)\D{0,6}([\d.,\s]+)/i); if (m && total == null) total = parseMoney(m[1]); }));
  cols.forEach(c => delete c.src);
  return {cols, rows:out, total, firstText:firstText ? firstText.id : null};
}

/* ---------- exportar para Excel ---------- */
export async function exportBudget(b, title){
  const ExcelJS = (await import('exceljs/dist/exceljs.min.js')).default || window.ExcelJS;
  const wb = new ExcelJS.Workbook(), ws = wb.addWorksheet('Orçamento');
  ws.columns = b.cols.map(c => ({header:c.name, key:c.id, width:c.type === 'text' ? 28 : 14}));
  ws.getRow(1).font = {bold:true};
  const {sums, secSums} = budgetSums(b);
  b.rows.forEach(r => {
    if (r.kind === 'section') { const row = ws.addRow({}); row.getCell(1).value = r.title; row.font = {bold:true}; b.cols.forEach((c, i) => { if (c.type !== 'text' && secSums[r.id] && secSums[r.id][c.id] != null) row.getCell(i + 1).value = secSums[r.id][c.id]; }); return; }
    const o = {}; b.cols.forEach(c => { const v = (r.cells || {})[c.id]; o[c.id] = c.type === 'text' ? (v || '') : (parseMoney(v) != null ? parseMoney(v) : v || ''); }); ws.addRow(o);
  });
  ws.addRow({});
  const tr = ws.addRow({}); tr.getCell(1).value = 'Total'; tr.font = {bold:true};
  b.cols.forEach((c, i) => { if (c.type !== 'text') tr.getCell(i + 1).value = sums[c.id]; });
  if (b.total != null) { const r2 = ws.addRow({}); r2.getCell(1).value = 'Orçamento geral'; const mi = b.cols.findIndex(c => c.id === b.main); if (mi >= 0) r2.getCell(mi + 1).value = b.total; const r3 = ws.addRow({}); r3.getCell(1).value = 'Diferença'; if (mi >= 0) r3.getCell(mi + 1).value = b.total - (sums[b.main] || 0); }
  b.cols.forEach((c, i) => { if (c.type === 'money') ws.getColumn(i + 1).numFmt = '#,##0.00 "€"'; });
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], {type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
  a.download = (title || 'Projeto').replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' - orcamento.xlsx'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
