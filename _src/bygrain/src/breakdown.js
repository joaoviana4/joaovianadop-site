import { classifyLines, cueName } from './script.js';

// Análise rápida do guião, sem IA. Lê cena a cena:
//  - personagens: deixas de diálogo, apresentações na ação ("FRANCISCO (31)", "SR. MOURA (58)")
//    e menções pelo nome nas linhas de ação ("Francisco e António entram") — não conta nomes ditos em diálogo;
//  - figurantes: grupos em maiúsculas na ação ("Dois PESCADORES");
//  - figurino: roupa descrita na ação, atribuída à personagem de quem se está a falar;
//  - adereços: objetos de um vocabulário grande (com "de …": "óculos de sol de tartaruga"), objetos em maiúsculas,
//    implícitos ("fuma" → cigarro), quem lhes mexe e o quê.
//
// analyzeScenes(scenes:[{number, heading, body}], known:[nomes]) →
//   { scenes: [{ number, characters:[], extras:[], wardrobe:{NOME:[frases]}, props:[nomes] }],
//     characters: [{ name, age, desc, scenes:[] }], extras: [{ name, scenes:[] }], props: [{ nome, tipo, categoria, cenas, personagens, interacoes }] }

const L = 'A-Za-zÀ-ÖØ-öø-ÿ';
const UP = 'A-ZÀ-ÖØ-Þ';
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();
const title = (s) => s.toLowerCase().replace(new RegExp(`(^|[\\s\\-'’.])([${L}])`, 'g'), (m, a, b) => a + b.toUpperCase());
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// palavras em maiúsculas que não são personagens nem figurantes
const NOT_NAME = new Set(['INT', 'EXT', 'FIM', 'CONTINUA', 'CONTINUADO', 'INSERT', 'INSERIR', 'SUPER', 'LEGENDA', 'TITULO', 'CORTA', 'CORTE', 'FADE', 'IN', 'OUT', 'CUT', 'OFF', 'ON', 'OK', 'OKAY', 'RUN', 'TV', 'CD', 'CDS', 'DVD', 'DT', 'LC', 'VO', 'OS', 'OC', 'POV', 'FLASHBACK', 'MONTAGEM', 'DIA', 'NOITE', 'TARDE', 'MANHA', 'MAIS', 'TARDE', 'CONT', 'CONTD', 'NAO', 'SIM', 'PARA', 'VAI', 'ATE', 'UM', 'UMA', 'O', 'A', 'E', 'DE', 'DA', 'DO', 'THE', 'END', 'SMS', 'GPS', 'USB', 'PC', 'WC', 'SOS', 'ATM', 'PS', 'EUA', 'UE', 'GNR', 'PSP', 'CEO']);
const TITLES = /^(SR|SRA|SENHOR|SENHORA|DONA|DOM|D|DR|DRA|DOUTOR|DOUTORA|PROF|PROFESSOR|PROFESSORA|PADRE|IRMA|TIA|TIO|AVO|MESTRE|INSPETOR|INSPETORA|AGENTE|CAPITAO|COMANDANTE)\.?$/;

// ---------- vocabulário ----------
// adereços por categoria (singular; os plurais e "de …" são apanhados à parte)
const PROPS = {
  'Armas': ['pistola', 'revólver', 'arma', 'espingarda', 'carabina', 'caçadeira', 'metralhadora', 'faca', 'navalha', 'canivete', 'punhal', 'espada', 'machado', 'bala', 'cartucho', 'munição', 'granada', 'taco', 'bastão'],
  'Tabaco': ['cigarro', 'charuto', 'cachimbo', 'isqueiro', 'fósforo', 'cinzeiro', 'maço', 'mortalha', 'tabaco', 'charro', 'vape'],
  'Comida e bebida': ['garrafa', 'copo', 'chávena', 'caneca', 'taça', 'prato', 'tigela', 'talher', 'garfo', 'colher', 'tacho', 'panela', 'frigideira', 'cafeteira', 'termo', 'lata', 'pão', 'bolo', 'fruta', 'maçã', 'laranja', 'sandes', 'sanduíche', 'vinho', 'cerveja', 'whisky', 'aguardente', 'bagaço', 'bagaceira', 'licor', 'café', 'galão', 'chá', 'sumo', 'água', 'leite', 'caldeirada', 'sopa', 'peixe', 'marmita', 'tabuleiro', 'jarro', 'cesto', 'caixa de fruta'],
  'Documentos e papel': ['carta', 'envelope', 'papel', 'folha', 'livro', 'caderno', 'agenda', 'diário', 'revista', 'jornal', 'fotografia', 'foto', 'postal', 'bilhete', 'mapa', 'contrato', 'documento', 'passaporte', 'cartão', 'etiqueta', 'autocolante', 'recibo', 'fatura', 'cheque', 'nota', 'dinheiro', 'moeda', 'pasta', 'dossier', 'caneta', 'lápis', 'procuração', 'testamento', 'escritura', 'poema', 'partitura', 'disco', 'capa'],
  'Tecnologia e som': ['telemóvel', 'telefone', 'computador', 'portátil', 'tablet', 'câmara', 'máquina fotográfica', 'rádio', 'televisão', 'televisor', 'gira-discos', 'leitor de cds', 'leitor', 'coluna', 'auscultadores', 'auriculares', 'microfone', 'mesa de mistura', 'cassete', 'cd', 'vinil', 'comando', 'lanterna', 'bateria', 'guitarra', 'baixo', 'piano', 'teclado', 'violino', 'acordeão', 'prato de bateria', 'cabo', 'carregador', 'relógio de parede', 'despertador', 'barómetro'],
  'Ferramentas': ['ferramenta', 'martelo', 'chave inglesa', 'chave de fendas', 'alicate', 'serrote', 'enxada', 'pá', 'ancinho', 'corda', 'fita-cola', 'pano', 'trapo', 'balde', 'vassoura', 'escada', 'jerricã', 'funil', 'mangueira', 'lona', 'rede', 'anzol', 'cana de pesca', 'remo', 'âncora', 'bóia', 'lanterna de petróleo', 'candeeiro de petróleo'],
  'Mobiliário e decoração': ['mesa', 'cadeira', 'banco', 'sofá', 'cama', 'armário', 'móvel', 'estante', 'prateleira', 'cómoda', 'secretária', 'balcão', 'espelho', 'quadro', 'moldura', 'vaso', 'planta', 'flores', 'candeeiro', 'vela', 'cortina', 'tapete', 'almofada', 'cobertor', 'manta', 'lençol', 'calendário', 'azulejo', 'relógio', 'caixa', 'mala de viagem', 'cofre', 'baú', 'gaiola', 'lava-loiça', 'frigorífico', 'fogão'],
  'Acessórios': ['óculos', 'óculos de sol', 'chapéu', 'boné', 'capacete', 'mala', 'mochila', 'carteira', 'chave', 'chaves', 'porta-chaves', 'anel', 'aliança', 'colar', 'pulseira', 'brinco', 'relógio de pulso', 'guarda-chuva', 'bengala', 'lenço', 'luvas', 'cachecol'],
  'Veículos': ['carro', 'carrinha', 'camião', 'mota', 'moto', 'motorizada', 'bicicleta', 'barco', 'autocarro', 'táxi', 'trator', 'empilhador', 'skate', 'trotinete'],
  'Brinquedos e jogos': ['brinquedo', 'boneca', 'bola', 'peluche', 'baralho', 'dado', 'carrinho', 'moto de brincar', 'puzzle', 'papagaio'],
  'Saúde e higiene': ['comprimido', 'medicamento', 'seringa', 'pente', 'escova', 'toalha', 'sabão', 'perfume', 'batom', 'maquilhagem', 'penso', 'ligadura'],
};
// roupa (vai para o figurino; os acessórios contam para os dois)
const CLOTHES = ['camisa', 'camisola', 'camisolão', 't-shirt', 'tshirt', 'polo', 'top', 'blusa', 'casaco', 'blusão', 'sobretudo', 'gabardina', 'impermeável', 'colete', 'fato', 'fato de treino', 'vestido', 'saia', 'calças', 'calções', 'jeans', 'ganga', 'macacão', 'macaco', 'fato-macaco', 'avental', 'bata', 'farda', 'uniforme', 'pijama', 'robe', 'roupão', 'cueca', 'cuecas', 'meias', 'collants', 'sapatos', 'sapato', 'sapatilhas', 'ténis', 'botas', 'bota', 'botas de borracha', 'chinelos', 'sandálias', 'chapéu', 'boné', 'gorro', 'capuz', 'cachecol', 'lenço', 'luvas', 'gravata', 'laço', 'cinto', 'óculos', 'óculos de sol', 'capacete', 'mochila', 'brincos', 'colar', 'anel', 'pulseira', 'relógio', 'camisola de lã', 'kispo', 'parka', 'xaile', 'mantilha', 'peruca', 'bigode', 'barba'];
const IMPLIED = [
  [/\b(fuma|fumam|fumar|acende um cigarro|puxa do cigarro|bafo)\b/i, [['cigarro', 'Tabaco'], ['isqueiro', 'Tabaco']]],
  [/\b(dispara|disparam|recarrega|aponta a arma)\b/i, [['arma', 'Armas']]],
  [/\b(liga para|telefona|atende o telefone|marca o número)\b/i, [['telemóvel', 'Tecnologia e som']]],
  [/\b(fotografa|tira uma fotografia)\b/i, [['câmara', 'Tecnologia e som']]],
  [/\b(brindam|brinda)\b/i, [['copo', 'Comida e bebida']]],
];
const ACTION = new RegExp(`\\b(pega|pegam|segura|seguram|agarra|agarram|abre|abrem|fecha|fecham|dá|dão|recebe|tira|tiram|pousa|pousam|examina|guarda|guardam|atira|atiram|bebe|bebem|come|comem|acende|acendem|apaga|lê|escreve|liga|desliga|entrega|mostra|passa|passam|serve|servem|enche|enchem|limpa|veste|despe|coloca|colocam|mete|metem|puxa|empurra|empurram|levanta|levantam|rasga|parte|partem|toca|tocam|usa|usam|carrega|aponta|dispara|fuma|fumam|monta|roda|vasculha|desembrulha|desdobra|dobra|admira|observa|ajusta|abana|segura-a|dá-a|dá-lhe|põe|poe|pendura)\\b`, 'i');
const SOUND = /\b(ouvimos|ouve-se|som|barulho|estrondo|ruído)\b/i;

// forma da palavra com plurais simples (ão→ões/ães/ãos, l→is, r/z→es, s)
function wordRe(w) {
  const parts = w.split(' ');
  const last = parts.pop();
  let alt = reEsc(last);
  if (/ão$/.test(last)) alt = `${reEsc(last.slice(0, -2))}(?:ão|ões|ães|ãos)`;
  else if (/l$/.test(last)) alt = `${reEsc(last.slice(0, -1))}(?:l|is)`;
  else if (/[rz]$/.test(last)) alt = `${reEsc(last)}(?:es)?`;
  else if (/m$/.test(last)) alt = `${reEsc(last.slice(0, -1))}(?:m|ns)`;
  else if (!/s$/.test(last)) alt = `${reEsc(last)}s?`;
  return [...parts.map(reEsc), alt].join('\\s+');
}
const bound = (src) => new RegExp(`(?<![${L}\\-])(${src})(?![${L}\\-])`, 'gi');
const PROP_LIST = Object.entries(PROPS).flatMap(([cat, ws]) => ws.map((w) => ({ w, cat }))).sort((a, b) => b.w.length - a.w.length);
const PROP_RE = PROP_LIST.map((x) => ({ ...x, re: bound(wordRe(x.w)) }));
const CLOTH_RE = [...CLOTHES].sort((a, b) => b.length - a.length).map((w) => ({ w, re: bound(wordRe(w)) }));
const ACCESSORY = new Set(PROPS['Acessórios'].map(norm));
const STOP_Q = /^(que|quando|onde|enquanto|mas|e|ou|porque|para|com|sem|por|ao|à|aos|às|o|a|os|as|um|uma|uns|umas|ele|ela|eles|elas|se|lhe|já|não|depois|antes|isto|isso|aquilo|este|esta|esse|essa|está|estão|tem|têm|é|são|foi|era|fica|ficam)$/i;
const DE = /^(de|do|da|dos|das|em)$/i;
const DE_CLOTH = /^(de|do|da|dos|das|em|aos|às|com)$/i;
const SENT = /(?<=[.!?])(?<!(?:^|[\s(])(?:SR|SRA|DR|DRA|D|Sr|Sra|Dr|Dra|Prof)\.)\s+/;

// alarga o nome do objeto: "garrafa" + " verde de aguardente de bagaceira" (até 5 palavras, para em vírgulas e palavras de ligação)
function grow(text, start, end, max = 5, de = DE) {
  const rest = text.slice(end);
  const toks = rest.match(new RegExp(`^(?:\\s+[${L}0-9\\-]+){0,${max + 2}}`))?.[0].trim().split(/\s+/).filter(Boolean) || [];
  const out = []; let pendingDe = null;
  for (const t of toks) {
    if (out.length >= max) break;
    if (de.test(t)) { if (pendingDe) break; pendingDe = t; continue; }
    if (STOP_Q.test(t) || ACTION.test(t)) break;
    if (/^\d/.test(t) && !pendingDe) break;
    if (pendingDe) { out.push(pendingDe); pendingDe = null; }
    else if (out.length && !/[aeo]s?$|[ao]das?$|[ao]dos?$/i.test(t) && !/^(azul|verde|cinzento|amarelo|preto|branco|vermelho|castanho|grande|pequeno|velho|nova|novo|antigo|grandes|pequenas|pequenos|velhos|velhas)$/i.test(t)) break;
    else if (!out.length && !/^(azul|azuis|verde|verdes|cinzento|cinzenta|amarelo|amarela|amarelada|amarelado|preto|preta|pretos|pretas|branco|branca|brancos|brancas|vermelho|vermelha|castanho|castanha|rosa|roxo|roxa|laranja|bege|dourado|dourada|prateado|prateada|escuro|escura|claro|clara|grande|grandes|pequeno|pequena|pequenos|pequenas|velho|velha|velhos|velhas|novo|nova|antigo|antiga|enorme|comprido|comprida|curto|curta|largo|larga|sujo|suja|suja|limpa|limpo|rasgado|rasgada|manchado|manchada|amarrotado|amarrotada|remendado|remendada|elétrico|elétrica|vazio|vazia|cheio|cheia|aberto|aberta|fechado|fechada|partido|partida|enferrujado|enferrujada|plástico|madeira|metal|ferro|vidro|cartão|couro|cabedal|lã|algodão|seda|ganga)$/i.test(t)) break;
    out.push(t);
  }
  while (out.length && de.test(out[out.length - 1])) out.pop();
  return out.length ? `${text.slice(start, end)} ${out.join(' ')}` : text.slice(start, end);
}

// ---------- personagens ----------
const INTRO = new RegExp(`(?<![${L}])((?:(?:SR|SRA|DR|DRA|D|DONA|PADRE|TIA|TIO|PROF)\\.?\\s+)?[${UP}][${UP}'’\\-]+(?:\\s+(?:DE|DA|DO|DOS|DAS|E)?\\s*[${UP}][${UP}'’\\-]+){0,3})\\s*\\(\\s*(\\d{1,3}|[^)]{1,24}anos[^)]{0,10})\\s*\\)`, 'g');
const CAPS = new RegExp(`(?<![${L}])([${UP}][${UP}'’\\-]{2,}(?:\\s+(?:DE|DA|DO)?\\s*[${UP}][${UP}'’\\-]{2,}){0,2})(?![${L}])`, 'g');
const QUANT = /(?:\b(um|uma|uns|umas|dois|duas|três|quatro|cinco|seis|vários|várias|alguns|algumas|muitos|muitas|outros|outras|os|as|dezenas de|grupo de|meia dúzia de|\d+)\s+)$/i;

function nameForms(name) {
  const toks = name.replace(/\./g, '. ').split(/\s+/).filter(Boolean);
  const forms = new Set([name]);
  const t = title(name);
  forms.add(t);
  const core = toks.filter((x) => !TITLES.test(norm(x)));
  if (core.length && core.length < toks.length) { const c = core.join(' '); forms.add(c); forms.add(title(c)); }
  // "MARIA LUÍSA" fica inteira; "JOÃO PEDRO SILVA" também aceita "João Pedro"
  if (core.length >= 3) { forms.add(title(core.slice(0, 2).join(' '))); }
  return [...forms].filter((x) => x.replace(/[^A-Za-zÀ-ÿ]/g, '').length >= 2);
}

const VERB = /^(caminha|caminham|anda|andam|corre|correm|olha|olham|observa|entra|entram|sai|saem|fuma|usa|está|estão|esta|tem|têm|vem|vêm|vai|vão|segue|espera|sorri|ri|chora|fala|grita|senta|dorme|acorda|empurra|chega|chegam|parte|aparece|surge|bebe|come|lê|escreve|trabalha|limpa|arruma|conduz|guia|toca|canta|dança|reconhece|repara|hesita|para|pára|continua|volta|atravessa|sobe|desce|ouve|vê|traz|leva|carrega|prepara|mexe|cose|pinta|joga|lava|abraça|beija|cumprimenta|recebe|fecha|abre)$/;
// descrição de apresentação: só as partes que descrevem ("mãos grossas, camisola de lã remendada"), não a ação que se segue
function descTrim(t) {
  const out = [];
  for (const part of String(t || '').split(/,\s*|\s+e\s+(?=[a-zà-ÿ]+(?:-se)?\s)/)) {
    const w = part.trim(); if (!w) continue;
    const first = w.split(/\s+/)[0].toLowerCase();
    if (/-(se|lhe|o|a|os|as)$/.test(first) || VERB.test(first) || ACTION.test(first) || new RegExp(`[${UP}]{2,}\\s*\\(`).test(w)) break;
    out.push(w);
    if (out.join(', ').length > 160) break;
  }
  return out.join(', ');
}

export function analyzeScenes(scenes, known = []) {
  const chars = new Map(); // NORM → { name, age, desc, scenes:Set }
  const addChar = (raw, scene, extra = {}) => {
    const name = raw.replace(/\s+/g, ' ').trim(); const k = norm(name);
    if (!k || k.length < 2 || (NOT_NAME.has(k) && !extra.cue && !extra.intro)) return null;
    let c = chars.get(k);
    if (!c) { c = { name: name.toUpperCase(), age: '', desc: '', scenes: new Set(), cue: false, intro: false }; chars.set(k, c); }
    if (extra.age && !c.age) c.age = extra.age;
    if (extra.desc && !c.desc) c.desc = extra.desc;
    if (extra.cue) c.cue = true;
    if (extra.intro) c.intro = true;
    if (scene) c.scenes.add(scene);
    return c;
  };
  known.forEach((n) => addChar(n, null, { cue: true }));

  // 1.ª passagem: linhas, deixas e apresentações
  const parsed = scenes.map((s) => {
    const ls = classifyLines(s.body || '');
    const action = []; let para = [];
    ls.forEach((l) => { if (l.t === 'action') para.push(l.s); else { if (para.length) { action.push(para.join(' ')); para = []; } } });
    if (para.length) action.push(para.join(' '));
    const cues = ls.filter((l) => l.t === 'char').map((l) => l.name).filter((n) => n && !/^(INT|EXT|CORTA|FADE|CUT|SUPER|TÍTULO|LEGENDA|INSERT|INSERIR|FLASHBACK|MONTAGEM|FIM)\b/.test(n));
    return { s, ls, action, cues };
  });
  parsed.forEach(({ s, action, cues }) => {
    cues.forEach((n) => addChar(n, s.number, { cue: true }));
    action.forEach((a) => {
      for (const m of a.matchAll(INTRO)) {
        const after = a.slice(m.index + m[0].length).split(SENT)[0].replace(/^[\s,;:—–-]+/, '').replace(/[.]+$/, '');
        const age = (m[2].match(/\d{1,3}/) || [m[2]])[0];
        const desc = descTrim(after);
        addChar(m[1], s.number, { age, desc, intro: true });
      }
    });
  });
  // nomes em maiúsculas que aparecem várias vezes na ação, sem idade, e que também têm deixa noutra cena já ficaram; os restantes ficam como candidatos
  const people = [...chars.values()].filter((c) => c.cue || c.intro);
  const forms = people.map((c) => ({ c, res: nameForms(c.name).map((f) => new RegExp(`(?<![${L}])${reEsc(f)}(?![${L}])`, f === f.toUpperCase() ? 'u' : 'u')) }));

  // 2.ª passagem: presença por menção na ação, figurantes, figurino, adereços
  const extras = new Map();
  const propsMap = new Map();
  const outScenes = parsed.map(({ s, action, cues }) => {
    const present = new Set(cues.map(norm).filter((k) => chars.get(k)));
    action.forEach((a) => forms.forEach(({ c, res }) => { if (res.some((r) => r.test(a))) { present.add(norm(c.name)); c.scenes.add(s.number); } }));
    // figurantes: GRUPOS em maiúsculas com quantificador antes, ou plurais em maiúsculas
    const ex = new Set();
    const caps = []; // outras palavras em maiúsculas (candidatos a adereço)
    action.forEach((a) => {
      for (const m of a.matchAll(CAPS)) {
        const w = m[1]; const k = norm(w);
        if (chars.has(k) || NOT_NAME.has(k) || [...chars.keys()].some((x) => x.split(' ').includes(k))) continue;
        if (a.slice(m.index + w.length).match(/^\s*\(/)) continue; // já tratado como apresentação
        const before = a.slice(Math.max(0, m.index - 30), m.index).split(/[.!?;:]\s/).pop();
        if (SOUND.test(before)) continue;
        if (QUANT.test(before) && /S$/.test(k) || /^(MULTIDAO|GENTE|PUBLICO|CLIENTES|POLICIAS|PESCADORES|CRIANCAS|TURISTAS|CONVIDADOS|ESTUDANTES|SOLDADOS|ENFERMEIROS|VIZINHOS)$/.test(k)) { ex.add(title(w)); continue; }
        caps.push(w);
      }
    });
    ex.forEach((n) => { const e = extras.get(n) || { name: n, scenes: [] }; if (!e.scenes.includes(s.number)) e.scenes.push(s.number); extras.set(n, e); });

    // frases da ação com o sujeito de quem se fala (para figurino e interações)
    const wardrobe = {};
    const sceneProps = new Set();
    action.forEach((a) => {
      let last = null; // última personagem nomeada
      a.split(SENT).forEach((sent) => {
        // personagens na frase, por ordem
        const hits = [];
        forms.forEach(({ c, res }) => res.forEach((r) => { const m = sent.match(r); if (m) hits.push({ c, i: m.index }); }));
        hits.sort((x, y) => x.i - y.i);
        const subjAt = (i) => { let h = null; hits.forEach((x) => { if (x.i <= i) h = x.c; }); return h || hits[0]?.c || last; };
        // roupa
        const taken = [];
        CLOTH_RE.forEach(({ re }) => {
          re.lastIndex = 0;
          for (const m of sent.matchAll(re)) {
            if (taken.some(([a0, b0]) => m.index < b0 && m.index + m[0].length > a0)) continue;
            if (/^vestid/i.test(m[0]) && (/\b(tem|está|estava|estão|vem|anda|vai|ficou|fica)\s*$/i.test(sent.slice(0, m.index)) || /^\s+(de|com|um|uma|uns|umas)\b/i.test(sent.slice(m.index + m[0].length)))) continue;
            const ph = grow(sent, m.index, m.index + m[0].length, 6, DE_CLOTH);
            taken.push([m.index, m.index + ph.length]);
            const who = subjAt(m.index); if (!who) continue;
            (wardrobe[who.name] ||= []);
            if (!wardrobe[who.name].some((x) => norm(x).includes(norm(ph)))) wardrobe[who.name].push(ph);
          }
        });
        const vest = sent.match(new RegExp(`vestid[oa]s?\\s+(de|com)\\s+([${L}\\s\\-]{3,40}?)(?=[,.;]|\\s+e\\s|$)`, 'i'));
        if (vest) { const who = subjAt(vest.index); if (who) { (wardrobe[who.name] ||= []); const ph = `vestido ${vest[1]} ${vest[2].trim()}`; if (!wardrobe[who.name].includes(ph)) wardrobe[who.name].push(ph); } }
        // adereços
        const acts = ACTION.test(sent);
        const ptaken = [];
        const addProp = (raw, cat, idx, forceType) => {
          let name = raw.toLowerCase().replace(/\s+/g, ' ').trim();
          const k = norm(name).replace(/S$/, '');
          if (!k || k.length < 2) return;
          // junta à entrada que já existe com o mesmo nome base (ex.: "caixa de charutos" e "caixa com charutos" ficam separadas, mas "copos" e "copo" juntam-se)
          let e = propsMap.get(k);
          if (!e) {
            // mesmo objeto dito de outra forma: "carrinha" ↔ "carrinha de caixa aberta", "garrafas" ↔ "garrafa de vidro"
            const head = norm(name.split(' ')[0]).replace(/(OES|AES|S)$/, '');
            const same = [...propsMap.entries()].find(([kk, x]) => norm(x.nome.split(' ')[0]).replace(/(OES|AES|S)$/, '') === head && (name.split(' ').length === 1 || x.nome.split(' ').length === 1));
            if (same) {
              e = same[1];
              if (name.split(' ').length > e.nome.split(' ').length) { propsMap.delete(same[0]); e.nome = name; propsMap.set(k, e); }
            }
          }
          if (!e) { e = { nome: name, tipo: 'cenario', categoria: cat, cenas: [], personagens: [], interacoes: [] }; propsMap.set(k, e); }
          if (!e.cenas.includes(s.number)) e.cenas.push(s.number);
          sceneProps.add(e.nome);
          const who = hits.length ? subjAt(idx) : last;
          if (forceType === 'acao' || (acts && who)) {
            e.tipo = 'acao';
            if (who && !e.personagens.includes(who.name)) e.personagens.push(who.name);
            if (who && e.interacoes.filter((x) => x.cena === s.number).length < 3) e.interacoes.push({ cena: s.number, personagem: who.name, acao: sent.length > 180 ? sent.slice(0, 177) + '…' : sent });
          }
        };
        PROP_RE.forEach(({ w, cat, re }) => {
          re.lastIndex = 0;
          for (const m of sent.matchAll(re)) {
            if (ptaken.some(([a0, b0]) => m.index < b0 && m.index + m[0].length > a0)) continue;
            if (cat === 'Acessórios' && taken.some(([a0, b0]) => m.index >= a0 && m.index < b0) && !acts) continue; // só roupa descrita
            const ph = grow(sent, m.index, m.index + m[0].length, 4);
            ptaken.push([m.index, m.index + ph.length]);
            addProp(ph, cat, m.index);
          }
        });
        IMPLIED.forEach(([re, items]) => { if (re.test(sent)) items.forEach(([n, cat]) => { const inScene = [...propsMap.values()].filter((e) => e.cenas.includes(s.number)); const dup = cat === 'Armas' ? inScene.some((e) => e.categoria === 'Armas') : n === 'isqueiro' ? inScene.some((e) => /^(ISQUEIRO|FOSFORO)/.test(norm(e.nome))) : n === 'cigarro' ? inScene.some((e) => /^(CIGARRO|CHARUTO|CACHIMBO|CHARRO)/.test(norm(e.nome))) : inScene.some((e) => norm(e.nome).startsWith(norm(n))); if (!dup) addProp(n, cat, 0, 'acao'); }); });
        caps.filter((w) => sent.includes(w)).forEach((w) => addProp(w, 'Outros', sent.indexOf(w)));
        if (hits.length) last = hits[hits.length - 1].c;
      });
    });
    return { number: s.number, characters: [...present].map((k) => chars.get(k).name), extras: [...ex], wardrobe, props: [...sceneProps] };
  });

  const characters = [...chars.values()].filter((c) => c.scenes.size).map((c) => ({ name: c.name, age: c.age, desc: c.desc, scenes: [...c.scenes] }));
      const order = new Map(scenes.map((s, i) => [String(s.number), i]));
  const byOrder = (a, b) => (order.get(String(a)) ?? 1e9) - (order.get(String(b)) ?? 1e9);
  characters.forEach((c) => c.scenes.sort(byOrder));
  characters.sort((a, b) => (order.get(String(a.scenes[0])) ?? 1e9) - (order.get(String(b.scenes[0])) ?? 1e9));
  return { scenes: outScenes, characters, extras: [...extras.values()], props: [...propsMap.values()] };
}
