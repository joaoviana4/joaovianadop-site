import { defineConfig } from 'vite';
import { resolve, join, dirname } from 'node:path';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';

// Duas apps com o mesmo código:
//   npx vite build                → byGrain Studio em joaovianadop.com/bygrain/ (pasta bygrain/ na raiz do repositório)
//   npx vite build --mode studio  → PØRTAL Studio em joaovianadop.com/studio/ (pasta studio/ na raiz do repositório)
// No modo studio o plugin abaixo troca a marca nos textos, aplica o tema claro PØRTAL (studio-theme.css)
// e gera a pasta public com os ícones e nomes do Studio. Ligações e base de dados: src/flavor.js.

// textos da marca (os mais compridos primeiro)
const TEXT = [
  ['byGrain Studio', 'PØRTAL Studio'],
  ['byGrain Tasks', 'PØRTAL Tasks'],
  ['Grain Tasks', 'PØRTAL Tasks'],
  ['Grain Studio', 'PØRTAL Studio'],
  ['byGrain Earnings', 'Earnings'],
  ['Azul Grain', 'Azul'],
  ['Espaço de trabalho da byGrain.', 'Pré-produção, produção e pós-produção, do guião à rodagem.'],
  ['As tuas tarefas na byGrain.', 'As tuas tarefas no PØRTAL Studio.'],
  ['Total com Grain fee', 'Total com agency fee'],
  ['com Grain fee', 'com agency fee'],
  ['Grain fee do orçamento', 'Agency fee do orçamento'],
  ['Grain fee', 'Agency fee'],
  ['Grain team cut', 'Team cut'],
  ['Só o kit da Grain', 'Só o kit próprio'],
  ['<span class="chip own">Grain</span>', '<span class="chip own">Kit</span>'],
  ['Equipa da Grain', 'Equipa do Studio'],
  ['membros da Grain', 'membros do Studio'],
  ['Pessoas da Grain', 'Pessoas do Studio'],
  ['>Da Grain<', '>Do Studio<'],
  ['administrador da Grain', 'administrador do Studio'],
  ['calendário da Grain', 'calendário do Studio'],
  ['fica na Grain', 'fica no Studio'],
  ['dentro da Grain', 'dentro do Studio'],
  ['da Grain', 'do Studio'],
  ['na Grain', 'no Studio'],
  ['criatividade &amp; cultura', 'do guião à rodagem'],
  ["['byGrain', { frame:", "['PØRTAL', { frame:"],
  ['class="brand">byGrain', 'class="brand">PØRTAL'],
  ["'byGrain'", "'PØRTAL'"],
  ['byGrain ${esc(sub)}', 'PØRTAL ${esc(sub)}'],
  ['/bygrain/', '/studio/'],
  ["'bygrain-v2'", "'portal-studio-v20'"],
];
const swap = (s) => TEXT.reduce((acc, [a, b]) => acc.split(a).join(b), s);

// cores do tema escuro do byGrain → tema claro PØRTAL (o resto afina-se em studio-theme.css)
// as cores fixas passam a variáveis do tema, para o Studio poder ser claro ou escuro (ver studio-theme.css)
const NV = '(?<!--[\\w-]+:\\s*)'; // não mexe nas declarações das próprias variáveis
const COLOR = [
  [/rgba\(\s*244\s*,\s*241\s*,\s*232\s*,/g, 'rgba(var(--fg-rgb),'], // creme por cima do escuro → cor do texto do tema
  [/rgba\(\s*12\s*,\s*12\s*,\s*18\s*,/g, 'rgba(var(--bg-rgb),'],
  [/rgba\(\s*(21\s*,\s*21\s*,\s*29|15\s*,\s*15\s*,\s*20)\s*,/g, 'rgba(var(--panel-rgb),'],
  [new RegExp(NV + '#1E2AD4\\b', 'gi'), 'var(--blue)'], [new RegExp(NV + '#1621A8\\b', 'gi'), 'var(--blue-d)'], [new RegExp(NV + '#2B37E8\\b', 'gi'), 'var(--blue)'], [new RegExp(NV + '#232A7A\\b', 'gi'), 'var(--blue-d)'],
  [new RegExp(NV + '#0a0a10\\b', 'gi'), 'var(--deep)'], [new RegExp(NV + '#101017\\b', 'gi'), 'var(--deep2)'], [new RegExp(NV + '#(22222c|24242D)\\b', 'gi'), 'var(--panel3)'],
];

function studioFlavor() {
  const root = __dirname;
  return {
    name: 'portal-studio-flavor',
    enforce: 'pre',
    transform(code, id) {
      if (id.includes('node_modules') || !id.startsWith(join(root, 'src'))) return null;
      if (id.endsWith('/style.css')) {
        let css = swap(code);
        for (const [re, to] of COLOR) css = css.replace(re, to);
        css += '\n' + readFileSync(join(root, 'src/studio-theme.css'), 'utf8');
        return { code: css, map: null };
      }
      if (id.endsWith('.js')) return { code: swap(code), map: null };
      return null;
    },
    transformIndexHtml(html) {
      return swap(html)
        // o Studio só usa a Archivo (e a Courier Prime no guião): não carrega as letras do byGrain
        .replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com\/css2\?family=Instrument[^"]*">/, '')
        .replace('</head>', '  <link rel="preconnect" href="https://fonts.googleapis.com">\n  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=Courier+Prime:wght@400;700&display=swap">\n  <meta name="theme-color" content="#f5f5f7">\n  <script>try{var l=JSON.parse(localStorage.getItem("portal-look")||"{}"),r=document.documentElement,d=l.theme==="dark"||(l.theme==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches);r.dataset.theme=d?"dark":"light";r.dataset.bg=l.bg||"liso";if(l.accent)r.style.setProperty("--blue",l.accent==="#1d1d1f"&&d?"#e5e5ea":l.accent)}catch(e){}</script>\n</head>')
        .replace(/<meta name="theme-color" content="#[0-9A-Fa-f]+">\s*(?=[\s\S]*<meta name="theme-color" content="#f5f5f7">)/, '');
    },
    // pasta public do Studio: a do byGrain com os textos trocados e os ícones PØRTAL
    closeBundle() {
      const out = resolve(root, '../../studio');
      const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
      for (const f of walk(join(root, 'public'))) {
        const rel = f.slice(join(root, 'public').length + 1);
        const dest = join(out, rel); mkdirSync(dirname(dest), { recursive: true });
        if (/\.(js|webmanifest|json|html)$/.test(f)) writeFileSync(dest, swap(readFileSync(f, 'utf8')).replace(/"#1E2AD4"/g, '"#f5f5f7"').replace(/\?v=2/g, ''));
        else if (rel.startsWith('icons/')) copyFileSync(join(root, '../studio/public', rel), dest);
        else copyFileSync(f, dest);
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const studio = mode === 'studio';
  return {
    base: studio ? '/studio/' : '/bygrain/',
    publicDir: studio ? false : 'public',
    plugins: studio ? [studioFlavor()] : [],
    build: {
      outDir: resolve(__dirname, studio ? '../../studio' : '../../bygrain'),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          studio: resolve(__dirname, 'index.html'),
          tasks: resolve(__dirname, 'tasks/index.html'),
        },
      },
    },
  };
});
