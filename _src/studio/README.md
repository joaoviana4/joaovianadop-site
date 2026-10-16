# PØRTAL STUDIØ — web app

Hub de pré-produção, produção e pós-produção. Usa o projeto BlackCat no Supabase:
as mesmas contas e os mesmos projetos do Viewfinder e do Lighthouse.

## Publicar sem instalar nada
A pasta `dist` já está pronta. Arrasta-a para https://app.netlify.com/drop
(ou para o Cloudflare Pages, em "Upload assets").

## Trabalhar no código
    npm install
    npm run dev      # abre em http://localhost:5173
    npm run build    # gera a pasta dist

## Onde está cada coisa
- src/main.js      a app inteira (guião, ferramentas, ligação ao Supabase)
- src/style.css    o visual, com os tokens das brand guidelines PØRTAL
- public/          ícones, manifesto da app instalável e service worker

## Base de dados
Tabelas novas, só do hub: hub_projects (fases, grupos, guião importado) e
hub_pages (cada ferramenta: board, tabela, mapa de luz, cronograma, storyboard).
Lê também projects, scenes e photos das apps Android. Escreve em scenes e
projects só quando importas um guião num projeto que ainda não tem cenas.
