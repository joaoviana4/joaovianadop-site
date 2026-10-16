# byGrain e PØRTAL Studio: um só código

Desde 16 out 2026 o PØRTAL Studio é construído a partir do código do byGrain (`_src/bygrain`). Já não há nada para "portar" à mão: muda-se no byGrain e o Studio fica igual ao reconstruir.

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

## Ligação ao Viewfinder e ao Lighthouse

- Cada projeto do Studio tem um projeto espelho em `public.projects` (`studio.projects.vf_project_id`), e cada cena uma cena em `public.scenes` (`studio.scenes.vf_scene_id`). Criados e atualizados por gatilhos.
- Fotografia tirada no Viewfinder → entra sozinha no plano do Studio (`shots.image_path = 'vf:<caminho>'`; o plano "1" da cena 3 é o 3A). O frontend lê `vf:` do balde `photos`.
- Apagar uma cena no Studio marca a cena do Viewfinder como apagada.

## Studio antigo

- O Studio de um só ficheiro (`_src/studio`, dados em `hub_projects`/`hub_pages`) fica em joaovianadop.com/studio-classico, só para consulta. Os dados antigos não foram mexidos.
- DOIS TEMPOS, Raissa e Protótipo — Corpo de Luz foram copiados para o formato novo (migração `studio_migrate_old_projects`, guião em scratchpad).

## Confidencial

- Os modelos confidenciais enviados para as folhas de serviço e transportes não existem em lado nenhum, e continua a ser assim.
