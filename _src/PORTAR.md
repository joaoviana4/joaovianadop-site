# byGrain e PØRTAL Studio

**Desde 16 out 2026 (tarde): códigos separados.**
- `_src/bygrain` → byGrain (joaovianadop.com/bygrain). **Parado**: a equipa da Grain já o usa; não se reconstrói nem se publica sem o João pedir.
- `_src/portal` → PØRTAL Studio (joaovianadop.com/studio). É aqui que se trabalha. Construir: `_src/portal/build.sh`.
- 17 out 2026: a pedido do João, o byGrain recebeu as notificações de atividade (tabelas `public.activity` e `public.activity_seen`, gatilhos `zz_activity` em 16 tabelas, `src/activity.js`). Os gatilhos nunca impedem guardar (apanham qualquer erro).
- Cópia de segurança do byGrain: esquema `backup_20261016` na própria base de dados do byGrain (todas as tabelas, lista de ficheiros e contas) e um ZIP descarregado pelo João.

- 19 out 2026: a pedido do João, o byGrain recebeu as alterações do Studio de 16–17 out (49 commits, sem as comunidades nem o logo da comunidade; notificações já lá estavam) e as etapas ligadas por projeto (`projects.layouts.stages`). Base de dados: colunas novas (migração `from_studio_columns`), `can_edit_project`, `create_invite_as`, `member_from_invite`, `board_visible` e regras restritivas de só leitura em `public` e no balde `files`. Os códigos dos planos antigos (3A, 3B…) não foram renumerados.

- 20 out 2026: a pedido do João, o byGrain recebeu as otimizações de velocidade do Studio: `project_boot` e `project_counts` (funções na base de dados do byGrain, esquema `public`), leituras iguais juntas, cópia das últimas respostas para quando o servidor demora (com atualização sozinha), pedidos pendurados repetidos ao fim de 2 s (fica o que chegar primeiro), as últimas respostas guardadas no separador para aparecerem logo depois de um F5, limpeza dos ouvintes ao mudar de página e recarregar sozinho quando falta código de uma versão antiga.

O resto deste ficheiro descreve como o Studio nasceu do código do byGrain (ainda válido para `_src/portal`).

## Como funciona

- Construir os dois: `_src/bygrain/build.sh`
  - `npx vite build` → `bygrain/` → joaovianadop.com/bygrain (byGrain Studio)
  - `npx vite build --mode studio` → `studio/` → joaovianadop.com/studio (PØRTAL Studio)
- As diferenças estão em três sítios:
  - `src/flavor.js`: Supabase, esquema, balde dos ficheiros, prefixo da palavra-passe, nomes das edge functions, chave VAPID, nome da marca.
  - `vite.config.js` (plugin `portal-studio-flavor`): troca os textos da marca ("byGrain Studio" → "PØRTAL Studio", "Grain fee" → "Agency fee", "da Grain" → "do Studio"…), passa as cores do tema escuro para o claro e gera a pasta public do Studio (ícones PØRTAL vêm de `_src/studio/public/icons`).
  - `src/studio-theme.css`: tema claro PØRTAL (Archivo, fundo #f5f5f7, um só azul #0071e3). Só entra no build do Studio.
- Texto novo com "Grain" no byGrain: se for para aparecer no Studio, confirma que o plugin o troca (lista `TEXT` em `vite.config.js`).
- Aparência (só no Studio): `src/appearance.js` (tema claro/escuro/sistema, cor de destaque, fundo), guardada em `localStorage` (`portal-look`) e em `studio.profiles.prefs.look`. As cores fixas do byGrain passam a variáveis do tema no build (`--fg-rgb`, `--bg-rgb`, `--panel-rgb`, `--deep`…); os valores de cada tema estão em `studio-theme.css`.
- `IS_STUDIO` (de `lib.js`/`flavor.js`) existe para os raros casos em que o comportamento tem de ser diferente. Usar o mínimo possível.

## Base de dados do Studio

- Supabase BlackCat (`cwdjpcebyhwcdwwwazev`), esquema `studio`. As tabelas, funções, regras de acesso e gatilhos são cópias das do byGrain (`public` em `ppovjdyrhdfedjcdnnol`).
- Mudança de estrutura no byGrain → repetir a mesma migração no esquema `studio` do BlackCat (trocar `public.` por `studio.`).
- O esquema `studio` está exposto na API (`alter role authenticator set pgrst.db_schemas = 'public, graphql_public, studio'`). Se alguém gravar as definições da API no painel do Supabase sem `studio` na lista, o Studio deixa de funcionar: volta a pôr `studio` em "Exposed schemas".
- Contas: as do BlackCat (as mesmas do Viewfinder e do Lighthouse), com a palavra-passe tal e qual. Conta nova no BlackCat → perfil de convidado no Studio (`studio.handle_new_user`). A conta do João é administradora.
- Ficheiros: balde `studio-files` (regras iguais às do balde `files` do byGrain).
- Edge functions: `studio-admin-users`, `studio-redeem-invite`, `studio-notify-task`. "Apagar" uma pessoa no Studio só a tira do Studio, nunca apaga a conta BlackCat.
- Avisos push: chaves VAPID próprias no Vault (`studio_vapid_private`, `studio_vapid_public`, `studio_push_hook`).
- Limpeza da reciclagem: o BlackCat não tem pg_cron; `studio.purge_trashed_projects()` existe mas não corre sozinho.

## Guião, análise e tratamento

- `scripts.kind`: `script` (guião da ficção) ou `tratamento` (PDF de documentário/dossiê, página "Tratamento"). Tudo o que lê o guião filtra `kind <> 'tratamento'`.
- Leitor por páginas: `src/scriptview.js` (PDF com pdf.js; Fountain/FDX/texto paginado como guião).
- Análise sem IA: `src/breakdown.js` (personagens por deixas, apresentações "NOME (31)" e nomes na ação; figurantes; figurino; adereços). A análise no Claude e a revisão estão em `src/scriptan.js`; os adereços usam a mesma base.
- Figurino por cena: `scenes.info.wardrobe = { [character_id]: { costume, notes } }` (página da cena, `src/sceneinfo.js`).
- Planos numerados `cena.plano` (1.1, 1.2…).

## Ligação ao Viewfinder e ao Lighthouse

- Cada projeto do Studio tem um projeto espelho em `public.projects` (`studio.projects.vf_project_id`), e cada cena uma cena em `public.scenes` (`studio.scenes.vf_scene_id`). Criados e atualizados por gatilhos.
- Fotografia tirada no Viewfinder → entra sozinha no plano do Studio (`shots.image_path = 'vf:<caminho>'`; o plano "1" da cena 3 é o 3.1; os planos numeram-se cena.plano (1.1, 1.2…)). O frontend lê `vf:` do balde `photos`.
- Apagar uma cena no Studio marca a cena do Viewfinder como apagada.

## Studio antigo

- O Studio de um só ficheiro (`_src/studio`, dados em `hub_projects`/`hub_pages`) fica em joaovianadop.com/studio-classico, só para consulta. Os dados antigos não foram mexidos.
- DOIS TEMPOS, Raissa e Protótipo — Corpo de Luz foram copiados para o formato novo (migração `studio_migrate_old_projects`, guião em scratchpad).

## Confidencial

- Os modelos confidenciais enviados para as folhas de serviço e transportes não existem em lado nenhum, e continua a ser assim.

## Ideias para o futuro

- Décor em 3D (Gaussian Splatting): captura com telemóvel (Scaniverse, KIRI, Polycam) ou câmara, export .ply/.spz, separador "3D" na página do décor com visualizador web (Spark / three.js), escala por referência (A4 ou fita) e medições. Começar por um visualizador de fotos 360. Atenção ao armazenamento: 20–100 MB por décor e limite de 50 MB por ficheiro no plano gratuito.

## Studio: leitores (só leitura) e Tabela Distribuição
- `project_members.can_edit` (e `invites.can_edit`, copiado ao entrar por convite pelo trigger `member_from_invite`). `studio.can_edit_project(p)` = tem acesso e (admin, admin da comunidade, criador, líder ou não está marcado como leitor).
- Políticas RESTRICTIVE "só editores …" (insert/update/delete) em todas as tabelas de projeto e no storage `studio-files`. Leitores podem atualizar as tarefas que lhes estão atribuídas.
- Frontend: `p.canEdit` (rpc), `setReadOnly` em studio.js esconde botões de criar/apagar, campos ficam readonly e `setWriteGuard` (undo.js) recusa escritas com aviso. Convites usam `create_invite_as(p_project, p_email, p_can_edit)`.
- Ferramenta `distribution` (distribution.js + countries.js): boards.data = { links, rows }.

## Grain (teste) no Studio — 17 out 2026
- Backup novo do byGrain: esquema `backup_20261017` (32 tabelas + contas + lista de ficheiros), ao lado do `backup_20261016`. O ZIP fresco (dados + 25 ficheiros) também ficou no Studio em `studio-files/_backups/bygrain-2026-10-17.zip` (só o serviço lhe acede).
- Comunidade `Grain (teste)` (`d5ce2f37-078d-4da0-aa64-0e034f977e21`, business) no Studio: cópia dos 16 projetos (9 na reciclagem, como no byGrain), Central, boards, tarefas, cenas, planos, orçamentos, finanças e ficheiros, com os mesmos ids. O João é o único membro (admin); Ruben, Tomás e Daniel ficaram como equipa sem conta e as tarefas deles sem responsável, com o nome nas notas.
- O byGrain não foi alterado (só lido pela função `backup-export`, que expira a 18 out). A função `grain-import` do BlackCat foi usada uma vez e está desligada (410).
- É uma fotografia de 17 out: o que a equipa fizer no byGrain depois disso não aparece aqui.

## 19 out — Rodagem (nos dois)
- Página `rodagem` (rodagem.js, igual nos dois): folhas de serviço só de leitura, vistos por plano em `shoot_marks` (public e studio; qualquer membro do projeto marca), resumo por dia. Aparece sozinha quando a etapa Produção está ligada (MOD_DEF.rodagem = ['prod']).
- Visão geral: bloco "Progresso" com tarefas por fazer, planos em falta e % do filme filmado.
- Etapas iniciadas não se desligam (`lockedStages` em phases.js).
- Folha de serviço aparece em Pré-produção e Produção (KIND_DEF.callsheet); na Produção abre em modo rodagem (só ler + vistos); "Editar folha de serviço" passa ao editor.
- Visão geral: barras de planos/% do filme só na Produção.
- Folhas de Anotação (`anotacao.js`, tabela annotation_sheets nos dois; fotos em <projeto>/anotacao/, qualquer membro pode carregar): carregar fotos/PDF por dia, ler com o Claude de graça (fotos descarregadas com faixa "ID nnn", pedido, colar resposta), por cena/plano com a foto ao lado, exportar Excel/CSV para a montagem, modelos para imprimir.
- Fórmulas (`formula.js`, igual nos dois): Tabelas e Orçamento aceitam =B2*C2, =SOMA(), =SE(), =PROCV()… (nomes PT e EN). Colunas A, B, C…, linhas 1, 2, 3… (no orçamento as secções contam como linha). Totais do orçamento, fee e Ganhos (folders.js) já usam os valores calculados.
- Apagar ferramenta: botão de lixo no topo da ferramenta e em Opções; aviso diz o que se perde e pede visto quando há conteúdo; confirma que apagou mesmo (RLS).
- byGrain: os 6 ganhos órfãos do Milanote ficam arquivados (fin_earnings.archived_at) e já não contam em Ganhos, Resumo nem Pessoas (o DELETE continua bloqueado; cópia em fin_earnings_backup).
- Gravações seguras (nos dois): escritas na mesma linha vão por ordem (undo.js), `saveLater` em lib.js regista as gravações com atraso e `route()` envia-as e espera antes de mudar de página; aviso ao fechar a janela; pastilha "A guardar…/Guardado". Orçamento grava uma vez de cada vez (já não dá falso "mudado noutra janela"). Board junta campos do mesmo cartão; adereços com um temporizador por campo.
- Presença: o separador mantém a identidade ao recarregar (sessionStorage) e larga a presença ao sair; já não aparece "Tu, noutra janela" depois de atualizar.
- ⋯ ao lado de cada ferramenta na barra lateral: nome/departamento e apagar.

## 19 out — Só no Studio, por portar para a Grain (pedido: "deixar a grain como está e quando tiver atualizável, atualizamos")
- Visão geral como board: `layout.js` (modo `inline`, `b.off`, `add`/`show`, guarda chaves extra), `overview.js` (barra `.ov-tools` à direita com blocos sugeridos, notas, "Orçamento ou ferramenta", Colar), `ovwidgets.js` novo (notas e ferramentas coladas em `projects.layouts.overview.extra`).
- "Copiar para a visão geral" no Orçamento e nas ferramentas (studio.js) + Ctrl+V / botão Colar na visão geral.

### Studio só: páginas limpas (quickinfo.js)
- Figurino (pessoa), Décors (clip e ficção), Atores/Personagens e Adereços: só aparece o que está preenchido; o resto são botões "+ Medidas", "+ Morada"… que abrem uma janela ao centro. Ficheiros: quickinfo.js, wardrobe.js personPage, music.js entityPage, fiction.js personagem/decor, props.js propPage, style.css (.qi-*).
- Tarefas e Notas como botões no topo das páginas (pagenotes.js; tabela studio.page_notes com RLS: as minhas + as públicas). Cenas do ator/décor só com números (clique abre a lista). Secções vazias (moodboard, mapas de luz, perto daqui, fotos, referências) saem da página e passam a ações na barra da direita (offerActions em canvas.js). Moodboard e boards colados aparecem dentro da página (boardview.js; mountBoard com embedded). Barra da direita limpa (ícone + nome). Na Grain falta criar a tabela public.page_notes.
- Mini leitor da música nos videoclipes (miniplayer.js): acompanha as páginas do projeto, com secções na barra e "Tocar esta secção".
- Orçamento: nome da tabela editável (b.tname) e mais tabelas por baixo (b.extra; contam no total, no fee, nas Finanças e no Excel). Desfazer/Refazer na barra da direita. Visão geral de projetos novos só com o bloco das tarefas. Etapa sempre escolhida (sem "Tudo").
- (Grain e Studio) Folha de serviço: a lista de pessoas dos contactos abria duas vezes e ficava uma por fechar; corrigido, com botão de fechar.
