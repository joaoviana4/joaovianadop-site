// Leitura de guiões: PDF, Fountain, Final Draft (.fdx) e texto colado.
// Devolve cenas (número, cabeçalho, INT/EXT, momento do dia, décor, personagens, texto, oitavos),
// personagens e décors pela ordem em que aparecem.

const TIMES = ['DIA', 'NOITE', 'MANHÃ', 'MANHA', 'TARDE', 'ENTARDECER', 'AMANHECER', 'MADRUGADA', 'FIM DE TARDE', 'CONTÍNUO', 'CONTINUO', 'MAIS TARDE', 'MOMENTOS DEPOIS', 'MESMO MOMENTO', 'CREPÚSCULO', 'POR DO SOL', 'PÔR DO SOL',
  'DAY', 'NIGHT', 'MORNING', 'EVENING', 'AFTERNOON', 'DAWN', 'DUSK', 'SUNSET', 'SUNRISE', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME TIME'];
const HEAD = /^(?:#?(\d+[A-Z]?)#?[.)]?\s+)?(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.|EXT\.|INT\s|EXT\s|EST\.|INTERIOR|EXTERIOR)\s*[.\-–—:]?\s*(.+?)(?:\s+#?(\d+[A-Z]?)#?)?$/;
const CUE_STRIP = /\s*\((?:CONT['’]?D|CONT\.?|CONTINUA(?:ÇÃO|DO)?|V\.?\s?O\.?|O\.?\s?S\.?|O\.?\s?C\.?|OFF|OVER|V\.?\s?O\.?\s?\/\s?O\.?\s?S\.?|PELO TELEFONE|AO TELEFONE|FILTERED|PRE-LAP|SUBTITLED)\)\s*/gi;
const TRANS = /(?:\s(?:TO|PARA):$|^FADE|^CORTA|^CORTE PARA|^CUT|^DISSOLVE|^FUNDIDO|^FIM\.?$|^THE END|^FADE OUT|^CONTINUA\.?$)/;
const isUpper = (s) => /[A-ZÀ-Ý]/.test(s) && s === s.toUpperCase();

// Cabeçalhos menos habituais (guiões escritos fora do Final Draft):
//  · "CENA 1:" / "Cena 12 -" / "1 CENA 1: 1" numa linha, com o "Int: Casa. Noite" na linha seguinte (ou na mesma)
//  · "Int: Restaurante. Noite", "Ext. Rua, Dia", "Int: Dia, Casa" em minúsculas, com ":" "." "," ou "-" a separar
//    e o momento do dia antes ou depois do décor
const IE_RE = /^(?:(\d+[A-Z]?)[.)]?\s+)?(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\/E|INT|EXT|INTERIOR|EXTERIOR)\b\s*[.:\-–—]\s*(.+?)(?:\s+(\d+[A-Z]?))?$/i;
const MARK_RE = /^(?:(\d+[A-Z]?)[.)]?\s+)?(?:CENA|SCENE|SC\.)\s*(?:N\.?\s*[ºo°]\s*)?(\d+[A-Z]?)\b\s*[:.\-–—)]?\s*(.*?)\s*$/i;
const plain = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim();
const isTime = (seg) => { const u = plain(seg).replace(/[()]/g, '').trim(); return !!u && TIMES.some((t) => { const tt = plain(t); return u === tt || u.startsWith(tt + ' '); }); };
const isIE = (line) => { const t = line.trim(); return t.length <= 90 && IE_RE.test(t) && !/[!?]$/.test(t); };
// separa o resto do cabeçalho em décor e momento do dia, seja qual for a ordem e o separador
function looseHeading(rest) {
  const segs = String(rest || '').replace(/[.\s]+$/, '').split(/\s*[.,;:]\s*(?=\S)|\s+[-–—]+\s+|\s*[-–—]{2,}\s*/).map((x) => x.trim()).filter(Boolean);
  const time = segs.filter(isTime).join(' - ');
  const location = segs.filter((x) => !isTime(x)).join(' - ');
  return { location, time };
}
const ieLabel = (ie) => (ie === 'INT/EXT' ? 'INT./EXT.' : ie ? `${ie}.` : '');
// procura um cabeçalho de cena na linha i (e, para "CENA 1", na linha seguinte); devolve também até onde leu
function headingAt(lines, i, n) {
  const line = lines[i].trim();
  if (!line) return null;
  if (/^\.[^.]/.test(line)) {
    let number = String(n); let rest = line.slice(1); const mm = rest.match(/#(\d+[A-Z]?)#\s*$/); if (mm) { number = mm[1]; rest = rest.replace(/#.*#\s*$/, ''); }
    const { location, time } = splitHeading(rest);
    return { number, int_ext: '', location, time, heading: line.replace(/^\.\s*/, '').replace(/#\d+[A-Z]?#/g, '').trim(), last: i };
  }
  const m = isUpper(line) ? line.match(HEAD) : null;
  if (m) { const { location, time } = splitHeading(m[3]); return { number: m[1] || m[4] || String(n), int_ext: normIntExt(m[2]), location, time, heading: line, last: i }; }
  const k = line.match(MARK_RE);
  if (k && line.length <= 120) {
    const number = k[2] || k[1] || String(n);
    let rest = k[3].replace(/^\s*\d+[A-Z]?\s*$/, '').replace(/\s+\d+[A-Z]?$/, '').trim();
    let last = i;
    // "CENA 3:" sozinho: o cabeçalho está na linha seguinte
    if (!rest) for (let j = i + 1; j < Math.min(lines.length, i + 4); j++) { const t = lines[j].trim(); if (!t) continue; if (isIE(t) || (isUpper(t) && HEAD.test(t))) { rest = t; last = j; } break; }
    const ie = rest.match(IE_RE) || (isUpper(rest) ? rest.match(HEAD) : null);
    const int_ext = ie ? normIntExt(ie[2]) : '';
    const { location, time } = looseHeading(ie ? ie[3] : rest);
    return { number, int_ext, location, time, heading: [ieLabel(int_ext), location.toUpperCase(), time ? `- ${time.toUpperCase()}` : ''].filter(Boolean).join(' ') || `CENA ${number}`, last };
  }
  if (isIE(line)) {
    const e = line.match(IE_RE); const int_ext = normIntExt(e[2]); const { location, time } = looseHeading(e[3]);
    return { number: e[1] || e[4] || String(n), int_ext, location, time, heading: [ieLabel(int_ext), location.toUpperCase(), time ? `- ${time.toUpperCase()}` : ''].filter(Boolean).join(' '), last: i };
  }
  return null;
}
// recuo de uma linha (o PDF guarda a posição: deixas ~22, diálogo ~10, parênteses ~16, ação 0)
const indentOf = (l) => (String(l).match(/^ */)[0] || '').length;
const hasIndents = (lines) => lines.filter((l) => l.trim() && indentOf(l) >= 8).length >= 3;


function splitHeading(rest) {
  let location = rest.trim().replace(/\s+/g, ' ');
  let time = '';
  const parts = location.split(/\s+[-–—]\s+|\s*[-–—]{2,}\s*/);
  if (parts.length > 1) {
    const last = parts[parts.length - 1].trim();
    if (TIMES.some((t) => last.toUpperCase().startsWith(t)) || parts.length > 1) { time = last; location = parts.slice(0, -1).join(' - ').trim(); }
  }
  location = location.replace(/[.\s]+$/, '');
  return { location, time };
}

function normIntExt(s) {
  const u = s.toUpperCase().replace(/\s/g, '');
  if (/INT.*EXT|EXT.*INT|I\/E/.test(u)) return 'INT/EXT';
  if (u.startsWith('INT')) return 'INT';
  if (u.startsWith('EXT')) return 'EXT';
  if (u.startsWith('EST')) return 'EXT';
  return '';
}

export function parseScript(raw) {
  const text = String(raw || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/ /g, ' ');
  const lines = text.split('\n');
  const scenes = [];
  const charOrder = [];
  const locOrder = [];
  const indents = hasIndents(lines);
  let cur = null;
  let n = 0;
  let inDlg = false; let cueInd = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const h = headingAt(lines, i, n + 1);
    if (h) {
      n += 1;
      cur = { number: h.number, heading: h.heading, int_ext: h.int_ext, time_of_day: h.time, location: h.location, characters: [], lines: [] };
      scenes.push(cur);
      if (h.location && !locOrder.includes(h.location.toUpperCase())) locOrder.push(h.location.toUpperCase());
      i = h.last; inDlg = false;
      continue;
    }
    if (!cur) continue;
    const ind = indentOf(lines[i]);
    // deixa de fora deixas, transições e notas
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const next = (lines[i + 1] || '').trim();
    const bare = line.replace(CUE_STRIP, '').replace(/\(.*?\)/g, '').trim();
    const nameLike = line && next && isUpper(bare) && bare.length >= 2 && line.length <= 45
      && !TRANS.test(line) && !/[.!?]$/.test(line.replace(CUE_STRIP, '')) && !line.startsWith('!') && !/^\d+\.?$/.test(line);
    // deixa: linha em branco antes, ou (num PDF) bem recuada; um nome com ":" no fim também conta
    const isCue = nameLike && (prevBlank || (indents && ind >= 14) || /:\s*(\(.*\))?$/.test(line));
    // texto arrumado: deixas e ações separadas por linha em branco (para o leitor e a análise)
    const last = cur.lines[cur.lines.length - 1];
    // (o fim do diálogo pelo recuo só conta quando a deixa também estava recuada, como num PDF)
    const backToAction = indents && inDlg && cueInd && ind < 6;
    if (line && last && last.trim() && (isCue || backToAction)) cur.lines.push('');
    if (!line) inDlg = false;
    else if (isCue) { inDlg = true; cueInd = indents && ind >= 14; }
    else if (backToAction) inDlg = false;
    cur.lines.push(indents ? line : lines[i].replace(/\s+$/, ''));
    if (isCue) {
      const name = line.replace(/^@/, '').replace(/\^$/, '').replace(CUE_STRIP, ' ').replace(/\(.*?\)/g, '').replace(/[:\s]+$/, '').trim();
      if (name && name.length >= 2 && !/^(INT|EXT|CORTA|FADE|CUT|SUPER|TÍTULO|LEGENDA|INSERT|INSERIR|FLASHBACK|MONTAGEM|FIM|CENA|SCENE|CÂMERA|CAMERA)\b/.test(name)) {
        if (!cur.characters.includes(name)) cur.characters.push(name);
        if (!charOrder.includes(name)) charOrder.push(name);
      }
    }
  }
  const LINES_PER_PAGE = 56;
  scenes.forEach((s) => {
    while (s.lines.length && !s.lines[0].trim()) s.lines.shift();
    while (s.lines.length && !s.lines[s.lines.length - 1].trim()) s.lines.pop();
    s.body = s.lines.join('\n');
    s.eighths = Math.max(1, Math.round(((s.lines.length + 2) / LINES_PER_PAGE) * 8));
    delete s.lines;
  });
  return { scenes, characters: charOrder, locations: locOrder };
}

// Final Draft: cada <Paragraph Type="..."> passa a uma linha, com linhas em branco entre parágrafos.
export function fdxToText(xml) {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const out = [];
  doc.querySelectorAll('Content > Paragraph').forEach((p) => {
    const type = p.getAttribute('Type') || '';
    const t = [...p.querySelectorAll('Text')].map((x) => x.textContent).join('').trim();
    if (!t && type !== 'Scene Heading') return;
    if (type === 'Scene Heading') {
      const num = p.getAttribute('Number');
      const head = t.toUpperCase();
      out.push('', HEAD.test(head) ? (num ? `${num} ${head}` : head) : `.${head}${num ? ` #${num}#` : ''}`, '');
    } else if (type === 'Character') out.push('', t.toUpperCase());
    else if (type === 'Dialogue' || type === 'Parenthetical') out.push(t);
    else out.push('', t, '');
  });
  return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

// Abre um PDF com o pdf.js (o mesmo para ler o texto e para mostrar as páginas no leitor do guião).
export async function openPdf(src) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument(src).promise;
  return { pdfjs, pdf };
}

// Texto de uma página: junta os pedaços de texto por linha (posição vertical) e marca linhas em branco pelos saltos.
export async function pdfPageText(page, ctx = {}) {
  const out = [];
  const tc = await page.getTextContent();
  const rows = new Map();
  tc.items.forEach((it) => {
    if (!it.str) return;
    const y = Math.round(it.transform[5] / 2) * 2;
    const x = it.transform[4];
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({ x, s: it.str, w: it.width });
  });
  const ys = [...rows.keys()].sort((a, b) => b - a);
  const gaps = []; for (let i = 1; i < ys.length; i++) gaps.push(ys[i - 1] - ys[i]);
  const lh = gaps.length ? gaps.sort((a, b) => a - b)[Math.floor(gaps.length * 0.3)] || 12 : 12;
  // margem da ação: a linha comprida mais à esquerda (as de diálogo são estreitas); serve de zero para o recuo
  const firstX = (y) => { const ps = rows.get(y).filter((p) => p.s.trim()).sort((a, b) => a.x - b.x); return ps.length ? ps[0].x : 0; };
  const longX = ys.filter((y) => rows.get(y).map((p) => p.s).join('').trim().length > 40).map((y) => {
    // ignora um número de cena solto na margem esquerda
    const ps = rows.get(y).filter((p) => p.s.trim()).sort((a, b) => a.x - b.x); return ps.length > 1 && /^\d+[A-Z]?\.?$/.test(ps[0].s.trim()) ? ps[1].x : ps[0].x;
  });
  const base = longX.length ? Math.min(...longX) : ctx.base ?? (ys.length ? Math.min(...ys.map(firstX)) : 0);
  ctx.base = base;
  let prevY = null;
  ys.forEach((y, idx) => {
    const parts = rows.get(y).sort((a, b) => a.x - b.x);
    let line = ''; let end = null;
    parts.forEach((p) => { if (end !== null && p.x - end > 2) line += ' '; line += p.s; end = p.x + p.w; });
    line = line.replace(/\s+/g, ' ').trim();
    // números de página no topo ou no fundo
    if ((idx === 0 || idx === ys.length - 1) && /^\d+\.?$/.test(line)) return;
    if (/^\(?(CONTINUED|CONTINUA|CONT['’]?D)\)?:?$/i.test(line)) return;
    if (prevY !== null && prevY - y > lh * 1.6) out.push('');
    const ind = Math.max(0, Math.round((firstX(y) - base) / 7.2));
    out.push(' '.repeat(Math.min(ind, 40)) + line); prevY = y;
  });
  out.push('');
  return out.join('\n');
}

export async function pdfToText(file) {
  const { pdf } = await openPdf({ data: await file.arrayBuffer() });
  const out = [];
  const ctx = {};
  for (let pn = 1; pn <= pdf.numPages; pn++) out.push(await pdfPageText(await pdf.getPage(pn), ctx));
  return out.join('\n');
}

// Cabeçalho de cena (INT. / EXT. em maiúsculas, ou ".CABEÇALHO" forçado do Fountain)
export const isSceneHeading = (line) => { const t = String(line || '').trim(); return /^\.[^.]/.test(t) || (isUpper(t) && HEAD.test(t)) || (t.length <= 120 && MARK_RE.test(t)) || isIE(t); };
// conta inícios de cena linha a linha (para saber em que página começa cada cena): "CENA 3" seguido de "Int: …"
// conta uma vez só. Guarda o estado entre páginas.
export function sceneCounter() {
  let pending = 0;
  return (line) => {
    const t = String(line || '').trim(); if (!t) return false;
    if (t.length <= 120 && MARK_RE.test(t)) { const k = t.match(MARK_RE); pending = k[3].replace(/^\s*\d+[A-Z]?\s*$/, '').trim() ? 0 : 3; return true; }
    if (/^\.[^.]/.test(t) || (isUpper(t) && HEAD.test(t)) || isIE(t)) { if (pending) { pending = 0; return false; } return true; }
    if (pending) pending--;
    return false;
  };
}
export { isUpper, TRANS };

export async function fileToText(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf') || file.type === 'application/pdf') return pdfToText(file);
  const txt = await file.text();
  if (name.endsWith('.fdx') || txt.trimStart().startsWith('<?xml')) return fdxToText(txt);
  return txt;
}

export function eighthsLabel(n) {
  if (!n) return '';
  const p = Math.floor(n / 8), r = n % 8;
  return [p ? String(p) : '', r ? `${r}/8` : ''].filter(Boolean).join(' ') || '0';
}

// Classifica as linhas de um guião: cabeçalho, ação, nome (deixa), parêntese, diálogo, transição.
// Devolve [{ t: 'head'|'action'|'char'|'paren'|'dlg'|'trans'|'center'|'blank', s }]
export function classifyLines(raw) {
  const lines = String(raw || '').replace(/\r\n?/g, '\n').split('\n');
  const indents = hasIndents(lines);
  const out = [];
  let inDlg = false; let cueInd = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i].trim();
    const ind = indentOf(lines[i]);
    if (!l) { inDlg = false; out.push({ t: 'blank' }); continue; }
    if (isSceneHeading(l)) { inDlg = false; out.push({ t: 'head', s: l.replace(/^\.(?!\.)/, '').replace(/#[^#]*#\s*$/, '').trim() }); continue; }
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const next = (lines[i + 1] || '').trim();
    if (/^>.*<$/.test(l)) { out.push({ t: 'center', s: l.slice(1, -1).trim() }); continue; }
    if (l.startsWith('>') || (isUpper(l) && TRANS.test(l) && prevBlank)) { inDlg = false; out.push({ t: 'trans', s: l.replace(/^>\s*/, '') }); continue; }
    const bare = l.replace(CUE_STRIP, ' ').replace(/\(.*?\)/g, '').replace(/\^$/, '').replace(/:\s*$/, '').trim();
    const nameLike = bare.length >= 2 && isUpper(bare) && l.length <= 45 && !/[.!?,;]$/.test(bare) && !/^\d+\.?$/.test(l) && !/^(INT|EXT)\b/.test(bare);
    if (next && (l.startsWith('@') || (nameLike && (prevBlank || (indents && ind >= 14) || /:\s*(\(.*\))?$/.test(l))))) { inDlg = true; cueInd = indents && ind >= 14; out.push({ t: 'char', s: l.replace(/^@/, ''), name: cueName(l) }); continue; }
    if (inDlg && cueInd && ind < 6) inDlg = false;
    if (inDlg && /^\(.*\)$/.test(l)) { out.push({ t: 'paren', s: l }); continue; }
    if (inDlg) { out.push({ t: 'dlg', s: l }); continue; }
    out.push({ t: 'action', s: l.replace(/^!/, '') });
  }
  return out;
}
export const cueName = (line) => String(line || '').replace(/^@/, '').replace(/\^$/, '').replace(CUE_STRIP, ' ').replace(/\(.*?\)/g, '').replace(/[:\s]+$/, '').replace(/\s+/g, ' ').trim();
