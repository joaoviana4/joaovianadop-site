// Leitura de guiões: PDF, Fountain, Final Draft (.fdx) e texto colado.
// Devolve cenas (número, cabeçalho, INT/EXT, momento do dia, décor, personagens, texto, oitavos),
// personagens e décors pela ordem em que aparecem.

const TIMES = ['DIA', 'NOITE', 'MANHÃ', 'MANHA', 'TARDE', 'ENTARDECER', 'AMANHECER', 'MADRUGADA', 'FIM DE TARDE', 'CONTÍNUO', 'CONTINUO', 'MAIS TARDE', 'MOMENTOS DEPOIS', 'MESMO MOMENTO', 'CREPÚSCULO', 'POR DO SOL', 'PÔR DO SOL',
  'DAY', 'NIGHT', 'MORNING', 'EVENING', 'AFTERNOON', 'DAWN', 'DUSK', 'SUNSET', 'SUNRISE', 'CONTINUOUS', 'LATER', 'MOMENTS LATER', 'SAME TIME'];
const HEAD = /^(?:#?(\d+[A-Z]?)#?[.)]?\s+)?(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\/E\.?|INT\.|EXT\.|INT\s|EXT\s|EST\.|INTERIOR|EXTERIOR)\s*[.\-–—:]?\s*(.+?)(?:\s+#?(\d+[A-Z]?)#?)?$/;
const CUE_STRIP = /\s*\((?:CONT['’]?D|CONT\.?|CONTINUA(?:ÇÃO|DO)?|V\.?\s?O\.?|O\.?\s?S\.?|O\.?\s?C\.?|OFF|OVER|V\.?\s?O\.?\s?\/\s?O\.?\s?S\.?|PELO TELEFONE|AO TELEFONE|FILTERED|PRE-LAP|SUBTITLED)\)\s*/gi;
const TRANS = /(?:TO:|PARA:|^FADE|^CORTA|^CUT|^DISSOLVE|^FUNDIDO|^FIM\.?$|^THE END|^FADE OUT|^CONTINUA\.?$)/;
const isUpper = (s) => /[A-ZÀ-Ý]/.test(s) && s === s.toUpperCase();

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
  const text = String(raw || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/ /g, ' ');
  const lines = text.split('\n');
  const scenes = [];
  const charOrder = [];
  const locOrder = [];
  let cur = null;
  let n = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const forced = /^\.[^.]/.test(line);
    const m = !forced && isUpper(line) ? line.match(HEAD) : null;
    if (m || forced) {
      n += 1;
      let number, ie, rest;
      if (forced) { number = String(n); ie = ''; rest = line.slice(1); const mm = rest.match(/#(\d+[A-Z]?)#\s*$/); if (mm) { number = mm[1]; rest = rest.replace(/#.*#\s*$/, ''); } }
      else { number = m[1] || m[4] || String(n); ie = normIntExt(m[2]); rest = m[3]; }
      const { location, time } = splitHeading(rest);
      cur = { number, heading: line.replace(/^\.\s*/, '').replace(/#\d+[A-Z]?#/g, '').trim(), int_ext: ie, time_of_day: time, location, characters: [], lines: [] };
      scenes.push(cur);
      if (location && !locOrder.includes(location.toUpperCase())) locOrder.push(location.toUpperCase());
      continue;
    }
    if (!cur) continue;
    cur.lines.push(lines[i].replace(/\s+$/, ''));
    // deixa de fora deixas, transições e notas
    const prevBlank = i === 0 || !lines[i - 1].trim();
    const next = (lines[i + 1] || '').trim();
    const isCue = line && prevBlank && next && isUpper(line.replace(CUE_STRIP, '').replace(/\(.*?\)/g, '')) && line.length <= 45
      && !TRANS.test(line) && !/[.!?]$/.test(line.replace(CUE_STRIP, '')) && !line.startsWith('!') && !/^\d+\.?$/.test(line);
    if (isCue) {
      const name = line.replace(/^@/, '').replace(/\^$/, '').replace(CUE_STRIP, ' ').replace(/\(.*?\)/g, '').replace(/[:\s]+$/, '').trim();
      if (name && name.length >= 2 && !/^(INT|EXT|CORTA|FADE|CUT|SUPER|TÍTULO|LEGENDA|INSERT|INSERIR|FLASHBACK|MONTAGEM|FIM)\b/.test(name)) {
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

// PDF: junta os pedaços de texto por linha (posição vertical) e marca linhas em branco pelos saltos.
export async function pdfToText(file) {
  const pdfjs = await import('pdfjs-dist');
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const pdf = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let pn = 1; pn <= pdf.numPages; pn++) {
    const page = await pdf.getPage(pn);
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
      out.push(line); prevY = y;
    });
    out.push('');
  }
  return out.join('\n');
}

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
