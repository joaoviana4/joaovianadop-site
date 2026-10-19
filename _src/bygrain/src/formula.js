// Fórmulas como no Excel, para as Tabelas e o Orçamento.
// Uma célula que começa por "=" é uma fórmula: =B2*C2, =SOMA(D1:D20), =SE(E3>100;"caro";"ok"), =PROCV(A2;F1:G9;2;FALSO).
// Colunas A, B, C… pela ordem da tabela; linhas 1, 2, 3… a contar da primeira linha de dados.
// Aceita os nomes das funções em português e em inglês, e ";" ou "," entre argumentos.

const ERR = (e) => ({ e });
const isErr = (v) => v && typeof v === 'object' && 'e' in v;
export const isFormula = (v) => typeof v === 'string' && /^\s*=./.test(v);
export function colName(i) { let s = ''; i += 1; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }
const colIndex = (s) => s.toUpperCase().split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

// número a partir de texto ("1.234,50 €", "12,5", "1234.5", "30%")
export function toNum(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  let s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return Math.round((Date.parse(s + 'T00:00:00Z') - Date.UTC(1899, 11, 30)) / 86400000);
  const pct = /%$/.test(s); s = s.replace(/[€$£\s %]/g, '').replace(/eur$/i, '');
  if (!s || s === '-') return null;
  if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  else if (/^-?[\d.]+,\d+$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^-?[\d,]+\.\d+$/.test(s)) s = s.replace(/,/g, '');
  else s = s.replace(',', '.');
  if (!/^-?(\d+\.?\d*|\.\d+)(e-?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return isFinite(n) ? (pct ? n / 100 : n) : null;
}

// ---------- leitura da fórmula ----------
function tokenize(src) {
  const semi = src.includes(';');
  const out = []; let i = 0;
  const re = {
    ws: /^\s+/, str: /^"((?:[^"]|"")*)"/,
    ref: /^(\$?[A-Za-z]{1,3}\$?\d+)(?::(\$?[A-Za-z]{1,3}\$?\d+))?(?![A-Za-z0-9_(.])/,
    colr: /^(\$?[A-Za-z]{1,3}):(\$?[A-Za-z]{1,3})(?![A-Za-z0-9_(])/,
    num: semi ? /^(\d+(?:[.,]\d+)?|[.,]\d+)(?:[eE][-+]?\d+)?/ : /^(\d+(?:\.\d+)?|\.\d+)(?:[eE][-+]?\d+)?/,
    name: /^[A-Za-zÀ-ÿ_][A-Za-zÀ-ÿ0-9_.]*/,
    op: /^(<=|>=|<>|[-+*/^&=<>%(),;:])/,
  };
  while (i < src.length) {
    const s = src.slice(i); let m;
    if ((m = s.match(re.ws))) { i += m[0].length; continue; }
    if ((m = s.match(re.str))) { out.push({ t: 'str', v: m[1].replace(/""/g, '"') }); i += m[0].length; continue; }
    if ((m = s.match(re.ref))) { out.push({ t: 'ref', a: m[1], b: m[2] }); i += m[0].length; continue; }
    if ((m = s.match(re.colr))) { out.push({ t: 'col', a: m[1], b: m[2] }); i += m[0].length; continue; }
    if ((m = s.match(re.num))) { out.push({ t: 'num', v: Number(m[0].replace(',', '.')) }); i += m[0].length; continue; }
    if ((m = s.match(re.name))) { out.push({ t: 'name', v: m[0].toUpperCase() }); i += m[0].length; continue; }
    if ((m = s.match(re.op))) { const v = m[0]; out.push(v === ';' || (v === ',' && !semi) ? { t: 'sep' } : { t: 'op', v }); i += v.length; continue; }
    throw new Error('#NOME?');
  }
  return out;
}
function parse(src) {
  const tk = tokenize(src); let p = 0;
  const peek = () => tk[p], next = () => tk[p++];
  const isOp = (v) => peek()?.t === 'op' && peek().v === v;
  const bin = (sub, ops) => () => { let l = sub(); while (peek()?.t === 'op' && ops.includes(peek().v)) { const o = next().v; l = { k: 'bin', o, l, r: sub() }; } return l; };
  const primary = () => {
    const t = next(); if (!t) throw new Error('#VALOR!');
    if (t.t === 'num') return { k: 'v', v: t.v };
    if (t.t === 'str') return { k: 'v', v: t.v };
    if (t.t === 'ref') return t.b ? { k: 'rng', a: t.a, b: t.b } : { k: 'ref', a: t.a };
    if (t.t === 'col') return { k: 'rng', a: t.a + '1', b: t.b + '100000', col: true };
    if (t.t === 'op' && t.v === '(') { const e = expr(); if (!isOp(')')) throw new Error('#VALOR!'); next(); return e; }
    if (t.t === 'name') {
      if (isOp('(')) {
        next(); const args = [];
        if (!isOp(')')) { for (;;) { if (peek()?.t === 'sep' || isOp(')')) args.push({ k: 'v', v: null }); else args.push(expr()); if (peek()?.t === 'sep') { next(); continue; } break; } }
        if (!isOp(')')) throw new Error('#VALOR!'); next();
        return { k: 'fn', n: t.v, args };
      }
      if (['VERDADEIRO', 'TRUE'].includes(t.v)) return { k: 'v', v: true };
      if (['FALSO', 'FALSE'].includes(t.v)) return { k: 'v', v: false };
      throw new Error('#NOME?');
    }
    throw new Error('#VALOR!');
  };
  const postfix = () => { let e = primary(); while (isOp('%')) { next(); e = { k: 'pct', e }; } return e; };
  const unary = () => { if (isOp('-')) { next(); return { k: 'neg', e: unary() }; } if (isOp('+')) { next(); return unary(); } return postfix(); };
  const power = bin(unary, ['^']);
  const term = bin(power, ['*', '/']);
  const add = bin(term, ['+', '-']);
  const cat = bin(add, ['&']);
  const cmp = bin(cat, ['=', '<>', '<', '>', '<=', '>=']);
  const expr = cmp;
  const e = expr(); if (p < tk.length) throw new Error('#VALOR!');
  return e;
}
const cache = new Map();
const parsed = (src) => { if (!cache.has(src)) { try { cache.set(src, parse(src)); } catch (e) { cache.set(src, { k: 'err', e: e.message.startsWith('#') ? e.message : '#VALOR!' }); } if (cache.size > 2000) cache.delete(cache.keys().next().value); } return cache.get(src); };

// ---------- funções ----------
const flat = (args) => args.flatMap((a) => (Array.isArray(a) ? a.flat() : [a]));
const nums = (args) => flat(args).filter((v) => typeof v === 'number');
const N = (v) => { if (isErr(v)) return v; if (v == null || v === '') return 0; if (typeof v === 'boolean') return v ? 1 : 0; const n = toNum(v); return n == null ? ERR('#VALOR!') : n; };
const S = (v) => (v == null ? '' : typeof v === 'boolean' ? (v ? 'VERDADEIRO' : 'FALSO') : typeof v === 'number' ? String(+v.toFixed(10)).replace('.', ',') : String(v));
const B = (v) => (typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : typeof v === 'string' ? ['VERDADEIRO', 'TRUE'].includes(v.toUpperCase()) || (toNum(v) ?? 0) !== 0 : false);
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
function crit(c) {
  if (typeof c === 'number') return (v) => (typeof v === 'number' ? v : toNum(v)) === c;
  const s = String(c ?? ''); const m = s.match(/^(<=|>=|<>|<|>|=)?(.*)$/); const op = m[1] || '=', rhs = m[2];
  const rn = toNum(rhs);
  if (rn != null && op !== '=' && op !== '<>') return (v) => { const n = typeof v === 'number' ? v : toNum(v); return n != null && ({ '<': n < rn, '>': n > rn, '<=': n <= rn, '>=': n >= rn })[op]; };
  const wild = /[*?]/.test(rhs) ? new RegExp('^' + norm(rhs).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$') : null;
  const eq = (v) => (rn != null && (typeof v === 'number' || toNum(v) != null) ? (typeof v === 'number' ? v : toNum(v)) === rn : wild ? wild.test(norm(v)) : norm(v) === norm(rhs));
  return op === '<>' ? (v) => !eq(v) : eq;
}
const rows2 = (a) => (Array.isArray(a) ? a : [[a]]);
const round = (n, d, mode) => { const f = 10 ** d; const x = n * f; const r = mode === 'up' ? Math.sign(x) * Math.ceil(Math.abs(x) - 1e-9) : mode === 'down' ? Math.sign(x) * Math.floor(Math.abs(x) + 1e-9) : Math.sign(x) * Math.round(Math.abs(x) + 1e-9); return r / f; };
const iso = (v) => { const n = typeof v === 'number' ? v : toNum(v); if (n == null) return null; return new Date(Date.UTC(1899, 11, 30) + n * 86400000); };
const serial = (d) => Math.round((d.getTime() - Date.UTC(1899, 11, 30)) / 86400000);
const today = () => { const t = new Date(); return serial(new Date(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()))); };
const FN = {
  SOMA: (a) => nums(a).reduce((s, x) => s + x, 0),
  MÉDIA: (a) => { const n = nums(a); return n.length ? n.reduce((s, x) => s + x, 0) / n.length : ERR('#DIV/0!'); },
  MÍNIMO: (a) => { const n = nums(a); return n.length ? Math.min(...n) : 0; },
  MÁXIMO: (a) => { const n = nums(a); return n.length ? Math.max(...n) : 0; },
  CONTAR: (a) => nums(a).length,
  'CONTAR.VAL': (a) => flat(a).filter((v) => v != null && v !== '').length,
  'CONTAR.VAZIO': (a) => flat(a).filter((v) => v == null || v === '').length,
  PRODUTO: (a) => nums(a).reduce((s, x) => s * x, 1),
  SOMARPRODUTO: (a) => { const L = a.map((x) => flat([x])); return L[0].reduce((s, _, i) => s + L.reduce((p, l) => p * (typeof l[i] === 'number' ? l[i] : 0), 1), 0); },
  SE: (a) => (B(a[0]) ? (a.length > 1 ? a[1] : true) : (a.length > 2 ? a[2] : false)),
  'SE.ERRO': (a) => (isErr(a[0]) ? a[1] : a[0]),
  E: (a) => flat(a).every(B), OU: (a) => flat(a).some(B), NÃO: (a) => !B(a[0]),
  ARRED: (a) => round(N(a[0]), N(a[1] ?? 0)), 'ARRED.PARA.CIMA': (a) => round(N(a[0]), N(a[1] ?? 0), 'up'), 'ARRED.PARA.BAIXO': (a) => round(N(a[0]), N(a[1] ?? 0), 'down'),
  INT: (a) => Math.floor(N(a[0])), ABS: (a) => Math.abs(N(a[0])), RAIZQ: (a) => (N(a[0]) < 0 ? ERR('#NÚM!') : Math.sqrt(N(a[0]))),
  POTÊNCIA: (a) => N(a[0]) ** N(a[1]), RESTO: (a) => (N(a[1]) === 0 ? ERR('#DIV/0!') : ((N(a[0]) % N(a[1])) + N(a[1])) % N(a[1])), PI: () => Math.PI,
  'SOMA.SE': (a) => { const r = flat([a[0]]), s = a.length > 2 ? flat([a[2]]) : r, f = crit(a[1]); return r.reduce((t, v, i) => t + (f(v) && typeof s[i] === 'number' ? s[i] : 0), 0); },
  'CONTAR.SE': (a) => { const f = crit(a[1]); return flat([a[0]]).filter(f).length; },
  'MÉDIA.SE': (a) => { const r = flat([a[0]]), s = a.length > 2 ? flat([a[2]]) : r, f = crit(a[1]); const v = r.map((x, i) => (f(x) && typeof s[i] === 'number' ? s[i] : null)).filter((x) => x != null); return v.length ? v.reduce((t, x) => t + x, 0) / v.length : ERR('#DIV/0!'); },
  'SOMA.SE.S': (a) => { const s = flat([a[0]]); const cs = []; for (let i = 1; i + 1 < a.length; i += 2) cs.push([flat([a[i]]), crit(a[i + 1])]); return s.reduce((t, v, i) => t + (cs.every(([r, f]) => f(r[i])) && typeof v === 'number' ? v : 0), 0); },
  'CONTAR.SE.S': (a) => { const cs = []; for (let i = 0; i + 1 < a.length; i += 2) cs.push([flat([a[i]]), crit(a[i + 1])]); return cs.length ? cs[0][0].filter((_, i) => cs.every(([r, f]) => f(r[i]))).length : 0; },
  PROCV: (a) => { const t = rows2(a[1]), col = N(a[2]) - 1, exact = a.length > 3 && !B(a[3]); if (col < 0 || col >= (t[0]?.length || 0)) return ERR('#REF!');
    if (exact) { const f = crit(typeof a[0] === 'number' ? a[0] : '=' + S(a[0])); const r = t.find((row) => f(row[0])); return r ? r[col] : ERR('#N/D'); }
    let best = null; const k = typeof a[0] === 'number' ? a[0] : toNum(a[0]); t.forEach((row) => { const v = typeof row[0] === 'number' ? row[0] : toNum(row[0]); if (k != null && v != null && v <= k) best = row; });
    if (k == null) { const r = t.find((row) => norm(row[0]) === norm(a[0])); return r ? r[col] : ERR('#N/D'); }
    return best ? best[col] : ERR('#N/D'); },
  PROCH: (a) => { const t = rows2(a[1]); const tr = t[0].map((_, i) => t.map((r) => r[i])); return FN.PROCV([a[0], tr, a[2], a[3] ?? true]); },
  ÍNDICE: (a) => { const t = rows2(a[0]); let r = N(a[1] ?? 1), c = N(a[2] ?? 1); if (t.length === 1 && a.length === 2) { c = r; r = 1; } const v = t[r - 1]?.[c - 1]; return v === undefined ? ERR('#REF!') : v; },
  CORRESP: (a) => { const l = flat([a[1]]); const f = crit(typeof a[0] === 'number' ? a[0] : '=' + S(a[0])); const i = l.findIndex(f); return i < 0 ? ERR('#N/D') : i + 1; },
  CONCATENAR: (a) => flat(a).map(S).join(''),
  MAIÚSCULAS: (a) => S(a[0]).toUpperCase(), MINÚSCULAS: (a) => S(a[0]).toLowerCase(), ARRUMAR: (a) => S(a[0]).trim().replace(/\s+/g, ' '),
  ESQUERDA: (a) => S(a[0]).slice(0, a.length > 1 ? N(a[1]) : 1), DIREITA: (a) => { const s = S(a[0]), n = a.length > 1 ? N(a[1]) : 1; return n ? s.slice(-n) : ''; },
  'NÚM.CARACT': (a) => S(a[0]).length,
  TEXTO: (a) => { const n = N(a[0]); if (isErr(n)) return n; const f = S(a[1]); const d = (f.split(/[.,]/)[1] || '').replace(/[^0#]/g, '').length; return new Intl.NumberFormat('pt-PT', { minimumFractionDigits: d, maximumFractionDigits: d }).format(f.includes('%') ? n * 100 : n) + (f.includes('%') ? '%' : f.includes('€') ? ' €' : ''); },
  HOJE: () => today(), AGORA: () => today(),
  DATA: (a) => serial(new Date(Date.UTC(N(a[0]), N(a[1]) - 1, N(a[2])))),
  DIAS: (a) => N(a[0]) - N(a[1]),
  ANO: (a) => iso(a[0])?.getUTCFullYear() ?? ERR('#VALOR!'), MÊS: (a) => (iso(a[0]) ? iso(a[0]).getUTCMonth() + 1 : ERR('#VALOR!')), DIA: (a) => iso(a[0])?.getUTCDate() ?? ERR('#VALOR!'),
};
const ALIAS = {
  SUM: 'SOMA', AVERAGE: 'MÉDIA', MEDIA: 'MÉDIA', MIN: 'MÍNIMO', MINIMO: 'MÍNIMO', MAX: 'MÁXIMO', MAXIMO: 'MÁXIMO', COUNT: 'CONTAR', COUNTA: 'CONTAR.VAL', COUNTBLANK: 'CONTAR.VAZIO',
  PRODUCT: 'PRODUTO', SUMPRODUCT: 'SOMARPRODUTO', IF: 'SE', IFERROR: 'SE.ERRO', AND: 'E', OR: 'OU', NOT: 'NÃO', NAO: 'NÃO', ROUND: 'ARRED', ROUNDUP: 'ARRED.PARA.CIMA', ROUNDDOWN: 'ARRED.PARA.BAIXO',
  SQRT: 'RAIZQ', POWER: 'POTÊNCIA', POTENCIA: 'POTÊNCIA', MOD: 'RESTO', SUMIF: 'SOMA.SE', COUNTIF: 'CONTAR.SE', AVERAGEIF: 'MÉDIA.SE', 'MEDIA.SE': 'MÉDIA.SE', SUMIFS: 'SOMA.SE.S', COUNTIFS: 'CONTAR.SE.S',
  VLOOKUP: 'PROCV', HLOOKUP: 'PROCH', INDEX: 'ÍNDICE', INDICE: 'ÍNDICE', MATCH: 'CORRESP', CONCAT: 'CONCATENAR', CONCATENATE: 'CONCATENAR', UPPER: 'MAIÚSCULAS', MAIUSCULAS: 'MAIÚSCULAS',
  LOWER: 'MINÚSCULAS', MINUSCULAS: 'MINÚSCULAS', TRIM: 'ARRUMAR', LEFT: 'ESQUERDA', RIGHT: 'DIREITA', LEN: 'NÚM.CARACT', 'NUM.CARACT': 'NÚM.CARACT', TEXT: 'TEXTO', TODAY: 'HOJE', NOW: 'AGORA',
  DATE: 'DATA', DAYS: 'DIAS', YEAR: 'ANO', MONTH: 'MÊS', MES: 'MÊS', DAY: 'DIA', XLOOKUP: 'PROCV',
};
export const FUNCTIONS = Object.keys(FN);

// ---------- avaliação ----------
// sheet = { rows, cols, raw(r, c) } (0-based). Devolve { value(r, c), calc(src) }.
export function makeSheet({ rows, cols, raw }) {
  const memo = new Map(), busy = new Set();
  const cellRef = (a) => { const m = a.replace(/\$/g, '').match(/^([A-Za-z]+)(\d+)$/); return [Number(m[2]) - 1, colIndex(m[1])]; };
  const value = (r, c) => {
    if (r < 0 || c < 0 || r >= rows || c >= cols) return null;
    const k = r * 10000 + c;
    if (memo.has(k)) return memo.get(k);
    const v = raw(r, c);
    let out;
    if (isFormula(v)) {
      if (busy.has(k)) return ERR('#CIRC!');
      busy.add(k); out = calc(v.trim().slice(1)); busy.delete(k);
      if (Array.isArray(out)) out = out[0]?.[0] ?? null;
    } else if (v == null || v === '') out = null;
    else if (typeof v === 'number' || typeof v === 'boolean') out = v;
    else { const n = toNum(v); out = n != null && !/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? n : String(v); }
    memo.set(k, out); return out;
  };
  const ev = (n) => {
    switch (n.k) {
      case 'err': return ERR(n.e);
      case 'v': return n.v;
      case 'ref': { const [r, c] = cellRef(n.a); return value(r, c); }
      case 'rng': { let [r1, c1] = cellRef(n.a), [r2, c2] = cellRef(n.b); if (r1 > r2) [r1, r2] = [r2, r1]; if (c1 > c2) [c1, c2] = [c2, c1]; r2 = Math.min(r2, rows - 1); c2 = Math.min(c2, cols - 1); const out = []; for (let r = r1; r <= r2; r++) { const row = []; for (let c = c1; c <= c2; c++) row.push(value(r, c)); out.push(row); } return out; }
      case 'neg': { const v = N(one(ev(n.e))); return isErr(v) ? v : -v; }
      case 'pct': { const v = N(one(ev(n.e))); return isErr(v) ? v : v / 100; }
      case 'fn': {
        const name = ALIAS[n.n] || n.n; const f = FN[name]; if (!f) return ERR('#NOME?');
        if (name === 'SE') { const c = one(ev(n.args[0])); if (isErr(c)) return c; const i = B(c) ? 1 : 2; return n.args[i] ? ev(n.args[i]) : i === 1; }
        if (name === 'SE.ERRO') { const v = ev(n.args[0]); return isErr(one(v)) ? (n.args[1] ? ev(n.args[1]) : '') : v; }
        const args = n.args.map(ev);
        const keepRange = ['SOMA', 'MÉDIA', 'MÍNIMO', 'MÁXIMO', 'CONTAR', 'CONTAR.VAL', 'CONTAR.VAZIO', 'PRODUTO', 'SOMARPRODUTO', 'E', 'OU', 'SOMA.SE', 'CONTAR.SE', 'MÉDIA.SE', 'SOMA.SE.S', 'CONTAR.SE.S', 'PROCV', 'PROCH', 'ÍNDICE', 'CORRESP', 'CONCATENAR'];
        const bad = args.find((a) => isErr(a) || (Array.isArray(a) && !['SOMA.SE', 'CONTAR.SE', 'SOMA.SE.S', 'CONTAR.SE.S', 'PROCV', 'PROCH', 'ÍNDICE', 'CORRESP', 'MÉDIA.SE'].includes(name) && a.flat().some(isErr)));
        if (bad) return isErr(bad) ? bad : bad.flat().find(isErr);
        try { const r = f(keepRange.includes(name) ? args : args.map(one)); return typeof r === 'number' && !isFinite(r) ? ERR('#NÚM!') : r; } catch { return ERR('#VALOR!'); }
      }
      case 'bin': {
        const l = one(ev(n.l)), r = one(ev(n.r));
        if (isErr(l)) return l; if (isErr(r)) return r;
        if (n.o === '&') return S(l) + S(r);
        if (['=', '<>', '<', '>', '<=', '>='].includes(n.o)) {
          const a = typeof l === 'string' && toNum(l) == null ? norm(l) : l == null ? (typeof r === 'string' ? '' : 0) : typeof l === 'string' ? toNum(l) : l;
          const b = typeof r === 'string' && toNum(r) == null ? norm(r) : r == null ? (typeof l === 'string' ? '' : 0) : typeof r === 'string' ? toNum(r) : r;
          return ({ '=': a === b, '<>': a !== b, '<': a < b, '>': a > b, '<=': a <= b, '>=': a >= b })[n.o];
        }
        const x = N(l), y = N(r); if (isErr(x)) return x; if (isErr(y)) return y;
        if (n.o === '+') return x + y; if (n.o === '-') return x - y; if (n.o === '*') return x * y;
        if (n.o === '/') return y === 0 ? ERR('#DIV/0!') : x / y;
        if (n.o === '^') return x ** y;
        return ERR('#VALOR!');
      }
      default: return ERR('#VALOR!');
    }
  };
  const one = (v) => (Array.isArray(v) ? (v.length === 1 && v[0].length === 1 ? v[0][0] : v.length && v[0].length ? v[0][0] : null) : v);
  const calc = (src) => ev(parsed(src));
  return { value, calc };
}

// como mostrar o resultado
export function show(v, { money = false } = {}) {
  if (isErr(v)) return v.e;
  if (v == null) return '';
  if (typeof v === 'boolean') return v ? 'VERDADEIRO' : 'FALSO';
  if (typeof v === 'number') return money ? new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(v) : new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 6 }).format(Math.round(v * 1e9) / 1e9);
  return String(v);
}
export const isError = isErr;
export const HELP = 'Fórmulas: começa por = (ex: =B2*C2, =SOMA(D1:D20), =SE(E2>100;"caro";"ok")). Colunas A, B, C… e linhas 1, 2, 3…';

// orçamento: as secções contam como linhas (como no Excel exportado); devolve o valor de uma célula já calculado
export function budgetSheet(b) {
  const cols = b?.cols || [], rows = b?.rows || [];
  const S = makeSheet({ rows: rows.length, cols: cols.length, raw: (r, c) => { const row = rows[r]; if (!row) return null; if (row.kind === 'section') return c === 0 ? row.title : null; return row.cells?.[cols[c].id]; } });
  const ci = new Map(cols.map((c, i) => [c.id, i])), ri = new Map(rows.map((r, i) => [r.id, i]));
  const value = (row, colId) => (ri.has(row.id) && ci.has(colId) ? S.value(ri.get(row.id), ci.get(colId)) : null);
  return { value, num: (row, colId) => { const v = value(row, colId); return typeof v === 'number' ? v : null; } };
}
