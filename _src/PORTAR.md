# byGrain → Studio: alterações para portar

O byGrain (`_src/bygrain`) é o protótipo e o caso de estudo do Studio. O que for genérico (útil a qualquer produtora ou realizador) passa para o Studio. O que é específico da Grain fica só no byGrain.

## Regras

- Bases de dados separadas: o byGrain usa o Supabase `ppovjdyrhdfedjcdnnol` e o Studio usa o seu. Passa o código e a **estrutura** das tabelas (migrações reescritas para o Studio), **nunca dados**.
- Não passa nada que seja específico da Grain:
  - Central de Produção;
  - finanças da Grain e dados do Milanote;
  - Grain fee e agency fee;
  - ligação dos orçamentos aos ganhos.
- Os modelos confidenciais enviados para as folhas de serviço e transportes não existem em lado nenhum, e continua a ser assim.
- O código-fonte do Studio está em `_src/studio` (desde 16 out 2026).
- **Arquitetura diferente.** O Studio não é uma cópia do byGrain:
  - é uma app num só ficheiro (`src/main.js`), que desenha a página a partir de um estado;
  - guarda as ferramentas como JSON em `hub_pages` e `hub_projects`, no Supabase BlackCat (`cwdjpcebyhwcdwwwazev`), partilhado com o Viewfinder e o Lighthouse;
  - segue a marca PØRTAL (Archivo, um só azul, "tu", sem pontos de exclamação);
  - funciona com um projeto de cada vez e, por agora, um só utilizador.
- Portar é **reimplementar no estilo do Studio**, não copiar ficheiros. Não se mexe em tabelas que o Viewfinder e o Lighthouse usam sem confirmar primeiro.
- Cada linha tem um estado:
  - ☐ = por portar;
  - ◐ = em curso;
  - ☑ = portado, e só se marca quando a pessoa confirmar que está bem.

## A portar (genérico)

### Boards
- ☐ **Desfazer / refazer** (Ctrl+Z, Ctrl+Shift+Z, Ctrl+Y) e botões ↶ ↷ junto ao zoom.
  - Ficheiros: `board.js` (pilha de desfazer, `mark`, `applyOp`, ficheiros apagados recuperáveis) e `studio.js` (barra de zoom).
- ☐ **Formatação de texto**: letra (Google Fonts grátis), tamanho, negrito, itálico, sublinhado, cor e alinhamento, numa barra vertical ao lado das ferramentas.
  - Ficheiros: `board.js` (`FONTS`, `cleanHtml`, `fmtStyle`, `.fmt-bar`) e `style.css`.
- ☐ **Arrastar ferramentas da barra para o board**: clicar continua a juntar no centro.
  - Ficheiros: `board.js` (`dropAt`, `worldAt`) e `studio.js` (arrastar com ponteiro e fantasma `.tool-ghost`).
- ☐ **Notas e listas escuras por defeito**, em vez de creme.
  - Ficheiros: `board.js` (classe `dflt`) e `style.css`.
- ☐ **Logótipo do board só branco**, sem fundo azul (`.pv-mark`).

### Mapas de luz e equipamento
- ☐ **Mapa de luz em ecrã inteiro** (como os boards), com:
  - ferramentas à direita (câmaras, luzes, modificadores, tripés);
  - opção "só a lista de equipamento" ou "lista + catálogo geral";
  - feixes calculados (temperatura de cor, gelatinas, ND, difusão);
  - consumo elétrico;
  - exportar PNG e PDF.
  - Ficheiros: `lightmap.js`, `lmdata.js` e `studio.js` (`lightmapView`).
- ☐ **Mover só pela cabeça**: o alcance (feixe, ângulo da câmara, raios) não é clicável.
  - Ficheiros: `lightmap.js` (`pointer-events="none"` e zona de toque à volta da cabeça).
- ☐ **Equipamento do projeto**, na página Imagem. É a lista que alimenta o mapa de luz.
  - Ficheiros: `gear.js` (`gearPage`, `addGearModal`, `editGearModal`).
  - Tabela: `gear`.
- ☐ **Base de dados de equipamento partilhada**, com menu "Equipamento": câmaras, luzes, tripés e suportes, objetivas, modificadores e outros. Tem filtros, kit próprio, preço por dia e "+ Projeto".
  - Ficheiros: `gearcat.js` (lista inicial com cerca de 280 peças), `gearbase.js` e `gear.js` (`CATALOG`, `loadCatalog`, `toCatalog`).
  - Tabela: `gear_catalog`.
  - No Studio, trocar "kit da Grain" por "kit próprio".
- ☐ **Ferramentas presas ao departamento**: mapas de luz e equipamento só em Imagem; adereços só em Arte, com uma página por projeto.
  - Ficheiros: `studio.js` (`FIXED_DEPTS`, `deptOf`, `ensureDept`).

### Produção
- ☐ **Folha de serviço com vários dias**, navegação entre dias, vista de estúdio e vista clássica só para exportar.
  - Exportar em PDF e Excel com cores à escolha e modelos genéricos.
  - Escolher planos em grelha (storyboard) ou lista, com a numeração da shotlist.
  - Ficheiros: `callsheet.js` e `csmodels.js`.
  - Os modelos são genéricos: nada dos documentos confidenciais.
- ☐ **Mapa de transportes**, com:
  - dias, secções, viagens e passageiros;
  - "trazer elenco da folha de serviço";
  - resumo por condutor;
  - exportar PDF e Excel.
  - Ficheiro: `transport.js`.

### Projetos
- ☐ **Projetos-pasta (álbum)** com projetos dentro, cada um com o seu orçamento a contar para o orçamento geral.
  - Os valores dos projetos dentro não se somam duas vezes nos totais.
  - Mudar o nome e apagar projetos dentro da pasta.
  - Ficheiros: `folders.js`, `studio.js` e `budget.js` (`_extra`).
  - Base de dados: `projects.parent_id`, e `trash_project` passa a apagar também os projetos de dentro.
- ☐ **Tirar um projeto só da minha lista** (como no Milanote), com o separador "Escondidos". Apagar para todos fica só para administradores.
  - Ficheiros: `lib.js` (`loadHidden`, `hideProject`, `unhideProject`), `studio.js` e `folders.js`.
  - Tabela: `project_hidden`.
- ☐ **Líder e encarregue de cada projeto**: no topo do projeto, nos detalhes, na lista de projetos e em "Atribuídos a mim".
  - Base de dados: `projects.lead_id` e `projects.manager_id`.
  - No Studio não há Central, por isso a coluna vai para a lista de projetos.
- ☐ **Equipa do projeto por departamento**, com função, pessoas sem conta e "Juntar a [departamento]".
  - Ficheiros: `studio.js` (`crewPanel`).
  - Base de dados: `project_members.depts` e `job`, e a tabela `project_crew`.
- ☐ **Nome do orçamento editável**: o título e o nome do valor geral.
  - Ficheiro: `budget.js` (`b.title`, `b.capName`).
- ☐ **Resumo do orçamento arrumado**: totais com discriminação e barra por baixo.
  - Ficheiros: `budget.js` (`summary`) e `style.css`.
  - Não inclui a linha da Grain fee.

### App de tarefas (telemóvel)
- ☐ **Avisos no telemóvel (web push)** quando te atribuem uma tarefa ou uma questão por decidir.
  - Ficheiros: `public/sw.js` (push e notificationclick), `lib.js` (`enablePush`, `disablePush`, `pushState`) e `tasks-app.js`.
  - Base de dados: `push_subscriptions`, `push_config()`, gatilhos em `tasks` e `project_questions`, e `pg_net`.
  - Edge function: `notify-task`.
  - No Studio é preciso gerar chaves VAPID próprias e guardá-las no Vault do Supabase do Studio.
- ☐ **Questões por decidir na app**, na secção "Para decidir", para marcar como decidida.
  - Ficheiro: `tasks-app.js`.
- ☐ **Ícones da app**: no Studio, com o logótipo do Studio, não o da Grain.

### Geral
- ☐ **Aviso de nova versão**, quando a página aberta está desatualizada (`lib.js` `watchVersion`).
- ☐ **Velocidade**:
  - páginas pesadas carregadas só quando abertas (`lazy` em `studio.js`, mais `lmdata.js` e `propstatus.js`);
  - projeto carregado de uma vez (`loadProject`);
  - lista de pessoas guardada 2 minutos (`loadPeople`);
  - `autoModules` no máximo de 3 em 3 minutos;
  - na base de dados: índices nas chaves estrangeiras e regras de acesso com `(select auth.uid())` e `(select is_staff())`.
- ☐ **Correção ao criar projetos**: a regra de leitura de `projects` não pode usar `can_access_project(id)`, porque falha no INSERT … RETURNING.

## Não passa (específico da Grain)

- Central de Produção: visão geral, finanças, tarefas internas e reciclagem da Central.
- Finanças da Grain: Resumo, Ganhos (byGrain Earnings), Pessoas, Movimentos, Contas, Custos fixos e dados do Milanote.
- Grain fee e agency fee nos orçamentos.
- Orçamento aprovado ligado aos ganhos (o gatilho `sync_budget_earning`).
- Projetos e dados de demonstração da Grain (Maré Alta, da.selva, Gato…).
